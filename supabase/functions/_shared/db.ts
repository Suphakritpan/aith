// การเชื่อมต่อฐานข้อมูล
//
// ADR-06: ลูกค้าไม่ล็อกอิน RLS จึงไม่มีตัวตนให้เทียบ Edge Function จึงตรวจ qr_token เอง
// แล้วค่อยใช้ service role ต่อ — service role ข้าม RLS ได้ ทุกจุดที่ใช้จึงต้องตรวจสิทธิ์
// ด้วยมือก่อนเสมอ ห้ามส่ง client ตัวนี้ไปให้โค้ดที่ยังไม่ได้ตรวจว่าใครเป็นคนขอ

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { AppError, fromPostgres } from "./errors.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

// ข้าม RLS — ใช้เฉพาะหลังจากตรวจสิทธิ์เองแล้ว
export const admin: SupabaseClient = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ทำงานในนามพนักงานที่ล็อกอิน — RLS ยังบังคับอยู่ ใช้กับงานฝั่ง Staff/Admin
// ที่ policy ครอบคลุมอยู่แล้ว จะได้ไม่ต้องเขียนเงื่อนไขสิทธิ์ซ้ำในโค้ด
export function asUser(req: Request): SupabaseClient {
  const authorization = req.headers.get("Authorization") ?? "";
  return createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// รวมการแปลง error ของ Postgres ไว้ที่เดียว เพื่อให้ทุก endpoint ตอบรหัสเดียวกัน
export function unwrap<T>(res: { data: T; error: unknown }): NonNullable<T> {
  if (res.error) throw fromPostgres(res.error as { code?: string; message?: string });
  if (res.data === null || res.data === undefined) {
    throw new AppError(404, "NOT_FOUND", "ไม่พบข้อมูล");
  }
  return res.data;
}
