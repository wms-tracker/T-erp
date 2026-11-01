// ===================================================================
// SOP Management — หน้าเว็บ (ทำงานภายใน shell ของ Web ERP)
// ข้อมูลอยู่ใน Firestore ผ่าน ./data.js, export ผ่าน ./export.js
// ===================================================================
import * as D from "./data.js";
import { buildDocx, buildXlsx, docModel, saveBlob, safeName } from "./export.js";
import { diffHtml } from "./diff.js";

const { S, STATUS } = D;
/* ================= utilities ================= */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const enc = encodeURIComponent;
const fmtD = d => { if (!d) return "-"; const [y, m, dd] = String(d).slice(0, 10).split("-"); return `${dd}/${m}/${y}`; };
const fmtDT = iso => { if (!iso) return "-"; const d = new Date(iso); return d.toLocaleDateString("en-GB") + " " + d.toTimeString().slice(0, 5); };
const ago = iso => {
  if (!iso) return "-";
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return "เมื่อสักครู่"; if (s < 3600) return Math.floor(s / 60) + " นาทีที่แล้ว";
  if (s < 86400) return Math.floor(s / 3600) + " ชม.ที่แล้ว"; if (s < 86400 * 7) return Math.floor(s / 86400) + " วันที่แล้ว";
  return fmtDT(iso);
};
const fmtSize = n => n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB";
const addMonths = (dateStr, m) => { const d = dateStr ? new Date(dateStr + "T00:00:00") : new Date(); d.setMonth(d.getMonth() + m); return d.toLocaleDateString("sv-SE"); };
const todayStr = () => new Date().toLocaleDateString("sv-SE");

const ICON = {
  dash: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z"/>', list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  task: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>', plus: '<path d="M12 5v14M5 12h14"/>',
  act: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>', gear: '<circle cx="12" cy="12" r="3"/><path d="M12 1v3M12 20v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M1 12h3M20 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>', search: '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>', edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  up: '<path d="M18 15l-6-6-6 6"/>', down: '<path d="M6 9l6 6 6-6"/>', x: '<path d="M18 6L6 18M6 6l12 12"/>',
  grip: '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
  word: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13l1.5 5 1.5-4 1.5 4 1.5-5"/>',
  print: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  xls: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>', check: '<path d="M20 6L9 17l-5-5"/>', send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>',
  back: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-1"/>', ban: '<circle cx="12" cy="12" r="10"/><path d="M4.93 4.93l14.14 14.14"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>', alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>', msg: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  diff: '<path d="M12 3v18M5 8h4M7 6v4M15 16h4"/>', trash: '<path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4h6v2"/>',
  img: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  clip: '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>', cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  dept: '<path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1M14 9h1M9 13h1M14 13h1M9 17h1M14 17h1"/>',
};
const ic = (n, cls = "") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n] || ""}</svg>`;
const ACTION_LABEL = {
  create: "สร้าง SOP ใหม่", copy: "คัดลอกเป็น SOP ใหม่", edit: "แก้ไขเนื้อหา", submit: "ส่งตรวจ", start_review: "รับเรื่องตรวจสอบ",
  review_pass: "ตรวจสอบผ่าน → ส่งผู้จัดการอนุมัติ", approve: "อนุมัติและประกาศใช้", return: "ส่งกลับแก้ไข", comment: "แสดงความคิดเห็น",
  obsolete: "ยกเลิกใช้งาน SOP", revise: "สร้างฉบับแก้ไข", supersede: "ถูกแทนที่ด้วยฉบับใหม่", cancel: "ยกเลิกฉบับร่าง",
  delete: "ลบฉบับร่าง", review_date: "ทบทวน / กำหนดวันทบทวนใหม่",
};
const ACTION_ICON = { create: "plus", copy: "copy", edit: "edit", submit: "send", start_review: "eye", review_pass: "check", approve: "shield", return: "back", comment: "msg", obsolete: "ban", revise: "edit", supersede: "file", cancel: "x", delete: "trash", review_date: "cal" };
const stLabel = s => STATUS[s] || s;
const stBadge = s => `<span class="badge-st st-${esc(s)}">${esc(stLabel(s))}</span>`;
const RV_LABEL = { overdue: "เลยกำหนดทบทวน", due_soon: "ใกล้ถึงกำหนดทบทวน", ok: "", none: "" };
const WORK_UI = ["draft", "submitted", "dept_review", "manager_approval", "revision_required"];

/* ================= root, toast, modal ================= */
let ROOT, VIEW;
const UI = { dirty: false, refresh: null, tasks: [] };
function toast(msg, type = "", ms = 4000) {
  const el = document.createElement("div"); el.className = "toast " + type; el.innerHTML = msg;
  $(".sop-toasts", ROOT).appendChild(el); setTimeout(() => el.remove(), ms);
}
const toastErr = e => { console.error(e); toast(esc(e.message || e), "err", 7000); };
function modal({ title, body, ok = "ตกลง", cancel = "ยกเลิก", okClass = "primary", wide = false, onOk, onOpen }) {
  return new Promise(resolve => {
    const ov = document.createElement("div"); ov.className = "overlay";
    ov.innerHTML = `<div class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true"><div class="mh"><h2>${title}</h2><span class="spacer"></span><button class="icon-btn" data-x aria-label="ปิด">${ic("x")}</button></div>
      <div class="mb">${body}</div><div class="mf">${cancel ? `<button class="btn" data-x>${cancel}</button>` : ""}${ok ? `<button class="btn ${okClass}" data-ok>${ok}</button>` : ""}</div></div>`;
    ROOT.appendChild(ov);
    const close = v => { ov.remove(); resolve(v); };
    $$("[data-x]", ov).forEach(b => b.onclick = () => close(null));
    ov.addEventListener("mousedown", e => { if (e.target === ov) close(null); });
    const okBtn = $("[data-ok]", ov);
    if (okBtn) okBtn.onclick = async () => {
      okBtn.disabled = true;
      try { const r = onOk ? await onOk(ov) : true; if (r !== false) close(r ?? true); }
      catch (e) { toastErr(e); } finally { okBtn.disabled = false; }
    };
    onOpen && onOpen(ov);
    const first = $("input,textarea,select", ov); first && setTimeout(() => first.focus(), 30);
  });
}
function askText(title, label, { required = true, ok = "ยืนยัน", okClass = "primary", placeholder = "", extra = "", value = "" } = {}) {
  return modal({
    title, ok, okClass,
    body: `${extra}<label class="f">${label}${required ? ' <span class="req">*</span>' : ""}</label><textarea class="in" id="askt" rows="4" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`,
    onOk: ov => { const v = $("#askt", ov).value.trim(); if (required && !v) { toast("กรุณากรอกข้อมูล", "err"); return false; } return v || ""; },
  });
}
const confirmBox = (title, text, ok = "ยืนยัน", okClass = "primary") => modal({ title, body: `<p style="margin:0">${text}</p>`, ok, okClass });
function lightbox(src) { const el = document.createElement("div"); el.className = "lightbox"; el.innerHTML = `<img src="${esc(src)}" alt="">`; el.onclick = () => el.remove(); ROOT.appendChild(el); }

/* ================= boot ================= */
export async function start(mainEl, profile) {
  ROOT = document.createElement("div"); ROOT.className = "sop";
  ROOT.innerHTML = `<nav class="sop-tabs" id="sopTabs"></nav><div id="sopView"><div class="empty">กำลังโหลด…</div></div><div class="sop-toasts"></div><div class="sop-tip" role="tooltip"></div>`;
  mainEl.innerHTML = ""; mainEl.appendChild(ROOT);
  VIEW = $("#sopView", ROOT);
  try { await D.init(profile); }
  catch (e) { VIEW.innerHTML = `<div class="banner err">${ic("alert")}<div>โหลดข้อมูล SOP ไม่ได้: ${esc(e.message)}<br><small>ถ้าเพิ่งติดตั้ง ต้องนำกฎความปลอดภัย (Firestore Rules) ส่วน SOP ไปเผยแพร่ก่อน — ดู erp/SOP-SETUP.md</small></div></div>`; return; }
  renderTabs();
  bindTooltips();
  D.subscribe(() => { loadTasks(true); softRefresh(); });
  window.addEventListener("hashchange", onHash);
  window.addEventListener("beforeunload", e => { if (UI.dirty) { e.preventDefault(); e.returnValue = ""; } });
  loadTasks(false);
  route();
}
function renderTabs() {
  const tabs = [["#/dashboard", "dash", "Dashboard"], ["#/sops", "list", "ทะเบียน SOP"], ["#/tasks", "task", 'งานของฉัน <span class="badge hidden" id="taskBadge">0</span>'],
    D.canCreateAny() ? ["#/new", "plus", "สร้าง SOP"] : null, ["#/activity", "act", "ประวัติ"],
    S.role === "admin" ? ["#/admin/members", "users", "สิทธิ์ SOP"] : null, S.role === "admin" ? ["#/admin/departments", "dept", "แผนก"] : null,
    S.role === "admin" ? ["#/admin/settings", "gear", "ตั้งค่า"] : null].filter(Boolean);
  $("#sopTabs", ROOT).innerHTML = tabs.map(([h, i, t]) => `<a href="${h}" data-h="${h}">${ic(i)} ${t}</a>`).join("")
    + `<span class="spacer"></span><span class="small muted" style="align-self:center">${esc(S.name)} · ${esc(D.SOP_ROLES[S.role])}${S.deptId ? " · " + esc(D.deptById(S.deptId)?.code || "") : ""}</span>`;
}
function markTabs() {
  const h = location.hash.split("?")[0];
  $$("#sopTabs a", ROOT).forEach(a => a.classList.toggle("on", h === a.dataset.h || (a.dataset.h === "#/sops" && /^#\/(sop|v|edit|compare)\//.test(h))));
  // เมนูด้านซ้ายของ ERP
  document.querySelectorAll(".nav-sec-item").forEach(a => {
    const href = a.getAttribute("href") || "";
    if (href.startsWith("sop.html")) a.classList.toggle("active", href === "sop.html" + h || (href === "sop.html#/sops" && /^#\/(sop|v|edit|compare)\//.test(h)));
  });
}
async function loadTasks(notify) {
  const before = new Set(UI.tasks.filter(t => ["approve", "review", "fix"].includes(t.kind)).map(t => t.kind + t.version_id + t.status));
  try { UI.tasks = await D.myTasks(); } catch { UI.tasks = []; }
  const b = $("#taskBadge", ROOT); const n = UI.tasks.filter(t => t.kind !== "draft").length;
  if (b) { b.textContent = n; b.classList.toggle("hidden", !n); }
  if (notify) UI.tasks.filter(t => ["approve", "review", "fix"].includes(t.kind) && !before.has(t.kind + t.version_id + t.status))
    .forEach(t => toast(`${esc(t.sop_number)}: ${esc(t.label)} — <a href="#/v/${enc(t.version_id)}">เปิดดู</a>`, "", 9000));
}
let refreshTimer = null;
function softRefresh() { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => { if (UI.refresh) UI.refresh(); }, 250); }
function bindTooltips() {
  const tip = $(".sop-tip", ROOT);
  ROOT.addEventListener("mouseover", e => { const t = e.target.closest("[data-tip]"); if (!t) { tip.classList.remove("on"); return; } tip.textContent = t.dataset.tip; tip.classList.add("on"); });
  ROOT.addEventListener("mousemove", e => { if (!tip.classList.contains("on")) return; tip.style.left = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8) + "px"; tip.style.top = (e.clientY + 16) + "px"; });
  ROOT.addEventListener("mouseleave", () => tip.classList.remove("on"));
}

/* ================= router ================= */
const ROUTES = [
  [/^#\/dashboard$/, pageDashboard], [/^#\/sops$/, pageList], [/^#\/sop\/([^/?]+)$/, pageSop], [/^#\/v\/([^/?]+)$/, pageVersion],
  [/^#\/edit\/([^/?]+)$/, pageEdit], [/^#\/new$/, pageNew], [/^#\/compare\/([^/?]+)$/, pageCompare], [/^#\/tasks$/, pageTasks],
  [/^#\/activity$/, pageActivity], [/^#\/admin\/departments$/, pageDepts], [/^#\/admin\/members$/, pageMembers], [/^#\/admin\/settings$/, pageSettings],
];
let lastHash = location.hash;
function qs() { const i = location.hash.indexOf("?"); return Object.fromEntries(new URLSearchParams(i >= 0 ? location.hash.slice(i + 1) : "")); }
function setQs(obj) {
  const base = location.hash.split("?")[0];
  const p = new URLSearchParams(Object.entries(obj).filter(([, v]) => v != null && v !== ""));
  history.replaceState(null, "", base + (p.toString() ? "?" + p : "")); lastHash = location.hash;
}
function onHash() {
  if (UI.dirty && !confirm("มีการแก้ไขที่ยังไม่ได้บันทึก ต้องการออกจากหน้านี้หรือไม่?")) { history.replaceState(null, "", lastHash); return; }
  UI.dirty = false; lastHash = location.hash; route();
}
async function route() {
  if (!location.hash || location.hash === "#/") { history.replaceState(null, "", "#/dashboard"); lastHash = location.hash; }
  const path = location.hash.split("?")[0];
  const r = ROUTES.find(([re]) => re.test(path));
  UI.refresh = null; markTabs();
  if (!r) { VIEW.innerHTML = '<div class="empty">ไม่พบหน้าที่ต้องการ</div>'; return; }
  VIEW.innerHTML = '<div class="empty">กำลังโหลด…</div>';
  try { await r[1](VIEW, ...path.match(r[0]).slice(1).map(decodeURIComponent)); }
  catch (e) { console.error(e); VIEW.innerHTML = `<div class="banner err">${ic("alert")}<div>${esc(e.message)}</div></div>`; }
  const sc = document.querySelector(".erp-main"); if (sc) sc.scrollTop = 0;
}

/* ================= common bits ================= */
function deptOptions(sel, { all = false, onlyActive = true, onlyCreatable = false } = {}) {
  let ds = S.depts.filter(d => !onlyActive || d.active || d.id === sel);
  if (onlyCreatable && !D.isPriv()) ds = ds.filter(d => d.id === S.deptId);
  return (all ? '<option value="">ทุกแผนก</option>' : "") + ds.map(d => `<option value="${esc(d.id)}" ${sel === d.id ? "selected" : ""}>${esc(d.code)} – ${esc(d.name)}${d.active ? "" : " (ปิดใช้งาน)"}</option>`).join("");
}
const STATUS_FILTERS = [["", "ทุกสถานะ"], ["active", "ใช้งานอยู่ (มีฉบับประกาศใช้)"], ["draft", "ฉบับร่าง"], ["pending", "รออนุมัติ (ทุกขั้น)"], ["submitted", "ส่งตรวจ"], ["dept_review", "หัวหน้าแผนกตรวจสอบ"], ["manager_approval", "รอผู้จัดการอนุมัติ"], ["revision_required", "ส่งกลับแก้ไข"], ["overdue", "เลยกำหนดทบทวน"], ["due_soon", "ใกล้ถึงกำหนดทบทวน"], ["obsolete", "ยกเลิกใช้งาน"]];
const statusOptions = sel => STATUS_FILTERS.map(([v, l]) => `<option value="${v}" ${sel === v ? "selected" : ""}>${l}</option>`).join("");
function reviewCell(s) {
  if (!s.next_review_date) return '<span class="muted">-</span>';
  return `<span class="rv-${s.review_state}">${fmtD(s.next_review_date)}</span>${RV_LABEL[s.review_state] ? `<div class="small rv-${s.review_state}">${s.review_state === "overdue" ? ic("alert") : ""} ${RV_LABEL[s.review_state]}</div>` : ""}`;
}
function sopRow(s) {
  return `<tr class="click" data-go="#/sop/${enc(s.id)}">
    <td class="nowrap"><b class="mono">${esc(s.sop_number)}</b></td>
    <td><div style="font-weight:500">${esc(s.title)}</div>${s.working && s.current ? `<div class="small muted">ใช้งาน: ${esc(s.current.rev)} · กำลังแก้ไข ${esc(s.working.rev)}</div>` : ""}</td>
    <td><span class="tag">${esc(s.dept_code)}</span></td><td class="nowrap">${s.current ? esc(s.current.rev) : '<span class="muted">-</span>'}</td>
    <td>${stBadge(s.status)}</td><td class="nowrap">${s.current ? fmtD(s.current.effective_date) : "-"}</td>
    <td class="nowrap">${reviewCell(s)}</td><td>${esc(s.owner_name || "-")}</td><td class="nowrap small muted">${ago(s.updated_at)}</td></tr>`;
}
function bindRowClicks(root) { $$("[data-go]", root).forEach(r => r.onclick = e => { if (!e.target.closest("a,button")) location.hash = r.dataset.go; }); }
function feedItem(a, withSop = true) {
  const link = a.version_id ? `#/v/${enc(a.version_id)}` : `#/sop/${enc(a.sop_id)}`;
  return `<li><div class="dot">${ic(ACTION_ICON[a.action] || "act")}</div><div class="tx">
    <div><b>${esc(a.user_name || "ระบบ")}</b> ${esc(ACTION_LABEL[a.action] || a.action)}${withSop && a.sop_number ? ` — <a href="${link}">${esc(a.sop_number)} ${esc(a.rev || "")}</a>` : (a.rev ? ` <span class="muted">${esc(a.rev)}</span>` : "")}
    ${a.to_status && a.from_status !== a.to_status ? " " + stBadge(a.to_status) : ""}</div>
    ${withSop && a.title ? `<div class="small muted">${esc(a.title)}</div>` : ""}${a.comment ? `<div class="cm">${esc(a.comment)}</div>` : ""}
    <div class="tm">${fmtDT(a.at)} · ${ago(a.at)}</div></div></li>`;
}
const pageHead = (title, sub, right = "") => `<div class="page-head"><div><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ""}</div><span class="spacer"></span>${right}</div>`;

/* ================= Dashboard ================= */
async function pageDashboard(view) {
  const q = qs();
  view.innerHTML = pageHead("Dashboard SOP", "ภาพรวมเอกสาร SOP " + esc(S.settings.company_name || ""), D.canCreateAny() ? `<a class="btn accent" href="#/new">${ic("plus")} สร้าง SOP ใหม่</a>` : "") + `
    <form class="filters" id="df">
      <label class="fi"><span>แผนก</span><select class="in" name="dept">${deptOptions(q.dept || "", { all: true, onlyActive: false })}</select></label>
      <label class="fi"><span>สถานะ</span><select class="in" name="status">${statusOptions(q.status || "")}</select></label>
      <label class="fi"><span>แก้ไขล่าสุดตั้งแต่</span><input class="in" type="date" name="from" value="${esc(q.from || "")}"></label>
      <label class="fi"><span>ถึง</span><input class="in" type="date" name="to" value="${esc(q.to || "")}"></label>
      <button class="btn" type="button" id="dreset">ล้างตัวกรอง</button></form><div id="dbody"><div class="empty">กำลังโหลด…</div></div>`;
  const form = $("#df", view);
  const load = async () => { const f = Object.fromEntries(new FormData(form)); setQs(f); renderDash($("#dbody", view), await D.dashboard(f), f); };
  form.onchange = () => load().catch(toastErr);
  $("#dreset", view).onclick = () => { $$("select,input", form).forEach(x => x.value = ""); load().catch(toastErr); };
  UI.refresh = () => load().catch(() => { });
  await load();
}
function renderDash(el, d, f) {
  const k = d.kpi;
  const cards = [["SOP ทั้งหมด", k.total, "var(--navy)", "file", ""], ["ใช้งานอยู่", k.active, "var(--green)", "shield", "active"], ["ฉบับร่าง", k.draft, "#64748b", "edit", "draft"],
    ["รออนุมัติ", k.pending, "var(--amber)", "clock", "pending"], ["ส่งกลับแก้ไข", k.revision_required, "var(--red)", "back", "revision_required"],
    ["เลยกำหนดทบทวน", k.overdue, "#991b1b", "alert", "overdue"], [`ใกล้ครบกำหนดทบทวน (${S.settings.review_warn_days} วัน)`, k.due_soon, "#d97706", "cal", "due_soon"]];
  const listLink = st => "#/sops?" + new URLSearchParams(Object.entries({ dept: f.dept, status: st }).filter(([, v]) => v));
  const SER = [["published", "ใช้งานอยู่", "var(--s1)"], ["in_progress", "ฉบับแรก ระหว่างจัดทำ/อนุมัติ", "var(--s2)"], ["revision_required", "ฉบับแรก ส่งกลับแก้ไข", "var(--s3)"], ["obsolete", "ยกเลิกใช้งาน", "var(--s4)"]];
  const maxD = Math.max(1, ...d.byDept.map(x => x.total));
  const deptBars = d.byDept.map(x => `<div class="hbar"><a class="nm" href="#/sops?dept=${enc(x.id)}" title="${esc(x.name)}"><b>${esc(x.code)}</b> <span class="muted">${esc(x.name)}</span></a>
      <div class="trk" style="width:${Math.max(x.total / maxD * 100, 0.5)}%">${SER.filter(([key]) => x[key] > 0).map(([key, lbl, col]) => `<div class="seg" style="flex:${x[key]};background:${col}" data-tip="${esc(x.code)} · ${lbl}: ${x[key]}"></div>`).join("") || '<div class="seg" style="flex:1;background:#e2e8f0" data-tip="ยังไม่มี SOP"></div>'}</div>
      <div class="n">${x.total}</div></div>`).join("") || '<div class="empty">ยังไม่มีแผนก</div>';
  const MS = [["submit", "ส่งตรวจ", "var(--s1)"], ["approve", "อนุมัติประกาศใช้", "var(--s2)"], ["return", "ส่งกลับแก้ไข", "var(--s3)"]];
  const maxM = Math.max(1, ...d.monthly.flatMap(m => MS.map(([k2]) => m[k2])));
  const W = 640, H = 200, padL = 30, padB = 26, cw = (W - padL) / d.monthly.length, bw = Math.min(10, (cw - 10) / 3);
  const yT = v => H - padB - v / maxM * (H - padB - 10);
  const ticks = [...new Set([0, Math.ceil(maxM / 2), maxM])];
  const TH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const mLabel = ym => TH[Number(ym.slice(5)) - 1] + " " + String((Number(ym.slice(0, 4)) + 543) % 100);
  const svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="จำนวนการส่งตรวจ อนุมัติ และส่งกลับรายเดือน">
    ${ticks.map(t => `<line x1="${padL}" x2="${W}" y1="${yT(t)}" y2="${yT(t)}" stroke="#e2e8f0"/><text x="${padL - 6}" y="${yT(t) + 4}" text-anchor="end" font-size="10" fill="#64748b">${t}</text>`).join("")}
    ${d.monthly.map((m, i) => {
      const x0 = padL + i * cw + (cw - bw * 3 - 4) / 2;
      const bars = MS.map(([key, , col], j) => { const v = m[key]; if (!v) return ""; const y = yT(v), h = H - padB - y, x = x0 + j * (bw + 2), r = Math.min(4, h, bw / 2);
        return `<path d="M${x},${H - padB} V${y + r} q0,-${r} ${r},-${r} H${x + bw - r} q${r},0 ${r},${r} V${H - padB} Z" fill="${col}"/>`; }).join("");
      return `<g>${bars}<rect x="${padL + i * cw}" y="0" width="${cw}" height="${H - padB}" fill="transparent" data-tip="${esc(mLabel(m.month) + "\n" + MS.map(([key, lbl]) => `${lbl}: ${m[key]}`).join("\n"))}"/><text x="${padL + i * cw + cw / 2}" y="${H - 8}" text-anchor="middle" font-size="10" fill="#64748b">${mLabel(m.month)}</text></g>`;
    }).join("")}<line x1="${padL}" x2="${W}" y1="${H - padB}" y2="${H - padB}" stroke="#94a3b8"/></svg>`;
  el.innerHTML = `<div class="kpis">${cards.map(([lbl, v, col, icn, st]) => `<a class="kpi" href="${listLink(st)}" style="--k:${col}"><div class="lbl">${ic(icn)} ${lbl}</div><div class="val">${v}</div></a>`).join("")}</div>
    <div class="dash">
      <div class="card c7"><div class="hd"><h3>จำนวน SOP แยกตามแผนก</h3></div><div class="bd"><div class="legend" style="margin-bottom:10px">${SER.map(([, l, c]) => `<span><i style="background:${c}"></i>${l}</span>`).join("")}</div>${deptBars}</div></div>
      <div class="card c5"><div class="hd"><h3>รายการที่รอคุณดำเนินการ</h3><span class="spacer"></span><a href="#/tasks" class="small">ดูทั้งหมด</a></div><div class="bd" style="padding-top:4px">${d.tasks.length ? d.tasks.map(taskItem).join("") : '<div class="empty">ไม่มีงานค้าง 🎉</div>'}</div></div>
      <div class="card c7"><div class="hd"><h3>ความเคลื่อนไหวของ Workflow 12 เดือน</h3></div><div class="bd"><div class="legend" style="margin-bottom:6px">${MS.map(([, l, c]) => `<span><i style="background:${c}"></i>${l}</span>`).join("")}</div>${svg}</div></div>
      <div class="card c5"><div class="hd"><h3>SOP ครบ/ใกล้ครบกำหนดทบทวน</h3></div><div class="bd" style="padding:0">
        ${d.reviewList.length ? `<table class="t"><tbody>${d.reviewList.map(s => `<tr class="click" data-go="#/sop/${enc(s.id)}"><td><b class="mono">${esc(s.sop_number)}</b><div class="small">${esc(s.title)}</div></td><td class="nowrap">${reviewCell(s)}</td></tr>`).join("")}</tbody></table>` : '<div class="empty">ไม่มี SOP ที่ใกล้ครบกำหนดทบทวน</div>'}</div></div>
      <div class="card c12"><div class="hd"><h3>ประวัติการแก้ไขล่าสุด</h3><span class="spacer"></span><a href="#/activity" class="small">ดูทั้งหมด</a></div><div class="bd" style="padding-top:4px">
        ${d.activity.length ? `<ul class="feed">${d.activity.map(a => feedItem(a)).join("")}</ul>` : '<div class="empty">ยังไม่มีกิจกรรม</div>'}</div></div></div>`;
  bindRowClicks(el);
}
const TASK_COLOR = { approve: "var(--amber)", review: "#4338ca", fix: "var(--red)", overdue: "#991b1b", due_soon: "#d97706", draft: "#94a3b8" };
function taskItem(t) {
  return `<div class="task"><span class="k" style="background:${TASK_COLOR[t.kind]}"></span><div class="grow" style="min-width:0">
    <div class="small" style="font-weight:600;color:${TASK_COLOR[t.kind]}">${esc(t.label)}</div>
    <a href="#/v/${enc(t.version_id)}"><b class="mono">${esc(t.sop_number)}</b> ${esc(t.rev)}</a> — ${esc(t.title)}
    <div class="small muted"><span class="tag">${esc(t.dept_code)}</span> ${stBadge(t.status)}</div></div>
    <a class="btn sm" href="#/v/${enc(t.version_id)}">${t.kind === "approve" ? "อนุมัติ" : t.kind === "review" ? "ตรวจสอบ" : t.kind === "fix" || t.kind === "draft" ? "แก้ไข" : "ทบทวน"}</a></div>`;
}

/* ================= SOP list ================= */
async function pageList(view) {
  const q = qs();
  view.innerHTML = pageHead("ทะเบียน SOP", "ค้นหาด้วยรหัส ชื่อ แผนก หรือคำสำคัญในเนื้อหา",
    `<button class="btn" id="xls">${ic("xls")} ส่งออก Excel</button>${D.canCreateAny() ? `<a class="btn accent" href="#/new">${ic("plus")} สร้าง SOP ใหม่</a>` : ""}`) + `
    <form class="filters" id="lf">
      <label class="fi grow"><span>คำค้นหา</span><input class="in" name="q" value="${esc(q.q || "")}" placeholder="เช่น OB-SOP-001, Picking, รถโฟล์คลิฟท์"></label>
      <label class="fi"><span>แผนก</span><select class="in" name="dept">${deptOptions(q.dept || "", { all: true, onlyActive: false })}</select></label>
      <label class="fi"><span>สถานะ</span><select class="in" name="status">${statusOptions(q.status || "")}</select></label>
      <button class="btn primary">${ic("search")} ค้นหา</button></form>
    <div class="card"><div class="table-wrap" id="lt"><div class="empty">กำลังโหลด…</div></div></div>`;
  const form = $("#lf", view); let list = [];
  const load = async () => {
    const f = Object.fromEntries(new FormData(form)); setQs(f);
    list = await D.listSops(f);
    $("#lt", view).innerHTML = list.length ? `<table class="t"><thead><tr><th>SOP Number</th><th>SOP Title</th><th>แผนก</th><th>Rev. ใช้งาน</th><th>สถานะ</th><th>วันที่มีผล</th><th>วันทบทวน</th><th>ผู้รับผิดชอบ</th><th>อัปเดต</th></tr></thead>
      <tbody>${list.map(sopRow).join("")}</tbody></table><div class="small muted" style="padding:10px 12px">พบ ${list.length} รายการ</div>` : '<div class="empty">ไม่พบ SOP ตามเงื่อนไข</div>';
    bindRowClicks($("#lt", view));
  };
  form.onsubmit = e => { e.preventDefault(); load().catch(toastErr); };
  $$("select", form).forEach(s => s.onchange = () => load().catch(toastErr));
  $("#xls", view).onclick = () => exportRegister(list).catch(toastErr);
  UI.refresh = () => load().catch(() => { });
  await load();
}
async function exportRegister(list) {
  const RS = { overdue: "เลยกำหนดทบทวน", due_soon: "ใกล้ถึงกำหนด", ok: "ปกติ", none: "-" };
  const cols = [["SOP Number", 16], ["SOP Title", 42], ["Department", 20], ["Current Rev.", 11], ["Status", 26], ["Effective Date", 13], ["Next Review", 13], ["Review Status", 16], ["Owner", 22], ["Approved By", 22], ["Approved Date", 13], ["Working Rev.", 11], ["Working Status", 26], ["Last Updated", 17]].map(([header, width]) => ({ header, width }));
  const rows = list.map(s => [s.sop_number, s.current?.title || s.title, `${s.dept_code} – ${s.dept_name}`, s.current?.rev || "-",
    s.is_obsolete ? STATUS.obsolete : s.current ? STATUS.published : "ยังไม่ประกาศใช้", s.current ? fmtD(s.current.effective_date) : "", s.next_review_date ? fmtD(s.next_review_date) : "",
    RS[s.review_state], s.owner_name, s.approved_name, s.current?.approved_at ? fmtD(s.current.approved_at) : "", s.working?.rev || "", s.working ? STATUS[s.working.status] : "", s.updated_at ? fmtDT(s.updated_at) : ""]);
  saveBlob(await buildXlsx("SOP Register", cols, rows), `SOP_Register_${todayStr()}.xlsx`);
}

/* ================= Tasks / Activity ================= */
async function pageTasks(view) {
  const load = async () => {
    await loadTasks(false);
    const groups = [["approve", "รออนุมัติ"], ["review", "รอตรวจสอบ"], ["fix", "ถูกส่งกลับแก้ไข"], ["overdue", "เลยกำหนดทบทวน"], ["due_soon", "ใกล้ครบกำหนดทบทวน"], ["draft", "ฉบับร่างของฉัน"]];
    view.innerHTML = pageHead("งานที่รอฉันดำเนินการ", "รายการ SOP ที่ต้องตรวจสอบ อนุมัติ แก้ไข หรือทบทวน")
      + (UI.tasks.length ? groups.filter(([k]) => UI.tasks.some(t => t.kind === k)).map(([k, l]) => `<div class="card"><div class="hd"><h3>${l}</h3><span class="tag">${UI.tasks.filter(t => t.kind === k).length}</span></div><div class="bd" style="padding-top:4px">${UI.tasks.filter(t => t.kind === k).map(taskItem).join("")}</div></div>`).join("")
        : '<div class="card"><div class="empty">ไม่มีงานค้าง 🎉</div></div>');
  };
  UI.refresh = () => load().catch(() => { });
  await load();
}
async function pageActivity(view) {
  const load = async () => {
    const list = await D.recentActivity(200);
    view.innerHTML = pageHead("ประวัติการดำเนินการ", "บันทึกวัน เวลา และผู้ดำเนินการทุกครั้ง (200 รายการล่าสุด)")
      + `<div class="card"><div class="bd" style="padding-top:4px">${list.length ? `<ul class="feed">${list.map(a => feedItem(a)).join("")}</ul>` : '<div class="empty">ยังไม่มีกิจกรรม</div>'}</div></div>`;
  };
  UI.refresh = () => load().catch(() => { });
  await load();
}

/* ================= SOP view ================= */
async function pageSop(view, id) {
  const P = await D.payloadForSop(id);
  history.replaceState(null, "", "#/v/" + enc(P.version.id)); lastHash = location.hash;
  renderVersion(view, P);
}
async function pageVersion(view, vid) { renderVersion(view, await D.versionPayload(vid)); }
const WF_STEPS = [["draft", "Draft", "ผู้จัดทำสร้าง SOP"], ["submitted", "Submitted", "ส่งให้หัวหน้าแผนกตรวจสอบ"], ["dept_review", "Department Review", "หัวหน้าแผนกตรวจสอบ"], ["manager_approval", "Manager Approval", "Warehouse Operations Manager อนุมัติ"], ["published", "Published", "ประกาศใช้"]];
function stepper(v) {
  const order = WF_STEPS.map(s => s[0]); let idx = order.indexOf(v.status);
  const bad = v.status === "revision_required"; if (bad) idx = 0;
  if (["superseded", "obsolete"].includes(v.status)) idx = 5;
  return `<div class="stepper">${WF_STEPS.map(([, en, th], i) => {
    const cls = bad && i === 0 ? "bad" : i < idx || (idx === 4 && i === 4) || idx === 5 ? "done" : i === idx ? "cur" : "";
    return `<div class="s ${cls}"><div class="n">${cls === "done" ? "✓" : cls === "bad" ? "!" : i + 1}</div><div class="lb"><b>${en}</b>${bad && i === 0 ? ' — <span style="color:var(--red)">Revision Required</span>' : ""}<small>${th}</small></div></div>`;
  }).join("")}</div>`;
}
const fileIcon = name => /\.(png|jpe?g|gif|webp)$/i.test(name) ? "img" : /\.(xlsx?|csv)$/i.test(name) ? "xls" : /\.docx?$/i.test(name) ? "word" : "file";
function docView(P) {
  const { sop, version: v, people } = P; const c = v.content;
  const sec = (n, t, body) => `<div class="sec-h">${n}. ${t}</div><div class="sec-b ${body ? "" : "none"}">${body ? esc(body) : "-"}</div>`;
  const person = (u, date, note) => u ? `<div class="e">${note || ""}</div><div><b>( ${esc(u.display_name)} )</b></div><div class="small muted">${esc(u.position || "")}</div><div class="small">วันที่ ${date ? fmtD(date) : "……/……/……"}</div>` : '<div class="e"></div><div class="muted">( ยังไม่ระบุ )</div>';
  const rd = v.is_current && sop.next_review_date ? sop.next_review_date : v.review_date;
  const logo = S.settings.logo_url ? `<img src="${esc(S.settings.logo_url)}" alt="logo">` : `<b style="color:var(--navy)">${esc((S.settings.company_name_en || S.settings.company_name || "LOGO").split(" ")[0])}</b>`;
  return `<div class="doc"><div class="doc-head"><div class="logo">${logo}</div>
      <div class="mid"><b>${esc(S.settings.company_name || "ตั้งชื่อบริษัทที่ แท็บ ตั้งค่า")}</b><div class="small muted">${esc(S.settings.company_name_en || "")}</div><div style="font-weight:600;margin-top:4px">${esc(v.title)}</div></div>
      <div class="meta"><div>รหัสเอกสาร: <b class="mono">${esc(sop.sop_number)}</b></div><div>Revision: <b>${esc(v.rev)}</b></div><div>วันที่มีผล: <b>${fmtD(v.effective_date)}</b></div><div>แผนก: <b>${esc(sop.dept_code)}</b></div></div></div>
    <div class="doc-body"><div class="doc-title"><div class="k">STANDARD OPERATING PROCEDURE</div><h1>${esc(v.title)}</h1></div>
      <table class="info-t"><tr><th>SOP Number</th><td class="mono">${esc(sop.sop_number)}</td><th>Department</th><td>${esc(sop.dept_code)} – ${esc(sop.dept_name)}</td></tr>
        <tr><th>Revision</th><td>${esc(v.rev)}</td><th>Status</th><td>${stBadge(v.status)}</td></tr>
        <tr><th>Effective Date</th><td>${fmtD(v.effective_date)}</td><th>Review Date</th><td>${fmtD(rd)}</td></tr>
        <tr><th>ผู้รับผิดชอบ</th><td>${esc(people.owner?.display_name || "-")}</td><th>Keywords</th><td>${esc(c.keywords || "-")}</td></tr></table>
      <table class="sig-t"><tr><th>ผู้จัดทำ (Prepared By)</th><th>ผู้ตรวจสอบ (Reviewed By)</th><th>ผู้อนุมัติ (Approved By)</th></tr>
        <tr><td>${person(people.prepared, v.submitted_at || v.created_at)}</td><td>${person(people.reviewed_by || people.reviewer, v.reviewed_at, v.reviewed_by ? "ตรวจสอบผ่านระบบแล้ว" : "")}</td>
          <td>${person(people.approved_by || people.approver, v.approved_at, v.approved_by ? "อนุมัติผ่านระบบแล้ว" : "")}</td></tr></table>
      ${sec(1, "วัตถุประสงค์ (Objective)", c.objective)}${sec(2, "ขอบเขต (Scope)", c.scope)}${sec(3, "ความรับผิดชอบ (Responsibility)", c.responsibility)}
      ${sec(4, "อุปกรณ์ / เครื่องมือ (Equipment / Tools)", c.equipment)}${sec(5, "ข้อกำหนดด้านความปลอดภัย (Safety Requirements)", c.safety)}
      <div class="sec-h">6. ขั้นตอนการปฏิบัติงาน (Work Instructions)</div>
      ${c.steps.length ? c.steps.map((s, i) => `<div class="step"><h4>6.${i + 1} ${esc(s.title)}</h4>${s.detail ? `<div class="dt">${esc(s.detail)}</div>` : ""}
        ${s.images.length ? `<div class="imgs">${s.images.map(im => `<img src="${esc(im.url)}" alt="${esc(im.name)}" data-lb loading="lazy">`).join("")}</div>` : ""}</div>`).join("") : '<div class="sec-b none">-</div>'}
      ${sec(7, "เอกสารที่เกี่ยวข้อง (Related Documents)", c.related_docs)}
      ${c.attachments.map(f => `<div class="att">${ic(fileIcon(f.name))}<span class="nm">${esc(f.name)}</span><span class="small muted">${f.size ? fmtSize(f.size) : ""}</span><a class="btn sm" href="${esc(f.url)}" target="_blank" rel="noopener">เปิด / ดาวน์โหลด</a></div>`).join("")}
      ${sec(8, "ตัวชี้วัด / มาตรฐาน (KPI / Standard)", c.kpi)}
      <div class="sec-h">9. ประวัติการแก้ไข (Revision History)</div>
      <div class="table-wrap"><table class="info-t"><tr><th style="width:70px">Rev.</th><th style="width:100px">วันที่มีผล</th><th>รายละเอียดการแก้ไข</th><th>ผู้จัดทำ</th><th>ผู้อนุมัติ / วันที่</th></tr>
        ${P.versions.filter(x => (D.PUBLIC_STATUSES.includes(x.status) || x.id === v.id) && x.revision <= v.revision).sort((a, b) => a.revision - b.revision).map(x => `<tr><td>${esc(x.rev)}</td><td>${fmtD(x.effective_date)}</td><td style="white-space:pre-wrap">${esc(x.change_summary || "-")}</td><td>${esc(x.prepared_name || "-")}</td><td>${esc(x.approved_name || "-")}${x.approved_at ? '<div class="small muted">' + fmtD(x.approved_at) + "</div>" : ""}</td></tr>`).join("")}</table></div>
    </div></div>`;
}
function renderVersion(view, P) {
  const { sop, version: v, permissions: pm } = P;
  const working = P.versions.find(x => x.is_working), current = P.versions.find(x => x.is_current);
  let banner = "";
  if (WORK_UI.includes(v.status)) banner = `<div class="banner warn">${ic("alert")}<div><b>ฉบับนี้ยังไม่ได้รับการอนุมัติ — ห้ามใช้ปฏิบัติงานจริง</b>${current ? `<br>ฉบับที่ใช้งานอยู่ปัจจุบันคือ <a href="#/v/${enc(current.id)}">${esc(current.rev)}</a>` : "<br>SOP นี้ยังไม่มีฉบับประกาศใช้"}</div></div>`;
  else if (v.status === "superseded") banner = `<div class="banner info">${ic("info")}<div>ฉบับนี้ถูกแทนที่แล้ว (ใช้อ้างอิงเท่านั้น)${current ? ` — ฉบับปัจจุบันคือ <a href="#/v/${enc(current.id)}">${esc(current.rev)}</a>` : ""}</div></div>`;
  else if (v.status === "obsolete") banner = `<div class="banner err">${ic("ban")}<div><b>SOP นี้ถูกยกเลิกใช้งานแล้ว</b> — ห้ามนำไปใช้ปฏิบัติงาน</div></div>`;
  else if (v.status === "cancelled") banner = `<div class="banner info">${ic("info")}<div>ฉบับร่างนี้ถูกยกเลิก</div></div>`;
  else if (v.status === "published") banner = `<div class="banner ok">${ic("shield")}<div><b>ฉบับใช้งานจริง (Current Version)</b> — อนุมัติโดย ${esc(P.people.approved_by?.display_name || "-")} เมื่อ ${fmtDT(v.approved_at)}${working ? ` · มีฉบับแก้ไข <a href="#/v/${enc(working.id)}">${esc(working.rev)}</a> ${stBadge(working.status)} อยู่ระหว่างดำเนินการ` : ""}</div></div>`;
  const lastReturn = v.status === "revision_required" ? P.log.find(l => l.version_id === v.id && l.action === "return") : null;
  if (lastReturn) banner += `<div class="banner err">${ic("back")}<div><b>ถูกส่งกลับแก้ไขโดย ${esc(lastReturn.user_name)}</b> (${fmtDT(lastReturn.at)})<div style="white-space:pre-wrap;margin-top:4px">เหตุผล: ${esc(lastReturn.comment)}</div></div></div>`;
  if (pm.separationNote) banner += `<div class="banner info">${ic("info")}<div>${esc(pm.separationNote)}</div></div>`;
  const A = [];
  if (pm.canEdit) A.push(`<a class="btn primary" href="#/edit/${enc(v.id)}">${ic("edit")} แก้ไขเนื้อหา</a>`);
  if (pm.canSubmit) A.push(`<button class="btn accent" data-act="submit">${ic("send")} ส่งตรวจ (Submit)</button>`);
  if (pm.canStartReview) A.push(`<button class="btn" data-act="start_review">${ic("eye")} รับเรื่องตรวจสอบ</button>`);
  if (pm.canReviewPass) A.push(`<button class="btn green" data-act="review_pass">${ic("check")} ตรวจสอบผ่าน → ส่งผู้จัดการ</button>`);
  if (pm.canApprove) A.push(`<button class="btn green" data-act="approve">${ic("shield")} อนุมัติและประกาศใช้</button>`);
  if (pm.canReturn) A.push(`<button class="btn danger" data-act="return">${ic("back")} ส่งกลับแก้ไข</button>`);
  if (pm.canRevise) A.push(`<button class="btn primary" data-act="revise">${ic("edit")} สร้างฉบับแก้ไข (Rev. ใหม่)</button>`);
  if (pm.canSetReviewDate) A.push(`<button class="btn" data-act="review_date">${ic("cal")} บันทึกผลทบทวน / วันทบทวนถัดไป</button>`);
  if (pm.canComment) A.push(`<button class="btn" data-act="comment">${ic("msg")} แสดงความคิดเห็น</button>`);
  const EX = [`<button class="btn" data-act="docx">${ic("word")} Word (.docx)</button>`, `<a class="btn" href="sop-print.html?v=${enc(v.id)}" target="_blank">${ic("print")} พิมพ์ / PDF</a>`];
  if (D.canCreateAny()) EX.push(`<button class="btn" data-act="copy">${ic("copy")} คัดลอกเป็น SOP ใหม่</button>`);
  if (pm.canDeleteDraft) EX.push(`<button class="btn danger" data-act="delete">${ic("trash")} ${sop.current_version_id ? "ยกเลิกฉบับแก้ไขนี้" : "ลบฉบับร่าง"}</button>`);
  if (pm.canObsolete) EX.push(`<button class="btn danger" data-act="obsolete">${ic("ban")} ยกเลิกใช้งาน SOP (Obsolete)</button>`);
  const verRows = P.versions.map(x => `<tr class="${x.id === v.id ? "" : "click"}" ${x.id === v.id ? 'style="background:#fffbeb"' : `data-go="#/v/${enc(x.id)}"`}>
      <td><b>${esc(x.rev)}</b>${x.is_current ? ' <span class="tag">Current</span>' : ""}</td><td>${stBadge(x.status)}</td>
      <td class="small">${esc(x.change_summary || "-")}<div class="muted">${esc(x.prepared_name || "")} · ${fmtD(x.updated_at)}</div></td></tr>`).join("");
  const other = P.versions.find(x => x.id !== v.id);
  view.innerHTML = `<div class="page-head"><div class="grow"><div class="crumb"><a href="#/sops">ทะเบียน SOP</a> / <span class="tag">${esc(sop.dept_code)}</span> ${esc(sop.dept_name)}</div>
      <h1><span class="mono">${esc(sop.sop_number)}</span> · ${esc(v.title)}</h1>
      <div class="row" style="margin-top:6px">${stBadge(v.status)} <b>${esc(v.rev)}</b> <span class="muted small">อัปเดตล่าสุด ${fmtDT(v.updated_at)}</span></div></div></div>
    ${banner}
    <div class="sop-layout"><div>${docView(P)}</div><div class="sop-side">
      <div class="card"><div class="hd"><h3>การดำเนินการ</h3></div><div class="bd"><div class="actions">${A.join("") || '<div class="muted small">ไม่มีรายการที่คุณดำเนินการได้ในสถานะนี้</div>'}</div></div></div>
      <div class="card"><div class="hd"><h3>Workflow การอนุมัติ</h3></div><div class="bd">${stepper(v)}
        <dl class="kv" style="margin-top:6px"><dt>ผู้จัดทำ</dt><dd>${esc(P.people.prepared?.display_name || "-")}</dd><dt>ผู้ตรวจสอบ</dt><dd>${esc(P.people.reviewer?.display_name || "หัวหน้าแผนก " + sop.dept_code + " (คนใดก็ได้)")}</dd>
        <dt>ผู้อนุมัติ</dt><dd>${esc(P.people.approver?.display_name || "Warehouse Operations Manager")}</dd>${v.submitted_at ? `<dt>ส่งตรวจเมื่อ</dt><dd>${fmtDT(v.submitted_at)}</dd>` : ""}
        ${v.reviewed_at ? `<dt>ตรวจผ่านเมื่อ</dt><dd>${fmtDT(v.reviewed_at)}</dd>` : ""}${v.approved_at ? `<dt>อนุมัติเมื่อ</dt><dd>${fmtDT(v.approved_at)}</dd>` : ""}</dl></div></div>
      <div class="card"><div class="hd"><h3>ส่งออก / อื่น ๆ</h3></div><div class="bd"><div class="actions">${EX.join("")}</div></div></div>
      <div class="card"><div class="hd"><h3>ประวัติเวอร์ชัน</h3><span class="spacer"></span>${other ? `<a class="btn sm" href="#/compare/${enc(sop.id)}?a=${enc(other.id)}&b=${enc(v.id)}">${ic("diff")} เปรียบเทียบ</a>` : ""}</div>
        <div class="table-wrap"><table class="t"><tbody>${verRows}</tbody></table></div></div>
      <div class="card"><div class="hd"><h3>Workflow log & ความคิดเห็น</h3></div><div class="bd" style="padding-top:4px;max-height:520px;overflow:auto">
        <ul class="feed">${P.log.map(a => feedItem(a, false)).join("") || '<div class="empty">-</div>'}</ul></div></div>
    </div></div>`;
  bindRowClicks(view);
  $$("[data-lb]", view).forEach(img => img.onclick = () => lightbox(img.src));
  $$("[data-act]", view).forEach(b => b.onclick = async () => { b.disabled = true; try { await doAction(b.dataset.act, P); } catch (e) { toastErr(e); } finally { b.disabled = false; } });
  UI.refresh = async () => { try { renderVersion(view, await D.versionPayload(v.id)); } catch { } };
}
async function doAction(act, P) {
  const { sop, version: v } = P;
  const reload = async () => { renderVersion(VIEW, await D.versionPayload(v.id)); loadTasks(false); };
  const wf = async (action, comment) => { await D.action(v.id, action, comment); toast(ACTION_LABEL[action] + " เรียบร้อย", "ok"); await reload(); };
  switch (act) {
    case "submit": { const c = await askText("ส่ง SOP ให้ตรวจสอบ", "หมายเหตุถึงผู้ตรวจสอบ (ถ้ามี)", { required: false, ok: "ส่งตรวจ", okClass: "accent", extra: '<p class="muted small" style="margin-top:0">หลังส่งตรวจ จะแก้ไขเนื้อหาไม่ได้จนกว่าจะถูกส่งกลับ</p>' }); if (c !== null) await wf("submit", c); break; }
    case "start_review": await wf("start_review", ""); break;
    case "review_pass": { const c = await askText("ตรวจสอบผ่าน", "ความคิดเห็นของผู้ตรวจสอบ", { required: false, ok: "ยืนยันตรวจสอบผ่าน", okClass: "green" }); if (c !== null) await wf("review_pass", c); break; }
    case "approve": { const c = await askText("อนุมัติและประกาศใช้", "ความคิดเห็นของผู้อนุมัติ", { required: false, ok: "อนุมัติและประกาศใช้", okClass: "green", extra: `<div class="banner info">${ic("info")}<div>เมื่ออนุมัติ ${esc(v.rev)} จะกลายเป็น <b>Current Version</b> ${sop.current_version_id ? "และฉบับเดิมจะถูกเก็บเป็นประวัติ (Superseded)" : ""} และจะถูกล็อกห้ามแก้ไข</div></div>` }); if (c !== null) await wf("approve", c); break; }
    case "return": { const c = await askText("ส่งกลับเพื่อแก้ไข", "เหตุผลที่ส่งกลับ", { ok: "ส่งกลับแก้ไข", okClass: "red", placeholder: "ระบุสิ่งที่ต้องแก้ไข…" }); if (c !== null) await wf("return", c); break; }
    case "comment": { const c = await askText("แสดงความคิดเห็น", "ความคิดเห็น", { ok: "บันทึกความคิดเห็น" }); if (c !== null) await wf("comment", c); break; }
    case "obsolete": { const c = await askText("ยกเลิกใช้งาน SOP", "เหตุผลที่ยกเลิกใช้งาน", { ok: "ยกเลิกใช้งาน", okClass: "red", extra: `<div class="banner err">${ic("alert")}<div>SOP ${esc(sop.sop_number)} จะไม่ถูกแสดงเป็นฉบับใช้งานอีกต่อไป (ข้อมูลทุกเวอร์ชันยังถูกเก็บไว้)</div></div>` }); if (c !== null) await wf("obsolete", c); break; }
    case "revise": {
      const c = await askText("สร้างฉบับแก้ไข", "เหตุผล / รายละเอียดที่จะแก้ไข (Change Summary)", { required: false, ok: "สร้างฉบับแก้ไข", extra: `<p class="muted small" style="margin-top:0">ระบบจะคัดลอกเนื้อหาจาก ${esc(v.rev)} เป็นฉบับร่าง Rev. ถัดไป ฉบับปัจจุบันยังใช้งานได้ตามปกติจนกว่าฉบับใหม่จะได้รับอนุมัติ</p>` });
      if (c === null) return;
      const r = await D.revise(sop.id, c); toast("สร้างฉบับแก้ไขแล้ว", "ok"); location.hash = "#/edit/" + enc(r.version_id); break;
    }
    case "review_date": {
      const months = Number(S.settings.default_review_months) || 12;
      const r = await modal({
        title: "บันทึกผลการทบทวน SOP", ok: "บันทึก",
        body: `<p class="muted small" style="margin-top:0">ใช้เมื่อทบทวนแล้วเนื้อหายังถูกต้อง ไม่ต้องออก Rev. ใหม่ (ถ้าต้องแก้เนื้อหา ให้ใช้ "สร้างฉบับแก้ไข")</p>
          <label class="f">วันทบทวนครั้งถัดไป <span class="req">*</span></label><input class="in" type="date" id="rd" value="${addMonths(todayStr(), months)}">
          <div style="height:10px"></div><label class="f">ผลการทบทวน <span class="req">*</span></label><textarea class="in" id="rn">ทบทวนแล้ว เนื้อหายังเป็นปัจจุบัน ไม่มีการเปลี่ยนแปลง</textarea>`,
        onOk: ov => D.setReviewDate(sop.id, $("#rd", ov).value, $("#rn", ov).value),
      });
      if (r) { toast("บันทึกผลการทบทวนแล้ว", "ok"); await reload(); } break;
    }
    case "delete": {
      if (!await confirmBox(sop.current_version_id ? "ยกเลิกฉบับแก้ไข" : "ลบฉบับร่าง", sop.current_version_id ? `ยกเลิก ${esc(v.rev)} (ฉบับที่ใช้งานอยู่ไม่ได้รับผลกระทบ)?` : `ลบ ${esc(sop.sop_number)} ออกจากทะเบียน? (ยังไม่เคยประกาศใช้)`, "ยืนยัน", "red")) return;
      const r = await D.deleteDraft(v.id); toast("ดำเนินการแล้ว", "ok"); loadTasks(false);
      location.hash = r.had_current ? "#/v/" + enc(r.current_version_id) : "#/sops"; break;
    }
    case "copy": {
      const r = await modal({
        title: "คัดลอกเป็น SOP ใหม่", ok: "สร้างสำเนา",
        body: `<p class="muted small" style="margin-top:0">คัดลอกเนื้อหาทั้งหมดจาก ${esc(sop.sop_number)} ${esc(v.rev)} เป็น SOP ใหม่ (Rev.00 ฉบับร่าง)</p>
          <label class="f">แผนก</label><select class="in" id="cd">${deptOptions(D.isPriv() ? sop.department_id : S.deptId, { onlyCreatable: true })}</select><div style="height:10px"></div>
          <label class="f">SOP Number ใหม่</label><input class="in mono" id="cn"><div class="help">เว้นว่างเพื่อให้ระบบกำหนดเลขถัดไปอัตโนมัติ</div><div style="height:10px"></div>
          <label class="f">ชื่อ SOP</label><input class="in" id="ct" value="${esc(v.title + " (สำเนา)")}">`,
        onOpen: ov => { const upd = async () => { $("#cn", ov).placeholder = await D.nextNumber($("#cd", ov).value); }; $("#cd", ov).onchange = upd; upd(); },
        onOk: ov => D.copySop(P, { department_id: $("#cd", ov).value, sop_number: $("#cn", ov).value, title: $("#ct", ov).value.trim() }),
      });
      if (r) { toast("สร้างสำเนาแล้ว: " + esc(r.sop_number), "ok"); location.hash = "#/edit/" + enc(r.version_id); } break;
    }
    case "docx": {
      toast("กำลังสร้างไฟล์ Word…", "", 2500);
      const m = await docModel(P, S.settings, STATUS, true);
      saveBlob(await buildDocx(m), safeName(`${m.sop_number}_${m.revLabel}_${m.title}`) + ".docx"); break;
    }
  }
}

/* ================= Editor ================= */
async function pageNew(view) {
  if (!D.canCreateAny()) throw new Error("คุณไม่มีสิทธิ์สร้าง SOP — ติดต่อผู้ดูแลระบบให้กำหนดสิทธิ์ SOP");
  const deptId = D.isPriv() ? (S.depts.find(d => d.active)?.id) : S.deptId;
  renderEditor(view, {
    sop: { id: null, sop_number: "", department_id: deptId, current_version_id: null },
    version: { id: null, revision: 0, rev: "Rev.00", status: "draft", title: "", row_ver: null, prepared_by: S.uid, owner_id: S.uid, reviewer_id: null, approver_id: null, effective_date: "", review_date: "", change_summary: "จัดทำครั้งแรก (Initial issue)", content: { objective: "", scope: "", responsibility: "", equipment: "", safety: "", related_docs: "", kpi: "", keywords: "", steps: [{ id: crypto.randomUUID(), title: "", detail: "", images: [] }], attachments: [] } },
    log: [],
  }, true);
}
async function pageEdit(view, vid) {
  const P = await D.versionPayload(vid);
  if (!P.permissions.canEdit) { history.replaceState(null, "", "#/v/" + enc(vid)); lastHash = location.hash; return renderVersion(view, P); }
  renderEditor(view, P, false);
}
function renderEditor(view, P, isNew) {
  const sop = P.sop, v = P.version;
  const E = { sop_number: sop.sop_number, department_id: sop.department_id, title: v.title, owner_id: v.owner_id, reviewer_id: v.reviewer_id, approver_id: v.approver_id,
    effective_date: v.effective_date || "", review_date: v.review_date || "", change_summary: v.change_summary || "", row_ver: v.row_ver, content: JSON.parse(JSON.stringify(v.content)) };
  const prep = v.prepared_by;
  const roleName = r => D.SOP_ROLES[r] || r;
  const memberOpts = (sel, roles, exclude, emptyLabel) => `<option value="">${emptyLabel}</option>` + S.members.filter(m => m.active !== false && (!roles || roles.includes(m.sopRole)) && m.id !== exclude)
    .map(m => `<option value="${esc(m.id)}" ${sel === m.id ? "selected" : ""}>${esc(m.name)} — ${esc(roleName(m.sopRole))}${m.deptId ? " (" + esc(D.deptById(m.deptId)?.code || "") + ")" : ""}</option>`).join("")
    + (sel && !S.members.some(m => m.id === sel) ? `<option value="${esc(sel)}" selected>${esc(sel === S.uid ? S.name : "(ผู้ใช้เดิม)")}</option>` : "");
  const ta = (key, label, rows = 3, ph = "", req = false) => `<div><label class="f">${label}${req ? ' <span class="req">*</span>' : ""}</label><textarea class="in" data-c="${key}" rows="${rows}" placeholder="${esc(ph)}">${esc(E.content[key])}</textarea></div>`;
  const root = document.createElement("div"); view.innerHTML = ""; view.appendChild(root);
  const lastReturn = v.status === "revision_required" ? (P.log || []).find(l => l.version_id === v.id && l.action === "return") : null;
  root.innerHTML = `<div class="page-head"><div class="grow"><div class="crumb"><a href="#/sops">ทะเบียน SOP</a> / ${isNew ? "สร้างใหม่" : `<a href="#/v/${enc(v.id)}">${esc(sop.sop_number)}</a> / แก้ไข`}</div>
      <h1>${isNew ? "สร้าง SOP ใหม่" : `แก้ไข ${esc(sop.sop_number)} ${esc(v.rev)}`}</h1></div></div>
    <div class="ed-bar"><span id="dirtyMark" class="small muted">ยังไม่มีการแก้ไข</span><span class="spacer"></span>
      ${isNew ? "" : `<a class="btn" href="#/v/${enc(v.id)}">ปิด</a>`}<button class="btn primary" id="save">${ic("check")} บันทึก</button><button class="btn accent" id="saveSubmit">${ic("send")} บันทึกและส่งตรวจ</button></div>
    <div id="edBanner"></div>
    ${lastReturn ? `<div class="banner err">${ic("back")}<div><b>ถูกส่งกลับแก้ไขโดย ${esc(lastReturn.user_name)}</b><div style="white-space:pre-wrap">เหตุผล: ${esc(lastReturn.comment)}</div></div></div>` : ""}
    <div class="card ed-sec"><div class="hd"><h3>ข้อมูลเอกสาร</h3></div><div class="bd grid g3">
      <div><label class="f">Department <span class="req">*</span></label><select class="in" data-f="department_id" ${isNew ? "" : "disabled"}>${deptOptions(E.department_id, { onlyCreatable: true })}</select></div>
      <div><label class="f">SOP Number <span class="req">*</span></label><input class="in mono" data-f="sop_number" value="${esc(E.sop_number)}" ${isNew ? "" : "readonly"} placeholder="กำหนดอัตโนมัติ"><div class="help">${isNew ? "เว้นว่างเพื่อให้ระบบออกเลขถัดไป" : "กำหนดตอนสร้าง เปลี่ยนภายหลังไม่ได้"}</div></div>
      <div><label class="f">Revision</label><input class="in" value="${esc(v.rev)}" readonly></div>
      <div style="grid-column:1/-1"><label class="f">SOP Title <span class="req">*</span></label><input class="in" data-f="title" value="${esc(E.title)}" placeholder="เช่น ขั้นตอนการหยิบสินค้า (Picking) ตามใบสั่งจ่าย"></div>
      <div><label class="f">ผู้รับผิดชอบ (Owner) <span class="req">*</span></label><select class="in" data-f="owner_id">${memberOpts(E.owner_id, null, null, "— เลือก —")}</select></div>
      <div><label class="f">ผู้ตรวจสอบ (Reviewer)</label><select class="in" data-f="reviewer_id">${memberOpts(E.reviewer_id, ["dept_head", "manager", "admin"], prep, "— หัวหน้าแผนกคนใดก็ได้ —")}</select></div>
      <div><label class="f">ผู้อนุมัติ (Approver)</label><select class="in" data-f="approver_id">${memberOpts(E.approver_id, ["manager", "admin"], prep, "— Manager คนใดก็ได้ —")}</select></div>
      <div><label class="f">Effective Date (วันเริ่มใช้) <span class="req">*</span></label><input class="in" type="date" data-f="effective_date" value="${esc(E.effective_date)}"></div>
      <div><label class="f">Review Date (วันทบทวน) <span class="req">*</span></label><div class="row" style="flex-wrap:nowrap"><input class="in" type="date" data-f="review_date" value="${esc(E.review_date)}"><button class="btn sm" type="button" id="plus1y">+${S.settings.default_review_months} ด.</button></div></div>
      <div><label class="f">Keywords (คำสำคัญสำหรับค้นหา)</label><input class="in" data-c="keywords" value="${esc(E.content.keywords)}" placeholder="คั่นด้วยจุลภาค เช่น picking, RF scanner"></div>
      <div style="grid-column:1/-1"><label class="f">รายละเอียดการแก้ไข (Change Summary)${v.revision > 0 ? ' <span class="req">*</span>' : ""}</label><textarea class="in" data-f="change_summary" rows="2" placeholder="ระบุสิ่งที่เปลี่ยนแปลงจากฉบับก่อน">${esc(E.change_summary)}</textarea></div>
    </div></div>
    <div class="card ed-sec"><div class="hd"><h3>รายละเอียด SOP</h3></div><div class="bd grid g2">
      ${ta("objective", "Objective (วัตถุประสงค์)", 3, "", true)}${ta("scope", "Scope (ขอบเขต)", 3, "", true)}
      ${ta("responsibility", "Responsibility (ความรับผิดชอบ)", 4, "เช่น\nหัวหน้าแผนก: ...\nพนักงาน: ...", true)}${ta("equipment", "Equipment / Tools (อุปกรณ์/เครื่องมือ)", 4, "เช่น RF Scanner, รถลากพาเลท")}
      ${ta("safety", "Safety Requirements (ความปลอดภัย)", 4, "เช่น สวมรองเท้าเซฟตี้ เสื้อสะท้อนแสง")}${ta("kpi", "KPI / Standard (ตัวชี้วัด/มาตรฐาน)", 4, "เช่น Picking Accuracy ≥ 99.8%")}
    </div></div>
    <div class="card ed-sec"><div class="hd"><h3>Work Instructions (ขั้นตอนการปฏิบัติงาน) <span style="color:var(--red)">*</span></h3><span class="spacer"></span><span class="small muted">ลากที่ ⋮⋮ เพื่อจัดลำดับ</span></div><div class="bd">
      <div class="steps-ed" id="steps"></div><button class="btn" type="button" id="addStep">${ic("plus")} เพิ่มขั้นตอน</button></div></div>
    <div class="card ed-sec"><div class="hd"><h3>Related Documents & ไฟล์แนบ</h3></div><div class="bd grid">
      ${ta("related_docs", "เอกสารที่เกี่ยวข้อง (Related Documents)", 3, "เช่น WI-OB-001 คู่มือการใช้ RF Scanner, FM-OB-003 แบบฟอร์ม…")}
      <div><label class="f">ไฟล์แนบ (PDF, Word, Excel, PowerPoint, รูปภาพ — ไม่เกิน 20 MB/ไฟล์)</label><div id="atts"></div>
        <div class="drop" id="attDrop">${ic("clip")} คลิกหรือลากไฟล์มาวางที่นี่</div><input type="file" id="attIn" multiple class="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.xlsm,.ppt,.pptx,.csv,.txt,.png,.jpg,.jpeg,.gif,.webp,.zip"></div>
    </div></div>
    <div class="ed-bar" style="position:static;border:0;border-top:1px solid var(--line)"><span class="spacer"></span><button class="btn primary" id="save2">${ic("check")} บันทึก</button></div>`;
  const setDirty = (d = true) => { UI.dirty = d; $("#dirtyMark", root).innerHTML = d ? '<b style="color:var(--amber)">● มีการแก้ไขที่ยังไม่บันทึก</b>' : "บันทึกแล้ว ✓"; };
  root.addEventListener("input", e => {
    const t = e.target;
    if (t.dataset.f) { E[t.dataset.f] = t.value; setDirty(); }
    else if (t.dataset.c) { E.content[t.dataset.c] = t.value; setDirty(); }
    else if (t.dataset.st) { const [i, k] = t.dataset.st.split(":"); E.content.steps[i][k] = t.value; setDirty(); }
  });
  root.addEventListener("change", e => { if (e.target.dataset.f) { E[e.target.dataset.f] = e.target.value; setDirty(); } });
  if (isNew) {
    const numIn = $("[data-f=sop_number]", root);
    const updNum = async () => { numIn.placeholder = await D.nextNumber(E.department_id).catch(() => ""); };
    $("[data-f=department_id]", root).addEventListener("change", updNum); updNum();
  }
  $("#plus1y", root).onclick = () => { const v2 = addMonths(E.effective_date || todayStr(), Number(S.settings.default_review_months) || 12); E.review_date = v2; $("[data-f=review_date]", root).value = v2; setDirty(); };

  /* ----- steps ----- */
  const stepsEl = $("#steps", root); let dragFrom = null;
  const newStep = () => ({ id: crypto.randomUUID(), title: "", detail: "", images: [] });
  function renderSteps() {
    const st = E.content.steps;
    stepsEl.innerHTML = st.map((s, i) => `<div class="st-card" data-i="${i}">
      <div class="st-head"><span class="handle" draggable="true" data-drag="${i}" title="ลากเพื่อย้าย">${ic("grip")}</span><span class="num">6.${i + 1}</span>
        <input class="in" data-st="${i}:title" value="${esc(s.title)}" placeholder="หัวข้อขั้นตอน เช่น รับใบ Pick List จากระบบ WMS">
        <button class="icon-btn" type="button" data-mv="${i}:-1" title="เลื่อนขึ้น" ${i === 0 ? "disabled" : ""}>${ic("up")}</button>
        <button class="icon-btn" type="button" data-mv="${i}:1" title="เลื่อนลง" ${i === st.length - 1 ? "disabled" : ""}>${ic("down")}</button>
        <button class="icon-btn" type="button" data-ins="${i}" title="แทรกขั้นตอนด้านล่าง">${ic("plus")}</button>
        <button class="icon-btn" type="button" data-del="${i}" title="ลบขั้นตอน" style="color:var(--red)">${ic("trash")}</button></div>
      <div class="st-body"><textarea class="in" data-st="${i}:detail" rows="3" placeholder="รายละเอียดวิธีปฏิบัติ จุดตรวจสอบ ข้อควรระวัง…">${esc(s.detail)}</textarea>
        <div class="thumbs">${s.images.map((im, j) => `<div class="thumb"><img src="${esc(im.url)}" alt="" data-lb><button type="button" data-rmimg="${i}:${j}" title="ลบรูป">×</button></div>`).join("")}
          <label class="add-img">${ic("img")}<span>เพิ่มรูปภาพ</span><input type="file" accept="image/*" multiple class="hidden" data-addimg="${i}"></label></div></div></div>`).join("")
      || '<div class="empty">ยังไม่มีขั้นตอน — กด "เพิ่มขั้นตอน"</div>';
    $$("[data-lb]", stepsEl).forEach(img => img.onclick = () => lightbox(img.src));
  }
  stepsEl.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    const st = E.content.steps;
    if (b.dataset.mv) { const [i, d] = b.dataset.mv.split(":").map(Number); const j = i + d; if (j < 0 || j >= st.length) return; [st[i], st[j]] = [st[j], st[i]]; }
    else if (b.dataset.ins) st.splice(Number(b.dataset.ins) + 1, 0, newStep());
    else if (b.dataset.del) { const i = Number(b.dataset.del); if ((st[i].title || st[i].detail || st[i].images.length) && !confirm(`ลบขั้นตอน 6.${i + 1}?`)) return; st.splice(i, 1); }
    else if (b.dataset.rmimg) { const [i, j] = b.dataset.rmimg.split(":").map(Number); st[i].images.splice(j, 1); }
    else return;
    setDirty(); renderSteps();
  });
  stepsEl.addEventListener("change", async e => {
    const inp = e.target; if (!inp.dataset.addimg) return;
    const i = Number(inp.dataset.addimg);
    for (const f of inp.files) {
      try { toast("กำลังอัปโหลด " + esc(f.name) + "…", "", 2000); const r = await D.uploadFile(f, true); E.content.steps[i].images.push(r); setDirty(); renderSteps(); }
      catch (err) { toastErr(err); }
    }
  });
  stepsEl.addEventListener("dragstart", e => { const h = e.target.closest("[data-drag]"); if (!h) return; dragFrom = Number(h.dataset.drag); const card = h.closest(".st-card"); card.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(dragFrom)); try { e.dataTransfer.setDragImage(card, 20, 20); } catch { } });
  stepsEl.addEventListener("dragover", e => { if (dragFrom == null) return; const c = e.target.closest(".st-card"); if (!c) return; e.preventDefault(); $$(".drag-over", stepsEl).forEach(x => x.classList.remove("drag-over")); c.classList.add("drag-over"); });
  stepsEl.addEventListener("drop", e => { if (dragFrom == null) return; const c = e.target.closest(".st-card"); if (!c) return; e.preventDefault(); const to = Number(c.dataset.i); const st = E.content.steps; const [m] = st.splice(dragFrom, 1); st.splice(to, 0, m); dragFrom = null; setDirty(); renderSteps(); });
  stepsEl.addEventListener("dragend", () => { dragFrom = null; $$(".dragging,.drag-over", stepsEl).forEach(x => x.classList.remove("dragging", "drag-over")); });
  $("#addStep", root).onclick = () => { E.content.steps.push(newStep()); setDirty(); renderSteps(); const last = $$(".st-card", stepsEl).pop(); last && last.querySelector("input").focus(); };
  renderSteps();

  /* ----- attachments ----- */
  function renderAtts() {
    $("#atts", root).innerHTML = E.content.attachments.map((f, i) => `<div class="att" style="margin:0 0 6px">${ic(fileIcon(f.name))}<span class="nm">${esc(f.name)}</span><span class="small muted">${f.size ? fmtSize(f.size) : ""}</span><a class="btn sm" href="${esc(f.url)}" target="_blank" rel="noopener">เปิด</a><button class="icon-btn" type="button" data-rmatt="${i}" title="นำออก" style="color:var(--red)">${ic("x")}</button></div>`).join("");
  }
  $("#atts", root).addEventListener("click", e => { const b = e.target.closest("[data-rmatt]"); if (!b) return; E.content.attachments.splice(Number(b.dataset.rmatt), 1); setDirty(); renderAtts(); });
  const addAtts = async list => { for (const f of list) { try { toast("กำลังอัปโหลด " + esc(f.name) + "…", "", 2000); const r = await D.uploadFile(f, false); E.content.attachments.push(r); setDirty(); renderAtts(); } catch (err) { toastErr(err); } } };
  const drop = $("#attDrop", root);
  drop.onclick = () => $("#attIn", root).click();
  $("#attIn", root).onchange = e => { addAtts([...e.target.files]); e.target.value = ""; };
  drop.ondragover = e => { e.preventDefault(); drop.classList.add("over"); };
  drop.ondragleave = () => drop.classList.remove("over");
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove("over"); addAtts([...e.dataTransfer.files]); };
  renderAtts();

  /* ----- save ----- */
  let saving = false;
  async function save(andSubmit) {
    if (saving) return; saving = true;
    $$("#save,#save2,#saveSubmit", root).forEach(b => b.disabled = true);
    try {
      if (!E.title.trim()) throw new Error("กรุณาระบุ SOP Title");
      const body = { ...E, content: { ...E.content, steps: E.content.steps.filter(s => s.title.trim() || s.detail.trim() || s.images.length) } };
      let vid = v.id;
      if (isNew) { const r = await D.createSop(body); vid = r.version_id; UI.dirty = false; toast(`สร้าง ${esc(r.sop_number)} แล้ว`, "ok"); }
      else { const r = await D.saveVersion(v.id, body); E.row_ver = r.row_ver; setDirty(false); toast("บันทึกแล้ว", "ok", 2000); }
      if (andSubmit) {
        const c = await askText("ส่ง SOP ให้ตรวจสอบ", "หมายเหตุถึงผู้ตรวจสอบ (ถ้ามี)", { required: false, ok: "ส่งตรวจ", okClass: "accent" });
        if (c !== null) {
          try { await D.action(vid, "submit", c); toast("ส่งตรวจแล้ว", "ok"); UI.dirty = false; location.hash = "#/v/" + enc(vid); return; }
          catch (err) { toastErr(err); }
        }
      }
      if (isNew) location.hash = "#/edit/" + enc(vid);
    } catch (e) {
      toastErr(e);
      if (/ผู้ใช้อื่น/.test(e.message) && !isNew) $("#edBanner", root).innerHTML = `<div class="banner err">${ic("alert")}<div>${esc(e.message)} <button class="btn sm" id="reloadEd">โหลดฉบับล่าสุด</button></div></div>`;
      const rb = $("#reloadEd", root); if (rb) rb.onclick = () => { UI.dirty = false; route(); };
    } finally { saving = false; $$("#save,#save2,#saveSubmit", root).forEach(b => b.disabled = false); }
  }
  $("#save", root).onclick = () => save(false);
  $("#save2", root).onclick = () => save(false);
  $("#saveSubmit", root).onclick = () => save(true);
  const keyH = e => { if ((e.ctrlKey || e.metaKey) && e.key === "s") { if (!root.isConnected) { document.removeEventListener("keydown", keyH); return; } e.preventDefault(); save(false); } };
  document.addEventListener("keydown", keyH);
  UI.refresh = () => {
    if (isNew) return;
    D.versionPayload(v.id).then(np => {
      if (np.version.row_ver !== E.row_ver) $("#edBanner", root).innerHTML = `<div class="banner warn">${ic("alert")}<div>มีผู้ใช้อื่นบันทึก/เปลี่ยนสถานะเอกสารนี้ระหว่างที่คุณแก้ไข — ถ้าบันทึกอาจชนกัน <button class="btn sm" id="reloadEd2">โหลดฉบับล่าสุด</button></div></div>`;
      const rb = $("#reloadEd2", root); if (rb) rb.onclick = () => { UI.dirty = false; route(); };
    }).catch(() => { });
  };
}

/* ================= Compare ================= */
async function pageCompare(view, sopId) {
  const q = qs();
  const P = await D.payloadForSop(sopId);
  const vers = P.versions;
  if (vers.length < 2) { view.innerHTML = '<div class="empty">มีเพียงเวอร์ชันเดียว</div>'; return; }
  const a = q.a || vers[1].id, b = q.b || vers[0].id;
  const opt = sel => vers.map(x => `<option value="${esc(x.id)}" ${sel === x.id ? "selected" : ""}>${esc(x.rev)} — ${esc(stLabel(x.status))}</option>`).join("");
  view.innerHTML = `<div class="page-head"><div class="grow"><div class="crumb"><a href="#/sops">ทะเบียน SOP</a> / <a href="#/v/${enc(P.version.id)}">${esc(P.sop.sop_number)}</a> / เปรียบเทียบ</div><h1>เปรียบเทียบเวอร์ชัน ${esc(P.sop.sop_number)}</h1></div></div>
    <div class="filters"><label class="fi"><span>ฉบับเดิม (A)</span><select class="in" id="ca">${opt(a)}</select></label><label class="fi"><span>ฉบับใหม่ (B)</span><select class="in" id="cb">${opt(b)}</select></label>
      <label class="row small" style="align-self:center"><input type="checkbox" id="conly" checked> แสดงเฉพาะหัวข้อที่เปลี่ยน</label>
      <span class="legend" style="align-self:center"><span><del>ข้อความที่ถูกลบ</del></span><span><ins>ข้อความที่เพิ่ม</ins></span></span></div><div id="cbody"><div class="empty">กำลังโหลด…</div></div>`;
  const run = async () => {
    const [A, B] = await Promise.all([D.versionPayload($("#ca", view).value), D.versionPayload($("#cb", view).value)]);
    setQs({ a: $("#ca", view).value, b: $("#cb", view).value });
    const va = A.version, vb = B.version, ca = va.content, cb = vb.content;
    const fields = [["SOP Title", va.title, vb.title], ["Effective Date", fmtD(va.effective_date), fmtD(vb.effective_date)], ["Review Date", fmtD(va.review_date), fmtD(vb.review_date)],
      ["ผู้รับผิดชอบ", A.people.owner?.display_name || "-", B.people.owner?.display_name || "-"], ["Change Summary", va.change_summary, vb.change_summary],
      ["Objective", ca.objective, cb.objective], ["Scope", ca.scope, cb.scope], ["Responsibility", ca.responsibility, cb.responsibility], ["Equipment / Tools", ca.equipment, cb.equipment], ["Safety Requirements", ca.safety, cb.safety]];
    const stepTxt = s => s ? `${s.title}\n${s.detail}${s.images.length ? `\n[รูปภาพ ${s.images.length} รูป]` : ""}` : "";
    const ids = []; [...ca.steps, ...cb.steps].forEach(s => { if (!ids.includes(s.id)) ids.push(s.id); });
    const stepRows = ids.map(id => {
      const sa = ca.steps.find(s => s.id === id), sb = cb.steps.find(s => s.id === id);
      const ia = ca.steps.indexOf(sa) + 1, ib = cb.steps.indexOf(sb) + 1;
      return [sa && sb ? (ia === ib ? `ขั้นตอน 6.${ib}` : `ขั้นตอน 6.${ia} → 6.${ib} (ย้ายลำดับ)`) : sb ? `ขั้นตอน 6.${ib} (เพิ่มใหม่)` : `ขั้นตอน 6.${ia} (ถูกลบ)`, stepTxt(sa), stepTxt(sb), sa && sb && ia !== ib];
    });
    const rest = [["Related Documents", ca.related_docs, cb.related_docs], ["ไฟล์แนบ", ca.attachments.map(f => f.name).join("\n"), cb.attachments.map(f => f.name).join("\n")], ["KPI / Standard", ca.kpi, cb.kpi], ["Keywords", ca.keywords, cb.keywords]];
    const only = $("#conly", view).checked;
    const block = ([lbl, x, y, moved]) => {
      const same = String(x || "") === String(y || "") && !moved;
      if (same && only) return "";
      return `<div class="diff-f ${same ? "chg-same" : ""}"><div class="h">${esc(lbl)}${same ? ' <span class="muted">— ไม่เปลี่ยนแปลง</span>' : ""}</div><div class="b">${same ? esc(x || "-") : diffHtml(x, y) || "-"}</div></div>`;
    };
    const html = [...fields, ...stepRows, ...rest].map(block).join("");
    $("#cbody", view).innerHTML = `<div class="card"><div class="hd"><h3>${esc(va.rev)} ${stBadge(va.status)} → ${esc(vb.rev)} ${stBadge(vb.status)}</h3></div><div class="bd">${html || '<div class="empty">ไม่มีความแตกต่าง</div>'}</div></div>`;
  };
  $("#ca", view).onchange = $("#cb", view).onchange = $("#conly", view).onchange = () => run().catch(toastErr);
  await run();
}

/* ================= Admin: departments ================= */
async function pageDepts(view) {
  if (S.role !== "admin") throw new Error("เฉพาะผู้ดูแลระบบ");
  const load = async () => {
    await D.loadMeta();
    const sops = await D.listSops();
    const cnt = id => sops.filter(s => s.department_id === id).length, ucnt = id => S.members.filter(m => m.deptId === id).length;
    view.innerHTML = pageHead("จัดการแผนก (SOP)", "เพิ่ม แก้ไข ปิดใช้งาน หรือลบแผนก — ไม่ต้องแก้ไขโค้ดโปรแกรม", `<button class="btn accent" id="addD">${ic("plus")} เพิ่มแผนก</button>`)
      + `<div class="card"><div class="table-wrap"><table class="t"><thead><tr><th>ลำดับ</th><th>รหัส</th><th>ชื่อแผนก</th><th>คำอธิบาย</th><th>SOP</th><th>สมาชิก</th><th>สถานะ</th><th></th></tr></thead><tbody>
      ${S.depts.map(d => `<tr><td>${d.sort ?? ""}</td><td><span class="tag">${esc(d.code)}</span></td><td><b>${esc(d.name)}</b></td><td class="small">${esc(d.description || "")}</td><td>${cnt(d.id)}</td><td>${ucnt(d.id)}</td>
        <td>${d.active ? '<span class="badge-st st-published">ใช้งาน</span>' : '<span class="badge-st st-obsolete">ปิดใช้งาน</span>'}</td>
        <td class="nowrap"><button class="btn sm" data-ed="${esc(d.id)}">${ic("edit")} แก้ไข</button> <button class="btn sm" data-tg="${esc(d.id)}">${d.active ? "ปิดใช้งาน" : "เปิดใช้งาน"}</button> <button class="btn sm danger" data-rm="${esc(d.id)}" title="ลบ">${ic("trash")}</button></td></tr>`).join("")}</tbody></table></div></div>`;
    $("#addD", view).onclick = () => deptForm();
    $$("[data-ed]", view).forEach(b => b.onclick = () => deptForm(D.deptById(b.dataset.ed)));
    $$("[data-tg]", view).forEach(b => b.onclick = async () => { const d = D.deptById(b.dataset.tg); try { await D.setDepartmentActive(d.id, !d.active); toast("อัปเดตแล้ว", "ok"); load(); } catch (e) { toastErr(e); } });
    $$("[data-rm]", view).forEach(b => b.onclick = async () => { const d = D.deptById(b.dataset.rm); if (!await confirmBox("ลบแผนก", `ลบแผนก ${esc(d.code)} – ${esc(d.name)}?`, "ลบ", "red")) return; try { await D.deleteDepartment(d.id); toast("ลบแล้ว", "ok"); load(); } catch (e) { toastErr(e); } });
  };
  const deptForm = d => modal({
    title: d ? "แก้ไขแผนก" : "เพิ่มแผนก", ok: "บันทึก",
    body: `<div class="grid g2"><div><label class="f">รหัสแผนก <span class="req">*</span></label><input class="in mono" id="dc" value="${esc(d?.code || "")}" placeholder="เช่น QA"><div class="help">ใช้ขึ้นต้นเลข SOP เช่น QA-SOP-001</div></div>
      <div><label class="f">ลำดับการแสดง</label><input class="in" type="number" id="ds" value="${d?.sort ?? ""}"></div></div><div style="height:10px"></div>
      <label class="f">ชื่อแผนก <span class="req">*</span></label><input class="in" id="dn" value="${esc(d?.name || "")}"><div style="height:10px"></div>
      <label class="f">คำอธิบาย</label><textarea class="in" id="dd" rows="2">${esc(d?.description || "")}</textarea>`,
    onOk: async ov => { await D.saveDepartment(d?.id || null, { code: $("#dc", ov).value, name: $("#dn", ov).value, description: $("#dd", ov).value, sort: $("#ds", ov).value }); toast("บันทึกแล้ว", "ok"); load(); },
  });
  UI.refresh = () => load().catch(() => { });
  await load();
}

/* ================= Admin: SOP members ================= */
async function pageMembers(view) {
  if (S.role !== "admin") throw new Error("เฉพาะผู้ดูแลระบบ");
  const ERP_ROLE = { sales: "ฝ่ายขาย", warehouse: "คลังสินค้า", accounting: "บัญชี", admin: "แอดมิน", manager: "ผู้บริหาร" };
  const load = async () => {
    await D.loadMeta();
    const users = await D.listErpUsers();
    const mem = id => D.memberById(id);
    const defRole = u => u.role === "admin" ? "admin" : u.role === "manager" ? "manager" : "viewer";
    view.innerHTML = pageHead("สิทธิ์ SOP", "กำหนดบทบาทในระบบ SOP ให้ผู้ใช้ ERP แต่ละคน (บัญชีผู้ใช้และรหัสผ่านจัดการที่หน้า \"จัดการผู้ใช้งาน & สิทธิ์\" ของ ERP)", `<button class="btn" id="syncAll">${ic("users")} เพิ่มผู้ใช้ที่ยังไม่มีสิทธิ์ SOP ทั้งหมด</button>`)
      + `<div class="card" style="margin-bottom:16px"><div class="bd small">
        <b>Warehouse Operations Manager</b> อนุมัติ/ยกเลิก SOP ทุกแผนก · <b>หัวหน้าแผนก</b> จัดทำและตรวจสอบ SOP ของแผนกตน · <b>ผู้จัดทำ</b> สร้าง/แก้ไข SOP ของแผนกตน ·
        <b>ผู้อ่าน</b> ดูเฉพาะ SOP ที่ประกาศใช้แล้ว · แอดมิน ERP เป็นผู้ดูแลระบบ SOP อัตโนมัติ. <span class="muted">ผู้ที่ยังไม่ได้กำหนด: ผู้บริหาร ERP = Manager, คนอื่น = ผู้อ่าน · ทุกบทบาทอนุมัติ SOP ที่ตนจัดทำเองไม่ได้</span></div></div>
      <div class="card"><div class="table-wrap"><table class="t"><thead><tr><th>ชื่อ</th><th>อีเมล</th><th>บทบาท ERP</th><th>บทบาท SOP</th><th>แผนก SOP</th><th>สถานะ</th><th></th></tr></thead><tbody>
      ${users.map(u => { const m = mem(u.id); const role = u.role === "admin" ? "admin" : (m?.sopRole || defRole(u));
        return `<tr><td><b>${esc(u.name || "-")}</b>${m ? "" : '<div class="small muted">ยังไม่ได้กำหนด (ใช้ค่าเริ่มต้น)</div>'}</td><td class="small">${esc(u.email || "")}</td><td>${esc(ERP_ROLE[u.role] || u.role || "")}</td>
          <td>${esc(D.SOP_ROLES[role])}</td><td>${m?.deptId ? `<span class="tag">${esc(D.deptById(m.deptId)?.code || m.deptId)}</span>` : "-"}</td>
          <td>${u.active === false ? '<span class="badge-st st-obsolete">ปิดใน ERP</span>' : m && m.active === false ? '<span class="badge-st st-obsolete">ปิดสิทธิ์ SOP</span>' : '<span class="badge-st st-published">ใช้งาน</span>'}</td>
          <td><button class="btn sm" data-ed="${esc(u.id)}">${ic("edit")} กำหนดสิทธิ์</button></td></tr>`; }).join("") || '<tr><td colspan="7" class="empty">ไม่พบผู้ใช้</td></tr>'}</tbody></table></div></div>`;
    $("#syncAll", view).onclick = async () => {
      try {
        let n = 0;
        for (const u of users) if (!mem(u.id) && u.active !== false) { await D.saveMember(u.id, { name: u.name, email: u.email, position: u.position || u.department || "", sopRole: defRole(u), erpRole: u.role, deptId: "", active: true }); n++; }
        toast(`เพิ่มแล้ว ${n} คน — ปรับบทบาท/แผนกรายคนได้ด้วยปุ่ม "กำหนดสิทธิ์"`, "ok"); load();
      } catch (e) { toastErr(e); }
    };
    $$("[data-ed]", view).forEach(b => b.onclick = () => memberForm(users.find(u => u.id === b.dataset.ed)));
  };
  const memberForm = u => {
    const m = D.memberById(u.id) || {};
    const roles = Object.entries(D.SOP_ROLES).filter(([k]) => k !== "admin" || u.role === "admin");
    return modal({
      title: "สิทธิ์ SOP: " + esc(u.name || u.email || ""), ok: "บันทึก",
      body: `<div class="grid g2">
        <div><label class="f">ชื่อที่แสดงในเอกสาร</label><input class="in" id="mn" value="${esc(m.name || u.name || "")}"></div>
        <div><label class="f">ตำแหน่ง (แสดงในตารางลงนาม)</label><input class="in" id="mp" value="${esc(m.position || "")}" placeholder="เช่น Outbound Supervisor"></div>
        <div><label class="f">บทบาท SOP <span class="req">*</span></label><select class="in" id="mr">${roles.map(([k, l]) => `<option value="${k}" ${(m.sopRole || (u.role === "admin" ? "admin" : u.role === "manager" ? "manager" : "viewer")) === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
        <div><label class="f">แผนก SOP</label><select class="in" id="md"><option value="">— ไม่สังกัดแผนก —</option>${deptOptions(m.deptId || "")}</select><div class="help">จำเป็นสำหรับ ผู้จัดทำ / หัวหน้าแผนก</div></div>
        <div><label class="f">สถานะสิทธิ์ SOP</label><select class="in" id="ma"><option value="1" ${m.active !== false ? "selected" : ""}>ใช้งาน</option><option value="0" ${m.active === false ? "selected" : ""}>ปิด (เห็นเหมือนผู้อ่าน)</option></select></div></div>`,
      onOk: async ov => {
        await D.saveMember(u.id, { name: $("#mn", ov).value, email: u.email, position: $("#mp", ov).value, sopRole: $("#mr", ov).value, deptId: $("#md", ov).value, erpRole: u.role, active: $("#ma", ov).value === "1" });
        toast("บันทึกแล้ว — มีผลเมื่อผู้ใช้นั้นโหลดหน้าใหม่", "ok"); load();
      },
    });
  };
  await load();
}

/* ================= Admin: settings ================= */
async function pageSettings(view) {
  if (S.role !== "admin") throw new Error("เฉพาะผู้ดูแลระบบ");
  await D.loadMeta();
  const st = { ...S.settings };
  view.innerHTML = pageHead("ตั้งค่า SOP", "ข้อมูลบนหัวกระดาษเอกสาร SOP และค่าการแจ้งเตือน") + `
    <div class="card" style="max-width:820px"><div class="bd grid g2">
      <div><label class="f">ชื่อบริษัท (ไทย)</label><input class="in" id="s1" value="${esc(st.company_name)}"></div>
      <div><label class="f">ชื่อบริษัท (อังกฤษ)</label><input class="in" id="s2" value="${esc(st.company_name_en)}"></div>
      <div><label class="f">โลโก้ (PNG/JPG)</label><div class="row"><img id="lg" src="${esc(st.logo_url || "")}" alt="" style="height:52px;max-width:140px;object-fit:contain;border:1px solid var(--line);border-radius:8px;padding:4px;background:#fff">
        <label class="btn sm">${ic("img")} เลือกไฟล์<input type="file" accept="image/png,image/jpeg" class="hidden" id="lgIn"></label><button class="btn sm" id="lgRm" type="button">ลบโลโก้</button></div></div>
      <div><label class="f">ฟอนต์ในไฟล์ Word</label><select class="in" id="s6">${["Tahoma", "TH Sarabun New", "TH SarabunPSK", "Leelawadee UI", "Angsana New", "Cordia New"].map(f => `<option ${st.doc_font === f ? "selected" : ""}>${f}</option>`).join("")}</select><div class="help">ฟอนต์ต้องติดตั้งในเครื่องที่เปิดไฟล์</div></div>
      <div><label class="f">แจ้งเตือนก่อนถึงวันทบทวน (วัน)</label><input class="in" type="number" min="1" id="s4" value="${esc(st.review_warn_days)}"></div>
      <div><label class="f">รอบทบทวนเริ่มต้น (เดือน)</label><input class="in" type="number" min="1" id="s5" value="${esc(st.default_review_months)}"></div>
      <div style="grid-column:1/-1"><button class="btn primary" id="sv">${ic("check")} บันทึกการตั้งค่า</button></div></div></div>`;
  $("#lgIn", view).onchange = async e => { const f = e.target.files[0]; if (!f) return; try { const r = await D.uploadFile(f, true); st.logo_url = r.url; $("#lg", view).src = r.url; toast('อัปโหลดโลโก้แล้ว กด "บันทึก" เพื่อใช้งาน', "ok"); } catch (err) { toastErr(err); } };
  $("#lgRm", view).onclick = () => { st.logo_url = ""; $("#lg", view).removeAttribute("src"); };
  $("#sv", view).onclick = async () => {
    try { await D.saveSettings({ company_name: $("#s1", view).value, company_name_en: $("#s2", view).value, logo_url: st.logo_url, doc_font: $("#s6", view).value, review_warn_days: $("#s4", view).value, default_review_months: $("#s5", view).value }); toast("บันทึกการตั้งค่าแล้ว", "ok"); }
    catch (e) { toastErr(e); }
  };
}
