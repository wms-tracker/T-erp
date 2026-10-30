'use strict';
/* สร้างเอกสาร SOP เป็น Microsoft Word (.docx) ตามรูปแบบมาตรฐานองค์กร
   - หัวกระดาษ: โลโก้ / ชื่อบริษัท / ชื่อเอกสาร / รหัสเอกสาร / Rev / วันที่มีผล / หน้า X จาก Y
   - ตารางผู้จัดทำ / ผู้ตรวจสอบ / ผู้อนุมัติ, เนื้อหา, ขั้นตอน (พร้อมรูป), ประวัติการแก้ไข */
const { zip } = require('./zip');

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
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
    (k ? `<w:r>${rp}<w:br/></w:r>` : '') + `<w:r>${rp}<w:t xml:space="preserve">${esc(line)}</w:t></w:r>`).join('');
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
  if (buf[0] === 0x89 && buf[1] === 0x50) return { ext: 'png', w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf[0] === 0x47 && buf[1] === 0x49) return { ext: 'gif', w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
  if (buf[0] === 0xFF && buf[1] === 0xD8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xFF) { i++; continue; }
      const m = buf[i + 1];
      if (m >= 0xC0 && m <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(m)) return { ext: 'jpeg', h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { i += 2; continue; }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

/* ---------- สร้างเอกสาร ---------- */
function buildDocx(m) {
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
      const img = m.images && m.images.get(Number(fid));
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

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${esc(font)}" w:hAnsi="${esc(font)}" w:eastAsia="${esc(font)}" w:cs="${esc(font)}"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="en-US" w:bidi="th-TH"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="60" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>`;

  const rels = (arr) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${arr.join('')}</Relationships>`;
  docRels.unshift(
    '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
    '<Relationship Id="rIdHdr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>',
    '<Relationship Id="rIdFtr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>');

  const files = [
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="gif" ContentType="image/gif"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>` },
    { name: '_rels/.rels', data: rels(['<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>', '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>']) },
    { name: 'docProps/core.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(m.sop_number + ' ' + m.title)}</dc:title><dc:creator>${esc(m.company)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>` },
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

module.exports = { buildDocx, imageInfo };
