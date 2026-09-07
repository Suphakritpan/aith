-- 0003_package_and_menu.sql
-- กลุ่ม 4 (ส่วนข้อมูลหลัก) — แพ็กเกจ ราคา add-on และเมนู
-- อ้างอิง: Read/System Design.md §06, §10
--
-- ร้านไม่ใช่ a la carte: ราคาผูกกับ "หัวคน" ผ่าน package_price ไม่ใช่ผูกกับจาน
-- menu_item จึงไม่มีคอลัมน์ราคาเลย (ADR-02)

create table package (
  package_id       uuid primary key default gen_random_uuid(),
  branch_id        uuid not null references branch(branch_id),
  name             text not null,
  duration_minutes int not null default 120 check (duration_minutes > 0),
  -- เกินเวลาแล้วคิดเต็มรอบใหม่ — ไม่มีโหมดคิดตามนาที (BR-05)
  overtime_mode    overtime_mode not null default 'FULL_ROUND',
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

-- ราคาแยกตาม tier และมี effective_from เพื่อเก็บประวัติเมื่อขึ้นราคา
-- บิลเก่าไม่เปลี่ยนตาม เพราะ visit_pax เก็บ snapshot ราคาไว้แล้ว
create table package_price (
  package_price_id uuid primary key default gen_random_uuid(),
  package_id       uuid not null references package(package_id),
  tier             pax_tier not null,
  price            numeric(10,2) not null check (price >= 0),
  effective_from   date not null default current_date,
  unique (package_id, tier, effective_from)
);

create table addon (
  addon_id      uuid primary key default gen_random_uuid(),
  branch_id     uuid not null references branch(branch_id),
  name          text not null,                   -- น้ำรีฟิล
  price         numeric(10,2) not null check (price >= 0),
  charge_basis  addon_charge_basis not null default 'PER_HEAD',
  is_active     boolean not null default true,
  deleted_at    timestamptz
);

create table menu_category (
  category_id uuid primary key default gen_random_uuid(),
  branch_id   uuid not null references branch(branch_id),
  name        text not null,
  sort_order  int not null default 0,
  deleted_at  timestamptz
);

create table menu_item (
  menu_item_id uuid primary key default gen_random_uuid(),
  category_id  uuid not null references menu_category(category_id),
  package_id   uuid not null references package(package_id),
  name         text not null,
  image_path   text,
  -- 86 list: ของหมดระหว่างวัน ปิดได้จากหน้าครัว/Admin โดยไม่ต้องลบเมนู
  is_available boolean not null default true,
  sort_order   int not null default 0,
  deleted_at   timestamptz
);

create index on menu_item (category_id) where deleted_at is null;

-- ค่าคอนฟิกร้าน เช่น เวลาเตือนล่วงหน้า เกณฑ์ no-show ระยะห่างการเรียกคิว
create table app_setting (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
