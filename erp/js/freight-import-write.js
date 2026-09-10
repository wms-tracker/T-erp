// ===================================================================
// freight-import-write.js — takes the output of freight-import.js's
// parseWorkbook() and writes it to Firestore in batches. Kept separate
// from freight-import.js so the parsing logic stays pure/Node-testable
// while this file (Firestore + browser only) handles the actual writes.
//
// Every write uses a deterministic doc id built from its own content, so
// re-running the import safely REFRESHES existing rows instead of
// duplicating them — the one exception is freightCarriers, which is only
// ever seeded once per carrier so a later admin edit (e.g. a tuned DIM
// factor) is never silently overwritten by a re-import.
// ===================================================================
import { db } from "./auth.js";
import { collection, doc, getDoc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { DEFAULT_CARRIERS } from "./freight-import.js";

function sanitizeId(s) {
  return String(s).replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 300);
}

function rateCardId(row, effectiveFrom) {
  return sanitizeId(`${row.carrierId}_${row.serviceId || "x"}_${row.zone}_${row.weightFrom}-${row.weightTo}_${effectiveFrom}`);
}

const BATCH_CHUNK = 450; // Firestore's hard limit is 500 writes/batch — leave headroom

async function commitInChunks(writes) {
  for (let i = 0; i < writes.length; i += BATCH_CHUNK) {
    const batch = writeBatch(db);
    for (const w of writes.slice(i, i + BATCH_CHUNK)) batch.set(w.ref, w.data, { merge: true });
    await batch.commit();
  }
  return writes.length;
}

// Only creates carriers that don't exist yet — never touches one an admin has already tuned.
export async function seedDefaultCarriers(user) {
  let created = 0;
  for (const c of DEFAULT_CARRIERS) {
    const ref = doc(db, "freightCarriers", c.id);
    const snap = await getDoc(ref);
    if (snap.exists()) continue;
    const batch = writeBatch(db);
    batch.set(ref, { ...c, createdBy: user.uid, createdAt: serverTimestamp(), updatedBy: user.uid, updatedAt: serverTimestamp() });
    await batch.commit();
    created++;
  }
  return created;
}

export async function writeRateCards(rows, effectiveFrom, user) {
  const writes = rows.map((r) => ({
    ref: doc(db, "freightRateCards", rateCardId(r, effectiveFrom)),
    data: { ...r, rateVersion: effectiveFrom, effectiveFrom, effectiveTo: null, updatedBy: user.uid, updatedAt: serverTimestamp() },
  }));
  return commitInChunks(writes);
}

export async function writeZoneMap(zoneDocs, user) {
  const writes = zoneDocs.map((d) => ({
    ref: doc(db, "freightZoneMap", d.postalCode),
    data: { ...d, updatedBy: user.uid, updatedAt: serverTimestamp() },
  }));
  return commitInChunks(writes);
}

export async function writeSkuDimensions(list, user) {
  const writes = list.filter((s) => s.sku).map((s) => ({
    ref: doc(db, "freightSkuDimensions", sanitizeId(s.sku)),
    data: { ...s, updatedBy: user.uid, updatedAt: serverTimestamp() },
  }));
  return commitInChunks(writes);
}

export async function writeBusinessIdeaGrid(grid, effectiveFrom, user) {
  const writes = grid.filter((entry) => entry.sku).map((entry) => ({
    ref: doc(db, "freightSkuRateGrids", sanitizeId(entry.sku)),
    data: {
      sku: entry.sku, name: entry.name, type: entry.type, size: entry.size, weightKg: entry.weightKg,
      cells: entry.cells.map((c) => ({ ...c, rateVersion: effectiveFrom, effectiveFrom, effectiveTo: null })),
      updatedBy: user.uid, updatedAt: serverTimestamp(),
    },
  }));
  return commitInChunks(writes);
}

export async function writeSizeClassRates(rates, effectiveFrom, user) {
  const writes = rates.map((r) => ({
    ref: doc(db, "freightSizeClassRates", sanitizeId(`nimExpress_${r.sizeClass}_${effectiveFrom}`)),
    data: { carrierId: "nimExpress", sizeClass: r.sizeClass, rate: r.rate, rateVersion: effectiveFrom, effectiveFrom, effectiveTo: null, updatedBy: user.uid, updatedAt: serverTimestamp() },
  }));
  return commitInChunks(writes);
}

// `onProgress({ step, done, total })` fires after each stage so the wizard can show progress.
export async function importAll(parsed, effectiveFrom, user, onProgress) {
  const steps = [
    ["carriers", () => seedDefaultCarriers(user)],
    ["rateCards", () => writeRateCards(parsed.rateCards, effectiveFrom, user)],
    ["zoneMap", () => writeZoneMap(parsed.zoneMap.docs, user)],
    ["skuDimensions", () => writeSkuDimensions(parsed.skuDimensions, user)],
    ["businessIdeaGrid", () => writeBusinessIdeaGrid(parsed.businessIdeaGrid, effectiveFrom, user)],
    ["sizeClassRates", () => writeSizeClassRates(parsed.nimRates, effectiveFrom, user)],
  ];
  const results = {};
  for (let i = 0; i < steps.length; i++) {
    const [name, fn] = steps[i];
    results[name] = await fn();
    onProgress?.({ step: name, index: i + 1, total: steps.length, count: results[name] });
  }
  return results;
}
