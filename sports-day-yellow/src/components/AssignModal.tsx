import { Check, Search, UserCheck } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { matchesName } from '../lib/view';
import { Button, cx, EmptyState, Modal, ProgressBar, SportStatusBadge } from './ui';
import { useRegistrationActions } from './useRegistrationActions';

/** "จัดตัวนักกีฬา": choose a sport, tick members, save. Already-registered members are locked. */
export function AssignModal({ open, onClose, initialSportId }: { open: boolean; onClose: () => void; initialSportId?: string }) {
  const { view } = useStore();
  const { register } = useRegistrationActions();
  const [sportId, setSportId] = useState(initialSportId ?? '');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [onlyFree, setOnlyFree] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false); // guards against double clicks before React re-renders

  useEffect(() => {
    if (open) {
      setSportId(initialSportId ?? view?.sports[0]?.sport.id ?? '');
      setSelected(new Set());
      setQ('');
      setOnlyFree(false);
    }
  }, [open, initialSportId]);

  const sv = view?.sports.find((s) => s.sport.id === sportId);
  const registeredIds = useMemo(() => new Set(sv?.athletes.map((a) => a.member.id)), [sv]);

  // someone else may register a ticked member meanwhile (realtime) — drop them from the selection
  useEffect(() => {
    setSelected((cur) => {
      const next = new Set([...cur].filter((id) => !registeredIds.has(id)));
      return next.size === cur.size ? cur : next;
    });
  }, [registeredIds]);

  if (!view) return null;
  const list = view.members.filter((m) => matchesName(m.member.full_name, m.member.member_code, q) && (!onlyFree || !registeredIds.has(m.member.id)));
  const nSel = selected.size;
  const after = (sv?.count ?? 0) + nSel;
  const willOver = !!sv && after > sv.target;

  const toggle = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectableVisible = list.filter((m) => !registeredIds.has(m.member.id)).map((m) => m.member.id);
  const allVisibleSelected = selectableVisible.length > 0 && selectableVisible.every((id) => selected.has(id));

  const save = async () => {
    if (!sv || nSel === 0 || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const ok = await register(sv.sport, [...selected]);
      if (ok) onClose();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={saving}
      size="lg"
      title="จัดตัวนักกีฬา"
      subtitle="เลือกประเภทกีฬา แล้วติ๊กเลือกสมาชิกที่ต้องการลงแข่งขัน (เลือกได้หลายคน)"
      footer={
        <>
          <span className={cx('mr-auto text-sm', willOver ? 'font-semibold text-orange-600' : 'text-gray-600')}>
            {nSel > 0 ? `หลังบันทึก ${after} / ${sv?.target ?? 0} คน${willOver ? ' (เกินเป้าหมาย)' : ''}` : 'ยังไม่ได้เลือกสมาชิก'}
          </span>
          <Button variant="ghost" onClick={onClose} disabled={saving}>ยกเลิก</Button>
          <Button onClick={save} disabled={nSel === 0 || !sv} loading={saving}>
            <UserCheck className="h-4 w-4" /> บันทึก (เพิ่ม {nSel} คน)
          </Button>
        </>
      }
    >
      {view.sports.length === 0 ? (
        <EmptyState title="ยังไม่มีประเภทกีฬาที่เปิดใช้งาน" text="เพิ่มกีฬาได้ที่หน้า จัดการนักกีฬา" />
      ) : (
        <div className="space-y-4">
          <label className="block">
            <span className="text-sm font-semibold text-gray-700">1. เลือกประเภทกีฬา</span>
            <select
              className="input mt-1"
              value={sportId}
              onChange={(e) => { setSportId(e.target.value); setSelected(new Set()); }}
              disabled={saving}
            >
              {view.sports.map((s) => (
                <option key={s.sport.id} value={s.sport.id}>
                  {s.sport.sport_name} — {s.count}/{s.target} คน
                </option>
              ))}
            </select>
          </label>

          {sv && (
            <div className="grid grid-cols-3 gap-2 rounded-xl bg-ink p-3 text-center text-white">
              <div><div className="text-xs text-gray-300">สมัครแล้ว</div><div className="text-xl font-bold">{sv.count}</div></div>
              <div><div className="text-xs text-gray-300">เลือกแล้ว</div><div className="text-xl font-bold text-brand-400">{nSel} คน</div></div>
              <div><div className="text-xs text-gray-300">เป้าหมาย</div><div className="text-xl font-bold">{sv.target} คน</div></div>
              <div className="col-span-3 flex items-center gap-2">
                <div className="flex-1"><ProgressBar percent={Math.min(100, Math.round((after / Math.max(1, sv.target)) * 100))} status={after > sv.target ? 'over' : after === sv.target ? 'full' : 'open'} /></div>
                <SportStatusBadge status={sv.status} />
              </div>
            </div>
          )}

          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-gray-700">2. เลือกสมาชิก</span>
              <label className="ml-auto flex items-center gap-1.5 text-sm text-gray-600">
                <input type="checkbox" className="h-4 w-4 accent-brand-500" checked={onlyFree} onChange={(e) => setOnlyFree(e.target.checked)} />
                เฉพาะที่ยังไม่สมัครกีฬานี้
              </label>
            </div>
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input className="input pl-9" placeholder="ค้นหาชื่อหรือรหัสสมาชิก…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {selectableVisible.length > 0 && (
              <button
                className="mb-2 text-sm font-semibold text-brand-700 hover:underline"
                onClick={() =>
                  setSelected((cur) => {
                    const next = new Set(cur);
                    selectableVisible.forEach((id) => (allVisibleSelected ? next.delete(id) : next.add(id)));
                    return next;
                  })
                }
              >
                {allVisibleSelected ? 'ยกเลิกการเลือกที่แสดงอยู่' : `เลือกทั้งหมดที่แสดง (${selectableVisible.length} คน)`}
              </button>
            )}
            {list.length === 0 ? (
              <EmptyState title="ไม่พบสมาชิกที่ค้นหา" />
            ) : (
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {list.map((m) => {
                  const done = registeredIds.has(m.member.id);
                  const checked = done || selected.has(m.member.id);
                  return (
                    <li key={m.member.id}>
                      <label
                        className={cx(
                          'flex min-h-[48px] cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition',
                          done && 'cursor-not-allowed border-green-200 bg-green-50',
                          !done && checked && 'border-brand-400 bg-brand-50 ring-1 ring-brand-400',
                          !done && !checked && 'border-gray-200 hover:border-gray-300 hover:bg-gray-50',
                        )}
                      >
                        <input
                          type="checkbox"
                          className="h-5 w-5 shrink-0 accent-brand-500"
                          checked={checked}
                          disabled={done || saving}
                          onChange={() => toggle(m.member.id)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink">{m.member.full_name}</span>
                          <span className="block text-xs text-gray-500">
                            {m.member.member_code} · ลงแข่ง {m.count} ประเภท
                          </span>
                        </span>
                        {done && (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-600 px-2 py-0.5 text-xs font-semibold text-white">
                            <Check className="h-3 w-3" /> สมัครแล้ว
                          </span>
                        )}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
