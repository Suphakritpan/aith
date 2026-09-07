-- 0005_orders_and_service.sql
-- กลุ่ม 4 (ส่วนธุรกรรม) — การสั่งอาหารและคำเรียกบริการ
-- อ้างอิง: Read/System Design.md §06, §07
--
-- order_item ไม่มีคอลัมน์ราคาโดยเจตนา (ADR-02) เพราะร้านคิดเงินต่อหัว
-- การมีราคาต่อจานจะสร้างแหล่งความจริงซ้อนที่ทำให้ยอดบิลไม่ตรงกัน

-- หนึ่งรอบที่กดสั่ง idempotency_key กันการกดซ้ำตอนเน็ตช้า (ADR-07)
create table order_batch (
  order_batch_id  uuid primary key default gen_random_uuid(),
  visit_id        uuid not null references visit(visit_id),
  source          order_source not null,
  created_by      uuid references staff(staff_id),
  idempotency_key text not null unique,
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  -- ออเดอร์ที่พนักงานสั่งแทนต้องรู้ว่าใครสั่ง ออเดอร์ลูกค้าไม่ต้องมี
  constraint staff_order_needs_actor check (
    source <> 'STAFF' or created_by is not null
  )
);

create index on order_batch (visit_id) where deleted_at is null;

create table order_item (
  order_item_id  uuid primary key default gen_random_uuid(),
  order_batch_id uuid not null references order_batch(order_batch_id),
  menu_item_id   uuid not null references menu_item(menu_item_id),
  qty            int not null check (qty > 0),
  status         order_status not null default 'PENDING',
  cancel_reason  text,
  served_at      timestamptz,
  deleted_at     timestamptz,
  -- ยกเลิกหลังส่งครัวแล้วต้องมีเหตุผลเสมอ
  constraint cancel_needs_reason check (
    status <> 'CANCELLED' or char_length(coalesce(cancel_reason, '')) > 0
  )
);

create index on order_item (order_batch_id) where deleted_at is null;
create index on order_item (status) where deleted_at is null and status in ('PENDING', 'PREPARING');

-- คำเรียกพนักงาน มีเจ้าของงานและเวลานับขึ้น
-- TIME_WARNING ถูกสร้างโดยระบบที่นาทีที่ duration - 15 (BR-05)
create table service_call (
  service_call_id uuid primary key default gen_random_uuid(),
  visit_id        uuid not null references visit(visit_id),
  type            service_call_type not null,
  status          service_call_status not null default 'OPEN',
  note            text,
  accepted_by     uuid references staff(staff_id),
  created_at      timestamptz not null default now(),
  accepted_at     timestamptz,
  done_at         timestamptz,
  deleted_at      timestamptz
);

create index on service_call (visit_id) where deleted_at is null;
create index on service_call (status) where deleted_at is null and status <> 'DONE';

-- กัน TIME_WARNING ซ้ำ: หนึ่ง Visit เตือนได้ครั้งเดียว
create unique index service_call_one_time_warning
  on service_call (visit_id) where type = 'TIME_WARNING' and deleted_at is null;
