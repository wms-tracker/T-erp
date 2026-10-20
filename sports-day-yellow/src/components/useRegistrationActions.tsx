import { useCallback } from 'react';
import { useStore } from '../store';
import type { Member, Sport } from '../lib/types';
import { useConfirm } from './ui';

/** Register / cancel / move with the confirmation rules from the spec (over-target warning, cancel confirm). */
export function useRegistrationActions() {
  const { run, view } = useStore();
  const confirm = useConfirm();

  const register = useCallback(
    async (sport: Sport, memberIds: string[]) => {
      const sv = view?.sports.find((x) => x.sport.id === sport.id);
      const current = sv?.count ?? 0;
      const after = current + memberIds.length;
      let allowOver = false;
      if (after > sport.target_count) {
        const ok = await confirm({
          title: 'จำนวนเกินเป้าหมาย',
          danger: true,
          confirmText: 'ยืนยันเพิ่มเกินเป้าหมาย',
          message: (
            <>
              <p>
                กีฬา <b>{sport.sport_name}</b> มีเป้าหมาย <b>{sport.target_count}</b> คน ปัจจุบันมี <b>{current}</b> คน
              </p>
              <p>
                หากบันทึกจะมีผู้สมัคร <b className="text-red-600">{after}</b> คน (เกิน {after - sport.target_count} คน) ต้องการยืนยันหรือไม่?
              </p>
            </>
          ),
        });
        if (!ok) return false;
        allowOver = true;
      }
      const res = await run(
        (src, actor) => src.registerMembers(sport.id, memberIds, actor, allowOver),
        (r) => `บันทึกสำเร็จ: เพิ่ม ${r.added} คน ลง ${sport.sport_name}${r.skipped ? ` (ข้าม ${r.skipped} คนที่สมัครแล้ว)` : ''}`,
      );
      return res.ok;
    },
    [run, view, confirm],
  );

  const cancel = useCallback(
    async (member: Member, sport: Sport) => {
      const ok = await confirm({
        title: 'ยืนยันยกเลิกการสมัคร',
        danger: true,
        confirmText: 'ยกเลิกการสมัคร',
        message: (
          <>
            <p>
              ยกเลิกการสมัครของ <b>{member.full_name}</b> ในกีฬา <b>{sport.sport_name}</b> ใช่หรือไม่?
            </p>
            <p className="text-gray-500">ข้อมูลสมาชิกจะไม่ถูกลบ และประวัติการสมัครจะถูกเก็บไว้</p>
          </>
        ),
      });
      if (!ok) return false;
      const res = await run((src, actor) => src.cancelRegistration(member.id, sport.id, actor), `ยกเลิก ${member.full_name} จาก ${sport.sport_name} แล้ว`);
      return res.ok;
    },
    [run, confirm],
  );

  const move = useCallback(
    async (member: Member, from: Sport, to: Sport) => {
      const toView = view?.sports.find((x) => x.sport.id === to.id);
      const after = (toView?.count ?? 0) + 1;
      const over = after > to.target_count;
      const ok = await confirm({
        title: 'ยืนยันย้ายประเภทกีฬา',
        danger: over,
        confirmText: over ? 'ยืนยันย้าย (เกินเป้าหมาย)' : 'ย้ายกีฬา',
        message: (
          <>
            <p>
              ย้าย <b>{member.full_name}</b> จาก <b>{from.sport_name}</b> ไป <b>{to.sport_name}</b>
            </p>
            {over && (
              <p className="text-red-600">
                {to.sport_name} จะมีผู้สมัคร {after} คน เกินเป้าหมาย {to.target_count} คน
              </p>
            )}
          </>
        ),
      });
      if (!ok) return false;
      const res = await run((src, actor) => src.moveRegistration(member.id, from.id, to.id, actor, over), `ย้าย ${member.full_name} ไป ${to.sport_name} แล้ว`);
      return res.ok;
    },
    [run, view, confirm],
  );

  return { register, cancel, move };
}
