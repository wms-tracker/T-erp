// ===================================================================
// data-service.js — Warehouse Control Tower: Data/Business-logic layer
// UI (warehouse-control-tower.html) เรียกเฉพาะฟังก์ชันในไฟล์นี้ ไม่แตะ demo-data.js ตรง ๆ
// เพื่อสลับไปใช้ข้อมูลจริง (Firestore / REST API / Google Sheets) ภายหลัง ให้แก้เฉพาะ "SOURCE ADAPTER"
// ด้านล่างนี้ (loadRawDataset) ให้ return โครงสร้างเดียวกับ buildDataset() — ไม่ต้องแก้ UI เลย
// ===================================================================
import {
  buildDataset, tickDataset, DEPARTMENTS, EMPLOYEE_TYPES, EMPLOYEE_TYPE_LABEL, SHIFTS,
  WAREHOUSES, CHANNELS, CARRIERS, OUTBOUND_STATUSES, OUTBOUND_STATUS_LABEL,
  INBOUND_STATUSES, INBOUND_STATUS_LABEL, ACCIDENT_SEVERITIES, ACCIDENT_SEVERITY_LABEL, ACCIDENT_STATUSES,
  ACCIDENT_TYPES,
} from './demo-data.js';

export {
  DEPARTMENTS, EMPLOYEE_TYPES, EMPLOYEE_TYPE_LABEL, SHIFTS, WAREHOUSES, CHANNELS, CARRIERS,
  OUTBOUND_STATUSES, OUTBOUND_STATUS_LABEL, INBOUND_STATUSES, INBOUND_STATUS_LABEL,
  ACCIDENT_SEVERITIES, ACCIDENT_SEVERITY_LABEL, ACCIDENT_STATUSES, ACCIDENT_TYPES,
};

// ===================== SOURCE ADAPTER (จุดสลับ Data Source) =====================
// พยายามโหลดข้อมูลจริงจาก Firestore ก่อนเสมอ (แต่ละแผนกกรอกผ่าน control-tower-entry.html) —
// ถ้ายังไม่มีข้อมูลจริงเลยสักแถว (deployment ใหม่) หรือดึงไม่สำเร็จ (ไม่ได้ login/ไม่มีสิทธิ์อ่าน) จะ fallback
// ไปใช้ demo data พร้อมตั้ง isDemo:true ให้ UI แสดง banner เตือนชัดเจนว่าไม่ใช่ข้อมูลจริง (ดู README ข้อ 4)
let _dataset = null;
export let isDemoMode = true;
async function loadRawDataset() {
  try {
    const { loadFromFirestore } = await import('./firestore-source.js');
    const real = await loadFromFirestore(new Date());
    const hasAnyRealData = Object.keys(real.dailyOutbound).length || Object.keys(real.dailyInbound).length
      || Object.keys(real.attendanceHistory).length || real.accidents.length;
    if (hasAnyRealData) { isDemoMode = false; return real; }
  } catch (err) {
    console.warn('[control-tower] โหลดข้อมูลจริงจาก Firestore ไม่สำเร็จ — ใช้ demo data แทน:', err.message);
  }
  isDemoMode = true;
  return buildDataset(new Date());
}
export async function initDataService() {
  _dataset = await loadRawDataset();
  return _dataset;
}
export async function refreshDataService() {
  if (!_dataset) return initDataService();
  if (isDemoMode) {
    // DEMO ADAPTER: จำลองข้อมูลเรียลไทม์ขยับไปข้างหน้า (มีแต่โหมด demo เท่านั้นที่ต้องจำลอง — โหมดจริงโหลดใหม่ตรง ๆ)
    tickDataset(_dataset);
    return _dataset;
  }
  _dataset = await loadRawDataset();
  return _dataset;
}
export function getDataset() { return _dataset; }
// ===================================================================================

function inRange(dateVal, from, to) {
  const t = new Date(dateVal).getTime();
  return t >= from.getTime() && t <= to.getTime();
}

/** ช่วงเวลาตาม preset: today | yesterday | month | year | custom({from,to}) */
export function resolveRange(preset, now = new Date(), custom = null) {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  if (preset === 'today') return { from: start, to: end, days: 1 };
  if (preset === 'yesterday') {
    const y0 = new Date(start); y0.setDate(y0.getDate() - 1);
    const y1 = new Date(end); y1.setDate(y1.getDate() - 1);
    return { from: y0, to: y1, days: 1 };
  }
  if (preset === 'month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from, to: end, days: now.getDate() };
  }
  if (preset === 'year') {
    const from = new Date(now.getFullYear(), 0, 1);
    const days = Math.floor((end - from) / 86400000) + 1;
    return { from, to: end, days };
  }
  if (preset === 'custom' && custom) {
    const from = new Date(custom.from); from.setHours(0, 0, 0, 0);
    const to = new Date(custom.to); to.setHours(23, 59, 59, 999);
    const days = Math.max(1, Math.round((to - from) / 86400000) + 1);
    return { from, to, days };
  }
  return { from: start, to: end, days: 1 };
}

// ห้ามใช้ toISOString().slice(0,10) กับวันที่ล้วน ๆ — มันแปลงเป็น UTC ก่อน ทำให้วันที่ "เลื่อน" ไป 1 วัน
// สำหรับ timezone ที่ไม่ใช่ UTC (เช่น ไทย UTC+7 เที่ยงคืนท้องถิ่นจะกลายเป็นเมื่อวานตาม UTC) ต้องใช้ค่า local เสมอ
// เพื่อให้ date-key ตรงกับ dateStr() ใน demo-data.js/firestore-source.js ที่ใช้ local date components เหมือนกัน
function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dateKeysInRange(range) {
  const keys = [];
  let d = new Date(range.from); d.setHours(0, 0, 0, 0);
  const end = new Date(range.to);
  while (d <= end) { keys.push(localDateStr(d)); d.setDate(d.getDate() + 1); }
  return keys;
}

function applyCommonFilters(rows, filters, dateField) {
  return rows.filter(r => {
    if (filters.warehouse && filters.warehouse !== 'ALL' && r.warehouse !== filters.warehouse) return false;
    if (filters.department && filters.department !== 'ALL' && r.department && r.department !== filters.department) return false;
    if (filters.shift && filters.shift !== 'ALL' && r.shift && r.shift !== filters.shift) return false;
    if (filters.channel && filters.channel !== 'ALL' && r.channel && r.channel !== filters.channel) return false;
    if (filters.carrier && filters.carrier !== 'ALL' && r.carrier && r.carrier !== filters.carrier) return false;
    if (filters.employeeType && filters.employeeType !== 'ALL' && r.employee_type && r.employee_type !== filters.employeeType) return false;
    if (filters.status && filters.status !== 'ALL' && r.status && r.status !== filters.status) return false;
    if (dateField && filters.range && !inRange(r[dateField], filters.range.from, filters.range.to)) return false;
    return true;
  });
}

// ===================== OUTBOUND =====================
// ตัวเลขที่แต่ละแผนกกรอก (Total/Picked/QC/Shipped/Cancelled) เป็น "ยอดสะสม" ต่อวัน ไม่ใช่ bucket แยกกัน
// (เช่น Picked = ออเดอร์ที่หยิบไปแล้วทั้งหมด รวมที่ผ่าน QC/Ship ไปแล้วด้วย) — Pending คำนวณเป็นส่วนที่เหลือ
export function getOutboundKPIs(filters) {
  const ds = _dataset; const keys = dateKeysInRange(filters.range);
  let total = 0, picked = 0, qc = 0, shipped = 0, cancelled = 0, qty = 0, targetSum = 0;
  for (const k of keys) {
    const day = ds.dailyOutbound[k];
    if (!day) continue;
    targetSum += day.target || 0;
    total += day.total || 0; qty += day.qty || 0;
    picked += day.picked || 0; qc += day.qc || 0; shipped += day.shipped || 0; cancelled += day.cancelled || 0;
  }
  // ถ้ามี filter ระดับแถว (warehouse/channel/carrier/shift/status) ให้คำนวณจาก order-level detail แทน (เฉพาะช่วงที่มี detail — โหมด demo)
  const hasRowFilters = ['warehouse', 'channel', 'carrier', 'shift', 'status'].some(f => filters[f] && filters[f] !== 'ALL');
  if (hasRowFilters) {
    const rows = applyCommonFilters(ds.outboundDetail, { ...filters }, 'created_at');
    const count = s => rows.filter(r => r.status === s).length;
    total = rows.length; qty = rows.reduce((s, r) => s + r.quantity, 0);
    const pickedC = count('PICKED'), qcC = count('QC'), shippedC = count('SHIPPED');
    picked = pickedC + qcC + shippedC; qc = qcC + shippedC; shipped = shippedC; cancelled = count('CANCELLED');
  }
  const pending = Math.max(0, total - picked - cancelled);
  const buckets = { PENDING: pending, PICKED: Math.max(0, picked - qc), QC: Math.max(0, qc - shipped), SHIPPED: shipped, CANCELLED: cancelled };
  const progressPct = total > 0 ? (picked / total) * 100 : 0;
  const achievedPct = targetSum > 0 ? (shipped / targetSum) * 100 : 0;
  return { total, picked, qc, shipped, cancelled, pending, qty, target: targetSum, buckets, progressPct, achievedPct };
}

export function getOutboundHourly(filters) {
  const ds = _dataset;
  return filters.dayPreset === 'yesterday' ? ds.hourlyOutboundYesterday : ds.hourlyOutboundToday;
}

export function getOutboundTrend(filters) {
  const ds = _dataset; const keys = dateKeysInRange(filters.range);
  return keys.map(k => ({ date: k, ...(ds.dailyOutbound[k] || { total: 0, target: 0, picked: 0, qc: 0, shipped: 0, cancelled: 0 }) }));
}

export function listOutboundOrders(filters, opts = {}) {
  const ds = _dataset;
  let rows = applyCommonFilters(ds.outboundDetail, filters, 'created_at');
  const withinDetail = dateKeysInRange(filters.range).some(k => rows.some(r => r.created_at.startsWith(k))) || rows.length > 0;
  return paginate(rows, opts, ['order_id', 'sku', 'product', 'channel', 'carrier', 'employee']);
}

// ===================== INBOUND =====================
// ตัวเลขที่แผนก Inbound กรอก (Total/Arrived/Unloaded/PutAway) นับเป็น "ตู้/รถ" ไม่ใช่รายการ/SKU และเป็นยอดสะสม
// เหมือน Outbound (Arrived = ตู้ที่มาถึงแล้วทั้งหมด รวมที่ลง/จัดเก็บไปแล้วด้วย) — Pending คำนวณเป็นส่วนที่เหลือ
export function getInboundKPIs(filters) {
  const ds = _dataset; const keys = dateKeysInRange(filters.range);
  let total = 0, arrived = 0, unloaded = 0, putaway = 0, targetSum = 0;
  for (const k of keys) {
    const day = ds.dailyInbound[k];
    if (!day) continue;
    targetSum += day.target || 0;
    total += day.total || 0; arrived += day.arrived || 0; unloaded += day.unloaded || 0; putaway += day.putaway || 0;
  }
  const hasRowFilters = ['warehouse', 'status'].some(f => filters[f] && filters[f] !== 'ALL');
  if (hasRowFilters) {
    const rows = applyCommonFilters(ds.inboundDetail, filters, 'scheduled_at');
    const count = s => rows.filter(r => r.status === s).length;
    total = rows.length;
    const arrivedC = count('ARRIVED'), unloadedC = count('UNLOADED'), storedC = count('STORED');
    arrived = arrivedC + unloadedC + storedC; unloaded = unloadedC + storedC; putaway = storedC;
  }
  const pending = Math.max(0, total - arrived);
  const buckets = { PENDING: pending, ARRIVED: Math.max(0, arrived - unloaded), UNLOADED: Math.max(0, unloaded - putaway), STORED: putaway };
  const achievedPct = targetSum > 0 ? (putaway / targetSum) * 100 : 0;
  return { total, arrived, unloaded, putaway, pending, target: targetSum, buckets, achievedPct };
}

// แนวโน้มย้อนหลังแบบ rolling window (ไม่ผูกกับ range ที่เลือกบน Filter bar — เพื่อให้เห็นเทรนด์เสมอแม้เลือก "วันนี้")
export function getInboundTrend(filters, days = 30) {
  const ds = _dataset;
  const base = new Date(); base.setHours(0, 0, 0, 0);
  const keys = [];
  for (let i = days - 1; i >= 0; i--) { const d = new Date(base); d.setDate(d.getDate() - i); keys.push(localDateStr(d)); }
  return keys.map(k => ({ date: k, ...(ds.dailyInbound[k] || { total: 0, target: 0, arrived: 0, unloaded: 0, putaway: 0 }) }));
}

export function listInboundOrders(filters, opts = {}) {
  const ds = _dataset;
  const rows = applyCommonFilters(ds.inboundDetail, filters, 'scheduled_at');
  return paginate(rows, opts, ['container_no', 'supplier', 'carrier']);
}

// ===================== MANPOWER =====================
// Manpower เป็น "snapshot ราย วัน" (จำนวนคนวันนี้) ไม่ใช่ยอดสะสมแบบ Outbound/Inbound — จึงอ่านจาก
// attendanceHistory ของวันล่าสุดที่มีข้อมูลในช่วงที่เลือก แทนการ sum ข้ามวัน ใช้ได้ทั้งโหมด demo (มี employees[]
// ประกอบ attendanceHistory ของวันนี้ให้เอง) และโหมดข้อมูลจริงที่แต่ละแผนกกรอกสรุปรายวันเข้า attendanceHistory ตรง ๆ
function latestSnapshotKey(range) {
  const ds = _dataset;
  const keys = dateKeysInRange(range).filter(k => ds.attendanceHistory[k]);
  return keys.length ? keys[keys.length - 1] : ds.todayKey;
}
const EMPTY_DEPT_SNAPSHOT = { total: 0, regular: 0, outsourceRegular: 0, outsourceExtra: 0, present: 0, absent: 0, leave: 0, late: 0, ot: 0 };

export function getManpowerByDepartment(filters) {
  const ds = _dataset;
  const key = latestSnapshotKey(filters.range);
  const snap = ds.attendanceHistory[key] || {};
  return DEPARTMENTS
    .map(d => ({ department: d.code, label: d.label, ...EMPTY_DEPT_SNAPSHOT, ...(snap[d.code] || {}) }))
    .filter(d => !filters.department || filters.department === 'ALL' || d.department === filters.department);
}

export function getManpowerKPIs(filters) {
  const rows = getManpowerByDepartment(filters);
  const total = rows.reduce((s, r) => s + r.total, 0);
  const present = rows.reduce((s, r) => s + r.present, 0);
  const byType = {
    REGULAR: rows.reduce((s, r) => s + r.regular, 0),
    OUTSOURCE_REGULAR: rows.reduce((s, r) => s + r.outsourceRegular, 0),
    OUTSOURCE_EXTRA: rows.reduce((s, r) => s + r.outsourceExtra, 0),
  };
  return { total, byType, present, availabilityPct: total ? (present / total) * 100 : 0 };
}

export function listEmployees(filters, opts = {}) {
  const ds = _dataset;
  const rows = applyCommonFilters(ds.employees, filters, null).filter(e => e.status === 'ACTIVE');
  return paginate(rows, opts, ['employee_code', 'name', 'department']);
}

export function getAttendanceTrend(filters, days = 7) {
  const ds = _dataset;
  const keys = [];
  const base = new Date(); base.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) { const d = new Date(base); d.setDate(d.getDate() - i); keys.push(localDateStr(d)); }
  return keys.map(k => {
    const perDept = ds.attendanceHistory[k] || {};
    const dep = filters.department && filters.department !== 'ALL' ? [filters.department] : DEPARTMENTS.map(d => d.code);
    const agg = { date: k, present: 0, absent: 0, leave: 0, late: 0, ot: 0 };
    for (const code of dep) {
      const v = perDept[code]; if (!v) continue;
      agg.present += v.present; agg.absent += v.absent; agg.leave += v.leave; agg.late += v.late; agg.ot += v.ot;
    }
    return agg;
  });
}

// ===================== ACCIDENTS / SAFETY =====================
export function getAccidentKPIs(filters) {
  const ds = _dataset;
  const rows = applyCommonFilters(ds.accidents.map(a => ({ ...a, created_at: a.date })), filters, filters.range ? 'created_at' : null);
  const bySeverity = Object.fromEntries(ACCIDENT_SEVERITIES.map(s => [s, rows.filter(a => a.severity === s).length]));
  const openCount = rows.filter(a => a.status !== 'Closed').length;
  const openBySeverity = Object.fromEntries(ACCIDENT_SEVERITIES.map(s => [s, rows.filter(a => a.severity === s && a.status !== 'Closed').length]));
  const yearRows = ds.accidents.filter(a => new Date(a.date).getFullYear() === new Date().getFullYear());
  return { total: rows.length, bySeverity, openCount, openBySeverity, yearTotal: yearRows.length, daysWithoutAccident: computeDaysWithoutAccident(ds.accidents) };
}

function computeDaysWithoutAccident(accidents) {
  if (!accidents.length) return 9999;
  const last = accidents.reduce((max, a) => Math.max(max, new Date(a.date).getTime()), 0);
  return Math.max(0, Math.floor((Date.now() - last) / 86400000));
}

export function getAccidentMonthly(filters, year = new Date().getFullYear()) {
  const ds = _dataset;
  const months = Array.from({ length: 12 }, (_, i) => ({ month: i, accident: 0, nearMiss: 0, propertyDamage: 0, total: 0 }));
  for (const a of ds.accidents) {
    const d = new Date(a.date);
    if (d.getFullYear() !== year) continue;
    if (filters.department && filters.department !== 'ALL' && a.department !== filters.department) continue;
    const m = months[d.getMonth()];
    m.total++;
    if (a.severity === 'NEAR_MISS') m.nearMiss++;
    else if (a.severity === 'PROPERTY_DAMAGE') m.propertyDamage++;
    else m.accident++;
  }
  return months;
}

export function listAccidents(filters, opts = {}) {
  const ds = _dataset;
  let rows = ds.accidents.map(a => ({ ...a, created_at: a.date }));
  rows = applyCommonFilters(rows, filters, filters.range ? 'created_at' : null);
  if (filters.severity && filters.severity !== 'ALL') rows = rows.filter(a => a.severity === filters.severity);
  return paginate(rows, opts, ['accident_no', 'employee', 'department', 'type', 'location']);
}

// ===================== HEALTH STATUS + ALERTS (Rule-based, threshold แก้ได้ใน Settings) =====================
// ค่าเริ่มต้น — ปรับได้ที่หน้า Settings (⚙️) ในแดชบอร์ด อ้างอิงจากผลงานเฉลี่ยของข้อมูลตัวอย่าง
// achievedPct ของ Outbound/Inbound คือ "ยอดที่ปิดงานจริงแล้ว" เทียบกับเป้าทั้งวัน (ไม่ใช่ % ความคืบหน้า ดู progressPct แยกต่างหาก)
export const DEFAULT_THRESHOLDS = {
  outboundWarningPct: 70, outboundCriticalPct: 45,
  inboundWarningPct: 55, inboundCriticalPct: 30,
  manpowerWarningPct: 90, manpowerCriticalPct: 75,
  pendingAlertRatio: 0.10, // % ของ total ที่ pending เกินแล้วถือว่าต้องเตือน
};

export function computeHealthStatus(kpis, thresholds) {
  const { outbound, inbound, manpower, safety } = kpis;
  const reasons = [];
  let level = 'NORMAL';
  const bump = (lvl, reason) => {
    reasons.push(reason);
    if (lvl === 'CRITICAL') level = 'CRITICAL';
    else if (lvl === 'WARNING' && level !== 'CRITICAL') level = 'WARNING';
  };
  if (safety.openBySeverity.FATALITY > 0) bump('CRITICAL', 'มีเหตุการณ์ระดับ Fatality ที่ยังไม่ปิด');
  if (safety.openBySeverity.LTI > 0) bump('CRITICAL', 'มี Lost Time Injury ที่ยังไม่ปิด');
  if (outbound.achievedPct < thresholds.outboundCriticalPct) bump('CRITICAL', `Outbound ต่ำกว่าเป้า Critical (${outbound.achievedPct.toFixed(0)}%)`);
  else if (outbound.achievedPct < thresholds.outboundWarningPct) bump('WARNING', `Outbound ต่ำกว่าเป้า (${outbound.achievedPct.toFixed(0)}%)`);
  if (inbound.achievedPct < thresholds.inboundCriticalPct) bump('CRITICAL', `Inbound ต่ำกว่าเป้า Critical (${inbound.achievedPct.toFixed(0)}%)`);
  else if (inbound.achievedPct < thresholds.inboundWarningPct) bump('WARNING', `Inbound ต่ำกว่าเป้า (${inbound.achievedPct.toFixed(0)}%)`);
  if (manpower.availabilityPct < thresholds.manpowerCriticalPct) bump('CRITICAL', `กำลังคนต่ำกว่าเกณฑ์ Critical (${manpower.availabilityPct.toFixed(0)}%)`);
  else if (manpower.availabilityPct < thresholds.manpowerWarningPct) bump('WARNING', `กำลังคนต่ำกว่าเกณฑ์ (${manpower.availabilityPct.toFixed(0)}%)`);
  if (safety.openCount > 0) bump('WARNING', `มีรายงานอุบัติเหตุที่ยังไม่ปิด ${safety.openCount} รายการ`);
  return { level, reasons };
}

export function getAlerts(kpis, thresholds) {
  const { outbound, inbound, manpower, safety } = kpis;
  const alerts = [];
  if (outbound.buckets.PENDING > outbound.total * thresholds.pendingAlertRatio && outbound.total > 0) {
    alerts.push({ level: 'CRITICAL', text: `Outbound Pending สูงกว่าเป้า (${outbound.buckets.PENDING.toLocaleString('th-TH')} รายการ)`, target: 'outbound-status', filter: { status: 'PENDING' } });
  }
  if (inbound.pending > 0 && inbound.achievedPct < thresholds.inboundWarningPct) {
    alerts.push({ level: 'WARNING', text: `Inbound มีตู้ที่ยังไม่เข้า ${inbound.pending.toLocaleString('th-TH')} ตู้ ล่าช้ากว่าเป้าที่ตั้งไว้`, target: 'inbound-status', filter: { status: 'PENDING' } });
  }
  const shortage = manpower.total - manpower.present;
  if (shortage > 0 && manpower.availabilityPct < thresholds.manpowerWarningPct) {
    alerts.push({ level: manpower.availabilityPct < thresholds.manpowerCriticalPct ? 'CRITICAL' : 'WARNING', text: `Manpower ขาด ${shortage.toLocaleString('th-TH')} คน`, target: 'manpower-dept' });
  }
  if (safety.openCount > 0) {
    alerts.push({ level: 'WARNING', text: `มี Accident ที่ยังไม่ปิด ${safety.openCount} รายการ`, target: 'accident-list', filter: { openOnly: true } });
  }
  if (safety.openBySeverity.FATALITY > 0) {
    alerts.push({ level: 'CRITICAL', text: 'มีเหตุการณ์ระดับ Fatality ที่ยังไม่ปิด — ต้องดำเนินการทันที', target: 'accident-list' });
  }
  if (!alerts.length) alerts.push({ level: 'NORMAL', text: 'ไม่มี Critical Issue', target: null });
  return alerts.sort((a, b) => rank(b.level) - rank(a.level));
}
function rank(level) { return { CRITICAL: 3, WARNING: 2, NORMAL: 1 }[level] || 0; }

// ===================== Table helper: search + sort + pagination =====================
export function paginate(rows, opts, searchFields = []) {
  let out = rows;
  if (opts.search) {
    const q = opts.search.toLowerCase();
    out = out.filter(r => searchFields.some(f => String(r[f] ?? '').toLowerCase().includes(q)));
  }
  if (opts.sort) {
    const { field, dir } = opts.sort;
    out = [...out].sort((a, b) => {
      const av = a[field], bv = b[field];
      if (av == null && bv == null) return 0;
      if (av == null) return 1; if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return dir === 'asc' ? av - bv : bv - av;
      return dir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
  }
  const total = out.length;
  const pageSize = opts.pageSize || 25;
  const page = Math.max(1, opts.page || 1);
  const start = (page - 1) * pageSize;
  const pageRows = out.slice(start, start + pageSize);
  return { rows: pageRows, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
