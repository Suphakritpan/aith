-- 0018_close_leaks.sql
-- ปิดช่องที่กฎธุรกิจรั่วอยู่จริงบนเส้นทางที่ใช้งานอยู่ตอนนี้
-- อ้างอิง: Read/System Design.md §01 BR-01/BR-03/BR-10, §05, §08 ข้อ 7, §09, ADR-06
--
-- ต้องรันหลัง 0017_reservation_and_pin.sql เพราะส่วน B แก้ทับสิทธิ์คอลัมน์ที่ 0017 ตั้งไว้
--
-- ทุกข้อในไฟล์นี้เป็นช่องที่ "ยิง API ตรงแล้วข้ามกฎได้" ซึ่งเป็นสิ่งเดียวที่ §01 ห้ามไว้
-- จึงปิดที่ฐานข้อมูลทั้งหมด ไม่ปิดที่หน้าจอ
--
--   A · BR-03 ไม่ได้คุม visit_addon — ลูกค้ายกเลิกค่าน้ำรีฟิลหลังดื่มหมดได้
--   B · staff.pin_hash หลุดถึงเบราว์เซอร์ทาง PostgREST
--   C · ฟังก์ชัน security definer ใน 0016 ไม่เช็คบทบาทเลย
--   D · staff_update_visit ไม่กัน deleted_at จึงกู้คืน Visit เองได้
--   E · BR-01 คุมแค่ order_batch — ต่อรายการเข้า Visit ที่ freeze แล้วได้ทาง order_item
--   F · t99_audit ผูกแค่ 6 ตาราง ไม่ใช่ "ทุกการเปลี่ยนแปลง" ตามที่ BR-10 เขียนไว้


-- ══ ตัวช่วยตรวจสิทธิ์ ══════════════════════════════════════════════════════
--
-- ใช้แบบเดียวกับ fn_guard_visit_access ใน 0012: ตรวจเฉพาะเมื่อมีผู้ใช้ล็อกอินอยู่
-- service role ไม่มี auth.uid() และเป็นฝั่งเซิร์ฟเวอร์ที่ตรวจสิทธิ์มาก่อนแล้ว (ADR-06)
-- ถ้าบังคับกับ service role ด้วย Edge Function ชุดที่เรียกด้วยคีย์นั้นจะพังทันที

create or replace function fn_require_role(p_min text) returns void
language plpgsql stable set search_path = public as $$
begin
  if auth.uid() is not null and not fn_has_role(p_min) then
    raise exception 'รายการนี้สงวนไว้สำหรับ % ขึ้นไป', p_min
      using errcode = 'insufficient_privilege';
  end if;
end $$;

create or replace function fn_require_branch(p_branch_id uuid) returns void
language plpgsql stable set search_path = public as $$
begin
  if auth.uid() is not null and p_branch_id is distinct from fn_my_branch_id() then
    raise exception 'ไม่มีสิทธิ์เข้าถึงข้อมูลของสาขาอื่น'
      using errcode = 'insufficient_privilege';
  end if;
end $$;


-- ══ A · BR-03 กับ visit_addon ══════════════════════════════════════════════
--
-- ช่องเดิม: t01_addon_within_paying_pax กันแค่ new.qty > จำนวนหัวที่จ่ายเงิน
-- ลูกค้าจึงสั่งรีฟิล 4 ดื่มจนหมด แล้ว POST {qty:0} ทับได้ และ fn_calc_bill อ่าน
-- visit_addon ตอนออกบิล จึงคิดเงินตามค่าล่าสุดคือศูนย์
--
-- BR-03 บอกว่า "เพิ่มได้ ลดไม่ได้ ต้องให้หัวหน้ากะยกเลิกทั้ง Visit" ซึ่ง 0008 ทำไว้
-- ที่ visit_pax แล้ว (t01_pax_no_decrease) — add-on รายหัวเป็นเงินก้อนเดียวกัน
-- จึงต้องใช้กฎเดียวกัน ไม่ใช่กฎคนละชุด

create or replace function trg_addon_no_decrease() returns trigger
language plpgsql set search_path = public as $$
declare v_basis addon_charge_basis;
begin
  if new.qty >= old.qty then return new; end if;

  select charge_basis into v_basis from addon where addon_id = new.addon_id;

  -- หัวหน้ากะลดได้ เพราะเป็นการแก้ของที่คีย์ผิดตอนเช็คอิน ไม่ใช่การหนีค่าน้ำ
  -- ลูกค้ายิงผ่าน Edge Function ด้วย service role ซึ่งไม่มี auth.uid() จึงตกด่านนี้เสมอ
  if not fn_has_role('SUPERVISOR') then
    raise exception 'ลดจำนวน % ไม่ได้ (จาก % เป็น %) ต้องให้หัวหน้ากะแก้ให้',
      case when v_basis = 'PER_HEAD' then 'รายการเสริมรายหัว' else 'รายการเสริม' end,
      old.qty, new.qty
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

drop trigger if exists t01_addon_no_decrease on visit_addon;
create trigger t01_addon_no_decrease
  before update of qty on visit_addon
  for each row execute function trg_addon_no_decrease();

-- ลบแถวทิ้งแล้วใส่ใหม่เป็นทางอ้อมของการลดจำนวน จึงต้องปิดด้วย
-- (0010 ถอน DELETE จาก authenticated/anon ไปแล้ว ด่านนี้กันฝั่ง service role อีกชั้น)

create or replace function trg_addon_no_delete() returns trigger
language plpgsql set search_path = public as $$
begin
  if not fn_has_role('SUPERVISOR') then
    raise exception 'ลบรายการเสริมออกจาก Visit ไม่ได้ ต้องให้หัวหน้ากะแก้ให้'
      using errcode = 'check_violation';
  end if;

  return old;
end $$;

drop trigger if exists t01_addon_no_delete on visit_addon;
create trigger t01_addon_no_delete
  before delete on visit_addon
  for each row execute function trg_addon_no_delete();


-- ══ B · staff.pin_hash ต้องไม่ออกทาง PostgREST ═════════════════════════════
--
-- supabase/README.md เขียนไว้เองว่า "ตั้งใจให้ตรวจ PIN ที่ Edge Function
-- เพื่อไม่ให้ hash หลุดออกทาง PostgREST" แต่ 0010 grant select ทั้งตาราง
-- และ policy staff_read ไม่จำกัดคอลัมน์ frontend จึงดึง pin_hash ลงเบราว์เซอร์ได้จริง
--
-- 0017 พยายามปิดด้วย `revoke select (pin_hash) on staff` ซึ่งไม่มีผล — PostgreSQL
-- เก็บสิทธิ์ระดับตารางกับระดับคอลัมน์แยกกัน เมื่อ 0010 grant select มาทั้งตาราง
-- การถอนรายคอลัมน์จะได้แค่ WARNING "no privileges could be revoked" แล้วอ่านได้ต่อ
--
-- ทางที่ได้ผลจริงมีทางเดียว: ถอน SELECT ระดับตารางออกก่อน แล้ว grant กลับเป็นรายคอลัมน์
-- ลำดับสำคัญ — ถ้าวันหลังมีใคร grant select ทั้งตารางอีกครั้ง ช่องนี้จะเปิดกลับมาเงียบ ๆ

revoke select on staff from authenticated, anon;
grant select (
  staff_id, branch_id, auth_user_id, full_name, role, is_active, created_at, deleted_at
) on staff to authenticated;

-- fn_my_staff_profile() ที่ 0017 สร้างไว้ยังใช้ได้ตามเดิม เพราะเป็น security definer
-- จึงอ่าน pin_hash ด้วยสิทธิ์ของเจ้าของฟังก์ชัน ไม่ใช่สิทธิ์ของผู้เรียก
--
-- แต่ v_staff_directory ใช้ security_invoker = on ซึ่งอ่านด้วยสิทธิ์ของผู้เรียก
-- เมื่อถอนสิทธิ์อ่าน pin_hash ไปข้างบน นิพจน์ (s.pin_hash is not null) ในตัว view
-- จะกลายเป็น permission denied ทันที ต้องย้ายการคำนวณเข้าไปในฟังก์ชัน definer แทน
-- (เก็บ security_invoker ไว้ เพราะ RLS ของ staff คือสิ่งเดียวที่กันไม่ให้เห็นสาขาอื่น)

create or replace function fn_staff_has_pin(p_staff_id uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select s.pin_hash is not null
    from staff s
   where s.staff_id = p_staff_id
     and (fn_my_branch_id() is null or s.branch_id = fn_my_branch_id());
$$;

create or replace view v_staff_directory with (security_invoker = on) as
select
  s.staff_id,
  s.branch_id,
  s.auth_user_id,
  s.full_name,
  s.role,
  s.is_active,
  s.created_at,
  (s.auth_user_id is not null)  as linked_to_auth,
  fn_staff_has_pin(s.staff_id)  as has_pin
from staff s
where s.deleted_at is null;

-- 0010 grant select ทั้ง schema ไปตั้งแต่ก่อน view นี้เกิด view ที่สร้างใน 0017
-- จึงยังไม่มีสิทธิ์ให้ใครเลย และหน้า "พนักงาน" อ่านไม่ได้จริงจนกว่าจะ grant ตรงนี้
grant select on v_staff_directory to authenticated;

-- audit_log เก็บ to_jsonb(new) ทั้งแถว การเปลี่ยน PIN จึงเขียน hash ลง audit
-- ซึ่งย้อนกลับไปสู่ปัญหาเดิม — ลบค่าออกตั้งแต่ตอนเขียน ไม่ใช่ตอนอ่าน

create or replace function trg_write_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_action audit_action;
  v_id     uuid;
  v_before jsonb;
  v_after  jsonb;
begin
  if tg_op = 'INSERT' then
    v_action := 'INSERT';
  elsif to_jsonb(old) ? 'deleted_at'
    and (to_jsonb(old) ->> 'deleted_at') is null
    and (to_jsonb(new) ->> 'deleted_at') is not null then
    v_action := 'SOFT_DELETE';
  elsif to_jsonb(old) ? 'deleted_at'
    and (to_jsonb(old) ->> 'deleted_at') is not null
    and (to_jsonb(new) ->> 'deleted_at') is null then
    v_action := 'RESTORE';
  else
    v_action := 'UPDATE';
  end if;

  v_id := (to_jsonb(new) ->> (tg_argv[0]))::uuid;

  v_before := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_after  := to_jsonb(new);

  -- hash ของ PIN ไม่ควรอยู่ในบันทึกย้อนหลัง ถึง audit_log จะอ่านได้เฉพาะ OWNER ก็ตาม
  if v_before ? 'pin_hash' then v_before := v_before || '{"pin_hash":"[redacted]"}'::jsonb; end if;
  if v_after  ? 'pin_hash' then v_after  := v_after  || '{"pin_hash":"[redacted]"}'::jsonb; end if;

  insert into audit_log (table_name, record_id, action, actor_staff_id, before, after)
  values (tg_table_name, v_id, v_action, fn_my_staff_id(), v_before, v_after);

  return null;
end $$;


-- ══ C · ฟังก์ชัน security definer ใน 0016 ต้องเช็คบทบาท ════════════════════
--
-- 0013 และ 0016 grant execute ให้ authenticated ทั้งชุด และทุกตัวเป็น security definer
-- ซึ่งข้าม RLS โดยนิยาม เมื่อไม่มีการตรวจบทบาทในตัวฟังก์ชัน RLS จึงไม่ได้บังคับอะไรเลย
-- ผลคือ STAFF คนไหนก็ void visit สาขาไหนก็ได้ กู้คืนอะไรก็ได้ และอ่านยอดขายทุกสาขาได้
-- ทั้งที่ §05 และ §09 กำหนดไว้ว่าเป็นงานของ SUPERVISOR

-- §05 ตาราง transition: "ทุกสถานะ → VOIDED = หัวหน้ากะ"
create or replace function fn_void_visit(
  p_visit_id uuid,
  p_reason   text
) returns visit
language plpgsql security definer set search_path = public as $$
declare v_row visit;
begin
  perform fn_require_role('SUPERVISOR');
  perform fn_guard_visit_access(p_visit_id);

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

-- §09 ตาราง API: POST /bill-groups = SUPERVISOR
-- trigger bill_group_same_queue ยังเป็นด่านสุดท้ายเรื่องคิวเดียวกันเหมือนเดิม
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
  perform fn_require_role('SUPERVISOR');

  if array_length(p_visit_ids, 1) is null or array_length(p_visit_ids, 1) < 2 then
    raise exception 'ต้องเลือกอย่างน้อยสอง Visit จึงจะรวมบิลได้' using errcode = 'check_violation';
  end if;

  select branch_id into v_branch from queue_ticket where queue_ticket_id = p_queue_ticket_id;
  if v_branch is null then
    raise exception 'ไม่พบคิวใบนี้' using errcode = 'check_violation';
  end if;
  perform fn_require_branch(v_branch);

  -- ทุก Visit ที่จะรวมต้องอยู่สาขาเดียวกับคิว ไม่ใช่แค่มาจากคิวใบเดียวกัน
  if exists (
    select 1 from visit
     where visit_id = any(p_visit_ids)
       and (branch_id is distinct from v_branch or deleted_at is not null)
  ) then
    raise exception 'มี Visit ที่ไม่ได้อยู่สาขาเดียวกับคิวใบนี้ หรือถูกลบไปแล้ว'
      using errcode = 'check_violation';
  end if;

  insert into bill_group (branch_id, queue_ticket_id, created_by)
  values (v_branch, p_queue_ticket_id, p_staff_id)
  returning bill_group_id into v_group_id;

  update visit set bill_group_id = v_group_id
   where visit_id = any(p_visit_ids) and deleted_at is null;

  return (select to_jsonb(t) from v_bill_group_total t where t.bill_group_id = v_group_id);
end $$;

-- BR-10: การกู้คืนเป็นงานของหัวหน้ากะ และต้องกู้ได้เฉพาะของสาขาตัวเอง
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
  v_pk         text;
  v_has_branch boolean;
  v_row        jsonb;
begin
  perform fn_require_role('SUPERVISOR');

  if not (p_table_name = any(v_allowed)) then
    raise exception 'กู้คืนตาราง % ไม่ได้', p_table_name using errcode = 'check_violation';
  end if;

  select a.attname into v_pk
    from pg_index i
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
   where i.indrelid = format('public.%I', p_table_name)::regclass and i.indisprimary;

  -- ตารางที่มี branch_id ตรง ๆ กู้ข้ามสาขาไม่ได้ ตารางลูกอาศัย RLS ของแม่ตามเดิม
  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = p_table_name and column_name = 'branch_id'
  ) into v_has_branch;

  execute format(
    'update public.%I set deleted_at = null
      where %I = $1 and deleted_at is not null %s
      returning to_jsonb(%I)',
    p_table_name, v_pk,
    case when v_has_branch then 'and (fn_my_branch_id() is null or branch_id = fn_my_branch_id())'
         else '' end,
    p_table_name
  ) into v_row using p_record_id;

  if v_row is null then
    raise exception 'ไม่พบแถวที่ถูกลบไว้ หรือไม่ได้อยู่ในสาขาของคุณ' using errcode = 'no_data_found';
  end if;

  -- ตารางที่ไม่มี t99_audit จะไม่มีร่องรอยการกู้คืนเลย ส่วน F ด้านล่างผูก trigger
  -- ให้ครบทุกตารางในรายการนี้แล้ว การกู้คืนจึงลง audit_log เองทุกกรณี
  return v_row;
end $$;

-- §09: รายงานยอดขายเป็นของหัวหน้ากะขึ้นไป และดูได้เฉพาะสาขาตัวเอง
-- เปลี่ยนจาก language sql เป็น plpgsql เพราะต้องตรวจสิทธิ์ก่อนคืนค่า
create or replace function fn_daily_report(
  p_branch_id uuid,
  p_date      date default current_date
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform fn_require_role('SUPERVISOR');
  -- OWNER ดูข้ามสาขาได้ตาม §09 ที่เหลือจำกัดไว้ที่สาขาของตัวเอง
  if not fn_has_role('OWNER') then
    perform fn_require_branch(p_branch_id);
  end if;

  return jsonb_build_object(
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
end $$;

-- เรียกคิวเป็นงาน STAFF แต่ของเดิมไม่ได้ตรวจทั้งบทบาทและสาขา จึงเรียกคิวสาขาอื่นได้
-- เติมสองบรรทัดแรกเข้าไป ส่วนกติกา BR-09 (เรียกได้ 3 ครั้ง ห่างกัน 2 นาที) คงเดิมทุกตัวอักษร
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
  v_branch uuid;
begin
  perform fn_require_role('STAFF');

  select (value #>> '{}')::int into v_gap from app_setting where key = 'queue.call_interval_minutes';
  select (value #>> '{}')::int into v_max from app_setting where key = 'queue.max_calls';
  v_gap := coalesce(v_gap, 2);
  v_max := coalesce(v_max, 3);

  select status, branch_id into v_status, v_branch from queue_ticket
   where queue_ticket_id = p_queue_ticket_id and deleted_at is null
   for update;

  if v_status is null then
    raise exception 'ไม่พบคิวใบนี้' using errcode = 'check_violation';
  end if;
  perform fn_require_branch(v_branch);

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

-- fn_add_pax และ fn_add_table_to_visit ไม่ได้แก้ที่นี่: ทั้งคู่เรียก fn_guard_visit_access
-- อยู่แล้ว และผู้ใช้ที่ล็อกอินแต่ไม่มีแถวใน staff จะได้ fn_my_branch_id() = null
-- ทำให้ fn_visit_in_my_branch เป็นเท็จและถูกปฏิเสธตั้งแต่บรรทัดแรก


-- ══ D · staff_update_visit ไม่กัน deleted_at ═══════════════════════════════
--
-- USING เดิมไม่มี deleted_at is null พนักงานจึงเซ็ต deleted_at = null กลับเองได้
-- ซึ่ง BR-10 สงวนไว้ให้ SUPERVISOR/OWNER
--
-- USING คุมแถว "ก่อนแก้" จึงใส่ deleted_at is null ตรงนั้น แปลว่าแตะได้เฉพาะแถวที่ยังไม่ถูกลบ
-- ส่วน WITH CHECK คุมแถว "หลังแก้" จึงไม่ใส่ เพราะการ soft delete ต้องยังทำได้ตามปกติ

drop policy if exists staff_update_visit on visit;
create policy staff_update_visit on visit for update
  using (deleted_at is null and fn_has_role('STAFF') and branch_id = fn_my_branch_id())
  with check (branch_id = fn_my_branch_id());

-- หัวหน้ากะยังต้องแก้แถวที่ลบไปแล้วได้ เพื่อให้หน้ากู้คืนทำงานได้โดยไม่พึ่ง security definer อย่างเดียว
drop policy if exists supervisor_update_deleted_visit on visit;
create policy supervisor_update_deleted_visit on visit for update
  using (deleted_at is not null and fn_has_role('SUPERVISOR') and branch_id = fn_my_branch_id())
  with check (branch_id = fn_my_branch_id());


-- ══ E · BR-01 รั่วที่ order_item ═══════════════════════════════════════════
--
-- 0008 ผูก trg_order_only_when_dining ไว้กับ order_batch insert อย่างเดียว
-- แต่ 0010 ให้ STAFF insert order_item ได้ด้วย policy `with check (fn_has_role('STAFF'))`
-- ซึ่งไม่ตรวจทั้งสถานะ Visit และสาขา จึงต่อรายการเข้า batch เก่าของ Visit ที่
-- ขอบิลไปแล้วได้ ครัวทำอาหารต่อทั้งที่บิล freeze ไปแล้ว
--
-- (ยอดบิลของบุฟเฟต์ไม่ได้คิดจาก order_item — fn_calc_bill คิดจากหัว add-on และเวลา
--  ช่องนี้จึงเป็นของฟรีหลังปิดบิล ไม่ใช่ยอดบิลผิด แต่ก็ยังผิด BR-01 เต็ม ๆ)

create or replace function trg_order_item_only_when_dining() returns trigger
language plpgsql set search_path = public as $$
declare
  v_visit  uuid;
  v_status visit_status;
begin
  select ob.visit_id, v.status into v_visit, v_status
    from order_batch ob
    join visit v on v.visit_id = ob.visit_id
   where ob.order_batch_id = new.order_batch_id
     and ob.deleted_at is null and v.deleted_at is null;

  if v_status is null then
    raise exception 'ไม่พบออเดอร์ต้นทางของรายการนี้ หรือ Visit ถูกลบไปแล้ว'
      using errcode = 'check_violation';
  end if;

  -- batch แรกของมื้อเลื่อน SEATED → DINING ให้แล้วที่ trigger ของ order_batch
  -- ที่นี่จึงเหลือแค่กรณีที่ batch ถูกสร้างไว้ก่อนแล้วมาต่อรายการทีหลัง
  if v_status = 'SEATED' then
    update visit
       set status = 'DINING', first_order_at = coalesce(first_order_at, now())
     where visit_id = v_visit;
  elsif v_status <> 'DINING' then
    raise exception 'ต่อรายการอาหารไม่ได้: Visit อยู่สถานะ %', v_status
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

drop trigger if exists t01_order_item_only_when_dining on order_item;
create trigger t01_order_item_only_when_dining
  before insert on order_item
  for each row execute function trg_order_item_only_when_dining();

-- policy ของ order_item ไม่ผูกกับสาขาเลย พนักงานสาขา A จึงอ่านและแก้ของสาขา B ได้
-- ผูกกลับเข้ากับ Visit เจ้าของ batch เหมือนตารางลูกตัวอื่นใน 0010

create or replace function fn_batch_in_my_branch(p_order_batch_id uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from order_batch ob
      join visit v on v.visit_id = ob.visit_id
     where ob.order_batch_id = p_order_batch_id and v.branch_id = fn_my_branch_id()
  );
$$;

drop policy if exists order_item_read on order_item;
drop policy if exists order_item_write on order_item;
drop policy if exists order_item_update on order_item;

create policy order_item_read on order_item for select
  using (fn_has_role('STAFF') and fn_batch_in_my_branch(order_batch_id));
create policy order_item_write on order_item for insert
  with check (fn_has_role('STAFF') and fn_batch_in_my_branch(order_batch_id));
create policy order_item_update on order_item for update
  using (fn_has_role('STAFF') and fn_batch_in_my_branch(order_batch_id))
  with check (fn_has_role('STAFF') and fn_batch_in_my_branch(order_batch_id));

-- trigger BR-01 ของ order_batch ตรวจเฉพาะตอน insert การย้าย batch ไปแขวนกับ Visit
-- อื่นด้วย UPDATE จึงยังเล็ดลอดได้ และเป็นทางอ้อมกลับไปสู่ช่องเดียวกัน
-- batch ผูกกับมื้อไหนเป็นข้อเท็จจริงที่เกิดแล้ว ไม่ใช่ค่าที่ควรแก้ทีหลัง

create or replace function trg_order_batch_visit_immutable() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.visit_id is distinct from old.visit_id then
    raise exception 'ย้ายออเดอร์ไปโต๊ะอื่นไม่ได้ ต้องยกเลิกแล้วสั่งใหม่'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists t01_order_batch_visit_immutable on order_batch;
create trigger t01_order_batch_visit_immutable
  before update of visit_id on order_batch
  for each row execute function trg_order_batch_visit_immutable();


-- ══ F · BR-10 "ทุกการเปลี่ยนแปลง" ยังไม่ครบ ════════════════════════════════
--
-- README ทั้งสองฉบับเขียนว่า "ทุกการเปลี่ยนแปลงลง audit_log" แต่ 0008 ผูก t99_audit
-- ไว้แค่ 6 ตาราง (visit, bill, payment, visit_pax, menu_item, package_price)
-- ตารางที่หน้ากู้คืนแตะได้อีก 17 ตารางจึงกู้คืนแล้วไม่มีร่องรอย
--
-- ผูกให้ครบทุกตารางที่ fn_restore_record กู้ได้ บวก visit_addon ซึ่งเป็นเงินโดยตรง
-- ตารางที่เหลือ (qr_session, visit_table, queue_call, notification_log, audit_log,
-- idempotency_record, app_setting, member_consent, point_transaction, branch)
-- ไม่มีเส้นทางกู้คืนและไม่ใช่ยอดเงิน จึงคงไว้ตามเดิมเพื่อไม่ให้ audit_log บวมเปล่า

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('visit_addon',   'visit_addon_id'),
      ('order_batch',   'order_batch_id'),
      ('order_item',    'order_item_id'),
      ('service_call',  'service_call_id'),
      ('menu_category', 'category_id'),
      ('dining_table',  'table_id'),
      ('zone',          'zone_id'),
      ('staff',         'staff_id'),
      ('addon',         'addon_id'),
      ('package',       'package_id'),
      ('inventory_item','inventory_item_id'),
      ('stock_count',   'stock_count_id'),
      ('queue_ticket',  'queue_ticket_id'),
      ('reservation',   'reservation_id'),
      ('bill_group',    'bill_group_id'),
      ('member',        'member_id')
    ) as t(tbl, pk)
  loop
    execute format('drop trigger if exists t99_audit on public.%I', r.tbl);
    execute format(
      'create trigger t99_audit after insert or update on public.%I
         for each row execute function trg_write_audit(%L)',
      r.tbl, r.pk
    );
  end loop;
end $$;

-- หน้ากู้คืนอ่าน dining_table ที่ถูกลบไม่ได้เลย เพราะ table_read บังคับ deleted_at is null
-- และไม่มี policy คู่สำหรับแถวที่ลบแล้วเหมือนที่ visit มี — เติมให้ครบทั้งสามตารางที่หน้านั้นใช้

drop policy if exists supervisor_read_deleted_table on dining_table;
create policy supervisor_read_deleted_table on dining_table for select
  using (deleted_at is not null and fn_has_role('SUPERVISOR') and branch_id = fn_my_branch_id());

drop policy if exists supervisor_read_deleted_menu on menu_item;
create policy supervisor_read_deleted_menu on menu_item for select
  using (deleted_at is not null and fn_has_role('SUPERVISOR'));


-- ══ สิทธิ์เรียกฟังก์ชันที่เพิ่มใหม่ ═════════════════════════════════════════
-- 0013 ถอน execute จาก public/anon ไว้ ฟังก์ชันใหม่ทุกตัวจึงต้อง grant ซ้ำ

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;

-- ข้อยกเว้นเดียวของ ADR-06: 0017 เปิด fn_create_reservation ให้ anon โดยเจตนา
-- เพราะลูกค้าจองโต๊ะโดยไม่ล็อกอิน การ revoke เหมารวมบรรทัดบนถอนสิทธิ์นั้นไปด้วย
-- จึงต้องคืนให้ตรงนี้ ไม่งั้นหน้าจองโต๊ะจะพังเงียบ ๆ ตอน push migration
grant execute on function fn_create_reservation(uuid, timestamptz, int, text) to anon;
