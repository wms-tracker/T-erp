/**
 * LAN server mode: run on one office computer, everyone on the same Wi-Fi opens http://<this-ip>:5199
 *  - serves the built web app (dist/)
 *  - stores data in data/db.json (+ one backup per day in data/backups/)
 *  - every write goes through the same rule engine as Demo mode (src/lib/engine.ts)
 *  - pushes "changed" to all open browsers via Server-Sent Events, so screens update live
 * Node handles requests one at a time on a single thread and each write is read-modify-write
 * done synchronously, so two people saving at once cannot create duplicates.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, createReadStream, statSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as E from '../src/lib/engine';
import { AppError } from '../src/lib/errors';
import { createSeedSnapshot } from '../src/lib/seed';
import type { Snapshot } from '../src/lib/types';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const DATA_DIR = process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : join(ROOT, 'data');
const DB = join(DATA_DIR, 'db.json');
const PORT = Number(process.env.PORT || 5199);

// ---------------------------------------------------------------- storage
mkdirSync(join(DATA_DIR, 'backups'), { recursive: true });
let db: Snapshot = existsSync(DB) ? (JSON.parse(readFileSync(DB, 'utf8')) as Snapshot) : createSeedSnapshot();
if (!existsSync(DB)) save();

function save() {
  db.logs = db.logs.slice(0, 5000);
  const tmp = DB + '.tmp';
  writeFileSync(tmp, JSON.stringify(db));
  renameSync(tmp, DB); // atomic replace: a crash never leaves a half-written file
  const backup = join(DATA_DIR, 'backups', `db-${new Date().toISOString().slice(0, 10)}.json`);
  if (!existsSync(backup)) copyFileSync(DB, backup);
}

// ---------------------------------------------------------------- operations (whitelist)
type Args = Record<string, unknown>;
const str = (v: unknown) => String(v ?? '');
const ops: Record<string, (s: Snapshot, c: { actor: string }, a: Args) => unknown> = {
  registerMembers: (s, c, a) => E.registerMembers(s, c, str(a.sportId), (a.memberIds as string[]) ?? [], !!a.allowOver),
  cancelRegistration: (s, c, a) => E.cancelRegistration(s, c, str(a.memberId), str(a.sportId)),
  moveRegistration: (s, c, a) => E.moveRegistration(s, c, str(a.memberId), str(a.fromSportId), str(a.toSportId), !!a.allowOver),
  addMember: (s, c, a) => E.addMember(s, c, str(a.fullName)),
  updateMember: (s, c, a) => E.updateMember(s, c, str(a.id), str(a.fullName)),
  setMemberActive: (s, c, a) => E.setMemberActive(s, c, str(a.id), !!a.active),
  deleteMember: (s, c, a) => E.deleteMember(s, c, str(a.id)),
  addSport: (s, c, a) => E.addSport(s, c, str(a.name), Number(a.target)),
  updateSport: (s, c, a) => E.updateSport(s, c, str(a.id), str(a.name), Number(a.target)),
  setSportActive: (s, c, a) => E.setSportActive(s, c, str(a.id), !!a.active),
  resetRegistrations: (s, c) => E.resetRegistrations(s, c),
};

// ---------------------------------------------------------------- live updates (SSE)
const clients = new Set<ServerResponse>();
function broadcast() {
  for (const res of clients) res.write('data: changed\n\n');
}
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 25_000);

// ---------------------------------------------------------------- http
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<Args> {
  return new Promise((ok, fail) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 1_000_000) req.destroy();
    });
    req.on('end', () => {
      try { ok(raw ? JSON.parse(raw) : {}); } catch { fail(new AppError('INVALID_INPUT')); }
    });
    req.on('error', fail);
  });
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/api/health') return json(res, 200, { ok: true, mode: 'server', urls: lanIps().map((ip) => `http://${ip}:${PORT}`) });
  if (url.pathname === '/api/snapshot' && req.method === 'GET') return json(res, 200, db);
  if (url.pathname === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write('retry: 3000\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  if (url.pathname.startsWith('/api/op/') && req.method === 'POST') {
    const op = ops[url.pathname.slice('/api/op/'.length)];
    if (!op) return json(res, 404, { code: 'UNKNOWN', message: 'unknown operation' });
    try {
      const body = await readBody(req);
      // work on a copy: if the rule engine throws, nothing is saved
      const draft = structuredClone(db);
      const result = op(draft, { actor: str(body.actor).slice(0, 60) || 'ไม่ระบุชื่อ' }, (body.args as Args) ?? {});
      db = draft;
      save();
      broadcast();
      return json(res, 200, { result: result ?? null });
    } catch (e) {
      const err = e instanceof AppError ? e : new AppError('UNKNOWN', String((e as Error)?.message ?? e));
      return json(res, 400, { code: err.code, message: err.message });
    }
  }

  // static files + SPA fallback
  if (!existsSync(DIST)) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('ยังไม่ได้ build เว็บ — รัน npm run build ก่อน');
  }
  let file = normalize(join(DIST, decodeURIComponent(url.pathname)));
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  res.writeHead(200, {
    'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': file.includes(`${join(DIST, 'assets')}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(file).pipe(res);
}

/** Addresses other devices can use. Virtual adapters (WSL, Docker, Hyper-V, VPN) are skipped when a real one exists. */
function lanIps() {
  const all = Object.entries(networkInterfaces()).flatMap(([name, list]) =>
    (list ?? []).filter((n) => n.family === 'IPv4' && !n.internal).map((n) => ({ name, ip: n.address })),
  );
  const virtual = /vEthernet|WSL|Docker|Hyper-V|VirtualBox|VMware|Tailscale|ZeroTier|Loopback|vpn/i;
  const cgnat = (ip: string) => /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip);
  const real = all.filter((a) => !virtual.test(a.name) && !cgnat(a.ip));
  return (real.length ? real : all).map((a) => a.ip);
}

createServer((req, res) => {
  handle(req, res).catch((e) => json(res, 500, { code: 'UNKNOWN', message: String(e) }));
}).listen(PORT, '0.0.0.0', () => {
  const ips = lanIps();
  console.log('\n  กีฬาสีเหลือง 2569 — เซิร์ฟเวอร์พร้อมใช้งาน\n');
  console.log(`  เครื่องนี้:        http://localhost:${PORT}`);
  for (const ip of ips) console.log(`  เครื่องอื่นใน Wi-Fi: http://${ip}:${PORT}`);
  console.log(`\n  ไฟล์ข้อมูล: ${DB}\n  (ปิดหน้าต่างนี้ = ปิดระบบ)\n`);
});
