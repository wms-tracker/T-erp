// ===================================================================
// export-utils.js — Export ตาราง/รายงานเป็น CSV / Excel (.xlsx ผ่าน SheetJS CDN, โหลดแบบ lazy) / พิมพ์ PDF
// ===================================================================

function toCsvValue(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportCsv(filename, columns, rows) {
  const header = columns.map(c => toCsvValue(c.label)).join(',');
  const body = rows.map(r => columns.map(c => toCsvValue(typeof c.value === 'function' ? c.value(r) : r[c.key])).join(',')).join('\n');
  const csv = '﻿' + header + '\n' + body;
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), filename.endsWith('.csv') ? filename : `${filename}.csv`);
}

let _xlsxLoading = null;
function loadXlsxLib() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (_xlsxLoading) return _xlsxLoading;
  _xlsxLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    script.onload = () => resolve(window.XLSX);
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return _xlsxLoading;
}

export async function exportExcel(filename, columns, rows, sheetName = 'Data') {
  const XLSX = await loadXlsxLib();
  const data = rows.map(r => Object.fromEntries(columns.map(c => [c.label, typeof c.value === 'function' ? c.value(r) : r[c.key]])));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function printSection(title, htmlContent) {
  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8"><title>${title}</title>
    <style>body{font-family:'Segoe UI',Sarabun,Tahoma,sans-serif;padding:24px;color:#111;}
    table{width:100%;border-collapse:collapse;font-size:12px;} th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;}
    th{background:#f0f2f7;} h1{font-size:18px;margin:0 0 4px;} .meta{color:#666;font-size:12px;margin-bottom:16px;}</style>
    </head><body>${htmlContent}<script>window.onload=()=>{window.print();}<\/script></body></html>`);
  win.document.close();
}
