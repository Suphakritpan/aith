-- 0012_app_rpc_and_realtime.sql
-- RPC ที่แอปเรียกใช้ และการเปิด Realtime
-- อ้างอิง: Read/System Design.md §02, §04, §09
--
-- ไฟล์นี้กู้กลับมาจาก migration ที่ลงฐานข้อมูลไปแล้ว (version 20260907123643)
-- เนื้อหาตรงกับสิ่งที่รันจริงบนโปรเจกต์ เพื่อให้ checkout ใหม่ push แล้วได้สคีมาเดียวกัน
--
-- ข้อสังเกตสำคัญสำหรับผู้เรียก: fn_open_visit อ่านสาขาและรหัสพนักงานจาก auth.uid()
-- ผ่าน fn_my_branch_id() / fn_my_staff_id() จึงต้องเรียกในนามผู้ใช้ที่ล็อกอิน
-- ถ้าเรียกด้วย service role auth.uid() จะเป็น null และเปิดโต๊ะไม่สำเร็จ

create or replace function fn_price_for(p_package_id uuid, p_tier pax_tier)
returns numeric
language sql stable set search_path = public as $$
  select price from package_price
   where package_id = p_package_id and tier = p_tier and effective_from <= current_date
   order by effective_from desc limit 1;
$$;

create or replace function fn_take_queue_ticket(
  p_branch_id  uuid,
  p_party_size int,
  p_phone      text default null
) returns queue_ticket
language plpgsql security definer set search_path = public as $$
declare
  v_lane   queue_lane;
  v_seq    int;
  v_ticket queue_ticket;
begin
  if p_party_size < 1 or p_party_size > 20 then
    raise exception 'จำนวนคนต้องอยู่ระหว่าง 1 ถึง 20' using errcode = 'check_violation';
  end if;

  v_lane := fn_lane_for_party(p_party_size);

  perform 1 from queue_ticket
   where branch_id = p_branch_id and service_date = current_date and lane = v_lane
   for update;

  select coalesce(max(seq_no), 0) + 1 into v_seq
    from queue_ticket
   where branch_id = p_branch_id and service_date = current_date and lane = v_lane;

  insert into queue_ticket (branch_id, lane, seq_no, party_size, phone)
  values (p_branch_id, v_lane, v_seq, p_party_size, nullif(p_phone, ''))
  returning * into v_ticket;

  return v_ticket;
end $$;

create or replace function fn_open_visit(
  p_queue_ticket_id uuid,
  p_table_ids       uuid[],
  p_adult           int,
  p_child           int default 0,
  p_toddler_free    int default 0,
  p_addon_qty       int default 0
) returns table (visit_id uuid, qr_token text)
language plpgsql security definer set search_path = public as $$
declare
  v_branch  uuid := fn_my_branch_id();
  v_staff   uuid := fn_my_staff_id();
  v_package package%rowtype;
  v_visit   visit%rowtype;
  v_addon   addon%rowtype;
  v_token   text;
  v_table   uuid;
  v_seats   int;
  v_pax     int := p_adult + p_child + p_toddler_free;
begin
  if not fn_has_role('STAFF') then
    raise exception 'ต้องเป็นพนักงานจึงจะเปิดโต๊ะได้' using errcode = 'insufficient_privilege';
  end if;

  if v_pax < 1 or p_adult < 0 or p_child < 0 or p_toddler_free < 0 then
    raise exception 'จำนวนคนไม่ถูกต้อง' using errcode = 'check_violation';
  end if;

  if p_table_ids is null or array_length(p_table_ids, 1) is null then
    raise exception 'ต้องเลือกโต๊ะอย่างน้อยหนึ่งโต๊ะ' using errcode = 'check_violation';
  end if;

  select * into v_package
    from package
   where branch_id = v_branch and is_active and deleted_at is null
   order by created_at limit 1;

  if v_package.package_id is null then
    raise exception 'สาขานี้ยังไม่มีแพ็กเกจที่เปิดใช้งาน' using errcode = 'check_violation';
  end if;

  select coalesce(sum(seat_capacity), 0) into v_seats
    from (
      select seat_capacity from dining_table
       where table_id = any(p_table_ids)
         and branch_id = v_branch
         and deleted_at is null
         and status = 'AVAILABLE'
       for update
    ) as available;

  if v_seats = 0 then
    raise exception 'โต๊ะที่เลือกไม่ว่างแล้ว' using errcode = 'check_violation';
  end if;

  insert into visit (branch_id, queue_ticket_id, package_id, status, duration_minutes)
  values (v_branch, p_queue_ticket_id, v_package.package_id, 'SEATED', v_package.duration_minutes)
  returning * into v_visit;

  foreach v_table in array p_table_ids loop
    insert into visit_table (visit_id, table_id) values (v_visit.visit_id, v_table);
    update dining_table set status = 'OCCUPIED' where table_id = v_table;
  end loop;

  insert into visit_pax (visit_id, tier, qty, unit_price, height_verified_by)
  select v_visit.visit_id, t.tier, t.qty, fn_price_for(v_package.package_id, t.tier),
         case when t.tier = 'TODDLER_FREE' then v_staff end
    from (values
      ('ADULT'::pax_tier, p_adult),
      ('CHILD'::pax_tier, p_child),
      ('TODDLER_FREE'::pax_tier, p_toddler_free)
    ) as t(tier, qty)
   where t.qty > 0;

  if p_addon_qty > 0 then
    select * into v_addon
      from addon
     where branch_id = v_branch and is_active and deleted_at is null
     order by name limit 1;

    if v_addon.addon_id is not null then
      insert into visit_addon (visit_id, addon_id, qty, unit_price)
      values (v_visit.visit_id, v_addon.addon_id, p_addon_qty, v_addon.price);
    end if;
  end if;

  insert into qr_session (visit_id) values (v_visit.visit_id) returning token into v_token;

  if p_queue_ticket_id is not null then
    update queue_ticket set status = 'SEATED' where queue_ticket_id = p_queue_ticket_id;
  end if;

  return query select v_visit.visit_id, v_token;
end $$;

create or replace function fn_close_visit(p_visit_id uuid) returns visit
language plpgsql set search_path = public as $$
declare v_visit visit%rowtype;
begin
  update visit set status = 'PAID'
   where visit_id = p_visit_id and status = 'BILL_REQUESTED' and deleted_at is null;

  update visit set status = 'CLOSED'
   where visit_id = p_visit_id and status = 'PAID' and deleted_at is null
  returning * into v_visit;

  if v_visit.visit_id is null then
    raise exception 'ปิดโต๊ะไม่ได้: ต้องออกบิลและชำระให้ครบก่อน' using errcode = 'check_violation';
  end if;

  return v_visit;
end $$;

create or replace function fn_guard_visit_access(p_visit_id uuid) returns void
language plpgsql stable set search_path = public as $$
begin
  if auth.uid() is not null and not fn_visit_in_my_branch(p_visit_id) then
    raise exception 'ไม่มีสิทธิ์เข้าถึง Visit นี้' using errcode = 'insufficient_privilege';
  end if;
end $$;

create or replace function fn_issue_bill(
  p_visit_id   uuid,
  p_split_mode split_mode default 'EQUAL_PER_HEAD',
  p_discount   numeric default 0
) returns bill
language plpgsql security definer set search_path = public as $$
declare
  v_calc record;
  v_bill bill;
  v_pending int;
begin
  perform fn_guard_visit_access(p_visit_id);

  select count(*) into v_pending
    from order_item oi
    join order_batch ob on ob.order_batch_id = oi.order_batch_id
   where ob.visit_id = p_visit_id
     and ob.deleted_at is null and oi.deleted_at is null
     and oi.status = 'PENDING';

  if v_pending > 0 then
    raise exception 'มีรายการค้างยืนยัน % รายการ ขอเช็กบิลไม่ได้', v_pending
      using errcode = 'check_violation';
  end if;

  update visit
     set status = 'BILL_REQUESTED',
         bill_requested_at = coalesce(bill_requested_at, now())
   where visit_id = p_visit_id and deleted_at is null;

  select * into v_calc from fn_calc_bill(p_visit_id);

  insert into bill (visit_id, package_subtotal, addon_subtotal, overtime_rounds,
                    overtime_subtotal, discount_amount, net_total, split_mode)
  values (p_visit_id, v_calc.package_subtotal, v_calc.addon_subtotal,
          v_calc.overtime_rounds, v_calc.overtime_subtotal, p_discount,
          greatest(0, v_calc.net_total - p_discount), p_split_mode)
  on conflict (visit_id) do update
     set package_subtotal  = excluded.package_subtotal,
         addon_subtotal    = excluded.addon_subtotal,
         overtime_rounds   = excluded.overtime_rounds,
         overtime_subtotal = excluded.overtime_subtotal,
         discount_amount   = excluded.discount_amount,
         net_total         = excluded.net_total,
         split_mode        = excluded.split_mode,
         deleted_at        = null
  returning * into v_bill;

  return v_bill;
end $$;

-- Realtime ตาม §02 — เขียนเป็นลูปที่ตรวจก่อนเพิ่ม เพื่อให้รันซ้ำได้โดยไม่พัง
do $$
declare t text;
begin
  foreach t in array array['visit', 'order_item', 'service_call', 'queue_ticket',
                           'dining_table', 'menu_item']
  loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ลูกค้าที่ไม่ล็อกอินเรียก RPC เหล่านี้ตรงไม่ได้ ต้องผ่าน Edge Function เท่านั้น (ADR-06)
revoke all on function fn_price_for(uuid, pax_tier)                    from anon;
revoke all on function fn_take_queue_ticket(uuid, int, text)           from anon;
revoke all on function fn_open_visit(uuid, uuid[], int, int, int, int) from anon;
revoke all on function fn_close_visit(uuid)                            from anon;
revoke all on function fn_guard_visit_access(uuid)                     from anon;
revoke all on function fn_issue_bill(uuid, split_mode, numeric)        from anon;
