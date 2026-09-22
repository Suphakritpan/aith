# ชุดเตรียมสอบโปรเจกต์ — หมากระทุปุ๊ป๊ะ (ระบบร้านหมูกระทะบุฟเฟต์)

> ทุกข้อในเอกสารนี้อ้างอิงจากไฟล์จริงในโปรเจกต์ ไม่ได้เดาจากชื่อไฟล์
> ส่วนที่เป็น "ข้อสันนิษฐาน" หรือ "ไม่พบข้อมูล" จะเขียนกำกับไว้ชัดเจน
> ตรวจเมื่อ: 22 ก.ย. 2569 · commit ล่าสุด `16c0ccf`

---

## 1 · ภาพรวมโปรเจกต์

### โปรเจกต์นี้ทำอะไร

ระบบบริหารร้านหมูกระทะบุฟเฟต์ครบวงจร ที่ลูกค้า พนักงาน และเจ้าของร้าน
ใช้ฐานข้อมูลชุดเดียวกัน ครอบคลุมตั้งแต่ **รับคิว → เรียกคิว → จัดโต๊ะ → สั่งอาหาร →
เรียกพนักงาน → คิดเงิน → แยกบิล → ปิดโต๊ะ → รายงานยอดขาย**

หลักฐาน: `README.md:5-8`, `Read/System Design.md:11-40`

### ทำไมถึงสร้างระบบนี้

จาก `Read/Moo Kratha System Research.md` และ `Read/System Design.md` เหตุผลหลักคือ
ร้านบุฟเฟต์มีกฎเรื่อง **เวลา** และ **จำนวนหัว** ที่ POS ทั่วไปทำไม่ได้:

1. POS ทั่วไปผูกออเดอร์กับ "โต๊ะ" — พอย้ายโต๊ะ ออเดอร์หลุด และคิดเวลาไม่ได้
2. บุฟเฟต์คิดเงิน **ต่อหัว** ไม่ใช่ต่อจาน — ถ้าเก็บราคาไว้ที่จานจะได้ยอดสองชุดที่ไม่ตรงกัน
3. เกิน 120 นาทีต้องคิดเงินเพิ่ม — ต้องมีนาฬิกาที่เชื่อถือได้ผูกกับ "มื้อ" ไม่ใช่โต๊ะ
4. ลูกค้าต้องสั่งเองจาก QR โดยไม่ต้องโหลดแอปและไม่ต้องล็อกอิน

### แนวคิดแกนกลาง — Visit เป็น aggregate root

```
รับคิว → เรียกคิว → จัดโต๊ะ → เปิด Visit ─┬─ qr_session  (QR ประจำมื้อ)
                                        ├─ visit_table (โต๊ะที่ครองอยู่)
                                        ├─ visit_pax   (จำนวนคนแยก tier)
                                        ├─ visit_addon (น้ำรีฟิลรายคน)
                                        ├─ order_batch → order_item → ครัว
                                        ├─ service_call
                                        └─ bill → payment → ปิดโต๊ะ
```

ทุกอย่างที่เกิดบนโต๊ะผูกกับ `visit.visit_id` เดียว จึงตอบได้ว่า
ยอดขายก้อนนี้มาจากคิวไหน ใช้โต๊ะกี่นาที สั่งกี่รอบ ใครเปิด ใครปิด เกินเวลากี่รอบ

หลักฐาน: `supabase/migrations/0004_visit.sql:1-45`, ADR-01 ที่ `Read/System Design.md:1297-1311`

### หลักการที่ยึดทั้งโปรเจกต์ (ข้อนี้อาจารย์ชอบถาม)

> **"กฎเงินอยู่ที่ฐานข้อมูล ไม่ใช่ที่หน้าจอ"**

การซ่อนปุ่มใน UI อย่างเดียวถือว่าออกแบบไม่ผ่าน เพราะคนที่ยิง API ตรงจะข้ามกฎได้
กฎธุรกิจทั้ง 10 ข้อจึงมี trigger หรือ constraint ในฐานข้อมูลรองรับ และทดสอบแล้วว่าปฏิเสธได้จริง

หลักฐาน: `README.md:41-55`, `supabase/README.md:3-5`, `supabase/migrations/0008_business_rules.sql:1-6`

---

## 2 · ใครทำอะไร (ตรวจจาก Git จริง)

### สิ่งที่ Git บอกได้

```
git shortlog -sne --all
     7  jarnballproject-ops <jarnballproject@gmail.com>
     6  unknown <suphakirtpan@gmail.com>
```

| Commit | ผู้เขียน | วันที่ | เนื้อหา |
| --- | --- | --- | --- |
| `22d85aa` Initial commit | jarnballproject-ops | 31 ส.ค. 69 | README บรรทัดเดียว |
| `1e88876` 1 | jarnballproject-ops | 31 ส.ค. 69 | โครงแรก 77 ไฟล์ (สคีมาเวอร์ชันเก่า) |
| `dbce095` Update Markdown | jarnballproject-ops | 31 ส.ค. 69 | แก้เอกสาร |
| `9e18e64` renew | jarnballproject-ops | 7 ก.ย. 69 | **เขียนใหม่ทั้งหมดตามสเปคใหม่** (+5,228 / −9,212) migration 0001-0012 |
| `342317f` 16 | jarnballproject-ops | 9 ก.ย. 69 | migration 0013, 0016 + Edge Functions |
| `f32650b` 17 | jarnballproject-ops | 9 ก.ย. 69 | ตั้ง frontend (vite.config, tsconfig) |
| `8924633` 9/14/1544 | jarnballproject-ops | 14 ก.ย. 69 | **ก้อนใหญ่ที่สุด 127 ไฟล์ +15,205** — หน้าเว็บทั้งระบบ + migration 0017, 0018 |
| `5bd7684` | unknown (suphakirtpan) | 14 ก.ย. 69 | Fix build, เพิ่ม lint, ย้าย PIN ไปตรวจที่ DB |
| `9ba9d57` | unknown (suphakirtpan) | 14 ก.ย. 69 | ลบ dead code ที่ graphify audit เจอ (−58 บรรทัด) |
| `16c0ccf` 9/15/651 | unknown (suphakirtpan) | 15 ก.ย. 69 | migration 0019 + แก้ UX ฝั่งลูกค้า |

การแบ่งตามโฟลเดอร์:

| โฟลเดอร์ | jarnballproject-ops | unknown (suphakirtpan) |
| --- | --- | --- |
| `supabase/` (DB + API) | 4 commits | 3 commits |
| `frontend/` | 5 commits | 3 commits |
| `Read/` (เอกสารสเปค) | 1 commit | 0 |

Remote: `origin` = `github.com/Suphakritpan/aith` · `upstream` = `github.com/jarnballproject-ops/aith`
Branch: `main` (ใช้งานจริง) และ `backup-local-20260914` (สำรองไว้ ไม่ได้ merge)

### สิ่งที่ Git **บอกไม่ได้** — ต้องถามสมาชิกในทีม

**Git ระบุได้แค่ 2 identity และทั้งคู่มีแนวโน้มเป็นคนเดียวกันหรือบัญชีของโปรเจกต์**
(`git config user.name` ปัจจุบันคือ `Suphakritpan` และ repo เป็นของบัญชีเดียวกัน)
จึง **สรุปจาก Git ไม่ได้ว่าใครในทีมรับผิดชอบส่วนไหน**

ถ้าอาจารย์ถาม "ใครทำอะไร" ให้ตอบตามจริงว่า:
- Git แบ่งได้แค่ตามช่วงเวลา: ช่วงวางสคีมา/เอกสาร (31 ส.ค.–14 ก.ย.) กับช่วงแก้บั๊ก/UX (14–15 ก.ย.)
- การแบ่งงานรายคนต้องยืนยันกับสมาชิกในทีมเอง เพราะไม่ได้บันทึกไว้ใน commit

**ข้อเสนอแนะก่อนสอบ:** เตรียมตารางแบ่งงานรายคนไว้พูดเอง และถ้าทันควร
ตั้ง `git config user.name` ให้ถูกคน แล้ว commit งานที่เหลือด้วยชื่อจริง

---

## 3 · ระบบทำอะไรได้บ้าง (แยกตามผู้ใช้ 4 กลุ่ม)

ตรวจจาก `frontend/src/main.tsx:53-95` (รายการ route จริง)

### 3.1 ลูกค้า — ไม่ต้องล็อกอิน

| หน้า | Route | ไฟล์ | ทำอะไร |
| --- | --- | --- | --- |
| หน้าแรก / รับคิว | `/` | `apps/customer/LandingPage.tsx` | กดรับคิว ระบบเลือกช่อง A/B/C ให้เองตามจำนวนคน |
| จองโต๊ะล่วงหน้า | `/reserve` | `apps/customer/ReservePage.tsx` | จองล่วงหน้า 30 นาที–30 วัน · ค้น/ยกเลิกการจองเองได้ |
| ดูคิวตัวเอง | `/q/:token` | `apps/customer/QueuePage.tsx` | เลขคิว · คิวก่อนหน้า · เวลารอโดยประมาณ · เลขที่กำลังเรียก |
| หน้าโต๊ะ (ปลายทาง QR) | `/t/:token` | `apps/customer/TablePage.tsx` | นาฬิกานับถอยหลัง + แท็บ เมนู/ออเดอร์/บิล + ปุ่มเรียกพนักงาน |
| แยกบิล | `/t/:token/split` | `apps/customer/SplitPage.tsx` | เครื่องคิดเลขหารบิล 2 โหมด (หารเท่ากัน / จ่ายคนละก้อน) |

ฟีเจอร์ย่อยฝั่งลูกค้า: สั่งอาหารหลายรอบ (`MenuTab.tsx`) · เลือกน้ำรีฟิลรายคน ·
ดูสถานะอาหาร (`OrdersTab.tsx`) · ดูยอดปัจจุบันและขอเช็กบิล (`BillTab.tsx`) ·
เรียกพนักงาน 4 ชนิด (`ServiceCallBar.tsx`) · หน้า "มื้อนี้จบแล้ว" เมื่อ token หมดอายุ (`MealEnded.tsx`)

### 3.2 พนักงาน — ต้องล็อกอิน (`/staff/*`)

| หน้า | ไฟล์ | ทำอะไร |
| --- | --- | --- |
| Dashboard | `apps/staff/DashboardPage.tsx` | โต๊ะที่ใช้งานอยู่ + เวลาคงเหลือ + คำเรียกพนักงานที่ยังไม่ปิด |
| คิว | `apps/staff/QueuePage.tsx` | เรียกคิว (สูงสุด 3 ครั้ง ห่างกัน 2 นาที) + เช็คอิน |
| เช็คอิน | `apps/staff/CheckInDialog.tsx` | เลือกโต๊ะ · ระบุจำนวนคนแยก tier · น้ำรีฟิล · เปิด Visit + ออก QR |
| ผังโต๊ะ | `apps/staff/FloorPage.tsx` | สถานะโต๊ะ 4 สถานะ + กดคืนโต๊ะเป็นว่าง |
| ครัว | `apps/staff/KitchenPage.tsx` | คิวอาหาร PENDING → PREPARING → SERVED |
| หน้าโต๊ะ | `apps/staff/VisitPage.tsx` | ออกบิล · รับเงิน · เพิ่มคน · ปิดโต๊ะ · ยกเลิก Visit · รวมบิล |
| การจอง | `apps/staff/ReservationsPage.tsx` | กันโต๊ะ · ปล่อยการจอง · ทำเครื่องหมายว่านั่งแล้ว |
| QR | `apps/staff/QrDialog.tsx` | พิมพ์/แสดง QR ของโต๊ะซ้ำ |
| รวมบิล | `apps/staff/MergeBillDialog.tsx` | รวมบิลข้ามโต๊ะเฉพาะที่มาจากคิวใบเดียวกัน |

### 3.3 หลังร้าน — ต้องเป็นหัวหน้ากะขึ้นไป (`/admin/*`)

`OverviewPage` (รายงานรายวัน) · `MenuPage` (เปิด-ปิดเมนูของหมด 86 list) ·
`PackagesPage` (ราคาแยก tier + add-on) · `TablesPage` (โซนและโต๊ะ) ·
`StaffPage` (บทบาท 3 ระดับ + ตั้ง/ล้าง PIN) · `StockPage` (นับสต๊อกรายวัน) ·
`VisitsPage` (Visit ย้อนหลัง) · `RestorePage` (กู้คืนข้อมูลที่ soft delete)

### 3.4 จอคิวหน้าร้าน

`/display` → `apps/display/DisplayPage.tsx` — อ่านอย่างเดียว ไม่ต้องล็อกอิน
ตัวอักษรใหญ่อ่านจาก 3–5 เมตร ไม่มีข้อมูลส่วนบุคคลบนจอตามหลัก PDPA

### 3.5 หน้าพิเศษ

`/pages` → `apps/DirectoryPage.tsx` — สารบัญรวมทุกหน้า **ใช้เดินสาธิตตอนสอบได้เลย**

---

## 4 · User Flow (เส้นทางหลักตั้งแต่ลูกค้าเดินเข้าร้านถึงปิดโต๊ะ)

```
[ลูกค้า]  เปิด /  → กดรับคิว (ใส่จำนวนคน + เบอร์โทร)
             │  POST /queue/tickets  (ต้องมี Idempotency-Key)
             ▼
          ได้เลขคิว A-001 + public_token → เด้งไป /q/<token>
          หน้านี้ poll ทุก 5 วิ: คิวก่อนหน้ากี่ใบ · เวลารอ · เลขที่กำลังเรียก
             │
[พนักงาน] /staff/queue → กดเรียกคิว (fn_call_queue_ticket)
          ├─ เรียกได้สูงสุด 3 ครั้ง ห่างกัน 2 นาที (อ่านเกณฑ์จาก app_setting)
          ├─ เขียน notification_log (mock ไม่ส่งจริง)
          └─ ครบ 3 ครั้ง + 2 นาที → fn_sweep_no_show() ตัดเป็น NO_SHOW
             │
[พนักงาน] กดเช็คอิน → CheckInDialog → fn_open_visit()
          ทำในทรานแซกชันเดียว: สร้าง visit(SEATED) + visit_table + visit_pax
          + visit_addon + qr_session(token) + queue_ticket → SEATED
          + dining_table → OCCUPIED
             │
             ▼  ลูกค้าสแกน QR
[ลูกค้า]  /t/<qr_token> → GET /c/:qrToken (poll ทุก 5 วิ)
          ├─ สั่งอาหาร → POST /c/:qrToken/orders
          │     trigger เลื่อน SEATED → DINING อัตโนมัติที่ออเดอร์แรก (BR-01)
          ├─ เลือกน้ำรีฟิล → POST /c/:qrToken/addons
          ├─ เรียกพนักงาน → POST /c/:qrToken/service-calls (กดรัวได้ 429)
          └─ นาฬิกา: เตือนล่วงหน้า 15 นาที · เกิน 120 นาทีขึ้นแถบ "คิดเพิ่มอีกรอบ"
             │
[ครัว]    /staff/kitchen → PENDING → PREPARING → SERVED (ข้ามขั้นไม่ได้)
             │
[เช็กบิล]  ลูกค้ากดขอเช็กบิล หรือพนักงานกดออกบิล → fn_issue_bill()
          ├─ ถ้ายังมี order_item สถานะ PENDING ค้าง → ปฏิเสธ
          ├─ visit → BILL_REQUESTED (ล็อกการสั่งใหม่)
          └─ fn_calc_bill() → snapshot ยอดลงตาราง bill
             │
[แยกบิล]   /t/<token>/split — คำนวณให้ดู แต่ลูกค้ากดจ่ายเองไม่ได้
          (ไม่มี webhook ธนาคาร พนักงานต้องเป็นผู้รับผิดชอบทุกแถว)
             │
[รับเงิน]  พนักงานบันทึก payment ทีละก้อน (หลายแถวต่อหนึ่งบิลได้)
          trigger กันไม่ให้ผลรวมเกิน net_total
             │
[ปิดโต๊ะ]  fn_close_visit() → BILL_REQUESTED → PAID → CLOSED
          trigger ตรวจ SUM(payment.amount) = bill.net_total เท่านั้นจึงผ่าน (BR-06)
          แล้วทำให้ครบชุด: qr_session เพิกถอน · โต๊ะ → CLEANING · visit_table ปล่อย
             │
[เก็บโต๊ะ] พนักงานกดคืนโต๊ะเป็น AVAILABLE จากผังโต๊ะ
```

หลักฐานหลัก: `0012_app_rpc_and_realtime.sql:52-163`, `0008_business_rules.sql:60-114`,
`supabase/functions/c/index.ts`, `supabase/functions/queue/index.ts`

---

## 5 · Tech Stack (ใช้อะไร · ใช้ทำอะไร · ทำไมถึงเลือก)

ตรวจจาก `frontend/package.json`, `frontend/vite.config.ts`, `supabase/functions/_shared/db.ts`

| เทคโนโลยี | เวอร์ชันจริง | ใช้ทำอะไรในโปรเจกต์นี้ |
| --- | --- | --- |
| React | ^19.2.8 | หน้าเว็บทั้ง 4 กลุ่มผู้ใช้ เป็น SPA ตัวเดียว |
| react-router | ^7.18.3 | แบ่ง route 4 กลุ่ม + route guard ฝั่ง staff/admin |
| TypeScript | ^5.8.3 | ชนิดข้อมูลตรงกับคำตอบ API จริง (`lib/types.ts`) |
| Vite | ^6.4.3 | dev server + build · proxy `/api` ไป Edge Function |
| Tailwind CSS | ^4.3.3 (ผ่าน `@tailwindcss/vite`) | ระบบดีไซน์ทั้งหมด ไม่มีไฟล์ CSS แยกต่อหน้า |
| @supabase/supabase-js | ^2.112.4 | ฝั่ง staff/admin ยิง PostgREST + Auth ตรง |
| qrcode | ^1.5.4 | สร้าง QR ของโต๊ะให้พนักงานพิมพ์ |
| ESLint + typescript-eslint | ^10.10.0 | lint (เพิ่มตอน commit `5bd7684`) |
| Deno | runtime ของ Supabase Edge Functions | รัน API ฝั่งลูกค้า (`supabase/functions/*`) |
| PostgreSQL 17 | บน Supabase | ฐานข้อมูล + กฎธุรกิจทั้งหมด (trigger/constraint/RLS) |
| Supabase Auth | — | ล็อกอินพนักงาน (JWT) |
| Supabase Realtime | — | เปิดไว้ 6 ตาราง (`visit, order_item, service_call, queue_ticket, dining_table, menu_item`) |

**ข้อสังเกตที่ต้องพูดให้ตรง:** Realtime ถูก "เปิดไว้ที่ฐานข้อมูล" แล้ว
(`0012_app_rpc_and_realtime.sql:224-238`) แต่โค้ดหน้าเว็บที่ตรวจพบ **ใช้ polling ทั้งหมด**
ผ่าน `lib/usePolling.ts` ยังไม่พบการ subscribe Realtime ในหน้าใด

### 5.1 Frontend — ทำไม React ไม่ใช่ HTML+JS ธรรมดา

- **ใช้ทำอะไร:** หน้าจอ 4 กลุ่มผู้ใช้ 30+ หน้า ที่ต้องอัปเดตตัวเลขทุกวินาที (นาฬิกา) และทุก 5 วินาที (ข้อมูล)
- **ทำงานอย่างไร:** SPA เดียว แบ่ง route ที่ `main.tsx` · state ที่เปลี่ยนบ่อยอยู่ใน hook (`usePolling`, `useNow`) · React re-render เฉพาะส่วนที่ข้อมูลเปลี่ยน
- **ทำไมถึงเลือก:** หน้าโต๊ะของลูกค้ามีนาฬิกานับถอยหลังที่เดินทุกวินาที + ข้อมูลที่ poll ทุก 5 วินาที ถ้าเขียนด้วย DOM ธรรมดาต้องเขียนโค้ดอัปเดต DOM เองทุกจุด และเสี่ยงหน้าจอกับข้อมูลไม่ตรงกัน
- **ใช้อะไรแทนได้:** HTML+JS ธรรมดา · Vue · Svelte · Next.js · หรือ server-rendered (PHP/Laravel Blade, Django Template)
- **ข้อดีของที่เลือก:** component reuse ได้ข้ามทั้ง 4 แอป (`design/primitives.tsx` ใช้ทุกหน้า) · ecosystem ใหญ่ · หาคนช่วยง่าย
- **ข้อเสีย:** bundle ใหญ่กว่า HTML ธรรมดา · ต้องมี build step · SEO ไม่ดี (แต่โปรเจกต์นี้ไม่ต้องการ SEO เพราะเข้าผ่าน QR)
- **ถ้าเปลี่ยนเป็นอย่างอื่น:** เปลี่ยนเป็น Vue/Svelte ได้ผลเท่ากัน ต้องเขียนหน้าใหม่ทั้งหมดแต่ API และ DB ไม่ต้องแตะเลย · เปลี่ยนเป็น HTML ธรรมดาได้ แต่ต้องเขียน state management เอง ~30 หน้า · เปลี่ยนเป็น Next.js จะได้ SSR ที่ไม่มีประโยชน์กับงานนี้ แถมต้องมีเซิร์ฟเวอร์ Node เพิ่ม ซึ่งขัดกับการที่ตอนนี้ deploy เป็น static ได้

### 5.2 Vite — ทำไมไม่ใช่ Create React App หรือ Webpack

- **ใช้ทำอะไร:** dev server + bundler + proxy `/api`
- **ทำงานอย่างไร:** `vite.config.ts:14-21` proxy ทุก request ที่ขึ้นต้นด้วย `/api`
  ไปที่ `VITE_PROXY_TARGET` (Edge Function ที่ deploy แล้ว) โค้ดฝั่ง client จึงใช้เส้นทางเดียวกัน
  ทั้งตอน dev และตอน deploy จริง ไม่ต้องมี `if (dev)` ในโค้ด
- **ทำไมถึงเลือก:** dev server เริ่มเร็ว (ESM native) · proxy ตั้งง่าย · CRA เลิกดูแลแล้ว
- **ข้อจำกัด:** proxy ทำงานเฉพาะตอน `npm run dev` ตอน deploy จริงต้องตั้ง `VITE_API_BASE_URL` เป็น URL เต็ม

### 5.3 Tailwind CSS

- **ใช้ทำอะไร:** style ทุกหน้า ผ่าน utility class ใน JSX
- **ทำไมถึงเลือก:** ไม่ต้องตั้งชื่อ class · ไม่มีไฟล์ CSS ตาย · จอ TV กับมือถือใช้ token เดียวกัน (`design/primitives.tsx`)
- **ใช้อะไรแทนได้:** CSS Modules · styled-components · Bootstrap · CSS ธรรมดา
- **ข้อเสีย:** class ใน JSX ยาว อ่านยากตอนแรก · ต้องมี build step

---

## 6 · Architecture (สถาปัตยกรรม)

### 6.1 ภาพรวม 3 ชั้น

```
┌─────────────────────────────────────────────────────────────┐
│ Client — React SPA ตัวเดียว (frontend/)                      │
│  Customer Web  │  Staff Web  │  Admin Web  │  Queue TV       │
└────────┬──────────────┬─────────────────────────────────────┘
         │              │
   ไม่มี JWT      มี JWT (Supabase Auth)
         │              │
         ▼              ▼
┌──────────────────┐  ┌──────────────────────────────────────┐
│ Edge Function    │  │ PostgREST (ยิงตารางและ RPC ตรง)        │
│ (Deno)           │  │ ความปลอดภัยมาจาก RLS                  │
│ ตรวจ qr_token    │  │                                      │
│ แล้วใช้ service  │  │                                      │
│ role ต่อ          │  │                                      │
└────────┬─────────┘  └──────────┬───────────────────────────┘
         │                       │
         ▼                       ▼
┌─────────────────────────────────────────────────────────────┐
│ PostgreSQL 17 (Supabase)                                    │
│  24+ ตาราง · RLS ทุกตาราง · trigger บังคับ BR-01..BR-10      │
│  soft delete ทุกที่ · audit_log append-only                  │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 จุดสำคัญที่สุดของสถาปัตยกรรมนี้ — **ทางเข้าข้อมูลมี 2 เส้น ไม่ใช่เส้นเดียว**

| | ฝั่งลูกค้า | ฝั่งพนักงาน / หลังร้าน |
| --- | --- | --- |
| พิสูจน์ตัวตนด้วย | `qr_token` ในลิงก์ | Supabase Auth (JWT) |
| เส้นทาง | React → `/api` → Edge Function → service role → DB | React → PostgREST/RPC → DB |
| ใครคุมสิทธิ์ | โค้ดใน Edge Function ตรวจ token เอง | RLS policy ในฐานข้อมูล |
| ไฟล์หลัก | `supabase/functions/` | `frontend/src/lib/staffQueries.ts`, `adminQueries.ts` |
| สิทธิ์ `anon` ในฐานข้อมูล | **ถอนหมด** ยกเว้น `fn_create_reservation`, `fn_find_reservation`, `fn_cancel_reservation` | — |

**ทำไมต้องแยกสองเส้น (ADR-06) — คำตอบที่ต้องพูดให้ได้:**

> ลูกค้าไม่ได้ล็อกอิน จึงไม่มี JWT ให้ RLS เอาไปเทียบว่า "แถวนี้เป็นของคุณไหม"
> ถ้าเปิด `anon key` ให้ลูกค้าอ่านตาราง `visit` ตรง ๆ คนที่มี anon key (ซึ่งอยู่ใน
> JavaScript ของทุกคน) จะอ่านข้อมูลของโต๊ะอื่นได้หมด
> เราจึงให้ Edge Function เป็นคนตรวจ `qr_token` ว่าตรงกับ Visit ไหน
> แล้วค่อยใช้ service role คุยกับฐานข้อมูล โดยจำกัดขอบเขต query ไว้ที่ Visit นั้นเท่านั้น
>
> หลักฐาน: `0010_rls.sql:5-7` และ `0010_rls.sql:257-261` (ถอนสิทธิ์ anon ทั้ง schema)
> · `0013_lock_function_execute.sql:7-12` (ถอน EXECUTE จาก `public`/`anon`)
> · `supabase/functions/_shared/auth.ts:82-106` (`requireVisitByToken`)

### 6.3 ตาราง "สิ่งที่โปรเจกต์ใช้ → ทางเลือกอื่น" สำหรับ Architecture

- **สิ่งที่ใช้:** BaaS (Supabase) + Edge Function เฉพาะฝั่งที่ RLS ทำแทนไม่ได้
- **ใช้ทำอะไร:** เป็นทั้ง DB, Auth, API, Realtime, Storage ในบริการเดียว
- **ทำงานอย่างไร:** PostgREST เปิดตารางเป็น REST API อัตโนมัติ แล้ว RLS กรองแถวตาม JWT
- **ทำไมถึงเลือก:** ทีมเล็ก เวลาจำกัด เขียน backend CRUD เองทั้งหมดจะกินเวลาไปกับงานที่ไม่ใช่กฎธุรกิจ
- **ใช้อะไรแทนได้:**
  | ทางเลือก | ข้อดี | ข้อเสีย |
  | --- | --- | --- |
  | Express/NestJS + Prisma | ควบคุมได้ทุกบรรทัด · ทดสอบง่าย | ต้องเขียน endpoint ~19 ตัวเอง + auth + deploy เซิร์ฟเวอร์เอง |
  | Laravel / Django | มี ORM, admin, migration ครบในกล่อง | ต้องมีเซิร์ฟเวอร์ตลอดเวลา · Realtime ต้องต่อเพิ่ม |
  | Firebase | เรียลไทม์ดีมาก · setup เร็ว | NoSQL ไม่มี transaction ข้ามเอกสารแบบที่บิลนี้ต้องใช้ · ไม่มี trigger SQL |
  | Microservices | แยก scale ได้ | overkill สำหรับร้านเดียว · ต้องทำ distributed transaction ตอนปิดบิล |
- **ข้อดีของที่เลือก:** deploy เร็ว · RLS = authorization ที่เลี่ยงไม่ได้แม้ client จะยิงตรง · transaction ของ Postgres ใช้ได้เต็มที่
- **ข้อเสีย:** ผูกกับ Supabase (vendor lock-in ระดับกลาง — schema ย้ายได้ แต่ Auth/RLS/Edge Function ต้องเขียนใหม่) · debug RLS ยากกว่า if-else ในโค้ด · logic กระจายอยู่ใน SQL ซึ่งทีมต้องอ่าน SQL เป็น
- **ถ้าเปลี่ยนเป็น monolith (Express/Laravel):** โครงสร้างตารางใช้ต่อได้ทั้งหมด แต่ต้องย้าย RLS policy 40+ ข้อไปเป็น middleware ตรวจสิทธิ์ในโค้ด และต้องระวังว่าถ้าลืมตรวจที่ endpoint ไหน ช่องโหว่จะเปิดทันที (ต่างจาก RLS ที่ปิดโดยค่าเริ่มต้น)
- **คำถามที่อาจารย์อาจถาม:** "ทำไมไม่รวมเป็นระบบเดียว?" → **ตอบ:** ระบบนี้รวมเป็นระบบเดียวอยู่แล้ว (monolith ที่ฐานข้อมูลเดียว) ไม่ได้แยก microservice สิ่งที่แยกคือ *ทางเข้า* สองเส้น เพราะผู้ใช้สองกลุ่มมีวิธีพิสูจน์ตัวตนต่างกันโดยสิ้นเชิง

---

## 7 · ฐานข้อมูล — ออกแบบอย่างไร ตารางไหนทำอะไร

รวม **24 ตาราง + 1 ตาราง idempotency + 7 view** แบ่งเป็น 5 กลุ่ม
ทุกตารางมี `deleted_at` (soft delete) และตารางข้อมูลปฏิบัติการมี `branch_id` ตั้งแต่วันแรก

### 7.1 กลุ่ม 1 — โครงร้านและผู้ใช้ (`0002_shop_and_queue.sql`)

| ตาราง | มีไว้ทำอะไร | จุดที่ต้องอธิบายได้ |
| --- | --- | --- |
| `branch` | สาขา · เวลาเปิด-ปิด · เบอร์โทร | `phone` เพิ่มทีหลังที่ `0019` เพราะลูกค้าไม่มีเบอร์ร้านให้โทร |
| `staff` | พนักงาน · บทบาท 3 ระดับ · `pin_hash` | ผูกกับ `auth.users(id)` แบบ `unique` · PIN เก็บเป็น bcrypt เท่านั้น |
| `zone` | โซนในร้าน (ห้องแอร์ / นอกอาคาร) | มีไว้จัดกลุ่มโต๊ะบนผังโต๊ะ |
| `dining_table` | โต๊ะ · จำนวนที่นั่ง · สถานะ 4 แบบ | `unique (branch_id, table_no)` กันชื่อโต๊ะซ้ำในสาขาเดียว |

### 7.2 กลุ่ม 2 — คิวและการจอง

| ตาราง | มีไว้ทำอะไร | จุดที่ต้องอธิบายได้ |
| --- | --- | --- |
| `queue_ticket` | ใบคิว · ช่อง A/B/C · เลขรายวัน · `public_token` | `unique (branch_id, service_date, lane, seq_no)` — เลขรีเซ็ตทุกวันจึงต้องใส่วันที่ใน key · `phone` เป็น PII ที่ถูกลบอัตโนมัติหลังปิดโต๊ะ 24 ชม. |
| `queue_call` | ประวัติการเรียกคิว (ครั้งที่ 1-3) | `check (call_no between 1 and 3)` + `unique (queue_ticket_id, call_no)` = บังคับ BR-09 ที่ระดับ constraint |
| `reservation` | การจองล่วงหน้า · กันโต๊ะ 15 นาที | `hold_until` คำนวณด้วย **trigger** ไม่ใช่ generated column เพราะ `timestamptz + interval` เป็น stable ไม่ใช่ immutable |
| `notification_log` | บันทึกข้อความแจ้งคิว (mock ไม่ส่งจริง) | `is_mock` default true — บอกตรง ๆ ว่ายังไม่ต่อของจริง |

### 7.3 กลุ่ม 3 — Visit (แกนกลาง) (`0004_visit.sql`)

| ตาราง | มีไว้ทำอะไร | จุดที่ต้องอธิบายได้ |
| --- | --- | --- |
| `visit` | **หนึ่งแถว = การใช้บริการหนึ่งครั้งของลูกค้าหนึ่งกลุ่ม** ถือ timestamp ทั้งหมด | `seated_at` คือจุดเริ่มนาฬิกาเดียวของมื้อ · `duration_minutes` เป็น snapshot ไม่อ้างตาราง package เพื่อไม่ให้บิลเก่าเปลี่ยนตามที่ร้านแก้แพ็กเกจ · มี `constraint void_needs_reason` บังคับเหตุผล ≥ 10 ตัวอักษร |
| `visit_table` | ประวัติการครองโต๊ะ (กลุ่มใหญ่ใช้หลายโต๊ะบน Visit เดียว) | `unique index ... where released_at is null` = **โต๊ะหนึ่งตัวถูกจองซ้อนสอง Visit ไม่ได้** (partial unique index) |
| `visit_pax` | จำนวนคนแยก tier + **snapshot ราคา** | `unique (visit_id, tier)` · `toddler_needs_verify` บังคับว่าเด็กเล็กฟรีต้องมีพนักงานยืนยันส่วนสูง · `toddler_is_free` บังคับราคา 0 |
| `visit_addon` | น้ำรีฟิลรายคน เก็บเป็น **จำนวน** ไม่ระบุตัวบุคคล | ADR-03 ลด PII · `unique (visit_id, addon_id)` |
| `qr_session` | token ของมื้อ | ผูกกับ **visit** ไม่ใช่โต๊ะ (BR-02) ปิดโต๊ะแล้ว `revoked_at` ถูกเซ็ตทันที |
| `bill_group` | ชั้นรวมบิลข้ามโต๊ะ | ต้องประกาศก่อน `visit` เพราะ `visit` อ้างถึง · ผูกกับ `queue_ticket_id` เพื่อบังคับ BR-07 |

### 7.4 กลุ่ม 4 — เมนูและออเดอร์

| ตาราง | มีไว้ทำอะไร | จุดที่ต้องอธิบายได้ |
| --- | --- | --- |
| `package` | แพ็กเกจบุฟเฟต์ · 120 นาที · โหมดเกินเวลา | `overtime_mode` มีค่าเดียวคือ `FULL_ROUND` — ไม่มีโหมดคิดตามนาที |
| `package_price` | ราคาแยก tier + `effective_from` | ขึ้นราคาด้วยการ **เพิ่มแถวใหม่** ไม่แก้ทับ → ตรวจย้อนหลังได้ว่าวันนั้นตั้งราคาเท่าไร |
| `addon` | รายการเสริม (น้ำรีฟิล) · `charge_basis` PER_HEAD/PER_TABLE | |
| `menu_category` / `menu_item` | หมวดหมู่และเมนู | **`menu_item` ไม่มีคอลัมน์ราคาเลยโดยเจตนา (ADR-02)** · `is_available` = 86 list ปิดของหมดระหว่างวัน |
| `app_setting` | ค่าคอนฟิกร้าน เก็บเป็น `jsonb` | เกณฑ์เรียกคิว/เตือนเวลา แก้ได้โดยไม่ต้องแก้โค้ด |
| `order_batch` | หนึ่งรอบที่กดสั่ง | `idempotency_key text not null unique` = กันกดซ้ำที่ระดับฐานข้อมูล · `staff_order_needs_actor` บังคับว่าออเดอร์ที่พนักงานสั่งแทนต้องรู้ว่าใครสั่ง |
| `order_item` | รายการอาหารในรอบนั้น | **ไม่มีราคา** เก็บแค่ `qty` + `status` · `cancel_needs_reason` บังคับเหตุผลตอนยกเลิก |
| `service_call` | คำเรียกพนักงาน | `unique index ... where type='TIME_WARNING'` = หนึ่ง Visit เตือนเวลาได้ครั้งเดียว |

### 7.5 กลุ่ม 5 — เงิน สมาชิก สต๊อก และการตรวจสอบ

| ตาราง | มีไว้ทำอะไร | จุดที่ต้องอธิบายได้ |
| --- | --- | --- |
| `bill` | ยอดที่ snapshot ตอนขอเช็กบิล | `visit_id ... unique` = หนึ่ง Visit หนึ่งบิล · แยกยอดเป็น 4 ก้อน (package / addon / overtime / discount) เพื่อให้ตรวจที่มาของตัวเลขได้ |
| `payment` | การรับเงิน **หลายแถวต่อหนึ่งบิล** | รองรับการหารบิล · `confirmed_by not null` เพราะไม่มี webhook ธนาคาร ต้องมีพนักงานรับผิดชอบทุกแถว · `idempotency_key unique` |
| `member` / `member_consent` / `point_transaction` | สมาชิกและแต้ม | consent แยกรายวัตถุประสงค์ (LOYALTY / MARKETING) ถอนเฉพาะการตลาดได้ตาม PDPA ม.19 |
| `inventory_item` / `stock_count` | นับสต๊อกรายวัน | ADR-09 ไม่ทำ BOM · `unique (inventory_item_id, count_date)` |
| `audit_log` | บันทึกทุกการเปลี่ยนแปลง (append-only) | `revoke update, delete on audit_log` · เก็บ `before`/`after` เป็น `jsonb` · `pin_hash` ถูก redact ตั้งแต่ตอนเขียน |
| `idempotency_record` | จำ "คำตอบ" ของคำขอที่สำเร็จแล้ว | เปิด RLS แต่ **ไม่มี policy ให้ใครเลย** เข้าถึงได้เฉพาะ service role |

### 7.6 View ทั้ง 7 ตัว (`0009_views.sql`, `0017`, `0018`)

| View | ใช้ที่หน้าไหน | ทำอะไร |
| --- | --- | --- |
| `v_visit_live` | Staff Dashboard, ผังโต๊ะ, หน้าโต๊ะ | นาฬิกา + ยอด + เลขโต๊ะ + จำนวนงานค้าง ในแถวเดียว |
| `v_queue_board` | จอคิว TV, หน้าดูคิวลูกค้า | คิววันนี้ที่ยัง WAITING/CALLED พร้อมเลขคิวจัดรูปแบบแล้ว |
| `v_bill_group_total` | รวมบิลข้ามโต๊ะ | ยอดรวม · ยอดจ่ายแล้ว · ยอดค้างของทั้งกลุ่ม |
| `v_daily_sales` | รายงานเจ้าของร้าน | ยอดขาย/วัน · จำนวนแขก · รอบโต๊ะเฉลี่ย (VOIDED ไม่ถูกนับ) |
| `v_menu_popularity` | รายงานเมนูยอดนิยม | นับ **จำนวนที่สั่ง** ไม่ใช่ยอดเงิน เพราะเมนูไม่มีราคา |
| `v_kitchen_queue` | หน้าครัว | รายการที่ยัง PENDING/PREPARING + เลขโต๊ะ |
| `v_staff_directory` | หน้าจัดการพนักงาน | ส่ง `has_pin` เป็น boolean ออกไป **ไม่ส่ง hash** |

**ทุก view ตั้ง `security_invoker = on`** — ถ้าไม่ตั้ง view จะรันด้วยสิทธิ์เจ้าของ
แล้วกลายเป็นช่องอ่านข้ามสาขาทันที (`0009_views.sql:5-6`)

### 7.7 ทำไมต้องมี Primary Key / Foreign Key / Index / Constraint (คำถามยอดฮิต)

| กลไก | ใช้ในโปรเจกต์นี้อย่างไร | ถ้าไม่มีจะเกิดอะไร |
| --- | --- | --- |
| **Primary Key** (`uuid default gen_random_uuid()`) | ทุกตาราง | อ้างถึงแถวไม่ได้ · UPDATE โดนหลายแถวพร้อมกัน · เลือก UUID แทน auto-increment เพราะ Edge Function และหลายสาขาสร้าง id พร้อมกันได้โดยไม่ชนกัน และ id ไม่บอกจำนวนลูกค้าของร้านให้คนนอกรู้ |
| **Foreign Key** | `visit.package_id → package`, `order_item.order_batch_id → order_batch` ฯลฯ | มีออเดอร์ที่ไม่มีมื้อ · มี payment ที่ไม่มีบิล · ข้อมูลกำพร้าที่ทำให้รายงานผิด |
| **Index** | `visit(branch_id, status) where deleted_at is null` · `order_item(status) where status in ('PENDING','PREPARING')` · `audit_log(created_at desc)` | หน้า Dashboard และหน้าครัวที่ poll ทุก 5 วินาทีจะกลายเป็น full table scan ทุกครั้ง |
| **Partial Index** (`where deleted_at is null`) | เกือบทุก index ในระบบ | index จะบวมด้วยแถวที่ลบไปแล้วซึ่งไม่มีใคร query |
| **Unique Constraint** | `qr_session.token`, `order_batch.idempotency_key`, `bill.visit_id` | token ชนกัน · กดซ้ำได้ออเดอร์สองรอบ · หนึ่ง Visit มีสองบิล |
| **Check Constraint** | `seat_capacity > 0`, `amount > 0`, `void_needs_reason`, `toddler_is_free` | ข้อมูลที่เป็นไปไม่ได้เข้ามาได้ เช่น จ่ายเงินติดลบ หรือยกเลิกโดยไม่บอกเหตุผล |
| **Partial Unique Index** | `visit_table_one_active_per_table`, `service_call_one_time_warning` | โต๊ะถูกจองซ้อน · เตือนเวลาซ้ำหลายรอบ |

### 7.8 "รวมตารางได้ไหม" — คำตอบที่ต้องเตรียม

| ถ้ารวม | จะเกิดอะไร |
| --- | --- |
| รวม `visit_pax` เข้า `visit` (เป็นคอลัมน์ adult/child/toddler) | เพิ่ม tier ใหม่ต้อง ALTER TABLE · เก็บ snapshot ราคาแยก tier ไม่ได้ · BR-03 (ห้ามลดจำนวน) ต้องเขียน trigger ที่ซับซ้อนกว่าเดิมมาก |
| รวม `order_batch` + `order_item` เป็นตารางเดียว | `idempotency_key` ต้องซ้ำทุกแถวของรอบเดียวกัน ทำให้ unique constraint ใช้ไม่ได้ · ADR-07 พัง |
| รวม `bill` เข้า `visit` | บิลถูกยกเลิกแล้วออกใหม่ได้ (`BILL_REQUESTED → DINING` แล้วกลับมา) ถ้าอยู่ใน `visit` จะต้องเคลียร์ค่าทับ ทำให้ไม่มีร่องรอย |
| รวม `payment` เข้า `bill` (คอลัมน์ `paid_amount`) | หารบิลไม่ได้ เพราะหารบิลคือ "หลาย payment ต่อหนึ่ง bill" ซึ่งเป็นความต้องการหลักของร้านหมูกระทะ |
| รวม `queue_call` เข้า `queue_ticket` (คอลัมน์ `call_count`) | ไม่รู้ว่าใครเรียก เรียกเมื่อไร · BR-09 ต้องเทียบเวลาครั้งล่าสุดซึ่งจะหายไป |

---

## 8 · ข้อมูลไหลจากหน้าเว็บ → API → Backend → Database อย่างไร

### 8.1 เส้นที่ 1 — ลูกค้าสั่งอาหาร (ผ่าน Edge Function)

ตามรอยจริงทีละบรรทัด:

```
1. [หน้าจอ]  MenuTab.tsx  ผู้ใช้กด "สั่ง"
             └→ api.placeOrder(token, items, newIdempotencyKey())

2. [lib/api.ts:51-84]  request()
             ├─ ใส่ header: apikey, Content-Type, Idempotency-Key (uuid)
             ├─ fetch(`/api/c/<token>/orders`)
             └─ อ่าน header `date` ของ response เก็บค่า clock skew ไว้ชดเชยนาฬิกาเครื่อง

3. [Vite proxy / production]  /api → https://<project>.supabase.co/functions/v1

4. [Edge Function: functions/c/index.ts:72]  router.post("/:qrToken/orders")
             ├─ requireVisitByToken(qrToken)        ← _shared/auth.ts:82
             │    • หา qr_session จาก token
             │    • revoked_at มีค่า → 410 "มื้อนี้จบแล้ว"
             │    • visit CLOSED/VOIDED → 410
             ├─ idempotent(req, "c/orders", work)    ← _shared/idempotency.ts:28
             │    • ไม่มี Idempotency-Key → 400
             │    • hash = sha256(endpoint + body)
             │    • เคยเห็นคีย์นี้ + hash ตรง → คืนคำตอบเดิม (Idempotent-Replay: true)
             │    • คีย์เดิมแต่ body ต่าง → 422 IDEMPOTENCY_MISMATCH
             ├─ ตรวจ input: items ไม่ว่าง · qty เป็นจำนวนเต็ม ≥ 1
             ├─ ตรวจ 86 list: เมนูที่ is_available = false → 422 "<ชื่อ> หมดแล้ว"
             ├─ INSERT order_batch (source=CUSTOMER, idempotency_key)
             └─ INSERT order_item หลายแถว

5. [PostgreSQL]  trigger ทำงานตามลำดับ
             ├─ t01_order_only_when_dining (BEFORE INSERT บน order_batch)
             │    • SELECT ... FOR UPDATE ล็อกแถว visit
             │    • ถ้า SEATED → เลื่อนเป็น DINING + ตั้ง first_order_at
             │    • ถ้าไม่ใช่ DINING → raise exception (BR-01)
             ├─ t01_order_item_only_when_dining (BEFORE INSERT บน order_item, เพิ่มที่ 0018)
             │    • กันการต่อรายการเข้า batch เก่าของ Visit ที่ freeze แล้ว
             └─ t99_audit (AFTER INSERT) → เขียน audit_log

6. [ขากลับ]  ถ้า trigger ปฏิเสธ → Postgres error code P0001
             └→ _shared/db.ts:unwrap() → errors.ts:fromPostgres()
                • 23505 → 409 DUPLICATE
                • 23514 / P0001 → 422 RULE_VIOLATION (ส่งข้อความภาษาไทยของ trigger กลับตรง ๆ)
                • 42501 → 403 FORBIDDEN
             └→ หน้าจอ: ApiError → แสดงข้อความให้ลูกค้าอ่าน

7. [รอบถัดไป]  usePolling ยิง GET /c/:qrToken ทุก 5 วินาที
             หน้าจอจึงเห็นสถานะอาหารอัปเดตเอง
```

### 8.2 เส้นที่ 2 — พนักงานเปิดโต๊ะ (ผ่าน PostgREST ตรง)

```
1. [หน้าจอ]  CheckInDialog.tsx:67 → openVisit({...})

2. [lib/staffQueries.ts:187]  supabase.rpc("fn_open_visit", {...})
             └─ supabase-js แนบ JWT ของผู้ใช้ที่ล็อกอินอัตโนมัติ

3. [PostgREST]  POST /rest/v1/rpc/fn_open_visit

4. [PostgreSQL: 0012_app_rpc_and_realtime.sql:52]  fn_open_visit()
             ├─ v_branch := fn_my_branch_id()   ← อ่านจาก auth.uid()
             ├─ v_staff  := fn_my_staff_id()
             ├─ ถ้าไม่ใช่ STAFF → insufficient_privilege
             ├─ ตรวจจำนวนคน · ต้องเลือกโต๊ะอย่างน้อย 1 โต๊ะ
             ├─ SELECT ... FOR UPDATE บนโต๊ะที่สถานะ AVAILABLE (กันสองคนเปิดโต๊ะเดียวกันพร้อมกัน)
             ├─ INSERT visit (SEATED, duration snapshot จาก package)
             ├─ INSERT visit_table ทุกโต๊ะ + UPDATE dining_table → OCCUPIED
             ├─ INSERT visit_pax แยก tier พร้อม snapshot ราคาจาก fn_price_for()
             ├─ INSERT visit_addon (ถ้ามี)
             ├─ INSERT qr_session → ได้ token
             └─ UPDATE queue_ticket → SEATED
             ทั้งหมดอยู่ในฟังก์ชันเดียว = ทรานแซกชันเดียว ล้มก็ rollback ทั้งชุด

5. [ขากลับ]  { visit_id, qr_token } → QrDialog แสดง QR ให้ลูกค้าสแกน
```

**ข้อควรรู้ที่ต้องพูดได้:** `fn_open_visit` **เรียกด้วย service role ไม่ได้**
เพราะอ่านสาขาและรหัสพนักงานจาก `auth.uid()` ซึ่งจะเป็น `null`
(`supabase/README.md:52-55`) — นี่คือเหตุผลที่หน้าพนักงานยิง PostgREST ตรงแทนที่จะผ่าน Edge Function

---

## 9 · Function / Logic สำคัญ ทำงานอย่างไร

### 9.1 `fn_calc_bill` — เครื่องคิดเงิน (หัวใจของระบบ)

ไฟล์: `0007_functions.sql:61-104`

```sql
v_elapsed     = ceil((coalesce(bill_requested_at, now()) - seated_at) นาที)
v_round_total = Σ (visit_pax.qty × visit_pax.unit_price)     -- หนึ่งรอบ
v_addon       = Σ (visit_addon.qty × visit_addon.unit_price) -- คิดครั้งเดียว
v_extra       = greatest(0, ceil((v_elapsed - v_duration) / v_duration))
net_total     = v_round_total × (1 + v_extra) + v_addon
```

**จุดที่ต้องอธิบายได้:**

1. ใช้ `coalesce(bill_requested_at, now())` — พอขอเช็กบิลแล้ว **เวลาหยุดเดิน**
   ยอดจึงไม่เพิ่มขึ้นระหว่างที่พนักงานเดินมาเก็บเงิน
2. `TODDLER_FREE` มี `unit_price = 0` จึงไม่ต้องเขียนเงื่อนไขพิเศษในสูตร — ตัวเลขศูนย์จัดการให้เอง
3. ค่าเกินเวลาคูณจาก `round_total` ทั้งก้อน แปลว่า **เด็กเล็กฟรีก็ยังฟรีตอนต่อรอบ**
4. add-on ไม่ถูกคูณด้วยจำนวนรอบ = "คิดครั้งเดียวต่อ Visit" ตามที่สเปคระบุ

**ตัวอย่างที่ทดสอบแล้วตรง** (`supabase/README.md:61-67`):

| สถานการณ์ | คำนวณ | ได้จริง |
| --- | --- | --- |
| ผู้ใหญ่ 4 + รีฟิล 2 · 100 นาที | (4×289)×1 + (2×39) | 1,234.00 |
| ผู้ใหญ่ 2 + เด็ก 1 + เด็กเล็กฟรี 1 + รีฟิล 3 · 118 นาที | (578+189+0) + 117 | 884.00 |
| ผู้ใหญ่ 3 · 135 นาที | 867 × (1 + ceil(15/120)) = 867×2 | 1,734.00 |

### 9.2 `fn_issue_bill` — ออกบิล (`0012:173-222`)

```
1. fn_guard_visit_access()  → ถ้าล็อกอินอยู่แต่ Visit ไม่ใช่สาขาตัวเอง → ปฏิเสธ
2. นับ order_item ที่ status = 'PENDING' → ถ้ามี → ปฏิเสธ "มีรายการค้างยืนยัน N รายการ"
3. UPDATE visit → BILL_REQUESTED + ตั้ง bill_requested_at (นาฬิกาหยุด)
4. เรียก fn_calc_bill() → snapshot ลงตาราง bill
5. INSERT ... ON CONFLICT (visit_id) DO UPDATE  → ออกบิลซ้ำได้โดยไม่สร้างบิลใหม่
```

ข้อ 5 สำคัญ: `bill.visit_id` เป็น `unique` ถ้าไม่มี `ON CONFLICT` การกดออกบิลซ้ำจะ error

### 9.3 State Machine ของ Visit (`0008:11-58`)

```
QUEUED ──► SEATED ──► DINING ──► BILL_REQUESTED ──► PAID ──► CLOSED
              │          ▲             │
              └──────────┴─────────────┘  (ถอยกลับไปสั่งต่อได้ ถ้ายังไม่มี payment)
   ทุกสถานะ ──► VOIDED  (ต้องมีเหตุผล ≥ 10 ตัวอักษร + ต้องเป็น SUPERVISOR)
```

- ตารางการเปลี่ยนสถานะเขียนเป็นฟังก์ชัน `fn_visit_transition_allowed` แบบ `immutable`
- `trg_visit_transition_guard` เป็น trigger `BEFORE UPDATE OF status` ที่ปฏิเสธทุกเส้นทางที่ไม่อยู่ในตาราง
- การถอย `BILL_REQUESTED → DINING` ทำได้เฉพาะเมื่อ **ยังไม่มี payment แถวใดเลย**
  และเมื่อถอย ระบบจะ soft delete บิลเดิมทิ้ง (`0008:38-51`)

### 9.4 `trg_close_requires_full_payment` — BR-06 (`0008:62-114`)

trigger ตัวเดียวทำสามอย่างตอนปิดโต๊ะ:

1. เทียบ `SUM(payment.amount)` กับ `bill.net_total` — ไม่เท่ากัน → `raise exception 'ยอดค้าง X บาท'`
2. ตั้ง `closed_at` แล้ว **เพิกถอน `qr_session` ทันที** (BR-02) → ลูกค้าโต๊ะถัดไปที่ถ่ายรูป QR เก่าไว้จะเห็น "มื้อนี้จบแล้ว"
3. เปลี่ยนโต๊ะเป็น `CLEANING` และปล่อย `visit_table`

**ทำไมสำคัญ:** ถ้าทำทั้งสามอย่างนี้ในโค้ดฝั่งแอป คนที่ยิง API ตรงจะปิดโต๊ะโดยไม่จ่ายเงินได้

### 9.5 `trg_pax_no_decrease` + `trg_addon_no_decrease` — BR-03

- `visit_pax`: ลดจำนวนคนไม่ได้เลย ต้องให้หัวหน้ากะยกเลิกทั้ง Visit (`0008:140-152`)
- `visit_addon`: ลดไม่ได้เช่นกัน **ยกเว้นหัวหน้ากะ** (`0018:53-76`)

**ช่องโหว่ที่ปิดไปแล้ว:** เดิมคุมแค่ `visit_pax` ลูกค้าจึงสั่งน้ำรีฟิล 4 ที่ ดื่มจนหมด
แล้วยิง `POST {qty: 0}` ทับก่อนเช็กบิลได้ เพราะ `fn_calc_bill` อ่านค่า **ล่าสุด** ตอนออกบิล
→ จ่ายศูนย์ ปิดที่ `0018_close_leaks.sql` ส่วน A (**เรื่องนี้เล่าได้ดีมากตอนสอบ**)

### 9.6 `trg_write_audit` — BR-10 (`0018:153-188`)

- trigger เดียวใช้กับ 22 ตาราง โดยรับชื่อคอลัมน์ PK ผ่าน `tg_argv[0]`
- แยก action ได้ 4 แบบจากการเปรียบเทียบ `deleted_at` ก่อน/หลัง:
  `INSERT` / `UPDATE` / `SOFT_DELETE` / `RESTORE`
- **redact `pin_hash` ตั้งแต่ตอนเขียน** ไม่ใช่ตอนอ่าน (`0018:181-182`)

### 9.7 `fn_verify_pin` — ตรวจ PIN โดยไม่ส่ง hash ออก (`0017:123-133`)

```sql
select pin_hash into v_hash from staff where auth_user_id = auth.uid() ...;
return v_hash = extensions.crypt(p_pin, v_hash);   -- bcrypt
```

คืนแค่ `true/false` · ตรวจของตัวเองได้คนเดียว · hash ไม่เคยออกจากเซิร์ฟเวอร์

### 9.8 `fn_estimated_wait_minutes` — Query ที่เขียนใหม่ 2 รอบ (สอบถามบ่อย)

เวอร์ชันแรก (`0007:180-208`) ผิด 3 ทาง เวอร์ชันแก้อยู่ที่ `0019:19-68`

| ปัญหาเดิม | แก้อย่างไร |
| --- | --- |
| นับคิวที่รอทั้งช่อง **รวมใบของคนที่ถามเอง** คนแรกจึงไม่เคยเห็น 0 | เพิ่มพารามิเตอร์ `p_before_seq` แล้วกรอง `seq_no < p_before_seq` |
| ไม่หารด้วยจำนวนโต๊ะ — ร้าน 20 โต๊ะคิดเหมือนร้านโต๊ะเดียว | CTE `lane_tables` นับโต๊ะที่รับกลุ่มขนาดนั้นได้ แล้วหาร (`greatest(count,1)` กันหารศูนย์) |
| ค่าเฉลี่ยดิบ — visit หนึ่งแถวที่ปิดข้ามวันลากค่าเฉลี่ยขึ้นเป็นหลักสิบชั่วโมง | ตัดแถวที่นานเกิน 3 ชั่วโมงทิ้งก่อน แล้วใส่เพดาน 180 / พื้น 20 นาที ด้วย `least(greatest(...))` |

**ตอนสอบเล่าแบบนี้:** "เราเจอว่าหน้าจอบอกคิวก่อนหน้า 0 คน แต่ให้รอ 11 ชั่วโมง
พอไล่ query กลับพบว่าเป็นปัญหาของข้อมูลเสียหนึ่งแถวบวกกับการนับที่ผิด
จึงแก้ทั้งการนับ การหารด้วยจำนวนโต๊ะ และใส่เพดานกันค่าผิดปกติ"

### 9.9 Idempotency — ป้องกันการกดซ้ำ 2 ชั้น (ADR-07)

| ชั้น | อยู่ที่ไหน | กันอะไร |
| --- | --- | --- |
| ชั้นฐานข้อมูล | `order_batch.idempotency_key unique`, `payment.idempotency_key unique` | สร้างข้อมูลซ้ำ — เป็นด่านสุดท้ายที่เลี่ยงไม่ได้ |
| ชั้น Edge Function | ตาราง `idempotency_record` (`0016:297-307`) | **จำคำตอบ** ของคำขอที่สำเร็จแล้ว การกดซ้ำจึงได้คำตอบเดิมกลับไป แทนที่จะได้ error ว่าคีย์ซ้ำ · ครอบคลุม endpoint ที่ไม่มีตารางปลายทาง เช่น รับคิวและเรียกพนักงาน |

`fn_sweep_idempotency()` ลบบันทึกที่เกิน 24 ชั่วโมงทิ้ง

---

## 10 · Query สำคัญ และ Performance

### 10.1 Query ที่ระบบเรียกบ่อยที่สุด

| Query | เรียกจากไหน | ถี่แค่ไหน | index ที่รองรับ |
| --- | --- | --- | --- |
| `v_visit_live` | Staff Dashboard, ผังโต๊ะ | ทุก 5-10 วินาที ต่อเครื่องพนักงาน | `visit(branch_id, status) where deleted_at is null` |
| `v_kitchen_queue` | หน้าครัว | ทุก 5 วินาที | `order_item(status) where status in ('PENDING','PREPARING')` |
| `v_queue_board` | จอ TV + หน้าคิวลูกค้า | ทุก 5 วินาที ต่อลูกค้าที่เปิดหน้า | `queue_ticket(branch_id, service_date, status)` |
| `GET /c/:qrToken` | หน้าโต๊ะลูกค้าทุกโต๊ะ | ทุก 5 วินาที ต่อโต๊ะ | `order_batch(visit_id)`, `qr_session(visit_id)` |

### 10.2 จุดที่จะช้าก่อนเพื่อน (ตอบตรง ๆ ได้เลยว่ารู้ตัว)

**(ก) `v_visit_live` เรียกฟังก์ชันต่อแถว**

```sql
fn_elapsed_minutes(v.visit_id)   -- ถูกเรียก 4 ครั้งต่อแถว
fn_paying_pax(v.visit_id)        -- อีก 1 ครั้ง + subquery อีก 3 ตัว
```

แต่ละฟังก์ชันคือ query แยก → **N+1 ในระดับ SQL**
- 20 โต๊ะ: ไม่รู้สึกอะไร (โต๊ะที่เปิดอยู่จริงมีจำกัดตามจำนวนโต๊ะในร้าน)
- ข้อดีที่ช่วยไว้: `WHERE status IN ('SEATED','DINING',...)` ทำให้จำนวนแถวถูกจำกัดที่ **จำนวนโต๊ะในร้าน** ไม่ใช่จำนวน visit ทั้งหมดในประวัติ
- วิธีแก้ถ้าต้องการ: เปลี่ยน `fn_elapsed_minutes` เป็นนิพจน์ inline ใน view หรือทำ materialized view

**(ข) `v_daily_sales` และ `v_menu_popularity` ไม่มี index รองรับการ group by วันที่**

```sql
group by v.branch_id, date(v.closed_at)
```
`date(closed_at)` เป็น expression → index บน `closed_at` ธรรมดาช่วยไม่ได้เต็มที่
- 1,000 visit: เร็ว
- 100,000 visit (ประมาณ 1 ปีของร้านที่ขายวันละ 300 โต๊ะ): เริ่มช้าเมื่อเปิดหน้ารายงาน
- 1,000,000 visit: ต้องแก้แน่นอน

**วิธีแก้ที่ควรพูด:** (1) เพิ่ม index แบบ expression `create index on visit (branch_id, date(closed_at))`
(2) ทำ materialized view สรุปยอดรายวัน refresh ตอนปิดร้าน
(3) แยกตาราง `daily_sales_summary` ที่ trigger เขียนตอนปิดโต๊ะ

**(ค) `audit_log` โตเร็วที่สุดในระบบ**

`0018` ผูก `t99_audit` เพิ่มจาก 6 ตารางเป็น 22 ตาราง ทุก INSERT/UPDATE เขียน `jsonb`
ของทั้งแถวลงไป → หนึ่งมื้อของลูกค้าหนึ่งกลุ่มสร้าง audit หลายสิบแถว
- มี index `(table_name, record_id)` และ `(created_at desc)` รองรับการอ่านแล้ว
- แต่ **ไม่มีนโยบายลบหรือ archive** → ตารางนี้จะใหญ่ที่สุดในฐานข้อมูลภายในปีแรก
- วิธีแก้: partition ตามเดือน หรือย้ายของเก่ากว่า 1 ปีไป cold storage

**(ง) Polling แทน Realtime**

ลูกค้า 20 โต๊ะ + พนักงาน 3 เครื่อง + จอ TV = ~24 client
ยิงทุก 5 วินาที ≈ **288 request/นาที** ที่ Edge Function และ PostgREST
- ระดับนี้ยังไม่มีปัญหา
- 5 สาขา สาขาละ 40 โต๊ะ = ~2,400 request/นาที เริ่มต้องคิดเรื่อง connection pool
- วิธีแก้ที่เตรียมไว้แล้ว: Realtime เปิดไว้ที่ฐานข้อมูลแล้ว 6 ตาราง (`0012:224-238`)
  แต่ฝั่งลูกค้าใช้ไม่ได้เพราะ Realtime เคารพ RLS และลูกค้าไม่มีตัวตน (`usePolling.ts:4-8`)
  → ฝั่ง **พนักงาน** ย้ายไป Realtime ได้ทันทีเพราะมี JWT แล้ว

### 10.3 คำถาม "ถ้าข้อมูล 1,000 / 100,000 / 1,000,000 รายการ"

| จำนวน `visit` | เกิดอะไร | ต้องทำอะไร |
| --- | --- | --- |
| 1,000 (ประมาณ 3-4 วัน) | ทุกอย่างเร็ว index ที่มีพอหมด | ไม่ต้องทำอะไร |
| 100,000 (ประมาณ 1 ปี) | หน้าปฏิบัติการยังเร็ว เพราะกรอง `status` + `deleted_at is null` อยู่แล้ว · **หน้ารายงานเริ่มช้า** เพราะ group by `date(closed_at)` | เพิ่ม expression index + พิจารณา materialized view |
| 1,000,000 (ประมาณ 10 ปี หรือ 10 สาขา) | `audit_log` จะอยู่ระดับ 10-50 ล้านแถว · รายงานย้อนหลังช้าชัดเจน · backup/restore ใช้เวลานาน | partition `visit` และ `audit_log` ตามเดือน · ตารางสรุปรายวัน · archive ข้อมูลเก่า |

**ประโยคที่ควรพูด:** "โครงสร้างที่เลือกไว้รองรับการเติบโตได้ถึงระดับแสนโดยไม่ต้องแก้ schema
เพราะ query ฝั่งปฏิบัติการทั้งหมดถูกจำกัดด้วยสถานะและวันที่อยู่แล้ว
สิ่งที่จะต้องแก้ก่อนเพื่อนคือหน้ารายงานกับ `audit_log` ซึ่งแก้ด้วยการเพิ่ม index
และตารางสรุป ไม่ต้องรื้อโครงสร้างเดิม"

---

## 11 · Security (ความปลอดภัย) — 5 ชั้นที่มีจริงในโปรเจกต์

### ชั้นที่ 1 · Authentication — พิสูจน์ว่า "คุณเป็นใคร"

| กลุ่มผู้ใช้ | วิธี | ไฟล์อ้างอิง |
| --- | --- | --- |
| พนักงาน / หลังร้าน | Supabase Auth (email+password → JWT) | `lib/auth.tsx:90-100` |
| ลูกค้า | `qr_token` 64 ตัวอักษรในลิงก์ (ไม่มีบัญชี) | `_shared/auth.ts:82-106` |
| ลูกค้าดูคิว | `public_token` 32 ตัวอักษร | `0002:70` |
| ลูกค้าจัดการการจอง | รหัสอ้างอิง 8 ตัว **คู่กับเบอร์โทร** | `0019:84-94` |

**ทำไมการจองต้องใช้ 2 อย่างคู่กัน:** รหัส 8 ตัวฐานสิบหกเดาได้ (16^8)
เบอร์โทรจึงทำหน้าที่เป็น "ความลับ" ไม่ใช่ตัวระบุ — ค้นด้วยเบอร์อย่างเดียวไม่ได้ (`0019:80-82`)

**ทางเลือกอื่นที่ไม่เลือก:**
- OTP ทาง SMS → ต้องมีค่าส่งจริง และเวอร์ชันนี้ SMS เป็น mock
- ให้ลูกค้าสมัครสมาชิก → เพิ่มแรงเสียดทานมหาศาลกับคนที่แค่มากินข้าว
- Session cookie → ลูกค้าเปลี่ยนเครื่อง/แชร์ลิงก์ในกลุ่มไม่ได้ ซึ่งเป็นพฤติกรรมจริงของโต๊ะหมูกระทะ

### ชั้นที่ 2 · Authorization — "คุณทำอะไรได้บ้าง"

- **RLS เปิดครบทั้ง 30 ตาราง** (`0010:11-41`)
- บทบาท 3 ระดับเทียบด้วย `fn_role_rank()` แทนการไล่ลิสต์ทุกที่: `STAFF(1) < SUPERVISOR(2) < OWNER(3)`
- ทุก policy ผูกกับ `fn_my_branch_id()` → **พนักงานสาขา A อ่านข้อมูลสาขา B ไม่ได้**
- ตารางลูกใช้ `fn_visit_in_my_branch(visit_id)` เช็กผ่านแม่

ตัวอย่างการแบ่งสิทธิ์จริง:

| งาน | ระดับที่ต้องมี | หลักฐาน |
| --- | --- | --- |
| อ่านเมนู/โต๊ะ/คิว | STAFF | `0010:55-128` |
| แก้ราคา (`package_price`) | **OWNER เท่านั้น** | `0010:88-90` |
| แก้ยอด payment ที่บันทึกแล้ว | SUPERVISOR | `0010:202-203` |
| รวมบิลข้ามโต๊ะ | SUPERVISOR | `0010:187-189` + `0018:245` |
| ยกเลิก Visit | SUPERVISOR | `0018:206` |
| กู้คืนข้อมูลที่ลบ | SUPERVISOR | `0018:294` |
| อ่าน `audit_log` | OWNER | `0010:231` |

### ชั้นที่ 3 · Validation — ตรวจข้อมูลก่อนเข้า

ตรวจ **3 จุดซ้อนกัน** โดยตั้งใจ:

1. **หน้าจอ** — เพื่อ UX (`Stepper max={adult+child}` ใน `CheckInDialog.tsx:204`)
2. **Edge Function** — เพื่อตอบ error ที่อ่านรู้เรื่อง (`c/index.ts:78-96`)
3. **ฐานข้อมูล** — เป็นด่านสุดท้ายที่เลี่ยงไม่ได้ (constraint + trigger)

**ถ้าไม่ทำชั้นที่ 3 จะเกิดอะไร (คำตอบที่ต้องเตรียม):**
> คนที่เปิด DevTools แล้วยิง `fetch` ตรง หรือใช้ Postman จะข้ามชั้น 1 และ 2 ได้หมด
> ตัวอย่างจริงที่เราเจอเองคือช่อง `visit_addon` — หน้าจอซ่อนปุ่มลดจำนวนไว้แล้ว
> แต่ยิง `POST {qty: 0}` ตรงยังผ่าน จนกระทั่งใส่ trigger ที่ `0018`

### ชั้นที่ 4 · การป้องกันข้อมูลลับรั่ว

| สิ่งที่ป้องกัน | ทำอย่างไร |
| --- | --- |
| `pin_hash` หลุดถึงเบราว์เซอร์ | `revoke select on staff` ทั้งตาราง แล้ว `grant select (คอลัมน์ที่ปลอดภัย)` กลับรายคอลัมน์ (`0018:111-114`) |
| `pin_hash` ติดไปกับ `audit_log` | redact เป็น `[redacted]` ตั้งแต่ตอนเขียน (`0018:181-182`) |
| `anon key` ถูกเอาไปอ่านตารางตรง | `revoke all ... from anon` ทั้ง schema (`0010:257-261`) + `revoke execute` ทุกฟังก์ชัน (`0013`) |
| SQL Injection ใน `fn_restore_record` | ชื่อตารางถูกเทียบกับ whitelist 19 ชื่อก่อน แล้วใช้ `format(%I)` (`0018:284-298`) |
| `search_path` hijacking | ทุกฟังก์ชัน `security definer` ตั้ง `set search_path = public` ตายตัว (`0007:5-6`) |
| เบอร์โทรลูกค้าค้างในระบบ | `fn_sweep_expired_phone()` ลบหลังปิดโต๊ะ 24 ชม. (PDPA) |
| stack trace หลุดถึง client | `serveRouter` จับ error ทั้งหมดแล้วตอบ `{error, message}` รูปแบบเดียว (`_shared/http.ts:82-94`) |

### ชั้นที่ 5 · ความถูกต้องของเงิน

- `payment.confirmed_by not null` — ทุกการรับเงินมีพนักงานรับผิดชอบ
- `trg_payment_not_exceed_total` ใช้ `SELECT ... FOR UPDATE` ล็อกแถวบิลก่อนเทียบยอด
  → กันสองเครื่องบันทึกเงินพร้อมกันแล้วยอดรวมเกิน (race condition)
- `REVOKE DELETE` ทั้งระบบ — ลบจริงไม่ได้เลย แม้แต่ SQL ที่ยิงผ่าน PostgREST

### 11.1 ช่องที่ยัง "รู้อยู่แต่ยังไม่ปิด" — ต้องพูดเองก่อนอาจารย์ถาม

| ช่อง | สถานะจริง | หลักฐาน |
| --- | --- | --- |
| **PIN ไม่ได้ถูกบังคับใช้จริง** | `fn_verify_pin` มีอยู่และใช้งานได้ แต่ **ไม่พบการเรียกจากหน้าเว็บเลยสักที่** (grep ทั้ง `frontend/src` เจอแค่ `fn_set_pin` / `fn_clear_pin`) สเปค §09 ระบุว่ารายการเงิน "STAFF + PIN" แต่บนเส้นทางที่ใช้งานจริงตอนนี้ยังไม่มีอะไรบังคับ | `supabase/README.md:113-117` ยอมรับไว้บางส่วน · ตรวจซ้ำด้วยการค้นทั้งโฟลเดอร์ |
| Rate limit ของ `/queue/tickets` | สเปคเขียนว่า "public (rate-limited)" แต่ในโค้ดมีแค่ Idempotency-Key ไม่พบการจำกัดอัตรา | `Read/System Design.md:1212` เทียบกับ `functions/queue/index.ts:25-64` |
| งานกวาดอัตโนมัติยังไม่ตั้ง `pg_cron` | `fn_sweep_no_show`, `fn_sweep_time_warning`, `fn_sweep_expired_phone`, `fn_sweep_expired_holds` ต้องเรียกมือ | `supabase/README.md:111-112` |

**วิธีพูดเรื่องนี้ให้ได้คะแนน:** อย่าปกปิด ให้พูดว่า
"กลไกตรวจ PIN เราเขียนเสร็จและทดสอบแล้วที่ฐานข้อมูล แต่ยังไม่ได้ผูกเข้ากับปุ่มบนหน้าจอ
เพราะชุด Edge Function ที่ออกแบบให้บังคับ PIN ยังไม่ได้ deploy
ถ้าจะทำให้ครบต้องเพิ่มกล่องกรอก PIN ก่อนปุ่มรับเงิน/ปิดโต๊ะ/ยกเลิก แล้วเรียก `fn_verify_pin` ก่อน
และวิธีที่แข็งแรงกว่าคือย้ายการตรวจเข้าไปในฟังก์ชัน SQL เอง เพื่อให้เลี่ยงไม่ได้"

---

## 12 · วิธีใช้งานและแผนสาธิต (Demo)

### 12.1 รันระบบ

```bash
cd frontend
npm install
npm run dev        # → http://localhost:5173
```

`npm run dev` ยิง `/api` ผ่าน proxy ไปที่ Edge Function ที่ deploy อยู่แล้ว
**จึงใช้งานได้ทันทีโดยไม่ต้องรัน Supabase ในเครื่อง** (`README.md:79-80`)

ค่าที่ต้องมีใน `frontend/.env` (ดูแม่แบบที่ `.env.example`):

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxx
VITE_API_BASE_URL=/api
VITE_PROXY_TARGET=https://<project-ref>.supabase.co/functions/v1
```

ฝั่งฐานข้อมูล:
```bash
supabase link --project-ref <project-ref>
supabase db push
```
⚠️ ปลายทางต้องเป็น schema `public` ที่ **ว่าง** เพราะชื่อ ENUM หลายตัวชนกับสคีมาเดิมแต่ค่าไม่เหมือนกัน

คำสั่งอื่น: `npm run build` (tsc + vite build) · `npm run typecheck` · `npm run lint`

### 12.2 แผนสาธิต 8 นาที (ลำดับที่เล่าเป็นเรื่องได้)

เปิด `/pages` ไว้เป็นสารบัญ แล้วเดินตามนี้:

| นาที | หน้า | ทำอะไร | ชี้ให้เห็นอะไร |
| --- | --- | --- | --- |
| 0:00 | `/` | รับคิว 2 คน | ระบบเลือกช่อง A ให้เอง ไม่ให้ลูกค้าเลือก |
| 0:45 | `/q/<token>` | ดูคิวตัวเอง | คิวก่อนหน้า · เวลารอ · เลขที่กำลังเรียก |
| 1:15 | `/display` | จอ TV | ตัวเลขใหญ่ · ไม่มีข้อมูลส่วนบุคคล (PDPA) |
| 1:45 | `/staff/queue` | เรียกคิว 2 ครั้งติดกัน | **ครั้งที่ 2 จะโดนปฏิเสธ "ต้องเว้นอย่างน้อย 2 นาที"** — กฎมาจากฐานข้อมูล |
| 2:30 | เช็คอิน | เลือกโต๊ะ · ผู้ใหญ่ 2 · น้ำรีฟิล 2 | ทรานแซกชันเดียวได้ visit + โต๊ะ + pax + QR |
| 3:15 | `/t/<qr>` | สั่งอาหาร | ออเดอร์แรกเลื่อนสถานะ SEATED → DINING เอง |
| 4:00 | `/staff/kitchen` | กด PREPARING → SERVED | ลองข้ามขั้นแล้วโดนปฏิเสธ |
| 4:45 | `/t/<qr>/split` | หารบิล 2 คน | อธิบายว่าเศษบาทตกที่คนแรก |
| 5:30 | `/staff/visit/<id>` | ออกบิล → รับเงิน **ไม่ครบ** → กดปิดโต๊ะ | **โดนปฏิเสธ "ยอดค้าง X บาท"** (BR-06) |
| 6:15 | | รับเงินส่วนที่เหลือ → ปิดโต๊ะ | โต๊ะไป CLEANING อัตโนมัติ |
| 6:45 | `/t/<qr>` (อันเดิม) | รีเฟรช | **"มื้อนี้จบแล้ว"** — QR ถูกเพิกถอนทันที (BR-02) |
| 7:15 | `/admin` | รายงานรายวัน + หน้ากู้คืน | ยอดขาย · เมนูยอดนิยม · soft delete กู้คืนได้ |

**ไฮไลต์ที่ต้องชี้ให้ชัด 3 จุด:** เรียกคิวถี่เกินโดนปฏิเสธ · ปิดโต๊ะทั้งที่จ่ายไม่ครบโดนปฏิเสธ ·
QR เก่าใช้ไม่ได้ทันทีหลังปิดโต๊ะ — ทั้งสามอย่างนี้ถูกปฏิเสธ **จากฐานข้อมูล ไม่ใช่จากหน้าจอ**
ซึ่งเป็นข้อความหลักของโปรเจกต์

ภาพหน้าจอที่มีอยู่แล้วในโปรเจกต์: `c1-landing.png` (หน้าแรก) · `c2-reserve.png` /
`c3-reserve-result.png` (จองโต๊ะ) · `c4-queue.png` (ดูคิว) · `c5-display.png` (จอ TV) ·
`c6-badtoken.png` (token ผิด) — ใช้เป็นภาพสำรองได้ถ้าอินเทอร์เน็ตมีปัญหาตอนสอบ

---

## 13 · ปัญหาที่พบและวิธีแก้

### 13.1 ปัญหาที่แก้ไปแล้ว — ชุด `0018_close_leaks.sql` (6 ช่อง)

ทั้งหกข้อเป็นช่องที่ "ยิง API ตรงแล้วข้ามกฎได้" ซึ่งพบจากการไล่โค้ดที่ deploy อยู่จริง

| # | ปัญหา | วิธีแก้ |
| --- | --- | --- |
| A | BR-03 ไม่คุม `visit_addon` — สั่งน้ำรีฟิล ดื่มหมด แล้ว `POST {qty:0}` ทับก่อนเช็กบิล → จ่ายศูนย์ | เพิ่ม `trg_addon_no_decrease` + `trg_addon_no_delete` ให้ใช้กฎเดียวกับ `visit_pax` |
| B | `pin_hash` หลุดถึงเบราว์เซอร์ทาง PostgREST · `revoke select (pin_hash)` ที่ `0017` **ไม่มีผล** | ถอน `select` ระดับตารางก่อน แล้ว `grant` กลับรายคอลัมน์ · ย้ายการคำนวณ `has_pin` เข้าฟังก์ชัน `security definer` |
| C | ฟังก์ชัน `security definer` ใน `0016` ไม่เช็คบทบาทเลย → STAFF คนไหนก็ยกเลิก Visit สาขาไหนก็ได้ | เพิ่ม `fn_require_role()` / `fn_require_branch()` ใน `fn_void_visit`, `fn_merge_bills`, `fn_restore_record`, `fn_daily_report`, `fn_call_queue_ticket` |
| D | `staff_update_visit` ไม่กัน `deleted_at` → พนักงานกู้คืน Visit เองได้ | ใส่ `deleted_at is null` ใน `USING` และเพิ่ม policy แยกสำหรับ SUPERVISOR |
| E | BR-01 คุมแค่ `order_batch` → ต่อรายการเข้า Visit ที่ขอบิลไปแล้วได้ | เพิ่ม trigger บน `order_item` + ผูก policy กับสาขาผ่าน `fn_batch_in_my_branch()` + ห้ามย้าย batch ข้าม Visit |
| F | `t99_audit` ผูกแค่ 6 ตาราง แต่หน้ากู้คืนแตะได้ 19 ตาราง | ผูก trigger เพิ่มเป็น 22 ตาราง |

**บทเรียนที่ควรพูด:** "เราค้นพบว่าการเขียนกฎไว้ในเอกสารกับการที่กฎทำงานจริงเป็นคนละเรื่อง
จึงไล่ตรวจทุกกฎว่ามี trigger หรือ constraint รองรับจริงไหม แล้วพบช่อง 6 จุด"

### 13.2 ปัญหา UX ฝั่งลูกค้า — ชุด `0019_customer_ux_fixes.sql` (3 ข้อ)

พบจากการทดสอบในมุม "ลูกค้าที่ไม่ใช่นักพัฒนา"

1. **เวลารอให้ค่าที่เป็นไปไม่ได้** — คิวก่อนหน้า 0 แต่บอกรอ 11 ชั่วโมง → แก้ `fn_estimated_wait_minutes` (ดูข้อ 9.8)
2. **ร้านไม่มีเบอร์โทรให้ลูกค้าโทรถาม** ทั้งที่ทุกทางตันจบลงที่ "โทรถามร้าน" → เพิ่มคอลัมน์ `branch.phone` + `lib/shop.ts`
3. **จองแล้วยกเลิกเองไม่ได้ และกลับมาดูการจองไม่ได้** → เพิ่ม `fn_find_reservation` / `fn_cancel_reservation` + จำการจองล่าสุดไว้ใน `localStorage` (`lib/mystuff.ts`)

### 13.3 ปัญหาเชิงเทคนิคที่เจอระหว่างทาง และวิธีแก้

| ปัญหา | สาเหตุ | วิธีแก้ที่ใช้จริง |
| --- | --- | --- |
| `gen_random_bytes()` เรียกไม่เจอ | `pgcrypto` บน Supabase อยู่ใน schema `extensions` ไม่ใช่ `public` | ใช้ `gen_random_uuid()` แทน ซึ่งสุ่มด้วย CSPRNG อยู่แล้ว |
| `hold_until` ใช้ generated column ไม่ได้ | `timestamptz + interval` เป็น `stable` ไม่ใช่ `immutable` | ใช้ trigger `t01_reservation_hold_until` แทน |
| PIN ใช้ hash คนละมาตรฐาน | Edge Function เคยเขียนเป็น PBKDF2 แต่ `fn_set_pin` ใช้ bcrypt → เทียบกันไม่ได้ | commit `5bd7684` ลบโค้ด hash ใน Edge Function ทิ้ง แล้วให้เรียก `fn_verify_pin` ที่ DB ตัวเดียว |
| นาฬิกาเครื่องลูกค้าเพี้ยน → เวลาบนจอไม่ตรงกับที่เซิร์ฟเวอร์คิดบิล | เครื่องมือถือตั้งเวลาเองได้ | จับส่วนต่างจาก header `Date` ของทุก response แล้วให้ `useNow()` บวกชดเชย (`lib/api.ts:36-42`) |
| สเปคขัดกันเอง: §05 บอกปิดโต๊ะแล้วโต๊ะ `AVAILABLE` แต่ §08 บอก `CLEANING` | เอกสารสองส่วนเขียนคนละเวลา | เลือกตาม §08 เพราะสะท้อนงานจริงที่ต้องเก็บโต๊ะก่อน แล้วบันทึกเหตุผลไว้ใน `supabase/README.md:91-93` |
| เลข migration ข้าม 0014, 0015 | สองไฟล์นั้นเป็นข้อมูลสาธิตที่ลงฐานข้อมูลจริงแล้วแต่ยังไม่ได้ดึงกลับเข้า repo | บันทึกไว้ชัดเจนใน `supabase/README.md:31-38` ว่าไม่ใช่ช่องว่างที่ลืมเติม |

### 13.4 ⚠️ สิ่งที่ตรวจพบใหม่ในการ audit ครั้งนี้ — ต้องรู้ก่อนขึ้นสอบ

**(1) โค้ด Edge Function ใน repo ไม่ตรงกับตัวที่ deploy อยู่จริง**

หลักฐาน:
- `lib/types.ts:2-4` เขียนไว้เองว่า "ชนิดเหล่านี้เขียนจากคำตอบจริงของ endpoint ที่ deploy อยู่"
- `types.ts` ประกาศว่า `GET /c/:qrToken` คืน `{ visit: {..., paying_pax, table_nos, open_item_count}, addons, batches, bill, estimate, service_calls, menu }`
- แต่ `supabase/functions/c/index.ts:47-66` ในโปรเจกต์คืน `{ visit: {...ไม่มี paying_pax}, menu, pax, addons_available, addons_chosen, orders, current_total }` — **คนละรูปร่าง**
- `GET /queue/board`: `DisplayPage.tsx:25` อ่าน `data.tickets` แต่ repo คืน `{ lanes, calling }` — **ไม่มีคีย์ `tickets`**
- แต่ภาพ `c5-display.png` แสดงคิว A-002 / B-001 ได้จริง → แปลว่า **ตัวที่ deploy คืน `tickets`**

**ความหมาย:** หน้าเว็บทำงานได้เพราะคุยกับ Edge Function เวอร์ชันที่ deploy ไว้
ถ้ามีคน `supabase functions deploy` จาก repo นี้ **หน้าลูกค้าและจอ TV จะพังทันที**

**ต้องทำก่อนสอบ:** อย่ารัน `supabase functions deploy` เด็ดขาด
และถ้าอาจารย์ถามว่าโค้ดใน repo คือตัวที่รันอยู่ไหม ให้ตอบตามจริงว่า
"ฝั่งฐานข้อมูลตรงกัน 100% เพราะ push ด้วย migration แต่ฝั่ง Edge Function
มีเวอร์ชันที่ deploy ไปก่อนแล้วยังไม่ได้ sync กลับเข้า repo ซึ่งเป็นหนี้ทางเทคนิคที่เรารู้ตัว"

**(2) `api.setAddon()` ส่ง body ไม่ครบตามที่ endpoint ใน repo ต้องการ**

- `lib/api.ts:125-131` ส่ง `body: { qty }` เท่านั้น
- `functions/c/index.ts:134` ต้องการ `addon_id` มิฉะนั้นตอบ 400 "ไม่ได้ระบุรายการเสริม"
- ผู้เรียกคือ `MenuTab.tsx:69` ซึ่งไม่ได้ส่ง `addon_id`

→ สอดคล้องกับข้อ (1) คือเวอร์ชันที่ deploy น่าจะเลือก addon ตัวแรกของสาขาให้เอง
**ถ้าจะสาธิตปุ่มน้ำรีฟิลฝั่งลูกค้า ให้ทดสอบก่อนขึ้นสอบ**

**(3) Realtime เปิดไว้แต่ไม่ได้ใช้**

`0012:224-238` เพิ่ม 6 ตารางเข้า publication `supabase_realtime` แล้ว
แต่ไม่พบ `.channel()` หรือ `.subscribe()` ในโค้ดหน้าเว็บเลย — ทุกหน้าใช้ `usePolling`
ถ้าอาจารย์ถามว่า "ใช้ Realtime ไหม" ให้ตอบว่า **"เปิดที่ฐานข้อมูลแล้วแต่หน้าเว็บยังใช้ polling
เพราะฝั่งลูกค้าใช้ Realtime ไม่ได้ (ไม่มี JWT) เราจึงเลือกให้ทั้งระบบใช้วิธีเดียวกันไว้ก่อน
ฝั่งพนักงานย้ายไป Realtime ได้ทันทีเพราะโครงสร้างพร้อมแล้ว"**

---

## 14 · ข้อจำกัดและสิ่งที่พัฒนาต่อได้

### 14.1 นอกขอบเขตโดยตั้งใจ (`Read/System Design.md:1443-1446`)

รีวิว/คะแนนความพอใจ · เดลิเวอรี · หน้าจอหลายสาขา · ระบบเงินเดือน ·
BOM ตัดสต๊อกอัตโนมัติ (ร้านบุฟเฟต์วัดน้ำหนักที่ตักไม่ได้จริง)

### 14.2 ส่วนที่เป็นของจำลอง (mock) — ต้องบอกอาจารย์ตรง ๆ

| สิ่งที่ mock | สถานะจริง | ถ้าจะทำของจริงต้องทำอะไร |
| --- | --- | --- |
| PromptPay QR | ไม่มี webhook จากธนาคาร พนักงานกดยืนยันรับเงินแทน | ต่อ payment gateway จริง แล้วเปลี่ยน `payment.confirmed_by` เป็น nullable สำหรับกรณีที่ webhook ยืนยัน |
| SMS / LINE แจ้งคิว | เขียนลง `notification_log` อย่างเดียว `is_mock = true` | ต่อ LINE Messaging API หรือผู้ให้บริการ SMS แล้วอ่านคิวจากตารางนี้ส่งออก |
| ใบกำกับภาษี | ยังไม่มีในโค้ด — **ไม่พบไฟล์ที่สร้าง PDF ใด ๆ ในโปรเจกต์** | ต้องพัฒนาใหม่ทั้งหมด และตรวจข้อกำหนดสรรพากร |

### 14.3 สมมติฐานที่ยังต้องยืนยันกับร้านจริง

ไม่มี grace period หลัง 120 นาที · ราคาเด็ก 189 บาทเป็นค่าเริ่มต้นที่ตั้งเอง ·
add-on คิดครั้งเดียวไม่คิดซ้ำเมื่อต่อรอบ · ค่าเกินเวลาไม่คิดกับเด็กเล็กที่ฟรี

### 14.4 งานที่ยังค้าง (เรียงตามความสำคัญ)

| ลำดับ | งาน | ทำไมสำคัญ |
| --- | --- | --- |
| 1 | **ผูกการตรวจ PIN เข้ากับรายการที่มีผลทางการเงิน** | สเปคระบุไว้แต่ยังไม่บังคับจริงบนเส้นทางที่ใช้งาน |
| 2 | **Sync โค้ด Edge Function ใน repo ให้ตรงกับที่ deploy** | ตอนนี้ deploy จาก repo แล้วหน้าลูกค้าจะพัง |
| 3 | ตั้ง `pg_cron` เรียกงานกวาด 4 ตัว | no-show, เตือนเวลา, ลบเบอร์โทร, ปล่อยการจอง ยังต้องเรียกมือ |
| 4 | เขียน automated test | ตอนนี้มีแต่การทดสอบด้วยมือที่บันทึกไว้ใน `supabase/README.md` **ไม่พบไฟล์ test ใด ๆ ในโปรเจกต์** |
| 5 | ย้ายฝั่งพนักงานจาก polling ไป Realtime | ลดภาระเซิร์ฟเวอร์ และได้ข้อมูลทันทีจริง ๆ |
| 6 | Rate limit ที่ `/queue/tickets` | สเปคเขียนไว้แต่โค้ดยังไม่มี |
| 7 | หน้าสลับสาขา + รายงานรวมหลายสาขา | โครงสร้าง `branch_id` พร้อมแล้ว เหลือแค่ UI |
| 8 | Partition `audit_log` / ตารางสรุปยอดรายวัน | เตรียมรับข้อมูลระดับแสน-ล้านแถว |

### 14.5 "ถ้าร้านขยายหลายสาขา ระบบนี้ยังใช้ได้ไหม" — คำตอบเต็ม

**ใช้ได้ และเตรียมไว้ตั้งแต่วันแรก** (`0002_shop_and_queue.sql:5-6`)

สิ่งที่พร้อมแล้ว:
- ทุกตารางปฏิบัติการมี `branch_id` — ไม่ต้อง migrate ข้อมูล แค่เพิ่มแถวใน `branch`
- RLS ทุก policy ผูกกับ `fn_my_branch_id()` แล้ว — ข้อมูลไม่ปนข้ามสาขาโดยอัตโนมัติ
- `queue_ticket` unique ที่ `(branch_id, service_date, lane, seq_no)` — เลขคิวไม่ชนกันข้ามสาขา
- `fn_daily_report` เปิดให้ OWNER ดูข้ามสาขาได้แล้ว (`0018:340-342`)

สิ่งที่ต้องเพิ่ม:
- UI สลับสาขา (ตอนนี้ไม่มี — พนักงานผูกกับสาขาเดียวผ่านตาราง `staff`)
- `lib/shop.ts` เป็นค่าคงที่ไฟล์เดียว (มี comment `ponytail:` บอกไว้เองว่าวันเปิดหลายสาขาให้ลบทิ้งแล้วดึงจาก API)
- รายงานรวมทุกสาขา
- พนักงานที่ทำหลายสาขา — ตอนนี้ `staff.branch_id` เป็นค่าเดียว ต้องเพิ่มตารางกลางถ้าต้องการ

---

## 15 · คำถามที่อาจารย์น่าจะถาม พร้อมคำตอบจากโปรเจกต์จริง

### กลุ่ม A · คำถามภาพรวม

**Q1 · "โปรเจกต์นี้แก้ปัญหาอะไร ทำไมไม่ใช้ POS สำเร็จรูป"**
> POS ทั่วไปผูกออเดอร์กับโต๊ะและคิดเงินต่อจาน ซึ่งไม่ตรงกับร้านบุฟเฟต์ที่คิดต่อหัวและมีเพดานเวลา
> ปัญหาที่ตามมาจริง 3 ข้อคือ (1) ย้ายโต๊ะแล้วออเดอร์หลุด (2) ไม่รู้ว่ามื้อนี้ใช้เวลากี่นาที
> จึงคิดค่าเกินเวลาไม่ได้ (3) รวมบิลข้ามโต๊ะของกลุ่มเดียวกันไม่ได้
> เราจึงออกแบบให้ `visit` เป็นแกนกลางแทนโต๊ะ ทุกอย่างอ้างมาที่ `visit_id` เดียว

**Q2 · "ระบบนี้มีอะไรที่ต่างจากโปรเจกต์อื่นในชั้น"**
> กฎธุรกิจทั้ง 10 ข้อถูกบังคับที่ **ฐานข้อมูล** ไม่ใช่ที่หน้าจอ
> เราถือว่าการซ่อนปุ่มใน UI อย่างเดียวคือออกแบบไม่ผ่าน เพราะคนที่เปิด DevTools ยิง API ตรงจะข้ามได้
> และเราพิสูจน์ด้วยการไล่ตรวจย้อนหลังจนพบช่องโหว่จริง 6 จุด แล้วปิดที่ `0018_close_leaks.sql`

**Q3 · "ทำไม `visit` ถึงเป็นแกนกลาง ไม่ใช่ `table` หรือ `order`"**
> เพราะสิ่งที่ร้านขายจริงคือ "มื้อ" ไม่ใช่ "โต๊ะ" — กลุ่มลูกค้าหนึ่งกลุ่มอาจใช้ 2 โต๊ะ
> หรือย้ายโต๊ะกลางมื้อ แต่ยังเป็นมื้อเดียวที่มีนาฬิกาเรือนเดียวและบิลใบเดียว
> ถ้าผูกกับโต๊ะ พอย้ายโต๊ะจะต้องย้ายออเดอร์ตาม ซึ่งเป็นจุดที่ข้อมูลหายบ่อยที่สุดในระบบ POS

### กลุ่ม B · "ทำไมเลือกสิ่งนี้"

**Q4 · "ทำไมใช้ PostgreSQL ไม่ใช่ MySQL หรือ MongoDB"**

| | PostgreSQL (ที่เลือก) | MySQL | MongoDB |
| --- | --- | --- | --- |
| Row Level Security | **มีในตัว** | ไม่มี ต้องทำที่ชั้นแอป | ไม่มี |
| Trigger บังคับกฎธุรกิจ | ครบ รองรับ `raise exception` พร้อมข้อความ | มี แต่จำกัดกว่า | ไม่มี (มี change stream คนละเรื่อง) |
| Transaction ข้ามหลายตาราง | ACID เต็ม | ACID เต็ม (InnoDB) | ต้องใช้ multi-document transaction ที่ช้ากว่าและมีข้อจำกัด |
| `jsonb` + partial index | มี | JSON มีแต่ index ด้อยกว่า | เป็น document store อยู่แล้ว |
| ENUM ระดับฐานข้อมูล | มี | มี | ไม่มี |
| Partial unique index | **มี** (ใช้กับ `visit_table` และ `service_call`) | ไม่มี ต้องใช้ trick | ไม่มี |

> **คำตอบที่ควรพูด:** เลือก PostgreSQL เพราะสองเหตุผลหลัก
> หนึ่ง — RLS คือสิ่งเดียวที่ทำให้เราปล่อยให้ frontend ยิงฐานข้อมูลตรงได้อย่างปลอดภัย
> โดยไม่ต้องเขียน backend CRUD เองทั้งหมด
> สอง — partial unique index อย่าง `visit_table_one_active_per_table`
> ทำให้ "โต๊ะหนึ่งตัวถูกจองซ้อนสอง Visit ไม่ได้" กลายเป็นกฎระดับฐานข้อมูลที่เขียนบรรทัดเดียว
> ถ้าใช้ MySQL ต้องเขียน trigger เพิ่ม ถ้าใช้ MongoDB ต้องเขียน logic ที่ชั้นแอปและยังมี race condition
>
> **MongoDB ไม่เหมาะกับงานนี้เพราะ** ข้อมูลของเรามีความสัมพันธ์ชัดและต้องการ
> ความถูกต้องของตัวเลขเงิน — ตอนปิดโต๊ะต้องเทียบ `SUM(payment.amount)` กับ `bill.net_total`
> ในทรานแซกชันเดียวกับที่เพิกถอน QR และปล่อยโต๊ะ ถ้าแยกเป็น document จะเกิดสถานะกลางที่บิลปิดแล้วแต่โต๊ะยังไม่ว่าง

**Q5 · "ถ้าเปลี่ยนไปใช้ MySQL จะเกิดอะไร"**
> ตาราง constraint และ FK ส่วนใหญ่ย้ายได้ แต่สิ่งที่ต้องเขียนใหม่ทั้งหมดคือ
> (1) RLS 40+ policy → ต้องย้ายไปเป็น middleware ตรวจสิทธิ์ในโค้ด
> (2) partial index ทั้งหมด → ต้องเขียน trigger แทน
> (3) ENUM 18 ตัวยังใช้ได้ แต่การเพิ่มค่าใหม่ทำได้ยากกว่า
> (4) `jsonb` ใน `audit_log` และ `app_setting` ต้องเปลี่ยนเป็น JSON ที่ index ได้น้อยกว่า
> ผลที่ตามมาที่สำคัญที่สุดคือ **ความปลอดภัยจะย้ายจาก "ปิดโดยค่าเริ่มต้น" ไปเป็น "ต้องจำว่าจะตรวจ"**
> ซึ่งลืมได้และเป็นที่มาของช่องโหว่

**Q6 · "ทำไมใช้ Supabase ไม่เขียน backend เอง"**
> ทีมเล็กและเวลาจำกัด ถ้าเขียน backend เองต้องทำ endpoint 19 ตัว + auth + deployment
> ซึ่งเป็นงาน infrastructure ไม่ใช่กฎธุรกิจที่เป็นคุณค่าจริงของโปรเจกต์
> Supabase ให้ PostgREST, Auth, Realtime, Storage มาในกล่องเดียว
> เราจึงเอาเวลาทั้งหมดไปลงกับสิ่งที่ยาก คือการทำให้กฎธุรกิจ 10 ข้อบังคับได้จริงที่ฐานข้อมูล
>
> **ข้อเสียที่ยอมรับ:** ผูกกับผู้ให้บริการระดับหนึ่ง — schema และ migration ย้ายออกได้
> แต่ RLS, Auth และ Edge Function ต้องเขียนใหม่ถ้าย้ายไป self-host
> (แต่ Supabase เป็น open source และ self-host ได้ ซึ่งลดความเสี่ยงข้อนี้ลงมาก)

**Q7 · "ทำไมฝั่งลูกค้าต้องผ่าน Edge Function แต่ฝั่งพนักงานยิงตรง"**
> เพราะสองกลุ่มนี้พิสูจน์ตัวตนคนละวิธีโดยสิ้นเชิง
> พนักงานล็อกอินมี JWT → RLS เทียบ `auth.uid()` ได้ → ยิงตรงปลอดภัย
> ลูกค้าไม่ล็อกอิน → RLS ไม่มีตัวตนให้เทียบ ถ้าเปิด anon key ให้อ่าน `visit` ตรง
> คนที่มี anon key (ซึ่งอยู่ใน JavaScript ของทุกคน) จะอ่านข้อมูลโต๊ะอื่นได้หมด
> Edge Function จึงทำหน้าที่เป็นคนตรวจ `qr_token` แทน RLS แล้วจำกัดขอบเขตข้อมูลไว้ที่ Visit นั้น
>
> **ทางเลือกที่พิจารณาแล้วไม่เลือก:** ใส่ token ลงใน RLS policy โดยให้ลูกค้าส่ง token มาทาง
> custom header แล้วเทียบในตาราง — ทำได้แต่ policy จะซับซ้อนมาก และถ้าเขียนพลาดจุดเดียว
> ข้อมูลรั่วข้ามโต๊ะทั้งระบบ การแยกออกมาเป็นโค้ดที่อ่านได้ชัดปลอดภัยกว่าสำหรับทีมขนาดนี้

**Q8 · "ทำไม `menu_item` ไม่มีราคา" (ADR-02)**
> เพราะร้านคิดเงินต่อหัว ไม่ใช่ต่อจาน ถ้าใส่ราคาต่อจานจะเกิด "แหล่งความจริงสองที่"
> — ยอดจาก `visit_pax` กับยอดจาก `order_item` — ซึ่งวันหนึ่งจะไม่ตรงกันและไม่มีใครรู้ว่าอันไหนถูก
> ผลที่ตามมาในการออกแบบคือ `v_menu_popularity` ต้องนับ **จำนวนที่สั่ง** ไม่ใช่ยอดเงิน
> ซึ่งก็ตรงกับสิ่งที่เจ้าของร้านอยากรู้จริง ๆ อยู่แล้ว คือเมนูไหนหมดเร็วต้องเตรียมเพิ่ม

**Q9 · "ทำไมใช้ UUID เป็น Primary Key ไม่ใช่ auto-increment"**
> สามเหตุผล
> (1) Edge Function และฐานข้อมูลสร้าง id ได้พร้อมกันโดยไม่ต้องถามกันว่าเลขล่าสุดคืออะไร
> (2) id ไม่บอกความลับทางธุรกิจ — ถ้าใช้เลขเรียง ลูกค้าดู `visit_id = 1523` แล้วรู้ทันทีว่าร้านมีลูกค้ามาแล้วกี่โต๊ะ
> (3) รวมข้อมูลข้ามสาขาในอนาคตไม่ชนกัน
>
> **ข้อเสียที่ยอมรับ:** UUID กินพื้นที่ 16 ไบต์เทียบกับ 4-8 ไบต์ของ int
> และ index จะกระจายกว่าเพราะไม่เรียงตามเวลา — ในระดับข้อมูลของร้านเดียวยังไม่มีผลที่วัดได้
> ถ้าโตถึงระดับล้านแถวค่อยพิจารณา UUIDv7 ที่เรียงตามเวลาได้

**Q10 · "ทำไมใช้ React ไม่เขียน HTML + JavaScript ธรรมดา"**
> หน้าโต๊ะของลูกค้ามีนาฬิกานับถอยหลังที่เดินทุกวินาที + ข้อมูลที่ดึงใหม่ทุก 5 วินาที
> + แท็บ 3 แท็บที่สลับได้ ถ้าเขียนด้วย DOM ธรรมดาต้องเขียนโค้ดอัปเดต DOM เองทุกจุด
> และทั้งระบบมี 30+ หน้าที่ใช้ component ร่วมกัน (`design/primitives.tsx` ใช้ทุกหน้า)
>
> **ทำได้ไหมถ้าใช้ HTML ธรรมดา:** ทำได้ แต่จะต้องเขียน state management เอง
> ซึ่งก็คือการสร้าง React ขึ้นมาเองในเวอร์ชันที่แย่กว่า
> **ถ้าเปลี่ยนเป็น Vue หรือ Svelte:** ผลลัพธ์เท่ากัน ต้องเขียนหน้าใหม่ทั้งหมด
> แต่ **API และฐานข้อมูลไม่ต้องแตะเลยแม้แต่บรรทัดเดียว** ซึ่งเป็นข้อดีของการแยกชั้นแบบนี้

### กลุ่ม C · "ใช้วิธีอื่นแทนได้ไหม"

**Q11 · "ทำไมไม่รวม `visit_pax` เข้าไปใน `visit` เป็นคอลัมน์ adult / child / toddler"**
> ทำได้ แต่จะเสียสามอย่าง
> (1) เพิ่มช่วงราคาใหม่ (เช่น ราคานักเรียน) ต้อง `ALTER TABLE` ทุกครั้ง
> (2) เก็บ snapshot ราคาแยกตาม tier ไม่ได้ ต้องเพิ่มคอลัมน์ราคาอีกชุด
> (3) กฎ BR-03 (เพิ่มได้ ลดไม่ได้) ตอนนี้เขียนเป็น trigger 8 บรรทัดบน `visit_pax.qty`
> ถ้ารวมเป็นคอลัมน์ต้องเทียบทีละคอลัมน์และซับซ้อนกว่ามาก
> เราจึงเลือก normalize ให้ tier เป็นแถว ไม่ใช่คอลัมน์

**Q12 · "แทนที่จะใช้ trigger ทำไมไม่เช็คในโค้ดฝั่งแอป"**
> เราเช็คทั้งสองที่ แต่ **ที่ฝั่งแอปเช็คเพื่อ UX ส่วนที่ฐานข้อมูลเช็คเพื่อความถูกต้อง**
> เหตุผลคือระบบนี้มีทางเข้าข้อมูลหลายทาง: หน้าเว็บลูกค้า หน้าเว็บพนักงาน
> PostgREST ตรง Edge Function และ SQL ที่ admin รันเอง
> ถ้าเขียนกฎไว้ที่โค้ดแอป ต้องเขียนซ้ำทุกทางเข้าและต้องจำว่าอย่าลืม
> การเขียนไว้ที่ฐานข้อมูลคือการเขียนครั้งเดียวแล้วทุกทางเข้าถูกบังคับเท่ากัน
>
> **ข้อเสียที่ยอมรับ:** logic อยู่ใน SQL ทำให้ test ยากกว่า, debug ยากกว่า,
> และทีมต้องอ่าน PL/pgSQL เป็น แต่สำหรับกฎที่เกี่ยวกับ "เงิน" เราถือว่าคุ้ม

**Q13 · "ใช้ REST แบบนี้ทำไม ไม่ใช้ GraphQL หรือ gRPC"**

| | ที่ใช้อยู่ (REST + PostgREST) | GraphQL | gRPC |
| --- | --- | --- | --- |
| จุดแข็ง | ตรงไปตรงมา · PostgREST สร้าง endpoint จากตารางให้อัตโนมัติ · cache ที่ HTTP ได้ | client ขอเฉพาะฟิลด์ที่ต้องการ · ลด over-fetching | เร็วมาก · type-safe |
| เหมาะกับ | ระบบขนาดนี้ที่มี client 4 แบบแต่ต้องการข้อมูลคล้ายกัน | ระบบที่ client หลากหลายและต้องการข้อมูลต่างกันมาก | service-to-service ภายใน |
| ถ้าเปลี่ยนมาใช้ | — | ต้องเขียน resolver เอง + จัดการ N+1 เอง + RLS ทำงานผ่าน resolver ไม่อัตโนมัติ | เบราว์เซอร์เรียกตรงไม่ได้ ต้องมี gRPC-Web + proxy |

> เราออกแบบให้ `GET /c/:qrToken` คืน **ทุกอย่างที่หน้าโต๊ะต้องใช้ในคำขอเดียว**
> (เมนู + เวลา + ออเดอร์ + ยอด) ซึ่งเป็นการแก้ปัญหา over-fetching/under-fetching
> แบบเดียวกับที่ GraphQL แก้ แต่ทำด้วย REST ที่ออกแบบตามหน้าจอ ไม่ต้องเพิ่ม layer ใหม่

**Q14 · "ใช้ polling ทำไม ไม่ใช้ WebSocket / Realtime"**
> เหตุผลตรงไปตรงมา: **Realtime ของ Supabase เคารพ RLS
> และลูกค้าไม่มีตัวตนให้ RLS เทียบ** จึงส่ง event ให้ลูกค้าไม่ได้เลย (`usePolling.ts:4-8`)
> เมื่อฝั่งลูกค้าต้อง poll อยู่ดี เราจึงเลือกให้ทั้งระบบใช้กลไกเดียวกันไว้ก่อน เพื่อให้โค้ดมีแบบเดียว
>
> **ข้อดีของ polling ที่มักถูกมองข้าม:** ทนเน็ตหลุดได้เอง (รอบถัดไปก็ได้ข้อมูลใหม่)
> ไม่ต้องจัดการ reconnect ไม่ต้องจัดการ state ที่ตกหล่นระหว่างขาด
> **ข้อเสีย:** ข้อมูลช้าได้ถึง 5 วินาที และกิน request มากกว่า
> **เราเตรียมทางไว้แล้ว:** Realtime เปิดที่ฐานข้อมูลครบ 6 ตาราง ฝั่งพนักงานย้ายได้ทันที

**Q15 · "แทนที่จะ soft delete ทำไมไม่ลบจริงแล้วพึ่ง backup" (ADR-08)**
> เพราะร้านอาหารมีพนักงานหมุนเวียนสูงและกดผิดบ่อย
> ถ้าพึ่ง backup การกู้คืนหนึ่งแถวต้องเรียก developer และอาจใช้เวลาเป็นวัน
> แต่ถ้า soft delete หัวหน้ากะกดกู้คืนเองได้ทันทีที่หน้า `/admin/restore`
>
> **เราทำให้เลี่ยงไม่ได้ด้วย** `REVOKE DELETE` ทุกตารางทั้ง `authenticated` และ `anon` (`0010:245-255`)
> ไม่ใช่แค่ "ตกลงกันว่าจะไม่ลบ"
>
> **ข้อเสีย:** ตารางโตขึ้นเรื่อย ๆ และทุก query ต้องเขียน `where deleted_at is null`
> — เราลดผลกระทบด้วย partial index ที่ใส่เงื่อนไขเดียวกัน

**Q16 · "ทำไมต้อง Idempotency-Key ในเมื่อ disable ปุ่มก็พอ" (ADR-07)**
> เพราะการกดซ้ำที่เป็นปัญหาจริง **ไม่ได้เกิดจากปุ่ม แต่เกิดจาก network**
> ลูกค้ากดสั่ง เน็ตช้า คำขอถึงเซิร์ฟเวอร์แล้วแต่คำตอบไม่กลับมา
> ลูกค้าเห็นว่าไม่มีอะไรเกิดขึ้นเลยกดใหม่ → ได้ออเดอร์สองรอบ
> การ disable ปุ่มแก้ไม่ได้เพราะคำขอแรกส่งไปแล้ว
> เราจึงใช้ `Idempotency-Key` ที่ client สร้างต่อการกดหนึ่งครั้ง แล้วเซิร์ฟเวอร์จำคำตอบไว้
> กดซ้ำกี่ครั้งก็ได้คำตอบเดิม ไม่สร้างของซ้ำ

### กลุ่ม D · "ถ้าเปลี่ยนวิธีจะเกิดอะไร"

| ถ้าเปลี่ยน | จะเกิดอะไร (ตอบจากโปรเจกต์จริง) |
| --- | --- |
| **เอา RLS ออก** | หน้า staff/admin ยิง PostgREST ตรง → ใครก็ตามที่มี anon key จะอ่านและแก้ทุกตารางได้ทันที ต้องเขียน backend ใหม่ทั้งหมดมาแทน |
| **เอา trigger ออก แล้วเช็คที่แอปแทน** | ช่องโหว่ 6 จุดที่ `0018` ปิดไว้จะกลับมาทั้งหมด เพราะทั้ง 6 จุดคือกรณีที่ "ยิง API ตรงแล้วข้ามกฎได้" |
| **ให้ลูกค้ายิง PostgREST ตรงด้วย anon key** | ลูกค้าอ่าน `visit` ของโต๊ะอื่นได้ เพราะ RLS ไม่มีตัวตนให้เทียบ (นี่คือเหตุผลของ ADR-06 ทั้งข้อ) |
| **ผูก QR กับโต๊ะแทน Visit** | ลูกค้าโต๊ะถัดไปที่ถ่ายรูป QR เก่าไว้จะเห็นข้อมูลและสั่งอาหารเข้าโต๊ะที่คนอื่นกำลังใช้ได้ (BR-02 มีไว้กันข้อนี้) |
| **ใส่ราคาใน `menu_item`** | เกิดยอดสองชุดที่ไม่ตรงกัน และต้องตัดสินใจว่าจะคิดเงินจากอันไหน |
| **ใช้ auto-increment แทน UUID** | ต้องรอฐานข้อมูลออกเลขก่อนถึงจะสร้างของที่เกี่ยวข้องได้ · id เปิดเผยจำนวนลูกค้าของร้าน · รวมหลายสาขาชนกัน |
| **ยกเลิกการ snapshot ราคาใน `visit_pax`** | ร้านขึ้นราคาตอนเที่ยง โต๊ะที่นั่งตั้งแต่เช้าจะโดนราคาใหม่ตอนเช็กบิล |
| **ยกเลิกการ snapshot `duration_minutes` ใน `visit`** | ร้านแก้แพ็กเกจจาก 120 เป็น 90 นาที โต๊ะที่กำลังนั่งอยู่จะกลายเป็นเกินเวลาทันทีทั้งร้าน |
| **เปลี่ยน polling 5 วิ เป็น 1 วิ** | request เพิ่ม 5 เท่า (จาก ~288 เป็น ~1,440 ต่อนาทีที่ 24 client) โดยที่ข้อมูลที่เปลี่ยนจริงมีไม่ถึง 1% ของรอบ |
| **ย้ายไป Firebase** | เสีย transaction ข้ามตารางที่ใช้ตอนปิดบิล · เสีย trigger SQL · ได้ Realtime ที่ดีกว่า แต่ต้องเขียนกฎธุรกิจทั้งหมดใหม่ที่ชั้นแอปหรือ Cloud Functions |

### กลุ่ม E · คำถามเจาะเทคนิค

**Q17 · "Query ไหนสำคัญที่สุดในระบบ อธิบายหน่อย"**
> `fn_calc_bill` เพราะเป็นตัวตัดสินว่าลูกค้าจ่ายเท่าไร
> รับ `visit_id` แล้วคืน 5 ค่า: ค่าแพ็กเกจ · ค่า add-on · จำนวนรอบที่เกิน · ค่าเกินเวลา · ยอดสุทธิ
> จุดที่ต้องอธิบายคือ `coalesce(bill_requested_at, now())` — พอขอเช็กบิลแล้วเวลาหยุดเดิน
> ยอดจึงไม่เพิ่มระหว่างที่พนักงานเดินมาเก็บเงิน
> และ `greatest(0, ceil((elapsed - duration) / duration))` ที่ทำให้เกิน 1 นาทีก็คิดเต็มรอบ ตามที่ร้านตกลง
> เราทดสอบตรงกับตัวอย่างในสเปคทั้ง 3 ข้อแล้ว

**Q18 · "เขียน query นี้อีกแบบได้ไหม แบบไหนเร็วกว่า"**
> ตัวอย่างที่ชัดที่สุดคือ `v_visit_live` ที่เรียก `fn_elapsed_minutes()` 4 ครั้งต่อแถว
> เขียนใหม่ได้โดยคำนวณ `elapsed` ครั้งเดียวใน CTE หรือ subquery แล้วอ้างซ้ำ
> ซึ่งจะเร็วกว่าเพราะลด function call ลง 75%
> เหตุผลที่เขียนแบบปัจจุบันคืออ่านง่ายและจำนวนแถวถูกจำกัดที่จำนวนโต๊ะในร้าน (~11 โต๊ะ)
> ถ้าขยายเป็นหลายสาขาหรือร้านใหญ่ ควรแก้จุดนี้ก่อนเพื่อน

**Q19 · "ถ้าพนักงานสองคนกดเปิดโต๊ะเดียวกันพร้อมกันจะเกิดอะไร"**
> ไม่เกิดปัญหา เพราะมีการป้องกัน 2 ชั้น
> ชั้นแรก `fn_open_visit` ใช้ `SELECT ... FOR UPDATE` ล็อกแถวโต๊ะที่สถานะ `AVAILABLE` ไว้ก่อน
> คนที่สองจะรอ แล้วพอได้ล็อกโต๊ะก็ไม่ `AVAILABLE` แล้ว จึงได้ error "โต๊ะที่เลือกไม่ว่างแล้ว"
> ชั้นที่สองคือ partial unique index `visit_table_one_active_per_table`
> ซึ่งเป็นด่านสุดท้ายที่ฐานข้อมูลปฏิเสธการ insert ซ้ำแน่นอน
>
> เช่นเดียวกันกับการรับเงินสองเครื่องพร้อมกัน — `trg_payment_not_exceed_total`
> ล็อกแถวบิลด้วย `FOR UPDATE` ก่อนเทียบยอดรวม

**Q20 · "ถ้าไม่ทำ Validation / Authentication / Authorization จะเกิดอะไร"**

| ถ้าไม่ทำ | ผลที่เกิดกับระบบนี้โดยเฉพาะ |
| --- | --- |
| Validation | จำนวนคนติดลบ · จ่ายเงินติดลบ · ยกเลิก Visit โดยไม่บอกเหตุผล · สั่งอาหารที่ไม่มีในเมนู |
| Authentication | ใครก็เปิดหน้า `/admin` แล้วแก้ราคาบุฟเฟต์หรือลบเมนูได้ |
| Authorization | พนักงานระดับล่างแก้ราคาเอง · ยกเลิกบิลตัวเอง · อ่านยอดขายของสาขาอื่น · ลดจำนวนคนในบิลเพื่อช่วยเพื่อน |
| ทั้งสามอย่างที่ระดับฐานข้อมูล | คนที่เปิด DevTools แล้วยิง fetch ตรงข้ามทุกกฎได้ ซึ่งเราพิสูจน์แล้วว่าเกิดขึ้นจริง 6 จุดก่อนแก้ที่ `0018` |

**Q21 · "Git บอกได้ไหมว่าใครทำอะไร"**
> **ตอบตามจริง:** Git บอกได้ว่ามี 2 identity คือ `jarnballproject-ops` (7 commits, ช่วง 31 ส.ค.–14 ก.ย.
> ทำสคีมา เอกสาร และหน้าเว็บ) และ `suphakirtpan` (6 commits, ช่วง 14–15 ก.ย. ทำ build/lint
> ย้าย PIN ไป DB และแก้ UX ฝั่งลูกค้า)
> แต่ทั้งสอง identity มีแนวโน้มเป็นบัญชีของคนเดียวกันหรือบัญชีโปรเจกต์
> **จึงสรุปการแบ่งงานรายคนจาก Git ไม่ได้ ต้องให้สมาชิกในทีมยืนยันเอง**
>
> ถ้าอาจารย์ถามต่อว่าทำไมไม่ชัด ให้ตอบตรง ๆ ว่าเราไม่ได้ตั้ง `git config user.name`
> แยกรายคนตั้งแต่ต้น และ commit message ส่วนใหญ่เป็นวันที่ (เช่น `9/14/1544`)
> ซึ่งเป็นบทเรียนที่เรารู้ตัวและจะแก้ในโปรเจกต์ถัดไป

**Q22 · "ทำไมมี branch เดียว ไม่ใช้ Git Flow"**
> ตอนนี้มี `main` (ใช้งานจริง) และ `backup-local-20260914` (สำรองไว้ ไม่ได้ merge)
> ทีมเล็กและทุกคนทำงานคนละส่วน (ฐานข้อมูล / หน้าเว็บ) โอกาสชนกันต่ำ
> การเปิด branch ต่อฟีเจอร์จึงเพิ่มขั้นตอนโดยไม่ได้ประโยชน์
>
> **ข้อเสียที่ยอมรับ:** ไม่มีการ review ก่อน merge · ถ้า commit ทำ main พังจะกระทบทุกคนทันที
> **ถ้าทีมใหญ่ขึ้นควรเปลี่ยนเป็น** GitHub Flow (branch ต่อฟีเจอร์ + Pull Request)
> ซึ่งเบากว่า Git Flow เต็มรูปแบบและเหมาะกับการ deploy บ่อย
>
> สังเกตได้ว่าเรามี `upstream` แยกจาก `origin` แสดงว่ามีการ fork ระหว่างบัญชี
> ซึ่งเป็นรูปแบบที่ใช้แทน branch ได้ระดับหนึ่ง

**Q23 · "ทดสอบระบบอย่างไร"**
> **ตอบตามจริง:** ยังไม่มี automated test ในโปรเจกต์
> สิ่งที่มีคือการทดสอบด้วยมือที่ **บันทึกผลไว้เป็นเอกสาร** ที่ `supabase/README.md:57-82`
> โดยรันสคีมาทั้งชุดบน PostgreSQL 17 ใน schema ชั่วคราว แล้วทดสอบว่า
> (1) เครื่องคิดเงินตรงกับตัวอย่างทั้ง 3 ข้อในสเปค
> (2) กฎ BR-01, BR-02, BR-03, BR-06, BR-07, BR-10 และ state machine ปฏิเสธได้จริง
> แล้วลบ schema ทิ้ง
>
> **สิ่งที่ควรทำต่อ:** เขียน pgTAP สำหรับกฎในฐานข้อมูล และ Playwright สำหรับ user flow หลัก
> เพื่อให้ทุกครั้งที่แก้โค้ดรู้ทันทีว่ากฎไหนพัง

---

## 16 · แผ่นโกงก่อนเข้าห้องสอบ (ท่องให้ได้ 8 ข้อนี้)

1. **แกนกลางคือ `visit` ไม่ใช่โต๊ะ** — เพราะร้านขาย "มื้อ" ไม่ใช่ "โต๊ะ"
2. **กฎเงินอยู่ที่ฐานข้อมูล ไม่ใช่ที่หน้าจอ** — ซ่อนปุ่มอย่างเดียวถือว่าไม่ผ่าน
3. **ทางเข้าข้อมูล 2 เส้น** — ลูกค้าผ่าน Edge Function (ตรวจ qr_token) · พนักงานยิง PostgREST ตรง (RLS คุม)
4. **เมนูไม่มีราคา** — คิดต่อหัวผ่าน `visit_pax` ไม่ใช่ต่อจาน (ADR-02)
5. **สูตรบิล** = `Σ(qty×price) × (1 + รอบที่เกิน) + add-on − ส่วนลด`
6. **ปิดโต๊ะได้เมื่อ `SUM(payment.amount) = bill.net_total` เท่านั้น** แล้ว QR ถูกเพิกถอนทันที
7. **ลบจริงไม่ได้ทั้งระบบ** — `REVOKE DELETE` + soft delete + `audit_log` แบบ append-only
8. **เราเจอช่องโหว่จริง 6 จุดแล้วปิดที่ `0018`** — เล่าเคส `visit_addon` (สั่งน้ำ ดื่มหมด แล้วกดลดเป็น 0) ได้เต็ม ๆ

### สิ่งที่ต้อง "พูดเองก่อนถูกถาม" (จะได้คะแนนความซื่อตรง)

- PIN ตรวจได้ที่ฐานข้อมูลแล้ว แต่ยังไม่ผูกเข้ากับปุ่มบนหน้าจอ
- Edge Function ใน repo ยังไม่ sync กับเวอร์ชันที่ deploy (อย่า deploy ใหม่ตอนสาธิต)
- Realtime เปิดไว้แล้วแต่หน้าเว็บยังใช้ polling
- SMS / PromptPay / ใบกำกับภาษี เป็นของจำลอง
- ยังไม่มี automated test และยังไม่ได้ตั้ง `pg_cron`
- การแบ่งงานรายคนสรุปจาก Git ไม่ได้ ต้องให้ทีมยืนยันเอง

---

## ภาคผนวก · ไฟล์สำคัญที่ควรเปิดให้อาจารย์ดูได้ทันที

| อยากโชว์เรื่อง | เปิดไฟล์ |
| --- | --- |
| โครงสร้างตารางแกนกลาง | `supabase/migrations/0004_visit.sql` |
| กฎธุรกิจทั้งหมด | `supabase/migrations/0008_business_rules.sql` |
| เครื่องคิดเงิน | `supabase/migrations/0007_functions.sql:61-104` |
| ความปลอดภัย / RLS | `supabase/migrations/0010_rls.sql` |
| ช่องโหว่ที่เจอและปิด | `supabase/migrations/0018_close_leaks.sql` |
| API ฝั่งลูกค้า | `supabase/functions/c/index.ts` |
| การกันกดซ้ำ | `supabase/functions/_shared/idempotency.ts` |
| เส้นทางทุกหน้า | `frontend/src/main.tsx` |
| การเรียก API ฝั่ง client | `frontend/src/lib/api.ts` |
| เอกสารออกแบบฉบับเต็ม | `Read/System Design.md` (ADR อยู่ที่บรรทัด 1293-1440) |
| บันทึกผลทดสอบ | `supabase/README.md:57-82` |
