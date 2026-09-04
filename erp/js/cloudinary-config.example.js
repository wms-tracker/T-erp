// ===================================================================
// ไฟล์ค่าคอนฟิก Cloudinary — ใช้โดย erp/js/damage-reports.js สำหรับอัปโหลดรูปภาพ
// (ไม่ใช้ Firebase Storage เพราะ Firebase เปลี่ยนนโยบายให้ Storage ต้องอัปเกรดเป็นแผน Blaze
//  ซึ่งต้องผูกบัตรเครดิตก่อนถึงจะเปิดใช้งานได้ — Cloudinary มี free tier ที่ไม่ต้องผูกบัตร)
//
// วิธีตั้งค่า (ทำครั้งเดียว ไม่ต้องผูกบัตรเครดิต):
//   1) สมัครฟรีที่ https://cloudinary.com/users/register/free
//   2) หลัง login จะเห็นหน้า Dashboard มีคำว่า "Cloud name" อยู่ด้านบน — คัดลอกมาใส่ด้านล่าง
//   3) ไปที่ไอคอนเฟือง (Settings) มุมบนขวา -> แท็บ "Upload" -> เลื่อนหาหัวข้อ "Upload presets"
//      -> กด "Add upload preset"
//      - Signing Mode: เปลี่ยนจาก "Signed" เป็น **"Unsigned"** (สำคัญ — ให้ฝั่งเว็บอัปโหลดตรงได้โดยไม่ต้องมี backend)
//      - Folder: ใส่ damage-reports (จำกัดไม่ให้อัปโหลดไปที่อื่นในบัญชี)
//      - กด Save แล้วคัดลอก "Upload preset name" ที่ได้มาใส่ด้านล่าง
//   4) คัดลอกไฟล์นี้เป็นชื่อ cloudinary-config.js (ในโฟลเดอร์เดียวกัน) แล้วใส่ค่าจริงแทน placeholder
//
// ⚠️ cloudName และ uploadPreset ไม่ใช่ความลับ (ถูกออกแบบให้ใช้ฝั่ง client ได้อยู่แล้ว) — commit ได้ตามปกติ
// ⚠️ ข้อจำกัด: การอัปโหลดแบบ unsigned ลบไฟล์จาก client โดยตรงไม่ได้ (ต้องมี API secret ซึ่งห้ามฝังในโค้ดหน้าเว็บ)
//    เวลาผู้ใช้ "ลบรูป" ในแอป จะลบแค่ข้อมูลอ้างอิงใน Firestore เท่านั้น ไฟล์จริงยังอยู่บน Cloudinary
//    (ไม่กระทบการใช้งาน เพราะ free tier มีพื้นที่ 25GB ให้ใช้)
// ===================================================================

export const cloudinaryConfig = {
  cloudName: "YOUR_CLOUD_NAME",
  uploadPreset: "YOUR_UNSIGNED_UPLOAD_PRESET",
};
