// Database layer: one JSON file, atomic writes. Swap this module for SQLite/Postgres later.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

export const DEFAULT_SETTINGS = {
  pageName: 'เพจข่าวของฉัน',
  pageCategories: ['สังคม', 'เศรษฐกิจ', 'เทคโนโลยี', 'ภัยพิบัติ/อากาศ'],
  avoidKeywords: [],
  maxItemAgeHours: 72,
  aiAnalyzeTopN: 15,
  meetingDailyAt: '', // "HH:MM" Bangkok time; empty = no daily meeting
  weights: { freshness: 25, importance: 20, interest: 25, fit: 15, safety: 15 },
  feeds: [
    { id: 'gnews-th', name: 'Google News (ไทย) – ข่าวเด่น', url: 'https://news.google.com/rss?hl=th&gl=TH&ceid=TH:th', type: 'news', credibility: 'medium', enabled: true },
    { id: 'gtrends-th', name: 'Google Trends – กำลังมาแรงในไทย', url: 'https://trends.google.com/trending/rss?geo=TH', type: 'trends', credibility: 'medium', enabled: true },
    { id: 'bbc-thai', name: 'BBC News ไทย', url: 'https://feeds.bbci.co.uk/thai/rss.xml', type: 'news', credibility: 'high', enabled: true },
    { id: 'thairath', name: 'ไทยรัฐออนไลน์', url: 'https://www.thairath.co.th/rss/news', type: 'news', credibility: 'medium', enabled: true },
    { id: 'matichon', name: 'มติชนออนไลน์', url: 'https://www.matichon.co.th/feed', type: 'news', credibility: 'medium', enabled: true },
    { id: 'khaosod', name: 'ข่าวสด', url: 'https://www.khaosod.co.th/feed', type: 'news', credibility: 'medium', enabled: true },
    { id: 'prachatai', name: 'ประชาไท', url: 'https://prachatai.com/rss.xml', type: 'news', credibility: 'medium', enabled: false },
  ],
};

function empty() {
  return { settings: structuredClone(DEFAULT_SETTINGS), items: [], contents: [], posts: [], runs: [], meetings: [], audit: [] };
}

let db = null;

export function load() {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    db = { ...empty(), ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) };
    db.settings = { ...structuredClone(DEFAULT_SETTINGS), ...db.settings };
  } else {
    db = empty();
  }
  return db;
}

let saveTimer = null;
export function save() {
  // Coalesce bursts of writes; write to temp then rename so a crash never leaves a half file.
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 50);
}
export function flush() {
  if (!db) return;
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
  fs.renameSync(tmp, DB_FILE);
}

export const newId = (p) => `${p}_${crypto.randomBytes(6).toString('hex')}`;
export const now = () => new Date().toISOString();

export function audit(action, entity, entityId, detail = '') {
  load().audit.unshift({ id: newId('a'), at: now(), action, entity, entityId, detail: String(detail).slice(0, 500) });
  if (db.audit.length > 5000) db.audit.length = 5000;
  save();
}
