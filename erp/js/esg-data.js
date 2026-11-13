// esg-data.js — Firestore data layer for ESG (Environmental, Social, Governance)
import { db, uid } from "./auth.js";
import {
  doc, getDoc, setDoc, getDocs,
  collection, query, where, orderBy,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export const COL_MONTHLY = 'esgMonthly';
export const COL_CONFIG  = 'esgConfig';

export const PILLARS = {
  e: {
    label: 'E — สิ่งแวดล้อม',
    labelShort: 'Environmental',
    color: '#16a34a',
    bg: '#dcfce7',
    border: '#86efac',
    icon: '🌿',
    metrics: [
      { key: 'electricity_kwh', label: 'ไฟฟ้า',              unit: 'kWh',    low: true  },
      { key: 'water_m3',        label: 'น้ำ',                unit: 'ลบ.ม.', low: true  },
      { key: 'waste_kg',        label: 'ขยะทั้งหมด',         unit: 'กก.',    low: true  },
      { key: 'recycle_kg',      label: 'ขยะรีไซเคิล',        unit: 'กก.',    low: false },
      { key: 'emissions_tco2e', label: 'คาร์บอนฟุตพริ้นท์', unit: 'tCO₂e', low: true  },
    ],
  },
  s: {
    label: 'S — สังคม',
    labelShort: 'Social',
    color: '#1d4ed8',
    bg: '#dbeafe',
    border: '#93c5fd',
    icon: '🤝',
    metrics: [
      { key: 'training_hours',  label: 'ชั่วโมงฝึกอบรม',    unit: 'ชม.',   low: false },
      { key: 'incident_count',  label: 'อุบัติเหตุ',         unit: 'ครั้ง', low: true  },
      { key: 'lost_days',       label: 'วันสูญเสียจากเหตุ',  unit: 'วัน',   low: true  },
      { key: 'turnover_pct',    label: 'อัตราลาออก',         unit: '%',     low: true  },
      { key: 'community_hours', label: 'กิจกรรมชุมชน',       unit: 'ชม.',   low: false },
    ],
  },
  g: {
    label: 'G — ธรรมาภิบาล',
    labelShort: 'Governance',
    color: '#7c3aed',
    bg: '#ede9fe',
    border: '#c4b5fd',
    icon: '⚖️',
    metrics: [
      { key: 'compliance_pct',      label: 'ปฏิบัติตามกฎหมาย', unit: '%',     low: false },
      { key: 'board_meetings',      label: 'ประชุมกรรมการ',     unit: 'ครั้ง', low: false },
      { key: 'audit_findings',      label: 'ข้อบกพร่องตรวจสอบ', unit: 'ข้อ',   low: true  },
      { key: 'ethics_training_pct', label: 'ผ่านอบรมจริยธรรม',  unit: '%',     low: false },
    ],
  },
};

export function monthId(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export async function getMonthly(year, month) {
  const snap = await getDoc(doc(db, COL_MONTHLY, monthId(year, month)));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function saveMonthly(year, month, pillars) {
  const id  = monthId(year, month);
  const ref = doc(db, COL_MONTHLY, id);
  const snap = await getDoc(ref);
  await setDoc(ref, {
    year, month,
    ...(snap.exists() ? {} : { created_by: uid(), created_at: serverTimestamp() }),
    updated_by: uid(),
    updated_at: serverTimestamp(),
    ...pillars,
  }, { merge: true });
  return id;
}

export async function listMonthlyYear(year) {
  const snap = await getDocs(query(
    collection(db, COL_MONTHLY),
    where('year', '==', year),
    orderBy('month'),
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getTargets() {
  const snap = await getDoc(doc(db, COL_CONFIG, 'targets'));
  return snap.exists() ? snap.data() : {};
}

export async function saveTargets(targets) {
  await setDoc(doc(db, COL_CONFIG, 'targets'), {
    ...targets,
    updated_by: uid(),
    updated_at: serverTimestamp(),
  });
}

// ── Scoring ────────────────────────────────────────────────────────────────
export function metricStatus(value, target, low) {
  if (value == null || value === '' || target == null || Number(target) === 0) return null;
  const v = Number(value), t = Number(target);
  if (low) {
    if (v <= t)       return 'green';
    if (v <= t * 1.25) return 'yellow';
    return 'red';
  } else {
    if (v >= t)       return 'green';
    if (v >= t * 0.75) return 'yellow';
    return 'red';
  }
}

export function pillarScore(pillarKey, data, targets) {
  const P = PILLARS[pillarKey];
  if (!P || !data) return null;
  const scores = P.metrics
    .map(m => metricStatus(data[m.key], targets[pillarKey]?.[m.key], m.low))
    .filter(s => s !== null);
  if (!scores.length) return null;
  const pts = scores.map(s => s === 'green' ? 100 : s === 'yellow' ? 60 : 20);
  return Math.round(pts.reduce((a, b) => a + b, 0) / pts.length);
}

export function scoreColor(score) {
  if (score == null) return 'grey';
  if (score >= 80)   return 'green';
  if (score >= 50)   return 'yellow';
  return 'red';
}

export const MONTH_TH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.',
                          'ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
