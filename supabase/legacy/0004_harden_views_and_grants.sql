-- ============================================================
-- แก้ security advisor: view แบบ SECURITY DEFINER เป็น ERROR
--
-- บอร์ดคิวต้องดูได้โดยไม่ต้อง login แต่ตาราง queue_tickets มีเบอร์โทรลูกค้าอยู่
-- จึงเปิดทั้งตารางไม่ได้ ทางออกคือ RPC ที่คืนเฉพาะคอลัมน์ที่ปลอดภัย
-- (view ทำแบบเดียวกันได้ แต่ linter ตีว่าเป็นการข้าม RLS โดยไม่ตั้งใจ)
-- ============================================================

drop view if exists public.queue_board;
drop view if exists public.staff_dashboard;

create or replace function public.queue_board()
returns table (id uuid, ticket_no text, party_size smallint, status queue_status, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select id, ticket_no, party_size, status, created_at
    from queue_tickets
   where service_date = (now() at time zone 'Asia/Bangkok')::date
     and status in ('waiting','called')
   order by created_at;
$$;

create or replace function public.staff_dashboard()
returns table (
  waiting_queue bigint, free_tables bigint, dining_visits bigint,
  pending_items bigint, open_calls bigint, sales_today numeric
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'เฉพาะพนักงานเท่านั้น'; end if;
  return query select
    (select count(*) from queue_tickets
      where status = 'waiting'
        and service_date = (now() at time zone 'Asia/Bangkok')::date),
    (select count(*) from dining_tables where status = 'available' and is_active),
    (select count(*) from visits where status = 'open'),
    (select count(*) from order_items where status in ('pending','accepted','preparing','ready')),
    (select count(*) from service_calls where status in ('open','accepted')),
    (select coalesce(sum(total), 0) from bills
      where status = 'paid'
        and issued_at >= date_trunc('day', now() at time zone 'Asia/Bangkok'));
end $$;

revoke all on function public.handle_new_user()  from anon, authenticated;
revoke all on function public.next_ticket_no()   from anon, authenticated;
revoke all on function public.next_visit_code()  from anon, authenticated;

revoke all on function public.join_visit(text)                              from anon;
revoke all on function public.place_order(uuid, jsonb, text)                from anon;
revoke all on function public.call_staff(uuid, service_call_type, text)     from anon;
revoke all on function public.open_visit(uuid, uuid, int, int, uuid)        from anon;
revoke all on function public.close_visit(uuid)                             from anon;
revoke all on function public.set_order_item_status(uuid, order_status)     from anon;
revoke all on function public.issue_bill(uuid)                              from anon;
revoke all on function public.pay_bill(uuid, payment_method, numeric, text) from anon;
revoke all on function public.staff_dashboard()                             from anon;

-- ลูกค้าที่ยังไม่ login ต้องกดรับคิวและดูบอร์ดคิวได้
grant execute on function public.take_queue_ticket(int, text, text) to anon, authenticated;
grant execute on function public.queue_ticket_by_token(text)        to anon, authenticated;
grant execute on function public.queue_board()                      to anon, authenticated;

-- my_role / is_staff / is_manager / has_visit_access ต้องคง execute ไว้ทั้ง anon และ authenticated
-- เพราะ RLS policy เรียกใช้ และ policy ถูกประเมินด้วยสิทธิ์ของ role ที่ query เข้ามา
