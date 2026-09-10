# โครงสร้างฐานข้อมูล Web ERP (Firestore)

ระบบนี้ออกแบบให้ใช้ **Firebase (Firestore + Authentication)** เป็นฐานข้อมูลกลาง
รองรับผู้ใช้งานพร้อมกันได้หลักร้อยคน แบ่งสิทธิ์ตามแผนก (Role-Based Access Control)

---

## 1. Collections หลัก

### `users/{uid}`
ข้อมูลผู้ใช้งานและสิทธิ์ — ผูกกับ Firebase Authentication
```json
{
  "uid": "auto จาก Firebase Auth",
  "name": "ชื่อพนักงาน",
  "email": "user@company.com",
  "role": "sales | warehouse | accounting | admin | manager",
  "department": "ฝ่ายขาย",
  "active": true,
  "createdAt": "timestamp"
}
```
**สิทธิ์ตาม role (สรุปจากที่ user ระบุ):**
| Role | เห็น/แก้ Order | เห็น/แก้ Stock | เห็น/แก้ บัญชี | จัดการผู้ใช้ |
|---|---|---|---|---|
| sales | ✅ (เฉพาะของตัวเอง + ทีม) | 👁 ดูอย่างเดียว | ❌ | ❌ |
| warehouse | 👁 ดูสถานะ | ✅ เต็มสิทธิ์ | ❌ | ❌ |
| accounting | 👁 ดูอย่างเดียว | 👁 ดูอย่างเดียว | ✅ เต็มสิทธิ์ | ❌ |
| admin | ✅ เต็มสิทธิ์ | ✅ เต็มสิทธิ์ | 👁 ดูอย่างเดียว | ✅ |
| manager | 👁 ดูทั้งหมด (รายงาน) | 👁 | 👁 | ❌ |

---

### `orders/{orderId}`
ออเดอร์ลูกค้า (ต่อยอดจากแอปลงออเดอร์ที่มีอยู่)
```json
{
  "id": "ORD-000001",
  "createdBy": "uid ของผู้สร้าง",
  "salesperson": "ชื่อ",
  "customer": { "name": "...", "phone": "...", "address": {...} },
  "items": [ { "sku": "...", "name": "...", "qty": 1, "price": 100 } ],
  "subtotal": 100, "deposit": 0, "balance": 100,
  "shipping": { "shipDate": "...", "deliveryBy": "...", "status": "..." },
  "status": "รอดำเนินการ | กำลังแพ็ค | จัดส่งแล้ว | เสร็จสิ้น | ยกเลิก",
  "stockReserved": false,
  "invoiceId": "อ้างอิงใบแจ้งหนี้ (ถ้าออกแล้ว)",
  "createdAt": "timestamp", "updatedAt": "timestamp"
}
```

### `products/{sku}`
สินค้า + สต๊อกคงเหลือ (โมดูลคลังจะอ้างอิง collection นี้)
```json
{
  "sku": "CLT-001", "name": "เสื้อยืด", "price": 250, "category": "เสื้อผ้า",
  "stockQty": 120, "reservedQty": 5, "location": "A-01-03",
  "reorderPoint": 20
}
```

### `stockMovements/{id}`
ประวัติการเคลื่อนไหวสต๊อก (Inbound, Picking, Adjustment, Cycle Count)
```json
{
  "sku": "CLT-001", "type": "inbound | picking | packing | adjustment | cycle_count",
  "qtyChange": -2, "refOrderId": "ORD-000001", "by": "uid", "note": "...",
  "createdAt": "timestamp"
}
```

### `invoices/{invoiceId}`
เอกสารฝั่งบัญชี (ใบแจ้งหนี้ / ใบกำกับภาษี)
```json
{
  "id": "INV-000001", "orderId": "ORD-000001", "type": "invoice | tax_invoice | receipt",
  "amount": 100, "vat": 7, "status": "รอชำระ | ชำระแล้ว | ค้างชำระ",
  "issuedBy": "uid", "issuedAt": "timestamp",
  "externalRef": "เลขที่อ้างอิงในโปรแกรมบัญชีภายนอก (ถ้ามีการเชื่อมต่อ)"
}
```

### `damageReports/{reportId}`
รายงานพื้นที่/ทรัพย์สินเสียหายในคลัง (Damage Area Report) — โมดูล `erp/damage-reports.js`
```json
{
  "reportNo": "DAR-20260903-001", "reportDate": "2026-09-03", "reportTime": "10:30",
  "reporterUid": "...", "reporterName": "...", "department": "คลังสินค้า",
  "zone": "Zone Outbound",
  "location": { "building": "", "floor": "", "zone": "", "area": "", "point": "", "rack": "", "note": "" },
  "damageType": "พื้น/ผนัง/เพดาน", "severity": "ต่ำ | ปานกลาง | สูง | Critical",
  "title": "...", "description": "...", "cause": "...",
  "impact": { "operations": false, "safety": false, "property": false, "details": "" },
  "responsiblePerson": "...", "responsibleDept": "...", "correctiveAction": "...",
  "estimatedCost": 0, "dueDate": "2026-09-10",
  "status": "New | รับเรื่องแล้ว | กำลังตรวจสอบ | รอดำเนินการ | กำลังซ่อม | ดำเนินการเสร็จแล้ว | ปิดรายงาน",
  "mainImageCount": 0, "beforeImageCount": 0, "afterImageCount": 0,
  "createdBy": "uid", "createdByName": "...", "createdAt": "timestamp", "updatedAt": "timestamp", "closedAt": "timestamp"
}
```
Subcollections:
- `damageReports/{id}/images/{imageId}` — `{ url, publicId, imageType: "main|before|after", caption, location, capturedAt, sequence, uploadedBy, uploadedAt }` (ไฟล์จริงอัปโหลดไปที่ **Cloudinary** ผ่าน unsigned upload preset — ไม่ใช่ Firebase Storage เพราะ Storage ต้องใช้แผน Blaze/ผูกบัตรเครดิต — ดู `erp/js/cloudinary-config.example.js`)
- `damageReports/{id}/history/{historyId}` — `{ action, field, oldValue, newValue, changedBy, changedByName, changedAt }` (audit trail)

### Freight Cost Calculator collections — โมดูล `erp/js/freight-engine.js` + `erp/js/freight-data.js`
ดูรายละเอียดสถาปัตยกรรมเต็มใน plan ที่อนุมัติไว้ (`freight-engine.js` = pure calculation engine,
`freight-data.js` = Firestore access, `freight-import*.js` = นำเข้าจาก `Shipping Price.xlsx`)

```
freightCarriers/{carrierId}          // id = รหัสสั้น เช่น "best","kex","businessIdea","nimExpress"
{
  name, active,
  pricingStrategy: "WEIGHT_ZONE_TABLE" | "SKU_ZONE_GRID" | "SKU_SIZE_CLASS",
  weightRule: "ACTUAL" | "MAX_ACTUAL_VOLUMETRIC" | "SKU_GRID" | "SIZE_CLASS",
  dimFactor, roundingRule: { mode: "NONE"|"CEIL_TO", step },
  services: [{ id, name }],           // เช่น DHL มี [{id:"parcel",...},{id:"bulky",...}]
}

freightZoneMap/{postalCode}          // id = รหัสไปรษณีย์ 5 หลัก
{
  province, region, districts: [...],
  carrierZones: { businessIdea, best, flash, kex, dhl, kerry },  // ค่า zone ต่อ carrier
  remoteAreaByCarrier: { best, dhl, kerry },                     // true = พื้นที่ห่างไกล
  zoneSource: { ... },                // "exact" (มาจากคอลัมน์ตรงของ carrier) | "derived" (คำนวณจาก BI column) | "manual"
}

freightRateCards/{id}                // ตาราง น้ำหนัก×โซน (Best/Flash/Kerry/KEX/DHL Parcel/Bulky)
{ carrierId, serviceId, zone, weightFrom, weightTo, rate, rateVersion, effectiveFrom, effectiveTo }

freightSkuRateGrids/{sku}            // Business Idea: ราคาเฉพาะ SKU × ช่วงตัวเลข × โซน
{ sku, name, type, size, weightKg, cells: [{ bracketLabel, zone, rate, rateVersion, effectiveFrom, effectiveTo }] }

freightSizeClassRates/{id}           // Nim-express: Size Class -> ราคา (คีย์ = ข้อความ label เต็ม ไม่ตัดคำ)
{ carrierId: "nimExpress", sizeClass, rate, rateVersion, effectiveFrom, effectiveTo }

freightSkuDimensions/{sku}           // ขนาด/น้ำหนักจริงต่อ SKU (รวม Product sheet + SKU NIM's sizeClass)
{ sku, name, widthCm, lengthCm, heightCm, weightKg, sizeClass }

freightSurcharges/{id}
{ carrierId, serviceId?, type, calcType: "FIXED"|"PERCENT"|"PER_KG"|"PER_SHIPMENT"|"PER_ORDER", value,
  appliesWhen?: { remoteAreaOnly, bulkyOnly }, effectiveFrom, effectiveTo }

freightCodRules/{id}
{ carrierId, percent, minFee, maxFee, effectiveFrom, effectiveTo }

freightBulkyThresholds/{carrierId_serviceId}
{ carrierId, serviceId, maxLengthCm, maxWidthCm, maxHeightCm, maxWeightKg, maxDimensionSumCm }

freightCalculations/{id}             // ผลการคำนวณที่บันทึกไว้ (ตรวจสอบย้อนหลังได้ตามสเปกข้อ 45)
{ calcNo, input, result /* ผลลัพธ์เต็มจาก calculateFreight() รวม trace[] */,
  status, confidence, totalFreight, orderId, trackingNo, carrierId,
  createdBy, createdByName, createdAt, updatedAt }
```
Subcollection: `freightCalculations/{id}/history/{historyId}` — เหมือน `damageReports/{id}/history`
ทุกประการ (`logHistory`/`listHistory` ใน `freight-data.js` คือฟังก์ชันเดียวกับของ damage-reports)

**ข้อควรทราบเรื่องความแม่นยำ**: ระบบไม่ import คอลัมน์ที่คำนวณไว้ล่วงหน้าในไฟล์ Excel ต้นฉบับ
(เช่น คอลัมน์ Dimension/MAX/Zone Cost ในชีต `Product`) เพราะไม่ทราบสูตรที่แน่ชัด — ราคาทั้งหมด
คำนวณสดจาก Rate Card + Zone + Surcharge เสมอ ตาม "ห้ามระบบเดาราคา" (กฎข้อ 15/45)

### `auditLog/{id}`
บันทึกการเปลี่ยนแปลงข้อมูลสำคัญ (ใครทำอะไร เมื่อไหร่)
```json
{ "uid": "...", "action": "update_order_status", "target": "ORD-000001",
  "before": {...}, "after": {...}, "at": "timestamp" }
```

---

## 2. แนวทาง Security Rules (สรุปแนวคิด)
- ผู้ใช้ต้อง login ก่อนถึงจะอ่าน/เขียนได้ทุก collection
- `orders`: sales เขียนได้เฉพาะออเดอร์ที่ตัวเองสร้าง / admin และ warehouse แก้สถานะที่เกี่ยวกับคลัง-จัดส่งได้ / accounting อ่านอย่างเดียว
- `products` / `stockMovements`: เขียนได้เฉพาะ warehouse และ admin
- `invoices`: เขียนได้เฉพาะ accounting และ admin
- `users`: อ่าน-เขียนได้เฉพาะ admin (ยกเว้นตัวเองอ่านข้อมูลตัวเองได้)

(โค้ด Firestore Rules ฉบับเต็มจะอยู่ในไฟล์ `firestore.rules.example`)

---

## 3. แผนการเชื่อมต่อกับโปรแกรมบัญชีภายนอก
เนื่องจากคุณแจ้งว่ามีโปรแกรมบัญชีอยู่แล้ว ขั้นตอนถัดไปคือ:
1. ระบุชื่อ/ยี่ห้อโปรแกรมบัญชีที่ใช้อยู่ (เช่น Express, FlowAccount, PEAK, SAP B1 ฯลฯ)
2. ตรวจสอบว่าโปรแกรมนั้นมี API หรือช่องทาง import/export ข้อมูล (CSV, REST API, ฯลฯ)
3. ออกแบบ "ตัวเชื่อม" (sync job) ที่ส่งข้อมูล invoice/payment จาก ERP ไปยังโปรแกรมบัญชี หรือในทางกลับกัน

> เมื่อแจ้งชื่อโปรแกรมบัญชีแล้ว จะสามารถออกแบบจุดเชื่อมต่อ (`externalRef`, sync format) ให้ตรงกับ API/รูปแบบไฟล์ของโปรแกรมนั้นได้ทันที
