-- 0016_operations_extra.sql
-- งานที่ Edge Function เรียกใช้แต่ยังไม่มีในฐานข้อมูล
-- อ้างอิง: Read/System Design.md §04, §09, BR-03, BR-07, BR-09, BR-10
--
-- 0012 ครอบคลุมการรับคิว เปิดโต๊ะ ออกบิล และปิดโต๊ะไปแล้ว ไฟล์นี้เติมเฉพาะส่วนที่ขาด
-- และเขียนให้เข้ากับของเดิม — ใช้ fn_price_for และ fn_guard_visit_access ที่ 0012 วางไว้
-- ไม่สร้างฟังก์ชันชื่อซ้ำที่มีลายเซ็นต่างกัน เพราะจะทำให้การเรียกกำกวมและเลือกตัวผิด

-- ── เรียกคิว (BR-09) ───────────────────────────────────────────────────────
-- เรียกได้สูงสุด 3 ครั้ง ห่างกันครั้งละ 2 นาที ครบแล้ว fn_sweep_no_show ตัดเป็น NO_SHOW
-- เกณฑ์ทั้งสองอ่านจาก app_setting เพื่อให้ร้านปรับได้โดยไม่ต้องแก้โค้ด

create or replace function fn_call_queue_ticket(
  p_queue_ticket_id uuid,
  p_staff_id        uuid
) returns queue_call
language plpgsql security definer set search_path = public as $$
declare
  v_count  int;
  v_last   timestamptz;
  v_gap    int;
  v_max    int;
  v_row    queue_call;
  v_status queue_status;
begin
  select (value #>> '{}')::int into v_gap from app_setting where key = 'queue.call_interval_minutes';
  select (value #>> '{}')::int into v_max from app_setting where key = 'queue.max_calls';
  v_gap := coalesce(v_gap, 2);
  v_max := coalesce(v_max, 3);

  select status into v_status from queue_ticket
   where queue_ticket_id = p_queue_ticket_id and deleted_at is null
   for update;

  if v_status is null then
    raise exception 'ไม่พบคิวใบนี้' using errcode = 'check_violation';
  end if;
  if v_status not in ('WAITING', 'CALLED') then
    raise exception 'คิวใบนี้อยู่สถานะ % จึงเรียกไม่ได้', v_status using errcode = 'check_violation';
  end if;

  select count(*), max(called_at) into v_count, v_last
    from queue_call where queue_ticket_id = p_queue_ticket_id;

  if v_count >= v_max then
    raise exception 'เรียกครบ % ครั้งแล้ว', v_max using errcode = 'check_violation';
  end if;
  if v_last is not null and v_last > now() - make_interval(mins => v_gap) then
    raise exception 'เพิ่งเรียกไปเมื่อครู่ ต้องเว้นอย่างน้อย % นาที', v_gap
      using errcode = 'check_violation';
  end if;

  insert into queue_call (queue_ticket_id, called_by, call_no)
  values (p_queue_ticket_id, p_staff_id, v_count + 1)
  returning * into v_row;

  update queue_ticket set status = 'CALLED' where queue_ticket_id = p_queue_ticket_id;

  -- แจ้งเตือนเป็น mock: เขียนลงตารางอย่างเดียว ไม่ส่งออกจริง (§12)
  insert into notification_log (queue_ticket_id, channel, payload)
  select p_queue_ticket_id, 'SMS',
         jsonb_build_object('call_no', v_count + 1, 'phone', phone, 'template', 'queue_called')
    from queue_ticket where queue_ticket_id = p_queue_ticket_id and phone is not null;

  return v_row;
end $$;

-- ── กดเพิ่มโต๊ะบน Visit เดิม ────────────────────────────────────────────────
-- ไม่สร้าง Visit ใหม่ เพราะนาฬิกาและบิลต้องเป็นก้อนเดียวกัน (BR-04)

create or replace function fn_add_table_to_visit(
  p_visit_id uuid,
  p_table_id uuid
) returns visit_table
language plpgsql security definer set search_path = public as $$
declare
  v_status visit_status;
  v_tstat  table_status;
  v_row    visit_table;
begin
  perform fn_guard_visit_access(p_visit_id);

  select status into v_status from visit
   where visit_id = p_visit_id and deleted_at is null;
  if v_status is null then
    raise exception 'ไม่พบ Visit' using errcode = 'check_violation';
  end if;
  if v_status not in ('SEATED', 'DINING') then
    raise exception 'Visit อยู่สถานะ % จึงเพิ่มโต๊ะไม่ได้', v_status using errcode = 'check_violation';
  end if;

  select status into v_tstat from dining_table
   where table_id = p_table_id and deleted_at is null for update;
  if v_tstat is null then
    raise exception 'ไม่พบโต๊ะ' using errcode = 'check_violation';
  end if;
  if v_tstat <> 'AVAILABLE' then
    raise exception 'โต๊ะนี้ไม่ว่าง (สถานะ %)', v_tstat using errcode = 'check_violation';
  end if;

  insert into visit_table (visit_id, table_id) values (p_visit_id, p_table_id)
  returning * into v_row;
  update dining_table set status = 'OCCUPIED' where table_id = p_table_id;

  return v_row;
end $$;

-- ── เพิ่มจำนวนคนกลางมื้อ (BR-03) ───────────────────────────────────────────
-- trigger pax_no_decrease เป็นคนปฏิเสธการลดจำนวน ฟังก์ชันนี้แค่หาราคาให้ถูก tier
-- และตั้งใจไม่แตะ unit_price ของแถวเดิม เพราะราคาของ Visit นี้ถูก snapshot ไว้แล้ว

create or replace function fn_add_pax(
  p_visit_id uuid,
  p_tier     pax_tier,
  p_qty      int,
  p_staff_id uuid
) returns visit_pax
language plpgsql security definer set search_path = public as $$
declare
  v_package uuid;
  v_status  visit_status;
  v_price   numeric(10,2);
  v_row     visit_pax;
begin
  perform fn_guard_visit_access(p_visit_id);

  select package_id, status into v_package, v_status
    from visit where visit_id = p_visit_id and deleted_at is null;
  if v_package is null then
    raise exception 'ไม่พบ Visit' using errcode = 'check_violation';
  end if;
  if v_status not in ('SEATED', 'DINING') then
    raise exception 'Visit อยู่สถานะ % จึงเพิ่มคนไม่ได้', v_status using errcode = 'check_violation';
  end if;

  v_price := fn_price_for(v_package, p_tier);
  if v_price is null then
    raise exception 'ยังไม่ได้ตั้งราคาสำหรับ %', p_tier using errcode = 'check_violation';
  end if;

  insert into visit_pax (visit_id, tier, qty, unit_price, height_verified_by)
  values (p_visit_id, p_tier, p_qty, v_price,
          case when p_tier = 'TODDLER_FREE' then p_staff_id else null end)
  on conflict (visit_id, tier) do update
     set qty = visit_pax.qty + excluded.qty,
         height_verified_by = coalesce(visit_pax.height_verified_by, excluded.height_verified_by)
  returning * into v_row;

  return v_row;
end $$;

-- ── รวมบิลข้ามโต๊ะ (BR-07, ADR-05) ─────────────────────────────────────────
-- trigger bill_group_same_queue เป็นคนบังคับว่าทุก Visit ต้องมาจากคิวใบเดียวกัน
-- ฟังก์ชันนี้จึงไม่ต้องตรวจซ้ำ ปล่อยให้ด่านสุดท้ายทำงานตามหน้าที่

create or replace function fn_merge_bills(
  p_queue_ticket_id uuid,
  p_visit_ids       uuid[],
  p_staff_id        uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_group_id uuid;
  v_branch   uuid;
begin
  if array_length(p_visit_ids, 1) is null or array_length(p_visit_ids, 1) < 2 then
    raise exception 'ต้องเลือกอย่างน้อยสอง Visit จึงจะรวมบิลได้' using errcode = 'check_violation';
  end if;

  select branch_id into v_branch from queue_ticket where queue_ticket_id = p_queue_ticket_id;
  if v_branch is null then
    raise exception 'ไม่พบคิวใบนี้' using errcode = 'check_violation';
  end if;

  insert into bill_group (branch_id, queue_ticket_id, created_by)
  values (v_branch, p_queue_ticket_id, p_staff_id)
  returning bill_group_id into v_group_id;

  update visit set bill_group_id = v_group_id
   where visit_id = any(p_visit_ids) and deleted_at is null;

  return (select to_jsonb(t) from v_bill_group_total t where t.bill_group_id = v_group_id);
end $$;

-- ── ยกเลิก Visit ───────────────────────────────────────────────────────────

create or replace function fn_void_visit(
  p_visit_id uuid,
  p_reason   text
) returns visit
language plpgsql security definer set search_path = public as $$
declare v_row visit;
begin
  if char_length(coalesce(p_reason, '')) < 10 then
    raise exception 'ต้องกรอกเหตุผลอย่างน้อย 10 ตัวอักษร' using errcode = 'check_violation';
  end if;

  update visit
     set status = 'VOIDED', void_reason = p_reason
   where visit_id = p_visit_id and deleted_at is null
  returning * into v_row;

  if v_row.visit_id is null then
    raise exception 'ไม่พบ Visit' using errcode = 'check_violation';
  end if;

  update qr_session set revoked_at = now()
   where visit_id = p_visit_id and revoked_at is null;
  update dining_table set status = 'CLEANING'
   where table_id in (select table_id from visit_table
                       where visit_id = p_visit_id and released_at is null);
  update visit_table set released_at = now()
   where visit_id = p_visit_id and released_at is null;

  return v_row;
end $$;

-- ── กู้คืนข้อมูลที่ soft delete (BR-10) ─────────────────────────────────────
-- รายชื่อตารางถูกจำกัดไว้ตายตัว ชื่อที่ส่งมาจากภายนอกจึงกลายเป็นคำสั่งอื่นไม่ได้

create or replace function fn_restore_record(
  p_table_name text,
  p_record_id  uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_allowed text[] := array[
    'visit', 'bill', 'payment', 'order_batch', 'order_item', 'service_call',
    'menu_item', 'menu_category', 'dining_table', 'zone', 'staff', 'addon',
    'package', 'inventory_item', 'stock_count', 'queue_ticket', 'reservation',
    'bill_group', 'member'
  ];
  v_pk  text;
  v_row jsonb;
begin
  if not (p_table_name = any(v_allowed)) then
    raise exception 'กู้คืนตาราง % ไม่ได้', p_table_name using errcode = 'check_violation';
  end if;

  select a.attname into v_pk
    from pg_index i
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
   where i.indrelid = format('public.%I', p_table_name)::regclass and i.indisprimary;

  execute format(
    'update public.%I set deleted_at = null where %I = $1 and deleted_at is not null returning to_jsonb(%I)',
    p_table_name, v_pk, p_table_name
  ) into v_row using p_record_id;

  if v_row is null then
    raise exception 'ไม่พบแถวที่ถูกลบไว้' using errcode = 'no_data_found';
  end if;

  return v_row;
end $$;

-- ── รายงานรายวัน (§09) ─────────────────────────────────────────────────────

create or replace function fn_daily_report(
  p_branch_id uuid,
  p_date      date default current_date
) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'service_date', p_date,
    'sales', coalesce(
      (select to_jsonb(s) from v_daily_sales s
        where s.branch_id = p_branch_id and s.service_date = p_date),
      jsonb_build_object('visit_count', 0, 'guest_count', 0, 'gross_sales', 0)
    ),
    'top_menu', coalesce(
      (select jsonb_agg(t order by t.ordered_qty desc)
         from (select menu_name, ordered_qty from v_menu_popularity
                where branch_id = p_branch_id and service_date = p_date
                order by ordered_qty desc limit 10) t),
      '[]'::jsonb
    ),
    -- ช่วงเวลาหนาแน่น: นับการเช็คอินรายชั่วโมง ใช้จัดกะพนักงาน
    'busy_hours', coalesce(
      (select jsonb_agg(jsonb_build_object('hour', h, 'visits', n) order by h)
         from (select extract(hour from seated_at)::int as h, count(*) as n
                 from visit
                where branch_id = p_branch_id and date(seated_at) = p_date
                  and deleted_at is null and status <> 'VOIDED'
                group by 1) x(h, n)),
      '[]'::jsonb
    )
  );
$$;

-- ── Idempotency-Key กลางสำหรับ Edge Function (ADR-07) ──────────────────────
-- order_batch และ payment มีคอลัมน์ idempotency_key UNIQUE ของตัวเองอยู่แล้ว
-- ซึ่งเป็นด่านสุดท้ายที่ฐานข้อมูล ตารางนี้ทำอีกหน้าที่: จำ "คำตอบ" ของคำขอที่สำเร็จไปแล้ว
-- ให้การกดซ้ำตอนเน็ตช้าได้คำตอบเดิมกลับไป แทนที่จะได้ error ว่าคีย์ซ้ำ
-- และครอบคลุม endpoint ที่ไม่มีตารางปลายทางให้ผูกคีย์ เช่นรับคิวและเรียกพนักงาน

create table if not exists idempotency_record (
  key          text primary key,
  endpoint     text not null,
  -- hash ของ body เพื่อจับกรณีใช้คีย์เดิมแต่ส่งข้อมูลคนละชุด ซึ่งเป็นความผิดพลาดฝั่ง client
  request_hash text not null,
  status_code  int  not null,
  response     jsonb not null,
  created_at   timestamptz not null default now()
);

create index if not exists idempotency_record_created_at_idx on idempotency_record (created_at);

alter table idempotency_record enable row level security;
-- ไม่มี policy ให้ใครเลย เข้าถึงผ่าน service role ใน Edge Function เท่านั้น

create or replace function fn_sweep_idempotency() returns int
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  delete from idempotency_record where created_at < now() - interval '24 hours';
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- 0013 ถอน execute จาก public/anon ไปแล้ว ฟังก์ชันที่เพิ่มใหม่จึงต้อง grant ซ้ำ
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
