# กีฬาสีเหลือง 2569 – Horizon Group · Yellow Team Athlete Management

เว็บแอปสำหรับจัดตัวนักกีฬาทีมสีเหลือง: ดูรายชื่อสมาชิก 23 คน เลือกกีฬาให้แต่ละคน (ลงได้หลายประเภท) ติดตามจำนวนเทียบเป้าหมาย พิมพ์รายชื่อ และส่งออก CSV/Excel

- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS (ฟอนต์ Sarabun)
- **Database:** เลือกได้ 3 แบบ (ระบบเลือกให้อัตโนมัติ)
  1. **เซิร์ฟเวอร์ใน Wi-Fi บริษัท** — เครื่องนี้เป็นเซิร์ฟเวอร์ เก็บไฟล์ `data/db.json` ทุกคนใน Wi-Fi เดียวกันลงชื่อเองได้ (ไม่ต้องสมัครบัญชีใด ๆ)
  2. **Supabase** — ใช้ผ่านอินเทอร์เน็ตได้ทุกที่ มีระบบล็อกอิน
  3. **โหมด Demo** — เก็บในเบราว์เซอร์เครื่องเดียว ใช้ทดลองเท่านั้น
- **Deploy:** Vercel / Netlify / static hosting ใดก็ได้ (เป็น SPA ไฟล์ static)

> คู่มือใช้งานสำหรับเจ้าหน้าที่: [docs/USER_GUIDE.md](docs/USER_GUIDE.md) · ผลการทดสอบ: [docs/TEST_REPORT.md](docs/TEST_REPORT.md)

---

## 0. ใช้งานร่วมกันใน Wi-Fi บริษัท (แนะนำ — ไม่ต้องสมัครอะไร)

1. ดับเบิลคลิกไฟล์ **`START-SERVER.bat`** ในโฟลเดอร์ `sports-day-yellow` (ครั้งแรกจะติดตั้งแพ็กเกจ ~1 นาที)
2. หน้าต่างดำจะแสดงลิงก์ เช่น `เครื่องอื่นใน Wi-Fi: http://192.168.1.163:5199`
3. ส่งลิงก์นั้นให้ทุกคน (LINE กลุ่ม) — เปิดจากมือถือ/คอมที่ต่อ **Wi-Fi เดียวกัน** ได้ทันที ลิงก์เดียวกันแสดงที่แถบสีเขียวบนหน้าเว็บด้วย
4. ทุกคนลงชื่อ/ยกเลิก/แก้ไข/ลบรายชื่อได้เอง หน้าจอทุกเครื่องอัปเดตอัตโนมัติ

ข้อควรรู้:
- **ห้ามปิดหน้าต่างดำ** และเครื่องนี้ต้องเปิดอยู่ (ปิด = คนอื่นใช้ไม่ได้ แต่ข้อมูลไม่หาย เปิดใหม่ก็กลับมาครบ)
- ข้อมูลอยู่ที่ `data/db.json` และสำรองอัตโนมัติวันละ 1 ไฟล์ที่ `data/backups/` (ลบผิดคืนได้โดยปิดระบบ แล้วคัดลอกไฟล์สำรองทับ `db.json`)
- IP ของเครื่องอาจเปลี่ยนเมื่อต่อ Wi-Fi ใหม่ — ดูลิงก์ล่าสุดที่หน้าต่างดำหรือแถบสีเขียวทุกครั้ง
- ถ้ามือถือเปิดไม่ได้: ตรวจว่าต่อ Wi-Fi เดียวกัน (บาง Wi-Fi สำหรับแขกจะกันเครื่องไม่ให้เห็นกัน) และ Windows Firewall อนุญาต Node.js
- ใครมีลิงก์ก็แก้ไข/ลบได้ทุกอย่าง (ตามที่เลือกไว้) — ทุกการเปลี่ยนแปลงบันทึกในเมนู ประวัติการเปลี่ยนแปลง พร้อมชื่อผู้ทำ
- เปลี่ยนพอร์ตได้ด้วยตัวแปร `PORT` (ค่าเริ่มต้น 5199)

## 1. ติดตั้งและรันบนเครื่อง (โหมดพัฒนา / Demo)

ต้องมี Node.js 18 ขึ้นไป

```bash
cd sports-day-yellow
npm install
npm run dev
```

เปิด http://localhost:5190 — ถ้ายังไม่มีไฟล์ `.env.local` ระบบจะเข้า **โหมด Demo** อัตโนมัติ และแสดงแถบสีส้มแจ้งว่า
ข้อมูลเก็บในเบราว์เซอร์เครื่องนี้เท่านั้น **ไม่ซิงก์ระหว่างอุปกรณ์** (แท็บอื่นในเบราว์เซอร์เดียวกันจะซิงก์กัน)

คำสั่งอื่น:

| คำสั่ง | ใช้ทำอะไร |
|---|---|
| `npm test` | รันชุดทดสอบอัตโนมัติ (กฎการสมัคร + SQL บน PostgreSQL จริงผ่าน PGlite) |
| `npm run build` | ตรวจ TypeScript และสร้างไฟล์ production ใน `dist/` |
| `npm run preview` | เปิดไฟล์ที่ build แล้วเพื่อตรวจก่อน deploy |
| `npm start` | build แล้วเปิดเซิร์ฟเวอร์ Wi-Fi (เหมือน START-SERVER.bat) |
| `npm run serve` | เปิดเซิร์ฟเวอร์ Wi-Fi โดยไม่ build ใหม่ |

ระหว่างพัฒนา: รัน `npm run serve` คู่กับ `npm run dev` — หน้า dev (5190) จะต่อกับเซิร์ฟเวอร์ผ่าน proxy `/api`

## 2. เชื่อมต่อ Supabase (ใช้งานจริงหลายเครื่อง/หลายคน)

1. สมัคร/เข้าสู่ระบบ https://supabase.com → **New project** (Region แนะนำ Singapore)
2. เมนู **SQL Editor → New query** → วางเนื้อหาไฟล์ [`supabase/schema.sql`](supabase/schema.sql) ทั้งไฟล์ → **Run**
   - สร้างตาราง `members`, `sports`, `registrations`, `audit_logs`
   - ใส่สมาชิกตั้งต้น 23 คน (Y001–Y023) และกีฬา 5 ประเภท
   - สร้างฟังก์ชันบันทึกข้อมูลแบบ Transaction, RLS และเปิด Realtime
   - รันซ้ำได้ ไม่ลบข้อมูลเดิม
3. สร้างบัญชีเจ้าหน้าที่: **Authentication → Users → Add user → Create new user** (ใส่อีเมล + รหัสผ่าน, ติ๊ก Auto Confirm)
   แนะนำปิดการสมัครเอง: **Authentication → Sign In / Providers → ปิด "Allow new users to sign up"**
4. เมนู **Project Settings → API** คัดลอก `Project URL` และ `anon public key`
5. ในโฟลเดอร์โปรเจกต์ คัดลอก `.env.example` เป็น `.env.local` แล้วใส่ค่า:

   ```
   VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
   VITE_AUTH_MODE=login
   ```

6. รัน `npm run dev` ใหม่ → จะเห็นหน้าเข้าสู่ระบบ และแถบ Demo หายไป

> `anon key` เป็นคีย์สาธารณะ ใส่ในเว็บได้ ความปลอดภัยอยู่ที่ RLS + การล็อกอิน — **ห้ามใส่ `service_role` key ในไฟล์ .env ของเว็บเด็ดขาด**

**ไม่ต้องการระบบล็อกอิน?** ตั้ง `VITE_AUTH_MODE=none` และรันส่วน `OPTIONAL: anon access` ท้ายไฟล์ `schema.sql`
(ทุกคนที่มีลิงก์จะแก้ไขข้อมูลได้ — เหมาะกับใช้ในวงจำกัดเท่านั้น)

## 3. Deploy บน Vercel

1. Push โฟลเดอร์ `sports-day-yellow` ขึ้น GitHub
2. https://vercel.com → **Add New → Project** → เลือก repo
   - **Root Directory:** `sports-day-yellow` (ถ้าอยู่ในโฟลเดอร์ย่อย)
   - Framework: **Vite** (Build `npm run build`, Output `dist` — Vercel ตั้งให้อัตโนมัติ)
3. **Environment Variables:** ใส่ `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_AUTH_MODE`
4. **Deploy** → ได้ลิงก์ `https://xxx.vercel.app` ส่งให้เจ้าหน้าที่
5. ใน Supabase **Authentication → URL Configuration** ใส่ Site URL เป็นลิงก์ Vercel

แอปใช้ hash routing (`#dashboard`, `#manage`, `#reports`) จึงไม่ต้องตั้งค่า rewrite เพิ่ม

## 4. โครงสร้างข้อมูล

| ตาราง | คอลัมน์หลัก | หมายเหตุ |
|---|---|---|
| `members` | id, member_code (Y001…, unique), full_name, is_active, created_at, updated_at | ไม่ลบจริง ใช้ปิดใช้งาน (`is_active=false`) |
| `sports` | id, sport_name (unique), target_count, sort_order, is_active, created_at, updated_at | แก้เป้าหมายได้ |
| `registrations` | id, member_id, sport_id, registration_status (`registered`/`cancelled`), registered_at, updated_at, created_by | **UNIQUE (member_id, sport_id)** |
| `audit_logs` | id, action, member_id, sport_id, detail, actor, created_at | ประวัติทุกการเปลี่ยนแปลง |

**การยกเลิกและสมัครใหม่:** 1 คน + 1 กีฬา มีได้แถวเดียวตลอดไป (Unique) — ยกเลิก = เปลี่ยนสถานะเป็น `cancelled`, สมัครใหม่ = เปลี่ยนกลับเป็น `registered`
ไทม์ไลน์ทั้งหมด (สมัคร → ยกเลิก → สมัครใหม่ → ย้าย) เก็บใน `audit_logs` ตรวจย้อนหลังได้ครบ

**การป้องกันข้อมูลซ้ำ/ชนกัน:**
- เว็บอ่านตารางได้อย่างเดียว ทุกการเขียนผ่านฟังก์ชัน Postgres (`register_members`, `cancel_registration`, `move_registration`, …) ซึ่งทำงานเป็น 1 Transaction
- `register_members` ล็อกแถวกีฬา (`SELECT … FOR UPDATE`) ก่อนนับจำนวน → เจ้าหน้าที่ 2 คนกดบันทึกพร้อมกันจะถูกจัดคิว ไม่เกิดรายการซ้ำ และการเช็กเกินเป้าหมายไม่พลาด
- ปุ่มบันทึกถูกล็อกระหว่างบันทึก (กันกดซ้ำ) และฝั่งฐานข้อมูลข้ามคนที่สมัครแล้วเสมอ
- เกินเป้าหมาย: เว็บถามยืนยันก่อน แล้วส่ง `p_allow_over=true` — ถ้าไม่ยืนยัน ฐานข้อมูลจะปฏิเสธด้วย `OVER_TARGET`

**Realtime:** เว็บ subscribe การเปลี่ยนแปลงทั้ง 4 ตาราง เมื่อเจ้าหน้าที่คนอื่นบันทึก หน้าจอทุกเครื่องจะอัปเดตเอง (มีปุ่ม Refresh และสถานะซิงก์มุมขวาบน)

## 5. โครงสร้างไฟล์

```
sports-day-yellow/
├─ supabase/schema.sql         ตาราง + ฟังก์ชัน + RLS + Realtime + ข้อมูลตั้งต้น
├─ supabase/schema.test.ts     ทดสอบ SQL บน PostgreSQL (PGlite)
├─ src/lib/seed.ts             รายชื่อ 23 คน + กีฬา 5 ประเภท (โหมด Demo)
├─ src/lib/engine.ts           กฎการสมัคร (โหมด Demo — ตรงกับฟังก์ชัน SQL)
├─ server/index.ts             เซิร์ฟเวอร์ Wi-Fi (Node ไม่มี dependency): API + ไฟล์ข้อมูล + live update
├─ START-SERVER.bat            ดับเบิลคลิกเพื่อเปิดเซิร์ฟเวอร์
├─ src/lib/serverSource.ts     เชื่อมเซิร์ฟเวอร์ Wi-Fi
├─ src/lib/demoSource.ts       เก็บข้อมูล localStorage + ซิงก์ข้ามแท็บ
├─ src/lib/supabaseSource.ts   เชื่อม Supabase (อ่านตาราง / เรียกฟังก์ชัน / Realtime)
├─ src/lib/view.ts             คำนวณตัวเลขสรุป สถานะ และ Progress จากข้อมูลจริง
├─ src/lib/reports.ts          ส่งออก CSV (UTF-8 BOM) และรูปแบบการพิมพ์
├─ src/pages/                  Dashboard, Management (จัดการนักกีฬา), Reports, Login
└─ src/components/             Modal จัดตัวนักกีฬา, รายละเอียดสมาชิก, รายชื่อกีฬา, UI พื้นฐาน
```

## 6. แก้ปัญหาที่พบบ่อย

| อาการ | วิธีแก้ |
|---|---|
| ยังขึ้นแถบ "โหมด Demo" ทั้งที่ใส่ .env แล้ว | ชื่อไฟล์ต้องเป็น `.env.local` อยู่ในโฟลเดอร์ `sports-day-yellow` และต้องหยุด/รัน `npm run dev` ใหม่ (บน Vercel ต้อง Redeploy) |
| "อีเมลหรือรหัสผ่านไม่ถูกต้อง" | ตรวจว่าสร้าง user ใน Supabase แล้วและติ๊ก Auto Confirm |
| "กรุณาเข้าสู่ระบบก่อนบันทึกข้อมูล" | Session หมดอายุ — ออกจากระบบแล้วเข้าใหม่ |
| เครื่องอื่นไม่อัปเดตเอง | ตรวจว่ารัน schema.sql ครบ (ส่วน realtime) หรือกดปุ่ม Refresh |
| เปิด CSV ใน Excel แล้วภาษาไทยเพี้ยน | ใช้ไฟล์ที่ดาวน์โหลดจากระบบโดยตรง (มี UTF-8 BOM) ห้ามเปิดแล้ว Save ทับด้วยโปรแกรมอื่นก่อน |
