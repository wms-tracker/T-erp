import { Download, FileSpreadsheet, Printer } from 'lucide-react';
import { useStore } from '../store';
import { allSportsCsvRows, downloadCsv, fileSafe, membersCsvRows, printAllSports, printMembers, printSport, printSummary, sportCsvRows } from '../lib/reports';
import { SPORT_STATUS_LABEL } from '../lib/view';
import { Button, ProgressBar, SportStatusBadge } from '../components/ui';

export function Reports() {
  const { view } = useStore();
  if (!view) return null;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-ink">รายงานและการส่งออก</h1>
        <p className="text-sm text-gray-500">ไฟล์ CSV เปิดใน Excel ภาษาไทยได้ทันที · การพิมพ์รองรับกระดาษ A4 (เลือก “Save as PDF” เพื่อบันทึกเป็น PDF)</p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ExportCard title="สรุปภาพรวมสีเหลือง" text="ตัวเลขสรุป ความคืบหน้าแต่ละกีฬา และผู้ที่ยังไม่ลงแข่ง" onPrint={() => printSummary(view)} />
        <ExportCard
          title="รายชื่อสมาชิกทั้งหมด"
          text={`${view.members.length} คน พร้อมกีฬาที่ลงแข่งขัน`}
          onPrint={() => printMembers(view)}
          onCsv={() => downloadCsv('สมาชิกสีเหลือง-2569.csv', membersCsvRows(view))}
        />
        <ExportCard
          title="รายชื่อทุกประเภทกีฬา"
          text="แยกหน้าละ 1 กีฬา พร้อมช่องลงชื่อ"
          onPrint={() => printAllSports(view)}
          onCsv={() => downloadCsv('รายชื่อนักกีฬาทุกประเภท-2569.csv', allSportsCsvRows(view))}
        />
        <div className="rounded-2xl bg-ink p-4 text-white">
          <div className="text-sm text-gray-300">สรุปตอนนี้</div>
          <div className="mt-1 text-2xl font-extrabold text-brand-400">{view.summary.totalEntries} รายการ</div>
          <div className="text-sm text-gray-300">
            ลงแข่ง {view.summary.registeredMembers}/{view.summary.totalMembers} คน · ครบเป้า {view.summary.fullSports}/{view.summary.totalSports} กีฬา
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-bold text-ink">รายงานแยกตามประเภทกีฬา</h2>
        {view.sports.map((sv) => (
          <article key={sv.sport.id} className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
            <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 p-4">
              <h3 className="text-lg font-bold">{sv.sport.sport_name}</h3>
              <SportStatusBadge status={sv.status} />
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="outline" onClick={() => downloadCsv(`รายชื่อ-${fileSafe(sv.sport.sport_name)}-2569.csv`, sportCsvRows(sv))}>
                  <Download className="h-3.5 w-3.5" /> CSV
                </Button>
                <Button size="sm" variant="dark" onClick={() => printSport(sv)}>
                  <Printer className="h-3.5 w-3.5" /> พิมพ์
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 p-4 text-center text-sm">
              <div className="rounded-lg bg-gray-50 p-2"><div className="text-gray-500">เป้าหมาย</div><div className="text-xl font-bold">{sv.target}</div></div>
              <div className="rounded-lg bg-brand-50 p-2"><div className="text-gray-500">สมัครแล้ว</div><div className="text-xl font-bold">{sv.count}</div></div>
              <div className="rounded-lg bg-gray-50 p-2"><div className="text-gray-500">{sv.over ? 'เกิน' : 'ยังขาด'}</div><div className="text-xl font-bold">{sv.over || sv.missing}</div></div>
              <div className="col-span-3"><ProgressBar percent={sv.percent} status={sv.status} /></div>
            </div>
            <div className="overflow-x-auto px-4 pb-4">
              <table className="w-full min-w-[420px] text-sm">
                <thead className="bg-gray-50 text-left text-gray-600">
                  <tr><th className="w-14 px-2 py-2 text-center">ลำดับ</th><th className="w-24 px-2 py-2">รหัสสมาชิก</th><th className="px-2 py-2">ชื่อ-นามสกุล</th><th className="w-32 px-2 py-2">สถานะการสมัคร</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sv.athletes.length === 0 ? (
                    <tr><td colSpan={4} className="px-2 py-4 text-center text-gray-400">ยังไม่มีผู้สมัคร ({SPORT_STATUS_LABEL[sv.status]})</td></tr>
                  ) : (
                    sv.athletes.map((a, i) => (
                      <tr key={a.member.id}>
                        <td className="px-2 py-1.5 text-center">{i + 1}</td>
                        <td className="px-2 py-1.5 font-mono text-xs">{a.member.member_code}</td>
                        <td className="px-2 py-1.5">{a.member.full_name}</td>
                        <td className="px-2 py-1.5 text-green-700">สมัครแล้ว</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

function ExportCard({ title, text, onPrint, onCsv }: { title: string; text: string; onPrint: () => void; onCsv?: () => void }) {
  return (
    <div className="flex flex-col rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
      <FileSpreadsheet className="mb-2 h-6 w-6 text-brand-600" />
      <div className="font-bold">{title}</div>
      <div className="mb-3 text-sm text-gray-500">{text}</div>
      <div className="mt-auto flex gap-2">
        <Button size="sm" variant="dark" onClick={onPrint}><Printer className="h-3.5 w-3.5" /> พิมพ์</Button>
        {onCsv && <Button size="sm" variant="outline" onClick={onCsv}><Download className="h-3.5 w-3.5" /> CSV / Excel</Button>}
      </div>
    </div>
  );
}
