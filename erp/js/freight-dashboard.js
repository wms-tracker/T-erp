// ===================================================================
// freight-dashboard.js — pure aggregation functions for the Freight
// Dashboard (§18/§39 of the spec: cost analysis + reports). Operates on
// already-normalized records (see normalizeCalc) so this stays
// Node-testable with no Firestore Timestamp dependency.
// ===================================================================
import { roundMoney } from "./freight-engine.js";

const FAILURE_STATUSES = new Set(["RATE_NOT_FOUND", "ZONE_NOT_FOUND", "WEIGHT_ERROR", "DIMENSION_ERROR", "DATA_ERROR", "CALCULATION_ERROR"]);

function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Firestore freightCalculations doc -> flat record. `calc.createdAt` may be a Firestore
// Timestamp (has .toDate()) or a plain JS Date — either works.
export function normalizeCalc(calc) {
  const createdAt = calc.createdAt?.toDate ? calc.createdAt.toDate() : (calc.createdAt instanceof Date ? calc.createdAt : null);
  return {
    id: calc.id, status: calc.status,
    carrierId: calc.carrierId || calc.input?.carrierId || "ไม่ระบุ",
    totalFreight: calc.totalFreight ?? null,
    chargeableWeight: calc.result?.chargeableWeight ?? null,
    province: calc.input?.province || "ไม่ระบุ",
    dateStr: createdAt ? isoDate(createdAt) : null,
  };
}

export function computeKPIs(records) {
  const calculated = records.filter((r) => r.status === "CALCULATED");
  const totalFreight = calculated.reduce((a, r) => a + (r.totalFreight || 0), 0);
  const totalWeight = calculated.reduce((a, r) => a + (r.chargeableWeight || 0), 0);
  return {
    total: records.length,
    calculated: calculated.length,
    manualReview: records.filter((r) => r.status === "MANUAL_REVIEW").length,
    failed: records.filter((r) => FAILURE_STATUSES.has(r.status)).length,
    totalFreight: roundMoney(totalFreight),
    avgFreightPerOrder: calculated.length ? roundMoney(totalFreight / calculated.length) : 0,
    freightPerKg: totalWeight ? roundMoney(totalFreight / totalWeight) : 0,
  };
}

// period: 'today' | '7d' | '30d' | 'month' | 'year' | 'all'. `today` is injectable for tests.
export function filterByPeriod(records, period, today = new Date()) {
  if (!period || period === "all") return records;
  const todayStr = isoDate(today);
  if (period === "today") return records.filter((r) => r.dateStr === todayStr);
  if (period === "month") return records.filter((r) => r.dateStr && r.dateStr.slice(0, 7) === todayStr.slice(0, 7));
  if (period === "year") return records.filter((r) => r.dateStr && r.dateStr.slice(0, 4) === todayStr.slice(0, 4));
  const days = period === "30d" ? 30 : 7;
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - (days - 1));
  const cutoffStr = isoDate(cutoff);
  return records.filter((r) => r.dateStr && r.dateStr >= cutoffStr);
}

export function groupSumByKey(records, keyFn) {
  const map = new Map();
  for (const r of records) {
    if (r.status !== "CALCULATED") continue;
    const key = keyFn(r) || "ไม่ระบุ";
    const cur = map.get(key) || { count: 0, total: 0 };
    cur.count++;
    cur.total = roundMoney(cur.total + (r.totalFreight || 0));
    map.set(key, cur);
  }
  return [...map.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.total - a.total);
}

export function groupByCarrier(records) { return groupSumByKey(records, (r) => r.carrierId); }
export function groupByProvince(records) { return groupSumByKey(records, (r) => r.province); }

const WEIGHT_BUCKETS = [
  { label: "0-1 kg", min: 0, max: 1 }, { label: "1-5 kg", min: 1, max: 5 },
  { label: "5-10 kg", min: 5, max: 10 }, { label: "10-20 kg", min: 10, max: 20 },
  { label: "20 kg+", min: 20, max: Infinity },
];
export function groupByWeightRange(records) {
  return WEIGHT_BUCKETS.map((b) => {
    const rows = records.filter((r) => r.status === "CALCULATED" && r.chargeableWeight != null && r.chargeableWeight > b.min && r.chargeableWeight <= b.max);
    return { key: b.label, count: rows.length, total: roundMoney(rows.reduce((a, r) => a + (r.totalFreight || 0), 0)) };
  });
}

export function dailyTrend(records, days = 14, today = new Date()) {
  const buckets = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    buckets.push({ key: isoDate(d), label: d.toLocaleDateString("th-TH", { day: "numeric", month: "short" }), count: 0, total: 0 });
  }
  const byKey = Object.fromEntries(buckets.map((b) => [b.key, b]));
  for (const r of records) {
    if (r.status !== "CALCULATED" || !byKey[r.dateStr]) continue;
    byKey[r.dateStr].count++;
    byKey[r.dateStr].total = roundMoney(byKey[r.dateStr].total + (r.totalFreight || 0));
  }
  return buckets;
}
