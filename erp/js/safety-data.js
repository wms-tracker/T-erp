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
  observations:  "safetyObservations",
  contractors:   "safetyContractors",
  kpiTargets:    "safetyKpiTargets",
  emergencyPlans:"safetyEmergencyPlans",
  chemicals:     "safetyChemicals",
  jsa:           "safetyJSA",
  healthRecords: "safetyHealthRecords",
  actionPlan:    "safetyActionPlan",
  envMonitor:    "safetyEnvMonitor",
  waste:         "safetyWaste",
  audits:        "safetyAudits",
  auditFindings: "safetyAuditFindings",
  induction:     "safetyInduction",
  fireEq:        "safetyFireEquipment",
  ppeIssue:      "safetyPPEIssuance",
  firstAid:      "safetyFirstAid",
  violations:    "safetyViolations",
  handover:      "safetyShiftHandover",
  suggestions:   "safetySuggestions",
  eqLoan:        "safetyEquipmentLoan",
  safetyWalk:    "safetySafetyWalk",
  budget:        "safetyBudget",
  loto:          "safetyLOTO",
  recognition:   "safetyRecognition",
  ergonomic:     "safetyErgonomic",
  safetyAlert:   "safetySafetyAlert",
  workHeight:    "safetyWorkHeight",
  cse:           "safetyCSE",
  hotWork:       "safetyHotWork",
  vehicleCheck:  "safetyVehicleCheck",
  gasCylinder:   "safetyGasCylinder",
  liftingEq:     "safetyLiftingEquipment",
  fiveS:         "safetyFiveS",
  electricalInsp:"safetyElectricalInspection",
  spillRecord:   "safetySpillRecord",
  ppeStock:      "safetyPPEStock",
  safetySign:    "safetySafetySign",
  cultureSurvey:    "safetyCultureSurvey",
  ptw:              "safetyPTW",
  noiseMonitor:     "safetyNoiseMonitor",
  incidentInvestig: "safetyIncidentInvestigation",
  safetyPassport:   "safetySafetyPassport",
  moc:              "safetyMoC",
  safetyStats:      "safetySafetyStats",
  trainingMatrix:   "safetyTrainingMatrix",
  scoreCard:        "safetyScorecards",
  bulletin:         "safetySafetyBulletin",
  safetyProject:    "safetySafetyProjects",
  dailyReport:      "safetySafetyDailyReport",
  contractorEval:   "safetyContractorEval",
  occHealth:        "safetyOccHealth",
  annualPlan:       "safetyAnnualPlan",
  mgmtReview:       "safetyMgmtReview",
  legalCompliance:  "safetyLegalCompliance",
  interestedParty:  "safetyInterestedParty",
  docControl:       "safetyDocControl",
  participation:    "safetyParticipation",
  improvement:      "safetyContinualImprovement",
  commPlan:         "safetyCommunicationPlan",
  lessons:          "safetyLessonsLearned",
  contextIssue:     "safetyContextIssues",
  objective:        "safetySafetyObjectives",
  hazard:           "safetyHazardRegister",
  opControl:        "safetyOperationalControls",
  monitorProg:      "safetyMonitorProgram",
  campaign:         "safetyCampaigns",
  safetyRule:       "safetySafetyRules",
  safetyTalk:       "safetySafetyTalks",
  machineCheck:     "safetyMachineCheck",
  bbsObs:           "safetyBBSObservations",
  safetyEvent:      "safetySafetyEvents",
  envMeasure:       "safetyEnvMeasure",
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

// ─── Permit to Work (PTW) ──────────────────────────────────────────────────
COL.permits = 'safetyPermits';

export const PERMIT_TYPES = {
  hot_work:       { key: 'hot_work',       labelTh: 'งานร้อน (Hot Work)',              icon: '🔥', color: '#dc2626' },
  confined_space: { key: 'confined_space', labelTh: 'พื้นที่อับอากาศ (Confined Space)', icon: '🕳', color: '#7c3aed' },
  height:         { key: 'height',         labelTh: 'ทำงานที่สูง (Working at Height)',  icon: '🏗', color: '#2563eb' },
  electrical:     { key: 'electrical',     labelTh: 'งานไฟฟ้า (Electrical Work)',       icon: '⚡', color: '#d97706' },
  excavation:     { key: 'excavation',     labelTh: 'งานขุดเจาะ (Excavation)',          icon: '⛏', color: '#92400e' },
  general:        { key: 'general',        labelTh: 'งานทั่วไป (General)',              icon: '📋', color: '#0891b2' },
};

export const PERMIT_STATUS = {
  draft:     { label: 'ร่าง',            color: '#94a3b8' },
  pending:   { label: 'รอการอนุมัติ',    color: '#d97706' },
  approved:  { label: 'อนุมัติแล้ว',     color: '#0891b2' },
  active:    { label: 'กำลังดำเนินงาน', color: '#16a34a' },
  completed: { label: 'เสร็จสิ้น',       color: '#475569' },
  rejected:  { label: 'ปฏิเสธ',          color: '#dc2626' },
  cancelled: { label: 'ยกเลิก',          color: '#94a3b8' },
};

export const PERMIT_CHECKLISTS = {
  hot_work: [
    'ตรวจสอบพื้นที่ปลอดสารไวไฟรัศมี 10 เมตร',
    'จัดเตรียมถังดับเพลิงและน้ำใกล้จุดทำงาน',
    'แจ้งเตือนพนักงานในบริเวณใกล้เคียง',
    'ตรวจสอบระบบ Sprinkler/การ์ดไฟ',
    'กำหนด Fire Watch ตลอดระยะเวลางาน',
    'ตรวจสอบอุปกรณ์ PPE: แว่นตา/หน้ากาก/ถุงมือทนไฟ',
  ],
  confined_space: [
    'ทดสอบบรรยากาศ: O2, LEL, CO, H2S ก่อนเข้า',
    'จัดเตรียมอุปกรณ์ช่วยเหลือฉุกเฉิน (Tripod/Winch)',
    'กำหนด Standby Man นอกพื้นที่อับอากาศ',
    'จัดระบบระบายอากาศ (Ventilation) ต่อเนื่อง',
    'แจ้งหัวหน้างานและเบอร์ฉุกเฉิน',
    'ตรวจสอบ PPE: อุปกรณ์ช่วยหายใจ/ชุดป้องกัน',
  ],
  height: [
    'ตรวจสอบนั่งร้าน/บันได/กรงกระเช้าก่อนใช้งาน',
    'สวมใส่ Full Body Harness และสายช่วยชีวิต',
    'กำหนดพื้นที่ห้ามเข้า (Barricade) ด้านล่าง',
    'ตรวจสอบสภาพอากาศ ไม่ทำงานในพายุ/ฝนตกหนัก',
    'ผู้ปฏิบัติงานผ่านการฝึกอบรมงานที่สูง',
    'ไม่วางวัสดุที่ขอบ มีการยึดเครื่องมืออย่างดี',
  ],
  electrical: [
    'Lock Out / Tag Out (LOTO) ก่อนเริ่มงาน',
    'ทดสอบว่าไม่มีกระแสไฟ (Test for Zero Energy)',
    'สวมใส่ PPE ฉนวน: ถุงมือไดอิเล็กทริก/รองเท้าฉนวน',
    'ห้ามทำงานคนเดียว มี Safety Observer ตลอดเวลา',
    'ติดป้ายเตือน "อย่าเปิดสวิตช์" ที่ตู้ควบคุม',
    'ตรวจสอบอุปกรณ์ป้องกันอาร์ก (Arc Flash)',
  ],
  excavation: [
    'สำรวจและทำเครื่องหมายท่อใต้ดิน/สายไฟ',
    'ค้ำยันผนังหลุมขุดลึกกว่า 1.5 เมตร',
    'กำหนดพื้นที่กันรถยนต์เข้าใกล้ขอบหลุม',
    'ตรวจสอบสภาพดินและน้ำใต้ดินก่อนขุด',
    'มีบันไดออกฉุกเฉินทุก 7 เมตรของความยาวหลุม',
    'ตรวจสอบอากาศในหลุมลึกกว่า 1.2 เมตร',
  ],
  general: [
    'ประเมินอันตรายและความเสี่ยงเบื้องต้น',
    'เตรียม PPE ตามความเสี่ยงของงาน',
    'แจ้งหัวหน้างานและพนักงานในพื้นที่',
    'ตรวจสอบเครื่องมืออุปกรณ์ก่อนใช้งาน',
    'กำหนดทางออกฉุกเฉินและจุดรวมพล',
  ],
};

export const PPE_OPTIONS = [
  'หมวกนิรภัย', 'รองเท้านิรภัย', 'แว่นตานิรภัย', 'หน้ากากกันฝุ่น',
  'ถุงมือ', 'เสื้อสะท้อนแสง', 'ชุด Full Body Harness', 'หน้ากากเชื่อม',
  'ถุงมือทนไฟ', 'ถุงมือไดอิเล็กทริก', 'รองเท้าฉนวน', 'อุปกรณ์ช่วยหายใจ',
  'ชุดป้องกันสารเคมี', 'ที่อุดหู', 'Face Shield',
];

let _ptw_seq = 0;
export async function generatePermitId() {
  const now = new Date();
  const y = now.getFullYear(); const m = String(now.getMonth()+1).padStart(2,'0');
  const snap = await getDocs(query(
    collection(db, COL.permits),
    where('permitId', '>=', `PTW-${y}${m}-`),
    where('permitId', '<',  `PTW-${y}${m}-Z`),
    orderBy('permitId', 'desc'), limit(1)
  ));
  const last = snap.empty ? 0 : parseInt(snap.docs[0].data().permitId.split('-').pop()) || 0;
  return `PTW-${y}${m}-${String(last + 1 + _ptw_seq++).padStart(3,'0')}`;
}

export async function listPermits({ status, permitType, startDate, endDate, lim = 200 } = {}) {
  const constraints = [orderBy('createdAt','desc'), limit(lim)];
  if (status)     constraints.unshift(where('status','==',status));
  if (permitType) constraints.unshift(where('permitType','==',permitType));
  const snap = await getDocs(query(collection(db, COL.permits), ...constraints));
  let rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (startDate) rows = rows.filter(r => r.workStartDate >= startDate);
  if (endDate)   rows = rows.filter(r => r.workStartDate <= endDate);
  return rows;
}

export async function getPermit(id) {
  const snap = await getDoc(doc(db, COL.permits, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createPermit(data, createdBy) {
  return await addDoc(collection(db, COL.permits), {
    ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
}

export async function updatePermit(id, data) {
  await updateDoc(doc(db, COL.permits, id), { ...data, updatedAt: serverTimestamp() });
}

export async function approvePermit(id, approvedBy) {
  await updateDoc(doc(db, COL.permits, id), {
    status: 'approved', approvedBy, approvedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
}

export async function rejectPermit(id, rejectedBy, reason) {
  await updateDoc(doc(db, COL.permits, id), {
    status: 'rejected', rejectedBy, rejectedReason: reason, updatedAt: serverTimestamp(),
  });
}

export async function activatePermit(id) {
  await updateDoc(doc(db, COL.permits, id), { status: 'active', updatedAt: serverTimestamp() });
}

export async function closePermit(id, closedBy, notes) {
  await updateDoc(doc(db, COL.permits, id), {
    status: 'completed', closedBy, closedNotes: notes, closedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
}

export async function cancelPermit(id, reason) {
  await updateDoc(doc(db, COL.permits, id), {
    status: 'cancelled', cancelReason: reason, updatedAt: serverTimestamp(),
  });
}

// ─── Safety Talk / Toolbox Talk ────────────────────────────────────────────
COL.talks = 'safetyTalks';

export const TALK_TYPES = {
  safety_talk:    { label: 'Safety Talk รายวัน',      icon: '🗣' },
  toolbox_talk:   { label: 'Toolbox Talk',            icon: '🔧' },
  safety_briefing:{ label: 'Safety Briefing',         icon: '📋' },
  morning_talk:   { label: 'กิจกรรมเช้า (Morning Talk)', icon: '🌅' },
  special:        { label: 'พิเศษ (เหตุการณ์/กฎหมายใหม่)', icon: '⚡' },
};

export const TALK_TOPICS = [
  'อุบัติเหตุและสาเหตุ', 'การใช้ PPE ที่ถูกต้อง', 'ความสะอาดและการจัดเก็บ (5ส)',
  'การเคลื่อนย้ายสินค้าอย่างปลอดภัย', 'การป้องกันอัคคีภัย', 'Near Miss และการรายงาน',
  'Permit to Work', 'การทำงานในที่อับอากาศ', 'ความปลอดภัยไฟฟ้า',
  'การเคลื่อนย้ายด้วยรถโฟล์คลิฟท์', 'สารเคมีอันตราย', 'ภาวะฉุกเฉินและการอพยพ',
  'ท่าทางการยกของที่ถูกต้อง', 'ความปลอดภัยบนที่สูง', 'อื่นๆ',
];

export async function listTalks({ startDate, endDate, talkType, dept, lim = 200 } = {}) {
  const constraints = [orderBy('talkDate','desc'), limit(lim)];
  if (talkType) constraints.unshift(where('talkType','==',talkType));
  if (dept)     constraints.unshift(where('department','==',dept));
  const snap = await getDocs(query(collection(db, COL.talks), ...constraints));
  let rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (startDate) rows = rows.filter(r => r.talkDate >= startDate);
  if (endDate)   rows = rows.filter(r => r.talkDate <= endDate);
  return rows;
}

export async function getTalk(id) {
  const snap = await getDoc(doc(db, COL.talks, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createTalk(data, createdBy) {
  return await addDoc(collection(db, COL.talks), {
    ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
}

export async function updateTalk(id, data) {
  await updateDoc(doc(db, COL.talks, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteTalk(id) {
  await deleteDoc(doc(db, COL.talks, id));
}

// ─── Chemical / Hazardous Substance Register ──────────────────────────────
COL.chemicals = 'safetyChemicals';

export const GHS_HAZARDS = [
  { key: 'explosive',      label: 'ระเบิดได้',         icon: '💥', color: '#dc2626' },
  { key: 'flammable',      label: 'ติดไฟได้',           icon: '🔥', color: '#ea580c' },
  { key: 'oxidizing',      label: 'ออกซิไดซ์/เพิ่มไฟ', icon: '⭕', color: '#d97706' },
  { key: 'compressed_gas', label: 'ก๊าซอัด',            icon: '🟢', color: '#16a34a' },
  { key: 'corrosive',      label: 'กัดกร่อน',           icon: '⚗️', color: '#7c3aed' },
  { key: 'toxic',          label: 'เป็นพิษเฉียบพลัน',  icon: '☠️', color: '#dc2626' },
  { key: 'health_hazard',  label: 'เป็นอันตรายต่อสุขภาพ', icon: '⚠️', color: '#d97706' },
  { key: 'irritant',       label: 'กระตุ้น/แพ้',        icon: '❗', color: '#d97706' },
  { key: 'env_hazard',     label: 'เป็นอันตรายต่อสิ่งแวดล้อม', icon: '🌊', color: '#0891b2' },
];

export const CHEM_STATUS = {
  active:       { label: 'ใช้งาน',      color: '#16a34a' },
  discontinued: { label: 'ยกเลิกใช้',   color: '#dc2626' },
  review:       { label: 'รอทบทวน SDS', color: '#d97706' },
};

export const CHEM_UNITS = ['kg', 'g', 'L', 'mL', 'ถัง', 'ลัง', 'กระป๋อง'];

export const DEFAULT_CHEMICALS = [
  { chemicalName:'น้ำยาล้างพื้น/ทำความสะอาด', chemicalNameEn:'Floor Cleaner', casNumber:'Various', ghsHazards:['irritant'], storageLocation:'คลังสินค้าสารเคมี', unit:'L', maxQuantity:100, status:'active' },
  { chemicalName:'แอลกอฮอล์ 70%', chemicalNameEn:'Isopropyl Alcohol 70%', casNumber:'67-63-0', ghsHazards:['flammable','irritant'], storageLocation:'คลังสินค้าสารเคมี', unit:'L', maxQuantity:50, status:'active' },
  { chemicalName:'แก๊ส LPG', chemicalNameEn:'Liquefied Petroleum Gas', casNumber:'68476-85-7', ghsHazards:['flammable','compressed_gas'], storageLocation:'พื้นที่เก็บก๊าซ', unit:'ถัง', maxQuantity:10, status:'active' },
  { chemicalName:'น้ำยาดับเพลิง (CO2)', chemicalNameEn:'Carbon Dioxide Extinguisher', casNumber:'124-38-9', ghsHazards:['compressed_gas'], storageLocation:'ตามจุดติดตั้ง', unit:'กระป๋อง', maxQuantity:30, status:'active' },
  { chemicalName:'แบตเตอรี่กรด', chemicalNameEn:'Lead-Acid Battery', casNumber:'Various', ghsHazards:['corrosive','toxic'], storageLocation:'ห้องชาร์จแบตเตอรี่', unit:'ลูก', maxQuantity:20, status:'active' },
];

export async function listChemicals({ status, lim = 200 } = {}) {
  const constraints = [orderBy('chemicalName','asc'), limit(lim)];
  if (status) constraints.unshift(where('status','==',status));
  const snap = await getDocs(query(collection(db, COL.chemicals), ...constraints));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getChemical(id) {
  const snap = await getDoc(doc(db, COL.chemicals, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createChemical(data, createdBy) {
  return await addDoc(collection(db, COL.chemicals), {
    ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
}

export async function updateChemical(id, data) {
  await updateDoc(doc(db, COL.chemicals, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteChemical(id) {
  await deleteDoc(doc(db, COL.chemicals, id));
}

// ─── Accident Investigation ────────────────────────────────────────────────
COL.investigations = 'safetyInvestigations';

export const INVEST_STATUS = {
  draft:      { label: 'ร่าง',              color: '#94a3b8' },
  in_progress:{ label: 'กำลังสอบสวน',      color: '#d97706' },
  completed:  { label: 'เสร็จสิ้น',         color: '#0891b2' },
  reviewed:   { label: 'ผ่านการทบทวนแล้ว', color: '#16a34a' },
};

export const ROOT_CAUSE_4M1E = [
  { key: 'human',       label: 'คน (Human / Man)',             icon: '👤', examples: 'ความประมาท, ขาดความรู้, ฝืนกฎ, ล้า, เจ็บป่วย' },
  { key: 'machine',     label: 'เครื่องจักร (Machine)',        icon: '⚙️', examples: 'ชำรุด, ไม่ได้รับการบำรุงรักษา, ออกแบบไม่ดี' },
  { key: 'method',      label: 'วิธีการ (Method)',             icon: '📋', examples: 'ขั้นตอนไม่ชัดเจน, ไม่มี SOP, ฝึกอบรมไม่เพียงพอ' },
  { key: 'material',    label: 'วัสดุ (Material)',             icon: '📦', examples: 'วัสดุมีตำหนิ, ไม่ได้มาตรฐาน, ป้ายเตือนไม่ครบ' },
  { key: 'environment', label: 'สภาพแวดล้อม (Environment)',   icon: '🌡', examples: 'แสงไม่เพียงพอ, พื้นลื่น, เสียงดัง, อุณหภูมิสูง/ต่ำ' },
];

export const IMMEDIATE_CAUSE_TYPES = [
  'พฤติกรรมไม่ปลอดภัย (Unsafe Act)', 'สภาพไม่ปลอดภัย (Unsafe Condition)',
  'ไม่ใช้ PPE', 'ทำงานโดยไม่มีใบอนุญาต', 'การเคลื่อนไหวที่ไม่เหมาะสม',
  'ใช้เครื่องมือผิดประเภท', 'ทำงานในพื้นที่อันตรายโดยไม่ได้รับอนุญาต',
  'เครื่องจักรชำรุดแต่ยังใช้งาน', 'ระบบไฟฟ้าผิดปกติ', 'อื่นๆ',
];

export async function listInvestigations({ status, lim = 200 } = {}) {
  const constraints = [orderBy('createdAt','desc'), limit(lim)];
  if (status) constraints.unshift(where('status','==',status));
  const snap = await getDocs(query(collection(db, COL.investigations), ...constraints));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getInvestigation(id) {
  const snap = await getDoc(doc(db, COL.investigations, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createInvestigation(data, createdBy) {
  return await addDoc(collection(db, COL.investigations), {
    ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
}

export async function updateInvestigation(id, data) {
  await updateDoc(doc(db, COL.investigations, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteInvestigation(id) {
  await deleteDoc(doc(db, COL.investigations, id));
}

// ────────────────────────────────────────────
// Safety Observations (BBS)
// ────────────────────────────────────────────
export const OBS_TYPES = {
  safe:      { label: 'พฤติกรรมปลอดภัย',    color: '#16a34a', bg: '#dcfce7' },
  unsafe:    { label: 'พฤติกรรมไม่ปลอดภัย', color: '#dc2626', bg: '#fee2e2' },
  condition: { label: 'สภาพไม่ปลอดภัย',     color: '#d97706', bg: '#fef3c7' },
  positive:  { label: 'แบบอย่างที่ดี',       color: '#2563eb', bg: '#eff6ff' },
};

export const OBS_CATEGORIES = [
  'อุปกรณ์ PPE', 'ความสะอาด/5ส', 'เครื่องจักร/อุปกรณ์', 'การยกของ/ท่าทาง',
  'สารเคมี', 'ไฟฟ้า', 'อัคคีภัย', 'การจราจร/ยานพาหนะ', 'ทำงานที่สูง',
  'พื้นที่อับอากาศ', 'ป้ายเตือน/ความปลอดภัย', 'ทั่วไป',
];

export const OBS_STATUS = {
  open:   { label: 'รอดำเนินการ', color: '#d97706', bg: '#fef3c7' },
  closed: { label: 'ดำเนินการแล้ว', color: '#16a34a', bg: '#dcfce7' },
  na:     { label: 'ไม่ต้องดำเนินการ', color: '#6b7280', bg: '#f9fafb' },
};

export async function listObservations({ startDate, endDate, obsType, dept, lim = 200 } = {}) {
  const snap = await getDocs(query(collection(db, COL.observations), orderBy('observationDate', 'desc'), limit(lim)));
  let rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (startDate) rows = rows.filter(r => r.observationDate >= startDate);
  if (endDate)   rows = rows.filter(r => r.observationDate <= endDate);
  if (obsType)   rows = rows.filter(r => r.obsType === obsType);
  if (dept)      rows = rows.filter(r => r.department === dept);
  return rows;
}

export async function getObservation(id) {
  const snap = await getDoc(doc(db, COL.observations, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createObservation(data, createdBy) {
  return addDoc(collection(db, COL.observations), {
    ...data, status: data.obsType === 'safe' || data.obsType === 'positive' ? 'na' : 'open',
    createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
}

export async function updateObservation(id, data) {
  await updateDoc(doc(db, COL.observations, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteObservation(id) {
  await deleteDoc(doc(db, COL.observations, id));
}

// ────────────────────────────────────────────
// Contractor Safety Management
// ────────────────────────────────────────────
export const CONTRACT_TYPES = [
  { key: 'construction', label: 'ก่อสร้าง / ปรับปรุง' },
  { key: 'maintenance',  label: 'ซ่อมบำรุง' },
  { key: 'cleaning',     label: 'ทำความสะอาด' },
  { key: 'delivery',     label: 'ขนส่ง / จัดส่ง' },
  { key: 'it',           label: 'IT / ระบบ' },
  { key: 'security',     label: 'รักษาความปลอดภัย' },
  { key: 'other',        label: 'อื่นๆ' },
];

export const CONTRACTOR_STATUS = {
  active:    { label: 'ดำเนินงาน',    color: '#16a34a', bg: '#dcfce7' },
  expired:   { label: 'สัญญาหมดแล้ว', color: '#dc2626', bg: '#fee2e2' },
  suspended: { label: 'ระงับชั่วคราว', color: '#d97706', bg: '#fef3c7' },
  completed: { label: 'เสร็จสิ้นงาน', color: '#6b7280', bg: '#f9fafb' },
};

export const INDUCTION_STATUS = {
  pending:   { label: 'รออบรม',      color: '#d97706', bg: '#fef3c7' },
  completed: { label: 'อบรมแล้ว',    color: '#16a34a', bg: '#dcfce7' },
  expired:   { label: 'หมดอายุ',     color: '#dc2626', bg: '#fee2e2' },
  na:        { label: 'ไม่บังคับ',    color: '#6b7280', bg: '#f9fafb' },
};

export async function listContractors({ status, lim = 200 } = {}) {
  const snap = await getDocs(query(collection(db, COL.contractors), orderBy('createdAt', 'desc'), limit(lim)));
  let rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (status) rows = rows.filter(r => r.status === status);
  return rows;
}

export async function getContractor(id) {
  const snap = await getDoc(doc(db, COL.contractors, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createContractor(data, createdBy) {
  return addDoc(collection(db, COL.contractors), {
    ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
}

export async function updateContractor(id, data) {
  await updateDoc(doc(db, COL.contractors, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteContractor(id) {
  await deleteDoc(doc(db, COL.contractors, id));
}

// ────────────────────────────────────────────
// KPI Targets (one doc per year, id = "YYYY")
// ────────────────────────────────────────────
export const KPI_DEFINITIONS = [
  { key: 'incidents',         label: 'อุบัติเหตุทั้งหมด',           unit: 'ครั้ง',  direction: 'lower', defaultTarget: 0  },
  { key: 'lti',               label: 'Lost Time Injury (LTI)',     unit: 'ครั้ง',  direction: 'lower', defaultTarget: 0  },
  { key: 'lostDays',          label: 'วันสูญเสียจากอุบัติเหตุ',     unit: 'วัน',    direction: 'lower', defaultTarget: 0  },
  { key: 'nearMiss',          label: 'Near Miss รายงาน',            unit: 'ครั้ง',  direction: 'higher', defaultTarget: 12 },
  { key: 'capaCloseRate',     label: 'CAPA Closure Rate',          unit: '%',      direction: 'higher', defaultTarget: 90 },
  { key: 'inspPassRate',      label: 'ผ่านการตรวจสอบ (Avg)',        unit: '%',      direction: 'higher', defaultTarget: 90 },
  { key: 'trainingCompletion',label: 'Training Completion Rate',   unit: '%',      direction: 'higher', defaultTarget: 95 },
  { key: 'safetyTalks',       label: 'Safety Talk (ต่อเดือน)',      unit: 'ครั้ง',  direction: 'higher', defaultTarget: 4  },
  { key: 'legalCompliance',   label: 'Legal Compliance',           unit: '%',      direction: 'higher', defaultTarget: 100},
  { key: 'bbs',               label: 'BBS Observations (ต่อเดือน)', unit: 'ครั้ง',  direction: 'higher', defaultTarget: 20 },
  { key: 'drills',            label: 'ซ้อมแผนฉุกเฉิน (ต่อปี)',      unit: 'ครั้ง',  direction: 'higher', defaultTarget: 2  },
  { key: 'contractorInduction',label:'Contractor Induction Rate',  unit: '%',      direction: 'higher', defaultTarget: 100},
];

export async function getKpiTargets(year) {
  const snap = await getDoc(doc(db, COL.kpiTargets, String(year)));
  return snap.exists() ? snap.data() : null;
}

export async function saveKpiTargets(year, targets, updatedBy) {
  await setDoc(doc(db, COL.kpiTargets, String(year)), {
    year, targets, updatedBy, updatedAt: serverTimestamp(),
  });
}

// ────────────────────────────────────────────
// Phase 17 — Emergency Response Plans
// ────────────────────────────────────────────
export const EMERGENCY_TYPES = [
  { key: 'fire',       label: '🔥 ไฟไหม้',                  color: '#dc2626', bg: '#fee2e2' },
  { key: 'chemical',   label: '☣️ สารเคมีรั่วไหล',            color: '#d97706', bg: '#fef3c7' },
  { key: 'medical',    label: '🚑 เหตุฉุกเฉินทางการแพทย์',    color: '#2563eb', bg: '#eff6ff' },
  { key: 'earthquake', label: '🌍 แผ่นดินไหว',               color: '#7c3aed', bg: '#f5f3ff' },
  { key: 'flood',      label: '🌊 น้ำท่วม',                  color: '#0891b2', bg: '#ecfeff' },
  { key: 'power',      label: '⚡ ไฟฟ้าขัดข้อง',             color: '#ca8a04', bg: '#fefce8' },
  { key: 'security',   label: '🔒 เหตุด้านความปลอดภัย',       color: '#64748b', bg: '#f1f5f9' },
  { key: 'explosion',  label: '💥 การระเบิด',                color: '#9a3412', bg: '#fff7ed' },
  { key: 'other',      label: '⚠️ อื่นๆ',                   color: '#475569', bg: '#f8fafc' },
];

export const PLAN_STATUS = {
  active:      { label: 'ใช้งาน',       color: '#16a34a', bg: '#dcfce7' },
  under_review:{ label: 'กำลังทบทวน',   color: '#d97706', bg: '#fef3c7' },
  obsolete:    { label: 'ยกเลิก',        color: '#94a3b8', bg: '#f1f5f9' },
};

export async function listEmergencyPlans({ type, status, lim = 200 } = {}) {
  const snap = await getDocs(query(collection(db, COL.emergencyPlans), orderBy('createdAt','desc'), limit(lim)));
  let rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (type)   rows = rows.filter(r => r.type === type);
  if (status) rows = rows.filter(r => r.status === status);
  return rows;
}

export async function getEmergencyPlan(id) {
  const snap = await getDoc(doc(db, COL.emergencyPlans, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createEmergencyPlan(data, createdBy) {
  return addDoc(collection(db, COL.emergencyPlans), {
    ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
}

export async function updateEmergencyPlan(id, data) {
  await updateDoc(doc(db, COL.emergencyPlans, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteEmergencyPlan(id) {
  await deleteDoc(doc(db, COL.emergencyPlans, id));
}

// ────────────────────────────────────────────
// Phase 18 — Chemical / Hazardous Material Register
// ────────────────────────────────────────────
export const GHS_CLASSES = [
  { key: 'explosive',      label: 'วัตถุระเบิด',           symbol: '💥', color: '#dc2626', bg: '#fee2e2' },
  { key: 'flammable',      label: 'ติดไฟได้',              symbol: '🔥', color: '#ea580c', bg: '#fff7ed' },
  { key: 'oxidizing',      label: 'ออกซิไดซ์',             symbol: '🔶', color: '#d97706', bg: '#fef3c7' },
  { key: 'compressed_gas', label: 'ก๊าซอัด',               symbol: '🟤', color: '#78350f', bg: '#fef3c7' },
  { key: 'corrosive',      label: 'กัดกร่อน',              symbol: '⚗️', color: '#7c3aed', bg: '#f5f3ff' },
  { key: 'toxic',          label: 'เป็นพิษเฉียบพลัน',       symbol: '☠️', color: '#9f1239', bg: '#fff1f2' },
  { key: 'harmful',        label: 'อันตรายต่อสุขภาพ',       symbol: '⚠️', color: '#ca8a04', bg: '#fefce8' },
  { key: 'env_hazard',     label: 'อันตรายต่อสิ่งแวดล้อม',  symbol: '🌿', color: '#15803d', bg: '#f0fdf4' },
  { key: 'non_hazardous',  label: 'ไม่อันตราย',             symbol: '✅', color: '#16a34a', bg: '#dcfce7' },
];

export const PHYSICAL_STATES = [
  { key: 'solid',  label: 'ของแข็ง' },
  { key: 'liquid', label: 'ของเหลว' },
  { key: 'gas',    label: 'ก๊าซ' },
  { key: 'aerosol',label: 'ละอองฝอย' },
  { key: 'powder', label: 'ผง' },
  { key: 'paste',  label: 'ครีม/แป้ง' },
];

export const CHEM_STATUS = {
  active:   { label: 'ใช้งาน',       color: '#16a34a', bg: '#dcfce7' },
  low_stock:{ label: 'สต็อกต่ำ',     color: '#d97706', bg: '#fef3c7' },
  disposed: { label: 'กำจัดแล้ว',    color: '#94a3b8', bg: '#f1f5f9' },
  expired:  { label: 'หมดอายุ/SDS',  color: '#dc2626', bg: '#fee2e2' },
};

export async function listChemicals({ ghsClass, status, lim = 300 } = {}) {
  const snap = await getDocs(query(collection(db, COL.chemicals), orderBy('createdAt','desc'), limit(lim)));
  let rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (ghsClass) rows = rows.filter(r => (r.ghsClasses||[]).includes(ghsClass));
  if (status)   rows = rows.filter(r => r.status === status);
  return rows;
}

export async function getChemical(id) {
  const snap = await getDoc(doc(db, COL.chemicals, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createChemical(data, createdBy) {
  return addDoc(collection(db, COL.chemicals), {
    ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
}

export async function updateChemical(id, data) {
  await updateDoc(doc(db, COL.chemicals, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteChemical(id) {
  await deleteDoc(doc(db, COL.chemicals, id));
}

// ────────────────────────────────────────────
// Phase 19 — Job Safety Analysis (JSA)
// ────────────────────────────────────────────
export const JSA_STATUS = {
  draft:    { label: 'ร่าง',          color: '#94a3b8', bg: '#f1f5f9' },
  approved: { label: 'อนุมัติแล้ว',   color: '#16a34a', bg: '#dcfce7' },
  active:   { label: 'กำลังใช้งาน',   color: '#2563eb', bg: '#eff6ff' },
  expired:  { label: 'หมดอายุ',       color: '#dc2626', bg: '#fee2e2' },
  cancelled:{ label: 'ยกเลิก',        color: '#64748b', bg: '#f8fafc' },
};

export const JSA_RISK = {
  high:   { label: 'สูง',    color: '#dc2626', bg: '#fee2e2', score: 3 },
  medium: { label: 'ปานกลาง', color: '#d97706', bg: '#fef3c7', score: 2 },
  low:    { label: 'ต่ำ',    color: '#16a34a', bg: '#dcfce7', score: 1 },
};

export const JSA_WORK_TYPES = [
  { key: 'forklift',    label: 'ขับรถโฟล์คลิฟท์' },
  { key: 'height',      label: 'ทำงานที่สูง' },
  { key: 'confined',    label: 'ที่อับอากาศ' },
  { key: 'electrical',  label: 'งานไฟฟ้า' },
  { key: 'hot_work',    label: 'งานร้อน / เชื่อม' },
  { key: 'chemical',    label: 'งานสารเคมี' },
  { key: 'manual',      label: 'ยกของด้วยมือ' },
  { key: 'machinery',   label: 'งานเครื่องจักร' },
  { key: 'loading',     label: 'รับ-ส่งสินค้า' },
  { key: 'maintenance', label: 'ซ่อมบำรุง' },
  { key: 'other',       label: 'อื่นๆ' },
];

export async function listJSA({ status, lim = 200 } = {}) {
  const snap = await getDocs(query(collection(db, COL.jsa), orderBy('createdAt','desc'), limit(lim)));
  let rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (status) rows = rows.filter(r => r.status === status);
  return rows;
}

export async function getJSA(id) {
  const snap = await getDoc(doc(db, COL.jsa, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createJSA(data, createdBy) {
  return addDoc(collection(db, COL.jsa), {
    ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
}

export async function updateJSA(id, data) {
  await updateDoc(doc(db, COL.jsa, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteJSA(id) {
  await deleteDoc(doc(db, COL.jsa, id));
}

// ────────────────────────────────────────────
// Phase 20 — Occupational Health Monitoring
// ────────────────────────────────────────────
export const HEALTH_EXAM_TYPES = [
  { key: 'pre_employment', label: 'ตรวจก่อนเข้างาน' },
  { key: 'annual',         label: 'ตรวจประจำปี' },
  { key: 'periodic',       label: 'ตรวจตามความเสี่ยง' },
  { key: 'return_to_work', label: 'ตรวจกลับเข้าทำงาน' },
  { key: 'exit',           label: 'ตรวจออกจากงาน' },
  { key: 'special',        label: 'ตรวจพิเศษ' },
];

export const HEALTH_TESTS = [
  { key: 'general',     label: 'ตรวจร่างกายทั่วไป' },
  { key: 'blood',       label: 'เจาะเลือด CBC/Chemistry' },
  { key: 'urine',       label: 'ตรวจปัสสาวะ' },
  { key: 'vision',      label: 'ตรวจสายตา' },
  { key: 'hearing',     label: 'ตรวจการได้ยิน (Audiometry)' },
  { key: 'lung',        label: 'ตรวจสมรรถภาพปอด (Spirometry)' },
  { key: 'xray',        label: 'X-Ray ทรวงอก' },
  { key: 'ekg',         label: 'คลื่นไฟฟ้าหัวใจ (EKG)' },
  { key: 'lead',        label: 'ตรวจสารตะกั่วในเลือด' },
  { key: 'cholinesterase', label: 'Cholinesterase (สารเคมีกำจัดศัตรูพืช)' },
];

export const HEALTH_RESULT = {
  normal:   { label: 'ปกติ',            color: '#16a34a', bg: '#dcfce7' },
  abnormal: { label: 'ผิดปกติ',         color: '#dc2626', bg: '#fee2e2' },
  followup: { label: 'ติดตามอาการ',     color: '#d97706', bg: '#fef3c7' },
  pending:  { label: 'รอผล',            color: '#94a3b8', bg: '#f1f5f9' },
};

export const FITNESS_STATUS = {
  fit:         { label: 'ทำงานได้ปกติ',       color: '#16a34a', bg: '#dcfce7' },
  restricted:  { label: 'ทำงานได้บางส่วน',    color: '#d97706', bg: '#fef3c7' },
  unfit:       { label: 'ไม่สามารถทำงานได้',   color: '#dc2626', bg: '#fee2e2' },
  pending:     { label: 'รอประเมิน',           color: '#94a3b8', bg: '#f1f5f9' },
};

export async function listHealthRecords({ department, result, lim = 300 } = {}) {
  const snap = await getDocs(query(collection(db, COL.healthRecords), orderBy('examDate','desc'), limit(lim)));
  let rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (department) rows = rows.filter(r => r.department === department);
  if (result)     rows = rows.filter(r => r.overallResult === result);
  return rows;
}

export async function getHealthRecord(id) {
  const snap = await getDoc(doc(db, COL.healthRecords, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createHealthRecord(data, createdBy) {
  return addDoc(collection(db, COL.healthRecords), {
    ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
}

export async function updateHealthRecord(id, data) {
  await updateDoc(doc(db, COL.healthRecords, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteHealthRecord(id) {
  await deleteDoc(doc(db, COL.healthRecords, id));
}

// ────────────────────────────────────────────
// Phase 21 — Safety Action Plan
// ────────────────────────────────────────────
export const SAP_CATEGORIES = [
  { key: 'training',    label: 'ฝึกอบรม',              icon: '📚' },
  { key: 'inspection',  label: 'ตรวจสอบ',               icon: '🔍' },
  { key: 'equipment',   label: 'อุปกรณ์ความปลอดภัย',    icon: '🦺' },
  { key: 'emergency',   label: 'แผนฉุกเฉิน / ซ้อมแผน',  icon: '🚨' },
  { key: 'bbs',         label: 'BBS / Safety Culture',  icon: '👁️' },
  { key: 'health',      label: 'อาชีวอนามัย',            icon: '🏥' },
  { key: 'legal',       label: 'กฎหมาย / มาตรฐาน',       icon: '⚖️' },
  { key: 'risk',        label: 'ประเมินความเสี่ยง',       icon: '⚠️' },
  { key: 'chemical',    label: 'สารเคมี',                icon: '⚗️' },
  { key: 'environment', label: 'สิ่งแวดล้อมการทำงาน',    icon: '🌿' },
  { key: 'other',       label: 'อื่นๆ',                  icon: '📌' },
];

export const SAP_STATUS = {
  planned:     { label: 'วางแผนแล้ว',  color: '#94a3b8', bg: '#f1f5f9' },
  in_progress: { label: 'กำลังดำเนินการ', color: '#2563eb', bg: '#eff6ff' },
  completed:   { label: 'เสร็จสิ้น',   color: '#16a34a', bg: '#dcfce7' },
  delayed:     { label: 'ล่าช้า',       color: '#dc2626', bg: '#fee2e2' },
  cancelled:   { label: 'ยกเลิก',       color: '#64748b', bg: '#f8fafc' },
};

export async function listActionPlan({ year, category, status, lim = 300 } = {}) {
  const snap = await getDocs(query(collection(db, COL.actionPlan), orderBy('createdAt','desc'), limit(lim)));
  let rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (year)     rows = rows.filter(r => r.year === year);
  if (category) rows = rows.filter(r => r.category === category);
  if (status)   rows = rows.filter(r => r.status === status);
  return rows;
}

export async function getActionPlanItem(id) {
  const snap = await getDoc(doc(db, COL.actionPlan, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createActionPlanItem(data, createdBy) {
  return addDoc(collection(db, COL.actionPlan), {
    ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
}

export async function updateActionPlanItem(id, data) {
  await updateDoc(doc(db, COL.actionPlan, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteActionPlanItem(id) {
  await deleteDoc(doc(db, COL.actionPlan, id));
}

// ────────────────────────────────────────────
// Phase 22 — Workplace Environment Monitoring
// ────────────────────────────────────────────
export const ENV_PARAMETERS = [
  { key: 'noise',       label: 'ระดับเสียง',           unit: 'dB(A)',  limit: 85,   limitLabel: '≤ 85 dB(A)',    icon: '🔊' },
  { key: 'heat_wbgt',   label: 'ความร้อน (WBGT)',       unit: '°C',     limit: 34,   limitLabel: '≤ 34°C (งานเบา)', icon: '🌡️' },
  { key: 'heat_air',    label: 'อุณหภูมิอากาศ',         unit: '°C',     limit: 38,   limitLabel: '≤ 38°C',        icon: '🌡️' },
  { key: 'light',       label: 'ความเข้มแสง',           unit: 'lux',    limit: 300,  limitLabel: '≥ 300 lux',     icon: '💡', higher: true },
  { key: 'humidity',    label: 'ความชื้นสัมพัทธ์',       unit: '%RH',    limit: 70,   limitLabel: '≤ 70 %RH',      icon: '💧' },
  { key: 'dust_tsp',    label: 'ฝุ่นรวม (TSP)',         unit: 'mg/m³',  limit: 15,   limitLabel: '≤ 15 mg/m³',    icon: '🌫️' },
  { key: 'dust_resp',   label: 'ฝุ่นหายใจเข้า',         unit: 'mg/m³',  limit: 5,    limitLabel: '≤ 5 mg/m³',     icon: '🌫️' },
  { key: 'co',          label: 'ก๊าซคาร์บอนมอนอกไซด์ (CO)', unit: 'ppm', limit: 25, limitLabel: '≤ 25 ppm',      icon: '☁️' },
  { key: 'co2',         label: 'ก๊าซคาร์บอนไดออกไซด์ (CO₂)', unit: 'ppm', limit: 5000, limitLabel: '≤ 5000 ppm', icon: '☁️' },
  { key: 'voc',         label: 'สารอินทรีย์ระเหยง่าย (VOC)', unit: 'ppm', limit: 50, limitLabel: '≤ 50 ppm',     icon: '⚗️' },
  { key: 'vibration',   label: 'การสั่นสะเทือน (มือ-แขน)', unit: 'm/s²', limit: 5, limitLabel: '≤ 5 m/s² (8h)', icon: '📳' },
  { key: 'other',       label: 'พารามิเตอร์อื่นๆ',       unit: '',      limit: null, limitLabel: '—',             icon: '📊' },
];

export const ENV_RESULT = {
  pass:    { label: 'ผ่านมาตรฐาน',    color: '#16a34a', bg: '#dcfce7' },
  fail:    { label: 'เกินมาตรฐาน',    color: '#dc2626', bg: '#fee2e2' },
  warning: { label: 'ใกล้เกินมาตรฐาน', color: '#d97706', bg: '#fef3c7' },
  pending: { label: 'รอประเมิน',      color: '#94a3b8', bg: '#f1f5f9' },
};

export async function listEnvMonitor({ parameter, result, lim = 300 } = {}) {
  const snap = await getDocs(query(collection(db, COL.envMonitor), orderBy('measureDate','desc'), limit(lim)));
  let rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (parameter) rows = rows.filter(r => r.parameter === parameter);
  if (result)    rows = rows.filter(r => r.result === result);
  return rows;
}

export async function getEnvMonitorRecord(id) {
  const snap = await getDoc(doc(db, COL.envMonitor, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createEnvMonitorRecord(data, createdBy) {
  return addDoc(collection(db, COL.envMonitor), {
    ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
}

export async function updateEnvMonitorRecord(id, data) {
  await updateDoc(doc(db, COL.envMonitor, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteEnvMonitorRecord(id) {
  await deleteDoc(doc(db, COL.envMonitor, id));
}

// ────────────────────────────────────────────
// Phase 23 — Waste Management
// ────────────────────────────────────────────
export const WASTE_TYPES = [
  { key: 'general',    label: 'ขยะทั่วไป',        icon: '🗑️',  color: '#64748b', bg: '#f1f5f9' },
  { key: 'hazardous',  label: 'ขยะอันตราย',       icon: '☠️',  color: '#dc2626', bg: '#fee2e2' },
  { key: 'chemical',   label: 'ของเสียสารเคมี',    icon: '⚗️',  color: '#7c3aed', bg: '#f5f3ff' },
  { key: 'recyclable', label: 'รีไซเคิล',          icon: '♻️',  color: '#16a34a', bg: '#dcfce7' },
  { key: 'organic',    label: 'ขยะอินทรีย์',       icon: '🌿',  color: '#65a30d', bg: '#f7fee7' },
  { key: 'electronic', label: 'ขยะอิเล็กทรอนิกส์', icon: '💻',  color: '#0891b2', bg: '#ecfeff' },
  { key: 'medical',    label: 'ขยะติดเชื้อ',       icon: '🏥',  color: '#e11d48', bg: '#fff1f2' },
  { key: 'other',      label: 'อื่นๆ',             icon: '📦',  color: '#94a3b8', bg: '#f8fafc' },
];

export const WASTE_DISPOSAL_METHODS = [
  { key: 'vendor',      label: 'ส่งบริษัทรับกำจัด' },
  { key: 'recycle',     label: 'รีไซเคิล / ขายซาก' },
  { key: 'incinerate',  label: 'เผาทำลาย' },
  { key: 'landfill',    label: 'ฝังกลบ' },
  { key: 'treatment',   label: 'บำบัดภายใน' },
  { key: 'return',      label: 'ส่งคืนผู้ผลิต' },
  { key: 'other',       label: 'อื่นๆ' },
];

export const WASTE_STATUS = {
  pending:    { label: 'รอกำจัด',      color: '#d97706', bg: '#fef3c7' },
  in_transit: { label: 'อยู่ระหว่างขนส่ง', color: '#2563eb', bg: '#eff6ff' },
  disposed:   { label: 'กำจัดแล้ว',    color: '#16a34a', bg: '#dcfce7' },
  stored:     { label: 'เก็บพักชั่วคราว', color: '#94a3b8', bg: '#f1f5f9' },
};

export const WASTE_UNITS = ['กก.', 'ตัน', 'ลิตร', 'ถัง (200L)', 'ถุง', 'กล่อง', 'ชิ้น', 'ชุด'];

export async function listWaste({ type, status, lim = 300 } = {}) {
  const snap = await getDocs(query(collection(db, COL.waste), orderBy('generatedDate','desc'), limit(lim)));
  let rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (type)   rows = rows.filter(r => r.wasteType === type);
  if (status) rows = rows.filter(r => r.status    === status);
  return rows;
}

export async function getWasteRecord(id) {
  const snap = await getDoc(doc(db, COL.waste, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createWasteRecord(data, createdBy) {
  return addDoc(collection(db, COL.waste), {
    ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
}

export async function updateWasteRecord(id, data) {
  await updateDoc(doc(db, COL.waste, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteWasteRecord(id) {
  await deleteDoc(doc(db, COL.waste, id));
}

// ────────────────────────────────────────────
// Phase 25 — Safety Audit Management
// ────────────────────────────────────────────
export const AUDIT_TYPES = [
  { key:'internal',    label:'ตรวจสอบภายใน',           icon:'🏢', color:'#1e3a5f', bg:'#eff6ff' },
  { key:'external',    label:'ตรวจสอบภายนอก',          icon:'🏛', color:'#7c3aed', bg:'#f5f3ff' },
  { key:'regulatory',  label:'หน่วยงานรัฐ (กรมแรงงาน)', icon:'📜', color:'#dc2626', bg:'#fee2e2' },
  { key:'iso45001',    label:'ISO 45001 / มรท.',        icon:'🏅', color:'#0891b2', bg:'#ecfeff' },
  { key:'self',        label:'Self-Assessment',         icon:'📋', color:'#16a34a', bg:'#dcfce7' },
];

export const AUDIT_STATUS = {
  planned:     { label:'วางแผนแล้ว',      color:'#64748b', bg:'#f1f5f9' },
  in_progress: { label:'กำลังตรวจสอบ',    color:'#2563eb', bg:'#eff6ff' },
  completed:   { label:'เสร็จสิ้น',        color:'#16a34a', bg:'#dcfce7' },
  cancelled:   { label:'ยกเลิก',           color:'#94a3b8', bg:'#f8fafc' },
};

export const FINDING_SEVERITY = {
  critical:    { label:'Critical (วิกฤต)',    color:'#dc2626', bg:'#fee2e2', score:4 },
  major:       { label:'Major (สำคัญ)',       color:'#ea580c', bg:'#fff7ed', score:3 },
  minor:       { label:'Minor (เล็กน้อย)',    color:'#d97706', bg:'#fef3c7', score:2 },
  observation: { label:'Observation (สังเกต)',color:'#2563eb', bg:'#eff6ff', score:1 },
  positive:    { label:'Positive Finding',    color:'#16a34a', bg:'#dcfce7', score:0 },
};

export const FINDING_STATUS = {
  open:       { label:'เปิดอยู่',   color:'#dc2626', bg:'#fee2e2' },
  in_progress:{ label:'กำลังแก้ไข', color:'#d97706', bg:'#fef3c7' },
  closed:     { label:'ปิดแล้ว',    color:'#16a34a', bg:'#dcfce7' },
  verified:   { label:'ยืนยันแล้ว', color:'#0891b2', bg:'#ecfeff' },
};

export const AUDIT_SCOPES = [
  'ระบบจัดการความปลอดภัย (SMS)', 'การจัดการอุบัติเหตุ', 'การฝึกอบรม',
  'การตรวจสอบสถานที่', 'อุปกรณ์ PPE', 'สารเคมีอันตราย', 'ไฟฟ้าและพลังงาน',
  'การจัดการผู้รับเหมา', 'แผนฉุกเฉิน', 'สุขอนามัยอาชีพ', 'สิ่งแวดล้อม',
  'เอกสารและบันทึก', 'กฎหมายและข้อกำหนด', 'JSA/Risk Assessment',
];

export async function listAudits({ status, type, lim = 200 } = {}) {
  const snap = await getDocs(query(collection(db, COL.audits), orderBy('auditDate','desc'), limit(lim)));
  let rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (status) rows = rows.filter(r => r.status === status);
  if (type)   rows = rows.filter(r => r.auditType === type);
  return rows;
}

export async function getAudit(id) {
  const snap = await getDoc(doc(db, COL.audits, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createAudit(data, createdBy) {
  return addDoc(collection(db, COL.audits), {
    ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
}

export async function updateAudit(id, data) {
  await updateDoc(doc(db, COL.audits, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteAudit(id) {
  await deleteDoc(doc(db, COL.audits, id));
}

export async function listFindings({ auditId, severity, status: fStatus, lim = 500 } = {}) {
  let constraints = [orderBy('createdAt','desc'), limit(lim)];
  if (auditId) constraints.unshift(where('auditId','==',auditId));
  const snap = await getDocs(query(collection(db, COL.auditFindings), ...constraints));
  let rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (severity) rows = rows.filter(r => r.severity === severity);
  if (fStatus)  rows = rows.filter(r => r.status   === fStatus);
  return rows;
}

export async function createFinding(data, createdBy) {
  return addDoc(collection(db, COL.auditFindings), {
    ...data, createdBy, status: data.status || 'open',
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
}

export async function updateFinding(id, data) {
  await updateDoc(doc(db, COL.auditFindings, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteFinding(id) {
  await deleteDoc(doc(db, COL.auditFindings, id));
}

// ────────────────────────────────────────────
// Phase 26 — Safety Induction
// ────────────────────────────────────────────
export const INDUCTION_TYPES = [
  { key:'new_employee', label:'พนักงานใหม่',   icon:'🆕', color:'#1e3a5f', bg:'#eff6ff',  validDays:365 },
  { key:'contractor',   label:'ผู้รับเหมา',     icon:'🔧', color:'#d97706', bg:'#fef3c7',  validDays:180 },
  { key:'visitor',      label:'ผู้เยี่ยมชม',   icon:'🏷️', color:'#0891b2', bg:'#ecfeff',  validDays:1   },
  { key:'transfer',     label:'โอนย้าย/เปลี่ยนแผนก', icon:'🔄', color:'#7c3aed', bg:'#f5f3ff', validDays:365 },
  { key:'refresher',    label:'ทบทวนประจำปี',   icon:'🔁', color:'#16a34a', bg:'#dcfce7',  validDays:365 },
];

export const INDUCTION_TOPICS = [
  'นโยบายความปลอดภัย อาชีวอนามัย และสภาพแวดล้อมการทำงาน',
  'กฎระเบียบและข้อห้ามภายในโรงงาน',
  'การใช้อุปกรณ์ป้องกันส่วนบุคคล (PPE)',
  'เส้นทางอพยพและจุดรวมพล',
  'ขั้นตอนการแจ้งอุบัติเหตุและเหตุฉุกเฉิน',
  'การใช้ถังดับเพลิงและอุปกรณ์ฉุกเฉิน',
  'ความปลอดภัยในการยกและเคลื่อนย้ายสิ่งของ',
  'ความปลอดภัยด้านไฟฟ้า',
  'การจัดการสารเคมีอันตรายเบื้องต้น',
  'การขับขี่ยานพาหนะในโรงงาน (Forklift/รถเข็น)',
  'การทำงานในพื้นที่อับอากาศ (เบื้องต้น)',
  'ความปลอดภัยในการทำงานที่สูง (เบื้องต้น)',
  'การปฐมพยาบาลเบื้องต้น',
  'ข้อกำหนดด้านสิ่งแวดล้อมและการจัดการของเสีย',
  'บทบาทของ คปอ. และช่องทางรายงานปัญหา',
];

export async function listInduction({ type, status, lim = 300 } = {}) {
  const snap = await getDocs(query(collection(db, COL.induction), orderBy('inductionDate','desc'), limit(lim)));
  let rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (type)   rows = rows.filter(r => r.inductionType === type);
  if (status) {
    const today = new Date().toISOString().slice(0,10);
    const soon  = new Date(Date.now() + 30*86400000).toISOString().slice(0,10);
    if (status === 'valid')    rows = rows.filter(r => r.validUntil >= today);
    if (status === 'expiring') rows = rows.filter(r => r.validUntil >= today && r.validUntil <= soon);
    if (status === 'expired')  rows = rows.filter(r => !r.validUntil || r.validUntil < today);
  }
  return rows;
}

export async function getInductionRecord(id) {
  const snap = await getDoc(doc(db, COL.induction, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createInductionRecord(data, createdBy) {
  return addDoc(collection(db, COL.induction), {
    ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
}

export async function updateInductionRecord(id, data) {
  await updateDoc(doc(db, COL.induction, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteInductionRecord(id) {
  await deleteDoc(doc(db, COL.induction, id));
}

// ────────────────────────────────────────────
// Phase 28 — Fire Safety Equipment
// ────────────────────────────────────────────
export const FIRE_EQ_TYPES = [
  { key:'co2',         label:'CO₂',              icon:'🔵', color:'#2563eb', bg:'#eff6ff' },
  { key:'dry_powder',  label:'ผงเคมีแห้ง (ABC)', icon:'🔴', color:'#dc2626', bg:'#fee2e2' },
  { key:'foam',        label:'โฟม (Foam)',        icon:'🟡', color:'#d97706', bg:'#fef3c7' },
  { key:'water',       label:'น้ำ (Water)',        icon:'💧', color:'#0891b2', bg:'#ecfeff' },
  { key:'clean_agent', label:'Clean Agent',       icon:'⚪', color:'#64748b', bg:'#f1f5f9' },
  { key:'fire_hose',   label:'สายดับเพลิง',       icon:'🌊', color:'#0369a1', bg:'#e0f2fe' },
  { key:'sprinkler',   label:'Sprinkler',         icon:'💦', color:'#0891b2', bg:'#ecfeff' },
  { key:'fire_alarm',  label:'สัญญาณเตือนไฟไหม้', icon:'🔔', color:'#ea580c', bg:'#fff7ed' },
  { key:'other',       label:'อื่นๆ',             icon:'🧯', color:'#94a3b8', bg:'#f8fafc' },
];

export const FIRE_EQ_STATUS = {
  active:      { label:'ใช้งานได้',     color:'#16a34a', bg:'#dcfce7' },
  due_soon:    { label:'ใกล้ถึงกำหนด',  color:'#d97706', bg:'#fef3c7' },
  overdue:     { label:'เกินกำหนด',     color:'#dc2626', bg:'#fee2e2' },
  expired:     { label:'หมดอายุ',       color:'#9f1239', bg:'#fff1f2' },
  maintenance: { label:'ซ่อมบำรุง',     color:'#7c3aed', bg:'#f5f3ff' },
  decommission:{ label:'ปลดระวาง',      color:'#94a3b8', bg:'#f1f5f9' },
};

export const FIRE_INSP_RESULT = {
  pass:   { label:'ผ่าน', color:'#16a34a', bg:'#dcfce7' },
  fail:   { label:'ไม่ผ่าน', color:'#dc2626', bg:'#fee2e2' },
  repair: { label:'ต้องซ่อม', color:'#d97706', bg:'#fef3c7' },
};

export async function listFireEq({ type, status, lim = 500 } = {}) {
  const snap = await getDocs(query(collection(db, COL.fireEq), orderBy('location','asc'), limit(lim)));
  let rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (type)   rows = rows.filter(r => r.eqType === type);
  if (status) rows = rows.filter(r => r.status === status);
  return rows;
}

export async function getFireEq(id) {
  const snap = await getDoc(doc(db, COL.fireEq, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createFireEq(data, createdBy) {
  return addDoc(collection(db, COL.fireEq), {
    ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
}

export async function updateFireEq(id, data) {
  await updateDoc(doc(db, COL.fireEq, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteFireEq(id) {
  await deleteDoc(doc(db, COL.fireEq, id));
}

// ────────────────────────────────────────────
// Phase 29 — PPE Issuance & Management
// ────────────────────────────────────────────
export const PPE_ITEMS = [
  { key:'hard_hat',       label:'หมวกนิรภัย',          icon:'⛑️',  category:'head',        replaceMonths:12 },
  { key:'safety_shoes',   label:'รองเท้านิรภัย',        icon:'👟',  category:'feet',        replaceMonths:12 },
  { key:'safety_glasses', label:'แว่นตานิรภัย',         icon:'🥽',  category:'eyes',        replaceMonths:6  },
  { key:'face_shield',    label:'Face Shield',          icon:'🛡️', category:'eyes',        replaceMonths:12 },
  { key:'welding_mask',   label:'หน้ากากเชื่อม',        icon:'🔆',  category:'eyes',        replaceMonths:24 },
  { key:'ear_plug',       label:'ที่อุดหู',              icon:'🔇',  category:'hearing',     replaceMonths:3  },
  { key:'earmuff',        label:'ที่ครอบหู',             icon:'🎧',  category:'hearing',     replaceMonths:12 },
  { key:'dust_mask',      label:'หน้ากากกันฝุ่น (N95)',  icon:'😷',  category:'respiratory', replaceMonths:1  },
  { key:'half_mask',      label:'หน้ากากครึ่งหน้า',      icon:'😷',  category:'respiratory', replaceMonths:6  },
  { key:'gloves_fabric',  label:'ถุงมือผ้า',             icon:'🧤',  category:'hands',       replaceMonths:1  },
  { key:'gloves_rubber',  label:'ถุงมือยาง',             icon:'🧤',  category:'hands',       replaceMonths:3  },
  { key:'gloves_leather', label:'ถุงมือหนัง',            icon:'🧤',  category:'hands',       replaceMonths:6  },
  { key:'vest',           label:'เสื้อสะท้อนแสง',        icon:'🦺',  category:'body',        replaceMonths:12 },
  { key:'harness',        label:'Full Body Harness',     icon:'🪢',  category:'fall',        replaceMonths:36 },
  { key:'other',          label:'อื่นๆ',                 icon:'📦',  category:'other',       replaceMonths:12 },
];

export const PPE_CATEGORIES = {
  head:        { label:'ศีรษะ',       icon:'⛑️'  },
  eyes:        { label:'ตา/ใบหน้า',  icon:'🥽'  },
  hearing:     { label:'การได้ยิน',   icon:'🎧'  },
  respiratory: { label:'ระบบหายใจ',   icon:'😷'  },
  hands:       { label:'มือ',         icon:'🧤'  },
  feet:        { label:'เท้า',        icon:'👟'  },
  body:        { label:'ลำตัว',       icon:'🦺'  },
  fall:        { label:'ป้องกันตก',   icon:'🪢'  },
  other:       { label:'อื่นๆ',       icon:'📦'  },
};

export const PPE_CONDITION = {
  good:    { label:'สภาพดี',      color:'#16a34a', bg:'#dcfce7' },
  worn:    { label:'เก่า/สึกหรอ', color:'#d97706', bg:'#fef3c7' },
  damaged: { label:'ชำรุด',       color:'#dc2626', bg:'#fee2e2' },
  lost:    { label:'สูญหาย',      color:'#94a3b8', bg:'#f1f5f9' },
};

export async function listPPEIssuance({ dept, ppeItem, lim = 500 } = {}) {
  const snap = await getDocs(query(collection(db, COL.ppeIssue), orderBy('issueDate','desc'), limit(lim)));
  let rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (dept)    rows = rows.filter(r => r.department === dept);
  if (ppeItem) rows = rows.filter(r => r.ppeItem    === ppeItem);
  return rows;
}

export async function getPPERecord(id) {
  const snap = await getDoc(doc(db, COL.ppeIssue, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createPPERecord(data, createdBy) {
  return addDoc(collection(db, COL.ppeIssue), {
    ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
}

export async function updatePPERecord(id, data) {
  await updateDoc(doc(db, COL.ppeIssue, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deletePPERecord(id) {
  await deleteDoc(doc(db, COL.ppeIssue, id));
}

// ────────────────────────────────────────────
// Phase 30 — First Aid & Medical Log (บันทึกปฐมพยาบาล)
// ────────────────────────────────────────────
export const FA_COMPLAINT_TYPES = [
  { key:'wound',        label:'บาดแผล / ฉีกขาด',    icon:'🩹' },
  { key:'burn',         label:'แผลไฟไหม้ / น้ำร้อน',  icon:'🔥' },
  { key:'eye_injury',   label:'อาการทางตา',            icon:'👁️' },
  { key:'headache',     label:'ปวดศีรษะ / วิงเวียน',  icon:'🤕' },
  { key:'body_pain',    label:'ปวดเมื่อยร่างกาย',     icon:'💪' },
  { key:'nausea',       label:'คลื่นไส้ / อาเจียน',   icon:'🤢' },
  { key:'rash',         label:'ผื่น / แพ้ผิวหนัง',    icon:'🔴' },
  { key:'respiratory',  label:'หายใจลำบาก / แน่นหน้าอก', icon:'😮‍💨' },
  { key:'chemical',     label:'สัมผัสสารเคมี',         icon:'⚗️' },
  { key:'fracture',     label:'กระดูกแตก / ข้อเคลื่อน', icon:'🦴' },
  { key:'electric',     label:'ไฟฟ้าช็อต',             icon:'⚡' },
  { key:'heat_stress',  label:'ลมแดด / เพลียแดด',      icon:'☀️' },
  { key:'other',        label:'อื่นๆ',                  icon:'📋' },
];

export const FA_BODY_PARTS = [
  'ศีรษะ/หน้า','ตา','หู','จมูก/ปาก','คอ',
  'ไหล่','แขน (ขวา)','แขน (ซ้าย)','ข้อมือ/มือ (ขวา)','ข้อมือ/มือ (ซ้าย)','นิ้วมือ',
  'หน้าอก/ซี่โครง','หลัง/เอว','ท้อง',
  'ขา (ขวา)','ขา (ซ้าย)','เข่า','ข้อเท้า/เท้า (ขวา)','ข้อเท้า/เท้า (ซ้าย)','นิ้วเท้า',
  'ทั่วร่างกาย','ไม่ระบุ',
];

export const FA_TREATMENTS = [
  { key:'clean_wound',   label:'ทำความสะอาดบาดแผล' },
  { key:'bandage',       label:'พันแผล / ปิดแผล' },
  { key:'cold_compress', label:'ประคบเย็น' },
  { key:'hot_compress',  label:'ประคบร้อน' },
  { key:'eye_wash',      label:'ล้างตา' },
  { key:'otc_medicine',  label:'จ่ายยาสามัญประจำบ้าน' },
  { key:'rest',          label:'พักผ่อน' },
  { key:'refer_occ',     label:'ส่งต่อแพทย์อาชีวอนามัย' },
  { key:'refer_hospital',label:'ส่งโรงพยาบาล' },
  { key:'call_ambulance',label:'เรียกรถพยาบาล' },
  { key:'other',         label:'อื่นๆ' },
];

export const FA_OUTCOMES = {
  returned:  { label:'กลับทำงาน',            color:'#16a34a', bg:'#dcfce7' },
  rested:    { label:'พักในบริษัท',           color:'#0891b2', bg:'#ecfeff' },
  referred:  { label:'ส่งแพทย์/โรงพยาบาล',   color:'#d97706', bg:'#fef3c7' },
  leave:     { label:'ลาป่วย/หยุดงาน',        color:'#dc2626', bg:'#fee2e2' },
};

export async function listFirstAid({ dept, lim = 500 } = {}) {
  const snap = await getDocs(query(collection(db, COL.firstAid), orderBy('visitDate','desc'), limit(lim)));
  let rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (dept) rows = rows.filter(r => r.department === dept);
  return rows;
}

export async function getFirstAidRecord(id) {
  const snap = await getDoc(doc(db, COL.firstAid, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createFirstAidRecord(data, createdBy) {
  return addDoc(collection(db, COL.firstAid), {
    ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
}

export async function updateFirstAidRecord(id, data) {
  await updateDoc(doc(db, COL.firstAid, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteFirstAidRecord(id) {
  await deleteDoc(doc(db, COL.firstAid, id));
}

// ────────────────────────────────────────────
// Phase 31 — Safety Violation & Disciplinary Record
// ────────────────────────────────────────────
export const VIOLATION_TYPES = [
  { key:'no_ppe',          label:'ไม่สวมใส่ PPE',                  icon:'🦺' },
  { key:'unsafe_act',      label:'กระทำการไม่ปลอดภัย',             icon:'⚠️' },
  { key:'no_ptw',          label:'ทำงานโดยไม่มี PTW',              icon:'📝' },
  { key:'confined_space',  label:'เข้า Confined Space โดยไม่ได้รับอนุญาต', icon:'🚫' },
  { key:'no_lockout',      label:'ไม่ทำ LOTO ก่อนซ่อมบำรุง',       icon:'🔒' },
  { key:'fire_hazard',     label:'ก่อให้เกิดความเสี่ยงไฟไหม้',     icon:'🔥' },
  { key:'housekeeping',    label:'ละเลยความสะอาดและความเป็นระเบียบ', icon:'🧹' },
  { key:'horseplay',       label:'เล่นหยอกล้อในพื้นที่อันตราย',     icon:'🎭' },
  { key:'speed',           label:'ขับรถเร็วเกินกำหนด',              icon:'🚗' },
  { key:'no_report',       label:'ไม่รายงานอุบัติเหตุ/Near Miss',   icon:'🔇' },
  { key:'alcohol_drug',    label:'ดื่มสุรา/ใช้สารเสพติดในพื้นที่',  icon:'🍺' },
  { key:'mobile_phone',    label:'ใช้โทรศัพท์ขณะทำงานอันตราย',     icon:'📱' },
  { key:'other',           label:'อื่นๆ',                            icon:'📋' },
];

export const VIOLATION_SEVERITY = {
  minor:    { label:'เล็กน้อย',  color:'#ca8a04', bg:'#fefce8', level:1 },
  moderate: { label:'ปานกลาง',  color:'#d97706', bg:'#fef3c7', level:2 },
  major:    { label:'รุนแรง',   color:'#dc2626', bg:'#fee2e2', level:3 },
  critical: { label:'ร้ายแรงมาก', color:'#7f1d1d', bg:'#fef2f2', level:4 },
};

export const DISCIPLINARY_ACTIONS = [
  { key:'verbal_warning',   label:'ตักเตือนด้วยวาจา' },
  { key:'written_warning1', label:'ทำทัณฑ์บนครั้งที่ 1 (หนังสือ)' },
  { key:'written_warning2', label:'ทำทัณฑ์บนครั้งที่ 2 (หนังสือ)' },
  { key:'retraining',       label:'อบรมซ้ำ / ทดสอบความรู้ใหม่' },
  { key:'suspension',       label:'พักงานชั่วคราว' },
  { key:'salary_deduction', label:'หักเงินเดือน' },
  { key:'termination',      label:'เลิกจ้าง' },
  { key:'other',            label:'อื่นๆ' },
];

export const VIOLATION_STATUS = {
  open:     { label:'รอดำเนินการ', color:'#d97706', bg:'#fef3c7' },
  actioned: { label:'ดำเนินการแล้ว', color:'#0891b2', bg:'#ecfeff' },
  closed:   { label:'ปิดเรื่อง',    color:'#16a34a', bg:'#dcfce7' },
};

export async function listViolations({ dept, lim = 500 } = {}) {
  const snap = await getDocs(query(collection(db, COL.violations), orderBy('violationDate','desc'), limit(lim)));
  let rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (dept) rows = rows.filter(r => r.department === dept);
  return rows;
}

export async function getViolation(id) {
  const snap = await getDoc(doc(db, COL.violations, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createViolation(data, createdBy) {
  return addDoc(collection(db, COL.violations), {
    ...data, status:'open', createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
}

export async function updateViolation(id, data) {
  await updateDoc(doc(db, COL.violations, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteViolation(id) {
  await deleteDoc(doc(db, COL.violations, id));
}

// ────────────────────────────────────────────
// Phase 32 — Safety Shift Handover (บันทึกส่งกะ)
// ────────────────────────────────────────────
export const SHIFT_TYPES = {
  morning:   { label:'กะเช้า',   icon:'🌅', time:'06:00–14:00', color:'#d97706', bg:'#fef3c7' },
  afternoon: { label:'กะบ่าย',   icon:'🌤️', time:'14:00–22:00', color:'#0891b2', bg:'#ecfeff' },
  night:     { label:'กะดึก',    icon:'🌙', time:'22:00–06:00', color:'#6d28d9', bg:'#f5f3ff' },
  day:       { label:'กะกลางวัน',icon:'☀️', time:'08:00–17:00', color:'#16a34a', bg:'#dcfce7' },
};

export const HANDOVER_STATUS = {
  pending:     { label:'รอรับทราบ', color:'#d97706', bg:'#fef3c7' },
  acknowledged:{ label:'รับทราบแล้ว', color:'#16a34a', bg:'#dcfce7' },
};

export const OVERALL_SAFETY_STATUS = [
  { key:'green',  label:'ปลอดภัย / ปกติ',         color:'#16a34a', bg:'#dcfce7', icon:'🟢' },
  { key:'yellow', label:'ระวัง / มีประเด็นติดตาม', color:'#d97706', bg:'#fef3c7', icon:'🟡' },
  { key:'red',    label:'อันตราย / ต้องแจ้งด่วน',  color:'#dc2626', bg:'#fee2e2', icon:'🔴' },
];

export async function listHandovers({ lim = 200 } = {}) {
  const snap = await getDocs(query(collection(db, COL.handover), orderBy('shiftDate','desc'), limit(lim)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getHandover(id) {
  const snap = await getDoc(doc(db, COL.handover, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createHandover(data, createdBy) {
  return addDoc(collection(db, COL.handover), {
    ...data, status:'pending', createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
}

export async function updateHandover(id, data) {
  await updateDoc(doc(db, COL.handover, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteHandover(id) {
  await deleteDoc(doc(db, COL.handover, id));
}

// ────────────────────────────────────────────
// Phase 33 — Safety Suggestion System (กล่องข้อเสนอแนะ)
// ────────────────────────────────────────────
export const SUGGESTION_CATEGORIES = [
  { key:'ppe',         label:'PPE / อุปกรณ์ป้องกัน',      icon:'🦺' },
  { key:'procedure',   label:'ขั้นตอน / วิธีการทำงาน',    icon:'📋' },
  { key:'equipment',   label:'เครื่องจักร / เครื่องมือ',   icon:'⚙️' },
  { key:'environment', label:'สภาพแวดล้อมการทำงาน',        icon:'🏭' },
  { key:'training',    label:'การฝึกอบรม',                 icon:'📚' },
  { key:'housekeeping',label:'ความสะอาด / 5ส',             icon:'🧹' },
  { key:'signage',     label:'ป้ายเตือน / สัญลักษณ์',      icon:'🚧' },
  { key:'emergency',   label:'แผนฉุกเฉิน / อพยพ',          icon:'🚨' },
  { key:'other',       label:'อื่นๆ',                       icon:'💡' },
];

export const SUGGESTION_STATUS = {
  submitted:     { label:'รอรีวิว',          color:'#6b7280', bg:'#f3f4f6',  step:1 },
  under_review:  { label:'กำลังพิจารณา',    color:'#0891b2', bg:'#ecfeff',  step:2 },
  approved:      { label:'อนุมัติ',           color:'#16a34a', bg:'#dcfce7',  step:3 },
  implementing:  { label:'กำลังดำเนินการ',   color:'#d97706', bg:'#fef3c7',  step:4 },
  implemented:   { label:'นำไปใช้แล้ว ✅',   color:'#15803d', bg:'#bbf7d0',  step:5 },
  rejected:      { label:'ไม่อนุมัติ',        color:'#dc2626', bg:'#fee2e2',  step:0 },
};

export const SUGGESTION_IMPACT = {
  low:    { label:'ผลกระทบน้อย',    color:'#6b7280', bg:'#f3f4f6' },
  medium: { label:'ผลกระทบปานกลาง', color:'#0891b2', bg:'#ecfeff' },
  high:   { label:'ผลกระทบสูง',     color:'#d97706', bg:'#fef3c7' },
  critical:{ label:'สำคัญมาก',      color:'#dc2626', bg:'#fee2e2' },
};

export async function listSuggestions({ lim = 500 } = {}) {
  const snap = await getDocs(query(collection(db, COL.suggestions), orderBy('suggestionDate','desc'), limit(lim)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getSuggestion(id) {
  const snap = await getDoc(doc(db, COL.suggestions, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createSuggestion(data, createdBy) {
  return addDoc(collection(db, COL.suggestions), {
    ...data, status:'submitted', createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
}

export async function updateSuggestion(id, data) {
  await updateDoc(doc(db, COL.suggestions, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteSuggestion(id) {
  await deleteDoc(doc(db, COL.suggestions, id));
}

// ────────────────────────────────────────────
// Phase 34 — Safety Equipment Loan/Return (ยืม-คืนอุปกรณ์)
// ────────────────────────────────────────────
export const LOAN_EQ_TYPES = [
  { key:'harness',    label:'Full Body Harness',    icon:'🪢' },
  { key:'scba',       label:'SCBA / ชุดหายใจ',      icon:'😷' },
  { key:'gas_detector',label:'Gas Detector',         icon:'🔍' },
  { key:'safety_line',label:'Safety Line / Lifeline',icon:'🔗' },
  { key:'tripod',     label:'Tripod / Rescue Kit',   icon:'📐' },
  { key:'arc_flash',  label:'Arc Flash Suit',         icon:'⚡' },
  { key:'chemical_suit',label:'Chemical Suit',        icon:'☣️' },
  { key:'welding',    label:'อุปกรณ์เชื่อม',          icon:'🔧' },
  { key:'scaffold',   label:'อุปกรณ์นั่งร้าน',        icon:'🏗️' },
  { key:'other',      label:'อื่นๆ',                  icon:'📦' },
];

export const LOAN_STATUS = {
  borrowed: { label:'ยืมอยู่',  color:'#d97706', bg:'#fef3c7' },
  returned: { label:'คืนแล้ว', color:'#16a34a', bg:'#dcfce7' },
  overdue:  { label:'เกินกำหนด',color:'#dc2626', bg:'#fee2e2' },
  damaged:  { label:'ชำรุด',    color:'#7c3aed', bg:'#f5f3ff' },
};

export async function listEqLoans({ lim = 500 } = {}) {
  const snap = await getDocs(query(collection(db, COL.eqLoan), orderBy('loanDate','desc'), limit(lim)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function getEqLoan(id) {
  const snap = await getDoc(doc(db, COL.eqLoan, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
export async function createEqLoan(data, createdBy) {
  return addDoc(collection(db, COL.eqLoan), { ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateEqLoan(id, data) {
  await updateDoc(doc(db, COL.eqLoan, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deleteEqLoan(id) {
  await deleteDoc(doc(db, COL.eqLoan, id));
}

// ────────────────────────────────────────────
// Phase 35 — Safety Walk / Patrol Record (บันทึกการตรวจตรา)
// ────────────────────────────────────────────
export const WALK_AREAS = [
  'โซน A — คลังสินค้า','โซน B — ฝ่ายผลิต','โซน C — โรงอาหาร/สุขาภิบาล',
  'อาคารสำนักงาน','บริเวณจอดรถ/ลานโล่ง','ห้องไฟฟ้า/ห้องเครื่อง',
  'พื้นที่สารเคมี','บริเวณทางเดิน/บันได','ประตูเข้า-ออก','พื้นที่ก่อสร้าง','อื่นๆ',
];

export const WALK_FINDING_TYPES = {
  unsafe_condition: { label:'Unsafe Condition', color:'#dc2626', bg:'#fee2e2' },
  unsafe_act:       { label:'Unsafe Act',        color:'#d97706', bg:'#fef3c7' },
  good_practice:    { label:'Good Practice ✓',   color:'#16a34a', bg:'#dcfce7' },
  housekeeping:     { label:'Housekeeping',       color:'#0891b2', bg:'#ecfeff' },
  near_miss:        { label:'Near Miss',          color:'#7c3aed', bg:'#f5f3ff' },
};

export const WALK_FINDING_STATUS = {
  open:      { label:'รอแก้ไข',    color:'#dc2626', bg:'#fee2e2' },
  in_progress:{ label:'กำลังแก้ไข', color:'#d97706', bg:'#fef3c7' },
  closed:    { label:'แก้ไขแล้ว', color:'#16a34a', bg:'#dcfce7' },
};

export async function listSafetyWalks({ lim = 300 } = {}) {
  const snap = await getDocs(query(collection(db, COL.safetyWalk), orderBy('walkDate','desc'), limit(lim)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function getSafetyWalk(id) {
  const snap = await getDoc(doc(db, COL.safetyWalk, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
export async function createSafetyWalk(data, createdBy) {
  return addDoc(collection(db, COL.safetyWalk), { ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateSafetyWalk(id, data) {
  await updateDoc(doc(db, COL.safetyWalk, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deleteSafetyWalk(id) {
  await deleteDoc(doc(db, COL.safetyWalk, id));
}

// ────────────────────────────────────────────
// Phase 36 — Safety Budget Tracking (งบประมาณ)
// ────────────────────────────────────────────
export const BUDGET_CATEGORIES = [
  { key:'ppe',         label:'PPE / อุปกรณ์ป้องกัน',       icon:'🦺' },
  { key:'training',    label:'ฝึกอบรม',                    icon:'📚' },
  { key:'equipment',   label:'อุปกรณ์ความปลอดภัย',         icon:'⚙️' },
  { key:'inspection',  label:'ตรวจสอบ / ทดสอบ',            icon:'🔍' },
  { key:'fire_safety', label:'ดับเพลิง / ป้องกันอัคคีภัย', icon:'🔥' },
  { key:'health',      label:'ตรวจสุขภาพ',                  icon:'🏥' },
  { key:'chemical',    label:'สารเคมี / SDS',               icon:'⚗️' },
  { key:'signage',     label:'ป้ายความปลอดภัย',             icon:'🚧' },
  { key:'consulting',  label:'ที่ปรึกษา / ตรวจสอบภายนอก',  icon:'👔' },
  { key:'other',       label:'อื่นๆ',                        icon:'📋' },
];

export const BUDGET_TYPE = {
  planned:  { label:'ตั้งงบประมาณ', color:'#0891b2', bg:'#ecfeff' },
  actual:   { label:'ค่าใช้จ่ายจริง', color:'#16a34a', bg:'#dcfce7' },
};

export async function listBudget({ year } = {}) {
  const snap = await getDocs(query(collection(db, COL.budget), orderBy('date','desc'), limit(1000)));
  let rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (year) rows = rows.filter(r => (r.date||'').startsWith(year));
  return rows;
}
export async function getBudgetItem(id) {
  const snap = await getDoc(doc(db, COL.budget, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
export async function createBudgetItem(data, createdBy) {
  return addDoc(collection(db, COL.budget), { ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateBudgetItem(id, data) {
  await updateDoc(doc(db, COL.budget, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deleteBudgetItem(id) {
  await deleteDoc(doc(db, COL.budget, id));
}

// ─── Phase 37: LOTO (Lockout/Tagout) ───────────────────────────────────────
export const LOTO_ENERGY_TYPES = [
  { key:'electrical', label:'ไฟฟ้า',          icon:'⚡', color:'#f59e0b', bg:'#fef3c7' },
  { key:'hydraulic',  label:'ไฮดรอลิก',       icon:'💧', color:'#0891b2', bg:'#ecfeff' },
  { key:'pneumatic',  label:'ลม / นิวแมติก', icon:'💨', color:'#6d28d9', bg:'#f5f3ff' },
  { key:'thermal',    label:'ความร้อน / ไอน้ำ',icon:'🔥', color:'#dc2626', bg:'#fee2e2' },
  { key:'gravity',    label:'แรงโน้มถ่วง',    icon:'⬇️', color:'#374151', bg:'#f9fafb' },
  { key:'chemical',   label:'สารเคมี',         icon:'⚗️', color:'#7c3aed', bg:'#ede9fe' },
  { key:'mechanical', label:'เครื่องจักร',    icon:'⚙️', color:'#1d4ed8', bg:'#dbeafe' },
];
export const LOTO_STATUS = {
  active:   { label:'กำลัง Lock',    color:'#dc2626', bg:'#fee2e2', step:1 },
  released: { label:'ปลดล็อกแล้ว',  color:'#16a34a', bg:'#dcfce7', step:2 },
};
export async function listLOTO() {
  const s = await getDocs(query(collection(db, COL.loto), orderBy('createdAt','desc'), limit(200)));
  return s.docs.map(d=>({ id:d.id, ...d.data() }));
}
export async function getLOTO(id) {
  const d = await getDoc(doc(db, COL.loto, id));
  return d.exists() ? { id:d.id, ...d.data() } : null;
}
export async function createLOTO(data, createdBy) {
  return addDoc(collection(db, COL.loto), { ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateLOTO(id, data) {
  await updateDoc(doc(db, COL.loto, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deleteLOTO(id) {
  await deleteDoc(doc(db, COL.loto, id));
}

// ─── Phase 38: Safety Recognition ──────────────────────────────────────────
export const RECOGNITION_TYPES = [
  { key:'zero_incident',       label:'Zero Incident',          icon:'🏆', color:'#f59e0b', bg:'#fef3c7' },
  { key:'best_safety',         label:'พนักงานความปลอดภัยดีเด่น',icon:'⭐', color:'#d97706', bg:'#fff7ed' },
  { key:'suggestion_best',     label:'ข้อเสนอแนะดีเด่น',        icon:'💡', color:'#0891b2', bg:'#ecfeff' },
  { key:'near_miss_reporter',  label:'รายงาน Near Miss ดีเด่น', icon:'🔍', color:'#7c3aed', bg:'#f5f3ff' },
  { key:'safety_hero',         label:'Safety Hero',             icon:'🦸', color:'#16a34a', bg:'#dcfce7' },
  { key:'team_award',          label:'ทีมความปลอดภัยยอดเยี่ยม',  icon:'👥', color:'#1d4ed8', bg:'#dbeafe' },
  { key:'other',               label:'อื่นๆ',                   icon:'🎖️', color:'#6b7280', bg:'#f3f4f6' },
];
export const RECOGNITION_PERIOD = {
  monthly:   { label:'รายเดือน',    icon:'📅' },
  quarterly: { label:'รายไตรมาส',  icon:'📆' },
  annual:    { label:'ประจำปี',    icon:'🗓️' },
  special:   { label:'พิเศษ',      icon:'✨' },
};
export async function listRecognition() {
  const s = await getDocs(query(collection(db, COL.recognition), orderBy('awardDate','desc'), limit(200)));
  return s.docs.map(d=>({ id:d.id, ...d.data() }));
}
export async function getRecognition(id) {
  const d = await getDoc(doc(db, COL.recognition, id));
  return d.exists() ? { id:d.id, ...d.data() } : null;
}
export async function createRecognition(data, createdBy) {
  return addDoc(collection(db, COL.recognition), { ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateRecognition(id, data) {
  await updateDoc(doc(db, COL.recognition, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deleteRecognition(id) {
  await deleteDoc(doc(db, COL.recognition, id));
}

// ─── Phase 39: Ergonomic Assessment ────────────────────────────────────────
export const ERGO_TASK_TYPES = [
  { key:'manual_handling',  label:'ยกยกและแบกหาม',         icon:'🏋️' },
  { key:'repetitive',       label:'งานซ้ำซาก (Repetitive)', icon:'🔄' },
  { key:'vdu',              label:'งานหน้าจอ (VDU)',         icon:'💻' },
  { key:'awkward_posture',  label:'ท่าทางที่ไม่เหมาะสม',    icon:'🧍' },
  { key:'vibration',        label:'การสั่นสะเทือน',          icon:'📳' },
  { key:'prolonged_stand',  label:'ยืนนาน',                  icon:'🦵' },
  { key:'hand_arm',         label:'งานมือ-แขน',              icon:'✋' },
  { key:'other',            label:'อื่นๆ',                   icon:'📋' },
];
export const ERGO_RISK_LEVELS = {
  low:      { label:'เสี่ยงต่ำ',    color:'#16a34a', bg:'#dcfce7', score:1 },
  medium:   { label:'เสี่ยงปานกลาง',color:'#d97706', bg:'#fef3c7', score:2 },
  high:     { label:'เสี่ยงสูง',    color:'#dc2626', bg:'#fee2e2', score:3 },
  critical: { label:'เสี่ยงวิกฤต',  color:'#7f1d1d', bg:'#fef2f2', score:4 },
};
export const ERGO_BODY_PARTS = ['คอ','ไหล่ซ้าย','ไหล่ขวา','แขนซ้าย','แขนขวา','ข้อมือซ้าย','ข้อมือขวา','หลังส่วนบน','หลังส่วนล่าง','สะโพก','ขาซ้าย','ขาขวา','เข่าซ้าย','เข่าขวา'];
export async function listErgonomics() {
  const s = await getDocs(query(collection(db, COL.ergonomic), orderBy('createdAt','desc'), limit(200)));
  return s.docs.map(d=>({ id:d.id, ...d.data() }));
}
export async function getErgonomic(id) {
  const d = await getDoc(doc(db, COL.ergonomic, id));
  return d.exists() ? { id:d.id, ...d.data() } : null;
}
export async function createErgonomic(data, createdBy) {
  return addDoc(collection(db, COL.ergonomic), { ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateErgonomic(id, data) {
  await updateDoc(doc(db, COL.ergonomic, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deleteErgonomic(id) {
  await deleteDoc(doc(db, COL.ergonomic, id));
}

// ─── Phase 40: Safety Alert ─────────────────────────────────────────────────
export const ALERT_TYPES = [
  { key:'incident',         label:'อุบัติเหตุ/เหตุการณ์',   icon:'🚨', color:'#dc2626', bg:'#fee2e2' },
  { key:'near_miss',        label:'Near Miss',               icon:'⚠️',  color:'#d97706', bg:'#fef3c7' },
  { key:'equipment_failure',label:'เครื่องจักรขัดข้อง',     icon:'⚙️',  color:'#7c3aed', bg:'#f5f3ff' },
  { key:'chemical_spill',   label:'สารเคมีรั่วไหล',          icon:'☣️',  color:'#be185d', bg:'#fdf2f8' },
  { key:'fire',             label:'เพลิงไหม้',               icon:'🔥',  color:'#ea580c', bg:'#fff7ed' },
  { key:'weather',          label:'สภาพอากาศ/ภัยธรรมชาติ',  icon:'⛈️',  color:'#0891b2', bg:'#ecfeff' },
  { key:'safety_notice',    label:'ประกาศ/คำเตือนทั่วไป',   icon:'📢',  color:'#374151', bg:'#f9fafb' },
  { key:'regulatory',       label:'แจ้งกฎหมาย/ข้อบังคับ',   icon:'⚖️',  color:'#1d4ed8', bg:'#dbeafe' },
];
export const ALERT_URGENCY = {
  critical: { label:'ด่วนมาก',   color:'#7f1d1d', bg:'#fef2f2', level:4 },
  high:     { label:'ด่วน',      color:'#dc2626', bg:'#fee2e2', level:3 },
  medium:   { label:'ปานกลาง',  color:'#d97706', bg:'#fef3c7', level:2 },
  low:      { label:'ทั่วไป',    color:'#16a34a', bg:'#dcfce7', level:1 },
};
export const ALERT_STATUS = {
  active:   { label:'มีผล',      color:'#dc2626', bg:'#fee2e2' },
  resolved: { label:'แก้ไขแล้ว', color:'#16a34a', bg:'#dcfce7' },
  archived: { label:'จัดเก็บ',   color:'#6b7280', bg:'#f3f4f6' },
};
export async function listAlerts() {
  const s = await getDocs(query(collection(db, COL.safetyAlert), orderBy('createdAt','desc'), limit(200)));
  return s.docs.map(d=>({ id:d.id, ...d.data() }));
}
export async function getAlert(id) {
  const d = await getDoc(doc(db, COL.safetyAlert, id));
  return d.exists() ? { id:d.id, ...d.data() } : null;
}
export async function createAlert(data, createdBy) {
  return addDoc(collection(db, COL.safetyAlert), { ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateAlert(id, data) {
  await updateDoc(doc(db, COL.safetyAlert, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deleteAlert(id) {
  await deleteDoc(doc(db, COL.safetyAlert, id));
}

// ─── Phase 41: Working at Height ────────────────────────────────────────────
export const HEIGHT_WORK_TYPES = [
  { key:'scaffold',   label:'นั่งร้าน (Scaffolding)',        icon:'🏗️' },
  { key:'ladder',     label:'บันได (Ladder)',                icon:'🪜' },
  { key:'mewp',       label:'รถกระเช้า (MEWP/EWP)',          icon:'🚜' },
  { key:'rope',       label:'งานเชือก (Rope Access)',         icon:'🧗' },
  { key:'roof',       label:'หลังคา (Roof Work)',             icon:'🏠' },
  { key:'elevated',   label:'แท่นยกระดับ (Elevated Platform)',icon:'📦' },
  { key:'other',      label:'อื่นๆ',                         icon:'📋' },
];
export const HEIGHT_PERMIT_STATUS = {
  open:     { label:'เปิดงาน',      color:'#dc2626', bg:'#fee2e2' },
  closed:   { label:'ปิดงานแล้ว',  color:'#16a34a', bg:'#dcfce7' },
  suspended:{ label:'ระงับงาน',    color:'#d97706', bg:'#fef3c7' },
};
export const HEIGHT_CHECKLIST = [
  { key:'harness_ok',      label:'ตรวจ Full Body Harness / เข็มขัดนิรภัย' },
  { key:'anchor_ok',       label:'จุดยึด (Anchor Point) แข็งแรงและเพียงพอ' },
  { key:'lanyard_ok',      label:'สายช็อก (Lanyard/Energy Absorber) ไม่เสียหาย' },
  { key:'scaffold_ok',     label:'นั่งร้าน/แท่นปลอดภัย และมี Toe Board' },
  { key:'barrier_ok',      label:'กั้นพื้นที่ใต้งาน ป้องกันของตก' },
  { key:'helmet_ok',       label:'หมวกนิรภัยครบทุกคน' },
  { key:'weather_ok',      label:'สภาพอากาศปลอดภัย ไม่มีฝน/ลมแรง' },
  { key:'trained_ok',      label:'ผู้ปฏิบัติงานผ่านการฝึกอบรมงานบนที่สูง' },
  { key:'rescue_ok',       label:'มีแผนช่วยเหลือฉุกเฉิน (Rescue Plan)' },
  { key:'communication_ok',label:'ระบบสื่อสารระหว่างผู้ปฏิบัติงานและผู้ควบคุม' },
];
export async function listWorkHeight() {
  const s = await getDocs(query(collection(db, COL.workHeight), orderBy('workDate','desc'), limit(200)));
  return s.docs.map(d=>({ id:d.id, ...d.data() }));
}
export async function getWorkHeight(id) {
  const d = await getDoc(doc(db, COL.workHeight, id));
  return d.exists() ? { id:d.id, ...d.data() } : null;
}
export async function createWorkHeight(data, createdBy) {
  return addDoc(collection(db, COL.workHeight), { ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateWorkHeight(id, data) {
  await updateDoc(doc(db, COL.workHeight, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deleteWorkHeight(id) {
  await deleteDoc(doc(db, COL.workHeight, id));
}

// ─── Phase 42: Confined Space Entry (CSE) ───────────────────────────────────
export const CSE_SPACE_TYPES = [
  { key:'tank',       label:'ถัง/ไซโล (Tank/Silo)',          icon:'🛢️' },
  { key:'pit',        label:'หลุม/บ่อ (Pit/Sump)',            icon:'⬇️' },
  { key:'vessel',     label:'ภาชนะรับแรงดัน (Vessel)',        icon:'🔵' },
  { key:'pipe',       label:'ท่อ/ทางระบาย (Pipe/Culvert)',    icon:'🟤' },
  { key:'tunnel',     label:'อุโมงค์ (Tunnel/Vault)',         icon:'🚇' },
  { key:'manhole',    label:'ช่องแมนโฮล (Manhole)',           icon:'🕳️' },
  { key:'chamber',    label:'ห้องปิด (Enclosed Chamber)',      icon:'🚪' },
  { key:'other',      label:'อื่นๆ',                          icon:'📋' },
];
export const CSE_PERMIT_STATUS = {
  open:     { label:'เปิดอนุญาต',   color:'#dc2626', bg:'#fee2e2' },
  closed:   { label:'ปิดอนุญาต',   color:'#16a34a', bg:'#dcfce7' },
  cancelled:{ label:'ยกเลิก',       color:'#6b7280', bg:'#f3f4f6' },
};
export const CSE_GAS_LIMITS = [
  { key:'o2',  label:'O₂ (%)',       safeMin:19.5, safeMax:23.5, unit:'%',   alarm:'< 19.5% หรือ > 23.5%' },
  { key:'lel', label:'LEL (%)',       safeMin:0,    safeMax:10,   unit:'%LEL',alarm:'> 10% LEL' },
  { key:'co',  label:'CO (ppm)',      safeMin:0,    safeMax:35,   unit:'ppm', alarm:'> 35 ppm' },
  { key:'h2s', label:'H₂S (ppm)',     safeMin:0,    safeMax:1,    unit:'ppm', alarm:'> 1 ppm' },
];
export const CSE_CHECKLIST = [
  { key:'isolate_energy',  label:'ตัดพลังงาน/ล็อค-แท็ก (LOTO) ครบ' },
  { key:'ventilation',     label:'ระบายอากาศก่อนเข้า ≥ 5 นาที' },
  { key:'gas_test',        label:'ตรวจวัดก๊าซก่อนเข้า และผ่านเกณฑ์' },
  { key:'rescue_standby',  label:'ทีม Rescue/Attendant ประจำที่ปากทาง' },
  { key:'harness_rescue',  label:'สายช่วยชีวิต (Rescue Line) พร้อมใช้' },
  { key:'scba_ready',      label:'SCBA/หน้ากากกรองก๊าซพร้อม' },
  { key:'communication',   label:'ระบบสื่อสาร (วิทยุ/สัญญาณ) ใช้งานได้' },
  { key:'lighting',        label:'ไฟฉาย/ไฟส่องสว่างเพียงพอ' },
  { key:'first_aid',       label:'อุปกรณ์ปฐมพยาบาลอยู่ที่ปากทาง' },
  { key:'permit_display',  label:'ติดใบอนุญาตที่ปากทางพื้นที่อับอากาศ' },
];
export async function listCSE() {
  const s = await getDocs(query(collection(db, COL.cse), orderBy('workDate','desc'), limit(200)));
  return s.docs.map(d=>({ id:d.id, ...d.data() }));
}
export async function getCSE(id) {
  const d = await getDoc(doc(db, COL.cse, id));
  return d.exists() ? { id:d.id, ...d.data() } : null;
}
export async function createCSE(data, createdBy) {
  return addDoc(collection(db, COL.cse), { ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateCSE(id, data) {
  await updateDoc(doc(db, COL.cse, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deleteCSE(id) {
  await deleteDoc(doc(db, COL.cse, id));
}

// ─── Phase 43: Hot Work Permit ───────────────────────────────────────────────
export const HOT_WORK_TYPES = [
  { key:'welding',   label:'เชื่อมโลหะ (Welding)',         icon:'🔧' },
  { key:'cutting',   label:'ตัดด้วยแก๊ส/พลาสม่า (Cutting)',icon:'✂️' },
  { key:'grinding',  label:'เจียรโลหะ (Grinding)',          icon:'⚙️' },
  { key:'brazing',   label:'บัดกรี/ประสาน (Brazing)',       icon:'🔥' },
  { key:'soldering', label:'บัดกรีอ่อน (Soldering)',        icon:'🪛' },
  { key:'burning',   label:'เผาด้วยเปลวไฟ (Burning)',       icon:'🕯️' },
  { key:'other',     label:'อื่นๆ (งานก่อประกายไฟ)',         icon:'💥' },
];
export const HOT_WORK_STATUS = {
  open:      { label:'เปิดงาน',     color:'#dc2626', bg:'#fee2e2' },
  completed: { label:'เสร็จสิ้น',   color:'#16a34a', bg:'#dcfce7' },
  cancelled: { label:'ยกเลิก',      color:'#6b7280', bg:'#f3f4f6' },
};
export const HOT_WORK_CHECKLIST = [
  { key:'flammable_removed',  label:'นำวัสดุติดไฟออกจากรัศมี 10 เมตร หรือกั้นป้องกัน' },
  { key:'fire_extinguisher',  label:'เตรียมถังดับเพลิงที่ใช้งานได้ ≥ 1 ถัง ไว้ที่จุดงาน' },
  { key:'fire_blanket',       label:'วางผ้ากันไฟ/แผ่นกันประกายไฟ (Welding Blanket)' },
  { key:'gas_test',           label:'ตรวจวัด LEL ในบริเวณงาน < 10%' },
  { key:'ventilation',        label:'มีระบายอากาศเพียงพอ ป้องกันไอระเหยสะสม' },
  { key:'drain_cover',        label:'ปิดท่อระบายน้ำ/ช่องเปิดพื้น บริเวณใกล้งาน' },
  { key:'fire_watch_assigned',label:'กำหนดผู้เฝ้าระวังไฟ (Fire Watch) ตลอดงาน' },
  { key:'fire_watch_after',   label:'ผู้เฝ้าระวังไฟอยู่ต่ออีก 30 นาทีหลังงานเสร็จ' },
  { key:'ppe_ok',             label:'PPE ครบ: หน้ากากเชื่อม, แว่นตา, ถุงมือกันความร้อน' },
  { key:'permit_display',     label:'ติดใบอนุญาตงานร้อนที่มองเห็นชัดเจน' },
];
export async function listHotWork() {
  const s = await getDocs(query(collection(db, COL.hotWork), orderBy('workDate','desc'), limit(200)));
  return s.docs.map(d=>({ id:d.id, ...d.data() }));
}
export async function getHotWork(id) {
  const d = await getDoc(doc(db, COL.hotWork, id));
  return d.exists() ? { id:d.id, ...d.data() } : null;
}
export async function createHotWork(data, createdBy) {
  return addDoc(collection(db, COL.hotWork), { ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateHotWork(id, data) {
  await updateDoc(doc(db, COL.hotWork, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deleteHotWork(id) {
  await deleteDoc(doc(db, COL.hotWork, id));
}

// ─── Phase 44: Vehicle / Forklift Safety Check ───────────────────────────────
export const VEHICLE_TYPES = [
  { key:'forklift',   label:'รถยก (Forklift)',           icon:'🏗️' },
  { key:'pallet',     label:'รถพาเลท (Pallet Truck)',    icon:'📦' },
  { key:'truck',      label:'รถบรรทุก (Truck)',           icon:'🚛' },
  { key:'crane',      label:'เครนเคลื่อนที่ (Mobile Crane)', icon:'🏗️' },
  { key:'tractor',    label:'รถแทรกเตอร์ (Tractor)',     icon:'🚜' },
  { key:'van',        label:'รถตู้/รถบัส (Van/Bus)',      icon:'🚐' },
  { key:'scissor',    label:'แท่นยกกรรไกร (Scissor Lift)',icon:'⬆️' },
  { key:'other',      label:'อื่นๆ',                      icon:'🚗' },
];
export const VEHICLE_CHECK_STATUS = {
  pass:    { label:'ผ่าน',      color:'#16a34a', bg:'#dcfce7' },
  fail:    { label:'ไม่ผ่าน',   color:'#dc2626', bg:'#fee2e2' },
  pending: { label:'รอตรวจ',    color:'#d97706', bg:'#fef3c7' },
};
export const VEHICLE_CHECKLIST = [
  { key:'brakes',         label:'ระบบเบรก — ทดสอบเบรกสม่ำเสมอ ไม่ลื่นหรือหน่วง' },
  { key:'steering',       label:'พวงมาลัย — หมุนคล่อง ไม่สั่นหรือหนักผิดปกติ' },
  { key:'lights',         label:'ไฟสัญญาณ/ไฟหน้า-ท้าย — ทำงานครบถ้วน' },
  { key:'horn',           label:'แตรสัญญาณ — ดังชัดเจน ใช้งานได้' },
  { key:'tires',          label:'ยาง — ไม่แบน ไม่มีรอยแตก ดอกยางเพียงพอ' },
  { key:'forks_mast',     label:'งาหรือแขนยก — ไม่โค้งงอ ไม่แตกร้าว ใช้งานได้' },
  { key:'hydraulic',      label:'ระบบไฮดรอลิก — ไม่มีน้ำมันรั่ว ยกขึ้น-ลงได้ปกติ' },
  { key:'seatbelt',       label:'เข็มขัดนิรภัย — ใช้งานได้ ล็อคแน่น' },
  { key:'fire_ext',       label:'ถังดับเพลิง — มีครบ ติดตั้งถูกตำแหน่ง' },
  { key:'battery_fuel',   label:'แบตเตอรี่/เชื้อเพลิง — ระดับพอเพียง ไม่รั่วซึม' },
  { key:'warning_device', label:'อุปกรณ์เตือน (ไฟกระพริบ/เสียงถอยหลัง) — ทำงาน' },
  { key:'operator_cert',  label:'ใบขับขี่/ใบรับรองผู้ขับ — มีและยังไม่หมดอายุ' },
];
export async function listVehicleCheck() {
  const s = await getDocs(query(collection(db, COL.vehicleCheck), orderBy('checkDate','desc'), limit(200)));
  return s.docs.map(d=>({ id:d.id, ...d.data() }));
}
export async function getVehicleCheck(id) {
  const d = await getDoc(doc(db, COL.vehicleCheck, id));
  return d.exists() ? { id:d.id, ...d.data() } : null;
}
export async function createVehicleCheck(data, createdBy) {
  return addDoc(collection(db, COL.vehicleCheck), { ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateVehicleCheck(id, data) {
  await updateDoc(doc(db, COL.vehicleCheck, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deleteVehicleCheck(id) {
  await deleteDoc(doc(db, COL.vehicleCheck, id));
}

// ─── Phase 45: Compressed Gas / Cylinder Registry ────────────────────────────
export const GAS_TYPES = [
  { key:'oxygen',     label:'ออกซิเจน (O₂)',           icon:'🔵', color:'#2563eb' },
  { key:'acetylene',  label:'อะเซทิลีน (C₂H₂)',        icon:'🟡', color:'#d97706' },
  { key:'lpg',        label:'ก๊าซหุงต้ม (LPG)',         icon:'🟠', color:'#ea580c' },
  { key:'co2',        label:'คาร์บอนไดออกไซด์ (CO₂)',  icon:'⚪', color:'#6b7280' },
  { key:'nitrogen',   label:'ไนโตรเจน (N₂)',            icon:'🟢', color:'#16a34a' },
  { key:'argon',      label:'อาร์กอน (Ar)',              icon:'🟣', color:'#7c3aed' },
  { key:'hydrogen',   label:'ไฮโดรเจน (H₂)',            icon:'🔴', color:'#dc2626' },
  { key:'mixed',      label:'ก๊าซผสม (Mixed)',           icon:'⚗️', color:'#0891b2' },
  { key:'other',      label:'อื่นๆ',                     icon:'🧪', color:'#374151' },
];
export const CYLINDER_STATUS = {
  inservice:  { label:'ใช้งานอยู่',    color:'#16a34a', bg:'#dcfce7' },
  empty:      { label:'ถังว่าง',       color:'#6b7280', bg:'#f3f4f6' },
  condemned:  { label:'ตัดออก',        color:'#dc2626', bg:'#fee2e2' },
  testing:    { label:'ส่งทดสอบ',      color:'#d97706', bg:'#fef3c7' },
  fullstock:  { label:'คงคลัง (เต็ม)', color:'#2563eb', bg:'#dbeafe' },
};
export const CYLINDER_SIZES = [
  { key:'s',  label:'ขนาดเล็ก (< 20 L)' },
  { key:'m',  label:'ขนาดกลาง (20–50 L)' },
  { key:'l',  label:'ขนาดใหญ่ (> 50 L)' },
  { key:'bulk',label:'ถังใหญ่/บัลค์' },
];
export async function listGasCylinder() {
  const s = await getDocs(query(collection(db, COL.gasCylinder), orderBy('serialNo','asc'), limit(300)));
  return s.docs.map(d=>({ id:d.id, ...d.data() }));
}
export async function getGasCylinder(id) {
  const d = await getDoc(doc(db, COL.gasCylinder, id));
  return d.exists() ? { id:d.id, ...d.data() } : null;
}
export async function createGasCylinder(data, createdBy) {
  return addDoc(collection(db, COL.gasCylinder), { ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateGasCylinder(id, data) {
  await updateDoc(doc(db, COL.gasCylinder, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deleteGasCylinder(id) {
  await deleteDoc(doc(db, COL.gasCylinder, id));
}

// ─── Phase 46: Lifting Equipment Inspection ──────────────────────────────────
export const LIFTING_TYPES = [
  { key:'sling_web',   label:'สลิงผ้า (Web Sling)',          icon:'🟨' },
  { key:'sling_chain', label:'สลิงโซ่ (Chain Sling)',         icon:'⛓️' },
  { key:'wire_rope',   label:'เชือกลวด (Wire Rope Sling)',   icon:'🪢' },
  { key:'hook',        label:'ตะขอยก (Lifting Hook)',         icon:'🪝' },
  { key:'shackle',     label:'แหวนยู (Shackle)',              icon:'🔗' },
  { key:'spreader',    label:'คานกระจาย (Spreader Bar)',      icon:'📏' },
  { key:'eye_bolt',    label:'น็อตห่วง (Eye Bolt/Ring)',      icon:'⭕' },
  { key:'pulley',      label:'รอก (Pulley/Block)',            icon:'⚙️' },
  { key:'other',       label:'อื่นๆ',                         icon:'🔩' },
];
export const LIFTING_INSPECT_STATUS = {
  pass:       { label:'ผ่าน — ใช้งานได้',      color:'#16a34a', bg:'#dcfce7' },
  conditional:{ label:'ใช้ได้มีข้อแม้',         color:'#d97706', bg:'#fef3c7' },
  fail:       { label:'ไม่ผ่าน — ห้ามใช้',      color:'#dc2626', bg:'#fee2e2' },
  retired:    { label:'ตัดออกแล้ว',             color:'#6b7280', bg:'#f3f4f6' },
};
export const LIFTING_CHECKLIST = [
  { key:'tag_swl',       label:'ป้ายแสดง SWL (Safe Working Load) ติดชัดเจนและอ่านได้' },
  { key:'no_cut',        label:'ไม่มีรอยตัด รอยบาก หรือรอยขาดที่เส้นใย/ลวด/โซ่' },
  { key:'no_kink',       label:'ไม่มีการบิด พับงอถาวร หรือ kink ที่เชือก/ลวด' },
  { key:'no_corrosion',  label:'ไม่มีสนิมกัดกร่อนเกินมาตรฐาน' },
  { key:'no_deform',     label:'ตะขอ/แหวน/ข้อโซ่ ไม่มีการบิดงอหรือเสียรูป' },
  { key:'latch_ok',      label:'Safety latch ของตะขอทำงานได้สมบูรณ์' },
  { key:'weld_ok',       label:'รอยเชื่อมไม่มีรอยแตกร้าวหรือหลุดล่อน' },
  { key:'proof_load',    label:'มีหลักฐาน Proof Load Test ตามอายุที่กำหนด' },
  { key:'color_code',    label:'รหัสสีตรงกับรอบการตรวจสอบปัจจุบัน' },
  { key:'storage_ok',    label:'เก็บรักษาอย่างถูกต้อง ไม่สัมผัสสารเคมีหรือความร้อน' },
];
export async function listLiftingEq() {
  const s = await getDocs(query(collection(db, COL.liftingEq), orderBy('tagId','asc'), limit(300)));
  return s.docs.map(d=>({ id:d.id, ...d.data() }));
}
export async function getLiftingEq(id) {
  const d = await getDoc(doc(db, COL.liftingEq, id));
  return d.exists() ? { id:d.id, ...d.data() } : null;
}
export async function createLiftingEq(data, createdBy) {
  return addDoc(collection(db, COL.liftingEq), { ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateLiftingEq(id, data) {
  await updateDoc(doc(db, COL.liftingEq, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deleteLiftingEq(id) {
  await deleteDoc(doc(db, COL.liftingEq, id));
}

// ─── Phase 47: 5S / Housekeeping Inspection ──────────────────────────────────
export const FIVES_CATEGORIES = [
  {
    key:'seiri', label:'ส1 — สะสาง (Seiri)', icon:'🗂️', color:'#dc2626',
    items:[
      { key:'s1_1', label:'ไม่มีสิ่งของที่ไม่จำเป็นวางอยู่ในพื้นที่ทำงาน' },
      { key:'s1_2', label:'วัสดุสิ้นเปลืองและอะไหล่เก็บแยกจากพื้นที่ผลิต' },
      { key:'s1_3', label:'ของเสียและวัสดุรอทิ้งถูกระบุและนำออกทันที' },
      { key:'s1_4', label:'อุปกรณ์ที่ชำรุดถูกแยกออกและติดป้ายรอซ่อม' },
    ]
  },
  {
    key:'seiton', label:'ส2 — สะดวก (Seiton)', icon:'📐', color:'#d97706',
    items:[
      { key:'s2_1', label:'ทุกสิ่งของมีที่จัดเก็บที่กำหนดไว้ชัดเจน' },
      { key:'s2_2', label:'สิ่งของถูกวางในตำแหน่งที่กำหนดทุกครั้งหลังใช้' },
      { key:'s2_3', label:'มีการติดป้ายระบุชื่อ/ตำแหน่งอย่างชัดเจน' },
      { key:'s2_4', label:'เส้นทางเดินและพื้นที่ทำงานมีการทำเครื่องหมายพื้น' },
    ]
  },
  {
    key:'seiso', label:'ส3 — สะอาด (Seiso)', icon:'🧹', color:'#2563eb',
    items:[
      { key:'s3_1', label:'พื้น เครื่องจักร และอุปกรณ์สะอาด ไม่มีคราบสกปรก' },
      { key:'s3_2', label:'มีการทำความสะอาดประจำวันและบันทึกผล' },
      { key:'s3_3', label:'แหล่งกำเนิดสิ่งสกปรก (น้ำมันรั่ว ฝุ่น) ถูกระบุและแก้ไข' },
      { key:'s3_4', label:'อุปกรณ์ทำความสะอาดมีพร้อมใช้และจัดเก็บถูกที่' },
    ]
  },
  {
    key:'seiketsu', label:'ส4 — สุขลักษณะ (Seiketsu)', icon:'📋', color:'#16a34a',
    items:[
      { key:'s4_1', label:'มีมาตรฐาน/วิธีปฏิบัติงาน (SOP) ติดแสดงไว้' },
      { key:'s4_2', label:'พนักงานสวม PPE ครบถ้วนและถูกต้องตามงาน' },
      { key:'s4_3', label:'ป้ายความปลอดภัยครบ อ่านได้ชัดเจน ไม่ชำรุด' },
      { key:'s4_4', label:'มีตารางการตรวจสอบ 5ส และดำเนินการสม่ำเสมอ' },
    ]
  },
  {
    key:'shitsuke', label:'ส5 — สร้างนิสัย (Shitsuke)', icon:'⭐', color:'#7c3aed',
    items:[
      { key:'s5_1', label:'พนักงานปฏิบัติตามกฎ 5ส โดยไม่ต้องเตือน' },
      { key:'s5_2', label:'มีการประชุมหรือสื่อสาร 5ส กับพนักงานสม่ำเสมอ' },
      { key:'s5_3', label:'ผลการตรวจสอบ 5ส ถูกติดประกาศให้พนักงานทราบ' },
      { key:'s5_4', label:'มีการยกย่องพื้นที่ที่ผ่านเกณฑ์และติดตามพื้นที่ที่ต้องปรับปรุง' },
    ]
  },
];
export const FIVES_GRADES = [
  { min:90, label:'A — ดีเยี่ยม',  color:'#16a34a', bg:'#dcfce7' },
  { min:75, label:'B — ดี',         color:'#2563eb', bg:'#dbeafe' },
  { min:60, label:'C — พอใช้',      color:'#d97706', bg:'#fef3c7' },
  { min:0,  label:'D — ต้องปรับปรุง',color:'#dc2626', bg:'#fee2e2' },
];
export function calcFiveSGrade(pct) {
  return FIVES_GRADES.find(g => pct >= g.min) || FIVES_GRADES[FIVES_GRADES.length-1];
}
export async function listFiveS() {
  const s = await getDocs(query(collection(db, COL.fiveS), orderBy('inspDate','desc'), limit(200)));
  return s.docs.map(d=>({ id:d.id, ...d.data() }));
}
export async function getFiveS(id) {
  const d = await getDoc(doc(db, COL.fiveS, id));
  return d.exists() ? { id:d.id, ...d.data() } : null;
}
export async function createFiveS(data, createdBy) {
  return addDoc(collection(db, COL.fiveS), { ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateFiveS(id, data) {
  await updateDoc(doc(db, COL.fiveS, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deleteFiveS(id) {
  await deleteDoc(doc(db, COL.fiveS, id));
}

// ─── Phase 48: Electrical Safety Inspection ──────────────────────────────────
export const ELEC_AREA_TYPES = [
  { key:'main_panel',    label:'ตู้ MDB / ตู้ไฟหลัก',          icon:'⚡' },
  { key:'sub_panel',     label:'ตู้ DB / ตู้ไฟย่อย',            icon:'🔌' },
  { key:'machine',       label:'เครื่องจักร / มอเตอร์',          icon:'⚙️' },
  { key:'socket_ext',    label:'ปลั๊กพ่วง / รางปลั๊ก',           icon:'🔋' },
  { key:'lighting',      label:'ระบบไฟฟ้าแสงสว่าง',              icon:'💡' },
  { key:'emergency',     label:'ระบบไฟฉุกเฉิน / UPS',           icon:'🔦' },
  { key:'grounding',     label:'ระบบสายดิน / Earthing',          icon:'🌍' },
  { key:'outdoor',       label:'ระบบไฟฟ้าภายนอกอาคาร',           icon:'🏗️' },
  { key:'other',         label:'อื่นๆ',                           icon:'🔧' },
];
export const ELEC_INSP_STATUS = {
  pass:    { label:'ผ่าน — ปลอดภัย',    color:'#16a34a', bg:'#dcfce7' },
  observe: { label:'ต้องติดตาม',         color:'#d97706', bg:'#fef3c7' },
  fail:    { label:'ไม่ผ่าน — แก้ไขด่วน',color:'#dc2626', bg:'#fee2e2' },
};
export const ELEC_CHECKLIST = [
  { key:'panel_clean',     label:'ตู้ไฟสะอาด ไม่มีฝุ่น ความชื้น หรือสิ่งกีดขวาง' },
  { key:'breaker_ok',      label:'เบรกเกอร์/ฟิวส์ทุกตัวอยู่ในสภาพดี ไม่มีรอยไหม้' },
  { key:'label_ok',        label:'วงจรทุกวงจรมีป้ายระบุชัดเจนและถูกต้อง' },
  { key:'wiring_ok',       label:'สายไฟไม่มีรอยชำรุด สึกกร่อน หรือเปิดโล่ง' },
  { key:'no_overload',     label:'ไม่มีการต่อสายไฟเกินขนาดหรือ overload วงจร' },
  { key:'ground_ok',       label:'สายดินต่อครบและวัดค่าความต้านทานผ่านมาตรฐาน' },
  { key:'no_ext_misuse',   label:'ไม่มีการใช้ปลั๊กพ่วงผิดประเภทหรือเกินกำลัง' },
  { key:'emergency_light', label:'ไฟฉุกเฉินทำงานได้เมื่อทดสอบ ไฟสว่างเพียงพอ' },
  { key:'lockout_ok',      label:'มีจุด LOTO สำหรับตัดไฟก่อนซ่อมและติดป้ายแจ้ง' },
  { key:'panel_access',    label:'พื้นที่หน้าตู้ไฟว่างเพียงพอ ≥1 เมตร ไม่มีสิ่งกีดขวาง' },
  { key:'arc_flash',       label:'มีป้าย Arc Flash Warning ติดบนตู้ไฟที่มีความเสี่ยง' },
  { key:'test_record',     label:'มีบันทึกการทดสอบ/ตรวจสอบระบบไฟฟ้าล่าสุดอยู่ที่ตู้ไฟ' },
];
export async function listElectricalInsp() {
  const s = await getDocs(query(collection(db, COL.electricalInsp), orderBy('inspDate','desc'), limit(200)));
  return s.docs.map(d=>({ id:d.id, ...d.data() }));
}
export async function getElectricalInsp(id) {
  const d = await getDoc(doc(db, COL.electricalInsp, id));
  return d.exists() ? { id:d.id, ...d.data() } : null;
}
export async function createElectricalInsp(data, createdBy) {
  return addDoc(collection(db, COL.electricalInsp), { ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateElectricalInsp(id, data) {
  await updateDoc(doc(db, COL.electricalInsp, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deleteElectricalInsp(id) {
  await deleteDoc(doc(db, COL.electricalInsp, id));
}

// ─── Phase 49: Chemical Spill Response Record ─────────────────────────────────
export const SPILL_CHEM_CATEGORIES = [
  { key:'acid',      label:'กรด (Acid)',                   icon:'🧪', color:'#dc2626' },
  { key:'alkali',    label:'ด่าง (Alkali/Base)',            icon:'🫧', color:'#2563eb' },
  { key:'solvent',   label:'ตัวทำละลาย (Solvent/Flammable)',icon:'🔥', color:'#d97706' },
  { key:'oil',       label:'น้ำมัน/จาระบี (Oil/Grease)',   icon:'🛢️', color:'#78350f' },
  { key:'toxic',     label:'สารพิษ/สารอันตราย (Toxic)',     icon:'☠️', color:'#7c3aed' },
  { key:'gas',       label:'แก๊ส/ไอระเหย (Gas/Vapor)',      icon:'💨', color:'#0891b2' },
  { key:'bio',       label:'สารชีวภาพ (Biological)',        icon:'🦠', color:'#16a34a' },
  { key:'other',     label:'อื่นๆ',                          icon:'⚗️', color:'#6b7280' },
];
export const SPILL_SEVERITY = {
  minor:    { label:'เล็กน้อย (< 5L)',   color:'#16a34a', bg:'#dcfce7' },
  moderate: { label:'ปานกลาง (5–50L)',   color:'#d97706', bg:'#fef3c7' },
  major:    { label:'รุนแรง (> 50L)',     color:'#dc2626', bg:'#fee2e2' },
  critical: { label:'วิกฤติ — อพยพ',     color:'#7c3aed', bg:'#f5f3ff' },
};
export const SPILL_RESPONSE_STEPS = [
  { key:'alarm',       label:'แจ้งเตือนและประกาศเหตุฉุกเฉิน' },
  { key:'evacuate',    label:'อพยพผู้ที่ไม่เกี่ยวข้องออกจากพื้นที่' },
  { key:'ppe_on',      label:'ผู้ตอบสนองสวม PPE ครบถ้วน (ถุงมือ/หน้ากาก/ชุดคลุม)' },
  { key:'isolate',     label:'ปิดกั้นพื้นที่และหยุดแหล่งรั่วไหล (ถ้าทำได้ปลอดภัย)' },
  { key:'contain',     label:'ใช้วัสดุดูดซับ/กั้นแนวกันไม่ให้กระจาย' },
  { key:'cleanup',     label:'เก็บกวาดและบรรจุของเสียลงภาชนะที่เหมาะสม' },
  { key:'decon',       label:'ทำ decontamination พื้นที่และอุปกรณ์ที่ใช้' },
  { key:'dispose',     label:'กำจัดของเสียตามกฎระเบียบ — บันทึกน้ำหนัก/ปริมาณ' },
  { key:'report',      label:'รายงานต่อผู้บังคับบัญชาและหน่วยงานที่เกี่ยวข้อง' },
  { key:'review',      label:'ทบทวนสาเหตุและปรับปรุงเพื่อป้องกันการเกิดซ้ำ' },
];
export async function listSpillRecord() {
  const s = await getDocs(query(collection(db, COL.spillRecord), orderBy('spillDate','desc'), limit(200)));
  return s.docs.map(d=>({ id:d.id, ...d.data() }));
}
export async function getSpillRecord(id) {
  const d = await getDoc(doc(db, COL.spillRecord, id));
  return d.exists() ? { id:d.id, ...d.data() } : null;
}
export async function createSpillRecord(data, createdBy) {
  return addDoc(collection(db, COL.spillRecord), { ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateSpillRecord(id, data) {
  await updateDoc(doc(db, COL.spillRecord, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deleteSpillRecord(id) {
  await deleteDoc(doc(db, COL.spillRecord, id));
}

// ─── Phase 50: PPE Stock Management ──────────────────────────────────────────
export const PPE_STOCK_CATEGORIES = [
  { key:'head',       label:'ป้องกันหัว',          icon:'⛑️',  items:['หมวกนิรภัย (Safety Helmet)','หมวกบัมป์ (Bump Cap)'] },
  { key:'eye_face',   label:'ป้องกันตา/หน้า',       icon:'🥽',  items:['แว่นตานิรภัย (Safety Glasses)','Face Shield','แว่นครอบ (Goggles)'] },
  { key:'hearing',    label:'ป้องกันการได้ยิน',      icon:'👂',  items:['ที่อุดหู (Ear Plug)','ที่ครอบหู (Ear Muff)'] },
  { key:'respiratory',label:'ป้องกันระบบหายใจ',     icon:'😷',  items:['หน้ากากผ้า N95','ครึ่งหน้า (Half Mask)','เต็มหน้า (Full Face)','SCBA','PAPR'] },
  { key:'hand',       label:'ป้องกันมือ',            icon:'🧤',  items:['ถุงมือหนัง','ถุงมือยาง Nitrile','ถุงมือกันสารเคมี','ถุงมือกันตัด'] },
  { key:'foot',       label:'ป้องกันเท้า',           icon:'👟',  items:['รองเท้านิรภัย (Safety Shoes)','รองเท้าบูทยาง','ที่ครอบรองเท้า (Overshoe)'] },
  { key:'body',       label:'ป้องกันร่างกาย',        icon:'🦺',  items:['เสื้อกั๊ก Hi-Vis','ชุดทำงาน (Coverall)','ชุดกันสารเคมี','เสื้อกันฝน'] },
  { key:'fall',       label:'ป้องกันการตกจากที่สูง', icon:'🪢',  items:['สายรัดเต็มตัว (Full Body Harness)','เชือกนิรภัย (Lanyard)','Self-Retracting Lifeline'] },
  { key:'other',      label:'อื่นๆ',                  icon:'🧰',  items:['อื่นๆ'] },
];
export const PPE_STOCK_STATUS = {
  ok:       { label:'สต็อกพอ',      color:'#16a34a', bg:'#dcfce7' },
  low:      { label:'ใกล้หมด',      color:'#d97706', bg:'#fef3c7' },
  critical: { label:'หมดแล้ว/วิกฤติ',color:'#dc2626', bg:'#fee2e2' },
  expired:  { label:'หมดอายุ',      color:'#7c3aed', bg:'#f5f3ff' },
};
export const PPE_UNITS = ['ชิ้น','คู่','กล่อง','ถุง','โหล','ชุด'];
export async function listPPEStock() {
  const s = await getDocs(query(collection(db, COL.ppeStock), orderBy('itemName','asc'), limit(300)));
  return s.docs.map(d=>({ id:d.id, ...d.data() }));
}
export async function getPPEStock(id) {
  const d = await getDoc(doc(db, COL.ppeStock, id));
  return d.exists() ? { id:d.id, ...d.data() } : null;
}
export async function createPPEStock(data, createdBy) {
  return addDoc(collection(db, COL.ppeStock), { ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updatePPEStock(id, data) {
  await updateDoc(doc(db, COL.ppeStock, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deletePPEStock(id) {
  await deleteDoc(doc(db, COL.ppeStock, id));
}
export async function adjustPPEStockQty(id, delta, note, updatedBy) {
  const ref = doc(db, COL.ppeStock, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('ไม่พบรายการ');
  const cur = snap.data().currentQty || 0;
  const newQty = Math.max(0, cur + delta);
  await updateDoc(ref, {
    currentQty: newQty,
    lastAdjNote: note || '',
    lastAdjBy: updatedBy,
    lastAdjDelta: delta,
    updatedAt: serverTimestamp(),
  });
  return newQty;
}

// ─── Phase 51: Safety Sign & Label Audit ──────────────────────────────────────
export const SIGN_TYPES = [
  { key:'prohibit',   label:'ห้าม (Prohibition)',          icon:'🚫', color:'#dc2626' },
  { key:'warning',    label:'เตือน (Warning)',              icon:'⚠️', color:'#d97706' },
  { key:'mandatory',  label:'บังคับ (Mandatory)',           icon:'🔵', color:'#2563eb' },
  { key:'emergency',  label:'ฉุกเฉิน (Emergency/Safe)',     icon:'🟩', color:'#16a34a' },
  { key:'fire',       label:'ดับเพลิง (Fire Equipment)',    icon:'🔴', color:'#b91c1c' },
  { key:'hazmat',     label:'อันตราย (Hazmat/Chemical)',    icon:'☠️', color:'#7c3aed' },
  { key:'info',       label:'ข้อมูล (Information)',         icon:'ℹ️', color:'#0891b2' },
  { key:'other',      label:'อื่นๆ',                        icon:'🪧', color:'#6b7280' },
];
export const SIGN_CONDITIONS = {
  good:    { label:'สภาพดี',         color:'#16a34a', bg:'#dcfce7' },
  fair:    { label:'พอใช้ (เลือนราง)',color:'#d97706', bg:'#fef3c7' },
  replace: { label:'ต้องเปลี่ยน',    color:'#dc2626', bg:'#fee2e2' },
  missing: { label:'หาย / ไม่มี',    color:'#7c3aed', bg:'#f5f3ff' },
};
export const SIGN_LOCATIONS = [
  'ทางเข้า-ออกอาคาร','ทางเดินหลัก','โซนเครื่องจักร','โซนสารเคมี',
  'ห้องไฟฟ้า','ห้องเก็บของ','โซนโหลดสินค้า','ห้องน้ำ','บันได/ลิฟท์','ที่จอดรถ','อื่นๆ',
];
export async function listSafetySign() {
  const s = await getDocs(query(collection(db, COL.safetySign), orderBy('location','asc'), limit(300)));
  return s.docs.map(d=>({ id:d.id, ...d.data() }));
}
export async function getSafetySign(id) {
  const d = await getDoc(doc(db, COL.safetySign, id));
  return d.exists() ? { id:d.id, ...d.data() } : null;
}
export async function createSafetySign(data, createdBy) {
  return addDoc(collection(db, COL.safetySign), { ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateSafetySign(id, data) {
  await updateDoc(doc(db, COL.safetySign, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deleteSafetySign(id) {
  await deleteDoc(doc(db, COL.safetySign, id));
}

// ─── Phase 52: Safety Culture Survey ─────────────────────────────────────────
export const SURVEY_CATEGORIES = [
  {
    key:'leadership', label:'ภาวะผู้นำด้านความปลอดภัย', icon:'👔', color:'#1a237e',
    questions:[
      'ผู้บริหารแสดงให้เห็นว่าความปลอดภัยเป็นสิ่งสำคัญอันดับหนึ่ง',
      'ผู้จัดการ/หัวหน้างานสนับสนุนและส่งเสริมพฤติกรรมความปลอดภัย',
      'ฝ่ายบริหารรับฟังข้อกังวลด้านความปลอดภัยของพนักงาน',
    ]
  },
  {
    key:'communication', label:'การสื่อสารด้านความปลอดภัย', icon:'📢', color:'#2563eb',
    questions:[
      'ฉันได้รับข้อมูลข่าวสารด้านความปลอดภัยที่เพียงพอและทันท่วงที',
      'กฎระเบียบและขั้นตอนความปลอดภัยมีความชัดเจนและเข้าใจง่าย',
      'มีการแจ้งผลการสอบสวนอุบัติเหตุให้พนักงานทราบอย่างสม่ำเสมอ',
    ]
  },
  {
    key:'reporting', label:'การรายงานและแจ้งเหตุ', icon:'📋', color:'#d97706',
    questions:[
      'ฉันรู้สึกสบายใจที่จะรายงานอุบัติเหตุหรือเหตุการณ์เกือบเกิดอุบัติเหตุ',
      'เมื่อรายงานปัญหาความปลอดภัย ฉันได้รับการตอบรับที่เหมาะสม',
      'พนักงานไม่ถูกตำหนิหรือลงโทษเมื่อรายงานอุบัติเหตุโดยสุจริตใจ',
    ]
  },
  {
    key:'ppe_compliance', label:'การปฏิบัติตามกฎความปลอดภัย', icon:'🦺', color:'#16a34a',
    questions:[
      'พนักงานในพื้นที่ของฉันสวม PPE ครบถ้วนตามที่กำหนดทุกครั้ง',
      'กฎความปลอดภัยได้รับการปฏิบัติตามอย่างสม่ำเสมอ ไม่ใช่แค่เมื่อมีการตรวจสอบ',
      'ฉันพร้อมที่จะหยุดงานและแจ้งหัวหน้าหากพบสภาพการทำงานที่ไม่ปลอดภัย',
    ]
  },
  {
    key:'training', label:'การฝึกอบรมและความรู้', icon:'🎓', color:'#7c3aed',
    questions:[
      'ฉันได้รับการฝึกอบรมด้านความปลอดภัยที่เพียงพอสำหรับงานที่ทำ',
      'การฝึกอบรมความปลอดภัยที่ได้รับมีประโยชน์และนำไปใช้ได้จริง',
      'ฉันทราบขั้นตอนฉุกเฉินและตำแหน่งอุปกรณ์ฉุกเฉินในพื้นที่ทำงาน',
    ]
  },
  {
    key:'environment', label:'สภาพแวดล้อมการทำงาน', icon:'🏭', color:'#0891b2',
    questions:[
      'สภาพแวดล้อมการทำงานของฉันปลอดภัยและเหมาะสม',
      'อุปกรณ์และเครื่องจักรได้รับการบำรุงรักษาอย่างสม่ำเสมอ',
      'มีทรัพยากร PPE และอุปกรณ์ความปลอดภัยเพียงพอสำหรับงานที่ทำ',
    ]
  },
];
export const SURVEY_SCALE = [
  { v:1, label:'ไม่เห็นด้วยอย่างยิ่ง' },
  { v:2, label:'ไม่เห็นด้วย' },
  { v:3, label:'เป็นกลาง' },
  { v:4, label:'เห็นด้วย' },
  { v:5, label:'เห็นด้วยอย่างยิ่ง' },
];
export const SURVEY_DEPARTMENTS = [
  'ผลิต','คลังสินค้า','ซ่อมบำรุง','QC/QA','Shipping','ธุรการ','วิศวกรรม','ความปลอดภัย','อื่นๆ'
];
export function calcSurveyCatAvg(responses, catKey) {
  const cat = SURVEY_CATEGORIES.find(c=>c.key===catKey);
  if (!cat) return 0;
  const vals = cat.questions.map((_,qi) => responses?.[`${catKey}_${qi}`] || 0).filter(v=>v>0);
  return vals.length ? +(vals.reduce((s,v)=>s+v,0)/vals.length).toFixed(2) : 0;
}
export function calcSurveyOverall(responses) {
  const avgs = SURVEY_CATEGORIES.map(c=>calcSurveyCatAvg(responses, c.key)).filter(v=>v>0);
  return avgs.length ? +(avgs.reduce((s,v)=>s+v,0)/avgs.length).toFixed(2) : 0;
}
export async function listCultureSurvey() {
  const s = await getDocs(query(collection(db, COL.cultureSurvey), orderBy('submittedAt','desc'), limit(200)));
  return s.docs.map(d=>({ id:d.id, ...d.data() }));
}
export async function getCultureSurvey(id) {
  const d = await getDoc(doc(db, COL.cultureSurvey, id));
  return d.exists() ? { id:d.id, ...d.data() } : null;
}
export async function createCultureSurvey(data, createdBy) {
  return addDoc(collection(db, COL.cultureSurvey), { ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function deleteCultureSurvey(id) {
  await deleteDoc(doc(db, COL.cultureSurvey, id));
}

// ─── Phase 53: Permit to Work (PTW) ──────────────────────────────────────────
export const PTW_TYPES = [
  { key:'hot_work',     label:'งานร้อน (Hot Work)',           icon:'🔥', color:'#dc2626' },
  { key:'electrical',   label:'งานไฟฟ้า (Electrical)',        icon:'⚡', color:'#d97706' },
  { key:'confined',     label:'พื้นที่อับอากาศ (CSE)',         icon:'🕳️', color:'#7c3aed' },
  { key:'work_height',  label:'งานบนที่สูง (WAH)',            icon:'🏗️', color:'#2563eb' },
  { key:'excavation',   label:'งานขุดเจาะ (Excavation)',      icon:'🚜', color:'#92400e' },
  { key:'pressure',     label:'งานแรงดัน (Pressure)',         icon:'💨', color:'#0891b2' },
  { key:'chem_handling',label:'จัดการสารเคมี (Chemical)',      icon:'⚗️', color:'#059669' },
  { key:'general',      label:'งานทั่วไป (General)',          icon:'🔧', color:'#6b7280' },
];
export const PTW_STATUS = {
  draft:    { label:'ร่าง',               color:'#6b7280', bg:'#f3f4f6' },
  pending:  { label:'รออนุมัติ',          color:'#d97706', bg:'#fef3c7' },
  approved: { label:'อนุมัติแล้ว',        color:'#2563eb', bg:'#dbeafe' },
  active:   { label:'กำลังดำเนินงาน',    color:'#16a34a', bg:'#dcfce7' },
  completed:{ label:'เสร็จสิ้น',          color:'#059669', bg:'#ecfdf5' },
  rejected: { label:'ไม่อนุมัติ',         color:'#dc2626', bg:'#fee2e2' },
  cancelled:{ label:'ยกเลิก',             color:'#9ca3af', bg:'#f9fafb' },
  expired:  { label:'หมดอายุ',            color:'#7c3aed', bg:'#f5f3ff' },
};
export const PTW_RISK_LEVELS = {
  low:      { label:'ต่ำ',    color:'#16a34a', bg:'#dcfce7' },
  medium:   { label:'ปานกลาง',color:'#d97706', bg:'#fef3c7' },
  high:     { label:'สูง',    color:'#dc2626', bg:'#fee2e2' },
  critical: { label:'วิกฤติ', color:'#7c3aed', bg:'#f5f3ff' },
};
export async function listPTW() {
  const s = await getDocs(query(collection(db, COL.ptw), orderBy('createdAt','desc'), limit(300)));
  return s.docs.map(d=>({ id:d.id, ...d.data() }));
}
export async function getPTW(id) {
  const d = await getDoc(doc(db, COL.ptw, id));
  return d.exists() ? { id:d.id, ...d.data() } : null;
}
export async function createPTW(data, createdBy) {
  return addDoc(collection(db, COL.ptw), { ...data, createdBy, status:'draft', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updatePTW(id, data) {
  await updateDoc(doc(db, COL.ptw, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deletePTW(id) {
  await deleteDoc(doc(db, COL.ptw, id));
}

// ─── Phase 54: Noise & Vibration Monitoring ──────────────────────────────────
export const NOISE_AREA_TYPES = [
  { key:'production',    label:'พื้นที่ผลิต',           icon:'🏭', color:'#dc2626' },
  { key:'warehouse',     label:'คลังสินค้า',             icon:'📦', color:'#d97706' },
  { key:'maintenance',   label:'ซ่อมบำรุง',              icon:'🔧', color:'#2563eb' },
  { key:'compressor',    label:'ห้องคอมเพรสเซอร์',       icon:'💨', color:'#7c3aed' },
  { key:'generator',     label:'ห้องเครื่องกำเนิดไฟฟ้า', icon:'⚡', color:'#d97706' },
  { key:'loading',       label:'ท่าขนถ่าย',              icon:'🚛', color:'#059669' },
  { key:'office',        label:'สำนักงาน',               icon:'🏢', color:'#16a34a' },
  { key:'other',         label:'อื่นๆ',                   icon:'📍', color:'#6b7280' },
];
export const NOISE_STATUS = {
  safe:     { label:'ปลอดภัย (< 80 dB)',    color:'#16a34a', bg:'#dcfce7', limit:80 },
  warning:  { label:'เฝ้าระวัง (80–85 dB)', color:'#d97706', bg:'#fef3c7', limit:85 },
  exceeded: { label:'เกินมาตรฐาน (> 85 dB)',color:'#dc2626', bg:'#fee2e2', limit:999 },
};
export function classifyNoise(dB) {
  if (dB < 80) return 'safe';
  if (dB <= 85) return 'warning';
  return 'exceeded';
}
export const NOISE_MEASURE_TYPES = [
  { key:'leq', label:'Leq (Equivalent Continuous)', unit:'dB(A)' },
  { key:'twa', label:'TWA (Time-Weighted Average)',  unit:'dB(A)' },
  { key:'lpeak',label:'Lpeak (Peak Level)',           unit:'dB(C)' },
  { key:'dose', label:'Noise Dose (%)',               unit:'%' },
];
export async function listNoiseMonitor() {
  const s = await getDocs(query(collection(db, COL.noiseMonitor), orderBy('measuredAt','desc'), limit(300)));
  return s.docs.map(d=>({ id:d.id, ...d.data() }));
}
export async function getNoiseMonitor(id) {
  const d = await getDoc(doc(db, COL.noiseMonitor, id));
  return d.exists() ? { id:d.id, ...d.data() } : null;
}
export async function createNoiseMonitor(data, createdBy) {
  return addDoc(collection(db, COL.noiseMonitor), { ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateNoiseMonitor(id, data) {
  await updateDoc(doc(db, COL.noiseMonitor, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deleteNoiseMonitor(id) {
  await deleteDoc(doc(db, COL.noiseMonitor, id));
}

// ─── Phase 55: Incident Investigation (RCA) ──────────────────────────────────
export const INVESTIG_METHODS = [
  { key:'five_why',  label:'5-Why Analysis',      icon:'🔍', color:'#2563eb' },
  { key:'fishbone',  label:'Fishbone Diagram (Ishikawa)', icon:'🐟', color:'#7c3aed' },
  { key:'fault_tree',label:'Fault Tree Analysis (FTA)',   icon:'🌳', color:'#059669' },
  { key:'bow_tie',   label:'Bow-Tie Analysis',    icon:'🎀', color:'#d97706' },
  { key:'taproot',   label:'TapRooT Analysis',    icon:'🌿', color:'#16a34a' },
];
export const ROOT_CAUSE_CATEGORIES = [
  { key:'human',       label:'บุคลากร (Human Factor)',       icon:'👤', color:'#dc2626' },
  { key:'equipment',   label:'เครื่องจักร/อุปกรณ์',         icon:'⚙️', color:'#d97706' },
  { key:'environment', label:'สภาพแวดล้อมการทำงาน',          icon:'🌡️', color:'#2563eb' },
  { key:'procedure',   label:'ขั้นตอน/วิธีการปฏิบัติงาน',   icon:'📋', color:'#7c3aed' },
  { key:'management',  label:'การบริหารจัดการ',              icon:'👔', color:'#059669' },
  { key:'material',    label:'วัสดุ/สารเคมี',                icon:'🧪', color:'#0891b2' },
];
export const INVESTIG_STATUS = {
  open:        { label:'เปิดการสอบสวน',   color:'#d97706', bg:'#fef3c7' },
  in_progress: { label:'กำลังสอบสวน',    color:'#2563eb', bg:'#dbeafe' },
  completed:   { label:'สอบสวนเสร็จสิ้น',color:'#16a34a', bg:'#dcfce7' },
  closed:      { label:'ปิดแล้ว',         color:'#6b7280', bg:'#f3f4f6' },
};
export async function listIncidentInvestig() {
  const s = await getDocs(query(collection(db, COL.incidentInvestig), orderBy('createdAt','desc'), limit(200)));
  return s.docs.map(d=>({ id:d.id, ...d.data() }));
}
export async function getIncidentInvestig(id) {
  const d = await getDoc(doc(db, COL.incidentInvestig, id));
  return d.exists() ? { id:d.id, ...d.data() } : null;
}
export async function createIncidentInvestig(data, createdBy) {
  return addDoc(collection(db, COL.incidentInvestig), { ...data, createdBy, status:'open', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateIncidentInvestig(id, data) {
  await updateDoc(doc(db, COL.incidentInvestig, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deleteIncidentInvestig(id) {
  await deleteDoc(doc(db, COL.incidentInvestig, id));
}

// ─── Phase 57: Safety Passport (บัตรผ่านความปลอดภัยรายบุคคล) ─────────────────
export const PASSPORT_DEPARTMENTS = [
  'ผลิต','คลังสินค้า','ซ่อมบำรุง','QC/QA','Shipping','ธุรการ','วิศวกรรม','ความปลอดภัย','อื่นๆ',
];
export const PASSPORT_CERTS = [
  { key:'loto',       label:'LOTO Authorized',          icon:'🔒', color:'#dc2626' },
  { key:'wah',        label:'Work at Height',            icon:'🏗️', color:'#2563eb' },
  { key:'cse',        label:'Confined Space Entry',      icon:'🕳️', color:'#7c3aed' },
  { key:'hot_work',   label:'Hot Work / Welding',        icon:'🔥', color:'#d97706' },
  { key:'first_aid',  label:'First Aid / CPR',           icon:'🩺', color:'#16a34a' },
  { key:'fire_warden',label:'Fire Warden',               icon:'🚒', color:'#dc2626' },
  { key:'forklift',   label:'Forklift Operator',         icon:'🏗️', color:'#059669' },
  { key:'crane',      label:'Crane / Rigging',           icon:'🏗️', color:'#0891b2' },
  { key:'chem_handling',label:'Chemical Handling',       icon:'⚗️', color:'#7c3aed' },
  { key:'electrical', label:'Electrical Safety',         icon:'⚡', color:'#d97706' },
  { key:'scba',       label:'SCBA / Breathing Apparatus',icon:'😷', color:'#2563eb' },
  { key:'safety_officer_cert', label:'จป.วิชาชีพ / เทคนิค', icon:'🛡️', color:'#1a237e' },
];
export const PASSPORT_STATUS = {
  active:    { label:'ทำงานอยู่',   color:'#16a34a', bg:'#dcfce7' },
  inactive:  { label:'ลาออก/ย้าย', color:'#6b7280', bg:'#f3f4f6' },
  suspended: { label:'พักงาน',      color:'#dc2626', bg:'#fee2e2' },
};
export function calcPassportScore(passport) {
  let score = 100;
  const now = new Date();
  // deduct for expired certs
  (passport.certs||[]).forEach(c => {
    if (c.expiryDate && new Date(c.expiryDate) < now) score -= 10;
  });
  // deduct for violations
  score -= Math.min((passport.violationCount||0) * 5, 30);
  // deduct if health check expired
  if (passport.lastHealthCheck) {
    const months = (now - new Date(passport.lastHealthCheck)) / (1000*60*60*24*30);
    if (months > 12) score -= 10;
  }
  return Math.max(score, 0);
}
export async function listSafetyPassport() {
  const s = await getDocs(query(collection(db, COL.safetyPassport), orderBy('employeeName','asc'), limit(500)));
  return s.docs.map(d=>({ id:d.id, ...d.data() }));
}
export async function getSafetyPassport(id) {
  const d = await getDoc(doc(db, COL.safetyPassport, id));
  return d.exists() ? { id:d.id, ...d.data() } : null;
}
export async function createSafetyPassport(data, createdBy) {
  return addDoc(collection(db, COL.safetyPassport), { ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateSafetyPassport(id, data) {
  await updateDoc(doc(db, COL.safetyPassport, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deleteSafetyPassport(id) {
  await deleteDoc(doc(db, COL.safetyPassport, id));
}

// ─── Phase 58: Management of Change (MoC) ────────────────────────────────────
export const MOC_TYPES = [
  { key:'process',    label:'เปลี่ยนแปลงกระบวนการผลิต',    icon:'⚙️', color:'#2563eb' },
  { key:'chemical',   label:'เปลี่ยน/เพิ่มสารเคมี',          icon:'⚗️', color:'#7c3aed' },
  { key:'equipment',  label:'ติดตั้ง/เปลี่ยนเครื่องจักร',    icon:'🏗️', color:'#d97706' },
  { key:'procedure',  label:'เปลี่ยนขั้นตอน/วิธีการทำงาน',   icon:'📋', color:'#059669' },
  { key:'facility',   label:'ปรับปรุงสิ่งอำนวยความสะดวก',    icon:'🏭', color:'#0891b2' },
  { key:'personnel',  label:'เปลี่ยนแปลงบุคลากร/หน้าที่',    icon:'👤', color:'#dc2626' },
  { key:'material',   label:'เปลี่ยนวัตถุดิบ/วัสดุ',         icon:'📦', color:'#92400e' },
  { key:'regulatory', label:'ปฏิบัติตามกฎหมายใหม่',          icon:'⚖️', color:'#1a237e' },
  { key:'other',      label:'อื่นๆ',                          icon:'🔧', color:'#6b7280' },
];
export const MOC_STATUS = {
  draft:       { label:'ร่าง',               color:'#6b7280', bg:'#f3f4f6' },
  submitted:   { label:'ส่งพิจารณา',         color:'#2563eb', bg:'#dbeafe' },
  under_review:{ label:'กำลังพิจารณา',       color:'#d97706', bg:'#fef3c7' },
  approved:    { label:'อนุมัติ',            color:'#16a34a', bg:'#dcfce7' },
  rejected:    { label:'ไม่อนุมัติ',         color:'#dc2626', bg:'#fee2e2' },
  implemented: { label:'ดำเนินการแล้ว',      color:'#059669', bg:'#ecfdf5' },
  closed:      { label:'ปิด MoC',            color:'#6b7280', bg:'#f3f4f6' },
};
export const MOC_RISK_LEVELS = {
  low:      { label:'ต่ำ — ไม่กระทบความปลอดภัยมาก',  color:'#16a34a', bg:'#dcfce7' },
  medium:   { label:'ปานกลาง — ต้องประเมินก่อน',       color:'#d97706', bg:'#fef3c7' },
  high:     { label:'สูง — ต้องผ่านคณะกรรมการ',        color:'#dc2626', bg:'#fee2e2' },
  critical: { label:'วิกฤติ — หยุดจนกว่าจะอนุมัติ',    color:'#7c3aed', bg:'#f5f3ff' },
};
export const MOC_REVIEW_AREAS = [
  'ความปลอดภัยของพนักงาน',
  'สิ่งแวดล้อมและมลพิษ',
  'คุณภาพผลิตภัณฑ์',
  'ความเสี่ยงจากอัคคีภัย/การระเบิด',
  'สารเคมีอันตราย',
  'ระบบไฟฟ้าและพลังงาน',
  'ผลกระทบต่อกระบวนการอื่น',
  'ข้อกำหนดทางกฎหมาย',
];
export async function listMoC() {
  const s = await getDocs(query(collection(db, COL.moc), orderBy('createdAt','desc'), limit(300)));
  return s.docs.map(d=>({ id:d.id, ...d.data() }));
}
export async function getMoC(id) {
  const d = await getDoc(doc(db, COL.moc, id));
  return d.exists() ? { id:d.id, ...d.data() } : null;
}
export async function createMoC(data, createdBy) {
  return addDoc(collection(db, COL.moc), { ...data, createdBy, status:'draft', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateMoC(id, data) {
  await updateDoc(doc(db, COL.moc, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deleteMoC(id) {
  await deleteDoc(doc(db, COL.moc, id));
}

// ────────────────────────────────────────────
// Phase 59 — Safety Statistics & Man-Hours
// ────────────────────────────────────────────
export const STAT_DEPARTMENTS = [
  'รวมทั้งโรงงาน','ผลิต','คลังสินค้า','ซ่อมบำรุง','QC/QA','Shipping','ธุรการ','วิศวกรรม','ความปลอดภัย','ผู้รับเหมา',
];
export const STAT_MONTHS = [
  'ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.',
  'ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.',
];
// คำนวณอัตราต่อ 200,000 ชั่วโมง (= 100 คน × 50 สัปดาห์ × 40 ชั่วโมง)
export function calcSafetyRates(s) {
  const mh = s.manHours || 0;
  if (!mh) return { trir:0, ltifr:0, severityRate:0, nearMissRate:0 };
  const recordable = (s.ltiCount||0) + (s.rwsCount||0) + (s.mtcCount||0);
  return {
    trir:         +(recordable                  * 200000 / mh).toFixed(2),
    ltifr:        +((s.ltiCount||0)             * 200000 / mh).toFixed(2),
    severityRate: +((s.lostDays||0)             * 200000 / mh).toFixed(2),
    nearMissRate: +((s.nearMissCount||0)        * 200000 / mh).toFixed(2),
  };
}
export async function listSafetyStats(year) {
  const q = year
    ? query(collection(db, COL.safetyStats), where('year','==',year), orderBy('month','asc'))
    : query(collection(db, COL.safetyStats), orderBy('year','desc'), orderBy('month','desc'), limit(300));
  const s = await getDocs(q);
  return s.docs.map(d=>({ id:d.id, ...d.data() }));
}
export async function getSafetyStats(id) {
  const d = await getDoc(doc(db, COL.safetyStats, id));
  return d.exists() ? { id:d.id, ...d.data() } : null;
}
export async function upsertSafetyStats(year, month, department, data, createdBy) {
  const docId = `${year}-${String(month).padStart(2,'0')}-${department.replace(/\//g,'_')}`;
  const ref   = doc(db, COL.safetyStats, docId);
  const snap  = await getDoc(ref);
  if (snap.exists()) {
    await updateDoc(ref, { ...data, year, month, department, updatedAt: serverTimestamp() });
  } else {
    await setDoc(ref, { ...data, year, month, department, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  }
  return docId;
}
export async function deleteSafetyStats(id) {
  await deleteDoc(doc(db, COL.safetyStats, id));
}

// ────────────────────────────────────────────
// Phase 60 — Safety Training Matrix
// ────────────────────────────────────────────
export const MATRIX_TRAINING_TYPES = [
  { key:'mandatory',   label:'บังคับตามกฎหมาย',       icon:'⚖️', color:'#dc2626', bg:'#fee2e2' },
  { key:'iso45001',    label:'ข้อกำหนด ISO 45001',     icon:'📋', color:'#2563eb', bg:'#dbeafe' },
  { key:'internal',    label:'กำหนดภายใน',              icon:'🏭', color:'#059669', bg:'#dcfce7' },
  { key:'recommended', label:'แนะนำ',                   icon:'💡', color:'#d97706', bg:'#fef3c7' },
];
export const MATRIX_STATUS = {
  compliant: { label:'Compliant',  color:'#16a34a', bg:'#dcfce7' },
  expiring:  { label:'ใกล้หมดอายุ',color:'#d97706', bg:'#fef3c7' },
  overdue:   { label:'เกินกำหนด', color:'#dc2626', bg:'#fee2e2' },
  pending:   { label:'ยังไม่ดำเนินการ',color:'#6b7280',bg:'#f3f4f6'},
};
export const MATRIX_DEPARTMENTS = [
  'ผลิต','คลังสินค้า','ซ่อมบำรุง','QC/QA','Shipping','ธุรการ','วิศวกรรม','ความปลอดภัย','ผู้รับเหมา',
];
export function calcMatrixStatus(r) {
  if (!r.completionDate) return 'pending';
  if (!r.validityMonths) return 'compliant';
  const expiry = new Date(r.expiryDate || r.completionDate);
  expiry.setMonth(expiry.getMonth() + (r.validityMonths||12));
  const now = new Date();
  const daysLeft = Math.floor((expiry - now) / 86400000);
  if (daysLeft < 0)  return 'overdue';
  if (daysLeft < 60) return 'expiring';
  return 'compliant';
}
export async function listTrainingMatrix() {
  const s = await getDocs(query(collection(db, COL.trainingMatrix), orderBy('courseName','asc')));
  return s.docs.map(d=>({ id:d.id, ...d.data() }));
}
export async function getTrainingMatrix(id) {
  const d = await getDoc(doc(db, COL.trainingMatrix, id));
  return d.exists() ? { id:d.id, ...d.data() } : null;
}
export async function createTrainingMatrix(data, createdBy) {
  return addDoc(collection(db, COL.trainingMatrix), { ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateTrainingMatrix(id, data) {
  await updateDoc(doc(db, COL.trainingMatrix), { ...data, updatedAt: serverTimestamp() });
}
export async function updateTrainingMatrixDoc(id, data) {
  await updateDoc(doc(db, COL.trainingMatrix, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deleteTrainingMatrix(id) {
  await deleteDoc(doc(db, COL.trainingMatrix, id));
}

// ────────────────────────────────────────────
// Phase 61 — Safety Score Card
// ────────────────────────────────────────────
export const SCORECARD_CRITERIA = [
  { key:'incidents',  label:'ไม่มีอุบัติเหตุ',          weight:20, hint:'LTI=0:20, MTC=0:15, มีFAC:10, มีLTI:0' },
  { key:'inspection', label:'ตรวจความปลอดภัย',           weight:20, hint:'ทำ≥100%:20, ≥80%:15, ≥60%:10, <60%:5' },
  { key:'training',   label:'ฝึกอบรมตามแผน',             weight:15, hint:'ผ่าน≥100%:15, ≥80%:10, ≥60%:7, <60%:3' },
  { key:'nearMiss',   label:'รายงาน Near Miss',           weight:15, hint:'รายงาน≥3:15, 2:10, 1:7, 0:3' },
  { key:'capa',       label:'ปิด CAPA ตามกำหนด',         weight:15, hint:'ปิดทั้งหมด:15, ≥80%:10, ≥60%:7, <60%:3' },
  { key:'fiveS',      label:'5ส (คะแนนตรวจ)',            weight:10, hint:'≥90%:10, ≥80%:8, ≥70%:6, <70%:3' },
  { key:'ppe',        label:'การใส่ PPE ถูกต้อง',         weight:5,  hint:'ไม่มีการฝ่าฝืน:5, 1ครั้ง:3, >1:1' },
];
export const SCORECARD_GRADE = [
  { min:90, label:'A — ยอดเยี่ยม',   color:'#16a34a', bg:'#dcfce7' },
  { min:80, label:'B — ดี',           color:'#2563eb', bg:'#dbeafe' },
  { min:70, label:'C — พอใช้',        color:'#d97706', bg:'#fef3c7' },
  { min:50, label:'D — ต้องปรับปรุง', color:'#ea580c', bg:'#fff7ed' },
  { min:0,  label:'F — วิกฤติ',       color:'#dc2626', bg:'#fee2e2' },
];
export const SCORECARD_DEPARTMENTS = [
  'ผลิต','คลังสินค้า','ซ่อมบำรุง','QC/QA','Shipping','ธุรการ','วิศวกรรม','ความปลอดภัย',
];
export function calcScoreGrade(total) {
  return SCORECARD_GRADE.find(g=>total>=g.min) || SCORECARD_GRADE[SCORECARD_GRADE.length-1];
}
export function calcTotalScore(scores) {
  return SCORECARD_CRITERIA.reduce((sum,c)=>sum+(scores[c.key]||0), 0);
}
export async function listScoreCard(year) {
  const q = year
    ? query(collection(db, COL.scoreCard), where('year','==',year), orderBy('month','desc'))
    : query(collection(db, COL.scoreCard), orderBy('year','desc'), orderBy('month','desc'), limit(300));
  const s = await getDocs(q);
  return s.docs.map(d=>({ id:d.id, ...d.data() }));
}
export async function getScoreCard(id) {
  const d = await getDoc(doc(db, COL.scoreCard, id));
  return d.exists() ? { id:d.id, ...d.data() } : null;
}
export async function upsertScoreCard(year, month, department, data, createdBy) {
  const docId = `${year}-${String(month).padStart(2,'0')}-${department.replace(/[\s/]/g,'_')}`;
  const ref   = doc(db, COL.scoreCard, docId);
  const snap  = await getDoc(ref);
  if (snap.exists()) {
    await updateDoc(ref, { ...data, year, month, department, updatedAt: serverTimestamp() });
  } else {
    await setDoc(ref, { ...data, year, month, department, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  }
  return docId;
}
export async function deleteScoreCard(id) {
  await deleteDoc(doc(db, COL.scoreCard, id));
}

// ────────────────────────────────────────────
// Phase 62 — Safety Bulletin Board
// ────────────────────────────────────────────
export const BULLETIN_TYPES = [
  { key:'lesson_learned', label:'Lesson Learned',          icon:'📖', color:'#2563eb', bg:'#dbeafe' },
  { key:'safety_reminder',label:'Safety Reminder',         icon:'🔔', color:'#d97706', bg:'#fef3c7' },
  { key:'regulatory',     label:'กฎหมาย/มาตรฐานใหม่',    icon:'⚖️', color:'#7c3aed', bg:'#f5f3ff' },
  { key:'achievement',    label:'Safety Achievement',      icon:'🏆', color:'#16a34a', bg:'#dcfce7' },
  { key:'warning',        label:'คำเตือน/ข้อควรระวัง',    icon:'⚠️', color:'#dc2626', bg:'#fee2e2' },
  { key:'procedure_update',label:'ปรับปรุงขั้นตอนงาน',   icon:'📋', color:'#059669', bg:'#ecfdf5' },
  { key:'general',        label:'ประกาศทั่วไป',            icon:'📢', color:'#6b7280', bg:'#f3f4f6' },
];
export const BULLETIN_PRIORITY = {
  critical: { label:'ด่วนมาก', color:'#dc2626', bg:'#fee2e2' },
  high:     { label:'ด่วน',    color:'#d97706', bg:'#fef3c7' },
  normal:   { label:'ปกติ',    color:'#2563eb', bg:'#dbeafe' },
};
export const BULLETIN_STATUS = {
  published: { label:'เผยแพร่แล้ว', color:'#16a34a', bg:'#dcfce7' },
  draft:     { label:'ร่าง',         color:'#6b7280', bg:'#f3f4f6' },
  archived:  { label:'เก็บถาวร',    color:'#9ca3af', bg:'#f9fafb' },
};
export async function listBulletin(statusFilter) {
  const q = statusFilter
    ? query(collection(db, COL.bulletin), where('status','==',statusFilter), orderBy('publishedAt','desc'), limit(200))
    : query(collection(db, COL.bulletin), orderBy('publishedAt','desc'), limit(200));
  const s = await getDocs(q);
  return s.docs.map(d=>({ id:d.id, ...d.data() }));
}
export async function getBulletin(id) {
  const d = await getDoc(doc(db, COL.bulletin, id));
  return d.exists() ? { id:d.id, ...d.data() } : null;
}
export async function createBulletin(data, createdBy) {
  const now = new Date().toISOString().slice(0,10);
  return addDoc(collection(db, COL.bulletin), { ...data, createdBy, status: data.status||'draft', publishedAt: data.status==='published'?now:null, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateBulletin(id, data) {
  await updateDoc(doc(db, COL.bulletin, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deleteBulletin(id) {
  await deleteDoc(doc(db, COL.bulletin, id));
}

// ────────────────────────────────────────────
// Phase 63 — Safety Improvement Projects
// ────────────────────────────────────────────
export const PROJECT_CATEGORIES = [
  { key:'engineering',  label:'Engineering Control', icon:'⚙️', color:'#2563eb' },
  { key:'admin',        label:'Administrative Control',icon:'📋',color:'#7c3aed' },
  { key:'ppe',          label:'PPE / อุปกรณ์ป้องกัน', icon:'🦺', color:'#d97706' },
  { key:'training',     label:'ฝึกอบรม / พัฒนาคน',  icon:'📚', color:'#059669' },
  { key:'process',      label:'ปรับปรุงกระบวนการ',    icon:'🔄', color:'#0891b2' },
  { key:'facility',     label:'ปรับปรุงสถานที่',       icon:'🏭', color:'#92400e' },
  { key:'digital',      label:'Digital / System',     icon:'💻', color:'#4f46e5' },
  { key:'other',        label:'อื่นๆ',                 icon:'🔧', color:'#6b7280' },
];
export const PROJECT_STATUS = {
  planning:    { label:'วางแผน',       color:'#6b7280', bg:'#f3f4f6' },
  in_progress: { label:'กำลังดำเนินการ',color:'#2563eb', bg:'#dbeafe' },
  on_hold:     { label:'หยุดชั่วคราว', color:'#d97706', bg:'#fef3c7' },
  completed:   { label:'เสร็จสิ้น',    color:'#16a34a', bg:'#dcfce7' },
  cancelled:   { label:'ยกเลิก',       color:'#dc2626', bg:'#fee2e2' },
};
export const PROJECT_PRIORITY = {
  critical:{ label:'วิกฤติ', color:'#dc2626', bg:'#fee2e2' },
  high:    { label:'สูง',    color:'#d97706', bg:'#fef3c7' },
  medium:  { label:'กลาง',   color:'#2563eb', bg:'#dbeafe' },
  low:     { label:'ต่ำ',    color:'#6b7280', bg:'#f3f4f6' },
};
export function calcProjectProgress(project) {
  const ms = project.milestones||[];
  if (!ms.length) return project.manualProgress||0;
  return Math.round(ms.filter(m=>m.done).length / ms.length * 100);
}
export async function listSafetyProject() {
  const s = await getDocs(query(collection(db, COL.safetyProject), orderBy('createdAt','desc'), limit(300)));
  return s.docs.map(d=>({ id:d.id, ...d.data() }));
}
export async function getSafetyProject(id) {
  const d = await getDoc(doc(db, COL.safetyProject, id));
  return d.exists() ? { id:d.id, ...d.data() } : null;
}
export async function createSafetyProject(data, createdBy) {
  return addDoc(collection(db, COL.safetyProject), { ...data, createdBy, status:'planning', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateSafetyProject(id, data) {
  await updateDoc(doc(db, COL.safetyProject, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deleteSafetyProject(id) {
  await deleteDoc(doc(db, COL.safetyProject, id));
}

// ────────────────────────────────────────────
// Phase 64 — Daily Safety Report
// ────────────────────────────────────────────
export const DAILY_SHIFTS = [
  { key:'morning',   label:'กะเช้า (06:00–14:00)',   icon:'🌅' },
  { key:'afternoon', label:'กะบ่าย (14:00–22:00)',  icon:'🌇' },
  { key:'night',     label:'กะดึก (22:00–06:00)',   icon:'🌙' },
  { key:'all',       label:'ทุกกะ / ตลอดวัน',        icon:'🕐' },
];
export const DAILY_STATUS = {
  safe:    { label:'ปลอดภัย',      color:'#16a34a', bg:'#dcfce7', icon:'🟢' },
  caution: { label:'ต้องระวัง',    color:'#d97706', bg:'#fef3c7', icon:'🟡' },
  unsafe:  { label:'ไม่ปลอดภัย',  color:'#dc2626', bg:'#fee2e2', icon:'🔴' },
};
export const DAILY_ACTIVITIES = [
  'Safety Talk ก่อนเริ่มงาน','ตรวจ PPE ก่อนเข้าพื้นที่','ตรวจความปลอดภัยพื้นที่ผลิต',
  'ตรวจสอบอุปกรณ์ดับเพลิง','ตรวจสอบ LOTO','ตรวจสอบป้ายความปลอดภัย',
  'ติดตาม CAPA คงค้าง','ประชุม/หารือทีม','ฝึกอบรมระหว่างกะ','ออกตรวจ Safety Walk',
];
export const DAILY_WEATHER = [
  { key:'sunny',  label:'แดดจัด',    icon:'☀️' },
  { key:'cloudy', label:'มีเมฆ',     icon:'⛅' },
  { key:'rainy',  label:'ฝนตก',      icon:'🌧️' },
  { key:'storm',  label:'พายุ/ลมแรง',icon:'⛈️' },
];
export async function listDailyReport(limit200) {
  const s = await getDocs(query(collection(db, COL.dailyReport), orderBy('reportDate','desc'), limit(limit200||200)));
  return s.docs.map(d=>({ id:d.id, ...d.data() }));
}
export async function getDailyReport(id) {
  const d = await getDoc(doc(db, COL.dailyReport, id));
  return d.exists() ? { id:d.id, ...d.data() } : null;
}
export async function createDailyReport(data, createdBy) {
  return addDoc(collection(db, COL.dailyReport), { ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateDailyReport(id, data) {
  await updateDoc(doc(db, COL.dailyReport, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deleteDailyReport(id) {
  await deleteDoc(doc(db, COL.dailyReport, id));
}

// ────────────────────────────────────────────
// Phase 65 — Contractor Safety Evaluation
// ────────────────────────────────────────────
export const CEVAL_CRITERIA_PREQUALIFY = [
  { key:'license',      label:'ใบอนุญาตประกอบธุรกิจ / ทะเบียนการค้า', weight:10 },
  { key:'insurance',    label:'ประกันภัยอุบัติเหตุ / ประกันความรับผิด', weight:15 },
  { key:'safety_plan',  label:'แผนความปลอดภัยการทำงาน',                weight:15 },
  { key:'ppe_policy',   label:'นโยบาย PPE และบันทึกการจัดหา',          weight:10 },
  { key:'training_rec', label:'บันทึกการฝึกอบรมความปลอดภัยของพนักงาน', weight:15 },
  { key:'incident_hist',label:'ประวัติอุบัติเหตุย้อนหลัง 3 ปี',        weight:15 },
  { key:'equipment',    label:'รายการเครื่องมือ/เครื่องจักรและใบรับรอง',weight:10 },
  { key:'emergency',    label:'แผนฉุกเฉินและการซ้อม',                   weight:10 },
];
export const CEVAL_CRITERIA_ONSITE = [
  { key:'ppe_compliance',  label:'การสวมใส่ PPE ถูกต้องครบถ้วน',       weight:20 },
  { key:'housekeeping',    label:'ความเป็นระเบียบเรียบร้อยในพื้นที่งาน', weight:15 },
  { key:'procedure_follow',label:'ปฏิบัติตามขั้นตอนงานที่กำหนด',       weight:20 },
  { key:'toolbox_talk',    label:'เข้าร่วม Safety Talk / Tool Box Talk',weight:10 },
  { key:'near_miss_report',label:'รายงาน Near Miss / เหตุการณ์ต้องสอบ', weight:10 },
  { key:'communication',   label:'การสื่อสารและตอบสนองต่อ Safety Officer',weight:10 },
  { key:'equipment_check', label:'ตรวจสอบเครื่องมือก่อนใช้งาน',         weight:15 },
];
export const CEVAL_GRADE = [
  { min:90, label:'A — ผ่านดีเยี่ยม',  color:'#16a34a', bg:'#dcfce7', approved:'approved' },
  { min:75, label:'B — ผ่าน',           color:'#2563eb', bg:'#dbeafe', approved:'approved' },
  { min:60, label:'C — ผ่านมีเงื่อนไข', color:'#d97706', bg:'#fef3c7', approved:'conditional' },
  { min:0,  label:'F — ไม่ผ่าน',        color:'#dc2626', bg:'#fee2e2', approved:'rejected' },
];
export const CEVAL_APPROVAL = {
  approved:    { label:'อนุมัติเข้าทำงาน',     color:'#16a34a', bg:'#dcfce7', icon:'✅' },
  conditional: { label:'อนุมัติมีเงื่อนไข',    color:'#d97706', bg:'#fef3c7', icon:'⚠️' },
  rejected:    { label:'ไม่อนุมัติ',            color:'#dc2626', bg:'#fee2e2', icon:'❌' },
  pending:     { label:'รอตรวจสอบ',             color:'#6b7280', bg:'#f3f4f6', icon:'⏳' },
};
export const CEVAL_WORK_TYPE = [
  { key:'construction',  label:'งานก่อสร้าง / ติดตั้ง',    icon:'🏗️' },
  { key:'maintenance',   label:'ซ่อมบำรุง / ดัดแปลง',      icon:'🔧' },
  { key:'electrical',    label:'งานไฟฟ้า / ระบบ',           icon:'⚡' },
  { key:'cleaning',      label:'ทำความสะอาด / กำจัดขยะ',    icon:'🧹' },
  { key:'delivery',      label:'ขนส่ง / จัดส่ง',            icon:'🚚' },
  { key:'inspection',    label:'ตรวจสอบ / ทดสอบ',           icon:'🔍' },
  { key:'it_service',    label:'IT / ระบบสารสนเทศ',         icon:'💻' },
  { key:'other',         label:'อื่นๆ',                      icon:'🔖' },
];
export function calcCEvalScore(scores, criteria) {
  let total = 0, maxTotal = 0;
  criteria.forEach(c => {
    total    += (scores[c.key] || 0) * c.weight;
    maxTotal += 100 * c.weight;
  });
  return maxTotal ? +(total / maxTotal * 100).toFixed(1) : 0;
}
export function getCEvalGrade(score) {
  return CEVAL_GRADE.find(g => score >= g.min) || CEVAL_GRADE[CEVAL_GRADE.length - 1];
}
export async function listContractorEval(lim) {
  const s = await getDocs(query(collection(db, COL.contractorEval), orderBy('evalDate','desc'), limit(lim || 300)));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function getContractorEval(id) {
  const d = await getDoc(doc(db, COL.contractorEval, id));
  return d.exists() ? { id: d.id, ...d.data() } : null;
}
export async function createContractorEval(data, createdBy) {
  return addDoc(collection(db, COL.contractorEval), { ...data, createdBy, approvalStatus:'pending', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateContractorEval(id, data) {
  await updateDoc(doc(db, COL.contractorEval, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deleteContractorEval(id) {
  await deleteDoc(doc(db, COL.contractorEval, id));
}

// ────────────────────────────────────────────
// Phase 66 — Occupational Health Surveillance
// ────────────────────────────────────────────
export const OCCH_HAZARD_TYPES = [
  { key:'noise',       label:'เสียงดัง (Noise)',           icon:'🔊', color:'#d97706', bg:'#fef3c7' },
  { key:'chemical',    label:'สารเคมีอันตราย (Chemical)',  icon:'🧪', color:'#7c3aed', bg:'#f5f3ff' },
  { key:'dust',        label:'ฝุ่นละออง (Dust)',           icon:'💨', color:'#92400e', bg:'#fef9c3' },
  { key:'heat',        label:'ความร้อน (Heat Stress)',      icon:'🌡️', color:'#dc2626', bg:'#fee2e2' },
  { key:'ergonomic',   label:'ท่าทางการทำงาน (Ergonomic)', icon:'🦴', color:'#2563eb', bg:'#dbeafe' },
  { key:'biological',  label:'สารชีวภาพ (Biological)',     icon:'🦠', color:'#059669', bg:'#dcfce7' },
  { key:'radiation',   label:'รังสี (Radiation)',           icon:'☢️', color:'#9ca3af', bg:'#f3f4f6' },
  { key:'vibration',   label:'การสั่นสะเทือน (Vibration)', icon:'📳', color:'#0891b2', bg:'#e0f2fe' },
  { key:'msd',         label:'โรคกล้ามเนื้อ (MSD)',         icon:'💪', color:'#4f46e5', bg:'#eef2ff' },
  { key:'eye',         label:'ดวงตา / แสงสว่าง',           icon:'👁️', color:'#0d9488', bg:'#f0fdfa' },
];
export const OCCH_EXAM_TYPE = [
  { key:'annual',      label:'ตรวจประจำปี' },
  { key:'pre_employ',  label:'ก่อนเข้างาน' },
  { key:'periodic',    label:'ตรวจตามรอบ (Periodic)' },
  { key:'return_work', label:'กลับจากลาป่วย (Return-to-Work)' },
  { key:'special',     label:'ตรวจพิเศษ / กรณีฉุกเฉิน' },
];
export const OCCH_RESULT_STATUS = {
  normal:      { label:'ปกติ',                color:'#16a34a', bg:'#dcfce7' },
  watchlist:   { label:'เฝ้าระวัง',           color:'#d97706', bg:'#fef3c7' },
  restricted:  { label:'จำกัดงาน',            color:'#ea580c', bg:'#fff7ed' },
  referred:    { label:'ส่งต่อแพทย์เฉพาะทาง', color:'#dc2626', bg:'#fee2e2' },
};
export async function listOccHealth(lim) {
  const s = await getDocs(query(collection(db, COL.occHealth), orderBy('examDate','desc'), limit(lim || 300)));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function getOccHealth(id) {
  const d = await getDoc(doc(db, COL.occHealth, id));
  return d.exists() ? { id: d.id, ...d.data() } : null;
}
export async function createOccHealth(data, createdBy) {
  return addDoc(collection(db, COL.occHealth), { ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateOccHealth(id, data) {
  await updateDoc(doc(db, COL.occHealth, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deleteOccHealth(id) {
  await deleteDoc(doc(db, COL.occHealth, id));
}

// ────────────────────────────────────────────
// Phase 67 — Safety Annual Plan
// ────────────────────────────────────────────
export const KPO_DUTIES = [
  { no:1,  key:'duty1',  short:'นโยบายความปลอดภัย',          label:'จัดทำนโยบายด้านความปลอดภัย อาชีวอนามัย และสภาพแวดล้อมในการทำงาน',   icon:'📜', color:'#1e40af', bg:'#dbeafe' },
  { no:2,  key:'duty2',  short:'ป้องกันอุบัติเหตุ',           label:'จัดทำแนวทางป้องกันและลดการเกิดอุบัติเหตุ การเจ็บป่วย หรือเหตุเดือดร้อน', icon:'🛡', color:'#065f46', bg:'#d1fae5' },
  { no:3,  key:'duty3',  short:'รายงาน/ปรับปรุงสภาพแวดล้อม', label:'รายงานและเสนอแนะมาตรการปรับปรุงแก้ไขสภาพแวดล้อมในการทำงานให้ถูกต้องตามกฎหมาย', icon:'📋', color:'#7c3aed', bg:'#f5f3ff' },
  { no:4,  key:'duty4',  short:'ส่งเสริมกิจกรรมความปลอดภัย', label:'ส่งเสริมกิจกรรมความปลอดภัยและการรณรงค์สร้างจิตสำนึกในองค์กร',       icon:'📢', color:'#ea580c', bg:'#fff7ed' },
  { no:5,  key:'duty5',  short:'คู่มือ/ข้อบังคับ',            label:'พิจารณาคู่มือหรือข้อบังคับด้านความปลอดภัยในการทำงาน',               icon:'📖', color:'#92400e', bg:'#fef3c7' },
  { no:6,  key:'duty6',  short:'สำรวจ/สถิติอุบัติเหตุ',       label:'สำรวจความปลอดภัยในการทำงาน ตรวจสอบสถิติการประสบอันตราย และรายงานผลในการประชุม', icon:'🔍', color:'#0891b2', bg:'#e0f2fe' },
  { no:7,  key:'duty7',  short:'แผนฝึกอบรมความปลอดภัย',      label:'พิจารณาแผนฝึกอบรมเกี่ยวกับความปลอดภัย อาชีวอนามัย และสภาพแวดล้อมในการทำงาน', icon:'📚', color:'#2563eb', bg:'#dbeafe' },
  { no:8,  key:'duty8',  short:'ระบบรายงานความไม่ปลอดภัย',   label:'จัดวางระบบให้ลูกจ้างมีช่องทางรายงานสภาพการทำงานที่ไม่ปลอดภัย',    icon:'⚠️', color:'#dc2626', bg:'#fee2e2' },
  { no:9,  key:'duty9',  short:'ติดตามผลดำเนินงาน',          label:'ติดตามผลการดำเนินงานและเรื่องที่เสนอต่อนายจ้าง',                   icon:'📌', color:'#059669', bg:'#dcfce7' },
  { no:10, key:'duty10', short:'รายงานผลประจำปี',             label:'จัดทำรายงานผลการปฏิบัติงานประจำปีเมื่อครบ 1 ปี',                  icon:'📊', color:'#6d28d9', bg:'#ede9fe' },
  { no:11, key:'duty11', short:'ประเมินผลดำเนินงาน',          label:'ประเมินผลการดำเนินงานด้านความปลอดภัยของสถานประกอบกิจการ',           icon:'✅', color:'#16a34a', bg:'#dcfce7' },
  { no:12, key:'duty12', short:'งานอื่นๆ ที่ได้รับมอบหมาย',  label:'ปฏิบัติงานอื่นๆ ตามที่นายจ้างมอบหมาย',                            icon:'🔖', color:'#6b7280', bg:'#f1f5f9' },
];
export const APLAN_CATEGORIES = [
  { key:'training',    label:'ฝึกอบรม',               icon:'📚', color:'#2563eb', bg:'#dbeafe' },
  { key:'inspection',  label:'ตรวจความปลอดภัย',        icon:'🔍', color:'#059669', bg:'#dcfce7' },
  { key:'drill',       label:'ซ้อมแผนฉุกเฉิน/ดับเพลิง',icon:'🚒', color:'#dc2626', bg:'#fee2e2' },
  { key:'audit',       label:'ตรวจประเมิน (Audit)',    icon:'📋', color:'#7c3aed', bg:'#f5f3ff' },
  { key:'health',      label:'ตรวจสุขภาพ',              icon:'🩺', color:'#0891b2', bg:'#e0f2fe' },
  { key:'meeting',     label:'ประชุมคณะกรรมการ',        icon:'👥', color:'#d97706', bg:'#fef3c7' },
  { key:'campaign',    label:'รณรงค์ / กิจกรรม',       icon:'📢', color:'#ea580c', bg:'#fff7ed' },
  { key:'maintenance', label:'ซ่อมบำรุง / ทดสอบอุปกรณ์',icon:'🔧', color:'#92400e', bg:'#fef9c3' },
  { key:'legal',       label:'ต่ออายุใบอนุญาต / กฎหมาย',icon:'⚖️', color:'#4f46e5', bg:'#eef2ff' },
  { key:'review',      label:'ทบทวนนโยบาย / เอกสาร',   icon:'📝', color:'#6b7280', bg:'#f3f4f6' },
  { key:'other',       label:'อื่นๆ',                   icon:'🔖', color:'#9ca3af', bg:'#f9fafb' },
];
export const APLAN_STATUS = {
  planned:     { label:'ยังไม่เริ่ม', color:'#6b7280', bg:'#f3f4f6' },
  in_progress: { label:'กำลังดำเนินการ', color:'#2563eb', bg:'#dbeafe' },
  completed:   { label:'เสร็จสิ้น',   color:'#16a34a', bg:'#dcfce7' },
  delayed:     { label:'ล่าช้า',       color:'#d97706', bg:'#fef3c7' },
  cancelled:   { label:'ยกเลิก',      color:'#dc2626', bg:'#fee2e2' },
};
export const APLAN_QUARTERS = [
  { key:'Q1', label:'Q1 (ม.ค.–มี.ค.)', months:[1,2,3] },
  { key:'Q2', label:'Q2 (เม.ย.–มิ.ย.)', months:[4,5,6] },
  { key:'Q3', label:'Q3 (ก.ค.–ก.ย.)', months:[7,8,9] },
  { key:'Q4', label:'Q4 (ต.ค.–ธ.ค.)', months:[10,11,12] },
];
export const APLAN_MONTHS_TH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
export async function listAnnualPlan(year) {
  const col = collection(db, COL.annualPlan);
  const q   = year
    ? query(col, orderBy('planYear','desc'), orderBy('planMonth','asc'), limit(500))
    : query(col, orderBy('planYear','desc'), orderBy('planMonth','asc'), limit(500));
  const s = await getDocs(q);
  const all = s.docs.map(d => ({ id: d.id, ...d.data() }));
  return year ? all.filter(r => r.planYear === year) : all;
}
export async function getAnnualPlan(id) {
  const d = await getDoc(doc(db, COL.annualPlan, id));
  return d.exists() ? { id: d.id, ...d.data() } : null;
}
export async function createAnnualPlan(data, createdBy) {
  return addDoc(collection(db, COL.annualPlan), { ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateAnnualPlan(id, data) {
  await updateDoc(doc(db, COL.annualPlan, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deleteAnnualPlan(id) {
  await deleteDoc(doc(db, COL.annualPlan, id));
}

// ────────────────────────────────────────────
// Phase 68 — Management Review (ISO 45001 §9.3)
// ────────────────────────────────────────────
export const MGMT_REVIEW_INPUTS = [
  { key:'prev_actions',   label:'ผลติดตามจากการทบทวนครั้งก่อน',                        clause:'9.3 a)' },
  { key:'ext_int_issues', label:'การเปลี่ยนแปลงปัจจัยภายใน/ภายนอก',                   clause:'9.3 b)' },
  { key:'ohs_perf',       label:'ผลการดำเนินงาน OH&S (อุบัติเหตุ, KPI, audit)',        clause:'9.3 c)' },
  { key:'legal_comply',   label:'การปฏิบัติตามกฎหมายและข้อกำหนด',                      clause:'9.3 d)' },
  { key:'risk_opport',    label:'ผลการประเมินความเสี่ยงและโอกาส',                       clause:'9.3 e)' },
  { key:'objectives',     label:'ความก้าวหน้าต่อวัตถุประสงค์ OH&S',                    clause:'9.3 f)' },
  { key:'interested_party',label:'ความต้องการและความคาดหวังของผู้มีส่วนได้ส่วนเสีย',   clause:'9.3 g)' },
  { key:'resources',      label:'ความเพียงพอของทรัพยากร',                               clause:'9.3 h)' },
  { key:'communication',  label:'การสื่อสารที่เกี่ยวข้องจากผู้มีส่วนได้ส่วนเสีย',     clause:'9.3 i)' },
  { key:'cont_improve',   label:'โอกาสในการปรับปรุงอย่างต่อเนื่อง',                    clause:'9.3 j)' },
];
export const MGMT_REVIEW_OUTPUTS = [
  { key:'suitability',  label:'ความเหมาะสมของระบบ OH&SMS' },
  { key:'objectives',   label:'เป้าหมาย OH&S ที่ปรับปรุง' },
  { key:'resources',    label:'ทรัพยากรที่จัดสรร' },
  { key:'action_items', label:'มาตรการปรับปรุงที่มอบหมาย' },
  { key:'policy',       label:'การเปลี่ยนแปลงนโยบาย (ถ้ามี)' },
];
export const MGMT_REVIEW_STATUS = {
  draft:     { label:'ร่าง',         color:'#6b7280', bg:'#f3f4f6' },
  approved:  { label:'อนุมัติแล้ว',  color:'#16a34a', bg:'#dcfce7' },
  closed:    { label:'ปิดการทบทวน',  color:'#2563eb', bg:'#dbeafe' },
};
export async function listMgmtReview() {
  const s = await getDocs(query(collection(db, COL.mgmtReview), orderBy('reviewDate','desc'), limit(200)));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function getMgmtReview(id) {
  const d = await getDoc(doc(db, COL.mgmtReview, id));
  return d.exists() ? { id: d.id, ...d.data() } : null;
}
export async function createMgmtReview(data, createdBy) {
  return addDoc(collection(db, COL.mgmtReview), { ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateMgmtReview(id, data) {
  await updateDoc(doc(db, COL.mgmtReview, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deleteMgmtReview(id) {
  await deleteDoc(doc(db, COL.mgmtReview, id));
}

// ────────────────────────────────────────────
// Phase 69 — Legal Compliance Evaluation (ISO 45001 §9.1.2)
// ────────────────────────────────────────────
export const LEGAL_COMP_STATUS = {
  compliant:   { label:'ปฏิบัติครบถ้วน',      color:'#16a34a', bg:'#dcfce7', icon:'✅' },
  partial:     { label:'ปฏิบัติบางส่วน',      color:'#d97706', bg:'#fef3c7', icon:'⚠️' },
  non_comply:  { label:'ยังไม่ปฏิบัติตาม',    color:'#dc2626', bg:'#fee2e2', icon:'❌' },
  not_apply:   { label:'ไม่เกี่ยวข้อง',       color:'#9ca3af', bg:'#f3f4f6', icon:'—'  },
};
export const LEGAL_COMP_CATEGORIES = [
  { key:'ohs_act',      label:'พ.ร.บ.ความปลอดภัยอาชีวอนามัย', icon:'⚖️' },
  { key:'factory_act',  label:'พ.ร.บ.โรงงาน',                  icon:'🏭' },
  { key:'hazmat',       label:'วัตถุอันตราย',                   icon:'☣️' },
  { key:'env',          label:'สิ่งแวดล้อม',                   icon:'🌿' },
  { key:'fire',         label:'ป้องกันและระงับอัคคีภัย',       icon:'🔥' },
  { key:'pressure',     label:'ภาชนะรับแรงดัน/หม้อไอน้ำ',    icon:'🫙' },
  { key:'electricity',  label:'ไฟฟ้า',                         icon:'⚡' },
  { key:'iso45001',     label:'ข้อกำหนด ISO 45001',             icon:'📋' },
  { key:'other',        label:'อื่นๆ',                          icon:'🔖' },
];
export async function listLegalCompliance() {
  const s = await getDocs(query(collection(db, COL.legalCompliance), orderBy('evalDate','desc'), limit(500)));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function getLegalCompliance(id) {
  const d = await getDoc(doc(db, COL.legalCompliance, id));
  return d.exists() ? { id: d.id, ...d.data() } : null;
}
export async function createLegalCompliance(data, createdBy) {
  return addDoc(collection(db, COL.legalCompliance), { ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateLegalCompliance(id, data) {
  await updateDoc(doc(db, COL.legalCompliance, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deleteLegalCompliance(id) {
  await deleteDoc(doc(db, COL.legalCompliance, id));
}

// ────────────────────────────────────────────
// Phase 70 — Interested Party Register (ISO 45001 §4.2)
// ────────────────────────────────────────────
export const IPARTY_TYPES = [
  { key:'employees',   label:'พนักงาน',                    icon:'👷', color:'#2563eb', bg:'#dbeafe' },
  { key:'contractors', label:'ผู้รับเหมา',                 icon:'🏗️', color:'#d97706', bg:'#fef3c7' },
  { key:'regulators',  label:'หน่วยงานราชการ / กฎหมาย',  icon:'⚖️', color:'#7c3aed', bg:'#f5f3ff' },
  { key:'customers',   label:'ลูกค้า',                     icon:'🤝', color:'#0891b2', bg:'#e0f2fe' },
  { key:'suppliers',   label:'ผู้จัดหา / ซัพพลายเออร์',  icon:'🏭', color:'#059669', bg:'#dcfce7' },
  { key:'community',   label:'ชุมชนรอบข้าง',              icon:'🏘️', color:'#92400e', bg:'#fef9c3' },
  { key:'emergency',   label:'หน่วยงานฉุกเฉิน',           icon:'🚒', color:'#dc2626', bg:'#fee2e2' },
  { key:'unions',      label:'สหภาพแรงงาน / กลุ่มพนักงาน',icon:'👥', color:'#4f46e5', bg:'#eef2ff' },
  { key:'management',  label:'ฝ่ายบริหาร / ผู้ถือหุ้น',  icon:'👔', color:'#0d9488', bg:'#f0fdfa' },
  { key:'insurance',   label:'บริษัทประกันภัย',            icon:'🛡️', color:'#6b7280', bg:'#f3f4f6' },
  { key:'other',       label:'อื่นๆ',                      icon:'🔖', color:'#9ca3af', bg:'#f9fafb' },
];
export const IPARTY_INFLUENCE = {
  high:   { label:'สูง',   color:'#dc2626', bg:'#fee2e2' },
  medium: { label:'ปานกลาง', color:'#d97706', bg:'#fef3c7' },
  low:    { label:'ต่ำ',   color:'#16a34a', bg:'#dcfce7' },
};
export const IPARTY_COMM_FREQ = [
  { key:'daily',     label:'ทุกวัน' },
  { key:'weekly',    label:'ทุกสัปดาห์' },
  { key:'monthly',   label:'ทุกเดือน' },
  { key:'quarterly', label:'ทุกไตรมาส' },
  { key:'annually',  label:'ทุกปี' },
  { key:'as_needed', label:'ตามความจำเป็น' },
];
export async function listInterestedParty() {
  const s = await getDocs(query(collection(db, COL.interestedParty), orderBy('createdAt','desc'), limit(300)));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function getInterestedParty(id) {
  const d = await getDoc(doc(db, COL.interestedParty, id));
  return d.exists() ? { id: d.id, ...d.data() } : null;
}
export async function createInterestedParty(data, createdBy) {
  return addDoc(collection(db, COL.interestedParty), { ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateInterestedParty(id, data) {
  await updateDoc(doc(db, COL.interestedParty, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deleteInterestedParty(id) {
  await deleteDoc(doc(db, COL.interestedParty, id));
}

// ────────────────────────────────────────────
// Phase 71 — Document Control (ทะเบียนควบคุมเอกสาร) ISO 45001 §7.5
// ────────────────────────────────────────────
export const DOCCTRL_TYPES = [
  { key:'policy',       label:'นโยบาย (Policy)',                   icon:'📜', color:'#7c3aed', bg:'#f5f3ff' },
  { key:'procedure',    label:'ขั้นตอนปฏิบัติ (Procedure)',         icon:'📋', color:'#2563eb', bg:'#dbeafe' },
  { key:'work_instr',   label:'วิธีการปฏิบัติงาน (Work Instruction)',icon:'📝', color:'#0891b2', bg:'#e0f2fe' },
  { key:'form',         label:'แบบฟอร์ม (Form)',                    icon:'📄', color:'#059669', bg:'#ecfdf5' },
  { key:'record',       label:'บันทึก (Record)',                    icon:'🗂️', color:'#16a34a', bg:'#dcfce7' },
  { key:'plan',         label:'แผน/โปรแกรม (Plan)',                 icon:'📅', color:'#d97706', bg:'#fef3c7' },
  { key:'drawing',      label:'แบบ/ผังงาน (Drawing)',               icon:'📐', color:'#f59e0b', bg:'#fef9c3' },
  { key:'regulation',   label:'ระเบียบ/ข้อบังคับ (Regulation)',     icon:'⚖️', color:'#dc2626', bg:'#fee2e2' },
  { key:'manual',       label:'คู่มือ (Manual)',                    icon:'📚', color:'#9333ea', bg:'#faf5ff' },
  { key:'other',        label:'อื่นๆ',                              icon:'📌', color:'#6b7280', bg:'#f3f4f6' },
];

export const DOCCTRL_STATUS = {
  current:      { label:'ปัจจุบัน',         color:'#16a34a', bg:'#dcfce7', icon:'✅' },
  draft:        { label:'ร่าง',             color:'#2563eb', bg:'#dbeafe', icon:'✏️' },
  under_review: { label:'อยู่ระหว่างทบทวน', color:'#d97706', bg:'#fef3c7', icon:'🔄' },
  obsolete:     { label:'ยกเลิก/ล้าสมัย',   color:'#9ca3af', bg:'#f3f4f6', icon:'🚫' },
};

export async function listDocControl() {
  const s = await getDocs(query(collection(db, COL.docControl), orderBy('createdAt','desc'), limit(500)));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function getDocControl(id) {
  const d = await getDoc(doc(db, COL.docControl, id));
  return d.exists() ? { id: d.id, ...d.data() } : null;
}
export async function createDocControl(data, createdBy) {
  return addDoc(collection(db, COL.docControl), { ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateDocControl(id, data) {
  await updateDoc(doc(db, COL.docControl, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deleteDocControl(id) {
  await deleteDoc(doc(db, COL.docControl, id));
}

// ────────────────────────────────────────────
// Phase 72 — Worker Participation & Consultation (การมีส่วนร่วมของพนักงาน) ISO 45001 §5.4
// ────────────────────────────────────────────
export const PARTI_TYPES = [
  { key:'consultation',    label:'การปรึกษาหารือ (Consultation)',         icon:'🤝', color:'#2563eb', bg:'#dbeafe' },
  { key:'toolbox_talk',    label:'Toolbox Talk',                          icon:'🧰', color:'#059669', bg:'#ecfdf5' },
  { key:'safety_talk',     label:'Safety Talk / บรรยายความปลอดภัย',      icon:'🎙️', color:'#0891b2', bg:'#e0f2fe' },
  { key:'suggestion',      label:'รับฟังข้อเสนอแนะ (Suggestion Session)', icon:'💡', color:'#d97706', bg:'#fef3c7' },
  { key:'survey',          label:'แบบสำรวจความคิดเห็น (Survey)',          icon:'📊', color:'#7c3aed', bg:'#f5f3ff' },
  { key:'focus_group',     label:'Focus Group',                           icon:'👥', color:'#9333ea', bg:'#faf5ff' },
  { key:'safety_walk',     label:'Safety Walk ร่วมกับพนักงาน',           icon:'🚶', color:'#16a34a', bg:'#dcfce7' },
  { key:'drill_debrief',   label:'ถอดบทเรียนหลังซ้อมแผน',               icon:'📋', color:'#dc2626', bg:'#fee2e2' },
  { key:'other',           label:'อื่นๆ',                                 icon:'📌', color:'#6b7280', bg:'#f3f4f6' },
];

export const PARTI_STATUS = {
  open:   { label:'รอดำเนินการ',  color:'#d97706', bg:'#fef3c7', icon:'🔄' },
  closed: { label:'เสร็จสิ้น',    color:'#16a34a', bg:'#dcfce7', icon:'✅' },
};

export async function listParticipation() {
  const s = await getDocs(query(collection(db, COL.participation), orderBy('activityDate','desc'), limit(300)));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function getParticipation(id) {
  const d = await getDoc(doc(db, COL.participation, id));
  return d.exists() ? { id: d.id, ...d.data() } : null;
}
export async function createParticipation(data, createdBy) {
  return addDoc(collection(db, COL.participation), { ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateParticipation(id, data) {
  await updateDoc(doc(db, COL.participation, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deleteParticipation(id) {
  await deleteDoc(doc(db, COL.participation, id));
}

// ────────────────────────────────────────────
// Phase 73 — Continual Improvement Register (ทะเบียนการปรับปรุงอย่างต่อเนื่อง) ISO 45001 §10.3
// ────────────────────────────────────────────
export const IMPV_SOURCES = [
  { key:'audit',          label:'การตรวจประเมิน (Audit)',              icon:'🔍' },
  { key:'incident',       label:'อุบัติเหตุ/เกือบเกิดเหตุ',           icon:'⚠️' },
  { key:'mgmt_review',    label:'การทบทวนของฝ่ายบริหาร',              icon:'📊' },
  { key:'risk_assess',    label:'การประเมินความเสี่ยง',                icon:'🎯' },
  { key:'suggestion',     label:'ข้อเสนอแนะพนักงาน',                  icon:'💡' },
  { key:'legal',          label:'ข้อกำหนดกฎหมาย',                     icon:'⚖️' },
  { key:'benchmark',      label:'เปรียบเทียบกับมาตรฐาน (Benchmark)',  icon:'📐' },
  { key:'kpi',            label:'ผล KPI ต่ำกว่าเป้า',                 icon:'📉' },
  { key:'other',          label:'อื่นๆ',                              icon:'📌' },
];

export const IMPV_CATEGORIES = [
  { key:'leadership',   label:'ภาวะผู้นำ',          icon:'👑', color:'#7c3aed', bg:'#f5f3ff' },
  { key:'planning',     label:'การวางแผน',           icon:'📅', color:'#2563eb', bg:'#dbeafe' },
  { key:'support',      label:'การสนับสนุน',         icon:'🤝', color:'#0891b2', bg:'#e0f2fe' },
  { key:'operation',    label:'การปฏิบัติงาน',       icon:'⚙️', color:'#059669', bg:'#ecfdf5' },
  { key:'evaluation',   label:'การประเมินสมรรถนะ',  icon:'📈', color:'#d97706', bg:'#fef3c7' },
  { key:'culture',      label:'วัฒนธรรมความปลอดภัย',icon:'🛡️', color:'#16a34a', bg:'#dcfce7' },
  { key:'environment',  label:'สิ่งแวดล้อม/สภาพงาน',icon:'🌿', color:'#15803d', bg:'#f0fdf4' },
  { key:'other',        label:'อื่นๆ',               icon:'📌', color:'#6b7280', bg:'#f3f4f6' },
];

export const IMPV_PRIORITY = {
  high:   { label:'สูง',     color:'#dc2626', bg:'#fee2e2' },
  medium: { label:'ปานกลาง', color:'#d97706', bg:'#fef3c7' },
  low:    { label:'ต่ำ',     color:'#16a34a', bg:'#dcfce7' },
};

export const IMPV_STATUS = {
  idea:        { label:'แนวคิด',          color:'#9ca3af', bg:'#f3f4f6',  icon:'💡' },
  planning:    { label:'วางแผน',          color:'#2563eb', bg:'#dbeafe',  icon:'📋' },
  in_progress: { label:'กำลังดำเนินการ', color:'#d97706', bg:'#fef3c7',  icon:'🔄' },
  completed:   { label:'เสร็จสิ้น',      color:'#16a34a', bg:'#dcfce7',  icon:'✅' },
  cancelled:   { label:'ยกเลิก',         color:'#6b7280', bg:'#f3f4f6',  icon:'🚫' },
};

export async function listImprovement() {
  const s = await getDocs(query(collection(db, COL.improvement), orderBy('createdAt','desc'), limit(300)));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function getImprovement(id) {
  const d = await getDoc(doc(db, COL.improvement, id));
  return d.exists() ? { id: d.id, ...d.data() } : null;
}
export async function createImprovement(data, createdBy) {
  return addDoc(collection(db, COL.improvement), { ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateImprovement(id, data) {
  await updateDoc(doc(db, COL.improvement, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deleteImprovement(id) {
  await deleteDoc(doc(db, COL.improvement, id));
}

// ────────────────────────────────────────────
// Phase 74 — Safety Communication Plan (แผนการสื่อสารด้านความปลอดภัย) ISO 45001 §7.4
// ────────────────────────────────────────────
export const COMM_AUDIENCES = [
  { key:'workers',      label:'พนักงานทั่วไป',          icon:'👷' },
  { key:'management',   label:'ผู้บริหาร',              icon:'👔' },
  { key:'safety_team',  label:'ทีมความปลอดภัย',         icon:'🛡️' },
  { key:'contractors',  label:'ผู้รับเหมา',             icon:'🏗️' },
  { key:'visitors',     label:'ผู้มาเยือน / แขก',       icon:'🚶' },
  { key:'committee',    label:'คณะกรรมการ คปอ',         icon:'🤝' },
  { key:'public',       label:'ชุมชน / สาธารณะ',        icon:'🏘️' },
  { key:'authority',    label:'หน่วยงานราชการ',          icon:'🏛️' },
];

export const COMM_METHODS = [
  { key:'meeting',      label:'ประชุม',                  icon:'📅' },
  { key:'notice_board', label:'บอร์ดประกาศ',            icon:'📌' },
  { key:'email',        label:'อีเมล / LINE',           icon:'📧' },
  { key:'toolbox_talk', label:'Toolbox Talk',            icon:'🧰' },
  { key:'training',     label:'ฝึกอบรม',                icon:'📚' },
  { key:'intranet',     label:'อินทราเน็ต / ระบบ ERP',  icon:'💻' },
  { key:'document',     label:'เอกสาร / หนังสือเวียน',  icon:'📄' },
  { key:'signage',      label:'ป้ายสัญลักษณ์',          icon:'⚠️' },
  { key:'drill',        label:'ซ้อมแผน / สาธิต',        icon:'🚨' },
  { key:'other',        label:'อื่นๆ',                  icon:'📢' },
];

export const COMM_FREQ = [
  { key:'daily',     label:'ทุกวัน' },
  { key:'weekly',    label:'ทุกสัปดาห์' },
  { key:'monthly',   label:'ทุกเดือน' },
  { key:'quarterly', label:'ทุกไตรมาส' },
  { key:'biannual',  label:'ทุก 6 เดือน' },
  { key:'annually',  label:'ทุกปี' },
  { key:'as_needed', label:'ตามความจำเป็น' },
  { key:'one_time',  label:'ครั้งเดียว' },
];

export const COMM_STATUS = {
  planned:  { label:'วางแผนแล้ว',    color:'#2563eb', bg:'#dbeafe', icon:'📋' },
  done:     { label:'ดำเนินการแล้ว', color:'#16a34a', bg:'#dcfce7', icon:'✅' },
  partial:  { label:'บางส่วน',       color:'#d97706', bg:'#fef3c7', icon:'⚠️' },
  overdue:  { label:'เกินกำหนด',     color:'#dc2626', bg:'#fee2e2', icon:'🔴' },
  cancelled:{ label:'ยกเลิก',        color:'#9ca3af', bg:'#f3f4f6', icon:'🚫' },
};

export async function listCommPlan() {
  const s = await getDocs(query(collection(db, COL.commPlan), orderBy('createdAt','desc'), limit(300)));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function getCommPlan(id) {
  const d = await getDoc(doc(db, COL.commPlan, id));
  return d.exists() ? { id: d.id, ...d.data() } : null;
}
export async function createCommPlan(data, createdBy) {
  return addDoc(collection(db, COL.commPlan), { ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateCommPlan(id, data) {
  await updateDoc(doc(db, COL.commPlan, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deleteCommPlan(id) {
  await deleteDoc(doc(db, COL.commPlan, id));
}

// ────────────────────────────────────────────
// Phase 75 — Lessons Learned Register (ทะเบียนบทเรียนที่ได้รับ)
// ────────────────────────────────────────────
export const LESSON_SOURCES = [
  { key:'incident',     label:'อุบัติเหตุ / บาดเจ็บ',         icon:'🚨', color:'#dc2626', bg:'#fee2e2' },
  { key:'near_miss',    label:'เกือบเกิดเหตุ (Near Miss)',      icon:'⚠️', color:'#d97706', bg:'#fef3c7' },
  { key:'audit',        label:'การตรวจประเมิน (Audit)',         icon:'🔍', color:'#2563eb', bg:'#dbeafe' },
  { key:'drill',        label:'ซ้อมแผนฉุกเฉิน',               icon:'🚒', color:'#7c3aed', bg:'#f5f3ff' },
  { key:'inspection',   label:'การตรวจความปลอดภัย',            icon:'📋', color:'#0891b2', bg:'#e0f2fe' },
  { key:'capa',         label:'CAPA / ข้อบกพร่อง',            icon:'🔧', color:'#059669', bg:'#ecfdf5' },
  { key:'external',     label:'เหตุการณ์ภายนอก / อุตสาหกรรม', icon:'🌐', color:'#9333ea', bg:'#faf5ff' },
  { key:'regulation',   label:'การเปลี่ยนแปลงกฎหมาย',         icon:'⚖️', color:'#f59e0b', bg:'#fef9c3' },
  { key:'other',        label:'อื่นๆ',                         icon:'📌', color:'#6b7280', bg:'#f3f4f6' },
];

export const LESSON_STATUS = {
  draft:       { label:'ร่าง',               color:'#9ca3af', bg:'#f3f4f6', icon:'✏️' },
  distributed: { label:'แจกจ่ายแล้ว',        color:'#2563eb', bg:'#dbeafe', icon:'📤' },
  implemented: { label:'นำไปปฏิบัติแล้ว',    color:'#16a34a', bg:'#dcfce7', icon:'✅' },
};

export const LESSON_SEVERITY = {
  high:   { label:'สูง',     color:'#dc2626', bg:'#fee2e2' },
  medium: { label:'ปานกลาง', color:'#d97706', bg:'#fef3c7' },
  low:    { label:'ต่ำ',     color:'#16a34a', bg:'#dcfce7' },
};

export async function listLessons() {
  const s = await getDocs(query(collection(db, COL.lessons), orderBy('eventDate','desc'), limit(300)));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function getLesson(id) {
  const d = await getDoc(doc(db, COL.lessons, id));
  return d.exists() ? { id: d.id, ...d.data() } : null;
}
export async function createLesson(data, createdBy) {
  return addDoc(collection(db, COL.lessons), { ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateLesson(id, data) {
  await updateDoc(doc(db, COL.lessons, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deleteLesson(id) {
  await deleteDoc(doc(db, COL.lessons, id));
}

// ────────────────────────────────────────────
// Phase 76 — Context & Issue Register (ทะเบียนบริบทและประเด็น) ISO 45001 §4.1
// ────────────────────────────────────────────
export const CTX_TYPES = {
  internal: { label:'ภายใน (Internal)', color:'#2563eb', bg:'#dbeafe', icon:'🏭' },
  external: { label:'ภายนอก (External)', color:'#7c3aed', bg:'#f5f3ff', icon:'🌐' },
};

export const CTX_CATEGORIES_INTERNAL = [
  { key:'culture',      label:'วัฒนธรรมองค์กร',          icon:'🤝' },
  { key:'structure',    label:'โครงสร้าง/บทบาทหน้าที่',  icon:'🏗️' },
  { key:'resources',    label:'ทรัพยากร/งบประมาณ',       icon:'💰' },
  { key:'process',      label:'กระบวนการผลิต/ปฏิบัติงาน',icon:'⚙️' },
  { key:'technology',   label:'เทคโนโลยี/เครื่องจักร',   icon:'🤖' },
  { key:'competency',   label:'ความสามารถบุคลากร',       icon:'👷' },
  { key:'policy',       label:'นโยบาย/ระเบียบภายใน',     icon:'📋' },
  { key:'other_int',    label:'อื่นๆ (ภายใน)',           icon:'📌' },
];

export const CTX_CATEGORIES_EXTERNAL = [
  { key:'legal',        label:'กฎหมาย/ข้อบังคับ',        icon:'⚖️' },
  { key:'economic',     label:'เศรษฐกิจ/การเงิน',        icon:'📈' },
  { key:'social',       label:'สังคม/ชุมชน',             icon:'🏘️' },
  { key:'technology_ext',label:'เทคโนโลยีภายนอก',       icon:'💡' },
  { key:'environment',  label:'สิ่งแวดล้อม/ภูมิอากาศ',  icon:'🌿' },
  { key:'competitor',   label:'คู่แข่ง/อุตสาหกรรม',     icon:'🏆' },
  { key:'stakeholder',  label:'ผู้มีส่วนได้ส่วนเสีย',    icon:'👥' },
  { key:'supply_chain', label:'ซัพพลายเชน/ผู้รับเหมา',  icon:'🔗' },
  { key:'other_ext',    label:'อื่นๆ (ภายนอก)',          icon:'📌' },
];

export const CTX_CLASSIFICATION = {
  strength:    { label:'จุดแข็ง',  color:'#16a34a', bg:'#dcfce7', icon:'💪' },
  weakness:    { label:'จุดอ่อน',  color:'#dc2626', bg:'#fee2e2', icon:'⚡' },
  opportunity: { label:'โอกาส',    color:'#059669', bg:'#ecfdf5', icon:'🌟' },
  threat:      { label:'ภัยคุกคาม',color:'#d97706', bg:'#fef3c7', icon:'⚠️' },
};

export const CTX_IMPACT = {
  high:   { label:'สูง',     color:'#dc2626', bg:'#fee2e2' },
  medium: { label:'ปานกลาง', color:'#d97706', bg:'#fef3c7' },
  low:    { label:'ต่ำ',     color:'#16a34a', bg:'#dcfce7' },
};

export const CTX_MONITOR_FREQ = [
  { key:'monthly',   label:'ทุกเดือน' },
  { key:'quarterly', label:'ทุกไตรมาส' },
  { key:'biannual',  label:'ทุก 6 เดือน' },
  { key:'annually',  label:'ทุกปี' },
  { key:'as_needed', label:'ตามความจำเป็น' },
];

// ── Phase 77: Safety Objectives & Targets (ISO 45001 §6.2) ──────────────────
export const OBJ_CATEGORIES = [
  { key:'incident_reduction', label:'ลดอุบัติเหตุ / บาดเจ็บ',           icon:'🚨', color:'#dc2626', bg:'#fee2e2' },
  { key:'compliance',         label:'การปฏิบัติตามกฎหมาย',              icon:'⚖️', color:'#7c3aed', bg:'#f5f3ff' },
  { key:'training',           label:'การฝึกอบรม / พัฒนาศักยภาพ',        icon:'🎓', color:'#2563eb', bg:'#dbeafe' },
  { key:'audit',              label:'การตรวจสอบ / ตรวจประเมิน',         icon:'🔍', color:'#0891b2', bg:'#e0f2fe' },
  { key:'culture',            label:'วัฒนธรรมความปลอดภัย',              icon:'🤝', color:'#059669', bg:'#ecfdf5' },
  { key:'risk_control',       label:'การควบคุมความเสี่ยง',               icon:'🛡️', color:'#d97706', bg:'#fef3c7' },
  { key:'emergency',          label:'ความพร้อมรับมือเหตุฉุกเฉิน',        icon:'🚒', color:'#ea580c', bg:'#fff7ed' },
  { key:'environment',        label:'สิ่งแวดล้อม / การจัดการของเสีย',   icon:'🌿', color:'#16a34a', bg:'#dcfce7' },
  { key:'health',             label:'สุขภาพ / อาชีวอนามัย',             icon:'❤️', color:'#e11d48', bg:'#fff1f2' },
  { key:'equipment',          label:'อุปกรณ์ / เครื่องมือ / PPE',       icon:'🔧', color:'#9333ea', bg:'#faf5ff' },
  { key:'documentation',      label:'เอกสาร / ระเบียบปฏิบัติ',          icon:'📋', color:'#64748b', bg:'#f1f5f9' },
  { key:'other',              label:'อื่นๆ',                              icon:'📌', color:'#6b7280', bg:'#f3f4f6' },
];

export const OBJ_STATUS = {
  planning:    { label:'วางแผน',           color:'#64748b', bg:'#f1f5f9', icon:'📋' },
  in_progress: { label:'กำลังดำเนินการ',  color:'#d97706', bg:'#fef3c7', icon:'🔄' },
  on_track:    { label:'เป็นไปตามแผน',    color:'#2563eb', bg:'#dbeafe', icon:'✅' },
  at_risk:     { label:'มีความเสี่ยง',    color:'#ea580c', bg:'#fff7ed', icon:'⚠️' },
  behind:      { label:'ล่าช้า',          color:'#dc2626', bg:'#fee2e2', icon:'🔴' },
  completed:   { label:'บรรลุเป้าหมาย',  color:'#16a34a', bg:'#dcfce7', icon:'🏆' },
  cancelled:   { label:'ยกเลิก',          color:'#9ca3af', bg:'#f3f4f6', icon:'🚫' },
};

export const OBJ_PRIORITY = {
  critical: { label:'วิกฤต',    color:'#7f1d1d', bg:'#fee2e2' },
  high:     { label:'สูง',      color:'#dc2626', bg:'#fecaca' },
  medium:   { label:'ปานกลาง', color:'#d97706', bg:'#fef3c7' },
  low:      { label:'ต่ำ',      color:'#16a34a', bg:'#dcfce7' },
};

export const OBJ_MEASURE_UNITS = [
  { key:'percent',  label:'% (เปอร์เซ็นต์)' },
  { key:'number',   label:'จำนวน (ครั้ง/ราย)' },
  { key:'hour',     label:'ชั่วโมง' },
  { key:'day',      label:'วัน' },
  { key:'score',    label:'คะแนน' },
  { key:'ratio',    label:'อัตรา (rate)' },
  { key:'baht',     label:'บาท' },
  { key:'other',    label:'อื่นๆ' },
];

export async function listObjectives() {
  const s = await getDocs(query(collection(db, COL.objective), orderBy('createdAt','desc'), limit(300)));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function getObjective(id) {
  const d = await getDoc(doc(db, COL.objective, id));
  return d.exists() ? { id: d.id, ...d.data() } : null;
}
export async function createObjective(data, createdBy) {
  return addDoc(collection(db, COL.objective), { ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateObjective(id, data) {
  await updateDoc(doc(db, COL.objective, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deleteObjective(id) {
  await deleteDoc(doc(db, COL.objective, id));
}

// ── Phase 78: Hazard Register (ISO 45001 §6.1.2) ────────────────────────────
export const HAZARD_TYPES = [
  { key:'physical',      label:'กายภาพ (Physical)',          icon:'⚡', color:'#d97706', bg:'#fef3c7' },
  { key:'chemical',      label:'เคมี (Chemical)',             icon:'⚗️', color:'#7c3aed', bg:'#f5f3ff' },
  { key:'biological',    label:'ชีวภาพ (Biological)',         icon:'🦠', color:'#16a34a', bg:'#dcfce7' },
  { key:'ergonomic',     label:'การยศาสตร์ (Ergonomic)',      icon:'🪑', color:'#2563eb', bg:'#dbeafe' },
  { key:'psychological', label:'จิตวิทยา (Psychological)',    icon:'🧠', color:'#ec4899', bg:'#fdf2f8' },
  { key:'electrical',    label:'ไฟฟ้า (Electrical)',          icon:'🔌', color:'#f59e0b', bg:'#fef9c3' },
  { key:'fire',          label:'อัคคีภัย (Fire)',             icon:'🔥', color:'#ea580c', bg:'#fff7ed' },
  { key:'mechanical',    label:'เครื่องกล (Mechanical)',      icon:'⚙️', color:'#64748b', bg:'#f1f5f9' },
  { key:'radiation',     label:'รังสี (Radiation)',           icon:'☢️', color:'#dc2626', bg:'#fee2e2' },
  { key:'fall',          label:'ตกจากที่สูง (Fall)',          icon:'📉', color:'#0891b2', bg:'#e0f2fe' },
  { key:'confined',      label:'พื้นที่อับอากาศ (Confined)',  icon:'🕳️', color:'#9333ea', bg:'#faf5ff' },
  { key:'other',         label:'อื่นๆ',                       icon:'📌', color:'#6b7280', bg:'#f3f4f6' },
];

export const HAZARD_AREAS = [
  { key:'production',   label:'พื้นที่ผลิต' },
  { key:'warehouse',    label:'คลังสินค้า' },
  { key:'maintenance',  label:'ซ่อมบำรุง' },
  { key:'office',       label:'สำนักงาน' },
  { key:'loading',      label:'จุดรับ-ส่งสินค้า' },
  { key:'outdoor',      label:'พื้นที่ภายนอกอาคาร' },
  { key:'lab',          label:'ห้องปฏิบัติการ' },
  { key:'canteen',      label:'โรงอาหาร' },
  { key:'utility',      label:'ห้องสาธารณูปโภค' },
  { key:'all',          label:'ทั้งโรงงาน' },
  { key:'other',        label:'อื่นๆ' },
];

export const HAZARD_CONTROL_HIERARCHY = [
  { key:'elimination',   label:'การขจัด (Elimination)',           icon:'🚫', color:'#16a34a', bg:'#dcfce7', level:1 },
  { key:'substitution',  label:'การทดแทน (Substitution)',         icon:'🔄', color:'#059669', bg:'#ecfdf5', level:2 },
  { key:'engineering',   label:'มาตรการทางวิศวกรรม (Engineering)',icon:'🛠️', color:'#2563eb', bg:'#dbeafe', level:3 },
  { key:'admin',         label:'มาตรการบริหาร (Administrative)',  icon:'📋', color:'#d97706', bg:'#fef3c7', level:4 },
  { key:'ppe',           label:'อุปกรณ์คุ้มครองส่วนบุคคล (PPE)', icon:'🦺', color:'#dc2626', bg:'#fee2e2', level:5 },
];

export const HAZARD_STATUS = {
  identified:  { label:'บ่งชี้แล้ว',         color:'#9ca3af', bg:'#f3f4f6', icon:'🔍' },
  assessed:    { label:'ประเมินแล้ว',         color:'#2563eb', bg:'#dbeafe', icon:'📊' },
  controlled:  { label:'มีมาตรการควบคุม',    color:'#d97706', bg:'#fef3c7', icon:'🛡️' },
  monitored:   { label:'กำลังติดตาม',        color:'#059669', bg:'#ecfdf5', icon:'👁️' },
  closed:      { label:'ปิด/ไม่มีความเสี่ยง', color:'#16a34a', bg:'#dcfce7', icon:'✅' },
};

// Risk = Severity × Likelihood (1-5 scale)
export const HAZARD_SEVERITY = [
  { val:1, label:'1 - เล็กน้อย (Negligible)' },
  { val:2, label:'2 - น้อย (Minor)' },
  { val:3, label:'3 - ปานกลาง (Moderate)' },
  { val:4, label:'4 - สูง (Major)' },
  { val:5, label:'5 - วิกฤต (Catastrophic)' },
];
export const HAZARD_LIKELIHOOD = [
  { val:1, label:'1 - ไม่น่าจะเกิด (Rare)' },
  { val:2, label:'2 - โอกาสน้อย (Unlikely)' },
  { val:3, label:'3 - อาจเกิด (Possible)' },
  { val:4, label:'4 - น่าจะเกิด (Likely)' },
  { val:5, label:'5 - แน่นอน (Almost certain)' },
];

// ── Phase 79: Operational Controls Register (ISO 45001 §8.1) ────────────────
export const OPC_PROCESS_TYPES = [
  { key:'production',      label:'กระบวนการผลิต',           icon:'🏭', color:'#2563eb', bg:'#dbeafe' },
  { key:'maintenance',     label:'ซ่อมบำรุง',               icon:'🔧', color:'#7c3aed', bg:'#f5f3ff' },
  { key:'warehouse',       label:'คลังสินค้า / โลจิสติกส์', icon:'📦', color:'#059669', bg:'#ecfdf5' },
  { key:'contractor',      label:'การจัดการผู้รับเหมา',     icon:'👷', color:'#d97706', bg:'#fef3c7' },
  { key:'emergency',       label:'การตอบสนองเหตุฉุกเฉิน',  icon:'🚒', color:'#dc2626', bg:'#fee2e2' },
  { key:'change_mgmt',     label:'การจัดการการเปลี่ยนแปลง',icon:'🔄', color:'#ea580c', bg:'#fff7ed' },
  { key:'procurement',     label:'การจัดซื้อ',              icon:'🛒', color:'#0891b2', bg:'#e0f2fe' },
  { key:'office',          label:'งานสำนักงาน',             icon:'💼', color:'#64748b', bg:'#f1f5f9' },
  { key:'loading',         label:'รับ-ส่งสินค้า',           icon:'🚛', color:'#9333ea', bg:'#faf5ff' },
  { key:'chemical',        label:'การจัดการสารเคมี',        icon:'⚗️', color:'#c026d3', bg:'#fdf4ff' },
  { key:'other',           label:'อื่นๆ',                   icon:'📌', color:'#6b7280', bg:'#f3f4f6' },
];

export const OPC_CONTROL_TYPES = [
  { key:'procedure',       label:'ขั้นตอนปฏิบัติ (Procedure)', icon:'📋' },
  { key:'work_instruction',label:'วิธีปฏิบัติงาน (WI)',       icon:'📝' },
  { key:'permit',          label:'ใบอนุญาตทำงาน (PTW)',       icon:'🔑' },
  { key:'checklist',       label:'แบบตรวจสอบ (Checklist)',     icon:'☑️' },
  { key:'training',        label:'การฝึกอบรม (Training)',      icon:'🎓' },
  { key:'engineering',     label:'มาตรการทางวิศวกรรม',         icon:'🛠️' },
  { key:'ppe',             label:'PPE / อุปกรณ์ป้องกัน',      icon:'🦺' },
  { key:'monitoring',      label:'การเฝ้าระวัง / ตรวจวัด',   icon:'👁️' },
  { key:'signage',         label:'ป้ายเตือน / สัญลักษณ์',    icon:'⚠️' },
  { key:'other',           label:'อื่นๆ',                     icon:'📌' },
];

export const OPC_VERIFY_FREQ = [
  { key:'daily',     label:'ทุกวัน' },
  { key:'weekly',    label:'ทุกสัปดาห์' },
  { key:'monthly',   label:'ทุกเดือน' },
  { key:'quarterly', label:'ทุกไตรมาส' },
  { key:'biannual',  label:'ทุก 6 เดือน' },
  { key:'annually',  label:'ทุกปี' },
  { key:'per_task',  label:'ทุกครั้งที่ทำงาน' },
];

export const OPC_STATUS = {
  active:        { label:'ใช้งาน',          color:'#16a34a', bg:'#dcfce7', icon:'✅' },
  review:        { label:'อยู่ระหว่างทบทวน', color:'#2563eb', bg:'#dbeafe', icon:'🔄' },
  update_needed: { label:'ต้องปรับปรุง',    color:'#d97706', bg:'#fef3c7', icon:'⚠️' },
  suspended:     { label:'ระงับชั่วคราว',   color:'#dc2626', bg:'#fee2e2', icon:'🚫' },
};

// ── Phase 80: Safety Performance Monitoring Program (ISO 45001 §9.1.1) ──────
export const MON_INDICATOR_TYPES = {
  lagging:  { label:'Lagging (ตัวชี้วัดผลลัพธ์)',  color:'#dc2626', bg:'#fee2e2', icon:'📉', desc:'วัดผลที่เกิดขึ้นแล้ว เช่น อุบัติเหตุ, บาดเจ็บ' },
  leading:  { label:'Leading (ตัวชี้วัดเชิงรุก)',   color:'#16a34a', bg:'#dcfce7', icon:'📈', desc:'วัดกิจกรรมที่ป้องกันอุบัติเหตุ เช่น ตรวจสอบ, ฝึกอบรม' },
};

export const MON_CATEGORIES = [
  { key:'incident',     label:'อุบัติเหตุ / บาดเจ็บ',     icon:'🚨', color:'#dc2626', bg:'#fee2e2' },
  { key:'near_miss',    label:'เฉียดอุบัติเหตุ',           icon:'⚡', color:'#d97706', bg:'#fef3c7' },
  { key:'inspection',   label:'การตรวจสอบ / ตรวจประเมิน', icon:'🔍', color:'#2563eb', bg:'#dbeafe' },
  { key:'training',     label:'การฝึกอบรม / ความสามารถ',  icon:'🎓', color:'#7c3aed', bg:'#f5f3ff' },
  { key:'compliance',   label:'การปฏิบัติตามกฎหมาย',      icon:'⚖️', color:'#0891b2', bg:'#e0f2fe' },
  { key:'behavior',     label:'พฤติกรรมความปลอดภัย',      icon:'🤝', color:'#059669', bg:'#ecfdf5' },
  { key:'equipment',    label:'อุปกรณ์ / เครื่องจักร',    icon:'🔧', color:'#64748b', bg:'#f1f5f9' },
  { key:'environment',  label:'สิ่งแวดล้อม / สุขอนามัย',  icon:'🌿', color:'#16a34a', bg:'#dcfce7' },
  { key:'emergency',    label:'ความพร้อมเหตุฉุกเฉิน',     icon:'🚒', color:'#ea580c', bg:'#fff7ed' },
  { key:'culture',      label:'วัฒนธรรมความปลอดภัย',      icon:'🌟', color:'#f59e0b', bg:'#fef9c3' },
  { key:'audit',        label:'การตรวจสอบภายใน',          icon:'📋', color:'#9333ea', bg:'#faf5ff' },
  { key:'other',        label:'อื่นๆ',                     icon:'📌', color:'#6b7280', bg:'#f3f4f6' },
];

export const MON_FREQ = [
  { key:'daily',       label:'ทุกวัน' },
  { key:'weekly',      label:'ทุกสัปดาห์' },
  { key:'monthly',     label:'ทุกเดือน' },
  { key:'quarterly',   label:'ทุกไตรมาส' },
  { key:'biannual',    label:'ทุก 6 เดือน' },
  { key:'annually',    label:'ทุกปี' },
  { key:'per_event',   label:'ทุกครั้งที่เกิดเหตุ' },
];

export const MON_STATUS = {
  active:   { label:'ใช้งาน',          color:'#16a34a', bg:'#dcfce7', icon:'✅' },
  paused:   { label:'หยุดพักชั่วคราว', color:'#d97706', bg:'#fef3c7', icon:'⏸️' },
  review:   { label:'กำลังทบทวน',      color:'#2563eb', bg:'#dbeafe', icon:'🔄' },
  inactive: { label:'ไม่ใช้งาน',       color:'#9ca3af', bg:'#f3f4f6', icon:'🚫' },
};

// ── Phase 81: Safety Campaign & Awareness Tracker (ISO 45001 §7.3) ──────────
export const CAMPAIGN_TOPICS = [
  { key:'general',       label:'ความปลอดภัยทั่วไป',           icon:'🦺', color:'#2563eb', bg:'#dbeafe' },
  { key:'ppe',           label:'การใช้ PPE',                   icon:'⛑️', color:'#7c3aed', bg:'#f5f3ff' },
  { key:'fire',          label:'ความปลอดภัยจากอัคคีภัย',      icon:'🔥', color:'#ea580c', bg:'#fff7ed' },
  { key:'chemical',      label:'ความปลอดภัยสารเคมี',          icon:'⚗️', color:'#c026d3', bg:'#fdf4ff' },
  { key:'ergonomic',     label:'การยศาสตร์ / ท่าทางทำงาน',   icon:'🪑', color:'#0891b2', bg:'#e0f2fe' },
  { key:'housekeeping',  label:'5ส / ความเป็นระเบียบ',         icon:'🧹', color:'#059669', bg:'#ecfdf5' },
  { key:'traffic',       label:'ความปลอดภัยการจราจร',         icon:'🚦', color:'#d97706', bg:'#fef3c7' },
  { key:'mental',        label:'สุขภาพจิต / ความเครียด',      icon:'🧠', color:'#ec4899', bg:'#fdf2f8' },
  { key:'emergency',     label:'การตอบสนองเหตุฉุกเฉิน',       icon:'🚒', color:'#dc2626', bg:'#fee2e2' },
  { key:'zero_accident', label:'Zero Accident Campaign',       icon:'🏆', color:'#16a34a', bg:'#dcfce7' },
  { key:'covid',         label:'อาชีวอนามัย / โรคระบาด',     icon:'🩺', color:'#64748b', bg:'#f1f5f9' },
  { key:'environment',   label:'สิ่งแวดล้อม',                 icon:'🌿', color:'#15803d', bg:'#f0fdf4' },
  { key:'other',         label:'อื่นๆ',                       icon:'📌', color:'#6b7280', bg:'#f3f4f6' },
];

export const CAMPAIGN_ACTIVITIES = [
  { key:'poster',       label:'โปสเตอร์ / ป้าย',           icon:'🖼️' },
  { key:'meeting',      label:'การประชุม / บรรยาย',         icon:'🗣️' },
  { key:'toolbox',      label:'Toolbox Talk',               icon:'🧰' },
  { key:'competition',  label:'การแข่งขัน / ประกวด',       icon:'🏅' },
  { key:'drill',        label:'การซ้อมแผนฉุกเฉิน',         icon:'🚨' },
  { key:'walk',         label:'Safety Walk / ตรวจเยี่ยม',  icon:'🚶' },
  { key:'video',        label:'วิดีโอ / สื่อดิจิทัล',     icon:'📹' },
  { key:'newsletter',   label:'จดหมายข่าว / เอกสาร',       icon:'📰' },
  { key:'recognition',  label:'ยกย่องผู้ปฏิบัติดี',        icon:'🌟' },
  { key:'survey',       label:'แบบสำรวจ / ประเมินผล',      icon:'📊' },
  { key:'other',        label:'อื่นๆ',                     icon:'📌' },
];

export const CAMPAIGN_STATUS = {
  planned:   { label:'วางแผนแล้ว',      color:'#2563eb', bg:'#dbeafe', icon:'📋' },
  active:    { label:'กำลังดำเนินการ', color:'#d97706', bg:'#fef3c7', icon:'🔄' },
  completed: { label:'เสร็จสิ้น',       color:'#16a34a', bg:'#dcfce7', icon:'✅' },
  cancelled: { label:'ยกเลิก',          color:'#9ca3af', bg:'#f3f4f6', icon:'🚫' },
};

export const CAMPAIGN_TARGET = [
  { key:'all',         label:'พนักงานทุกคน' },
  { key:'production',  label:'ฝ่ายผลิต' },
  { key:'maintenance', label:'ฝ่ายซ่อมบำรุง' },
  { key:'office',      label:'ฝ่ายสำนักงาน' },
  { key:'warehouse',   label:'ฝ่ายคลังสินค้า' },
  { key:'contractor',  label:'ผู้รับเหมา' },
  { key:'management',  label:'ผู้บริหาร' },
  { key:'new_emp',     label:'พนักงานใหม่' },
  { key:'other',       label:'อื่นๆ' },
];

// ── Phase 82: Safety Rules Register (กฎความปลอดภัย / Golden Rules) ──────────
export const RULE_LEVELS = {
  golden:      { label:'Golden Rule (กฎเหล็ก)',    color:'#b45309', bg:'#fef3c7', icon:'🏆', desc:'ฝ่าฝืนแล้วอาจถึงแก่ชีวิตหรือบาดเจ็บสาหัส — ห้ามทำโดยเด็ดขาด' },
  mandatory:   { label:'กฎบังคับ (Mandatory)',     color:'#dc2626', bg:'#fee2e2', icon:'🚫', desc:'ข้อปฏิบัติที่บังคับ — ฝ่าฝืนมีผลทางวินัยทันที' },
  standard:    { label:'มาตรฐาน (Standard)',        color:'#2563eb', bg:'#dbeafe', icon:'📋', desc:'ข้อปฏิบัติมาตรฐาน — ต้องปฏิบัติตามในสถานการณ์ที่เกี่ยวข้อง' },
  recommended: { label:'แนะนำ (Recommended)',      color:'#16a34a', bg:'#dcfce7', icon:'💡', desc:'แนวปฏิบัติที่ดี — ควรปฏิบัติตามเพื่อความปลอดภัยที่ดีกว่า' },
};

export const RULE_CATEGORIES = [
  { key:'general',     label:'ทั่วไป',                     icon:'🦺', color:'#2563eb', bg:'#dbeafe' },
  { key:'ppe',         label:'การใช้ PPE',                 icon:'⛑️', color:'#7c3aed', bg:'#f5f3ff' },
  { key:'electrical',  label:'ไฟฟ้า / LOTO',              icon:'⚡', color:'#d97706', bg:'#fef3c7' },
  { key:'fire',        label:'อัคคีภัย',                   icon:'🔥', color:'#ea580c', bg:'#fff7ed' },
  { key:'chemical',    label:'สารเคมี',                    icon:'⚗️', color:'#c026d3', bg:'#fdf4ff' },
  { key:'height',      label:'งานบนที่สูง',                icon:'🪜', color:'#0891b2', bg:'#e0f2fe' },
  { key:'mechanical',  label:'เครื่องจักร / อุปกรณ์',    icon:'⚙️', color:'#64748b', bg:'#f1f5f9' },
  { key:'confined',    label:'พื้นที่อับอากาศ',           icon:'🕳️', color:'#9333ea', bg:'#faf5ff' },
  { key:'traffic',     label:'การจราจร / ยานพาหนะ',      icon:'🚗', color:'#059669', bg:'#ecfdf5' },
  { key:'emergency',   label:'เหตุฉุกเฉิน',               icon:'🚒', color:'#dc2626', bg:'#fee2e2' },
  { key:'housekeeping',label:'5ส / สภาพแวดล้อม',          icon:'🧹', color:'#16a34a', bg:'#dcfce7' },
  { key:'other',       label:'อื่นๆ',                     icon:'📌', color:'#6b7280', bg:'#f3f4f6' },
];

export const RULE_STATUS = {
  active:  { label:'ใช้งาน',          color:'#16a34a', bg:'#dcfce7', icon:'✅' },
  review:  { label:'อยู่ระหว่างทบทวน', color:'#d97706', bg:'#fef3c7', icon:'🔄' },
  obsolete:{ label:'ยกเลิกแล้ว',      color:'#9ca3af', bg:'#f3f4f6', icon:'🚫' },
};

export const RULE_CONSEQUENCE = [
  { key:'verbal',      label:'ตักเตือนด้วยวาจา' },
  { key:'written',     label:'ตักเตือนเป็นลายลักษณ์อักษร' },
  { key:'suspend',     label:'พักงานชั่วคราว' },
  { key:'terminate',   label:'เลิกจ้างทันที' },
  { key:'stop_work',   label:'หยุดงานทันที (Stop Work)' },
  { key:'retrain',     label:'ฝึกอบรมซ้ำก่อนกลับทำงาน' },
];

export async function listSafetyRules() {
  const s = await getDocs(query(collection(db, COL.safetyRule), orderBy('createdAt','desc'), limit(500)));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function getSafetyRule(id) {
  const d = await getDoc(doc(db, COL.safetyRule, id));
  return d.exists() ? { id: d.id, ...d.data() } : null;
}
export async function createSafetyRule(data, createdBy) {
  return addDoc(collection(db, COL.safetyRule), { ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateSafetyRule(id, data) {
  await updateDoc(doc(db, COL.safetyRule, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deleteSafetyRule(id) {
  await deleteDoc(doc(db, COL.safetyRule, id));
}

// ── Phase 83: Safety Talk / Tool Box Talk ───────────────────────────────────
export const TALK_TYPES = {
  toolbox:   { label:'Tool Box Talk',          icon:'🧰', color:'#2563eb', bg:'#dbeafe', desc:'การประชุมสั้นหน้างานก่อนเริ่มงาน' },
  pre_shift: { label:'Pre-Shift Safety Briefing', icon:'🌅', color:'#d97706', bg:'#fef3c7', desc:'บรีฟิ่งความปลอดภัยก่อนกะงาน' },
  topic:     { label:'Safety Topic Talk',      icon:'📢', color:'#7c3aed', bg:'#f5f3ff', desc:'Safety Talk ในหัวข้อเฉพาะเรื่อง' },
  emergency: { label:'Emergency Drill Brief',  icon:'🚨', color:'#dc2626', bg:'#fee2e2', desc:'บรีฟิ่งก่อนซ้อมแผนฉุกเฉิน' },
  incident:  { label:'Incident Lessons Shared',icon:'🔍', color:'#ea580c', bg:'#fff7ed', desc:'แบ่งปันบทเรียนจากอุบัติเหตุ/เหตุการณ์' },
  awareness: { label:'Safety Awareness Session',icon:'💡', color:'#0891b2', bg:'#e0f2fe', desc:'การสร้างความตระหนักด้านความปลอดภัย' },
  special:   { label:'Special Safety Session', icon:'⭐', color:'#16a34a', bg:'#dcfce7', desc:'กิจกรรมความปลอดภัยพิเศษ' },
};
export const TALK_TOPICS = [
  { key:'ppe',          label:'การใช้ PPE อย่างถูกต้อง',          icon:'⛑️' },
  { key:'housekeeping', label:'5ส / ความสะอาดเรียบร้อย',           icon:'🧹' },
  { key:'fire',         label:'ป้องกันและระงับอัคคีภัย',           icon:'🔥' },
  { key:'chemical',     label:'การจัดการสารเคมีอย่างปลอดภัย',      icon:'⚗️' },
  { key:'ergonomic',    label:'การยศาสตร์ / ท่าทางการทำงาน',       icon:'🧍' },
  { key:'electrical',   label:'ความปลอดภัยทางไฟฟ้า',              icon:'⚡' },
  { key:'machine',      label:'ความปลอดภัยเครื่องจักร',           icon:'⚙️' },
  { key:'height',       label:'งานบนที่สูง',                       icon:'🪜' },
  { key:'confined',     label:'พื้นที่อับอากาศ',                   icon:'🕳️' },
  { key:'traffic',      label:'การจราจรและยานพาหนะ',               icon:'🚗' },
  { key:'emergency',    label:'แผนฉุกเฉินและการอพยพ',              icon:'🚒' },
  { key:'incident',     label:'บทเรียนจากอุบัติเหตุ',              icon:'🔍' },
  { key:'loto',         label:'LOTO / การควบคุมพลังงาน',           icon:'🔒' },
  { key:'near_miss',    label:'Near Miss และการรายงาน',            icon:'⚠️' },
  { key:'mental',       label:'สุขภาพจิตและความเครียด',            icon:'🧠' },
  { key:'heat',         label:'การทำงานในสภาพอากาศร้อน',           icon:'🌡️' },
  { key:'other',        label:'อื่นๆ',                              icon:'📌' },
];
export const TALK_STATUS = {
  planned:   { label:'วางแผนแล้ว',   color:'#2563eb', bg:'#dbeafe', icon:'📅' },
  completed: { label:'ดำเนินการแล้ว', color:'#16a34a', bg:'#dcfce7', icon:'✅' },
  cancelled: { label:'ยกเลิก',        color:'#9ca3af', bg:'#f3f4f6', icon:'🚫' },
  postponed: { label:'เลื่อนออกไป',  color:'#d97706', bg:'#fef3c7', icon:'⏳' },
};
export const TALK_DEPARTMENTS = [
  'ฝ่ายผลิต','ฝ่ายคลังสินค้า','ฝ่ายวิศวกรรม','ฝ่ายบำรุงรักษา',
  'ฝ่ายคุณภาพ','ฝ่ายจัดซื้อ','ฝ่ายบัญชี/การเงิน','ฝ่าย HR',
  'ฝ่ายความปลอดภัย','ทุกฝ่าย',
];

export async function listSafetyTalks() {
  const s = await getDocs(query(collection(db, COL.safetyTalk), orderBy('talkDate','desc'), limit(500)));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function getSafetyTalk(id) {
  const d = await getDoc(doc(db, COL.safetyTalk, id));
  return d.exists() ? { id: d.id, ...d.data() } : null;
}
export async function createSafetyTalk(data, createdBy) {
  return addDoc(collection(db, COL.safetyTalk), { ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateSafetyTalk(id, data) {
  await updateDoc(doc(db, COL.safetyTalk, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deleteSafetyTalk(id) {
  await deleteDoc(doc(db, COL.safetyTalk, id));
}

// ── Phase 84: Machinery & Equipment Pre-Start Inspection ────────────────────
export const MACHINE_TYPES = [
  { key:'forklift',    label:'รถโฟล์คลิฟท์',         icon:'🏗️', color:'#d97706', bg:'#fef3c7' },
  { key:'crane',       label:'เครนและอุปกรณ์ยก',      icon:'🏭', color:'#7c3aed', bg:'#f5f3ff' },
  { key:'press',       label:'เครื่องปั๊ม / เพรส',    icon:'⚙️', color:'#64748b', bg:'#f1f5f9' },
  { key:'conveyor',    label:'สายพาน / คอนเวเยอร์',  icon:'📦', color:'#0891b2', bg:'#e0f2fe' },
  { key:'compressor',  label:'เครื่องอัดอากาศ',        icon:'💨', color:'#2563eb', bg:'#dbeafe' },
  { key:'generator',   label:'เครื่องกำเนิดไฟฟ้า',    icon:'⚡', color:'#ca8a04', bg:'#fef9c3' },
  { key:'pump',        label:'เครื่องสูบน้ำ / ปั๊ม',  icon:'🔧', color:'#059669', bg:'#ecfdf5' },
  { key:'vehicle',     label:'ยานพาหนะ / รถ',         icon:'🚗', color:'#16a34a', bg:'#dcfce7' },
  { key:'robot',       label:'หุ่นยนต์ / Automation',  icon:'🤖', color:'#9333ea', bg:'#faf5ff' },
  { key:'cutting',     label:'เครื่องตัด / เจียร',    icon:'🔩', color:'#dc2626', bg:'#fee2e2' },
  { key:'welding',     label:'เครื่องเชื่อม',          icon:'🔥', color:'#ea580c', bg:'#fff7ed' },
  { key:'other',       label:'เครื่องจักร / อุปกรณ์อื่น', icon:'🏷️', color:'#6b7280', bg:'#f3f4f6' },
];
export const MACHINE_CHECK_RESULT = {
  pass:        { label:'ผ่าน (Pass)',           color:'#16a34a', bg:'#dcfce7', icon:'✅' },
  conditional: { label:'ผ่านมีเงื่อนไข',         color:'#d97706', bg:'#fef3c7', icon:'⚠️' },
  fail:        { label:'ไม่ผ่าน (Fail)',          color:'#dc2626', bg:'#fee2e2', icon:'❌' },
};
export const MACHINE_STATUS = {
  in_service:    { label:'ใช้งานได้ปกติ',    color:'#16a34a', bg:'#dcfce7', icon:'🟢' },
  minor_defect:  { label:'บกพร่องเล็กน้อย',  color:'#d97706', bg:'#fef3c7', icon:'🟡' },
  major_defect:  { label:'บกพร่องร้ายแรง',   color:'#ea580c', bg:'#fff7ed', icon:'🟠' },
  out_of_service:{ label:'หยุดใช้งาน',       color:'#dc2626', bg:'#fee2e2', icon:'🔴' },
  maintenance:   { label:'อยู่ระหว่างซ่อมบำรุง', color:'#9333ea', bg:'#faf5ff', icon:'🔧' },
};
export const MACHINE_CHECK_ITEMS_DEFAULT = [
  'ตรวจสอบสภาพภายนอก (ไม่มีรอยแตก/ชำรุด)',
  'ตรวจสอบระบบนิรภัย (Safety Guard)',
  'ตรวจสอบระบบหยุดฉุกเฉิน (Emergency Stop)',
  'ตรวจสอบระดับน้ำมันหล่อลื่น',
  'ตรวจสอบสายไฟ / การต่อสายดิน',
  'ตรวจสอบสัญญาณเตือน / ไฟแสดงสถานะ',
  'ตรวจสอบความสะอาดและสภาพพื้นที่โดยรอบ',
  'ตรวจสอบเอกสาร / ป้ายแสดงข้อมูล',
];

export async function listMachineChecks() {
  const s = await getDocs(query(collection(db, COL.machineCheck), orderBy('checkDate','desc'), limit(500)));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function getMachineCheck(id) {
  const d = await getDoc(doc(db, COL.machineCheck, id));
  return d.exists() ? { id: d.id, ...d.data() } : null;
}
export async function createMachineCheck(data, createdBy) {
  return addDoc(collection(db, COL.machineCheck), { ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateMachineCheck(id, data) {
  await updateDoc(doc(db, COL.machineCheck, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deleteMachineCheck(id) {
  await deleteDoc(doc(db, COL.machineCheck, id));
}

// ── Phase 85: Behavior-Based Safety (BBS) Observation ───────────────────────
export const BBS_CATEGORIES = [
  { key:'ppe',         label:'การใช้ PPE',                    icon:'⛑️', color:'#7c3aed', bg:'#f5f3ff' },
  { key:'posture',     label:'ท่าทางและการเคลื่อนไหว',        icon:'🧍', color:'#0891b2', bg:'#e0f2fe' },
  { key:'tools',       label:'การใช้เครื่องมือ / อุปกรณ์',   icon:'🔧', color:'#d97706', bg:'#fef3c7' },
  { key:'procedure',   label:'การปฏิบัติตามขั้นตอน (SOP)',   icon:'📋', color:'#2563eb', bg:'#dbeafe' },
  { key:'housekeeping',label:'ความสะอาด / 5ส',               icon:'🧹', color:'#16a34a', bg:'#dcfce7' },
  { key:'communication',label:'การสื่อสาร / ทีมเวิร์ค',      icon:'💬', color:'#059669', bg:'#ecfdf5' },
  { key:'environment', label:'สภาพแวดล้อมพื้นที่ทำงาน',      icon:'🏭', color:'#64748b', bg:'#f1f5f9' },
  { key:'energy',      label:'การจัดการพลังงาน / สารเคมี',   icon:'⚡', color:'#ca8a04', bg:'#fef9c3' },
];
export const BBS_ZONES = [
  'สายการผลิต','คลังสินค้า','พื้นที่โหลด/ขนถ่าย','ลานจอดรถ',
  'พื้นที่ก่อสร้าง','ห้องแล็บ','ห้องเครื่องจักร','สำนักงาน','ทั่วทั้งโรงงาน',
];
export const BBS_STATUS = {
  draft:     { label:'ร่าง',           color:'#64748b', bg:'#f1f5f9', icon:'📝' },
  submitted: { label:'ส่งแล้ว',        color:'#2563eb', bg:'#dbeafe', icon:'📤' },
  reviewed:  { label:'ผ่านการทบทวน',   color:'#16a34a', bg:'#dcfce7', icon:'✅' },
};

export async function listBBSObs() {
  const s = await getDocs(query(collection(db, COL.bbsObs), orderBy('obsDate','desc'), limit(500)));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function getBBSObs(id) {
  const d = await getDoc(doc(db, COL.bbsObs, id));
  return d.exists() ? { id: d.id, ...d.data() } : null;
}
export async function createBBSObs(data, createdBy) {
  return addDoc(collection(db, COL.bbsObs), { ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateBBSObs(id, data) {
  await updateDoc(doc(db, COL.bbsObs, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deleteBBSObs(id) {
  await deleteDoc(doc(db, COL.bbsObs, id));
}

// ── Phase 86: Safety Event & Activities Register ─────────────────────────────
export const EVENT_TYPES = {
  competition: { label:'การแข่งขัน / Contest',          icon:'🏆', color:'#d97706', bg:'#fef3c7' },
  training:    { label:'อบรม / Training',                icon:'📚', color:'#2563eb', bg:'#dbeafe' },
  seminar:     { label:'สัมมนา / Seminar',               icon:'🎤', color:'#7c3aed', bg:'#f5f3ff' },
  pledge:      { label:'พิธีปฏิญาณตน',                  icon:'🤝', color:'#0891b2', bg:'#e0f2fe' },
  inspection:  { label:'ตรวจเยี่ยม / Inspection Tour',  icon:'🔍', color:'#64748b', bg:'#f1f5f9' },
  exhibition:  { label:'นิทรรศการ / Exhibition',         icon:'🖼️', color:'#c026d3', bg:'#fdf4ff' },
  drill:       { label:'ซ้อมแผนฉุกเฉิน / Drill',        icon:'🚨', color:'#dc2626', bg:'#fee2e2' },
  recognition: { label:'มอบรางวัล / Recognition',        icon:'🎖️', color:'#16a34a', bg:'#dcfce7' },
  rally:       { label:'กิจกรรมรณรงค์ / Rally',          icon:'📢', color:'#ea580c', bg:'#fff7ed' },
  other:       { label:'อื่นๆ',                          icon:'📌', color:'#6b7280', bg:'#f3f4f6' },
};
export const EVENT_OCCASION = {
  national_week: { label:'สัปดาห์ความปลอดภัยแห่งชาติ', icon:'🇹🇭', color:'#dc2626', bg:'#fee2e2' },
  monthly:       { label:'กิจกรรมประจำเดือน',           icon:'📅', color:'#2563eb', bg:'#dbeafe' },
  quarterly:     { label:'กิจกรรมประจำไตรมาส',           icon:'📊', color:'#7c3aed', bg:'#f5f3ff' },
  annual:        { label:'กิจกรรมประจำปี',               icon:'🗓️', color:'#0891b2', bg:'#e0f2fe' },
  special:       { label:'กิจกรรมพิเศษ',                 icon:'⭐', color:'#d97706', bg:'#fef3c7' },
};
export const EVENT_STATUS = {
  planned:     { label:'วางแผนแล้ว',      color:'#2563eb', bg:'#dbeafe', icon:'📋' },
  in_progress: { label:'กำลังดำเนินการ',  color:'#d97706', bg:'#fef3c7', icon:'🔄' },
  completed:   { label:'เสร็จสิ้น',       color:'#16a34a', bg:'#dcfce7', icon:'✅' },
  cancelled:   { label:'ยกเลิก',          color:'#9ca3af', bg:'#f3f4f6', icon:'🚫' },
};

export async function listSafetyEvents() {
  const s = await getDocs(query(collection(db, COL.safetyEvent), orderBy('startDate','desc'), limit(300)));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function getSafetyEvent(id) {
  const d = await getDoc(doc(db, COL.safetyEvent, id));
  return d.exists() ? { id: d.id, ...d.data() } : null;
}
export async function createSafetyEvent(data, createdBy) {
  return addDoc(collection(db, COL.safetyEvent), { ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateSafetyEvent(id, data) {
  await updateDoc(doc(db, COL.safetyEvent, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deleteSafetyEvent(id) {
  await deleteDoc(doc(db, COL.safetyEvent, id));
}

// ── Phase 87: Workplace Environment & Heat Stress Monitoring ────────────────
export const ENV_PARAMS = {
  wbgt:         { label:'WBGT (ดัชนีความร้อน)',         icon:'🌡️', unit:'°C',    color:'#dc2626', bg:'#fee2e2',
                  limits:{ normal:28, alert:30, critical:33 }, desc:'Wet Bulb Globe Temperature' },
  temperature:  { label:'อุณหภูมิอากาศ',                icon:'🌡️', unit:'°C',    color:'#ea580c', bg:'#fff7ed',
                  limits:{ normal:30, alert:35, critical:40 }, desc:'Dry Bulb Temperature' },
  humidity:     { label:'ความชื้นสัมพัทธ์',              icon:'💧', unit:'%RH',   color:'#0891b2', bg:'#e0f2fe',
                  limits:{ normal:70, alert:80, critical:90 }, desc:'Relative Humidity' },
  lighting:     { label:'ความเข้มแสงสว่าง',              icon:'💡', unit:'Lux',   color:'#ca8a04', bg:'#fef9c3',
                  limits:{ normal:300, alert:150, critical:50 }, desc:'Illuminance — higher is better', invert:true },
  co:           { label:'คาร์บอนมอนอกไซด์ (CO)',         icon:'☁️', unit:'ppm',   color:'#64748b', bg:'#f1f5f9',
                  limits:{ normal:25, alert:50, critical:200 }, desc:'Carbon Monoxide' },
  co2:          { label:'คาร์บอนไดออกไซด์ (CO₂)',        icon:'🌫️', unit:'ppm',   color:'#9333ea', bg:'#faf5ff',
                  limits:{ normal:1000, alert:2000, critical:5000 }, desc:'Carbon Dioxide' },
  pm25:         { label:'ฝุ่นละออง PM2.5',               icon:'🌪️', unit:'µg/m³', color:'#7c3aed', bg:'#f5f3ff',
                  limits:{ normal:35, alert:75, critical:150 }, desc:'Fine Particulate Matter' },
  air_velocity: { label:'ความเร็วลม',                    icon:'💨', unit:'m/s',   color:'#2563eb', bg:'#dbeafe',
                  limits:{ normal:0.5, alert:1.0, critical:2.0 }, desc:'Air Velocity' },
  vibration:    { label:'ความสั่นสะเทือน',               icon:'📳', unit:'m/s²',  color:'#d97706', bg:'#fef3c7',
                  limits:{ normal:2.5, alert:5.0, critical:10.0 }, desc:'Hand-Arm Vibration' },
  uv:           { label:'รังสีอัลตราไวโอเลต (UV)',        icon:'☀️', unit:'mW/cm²',color:'#16a34a', bg:'#dcfce7',
                  limits:{ normal:0.1, alert:0.3, critical:1.0 }, desc:'UV Radiation Intensity' },
};
export const ENV_LOCATIONS = [
  'สายการผลิต A','สายการผลิต B','คลังสินค้า','พื้นที่โหลด/ขนถ่าย',
  'ห้องเครื่องจักร','ห้องแล็บ','พื้นที่เชื่อมโลหะ','ห้องสารเคมี',
  'สำนักงาน','ลานจอดรถ / กลางแจ้ง','ห้องไฟฟ้า','อื่นๆ',
];
export const ENV_SHIFT = ['กะเช้า','กะบ่าย','กะดึก','ไม่ระบุกะ'];

export function envResult(param, value){
  const p = ENV_PARAMS[param];
  if(!p||value===null||value===undefined||value==='') return 'normal';
  const v = Number(value);
  if(isNaN(v)) return 'normal';
  if(p.invert){
    if(v <= p.limits.critical) return 'critical';
    if(v <= p.limits.alert) return 'alert';
    return 'normal';
  }
  if(v >= p.limits.critical) return 'critical';
  if(v >= p.limits.alert) return 'alert';
  return 'normal';
}
export const ENV_RESULT = {
  normal:   { label:'ปกติ',      color:'#16a34a', bg:'#dcfce7', icon:'✅' },
  alert:    { label:'เฝ้าระวัง', color:'#d97706', bg:'#fef3c7', icon:'⚠️' },
  critical: { label:'เกินมาตรฐาน',color:'#dc2626', bg:'#fee2e2', icon:'🚨' },
};

export async function listEnvMeasures() {
  const s = await getDocs(query(collection(db, COL.envMeasure), orderBy('measureDate','desc'), limit(500)));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function getEnvMeasure(id) {
  const d = await getDoc(doc(db, COL.envMeasure, id));
  return d.exists() ? { id: d.id, ...d.data() } : null;
}
export async function createEnvMeasure(data, createdBy) {
  return addDoc(collection(db, COL.envMeasure), { ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateEnvMeasure(id, data) {
  await updateDoc(doc(db, COL.envMeasure, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deleteEnvMeasure(id) {
  await deleteDoc(doc(db, COL.envMeasure, id));
}

export async function listCampaigns() {
  const s = await getDocs(query(collection(db, COL.campaign), orderBy('createdAt','desc'), limit(300)));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function getCampaign(id) {
  const d = await getDoc(doc(db, COL.campaign, id));
  return d.exists() ? { id: d.id, ...d.data() } : null;
}
export async function createCampaign(data, createdBy) {
  return addDoc(collection(db, COL.campaign), { ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateCampaign(id, data) {
  await updateDoc(doc(db, COL.campaign, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deleteCampaign(id) {
  await deleteDoc(doc(db, COL.campaign, id));
}

export async function listMonitorProgs() {
  const s = await getDocs(query(collection(db, COL.monitorProg), orderBy('createdAt','desc'), limit(300)));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function getMonitorProg(id) {
  const d = await getDoc(doc(db, COL.monitorProg, id));
  return d.exists() ? { id: d.id, ...d.data() } : null;
}
export async function createMonitorProg(data, createdBy) {
  return addDoc(collection(db, COL.monitorProg), { ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateMonitorProg(id, data) {
  await updateDoc(doc(db, COL.monitorProg, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deleteMonitorProg(id) {
  await deleteDoc(doc(db, COL.monitorProg, id));
}

export async function listOpControls() {
  const s = await getDocs(query(collection(db, COL.opControl), orderBy('createdAt','desc'), limit(500)));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function getOpControl(id) {
  const d = await getDoc(doc(db, COL.opControl, id));
  return d.exists() ? { id: d.id, ...d.data() } : null;
}
export async function createOpControl(data, createdBy) {
  return addDoc(collection(db, COL.opControl), { ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateOpControl(id, data) {
  await updateDoc(doc(db, COL.opControl, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deleteOpControl(id) {
  await deleteDoc(doc(db, COL.opControl, id));
}

export async function listHazards() {
  const s = await getDocs(query(collection(db, COL.hazard), orderBy('createdAt','desc'), limit(500)));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function getHazard(id) {
  const d = await getDoc(doc(db, COL.hazard, id));
  return d.exists() ? { id: d.id, ...d.data() } : null;
}
export async function createHazard(data, createdBy) {
  return addDoc(collection(db, COL.hazard), { ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateHazard(id, data) {
  await updateDoc(doc(db, COL.hazard, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deleteHazard(id) {
  await deleteDoc(doc(db, COL.hazard, id));
}

export async function listContextIssues() {
  const s = await getDocs(query(collection(db, COL.contextIssue), orderBy('createdAt','desc'), limit(300)));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function getContextIssue(id) {
  const d = await getDoc(doc(db, COL.contextIssue, id));
  return d.exists() ? { id: d.id, ...d.data() } : null;
}
export async function createContextIssue(data, createdBy) {
  return addDoc(collection(db, COL.contextIssue), { ...data, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateContextIssue(id, data) {
  await updateDoc(doc(db, COL.contextIssue, id), { ...data, updatedAt: serverTimestamp() });
}
export async function deleteContextIssue(id) {
  await deleteDoc(doc(db, COL.contextIssue, id));
}
