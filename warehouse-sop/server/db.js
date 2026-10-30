'use strict';
/* ฐานข้อมูล SQLite (ใช้ node:sqlite ที่มากับ Node 22+ — ไม่ต้องติดตั้งอะไรเพิ่ม) */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.resolve(process.env.SOP_DATA_DIR || path.join(__dirname, '..', 'data'));
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'sop.db'));
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS departments(
  id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL COLLATE NOCASE, name TEXT NOT NULL,
  description TEXT DEFAULT '', active INTEGER DEFAULT 1, sort INTEGER DEFAULT 0, created_at TEXT);
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL COLLATE NOCASE, display_name TEXT NOT NULL,
  position TEXT DEFAULT '', email TEXT DEFAULT '', role TEXT NOT NULL,
  department_id INTEGER REFERENCES departments(id), password_hash TEXT NOT NULL,
  must_change_pw INTEGER DEFAULT 1, active INTEGER DEFAULT 1, created_at TEXT, last_login TEXT);
CREATE TABLE IF NOT EXISTS sessions(
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sops(
  id INTEGER PRIMARY KEY, sop_number TEXT UNIQUE NOT NULL COLLATE NOCASE,
  department_id INTEGER NOT NULL REFERENCES departments(id),
  current_version_id INTEGER, working_version_id INTEGER, next_review_date TEXT,
  is_obsolete INTEGER DEFAULT 0, created_by INTEGER, created_at TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS sop_versions(
  id INTEGER PRIMARY KEY, sop_id INTEGER NOT NULL REFERENCES sops(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL, status TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL,
  prepared_by INTEGER, owner_id INTEGER, reviewer_id INTEGER, approver_id INTEGER,
  effective_date TEXT, review_date TEXT, change_summary TEXT DEFAULT '', editors TEXT DEFAULT '[]',
  row_ver INTEGER DEFAULT 1, locked INTEGER DEFAULT 0,
  created_at TEXT, updated_at TEXT, updated_by INTEGER, submitted_at TEXT,
  reviewed_by INTEGER, reviewed_at TEXT, approved_by INTEGER, approved_at TEXT,
  published_at TEXT, superseded_at TEXT, UNIQUE(sop_id, revision));
CREATE TABLE IF NOT EXISTS files(
  id INTEGER PRIMARY KEY, name TEXT, mime TEXT, size INTEGER, stored TEXT, sha256 TEXT,
  uploaded_by INTEGER, created_at TEXT);
CREATE TABLE IF NOT EXISTS workflow_log(
  id INTEGER PRIMARY KEY, sop_id INTEGER, version_id INTEGER, action TEXT, from_status TEXT,
  to_status TEXT, comment TEXT, user_id INTEGER, at TEXT);
CREATE TABLE IF NOT EXISTS audit_log(
  id INTEGER PRIMARY KEY, entity TEXT, entity_id INTEGER, action TEXT, detail TEXT, user_id INTEGER, at TEXT);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
CREATE INDEX IF NOT EXISTS idx_ver_sop ON sop_versions(sop_id);
CREATE INDEX IF NOT EXISTS idx_log_sop ON workflow_log(sop_id);
CREATE INDEX IF NOT EXISTS idx_log_at ON workflow_log(at);
`);

/* ---------- helpers ---------- */
const stCache = new Map();
function st(sql) { let s = stCache.get(sql); if (!s) { s = db.prepare(sql); stCache.set(sql, s); } return s; }
const norm = p => p.map(x => x === undefined ? null : typeof x === 'boolean' ? (x ? 1 : 0) : x);
const all = (sql, ...p) => st(sql).all(...norm(p));
const get = (sql, ...p) => st(sql).get(...norm(p));
const run = (sql, ...p) => { const r = st(sql).run(...norm(p)); return { changes: r.changes, id: Number(r.lastInsertRowid) }; };

let txDepth = 0;
function tx(fn) {
  if (txDepth > 0) return fn();
  db.exec('BEGIN IMMEDIATE'); txDepth++;
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
  finally { txDepth--; }
}

const now = () => new Date().toISOString();
const today = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD ตามเวลาเครื่อง server

function getSetting(k, def = '') { const r = get('SELECT value FROM settings WHERE key=?', k); return r ? r.value : def; }
function setSetting(k, v) { run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', k, String(v ?? '')); }

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  return salt + ':' + h;
}
function verifyPassword(pw, stored) {
  const [salt, h] = String(stored || '').split(':');
  if (!salt || !h) return false;
  const calc = crypto.scryptSync(String(pw), salt, 64);
  const want = Buffer.from(h, 'hex');
  return want.length === calc.length && crypto.timingSafeEqual(calc, want);
}

/* ---------- ข้อมูลตั้งต้น (ครั้งแรกที่รันเท่านั้น) ---------- */
const SEED_PASSWORD = 'Sop@1234';
function seed() {
  if (get('SELECT COUNT(*) n FROM departments').n > 0) return null;
  const t = now();
  tx(() => {
    [
      ['OB', 'Outbound', 'งานจ่ายสินค้าออก / Picking / Packing / Loading'],
      ['IB', 'Inbound', 'งานรับสินค้าเข้า / ตรวจรับ / Put-away'],
      ['INV', 'Inventory', 'ควบคุมสินค้าคงคลัง / Cycle Count / Stock Adjustment'],
      ['LOG', 'Logistics / 3PL', 'บริหารงานขนส่งและผู้ให้บริการภายนอก'],
      ['TRN', 'Transportation', 'บริหารรถขนส่งและการจัดส่ง'],
    ].forEach(([code, name, desc], i) =>
      run('INSERT INTO departments(code,name,description,active,sort,created_at) VALUES(?,?,?,1,?,?)', code, name, desc, i + 1, t));
    const dep = code => get('SELECT id FROM departments WHERE code=?', code).id;
    const hp = hashPassword(SEED_PASSWORD);
    [
      ['admin', 'ผู้ดูแลระบบ', 'System Administrator', 'admin', null],
      ['manager', 'ผู้จัดการคลังสินค้า', 'Warehouse Operations Manager', 'manager', null],
      ['ob.head', 'หัวหน้าแผนก Outbound', 'Outbound Supervisor', 'dept_head', dep('OB')],
      ['ob.staff', 'พนักงานจัดทำ SOP (OB)', 'Outbound Officer', 'author', dep('OB')],
      ['ib.head', 'หัวหน้าแผนก Inbound', 'Inbound Supervisor', 'dept_head', dep('IB')],
      ['viewer', 'ผู้อ่านเอกสาร', 'Warehouse Staff', 'viewer', dep('OB')],
    ].forEach(([u, n, p, r, d]) =>
      run('INSERT INTO users(username,display_name,position,role,department_id,password_hash,must_change_pw,active,created_at) VALUES(?,?,?,?,?,?,1,1,?)', u, n, p, r, d, hp, t));
    setSetting('company_name', 'บริษัท ตัวอย่าง จำกัด');
    setSetting('company_name_en', 'Example Co., Ltd.');
    setSetting('logo_file_id', '');
    setSetting('review_warn_days', '30');
    setSetting('default_review_months', '12');
    setSetting('doc_font', 'Tahoma');
  });
  return SEED_PASSWORD;
}

module.exports = { db, all, get, run, tx, now, today, getSetting, setSetting, hashPassword, verifyPassword, seed, DATA_DIR, UPLOAD_DIR };
