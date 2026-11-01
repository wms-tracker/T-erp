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
  incidents:    "safetyIncidents",
  inspections:  "safetyInspections",
  inspTpl:      "safetyInspectionTemplates",
  capa:         "safetyCapaRecords",
  committee:    "safetyCommitteeMembers",
  meetings:     "safetyMeetings",
  training:     "safetyTraining",
  equipment:    "safetyEquipment",
  legal:        "safetyLegalRegisters",
  drills:       "safetyEmergencyDrills",
  nearMiss:     "safetyNearMiss",
  riskAssess:   "safetyRiskAssessments",
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

export async function updateNearMiss(id, data) {
  await updateDoc(doc(db, COL.nearMiss, id), { ...data, updatedAt: serverTimestamp() });
}

export async function getNearMiss(id) {
  const snap = await getDoc(doc(db, COL.nearMiss, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// ────────────────────────────────────────────
// Near Miss reference data
// ────────────────────────────────────────────
export const NEAR_MISS_TYPES = {
  near_miss:        { label: 'Near Miss',            labelTh: 'เฉียดอุบัติเหตุ',     color: '#2563eb', bg: '#eff6ff' },
  unsafe_act:       { label: 'Unsafe Act',           labelTh: 'พฤติกรรมไม่ปลอดภัย',  color: '#7c3aed', bg: '#f5f3ff' },
  unsafe_condition: { label: 'Unsafe Condition',     labelTh: 'สภาพไม่ปลอดภัย',     color: '#0891b2', bg: '#ecfeff' },
};

export const RISK_LEVELS_NM = {
  low:      { label: 'ต่ำ (Low)',      color: '#16a34a', bg: '#f0fdf4' },
  medium:   { label: 'ปานกลาง (Med)', color: '#d97706', bg: '#fffbeb' },
  high:     { label: 'สูง (High)',     color: '#dc2626', bg: '#fee2e2' },
};

export const NM_STATUS = {
  open:       { label: 'เปิด',               color: '#dc2626', bg: '#fee2e2' },
  assessed:   { label: 'ประเมินแล้ว',         color: '#d97706', bg: '#fffbeb' },
  assigned:   { label: 'มอบหมายแล้ว',         color: '#7c3aed', bg: '#f5f3ff' },
  in_progress:{ label: 'กำลังดำเนินการ',      color: '#2563eb', bg: '#eff6ff' },
  closed:     { label: 'ปิดแล้ว',             color: '#16a34a', bg: '#f0fdf4' },
};

// ────────────────────────────────────────────
// Inspection Templates
// ────────────────────────────────────────────
export const DEFAULT_INSPECTION_CATEGORIES = [
  'พื้นที่ปฏิบัติงาน', 'เครื่องจักร & อุปกรณ์', 'Forklift / Stacker', 'ระบบไฟฟ้า',
  'ถังดับเพลิง & ระบบดับเพลิง', 'ทางออกฉุกเฉิน', 'PPE', 'Housekeeping',
  'Loading / Unloading Area', 'Rack & Pallet', 'การจัดเก็บสารเคมี', 'อื่นๆ'
];

export const DEFAULT_INSPECTION_ITEMS = [
  { category: 'พื้นที่ปฏิบัติงาน',      item: 'พื้นสะอาด ไม่มีน้ำมัน/น้ำ/สิ่งกีดขวาง' },
  { category: 'พื้นที่ปฏิบัติงาน',      item: 'ทางเดินกว้างพอ และมีเครื่องหมายเส้นกำหนดชัดเจน' },
  { category: 'พื้นที่ปฏิบัติงาน',      item: 'แสงสว่างเพียงพอ ไฟทำงานปกติ' },
  { category: 'พื้นที่ปฏิบัติงาน',      item: 'ไม่มีวัสดุกองระเกะระกะ หรือวางผิดที่' },
  { category: 'เครื่องจักร & อุปกรณ์',  item: 'ฝาครอบป้องกัน (Guard) ครบถ้วนและอยู่ในตำแหน่ง' },
  { category: 'เครื่องจักร & อุปกรณ์',  item: 'สวิตช์ฉุกเฉิน (Emergency Stop) ทดสอบได้' },
  { category: 'Forklift / Stacker',    item: 'Forklift ผ่านการตรวจสอบรายวัน (Pre-shift check)' },
  { category: 'Forklift / Stacker',    item: 'ป้ายทะเบียน/สติกเกอร์น้ำหนักบรรทุกติดชัดเจน' },
  { category: 'ระบบไฟฟ้า',             item: 'ตู้ไฟฟ้าปิดสนิท ไม่มีสิ่งกีดขวางด้านหน้า' },
  { category: 'ระบบไฟฟ้า',             item: 'สายไฟไม่ขาด ไม่มีรอยไหม้ หรือต่อพ่วงเกิน' },
  { category: 'ถังดับเพลิง & ระบบดับเพลิง', item: 'ถังดับเพลิงอยู่ในตำแหน่ง ไม่ถูกบดบัง' },
  { category: 'ถังดับเพลิง & ระบบดับเพลิง', item: 'ถังดับเพลิงยังไม่หมดอายุ (ตรวจสอบ pin)' },
  { category: 'ทางออกฉุกเฉิน',          item: 'ประตูฉุกเฉินไม่ถูกล็อก และมีป้ายบอกชัดเจน' },
  { category: 'ทางออกฉุกเฉิน',          item: 'ไฟฉุกเฉินทำงานปกติ' },
  { category: 'PPE',                    item: 'พนักงานสวม PPE ครบตามกำหนด (หมวก/รองเท้า/เสื้อ)' },
  { category: 'PPE',                    item: 'PPE อยู่ในสภาพดี ไม่ชำรุดเสียหาย' },
  { category: 'Housekeeping',           item: 'จุดทิ้งขยะเป็นระเบียบ แยกประเภทถูกต้อง' },
  { category: 'Rack & Pallet',          item: 'Rack ไม่มีส่วนเสียหาย คาน/เสาตรง' },
  { category: 'Rack & Pallet',          item: 'วางสินค้าไม่เกินน้ำหนักสูงสุด และไม่เกินความสูงกำหนด' },
];

export async function listInspectionTemplates() {
  const snap = await getDocs(query(collection(db, COL.inspTpl), orderBy('createdAt', 'desc')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function createInspectionTemplate(data, createdBy) {
  return addDoc(collection(db, COL.inspTpl), {
    ...data,
    createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateInspectionTemplate(id, data) {
  await updateDoc(doc(db, COL.inspTpl, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteInspectionTemplate(id) {
  await deleteDoc(doc(db, COL.inspTpl, id));
}

export async function getInspectionTemplate(id) {
  const snap = await getDoc(doc(db, COL.inspTpl, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function updateInspection(id, data) {
  await updateDoc(doc(db, COL.inspections, id), { ...data, updatedAt: serverTimestamp() });
}

export async function getInspection(id) {
  const snap = await getDoc(doc(db, COL.inspections, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export const INSPECTION_STATUS = {
  draft:     { label: 'Draft',         color: '#6b7280', bg: '#f9fafb' },
  completed: { label: 'เสร็จสิ้น',     color: '#16a34a', bg: '#f0fdf4' },
  reviewed:  { label: 'ตรวจสอบแล้ว',  color: '#2563eb', bg: '#eff6ff' },
};

// ────────────────────────────────────────────
// Risk Assessment (HIRA)
// ────────────────────────────────────────────
export const RISK_LIKELIHOOD = [
  { value: 1, label: '1 - แทบจะไม่เกิด (Rare)' },
  { value: 2, label: '2 - ไม่น่าจะเกิด (Unlikely)' },
  { value: 3, label: '3 - อาจเกิดขึ้น (Possible)' },
  { value: 4, label: '4 - น่าจะเกิด (Likely)' },
  { value: 5, label: '5 - เกือบแน่นอน (Almost Certain)' },
];

export const RISK_SEVERITY = [
  { value: 1, label: '1 - ไม่มีนัยสำคัญ (Insignificant)' },
  { value: 2, label: '2 - เล็กน้อย (Minor)' },
  { value: 3, label: '3 - ปานกลาง (Moderate)' },
  { value: 4, label: '4 - รุนแรง (Major)' },
  { value: 5, label: '5 - หายนะ (Catastrophic)' },
];

export const RISK_CONTROLS = [
  { key: 'elimination',    label: '1. Elimination — ขจัดอันตราย' },
  { key: 'substitution',  label: '2. Substitution — แทนที่ด้วยวิธีที่ปลอดภัยกว่า' },
  { key: 'engineering',   label: '3. Engineering Control — ควบคุมทางวิศวกรรม' },
  { key: 'administrative', label: '4. Administrative Control — ควบคุมทางบริหาร/ขั้นตอน' },
  { key: 'ppe',           label: '5. PPE — อุปกรณ์ป้องกันส่วนบุคคล' },
];

export function getRiskLevel(score) {
  if (score <= 4)  return { level: 'low',      label: 'ต่ำ (Low)',          color: '#16a34a', bg: '#dcfce7' };
  if (score <= 9)  return { level: 'moderate', label: 'ปานกลาง (Moderate)', color: '#d97706', bg: '#fef3c7' };
  if (score <= 16) return { level: 'high',     label: 'สูง (High)',          color: '#dc2626', bg: '#fee2e2' };
  return             { level: 'extreme',    label: 'สูงมาก (Extreme)',    color: '#7f1d1d', bg: '#fef2f2' };
}

export async function listRiskAssessments({ dept, lim = 100 } = {}) {
  const constraints = [orderBy('createdAt', 'desc'), limit(lim)];
  if (dept) constraints.unshift(where('department', '==', dept));
  const snap = await getDocs(query(collection(db, COL.riskAssess), ...constraints));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getRiskAssessment(id) {
  const snap = await getDoc(doc(db, COL.riskAssess, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createRiskAssessment(data, createdBy) {
  return addDoc(collection(db, COL.riskAssess), {
    ...data,
    createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateRiskAssessment(id, data) {
  await updateDoc(doc(db, COL.riskAssess, id), { ...data, updatedAt: serverTimestamp() });
}

// ────────────────────────────────────────────
// Committee Members
// ────────────────────────────────────────────
export const COMMITTEE_ROLES = [
  { key: 'chairman',         label: 'ประธาน คปอ.' },
  { key: 'vice_chairman',    label: 'รองประธาน คปอ.' },
  { key: 'secretary',        label: 'เลขานุการ คปอ.' },
  { key: 'safety_officer',   label: 'จป.วิชาชีพ' },
  { key: 'employer_rep',     label: 'ผู้แทนนายจ้าง' },
  { key: 'employee_rep',     label: 'ผู้แทนลูกจ้าง' },
  { key: 'member',           label: 'กรรมการ คปอ.' },
];

export const MEMBER_STATUS = {
  active:   { label: 'ดำรงตำแหน่ง', color: '#16a34a', bg: '#dcfce7' },
  resigned: { label: 'ลาออก',       color: '#dc2626', bg: '#fee2e2' },
  expired:  { label: 'หมดวาระ',     color: '#d97706', bg: '#fef3c7' },
};

export async function listCommitteeMembers() {
  const snap = await getDocs(query(collection(db, COL.committee), orderBy('createdAt', 'desc')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getCommitteeMember(id) {
  const snap = await getDoc(doc(db, COL.committee, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createCommitteeMember(data, createdBy) {
  return addDoc(collection(db, COL.committee), {
    ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
}

export async function updateCommitteeMember(id, data) {
  await updateDoc(doc(db, COL.committee, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteCommitteeMember(id) {
  await deleteDoc(doc(db, COL.committee, id));
}

// ────────────────────────────────────────────
// Committee Meetings
// ────────────────────────────────────────────
export const MEETING_STATUS = {
  scheduled: { label: 'กำหนดการ',   color: '#2563eb', bg: '#eff6ff' },
  completed: { label: 'เสร็จแล้ว',   color: '#16a34a', bg: '#dcfce7' },
  cancelled: { label: 'ยกเลิก',     color: '#dc2626', bg: '#fee2e2' },
};

export const MEETING_TYPES = [
  { key: 'ordinary',     label: 'การประชุมสามัญ (ประจำเดือน)' },
  { key: 'extraordinary',label: 'การประชุมวิสามัญ' },
  { key: 'annual',       label: 'การประชุมประจำปี' },
];

export async function listMeetings({ lim = 100 } = {}) {
  const snap = await getDocs(query(collection(db, COL.meetings), orderBy('meetingDate', 'desc'), limit(lim)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getMeeting(id) {
  const snap = await getDoc(doc(db, COL.meetings, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createMeeting(data, createdBy) {
  return addDoc(collection(db, COL.meetings), {
    ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
}

export async function updateMeeting(id, data) {
  await updateDoc(doc(db, COL.meetings, id), { ...data, updatedAt: serverTimestamp() });
}

// ────────────────────────────────────────────
// Safety Training
// ────────────────────────────────────────────
export const TRAINING_STATUS = {
  planned:   { label: 'วางแผนแล้ว', color: '#2563eb', bg: '#eff6ff' },
  completed: { label: 'เสร็จแล้ว',  color: '#16a34a', bg: '#dcfce7' },
  cancelled: { label: 'ยกเลิก',    color: '#dc2626', bg: '#fee2e2' },
};

export const TRAINING_TYPES = [
  { key: 'new_employee',   label: 'ปฐมนิเทศความปลอดภัย (พนักงานใหม่)' },
  { key: 'refresher',      label: 'ทบทวนความปลอดภัยประจำปี' },
  { key: 'fire',           label: 'การป้องกันและระงับอัคคีภัย' },
  { key: 'first_aid',      label: 'การปฐมพยาบาลเบื้องต้น' },
  { key: 'forklift',       label: 'ความปลอดภัยในการใช้ Forklift' },
  { key: 'chemical',       label: 'การจัดการสารเคมีอันตราย' },
  { key: 'emergency',      label: 'แผนฉุกเฉินและการอพยพ' },
  { key: 'kpo_law',        label: 'กฎหมายความปลอดภัย (คปอ.)' },
  { key: 'other',          label: 'อื่นๆ' },
];

export async function listTrainings({ lim = 100 } = {}) {
  const snap = await getDocs(query(collection(db, COL.training), orderBy('trainingDate', 'desc'), limit(lim)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getTraining(id) {
  const snap = await getDoc(doc(db, COL.training, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createTraining(data, createdBy) {
  return addDoc(collection(db, COL.training), {
    ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
}

export async function updateTraining(id, data) {
  await updateDoc(doc(db, COL.training, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteTraining(id) {
  await deleteDoc(doc(db, COL.training, id));
}

// ────────────────────────────────────────────
// Safety Equipment
// ────────────────────────────────────────────
export const EQUIPMENT_CATEGORIES = [
  'PPE — หัวใจ (หมวก)', 'PPE — ตา/หน้า (แว่น/หน้ากาก)', 'PPE — ระบบหายใจ',
  'PPE — มือ (ถุงมือ)', 'PPE — เท้า (รองเท้า)', 'PPE — ร่างกาย (ชุด)',
  'PPE — ที่สูง (Safety Harness)', 'อุปกรณ์ดับเพลิง', 'อุปกรณ์ปฐมพยาบาล',
  'อุปกรณ์ฉุกเฉิน', 'อื่นๆ',
];

export const EQUIP_STATUS = {
  active:   { label: 'ใช้งานได้', color: '#16a34a', bg: '#dcfce7' },
  inspect:  { label: 'รอตรวจสอบ', color: '#d97706', bg: '#fef3c7' },
  repair:   { label: 'ส่งซ่อม',   color: '#dc2626', bg: '#fee2e2' },
  retired:  { label: 'ปลดระวาง',  color: '#6b7280', bg: '#f9fafb' },
};

export async function listEquipments({ lim = 200 } = {}) {
  const snap = await getDocs(query(collection(db, COL.equipment), orderBy('createdAt', 'desc'), limit(lim)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getEquipment(id) {
  const snap = await getDoc(doc(db, COL.equipment, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createEquipment(data, createdBy) {
  return addDoc(collection(db, COL.equipment), {
    ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
}

export async function updateEquipment(id, data) {
  await updateDoc(doc(db, COL.equipment, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteEquipment(id) {
  await deleteDoc(doc(db, COL.equipment, id));
}

// ────────────────────────────────────────────
// Emergency Drills
// ────────────────────────────────────────────
export const DRILL_TYPES = [
  { key: 'fire',         label: 'ซ้อมดับเพลิง / อพยพหนีไฟ' },
  { key: 'chemical',     label: 'ซ้อมรับมือสารเคมีรั่วไหล' },
  { key: 'earthquake',   label: 'ซ้อมรับมือแผ่นดินไหว' },
  { key: 'medical',      label: 'ซ้อมปฐมพยาบาลฉุกเฉิน' },
  { key: 'full_scale',   label: 'ซ้อมแผนฉุกเฉินเต็มรูปแบบ' },
  { key: 'tabletop',     label: 'Tabletop Exercise' },
  { key: 'other',        label: 'อื่นๆ' },
];

export const DRILL_STATUS = {
  planned:   { label: 'วางแผนแล้ว', color: '#2563eb', bg: '#eff6ff' },
  completed: { label: 'เสร็จแล้ว',  color: '#16a34a', bg: '#dcfce7' },
  cancelled: { label: 'ยกเลิก',    color: '#dc2626', bg: '#fee2e2' },
};

export async function listDrills({ lim = 100 } = {}) {
  const snap = await getDocs(query(collection(db, COL.drills), orderBy('drillDate', 'desc'), limit(lim)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getDrill(id) {
  const snap = await getDoc(doc(db, COL.drills, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createDrill(data, createdBy) {
  return addDoc(collection(db, COL.drills), {
    ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
}

export async function updateDrill(id, data) {
  await updateDoc(doc(db, COL.drills, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteDrill(id) {
  await deleteDoc(doc(db, COL.drills, id));
}

// ────────────────────────────────────────────
// Legal Register
// ────────────────────────────────────────────
export const LEGAL_CATEGORIES = [
  'พ.ร.บ. ความปลอดภัยฯ พ.ศ.2554', 'กฎกระทรวง (สวัสดิการฯ)', 'ประกาศกรม (แรงงาน)',
  'มาตรฐาน มอก./ISO', 'ข้อบัญญัติท้องถิ่น', 'อื่นๆ',
];

export const LEGAL_STATUS = {
  compliant:      { label: 'สอดคล้อง',     color: '#16a34a', bg: '#dcfce7' },
  partial:        { label: 'สอดคล้องบางส่วน', color: '#d97706', bg: '#fef3c7' },
  non_compliant:  { label: 'ไม่สอดคล้อง',  color: '#dc2626', bg: '#fee2e2' },
  not_applicable: { label: 'ไม่เกี่ยวข้อง', color: '#6b7280', bg: '#f9fafb' },
  under_review:   { label: 'กำลังทบทวน',   color: '#7c3aed', bg: '#f5f3ff' },
};

export async function listLegalRegisters({ lim = 200 } = {}) {
  const snap = await getDocs(query(collection(db, COL.legal), orderBy('createdAt', 'desc'), limit(lim)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getLegalRegister(id) {
  const snap = await getDoc(doc(db, COL.legal, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createLegalRegister(data, createdBy) {
  return addDoc(collection(db, COL.legal), {
    ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
}

export async function updateLegalRegister(id, data) {
  await updateDoc(doc(db, COL.legal, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteLegalRegister(id) {
  await deleteDoc(doc(db, COL.legal, id));
}
