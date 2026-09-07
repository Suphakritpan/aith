# ฐานข้อมูล — หมากระทุปุ๊ป๊ะ

สคีมาชุดนี้เขียนตาม [Read/System Design.md](../Read/System%20Design.md) ทั้งฉบับ
โดยยึดว่า **กฎเงินต้องอยู่ในฐานข้อมูล ไม่ใช่ในหน้าจอ** — ทุกกฎใน §01 มี trigger หรือ constraint รองรับ
คนที่ยิง API ตรงจึงข้ามกฎไม่ได้ ถึงแม้จะไม่ผ่าน UI

## ลำดับ migration

| ไฟล์ | เนื้อหา | อ้างอิงสเปค |
| --- | --- | --- |
| `0001_enums.sql` | ENUM ทุกตัวของระบบ | §06 |
| `0002_shop_and_queue.sql` | สาขา พนักงาน โซน โต๊ะ คิว การจอง แจ้งเตือน | §06 กลุ่ม 1-2 |
| `0003_package_and_menu.sql` | แพ็กเกจ ราคาแยก tier add-on หมวดหมู่ เมนู ค่าคอนฟิก | §06 กลุ่ม 4 |
| `0004_visit.sql` | bill_group, visit, visit_table, visit_pax, visit_addon, qr_session | §06 กลุ่ม 3 |
| `0005_orders_and_service.sql` | order_batch, order_item, service_call | §06 กลุ่ม 4 |
| `0006_money_stock_audit.sql` | bill, payment, สมาชิก สต๊อก audit_log | §06 กลุ่ม 5 |
| `0007_functions.sql` | ตัวตนผู้ใช้ นาฬิกา Visit `fn_calc_bill` งานกวาดอัตโนมัติ | §08 ข้อ 6-7, §10 |
| `0008_business_rules.sql` | trigger บังคับ BR-01 ถึง BR-10 และ state machine | §01, §05, §08 |
| `0009_views.sql` | view สำหรับ Dashboard ครัว จอคิว และรายงาน | §04, §09 |
| `0010_rls.sql` | RLS สามบทบาท + ถอนสิทธิ์ DELETE ทั้งระบบ | §08 ข้อ 7, ADR-06 |
| `0011_seed.sql` | ข้อมูลตั้งต้นหนึ่งสาขา ราคา 289 / 189 / 0 | §10, §12 |

migration ชุดเดิม (ก่อนสเปคใหม่) ย้ายไปไว้ที่ [legacy/](legacy/) เพื่อเก็บประวัติ
ไฟล์ในนั้น **ไม่ถูกรัน** และใช้ชื่อตารางคนละชุดกับสเปคใหม่ จึงรันพร้อมกันไม่ได้

## วิธีติดตั้ง

```bash
supabase link --project-ref <project-ref>
supabase db push
```

ฐานข้อมูลปลายทางต้องเป็น schema `public` ที่ว่าง — ถ้ายังมีตารางของสคีมาเดิมอยู่ ต้องล้างก่อน
เพราะชื่อ ENUM หลายตัว (`visit_status`, `order_status`, `payment_method`) ชนกันแต่มีค่าไม่เหมือนกัน

## สิ่งที่ตรวจแล้วว่าทำงานจริง

รันสคีมาทั้งชุดบน PostgreSQL 17 (Supabase) ใน schema ชั่วคราวแล้วทดสอบ จากนั้นลบทิ้ง ผลคือ

**เครื่องคิดเงินตรงกับตัวอย่างทั้งสามข้อใน §10**

| สถานการณ์ | คาดไว้ | ได้จริง |
| --- | --- | --- |
| ผู้ใหญ่ 4 + รีฟิล 2 · 100 นาที | 1,234 | 1,234.00 |
| ผู้ใหญ่ 2 + เด็ก 1 + เด็กเล็กฟรี 1 + รีฟิล 3 · 118 นาที | 884 | 884.00 |
| ผู้ใหญ่ 3 · 135 นาที (เกินเวลา 1 รอบ) | 1,734 | 1,734.00 |

**กฎที่ทดสอบแล้วว่าปฏิเสธได้จริง**

- BR-01 สั่งอาหารตอนสถานะไม่ใช่ `DINING` · และออเดอร์แรกเลื่อน `SEATED → DINING` ให้เอง
- BR-02 ปิดโต๊ะแล้ว `qr_token` ถูกเพิกถอน โต๊ะเข้าสถานะ `CLEANING` และ `visit_table` ถูกปล่อย
- BR-03 ลดจำนวนคนไม่ได้
- BR-06 จ่ายเกินยอดไม่ได้ · จ่ายไม่ครบปิดโต๊ะไม่ได้ · จ่ายครบหลายแถวแล้วปิดได้
- BR-07 รวมบิลข้ามคิวไม่ได้
- BR-10 ทุกการเปลี่ยนแปลงของ visit / bill / payment ลง `audit_log`
- §05 ข้ามสถานะ (`SEATED → CLOSED`) ไม่ได้ · `VOIDED` ต้องมีเหตุผลอย่างน้อย 10 ตัวอักษร
- §06 โต๊ะเดียวถูกจองซ้อนสอง Visit ไม่ได้ · ออเดอร์ที่พนักงานสั่งแทนต้องระบุผู้สั่ง
- §07 เด็กเล็กฟรีต้องมีพนักงานยืนยันส่วนสูง
- §09 ข้ามสถานะอาหาร `PENDING → SERVED` ไม่ได้
- §10 add-on แบบต่อหัวเกินจำนวนคนที่จ่ายเงินไม่ได้
- ADR-07 `Idempotency-Key` ซ้ำถูกปฏิเสธทั้งที่ `order_batch` และ `payment`

## จุดที่ต่างจากตัวอย่าง SQL ในสเปค และเหตุผล

- `qr_session.token` และ `queue_ticket.public_token` สร้างจาก `gen_random_uuid()` ไม่ใช่
  `gen_random_bytes()` เพราะ `pgcrypto` บน Supabase ติดตั้งอยู่ใน schema `extensions`
  ไม่ใช่ `public` การเรียกแบบไม่ระบุ schema จึงหาไม่เจอ — UUID v4 สุ่มด้วย CSPRNG อยู่แล้ว
- `reservation.hold_until` ใช้ trigger แทน generated column เพราะ `timestamptz + interval`
  เป็น stable ไม่ใช่ immutable PostgreSQL จึงไม่ยอมให้ใช้ในนิพจน์ของ generated column
- ตอนปิดโต๊ะ โต๊ะเข้าสถานะ `CLEANING` ตามโค้ดใน §08 ไม่ใช่ `AVAILABLE` ตามตาราง transition ใน §05
  (สองส่วนของสเปคขัดกัน) — เลือกตาม §08 เพราะสะท้อนงานจริงที่ต้องเก็บโต๊ะก่อน
  พนักงานกดคืนเป็น `AVAILABLE` เองจากผังโต๊ะ

## งานที่ยังไม่ทำในชั้นฐานข้อมูล

- ยังไม่ได้ตั้ง `pg_cron` ให้เรียก `fn_sweep_no_show()`, `fn_sweep_time_warning()`
  และ `fn_sweep_expired_phone()` ตามรอบ — ตอนนี้ต้องเรียกจาก Edge Function หรือเรียกมือ
- ยังไม่ได้เปิด Realtime publication ให้ `visit`, `order_item`, `service_call`, `queue_ticket`
  ตามที่ §02 ระบุ
- `staff.pin_hash` ยังไม่มีฟังก์ชันตรวจ PIN — ตั้งใจให้ตรวจที่ Edge Function
  เพื่อไม่ให้ hash หลุดออกทาง PostgREST
