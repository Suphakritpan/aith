-- 0009_views.sql
-- View สำหรับหน้าจอที่ต้องอ่านข้อมูลรวมหลายตาราง
-- อ้างอิง: Read/System Design.md §04, §09, §10
--
-- ทุก view ตั้ง security_invoker = on เพื่อให้ RLS ของตารางต้นทางยังทำงาน
-- ถ้าไม่ตั้ง view จะรันด้วยสิทธิ์เจ้าของและกลายเป็นช่องอ่านข้ามสาขา

-- นาฬิกาและยอดปัจจุบันของ Visit ที่ยังไม่ปิด — ใช้ทั้ง Staff Dashboard และหน้าลูกค้า
create view v_visit_live with (security_invoker = on) as
select
  v.visit_id,
  v.branch_id,
  v.status,
  v.seated_at,
  v.duration_minutes,
  fn_elapsed_minutes(v.visit_id)                              as elapsed_minutes,
  greatest(0, v.duration_minutes - fn_elapsed_minutes(v.visit_id)) as remaining_minutes,
  fn_elapsed_minutes(v.visit_id) >= v.duration_minutes - 15   as is_time_warning,
  fn_elapsed_minutes(v.visit_id) > v.duration_minutes         as is_overtime,
  fn_paying_pax(v.visit_id)                                   as paying_pax,
  q.lane,
  q.seq_no,
  (
    select string_agg(dt.table_no, ', ' order by dt.table_no)
      from visit_table vt
      join dining_table dt on dt.table_id = vt.table_id
     where vt.visit_id = v.visit_id and vt.released_at is null
  ) as table_nos,
  (
    select count(*)
      from order_item oi
      join order_batch ob on ob.order_batch_id = oi.order_batch_id
     where ob.visit_id = v.visit_id
       and ob.deleted_at is null and oi.deleted_at is null
       and oi.status in ('PENDING', 'PREPARING')
  ) as open_item_count,
  (
    select count(*)
      from service_call sc
     where sc.visit_id = v.visit_id and sc.deleted_at is null and sc.status = 'OPEN'
  ) as open_call_count
from visit v
left join queue_ticket q on q.queue_ticket_id = v.queue_ticket_id
where v.deleted_at is null;

-- หน้าจอคิว TV: read-only แยกตามช่อง A / B / C
create view v_queue_board with (security_invoker = on) as
select
  q.branch_id,
  q.lane,
  q.seq_no,
  q.lane::text || '-' || lpad(q.seq_no::text, 3, '0') as ticket_no,
  q.party_size,
  q.status,
  q.created_at,
  (select max(c.called_at) from queue_call c where c.queue_ticket_id = q.queue_ticket_id) as last_called_at,
  (select count(*)         from queue_call c where c.queue_ticket_id = q.queue_ticket_id) as call_count
from queue_ticket q
where q.deleted_at is null
  and q.service_date = current_date
  and q.status in ('WAITING', 'CALLED');

-- ยอดรวมของกลุ่มที่รวมบิลข้ามโต๊ะ — ค่าเกินเวลาคิดต่อ Visit แล้วรวมที่นี่ (BR-08)
create view v_bill_group_total with (security_invoker = on) as
select
  g.bill_group_id,
  g.branch_id,
  g.queue_ticket_id,
  count(distinct v.visit_id)              as visit_count,
  coalesce(sum(b.net_total), 0)           as group_net_total,
  coalesce(sum(p.paid), 0)                as group_paid_total,
  coalesce(sum(b.net_total), 0) - coalesce(sum(p.paid), 0) as group_outstanding
from bill_group g
left join visit v on v.bill_group_id = g.bill_group_id and v.deleted_at is null
left join bill  b on b.visit_id = v.visit_id and b.deleted_at is null
left join lateral (
  select coalesce(sum(amount), 0) as paid
    from payment where bill_id = b.bill_id and deleted_at is null
) p on true
where g.deleted_at is null
group by g.bill_group_id, g.branch_id, g.queue_ticket_id;

-- รายงานรายวันสำหรับเจ้าของร้าน — VOIDED ไม่นับในยอดขาย (§05)
create view v_daily_sales with (security_invoker = on) as
select
  v.branch_id,
  date(v.closed_at)                                   as service_date,
  count(*)                                            as visit_count,
  sum(fn_paying_pax(v.visit_id))                      as guest_count,
  sum(b.net_total)                                    as gross_sales,
  round(avg(extract(epoch from (v.closed_at - v.seated_at)) / 60)) as avg_turn_minutes,
  sum(b.overtime_rounds)                              as overtime_rounds
from visit v
join bill b on b.visit_id = v.visit_id and b.deleted_at is null
where v.status = 'CLOSED' and v.deleted_at is null
group by v.branch_id, date(v.closed_at);

-- เมนูยอดนิยม: นับ "จำนวนที่สั่ง" ไม่ใช่ยอดเงิน เพราะเมนูไม่มีราคาต่อจาน (ADR-02)
create view v_menu_popularity with (security_invoker = on) as
select
  v.branch_id,
  date(ob.created_at)  as service_date,
  mi.menu_item_id,
  mi.name              as menu_name,
  sum(oi.qty)          as ordered_qty,
  count(distinct v.visit_id) as visit_count
from order_item oi
join order_batch ob on ob.order_batch_id = oi.order_batch_id
join visit v        on v.visit_id = ob.visit_id
join menu_item mi   on mi.menu_item_id = oi.menu_item_id
where oi.deleted_at is null and ob.deleted_at is null and v.deleted_at is null
  and oi.status <> 'CANCELLED'
group by v.branch_id, date(ob.created_at), mi.menu_item_id, mi.name;

-- คิวงานของครัว: ครัวเดียว ไม่แยกสถานี (§04 ขั้นที่ 08)
create view v_kitchen_queue with (security_invoker = on) as
select
  oi.order_item_id,
  oi.status,
  oi.qty,
  mi.name          as menu_name,
  ob.order_batch_id,
  ob.created_at    as ordered_at,
  v.visit_id,
  v.branch_id,
  (
    select string_agg(dt.table_no, ', ' order by dt.table_no)
      from visit_table vt
      join dining_table dt on dt.table_id = vt.table_id
     where vt.visit_id = v.visit_id and vt.released_at is null
  ) as table_nos
from order_item oi
join order_batch ob on ob.order_batch_id = oi.order_batch_id
join visit v        on v.visit_id = ob.visit_id
join menu_item mi   on mi.menu_item_id = oi.menu_item_id
where oi.deleted_at is null and ob.deleted_at is null and v.deleted_at is null
  and oi.status in ('PENDING', 'PREPARING');
