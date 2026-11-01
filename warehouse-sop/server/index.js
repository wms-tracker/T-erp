'use strict';
/* ============================================================
   Warehouse SOP Management System — Server
   Node.js 22+ (ไม่ต้องติดตั้ง package เพิ่ม) • SQLite • Session auth • Real-time (SSE)
   รัน:  node server/index.js     แล้วเปิด http://localhost:5300
   ============================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const D = require('./db');
const { all, get, run, tx, now, today, getSetting, setSetting } = D;
const { buildDocx, imageInfo } = require('./docx');
const { buildXlsx } = require('./xlsx');

const PORT = Number(process.env.PORT) || 5300;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC = path.join(__dirname, '..', 'public');
const SESSION_DAYS = 7;
const MAX_BODY = 40 * 1024 * 1024;

/* ---------- ค่าคงที่ ---------- */
const ROLES = ['admin', 'manager', 'dept_head', 'author', 'viewer'];
const STATUS = {
  draft: 'ฉบับร่าง (Draft)', submitted: 'ส่งตรวจ (Submitted)', dept_review: 'หัวหน้าแผนกตรวจสอบ (Department Review)',
  manager_approval: 'รอผู้จัดการอนุมัติ (Manager Approval)', published: 'ประกาศใช้ (Published)',
  revision_required: 'ส่งกลับแก้ไข (Revision Required)', obsolete: 'ยกเลิกใช้งาน (Obsolete)',
  superseded: 'ถูกแทนที่ด้วยฉบับใหม่ (Superseded)', cancelled: 'ยกเลิกร่าง (Cancelled)',
};
const WORK_STATUSES = ['draft', 'submitted', 'dept_review', 'manager_approval', 'revision_required'];
const PUBLIC_STATUSES = ['published', 'superseded', 'obsolete'];
const revLabel = r => 'Rev.' + String(r).padStart(2, '0');

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const fail = (s, m) => { throw new HttpError(s, m); };

/* ---------- Real-time: Server-Sent Events + presence ---------- */
const clients = new Map(); // id -> { res, userId, path }
function broadcast(evt) {
  const data = `data: ${JSON.stringify(evt)}\n\n`;
  for (const c of clients.values()) { try { c.res.write(data); } catch { } }
}
function presenceList() {
  const seen = new Map();
  for (const c of clients.values()) {
    const u = userBrief(c.userId); if (!u) continue;
    const key = c.userId + '|' + (c.path || '');
    if (!seen.has(key)) seen.set(key, { user_id: c.userId, name: u.display_name, path: c.path || '' });
  }
  return [...seen.values()];
}
let presenceTimer = null;
function schedulePresence() {
  clearTimeout(presenceTimer);
  presenceTimer = setTimeout(() => broadcast({ type: 'presence', list: presenceList() }), 300);
}
setInterval(() => { for (const c of clients.values()) { try { c.res.write(': ping\n\n'); } catch { } } }, 25000);

/* ---------- ผู้ใช้ / สิทธิ์ ---------- */
const userCache = new Map();
function userBrief(id) {
  if (!id) return null;
  if (!userCache.has(id)) userCache.set(id, get('SELECT id,display_name,position,role,department_id,active FROM users WHERE id=?', id) || null);
  return userCache.get(id);
}
const uname = id => userBrief(id)?.display_name || '';
const isPriv = u => u.role === 'admin' || u.role === 'manager';
const inDept = (u, deptId) => u.department_id != null && Number(u.department_id) === Number(deptId);
const editorsOf = v => { try { return JSON.parse(v.editors || '[]'); } catch { return []; } };

function canSeeWork(u, sop, v) {
  if (isPriv(u)) return true;
  if (v && [v.prepared_by, v.owner_id, v.reviewer_id, v.approver_id].includes(u.id)) return true;
  return (u.role === 'author' || u.role === 'dept_head') && inDept(u, sop.department_id);
}
function canSeeVersion(u, sop, v) { return PUBLIC_STATUSES.includes(v.status) || canSeeWork(u, sop, v); }
function canCreateIn(u, deptId) { return isPriv(u) || ((u.role === 'author' || u.role === 'dept_head') && inDept(u, deptId)); }
function canEdit(u, sop, v) {
  if (!['draft', 'revision_required'].includes(v.status) || v.locked) return false;
  if (isPriv(u) || v.prepared_by === u.id) return true;
  return u.role === 'dept_head' && inDept(u, sop.department_id);
}
function separationIssue(u, v) {
  if (v.prepared_by === u.id) return 'ผู้จัดทำไม่สามารถตรวจสอบ/อนุมัติ SOP ของตนเองได้';
  if (editorsOf(v).includes(u.id)) return 'ผู้ที่ร่วมแก้ไขเนื้อหาฉบับนี้ไม่สามารถตรวจสอบ/อนุมัติได้';
  return null;
}
function canReview(u, sop, v) {
  if (separationIssue(u, v)) return false;
  if (v.reviewer_id) return v.reviewer_id === u.id;
  return isPriv(u) || (u.role === 'dept_head' && inDept(u, sop.department_id));
}
function canApprove(u, sop, v) {
  if (separationIssue(u, v)) return false;
  if (!['manager', 'admin'].includes(u.role)) return false;
  return v.approver_id ? v.approver_id === u.id : true;
}

/* ---------- auth ---------- */
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}
function sessionUser(req) {
  const tok = parseCookies(req).sop_sess;
  if (!tok) return null;
  const s = get('SELECT user_id, expires_at FROM sessions WHERE token=?', tok);
  if (!s || s.expires_at < Date.now()) return null;
  const u = get('SELECT id,username,display_name,position,email,role,department_id,must_change_pw,active FROM users WHERE id=?', s.user_id);
  if (!u || !u.active) return null;
  u.token = tok;
  return u;
}
setInterval(() => run('DELETE FROM sessions WHERE expires_at<?', Date.now()), 3600 * 1000);

/* ---------- log ---------- */
function wlog(sopId, versionId, action, from, to, comment, userId) {
  run('INSERT INTO workflow_log(sop_id,version_id,action,from_status,to_status,comment,user_id,at) VALUES(?,?,?,?,?,?,?,?)', sopId, versionId, action, from, to, comment || '', userId, now());
}
function audit(entity, id, action, detail, userId) {
  run('INSERT INTO audit_log(entity,entity_id,action,detail,user_id,at) VALUES(?,?,?,?,?,?)', entity, id, action, typeof detail === 'string' ? detail : JSON.stringify(detail), userId, now());
}

/* ---------- SOP data ---------- */
const parseVersion = v => v && ({ ...v, content: JSON.parse(v.content || '{}') });
const getSop = id => get('SELECT s.*, d.code dept_code, d.name dept_name FROM sops s JOIN departments d ON d.id=s.department_id WHERE s.id=?', id);
const getVersion = id => get('SELECT * FROM sop_versions WHERE id=?', id);

function cleanContent(c = {}) {
  const str = (x, max = 20000) => String(x ?? '').slice(0, max);
  const ids = arr => (Array.isArray(arr) ? arr : []).map(Number).filter(n => Number.isInteger(n) && n > 0).slice(0, 200);
  return {
    objective: str(c.objective), scope: str(c.scope), responsibility: str(c.responsibility),
    equipment: str(c.equipment), safety: str(c.safety), related_docs: str(c.related_docs),
    kpi: str(c.kpi), keywords: str(c.keywords, 1000),
    steps: (Array.isArray(c.steps) ? c.steps : []).slice(0, 500).map(s => ({
      id: str(s.id || crypto.randomUUID(), 64), title: str(s.title, 500), detail: str(s.detail), images: ids(s.images),
    })),
    attachments: ids(c.attachments),
  };
}

function reviewState(dateStr) {
  if (!dateStr) return 'none';
  const t = today();
  if (dateStr < t) return 'overdue';
  const warn = Number(getSetting('review_warn_days', '30')) || 30;
  const lim = new Date(Date.now() + warn * 86400000).toLocaleDateString('sv-SE');
  return dateStr <= lim ? 'due_soon' : 'ok';
}

/** รายการ SOP ทั้งหมดที่ผู้ใช้มองเห็น (สรุป) */
function listSops(u) {
  const rows = all(`SELECT s.*, d.code dept_code, d.name dept_name,
      c.id c_id, c.revision c_rev, c.title c_title, c.status c_status, c.effective_date c_eff, c.owner_id c_owner, c.content c_content, c.approved_at c_appr, c.approved_by c_apprby, c.prepared_by c_prep, c.reviewed_by c_revby,
      w.id w_id, w.revision w_rev, w.title w_title, w.status w_status, w.updated_at w_upd, w.owner_id w_owner, w.content w_content, w.prepared_by w_prep, w.reviewer_id w_reviewer, w.approver_id w_approver
    FROM sops s JOIN departments d ON d.id=s.department_id
    LEFT JOIN sop_versions c ON c.id=s.current_version_id
    LEFT JOIN sop_versions w ON w.id=s.working_version_id
    ORDER BY s.sop_number`);
  const out = [];
  for (const r of rows) {
    const sop = { id: r.id, department_id: r.department_id };
    const wv = r.w_id ? { prepared_by: r.w_prep, owner_id: r.w_owner, reviewer_id: r.w_reviewer, approver_id: r.w_approver } : null;
    const seeWork = wv && canSeeWork(u, sop, wv);
    if (!r.c_id && !seeWork) continue;
    const current = r.c_id ? { id: r.c_id, revision: r.c_rev, rev: revLabel(r.c_rev), title: r.c_title, status: r.c_status, effective_date: r.c_eff, approved_at: r.c_appr } : null;
    const working = seeWork ? { id: r.w_id, revision: r.w_rev, rev: revLabel(r.w_rev), title: r.w_title, status: r.w_status, updated_at: r.w_upd } : null;
    let status = working ? working.status : (r.is_obsolete ? 'obsolete' : 'published');
    out.push({
      id: r.id, sop_number: r.sop_number, department_id: r.department_id, dept_code: r.dept_code, dept_name: r.dept_name,
      is_obsolete: !!r.is_obsolete, next_review_date: r.next_review_date,
      review_state: current && !r.is_obsolete ? reviewState(r.next_review_date) : 'none',
      title: working ? working.title : current.title, current, working, status,
      owner_id: (working ? r.w_owner : r.c_owner) || null, owner_name: uname((working ? r.w_owner : r.c_owner)),
      prepared_name: uname(r.c_prep), reviewed_name: uname(r.c_revby), approved_name: uname(r.c_apprby),
      updated_at: r.updated_at, created_at: r.created_at,
      _search: [r.sop_number, r.dept_code, r.dept_name, current?.title, working?.title, r.c_content, seeWork ? r.w_content : ''].join(' ').toLowerCase(),
    });
  }
  return out;
}
function filterSops(list, q) {
  let res = list;
  if (q.dept) res = res.filter(s => String(s.department_id) === String(q.dept));
  if (q.status) {
    const st = String(q.status);
    if (st === 'active') res = res.filter(s => s.current && !s.is_obsolete);
    else if (st === 'pending') res = res.filter(s => ['submitted', 'dept_review', 'manager_approval'].includes(s.working?.status));
    else if (st === 'overdue' || st === 'due_soon') res = res.filter(s => s.review_state === st);
    else if (st === 'published') res = res.filter(s => s.current && !s.is_obsolete && !s.working);
    else res = res.filter(s => s.status === st || s.working?.status === st);
  }
  if (q.from) res = res.filter(s => (s.updated_at || '').slice(0, 10) >= q.from);
  if (q.to) res = res.filter(s => (s.updated_at || '').slice(0, 10) <= q.to);
  if (q.q) {
    const terms = String(q.q).toLowerCase().split(/\s+/).filter(Boolean);
    res = res.filter(s => terms.every(t => s._search.includes(t)));
  }
  return res;
}
const stripSearch = l => l.map(({ _search, ...x }) => x);

function myTasks(u) {
  const rows = all(`SELECT v.*, s.sop_number, s.department_id, d.code dept_code FROM sop_versions v
    JOIN sops s ON s.working_version_id=v.id JOIN departments d ON d.id=s.department_id`);
  const tasks = [];
  for (const v of rows) {
    const sop = { id: v.sop_id, department_id: v.department_id };
    const base = { sop_id: v.sop_id, version_id: v.id, sop_number: v.sop_number, dept_code: v.dept_code, title: v.title, rev: revLabel(v.revision), status: v.status, updated_at: v.updated_at };
    if (['submitted', 'dept_review'].includes(v.status) && canReview(u, sop, v)) tasks.push({ ...base, kind: 'review', label: 'รอคุณตรวจสอบ' });
    else if (v.status === 'manager_approval' && canApprove(u, sop, v)) tasks.push({ ...base, kind: 'approve', label: 'รอคุณอนุมัติ' });
    else if (v.status === 'revision_required' && canEdit(u, sop, v) && (v.prepared_by === u.id || !isPriv(u))) tasks.push({ ...base, kind: 'fix', label: 'ถูกส่งกลับให้แก้ไข' });
    else if (v.status === 'draft' && v.prepared_by === u.id) tasks.push({ ...base, kind: 'draft', label: 'ฉบับร่างของคุณ (ยังไม่ส่งตรวจ)' });
  }
  const due = all(`SELECT s.id sop_id, s.sop_number, s.next_review_date, s.department_id, d.code dept_code, c.title, c.revision, c.owner_id, c.id version_id
    FROM sops s JOIN departments d ON d.id=s.department_id JOIN sop_versions c ON c.id=s.current_version_id
    WHERE s.is_obsolete=0 AND s.working_version_id IS NULL AND s.next_review_date IS NOT NULL`);
  for (const r of due) {
    const st = reviewState(r.next_review_date);
    if (st !== 'overdue' && st !== 'due_soon') continue;
    const mine = r.owner_id === u.id || (u.role === 'dept_head' && inDept(u, r.department_id)) || u.role === 'manager';
    if (mine) tasks.push({ sop_id: r.sop_id, version_id: r.version_id, sop_number: r.sop_number, dept_code: r.dept_code, title: r.title, rev: revLabel(r.revision), status: 'published', kind: st, label: st === 'overdue' ? `เลยกำหนดทบทวน (${r.next_review_date})` : `ใกล้ถึงกำหนดทบทวน (${r.next_review_date})`, updated_at: r.next_review_date });
  }
  const order = { approve: 0, review: 1, fix: 2, overdue: 3, due_soon: 4, draft: 5 };
  return tasks.sort((a, b) => order[a.kind] - order[b.kind]);
}

function visibleLog(u, where, params, limit = 30) {
  const rows = all(`SELECT l.*, s.sop_number, s.department_id, v.revision, v.title, v.status v_status, v.prepared_by, v.owner_id, v.reviewer_id, v.approver_id
    FROM workflow_log l LEFT JOIN sops s ON s.id=l.sop_id LEFT JOIN sop_versions v ON v.id=l.version_id
    ${where} ORDER BY l.at DESC, l.id DESC LIMIT ${Number(limit) * 3}`, ...params);
  return rows.filter(r => !r.version_id || PUBLIC_STATUSES.includes(r.v_status) || (r.sop_id && canSeeWork(u, { department_id: r.department_id }, r)))
    .slice(0, limit).map(r => ({ id: r.id, sop_id: r.sop_id, version_id: r.version_id, sop_number: r.sop_number, rev: r.revision != null ? revLabel(r.revision) : '', title: r.title, action: r.action, from_status: r.from_status, to_status: r.to_status, comment: r.comment, user_id: r.user_id, user_name: uname(r.user_id), at: r.at }));
}

function permissions(u, sop, v) {
  const work = WORK_STATUSES.includes(v.status);
  const isWorking = sop.working_version_id === v.id;
  const isCurrent = sop.current_version_id === v.id;
  const sep = separationIssue(u, v);
  return {
    canEdit: isWorking && canEdit(u, sop, v),
    canSubmit: isWorking && canEdit(u, sop, v),
    canStartReview: isWorking && v.status === 'submitted' && canReview(u, sop, v),
    canReviewPass: isWorking && ['submitted', 'dept_review'].includes(v.status) && canReview(u, sop, v),
    canApprove: isWorking && v.status === 'manager_approval' && canApprove(u, sop, v),
    canReturn: isWorking && ((['submitted', 'dept_review'].includes(v.status) && canReview(u, sop, v)) || (v.status === 'manager_approval' && canApprove(u, sop, v))),
    canComment: canSeeWork(u, sop, v),
    canRevise: isCurrent && !sop.is_obsolete && !sop.working_version_id && canCreateIn(u, sop.department_id),
    canObsolete: isCurrent && !sop.is_obsolete && isPriv(u),
    canCopy: canCreateIn(u, sop.department_id) || isPriv(u) || u.role === 'dept_head' || u.role === 'author',
    canDeleteDraft: isWorking && ['draft', 'revision_required'].includes(v.status) && (isPriv(u) || v.prepared_by === u.id),
    canSetReviewDate: isCurrent && !sop.is_obsolete && (isPriv(u) || (u.role === 'dept_head' && inDept(u, sop.department_id))),
    separationNote: work && ['submitted', 'dept_review', 'manager_approval'].includes(v.status) && ['dept_head', 'manager', 'admin'].includes(u.role) ? sep : null,
  };
}

function versionPayload(u, v) {
  const sop = getSop(v.sop_id);
  if (!sop) fail(404, 'ไม่พบ SOP');
  if (!canSeeVersion(u, sop, v)) fail(403, 'คุณไม่มีสิทธิ์ดูฉบับนี้ (ยังไม่ได้รับการอนุมัติ)');
  const versions = all('SELECT id,revision,status,title,change_summary,effective_date,review_date,prepared_by,approved_by,approved_at,published_at,updated_at FROM sop_versions WHERE sop_id=? ORDER BY revision DESC, id DESC', sop.id)
    .filter(x => canSeeVersion(u, sop, x))
    .map(x => ({ ...x, rev: revLabel(x.revision), prepared_name: uname(x.prepared_by), approved_name: uname(x.approved_by), is_current: x.id === sop.current_version_id, is_working: x.id === sop.working_version_id }));
  const pv = parseVersion(v);
  const fileIds = [...pv.content.attachments, ...pv.content.steps.flatMap(s => s.images)];
  const files = fileIds.length ? all(`SELECT id,name,mime,size,created_at FROM files WHERE id IN (${fileIds.map(() => '?').join(',')})`, ...fileIds) : [];
  return {
    sop: { ...sop, review_state: reviewState(sop.next_review_date) },
    version: { ...pv, editors: editorsOf(v), rev: revLabel(v.revision), is_current: v.id === sop.current_version_id, is_working: v.id === sop.working_version_id },
    people: {
      prepared: userBrief(v.prepared_by), owner: userBrief(v.owner_id), reviewer: userBrief(v.reviewer_id), approver: userBrief(v.approver_id),
      reviewed_by: userBrief(v.reviewed_by), approved_by: userBrief(v.approved_by),
    },
    files,
    versions,
    log: visibleLog(u, 'WHERE l.sop_id=?', [sop.id], 200),
    permissions: permissions(u, sop, v),
  };
}

function nextNumber(deptId) {
  const d = get('SELECT code FROM departments WHERE id=?', deptId);
  if (!d) return '';
  const prefix = `${d.code.toUpperCase()}-SOP-`;
  const rows = all('SELECT sop_number FROM sops WHERE sop_number LIKE ?', prefix + '%');
  const max = rows.reduce((m, r) => Math.max(m, parseInt(r.sop_number.slice(prefix.length), 10) || 0), 0);
  return prefix + String(max + 1).padStart(3, '0');
}

function validateAssignees(body, preparedBy) {
  for (const [k, roles, label] of [['reviewer_id', ['dept_head', 'manager', 'admin'], 'ผู้ตรวจสอบ'], ['approver_id', ['manager', 'admin'], 'ผู้อนุมัติ']]) {
    const id = body[k] ? Number(body[k]) : null;
    if (!id) continue;
    const u = userBrief(id);
    if (!u || !u.active) fail(400, `${label}ที่เลือกไม่มีในระบบหรือถูกปิดใช้งาน`);
    if (!roles.includes(u.role)) fail(400, `${label} (${u.display_name}) ไม่มีสิทธิ์ตามบทบาท`);
    if (id === preparedBy) fail(400, `ผู้จัดทำไม่สามารถเป็น${label}ของ SOP ตนเองได้`);
  }
  if (body.owner_id && !userBrief(Number(body.owner_id))) fail(400, 'ไม่พบผู้รับผิดชอบที่เลือก');
}
const validDate = d => !d || /^\d{4}-\d{2}-\d{2}$/.test(d);

function touchSop(sopId) { run('UPDATE sops SET updated_at=? WHERE id=?', now(), sopId); }
function notifySop(sopId, extra = {}) { broadcast({ type: 'sop', sop_id: sopId, ...extra }); }

/* ---------- Router ---------- */
const routes = [];
function route(method, pattern, handler, opts = {}) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, handler, opts });
}
const needRole = (u, ...roles) => { if (!roles.includes(u.role)) fail(403, 'คุณไม่มีสิทธิ์ทำรายการนี้'); };

/* ===== Auth ===== */
const loginAttempts = new Map();
route('POST', '/api/login', ({ body, req, res }) => {
  const ip = req.socket.remoteAddress || '';
  const a = loginAttempts.get(ip) || { n: 0, t: 0 };
  if (a.n >= 8 && Date.now() - a.t < 5 * 60000) fail(429, 'ล็อกอินผิดหลายครั้ง กรุณารอ 5 นาที');
  const u = get('SELECT * FROM users WHERE username=?', String(body.username || '').trim());
  if (!u || !u.active || !D.verifyPassword(body.password || '', u.password_hash)) {
    loginAttempts.set(ip, { n: (Date.now() - a.t < 5 * 60000 ? a.n : 0) + 1, t: Date.now() });
    fail(401, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  }
  loginAttempts.delete(ip);
  const token = crypto.randomBytes(32).toString('hex');
  run('INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)', token, u.id, Date.now() + SESSION_DAYS * 86400000);
  run('UPDATE users SET last_login=? WHERE id=?', now(), u.id);
  audit('user', u.id, 'login', '', u.id);
  res.setHeader('Set-Cookie', `sop_sess=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}`);
  return { ok: true };
}, { public: true });

route('POST', '/api/logout', ({ user, res }) => {
  run('DELETE FROM sessions WHERE token=?', user.token);
  res.setHeader('Set-Cookie', 'sop_sess=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  return { ok: true };
});

route('POST', '/api/me/password', ({ user, body }) => {
  const u = get('SELECT password_hash FROM users WHERE id=?', user.id);
  if (!D.verifyPassword(body.current || '', u.password_hash)) fail(400, 'รหัสผ่านปัจจุบันไม่ถูกต้อง');
  if (String(body.next || '').length < 8) fail(400, 'รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร');
  run('UPDATE users SET password_hash=?, must_change_pw=0 WHERE id=?', D.hashPassword(body.next), user.id);
  run('DELETE FROM sessions WHERE user_id=? AND token<>?', user.id, user.token);
  audit('user', user.id, 'change_password', '', user.id);
  return { ok: true };
});

route('GET', '/api/bootstrap', ({ user }) => {
  const { token, ...me } = user;
  return {
    me,
    departments: all('SELECT * FROM departments ORDER BY sort, code'),
    users: all('SELECT id,display_name,position,role,department_id,active' + (user.role === 'admin' ? ',username,email,last_login,must_change_pw' : '') + ' FROM users ORDER BY display_name'),
    settings: publicSettings(),
    statuses: STATUS,
    nextReviewMonths: Number(getSetting('default_review_months', '12')) || 12,
  };
});
function publicSettings() {
  return {
    company_name: getSetting('company_name'), company_name_en: getSetting('company_name_en'),
    logo_file_id: getSetting('logo_file_id'), review_warn_days: getSetting('review_warn_days', '30'),
    default_review_months: getSetting('default_review_months', '12'), doc_font: getSetting('doc_font', 'Tahoma'),
  };
}

/* ===== Departments (admin) ===== */
route('POST', '/api/departments', ({ user, body }) => {
  needRole(user, 'admin');
  const code = String(body.code || '').trim().toUpperCase(), name = String(body.name || '').trim();
  if (!/^[A-Z0-9_-]{1,12}$/.test(code)) fail(400, 'รหัสแผนกใช้ A-Z, 0-9, - หรือ _ ไม่เกิน 12 ตัว');
  if (!name) fail(400, 'กรุณาระบุชื่อแผนก');
  if (get('SELECT 1 FROM departments WHERE code=?', code)) fail(409, 'รหัสแผนกนี้มีอยู่แล้ว');
  const sort = (get('SELECT MAX(sort) m FROM departments').m || 0) + 1;
  const r = run('INSERT INTO departments(code,name,description,active,sort,created_at) VALUES(?,?,?,1,?,?)', code, name, String(body.description || ''), sort, now());
  audit('department', r.id, 'create', { code, name }, user.id);
  broadcast({ type: 'meta' });
  return { id: r.id };
});
route('PUT', '/api/departments/:id', ({ user, body, params }) => {
  needRole(user, 'admin');
  const d = get('SELECT * FROM departments WHERE id=?', params.id) || fail(404, 'ไม่พบแผนก');
  const code = body.code != null ? String(body.code).trim().toUpperCase() : d.code;
  if (!/^[A-Z0-9_-]{1,12}$/.test(code)) fail(400, 'รหัสแผนกไม่ถูกต้อง');
  if (code !== d.code && get('SELECT 1 FROM departments WHERE code=? AND id<>?', code, d.id)) fail(409, 'รหัสแผนกนี้มีอยู่แล้ว');
  const name = body.name != null ? String(body.name).trim() : d.name;
  if (!name) fail(400, 'กรุณาระบุชื่อแผนก');
  run('UPDATE departments SET code=?, name=?, description=?, active=?, sort=? WHERE id=?', code, name,
    body.description != null ? String(body.description) : d.description, body.active != null ? (body.active ? 1 : 0) : d.active,
    body.sort != null ? Number(body.sort) : d.sort, d.id);
  audit('department', d.id, 'update', body, user.id);
  broadcast({ type: 'meta' });
  return { ok: true };
});
route('DELETE', '/api/departments/:id', ({ user, params }) => {
  needRole(user, 'admin');
  const d = get('SELECT * FROM departments WHERE id=?', params.id) || fail(404, 'ไม่พบแผนก');
  const nS = get('SELECT COUNT(*) n FROM sops WHERE department_id=?', d.id).n;
  const nU = get('SELECT COUNT(*) n FROM users WHERE department_id=?', d.id).n;
  if (nS || nU) fail(409, `ลบไม่ได้: แผนกนี้มี SOP ${nS} รายการ และผู้ใช้ ${nU} คน — ให้ใช้ "ปิดใช้งาน" แทน`);
  run('DELETE FROM departments WHERE id=?', d.id);
  audit('department', d.id, 'delete', { code: d.code, name: d.name }, user.id);
  broadcast({ type: 'meta' });
  return { ok: true };
});

/* ===== Users (admin) ===== */
function userFields(body, existing) {
  const role = body.role ?? existing?.role;
  if (!ROLES.includes(role)) fail(400, 'บทบาทไม่ถูกต้อง');
  const display_name = String(body.display_name ?? existing?.display_name ?? '').trim();
  if (!display_name) fail(400, 'กรุณาระบุชื่อ-นามสกุล');
  let department_id = body.department_id !== undefined ? (body.department_id ? Number(body.department_id) : null) : existing?.department_id;
  if (['author', 'dept_head'].includes(role) && !department_id) fail(400, 'ผู้จัดทำ / หัวหน้าแผนก ต้องระบุแผนก');
  if (department_id && !get('SELECT 1 FROM departments WHERE id=?', department_id)) fail(400, 'ไม่พบแผนก');
  return { role, display_name, department_id, position: String(body.position ?? existing?.position ?? ''), email: String(body.email ?? existing?.email ?? '') };
}
route('POST', '/api/users', ({ user, body }) => {
  needRole(user, 'admin');
  const username = String(body.username || '').trim();
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) fail(400, 'ชื่อผู้ใช้ 3-32 ตัว (a-z 0-9 . _ -)');
  if (get('SELECT 1 FROM users WHERE username=?', username)) fail(409, 'ชื่อผู้ใช้นี้มีอยู่แล้ว');
  if (String(body.password || '').length < 8) fail(400, 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร');
  const f = userFields(body);
  const r = run('INSERT INTO users(username,display_name,position,email,role,department_id,password_hash,must_change_pw,active,created_at) VALUES(?,?,?,?,?,?,?,1,1,?)',
    username, f.display_name, f.position, f.email, f.role, f.department_id, D.hashPassword(body.password), now());
  audit('user', r.id, 'create', { username, ...f }, user.id);
  userCache.clear(); broadcast({ type: 'meta' });
  return { id: r.id };
});
route('PUT', '/api/users/:id', ({ user, body, params }) => {
  needRole(user, 'admin');
  const ex = get('SELECT * FROM users WHERE id=?', params.id) || fail(404, 'ไม่พบผู้ใช้');
  const f = userFields(body, ex);
  let active = body.active != null ? (body.active ? 1 : 0) : ex.active;
  if (ex.id === user.id && (!active || f.role !== 'admin')) fail(400, 'ไม่สามารถปิดใช้งานหรือลดสิทธิ์บัญชีของตนเองได้');
  run('UPDATE users SET display_name=?, position=?, email=?, role=?, department_id=?, active=? WHERE id=?', f.display_name, f.position, f.email, f.role, f.department_id, active, ex.id);
  if (!active) run('DELETE FROM sessions WHERE user_id=?', ex.id);
  if (body.password) {
    if (String(body.password).length < 8) fail(400, 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร');
    run('UPDATE users SET password_hash=?, must_change_pw=1 WHERE id=?', D.hashPassword(body.password), ex.id);
    run('DELETE FROM sessions WHERE user_id=?', ex.id);
  }
  const { password, ...logBody } = body;
  audit('user', ex.id, body.password ? 'update+reset_password' : 'update', logBody, user.id);
  userCache.clear(); broadcast({ type: 'meta' });
  return { ok: true };
});

/* ===== Settings ===== */
route('PUT', '/api/settings', ({ user, body }) => {
  needRole(user, 'admin');
  for (const k of ['company_name', 'company_name_en', 'logo_file_id', 'review_warn_days', 'default_review_months', 'doc_font']) {
    if (body[k] !== undefined) setSetting(k, String(body[k]).slice(0, 200));
  }
  audit('settings', 0, 'update', body, user.id);
  broadcast({ type: 'meta' });
  return { ok: true };
});

/* ===== Files ===== */
const ALLOWED_EXT = /\.(pdf|docx?|xlsx?|xlsm|pptx?|csv|txt|png|jpe?g|gif|webp|zip)$/i;
route('POST', '/api/files', ({ user, body }) => {
  if (user.role === 'viewer') fail(403, 'ผู้อ่านไม่สามารถอัปโหลดไฟล์ได้');
  const name = path.basename(String(body.name || 'file')).slice(0, 200);
  if (!ALLOWED_EXT.test(name)) fail(400, 'ชนิดไฟล์ไม่รองรับ (รองรับ PDF, Word, Excel, PowerPoint, รูปภาพ, CSV, TXT, ZIP)');
  const buf = Buffer.from(String(body.data || ''), 'base64');
  if (!buf.length) fail(400, 'ไฟล์ว่าง');
  if (buf.length > 25 * 1024 * 1024) fail(400, 'ไฟล์ใหญ่เกิน 25 MB');
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  const stored = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(name).toLowerCase()}`;
  fs.writeFileSync(path.join(D.UPLOAD_DIR, stored), buf);
  const r = run('INSERT INTO files(name,mime,size,stored,sha256,uploaded_by,created_at) VALUES(?,?,?,?,?,?,?)', name, String(body.mime || 'application/octet-stream').slice(0, 100), buf.length, stored, sha, user.id, now());
  return { id: r.id, name, size: buf.length, mime: body.mime };
});
route('GET', '/api/files/:id', ({ params, query, res }) => {
  const f = get('SELECT * FROM files WHERE id=?', params.id) || fail(404, 'ไม่พบไฟล์');
  const p = path.join(D.UPLOAD_DIR, f.stored);
  if (!fs.existsSync(p)) fail(404, 'ไม่พบไฟล์บนดิสก์');
  const inline = /^image\//.test(f.mime) || f.mime === 'application/pdf';
  res.writeHead(200, {
    'Content-Type': f.mime || 'application/octet-stream', 'Content-Length': f.size,
    'Content-Disposition': `${inline && !query.download ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
    'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff',
  });
  fs.createReadStream(p).pipe(res);
  return undefined;
}, { raw: true });

/* ===== SOP list / dashboard / tasks ===== */
route('GET', '/api/sops', ({ user, query }) => stripSearch(filterSops(listSops(user), query)));
route('GET', '/api/sops/next-number', ({ query }) => ({ sop_number: nextNumber(query.dept) }));
route('GET', '/api/tasks', ({ user }) => myTasks(user));
route('GET', '/api/activity', ({ user, query }) => visibleLog(user, '', [], Math.min(Number(query.limit) || 50, 300)));

route('GET', '/api/dashboard', ({ user, query }) => {
  const all_ = listSops(user);
  const base = filterSops(all_, { dept: query.dept, from: query.from, to: query.to, q: query.q });
  const list = query.status ? filterSops(base, { status: query.status }) : base;
  const count = f => list.filter(f).length;
  const kpi = {
    total: list.length,
    active: count(s => s.current && !s.is_obsolete),
    draft: count(s => s.working?.status === 'draft'),
    pending: count(s => ['submitted', 'dept_review', 'manager_approval'].includes(s.working?.status)),
    revision_required: count(s => s.working?.status === 'revision_required'),
    overdue: count(s => s.review_state === 'overdue'),
    due_soon: count(s => s.review_state === 'due_soon'),
    obsolete: count(s => s.is_obsolete),
  };
  const statusCounts = {};
  list.forEach(s => { statusCounts[s.status] = (statusCounts[s.status] || 0) + 1; });
  const depts = all('SELECT id,code,name,active FROM departments ORDER BY sort, code');
  const byDept = depts.map(d => {
    const ds = list.filter(s => s.department_id === d.id);
    return {
      id: d.id, code: d.code, name: d.name, total: ds.length,
      // แบ่งกลุ่มไม่ซ้ำกัน: ใช้งานอยู่ (แม้กำลังแก้ Rev. ใหม่) / ยังไม่เคยประกาศใช้ / ยกเลิก
      published: ds.filter(s => s.current && !s.is_obsolete).length,
      in_progress: ds.filter(s => !s.current && s.status !== 'revision_required').length,
      revision_required: ds.filter(s => !s.current && s.status === 'revision_required').length,
      obsolete: ds.filter(s => s.is_obsolete).length,
    };
  }).filter(d => d.total > 0 || depts.find(x => x.id === d.id).active);
  // กราฟรายเดือน 12 เดือน (ประกาศใช้ / ส่งตรวจ / ส่งกลับ)
  const months = [];
  const d0 = new Date(); d0.setDate(1);
  for (let i = 11; i >= 0; i--) { const d = new Date(d0.getFullYear(), d0.getMonth() - i, 1); months.push(d.toLocaleDateString('sv-SE').slice(0, 7)); }
  const ids = new Set(list.map(s => s.id));
  const logs = all("SELECT sop_id, action, substr(at,1,7) ym FROM workflow_log WHERE action IN ('approve','submit','return') AND at>=?", months[0] + '-01');
  const monthly = months.map(m => ({ month: m, approve: 0, submit: 0, return: 0 }));
  logs.forEach(l => { if (!ids.has(l.sop_id)) return; const row = monthly.find(x => x.month === l.ym); if (row) row[l.action]++; });
  const activity = visibleLog(user, '', [], 60).filter(a => !a.sop_id || ids.has(a.sop_id)).slice(0, 12);
  const reviewList = list.filter(s => s.review_state === 'overdue' || s.review_state === 'due_soon')
    .sort((a, b) => (a.next_review_date || '').localeCompare(b.next_review_date || '')).slice(0, 10)
    .map(({ _search, ...s }) => s);
  return { kpi, statusCounts, byDept, monthly, activity, reviewList, tasks: myTasks(user).slice(0, 10) };
});

/* ===== SOP CRUD ===== */
route('POST', '/api/sops', ({ user, body }) => {
  const deptId = Number(body.department_id);
  const dept = get('SELECT * FROM departments WHERE id=?', deptId) || fail(400, 'กรุณาเลือกแผนก');
  if (!dept.active) fail(400, 'แผนกนี้ถูกปิดใช้งาน');
  if (!canCreateIn(user, deptId)) fail(403, 'คุณไม่มีสิทธิ์สร้าง SOP ในแผนกนี้');
  const num = String(body.sop_number || '').trim() || nextNumber(deptId);
  if (!/^[\w./-]{2,40}$/u.test(num)) fail(400, 'SOP Number ใช้ตัวอักษร A-Z ตัวเลข และ - . / _ ได้ (2-40 ตัว)');
  if (get('SELECT 1 FROM sops WHERE sop_number=?', num)) fail(409, `SOP Number "${num}" มีอยู่แล้ว`);
  const title = String(body.title || '').trim();
  if (!title) fail(400, 'กรุณาระบุชื่อ SOP');
  validateAssignees(body, user.id);
  if (!validDate(body.effective_date) || !validDate(body.review_date)) fail(400, 'รูปแบบวันที่ไม่ถูกต้อง');
  const t = now();
  const out = tx(() => {
    const s = run('INSERT INTO sops(sop_number,department_id,created_by,created_at,updated_at) VALUES(?,?,?,?,?)', num, deptId, user.id, t, t);
    const v = run(`INSERT INTO sop_versions(sop_id,revision,status,title,content,prepared_by,owner_id,reviewer_id,approver_id,effective_date,review_date,change_summary,editors,created_at,updated_at,updated_by)
      VALUES(?,0,'draft',?,?,?,?,?,?,?,?,?,'[]',?,?,?)`, s.id, title, JSON.stringify(cleanContent(body.content)), user.id,
      body.owner_id || null, body.reviewer_id || null, body.approver_id || null, body.effective_date || null, body.review_date || null,
      String(body.change_summary || 'จัดทำครั้งแรก (Initial issue)'), t, t, user.id);
    run('UPDATE sops SET working_version_id=? WHERE id=?', v.id, s.id);
    wlog(s.id, v.id, body._copiedFrom ? 'copy' : 'create', null, 'draft', body._copiedFrom ? `คัดลอกจาก ${body._copiedFrom}` : '', user.id);
    return { id: s.id, version_id: v.id, sop_number: num };
  });
  notifySop(out.id);
  return out;
});

route('PUT', '/api/versions/:id', ({ user, body, params }) => {
  const v = getVersion(params.id) || fail(404, 'ไม่พบเอกสาร');
  const sop = getSop(v.sop_id);
  if (sop.working_version_id !== v.id || !canEdit(user, sop, v))
    fail(v.locked ? 423 : 403, v.locked ? 'ฉบับนี้ได้รับอนุมัติแล้ว ห้ามแก้ไข — กด "สร้างฉบับแก้ไข" เพื่อทำ Rev. ใหม่' : 'เอกสารอยู่ระหว่างตรวจ/อนุมัติ หรือคุณไม่มีสิทธิ์แก้ไข');
  if (body.row_ver != null && Number(body.row_ver) !== v.row_ver)
    fail(409, `มีผู้ใช้อื่น (${uname(v.updated_by)}) บันทึกเอกสารนี้ไปก่อนแล้ว เมื่อ ${new Date(v.updated_at).toLocaleString('th-TH')} — กรุณาโหลดใหม่`);
  const title = String(body.title ?? v.title).trim();
  if (!title) fail(400, 'กรุณาระบุชื่อ SOP');
  validateAssignees(body, v.prepared_by);
  if (!validDate(body.effective_date) || !validDate(body.review_date)) fail(400, 'รูปแบบวันที่ไม่ถูกต้อง');
  // เปลี่ยนเลข SOP / แผนกได้เฉพาะ Rev.00 ที่ยังไม่เคยประกาศใช้
  let numChange = null, deptChange = null;
  if (!sop.current_version_id && v.revision === 0) {
    if (body.sop_number && body.sop_number.trim() !== sop.sop_number) {
      const num = body.sop_number.trim();
      if (!/^[\w./-]{2,40}$/u.test(num)) fail(400, 'SOP Number ไม่ถูกต้อง');
      if (get('SELECT 1 FROM sops WHERE sop_number=? AND id<>?', num, sop.id)) fail(409, `SOP Number "${num}" มีอยู่แล้ว`);
      numChange = num;
    }
    if (body.department_id && Number(body.department_id) !== sop.department_id) {
      if (!canCreateIn(user, Number(body.department_id))) fail(403, 'คุณไม่มีสิทธิ์ย้าย SOP ไปแผนกนี้');
      deptChange = Number(body.department_id);
    }
  }
  const editors = editorsOf(v); if (!editors.includes(user.id) && user.id !== v.prepared_by) editors.push(user.id);
  const t = now();
  tx(() => {
    run(`UPDATE sop_versions SET title=?, content=?, owner_id=?, reviewer_id=?, approver_id=?, effective_date=?, review_date=?, change_summary=?, editors=?, row_ver=row_ver+1, updated_at=?, updated_by=? WHERE id=?`,
      title, JSON.stringify(cleanContent(body.content)), body.owner_id || null, body.reviewer_id || null, body.approver_id || null,
      body.effective_date || null, body.review_date || null, String(body.change_summary ?? v.change_summary).slice(0, 4000), JSON.stringify(editors), t, user.id, v.id);
    if (numChange) run('UPDATE sops SET sop_number=? WHERE id=?', numChange, sop.id);
    if (deptChange) run('UPDATE sops SET department_id=? WHERE id=?', deptChange, sop.id);
    touchSop(sop.id);
    // บันทึกการแก้ไข (รวมการบันทึกถี่ ๆ ภายใน 15 นาทีเป็นรายการเดียว)
    const last = get("SELECT id, at FROM workflow_log WHERE version_id=? AND user_id=? AND action='edit' ORDER BY id DESC LIMIT 1", v.id, user.id);
    const lastAny = get('SELECT id FROM workflow_log WHERE version_id=? ORDER BY id DESC LIMIT 1', v.id);
    if (last && lastAny && last.id === lastAny.id && Date.now() - Date.parse(last.at) < 15 * 60000) run('UPDATE workflow_log SET at=? WHERE id=?', t, last.id);
    else wlog(sop.id, v.id, 'edit', v.status, v.status, '', user.id);
  });
  notifySop(sop.id, { version_id: v.id, by: user.id });
  return { ok: true, row_ver: v.row_ver + 1 };
});

function requireComment(body, msg) { const c = String(body.comment || '').trim(); if (!c) fail(400, msg); return c.slice(0, 4000); }

route('POST', '/api/versions/:id/action', ({ user, body, params }) => {
  const v = getVersion(params.id) || fail(404, 'ไม่พบเอกสาร');
  const sop = getSop(v.sop_id);
  const action = String(body.action || '');
  const t = now();
  const isWorking = sop.working_version_id === v.id;
  const notifyUsers = [];
  const move = (to, extraSql = '', extraParams = []) => {
    run(`UPDATE sop_versions SET status=?, row_ver=row_ver+1, updated_at=?${extraSql} WHERE id=?`, to, t, ...extraParams, v.id);
  };
  tx(() => {
    switch (action) {
      case 'submit': {
        if (!isWorking || !canEdit(user, sop, v)) fail(403, 'ไม่สามารถส่งตรวจได้');
        const c = JSON.parse(v.content);
        const miss = [];
        if (!v.title.trim()) miss.push('SOP Title');
        if (!c.objective?.trim()) miss.push('Objective');
        if (!c.scope?.trim()) miss.push('Scope');
        if (!c.responsibility?.trim()) miss.push('Responsibility');
        if (!(c.steps || []).some(s => s.title?.trim())) miss.push('Work Instructions (อย่างน้อย 1 ขั้นตอน)');
        if (!v.owner_id) miss.push('ผู้รับผิดชอบ');
        if (!v.effective_date) miss.push('Effective Date');
        if (!v.review_date) miss.push('Review Date');
        if (v.effective_date && v.review_date && v.review_date <= v.effective_date) miss.push('Review Date ต้องหลัง Effective Date');
        if (v.revision > 0 && !String(v.change_summary || '').trim()) miss.push('รายละเอียดการแก้ไข (Change Summary)');
        if (miss.length) fail(400, 'ข้อมูลยังไม่ครบ: ' + miss.join(', '));
        validateAssignees(v, v.prepared_by);
        move('submitted', ', submitted_at=?', [t]);
        wlog(sop.id, v.id, 'submit', v.status, 'submitted', String(body.comment || ''), user.id);
        if (v.reviewer_id) notifyUsers.push(v.reviewer_id);
        else all("SELECT id FROM users WHERE active=1 AND role='dept_head' AND department_id=?", sop.department_id).forEach(r => notifyUsers.push(r.id));
        break;
      }
      case 'start_review':
        if (!isWorking || v.status !== 'submitted') fail(400, 'สถานะเอกสารไม่ถูกต้อง');
        if (!canReview(user, sop, v)) fail(403, separationIssue(user, v) || 'คุณไม่ใช่ผู้ตรวจสอบของเอกสารนี้');
        move('dept_review');
        wlog(sop.id, v.id, 'start_review', v.status, 'dept_review', String(body.comment || ''), user.id);
        notifyUsers.push(v.prepared_by);
        break;
      case 'review_pass':
        if (!isWorking || !['submitted', 'dept_review'].includes(v.status)) fail(400, 'สถานะเอกสารไม่ถูกต้อง');
        if (!canReview(user, sop, v)) fail(403, separationIssue(user, v) || 'คุณไม่ใช่ผู้ตรวจสอบของเอกสารนี้');
        move('manager_approval', ', reviewed_by=?, reviewed_at=?', [user.id, t]);
        wlog(sop.id, v.id, 'review_pass', v.status, 'manager_approval', String(body.comment || ''), user.id);
        if (v.approver_id) notifyUsers.push(v.approver_id);
        else all("SELECT id FROM users WHERE active=1 AND role='manager'").forEach(r => notifyUsers.push(r.id));
        notifyUsers.push(v.prepared_by);
        break;
      case 'approve': {
        if (!isWorking || v.status !== 'manager_approval') fail(400, 'สถานะเอกสารไม่ถูกต้อง');
        if (!canApprove(user, sop, v)) fail(403, separationIssue(user, v) || 'คุณไม่มีสิทธิ์อนุมัติเอกสารนี้');
        move('published', ', approved_by=?, approved_at=?, published_at=?, locked=1', [user.id, t, t]);
        if (sop.current_version_id) {
          const old = getVersion(sop.current_version_id);
          run("UPDATE sop_versions SET status='superseded', superseded_at=? WHERE id=?", t, old.id);
          wlog(sop.id, old.id, 'supersede', old.status, 'superseded', `ถูกแทนที่ด้วย ${revLabel(v.revision)}`, user.id);
        }
        run('UPDATE sops SET current_version_id=?, working_version_id=NULL, next_review_date=?, is_obsolete=0, updated_at=? WHERE id=?', v.id, v.review_date, t, sop.id);
        wlog(sop.id, v.id, 'approve', v.status, 'published', String(body.comment || ''), user.id);
        notifyUsers.push(v.prepared_by, v.reviewed_by, v.owner_id);
        break;
      }
      case 'return': {
        if (!isWorking) fail(400, 'สถานะเอกสารไม่ถูกต้อง');
        const ok = (['submitted', 'dept_review'].includes(v.status) && canReview(user, sop, v)) || (v.status === 'manager_approval' && canApprove(user, sop, v));
        if (!ok) fail(403, separationIssue(user, v) || 'คุณไม่มีสิทธิ์ส่งกลับเอกสารนี้');
        const reason = requireComment(body, 'กรุณาระบุเหตุผลที่ส่งกลับแก้ไข');
        move('revision_required');
        wlog(sop.id, v.id, 'return', v.status, 'revision_required', reason, user.id);
        notifyUsers.push(v.prepared_by);
        break;
      }
      case 'comment': {
        if (!canSeeVersion(user, sop, v)) fail(403, 'ไม่มีสิทธิ์');
        const c = requireComment(body, 'กรุณาพิมพ์ความคิดเห็น');
        wlog(sop.id, v.id, 'comment', v.status, v.status, c, user.id);
        notifyUsers.push(v.prepared_by);
        break;
      }
      case 'obsolete': {
        if (sop.current_version_id !== v.id || sop.is_obsolete || !isPriv(user)) fail(403, 'ไม่สามารถยกเลิกใช้งานได้');
        const reason = requireComment(body, 'กรุณาระบุเหตุผลที่ยกเลิกใช้งาน');
        move('obsolete');
        if (sop.working_version_id) {
          run("UPDATE sop_versions SET status='cancelled', updated_at=? WHERE id=?", t, sop.working_version_id);
          wlog(sop.id, sop.working_version_id, 'cancel', null, 'cancelled', 'ยกเลิกเนื่องจาก SOP ถูกยกเลิกใช้งาน', user.id);
        }
        run('UPDATE sops SET is_obsolete=1, working_version_id=NULL, updated_at=? WHERE id=?', t, sop.id);
        wlog(sop.id, v.id, 'obsolete', v.status, 'obsolete', reason, user.id);
        break;
      }
      default: fail(400, 'ไม่รู้จักคำสั่ง');
    }
    if (action !== 'comment') touchSop(sop.id);
  });
  notifySop(sop.id, { version_id: v.id, action, by: user.id, notify: [...new Set(notifyUsers.filter(x => x && x !== user.id))], sop_number: sop.sop_number });
  return { ok: true };
});

route('POST', '/api/sops/:id/revise', ({ user, params, body }) => {
  const sop = getSop(params.id) || fail(404, 'ไม่พบ SOP');
  if (!sop.current_version_id || sop.is_obsolete) fail(400, 'ต้องมีฉบับที่ประกาศใช้อยู่ก่อนจึงจะสร้างฉบับแก้ไขได้');
  if (sop.working_version_id) fail(409, 'มีฉบับแก้ไขที่อยู่ระหว่างดำเนินการอยู่แล้ว');
  if (!canCreateIn(user, sop.department_id)) fail(403, 'คุณไม่มีสิทธิ์แก้ไข SOP ของแผนกนี้');
  const cur = getVersion(sop.current_version_id);
  const maxRev = get('SELECT MAX(revision) m FROM sop_versions WHERE sop_id=?', sop.id).m;
  const t = now();
  const id = tx(() => {
    const r = run(`INSERT INTO sop_versions(sop_id,revision,status,title,content,prepared_by,owner_id,reviewer_id,approver_id,effective_date,review_date,change_summary,editors,created_at,updated_at,updated_by)
      VALUES(?,?,'draft',?,?,?,?,?,?,NULL,NULL,?,'[]',?,?,?)`, sop.id, maxRev + 1, cur.title, cur.content, user.id, cur.owner_id,
      cur.reviewer_id === user.id ? null : cur.reviewer_id, cur.approver_id === user.id ? null : cur.approver_id, String(body.change_summary || ''), t, t, user.id);
    run('UPDATE sops SET working_version_id=?, updated_at=? WHERE id=?', r.id, t, sop.id);
    wlog(sop.id, r.id, 'revise', null, 'draft', `สร้าง ${revLabel(maxRev + 1)} จาก ${revLabel(cur.revision)}`, user.id);
    return r.id;
  });
  notifySop(sop.id);
  return { version_id: id };
});

route('POST', '/api/sops/:id/copy', ({ user, params, body }) => {
  const sop = getSop(params.id) || fail(404, 'ไม่พบ SOP');
  const srcId = Number(body.version_id) || sop.current_version_id || sop.working_version_id;
  const src = getVersion(srcId);
  if (!src || src.sop_id !== sop.id || !canSeeVersion(user, sop, src)) fail(403, 'ไม่สามารถคัดลอกฉบับนี้ได้');
  const deptId = Number(body.department_id) || sop.department_id;
  return routes.find(r => r.method === 'POST' && r.re.test('/api/sops')).handler({
    user, body: {
      department_id: deptId, sop_number: body.sop_number, title: body.title || (src.title + ' (สำเนา)'),
      content: JSON.parse(src.content), owner_id: src.owner_id, change_summary: 'จัดทำครั้งแรก (คัดลอกจาก ' + sop.sop_number + ' ' + revLabel(src.revision) + ')',
      _copiedFrom: `${sop.sop_number} ${revLabel(src.revision)}`,
    },
  });
});

route('DELETE', '/api/versions/:id', ({ user, params }) => {
  const v = getVersion(params.id) || fail(404, 'ไม่พบเอกสาร');
  const sop = getSop(v.sop_id);
  if (sop.working_version_id !== v.id || !['draft', 'revision_required'].includes(v.status) || !(isPriv(user) || v.prepared_by === user.id))
    fail(403, 'ลบได้เฉพาะฉบับร่างที่ยังไม่อนุมัติ โดยผู้จัดทำหรือผู้ดูแล');
  tx(() => {
    if (!sop.current_version_id && get('SELECT COUNT(*) n FROM sop_versions WHERE sop_id=?', sop.id).n === 1) {
      run('DELETE FROM sops WHERE id=?', sop.id);
      audit('sop', sop.id, 'delete_draft', { sop_number: sop.sop_number, title: v.title }, user.id);
      wlog(null, null, 'delete', v.status, null, `ลบฉบับร่าง ${sop.sop_number} ${v.title}`, user.id);
    } else {
      run("UPDATE sop_versions SET status='cancelled', updated_at=? WHERE id=?", now(), v.id);
      run('UPDATE sops SET working_version_id=NULL, updated_at=? WHERE id=?', now(), sop.id);
      wlog(sop.id, v.id, 'cancel', v.status, 'cancelled', 'ยกเลิกฉบับแก้ไข', user.id);
    }
  });
  notifySop(sop.id);
  return { ok: true };
});

route('POST', '/api/sops/:id/review-date', ({ user, params, body }) => {
  const sop = getSop(params.id) || fail(404, 'ไม่พบ SOP');
  if (!sop.current_version_id || sop.is_obsolete) fail(400, 'SOP นี้ไม่มีฉบับที่ใช้งานอยู่');
  if (!(isPriv(user) || (user.role === 'dept_head' && inDept(user, sop.department_id)))) fail(403, 'คุณไม่มีสิทธิ์กำหนดวันทบทวน');
  const date = String(body.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail(400, 'กรุณาระบุวันที่');
  if (date <= today()) fail(400, 'วันทบทวนรอบถัดไปต้องเป็นวันในอนาคต');
  const note = requireComment(body, 'กรุณาระบุผลการทบทวน');
  tx(() => {
    run('UPDATE sops SET next_review_date=?, updated_at=? WHERE id=?', date, now(), sop.id);
    wlog(sop.id, sop.current_version_id, 'review_date', null, null, `ทบทวนแล้ว — กำหนดทบทวนครั้งถัดไป ${date}: ${note}`, user.id);
  });
  notifySop(sop.id);
  return { ok: true };
});

/* ===== Version detail ===== */
route('GET', '/api/versions/:id', ({ user, params }) => versionPayload(user, getVersion(params.id) || fail(404, 'ไม่พบเอกสาร')));
route('GET', '/api/sops/:id', ({ user, params }) => {
  const sop = getSop(params.id) || fail(404, 'ไม่พบ SOP');
  const work = sop.working_version_id && getVersion(sop.working_version_id);
  const vid = (work && canSeeWork(user, sop, work)) ? work.id : sop.current_version_id;
  if (!vid) fail(403, 'SOP นี้ยังไม่ได้ประกาศใช้');
  return versionPayload(user, getVersion(vid));
});

/* ===== Export ===== */
const fmtD = d => { if (!d) return ''; const [y, m, dd] = String(d).slice(0, 10).split('-'); return `${dd}/${m}/${y}`; };
const fmtDT = iso => { if (!iso) return ''; const d = new Date(iso); return d.toLocaleDateString('en-GB') + ' ' + d.toTimeString().slice(0, 5); };

function docModel(u, v) {
  const P = versionPayload(u, v);
  const sop = P.sop, ver = P.version;
  const fileMap = new Map();
  const ids = ver.content.steps.flatMap(s => s.images);
  if (ids.length) all(`SELECT * FROM files WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids).forEach(f => {
    try { fileMap.set(f.id, { buf: fs.readFileSync(path.join(D.UPLOAD_DIR, f.stored)), name: f.name }); } catch { }
  });
  let logo = null;
  const lid = Number(getSetting('logo_file_id'));
  if (lid) { const f = get('SELECT stored FROM files WHERE id=?', lid); if (f) try { logo = fs.readFileSync(path.join(D.UPLOAD_DIR, f.stored)); if (!imageInfo(logo)) logo = null; } catch { } }
  const hist = all("SELECT * FROM sop_versions WHERE sop_id=? AND revision<=? AND (status IN ('published','superseded','obsolete') OR id=?) ORDER BY revision", sop.id, v.revision, v.id);
  const person = (id, date, note) => { const b = userBrief(id); return b ? { name: b.display_name, position: b.position, date: fmtD(date), note } : null; };
  const watermark = v.status === 'published' ? '' :
    v.status === 'superseded' ? `ฉบับยกเลิก — ถูกแทนที่ด้วยฉบับใหม่แล้ว (ใช้อ้างอิงเท่านั้น)` :
      v.status === 'obsolete' ? 'เอกสารยกเลิกใช้งาน (OBSOLETE) — ห้ามนำไปใช้ปฏิบัติงาน' :
        `ฉบับร่าง — ยังไม่ได้รับอนุมัติ ห้ามใช้ปฏิบัติงาน (สถานะ: ${STATUS[v.status] || v.status})`;
  return {
    company: getSetting('company_name'), companyEn: getSetting('company_name_en'), companyShort: (getSetting('company_name_en') || getSetting('company_name')).split(' ')[0],
    font: getSetting('doc_font', 'Tahoma'), logo,
    sop_number: sop.sop_number, dept_name: `${sop.dept_code} – ${sop.dept_name}`, title: v.title, revLabel: revLabel(v.revision),
    status: v.status, statusLabel: STATUS[v.status], effective_date: fmtD(v.effective_date), review_date: fmtD(v.id === sop.current_version_id && sop.next_review_date ? sop.next_review_date : v.review_date),
    owner: uname(v.owner_id), content: ver.content,
    prepared: person(v.prepared_by, v.submitted_at || v.created_at),
    reviewed: v.reviewed_by ? person(v.reviewed_by, v.reviewed_at, 'ตรวจสอบผ่านระบบแล้ว') : (v.reviewer_id ? person(v.reviewer_id, null) : null),
    approved: v.approved_by ? person(v.approved_by, v.approved_at, 'อนุมัติผ่านระบบแล้ว (Electronic Approval)') : (v.approver_id ? person(v.approver_id, null) : null),
    history: hist.map(h => ({ rev: revLabel(h.revision), date: fmtD(h.effective_date), summary: h.change_summary + (h.status !== 'published' && h.status !== 'superseded' && h.status !== 'obsolete' ? ` [${STATUS[h.status]}]` : ''), prepared: uname(h.prepared_by), approved: uname(h.approved_by), approvedDate: fmtD(h.approved_at) })),
    attachments: P.files.filter(f => ver.content.attachments.includes(f.id)).map(f => f.name),
    images: fileMap, printedAt: fmtDT(now()), watermark,
  };
}

route('GET', '/api/versions/:id/docx', ({ user, params, res }) => {
  const v = getVersion(params.id) || fail(404, 'ไม่พบเอกสาร');
  const m = docModel(user, v);
  const buf = buildDocx(m);
  const fname = `${m.sop_number}_${m.revLabel}_${m.title}`.replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 150) + '.docx';
  audit('version', v.id, 'export_docx', '', user.id);
  res.writeHead(200, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Content-Length': buf.length, 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fname)}` });
  res.end(buf);
}, { raw: true });

route('GET', '/api/versions/:id/print-model', ({ user, params }) => {
  const v = getVersion(params.id) || fail(404, 'ไม่พบเอกสาร');
  const m = docModel(user, v);
  const ids = m.content.steps.flatMap(s => s.images);
  const names = {};
  m.images.forEach((x, k) => { names[k] = x.name; });
  audit('version', v.id, 'print', '', user.id);
  return { ...m, images: names, logo: !!m.logo, logo_file_id: getSetting('logo_file_id'), imageIds: ids, attachmentsList: m.attachments };
});

route('GET', '/api/export/register.xlsx', ({ user, query, res }) => {
  const list = filterSops(listSops(user), query);
  const RS = { overdue: 'เลยกำหนดทบทวน', due_soon: 'ใกล้ถึงกำหนด', ok: 'ปกติ', none: '-' };
  const cols = [
    { header: 'SOP Number', width: 16 }, { header: 'SOP Title', width: 42 }, { header: 'Department', width: 20 },
    { header: 'Current Rev.', width: 11 }, { header: 'Status', width: 26 }, { header: 'Effective Date', width: 13 },
    { header: 'Next Review', width: 13 }, { header: 'Review Status', width: 16 }, { header: 'Owner', width: 22 },
    { header: 'Prepared By', width: 22 }, { header: 'Reviewed By', width: 22 }, { header: 'Approved By', width: 22 },
    { header: 'Approved Date', width: 13 }, { header: 'Working Rev.', width: 11 }, { header: 'Working Status', width: 26 }, { header: 'Last Updated', width: 17 },
  ];
  const rows = list.map(s => [
    s.sop_number, s.current?.title || s.title, `${s.dept_code} – ${s.dept_name}`, s.current?.rev || '-',
    s.is_obsolete ? STATUS.obsolete : s.current ? STATUS.published : 'ยังไม่ประกาศใช้', fmtD(s.current?.effective_date), fmtD(s.next_review_date),
    RS[s.review_state], s.owner_name, s.prepared_name, s.reviewed_name, s.approved_name, fmtD(s.current?.approved_at),
    s.working?.rev || '', s.working ? STATUS[s.working.status] : '', fmtDT(s.updated_at),
  ]);
  const buf = buildXlsx('SOP Register', cols, rows);
  audit('register', 0, 'export_xlsx', query, user.id);
  res.writeHead(200, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Length': buf.length, 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('SOP_Register_' + today() + '.xlsx')}` });
  res.end(buf);
}, { raw: true });

/* ===== Audit log (admin) ===== */
route('GET', '/api/audit', ({ user, query }) => {
  needRole(user, 'admin', 'manager');
  return all('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?', Math.min(Number(query.limit) || 200, 1000)).map(a => ({ ...a, user_name: uname(a.user_id) }));
});

/* ===== Real-time ===== */
route('GET', '/api/events', ({ user, req, res }) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  const id = crypto.randomBytes(8).toString('hex');
  clients.set(id, { res, userId: user.id, path: '' });
  res.write(`retry: 3000\ndata: ${JSON.stringify({ type: 'hello', client_id: id })}\n\n`);
  schedulePresence();
  req.on('close', () => { clients.delete(id); schedulePresence(); });
}, { raw: true });
route('POST', '/api/presence', ({ user, body }) => {
  const c = clients.get(String(body.client_id || ''));
  if (c && c.userId === user.id) { c.path = String(body.path || '').slice(0, 200); schedulePresence(); }
  return { ok: true };
});

/* ---------- HTTP server ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || !path.extname(rel)) rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(new HttpError(413, 'ข้อมูลใหญ่เกินไป')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
function sendJson(res, status, obj) {
  const s = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(s);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url.pathname);
  try {
    const r = routes.find(r => r.method === req.method && r.re.test(url.pathname));
    if (!r) fail(404, 'ไม่พบ API');
    const params = {};
    const mm = url.pathname.match(r.re); r.keys.forEach((k, i) => { params[k] = decodeURIComponent(mm[i + 1]); });
    const user = sessionUser(req);
    if (!r.opts.public && !user) fail(401, 'กรุณาเข้าสู่ระบบ');
    let body = {};
    if (req.method !== 'GET') {
      // ป้องกัน CSRF: คำสั่งที่เปลี่ยนข้อมูลต้องส่งเป็น JSON พร้อม header เฉพาะของแอป
      if (req.headers['x-sop-client'] !== '1') fail(403, 'คำขอไม่ถูกต้อง');
      const raw = await readBody(req);
      if (raw) { try { body = JSON.parse(raw); } catch { fail(400, 'JSON ไม่ถูกต้อง'); } }
    }
    const query = Object.fromEntries(url.searchParams);
    const out = await r.handler({ user, params, query, body, req, res });
    if (!r.opts.raw && !res.headersSent) sendJson(res, 200, out ?? { ok: true });
  } catch (e) {
    if (!(e instanceof HttpError)) console.error(e);
    if (!res.headersSent) sendJson(res, e.status || 500, { error: e instanceof HttpError ? e.message : 'เกิดข้อผิดพลาดภายในระบบ: ' + e.message });
  }
});

// เปิดเบราว์เซอร์อัตโนมัติเมื่อเปิดจากไอคอน (START.bat ตั้ง SOP_OPEN_BROWSER=1)
function openBrowser() {
  if (process.env.SOP_OPEN_BROWSER !== '1' || process.platform !== 'win32') return;
  require('child_process').spawn('cmd', ['/c', 'start', '', `http://localhost:${PORT}`], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}
server.on('error', e => {
  if (e.code === 'EADDRINUSE') {
    console.log(`\n  โปรแกรมเปิดอยู่แล้ว — กำลังเปิดหน้าเว็บ http://localhost:${PORT}`);
    openBrowser();
    setTimeout(() => process.exit(0), 500);
    return;
  }
  throw e;
});
const seededPw = D.seed();
server.listen(PORT, HOST, () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
  console.log('\n  Warehouse SOP Management System');
  console.log(`  เปิดบนเครื่องนี้:   http://localhost:${PORT}`);
  ips.forEach(ip => console.log(`  เครื่องอื่นในวง LAN: http://${ip}:${PORT}`));
  console.log(`  ฐานข้อมูล: ${path.join(D.DATA_DIR, 'sop.db')}`);
  console.log('\n  ** ย่อหน้าต่างนี้ไว้ได้ แต่อย่าปิด — ถ้าปิด ทุกคนจะเข้าเว็บไม่ได้ **');
  openBrowser();
  if (seededPw) console.log(`\n  สร้างบัญชีเริ่มต้นแล้ว: admin, manager, ob.head, ob.staff, ib.head, viewer\n  รหัสผ่านเริ่มต้น: ${seededPw}  (ระบบจะให้เปลี่ยนเมื่อเข้าใช้ครั้งแรก)\n`);
});

module.exports = { server };
