/**
 * Supabase mode: reads tables directly, writes ONLY through the Postgres functions in
 * supabase/schema.sql. Each function runs as one transaction and locks the sport row, so two
 * staff saving at the same moment cannot create duplicates or silently overshoot the target.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppError, toAppError } from './errors';
import type { AuditLog, DataSource, Member, Registration, RegisterResult, Snapshot, Sport } from './types';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const isSupabaseConfigured = () =>
  !!SUPABASE_URL && !!SUPABASE_KEY && !SUPABASE_URL.includes('your-project-ref');

let client: SupabaseClient | null = null;
export function getClient(): SupabaseClient {
  if (!client) client = createClient(SUPABASE_URL!, SUPABASE_KEY!, { realtime: { params: { eventsPerSecond: 10 } } });
  return client;
}

async function rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await getClient().rpc(fn, args);
  if (error) throw toAppError(error);
  return data as T;
}

async function select<T>(q: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw toAppError(error);
  return data ?? [];
}

export function createSupabaseSource(): DataSource {
  const sb = getClient();
  return {
    mode: 'supabase',
    async load(): Promise<Snapshot> {
      const [members, sports, registrations, logs] = await Promise.all([
        select<Member>(sb.from('members').select('*').order('member_code')),
        select<Sport>(sb.from('sports').select('*').order('sort_order')),
        select<Registration>(sb.from('registrations').select('*')),
        select<AuditLog>(sb.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(1000)),
      ]);
      return { members, sports, registrations, logs: logs.map((l) => ({ ...l, id: String(l.id) })) };
    },
    subscribe(onChange, onStatus) {
      const ch = sb.channel('yellow-sports-sync');
      for (const table of ['members', 'sports', 'registrations', 'audit_logs'])
        ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => onChange());
      ch.subscribe((status) => onStatus?.(status === 'SUBSCRIBED'));
      return () => {
        void sb.removeChannel(ch);
      };
    },
    registerMembers: (sportId, ids, actor, allowOver) =>
      rpc<RegisterResult>('register_members', { p_sport_id: sportId, p_member_ids: ids, p_actor: actor, p_allow_over: allowOver }),
    cancelRegistration: (memberId, sportId, actor) =>
      rpc('cancel_registration', { p_member_id: memberId, p_sport_id: sportId, p_actor: actor }).then(() => undefined),
    moveRegistration: (memberId, from, to, actor, allowOver) =>
      rpc('move_registration', { p_member_id: memberId, p_from_sport: from, p_to_sport: to, p_actor: actor, p_allow_over: allowOver }).then(
        () => undefined,
      ),
    addMember: (name, actor) => rpc('add_member', { p_full_name: name, p_actor: actor }).then(() => undefined),
    updateMember: (id, name, actor) => rpc('update_member', { p_id: id, p_full_name: name, p_actor: actor }).then(() => undefined),
    setMemberActive: (id, active, actor) => rpc('set_member_active', { p_id: id, p_active: active, p_actor: actor }).then(() => undefined),
    deleteMember: (id, actor) => rpc('delete_member', { p_id: id, p_actor: actor }).then(() => undefined),
    addSport: (name, target, actor) => rpc('add_sport', { p_name: name, p_target: target, p_actor: actor }).then(() => undefined),
    updateSport: (id, name, target, actor) =>
      rpc('update_sport', { p_id: id, p_name: name, p_target: target, p_actor: actor }).then(() => undefined),
    setSportActive: (id, active, actor) => rpc('set_sport_active', { p_id: id, p_active: active, p_actor: actor }).then(() => undefined),
    resetRegistrations: (actor) => rpc<number>('reset_registrations', { p_actor: actor }),
  };
}

export async function signIn(email: string, password: string) {
  const { error } = await getClient().auth.signInWithPassword({ email, password });
  if (error) throw new AppError('NOT_AUTHENTICATED', 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
}
export async function signOut() {
  await getClient().auth.signOut();
}
