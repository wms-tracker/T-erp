/* Warehouse SOP Management System — Front-end (vanilla JS, ไม่ต้อง build) */
'use strict';

/* ================= utilities ================= */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtD = d => { if (!d) return '-'; const [y, m, dd] = String(d).slice(0, 10).split('-'); return `${dd}/${m}/${y}`; };
const fmtDT = iso => { if (!iso) return '-'; const d = new Date(iso); return d.toLocaleDateString('en-GB') + ' ' + d.toTimeString().slice(0, 5); };
const ago = iso => {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return 'เมื่อสักครู่'; if (s < 3600) return Math.floor(s / 60) + ' นาทีที่แล้ว';
  if (s < 86400) return Math.floor(s / 3600) + ' ชม.ที่แล้ว'; if (s < 86400 * 7) return Math.floor(s / 86400) + ' วันที่แล้ว';
  return fmtDT(iso);
};
const fmtSize = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
const addMonths = (dateStr, m) => { const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date(); d.setMonth(d.getMonth() + m); return d.toLocaleDateString('sv-SE'); };
const todayStr = () => new Date().toLocaleDateString('sv-SE');
const initials = n => String(n || '?').trim().split(/\s+/).map(x => x[0]).slice(0, 2).join('').toUpperCase();

const ICON = {
  dash: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  task: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  act: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  dept: '<path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1M14 9h1M9 13h1M14 13h1M9 17h1M14 17h1"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>',
  menu: '<path d="M3 12h18M3 6h18M3 18h18"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  up: '<path d="M18 15l-6-6-6 6"/>', down: '<path d="M6 9l6 6 6-6"/>', x: '<path d="M18 6L6 18M6 6l12 12"/>',
  grip: '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
  word: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13l1.5 5 1.5-4 1.5 4 1.5-5"/>',
  print: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  xls: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
  check: '<path d="M20 6L9 17l-5-5"/>', send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>',
  back: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-1"/>',
  ban: '<circle cx="12" cy="12" r="10"/><path d="M4.93 4.93l14.14 14.14"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  msg: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  diff: '<path d="M12 3v18M5 8h4M7 6v4M15 16h4"/>',
  trash: '<path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4h6v2"/>',
  img: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  clip: '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  key: '<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zM15.5 7.5l3 3L22 7l-3-3"/>',
  out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
};
const ic = (n, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n] || ''}</svg>`;

const ROLE_LABEL = { admin: 'ผู้ดูแลระบบ', manager: 'Warehouse Operations Manager', dept_head: 'หัวหน้าแผนก', author: 'ผู้จัดทำ SOP', viewer: 'ผู้อ่าน' };
const ACTION_LABEL = {
  create: 'สร้าง SOP ใหม่', copy: 'คัดลอกเป็น SOP ใหม่', edit: 'แก้ไขเนื้อหา', submit: 'ส่งตรวจ', start_review: 'รับเรื่องตรวจสอบ',
  review_pass: 'ตรวจสอบผ่าน → ส่งผู้จัดการอนุมัติ', approve: 'อนุมัติและประกาศใช้', return: 'ส่งกลับแก้ไข', comment: 'แสดงความคิดเห็น',
  obsolete: 'ยกเลิกใช้งาน SOP', revise: 'สร้างฉบับแก้ไข', supersede: 'ถูกแทนที่ด้วยฉบับใหม่', cancel: 'ยกเลิกฉบับร่าง',
  delete: 'ลบฉบับร่าง', review_date: 'ทบทวน / กำหนดวันทบทวนใหม่',
};
const ACTION_ICON = { create: 'plus', copy: 'copy', edit: 'edit', submit: 'send', start_review: 'eye', review_pass: 'check', approve: 'shield', return: 'back', comment: 'msg', obsolete: 'ban', revise: 'edit', supersede: 'file', cancel: 'x', delete: 'trash', review_date: 'cal' };
const stLabel = s => (S.statuses && S.statuses[s]) || s;
const stBadge = s => `<span class="badge-st st-${esc(s)}">${esc(stLabel(s))}</span>`;
const RV_LABEL = { overdue: 'เลยกำหนดทบทวน', due_soon: 'ใกล้ถึงกำหนดทบทวน', ok: '', none: '' };

/* ================= state & API ================= */
const S = { me: null, depts: [], users: [], settings: {}, statuses: {}, clientId: null, presence: [], tasks: [], dirty: false, live: false, refresh: null };
const deptById = id => S.depts.find(d => d.id === Number(id));
const userById = id => S.users.find(u => u.id === Number(id));
const isPriv = () => ['admin', 'manager'].includes(S.me?.role);
const canCreateAny = () => isPriv() || ['author', 'dept_head'].includes(S.me?.role);

async function api(method, url, body) {
  const opt = { method, headers: { 'X-SOP-Client': '1' }, credentials: 'same-origin' };
  if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  let res;
  try { res = await fetch(url, opt); } catch { throw new Error('เชื่อมต่อ server ไม่ได้ — ตรวจสอบว่าเปิดโปรแกรม server อยู่'); }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !url.endsWith('/login')) { S.me = null; renderLogin(); throw new Error(data.error || 'กรุณาเข้าสู่ระบบ'); }
  if (!res.ok) { const e = new Error(data.error || 'HTTP ' + res.status); e.status = res.status; throw e; }
  return data;
}

function toast(msg, type = '', ms = 4000) {
  const el = document.createElement('div');
  el.className = 'toast ' + type; el.innerHTML = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), ms);
}
const toastErr = e => toast(esc(e.message || e), 'err', 6000);

function modal({ title, body, ok = 'ตกลง', cancel = 'ยกเลิก', okClass = 'primary', wide = false, onOk, onOpen }) {
  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true"><div class="mh"><h2>${title}</h2><span class="spacer"></span><button class="icon-btn" data-x aria-label="ปิด">${ic('x')}</button></div>
      <div class="mb">${body}</div><div class="mf">${cancel ? `<button class="btn" data-x>${cancel}</button>` : ''}${ok ? `<button class="btn ${okClass}" data-ok>${ok}</button>` : ''}</div></div>`;
    document.body.appendChild(ov);
    const close = v => { ov.remove(); resolve(v); };
    $$('[data-x]', ov).forEach(b => b.onclick = () => close(null));
    ov.addEventListener('mousedown', e => { if (e.target === ov) close(null); });
    const okBtn = $('[data-ok]', ov);
    if (okBtn) okBtn.onclick = async () => {
      okBtn.disabled = true;
      try { const r = onOk ? await onOk(ov) : true; if (r !== false) close(r ?? true); }
      catch (e) { toastErr(e); }
      finally { okBtn.disabled = false; }
    };
    onOpen && onOpen(ov);
    const first = $('input,textarea,select', ov); first && setTimeout(() => first.focus(), 30);
  });
}
function askText(title, label, { required = true, ok = 'ยืนยัน', okClass = 'primary', placeholder = '', extra = '' } = {}) {
  return modal({
    title, ok, okClass,
    body: `${extra}<label class="f">${label}${required ? ' <span class="req">*</span>' : ''}</label><textarea class="in" id="askt" rows="4" placeholder="${esc(placeholder)}"></textarea>`,
    onOk: ov => { const v = $('#askt', ov).value.trim(); if (required && !v) { toast('กรุณากรอกข้อมูล', 'err'); return false; } return v || ''; },
  });
}
const confirmBox = (title, text, ok = 'ยืนยัน', okClass = 'primary') => modal({ title, body: `<p style="margin:0">${text}</p>`, ok, okClass });

function lightbox(src) {
  const el = document.createElement('div'); el.className = 'lightbox';
  el.innerHTML = `<img src="${esc(src)}" alt="">`; el.onclick = () => el.remove();
  document.body.appendChild(el);
}

/* tooltip สำหรับกราฟ */
document.addEventListener('mouseover', e => {
  const t = e.target.closest('[data-tip]'); const tip = $('#tip');
  if (!t) { tip.classList.remove('on'); return; }
  tip.textContent = t.dataset.tip; tip.classList.add('on');
});
document.addEventListener('mousemove', e => {
  const tip = $('#tip'); if (!tip.classList.contains('on')) return;
  const x = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8);
  tip.style.left = x + 'px'; tip.style.top = (e.clientY + 16) + 'px';
});

/* ================= real-time (SSE) ================= */
let es = null;
function connectLive() {
  if (es) es.close();
  es = new EventSource('/api/events');
  es.onopen = () => { S.live = true; updateLive(); };
  es.onerror = () => { S.live = false; updateLive(); };
  es.onmessage = ev => {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (m.type === 'hello') { S.clientId = m.client_id; sendPresence(); }
    else if (m.type === 'presence') { S.presence = m.list; renderPresence(); }
    else if (m.type === 'meta') { loadBootstrap().then(() => { renderShellParts(); softRefresh(); }); }
    else if (m.type === 'sop') {
      if (m.notify && m.notify.includes(S.me.id) && m.action) {
        toast(`${esc(m.sop_number || 'SOP')}: ${esc(ACTION_LABEL[m.action] || m.action)} — <a href="#/v/${m.version_id}">เปิดดู</a>`, '', 8000);
      }
      loadTasks();
      if (m.by !== S.me.id) softRefresh(m);
    }
  };
}
function updateLive() { const el = $('#live'); if (el) { el.classList.toggle('on', S.live); el.lastChild.textContent = S.live ? ' เชื่อมต่อแบบ Real-time' : ' กำลังเชื่อมต่อใหม่…'; } }
function sendPresence() { if (S.clientId) api('POST', '/api/presence', { client_id: S.clientId, path: location.hash }).catch(() => { }); }
let refreshTimer = null;
function softRefresh(m) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => { if (S.refresh) S.refresh(m); }, 250);
}
function renderPresence() {
  const el = $('#presence'); if (!el) return;
  const here = S.presence.filter(p => p.user_id !== S.me.id && p.path && el.dataset.match && p.path.includes(el.dataset.match));
  const uniq = [...new Map(here.map(p => [p.user_id, p])).values()];
  el.innerHTML = uniq.length ? `${ic('eye')} <span>กำลังเปิดดูอยู่:</span> ${uniq.map(p => `<span class="avatar" title="${esc(p.name)}">${esc(initials(p.name))}</span> ${esc(p.name)}${p.path.startsWith('#/edit') ? ' <b style="color:var(--red)">(กำลังแก้ไข)</b>' : ''}`).join(' ')}` : '';
}

/* ================= boot / login ================= */
async function loadBootstrap() {
  const b = await api('GET', '/api/bootstrap');
  S.me = b.me; S.depts = b.departments; S.users = b.users; S.settings = b.settings; S.statuses = b.statuses;
}
async function loadTasks() {
  try { S.tasks = await api('GET', '/api/tasks'); } catch { S.tasks = []; }
  const b = $('#taskBadge'); if (b) { const n = S.tasks.filter(t => t.kind !== 'draft').length; b.textContent = n; b.classList.toggle('hidden', !n); }
}
const logoUrl = () => S.settings.logo_file_id ? `/api/files/${S.settings.logo_file_id}` : 'icon.svg';

async function boot() {
  try { await loadBootstrap(); } catch (e) { if (!S.me && !$('.login')) $('#app').innerHTML = `<div class="boot">${esc(e.message)}</div>`; return; }
  renderShell();
  connectLive();
  loadTasks();
  if (S.me.must_change_pw) setTimeout(() => changePassword(true), 400);
  route();
}
function renderLogin() {
  if (es) { es.close(); es = null; }
  $('#app').innerHTML = `<div class="login"><form class="box" id="lf">
    <div class="lg"><img src="icon.svg" alt=""><div><h2>Warehouse SOP</h2><div class="muted small">ระบบบริหารจัดการเอกสารมาตรฐานการปฏิบัติงาน</div></div></div>
    <label class="f">ชื่อผู้ใช้</label><input class="in" name="username" autocomplete="username" required>
    <div style="height:12px"></div>
    <label class="f">รหัสผ่าน</label><input class="in" type="password" name="password" autocomplete="current-password" required>
    <div id="lerr" class="banner err hidden" style="margin:14px 0 0"></div>
    <button class="btn primary" style="width:100%;margin-top:18px;justify-content:center">เข้าสู่ระบบ</button>
    <p class="muted small" style="margin:16px 0 0">ลืมรหัสผ่าน? ติดต่อผู้ดูแลระบบเพื่อรีเซ็ตรหัสผ่าน</p></form></div>`;
  $('#lf').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    try { await api('POST', '/api/login', { username: f.get('username'), password: f.get('password') }); boot(); }
    catch (err) { const el = $('#lerr'); el.textContent = err.message; el.classList.remove('hidden'); }
  };
}
function changePassword(forced) {
  return modal({
    title: forced ? 'กรุณาเปลี่ยนรหัสผ่านก่อนใช้งาน' : 'เปลี่ยนรหัสผ่าน', ok: 'บันทึกรหัสผ่านใหม่',
    body: `${forced ? '<div class="banner warn">' + ic('alert') + '<div>บัญชีนี้ใช้รหัสผ่านเริ่มต้นหรือรหัสที่ผู้ดูแลตั้งให้ เพื่อความปลอดภัยกรุณาตั้งรหัสผ่านใหม่</div></div>' : ''}
      <label class="f">รหัสผ่านปัจจุบัน</label><input class="in" type="password" id="pw0" autocomplete="current-password"><div style="height:10px"></div>
      <label class="f">รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)</label><input class="in" type="password" id="pw1" autocomplete="new-password"><div style="height:10px"></div>
      <label class="f">ยืนยันรหัสผ่านใหม่</label><input class="in" type="password" id="pw2" autocomplete="new-password">`,
    onOk: async ov => {
      const a = $('#pw1', ov).value; if (a !== $('#pw2', ov).value) throw new Error('รหัสผ่านใหม่ไม่ตรงกัน');
      await api('POST', '/api/me/password', { current: $('#pw0', ov).value, next: a });
      S.me.must_change_pw = 0; toast('เปลี่ยนรหัสผ่านเรียบร้อย', 'ok');
    },
  });
}

/* ================= shell ================= */
function renderShell() {
  $('#app').innerHTML = `<div class="shell">
    <aside class="side" id="side">
      <div class="brand"><img id="brandLogo" src="${logoUrl()}" alt=""><div><b>Warehouse SOP</b><span id="brandCo"></span></div></div>
      <nav class="nav" id="nav"></nav>
      <div class="side-foot"><span class="live" id="live"><i></i> กำลังเชื่อมต่อ…</span></div>
    </aside>
    <div class="main">
      <header class="top">
        <button class="icon-btn menu-btn" id="menuBtn" aria-label="เมนู">${ic('menu')}</button>
        <form class="search" id="gsearch">${ic('search')}<input id="gq" placeholder="ค้นหา SOP ด้วยรหัส ชื่อ แผนก หรือคำสำคัญ…" aria-label="ค้นหา SOP"></form>
        <span class="spacer"></span>
        <div class="user-chip" id="userChip"><div class="avatar">${esc(initials(S.me.display_name))}</div><div class="who"><b>${esc(S.me.display_name)}</b><span>${esc(ROLE_LABEL[S.me.role])}${S.me.department_id ? ' · ' + esc(deptById(S.me.department_id)?.code || '') : ''}</span></div></div>
      </header>
      <main class="content" id="main"></main>
    </div></div>`;
  renderShellParts();
  $('#menuBtn').onclick = () => $('#side').classList.toggle('open');
  $('#gsearch').onsubmit = e => { e.preventDefault(); location.hash = '#/sops?q=' + encodeURIComponent($('#gq').value.trim()); };
  $('#userChip').onclick = e => {
    e.stopPropagation();
    const ex = $('.dropdown'); if (ex) { ex.remove(); return; }
    const dd = document.createElement('div'); dd.className = 'dropdown';
    dd.innerHTML = `<button data-a="pw">${'เปลี่ยนรหัสผ่าน'}</button><button data-a="out" style="color:var(--red)">ออกจากระบบ</button>`;
    $('#userChip').appendChild(dd);
    dd.onclick = async ev => {
      const a = ev.target.dataset.a; dd.remove();
      if (a === 'pw') changePassword(false);
      if (a === 'out') { await api('POST', '/api/logout').catch(() => { }); location.hash = ''; renderLogin(); }
    };
  };
  document.addEventListener('click', () => { const d = $('.dropdown'); d && d.remove(); });
  updateLive();
}
function renderShellParts() {
  $('#brandCo').textContent = S.settings.company_name || '';
  $('#brandLogo').src = logoUrl();
  const items = [
    ['#/dashboard', 'dash', 'Dashboard'],
    ['#/sops', 'list', 'ทะเบียน SOP'],
    ['#/tasks', 'task', 'งานที่รอฉันดำเนินการ', '<span class="badge hidden" id="taskBadge">0</span>'],
    canCreateAny() ? ['#/new', 'plus', 'สร้าง SOP ใหม่'] : null,
    ['#/activity', 'act', 'ประวัติการดำเนินการ'],
  ].filter(Boolean);
  const admin = S.me.role === 'admin' ? [['#/admin/departments', 'dept', 'จัดการแผนก'], ['#/admin/users', 'users', 'ผู้ใช้งานและสิทธิ์'], ['#/admin/settings', 'gear', 'ตั้งค่าองค์กร'], ['#/admin/audit', 'shield', 'Audit Log']]
    : S.me.role === 'manager' ? [['#/admin/audit', 'shield', 'Audit Log']] : [];
  const link = ([h, i, t, extra]) => `<a href="${h}" data-h="${h}">${ic(i)}<span>${t}</span>${extra || ''}</a>`;
  $('#nav').innerHTML = items.map(link).join('') + (admin.length ? `<div class="sec">ผู้ดูแลระบบ</div>` + admin.map(link).join('') : '');
  markNav();
  loadTasks();
}
function markNav() {
  const h = location.hash.split('?')[0];
  $$('#nav a').forEach(a => a.classList.toggle('on', h === a.dataset.h || (a.dataset.h === '#/sops' && /^#\/(sop|v|edit|compare)\//.test(h))));
}

/* ================= router ================= */
const ROUTES = [
  [/^#\/dashboard$/, pageDashboard], [/^#\/sops$/, pageList], [/^#\/sop\/(\d+)$/, pageSop], [/^#\/v\/(\d+)$/, pageVersion],
  [/^#\/edit\/(\d+)$/, pageEdit], [/^#\/new$/, pageNew], [/^#\/compare\/(\d+)$/, pageCompare], [/^#\/tasks$/, pageTasks],
  [/^#\/activity$/, pageActivity], [/^#\/admin\/departments$/, pageDepts], [/^#\/admin\/users$/, pageUsers],
  [/^#\/admin\/settings$/, pageSettings], [/^#\/admin\/audit$/, pageAudit],
];
let lastHash = location.hash;
function qs() { const i = location.hash.indexOf('?'); return Object.fromEntries(new URLSearchParams(i >= 0 ? location.hash.slice(i + 1) : '')); }
function setQs(obj) {
  const base = location.hash.split('?')[0];
  const p = new URLSearchParams(Object.entries(obj).filter(([, v]) => v != null && v !== ''));
  history.replaceState(null, '', base + (p.toString() ? '?' + p : ''));
  lastHash = location.hash;
}
async function route() {
  if (!S.me) return;
  if (!location.hash || location.hash === '#/') { location.replace('#/dashboard'); return; }
  const path = location.hash.split('?')[0];
  const r = ROUTES.find(([re]) => re.test(path));
  S.refresh = null;
  $('#side')?.classList.remove('open');
  markNav(); sendPresence();
  const main = $('#main');
  if (!r) { main.innerHTML = '<div class="empty">ไม่พบหน้าที่ต้องการ</div>'; return; }
  main.innerHTML = '<div class="empty">กำลังโหลด…</div>';
  try { await r[1](main, ...path.match(r[0]).slice(1)); }
  catch (e) { main.innerHTML = `<div class="banner err">${ic('alert')}<div>${esc(e.message)}</div></div>`; }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', () => {
  if (S.dirty && !confirm('มีการแก้ไขที่ยังไม่ได้บันทึก ต้องการออกจากหน้านี้หรือไม่?')) { history.replaceState(null, '', lastHash); return; }
  S.dirty = false; lastHash = location.hash; route();
});
window.addEventListener('beforeunload', e => { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });

/* ================= common bits ================= */
function deptOptions(sel, { all = false, onlyActive = true, onlyCreatable = false } = {}) {
  let ds = S.depts.filter(d => !onlyActive || d.active || d.id === Number(sel));
  if (onlyCreatable && !isPriv()) ds = ds.filter(d => d.id === S.me.department_id);
  return (all ? '<option value="">ทุกแผนก</option>' : '') + ds.map(d => `<option value="${d.id}" ${Number(sel) === d.id ? 'selected' : ''}>${esc(d.code)} – ${esc(d.name)}${d.active ? '' : ' (ปิดใช้งาน)'}</option>`).join('');
}
const STATUS_FILTERS = [['', 'ทุกสถานะ'], ['active', 'ใช้งานอยู่ (มีฉบับประกาศใช้)'], ['draft', 'ฉบับร่าง'], ['pending', 'รออนุมัติ (ทุกขั้น)'], ['submitted', 'ส่งตรวจ'], ['dept_review', 'หัวหน้าแผนกตรวจสอบ'], ['manager_approval', 'รอผู้จัดการอนุมัติ'], ['revision_required', 'ส่งกลับแก้ไข'], ['overdue', 'เลยกำหนดทบทวน'], ['due_soon', 'ใกล้ถึงกำหนดทบทวน'], ['obsolete', 'ยกเลิกใช้งาน']];
const statusOptions = sel => STATUS_FILTERS.map(([v, l]) => `<option value="${v}" ${sel === v ? 'selected' : ''}>${l}</option>`).join('');
function reviewCell(s) {
  if (!s.next_review_date) return '<span class="muted">-</span>';
  return `<span class="rv-${s.review_state}">${fmtD(s.next_review_date)}</span>${RV_LABEL[s.review_state] ? `<div class="small rv-${s.review_state}">${s.review_state === 'overdue' ? ic('alert', '') : ''}${RV_LABEL[s.review_state]}</div>` : ''}`;
}
function sopRow(s) {
  return `<tr class="click" data-go="#/sop/${s.id}">
    <td class="nowrap"><b class="mono">${esc(s.sop_number)}</b></td>
    <td><div style="font-weight:500">${esc(s.title)}</div>${s.working && s.current ? `<div class="small muted">ใช้งาน: ${esc(s.current.rev)} · กำลังแก้ไข ${esc(s.working.rev)}</div>` : ''}</td>
    <td><span class="tag">${esc(s.dept_code)}</span></td>
    <td class="nowrap">${s.current ? esc(s.current.rev) : '<span class="muted">-</span>'}</td>
    <td>${stBadge(s.status)}</td>
    <td class="nowrap">${s.current ? fmtD(s.current.effective_date) : '-'}</td>
    <td class="nowrap">${reviewCell(s)}</td>
    <td>${esc(s.owner_name || '-')}</td>
    <td class="nowrap small muted">${ago(s.updated_at)}</td></tr>`;
}
function bindRowClicks(root) { $$('[data-go]', root).forEach(r => r.onclick = e => { if (!e.target.closest('a,button')) location.hash = r.dataset.go; }); }
function feedItem(a, withSop = true) {
  return `<li><div class="dot">${ic(ACTION_ICON[a.action] || 'act')}</div><div class="tx">
    <div><b>${esc(a.user_name || 'ระบบ')}</b> ${esc(ACTION_LABEL[a.action] || a.action)}${withSop && a.sop_number ? ` — <a href="#/${a.version_id ? 'v/' + a.version_id : 'sop/' + a.sop_id}">${esc(a.sop_number)} ${esc(a.rev || '')}</a>` : (a.rev ? ` <span class="muted">${esc(a.rev)}</span>` : '')}
    ${a.to_status && a.from_status !== a.to_status ? ' ' + stBadge(a.to_status) : ''}</div>
    ${withSop && a.title ? `<div class="small muted">${esc(a.title)}</div>` : ''}
    ${a.comment ? `<div class="cm">${esc(a.comment)}</div>` : ''}
    <div class="tm" title="${esc(fmtDT(a.at))}">${fmtDT(a.at)} · ${ago(a.at)}</div></div></li>`;
}
function download(url) { const a = document.createElement('a'); a.href = url; a.download = ''; document.body.appendChild(a); a.click(); a.remove(); }

/* ================= Dashboard ================= */
async function pageDashboard(main) {
  const q = qs();
  main.innerHTML = `<div class="page-head"><div><h1>Dashboard</h1><div class="sub">ภาพรวมเอกสาร SOP ${esc(S.settings.company_name || '')}</div></div><span class="spacer"></span>
      ${canCreateAny() ? `<a class="btn accent" href="#/new">${ic('plus')} สร้าง SOP ใหม่</a>` : ''}</div>
    <form class="filters" id="df">
      <label class="fi"><span>แผนก</span><select class="in" name="dept">${deptOptions(q.dept, { all: true, onlyActive: false })}</select></label>
      <label class="fi"><span>สถานะ</span><select class="in" name="status">${statusOptions(q.status || '')}</select></label>
      <label class="fi"><span>แก้ไขล่าสุดตั้งแต่</span><input class="in" type="date" name="from" value="${esc(q.from || '')}"></label>
      <label class="fi"><span>ถึง</span><input class="in" type="date" name="to" value="${esc(q.to || '')}"></label>
      <button class="btn" type="button" id="dreset">ล้างตัวกรอง</button>
    </form><div id="dbody"><div class="empty">กำลังโหลด…</div></div>`;
  const form = $('#df');
  const load = async () => {
    const f = Object.fromEntries(new FormData(form)); setQs(f);
    const p = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
    const d = await api('GET', '/api/dashboard?' + p);
    renderDash($('#dbody'), d, f);
  };
  form.onchange = () => load().catch(toastErr);
  $('#dreset').onclick = () => { form.reset(); $$('select,input', form).forEach(x => x.value = ''); load().catch(toastErr); };
  S.refresh = () => load().catch(() => { });
  await load();
}
function renderDash(el, d, f) {
  const k = d.kpi;
  const cards = [
    ['total', 'SOP ทั้งหมด', k.total, 'var(--navy)', 'file', ''],
    ['active', 'ใช้งานอยู่', k.active, 'var(--green)', 'shield', 'active'],
    ['draft', 'ฉบับร่าง', k.draft, '#64748b', 'edit', 'draft'],
    ['pending', 'รออนุมัติ', k.pending, 'var(--amber)', 'clock', 'pending'],
    ['revision_required', 'ส่งกลับแก้ไข', k.revision_required, 'var(--red)', 'back', 'revision_required'],
    ['overdue', 'เลยกำหนดทบทวน', k.overdue, '#991b1b', 'alert', 'overdue'],
    ['due_soon', `ใกล้ครบกำหนดทบทวน (${S.settings.review_warn_days} วัน)`, k.due_soon, '#d97706', 'cal', 'due_soon'],
  ];
  const listLink = st => '#/sops?' + new URLSearchParams(Object.entries({ dept: f.dept, status: st }).filter(([, v]) => v));
  // สถานะแยกตามแผนก (stacked) — สีตามลำดับ categorical ที่ผ่านการตรวจ CVD
  const SER = [['published', 'ใช้งานอยู่', 'var(--s1)'], ['in_progress', 'ฉบับแรก ระหว่างจัดทำ/อนุมัติ', 'var(--s2)'], ['revision_required', 'ฉบับแรก ส่งกลับแก้ไข', 'var(--s3)'], ['obsolete', 'ยกเลิกใช้งาน', 'var(--s4)']];
  const maxD = Math.max(1, ...d.byDept.map(x => x.total));
  const deptBars = d.byDept.map(x => `<div class="hbar"><a class="nm" href="${'#/sops?dept=' + x.id}" title="${esc(x.name)}"><b>${esc(x.code)}</b> <span class="muted">${esc(x.name)}</span></a>
      <div class="trk" style="width:${Math.max(x.total / maxD * 100, 0.5)}%">${SER.filter(([key]) => x[key] > 0).map(([key, lbl, col]) => `<div class="seg" style="flex:${x[key]};background:${col}" data-tip="${esc(x.code)} · ${lbl}: ${x[key]}"></div>`).join('') || '<div class="seg" style="flex:1;background:#e2e8f0" data-tip="ยังไม่มี SOP"></div>'}</div>
      <div class="n">${x.total}</div></div>`).join('') || '<div class="empty">ยังไม่มีแผนก</div>';
  // กราฟรายเดือน (grouped bars, แกนเดียว)
  const MS = [['submit', 'ส่งตรวจ', 'var(--s1)'], ['approve', 'อนุมัติประกาศใช้', 'var(--s2)'], ['return', 'ส่งกลับแก้ไข', 'var(--s3)']];
  const maxM = Math.max(1, ...d.monthly.flatMap(m => MS.map(([k2]) => m[k2])));
  const W = 640, H = 200, padL = 30, padB = 26, cw = (W - padL) / d.monthly.length, bw = Math.min(10, (cw - 10) / 3);
  const yT = v => H - padB - v / maxM * (H - padB - 10);
  const ticks = [...new Set([0, Math.ceil(maxM / 2), maxM])];
  const TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const mLabel = ym => TH[Number(ym.slice(5)) - 1] + ' ' + String((Number(ym.slice(0, 4)) + 543) % 100);
  const svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="จำนวนการส่งตรวจ อนุมัติ และส่งกลับรายเดือน">
    ${ticks.map(t => `<line x1="${padL}" x2="${W}" y1="${yT(t)}" y2="${yT(t)}" stroke="#e2e8f0"/><text x="${padL - 6}" y="${yT(t) + 4}" text-anchor="end" font-size="10" fill="#64748b">${t}</text>`).join('')}
    ${d.monthly.map((m, i) => {
      const x0 = padL + i * cw + (cw - bw * 3 - 4) / 2;
      const bars = MS.map(([key, , col], j) => {
        const v = m[key]; if (!v) return '';
        const y = yT(v), h = H - padB - y, x = x0 + j * (bw + 2);
        return `<path d="M${x},${H - padB} V${y + Math.min(4, h)} q0,-${Math.min(4, h)} ${Math.min(4, bw / 2)},-${Math.min(4, h)} H${x + bw - Math.min(4, bw / 2)} q${Math.min(4, bw / 2)},0 ${Math.min(4, bw / 2)},${Math.min(4, h)} V${H - padB} Z" fill="${col}"/>`;
      }).join('');
      const tip = `${mLabel(m.month)}\n` + MS.map(([key, lbl]) => `${lbl}: ${m[key]}`).join('\n');
      return `<g>${bars}<rect x="${padL + i * cw}" y="0" width="${cw}" height="${H - padB}" fill="transparent" data-tip="${esc(tip)}"/><text x="${padL + i * cw + cw / 2}" y="${H - 8}" text-anchor="middle" font-size="10" fill="#64748b">${mLabel(m.month)}</text></g>`;
    }).join('')}
    <line x1="${padL}" x2="${W}" y1="${H - padB}" y2="${H - padB}" stroke="#94a3b8"/></svg>`;
  const tasks = d.tasks.length ? d.tasks.map(taskItem).join('') : '<div class="empty">ไม่มีงานค้าง 🎉</div>';
  el.innerHTML = `<div class="kpis">${cards.map(([key, lbl, v, col, icn, st]) => `<a class="kpi" href="${listLink(st)}" style="--k:${col}"><div class="lbl">${ic(icn)} ${lbl}</div><div class="val">${v}</div></a>`).join('')}</div>
    <div class="dash">
      <div class="card c7"><div class="hd"><h3>จำนวน SOP แยกตามแผนก</h3></div><div class="bd">
        <div class="legend" style="margin-bottom:10px">${SER.map(([, l, c]) => `<span><i style="background:${c}"></i>${l}</span>`).join('')}</div>${deptBars}</div></div>
      <div class="card c5"><div class="hd"><h3>รายการที่รอคุณดำเนินการ</h3><span class="spacer"></span><a href="#/tasks" class="small">ดูทั้งหมด</a></div><div class="bd" style="padding-top:4px">${tasks}</div></div>
      <div class="card c7"><div class="hd"><h3>ความเคลื่อนไหวของ Workflow 12 เดือน</h3></div><div class="bd">
        <div class="legend" style="margin-bottom:6px">${MS.map(([, l, c]) => `<span><i style="background:${c}"></i>${l}</span>`).join('')}</div>${svg}</div></div>
      <div class="card c5"><div class="hd"><h3>SOP ครบ/ใกล้ครบกำหนดทบทวน</h3></div><div class="bd" style="padding:0">
        ${d.reviewList.length ? `<table class="t"><tbody>${d.reviewList.map(s => `<tr class="click" data-go="#/sop/${s.id}"><td><b class="mono">${esc(s.sop_number)}</b><div class="small">${esc(s.title)}</div></td><td class="nowrap">${reviewCell(s)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">ไม่มี SOP ที่ใกล้ครบกำหนดทบทวน</div>'}</div></div>
      <div class="card c12"><div class="hd"><h3>ประวัติการแก้ไขล่าสุด</h3><span class="spacer"></span><a href="#/activity" class="small">ดูทั้งหมด</a></div><div class="bd" style="padding-top:4px">
        ${d.activity.length ? `<ul class="feed">${d.activity.map(a => feedItem(a)).join('')}</ul>` : '<div class="empty">ยังไม่มีกิจกรรม</div>'}</div></div>
    </div>`;
  bindRowClicks(el);
}
const TASK_COLOR = { approve: 'var(--amber)', review: '#4338ca', fix: 'var(--red)', overdue: '#991b1b', due_soon: '#d97706', draft: '#94a3b8' };
function taskItem(t) {
  return `<div class="task"><span class="k" style="background:${TASK_COLOR[t.kind]}"></span><div class="grow" style="min-width:0">
    <div class="small" style="font-weight:600;color:${TASK_COLOR[t.kind]}">${esc(t.label)}</div>
    <a href="#/v/${t.version_id}"><b class="mono">${esc(t.sop_number)}</b> ${esc(t.rev)}</a> — ${esc(t.title)}
    <div class="small muted"><span class="tag">${esc(t.dept_code)}</span> ${stBadge(t.status)}</div></div>
    <a class="btn sm" href="#/v/${t.version_id}">${t.kind === 'approve' ? 'อนุมัติ' : t.kind === 'review' ? 'ตรวจสอบ' : t.kind === 'fix' || t.kind === 'draft' ? 'แก้ไข' : 'ทบทวน'}</a></div>`;
}

/* ================= SOP list ================= */
async function pageList(main) {
  const q = qs();
  main.innerHTML = `<div class="page-head"><div><h1>ทะเบียน SOP</h1><div class="sub">ค้นหาด้วยรหัส ชื่อ แผนก หรือคำสำคัญในเนื้อหา</div></div><span class="spacer"></span>
      <button class="btn" id="xls">${ic('xls')} ส่งออก Excel</button>
      ${canCreateAny() ? `<a class="btn accent" href="#/new">${ic('plus')} สร้าง SOP ใหม่</a>` : ''}</div>
    <form class="filters" id="lf">
      <label class="fi grow"><span>คำค้นหา</span><input class="in" name="q" value="${esc(q.q || '')}" placeholder="เช่น OB-SOP-001, Picking, รถโฟล์คลิฟท์"></label>
      <label class="fi"><span>แผนก</span><select class="in" name="dept">${deptOptions(q.dept, { all: true, onlyActive: false })}</select></label>
      <label class="fi"><span>สถานะ</span><select class="in" name="status">${statusOptions(q.status || '')}</select></label>
      <button class="btn primary">${ic('search')} ค้นหา</button></form>
    <div class="card"><div class="table-wrap" id="lt"><div class="empty">กำลังโหลด…</div></div></div>`;
  const form = $('#lf');
  const params = () => new URLSearchParams(Object.entries(Object.fromEntries(new FormData(form))).filter(([, v]) => v));
  const load = async () => {
    const f = Object.fromEntries(new FormData(form)); setQs(f);
    const list = await api('GET', '/api/sops?' + params());
    $('#lt').innerHTML = list.length ? `<table class="t"><thead><tr><th>SOP Number</th><th>SOP Title</th><th>แผนก</th><th>Rev. ใช้งาน</th><th>สถานะ</th><th>วันที่มีผล</th><th>วันทบทวน</th><th>ผู้รับผิดชอบ</th><th>อัปเดต</th></tr></thead>
      <tbody>${list.map(sopRow).join('')}</tbody></table><div class="small muted" style="padding:10px 12px">พบ ${list.length} รายการ</div>` : '<div class="empty">ไม่พบ SOP ตามเงื่อนไข</div>';
    bindRowClicks($('#lt'));
  };
  form.onsubmit = e => { e.preventDefault(); load().catch(toastErr); };
  $$('select', form).forEach(s => s.onchange = () => load().catch(toastErr));
  $('#xls').onclick = () => download('/api/export/register.xlsx?' + params());
  if (q.q) $('#gq').value = q.q;
  S.refresh = () => load().catch(() => { });
  await load();
}

/* ================= Tasks / Activity ================= */
async function pageTasks(main) {
  const load = async () => {
    await loadTasks();
    const groups = [['approve', 'รออนุมัติ'], ['review', 'รอตรวจสอบ'], ['fix', 'ถูกส่งกลับแก้ไข'], ['overdue', 'เลยกำหนดทบทวน'], ['due_soon', 'ใกล้ครบกำหนดทบทวน'], ['draft', 'ฉบับร่างของฉัน']];
    main.innerHTML = `<div class="page-head"><div><h1>งานที่รอฉันดำเนินการ</h1><div class="sub">รายการ SOP ที่ต้องตรวจสอบ อนุมัติ แก้ไข หรือทบทวน</div></div></div>
      ${S.tasks.length ? groups.filter(([k]) => S.tasks.some(t => t.kind === k)).map(([k, l]) => `<div class="card"><div class="hd"><h3>${l}</h3><span class="tag">${S.tasks.filter(t => t.kind === k).length}</span></div><div class="bd" style="padding-top:4px">${S.tasks.filter(t => t.kind === k).map(taskItem).join('')}</div></div>`).join('')
        : '<div class="card"><div class="empty">ไม่มีงานค้าง 🎉</div></div>'}`;
  };
  S.refresh = () => load().catch(() => { });
  await load();
}
async function pageActivity(main) {
  const load = async () => {
    const list = await api('GET', '/api/activity?limit=200');
    main.innerHTML = `<div class="page-head"><div><h1>ประวัติการดำเนินการ</h1><div class="sub">บันทึกวัน เวลา และผู้ดำเนินการทุกครั้ง (200 รายการล่าสุด)</div></div></div>
      <div class="card"><div class="bd" style="padding-top:4px">${list.length ? `<ul class="feed">${list.map(a => feedItem(a)).join('')}</ul>` : '<div class="empty">ยังไม่มีกิจกรรม</div>'}</div></div>`;
  };
  S.refresh = () => load().catch(() => { });
  await load();
}

/* ================= SOP view ================= */
async function pageSop(main, id) {
  const P = await api('GET', '/api/sops/' + id);
  history.replaceState(null, '', '#/v/' + P.version.id); lastHash = location.hash;
  return renderVersion(main, P);
}
async function pageVersion(main, vid) {
  const P = await api('GET', '/api/versions/' + vid);
  return renderVersion(main, P);
}
const WF_STEPS = [['draft', 'Draft', 'ผู้จัดทำสร้าง SOP'], ['submitted', 'Submitted', 'ส่งให้หัวหน้าแผนกตรวจสอบ'], ['dept_review', 'Department Review', 'หัวหน้าแผนกตรวจสอบ'], ['manager_approval', 'Manager Approval', 'Warehouse Operations Manager อนุมัติ'], ['published', 'Published', 'ประกาศใช้']];
function stepper(v) {
  const order = WF_STEPS.map(s => s[0]);
  let idx = order.indexOf(v.status);
  const bad = v.status === 'revision_required';
  if (bad) idx = 0;
  if (['superseded', 'obsolete'].includes(v.status)) idx = 5;
  return `<div class="stepper">${WF_STEPS.map(([k, en, th], i) => {
    const cls = bad && i === 0 ? 'bad' : i < idx || (idx === 4 && i === 4) || idx === 5 ? 'done' : i === idx ? 'cur' : '';
    return `<div class="s ${cls}"><div class="n">${cls === 'done' ? '✓' : cls === 'bad' ? '!' : i + 1}</div><div class="lb"><b>${en}</b>${bad && i === 0 ? ' — <span style="color:var(--red)">Revision Required</span>' : ''}<small>${th}</small></div></div>`;
  }).join('')}</div>`;
}
function fileIcon(name) { return /\.(png|jpe?g|gif|webp)$/i.test(name) ? 'img' : /\.xlsx?|\.csv$/i.test(name) ? 'xls' : /\.docx?$/i.test(name) ? 'word' : 'file'; }

function docView(P) {
  const { sop, version: v, people, files } = P;
  const c = v.content, fm = new Map(files.map(f => [f.id, f]));
  const sec = (n, t, body) => `<div class="sec-h">${n}. ${t}</div><div class="sec-b ${body ? '' : 'none'}">${body ? esc(body) : '-'}</div>`;
  const person = (u, date, note) => u ? `${note ? `<div class="e">${note}</div>` : '<div class="e"></div>'}<div><b>( ${esc(u.display_name)} )</b></div><div class="small muted">${esc(u.position || '')}</div><div class="small">วันที่ ${date ? fmtD(date) : '……/……/……'}</div>` : '<div class="e"></div><div class="muted">( ยังไม่ระบุ )</div>';
  const rd = sop.current_version_id === v.id && sop.next_review_date ? sop.next_review_date : v.review_date;
  return `<div class="doc">
    <div class="doc-head"><div class="logo"><img src="${logoUrl()}" alt="logo"></div>
      <div class="mid"><b>${esc(S.settings.company_name)}</b><div class="small muted">${esc(S.settings.company_name_en || '')}</div><div style="font-weight:600;margin-top:4px">${esc(v.title)}</div></div>
      <div class="meta"><div>รหัสเอกสาร: <b class="mono">${esc(sop.sop_number)}</b></div><div>Revision: <b>${esc(v.rev)}</b></div><div>วันที่มีผล: <b>${fmtD(v.effective_date)}</b></div><div>แผนก: <b>${esc(sop.dept_code)}</b></div></div></div>
    <div class="doc-body">
      <div class="doc-title"><div class="k">STANDARD OPERATING PROCEDURE</div><h1>${esc(v.title)}</h1></div>
      <table class="info-t"><tr><th>SOP Number</th><td class="mono">${esc(sop.sop_number)}</td><th>Department</th><td>${esc(sop.dept_code)} – ${esc(sop.dept_name)}</td></tr>
        <tr><th>Revision</th><td>${esc(v.rev)}</td><th>Status</th><td>${stBadge(v.status)}</td></tr>
        <tr><th>Effective Date</th><td>${fmtD(v.effective_date)}</td><th>Review Date</th><td>${fmtD(rd)}</td></tr>
        <tr><th>ผู้รับผิดชอบ</th><td>${esc(people.owner?.display_name || '-')}</td><th>Keywords</th><td>${esc(c.keywords || '-')}</td></tr></table>
      <table class="sig-t"><tr><th>ผู้จัดทำ (Prepared By)</th><th>ผู้ตรวจสอบ (Reviewed By)</th><th>ผู้อนุมัติ (Approved By)</th></tr>
        <tr><td>${person(people.prepared, v.submitted_at || v.created_at)}</td>
          <td>${person(people.reviewed_by || people.reviewer, v.reviewed_at, v.reviewed_by ? 'ตรวจสอบผ่านระบบแล้ว' : '')}</td>
          <td>${person(people.approved_by || people.approver, v.approved_at, v.approved_by ? 'อนุมัติผ่านระบบแล้ว' : '')}</td></tr></table>
      ${sec(1, 'วัตถุประสงค์ (Objective)', c.objective)}${sec(2, 'ขอบเขต (Scope)', c.scope)}${sec(3, 'ความรับผิดชอบ (Responsibility)', c.responsibility)}
      ${sec(4, 'อุปกรณ์ / เครื่องมือ (Equipment / Tools)', c.equipment)}${sec(5, 'ข้อกำหนดด้านความปลอดภัย (Safety Requirements)', c.safety)}
      <div class="sec-h">6. ขั้นตอนการปฏิบัติงาน (Work Instructions)</div>
      ${c.steps.length ? c.steps.map((s, i) => `<div class="step"><h4>6.${i + 1} ${esc(s.title)}</h4>${s.detail ? `<div class="dt">${esc(s.detail)}</div>` : ''}
        ${s.images.length ? `<div class="imgs">${s.images.map(fid => `<img src="/api/files/${fid}" alt="${esc(fm.get(fid)?.name || '')}" data-lb loading="lazy">`).join('')}</div>` : ''}</div>`).join('') : '<div class="sec-b none">-</div>'}
      ${sec(7, 'เอกสารที่เกี่ยวข้อง (Related Documents)', c.related_docs)}
      ${c.attachments.length ? c.attachments.map(fid => { const f = fm.get(fid); return f ? `<div class="att">${ic(fileIcon(f.name))}<span class="nm">${esc(f.name)}</span><span class="small muted">${fmtSize(f.size)}</span><a class="btn sm" href="/api/files/${fid}" target="_blank" rel="noopener">เปิด</a><a class="btn sm" href="/api/files/${fid}?download=1">ดาวน์โหลด</a></div>` : ''; }).join('') : ''}
      ${sec(8, 'ตัวชี้วัด / มาตรฐาน (KPI / Standard)', c.kpi)}
      <div class="sec-h">9. ประวัติการแก้ไข (Revision History)</div>
      <div class="table-wrap"><table class="info-t"><tr><th style="width:70px">Rev.</th><th style="width:100px">วันที่มีผล</th><th>รายละเอียดการแก้ไข</th><th>ผู้จัดทำ</th><th>ผู้อนุมัติ / วันที่</th></tr>
        ${P.versions.filter(x => ['published', 'superseded', 'obsolete'].includes(x.status) || x.id === v.id).filter(x => x.revision <= v.revision).sort((a, b) => a.revision - b.revision).map(x => `<tr><td>${esc(x.rev)}</td><td>${fmtD(x.effective_date)}</td><td style="white-space:pre-wrap">${esc(x.change_summary || '-')}</td><td>${esc(x.prepared_name || '-')}</td><td>${esc(x.approved_name || '-')}${x.approved_at ? '<div class="small muted">' + fmtD(x.approved_at) + '</div>' : ''}</td></tr>`).join('')}</table></div>
    </div></div>`;
}

function renderVersion(main, P) {
  const { sop, version: v, permissions: pm } = P;
  const isPublicNotCurrent = v.status === 'superseded' || v.status === 'obsolete' || v.status === 'cancelled';
  const working = P.versions.find(x => x.is_working), current = P.versions.find(x => x.is_current);
  let banner = '';
  if (WORK_STATUSES_UI.includes(v.status)) banner = `<div class="banner warn">${ic('alert')}<div><b>ฉบับนี้ยังไม่ได้รับการอนุมัติ — ห้ามใช้ปฏิบัติงานจริง</b>${current ? `<br>ฉบับที่ใช้งานอยู่ปัจจุบันคือ <a href="#/v/${current.id}">${esc(current.rev)}</a>` : '<br>SOP นี้ยังไม่มีฉบับประกาศใช้'}</div></div>`;
  else if (v.status === 'superseded') banner = `<div class="banner info">${ic('info')}<div>ฉบับนี้ถูกแทนที่แล้ว (ใช้อ้างอิงเท่านั้น) — ${current ? `ฉบับปัจจุบันคือ <a href="#/v/${current.id}">${esc(current.rev)}</a>` : ''}</div></div>`;
  else if (v.status === 'obsolete') banner = `<div class="banner err">${ic('ban')}<div><b>SOP นี้ถูกยกเลิกใช้งานแล้ว</b> — ห้ามนำไปใช้ปฏิบัติงาน</div></div>`;
  else if (v.status === 'cancelled') banner = `<div class="banner info">${ic('info')}<div>ฉบับร่างนี้ถูกยกเลิก</div></div>`;
  else if (v.status === 'published') banner = `<div class="banner ok">${ic('shield')}<div><b>ฉบับใช้งานจริง (Current Version)</b> — อนุมัติโดย ${esc(P.people.approved_by?.display_name || '-')} เมื่อ ${fmtDT(v.approved_at)}${working ? ` · มีฉบับแก้ไข <a href="#/v/${working.id}">${esc(working.rev)}</a> ${stBadge(working.status)} อยู่ระหว่างดำเนินการ` : ''}</div></div>`;
  const lastReturn = v.status === 'revision_required' ? P.log.find(l => l.version_id === v.id && l.action === 'return') : null;
  if (lastReturn) banner += `<div class="banner err">${ic('back')}<div><b>ถูกส่งกลับแก้ไขโดย ${esc(lastReturn.user_name)}</b> (${fmtDT(lastReturn.at)})<div style="white-space:pre-wrap;margin-top:4px">เหตุผล: ${esc(lastReturn.comment)}</div></div></div>`;
  if (pm.separationNote) banner += `<div class="banner info">${ic('info')}<div>${esc(pm.separationNote)}</div></div>`;
  const A = [];
  if (pm.canEdit) A.push(`<a class="btn primary" href="#/edit/${v.id}">${ic('edit')} แก้ไขเนื้อหา</a>`);
  if (pm.canSubmit) A.push(`<button class="btn accent" data-act="submit">${ic('send')} ส่งตรวจ (Submit)</button>`);
  if (pm.canStartReview) A.push(`<button class="btn" data-act="start_review">${ic('eye')} รับเรื่องตรวจสอบ</button>`);
  if (pm.canReviewPass) A.push(`<button class="btn green" data-act="review_pass">${ic('check')} ตรวจสอบผ่าน → ส่งผู้จัดการ</button>`);
  if (pm.canApprove) A.push(`<button class="btn green" data-act="approve">${ic('shield')} อนุมัติและประกาศใช้</button>`);
  if (pm.canReturn) A.push(`<button class="btn danger" data-act="return">${ic('back')} ส่งกลับแก้ไข</button>`);
  if (pm.canRevise) A.push(`<button class="btn primary" data-act="revise">${ic('edit')} สร้างฉบับแก้ไข (Rev. ใหม่)</button>`);
  if (pm.canSetReviewDate) A.push(`<button class="btn" data-act="review_date">${ic('cal')} บันทึกผลทบทวน / วันทบทวนถัดไป</button>`);
  if (pm.canComment) A.push(`<button class="btn" data-act="comment">${ic('msg')} แสดงความคิดเห็น</button>`);
  const EX = [`<a class="btn" href="/api/versions/${v.id}/docx">${ic('word')} Word (.docx)</a>`, `<a class="btn" href="print.html?v=${v.id}" target="_blank">${ic('print')} พิมพ์ / PDF</a>`];
  if (canCreateAny()) EX.push(`<button class="btn" data-act="copy">${ic('copy')} คัดลอกเป็น SOP ใหม่</button>`);
  if (pm.canDeleteDraft) EX.push(`<button class="btn danger" data-act="delete">${ic('trash')} ${sop.current_version_id ? 'ยกเลิกฉบับแก้ไขนี้' : 'ลบฉบับร่าง'}</button>`);
  if (pm.canObsolete) EX.push(`<button class="btn danger" data-act="obsolete">${ic('ban')} ยกเลิกใช้งาน SOP (Obsolete)</button>`);
  const verRows = P.versions.map(x => `<tr class="${x.id === v.id ? '' : 'click'}" ${x.id === v.id ? 'style="background:#fffbeb"' : `data-go="#/v/${x.id}"`}>
      <td><b>${esc(x.rev)}</b>${x.is_current ? ' <span class="tag">Current</span>' : ''}</td><td>${stBadge(x.status)}</td>
      <td class="small">${esc(x.change_summary || '-')}<div class="muted">${esc(x.prepared_name)} · ${fmtD(x.updated_at)}</div></td>
      <td class="nowrap"><a class="icon-btn" title="ดาวน์โหลด Word" href="/api/versions/${x.id}/docx">${ic('word')}</a></td></tr>`).join('');
  main.innerHTML = `<div class="page-head"><div class="grow"><div class="crumb"><a href="#/sops">ทะเบียน SOP</a> / <span class="tag">${esc(sop.dept_code)}</span> ${esc(sop.dept_name)}</div>
      <h1><span class="mono">${esc(sop.sop_number)}</span> · ${esc(v.title)}</h1>
      <div class="row" style="margin-top:6px">${stBadge(v.status)} <b>${esc(v.rev)}</b> <span class="muted small">อัปเดตล่าสุด ${fmtDT(v.updated_at)}</span></div>
      <div class="presence" id="presence" data-match="${v.id}" style="margin-top:6px"></div></div></div>
    ${banner}
    <div class="sop-layout"><div>${docView(P)}</div>
      <div class="sop-side">
        <div class="card"><div class="hd"><h3>การดำเนินการ</h3></div><div class="bd"><div class="actions">${A.join('') || '<div class="muted small">ไม่มีรายการที่คุณดำเนินการได้ในสถานะนี้</div>'}</div></div></div>
        <div class="card"><div class="hd"><h3>Workflow การอนุมัติ</h3></div><div class="bd">${stepper(v)}
          <dl class="kv" style="margin-top:6px"><dt>ผู้จัดทำ</dt><dd>${esc(P.people.prepared?.display_name || '-')}</dd><dt>ผู้ตรวจสอบ</dt><dd>${esc(P.people.reviewer?.display_name || 'หัวหน้าแผนก ' + sop.dept_code + ' (คนใดก็ได้)')}</dd>
          <dt>ผู้อนุมัติ</dt><dd>${esc(P.people.approver?.display_name || 'Warehouse Operations Manager')}</dd>${v.submitted_at ? `<dt>ส่งตรวจเมื่อ</dt><dd>${fmtDT(v.submitted_at)}</dd>` : ''}
          ${v.reviewed_at ? `<dt>ตรวจผ่านเมื่อ</dt><dd>${fmtDT(v.reviewed_at)}</dd>` : ''}${v.approved_at ? `<dt>อนุมัติเมื่อ</dt><dd>${fmtDT(v.approved_at)}</dd>` : ''}</dl></div></div>
        <div class="card"><div class="hd"><h3>ส่งออก / อื่น ๆ</h3></div><div class="bd"><div class="actions">${EX.join('')}</div></div></div>
        <div class="card"><div class="hd"><h3>ประวัติเวอร์ชัน</h3><span class="spacer"></span>${P.versions.length > 1 ? `<a class="btn sm" href="#/compare/${sop.id}?a=${(P.versions.find(x => x.id !== v.id) || {}).id}&b=${v.id}">${ic('diff')} เปรียบเทียบ</a>` : ''}</div>
          <div class="table-wrap"><table class="t"><tbody>${verRows}</tbody></table></div></div>
        <div class="card"><div class="hd"><h3>Workflow log & ความคิดเห็น</h3></div><div class="bd" style="padding-top:4px;max-height:520px;overflow:auto">
          <ul class="feed">${P.log.map(a => feedItem(a, false)).join('') || '<div class="empty">-</div>'}</ul></div></div>
      </div></div>`;
  bindRowClicks(main);
  renderPresence();
  $$('[data-lb]', main).forEach(img => img.onclick = () => lightbox(img.src));
  $$('[data-act]', main).forEach(b => b.onclick = () => doAction(b.dataset.act, P).catch(toastErr));
  S.refresh = async (m) => {
    if (m && m.sop_id && m.sop_id !== sop.id) return;
    try { const np = await api('GET', '/api/versions/' + v.id); renderVersion(main, np); } catch { }
  };
}
const WORK_STATUSES_UI = ['draft', 'submitted', 'dept_review', 'manager_approval', 'revision_required'];

async function doAction(act, P) {
  const { sop, version: v } = P;
  const reload = async () => { const np = await api('GET', '/api/versions/' + v.id); renderVersion($('#main'), np); loadTasks(); };
  const wf = async (action, comment) => { await api('POST', `/api/versions/${v.id}/action`, { action, comment }); toast(ACTION_LABEL[action] + ' เรียบร้อย', 'ok'); await reload(); };
  switch (act) {
    case 'submit': {
      const c = await askText('ส่ง SOP ให้ตรวจสอบ', 'หมายเหตุถึงผู้ตรวจสอบ (ถ้ามี)', { required: false, ok: 'ส่งตรวจ', okClass: 'accent', extra: '<p class="muted small" style="margin-top:0">หลังส่งตรวจ จะแก้ไขเนื้อหาไม่ได้จนกว่าจะถูกส่งกลับ</p>' });
      if (c !== null) await wf('submit', c); break;
    }
    case 'start_review': await wf('start_review', ''); break;
    case 'review_pass': {
      const c = await askText('ตรวจสอบผ่าน', 'ความคิดเห็นของผู้ตรวจสอบ', { required: false, ok: 'ยืนยันตรวจสอบผ่าน', okClass: 'green' });
      if (c !== null) await wf('review_pass', c); break;
    }
    case 'approve': {
      const c = await askText('อนุมัติและประกาศใช้', 'ความคิดเห็นของผู้อนุมัติ', { required: false, ok: 'อนุมัติและประกาศใช้', okClass: 'green', extra: `<div class="banner info">${ic('info')}<div>เมื่ออนุมัติ ${esc(v.rev)} จะกลายเป็น <b>Current Version</b> ${sop.current_version_id ? 'และฉบับเดิมจะถูกเก็บเป็นประวัติ (Superseded)' : ''} และจะถูกล็อกห้ามแก้ไข</div></div>` });
      if (c !== null) await wf('approve', c); break;
    }
    case 'return': {
      const c = await askText('ส่งกลับเพื่อแก้ไข', 'เหตุผลที่ส่งกลับ', { ok: 'ส่งกลับแก้ไข', okClass: 'red', placeholder: 'ระบุสิ่งที่ต้องแก้ไข…' });
      if (c !== null) await wf('return', c); break;
    }
    case 'comment': {
      const c = await askText('แสดงความคิดเห็น', 'ความคิดเห็น', { ok: 'บันทึกความคิดเห็น' });
      if (c !== null) await wf('comment', c); break;
    }
    case 'obsolete': {
      const c = await askText('ยกเลิกใช้งาน SOP', 'เหตุผลที่ยกเลิกใช้งาน', { ok: 'ยกเลิกใช้งาน', okClass: 'red', extra: `<div class="banner err">${ic('alert')}<div>SOP ${esc(sop.sop_number)} จะไม่ถูกแสดงเป็นฉบับใช้งานอีกต่อไป (ข้อมูลทุกเวอร์ชันยังถูกเก็บไว้)</div></div>` });
      if (c !== null) await wf('obsolete', c); break;
    }
    case 'revise': {
      const c = await askText('สร้างฉบับแก้ไข', 'เหตุผล / รายละเอียดที่จะแก้ไข (Change Summary)', { required: false, ok: 'สร้างฉบับแก้ไข', extra: `<p class="muted small" style="margin-top:0">ระบบจะคัดลอกเนื้อหาจาก ${esc(v.rev)} เป็นฉบับร่าง Rev. ถัดไป ฉบับปัจจุบันยังใช้งานได้ตามปกติจนกว่าฉบับใหม่จะได้รับอนุมัติ</p>` });
      if (c === null) return;
      const r = await api('POST', `/api/sops/${sop.id}/revise`, { change_summary: c });
      toast('สร้างฉบับแก้ไขแล้ว', 'ok'); location.hash = '#/edit/' + r.version_id; break;
    }
    case 'review_date': {
      const months = Number(S.settings.default_review_months) || 12;
      const r = await modal({
        title: 'บันทึกผลการทบทวน SOP', ok: 'บันทึก',
        body: `<p class="muted small" style="margin-top:0">ใช้เมื่อทบทวนแล้วเนื้อหายังถูกต้อง ไม่ต้องออก Rev. ใหม่ (ถ้าต้องแก้เนื้อหา ให้ใช้ "สร้างฉบับแก้ไข")</p>
          <label class="f">วันทบทวนครั้งถัดไป <span class="req">*</span></label><input class="in" type="date" id="rd" value="${addMonths(todayStr(), months)}" min="${addMonths(todayStr(), 0)}">
          <div style="height:10px"></div><label class="f">ผลการทบทวน <span class="req">*</span></label><textarea class="in" id="rn" placeholder="เช่น ทบทวนแล้ว เนื้อหายังถูกต้องตามการปฏิบัติงานปัจจุบัน">ทบทวนแล้ว เนื้อหายังเป็นปัจจุบัน ไม่มีการเปลี่ยนแปลง</textarea>`,
        onOk: ov => api('POST', `/api/sops/${sop.id}/review-date`, { date: $('#rd', ov).value, comment: $('#rn', ov).value }),
      });
      if (r) { toast('บันทึกผลการทบทวนแล้ว', 'ok'); await reload(); } break;
    }
    case 'delete': {
      if (!await confirmBox(sop.current_version_id ? 'ยกเลิกฉบับแก้ไข' : 'ลบฉบับร่าง', sop.current_version_id ? `ยกเลิก ${esc(v.rev)} (ฉบับที่ใช้งานอยู่ไม่ได้รับผลกระทบ)?` : `ลบ ${esc(sop.sop_number)} ทั้งหมด? ยังไม่เคยประกาศใช้ จึงจะถูกลบออกจากทะเบียน`, 'ยืนยัน', 'red')) return;
      await api('DELETE', '/api/versions/' + v.id);
      toast('ดำเนินการแล้ว', 'ok'); loadTasks();
      location.hash = sop.current_version_id ? '#/v/' + sop.current_version_id : '#/sops'; break;
    }
    case 'copy': {
      const r = await modal({
        title: 'คัดลอกเป็น SOP ใหม่', ok: 'สร้างสำเนา',
        body: `<p class="muted small" style="margin-top:0">คัดลอกเนื้อหาทั้งหมดจาก ${esc(sop.sop_number)} ${esc(v.rev)} เป็น SOP ใหม่ (Rev.00 ฉบับร่าง)</p>
          <label class="f">แผนก</label><select class="in" id="cd">${deptOptions(isPriv() ? sop.department_id : S.me.department_id, { onlyCreatable: true })}</select><div style="height:10px"></div>
          <label class="f">SOP Number ใหม่</label><input class="in mono" id="cn"><div class="help">เว้นว่างเพื่อให้ระบบกำหนดเลขถัดไปอัตโนมัติ</div><div style="height:10px"></div>
          <label class="f">ชื่อ SOP</label><input class="in" id="ct" value="${esc(v.title + ' (สำเนา)')}">`,
        onOpen: ov => { const upd = async () => { const n = await api('GET', '/api/sops/next-number?dept=' + $('#cd', ov).value); $('#cn', ov).placeholder = n.sop_number; }; $('#cd', ov).onchange = upd; upd(); },
        onOk: ov => api('POST', `/api/sops/${sop.id}/copy`, { version_id: v.id, department_id: $('#cd', ov).value, sop_number: $('#cn', ov).value.trim(), title: $('#ct', ov).value.trim() }),
      });
      if (r) { toast('สร้างสำเนาแล้ว: ' + esc(r.sop_number), 'ok'); location.hash = '#/edit/' + r.version_id; } break;
    }
  }
}

/* ================= Editor ================= */
async function pageNew(main) {
  if (!canCreateAny()) throw new Error('คุณไม่มีสิทธิ์สร้าง SOP');
  const deptId = isPriv() ? (S.depts.find(d => d.active)?.id) : S.me.department_id;
  const blank = {
    sop: { id: null, sop_number: '', department_id: deptId, current_version_id: null },
    version: { id: null, revision: 0, rev: 'Rev.00', status: 'draft', title: '', row_ver: null, prepared_by: S.me.id, owner_id: S.me.id, reviewer_id: null, approver_id: null, effective_date: '', review_date: '', change_summary: 'จัดทำครั้งแรก (Initial issue)', content: { objective: '', scope: '', responsibility: '', equipment: '', safety: '', related_docs: '', kpi: '', keywords: '', steps: [{ id: crypto.randomUUID(), title: '', detail: '', images: [] }], attachments: [] } },
    files: [],
  };
  return renderEditor(main, blank, true);
}
async function pageEdit(main, vid) {
  const P = await api('GET', '/api/versions/' + vid);
  if (!P.permissions.canEdit) { location.replace('#/v/' + vid); return; }
  return renderEditor(main, P, false);
}

function renderEditor(main, P, isNew) {
  const sop = P.sop, v = P.version;
  const E = {
    sop_number: sop.sop_number, department_id: sop.department_id, title: v.title, owner_id: v.owner_id, reviewer_id: v.reviewer_id, approver_id: v.approver_id,
    effective_date: v.effective_date || '', review_date: v.review_date || '', change_summary: v.change_summary || '', row_ver: v.row_ver,
    content: JSON.parse(JSON.stringify(v.content)),
  };
  const files = new Map(P.files.map(f => [f.id, f]));
  const canChangeNumber = isNew || (!sop.current_version_id && v.revision === 0);
  const prep = v.prepared_by;
  const userOpts = (sel, roles, exclude, emptyLabel) => `<option value="">${emptyLabel}</option>` + S.users.filter(u => u.active && (!roles || roles.includes(u.role)) && u.id !== exclude)
    .map(u => `<option value="${u.id}" ${Number(sel) === u.id ? 'selected' : ''}>${esc(u.display_name)} — ${esc(ROLE_LABEL[u.role])}${u.department_id ? ' (' + esc(deptById(u.department_id)?.code || '') + ')' : ''}</option>`).join('');
  const ta = (key, label, rows = 3, ph = '', req = false) => `<div><label class="f">${label}${req ? ' <span class="req">*</span>' : ''}</label><textarea class="in" data-c="${key}" rows="${rows}" placeholder="${esc(ph)}">${esc(E.content[key])}</textarea></div>`;

  const root = document.createElement('div'); main.innerHTML = ''; main.appendChild(root);
  root.innerHTML = `<div class="page-head"><div class="grow"><div class="crumb"><a href="#/sops">ทะเบียน SOP</a> / ${isNew ? 'สร้างใหม่' : `<a href="#/v/${v.id}">${esc(sop.sop_number)}</a> / แก้ไข`}</div>
      <h1>${isNew ? 'สร้าง SOP ใหม่' : `แก้ไข ${esc(sop.sop_number)} ${esc(v.rev)}`}</h1>
      <div class="presence" id="presence" data-match="${v.id || 'new'}" style="margin-top:6px"></div></div></div>
    <div class="ed-bar"><span id="dirtyMark" class="small muted">ยังไม่มีการแก้ไข</span><span class="spacer"></span>
      ${isNew ? '' : `<a class="btn" href="#/v/${v.id}">ปิด</a>`}
      <button class="btn primary" id="save">${ic('check')} บันทึก</button>
      <button class="btn accent" id="saveSubmit">${ic('send')} บันทึกและส่งตรวจ</button></div>
    <div id="edBanner"></div>
    ${v.status === 'revision_required' ? (() => { const r = P.log?.find(l => l.version_id === v.id && l.action === 'return'); return r ? `<div class="banner err">${ic('back')}<div><b>ถูกส่งกลับแก้ไขโดย ${esc(r.user_name)}</b><div style="white-space:pre-wrap">เหตุผล: ${esc(r.comment)}</div></div></div>` : ''; })() : ''}
    <div class="card ed-sec"><div class="hd"><h3>ข้อมูลเอกสาร</h3></div><div class="bd grid g3">
      <div><label class="f">Department <span class="req">*</span></label><select class="in" data-f="department_id" ${canChangeNumber ? '' : 'disabled'}>${deptOptions(E.department_id, { onlyCreatable: true })}</select></div>
      <div><label class="f">SOP Number <span class="req">*</span></label><input class="in mono" data-f="sop_number" value="${esc(E.sop_number)}" ${canChangeNumber ? '' : 'readonly'} placeholder="กำหนดอัตโนมัติ"><div class="help">${canChangeNumber ? 'เว้นว่างเพื่อให้ระบบออกเลขถัดไป' : 'เปลี่ยนไม่ได้หลังประกาศใช้'}</div></div>
      <div><label class="f">Revision</label><input class="in" value="${esc(v.rev)}" readonly></div>
      <div style="grid-column:1/-1"><label class="f">SOP Title <span class="req">*</span></label><input class="in" data-f="title" value="${esc(E.title)}" placeholder="เช่น ขั้นตอนการหยิบสินค้า (Picking) ตามใบสั่งจ่าย"></div>
      <div><label class="f">ผู้รับผิดชอบ (Owner) <span class="req">*</span></label><select class="in" data-f="owner_id">${userOpts(E.owner_id, null, null, '— เลือก —')}</select></div>
      <div><label class="f">ผู้ตรวจสอบ (Reviewer)</label><select class="in" data-f="reviewer_id">${userOpts(E.reviewer_id, ['dept_head', 'manager', 'admin'], prep, '— หัวหน้าแผนกคนใดก็ได้ —')}</select></div>
      <div><label class="f">ผู้อนุมัติ (Approver)</label><select class="in" data-f="approver_id">${userOpts(E.approver_id, ['manager', 'admin'], prep, '— Manager คนใดก็ได้ —')}</select></div>
      <div><label class="f">Effective Date (วันเริ่มใช้) <span class="req">*</span></label><input class="in" type="date" data-f="effective_date" value="${esc(E.effective_date)}"></div>
      <div><label class="f">Review Date (วันทบทวน) <span class="req">*</span></label><div class="row" style="flex-wrap:nowrap"><input class="in" type="date" data-f="review_date" value="${esc(E.review_date)}"><button class="btn sm" type="button" id="plus1y" title="ตั้งเป็น ${S.settings.default_review_months} เดือนหลังวันเริ่มใช้">+${S.settings.default_review_months} ด.</button></div></div>
      <div><label class="f">Keywords (คำสำคัญสำหรับค้นหา)</label><input class="in" data-c="keywords" value="${esc(E.content.keywords)}" placeholder="คั่นด้วยจุลภาค เช่น picking, RF scanner"></div>
      <div style="grid-column:1/-1"><label class="f">รายละเอียดการแก้ไข (Change Summary)${v.revision > 0 ? ' <span class="req">*</span>' : ''}</label><textarea class="in" data-f="change_summary" rows="2" placeholder="ระบุสิ่งที่เปลี่ยนแปลงจากฉบับก่อน">${esc(E.change_summary)}</textarea></div>
    </div></div>
    <div class="card ed-sec"><div class="hd"><h3>รายละเอียด SOP</h3></div><div class="bd grid g2">
      ${ta('objective', 'Objective (วัตถุประสงค์)', 3, '', true)}${ta('scope', 'Scope (ขอบเขต)', 3, '', true)}
      ${ta('responsibility', 'Responsibility (ความรับผิดชอบ)', 4, 'เช่น\nหัวหน้าแผนก: ...\nพนักงาน: ...', true)}${ta('equipment', 'Equipment / Tools (อุปกรณ์/เครื่องมือ)', 4, 'เช่น RF Scanner, รถลากพาเลท, ใบ Pick List')}
      ${ta('safety', 'Safety Requirements (ความปลอดภัย)', 4, 'เช่น สวมรองเท้าเซฟตี้ เสื้อสะท้อนแสง')}${ta('kpi', 'KPI / Standard (ตัวชี้วัด/มาตรฐาน)', 4, 'เช่น Picking Accuracy ≥ 99.8%')}
    </div></div>
    <div class="card ed-sec"><div class="hd"><h3>Work Instructions (ขั้นตอนการปฏิบัติงาน) <span class="req" style="color:var(--red)">*</span></h3><span class="spacer"></span><span class="small muted">ลากที่ ⋮⋮ เพื่อจัดลำดับ</span></div><div class="bd">
      <div class="steps-ed" id="steps"></div><button class="btn" type="button" id="addStep">${ic('plus')} เพิ่มขั้นตอน</button></div></div>
    <div class="card ed-sec"><div class="hd"><h3>Related Documents & ไฟล์แนบ</h3></div><div class="bd grid">
      ${ta('related_docs', 'เอกสารที่เกี่ยวข้อง (Related Documents)', 3, 'เช่น WI-OB-001 คู่มือการใช้ RF Scanner, FM-OB-003 แบบฟอร์ม…')}
      <div><label class="f">ไฟล์แนบ (PDF, Word, Excel, PowerPoint, รูปภาพ — ไม่เกิน 25 MB/ไฟล์)</label><div id="atts"></div>
        <div class="drop" id="attDrop">${ic('clip')} คลิกหรือลากไฟล์มาวางที่นี่</div><input type="file" id="attIn" multiple class="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.xlsm,.ppt,.pptx,.csv,.txt,.png,.jpg,.jpeg,.gif,.webp,.zip"></div>
    </div></div>
    <div class="ed-bar" style="position:static;border:0;border-top:1px solid var(--line)"><span class="spacer"></span><button class="btn primary" id="save2">${ic('check')} บันทึก</button></div>`;

  const setDirty = (d = true) => { S.dirty = d; $('#dirtyMark').innerHTML = d ? '<b style="color:var(--amber)">● มีการแก้ไขที่ยังไม่บันทึก</b>' : 'บันทึกแล้ว ✓'; };
  // ผูกช่องข้อมูล
  root.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.f) { E[t.dataset.f] = t.value; setDirty(); }
    else if (t.dataset.c) { E.content[t.dataset.c] = t.value; setDirty(); }
    else if (t.dataset.st) { const [i, k] = t.dataset.st.split(':'); E.content.steps[i][k] = t.value; setDirty(); }
  });
  root.addEventListener('change', e => { if (e.target.dataset.f) { E[e.target.dataset.f] = e.target.value; setDirty(); } });
  if (canChangeNumber) $('[data-f=department_id]').addEventListener('change', async e => {
    const n = await api('GET', '/api/sops/next-number?dept=' + e.target.value).catch(() => ({}));
    $('[data-f=sop_number]').placeholder = n.sop_number || '';
  });
  if (canChangeNumber && !E.sop_number) api('GET', '/api/sops/next-number?dept=' + E.department_id).then(n => { $('[data-f=sop_number]').placeholder = n.sop_number; }).catch(() => { });
  $('#plus1y').onclick = () => { const v2 = addMonths(E.effective_date || todayStr(), Number(S.settings.default_review_months) || 12); E.review_date = v2; $('[data-f=review_date]').value = v2; setDirty(); };

  /* ----- steps ----- */
  const stepsEl = $('#steps');
  let dragFrom = null;
  function renderSteps() {
    const st = E.content.steps;
    stepsEl.innerHTML = st.map((s, i) => `<div class="st-card" draggable="false" data-i="${i}">
      <div class="st-head"><span class="handle" draggable="true" data-drag="${i}" title="ลากเพื่อย้าย">${ic('grip')}</span><span class="num">6.${i + 1}</span>
        <input class="in" data-st="${i}:title" value="${esc(s.title)}" placeholder="หัวข้อขั้นตอน เช่น รับใบ Pick List จากระบบ WMS">
        <button class="icon-btn" type="button" data-mv="${i}:-1" title="เลื่อนขึ้น" ${i === 0 ? 'disabled' : ''}>${ic('up')}</button>
        <button class="icon-btn" type="button" data-mv="${i}:1" title="เลื่อนลง" ${i === st.length - 1 ? 'disabled' : ''}>${ic('down')}</button>
        <button class="icon-btn" type="button" data-ins="${i}" title="แทรกขั้นตอนด้านล่าง">${ic('plus')}</button>
        <button class="icon-btn" type="button" data-del="${i}" title="ลบขั้นตอน" style="color:var(--red)">${ic('trash')}</button></div>
      <div class="st-body"><textarea class="in" data-st="${i}:detail" rows="3" placeholder="รายละเอียดวิธีปฏิบัติ จุดตรวจสอบ ข้อควรระวัง…">${esc(s.detail)}</textarea>
        <div class="thumbs">${s.images.map((fid, j) => `<div class="thumb"><img src="/api/files/${fid}" alt="" data-lb><button type="button" data-rmimg="${i}:${j}" title="ลบรูป">×</button></div>`).join('')}
          <label class="add-img">${ic('img')}<span>เพิ่มรูปภาพ</span><input type="file" accept="image/*" multiple class="hidden" data-addimg="${i}"></label></div></div></div>`).join('')
      || '<div class="empty">ยังไม่มีขั้นตอน — กด "เพิ่มขั้นตอน"</div>';
    $$('[data-lb]', stepsEl).forEach(img => img.onclick = () => lightbox(img.src));
  }
  const newStep = () => ({ id: crypto.randomUUID(), title: '', detail: '', images: [] });
  stepsEl.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const st = E.content.steps;
    if (b.dataset.mv) { const [i, d] = b.dataset.mv.split(':').map(Number); const j = i + d; if (j < 0 || j >= st.length) return; [st[i], st[j]] = [st[j], st[i]]; }
    else if (b.dataset.ins) st.splice(Number(b.dataset.ins) + 1, 0, newStep());
    else if (b.dataset.del) { const i = Number(b.dataset.del); if ((st[i].title || st[i].detail || st[i].images.length) && !confirm(`ลบขั้นตอน 6.${i + 1}?`)) return; st.splice(i, 1); }
    else if (b.dataset.rmimg) { const [i, j] = b.dataset.rmimg.split(':').map(Number); st[i].images.splice(j, 1); }
    else return;
    setDirty(); renderSteps();
  });
  stepsEl.addEventListener('change', async e => {
    const inp = e.target; if (!inp.dataset.addimg) return;
    const i = Number(inp.dataset.addimg);
    for (const f of inp.files) {
      try { const r = await uploadFile(f, true); files.set(r.id, r); E.content.steps[i].images.push(r.id); setDirty(); renderSteps(); }
      catch (err) { toastErr(err); }
    }
  });
  stepsEl.addEventListener('dragstart', e => { const h = e.target.closest('[data-drag]'); if (!h) return; dragFrom = Number(h.dataset.drag); const card = h.closest('.st-card'); card.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(dragFrom)); try { e.dataTransfer.setDragImage(card, 20, 20); } catch { } });
  stepsEl.addEventListener('dragover', e => { if (dragFrom == null) return; const c = e.target.closest('.st-card'); if (!c) return; e.preventDefault(); $$('.drag-over', stepsEl).forEach(x => x.classList.remove('drag-over')); c.classList.add('drag-over'); });
  stepsEl.addEventListener('drop', e => {
    if (dragFrom == null) return; const c = e.target.closest('.st-card'); if (!c) return; e.preventDefault();
    const to = Number(c.dataset.i); const st = E.content.steps; const [m] = st.splice(dragFrom, 1); st.splice(to, 0, m); dragFrom = null; setDirty(); renderSteps();
  });
  stepsEl.addEventListener('dragend', () => { dragFrom = null; $$('.dragging,.drag-over', stepsEl).forEach(x => x.classList.remove('dragging', 'drag-over')); });
  $('#addStep').onclick = () => { E.content.steps.push(newStep()); setDirty(); renderSteps(); const last = $$('.st-card', stepsEl).pop(); last && last.querySelector('input').focus(); };
  renderSteps();

  /* ----- attachments ----- */
  function renderAtts() {
    $('#atts').innerHTML = E.content.attachments.map((fid, i) => { const f = files.get(fid) || { name: 'ไฟล์ #' + fid, size: 0 }; return `<div class="att" style="margin:0 0 6px">${ic(fileIcon(f.name))}<span class="nm">${esc(f.name)}</span><span class="small muted">${f.size ? fmtSize(f.size) : ''}</span><a class="btn sm" href="/api/files/${fid}" target="_blank" rel="noopener">เปิด</a><button class="icon-btn" type="button" data-rmatt="${i}" title="นำออก" style="color:var(--red)">${ic('x')}</button></div>`; }).join('');
  }
  $('#atts').addEventListener('click', e => { const b = e.target.closest('[data-rmatt]'); if (!b) return; E.content.attachments.splice(Number(b.dataset.rmatt), 1); setDirty(); renderAtts(); });
  const addAtts = async list => { for (const f of list) { try { const r = await uploadFile(f, false); files.set(r.id, r); E.content.attachments.push(r.id); setDirty(); renderAtts(); toast('อัปโหลด ' + esc(f.name) + ' แล้ว', 'ok', 2000); } catch (err) { toastErr(err); } } };
  const drop = $('#attDrop');
  drop.onclick = () => $('#attIn').click();
  $('#attIn').onchange = e => { addAtts([...e.target.files]); e.target.value = ''; };
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); addAtts([...e.dataTransfer.files]); };
  renderAtts();

  /* ----- save ----- */
  let saving = false;
  async function save(andSubmit) {
    if (saving) return; saving = true;
    $$('#save,#save2,#saveSubmit').forEach(b => b.disabled = true);
    try {
      if (!E.title.trim()) throw new Error('กรุณาระบุ SOP Title');
      const body = { ...E, content: { ...E.content, steps: E.content.steps.filter(s => s.title.trim() || s.detail.trim() || s.images.length) } };
      let vid = v.id;
      if (isNew) {
        const r = await api('POST', '/api/sops', body);
        vid = r.version_id; S.dirty = false;
        toast(`สร้าง ${esc(r.sop_number)} แล้ว`, 'ok');
      } else {
        const r = await api('PUT', '/api/versions/' + v.id, body);
        E.row_ver = r.row_ver; setDirty(false); toast('บันทึกแล้ว', 'ok', 2000);
      }
      if (andSubmit) {
        const c = await askText('ส่ง SOP ให้ตรวจสอบ', 'หมายเหตุถึงผู้ตรวจสอบ (ถ้ามี)', { required: false, ok: 'ส่งตรวจ', okClass: 'accent' });
        if (c !== null) {
          try { await api('POST', `/api/versions/${vid}/action`, { action: 'submit', comment: c }); toast('ส่งตรวจแล้ว', 'ok'); S.dirty = false; location.hash = '#/v/' + vid; return; }
          catch (err) { toastErr(err); }
        }
      }
      if (isNew) { location.hash = '#/edit/' + vid; }
    } catch (e) {
      toastErr(e);
      if (e.status === 409 && !isNew) $('#edBanner').innerHTML = `<div class="banner err">${ic('alert')}<div>${esc(e.message)} <button class="btn sm" onclick="S.dirty=false;route()">โหลดฉบับล่าสุด</button></div></div>`;
    } finally { saving = false; $$('#save,#save2,#saveSubmit').forEach(b => b && (b.disabled = false)); }
  }
  $('#save').onclick = () => save(false);
  $('#save2').onclick = () => save(false);
  $('#saveSubmit').onclick = () => save(true);
  const keyH = e => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); if ($('#save')) save(false); else document.removeEventListener('keydown', keyH); } };
  document.addEventListener('keydown', keyH);
  // ผู้อื่นบันทึกเอกสารเดียวกัน
  S.refresh = (m) => {
    if (!isNew && m && m.version_id === v.id && m.by !== S.me.id)
      $('#edBanner').innerHTML = `<div class="banner warn">${ic('alert')}<div>มีผู้ใช้อื่นบันทึก/เปลี่ยนสถานะเอกสารนี้ระหว่างที่คุณแก้ไข — ถ้าบันทึกอาจชนกัน <button class="btn sm" onclick="S.dirty=false;route()">โหลดฉบับล่าสุด</button></div></div>`;
  };
  renderPresence();
}

/* ย่อรูป/แปลงเป็น JPEG ก่อนอัปโหลด เพื่อให้ไฟล์เล็กและฝังใน Word ได้ */
async function uploadFile(file, imageOnly) {
  if (file.size > 25 * 1024 * 1024) throw new Error(`${file.name}: ใหญ่เกิน 25 MB`);
  let name = file.name, mime = file.type || 'application/octet-stream', blob = file;
  if (/^image\//.test(mime)) {
    const keepPng = mime === 'image/png' && file.size < 1.5 * 1024 * 1024;
    const bmp = await createImageBitmap(file).catch(() => null);
    if (bmp && (!keepPng || Math.max(bmp.width, bmp.height) > 1800)) {
      const sc = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * sc); cv.height = Math.round(bmp.height * sc);
      const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(bmp, 0, 0, cv.width, cv.height);
      blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.86)); mime = 'image/jpeg'; name = name.replace(/\.\w+$/, '') + '.jpg';
    }
  } else if (imageOnly) throw new Error('กรุณาเลือกไฟล์รูปภาพ');
  const data = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(blob); });
  return api('POST', '/api/files', { name, mime, data });
}

/* ================= Compare ================= */
async function pageCompare(main, sopId) {
  const q = qs();
  const P = await api('GET', '/api/sops/' + sopId);
  const vers = P.versions;
  if (vers.length < 2) { main.innerHTML = '<div class="empty">มีเพียงเวอร์ชันเดียว</div>'; return; }
  const a = q.a || vers[1].id, b = q.b || vers[0].id;
  const opt = sel => vers.map(x => `<option value="${x.id}" ${Number(sel) === x.id ? 'selected' : ''}>${esc(x.rev)} — ${esc(stLabel(x.status))}</option>`).join('');
  main.innerHTML = `<div class="page-head"><div class="grow"><div class="crumb"><a href="#/sops">ทะเบียน SOP</a> / <a href="#/v/${P.version.id}">${esc(P.sop.sop_number)}</a> / เปรียบเทียบ</div><h1>เปรียบเทียบเวอร์ชัน ${esc(P.sop.sop_number)}</h1></div></div>
    <div class="filters"><label class="fi"><span>ฉบับเดิม (A)</span><select class="in" id="ca">${opt(a)}</select></label><label class="fi"><span>ฉบับใหม่ (B)</span><select class="in" id="cb">${opt(b)}</select></label>
      <label class="row small" style="align-self:center"><input type="checkbox" id="conly" checked> แสดงเฉพาะหัวข้อที่เปลี่ยน</label>
      <span class="legend" style="align-self:center"><span><del>ข้อความที่ถูกลบ</del></span><span><ins>ข้อความที่เพิ่ม</ins></span></span></div><div id="cbody"><div class="empty">กำลังโหลด…</div></div>`;
  const run = async () => {
    const [A, B] = await Promise.all([api('GET', '/api/versions/' + $('#ca').value), api('GET', '/api/versions/' + $('#cb').value)]);
    setQs({ a: $('#ca').value, b: $('#cb').value });
    const va = A.version, vb = B.version, ca = va.content, cb = vb.content;
    const fnames = new Map([...A.files, ...B.files].map(f => [f.id, f.name]));
    const un = id => userById(id)?.display_name || '-';
    const fields = [
      ['SOP Title', va.title, vb.title], ['Effective Date', fmtD(va.effective_date), fmtD(vb.effective_date)], ['Review Date', fmtD(va.review_date), fmtD(vb.review_date)],
      ['ผู้รับผิดชอบ', un(va.owner_id), un(vb.owner_id)], ['Change Summary', va.change_summary, vb.change_summary],
      ['Objective', ca.objective, cb.objective], ['Scope', ca.scope, cb.scope], ['Responsibility', ca.responsibility, cb.responsibility],
      ['Equipment / Tools', ca.equipment, cb.equipment], ['Safety Requirements', ca.safety, cb.safety],
    ];
    const stepTxt = s => s ? `${s.title}\n${s.detail}${s.images.length ? `\n[รูปภาพ ${s.images.length} รูป]` : ''}` : '';
    const ids = []; [...ca.steps, ...cb.steps].forEach(s => { if (!ids.includes(s.id)) ids.push(s.id); });
    const stepRows = ids.map(id => {
      const sa = ca.steps.find(s => s.id === id), sb = cb.steps.find(s => s.id === id);
      const ia = ca.steps.indexOf(sa) + 1, ib = cb.steps.indexOf(sb) + 1;
      const lbl = sa && sb ? (ia === ib ? `ขั้นตอน 6.${ib}` : `ขั้นตอน 6.${ia} → 6.${ib} (ย้ายลำดับ)`) : sb ? `ขั้นตอน 6.${ib} (เพิ่มใหม่)` : `ขั้นตอน 6.${ia} (ถูกลบ)`;
      return [lbl, stepTxt(sa), stepTxt(sb), sa && sb && ia !== ib];
    });
    const rest = [['Related Documents', ca.related_docs, cb.related_docs], ['ไฟล์แนบ', ca.attachments.map(i => fnames.get(i)).join('\n'), cb.attachments.map(i => fnames.get(i)).join('\n')], ['KPI / Standard', ca.kpi, cb.kpi], ['Keywords', ca.keywords, cb.keywords]];
    const only = $('#conly').checked;
    const block = ([lbl, x, y, moved]) => {
      const same = String(x || '') === String(y || '') && !moved;
      if (same && only) return '';
      return `<div class="diff-f ${same ? 'chg-same' : ''}"><div class="h">${esc(lbl)}${same ? ' <span class="muted">— ไม่เปลี่ยนแปลง</span>' : ''}</div><div class="b">${same ? esc(x || '-') : SopDiff.diffHtml(x, y) || '-'}</div></div>`;
    };
    const html = [...fields, ...stepRows, ...rest].map(block).join('');
    $('#cbody').innerHTML = `<div class="card"><div class="hd"><h3>${esc(va.rev)} ${stBadge(va.status)} → ${esc(vb.rev)} ${stBadge(vb.status)}</h3></div><div class="bd">${html || '<div class="empty">ไม่มีความแตกต่าง</div>'}</div></div>`;
  };
  $('#ca').onchange = $('#cb').onchange = $('#conly').onchange = () => run().catch(toastErr);
  await run();
}

/* ================= Admin: departments ================= */
async function pageDepts(main) {
  if (S.me.role !== 'admin') throw new Error('เฉพาะผู้ดูแลระบบ');
  const load = async () => {
    await loadBootstrap();
    const sops = await api('GET', '/api/sops');
    const cnt = id => sops.filter(s => s.department_id === id).length;
    const ucnt = id => S.users.filter(u => u.department_id === id).length;
    main.innerHTML = `<div class="page-head"><div><h1>จัดการแผนก</h1><div class="sub">เพิ่ม แก้ไข ปิดใช้งาน หรือลบแผนก — ไม่ต้องแก้ไขโค้ดโปรแกรม</div></div><span class="spacer"></span><button class="btn accent" id="addD">${ic('plus')} เพิ่มแผนก</button></div>
      <div class="card"><div class="table-wrap"><table class="t"><thead><tr><th>ลำดับ</th><th>รหัส</th><th>ชื่อแผนก</th><th>คำอธิบาย</th><th>SOP</th><th>ผู้ใช้</th><th>สถานะ</th><th></th></tr></thead><tbody>
      ${S.depts.map(d => `<tr><td>${d.sort}</td><td><span class="tag">${esc(d.code)}</span></td><td><b>${esc(d.name)}</b></td><td class="small">${esc(d.description)}</td><td>${cnt(d.id)}</td><td>${ucnt(d.id)}</td>
        <td>${d.active ? '<span class="badge-st st-published">ใช้งาน</span>' : '<span class="badge-st st-obsolete">ปิดใช้งาน</span>'}</td>
        <td class="nowrap"><button class="btn sm" data-ed="${d.id}">${ic('edit')} แก้ไข</button> <button class="btn sm" data-tg="${d.id}">${d.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}</button> <button class="btn sm danger" data-rm="${d.id}">${ic('trash')}</button></td></tr>`).join('')}</tbody></table></div></div>`;
    $('#addD').onclick = () => deptForm();
    $$('[data-ed]').forEach(b => b.onclick = () => deptForm(S.depts.find(d => d.id === Number(b.dataset.ed))));
    $$('[data-tg]').forEach(b => b.onclick = async () => { const d = S.depts.find(x => x.id === Number(b.dataset.tg)); try { await api('PUT', '/api/departments/' + d.id, { active: !d.active }); toast('อัปเดตแล้ว', 'ok'); load(); } catch (e) { toastErr(e); } });
    $$('[data-rm]').forEach(b => b.onclick = async () => { const d = S.depts.find(x => x.id === Number(b.dataset.rm)); if (!await confirmBox('ลบแผนก', `ลบแผนก ${esc(d.code)} – ${esc(d.name)}?`, 'ลบ', 'red')) return; try { await api('DELETE', '/api/departments/' + d.id); toast('ลบแล้ว', 'ok'); load(); } catch (e) { toastErr(e); } });
  };
  const deptForm = d => modal({
    title: d ? 'แก้ไขแผนก' : 'เพิ่มแผนก', ok: 'บันทึก',
    body: `<div class="grid g2"><div><label class="f">รหัสแผนก <span class="req">*</span></label><input class="in mono" id="dc" value="${esc(d?.code || '')}" placeholder="เช่น QA"><div class="help">ใช้ขึ้นต้นเลข SOP เช่น QA-SOP-001</div></div>
      <div><label class="f">ลำดับการแสดง</label><input class="in" type="number" id="ds" value="${d?.sort ?? ''}"></div></div><div style="height:10px"></div>
      <label class="f">ชื่อแผนก <span class="req">*</span></label><input class="in" id="dn" value="${esc(d?.name || '')}"><div style="height:10px"></div>
      <label class="f">คำอธิบาย</label><textarea class="in" id="dd" rows="2">${esc(d?.description || '')}</textarea>`,
    onOk: async ov => {
      const body = { code: $('#dc', ov).value, name: $('#dn', ov).value, description: $('#dd', ov).value };
      if ($('#ds', ov).value !== '') body.sort = Number($('#ds', ov).value);
      if (d) await api('PUT', '/api/departments/' + d.id, body); else await api('POST', '/api/departments', body);
      toast('บันทึกแล้ว', 'ok'); load();
    },
  });
  S.refresh = () => load().catch(() => { });
  await load();
}

/* ================= Admin: users ================= */
async function pageUsers(main) {
  if (S.me.role !== 'admin') throw new Error('เฉพาะผู้ดูแลระบบ');
  const load = async () => {
    await loadBootstrap();
    main.innerHTML = `<div class="page-head"><div><h1>ผู้ใช้งานและสิทธิ์</h1><div class="sub">กำหนดบทบาทและแผนกของผู้ใช้แต่ละคน</div></div><span class="spacer"></span><button class="btn accent" id="addU">${ic('plus')} เพิ่มผู้ใช้</button></div>
      <div class="card" style="margin-bottom:16px"><div class="bd small">
        <b>บทบาท:</b> <b>ผู้ดูแลระบบ</b> จัดการแผนก/ผู้ใช้/ตั้งค่า และทำงานแทนผู้จัดการได้ ·
        <b>Warehouse Operations Manager</b> อนุมัติ/ยกเลิก SOP ทุกแผนก ·
        <b>หัวหน้าแผนก</b> จัดทำและตรวจสอบ SOP ของแผนกตน ·
        <b>ผู้จัดทำ</b> สร้าง/แก้ไข SOP ของแผนกตน ·
        <b>ผู้อ่าน</b> ดูเฉพาะ SOP ที่ประกาศใช้แล้ว. <span class="muted">ทุกบทบาทอนุมัติ SOP ที่ตนจัดทำเองไม่ได้</span></div></div>
      <div class="card"><div class="table-wrap"><table class="t"><thead><tr><th>ชื่อผู้ใช้</th><th>ชื่อ-นามสกุล</th><th>ตำแหน่ง</th><th>บทบาท</th><th>แผนก</th><th>เข้าใช้ล่าสุด</th><th>สถานะ</th><th></th></tr></thead><tbody>
      ${S.users.map(u => `<tr><td class="mono">${esc(u.username)}</td><td><b>${esc(u.display_name)}</b>${u.must_change_pw ? '<div class="small" style="color:var(--amber)">รอเปลี่ยนรหัสผ่าน</div>' : ''}</td><td class="small">${esc(u.position)}</td>
        <td>${esc(ROLE_LABEL[u.role])}</td><td>${u.department_id ? `<span class="tag">${esc(deptById(u.department_id)?.code || '')}</span>` : '-'}</td>
        <td class="small muted">${u.last_login ? fmtDT(u.last_login) : '-'}</td><td>${u.active ? '<span class="badge-st st-published">ใช้งาน</span>' : '<span class="badge-st st-obsolete">ปิดใช้งาน</span>'}</td>
        <td class="nowrap"><button class="btn sm" data-ed="${u.id}">${ic('edit')} แก้ไข</button></td></tr>`).join('')}</tbody></table></div></div>`;
    $('#addU').onclick = () => userForm();
    $$('[data-ed]').forEach(b => b.onclick = () => userForm(S.users.find(u => u.id === Number(b.dataset.ed))));
  };
  const userForm = u => modal({
    title: u ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้', ok: 'บันทึก',
    body: `<div class="grid g2">
      <div><label class="f">ชื่อผู้ใช้ (Login) <span class="req">*</span></label><input class="in mono" id="uu" value="${esc(u?.username || '')}" ${u ? 'readonly' : ''}></div>
      <div><label class="f">${u ? 'รีเซ็ตรหัสผ่าน (เว้นว่าง = ไม่เปลี่ยน)' : 'รหัสผ่านเริ่มต้น <span class="req">*</span>'}</label><input class="in" id="up" type="text" autocomplete="off" placeholder="อย่างน้อย 8 ตัว"></div>
      <div><label class="f">ชื่อ-นามสกุล <span class="req">*</span></label><input class="in" id="un" value="${esc(u?.display_name || '')}"></div>
      <div><label class="f">ตำแหน่ง</label><input class="in" id="upos" value="${esc(u?.position || '')}"></div>
      <div><label class="f">บทบาท <span class="req">*</span></label><select class="in" id="ur">${Object.entries(ROLE_LABEL).map(([k, l]) => `<option value="${k}" ${u?.role === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div><label class="f">แผนก</label><select class="in" id="ud"><option value="">— ไม่สังกัดแผนก —</option>${deptOptions(u?.department_id)}</select></div>
      <div><label class="f">อีเมล</label><input class="in" id="ue" value="${esc(u?.email || '')}"></div>
      ${u ? `<div><label class="f">สถานะ</label><select class="in" id="ua"><option value="1" ${u.active ? 'selected' : ''}>ใช้งาน</option><option value="0" ${u.active ? '' : 'selected'}>ปิดใช้งาน</option></select></div>` : ''}
      </div><p class="help">ผู้ใช้จะถูกบังคับให้เปลี่ยนรหัสผ่านเมื่อเข้าใช้ครั้งแรกหรือหลังรีเซ็ต</p>`,
    onOk: async ov => {
      const body = { username: $('#uu', ov).value.trim(), display_name: $('#un', ov).value, position: $('#upos', ov).value, role: $('#ur', ov).value, department_id: $('#ud', ov).value || null, email: $('#ue', ov).value };
      const pw = $('#up', ov).value; if (pw) body.password = pw;
      if (u) { body.active = $('#ua', ov).value === '1'; await api('PUT', '/api/users/' + u.id, body); }
      else await api('POST', '/api/users', body);
      toast('บันทึกแล้ว', 'ok'); load();
    },
  });
  S.refresh = () => load().catch(() => { });
  await load();
}

/* ================= Admin: settings ================= */
async function pageSettings(main) {
  if (S.me.role !== 'admin') throw new Error('เฉพาะผู้ดูแลระบบ');
  await loadBootstrap();
  const st = { ...S.settings };
  main.innerHTML = `<div class="page-head"><div><h1>ตั้งค่าองค์กร</h1><div class="sub">ข้อมูลที่ใช้บนหัวกระดาษเอกสาร SOP และค่าการแจ้งเตือน</div></div></div>
    <div class="card" style="max-width:820px"><div class="bd grid g2">
      <div><label class="f">ชื่อบริษัท (ไทย)</label><input class="in" id="s1" value="${esc(st.company_name)}"></div>
      <div><label class="f">ชื่อบริษัท (อังกฤษ)</label><input class="in" id="s2" value="${esc(st.company_name_en)}"></div>
      <div><label class="f">โลโก้ (PNG/JPG)</label><div class="row"><img id="lg" src="${logoUrl()}" style="height:52px;max-width:140px;object-fit:contain;border:1px solid var(--line);border-radius:8px;padding:4px;background:#fff">
        <label class="btn sm">${ic('img')} เลือกไฟล์<input type="file" accept="image/png,image/jpeg" class="hidden" id="lgIn"></label><button class="btn sm" id="lgRm">ลบโลโก้</button></div></div>
      <div><label class="f">ฟอนต์ในไฟล์ Word</label><select class="in" id="s6">${['Tahoma', 'TH Sarabun New', 'TH SarabunPSK', 'Leelawadee UI', 'Angsana New', 'Cordia New'].map(f => `<option ${st.doc_font === f ? 'selected' : ''}>${f}</option>`).join('')}</select><div class="help">ฟอนต์ต้องติดตั้งในเครื่องที่เปิดไฟล์</div></div>
      <div><label class="f">แจ้งเตือนก่อนถึงวันทบทวน (วัน)</label><input class="in" type="number" min="1" id="s4" value="${esc(st.review_warn_days)}"></div>
      <div><label class="f">รอบทบทวนเริ่มต้น (เดือน)</label><input class="in" type="number" min="1" id="s5" value="${esc(st.default_review_months)}"></div>
      <div style="grid-column:1/-1"><button class="btn primary" id="sv">${ic('check')} บันทึกการตั้งค่า</button></div></div></div>`;
  $('#lgIn').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { const r = await uploadFile(f, true); st.logo_file_id = String(r.id); $('#lg').src = '/api/files/' + r.id; toast('อัปโหลดโลโก้แล้ว กด "บันทึก" เพื่อใช้งาน', 'ok'); } catch (err) { toastErr(err); }
  };
  $('#lgRm').onclick = () => { st.logo_file_id = ''; $('#lg').src = 'icon.svg'; };
  $('#sv').onclick = async () => {
    try {
      await api('PUT', '/api/settings', { company_name: $('#s1').value, company_name_en: $('#s2').value, logo_file_id: st.logo_file_id, doc_font: $('#s6').value, review_warn_days: $('#s4').value, default_review_months: $('#s5').value });
      await loadBootstrap(); renderShellParts(); toast('บันทึกการตั้งค่าแล้ว', 'ok');
    } catch (e) { toastErr(e); }
  };
}
async function pageAudit(main) {
  const list = await api('GET', '/api/audit?limit=500');
  const AL = { login: 'เข้าสู่ระบบ', change_password: 'เปลี่ยนรหัสผ่าน', create: 'สร้าง', update: 'แก้ไข', delete: 'ลบ', 'update+reset_password': 'แก้ไข + รีเซ็ตรหัสผ่าน', export_docx: 'ส่งออก Word', export_xlsx: 'ส่งออก Excel', print: 'พิมพ์/PDF', delete_draft: 'ลบฉบับร่าง' };
  main.innerHTML = `<div class="page-head"><div><h1>Audit Log</h1><div class="sub">บันทึกการเข้าใช้ การตั้งค่า และการส่งออกเอกสาร (500 รายการล่าสุด)</div></div></div>
    <div class="card"><div class="table-wrap"><table class="t"><thead><tr><th>วันเวลา</th><th>ผู้ใช้</th><th>รายการ</th><th>ประเภท</th><th>รายละเอียด</th></tr></thead><tbody>
    ${list.map(a => `<tr><td class="nowrap small">${fmtDT(a.at)}</td><td>${esc(a.user_name)}</td><td>${esc(AL[a.action] || a.action)}</td><td class="small">${esc(a.entity)} #${a.entity_id}</td><td class="small mono" style="max-width:420px;overflow-wrap:anywhere">${esc(a.detail)}</td></tr>`).join('')}</tbody></table></div></div>`;
}

/* ================= start ================= */
boot();
