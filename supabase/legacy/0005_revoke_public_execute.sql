-- ============================================================
-- Postgres ให้สิทธิ์ EXECUTE กับ PUBLIC โดยอัตโนมัติทุกฟังก์ชัน
-- การ revoke จาก anon ใน 0004 จึงไม่มีผลจริง เพราะ anon ยังได้สิทธิ์ผ่าน PUBLIC อยู่
-- (ยืนยันได้จากการเรียก open_visit ด้วย anon key แล้วยังเข้าถึงตัวฟังก์ชันได้
--  แม้จะถูกเช็ค is_staff() ข้างในดักไว้อีกชั้นก็ตาม)
-- ============================================================

revoke all on function public.handle_new_user()                              from public;
revoke all on function public.next_ticket_no()                               from public;
revoke all on function public.next_visit_code()                              from public;
revoke all on function public.join_visit(text)                               from public;
revoke all on function public.place_order(uuid, jsonb, text)                 from public;
revoke all on function public.call_staff(uuid, service_call_type, text)      from public;
revoke all on function public.open_visit(uuid, uuid, int, int, uuid)         from public;
revoke all on function public.close_visit(uuid)                              from public;
revoke all on function public.set_order_item_status(uuid, order_status)      from public;
revoke all on function public.issue_bill(uuid)                               from public;
revoke all on function public.pay_bill(uuid, payment_method, numeric, text)  from public;
revoke all on function public.staff_dashboard()                              from public;

-- คืนสิทธิ์ให้เฉพาะ role ที่ต้องเรียกจริง
grant execute on function public.join_visit(text)                              to authenticated;
grant execute on function public.place_order(uuid, jsonb, text)                to authenticated;
grant execute on function public.call_staff(uuid, service_call_type, text)     to authenticated;
grant execute on function public.open_visit(uuid, uuid, int, int, uuid)        to authenticated;
grant execute on function public.close_visit(uuid)                             to authenticated;
grant execute on function public.set_order_item_status(uuid, order_status)     to authenticated;
grant execute on function public.issue_bill(uuid)                              to authenticated;
grant execute on function public.pay_bill(uuid, payment_method, numeric, text) to authenticated;
grant execute on function public.staff_dashboard()                             to authenticated;
