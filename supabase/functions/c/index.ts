// Customer Web API — เข้าถึงด้วย qr_token ในลิงก์เท่านั้น ไม่มีการล็อกอิน
// อ้างอิง: Read/System Design.md §09 (แถว /c/*), ADR-06
//
// ลูกค้าไม่ยิง PostgREST ตรง เพราะไม่มี JWT ให้ RLS เทียบตัวตน
// ทุกคำขอที่นี่จึงแปลง qr_token เป็น visit ก่อน แล้วจำกัดขอบเขตข้อมูลไว้ที่ visit นั้นเสมอ

import { Router, json, serveRouter } from "../_shared/http.ts";
import { admin, unwrap } from "../_shared/db.ts";
import { requireVisitByToken } from "../_shared/auth.ts";
import { idempotent } from "../_shared/idempotency.ts";
import { badRequest, conflict, tooManyRequests, unprocessable } from "../_shared/errors.ts";

const router = new Router();

// ── GET /c/:qrToken — ทุกอย่างที่หน้าลูกค้าต้องใช้ในคำขอเดียว ───────────────
router.get("/:qrToken", async (_req, { qrToken }) => {
  const visit = await requireVisitByToken(qrToken);

  const [menu, pax, addons, chosenAddons, orders, bill] = await Promise.all([
    admin
      .from("menu_category")
      .select("category_id, name, sort_order, menu_item(menu_item_id, name, image_path, is_available, sort_order)")
      .eq("branch_id", visit.branch_id)
      .is("deleted_at", null)
      .order("sort_order"),
    admin.from("visit_pax").select("tier, qty, unit_price").eq("visit_id", visit.visit_id),
    admin
      .from("addon")
      .select("addon_id, name, price, charge_basis")
      .eq("branch_id", visit.branch_id)
      .eq("is_active", true)
      .is("deleted_at", null),
    admin.from("visit_addon").select("addon_id, qty, unit_price").eq("visit_id", visit.visit_id),
    admin
      .from("order_batch")
      .select("order_batch_id, created_at, source, order_item(order_item_id, qty, status, served_at, menu_item(name))")
      .eq("visit_id", visit.visit_id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    admin.rpc("fn_calc_bill", { p_visit_id: visit.visit_id }),
  ]);

  const elapsed = Math.ceil((Date.now() - new Date(visit.seated_at).getTime()) / 60000);
  const remaining = Math.max(0, visit.duration_minutes - elapsed);
  const total = Array.isArray(bill.data) ? bill.data[0] : bill.data;

  return json({
    visit: {
      visit_id: visit.visit_id,
      status: visit.status,
      seated_at: visit.seated_at,
      duration_minutes: visit.duration_minutes,
      elapsed_minutes: elapsed,
      remaining_minutes: remaining,
      // เตือนล่วงหน้า 15 นาทีตาม BR-05 หน้าจอเอาไปขึ้นแถบเตือนได้เลย
      is_time_warning: remaining <= 15,
      is_overtime: elapsed > visit.duration_minutes,
    },
    // เมนูไม่มีราคา โดยเจตนา (ADR-02) — ทุกอย่างรวมในแพ็กเกจต่อหัวแล้ว
    menu: menu.data ?? [],
    pax: pax.data ?? [],
    addons_available: addons.data ?? [],
    addons_chosen: chosenAddons.data ?? [],
    orders: orders.data ?? [],
    current_total: total ?? null,
  });
});

// ── POST /c/:qrToken/orders — สั่งอาหาร สั่งได้หลายรอบ ─────────────────────
type OrderBody = { items?: { menu_item_id: string; qty: number }[] };

router.post("/:qrToken/orders", async (req, { qrToken }) => {
  const visit = await requireVisitByToken(qrToken);

  return await idempotent(req, "c/orders", async (raw) => {
    const body = raw as OrderBody;
    const items = body.items ?? [];
    if (items.length === 0) throw badRequest("ยังไม่ได้เลือกรายการอาหาร");
    if (items.some((i) => !i.menu_item_id || !Number.isInteger(i.qty) || i.qty < 1)) {
      throw badRequest("จำนวนที่สั่งต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป");
    }

    // เมนูของหมด (86 list) ต้องปฏิเสธที่นี่ ไม่ใช่แค่ซ่อนปุ่มในหน้าจอ
    const ids = [...new Set(items.map((i) => i.menu_item_id))];
    const { data: available } = await admin
      .from("menu_item")
      .select("menu_item_id, name, is_available")
      .in("menu_item_id", ids)
      .is("deleted_at", null);

    const known = new Map((available ?? []).map((m) => [m.menu_item_id, m]));
    for (const id of ids) {
      const item = known.get(id);
      if (!item) throw unprocessable("มีรายการที่ไม่มีอยู่ในเมนู");
      if (!item.is_available) throw unprocessable(`${item.name} หมดแล้ว`);
    }

    // BR-01 บังคับที่ trigger บน order_batch — ถ้าสถานะไม่ใช่ DINING/SEATED จะถูกปฏิเสธที่นี่
    const batch = unwrap(
      await admin
        .from("order_batch")
        .insert({
          visit_id: visit.visit_id,
          source: "CUSTOMER",
          idempotency_key: req.headers.get("Idempotency-Key"),
        })
        .select("order_batch_id, created_at")
        .single(),
    );

    const inserted = unwrap(
      await admin
        .from("order_item")
        .insert(items.map((i) => ({
          order_batch_id: batch.order_batch_id,
          menu_item_id: i.menu_item_id,
          qty: i.qty,
        })))
        .select("order_item_id, menu_item_id, qty, status"),
    );

    return { status: 201, body: { order_batch: batch, items: inserted } };
  });
});

// ── POST /c/:qrToken/addons — เลือกน้ำรีฟิลรายคน ───────────────────────────
type AddonBody = { addon_id?: string; qty?: number };

router.post("/:qrToken/addons", async (req, { qrToken }) => {
  const visit = await requireVisitByToken(qrToken);

  return await idempotent(req, "c/addons", async (raw) => {
    const { addon_id, qty } = raw as AddonBody;
    if (!addon_id) throw badRequest("ไม่ได้ระบุรายการเสริม");
    if (!Number.isInteger(qty) || (qty as number) < 0) {
      throw badRequest("จำนวนต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป");
    }
    if (visit.status !== "SEATED" && visit.status !== "DINING") {
      throw conflict("ขอบิลแล้ว เพิ่มรายการเสริมไม่ได้");
    }

    const addon = unwrap(
      await admin
        .from("addon")
        .select("addon_id, price, is_active")
        .eq("addon_id", addon_id)
        .eq("branch_id", visit.branch_id)
        .is("deleted_at", null)
        .single(),
    );
    if (!addon.is_active) throw unprocessable("รายการเสริมนี้ปิดอยู่");

    // เก็บเป็นจำนวน ไม่ระบุตัวบุคคล (ADR-03) และ snapshot ราคาไว้กับ Visit
    // trigger จะปฏิเสธถ้าจำนวนเกินจำนวนหัวที่จ่ายเงิน
    const row = unwrap(
      await admin
        .from("visit_addon")
        .upsert(
          { visit_id: visit.visit_id, addon_id, qty, unit_price: addon.price },
          { onConflict: "visit_id,addon_id" },
        )
        .select("visit_addon_id, addon_id, qty, unit_price")
        .single(),
    );

    return { status: 200, body: { addon: row } };
  });
});

// ── POST /c/:qrToken/service-calls — เรียกพนักงาน ──────────────────────────
type CallBody = { type?: string; note?: string };
const CALL_TYPES = ["WATER", "UTENSIL", "BILL", "OTHER"];

router.post("/:qrToken/service-calls", async (req, { qrToken }) => {
  const visit = await requireVisitByToken(qrToken);

  return await idempotent(req, "c/service-calls", async (raw) => {
    const { type, note } = raw as CallBody;
    if (!type || !CALL_TYPES.includes(type)) {
      throw badRequest("ชนิดการเรียกไม่ถูกต้อง");
    }

    // TIME_WARNING เป็นของระบบ ลูกค้าสร้างเองไม่ได้ จึงไม่อยู่ในรายการข้างบน
    // กันกดรัว: ชนิดเดียวกันที่ยังไม่ปิด และเพิ่งสร้างไม่ถึงหนึ่งนาที ให้ตอบ 429
    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
    const { data: recent } = await admin
      .from("service_call")
      .select("service_call_id")
      .eq("visit_id", visit.visit_id)
      .eq("type", type)
      .neq("status", "DONE")
      .gte("created_at", oneMinuteAgo)
      .is("deleted_at", null)
      .maybeSingle();

    if (recent) throw tooManyRequests("เพิ่งเรียกไปเมื่อครู่ พนักงานกำลังไปแล้ว");

    const call = unwrap(
      await admin
        .from("service_call")
        .insert({ visit_id: visit.visit_id, type, note: note ?? null })
        .select("service_call_id, type, status, created_at")
        .single(),
    );

    return { status: 201, body: { service_call: call } };
  });
});

Deno.serve(serveRouter(router));
