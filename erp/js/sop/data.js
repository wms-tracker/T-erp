// ===================================================================
// SOP Management — ชั้นข้อมูล (Firestore + Cloudinary)
// สิทธิ์ทุกอย่างถูกบังคับซ้ำที่ Firestore Rules (erp/firestore.rules.example หัวข้อ "SOP Management")
// ฟังก์ชัน perms ด้านล่างเป็นสำเนาของกฎเดียวกัน ใช้แค่ซ่อน/แสดงปุ่มในหน้าเว็บ
// ===================================================================
import { db } from "../auth.js";
import {
  collection, doc, getDoc, getDocs, query, where, orderBy, limit as qLimit,
  onSnapshot, writeBatch, runTransaction, serverTimestamp, setDoc, updateDoc, deleteDoc, Timestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { cloudinaryConfig } from "../cloudinary-config.js";

export const STATUS = {
  draft: "ฉบับร่าง (Draft)", submitted: "ส่งตรวจ (Submitted)", dept_review: "หัวหน้าแผนกตรวจสอบ (Department Review)",
  manager_approval: "รอผู้จัดการอนุมัติ (Manager Approval)", published: "ประกาศใช้ (Published)",
  revision_required: "ส่งกลับแก้ไข (Revision Required)", obsolete: "ยกเลิกใช้งาน (Obsolete)",
  superseded: "ถูกแทนที่ด้วยฉบับใหม่ (Superseded)", cancelled: "ยกเลิกร่าง (Cancelled)",
};
export const WORK_STATUSES = ["draft", "submitted", "dept_review", "manager_approval", "revision_required"];
export const PUBLIC_STATUSES = ["published", "superseded", "obsolete"];
export const SOP_ROLES = { admin: "ผู้ดูแลระบบ", manager: "Warehouse Operations Manager", dept_head: "หัวหน้าแผนก", author: "ผู้จัดทำ SOP", viewer: "ผู้อ่าน" };
export const revLabel = r => "Rev." + String(r ?? 0).padStart(2, "0");
const DEFAULT_SETTINGS = { company_name: "", company_name_en: "", logo_url: "", review_warn_days: 30, default_review_months: 12, doc_font: "Tahoma" };
const SEED_DEPTS = [
  ["OB", "Outbound", "งานจ่ายสินค้าออก / Picking / Packing / Loading"],
  ["IB", "Inbound", "งานรับสินค้าเข้า / ตรวจรับ / Put-away"],
  ["INV", "Inventory", "ควบคุมสินค้าคงคลัง / Cycle Count / Stock Adjustment"],
  ["LOG", "Logistics / 3PL", "บริหารงานขนส่งและผู้ให้บริการภายนอก"],
  ["TRN", "Transportation", "บริหารรถขนส่งและการจัดส่ง"],
];

/* ---------- state ---------- */
export const S = { profile: null, uid: null, name: "", role: "viewer", deptId: "", depts: [], members: [], settings: { ...DEFAULT_SETTINGS } };

const iso = v => (v && typeof v.toDate === "function") ? v.toDate().toISOString() : (v || null);
const fail = msg => { throw new Error(msg); };
export const today = () => new Date().toLocaleDateString("sv-SE");
export const isPriv = () => S.role === "admin" || S.role === "manager";
export const deptById = id => S.depts.find(d => d.id === id);
export const memberById = id => S.members.find(m => m.id === id);
const nameOf = id => (id === S.uid ? S.name : memberById(id)?.name) || "";
const friendly = e => {
  if (e && e.code === "permission-denied") return new Error("ไม่มีสิทธิ์ทำรายการนี้ (ระบบความปลอดภัยของฐานข้อมูลปฏิเสธ) — ข้อมูลอาจถูกเปลี่ยนโดยผู้ใช้อื่น ลองโหลดหน้าใหม่");
  return e;
};

/* ---------- init ---------- */
export async function init(profile) {
  S.profile = profile; S.uid = profile.uid; S.name = profile.name || profile.email || "ผู้ใช้";
  const m = await getDoc(doc(db, "sopMembers", S.uid)).catch(() => null);
  const member = m && m.exists() ? m.data() : null;
  S.role = profile.role === "admin" ? "admin"
    : (member && member.active === false ? "viewer" : (member?.sopRole || (profile.role === "manager" ? "manager" : "viewer")));
  S.deptId = member?.deptId || "";
  if (member?.name) S.name = member.name;
  await loadMeta();
  if (S.role === "admin" && S.depts.length === 0) {
    const b = writeBatch(db);
    SEED_DEPTS.forEach(([code, name, description], i) => b.set(doc(db, "sopDepartments", code), { code, name, description, active: true, sort: i + 1, created_at: serverTimestamp() }));
    await b.commit();
    await loadMeta();
  }
}
export async function loadMeta() {
  const [d, mm, st] = await Promise.all([
    getDocs(collection(db, "sopDepartments")), getDocs(collection(db, "sopMembers")), getDoc(doc(db, "sopSettings", "main")),
  ]);
  S.depts = d.docs.map(x => ({ id: x.id, ...x.data() })).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.code.localeCompare(b.code));
  S.members = mm.docs.map(x => ({ id: x.id, ...x.data() })).sort((a, b) => (a.name || "").localeCompare(b.name || "", "th"));
  S.settings = { ...DEFAULT_SETTINGS, ...(st.exists() ? st.data() : {}) };
}

/* ---------- permissions (สำเนาของ Firestore Rules) ---------- */
const inMyDept = deptId => !!S.deptId && S.deptId === deptId;
export function canSeeWork(v) {
  if (isPriv()) return true;
  if (v && [v.prepared_by, v.owner_id, v.reviewer_id, v.approver_id].includes(S.uid)) return true;
  return ["author", "dept_head"].includes(S.role) && inMyDept(v?.department_id);
}
export const canCreateIn = deptId => isPriv() || (["author", "dept_head"].includes(S.role) && inMyDept(deptId));
export const canCreateAny = () => isPriv() || (["author", "dept_head"].includes(S.role) && !!S.deptId);
export function separationIssue(v) {
  if (v.prepared_by === S.uid) return "ผู้จัดทำไม่สามารถตรวจสอบ/อนุมัติ SOP ของตนเองได้";
  if ((v.editors || []).includes(S.uid)) return "ผู้ที่ร่วมแก้ไขเนื้อหาฉบับนี้ไม่สามารถตรวจสอบ/อนุมัติได้";
  return null;
}
export function canEdit(v) {
  if (!["draft", "revision_required"].includes(v.status) || v.locked) return false;
  return isPriv() || v.prepared_by === S.uid || (S.role === "dept_head" && inMyDept(v.department_id));
}
export function canReview(v) {
  if (separationIssue(v) || S.role === "viewer") return false;
  if (v.reviewer_id) return v.reviewer_id === S.uid;
  return isPriv() || (S.role === "dept_head" && inMyDept(v.department_id));
}
export function canApprove(v) {
  if (separationIssue(v) || !["manager", "admin"].includes(S.role)) return false;
  return v.approver_id ? v.approver_id === S.uid : true;
}
function permissions(sop, v) {
  const isWorking = sop.working_version_id === v.id, isCurrent = sop.current_version_id === v.id;
  return {
    canEdit: isWorking && canEdit(v),
    canSubmit: isWorking && canEdit(v),
    canStartReview: isWorking && v.status === "submitted" && canReview(v),
    canReviewPass: isWorking && ["submitted", "dept_review"].includes(v.status) && canReview(v),
    canApprove: isWorking && v.status === "manager_approval" && canApprove(v),
    canReturn: isWorking && ((["submitted", "dept_review"].includes(v.status) && canReview(v)) || (v.status === "manager_approval" && canApprove(v))),
    canComment: S.role !== "viewer" && canSeeWork(v),
    canRevise: isCurrent && !sop.is_obsolete && !sop.working_version_id && canCreateIn(sop.department_id),
    canObsolete: isCurrent && !sop.is_obsolete && isPriv(),
    canDeleteDraft: isWorking && ["draft", "revision_required"].includes(v.status) && (isPriv() || v.prepared_by === S.uid),
    canSetReviewDate: isCurrent && !sop.is_obsolete && (isPriv() || (S.role === "dept_head" && inMyDept(sop.department_id))),
    separationNote: ["submitted", "dept_review", "manager_approval"].includes(v.status) && ["dept_head", "manager", "admin"].includes(S.role) ? separationIssue(v) : null,
  };
}

/* ---------- queries ที่ผ่านกฎความปลอดภัยตามบทบาท ---------- */
function sopQueries() {
  const c = collection(db, "sops");
  if (isPriv()) return [c];
  const qs = [query(c, where("has_current", "==", true)), query(c, where("participants", "array-contains", S.uid))];
  if (["author", "dept_head"].includes(S.role) && S.deptId) qs.push(query(c, where("department_id", "==", S.deptId)));
  return qs;
}
async function unionDocs(qs) {
  const snaps = await Promise.all(qs.map(q => getDocs(q)));
  const map = new Map();
  snaps.forEach(s => s.docs.forEach(d => map.set(d.id, { id: d.id, ...d.data() })));
  return [...map.values()];
}

export function reviewState(dateStr) {
  if (!dateStr) return "none";
  const t = today();
  if (dateStr < t) return "overdue";
  const warn = Number(S.settings.review_warn_days) || 30;
  return dateStr <= new Date(Date.now() + warn * 86400000).toLocaleDateString("sv-SE") ? "due_soon" : "ok";
}

function toListItem(r) {
  const dept = deptById(r.department_id) || { code: r.department_id, name: "" };
  const work = r.working_version_id ? { prepared_by: (r.participants || [])[0], department_id: r.department_id } : null;
  const seeWork = !!work && (canSeeWork(work) || (r.participants || []).includes(S.uid));
  const current = r.current_version_id ? { id: r.current_version_id, rev: revLabel(r.current_rev), title: r.current_title, effective_date: r.current_effective_date, approved_at: iso(r.current_approved_at) } : null;
  const working = seeWork ? { id: r.working_version_id, rev: revLabel(r.working_rev), title: r.working_title, status: r.working_status } : null;
  const status = working ? working.status : (r.is_obsolete ? "obsolete" : "published");
  return {
    id: r.id, sop_number: r.sop_number, department_id: r.department_id, dept_code: dept.code, dept_name: dept.name,
    is_obsolete: !!r.is_obsolete, next_review_date: r.next_review_date || null,
    review_state: current && !r.is_obsolete ? reviewState(r.next_review_date) : "none",
    title: (working ? working.title : current?.title) || "", current, working, status,
    owner_id: r.owner_id || null, owner_name: r.owner_name || "", approved_name: r.current_approved_by || "",
    updated_at: iso(r.updated_at), created_at: iso(r.created_at),
    _search: [r.sop_number, dept.code, dept.name, current?.title, working?.title, r.current_search || ""].join(" ").toLowerCase(),
  };
}
export async function listSops(f = {}) {
  const rows = (await unionDocs(sopQueries())).map(toListItem).filter(s => s.current || s.working);
  return filterSops(rows, f).sort((a, b) => a.sop_number.localeCompare(b.sop_number));
}
export function filterSops(list, q) {
  let res = list;
  if (q.dept) res = res.filter(s => s.department_id === q.dept);
  if (q.status) {
    const st = q.status;
    if (st === "active") res = res.filter(s => s.current && !s.is_obsolete);
    else if (st === "pending") res = res.filter(s => ["submitted", "dept_review", "manager_approval"].includes(s.working?.status));
    else if (st === "overdue" || st === "due_soon") res = res.filter(s => s.review_state === st);
    else res = res.filter(s => s.status === st || s.working?.status === st);
  }
  if (q.from) res = res.filter(s => (s.updated_at || "").slice(0, 10) >= q.from);
  if (q.to) res = res.filter(s => (s.updated_at || "").slice(0, 10) <= q.to);
  if (q.q) { const t = String(q.q).toLowerCase().split(/\s+/).filter(Boolean); res = res.filter(s => t.every(x => s._search.includes(x))); }
  return res;
}

/* ---------- log ---------- */
function logQueries(extra = []) {
  const c = collection(db, "sopLog");
  if (isPriv()) return [query(c, ...extra)];
  const qs = [query(c, ...extra, where("public", "==", true)), query(c, ...extra, where("participants", "array-contains", S.uid))];
  if (["author", "dept_head"].includes(S.role) && S.deptId) qs.push(query(c, ...extra, where("department_id", "==", S.deptId)));
  return qs;
}
const mapLog = l => ({ ...l, at: iso(l.at) || new Date().toISOString() });
export async function sopLog(sopId) {
  return (await unionDocs(logQueries([where("sop_id", "==", sopId)]))).map(mapLog).sort((a, b) => b.at.localeCompare(a.at));
}
export async function recentActivity(n = 60) {
  let rows;
  if (isPriv()) rows = (await getDocs(query(collection(db, "sopLog"), orderBy("at", "desc"), qLimit(n)))).docs.map(d => ({ id: d.id, ...d.data() }));
  else rows = await unionDocs(logQueries());
  return rows.map(mapLog).sort((a, b) => b.at.localeCompare(a.at)).slice(0, n);
}
function logEntry(b, { sop, v, action, from = null, to = null, comment = "" }) {
  const participants = v ? [v.prepared_by, v.owner_id, v.reviewer_id, v.approver_id].filter(Boolean) : [];
  b.set(doc(collection(db, "sopLog")), {
    sop_id: sop.id, sop_number: sop.sop_number, department_id: sop.department_id,
    version_id: v?.id || null, rev: v ? revLabel(v.revision) : "", title: v?.title || "",
    action, from_status: from, to_status: to, comment: comment || "",
    public: PUBLIC_STATUSES.includes(to || v?.status) || ["approve", "obsolete", "review_date", "supersede"].includes(action),
    participants: [...new Set(participants)], user_id: S.uid, user_name: S.name, at: serverTimestamp(),
  });
}

/* ---------- version detail ---------- */
async function getVersionRaw(vid) {
  const s = await getDoc(doc(db, "sopVersions", vid)).catch(e => { throw friendly(e); });
  if (!s.exists()) fail("ไม่พบเอกสาร");
  return { id: s.id, ...s.data() };
}
export async function versionPayload(vid) {
  let v;
  try { v = await getVersionRaw(vid); }
  catch (e) { if (e.message.startsWith("ไม่มีสิทธิ์")) fail("คุณไม่มีสิทธิ์ดูฉบับนี้ (ยังไม่ได้รับการอนุมัติ)"); throw e; }
  const ss = await getDoc(doc(db, "sops", v.sop_id)).catch(() => null);
  if (!ss || !ss.exists()) fail("ไม่พบ SOP");
  const sop = { id: ss.id, ...ss.data() };
  const dept = deptById(sop.department_id) || { code: sop.department_id, name: "" };
  const vc = collection(db, "sopVersions");
  const all = isPriv() ? await unionDocs([query(vc, where("sop_id", "==", sop.id))])
    : (["author", "dept_head"].includes(S.role) && inMyDept(sop.department_id))
      ? await unionDocs([query(vc, where("sop_id", "==", sop.id), where("department_id", "==", S.deptId))])
      : await unionDocs([query(vc, where("sop_id", "==", sop.id), where("status", "in", PUBLIC_STATUSES))]);
  if (!all.some(x => x.id === v.id)) all.push(v);
  if (sop.working_version_id && !all.some(x => x.id === sop.working_version_id)) {
    try { all.push(await getVersionRaw(sop.working_version_id)); } catch { /* ไม่มีสิทธิ์เห็นฉบับร่าง */ }
  }
  const versions = all.filter(x => x.status !== "cancelled" || x.id === v.id)
    .sort((a, b) => b.revision - a.revision)
    .map(x => ({
      id: x.id, revision: x.revision, rev: revLabel(x.revision), status: x.status, title: x.title, change_summary: x.change_summary,
      effective_date: x.effective_date, prepared_name: x.prepared_name, approved_name: x.approved_name || "",
      approved_at: iso(x.approved_at), updated_at: iso(x.updated_at),
      is_current: x.id === sop.current_version_id, is_working: x.id === sop.working_version_id,
    }));
  const log = await sopLog(sop.id).catch(() => []);
  const ver = { ...v, rev: revLabel(v.revision), created_at: iso(v.created_at), updated_at: iso(v.updated_at), submitted_at: iso(v.submitted_at),
    reviewed_at: iso(v.reviewed_at), approved_at: iso(v.approved_at), published_at: iso(v.published_at),
    is_current: v.id === sop.current_version_id, is_working: v.id === sop.working_version_id };
  const person = (id, name) => id ? { id, display_name: name || nameOf(id), position: memberById(id)?.position || "" } : null;
  return {
    sop: { ...sop, dept_code: dept.code, dept_name: dept.name, review_state: reviewState(sop.next_review_date) },
    version: ver,
    people: {
      prepared: person(v.prepared_by, v.prepared_name), owner: person(v.owner_id, v.owner_name),
      reviewer: person(v.reviewer_id, v.reviewer_name), approver: person(v.approver_id, v.approver_name),
      reviewed_by: person(v.reviewed_by, v.reviewed_by_name), approved_by: person(v.approved_by, v.approved_name),
    },
    versions, log, permissions: permissions(sop, ver),
  };
}
export async function payloadForSop(sopId) {
  const s = await getDoc(doc(db, "sops", sopId)).catch(e => { throw friendly(e); });
  if (!s.exists()) fail("ไม่พบ SOP");
  const sop = s.data();
  if (sop.working_version_id) {
    try { return await versionPayload(sop.working_version_id); } catch { /* ไม่มีสิทธิ์เห็นร่าง → ใช้ฉบับปัจจุบัน */ }
  }
  if (!sop.current_version_id) fail("SOP นี้ยังไม่ได้ประกาศใช้");
  return versionPayload(sop.current_version_id);
}

/* ---------- tasks ---------- */
export async function myTasks() {
  const vc = collection(db, "sopVersions");
  const qs = [];
  const revStatuses = ["submitted", "dept_review"];
  if (isPriv()) { qs.push(query(vc, where("status", "in", revStatuses))); qs.push(query(vc, where("status", "==", "manager_approval"))); }
  else {
    qs.push(query(vc, where("status", "in", revStatuses), where("reviewer_id", "==", S.uid)));
    if (S.role === "dept_head" && S.deptId) qs.push(query(vc, where("status", "in", revStatuses), where("department_id", "==", S.deptId)));
  }
  if (isPriv()) qs.push(query(vc, where("prepared_by", "==", S.uid), where("status", "in", ["draft", "revision_required"])));
  else if (["author", "dept_head"].includes(S.role) && S.deptId) qs.push(query(vc, where("department_id", "==", S.deptId), where("prepared_by", "==", S.uid), where("status", "in", ["draft", "revision_required"])));
  const vers = await unionDocs(qs).catch(() => []);
  const tasks = [];
  for (const v of vers) {
    const dept = deptById(v.department_id) || { code: v.department_id };
    const base = { sop_id: v.sop_id, version_id: v.id, sop_number: v.sop_number, dept_code: dept.code, title: v.title, rev: revLabel(v.revision), status: v.status, updated_at: iso(v.updated_at) };
    if (revStatuses.includes(v.status) && canReview(v)) tasks.push({ ...base, kind: "review", label: "รอคุณตรวจสอบ" });
    else if (v.status === "manager_approval" && canApprove(v)) tasks.push({ ...base, kind: "approve", label: "รอคุณอนุมัติ" });
    else if (v.status === "revision_required" && v.prepared_by === S.uid) tasks.push({ ...base, kind: "fix", label: "ถูกส่งกลับให้แก้ไข" });
    else if (v.status === "draft" && v.prepared_by === S.uid) tasks.push({ ...base, kind: "draft", label: "ฉบับร่างของคุณ (ยังไม่ส่งตรวจ)" });
  }
  const sops = (await unionDocs(sopQueries()).catch(() => [])).filter(r => r.has_current && !r.is_obsolete && !r.working_version_id);
  for (const r of sops) {
    const st = reviewState(r.next_review_date);
    if (st !== "overdue" && st !== "due_soon") continue;
    if (r.owner_id === S.uid || (S.role === "dept_head" && inMyDept(r.department_id)) || S.role === "manager") {
      tasks.push({ sop_id: r.id, version_id: r.current_version_id, sop_number: r.sop_number, dept_code: deptById(r.department_id)?.code || "", title: r.current_title, rev: revLabel(r.current_rev), status: "published", kind: st, label: st === "overdue" ? `เลยกำหนดทบทวน (${r.next_review_date})` : `ใกล้ถึงกำหนดทบทวน (${r.next_review_date})` });
    }
  }
  const order = { approve: 0, review: 1, fix: 2, overdue: 3, due_soon: 4, draft: 5 };
  return tasks.sort((a, b) => order[a.kind] - order[b.kind]);
}

/* ---------- dashboard ---------- */
export async function dashboard(f = {}) {
  const all = (await unionDocs(sopQueries())).map(toListItem).filter(s => s.current || s.working);
  const base = filterSops(all, { dept: f.dept, from: f.from, to: f.to, q: f.q });
  const list = f.status ? filterSops(base, { status: f.status }) : base;
  const count = fn => list.filter(fn).length;
  const kpi = {
    total: list.length, active: count(s => s.current && !s.is_obsolete), draft: count(s => s.working?.status === "draft"),
    pending: count(s => ["submitted", "dept_review", "manager_approval"].includes(s.working?.status)),
    revision_required: count(s => s.working?.status === "revision_required"),
    overdue: count(s => s.review_state === "overdue"), due_soon: count(s => s.review_state === "due_soon"), obsolete: count(s => s.is_obsolete),
  };
  const byDept = S.depts.map(d => {
    const ds = list.filter(s => s.department_id === d.id);
    return {
      id: d.id, code: d.code, name: d.name, total: ds.length, active: d.active,
      published: ds.filter(s => s.current && !s.is_obsolete).length,
      in_progress: ds.filter(s => !s.current && s.status !== "revision_required").length,
      revision_required: ds.filter(s => !s.current && s.status === "revision_required").length,
      obsolete: ds.filter(s => s.is_obsolete).length,
    };
  }).filter(d => d.total > 0 || d.active);
  const months = [];
  const d0 = new Date(); d0.setDate(1);
  for (let i = 11; i >= 0; i--) months.push(new Date(d0.getFullYear(), d0.getMonth() - i, 1).toLocaleDateString("sv-SE").slice(0, 7));
  const ids = new Set(list.map(s => s.id));
  const logs = await recentActivity(500).catch(() => []);
  const monthly = months.map(m => ({ month: m, approve: 0, submit: 0, return: 0 }));
  logs.forEach(l => {
    if (!ids.has(l.sop_id) || !["approve", "submit", "return"].includes(l.action)) return;
    const ym = new Date(l.at).toLocaleDateString("sv-SE").slice(0, 7);
    const row = monthly.find(x => x.month === ym); if (row) row[l.action]++;
  });
  const reviewList = list.filter(s => s.review_state === "overdue" || s.review_state === "due_soon")
    .sort((a, b) => (a.next_review_date || "").localeCompare(b.next_review_date || "")).slice(0, 10);
  const tasks = await myTasks();
  return { kpi, byDept, monthly, activity: logs.filter(a => ids.has(a.sop_id) || !a.sop_id).slice(0, 12), reviewList, tasks: tasks.slice(0, 10), list };
}

/* ---------- เลข SOP ---------- */
export const normNumber = s => String(s || "").trim().toUpperCase();
export async function nextNumber(deptId) {
  const d = deptById(deptId); if (!d) return "";
  const prefix = `${d.code.toUpperCase()}-SOP-`;
  let rows = [];
  try { rows = await unionDocs(isPriv() ? [query(collection(db, "sops"), where("department_id", "==", deptId))] : sopQueries()); } catch { }
  const max = rows.filter(r => r.sop_number.startsWith(prefix)).reduce((m, r) => Math.max(m, parseInt(r.sop_number.slice(prefix.length), 10) || 0), 0);
  return prefix + String(max + 1).padStart(3, "0");
}

/* ---------- validation ---------- */
function cleanContent(c = {}) {
  const str = (x, max = 20000) => String(x ?? "").slice(0, max);
  const file = f => f && f.url ? { url: str(f.url, 1000), name: str(f.name, 200), size: Number(f.size) || 0, mime: str(f.mime, 100), w: Number(f.w) || 0, h: Number(f.h) || 0 } : null;
  return {
    objective: str(c.objective), scope: str(c.scope), responsibility: str(c.responsibility), equipment: str(c.equipment),
    safety: str(c.safety), related_docs: str(c.related_docs), kpi: str(c.kpi), keywords: str(c.keywords, 1000),
    steps: (Array.isArray(c.steps) ? c.steps : []).slice(0, 300).map(s => ({ id: str(s.id || crypto.randomUUID(), 64), title: str(s.title, 500), detail: str(s.detail), images: (s.images || []).map(file).filter(Boolean).slice(0, 30) })),
    attachments: (c.attachments || []).map(file).filter(Boolean).slice(0, 100),
  };
}
function validateAssignees(body, preparedBy) {
  const roleOf = id => (memberById(id)?.sopRole) || "";
  if (body.reviewer_id) {
    if (body.reviewer_id === preparedBy) fail("ผู้จัดทำไม่สามารถเป็นผู้ตรวจสอบของ SOP ตนเองได้");
    if (!["dept_head", "manager", "admin"].includes(roleOf(body.reviewer_id))) fail("ผู้ตรวจสอบที่เลือกไม่มีสิทธิ์ตามบทบาท");
  }
  if (body.approver_id) {
    if (body.approver_id === preparedBy) fail("ผู้จัดทำไม่สามารถเป็นผู้อนุมัติของ SOP ตนเองได้");
    if (!["manager", "admin"].includes(roleOf(body.approver_id))) fail("ผู้อนุมัติต้องมีบทบาท Manager หรือ Admin");
  }
}
const validDate = d => !d || /^\d{4}-\d{2}-\d{2}$/.test(d);
const participantsOf = v => [...new Set([v.prepared_by, v.owner_id, v.reviewer_id, v.approver_id].filter(Boolean))];
const searchText = (title, c) => [title, c.keywords, c.objective, c.scope, ...(c.steps || []).map(s => s.title)].join(" ").toLowerCase().slice(0, 3000);

/* ---------- writes ---------- */
export async function createSop(body, copiedFrom = "") {
  const deptId = body.department_id;
  const dept = deptById(deptId) || fail("กรุณาเลือกแผนก");
  if (!dept.active) fail("แผนกนี้ถูกปิดใช้งาน");
  if (!canCreateIn(deptId)) fail("คุณไม่มีสิทธิ์สร้าง SOP ในแผนกนี้");
  const num = normNumber(body.sop_number) || await nextNumber(deptId);
  if (!/^[A-Z0-9._-]{2,40}$/.test(num)) fail("SOP Number ใช้ A-Z ตัวเลข และ - . _ ได้ (2-40 ตัว)");
  const title = String(body.title || "").trim() || fail("กรุณาระบุชื่อ SOP");
  validateAssignees(body, S.uid);
  if (!validDate(body.effective_date) || !validDate(body.review_date)) fail("รูปแบบวันที่ไม่ถูกต้อง");
  const exists = await getDoc(doc(db, "sops", num)).then(s => s.exists(), () => true);
  if (exists) fail(`SOP Number "${num}" มีอยู่แล้ว`);
  const vid = num + "_r0";
  const v = {
    sop_id: num, sop_number: num, department_id: deptId, revision: 0, status: "draft", title, content: cleanContent(body.content),
    prepared_by: S.uid, prepared_name: S.name,
    owner_id: body.owner_id || null, owner_name: nameOf(body.owner_id),
    reviewer_id: body.reviewer_id || null, reviewer_name: nameOf(body.reviewer_id),
    approver_id: body.approver_id || null, approver_name: nameOf(body.approver_id),
    effective_date: body.effective_date || null, review_date: body.review_date || null,
    change_summary: String(body.change_summary || "จัดทำครั้งแรก (Initial issue)"), editors: [], row_ver: 1, locked: false,
    reviewed_by: null, approved_by: null, last_comment: "",
    created_at: serverTimestamp(), updated_at: serverTimestamp(), updated_by: S.uid,
  };
  const b = writeBatch(db);
  b.set(doc(db, "sopVersions", vid), v);
  b.set(doc(db, "sops", num), {
    sop_number: num, department_id: deptId, created_by: S.uid, created_at: serverTimestamp(), updated_at: serverTimestamp(),
    current_version_id: null, working_version_id: vid, has_current: false, is_obsolete: false, last_rev: 0, next_review_date: null,
    working_title: title, working_status: "draft", working_rev: 0, owner_id: v.owner_id, owner_name: v.owner_name, participants: participantsOf(v),
  });
  logEntry(b, { sop: { id: num, sop_number: num, department_id: deptId }, v: { ...v, id: vid }, action: copiedFrom ? "copy" : "create", to: "draft", comment: copiedFrom ? `คัดลอกจาก ${copiedFrom}` : "" });
  await b.commit().catch(e => { throw friendly(e); });
  return { id: num, version_id: vid, sop_number: num };
}

const editLogAt = new Map();
export async function saveVersion(vid, body) {
  const title = String(body.title ?? "").trim() || fail("กรุณาระบุชื่อ SOP");
  if (!validDate(body.effective_date) || !validDate(body.review_date)) fail("รูปแบบวันที่ไม่ถูกต้อง");
  const vRef = doc(db, "sopVersions", vid);
  const out = await runTransaction(db, async tx => {
    const s = await tx.get(vRef);
    if (!s.exists()) fail("ไม่พบเอกสาร");
    const v = { id: s.id, ...s.data() };
    if (!canEdit(v)) fail(v.locked ? "ฉบับนี้ได้รับอนุมัติแล้ว ห้ามแก้ไข — กด \"สร้างฉบับแก้ไข\" เพื่อทำ Rev. ใหม่" : "เอกสารอยู่ระหว่างตรวจ/อนุมัติ หรือคุณไม่มีสิทธิ์แก้ไข");
    if (body.row_ver != null && Number(body.row_ver) !== v.row_ver) fail(`มีผู้ใช้อื่นบันทึกเอกสารนี้ไปก่อนแล้ว — กรุณาโหลดฉบับล่าสุด`);
    validateAssignees(body, v.prepared_by);
    const editors = [...(v.editors || [])]; if (S.uid !== v.prepared_by && !editors.includes(S.uid)) editors.push(S.uid);
    const upd = {
      title, content: cleanContent(body.content),
      owner_id: body.owner_id || null, reviewer_id: body.reviewer_id || null, approver_id: body.approver_id || null,
      owner_name: nameOf(body.owner_id), reviewer_name: nameOf(body.reviewer_id), approver_name: nameOf(body.approver_id),
      effective_date: body.effective_date || null, review_date: body.review_date || null,
      change_summary: String(body.change_summary ?? v.change_summary).slice(0, 4000),
      editors, row_ver: v.row_ver + 1, updated_at: serverTimestamp(), updated_by: S.uid,
    };
    tx.update(vRef, upd);
    tx.update(doc(db, "sops", v.sop_id), {
      working_title: title, owner_id: upd.owner_id, owner_name: nameOf(upd.owner_id),
      participants: participantsOf({ ...v, ...upd }), updated_at: serverTimestamp(),
    });
    return { v: { ...v, ...upd }, row_ver: upd.row_ver };
  }).catch(e => { throw friendly(e); });
  const last = editLogAt.get(vid) || 0;
  if (Date.now() - last > 15 * 60000) {
    editLogAt.set(vid, Date.now());
    const b = writeBatch(db);
    logEntry(b, { sop: { id: out.v.sop_id, sop_number: out.v.sop_number, department_id: out.v.department_id }, v: out.v, action: "edit", from: out.v.status, to: out.v.status });
    await b.commit().catch(() => { });
  }
  return { ok: true, row_ver: out.row_ver };
}

export async function action(vid, act, comment = "") {
  comment = String(comment || "").trim().slice(0, 4000);
  const vRef = doc(db, "sopVersions", vid);
  await runTransaction(db, async tx => {
    const vs = await tx.get(vRef); if (!vs.exists()) fail("ไม่พบเอกสาร");
    const v = { id: vs.id, ...vs.data() };
    const sRef = doc(db, "sops", v.sop_id);
    const ss = await tx.get(sRef); const sop = { id: ss.id, ...ss.data() };
    const isWorking = sop.working_version_id === v.id;
    const wf = (to, extra = {}) => ({ status: to, row_ver: v.row_ver + 1, updated_at: serverTimestamp(), updated_by: S.uid, ...(comment ? { last_comment: comment, last_comment_at: serverTimestamp() } : {}), ...extra });
    const b = { set: (r, d) => tx.set(r, d) }; // สำหรับ logEntry
    let to = null, extraSop = {};
    switch (act) {
      case "submit": {
        if (!isWorking || !canEdit(v)) fail("ไม่สามารถส่งตรวจได้");
        const c = v.content || {}, miss = [];
        if (!v.title?.trim()) miss.push("SOP Title");
        if (!c.objective?.trim()) miss.push("Objective");
        if (!c.scope?.trim()) miss.push("Scope");
        if (!c.responsibility?.trim()) miss.push("Responsibility");
        if (!(c.steps || []).some(s => s.title?.trim())) miss.push("Work Instructions (อย่างน้อย 1 ขั้นตอน)");
        if (!v.owner_id) miss.push("ผู้รับผิดชอบ");
        if (!v.effective_date) miss.push("Effective Date");
        if (!v.review_date) miss.push("Review Date");
        if (v.effective_date && v.review_date && v.review_date <= v.effective_date) miss.push("Review Date ต้องหลัง Effective Date");
        if (v.revision > 0 && !String(v.change_summary || "").trim()) miss.push("รายละเอียดการแก้ไข (Change Summary)");
        if (miss.length) fail("ข้อมูลยังไม่ครบ: " + miss.join(", "));
        to = "submitted"; tx.update(vRef, wf(to, { submitted_at: serverTimestamp() })); break;
      }
      case "start_review":
        if (!isWorking || v.status !== "submitted") fail("สถานะเอกสารไม่ถูกต้อง");
        if (!canReview(v)) fail(separationIssue(v) || "คุณไม่ใช่ผู้ตรวจสอบของเอกสารนี้");
        to = "dept_review"; tx.update(vRef, wf(to)); break;
      case "review_pass":
        if (!isWorking || !["submitted", "dept_review"].includes(v.status)) fail("สถานะเอกสารไม่ถูกต้อง");
        if (!canReview(v)) fail(separationIssue(v) || "คุณไม่ใช่ผู้ตรวจสอบของเอกสารนี้");
        to = "manager_approval"; tx.update(vRef, wf(to, { reviewed_by: S.uid, reviewed_by_name: S.name, reviewed_at: serverTimestamp() })); break;
      case "return": {
        if (!isWorking) fail("สถานะเอกสารไม่ถูกต้อง");
        const ok = (["submitted", "dept_review"].includes(v.status) && canReview(v)) || (v.status === "manager_approval" && canApprove(v));
        if (!ok) fail(separationIssue(v) || "คุณไม่มีสิทธิ์ส่งกลับเอกสารนี้");
        if (!comment) fail("กรุณาระบุเหตุผลที่ส่งกลับแก้ไข");
        to = "revision_required"; tx.update(vRef, wf(to)); break;
      }
      case "approve": {
        if (!isWorking || v.status !== "manager_approval") fail("สถานะเอกสารไม่ถูกต้อง");
        if (!canApprove(v)) fail(separationIssue(v) || "คุณไม่มีสิทธิ์อนุมัติเอกสารนี้");
        to = "published";
        tx.update(vRef, wf(to, { approved_by: S.uid, approved_name: S.name, approved_at: serverTimestamp(), published_at: serverTimestamp(), locked: true }));
        if (sop.current_version_id) {
          tx.update(doc(db, "sopVersions", sop.current_version_id), { status: "superseded", superseded_at: serverTimestamp() });
          const old = { id: sop.current_version_id, revision: sop.current_rev, title: sop.current_title, status: "superseded" };
          logEntry(b, { sop, v: old, action: "supersede", from: "published", to: "superseded", comment: `ถูกแทนที่ด้วย ${revLabel(v.revision)}` });
        }
        extraSop = {
          current_version_id: v.id, has_current: true, working_version_id: null, next_review_date: v.review_date,
          current_title: v.title, current_rev: v.revision, current_effective_date: v.effective_date, current_approved_at: serverTimestamp(),
          current_approved_by: S.name, current_search: searchText(v.title, v.content || {}),
          working_title: null, working_status: null, working_rev: null,
        };
        break;
      }
      case "obsolete": {
        if (sop.current_version_id !== v.id || sop.is_obsolete || !isPriv()) fail("ไม่สามารถยกเลิกใช้งานได้");
        if (!comment) fail("กรุณาระบุเหตุผลที่ยกเลิกใช้งาน");
        to = "obsolete";
        tx.update(vRef, { status: "obsolete", last_comment: comment, last_comment_at: serverTimestamp(), updated_at: serverTimestamp(), updated_by: S.uid });
        if (sop.working_version_id) tx.update(doc(db, "sopVersions", sop.working_version_id), { status: "cancelled", updated_at: serverTimestamp(), updated_by: S.uid });
        extraSop = { is_obsolete: true, working_version_id: null, working_title: null, working_status: null, working_rev: null };
        break;
      }
      case "comment":
        if (!canSeeWork(v) || S.role === "viewer") fail("ไม่มีสิทธิ์");
        if (!comment) fail("กรุณาพิมพ์ความคิดเห็น");
        break;
      default: fail("ไม่รู้จักคำสั่ง");
    }
    if (act !== "comment") {
      const sopUpd = { updated_at: serverTimestamp(), ...extraSop };
      if (to && isWorking && act !== "approve") sopUpd.working_status = to;
      tx.update(sRef, sopUpd);
    }
    logEntry(b, { sop, v, action: act, from: v.status, to: act === "comment" ? v.status : to, comment });
  }).catch(e => { throw friendly(e); });
  return { ok: true };
}

export async function revise(sopId, changeSummary = "") {
  const sRef = doc(db, "sops", sopId);
  return runTransaction(db, async tx => {
    const ss = await tx.get(sRef); const sop = { id: ss.id, ...ss.data() };
    if (!sop.current_version_id || sop.is_obsolete) fail("ต้องมีฉบับที่ประกาศใช้อยู่ก่อนจึงจะสร้างฉบับแก้ไขได้");
    if (sop.working_version_id) fail("มีฉบับแก้ไขที่อยู่ระหว่างดำเนินการอยู่แล้ว");
    if (!canCreateIn(sop.department_id)) fail("คุณไม่มีสิทธิ์แก้ไข SOP ของแผนกนี้");
    const cs = await tx.get(doc(db, "sopVersions", sop.current_version_id)); const cur = cs.data();
    const rev = (sop.last_rev || 0) + 1, vid = `${sopId}_r${rev}`;
    const v = {
      sop_id: sopId, sop_number: sop.sop_number, department_id: sop.department_id, revision: rev, status: "draft", title: cur.title, content: cur.content,
      prepared_by: S.uid, prepared_name: S.name, owner_id: cur.owner_id || null, owner_name: cur.owner_name || "",
      reviewer_id: cur.reviewer_id === S.uid ? null : (cur.reviewer_id || null), reviewer_name: cur.reviewer_id === S.uid ? "" : (cur.reviewer_name || ""),
      approver_id: cur.approver_id === S.uid ? null : (cur.approver_id || null), approver_name: cur.approver_id === S.uid ? "" : (cur.approver_name || ""),
      effective_date: null, review_date: null, change_summary: String(changeSummary || ""), editors: [], row_ver: 1, locked: false,
      reviewed_by: null, approved_by: null, last_comment: "", created_at: serverTimestamp(), updated_at: serverTimestamp(), updated_by: S.uid,
    };
    tx.set(doc(db, "sopVersions", vid), v);
    tx.update(sRef, { working_version_id: vid, last_rev: rev, working_title: v.title, working_status: "draft", working_rev: rev, participants: participantsOf(v), updated_at: serverTimestamp() });
    logEntry({ set: (r, d) => tx.set(r, d) }, { sop, v: { ...v, id: vid }, action: "revise", to: "draft", comment: `สร้าง ${revLabel(rev)} จาก ${revLabel(cur.revision)}` });
    return { version_id: vid };
  }).catch(e => { throw friendly(e); });
}

export async function copySop(P, { department_id, sop_number, title }) {
  const v = P.version;
  return createSop({
    department_id, sop_number, title: title || (v.title + " (สำเนา)"), content: v.content, owner_id: v.owner_id,
    change_summary: `จัดทำครั้งแรก (คัดลอกจาก ${P.sop.sop_number} ${v.rev})`,
  }, `${P.sop.sop_number} ${v.rev}`);
}

export async function deleteDraft(vid) {
  const vRef = doc(db, "sopVersions", vid);
  return runTransaction(db, async tx => {
    const vs = await tx.get(vRef); const v = { id: vs.id, ...vs.data() };
    const sRef = doc(db, "sops", v.sop_id); const ss = await tx.get(sRef); const sop = { id: ss.id, ...ss.data() };
    if (sop.working_version_id !== v.id || !["draft", "revision_required"].includes(v.status) || !(isPriv() || v.prepared_by === S.uid))
      fail("ลบได้เฉพาะฉบับร่างที่ยังไม่อนุมัติ โดยผู้จัดทำหรือผู้ดูแล");
    tx.update(vRef, { status: "cancelled", updated_at: serverTimestamp(), updated_by: S.uid });
    if (!sop.has_current) tx.delete(sRef);
    else tx.update(sRef, { working_version_id: null, working_title: null, working_status: null, working_rev: null, updated_at: serverTimestamp() });
    logEntry({ set: (r, d) => tx.set(r, d) }, { sop, v, action: sop.has_current ? "cancel" : "delete", from: v.status, to: "cancelled", comment: sop.has_current ? "ยกเลิกฉบับแก้ไข" : `ลบฉบับร่าง ${sop.sop_number}` });
    return { had_current: !!sop.has_current, current_version_id: sop.current_version_id };
  }).catch(e => { throw friendly(e); });
}

export async function setReviewDate(sopId, date, note) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) fail("กรุณาระบุวันที่");
  if (date <= today()) fail("วันทบทวนรอบถัดไปต้องเป็นวันในอนาคต");
  if (!String(note || "").trim()) fail("กรุณาระบุผลการทบทวน");
  const ss = await getDoc(doc(db, "sops", sopId)); const sop = { id: ss.id, ...ss.data() };
  const b = writeBatch(db);
  b.update(doc(db, "sops", sopId), { next_review_date: date, updated_at: serverTimestamp() });
  logEntry(b, { sop, v: { id: sop.current_version_id, revision: sop.current_rev, title: sop.current_title, status: "published" }, action: "review_date", comment: `ทบทวนแล้ว — กำหนดทบทวนครั้งถัดไป ${date}: ${note}` });
  await b.commit().catch(e => { throw friendly(e); });
}

/* ---------- admin ---------- */
export async function saveDepartment(id, body) {
  const code = String(body.code || "").trim().toUpperCase();
  if (!/^[A-Z0-9_-]{1,12}$/.test(code)) fail("รหัสแผนกใช้ A-Z, 0-9, - หรือ _ ไม่เกิน 12 ตัว");
  const name = String(body.name || "").trim() || fail("กรุณาระบุชื่อแผนก");
  if (S.depts.some(d => d.code === code && d.id !== id)) fail("รหัสแผนกนี้มีอยู่แล้ว");
  const data = { code, name, description: String(body.description || ""), sort: body.sort != null && body.sort !== "" ? Number(body.sort) : (Math.max(0, ...S.depts.map(d => d.sort || 0)) + 1) };
  if (id) await updateDoc(doc(db, "sopDepartments", id), data);
  else await setDoc(doc(collection(db, "sopDepartments")), { ...data, active: true, created_at: serverTimestamp() });
  await loadMeta();
}
export async function setDepartmentActive(id, active) { await updateDoc(doc(db, "sopDepartments", id), { active: !!active }); await loadMeta(); }
export async function deleteDepartment(id) {
  const used = (await getDocs(query(collection(db, "sops"), where("department_id", "==", id)))).size;
  const users = S.members.filter(m => m.deptId === id).length;
  if (used || users) fail(`ลบไม่ได้: แผนกนี้มี SOP ${used} รายการ และสมาชิก ${users} คน — ให้ใช้ "ปิดใช้งาน" แทน`);
  await deleteDoc(doc(db, "sopDepartments", id)); await loadMeta();
}
export async function listErpUsers() {
  const s = await getDocs(collection(db, "users"));
  return s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || "").localeCompare(b.name || "", "th"));
}
export async function saveMember(uid, body) {
  if (!SOP_ROLES[body.sopRole] || body.sopRole === "admin" && body.erpRole !== "admin") fail("บทบาทไม่ถูกต้อง");
  if (["author", "dept_head"].includes(body.sopRole) && !body.deptId) fail("ผู้จัดทำ / หัวหน้าแผนก ต้องระบุแผนก");
  await setDoc(doc(db, "sopMembers", uid), {
    name: String(body.name || ""), email: String(body.email || ""), position: String(body.position || ""),
    sopRole: body.sopRole, deptId: body.deptId || "", erpRole: body.erpRole || "", active: body.active !== false, updated_at: serverTimestamp(),
  });
}
export async function saveSettings(body) {
  const data = {};
  for (const k of Object.keys(DEFAULT_SETTINGS)) if (body[k] !== undefined) data[k] = typeof DEFAULT_SETTINGS[k] === "number" ? Number(body[k]) || DEFAULT_SETTINGS[k] : String(body[k]).slice(0, 500);
  await setDoc(doc(db, "sopSettings", "main"), { ...data, updated_at: serverTimestamp() }, { merge: true });
  await loadMeta();
}

/* ---------- real-time ---------- */
export function subscribe(cb) {
  let timer = null, first = true;
  const fire = () => { clearTimeout(timer); timer = setTimeout(() => cb(), 300); };
  const unsubs = sopQueries().map(q => onSnapshot(q, () => { if (!first) fire(); }, () => { }));
  setTimeout(() => { first = false; }, 1500);
  return () => unsubs.forEach(u => u());
}

/* ---------- Cloudinary upload ---------- */
export async function uploadFile(file, imageOnly) {
  if (cloudinaryConfig.cloudName === "YOUR_CLOUD_NAME") fail("ยังไม่ได้ตั้งค่า Cloudinary — ดู erp/js/cloudinary-config.example.js");
  if (file.size > 20 * 1024 * 1024) fail(`${file.name}: ใหญ่เกิน 20 MB`);
  let name = file.name, mime = file.type || "application/octet-stream", blob = file, w = 0, h = 0;
  const isImg = /^image\//.test(mime);
  if (!isImg && imageOnly) fail("กรุณาเลือกไฟล์รูปภาพ");
  if (!isImg && !/\.(pdf|docx?|xlsx?|xlsm|pptx?|csv|txt|zip)$/i.test(name)) fail("ชนิดไฟล์ไม่รองรับ (PDF, Word, Excel, PowerPoint, รูปภาพ, CSV, TXT, ZIP)");
  if (isImg) {
    // ย่อ/แปลงเป็น JPEG ให้เล็กและฝังใน Word ได้
    const bmp = await createImageBitmap(file).catch(() => null);
    if (bmp) {
      w = bmp.width; h = bmp.height;
      const keepPng = mime === "image/png" && file.size < 1.5 * 1024 * 1024 && Math.max(w, h) <= 1800;
      if (!keepPng) {
        const sc = Math.min(1, 1600 / Math.max(w, h));
        const cv = document.createElement("canvas"); cv.width = Math.round(w * sc); cv.height = Math.round(h * sc);
        const cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(bmp, 0, 0, cv.width, cv.height);
        blob = await new Promise(r => cv.toBlob(r, "image/jpeg", 0.86)); mime = "image/jpeg"; name = name.replace(/\.\w+$/, "") + ".jpg"; w = cv.width; h = cv.height;
      }
    }
  }
  const form = new FormData();
  form.append("file", blob, name);
  form.append("upload_preset", cloudinaryConfig.uploadPreset);
  form.append("folder", isImg ? "sop/images" : "sop/files");
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/${isImg ? "image" : "raw"}/upload`, { method: "POST", body: form });
  if (!res.ok) { const e = await res.json().catch(() => ({})); fail(e?.error?.message || "อัปโหลดไฟล์ไม่สำเร็จ (Cloudinary)"); }
  const r = await res.json();
  return { url: r.secure_url, name, size: r.bytes || blob.size, mime, w: r.width || w, h: r.height || h };
}

export { Timestamp };
