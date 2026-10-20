/** Derived, display-ready data. Everything on screen is computed from the snapshot — no fixed numbers. */
import type { AuditAction, Member, Registration, Snapshot, Sport } from './types';

export type MemberStatus = 'none' | 'one' | 'multi';
export type SportStatus = 'empty' | 'open' | 'full' | 'over';

export const MEMBER_STATUS_LABEL: Record<MemberStatus, string> = {
  none: 'ยังไม่ได้ลงแข่งขัน',
  one: 'ลงแข่งขันแล้ว',
  multi: 'ลงแข่งขันหลายประเภท',
};

export const SPORT_STATUS_LABEL: Record<SportStatus, string> = {
  empty: 'ยังไม่มีผู้สมัคร',
  open: 'กำลังรับสมัคร',
  full: 'ครบจำนวน',
  over: 'เกินจำนวนเป้าหมาย',
};

export const ACTION_LABEL: Record<AuditAction, string> = {
  REGISTER: 'สมัคร',
  RE_REGISTER: 'สมัครใหม่',
  CANCEL: 'ยกเลิก',
  MOVE: 'ย้ายกีฬา',
  MEMBER_ADD: 'เพิ่มสมาชิก',
  MEMBER_UPDATE: 'แก้ไขชื่อ',
  MEMBER_ACTIVE: 'สถานะสมาชิก',
  SPORT_ADD: 'เพิ่มกีฬา',
  SPORT_UPDATE: 'แก้ไขกีฬา',
  SPORT_ACTIVE: 'สถานะกีฬา',
  RESET: 'รีเซ็ต',
};

export interface MemberView {
  member: Member;
  sports: Sport[];
  count: number;
  status: MemberStatus;
}

export interface Athlete {
  member: Member;
  reg: Registration;
}

export interface SportView {
  sport: Sport;
  athletes: Athlete[];
  count: number;
  target: number;
  missing: number;
  over: number;
  percent: number;
  status: SportStatus;
}

export interface Summary {
  totalMembers: number;
  registeredMembers: number;
  unregisteredMembers: number;
  totalEntries: number;
  fullSports: number;
  totalSports: number;
}

export interface AppView {
  members: MemberView[];
  sports: SportView[];
  summary: Summary;
  memberById: Map<string, Member>;
  sportById: Map<string, Sport>;
}

export function sportStatus(count: number, target: number): SportStatus {
  if (count === 0) return 'empty';
  if (count < target) return 'open';
  if (count === target) return 'full';
  return 'over';
}

export function buildView(s: Snapshot): AppView {
  const activeMembers = s.members.filter((m) => m.is_active).sort((a, b) => a.member_code.localeCompare(b.member_code));
  const activeSports = s.sports.filter((x) => x.is_active).sort((a, b) => a.sort_order - b.sort_order);
  const memberById = new Map(s.members.map((m) => [m.id, m]));
  const sportById = new Map(s.sports.map((x) => [x.id, x]));
  const activeMemberIds = new Set(activeMembers.map((m) => m.id));
  const activeSportIds = new Set(activeSports.map((x) => x.id));

  const live = s.registrations.filter(
    (r) => r.registration_status === 'registered' && activeMemberIds.has(r.member_id) && activeSportIds.has(r.sport_id),
  );

  const sports: SportView[] = activeSports.map((sport) => {
    const athletes = live
      .filter((r) => r.sport_id === sport.id)
      .sort((a, b) => a.registered_at.localeCompare(b.registered_at))
      .map((reg) => ({ reg, member: memberById.get(reg.member_id)! }));
    const count = athletes.length;
    const target = sport.target_count;
    return {
      sport,
      athletes,
      count,
      target,
      missing: Math.max(0, target - count),
      over: Math.max(0, count - target),
      percent: target > 0 ? Math.min(100, Math.round((count / target) * 100)) : count > 0 ? 100 : 0,
      status: sportStatus(count, target),
    };
  });

  const members: MemberView[] = activeMembers.map((member) => {
    const mine = activeSports.filter((sp) => live.some((r) => r.member_id === member.id && r.sport_id === sp.id));
    return { member, sports: mine, count: mine.length, status: mine.length === 0 ? 'none' : mine.length === 1 ? 'one' : 'multi' };
  });

  const registeredMembers = members.filter((m) => m.count > 0).length;
  return {
    members,
    sports,
    memberById,
    sportById,
    summary: {
      totalMembers: members.length,
      registeredMembers,
      unregisteredMembers: members.length - registeredMembers,
      totalEntries: live.length,
      fullSports: sports.filter((x) => x.count >= x.target && x.target > 0).length,
      totalSports: sports.length,
    },
  };
}

/** Thai-friendly search: ignores spaces and the common title prefixes so "กันต์พงศ์" or "แก้วแกม" both match. */
export function matchesName(fullName: string, code: string, q: string) {
  const query = q.trim().replace(/\s+/g, '').toLowerCase();
  if (!query) return true;
  const hay = (fullName + code).replace(/\s+/g, '').toLowerCase();
  return hay.includes(query);
}

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
