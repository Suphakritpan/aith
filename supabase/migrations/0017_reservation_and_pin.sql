-- 0017_reservation_and_pin.sql
-- สองเรื่องที่หน้าเว็บทำเองจากเบราว์เซอร์ไม่ได้ ถ้าไม่มีฟังก์ชันรองรับ
-- อ้างอิง: Read/System Design.md §06 กลุ่ม 2 (reservation), §02 (ยืนยัน PIN)

-- ── 1. ลูกค้าจองโต๊ะล่วงหน้า ────────────────────────────────────────────────
--
-- ลูกค้าไม่ล็อกอิน และ 0010/0013 ถอนสิทธิ์ anon ออกจากทุกตารางและทุกฟังก์ชันแล้ว
-- การจองจึงต้องผ่านฟังก์ชัน security definer ตัวเดียวที่เปิดให้ anon เรียกได้
-- ฟังก์ชันนี้เขียนได้อย่างเดียวและคืนเฉพาะรหัสอ้างอิง ไม่เปิดให้อ่านตารางอื่นเลย

create or replace function fn_create_reservation(
  p_branch_id    uuid,
  p_reserved_for timestamptz,
  p_party_size   int,
  p_phone        text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_row reservation;
begin
  if p_party_size < 1 or p_party_size > 20 then
    raise exception 'จำนวนคนต้องอยู่ระหว่าง 1 ถึง 20' using errcode = 'check_violation';
  end if;

  -- จองล่วงหน้าได้ตั้งแต่ 30 นาทีจากนี้ ถึง 30 วัน
  -- ใกล้กว่านั้นให้เดินมารับคิวหน้าร้านเลยเร็วกว่า
  if p_reserved_for < now() + interval '30 minutes' then
    raise exception 'กรุณาจองล่วงหน้าอย่างน้อย 30 นาที' using errcode = 'check_violation';
  end if;
  if p_reserved_for > now() + interval '30 days' then
    raise exception 'จองล่วงหน้าได้ไม่เกิน 30 วัน' using errcode = 'check_violation';
  end if;
  if coalesce(trim(p_phone), '') = '' then
    raise exception 'ต้องระบุเบอร์โทรเพื่อให้ร้านติดต่อกลับได้' using errcode = 'check_violation';
  end if;

  -- ยังไม่ผูกโต๊ะตั้งแต่ตอนจอง เพราะโต๊ะไหนจะว่างขึ้นกับหน้างานจริง
  -- พนักงานเป็นคนเลือกโต๊ะให้ตอนใกล้เวลา
  insert into reservation (branch_id, reserved_for, party_size, contact_phone, status)
  values (p_branch_id, p_reserved_for, p_party_size, trim(p_phone), 'HELD')
  returning * into v_row;

  return jsonb_build_object(
    'reservation_id', v_row.reservation_id,
    'reserved_for', v_row.reserved_for,
    'hold_until', v_row.hold_until,
    'party_size', v_row.party_size
  );
end $$;

grant execute on function fn_create_reservation(uuid, timestamptz, int, text) to anon, authenticated;

-- ปล่อยการจองที่เลยเวลากันโต๊ะไปแล้ว — §06 "กันโต๊ะไว้ 15 นาที"
-- เรียกจากงานกวาดเดียวกับ fn_sweep_no_show
create or replace function fn_sweep_expired_holds() returns int
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  update reservation
     set status = 'RELEASED'
   where status = 'HELD'
     and hold_until < now()
     and deleted_at is null;
  get diagnostics v_count = row_count;

  -- โต๊ะที่กันไว้ให้การจองที่หลุดแล้ว ต้องกลับเป็นว่างด้วย ไม่งั้นจะค้างสถานะ RESERVED
  update dining_table dt
     set status = 'AVAILABLE'
   where dt.status = 'RESERVED'
     and not exists (
       select 1 from reservation r
        where r.table_id = dt.table_id and r.status = 'HELD' and r.deleted_at is null
     );

  return v_count;
end $$;

-- ── 2. PIN ต้องไม่หลุดออกจากฐานข้อมูล ──────────────────────────────────────
--
-- ปัญหาที่แก้: policy staff_read ยอมให้พนักงานอ่านแถวของเพื่อนร่วมสาขาได้ทั้งแถว
-- ซึ่งรวม pin_hash ด้วย PIN เป็นตัวเลขสี่ถึงหกหลัก ใครที่อ่าน hash ไปได้
-- จะลองทุกค่าจนครบในเครื่องตัวเองได้ภายในไม่กี่วินาที การยืนยัน PIN จึงหมดความหมาย
--
-- ทางแก้: ย้ายทั้งการตั้งและการตรวจเข้าไปเป็นฟังก์ชัน security definer
-- แล้วเลิกส่ง pin_hash ออกไปทาง PostgREST โดยเพิกถอนสิทธิ์อ่านเฉพาะคอลัมน์นี้

create or replace function fn_set_pin(p_staff_id uuid, p_pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not fn_has_role('SUPERVISOR') then
    raise exception 'ต้องเป็นหัวหน้ากะขึ้นไปจึงจะตั้ง PIN ได้' using errcode = 'insufficient_privilege';
  end if;
  if p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'PIN ต้องเป็นตัวเลข 4 ถึง 6 หลัก' using errcode = 'check_violation';
  end if;
  if not exists (
    select 1 from staff where staff_id = p_staff_id and branch_id = fn_my_branch_id()
  ) then
    raise exception 'ไม่พบพนักงานคนนี้ในสาขาของคุณ' using errcode = 'check_violation';
  end if;

  update staff
     set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf'))
   where staff_id = p_staff_id;
end $$;

create or replace function fn_clear_pin(p_staff_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not fn_has_role('SUPERVISOR') then
    raise exception 'ต้องเป็นหัวหน้ากะขึ้นไป' using errcode = 'insufficient_privilege';
  end if;
  update staff set pin_hash = null
   where staff_id = p_staff_id and branch_id = fn_my_branch_id();
end $$;

/**
 * ตรวจ PIN ของผู้ใช้ที่ล็อกอินอยู่
 *
 * คืนค่าจริง-เท็จเท่านั้น ไม่เคยส่ง hash ออกไป และตรวจของตัวเองได้คนเดียว
 * ใช้กับรายการที่มีผลทางการเงิน: เปิดโต๊ะ รับเงิน ปิดโต๊ะ ยกเลิก และรวมบิล
 */
create or replace function fn_verify_pin(p_pin text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare v_hash text;
begin
  select pin_hash into v_hash
    from staff
   where auth_user_id = auth.uid() and is_active and deleted_at is null;

  if v_hash is null then return false; end if;
  return v_hash = extensions.crypt(p_pin, v_hash);
end $$;

/**
 * โปรไฟล์ของพนักงานที่ล็อกอินอยู่
 *
 * มีไว้เพื่อให้ฝั่งหน้าเว็บไม่ต้อง select จากตาราง staff เอง ซึ่งมีกับดักสองข้อ
 * หนึ่ง RLS ยอมให้เห็นเพื่อนร่วมสาขาทุกคน ถ้าลืมกรอง auth_user_id จะได้หลายแถว
 * สอง has_pin ต้องคำนวณจาก pin_hash ซึ่งไม่ควรถูกส่งออกไปที่เบราว์เซอร์เลย
 */
create or replace function fn_my_staff_profile()
returns table (
  staff_id  uuid,
  branch_id uuid,
  full_name text,
  role      text,
  has_pin   boolean
)
language sql stable security definer set search_path = public as $$
  select s.staff_id, s.branch_id, s.full_name, s.role::text, (s.pin_hash is not null)
    from staff s
   where s.auth_user_id = auth.uid()
     and s.is_active
     and s.deleted_at is null
   limit 1;
$$;

-- ใครที่มี PIN อยู่แล้วหรือยัง เป็นข้อมูลที่หน้าจอต้องใช้ แต่ตัว hash ไม่ใช่
create or replace view v_staff_directory with (security_invoker = on) as
select
  s.staff_id,
  s.branch_id,
  s.auth_user_id,
  s.full_name,
  s.role,
  s.is_active,
  s.created_at,
  (s.auth_user_id is not null) as linked_to_auth,
  (s.pin_hash is not null)     as has_pin
from staff s
where s.deleted_at is null;

-- ปิดทางไม่ให้ pin_hash ออกไปทาง PostgREST
--
-- ข้อควรรู้: บรรทัดนี้ยังไม่พอด้วยตัวเอง เพราะ 0010 grant select มาทั้งตารางแล้ว
-- PostgreSQL เก็บสิทธิ์ระดับตารางกับระดับคอลัมน์แยกกัน การถอนรายคอลัมน์ตอนที่ยังมีสิทธิ์
-- ระดับตารางอยู่จะได้แค่ WARNING แล้วอ่านต่อได้เหมือนเดิม
-- 0018_close_leaks.sql เป็นตัวที่ปิดช่องนี้จริง ด้วยการถอนระดับตารางก่อนแล้ว grant กลับรายคอลัมน์
revoke select (pin_hash) on staff from authenticated, anon;

grant execute on function fn_my_staff_profile()     to authenticated;
grant execute on function fn_set_pin(uuid, text)   to authenticated;
grant execute on function fn_clear_pin(uuid)       to authenticated;
grant execute on function fn_verify_pin(text)      to authenticated;
grant execute on function fn_sweep_expired_holds() to authenticated;
