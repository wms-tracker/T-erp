// ===================================================================
// freight-engine.js — Freight Cost Calculation Engine (pure, no DOM,
// no Firestore). Every carrier's pricing rule is data, not code — this
// file only implements the *shapes* of rule a carrier can use
// (weight+zone table / per-SKU zone grid / size-class table) plus the
// shared pieces (volumetric weight, rounding, surcharges, COD, trace).
//
// calculateFreight(input, masterData) is the single entry point and
// matches the contract from the spec (§33): it always returns a result
// object with a `status`, and NEVER invents a rate/zone/fee it could
// not find — a missing lookup becomes a status + trace explanation,
// never a guess (spec §15/45).
// ===================================================================

export const STATUS = {
  CALCULATED: "CALCULATED",
  RATE_NOT_FOUND: "RATE_NOT_FOUND",
  ZONE_NOT_FOUND: "ZONE_NOT_FOUND",
  WEIGHT_ERROR: "WEIGHT_ERROR",
  DIMENSION_ERROR: "DIMENSION_ERROR",
  DATA_ERROR: "DATA_ERROR",
  MANUAL_REVIEW: "MANUAL_REVIEW",
  CALCULATION_ERROR: "CALCULATION_ERROR",
};

export const CONFIDENCE = { HIGH: "HIGH", MEDIUM: "MEDIUM", LOW: "LOW" };

// ---------- money / weight rounding ----------

export function roundMoney(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return 0;
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

// rule: { mode: 'NONE' } | { mode: 'CEIL_TO', step: 1 } | { mode: 'BRACKET', brackets: [{from,to,value}] }
export function roundWeight(weight, rule) {
  if (weight == null || Number.isNaN(Number(weight))) return null;
  const w = round2(weight);
  if (!rule || rule.mode === "NONE") return w;
  if (rule.mode === "CEIL_TO") {
    const step = rule.step || 1;
    return round2(Math.ceil(round2(w / step) - 1e-9) * step);
  }
  if (rule.mode === "BRACKET") {
    const b = (rule.brackets || []).find((x) => w >= x.from && w <= x.to);
    return b ? round2(b.value) : null;
  }
  return w;
}

export function computeVolumetricWeight(lengthCm, widthCm, heightCm, dimFactor) {
  if (!lengthCm || !widthCm || !heightCm || !dimFactor) return null;
  return round2((lengthCm * widthCm * heightCm) / dimFactor);
}

// ---------- validation (spec §14) ----------

export function validateOrderInput(input) {
  const errors = [];
  if (!input.carrierId) errors.push({ code: "CARRIER_MISSING", message: "ต้องเลือก Carrier" });
  if (!input.province && !input.postalCode) {
    errors.push({ code: "DESTINATION_MISSING", message: "ต้องระบุจังหวัดหรือรหัสไปรษณีย์ปลายทาง" });
  }
  const hasWeight = input.actualWeightKg != null;
  if (!hasWeight && !input.sku) {
    errors.push({ code: "WEIGHT_MISSING", message: "ไม่มีน้ำหนักสินค้า (ไม่ได้ระบุน้ำหนักและไม่มี SKU ให้ค้นหา)" });
  } else if (hasWeight && (Number.isNaN(Number(input.actualWeightKg)) || Number(input.actualWeightKg) <= 0)) {
    errors.push({ code: "WEIGHT_INVALID", message: "น้ำหนักสินค้าต้องมากกว่า 0" });
  }
  for (const [field, label] of [["lengthCm", "ความยาว"], ["widthCm", "ความกว้าง"], ["heightCm", "ความสูง"]]) {
    const v = input[field];
    if (v != null && (Number.isNaN(Number(v)) || Number(v) <= 0)) {
      errors.push({ code: "DIMENSION_INVALID", message: `${label} ต้องมากกว่า 0` });
    }
  }
  if (input.codAmount != null && (Number.isNaN(Number(input.codAmount)) || Number(input.codAmount) < 0)) {
    errors.push({ code: "COD_INVALID", message: "ยอด COD ไม่ถูกต้อง" });
  }
  return errors;
}

function errorStatusFromErrors(errors) {
  const codes = errors.map((e) => e.code);
  if (codes.some((c) => c.startsWith("WEIGHT"))) return STATUS.WEIGHT_ERROR;
  if (codes.some((c) => c.startsWith("DIMENSION"))) return STATUS.DIMENSION_ERROR;
  return STATUS.DATA_ERROR;
}

// ---------- zone resolution ----------

// zoneMapEntry: freightZoneMap/{postalCode} doc — { carrierZones: {carrierId: zoneKey}, remoteAreaByCarrier: {carrierId: bool}, zoneSource: {carrierId: 'exact'|'derived'} }
export function resolveZone(zoneMapEntry, carrierId) {
  if (!zoneMapEntry) return { found: false };
  const zoneKey = zoneMapEntry.carrierZones ? zoneMapEntry.carrierZones[carrierId] : undefined;
  if (zoneKey == null || zoneKey === "") return { found: false };
  return {
    found: true,
    zoneKey,
    isRemoteArea: !!(zoneMapEntry.remoteAreaByCarrier && zoneMapEntry.remoteAreaByCarrier[carrierId]),
    source: (zoneMapEntry.zoneSource && zoneMapEntry.zoneSource[carrierId]) || "exact",
  };
}

// ---------- rate lookups (never interpolate / average / default — spec §15) ----------

function isEffective(row, shipDate) {
  if (!shipDate) return true;
  if (row.effectiveFrom && shipDate < row.effectiveFrom) return false;
  if (row.effectiveTo && shipDate > row.effectiveTo) return false;
  return true;
}

// rateCards: [{carrierId, serviceId, zone, weightFrom, weightTo, rate, rateVersion, effectiveFrom, effectiveTo}]
export function lookupWeightZoneRate(rateCards, { carrierId, serviceId, zoneKey, weight, shipDate }) {
  const candidates = (rateCards || []).filter((r) =>
    r.carrierId === carrierId &&
    (r.serviceId == null || r.serviceId === serviceId) &&
    r.zone === zoneKey &&
    isEffective(r, shipDate) &&
    weight >= r.weightFrom && weight <= r.weightTo
  );
  if (!candidates.length) return null;
  candidates.sort((a, b) => String(b.effectiveFrom || "").localeCompare(String(a.effectiveFrom || "")));
  return candidates[0];
}

// skuGrid: [{sku, zone, bracketLabel, bracketMin, bracketMax, rate, rateVersion, effectiveFrom, effectiveTo}]
export function lookupSkuGridRate(skuGrid, { sku, zoneKey, bracketLabel, shipDate }) {
  const rowsForSku = (skuGrid || []).filter((r) => r.sku === sku && isEffective(r, shipDate));
  if (!bracketLabel) {
    return { needsBracket: true, availableBrackets: [...new Set(rowsForSku.map((r) => r.bracketLabel))] };
  }
  const row = rowsForSku.find((r) => r.bracketLabel === bracketLabel && r.zone === zoneKey);
  return row ? { rate: row.rate, rateVersion: row.rateVersion } : null;
}

// sizeClassRates: [{sizeClass, rate, rateVersion, effectiveFrom, effectiveTo}]
export function lookupSizeClassRate(sizeClassRates, { sizeClass, shipDate }) {
  if (!sizeClass) return null;
  return (sizeClassRates || []).find((r) => r.sizeClass === sizeClass && isEffective(r, shipDate)) || null;
}

// ---------- surcharges & COD ----------

// rule: { id, type, calcType: 'FIXED'|'PERCENT'|'PER_KG'|'PER_SHIPMENT'|'PER_ORDER', value, appliesWhen?, effectiveFrom, effectiveTo }
function computeSurchargeAmount(rule, ctx) {
  switch (rule.calcType) {
    case "FIXED":
    case "PER_SHIPMENT":
    case "PER_ORDER":
      return roundMoney(rule.value);
    case "PERCENT":
      return roundMoney(ctx.baseFreight * rule.value);
    case "PER_KG":
      return roundMoney(rule.value * ctx.chargeableWeight);
    default:
      return 0;
  }
}

function surchargeApplies(rule, ctx) {
  const when = rule.appliesWhen || {};
  if (when.remoteAreaOnly && !ctx.isRemoteArea) return false;
  if (when.bulkyOnly && !ctx.isBulky) return false;
  return true;
}

// surcharges: [{id, carrierId, serviceId?, type, calcType, value, appliesWhen?, effectiveFrom, effectiveTo}]
export function applySurcharges(surcharges, ctx) {
  const active = (surcharges || []).filter((s) =>
    s.carrierId === ctx.carrierId &&
    (s.serviceId == null || s.serviceId === ctx.serviceId) &&
    isEffective(s, ctx.shipDate) &&
    surchargeApplies(s, ctx)
  );
  const items = active.map((s) => ({ id: s.id, type: s.type, calcType: s.calcType, amount: computeSurchargeAmount(s, ctx) }));
  const fuelSurcharge = roundMoney(items.filter((i) => i.type === "FUEL").reduce((a, i) => a + i.amount, 0));
  const bulkyFee = roundMoney(items.filter((i) => i.type === "BULKY").reduce((a, i) => a + i.amount, 0));
  const otherItems = items.filter((i) => i.type !== "FUEL" && i.type !== "BULKY");
  const otherFee = roundMoney(otherItems.reduce((a, i) => a + i.amount, 0));
  return { fuelSurcharge, bulkyFee, otherFee, otherItems, allItems: items };
}

// codRule: { carrierId, percent, minFee, maxFee, effectiveFrom, effectiveTo } (or an array of versions — pick latest active)
export function computeCodFee(codAmount, codRules, { carrierId, shipDate }) {
  if (!codAmount || codAmount <= 0) return { fee: 0, ruleFound: true };
  const candidates = (Array.isArray(codRules) ? codRules : codRules ? [codRules] : [])
    .filter((r) => r.carrierId === carrierId && isEffective(r, shipDate));
  if (!candidates.length) return { fee: 0, ruleFound: false };
  candidates.sort((a, b) => String(b.effectiveFrom || "").localeCompare(String(a.effectiveFrom || "")));
  const rule = candidates[0];
  let fee = roundMoney(codAmount * (rule.percent || 0));
  if (rule.minFee != null) fee = Math.max(fee, rule.minFee);
  if (rule.maxFee != null) fee = Math.min(fee, rule.maxFee);
  return { fee: roundMoney(fee), ruleFound: true, rule };
}

// ---------- bulky detection (informational only — never auto-switches service, spec §9) ----------

// threshold: { maxLengthCm, maxWidthCm, maxHeightCm, maxWeightKg, maxDimensionSumCm }
export function detectBulky({ lengthCm, widthCm, heightCm, weightKg }, threshold) {
  if (!threshold) return false;
  const sum = (lengthCm || 0) + (widthCm || 0) + (heightCm || 0);
  return (
    (threshold.maxLengthCm && lengthCm > threshold.maxLengthCm) ||
    (threshold.maxWidthCm && widthCm > threshold.maxWidthCm) ||
    (threshold.maxHeightCm && heightCm > threshold.maxHeightCm) ||
    (threshold.maxWeightKg && weightKg > threshold.maxWeightKg) ||
    (threshold.maxDimensionSumCm && sum > threshold.maxDimensionSumCm)
  );
}

// ---------- rate card admin validation (spec §23 — reject conflicting rates) ----------

function dateRangesOverlap(a, b) {
  const aFrom = a.effectiveFrom || "0000-01-01", bFrom = b.effectiveFrom || "0000-01-01";
  const aTo = a.effectiveTo || "9999-12-31", bTo = b.effectiveTo || "9999-12-31";
  return aFrom <= bTo && bFrom <= aTo;
}

// Returns the existing rows that would conflict with `candidate` (same carrier+service+zone,
// overlapping weight range, overlapping effective-date range). Excludes candidate.id itself
// so this also works when validating an edit to an existing row.
export function findOverlappingRateCards(candidate, existingRows) {
  return (existingRows || []).filter((r) =>
    r.id !== candidate.id &&
    r.carrierId === candidate.carrierId &&
    (r.serviceId || null) === (candidate.serviceId || null) &&
    r.zone === candidate.zone &&
    !(candidate.weightTo < r.weightFrom || candidate.weightFrom > r.weightTo) &&
    dateRangesOverlap(candidate, r)
  );
}

// ---------- main entry point ----------

function blank(trace, status, extra) {
  return {
    actualWeight: null, volumetricWeight: null, chargeableWeight: null,
    baseFreight: null, fuelSurcharge: null, bulkyFee: null, codFee: null, otherFee: null,
    otherFeeBreakdown: [], totalFreight: null,
    zone: null, zoneKey: null, rateVersion: null,
    status, confidence: CONFIDENCE.LOW, warnings: [], errors: [], trace,
    ...extra,
  };
}

// input: { carrierId, serviceId, shipDate (YYYY-MM-DD), postalCode, province,
//          sku, actualWeightKg, lengthCm, widthCm, heightCm, codAmount,
//          weightBracketLabel (Business Idea only) }
// masterData: { carrier, service, zoneMapEntry, skuDim, rateCards, skuGrid,
//               sizeClassRates, surcharges, codRules, bulkyThreshold }
export function calculateFreight(input, masterData) {
  const trace = [];
  let step = 0;
  const addTrace = (label, detail, values) => { trace.push({ step: ++step, label, detail, values }); };

  const errors = validateOrderInput(input);
  if (errors.length) {
    addTrace("ตรวจสอบข้อมูลนำเข้า (Validation)", errors.map((e) => e.message).join(" / "));
    return blank(trace, errorStatusFromErrors(errors), { errors });
  }

  const carrier = masterData.carrier;
  if (!carrier) {
    addTrace("ตรวจสอบ Carrier", `ไม่พบข้อมูล Carrier '${input.carrierId}' ใน Master Data`);
    return blank(trace, STATUS.DATA_ERROR, { errors: [{ code: "CARRIER_NOT_FOUND", message: "ไม่พบ Carrier นี้ในระบบ" }] });
  }
  addTrace("Carrier", `${carrier.name} (${carrier.pricingStrategy})`, { carrierId: carrier.id });

  // --- weights ---
  const skuDim = masterData.skuDim;
  const actualWeightKg = input.actualWeightKg != null ? Number(input.actualWeightKg) : (skuDim ? skuDim.weightKg : null);
  const lengthCm = input.lengthCm != null ? Number(input.lengthCm) : (skuDim ? skuDim.lengthCm : null);
  const widthCm = input.widthCm != null ? Number(input.widthCm) : (skuDim ? skuDim.widthCm : null);
  const heightCm = input.heightCm != null ? Number(input.heightCm) : (skuDim ? skuDim.heightCm : null);

  if (actualWeightKg == null || actualWeightKg <= 0) {
    addTrace("น้ำหนักสินค้า", "ไม่มีน้ำหนักจริง (ไม่ได้ระบุ และไม่พบใน SKU Master)");
    return blank(trace, STATUS.WEIGHT_ERROR, { errors: [{ code: "WEIGHT_MISSING", message: "ไม่มีน้ำหนักสินค้า" }] });
  }
  addTrace("น้ำหนักจริง (Actual Weight)", `${actualWeightKg} kg`, { actualWeightKg });

  const volumetricWeight = computeVolumetricWeight(lengthCm, widthCm, heightCm, carrier.dimFactor);
  if (volumetricWeight != null) {
    addTrace("น้ำหนักปริมาตร (Volumetric Weight)", `${lengthCm} × ${widthCm} × ${heightCm} ÷ ${carrier.dimFactor} = ${volumetricWeight} kg`, { volumetricWeight });
  }

  const isBulky = detectBulky({ lengthCm, widthCm, heightCm, weightKg: actualWeightKg }, masterData.bulkyThreshold);
  const warnings = [];
  if (isBulky) warnings.push("ขนาด/น้ำหนักสินค้าเกินเกณฑ์ปกติของ Carrier นี้ — ควรตรวจสอบว่าเลือก Service แบบ Bulky/Oversize แล้วหรือยัง");

  let chargeableWeightRaw;
  if (carrier.weightRule === "MAX_ACTUAL_VOLUMETRIC" && volumetricWeight != null) {
    chargeableWeightRaw = Math.max(actualWeightKg, volumetricWeight);
    addTrace("น้ำหนักคิดค่าขนส่ง (Chargeable Weight)", `MAX(${actualWeightKg}, ${volumetricWeight}) = ${chargeableWeightRaw}`, { chargeableWeightRaw });
  } else {
    chargeableWeightRaw = actualWeightKg;
    addTrace("น้ำหนักคิดค่าขนส่ง (Chargeable Weight)", `ใช้น้ำหนักจริง (Weight Rule = ${carrier.weightRule}) = ${chargeableWeightRaw}`, { chargeableWeightRaw });
  }

  const chargeableWeight = roundWeight(chargeableWeightRaw, carrier.roundingRule);
  if (chargeableWeight == null) {
    addTrace("ปัดน้ำหนัก (Rounding)", `ไม่พบช่วงน้ำหนักที่ตรงกับ ${chargeableWeightRaw} kg ใน Rounding Rule ของ Carrier`);
    return blank(trace, STATUS.WEIGHT_ERROR, { actualWeight: actualWeightKg, volumetricWeight, errors: [{ code: "ROUNDING_NO_MATCH", message: "ไม่พบกฎการปัดน้ำหนักที่ตรงกับน้ำหนักนี้" }] });
  }
  if (chargeableWeight !== chargeableWeightRaw) {
    addTrace("ปัดน้ำหนัก (Rounding)", `${chargeableWeightRaw} → ${chargeableWeight} kg`, { chargeableWeight });
  }

  const shipDate = input.shipDate || null;

  // --- zone ---
  // Only WEIGHT_ZONE_TABLE and SKU_ZONE_GRID actually price by zone (spec §4 — carriers
  // are not all the same). SKU_SIZE_CLASS (Nim-express) prices flat by size class only, so
  // a missing zone mapping there is informational, never a blocker.
  const zoneRequired = carrier.pricingStrategy === "WEIGHT_ZONE_TABLE" || carrier.pricingStrategy === "SKU_ZONE_GRID";
  const zone = resolveZone(masterData.zoneMapEntry, carrier.id);
  if (!zone.found && zoneRequired) {
    addTrace("ค้นหาโซน (Zone Lookup)", `ไม่พบโซนของ Carrier นี้สำหรับรหัสไปรษณีย์ '${input.postalCode || "-"}'`);
    return blank(trace, STATUS.ZONE_NOT_FOUND, {
      actualWeight: actualWeightKg, volumetricWeight, chargeableWeight,
      errors: [{ code: "ZONE_NOT_FOUND", message: "ไม่พบ Zone ของรหัสไปรษณีย์นี้สำหรับ Carrier ที่เลือก — กรุณาเพิ่มข้อมูลใน Zone Mapping" }],
    });
  }
  if (zone.found) {
    addTrace("ค้นหาโซน (Zone Lookup)", `รหัสไปรษณีย์ ${input.postalCode || "-"} → Zone '${zone.zoneKey}'${zone.source === "derived" ? " (คำนวณจากภูมิภาค ไม่ใช่ข้อมูลตรงของ Carrier นี้)" : ""}`, { zoneKey: zone.zoneKey, isRemoteArea: zone.isRemoteArea });
  } else {
    addTrace("ค้นหาโซน (Zone Lookup)", `Carrier นี้ไม่ใช้โซนในการคิดราคา (${carrier.pricingStrategy}) — ข้ามขั้นตอนนี้`);
  }

  // --- rate lookup (strategy-specific) ---
  let baseFreight = null, rateVersion = null;
  if (carrier.pricingStrategy === "WEIGHT_ZONE_TABLE") {
    const row = lookupWeightZoneRate(masterData.rateCards, { carrierId: carrier.id, serviceId: input.serviceId, zoneKey: zone.zoneKey, weight: chargeableWeight, shipDate });
    if (!row) {
      addTrace("ค้นหาอัตราค่าขนส่ง (Rate Lookup)", `ไม่พบ Rate Card: Carrier=${carrier.id}, Zone=${zone.zoneKey}, น้ำหนัก=${chargeableWeight}kg, วันที่=${shipDate || "-"}`);
      return blank(trace, STATUS.RATE_NOT_FOUND, {
        actualWeight: actualWeightKg, volumetricWeight, chargeableWeight, zone: zone.zoneKey, zoneKey: zone.zoneKey,
        errors: [{ code: "RATE_NOT_FOUND", message: "ไม่พบ Rate Card ที่ตรงกับ Carrier/Zone/น้ำหนัก/วันที่นี้ — กรุณาเพิ่ม Rate Card หรือตรวจสอบ Effective Date" }],
      });
    }
    baseFreight = roundMoney(row.rate); rateVersion = row.rateVersion || null;
    addTrace("ค้นหาอัตราค่าขนส่ง (Rate Lookup)", `Carrier=${carrier.name}, Zone=${zone.zoneKey}, ${chargeableWeight}kg → ${baseFreight} บาท (Rate Version: ${rateVersion || "-"})`, { baseFreight, rateVersion });
  } else if (carrier.pricingStrategy === "SKU_ZONE_GRID") {
    if (!input.sku) {
      addTrace("ค้นหาอัตราค่าขนส่ง (Rate Lookup)", "Carrier นี้คิดราคาเฉพาะ SKU — ต้องระบุ SKU");
      return blank(trace, STATUS.MANUAL_REVIEW, { actualWeight: actualWeightKg, chargeableWeight, zone: zone.zoneKey, zoneKey: zone.zoneKey, errors: [{ code: "SKU_REQUIRED", message: "Carrier นี้ต้องระบุ SKU จึงจะค้นหาราคาได้" }] });
    }
    const result = lookupSkuGridRate(masterData.skuGrid, { sku: input.sku, zoneKey: zone.zoneKey, bracketLabel: input.weightBracketLabel, shipDate });
    if (!result) {
      addTrace("ค้นหาอัตราค่าขนส่ง (Rate Lookup)", `ไม่พบ Rate สำหรับ SKU=${input.sku}, Bracket=${input.weightBracketLabel}, Zone=${zone.zoneKey}`);
      return blank(trace, STATUS.RATE_NOT_FOUND, { actualWeight: actualWeightKg, chargeableWeight, zone: zone.zoneKey, zoneKey: zone.zoneKey, errors: [{ code: "RATE_NOT_FOUND", message: "ไม่พบ Rate ของ SKU/ช่วงตัวเลข/โซนนี้" }] });
    }
    if (result.needsBracket) {
      addTrace("เลือกช่วงตัวเลข (Weight Bracket)", `Carrier นี้ตั้งราคาต่อ SKU แยกตามช่วงตัวเลข — ระบบไม่ทราบเกณฑ์การเลือกอัตโนมัติ ต้องเลือกเอง จากตัวเลือก: ${result.availableBrackets.join(", ")}`);
      return blank(trace, STATUS.MANUAL_REVIEW, {
        actualWeight: actualWeightKg, chargeableWeight, zone: zone.zoneKey, zoneKey: zone.zoneKey,
        errors: [{ code: "BRACKET_REQUIRED", message: "กรุณาเลือกช่วงตัวเลข (Weight Bracket) สำหรับ SKU นี้ — ระบบไม่เดาให้", availableBrackets: result.availableBrackets }],
      });
    }
    baseFreight = roundMoney(result.rate); rateVersion = result.rateVersion || null;
    addTrace("ค้นหาอัตราค่าขนส่ง (Rate Lookup)", `SKU=${input.sku}, Bracket=${input.weightBracketLabel}, Zone=${zone.zoneKey} → ${baseFreight} บาท`, { baseFreight, rateVersion });
  } else if (carrier.pricingStrategy === "SKU_SIZE_CLASS") {
    const sizeClass = skuDim ? skuDim.sizeClass : input.sizeClass;
    if (!sizeClass) {
      addTrace("ค้นหาอัตราค่าขนส่ง (Rate Lookup)", `ไม่พบ Size Class ของ SKU='${input.sku || "-"}' ใน Master Data`);
      return blank(trace, STATUS.RATE_NOT_FOUND, { actualWeight: actualWeightKg, chargeableWeight, zone: zone.zoneKey || null, zoneKey: zone.zoneKey || null, errors: [{ code: "SIZE_CLASS_NOT_FOUND", message: "ไม่พบ Size Class ของ SKU นี้ — กรุณากำหนดใน Admin" }] });
    }
    const row = lookupSizeClassRate(masterData.sizeClassRates, { sizeClass, shipDate });
    if (!row) {
      addTrace("ค้นหาอัตราค่าขนส่ง (Rate Lookup)", `ไม่พบราคาของ Size Class '${sizeClass}'`);
      return blank(trace, STATUS.RATE_NOT_FOUND, { actualWeight: actualWeightKg, chargeableWeight, zone: zone.zoneKey || null, zoneKey: zone.zoneKey || null, errors: [{ code: "RATE_NOT_FOUND", message: "ไม่พบราคาของ Size Class นี้" }] });
    }
    baseFreight = roundMoney(row.rate); rateVersion = row.rateVersion || null;
    addTrace("ค้นหาอัตราค่าขนส่ง (Rate Lookup)", `Size Class '${sizeClass}' → ${baseFreight} บาท`, { baseFreight, rateVersion, sizeClass });
  } else {
    addTrace("ตรวจสอบ Pricing Strategy", `ไม่รู้จัก pricingStrategy='${carrier.pricingStrategy}'`);
    return blank(trace, STATUS.DATA_ERROR, { errors: [{ code: "UNKNOWN_STRATEGY", message: "ตั้งค่า Carrier ผิด — ไม่รู้จัก Pricing Strategy" }] });
  }

  // --- surcharges ---
  const surchargeCtx = { carrierId: carrier.id, serviceId: input.serviceId, shipDate, baseFreight, chargeableWeight, isRemoteArea: zone.isRemoteArea, isBulky };
  const surchargeResult = applySurcharges(masterData.surcharges, surchargeCtx);
  if (surchargeResult.allItems.length) {
    addTrace("ค่าบริการเพิ่มเติม (Surcharges)", surchargeResult.allItems.map((i) => `${i.type}: ${i.amount} บาท`).join(", "), surchargeResult);
  }
  if (zone.isRemoteArea && !surchargeResult.allItems.some((i) => i.type === "REMOTE_AREA")) {
    warnings.push("โซนนี้ถูกระบุว่าเป็นพื้นที่ห่างไกล (Remote Area) แต่ยังไม่ได้ตั้งค่า Remote Area Surcharge — คิดค่าส่วนนี้เป็น 0 บาท");
  }

  // --- COD ---
  const cod = computeCodFee(input.codAmount, masterData.codRules, { carrierId: carrier.id, shipDate });
  if (input.codAmount > 0) {
    if (!cod.ruleFound) {
      addTrace("ค่าธรรมเนียม COD", `ยอด COD ${input.codAmount} บาท แต่ไม่พบ COD Rule ของ Carrier นี้`);
      return blank(trace, STATUS.MANUAL_REVIEW, {
        actualWeight: actualWeightKg, volumetricWeight, chargeableWeight, baseFreight, zone: zone.zoneKey || null, zoneKey: zone.zoneKey || null, rateVersion,
        fuelSurcharge: surchargeResult.fuelSurcharge, bulkyFee: surchargeResult.bulkyFee, otherFee: surchargeResult.otherFee, otherFeeBreakdown: surchargeResult.otherItems,
        errors: [{ code: "COD_RULE_NOT_FOUND", message: "มียอด COD แต่ไม่พบ COD Rule ของ Carrier นี้ — ไม่คำนวณราคาต่อจนกว่าจะตั้งค่า" }],
      });
    }
    addTrace("ค่าธรรมเนียม COD", `${input.codAmount} × ${(cod.rule.percent * 100).toFixed(2)}% = ${cod.fee} บาท (Min ${cod.rule.minFee ?? "-"} / Max ${cod.rule.maxFee ?? "-"})`, { codFee: cod.fee });
  }

  const totalFreight = roundMoney(baseFreight + surchargeResult.fuelSurcharge + surchargeResult.bulkyFee + cod.fee + surchargeResult.otherFee);
  addTrace("รวมค่าขนส่งทั้งหมด (Total Freight)", `${baseFreight} + ${surchargeResult.fuelSurcharge} + ${surchargeResult.bulkyFee} + ${cod.fee} + ${surchargeResult.otherFee} = ${totalFreight} บาท`, { totalFreight });

  let confidence = CONFIDENCE.HIGH;
  if (zone.source === "derived" || warnings.length) confidence = CONFIDENCE.MEDIUM;

  return {
    actualWeight: actualWeightKg, volumetricWeight, chargeableWeight,
    baseFreight, fuelSurcharge: surchargeResult.fuelSurcharge, bulkyFee: surchargeResult.bulkyFee,
    codFee: cod.fee, otherFee: surchargeResult.otherFee, otherFeeBreakdown: surchargeResult.otherItems,
    totalFreight, zone: zone.zoneKey || null, zoneKey: zone.zoneKey || null, rateVersion,
    status: STATUS.CALCULATED, confidence, warnings, errors: [], trace,
  };
}

// spec §13: run the calculation twice and diff-compare — guards against any
// hidden non-determinism rather than assuming a pure function can't drift.
export function runCalculationWithValidation(input, masterData) {
  const first = calculateFreight(input, masterData);
  const second = calculateFreight(input, masterData);
  const a = { ...first, trace: undefined };
  const b = { ...second, trace: undefined };
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    return blank(first.trace, STATUS.CALCULATION_ERROR, {
      errors: [{ code: "DOUBLE_CALC_MISMATCH", message: "คำนวณซ้ำได้ผลไม่ตรงกัน — ห้ามยืนยันค่านี้ กรุณาตรวจสอบระบบ" }],
    });
  }
  return first;
}
