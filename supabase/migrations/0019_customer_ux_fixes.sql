-- 0019_customer_ux_fixes.sql
-- แก้ปัญหาที่เจอจากการทดสอบในมุมลูกค้าที่ไม่ใช่นักพัฒนา
--
-- 1. เวลารอโดยประมาณให้ค่าที่เป็นไปไม่ได้ (คิวก่อนหน้า 0 แต่บอกรอ 11 ชั่วโมง)
-- 2. ร้านไม่มีเบอร์โทรให้ลูกค้าโทรถาม ทั้งที่ทุกทางตันจบลงที่ "โทรถามร้าน"
-- 3. จองแล้วยกเลิกเองไม่ได้ และกลับมาดูการจองไม่ได้

-- ── 1 · เวลารอโดยประมาณ ────────────────────────────────────────────────────
--
-- ของเดิมผิดสามทาง:
--   (ก) นับคิวที่ "รออยู่" ทั้งช่อง รวมใบของคนที่ถามเองด้วย คนแรกของช่องจึงไม่เคยได้ 0
--   (ข) ไม่หารด้วยจำนวนโต๊ะที่รับช่องนั้นได้ ร้านยี่สิบโต๊ะจึงคิดเหมือนร้านโต๊ะเดียว
--   (ค) ใช้ค่าเฉลี่ยดิบจากประวัติ ข้อมูลเสียหนึ่งแถว (visit ที่ปิดข้ามวัน) ลากค่าเฉลี่ย
--       ขึ้นไปหลักสิบชั่วโมงได้ทันที
--
-- p_before_seq คือเลขคิวของใบที่กำลังถาม ส่งมาเพื่อให้นับเฉพาะคิวที่มาก่อนจริง ๆ
-- ไม่ส่ง (null) = ถามภาพรวมของช่อง เช่นตอนยังไม่มีใบคิว

create or replace function fn_estimated_wait_minutes(
  p_branch_id  uuid,
  p_lane       queue_lane,
  p_before_seq int default null
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
       and (p_before_seq is null or seq_no < p_before_seq)
  ),
  lane_tables as (
    -- โต๊ะที่รองรับกลุ่มขนาดของช่องนี้ อย่างน้อยหนึ่งตัวเพื่อกันหารศูนย์
    select greatest(count(*), 1)::int as t
      from dining_table
     where branch_id = p_branch_id
       and deleted_at is null
       and case p_lane
             when 'A' then seat_capacity <= 2
             when 'B' then seat_capacity between 3 and 4
             else seat_capacity >= 5
           end
  ),
  avg_turn as (
    -- เพดาน 180 นาที: บุฟเฟต์จำกัด 120 นาที รอบที่ยาวกว่านี้คือข้อมูลเสีย ไม่ใช่รอบจริง
    -- พื้น 20 นาที: กันค่าเฉลี่ยต่ำผิดปกติจากโต๊ะที่เปิดแล้วปิดทันที
    select least(greatest(coalesce(
             avg(extract(epoch from (v.closed_at - v.seated_at)) / 60),
             90
           ), 20), 180)::numeric as m
      from visit v
      join queue_ticket q on q.queue_ticket_id = v.queue_ticket_id
     where v.branch_id = p_branch_id
       and v.closed_at is not null
       and v.closed_at > now() - interval '30 days'
       and q.lane = p_lane
       and v.deleted_at is null
       -- ตัดแถวที่กินเวลาเกินสามชั่วโมงทิ้งตั้งแต่ต้น ไม่ให้ถ่วงค่าเฉลี่ย
       and v.closed_at - v.seated_at < interval '3 hours'
  )
  select ceil(
           ceil((select n from ahead)::numeric / (select t from lane_tables))
           * (select m from avg_turn)
         )::int;
$$;

-- ── 2 · เบอร์โทรร้าน ───────────────────────────────────────────────────────
-- ทุกทางตันในมุมลูกค้า (ยกเลิกจองไม่ได้ · เวลารอไม่น่าเชื่อ · มากัน 7 คนกดอะไร)
-- จบลงที่ "โทรถามร้าน" แต่ทั้งเว็บไม่มีเบอร์ร้านให้โทร

alter table branch add column if not exists phone text;

update branch set phone = '02-000-0000' where phone is null;

-- ── 3 · ลูกค้าจัดการการจองของตัวเองได้ ─────────────────────────────────────
--
-- รหัสอ้างอิงที่ลูกค้าเห็นคือแปดตัวแรกของ reservation_id ตัวพิมพ์ใหญ่
-- แปดตัวอักษรฐานสิบหกเดาได้ จึงต้องใช้คู่กับเบอร์โทรที่ใช้ตอนจองเสมอ
-- เบอร์โทรทำหน้าที่เป็นความลับ ไม่ใช่ตัวระบุ — ค้นด้วยเบอร์อย่างเดียวไม่ได้

create or replace function fn_find_reservation(
  p_ref   text,
  p_phone text
) returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(r) - 'contact_phone'
    from reservation r
   where upper(left(r.reservation_id::text, 8)) = upper(trim(p_ref))
     and r.contact_phone = trim(p_phone)
     and r.deleted_at is null;
$$;

create or replace function fn_cancel_reservation(
  p_ref   text,
  p_phone text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_row reservation;
begin
  select * into v_row
    from reservation
   where upper(left(reservation_id::text, 8)) = upper(trim(p_ref))
     and contact_phone = trim(p_phone)
     and deleted_at is null
   for update;

  if v_row.reservation_id is null then
    raise exception 'ไม่พบการจองนี้ ตรวจรหัสอ้างอิงและเบอร์โทรอีกครั้ง'
      using errcode = 'check_violation';
  end if;

  -- ยกเลิกได้เฉพาะการจองที่ยังไม่ถูกใช้ ที่นั่งแล้วต้องให้พนักงานจัดการ
  if v_row.status <> 'HELD' then
    raise exception 'การจองนี้ยกเลิกเองไม่ได้แล้ว กรุณาติดต่อร้าน'
      using errcode = 'check_violation';
  end if;

  -- ใช้ RELEASED ตัวเดียวกับที่ fn_sweep_expired_holds ใช้ปล่อยการจองที่หมดเวลา
  -- ผลลัพธ์ทางธุรกิจเหมือนกันคือสิทธิ์กันโต๊ะถูกคืน จึงไม่เพิ่มค่าใหม่ใน enum
  update reservation
     set status = 'RELEASED'
   where reservation_id = v_row.reservation_id
  returning * into v_row;

  -- คืนโต๊ะที่กันไว้ ถ้าพนักงานผูกโต๊ะให้แล้ว
  if v_row.table_id is not null then
    update dining_table set status = 'AVAILABLE'
     where table_id = v_row.table_id and status = 'RESERVED';
  end if;

  return to_jsonb(v_row) - 'contact_phone';
end $$;

grant execute on function fn_find_reservation(text, text)   to anon, authenticated;
grant execute on function fn_cancel_reservation(text, text) to anon, authenticated;
