// คิว — Read/System Design.md §09 แถว 1-4
//
// รับคิวและดูคิวเป็น endpoint สาธารณะ เพราะลูกค้ายังไม่มีโต๊ะจึงยังไม่มี qr_token
// สิ่งที่ป้องกันการยิงมั่วคือ Idempotency-Key และการที่ไม่มีข้อมูลอ่อนไหวอยู่ในคำตอบ

import { Router, json, serveRouter } from "../_shared/http.ts";
import { admin, unwrap } from "../_shared/db.ts";
import { requireStaff } from "../_shared/auth.ts";
import { idempotent } from "../_shared/idempotency.ts";
import { badRequest, gone, notFound } from "../_shared/errors.ts";

const router = new Router();

async function defaultBranchId(): Promise<string> {
  const branch = unwrap(
    await admin.from("branch").select("branch_id").is("deleted_at", null)
      .order("created_at").limit(1).single(),
  );
  return branch.branch_id;
}

// ── POST /queue/tickets — รับคิว ───────────────────────────────────────────
type TicketBody = { party_size?: number; phone?: string; branch_id?: string };

router.post("/tickets", async (req) => {
  return await idempotent(req, "queue/tickets", async (raw) => {
    const { party_size, phone, branch_id } = raw as TicketBody;
    if (!Number.isInteger(party_size) || (party_size as number) < 1) {
      throw badRequest("ต้องระบุจำนวนคนเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป");
    }

    const branch = branch_id ?? (await defaultBranchId());

    // ช่องคิวเลือกจากจำนวนคน ลูกค้าไม่ได้เลือกเอง — A (1-2) / B (3-4) / C (5+)
    const ticket = unwrap(
      await admin.rpc("fn_take_queue_ticket", {
        p_branch_id: branch,
        p_party_size: party_size,
        p_phone: phone ?? null,
      }),
    );

    const wait = await admin.rpc("fn_estimated_wait_minutes", {
      p_branch_id: branch,
      p_lane: ticket.lane,
    });

    return {
      status: 201,
      body: {
        ticket_no: `${ticket.lane}-${String(ticket.seq_no).padStart(3, "0")}`,
        // token นี้คือสิ่งเดียวที่ลูกค้าใช้เปิดหน้าดูคิวของตัวเอง
        public_token: ticket.public_token,
        queue_ticket_id: ticket.queue_ticket_id,
        lane: ticket.lane,
        party_size: ticket.party_size,
        estimated_wait_minutes: wait.data ?? null,
      },
    };
  });
});

// ── GET /queue/tickets/:token — ลูกค้าดูคิวของตัวเอง ───────────────────────
router.get("/tickets/:token", async (_req, { token }) => {
  const { data: ticket } = await admin
    .from("queue_ticket")
    .select("queue_ticket_id, branch_id, lane, seq_no, party_size, status, created_at")
    .eq("public_token", token)
    .is("deleted_at", null)
    .maybeSingle();

  if (!ticket) throw notFound("ไม่พบคิวใบนี้");
  if (ticket.status === "NO_SHOW") throw gone("คิวนี้ถูกตัดแล้วเพราะเรียกครบสามครั้ง");

  // ลำดับที่รออยู่ = จำนวนคิวในช่องเดียวกันที่มาก่อนและยังรออยู่
  const { count: ahead } = await admin
    .from("queue_ticket")
    .select("queue_ticket_id", { count: "exact", head: true })
    .eq("branch_id", ticket.branch_id)
    .eq("lane", ticket.lane)
    .eq("status", "WAITING")
    .lt("seq_no", ticket.seq_no)
    .is("deleted_at", null);

  const wait = await admin.rpc("fn_estimated_wait_minutes", {
    p_branch_id: ticket.branch_id,
    p_lane: ticket.lane,
  });

  return json({
    ticket_no: `${ticket.lane}-${String(ticket.seq_no).padStart(3, "0")}`,
    status: ticket.status,
    party_size: ticket.party_size,
    ahead_count: ahead ?? 0,
    estimated_wait_minutes: wait.data ?? null,
  });
});

// ── GET /queue/board — จอคิว TV แบบอ่านอย่างเดียว ──────────────────────────
router.get("/board", async () => {
  const { data } = await admin
    .from("v_queue_board")
    .select("lane, ticket_no, party_size, status, last_called_at, call_count")
    .order("lane")
    .order("seq_no");

  const rows = data ?? [];
  return json({
    // แยกตามช่องให้เลย หน้าจอ TV จะได้ไม่ต้องคิดเอง
    lanes: {
      A: rows.filter((r) => r.lane === "A"),
      B: rows.filter((r) => r.lane === "B"),
      C: rows.filter((r) => r.lane === "C"),
    },
    calling: rows.filter((r) => r.status === "CALLED"),
  });
});

// ── POST /queue/tickets/:id/call — พนักงานเรียกคิว ─────────────────────────
router.post("/tickets/:id/call", async (req, { id }) => {
  const staff = await requireStaff(req, "STAFF");

  return await idempotent(req, "queue/call", async () => {
    const call = unwrap(
      await admin.rpc("fn_call_queue_ticket", {
        p_queue_ticket_id: id,
        p_staff_id: staff.staff_id,
      }),
    );
    return { status: 201, body: { queue_call: call } };
  });
});

Deno.serve(serveRouter(router));
