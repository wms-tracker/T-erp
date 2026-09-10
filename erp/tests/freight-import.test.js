// ===================================================================
// freight-import.test.js — run with: node --test erp/tests/freight-import.test.js
// Fixtures mirror the exact row/column layout read directly out of
// Shipping Price.xlsx (see the approved plan) so a parser change that
// silently breaks on the real file's shape gets caught here first.
// ===================================================================
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  parseWeightZoneSheet, parseKexSheet, parseBusinessIdeaSheet, parseNimExpressSheet,
  parseSkuNimSheet, parseProductSheet, parseProvinceSheet, buildZoneMapDocs, mergeSkuDimensions,
  parseWorkbook, summarizeParsedWorkbook,
} from "../js/freight-import.js";

describe("parseWeightZoneSheet (Best / Flash / Kerry / DHLParcel / DHL Bulky)", () => {
  const bestRows = [
    ["น้ำหนักกล่อง", "BKK", "UPC"],
    [1, 22.4, 28.8], [2, 26.4, 32.8], [3, 30.4, 36.8],
  ];
  test("produces contiguous BKK+UPC brackets matching the real Best numbers", () => {
    const { rows, warnings } = parseWeightZoneSheet(bestRows, "best", null);
    assert.equal(warnings.length, 0);
    assert.equal(rows.length, 6);
    const r2 = rows.find((r) => r.zone === "BKK" && r.weightTo === 2);
    assert.equal(r2.weightFrom, 1.01);
    assert.equal(r2.rate, 26.4);
  });
  test("skips a trailing blank row without throwing", () => {
    const { rows } = parseWeightZoneSheet([...bestRows, [null, null, null]], "best", null);
    assert.equal(rows.length, 6);
  });
  test("flags (but still produces a usable row for) a non-monotonic weight column instead of silently mis-ranging it", () => {
    const odd = [["hdr", "BKK", "UPC"], [0, 50, 50], [1.001, 50, 50], [0.5, 999, 999]];
    const { rows, warnings } = parseWeightZoneSheet(odd, "dhl", "parcel");
    assert.ok(warnings.length >= 1);
    const last = rows.filter((r) => r.rate === 999);
    assert.ok(last.every((r) => r.weightTo >= r.weightFrom));
  });
});

describe("parseKexSheet", () => {
  test("stops at the trailing note row and keeps national ('ALL') zone, matching real values", () => {
    const rows = [["Weight (G)", "Baht"], [1, 22], [2, 26], ["50 KG.+ ขึ้นไป", "คิดค่าบริการเพิ่ม"]];
    const out = parseKexSheet(rows);
    assert.equal(out.length, 2);
    assert.equal(out[1].rate, 26);
    assert.equal(out[1].zone, "ALL");
  });
});

describe("parseBusinessIdeaSheet — bracket columns discovered from the header, never hardcoded", () => {
  const rows = [
    ["SKU", "Name Product", "Type", "Size (cm)", "Weight (KG)", "27.00-29.99", "", "", "", "", "30.00-31.99", "", "", "", ""],
    ["", "", "", "", "", "BKK-metro", "Central", "North+Isaan", "South", "Special", "BKK-metro", "Central", "North+Isaan", "South", "Special"],
    ["EMS0000000077", "Emmas Mattress", "ที่นอนกาง", "107 x 201 x 30", 30.4, 910, 910, 1130, 1330, 1540, 956, 956, 1187, 1397, 1617],
  ];
  test("finds both bracket groups and all 10 cells for the one SKU row", () => {
    const out = parseBusinessIdeaSheet(rows);
    assert.equal(out.length, 1);
    assert.equal(out[0].cells.length, 10);
    const cell = out[0].cells.find((c) => c.bracketLabel === "30.00-31.99" && c.zone === "Central");
    assert.equal(cell.rate, 956);
  });
});

describe("parseNimExpressSheet / parseSkuNimSheet", () => {
  test("uses the full label as the size-class key (never a truncated prefix — 'Oversize 1' vs 'Oversize 4' must stay distinct)", () => {
    const rows = [
      ["hdr", "ขนาด", "ราคาขนส่ง"],
      [3000, "SS (น้ำหนักไม่เกิน 2.5 กก. - ปริมาตรไม่เกิน 3,000 ลบ.ซม.)", 50, "01_SS_2017"],
      [200000, "Oversize 1 (น้ำหนักไม่เกิน 50 กก. - ปริมาตรไม่เกิน 200,000 ลบ.ซม.)", 380, "LUNIO_OVERSIZE1"],
      [237760, "Oversize 4 (น้ำหนักไม่เกิน 45 กก. - ปริมาตรไม่เกิน 237,760 ลบ.ซม.)", 430, "LUNIO_OVERSIZE4"],
    ];
    const out = parseNimExpressSheet(rows);
    assert.equal(out.length, 3);
    assert.notEqual(out[1].sizeClass, out[2].sizeClass); // "Oversize 1" !== "Oversize 4"
    assert.equal(out[0].rate, 50);
  });
  test("excludes legacy 'BOX ...' alias rows that have no volume threshold (they just repeat an existing class's price under an old name)", () => {
    const rows = [
      ["hdr", "ขนาด", "ราคาขนส่ง"],
      [50000, "B (น้ำหนักไม่เกิน 20 กก. - ปริมาตรไม่เกิน 50,000 ลบ.ซม.)", 150, "04_B_2017"],
      [null, "BOX L", 150, "04_B_2017"],
      [null, "BOX L-2", 150, "04_B_2017"],
    ];
    const out = parseNimExpressSheet(rows);
    assert.equal(out.length, 1);
    assert.equal(out[0].sizeClass, "B (น้ำหนักไม่เกิน 20 กก. - ปริมาตรไม่เกิน 50,000 ลบ.ซม.)");
  });
  test("SKU NIM sheet pairs a SKU to its full assigned size-class label + dims, matching Nim-express's label exactly", () => {
    const rows = [
      ["SKU Nim", "Code Nim", "SKU", "Product Name", "W", "L", "H", "Weight", "Vol", "VolStd", "Size", "Price"],
      ["x", "05_C_2017", "AHM0000000001", "เตียง 3.5FT", 232, 21, 16.5, 21, 80388, 85000, "C (น้ำหนักไม่เกิน 25 กก. - ปริมาตรไม่เกิน 85,000 ลบ.ซม.)", 200],
    ];
    const out = parseSkuNimSheet(rows);
    assert.equal(out[0].sku, "AHM0000000001");
    assert.equal(out[0].sizeClass, "C (น้ำหนักไม่เกิน 25 กก. - ปริมาตรไม่เกิน 85,000 ลบ.ซม.)");
    assert.equal(out[0].weightKg, 21);
  });
});

describe("parseProductSheet — prefers the BOX row's dims over the bare Product row", () => {
  const rows = [
    ["meta"], ["MOM SKU", "SKU", "Name", "Type", "W", "L", "H", "Size", "Weight"], ["", "", "", "", "Zone", "Cost", "Dim", "MAX", "..."],
    ["", "AHM0000000001", "เตียง 3.5FT", "Product", 213, 114, 28, "213x114x28", 21],
    ["", "AHM0000000001", "เตียง 3.5FT", "BOX", 232, 21, 16.5, "232x21x16.5", 21],
  ];
  test("BOX row wins regardless of order", () => {
    const out = parseProductSheet(rows);
    assert.equal(out.length, 1);
    assert.equal(out[0].type, "BOX");
    assert.equal(out[0].widthCm, 232);
  });
  test("also wins when BOX comes first", () => {
    const reordered = [rows[0], rows[1], rows[2], rows[4], rows[3]];
    const out = parseProductSheet(reordered);
    assert.equal(out[0].type, "BOX");
  });
});

describe("parseProvinceSheet + buildZoneMapDocs", () => {
  const rows = [
    ["zipcode", "Zone", "Region", "Business Idea (BI)", "Best", "Best (UPC/BKK)", "DHL", "Nim-express", "Kerry"],
    [10100, "เขต A", "ภาคกลาง", "กรุงเทพฯ และปริมณฑล", "โซนปกติ", "BKK", "โซนปกติ", "โซนปกติ", "โซนปกติ"],
    [10100, "เขต B", "ภาคกลาง", "กรุงเทพฯ และปริมณฑล", "โซนปกติ", "BKK", "โซนปกติ", "โซนปกติ", "โซนปกติ"],
    [96000, "อำเภอไกล", "ภาคใต้", "โซนพิเศษ", "โซนพิเศษ", "UPC", "โซนพิเศษ", "โซนพิเศษ", "โซนพิเศษ"],
  ];
  test("zips are 5-digit padded strings and duplicate-district rows collapse into one doc", () => {
    const parsed = parseProvinceSheet(rows);
    const { docs, conflicts } = buildZoneMapDocs(parsed);
    assert.equal(docs.length, 2);
    const bkk = docs.find((d) => d.postalCode === "10100");
    assert.equal(bkk.districts.length, 2);
    assert.equal(conflicts.length, 0);
  });
  test("derives BKK/UPC for carriers with no dedicated column (flash/dhl/kerry), and flags it as derived", () => {
    const parsed = parseProvinceSheet(rows);
    const { docs } = buildZoneMapDocs(parsed);
    const bkk = docs.find((d) => d.postalCode === "10100");
    assert.equal(bkk.carrierZones.flash, "BKK");
    assert.equal(bkk.zoneSource.flash, "derived");
    assert.equal(bkk.carrierZones.best, "BKK"); // Best has its own column — used directly
    assert.equal(bkk.zoneSource.best, "exact");
  });
  test("treats a non-'โซนปกติ' carrier column as a remote-area flag, not a separate price", () => {
    const parsed = parseProvinceSheet(rows);
    const { docs } = buildZoneMapDocs(parsed);
    const remote = docs.find((d) => d.postalCode === "96000");
    assert.equal(remote.remoteAreaByCarrier.dhl, true);
    assert.equal(remote.remoteAreaByCarrier.kerry, true);
    const normal = docs.find((d) => d.postalCode === "10100");
    assert.equal(normal.remoteAreaByCarrier.dhl, false);
  });
  test("flags conflicting carrier-zone values across rows sharing a zipcode instead of silently picking one", () => {
    const conflicting = [rows[0], rows[1], [10100, "เขต C", "ภาคกลาง", "ภาคใต้", "โซนปกติ", "UPC", "โซนปกติ", "โซนปกติ", "โซนปกติ"]];
    const { conflicts } = buildZoneMapDocs(parseProvinceSheet(conflicting));
    assert.ok(conflicts.length >= 1);
  });
});

describe("mergeSkuDimensions", () => {
  test("Product's dims win when a SKU appears in both, but SKU NIM still contributes the size class", () => {
    const productDims = [{ sku: "A1", name: "Bed", type: "BOX", widthCm: 100, lengthCm: 50, heightCm: 20, weightKg: 10 }];
    const skuNim = [{ sku: "A1", name: "Bed", widthCm: 999, lengthCm: 999, heightCm: 999, weightKg: 999, sizeClass: "C" }];
    const out = mergeSkuDimensions(productDims, skuNim);
    assert.equal(out.length, 1);
    assert.equal(out[0].widthCm, 100); // Product's dims kept, not overwritten by SKU NIM's
    assert.equal(out[0].sizeClass, "C");
  });
  test("a SKU only in SKU NIM (not in Product) still produces a usable record", () => {
    const out = mergeSkuDimensions([], [{ sku: "B2", name: "Chair", widthCm: 40, lengthCm: 40, heightCm: 90, weightKg: 5, sizeClass: "A" }]);
    assert.equal(out.length, 1);
    assert.equal(out[0].sku, "B2");
    assert.equal(out[0].sizeClass, "A");
  });
});

describe("parseWorkbook — end to end summary over a tiny synthetic workbook", () => {
  test("wires every sheet parser together and counts up cleanly", () => {
    const sheets = {
      "Best": [["hdr", "BKK", "UPC"], [1, 22.4, 28.8]],
      "Flash": [["hdr", "BKK", "UPC"], [1, 45, 45]],
      "Kerry": [["hdr", "BKK", "UPC"], [1, 50, 50]],
      "DHLParcel": [["hdr", "BKK", "UPC"], [1, 50, 50]],
      "DHL Bulky": [["hdr", "BKK", "UPC"], [1, 70, 72]],
      "KEX": [["hdr", "Baht"], [1, 22]],
      "Business Idea": [
        ["SKU", "Name", "Type", "Size", "Weight", "27.00-29.99", "", "", "", ""],
        ["", "", "", "", "", "BKK-metro", "Central", "North", "South", "Special"],
        ["SKU1", "N", "T", "S", 30, 910, 910, 1130, 1330, 1540],
      ],
      "Nim-express": [["hdr", "ขนาด", "ราคา"], [3000, "SS (x)", 50]],
      "SKU NIM": [["a", "b", "SKU", "Name", "W", "L", "H", "Weight", "Vol", "VolStd", "Size", "Price"], ["x", "y", "SKU2", "N", 1, 1, 1, 1, 1, 1, "SS (x)", 50]],
      "Product": [["meta"], ["hdr"], ["sub"], ["", "SKU3", "N", "Product", 10, 10, 10, "10x10x10", 5]],
      "Province": [["zipcode", "Zone", "Region", "BI", "Best", "BestBkkUpc", "DHL", "Nim", "Kerry"], [10100, "D", "R", "กรุงเทพฯ และปริมณฑล", "โซนปกติ", "BKK", "โซนปกติ", "โซนปกติ", "โซนปกติ"]],
    };
    const parsed = parseWorkbook(sheets);
    const summary = summarizeParsedWorkbook(parsed);
    assert.equal(summary.rateCardRows, 2 * 5 + 1); // 5 weight-zone sheets x 2 zones + KEX's 1
    assert.equal(summary.businessIdeaSkus, 1);
    assert.equal(summary.businessIdeaCells, 5);
    assert.equal(summary.nimSizeClasses, 1);
    assert.equal(summary.skuNimCount, 1);
    assert.equal(summary.productDimCount, 1);
    assert.equal(summary.skuDimensionCount, 2); // SKU3 (Product only) + SKU2 (SKU NIM only)
    assert.equal(summary.zoneMapEntries, 1);
    assert.equal(summary.zoneMapConflicts, 0);
  });
});
