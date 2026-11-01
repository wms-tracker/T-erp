/** LAN server mode (server/index.ts): shared data for every device on the same network. */
import { AppError, type ErrorCode, toAppError } from './errors';
import type { DataSource, RegisterResult, Snapshot } from './types';

/** True when this page is served by (or proxied to) the LAN server. */
export async function detectServer(): Promise<{ urls: string[] } | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch('/api/health', { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(t);
    if (!res.ok) return null;
    const body = await res.json();
    return body.mode === 'server' ? { urls: (body.urls as string[]) ?? [] } : null;
  } catch {
    return null;
  }
}

async function op<T = unknown>(name: string, actor: string, args: Record<string, unknown> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/op/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor, args }),
    });
  } catch {
    throw new AppError('NETWORK');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new AppError((body.code as ErrorCode) ?? 'UNKNOWN', body.message);
  return body.result as T;
}

export function createServerSource(): DataSource {
  return {
    mode: 'server',
    async load(): Promise<Snapshot> {
      try {
        const res = await fetch('/api/snapshot', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as Snapshot;
      } catch (e) {
        throw toAppError(e instanceof TypeError ? new AppError('NETWORK') : e);
      }
    },
    subscribe(onChange, onStatus) {
      const es = new EventSource('/api/events');
      let wasDown = false;
      es.onopen = () => {
        onStatus?.(true);
        if (wasDown) onChange(); // reconnected: catch up on anything missed
        wasDown = false;
      };
      es.onmessage = () => onChange();
      es.onerror = () => {
        wasDown = true;
        onStatus?.(false);
      };
      return () => es.close();
    },
    registerMembers: (sportId, memberIds, actor, allowOver) => op<RegisterResult>('registerMembers', actor, { sportId, memberIds, allowOver }),
    cancelRegistration: (memberId, sportId, actor) => op('cancelRegistration', actor, { memberId, sportId }).then(() => undefined),
    moveRegistration: (memberId, fromSportId, toSportId, actor, allowOver) =>
      op('moveRegistration', actor, { memberId, fromSportId, toSportId, allowOver }).then(() => undefined),
    addMember: (fullName, actor) => op('addMember', actor, { fullName }).then(() => undefined),
    updateMember: (id, fullName, actor) => op('updateMember', actor, { id, fullName }).then(() => undefined),
    setMemberActive: (id, active, actor) => op('setMemberActive', actor, { id, active }).then(() => undefined),
    deleteMember: (id, actor) => op('deleteMember', actor, { id }).then(() => undefined),
    addSport: (name, target, actor) => op('addSport', actor, { name, target }).then(() => undefined),
    updateSport: (id, name, target, actor) => op('updateSport', actor, { id, name, target }).then(() => undefined),
    setSportActive: (id, active, actor) => op('setSportActive', actor, { id, active }).then(() => undefined),
    resetRegistrations: (actor) => op<number>('resetRegistrations', actor),
  };
}
