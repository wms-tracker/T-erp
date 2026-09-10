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
  runCalculationWithValidation,
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
