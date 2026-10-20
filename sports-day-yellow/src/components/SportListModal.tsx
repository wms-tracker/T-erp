import { Download, Printer, Users, X } from 'lucide-react';
import { useState } from 'react';
import { useStore } from '../store';
import { downloadCsv, fileSafe, printSport, sportCsvRows } from '../lib/reports';
import { fmtDateTime } from '../lib/view';
import { Button, EmptyState, Modal, ProgressBar, SportStatusBadge } from './ui';
import { useRegistrationActions } from './useRegistrationActions';

/** "ดูรายชื่อทั้งหมด" for one sport, with cancel per athlete, CSV and print. */
export function SportListModal({ sportId, onClose, onAssign }: { sportId: string | null; onClose: () => void; onAssign: (id: string) => void }) {
  const { view } = useStore();
  const { cancel } = useRegistrationActions();
  const [busy, setBusy] = useState<string | null>(null);
  const sv = view?.sports.find((s) => s.sport.id === sportId);
  if (!sportId || !sv) return null;

  return (
    <Modal
      open
      onClose={onClose}
      busy={!!busy}
      size="lg"
      title={sv.sport.sport_name}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          ผู้สมัคร {sv.count} / {sv.target} คน · {sv.over ? `เกิน ${sv.over} คน` : `ยังขาด ${sv.missing} คน`} <SportStatusBadge status={sv.status} />
        </span>
      }
      footer={
        <>
          <Button variant="outline" onClick={() => downloadCsv(`รายชื่อ-${fileSafe(sv.sport.sport_name)}-2569.csv`, sportCsvRows(sv))}>
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" onClick={() => printSport(sv)}>
            <Printer className="h-4 w-4" /> พิมพ์รายชื่อ
          </Button>
          <Button onClick={() => onAssign(sv.sport.id)}>+ จัดตัวนักกีฬา</Button>
        </>
      }
    >
      <div className="mb-4"><ProgressBar percent={sv.percent} status={sv.status} /></div>
      {sv.athletes.length === 0 ? (
        <EmptyState icon={<Users className="h-8 w-8" />} title="ยังไม่มีผู้สมัคร" text="กด “จัดตัวนักกีฬา” เพื่อเลือกสมาชิก" />
      ) : (
        <ol className="divide-y divide-gray-100">
          {sv.athletes.map((a, i) => (
            <li key={a.member.id} className="flex items-center gap-3 py-2">
              <span className="w-7 text-right font-semibold text-gray-500">{i + 1}.</span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{a.member.full_name}</div>
                <div className="text-xs text-gray-500">{a.member.member_code} · สมัครเมื่อ {fmtDateTime(a.reg.registered_at)}{a.reg.created_by ? ` โดย ${a.reg.created_by}` : ''}</div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-600"
                loading={busy === a.member.id}
                disabled={!!busy}
                onClick={async () => {
                  setBusy(a.member.id);
                  try { await cancel(a.member, sv.sport); } finally { setBusy(null); }
                }}
              >
                <X className="h-3.5 w-3.5" /> ยกเลิก
              </Button>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}
