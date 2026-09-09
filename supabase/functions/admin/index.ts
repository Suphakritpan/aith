// หลังบ้าน — Read/System Design.md §09 แถว 18-19, BR-10
//
// การกู้คืนข้อมูลที่ลบต้องทำได้เองในหน้า Admin ไม่ใช่ต้องเรียก dev (ADR-08)
// รายงานจำกัดไว้ที่เจ้าของร้าน เพราะเป็นตัวเลขยอดขายทั้งร้าน

import { Router, json, serveRouter } from "../_shared/http.ts";
import { admin, unwrap } from "../_shared/db.ts";
import { requireStaff } from "../_shared/auth.ts";
import { idempotent } from "../_shared/idempotency.ts";
import { badRequest } from "../_shared/errors.ts";

const router = new Router();

// ── POST /admin/restore — กู้คืนข้อมูลที่ soft delete ───────────────────────
router.post("/restore", async (req) => {
  const staff = await requireStaff(req, "SUPERVISOR");

  return await idempotent(req, "admin/restore", async (raw) => {
    const { table_name, record_id } = raw as { table_name?: string; record_id?: string };
    if (!table_name || !record_id) throw badRequest("ต้องระบุตารางและรหัสของแถวที่จะกู้คืน");

    // รายชื่อตารางที่กู้คืนได้ถูกจำกัดไว้ในฟังก์ชัน SQL แล้ว
    // ชื่อที่ส่งมาจากภายนอกจึงกลายเป็นคำสั่งอื่นไม่ได้
    const row = unwrap(
      await admin.rpc("fn_restore_record", {
        p_table_name: table_name,
        p_record_id: record_id,
      }),
    );

    await admin.from("audit_log").insert({
      table_name,
      record_id,
      action: "RESTORE",
      actor_staff_id: staff.staff_id,
      after: row,
    });

    return { status: 200, body: { restored: row } };
  });
});

// ── GET /admin/deleted/:table — รายการที่ถูกลบไว้ ──────────────────────────
router.get("/deleted/:table", async (req, { table }) => {
  await requireStaff(req, "SUPERVISOR");

  const allowed = ["visit", "menu_item", "dining_table", "staff", "bill", "order_batch"];
  if (!allowed.includes(table)) throw badRequest(`ดูรายการที่ลบของตาราง ${table} ไม่ได้`);

  const { data } = await admin
    .from(table)
    .select("*")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false })
    .limit(100);

  return json({ table, rows: data ?? [] });
});

// ── GET /admin/reports/daily — รายงานประจำวัน ──────────────────────────────
router.get("/reports/daily", async (req) => {
  const staff = await requireStaff(req, "OWNER");
  const date = new URL(req.url).searchParams.get("date");

  const report = unwrap(
    await admin.rpc("fn_daily_report", {
      p_branch_id: staff.branch_id,
      p_date: date ?? new Date().toISOString().slice(0, 10),
    }),
  );

  return json(report);
});

// ── GET /admin/audit — บันทึกการเปลี่ยนแปลง ────────────────────────────────
router.get("/audit", async (req) => {
  await requireStaff(req, "OWNER");
  const params = new URL(req.url).searchParams;

  let query = admin
    .from("audit_log")
    .select("audit_id, table_name, record_id, action, created_at, staff:actor_staff_id(full_name)")
    .order("created_at", { ascending: false })
    .limit(200);

  const table = params.get("table");
  if (table) query = query.eq("table_name", table);

  const { data } = await query;
  return json({ entries: data ?? [] });
});

// ── POST /admin/sweeps — งานกวาดตามรอบ ─────────────────────────────────────
// ยังไม่ได้ตั้ง pg_cron จึงเปิดเป็น endpoint ให้เรียกจากตัวตั้งเวลาภายนอกไปก่อน
// สามอย่างนี้คือ ตัดคิว no-show, เตือนเหลือ 15 นาที และลบเบอร์โทรตาม PDPA
router.post("/sweeps", async (req) => {
  await requireStaff(req, "SUPERVISOR");

  const [noShow, warning, phone, idem] = await Promise.all([
    admin.rpc("fn_sweep_no_show"),
    admin.rpc("fn_sweep_time_warning"),
    admin.rpc("fn_sweep_expired_phone"),
    admin.rpc("fn_sweep_idempotency"),
  ]);

  return json({
    no_show_cut: noShow.data ?? 0,
    time_warnings_created: warning.data ?? 0,
    phones_erased: phone.data ?? 0,
    idempotency_pruned: idem.data ?? 0,
  });
});

Deno.serve(serveRouter(router));
