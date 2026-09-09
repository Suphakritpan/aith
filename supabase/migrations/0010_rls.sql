-- 0010_rls.sql
-- Row Level Security — สามบทบาท และการซ่อน soft delete
-- อ้างอิง: Read/System Design.md §01 BR-10, §02, §08 ข้อ 7, ADR-06
--
-- ลูกค้าไม่มี policy เลยโดยเจตนา: ลูกค้าไม่ล็อกอินจึงไม่มีตัวตนให้ RLS เทียบ
-- หน้า Customer Web เข้าถึงข้อมูลผ่าน Edge Function ที่ตรวจ qr_token แล้วใช้ service role
-- (service role ข้าม RLS โดยธรรมชาติ จึงไม่ต้องเปิดสิทธิ์ให้ anon ที่นี่)

-- ── เปิด RLS ทุกตาราง ──────────────────────────────────────────────────────

alter table branch            enable row level security;
alter table staff             enable row level security;
alter table zone              enable row level security;
alter table dining_table      enable row level security;
alter table queue_ticket      enable row level security;
alter table queue_call        enable row level security;
alter table reservation       enable row level security;
alter table notification_log  enable row level security;
alter table package           enable row level security;
alter table package_price     enable row level security;
alter table addon             enable row level security;
alter table menu_category     enable row level security;
alter table menu_item         enable row level security;
alter table app_setting       enable row level security;
alter table bill_group        enable row level security;
alter table visit             enable row level security;
alter table visit_table       enable row level security;
alter table visit_pax         enable row level security;
alter table visit_addon       enable row level security;
alter table qr_session        enable row level security;
alter table order_batch       enable row level security;
alter table order_item        enable row level security;
alter table service_call      enable row level security;
alter table bill              enable row level security;
alter table payment           enable row level security;
alter table member            enable row level security;
alter table member_consent    enable row level security;
alter table point_transaction enable row level security;
alter table inventory_item    enable row level security;
alter table stock_count       enable row level security;
alter table audit_log         enable row level security;

-- ── ตัวช่วยตรวจว่าแถวลูกอยู่ในสาขาของผู้ใช้ ────────────────────────────────

create or replace function fn_visit_in_my_branch(p_visit_id uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from visit
     where visit_id = p_visit_id and branch_id = fn_my_branch_id()
  );
$$;

-- ── ข้อมูลหลัก: พนักงานอ่านได้ หัวหน้ากะขึ้นไปแก้ได้ ────────────────────────

create policy branch_read on branch for select
  using (deleted_at is null and branch_id = fn_my_branch_id());
create policy branch_write on branch for update
  using (fn_has_role('OWNER') and branch_id = fn_my_branch_id());

create policy staff_read on staff for select
  using (deleted_at is null and branch_id = fn_my_branch_id());
create policy staff_manage on staff for all
  using (fn_has_role('SUPERVISOR') and branch_id = fn_my_branch_id())
  with check (fn_has_role('SUPERVISOR') and branch_id = fn_my_branch_id());

create policy zone_read on zone for select
  using (deleted_at is null and branch_id = fn_my_branch_id());
create policy zone_manage on zone for all
  using (fn_has_role('SUPERVISOR') and branch_id = fn_my_branch_id())
  with check (fn_has_role('SUPERVISOR') and branch_id = fn_my_branch_id());

-- โต๊ะ: พนักงานเปลี่ยนสถานะได้ (เก็บโต๊ะเสร็จ → AVAILABLE) แต่เพิ่ม/ลบโต๊ะต้องหัวหน้ากะ
create policy table_read on dining_table for select
  using (deleted_at is null and branch_id = fn_my_branch_id());
create policy table_update on dining_table for update
  using (fn_has_role('STAFF') and branch_id = fn_my_branch_id())
  with check (branch_id = fn_my_branch_id());
create policy table_insert on dining_table for insert
  with check (fn_has_role('SUPERVISOR') and branch_id = fn_my_branch_id());

create policy package_read on package for select
  using (deleted_at is null and branch_id = fn_my_branch_id());
create policy package_manage on package for all
  using (fn_has_role('SUPERVISOR') and branch_id = fn_my_branch_id())
  with check (fn_has_role('SUPERVISOR') and branch_id = fn_my_branch_id());

-- ราคาเป็นข้อมูลเงิน: พนักงานหน้าร้านอ่านได้อย่างเดียว แก้ได้เฉพาะเจ้าของร้าน
create policy price_read on package_price for select using (true);
create policy price_manage on package_price for all
  using (fn_has_role('OWNER')) with check (fn_has_role('OWNER'));

create policy addon_read on addon for select
  using (deleted_at is null and branch_id = fn_my_branch_id());
create policy addon_manage on addon for all
  using (fn_has_role('OWNER') and branch_id = fn_my_branch_id())
  with check (fn_has_role('OWNER') and branch_id = fn_my_branch_id());

create policy category_read on menu_category for select
  using (deleted_at is null and branch_id = fn_my_branch_id());
create policy category_manage on menu_category for all
  using (fn_has_role('SUPERVISOR') and branch_id = fn_my_branch_id())
  with check (fn_has_role('SUPERVISOR') and branch_id = fn_my_branch_id());

create policy menu_read on menu_item for select using (deleted_at is null);
create policy menu_manage on menu_item for all
  using (fn_has_role('SUPERVISOR')) with check (fn_has_role('SUPERVISOR'));

create policy setting_read on app_setting for select using (fn_has_role('STAFF'));
create policy setting_manage on app_setting for all
  using (fn_has_role('OWNER')) with check (fn_has_role('OWNER'));

-- ── คิว ────────────────────────────────────────────────────────────────────

create policy queue_read on queue_ticket for select
  using (deleted_at is null and branch_id = fn_my_branch_id());
create policy queue_write on queue_ticket for all
  using (fn_has_role('STAFF') and branch_id = fn_my_branch_id())
  with check (fn_has_role('STAFF') and branch_id = fn_my_branch_id());

create policy queue_call_read on queue_call for select using (fn_has_role('STAFF'));
create policy queue_call_write on queue_call for insert
  with check (fn_has_role('STAFF'));

create policy reservation_read on reservation for select
  using (deleted_at is null and branch_id = fn_my_branch_id());
create policy reservation_write on reservation for all
  using (fn_has_role('STAFF') and branch_id = fn_my_branch_id())
  with check (fn_has_role('STAFF') and branch_id = fn_my_branch_id());

create policy notification_read on notification_log for select
  using (fn_has_role('SUPERVISOR'));

-- ── Visit และลูกทั้งหมด ────────────────────────────────────────────────────

-- พนักงานเห็นเฉพาะ Visit ที่ยังไม่ถูกลบ ในสาขาของตน
create policy staff_read_visit on visit for select
  using (
    deleted_at is null
    and fn_has_role('STAFF')
    and branch_id = fn_my_branch_id()
  );

-- หน้ากู้คืน: เห็นแถวที่ลบแล้วได้เฉพาะหัวหน้ากะและเจ้าของร้าน (BR-10)
create policy supervisor_read_deleted on visit for select
  using (deleted_at is not null and fn_has_role('SUPERVISOR'));

create policy staff_write_visit on visit for insert
  with check (fn_has_role('STAFF') and branch_id = fn_my_branch_id());
create policy staff_update_visit on visit for update
  using (fn_has_role('STAFF') and branch_id = fn_my_branch_id())
  with check (branch_id = fn_my_branch_id());

create policy visit_table_all on visit_table for all
  using (fn_has_role('STAFF') and fn_visit_in_my_branch(visit_id))
  with check (fn_has_role('STAFF') and fn_visit_in_my_branch(visit_id));

create policy visit_pax_all on visit_pax for all
  using (fn_has_role('STAFF') and fn_visit_in_my_branch(visit_id))
  with check (fn_has_role('STAFF') and fn_visit_in_my_branch(visit_id));

create policy visit_addon_all on visit_addon for all
  using (fn_has_role('STAFF') and fn_visit_in_my_branch(visit_id))
  with check (fn_has_role('STAFF') and fn_visit_in_my_branch(visit_id));

-- token อ่านได้เพื่อพิมพ์ QR ซ้ำ แต่แก้ไขไม่ได้จากฝั่ง client
create policy qr_read on qr_session for select
  using (fn_has_role('STAFF') and fn_visit_in_my_branch(visit_id));

create policy order_batch_all on order_batch for all
  using (fn_has_role('STAFF') and fn_visit_in_my_branch(visit_id))
  with check (fn_has_role('STAFF') and fn_visit_in_my_branch(visit_id));

create policy order_item_read on order_item for select using (fn_has_role('STAFF'));
create policy order_item_write on order_item for insert with check (fn_has_role('STAFF'));
create policy order_item_update on order_item for update
  using (fn_has_role('STAFF')) with check (fn_has_role('STAFF'));

create policy service_call_all on service_call for all
  using (fn_has_role('STAFF') and fn_visit_in_my_branch(visit_id))
  with check (fn_has_role('STAFF') and fn_visit_in_my_branch(visit_id));

-- ── เงิน ───────────────────────────────────────────────────────────────────

create policy bill_group_read on bill_group for select
  using (deleted_at is null and branch_id = fn_my_branch_id());
-- รวมบิลข้ามโต๊ะต้องให้หัวหน้ากะยืนยัน (BR-07)
create policy bill_group_write on bill_group for all
  using (fn_has_role('SUPERVISOR') and branch_id = fn_my_branch_id())
  with check (fn_has_role('SUPERVISOR') and branch_id = fn_my_branch_id());

create policy bill_read on bill for select
  using (deleted_at is null and fn_has_role('STAFF') and fn_visit_in_my_branch(visit_id));
create policy bill_write on bill for all
  using (fn_has_role('STAFF') and fn_visit_in_my_branch(visit_id))
  with check (fn_has_role('STAFF') and fn_visit_in_my_branch(visit_id));

create policy payment_read on payment for select
  using (deleted_at is null and fn_has_role('STAFF'));
create policy payment_write on payment for insert
  with check (fn_has_role('STAFF') and confirmed_by = fn_my_staff_id());
-- แก้ยอดที่บันทึกไปแล้วต้องหัวหน้ากะ เพราะเป็นการแก้ตัวเลขเงิน
create policy payment_update on payment for update
  using (fn_has_role('SUPERVISOR')) with check (fn_has_role('SUPERVISOR'));

-- ── สมาชิก สต๊อก และ audit ─────────────────────────────────────────────────

create policy member_read on member for select
  using (deleted_at is null and fn_has_role('STAFF'));
create policy member_manage on member for all
  using (fn_has_role('SUPERVISOR')) with check (fn_has_role('SUPERVISOR'));

create policy consent_read on member_consent for select using (fn_has_role('SUPERVISOR'));
create policy consent_write on member_consent for all
  using (fn_has_role('SUPERVISOR')) with check (fn_has_role('SUPERVISOR'));

create policy point_read on point_transaction for select using (fn_has_role('STAFF'));
create policy point_write on point_transaction for insert with check (fn_has_role('STAFF'));

create policy inventory_read on inventory_item for select
  using (deleted_at is null and branch_id = fn_my_branch_id());
create policy inventory_manage on inventory_item for all
  using (fn_has_role('SUPERVISOR') and branch_id = fn_my_branch_id())
  with check (fn_has_role('SUPERVISOR') and branch_id = fn_my_branch_id());

create policy stock_read on stock_count for select
  using (deleted_at is null and fn_has_role('STAFF'));
create policy stock_write on stock_count for all
  using (fn_has_role('STAFF')) with check (fn_has_role('STAFF'));

-- audit_log อ่านได้เฉพาะเจ้าของร้าน และเป็น append-only
create policy owner_read_audit on audit_log for select using (fn_has_role('OWNER'));

-- ── สิทธิ์ระดับตาราง ───────────────────────────────────────────────────────
-- RLS policy ไม่ได้ให้สิทธิ์ด้วยตัวเอง มันเพียงกรองแถวหลังจากผ่าน GRANT มาแล้ว
-- ถ้าไม่ GRANT ตรงนี้ พนักงานที่ล็อกอินจะอ่านอะไรไม่ได้เลยแม้ policy จะอนุญาต

grant usage on schema public to authenticated, service_role;
grant select, insert, update on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- ── BR-10 · ห้ามลบจริงทั้งระบบ ─────────────────────────────────────────────
-- ไม่มี policy สำหรับ DELETE เลย และถอนสิทธิ์ที่ระดับ grant อีกชั้นหนึ่ง

do $$
declare t record;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('revoke delete on public.%I from authenticated, anon', t.tablename);
  end loop;
end $$;

revoke update, delete on audit_log from authenticated, anon;

-- ลูกค้าไม่ยิงฐานข้อมูลตรง (ADR-06) จึงถอนสิทธิ์ anon ทั้งหมดใน schema public
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
