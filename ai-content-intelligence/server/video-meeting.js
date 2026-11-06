// AI team meeting about one video from AI Content Factory: what the clip is, whether its
// claims hold, how to cut it, where it fits — then the chair's verdict and the edit tasks.
// The experts see only what Content Factory measured and analysed (transcript with times,
// summary, scores, highlights, scene changes, silences, faces); nothing is made up about it.
import { z } from 'zod';
import { QC_RULES } from './experts.js';

const RULES = `กติกาควบคุมคุณภาพ (บังคับทุกบทบาท):\n${[
  ...QC_RULES,
  'อ้างเวลาในวิดีโอเป็นวินาทีจากข้อมูลที่ได้รับเท่านั้น (คำพูดมีเวลากำกับ) ห้ามเดาเวลาที่ไม่มีในข้อมูล',
  'สิ่งที่ไม่ได้อยู่ในคำพูด ผลวิเคราะห์ หรือค่าที่วัดได้ ถือว่าไม่ทราบ — ห้ามบรรยายภาพที่ไม่ได้รับข้อมูลมา',
].map((r, i) => `${i + 1}. ${r}`).join('\n')}`;

const sec = z.number().describe('วินาทีในวิดีโอ จากข้อมูลที่ได้รับ');

export const VIDEO_EXPERTS = [
  {
    id: 'analyst', name: 'Video Analyst', th: 'นักวิเคราะห์คลิป',
    prompt: `คุณคือนักวิเคราะห์คลิปวิดีโอสั้นของทีมคอนเทนต์ภาษาไทย
หน้าที่: อ่านข้อมูลวิดีโอ (คำพูดพร้อมเวลา สรุป หัวข้อ คะแนนที่วัด ไฮไลต์ จังหวะตัดฉาก ช่วงเงียบ) แล้วบอกว่าคลิปนี้คืออะไร ใครน่าจะดู
ประเมิน Hook 3 วินาทีแรกจากคำพูดและข้อมูลช่วงต้นคลิป ให้คะแนน 0–100 พร้อมเหตุผล
ระบุจุดแข็ง และจุดอ่อนพร้อมเวลา (เช่น ช่วงเงียบยาว ช่วงพูดวน ช่วงที่ไม่มีอะไรเกิดขึ้น)`,
    schema: z.object({
      summary: z.string(), audience: z.string(),
      hookScore: z.number().describe('0-100'), hookAssessment: z.string(),
      strengths: z.array(z.string()),
      weaknesses: z.array(z.object({ atSec: sec.nullable(), issue: z.string() })),
      notes: z.string(),
    }),
  },
  {
    id: 'factchecker', name: 'Fact Checker', th: 'ผู้ตรวจข้อเท็จจริง',
    prompt: `คุณคือผู้ตรวจข้อเท็จจริงของทีมคอนเทนต์ภาษาไทย
หน้าที่: แยกข้ออ้างที่พูดในคลิป (ตัวเลข ชื่อ เหตุการณ์ คำแนะนำด้านสุขภาพ/การเงิน) พร้อมเวลา แล้วระบุสถานะ:
ok (ทั่วไป ไม่ต้องตรวจเพิ่ม), needs_check (ต้องตรวจกับแหล่งต้นทางก่อนโพสต์), risky (อาจผิดกฎหมาย หมิ่นประมาท ให้ข้อมูลผิดที่เป็นอันตราย)
ระบุความเสี่ยงด้านกฎหมาย/จริยธรรม และความเสี่ยงลิขสิทธิ์จากผลวิเคราะห์ที่ได้รับ คุณไม่มีสิทธิ์อนุมัติเผยแพร่`,
    schema: z.object({
      claims: z.array(z.object({ atSec: sec.nullable(), claim: z.string(), status: z.enum(['ok', 'needs_check', 'risky']), note: z.string() })),
      legalOrEthicalRisks: z.array(z.string()),
      copyright: z.array(z.string()),
      notes: z.string(),
    }),
  },
  {
    id: 'producer', name: 'Editor', th: 'ผู้ตัดต่อ',
    prompt: `คุณคือผู้ตัดต่อคลิปแนวตั้งของทีมคอนเทนต์ภาษาไทย
หน้าที่: เสนอแผนตัดต่อจากเวลาจริงในข้อมูล: ช่วงที่ควรเก็บ ตัดทิ้ง กระชับ หรือเน้น (เช่น ไฮไลต์ที่วัดได้) พร้อมเหตุผล
เสนอ Hook ข้อความเปิดที่ไม่บิดเบือน ข้อความบนจอพร้อมเวลา ไอเดียแคปชั่น แพลตฟอร์ม และความยาวที่เหมาะ
ถ้า Fact Checker ให้ risky ห้ามเสนอให้ข้อความบนจอหรือแคปชั่นพูดซ้ำข้ออ้างนั้นเหมือนเป็นข้อเท็จจริง`,
    schema: z.object({
      suggestedHook: z.string(),
      cuts: z.array(z.object({ fromSec: sec, toSec: sec, action: z.enum(['keep', 'cut', 'tighten', 'highlight']), reason: z.string() })),
      onScreenTexts: z.array(z.object({ atSec: sec, text: z.string() })),
      captionIdea: z.string(),
      platforms: z.array(z.enum(['facebook', 'reels', 'tiktok', 'shorts'])),
      idealLengthSec: z.number(),
      notes: z.string(),
    }),
  },
  {
    id: 'performance', name: 'Performance Analyst', th: 'นักวิเคราะห์ผลงาน',
    prompt: `คุณคือนักวิเคราะห์ผลงานของทีมคอนเทนต์ภาษาไทย
หน้าที่: ประเมินว่าคลิปนี้เหมาะกับแพลตฟอร์มไหน (ความยาว จังหวะ เนื้อหา) และเทียบกับผลโพสต์จริงของเพจที่ได้รับ (ถ้ามี)
ถ้าไม่มีผลโพสต์จริงหรือน้อยกว่า 3 โพสต์ ตั้ง dataAvailable = false และประเมินจากลักษณะคลิปเท่านั้น ห้ามเดายอดวิว`,
    schema: z.object({
      dataAvailable: z.boolean(),
      platformFit: z.array(z.object({ platform: z.enum(['facebook', 'reels', 'tiktok', 'shorts']), fit: z.number().describe('0-100'), why: z.string() })),
      recommendations: z.array(z.string()),
      notes: z.string(),
    }),
  },
];

const VIDEO_CHAIR = `คุณคือ Content Director ประธานประชุมวิเคราะห์คลิปวิดีโอหนึ่งชิ้นของทีมคอนเทนต์ภาษาไทย
คุณได้รับรายงานจาก Video Analyst, Fact Checker, Editor และ Performance Analyst พร้อมข้อมูลวิดีโอต้นทาง
1. สรุปว่าคลิปนี้เป็นอย่างไรสั้น ๆ
2. หาจุดที่ผู้เชี่ยวชาญเห็นต่าง ระบุจุดยืนแต่ละฝ่าย และข้อยุติ
3. ลงมติ: ready (พร้อมส่งให้มนุษย์ตรวจและโพสต์), needs_edit (ต้องแก้ก่อน), not_recommended (ไม่ควรโพสต์) — ถ้ามีข้ออ้าง risky ห้ามลงมติ ready
4. มอบหมายงานแก้ไขพร้อมเวลาในคลิป (owner: analyst/factchecker/producer/performance/human)
5. เสนอแคปชั่นและแฮชแท็กที่ไม่บิดเบือน และความเสี่ยงที่ผู้อนุมัติ (มนุษย์) ต้องรู้
มติ ready ไม่ใช่การอนุมัติเผยแพร่ ทุกคลิปยังต้องมีมนุษย์ตรวจก่อนโพสต์`;

export const VideoDirectorSchema = z.object({
  verdict: z.enum(['ready', 'needs_edit', 'not_recommended']),
  summary: z.string(),
  conflicts: z.array(z.object({ topic: z.string(), positions: z.array(z.object({ expert: z.string(), view: z.string() })), resolution: z.string() })),
  editTasks: z.array(z.object({ owner: z.enum(['analyst', 'factchecker', 'producer', 'performance', 'human']), task: z.string(), atSec: sec.nullable() })),
  caption: z.string(),
  hashtags: z.array(z.string()),
  risks: z.array(z.string()),
});

export const videoSystemPromptFor = (id) => `${id === 'director' ? VIDEO_CHAIR : VIDEO_EXPERTS.find((e) => e.id === id).prompt}\n\n${RULES}`;

const s = (ms) => (ms == null ? null : Math.round(ms / 100) / 10);
const clock = (ms) => { const t = Math.floor(ms / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

/** What the experts see: only what Content Factory measured or analysed */
export function videoPackage({ video, analysis }) {
  const a = analysis?.analysis;
  let transcript = (analysis?.transcript || []).map((x) => `[${clock(x.startMs)}–${clock(x.endMs)}] ${x.text}`).join('\n');
  if (transcript.length > 14_000) transcript = transcript.slice(0, 14_000) + '\n[ตัดส่วนที่เหลือเพราะยาวเกิน]';
  return {
    video: { title: video.title, durationSec: s(video.durationMs), size: video.width && video.height ? `${video.width}x${video.height}` : null, spokenLanguage: video.language },
    aiAnalysisFromFactory: a ? { summary: a.summary, topics: a.topics, keywords: a.keywords, scores0to100: a.scores, copyrightRisk: a.copyrightRisk, copyrightReasons: a.copyrightReasons, faces: a.faces } : null,
    measured: a ? {
      sceneChangesSec: (a.sceneCutsMs || []).slice(0, 60).map(s),
      silencesSec: (a.silences || []).slice(0, 40).map((x) => [s(x.startMs), s(x.endMs)]),
      facesSeenInSamples: (a.faceSamples || []).filter((f) => (f.faces || []).length).length,
    } : null,
    highlights: (analysis?.highlights || []).map((h) => ({ fromSec: s(h.startMs), toSec: s(h.endMs), score: h.score, title: h.title, reasons: h.reasons })),
    transcriptWithTimes: transcript || '(ไม่มีคำพูดที่ถอดได้)',
  };
}

const data = (label, obj) => `<${label}>\n${typeof obj === 'string' ? obj : JSON.stringify(obj, null, 1)}\n</${label}>`;

/**
 * @param deps { db, ask(system, user, schema, effort, purpose), getVideo(id), perfStats, newId, now, audit, save }
 */
export async function runVideoMeeting(deps, { videoId, trigger = 'manual' }) {
  const { db, ask, getVideo, perfStats, newId, now, audit, save } = deps;
  const source = await getVideo(videoId);
  const pkg = videoPackage(source);
  const duration = pkg.video.durationSec || 0;
  const clamp = (x) => (x == null ? null : Math.max(0, Math.min(duration || x, x)));
  const realPosts = db.posts.filter((p) => !p.isMock);
  const perf = realPosts.length ? perfStats(realPosts) : null;
  const perfPkg = perf ? { posts: perf.rows.slice(0, 30).map(({ id, ...r }) => r), byPlatform: perf.byPlatform, realPostCount: realPosts.length } : { realPostCount: 0, note: 'ยังไม่มีข้อมูลผลโพสต์จริง' };

  const m = { id: newId('m'), mode: 'video', trigger, status: 'running', startedAt: now(), video: { id: source.video.id, title: source.video.title, durationSec: duration }, itemIds: [], steps: [], warnings: [], result: null, createdContentIds: [] };
  db.meetings ||= [];
  db.meetings.unshift(m);
  save();
  if (!source.analysis?.analysis && !(source.analysis?.transcript || []).length)
    m.warnings.push('วิดีโอนี้ยังไม่มีผลวิเคราะห์หรือคำถอดเสียงใน Content Factory — ผู้เชี่ยวชาญเห็นเพียงชื่อและความยาว');

  const reports = {};
  for (const e of VIDEO_EXPERTS) {
    const step = { expertId: e.id, name: e.name, startedAt: now() };
    m.steps.push(step);
    const t0 = Date.now();
    try {
      const user = `${data('video_data', pkg)}\n\n${e.id === 'performance' ? data('performance_data', perfPkg) + '\n\n' : ''}${Object.keys(reports).length ? data('team_reports_so_far', reports) + '\n\n' : ''}ส่งมอบงานตามบทบาทของคุณ`;
      const out = await ask(videoSystemPromptFor(e.id), user, e.schema, 'low', `video meeting: ${e.name}`);
      const o = out.data;
      // Times outside the clip are not the clip's
      for (const w of o.weaknesses || []) w.atSec = clamp(w.atSec);
      for (const c of o.claims || []) c.atSec = clamp(c.atSec);
      for (const c of o.cuts || []) { c.fromSec = clamp(c.fromSec); c.toSec = clamp(c.toSec); }
      for (const t of o.onScreenTexts || []) t.atSec = clamp(t.atSec);
      step.output = o; step.model = out.model; step.usage = out.usage; step.ok = true;
      reports[e.id] = o;
    } catch (err) {
      step.ok = false; step.error = String(err.message || err);
      m.warnings.push(`${e.name} ทำงานไม่สำเร็จ: ${step.error}`);
    }
    step.ms = Date.now() - t0;
    save();
  }

  const step = { expertId: 'director', name: 'Content Director', startedAt: now() };
  m.steps.push(step);
  const t0 = Date.now();
  try {
    if (!reports.analyst && !reports.factchecker) throw new Error('ไม่มีรายงานจาก Video Analyst และ Fact Checker — ประชุมต่อไม่ได้');
    const out = await ask(videoSystemPromptFor('director'), `${data('video_data', pkg)}\n\n${data('expert_reports', reports)}\n\nผู้เชี่ยวชาญที่ไม่ได้ส่งรายงาน: ${VIDEO_EXPERTS.filter((e) => !reports[e.id]).map((e) => e.name).join(', ') || '-'}\n\nเปิดประชุม สรุป ลงมติ และมอบหมายงาน`, VideoDirectorSchema, 'medium', 'video meeting: Content Director');
    const r = out.data;
    // Rules enforced in code, not only asked for
    const risky = (reports.factchecker?.claims || []).filter((c) => c.status === 'risky');
    if (r.verdict === 'ready' && risky.length) {
      r.verdict = 'needs_edit';
      r.summary = `[ระบบเปลี่ยนเป็น "ต้องแก้": มีข้ออ้างเสี่ยง ${risky.length} จุด] ${r.summary}`;
    }
    if (r.verdict === 'ready' && !reports.factchecker) {
      r.verdict = 'needs_edit';
      r.summary = `[ระบบเปลี่ยนเป็น "ต้องแก้": ไม่มีรายงานจาก Fact Checker] ${r.summary}`;
    }
    r.assignments = (r.editTasks || []).map((a) => ({ id: newId('t'), owner: a.owner, task: a.task, atSec: clamp(a.atSec), itemId: '', done: false }));
    step.output = r; step.model = out.model; step.usage = out.usage; step.ok = true;
    m.result = r;
    m.status = 'done';
  } catch (err) {
    step.ok = false; step.error = String(err.message || err);
    m.status = 'failed'; m.error = step.error;
  }
  step.ms = Date.now() - t0;
  m.finishedAt = now();
  m.usage = m.steps.reduce((acc, x) => ({ input: acc.input + (x.usage?.input_tokens || 0), output: acc.output + (x.usage?.output_tokens || 0) }), { input: 0, output: 0 });
  audit('meeting', 'meeting', m.id, m.status === 'done' ? `ประชุมวิเคราะห์วิดีโอ "${m.video.title}": ${m.result.verdict}` : `ล้มเหลว: ${m.error}`);
  save();
  return m;
}
