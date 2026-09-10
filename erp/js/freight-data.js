// ===================================================================
// freight-data.js — Firestore access layer for the Freight Cost Calculator
// module. Follows the exact CRUD / audit-trail / counter pattern used by
// erp/js/damage-reports.js so the two modules stay consistent.
//
// Collections (documented in erp/SCHEMA.md, rules in
// erp/firestore.rules.example):
//   freightCarriers/{carrierId}            — carrier + weight/rounding rule + services[]
//   freightZoneMap/{postalCode}            — per-carrier zone for a postal code
//   freightRateCards/{autoId}               — weight+zone rate table rows (versioned)
//   freightSkuRateGrids/{sku}               — Business Idea's per-SKU zone/bracket grid
//   freightSizeClassRates/{autoId}          — Nim-express size-class prices (versioned)
//   freightSkuDimensions/{sku}              — physical dims/weight (+ sizeClass for Nim)
//   freightSurcharges/{autoId}              — fuel/remote/insurance/etc rules
//   freightCodRules/{autoId}                — COD % + min/max fee (versioned)
//   freightBulkyThresholds/{carrierId_serviceId}
//   freightCalculations/{autoId} (+ history subcollection) — saved calc records
// ===================================================================
import { db } from "./auth.js";
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where,
  runTransaction, writeBatch, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { runCalculationWithValidation } from "./freight-engine.js";

function stringifyVal(v) {
  if (v === undefined || v === null) return "";
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

// ---------- Carriers ----------

export async function listCarriers() {
  const snap = await getDocs(collection(db, "freightCarriers"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}

export async function getCarrier(carrierId) {
  if (!carrierId) return null;
  const snap = await getDoc(doc(db, "freightCarriers", carrierId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// carrierId is chosen by the admin (short code, e.g. "best", "kex") — carriers are few and
// referenced by id everywhere else, so a human-readable doc id beats an auto id here.
export async function saveCarrier(carrierId, data, user) {
  const ref = doc(db, "freightCarriers", carrierId);
  const snap = await getDoc(ref);
  const isNew = !snap.exists();
  await setDoc(ref, {
    ...data,
    updatedBy: user.uid, updatedAt: serverTimestamp(),
    ...(isNew ? { createdBy: user.uid, createdAt: serverTimestamp() } : {}),
  }, { merge: true });
  return carrierId;
}

export async function deleteCarrier(carrierId) {
  await deleteDoc(doc(db, "freightCarriers", carrierId));
}

// ---------- Zone Map (doc id = postal code — direct lookup, no full-collection scan) ----------

export async function getZoneMapEntry(postalCode) {
  if (!postalCode) return null;
  const snap = await getDoc(doc(db, "freightZoneMap", String(postalCode)));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function saveZoneMapEntry(postalCode, data, user) {
  const ref = doc(db, "freightZoneMap", String(postalCode));
  await setDoc(ref, { ...data, postalCode: String(postalCode), updatedBy: user.uid, updatedAt: serverTimestamp() }, { merge: true });
}

// Full listing for the admin browse/search page — same "load once, filter in JS"
// pattern damage-reports.html already uses; ~1,200 rows is well within that budget.
export async function listZoneMapEntries() {
  const snap = await getDocs(collection(db, "freightZoneMap"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.postalCode || "").localeCompare(b.postalCode || ""));
}

// ---------- Rate Cards (weight+zone tables — Best/Flash/KEX/Kerry/DHL) ----------

export async function listRateCardsForCarrier(carrierId) {
  const snap = await getDocs(query(collection(db, "freightRateCards"), where("carrierId", "==", carrierId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function saveRateCard(id, data, user) {
  const ref = id ? doc(db, "freightRateCards", id) : doc(collection(db, "freightRateCards"));
  const isNew = !id;
  await setDoc(ref, {
    ...data,
    updatedBy: user.uid, updatedAt: serverTimestamp(),
    ...(isNew ? { createdBy: user.uid, createdAt: serverTimestamp() } : {}),
  }, { merge: true });
  return ref.id;
}

export async function deleteRateCard(id) {
  await deleteDoc(doc(db, "freightRateCards", id));
}

// ---------- SKU Rate Grids (Business Idea) — one doc per SKU, cells embedded ----------
// cells: [{ bracketLabel, bracketMin, bracketMax, zone, rate, rateVersion, effectiveFrom, effectiveTo }]

export async function getSkuGrid(sku) {
  const snap = await getDoc(doc(db, "freightSkuRateGrids", sku));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function saveSkuGrid(sku, data, user) {
  await setDoc(doc(db, "freightSkuRateGrids", sku), { ...data, sku, updatedBy: user.uid, updatedAt: serverTimestamp() }, { merge: true });
}

function flattenSkuGrid(gridDoc) {
  if (!gridDoc) return [];
  return (gridDoc.cells || []).map((c) => ({ sku: gridDoc.sku, ...c }));
}

// ---------- Size Class Rates (Nim-express) ----------

export async function listSizeClassRates() {
  const snap = await getDocs(collection(db, "freightSizeClassRates"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function saveSizeClassRate(id, data, user) {
  const ref = id ? doc(db, "freightSizeClassRates", id) : doc(collection(db, "freightSizeClassRates"));
  await setDoc(ref, { ...data, updatedBy: user.uid, updatedAt: serverTimestamp() }, { merge: true });
  return ref.id;
}

export async function deleteSizeClassRate(id) {
  await deleteDoc(doc(db, "freightSizeClassRates", id));
}

// ---------- SKU physical dimensions ----------

export async function getSkuDimension(sku) {
  if (!sku) return null;
  const snap = await getDoc(doc(db, "freightSkuDimensions", sku));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function saveSkuDimension(sku, data, user) {
  await setDoc(doc(db, "freightSkuDimensions", sku), { ...data, sku, updatedBy: user.uid, updatedAt: serverTimestamp() }, { merge: true });
}

// ---------- Surcharges ----------

export async function listSurchargesForCarrier(carrierId) {
  const snap = await getDocs(query(collection(db, "freightSurcharges"), where("carrierId", "==", carrierId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function saveSurcharge(id, data, user) {
  const ref = id ? doc(db, "freightSurcharges", id) : doc(collection(db, "freightSurcharges"));
  await setDoc(ref, { ...data, updatedBy: user.uid, updatedAt: serverTimestamp() }, { merge: true });
  return ref.id;
}

export async function deleteSurcharge(id) {
  await deleteDoc(doc(db, "freightSurcharges", id));
}

// ---------- COD Rules ----------

export async function listCodRulesForCarrier(carrierId) {
  const snap = await getDocs(query(collection(db, "freightCodRules"), where("carrierId", "==", carrierId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function saveCodRule(id, data, user) {
  const ref = id ? doc(db, "freightCodRules", id) : doc(collection(db, "freightCodRules"));
  await setDoc(ref, { ...data, updatedBy: user.uid, updatedAt: serverTimestamp() }, { merge: true });
  return ref.id;
}

export async function deleteCodRule(id) {
  await deleteDoc(doc(db, "freightCodRules", id));
}

// ---------- Bulky Thresholds ----------

function bulkyThresholdId(carrierId, serviceId) {
  return `${carrierId}_${serviceId || "default"}`;
}

export async function getBulkyThreshold(carrierId, serviceId) {
  const snap = await getDoc(doc(db, "freightBulkyThresholds", bulkyThresholdId(carrierId, serviceId)));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function saveBulkyThreshold(carrierId, serviceId, data, user) {
  await setDoc(doc(db, "freightBulkyThresholds", bulkyThresholdId(carrierId, serviceId)), {
    ...data, carrierId, serviceId: serviceId || null, updatedBy: user.uid, updatedAt: serverTimestamp(),
  }, { merge: true });
}

// ---------- Calculations (saved records + audit trail — spec §12/§45) ----------

async function genCalcNo() {
  const d = new Date();
  const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const counterRef = doc(db, "counters", "freightCalcCounter");
  const seq = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const cur = snap.exists() ? snap.data() : {};
    const next = cur.date === dateStr ? (cur.value || 0) + 1 : 1;
    tx.set(counterRef, { date: dateStr, value: next });
    return next;
  });
  return `FC-${dateStr}-${String(seq).padStart(4, "0")}`;
}

export async function logHistory(calcId, action, field, oldValue, newValue, user) {
  const hRef = doc(collection(db, "freightCalculations", calcId, "history"));
  await setDoc(hRef, {
    action, field: field || null,
    oldValue: stringifyVal(oldValue), newValue: stringifyVal(newValue),
    changedBy: user.uid, changedByName: user.name || user.email || "",
    changedAt: serverTimestamp(),
  });
}

export async function listHistory(calcId) {
  const snap = await getDocs(collection(db, "freightCalculations", calcId, "history"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.changedAt?.toMillis?.() || 0) - (a.changedAt?.toMillis?.() || 0));
}

export async function saveCalculation(input, result, user) {
  const calcNo = await genCalcNo();
  const ref = doc(collection(db, "freightCalculations"));
  await setDoc(ref, {
    calcNo, input, result,
    status: result.status, confidence: result.confidence, totalFreight: result.totalFreight,
    orderId: input.orderId || "", trackingNo: input.trackingNo || "", carrierId: input.carrierId || "",
    createdBy: user.uid, createdByName: user.name || user.email || "",
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  await logHistory(ref.id, "create", null, null, calcNo, user);
  return ref.id;
}

export async function getCalculation(id) {
  const snap = await getDoc(doc(db, "freightCalculations", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listCalculations() {
  const snap = await getDocs(collection(db, "freightCalculations"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
}

export async function deleteCalculation(id) {
  const histSnap = await getDocs(collection(db, "freightCalculations", id, "history"));
  const batch = writeBatch(db);
  histSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(db, "freightCalculations", id));
  await batch.commit();
}

// ---------- Orchestration: fetch everything an order needs, then run the pure engine ----------

export async function buildMasterData(input, carrier) {
  const zoneMapEntry = input.postalCode ? await getZoneMapEntry(input.postalCode) : null;
  const skuDim = input.sku ? await getSkuDimension(input.sku) : null;
  const rateCards = carrier ? await listRateCardsForCarrier(carrier.id) : [];
  const skuGridDoc = carrier && carrier.pricingStrategy === "SKU_ZONE_GRID" && input.sku ? await getSkuGrid(input.sku) : null;
  const sizeClassRates = carrier && carrier.pricingStrategy === "SKU_SIZE_CLASS" ? await listSizeClassRates() : [];
  const surcharges = carrier ? await listSurchargesForCarrier(carrier.id) : [];
  const codRules = carrier ? await listCodRulesForCarrier(carrier.id) : [];
  const bulkyThreshold = carrier ? await getBulkyThreshold(carrier.id, input.serviceId) : null;
  return {
    carrier, service: input.serviceId || null, zoneMapEntry, skuDim,
    rateCards, skuGrid: flattenSkuGrid(skuGridDoc), sizeClassRates, surcharges, codRules, bulkyThreshold,
  };
}

// Fetches all master data for `input.carrierId` and runs the double-checked pure engine.
// `save`: also persist a freightCalculations record (+ audit trail) for this result.
export async function calculateAndOptionallySave(input, user, { save = false } = {}) {
  const carrier = await getCarrier(input.carrierId);
  const masterData = await buildMasterData(input, carrier);
  const result = runCalculationWithValidation(input, masterData);
  let savedId = null;
  if (save) savedId = await saveCalculation(input, result, user);
  return { result, savedId, masterData };
}
