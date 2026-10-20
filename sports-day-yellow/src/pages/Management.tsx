import { ArrowRightLeft, History, ListChecks, Pencil, Plus, Power, RotateCcw, Search, Trophy, Users } from 'lucide-react';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useStore } from '../store';
import { ACTION_LABEL, fmtDateTime, matchesName } from '../lib/view';
import type { AuditAction, Member, Sport } from '../lib/types';
import { Button, cx, EmptyState, Modal, useConfirm } from '../components/ui';
import { useRegistrationActions } from '../components/useRegistrationActions';

type Tab = 'members' | 'sports' | 'move' | 'history' | 'reset';
const TABS: { key: Tab; label: string; icon: ReactNode }[] = [
  { key: 'members', label: 'สมาชิก', icon: <Users className="h-4 w-4" /> },
  { key: 'sports', label: 'ประเภทกีฬา', icon: <Trophy className="h-4 w-4" /> },
  { key: 'move', label: 'ย้ายกีฬา', icon: <ArrowRightLeft className="h-4 w-4" /> },
  { key: 'history', label: 'ประวัติการเปลี่ยนแปลง', icon: <History className="h-4 w-4" /> },
  { key: 'reset', label: 'รีเซ็ตข้อมูล', icon: <RotateCcw className="h-4 w-4" /> },
];

export function Management({ onMember }: { onMember: (id: string) => void }) {
  const [tab, setTab] = useState<Tab>('members');
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-ink">จัดการนักกีฬา</h1>
        <p className="text-sm text-gray-500">เพิ่ม/แก้ไขสมาชิกและประเภทกีฬา ย้ายกีฬา ดูประวัติ และรีเซ็ตข้อมูล — ทุกการลบ/ยกเลิกมีหน้าต่างยืนยัน</p>
      </div>
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cx(
              'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition',
              tab === t.key ? 'bg-ink text-brand-400' : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50',
            )}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      {tab === 'members' && <MembersPanel onMember={onMember} />}
      {tab === 'sports' && <SportsPanel />}
      {tab === 'move' && <MovePanel />}
      {tab === 'history' && <HistoryPanel />}
      {tab === 'reset' && <ResetPanel />}
    </div>
  );
}

const Card = ({ title, children, right }: { title: ReactNode; children: ReactNode; right?: ReactNode }) => (
  <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <h2 className="text-lg font-bold text-ink">{title}</h2>
      {right && <div className="ml-auto">{right}</div>}
    </div>
    {children}
  </section>
);

// ---------------------------------------------------------------- Members
function MembersPanel({ onMember }: { onMember: (id: string) => void }) {
  const { snapshot, view, run } = useStore();
  const confirm = useConfirm();
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Member | null>(null);
  if (!snapshot || !view) return null;
  const all = [...snapshot.members].sort((a, b) => a.member_code.localeCompare(b.member_code));
  const rows = all.filter((m) => matchesName(m.full_name, m.member_code, q));
  const countOf = (id: string) => view.members.find((x) => x.member.id === id)?.count ?? 0;

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (adding || !name.trim()) return;
    setAdding(true);
    const r = await run((src, actor) => src.addMember(name, actor), `เพิ่มสมาชิก ${name.trim()} แล้ว`);
    setAdding(false);
    if (r.ok) setName('');
  };

  const toggleActive = async (m: Member) => {
    const n = countOf(m.id);
    const ok = await confirm({
      title: m.is_active ? 'ปิดใช้งานสมาชิก' : 'เปิดใช้งานสมาชิก',
      danger: m.is_active,
      confirmText: m.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน',
      message: m.is_active ? (
        <>
          <p>ปิดใช้งาน <b>{m.full_name}</b>? สมาชิกจะไม่แสดงบน Dashboard</p>
          {n > 0 && <p className="text-red-600">การสมัครกีฬาที่มีอยู่ {n} รายการจะถูกเปลี่ยนสถานะเป็น “ยกเลิก” (ประวัติยังอยู่)</p>}
          <p className="text-gray-500">ข้อมูลสมาชิกไม่ถูกลบ สามารถเปิดใช้งานใหม่ได้ภายหลัง</p>
        </>
      ) : (
        <p>เปิดใช้งาน <b>{m.full_name}</b> อีกครั้ง? (การสมัครเดิมที่ถูกยกเลิกต้องเพิ่มใหม่เอง)</p>
      ),
    });
    if (ok) await run((src, actor) => src.setMemberActive(m.id, !m.is_active, actor), `${m.is_active ? 'ปิด' : 'เปิด'}ใช้งาน ${m.full_name} แล้ว`);
  };

  return (
    <div className="space-y-4">
      <Card title="เพิ่มสมาชิกใหม่">
        <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row">
          <input className="input flex-1" placeholder="เช่น นายสมชาย ใจดี" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          <Button type="submit" loading={adding} disabled={!name.trim()}><Plus className="h-4 w-4" /> เพิ่มสมาชิก</Button>
        </form>
        <p className="mt-1.5 text-xs text-gray-500">ระบบจะสร้างรหัสสมาชิกถัดไปให้อัตโนมัติ (เช่น Y024)</p>
      </Card>
      <Card
        title={`สมาชิกทั้งหมด (${all.filter((m) => m.is_active).length} ใช้งาน${all.some((m) => !m.is_active) ? ` · ${all.filter((m) => !m.is_active).length} ปิดใช้งาน` : ''})`}
        right={
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input className="input pl-9" placeholder="ค้นหา…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        }
      >
        <ul className="divide-y divide-gray-100">
          {rows.map((m) => (
            <li key={m.id} className={cx('flex flex-wrap items-center gap-2 py-2.5', !m.is_active && 'opacity-60')}>
              <span className="w-12 font-mono text-xs text-gray-500">{m.member_code}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{m.full_name}</span>
                <span className="text-xs text-gray-500">{m.is_active ? `ลงแข่ง ${countOf(m.id)} ประเภท` : 'ปิดใช้งาน'}</span>
              </span>
              <div className="flex gap-1">
                {m.is_active && (
                  <Button size="sm" variant="outline" onClick={() => onMember(m.id)} title="เพิ่ม/ยกเลิกการสมัคร">
                    <ListChecks className="h-3.5 w-3.5" /> การสมัคร
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setEditing(m)} title="แก้ไขชื่อ"><Pencil className="h-3.5 w-3.5" /> แก้ไข</Button>
                <Button size="sm" variant="ghost" className={m.is_active ? 'text-red-600' : 'text-green-700'} onClick={() => toggleActive(m)}>
                  <Power className="h-3.5 w-3.5" /> {m.is_active ? 'ปิด' : 'เปิด'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
        {rows.length === 0 && <EmptyState title="ไม่พบสมาชิก" />}
      </Card>
      {editing && <EditMemberModal member={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function EditMemberModal({ member, onClose }: { member: Member; onClose: () => void }) {
  const { run } = useStore();
  const [name, setName] = useState(member.full_name);
  const [saving, setSaving] = useState(false);
  const save = async (e?: FormEvent) => {
    e?.preventDefault();
    if (saving) return;
    setSaving(true);
    const r = await run((src, actor) => src.updateMember(member.id, name, actor), 'แก้ไขชื่อสมาชิกแล้ว');
    setSaving(false);
    if (r.ok) onClose();
  };
  return (
    <Modal open size="sm" onClose={onClose} busy={saving} title={`แก้ไขชื่อสมาชิก ${member.member_code}`}
      footer={<><Button variant="ghost" onClick={onClose} disabled={saving}>ยกเลิก</Button><Button onClick={() => save()} loading={saving} disabled={!name.trim()}>บันทึก</Button></>}>
      <form onSubmit={save}>
        <label className="block text-sm font-semibold text-gray-700">ชื่อ-นามสกุล
          <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={120} />
        </label>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- Sports
function SportsPanel() {
  const { snapshot, view, run } = useStore();
  const confirm = useConfirm();
  const [name, setName] = useState('');
  const [target, setTarget] = useState('10');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Sport | null>(null);
  if (!snapshot || !view) return null;
  const all = [...snapshot.sports].sort((a, b) => a.sort_order - b.sort_order);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (adding) return;
    setAdding(true);
    const r = await run((src, actor) => src.addSport(name, Number(target), actor), `เพิ่มกีฬา ${name.trim()} แล้ว`);
    setAdding(false);
    if (r.ok) { setName(''); setTarget('10'); }
  };

  const toggle = async (sp: Sport) => {
    const n = view.sports.find((x) => x.sport.id === sp.id)?.count ?? 0;
    const ok = await confirm({
      title: sp.is_active ? 'ปิดใช้งานกีฬา' : 'เปิดใช้งานกีฬา',
      danger: sp.is_active,
      confirmText: sp.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน',
      message: sp.is_active ? (
        <><p>ปิดใช้งานกีฬา <b>{sp.sport_name}</b>? กีฬานี้จะไม่แสดงบน Dashboard และรายงาน</p>
          {n > 0 && <p>รายชื่อผู้สมัคร {n} คนจะถูกเก็บไว้ และกลับมาแสดงเมื่อเปิดใช้งานอีกครั้ง</p>}</>
      ) : <p>เปิดใช้งานกีฬา <b>{sp.sport_name}</b> อีกครั้ง?</p>,
    });
    if (ok) await run((src, actor) => src.setSportActive(sp.id, !sp.is_active, actor), `${sp.is_active ? 'ปิด' : 'เปิด'}ใช้งาน ${sp.sport_name} แล้ว`);
  };

  return (
    <div className="space-y-4">
      <Card title="เพิ่มประเภทกีฬา">
        <form onSubmit={add} className="grid gap-2 sm:grid-cols-[1fr_140px_auto]">
          <input className="input" placeholder="ชื่อกีฬา" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          <input className="input" type="number" min={1} max={500} inputMode="numeric" placeholder="เป้าหมาย (คน)" value={target} onChange={(e) => setTarget(e.target.value)} />
          <Button type="submit" loading={adding} disabled={!name.trim() || !target}><Plus className="h-4 w-4" /> เพิ่มกีฬา</Button>
        </form>
      </Card>
      <Card title="ประเภทกีฬาและจำนวนเป้าหมาย">
        <ul className="divide-y divide-gray-100">
          {all.map((sp) => {
            const sv = view.sports.find((x) => x.sport.id === sp.id);
            return (
              <li key={sp.id} className={cx('flex flex-wrap items-center gap-2 py-2.5', !sp.is_active && 'opacity-60')}>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{sp.sport_name}</span>
                  <span className="text-xs text-gray-500">{sp.is_active ? `เป้าหมาย ${sp.target_count} คน · สมัครแล้ว ${sv?.count ?? 0} คน` : `ปิดใช้งาน · เป้าหมาย ${sp.target_count} คน`}</span>
                </span>
                <Button size="sm" variant="outline" onClick={() => setEditing(sp)}><Pencil className="h-3.5 w-3.5" /> แก้ไขชื่อ/เป้าหมาย</Button>
                <Button size="sm" variant="ghost" className={sp.is_active ? 'text-red-600' : 'text-green-700'} onClick={() => toggle(sp)}>
                  <Power className="h-3.5 w-3.5" /> {sp.is_active ? 'ปิด' : 'เปิด'}
                </Button>
              </li>
            );
          })}
        </ul>
      </Card>
      {editing && <EditSportModal sport={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function EditSportModal({ sport, onClose }: { sport: Sport; onClose: () => void }) {
  const { run, view } = useStore();
  const confirm = useConfirm();
  const [name, setName] = useState(sport.sport_name);
  const [target, setTarget] = useState(String(sport.target_count));
  const [saving, setSaving] = useState(false);
  const count = view?.sports.find((x) => x.sport.id === sport.id)?.count ?? 0;
  const save = async (e?: FormEvent) => {
    e?.preventDefault();
    if (saving) return;
    const t = Number(target);
    if (t < count && !(await confirm({ title: 'เป้าหมายน้อยกว่าผู้สมัคร', message: <p>ปัจจุบันมีผู้สมัคร {count} คน หากตั้งเป้าหมาย {t} คน สถานะจะเป็น “เกินจำนวนเป้าหมาย” (ไม่มีรายชื่อถูกลบ) ยืนยันหรือไม่?</p> }))) return;
    setSaving(true);
    const r = await run((src, actor) => src.updateSport(sport.id, name, t, actor), 'บันทึกการแก้ไขกีฬาแล้ว');
    setSaving(false);
    if (r.ok) onClose();
  };
  return (
    <Modal open size="sm" onClose={onClose} busy={saving} title="แก้ไขประเภทกีฬา"
      footer={<><Button variant="ghost" onClick={onClose} disabled={saving}>ยกเลิก</Button><Button onClick={() => save()} loading={saving}>บันทึก</Button></>}>
      <form onSubmit={save} className="space-y-3">
        <label className="block text-sm font-semibold text-gray-700">ชื่อกีฬา
          <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </label>
        <label className="block text-sm font-semibold text-gray-700">จำนวนเป้าหมาย (คน)
          <input className="input mt-1" type="number" min={1} max={500} inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value)} />
        </label>
        <p className="text-xs text-gray-500">ปัจจุบันมีผู้สมัคร {count} คน</p>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- Move
function MovePanel() {
  const { view } = useStore();
  const { move } = useRegistrationActions();
  const [memberId, setMemberId] = useState('');
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [busy, setBusy] = useState(false);
  if (!view) return null;
  const mv = view.members.find((m) => m.member.id === memberId);
  const fromOptions = mv?.sports ?? [];
  const toOptions = view.sports.filter((s) => mv && !mv.sports.some((x) => x.id === s.sport.id));
  const from = fromOptions.find((s) => s.id === fromId);
  const to = toOptions.find((s) => s.sport.id === toId);

  const submit = async () => {
    if (!mv || !from || !to || busy) return;
    setBusy(true);
    const ok = await move(mv.member, from, to.sport);
    setBusy(false);
    if (ok) { setFromId(''); setToId(''); }
  };

  return (
    <Card title="ย้ายสมาชิกไปยังประเภทกีฬาอื่น">
      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-sm font-semibold text-gray-700">1. สมาชิก
          <select className="input mt-1" value={memberId} onChange={(e) => { setMemberId(e.target.value); setFromId(''); setToId(''); }}>
            <option value="">— เลือกสมาชิก —</option>
            {view.members.filter((m) => m.count > 0).map((m) => (
              <option key={m.member.id} value={m.member.id}>{m.member.member_code} {m.member.full_name} ({m.count})</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-gray-700">2. จากกีฬา
          <select className="input mt-1" value={fromId} onChange={(e) => setFromId(e.target.value)} disabled={!mv}>
            <option value="">— เลือกกีฬาที่สมัครอยู่ —</option>
            {fromOptions.map((s) => <option key={s.id} value={s.id}>{s.sport_name}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold text-gray-700">3. ไปยังกีฬา
          <select className="input mt-1" value={toId} onChange={(e) => setToId(e.target.value)} disabled={!mv}>
            <option value="">— เลือกกีฬาปลายทาง —</option>
            {toOptions.map((s) => <option key={s.sport.id} value={s.sport.id}>{s.sport.sport_name} ({s.count}/{s.target})</option>)}
          </select>
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button onClick={submit} disabled={!from || !to} loading={busy}><ArrowRightLeft className="h-4 w-4" /> ย้ายกีฬา</Button>
        <span className="text-xs text-gray-500">เฉพาะสมาชิกที่ลงแข่งอย่างน้อย 1 ประเภท · ระบบจะยกเลิกกีฬาเดิมและสมัครกีฬาใหม่ในขั้นตอนเดียว</span>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- History
function HistoryPanel() {
  const { snapshot, source } = useStore();
  const [q, setQ] = useState('');
  const [action, setAction] = useState<AuditAction | ''>('');
  const [limit, setLimit] = useState(100);
  const logs = useMemo(
    () => (snapshot?.logs ?? []).filter((l) => (!action || l.action === action) && (!q.trim() || `${l.detail ?? ''}${l.actor ?? ''}`.includes(q.trim()))),
    [snapshot, q, action],
  );
  return (
    <Card title={`ประวัติการเปลี่ยนแปลง (${logs.length} รายการ)`}>
      <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_200px]">
        <input className="input" placeholder="ค้นหาชื่อ / กีฬา / ผู้บันทึก…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" value={action} onChange={(e) => setAction(e.target.value as AuditAction | '')}>
          <option value="">ทุกประเภทการกระทำ</option>
          {(Object.keys(ACTION_LABEL) as AuditAction[]).map((a) => <option key={a} value={a}>{ACTION_LABEL[a]}</option>)}
        </select>
      </div>
      {logs.length === 0 ? (
        <EmptyState icon={<History className="h-8 w-8" />} title="ยังไม่มีประวัติ" text="ทุกการสมัคร ยกเลิก ย้าย และแก้ไขจะถูกบันทึกไว้ที่นี่" />
      ) : (
        <>
          <ul className="divide-y divide-gray-100 text-sm">
            {logs.slice(0, limit).map((l) => (
              <li key={l.id} className="grid gap-x-3 py-2 sm:grid-cols-[150px_110px_1fr_auto]">
                <span className="text-gray-500">{fmtDateTime(l.created_at)}</span>
                <span className="font-semibold">{ACTION_LABEL[l.action] ?? l.action}</span>
                <span className="text-gray-800">{l.detail}</span>
                <span className="text-gray-400">โดย {l.actor}</span>
              </li>
            ))}
          </ul>
          {logs.length > limit && <Button variant="ghost" className="mt-2" onClick={() => setLimit((n) => n + 200)}>แสดงเพิ่ม</Button>}
          {source.mode === 'supabase' && <p className="mt-2 text-xs text-gray-400">แสดงประวัติล่าสุดสูงสุด 1,000 รายการ (ข้อมูลทั้งหมดอยู่ในตาราง audit_logs)</p>}
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- Reset
function ResetPanel() {
  const { run, source, view, refresh } = useStore();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const total = view?.summary.totalEntries ?? 0;

  const resetRegs = async () => {
    const ok = await confirm({
      title: 'รีเซ็ตการสมัครทั้งหมด',
      danger: true,
      requireText: 'RESET',
      confirmText: 'รีเซ็ตการสมัคร',
      message: (
        <>
          <p>การสมัครที่ใช้งานอยู่ทั้งหมด <b>{total}</b> รายการจะถูกเปลี่ยนสถานะเป็น “ยกเลิก”</p>
          <p className="text-gray-500">ข้อมูลสมาชิก ประเภทกีฬา และประวัติทั้งหมดจะยังอยู่ครบ (ไม่ถูกลบ)</p>
        </>
      ),
    });
    if (!ok) return;
    setBusy(true);
    await run((src, actor) => src.resetRegistrations(actor), (n) => `รีเซ็ตแล้ว (ยกเลิก ${n} รายการ)`);
    setBusy(false);
  };

  const factory = async () => {
    const ok = await confirm({
      title: 'คืนค่าข้อมูลตั้งต้น (Demo)',
      danger: true,
      requireText: 'RESET',
      confirmText: 'คืนค่าข้อมูลตั้งต้น',
      message: <p>ล้างข้อมูล Demo ในเบราว์เซอร์นี้ทั้งหมด (รวมประวัติ) แล้วกลับเป็นสมาชิก 23 คน และกีฬา 5 ประเภทตั้งต้น</p>,
    });
    if (!ok || !source.factoryReset) return;
    await source.factoryReset();
    await refresh();
  };

  return (
    <Card title="รีเซ็ตข้อมูล (สำหรับผู้ดูแลระบบ)">
      <div className="space-y-4">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="font-semibold text-red-800">รีเซ็ตการสมัครทั้งหมด</div>
          <p className="mt-1 text-sm text-red-700">ใช้เมื่อต้องการเริ่มจัดตัวใหม่ทั้งหมด ต้องพิมพ์ RESET เพื่อยืนยัน ประวัติยังตรวจสอบย้อนหลังได้</p>
          <Button variant="danger" className="mt-3" onClick={resetRegs} loading={busy} disabled={total === 0}>
            <RotateCcw className="h-4 w-4" /> รีเซ็ตการสมัคร ({total} รายการ)
          </Button>
        </div>
        {source.mode === 'demo' && (
          <div className="rounded-xl border border-gray-200 p-4">
            <div className="font-semibold">คืนค่าข้อมูล Demo ตั้งต้น</div>
            <p className="mt-1 text-sm text-gray-600">มีเฉพาะโหมด Demo — ล้างข้อมูลในเบราว์เซอร์นี้และโหลดรายชื่อตั้งต้นใหม่</p>
            <Button variant="outline" className="mt-3" onClick={factory}>คืนค่าข้อมูลตั้งต้น</Button>
          </div>
        )}
      </div>
    </Card>
  );
}
