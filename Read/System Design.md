System & Database Design

·

React + Supabase

·

7 ก.ย. 2569

# หมากระทุปุ๊ป๊ะ — การออกแบบระบบและฐานข้อมูล

ระบบบริหารร้านหมูกระทะบุฟเฟต์ครบวงจร แยกส่วนติดต่อผู้ใช้เป็น Customer / Staff / Admin
บนฐานข้อมูลชุดเดียว โดยมี **Visit** เป็น aggregate root ที่ผูกคิว โต๊ะ ออเดอร์ เวลา และการชำระเงินไว้ในระเบียนเดียว

บุฟเฟต์ต่อหัว · ผู้ใหญ่ 289

จำกัดเวลา 120 นาที

ไม่ใช่ a la carte

ลูกค้าไม่ต้องสมัครสมาชิก

Payment / Notification = mock

ร้านเดียว เผื่อโครงหลายสาขา

- 01 กฎธุรกิจ
- 02 สถาปัตยกรรม
- 03 Context & DFD
- 04 Activity Diagram
- 05 State Machine
- 06 ER Diagram
- 07 Data Dictionary
- 08 SQL & RLS
- 09 API Table
- 10 เครื่องคิดเงิน
- 11 การตัดสินใจออกแบบ
- 12 นอกขอบเขต

## 01 · กฎธุรกิจที่ระบบต้องบังคับ (Business Rules)

กฎทั้งหมดนี้เป็น **กฎเงิน** ไม่ใช่กฎหน้าจอ จึงบังคับที่ระดับฐานข้อมูล (CHECK / trigger) หรือ Edge Function
การซ่อนปุ่มใน UI อย่างเดียวถือว่าออกแบบไม่ผ่าน เพราะผู้ใช้ที่ยิง API ตรงจะข้ามกฎได้

### BR-01 · ออเดอร์รับได้เฉพาะสถานะ DINING

Visit ที่ยังไม่ได้ที่นั่ง หรือขอบิลแล้ว หรือปิดแล้ว จะเพิ่มออเดอร์ไม่ได้ทุกช่องทาง รวมถึงพนักงาน

บังคับที่

trigger บน order_batch + guard ใน Edge Function

### BR-02 · QR ผูกกับ visit ไม่ใช่โต๊ะ

qr_token สร้างตอนเช็คอินและผูก visit_id ปิดโต๊ะแล้ว token หมดอายุทันที ลูกค้าโต๊ะถัดไปที่ถ่ายรูป QR เก่าไว้จะเห็นหน้า 'มื้อนี้จบแล้ว'

บังคับที่

คอลัมน์ qr_token UNIQUE + ตรวจ visit.status ทุก request

### BR-03 · เพิ่มคนได้ ลดคนไม่ได้

จำนวนคนแต่ละ tier ปรับขึ้นได้ตลอดมื้อ แต่ห้ามลด เพราะเป็นช่องให้เลี่ยงค่าบุฟเฟต์ที่กินไปแล้ว การแก้ลงต้องให้หัวหน้ากะยกเลิกทั้ง Visit

บังคับที่

trigger เทียบค่าเก่า: NEW.qty >= OLD.qty

### BR-04 · นาฬิกาเดียวต่อ Visit

จับเวลาจาก visit.seated_at เท่านั้น คนที่มาเพิ่มกลางมื้อและโต๊ะที่กดเพิ่มภายหลัง ใช้นาฬิกาเดิม หมดเวลาพร้อมกันทั้ง Visit

บังคับที่

คอลัมน์ seated_at + view คำนวณ elapsed_minutes

### BR-05 · เกิน 120 นาที คิดเต็มรอบใหม่

คิดตามราคา tier ของแต่ละคน ไม่คิดกับเด็กเล็กที่ฟรี เตือนล่วงหน้าที่นาทีที่ 105 ผ่าน service_call อัตโนมัติเข้า Dashboard

บังคับที่

SQL function fn_calc_bill()

### BR-06 · ปิด Visit ได้เมื่อยอดค้างเป็นศูนย์

รองรับหลาย payment ต่อหนึ่ง bill (หารเท่ากันตามหัว หรือจ่ายเป็นก้อน) แต่ห้ามปิดถ้า SUM(payment.amount) ยังไม่เท่า bill.net_total

บังคับที่

trigger ก่อน UPDATE visit.status = CLOSED

### BR-07 · รวมบิลได้เฉพาะโต๊ะจากคิวเดียวกัน

bill_group อ้าง queue_ticket_id ทุก visit ในกลุ่มต้องมี queue_ticket_id เดียวกัน ป้องกันการรวมบิลผิดกลุ่มลูกค้า

บังคับที่

CHECK + trigger ตรวจ queue_ticket_id ตรงกัน

### BR-08 · ค่าเกินเวลาคิดแยกตามโต๊ะ

แม้รวมบิล แต่ละ Visit มีนาฬิกาของตัวเอง ค่าเกินเวลาจึงคำนวณต่อ Visit แล้วรวมยอดในขั้น bill_group ไม่ใช่คิดจากโต๊ะแรกหรือโต๊ะสุดท้าย

บังคับที่

fn_calc_bill() ต่อ visit แล้ว SUM ที่ bill_group

### BR-09 · no-show หลังเรียกครบ 3 ครั้ง

เรียกคิวห่างกัน 2 นาที ครบ 3 ครั้งแล้วยังไม่มา ตัดเป็น NO_SHOW โดยบันทึกผู้กดและเวลาทุกครั้งที่เรียก

บังคับที่

queue_call log + job ตรวจเงื่อนไข

### BR-10 · ลบคือ soft delete เท่านั้น

ทุกตารางมี deleted_at ไม่มี DELETE จริงในระบบ เจ้าของร้านและหัวหน้ากะกู้คืนได้เองจากหน้า Admin ทุกการลบและกู้คืนลง audit_log

บังคับที่

RLS ซ่อน deleted_at IS NOT NULL + REVOKE DELETE

## 02 · สถาปัตยกรรมระบบ

Client Layer — React SPA

Customer Web

เปิดในเบราว์เซอร์ ไม่ต้องล็อกอิน ไม่ต้องติดตั้งแอป
ยืนยันสิทธิ์ด้วย `qr_token` ในลิงก์เท่านั้น

Staff Web

Supabase Auth + ยืนยัน PIN ซ้ำสำหรับรายการที่มีผลทางการเงิน
Realtime: `visit · order_item · service_call · queue_ticket`

Admin Web

ข้อมูลหลัก (เมนู แพ็กเกจ โต๊ะ พนักงาน) + รายงาน + กู้คืนข้อมูลที่ลบ

Queue Display (TV)

โหมด read-only แสดงคิวที่กำลังเรียกและเวลารอโดยประมาณ แยกตามช่อง A / B / C

↓

API Layer — Supabase Edge Functions (Deno)

ทุกคำสั่งที่มีผลต่อเงินหรือสถานะผ่านชั้นนี้เท่านั้น เพื่อ (ก) ตรวจ `qr_token` ของลูกค้าที่ไม่มี JWT
(ข) บังคับ state machine (ค) รับ `Idempotency-Key` (ง) เขียน `audit_log` ในทรานแซกชันเดียวกัน
**เหตุผลที่ Customer Web ไม่ยิง PostgREST ตรง:** ลูกค้าไม่ล็อกอิน ถ้าใช้ anon key + RLS อย่างเดียว
จะกันการอ่านข้ามโต๊ะไม่ได้ เพราะ RLS ไม่มีตัวตนผู้ใช้ให้เทียบ

↓

PostgreSQL

24 ตาราง · RLS ทุกตาราง · soft delete ด้วย `deleted_at` · trigger บังคับกฎธุรกิจ

Realtime + Storage

Postgres Changes สำหรับสถานะอาหารและคิว · Storage เก็บรูปเมนูและสลิปโอน

External (Mock)

PromptPay QR และ SMS/LINE จำลองผ่าน adapter ที่มี interface เดียวกับของจริง สลับเป็นของจริงได้โดยไม่แก้ core

**ร้านเดียวแต่เผื่อโครงหลายสาขา:** ทุกตารางข้อมูลปฏิบัติการมี `branch_id` ตั้งแต่วันแรก
แต่ UI แสดงสาขาเดียวและไม่มีหน้าสลับสาขา — การขยายในอนาคตจึงไม่ต้อง migrate ข้อมูล เพียงเพิ่มแถวใน `branch`

## 03 · Context Diagram และ Data Flow Diagram

### Context Diagram (DFD ระดับ 0)

ลูกค้า (Customer)

ส่ง: ขอคิว, สั่งอาหาร, เรียกพนักงาน, ชำระเงิน
รับ: เลขคิว, สถานะอาหาร, เวลาคงเหลือ, ยอดบิล

พนักงาน (Staff)

ส่ง: เรียกคิว, จัดโต๊ะ, เปิด/ปิด Visit, อัปเดตสถานะอาหาร, ยืนยันรับเงิน
รับ: Dashboard เรียลไทม์, รายการรอเสิร์ฟ, คำเรียกบริการ

หัวหน้ากะ / เจ้าของร้าน

ส่ง: ข้อมูลเมนู แพ็กเกจ โต๊ะ พนักงาน โปรโมชั่น, คำสั่งกู้คืนข้อมูล
รับ: รายงานยอดขาย, รอบโต๊ะ, เมนูยอดนิยม, audit log

↕

Process 0

ระบบบริหารร้านหมูกระทะ หมากระทุปุ๊ป๊ะ

↕

Payment Gateway (mock)

ส่งออก: คำขอสร้าง PromptPay QR (จำนวนเงิน, reference)
รับเข้า: ผลการชำระ — ในเวอร์ชันนี้พนักงานกดยืนยันแทน webhook

Notification Gateway (mock)

ส่งออก: ข้อความแจ้งคิวใกล้ถึง / โต๊ะพร้อม ทาง SMS หรือ LINE
รับเข้า: สถานะการส่ง (จำลอง เขียนลง notification_log)

ระบบบัญชี / สรรพากร

ส่งออก: ใบเสร็จและใบกำกับภาษี (PDF ตัวอย่าง), สรุปยอดขายรายวัน
ยังไม่เชื่อมต่ออัตโนมัติในขอบเขตนี้

กรอบเส้นประ = external entity ที่จำลองไว้ (mock) แต่ยังต้องแสดงในไดอะแกรม เพราะเป็นจุดที่ข้อมูลออกนอกขอบเขตระบบ

### DFD ระดับ 1 — กระบวนการหลักหกกระบวนการ

| No. | กระบวนการ | Input (จาก) | Output (ไป) | Data store ที่แตะ |
| --- | --- | --- | --- | --- |
| 1.0 | **จัดการคิว** | ข้อมูลกลุ่ม (จำนวนคน) จากลูกค้า · คำสั่งเรียกคิวจากพนักงาน | เลขคิว A/B/C + เวลารอโดยประมาณ → ลูกค้าและ Queue TV · ข้อความแจ้งเตือน → Notification Gateway | D1 queue_ticket, D2 queue_call |
| 2.0 | **จัดโต๊ะและเปิด Visit** | คิวที่เรียกแล้ว · จำนวนคนแยก tier · การยืนยันส่วนสูงเด็กเล็ก | qr_token + ลิงก์เมนู → ลูกค้า · ผังโต๊ะที่อัปเดต → Staff | D3 visit, D4 visit_table, D5 visit_pax, D6 dining_table |
| 3.0 | **รับออเดอร์** | รายการอาหารที่ลูกค้าเลือก (ผ่าน qr_token) หรือพนักงานสั่งแทน | รายการรอเตรียม → หน้าจอครัว · สถานะอาหารเรียลไทม์ → ลูกค้า | D7 order_batch, D8 order_item, D9 menu_item |
| 4.0 | **จัดการบริการและเวลา** | คำเรียกพนักงานจากลูกค้า · เวลาที่ผ่านไปจาก seated_at | งานบริการที่มีเจ้าของ → Staff · แจ้งเตือนเหลือ 15 นาที → ลูกค้าและ Staff | D10 service_call, D3 visit |
| 5.0 | **คิดเงินและชำระเงิน** | คำขอเช็กบิล · วิธีแยกบิล · การยืนยันรับเงินจากพนักงาน | ใบแจ้งยอด → ลูกค้า · คำขอ QR → Payment Gateway · ใบเสร็จ → ลูกค้า | D11 bill, D12 payment, D13 bill_group |
| 6.0 | **รายงานและข้อมูลหลัก** | ข้อมูลเมนู/แพ็กเกจ/โต๊ะ/พนักงาน · ผลนับสต๊อกรายวัน | รายงานยอดขาย รอบโต๊ะ เมนูยอดนิยม ช่วงเวลาหนาแน่น → เจ้าของร้าน | D14 package, D15 stock_count, D16 audit_log |

## 04 · Activity Diagram — เส้นทางหลักตั้งแต่รับคิวถึงปิดโต๊ะ

01

Customer

มาถึงร้าน กดรับคิว

กรอกจำนวนคน ระบบเลือกช่องคิวให้เอง: A (1-2 คน) / B (3-4) / C (5+) ได้เลขเช่น A-023 พร้อมเวลารอโดยประมาณ

02

System

คำนวณเวลารอโดยประมาณ

จากจำนวนคิวที่รออยู่ในช่องเดียวกัน คูณเวลาเฉลี่ยต่อรอบของโต๊ะขนาดนั้นในสามสิบวันหลัง

03

Staff

เรียกคิว

กดเรียกจาก Dashboard ขึ้นบน Queue TV และส่งข้อความ (mock) เรียกได้สูงสุด 3 ครั้ง ห่างกัน 2 นาที ครบแล้วตัดเป็น NO_SHOW

04

Staff

จัดโต๊ะและยืนยันจำนวนคน

เลือกโต๊ะหนึ่งโต๊ะต่อคิว ระบุจำนวนผู้ใหญ่/เด็ก และกดยืนยันเด็กเล็กสูงไม่เกิน 90 ซม. ที่ได้ฟรี

05

System

เปิด Visit + ออก QR

สร้าง visit (SEATED), visit_table, visit_pax, qr_token และเริ่มนาฬิกา 120 นาทีที่ seated_at พิมพ์ QR ที่ผูกบิลใบนี้ให้ลูกค้า

06

Customer

สแกน QR สั่งอาหาร

เปิดในเบราว์เซอร์ ไม่ต้องล็อกอิน เลือก add-on น้ำรีฟิลรายคน แล้วสั่งอาหารได้หลายรอบ ทุกคนในโต๊ะสั่งพร้อมกันจากมือถือตัวเอง

07

System

เปลี่ยนสถานะเป็น DINING

ออเดอร์แรกที่สำเร็จเปลี่ยน visit.status จาก SEATED เป็น DINING หลังจากนี้เท่านั้นที่รับออเดอร์ใหม่ได้

08

Staff

อัปเดตสถานะอาหาร

หน้าจอครัว (ครัวเดียว ไม่แยกสถานี) เปลี่ยนสถานะ PENDING → PREPARING → SERVED ลูกค้าเห็นเรียลไทม์

09

System

เตือนเหลือ 15 นาที

ที่นาทีที่ 105 สร้าง service_call ชนิด TIME_WARNING เข้า Dashboard และแจ้งลูกค้าบนหน้าเว็บ

10

Customer

กดขอเช็กบิล

visit → BILL_REQUESTED ล็อกการสั่งใหม่ทันที ระบบสร้าง bill พร้อม snapshot ราคาและจำนวนคนที่คิดเงิน

11

Customer

เลือกวิธีจ่าย

หารเท่ากันตามหัว หรือจ่ายเป็นก้อนจนครบยอด ผ่าน PromptPay QR (mock) เงินสด หรือโอนแล้วพนักงานยืนยัน

12

Staff

ยืนยันรับเงินและปิดโต๊ะ

ยืนยันด้วย PIN ระบบตรวจ SUM(payment) = net_total แล้วจึงให้ปิด visit → PAID → CLOSED และปล่อยโต๊ะกลับเข้าผังพร้อมทำให้ qr_token หมดอายุ

**เส้นทางแทรก (alternate flows) ที่ต้องเขียนโค้ดจริง:** เรียกคิวครบ 3 ครั้งไม่มาให้ตัดเป็น no-show ·
โต๊ะไม่พอให้กดเพิ่มโต๊ะบน Visit เดิม · โทรศัพท์ลูกค้าแบตหมดให้พนักงานสั่งแทนจาก Staff Web ·
เน็ตหลุดให้ Staff Web ทำงานโหมด degraded แล้ว sync ภายหลัง

## 05 · Visit State Machine

Visit คือหัวใจของระบบ สถานะทั้งเจ็ดนี้เป็นค่า `ENUM` ในฐานข้อมูล
และ trigger จะปฏิเสธการเปลี่ยนสถานะที่ไม่มีในตารางด้านล่าง — ไม่ใช่แค่ซ่อนปุ่ม

S1

QUEUED

รับคิวแล้ว ยังไม่มีโต๊ะ สั่งอาหารไม่ได้

S2

SEATED

เปิด Visit นาฬิกาเริ่มเดิน QR ใช้งานได้

S3

DINING

สถานะเดียวที่รับออเดอร์ใหม่ได้

S4

BILL_REQUESTED

ล็อกออเดอร์ใหม่ ยอดต้องนิ่ง

S5

PAID

ยอดค้างเป็นศูนย์ แต่ยังไม่ปล่อยโต๊ะ

S6

CLOSED

ปล่อยโต๊ะ qr_token หมดอายุทันที

S7

VOIDED

ยกเลิกโดยมีเหตุผลบันทึกไว้ ไม่นับในรายงานยอดขาย

| จาก → ไป | ใครสั่งได้ | เงื่อนไข (guard) | ผลข้างเคียง |
| --- | --- | --- | --- |
| QUEUED → SEATED | พนักงาน | โต๊ะว่าง และจำนวนที่นั่งพอกับจำนวนคน (หรือหัวหน้ากะอนุมัติกรณีให้กลุ่มเล็กนั่งโต๊ะใหญ่) | ตั้ง seated_at, สร้าง qr_token, โต๊ะเป็น OCCUPIED |
| QUEUED → NO_SHOW | ระบบ | เรียกครบ 3 ครั้ง ห่างกันครั้งละ 2 นาที | คิวถัดไปในช่องเดียวกันเลื่อนขึ้น |
| SEATED → DINING | ระบบ | มีออเดอร์แรกสำเร็จ | บันทึก first_order_at ใช้วัด KPI |
| DINING → DINING | ลูกค้า/พนักงาน | elapsed ยังไม่ถึงเวลาปิดร้าน และ Idempotency-Key ไม่ซ้ำ | เพิ่ม order_batch ใหม่ (append-only) |
| DINING → BILL_REQUESTED | ลูกค้า/พนักงาน | ไม่มีรายการค้างสถานะ PENDING ที่ยังไม่ยืนยัน | สร้าง bill + snapshot ราคา, ตั้ง bill_requested_at |
| BILL_REQUESTED → DINING | หัวหน้ากะ | ยังไม่มี payment ใดบันทึกไว้ | ยกเลิก bill (soft delete) เขียน audit_log |
| BILL_REQUESTED → PAID | พนักงาน + PIN | SUM(payment.amount) = bill.net_total | ตั้ง paid_at |
| PAID → CLOSED | พนักงาน | ไม่มีเงื่อนไขเพิ่ม | โต๊ะกลับเป็น AVAILABLE, qr_token หมดอายุ, ตั้ง closed_at |
| ทุกสถานะ → VOIDED | หัวหน้ากะ + PIN | ต้องกรอกเหตุผล (void_reason) ไม่ต่ำกว่า 10 ตัวอักษร | เขียน audit_log, ไม่นับใน view รายงานยอดขาย |

## 06 · ER Diagram

แบ่งเป็นห้ากลุ่ม (ใช้เป็นสีเดียวกันทั้งหมดตามระบบออกแบบ — แยกด้วยหัวข้อไม่ใช่สี)
`PK` = primary key, `FK` = foreign key

### กลุ่ม 1 — โครงร้านและผู้ใช้

ข้อมูลหลักที่เปลี่ยนไม่บ่อย ทุกตารางมี branch_id เพื่อเผื่อหลายสาขา

branch

branch_id PK

name

address

open_time / close_time

deleted_at

staff

staff_id PK

branch_id FK

auth_user_id FK (Supabase)

full_name

role ENUM(STAFF, SUPERVISOR, OWNER)

pin_hash

is_active

deleted_at

zone

zone_id PK

branch_id FK

name (ห้องแอร์ / นอกอาคาร)

deleted_at

dining_table

table_id PK

branch_id FK

zone_id FK

table_no

seat_capacity

status ENUM(AVAILABLE, OCCUPIED, CLEANING, RESERVED)

### deleted_at · กลุ่ม 2 — คิวและการจอง

เลขคิวมีอักษรนำตามขนาดกลุ่มและรีเซ็ตรายวัน จึง unique ต่อ (branch, วันที่, ช่อง)

queue_ticket

queue_ticket_id PK

branch_id FK

service_date DATE

lane ENUM(A, B, C)

seq_no INT

party_size INT

phone (ลบอัตโนมัติ)

status ENUM(WAITING, CALLED, SEATED, NO_SHOW, CANCELLED)

created_at

UNIQUE(branch, service_date, lane, seq_no)

queue_call

queue_call_id PK

queue_ticket_id FK

called_by FK staff

called_at

call_no INT (1-3)

reservation

reservation_id PK

branch_id FK

table_id FK

reserved_for TIMESTAMPTZ

party_size

hold_until = reserved_for + 15 นาที

status ENUM(HELD, SEATED, RELEASED)

deleted_at

notification_log

notification_id PK

queue_ticket_id FK

channel ENUM(SMS, LINE)

payload JSONB

sent_at

is_mock BOOLEAN DEFAULT true

### กลุ่ม 3 — Visit (แกนกลางของระบบ)

Visit หนึ่งแถวคือการใช้บริการหนึ่งครั้งของกลุ่มลูกค้าหนึ่งกลุ่ม เวลา ออเดอร์ และเงินอ้างมาที่นี่ทั้งหมด

visit

visit_id PK

branch_id FK

queue_ticket_id FK (nullable)

package_id FK

bill_group_id FK (nullable)

status ENUM(7 สถานะ)

seated_at ← นาฬิกาเริ่มที่นี่

first_order_at / bill_requested_at

paid_at / closed_at

duration_minutes (snapshot 120)

void_reason

deleted_at

visit_table

visit_table_id PK

visit_id FK

table_id FK

assigned_at

released_at (nullable)

หมายเหตุ: รองรับกดเพิ่มโต๊ะบน Visit เดิม

visit_pax

visit_pax_id PK

visit_id FK

tier ENUM(ADULT, CHILD, TODDLER_FREE)

qty INT CHECK (qty >= 0)

unit_price (snapshot)

UNIQUE(visit_id, tier)

visit_addon

visit_addon_id PK

visit_id FK

addon_id FK

qty INT ← เก็บเป็นจำนวน ไม่ระบุตัวบุคคล

unit_price (snapshot)

qr_session

qr_session_id PK

visit_id FK

token TEXT UNIQUE

issued_at

expires_at ← ตั้งเมื่อปิดโต๊ะ

### revoked_at · กลุ่ม 4 — เมนูและออเดอร์

ร้านไม่ใช่ a la carte จึงไม่มีราคาต่อจาน order_item เก็บแค่จำนวนและสถานะ

package

package_id PK

branch_id FK

name

duration_minutes DEFAULT 120

overtime_mode ENUM(FULL_ROUND)

is_active

deleted_at

package_price

package_price_id PK

package_id FK

tier ENUM(ADULT, CHILD, TODDLER_FREE)

price NUMERIC(10,2)

effective_from DATE

UNIQUE(package_id, tier, effective_from)

addon

addon_id PK

branch_id FK

name (น้ำรีฟิล)

price NUMERIC(10,2)

charge_basis ENUM(PER_HEAD, PER_TABLE)

is_active

deleted_at

menu_category

category_id PK

branch_id FK

name

sort_order

deleted_at

menu_item

menu_item_id PK

category_id FK

package_id FK (อยู่ในแพ็กเกจใด)

name

image_path

is_available ← 86 list

sort_order

deleted_at

order_batch

order_batch_id PK

visit_id FK

source ENUM(CUSTOMER, STAFF)

created_by FK staff (nullable)

idempotency_key TEXT UNIQUE

created_at

order_item

order_item_id PK

order_batch_id FK

menu_item_id FK

qty INT CHECK (qty > 0)

status ENUM(PENDING, PREPARING, SERVED, CANCELLED)

cancel_reason

served_at

ไม่มีคอลัมน์ราคา — โดยเจตนา

service_call

service_call_id PK

visit_id FK

type ENUM(WATER, UTENSIL, BILL, TIME_WARNING, OTHER)

status ENUM(OPEN, ACCEPTED, DONE)

accepted_by FK staff

created_at / accepted_at / done_at

### กลุ่ม 5 — เงิน สต๊อก และการตรวจสอบ

bill_group คือชั้นที่รวมบิลหลายโต๊ะจากคิวเดียวกัน payment เป็นหลายแถวต่อหนึ่งบิลเพื่อรองรับการหารกัน

bill_group

bill_group_id PK

branch_id FK

queue_ticket_id FK ← ทุก visit ในกลุ่มต้องมาจากคิวนี้

created_by FK staff

created_at

deleted_at

bill

bill_id PK

visit_id FK UNIQUE

package_subtotal

addon_subtotal

overtime_rounds INT

overtime_subtotal

discount_amount

net_total NUMERIC(10,2)

split_mode ENUM(EQUAL_PER_HEAD, CUSTOM_AMOUNT)

issued_at

deleted_at

payment

payment_id PK

bill_id FK

method ENUM(PROMPTPAY, CASH, TRANSFER)

amount NUMERIC(10,2) CHECK (amount > 0)

reference (เลขอ้างอิง/สลิป)

confirmed_by FK staff

idempotency_key TEXT UNIQUE

paid_at

member

member_id PK

phone UNIQUE

display_name

points_balance

created_at

deleted_at

member_consent

consent_id PK

member_id FK

purpose ENUM(LOYALTY, MARKETING)

granted_at

revoked_at ← ถอนได้ตาม ม.19

policy_version

point_transaction

point_txn_id PK

member_id FK

visit_id FK

points_delta INT

reason

created_at

inventory_item

inventory_item_id PK

branch_id FK

name

unit (กก. / ถาด)

deleted_at

stock_count

stock_count_id PK

inventory_item_id FK

count_date DATE

opening_qty / closing_qty

waste_qty ← ของเสีย

counted_by FK staff

note

audit_log

audit_id PK

table_name / record_id

action ENUM(INSERT, UPDATE, SOFT_DELETE, RESTORE)

actor_staff_id FK

before JSONB / after JSONB

created_at

append-only — ไม่มี UPDATE/DELETE

### ความสัมพันธ์หลัก (Cardinality)

| ความสัมพันธ์ | แบบ | เหตุผลเชิงธุรกิจ |
| --- | --- | --- |
| queue_ticket 1 — 1 visit | 1:1 | 1 คิว = 1 โต๊ะตามที่ตกลง หากโต๊ะไม่พอให้กดเพิ่มโต๊ะบน Visit เดิม ไม่สร้าง Visit ใหม่ |
| visit 1 — N visit_table | 1:N | กลุ่มใหญ่ที่นั่งสองโต๊ะเป็น Visit เดียว จึงใช้นาฬิกาและบิลร่วมกัน |
| visit 1 — N visit_pax | 1:N (สูงสุด 3) | แยกแถวตาม tier ผู้ใหญ่/เด็ก/เด็กเล็กฟรี เพื่อคิดเงินและค่าเกินเวลาตามราคาของแต่ละกลุ่ม |
| bill_group 1 — N visit | 1:N | รวมบิลข้ามโต๊ะได้เฉพาะ Visit ที่มี queue_ticket_id เดียวกัน |
| visit 1 — 1 bill | 1:1 | หนึ่ง Visit มีบิลได้ใบเดียว การรวมบิลเกิดที่ชั้น bill_group ไม่ใช่ที่ bill |
| bill 1 — N payment | 1:N | รองรับหารเท่ากันตามหัวและจ่ายเป็นก้อน ปิดได้เมื่อผลรวมเท่ายอดสุทธิ |
| visit 1 — N order_batch | 1:N | สั่งได้หลายรอบตลอดมื้อ แต่ละรอบมี idempotency_key กันการกดซ้ำ |
| order_batch 1 — N order_item | 1:N | หนึ่งครั้งที่กดสั่งมีหลายรายการ สถานะอาหารอยู่ระดับ item เพราะเสิร์ฟไม่พร้อมกัน |
| package 1 — N package_price | 1:N | ราคาแยกตาม tier และมี effective_from เพื่อเก็บประวัติเมื่อขึ้นราคา ไม่ทับข้อมูลบิลเก่า |
| member 1 — N member_consent | 1:N | ความยินยอมแยกเป็นรายวัตถุประสงค์ตาม PDPA ถอนเฉพาะการตลาดได้โดยยังสะสมแต้มต่อ |

## 07 · Data Dictionary — ตารางแกนกลาง

### visit

แกนกลางของระบบ หนึ่งแถวคือการใช้บริการหนึ่งครั้ง เวลาทั้งหมดที่ใช้วัด KPI อยู่ในตารางนี้

| คอลัมน์ | ชนิด | Key/Null | คำอธิบาย |
| --- | --- | --- | --- |
| visit_id | UUID | PK | รหัสการใช้บริการ ใช้เป็น reference บนใบเสร็จ |
| branch_id | UUID | FK, NOT NULL | สาขา — เผื่อขยายหลายสาขาโดยไม่ต้อง migrate |
| queue_ticket_id | UUID | FK, NULL | คิวต้นทาง เป็น NULL ได้กรณีลูกค้าจองล่วงหน้าหรือพนักงานเปิดโต๊ะเอง |
| package_id | UUID | FK, NOT NULL | แพ็กเกจบุฟเฟต์ที่ใช้ ใช้ดึงราคาและระยะเวลา |
| bill_group_id | UUID | FK, NULL | กลุ่มรวมบิล เป็น NULL เมื่อจ่ายแยกโต๊ะตามปกติ |
| status | visit_status | NOT NULL | ENUM 7 ค่า ควบคุมด้วย trigger ตามตาราง transition ใน §05 |
| seated_at | TIMESTAMPTZ | NOT NULL | จุดเริ่มนาฬิกา 120 นาที — โต๊ะและคนที่เพิ่มภายหลังใช้ค่านี้ร่วมกัน |
| first_order_at | TIMESTAMPTZ | NULL | ใช้คำนวณ KPI time-to-first-bite |
| bill_requested_at | TIMESTAMPTZ | NULL | จุดล็อกการสั่งใหม่ และจุดเริ่มวัด checkout latency |
| paid_at / closed_at | TIMESTAMPTZ | NULL | paid_at = ยอดค้างเป็นศูนย์ · closed_at = ปล่อยโต๊ะแล้ว สองค่านี้แยกกันเพื่อวัดเวลาเก็บโต๊ะ |
| duration_minutes | INT | NOT NULL | snapshot ระยะเวลาแพ็กเกจ (120) เพื่อไม่ให้บิลเก่าเปลี่ยนเมื่อร้านแก้แพ็กเกจ |
| void_reason | TEXT | NULL | บังคับกรอกไม่ต่ำกว่า 10 ตัวอักษรเมื่อสถานะเป็น VOIDED |
| deleted_at | TIMESTAMPTZ | NULL | soft delete — RLS ซ่อนแถวที่มีค่านี้จากทุก role ยกเว้นหน้ากู้คืน |

### visit_pax

จำนวนคนแยกตามช่วงราคา เป็นตัวตั้งของทั้งค่าบุฟเฟต์ ค่าเกินเวลา และการหารบิล

| คอลัมน์ | ชนิด | Key/Null | คำอธิบาย |
| --- | --- | --- | --- |
| visit_pax_id | UUID | PK |  |
| visit_id | UUID | FK, NOT NULL | UNIQUE ร่วมกับ tier — หนึ่ง tier มีได้แถวเดียวต่อ Visit |
| tier | pax_tier | NOT NULL | ADULT / CHILD / TODDLER_FREE |
| qty | INT | CHECK qty >= 0 | trigger ห้ามค่าใหม่น้อยกว่าค่าเดิม (เพิ่มได้ ลดไม่ได้) |
| unit_price | NUMERIC(10,2) | NOT NULL | snapshot ราคาตอนเช็คอิน — TODDLER_FREE เก็บเป็น 0.00 |
| height_verified_by | UUID | FK, NULL | พนักงานที่กดยืนยันส่วนสูงไม่เกิน 90 ซม. บังคับมีค่าเมื่อ tier = TODDLER_FREE |

### order_item

รายการอาหารที่สั่ง — ไม่มีคอลัมน์ราคาโดยเจตนา เพราะร้านคิดเงินต่อหัวไม่ใช่ต่อจาน

| คอลัมน์ | ชนิด | Key/Null | คำอธิบาย |
| --- | --- | --- | --- |
| order_item_id | UUID | PK |  |
| order_batch_id | UUID | FK, NOT NULL | รอบการกดสั่ง ใช้จัดกลุ่มแสดงในหน้าจอครัว |
| menu_item_id | UUID | FK, NOT NULL | เมนูที่สั่ง |
| qty | INT | CHECK qty > 0 | จำนวนที่สั่ง |
| status | order_status | NOT NULL | PENDING → PREPARING → SERVED หรือ CANCELLED (ต้องมีเหตุผล) |
| cancel_reason | TEXT | NULL | บังคับกรอกเมื่อ status = CANCELLED หลังส่งครัวแล้ว |
| served_at | TIMESTAMPTZ | NULL | ใช้วัดเวลาเสิร์ฟเฉลี่ยต่อกะ |

### payment

การชำระเงินหนึ่งครั้ง หนึ่งบิลมีได้หลายแถวเพื่อรองรับการหารกันในโต๊ะ

| คอลัมน์ | ชนิด | Key/Null | คำอธิบาย |
| --- | --- | --- | --- |
| payment_id | UUID | PK |  |
| bill_id | UUID | FK, NOT NULL | บิลที่จ่าย |
| method | payment_method | NOT NULL | PROMPTPAY (mock) / CASH / TRANSFER |
| amount | NUMERIC(10,2) | CHECK amount > 0 | trigger ห้ามให้ผลรวมเกิน bill.net_total |
| reference | TEXT | NULL | เลขอ้างอิง PromptPay หรือ path สลิปโอนใน Storage |
| confirmed_by | UUID | FK, NOT NULL | พนักงานที่ยืนยันด้วย PIN — ในระบบ mock ไม่มี webhook จึงต้องมีผู้รับผิดชอบทุกแถว |
| idempotency_key | TEXT | UNIQUE | กันการกดยืนยันซ้ำตอนเน็ตช้า ซึ่งเป็นสาเหตุอันดับหนึ่งของยอดเกิน |

### ตารางที่เหลือ (สรุป)

| ตาราง | หน้าที่ | คอลัมน์สำคัญ |
| --- | --- | --- |
| branch | ข้อมูลสาขา เวลาเปิด-ปิด | branch_id, name, open_time, close_time |
| staff | พนักงานและสิทธิ์ 3 บทบาท | role ENUM(STAFF, SUPERVISOR, OWNER), pin_hash |
| zone / dining_table | โซนและโต๊ะพร้อมสถานะและจำนวนที่นั่ง | seat_capacity, status |
| queue_ticket | บัตรคิว แยกช่อง A/B/C รีเซ็ตรายวัน | lane, seq_no, party_size, UNIQUE(branch, date, lane, seq_no) |
| queue_call | ประวัติการเรียกคิว ใช้ตัดสิน no-show | call_no (1-3), called_by, called_at |
| reservation | จองโต๊ะล่วงหน้า กันโต๊ะไว้ 15 นาที | hold_until, status |
| notification_log | ข้อความแจ้งคิว (mock) ไม่ส่งออกจริง | channel, payload, is_mock |
| visit_table | ประวัติการครองโต๊ะของ Visit รองรับเพิ่ม/ย้ายโต๊ะ | assigned_at, released_at |
| visit_addon | add-on รายคน เก็บเป็นจำนวนไม่ระบุตัวบุคคล | qty, unit_price |
| qr_session | token ที่ผูก Visit หมดอายุเมื่อปิดโต๊ะ | token UNIQUE, expires_at, revoked_at |
| package / package_price | แพ็กเกจและราคาแยก tier มีประวัติราคา | duration_minutes, tier, price, effective_from |
| addon | รายการเสริม เช่น น้ำรีฟิล 39 บาท/คน | price, charge_basis |
| menu_category / menu_item | หมวดหมู่และเมนู พร้อมสถานะของหมด (86 list) | is_available, image_path, sort_order |
| order_batch | รอบการกดสั่ง มี idempotency_key กันกดซ้ำ | source ENUM(CUSTOMER, STAFF), idempotency_key |
| service_call | คำเรียกพนักงาน มีเจ้าของงานและเวลานับขึ้น | type, status, accepted_by |
| bill_group / bill | รวมบิลข้ามโต๊ะจากคิวเดียวกัน และบิลต่อ Visit | queue_ticket_id, net_total, split_mode |
| member / member_consent / point_transaction | สมาชิก ความยินยอมแยกวัตถุประสงค์ และแต้ม | phone UNIQUE, purpose, revoked_at, points_delta |
| inventory_item / stock_count | วัตถุดิบและการนับสต๊อกรายวันพร้อมของเสีย | opening_qty, closing_qty, waste_qty |
| audit_log | บันทึกทุกการเปลี่ยนแปลง append-only | action, actor_staff_id, before/after JSONB |
| app_setting | ค่าคอนฟิกร้าน เช่น เวลาเตือนล่วงหน้า เกณฑ์ no-show | key, value JSONB |

## 08 · SQL — DDL, Trigger และ RLS Policy

โค้ดชุดนี้รันบน Supabase ได้ตรง แสดงเฉพาะส่วนที่บังคับกฎธุรกิจสำคัญ
(สคีมาเต็มอยู่ใน migration ไฟล์เดียวกัน)

1 · ENUM และตาราง visit

หัวใจของสคีมา

```sql
create type visit_status as enum (
  'QUEUED','SEATED','DINING','BILL_REQUESTED','PAID','CLOSED','VOIDED'
);
create type pax_tier as enum ('ADULT','CHILD','TODDLER_FREE');

create table visit (
  visit_id          uuid primary key default gen_random_uuid(),
  branch_id         uuid not null references branch(branch_id),
  queue_ticket_id   uuid references queue_ticket(queue_ticket_id),
  package_id        uuid not null references package(package_id),
  bill_group_id     uuid references bill_group(bill_group_id),
  status            visit_status not null default 'SEATED',
  seated_at         timestamptz not null default now(),
  first_order_at    timestamptz,
  bill_requested_at timestamptz,
  paid_at           timestamptz,
  closed_at         timestamptz,
  duration_minutes  int not null default 120,
  void_reason       text,
  deleted_at        timestamptz,
  constraint void_needs_reason check (
    status <> 'VOIDED' or char_length(coalesce(void_reason,'')) >= 10
  )
);

create index on visit (branch_id, status) where deleted_at is null;
```

2 · BR-03 เพิ่มคนได้ ลดคนไม่ได้

กฎเงิน จึงบังคับที่ฐานข้อมูล

```sql
create table visit_pax (
  visit_pax_id       uuid primary key default gen_random_uuid(),
  visit_id           uuid not null references visit(visit_id),
  tier               pax_tier not null,
  qty                int not null check (qty >= 0),
  unit_price         numeric(10,2) not null,
  height_verified_by uuid references staff(staff_id),
  unique (visit_id, tier),
  constraint toddler_needs_verify check (
    tier <> 'TODDLER_FREE' or height_verified_by is not null
  )
);

create function trg_pax_no_decrease() returns trigger as $$
begin
  if new.qty < old.qty then
    raise exception 'ลดจำนวนคนไม่ได้ (จาก % เป็น %) ต้องยกเลิก Visit โดยหัวหน้ากะ',
      old.qty, new.qty;
  end if;
  return new;
end $$ language plpgsql;

create trigger pax_no_decrease before update of qty on visit_pax
  for each row execute function trg_pax_no_decrease();
```

3 · BR-01 ออเดอร์รับได้เฉพาะ DINING

และเลื่อน SEATED → DINING อัตโนมัติ

```sql
create function trg_order_only_when_dining() returns trigger as $$
declare v_status visit_status;
begin
  select status into v_status from visit
   where visit_id = new.visit_id for update;

  if v_status = 'SEATED' then
    update visit
       set status = 'DINING', first_order_at = coalesce(first_order_at, now())
     where visit_id = new.visit_id;
  elsif v_status <> 'DINING' then
    raise exception 'รับออเดอร์ไม่ได้: สถานะปัจจุบันคือ %', v_status;
  end if;
  return new;
end $$ language plpgsql;

create trigger order_only_when_dining before insert on order_batch
  for each row execute function trg_order_only_when_dining();
```

4 · BR-06 ปิด Visit ได้เมื่อยอดค้างเป็นศูนย์

รองรับหลาย payment ต่อบิล

```sql
create function trg_close_requires_full_payment() returns trigger as $$
declare v_total numeric(10,2); v_paid numeric(10,2);
begin
  if new.status in ('PAID','CLOSED') and old.status = 'BILL_REQUESTED' then
    select b.net_total, coalesce(sum(p.amount), 0)
      into v_total, v_paid
      from bill b
      left join payment p on p.bill_id = b.bill_id
     where b.visit_id = new.visit_id and b.deleted_at is null
     group by b.net_total;

    if v_paid is null or v_paid <> v_total then
      raise exception 'ยอดค้าง % บาท ยังปิดโต๊ะไม่ได้', v_total - coalesce(v_paid,0);
    end if;
    new.paid_at := coalesce(new.paid_at, now());
  end if;

  if new.status = 'CLOSED' then
    new.closed_at := now();
    update qr_session set revoked_at = now()
     where visit_id = new.visit_id and revoked_at is null;
    update dining_table set status = 'CLEANING'
     where table_id in (select table_id from visit_table
                         where visit_id = new.visit_id and released_at is null);
  end if;
  return new;
end $$ language plpgsql;

create trigger close_requires_full_payment before update of status on visit
  for each row execute function trg_close_requires_full_payment();
```

5 · BR-07 รวมบิลได้เฉพาะโต๊ะจากคิวเดียวกัน

constraint ของ bill_group

```sql
create function trg_bill_group_same_queue() returns trigger as $$
declare v_expected uuid;
begin
  if new.bill_group_id is null then return new; end if;

  select queue_ticket_id into v_expected
    from bill_group where bill_group_id = new.bill_group_id;

  if new.queue_ticket_id is distinct from v_expected then
    raise exception 'รวมบิลได้เฉพาะโต๊ะที่เช็คอินจากคิวเดียวกัน';
  end if;
  return new;
end $$ language plpgsql;

create trigger bill_group_same_queue before insert or update of bill_group_id on visit
  for each row execute function trg_bill_group_same_queue();
```

6 · fn_calc_bill — เครื่องคิดเงิน

ค่าเกินเวลาคิดต่อ Visit ตาม BR-08

```sql
create function fn_calc_bill(p_visit_id uuid)
returns table (package_subtotal numeric, addon_subtotal numeric,
               overtime_rounds int, overtime_subtotal numeric,
               net_total numeric) as $$
declare
  v_elapsed int; v_duration int;
  v_paid_head_total numeric; v_addon numeric; v_extra int;
begin
  select duration_minutes,
         ceil(extract(epoch from (now() - seated_at)) / 60)::int
    into v_duration, v_elapsed
    from visit where visit_id = p_visit_id;

  -- ค่าแพ็กเกจหนึ่งรอบ (TODDLER_FREE มี unit_price = 0)
  select coalesce(sum(qty * unit_price), 0) into v_paid_head_total
    from visit_pax where visit_id = p_visit_id;

  select coalesce(sum(qty * unit_price), 0) into v_addon
    from visit_addon where visit_id = p_visit_id;

  -- เกินเวลา = คิดเต็มรอบใหม่ ไม่มี grace period
  v_extra := greatest(0, ceil((v_elapsed - v_duration)::numeric / v_duration)::int);

  return query select
    v_paid_head_total,
    v_addon,
    v_extra,
    v_paid_head_total * v_extra,
    v_paid_head_total * (1 + v_extra) + v_addon;
end $$ language plpgsql;
```

7 · RLS — สามบทบาทและการซ่อน soft delete

ลูกค้าไม่มี policy เลย เข้าถึงผ่าน Edge Function เท่านั้น

```sql
alter table visit enable row level security;
alter table audit_log enable row level security;

create function fn_my_role() returns text as $$
  select role::text from staff
   where auth_user_id = auth.uid() and is_active and deleted_at is null;
$$ language sql stable security definer;

-- พนักงานเห็นเฉพาะ Visit ที่ยังไม่ถูกลบ ในสาขาของตน
create policy staff_read_visit on visit for select
  using (
    deleted_at is null
    and fn_my_role() in ('STAFF','SUPERVISOR','OWNER')
    and branch_id = (select branch_id from staff where auth_user_id = auth.uid())
  );

-- หน้ากู้คืน: เห็นแถวที่ลบแล้วได้เฉพาะหัวหน้ากะและเจ้าของร้าน
create policy supervisor_read_deleted on visit for select
  using (deleted_at is not null and fn_my_role() in ('SUPERVISOR','OWNER'));

-- ห้ามลบจริงทั้งระบบ
revoke delete on visit, bill, payment, order_item from authenticated;

-- audit_log อ่านได้เฉพาะเจ้าของร้าน และเป็น append-only
create policy owner_read_audit on audit_log for select
  using (fn_my_role() = 'OWNER');
revoke update, delete on audit_log from authenticated;
```

## 09 · API Endpoint Table

ทุก endpoint เป็น Supabase Edge Function ที่ `/functions/v1/...`
คอลัมน์ Auth บอกว่าใครเรียกได้ · คอลัมน์ Idem บอกว่าต้องส่ง `Idempotency-Key` หรือไม่

| Method | Path | หน้าที่ | Auth | Idem | ข้อผิดพลาดหลัก |
| --- | --- | --- | --- | --- | --- |
| POST | /queue/tickets | รับคิว เลือกช่อง A/B/C ตามจำนวนคน | public (rate-limited) | ต้องส่ง | 409 คิวปิดรับ / 400 จำนวนคนไม่ถูกต้อง |
| GET | /queue/tickets/:id | ดูลำดับคิวและเวลารอโดยประมาณ | public + token คิว | — | 404 ไม่พบคิว / 410 คิวถูกตัด no-show |
| GET | /queue/board | ข้อมูลสำหรับหน้าจอคิว TV (read-only) | public | — | — |
| POST | /queue/tickets/:id/call | เรียกคิว (นับครั้งที่ 1-3) | STAFF ขึ้นไป | ต้องส่ง | 409 เรียกครบ 3 ครั้งแล้ว |
| POST | /visits | เช็คอิน: จัดโต๊ะ ระบุ pax แยก tier เปิด Visit และออก QR | STAFF + PIN | ต้องส่ง | 409 โต๊ะไม่ว่าง / 422 ที่นั่งไม่พอ ต้องให้ SUPERVISOR อนุมัติ |
| POST | /visits/:id/tables | กดเพิ่มโต๊ะบน Visit เดิม (กลุ่มใหญ่) | STAFF | ต้องส่ง | 409 โต๊ะไม่ว่าง |
| PATCH | /visits/:id/pax | เพิ่มจำนวนคนกลางมื้อ | STAFF + PIN | ต้องส่ง | 422 ลดจำนวนคนไม่ได้ (BR-03) |
| GET | /c/:qrToken | ข้อมูล Visit สำหรับลูกค้า: เมนู เวลาคงเหลือ ยอดปัจจุบัน | qr_token | — | 410 มื้อนี้จบแล้ว / 401 token ถูกเพิกถอน |
| POST | /c/:qrToken/orders | ลูกค้าสั่งอาหาร (หลายรอบ) | qr_token | ต้องส่ง | 409 สถานะไม่ใช่ DINING / 422 เมนูของหมด |
| POST | /c/:qrToken/addons | เลือกน้ำรีฟิลรายคน (เก็บเป็นจำนวน) | qr_token | ต้องส่ง | 422 จำนวนเกินจำนวนคนที่จ่ายเงิน |
| POST | /c/:qrToken/service-calls | เรียกพนักงาน (น้ำ อุปกรณ์ เช็กบิล) | qr_token | ต้องส่ง | 429 เรียกซ้ำเร็วเกินไป |
| PATCH | /orders/items/:id/status | อัปเดตสถานะอาหาร PENDING → PREPARING → SERVED | STAFF | ไม่ต้อง | 409 ข้ามสถานะไม่ได้ / 422 ยกเลิกต้องมีเหตุผล |
| POST | /visits/:id/bill | ขอเช็กบิล: ล็อกออเดอร์ เรียก fn_calc_bill สร้าง snapshot | qr_token หรือ STAFF | ต้องส่ง | 409 มีรายการค้างยืนยัน |
| POST | /bill-groups | รวมบิลหลายโต๊ะจากคิวเดียวกัน | SUPERVISOR + PIN | ต้องส่ง | 422 โต๊ะมาจากคิวต่างกัน (BR-07) |
| POST | /bills/:id/payments | บันทึกการชำระ (หารตามหัว หรือจ่ายเป็นก้อน) | STAFF + PIN | ต้องส่ง | 422 ผลรวมเกินยอดสุทธิ / 409 idempotency ซ้ำ |
| POST | /visits/:id/close | ปิดโต๊ะ ปล่อยโต๊ะ เพิกถอน qr_token | STAFF + PIN | ต้องส่ง | 422 ยอดค้างยังไม่เป็นศูนย์ (BR-06) |
| POST | /visits/:id/void | ยกเลิก Visit พร้อมเหตุผล | SUPERVISOR + PIN | ต้องส่ง | 422 เหตุผลสั้นกว่า 10 ตัวอักษร |
| POST | /admin/restore | กู้คืนข้อมูลที่ soft delete | SUPERVISOR / OWNER | ต้องส่ง | 404 ไม่พบแถวที่ลบ / 403 สิทธิ์ไม่พอ |
| GET | /admin/reports/daily | ยอดขาย จำนวนลูกค้า รอบโต๊ะ เมนูยอดนิยม ช่วงเวลาหนาแน่น | OWNER | — | — |

## 10 · เครื่องคิดเงิน (Pricing Engine)

ร้านไม่ใช่ a la carte จึง **ไม่มีราคาต่อจาน** —
`order_item` เก็บเพียงจำนวนและสถานะ ไม่มี `line_total`
ยอดบิลทั้งหมดมาจากสามองค์ประกอบเท่านั้น

องค์ประกอบ 1

ค่าแพ็กเกจตามหัว

ผู้ใหญ่ 289 · เด็ก (ราคาเด็ก) · เด็กเล็กสูงไม่เกิน 90 ซม. ฟรี
เก็บเป็นแถวใน `visit_pax` แยกตาม tier

องค์ประกอบ 2

Add-on รายคน

น้ำรีฟิล 39 บาท/คน เลือกได้รายคน เก็บเป็น **จำนวน** ไม่ระบุตัวบุคคล
คิดครั้งเดียวต่อ Visit ไม่คิดซ้ำเมื่อต่อรอบ

องค์ประกอบ 3

ค่าเกินเวลา

เกิน 120 นาที คิดเต็มรอบใหม่ตามราคา tier ของแต่ละคน
เตือนล่วงหน้าที่นาทีที่ 105 · ไม่มี grace period

สูตรคำนวณ (นำไปเขียนเป็น SQL function ได้ตรง)

```
-- หนึ่งรอบ = ค่าแพ็กเกจของทุกคนที่จ่ายเงิน
round_total   = Σ (visit_pax.qty × visit_pax.unit_price)
                 -- TODDLER_FREE มี unit_price = 0 จึงไม่กระทบ

addon_total   = Σ (visit_addon.qty × visit_addon.unit_price)
                 -- คิดครั้งเดียวต่อ Visit ไม่คิดซ้ำเมื่อต่อรอบ

elapsed       = ceil((now() - visit.seated_at) นาที)
extra_rounds  = max(0, ceil((elapsed - duration_minutes) / duration_minutes))
                 -- ไม่มี grace period · เตือนล่วงหน้าที่นาทีที่ duration - 15

net_total     = round_total × (1 + extra_rounds) + addon_total - discount

-- หารเท่ากันตามหัว (paying_pax = ADULT + CHILD เท่านั้น)
per_head      = ceil(net_total / paying_pax)   -- เศษบาทตกที่คนแรก
```

### ตัวอย่างการคิดเงินจริง

| สถานการณ์ | การคำนวณ | ยอดสุทธิ |
| --- | --- | --- |
| ผู้ใหญ่ 4 คน เอาน้ำรีฟิล 2 คน จบใน 100 นาที | (4 × 289) × 1 + (2 × 39) = 1,156 + 78 | 1,234 ฿ |
| ผู้ใหญ่ 2 + เด็ก 1 (ราคาเด็ก 189) + เด็กเล็กฟรี 1 น้ำรีฟิล 3 ที่ จบใน 118 นาที | (2×289 + 1×189 + 1×0) + (3 × 39) = 767 + 117 | 884 ฿ |
| ผู้ใหญ่ 3 คน อยู่ 135 นาที (เกิน 15 นาที) | round_total = 867 extra_rounds = ceil(15/120) = 1 867 × (1 + 1) | 1,734 ฿ |
| กลุ่ม 10 คน (ผู้ใหญ่ทั้งหมด) นั่ง 2 โต๊ะจากคิว C-003 รวมบิล โต๊ะแรก 130 นาที โต๊ะสอง 95 นาที | Visit A (6 คน, เกินเวลา): 1,734 × 2 = 3,468 Visit B (4 คน, ไม่เกิน): 1,156 bill_group = 3,468 + 1,156 | 4,624 ฿ |

**การแยกบิลรองรับสองแบบ:** (1) หารเท่ากันตามจำนวนหัวที่จ่ายเงิน — ยอดต่อคนคือ `ceil(net_total / paying_pax)`
เศษบาทตกที่คนแรก และ (2) จ่ายเป็นก้อนเท่าไรก็ได้จนครบยอด
ทั้งสองแบบใช้ตาราง `payment` หลายแถวต่อ `bill` เดียว
และปิด Visit ได้เมื่อ `SUM(payment.amount) = bill.net_total` เท่านั้น

## 11 · การตัดสินใจออกแบบและเหตุผล

ส่วนนี้บันทึกทางเลือกที่พิจารณาแล้วไม่เลือก เพื่อให้ตรวจสอบเหตุผลย้อนหลังได้ (Architecture Decision Record ย่อ)

ADR-01

Visit เป็น aggregate root

เลือก

ตาราง visit เดียวถือ timestamp ทั้งหมด และให้ order/bill/payment อ้างมาที่นี่

ไม่เลือก

ให้ order อ้าง table_id ตรงแบบ POS ทั่วไป

เหตุผล

รอบโต๊ะและเวลารอคำนวณได้โดยไม่ join ข้ามระบบ และย้ายโต๊ะไม่ทำให้ออเดอร์หลุด

ADR-02

order_item ไม่มีคอลัมน์ราคา

เลือก

เก็บเพียง qty และ status

ไม่เลือก

ใส่ unit_price / line_total ตามแบบ a la carte

เหตุผล

ร้านคิดเงินต่อหัว การมีราคาต่อจานจะสร้างแหล่งความจริงซ้อนที่ทำให้ยอดบิลไม่ตรงกัน

ADR-03

add-on เก็บเป็นจำนวน ไม่ระบุตัวบุคคล

เลือก

visit_addon.qty = 'รีฟิล 3 ที่'

ไม่เลือก

สร้างตาราง guest (ที่นั่ง 1..N) เพื่อรู้ว่าใครเอารีฟิล

เหตุผล

ลด PII ตาม PDPA และไม่มีฟีเจอร์ใดต้องรู้ตัวบุคคล — การหารบิลใช้จำนวนหัวก็เพียงพอ

ADR-04

นาฬิกาเดียวต่อ Visit

เลือก

จับเวลาจาก visit.seated_at เท่านั้น

ไม่เลือก

นาฬิการายคน (คนมาเพิ่มได้ 120 นาทีใหม่)

เหตุผล

นาฬิการายคนบังคับให้ต้องมีตาราง guest และทำให้หน้าจอนับเวลาซับซ้อนเกินความจำเป็นของร้าน

ADR-05

รวมบิลที่ชั้น bill_group ไม่ใช่รวม Visit

เลือก

Visit แยกต่อโต๊ะ (นาฬิกาแยก) แล้วรวมยอดที่ bill_group

ไม่เลือก

ให้ Visit เดียวครองหลายโต๊ะเสมอเมื่อรวมบิล

เหตุผล

ค่าเกินเวลาคิดแยกตามโต๊ะได้ตามที่ตกลง โดยยังรวมจ่ายทีเดียวได้ — แก้ความขัดกันระหว่างสองข้อกำหนด

ADR-06

Customer Web ผ่าน Edge Function ไม่ยิง PostgREST

เลือก

ตรวจ qr_token ที่ Edge Function แล้วใช้ service role ต่อ

ไม่เลือก

anon key + RLS ที่เทียบ token ในตาราง

เหตุผล

ลูกค้าไม่มี JWT ประจำตัว RLS จึงไม่มีตัวตนให้เทียบ และการเปิด anon key ให้อ่านตาราง visit เสี่ยงรั่วข้ามโต๊ะ

ADR-07

Idempotency-Key ทุกจุดที่สร้างข้อมูล

เลือก

คอลัมน์ UNIQUE บน order_batch และ payment

ไม่เลือก

กันด้วยการ disable ปุ่มใน UI

เหตุผล

การกดซ้ำตอนเน็ตช้าเป็นสาเหตุอันดับหนึ่งของออเดอร์ผีและยอดเกิน ซึ่งเกิดจากฝั่ง network ไม่ใช่ฝั่งปุ่ม

ADR-08

soft delete ทั้งระบบ

เลือก

deleted_at ทุกตาราง + REVOKE DELETE

ไม่เลือก

DELETE จริงแล้วพึ่ง backup

เหตุผล

พนักงานหมุนเวียนสูงและกดผิดบ่อย การกู้คืนต้องทำได้เองในหน้า Admin ไม่ใช่ต้องเรียก dev

ADR-09

นับสต๊อกรายวัน ไม่ทำ BOM

เลือก

stock_count บันทึกยอดต้น-ยอดปลาย-ของเสียต่อวัน

ไม่เลือก

ตัดสต๊อกอัตโนมัติจากออเดอร์ผ่านสูตรอาหาร

เหตุผล

บุฟเฟต์ตักเองวัดปริมาณจริงต่อจานไม่ได้ ตัวเลข BOM จะดูแม่นแต่ผิด ซึ่งแย่กว่าไม่มีตัวเลข

## 12 · ข้อจำกัดและสิ่งที่อยู่นอกขอบเขต

นอกขอบเขต

รีวิว/คะแนนความพอใจ (ตัดออกตามที่ตกลง) · เดลิเวอรี · หลายสาขาในหน้าจอ · ระบบเงินเดือน ·
BOM ตัดสต๊อกอัตโนมัติ (ร้านบุฟเฟต์คิดจากน้ำหนักที่ตักไม่ได้จริง จึงใช้การนับมือรายวันแทน)

จำลอง (mock)

PromptPay QR ไม่มี webhook จริง — พนักงานกดยืนยันการรับเงินแทน ·
SMS/LINE แจ้งคิวเขียนลงตาราง `notification_log` ไม่ส่งออกจริง ·
ใบกำกับภาษีออกเป็น PDF ตัวอย่าง ยังไม่ผ่านการตรวจข้อกำหนดสรรพากร

สมมติฐานที่ต้องยืนยันกับร้าน

ไม่มี grace period หลัง 120 นาที · ราคาเด็กยังไม่กำหนดตัวเลข (ใส่เป็นค่าคอนฟิกใน `package_price`) ·
Add-on รีฟิลคิดครั้งเดียวไม่คิดซ้ำเมื่อต่อรอบ · ค่าเกินเวลาไม่คิดกับเด็กเล็กที่ฟรี

PDPA

ตาราง `visit` ไม่เก็บ PII เลย · เบอร์โทรที่ใช้เรียกคิวเป็นข้อมูลส่วนบุคคล
มี job ลบอัตโนมัติเมื่อปิดโต๊ะเกิน 24 ชม. · consent ของสมาชิกแยกเป็นรายวัตถุประสงค์ในตาราง `member_consent`
และถอนได้เท่าที่ให้ ตาม ม.19

