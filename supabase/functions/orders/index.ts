// สถานะอาหาร — Read/System Design.md §09 แถว 12
//
// หน้าจอครัวเปลี่ยนสถานะ PENDING → PREPARING → SERVED
// การข้ามขั้นถูกปฏิเสธที่ trigger ไม่ใช่แค่ที่ปุ่มบนหน้าจอ
// endpoint นี้ไม่ต้องส่ง Idempotency-Key เพราะเป็นการตั้งค่าให้เป็นค่าหนึ่ง ไม่ใช่การสร้างของใหม่

import { Router, json, serveRouter } from "../_shared/http.ts";
import { admin, unwrap } from "../_shared/db.ts";
import { requireStaff } from "../_shared/auth.ts";
import { badRequest, unprocessable } from "../_shared/errors.ts";

const router = new Router();

const NEXT = ["PENDING", "PREPARING", "SERVED", "CANCELLED"];

// ── PATCH /orders/items/:id/status ─────────────────────────────────────────
router.patch("/items/:id/status", async (req, { id }) => {
  await requireStaff(req, "STAFF");

  const { status, cancel_reason } = (await req.json()) as {
    status?: string;
    cancel_reason?: string;
  };

  if (!status || !NEXT.includes(status)) throw badRequest("สถานะไม่ถูกต้อง");
  if (status === "CANCELLED" && !cancel_reason?.trim()) {
    throw unprocessable("การยกเลิกรายการอาหารต้องระบุเหตุผล");
  }

  const row = unwrap(
    await admin
      .from("order_item")
      .update({
        status,
        cancel_reason: status === "CANCELLED" ? cancel_reason : null,
      })
      .eq("order_item_id", id)
      .is("deleted_at", null)
      .select("order_item_id, status, served_at")
      .single(),
  );

  return json({ order_item: row });
});

// ── GET /orders/kitchen — คิวงานของครัว ────────────────────────────────────
// ครัวเดียว ไม่แยกสถานี (§04 ขั้นที่ 08) เรียงตามเวลาที่สั่งเพื่อให้ทำตามลำดับ
router.get("/kitchen", async (req) => {
  const staff = await requireStaff(req, "STAFF");

  const { data } = await admin
    .from("v_kitchen_queue")
    .select("*")
    .eq("branch_id", staff.branch_id)
    .order("ordered_at");

  return json({ items: data ?? [] });
});

// ── POST /orders — พนักงานสั่งแทนลูกค้า ────────────────────────────────────
// เส้นทางแทรกที่ §04 ระบุไว้: โทรศัพท์ลูกค้าแบตหมด พนักงานสั่งให้จาก Staff Web
router.post("/", async (req) => {
  const staff = await requireStaff(req, "STAFF");
  const key = req.headers.get("Idempotency-Key");
  if (!key) throw badRequest("ต้องส่งหัว Idempotency-Key");

  const { visit_id, items } = (await req.json()) as {
    visit_id?: string;
    items?: { menu_item_id: string; qty: number }[];
  };
  if (!visit_id || !items?.length) throw badRequest("ต้องระบุ Visit และรายการอาหาร");

  const batch = unwrap(
    await admin
      .from("order_batch")
      .insert({
        visit_id,
        source: "STAFF",
        created_by: staff.staff_id,
        idempotency_key: key,
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
      .select("order_item_id, qty, status"),
  );

  return json({ order_batch: batch, items: inserted }, 201);
});

Deno.serve(serveRouter(router));
