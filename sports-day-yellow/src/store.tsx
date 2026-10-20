import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toAppError, type AppError } from './lib/errors';
import { buildView, type AppView } from './lib/view';
import type { DataSource, Snapshot } from './lib/types';
import { useToast } from './components/ui';

export type SyncState = 'synced' | 'syncing' | 'offline' | 'error';
type RunResult<T> = { ok: true; value: T } | { ok: false; error: AppError };

interface Store {
  source: DataSource;
  snapshot: Snapshot | null;
  view: AppView | null;
  loading: boolean;
  loadError: string | null;
  sync: SyncState;
  lastSynced: Date | null;
  actor: string;
  setActor: (name: string) => void;
  refresh: () => Promise<void>;
  /** Runs a write, shows a toast, then reloads. Never throws. */
  run: <T>(fn: (src: DataSource, actor: string) => Promise<T>, success: string | ((v: T) => string), opts?: { silentError?: boolean }) => Promise<RunResult<T>>;
}

const Ctx = createContext<Store | null>(null);
const ACTOR_KEY = 'yellow-sports-2569:actor';

export function StoreProvider({ source, defaultActor, children }: { source: DataSource; defaultActor?: string; children: ReactNode }) {
  const toast = useToast();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncState>('syncing');
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [actor, setActorState] = useState(() => {
    try {
      return localStorage.getItem(ACTOR_KEY) || defaultActor || '';
    } catch {
      return defaultActor || '';
    }
  });
  const loadSeq = useRef(0);

  const setActor = useCallback((name: string) => {
    setActorState(name);
    try {
      localStorage.setItem(ACTOR_KEY, name);
    } catch {
      /* storage blocked: keep in memory only */
    }
  }, []);

  const refresh = useCallback(async () => {
    const seq = ++loadSeq.current;
    setSync('syncing');
    try {
      const s = await source.load();
      if (seq !== loadSeq.current) return; // a newer load already started
      setSnapshot(s);
      setLoadError(null);
      setSync('synced');
      setLastSynced(new Date());
    } catch (e) {
      if (seq !== loadSeq.current) return;
      const err = toAppError(e);
      setLoadError(err.message);
      setSync(err.code === 'NETWORK' ? 'offline' : 'error');
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [source]);

  useEffect(() => {
    void refresh();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // debounce bursts of realtime events (one save can touch several rows)
    const unsub = source.subscribe(
      () => {
        clearTimeout(timer);
        timer = setTimeout(() => void refresh(), 250);
      },
      (online) => !online && setSync((s) => (s === 'synced' ? 'offline' : s)),
    );
    const onFocus = () => void refresh();
    window.addEventListener('online', onFocus);
    return () => {
      clearTimeout(timer);
      unsub();
      window.removeEventListener('online', onFocus);
    };
  }, [source, refresh]);

  const run = useCallback<Store['run']>(
    async (fn, success, opts) => {
      setSync('syncing');
      try {
        const value = await fn(source, actor || 'ไม่ระบุชื่อ');
        toast.show('success', typeof success === 'function' ? success(value) : success);
        await refresh();
        return { ok: true, value };
      } catch (e) {
        const error = toAppError(e);
        if (!opts?.silentError) toast.show('error', error.message);
        await refresh();
        return { ok: false, error };
      }
    },
    [source, actor, refresh, toast],
  );

  const view = useMemo(() => (snapshot ? buildView(snapshot) : null), [snapshot]);

  const value: Store = { source, snapshot, view, loading, loadError, sync, lastSynced, actor, setActor, refresh, run };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}
