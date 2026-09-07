-- 0008_business_rules.sql
-- กฎธุรกิจ BR-01 ถึง BR-10 บังคับที่ฐานข้อมูล
-- อ้างอิง: Read/System Design.md §01, §05, §08
--
-- กฎทั้งหมดนี้เป็น "กฎเงิน" ไม่ใช่กฎหน้าจอ การซ่อนปุ่มใน UI อย่างเดียวถือว่าไม่ผ่าน
-- เพราะผู้ใช้ที่ยิง API ตรงจะข้ามกฎได้ trigger ด้านล่างจึงเป็นด่านสุดท้ายเสมอ

-- ── State machine ของ Visit (§05) ──────────────────────────────────────────
-- ปฏิเสธการเปลี่ยนสถานะที่ไม่มีในตาราง transition ไม่ใช่แค่ซ่อนปุ่ม

create or replace function fn_visit_transition_allowed(
  p_from visit_status,
  p_to   visit_status
) returns boolean
language sql immutable as $$
  select case
           when p_from = p_to then true                       -- อัปเดตฟิลด์อื่นโดยไม่เปลี่ยนสถานะ
           when p_to = 'VOIDED' then true                      -- ทุกสถานะ → VOIDED (มีเหตุผล)
           when p_from = 'QUEUED'         and p_to = 'SEATED'          then true
           when p_from = 'SEATED'         and p_to = 'DINING'          then true
           when p_from = 'SEATED'         and p_to = 'BILL_REQUESTED'  then true
           when p_from = 'DINING'         and p_to = 'BILL_REQUESTED'  then true
           when p_from = 'BILL_REQUESTED' and p_to = 'DINING'          then true
           when p_from = 'BILL_REQUESTED' and p_to = 'PAID'            then true
           when p_from = 'PAID'           and p_to = 'CLOSED'          then true
           else false
         end;
$$;

create or replace function trg_visit_transition_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if not fn_visit_transition_allowed(old.status, new.status) then
    raise exception 'เปลี่ยนสถานะ Visit จาก % เป็น % ไม่ได้', old.status, new.status
      using errcode = 'check_violation';
  end if;

  -- ถอยกลับ BILL_REQUESTED → DINING ได้เฉพาะเมื่อยังไม่มี payment ใดบันทึกไว้
  if old.status = 'BILL_REQUESTED' and new.status = 'DINING' then
    if exists (
      select 1 from payment p
        join bill b on b.bill_id = p.bill_id
       where b.visit_id = new.visit_id
         and p.deleted_at is null and b.deleted_at is null
    ) then
      raise exception 'มีการชำระเงินแล้ว ย้อนกลับไปสั่งอาหารต่อไม่ได้'
        using errcode = 'check_violation';
    end if;
    update bill set deleted_at = now()
     where visit_id = new.visit_id and deleted_at is null;
  end if;

  return new;
end $$;

create trigger t01_visit_transition_guard
  before update of status on visit
  for each row execute function trg_visit_transition_guard();

-- ── BR-06 · ปิด Visit ได้เมื่อยอดค้างเป็นศูนย์ ─────────────────────────────

create or replace function trg_close_requires_full_payment() returns trigger
language plpgsql set search_path = public as $$
declare
  v_total numeric(10,2);
  v_paid  numeric(10,2);
begin
  if new.status in ('PAID', 'CLOSED') and old.status = 'BILL_REQUESTED' then
    select b.net_total, coalesce(sum(p.amount), 0)
      into v_total, v_paid
      from bill b
      left join payment p on p.bill_id = b.bill_id and p.deleted_at is null
     where b.visit_id = new.visit_id and b.deleted_at is null
     group by b.net_total;

    if v_total is null then
      raise exception 'ยังไม่ได้ออกบิลสำหรับ Visit นี้' using errcode = 'check_violation';
    end if;

    if v_paid is distinct from v_total then
      raise exception 'ยอดค้าง % บาท ยังปิดโต๊ะไม่ได้', v_total - coalesce(v_paid, 0)
        using errcode = 'check_violation';
    end if;

    new.paid_at := coalesce(new.paid_at, now());
  end if;

  if new.status = 'CLOSED' and old.status <> 'CLOSED' then
    new.closed_at := now();

    -- BR-02 · qr_token หมดอายุทันทีที่ปิดโต๊ะ
    update qr_session
       set revoked_at = now(), expires_at = coalesce(expires_at, now())
     where visit_id = new.visit_id and revoked_at is null;

    -- โต๊ะเข้าสถานะ CLEANING ก่อน แล้วพนักงานกดคืนเป็น AVAILABLE เมื่อเก็บโต๊ะเสร็จ
    update dining_table
       set status = 'CLEANING'
     where table_id in (
       select table_id from visit_table
        where visit_id = new.visit_id and released_at is null
     );

    update visit_table
       set released_at = now()
     where visit_id = new.visit_id and released_at is null;
  end if;

  return new;
end $$;

create trigger t02_close_requires_full_payment
  before update of status on visit
  for each row execute function trg_close_requires_full_payment();

-- ── BR-07 · รวมบิลได้เฉพาะโต๊ะจากคิวเดียวกัน ───────────────────────────────

create or replace function trg_bill_group_same_queue() returns trigger
language plpgsql set search_path = public as $$
declare v_expected uuid;
begin
  if new.bill_group_id is null then return new; end if;

  select queue_ticket_id into v_expected
    from bill_group where bill_group_id = new.bill_group_id;

  if new.queue_ticket_id is distinct from v_expected then
    raise exception 'รวมบิลได้เฉพาะโต๊ะที่เช็คอินจากคิวเดียวกัน'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger t03_bill_group_same_queue
  before insert or update of bill_group_id on visit
  for each row execute function trg_bill_group_same_queue();

-- ── BR-03 · เพิ่มคนได้ ลดคนไม่ได้ ──────────────────────────────────────────

create or replace function trg_pax_no_decrease() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.qty < old.qty then
    raise exception 'ลดจำนวนคนไม่ได้ (จาก % เป็น %) ต้องยกเลิก Visit โดยหัวหน้ากะ',
      old.qty, new.qty using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger t01_pax_no_decrease
  before update of qty on visit_pax
  for each row execute function trg_pax_no_decrease();

-- ── BR-01 · ออเดอร์รับได้เฉพาะสถานะ DINING ─────────────────────────────────
-- และเลื่อน SEATED → DINING อัตโนมัติเมื่อออเดอร์แรกสำเร็จ

create or replace function trg_order_only_when_dining() returns trigger
language plpgsql set search_path = public as $$
declare v_status visit_status;
begin
  select status into v_status from visit
   where visit_id = new.visit_id and deleted_at is null
   for update;

  if v_status is null then
    raise exception 'ไม่พบ Visit %', new.visit_id using errcode = 'check_violation';
  end if;

  if v_status = 'SEATED' then
    update visit
       set status = 'DINING', first_order_at = coalesce(first_order_at, now())
     where visit_id = new.visit_id;
  elsif v_status <> 'DINING' then
    raise exception 'รับออเดอร์ไม่ได้: สถานะปัจจุบันคือ %', v_status
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger t01_order_only_when_dining
  before insert on order_batch
  for each row execute function trg_order_only_when_dining();

-- ── สถานะอาหารเดินหน้าอย่างเดียว ข้ามขั้นไม่ได้ ────────────────────────────

create or replace function trg_order_item_status_flow() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status = old.status then return new; end if;

  if not (
       (old.status = 'PENDING'   and new.status in ('PREPARING', 'CANCELLED'))
    or (old.status = 'PREPARING' and new.status in ('SERVED', 'CANCELLED'))
  ) then
    raise exception 'เปลี่ยนสถานะอาหารจาก % เป็น % ไม่ได้', old.status, new.status
      using errcode = 'check_violation';
  end if;

  if new.status = 'SERVED' then
    new.served_at := coalesce(new.served_at, now());
  end if;
  return new;
end $$;

create trigger t01_order_item_status_flow
  before update of status on order_item
  for each row execute function trg_order_item_status_flow();

-- ── ยอดชำระรวมต้องไม่เกินยอดสุทธิของบิล (BR-06) ────────────────────────────

create or replace function trg_payment_not_exceed_total() returns trigger
language plpgsql set search_path = public as $$
declare
  v_total numeric(10,2);
  v_paid  numeric(10,2);
begin
  select net_total into v_total from bill
   where bill_id = new.bill_id and deleted_at is null
   for update;

  if v_total is null then
    raise exception 'ไม่พบบิล หรือบิลถูกยกเลิกไปแล้ว' using errcode = 'check_violation';
  end if;

  select coalesce(sum(amount), 0) into v_paid
    from payment
   where bill_id = new.bill_id and deleted_at is null
     and payment_id is distinct from new.payment_id;

  if v_paid + new.amount > v_total then
    raise exception 'ผลรวมการชำระ % เกินยอดสุทธิ % บาท', v_paid + new.amount, v_total
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger t01_payment_not_exceed_total
  before insert or update of amount on payment
  for each row execute function trg_payment_not_exceed_total();

-- ── add-on แบบ PER_HEAD สั่งได้ไม่เกินจำนวนหัวที่จ่ายเงิน ───────────────────

create or replace function trg_addon_within_paying_pax() returns trigger
language plpgsql set search_path = public as $$
declare
  v_basis addon_charge_basis;
  v_pax   int;
begin
  select charge_basis into v_basis from addon where addon_id = new.addon_id;

  if v_basis = 'PER_HEAD' then
    v_pax := fn_paying_pax(new.visit_id);
    if new.qty > v_pax then
      raise exception 'เลือก add-on % ที่ เกินจำนวนคนที่จ่ายเงิน % คน', new.qty, v_pax
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

create trigger t01_addon_within_paying_pax
  before insert or update of qty on visit_addon
  for each row execute function trg_addon_within_paying_pax();

-- ── BR-10 · ทุกการเปลี่ยนแปลงลง audit_log (append-only) ────────────────────

create or replace function trg_write_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_action audit_action;
  v_id     uuid;
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

  insert into audit_log (table_name, record_id, action, actor_staff_id, before, after)
  values (tg_table_name, v_id, v_action, fn_my_staff_id(),
          case when tg_op = 'INSERT' then null else to_jsonb(old) end,
          to_jsonb(new));

  return null;
end $$;

create trigger t99_audit after insert or update on visit
  for each row execute function trg_write_audit('visit_id');
create trigger t99_audit after insert or update on bill
  for each row execute function trg_write_audit('bill_id');
create trigger t99_audit after insert or update on payment
  for each row execute function trg_write_audit('payment_id');
create trigger t99_audit after insert or update on visit_pax
  for each row execute function trg_write_audit('visit_pax_id');
create trigger t99_audit after insert or update on menu_item
  for each row execute function trg_write_audit('menu_item_id');
create trigger t99_audit after insert or update on package_price
  for each row execute function trg_write_audit('package_price_id');
