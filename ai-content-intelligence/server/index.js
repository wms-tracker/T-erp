// API server + Content Director (orchestration). No framework — node:http only.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// --- .env (server-side secrets) ---
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
process.chdir(ROOT);

const { load, save, flush, newId, now, audit, DEFAULT_SETTINGS } = await import('./db.js');
const { fetchAll } = await import('./sources.js');
const P = await import('./pipeline.js');
const AI = await import('./agents.js');
const { buildMock } = await import('./seed.js');
const { libraryView } = await import('./experts.js');
const { runMeeting, dailyDue } = await import('./meeting.js');
const { runVideoMeeting } = await import('./video-meeting.js');
const F = await import('./factory.js');

const PORT = Number(process.env.PORT || 5180);
const HOST = process.env.HOST || '127.0.0.1';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const db = load();

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const must = (cond, status, msg) => { if (!cond) throw new HttpError(status, msg); };

// ============ Content Director: one research cycle ============
let running = null;
async function runCycle(trigger = 'manual') {
  if (running) return running;
  running = (async () => {
    const run = { id: newId('r'), trigger, startedAt: now(), fetched: 0, newItems: 0, errors: [], perFeed: [] };
    try {
      // 1–2. Trend Hunter: fetch real feeds, keep link / publishedAt / discoveredAt
      const { items: raw, errors, perFeed } = await fetchAll(db.settings.feeds);
      run.fetched = raw.length; run.errors = errors; run.perFeed = perFeed;
      const byKey = new Map(db.items.map((i) => [i.url || `${i.source}|${i.title}`, i]));
      for (const r of raw) {
        const key = r.url || `${r.source}|${r.title}`;
        const ex = byKey.get(key);
        if (ex) { ex.lastSeenAt = now(); ex.relatedSources = r.relatedSources.length ? r.relatedSources : ex.relatedSources; if (r.trafficHint) ex.trafficHint = r.trafficHint; continue; }
        const it = { id: newId('i'), ...r, eventAt: null, discoveredAt: now(), lastSeenAt: now(), status: 'new', verificationBy: 'auto', isMock: false };
        it.category = P.categorize(it.title, it.summary);
        db.items.push(it); byKey.set(key, it); run.newItems++;
      }
      rescore();
      // prune stale, untouched real items (> 7 days)
      const keepIds = new Set(db.contents.map((c) => c.itemId));
      db.items = db.items.filter((i) => i.isMock || keepIds.has(i.id) || i.status !== 'new' || Date.now() - Date.parse(i.discoveredAt) < 7 * 864e5);
    } catch (e) {
      run.errors.push(String(e.message || e));
    }
    run.finishedAt = now();
    db.runs.unshift(run); db.runs.length = Math.min(db.runs.length, 200);
    audit('run', 'cycle', run.id, `ดึง ${run.fetched} รายการ ใหม่ ${run.newItems} ข้อผิดพลาด ${run.errors.length}`);
    save();
    return run;
  })().finally(() => { running = null; });
  return running;
}

// 3–4. dedup/cluster, verification, scoring (Analyst rules)
function rescore() {
  const maxAge = db.settings.maxItemAgeHours * 36e5;
  const pool = db.items.filter((i) => i.isMock || Date.now() - Date.parse(i.publishedAt || i.discoveredAt) < maxAge * 2);
  const real = pool.filter((i) => !i.isMock), mock = pool.filter((i) => i.isMock);
  const clusters = [...P.cluster(real), ...P.cluster(mock)];
  const trends = real.filter((i) => i.kind === 'trend');
  for (const c of clusters) {
    for (const m of c.members) if (m.verificationBy !== 'user') m.verification = P.classifyVerification(m);
    // promote to confirmed if several distinct outlets in the cluster
    const outlets = new Set(c.members.flatMap((m) => [m.source, ...(m.relatedSources || []).map((r) => r.source)]));
    for (const m of c.members) if (m.verificationBy !== 'user' && m.verification === 'unverified' && outlets.size >= 2 && !/ลือ|ว่อน/.test(m.title)) m.verification = 'confirmed';
    const primary = c.members[0];
    const prevAi = primary.score?.ai;
    primary.score = P.scoreItem(primary, { clusterMembers: c.members, trends, settings: db.settings });
    if (prevAi) applyAi(primary, prevAi);
    for (const m of c.members.slice(1)) m.score = null;
  }
}

function applyAi(item, ai) {
  const W = db.settings.weights, s = item.score;
  s.interest = Math.round(Math.min(1, Math.max(0, ai.interest)) * W.interest);
  s.fit = Math.round(Math.min(1, Math.max(0, ai.fit)) * W.fit);
  s.safety = Math.round(Math.min(1, Math.max(0, ai.safety)) * W.safety);
  const max = W.freshness + W.importance + W.interest + W.fit + W.safety;
  s.total = Math.round(((s.freshness + s.importance + s.interest + s.fit + s.safety) / max) * 100);
  s.method = 'rules+ai';
  s.ai = ai;
}

const clusterOf = (item) => db.items.filter((i) => i.clusterId && i.clusterId === item.clusterId);
const getItem = (id) => { const i = db.items.find((x) => x.id === id); must(i, 404, 'ไม่พบประเด็น'); return i; };
const getContent = (id) => { const c = db.contents.find((x) => x.id === id); must(c, 404, 'ไม่พบงานคอนเทนต์'); return c; };

// ============ capability report (shown on Overview, kept honest) ============
function capabilities() {
  const ai = AI.aiConfigured();
  return [
    { area: 'ค้นหาข่าวจากฟีด RSS จริง (Google News, Google Trends, สำนักข่าว)', state: 'ready', note: 'ทำงานทันที ไม่ต้องใช้ key' },
    { area: 'ตัดข่าวซ้ำ/รวมข่าวเดียวกันหลายแหล่ง, แยกยืนยันแล้ว/ยังไม่ยืนยัน/ความคิดเห็น', state: 'ready', note: 'กฎอัตโนมัติ ผู้ใช้แก้ไขได้' },
    { area: 'ให้คะแนน 100 และจัดอันดับ Top 10 + แนะนำ 5 ประเด็น', state: 'ready', note: 'กฎโปร่งใส ปรับน้ำหนักได้' },
    { area: 'วิเคราะห์คะแนนเชิงลึกด้วย AI', state: ai ? 'ready' : 'needs_config', note: ai ? (AI.aiProvider() === 'factory' ? 'ใช้ AI ของ Content Factory' : `ใช้ ${process.env.AI_MODEL || 'claude-opus-5-5'}`) : 'ตั้งค่า ANTHROPIC_API_KEY หรือเชื่อมต่อ Content Factory ใน .env' },
    { area: 'สร้างสคริปต์ Hook/Storyboard/แคปชั่น/แฮชแท็ก', state: ai ? 'ready' : 'partial', note: ai ? 'AI เขียนจากข้อมูลข่าวที่มี' : 'ตอนนี้เป็นแม่แบบจากหัวข่าวจริง ต้องแก้ไขเอง — ตั้ง API key เพื่อใช้ AI' },
    { area: 'Fact Check', state: ai ? 'ready' : 'partial', note: ai ? 'กฎ + AI ตรวจ claim เทียบแหล่งต้นทาง' : 'ตรวจด้วยกฎ (ลิงก์ วันที่ จำนวนแหล่ง ตัวเลข) — AI ตรวจ claim ต้องตั้ง key' },
    { area: 'ตรวจเทียบเนื้อข่าวเต็มจากหน้าเว็บ / ค้นเว็บเพิ่มเติม', state: 'not_built', note: 'ยังไม่พัฒนา — ปัจจุบันเทียบกับหัวข้อ/สรุปจากฟีดเท่านั้น' },
    { area: 'วิเคราะห์ผลโพสต์', state: 'ready', note: 'จากข้อมูลที่กรอกเอง/นำเข้า CSV' + (ai ? ' + สรุปด้วย AI' : '') },
    { area: 'ดึงยอดวิวอัตโนมัติจาก Facebook/TikTok/YouTube API', state: 'not_built', note: 'ยังไม่พัฒนา — ต้องมี OAuth/App review ของแต่ละแพลตฟอร์ม' },
    { area: 'โพสต์อัตโนมัติ', state: 'not_built', note: 'ตั้งใจไม่ทำใน MVP — อนุมัติแล้ว export ไปโพสต์เอง' },
    { area: 'คลัง Prompt ผู้เชี่ยวชาญ 6 คน + Prompt ประชุม + กติกาคุณภาพ', state: 'ready', note: 'คัดลอกไปใช้ใน Claude ได้ และระบบประชุมอัตโนมัติใช้ข้อความชุดเดียวกัน' },
    { area: 'ประชุมทีม AI อัตโนมัติ (ผู้เชี่ยวชาญ 5 คน → ประธานสรุปมติ → สร้างงานใน Dashboard)', state: ai ? 'ready' : 'needs_config', note: ai ? 'กดเริ่มประชุมได้ที่หน้า "ประชุมทีม AI"' : 'ตั้งค่า ANTHROPIC_API_KEY หรือเชื่อมต่อ Content Factory ใน .env' },
    { area: 'ประชุมอัตโนมัติทุกวัน', state: ai && db.settings.meetingDailyAt ? 'ready' : 'needs_config', note: db.settings.meetingDailyAt ? `ทุกวันเวลา ${db.settings.meetingDailyAt} น. (เวลาไทย)${ai ? '' : ' — แต่ยังไม่มี API key'}` : 'ตั้งเวลาในหน้าตั้งค่า' },
    { area: 'ตั้งเวลารันอัตโนมัติ', state: process.env.AUTO_RUN_MINUTES ? 'ready' : 'needs_config', note: process.env.AUTO_RUN_MINUTES ? `ทุก ${process.env.AUTO_RUN_MINUTES} นาที` : 'ตั้ง AUTO_RUN_MINUTES ใน .env' },
  ];
}

// ============ CSV ============
const csvCell = (v) => { const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function toCsv(rows, cols) { return '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(typeof c === 'function' ? c(r) : r[c])).join(','))].join('\r\n'); }
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((c) => c.trim()));
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

const PLATFORMS = ['facebook', 'reels', 'tiktok', 'shorts'];
const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));
function normalizePost(b) {
  must(PLATFORMS.includes(b.platform), 400, `platform ต้องเป็น ${PLATFORMS.join('/')}`);
  must(b.postedAt && !isNaN(Date.parse(b.postedAt)), 400, 'postedAt ไม่ถูกต้อง');
  return { contentId: b.contentId || null, title: String(b.title || '').slice(0, 200), platform: b.platform, postedAt: new Date(b.postedAt).toISOString(), views: num(b.views), avgWatchPct: num(b.avgWatchPct), shares: num(b.shares), comments: num(b.comments), likes: num(b.likes), url: b.url || null };
}

// ============ routes ============
const routes = [];
const route = (method, pattern, handler) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), handler });

route('GET', '/api/status', async () => ({
  aiConfigured: AI.aiConfigured(), aiProvider: AI.aiProvider(),
  model: AI.aiProvider() === 'anthropic' ? (process.env.AI_MODEL || 'claude-opus-5-5') : null,
  factory: await F.factoryStatus(),
  running: Boolean(running), lastRun: db.runs[0] || null, capabilities: capabilities(),
  counts: {
    items: db.items.filter((i) => i.isPrimary).length, real: db.items.filter((i) => !i.isMock && i.isPrimary).length, mock: db.items.filter((i) => i.isMock).length,
    byVerification: Object.fromEntries(['confirmed', 'unverified', 'opinion'].map((v) => [v, db.items.filter((i) => i.isPrimary && i.verification === v).length])),
    contentsByStatus: db.contents.reduce((a, c) => ((a[c.status] = (a[c.status] || 0) + 1), a), {}),
    posts: db.posts.length,
  },
  categories: P.CATEGORIES,
}));

route('POST', '/api/run', async () => runCycle('manual'));
route('GET', '/api/runs', () => db.runs.slice(0, 50));

route('GET', '/api/items', (req, q) => {
  let list = db.items.filter((i) => (q.get('all') === '1' ? true : i.isPrimary));
  if (q.get('mock') === '0') list = list.filter((i) => !i.isMock);
  if (q.get('mock') === 'only') list = list.filter((i) => i.isMock);
  const s = (q.get('q') || '').trim().toLowerCase();
  if (s) list = list.filter((i) => `${i.title} ${i.summary} ${i.source}`.toLowerCase().includes(s));
  for (const k of ['category', 'status', 'verification', 'source', 'kind']) if (q.get(k)) list = list.filter((i) => i[k] === q.get(k));
  if (q.get('minScore')) list = list.filter((i) => (i.score?.total ?? 0) >= Number(q.get('minScore')));
  const dateField = q.get('dateField') === 'discovered' ? 'discoveredAt' : 'publishedAt';
  if (q.get('from')) list = list.filter((i) => (i[dateField] || '') >= new Date(q.get('from')).toISOString());
  if (q.get('to')) list = list.filter((i) => (i[dateField] || '') <= new Date(q.get('to') + 'T23:59:59').toISOString());
  const sort = q.get('sort') || 'score';
  list.sort(sort === 'published' ? (a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || '') : sort === 'discovered' ? (a, b) => b.discoveredAt.localeCompare(a.discoveredAt) : (a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0));
  const sources = [...new Set(db.items.map((i) => i.source))].sort();
  return { total: list.length, items: list.slice(0, Number(q.get('limit') || 300)).map((i) => ({ ...i, clusterSize: clusterOf(i).length })), sources };
});

route('GET', '/api/items/:id', (req, q, p) => { const i = getItem(p.id); return { item: i, cluster: clusterOf(i).filter((c) => c.id !== i.id), contents: db.contents.filter((c) => c.itemId === i.id) }; });

route('PATCH', '/api/items/:id', (req, q, p, b) => {
  const i = getItem(p.id);
  if (b.status) { must(['new', 'shortlisted', 'selected', 'rejected'].includes(b.status), 400, 'status ไม่ถูกต้อง'); i.status = b.status; }
  if (b.verification) { must(['confirmed', 'unverified', 'opinion'].includes(b.verification), 400, 'verification ไม่ถูกต้อง'); i.verification = b.verification; i.verificationBy = 'user'; }
  if ('eventAt' in b) { must(!b.eventAt || !isNaN(Date.parse(b.eventAt)), 400, 'eventAt ไม่ถูกต้อง'); i.eventAt = b.eventAt ? new Date(b.eventAt).toISOString() : null; }
  if (b.category) { must(P.CATEGORIES.includes(b.category), 400, 'หมวดไม่ถูกต้อง'); i.category = b.category; }
  rescore();
  audit('update', 'item', i.id, JSON.stringify(b));
  return i;
});

route('GET', '/api/top', () => {
  const top = P.rankTop(db.items, 10);
  // Suggest only items that don't already have an active job; rejected jobs free the item again.
  const busy = new Set(db.contents.filter((c) => c.status !== 'rejected').map((c) => c.itemId));
  return { top, suggested: P.suggestFive(top.filter((i) => !busy.has(i.id))).map((i) => i.id) };
});

route('POST', '/api/analyze', async () => {
  const top = P.rankTop(db.items.filter((i) => !i.isMock), db.settings.aiAnalyzeTopN);
  must(AI.aiConfigured(), 400, 'ยังไม่ได้ตั้งค่า AI (ANTHROPIC_API_KEY หรือ FACTORY_URL + FACTORY_TOKEN)');
  must(top.length, 400, 'ยังไม่มีประเด็นให้วิเคราะห์ — กด "เริ่มรอบค้นหา" ก่อน');
  const out = await AI.analyzeItems(top, db.settings);
  let n = 0;
  for (const r of out.data.items) {
    const it = db.items.find((i) => i.id === r.id);
    if (!it?.score) continue;
    applyAi(it, { interest: r.interest, fit: r.fit, safety: r.safety, angle: r.angle, reason: r.reason, risks: r.risks, model: out.model, at: now() });
    n++;
  }
  audit('ai-analyze', 'items', '-', `AI วิเคราะห์ ${n} ประเด็น`);
  save();
  return { analyzed: n, usage: out.usage };
});

// ---- contents ----
route('GET', '/api/contents', () => db.contents.map((c) => ({ ...c, item: db.items.find((i) => i.id === c.itemId) || null })));
route('GET', '/api/contents/:id', (req, q, p) => { const c = getContent(p.id); const item = db.items.find((i) => i.id === c.itemId); return { ...c, item, cluster: item ? clusterOf(item).filter((x) => x.id !== item.id) : [] }; });
/** Create (or return the existing) content job for an item. `meeting` carries the AI meeting's resolution. */
function createContentFor(item, meeting = null) {
  const existing = db.contents.find((c) => c.itemId === item.id && c.status !== 'rejected');
  if (existing) { if (meeting && !existing.meeting) existing.meeting = meeting; return existing; }
  const platforms = meeting?.platforms?.length ? meeting.platforms.filter((x) => PLATFORMS.includes(x)) : ['tiktok', 'reels', 'facebook', 'shorts'];
  const c = { id: newId('c'), itemId: item.id, title: item.title, status: 'draft', platforms, script: null, factCheck: null, approval: null, meeting, history: [], isMock: !!item.isMock, createdAt: now(), updatedAt: now() };
  db.contents.unshift(c);
  item.status = 'selected';
  audit('create', 'content', c.id, meeting ? `จากมติประชุม ${meeting.meetingId}: ${item.title}` : item.title);
  save();
  return c;
}
route('POST', '/api/contents', (req, q, p, b) => createContentFor(getItem(b.itemId)));
route('PATCH', '/api/contents/:id', (req, q, p, b) => {
  const c = getContent(p.id);
  must(!['approved', 'published_manual'].includes(c.status) || !b.script, 409, 'งานที่อนุมัติแล้วแก้สคริปต์ไม่ได้ — ส่งกลับไปแก้ไขก่อน');
  if (b.title) c.title = String(b.title).slice(0, 300);
  if (b.platforms) { must(Array.isArray(b.platforms) && b.platforms.every((x) => PLATFORMS.includes(x)), 400, 'platforms ไม่ถูกต้อง'); c.platforms = b.platforms; }
  if (b.script) { c.script = { ...c.script, ...b.script, editedByUser: true }; c.factCheck = null; if (['fact_check', 'awaiting_approval'].includes(c.status)) c.status = 'scripting'; }
  if (b.status === 'scripting' && ['approved', 'awaiting_approval', 'rejected'].includes(c.status)) { c.status = 'scripting'; c.approval = null; }
  c.updatedAt = now();
  audit('update', 'content', c.id, Object.keys(b).join(','));
  save();
  return c;
});
route('DELETE', '/api/contents/:id', (req, q, p) => { const c = getContent(p.id); db.contents = db.contents.filter((x) => x !== c); audit('delete', 'content', c.id, c.title); save(); return { ok: true }; });

route('POST', '/api/contents/:id/script', async (req, q, p, b) => {
  const c = getContent(p.id); const item = getItem(c.itemId);
  must(!['approved', 'published_manual'].includes(c.status), 409, 'งานที่อนุมัติแล้วสร้างสคริปต์ใหม่ไม่ได้');
  const durationSec = Math.min(90, Math.max(30, Number(b.durationSec) || 60));
  const platforms = Array.isArray(b.platforms) && b.platforms.length ? b.platforms.filter((x) => PLATFORMS.includes(x)) : c.platforms;
  const cl = clusterOf(item);
  let script;
  if (b.mode === 'ai') {
    must(AI.aiConfigured(), 400, 'ยังไม่ได้ตั้งค่า AI (ANTHROPIC_API_KEY หรือ FACTORY_URL + FACTORY_TOKEN) — ใช้โหมดแม่แบบแทนได้');
    must(!item.isMock, 400, 'ไม่ส่งข้อมูลจำลองให้ AI — ใช้โหมดแม่แบบ');
    script = await AI.generateScript(item, cl, { durationSec, platforms, tone: b.tone, brief: c.meeting }, db.settings);
  } else {
    script = P.templateScript(item, cl, { durationSec, platforms });
  }
  c.script = { ...script, createdAt: now() };
  c.platforms = platforms; c.status = 'scripting'; c.factCheck = null; c.updatedAt = now();
  audit('script', 'content', c.id, `สร้างสคริปต์ (${script.generatedBy})`);
  save();
  return c;
});

route('POST', '/api/contents/:id/factcheck', async (req, q, p, b) => {
  const c = getContent(p.id); const item = getItem(c.itemId);
  const cl = clusterOf(item);
  const fc = P.ruleFactCheck(c, item, cl);
  fc.method = 'rules';
  if (b.useAI && c.script) {
    must(AI.aiConfigured(), 400, 'ยังไม่ได้ตั้งค่า AI (ANTHROPIC_API_KEY หรือ FACTORY_URL + FACTORY_TOKEN)');
    must(!item.isMock, 400, 'ไม่ส่งข้อมูลจำลองให้ AI');
    const ai = await AI.checkClaims(c.script, item, cl);
    fc.claims = ai.claims; fc.aiSummary = ai.summary; fc.method = 'rules+ai'; fc.model = ai.model;
    for (const cl2 of ai.claims) {
      if (cl2.verdict === 'contradicted') fc.checks.push({ level: 'fail', label: 'ข้ออ้างขัดกับแหล่ง', detail: cl2.claim });
      else if (cl2.verdict === 'not_found') fc.checks.push({ level: 'warn', label: 'ข้ออ้างไม่พบในแหล่ง', detail: cl2.claim });
    }
    fc.status = fc.checks.some((x) => x.level === 'fail') ? 'fail' : fc.checks.some((x) => x.level === 'warn') ? 'warn' : 'pass';
  }
  fc.checkedAt = now();
  c.factCheck = fc;
  if (c.script && ['draft', 'scripting', 'fact_check'].includes(c.status)) c.status = 'awaiting_approval';
  c.updatedAt = now();
  audit('factcheck', 'content', c.id, `ผล: ${fc.status} (${fc.method})`);
  save();
  return c;
});

route('POST', '/api/contents/:id/approve', (req, q, p, b) => {
  const c = getContent(p.id);
  must(c.script, 400, 'ยังไม่มีสคริปต์');
  must(c.factCheck, 400, 'ต้องผ่าน Fact Check ก่อนอนุมัติ');
  must(!c.isMock, 400, 'ข้อมูลจำลองอนุมัติเพื่อเผยแพร่ไม่ได้');
  const override = c.factCheck.status === 'fail';
  must(!override || (b.overrideReason && b.overrideReason.trim().length >= 10), 400, 'Fact Check มีรายการไม่ผ่าน — ต้องกรอกเหตุผล override อย่างน้อย 10 ตัวอักษร');
  c.status = 'approved';
  c.approval = { approvedAt: now(), note: b.note || '', override, overrideReason: b.overrideReason || null };
  audit('approve', 'content', c.id, override ? `override: ${b.overrideReason}` : 'อนุมัติ');
  save();
  return c;
});
route('POST', '/api/contents/:id/reject', (req, q, p, b) => { const c = getContent(p.id); c.status = 'rejected'; c.approval = { rejectedAt: now(), note: b.note || '' }; audit('reject', 'content', c.id, b.note || ''); save(); return c; });
route('POST', '/api/contents/:id/mark-published', (req, q, p, b) => {
  const c = getContent(p.id);
  must(c.status === 'approved', 400, 'ต้องอนุมัติก่อนจึงบันทึกว่าโพสต์แล้ว');
  c.status = 'published_manual'; c.publishedNote = { at: now(), urls: b.urls || {} };
  audit('mark-published', 'content', c.id, 'ผู้ใช้บันทึกว่าโพสต์เองแล้ว (ระบบไม่ได้โพสต์)');
  save();
  return c;
});

// ---- performance ----
route('GET', '/api/posts', () => db.posts);
route('POST', '/api/posts', (req, q, p, b) => { const post = { id: newId('p'), ...normalizePost(b), source: 'manual', isMock: false, createdAt: now() }; db.posts.push(post); audit('create', 'post', post.id, `${post.platform} ${post.views ?? '-'} views`); save(); return post; });
route('DELETE', '/api/posts/:id', (req, q, p) => { db.posts = db.posts.filter((x) => x.id !== p.id); audit('delete', 'post', p.id); save(); return { ok: true }; });
route('POST', '/api/posts/import', (req, q, p, b) => {
  const rows = parseCsv(String(b.csv || ''));
  must(rows.length, 400, 'CSV ว่างหรือไม่มีหัวคอลัมน์');
  const added = [], errors = [];
  rows.forEach((r, i) => { try { const post = { id: newId('p'), ...normalizePost(r), source: 'csv', isMock: false, createdAt: now() }; db.posts.push(post); added.push(post.id); } catch (e) { errors.push(`แถว ${i + 2}: ${e.message}`); } });
  audit('import', 'posts', '-', `นำเข้า ${added.length} แถว ผิดพลาด ${errors.length}`);
  save();
  return { added: added.length, errors };
});
route('GET', '/api/performance', (req, q) => { const posts = q.get('mock') === '0' ? db.posts.filter((x) => !x.isMock) : db.posts; return P.perfStats(posts); });
route('POST', '/api/performance/insights', async () => {
  must(AI.aiConfigured(), 400, 'ยังไม่ได้ตั้งค่า AI (ANTHROPIC_API_KEY หรือ FACTORY_URL + FACTORY_TOKEN)');
  const real = db.posts.filter((x) => !x.isMock);
  must(real.length >= 2, 400, 'ต้องมีข้อมูลโพสต์จริงอย่างน้อย 2 รายการ (ไม่ใช้ข้อมูลจำลองกับ AI)');
  const stats = P.perfStats(real);
  return AI.performanceInsights({ rows: stats.rows.slice(0, 30).map(({ id, ...r }) => r), byPlatform: stats.byPlatform });
});

// ---- expert prompt library & AI team meeting ----
route('GET', '/api/experts', () => libraryView());

let meetingRunning = null;
function startVideoMeeting(videoId) {
  if (meetingRunning) return meetingRunning;
  meetingRunning = runVideoMeeting({ db, ask: AI.askRaw, getVideo: F.getFactoryVideo, perfStats: P.perfStats, newId, now, audit, save }, { videoId })
    .finally(() => { meetingRunning = null; });
  return meetingRunning;
}
function startMeeting(trigger) {
  if (meetingRunning) return meetingRunning;
  meetingRunning = runMeeting({ db, ask: AI.askRaw, rankTop: P.rankTop, perfStats: P.perfStats, newId, now, audit, save, createContentFor }, { trigger })
    .finally(() => { meetingRunning = null; });
  return meetingRunning;
}
const meetingSummary = (m) => ({ id: m.id, mode: m.mode || 'news', video: m.video || null, verdict: m.result?.verdict || null, trigger: m.trigger, status: m.status, startedAt: m.startedAt, finishedAt: m.finishedAt, error: m.error, usage: m.usage,
  steps: m.steps.map((s) => ({ expertId: s.expertId, name: s.name, ok: s.ok, ms: s.ms })),
  produce: m.result?.decisions?.filter((d) => d.decision === 'produce').length ?? 0, created: m.createdContentIds?.length ?? 0,
  openTasks: m.result?.assignments?.filter((a) => !a.done).length ?? 0 });

// ---------- Content Factory ----------
route('GET', '/api/factory/videos', async () => {
  must(F.factoryConfigured(), 400, 'ยังไม่ได้เชื่อมต่อ Content Factory');
  return F.listFactoryVideos();
});
route('POST', '/api/contents/:id/send-to-factory', async (req, q, p) => {
  const c = getContent(p.id);
  must(['approved', 'published_manual'].includes(c.status), 409, 'ส่งได้เฉพาะงานที่ผ่าน Fact Check และอนุมัติแล้ว');
  must(c.script && !c.isMock, 400, 'งานนี้ไม่มีสคริปต์ หรือเป็นข้อมูลจำลอง');
  const item = db.items.find((i) => i.id === c.itemId);
  const sources = [item, ...(item?.relatedSources || [])].filter(Boolean).slice(0, 10).map((x) => ({ name: String(x.source || '').slice(0, 200), url: String(x.url || '').slice(0, 2000) }));
  const sent = await F.sendScriptToFactory({
    externalId: c.id, source: 'AI Content Intelligence', title: String(c.title).slice(0, 300),
    hook: String(c.script.hook || '').slice(0, 500), durationSec: Number(c.script.durationSec) || null,
    scenes: (c.script.scenes || []).slice(0, 40).map((x) => ({ t: String(x.t || '').slice(0, 40), visual: String(x.visual || '').slice(0, 1000), narration: String(x.narration || '').slice(0, 2000), onScreenText: String(x.onScreenText || '').slice(0, 300) })),
    caption: String(c.script.caption || '').slice(0, 5000), hashtags: (c.script.hashtags || []).slice(0, 40).map((h) => String(h).slice(0, 80)),
    sources, approvedAt: c.approval?.approvedAt || null,
  });
  c.sentToFactory = { at: now(), briefId: sent.id };
  audit('factory', 'content', c.id, 'ส่งสคริปต์ไป Content Factory');
  save();
  return c;
});

route('GET', '/api/meetings', () => ({ running: Boolean(meetingRunning), meetings: db.meetings.slice(0, 60).map(meetingSummary) }));
route('GET', '/api/meetings/:id', (req, q, p) => {
  const m = db.meetings.find((x) => x.id === p.id); must(m, 404, 'ไม่พบการประชุม');
  const items = Object.fromEntries((m.itemIds || []).map((id) => { const i = db.items.find((x) => x.id === id); return [id, i ? { id, title: i.title, source: i.source, url: i.url, verification: i.verification, score: i.score?.total, isMock: i.isMock } : { id, title: '(ลบไปแล้ว)' }]; }));
  return { ...m, items, contents: db.contents.filter((c) => m.createdContentIds.includes(c.id)).map((c) => ({ id: c.id, itemId: c.itemId, status: c.status, title: c.title })) };
});
route('POST', '/api/meetings', async (req, q, p, b) => {
  must(AI.aiConfigured(), 400, 'ยังไม่ได้ตั้งค่า AI — ใส่ ANTHROPIC_API_KEY หรือเชื่อมต่อ Content Factory (FACTORY_URL + FACTORY_TOKEN) ใน .env');
  must(!meetingRunning, 409, 'กำลังประชุมอยู่');
  if (AI.aiProvider() === 'factory') {
    const st = await F.factoryStatus();
    must(!st?.error, 502, st?.error);
    must(st?.llm?.configured, 400, 'Content Factory ยังไม่ได้ตั้งค่า AI — ใส่ Gemini API key ในการตั้งค่า AI ของ Factory (หรือใช้ Ollama)');
  }
  if (b.videoId) {
    must(F.factoryConfigured(), 400, 'ยังไม่ได้เชื่อมต่อ Content Factory');
    must(/^[0-9a-f-]{36}$/i.test(String(b.videoId)), 400, 'videoId ไม่ถูกต้อง');
    const video = await F.getFactoryVideo(b.videoId); // fails early when it is not there
    startVideoMeeting(video.video.id).catch((e) => console.error('video meeting:', e.message));
    await new Promise((r) => setTimeout(r, 50));
    return { started: true, id: db.meetings[0]?.id };
  }
  must(P.rankTop(db.items.filter((i) => !i.isMock), 1).length, 400, 'ยังไม่มีประเด็นจริงให้ประชุม — กด "เริ่มรอบค้นหา" ก่อน');
  startMeeting('manual').catch((e) => console.error('meeting:', e.message));
  await new Promise((r) => setTimeout(r, 50)); // let runMeeting register the meeting record
  return { started: true, id: db.meetings[0]?.id };
});
route('PATCH', '/api/meetings/:id/tasks/:tid', (req, q, p, b) => {
  const m = db.meetings.find((x) => x.id === p.id); must(m?.result, 404, 'ไม่พบการประชุม');
  const t = m.result.assignments.find((x) => x.id === p.tid); must(t, 404, 'ไม่พบงาน');
  t.done = Boolean(b.done); t.doneAt = t.done ? now() : null;
  audit('task', 'meeting', m.id, `${t.done ? 'เสร็จ' : 'เปิดใหม่'}: ${t.task}`);
  save();
  return t;
});

// ---- settings / audit / export / mock ----
route('GET', '/api/settings', () => db.settings);
route('PUT', '/api/settings', (req, q, p, b) => {
  const s = db.settings;
  if (b.pageName != null) s.pageName = String(b.pageName).slice(0, 100);
  if (Array.isArray(b.pageCategories)) s.pageCategories = b.pageCategories.filter((x) => P.CATEGORIES.includes(x));
  if (Array.isArray(b.avoidKeywords)) s.avoidKeywords = b.avoidKeywords.map((x) => String(x).trim()).filter(Boolean).slice(0, 100);
  if (b.maxItemAgeHours) s.maxItemAgeHours = Math.min(336, Math.max(6, Number(b.maxItemAgeHours)));
  if (b.aiAnalyzeTopN) s.aiAnalyzeTopN = Math.min(40, Math.max(5, Number(b.aiAnalyzeTopN)));
  if ('meetingDailyAt' in b) { must(!b.meetingDailyAt || /^([01]?\d|2[0-3]):[0-5]\d$/.test(b.meetingDailyAt), 400, 'เวลาประชุมต้องเป็นรูปแบบ HH:MM'); s.meetingDailyAt = b.meetingDailyAt || ''; }
  if (b.weights) for (const k of Object.keys(DEFAULT_SETTINGS.weights)) if (b.weights[k] != null) s.weights[k] = Math.min(50, Math.max(0, Number(b.weights[k]) || 0));
  if (Array.isArray(b.feeds)) {
    s.feeds = b.feeds.map((f) => {
      must(/^https?:\/\//i.test(f.url || ''), 400, `URL ฟีดไม่ถูกต้อง: ${f.name || f.url}`);
      return { id: f.id || newId('f'), name: String(f.name || f.url).slice(0, 80), url: f.url, type: ['news', 'trends', 'opinion'].includes(f.type) ? f.type : 'news', credibility: ['high', 'medium', 'low'].includes(f.credibility) ? f.credibility : 'medium', enabled: f.enabled !== false };
    });
  }
  rescore();
  audit('update', 'settings', '-', Object.keys(b).join(','));
  save();
  return s;
});
route('POST', '/api/feeds/test', async (req, q, p, b) => {
  const { fetchFeed } = await import('./sources.js');
  const items = await fetchFeed({ id: 'test', name: b.name || 'test', url: b.url, type: b.type || 'news' });
  return { ok: true, count: items.length, sample: items.slice(0, 3).map((i) => ({ title: i.title, publishedAt: i.publishedAt, url: i.url })) };
});
route('GET', '/api/audit', (req, q) => db.audit.slice(0, Number(q.get('limit') || 300)));
route('POST', '/api/mock', () => { const m = buildMock(); db.items.push(...m.items); db.posts.push(...m.posts); rescore(); audit('mock', 'seed', '-', 'เพิ่มข้อมูลจำลอง'); save(); return { items: m.items.length, posts: m.posts.length }; });
route('DELETE', '/api/mock', () => {
  const ids = new Set(db.items.filter((i) => i.isMock).map((i) => i.id));
  db.items = db.items.filter((i) => !i.isMock); db.posts = db.posts.filter((x) => !x.isMock); db.contents = db.contents.filter((c) => !ids.has(c.itemId));
  audit('mock', 'delete', '-', 'ลบข้อมูลจำลองทั้งหมด'); save(); return { ok: true };
});

const EXPORTS = {
  items: () => [db.items.filter((i) => i.isPrimary), ['id', 'title', 'category', 'verification', 'status', (r) => r.score?.total, (r) => r.score?.method, 'source', 'url', 'publishedAt', 'eventAt', 'discoveredAt', 'trafficHint', 'isMock'], ['id', 'title', 'category', 'verification', 'status', 'score', 'scoreMethod', 'source', 'url', 'publishedAt', 'eventAt', 'discoveredAt', 'trafficHint', 'isMock']],
  contents: () => [db.contents, ['id', 'title', 'status', (r) => r.platforms.join('|'), (r) => r.script?.generatedBy, (r) => r.script?.hook, (r) => r.script?.caption, (r) => r.script?.hashtags?.join(' '), (r) => r.factCheck?.status, (r) => r.approval?.approvedAt, 'createdAt', 'isMock'], ['id', 'title', 'status', 'platforms', 'scriptBy', 'hook', 'caption', 'hashtags', 'factCheck', 'approvedAt', 'createdAt', 'isMock']],
  posts: () => [db.posts, ['id', 'contentId', 'title', 'platform', 'postedAt', 'views', 'avgWatchPct', 'shares', 'comments', 'likes', 'source', 'isMock'], null],
  audit: () => [db.audit, ['at', 'action', 'entity', 'entityId', 'detail'], null],
  meetings: () => [db.meetings, ['id', 'trigger', 'status', 'startedAt', 'finishedAt', (r) => r.result?.summary, (r) => (r.result?.decisions || []).map((d) => `${d.decision}:${d.itemId}`).join(' | '), (r) => (r.result?.assignments || []).map((a) => `${a.owner}: ${a.task}${a.done ? ' ✓' : ''}`).join(' | '), 'error'], ['id', 'trigger', 'status', 'startedAt', 'finishedAt', 'summary', 'decisions', 'assignments', 'error']],
};

// ============ http plumbing ============
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' };
const send = (res, status, body, type = 'application/json; charset=utf-8', extra = {}) => { res.writeHead(status, { 'content-type': type, 'x-content-type-options': 'nosniff', ...extra }); res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };

async function readBody(req) {
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > 2e6) throw new HttpError(413, 'ข้อมูลใหญ่เกิน 2MB'); chunks.push(c); }
  if (!size) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400, 'JSON ไม่ถูกต้อง'); }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && ADMIN_TOKEN && req.headers['x-admin-token'] !== ADMIN_TOKEN) throw new HttpError(401, 'ต้องมี x-admin-token');
      if (url.pathname === '/api/export') {
        const type = url.searchParams.get('type'), fmt = url.searchParams.get('format') || 'csv';
        must(EXPORTS[type], 400, 'type ไม่ถูกต้อง');
        const [rows, cols, names] = EXPORTS[type]();
        const stamp = new Date().toISOString().slice(0, 10);
        if (fmt === 'json') return send(res, 200, JSON.stringify(rows, null, 2), 'application/json; charset=utf-8', { 'content-disposition': `attachment; filename="${type}-${stamp}.json"` });
        const csv = toCsv(rows, cols).replace(/^﻿[^\r\n]*/, '﻿' + (names || cols).join(','));
        return send(res, 200, csv, 'text/csv; charset=utf-8', { 'content-disposition': `attachment; filename="${type}-${stamp}.csv"` });
      }
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = url.pathname.match(r.re);
        if (!m) continue;
        const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : {};
        const confirmed = req.headers['x-ai-confirmed'] === '1';
        return send(res, 200, await F.aiContext.run({ confirmed }, () => r.handler(req, url.searchParams, m.groups || {}, body)));
      }
      throw new HttpError(404, 'ไม่พบ API');
    }
    // static
    let file = path.join(ROOT, 'public', url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
    if (!file.startsWith(path.join(ROOT, 'public')) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(ROOT, 'public', 'index.html');
    send(res, 200, fs.readFileSync(file), MIME[path.extname(file)] || 'application/octet-stream');
  } catch (e) {
    const status = e.status || (e.constructor?.name?.includes('APIError') ? 502 : 500);
    if (status >= 500) console.error(e);
    send(res, status, { error: e.message || String(e) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`AI Content Intelligence → http://${HOST}:${PORT}  (AI: ${AI.aiProvider() === 'factory' ? 'ผ่าน Content Factory' : AI.aiConfigured() ? 'Claude' : 'ปิด — ใช้กฎ/แม่แบบ'})`);
});
if (Number(process.env.AUTO_RUN_MINUTES) > 0) setInterval(() => runCycle('schedule'), Number(process.env.AUTO_RUN_MINUTES) * 60e3);

// Daily meeting: fresh research cycle, then the full expert meeting. Checked every minute.
setInterval(async () => {
  if (!AI.aiConfigured() || meetingRunning || !dailyDue(db.settings.meetingDailyAt, db.meetings)) return;
  if (AI.aiProvider() === 'factory') {
    const st = await F.factoryStatus();
    if (!st?.llm?.local && !st?.autoAi) return; // Content Factory asks first: nobody is here to say yes
  }
  try { await runCycle('schedule'); await startMeeting('schedule'); } catch (e) { console.error('daily meeting:', e.message); }
}, 60e3);
process.on('SIGINT', () => { flush(); process.exit(0); });
