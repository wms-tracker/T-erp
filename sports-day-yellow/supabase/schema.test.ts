/**
 * Runs supabase/schema.sql on a real (in-process) PostgreSQL via PGlite and exercises the
 * write functions. Supabase-specific objects (auth.jwt, roles, realtime publication) are stubbed.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';

const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8').replace(/create extension[^;]*;/i, '');

let db: PGlite;
const one = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];
const sportId = async (name: string) => (await one<{ id: string }>('select id from sports where sport_name = $1', [name])).id;
const memberIds = async (...codes: string[]) =>
  (await db.query<{ id: string }>('select id from members where member_code = any($1) order by member_code', [codes])).rows.map((r) => r.id);
const count = async (sport: string) =>
  (await one<{ n: number }>("select count(*)::int n from registrations where sport_id = $1 and registration_status = 'registered'", [sport])).n;
const err = async (p: Promise<unknown>) => p.then(() => null, (e: Error) => e.message);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.jwt() returns jsonb language sql as $$ select '{"email":"staff@horizon.test"}'::jsonb $$;
    create publication supabase_realtime;
  `);
  await db.exec(schema);
  await db.exec(schema); // must be safe to run twice
}, 60_000);

describe('schema.sql on PostgreSQL', () => {
  it('seeds 23 members and 5 sports once (idempotent)', async () => {
    expect((await one<{ n: number }>('select count(*)::int n from members')).n).toBe(23);
    expect((await db.query('select sport_name, target_count from sports order by sort_order')).rows).toEqual([
      { sport_name: 'ชู้ตเตอร์กางเกงยักษ์', target_count: 10 },
      { sport_name: 'มังกรยักษ์', target_count: 15 },
      { sport_name: 'แชร์บอล', target_count: 7 },
      { sport_name: 'บอลยักษ์', target_count: 10 },
      { sport_name: 'ฟุตบอลรวมทีม', target_count: 9 },
    ]);
  });

  it('registers, skips duplicates, enforces target, cancels and re-registers', async () => {
    const chair = await sportId('แชร์บอล');
    const ids = await memberIds('Y001', 'Y002', 'Y003');
    const r1 = await one<{ register_members: { added: number; skipped: number } }>('select register_members($1, $2, $3, false)', [chair, ids, 'A']);
    expect(r1.register_members).toEqual({ added: 3, skipped: 0 });
    const r2 = await one<{ register_members: { added: number; skipped: number } }>('select register_members($1, $2, $3, false)', [chair, [ids[0], ids[0]], 'A']);
    expect(r2.register_members).toEqual({ added: 0, skipped: 1 });
    expect(await count(chair)).toBe(3);

    const more = await memberIds('Y004', 'Y005', 'Y006', 'Y007', 'Y008');
    expect(await err(db.query('select register_members($1, $2, $3, false)', [chair, more, 'A']))).toContain('OVER_TARGET');
    expect(await count(chair)).toBe(3); // transaction rolled back
    await db.query('select register_members($1, $2, $3, true)', [chair, more, 'A']);
    expect(await count(chair)).toBe(8);

    await db.query('select cancel_registration($1, $2, $3)', [ids[1], chair, 'B']);
    expect(await count(chair)).toBe(7);
    expect(await err(db.query('select cancel_registration($1, $2, $3)', [ids[1], chair, 'B']))).toContain('NOT_REGISTERED');
    await db.query('select register_members($1, $2, $3, true)', [chair, [ids[1]], 'B']);
    expect((await one<{ n: number }>('select count(*)::int n from registrations where member_id = $1', [ids[1]])).n).toBe(1);

    // unique (member_id, sport_id) is enforced by the table itself, too
    expect(await err(db.query('insert into registrations(member_id, sport_id) values ($1, $2)', [ids[0], chair]))).toMatch(/duplicate key/);
    const actions = (await db.query<{ action: string }>('select action from audit_logs order by id')).rows.map((r) => r.action);
    expect(actions).toEqual(['REGISTER', 'REGISTER', 'REGISTER', 'REGISTER', 'REGISTER', 'REGISTER', 'REGISTER', 'REGISTER', 'CANCEL', 'RE_REGISTER']);
  });

  it('moves between sports, adds/edits members and sports, resets', async () => {
    const chair = await sportId('แชร์บอล');
    const dragon = await sportId('มังกรยักษ์');
    const [y1] = await memberIds('Y001');
    await db.query('select move_registration($1, $2, $3, $4, false)', [y1, chair, dragon, 'C']);
    expect(await count(dragon)).toBe(1);
    expect(await err(db.query('select move_registration($1, $2, $3, $4, false)', [y1, chair, dragon, 'C']))).toContain('ALREADY_REGISTERED');

    await db.query("select add_member('  นายทดสอบ   ระบบ ', '')");
    expect(await one('select member_code, full_name from members order by member_code desc limit 1')).toEqual({ member_code: 'Y024', full_name: 'นายทดสอบ ระบบ' });
    expect(await err(db.query("select add_member('นายทดสอบ ระบบ', '')"))).toContain('DUPLICATE_NAME');
    expect((await one<{ actor: string }>("select actor from audit_logs where action = 'MEMBER_ADD'")).actor).toBe('staff@horizon.test');

    await db.query("select update_sport($1, 'มังกรยักษ์', 16, 'D')", [dragon]);
    expect((await one<{ target_count: number }>('select target_count from sports where id = $1', [dragon])).target_count).toBe(16);
    expect(await err(db.query("select update_sport($1, 'มังกรยักษ์', 0, 'D')", [dragon]))).toContain('INVALID_INPUT');
    await db.query("select add_sport('วิ่งผลัด', 4, 'D')");

    await db.query('select set_member_active($1, false, $2)', [y1, 'D']);
    expect(await count(dragon)).toBe(0);
    expect((await one<{ n: number }>('select count(*)::int n from members where id = $1', [y1])).n).toBe(1);

    const n = await one<{ reset_registrations: number }>("select reset_registrations('E')");
    expect(n.reset_registrations).toBe(7);
    expect((await one<{ n: number }>("select count(*)::int n from registrations where registration_status = 'registered'")).n).toBe(0);
  });

  it('deletes a member with their registrations', async () => {
    const dragon = await sportId('มังกรยักษ์');
    const [y20] = await memberIds('Y020');
    await db.query('select register_members($1, $2, $3, false)', [dragon, [y20], 'F']);
    await db.query("select delete_member($1, 'F')", [y20]);
    expect((await one<{ n: number }>('select count(*)::int n from members where id = $1', [y20])).n).toBe(0);
    expect((await one<{ n: number }>('select count(*)::int n from registrations where member_id = $1', [y20])).n).toBe(0);
    expect((await one<{ n: number }>('select count(*)::int n from audit_logs where member_id = $1', [y20])).n).toBe(0);
    expect((await one<{ detail: string }>("select detail from audit_logs where action = 'MEMBER_DELETE'")).detail).toContain('Y020');
    expect(await err(db.query("select delete_member($1, 'F')", [y20]))).toContain('MEMBER_NOT_FOUND');
  });

  it('locks writes down to the functions (RLS + grants)', async () => {
    const rls = await db.query<{ relname: string; relrowsecurity: boolean }>(
      "select relname, relrowsecurity from pg_class where relname in ('members','sports','registrations','audit_logs') order by relname",
    );
    expect(rls.rows.every((r) => r.relrowsecurity)).toBe(true);
    const anon = await one<{ ok: boolean }>("select has_function_privilege('anon', 'public.register_members(uuid, uuid[], text, boolean)', 'execute') ok");
    const auth = await one<{ ok: boolean }>("select has_function_privilege('authenticated', 'public.register_members(uuid, uuid[], text, boolean)', 'execute') ok");
    expect(anon.ok).toBe(false);
    expect(auth.ok).toBe(true);
    const pub = await db.query("select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by tablename");
    expect(pub.rows.map((r) => (r as { tablename: string }).tablename)).toEqual(['audit_logs', 'members', 'registrations', 'sports']);
  });
});
