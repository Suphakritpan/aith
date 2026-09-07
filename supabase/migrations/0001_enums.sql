-- 0001_enums.sql
-- หมากระทุปุ๊ป๊ะ — ชนิดข้อมูลกลางของระบบ
-- อ้างอิง: Read/System Design.md §06 ER Diagram, §08 SQL
--
-- ทุก ENUM ในไฟล์นี้เป็น "คำศัพท์ของธุรกิจ" ไม่ใช่ค่าที่ UI คิดขึ้นเอง
-- การเพิ่มค่าใหม่ต้องแก้ที่นี่ที่เดียว แล้ว trigger/RLS จะบังคับตามอัตโนมัติ

-- ไม่ต้องพึ่ง pgcrypto: gen_random_uuid() เป็นฟังก์ชันในตัวของ PostgreSQL 13+
-- และ token ที่ใช้ประกอบจาก UUID v4 ซึ่งสุ่มด้วย CSPRNG อยู่แล้ว

-- กลุ่ม 1 — โครงร้านและผู้ใช้
create type staff_role   as enum ('STAFF', 'SUPERVISOR', 'OWNER');
create type table_status as enum ('AVAILABLE', 'OCCUPIED', 'CLEANING', 'RESERVED');

-- กลุ่ม 2 — คิวและการจอง
create type queue_lane           as enum ('A', 'B', 'C');
create type queue_status         as enum ('WAITING', 'CALLED', 'SEATED', 'NO_SHOW', 'CANCELLED');
create type reservation_status   as enum ('HELD', 'SEATED', 'RELEASED');
create type notification_channel as enum ('SMS', 'LINE');

-- กลุ่ม 3 — Visit (แกนกลาง) — §05 State Machine
create type visit_status as enum (
  'QUEUED', 'SEATED', 'DINING', 'BILL_REQUESTED', 'PAID', 'CLOSED', 'VOIDED'
);
create type pax_tier as enum ('ADULT', 'CHILD', 'TODDLER_FREE');

-- กลุ่ม 4 — เมนูและออเดอร์
create type overtime_mode       as enum ('FULL_ROUND');
create type addon_charge_basis  as enum ('PER_HEAD', 'PER_TABLE');
create type order_source        as enum ('CUSTOMER', 'STAFF');
create type order_status        as enum ('PENDING', 'PREPARING', 'SERVED', 'CANCELLED');
create type service_call_type   as enum ('WATER', 'UTENSIL', 'BILL', 'TIME_WARNING', 'OTHER');
create type service_call_status as enum ('OPEN', 'ACCEPTED', 'DONE');

-- กลุ่ม 5 — เงิน สต๊อก และการตรวจสอบ
create type split_mode      as enum ('EQUAL_PER_HEAD', 'CUSTOM_AMOUNT');
create type payment_method  as enum ('PROMPTPAY', 'CASH', 'TRANSFER');
create type consent_purpose as enum ('LOYALTY', 'MARKETING');
create type audit_action    as enum ('INSERT', 'UPDATE', 'SOFT_DELETE', 'RESTORE');
