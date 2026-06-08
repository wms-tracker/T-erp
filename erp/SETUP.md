# คู่มือตั้งค่า Web ERP — เฟส 1 (ฐานข้อมูลกลาง + ระบบสมาชิก/สิทธิ์)

ไฟล์ในโฟลเดอร์ `erp/` คือจุดเริ่มต้นของระบบ ERP เต็มรูปแบบ
**ส่วนที่เกี่ยวกับบัญชี/ความปลอดภัยต้องทำเองตามขั้นตอนนี้** (ผมเตรียมโค้ดและไฟล์ตัวอย่างไว้ให้หมดแล้ว)

---

## ขั้นตอนที่ 1 — สร้างโปรเจกต์ Firebase
1. ไปที่ https://console.firebase.google.com → "Add project" → ตั้งชื่อโปรเจกต์
2. ในเมนูซ้าย เลือก **Build → Authentication** → กด "Get started" → เปิดใช้ "Email/Password" เป็นวิธี sign-in
3. เลือก **Build → Firestore Database** → "Create database" → เลือกโหมด "Production mode" และเลือก region ที่ใกล้ไทย (เช่น asia-southeast1)

## ขั้นตอนที่ 2 — สร้าง Web App และคัดลอก config
1. หน้าโปรเจกต์ → ไอคอนรูปเฟือง (Project settings) → แท็บ "General"
2. เลื่อนลงหา "Your apps" → กดไอคอน "</>" (Web) → ตั้งชื่อแอป → "Register app"
3. Firebase จะแสดงโค้ด `firebaseConfig = { apiKey: ..., authDomain: ..., ... }`
4. คัดลอกไฟล์ `erp/js/firebase-config.example.js` เป็น `erp/js/firebase-config.js`
   แล้ววางค่าที่ได้แทนค่า placeholder ในไฟล์นั้น

## ขั้นตอนที่ 3 — ตั้งค่า Firestore Security Rules
1. ไปที่ Firestore Database → แท็บ "Rules"
2. คัดลอกเนื้อหาทั้งหมดจากไฟล์ `erp/firestore.rules.example` ไปวางแทนของเดิม
3. กด "Publish"

> กฎเหล่านี้ทำให้: ต้อง login ก่อนถึงเข้าระบบได้, แต่ละแผนกเห็น/แก้ข้อมูลได้ตามสิทธิ์ที่กำหนดไว้ใน `SCHEMA.md`

## ขั้นตอนที่ 4 — สร้างบัญชีผู้ใช้งานคนแรก (สำหรับตัวคุณเอง = admin)
1. ไปที่ Authentication → แท็บ "Users" → "Add user"
2. กรอกอีเมลและรหัสผ่านสำหรับตัวคุณเอง → "Add user"
3. หลังสร้างเสร็จ จะเห็น **User UID** (สตริงยาวๆ) — คัดลอกเก็บไว้
4. ไปที่ Firestore Database → แท็บ "Data" → "Start collection" → ตั้งชื่อ collection ว่า `users`
5. ตั้งชื่อ Document ID = **UID ที่คัดลอกมา** แล้วเพิ่มฟิลด์ตามนี้:
   | ฟิลด์ | ชนิด | ค่า |
   |---|---|---|
   | name | string | ชื่อของคุณ |
   | email | string | อีเมลที่ใช้สมัคร |
   | role | string | `admin` |
   | department | string | แอดมิน |
   | active | boolean | `true` |
   | createdAt | string | วันที่ปัจจุบัน เช่น `2026-06-08` |
6. กด "Save"

ตอนนี้คุณจะมีบัญชี admin คนแรกที่ล็อกอินเข้าระบบได้แล้ว 🎉

## ขั้นตอนที่ 5 — เปิดใช้งานระบบ
1. เปิดไฟล์ `erp/login.html` ในเบราว์เซอร์ (หรือรันผ่าน local server เช่น `python -m http.server` แล้วเข้า `http://localhost:8000/erp/login.html`)
   - ⚠️ **สำคัญ:** หน้านี้ใช้ Firebase SDK แบบ ES module (`type="module"`) ซึ่ง**ต้องรันผ่าน http(s) เซิร์ฟเวอร์เท่านั้น** เปิดแบบดับเบิลคลิก (`file://`) จะใช้งานไม่ได้
2. ล็อกอินด้วยอีเมล/รหัสผ่านที่สร้างในขั้นตอนที่ 4
3. ระบบจะพาไปหน้า `dashboard-admin.html` โดยอัตโนมัติ (เพราะ role = admin)
4. ไปที่เมนู "👥 จัดการผู้ใช้งาน & สิทธิ์" เพื่อเพิ่มพนักงานคนอื่นๆ
   - **ขั้นตอนเพิ่มพนักงาน 1 คน:**
     a. สร้างบัญชี Auth ให้พนักงาน (Authentication → Add user) แล้วคัดลอก UID
     b. นำ UID มากรอกในฟอร์ม "เพิ่มผู้ใช้งานใหม่" พร้อมเลือก role ที่ถูกต้อง (sales/warehouse/accounting/admin/manager)
     c. ระบบจะบันทึกสิทธิ์ลง Firestore ให้อัตโนมัติ — พนักงานคนนั้นจะ login แล้วเข้าหน้าของแผนกตัวเองได้ทันที

---

## โครงสร้างไฟล์ในโฟลเดอร์นี้
```
erp/
├── login.html                  หน้าเข้าสู่ระบบ
├── dashboard-sales.html        แดชบอร์ดฝ่ายขาย (เชื่อม Firestore แล้ว — ใช้งานได้จริง)
├── dashboard-warehouse.html    แดชบอร์ดคลังสินค้า (โครงหน้า รอเฟส 2)
├── dashboard-accounting.html   แดชบอร์ดบัญชี (โครงหน้า รอเฟส 3)
├── dashboard-admin.html        แดชบอร์ดแอดมิน + จัดการผู้ใช้งาน (ใช้งานได้จริง)
├── dashboard-manager.html      แดชบอร์ดผู้บริหาร (โครงหน้า รอเฟส 4)
├── js/
│   ├── auth.js                 ระบบ login/logout/ตรวจสิทธิ์ (RBAC)
│   ├── shell.js                สร้าง sidebar/เมนูตามแผนกอัตโนมัติ
│   └── firebase-config.example.js   ตัวอย่างไฟล์ config (คัดลอกเป็น firebase-config.js แล้วใส่ค่าจริง)
├── css/erp.css                 สไตล์ภาพรวมของระบบ
├── SCHEMA.md                   โครงสร้างฐานข้อมูล (Firestore collections) ทั้งหมด
├── firestore.rules.example     กฎความปลอดภัย Firestore (คัดลอกไปวางใน Console)
└── SETUP.md                    ไฟล์นี้
```

---

## ขั้นตอนถัดไป (Roadmap)
- **เฟส 1 (ตอนนี้):** ✅ โครงสร้างฐานข้อมูล + ระบบสมาชิก/สิทธิ์ + แดชบอร์ดฝ่ายขายเชื่อม Firestore
  - ⏭ ขั้นต่อไปของเฟสนี้: แก้แอปลงออเดอร์เดิม (`index.html`) ให้บันทึกเข้า Firestore โดยตรง (จาก localStorage) เพื่อให้ทุกคนเห็นข้อมูลชุดเดียวกัน
- **เฟส 2:** โมดูลคลังสินค้าเต็มรูปแบบ (Inbound → Put Away → Stock → Picking → Packing → QC → Outbound → Cycle Count) + เชื่อมตัดสต๊อกอัตโนมัติกับออเดอร์
- **เฟส 3:** โมดูลบัญชี (ใบแจ้งหนี้/ใบกำกับภาษี/รับ-จ่ายเงิน/กระทบยอด) + เชื่อมต่อโปรแกรมบัญชีภายนอกที่คุณใช้อยู่
- **เฟส 4:** แดชบอร์ดผู้บริหาร + รายงานข้ามแผนก

> บอกได้เลยเมื่อพร้อมเริ่มขั้นต่อไป (เช่น "เชื่อมแอปลงออเดอร์เข้า Firestore" หรือ "เริ่มเฟส 2 โมดูลคลัง")
