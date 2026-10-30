# SOP Management — วิธีเปิดใช้งานบน Web ERP

โมดูล SOP (`erp/sop.html`) ใช้ฐานข้อมูล Firebase (Firestore) + Cloudinary + บัญชีผู้ใช้ ERP เดิม — **ฟรี ไม่ต้องผูกบัตร** และไม่ต้องเปิดคอมพิวเตอร์ทิ้งไว้

## ขั้นตอนที่ต้องทำเอง (ครั้งเดียว)

### 1. เผยแพร่กฎความปลอดภัย (Firestore Rules)
workflow ทั้งหมด (ผู้จัดทำอนุมัติเองไม่ได้, ฉบับที่อนุมัติแล้วห้ามแก้, ส่งกลับต้องมีเหตุผล ฯลฯ) ถูกบังคับที่กฎนี้ — **ถ้ายังไม่เผยแพร่ หน้า SOP จะขึ้นว่า "ไม่มีสิทธิ์"**

1. เปิด https://console.firebase.google.com → โปรเจกต์ **tong-erp** → Firestore Database → แท็บ **Rules**
2. ตรวจว่ากฎที่อยู่ในหน้านั้นตรงกับ `erp/firestore.rules.example` เดิม (ก่อนเพิ่ม SOP)
   - **ตรงกัน** → คัดลอกทั้งไฟล์ `erp/firestore.rules.example` ไปวางแทน แล้วกด **Publish**
   - **ไม่ตรง** (เคยแก้ใน Console โดยตรง) → คัดลอกเฉพาะส่วนตั้งแต่บรรทัด
     `// SOP Management (erp/sop.html)` จนถึงก่อน `}` สองตัวสุดท้าย ไปวางต่อท้ายกฎเดิม (ก่อน `}` สองตัวสุดท้าย) แล้ว Publish

### 2. (ถ้าจะแนบไฟล์ PDF/Word/Excel) ตรวจ Cloudinary
ไฟล์แนบอัปโหลดแบบ "raw" ผ่าน upload preset เดิมของระบบรายงาน คปอ
- Cloudinary Console → Settings → Upload → upload preset ที่ใช้อยู่ → ต้องไม่จำกัดชนิดไฟล์ไว้แค่รูปภาพ
- ถ้าเปิดไฟล์ PDF ไม่ได้: Settings → Security → เปิด **"Allow delivery of PDF and ZIP files"**

### 3. ตั้งค่าเริ่มต้นในระบบ (ล็อกอินด้วยบัญชี admin ของ ERP)
1. เปิด `sop.html` (เมนู **SOP** ด้านซ้าย) — ระบบจะสร้างแผนกเริ่มต้น OB, IB, INV, LOG, TRN ให้อัตโนมัติ
2. แท็บ **ตั้งค่า** → ชื่อบริษัท (ไทย/อังกฤษ) และโลโก้ — ใช้บนหัวกระดาษ Word/PDF
3. แท็บ **สิทธิ์ SOP** → กด "เพิ่มผู้ใช้ที่ยังไม่มีสิทธิ์ SOP ทั้งหมด" แล้วกำหนดรายคน:
   | บทบาท SOP | ทำอะไรได้ |
   |---|---|
   | Warehouse Operations Manager | อนุมัติ/ยกเลิก SOP ทุกแผนก |
   | หัวหน้าแผนก (+แผนก) | จัดทำ และตรวจสอบ SOP ของแผนกตน |
   | ผู้จัดทำ SOP (+แผนก) | สร้าง/แก้ไข SOP ของแผนกตน |
   | ผู้อ่าน | ดูเฉพาะ SOP ที่ประกาศใช้แล้ว |

   ผู้ที่ยังไม่ได้กำหนด: แอดมิน ERP = ผู้ดูแลระบบ SOP, ผู้บริหาร ERP = Manager, คนอื่น = ผู้อ่าน

## โครงสร้างไฟล์
```
erp/sop.html              หน้า SOP (อยู่ใน shell/เมนูของ ERP)
erp/sop-print.html        หน้าพิมพ์ / บันทึก PDF
erp/css/sop.css           สไตล์ (ครอบด้วย .sop ไม่ชนหน้าอื่น)
erp/js/sop/data.js        อ่าน-เขียน Firestore, สิทธิ์, อัปโหลด Cloudinary
erp/js/sop/app.js         หน้าจอทั้งหมด
erp/js/sop/export.js      สร้าง Word (.docx) / Excel (.xlsx) ในเบราว์เซอร์
erp/js/sop/diff.js        เปรียบเทียบเวอร์ชัน (รองรับภาษาไทย)
erp/firestore.rules.example  กฎความปลอดภัย (หัวข้อ "SOP Management")
erp/tests/sop/            ทดสอบโค้ดจริง + กฎจริงกับ Firebase Emulator
```
Collections ใน Firestore: `sops`, `sopVersions`, `sopLog`, `sopDepartments`, `sopMembers`, `sopSettings`

## ทดสอบในเครื่อง (ไม่แตะข้อมูลจริง)
ต้องมี Java 21 และ firebase-tools
```
cd erp/tests/sop
npm install
npm test                      # ทดสอบ workflow + กฎความปลอดภัย 20 ข้อ
node emulators.mjs            # เปิด emulator (อีกหน้าต่าง)
node seed.mjs                 # บัญชีทดสอบ *@test.local รหัส Test-1234!
```
แล้วเปิด `http://localhost:8099/erp/login.html?emulator=1` (เสิร์ฟโฟลเดอร์ repo ด้วย `python -m http.server 8099`)
พารามิเตอร์ `?emulator=1` ทำงานเฉพาะบน localhost — บน github.io ไม่มีผล
