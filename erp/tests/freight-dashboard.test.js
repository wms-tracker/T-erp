// ===================================================================
// freight-dashboard.test.js — run with: node --test erp/tests/freight-dashboard.test.js
// ===================================================================
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCalc, computeKPIs, filterByPeriod, groupByCarrier, groupByProvince,
  groupByWeightRange, dailyTrend,
} from "../js/freight-dashboard.js";

const TODAY = new Date("2026-03-15T10:00:00");

function calc(overrides) {
  return {
    id: "x", status: "CALCULATED", carrierId: "best", totalFreight: 100,
    result: { chargeableWeight: 2 }, input: { province: "กรุงเทพฯ" },
    createdAt: TODAY, ...overrides,
  };
}

describe("normalizeCalc", () => {
  test("handles a Firestore-Timestamp-like createdAt (has .toDate())", () => {
    const rec = normalizeCalc(calc({ createdAt: { toDate: () => TODAY } }));
    assert.equal(rec.dateStr, "2026-03-15");
  });
  test("falls back to 'ไม่ระบุ' carrier/province when missing", () => {
    const rec = normalizeCalc({ status: "CALCULATED", totalFreight: 1 });
    assert.equal(rec.carrierId, "ไม่ระบุ");
    assert.equal(rec.province, "ไม่ระบุ");
  });
});

describe("computeKPIs", () => {
  test("only sums freight/weight over CALCULATED records", () => {
    const records = [
      normalizeCalc(calc({ totalFreight: 100 })),
      normalizeCalc(calc({ totalFreight: 200, result: { chargeableWeight: 4 } })),
      normalizeCalc(calc({ status: "RATE_NOT_FOUND", totalFreight: null })),
      normalizeCalc(calc({ status: "MANUAL_REVIEW", totalFreight: null })),
    ];
    const k = computeKPIs(records);
    assert.equal(k.total, 4);
    assert.equal(k.calculated, 2);
    assert.equal(k.manualReview, 1);
    assert.equal(k.failed, 1);
    assert.equal(k.totalFreight, 300);
    assert.equal(k.avgFreightPerOrder, 150);
    assert.equal(k.freightPerKg, 50); // 300 / (2+4)
  });
  test("handles an empty list without dividing by zero", () => {
    const k = computeKPIs([]);
    assert.equal(k.avgFreightPerOrder, 0);
    assert.equal(k.freightPerKg, 0);
  });
});

describe("filterByPeriod", () => {
  const records = [
    normalizeCalc(calc({ createdAt: new Date("2026-03-15") })), // today
    normalizeCalc(calc({ createdAt: new Date("2026-03-10") })), // 5 days ago
    normalizeCalc(calc({ createdAt: new Date("2026-02-01") })), // this month? no, Feb
    normalizeCalc(calc({ createdAt: new Date("2025-12-01") })), // last year
  ];
  test("'today' keeps only same-day records", () => {
    assert.equal(filterByPeriod(records, "today", TODAY).length, 1);
  });
  test("'7d' includes the 5-days-ago record but not older ones", () => {
    const out = filterByPeriod(records, "7d", TODAY);
    assert.equal(out.length, 2);
  });
  test("'year' keeps only 2026 records", () => {
    assert.equal(filterByPeriod(records, "year", TODAY).length, 3);
  });
  test("'all' or missing period returns everything unfiltered", () => {
    assert.equal(filterByPeriod(records, "all", TODAY).length, 4);
    assert.equal(filterByPeriod(records, null, TODAY).length, 4);
  });
});

describe("groupByCarrier / groupByProvince", () => {
  const records = [
    normalizeCalc(calc({ carrierId: "best", totalFreight: 100, input: { province: "กรุงเทพฯ" } })),
    normalizeCalc(calc({ carrierId: "best", totalFreight: 50, input: { province: "เชียงใหม่" } })),
    normalizeCalc(calc({ carrierId: "kex", totalFreight: 200, input: { province: "กรุงเทพฯ" } })),
    normalizeCalc(calc({ status: "RATE_NOT_FOUND", carrierId: "flash", totalFreight: null })), // excluded
  ];
  test("sums freight per carrier, sorted highest first, excluding non-CALCULATED", () => {
    const out = groupByCarrier(records);
    assert.deepEqual(out.map((r) => r.key), ["kex", "best"]);
    assert.equal(out.find((r) => r.key === "best").total, 150);
    assert.ok(!out.some((r) => r.key === "flash"));
  });
  test("sums freight per province", () => {
    const out = groupByProvince(records);
    assert.equal(out.find((r) => r.key === "กรุงเทพฯ").total, 300);
    assert.equal(out.find((r) => r.key === "เชียงใหม่").total, 50);
  });
});

describe("groupByWeightRange", () => {
  test("buckets are exclusive of the lower bound, inclusive of the upper", () => {
    const records = [
      normalizeCalc(calc({ result: { chargeableWeight: 1 }, totalFreight: 10 })), // falls in 0-1
      normalizeCalc(calc({ result: { chargeableWeight: 1.5 }, totalFreight: 20 })), // falls in 1-5
      normalizeCalc(calc({ result: { chargeableWeight: 25 }, totalFreight: 30 })), // falls in 20+
    ];
    const out = groupByWeightRange(records);
    assert.equal(out.find((b) => b.key === "0-1 kg").count, 1);
    assert.equal(out.find((b) => b.key === "1-5 kg").count, 1);
    assert.equal(out.find((b) => b.key === "20 kg+").count, 1);
    assert.equal(out.find((b) => b.key === "5-10 kg").count, 0);
  });
});

describe("dailyTrend", () => {
  test("produces exactly `days` buckets ending today, with correct per-day totals", () => {
    const records = [
      normalizeCalc(calc({ createdAt: new Date("2026-03-15"), totalFreight: 100 })),
      normalizeCalc(calc({ createdAt: new Date("2026-03-15"), totalFreight: 50 })),
      normalizeCalc(calc({ createdAt: new Date("2026-03-14"), totalFreight: 30 })),
      normalizeCalc(calc({ createdAt: new Date("2020-01-01"), totalFreight: 999 })), // outside window, ignored
    ];
    const trend = dailyTrend(records, 3, TODAY);
    assert.equal(trend.length, 3);
    assert.equal(trend[2].key, "2026-03-15");
    assert.equal(trend[2].total, 150);
    assert.equal(trend[2].count, 2);
    assert.equal(trend[1].total, 30);
  });
});
