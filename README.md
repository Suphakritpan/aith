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
| API ฝั่ง Staff / Admin | ใช้ PostgREST + RLS ตรง ไม่ผ่าน Edge Function — ดูหัวข้อด้านล่าง |
| หน้าเว็บลูกค้า | รับคิว · ดูคิว · จองโต๊ะ · หน้าโต๊ะ (เมนู ออเดอร์ บิล แยกบิล เรียกพนักงาน) |
| หน้าเว็บ Staff / Admin / Queue TV | เขียนแล้วและต่อกับฐานข้อมูลจริง — เปิดสารบัญที่ `/pages` |

### API ฝั่งหลังร้านเลือกทางแล้ว

หน้า Staff/Admin ยิง PostgREST ตรงแล้วพึ่ง RLS กับฟังก์ชัน `security definer`
ส่วนชุดใน [supabase/functions/](supabase/functions/) ที่เขียนคลุม 19 endpoint ยัง **ไม่ได้ deploy**
และตอนนี้ไม่มีอะไรเรียกมันเลย ผลตามมาที่ต้องรู้คือ `requirePin` ใน `_shared/auth.ts`
ไม่ได้อยู่บนเส้นทางที่ใช้งานจริง การยืนยัน PIN จึงต้องทำที่ฐานข้อมูล (`fn_verify_pin`)
และ hash ที่ Edge Function ชุดนั้นเขียนเป็น PBKDF2 ยังใช้ร่วมกับ bcrypt ของ `fn_set_pin` ไม่ได้

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
- ลบคือ soft delete เท่านั้น — `REVOKE DELETE` ทั้งระบบ และทุกตารางที่กู้คืนได้ลง `audit_log`

ข้อ "เพิ่มได้ ลดไม่ได้" ใช้กับ `visit_addon` ด้วย ไม่ใช่แค่ `visit_pax` — ถ้าคุมแค่จำนวนคน
ลูกค้าจะสั่งน้ำรีฟิล ดื่มจนหมด แล้วกดลดเหลือศูนย์ก่อนเช็กบิลได้ (ปิดไว้ที่ `0018_close_leaks.sql`)

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
| `/` · `/reserve` · `/q/:token` · `/t/:token` | ลูกค้า — ไม่ต้องล็อกอิน `/t/:token` คือปลายทางของ QR |
| `/staff/*` | พนักงาน — ต้องล็อกอิน |
| `/admin/*` | หลังร้าน — ต้องเป็นหัวหน้ากะขึ้นไป |
| `/display` | จอคิวหน้าร้าน |
| `/pages` | สารบัญรวมทุกหน้า ใช้เดินดูงานตอนพัฒนาและสาธิต |

รายการเส้นทางฉบับจริงอยู่ใน [frontend/src/main.tsx](frontend/src/main.tsx) ที่เดียว
ตารางนี้เป็นภาพรวมระดับกลุ่ม ไม่ได้ไล่ทุกหน้าย่อย เพราะหน้าย่อยยังเพิ่มอยู่

ฝั่งฐานข้อมูล

```bash
supabase link --project-ref <project-ref>
supabase db push
```

ฐานข้อมูลปลายทางต้องเป็น schema `public` ที่ว่าง รายละเอียดและข้อควรระวังอยู่ใน
[supabase/README.md](supabase/README.md)
