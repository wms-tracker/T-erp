import { describe, expect, it } from 'vitest';
import * as E from './engine';
import { AppError } from './errors';
import { createSeedSnapshot, SEED_MEMBER_NAMES } from './seed';
import { buildView, matchesName } from './view';
import { allSportsCsvRows, toCsv } from './reports';

const ctx = { actor: 'tester' };
const fresh = () => createSeedSnapshot('2026-10-20T00:00:00.000Z');
const ids = (n: number, from = 1) => Array.from({ length: n }, (_, i) => `m-Y${String(from + i).padStart(3, '0')}`);
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as AppError).code;
  }
  return null;
};

describe('seed data', () => {
  it('TC1: has all 23 members with codes Y001–Y023 and exact names', () => {
    const s = fresh();
    expect(s.members).toHaveLength(23);
    expect(s.members[0].member_code).toBe('Y001');
    expect(s.members[22].member_code).toBe('Y023');
    expect(s.members.map((m) => m.full_name)).toEqual([...SEED_MEMBER_NAMES]);
    expect(new Set(s.members.map((m) => m.member_code)).size).toBe(23);
  });

  it('TC2: has 5 sports with the required targets', () => {
    const s = fresh();
    expect(s.sports.map((x) => [x.sport_name, x.target_count])).toEqual([
      ['ชู้ตเตอร์กางเกงยักษ์', 10],
      ['มังกรยักษ์', 15],
      ['แชร์บอล', 7],
      ['บอลยักษ์', 10],
      ['ฟุตบอลรวมทีม', 9],
    ]);
    const v = buildView(s);
    expect(v.summary).toMatchObject({ totalMembers: 23, registeredMembers: 0, unregisteredMembers: 23, totalEntries: 0, fullSports: 0 });
    expect(v.sports.every((x) => x.status === 'empty')).toBe(true);
  });
});

describe('registration rules', () => {
  it('TC3: registers 3 members into the same sport', () => {
    const s = fresh();
    expect(E.registerMembers(s, ctx, 's-1', ids(3), false)).toEqual({ added: 3, skipped: 0 });
    const v = buildView(s);
    expect(v.sports[0]).toMatchObject({ count: 3, missing: 7, status: 'open', percent: 30 });
  });

  it('TC4: one member can join several sports', () => {
    const s = fresh();
    for (const sp of ['s-1', 's-2', 's-3']) E.registerMembers(s, ctx, sp, ['m-Y001'], false);
    const m = buildView(s).members[0];
    expect(m.count).toBe(3);
    expect(m.status).toBe('multi');
  });

  it('TC5: blocks duplicate registration in the same sport', () => {
    const s = fresh();
    E.registerMembers(s, ctx, 's-1', ['m-Y001'], false);
    expect(E.registerMembers(s, ctx, 's-1', ['m-Y001', 'm-Y001', 'm-Y002'], false)).toEqual({ added: 1, skipped: 1 });
    expect(s.registrations.filter((r) => r.member_id === 'm-Y001' && r.sport_id === 's-1')).toHaveLength(1);
    expect(code(() => E.moveRegistration(s, ctx, 'm-Y002', 's-1', 's-1', false))).toBe('SAME_SPORT');
  });

  it('TC6: summary numbers follow saved data', () => {
    const s = fresh();
    E.registerMembers(s, ctx, 's-1', ids(3), false);
    E.registerMembers(s, ctx, 's-2', ids(2), false);
    expect(buildView(s).summary).toMatchObject({ registeredMembers: 3, unregisteredMembers: 20, totalEntries: 5 });
  });

  it('TC7: cancelling lowers counts and keeps the row + history', () => {
    const s = fresh();
    E.registerMembers(s, ctx, 's-1', ids(3), false);
    E.cancelRegistration(s, ctx, 'm-Y002', 's-1');
    expect(buildView(s).sports[0].count).toBe(2);
    expect(s.registrations).toHaveLength(3);
    expect(s.registrations.find((r) => r.member_id === 'm-Y002')!.registration_status).toBe('cancelled');
    expect(s.logs[0].action).toBe('CANCEL');
    expect(code(() => E.cancelRegistration(s, ctx, 'm-Y002', 's-1'))).toBe('NOT_REGISTERED');
    // re-register reuses the same row (unique key) and logs RE_REGISTER
    E.registerMembers(s, ctx, 's-1', ['m-Y002'], false);
    expect(s.registrations).toHaveLength(3);
    expect(s.logs[0].action).toBe('RE_REGISTER');
  });

  it('TC8: reaching the target = 100% / full; over target needs confirmation', () => {
    const s = fresh();
    E.registerMembers(s, ctx, 's-3', ids(7), false); // แชร์บอล target 7
    expect(buildView(s).sports[2]).toMatchObject({ percent: 100, status: 'full', missing: 0 });
    expect(code(() => E.registerMembers(s, ctx, 's-3', ['m-Y010'], false))).toBe('OVER_TARGET');
    expect(buildView(s).sports[2].count).toBe(7); // nothing written
    E.registerMembers(s, ctx, 's-3', ['m-Y010'], true);
    expect(buildView(s).sports[2]).toMatchObject({ count: 8, status: 'over', over: 1, percent: 100 });
    expect(buildView(s).summary.fullSports).toBe(1);
  });

  it('moves a member between sports atomically', () => {
    const s = fresh();
    E.registerMembers(s, ctx, 's-1', ['m-Y001'], false);
    E.moveRegistration(s, ctx, 'm-Y001', 's-1', 's-2', false);
    const v = buildView(s);
    expect(v.sports[0].count).toBe(0);
    expect(v.sports[1].count).toBe(1);
    E.registerMembers(s, ctx, 's-1', ['m-Y001'], false);
    expect(code(() => E.moveRegistration(s, ctx, 'm-Y001', 's-1', 's-2', false))).toBe('ALREADY_REGISTERED');
  });

  it('member/sport management keeps data consistent', () => {
    const s = fresh();
    E.addMember(s, ctx, '  นายทดสอบ   ระบบ ');
    expect(s.members.at(-1)).toMatchObject({ member_code: 'Y024', full_name: 'นายทดสอบ ระบบ' });
    expect(code(() => E.addMember(s, ctx, 'นายทดสอบ ระบบ'))).toBe('DUPLICATE_NAME');
    E.registerMembers(s, ctx, 's-1', ['m-Y001', 'm-Y002'], false);
    E.setMemberActive(s, ctx, 'm-Y001', false);
    const v = buildView(s);
    expect(v.summary.totalMembers).toBe(23);
    expect(v.sports[0].count).toBe(1);
    expect(s.members.some((m) => m.id === 'm-Y001')).toBe(true); // never deleted
    E.updateSport(s, ctx, 's-1', 'ชู้ตเตอร์กางเกงยักษ์', 12);
    expect(buildView(s).sports[0].target).toBe(12);
    expect(code(() => E.updateSport(s, ctx, 's-1', 'x', 0))).toBe('INVALID_INPUT');
    E.addSport(s, ctx, 'วิ่งผลัด', 4);
    expect(buildView(s).sports).toHaveLength(6);
    expect(E.resetRegistrations(s, ctx)).toBe(1);
    expect(buildView(s).summary.totalEntries).toBe(0);
  });
});

describe('search & export', () => {
  it('TC9: Thai name search ignores spaces, matches surname and code', () => {
    expect(matchesName('นายกันต์พงศ์ แก้วแกมทอง', 'Y003', 'แก้วแกม')).toBe(true);
    expect(matchesName('นายกันต์พงศ์ แก้วแกมทอง', 'Y003', 'กันต์พงศ์ แก้ว')).toBe(true);
    expect(matchesName('นายกันต์พงศ์ แก้วแกมทอง', 'Y003', 'y003')).toBe(true);
    expect(matchesName('นายกันต์พงศ์ แก้วแกมทอง', 'Y003', 'สมชาย')).toBe(false);
  });

  it('TC10: CSV has UTF-8 BOM and escapes values', () => {
    const s = fresh();
    E.registerMembers(s, ctx, 's-1', ['m-Y001'], false);
    const csv = toCsv(allSportsCsvRows(buildView(s)));
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('ชู้ตเตอร์กางเกงยักษ์,10,1,9,1,Y001,นางสาววรารัตน์ พรหมสาขา ณ สกลนคร,สมัครแล้ว');
    expect(toCsv([['a,b', 'say "hi"']])).toBe('﻿"a,b","say ""hi"""');
  });
});
