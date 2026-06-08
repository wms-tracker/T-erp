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
