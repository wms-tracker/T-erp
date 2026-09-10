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

// Firestore rejects doc IDs matching /__.*__/ (reserved), or "." / "..", or empty.
// A label with many non-ASCII characters (e.g. a Thai size-class description) turns into
// long runs of "_" once each disallowed character is replaced — collapsing those runs and
// trimming leading/trailing "_"/"." avoids ever producing a reserved-looking ID.
function sanitizeId(s) {
  const cleaned = String(s)
    .replace(/[^A-Za-z0-9_.-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_.]+|[_.]+$/g, "")
    .slice(0, 300);
  return cleaned || "id";
}

function rateCardId(row, effectiveFrom) {
  return sanitizeId(`${row.carrierId}_${row.serviceId || "x"}_${row.zone}_${row.weightFrom}-${row.weightTo}_${effectiveFrom}`);
}

// Firestore caps a batch at 500 writes AND ~10MiB of encoded request payload — whichever
// hits first. Docs with an embedded array (freightSkuRateGrids' `cells`) can run ~15KB
// each, so count alone isn't a safe chunking rule: 450 of those docs is under 500 writes
// but landed at ~11.5MB encoded and got rejected. Chunk by BOTH count and an estimated byte
// budget (using JSON size as a proxy — Firestore's wire format runs larger than raw JSON
// due to per-field type wrappers, so the budget is set well under the real 10MiB cap).
const MAX_OPS_PER_BATCH = 400;
const MAX_BYTES_PER_BATCH = 3 * 1024 * 1024; // 3MB of JSON ≈ comfortably under the 10MiB wire-format cap

function estimateBytes(data) {
  return new TextEncoder().encode(JSON.stringify(data)).length;
}

async function commitInChunks(writes) {
  let batch = writeBatch(db);
  let opsInBatch = 0;
  let bytesInBatch = 0;

  const flush = async () => {
    if (opsInBatch === 0) return;
    await batch.commit();
    batch = writeBatch(db);
    opsInBatch = 0;
    bytesInBatch = 0;
  };

  for (const w of writes) {
    const size = estimateBytes(w.data);
    if (opsInBatch > 0 && (opsInBatch >= MAX_OPS_PER_BATCH || bytesInBatch + size > MAX_BYTES_PER_BATCH)) {
      await flush();
    }
    batch.set(w.ref, w.data, { merge: true });
    opsInBatch++;
    bytesInBatch += size;
  }
  await flush();
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

// `entries` is parseBusinessIdeaSheet()'s output.entries: one item per SKU, each holding a
// `variants` array (one per shipping Type — the same SKU ships differently, and at a
// different price, e.g. flat/unfolded vs. boxed — see the parser's own comment for why).
export async function writeBusinessIdeaGrid(entries, effectiveFrom, user) {
  const writes = entries.filter((entry) => entry.sku).map((entry) => ({
    ref: doc(db, "freightSkuRateGrids", sanitizeId(entry.sku)),
    data: {
      sku: entry.sku, name: entry.name,
      variants: entry.variants.map((v) => ({
        type: v.type, size: v.size, weightKg: v.weightKg,
        cells: v.cells.map((c) => ({ ...c, rateVersion: effectiveFrom, effectiveFrom, effectiveTo: null })),
      })),
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
    ["businessIdeaGrid", () => writeBusinessIdeaGrid(parsed.businessIdeaGrid.entries, effectiveFrom, user)],
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
