import { createClient } from "@supabase/supabase-js";

// ฝั่งพนักงานและเจ้าของร้านคุยกับฐานข้อมูลตรงผ่าน PostgREST
//
// ต่างจากฝั่งลูกค้าที่ต้องผ่าน Edge Function เพราะลูกค้าไม่ล็อกอิน จึงไม่มีตัวตนให้ RLS เทียบ
// ส่วนพนักงานล็อกอินด้วย Supabase Auth อยู่แล้ว RLS จึงกรองข้อมูลให้ได้ตรงตามบทบาท
// คีย์ที่ใช้ตรงนี้เป็นคีย์สาธารณะ ความปลอดภัยมาจาก RLS ไม่ได้มาจากการซ่อนคีย์

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error(
    "ยังไม่ได้ตั้ง VITE_SUPABASE_URL หรือ VITE_SUPABASE_PUBLISHABLE_KEY ใน frontend/.env",
  );
}

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: "puppa-staff-auth",
  },
});
