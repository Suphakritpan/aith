// การพิสูจน์ตัวตนสองแบบที่ระบบนี้ใช้
//
// 1. พนักงาน — Supabase Auth (JWT) แล้วเทียบกับตาราง staff เพื่อรู้บทบาทและสาขา
//    รายการที่มีผลทางการเงินต้องยืนยัน PIN ซ้ำอีกชั้น (§02)
// 2. ลูกค้า — ไม่มี JWT เลย ใช้ qr_token ในลิงก์เป็นหลักฐานว่านั่งอยู่โต๊ะไหน (ADR-06)

import { admin } from "./db.ts";
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
// เก็บเป็น pbkdf2$<รอบ>$<salt base64>$<hash base64> ใช้ Web Crypto ที่ Deno มีในตัว
// จึงไม่ต้องพึ่งไลบรารีภายนอกสำหรับสิ่งที่อยู่บนเส้นทางการเงิน

const PBKDF2_ITERATIONS = 120_000;

const toB64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(
  pin: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, [
    "deriveBits",
  ]);
  return await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    256,
  );
}

export async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await derive(pin, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toB64(salt.buffer)}$${toB64(bits)}`;
}

/** เทียบแบบเวลาคงที่ เพื่อไม่ให้เดา PIN ทีละหลักจากเวลาที่ใช้ตอบ */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * บังคับยืนยัน PIN สำหรับรายการที่มีผลทางการเงิน — เปิด Visit, รับเงิน, ปิดโต๊ะ, ยกเลิก
 * PIN มาทางหัว X-Staff-PIN ไม่ใช่ใน body เพื่อไม่ให้ติดไปกับ log ของ request body
 */
export async function requirePin(req: Request, staff: Staff): Promise<void> {
  const pin = req.headers.get("X-Staff-PIN");
  if (!pin) throw forbidden("รายการนี้ต้องยืนยันด้วย PIN");
  if (!staff.pin_hash) throw forbidden("บัญชีนี้ยังไม่ได้ตั้ง PIN");

  const [scheme, iterStr, saltB64, hashB64] = staff.pin_hash.split("$");
  if (scheme !== "pbkdf2") throw forbidden("รูปแบบ PIN ที่เก็บไว้ไม่ถูกต้อง");

  const bits = await derive(pin, fromB64(saltB64), Number(iterStr));
  if (!timingSafeEqual(new Uint8Array(bits), fromB64(hashB64))) {
    throw forbidden("PIN ไม่ถูกต้อง");
  }
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
