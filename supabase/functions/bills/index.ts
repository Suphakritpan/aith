// การชำระเงิน — Read/System Design.md §09 แถว 15
//
// หนึ่งบิลมี payment ได้หลายแถว เพื่อรองรับหารกันในโต๊ะและจ่ายเป็นก้อน
// ระบบ mock ไม่มี webhook จากธนาคาร ทุกแถวจึงต้องมีพนักงานที่กดยืนยันเป็นผู้รับผิดชอบ

import { Router, json, serveRouter } from "../_shared/http.ts";
import { admin, unwrap } from "../_shared/db.ts";
import { requirePin, requireStaff } from "../_shared/auth.ts";
import { idempotent } from "../_shared/idempotency.ts";
import { badRequest, notFound } from "../_shared/errors.ts";

const router = new Router();
const METHODS = ["PROMPTPAY", "CASH", "TRANSFER"];

// ── POST /bills/:id/payments — บันทึกการชำระ ───────────────────────────────
router.post("/:id/payments", async (req, { id }) => {
  const staff = await requireStaff(req, "STAFF");

  return await idempotent(req, "bills/payments", async (raw) => {
    const { method, amount, reference } = raw as {
      method?: string;
      amount?: number;
      reference?: string;
    };
    if (!method || !METHODS.includes(method)) throw badRequest("วิธีชำระเงินไม่ถูกต้อง");
    if (typeof amount !== "number" || !(amount > 0)) {
      throw badRequest("จำนวนเงินต้องมากกว่าศูนย์");
    }

    // การรับเงินคือจุดที่ต้องมีคนรับผิดชอบชัดเจน จึงยืนยัน PIN ทุกครั้ง
    await requirePin(req, staff);

    // trigger t01_payment_not_exceed_total เป็นคนกันไม่ให้ผลรวมเกินยอดสุทธิ
    const payment = unwrap(
      await admin
        .from("payment")
        .insert({
          bill_id: id,
          method,
          amount,
          reference: reference ?? null,
          confirmed_by: staff.staff_id,
          idempotency_key: req.headers.get("Idempotency-Key"),
        })
        .select("payment_id, method, amount, paid_at")
        .single(),
    );

    const bill = unwrap(
      await admin.from("bill").select("net_total, visit_id").eq("bill_id", id).single(),
    );
    const { data: paid } = await admin
      .from("payment")
      .select("amount")
      .eq("bill_id", id)
      .is("deleted_at", null);

    const total = (paid ?? []).reduce((s, p) => s + Number(p.amount), 0);
    const outstanding = Number(bill.net_total) - total;

    return {
      status: 201,
      body: {
        payment,
        paid_total: total,
        outstanding,
        // ปิดโต๊ะได้เมื่อยอดค้างเป็นศูนย์เท่านั้น (BR-06)
        can_close: outstanding === 0,
      },
    };
  });
});

// ── GET /bills/:id — ใบแจ้งยอด ─────────────────────────────────────────────
router.get("/:id", async (req, { id }) => {
  await requireStaff(req, "STAFF");

  const { data: bill } = await admin
    .from("bill")
    .select("*, visit(visit_id, seated_at, closed_at, duration_minutes, bill_group_id)")
    .eq("bill_id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!bill) throw notFound("ไม่พบบิลใบนี้");

  const [payments, pax] = await Promise.all([
    admin
      .from("payment")
      .select("payment_id, method, amount, reference, paid_at, staff:confirmed_by(full_name)")
      .eq("bill_id", id)
      .is("deleted_at", null),
    admin.from("visit_pax").select("tier, qty, unit_price").eq("visit_id", bill.visit_id),
  ]);

  const paidTotal = (payments.data ?? []).reduce((s, p) => s + Number(p.amount), 0);
  const payingPax = (pax.data ?? [])
    .filter((p) => p.tier !== "TODDLER_FREE")
    .reduce((s, p) => s + p.qty, 0);

  return json({
    bill,
    pax: pax.data ?? [],
    payments: payments.data ?? [],
    paid_total: paidTotal,
    outstanding: Number(bill.net_total) - paidTotal,
    per_head: payingPax > 0 ? Math.ceil(Number(bill.net_total) / payingPax) : null,
  });
});

Deno.serve(serveRouter(router));
