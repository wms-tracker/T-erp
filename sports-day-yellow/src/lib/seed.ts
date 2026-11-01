import type { Member, Snapshot, Sport } from './types';

/** รายชื่อสมาชิกสีเหลืองตั้งต้น 23 คน (สะกดตามเอกสารต้นฉบับ) — ต้องตรงกับ supabase/schema.sql */
export const SEED_MEMBER_NAMES = [
  'นางสาววรารัตน์ พรหมสาขา ณ สกลนคร',
  'นางสาวเบญญาภา เกษมสุข',
  'นายกันต์พงศ์ แก้วแกมทอง',
  'นางสาวสินีนารถ ศุภระศร',
  'นายสุรชัย ตี่ด้วง',
  'นายอนวัช อยู่คล้อย',
  'นายภูรินท์ ปอนสำโรง',
  'นายอาภณัฐ เกียรติวิบูลย์กิจ',
  'นายณวัชร เหลืองปฐมชัย',
  'นายธีระวัฒน์ อินปาต๊ะ',
  'นายชูเกียรติ อินทร์จำปา',
  'นายจักริน พัดเพียเมือง',
  'นายนนทวัฒน์ พรมรัตน์',
  'นายมนัส อิ่นทา',
  'นายธนากร ศรีประมาณ',
  'นางสาวนิชาภา พวงร้อย',
  'นางสาวรัชปภา ไชยเพ็ชร',
  'นายวิรัน รวงสง่า',
  'นายวิชาติ สายบุดดี',
  'นายกัมพล ชินบุตร',
  'นายอนันต์วรพล มิ่งเมือง',
  'นายอัครพล เทียมดง',
  'นายชนะกิจ สมสนิท',
] as const;

export const SEED_SPORTS: ReadonlyArray<{ name: string; target: number }> = [
  { name: 'ชู้ตเตอร์กางเกงยักษ์', target: 10 },
  { name: 'มังกรยักษ์', target: 15 },
  { name: 'แชร์บอล', target: 7 },
  { name: 'บอลยักษ์', target: 10 },
  { name: 'ฟุตบอลรวมทีม', target: 9 },
];

export const memberCode = (n: number) => `Y${String(n).padStart(3, '0')}`;

export function createSeedSnapshot(now = new Date().toISOString()): Snapshot {
  const members: Member[] = SEED_MEMBER_NAMES.map((full_name, i) => ({
    id: `m-${memberCode(i + 1)}`,
    member_code: memberCode(i + 1),
    full_name,
    is_active: true,
    created_at: now,
    updated_at: now,
  }));
  const sports: Sport[] = SEED_SPORTS.map((s, i) => ({
    id: `s-${i + 1}`,
    sport_name: s.name,
    target_count: s.target,
    sort_order: i + 1,
    is_active: true,
    created_at: now,
    updated_at: now,
  }));
  return { members, sports, registrations: [], logs: [] };
}
