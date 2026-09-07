-- 0004_visit.sql
-- กลุ่ม 3 — Visit คือ aggregate root ของทั้งระบบ (ADR-01)
-- อ้างอิง: Read/System Design.md §06, §07, §08 ข้อ 1-2
--
-- Visit หนึ่งแถว = การใช้บริการหนึ่งครั้งของลูกค้าหนึ่งกลุ่ม
-- เวลา ออเดอร์ และเงินอ้างมาที่นี่ทั้งหมด ย้ายโต๊ะแล้วออเดอร์จึงไม่หลุด

-- ชั้นรวมบิลข้ามโต๊ะ ต้องประกาศก่อน visit เพราะ visit อ้างถึง (ADR-05)
create table bill_group (
  bill_group_id   uuid primary key default gen_random_uuid(),
  branch_id       uuid not null references branch(branch_id),
  -- ทุก visit ในกลุ่มต้องมาจากคิวใบนี้ (BR-07)
  queue_ticket_id uuid not null references queue_ticket(queue_ticket_id),
  created_by      uuid references staff(staff_id),
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create table visit (
  visit_id          uuid primary key default gen_random_uuid(),
  branch_id         uuid not null references branch(branch_id),
  queue_ticket_id   uuid references queue_ticket(queue_ticket_id),
  package_id        uuid not null references package(package_id),
  bill_group_id     uuid references bill_group(bill_group_id),
  status            visit_status not null default 'SEATED',
  -- จุดเริ่มนาฬิกา 120 นาที — โต๊ะและคนที่เพิ่มภายหลังใช้ค่านี้ร่วมกัน (BR-04)
  seated_at         timestamptz not null default now(),
  first_order_at    timestamptz,
  bill_requested_at timestamptz,
  paid_at           timestamptz,
  closed_at         timestamptz,
  -- snapshot ระยะเวลาแพ็กเกจ เพื่อไม่ให้บิลเก่าเปลี่ยนเมื่อร้านแก้แพ็กเกจ
  duration_minutes  int not null default 120 check (duration_minutes > 0),
  void_reason       text,
  created_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  constraint void_needs_reason check (
    status <> 'VOIDED' or char_length(coalesce(void_reason, '')) >= 10
  )
);

create index on visit (branch_id, status) where deleted_at is null;
create index on visit (queue_ticket_id) where deleted_at is null;
create index on visit (bill_group_id) where bill_group_id is not null;

-- ประวัติการครองโต๊ะ รองรับกดเพิ่มโต๊ะบน Visit เดิมสำหรับกลุ่มใหญ่
create table visit_table (
  visit_table_id uuid primary key default gen_random_uuid(),
  visit_id       uuid not null references visit(visit_id),
  table_id       uuid not null references dining_table(table_id),
  assigned_at    timestamptz not null default now(),
  released_at    timestamptz
);

create unique index visit_table_one_active_per_table
  on visit_table (table_id) where released_at is null;

-- จำนวนคนแยกตามช่วงราคา เป็นตัวตั้งของค่าบุฟเฟต์ ค่าเกินเวลา และการหารบิล
create table visit_pax (
  visit_pax_id       uuid primary key default gen_random_uuid(),
  visit_id           uuid not null references visit(visit_id),
  tier               pax_tier not null,
  qty                int not null check (qty >= 0),
  -- snapshot ราคาตอนเช็คอิน — TODDLER_FREE เก็บเป็น 0.00
  unit_price         numeric(10,2) not null check (unit_price >= 0),
  -- พนักงานที่กดยืนยันส่วนสูงไม่เกิน 90 ซม.
  height_verified_by uuid references staff(staff_id),
  unique (visit_id, tier),
  constraint toddler_needs_verify check (
    tier <> 'TODDLER_FREE' or qty = 0 or height_verified_by is not null
  ),
  constraint toddler_is_free check (
    tier <> 'TODDLER_FREE' or unit_price = 0
  )
);

-- add-on เก็บเป็น "จำนวน" ไม่ระบุตัวบุคคล เพื่อลด PII (ADR-03)
create table visit_addon (
  visit_addon_id uuid primary key default gen_random_uuid(),
  visit_id       uuid not null references visit(visit_id),
  addon_id       uuid not null references addon(addon_id),
  qty            int not null check (qty >= 0),
  unit_price     numeric(10,2) not null check (unit_price >= 0),
  unique (visit_id, addon_id)
);

-- QR ผูกกับ visit ไม่ใช่โต๊ะ ปิดโต๊ะแล้ว token หมดอายุทันที (BR-02)
create table qr_session (
  qr_session_id uuid primary key default gen_random_uuid(),
  visit_id      uuid not null references visit(visit_id),
  token         text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  issued_at     timestamptz not null default now(),
  expires_at    timestamptz,
  revoked_at    timestamptz
);

create index on qr_session (visit_id) where revoked_at is null;
