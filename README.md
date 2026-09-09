# หมากระทุปุ๊ป๊ะ

> หิวปุ๊บ ป๊ะหมูกระทะปั๊บ

ระบบร้านหมูกระทะบุฟเฟต์ครบวงจร — ลูกค้า พนักงาน และเจ้าของร้านใช้ฐานข้อมูลเดียวกัน
โดยมี **Visit** เป็น aggregate root ที่ผูกคิว โต๊ะ ออเดอร์ เวลา และการชำระเงินไว้ในระเบียนเดียว

## สถานะตอนนี้

โปรเจกต์กำลังสร้างใหม่ตามสเปคฉบับ 7 ก.ย. 2569 ของเดิมถูกลบทิ้งทั้งหมดแล้ว

| ชั้น | สถานะ |
| --- | --- |
| เอกสารสเปค | ครบ — [System Design](Read/System%20Design.md) และ [Research](Read/Moo%20Kratha%20System%20Research.md) |
| ฐานข้อมูล (schema, trigger, RLS, seed) | ครบและทดสอบกฎธุรกิจแล้ว — ดู [supabase/README.md](supabase/README.md) |
| API ฝั่งลูกค้า (`/queue/*`, `/c/*`) | deploy แล้วและใช้งานได้ |
| API ฝั่ง Staff / Admin | ยังไม่ตัดสินใจ — ดูหัวข้อด้านล่าง |
| หน้าเว็บลูกค้า | รับคิว · ดูคิว · หน้าโต๊ะ (เมนู ออเดอร์ บิล เรียกพนักงาน) ใช้งานได้ |
| หน้าเว็บ Staff / Admin / Queue TV | ยังไม่เริ่ม |

### API ฝั่งหลังร้านยังมีสองแนวทางค้างอยู่

Edge Function ที่ deploy จริงชื่อ `api` รับเฉพาะเส้นทางฝั่งลูกค้า ส่วน Staff/Admin
ตั้งใจให้ยิง PostgREST ตรงแล้วพึ่ง RLS ขณะที่ใน [supabase/functions/](supabase/functions/)
มีอีกชุดที่เขียนคลุมทั้ง 19 endpoint แต่ยังไม่ได้ deploy — ต้องเลือกทางเดียวก่อนทำหน้า Staff

## เอกสารต้นทาง

| ไฟล์ | เนื้อหา |
| --- | --- |
| [Read/System Design.md](Read/System%20Design.md) | กฎธุรกิจ BR-01–BR-10, สถาปัตยกรรม, DFD, activity diagram, state machine, ER, data dictionary, SQL, ตาราง API, เครื่องคิดเงิน, ADR, ขอบเขต |
| [Read/Moo Kratha System Research.md](Read/Moo%20Kratha%20System%20Research.md) | หลักฐานเชิงตลาด เหตุผลของสถาปัตยกรรม Visit และข้อจำกัดที่ต้องออกแบบตั้งแต่วันแรก |
| `Read/*.dc.html` | ต้นฉบับที่แปลงมาเป็น Markdown ข้างบน เก็บไว้อ้างอิงรูปแบบ |

`Read/Markdown` คือสเปคฉบับก่อนหน้า เก็บไว้เทียบเท่านั้น — **ฉบับที่ยึดคือ System Design.md**

## กฎที่ระบบบังคับที่ฐานข้อมูล ไม่ใช่ที่หน้าจอ

การซ่อนปุ่มใน UI อย่างเดียวถือว่าออกแบบไม่ผ่าน เพราะผู้ใช้ที่ยิง API ตรงจะข้ามกฎได้
กฎทั้งสิบข้อจึงมี trigger หรือ constraint รองรับ และทดสอบแล้วว่าปฏิเสธได้จริง

- ออเดอร์รับได้เฉพาะสถานะ `DINING` · ออเดอร์แรกเลื่อน `SEATED → DINING` ให้เอง
- QR ผูกกับ Visit ไม่ใช่โต๊ะ ปิดโต๊ะแล้ว token หมดอายุทันที
- เพิ่มจำนวนคนได้ ลดไม่ได้ — ต้องให้หัวหน้ากะยกเลิกทั้ง Visit
- นาฬิกาเดียวต่อ Visit จับจาก `seated_at` · เกิน 120 นาทีคิดเต็มรอบใหม่ ไม่มี grace period
- ปิด Visit ได้เมื่อ `SUM(payment.amount) = bill.net_total` เท่านั้น
- รวมบิลข้ามโต๊ะได้เฉพาะ Visit ที่มาจากคิวใบเดียวกัน
- ลบคือ soft delete เท่านั้น — `REVOKE DELETE` ทั้งระบบ และทุกการเปลี่ยนแปลงลง `audit_log`

## Visit — หัวใจของระบบ

```
รับคิว → เรียกคิว → จัดโต๊ะ → เปิด Visit ─┬─ qr_session (QR ประจำมื้อ)
                                        ├─ visit_pax (จำนวนคนแยก tier)
                                        ├─ visit_addon (น้ำรีฟิลรายคน)
                                        ├─ order_batch → order_item → ครัว
                                        ├─ service_call
                                        └─ bill → payment → ปิดโต๊ะ
```

ทุกอย่างที่เกิดบนโต๊ะผูกกับ `visit.visit_id` เดียว จึงตอบได้ว่ายอดขายก้อนนี้มาจากคิวไหน
ใช้โต๊ะกี่นาที สั่งกี่รอบ ใครเปิด ใครปิด และเกินเวลากี่รอบ

## เริ่มใช้งาน

```bash
cd frontend
npm install
npm run dev        # → http://localhost:5173
```

`npm run dev` ยิง `/api` ผ่าน proxy ไปที่ Edge Function ที่ deploy อยู่ จึงใช้งานได้ทันที
โดยไม่ต้องรัน Supabase ในเครื่อง ตั้งค่าได้ที่ `VITE_PROXY_TARGET` ใน `.env`

| เส้นทาง | ใคร |
| --- | --- |
| `/` | ลูกค้า — รับคิว |
| `/q/:token` | ลูกค้า — ดูลำดับคิวของตัวเอง |
| `/t/:token` | ลูกค้า — หน้าโต๊ะ ปลายทางของ QR |

ฝั่งฐานข้อมูล

```bash
supabase link --project-ref <project-ref>
supabase db push
```

ฐานข้อมูลปลายทางต้องเป็น schema `public` ที่ว่าง รายละเอียดและข้อควรระวังอยู่ใน
[supabase/README.md](supabase/README.md)
