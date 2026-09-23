# HORIZON WAREHOUSE — Control Tower

แดชบอร์ดภาพรวมคลังสินค้าแบบหน้าเดียว (One-Page Warehouse Control Tower) สำหรับผู้จัดการคลัง / Supervisor / ผู้บริหาร
ครอบคลุม Outbound, Inbound, Manpower และ Accident/Safety พร้อม Health Status, Alert Center, Drill-down, Export และ TV/Control Room Mode

**เปิดใช้งานทันที:** [`erp/warehouse-control-tower.html`](warehouse-control-tower.html) — ไม่ต้อง login/Firebase (เป็น prototype แบบ demo data ที่ต่อข้อมูลจริงได้ภายหลังโดยไม่ต้องแก้ UI)

---

## 1. โครงสร้างโค้ด (Data / Service / UI แยกกันตามสเปก)

```
erp/
├─ warehouse-control-tower.html      # UI ทั้งหมด (Components) — ดึงข้อมูลผ่าน data-service.js เท่านั้น
├─ js/control-tower/
│  ├─ demo-data.js                   # Data layer: generator ข้อมูลตัวอย่าง (แทนที่ด้วยของจริงได้ทั้งไฟล์)
│  ├─ data-service.js                # Service/Business-logic layer: filter, aggregate, health rule, alerts, pagination
│  └─ export-utils.js                # Export CSV / Excel (SheetJS) / Print PDF
└─ README-control-tower.md           # เอกสารนี้
```

- **UI (`warehouse-control-tower.html`)** เรียกใช้เฉพาะฟังก์ชันที่ export จาก `data-service.js` (เช่น `getOutboundKPIs`, `listAccidents`, `computeHealthStatus`) — ไม่เคย import `demo-data.js` ตรง ๆ และไม่มี mock data ฝังอยู่ใน UI เลย
- **Service (`data-service.js`)** คือจุดคำนวณ KPI/Progress/Health/Alert ทั้งหมด และเป็น "จุดสลับ Data Source" จุดเดียว (ดูหัวข้อ 4)
- **Data (`demo-data.js`)** คือ mock data generator ที่ seed ตามวันที่ปัจจุบัน (ข้อมูลจะคงที่ตลอดวัน เปลี่ยนทุกวันให้สมจริง) — เมื่อมี backend จริงจะไม่ใช้ไฟล์นี้อีกต่อไป

---

## 2. วิธีรัน (Prototype ด้วย Demo Data)

โปรเจกต์นี้มี static file server อยู่แล้วใน `.claude/launch.json` (Python `http.server` พอร์ต 8099) จำเป็นต้องรันผ่าน HTTP (ไม่ใช่เปิดไฟล์ตรง ๆ แบบ `file://`) เพราะหน้าเว็บใช้ ES Modules (`import`/`export`)

```bash
python -m http.server 8099
```

แล้วเปิด `http://localhost:8099/erp/warehouse-control-tower.html`

หรือรันด้วยเครื่องมืออื่นที่ serve static file ได้ เช่น `npx serve .`, IIS, Nginx ฯลฯ — ไฟล์นี้ไม่ต้องพึ่ง Node/build step ใด ๆ ทั้งสิ้น (vanilla HTML/CSS/JS)

หน้านี้ยังถูกเพิ่มเป็นเมนู "📡 Control Tower" ใน sidebar ของ Web ERP หลัก ([`erp/js/shell.js`](js/shell.js)) สำหรับ role `warehouse`, `admin`, `manager` แล้ว

---

## 3. Database Schema (ตามที่ระบุในสเปก)

Demo data ใช้ shape ตรงตามสเปกทุกฟิลด์:

| Entity | ฟิลด์หลัก |
|---|---|
| `outbound_orders` (order-level, โหมด demo เท่านั้น) | `id, order_id, sku, product, quantity, channel, carrier, status (Pending/Picked/QC/Shipped/Cancelled), created_at, picked_at, qc_at, shipped_at, warehouse, shift, employee` |
| `wctOutboundDaily` (ยอดสะสมรายวันที่แผนก Outbound กรอกจริง) | `date, warehouse, department:'OB', target, total, picked, qc, shipped, cancelled, qty` |
| `inbound_orders` (container-level, โหมด demo เท่านั้น) | `id, container_no, supplier, carrier, status (Pending/Arrived/Unloaded/Stored), scheduled_at, arrived_at, unloaded_at, putaway_at, warehouse, responsible` |
| `wctInboundDaily` (ยอดสะสมรายวัน "ตู้/รถ" ที่แผนก Inbound กรอกจริง) | `date, warehouse, department:'IB', target, total, arrived, unloaded, putaway` |
| `employees` (โหมด demo เท่านั้น — ไม่มี roster รายบุคคลจริง) | `id, employee_code, name, department, employee_type (REGULAR/OUTSOURCE_REGULAR/OUTSOURCE_EXTRA), shift, status, attendance, check_in, check_out, ot` |
| `wctManpowerDaily` (สรุปกำลังคนรายวันต่อแผนกที่กรอกจริง) | `date, department, total, regular, outsourceRegular, outsourceExtra, present, absent, leave, late, ot` |
| `accidents` | `id, accident_no, date, time, location, department, employee, type, severity, description, cause, damage, corrective_action, responsible, status, closed_date` |

**ความสอดคล้องของตัวเลข (สเปกข้อ 34):** `wctOutboundDaily` เก็บเป็น "ยอดสะสม" ตามที่แผนก Outbound กรอกจริง (`picked` = ออเดอร์ที่หยิบไปแล้วทั้งหมด รวมที่ผ่าน QC/Ship ไปแล้วด้วย ไม่ใช่ bucket แยกกัน) — `Pending = Total - Picked - Cancelled` คำนวณอัตโนมัติ ไม่ต้องกรอก (ดู `getOutboundKPIs()` ใน `data-service.js` ซึ่งยัง derive มุมมอง "สถานะปัจจุบันต่อออเดอร์" มาให้ Donut Chart ด้วย เพื่อให้ Total ยังเท่ากับผลรวมของ breakdown เสมอ) หลักการเดียวกันใช้กับ `inbound_orders` (7 สถานะ mutually-exclusive)

**Performance (สเปกข้อ 25):** เพื่อไม่โหลดข้อมูลทั้งหมดขึ้น browser โดยไม่จำเป็น demo data แบ่งเป็น 2 ชั้น:
- **Order-level detail** เก็บย้อนหลัง 14 วันล่าสุด (ใช้แสดงตาราง Drill-down / กราฟรายชั่วโมง)
- **Daily aggregate rollup** เก็บย้อนหลัง 365 วัน (ใช้คำนวณ KPI ระดับเดือน/ปี โดยไม่ต้องโหลดทุก order)

เมื่อต่อกับข้อมูลจริง แนะนำให้ backend ทำ rollup ลักษณะเดียวกัน (เช่น scheduled job สรุปยอดรายวันลง collection/table แยก) เพื่อให้ query เดือน/ปีเร็วโดยไม่สแกนข้อมูลดิบทั้งหมด

---

## 4. วิธีเปลี่ยนจาก Demo Data เป็นข้อมูลจริง (ไม่ต้องแก้ UI)

จุดสลับอยู่ที่ฟังก์ชัน **`loadRawDataset()`** ใน [`erp/js/control-tower/data-service.js`](js/control-tower/data-service.js) บรรทัดบนสุด:

```js
// ตอนนี้: ใช้ demo data ในหน่วยความจำ
async function loadRawDataset() {
  return buildDataset(new Date());
}
```

แก้เป็นตัวอย่างเช่น:

```js
async function loadRawDataset() {
  const res = await fetch('/api/warehouse/dataset');   // หรือดึงจาก Firestore/Google Sheets
  return res.json();
}
```

**เงื่อนไขเดียว**: ค่าที่ return ต้องมี shape เดียวกับที่ `buildDataset()` สร้าง (`employees[]`, `outboundDetail[]`, `inboundDetail[]`, `dailyOutbound{}`, `dailyInbound{}`, `accidents[]`, `attendanceHistory{}`, `hourlyOutboundToday[]` ฯลฯ — ดูรายละเอียด comment ในไฟล์ `demo-data.js`) เมื่อ shape ตรงกัน **ไม่ต้องแก้โค้ด UI แม้แต่บรรทัดเดียว**

ฟังก์ชัน `refreshDataService()` (เรียกตอนกด 🔄 หรือ Auto Refresh) ก็ต้องแก้ในลักษณะเดียวกัน — ตอนนี้ demo ใช้ `tickDataset()` จำลองข้อมูลขยับแบบเรียลไทม์ ของจริงให้เรียก `loadRawDataset()` ใหม่แทน

### 4.1 เชื่อมต่อ Firestore (ต่อยอดจากสคีมา ERP เดิม)
โปรเจกต์นี้มี Firestore อยู่แล้ว (ดู [`erp/SCHEMA.md`](SCHEMA.md)) แนะนำเพิ่ม collection ใหม่:
`warehouseOutboundOrders`, `warehouseInboundReceipts`, `employees` (ขยายจาก `users` เดิม), `accidentReports` (คล้าย `damageReports` ที่มีอยู่แล้ว แต่แยกเพราะเป็นเหตุการณ์ระดับ "คน" ไม่ใช่ "พื้นที่/ทรัพย์สิน") แล้วเขียน `loadRawDataset()` ให้ query ผ่าน Firebase SDK (แบบเดียวกับ `dashboard-warehouse.html`) พร้อม `where(createdAt >= startOfDay)` และทำ rollup ลง collection สรุปรายวันเพื่อ performance

### 4.2 เชื่อมต่อ REST API / ฐานข้อมูลภายนอก
เปลี่ยน `loadRawDataset()` เป็น `fetch()` ไปยัง endpoint ที่ backend ทีมคุณ implement โดย endpoint ต้อง aggregate/paginate ฝั่ง server สำหรับข้อมูลปริมาณมาก (Server-side Filtering ตามสเปกข้อ 25) แล้วปรับ `listOutboundOrders()` ฯลฯ ให้ยิง request ไป backend แทนการ filter ในหน่วยความจำ

### 4.3 เชื่อมต่อ Google Sheets
1. เปิด Google Sheet ให้เป็น public หรือใช้ Google Sheets API v4 พร้อม Service Account
2. วิธีง่ายที่สุด (read-only, ไม่ต้อง backend): Publish ชีตเป็น CSV (`File → Share → Publish to web → CSV`) แล้ว `fetch()` CSV นั้นตรง ๆ ใน `loadRawDataset()` แล้ว parse เป็น object shape ที่ต้องการ
3. วิธีที่ปลอดภัย/scale ได้กว่า: เขียน Cloud Function / small Node service ที่อ่าน Google Sheets API แล้ว expose เป็น REST endpoint ของคุณเอง (ดูข้อ 4.2) — แนะนำวิธีนี้สำหรับ production เพราะควบคุม auth/rate-limit ได้

### 4.4 Excel / CSV แบบ manual import
เพิ่มปุ่ม "Import" ที่อ่านไฟล์ผ่าน `<input type=file>` + [SheetJS](https://sheetjs.com) (โหลดผ่าน CDN แบบเดียวกับที่ `export-utils.js` ใช้อยู่แล้วสำหรับ export) แล้วเขียนผลลัพธ์ไปเก็บใน state เดียวกับที่ `data-service.js` ใช้ (`getDataset()`/`initDataService()`)

---

## 5. Role & Security (สเปกข้อ 31)

Prototype นี้มี **role selector แบบจำลอง** (Admin / Manager / Supervisor / Viewer) ใน Settings (⚙️) ที่ซ่อน/แสดงปุ่มบางส่วนใน UI เท่านั้น (client-side) — **ยังไม่ใช่ระบบสิทธิ์จริง** เพราะหน้านี้ยังไม่ผูกกับ Firebase Authentication

เมื่อต่อกับข้อมูลจริงตามข้อ 4.1 ให้ทำตามแนวทางเดียวกับหน้าอื่นของ ERP: เรียก `requireRole(['warehouse','admin','manager'])` จาก `erp/js/auth.js` ที่หัวไฟล์ (ดูตัวอย่างใน `dashboard-manager.html`) และ**บังคับสิทธิ์จริงที่ฝั่ง Firestore Security Rules / backend API เสมอ** — ห้าม rely กับการซ่อนปุ่มฝั่ง client เพียงอย่างเดียว

---

## 6. Deploy

ไฟล์ชุดนี้เป็น static assets ล้วน (ไม่มี build step) จึง deploy ได้ทุกที่ที่ serve static file ได้:

- **รวมกับ ERP เดิม**: เพราะ path เป็น relative (`./js/control-tower/...`, `./css/erp.css` ไม่ได้ใช้ในหน้านี้) แค่อัปโหลดทั้งโฟลเดอร์ `erp/` ขึ้น hosting เดิมที่ใช้อยู่ (Firebase Hosting / Nginx / IIS) ตามที่อธิบายไว้ใน [`DEPLOY.md`](../DEPLOY.md) ของโปรเจกต์หลัก
- **Firebase Hosting**: `firebase deploy --only hosting` (ถ้ามี `firebase.json` อยู่แล้วให้แน่ใจว่า public dir ครอบคลุมโฟลเดอร์ `erp/`)
- ถ้าต่อ REST API จริง (ข้อ 4.2) ให้ตั้งค่า CORS ที่ backend ให้อนุญาต origin ของหน้านี้

---

## 7. Feature Checklist (อ้างอิงสเปก QC ข้อ 35)

| Feature | สถานะ |
|---|---|
| Dashboard เปิดได้ / ไม่มี Error | ✅ |
| Responsive (Desktop 1920×1080 / Tablet / Mobile) | ✅ |
| Chart (Donut/Bar/Line แบบ SVG ไม่พึ่ง library ภายนอก) | ✅ |
| Filter (Date/Warehouse/Department/Shift/Channel/Carrier/Employee Type/Status) | ✅ |
| Search/Sort/Pagination ในทุกตาราง Drill-down | ✅ |
| Drill-down ทุก KPI/สถานะ + Detail modal (Order/Accident) | ✅ |
| Export CSV / Excel (.xlsx) / Print PDF | ✅ |
| Auto Refresh (ตั้งเวลาได้) | ✅ |
| Full Screen Mode | ✅ |
| Dark Mode / Light Mode | ✅ |
| TV / Control Room Mode (auto-rotate section) | ✅ |
| Warehouse Health (rule-based, threshold แก้ได้ใน Settings) | ✅ |
| Alert Center (คลิกเปิดรายละเอียดได้) | ✅ |
| KPI คำนวณสอดคล้องกัน (Total = ผลรวมสถานะย่อยเสมอ) | ✅ |
| Role-based UI (mock — ยังไม่ผูก Auth จริง) | ⚠️ ดูข้อ 5 |
| ข้อมูลจริงผ่าน Firestore/REST/Google Sheets | ⚠️ ดูข้อ 4 (โครงสร้างพร้อม สลับได้ทันทีโดยไม่แก้ UI) |
