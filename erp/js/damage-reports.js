// ===================================================================
// damage-reports.js — โมดูลกลางของระบบ Damage Area Report (DAR)
// ใช้ร่วมกัน 3 หน้า: damage-reports.html (dashboard), damage-report-form.html
// (create/edit), damage-report-view.html (detail)
// ===================================================================
import { db } from "./auth.js";
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  runTransaction, writeBatch, serverTimestamp, increment,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { cloudinaryConfig } from "./cloudinary-config.js";

// อัปโหลดรูปภาพไป Cloudinary (unsigned upload preset) แทน Firebase Storage
// เหตุผล: Firebase Storage เปลี่ยนนโยบายให้ต้องอัปเกรดเป็นแผน Blaze (ผูกบัตรเครดิต) ก่อนถึงจะเปิดใช้ได้
// ดูวิธีตั้งค่าใน cloudinary-config.example.js
async function cloudinaryUpload(blob, folder) {
  if (cloudinaryConfig.cloudName === "YOUR_CLOUD_NAME" || cloudinaryConfig.uploadPreset === "YOUR_UNSIGNED_UPLOAD_PRESET") {
    throw new Error("ยังไม่ได้ตั้งค่า Cloudinary — ดูวิธีตั้งค่าใน erp/js/cloudinary-config.example.js");
  }
  const form = new FormData();
  form.append("file", blob, "photo.jpg");
  form.append("upload_preset", cloudinaryConfig.uploadPreset);
  if (folder) form.append("folder", folder);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/image/upload`, {
    method: "POST", body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || "อัปโหลดรูปไม่สำเร็จ (Cloudinary)");
  }
  return res.json();
}

// ---------- ค่าคงที่ตามสเปก ----------
export const DAMAGE_TYPES = [
  "อาคาร/โครงสร้าง", "พื้น/ผนัง/เพดาน", "ประตู/รั้ว", "ชั้นวางสินค้า",
  "อุปกรณ์คลังสินค้า", "รถ/เครื่องจักร", "ระบบไฟฟ้า", "ระบบอื่น ๆ", "อื่น ๆ",
];

export const SEVERITY_LIST = ["ต่ำ", "ปานกลาง", "สูง", "Critical"];
export const SEVERITY_LABEL = {
  "ต่ำ": "ต่ำ", "ปานกลาง": "ปานกลาง", "สูง": "สูง",
  "Critical": "Critical / ต้องดำเนินการทันที",
};
export const SEVERITY_CLASS = {
  "ต่ำ": "sev-low", "ปานกลาง": "sev-medium", "สูง": "sev-high", "Critical": "sev-critical",
};

export const STATUS_LIST = [
  "New", "รับเรื่องแล้ว", "กำลังตรวจสอบ", "รอดำเนินการ",
  "กำลังซ่อม", "ดำเนินการเสร็จแล้ว", "ปิดรายงาน",
];
export const STATUS_CLOSED = "ปิดรายงาน";
export const STATUS_BADGE = {
  "New": "badge-new", "รับเรื่องแล้ว": "badge-progress", "กำลังตรวจสอบ": "badge-progress",
  "รอดำเนินการ": "badge-pending", "กำลังซ่อม": "badge-progress",
  "ดำเนินการเสร็จแล้ว": "badge-done", "ปิดรายงาน": "badge-closed",
};

const HISTORY_ACTION_LABEL = {
  create: "สร้างรายงาน", update_field: "แก้ไขข้อมูล", change_status: "เปลี่ยนสถานะ",
  upload_image: "อัปโหลดรูปภาพ", delete_image: "ลบรูปภาพ", close: "ปิดรายงาน",
};
export function historyActionLabel(action) { return HISTORY_ACTION_LABEL[action] || action; }

// ---------- Validation (สเปกข้อ 14) ----------
export function validateReportData(data, imageCount) {
  const errors = [];
  if (!data.reportDate) errors.push("กรุณาระบุวันที่พบความเสียหาย");
  if (!data.reporter) errors.push("กรุณาระบุผู้แจ้ง");
  if (!data.zone) errors.push("กรุณาระบุพื้นที่/โซน");
  if (!data.damageType) errors.push("กรุณาเลือกประเภทความเสียหาย");
  if (!data.severity) errors.push("กรุณาเลือกระดับความรุนแรง");
  if (!data.title) errors.push("กรุณาระบุหัวข้อความเสียหาย");
  if (!data.description) errors.push("กรุณาระบุรายละเอียดความเสียหาย");
  if (!imageCount || imageCount < 1) errors.push("ต้องแนบรูปภาพอย่างน้อย 1 รูป");
  return errors;
}

// ---------- เลขที่รายงานอัตโนมัติ: DAR-YYYYMMDD-NNN ----------
// ใช้ counters/damageReportCounter รีเซ็ตรายวัน (pattern เดียวกับ pgCounter ใน dashboard-warehouse.html)
async function genReportNo() {
  const d = new Date();
  const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const counterRef = doc(db, "counters", "damageReportCounter");
  const seq = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const cur = snap.exists() ? snap.data() : {};
    const next = cur.date === dateStr ? (cur.value || 0) + 1 : 1;
    tx.set(counterRef, { date: dateStr, value: next });
    return next;
  });
  return `DAR-${dateStr}-${String(seq).padStart(3, "0")}`;
}

function stringifyVal(v) {
  if (v === undefined || v === null) return "";
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

// ---------- Audit Trail (สเปกข้อ 12) ----------
export async function logHistory(reportId, action, field, oldValue, newValue, user) {
  const hRef = doc(collection(db, "damageReports", reportId, "history"));
  await setDoc(hRef, {
    action, field: field || null,
    oldValue: stringifyVal(oldValue), newValue: stringifyVal(newValue),
    changedBy: user.uid, changedByName: user.name || user.email || "",
    changedAt: serverTimestamp(),
  });
}

export async function listHistory(reportId) {
  const snap = await getDocs(collection(db, "damageReports", reportId, "history"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.changedAt?.toMillis?.() || 0) - (a.changedAt?.toMillis?.() || 0));
}

// ---------- CRUD รายงาน ----------
export async function createReport(data, user) {
  const reportNo = await genReportNo();
  const reportRef = doc(collection(db, "damageReports"));
  const payload = {
    reportNo,
    reportDate: data.reportDate, reportTime: data.reportTime || "",
    reporterUid: user.uid, reporterName: data.reporter || user.name || "",
    department: data.department || "",
    zone: data.zone || "",
    location: data.location || {},
    damageType: data.damageType, severity: data.severity,
    title: data.title, description: data.description || "", cause: data.cause || "",
    impact: data.impact || { operations: false, safety: false, property: false, details: "" },
    responsiblePerson: data.responsiblePerson || "", responsibleDept: data.responsibleDept || "",
    correctiveAction: data.correctiveAction || "",
    estimatedCost: Number(data.estimatedCost) || 0, dueDate: data.dueDate || "",
    status: "New",
    mainImageCount: 0, beforeImageCount: 0, afterImageCount: 0,
    createdBy: user.uid, createdByName: user.name || user.email || "",
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  };
  await setDoc(reportRef, payload);
  await logHistory(reportRef.id, "create", null, null, reportNo, user);
  return reportRef.id;
}

// changes = partial object ของฟิลด์ระดับบนสุดที่จะแก้ (location/impact ส่งทั้งก้อนแทนได้)
export async function updateReport(reportId, changes, user) {
  const ref = doc(db, "damageReports", reportId);
  const snap = await getDoc(ref);
  const before = snap.exists() ? snap.data() : {};
  const batch = writeBatch(db);
  for (const key of Object.keys(changes)) {
    if (JSON.stringify(before[key] ?? null) === JSON.stringify(changes[key] ?? null)) continue;
    const hRef = doc(collection(db, "damageReports", reportId, "history"));
    batch.set(hRef, {
      action: "update_field", field: key,
      oldValue: stringifyVal(before[key]), newValue: stringifyVal(changes[key]),
      changedBy: user.uid, changedByName: user.name || user.email || "",
      changedAt: serverTimestamp(),
    });
  }
  batch.update(ref, { ...changes, updatedBy: user.uid, updatedAt: serverTimestamp() });
  await batch.commit();
}

export async function changeStatus(reportId, newStatus, user) {
  const ref = doc(db, "damageReports", reportId);
  const snap = await getDoc(ref);
  const oldStatus = snap.data()?.status;
  const extra = { status: newStatus, updatedBy: user.uid, updatedAt: serverTimestamp() };
  if (newStatus === STATUS_CLOSED) extra.closedAt = serverTimestamp();
  await updateDoc(ref, extra);
  await logHistory(reportId, "change_status", "status", oldStatus, newStatus, user);
}

export async function getReport(reportId) {
  const snap = await getDoc(doc(db, "damageReports", reportId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listReports() {
  const snap = await getDocs(collection(db, "damageReports"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
}

export async function deleteReport(reportId) {
  // ลบ subcollections แล้วค่อยลบเอกสารหลัก — รูปจริงบน Cloudinary ไม่ถูกลบ (ดูหมายเหตุใน deleteImage ด้านล่าง)
  const imgSnap = await getDocs(collection(db, "damageReports", reportId, "images"));
  const histSnap = await getDocs(collection(db, "damageReports", reportId, "history"));
  const batch = writeBatch(db);
  imgSnap.docs.forEach((d) => batch.delete(d.ref));
  histSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(db, "damageReports", reportId));
  await batch.commit();
}

// ---------- รูปภาพ ----------
// บีบอัดรูปฝั่ง client ก่อนอัปโหลด (คลังใช้มือถือ/wifi ไม่แรง — ไม่มีในสเปกตรงๆ แต่จำเป็นเพื่อความเร็ว)
export function compressImage(file, maxDim = 1600, quality = 0.8) {
  return new Promise((resolve, reject) => {
    if (!file.type || !file.type.startsWith("image/")) { resolve(file); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("อ่านไฟล์รูปไม่สำเร็จ"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("เปิดไฟล์รูปไม่สำเร็จ"));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => resolve(blob || file), "image/jpeg", quality);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

const IMAGE_COUNT_FIELD = { main: "mainImageCount", before: "beforeImageCount", after: "afterImageCount" };

export async function uploadImage(reportId, file, meta, user) {
  const blob = await compressImage(file);
  const uploaded = await cloudinaryUpload(blob, `damage-reports/${reportId}`);
  const imgRef = doc(collection(db, "damageReports", reportId, "images"));
  const imageType = meta.imageType || "main";
  await setDoc(imgRef, {
    url: uploaded.secure_url, publicId: uploaded.public_id, imageType,
    caption: meta.caption || "", location: meta.location || "",
    capturedAt: meta.capturedAt || new Date().toISOString(),
    sequence: meta.sequence ?? 0,
    uploadedBy: user.uid, uploadedAt: serverTimestamp(),
  });
  await updateDoc(doc(db, "damageReports", reportId), {
    [IMAGE_COUNT_FIELD[imageType]]: increment(1), updatedAt: serverTimestamp(),
  });
  await logHistory(reportId, "upload_image", imageType, null, meta.caption || imgRef.id, user);
  return imgRef.id;
}

export async function deleteImage(reportId, imageId, user) {
  const imgRef = doc(db, "damageReports", reportId, "images", imageId);
  const snap = await getDoc(imgRef);
  if (!snap.exists()) return;
  const img = snap.data();
  // ลบได้แค่ reference ในแอป — ไฟล์จริงบน Cloudinary ยังอยู่ (unsigned upload preset ลบไฟล์จาก
  // client โดยตรงไม่ได้ ต้องมี API secret ซึ่งห้ามฝังในโค้ดฝั่งเว็บ) ไม่กระทบการใช้งานเพราะ free tier มีพื้นที่เหลือเฟือ
  await deleteDoc(imgRef);
  await updateDoc(doc(db, "damageReports", reportId), {
    [IMAGE_COUNT_FIELD[img.imageType] || "mainImageCount"]: increment(-1), updatedAt: serverTimestamp(),
  });
  await logHistory(reportId, "delete_image", img.imageType, img.caption || imageId, null, user);
}

export async function updateImageMeta(reportId, imageId, meta) {
  await updateDoc(doc(db, "damageReports", reportId, "images", imageId), meta);
}

export async function setImageSequence(reportId, imageId, sequence) {
  await updateDoc(doc(db, "damageReports", reportId, "images", imageId), { sequence });
}

export async function reorderImages(reportId, orderedImageIds) {
  const batch = writeBatch(db);
  orderedImageIds.forEach((id, idx) => {
    batch.update(doc(db, "damageReports", reportId, "images", id), { sequence: idx });
  });
  await batch.commit();
}

export async function listImages(reportId, imageType) {
  const snap = await getDocs(collection(db, "damageReports", reportId, "images"));
  let arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (imageType) arr = arr.filter((i) => i.imageType === imageType);
  arr.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
  return arr;
}

// ---------- KPI / กราฟ / Export (สำหรับ dashboard) ----------
export function computeKPIs(reports) {
  const k = { total: reports.length, new: 0, inProgress: 0, pending: 0, done: 0, critical: 0 };
  const inProgressSet = new Set(["รับเรื่องแล้ว", "กำลังตรวจสอบ", "กำลังซ่อม"]);
  const doneSet = new Set(["ดำเนินการเสร็จแล้ว", "ปิดรายงาน"]);
  for (const r of reports) {
    if (r.status === "New") k.new++;
    else if (inProgressSet.has(r.status)) k.inProgress++;
    else if (r.status === "รอดำเนินการ") k.pending++;
    else if (doneSet.has(r.status)) k.done++;
    if (r.severity === "Critical") k.critical++;
  }
  return k;
}

export function groupCount(reports, keyFn) {
  const map = new Map();
  for (const r of reports) {
    const key = keyFn(r) || "ไม่ระบุ";
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

// แนวโน้ม 6 เดือนล่าสุด นับจากฟิลด์ reportDate (YYYY-MM-DD)
export function monthlyTrend(reports, months = 6) {
  const now = new Date();
  const buckets = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleDateString("th-TH", { month: "short", year: "2-digit" }), count: 0 });
  }
  const byKey = Object.fromEntries(buckets.map((b) => [b.key, b]));
  for (const r of reports) {
    const key = (r.reportDate || "").slice(0, 7);
    if (byKey[key]) byKey[key].count++;
  }
  return buckets;
}

function csvCell(v) {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(reports) {
  const headers = ["เลขที่รายงาน", "วันที่พบ", "ผู้แจ้ง", "แผนก", "โซน", "ประเภทความเสียหาย", "ระดับความรุนแรง", "หัวข้อ", "สถานะ", "ผู้รับผิดชอบ", "งบประมาณโดยประมาณ", "กำหนดดำเนินการ"];
  const rows = reports.map((r) => [
    r.reportNo, r.reportDate, r.reporterName, r.department, r.zone, r.damageType,
    SEVERITY_LABEL[r.severity] || r.severity, r.title, r.status, r.responsiblePerson,
    r.estimatedCost, r.dueDate,
  ]);
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export function downloadCSV(filename, csvContent) {
  const blob = new Blob(["﻿" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
