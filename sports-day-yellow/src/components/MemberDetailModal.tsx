import { History, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useStore } from '../store';
import { ACTION_LABEL, fmtDateTime, MEMBER_STATUS_LABEL } from '../lib/view';
import { Button, MemberStatusBadge, Modal, SportStatusBadge } from './ui';
import { useRegistrationActions } from './useRegistrationActions';

/** Member detail: sports registered + add/cancel per sport + this member's history. */
export function MemberDetailModal({ memberId, onClose }: { memberId: string | null; onClose: () => void }) {
  const { view, snapshot } = useStore();
  const { register, cancel } = useRegistrationActions();
  const [busySport, setBusySport] = useState<string | null>(null);
  const mv = view?.members.find((m) => m.member.id === memberId);
  if (!memberId || !view || !mv) return null;

  const history = (snapshot?.logs ?? []).filter((l) => l.member_id === memberId).slice(0, 15);

  const act = async (sportId: string, fn: () => Promise<boolean>) => {
    if (busySport) return; // one action at a time
    setBusySport(sportId);
    try {
      await fn();
    } finally {
      setBusySport(null);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      busy={!!busySport}
      title={mv.member.full_name}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          รหัส {mv.member.member_code} · ลงแข่ง {mv.count} ประเภท <MemberStatusBadge status={mv.status} label={MEMBER_STATUS_LABEL[mv.status]} />
        </span>
      }
      footer={<Button variant="outline" onClick={onClose} disabled={!!busySport}>ปิด</Button>}
    >
      <h3 className="mb-2 text-sm font-semibold text-gray-700">ประเภทกีฬา (กดเพิ่ม หรือ ยกเลิก)</h3>
      <ul className="space-y-2">
        {view.sports.map((sv) => {
          const joined = mv.sports.some((s) => s.id === sv.sport.id);
          return (
            <li key={sv.sport.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${joined ? 'border-brand-300 bg-brand-50' : 'border-gray-200'}`}>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-ink">{sv.sport.sport_name}</div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                  {sv.count}/{sv.target} คน <SportStatusBadge status={sv.status} />
                </div>
              </div>
              {joined ? (
                <Button size="sm" variant="outline" className="text-red-600" loading={busySport === sv.sport.id} disabled={!!busySport} onClick={() => act(sv.sport.id, () => cancel(mv.member, sv.sport))}>
                  <X className="h-3.5 w-3.5" /> ยกเลิก
                </Button>
              ) : (
                <Button size="sm" loading={busySport === sv.sport.id} disabled={!!busySport} onClick={() => act(sv.sport.id, () => register(sv.sport, [mv.member.id]))}>
                  <Plus className="h-3.5 w-3.5" /> เพิ่ม
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      <h3 className="mb-2 mt-5 flex items-center gap-1.5 text-sm font-semibold text-gray-700">
        <History className="h-4 w-4" /> ประวัติการเปลี่ยนแปลง
      </h3>
      {history.length === 0 ? (
        <p className="text-sm text-gray-500">ยังไม่มีประวัติ</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {history.map((l) => (
            <li key={l.id} className="flex flex-wrap gap-x-2 border-b border-gray-100 pb-1">
              <span className="text-gray-500">{fmtDateTime(l.created_at)}</span>
              <span className="font-semibold">{ACTION_LABEL[l.action]}</span>
              <span className="text-gray-700">{l.detail}</span>
              <span className="text-gray-400">โดย {l.actor}</span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
