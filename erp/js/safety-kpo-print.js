/**
 * Shared utilities for KPO module pages:
 *   initLightbox()   — inject lightbox HTML after renderShell + wire up JS
 *   fmtSteps(text)   — render "1.xxx 2.xxx" text as <ol>
 *   renderThumbs(attachments) — return thumbnail grid HTML
 *   bindLightbox(attachments, containerEl) — wire click → lightbox open
 *   printKPODoc(opts) — open SOP-format print window
 */

let _lbUrls = [], _lbIdx = 0;

function _lbShow() {
  const img = document.getElementById('lb-img');
  if (!img) return;
  img.style.animation = 'none';
  img.src = _lbUrls[_lbIdx];
  requestAnimationFrame(() => { img.style.animation = ''; });
  const multi = _lbUrls.length > 1;
  document.getElementById('lb-prev').style.display = multi ? '' : 'none';
  document.getElementById('lb-next').style.display = multi ? '' : 'none';
  document.getElementById('lb-caption').textContent = multi ? `${_lbIdx + 1} / ${_lbUrls.length}` : '';
  document.getElementById('lb-dots').innerHTML = multi
    ? _lbUrls.map((_, i) => `<div class="lb-dot${i === _lbIdx ? ' on' : ''}" onclick="event.stopPropagation();window._lbNav(${i - _lbIdx})"></div>`).join('')
    : '';
}

export function initLightbox() {
  if (document.getElementById('lb-overlay')) return;
  document.body.insertAdjacentHTML('beforeend', `
<div id="lb-overlay" onclick="window._lbClose()">
  <button id="lb-close" onclick="window._lbClose()">✕</button>
  <button id="lb-prev" onclick="event.stopPropagation();window._lbNav(-1)">&#8249;</button>
  <div id="lb-stage" onclick="event.stopPropagation()">
    <img id="lb-img" src="" alt="">
    <div id="lb-caption"></div>
    <div id="lb-dots"></div>
  </div>
  <button id="lb-next" onclick="event.stopPropagation();window._lbNav(1)">&#8250;</button>
</div>`);

  window._lbOpen  = (idx) => { _lbIdx = idx; _lbShow(); document.getElementById('lb-overlay').classList.add('open'); };
  window._lbClose = ()    => { document.getElementById('lb-overlay').classList.remove('open'); };
  window._lbNav   = (dir) => { _lbIdx = (_lbIdx + dir + _lbUrls.length) % _lbUrls.length; _lbShow(); };

  document.addEventListener('keydown', e => {
    if (!document.getElementById('lb-overlay')?.classList.contains('open')) return;
    if (e.key === 'Escape')     window._lbClose();
    if (e.key === 'ArrowLeft')  window._lbNav(-1);
    if (e.key === 'ArrowRight') window._lbNav(1);
  });
}

export function fmtSteps(text) {
  if (!text) return '';
  const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const parts = text.split(/(?=\s*\d+\.\s*)/).map(s => s.trim()).filter(Boolean);
  if (parts.length > 1 && /^\d+\./.test(parts[0])) {
    return `<ol style="margin:6px 0 0;padding-left:20px;line-height:1.85;font-size:.82rem;color:#374151">
      ${parts.map(p => `<li style="margin-bottom:3px">${esc(p.replace(/^\d+\.\s*/, ''))}</li>`).join('')}
    </ol>`;
  }
  return `<span style="white-space:pre-wrap;font-size:.82rem;color:#374151">${esc(text)}</span>`;
}

export function renderThumbs(attachments) {
  if (!attachments?.length) return '';
  return `
<div class="section-title" style="margin-top:14px">
  รูปภาพแนบ (${attachments.length} รูป)
  <span style="font-size:.72rem;font-weight:400;color:#94a3b8">— คลิกเพื่อดูเต็มจอ</span>
</div>
<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-top:8px" class="kpo-lb-thumbs">
  ${attachments.map((url, i) => `
  <div data-lb="${i}" style="cursor:zoom-in;border-radius:10px;overflow:hidden;aspect-ratio:4/3;background:#e2e8f0;box-shadow:0 2px 8px rgba(0,0,0,.12);transition:transform .18s"
       onmouseenter="this.style.transform='scale(1.03)'" onmouseleave="this.style.transform=''">
    <img src="${url}" style="width:100%;height:100%;object-fit:cover;display:block;pointer-events:none">
  </div>`).join('')}
</div>`;
}

export function bindLightbox(attachments, containerEl) {
  _lbUrls = attachments || [];
  if (!containerEl) return;
  containerEl.querySelectorAll('[data-lb]').forEach(el => {
    el.addEventListener('click', () => window._lbOpen(Number(el.dataset.lb)));
  });
}

/**
 * printKPODoc(opts)
 * opts: { r, profile, db, getDoc, fsDoc, moduleTitle, infoRows, textSections }
 *   infoRows: array of [label, value] or [label, value, 'full'] (full = colspan 3)
 *   textSections: array of { title, content, isSteps? }
 */
export async function printKPODoc({ r, profile, db, getDoc, fsDoc, moduleTitle, infoRows = [], textSections = [] }) {
  const w = window.open('', '_blank', 'width=980,height=820');
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8"><title>กำลังโหลด...</title></head>
<body><p style="font-family:Sarabun,sans-serif;padding:28px;color:#64748b;font-size:14px">กำลังโหลดข้อมูล...</p></body></html>`);

  let compName   = 'บริษัท ฮอไรซัน กรุ๊ป (ประเทศไทย) จำกัด';
  let compNameEn = 'Horizon Group (Thailand) Co.,Ltd.';
  let logoUrl    = '';
  try {
    const snap = await getDoc(fsDoc(db, 'sopSettings', 'main'));
    if (snap.exists()) {
      const d = snap.data();
      if (d.company_name)    compName   = d.company_name;
      if (d.company_name_en) compNameEn = d.company_name_en;
      if (d.logo_url)        logoUrl    = d.logo_url;
    }
  } catch (_) {}

  const esc     = t => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const today   = new Date().toLocaleDateString('th-TH', { dateStyle: 'long' });
  const preparer = profile.displayName || profile.name || profile.email || '-';

  const logoHtml = logoUrl
    ? `<img src="${esc(logoUrl)}" style="max-height:56px;max-width:120px;object-fit:contain">`
    : `<div style="width:52px;height:52px;background:#1e3a5f;border-radius:7px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:1.1rem;font-weight:800;margin:auto">HRZ</div>`;

  const imgs = (r.attachments || []).map(url =>
    `<div style="break-inside:avoid"><img src="${url}" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:4px;border:1px solid #d1d5db"></div>`
  ).join('');

  let secIdx = 2;
  const fmtPrintSteps = text => {
    if (!text) return '-';
    const e = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const parts = text.split(/(?=\s*\d+\.\s*)/).map(s => s.trim()).filter(Boolean);
    if (parts.length > 1 && /^\d+\./.test(parts[0]))
      return `<ol style="padding-left:20px;margin:4px 0;line-height:1.9">${parts.map(p => `<li style="margin-bottom:3px">${e(p.replace(/^\d+\.\s*/, ''))}</li>`).join('')}</ol>`;
    return `<span style="white-space:pre-wrap">${e(text)}</span>`;
  };

  w.document.open();
  w.document.write(`<!DOCTYPE html><html lang="th"><head>
<meta charset="UTF-8">
<title>${esc(moduleTitle)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;600;700&display=swap">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Sarabun',sans-serif;color:#1e293b;font-size:13px;line-height:1.65;background:#fff;padding:24px 28px}
table.hdr{width:100%;border-collapse:collapse;border:1.5px solid #1e3a5f}
table.hdr td{padding:8px 10px;border:1px solid #1e3a5f;vertical-align:middle}
.hdr-logo{width:100px;text-align:center}
.hdr-mid{text-align:center}
.hdr-mid .co{font-size:.95rem;font-weight:700;color:#1e3a5f}
.hdr-mid .en{font-size:.72rem;color:#64748b;margin-top:1px}
.hdr-mid .doc-title{font-size:1rem;font-weight:700;margin-top:5px;color:#0f172a;padding:3px 0}
.hdr-meta{width:200px;font-size:.75rem}
.hdr-meta table{width:100%;border-collapse:collapse}
.hdr-meta td{padding:3px 5px;border-bottom:1px solid #e2e8f0;vertical-align:middle}
.hdr-meta td:first-child{color:#64748b;width:55%}
.hdr-meta td:last-child{font-weight:600}
.sh{background:#1e3a5f;color:#fff;padding:5px 10px;font-size:.8rem;font-weight:700;margin-top:10px;letter-spacing:.04em}
table.info{width:100%;border-collapse:collapse;border:1px solid #d1d5db}
table.info td{padding:5px 10px;font-size:.82rem;border:1px solid #d1d5db;vertical-align:top}
table.info td.lbl{color:#374151;background:#f8fafc;width:22%;font-weight:600;white-space:nowrap}
.sb{border:1px solid #d1d5db;border-top:none;padding:9px 11px;font-size:.82rem;line-height:1.75;min-height:44px}
table.sig{width:100%;border-collapse:collapse;margin-top:14px;border:1px solid #d1d5db}
table.sig th{background:#f1f5f9;color:#1e3a5f;font-size:.75rem;text-align:center;padding:6px 8px;border:1px solid #d1d5db;font-weight:700}
table.sig td{text-align:center;border:1px solid #d1d5db;font-size:.78rem;color:#374151;padding:4px 8px}
.img-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:10px;border:1px solid #d1d5db;border-top:none}
@media print{body{padding:0}@page{margin:12mm 14mm;size:A4}.sh{-webkit-print-color-adjust:exact;print-color-adjust:exact}table.hdr td,table.info td,table.sig td,table.sig th{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>

<table class="hdr">
  <tr>
    <td class="hdr-logo">${logoHtml}</td>
    <td class="hdr-mid">
      <div class="co">${esc(compName)}</div>
      <div class="en">${esc(compNameEn)}</div>
      <div class="doc-title">${esc(moduleTitle)}</div>
    </td>
    <td class="hdr-meta">
      <table>
        <tr><td>รหัสเอกสาร</td><td>${esc(r.id.slice(0, 8).toUpperCase())}</td></tr>
        <tr><td>วันที่พิมพ์</td><td>${today}</td></tr>
      </table>
    </td>
  </tr>
</table>

<div class="sh">1. ข้อมูลทั่วไป</div>
<table class="info">
${infoRows.map(([lbl, val, mode]) => {
  const v = typeof val === 'string' ? esc(val) : (val || '-');
  return mode === 'full'
    ? `  <tr><td class="lbl">${esc(lbl)}</td><td colspan="3">${v}</td></tr>`
    : `  <tr><td class="lbl">${esc(lbl)}</td><td>${v}</td></tr>`;
}).join('\n')}
</table>

${textSections.filter(s => s.content).map(s => `
<div class="sh">${secIdx++}. ${esc(s.title)}</div>
<div class="sb">${s.isSteps ? fmtPrintSteps(s.content) : esc(String(s.content))}</div>`).join('')}

${imgs ? `<div class="sh">${secIdx++}. รูปภาพประกอบ (${r.attachments.length} รูป)</div><div class="img-grid">${imgs}</div>` : ''}

<table class="sig">
  <tr><th>ผู้จัดทำ</th><th>ผู้ตรวจสอบ</th><th>ผู้รับรอง</th><th>ผู้อนุมัติ</th></tr>
  <tr>
    <td style="height:42px"></td><td></td><td></td><td></td>
  </tr>
  <tr>
    <td style="font-weight:700;font-size:.82rem">${esc(preparer)}</td>
    <td>……………………………</td><td>……………………………</td><td>……………………………</td>
  </tr>
  <tr>
    <td style="color:#9ca3af;font-size:.75rem">วันที่: ${today}</td>
    <td style="color:#9ca3af;font-size:.75rem">วันที่: ……………………</td>
    <td style="color:#9ca3af;font-size:.75rem">วันที่: ……………………</td>
    <td style="color:#9ca3af;font-size:.75rem">วันที่: ……………………</td>
  </tr>
</table>
</body></html>`);

  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 900);
}
