import type { Session } from '@supabase/supabase-js';
import { AlertTriangle, BarChart3, FileText, LayoutDashboard, LogOut, RefreshCw, UserCog, Wifi } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { AssignModal } from './components/AssignModal';
import { MemberDetailModal } from './components/MemberDetailModal';
import { SportListModal } from './components/SportListModal';
import { Button, cx, Modal, Spinner } from './components/ui';
import { createDemoSource } from './lib/demoSource';
import { createServerSource, detectServer } from './lib/serverSource';
import { createSupabaseSource, getClient, isSupabaseConfigured, signOut } from './lib/supabaseSource';
import type { DataSource } from './lib/types';
import { Dashboard } from './pages/Dashboard';
import { Login } from './pages/Login';
import { Management } from './pages/Management';
import { Reports } from './pages/Reports';
import { StoreProvider, useStore, type SyncState } from './store';

const useSupabase = isSupabaseConfigured();
const requireLogin = useSupabase && (import.meta.env.VITE_AUTH_MODE ?? 'login') !== 'none';

export function App() {
  const [source, setSource] = useState<DataSource | null>(() => (useSupabase ? createSupabaseSource() : null));
  const [shareUrls, setShareUrls] = useState<string[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!requireLogin);

  useEffect(() => {
    if (!requireLogin) return;
    const sb = getClient();
    sb.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true); });
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  // no Supabase configured → use the office LAN server if this page comes from it, else Demo
  useEffect(() => {
    if (useSupabase) return;
    detectServer().then((info) => {
      if (info) setShareUrls(info.urls);
      setSource(info ? createServerSource() : createDemoSource());
    });
  }, []);

  if (!source) return <Spinner label="กำลังเชื่อมต่อ…" />;
  if (!authReady) return <Spinner label="กำลังตรวจสอบการเข้าสู่ระบบ…" />;
  if (requireLogin && !session) return <Login />;
  return (
    <StoreProvider source={source} defaultActor={session?.user.email ?? undefined} key={session?.user.id ?? 'anon'}>
      <Shell signedInAs={session?.user.email ?? null} shareUrls={shareUrls} />
    </StoreProvider>
  );
}

type Page = 'dashboard' | 'manage' | 'reports';
const PAGES: { key: Page; label: string; icon: typeof LayoutDashboard }[] = [
  { key: 'dashboard', label: 'แดชบอร์ด', icon: LayoutDashboard },
  { key: 'manage', label: 'จัดการนักกีฬา', icon: UserCog },
  { key: 'reports', label: 'รายงาน', icon: FileText },
];
const pageFromHash = (): Page => {
  const h = window.location.hash.replace('#', '');
  return PAGES.some((p) => p.key === h) ? (h as Page) : 'dashboard';
};

function Shell({ signedInAs, shareUrls }: { signedInAs: string | null; shareUrls: string[] }) {
  const { loading, loadError, view, source, actor, refresh } = useStore();
  const [page, setPage] = useState<Page>(pageFromHash);
  const [assign, setAssign] = useState<{ open: boolean; sportId?: string }>({ open: false });
  const [memberId, setMemberId] = useState<string | null>(null);
  const [sportListId, setSportListId] = useState<string | null>(null);
  const [askName, setAskName] = useState(false);

  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => { if (!loading && !actor) setAskName(true); }, [loading, actor]);

  const go = (p: Page) => { window.location.hash = p; setPage(p); window.scrollTo({ top: 0 }); };
  const openAssign = (sportId?: string) => { setSportListId(null); setAssign({ open: true, sportId }); };

  return (
    <div className="min-h-screen pb-[72px] md:pb-0">
      <header className="no-print sticky top-0 z-30 bg-ink text-white shadow">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-400 text-xl font-black text-ink">Y</div>
          <div className="min-w-0 leading-tight">
            <div className="truncate font-bold">กีฬาสีเหลือง 2569</div>
            <div className="truncate text-xs text-gray-400">Horizon Group Sports Day</div>
          </div>
          <nav className="ml-6 hidden gap-1 md:flex">
            {PAGES.map((p) => (
              <button key={p.key} onClick={() => go(p.key)}
                className={cx('inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold', page === p.key ? 'bg-brand-400 text-ink' : 'text-gray-300 hover:bg-white/10')}>
                <p.icon className="h-4 w-4" /> {p.label}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            <SyncBadge />
            <button onClick={() => void refresh()} className="rounded-lg p-2 text-gray-300 hover:bg-white/10" title="รีเฟรชข้อมูล" aria-label="รีเฟรชข้อมูล">
              <RefreshCw className="h-5 w-5" />
            </button>
            <button onClick={() => setAskName(true)} className="hidden max-w-[160px] truncate rounded-lg px-2 py-1.5 text-xs text-gray-300 hover:bg-white/10 sm:block" title="เปลี่ยนชื่อผู้บันทึก">
              ผู้บันทึก: <b className="text-white">{actor || '—'}</b>
            </button>
            {signedInAs && (
              <button onClick={() => void signOut()} className="rounded-lg p-2 text-gray-300 hover:bg-white/10" title={`ออกจากระบบ (${signedInAs})`} aria-label="ออกจากระบบ">
                <LogOut className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      </header>

      {source.mode === 'demo' && (
        <div className="no-print border-b border-orange-200 bg-orange-50">
          <div className="mx-auto flex max-w-7xl items-start gap-2 px-4 py-2 text-sm text-orange-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span><b>โหมด Demo</b> — ข้อมูลบันทึกในเบราว์เซอร์เครื่องนี้เท่านั้น <b>ไม่ซิงก์ระหว่างอุปกรณ์</b> (เชื่อม Supabase ตามคู่มือ README เพื่อใช้งานจริงหลายเครื่อง)</span>
          </div>
        </div>
      )}

      {source.mode === 'server' && shareUrls.length > 0 && (
        <div className="no-print border-b border-green-200 bg-green-50">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2 text-sm text-green-900">
            <Wifi className="h-4 w-4 shrink-0" />
            <span>ใช้งานร่วมกันใน Wi-Fi บริษัท — ส่งลิงก์นี้ให้เพื่อนเปิดลงชื่อเองได้:</span>
            {shareUrls.map((u) => (
              <b key={u} className="select-all rounded bg-white px-1.5 py-0.5 font-mono ring-1 ring-green-200">{u}</b>
            ))}
          </div>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 py-5">
        {loading ? (
          <Spinner />
        ) : !view ? (
          <div className="mx-auto max-w-md rounded-2xl bg-white p-6 text-center shadow ring-1 ring-red-200">
            <AlertTriangle className="mx-auto h-8 w-8 text-red-500" />
            <p className="mt-2 font-semibold">โหลดข้อมูลไม่สำเร็จ</p>
            <p className="mt-1 text-sm text-gray-600">{loadError}</p>
            <Button className="mt-4" onClick={() => void refresh()}><RefreshCw className="h-4 w-4" /> ลองใหม่</Button>
          </div>
        ) : (
          <>
            {loadError && (
              <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">ซิงก์ข้อมูลล่าสุดไม่สำเร็จ: {loadError} — ข้อมูลที่แสดงอาจไม่เป็นปัจจุบัน</div>
            )}
            {page === 'dashboard' && <Dashboard onAssign={openAssign} onMember={setMemberId} onSportList={setSportListId} />}
            {page === 'manage' && <Management onMember={setMemberId} />}
            {page === 'reports' && <Reports />}
          </>
        )}
      </main>

      {/* mobile bottom nav */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-gray-800 bg-ink pb-[env(safe-area-inset-bottom)] md:hidden">
        {PAGES.map((p) => (
          <button key={p.key} onClick={() => go(p.key)} className={cx('flex flex-col items-center gap-0.5 py-2 text-xs font-semibold', page === p.key ? 'text-brand-400' : 'text-gray-400')}>
            <p.icon className="h-5 w-5" /> {p.label}
          </button>
        ))}
      </nav>

      <AssignModal open={assign.open} initialSportId={assign.sportId} onClose={() => setAssign({ open: false })} />
      <MemberDetailModal memberId={memberId} onClose={() => setMemberId(null)} />
      <SportListModal sportId={sportListId} onClose={() => setSportListId(null)} onAssign={openAssign} />
      {askName && <ActorModal onClose={() => setAskName(false)} />}
    </div>
  );
}

function SyncBadge() {
  const { sync, lastSynced, source } = useStore();
  const meta: Record<SyncState, { dot: string; text: string }> = {
    synced: { dot: 'bg-green-400', text: source.mode === 'demo' ? 'บันทึกในเครื่อง' : 'ซิงก์แล้ว' },
    syncing: { dot: 'bg-brand-400 animate-pulse', text: 'กำลังซิงก์…' },
    offline: { dot: 'bg-gray-400', text: 'ออฟไลน์' },
    error: { dot: 'bg-red-500', text: 'ซิงก์ไม่สำเร็จ' },
  };
  const m = meta[sync];
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs" title={lastSynced ? `ซิงก์ล่าสุด ${lastSynced.toLocaleTimeString('th-TH')}` : undefined}>
      <span className={cx('h-2 w-2 rounded-full', m.dot)} />
      <span className="hidden sm:inline">{m.text}</span>
      {lastSynced && sync === 'synced' && <span className="hidden text-gray-400 lg:inline">{lastSynced.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</span>}
    </span>
  );
}

function ActorModal({ onClose }: { onClose: () => void }) {
  const { actor, setActor } = useStore();
  const [name, setName] = useState(actor);
  const save = (e?: FormEvent) => {
    e?.preventDefault();
    setActor(name.trim() || 'เจ้าหน้าที่');
    onClose();
  };
  return (
    <Modal open size="sm" onClose={save} title="ชื่อผู้บันทึกข้อมูล" subtitle="ใช้บันทึกในประวัติว่าใครเป็นผู้เพิ่ม/แก้ไขรายการ"
      footer={<Button onClick={() => save()}><BarChart3 className="h-4 w-4" /> เริ่มใช้งาน</Button>}>
      <form onSubmit={save}>
        <input className="input" placeholder="เช่น พี่เอ ฝ่ายบุคคล" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={60} />
      </form>
    </Modal>
  );
}
