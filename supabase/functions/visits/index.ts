// Visit — Read/System Design.md §09 แถว 5-7, 13, 16-17
//
// ทุก endpoint ที่นี่แตะเงินหรือสถานะโต๊ะ จึงต้องล็อกอินเป็นพนักงาน
// และรายการที่มีผลทางการเงินต้องยืนยัน PIN ซ้ำอีกชั้นตาม §02

import { Router, json, serveRouter } from "../_shared/http.ts";
import { admin, asUser, unwrap } from "../_shared/db.ts";
import { requirePin, requireStaff } from "../_shared/auth.ts";
import { idempotent } from "../_shared/idempotency.ts";
import { badRequest, notFound } from "../_shared/errors.ts";

const router = new Router();

// ── POST /visits — เช็คอิน ─────────────────────────────────────────────────
type OpenBody = {
  table_ids?: string[];
  adult?: number;
  child?: number;
  toddler_free?: number;
  addon_qty?: number;
  queue_ticket_id?: string;
};

router.post("/", async (req) => {
  const staff = await requireStaff(req, "STAFF");

  return await idempotent(req, "visits/open", async (raw) => {
    const body = raw as OpenBody;
    if (!body.table_ids?.length) throw badRequest("ต้องเลือกโต๊ะอย่างน้อยหนึ่งโต๊ะ");

    const adult = body.adult ?? 0;
    const child = body.child ?? 0;
    const toddler = body.toddler_free ?? 0;
    if (adult + child + toddler < 1) throw badRequest("ต้องระบุจำนวนคนอย่างน้อยหนึ่งคน");

    // เปิดโต๊ะคือจุดที่นาฬิกาและเงินเริ่มเดิน จึงยืนยัน PIN
    await requirePin(req, staff);

    // fn_open_visit อ่านสาขาและรหัสพนักงานจาก auth.uid() เอง จึงต้องเรียกในนามผู้ใช้
    // ถ้าเรียกด้วย service role auth.uid() จะเป็น null แล้วเปิดโต๊ะไม่สำเร็จ
    const rows = unwrap(
      await asUser(req).rpc("fn_open_visit", {
        p_queue_ticket_id: body.queue_ticket_id ?? null,
        p_table_ids: body.table_ids,
        p_adult: adult,
        p_child: child,
        p_toddler_free: toddler,
        p_addon_qty: body.addon_qty ?? 0,
      }),
    );

    // ฟังก์ชันคืนเป็นตาราง supabase-js จึงส่งกลับมาเป็น array หนึ่งแถว
    const opened = Array.isArray(rows) ? rows[0] : rows;

    return {
      status: 201,
      body: {
        visit_id: opened.visit_id,
        // ลิงก์ที่ลูกค้าใช้เปิดหน้าโต๊ะ — เอาไปทำ QR ได้เลย
        qr_token: opened.qr_token,
        pax: { adult, child, toddler_free: toddler },
      },
    };
  });
});

// ── POST /visits/:id/tables — กดเพิ่มโต๊ะบน Visit เดิม ─────────────────────
router.post("/:id/tables", async (req, { id }) => {
  const staff = await requireStaff(req, "STAFF");

  return await idempotent(req, "visits/add-table", async (raw) => {
    const { table_id } = raw as { table_id?: string };
    if (!table_id) throw badRequest("ต้องเลือกโต๊ะที่จะเพิ่ม");

    const row = unwrap(
      await admin.rpc("fn_add_table_to_visit", { p_visit_id: id, p_table_id: table_id }),
    );
    return { status: 201, body: { visit_table: row, staff: staff.full_name } };
  });
});

// ── PATCH /visits/:id/pax — เพิ่มจำนวนคนกลางมื้อ (BR-03) ───────────────────
router.patch("/:id/pax", async (req, { id }) => {
  const staff = await requireStaff(req, "STAFF");

  return await idempotent(req, "visits/pax", async (raw) => {
    const { tier, qty } = raw as { tier?: string; qty?: number };
    if (!tier || !Number.isInteger(qty) || (qty as number) < 1) {
      throw badRequest("ต้องระบุช่วงราคาและจำนวนที่เพิ่มเป็นจำนวนเต็มตั้งแต่ 1");
    }
    // เพิ่มคน = เพิ่มยอดเงิน จึงต้องมีผู้รับผิดชอบ
    await requirePin(req, staff);

    const row = unwrap(
      await admin.rpc("fn_add_pax", {
        p_visit_id: id,
        p_tier: tier,
        p_qty: qty,
        p_staff_id: staff.staff_id,
      }),
    );
    return { status: 200, body: { visit_pax: row } };
  });
});

// ── POST /visits/:id/bill — ขอเช็กบิล ──────────────────────────────────────
// ลูกค้าเรียกผ่าน /c/:qrToken/service-calls ชนิด BILL ส่วน endpoint นี้คือฝั่งพนักงาน
router.post("/:id/bill", async (req, { id }) => {
  const staff = await requireStaff(req, "STAFF");

  return await idempotent(req, "visits/bill", async (raw) => {
    const { split_mode, discount } = raw as { split_mode?: string; discount?: number };

    // ส่วนลดเป็นการแก้ตัวเลขเงิน จึงต้องหัวหน้ากะ
    if (discount && discount > 0 && staff.role === "STAFF") {
      throw badRequest("การให้ส่วนลดต้องให้หัวหน้ากะเป็นผู้ยืนยัน");
    }

    const bill = unwrap(
      await admin.rpc("fn_issue_bill", {
        p_visit_id: id,
        p_split_mode: split_mode ?? "EQUAL_PER_HEAD",
        p_discount: discount ?? 0,
      }),
    );

    const payingPax = await admin.rpc("fn_paying_pax", { p_visit_id: id });
    const heads = (payingPax.data as number) ?? 0;

    return {
      status: 201,
      body: {
        bill,
        paying_pax: heads,
        // หารเท่ากันตามหัว เศษบาทตกที่คนแรก (§10)
        per_head: heads > 0 ? Math.ceil(Number(bill.net_total) / heads) : null,
      },
    };
  });
});

// ── POST /visits/:id/close — ปิดโต๊ะ (BR-06) ───────────────────────────────
router.post("/:id/close", async (req, { id }) => {
  const staff = await requireStaff(req, "STAFF");

  return await idempotent(req, "visits/close", async () => {
    await requirePin(req, staff);
    const visit = unwrap(await admin.rpc("fn_close_visit", { p_visit_id: id }));
    return { status: 200, body: { visit } };
  });
});

// ── POST /visits/:id/void — ยกเลิก Visit ───────────────────────────────────
router.post("/:id/void", async (req, { id }) => {
  const staff = await requireStaff(req, "SUPERVISOR");

  return await idempotent(req, "visits/void", async (raw) => {
    const { reason } = raw as { reason?: string };
    await requirePin(req, staff);
    const visit = unwrap(
      await admin.rpc("fn_void_visit", { p_visit_id: id, p_reason: reason ?? "" }),
    );
    return { status: 200, body: { visit } };
  });
});

// ── GET /visits/:id — สรุป Visit สำหรับหน้าพนักงาน ─────────────────────────
router.get("/:id", async (req, { id }) => {
  await requireStaff(req, "STAFF");

  const { data: live } = await admin
    .from("v_visit_live")
    .select("*")
    .eq("visit_id", id)
    .maybeSingle();
  if (!live) throw notFound("ไม่พบ Visit");

  const [pax, addons, orders, bill, calls] = await Promise.all([
    admin.from("visit_pax").select("tier, qty, unit_price").eq("visit_id", id),
    admin.from("visit_addon").select("addon_id, qty, unit_price, addon(name)").eq("visit_id", id),
    admin
      .from("order_batch")
      .select("order_batch_id, created_at, source, order_item(order_item_id, qty, status, menu_item(name))")
      .eq("visit_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    admin.from("bill").select("*").eq("visit_id", id).is("deleted_at", null).maybeSingle(),
    admin
      .from("service_call")
      .select("service_call_id, type, status, created_at")
      .eq("visit_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  const current = await admin.rpc("fn_calc_bill", { p_visit_id: id });

  return json({
    live,
    pax: pax.data ?? [],
    addons: addons.data ?? [],
    orders: orders.data ?? [],
    bill: bill.data ?? null,
    service_calls: calls.data ?? [],
    // ยอดปัจจุบันคำนวณสด ต่างจาก bill ที่เป็น snapshot ตอนขอเช็กบิล
    current_total: Array.isArray(current.data) ? current.data[0] : current.data,
  });
});

Deno.serve(serveRouter(router));
