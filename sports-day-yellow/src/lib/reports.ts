/** CSV export (UTF-8 BOM so Excel shows Thai correctly) and print layouts (hidden iframe). */
import { MEMBER_STATUS_LABEL, SPORT_STATUS_LABEL, type AppView, type SportView } from './view';

export const EVENT_TITLE = 'กีฬาสีเหลือง Horizon Group ประจำปี 2569';
const REG_LABEL = 'สมัครแล้ว';

// ---------------------------------------------------------------- CSV
const cell = (v: string | number) => {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(rows: (string | number)[][]) {
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function sportCsvRows(v: SportView): (string | number)[][] {
  return [
    ['ชื่อกีฬา', v.sport.sport_name],
    ['จำนวนเป้าหมาย', v.target],
    ['จำนวนสมัครแล้ว', v.count],
    ['จำนวนที่ยังขาด', v.missing],
    ['สถานะ', SPORT_STATUS_LABEL[v.status]],
    [],
    ['ลำดับ', 'รหัสสมาชิก', 'ชื่อ-นามสกุล', 'สถานะการสมัคร'],
    ...v.athletes.map((a, i) => [i + 1, a.member.member_code, a.member.full_name, REG_LABEL]),
  ];
}

export function allSportsCsvRows(view: AppView): (string | number)[][] {
  const rows: (string | number)[][] = [
    ['ชื่อกีฬา', 'จำนวนเป้าหมาย', 'จำนวนสมัครแล้ว', 'จำนวนที่ยังขาด', 'ลำดับ', 'รหัสสมาชิก', 'ชื่อ-นามสกุล', 'สถานะการสมัคร'],
  ];
  for (const v of view.sports) {
    if (v.athletes.length === 0) rows.push([v.sport.sport_name, v.target, v.count, v.missing, '', '', '(ยังไม่มีผู้สมัคร)', '']);
    v.athletes.forEach((a, i) =>
      rows.push([v.sport.sport_name, v.target, v.count, v.missing, i + 1, a.member.member_code, a.member.full_name, REG_LABEL]),
    );
  }
  return rows;
}

export function membersCsvRows(view: AppView): (string | number)[][] {
  return [
    ['ลำดับ', 'รหัสสมาชิก', 'ชื่อ-นามสกุล', 'ประเภทกีฬาที่ลงแข่งขัน', 'จำนวนประเภท', 'สถานะการสมัคร', ...view.sports.map((s) => s.sport.sport_name)],
    ...view.members.map((m, i) => [
      i + 1,
      m.member.member_code,
      m.member.full_name,
      m.sports.map((s) => s.sport_name).join(' / ') || '-',
      m.count,
      MEMBER_STATUS_LABEL[m.status],
      ...view.sports.map((s) => (m.sports.some((x) => x.id === s.sport.id) ? '✓' : '')),
    ]),
  ];
}

export const fileSafe = (s: string) => s.replace(/[\\/:*?"<>|\s]+/g, '-');

// ---------------------------------------------------------------- Print
const esc = (s: string | number) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const PRINT_CSS = `
@page { size: A4; margin: 14mm; }
* { box-sizing: border-box; }
body { font-family: 'Sarabun', 'Tahoma', sans-serif; color: #111; font-size: 13px; margin: 0; }
.head { border-bottom: 3px solid #EAB308; padding-bottom: 6px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-end; }
.head h1 { font-size: 18px; margin: 0; } .head .sub { color: #555; font-size: 12px; }
h2 { font-size: 16px; margin: 14px 0 6px; } .stats { display: flex; gap: 18px; margin: 4px 0 8px; font-size: 13px; }
.stats b { font-size: 15px; }
table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
th, td { border: 1px solid #bbb; padding: 5px 7px; text-align: left; vertical-align: top; }
th { background: #FEF3C7; } td.c, th.c { text-align: center; width: 48px; }
.sign { margin-top: 28px; display: flex; justify-content: space-around; font-size: 13px; }
.sign div { text-align: center; } .page { page-break-after: always; } .page:last-child { page-break-after: auto; }
.muted { color: #777; } .badge { display:inline-block; padding: 0 6px; border:1px solid #999; border-radius: 8px; font-size: 11px; }
`;

function header(title: string) {
  const printed = new Date().toLocaleString('th-TH', { dateStyle: 'long', timeStyle: 'short' });
  return `<div class="head"><div><h1>${esc(EVENT_TITLE)}</h1><div class="sub">${esc(title)}</div></div><div class="sub">พิมพ์เมื่อ ${esc(printed)}</div></div>`;
}

function sportBlock(v: SportView, withSign: boolean) {
  const rows = v.athletes.length
    ? v.athletes
        .map((a, i) => `<tr><td class="c">${i + 1}</td><td>${esc(a.member.member_code)}</td><td>${esc(a.member.full_name)}</td><td>${REG_LABEL}</td><td style="width:90px"></td></tr>`)
        .join('')
    : `<tr><td colspan="5" class="muted" style="text-align:center">ยังไม่มีผู้สมัคร</td></tr>`;
  return `<h2>${esc(v.sport.sport_name)} <span class="badge">${esc(SPORT_STATUS_LABEL[v.status])}</span></h2>
  <div class="stats"><span>เป้าหมาย <b>${v.target}</b> คน</span><span>สมัครแล้ว <b>${v.count}</b> คน</span><span>ยังขาด <b>${v.missing}</b> คน</span>${v.over ? `<span>เกิน <b>${v.over}</b> คน</span>` : ''}</div>
  <table><thead><tr><th class="c">ลำดับ</th><th style="width:90px">รหัสสมาชิก</th><th>ชื่อ-นามสกุล</th><th style="width:100px">สถานะการสมัคร</th><th>ลงชื่อ/หมายเหตุ</th></tr></thead><tbody>${rows}</tbody></table>
  ${withSign ? `<div class="sign"><div>ลงชื่อ ................................................<br/>หัวหน้าทีมสีเหลือง</div><div>ลงชื่อ ................................................<br/>ผู้ควบคุมการแข่งขัน</div></div>` : ''}`;
}

export function printHtml(title: string, body: string) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(
    `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(title)}</title>` +
      `<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap" rel="stylesheet">` +
      `<style>${PRINT_CSS}</style></head><body>${body}</body></html>`,
  );
  doc.close();
  const go = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => iframe.remove(), 1500);
  };
  // wait for the Thai font so the printout isn't rendered in a fallback font
  const fonts = (doc as Document & { fonts?: FontFaceSet }).fonts;
  if (fonts?.ready) Promise.race([fonts.ready, new Promise((r) => setTimeout(r, 1500))]).then(go);
  else setTimeout(go, 500);
}

export function printSport(v: SportView) {
  printHtml(`รายชื่อนักกีฬา ${v.sport.sport_name}`, header(`รายชื่อผู้เข้าแข่งขัน – ${v.sport.sport_name}`) + sportBlock(v, true));
}

export function printAllSports(view: AppView) {
  printHtml(
    'รายชื่อนักกีฬาแยกตามประเภท',
    view.sports.map((v) => `<div class="page">${header('รายชื่อผู้เข้าแข่งขันแยกตามประเภทกีฬา')}${sportBlock(v, true)}</div>`).join(''),
  );
}

export function printMembers(view: AppView) {
  const rows = view.members
    .map(
      (m, i) =>
        `<tr><td class="c">${i + 1}</td><td>${esc(m.member.member_code)}</td><td>${esc(m.member.full_name)}</td><td>${esc(m.sports.map((s) => s.sport_name).join(', ') || '-')}</td><td class="c">${m.count}</td><td>${esc(MEMBER_STATUS_LABEL[m.status])}</td></tr>`,
    )
    .join('');
  printHtml(
    'รายชื่อสมาชิกสีเหลืองทั้งหมด',
    header(`รายชื่อสมาชิกสีเหลืองทั้งหมด ${view.members.length} คน`) +
      `<table><thead><tr><th class="c">ลำดับ</th><th style="width:80px">รหัส</th><th>ชื่อ-นามสกุล</th><th>กีฬาที่ลงแข่งขัน</th><th class="c">จำนวน</th><th style="width:130px">สถานะ</th></tr></thead><tbody>${rows}</tbody></table>`,
  );
}

export function printSummary(view: AppView) {
  const s = view.summary;
  const sportRows = view.sports
    .map(
      (v, i) =>
        `<tr><td class="c">${i + 1}</td><td>${esc(v.sport.sport_name)}</td><td class="c">${v.target}</td><td class="c">${v.count}</td><td class="c">${v.missing}</td><td class="c">${v.percent}%</td><td>${esc(SPORT_STATUS_LABEL[v.status])}</td></tr>`,
    )
    .join('');
  const notYet = view.members.filter((m) => m.count === 0);
  printHtml(
    'สรุปภาพรวมสีเหลือง',
    header('รายงานสรุปภาพรวมทีมสีเหลือง') +
      `<table><tbody>
        <tr><th>สมาชิกสีเหลืองทั้งหมด</th><td>${s.totalMembers} คน</td><th>ลงแข่งขันอย่างน้อย 1 ประเภท</th><td>${s.registeredMembers} คน</td></tr>
        <tr><th>ยังไม่ได้ลงแข่งขัน</th><td>${s.unregisteredMembers} คน</td><th>รายการลงแข่งขันทั้งหมด</th><td>${s.totalEntries} รายการ</td></tr>
        <tr><th>กีฬาที่ผู้สมัครครบเป้าหมาย</th><td colspan="3">${s.fullSports} / ${s.totalSports} ประเภท</td></tr>
      </tbody></table>
      <h2>สรุปรายประเภทกีฬา</h2>
      <table><thead><tr><th class="c">ลำดับ</th><th>ประเภทกีฬา</th><th class="c">เป้าหมาย</th><th class="c">สมัครแล้ว</th><th class="c">ยังขาด</th><th class="c">ความคืบหน้า</th><th>สถานะ</th></tr></thead><tbody>${sportRows}</tbody></table>
      <h2>สมาชิกที่ยังไม่ได้ลงแข่งขัน (${notYet.length} คน)</h2>
      <p>${notYet.length ? notYet.map((m) => esc(`${m.member.member_code} ${m.member.full_name}`)).join(', ') : 'สมาชิกทุกคนลงแข่งขันแล้ว'}</p>`,
  );
}
