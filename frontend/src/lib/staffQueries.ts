import { supabase } from "./supabase";
import type {
  DiningTable,
  KitchenItem,
  QueueTicketRow,
  ServiceCallType,
  VisitLive,
} from "./types";

// คำสั่งอ่าน-เขียนฝั่งพนักงาน รวมไว้ที่เดียว
//
// RLS เป็นคนกรองว่าเห็นอะไรได้บ้าง โค้ดตรงนี้จึงไม่ต้องใส่เงื่อนไขสาขาซ้ำ
// ถ้าวันหนึ่งเปิดหลายสาขา หน้าจอจะได้ข้อมูลถูกต้องโดยไม่ต้องแก้ query เหล่านี้เลย

function unwrap<T>({ data, error }: { data: T | null; error: unknown }): T {
  if (error) {
    const message =
      typeof error === "object" && error && "message" in error
        ? String((error as { message: unknown }).message)
        : "อ่านข้อมูลไม่สำเร็จ";
    throw new Error(message);
  }
  return (data ?? []) as T;
}

/* ── อ่าน ─────────────────────────────────────────────────────────────────── */

export async function fetchActiveVisits(): Promise<VisitLive[]> {
  return unwrap(
    await supabase
      .from("v_visit_live")
      .select("*")
      .in("status", ["SEATED", "DINING", "BILL_REQUESTED", "PAID"])
      .order("seated_at"),
  );
}

export async function fetchTables(): Promise<DiningTable[]> {
  return unwrap(
    await supabase
      .from("dining_table")
      .select("table_id, table_no, seat_capacity, status, zone_id")
      .is("deleted_at", null)
      .order("table_no"),
  );
}

export async function fetchTodayQueue(): Promise<QueueTicketRow[]> {
  const today = new Date().toISOString().slice(0, 10);
  return unwrap(
    await supabase
      .from("queue_ticket")
      .select("queue_ticket_id, lane, seq_no, party_size, status, phone, created_at, public_token")
      .eq("service_date", today)
      .in("status", ["WAITING", "CALLED"])
      .order("lane")
      .order("seq_no"),
  );
}

export async function fetchOpenServiceCalls() {
  return unwrap(
    await supabase
      .from("service_call")
      .select("service_call_id, visit_id, type, status, note, created_at")
      .neq("status", "DONE")
      .is("deleted_at", null)
      .order("created_at"),
  ) as {
    service_call_id: string;
    visit_id: string;
    type: ServiceCallType;
    status: "OPEN" | "ACCEPTED";
    note: string | null;
    created_at: string;
  }[];
}

export async function fetchKitchenQueue(): Promise<KitchenItem[]> {
  return unwrap(await supabase.from("v_kitchen_queue").select("*").order("ordered_at"));
}

export async function fetchVisitDetail(visitId: string) {
  const [live, pax, addons, batches, bill, payments, calls] = await Promise.all([
    supabase.from("v_visit_live").select("*").eq("visit_id", visitId).maybeSingle(),
    supabase.from("visit_pax").select("tier, qty, unit_price").eq("visit_id", visitId),
    supabase
      .from("visit_addon")
      .select("addon_id, qty, unit_price, addon(name)")
      .eq("visit_id", visitId),
    supabase
      .from("order_batch")
      .select(
        "order_batch_id, created_at, source, order_item(order_item_id, qty, status, menu_item(name))",
      )
      .eq("visit_id", visitId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase.from("bill").select("*").eq("visit_id", visitId).is("deleted_at", null).maybeSingle(),
    supabase
      .from("payment")
      .select("payment_id, method, amount, paid_at, bill!inner(visit_id)")
      .eq("bill.visit_id", visitId)
      .is("deleted_at", null),
    supabase
      .from("service_call")
      .select("service_call_id, type, status, created_at")
      .eq("visit_id", visitId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  return {
    live: live.data as VisitLive | null,
    pax: (pax.data ?? []) as { tier: string; qty: number; unit_price: number }[],
    addons: (addons.data ?? []) as unknown as {
      addon_id: string;
      qty: number;
      unit_price: number;
      addon: { name: string } | null;
    }[],
    batches: (batches.data ?? []) as unknown as {
      order_batch_id: string;
      created_at: string;
      source: string;
      order_item: {
        order_item_id: string;
        qty: number;
        status: string;
        menu_item: { name: string } | null;
      }[];
    }[],
    bill: bill.data as
      | {
          bill_id: string;
          net_total: number;
          package_subtotal: number;
          addon_subtotal: number;
          overtime_rounds: number;
          overtime_subtotal: number;
          discount_amount: number;
        }
      | null,
    payments: (payments.data ?? []) as {
      payment_id: string;
      method: string;
      amount: number;
      paid_at: string;
    }[],
    calls: (calls.data ?? []) as {
      service_call_id: string;
      type: ServiceCallType;
      status: string;
      created_at: string;
    }[],
  };
}

/* ── เขียน ────────────────────────────────────────────────────────────────── */

function rpcError(error: unknown): never {
  const message =
    typeof error === "object" && error && "message" in error
      ? String((error as { message: unknown }).message)
      : "ทำรายการไม่สำเร็จ";
  throw new Error(message);
}

/** เรียกคิว — ฐานข้อมูลเป็นคนบังคับว่าเรียกได้สูงสุด 3 ครั้ง ห่างกัน 2 นาที (BR-09) */
export async function callQueue(queueTicketId: string, staffId: string) {
  const { error } = await supabase.rpc("fn_call_queue_ticket", {
    p_queue_ticket_id: queueTicketId,
    p_staff_id: staffId,
  });
  if (error) rpcError(error);
}

/** เช็คอิน — เปิด Visit พร้อมโต๊ะ จำนวนคนแยก tier และออก QR ในทรานแซกชันเดียว */
export async function openVisit(input: {
  queueTicketId: string | null;
  tableIds: string[];
  adult: number;
  child: number;
  toddlerFree: number;
  addonQty: number;
}): Promise<{ visit_id: string; qr_token: string }> {
  const { data, error } = await supabase.rpc("fn_open_visit", {
    p_queue_ticket_id: input.queueTicketId,
    p_table_ids: input.tableIds,
    p_adult: input.adult,
    p_child: input.child,
    p_toddler_free: input.toddlerFree,
    p_addon_qty: input.addonQty,
  });
  if (error) rpcError(error);
  const row = Array.isArray(data) ? data[0] : data;
  return row as { visit_id: string; qr_token: string };
}

export async function issueBill(visitId: string) {
  const { data, error } = await supabase.rpc("fn_issue_bill", { p_visit_id: visitId });
  if (error) rpcError(error);
  return data as { bill_id: string; net_total: number };
}

export async function closeVisit(visitId: string) {
  const { error } = await supabase.rpc("fn_close_visit", { p_visit_id: visitId });
  if (error) rpcError(error);
}

export async function voidVisit(visitId: string, reason: string) {
  const { error } = await supabase.rpc("fn_void_visit", {
    p_visit_id: visitId,
    p_reason: reason,
  });
  if (error) rpcError(error);
}

export async function addPax(
  visitId: string,
  tier: "ADULT" | "CHILD" | "TODDLER_FREE",
  qty: number,
  staffId: string,
) {
  const { error } = await supabase.rpc("fn_add_pax", {
    p_visit_id: visitId,
    p_tier: tier,
    p_qty: qty,
    p_staff_id: staffId,
  });
  if (error) rpcError(error);
}

export async function addTableToVisit(visitId: string, tableId: string) {
  const { error } = await supabase.rpc("fn_add_table_to_visit", {
    p_visit_id: visitId,
    p_table_id: tableId,
  });
  if (error) rpcError(error);
}

/** บันทึกการรับเงิน — trigger กันไม่ให้ผลรวมเกินยอดสุทธิ (BR-06) */
export async function recordPayment(input: {
  billId: string;
  method: "CASH" | "PROMPTPAY" | "TRANSFER";
  amount: number;
  staffId: string;
}) {
  const { error } = await supabase.from("payment").insert({
    bill_id: input.billId,
    method: input.method,
    amount: input.amount,
    confirmed_by: input.staffId,
    idempotency_key: crypto.randomUUID(),
  });
  if (error) rpcError(error);
}

export async function setOrderItemStatus(
  orderItemId: string,
  status: "PREPARING" | "SERVED" | "CANCELLED",
  cancelReason?: string,
) {
  const { error } = await supabase
    .from("order_item")
    .update({ status, cancel_reason: status === "CANCELLED" ? cancelReason : null })
    .eq("order_item_id", orderItemId);
  if (error) rpcError(error);
}

export async function acceptServiceCall(callId: string, staffId: string) {
  const { error } = await supabase
    .from("service_call")
    .update({ status: "ACCEPTED", accepted_by: staffId, accepted_at: new Date().toISOString() })
    .eq("service_call_id", callId);
  if (error) rpcError(error);
}

export async function finishServiceCall(callId: string) {
  const { error } = await supabase
    .from("service_call")
    .update({ status: "DONE", done_at: new Date().toISOString() })
    .eq("service_call_id", callId);
  if (error) rpcError(error);
}

/** พนักงานกดคืนโต๊ะเป็นว่างหลังเก็บเสร็จ — ปิดโต๊ะพาโต๊ะไป CLEANING ก่อนเสมอ */
export async function setTableStatus(tableId: string, status: "AVAILABLE" | "CLEANING") {
  const { error } = await supabase
    .from("dining_table")
    .update({ status })
    .eq("table_id", tableId);
  if (error) rpcError(error);
}

/* ── การจองล่วงหน้า ───────────────────────────────────────────────────────── */

export type ReservationRow = {
  reservation_id: string;
  table_id: string | null;
  reserved_for: string;
  hold_until: string;
  party_size: number;
  contact_phone: string | null;
  status: "HELD" | "SEATED" | "RELEASED";
};

/** การจองที่ยังไม่จบ เรียงตามเวลานัด — รวมของวันถัดไปด้วยเพื่อเตรียมล่วงหน้า */
export async function fetchReservations(): Promise<ReservationRow[]> {
  return unwrap(
    await supabase
      .from("reservation")
      .select("reservation_id, table_id, reserved_for, hold_until, party_size, contact_phone, status")
      .is("deleted_at", null)
      .gte("reserved_for", new Date(Date.now() - 6 * 3600_000).toISOString())
      .order("reserved_for"),
  );
}

/** กันโต๊ะไว้ให้การจอง — โต๊ะเข้าสถานะ RESERVED จนกว่าจะนั่งจริงหรือหมดเวลากัน */
export async function holdTable(reservationId: string, tableId: string) {
  const { error } = await supabase
    .from("reservation")
    .update({ table_id: tableId })
    .eq("reservation_id", reservationId);
  if (error) rpcError(error);

  const { error: tableError } = await supabase
    .from("dining_table")
    .update({ status: "RESERVED" })
    .eq("table_id", tableId);
  if (tableError) rpcError(tableError);
}

export async function releaseReservation(reservationId: string, tableId: string | null) {
  const { error } = await supabase
    .from("reservation")
    .update({ status: "RELEASED" })
    .eq("reservation_id", reservationId);
  if (error) rpcError(error);

  if (tableId) {
    await supabase.from("dining_table").update({ status: "AVAILABLE" }).eq("table_id", tableId);
  }
}

export async function markReservationSeated(reservationId: string) {
  const { error } = await supabase
    .from("reservation")
    .update({ status: "SEATED" })
    .eq("reservation_id", reservationId);
  if (error) rpcError(error);
}

/* ── รวมบิลข้ามโต๊ะ (BR-07) ───────────────────────────────────────────────── */

/** Visit อื่นที่มาจากคิวใบเดียวกัน — มีเฉพาะกลุ่มนี้เท่านั้นที่รวมบิลด้วยกันได้ */
export async function fetchMergeCandidates(queueTicketId: string, excludeVisitId: string) {
  return unwrap(
    await supabase
      .from("visit")
      .select("visit_id, status, bill_group_id, bill(net_total)")
      .eq("queue_ticket_id", queueTicketId)
      .neq("visit_id", excludeVisitId)
      .is("deleted_at", null),
  ) as unknown as {
    visit_id: string;
    status: string;
    bill_group_id: string | null;
    bill: { net_total: number } | null;
  }[];
}

export async function mergeBills(
  queueTicketId: string,
  visitIds: string[],
  staffId: string,
) {
  const { error } = await supabase.rpc("fn_merge_bills", {
    p_queue_ticket_id: queueTicketId,
    p_visit_ids: visitIds,
    p_staff_id: staffId,
  });
  if (error) rpcError(error);
}

/* ── ยืนยัน PIN ───────────────────────────────────────────────────────────── */

/**
 * ตรวจ PIN ผ่านฐานข้อมูล — hash ไม่เคยถูกส่งมาที่เบราว์เซอร์
 *
 * ล้มเหลวแบบปิดกั้นเสมอ ไม่ใช่ปล่อยผ่าน: ถ้ายังไม่ได้ push migration ที่สร้าง
 * fn_verify_pin (0017) การเรียกนี้จะ error แล้วรายการที่ต้องยืนยัน PIN จะทำไม่ได้เลย
 * ซึ่งถูกต้องแล้ว — เงื่อนไข "STAFF/SUPERVISOR + PIN" ใน §09 คือด่านที่ต้องผ่านจริง
 * ไม่ใช่ด่านที่ผ่านได้เองเมื่อฐานข้อมูลยังไม่พร้อม
 */
export async function verifyPin(pin: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("fn_verify_pin", { p_pin: pin });
  if (error) rpcError(error);
  return data === true;
}
