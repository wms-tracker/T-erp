// ===================================================================
// demo-data.js — Warehouse Control Tower: Demo/Mock data generator
// สร้างข้อมูลจำลองที่สัมพันธ์กันตามสเปก (Outbound/Inbound/Manpower/Accident)
// แทนที่ไฟล์นี้ด้วยการดึงข้อมูลจริง (Firestore/REST/Google Sheets) โดยคง "shape" เดิมไว้
// เพื่อไม่ต้องแก้ data-service.js หรือ UI เลย — ดู README-control-tower.md หัวข้อ "เปลี่ยนจาก Demo เป็นข้อมูลจริง"
// ===================================================================

export const DEPARTMENTS = [
  { code: 'OB',        label: 'Outbound' },
  { code: 'IB',        label: 'Inbound' },
  { code: 'TS',        label: 'Transportation' },
  { code: 'INV',       label: 'Inventory' },
  { code: 'LOG',       label: 'Logistics' },
  { code: 'QA',        label: 'Quality Assurance' },
  { code: 'RETURN',    label: 'Return' },
  { code: 'HK',        label: 'Housekeeping' },
  { code: 'ACC',       label: 'Accounting' },
  { code: 'LP',        label: 'Loss Prevention' },
  { code: 'AUDIT',     label: 'Audit' },
];

export const EMPLOYEE_TYPES = ['IN_HOUSE', 'OUTSOURCE', 'PART_TIME'];
export const EMPLOYEE_TYPE_LABEL = { IN_HOUSE: 'In-House', OUTSOURCE: 'Outsource', PART_TIME: 'Part-Time' };

export const SHIFTS = ['กะเช้า', 'กะบ่าย', 'กะดึก'];
export const WAREHOUSES = [
  { code: 'TPY', label: 'TPY Estate' },
];
export const CHANNELS = ['Shopee', 'Lazada', 'TikTok Shop', 'Website', 'Modern Trade', 'B2B'];
export const CARRIERS = ['Kerry', 'Flash Express', 'J&T Express', 'Best Express', 'DHL', 'Ninja Van', 'ไปรษณีย์ไทย'];
export const SUPPLIERS = ['บจก. สยามแพ็คเกจจิ้ง', 'บจก. ไทยยูเนี่ยนโลจิสติกส์', 'ห้างหุ้นส่วน ทองไทยซัพพลาย', 'บจก. เอเชียเทรดดิ้ง', 'บจก. โกลบอลพาร์ทส์', 'บจก. เอ็นเนอร์ยี่แพลนท์'];

export const OUTBOUND_STATUSES = ['PICKING', 'PACKING', 'QC', 'READY', 'SHIPPED', 'PENDING', 'CANCELLED', 'ERROR'];
export const OUTBOUND_STATUS_LABEL = {
  PICKING: 'Picking', PACKING: 'Packing', QC: 'QC', READY: 'Ready to Ship',
  SHIPPED: 'Shipped', PENDING: 'Pending', CANCELLED: 'Cancelled', ERROR: 'Error',
};
// สัดส่วนโดยประมาณของออเดอร์ที่เสร็จงานไปแล้วในแต่ละวัน (วันที่ผ่านมาแล้วสมมติปิดงานเกือบหมด)
const OUTBOUND_STATUS_WEIGHTS_TODAY = { PICKING: 10, PACKING: 8, QC: 6, READY: 6, SHIPPED: 58, PENDING: 8, CANCELLED: 2.5, ERROR: 1.5 };
const OUTBOUND_STATUS_WEIGHTS_PAST  = { PICKING: 0, PACKING: 0, QC: 0.5, READY: 0.5, SHIPPED: 92, PENDING: 3, CANCELLED: 3, ERROR: 1 };

export const INBOUND_STATUSES = ['EXPECTED', 'RECEIVING', 'QC', 'PUTAWAY', 'COMPLETED', 'PENDING', 'REJECTED'];
export const INBOUND_STATUS_LABEL = {
  EXPECTED: 'Expected', RECEIVING: 'Receiving', QC: 'QC', PUTAWAY: 'Put Away',
  COMPLETED: 'Completed', PENDING: 'Pending', REJECTED: 'Rejected',
};
const INBOUND_STATUS_WEIGHTS_TODAY = { EXPECTED: 14, RECEIVING: 10, QC: 8, PUTAWAY: 8, COMPLETED: 52, PENDING: 6, REJECTED: 2 };
const INBOUND_STATUS_WEIGHTS_PAST  = { EXPECTED: 0, RECEIVING: 0, QC: 0.5, PUTAWAY: 0.5, COMPLETED: 94, PENDING: 3, REJECTED: 2 };

export const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'LEAVE', 'LATE'];
export const ACCIDENT_SEVERITIES = ['NEAR_MISS', 'FIRST_AID', 'PROPERTY_DAMAGE', 'LTI', 'FATALITY'];
export const ACCIDENT_SEVERITY_LABEL = {
  NEAR_MISS: 'Near Miss', FIRST_AID: 'First Aid', PROPERTY_DAMAGE: 'Property Damage',
  LTI: 'Lost Time Injury', FATALITY: 'Fatality',
};
export const ACCIDENT_TYPES = ['ลื่นหกล้ม', 'ของตกใส่', 'รถโฟล์คลิฟท์', 'บาดจากของมีคม', 'ไฟฟ้าลัดวงจร', 'ยกของผิดท่า', 'ชนกับอุปกรณ์'];
export const ACCIDENT_STATUSES = ['Open', 'Investigating', 'Corrective Action', 'Completed', 'Closed'];

const ORDER_DETAIL_DAYS = 14;   // เก็บ order-level detail ไว้กี่วันล่าสุด (drill-down ละเอียด)
const DAILY_AGGREGATE_DAYS = 365; // เก็บ daily rollup ไว้กี่วัน (สำหรับ KPI เดือน/ปี โดยไม่ต้องโหลดทุกแถวขึ้น browser)
const ATTENDANCE_HISTORY_DAYS = 30;

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = (Math.imul(h, 31) + str.charCodeAt(i)) | 0; }
  return h;
}
function pad2(n) { return String(n).padStart(2, '0'); }
function dateStr(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function addDays(base, n) { const d = new Date(base); d.setDate(d.getDate() + n); return d; }

function weightedPick(rng, weights) {
  const entries = Object.entries(weights);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [k, w] of entries) { if ((r -= w) <= 0) return k; }
  return entries[entries.length - 1][0];
}
function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
function randInt(rng, min, max) { return Math.floor(rng() * (max - min + 1)) + min; }

const THAI_FIRST = ['สมชาย', 'สมหญิง', 'วิชัย', 'มานพ', 'สุนีย์', 'ประยุทธ', 'กัลยา', 'อนุชา', 'ธีระ', 'ปิยะ', 'นภา', 'จันทร์', 'ศิริ', 'วรรณา', 'สมศักดิ์', 'อรทัย', 'ชาญ', 'พิมพ์', 'เอกชัย', 'รัตนา'];
const THAI_LAST = ['ใจดี', 'สุขสันต์', 'รุ่งเรือง', 'ทองคำ', 'แสงจันทร์', 'ศรีสุข', 'บุญมี', 'พูลสวัสดิ์', 'มั่นคง', 'เจริญพร'];
const PRODUCT_CATS = ['เสื้อผ้า', 'เครื่องใช้ไฟฟ้า', 'ของใช้ในบ้าน', 'อาหารเสริม', 'เครื่องสำอาง', 'อุปกรณ์กีฬา', 'ของเล่น'];

function genEmployees(rng, count) {
  const employees = [];
  for (let i = 1; i <= count; i++) {
    const dept = weightedPick(rng, { OB: 18, IB: 14, TS: 8, INV: 10, LOG: 8, QA: 10, RETURN: 6, HK: 6, ACC: 5, LP: 5, AUDIT: 4 });
    const type = weightedPick(rng, { IN_HOUSE: 45, OUTSOURCE: 40, PART_TIME: 15 });
    const attendanceRoll = rng();
    const attendance = attendanceRoll < 0.87 ? 'PRESENT' : attendanceRoll < 0.93 ? 'LATE' : attendanceRoll < 0.97 ? 'LEAVE' : 'ABSENT';
    const present = attendance === 'PRESENT' || attendance === 'LATE';
    const checkInHour = attendance === 'LATE' ? randInt(rng, 8, 9) : 7;
    const checkIn = present ? `${pad2(checkInHour)}:${pad2(randInt(rng, 0, 59))}` : null;
    const checkOut = present && rng() < 0.85 ? `${pad2(randInt(rng, 16, 20))}:${pad2(randInt(rng, 0, 59))}` : null;
    const ot = present && rng() < 0.3 ? randInt(rng, 1, 4) : 0;
    employees.push({
      id: `EMP-${String(i).padStart(4, '0')}`,
      employee_code: `WH${String(i).padStart(5, '0')}`,
      name: `${pick(rng, THAI_FIRST)} ${pick(rng, THAI_LAST)}`,
      department: dept,
      employee_type: type,
      shift: pick(rng, SHIFTS),
      warehouse: 'TPY',
      status: rng() < 0.985 ? 'ACTIVE' : 'INACTIVE',
      attendance,
      check_in: checkIn,
      check_out: checkOut,
      ot,
    });
  }
  return employees;
}

function genOutboundOrderRow(rng, id, day, isToday, hour) {
  const weights = isToday || day.isRecentOpen ? OUTBOUND_STATUS_WEIGHTS_TODAY : OUTBOUND_STATUS_WEIGHTS_PAST;
  const status = weightedPick(rng, weights);
  const created = new Date(day.date); created.setHours(hour, randInt(rng, 0, 59), 0, 0);
  const stageTime = (mins) => { const t = new Date(created); t.setMinutes(t.getMinutes() + mins); return t.toISOString(); };
  const progressed = ['PACKING', 'QC', 'READY', 'SHIPPED'].includes(status);
  return {
    id: `ob-${day.key}-${id}`,
    order_id: `SO${day.key.replace(/-/g, '')}${String(id).padStart(4, '0')}`,
    sku: `SKU-${randInt(rng, 1000, 9999)}`,
    product: `${pick(rng, PRODUCT_CATS)} รุ่น ${randInt(rng, 100, 999)}`,
    quantity: randInt(rng, 1, 8),
    channel: pick(rng, CHANNELS),
    carrier: pick(rng, CARRIERS),
    status,
    created_at: created.toISOString(),
    picked_at: ['PACKING', 'QC', 'READY', 'SHIPPED'].includes(status) || (status === 'PICKING' && rng() < 0.4) ? stageTime(15) : null,
    packed_at: ['QC', 'READY', 'SHIPPED'].includes(status) ? stageTime(40) : null,
    qc_at: ['READY', 'SHIPPED'].includes(status) ? stageTime(65) : null,
    shipped_at: status === 'SHIPPED' ? stageTime(120) : null,
    warehouse: 'TPY',
    shift: hour < 15 ? 'กะเช้า' : hour < 22 ? 'กะบ่าย' : 'กะดึก',
    employee: `${pick(rng, THAI_FIRST)} ${pick(rng, THAI_LAST)}`,
  };
}

function genInboundOrderRow(rng, id, day, isToday) {
  const weights = isToday || day.isRecentOpen ? INBOUND_STATUS_WEIGHTS_TODAY : INBOUND_STATUS_WEIGHTS_PAST;
  const status = weightedPick(rng, weights);
  const receiveDate = new Date(day.date); receiveDate.setHours(randInt(rng, 7, 18), randInt(rng, 0, 59), 0, 0);
  const expected = randInt(rng, 50, 2000);
  const receivedRatio = status === 'EXPECTED' ? 0 : status === 'RECEIVING' ? rng() * 0.6 : status === 'PENDING' ? rng() * 0.5 : 1;
  return {
    id: `ib-${day.key}-${id}`,
    inbound_no: `IB${day.key.replace(/-/g, '')}${String(id).padStart(4, '0')}`,
    supplier: pick(rng, SUPPLIERS),
    sku: `SKU-${randInt(rng, 1000, 9999)}`,
    product: `${pick(rng, PRODUCT_CATS)} รุ่น ${randInt(rng, 100, 999)}`,
    expected_qty: expected,
    received_qty: Math.round(expected * receivedRatio),
    status,
    receive_date: receiveDate.toISOString(),
    qc_status: ['COMPLETED', 'PUTAWAY'].includes(status) ? 'ผ่าน' : status === 'REJECTED' ? 'ไม่ผ่าน' : 'รอตรวจสอบ',
    location: `${pick(rng, ['A', 'B', 'C', 'D'])}-${randInt(rng, 1, 20)}-${randInt(rng, 1, 9)}`,
    warehouse: 'TPY',
    carton: randInt(rng, 5, 120),
    pallet: randInt(rng, 1, 20),
    responsible: `${pick(rng, THAI_FIRST)} ${pick(rng, THAI_LAST)}`,
  };
}

function genAccident(rng, id, date) {
  const severity = weightedPick(rng, { NEAR_MISS: 55, FIRST_AID: 28, PROPERTY_DAMAGE: 13, LTI: 3.7, FATALITY: 0.0 });
  const dept = pick(rng, DEPARTMENTS.filter(d => !['ACC', 'AUDIT'].includes(d.code)));
  const isClosed = rng() < 0.7;
  const status = isClosed ? 'Closed' : pick(rng, ['Open', 'Investigating', 'Corrective Action', 'Completed']);
  const time = `${pad2(randInt(rng, 6, 22))}:${pad2(randInt(rng, 0, 59))}`;
  return {
    id: `acc-${id}`,
    accident_no: `ACC-${dateStr(date).replace(/-/g, '')}-${String(id).padStart(3, '0')}`,
    date: dateStr(date),
    time,
    location: `${pick(rng, ['Zone A', 'Zone B', 'Zone C', 'Dock 1', 'Dock 2', 'Racking Aisle 5', 'Loading Bay'])}`,
    department: dept.code,
    employee: `${pick(rng, THAI_FIRST)} ${pick(rng, THAI_LAST)}`,
    type: pick(rng, ACCIDENT_TYPES),
    severity,
    description: 'เหตุการณ์เกิดขึ้นระหว่างการปฏิบัติงานตามปกติในพื้นที่ปฏิบัติงาน',
    cause: pick(rng, ['ไม่ปฏิบัติตามขั้นตอนความปลอดภัย', 'พื้นที่ลื่น/เปียก', 'อุปกรณ์ชำรุด', 'ขาดสมาธิ/เร่งรีบ', 'ไม่สวมอุปกรณ์ป้องกัน']),
    damage: severity === 'PROPERTY_DAMAGE' ? `ประมาณ ${randInt(rng, 2, 80) * 1000} บาท` : '-',
    corrective_action: isClosed ? 'อบรมทบทวนความปลอดภัยและปรับปรุงจุดเสี่ยงเรียบร้อยแล้ว' : 'อยู่ระหว่างดำเนินการแก้ไข',
    responsible: `${pick(rng, THAI_FIRST)} ${pick(rng, THAI_LAST)}`,
    status,
    closed_date: isClosed ? dateStr(addDays(date, randInt(rng, 1, 10))) : null,
    main_image_count: rng() < 0.6 ? randInt(rng, 1, 4) : 0,
  };
}

/**
 * สร้าง dataset จำลองทั้งหมด (seed ตามวันที่ปัจจุบัน — ข้อมูลจะคงที่ตลอดวัน แต่เปลี่ยนทุกวันให้ดูสมจริง)
 */
export function buildDataset(now = new Date()) {
  const rng = mulberry32(hashSeed(dateStr(now)));
  const todayKey = dateStr(now);

  // ---- Employees (snapshot ปัจจุบัน) ----
  const employees = genEmployees(rng, 214);

  // ---- Outbound / Inbound: order-level detail สำหรับ ORDER_DETAIL_DAYS วันล่าสุด ----
  const outboundDetail = [];
  const inboundDetail = [];
  const dailyOutbound = {};
  const dailyInbound = {};

  for (let offset = DAILY_AGGREGATE_DAYS - 1; offset >= 0; offset--) {
    const date = addDays(now, -offset);
    const key = dateStr(date);
    const isToday = key === todayKey;
    const withinDetailWindow = offset < ORDER_DETAIL_DAYS;
    const day = { date, key, isRecentOpen: offset < 3 };

    const obCount = randInt(rng, 620, 980);
    const ibCount = randInt(rng, 180, 340);

    const obBuckets = { PICKING: 0, PACKING: 0, QC: 0, READY: 0, SHIPPED: 0, PENDING: 0, CANCELLED: 0, ERROR: 0 };
    const ibBuckets = { EXPECTED: 0, RECEIVING: 0, QC: 0, PUTAWAY: 0, COMPLETED: 0, PENDING: 0, REJECTED: 0 };
    let obQty = 0, ibExpectedQty = 0, ibReceivedQty = 0, ibCarton = 0, ibPallet = 0, ibSkuSet = new Set();

    for (let i = 1; i <= obCount; i++) {
      const hour = Math.min(23, Math.max(7, Math.round(randInt(rng, 700, 2359) / 100)));
      if (withinDetailWindow) {
        const row = genOutboundOrderRow(rng, i, day, isToday, hour);
        outboundDetail.push(row);
        obBuckets[row.status]++;
        obQty += row.quantity;
      } else {
        const weights = day.isRecentOpen ? OUTBOUND_STATUS_WEIGHTS_TODAY : OUTBOUND_STATUS_WEIGHTS_PAST;
        obBuckets[weightedPick(rng, weights)]++;
        obQty += randInt(rng, 1, 8);
      }
    }
    for (let i = 1; i <= ibCount; i++) {
      if (withinDetailWindow) {
        const row = genInboundOrderRow(rng, i, day, isToday);
        inboundDetail.push(row);
        ibBuckets[row.status]++;
        ibExpectedQty += row.expected_qty; ibReceivedQty += row.received_qty;
        ibCarton += row.carton; ibPallet += row.pallet; ibSkuSet.add(row.sku);
      } else {
        const weights = day.isRecentOpen ? INBOUND_STATUS_WEIGHTS_TODAY : INBOUND_STATUS_WEIGHTS_PAST;
        ibBuckets[weightedPick(rng, weights)]++;
        const exp = randInt(rng, 50, 2000);
        ibExpectedQty += exp; ibReceivedQty += Math.round(exp * (0.85 + rng() * 0.15));
        ibCarton += randInt(rng, 5, 120); ibPallet += randInt(rng, 1, 20);
      }
    }

    dailyOutbound[key] = { date: key, total: obCount, qty: obQty, target: 900, ...obBuckets };
    dailyInbound[key] = {
      date: key, total: ibCount, target: 260, expected_qty: ibExpectedQty, received_qty: ibReceivedQty,
      total_sku: withinDetailWindow ? ibSkuSet.size : randInt(rng, 80, 160), total_carton: ibCarton, total_pallet: ibPallet, ...ibBuckets,
    };
  }

  // ---- Hourly bucket ของ "วันนี้"/"เมื่อวาน" จาก detail ----
  function hourlyFor(dayKey, detail, dateField = 'created_at') {
    const buckets = {};
    for (let h = 7; h <= 23; h++) buckets[h] = { hour: h, created: 0, processed: 0 };
    for (const row of detail) {
      const dateVal = row[dateField];
      if (!dateVal || !dateVal.startsWith(dayKey)) continue;
      const h = new Date(dateVal).getHours();
      if (buckets[h]) {
        buckets[h].created++;
        if (row.status !== 'PENDING' && row.status !== 'CANCELLED' && row.status !== 'ERROR') buckets[h].processed++;
      }
    }
    return Object.values(buckets);
  }

  // ---- Accidents: รายปีที่ผ่านมา ----
  const accidents = [];
  let accId = 1;
  for (let offset = DAILY_AGGREGATE_DAYS - 1; offset >= 0; offset--) {
    const date = addDays(now, -offset);
    if (rng() < 0.18) { // ความถี่เฉลี่ยประมาณ 60-70 เหตุการณ์/ปี
      accidents.push(genAccident(rng, accId++, date));
    }
  }

  // ---- Manpower attendance history (rollup ต่อแผนกต่อวัน) ----
  const attendanceHistory = {};
  for (let offset = ATTENDANCE_HISTORY_DAYS - 1; offset >= 0; offset--) {
    const date = addDays(now, -offset);
    const key = dateStr(date);
    const perDept = {};
    for (const d of DEPARTMENTS) {
      const total = randInt(rng, 8, 32);
      const absent = Math.round(total * (rng() * 0.06));
      const leave = Math.round(total * (rng() * 0.04));
      const late = Math.round(total * (rng() * 0.08));
      const present = Math.max(0, total - absent - leave);
      const ot = randInt(rng, 0, Math.round(total * 0.3));
      const inHouse = Math.round(total * 0.45);
      const outsource = Math.round(total * 0.40);
      const partTime = Math.max(0, total - inHouse - outsource);
      perDept[d.code] = { total, inHouse, outsource, partTime, present, absent, leave, late, ot };
    }
    attendanceHistory[key] = perDept;
  }
  // วันนี้ให้ตรงกับ employees snapshot จริง เพื่อไม่ให้ตัวเลขขัดแย้งกัน
  {
    const perDept = {};
    for (const d of DEPARTMENTS) {
      const deptEmp = employees.filter(e => e.department === d.code && e.status === 'ACTIVE');
      perDept[d.code] = {
        total: deptEmp.length,
        inHouse: deptEmp.filter(e => e.employee_type === 'IN_HOUSE').length,
        outsource: deptEmp.filter(e => e.employee_type === 'OUTSOURCE').length,
        partTime: deptEmp.filter(e => e.employee_type === 'PART_TIME').length,
        present: deptEmp.filter(e => e.attendance === 'PRESENT' || e.attendance === 'LATE').length,
        absent: deptEmp.filter(e => e.attendance === 'ABSENT').length,
        leave: deptEmp.filter(e => e.attendance === 'LEAVE').length,
        late: deptEmp.filter(e => e.attendance === 'LATE').length,
        ot: deptEmp.reduce((s, e) => s + (e.ot || 0), 0),
      };
    }
    attendanceHistory[todayKey] = perDept;
  }

  return {
    generatedAt: now.toISOString(),
    todayKey,
    employees,
    outboundDetail,
    inboundDetail,
    dailyOutbound,
    dailyInbound,
    hourlyOutboundToday: hourlyFor(todayKey, outboundDetail, 'created_at'),
    hourlyOutboundYesterday: hourlyFor(dateStr(addDays(now, -1)), outboundDetail, 'created_at'),
    hourlyInboundToday: hourlyFor(todayKey, inboundDetail, 'receive_date'),
    accidents,
    attendanceHistory,
    meta: { orderDetailDays: ORDER_DETAIL_DAYS, dailyAggregateDays: DAILY_AGGREGATE_DAYS },
  };
}

/**
 * จำลอง "การอัปเดตแบบเรียลไทม์": ขยับสถานะออเดอร์/รับเข้าบางส่วนของวันนี้ไปข้างหน้า
 * และสุ่มปรับ attendance เล็กน้อย — ใช้ตอน Auto Refresh เพื่อให้ตัวเลขขยับแบบสมจริงโดยไม่ re-random ทั้งชุด
 */
export function tickDataset(dataset) {
  const rng = Math.random;
  const forward = { PICKING: 'PACKING', PACKING: 'QC', QC: 'READY', READY: 'SHIPPED' };
  const todayKey = dataset.todayKey;
  let moved = 0;
  for (const row of dataset.outboundDetail) {
    if (!row.created_at.startsWith(todayKey)) continue;
    if (forward[row.status] && rng() < 0.04 && moved < 12) {
      row.status = forward[row.status];
      moved++;
    }
  }
  const ibForward = { EXPECTED: 'RECEIVING', RECEIVING: 'QC', QC: 'PUTAWAY', PUTAWAY: 'COMPLETED' };
  let movedIb = 0;
  for (const row of dataset.inboundDetail) {
    if (!row.receive_date.startsWith(todayKey)) continue;
    if (ibForward[row.status] && rng() < 0.04 && movedIb < 8) {
      row.status = ibForward[row.status];
      movedIb++;
    }
  }
  // sync daily aggregate ของวันนี้ให้ตรงกับ detail หลังขยับสถานะ
  recomputeTodayAggregate(dataset);
  dataset.generatedAt = new Date().toISOString();
  return dataset;
}

function recomputeTodayAggregate(dataset) {
  const key = dataset.todayKey;
  const obBuckets = { PICKING: 0, PACKING: 0, QC: 0, READY: 0, SHIPPED: 0, PENDING: 0, CANCELLED: 0, ERROR: 0 };
  let total = 0, qty = 0;
  for (const row of dataset.outboundDetail) {
    if (!row.created_at.startsWith(key)) continue;
    obBuckets[row.status]++; total++; qty += row.quantity;
  }
  if (total > 0) dataset.dailyOutbound[key] = { ...dataset.dailyOutbound[key], total, qty, ...obBuckets };

  const ibBuckets = { EXPECTED: 0, RECEIVING: 0, QC: 0, PUTAWAY: 0, COMPLETED: 0, PENDING: 0, REJECTED: 0 };
  let ibTotal = 0, expQty = 0, recQty = 0;
  for (const row of dataset.inboundDetail) {
    if (!row.receive_date.startsWith(key)) continue;
    ibBuckets[row.status]++; ibTotal++; expQty += row.expected_qty; recQty += row.received_qty;
  }
  if (ibTotal > 0) dataset.dailyInbound[key] = { ...dataset.dailyInbound[key], total: ibTotal, expected_qty: expQty, received_qty: recQty, ...ibBuckets };
}
