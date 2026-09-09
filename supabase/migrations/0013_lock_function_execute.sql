-- 0013_lock_function_execute.sql
-- ถอนสิทธิ์เรียกฟังก์ชันจากผู้ใช้ที่ไม่ล็อกอิน
-- อ้างอิง: Read/System Design.md ADR-06
--
-- ไฟล์นี้กู้กลับมาจาก migration ที่ลงฐานข้อมูลไปแล้ว (version 20260907123734)
--
-- PostgreSQL ให้สิทธิ์ EXECUTE กับ role `public` โดยปริยาย ซึ่งครอบคลุม anon ด้วย
-- ถ้าไม่ถอนตรงนี้ ฟังก์ชันที่ใส่ security definer ไว้จะกลายเป็นทางลัดข้าม RLS
-- ให้ใครก็ได้ที่มี anon key เรียกใช้ — ซึ่งลบล้างเหตุผลทั้งหมดของ ADR-06

revoke execute on all functions in schema public from public, anon;
alter default privileges in schema public revoke execute on functions from public, anon;

grant execute on all functions in schema public to authenticated, service_role;
