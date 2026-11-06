// UI layer. Talks only to /api/*. Every string from feeds is escaped before rendering.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : null);
const link = (u, text) => (safeUrl(u) ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(text || u)}</a>` : `<span class="muted">${esc(text || 'ไม่มีลิงก์')}</span>`);
const fmt = (iso, withTime = true) => (iso ? new Date(iso).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', ...(withTime ? { timeStyle: 'short' } : {}) }) : '—');
const ago = (iso) => { if (!iso) return '—'; const m = (Date.now() - Date.parse(iso)) / 6e4; return m < 60 ? `${Math.max(1, Math.round(m))} นาทีที่แล้ว` : m < 1440 ? `${Math.round(m / 60)} ชม.ที่แล้ว` : `${Math.round(m / 1440)} วันที่แล้ว`; };
const n = (v) => (v == null ? '—' : Number(v).toLocaleString('th-TH'));

/** AI runs through Content Factory, which is set to ask before AI that may cost money */
const aiNeedsYes = () => STATUS?.aiProvider === 'factory' && STATUS.factory?.llm?.configured && !STATUS.factory.llm.local && !STATUS.factory.autoAi;
const askAiYes = () => confirm(`งานนี้ใช้ AI ของ Content Factory (${STATUS?.factory?.llm?.provider || ''} ${STATUS?.factory?.llm?.model || ''}) ซึ่งอาจมีค่าใช้จ่าย — ยืนยันใช้ AI?`);
async function api(path, opts = {}) {
  let confirmed = opts.ai && aiNeedsYes() ? (askAiYes() || (() => { throw new Error('ยกเลิกแล้ว — ไม่ได้ใช้ AI'); })()) : false;
  for (;;) {
    const headers = { ...(opts.body ? { 'content-type': 'application/json' } : {}), ...(confirmed ? { 'x-ai-confirmed': '1' } : {}) };
    const res = await fetch(path, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return data;
    // Content Factory refused before running anything: ask once, then send again
    if (!confirmed && /ถามก่อนใช้ AI/.test(data.error || '')) {
      if (!askAiYes()) throw new Error('ยกเลิกแล้ว — ไม่ได้ใช้ AI');
      confirmed = true;
      continue;
    }
    throw new Error(data.error || `HTTP ${res.status}`);
  }
}
function toast(msg, err = false) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), err ? 6000 : 2800);
}
async function act(btn, fn, okMsg) {
  const label = btn?.textContent; if (btn) { btn.disabled = true; btn.textContent = 'กำลังทำงาน…'; }
  try { const r = await fn(); if (okMsg) toast(typeof okMsg === 'function' ? okMsg(r) : okMsg); return r; }
  catch (e) { toast(e.message, true); throw e; }
  finally { if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = label; } }
}
function drawer(html) { $('#drawerBody').innerHTML = html; $('#drawer').hidden = false; }
const closeDrawer = () => ($('#drawer').hidden = true);
$('#drawer').addEventListener('click', (e) => { if (e.target.id === 'drawer' || e.target.dataset.close != null) closeDrawer(); });

// ---------- labels ----------
const VER = { confirmed: ['ok', 'ยืนยันหลายแหล่ง'], unverified: ['warn', 'ยังไม่ยืนยัน'], opinion: ['op', 'ความคิดเห็น'] };
const verTag = (v) => `<span class="tag ${VER[v]?.[0] || ''}">${VER[v]?.[1] || esc(v)}</span>`;
const ITEM_ST = { new: 'ใหม่', shortlisted: 'คัดไว้', selected: 'เลือกทำคลิป', rejected: 'ตัดทิ้ง' };
const C_ST = { draft: 'ร่าง', scripting: 'เขียนสคริปต์', fact_check: 'ตรวจข้อเท็จจริง', awaiting_approval: 'รออนุมัติ', approved: 'อนุมัติแล้ว', published_manual: 'โพสต์แล้ว (บันทึกเอง)', rejected: 'ไม่ใช้' };
const C_ST_TAG = { approved: 'ok', published_manual: 'ok', awaiting_approval: 'warn', rejected: 'bad' };
const cTag = (s) => `<span class="tag ${C_ST_TAG[s] || ''}">${C_ST[s] || esc(s)}</span>`;
const FC = { pass: ['ok', 'ผ่าน'], warn: ['warn', 'มีข้อควรระวัง'], fail: ['bad', 'ไม่ผ่าน'] };
const fcTag = (s) => (s ? `<span class="tag ${FC[s][0]}">${FC[s][1]}</span>` : '<span class="tag">ยังไม่ตรวจ</span>');
const mockTag = (x) => (x?.isMock ? ' <span class="tag mock">ข้อมูลจำลอง</span>' : '');
const methodTag = (m) => (m === 'rules+ai' ? '<span class="tag ai">กฎ + AI</span>' : '<span class="tag">กฎอัตโนมัติ</span>');
const PLAT = { facebook: 'Facebook', reels: 'Reels', tiktok: 'TikTok', shorts: 'YouTube Shorts' };

let STATUS = null;
async function refreshStatus() {
  STATUS = await api('/api/status');
  const aiName = STATUS.aiProvider === 'factory' ? `ผ่าน Content Factory${STATUS.factory?.llm ? ` · ${STATUS.factory.llm.model}` : ''}` : STATUS.model;
  $('#aiBadge').innerHTML = STATUS.aiConfigured ? `<span class="tag ai">AI เปิดใช้งาน</span><div class="muted small">${esc(aiName)}</div>${STATUS.factory?.error ? `<div class="down small">${esc(STATUS.factory.error)}</div>` : ''}` : `<span class="tag warn">AI ยังไม่ตั้งค่า</span><div class="muted small">ใช้โหมดกฎ/แม่แบบ</div>`;
  const r = STATUS.lastRun;
  $('#runInfo').textContent = STATUS.running ? 'กำลังค้นหา…' : r ? `รอบล่าสุด ${ago(r.finishedAt)}` : 'ยังไม่เคยค้นหา';
}
$('#runBtn').addEventListener('click', (e) => act(e.target, () => api('/api/run', { method: 'POST' }), (r) => `ค้นหาเสร็จ: ดึง ${r.fetched} รายการ ใหม่ ${r.newItems}${r.errors.length ? ` · ฟีดผิดพลาด ${r.errors.length}` : ''}`).then(render));

// ================= pages =================
const PAGES = {};
const TITLES = { overview: 'ภาพรวม', news: 'ข่าวและเทรนด์', planner: 'วางแผนคอนเทนต์', studio: 'สตูดิโอสคริปต์', factcheck: 'ตรวจข้อเท็จจริง', performance: 'วิเคราะห์ผลโพสต์', meeting: 'ประชุมทีม AI', prompts: 'คลัง Prompt ผู้เชี่ยวชาญ', settings: 'ตั้งค่า' };

// ---------- Overview ----------
PAGES.overview = async (v) => {
  const [top, contents, audit] = await Promise.all([api('/api/top'), api('/api/contents'), api('/api/audit?limit=8')]);
  const c = STATUS.counts, r = STATUS.lastRun;
  const capTag = { ready: ['ok', 'ใช้งานได้'], needs_config: ['warn', 'ต้องตั้งค่า'], partial: ['warn', 'ใช้ได้บางส่วน'], not_built: ['bad', 'ยังไม่พัฒนา'] };
  v.innerHTML = `
  ${c.mock ? `<div class="banner mock">มีข้อมูลจำลอง ${c.mock} รายการในระบบ (ติดป้าย "ข้อมูลจำลอง") — ไม่ใช่ข่าวจริง ลบได้ที่หน้าตั้งค่า</div>` : ''}
  ${!r ? `<div class="banner info">ยังไม่มีข้อมูล กด <b>เริ่มรอบค้นหา</b> มุมขวาบนเพื่อดึงข่าวจริงจากฟีดที่ตั้งค่าไว้</div>` : ''}
  <div class="grid g4">
    <div class="card kpi"><div class="v">${n(c.real)}</div><div class="l">ประเด็นจริง (หลังรวมข่าวซ้ำ)</div></div>
    <div class="card kpi"><div class="v">${n(c.byVerification.confirmed)}</div><div class="l">${verTag('confirmed')}</div></div>
    <div class="card kpi"><div class="v">${n(c.byVerification.unverified)}</div><div class="l">${verTag('unverified')}</div></div>
    <div class="card kpi"><div class="v">${n(c.byVerification.opinion)}</div><div class="l">${verTag('opinion')}</div></div>
    <div class="card kpi"><div class="v">${n(contents.filter((x) => x.status === 'awaiting_approval').length)}</div><div class="l">งานรออนุมัติ</div></div>
    <div class="card kpi"><div class="v">${n(contents.filter((x) => x.status === 'approved').length)}</div><div class="l">อนุมัติแล้ว (พร้อมโพสต์เอง)</div></div>
  </div>
  <div class="grid g2" style="margin-top:14px">
    <div class="card"><div class="row"><h2>Top 10 ประเด็นตอนนี้</h2><span class="spacer"></span><a href="#/planner">เลือก 5 ประเด็น →</a></div>
      ${top.top.length ? top.top.map((i, k) => `<div class="rank ${top.suggested.includes(i.id) ? 'suggest' : ''}"><div class="n">${k + 1}</div><div><a href="#/news?id=${i.id}">${esc(i.title)}</a>${mockTag(i)}<div class="muted small">${esc(i.category)} · ${esc(i.source)} · ${ago(i.publishedAt || i.discoveredAt)} ${verTag(i.verification)}</div></div><div class="score">${i.score.total}</div></div>`).join('') : '<div class="empty">ยังไม่มีประเด็น</div>'}
      <p class="muted small">แถบสีเขียว = ระบบแนะนำให้ทำคลิป (คะแนนสูง + กระจายหมวด + ไม่ใช่ความคิดเห็น)</p>
    </div>
    <div class="grid">
      <div class="card"><h2>สถานะความสามารถของระบบ</h2>
        ${STATUS.capabilities.map((x) => `<div class="cap-row"><div><span class="tag ${capTag[x.state][0]}">${capTag[x.state][1]}</span></div><div>${esc(x.area)}<div class="muted small">${esc(x.note)}</div></div></div>`).join('')}
      </div>
      <div class="card"><h2>รอบค้นหาล่าสุด</h2>
        ${r ? `<div class="muted small">เริ่ม ${fmt(r.startedAt)} · ดึง ${r.fetched} · ใหม่ ${r.newItems}</div><ul class="list">${(r.perFeed || []).map((f) => `<li>${esc(f.name)}: ${f.ok ? `${f.count} รายการ` : `<span class="down">ผิดพลาด — ${esc(f.error)}</span>`}</li>`).join('')}</ul>` : '<div class="muted">—</div>'}
        <h3>กิจกรรมล่าสุด</h3>
        <ul class="list small">${audit.map((a) => `<li>${fmt(a.at)} — ${esc(a.action)} ${esc(a.entity)}: ${esc(a.detail)}</li>`).join('') || '<li class="muted">—</li>'}</ul>
      </div>
    </div>
  </div>`;
};

// ---------- News & Trends ----------
const newsFilter = { q: '', category: '', verification: '', status: '', source: '', kind: '', minScore: '', from: '', to: '', dateField: 'published', sort: 'score', mock: '1' };
PAGES.news = async (v, params) => {
  const qs = new URLSearchParams(Object.entries(newsFilter).filter(([, x]) => x !== ''));
  const data = await api('/api/items?' + qs);
  const opt = (arr, cur, all = 'ทั้งหมด') => `<option value="">${all}</option>` + arr.map((x) => `<option value="${esc(x[0] ?? x)}" ${String(x[0] ?? x) === cur ? 'selected' : ''}>${esc(x[1] ?? x)}</option>`).join('');
  v.innerHTML = `
  <div class="card">
    <form class="filters" id="nf">
      <label class="f">ค้นหา<input type="search" name="q" value="${esc(newsFilter.q)}" placeholder="หัวข้อ สรุป แหล่งข่าว"></label>
      <label class="f">หมวด<select name="category">${opt(STATUS.categories, newsFilter.category)}</select></label>
      <label class="f">การยืนยัน<select name="verification">${opt(Object.entries(VER).map(([k, x]) => [k, x[1]]), newsFilter.verification)}</select></label>
      <label class="f">สถานะ<select name="status">${opt(Object.entries(ITEM_ST), newsFilter.status)}</select></label>
      <label class="f">แหล่งข่าว<select name="source">${opt(data.sources, newsFilter.source)}</select></label>
      <label class="f">ประเภท<select name="kind">${opt([['news', 'ข่าว'], ['trend', 'Google Trends']], newsFilter.kind)}</select></label>
      <label class="f">คะแนนขั้นต่ำ<input type="number" name="minScore" min="0" max="100" style="width:80px" value="${esc(newsFilter.minScore)}"></label>
      <label class="f">กรองวันที่ตาม<select name="dateField"><option value="published" ${newsFilter.dateField === 'published' ? 'selected' : ''}>วันที่เผยแพร่</option><option value="discovered" ${newsFilter.dateField === 'discovered' ? 'selected' : ''}>วันที่ค้นพบ</option></select></label>
      <label class="f">จาก<input type="date" name="from" value="${esc(newsFilter.from)}"></label>
      <label class="f">ถึง<input type="date" name="to" value="${esc(newsFilter.to)}"></label>
      <label class="f">เรียง<select name="sort"><option value="score">คะแนน</option><option value="published" ${newsFilter.sort === 'published' ? 'selected' : ''}>ล่าสุด (เผยแพร่)</option><option value="discovered" ${newsFilter.sort === 'discovered' ? 'selected' : ''}>ล่าสุด (ค้นพบ)</option></select></label>
      <label class="f">ข้อมูลจำลอง<select name="mock"><option value="1">แสดง</option><option value="0" ${newsFilter.mock === '0' ? 'selected' : ''}>ซ่อน</option><option value="only" ${newsFilter.mock === 'only' ? 'selected' : ''}>เฉพาะจำลอง</option></select></label>
      <button class="btn" type="button" id="nfReset">ล้างตัวกรอง</button>
      <span class="spacer"></span>
      ${STATUS.aiConfigured ? '<button class="btn" type="button" id="aiAnalyze">วิเคราะห์ Top ด้วย AI</button>' : ''}
      <a class="btn" href="/api/export?type=items&format=csv">ส่งออก CSV</a>
    </form>
    <div class="muted small">พบ ${data.total} ประเด็น (รวมข่าวเดียวกันจากหลายแหล่งเป็นแถวเดียว) · เวลาแสดงเป็นเวลาไทย</div>
    <div class="table-wrap"><table>
      <thead><tr><th>คะแนน</th><th>ประเด็น</th><th>หมวด</th><th>การยืนยัน</th><th>แหล่ง</th><th>เผยแพร่</th><th>ค้นพบ</th><th>สถานะ</th></tr></thead>
      <tbody>${data.items.map((i) => `<tr class="click" data-id="${i.id}">
        <td><span class="score">${i.score?.total ?? '—'}</span>${i.score?.method === 'rules+ai' ? '<div><span class="tag ai">AI</span></div>' : ''}</td>
        <td>${esc(i.title)}${mockTag(i)}${i.kind === 'trend' ? ` <span class="tag">Trends ${esc(i.trafficHint || '')}</span>` : ''}<div class="muted small">${esc((i.summary || '').slice(0, 140))}</div></td>
        <td>${esc(i.category)}</td><td>${verTag(i.verification)}<div class="muted small">${i.score?.outlets ?? 1} แหล่ง</div></td>
        <td>${esc(i.source)}</td><td class="small">${fmt(i.publishedAt)}</td><td class="small">${fmt(i.discoveredAt)}</td><td>${ITEM_ST[i.status]}</td></tr>`).join('') || '<tr><td colspan="8" class="empty">ไม่พบข้อมูล — ลองกด "เริ่มรอบค้นหา" หรือปรับตัวกรอง</td></tr>'}</tbody>
    </table></div>
  </div>`;
  const f = $('#nf');
  let deb;
  f.addEventListener('input', (e) => { clearTimeout(deb); deb = setTimeout(() => { for (const [k, x] of new FormData(f)) newsFilter[k] = x; render(); }, e.target.type === 'search' ? 350 : 0); });
  $('#nfReset').onclick = () => { Object.assign(newsFilter, { q: '', category: '', verification: '', status: '', source: '', kind: '', minScore: '', from: '', to: '', sort: 'score', mock: '1' }); render(); };
  $('#aiAnalyze')?.addEventListener('click', (e) => act(e.target, () => api('/api/analyze', { method: 'POST' }), (r) => `AI วิเคราะห์ ${r.analyzed} ประเด็น`).then(render));
  $$('tr.click', v).forEach((tr) => (tr.onclick = () => openItem(tr.dataset.id)));
  if (params.get('id')) openItem(params.get('id'));
};

async function openItem(id) {
  const { item: i, cluster, contents } = await api('/api/items/' + id);
  const s = i.score;
  const W = (await api('/api/settings')).weights;
  const row = (label, val, max) => `<div>${label}</div><div class="bar"><i style="width:${max ? (val / max) * 100 : 0}%"></i></div><div class="mono">${val}/${max}</div>`;
  const toLocalInput = (iso) => (iso ? new Date(new Date(iso).getTime() + 7 * 36e5).toISOString().slice(0, 16) : '');
  drawer(`
    <h2 style="margin-top:0">${esc(i.title)}${mockTag(i)}</h2>
    <div class="row">${verTag(i.verification)}<span class="tag">${esc(i.category)}</span>${i.kind === 'trend' ? `<span class="tag">Google Trends ${esc(i.trafficHint || '')}</span>` : ''}<span class="muted small">${i.verificationBy === 'user' ? 'การยืนยันกำหนดโดยผู้ใช้' : 'การยืนยันจัดโดยระบบ'}</span></div>
    <p>${esc(i.summary) || '<span class="muted">ไม่มีสรุปจากฟีด</span>'}</p>
    <p>ลิงก์ต้นทาง: ${link(i.url, i.source)}</p>
    <div class="card"><h3 style="margin-top:0">วันเวลา (แยกกัน)</h3><div class="times">
      <div class="muted">เผยแพร่โดยแหล่งข่าว</div><div>${fmt(i.publishedAt)}</div>
      <div class="muted">เกิดเหตุการณ์</div><div><input type="datetime-local" id="eventAt" value="${toLocalInput(i.eventAt)}"> <button class="btn sm" id="saveEvent">บันทึก</button><div class="muted small">${i.eventAt ? '' : 'ยังไม่ทราบ — ฟีดไม่ได้ระบุ กรอกเองเมื่อตรวจจากเนื้อข่าว (เวลาไทย)'}</div></div>
      <div class="muted">ระบบค้นพบ</div><div>${fmt(i.discoveredAt)}</div>
    </div></div>
    ${s ? `<div class="card" style="margin-top:12px"><div class="row"><h3 style="margin:0">คะแนน ${s.total}/100</h3>${methodTag(s.method)}</div><div class="breakdown" style="margin-top:8px">
      ${row('ความสดใหม่', s.freshness, W.freshness)}${row('ความสำคัญ', s.importance, W.importance)}${row('ความสนใจผู้ชม', s.interest, W.interest)}${row('เหมาะกับเพจ', s.fit, W.fit)}${row('ความปลอดภัย', s.safety, W.safety)}</div>
      <h3>เหตุผล</h3><ul class="list small">${s.reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      ${s.ai ? `<h3>ความเห็น AI (${esc(s.ai.model)})</h3><p class="small"><b>มุมเล่า:</b> ${esc(s.ai.angle)}<br>${esc(s.ai.reason)}</p>${s.ai.risks?.length ? `<ul class="list small">${s.ai.risks.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}` : ''}
    </div>` : '<p class="muted">รายการนี้เป็นข่าวรองในคลัสเตอร์ คะแนนอยู่ที่ข่าวหลัก</p>'}
    <h3>แหล่งอื่นที่รายงานเรื่องเดียวกัน</h3>
    <ul class="list small">${[...cluster.map((c) => ({ title: c.title, url: c.url, source: c.source, at: c.publishedAt })), ...(i.relatedSources || [])].map((r) => `<li>${esc(r.source)}: ${link(r.url, r.title)}${r.at ? ` <span class="muted">(${fmt(r.at)})</span>` : ''}</li>`).join('') || '<li class="muted">ไม่พบแหล่งอื่น</li>'}</ul>
    <h3>จัดการ</h3>
    <div class="row">
      <label class="f">การยืนยัน<select id="verSel">${Object.entries(VER).map(([k, x]) => `<option value="${k}" ${k === i.verification ? 'selected' : ''}>${x[1]}</option>`).join('')}</select></label>
      <label class="f">หมวด<select id="catSel">${STATUS.categories.map((x) => `<option ${x === i.category ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
    </div>
    <div class="row" style="margin-top:10px">
      <button class="btn" data-st="shortlisted">คัดไว้</button>
      <button class="btn primary" id="mkContent">${contents.length ? 'เปิดงานคอนเทนต์' : 'เลือกทำคลิป → สร้างงาน'}</button>
      <button class="btn danger" data-st="rejected">ตัดทิ้ง</button>
    </div>`);
  const patch = (b, msg) => act(null, () => api('/api/items/' + id, { method: 'PATCH', body: b }), msg).then(() => { openItem(id); render(); });
  $('#saveEvent').onclick = () => { const val = $('#eventAt').value; patch({ eventAt: val ? new Date(val + ':00+07:00').toISOString() : null }, 'บันทึกเวลาเกิดเหตุแล้ว'); };
  $('#verSel').onchange = (e) => patch({ verification: e.target.value }, 'ปรับสถานะการยืนยันแล้ว');
  $('#catSel').onchange = (e) => patch({ category: e.target.value }, 'ปรับหมวดแล้ว');
  $$('[data-st]', $('#drawerBody')).forEach((b) => (b.onclick = () => patch({ status: b.dataset.st }, 'อัปเดตสถานะแล้ว')));
  $('#mkContent').onclick = async (e) => { const c = await act(e.target, () => api('/api/contents', { method: 'POST', body: { itemId: id } })); closeDrawer(); location.hash = '#/studio?id=' + c.id; };
}

// ---------- Content Planner ----------
PAGES.planner = async (v) => {
  const [top, contents] = await Promise.all([api('/api/top'), api('/api/contents')]);
  const has = new Map(contents.filter((c) => c.status !== 'rejected').map((c) => [c.itemId, c]));
  const cols = ['draft', 'scripting', 'awaiting_approval', 'approved', 'published_manual', 'rejected'];
  v.innerHTML = `
  <div class="grid g2">
    <div class="card"><h2>Top 10 จัดอันดับ — เลือก 5 ประเด็นสำหรับผลิต</h2>
      <p class="muted small">ติ๊กไว้ล่วงหน้าตามคำแนะนำของระบบ (คะแนนสูง กระจายหมวด ไม่ใช่ความคิดเห็น) ปรับได้ตามดุลยพินิจ</p>
      ${top.top.map((i, k) => `<label class="rank ${top.suggested.includes(i.id) ? 'suggest' : ''}"><div class="n">${k + 1}</div>
        <div><b>${esc(i.title)}</b>${mockTag(i)}<div class="muted small">${esc(i.category)} · ${esc(i.source)} · ${verTag(i.verification)} · ${i.score.outlets} แหล่ง</div>
        <div class="small">${esc(i.score.ai?.reason || i.score.reasons.filter((r) => !r.startsWith('สดใหม่')).slice(0, 2).join(' · '))}</div></div>
        <div style="text-align:right"><div class="score">${i.score.total}</div>${has.has(i.id) ? `<a class="tag ok" href="#/studio?id=${has.get(i.id).id}" title="เปิดงานนี้">มีงานแล้ว · ${C_ST[has.get(i.id).status]}</a>` : `<input type="checkbox" class="pick" value="${i.id}" ${top.suggested.includes(i.id) ? 'checked' : ''}>`}</div></label>`).join('') || '<div class="empty">ยังไม่มีประเด็น — กด "เริ่มรอบค้นหา"</div>'}
      <div class="row" style="margin-top:10px"><span id="pickCount" class="muted"></span><span class="spacer"></span><button class="btn primary" id="mkMany">สร้างงานจากประเด็นที่เลือก</button></div>
    </div>
    <div class="card"><h2>ขั้นตอนงาน</h2>
      <ol class="list small">
        <li>เลือกประเด็น → สร้างงาน (ร่าง)</li><li>Script Studio: สร้าง/แก้สคริปต์</li><li>Fact Check: ตรวจด้วยกฎ (+AI ถ้าตั้งค่า)</li>
        <li>ผู้ใช้อนุมัติ — <b>ระบบไม่โพสต์เอง</b></li><li>โพสต์เองแล้วบันทึกสถานะ → กรอกผลใน Performance</li></ol>
      <div class="row"><a class="btn" href="/api/export?type=contents&format=csv">ส่งออกงานทั้งหมด CSV</a><a class="btn" href="/api/export?type=contents&format=json">JSON</a></div>
    </div>
  </div>
  <h2 style="font-size:15px;margin:18px 0 8px">บอร์ดงานคอนเทนต์</h2>
  <div class="kanban">${cols.map((s) => `<div class="col"><h4>${C_ST[s]} (${contents.filter((c) => c.status === s).length})</h4>
    ${contents.filter((c) => c.status === s).map((c) => `<div class="kcard" data-id="${c.id}">${esc(c.title)}${mockTag(c)}<div class="muted small">${c.platforms.map((p) => PLAT[p]).join(', ')}</div><div class="row small">${fcTag(c.factCheck?.status)}${c.meeting ? '<span class="tag ai">มติประชุม</span>' : ''}${c.script ? `<span class="tag ${c.script.generatedBy === 'ai' ? 'ai' : ''}">${c.script.generatedBy === 'ai' ? 'AI' : 'แม่แบบ'}</span>` : ''}</div></div>`).join('')}</div>`).join('')}</div>`;
  const upd = () => { const k = $$('.pick:checked').length; $('#pickCount').textContent = `เลือก ${k} ประเด็น${k !== 5 ? ' (แนะนำ 5)' : ''}`; };
  $$('.pick').forEach((x) => (x.onchange = upd)); upd();
  $('#mkMany').onclick = (e) => act(e.target, async () => { const ids = $$('.pick:checked').map((x) => x.value); if (!ids.length) throw new Error('ยังไม่ได้เลือกประเด็น'); for (const id of ids) await api('/api/contents', { method: 'POST', body: { itemId: id } }); return ids.length; }, (k) => `สร้าง ${k} งานแล้ว`).then(render);
  $$('.kcard').forEach((k) => (k.onclick = () => { const c = contents.find((x) => x.id === k.dataset.id); location.hash = (['awaiting_approval', 'approved', 'published_manual'].includes(c.status) ? '#/factcheck?id=' : '#/studio?id=') + c.id; }));
};

// ---------- Script Studio ----------
function contentPicker(contents, current, base) {
  return `<select id="cPick"><option value="">— เลือกงาน —</option>${contents.map((c) => `<option value="${c.id}" ${c.id === current ? 'selected' : ''}>[${C_ST[c.status]}] ${esc(c.title.slice(0, 70))}${c.isMock ? ' (จำลอง)' : ''}</option>`).join('')}</select>`;
}
PAGES.studio = async (v, params) => {
  const contents = await api('/api/contents');
  const id = params.get('id') || contents.find((c) => !['approved', 'published_manual', 'rejected'].includes(c.status))?.id;
  if (!contents.length) { v.innerHTML = `<div class="card empty">ยังไม่มีงาน — ไปที่ <a href="#/planner">วางแผนคอนเทนต์</a> เพื่อเลือกประเด็น</div>`; return; }
  const c = id ? await api('/api/contents/' + id) : null;
  const sc = c?.script;
  const locked = c && ['approved', 'published_manual'].includes(c.status);
  v.innerHTML = `
  <div class="card"><div class="row"><b>งาน:</b>${contentPicker(contents, id)}<span class="spacer"></span>${c ? cTag(c.status) + mockTag(c) : ''}</div></div>
  ${c ? `
  <div class="grid g2" style="margin-top:14px;grid-template-columns:minmax(260px,340px) 1fr">
    <div class="card"><h2>ข้อมูลต้นทาง</h2>
      <p><b>${esc(c.item?.title)}</b></p><p class="small">${esc(c.item?.summary)}</p>
      <p class="small">${link(c.item?.url, c.item?.source)} · เผยแพร่ ${fmt(c.item?.publishedAt)}<br>เกิดเหตุ: ${c.item?.eventAt ? fmt(c.item.eventAt) : '<span class="down">ยังไม่ทราบ</span>'}</p>
      ${verTag(c.item?.verification)} <span class="muted small">${c.cluster.length} รายการในคลัสเตอร์</span>
      ${c.meeting ? `<div class="banner info small"><b>จากมติประชุมทีม AI</b> · <a href="#/meeting?id=${esc(c.meeting.meetingId)}">ดูการประชุม</a><br>${esc(c.meeting.reason)}${c.meeting.hook ? `<br><b>Hook ที่เสนอ:</b> ${esc(c.meeting.hook)}` : ''}${c.meeting.concept ? `<br><b>คอนเซปต์:</b> ${esc(c.meeting.concept.angle)} · ${esc(c.meeting.concept.format)} · ${c.meeting.concept.durationSec} วิ` : ''}${c.meeting.mustVerify?.length ? `<br><b>ต้องตรวจก่อนเผยแพร่:</b> ${c.meeting.mustVerify.map(esc).join(' · ')}` : ''}</div>` : ''}
      <h3>สร้างสคริปต์</h3>
      <label class="f">ความยาว <b id="durL">${sc?.durationSec || 60}</b> วินาที<input type="range" id="dur" min="30" max="90" step="5" value="${sc?.durationSec || 60}"></label>
      <div class="row small" style="margin:8px 0">${Object.entries(PLAT).map(([k, x]) => `<label><input type="checkbox" class="plat" value="${k}" ${c.platforms.includes(k) ? 'checked' : ''}> ${x}</label>`).join('')}</div>
      <label class="f">โทน (สำหรับ AI)<input id="tone" placeholder="เช่น กระชับ เป็นกลาง เป็นกันเอง"></label>
      <div class="row" style="margin-top:10px">
        <button class="btn primary" id="genAI" ${STATUS.aiConfigured && !c.isMock && !locked ? '' : 'disabled'} title="${STATUS.aiConfigured ? '' : 'ต้องตั้ง ANTHROPIC_API_KEY หรือเชื่อมต่อ Content Factory'}">สร้างด้วย AI</button>
        <button class="btn" id="genTpl" ${locked ? 'disabled' : ''}>สร้างจากแม่แบบ</button>
      </div>
      ${STATUS.aiConfigured ? '' : '<p class="muted small">AI ยังไม่ตั้งค่า — แม่แบบสร้างโครงจากหัวข่าวจริง ต้องเขียนเนื้อหาเพิ่มเอง</p>'}
      ${locked ? '<p class="banner warn">อนุมัติแล้ว — แก้ไขไม่ได้ <button class="btn sm" id="unlock">ส่งกลับไปแก้ไข</button></p>' : ''}
    </div>
    <div class="card">${sc ? `
      <div class="row"><h2 style="margin:0">สคริปต์</h2><span class="tag ${sc.generatedBy === 'ai' ? 'ai' : ''}">${sc.generatedBy === 'ai' ? 'สร้างโดย AI ' + esc(sc.model || '') : 'แม่แบบ (ไม่ใช่ AI)'}</span>${sc.editedByUser ? '<span class="tag">แก้ไขโดยผู้ใช้</span>' : ''}<span class="spacer"></span><span class="muted small" id="readTime"></span></div>
      <label class="f" style="margin-top:10px">Hook (3 วินาทีแรก)<textarea id="hook" rows="2">${esc(sc.hook)}</textarea></label>
      <h3>Storyboard</h3>
      <div class="scene muted small"><div>ช่วงเวลา</div><div>ภาพ</div><div>คำบรรยาย</div><div>ข้อความบนจอ</div><div></div></div>
      <div id="scenes">${(sc.scenes || []).map(sceneRow).join('')}</div>
      <button class="btn sm" id="addScene">+ เพิ่มซีน</button>
      <label class="f" style="margin-top:10px">แคปชั่น<textarea id="caption" rows="4">${esc(sc.caption)}</textarea></label>
      <label class="f">แฮชแท็ก (เว้นวรรค)<input id="hashtags" value="${esc((sc.hashtags || []).join(' '))}"></label>
      <label class="f">ภาพประกอบที่แนะนำ (บรรทัดละรายการ)<textarea id="assets" rows="3">${esc((sc.assets || []).join('\n'))}</textarea></label>
      <label class="f">แนวทางตัดต่อ<textarea id="editingNotes" rows="2">${esc(sc.editingNotes)}</textarea></label>
      <label class="f">หมายเหตุลิขสิทธิ์<textarea id="copyrightNotes" rows="2">${esc(sc.copyrightNotes)}</textarea></label>
      ${sc.platformNotes?.length ? `<h3>หมายเหตุรายแพลตฟอร์ม</h3><ul class="list small">${sc.platformNotes.map((p) => `<li><b>${esc(p.platform)}</b>: ${esc(p.note)}</li>`).join('')}</ul>` : ''}
      ${sc.unverifiedPoints?.length ? `<div class="banner warn"><b>จุดที่ AI ระบุว่าต้องตรวจสอบ:</b><ul class="list">${sc.unverifiedPoints.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>` : ''}
      <div class="row" style="margin-top:12px"><button class="btn primary" id="saveScript" ${locked ? 'disabled' : ''}>บันทึก</button><button class="btn" id="dlTxt">ดาวน์โหลด .txt</button><span class="spacer"></span><button class="btn" id="toFc">ไปตรวจข้อเท็จจริง →</button></div>
    ` : '<div class="empty">ยังไม่มีสคริปต์ — เลือกความยาวและแพลตฟอร์ม แล้วกดสร้าง</div>'}</div>
  </div>` : ''}`;
  $('#cPick').onchange = (e) => (location.hash = '#/studio?id=' + e.target.value);
  if (!c) return;
  $('#dur').oninput = (e) => ($('#durL').textContent = e.target.value);
  const plats = () => $$('.plat:checked').map((x) => x.value);
  const gen = (mode) => (e) => act(e.target, () => api(`/api/contents/${c.id}/script`, { method: 'POST', body: { mode, durationSec: +$('#dur').value, platforms: plats(), tone: $('#tone').value } }), 'สร้างสคริปต์แล้ว').then(render);
  $('#genAI').onclick = gen('ai'); $('#genTpl').onclick = gen('template');
  $('#unlock')?.addEventListener('click', (e) => act(e.target, () => api('/api/contents/' + c.id, { method: 'PATCH', body: { status: 'scripting' } }), 'ส่งกลับไปแก้ไขแล้ว — ต้องตรวจและอนุมัติใหม่').then(render));
  if (!sc) return;
  const collect = () => ({
    hook: $('#hook').value, caption: $('#caption').value, editingNotes: $('#editingNotes').value, copyrightNotes: $('#copyrightNotes').value,
    hashtags: $('#hashtags').value.split(/\s+/).filter(Boolean), assets: $('#assets').value.split('\n').map((x) => x.trim()).filter(Boolean),
    scenes: $$('#scenes .scene').map((r) => Object.fromEntries($$('[data-k]', r).map((x) => [x.dataset.k, x.value]))),
  });
  const updTime = () => { const s = collect(); const chars = [s.hook, ...s.scenes.map((x) => x.narration)].join('').replace(/\s/g, '').length; $('#readTime').textContent = `คำบรรยาย ~${Math.round(chars / 12)} วินาที (ประมาณ 12 ตัวอักษร/วินาที) จากเป้าหมาย ${sc.durationSec} วินาที`; };
  updTime(); v.oninput = updTime;
  $('#scenes').onclick = (e) => { if (e.target.dataset.del != null) { e.target.closest('.scene').remove(); updTime(); } };
  $('#addScene').onclick = () => $('#scenes').insertAdjacentHTML('beforeend', sceneRow({ t: '', visual: '', narration: '', onScreenText: '' }));
  $('#saveScript').onclick = (e) => act(e.target, () => api('/api/contents/' + c.id, { method: 'PATCH', body: { script: collect(), platforms: plats() } }), 'บันทึกแล้ว — ต้องตรวจข้อเท็จจริงใหม่').then(render);
  $('#toFc').onclick = () => (location.hash = '#/factcheck?id=' + c.id);
  $('#dlTxt').onclick = () => {
    const s = collect();
    const txt = `${c.title}\nที่มา: ${c.item?.source} ${c.item?.url || ''}\nสร้างโดย: ${sc.generatedBy === 'ai' ? 'AI' : 'แม่แบบ'} · สถานะ: ${C_ST[c.status]}\n\nHOOK: ${s.hook}\n\n${s.scenes.map((x) => `[${x.t}]\nภาพ: ${x.visual}\nบรรยาย: ${x.narration}\nบนจอ: ${x.onScreenText}`).join('\n\n')}\n\nแคปชั่น:\n${s.caption}\n\n${s.hashtags.join(' ')}\n\nภาพประกอบ:\n- ${s.assets.join('\n- ')}\n\nตัดต่อ: ${s.editingNotes}\nลิขสิทธิ์: ${s.copyrightNotes}\n`;
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain;charset=utf-8' })); a.download = `script-${c.id}.txt`; a.click();
  };
};
const sceneRow = (s) => `<div class="scene"><input data-k="t" value="${esc(s.t)}"><textarea data-k="visual">${esc(s.visual)}</textarea><textarea data-k="narration">${esc(s.narration)}</textarea><textarea data-k="onScreenText">${esc(s.onScreenText)}</textarea><button class="btn sm danger" data-del title="ลบซีน">×</button></div>`;

// ---------- Fact Check ----------
PAGES.factcheck = async (v, params) => {
  const contents = await api('/api/contents');
  if (!contents.length) { v.innerHTML = `<div class="card empty">ยังไม่มีงาน</div>`; return; }
  const id = params.get('id') || contents.find((c) => c.status === 'awaiting_approval')?.id || contents[0].id;
  const c = await api('/api/contents/' + id);
  const fc = c.factCheck;
  const VERD = { supported: ['ok', 'พบในแหล่ง'], not_found: ['warn', 'ไม่พบในแหล่ง'], contradicted: ['bad', 'ขัดกับแหล่ง'], opinion: ['op', 'ความเห็น'] };
  v.innerHTML = `
  <div class="card"><div class="row"><b>งาน:</b>${contentPicker(contents, id)}<span class="spacer"></span>${cTag(c.status)}${mockTag(c)}</div></div>
  <div class="grid g2" style="margin-top:14px">
    <div class="card"><div class="row"><h2 style="margin:0">ผลตรวจ</h2>${fcTag(fc?.status)}${fc ? methodTag(fc.method) : ''}<span class="spacer"></span><span class="muted small">${fc ? 'ตรวจเมื่อ ' + fmt(fc.checkedAt) : ''}</span></div>
      <div class="row" style="margin:10px 0"><button class="btn" id="fcRules">ตรวจด้วยกฎ</button><button class="btn primary" id="fcAI" ${STATUS.aiConfigured && c.script && !c.isMock ? '' : 'disabled'} title="${STATUS.aiConfigured ? '' : 'ต้องตั้ง ANTHROPIC_API_KEY หรือเชื่อมต่อ Content Factory'}">ตรวจด้วยกฎ + AI</button></div>
      ${fc ? fc.checks.map((x) => `<div class="check"><div><span class="tag ${FC[x.level][0]}">${FC[x.level][1]}</span></div><div>${esc(x.label)}</div><div class="small">${esc(x.detail)}</div></div>`).join('') : '<div class="empty">ยังไม่ได้ตรวจ</div>'}
      ${fc?.claims ? `<h3>ข้ออ้างในสคริปต์ (AI เทียบกับข้อมูลต้นทาง)</h3><p class="small">${esc(fc.aiSummary)}</p><div class="table-wrap"><table><thead><tr><th>ข้ออ้าง</th><th>ผล</th><th>หลักฐาน</th></tr></thead><tbody>${fc.claims.map((x) => `<tr><td>${esc(x.claim)}</td><td><span class="tag ${VERD[x.verdict][0]}">${VERD[x.verdict][1]}</span></td><td class="small">${esc(x.evidence)} <span class="muted">${esc(x.source)}</span></td></tr>`).join('')}</tbody></table></div>` : ''}
      <p class="muted small">ข้อจำกัด: ระบบเทียบกับหัวข้อ/สรุปจากฟีดเท่านั้น ไม่ได้อ่านเนื้อข่าวเต็ม — ผู้ใช้ต้องเปิดลิงก์ต้นทางตรวจซ้ำก่อนอนุมัติ</p>
    </div>
    <div class="card"><h2>อนุมัติ</h2>
      <p class="small">ต้นทาง: ${link(c.item?.url, c.item?.source)}</p>
      ${c.script ? `<p><b>Hook:</b> ${esc(c.script.hook)}</p><details><summary class="small">ดูสคริปต์ทั้งหมด</summary><ol class="list small">${c.script.scenes.map((s) => `<li>[${esc(s.t)}] ${esc(s.narration)}</li>`).join('')}</ol><p class="small" style="white-space:pre-wrap">${esc(c.script.caption)}</p></details>` : '<p class="muted">ยังไม่มีสคริปต์</p>'}
      ${c.status === 'approved' || c.status === 'published_manual' ? `
        <div class="banner info">อนุมัติเมื่อ ${fmt(c.approval?.approvedAt)}${c.approval?.override ? ` (override: ${esc(c.approval.overrideReason)})` : ''}<br>ระบบไม่โพสต์อัตโนมัติ — คัดลอกสคริปต์/แคปชั่นไปโพสต์เองที่ ${c.platforms.map((p) => PLAT[p]).join(', ')}</div>
        ${c.status === 'approved' ? '<button class="btn primary" id="markPub">บันทึกว่าโพสต์แล้ว (ทำเอง)</button>' : `<p class="small">บันทึกว่าโพสต์แล้วเมื่อ ${fmt(c.publishedNote?.at)} → <a href="#/performance">กรอกผลโพสต์</a></p>`}
        ${STATUS.factory && !STATUS.factory.error && c.script && !c.isMock ? `<div class="row" style="margin-top:10px"><button class="btn" id="toFactory">${c.sentToFactory ? 'ส่งไป Content Factory อีกครั้ง (อัปเดต)' : 'ส่งสคริปต์ไป Content Factory'}</button>
          <span class="muted small">${c.sentToFactory ? `ส่งแล้วเมื่อ ${fmt(c.sentToFactory.at)} — ` : ''}เปิดตัวแก้ไขวิดีโอใน Factory แล้วใช้แผง "สคริปต์จาก Content Intelligence" ใส่เป็นข้อความบนจอ</span></div>` : ''}`
      : `
        <label class="f">หมายเหตุ<input id="apNote"></label>
        ${fc?.status === 'fail' ? '<label class="f" style="margin-top:8px">เหตุผล override (มีรายการไม่ผ่าน — บังคับกรอก ≥10 ตัวอักษร)<textarea id="apOverride" rows="2"></textarea></label>' : ''}
        <div class="row" style="margin-top:10px"><button class="btn primary" id="approve" ${fc && c.script && !c.isMock ? '' : 'disabled'}>อนุมัติ</button><button class="btn danger" id="reject">ไม่ใช้งานนี้</button><a class="btn" href="#/studio?id=${c.id}">กลับไปแก้สคริปต์</a></div>
        <p class="muted small">${c.isMock ? 'ข้อมูลจำลองอนุมัติไม่ได้' : !fc ? 'ต้องตรวจข้อเท็จจริงก่อน' : 'การอนุมัติคือการยืนยันภายในว่าพร้อมโพสต์ ระบบจะไม่เผยแพร่ให้'}</p>`}
    </div>
  </div>`;
  $('#cPick').onchange = (e) => (location.hash = '#/factcheck?id=' + e.target.value);
  const run = (useAI) => (e) => act(e.target, () => api(`/api/contents/${c.id}/factcheck`, { method: 'POST', body: { useAI } }), 'ตรวจเสร็จ').then(render);
  $('#fcRules').onclick = run(false); $('#fcAI').onclick = run(true);
  $('#approve')?.addEventListener('click', (e) => act(e.target, () => api(`/api/contents/${c.id}/approve`, { method: 'POST', body: { note: $('#apNote').value, overrideReason: $('#apOverride')?.value } }), 'อนุมัติแล้ว').then(render));
  $('#reject')?.addEventListener('click', (e) => act(e.target, () => api(`/api/contents/${c.id}/reject`, { method: 'POST', body: { note: $('#apNote').value } }), 'บันทึกว่าไม่ใช้แล้ว').then(render));
  $('#markPub')?.addEventListener('click', (e) => act(e.target, () => api(`/api/contents/${c.id}/mark-published`, { method: 'POST', body: {} }), 'บันทึกแล้ว').then(render));
  $('#toFactory')?.addEventListener('click', (e) => act(e.target, () => api(`/api/contents/${c.id}/send-to-factory`, { method: 'POST', body: {} }), 'ส่งสคริปต์ไป Content Factory แล้ว').then(render));
};

// ---------- Performance ----------
let perfMock = '1';
PAGES.performance = async (v) => {
  const [st, contents] = await Promise.all([api('/api/performance?mock=' + perfMock), api('/api/contents')]);
  const pct = (x) => (x == null ? '<span class="muted">—</span>' : `<span class="${x >= 0 ? 'up' : 'down'}">${x > 0 ? '+' : ''}${x}%</span>`);
  const rows = st.rows;
  const maxV = Math.max(1, ...rows.map((r) => r.views || 0));
  const chartRows = [...rows].reverse().slice(-20);
  const bw = 680 / Math.max(1, chartRows.length);
  v.innerHTML = `
  <div class="banner info">ข้อมูลผลโพสต์มาจากการกรอกเองหรือนำเข้า CSV เท่านั้น — ระบบ<b>ยังไม่ได้</b>เชื่อมต่อ API ของ Facebook/TikTok/YouTube และไม่มีข้อมูลคู่แข่ง</div>
  ${rows.some((r) => r.isMock) ? '<div class="banner mock">ตารางนี้มีข้อมูลจำลอง (ติดป้าย) — ตัวเลขไม่ใช่ผลจริง</div>' : ''}
  <div class="grid g4">${Object.entries(st.byPlatform).map(([p, b]) => `<div class="card kpi"><div class="l">${PLAT[p] || esc(p)} · ${b.posts} โพสต์</div><div class="v">${n(b.views)}</div><div class="l">ยอดดูรวม · ดูต่อเฉลี่ย ${b.avgWatchPct ?? '—'}% · แชร์ ${n(b.shares)} · คอมเมนต์ ${n(b.comments)}</div></div>`).join('') || '<div class="card empty">ยังไม่มีข้อมูลโพสต์</div>'}</div>
  ${chartRows.length ? `<div class="card chart" style="margin-top:14px"><h2>ยอดดูต่อโพสต์ (เรียงตามเวลา)</h2><svg viewBox="0 0 700 190" role="img" aria-label="กราฟยอดดู">
    ${chartRows.map((r, i) => { const h = ((r.views || 0) / maxV) * 150; return `<rect x="${10 + i * bw}" y="${165 - h}" width="${Math.max(4, bw - 6)}" height="${h}" rx="3" fill="var(--accent)" opacity="${r.isMock ? 0.45 : 1}"><title>${esc(r.title || '')} ${PLAT[r.platform]} ${n(r.views)}</title></rect><text x="${10 + i * bw + bw / 2 - 3}" y="182" text-anchor="middle">${({ facebook: 'FB', reels: 'RL', tiktok: 'TT', shorts: 'YT' })[r.platform] || ''}</text>`; }).join('')}
  </svg><p class="muted small">แท่งจาง = ข้อมูลจำลอง</p></div>` : ''}
  <div class="grid g2" style="margin-top:14px">
    <div class="card"><h2>เพิ่มผลโพสต์</h2>
      <form id="pf" class="grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
        <label class="f">งานคอนเทนต์<select name="contentId"><option value="">— ไม่ผูกงาน —</option>${contents.map((c) => `<option value="${c.id}">${esc(c.title.slice(0, 50))}</option>`).join('')}</select></label>
        <label class="f">ชื่อโพสต์<input name="title"></label>
        <label class="f">แพลตฟอร์ม<select name="platform">${Object.entries(PLAT).map(([k, x]) => `<option value="${k}">${x}</option>`).join('')}</select></label>
        <label class="f">วันเวลาโพสต์<input type="datetime-local" name="postedAt" required></label>
        <label class="f">ยอดดู<input type="number" min="0" name="views"></label>
        <label class="f">ดูต่อเฉลี่ย (%)<input type="number" min="0" max="100" step="0.1" name="avgWatchPct"></label>
        <label class="f">แชร์<input type="number" min="0" name="shares"></label>
        <label class="f">คอมเมนต์<input type="number" min="0" name="comments"></label>
        <label class="f">ไลก์/รีแอ็กชัน<input type="number" min="0" name="likes"></label>
        <div style="align-self:end"><button class="btn primary">บันทึก</button></div>
      </form>
    </div>
    <div class="card"><h2>นำเข้า CSV</h2>
      <p class="muted small mono">platform,postedAt,views,avgWatchPct,shares,comments,likes,title<br>tiktok,2026-10-18 20:00,12000,41.5,120,35,900,ชื่อโพสต์</p>
      <p class="muted small">platform: facebook / reels / tiktok / shorts</p>
      <input type="file" id="csvFile" accept=".csv,text/csv"> <button class="btn" id="csvImport">นำเข้า</button>
      <div class="row" style="margin-top:10px"><a class="btn" href="/api/export?type=posts&format=csv">ส่งออก CSV</a>
        <label class="small"><input type="checkbox" id="pm" ${perfMock === '1' ? 'checked' : ''}> แสดงข้อมูลจำลอง</label></div>
    </div>
  </div>
  <div class="card" style="margin-top:14px"><div class="row"><h2 style="margin:0">ผลรายโพสต์ เทียบค่าเฉลี่ย 5 โพสต์ก่อนหน้า (แพลตฟอร์มเดียวกัน)</h2><span class="spacer"></span>
    <button class="btn" id="insight" ${STATUS.aiConfigured ? '' : 'disabled'} title="${STATUS.aiConfigured ? '' : 'ต้องตั้ง ANTHROPIC_API_KEY หรือเชื่อมต่อ Content Factory'}">สรุปด้วย AI (เฉพาะข้อมูลจริง)</button></div>
    <div id="insightBox"></div>
    <div class="table-wrap"><table><thead><tr><th>โพสต์</th><th>แพลตฟอร์ม</th><th>เวลา</th><th>ยอดดู</th><th>vs ก่อนหน้า</th><th>ดูต่อ %</th><th>vs</th><th>แชร์</th><th>vs</th><th>คอมเมนต์</th><th>vs</th><th>Engagement</th><th></th></tr></thead>
    <tbody>${rows.map((r) => `<tr><td>${esc(r.title || '—')}${mockTag(r)}<div class="muted small">${esc(r.source)}</div></td><td>${PLAT[r.platform]}</td><td class="small">${fmt(r.postedAt)}</td><td>${n(r.views)}</td><td>${pct(r.vsPrevAvgPct.views)}</td><td>${r.avgWatchPct ?? '—'}</td><td>${pct(r.vsPrevAvgPct.avgWatchPct)}</td><td>${n(r.shares)}</td><td>${pct(r.vsPrevAvgPct.shares)}</td><td>${n(r.comments)}</td><td>${pct(r.vsPrevAvgPct.comments)}</td><td>${r.engagementPct ?? '—'}%</td><td>${r.isMock ? '' : `<button class="btn sm danger" data-del="${r.id}">ลบ</button>`}</td></tr>`).join('') || '<tr><td colspan="13" class="empty">ยังไม่มีข้อมูล</td></tr>'}</tbody></table></div>
    <p class="muted small">Engagement = (แชร์ + คอมเมนต์ + ไลก์) ÷ ยอดดู · "—" = ข้อมูลก่อนหน้าไม่พอเทียบ</p>
  </div>`;
  $('#pm').onchange = (e) => { perfMock = e.target.checked ? '1' : '0'; render(); };
  $('#pf').onsubmit = (e) => { e.preventDefault(); const b = Object.fromEntries(new FormData(e.target)); b.postedAt = new Date(b.postedAt + ':00+07:00').toISOString(); act(e.submitter, () => api('/api/posts', { method: 'POST', body: b }), 'บันทึกผลโพสต์แล้ว').then(render); };
  $('#csvImport').onclick = (e) => { const f = $('#csvFile').files[0]; if (!f) return toast('เลือกไฟล์ CSV ก่อน', true); f.text().then((csv) => act(e.target, () => api('/api/posts/import', { method: 'POST', body: { csv } }), (r) => `นำเข้า ${r.added} แถว${r.errors.length ? ` · ผิดพลาด: ${r.errors.slice(0, 3).join('; ')}` : ''}`).then(render)); };
  $$('[data-del]', v).forEach((b) => (b.onclick = () => confirm('ลบผลโพสต์นี้?') && act(b, () => api('/api/posts/' + b.dataset.del, { method: 'DELETE' }), 'ลบแล้ว').then(render)));
  $('#insight').onclick = (e) => act(e.target, () => api('/api/performance/insights', { method: 'POST' })).then((r) => {
    $('#insightBox').innerHTML = `<div class="banner info"><span class="tag ai">AI ${esc(r.model)}</span> ${esc(r.summary)}<div class="grid g2" style="margin-top:8px"><div><b>ได้ผลดี</b><ul class="list">${r.wins.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div><div><b>ควรปรับ</b><ul class="list">${r.issues.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></div><b>แผนรอบถัดไป</b><ul class="list">${r.nextActions.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
  });
};

// ---------- AI Team Meeting ----------
const EXPERT_TH = { hunter: 'Trend Hunter', analyst: 'Trend Analyst', factchecker: 'Fact Checker', producer: 'Creative Producer', performance: 'Performance Analyst', director: 'Content Director', human: 'มนุษย์ (ผู้อนุมัติ)' };
const DEC = { produce: ['ok', 'เสนอผลิต'], hold: ['warn', 'รอข้อมูล'], drop: ['bad', 'ตัด'] };
const FC_ST = { confirmed: ['ok', 'ยืนยันแล้ว'], unverified: ['warn', 'ยังไม่ยืนยัน'], opinion: ['op', 'ความคิดเห็น'], reject: ['bad', 'ไม่ควรทำ'] };
const M_ST = { running: ['warn', 'กำลังประชุม'], done: ['ok', 'เสร็จ'], failed: ['bad', 'ล้มเหลว'] };
const VERDICT = { ready: ['ok', 'พร้อมส่งให้คนตรวจ'], needs_edit: ['warn', 'ต้องแก้ก่อน'], not_recommended: ['bad', 'ไม่ควรโพสต์'] };
const CLAIM = { ok: ['ok', 'ทั่วไป'], needs_check: ['warn', 'ต้องตรวจ'], risky: ['bad', 'เสี่ยง'] };
const CUT = { keep: ['ok', 'เก็บ'], cut: ['bad', 'ตัด'], tighten: ['warn', 'กระชับ'], highlight: ['ai', 'เน้น'] };
const VIDEO_EXPERT_TH = { analyst: 'Video Analyst', factchecker: 'Fact Checker', producer: 'Editor', performance: 'Performance Analyst', director: 'Content Director', human: 'มนุษย์ (ผู้อนุมัติ)' };
const mmss = (sec) => (sec == null ? '' : `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`);
const at = (sec) => (sec == null ? '' : `<span class="tag mono">${mmss(sec)}</span> `);
let factoryVideos = null;

/** The video meeting's result: what the clip is, its claims, the cut plan, the verdict */
function videoMeetingHtml(m) {
  const step = (sid) => m.steps.find((x) => x.expertId === sid);
  const out = (sid) => step(sid)?.output;
  const list = (arr) => (arr?.length ? `<ul class="list">${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<span class="muted">—</span>');
  const miss = (sid) => `<p class="down small">${esc(step(sid)?.error || 'ไม่มีรายงาน')}</p>`;
  const r = m.result;
  const a = out('analyst'), f = out('factchecker'), e = out('producer'), p = out('performance');
  return `
    ${r ? `<div class="card" style="margin-top:14px"><div class="row"><h2 style="margin:0">มติประธาน (Content Director)</h2><span class="tag ${VERDICT[r.verdict][0]}">${VERDICT[r.verdict][1]}</span></div>
      <p>${esc(r.summary)}</p>
      <h3>งานแก้ไข</h3>${r.assignments.map((t) => `<label class="check" style="grid-template-columns:24px 150px 1fr"><input type="checkbox" class="task" data-tid="${t.id}" ${t.done ? 'checked' : ''}><span class="tag">${esc(VIDEO_EXPERT_TH[t.owner] || t.owner)}</span><span class="small" style="${t.done ? 'text-decoration:line-through;opacity:.6' : ''}">${at(t.atSec)}${esc(t.task)}</span></label>`).join('') || '<p class="muted small">—</p>'}
      <h3>ข้อขัดแย้งและข้อยุติ</h3>${r.conflicts.length ? r.conflicts.map((c) => `<div class="check" style="grid-template-columns:1fr"><div><b>${esc(c.topic)}</b><ul class="list small">${c.positions.map((x) => `<li><b>${esc(VIDEO_EXPERT_TH[x.expert] || x.expert)}:</b> ${esc(x.view)}</li>`).join('')}</ul><div class="small">→ <b>ข้อยุติ:</b> ${esc(c.resolution)}</div></div></div>`).join('') : '<p class="muted small">ไม่มีข้อขัดแย้ง</p>'}
      <h3>แคปชั่นที่เสนอ</h3><p class="small" style="white-space:pre-wrap">${esc(r.caption)}</p><p class="small">${r.hashtags.map((h) => esc(h.startsWith('#') ? h : '#' + h)).join(' ')}</p>
      <h3>ความเสี่ยงที่ผู้อนุมัติต้องรู้</h3>${list(r.risks)}
      <p class="muted small">มตินี้ไม่ใช่การอนุมัติเผยแพร่ — คนต้องตรวจคลิปก่อนโพสต์ทุกครั้ง</p></div>` : ''}
    <div class="card" style="margin-top:14px"><h2>รายงานผู้เชี่ยวชาญ</h2>
      <details open><summary><b>Video Analyst</b> <span class="muted small">${esc(step('analyst')?.model || '')}</span></summary><div style="margin:8px 0 14px">${a ? `
        <p>${esc(a.summary)}</p><p class="small"><b>ผู้ชม:</b> ${esc(a.audience)}</p>
        <p class="small"><b>Hook 3 วินาทีแรก:</b> <span class="score">${Math.round(a.hookScore)}</span> ${esc(a.hookAssessment)}</p>
        <div class="grid g2"><div><b class="small">จุดแข็ง</b>${list(a.strengths)}</div><div><b class="small">จุดอ่อน</b><ul class="list">${a.weaknesses.map((w) => `<li>${at(w.atSec)}${esc(w.issue)}</li>`).join('') || '<li class="muted">—</li>'}</ul></div></div>
        ${a.notes ? `<p class="small muted">${esc(a.notes)}</p>` : ''}` : miss('analyst')}</div></details>
      <details open><summary><b>Fact Checker</b> <span class="muted small">${esc(step('factchecker')?.model || '')}</span></summary><div style="margin:8px 0 14px">${f ? `
        <table><tbody>${f.claims.map((c) => `<tr><td><span class="tag ${CLAIM[c.status][0]}">${CLAIM[c.status][1]}</span></td><td>${at(c.atSec)}${esc(c.claim)}<div class="small muted">${esc(c.note)}</div></td></tr>`).join('') || '<tr><td class="muted small">ไม่พบข้ออ้างที่ต้องตรวจ</td></tr>'}</tbody></table>
        <b class="small">ความเสี่ยงด้านกฎหมาย/จริยธรรม</b>${list(f.legalOrEthicalRisks)}<b class="small">ลิขสิทธิ์</b>${list(f.copyright)}
        ${f.notes ? `<p class="small muted">${esc(f.notes)}</p>` : ''}` : miss('factchecker')}</div></details>
      <details open><summary><b>Editor</b> <span class="muted small">${esc(step('producer')?.model || '')}</span></summary><div style="margin:8px 0 14px">${e ? `
        <p class="small"><b>Hook ที่เสนอ:</b> ${esc(e.suggestedHook)}</p>
        <p class="small">ความยาวที่เหมาะ ${Math.round(e.idealLengthSec)} วิ · ${e.platforms.map((x) => PLAT[x]).join(', ')}</p>
        <b class="small">แผนตัดต่อ</b><table><tbody>${e.cuts.map((c) => `<tr><td><span class="tag ${CUT[c.action][0]}">${CUT[c.action][1]}</span></td><td class="mono small">${mmss(c.fromSec)}–${mmss(c.toSec)}</td><td class="small">${esc(c.reason)}</td></tr>`).join('') || '<tr><td class="muted small">—</td></tr>'}</tbody></table>
        <b class="small">ข้อความบนจอ</b><ul class="list">${e.onScreenTexts.map((t) => `<li>${at(t.atSec)}${esc(t.text)}</li>`).join('') || '<li class="muted">—</li>'}</ul>
        <p class="small"><b>ไอเดียแคปชั่น:</b> ${esc(e.captionIdea)}</p>
        ${e.notes ? `<p class="small muted">${esc(e.notes)}</p>` : ''}` : miss('producer')}</div></details>
      <details><summary><b>Performance Analyst</b> <span class="muted small">${esc(step('performance')?.model || '')}</span></summary><div style="margin:8px 0 14px">${p ? `
        ${p.dataAvailable ? '' : '<p class="banner warn small">ยังไม่มีผลโพสต์จริงพอเทียบ — ประเมินจากลักษณะคลิปเท่านั้น</p>'}
        <table><tbody>${p.platformFit.map((x) => `<tr><td>${PLAT[x.platform]}</td><td class="score">${Math.round(x.fit)}</td><td class="small">${esc(x.why)}</td></tr>`).join('')}</tbody></table>
        <b class="small">ข้อเสนอ</b>${list(p.recommendations)}${p.notes ? `<p class="small muted">${esc(p.notes)}</p>` : ''}` : miss('performance')}</div></details>
    </div>`;
}
let meetingPoll = null;

PAGES.meeting = async (v, params) => {
  clearTimeout(meetingPoll);
  const [{ running, meetings }, s] = await Promise.all([api('/api/meetings'), api('/api/settings')]);
  const linked = STATUS.factory && !STATUS.factory.error;
  if (linked && !factoryVideos) factoryVideos = await api('/api/factory/videos').then((x) => x.items).catch((e) => ({ error: e.message }));
  const id = params.get('id') || meetings[0]?.id;
  const m = id ? await api('/api/meetings/' + id) : null;
  const title = (iid) => (m?.items[iid] ? `<a href="#/news?id=${esc(iid)}">${esc(m.items[iid].title)}</a>` : '<span class="muted">—</span>');
  const list = (arr) => (arr?.length ? `<ul class="list">${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<span class="muted">—</span>');
  const step = (sid) => m?.steps.find((x) => x.expertId === sid);
  const out = (sid) => step(sid)?.output;

  const expertReport = (sid) => {
    const o = out(sid); if (!o) return `<p class="down small">${esc(step(sid)?.error || 'ไม่มีรายงาน')}</p>`;
    if (sid === 'hunter') return o.candidates.map((c) => `<div class="check" style="grid-template-columns:1fr"><div><b>${title(c.itemId)}</b><div class="small">ทำไมตอนนี้: ${esc(c.whyNow)}</div><div class="small">ข้อเท็จจริง: ${esc(c.keyFacts.join(' · ')) || '—'}</div><div class="small muted">แหล่ง: ${esc(c.sources.join(', '))} · ขาด: ${esc(c.gaps.join(', ')) || '—'}</div></div></div>`).join('') + (o.notes ? `<p class="small">${esc(o.notes)}</p>` : '');
    if (sid === 'analyst') return `<table><tbody>${o.rankings.map((r) => `<tr><td class="score">${r.score}</td><td>${title(r.itemId)}<div class="small">มุม: ${esc(r.angle)} · ผู้ชม: ${esc(r.audience)}</div><div class="small muted">${esc(r.reason)}</div></td></tr>`).join('')}</tbody></table>`;
    if (sid === 'factchecker') return `<table><tbody>${o.assessments.map((a) => `<tr><td><span class="tag ${FC_ST[a.status][0]}">${FC_ST[a.status][1]}</span></td><td>${title(a.itemId)}<div class="small">${esc(a.issues.join(' · ')) || '—'}</div><div class="small muted">ต้องตรวจ: ${esc(a.mustVerify.join(' · ')) || '—'}</div></td></tr>`).join('')}</tbody></table>`;
    if (sid === 'producer') return `<table><tbody>${o.concepts.map((c) => `<tr><td>${title(c.itemId)}<div class="small"><b>Hook:</b> ${esc(c.hook)}</div><div class="small">${esc(c.angle)} · ${esc(c.format)} · ${c.durationSec} วิ · ${c.platforms.map((p) => PLAT[p]).join(', ')}</div><div class="small muted">ภาพ: ${esc(c.visuals)}</div></td></tr>`).join('')}</tbody></table>`;
    if (sid === 'performance') return `${o.dataAvailable ? '' : '<p class="banner warn small">ยังไม่มีข้อมูลผลโพสต์จริงพอวิเคราะห์</p>'}<b class="small">ข้อสังเกต</b>${list(o.insights)}<b class="small">ข้อเสนอ</b>${list(o.recommendations)}${o.notes ? `<p class="small muted">${esc(o.notes)}</p>` : ''}`;
    return '';
  };

  const r = m?.mode === 'video' ? null : m?.result;
  const videos = Array.isArray(factoryVideos) ? factoryVideos : [];
  v.innerHTML = `
  <div class="card"><div class="row">
    <div><b>ประชุมทีม AI อัตโนมัติ</b><div class="muted small">Trend Hunter → Trend Analyst → Fact Checker → Creative Producer → Performance Analyst → Content Director (ประธาน) · แต่ละคนได้รับรายงานของคนก่อนหน้า</div></div>
    <span class="spacer"></span>
    <span class="small muted">${s.meetingDailyAt ? `ประชุมอัตโนมัติทุกวัน ${esc(s.meetingDailyAt)} น.` : 'ยังไม่ตั้งเวลาประชุมประจำวัน'} · <a href="#/settings">ตั้งค่า</a></span>
    <button class="btn primary" id="startMeeting" ${STATUS.aiConfigured && !running ? '' : 'disabled'}>${running ? 'กำลังประชุม…' : 'เริ่มประชุมทีม'}</button>
  </div>
  ${STATUS.aiConfigured ? '' : '<div class="banner warn" style="margin:10px 0 0">ต้องตั้งค่า ANTHROPIC_API_KEY ใน .env ก่อน — ระหว่างนี้ใช้ <a href="#/prompts">คลัง Prompt</a> คัดลอกไปใช้ใน Claude ด้วยตนเองได้</div>'}
  <p class="muted small" style="margin:8px 0 0">มติ "เสนอผลิต" จะสร้างงานสถานะร่างในบอร์ดคอนเทนต์เท่านั้น — ทุกชิ้นยังต้องผ่าน Fact Check และผู้อนุมัติที่เป็นมนุษย์ ระบบไม่โพสต์เอง · ใช้ AI 6 ครั้งต่อการประชุม</p></div>
  ${linked ? `<div class="card" style="margin-top:14px"><div class="row">
    <div><b>ประชุมวิเคราะห์วิดีโอจาก Content Factory</b><div class="muted small">Video Analyst → Fact Checker → Editor → Performance Analyst → Content Director · เห็นเฉพาะคำพูด (มีเวลา) และผลวิเคราะห์ที่ Factory วัดได้ ไม่ได้ดูภาพเอง · ใช้ AI 5 ครั้ง</div></div>
    <span class="spacer"></span>
    <select id="videoPick" style="max-width:340px">${videos.map((x) => `<option value="${esc(x.id)}">${esc(x.title)}${x.durationMs ? ` (${mmss(x.durationMs / 1000)})` : ''}${x.analyzed ? '' : ' — ยังไม่วิเคราะห์'}</option>`).join('') || '<option value="">ยังไม่มีวิดีโอ</option>'}</select>
    <button class="btn primary" id="startVideoMeeting" ${STATUS.aiConfigured && !running && videos.length ? '' : 'disabled'}>วิเคราะห์วิดีโอนี้</button>
  </div>${factoryVideos?.error ? `<div class="banner warn" style="margin:10px 0 0">${esc(factoryVideos.error)}</div>` : ''}
  <p class="muted small" style="margin:8px 0 0">วิดีโอที่ยังไม่วิเคราะห์ใน Factory ทีมจะเห็นแค่ชื่อและความยาว — กด "วิเคราะห์" ในหน้าวิดีโอของ Factory ก่อน</p></div>` : ''}
  <div class="grid split" style="margin-top:14px">
    <div class="card"><h2>ประวัติการประชุม</h2>
      ${meetings.map((x) => `<a class="kcard" style="display:block;text-decoration:none;color:inherit;${x.id === id ? 'border-color:var(--accent)' : ''}" href="#/meeting?id=${x.id}"><div class="row"><span class="tag ${M_ST[x.status][0]}">${M_ST[x.status][1]}</span><span class="small muted">${x.mode === 'video' ? 'วิดีโอ' : x.trigger === 'schedule' ? 'ตั้งเวลา' : 'กดเอง'}</span>${x.verdict && VERDICT[x.verdict] ? `<span class="tag ${VERDICT[x.verdict][0]}">${VERDICT[x.verdict][1]}</span>` : ''}</div><div class="small">${x.mode === 'video' ? esc(x.video?.title || '') + ' · ' : ''}${fmt(x.startedAt)}</div><div class="small muted">${x.mode === 'video' ? `งานแก้ ${x.openTasks}` : `เสนอผลิต ${x.produce} · สร้างงาน ${x.created} · งานค้าง ${x.openTasks}`}</div></a>`).join('') || '<div class="muted small">ยังไม่เคยประชุม</div>'}
      <a class="btn sm" href="/api/export?type=meetings&format=json">ส่งออก JSON</a> <a class="btn sm" href="/api/export?type=meetings&format=csv">CSV</a>
    </div>
    <div>${!m ? '<div class="card empty">ยังไม่มีการประชุม</div>' : `
      <div class="card"><div class="row"><h2 style="margin:0">${m.mode === 'video' ? `วิเคราะห์วิดีโอ "${esc(m.video?.title)}"${m.video?.durationSec ? ` (${mmss(m.video.durationSec)})` : ''} · ` : 'การประชุม '}${fmt(m.startedAt)}</h2><span class="tag ${M_ST[m.status][0]}">${M_ST[m.status][1]}</span><span class="spacer"></span><span class="small muted">${m.usage ? `โทเคน เข้า ${n(m.usage.input)} / ออก ${n(m.usage.output)}` : ''}</span></div>
        <div class="row small" style="margin-top:8px">${(m.mode === 'video' ? ['analyst', 'factchecker', 'producer', 'performance', 'director'] : ['hunter', 'analyst', 'factchecker', 'producer', 'performance', 'director']).map((sid) => { const st = step(sid); return `<span class="tag ${!st ? '' : st.ok ? 'ok' : st.ok === false ? 'bad' : 'warn'}">${(m.mode === 'video' ? VIDEO_EXPERT_TH : EXPERT_TH)[sid]} ${!st ? '·' : st.ok ? '✓ ' + Math.round(st.ms / 1000) + 'วิ' : st.ok === false ? '✗' : '…'}</span>`; }).join('→')}</div>
        ${m.error ? `<div class="banner warn" style="margin-top:10px">${esc(m.error)}</div>` : ''}
        ${m.warnings?.length ? `<details style="margin-top:8px"><summary class="small">คำเตือนจากระบบ (${m.warnings.length})</summary>${list(m.warnings)}</details>` : ''}
      </div>
      ${r ? `
      <div class="card" style="margin-top:14px"><h2>สรุปโดยประธาน (Content Director)</h2><p>${esc(r.summary)}</p>
        <h3>มติรายประเด็น</h3><div class="table-wrap"><table><thead><tr><th>#</th><th>มติ</th><th>ประเด็น</th><th>เหตุผล / Hook</th><th>งาน</th></tr></thead><tbody>
        ${r.decisions.map((d) => { const c = m.contents.find((x) => x.itemId === d.itemId); return `<tr><td>${d.priority}</td><td><span class="tag ${DEC[d.decision][0]}">${DEC[d.decision][1]}</span></td><td>${title(d.itemId)}<div class="small muted">${d.platforms.map((p) => PLAT[p]).join(', ')}</div></td><td class="small">${esc(d.reason)}${d.hook ? `<div><b>Hook:</b> ${esc(d.hook)}</div>` : ''}</td><td>${c ? `<a href="#/studio?id=${c.id}">${C_ST[c.status]}</a>` : ''}</td></tr>`; }).join('')}
        </tbody></table></div>
        <h3>ข้อขัดแย้งและข้อยุติ</h3>${r.conflicts.length ? r.conflicts.map((c) => `<div class="check" style="grid-template-columns:1fr"><div><b>${esc(c.topic)}</b> ${c.itemId ? title(c.itemId) : ''}<ul class="list small">${c.positions.map((p) => `<li><b>${esc(EXPERT_TH[p.expert] || p.expert)}:</b> ${esc(p.view)}</li>`).join('')}</ul><div class="small">→ <b>ข้อยุติ:</b> ${esc(c.resolution)}</div></div></div>`).join('') : '<p class="muted small">ไม่มีข้อขัดแย้ง</p>'}
        <h3>งานที่มอบหมาย</h3>${r.assignments.map((a) => `<label class="check" style="grid-template-columns:24px 170px 1fr"><input type="checkbox" class="task" data-tid="${a.id}" ${a.done ? 'checked' : ''}><span class="tag">${esc(EXPERT_TH[a.owner] || a.owner)}</span><span class="small" style="${a.done ? 'text-decoration:line-through;opacity:.6' : ''}">${esc(a.task)} ${a.itemId ? '— ' + title(a.itemId) : ''}</span></label>`).join('') || '<p class="muted small">—</p>'}
        <h3>ความเสี่ยงที่ผู้อนุมัติต้องรู้</h3>${list(r.risks)}
      </div>` : ''}
      ${m.mode === 'video' ? videoMeetingHtml(m) : `<div class="card" style="margin-top:14px"><h2>รายงานผู้เชี่ยวชาญ</h2>
        ${['hunter', 'analyst', 'factchecker', 'producer', 'performance'].map((sid) => `<details ${sid === 'factchecker' ? 'open' : ''}><summary><b>${EXPERT_TH[sid]}</b> <span class="muted small">${step(sid)?.model ? esc(step(sid).model) : ''}</span></summary><div style="margin:8px 0 14px">${expertReport(sid)}</div></details>`).join('')}
      </div>`}`}
    </div>
  </div>`;
  $('#startMeeting').onclick = (e) => act(e.target, () => api('/api/meetings', { method: 'POST', ai: true }), 'เริ่มประชุมแล้ว — ใช้เวลาหลายนาที').then((x) => (location.hash = '#/meeting?id=' + x.id));
  $('#startVideoMeeting')?.addEventListener('click', (e) => act(e.target, () => api('/api/meetings', { method: 'POST', ai: true, body: { videoId: $('#videoPick').value } }), 'เริ่มวิเคราะห์วิดีโอแล้ว — ใช้เวลาหลายนาที').then((x) => (location.hash = '#/meeting?id=' + x.id)));
  $$('.task', v).forEach((cb) => (cb.onchange = () => act(null, () => api(`/api/meetings/${m.id}/tasks/${cb.dataset.tid}`, { method: 'PATCH', body: { done: cb.checked } })).then(render)));
  if (m?.status === 'running' || running) meetingPoll = setTimeout(() => { if (location.hash.startsWith('#/meeting')) render(); }, 4000);
};

// ---------- Expert Prompt Library ----------
PAGES.prompts = async (v) => {
  const lib = await api('/api/experts');
  const copyBtn = (key) => `<button class="btn sm" data-copy="${key}">คัดลอก</button>`;
  const texts = { rules: lib.rules.map((r, i) => `${i + 1}. ${r}`).join('\n'), meeting: lib.meetingPrompt };
  lib.experts.forEach((e) => (texts[e.id] = e.prompt));
  v.innerHTML = `
  <div class="banner info">Prompt ชุดนี้เป็นชุดเดียวกับที่ระบบ<a href="#/meeting">ประชุมทีม AI</a>ส่งให้ Claude จริง — ถ้ายังไม่ตั้ง API key สามารถคัดลอกไปสร้าง Claude Project หรือแชตแยกต่อผู้เชี่ยวชาญได้</div>
  <div class="grid g2">
    <div class="card"><h2>วิธีใช้ด้วยตนเองใน Claude</h2><ol class="list small">
      <li>คัดลอก Prompt ของผู้เชี่ยวชาญแต่ละคนไปสร้าง Claude Project หรือแชตแยก</li>
      <li>ส่งชุดข้อมูลเดียวกัน (ส่งออก <a href="/api/export?type=items&format=json">items.json</a>) ให้ผู้เชี่ยวชาญตามลำดับ</li>
      <li>ส่งคำตอบของคนก่อนหน้าให้คนถัดไป</li>
      <li>รวมคำตอบทั้งหมด แล้วใช้ Prompt ประชุมให้ Content Director ลงมติ</li>
      <li>นำมติไปสร้างงานในหน้า <a href="#/planner">วางแผนคอนเทนต์</a> แล้วส่งตรวจข้อเท็จจริงก่อนอนุมัติ</li></ol>
      <p class="small"><b>แบบอัตโนมัติ:</b> ตั้ง API key แล้วกด "เริ่มประชุมทีม" หรือตั้งเวลาประชุมประจำวัน ระบบจะทำขั้น 1–5 เองและบันทึกลง Dashboard</p></div>
    <div class="card"><div class="row"><h2 style="margin:0">กติกาควบคุมคุณภาพ</h2><span class="spacer"></span>${copyBtn('rules')}</div><ol class="list small">${lib.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ol><p class="muted small">ระบบบังคับซ้ำในโค้ดด้วย: ตัด itemId ที่ไม่มีจริง, ประเด็นที่ Fact Checker ให้ "ไม่ควรทำ" จะไม่ได้มติผลิต, จำกัด 5 เรื่อง, ต้องมีผู้อนุมัติ</p></div>
  </div>
  <div class="grid g2" style="margin-top:14px">
    ${lib.experts.map((e) => `<div class="card"><div class="row"><span class="tag ai">${e.order}</span><h2 style="margin:0">${esc(e.name)}</h2><span class="muted small">${esc(e.th)}</span><span class="spacer"></span>${copyBtn(e.id)}</div>
      <p class="small"><b>หน้าที่:</b> ${esc(e.duty)}<br><b>ผลลัพธ์ที่ต้องส่งมอบ:</b> ${esc(e.deliverable)}</p>
      <details><summary class="small">ดู Prompt</summary><pre class="mono" style="white-space:pre-wrap;background:var(--bg);padding:10px;border-radius:8px">${esc(e.prompt)}</pre></details></div>`).join('')}
  </div>`;
  $$('[data-copy]', v).forEach((b) => (b.onclick = async () => { try { await navigator.clipboard.writeText(texts[b.dataset.copy]); toast('คัดลอกแล้ว'); } catch { toast('คัดลอกไม่ได้ — เปิด "ดู Prompt" แล้วเลือกข้อความเอง', true); } }));
};

// ---------- Settings ----------
PAGES.settings = async (v) => {
  const [s, runs, audit] = await Promise.all([api('/api/settings'), api('/api/runs'), api('/api/audit?limit=100')]);
  const W_L = { freshness: 'ความสดใหม่', importance: 'ความสำคัญ', interest: 'ความสนใจผู้ชม', fit: 'เหมาะกับเพจ', safety: 'ความปลอดภัย' };
  v.innerHTML = `
  <div class="grid g2">
    <div class="card"><h2>โปรไฟล์เพจ</h2>
      <label class="f">ชื่อเพจ<input id="pageName" value="${esc(s.pageName)}"></label>
      <h3>หมวดหลักของเพจ</h3><div class="row small">${STATUS.categories.map((c) => `<label><input type="checkbox" class="pcat" value="${esc(c)}" ${s.pageCategories.includes(c) ? 'checked' : ''}> ${esc(c)}</label>`).join('')}</div>
      <label class="f" style="margin-top:10px">คำ/ประเด็นที่เพจหลีกเลี่ยง (คั่นด้วย ,)<input id="avoid" value="${esc(s.avoidKeywords.join(', '))}"></label>
      <h3>น้ำหนักคะแนน (รวมแล้วปรับเป็น 100 อัตโนมัติ)</h3>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(120px,1fr))">${Object.entries(W_L).map(([k, l]) => `<label class="f">${l}<input type="number" min="0" max="50" class="w" data-k="${k}" value="${s.weights[k]}"></label>`).join('')}</div>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));margin-top:8px"><label class="f">อายุข่าวที่ใช้จัดอันดับ (ชม.)<input type="number" id="maxAge" value="${s.maxItemAgeHours}"></label><label class="f">จำนวนประเด็นที่ส่งให้ AI วิเคราะห์<input type="number" id="topN" value="${s.aiAnalyzeTopN}"></label></div>
      <label class="f" style="margin-top:8px">เวลาประชุมทีม AI ประจำวัน (เวลาไทย, เว้นว่าง = ไม่ประชุมอัตโนมัติ)<input type="time" id="meetAt" value="${esc(s.meetingDailyAt || '')}" style="max-width:160px"></label>
      <p class="muted small">ทุกวันตามเวลานี้ ระบบจะค้นหาข่าวรอบใหม่แล้วประชุมทีม AI อัตโนมัติ (ต้องเปิดเซิร์ฟเวอร์ไว้และตั้ง API key)</p>
      <button class="btn primary" id="saveProfile" style="margin-top:10px">บันทึกและคำนวณคะแนนใหม่</button>
    </div>
    <div class="card"><h2>AI และความปลอดภัย</h2>
      <p>${STATUS.aiConfigured ? `<span class="tag ai">ตั้งค่าแล้ว</span> โมเดล ${esc(STATUS.model)}` : '<span class="tag warn">ยังไม่ตั้งค่า</span>'}</p>
      <p class="small">API key เก็บในไฟล์ <span class="mono">.env</span> ฝั่งเซิร์ฟเวอร์เท่านั้น (ไม่แสดงและไม่ส่งมาที่เบราว์เซอร์) — แก้ไขไฟล์แล้วรีสตาร์ตเซิร์ฟเวอร์</p>
      <pre class="mono" style="background:var(--bg);padding:10px;border-radius:8px;overflow:auto">ANTHROPIC_API_KEY=sk-ant-...\nAI_MODEL=claude-opus-5-5\nAUTO_RUN_MINUTES=60</pre>
      <h3>ข้อมูลและส่งออก</h3>
      <div class="row">${['items', 'contents', 'posts', 'audit'].map((t) => `<a class="btn sm" href="/api/export?type=${t}&format=csv">${t}.csv</a><a class="btn sm" href="/api/export?type=${t}&format=json">${t}.json</a>`).join('')}</div>
      <h3>ข้อมูลจำลอง</h3>
      <p class="muted small">ใช้ทดลองระบบ ทุกรายการติดป้าย "ข้อมูลจำลอง" ไม่มีลิงก์ และไม่ส่งให้ AI</p>
      <div class="row"><button class="btn" id="seed">เพิ่มข้อมูลจำลอง</button><button class="btn danger" id="unseed">ลบข้อมูลจำลองทั้งหมด</button></div>
    </div>
  </div>
  <div class="card" style="margin-top:14px"><div class="row"><h2 style="margin:0">แหล่งข้อมูล (ฟีด RSS/Atom)</h2><span class="spacer"></span><button class="btn sm" id="addFeed">+ เพิ่มฟีด</button><button class="btn primary sm" id="saveFeeds">บันทึกฟีด</button></div>
    <div class="table-wrap"><table><thead><tr><th>ใช้</th><th>ชื่อ</th><th>URL</th><th>ประเภท</th><th>ความน่าเชื่อถือ</th><th></th></tr></thead><tbody id="feeds">${s.feeds.map(feedRow).join('')}</tbody></table></div>
    <p class="muted small">ประเภท "trends" = Google Trends RSS · "opinion" = ทุกข่าวในฟีดถูกจัดเป็นความคิดเห็น · ระดับความน่าเชื่อถือใช้เลือกข่าวหลักในคลัสเตอร์</p>
  </div>
  <div class="grid g2" style="margin-top:14px">
    <div class="card"><h2>ประวัติรอบค้นหา</h2><div class="table-wrap"><table><thead><tr><th>เวลา</th><th>ที่มา</th><th>ดึง</th><th>ใหม่</th><th>ข้อผิดพลาด</th></tr></thead><tbody>${runs.map((r) => `<tr><td class="small">${fmt(r.startedAt)}</td><td>${r.trigger === 'schedule' ? 'ตั้งเวลา' : 'กดเอง'}</td><td>${r.fetched}</td><td>${r.newItems}</td><td class="small">${r.errors.map(esc).join('<br>') || '—'}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">—</td></tr>'}</tbody></table></div></div>
    <div class="card"><h2>บันทึกการทำงาน (Audit log)</h2><div class="table-wrap" style="max-height:420px;overflow:auto"><table><tbody>${audit.map((a) => `<tr><td class="small">${fmt(a.at)}</td><td>${esc(a.action)}</td><td>${esc(a.entity)}</td><td class="small">${esc(a.detail)}</td></tr>`).join('')}</tbody></table></div></div>
  </div>`;
  $('#saveProfile').onclick = (e) => act(e.target, () => api('/api/settings', { method: 'PUT', body: {
    pageName: $('#pageName').value, pageCategories: $$('.pcat:checked').map((x) => x.value), avoidKeywords: $('#avoid').value.split(','),
    weights: Object.fromEntries($$('.w').map((x) => [x.dataset.k, +x.value])), maxItemAgeHours: +$('#maxAge').value, aiAnalyzeTopN: +$('#topN').value, meetingDailyAt: $('#meetAt').value } }), 'บันทึกแล้ว คะแนนคำนวณใหม่').then(render);
  $('#addFeed').onclick = () => $('#feeds').insertAdjacentHTML('beforeend', feedRow({ id: '', name: '', url: '', type: 'news', credibility: 'medium', enabled: true }));
  $('#feeds').onclick = (e) => {
    const tr = e.target.closest('tr');
    if (e.target.dataset.rm != null) tr.remove();
    if (e.target.dataset.test != null) act(e.target, () => api('/api/feeds/test', { method: 'POST', body: { url: $('[data-k=url]', tr).value, type: $('[data-k=type]', tr).value } }), (r) => `ใช้ได้: ${r.count} รายการ เช่น "${r.sample[0]?.title || '-'}"`);
  };
  $('#saveFeeds').onclick = (e) => act(e.target, () => api('/api/settings', { method: 'PUT', body: { feeds: $$('#feeds tr').map((tr) => ({ id: tr.dataset.id || undefined, enabled: $('[data-k=enabled]', tr).checked, ...Object.fromEntries($$('[data-k]:not([type=checkbox])', tr).map((x) => [x.dataset.k, x.value.trim()])) })) } }), 'บันทึกฟีดแล้ว').then(render);
  $('#seed').onclick = (e) => act(e.target, () => api('/api/mock', { method: 'POST' }), 'เพิ่มข้อมูลจำลองแล้ว').then(render);
  $('#unseed').onclick = (e) => confirm('ลบข้อมูลจำลองทั้งหมด (รวมงานที่สร้างจากข้อมูลจำลอง)?') && act(e.target, () => api('/api/mock', { method: 'DELETE' }), 'ลบแล้ว').then(render);
};
const feedRow = (f) => `<tr data-id="${esc(f.id)}"><td><input type="checkbox" data-k="enabled" ${f.enabled ? 'checked' : ''}></td><td><input data-k="name" value="${esc(f.name)}"></td><td><input data-k="url" value="${esc(f.url)}" style="width:100%;min-width:260px"></td>
  <td><select data-k="type">${['news', 'trends', 'opinion'].map((t) => `<option ${t === f.type ? 'selected' : ''}>${t}</option>`).join('')}</select></td>
  <td><select data-k="credibility">${['high', 'medium', 'low'].map((t) => `<option ${t === f.credibility ? 'selected' : ''}>${t}</option>`).join('')}</select></td>
  <td class="row"><button class="btn sm" data-test>ทดสอบ</button><button class="btn sm danger" data-rm>ลบ</button></td></tr>`;

// ================= router =================
async function render() {
  const [path, query] = (location.hash.slice(2) || 'overview').split('?');
  const page = PAGES[path] ? path : 'overview';
  $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.page === page));
  $('#pageTitle').textContent = TITLES[page];
  document.title = `${TITLES[page]} · AI Content Intelligence`;
  try { await refreshStatus(); await PAGES[page]($('#view'), new URLSearchParams(query)); }
  catch (e) { $('#view').innerHTML = `<div class="card banner warn">โหลดไม่สำเร็จ: ${esc(e.message)}</div>`; }
}
window.addEventListener('hashchange', () => { closeDrawer(); render(); });
render();
