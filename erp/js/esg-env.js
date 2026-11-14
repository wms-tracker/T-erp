// esg-env.js — Module E (Environmental) data layer
import { db, auth } from "./auth.js";
const uid = () => auth.currentUser?.uid ?? '';
import {
  doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, getDocs,
  collection, query, where, orderBy, limit, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Collection names ─────────────────────────────────────────────────────────
export const C = {
  ENERGY:    'envEnergy',
  WATER:     'envWater',
  WASTE:     'envWaste',
  PACKAGING: 'envPackaging',
  CARBON:    'envCarbon',
  EF:        'settings',   // settings/emissionFactors doc
};

// ── Default Thailand TGO emission factors (configurable via Firestore) ────────
export const EF_DEFAULTS = {
  electricity_grid: { value: 0.4999, unit: 'kgCO2e/kWh',   source: 'TGO Thailand 2022' },
  diesel:           { value: 2.68,   unit: 'kgCO2e/litre',  source: 'IPCC 2006 / TGO'  },
  gasoline:         { value: 2.19,   unit: 'kgCO2e/litre',  source: 'IPCC 2006 / TGO'  },
  lpg:              { value: 1.73,   unit: 'kgCO2e/kg',     source: 'IPCC 2006 / TGO'  },
  natural_gas:      { value: 2.04,   unit: 'kgCO2e/m3',     source: 'IPCC 2006 / TGO'  },
};

export const FUEL_TYPES = [
  { key: 'diesel',      label: 'ดีเซล (Diesel)'       },
  { key: 'gasoline',    label: 'เบนซิน (Gasoline)'     },
  { key: 'lpg',         label: 'LPG'                   },
  { key: 'natural_gas', label: 'ก๊าซธรรมชาติ (CNG/NGV)' },
  { key: 'electricity_grid', label: 'ไฟฟ้า (EV)'      },
];

export const DEPTS = [
  'Outbound (OB)', 'Inbound (IB)', 'Inventory', 'Logistics / 3PL',
  'Transportation', 'Safety & Environment', 'Warehouse Management',
];

export const WASTE_DISPOSAL = [
  'ทิ้งทั่วไป (เทศบาล)', 'รีไซเคิล / ขายได้', 'เผาทำลาย', 'ฝังกลบ',
  'บริษัทรับกำจัดสารอันตราย', 'บริจาค / นำกลับใช้ใหม่',
];

// ── Load emission factors (from Firestore or use defaults) ────────────────────
export async function getEmissionFactors() {
  try {
    const snap = await getDoc(doc(db, C.EF, 'emissionFactors'));
    return snap.exists() ? { ...EF_DEFAULTS, ...snap.data() } : { ...EF_DEFAULTS };
  } catch { return { ...EF_DEFAULTS }; }
}

export async function saveEmissionFactors(data) {
  await setDoc(doc(db, C.EF, 'emissionFactors'), {
    ...data, updated_by: uid(), updated_at: serverTimestamp(),
  }, { merge: true });
}

// ── Generic helpers ───────────────────────────────────────────────────────────
function ym(year, month) { return { year: Number(year), month: Number(month) }; }

async function addRec(col, data) {
  const ref = await addDoc(collection(db, col), {
    ...data, uid: uid(), createdAt: serverTimestamp(), status: 'submitted',
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

async function listByMonth(col, year, month, maxRows = 50) {
  const q = query(
    collection(db, col),
    where('year', '==', Number(year)),
    where('month', '==', Number(month)),
    orderBy('date', 'desc'),
    limit(maxRows),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Energy ────────────────────────────────────────────────────────────────────
export async function saveEnergy(data) {
  const { id, ...rest } = data;
  const payload = { ...ym(rest.year, rest.month), ...rest };
  if (id) { await updateRec(C.ENERGY, id, payload); return id; }
  return addRec(C.ENERGY, payload);
}
export const listEnergy = (y, m) => listByMonth(C.ENERGY, y, m);

// ── Water ─────────────────────────────────────────────────────────────────────
export async function saveWater(data) {
  const { id, ...rest } = data;
  const payload = { ...ym(rest.year, rest.month), ...rest };
  if (id) { await updateRec(C.WATER, id, payload); return id; }
  return addRec(C.WATER, payload);
}
export const listWater = (y, m) => listByMonth(C.WATER, y, m);

// ── Waste ─────────────────────────────────────────────────────────────────────
export async function saveWaste(data) {
  const { id, ...rest } = data;
  // auto-calc total_kg
  const nums = ['general_kg','recyclable_kg','paper_kg','plastic_kg','packaging_kg','hazardous_kg'];
  const total_kg = nums.reduce((s, k) => s + (Number(rest[k]) || 0), 0);
  const recycled_kg = (Number(rest.recyclable_kg)||0) + (Number(rest.paper_kg)||0) + (Number(rest.plastic_kg)||0);
  const recycle_rate = total_kg > 0 ? Math.round((recycled_kg / total_kg) * 1000) / 10 : 0;
  const payload = { ...ym(rest.year, rest.month), ...rest, total_kg, recycle_rate };
  if (id) { await updateRec(C.WASTE, id, payload); return id; }
  return addRec(C.WASTE, payload);
}
export const listWaste = (y, m) => listByMonth(C.WASTE, y, m);

// ── Packaging ─────────────────────────────────────────────────────────────────
export async function savePackaging(data) {
  const { id, ...rest } = data;
  const payload = { ...ym(rest.year, rest.month), ...rest };
  if (id) { await updateRec(C.PACKAGING, id, payload); return id; }
  return addRec(C.PACKAGING, payload);
}
export const listPackaging = (y, m) => listByMonth(C.PACKAGING, y, m);

// ── Carbon / Fuel ─────────────────────────────────────────────────────────────
export async function saveCarbon(data, efMap) {
  const { id, ...rest } = data;
  // Calculate CO2e from emission factor if not manually set
  let co2e_kg = Number(rest.co2e_kg) || 0;
  if (!rest.co2e_manual && rest.fuel_type && efMap) {
    const ef = efMap[rest.fuel_type];
    if (ef) co2e_kg = Math.round((Number(rest.fuel_volume)||0) * ef.value * 1000) / 1000;
  }
  const payload = { ...ym(rest.year, rest.month), ...rest, co2e_kg, ef_source: efMap?.[rest.fuel_type]?.source || '' };
  if (id) { await updateRec(C.CARBON, id, payload); return id; }
  return addRec(C.CARBON, payload);
}
export const listCarbon = (y, m) => listByMonth(C.CARBON, y, m);

// ── Monthly summaries (for ESG Dashboard aggregation) ─────────────────────────
export async function envMonthSummary(year, month) {
  const [energy, water, waste, pkg, carbon] = await Promise.all([
    listEnergy(year, month),
    listWater(year, month),
    listWaste(year, month),
    listPackaging(year, month),
    listCarbon(year, month),
  ]);
  const sum = (arr, k) => arr.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  return {
    electricity_kwh: sum(energy, 'electricity_kwh'),
    electricity_cost: sum(energy, 'electricity_cost'),
    machine_kwh: sum(energy, 'machine_kwh'),
    forklift_kwh: sum(energy, 'forklift_kwh'),
    water_m3: sum(water, 'water_m3'),
    water_cost: sum(water, 'water_cost'),
    waste_total_kg: sum(waste, 'total_kg'),
    waste_recycle_kg: sum(waste, 'recyclable_kg') + sum(waste, 'paper_kg') + sum(waste, 'plastic_kg'),
    recycle_rate: waste.length ? Math.round(waste.reduce((s, r) => s + (r.recycle_rate||0), 0) / waste.length * 10) / 10 : 0,
    fuel_volume_total: sum(carbon, 'fuel_volume'),
    co2e_kg_total: sum(carbon, 'co2e_kg'),
    pkg_boxes: sum(pkg, 'boxes'),
    pkg_plastic_kg: sum(pkg, 'plastic_kg'),
  };
}
