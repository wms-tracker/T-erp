// ===================================================================
// firestore-source.js — โหลด "ข้อมูลจริง" จาก Firestore มาประกอบเป็น shape เดียวกับ demo-data.js#buildDataset()
// เรียกใช้จาก data-service.js#loadRawDataset() เท่านั้น — UI ไม่รู้จักไฟล์นี้เลย
//
// คอลเลกชันที่ใช้ (เขียนโดยแต่ละแผนกผ่าน control-tower-entry.html):
//   wctOutboundDaily/{date}_{warehouse}   — สรุปยอด Outbound ต่อวันต่อคลัง (กรอกโดยแผนก OB)
//   wctInboundDaily/{date}_{warehouse}    — สรุปยอด Inbound ต่อวันต่อคลัง (กรอกโดยแผนก IB)
//   wctTransportDaily/{date}_{warehouse}  — สรุปรถ/จุดส่งต่อวันต่อคลัง (กรอกโดยแผนก TS)
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

// จับ error รายคอลเลกชัน ไม่ให้คอลเลกชันเดียวที่อ่านไม่ได้ (เช่น ยังไม่ publish security rules ของคอลเลกชันใหม่)
// ทำให้ข้อมูลจริงของคอลเลกชันอื่นที่อ่านได้ปกติ หายไปด้วย (เดิมใช้ Promise.all ซึ่ง fail-fast ทั้งชุด)
async function fetchSince(colName, sinceDate) {
  try {
    const q = query(collection(db, colName), where('date', '>=', dateStr(sinceDate)), orderBy('date', 'asc'), limit(5000));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn(`[control-tower] อ่าน ${colName} ไม่สำเร็จ (ข้ามไปก่อน):`, err.message);
    return [];
  }
}

// Outbound เป็นยอดสะสมรายวัน (Total/Picked/QC/Shipped/Cancelled) ที่แผนก OB กรอกตรง ๆ — รวมข้ามคลังด้วยการบวกตรง ๆ
function mergeDailyOutbound(rows) {
  const out = {};
  for (const r of rows) {
    const cur = out[r.date] || { date: r.date, total: 0, qty: 0, target: 0, picked: 0, qc: 0, shipped: 0, cancelled: 0 };
    cur.target += Number(r.target) || 0;
    cur.qty += Number(r.qty) || 0;
    cur.total += Number(r.total) || 0;
    cur.picked += Number(r.picked) || 0;
    cur.qc += Number(r.qc) || 0;
    cur.shipped += Number(r.shipped) || 0;
    cur.cancelled += Number(r.cancelled) || 0;
    out[r.date] = cur;
  }
  return out;
}
// Inbound เป็นยอดสะสมรายวัน (Total/Arrived/Unloaded/PutAway) นับเป็น "ตู้/รถ" ที่แผนก IB กรอกตรง ๆ
function mergeDailyInbound(rows) {
  const out = {};
  for (const r of rows) {
    const cur = out[r.date] || { date: r.date, total: 0, target: 0, arrived: 0, unloaded: 0, putaway: 0 };
    cur.target += Number(r.target) || 0;
    cur.total += Number(r.total) || 0;
    cur.arrived += Number(r.arrived) || 0;
    cur.unloaded += Number(r.unloaded) || 0;
    cur.putaway += Number(r.putaway) || 0;
    out[r.date] = cur;
  }
  return out;
}
// Transportation เป็นยอดสะสมรายวัน (รถบริษัท/รถ Outsource/จุดส่ง/ส่งสำเร็จ) ที่แผนก TS กรอกตรง ๆ
function mergeDailyTransport(rows) {
  const out = {};
  for (const r of rows) {
    const cur = out[r.date] || { date: r.date, target: 0, companyVehicles: 0, outsourceVehicles: 0, deliveryPoints: 0, delivered: 0 };
    cur.target += Number(r.target) || 0;
    cur.companyVehicles += Number(r.companyVehicles) || 0;
    cur.outsourceVehicles += Number(r.outsourceVehicles) || 0;
    cur.deliveryPoints += Number(r.deliveryPoints) || 0;
    cur.delivered += Number(r.delivered) || 0;
    out[r.date] = cur;
  }
  return out;
}
function mergeAttendance(rows) {
  const out = {};
  for (const r of rows) {
    const perDept = out[r.date] || {};
    perDept[r.department] = {
      total: Number(r.total) || 0, regular: Number(r.regular) || 0, outsourceRegular: Number(r.outsourceRegular) || 0,
      outsourceExtra: Number(r.outsourceExtra) || 0, present: Number(r.present) || 0, absent: Number(r.absent) || 0,
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

  const [outboundRows, inboundRows, transportRows, manpowerRows, accidentRows] = await Promise.all([
    fetchSince('wctOutboundDaily', since),
    fetchSince('wctInboundDaily', since),
    fetchSince('wctTransportDaily', since),
    fetchSince('wctManpowerDaily', accidentSince), // โหลดยาวกว่าเพื่อให้ Attendance Trend/Manpower snapshot ย้อนหลังได้พอ
    fetchSince('wctAccidents', accidentSince),
  ]);

  const dailyOutbound = mergeDailyOutbound(outboundRows);
  const dailyInbound = mergeDailyInbound(inboundRows);
  const dailyTransport = mergeDailyTransport(transportRows);
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
    dailyTransport,
    hourlyOutboundToday: emptyHourly,
    hourlyOutboundYesterday: emptyHourly,
    hourlyInboundToday: emptyHourly,
    accidents,
    attendanceHistory,
    meta: { orderDetailDays: 0, dailyAggregateDays: DETAIL_DAYS, source: 'firestore' },
  };
}
