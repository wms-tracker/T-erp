# AI Content Intelligence Team — สถาปัตยกรรมระบบ

> เอกสารออกแบบ (v0.1 MVP) — ระบบทีม AI สำหรับครีเอเตอร์/เพจข่าวภาษาไทย
> หลักการ: **ไม่สร้างข่าว ลิงก์ ตัวเลข หรือแหล่งอ้างอิงขึ้นเอง** · **ไม่โพสต์อะไรออกสู่สาธารณะ** · **Secret อยู่ฝั่งเซิร์ฟเวอร์เท่านั้น**

## 1. ภาพรวม 4 ชั้น (แยกส่วนกันตามข้อกำหนด)

```
┌──────────────────────────── Browser (public/) ────────────────────────────┐
│  UI ภาษาไทย 7 หน้า: Overview · News & Trends · Content Planner ·          │
│  Script Studio · Fact Check · Performance Analytics · Settings             │
│  เรียกเฉพาะ REST API /api/* — ไม่เคยเห็น API key                            │
└───────────────────────────────┬────────────────────────────────────────────┘
                                │ JSON over HTTP (bind 127.0.0.1)
┌───────────────────────────────▼──────── server/index.js ───────────────────┐
│  API layer: routing, validation, export CSV/JSON, audit log                │
├───────────────┬───────────────────────┬────────────────────┬───────────────┤
│ Data Ingest   │ Pipeline (กฎ/สถิติ)     │ AI Agents          │ Database      │
│ sources.js    │ pipeline.js           │ agents.js          │ db.js         │
│ RSS/Atom,     │ normalize, dedup,     │ Claude API (ถ้ามี   │ JSON file     │
│ Google News,  │ cluster, category,    │ ANTHROPIC_API_KEY) │ data/db.json  │
│ Google Trends │ verification, score   │ + fallback แบบกฎ    │ atomic write  │
└───────────────┴───────────────────────┴────────────────────┴───────────────┘
```

- **ค้นหาข้อมูล** (`sources.js`) — ดึงจากฟีดที่เข้าถึงได้จริงเท่านั้น (RSS ที่ตั้งค่าใน Settings) ไม่มีการ scrape เว็บที่ห้าม ไม่มีข้อมูลสมมุติปน
- **AI** (`agents.js`) — เรียก Claude ฝั่งเซิร์ฟเวอร์ ถ้าไม่ได้ตั้ง key ทุกฟังก์ชันมี fallback แบบกฎ และ **ติดป้ายบอกเสมอว่าผลมาจาก AI หรือจากกฎ/แม่แบบ**
- **ฐานข้อมูล** (`db.js`) — ไฟล์ JSON เดียว เขียนแบบ atomic (เขียนไฟล์ชั่วคราวแล้ว rename) เปลี่ยนเป็น SQLite/Postgres ได้ภายหลังโดยแก้ไฟล์นี้ไฟล์เดียว
- **UI** (`public/`) — vanilla JS ไม่มี build step; escape ข้อความจากฟีดทุกจุด (ป้องกัน XSS)

## 2. บทบาท AI และ Workflow

| # | บทบาท | ทำอะไรในระบบ | โหมดไม่มี API key | โหมดมี API key |
|---|---|---|---|---|
| 1 | **Content Director** | คุมรอบงาน (`runCycle`): สั่ง Hunter → Analyst → จัดอันดับ Top 10 → เสนอ 5 ประเด็น, บังคับ gate "ต้องผ่าน Fact Check + ผู้ใช้อนุมัติ" | ✅ ทำงานเต็ม (orchestration เป็นโค้ด) | เหมือนเดิม |
| 2 | **Trend Hunter** | ดึงฟีด, normalize, บันทึกลิงก์/แหล่ง/วันที่เผยแพร่/เวลาที่ค้นพบ, ตัดข่าวซ้ำ, รวมคลัสเตอร์ข่าวเดียวกันจากหลายแหล่ง | ✅ | เหมือนเดิม |
| 3 | **Trend Analyst** | ให้คะแนน 100 (5 มิติ) + เหตุผลทุกข้อ | ✅ คะแนนแบบกฎ (โปร่งใส) | ✅ วิเคราะห์ซ้ำด้วย Claude สำหรับ Top N (ติดป้าย "AI") |
| 4 | **Creative Producer** | สคริปต์แนวตั้ง 30–90 วิ: Hook 3 วิแรก, ซีน, คำบรรยาย, แคปชั่น, แฮชแท็ก, ภาพประกอบ/ตัดต่อ (เคารพลิขสิทธิ์) | ⚠️ แม่แบบจากหัวข่าวจริง (ติดป้าย "แม่แบบ ไม่ใช่ AI") | ✅ Claude เขียนจากข้อมูลข่าวที่มีเท่านั้น |
| 5 | **Fact Checker** | ตรวจกฎอัตโนมัติ (ลิงก์, วันที่, จำนวนแหล่ง, ความน่าเชื่อถือ, คำเสี่ยง, ตัวเลขในสคริปต์ที่ไม่พบในแหล่ง) + ตรวจ claim | ✅ ตรวจกฎ | ✅ + Claude แยก claim และเทียบกับข้อความต้นทาง |
| 6 | **Performance Analyst** | วิเคราะห์ยอดดู/การดูต่อ/แชร์/คอมเมนต์ เทียบค่าเฉลี่ยโพสต์ก่อนหน้า | ✅ สถิติจากข้อมูลที่ผู้ใช้กรอก/นำเข้า CSV | ✅ + สรุปข้อเสนอแนะด้วย Claude (อ้างอิงเฉพาะตัวเลขที่มี) |

### Workflow ตามขั้นตอนในโจทย์

```
[1] Hunter ดึงฟีด ─► [2] บันทึก url, publishedAt, discoveredAt (eventAt ถ้าทราบ)
 ─► [3] dedup + cluster + ระดับความน่าเชื่อถือ ─► [4] Analyst ให้คะแนน 100
 ─► [5] Director จัด Top 10 + เหตุผล ─► [6] ผู้ใช้เลือก 5 (ระบบแนะนำให้)
 ─► [7] Producer สร้างสคริปต์ ─► [8] แนะนำภาพ/ตัดต่อ (ลิขสิทธิ์)
 ─► [9] Fact Checker ─► ผู้ใช้อนุมัติ (ไม่มีการโพสต์อัตโนมัติ — export ไปโพสต์เอง)
 ─► [10] ผู้ใช้กรอก/นำเข้าผลโพสต์ ─► Performance Analyst ─► ปรับน้ำหนักคะแนนรอบถัดไป (ทำเองใน Settings)
```

สถานะคอนเทนต์: `draft → scripting → fact_check → awaiting_approval → approved → published_manual` (หรือ `rejected`)
ห้ามข้ามขั้น: อนุมัติได้เมื่อ fact check ไม่มีรายการ `fail` หรือผู้ใช้กรอกเหตุผล override (บันทึกใน audit log)

### ประชุมทีม AI อัตโนมัติ (`server/meeting.js`)

```
ชุดข้อมูล Top 15 (ข่าวจริงเท่านั้น) + ผลโพสต์จริง
 → Trend Hunter → Trend Analyst → Fact Checker → Creative Producer → Performance Analyst
   (แต่ละคนได้รับชุดข้อมูล + รายงานของทุกคนก่อนหน้า; ผลลัพธ์เป็น JSON ตาม schema)
 → Content Director (ประธาน): สรุป, ข้อขัดแย้ง + ข้อยุติ, มติ produce/hold/drop, งานที่มอบหมาย, ความเสี่ยง
 → บังคับกติกาในโค้ด: ตัด itemId ที่ไม่มีจริง, reject จาก Fact Checker → hold, produce ไม่เกิน 5
 → บันทึก db.meetings + สร้างงานร่างจากมติ produce (ยังต้อง Fact Check + มนุษย์อนุมัติ)
```
ถ้าผู้เชี่ยวชาญคนใดล้มเหลว การประชุมจะเดินต่อและบันทึกคำเตือน ถ้าทั้ง Hunter และ Analyst ล้มเหลว ประธานจะไม่ลงมติ
ตั้งเวลาประจำวันใน Settings (`meetingDailyAt`, เวลาไทย) ระบบเช็กทุกนาที และรันวันละครั้ง

## 3. การให้คะแนน (100 คะแนน)

| มิติ | เต็ม | วิธีคิดแบบกฎ |
|---|---|---|
| ความสดใหม่ | 25 | อายุข่าวจาก publishedAt: ≤3 ชม. = 25 ลดเชิงเส้นถึง 0 ที่ 72 ชม. |
| ความสำคัญ | 20 | จำนวนแหล่งข่าวที่รายงานเรื่องเดียวกัน (คลัสเตอร์) + หมวดภัยพิบัติ/สาธารณะ |
| ความสนใจผู้ชม | 25 | ตรงกับ Google Trends TH ในรอบเดียวกัน, ปริมาณค้นหาโดยประมาณ (ตามที่ Google ระบุ), คำที่ดึงความสนใจ |
| ความเหมาะกับเพจ | 15 | หมวดตรงกับหมวดหลักของเพจใน Settings; คำต้องห้ามของเพจ = 0 |
| ความปลอดภัย (ความเสี่ยงต่ำ) | 15 | หักคะแนน: คดี/ข้อกฎหมายอ่อนไหว, ความตาย/เด็ก, ข่าวลือ, แหล่งเดียว, ข้ออ้างทางการแพทย์ |

ทุกคะแนนเก็บ `reasons[]` และ `method` (`rules` หรือ `ai`) เพื่อให้ตรวจย้อนได้ ปรับน้ำหนักได้ใน Settings

## 4. โครงสร้างข้อมูล (data/db.json)

```jsonc
{
  "settings": { "pageName", "pageCategories": [], "avoidKeywords": [], "feeds": [{ "id","name","url","type":"news|trends|opinion","credibility":"high|medium|low","enabled" }], "weights": {...} },
  "items": [{                       // ข่าว/ประเด็น (1 แถว = 1 ข่าวจาก 1 แหล่ง)
    "id", "title", "summary", "url", "source", "feedId", "kind": "news|trend",
    "publishedAt",                  // วันเวลาที่แหล่งเผยแพร่ (จากฟีด)
    "eventAt",                      // วันเวลาเกิดเหตุการณ์ — null ถ้าไม่ทราบ (ผู้ใช้กรอกได้)
    "discoveredAt",                 // วันเวลาที่ระบบค้นพบ
    "category", "clusterId", "isPrimary", "relatedSources": [{ "source","url" }],
    "trafficHint",                  // เช่น "2000+" จาก Google Trends (ตามที่ Google ระบุเท่านั้น)
    "verification": "confirmed|unverified|opinion", "verificationBy": "auto|user",
    "score": { "total","freshness","importance","interest","fit","safety","method","reasons":[] },
    "status": "new|shortlisted|selected|rejected", "isMock": false
  }],
  "contents": [{ "id","itemId","title","status","platforms":["facebook","reels","tiktok","shorts"],
    "script": { "hook","durationSec","scenes":[{ "t","visual","narration","onScreenText" }],"caption","hashtags":[],"assets":[],"editingNotes","copyrightNotes","generatedBy":"ai|template" },
    "factCheck": { "status":"pass|warn|fail","checks":[],"claims":[],"checkedAt","method" },
    "approval": { "approvedAt","note","override" }, "isMock" }],
  "posts": [{ "id","contentId","platform","postedAt","views","avgWatchPct","shares","comments","likes","source":"manual|csv|mock","isMock" }],
  "runs":  [{ "id","startedAt","finishedAt","fetched","newItems","errors":[] }],
  "audit": [{ "id","at","action","entity","entityId","detail" }]
}
```

## 5. ความปลอดภัย

- `ANTHROPIC_API_KEY` อ่านจาก `.env` ฝั่งเซิร์ฟเวอร์ — `/api/status` ส่งแค่ `aiConfigured: true/false`
- เซิร์ฟเวอร์ bind `127.0.0.1` ค่าเริ่มต้น; ถ้าจะเปิดเครือข่ายต้องตั้ง `HOST` และ `ADMIN_TOKEN` (ทุกคำขอเขียนต้องส่ง header `x-admin-token`)
- จำกัดขนาด body 2MB, ตรวจ URL ฟีดเป็น http/https เท่านั้น, timeout การดึงฟีด 15 วินาที
- ข้อความจากฟีดถือเป็นข้อมูลไม่น่าเชื่อถือ: UI escape ทุกจุด, prompt ของ AI แยกข้อมูลข่าวใน `<data>` และสั่งไม่ให้ทำตามคำสั่งในข้อมูล

## 6. ขอบเขต MVP — อะไรใช้ได้จริง / ต้องตั้งค่า / ยังไม่ทำ

ดู [README.md](README.md) หัวข้อ "สถานะความสามารถ" (และหน้า Overview ของแอปแสดงแบบเดียวกัน)
