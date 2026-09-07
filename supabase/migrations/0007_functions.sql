-- 0007_functions.sql
-- ฟังก์ชันกลาง: ตัวตนผู้ใช้ นาฬิกา Visit และเครื่องคิดเงิน
-- อ้างอิง: Read/System Design.md §08 ข้อ 6-7, §10
--
-- ทุกฟังก์ชันที่ RLS เรียกใช้เป็น security definer และตั้ง search_path ตายตัว
-- เพื่อไม่ให้ผู้ใช้สร้าง schema บังหน้าแล้วสลับความหมายของตารางได้

-- ── ตัวตนของผู้ใช้ที่ล็อกอิน ────────────────────────────────────────────────

create or replace function fn_my_staff_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select staff_id from staff
   where auth_user_id = auth.uid() and is_active and deleted_at is null
   limit 1;
$$;

create or replace function fn_my_role() returns text
  language sql stable security definer set search_path = public as $$
  select role::text from staff
   where auth_user_id = auth.uid() and is_active and deleted_at is null
   limit 1;
$$;

create or replace function fn_my_branch_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select branch_id from staff
   where auth_user_id = auth.uid() and is_active and deleted_at is null
   limit 1;
$$;

-- STAFF < SUPERVISOR < OWNER — ใช้เทียบสิทธิ์ขั้นต่ำแทนการไล่ลิสต์ทุกที่
create or replace function fn_role_rank(p_role text) returns int
  language sql immutable as $$
  select case p_role
           when 'STAFF' then 1
           when 'SUPERVISOR' then 2
           when 'OWNER' then 3
           else 0
         end;
$$;

create or replace function fn_has_role(p_min text) returns boolean
  language sql stable security definer set search_path = public as $$
  select fn_role_rank(fn_my_role()) >= fn_role_rank(p_min);
$$;

-- ── นาฬิกาของ Visit (BR-04) ────────────────────────────────────────────────
-- นาฬิกาเดียวต่อ Visit จับจาก seated_at เท่านั้น
-- คนที่มาเพิ่มกลางมื้อและโต๊ะที่กดเพิ่มภายหลังใช้ค่านี้ร่วมกัน

create or replace function fn_elapsed_minutes(p_visit_id uuid) returns int
  language sql stable set search_path = public as $$
  select ceil(extract(epoch from (now() - seated_at)) / 60)::int
    from visit where visit_id = p_visit_id;
$$;

-- ── เครื่องคิดเงิน (§10) ────────────────────────────────────────────────────
-- ยอดบิลมาจากสามองค์ประกอบเท่านั้น: ค่าแพ็กเกจตามหัว · add-on · ค่าเกินเวลา
-- ค่าเกินเวลาคิดต่อ Visit ตาม BR-08 แล้วจึงรวมยอดที่ชั้น bill_group

create or replace function fn_calc_bill(p_visit_id uuid)
returns table (
  package_subtotal  numeric,
  addon_subtotal    numeric,
  overtime_rounds   int,
  overtime_subtotal numeric,
  net_total         numeric
)
language plpgsql stable set search_path = public as $$
declare
  v_elapsed int;
  v_duration int;
  v_round_total numeric(10,2);
  v_addon numeric(10,2);
  v_extra int;
begin
  select duration_minutes,
         ceil(extract(epoch from (coalesce(bill_requested_at, now()) - seated_at)) / 60)::int
    into v_duration, v_elapsed
    from visit
   where visit_id = p_visit_id and deleted_at is null;

  if v_duration is null then
    raise exception 'ไม่พบ Visit %', p_visit_id;
  end if;

  -- ค่าแพ็กเกจหนึ่งรอบ (TODDLER_FREE มี unit_price = 0 จึงไม่กระทบ)
  select coalesce(sum(qty * unit_price), 0) into v_round_total
    from visit_pax where visit_id = p_visit_id;

  -- add-on คิดครั้งเดียวต่อ Visit ไม่คิดซ้ำเมื่อต่อรอบ
  select coalesce(sum(qty * unit_price), 0) into v_addon
    from visit_addon where visit_id = p_visit_id;

  -- เกินเวลา = คิดเต็มรอบใหม่ ไม่มี grace period (BR-05)
  v_extra := greatest(0, ceil((v_elapsed - v_duration)::numeric / v_duration)::int);

  return query select
    v_round_total,
    v_addon,
    v_extra,
    v_round_total * v_extra,
    v_round_total * (1 + v_extra) + v_addon;
end $$;

-- จำนวนหัวที่จ่ายเงิน = ADULT + CHILD (เด็กเล็กฟรีไม่นับ) ใช้หารบิลตามหัว
create or replace function fn_paying_pax(p_visit_id uuid) returns int
  language sql stable set search_path = public as $$
  select coalesce(sum(qty), 0)::int
    from visit_pax
   where visit_id = p_visit_id and tier <> 'TODDLER_FREE';
$$;

-- ── ออกบิล: ล็อกออเดอร์แล้ว snapshot ยอดลงตาราง bill ───────────────────────
-- เรียกจาก Edge Function POST /visits/:id/bill เท่านั้น

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
  -- ไม่มีรายการค้างสถานะ PENDING ที่ยังไม่ยืนยัน (guard ของ DINING → BILL_REQUESTED)
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

-- ── คิว: เลือกช่องตามขนาดกลุ่ม และออกเลขคิวรายวัน ─────────────────────────

create or replace function fn_lane_for_party(p_party_size int) returns queue_lane
  language sql immutable as $$
  select case
           when p_party_size <= 2 then 'A'::queue_lane
           when p_party_size <= 4 then 'B'::queue_lane
           else 'C'::queue_lane
         end;
$$;

-- เวลารอโดยประมาณ: จำนวนคิวที่รออยู่ในช่องเดียวกัน
-- คูณเวลาเฉลี่ยต่อรอบของโต๊ะขนาดนั้นในสามสิบวันหลัง (§04 ขั้นที่ 02)
create or replace function fn_estimated_wait_minutes(
  p_branch_id uuid,
  p_lane      queue_lane
) returns int
language sql stable set search_path = public as $$
  with ahead as (
    select count(*)::int as n
      from queue_ticket
     where branch_id = p_branch_id
       and service_date = current_date
       and lane = p_lane
       and status = 'WAITING'
       and deleted_at is null
  ),
  avg_turn as (
    select coalesce(
             avg(extract(epoch from (v.closed_at - v.seated_at)) / 60),
             90
           )::numeric as m
      from visit v
      join queue_ticket q on q.queue_ticket_id = v.queue_ticket_id
     where v.branch_id = p_branch_id
       and v.closed_at is not null
       and v.closed_at > now() - interval '30 days'
       and q.lane = p_lane
       and v.deleted_at is null
  )
  select ceil((select n from ahead) * (select m from avg_turn))::int;
$$;

-- ตัด NO_SHOW เมื่อเรียกครบ 3 ครั้ง และครั้งสุดท้ายผ่านไปเกิน 2 นาที (BR-09)
create or replace function fn_sweep_no_show() returns int
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  with done as (
    select q.queue_ticket_id
      from queue_ticket q
      join queue_call c on c.queue_ticket_id = q.queue_ticket_id
     where q.status = 'CALLED' and q.deleted_at is null
     group by q.queue_ticket_id
    having count(*) >= 3 and max(c.called_at) < now() - interval '2 minutes'
  )
  update queue_ticket q
     set status = 'NO_SHOW'
    from done
   where q.queue_ticket_id = done.queue_ticket_id;

  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- สร้าง service_call ชนิด TIME_WARNING ที่นาทีที่ duration - 15 (BR-05)
create or replace function fn_sweep_time_warning() returns int
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  insert into service_call (visit_id, type, note)
  select v.visit_id, 'TIME_WARNING',
         'เหลือเวลาอีก ' || (v.duration_minutes - fn_elapsed_minutes(v.visit_id)) || ' นาที'
    from visit v
   where v.status in ('SEATED', 'DINING')
     and v.deleted_at is null
     and fn_elapsed_minutes(v.visit_id) >= v.duration_minutes - 15
  on conflict do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ลบเบอร์โทรของคิวที่ปิดโต๊ะเกิน 24 ชม. (§12 PDPA)
create or replace function fn_sweep_expired_phone() returns int
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  update queue_ticket q
     set phone = null
    from visit v
   where v.queue_ticket_id = q.queue_ticket_id
     and q.phone is not null
     and v.closed_at is not null
     and v.closed_at < now() - interval '24 hours';

  get diagnostics v_count = row_count;
  return v_count;
end $$;
