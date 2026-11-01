// ===================================================================
// SOP export ในเบราว์เซอร์: Word (.docx) และ Excel (.xlsx) — ไม่ต้องมี server
// (พอร์ตจาก warehouse-sop/server/*.js; บีบอัด ZIP ด้วย CompressionStream ของเบราว์เซอร์)
// ===================================================================
const enc = new TextEncoder();
const u32be = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const u16be = (b, o) => (b[o] << 8) | b[o + 1];
const u16le = (b, o) => b[o] | (b[o + 1] << 8);
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
async function deflateRaw(u8) {
  const cs = new CompressionStream('deflate-raw');
  const out = new Response(new Blob([u8]).stream().pipeThrough(cs));
  return new Uint8Array(await out.arrayBuffer());
}
/** files: [{ name, data: Uint8Array|string }] -> Promise<Blob> (zip) */
async function zip(files) {
  const parts = [], central = []; let offset = 0;
  const d = new Date();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const f of files) {
    const name = enc.encode(f.name);
    const raw = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const comp = await deflateRaw(raw); const crc = crc32(raw);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 8, true);
    lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc, true); lh.setUint32(18, comp.length, true);
    lh.setUint32(22, raw.length, true); lh.setUint16(26, name.length, true);
    parts.push(lh, name, comp);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 8, true);
    ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc, true); ch.setUint32(20, comp.length, true);
    ch.setUint32(24, raw.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
    central.push(ch, name);
    offset += 30 + name.length + comp.length;
  }
  const cdSize = central.reduce((s, x) => s + x.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}

/* สร้างเอกสาร SOP เป็น Microsoft Word (.docx) ตามรูปแบบมาตรฐานองค์กร
   - หัวกระดาษ: โลโก้ / ชื่อบริษัท / ชื่อเอกสาร / รหัสเอกสาร / Rev / วันที่มีผล / หน้า X จาก Y
   - ตารางผู้จัดทำ / ผู้ตรวจสอบ / ผู้อนุมัติ, เนื้อหา, ขั้นตอน (พร้อมรูป), ประวัติการแก้ไข */

const escX = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
const CONTENT_W = 9900; // ความกว้างพื้นที่เนื้อหา (twips) บน A4 ขอบซ้ายขวา 1000

/* ---------- ตัวช่วยสร้าง XML ---------- */
function rPr(o = {}) {
  return `<w:rPr>${o.b ? '<w:b/><w:bCs/>' : ''}${o.i ? '<w:i/><w:iCs/>' : ''}${o.color ? `<w:color w:val="${o.color}"/>` : ''}${o.sz ? `<w:sz w:val="${o.sz}"/><w:szCs w:val="${o.sz}"/>` : ''}</w:rPr>`;
}
function run(text, o = {}) {
  const rp = rPr(o);
  return String(text ?? '').split(/\r?\n/).map((line, k) =>
    (k ? `<w:r>${rp}<w:br/></w:r>` : '') + `<w:r>${rp}<w:t xml:space="preserve">${escX(line)}</w:t></w:r>`).join('');
}
function field(instr, o = {}) {
  const rp = rPr(o);
  return `<w:r>${rp}<w:fldChar w:fldCharType="begin"/></w:r><w:r>${rp}<w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r><w:r>${rp}<w:fldChar w:fldCharType="separate"/></w:r><w:r>${rp}<w:t>1</w:t></w:r><w:r>${rp}<w:fldChar w:fldCharType="end"/></w:r>`;
}
function p(runs, o = {}) {
  const ppr = `<w:pPr>${o.keepNext ? '<w:keepNext/>' : ''}${o.pageBreakBefore ? '<w:pageBreakBefore/>' : ''}${o.shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.shade}"/>` : ''}<w:spacing w:before="${o.before ?? 0}" w:after="${o.after ?? 60}"/>${o.indent ? `<w:ind w:left="${o.indent}"/>` : ''}${o.align ? `<w:jc w:val="${o.align}"/>` : ''}</w:pPr>`;
  return `<w:p>${ppr}${runs || ''}</w:p>`;
}
function tc(content, w, o = {}) {
  const paras = Array.isArray(content) ? content.join('') : content;
  return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${o.span ? `<w:gridSpan w:val="${o.span}"/>` : ''}${o.shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.shade}"/>` : ''}<w:vAlign w:val="${o.valign || 'center'}"/></w:tcPr>${paras || p('')}</w:tc>`;
}
function tr(cells, o = {}) {
  return `<w:tr><w:trPr>${o.header ? '<w:tblHeader/>' : ''}${o.h ? `<w:trHeight w:val="${o.h}"/>` : ''}<w:cantSplit/></w:trPr>${cells.join('')}</w:tr>`;
}
function table(cols, rows, o = {}) {
  const b = o.noBorder ? 'nil' : 'single';
  const border = side => `<w:${side} w:val="${b}" w:sz="4" w:space="0" w:color="8C99A8"/>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="${cols.reduce((a, c) => a + c, 0)}" w:type="dxa"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${cols.map(c => `<w:gridCol w:w="${c}"/>`).join('')}</w:tblGrid>${rows.join('')}</w:tbl>`;
}
function image(rid, n, wPx, hPx, maxWcm = 15, maxHcm = 9) {
  const EMU_CM = 360000;
  let cx = wPx * 9525, cy = hPx * 9525;
  const sc = Math.min(1, (maxWcm * EMU_CM) / cx, (maxHcm * EMU_CM) / cy);
  cx = Math.round(cx * sc); cy = Math.round(cy * sc);
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="Picture ${n}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${n}" name="image${n}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

/* ---------- อ่านขนาดรูป PNG / JPEG / GIF ---------- */
function imageInfo(buf) {
  if (!buf || buf.length < 24) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50) return { ext: 'png', w: u32be(buf, 16), h: u32be(buf, 20) };
  if (buf[0] === 0x47 && buf[1] === 0x49) return { ext: 'gif', w: u16le(buf, 6), h: u16le(buf, 8) };
  if (buf[0] === 0xFF && buf[1] === 0xD8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xFF) { i++; continue; }
      const m = buf[i + 1];
      if (m >= 0xC0 && m <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(m)) return { ext: 'jpeg', h: u16be(buf, i + 5), w: u16be(buf, i + 7) };
      if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { i += 2; continue; }
      i += 2 + u16be(buf, i + 2);
    }
  }
  return null;
}

/* ---------- สร้างเอกสาร ---------- */
export function buildDocx(m) {
  const font = m.font || 'Tahoma';
  const media = []; // {name, buf}
  const docRels = [], hdrRels = [];
  let picN = 1;
  function addImage(rels, buf, maxW, maxH) {
    const info = imageInfo(buf);
    if (!info) return '';
    const name = `image${media.length + 1}.${info.ext}`;
    media.push({ name, buf });
    const rid = `rIdImg${media.length}`;
    rels.push(`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${name}"/>`);
    return image(rid, picN++, info.w, info.h, maxW, maxH);
  }

  const c = m.content || {};
  const H = (t) => p(run(t, { b: true, sz: 24, color: '1E3A5F' }), { before: 200, after: 80, keepNext: true, shade: 'E8EEF5' });
  const body = (t) => {
    const s = String(t || '').trim();
    if (!s) return p(run('-', { color: '808080' }), { indent: 300 });
    return s.split(/\r?\n/).map(line => p(run(line), { indent: 300, after: 40 })).join('');
  };
  const parts = [];

  // ชื่อเอกสาร
  parts.push(p(run('STANDARD OPERATING PROCEDURE (SOP)', { b: true, sz: 22, color: '5A6B7F' }), { align: 'center', after: 40 }));
  parts.push(p(run(m.title, { b: true, sz: 32, color: '1E3A5F' }), { align: 'center', after: 160 }));

  // ข้อมูลเอกสาร
  const lbl = t => p(run(t, { b: true, sz: 18, color: '334155' }));
  const val = t => p(run(t || '-', { sz: 18 }));
  const W4 = [1650, 3300, 1650, 3300];
  parts.push(table(W4, [
    tr([tc(lbl('SOP Number'), W4[0], { shade: 'F1F5F9' }), tc(val(m.sop_number), W4[1]), tc(lbl('Department'), W4[2], { shade: 'F1F5F9' }), tc(val(m.dept_name), W4[3])]),
    tr([tc(lbl('Revision'), W4[0], { shade: 'F1F5F9' }), tc(val(m.revLabel), W4[1]), tc(lbl('Status'), W4[2], { shade: 'F1F5F9' }), tc(val(m.statusLabel), W4[3])]),
    tr([tc(lbl('Effective Date'), W4[0], { shade: 'F1F5F9' }), tc(val(m.effective_date), W4[1]), tc(lbl('Review Date'), W4[2], { shade: 'F1F5F9' }), tc(val(m.review_date), W4[3])]),
    tr([tc(lbl('ผู้รับผิดชอบ (Owner)'), W4[0], { shade: 'F1F5F9' }), tc(val(m.owner), W4[1]), tc(lbl('Keywords'), W4[2], { shade: 'F1F5F9' }), tc(val(c.keywords), W4[3])]),
  ]));
  parts.push(p('', { after: 120 }));

  // ตารางลงนาม
  const W3 = [3300, 3300, 3300];
  const sig = (s) => s || {};
  const hd = t => p(run(t, { b: true, sz: 18, color: 'FFFFFF' }), { align: 'center' });
  const sc = (t, o = {}) => p(run(t || ' ', { sz: 18, ...o }), { align: 'center' });
  const roles = [sig(m.prepared), sig(m.reviewed), sig(m.approved)];
  parts.push(table(W3, [
    tr([tc(hd('ผู้จัดทำ (Prepared By)'), W3[0], { shade: '1E3A5F' }), tc(hd('ผู้ตรวจสอบ (Reviewed By)'), W3[1], { shade: '1E3A5F' }), tc(hd('ผู้อนุมัติ (Approved By)'), W3[2], { shade: '1E3A5F' })], { header: true }),
    tr(roles.map((r, i) => tc(r.note ? sc(r.note, { color: '15803D', i: true }) : sc(' '), W3[i])), { h: 700 }),
    tr(roles.map((r, i) => tc(sc(r.name ? `( ${r.name} )` : '(                                   )', { b: true }), W3[i]))),
    tr(roles.map((r, i) => tc(sc(r.position || 'ตำแหน่ง ...........................'), W3[i]))),
    tr(roles.map((r, i) => tc(sc('วันที่ ' + (r.date || '......../......../............')), W3[i]))),
  ]));

  // เนื้อหา
  parts.push(H('1. วัตถุประสงค์ (Objective)'), body(c.objective));
  parts.push(H('2. ขอบเขต (Scope)'), body(c.scope));
  parts.push(H('3. ความรับผิดชอบ (Responsibility)'), body(c.responsibility));
  parts.push(H('4. อุปกรณ์ / เครื่องมือ (Equipment / Tools)'), body(c.equipment));
  parts.push(H('5. ข้อกำหนดด้านความปลอดภัย (Safety Requirements)'), body(c.safety));
  parts.push(H('6. ขั้นตอนการปฏิบัติงาน (Work Instructions)'));
  const steps = Array.isArray(c.steps) ? c.steps : [];
  if (!steps.length) parts.push(body(''));
  steps.forEach((s, i) => {
    parts.push(p(run(`6.${i + 1}  ${s.title || ''}`, { b: true, sz: 21 }), { before: 100, after: 40, indent: 300, keepNext: !!(s.detail || (s.images || []).length) }));
    if (s.detail) String(s.detail).trim().split(/\r?\n/).forEach(line => parts.push(p(run(line), { indent: 700, after: 30, keepNext: !!(s.images || []).length })));
    (s.images || []).forEach(fid => {
      const img = m.images && m.images.get(fid && fid.url ? fid.url : fid);
      if (!img) return;
      const pic = addImage(docRels, img.buf, 13, 8.5);
      if (pic) {
        parts.push(p(pic, { indent: 700, after: 20 }));
        if (img.name) parts.push(p(run('รูป: ' + img.name, { sz: 16, color: '64748B', i: true }), { indent: 700, after: 80 }));
      }
    });
  });
  parts.push(H('7. เอกสารที่เกี่ยวข้อง (Related Documents)'), body(c.related_docs));
  if ((m.attachments || []).length) {
    parts.push(p(run('ไฟล์แนบ:', { b: true, sz: 18 }), { indent: 300, after: 20 }));
    m.attachments.forEach((a, i) => parts.push(p(run(`${i + 1}) ${a}`, { sz: 18 }), { indent: 600, after: 20 })));
  }
  parts.push(H('8. ตัวชี้วัด / มาตรฐาน (KPI / Standard)'), body(c.kpi));

  // ประวัติการแก้ไข
  parts.push(H('9. ประวัติการแก้ไข (Revision History)'));
  const WH = [900, 1500, 3700, 1900, 1900];
  const th = t => p(run(t, { b: true, sz: 17, color: 'FFFFFF' }), { align: 'center' });
  const td = (t, al) => p(run(t || '-', { sz: 17 }), { align: al });
  parts.push(table(WH, [
    tr([tc(th('Rev.'), WH[0], { shade: '1E3A5F' }), tc(th('วันที่มีผล'), WH[1], { shade: '1E3A5F' }), tc(th('รายละเอียดการแก้ไข'), WH[2], { shade: '1E3A5F' }), tc(th('ผู้จัดทำ'), WH[3], { shade: '1E3A5F' }), tc(th('ผู้อนุมัติ / วันที่'), WH[4], { shade: '1E3A5F' })], { header: true }),
    ...(m.history || []).map(h => tr([
      tc(td(h.rev, 'center'), WH[0]), tc(td(h.date, 'center'), WH[1]), tc(td(h.summary), WH[2], { valign: 'top' }),
      tc(td(h.prepared), WH[3]), tc(td([h.approved, h.approvedDate].filter(Boolean).join('\n')), WH[4]),
    ])),
  ]));

  const sect = `<w:sectPr><w:headerReference w:type="default" r:id="rIdHdr"/><w:footerReference w:type="default" r:id="rIdFtr"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="2300" w:right="1000" w:bottom="1300" w:left="1000" w:header="450" w:footer="450" w:gutter="0"/></w:sectPr>`;
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${parts.join('')}${p('')}${sect}</w:body></w:document>`;

  // หัวกระดาษ
  const WHd = [1900, 5000, 3000];
  let logoRun = '';
  if (m.logo) logoRun = addImage(hdrRels, m.logo, 3.0, 1.8);
  const hs = (t, o = {}) => p(run(t, { sz: 16, ...o }), { after: 0 });
  const headerTable = table(WHd, [tr([
    tc(logoRun ? p(logoRun, { align: 'center', after: 0 }) : p(run(m.companyShort || 'LOGO', { b: true, sz: 22, color: '1E3A5F' }), { align: 'center', after: 0 }), WHd[0]),
    tc([
      p(run(m.company, { b: true, sz: 20, color: '1E3A5F' }), { align: 'center', after: 0 }),
      m.companyEn ? p(run(m.companyEn, { sz: 16, color: '5A6B7F' }), { align: 'center', after: 20 }) : '',
      p(run(m.title, { b: true, sz: 20 }), { align: 'center', after: 0 }),
      p(run('แผนก ' + (m.dept_name || ''), { sz: 16, color: '5A6B7F' }), { align: 'center', after: 0 }),
    ], WHd[1]),
    tc([
      hs('รหัสเอกสาร: ' + m.sop_number, { b: true }),
      hs('Revision: ' + m.revLabel),
      hs('วันที่มีผล: ' + (m.effective_date || '-')),
      p(run('หน้า ', { sz: 16 }) + field('PAGE', { sz: 16 }) + run(' / ', { sz: 16 }) + field('NUMPAGES', { sz: 16 }), { after: 0 }),
    ], WHd[2], { valign: 'center' }),
  ])]);
  const watermark = m.watermark ? p(run(m.watermark, { b: true, sz: 18, color: 'C62828' }), { align: 'center', before: 60, after: 0 }) : '';
  const headerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${NS}>${headerTable}${watermark || p('', { after: 0 })}</w:hdr>`;

  // ท้ายกระดาษ
  const WF = [6400, 3500];
  const footerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${NS}>${table(WF, [tr([
    tc(p(run(`เอกสารควบคุม (Controlled Document) — ${m.sop_number} ${m.revLabel}`, { sz: 14, color: '64748B' }), { after: 0 }), WF[0]),
    tc(p(run(`พิมพ์เมื่อ ${m.printedAt}  |  หน้า `, { sz: 14, color: '64748B' }) + field('PAGE', { sz: 14, color: '64748B' }) + run(' / ', { sz: 14, color: '64748B' }) + field('NUMPAGES', { sz: 14, color: '64748B' }), { align: 'right', after: 0 }), WF[1]),
  ])], { noBorder: true })}${p('', { after: 0 })}</w:ftr>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${escX(font)}" w:hAnsi="${escX(font)}" w:eastAsia="${escX(font)}" w:cs="${escX(font)}"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="en-US" w:bidi="th-TH"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="60" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>`;

  const rels = (arr) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${arr.join('')}</Relationships>`;
  docRels.unshift(
    '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
    '<Relationship Id="rIdHdr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>',
    '<Relationship Id="rIdFtr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>');

  const files = [
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="gif" ContentType="image/gif"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>` },
    { name: '_rels/.rels', data: rels(['<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>', '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>']) },
    { name: 'docProps/core.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escX(m.sop_number + ' ' + m.title)}</dc:title><dc:creator>${escX(m.company)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>` },
    { name: 'word/document.xml', data: documentXml },
    { name: 'word/styles.xml', data: stylesXml },
    { name: 'word/header1.xml', data: headerXml },
    { name: 'word/footer1.xml', data: footerXml },
    { name: 'word/_rels/document.xml.rels', data: rels(docRels) },
    ...media.map(x => ({ name: 'word/media/' + x.name, data: x.buf })),
  ];
  if (hdrRels.length) files.push({ name: 'word/_rels/header1.xml.rels', data: rels(hdrRels) });
  return zip(files);
}

/* สร้างไฟล์ Excel (.xlsx) แบบง่าย — 1 ชีต, หัวตารางตัวหนา, ตรึงแถวแรก, มี AutoFilter */

const escXl = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
function colName(n) { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

/** sheetName, columns: [{header, width}], rows: [[...]] */
export function buildXlsx(sheetName, columns, rows) {
  const safeName = String(sheetName).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);
  const lastCol = colName(columns.length - 1);
  const cell = (v, r, c, s) => {
    const ref = colName(c) + r;
    if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}"${s ? ` s="${s}"` : ''}><v>${v}</v></c>`;
    return `<c r="${ref}" t="inlineStr"${s ? ` s="${s}"` : ''}><is><t xml:space="preserve">${escXl(v)}</t></is></c>`;
  };
  const header = `<row r="1">${columns.map((c, i) => cell(c.header, 1, i, 1)).join('')}</row>`;
  const body = rows.map((row, ri) => `<row r="${ri + 2}">${row.map((v, ci) => cell(v, ri + 2, ci, 2)).join('')}</row>`).join('');
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width || 14}" customWidth="1"/>`).join('')}</cols>
<sheetData>${header}${body}</sheetData>
<autoFilter ref="A1:${lastCol}${rows.length + 1}"/>
</worksheet>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Tahoma"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Tahoma"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1E3A5F"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFCBD5E1"/></left><right style="thin"><color rgb="FFCBD5E1"/></right><top style="thin"><color rgb="FFCBD5E1"/></top><bottom style="thin"><color rgb="FFCBD5E1"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
  return zip([
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
    { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escXl(safeName)}" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${escXl(safeName.replace(/'/g, "''"))}'!$A$1:$${lastCol}$${rows.length + 1}</definedName></definedNames></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/worksheets/sheet1.xml', data: sheet },
    { name: 'xl/styles.xml', data: styles },
  ]);
}

/* ---------- ข้อมูลเอกสารสำหรับ Word / หน้าพิมพ์ (จาก versionPayload) ---------- */
const fmtD = d => { if (!d) return ''; const [y, m, dd] = String(d).slice(0, 10).split('-'); return `${dd}/${m}/${y}`; };
const fmtDT = isoStr => { if (!isoStr) return ''; const d = new Date(isoStr); return d.toLocaleDateString('en-GB') + ' ' + d.toTimeString().slice(0, 5); };
async function fetchBytes(url) { const r = await fetch(url); if (!r.ok) throw new Error('fetch'); return new Uint8Array(await r.arrayBuffer()); }
/** P = versionPayload, settings = sopSettings, STATUS = labels; withBytes: ดึงรูปมาฝัง (Word) */
export async function docModel(P, settings, STATUS, withBytes = true) {
  const { sop, version: v, people } = P;
  const c = v.content || { steps: [], attachments: [] };
  const images = new Map();
  if (withBytes) {
    await Promise.all(c.steps.flatMap(s => s.images || []).map(async im => {
      try { images.set(im.url, { buf: await fetchBytes(im.url), name: im.name }); } catch { /* ข้ามรูปที่โหลดไม่ได้ */ }
    }));
  }
  let logo = null;
  if (withBytes && settings.logo_url) { try { logo = await fetchBytes(settings.logo_url); } catch { } }
  const isPub = s => ['published', 'superseded', 'obsolete'].includes(s);
  const hist = P.versions.filter(h => h.revision <= v.revision && (isPub(h.status) || h.id === v.id)).sort((a, b) => a.revision - b.revision);
  const person = (u, date, note) => u ? { name: u.display_name, position: u.position || '', date: fmtD(date), note } : null;
  const watermark = v.status === 'published' ? '' :
    v.status === 'superseded' ? 'ฉบับยกเลิก — ถูกแทนที่ด้วยฉบับใหม่แล้ว (ใช้อ้างอิงเท่านั้น)' :
      v.status === 'obsolete' ? 'เอกสารยกเลิกใช้งาน (OBSOLETE) — ห้ามนำไปใช้ปฏิบัติงาน' :
        `ฉบับร่าง — ยังไม่ได้รับอนุมัติ ห้ามใช้ปฏิบัติงาน (สถานะ: ${STATUS[v.status] || v.status})`;
  const company = settings.company_name || '';
  return {
    company, companyEn: settings.company_name_en || '', companyShort: (settings.company_name_en || company || 'LOGO').split(' ')[0],
    font: settings.doc_font || 'Tahoma', logo, logo_url: settings.logo_url || '',
    sop_number: sop.sop_number, dept_name: `${sop.dept_code} – ${sop.dept_name}`, title: v.title, revLabel: v.rev,
    status: v.status, statusLabel: STATUS[v.status], effective_date: fmtD(v.effective_date),
    review_date: fmtD(v.is_current && sop.next_review_date ? sop.next_review_date : v.review_date),
    owner: people.owner?.display_name || '', content: c,
    prepared: person(people.prepared, v.submitted_at || v.created_at),
    reviewed: v.reviewed_by ? person(people.reviewed_by, v.reviewed_at, 'ตรวจสอบผ่านระบบแล้ว') : person(people.reviewer, null),
    approved: v.approved_by ? person(people.approved_by, v.approved_at, 'อนุมัติผ่านระบบแล้ว (Electronic Approval)') : person(people.approver, null),
    history: hist.map(h => ({ rev: h.rev, date: fmtD(h.effective_date), summary: (h.change_summary || '') + (isPub(h.status) ? '' : ` [${STATUS[h.status]}]`), prepared: h.prepared_name, approved: h.approved_name, approvedDate: fmtD(h.approved_at) })),
    attachments: (c.attachments || []).map(a => a.name), images, printedAt: fmtDT(new Date().toISOString()), watermark,
  };
}
/** บันทึก Blob เป็นไฟล์ */
export function saveBlob(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
export const safeName = s => String(s).replace(/[\/:*?"<>|]+/g, ' ').slice(0, 150);
