-- ============================================================
-- หมากระทุปุ๊ป๊ะ — Helpers, RPC, RLS, Realtime
-- ============================================================

-- ===== HELPERS =====
-- security definer ทั้งหมด เพื่อไม่ให้ RLS ของ profiles วนกลับมาเรียกตัวเอง

create or replace function public.my_role() returns app_role
language sql stable security definer set search_path = public as $$
  select coalesce((select role from profiles where id = auth.uid()), 'customer'::app_role);
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role() in ('kitchen','staff','cashier','manager','owner');
$$;

create or replace function public.is_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role() in ('manager','owner');
$$;

-- ลูกค้าเข้าถึง visit ได้ก็ต่อเมื่อเคยสแกน QR ของ visit นั้น
create or replace function public.has_visit_access(p_visit uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_staff()
      or exists (select 1 from visit_guests where visit_id = p_visit and guest_id = auth.uid());
$$;

-- สร้าง profile อัตโนมัติทุกครั้งที่มี user ใหม่ (รวม anonymous)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, phone)
  values (new.id, new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'phone')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===== เลขที่เอกสาร =====

create or replace function public.next_ticket_no() returns text
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select count(*) + 1 into n
    from queue_tickets
   where service_date = (now() at time zone 'Asia/Bangkok')::date;
  return 'A' || lpad(n::text, 3, '0');
end $$;

create or replace function public.next_visit_code() returns text
language plpgsql security definer set search_path = public as $$
declare
  d text := to_char(now() at time zone 'Asia/Bangkok', 'YYYYMMDD');
  n int;
begin
  select count(*) + 1 into n from visits where code like 'V' || d || '%';
  return 'V' || d || lpad(n::text, 3, '0');
end $$;

-- ===== QUEUE =====

-- ลูกค้ารับคิวได้โดยยังไม่ต้อง login — คืน claim_token ไว้ใช้เปิดดูคิวตัวเองทีหลัง
create or replace function public.take_queue_ticket(
  p_party_size int,
  p_name text default null,
  p_phone text default null
) returns queue_tickets
language plpgsql security definer set search_path = public as $$
declare t queue_tickets;
begin
  if p_party_size < 1 or p_party_size > 30 then
    raise exception 'จำนวนคนต้องอยู่ระหว่าง 1-30';
  end if;

  -- กันเลขคิวชนกันเมื่อมีคนกดพร้อมกัน
  perform pg_advisory_xact_lock(hashtext('queue_ticket'));

  insert into queue_tickets (ticket_no, party_size, contact_name, contact_phone)
  values (public.next_ticket_no(), p_party_size, nullif(p_name, ''), nullif(p_phone, ''))
  returning * into t;

  return t;
end $$;

-- เปิดดูคิวตัวเองด้วย token ที่ได้ตอนกดรับคิว
create or replace function public.queue_ticket_by_token(p_token text)
returns table (
  id uuid, ticket_no text, party_size smallint, status queue_status,
  created_at timestamptz, called_at timestamptz, ahead_count bigint
)
language sql stable security definer set search_path = public as $$
  select t.id, t.ticket_no, t.party_size, t.status, t.created_at, t.called_at,
         (select count(*) from queue_tickets q
           where q.service_date = t.service_date
             and q.status = 'waiting'
             and q.created_at < t.created_at) as ahead_count
    from queue_tickets t
   where t.claim_token = p_token;
$$;

-- ===== VISIT =====

-- พนักงานเรียกคิว → เลือกโต๊ะ → เปิด Visit → ได้ access_token ไว้ทำ QR
create or replace function public.open_visit(
  p_table_id uuid,
  p_package_id uuid,
  p_adults int,
  p_children int default 0,
  p_ticket_id uuid default null
) returns visits
language plpgsql security definer set search_path = public as $$
declare
  v visits;
  pkg buffet_packages;
begin
  if not public.is_staff() then
    raise exception 'เฉพาะพนักงานเท่านั้น';
  end if;

  select * into pkg from buffet_packages where id = p_package_id and is_active;
  if not found then raise exception 'ไม่พบแพ็กเกจที่เลือก'; end if;

  -- ล็อกแถวโต๊ะไว้ กันพนักงานสองคนเปิดโต๊ะเดียวกันพร้อมกัน
  perform 1 from dining_tables where id = p_table_id for update;
  if not exists (select 1 from dining_tables where id = p_table_id and status = 'available') then
    raise exception 'โต๊ะนี้ไม่ว่าง';
  end if;

  insert into visits (code, table_id, queue_ticket_id, package_id, adults, children,
                      expires_at, opened_by)
  values (public.next_visit_code(), p_table_id, p_ticket_id, p_package_id,
          p_adults, p_children, now() + make_interval(mins => pkg.minutes), auth.uid())
  returning * into v;

  update dining_tables set status = 'occupied', updated_at = now() where id = p_table_id;

  if p_ticket_id is not null then
    update queue_tickets set status = 'seated', seated_at = now() where id = p_ticket_id;
  end if;

  insert into audit_logs (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'open_visit', 'visits', v.id::text, to_jsonb(v));

  return v;
end $$;

-- ลูกค้าสแกน QR แล้วเรียกอันนี้ — ผูก user ปัจจุบันเข้ากับ visit
create or replace function public.join_visit(p_token text) returns visits
language plpgsql security definer set search_path = public as $$
declare v visits;
begin
  if auth.uid() is null then
    raise exception 'ต้องมี session ก่อนเข้าร่วม visit';
  end if;

  select * into v from visits where access_token = p_token and status in ('open','billing');
  if not found then raise exception 'QR ไม่ถูกต้องหรือโต๊ะนี้ปิดแล้ว'; end if;

  insert into visit_guests (visit_id, guest_id) values (v.id, auth.uid())
  on conflict do nothing;

  return v;
end $$;

create or replace function public.close_visit(p_visit_id uuid) returns visits
language plpgsql security definer set search_path = public as $$
declare v visits;
begin
  if not public.is_staff() then raise exception 'เฉพาะพนักงานเท่านั้น'; end if;

  update visits
     set status = 'closed', closed_at = now(), closed_by = auth.uid()
   where id = p_visit_id
   returning * into v;
  if not found then raise exception 'ไม่พบ visit'; end if;

  update dining_tables set status = 'cleaning', updated_at = now() where id = v.table_id;

  insert into audit_logs (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'close_visit', 'visits', v.id::text, to_jsonb(v));

  return v;
end $$;

-- ===== ORDER =====

-- p_items รูปแบบ: [{"menu_item_id":"...","qty":2,"note":"ไม่ใส่ผัก"}]
create or replace function public.place_order(p_visit_id uuid, p_items jsonb, p_note text default null)
returns orders
language plpgsql security definer set search_path = public as $$
declare
  o orders;
  v visits;
  it jsonb;
  m menu_items;
  q int;
  next_round int;
begin
  if not public.has_visit_access(p_visit_id) then
    raise exception 'ไม่มีสิทธิ์สั่งอาหารให้โต๊ะนี้';
  end if;

  select * into v from visits where id = p_visit_id;
  if v.status <> 'open' then raise exception 'โต๊ะนี้ปิดการสั่งแล้ว'; end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'ยังไม่ได้เลือกอาหาร'; end if;

  select coalesce(max(round_no), 0) + 1 into next_round from orders where visit_id = p_visit_id;

  insert into orders (visit_id, round_no, note, placed_by)
  values (p_visit_id, next_round, nullif(p_note, ''), auth.uid())
  returning * into o;

  for it in select * from jsonb_array_elements(p_items) loop
    select * into m from menu_items where id = (it->>'menu_item_id')::uuid and is_available;
    if not found then raise exception 'เมนูบางรายการไม่พร้อมขาย'; end if;

    q := coalesce((it->>'qty')::int, 1);
    if q < 1 then raise exception 'จำนวนไม่ถูกต้อง'; end if;
    if m.max_per_order is not null and q > m.max_per_order then
      raise exception '% สั่งได้สูงสุด % ต่อครั้ง', m.name, m.max_per_order;
    end if;

    insert into order_items (order_id, menu_item_id, name_snapshot, unit_price, qty, station, note)
    values (o.id, m.id, m.name, m.price, q, m.station, nullif(it->>'note', ''));
  end loop;

  return o;
end $$;

-- ครัวกดเลื่อนสถานะทีละรายการ แล้วสถานะของ order จะถูกสรุปตามรายการที่ช้าที่สุด
create or replace function public.set_order_item_status(p_item_id uuid, p_status order_status)
returns order_items
language plpgsql security definer set search_path = public as $$
declare i order_items;
begin
  if not public.is_staff() then raise exception 'เฉพาะพนักงานเท่านั้น'; end if;

  update order_items set status = p_status, updated_at = now()
   where id = p_item_id returning * into i;
  if not found then raise exception 'ไม่พบรายการอาหาร'; end if;

  update orders o
     set status = sub.rolled_up, updated_at = now()
    from (
      select order_id,
             case
               when bool_and(status = 'cancelled')                     then 'cancelled'
               when bool_and(status in ('served','cancelled'))         then 'served'
               when bool_and(status in ('ready','served','cancelled')) then 'ready'
               when bool_or(status = 'preparing')                      then 'preparing'
               when bool_or(status = 'accepted')                       then 'accepted'
               else 'pending'
             end::order_status as rolled_up
        from order_items where order_id = i.order_id group by order_id
    ) sub
   where o.id = sub.order_id;

  return i;
end $$;

-- ===== SERVICE CALL =====

create or replace function public.call_staff(
  p_visit_id uuid,
  p_type service_call_type default 'staff',
  p_note text default null
) returns service_calls
language plpgsql security definer set search_path = public as $$
declare c service_calls; v visits;
begin
  if not public.has_visit_access(p_visit_id) then
    raise exception 'ไม่มีสิทธิ์เรียกพนักงานให้โต๊ะนี้';
  end if;

  select * into v from visits where id = p_visit_id;

  -- กันกดรัว: ถ้ายังมีคำขอประเภทเดิมค้างอยู่ ให้คืนอันเดิมแทนการสร้างใหม่
  select * into c from service_calls
   where visit_id = p_visit_id and type = p_type and status in ('open','accepted')
   limit 1;
  if found then return c; end if;

  insert into service_calls (visit_id, table_id, type, note)
  values (p_visit_id, v.table_id, p_type, nullif(p_note, ''))
  returning * into c;

  return c;
end $$;

-- ===== BILL / PAYMENT =====

-- คิดเงิน = ค่าบุฟเฟต์ตามหัว + รายการที่ไม่ได้รวมในแพ็กเกจ
create or replace function public.issue_bill(p_visit_id uuid) returns bills
language plpgsql security definer set search_path = public as $$
declare
  b bills; v visits; pkg buffet_packages;
  buffet_total numeric(12,2);
  extra_total numeric(12,2);
  sub numeric(12,2);
begin
  if not public.is_staff() then raise exception 'เฉพาะพนักงานเท่านั้น'; end if;

  select * into v from visits where id = p_visit_id;
  if not found then raise exception 'ไม่พบ visit'; end if;

  select * into pkg from buffet_packages where id = v.package_id;
  buffet_total := coalesce(pkg.price_adult, 0) * v.adults
                + coalesce(pkg.price_child, 0) * v.children;

  select coalesce(sum(oi.unit_price * oi.qty), 0) into extra_total
    from order_items oi join orders o on o.id = oi.order_id
   where o.visit_id = p_visit_id and oi.status <> 'cancelled';

  sub := buffet_total + extra_total;

  insert into bills (visit_id, subtotal, total, issued_by)
  values (p_visit_id, sub, sub, auth.uid())
  on conflict (visit_id) do update
    set subtotal = excluded.subtotal,
        total    = excluded.subtotal - bills.discount,
        issued_at = now()
  returning * into b;

  update visits set status = 'billing' where id = p_visit_id and status = 'open';
  update dining_tables set status = 'billing', updated_at = now() where id = v.table_id;

  return b;
end $$;

create or replace function public.pay_bill(
  p_bill_id uuid,
  p_method payment_method,
  p_amount numeric,
  p_ref text default null
) returns payments
language plpgsql security definer set search_path = public as $$
declare p payments; b bills; v visits;
begin
  if not public.is_staff() then raise exception 'เฉพาะพนักงานเท่านั้น'; end if;

  select * into b from bills where id = p_bill_id;
  if not found then raise exception 'ไม่พบบิล'; end if;

  insert into payments (bill_id, method, amount, status, ref_no, paid_at, received_by)
  values (p_bill_id, p_method, p_amount, 'paid', nullif(p_ref, ''), now(), auth.uid())
  returning * into p;

  update bills set status = 'paid' where id = p_bill_id;
  update visits set status = 'paid' where id = b.visit_id returning * into v;

  -- สะสมแต้ม 1 แต้มต่อ 100 บาท เฉพาะ visit ที่ผูกกับสมาชิก
  if v.member_id is not null then
    insert into point_transactions (profile_id, visit_id, points, kind)
    values (v.member_id, v.id, floor(b.total / 100)::int, 'earn');
    update profiles
       set points = points + floor(b.total / 100)::int,
           total_spent = total_spent + b.total
     where id = v.member_id;
  end if;

  insert into audit_logs (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'pay_bill', 'bills', b.id::text, to_jsonb(p));

  return p;
end $$;

-- ===== VIEWS =====

-- บอร์ดคิวหน้าร้าน — ไม่มีเบอร์โทรหรือชื่อ จึงเปิดให้ดูได้โดยไม่ต้อง login
create view public.queue_board as
  select id, ticket_no, party_size, status, created_at, called_at
    from queue_tickets
   where service_date = (now() at time zone 'Asia/Bangkok')::date
     and status in ('waiting','called')
   order by created_at;

-- ตัวเลขบนแดชบอร์ดพนักงาน
create view public.staff_dashboard as
  select
    (select count(*) from queue_tickets
      where status = 'waiting'
        and service_date = (now() at time zone 'Asia/Bangkok')::date) as waiting_queue,
    (select count(*) from dining_tables where status = 'available' and is_active) as free_tables,
    (select count(*) from visits where status = 'open')                as dining_visits,
    (select count(*) from order_items where status in ('pending','accepted','preparing','ready')) as pending_items,
    (select count(*) from service_calls where status in ('open','accepted')) as open_calls,
    (select coalesce(sum(total), 0) from bills
      where status = 'paid'
        and issued_at >= date_trunc('day', now() at time zone 'Asia/Bangkok')) as sales_today;

grant select on public.queue_board, public.staff_dashboard to anon, authenticated;

-- ===== RLS =====

alter table profiles           enable row level security;
alter table dining_tables      enable row level security;
alter table buffet_packages    enable row level security;
alter table menu_categories    enable row level security;
alter table menu_items         enable row level security;
alter table package_items      enable row level security;
alter table queue_tickets      enable row level security;
alter table visits             enable row level security;
alter table visit_guests       enable row level security;
alter table orders             enable row level security;
alter table order_items        enable row level security;
alter table service_calls      enable row level security;
alter table promotions         enable row level security;
alter table bills              enable row level security;
alter table payments           enable row level security;
alter table point_transactions enable row level security;
alter table audit_logs         enable row level security;

-- profiles
create policy profiles_select on profiles for select using (id = auth.uid() or public.is_staff());
create policy profiles_update_self on profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_manage on profiles for all using (public.is_manager()) with check (public.is_manager());

-- ข้อมูลร้านที่ลูกค้าต้องเห็นก่อน login
create policy tables_read     on dining_tables   for select using (true);
create policy tables_manage   on dining_tables   for all using (public.is_staff()) with check (public.is_staff());
create policy packages_read   on buffet_packages for select using (true);
create policy packages_manage on buffet_packages for all using (public.is_manager()) with check (public.is_manager());
create policy cats_read       on menu_categories for select using (true);
create policy cats_manage     on menu_categories for all using (public.is_manager()) with check (public.is_manager());
create policy items_read      on menu_items      for select using (true);
create policy items_manage    on menu_items      for all using (public.is_manager()) with check (public.is_manager());
create policy pkgitems_read   on package_items   for select using (true);
create policy pkgitems_manage on package_items   for all using (public.is_manager()) with check (public.is_manager());
create policy promos_read     on promotions      for select using (is_active);
create policy promos_manage   on promotions      for all using (public.is_manager()) with check (public.is_manager());

-- queue: ลูกค้าดูคิวตัวเองผ่าน RPC เท่านั้น (ตารางนี้มีเบอร์โทร) ส่วนบอร์ดรวมใช้ view
create policy queue_staff on queue_tickets for all using (public.is_staff()) with check (public.is_staff());

-- visit และทุกอย่างที่ห้อยอยู่กับมัน
create policy visits_read   on visits       for select using (public.has_visit_access(id));
create policy visits_write  on visits       for all    using (public.is_staff()) with check (public.is_staff());
create policy guests_read   on visit_guests for select using (guest_id = auth.uid() or public.is_staff());
create policy orders_read   on orders       for select using (public.has_visit_access(visit_id));
create policy orders_write  on orders       for all    using (public.is_staff()) with check (public.is_staff());
create policy oitems_read   on order_items  for select using (
  exists (select 1 from orders o where o.id = order_id and public.has_visit_access(o.visit_id))
);
create policy oitems_write  on order_items  for all using (public.is_staff()) with check (public.is_staff());
create policy calls_read    on service_calls for select using (public.has_visit_access(visit_id));
create policy calls_write   on service_calls for all    using (public.is_staff()) with check (public.is_staff());
create policy bills_read    on bills        for select using (public.has_visit_access(visit_id));
create policy bills_write   on bills        for all    using (public.is_staff()) with check (public.is_staff());
create policy payments_read on payments     for select using (
  exists (select 1 from bills b where b.id = bill_id and public.has_visit_access(b.visit_id))
);
create policy payments_write on payments    for all using (public.is_staff()) with check (public.is_staff());
create policy points_read   on point_transactions for select using (profile_id = auth.uid() or public.is_staff());
create policy audit_read    on audit_logs   for select using (public.is_manager());

-- ===== REALTIME =====
alter publication supabase_realtime add table queue_tickets;
alter publication supabase_realtime add table dining_tables;
alter publication supabase_realtime add table visits;
alter publication supabase_realtime add table orders;
alter publication supabase_realtime add table order_items;
alter publication supabase_realtime add table service_calls;
alter publication supabase_realtime add table bills;
