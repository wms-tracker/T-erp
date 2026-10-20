import { CheckCircle2, ClipboardList, Eye, ListChecks, Printer, Search, Trophy, UserPlus, Users, UserX } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useStore } from '../store';
import { printSport } from '../lib/reports';
import { matchesName, MEMBER_STATUS_LABEL, type MemberView, type SportView } from '../lib/view';
import { Button, cx, EmptyState, MemberStatusBadge, ProgressBar, SportStatusBadge } from '../components/ui';

type Filter = 'all' | 'registered' | 'none' | 'one' | 'multi';
const FILTERS: { key: Filter; label: string; test: (m: MemberView) => boolean }[] = [
  { key: 'all', label: 'ทั้งหมด', test: () => true },
  { key: 'registered', label: 'ลงแข่งขันแล้ว', test: (m) => m.count > 0 },
  { key: 'none', label: 'ยังไม่ได้ลงแข่งขัน', test: (m) => m.count === 0 },
  { key: 'one', label: 'ลงแข่งขัน 1 ประเภท', test: (m) => m.count === 1 },
  { key: 'multi', label: 'มากกว่า 1 ประเภท', test: (m) => m.count > 1 },
];

export function Dashboard({ onAssign, onMember, onSportList }: { onAssign: (sportId?: string) => void; onMember: (id: string) => void; onSportList: (id: string) => void }) {
  const { view } = useStore();
  if (!view) return null;
  const s = view.summary;
  return (
    <div className="space-y-6">
      {/* A: summary */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard icon={<Users />} label="สมาชิกสีเหลืองทั้งหมด" value={s.totalMembers} unit="คน" dark />
        <StatCard icon={<CheckCircle2 />} label="ลงแข่งขันอย่างน้อย 1 ประเภท" value={s.registeredMembers} unit="คน" />
        <StatCard icon={<UserX />} label="ยังไม่ได้ลงแข่งขัน" value={s.unregisteredMembers} unit="คน" warn={s.unregisteredMembers > 0} />
        <StatCard icon={<ClipboardList />} label="รายการลงแข่งขันทั้งหมด" value={s.totalEntries} unit="รายการ" />
        <StatCard icon={<Trophy />} label="กีฬาที่ผู้สมัครครบเป้าหมาย" value={`${s.fullSports}/${s.totalSports}`} unit="ประเภท" className="col-span-2 md:col-span-1" />
      </section>

      {/* B: members */}
      <MemberTable members={view.members} onMember={onMember} />

      {/* C: sports */}
      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-bold text-ink">ผู้เข้าแข่งขันแยกตามประเภทกีฬา</h2>
          <Button className="ml-auto" onClick={() => onAssign()}>
            <UserPlus className="h-4 w-4" /> จัดตัวนักกีฬา
          </Button>
        </div>
        {view.sports.length === 0 ? (
          <EmptyState title="ยังไม่มีประเภทกีฬา" text="เพิ่มประเภทกีฬาได้ที่หน้า จัดการนักกีฬา" />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {view.sports.map((sv) => (
              <SportCard key={sv.sport.id} sv={sv} onAssign={() => onAssign(sv.sport.id)} onList={() => onSportList(sv.sport.id)} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({ icon, label, value, unit, dark, warn, className }: { icon: ReactNode; label: string; value: ReactNode; unit: string; dark?: boolean; warn?: boolean; className?: string }) {
  return (
    <div className={cx('rounded-2xl p-4 shadow-sm ring-1', dark ? 'bg-ink text-white ring-ink' : 'bg-white ring-gray-200', className)}>
      <div className={cx('mb-2 flex h-9 w-9 items-center justify-center rounded-lg [&>svg]:h-5 [&>svg]:w-5', dark ? 'bg-brand-400 text-ink' : warn ? 'bg-orange-100 text-orange-600' : 'bg-brand-100 text-brand-700')}>{icon}</div>
      <div className={cx('text-sm leading-tight', dark ? 'text-gray-300' : 'text-gray-500')}>{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-3xl font-extrabold tracking-tight">{value}</span>
        <span className={cx('text-sm', dark ? 'text-gray-300' : 'text-gray-500')}>{unit}</span>
      </div>
    </div>
  );
}

function MemberTable({ members, onMember }: { members: MemberView[]; onMember: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.key, members.filter(f.test).length])), [members]);
  const test = FILTERS.find((f) => f.key === filter)!.test;
  const rows = members.filter((m) => test(m) && matchesName(m.member.full_name, m.member.member_code, q));

  return (
    <section className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
      <div className="flex flex-col gap-3 border-b border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-bold text-ink">รายชื่อสมาชิกสีเหลือง</h2>
          <span className="text-sm text-gray-500">แสดง {rows.length} จาก {members.length} คน</span>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9" placeholder="ค้นหาชื่อ นามสกุล หรือรหัสสมาชิก…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cx(
                'shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition',
                filter === f.key ? 'bg-ink text-white ring-ink' : 'bg-white text-gray-700 ring-gray-300 hover:bg-gray-50',
              )}
            >
              {f.label} <span className={filter === f.key ? 'text-brand-400' : 'text-gray-400'}>({counts[f.key]})</span>
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="p-4"><EmptyState title="ไม่พบสมาชิกตามเงื่อนไข" text="ลองเปลี่ยนคำค้นหาหรือตัวกรอง" /></div>
      ) : (
        <>
          {/* desktop / tablet table */}
          <div className="hidden md:block">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="w-14 px-4 py-2.5 text-center">ลำดับ</th>
                  <th className="px-3 py-2.5">ชื่อ-นามสกุล</th>
                  <th className="px-3 py-2.5">ประเภทกีฬาที่ลงแข่งขัน</th>
                  <th className="w-20 px-3 py-2.5 text-center">จำนวน</th>
                  <th className="w-44 px-3 py-2.5">สถานะการสมัคร</th>
                  <th className="w-28 px-4 py-2.5 text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((m) => (
                  <tr key={m.member.id} className="hover:bg-brand-50/50">
                    <td className="px-4 py-2.5 text-center text-gray-500">{members.indexOf(m) + 1}</td>
                    <td className="px-3 py-2.5">
                      <button className="text-left font-medium text-ink hover:text-brand-700 hover:underline" onClick={() => onMember(m.member.id)}>
                        {m.member.full_name}
                      </button>
                      <div className="text-xs text-gray-400">{m.member.member_code}</div>
                    </td>
                    <td className="px-3 py-2.5"><SportChips m={m} /></td>
                    <td className="px-3 py-2.5 text-center font-semibold">{m.count}</td>
                    <td className="px-3 py-2.5"><MemberStatusBadge status={m.status} label={MEMBER_STATUS_LABEL[m.status]} /></td>
                    <td className="px-4 py-2.5 text-right">
                      <Button size="sm" variant="outline" onClick={() => onMember(m.member.id)}>
                        <ListChecks className="h-3.5 w-3.5" /> จัดการ
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* mobile cards */}
          <ul className="divide-y divide-gray-100 md:hidden">
            {rows.map((m) => (
              <li key={m.member.id}>
                <button className="flex w-full items-start gap-3 px-4 py-3 text-left active:bg-brand-50" onClick={() => onMember(m.member.id)}>
                  <span className="mt-0.5 w-6 shrink-0 text-right text-sm text-gray-400">{members.indexOf(m) + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-ink">{m.member.full_name}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                      <MemberStatusBadge status={m.status} label={`${MEMBER_STATUS_LABEL[m.status]}${m.count ? ` (${m.count})` : ''}`} />
                    </span>
                    {m.count > 0 && <span className="mt-1.5 block"><SportChips m={m} /></span>}
                  </span>
                  <ListChecks className="mt-1 h-5 w-5 shrink-0 text-gray-400" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function SportChips({ m }: { m: MemberView }) {
  if (m.count === 0) return <span className="text-gray-400">-</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {m.sports.map((s) => (
        <span key={s.id} className="rounded-md bg-brand-100 px-1.5 py-0.5 text-xs font-medium text-brand-900">{s.sport_name}</span>
      ))}
    </span>
  );
}

const PREVIEW = 8;
function SportCard({ sv, onAssign, onList }: { sv: SportView; onAssign: () => void; onList: () => void }) {
  return (
    <article className="flex flex-col rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
      <div className="rounded-t-2xl border-b-4 border-brand-400 bg-ink px-4 py-3 text-white">
        <div className="flex items-start gap-2">
          <h3 className="flex-1 text-lg font-bold">{sv.sport.sport_name}</h3>
          <SportStatusBadge status={sv.status} />
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-sm text-gray-300">ผู้สมัคร</span>
          <span className="text-3xl font-extrabold text-brand-400">{sv.count}</span>
          <span className="text-lg text-gray-300">/ {sv.target} คน</span>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span className={cx('font-semibold', sv.status === 'over' ? 'text-orange-600' : sv.missing === 0 ? 'text-green-700' : 'text-gray-700')}>
              {sv.status === 'over' ? `เกินเป้าหมาย ${sv.over} คน` : sv.missing === 0 ? 'ครบจำนวนแล้ว' : `ยังขาดอีก ${sv.missing} คน`}
            </span>
            <span className="text-gray-500">{sv.percent}%</span>
          </div>
          <ProgressBar percent={sv.percent} status={sv.status} />
        </div>
        {sv.athletes.length === 0 ? (
          <EmptyState title="ยังไม่มีผู้สมัคร" text="กด “จัดตัวนักกีฬา” เพื่อเลือกสมาชิก" />
        ) : (
          <ol className="space-y-1 text-sm">
            {sv.athletes.slice(0, PREVIEW).map((a, i) => (
              <li key={a.member.id} className="flex gap-2">
                <span className="w-6 shrink-0 text-right text-gray-400">{i + 1}.</span>
                <span className="truncate">{a.member.full_name}</span>
              </li>
            ))}
            {sv.athletes.length > PREVIEW && (
              <li>
                <button className="pl-8 text-sm font-semibold text-brand-700 hover:underline" onClick={onList}>
                  + อีก {sv.athletes.length - PREVIEW} คน
                </button>
              </li>
            )}
          </ol>
        )}
        <div className="mt-auto grid grid-cols-1 gap-2 pt-1 sm:grid-cols-3">
          <Button onClick={onAssign} className="sm:col-span-3"><UserPlus className="h-4 w-4" /> จัดตัวนักกีฬา</Button>
          <Button variant="outline" size="sm" onClick={onList} className="sm:col-span-2"><Eye className="h-3.5 w-3.5" /> ดูรายชื่อทั้งหมด</Button>
          <Button variant="outline" size="sm" onClick={() => printSport(sv)}><Printer className="h-3.5 w-3.5" /> พิมพ์รายชื่อ</Button>
        </div>
      </div>
    </article>
  );
}
