// ===================================================================
// firestore-source.js — โหลด "ข้อมูลจริง" จาก Firestore มาประกอบเป็น shape เดียวกับ demo-data.js#buildDataset()
// เรียกใช้จาก data-service.js#loadRawDataset() เท่านั้น — UI ไม่รู้จักไฟล์นี้เลย
//
// คอลเลกชันที่ใช้ (เขียนโดยแต่ละแผนกผ่าน control-tower-entry.html):
//   wctOutboundDaily/{date}_{warehouse}   — สรุปยอด Outbound ต่อวันต่อคลัง (กรอกโดยแผนก OB)
//   wctInboundDaily/{date}_{warehouse}    — สรุปยอด Inbound ต่อวันต่อคลัง (กรอกโดยแผนก IB)
//   wctManpowerDaily/{date}_{department}  — สรุปกำลังคนต่อวันต่อแผนก (กรอกโดยหัวหน้าแต่ละแผนก)
//   wctAccidents/{autoId}                 — รายงานอุบัติเหตุรายเหตุการณ์ (กรอกโดยแผนกที่เกิดเหตุ)
//
// ข้อจำกัดที่ตั้งใจไว้ (ดูเหตุผลใน README-control-tower.md หัวข้อ 4):
// - ไม่มี order-level detail (รายออเดอร์/รายชั่วโมง) เพราะเป็นการกรอกสรุปรายวัน ไม่ใช่ระบบ WMS เต็มรูปแบบ
//   -> outboundDetail/inboundDetail จะเป็น [] เสมอ, กราฟรายชั่วโมงจะว่าง, Drill-down ตาราง order จะไม่มีข้อมูล
// - dailyOutbound/dailyInbound รวมยอดทุกคลังเข้าด้วยกันต่อวัน (ตัวกรอง "คลัง" จะไม่ subfilter ตัวเลขสรุปในโหมดนี้)
// - employees[] ว่างเสมอ (ไม่มี roster รายบุคคล) — Manpower KPI คำนวณจาก attendanceHistory (สรุปรายแผนก) แทน
//   ดู getManpowerKPIs/getManpowerByDepartment ใน data-service.js ที่ออกแบบให้ทำงานได้แม้ employees[] ว่าง
// ===================================================================
import { db } from '../auth.js';
import {
  collection, query, where, orderBy, getDocs, limit,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const DETAIL_DAYS = 60;    // โหลดย้อนหลังกี่วัน (พอสำหรับ "เดือนนี้/ปีนี้" ระดับ SME — ปรับเพิ่มได้ถ้าต้องการ)
const ACCIDENT_DAYS = 400; // ครอบคลุม "ปีนี้ / ปีก่อน" สำหรับกราฟ Accident รายเดือน

function pad2(n) { return String(n).padStart(2, '0'); }
function dateStr(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function addDays(base, n) { const d = new Date(base); d.setDate(d.getDate() + n); return d; }

async function fetchSince(colName, sinceDate) {
  const q = query(collection(db, colName), where('date', '>=', dateStr(sinceDate)), orderBy('date', 'asc'), limit(5000));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

const OUTBOUND_ZERO = { PICKING: 0, PACKING: 0, QC: 0, READY: 0, SHIPPED: 0, PENDING: 0, CANCELLED: 0, ERROR: 0 };
const INBOUND_ZERO = { EXPECTED: 0, RECEIVING: 0, QC: 0, PUTAWAY: 0, COMPLETED: 0, PENDING: 0, REJECTED: 0 };

function mergeDailyOutbound(rows) {
  const out = {};
  for (const r of rows) {
    const cur = out[r.date] || { date: r.date, total: 0, qty: 0, target: 0, ...OUTBOUND_ZERO };
    cur.target += Number(r.target) || 0;
    cur.qty += Number(r.qty) || 0;
    let rowTotal = 0;
    for (const s of Object.keys(OUTBOUND_ZERO)) { const v = Number(r[s]) || 0; cur[s] += v; rowTotal += v; }
    cur.total += rowTotal;
    out[r.date] = cur;
  }
  return out;
}
function mergeDailyInbound(rows) {
  const out = {};
  for (const r of rows) {
    const cur = out[r.date] || { date: r.date, total: 0, expected_qty: 0, received_qty: 0, total_sku: 0, total_carton: 0, total_pallet: 0, target: 0, ...INBOUND_ZERO };
    cur.target += Number(r.target) || 0;
    cur.expected_qty += Number(r.expected_qty) || 0;
    cur.received_qty += Number(r.received_qty) || 0;
    cur.total_carton += Number(r.total_carton) || 0;
    cur.total_pallet += Number(r.total_pallet) || 0;
    cur.total_sku = Math.max(cur.total_sku, Number(r.total_sku) || 0); // นับซ้ำข้ามคลังได้ยาก ใช้ค่ามากสุดเป็นค่าประมาณ
    let rowTotal = 0;
    for (const s of Object.keys(INBOUND_ZERO)) { const v = Number(r[s]) || 0; cur[s] += v; rowTotal += v; }
    cur.total += rowTotal;
    out[r.date] = cur;
  }
  return out;
}
function mergeAttendance(rows) {
  const out = {};
  for (const r of rows) {
    const perDept = out[r.date] || {};
    perDept[r.department] = {
      total: Number(r.total) || 0, inHouse: Number(r.inHouse) || 0, outsource: Number(r.outsource) || 0,
      partTime: Number(r.partTime) || 0, present: Number(r.present) || 0, absent: Number(r.absent) || 0,
      leave: Number(r.leave) || 0, late: Number(r.late) || 0, ot: Number(r.ot) || 0,
    };
    out[r.date] = perDept;
  }
  return out;
}

export async function loadFromFirestore(now = new Date()) {
  const since = addDays(now, -DETAIL_DAYS);
  const accidentSince = addDays(now, -ACCIDENT_DAYS);
  const todayKey = dateStr(now);

  const [outboundRows, inboundRows, manpowerRows, accidentRows] = await Promise.all([
    fetchSince('wctOutboundDaily', since),
    fetchSince('wctInboundDaily', since),
    fetchSince('wctManpowerDaily', accidentSince), // โหลดยาวกว่าเพื่อให้ Attendance Trend/Manpower snapshot ย้อนหลังได้พอ
    fetchSince('wctAccidents', accidentSince),
  ]);

  const dailyOutbound = mergeDailyOutbound(outboundRows);
  const dailyInbound = mergeDailyInbound(inboundRows);
  const attendanceHistory = mergeAttendance(manpowerRows);

  const accidents = accidentRows.map(a => ({
    id: a.id, accident_no: a.accident_no || a.id, date: a.date, time: a.time || '', location: a.location || '',
    department: a.department, employee: a.employee || '', type: a.type || '', severity: a.severity,
    description: a.description || '', cause: a.cause || '', damage: a.damage || '-',
    corrective_action: a.corrective_action || '', responsible: a.responsible || '', status: a.status || 'Open',
    closed_date: a.closed_date || null, main_image_count: 0,
  }));

  const emptyHourly = Array.from({ length: 17 }, (_, i) => ({ hour: i + 7, created: 0, processed: 0 }));

  return {
    generatedAt: new Date().toISOString(),
    todayKey,
    employees: [],           // ไม่มี roster รายบุคคลในโหมดข้อมูลจริง (ดู comment หัวไฟล์)
    outboundDetail: [],      // ไม่มี order-level detail ในโหมดข้อมูลจริง
    inboundDetail: [],
    dailyOutbound,
    dailyInbound,
    hourlyOutboundToday: emptyHourly,
    hourlyOutboundYesterday: emptyHourly,
    hourlyInboundToday: emptyHourly,
    accidents,
    attendanceHistory,
    meta: { orderDetailDays: 0, dailyAggregateDays: DETAIL_DAYS, source: 'firestore' },
  };
}
