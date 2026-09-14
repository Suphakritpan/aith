// การพิสูจน์ตัวตนสองแบบที่ระบบนี้ใช้
//
// 1. พนักงาน — Supabase Auth (JWT) แล้วเทียบกับตาราง staff เพื่อรู้บทบาทและสาขา
//    รายการที่มีผลทางการเงินต้องยืนยัน PIN ซ้ำอีกชั้น (§02)
// 2. ลูกค้า — ไม่มี JWT เลย ใช้ qr_token ในลิงก์เป็นหลักฐานว่านั่งอยู่โต๊ะไหน (ADR-06)

import { admin, asUser } from "./db.ts";
import { forbidden, gone, unauthorized } from "./errors.ts";

export type StaffRole = "STAFF" | "SUPERVISOR" | "OWNER";

export type Staff = {
  staff_id: string;
  branch_id: string;
  full_name: string;
  role: StaffRole;
  pin_hash: string | null;
};

const RANK: Record<StaffRole, number> = { STAFF: 1, SUPERVISOR: 2, OWNER: 3 };

/** อ่าน JWT จากหัว Authorization แล้วคืนแถว staff ที่ยังใช้งานอยู่ */
export async function requireStaff(req: Request, minRole: StaffRole = "STAFF"): Promise<Staff> {
  const header = req.headers.get("Authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw unauthorized("ต้องล็อกอินก่อน");

  const { data: userData, error } = await admin.auth.getUser(token);
  if (error || !userData?.user) throw unauthorized("เซสชันหมดอายุ กรุณาล็อกอินใหม่");

  const { data: staff } = await admin
    .from("staff")
    .select("staff_id, branch_id, full_name, role, pin_hash")
    .eq("auth_user_id", userData.user.id)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (!staff) throw forbidden("บัญชีนี้ยังไม่ได้ผูกกับพนักงานในระบบ");
  if (RANK[staff.role as StaffRole] < RANK[minRole]) {
    throw forbidden(`รายการนี้ต้องเป็น ${minRole} ขึ้นไป`);
  }
  return staff as Staff;
}

// ── PIN ────────────────────────────────────────────────────────────────────
// hash จริงเก็บเป็น bcrypt (extensions.crypt) — ตั้งค่าโดย fn_set_pin (0017)
// ตรวจผ่าน fn_verify_pin RPC เดียวกับที่ frontend เรียก ไม่เทียบ hash เองในนี้
// เพื่อไม่ให้มีสองมาตรฐานการ hash ขัดกันอีก (เคยเป็น pbkdf2 คนละแบบกับ DB มาก่อน)

/**
 * บังคับยืนยัน PIN สำหรับรายการที่มีผลทางการเงิน — เปิด Visit, รับเงิน, ปิดโต๊ะ, ยกเลิก
 * PIN มาทางหัว X-Staff-PIN ไม่ใช่ใน body เพื่อไม่ให้ติดไปกับ log ของ request body
 */
export async function requirePin(req: Request, staff: Staff): Promise<void> {
  const pin = req.headers.get("X-Staff-PIN");
  if (!pin) throw forbidden("รายการนี้ต้องยืนยันด้วย PIN");
  if (!staff.pin_hash) throw forbidden("บัญชีนี้ยังไม่ได้ตั้ง PIN");

  const { data, error } = await asUser(req).rpc("fn_verify_pin", { p_pin: pin });
  if (error) throw forbidden("ยืนยัน PIN ไม่สำเร็จ");
  if (!data) throw forbidden("PIN ไม่ถูกต้อง");
}

// ── ลูกค้า: qr_token ───────────────────────────────────────────────────────

export type VisitContext = {
  visit_id: string;
  branch_id: string;
  status: string;
  seated_at: string;
  duration_minutes: number;
  package_id: string;
};

/**
 * แปลง qr_token เป็น Visit — BR-02
 *
 * ปิดโต๊ะแล้ว token หมดอายุทันที ลูกค้าโต๊ะถัดไปที่ถ่ายรูป QR เก่าไว้จึงเห็น
 * "มื้อนี้จบแล้ว" (410) ไม่ใช่ข้อมูลของโต๊ะที่กำลังใช้งานอยู่
 */
export async function requireVisitByToken(qrToken: string): Promise<VisitContext> {
  const { data: session } = await admin
    .from("qr_session")
    .select("visit_id, revoked_at, expires_at")
    .eq("token", qrToken)
    .maybeSingle();

  if (!session) throw unauthorized("ลิงก์นี้ใช้ไม่ได้");
  if (session.revoked_at) throw gone("มื้อนี้จบแล้ว");
  if (session.expires_at && new Date(session.expires_at) < new Date()) {
    throw gone("มื้อนี้จบแล้ว");
  }

  const { data: visit } = await admin
    .from("visit")
    .select("visit_id, branch_id, status, seated_at, duration_minutes, package_id")
    .eq("visit_id", session.visit_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!visit) throw gone("มื้อนี้จบแล้ว");
  if (visit.status === "CLOSED" || visit.status === "VOIDED") throw gone("มื้อนี้จบแล้ว");

  return visit as VisitContext;
}
