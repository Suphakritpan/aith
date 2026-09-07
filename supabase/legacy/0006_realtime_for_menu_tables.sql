-- ============================================================
-- เมนูถูกลืมไว้ตอนตั้ง publication ใน 0002
--
-- ผลคือแอดมินกดปิดขายเมนูแล้วแถวใน DB เปลี่ยนจริง แต่ไม่มี event ส่งออกมา
-- useLiveQuery จึงไม่ดึงข้อมูลใหม่ ทั้งหน้าแอดมินและหน้าเมนูของลูกค้าค้างอยู่ที่ข้อมูลเก่า
-- (เจอจาก e2e test ที่กดปิดขายแล้วรอ badge เปลี่ยนจนหมดเวลา)
-- ============================================================

alter publication supabase_realtime add table menu_items;
alter publication supabase_realtime add table menu_categories;
alter publication supabase_realtime add table buffet_packages;
