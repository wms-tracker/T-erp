// Rule-based pipeline: dedup, clustering, categories, verification, scoring,
// fact-check rules, template scripts, performance stats. Deterministic and explainable.

const norm = (s = '') => s.toLowerCase().replace(/[\s"'“”‘’!?.,:;()\[\]{}|\-–—_/\\#@*]+/g, '');
function grams(s, n = 3) {
  const t = norm(s); const set = new Set();
  for (let i = 0; i <= t.length - n; i++) set.add(t.slice(i, i + n));
  return set;
}
export function similarity(a, b) {
  const A = grams(a), B = grams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0; for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter);
}

// ---------- categories ----------
const CATEGORY_RULES = [
  ['ภัยพิบัติ/อากาศ', /น้ำท่วม|พายุ|ฝนตกหนัก|แผ่นดินไหว|ไฟป่า|ภัยแล้ง|อุตุ|ดินถล่ม|สึนามิ|PM ?2\.5|ฝุ่น|คลื่นความร้อน|มรสุม/],
  ['การเมือง', /รัฐบาล|นายก|รัฐมนตรี|สภา|ส\.ส\.|ส\.ว\.|พรรค|เลือกตั้ง|กกต|ครม\.|ฝ่ายค้าน|ทักษิณ|แพทองธาร|อนุทิน|การเมือง/],
  ['เศรษฐกิจ', /หุ้น|ทองคำ|ราคาทอง|ค่าเงิน|ดอกเบี้ย|เงินเฟ้อ|เศรษฐกิจ|ส่งออก|ภาษี|น้ำมัน|ธนาคาร|ตลาดหลักทรัพย์|ลงทุน|\bSET\b|\bGDP\b/],
  ['เทคโนโลยี', /\bAI\b|ปัญญาประดิษฐ์|iPhone|แอปพลิเคชัน|สมาร์ทโฟน|เทคโนโลยี|ไซเบอร์|แฮก|\bGoogle\b|\bApple\b|Samsung|ChatGPT|\bClaude\b|ชิป|\bEV\b|รถยนต์ไฟฟ้า|ดิจิทัล/],
  ['กีฬา', /ฟุตบอล|บอล|พรีเมียร์|ลีก|ทีมชาติ|วอลเลย์|มวย|แบดมินตัน|โอลิมปิก|ซีเกมส์|นักเตะ|ประตู|แมตช์|เทนนิส|กอล์ฟ|\bF1\b|MotoGP|นักชก|ONE Championship|ไฟต์/],
  ['บันเทิง', /ดารา|นักแสดง|ละคร|ซีรีส์|ภาพยนตร์|หนัง|คอนเสิร์ต|ศิลปิน|นักร้อง|เพลง|ไอดอล|K-?POP|บันเทิง|เวทีประกวด|มิสแกรนด์|มิสยูนิเวิร์ส|The Voice|รายการทีวี/],
  ['อาชญากรรม', /จับกุม|ตำรวจ|คดี|ฆาตกรรม|ยิง|แทง|ปล้น|ยาเสพติด|ฉ้อโกง|แก๊งคอล|หลอกลวง|ศาล|จำคุก|ผู้ต้องหา/],
  ['สุขภาพ', /โรค|ไวรัส|วัคซีน|โรงพยาบาล|สาธารณสุข|แพทย์|สุขภาพ|ไข้|มะเร็ง|ระบาด/],
  ['ต่างประเทศ', /สหรัฐ|จีน|ญี่ปุ่น|เกาหลี|รัสเซีย|ยูเครน|อิสราเอล|กาซา|ยุโรป|อังกฤษ|อินเดีย|กัมพูชา|เมียนมา|ทรัมป์|ต่างประเทศ|\bUN\b|NATO/],
  ['สังคม', /ชาวบ้าน|นักเรียน|โรงเรียน|ครู|แรงงาน|ค่าแรง|รถไฟ|BTS|MRT|จราจร|อุบัติเหตุ|ไวรัล|โซเชียล|ร้องเรียน|ชุมชน|พยาบาล|เยียวยา/],
];
export const CATEGORIES = [...CATEGORY_RULES.map((r) => r[0]), 'อื่นๆ'];
// Title decides first; summary only breaks ties when the title gives no signal.
export function categorize(title, summary = '') {
  for (const text of [title, summary]) for (const [name, re] of CATEGORY_RULES) if (re.test(text)) return name;
  return 'อื่นๆ';
}

const OPINION_RE = /คอลัมน์|บทความ|บทวิเคราะห์|ทัศนะ|ความเห็น|มุมมอง|บทบรรณาธิการ|opinion|editorial|เปิดมุมมอง|เขียนโดย/i;
const RUMOR_RE = /ลือ|ข่าวลือ|ว่อนโซเชียล|แชร์ว่อน|อ้างว่า|ไม่ยืนยัน|เพจดัง|ชาวเน็ตแห่|จริงหรือ|\?$/;

const RISK_RULES = [
  [/ม\.?\s?112|หมิ่นพระ|สถาบันพระมหากษัตริย์/, 8, 'เกี่ยวข้องกฎหมายอ่อนไหว (ม.112) — ต้องตรวจถ้อยคำอย่างเข้มงวด'],
  [/คดี|ศาล|ผู้ต้องหา|จับกุม|ฟ้อง/, 4, 'เกี่ยวกับคดีความ — ระวังการกล่าวหาก่อนศาลตัดสิน'],
  [/เสียชีวิต|ศพ|ฆ่า|ฆาตกรรม|ฆ่าตัวตาย|ข่มขืน/, 4, 'มีความรุนแรง/การเสียชีวิต — ระวังภาพและการบรรยาย'],
  [/เด็ก|นักเรียน|ผู้เยาว์/, 2, 'เกี่ยวข้องกับเด็ก — ห้ามเปิดเผยตัวตน'],
  [/รักษาหาย|ยาวิเศษ|สมุนไพรรักษา|ป้องกันมะเร็ง/, 4, 'ข้ออ้างทางการแพทย์ — ต้องมีแหล่งทางการ'],
  [/ศาสนา|พระสงฆ์|มุสลิม|คริสต์/, 2, 'ประเด็นศาสนา — ระวังความอ่อนไหว'],
];

// ---------- verification ----------
export function classifyVerification(item) {
  if (item.feedType === 'opinion' || OPINION_RE.test(item.title)) return 'opinion';
  const distinct = new Set([item.source, ...(item.relatedSources || []).map((r) => r.source)].filter(Boolean));
  if (item.kind === 'trend') return distinct.size >= 2 ? 'confirmed' : 'unverified';
  if (RUMOR_RE.test(item.title)) return 'unverified';
  return distinct.size >= 2 ? 'confirmed' : 'unverified';
}

// ---------- clustering ----------
/** Group items about the same story. Returns Map clusterId -> items. Mutates items with clusterId/isPrimary. */
export function cluster(items, threshold = 0.42) {
  const clusters = [];
  for (const it of items) {
    let best = null, bestSim = 0;
    for (const c of clusters) {
      const s = similarity(it.title, c.rep.title);
      if (s > bestSim) { bestSim = s; best = c; }
    }
    if (best && bestSim >= threshold) best.members.push(it);
    else clusters.push({ rep: it, members: [it] });
  }
  for (const c of clusters) {
    const id = c.rep.clusterId || c.rep.id;
    // primary = best credibility, then earliest discovered
    const rank = { high: 0, medium: 1, low: 2 };
    c.members.sort((a, b) => (rank[a.feedCredibility] ?? 1) - (rank[b.feedCredibility] ?? 1) || (a.kind === 'trend') - (b.kind === 'trend'));
    c.members.forEach((m, i) => { m.clusterId = id; m.isPrimary = i === 0; });
  }
  return clusters;
}

// ---------- scoring ----------
const HOOKY_RE = /ด่วน|ล่าสุด|เปิดใจ|ครั้งแรก|สถิติ|ช็อก|ดราม่า|เตือน|ประกาศ|เปิดตัว|ขึ้นราคา|ลดราคา|ฟรี|แจก|ไวรัล|แห่|เดือด|พีค/;

function parseTraffic(t) {
  if (!t) return 0;
  const m = String(t).replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*([KMพันหมื่นแสน]?)/i);
  if (!m) return 0;
  const mult = { k: 1e3, K: 1e3, m: 1e6, M: 1e6 }[m[2]] || 1;
  return Number(m[1]) * mult;
}

/**
 * Score a primary item using its cluster, trends seen this cycle and page settings.
 * Each sub-score is scaled to the configured weight; reasons explain every point.
 */
export function scoreItem(item, ctx) {
  const { clusterMembers = [item], trends = [], settings, now = Date.now() } = ctx;
  const W = settings.weights;
  const reasons = [];

  // freshness
  const t = item.publishedAt ? Date.parse(item.publishedAt) : Date.parse(item.discoveredAt);
  const ageH = Math.max(0, (now - t) / 36e5);
  const fresh = ageH <= 3 ? 1 : Math.max(0, 1 - (ageH - 3) / 69);
  reasons.push(`สดใหม่: ${item.publishedAt ? `เผยแพร่ ${ageH.toFixed(1)} ชม.ก่อน` : 'ไม่มีวันที่เผยแพร่ ใช้เวลาที่ค้นพบแทน'}`);

  // importance — distinct outlets covering this story
  const outlets = new Set();
  for (const m of clusterMembers) { outlets.add(m.source); (m.relatedSources || []).forEach((r) => r.source && outlets.add(r.source)); }
  const n = outlets.size;
  let imp = n >= 5 ? 1 : n >= 3 ? 0.8 : n === 2 ? 0.6 : 0.3;
  if (item.category === 'ภัยพิบัติ/อากาศ' || item.category === 'สุขภาพ') { imp = Math.min(1, imp + 0.2); reasons.push('สำคัญ: ส่งผลต่อความปลอดภัย/สุขภาพของผู้ชม'); }
  reasons.push(`สำคัญ: รายงานโดย ${n} แหล่ง`);

  // interest — overlap with Google Trends this cycle + hook words
  let interest = 0.3;
  const match = trends.find((tr) => tr !== item && (similarity(tr.title, item.title) > 0.12 || norm(item.title).includes(norm(tr.title))));
  if (item.kind === 'trend') {
    const tv = parseTraffic(item.trafficHint);
    interest = tv >= 100000 ? 1 : tv >= 20000 ? 0.9 : tv >= 5000 ? 0.8 : tv >= 1000 ? 0.7 : 0.6;
    reasons.push(`ความสนใจ: อยู่ใน Google Trends ไทย (ปริมาณค้นหาโดยประมาณ ${item.trafficHint || 'ไม่ระบุ'} ตามที่ Google แสดง)`);
  } else if (match) {
    interest = 0.85;
    reasons.push(`ความสนใจ: ตรงกับคำค้นมาแรง "${match.title}" (${match.trafficHint || 'ไม่ระบุปริมาณ'})`);
  } else {
    reasons.push('ความสนใจ: ไม่พบใน Google Trends รอบนี้');
  }
  if (HOOKY_RE.test(item.title)) { interest = Math.min(1, interest + 0.15); reasons.push('ความสนใจ: หัวข้อมีคำดึงความสนใจ'); }

  // fit
  const text = `${item.title} ${item.summary || ''}`;
  let fit = settings.pageCategories.includes(item.category) ? 1 : 0.4;
  reasons.push(fit === 1 ? `เหมาะกับเพจ: หมวด "${item.category}" เป็นหมวดหลัก` : `เหมาะกับเพจ: หมวด "${item.category}" ไม่ใช่หมวดหลัก`);
  const avoid = settings.avoidKeywords.find((k) => k && text.includes(k));
  if (avoid) { fit = 0; reasons.push(`เหมาะกับเพจ: มีคำที่เพจหลีกเลี่ยง "${avoid}"`); }

  // safety (15 = no risk)
  let penalty = 0;
  const riskFlags = [];
  for (const [re, p, why] of RISK_RULES) if (re.test(text)) { penalty += p; riskFlags.push(why); }
  if (item.verification === 'unverified') { penalty += 3; riskFlags.push('ยังไม่ยืนยันจากหลายแหล่ง'); }
  if (item.verification === 'opinion') { penalty += 2; riskFlags.push('เป็นความคิดเห็น ไม่ใช่ข้อเท็จจริง'); }
  if (RUMOR_RE.test(item.title)) { penalty += 3; riskFlags.push('มีลักษณะข่าวลือ'); }
  const safety = Math.max(0, 1 - penalty / 15);
  reasons.push(riskFlags.length ? `ความเสี่ยง: ${riskFlags.join('; ')}` : 'ความเสี่ยง: ไม่พบสัญญาณเสี่ยงตามกฎ');

  const s = {
    freshness: Math.round(fresh * W.freshness),
    importance: Math.round(imp * W.importance),
    interest: Math.round(interest * W.interest),
    fit: Math.round(fit * W.fit),
    safety: Math.round(safety * W.safety),
  };
  const max = W.freshness + W.importance + W.interest + W.fit + W.safety;
  const total = Math.round(((s.freshness + s.importance + s.interest + s.fit + s.safety) / max) * 100);
  return { ...s, total, method: 'rules', reasons, riskFlags, outlets: n, scoredAt: new Date(now).toISOString() };
}

/** Top-N primary items, then pick 5 with category diversity. */
export function rankTop(items, n = 10) {
  return items
    .filter((i) => i.isPrimary && i.status !== 'rejected' && i.score)
    .sort((a, b) => b.score.total - a.score.total)
    .slice(0, n);
}
export function suggestFive(top) {
  const picked = [], seenCat = new Map();
  for (const it of top) {
    if (it.verification === 'opinion') continue;
    if ((seenCat.get(it.category) || 0) >= 2) continue;
    picked.push(it); seenCat.set(it.category, (seenCat.get(it.category) || 0) + 1);
    if (picked.length === 5) break;
  }
  for (const it of top) if (picked.length < 5 && !picked.includes(it)) picked.push(it);
  return picked;
}

// ---------- fact-check rules ----------
const NUM_RE = /\d[\d,.]*\s*(?:%|เปอร์เซ็นต์|บาท|ล้าน|พันล้าน|หมื่น|แสน|คน|ราย|ชั่วโมง|ชม\.|นาที|กม\.|มม\.|องศา)?/g;

export function ruleFactCheck(content, item, cluster) {
  const checks = [];
  const add = (level, label, detail) => checks.push({ level, label, detail });
  const sources = [item, ...cluster.filter((c) => c.id !== item.id)];
  const corpus = sources.map((s) => `${s.title} ${s.summary || ''} ${(s.relatedSources || []).map((r) => r.title).join(' ')}`).join(' ');

  if (item.isMock) add('fail', 'ข้อมูลจำลอง', 'ประเด็นนี้เป็นข้อมูลตัวอย่าง ห้ามนำไปเผยแพร่');
  add(item.url ? 'pass' : 'fail', 'มีลิงก์ต้นทาง', item.url || 'ไม่มีลิงก์ต้นทาง');
  add(item.publishedAt ? 'pass' : 'warn', 'มีวันเวลาเผยแพร่', item.publishedAt ? new Date(item.publishedAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) : 'ฟีดไม่ระบุวันที่ — ต้องตรวจจากหน้าข่าว');
  const ageH = item.publishedAt ? (Date.now() - Date.parse(item.publishedAt)) / 36e5 : null;
  if (ageH != null) add(ageH > 48 ? 'warn' : 'pass', 'ความสดของข้อมูล', `เผยแพร่ ${ageH.toFixed(1)} ชม.ก่อน${ageH > 48 ? ' — อาจมีความคืบหน้าใหม่ ควรตรวจซ้ำ' : ''}`);
  add(item.eventAt ? 'pass' : 'warn', 'ระบุเวลาเกิดเหตุการณ์', item.eventAt ? new Date(item.eventAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) : 'ยังไม่ทราบเวลาเกิดเหตุ (ไม่เท่ากับเวลาเผยแพร่) — ห้ามระบุในคลิปว่า "วันนี้" ถ้าไม่แน่ใจ');
  const outlets = item.score?.outlets ?? 1;
  add(outlets >= 2 ? 'pass' : 'warn', 'ยืนยันจากหลายแหล่ง', `${outlets} แหล่ง${outlets < 2 ? ' — ควรหาแหล่งที่สองหรือแหล่งทางการ' : ''}`);
  add(item.verification === 'opinion' ? 'warn' : 'pass', 'ประเภทเนื้อหา', item.verification === 'opinion' ? 'เป็นความคิดเห็น — ต้องบอกผู้ชมว่าเป็นมุมมองของผู้เขียน' : 'ข่าว/ข้อเท็จจริง');
  for (const f of item.score?.riskFlags || []) add('warn', 'ความเสี่ยงด้านเนื้อหา', f);

  if (content.script) {
    const scriptText = [content.script.hook, ...(content.script.scenes || []).map((s) => `${s.narration} ${s.onScreenText}`), content.script.caption].join(' ').replace(/https?:\/\/\S+/g, ' ');
    const nums = [...new Set((scriptText.match(NUM_RE) || []).map((x) => x.trim()).filter((x) => /\d/.test(x) && x.length > 1))];
    const corpusDigits = corpus.replace(/,/g, '');
    const missing = nums.filter((x) => !corpusDigits.includes(x.replace(/,/g, '').match(/[\d.]+/)[0]));
    add(missing.length ? 'fail' : 'pass', 'ตัวเลขในสคริปต์มีในแหล่งข่าว', missing.length ? `ไม่พบในข้อมูลต้นทาง: ${missing.join(', ')}` : nums.length ? `ตรวจ ${nums.length} ตัวเลข พบทั้งหมด` : 'ไม่มีตัวเลขในสคริปต์');
    if (/วันนี้|เมื่อสักครู่|ล่าสุดเมื่อ/.test(scriptText) && !item.eventAt) add('warn', 'คำบอกเวลา', 'สคริปต์ใช้คำว่า "วันนี้/เมื่อสักครู่" แต่ยังไม่ทราบเวลาเกิดเหตุ');
    const placeholders = [...new Set((scriptText.match(/\[(?:แก้ไขก่อนใช้|เติมรายละเอียด[^\]]*|ต้องตรวจสอบ)\]/g) || []))];
    add(placeholders.length ? 'fail' : 'pass', 'สคริปต์เขียนครบแล้ว', placeholders.length ? `ยังมีช่องที่ต้องเขียนเอง: ${placeholders.join(', ')} — แก้ในสตูดิโอสคริปต์ก่อนอนุมัติ` : 'ไม่มีช่องว่างจากแม่แบบ');
    add(content.script.copyrightNotes ? 'pass' : 'warn', 'ลิขสิทธิ์ภาพ/เสียง', content.script.copyrightNotes || 'ยังไม่มีหมายเหตุลิขสิทธิ์');
  } else {
    add('warn', 'สคริปต์', 'ยังไม่มีสคริปต์ให้ตรวจ');
  }
  const status = checks.some((c) => c.level === 'fail') ? 'fail' : checks.some((c) => c.level === 'warn') ? 'warn' : 'pass';
  return { status, checks };
}

// ---------- template script (no AI) ----------
export const PLATFORM_LABEL = { facebook: 'Facebook', reels: 'Reels', tiktok: 'TikTok', shorts: 'YouTube Shorts' };

export function templateScript(item, cluster, { durationSec = 60, platforms = [] } = {}) {
  const others = cluster.filter((c) => c.id !== item.id).map((c) => c.source);
  const srcNames = [...new Set([item.source, ...others])].slice(0, 3).join(', ');
  const summary = item.summary || '';
  const hashtags = ['#ข่าว', `#${item.category.replace(/[\/\s]/g, '')}`, ...(platforms.includes('tiktok') ? ['#ข่าวTikTok'] : []), ...(platforms.includes('shorts') ? ['#Shorts'] : [])];
  return {
    generatedBy: 'template',
    durationSec,
    hook: `[แก้ไขก่อนใช้] ${item.title.slice(0, 60)}${item.title.length > 60 ? '…' : ''} — เกิดอะไรขึ้น?`,
    scenes: [
      { t: '0–3 วิ', visual: 'ข้อความหัวข่าวตัวใหญ่ + ภาพที่มีสิทธิ์ใช้', narration: `${item.title}`, onScreenText: item.title.slice(0, 40) },
      { t: `3–${Math.round(durationSec * 0.6)} วิ`, visual: 'ภาพประกอบ/อินโฟกราฟิกที่ทำเอง', narration: summary ? `${summary.slice(0, 220)}` : '[เติมรายละเอียดจากลิงก์ต้นทาง — ห้ามเดา]', onScreenText: 'สรุปสั้น ๆ' },
      { t: `${Math.round(durationSec * 0.6)}–${durationSec - 5} วิ`, visual: 'ภาพหน้าจอหัวข่าวพร้อมเครดิตแหล่ง', narration: `ข้อมูลจาก ${srcNames}${item.verification !== 'confirmed' ? ' ซึ่งยังอยู่ระหว่างการตรวจสอบเพิ่มเติม' : ''}`, onScreenText: `ที่มา: ${srcNames}` },
      { t: `${durationSec - 5}–${durationSec} วิ`, visual: 'โลโก้เพจ + ปุ่มติดตาม', narration: 'คุณคิดเห็นอย่างไร คอมเมนต์บอกกันได้ และกดติดตามเพื่อไม่พลาดข่าว', onScreenText: 'ติดตามเพจ' },
    ],
    caption: `${item.title}\n\nที่มา: ${srcNames}${item.url ? `\n${item.url}` : ''}`,
    hashtags,
    assets: ['ภาพที่ถ่าย/ทำเอง หรือ stock ที่มีไลเซนส์', 'ภาพหน้าจอหัวข่าว (ใช้แบบอ้างอิง ใส่เครดิต ไม่ตัดภาพข่าวทั้งชิ้น)', 'อินโฟกราฟิกตัวเลขที่มีในแหล่งข่าวเท่านั้น'],
    editingNotes: 'ตัดเร็วทุก 2–3 วินาที, ซับไตเติลภาษาไทยตลอดคลิป, สัดส่วน 9:16, เว้นขอบล่าง 15% สำหรับ UI ของแพลตฟอร์ม',
    copyrightNotes: 'ห้ามใช้คลิป/ภาพจากสำนักข่าวหรือโซเชียลของผู้อื่นโดยไม่ได้รับอนุญาต; ใช้เพลงจากคลังที่มีสิทธิ์ของแต่ละแพลตฟอร์ม',
  };
}

// ---------- performance ----------
export function perfStats(posts) {
  const sorted = [...posts].sort((a, b) => Date.parse(a.postedAt) - Date.parse(b.postedAt));
  const metric = ['views', 'avgWatchPct', 'shares', 'comments', 'likes'];
  const rows = sorted.map((p, i) => {
    const prev = sorted.slice(Math.max(0, i - 5), i).filter((x) => x.platform === p.platform);
    const cmp = {};
    for (const k of metric) {
      const vals = prev.map((x) => x[k]).filter((v) => typeof v === 'number');
      if (!vals.length || typeof p[k] !== 'number') { cmp[k] = null; continue; }
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      cmp[k] = avg ? Math.round(((p[k] - avg) / avg) * 100) : null;
    }
    const engagement = p.views ? +(((p.shares || 0) + (p.comments || 0) + (p.likes || 0)) / p.views * 100).toFixed(2) : null;
    return { ...p, engagementPct: engagement, vsPrevAvgPct: cmp, prevCount: prev.length };
  });
  const byPlatform = {};
  for (const r of rows) {
    const b = (byPlatform[r.platform] ||= { posts: 0, views: 0, shares: 0, comments: 0, watch: [] });
    b.posts++; b.views += r.views || 0; b.shares += r.shares || 0; b.comments += r.comments || 0;
    if (typeof r.avgWatchPct === 'number') b.watch.push(r.avgWatchPct);
  }
  for (const b of Object.values(byPlatform)) { b.avgWatchPct = b.watch.length ? +(b.watch.reduce((a, c) => a + c, 0) / b.watch.length).toFixed(1) : null; delete b.watch; }
  return { rows: rows.reverse(), byPlatform };
}
