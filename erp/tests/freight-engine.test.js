// ===================================================================
// freight-engine.test.js — run with: node --test erp/tests/freight-engine.test.js
// Node's built-in test runner + assert, no extra dependency (repo requires
// Node >=18 already). Fixtures for Best/KEX use the real numbers read
// straight out of Shipping Price.xlsx (sheets "Best" and "KEX") so this
// also acts as a regression check against the source rate cards.
// ===================================================================
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  STATUS, CONFIDENCE, roundMoney, roundWeight, computeVolumetricWeight,
  validateOrderInput, resolveZone, lookupWeightZoneRate, lookupSkuGridRate,
  lookupSizeClassRate, findOverlappingRateCards, calculateFreight,
  runCalculationWithValidation, calculateFreightForOrder, runOrderCalculationWithValidation,
} from "../js/freight-engine.js";

// ---------- fixtures ----------

// Real "Best" sheet rows (weight kg -> [BKK, UPC]): 1:22.4/28.8 2:26.4/32.8 3:30.4/36.8
function bestRateCards() {
  const rows = [
    [1, 22.4, 28.8], [2, 26.4, 32.8], [3, 30.4, 36.8], [4, 46.4, 46.4], [5, 46.4, 46.4], [6, 54.4, 54.4],
  ];
  const out = [];
  let prev = 0;
  for (const [w, bkk, upc] of rows) {
    out.push({ carrierId: "best", zone: "BKK", weightFrom: prev + 0.01, weightTo: w, rate: bkk, rateVersion: "2026-01" });
    out.push({ carrierId: "best", zone: "UPC", weightFrom: prev + 0.01, weightTo: w, rate: upc, rateVersion: "2026-01" });
    prev = w;
  }
  return out;
}

// Real "KEX" sheet: single national column, rows 1..100 kg -> baht (verified rows 1-9, 94-100)
function kexRateCards() {
  const known = { 1: 22, 2: 26, 3: 32, 4: 39, 5: 45, 6: 51, 7: 57, 8: 63, 94: 974, 95: 989, 96: 1004, 97: 1019, 98: 1034, 99: 1049, 100: 1064 };
  const out = [];
  let prev = 0;
  for (const w of Object.keys(known).map(Number).sort((a, b) => a - b)) {
    out.push({ carrierId: "kex", zone: "ALL", weightFrom: prev + 0.01, weightTo: w, rate: known[w], rateVersion: "2026-01" });
    prev = w;
  }
  return out;
}

const bestCarrier = { id: "best", name: "Best Express", pricingStrategy: "WEIGHT_ZONE_TABLE", weightRule: "MAX_ACTUAL_VOLUMETRIC", dimFactor: 5000, roundingRule: { mode: "CEIL_TO", step: 1 } };
const kexCarrier = { id: "kex", name: "KEX Express", pricingStrategy: "WEIGHT_ZONE_TABLE", weightRule: "ACTUAL", roundingRule: { mode: "CEIL_TO", step: 1 } };

const bkkZoneMap = { carrierZones: { best: "BKK", kex: "ALL" }, remoteAreaByCarrier: {}, zoneSource: { best: "exact", kex: "exact" } };

describe("weight & money helpers", () => {
  test("roundMoney rounds to 2 decimals safely", () => {
    assert.equal(roundMoney(30.455), 30.46);
    assert.equal(roundMoney(null), 0);
  });

  test("roundWeight CEIL_TO 1kg — the spec's own worked example (§35): 2.13kg with dims 30x20x20 / DIM 5000", () => {
    const vol = computeVolumetricWeight(30, 20, 20, 5000);
    assert.equal(vol, 2.4);
    const chargeable = Math.max(2.13, vol);
    assert.equal(roundWeight(chargeable, { mode: "CEIL_TO", step: 1 }), 3);
  });

  test("roundWeight BRACKET mode returns null when no bracket matches (never guesses)", () => {
    const rule = { mode: "BRACKET", brackets: [{ from: 0, to: 1, value: 1 }, { from: 1.01, to: 2, value: 2 }] };
    assert.equal(roundWeight(5, rule), null);
  });
});

describe("validation (spec §14)", () => {
  test("rejects missing/invalid weight, bad dimensions, missing destination", () => {
    const errors = validateOrderInput({ carrierId: "best" });
    assert.ok(errors.some((e) => e.code === "WEIGHT_MISSING"));
    assert.ok(errors.some((e) => e.code === "DESTINATION_MISSING"));
  });
  test("rejects zero/negative weight", () => {
    const errors = validateOrderInput({ carrierId: "best", province: "Bangkok", actualWeightKg: 0 });
    assert.ok(errors.some((e) => e.code === "WEIGHT_INVALID"));
  });
  test("rejects zero dimension", () => {
    const errors = validateOrderInput({ carrierId: "best", province: "Bangkok", actualWeightKg: 1, lengthCm: 0 });
    assert.ok(errors.some((e) => e.code === "DIMENSION_INVALID"));
  });
});

describe("zone resolution", () => {
  test("resolves a known carrier zone", () => {
    const z = resolveZone(bkkZoneMap, "best");
    assert.deepEqual(z, { found: true, zoneKey: "BKK", isRemoteArea: false, source: "exact" });
  });
  test("reports not-found instead of guessing when carrier has no mapping", () => {
    const z = resolveZone(bkkZoneMap, "unknown_carrier");
    assert.equal(z.found, false);
  });
  test("reports not-found when there is no zone map entry at all", () => {
    assert.equal(resolveZone(null, "best").found, false);
  });
});

describe("weight+zone rate lookup — real Best/KEX numbers", () => {
  test("Best BKK 2kg -> 26.4 baht", () => {
    const row = lookupWeightZoneRate(bestRateCards(), { carrierId: "best", zoneKey: "BKK", weight: 2, shipDate: "2026-03-01" });
    assert.equal(row.rate, 26.4);
  });
  test("Best UPC 6kg -> 54.4 baht", () => {
    const row = lookupWeightZoneRate(bestRateCards(), { carrierId: "best", zoneKey: "UPC", weight: 6, shipDate: "2026-03-01" });
    assert.equal(row.rate, 54.4);
  });
  test("KEX 94kg -> 974 baht, 100kg -> 1064 baht", () => {
    assert.equal(lookupWeightZoneRate(kexRateCards(), { carrierId: "kex", zoneKey: "ALL", weight: 94, shipDate: "2026-03-01" }).rate, 974);
    assert.equal(lookupWeightZoneRate(kexRateCards(), { carrierId: "kex", zoneKey: "ALL", weight: 100, shipDate: "2026-03-01" }).rate, 1064);
  });
  test("returns null (never guesses) when weight exceeds every bracket", () => {
    assert.equal(lookupWeightZoneRate(kexRateCards(), { carrierId: "kex", zoneKey: "ALL", weight: 150, shipDate: "2026-03-01" }), null);
  });
});

describe("effective-dated rate versions (spec §7)", () => {
  const versions = [
    { carrierId: "best", zone: "BKK", weightFrom: 0.01, weightTo: 1, rate: 35, rateVersion: "v1", effectiveFrom: "2026-01-01", effectiveTo: "2026-06-30" },
    { carrierId: "best", zone: "BKK", weightFrom: 0.01, weightTo: 1, rate: 40, rateVersion: "v2", effectiveFrom: "2026-07-01", effectiveTo: null },
  ];
  test("order shipped 2026-06-30 uses v1 (35)", () => {
    const row = lookupWeightZoneRate(versions, { carrierId: "best", zoneKey: "BKK", weight: 1, shipDate: "2026-06-30" });
    assert.equal(row.rate, 35);
  });
  test("order shipped 2026-07-01 uses v2 (40) — must NOT use current rate for past orders and vice versa", () => {
    const row = lookupWeightZoneRate(versions, { carrierId: "best", zoneKey: "BKK", weight: 1, shipDate: "2026-07-01" });
    assert.equal(row.rate, 40);
  });
  test("order shipped before any version exists -> RATE_NOT_FOUND, not the nearest version", () => {
    const row = lookupWeightZoneRate(versions, { carrierId: "best", zoneKey: "BKK", weight: 1, shipDate: "2025-12-31" });
    assert.equal(row, null);
  });
});

describe("SKU zone-grid lookup (Business Idea) — never auto-picks a bracket", () => {
  const skuGrid = [
    { sku: "EMS0000000077", zone: "กรุงเทพฯ ปริมณฑล", bracketLabel: "27.00-29.99", rate: 910, rateVersion: "v1" },
    { sku: "EMS0000000077", zone: "กรุงเทพฯ ปริมณฑล", bracketLabel: "30.00-31.99", rate: 956, rateVersion: "v1" },
  ];
  test("without a bracket selection, returns needsBracket with the real options instead of guessing", () => {
    const r = lookupSkuGridRate(skuGrid, { sku: "EMS0000000077", zoneKey: "กรุงเทพฯ ปริมณฑล" });
    assert.equal(r.needsBracket, true);
    assert.deepEqual(r.availableBrackets, ["27.00-29.99", "30.00-31.99"]);
  });
  test("with an explicit bracket, returns the exact matching rate", () => {
    const r = lookupSkuGridRate(skuGrid, { sku: "EMS0000000077", zoneKey: "กรุงเทพฯ ปริมณฑล", bracketLabel: "30.00-31.99" });
    assert.equal(r.rate, 956);
  });
  test("unknown SKU returns null (not a needsBracket with an empty list)", () => {
    const r = lookupSkuGridRate(skuGrid, { sku: "NOPE", zoneKey: "กรุงเทพฯ ปริมณฑล" });
    assert.equal(r, null);
  });

  // A SKU that ships two different ways (e.g. a mattress flat/unfolded vs. boxed) prices
  // differently per way — the real Shipping Price.xlsx has exactly this shape.
  const multiTypeGrid = [
    { sku: "AHM0000000007", type: "ที่นอนกาง", zone: "BKK", bracketLabel: "20.00-21.99", rate: 560 },
    { sku: "AHM0000000007", type: "สินค้าอยู่ในกล่อง", zone: "BKK", bracketLabel: "20.00-21.99", rate: 135 },
  ];
  test("a SKU with more than one shipping type needs the type selected before it'll even ask for a bracket", () => {
    const r = lookupSkuGridRate(multiTypeGrid, { sku: "AHM0000000007", zoneKey: "BKK" });
    assert.equal(r.needsType, true);
    assert.deepEqual(r.availableTypes.sort(), ["สินค้าอยู่ในกล่อง", "ที่นอนกาง"].sort());
  });
  test("with both type and bracket given, resolves the exact rate for that type", () => {
    const r = lookupSkuGridRate(multiTypeGrid, { sku: "AHM0000000007", zoneKey: "BKK", type: "สินค้าอยู่ในกล่อง", bracketLabel: "20.00-21.99" });
    assert.equal(r.rate, 135);
  });
});

describe("size-class lookup (Nim-express)", () => {
  const rates = [{ sizeClass: "C", rate: 200 }, { sizeClass: "D", rate: 250 }];
  test("known class resolves", () => assert.equal(lookupSizeClassRate(rates, { sizeClass: "C" }).rate, 200));
  test("unknown class returns null, not a default", () => assert.equal(lookupSizeClassRate(rates, { sizeClass: "Z" }), null));
});

describe("rate card overlap validation (spec §23)", () => {
  const existing = [{ id: "r1", carrierId: "best", zone: "BKK", weightFrom: 0.01, weightTo: 2, effectiveFrom: "2026-01-01", effectiveTo: null }];
  test("flags an overlapping weight range + date range", () => {
    const conflicts = findOverlappingRateCards({ id: "r2", carrierId: "best", zone: "BKK", weightFrom: 1, weightTo: 3, effectiveFrom: "2026-02-01", effectiveTo: null }, existing);
    assert.equal(conflicts.length, 1);
  });
  test("does not flag a non-overlapping weight range", () => {
    const conflicts = findOverlappingRateCards({ id: "r3", carrierId: "best", zone: "BKK", weightFrom: 2.01, weightTo: 4, effectiveFrom: "2026-01-01", effectiveTo: null }, existing);
    assert.equal(conflicts.length, 0);
  });
  test("does not flag itself when re-validating an edit", () => {
    const conflicts = findOverlappingRateCards({ id: "r1", carrierId: "best", zone: "BKK", weightFrom: 0.01, weightTo: 2, effectiveFrom: "2026-01-01", effectiveTo: null }, existing);
    assert.equal(conflicts.length, 0);
  });
});

describe("calculateFreight — full pipeline", () => {
  function masterData(overrides = {}) {
    return { carrier: bestCarrier, service: null, zoneMapEntry: bkkZoneMap, skuDim: null, rateCards: bestRateCards(), skuGrid: [], sizeClassRates: [], surcharges: [], codRules: [], bulkyThreshold: null, ...overrides };
  }

  test("normal shipment: 2.13kg, no dims -> Best BKK rounds up to 3kg -> 30.4 baht", () => {
    const result = calculateFreight({ carrierId: "best", postalCode: "10100", province: "กรุงเทพฯ", actualWeightKg: 2.13, shipDate: "2026-03-01" }, masterData());
    assert.equal(result.status, STATUS.CALCULATED);
    assert.equal(result.chargeableWeight, 3);
    assert.equal(result.baseFreight, 30.4);
    assert.equal(result.totalFreight, 30.4);
    assert.equal(result.confidence, CONFIDENCE.HIGH);
  });

  test("volumetric wins over actual weight when bulkier", () => {
    // 30x20x20 / 5000 = 2.4kg volumetric vs 1kg actual -> chargeable rounds to 3kg (matches spec §35/36 example)
    const result = calculateFreight({ carrierId: "best", postalCode: "10100", province: "กรุงเทพฯ", actualWeightKg: 1, lengthCm: 30, widthCm: 20, heightCm: 20, shipDate: "2026-03-01" }, masterData());
    assert.equal(result.volumetricWeight, 2.4);
    assert.equal(result.chargeableWeight, 3);
    assert.equal(result.baseFreight, 30.4);
  });

  test("heavy shipment via KEX (national table, no zone split): 94kg -> 974 baht", () => {
    const result = calculateFreight({ carrierId: "kex", postalCode: "10100", province: "กรุงเทพฯ", actualWeightKg: 94, shipDate: "2026-03-01" }, masterData({ carrier: kexCarrier, rateCards: kexRateCards() }));
    assert.equal(result.status, STATUS.CALCULATED);
    assert.equal(result.baseFreight, 974);
  });

  test("fuel surcharge + COD with min/max fee stack correctly on top of base freight", () => {
    const surcharges = [{ id: "s1", carrierId: "best", type: "FUEL", calcType: "PERCENT", value: 0.07, effectiveFrom: null, effectiveTo: null }];
    const codRules = [{ carrierId: "best", percent: 0.02, minFee: 10, maxFee: 100, effectiveFrom: null, effectiveTo: null }];
    const result = calculateFreight({ carrierId: "best", postalCode: "10100", province: "กรุงเทพฯ", actualWeightKg: 2, codAmount: 2000, shipDate: "2026-03-01" }, masterData({ surcharges, codRules }));
    assert.equal(result.baseFreight, 26.4);
    assert.equal(result.fuelSurcharge, roundMoney(26.4 * 0.07));
    assert.equal(result.codFee, 40); // 2000*2% = 40, within [10,100]
    assert.equal(result.totalFreight, roundMoney(26.4 + result.fuelSurcharge + 40));
  });

  test("COD fee clamps to the configured minimum", () => {
    const codRules = [{ carrierId: "best", percent: 0.02, minFee: 15, maxFee: 100 }];
    const result = calculateFreight({ carrierId: "best", postalCode: "10100", province: "กรุงเทพฯ", actualWeightKg: 1, codAmount: 100, shipDate: "2026-03-01" }, masterData({ codRules }));
    assert.equal(result.codFee, 15); // 100*2%=2, clamped up to min 15
  });

  test("COD fee clamps to the configured maximum", () => {
    const codRules = [{ carrierId: "best", percent: 0.02, minFee: 10, maxFee: 50 }];
    const result = calculateFreight({ carrierId: "best", postalCode: "10100", province: "กรุงเทพฯ", actualWeightKg: 1, codAmount: 10000, shipDate: "2026-03-01" }, masterData({ codRules }));
    assert.equal(result.codFee, 50); // 10000*2%=200, clamped down to max 50
  });

  test("COD amount present but no COD rule configured -> MANUAL_REVIEW, never a guessed fee", () => {
    const result = calculateFreight({ carrierId: "best", postalCode: "10100", province: "กรุงเทพฯ", actualWeightKg: 1, codAmount: 500, shipDate: "2026-03-01" }, masterData());
    assert.equal(result.status, STATUS.MANUAL_REVIEW);
    assert.equal(result.totalFreight, null);
  });

  test("bulky detection warns but never silently switches the total to a different rate table", () => {
    // KEX has no dimFactor configured, so volumetric weight stays null and chargeable
    // weight is unaffected by the oversized dims — isolates the bulky-length warning
    // from weight-driven RATE_NOT_FOUND (a separate scenario covered above).
    const bulkyThreshold = { maxLengthCm: 150 };
    const result = calculateFreight(
      { carrierId: "kex", postalCode: "10100", province: "กรุงเทพฯ", actualWeightKg: 6, lengthCm: 190, widthCm: 25, heightCm: 25, shipDate: "2026-03-01" },
      masterData({ carrier: kexCarrier, rateCards: kexRateCards(), bulkyThreshold })
    );
    assert.equal(result.warnings.length, 1);
    assert.equal(result.confidence, CONFIDENCE.MEDIUM);
    assert.equal(result.status, STATUS.CALCULATED); // still calculated on the service the user picked — just flagged
    assert.equal(result.baseFreight, 51);
  });

  test("unmapped postal code -> ZONE_NOT_FOUND, not a default zone", () => {
    const result = calculateFreight({ carrierId: "best", postalCode: "99999", province: "?", actualWeightKg: 1, shipDate: "2026-03-01" }, masterData({ zoneMapEntry: null }));
    assert.equal(result.status, STATUS.ZONE_NOT_FOUND);
    assert.equal(result.totalFreight, null);
  });

  test("weight above every rate bracket -> RATE_NOT_FOUND, not the nearest bracket", () => {
    const result = calculateFreight({ carrierId: "best", postalCode: "10100", province: "กรุงเทพฯ", actualWeightKg: 500, shipDate: "2026-03-01" }, masterData());
    assert.equal(result.status, STATUS.RATE_NOT_FOUND);
    assert.equal(result.totalFreight, null);
  });

  test("SKU zone-grid carrier without a bracket selection stops for MANUAL_REVIEW", () => {
    const skuCarrier = { id: "bi", name: "Business Idea", pricingStrategy: "SKU_ZONE_GRID", weightRule: "SKU_GRID", roundingRule: { mode: "NONE" } };
    const skuGrid = [{ sku: "EMS0000000077", zone: "BI_ZONE", bracketLabel: "27.00-29.99", rate: 910 }];
    const zoneMapEntry = { carrierZones: { bi: "BI_ZONE" } };
    const result = calculateFreight({ carrierId: "bi", sku: "EMS0000000077", postalCode: "10100", province: "กรุงเทพฯ", actualWeightKg: 30.4, shipDate: "2026-03-01" }, masterData({ carrier: skuCarrier, zoneMapEntry, skuGrid, rateCards: [] }));
    assert.equal(result.status, STATUS.MANUAL_REVIEW);
    assert.equal(result.errors[0].availableBrackets.length, 1);
  });

  test("SKU zone-grid carrier with multiple shipping types stops for MANUAL_REVIEW asking for the type first", () => {
    const skuCarrier = { id: "bi", name: "Business Idea", pricingStrategy: "SKU_ZONE_GRID", weightRule: "SKU_GRID", roundingRule: { mode: "NONE" } };
    const skuGrid = [
      { sku: "AHM0000000007", type: "ที่นอนกาง", zone: "BI_ZONE", bracketLabel: "20.00-21.99", rate: 560 },
      { sku: "AHM0000000007", type: "สินค้าอยู่ในกล่อง", zone: "BI_ZONE", bracketLabel: "20.00-21.99", rate: 135 },
    ];
    const zoneMapEntry = { carrierZones: { bi: "BI_ZONE" } };
    const result = calculateFreight({ carrierId: "bi", sku: "AHM0000000007", postalCode: "10100", province: "กรุงเทพฯ", actualWeightKg: 20.2, shipDate: "2026-03-01" }, masterData({ carrier: skuCarrier, zoneMapEntry, skuGrid, rateCards: [] }));
    assert.equal(result.status, STATUS.MANUAL_REVIEW);
    assert.equal(result.errors[0].code, "TYPE_REQUIRED");
    assert.equal(result.errors[0].availableTypes.length, 2);
  });

  test("invalid input (zero weight) returns WEIGHT_ERROR before touching any master data", () => {
    const result = calculateFreight({ carrierId: "best", postalCode: "10100", province: "กรุงเทพฯ", actualWeightKg: 0 }, masterData());
    assert.equal(result.status, STATUS.WEIGHT_ERROR);
  });

  test("missing carrier config -> DATA_ERROR", () => {
    const result = calculateFreight({ carrierId: "nope", postalCode: "10100", province: "กรุงเทพฯ", actualWeightKg: 1 }, masterData({ carrier: null }));
    assert.equal(result.status, STATUS.DATA_ERROR);
  });
});

describe("SKU_SIZE_CLASS carriers price flat, with no zone dimension (Nim-express)", () => {
  const nimCarrier = { id: "nim", name: "Nim-express", pricingStrategy: "SKU_SIZE_CLASS", weightRule: "SIZE_CLASS", roundingRule: { mode: "NONE" } };
  const sizeClassRates = [{ sizeClass: "C", rate: 200 }, { sizeClass: "D", rate: 250 }];

  test("calculates successfully even with no zone map entry at all for this postal code", () => {
    const skuDim = { sku: "AHM0000000001", weightKg: 21, sizeClass: "C" };
    const masterData = { carrier: nimCarrier, zoneMapEntry: null, skuDim, rateCards: [], skuGrid: [], sizeClassRates, surcharges: [], codRules: [], bulkyThreshold: null };
    const result = calculateFreight({ carrierId: "nim", sku: "AHM0000000001", postalCode: "99999", province: "?", shipDate: "2026-03-01" }, masterData);
    assert.equal(result.status, STATUS.CALCULATED);
    assert.equal(result.baseFreight, 200);
    assert.equal(result.zone, null); // no zone concept for this carrier — must be null, not undefined (Firestore rejects undefined)
  });

  test("SKU with no assigned size class -> RATE_NOT_FOUND, never guesses a class", () => {
    const masterData = { carrier: nimCarrier, zoneMapEntry: null, skuDim: { sku: "UNKNOWN", weightKg: 5 }, rateCards: [], skuGrid: [], sizeClassRates, surcharges: [], codRules: [], bulkyThreshold: null };
    const result = calculateFreight({ carrierId: "nim", sku: "UNKNOWN", postalCode: "10100", province: "กรุงเทพฯ", shipDate: "2026-03-01" }, masterData);
    assert.equal(result.status, STATUS.RATE_NOT_FOUND);
  });

  // Real bug caught while building multi-item order support: a SKU priced purely by size
  // class (this carrier never uses weight to price) still failed with WEIGHT_ERROR if no
  // weight existed anywhere — blocking a perfectly priceable SKU on data the carrier never
  // reads. Weight should only be REQUIRED for carriers whose weightRule actually uses it.
  test("prices successfully with NO weight anywhere — this carrier's rate lookup never uses weight", () => {
    const skuDim = { sku: "NOWEIGHT", sizeClass: "D" }; // no weightKg field at all
    const masterData = { carrier: nimCarrier, zoneMapEntry: null, skuDim, rateCards: [], skuGrid: [], sizeClassRates, surcharges: [], codRules: [], bulkyThreshold: null };
    const result = calculateFreight({ carrierId: "nim", sku: "NOWEIGHT", postalCode: "10100", province: "กรุงเทพฯ", shipDate: "2026-03-01" }, masterData);
    assert.equal(result.status, STATUS.CALCULATED);
    assert.equal(result.baseFreight, 250);
    assert.equal(result.actualWeight, null);
    assert.equal(result.chargeableWeight, null);
  });
});

describe("weight is only required for carriers whose weightRule actually uses it", () => {
  test("a WEIGHT_ZONE_TABLE carrier still requires weight (unchanged behavior)", () => {
    const masterData = { carrier: bestCarrier, zoneMapEntry: bkkZoneMap, rateCards: bestRateCards(), skuGrid: [], sizeClassRates: [], surcharges: [], codRules: [], bulkyThreshold: null };
    const result = calculateFreight({ carrierId: "best", postalCode: "10100", province: "กรุงเทพฯ" }, masterData);
    assert.equal(result.status, STATUS.WEIGHT_ERROR);
  });

  test("a SKU_ZONE_GRID carrier (Business Idea) prices successfully with no weight anywhere, given an explicit bracket", () => {
    const biCarrier = { id: "businessIdea", name: "Business Idea", pricingStrategy: "SKU_ZONE_GRID", weightRule: "SKU_GRID", roundingRule: { mode: "NONE" } };
    const skuGrid = [{ sku: "BI1", zone: "BI_ZONE", bracketLabel: "27.00-29.99", rate: 900 }];
    const zoneMapEntry = { carrierZones: { businessIdea: "BI_ZONE" } };
    const result = calculateFreight(
      { carrierId: "businessIdea", sku: "BI1", weightBracketLabel: "27.00-29.99", postalCode: "10100", province: "กรุงเทพฯ", shipDate: "2026-03-01" },
      { carrier: biCarrier, zoneMapEntry, skuDim: null, rateCards: [], skuGrid, sizeClassRates: [], surcharges: [], codRules: [], bulkyThreshold: null }
    );
    assert.equal(result.status, STATUS.CALCULATED);
    assert.equal(result.baseFreight, 900);
  });
});

describe("double-calculation validation (spec §13)", () => {
  test("recomputing the same input twice yields an identical, confirmable result", () => {
    const masterData = { carrier: bestCarrier, zoneMapEntry: bkkZoneMap, rateCards: bestRateCards(), skuGrid: [], sizeClassRates: [], surcharges: [], codRules: [], bulkyThreshold: null };
    const input = { carrierId: "best", postalCode: "10100", province: "กรุงเทพฯ", actualWeightKg: 2, shipDate: "2026-03-01" };
    const result = runCalculationWithValidation(input, masterData);
    assert.equal(result.status, STATUS.CALCULATED);
    assert.equal(result.totalFreight, calculateFreight(input, masterData).totalFreight);
  });
});

describe("calculateFreightForOrder — multi-item orders (spec §1: an order is usually several SKUs)", () => {
  test("empty items array -> DATA_ERROR, never silently computes zero", () => {
    const result = calculateFreightForOrder({ carrierId: "best", items: [] }, { carrier: bestCarrier });
    assert.equal(result.status, STATUS.DATA_ERROR);
    assert.equal(result.errors[0].code, "ITEMS_REQUIRED");
  });

  test("missing carrier -> DATA_ERROR", () => {
    const result = calculateFreightForOrder({ carrierId: "nope", items: [{ actualWeightKg: 1 }] }, { carrier: null });
    assert.equal(result.status, STATUS.DATA_ERROR);
  });

  describe("WEIGHT_ZONE_TABLE carriers: one combined shipment, weights and volumes summed", () => {
    function orderMasterData(overrides = {}) {
      return { carrier: bestCarrier, zoneMapEntry: bkkZoneMap, skuDimsBySku: {}, rateCards: bestRateCards(), skuGrid: [], sizeClassRates: [], surcharges: [], codRules: [], bulkyThreshold: null, ...overrides };
    }

    test("sums actual weight across items+quantity, then does ONE rate lookup on the total (Best BKK 1+2kg -> rounds up to 3kg -> 30.4 baht, matching the single-shipment case)", () => {
      const orderInput = {
        carrierId: "best", postalCode: "10100", province: "กรุงเทพฯ", shipDate: "2026-03-01",
        items: [{ sku: "A", actualWeightKg: 1, quantity: 1 }, { sku: "B", actualWeightKg: 2, quantity: 1 }],
      };
      const result = calculateFreightForOrder(orderInput, orderMasterData());
      assert.equal(result.status, STATUS.CALCULATED);
      assert.equal(result.chargeableWeight, 3);
      assert.equal(result.baseFreight, 30.4);
      assert.equal(result.items.length, 2);
    });

    test("quantity multiplies weight per line, not just counted once", () => {
      const orderInput = {
        carrierId: "best", postalCode: "10100", province: "กรุงเทพฯ", shipDate: "2026-03-01",
        items: [{ sku: "A", actualWeightKg: 1, quantity: 3 }], // 3kg total, same as a single 3kg item
      };
      const result = calculateFreightForOrder(orderInput, orderMasterData());
      assert.equal(result.chargeableWeight, 3);
      assert.equal(result.baseFreight, 30.4);
    });

    test("sums VOLUME across differently-shaped items (not raw dimensions) before re-deriving one volumetric weight", () => {
      // Two boxes of 30x20x20 (volume 12000 each) = 24000 total / 5000 DIM = 4.8kg volumetric,
      // vs. actual weight 1kg each = 2kg total -> volumetric wins -> rounds up to 5kg.
      const orderInput = {
        carrierId: "best", postalCode: "10100", province: "กรุงเทพฯ", shipDate: "2026-03-01",
        items: [
          { sku: "A", actualWeightKg: 1, lengthCm: 30, widthCm: 20, heightCm: 20, quantity: 1 },
          { sku: "B", actualWeightKg: 1, lengthCm: 30, widthCm: 20, heightCm: 20, quantity: 1 },
        ],
      };
      const result = calculateFreightForOrder(orderInput, orderMasterData());
      assert.equal(result.chargeableWeight, 5);
    });

    test("falls back to each item's own SKU dimension data when not given manually", () => {
      const orderInput = {
        carrierId: "best", postalCode: "10100", province: "กรุงเทพฯ", shipDate: "2026-03-01",
        items: [{ sku: "A", quantity: 2 }], // no actualWeightKg given — must come from skuDimsBySku
      };
      const result = calculateFreightForOrder(orderInput, orderMasterData({ skuDimsBySku: { A: { weightKg: 1.5 } } }));
      assert.equal(result.status, STATUS.CALCULATED);
      assert.equal(result.chargeableWeight, 3); // 1.5 * 2 = 3, already whole
    });

    test("a line with no weight anywhere (not manual, not in SKU master) -> WEIGHT_ERROR for the whole order", () => {
      const orderInput = { carrierId: "best", postalCode: "10100", province: "กรุงเทพฯ", items: [{ sku: "GHOST" }] };
      const result = calculateFreightForOrder(orderInput, orderMasterData());
      assert.equal(result.status, STATUS.WEIGHT_ERROR);
    });

    test("weight above every rate bracket -> RATE_NOT_FOUND for the combined order, not a guess", () => {
      const orderInput = { carrierId: "best", postalCode: "10100", province: "กรุงเทพฯ", items: [{ actualWeightKg: 500 }] };
      const result = calculateFreightForOrder(orderInput, orderMasterData());
      assert.equal(result.status, STATUS.RATE_NOT_FOUND);
    });
  });

  describe("SKU_ZONE_GRID / SKU_SIZE_CLASS carriers: each line priced independently, surcharges/COD applied once at order level", () => {
    const nimCarrier = { id: "nim", name: "Nim-express", pricingStrategy: "SKU_SIZE_CLASS", weightRule: "SIZE_CLASS", roundingRule: { mode: "NONE" } };
    const sizeClassRates = [{ sizeClass: "C", rate: 200 }, { sizeClass: "D", rate: 250 }];

    function nimOrderMasterData(overrides = {}) {
      return {
        carrier: nimCarrier, zoneMapEntry: null,
        skuDimsBySku: { SKU1: { weightKg: 1, sizeClass: "C" }, SKU2: { weightKg: 1, sizeClass: "D" } },
        rateCards: [], skuGrid: [], sizeClassRates, surcharges: [], codRules: [], bulkyThreshold: null, ...overrides,
      };
    }

    test("two different SKUs each price via their own size class, and sum correctly with quantity", () => {
      const orderInput = {
        carrierId: "nim", postalCode: "10100", province: "กรุงเทพฯ", shipDate: "2026-03-01",
        items: [{ sku: "SKU1", quantity: 2 }, { sku: "SKU2", quantity: 1 }],
      };
      const result = calculateFreightForOrder(orderInput, nimOrderMasterData());
      assert.equal(result.status, STATUS.CALCULATED);
      assert.equal(result.baseFreight, 200 * 2 + 250 * 1); // 650
      assert.equal(result.items.length, 2);
    });

    test("a FIXED surcharge is charged ONCE per order, not once per line item", () => {
      const surcharges = [{ id: "s1", carrierId: "nim", type: "OTHER", calcType: "FIXED", value: 10 }];
      const orderInput = {
        carrierId: "nim", postalCode: "10100", province: "กรุงเทพฯ", shipDate: "2026-03-01",
        items: [{ sku: "SKU1", quantity: 1 }, { sku: "SKU1", quantity: 1 }, { sku: "SKU1", quantity: 1 }], // 3 lines
      };
      const result = calculateFreightForOrder(orderInput, nimOrderMasterData({ surcharges }));
      assert.equal(result.baseFreight, 600); // 200 x 3
      assert.equal(result.otherFee, 10); // NOT 30 — charged once for the order, not per line
      assert.equal(result.totalFreight, 610);
    });

    test("COD is applied once on the order's declared COD amount, not derived per line", () => {
      const codRules = [{ carrierId: "nim", percent: 0.02, minFee: 5, maxFee: 100 }];
      const orderInput = {
        carrierId: "nim", postalCode: "10100", province: "กรุงเทพฯ", shipDate: "2026-03-01", codAmount: 1000,
        items: [{ sku: "SKU1", quantity: 1 }, { sku: "SKU2", quantity: 1 }],
      };
      const result = calculateFreightForOrder(orderInput, nimOrderMasterData({ codRules }));
      assert.equal(result.codFee, 20); // 1000 * 2%, computed once — not once per line
    });

    test("one unpriceable line (unknown SKU) fails the whole order rather than silently pricing only the others", () => {
      const orderInput = {
        carrierId: "nim", postalCode: "10100", province: "กรุงเทพฯ",
        items: [{ sku: "SKU1", quantity: 1 }, { sku: "UNKNOWN", quantity: 1, actualWeightKg: 1 }], // has a weight but no assigned size class
      };
      const result = calculateFreightForOrder(orderInput, nimOrderMasterData());
      assert.equal(result.status, STATUS.RATE_NOT_FOUND);
      assert.equal(result.totalFreight, null);
      // the specific underlying reason (from the failing item's own error) bubbles up as the
      // code, so the UI can react to it the same way it would for a single-item calculation —
      // the message adds which SKU/line it came from.
      assert.equal(result.errors[0].code, "SIZE_CLASS_NOT_FOUND");
      assert.match(result.errors[0].message, /UNKNOWN/);
    });

    test("a Business Idea style line still requires its own bracket/type selection per item — never guessed", () => {
      const biCarrier = { id: "businessIdea", name: "Business Idea", pricingStrategy: "SKU_ZONE_GRID", weightRule: "SKU_GRID", roundingRule: { mode: "NONE" } };
      const skuGrid = [{ sku: "BI1", type: "ตัวสินค้า", zone: "BI_ZONE", bracketLabel: "27.00-29.99", rate: 900 }];
      const zoneMapEntry = { carrierZones: { businessIdea: "BI_ZONE" } };
      const orderInput = {
        carrierId: "businessIdea", postalCode: "10100", province: "กรุงเทพฯ",
        items: [{ sku: "BI1", quantity: 1, actualWeightKg: 30 }], // no weightBracketLabel given
      };
      const result = calculateFreightForOrder(orderInput, { carrier: biCarrier, zoneMapEntry, skuDimsBySku: {}, rateCards: [], skuGrid, sizeClassRates: [], surcharges: [], codRules: [], bulkyThreshold: null });
      assert.equal(result.status, STATUS.MANUAL_REVIEW);
    });
  });

  test("runOrderCalculationWithValidation returns the same result as calling calculateFreightForOrder directly on deterministic input", () => {
    const masterData = { carrier: bestCarrier, zoneMapEntry: bkkZoneMap, skuDimsBySku: {}, rateCards: bestRateCards(), skuGrid: [], sizeClassRates: [], surcharges: [], codRules: [], bulkyThreshold: null };
    const orderInput = { carrierId: "best", postalCode: "10100", province: "กรุงเทพฯ", shipDate: "2026-03-01", items: [{ actualWeightKg: 2 }] };
    const result = runOrderCalculationWithValidation(orderInput, masterData);
    assert.equal(result.status, STATUS.CALCULATED);
    assert.equal(result.totalFreight, calculateFreightForOrder(orderInput, masterData).totalFreight);
  });
});
