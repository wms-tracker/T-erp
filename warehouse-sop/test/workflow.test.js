'use strict';
/* ทดสอบ workflow ทั้งหมดผ่าน HTTP กับฐานข้อมูลชั่วคราว:  node test/workflow.test.js */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sop-test-'));
const PORT = 5400 + Math.floor(Math.random() * 400);
const BASE = `http://127.0.0.1:${PORT}`;
const PW = 'Sop@1234';

function client() {
  let cookie = '';
  const call = async (method, url, body, raw) => {
    const r = await fetch(BASE + url, { method, headers: { 'X-SOP-Client': '1', 'Content-Type': 'application/json', Cookie: cookie }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    if (raw) return { status: r.status, buf: Buffer.from(await r.arrayBuffer()), headers: r.headers };
    return { status: r.status, data: await r.json().catch(() => ({})) };
  };
  return { call, login: async u => { const r = await call('POST', '/api/login', { username: u, password: PW }); assert.equal(r.status, 200, `login ${u}`); } };
}
const ok = (r, msg) => { assert.ok(r.status === 200, `${msg}: expected 200 got ${r.status} ${JSON.stringify(r.data)}`); return r.data; };
const no = (r, status, msg) => { assert.equal(r.status, status, `${msg}: expected ${status} got ${r.status} ${JSON.stringify(r.data)}`); };

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], { env: { ...process.env, PORT, HOST: '127.0.0.1', SOP_DATA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  for (let i = 0; i < 50 && !log.includes('localhost'); i++) await new Promise(r => setTimeout(r, 100));
  let passed = 0;
  const step = async (name, fn) => { await fn(); passed++; console.log('  ✓ ' + name); };
  try {
    const staff = client(), head = client(), ibHead = client(), mgr = client(), viewer = client(), admin = client(), anon = client();
    await Promise.all([staff.login('ob.staff'), head.login('ob.head'), ibHead.login('ib.head'), mgr.login('manager'), viewer.login('viewer'), admin.login('admin')]);
    const boot = ok(await admin.call('GET', '/api/bootstrap'), 'bootstrap');
    const dep = c => boot.departments.find(d => d.code === c).id;
    const uid = n => boot.users.find(u => u.username === n).id;
    let sopId, vid;

    await step('ต้องล็อกอินก่อนใช้ API และกัน CSRF', async () => {
      no(await anon.call('GET', '/api/sops'), 401, 'anon');
      const r = await fetch(BASE + '/api/logout', { method: 'POST' }); assert.equal(r.status, 401);
    });
    await step('ผู้จัดทำสร้าง SOP ได้เฉพาะแผนกตนเอง', async () => {
      no(await staff.call('POST', '/api/sops', { department_id: dep('IB'), title: 'x' }), 403, 'other dept');
      const r = ok(await staff.call('POST', '/api/sops', { department_id: dep('OB'), title: 'การหยิบสินค้า (Picking)', owner_id: uid('ob.staff'), content: { objective: 'หยิบให้ถูก', steps: [{ title: 'รับใบงาน', detail: 'จาก WMS', images: [] }] } }), 'create');
      assert.equal(r.sop_number, 'OB-SOP-001'); sopId = r.id; vid = r.version_id;
    });
    await step('ผู้อ่านมองไม่เห็นฉบับร่าง', async () => {
      const list = ok(await viewer.call('GET', '/api/sops'), 'list');
      assert.equal(list.length, 0);
      no(await viewer.call('GET', '/api/versions/' + vid), 403, 'viewer draft');
    });
    await step('ส่งตรวจไม่ได้ถ้าข้อมูลไม่ครบ', async () => {
      no(await staff.call('POST', `/api/versions/${vid}/action`, { action: 'submit' }), 400, 'incomplete');
    });
    await step('ตั้งผู้จัดทำเป็นผู้อนุมัติตนเองไม่ได้ / ผู้ตรวจต้องมีบทบาทถูกต้อง', async () => {
      const P = ok(await staff.call('GET', '/api/versions/' + vid), 'get');
      const body = { title: P.version.title, content: { ...P.version.content, scope: 'คลัง A', responsibility: 'พนักงาน OB' }, owner_id: uid('ob.staff'), effective_date: '2026-11-01', review_date: '2027-11-01', row_ver: P.version.row_ver };
      no(await staff.call('PUT', '/api/versions/' + vid, { ...body, reviewer_id: uid('viewer') }), 400, 'bad reviewer role');
      no(await staff.call('PUT', '/api/versions/' + vid, { ...body, approver_id: uid('ob.head') }), 400, 'approver must be manager');
      ok(await staff.call('PUT', '/api/versions/' + vid, { ...body, approver_id: uid('manager') }), 'save');
    });
    await step('บันทึกชนกัน (row_ver เก่า) ถูกปฏิเสธ 409', async () => {
      no(await staff.call('PUT', '/api/versions/' + vid, { title: 'x', content: {}, row_ver: 1 }), 409, 'conflict');
    });
    await step('ส่งตรวจ → ล็อกการแก้ไข', async () => {
      ok(await staff.call('POST', `/api/versions/${vid}/action`, { action: 'submit', comment: 'ฝากตรวจ' }), 'submit');
      const P = ok(await staff.call('GET', '/api/versions/' + vid), 'get');
      assert.equal(P.version.status, 'submitted');
      no(await staff.call('PUT', '/api/versions/' + vid, { title: 'y', content: {} }), 403, 'edit while submitted');
    });
    await step('ผู้จัดทำตรวจ/อนุมัติของตนเองไม่ได้ และหัวหน้าแผนกอื่นตรวจไม่ได้', async () => {
      no(await staff.call('POST', `/api/versions/${vid}/action`, { action: 'review_pass' }), 403, 'self review');
      no(await ibHead.call('POST', `/api/versions/${vid}/action`, { action: 'review_pass' }), 403, 'other dept head');
      no(await mgr.call('POST', `/api/versions/${vid}/action`, { action: 'approve' }), 400, 'approve before review');
    });
    await step('หัวหน้าแผนก: รับตรวจ → ตรวจผ่าน', async () => {
      ok(await head.call('POST', `/api/versions/${vid}/action`, { action: 'start_review' }), 'start');
      ok(await head.call('POST', `/api/versions/${vid}/action`, { action: 'review_pass', comment: 'ถูกต้อง' }), 'pass');
      const t = ok(await mgr.call('GET', '/api/tasks'), 'tasks');
      assert.ok(t.some(x => x.version_id === vid && x.kind === 'approve'), 'manager has approve task');
    });
    await step('ส่งกลับต้องระบุเหตุผล → Revision Required', async () => {
      no(await mgr.call('POST', `/api/versions/${vid}/action`, { action: 'return' }), 400, 'no reason');
      ok(await mgr.call('POST', `/api/versions/${vid}/action`, { action: 'return', comment: 'เพิ่ม KPI' }), 'return');
      const P = ok(await staff.call('GET', '/api/versions/' + vid), 'get');
      assert.equal(P.version.status, 'revision_required');
      assert.ok(P.log.some(l => l.action === 'return' && l.comment === 'เพิ่ม KPI' && l.user_name && l.at));
    });
    await step('แก้ไข → ส่งใหม่ → ตรวจ → อนุมัติ → Published (ล็อกถาวร)', async () => {
      const P = ok(await staff.call('GET', '/api/versions/' + vid), 'get');
      ok(await staff.call('PUT', '/api/versions/' + vid, { title: P.version.title, content: { ...P.version.content, kpi: 'Accuracy 99.8%' }, owner_id: P.version.owner_id, approver_id: P.version.approver_id, effective_date: P.version.effective_date, review_date: P.version.review_date, row_ver: P.version.row_ver }), 'save');
      ok(await staff.call('POST', `/api/versions/${vid}/action`, { action: 'submit' }), 'resubmit');
      ok(await head.call('POST', `/api/versions/${vid}/action`, { action: 'review_pass' }), 'pass');
      ok(await mgr.call('POST', `/api/versions/${vid}/action`, { action: 'approve', comment: 'อนุมัติ' }), 'approve');
      const Q = ok(await staff.call('GET', '/api/versions/' + vid), 'get');
      assert.equal(Q.version.status, 'published'); assert.equal(Q.sop.current_version_id, vid); assert.equal(Q.version.locked, 1);
      no(await admin.call('PUT', '/api/versions/' + vid, { title: 'hack', content: {} }), 423, 'locked');
    });
    await step('ผู้อ่านเห็นฉบับประกาศใช้', async () => {
      const list = ok(await viewer.call('GET', '/api/sops'), 'list');
      assert.equal(list.length, 1); assert.equal(list[0].status, 'published');
      ok(await viewer.call('GET', '/api/versions/' + vid), 'viewer published');
    });
    let v1;
    await step('สร้าง Rev.01 — ฉบับเดิมยังใช้งาน และผู้อ่านไม่เห็นฉบับร่าง', async () => {
      no(await viewer.call('POST', `/api/sops/${sopId}/revise`, {}), 403, 'viewer revise');
      v1 = ok(await staff.call('POST', `/api/sops/${sopId}/revise`, { change_summary: 'ปรับขั้นตอน' }), 'revise').version_id;
      no(await staff.call('POST', `/api/sops/${sopId}/revise`, {}), 409, 'double revise');
      const P = ok(await staff.call('GET', '/api/versions/' + v1), 'get');
      assert.equal(P.version.rev, 'Rev.01');
      const vl = ok(await viewer.call('GET', '/api/sops'), 'viewer list');
      assert.equal(vl[0].working, null); assert.equal(vl[0].current.rev, 'Rev.00');
      no(await viewer.call('GET', '/api/versions/' + v1), 403, 'viewer sees rev01 draft');
      // ค้นหาด้วยคำในเนื้อหา
      assert.equal(ok(await viewer.call('GET', '/api/sops?q=WMS'), 'search').length, 1);
      assert.equal(ok(await viewer.call('GET', '/api/sops?q=ไม่มีคำนี้'), 'search').length, 0);
    });
    await step('อนุมัติ Rev.01 → Rev.00 เป็น Superseded (เนื้อหาเดิมไม่ถูกเขียนทับ)', async () => {
      const P = ok(await staff.call('GET', '/api/versions/' + v1), 'get');
      ok(await staff.call('PUT', '/api/versions/' + v1, { title: P.version.title, content: { ...P.version.content, objective: 'หยิบให้ถูกและเร็ว' }, owner_id: P.version.owner_id, effective_date: '2027-01-01', review_date: '2028-01-01', change_summary: 'ปรับวัตถุประสงค์', row_ver: P.version.row_ver }), 'save');
      ok(await staff.call('POST', `/api/versions/${v1}/action`, { action: 'submit' }), 'submit');
      ok(await head.call('POST', `/api/versions/${v1}/action`, { action: 'review_pass' }), 'pass');
      ok(await mgr.call('POST', `/api/versions/${v1}/action`, { action: 'approve' }), 'approve');
      const old = ok(await viewer.call('GET', '/api/versions/' + vid), 'old');
      assert.equal(old.version.status, 'superseded'); assert.equal(old.version.content.objective, 'หยิบให้ถูก');
      assert.equal(old.versions.length, 2);
    });
    await step('Manager ที่ร่วมแก้ไขเนื้อหา อนุมัติฉบับนั้นไม่ได้', async () => {
      const r = ok(await mgr.call('POST', '/api/sops', { department_id: dep('IB'), title: 'การรับสินค้า', owner_id: uid('ib.head'), effective_date: '2026-12-01', review_date: '2027-12-01', content: { objective: 'o', scope: 's', responsibility: 'r', steps: [{ title: 'ตรวจรับ' }] } }), 'mgr create');
      ok(await mgr.call('POST', `/api/versions/${r.version_id}/action`, { action: 'submit' }), 'submit');
      ok(await ibHead.call('POST', `/api/versions/${r.version_id}/action`, { action: 'review_pass' }), 'pass');
      no(await mgr.call('POST', `/api/versions/${r.version_id}/action`, { action: 'approve' }), 403, 'self approve');
      ok(await admin.call('POST', `/api/versions/${r.version_id}/action`, { action: 'approve' }), 'admin approve');
    });
    await step('ส่งออก Word / Excel เป็นไฟล์ zip ที่ถูกต้อง', async () => {
      const d = await viewer.call('GET', `/api/versions/${v1}/docx`, null, true);
      assert.equal(d.status, 200); assert.equal(d.buf.slice(0, 2).toString(), 'PK');
      fs.writeFileSync(path.join(dataDir, 'out.docx'), d.buf);
      const x = await viewer.call('GET', '/api/export/register.xlsx', null, true);
      assert.equal(x.status, 200); assert.equal(x.buf.slice(0, 2).toString(), 'PK');
      fs.writeFileSync(path.join(dataDir, 'out.xlsx'), x.buf);
    });
    await step('Dashboard นับตัวเลขถูกต้อง', async () => {
      const d = ok(await mgr.call('GET', '/api/dashboard'), 'dash');
      assert.equal(d.kpi.total, 2); assert.equal(d.kpi.active, 2); assert.equal(d.kpi.pending, 0);
      assert.equal(d.byDept.find(x => x.code === 'OB').published, 1);
      assert.ok(d.monthly.at(-1).approve >= 3);
    });
    await step('บันทึกผลทบทวน (ไม่ออก Rev. ใหม่) และยกเลิกใช้งาน SOP', async () => {
      no(await staff.call('POST', `/api/sops/${sopId}/review-date`, { date: '2029-01-01', comment: 'ok' }), 403, 'staff');
      ok(await head.call('POST', `/api/sops/${sopId}/review-date`, { date: '2029-01-01', comment: 'ยังเป็นปัจจุบัน' }), 'review date');
      no(await mgr.call('POST', `/api/versions/${v1}/action`, { action: 'obsolete' }), 400, 'no reason');
      ok(await mgr.call('POST', `/api/versions/${v1}/action`, { action: 'obsolete', comment: 'เลิกใช้กระบวนการ' }), 'obsolete');
      const l = ok(await viewer.call('GET', '/api/sops?status=obsolete'), 'list');
      assert.equal(l.length, 1); assert.equal(l[0].next_review_date, '2029-01-01');
    });
    await step('เพิ่ม/ลบแผนกได้โดยไม่แก้โค้ด (ลบไม่ได้ถ้ามีข้อมูล)', async () => {
      no(await mgr.call('POST', '/api/departments', { code: 'QA', name: 'Quality' }), 403, 'non-admin');
      const r = ok(await admin.call('POST', '/api/departments', { code: 'qa', name: 'Quality Assurance' }), 'add');
      assert.equal(ok(await admin.call('GET', '/api/sops/next-number?dept=' + r.id), 'n').sop_number, 'QA-SOP-001');
      no(await admin.call('DELETE', '/api/departments/' + dep('OB')), 409, 'delete used');
      ok(await admin.call('DELETE', '/api/departments/' + r.id), 'delete empty');
    });
    await step('รูปภาพในขั้นตอน + โลโก้ + ลายน้ำฉบับร่าง ถูกฝังใน Word', async () => {
      const zlib = require('zlib');
      const png = (w, h, rgb) => {
        const crc = b => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; } return ~c >>> 0; };
        const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
        const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
        const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(rgb, y * (w * 3 + 1) + 1 + x * 3);
        return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
      };
      const logo = ok(await admin.call('POST', '/api/files', { name: 'logo.png', mime: 'image/png', data: png(120, 60, [30, 58, 95]).toString('base64') }), 'logo');
      ok(await admin.call('PUT', '/api/settings', { logo_file_id: logo.id }), 'set logo');
      const img = ok(await staff.call('POST', '/api/files', { name: 'step.png', mime: 'image/png', data: png(400, 240, [245, 179, 36]).toString('base64') }), 'img');
      const pdf = ok(await staff.call('POST', '/api/files', { name: 'คู่มือ.pdf', mime: 'application/pdf', data: Buffer.from('%PDF-1.4').toString('base64') }), 'pdf');
      no(await viewer.call('POST', '/api/files', { name: 'a.png', data: 'AA==' }), 403, 'viewer upload');
      no(await staff.call('POST', '/api/files', { name: 'a.exe', data: 'AA==' }), 400, 'exe');
      const r = ok(await staff.call('POST', '/api/sops', { department_id: dep('OB'), title: 'การแพ็คสินค้า', content: { objective: 'o', steps: [{ title: 'วางกล่อง', detail: 'ดูรูป', images: [img.id] }], attachments: [pdf.id] } }), 'create');
      const d = await staff.call('GET', `/api/versions/${r.version_id}/docx`, null, true);
      assert.equal(d.status, 200);
      fs.writeFileSync(path.join(dataDir, 'out-img.docx'), d.buf);
      const f = await staff.call('GET', `/api/files/${pdf.id}?download=1`, null, true);
      assert.equal(f.status, 200); assert.ok(f.headers.get('content-disposition').includes('attachment'));
    });
    console.log(`\n${passed} tests passed. Output files in ${dataDir}`);
  } catch (e) {
    console.error('\n✗ FAILED:', e.message, '\n--- server log ---\n' + log);
    process.exitCode = 1;
  } finally { srv.kill(); }
})();
