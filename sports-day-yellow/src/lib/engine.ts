/**
 * Pure business rules used by Demo mode. Every function mutates the given snapshot `s`
 * (callers pass a fresh copy) and throws AppError on rule violations — nothing is written
 * unless the whole operation succeeds, which mirrors the SQL functions in supabase/schema.sql.
 */
import { AppError } from './errors';
import { memberCode } from './seed';
import type { AuditAction, Registration, RegisterResult, Snapshot } from './types';

export type IdGen = () => string;
const defaultId: IdGen = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

interface Ctx {
  actor: string;
  now?: string;
  id?: IdGen;
}

const norm = (t: string) => t.trim().replace(/\s+/g, ' ');

function log(s: Snapshot, c: Ctx, action: AuditAction, detail: string, member_id: string | null = null, sport_id: string | null = null) {
  s.logs.unshift({
    id: (c.id ?? defaultId)(),
    action,
    member_id,
    sport_id,
    detail,
    actor: c.actor || 'ไม่ระบุ',
    created_at: c.now ?? new Date().toISOString(),
  });
}

function activeSport(s: Snapshot, sportId: string) {
  const sport = s.sports.find((x) => x.id === sportId);
  if (!sport) throw new AppError('SPORT_NOT_FOUND');
  if (!sport.is_active) throw new AppError('SPORT_INACTIVE');
  return sport;
}

function findMember(s: Snapshot, memberId: string) {
  const m = s.members.find((x) => x.id === memberId);
  if (!m) throw new AppError('MEMBER_NOT_FOUND');
  return m;
}

const isActiveMember = (s: Snapshot, memberId: string) => s.members.some((m) => m.id === memberId && m.is_active);

/** Active registrations in a sport, counting only active members. */
export function countRegistered(s: Snapshot, sportId: string) {
  return s.registrations.filter(
    (r) => r.sport_id === sportId && r.registration_status === 'registered' && isActiveMember(s, r.member_id),
  ).length;
}

/** Upserts one (member, sport) row — the unique key. Returns the action taken or null if already registered. */
function upsertRegistration(s: Snapshot, c: Ctx, memberId: string, sportId: string): 'REGISTER' | 'RE_REGISTER' | null {
  const now = c.now ?? new Date().toISOString();
  const existing = s.registrations.find((r) => r.member_id === memberId && r.sport_id === sportId);
  if (existing?.registration_status === 'registered') return null;
  if (existing) {
    existing.registration_status = 'registered';
    existing.registered_at = now;
    existing.updated_at = now;
    existing.created_by = c.actor;
    return 'RE_REGISTER';
  }
  const reg: Registration = {
    id: (c.id ?? defaultId)(),
    member_id: memberId,
    sport_id: sportId,
    registration_status: 'registered',
    registered_at: now,
    updated_at: now,
    created_by: c.actor,
  };
  s.registrations.push(reg);
  return 'REGISTER';
}

export function registerMembers(s: Snapshot, c: Ctx, sportId: string, memberIds: string[], allowOver: boolean): RegisterResult {
  const sport = activeSport(s, sportId);
  const ids = [...new Set(memberIds)];
  if (ids.length === 0) throw new AppError('INVALID_INPUT', 'กรุณาเลือกสมาชิกอย่างน้อย 1 คน');
  const toAdd = ids.filter(
    (id) =>
      isActiveMember(s, id) &&
      !s.registrations.some((r) => r.member_id === id && r.sport_id === sportId && r.registration_status === 'registered'),
  );
  if (!allowOver && countRegistered(s, sportId) + toAdd.length > sport.target_count) throw new AppError('OVER_TARGET');
  for (const id of toAdd) {
    const action = upsertRegistration(s, c, id, sportId);
    if (action) log(s, c, action, `${findMember(s, id).full_name} → ${sport.sport_name}`, id, sportId);
  }
  return { added: toAdd.length, skipped: ids.length - toAdd.length };
}

export function cancelRegistration(s: Snapshot, c: Ctx, memberId: string, sportId: string) {
  const reg = s.registrations.find(
    (r) => r.member_id === memberId && r.sport_id === sportId && r.registration_status === 'registered',
  );
  if (!reg) throw new AppError('NOT_REGISTERED');
  reg.registration_status = 'cancelled';
  reg.updated_at = c.now ?? new Date().toISOString();
  const sport = s.sports.find((x) => x.id === sportId);
  log(s, c, 'CANCEL', `${findMember(s, memberId).full_name} ยกเลิก ${sport?.sport_name ?? ''}`, memberId, sportId);
}

export function moveRegistration(s: Snapshot, c: Ctx, memberId: string, fromId: string, toId: string, allowOver: boolean) {
  if (fromId === toId) throw new AppError('SAME_SPORT');
  const member = findMember(s, memberId);
  if (!member.is_active) throw new AppError('MEMBER_INACTIVE');
  const from = s.sports.find((x) => x.id === fromId);
  const to = activeSport(s, toId);
  const reg = s.registrations.find((r) => r.member_id === memberId && r.sport_id === fromId && r.registration_status === 'registered');
  if (!reg) throw new AppError('NOT_REGISTERED');
  if (s.registrations.some((r) => r.member_id === memberId && r.sport_id === toId && r.registration_status === 'registered'))
    throw new AppError('ALREADY_REGISTERED');
  if (!allowOver && countRegistered(s, toId) + 1 > to.target_count) throw new AppError('OVER_TARGET');
  reg.registration_status = 'cancelled';
  reg.updated_at = c.now ?? new Date().toISOString();
  upsertRegistration(s, c, memberId, toId);
  log(s, c, 'MOVE', `${member.full_name}: ${from?.sport_name ?? '?'} → ${to.sport_name}`, memberId, toId);
}

export function addMember(s: Snapshot, c: Ctx, fullName: string) {
  const name = norm(fullName);
  if (name.length < 3) throw new AppError('INVALID_INPUT', 'กรุณากรอกชื่อ-นามสกุลให้ครบถ้วน');
  if (s.members.some((m) => norm(m.full_name) === name)) throw new AppError('DUPLICATE_NAME');
  const max = s.members.reduce((n, m) => Math.max(n, /^Y\d+$/.test(m.member_code) ? parseInt(m.member_code.slice(1), 10) : 0), 0);
  const now = c.now ?? new Date().toISOString();
  const id = (c.id ?? defaultId)();
  s.members.push({ id, member_code: memberCode(max + 1), full_name: name, is_active: true, created_at: now, updated_at: now });
  log(s, c, 'MEMBER_ADD', `เพิ่มสมาชิก ${memberCode(max + 1)} ${name}`, id);
}

export function updateMember(s: Snapshot, c: Ctx, id: string, fullName: string) {
  const m = findMember(s, id);
  const name = norm(fullName);
  if (name.length < 3) throw new AppError('INVALID_INPUT', 'กรุณากรอกชื่อ-นามสกุลให้ครบถ้วน');
  if (s.members.some((x) => x.id !== id && norm(x.full_name) === name)) throw new AppError('DUPLICATE_NAME');
  if (m.full_name === name) return;
  log(s, c, 'MEMBER_UPDATE', `${m.member_code}: ${m.full_name} → ${name}`, id);
  m.full_name = name;
  m.updated_at = c.now ?? new Date().toISOString();
}

/** Deactivating a member also cancels their active registrations (history is kept). */
export function setMemberActive(s: Snapshot, c: Ctx, id: string, active: boolean) {
  const m = findMember(s, id);
  if (m.is_active === active) return;
  const now = c.now ?? new Date().toISOString();
  m.is_active = active;
  m.updated_at = now;
  let cancelled = 0;
  if (!active) {
    for (const r of s.registrations) {
      if (r.member_id === id && r.registration_status === 'registered') {
        r.registration_status = 'cancelled';
        r.updated_at = now;
        cancelled++;
      }
    }
  }
  log(s, c, 'MEMBER_ACTIVE', `${active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'} ${m.full_name}${cancelled ? ` (ยกเลิกการสมัคร ${cancelled} รายการ)` : ''}`, id);
}

function validSport(name: string, target: number) {
  if (norm(name).length < 2) throw new AppError('INVALID_INPUT', 'กรุณากรอกชื่อกีฬา');
  if (!Number.isInteger(target) || target < 1 || target > 500) throw new AppError('INVALID_INPUT', 'จำนวนเป้าหมายต้องเป็นจำนวนเต็ม 1–500');
}

export function addSport(s: Snapshot, c: Ctx, name: string, target: number) {
  validSport(name, target);
  const n = norm(name);
  if (s.sports.some((x) => norm(x.sport_name) === n)) throw new AppError('DUPLICATE_NAME', 'มีกีฬาชื่อนี้อยู่แล้ว');
  const now = c.now ?? new Date().toISOString();
  const id = (c.id ?? defaultId)();
  s.sports.push({
    id,
    sport_name: n,
    target_count: target,
    sort_order: s.sports.reduce((x, sp) => Math.max(x, sp.sort_order), 0) + 1,
    is_active: true,
    created_at: now,
    updated_at: now,
  });
  log(s, c, 'SPORT_ADD', `เพิ่มกีฬา ${n} (เป้าหมาย ${target} คน)`, null, id);
}

export function updateSport(s: Snapshot, c: Ctx, id: string, name: string, target: number) {
  validSport(name, target);
  const sp = s.sports.find((x) => x.id === id);
  if (!sp) throw new AppError('SPORT_NOT_FOUND');
  const n = norm(name);
  if (s.sports.some((x) => x.id !== id && norm(x.sport_name) === n)) throw new AppError('DUPLICATE_NAME', 'มีกีฬาชื่อนี้อยู่แล้ว');
  const changes: string[] = [];
  if (sp.sport_name !== n) changes.push(`ชื่อ ${sp.sport_name} → ${n}`);
  if (sp.target_count !== target) changes.push(`เป้าหมาย ${sp.target_count} → ${target}`);
  if (!changes.length) return;
  sp.sport_name = n;
  sp.target_count = target;
  sp.updated_at = c.now ?? new Date().toISOString();
  log(s, c, 'SPORT_UPDATE', `${n}: ${changes.join(', ')}`, null, id);
}

export function setSportActive(s: Snapshot, c: Ctx, id: string, active: boolean) {
  const sp = s.sports.find((x) => x.id === id);
  if (!sp) throw new AppError('SPORT_NOT_FOUND');
  if (sp.is_active === active) return;
  sp.is_active = active;
  sp.updated_at = c.now ?? new Date().toISOString();
  log(s, c, 'SPORT_ACTIVE', `${active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}กีฬา ${sp.sport_name}`, null, id);
}

/** Cancels all active registrations (rows and history are kept). */
export function resetRegistrations(s: Snapshot, c: Ctx) {
  const now = c.now ?? new Date().toISOString();
  let n = 0;
  for (const r of s.registrations) {
    if (r.registration_status === 'registered') {
      r.registration_status = 'cancelled';
      r.updated_at = now;
      n++;
    }
  }
  log(s, c, 'RESET', `รีเซ็ตการสมัครทั้งหมด (ยกเลิก ${n} รายการ)`);
  return n;
}
