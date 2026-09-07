-- 0002_shop_and_queue.sql
-- กลุ่ม 1 (โครงร้านและผู้ใช้) และกลุ่ม 2 (คิวและการจอง)
-- อ้างอิง: Read/System Design.md §06
--
-- ทุกตารางข้อมูลปฏิบัติการมี branch_id ตั้งแต่วันแรก แม้ UI จะแสดงสาขาเดียว
-- การขยายหลายสาขาในอนาคตจึงไม่ต้อง migrate ข้อมูล เพียงเพิ่มแถวใน branch

-- ── กลุ่ม 1 · โครงร้านและผู้ใช้ ──────────────────────────────────────────────

create table branch (
  branch_id  uuid primary key default gen_random_uuid(),
  name       text not null,
  address    text,
  open_time  time not null default '11:00',
  close_time time not null default '22:00',
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table staff (
  staff_id      uuid primary key default gen_random_uuid(),
  branch_id     uuid not null references branch(branch_id),
  auth_user_id  uuid unique references auth.users(id) on delete set null,
  full_name     text not null,
  role          staff_role not null default 'STAFF',
  -- PIN ยืนยันซ้ำสำหรับรายการที่มีผลทางการเงิน เก็บเป็น bcrypt hash เท่านั้น
  pin_hash      text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create index on staff (branch_id) where deleted_at is null;

create table zone (
  zone_id    uuid primary key default gen_random_uuid(),
  branch_id  uuid not null references branch(branch_id),
  name       text not null,          -- ห้องแอร์ / นอกอาคาร
  sort_order int not null default 0,
  deleted_at timestamptz
);

create table dining_table (
  table_id       uuid primary key default gen_random_uuid(),
  branch_id      uuid not null references branch(branch_id),
  zone_id        uuid references zone(zone_id),
  table_no       text not null,
  seat_capacity  int not null check (seat_capacity > 0),
  status         table_status not null default 'AVAILABLE',
  deleted_at     timestamptz,
  unique (branch_id, table_no)
);

create index on dining_table (branch_id, status) where deleted_at is null;

-- ── กลุ่ม 2 · คิวและการจอง ──────────────────────────────────────────────────

-- เลขคิวมีอักษรนำตามขนาดกลุ่มและรีเซ็ตรายวัน จึง unique ต่อ (สาขา, วันที่, ช่อง)
create table queue_ticket (
  queue_ticket_id uuid primary key default gen_random_uuid(),
  branch_id       uuid not null references branch(branch_id),
  service_date    date not null default current_date,
  lane            queue_lane not null,
  seq_no          int not null check (seq_no > 0),
  party_size      int not null check (party_size > 0),
  -- PII: ลบอัตโนมัติหลังปิดโต๊ะเกิน 24 ชม. (§12 PDPA)
  phone           text,
  status          queue_status not null default 'WAITING',
  -- token ที่ลูกค้าใช้เปิดหน้าดูคิวของตัวเอง โดยไม่ต้องล็อกอิน
  public_token    text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (branch_id, service_date, lane, seq_no)
);

create index on queue_ticket (branch_id, service_date, status) where deleted_at is null;

create table queue_call (
  queue_call_id   uuid primary key default gen_random_uuid(),
  queue_ticket_id uuid not null references queue_ticket(queue_ticket_id),
  called_by       uuid references staff(staff_id),
  called_at       timestamptz not null default now(),
  call_no         int not null check (call_no between 1 and 3),
  unique (queue_ticket_id, call_no)
);

create table reservation (
  reservation_id uuid primary key default gen_random_uuid(),
  branch_id      uuid not null references branch(branch_id),
  table_id       uuid references dining_table(table_id),
  reserved_for   timestamptz not null,
  party_size     int not null check (party_size > 0),
  -- กันโต๊ะไว้ 15 นาทีหลังเวลานัด
  -- ใช้ trigger ไม่ใช่ generated column เพราะ timestamptz + interval เป็น stable ไม่ใช่ immutable
  hold_until     timestamptz not null,
  status         reservation_status not null default 'HELD',
  contact_phone  text,
  created_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

create or replace function trg_reservation_hold_until() returns trigger
language plpgsql set search_path = public as $$
begin
  new.hold_until := new.reserved_for + interval '15 minutes';
  return new;
end $$;

create trigger t01_reservation_hold_until
  before insert or update of reserved_for on reservation
  for each row execute function trg_reservation_hold_until();

-- ข้อความแจ้งคิว: เวอร์ชันนี้ไม่ส่งออกจริง เขียนลงตารางนี้อย่างเดียว (§12 mock)
create table notification_log (
  notification_id uuid primary key default gen_random_uuid(),
  queue_ticket_id uuid references queue_ticket(queue_ticket_id),
  channel         notification_channel not null,
  payload         jsonb not null,
  sent_at         timestamptz not null default now(),
  is_mock         boolean not null default true
);
