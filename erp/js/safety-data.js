// safety-data.js — Firestore data layer สำหรับ KPO Safety Management System
import { db } from "./auth.js";
import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, serverTimestamp, getCountFromServer, setDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ────────────────────────────────────────────
// Collection names
// ────────────────────────────────────────────
export const COL = {
  incidents:   "safetyIncidents",
  inspections: "safetyInspections",
  capa:        "safetyCapaRecords",
  committee:   "safetyCommitteeMembers",
  meetings:    "safetyMeetings",
  training:    "safetyTraining",
  equipment:   "safetyEquipment",
  legal:       "safetyLegalRegisters",
  drills:      "safetyEmergencyDrills",
  nearMiss:    "safetyNearMiss",
};

// ────────────────────────────────────────────
// Reference data
// ────────────────────────────────────────────
export const INCIDENT_TYPES = {
  fatality:          { label: 'Fatality',              labelTh: 'เสียชีวิต',           color: '#7f1d1d', bg: '#fef2f2', severity: 5 },
  lti:               { label: 'Lost Time Injury',      labelTh: 'หยุดงาน (LTI)',       color: '#dc2626', bg: '#fee2e2', severity: 4 },
  rws:               { label: 'Restricted Work',       labelTh: 'ลดงาน (RWS)',         color: '#ea580c', bg: '#fff7ed', severity: 3 },
  mtc:               { label: 'Medical Treatment',     labelTh: 'รักษาพยาบาล (MTC)',   color: '#d97706', bg: '#fffbeb', severity: 2 },
  fac:               { label: 'First Aid Case',        labelTh: 'ปฐมพยาบาล (FAC)',     color: '#ca8a04', bg: '#fefce8', severity: 1 },
  near_miss:         { label: 'Near Miss',             labelTh: 'เฉียดอุบัติเหตุ',     color: '#2563eb', bg: '#eff6ff', severity: 0 },
  unsafe_act:        { label: 'Unsafe Act',            labelTh: 'พฤติกรรมไม่ปลอดภัย',  color: '#7c3aed', bg: '#f5f3ff', severity: 0 },
  unsafe_condition:  { label: 'Unsafe Condition',      labelTh: 'สภาพไม่ปลอดภัย',     color: '#0891b2', bg: '#ecfeff', severity: 0 },
  property_damage:   { label: 'Property Damage',       labelTh: 'ทรัพย์สินเสียหาย',   color: '#059669', bg: '#ecfdf5', severity: 1 },
  environmental:     { label: 'Environmental',         labelTh: 'สิ่งแวดล้อม',         color: '#16a34a', bg: '#f0fdf4', severity: 1 },
};

export const INCIDENT_STATUS = {
  draft:             { label: 'Draft',                 color: '#6b7280', bg: '#f9fafb' },
  submitted:         { label: 'รายงานแล้ว',             color: '#2563eb', bg: '#eff6ff' },
  investigating:     { label: 'กำลังสอบสวน',            color: '#d97706', bg: '#fffbeb' },
  pending_approval:  { label: 'รออนุมัติ',              color: '#7c3aed', bg: '#f5f3ff' },
  corrective_action: { label: 'ดำเนินการแก้ไข',        color: '#ea580c', bg: '#fff7ed' },
  closed:            { label: 'ปิดแล้ว',               color: '#16a34a', bg: '#f0fdf4' },
};

export const DEPARTMENTS = [
  'OB (Outbound)', 'IB (Inbound)', 'Inventory', 'Logistics / 3PL',
  'Transportation', 'QA', 'Maintenance', 'Office', 'Common Area'
];

export const BODY_PARTS = [
  'ศีรษะ', 'คอ', 'ไหล่', 'แขน', 'ข้อมือ', 'มือ', 'นิ้วมือ',
  'หน้าอก', 'ท้อง', 'หลัง', 'สะโพก', 'ขา', 'เข่า', 'เท้า', 'นิ้วเท้า', 'ตา', 'ใบหน้า'
];

export const INJURY_NATURES = [
  'บาดแผล/รอยถลอก', 'แผลฉีกขาด', 'กระดูกหัก', 'ข้อเคล็ด/เอ็นยืด', 'ไหม้/ลวก',
  'กระทบกระแทก', 'อนุภาคเข้าตา', 'สารเคมีถูกผิวหนัง', 'ถูกไฟฟ้า', 'อื่นๆ'
];

// ────────────────────────────────────────────
// Auto-generate Incident ID
// ────────────────────────────────────────────
export function generateIncidentId() {
  const d = new Date();
  const yr  = d.getFullYear();
  const mon = String(d.getMonth() + 1).padStart(2, '0');
  const seq = String(Math.floor(Math.random() * 9000) + 1000);
  return `INC-${yr}${mon}-${seq}`;
}

// ────────────────────────────────────────────
// Incidents
// ────────────────────────────────────────────
export async function listIncidents({ startDate, endDate, type, status, dept, lim = 200 } = {}) {
  let constraints = [orderBy('incidentDate', 'desc')];
  if (status) constraints = [where('status', '==', status), orderBy('incidentDate', 'desc')];
  const q = query(collection(db, COL.incidents), ...constraints, limit(lim));
  const snap = await getDocs(q);
  let rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (type)      rows = rows.filter(r => r.incidentType === type);
  if (dept)      rows = rows.filter(r => r.department === dept);
  if (startDate) rows = rows.filter(r => r.incidentDate >= startDate);
  if (endDate)   rows = rows.filter(r => r.incidentDate <= endDate);
  return rows;
}

export async function getIncident(id) {
  const snap = await getDoc(doc(db, COL.incidents, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createIncident(data, createdBy) {
  const incidentId = generateIncidentId();
  const payload = {
    ...data,
    incidentId,
    status: 'submitted',
    createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, COL.incidents), payload);
  return { id: ref.id, incidentId };
}

export async function updateIncident(id, data) {
  await updateDoc(doc(db, COL.incidents, id), { ...data, updatedAt: serverTimestamp() });
}

// ────────────────────────────────────────────
// KPI calculations
// ────────────────────────────────────────────
const SEVERE_TYPES = ['fatality', 'lti', 'rws', 'mtc', 'fac'];

export async function computeSafetyKPIs({ startDate, endDate } = {}) {
  const all = await listIncidents({ startDate, endDate, lim: 2000 });
  const kpi = {
    total:            0,
    fatality:         0,
    lti:              0,
    rws:              0,
    mtc:              0,
    fac:              0,
    nearMiss:         0,
    unsafeAct:        0,
    unsafeCondition:  0,
    propertyDamage:   0,
    daysWithoutAccident: null,
  };
  for (const r of all) {
    kpi.total++;
    if (r.incidentType === 'fatality')         kpi.fatality++;
    else if (r.incidentType === 'lti')         kpi.lti++;
    else if (r.incidentType === 'rws')         kpi.rws++;
    else if (r.incidentType === 'mtc')         kpi.mtc++;
    else if (r.incidentType === 'fac')         kpi.fac++;
    else if (r.incidentType === 'near_miss')   kpi.nearMiss++;
    else if (r.incidentType === 'unsafe_act')  kpi.unsafeAct++;
    else if (r.incidentType === 'unsafe_condition') kpi.unsafeCondition++;
    else if (r.incidentType === 'property_damage')  kpi.propertyDamage++;
  }
  // Days without accident — ใช้ข้อมูลทั้งหมด (ไม่กรองตามช่วงวันที่)
  const allSevere = await listIncidents({ lim: 500 });
  const lastSevereDate = allSevere
    .filter(r => SEVERE_TYPES.includes(r.incidentType) && r.incidentDate)
    .map(r => r.incidentDate)
    .sort()
    .at(-1);
  if (lastSevereDate) {
    const msPerDay = 86400000;
    kpi.daysWithoutAccident = Math.floor((Date.now() - new Date(lastSevereDate).getTime()) / msPerDay);
  } else {
    kpi.daysWithoutAccident = null;
  }
  return kpi;
}

export async function monthlyTrend(year = new Date().getFullYear()) {
  const rows = await listIncidents({ startDate: `${year}-01-01`, endDate: `${year}-12-31`, lim: 2000 });
  const MONTH_LABELS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const months = MONTH_LABELS.map(label => ({ label, accident: 0, nearMiss: 0 }));
  for (const r of rows) {
    if (!r.incidentDate) continue;
    const m = parseInt(r.incidentDate.slice(5, 7)) - 1;
    if (m < 0 || m > 11) continue;
    if (SEVERE_TYPES.includes(r.incidentType)) months[m].accident++;
    else months[m].nearMiss++;
  }
  return months;
}

export async function incidentsByDept(startDate, endDate) {
  const rows = await listIncidents({ startDate, endDate, lim: 2000 });
  const counts = {};
  for (const r of rows) {
    const k = r.department || 'ไม่ระบุ';
    counts[k] = (counts[k] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
}

export async function incidentsByType(startDate, endDate) {
  const rows = await listIncidents({ startDate, endDate, lim: 2000 });
  const counts = {};
  for (const r of rows) {
    const t = r.incidentType || 'other';
    const label = INCIDENT_TYPES[t]?.labelTh || t;
    counts[label] = (counts[label] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

// ────────────────────────────────────────────
// CAPA
// ────────────────────────────────────────────
export const CAPA_STATUS = {
  open:                { label: 'เปิด',             color: '#dc2626' },
  assigned:            { label: 'มอบหมายแล้ว',      color: '#d97706' },
  in_progress:         { label: 'กำลังดำเนินการ',   color: '#2563eb' },
  pending_verification:{ label: 'รอตรวจสอบ',        color: '#7c3aed' },
  closed:              { label: 'ปิดแล้ว',           color: '#16a34a' },
  overdue:             { label: 'เกินกำหนด',         color: '#7f1d1d' },
};

export async function listCapaRecords({ status, lim = 200 } = {}) {
  const constraints = status
    ? [where('status', '==', status), orderBy('createdAt', 'desc')]
    : [orderBy('createdAt', 'desc')];
  const snap = await getDocs(query(collection(db, COL.capa), ...constraints, limit(lim)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function countOpenCapa() {
  try {
    const q = query(collection(db, COL.capa), where('status', 'in', ['open','assigned','in_progress','pending_verification']));
    const snap = await getCountFromServer(q);
    return snap.data().count;
  } catch { return 0; }
}

export async function countOverdueCapa() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const snap = await getDocs(query(
      collection(db, COL.capa),
      where('status', 'in', ['open','assigned','in_progress']),
      where('dueDate', '<', today)
    ));
    return snap.size;
  } catch { return 0; }
}

export async function createCapa(data, createdBy) {
  return addDoc(collection(db, COL.capa), {
    ...data,
    status: 'open',
    createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateCapa(id, data) {
  await updateDoc(doc(db, COL.capa, id), { ...data, updatedAt: serverTimestamp() });
}

// ────────────────────────────────────────────
// Inspections
// ────────────────────────────────────────────
export async function listInspections({ startDate, endDate, lim = 100 } = {}) {
  const snap = await getDocs(query(collection(db, COL.inspections), orderBy('inspectionDate','desc'), limit(lim)));
  let rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (startDate) rows = rows.filter(r => r.inspectionDate >= startDate);
  if (endDate)   rows = rows.filter(r => r.inspectionDate <= endDate);
  return rows;
}

export async function createInspection(data, createdBy) {
  return addDoc(collection(db, COL.inspections), {
    ...data,
    createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

// ────────────────────────────────────────────
// Near Miss
// ────────────────────────────────────────────
export async function listNearMiss({ startDate, endDate, lim = 200 } = {}) {
  const snap = await getDocs(query(collection(db, COL.nearMiss), orderBy('reportDate','desc'), limit(lim)));
  let rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (startDate) rows = rows.filter(r => r.reportDate >= startDate);
  if (endDate)   rows = rows.filter(r => r.reportDate <= endDate);
  return rows;
}

export async function createNearMiss(data, createdBy) {
  const id = `NM-${new Date().getFullYear()}${String(new Date().getMonth()+1).padStart(2,'0')}-${String(Math.floor(Math.random()*9000)+1000)}`;
  return addDoc(collection(db, COL.nearMiss), {
    ...data,
    reportId: id,
    status: 'open',
    createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}
