// รวมบิลข้ามโต๊ะ — Read/System Design.md §09 แถว 14, BR-07, ADR-05
//
// Visit ยังแยกต่อโต๊ะเพราะนาฬิกาต้องแยก ค่าเกินเวลาจึงคิดต่อโต๊ะได้ตามที่ตกลง (BR-08)
// การรวมเกิดที่ชั้น bill_group ซึ่งเป็นการรวม "ยอด" ไม่ใช่การรวม Visit

import { Router, json, serveRouter } from "../_shared/http.ts";
import { admin, unwrap } from "../_shared/db.ts";
import { requirePin, requireStaff } from "../_shared/auth.ts";
import { idempotent } from "../_shared/idempotency.ts";
import { badRequest, notFound } from "../_shared/errors.ts";

const router = new Router();

// ── POST /bill-groups ──────────────────────────────────────────────────────
router.post("/", async (req) => {
  // รวมบิลผิดกลุ่มลูกค้าคือความเสียหายทางเงิน จึงจำกัดไว้ที่หัวหน้ากะขึ้นไป
  const staff = await requireStaff(req, "SUPERVISOR");

  return await idempotent(req, "bill-groups", async (raw) => {
    const { queue_ticket_id, visit_ids } = raw as {
      queue_ticket_id?: string;
      visit_ids?: string[];
    };
    if (!queue_ticket_id) throw badRequest("ต้องระบุคิวต้นทาง");
    if (!visit_ids || visit_ids.length < 2) {
      throw badRequest("ต้องเลือกอย่างน้อยสอง Visit จึงจะรวมบิลได้");
    }

    await requirePin(req, staff);

    // trigger t03_bill_group_same_queue ปฏิเสธถ้ามี Visit ที่มาจากคิวอื่นปนมา
    const group = unwrap(
      await admin.rpc("fn_merge_bills", {
        p_queue_ticket_id: queue_ticket_id,
        p_visit_ids: visit_ids,
        p_staff_id: staff.staff_id,
      }),
    );

    return { status: 201, body: { bill_group: group } };
  });
});

// ── GET /bill-groups/:id — ยอดรวมของกลุ่ม ──────────────────────────────────
router.get("/:id", async (req, { id }) => {
  await requireStaff(req, "STAFF");

  const { data: group } = await admin
    .from("v_bill_group_total")
    .select("*")
    .eq("bill_group_id", id)
    .maybeSingle();
  if (!group) throw notFound("ไม่พบกลุ่มบิลนี้");

  // แจกแจงรายโต๊ะให้เห็นว่าโต๊ะไหนเกินเวลากี่รอบ — ตัวเลขที่ลูกค้ามักถาม
  const { data: visits } = await admin
    .from("visit")
    .select("visit_id, seated_at, closed_at, duration_minutes, bill(net_total, overtime_rounds)")
    .eq("bill_group_id", id)
    .is("deleted_at", null);

  return json({ group, visits: visits ?? [] });
});

Deno.serve(serveRouter(router));
