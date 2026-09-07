-- 0006_money_stock_audit.sql
-- กลุ่ม 5 — เงิน สมาชิก สต๊อก และการตรวจสอบ
-- อ้างอิง: Read/System Design.md §06, §07, §12
--
-- payment เป็นหลายแถวต่อหนึ่งบิล เพื่อรองรับการหารกันในโต๊ะ
-- ปิด Visit ได้เมื่อ SUM(payment.amount) = bill.net_total เท่านั้น (BR-06)

create table bill (
  bill_id          uuid primary key default gen_random_uuid(),
  visit_id         uuid not null unique references visit(visit_id),
  package_subtotal numeric(10,2) not null default 0 check (package_subtotal >= 0),
  addon_subtotal   numeric(10,2) not null default 0 check (addon_subtotal >= 0),
  overtime_rounds  int not null default 0 check (overtime_rounds >= 0),
  overtime_subtotal numeric(10,2) not null default 0 check (overtime_subtotal >= 0),
  discount_amount  numeric(10,2) not null default 0 check (discount_amount >= 0),
  net_total        numeric(10,2) not null check (net_total >= 0),
  split_mode       split_mode not null default 'EQUAL_PER_HEAD',
  issued_at        timestamptz not null default now(),
  deleted_at       timestamptz
);

create table payment (
  payment_id      uuid primary key default gen_random_uuid(),
  bill_id         uuid not null references bill(bill_id),
  method          payment_method not null,
  amount          numeric(10,2) not null check (amount > 0),
  -- เลขอ้างอิง PromptPay หรือ path สลิปโอนใน Storage
  reference       text,
  -- ระบบ mock ไม่มี webhook จึงต้องมีพนักงานรับผิดชอบทุกแถว
  confirmed_by    uuid not null references staff(staff_id),
  idempotency_key text not null unique,
  paid_at         timestamptz not null default now(),
  deleted_at      timestamptz
);

create index on payment (bill_id) where deleted_at is null;

-- ── สมาชิกและ PDPA ─────────────────────────────────────────────────────────

create table member (
  member_id      uuid primary key default gen_random_uuid(),
  phone          text not null unique,
  display_name   text,
  points_balance int not null default 0,
  created_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

-- ความยินยอมแยกเป็นรายวัตถุประสงค์ ถอนเฉพาะการตลาดได้โดยยังสะสมแต้มต่อ (ม.19)
create table member_consent (
  consent_id     uuid primary key default gen_random_uuid(),
  member_id      uuid not null references member(member_id),
  purpose        consent_purpose not null,
  granted_at     timestamptz not null default now(),
  revoked_at     timestamptz,
  policy_version text not null default 'v1',
  unique (member_id, purpose, granted_at)
);

create table point_transaction (
  point_txn_id uuid primary key default gen_random_uuid(),
  member_id    uuid not null references member(member_id),
  visit_id     uuid references visit(visit_id),
  points_delta int not null,
  reason       text not null,
  created_at   timestamptz not null default now()
);

-- ── สต๊อก: นับมือรายวัน ไม่ทำ BOM (ADR-09) ─────────────────────────────────

create table inventory_item (
  inventory_item_id uuid primary key default gen_random_uuid(),
  branch_id         uuid not null references branch(branch_id),
  name              text not null,
  unit              text not null,          -- กก. / ถาด
  deleted_at        timestamptz
);

create table stock_count (
  stock_count_id    uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references inventory_item(inventory_item_id),
  count_date        date not null default current_date,
  opening_qty       numeric(10,2) not null default 0,
  closing_qty       numeric(10,2) not null default 0,
  waste_qty         numeric(10,2) not null default 0 check (waste_qty >= 0),
  counted_by        uuid references staff(staff_id),
  note              text,
  deleted_at        timestamptz,
  unique (inventory_item_id, count_date)
);

-- ── audit_log: append-only ไม่มี UPDATE/DELETE (BR-10) ─────────────────────

create table audit_log (
  audit_id       uuid primary key default gen_random_uuid(),
  table_name     text not null,
  record_id      uuid not null,
  action         audit_action not null,
  actor_staff_id uuid references staff(staff_id),
  before         jsonb,
  after          jsonb,
  created_at     timestamptz not null default now()
);

create index on audit_log (table_name, record_id);
create index on audit_log (created_at desc);
