-- ============================================================
-- หมากระทุปุ๊ป๊ะ — Core Schema (P0)
-- Queue → Table → Visit → Order → Kitchen → Bill → Payment
-- ============================================================

create extension if not exists pgcrypto;

-- ===== ENUMS =====
create type app_role            as enum ('customer','kitchen','staff','cashier','manager','owner');
create type queue_status        as enum ('waiting','called','seated','cancelled','no_show');
create type table_status        as enum ('available','reserved','occupied','billing','cleaning');
create type visit_status        as enum ('open','billing','paid','closed','cancelled');
create type order_status        as enum ('pending','accepted','preparing','ready','served','cancelled');
create type prep_station        as enum ('kitchen','grill','drink','dessert');
create type menu_kind           as enum ('buffet','a_la_carte','addon','drink');
create type service_call_type   as enum ('staff','water','utensils','charcoal','bill','problem');
create type service_call_status as enum ('open','accepted','done','cancelled');
create type payment_method      as enum ('cash','promptpay','card','transfer');
create type payment_status      as enum ('pending','paid','failed','refunded');
create type point_txn_kind      as enum ('earn','redeem','adjust');

-- ===== PEOPLE =====
-- ต่อกับ auth.users แบบ 1:1 — role ที่นี่คือแหล่งความจริงเดียวของสิทธิ์ทั้งระบบ
create table profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text,
  phone        text,
  role         app_role not null default 'customer',
  points       integer  not null default 0,
  total_spent  numeric(12,2) not null default 0,
  is_active    boolean  not null default true,
  created_at   timestamptz not null default now()
);
create index on profiles (role) where role <> 'customer';

-- ===== ร้าน =====
create table dining_tables (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  zone       text,
  seats      smallint not null default 4,
  status     table_status not null default 'available',
  is_active  boolean not null default true,
  sort_order smallint not null default 0,
  updated_at timestamptz not null default now()
);

create table buffet_packages (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  price_adult  numeric(10,2) not null,
  price_child  numeric(10,2) not null default 0,
  minutes      smallint not null default 90,
  description  text,
  is_active    boolean not null default true,
  sort_order   smallint not null default 0
);

create table menu_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  sort_order smallint not null default 0,
  is_active  boolean not null default true
);

create table menu_items (
  id            uuid primary key default gen_random_uuid(),
  category_id   uuid references menu_categories on delete set null,
  name          text not null,
  description   text,
  image_url     text,
  price         numeric(10,2) not null default 0,
  kind          menu_kind not null default 'buffet',
  station       prep_station not null default 'kitchen',
  is_available  boolean not null default true,
  max_per_order smallint,
  sort_order    smallint not null default 0,
  created_at    timestamptz not null default now()
);
create index on menu_items (category_id, sort_order);

-- เมนูไหนรวมอยู่ในแพ็กเกจไหน
create table package_items (
  package_id   uuid not null references buffet_packages on delete cascade,
  menu_item_id uuid not null references menu_items on delete cascade,
  primary key (package_id, menu_item_id)
);

-- ===== QUEUE =====
create table queue_tickets (
  id            uuid primary key default gen_random_uuid(),
  ticket_no     text not null,
  service_date  date not null default (now() at time zone 'Asia/Bangkok')::date,
  party_size    smallint not null check (party_size > 0),
  contact_name  text,
  contact_phone text,
  status        queue_status not null default 'waiting',
  note          text,
  claim_token   text not null default encode(gen_random_bytes(16), 'hex') unique,
  created_at    timestamptz not null default now(),
  called_at     timestamptz,
  seated_at     timestamptz,
  unique (service_date, ticket_no)
);
create index on queue_tickets (status, created_at) where status in ('waiting', 'called');

-- ===== VISIT — หัวใจของระบบ =====
-- ทุก order / service call / bill ผูกอยู่กับ visit เดียว
create table visits (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  table_id        uuid references dining_tables on delete restrict,
  queue_ticket_id uuid references queue_tickets on delete set null,
  package_id      uuid references buffet_packages on delete restrict,
  member_id       uuid references profiles on delete set null,
  adults          smallint not null default 1,
  children        smallint not null default 0,
  status          visit_status not null default 'open',
  access_token    text not null default encode(gen_random_bytes(24), 'hex') unique,
  opened_at       timestamptz not null default now(),
  expires_at      timestamptz,
  closed_at       timestamptz,
  opened_by       uuid references profiles on delete set null,
  closed_by       uuid references profiles on delete set null,
  note            text
);
create index on visits (status) where status in ('open', 'billing');
create index on visits (table_id) where status in ('open', 'billing');

-- ใครสแกน QR เข้ามาบ้าง (anonymous user ก็นับ)
create table visit_guests (
  visit_id  uuid not null references visits on delete cascade,
  guest_id  uuid not null references auth.users on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (visit_id, guest_id)
);

-- ===== ORDERS =====
create table orders (
  id         uuid primary key default gen_random_uuid(),
  visit_id   uuid not null references visits on delete cascade,
  round_no   smallint not null default 1,
  status     order_status not null default 'pending',
  note       text,
  placed_by  uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on orders (visit_id, created_at);

create table order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders on delete cascade,
  menu_item_id  uuid references menu_items on delete set null,
  name_snapshot text not null,
  unit_price    numeric(10,2) not null default 0,
  qty           smallint not null check (qty > 0),
  station       prep_station not null default 'kitchen',
  status        order_status not null default 'pending',
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on order_items (status, station) where status in ('pending', 'accepted', 'preparing', 'ready');
create index on order_items (order_id);

-- ===== SERVICE CALL =====
create table service_calls (
  id          uuid primary key default gen_random_uuid(),
  visit_id    uuid not null references visits on delete cascade,
  table_id    uuid references dining_tables on delete set null,
  type        service_call_type not null default 'staff',
  note        text,
  status      service_call_status not null default 'open',
  created_at  timestamptz not null default now(),
  accepted_by uuid references profiles on delete set null,
  accepted_at timestamptz,
  done_at     timestamptz
);
create index on service_calls (status, created_at) where status in ('open', 'accepted');

-- ===== PROMOTION / BILL / PAYMENT =====
create table promotions (
  id        uuid primary key default gen_random_uuid(),
  code      text unique,
  name      text not null,
  kind      text not null check (kind in ('percent', 'amount')),
  value     numeric(10,2) not null,
  min_total numeric(10,2) not null default 0,
  starts_at timestamptz,
  ends_at   timestamptz,
  is_active boolean not null default true
);

create table bills (
  id             uuid primary key default gen_random_uuid(),
  visit_id       uuid not null references visits on delete cascade unique,
  subtotal       numeric(12,2) not null default 0,
  discount       numeric(12,2) not null default 0,
  service_charge numeric(12,2) not null default 0,
  vat            numeric(12,2) not null default 0,
  total          numeric(12,2) not null default 0,
  promotion_id   uuid references promotions on delete set null,
  status         payment_status not null default 'pending',
  issued_at      timestamptz not null default now(),
  issued_by      uuid references profiles on delete set null
);

create table payments (
  id          uuid primary key default gen_random_uuid(),
  bill_id     uuid not null references bills on delete cascade,
  method      payment_method not null,
  amount      numeric(12,2) not null,
  status      payment_status not null default 'pending',
  ref_no      text,
  paid_at     timestamptz,
  received_by uuid references profiles on delete set null,
  created_at  timestamptz not null default now()
);
create index on payments (bill_id);

create table point_transactions (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles on delete cascade,
  visit_id   uuid references visits on delete set null,
  points     integer not null,
  kind       point_txn_kind not null default 'earn',
  note       text,
  created_at timestamptz not null default now()
);

-- ===== AUDIT LOG =====
-- ใครแก้ราคา / ยกเลิกออเดอร์ / ให้ส่วนลด / ย้ายโต๊ะ / ปิดบิล
create table audit_logs (
  id         bigserial primary key,
  actor_id   uuid references auth.users on delete set null,
  action     text not null,
  entity     text not null,
  entity_id  text,
  before     jsonb,
  after      jsonb,
  created_at timestamptz not null default now()
);
create index on audit_logs (entity, entity_id, created_at desc);
