# 🚀 Deploy ขึ้นเว็บฟรี (Render) — เปิดจากมือถือได้ตลอด 24 ชม.

เป้าหมาย: ได้ลิงก์ เช่น `https://ai-predictive-engine.onrender.com`
ที่เปิดจากมือถือ/ที่ไหนก็ได้ ไม่ต้องเปิดคอม ไม่ต้องเปิดหน้าต่างดำ

ใช้เวลา ~15 นาที (ครั้งเดียวจบ)

---

## เตรียมพร้อมแล้ว ✅
ผมเตรียมไฟล์เหล่านี้ให้แล้ว:
- `package.json` — บอก Render ว่ารันด้วย `node server.js`
- `.gitignore` — กัน `START.bat` (ที่มี token) ไม่ให้ขึ้น GitHub
- `server.js` — อ่าน token จาก environment variable (ปลอดภัย)

---

## ขั้นตอน

### 1) สมัคร GitHub (ถ้ายังไม่มี)
ไปที่ https://github.com/signup — ใช้อีเมล สมัครฟรี

### 2) สร้าง repo แล้วอัปไฟล์
วิธีง่ายสุด (ไม่ต้องใช้คำสั่ง):
1. https://github.com/new → ตั้งชื่อ repo เช่น `football-predictor` → **Private** ก็ได้ → Create
2. หน้า repo → คลิก **"uploading an existing file"**
3. ลากไฟล์เหล่านี้เข้าไป (⚠️ **ห้ามอัป `START.bat`**):
   - `ai-predictive-engine.html`
   - `server.js`
   - `package.json`
   - `.gitignore`
4. กด **Commit changes**

### 3) Deploy บน Render
1. https://render.com → Sign up ด้วย GitHub (ฟรี)
2. **New +** → **Web Service**
3. เลือก repo ที่เพิ่งสร้าง → **Connect**
4. ตั้งค่า:
   - **Runtime:** Node
   - **Build Command:** (เว้นว่าง หรือ `npm install`)
   - **Start Command:** `node server.js`
   - **Instance Type:** **Free**
5. เลื่อนลงหา **Environment Variables** → **Add**:
   - **Key:** `FD_TOKEN`
   - **Value:** token ของคุณ (รหัสจาก football-data.org)
6. กด **Create Web Service** → รอ ~2-3 นาที

### 4) เสร็จ! 🎉
จะได้ลิงก์ด้านบน เช่น `https://football-predictor-xxxx.onrender.com`
เปิดในมือถือได้เลย บุ๊กมาร์กไว้ใช้ได้ตลอด

---

## ⚠️ สิ่งที่ต้องรู้
- **Cold start:** แพ็กฟรี Render จะ "หลับ" หลังไม่มีคนใช้ 15 นาที →
  เปิดครั้งแรกอาจรอ ~30-50 วิ (หน้าขาวๆ) แล้วจะเร็วปกติ — เป็นเรื่องปกติของฟรี
- **ความปลอดภัย token:** token เก่าหลุดในแชตไปแล้ว →
  แนะนำ **regenerate ใหม่** ที่ football-data.org แล้วใช้ตัวใหม่ตอนตั้ง FD_TOKEN
- **ส่วนเลขหวย** ยังเป็น entertainment — คงคำเตือนไว้

---

## อยากให้ผมช่วยขั้นไหน บอกได้
ถ้าติดขั้นตอนไหน ส่งภาพหน้าจอมา เดี๋ยวไกด์ต่อให้ครับ
