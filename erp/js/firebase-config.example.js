// ===================================================================
// ตัวอย่างไฟล์ค่าคอนฟิก Firebase
//
// วิธีใช้:
// 1. คัดลอกไฟล์นี้แล้วเปลี่ยนชื่อเป็น "firebase-config.js" (ไฟล์จริงที่ระบบจะเรียกใช้)
// 2. ไปที่ Firebase Console (console.firebase.google.com) -> โปรเจกต์ของคุณ
//    -> Project settings -> General -> "Your apps" -> เลือก Web app (หรือสร้างใหม่)
// 3. คัดลอกค่า firebaseConfig ที่ Firebase แสดงให้ มาแทนค่าด้านล่างนี้
//
// ⚠️ ห้าม commit ไฟล์ "firebase-config.js" (ที่มีค่าจริง) ขึ้น public repository
// ===================================================================

export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
