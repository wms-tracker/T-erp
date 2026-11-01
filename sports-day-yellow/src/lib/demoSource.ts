/**
 * Demo mode: data lives in this browser's localStorage. Tabs of the same browser stay in sync
 * (BroadcastChannel + storage event), but other devices do NOT see these changes.
 */
import * as E from './engine';
import { createSeedSnapshot } from './seed';
import type { DataSource, Snapshot } from './types';

const KEY = 'yellow-sports-2569:demo:v1';
const CHANNEL = 'yellow-sports-2569-demo';

function read(): Snapshot {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Snapshot;
  } catch {
    /* corrupted or blocked storage → fall back to seed */
  }
  const seed = createSeedSnapshot();
  write(seed);
  return seed;
}

function write(s: Snapshot) {
  s.logs = s.logs.slice(0, 2000);
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function createDemoSource(): DataSource {
  const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null;

  /** Read-modify-write in one synchronous step, so a half-finished operation is never saved. */
  async function mutate<T>(fn: (s: Snapshot) => T): Promise<T> {
    const s = read();
    const result = fn(s);
    write(s);
    bc?.postMessage('changed');
    return result;
  }

  return {
    mode: 'demo',
    async load() {
      return read();
    },
    subscribe(onChange, onStatus) {
      const onMsg = () => onChange();
      const onStorage = (e: StorageEvent) => e.key === KEY && onChange();
      bc?.addEventListener('message', onMsg);
      window.addEventListener('storage', onStorage);
      onStatus?.(true);
      return () => {
        bc?.removeEventListener('message', onMsg);
        window.removeEventListener('storage', onStorage);
      };
    },
    registerMembers: (sportId, ids, actor, allowOver) => mutate((s) => E.registerMembers(s, { actor }, sportId, ids, allowOver)),
    cancelRegistration: (m, sp, actor) => mutate((s) => E.cancelRegistration(s, { actor }, m, sp)),
    moveRegistration: (m, from, to, actor, allowOver) => mutate((s) => E.moveRegistration(s, { actor }, m, from, to, allowOver)),
    addMember: (name, actor) => mutate((s) => E.addMember(s, { actor }, name)),
    updateMember: (id, name, actor) => mutate((s) => E.updateMember(s, { actor }, id, name)),
    setMemberActive: (id, active, actor) => mutate((s) => E.setMemberActive(s, { actor }, id, active)),
    deleteMember: (id, actor) => mutate((s) => E.deleteMember(s, { actor }, id)),
    addSport: (name, target, actor) => mutate((s) => E.addSport(s, { actor }, name, target)),
    updateSport: (id, name, target, actor) => mutate((s) => E.updateSport(s, { actor }, id, name, target)),
    setSportActive: (id, active, actor) => mutate((s) => E.setSportActive(s, { actor }, id, active)),
    resetRegistrations: (actor) => mutate((s) => E.resetRegistrations(s, { actor })),
    async factoryReset() {
      write(createSeedSnapshot());
      bc?.postMessage('changed');
    },
  };
}
