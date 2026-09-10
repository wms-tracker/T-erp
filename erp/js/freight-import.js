// ===================================================================
// freight-import.js — parses the specific sheets found in the real
// "Shipping Price.xlsx" (see the approved plan for the full sheet-by-sheet
// breakdown) into the normalized shapes freight-data.js writes to
// Firestore. Pure functions only (rows-in, records-out) — no SheetJS, no
// Firestore, no DOM — so this file is Node-testable on its own; the
// SheetJS parsing (File -> workbook -> rows) and the actual Firestore
// writes live in freight-import-write.js / freight-import.html.
//
// `rows` everywhere means an array-of-arrays exactly like
// `XLSX.utils.sheet_to_json(worksheet, { header: 1 })` returns: rows[r][c],
// 0-indexed, header rows included.
// ===================================================================

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function isBlank(v) {
  return v === undefined || v === null || v === "";
}

function num(v) {
  if (isBlank(v)) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

// The workbook spells the same Business Idea zone two different ways depending on the
// sheet: the Province sheet uses "และ"/"&" ("...และปริมณฑล", "...& ภาคอีสาน") while the
// Business Idea rate-grid sheet uses a plain space or a wrapped newline instead. Verified
// against the real file: exactly 5 zones exist and these are the only textual variants of
// them — collapsing "และ"/"&"/whitespace-runs is reconciling known spelling variants of an
// already-enumerated set, not inventing a new category. Applied on both sides so the
// Province-derived zone map and the Business Idea grid always key-match.
export function canonicalizeZoneLabel(s) {
  if (isBlank(s)) return s;
  return String(s).replace(/\s+/g, " ").replace(/และ/g, "").replace(/&/g, "").replace(/\s+/g, " ").trim();
}

// ---------- weight+zone rate tables: Best / Flash / Kerry / DHLParcel / DHL Bulky ----------
// Sheet shape: row0 = header, row1+ = [weightKg, bkkPrice, upcPrice]. Rows are meant to be
// read as "up to this weight" tiers — weightFrom is derived from the previous row so the
// brackets are contiguous, never left to guesswork about what the source file "meant".
export function parseWeightZoneSheet(rows, carrierId, serviceId) {
  const out = [];
  const warnings = [];
  let prevWeight = 0;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const weight = num(row[0]);
    if (weight == null) continue; // skips blank rows / trailing note rows
    let weightFrom = round2(prevWeight + 0.01);
    let weightTo = weight;
    if (weightTo < weightFrom) {
      warnings.push(`${carrierId}${serviceId ? "/" + serviceId : ""}: แถวน้ำหนัก ${weight} kg ไม่เรียงลำดับต่อเนื่องจากแถวก่อนหน้า (${prevWeight} kg) — ปรับช่วงให้ครอบคลุมแทน ต้องตรวจสอบ Rate Card นี้หลัง Import`);
      weightTo = weightFrom;
    }
    const bkk = num(row[1]);
    const upc = num(row[2]);
    if (bkk != null) out.push({ carrierId, serviceId: serviceId || null, zone: "BKK", weightFrom, weightTo, rate: bkk });
    if (upc != null) out.push({ carrierId, serviceId: serviceId || null, zone: "UPC", weightFrom, weightTo, rate: upc });
    prevWeight = weightTo;
  }
  return { rows: out, warnings };
}

// ---------- KEX: single national rate, no zone split ----------
export function parseKexSheet(rows) {
  const out = [];
  let prevWeight = 0;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const weight = num(row[0]);
    const baht = num(row[1]);
    if (weight == null || baht == null) continue; // skips the trailing "50 KG.+" note rows
    out.push({ carrierId: "kex", serviceId: null, zone: "ALL", weightFrom: round2(prevWeight + 0.01), weightTo: weight, rate: baht });
    prevWeight = weight;
  }
  return out;
}

// ---------- Business Idea: per-SKU zone/bracket grid ----------
// row0 = top header (SKU/Name/Type/Size/Weight, then one non-blank label cell starting
// every bracket group at column>=5), row1 = sub-header naming the 5 zone columns of each
// bracket group, row2+ = data. Bracket columns are discovered from row0 itself — never
// hardcoded — so this keeps working if the workbook adds/removes bracket columns.
export function parseBusinessIdeaSheet(rows) {
  const headerRow = rows[0] || [];
  const subHeaderRow = rows[1] || [];
  const brackets = [];
  for (let c = 5; c < headerRow.length; c++) {
    if (!isBlank(headerRow[c])) brackets.push({ label: String(headerRow[c]).trim(), col: c });
  }
  const out = [];
  for (let r = 2; r < rows.length; r++) {
    const row = rows[r] || [];
    const sku = row[0];
    if (isBlank(sku)) continue;
    const cells = [];
    for (const b of brackets) {
      for (let j = 0; j < 5; j++) {
        const zone = subHeaderRow[b.col + j];
        const rate = num(row[b.col + j]);
        if (!isBlank(zone) && rate != null) {
          cells.push({ bracketLabel: b.label, zone: canonicalizeZoneLabel(zone), rate });
        }
      }
    }
    out.push({
      sku: String(sku).trim(), name: row[1] || "", type: row[2] || "",
      size: row[3] || "", weightKg: num(row[4]), cells,
    });
  }
  return out;
}

// ---------- Nim-express: size-class -> price ----------
// row0 = header, row1+ = [volumeThreshold, "<Class> (description...)", price, code, ...].
// The sheet also carries legacy "BOX L" / "BOX XL-1" style alias rows (rows with no
// volumeThreshold) that just repeat an existing class's code+price under an older name —
// SKU NIM never references these labels, so they're excluded rather than treated as new
// classes. The full label text (not a truncated first token — "Oversize 1" vs "Oversize 4"
// both start with "Oversize") is the size-class key, and it's matched byte-for-byte against
// SKU NIM's own Size column below — an exact string match, never a guessed prefix.
export function parseNimExpressSheet(rows) {
  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const volumeThreshold = num(row[0]);
    const label = row[1];
    const price = num(row[2]);
    if (volumeThreshold == null || isBlank(label) || price == null) continue;
    out.push({ sizeClass: String(label).trim(), rate: price });
  }
  return out;
}

// ---------- SKU NIM: SKU -> physical dims + assigned size class ----------
export function parseSkuNimSheet(rows) {
  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const sku = row[2];
    if (isBlank(sku)) continue;
    const sizeLabel = row[10];
    const sizeClass = !isBlank(sizeLabel) ? String(sizeLabel).trim() : null;
    out.push({
      sku: String(sku).trim(), name: row[3] || "",
      widthCm: num(row[4]), lengthCm: num(row[5]), heightCm: num(row[6]), weightKg: num(row[7]),
      sizeClass,
    });
  }
  return out;
}

// ---------- Product: SKU -> physical dims only (no pre-computed carrier cost columns) ----------
// Each SKU can appear as a "Product" row and/or a "BOX" row (packaging dims differ from the
// bare product) — the BOX row is what actually ships, so it wins when both exist.
export function parseProductSheet(rows) {
  const bySku = new Map();
  for (let r = 3; r < rows.length; r++) {
    const row = rows[r] || [];
    const sku = row[1];
    if (isBlank(sku)) continue;
    const type = String(row[3] || "");
    const rec = {
      sku: String(sku).trim(), name: row[2] || "", type,
      widthCm: num(row[4]), lengthCm: num(row[5]), heightCm: num(row[6]), weightKg: num(row[8]),
    };
    const existing = bySku.get(rec.sku);
    if (!existing || /box/i.test(type)) bySku.set(rec.sku, rec);
  }
  return [...bySku.values()];
}

// ---------- Province: zipcode -> per-carrier zone label (raw rows, before dedupe) ----------
export function parseProvinceSheet(rows) {
  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const zipRaw = row[0];
    if (isBlank(zipRaw)) continue;
    const zip = num(zipRaw);
    if (zip == null) continue;
    out.push({
      postalCode: String(Math.round(zip)).padStart(5, "0"),
      district: row[1] || "", region: row[2] || "",
      biZone: row[3] || "", bestZoneType: row[4] || "", bestBkkUpc: row[5] || "",
      dhlZoneRaw: row[6] || "", nimZoneRaw: row[7] || "", kerryZoneRaw: row[8] || "",
    });
  }
  return out;
}

const BKK_METRO_LABEL = canonicalizeZoneLabel("กรุงเทพฯ และปริมณฑล");
function deriveBkkUpc(biZone) {
  return canonicalizeZoneLabel(biZone) === BKK_METRO_LABEL ? "BKK" : "UPC";
}
function isRemoteLabel(v) {
  return !isBlank(v) && v !== "โซนปกติ";
}

// Collapses Province's per-district rows into one freightZoneMap doc per postal code.
// Carriers without their own BKK/UPC column in the sheet (Flash/DHL/Kerry — Flash has none
// at all) get it *derived* from the Business Idea column, which is flagged in the doc
// (zoneSource) and in the calculator's trace — never silently presented as exact data.
// Conflicting carrier-zone values seen across rows sharing a zipcode are collected into
// `conflicts` for the import preview to surface, not resolved automatically.
export function buildZoneMapDocs(provinceRows) {
  const byZip = new Map();
  const conflicts = [];
  for (const row of provinceRows) {
    const derived = deriveBkkUpc(row.biZone);
    const candidate = {
      postalCode: row.postalCode, province: row.district, region: row.region,
      carrierZones: {
        businessIdea: canonicalizeZoneLabel(row.biZone) || null,
        best: row.bestBkkUpc || derived,
        flash: derived,
        kex: "ALL",
        dhl: derived,
        kerry: derived,
      },
      remoteAreaByCarrier: {
        best: isRemoteLabel(row.bestZoneType),
        dhl: isRemoteLabel(row.dhlZoneRaw),
        kerry: isRemoteLabel(row.kerryZoneRaw),
      },
      zoneSource: { businessIdea: "exact", best: "exact", flash: "derived", kex: "exact", dhl: "derived", kerry: "derived" },
      districts: [row.district],
    };
    const existing = byZip.get(row.postalCode);
    if (!existing) {
      byZip.set(row.postalCode, candidate);
      continue;
    }
    existing.districts.push(row.district);
    for (const key of Object.keys(candidate.carrierZones)) {
      if (existing.carrierZones[key] !== candidate.carrierZones[key]) {
        conflicts.push({ postalCode: row.postalCode, field: `carrierZones.${key}`, values: [existing.carrierZones[key], candidate.carrierZones[key]] });
      }
    }
  }
  return { docs: [...byZip.values()], conflicts };
}

// ---------- merge Product's physical dims with SKU NIM's size-class assignment ----------
// Product sheet covers the general catalog; SKU NIM only covers SKUs Nim-express ships.
// Product's own dims win when both exist (it's the general-purpose catalog); SKU NIM fills
// in the size class always, and fills in any dim Product left blank.
export function mergeSkuDimensions(productDims, skuNimList) {
  const bySku = new Map();
  for (const p of productDims) {
    bySku.set(p.sku, { sku: p.sku, name: p.name, widthCm: p.widthCm, lengthCm: p.lengthCm, heightCm: p.heightCm, weightKg: p.weightKg, sizeClass: null });
  }
  for (const n of skuNimList) {
    const existing = bySku.get(n.sku);
    if (existing) {
      existing.sizeClass = n.sizeClass || existing.sizeClass;
      if (existing.widthCm == null) existing.widthCm = n.widthCm;
      if (existing.lengthCm == null) existing.lengthCm = n.lengthCm;
      if (existing.heightCm == null) existing.heightCm = n.heightCm;
      if (existing.weightKg == null) existing.weightKg = n.weightKg;
    } else {
      bySku.set(n.sku, { sku: n.sku, name: n.name, widthCm: n.widthCm, lengthCm: n.lengthCm, heightCm: n.heightCm, weightKg: n.weightKg, sizeClass: n.sizeClass || null });
    }
  }
  return [...bySku.values()];
}

// ---------- default carrier configs (weight rule / rounding rule — not derivable from the
// sheet's price numbers themselves, so these are an explicit, documented, admin-editable
// starting assumption: standard MAX(actual, volumetric) with a 5,000 DIM factor and
// round-up-to-1kg, matching the spec's own worked example — never silently baked into a
// price). Only used to seed a carrier on its FIRST import; re-importing never overwrites an
// admin's later edits to these (see freight-import-write.js: seedDefaultCarriers skips any
// carrier id that already exists).
const STANDARD_WEIGHT_ZONE_DEFAULTS = { pricingStrategy: "WEIGHT_ZONE_TABLE", weightRule: "MAX_ACTUAL_VOLUMETRIC", dimFactor: 5000, roundingRule: { mode: "CEIL_TO", step: 1 } };

export const DEFAULT_CARRIERS = [
  { id: "best", name: "Best Express", ...STANDARD_WEIGHT_ZONE_DEFAULTS, services: [] },
  { id: "flash", name: "Flash Express", ...STANDARD_WEIGHT_ZONE_DEFAULTS, services: [] },
  { id: "kerry", name: "Kerry Express", ...STANDARD_WEIGHT_ZONE_DEFAULTS, services: [] },
  { id: "kex", name: "KEX Express", ...STANDARD_WEIGHT_ZONE_DEFAULTS, services: [] },
  { id: "dhl", name: "DHL", ...STANDARD_WEIGHT_ZONE_DEFAULTS, services: [{ id: "parcel", name: "Parcel" }, { id: "bulky", name: "Bulky / Oversize" }] },
  { id: "businessIdea", name: "Business Idea", pricingStrategy: "SKU_ZONE_GRID", weightRule: "SKU_GRID", roundingRule: { mode: "NONE" }, services: [] },
  { id: "nimExpress", name: "Nim-express", pricingStrategy: "SKU_SIZE_CLASS", weightRule: "SIZE_CLASS", roundingRule: { mode: "NONE" }, services: [] },
];

// ---------- top-level: parse every relevant sheet from a { sheetName: rows } map ----------
export function parseWorkbook(sheets) {
  const warnings = [];
  const rateCards = [];

  const best = parseWeightZoneSheet(sheets["Best"] || [], "best", null);
  rateCards.push(...best.rows); warnings.push(...best.warnings);

  const flash = parseWeightZoneSheet(sheets["Flash"] || [], "flash", null);
  rateCards.push(...flash.rows); warnings.push(...flash.warnings);

  const kerry = parseWeightZoneSheet(sheets["Kerry"] || [], "kerry", null);
  rateCards.push(...kerry.rows); warnings.push(...kerry.warnings);

  const dhlParcel = parseWeightZoneSheet(sheets["DHLParcel"] || [], "dhl", "parcel");
  rateCards.push(...dhlParcel.rows); warnings.push(...dhlParcel.warnings);

  const dhlBulky = parseWeightZoneSheet(sheets["DHL Bulky"] || [], "dhl", "bulky");
  rateCards.push(...dhlBulky.rows); warnings.push(...dhlBulky.warnings);

  const kex = parseKexSheet(sheets["KEX"] || []);
  rateCards.push(...kex);

  const businessIdeaGrid = parseBusinessIdeaSheet(sheets["Business Idea"] || []);
  const nimRates = parseNimExpressSheet(sheets["Nim-express"] || []);
  const skuNim = parseSkuNimSheet(sheets["SKU NIM"] || []);
  const productDims = parseProductSheet(sheets["Product"] || []);
  const provinceRows = parseProvinceSheet(sheets["Province"] || []);
  const zoneMap = buildZoneMapDocs(provinceRows);
  const skuDimensions = mergeSkuDimensions(productDims, skuNim);

  return { rateCards, businessIdeaGrid, nimRates, skuNim, productDims, skuDimensions, zoneMap, warnings };
}

export function summarizeParsedWorkbook(parsed) {
  return {
    rateCardRows: parsed.rateCards.length,
    businessIdeaSkus: parsed.businessIdeaGrid.length,
    businessIdeaCells: parsed.businessIdeaGrid.reduce((a, r) => a + r.cells.length, 0),
    nimSizeClasses: parsed.nimRates.length,
    skuNimCount: parsed.skuNim.length,
    productDimCount: parsed.productDims.length,
    skuDimensionCount: parsed.skuDimensions.length,
    zoneMapEntries: parsed.zoneMap.docs.length,
    zoneMapConflicts: parsed.zoneMap.conflicts.length,
    parseWarnings: parsed.warnings.length,
  };
}
