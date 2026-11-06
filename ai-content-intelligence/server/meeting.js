// Team meeting orchestration: calls the 5 experts in order (each sees the shared data
// package plus the earlier experts' reports), then the Content Director chairs, resolves
// conflicts, decides and assigns. Results are saved to the dashboard; "produce" decisions
// become draft content jobs that still need fact check + human approval.
import { EXPERTS, DirectorSchema, systemPromptFor } from './experts.js';

const PIPELINE = ['hunter', 'analyst', 'factchecker', 'producer', 'performance'];
const EFFORT = { hunter: 'low', analyst: 'low', factchecker: 'medium', producer: 'low', performance: 'low', director: 'medium' };

function packageItems(items) {
  return items.map((i) => ({
    itemId: i.id, title: i.title, summary: i.summary || '', source: i.source, url: i.url,
    publishedAt: i.publishedAt, eventAt: i.eventAt || null, discoveredAt: i.discoveredAt,
    category: i.category, systemVerification: i.verification, systemScore: i.score?.total ?? null,
    outletsReporting: i.score?.outlets ?? 1, googleTrendsTraffic: i.trafficHint || null,
    otherOutlets: (i.relatedSources || []).slice(0, 6).map((r) => ({ source: r.source, title: r.title })),
  }));
}

const data = (label, obj) => `<${label}>\n${JSON.stringify(obj, null, 1)}\n</${label}>`;

/** Keep only entries whose itemId exists in the package; report what was dropped. */
function keepKnown(list = [], known, warnings, who) {
  const ok = [];
  for (const x of list) {
    if (!x.itemId || known.has(x.itemId)) ok.push(x);
    else warnings.push(`${who} อ้าง itemId ที่ไม่มีในข้อมูล (${x.itemId}) — ตัดทิ้ง`);
  }
  return ok;
}

/**
 * @param deps { db, ask(system, user, schema, effort), rankTop, perfStats, newId, now, audit, save, createContentFor(item, meta) }
 */
export async function runMeeting(deps, { trigger = 'manual', topN = 15 } = {}) {
  const { db, ask, rankTop, perfStats, newId, now, audit, save, createContentFor } = deps;
  const top = rankTop(db.items.filter((i) => !i.isMock), topN);
  if (!top.length) throw new Error('ยังไม่มีประเด็นจริงให้ประชุม — กด "เริ่มรอบค้นหา" ก่อน');

  const realPosts = db.posts.filter((p) => !p.isMock);
  const perf = realPosts.length ? perfStats(realPosts) : null;
  const pkg = {
    page: { name: db.settings.pageName, mainCategories: db.settings.pageCategories, avoid: db.settings.avoidKeywords },
    meetingTime: now(),
    items: packageItems(top),
  };
  const perfPkg = perf ? { posts: perf.rows.slice(0, 30).map(({ id, ...r }) => r), byPlatform: perf.byPlatform, realPostCount: realPosts.length } : { realPostCount: 0, note: 'ยังไม่มีข้อมูลผลโพสต์จริง' };
  const known = new Set(top.map((i) => i.id));

  const m = { id: newId('m'), trigger, status: 'running', startedAt: now(), itemIds: [...known], steps: [], warnings: [], result: null, createdContentIds: [] };
  db.meetings ||= [];
  db.meetings.unshift(m);
  save();

  const reports = {};
  for (const eid of PIPELINE) {
    const e = EXPERTS.find((x) => x.id === eid);
    const step = { expertId: eid, name: e.name, startedAt: now() };
    m.steps.push(step);
    const t0 = Date.now();
    try {
      // Each expert gets the shared package + everything said before it (sequential hand-off).
      const user = eid === 'performance'
        ? `${data('performance_data', perfPkg)}\n\n${data('team_reports_so_far', reports)}\n\nส่งมอบงานตามบทบาทของคุณ`
        : `${data('news_data', pkg)}\n\n${Object.keys(reports).length ? data('team_reports_so_far', reports) + '\n\n' : ''}ส่งมอบงานตามบทบาทของคุณ`;
      const out = await ask(systemPromptFor(eid), user, e.schema, EFFORT[eid]);
      const o = out.data;
      for (const k of ['candidates', 'rankings', 'assessments', 'concepts']) if (o[k]) o[k] = keepKnown(o[k], known, m.warnings, e.name);
      step.output = o; step.model = out.model; step.usage = out.usage; step.ok = true;
      reports[eid] = o;
    } catch (err) {
      step.ok = false; step.error = String(err.message || err);
      m.warnings.push(`${e.name} ทำงานไม่สำเร็จ: ${step.error}`);
    }
    step.ms = Date.now() - t0;
    save();
  }

  // Chair
  const step = { expertId: 'director', name: 'Content Director', startedAt: now() };
  m.steps.push(step);
  const t0 = Date.now();
  try {
    if (!reports.hunter && !reports.analyst) throw new Error('ไม่มีรายงานจาก Trend Hunter และ Trend Analyst — ประชุมต่อไม่ได้');
    const out = await ask(systemPromptFor('director'), `${data('news_data', pkg)}\n\n${data('expert_reports', reports)}\n\nผู้เชี่ยวชาญที่ไม่ได้ส่งรายงาน: ${PIPELINE.filter((x) => !reports[x]).join(', ') || '-'}\n\nเปิดประชุม สรุป ลงมติ และมอบหมายงาน`, DirectorSchema, EFFORT.director);
    const r = out.data;
    r.decisions = keepKnown(r.decisions, known, m.warnings, 'Content Director').sort((a, b) => a.priority - b.priority);
    // Enforce rules in code, not only in the prompt.
    const fc = Object.fromEntries((reports.factchecker?.assessments || []).map((a) => [a.itemId, a.status]));
    for (const d of r.decisions) {
      if (d.decision === 'produce' && fc[d.itemId] === 'reject') { d.decision = 'hold'; d.reason = `[ระบบเปลี่ยนเป็น hold: Fact Checker ให้ reject] ${d.reason}`; }
    }
    let produce = 0;
    for (const d of r.decisions) if (d.decision === 'produce' && ++produce > 5) { d.decision = 'hold'; d.reason = `[ระบบเปลี่ยนเป็น hold: เกินโควตา 5 เรื่อง] ${d.reason}`; }
    r.assignments = (r.assignments || []).map((a) => ({ id: newId('t'), ...a, itemId: known.has(a.itemId) ? a.itemId : '', done: false }));
    step.output = r; step.model = out.model; step.usage = out.usage; step.ok = true;
    m.result = r;

    // Record outcomes in the dashboard
    for (const d of r.decisions) {
      const item = db.items.find((i) => i.id === d.itemId);
      if (!item) continue;
      item.meeting = { meetingId: m.id, decision: d.decision, reason: d.reason, at: now() };
      if (d.decision === 'produce') {
        const c = createContentFor(item, { meetingId: m.id, hook: d.hook, reason: d.reason, platforms: d.platforms, concept: reports.producer?.concepts?.find((x) => x.itemId === item.id) || null, mustVerify: reports.factchecker?.assessments?.find((x) => x.itemId === item.id)?.mustVerify || [] });
        if (c) m.createdContentIds.push(c.id);
      } else if (d.decision === 'hold' && item.status === 'new') item.status = 'shortlisted';
    }
    m.status = 'done';
  } catch (err) {
    step.ok = false; step.error = String(err.message || err);
    m.status = 'failed'; m.error = step.error;
  }
  step.ms = Date.now() - t0;
  m.finishedAt = now();
  m.usage = m.steps.reduce((a, s) => ({ input: a.input + (s.usage?.input_tokens || 0), output: a.output + (s.usage?.output_tokens || 0) }), { input: 0, output: 0 });
  audit('meeting', 'meeting', m.id, m.status === 'done' ? `มติ: ผลิต ${m.result.decisions.filter((d) => d.decision === 'produce').length} · สร้างงาน ${m.createdContentIds.length}` : `ล้มเหลว: ${m.error}`);
  save();
  return m;
}

/** Bangkok-time daily trigger. `at` is "HH:MM". Returns true when a run is due now. */
export function dailyDue(at, meetings, nowDate = new Date()) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(at || '');
  if (!m) return false;
  const bkk = new Date(nowDate.getTime() + 7 * 36e5);
  const today = bkk.toISOString().slice(0, 10);
  const minutes = bkk.getUTCHours() * 60 + bkk.getUTCMinutes();
  if (minutes < Number(m[1]) * 60 + Number(m[2])) return false;
  return !meetings.some((x) => x.trigger === 'schedule' && new Date(Date.parse(x.startedAt) + 7 * 36e5).toISOString().slice(0, 10) === today);
}
