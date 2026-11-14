// esg-social.js — Module S (Social) data layer
import { db, auth } from "./auth.js";
const uid = () => auth.currentUser?.uid ?? '';
import {
  doc, addDoc, updateDoc, deleteDoc, getDocs,
  collection, query, where, limit, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Collection names ─────────────────────────────────────────────────────────
export const C = {
  WORKFORCE: 'socWorkforce',
  ACCIDENT:  'socAccident',
  TRAINING:  'socTraining',
  WELFARE:   'socWelfare',
};

export const DEPTS = [
  'Outbound (OB)', 'Inbound (IB)', 'Inventory', 'Logistics / 3PL',
  'Transportation', 'Safety & Environment', 'Warehouse Management',
];

export const INCIDENT_TYPES = [
  { key: 'near_miss', label: 'Near Miss (เฉียด)'       },
  { key: 'first_aid', label: 'First Aid (ปฐมพยาบาล)'  },
  { key: 'medical',   label: 'Medical Treatment'       },
  { key: 'lti',       label: 'LTI (หยุดงาน)'           },
  { key: 'fatality',  label: 'Fatality (เสียชีวิต)'    },
];

export const TRAINING_TYPES = [
  { key: 'internal', label: 'Internal (ภายใน)'    },
  { key: 'external', label: 'External (ภายนอก)'   },
  { key: 'online',   label: 'Online / E-Learning' },
];

// ── Generic helpers ───────────────────────────────────────────────────────────
function ym(year, month) { return { year: Number(year), month: Number(month) }; }

async function addRec(col, data) {
  const ref = await addDoc(collection(db, col), {
    ...data, uid: uid(), createdAt: serverTimestamp(),
  });
  return ref.id;
}

async function updateRec(col, id, data) {
  await updateDoc(doc(db, col, id), {
    ...data, updatedBy: uid(), updatedAt: serverTimestamp(),
  });
}

export async function deleteRec(col, id) {
  await deleteDoc(doc(db, col, id));
}

async function listByMonth(col, year, month, maxRows = 100) {
  const q = query(
    collection(db, col),
    where('year', '==', Number(year)),
    where('month', '==', Number(month)),
    limit(maxRows),
  );
  const snap = await getDocs(q);
  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return rows;
}

// ── Workforce ─────────────────────────────────────────────────────────────────
export async function saveWorkforce(data) {
  const { id, ...rest } = data;
  const payload = { ...ym(rest.year, rest.month), ...rest };
  if (id) { await updateRec(C.WORKFORCE, id, payload); return id; }
  return addRec(C.WORKFORCE, payload);
}
export const listWorkforce = (y, m) => listByMonth(C.WORKFORCE, y, m);

// ── Accident / Safety incident ────────────────────────────────────────────────
export async function saveAccident(data) {
  const { id, ...rest } = data;
  const payload = { ...ym(rest.year, rest.month), ...rest };
  if (id) { await updateRec(C.ACCIDENT, id, payload); return id; }
  return addRec(C.ACCIDENT, payload);
}
export const listAccident = (y, m) => listByMonth(C.ACCIDENT, y, m);

// ── Training ──────────────────────────────────────────────────────────────────
export async function saveTraining(data) {
  const { id, ...rest } = data;
  const payload = { ...ym(rest.year, rest.month), ...rest };
  if (id) { await updateRec(C.TRAINING, id, payload); return id; }
  return addRec(C.TRAINING, payload);
}
export const listTraining = (y, m) => listByMonth(C.TRAINING, y, m);

// ── Welfare / CSR ─────────────────────────────────────────────────────────────
export async function saveWelfare(data) {
  const { id, ...rest } = data;
  const payload = { ...ym(rest.year, rest.month), ...rest };
  if (id) { await updateRec(C.WELFARE, id, payload); return id; }
  return addRec(C.WELFARE, payload);
}
export const listWelfare = (y, m) => listByMonth(C.WELFARE, y, m);

// ── Monthly summary (for ESG Dashboard aggregation) ───────────────────────────
export async function socialMonthSummary(year, month) {
  const [workforce, accidents, trainings, welfare] = await Promise.all([
    listWorkforce(year, month),
    listAccident(year, month),
    listTraining(year, month),
    listWelfare(year, month),
  ]);
  const sum = (arr, k) => arr.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const total_emp = sum(workforce, 'total_emp');
  const resigned  = sum(workforce, 'resigned');
  return {
    total_emp,
    male:         sum(workforce, 'male'),
    female:       sum(workforce, 'female'),
    new_hire:     sum(workforce, 'new_hire'),
    resigned,
    turnover_rate: total_emp > 0 ? Math.round((resigned / total_emp) * 1000) / 10 : 0,
    accidents_total:  accidents.length,
    lti_count:        accidents.filter(a => ['lti','fatality'].includes(a.incident_type)).length,
    lost_days:        sum(accidents, 'lost_days'),
    training_sessions: trainings.length,
    training_hours:    sum(trainings, 'hours'),
    trainees:          sum(trainings, 'trainees'),
    health_checkup:    sum(welfare, 'health_checkup'),
    welfare_budget:    sum(welfare, 'welfare_budget'),
    csr_activities:    sum(welfare, 'activities'),
  };
}
