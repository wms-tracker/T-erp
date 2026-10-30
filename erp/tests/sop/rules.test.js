// ทดสอบโมดูล SOP: รันโค้ดจริง erp/js/sop/data.js กับ Firestore emulator + กฎจริงใน erp/firestore.rules.example
// วิธีรัน:  cd erp/tests/sop && npm install && npm test   (ต้องมี Java 21 และ firebase-tools)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, deleteDoc, collection, getDocs, writeBatch, serverTimestamp } from 'firebase/firestore';

register('./loader.mjs', import.meta.url);
const DATA = new URL('../../js/sop/data.js', import.meta.url).href;

const USERS = {
  admin:   { role: 'admin', name: 'แอดมิน' },
  mgr:     { role: 'manager', name: 'ผู้จัดการ', sop: { sopRole: 'manager' } },
  obHead:  { role: 'warehouse', name: 'หัวหน้า OB', sop: { sopRole: 'dept_head', deptId: 'OB' } },
  obStaff: { role: 'warehouse', name: 'พนักงาน OB', sop: { sopRole: 'author', deptId: 'OB' } },
  ibHead:  { role: 'warehouse', name: 'หัวหน้า IB', sop: { sopRole: 'dept_head', deptId: 'IB' } },
  viewer:  { role: 'sales', name: 'ผู้อ่าน' },
};
let env; const api = {}; const dbs = {};

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-sop',
    firestore: { rules: readFileSync(new URL('../../firestore.rules.example', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8085 },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const d = ctx.firestore();
    for (const [uid, u] of Object.entries(USERS)) {
      await setDoc(doc(d, 'users', uid), { name: u.name, role: u.role, active: true });
      if (u.sop) await setDoc(doc(d, 'sopMembers', uid), { name: u.name, active: true, deptId: '', ...u.sop });
    }
    await setDoc(doc(d, 'sopMembers', 'admin'), { name: 'แอดมิน', sopRole: 'admin', active: true, deptId: '' });
  });
  globalThis.__sopDbs = {};
  for (const [uid, u] of Object.entries(USERS)) {
    dbs[uid] = env.authenticatedContext(uid).firestore();
    globalThis.__sopDbs[uid] = dbs[uid];
    api[uid] = await import(`${DATA}?u=${uid}`);
  }
  await api.admin.init({ uid: 'admin', ...USERS.admin, active: true }); // สร้างแผนกเริ่มต้น
  for (const uid of Object.keys(USERS)) if (uid !== 'admin') await api[uid].init({ uid, ...USERS[uid], active: true });
});
after(async () => { await env?.cleanup(); });

const full = { objective: 'หยิบให้ถูก', scope: 'คลัง A', responsibility: 'พนักงาน OB', steps: [{ title: 'รับใบงาน', detail: 'จาก WMS', images: [] }] };
const rejects = (p, re) => assert.rejects(p, e => { if (re && !re.test(e.message)) throw new Error('unexpected: ' + e.message); return true; });
let sopId, v0, v1;

test('แอดมินสร้างแผนกเริ่มต้น 5 แผนก และทุกคนอ่านได้', () => {
  assert.deepEqual(api.viewer.S.depts.map(d => d.code), ['OB', 'IB', 'INV', 'LOG', 'TRN']);
  assert.equal(api.obStaff.S.role, 'author');
  assert.equal(api.mgr.S.role, 'manager');
  assert.equal(api.viewer.S.role, 'viewer');
});

test('ผู้จัดทำสร้าง SOP ได้เฉพาะแผนกตัวเอง (กฎฐานข้อมูลก็ปฏิเสธ)', async () => {
  await rejects(api.obStaff.createSop({ department_id: 'IB', title: 'x' }), /ไม่มีสิทธิ์/);
  // ลองข้ามหน้าเว็บ เขียนตรงลงฐานข้อมูล
  const b = writeBatch(dbs.obStaff);
  b.set(doc(dbs.obStaff, 'sopVersions', 'IB-X_r0'), { sop_id: 'IB-X', department_id: 'IB', revision: 0, status: 'draft', locked: false, row_ver: 1, prepared_by: 'obStaff', editors: [], reviewed_by: null, approved_by: null, reviewer_id: null, approver_id: null });
  b.set(doc(dbs.obStaff, 'sops', 'IB-X'), { sop_number: 'IB-X', department_id: 'IB', created_by: 'obStaff', current_version_id: null, has_current: false, is_obsolete: false, last_rev: 0, working_version_id: 'IB-X_r0' });
  await assertFails(b.commit());
  const r = await api.obStaff.createSop({ department_id: 'OB', title: 'การหยิบสินค้า (Picking)', owner_id: 'obStaff', approver_id: 'mgr', content: { ...full, objective: '' } });
  assert.equal(r.sop_number, 'OB-SOP-001'); sopId = r.id; v0 = r.version_id;
});

test('เลข SOP ซ้ำไม่ได้', async () => {
  await rejects(api.obHead.createSop({ department_id: 'OB', sop_number: 'OB-SOP-001', title: 'ซ้ำ' }), /มีอยู่แล้ว/);
});

test('ผู้อ่าน / แผนกอื่น มองไม่เห็นฉบับร่าง', async () => {
  assert.equal((await api.viewer.listSops()).length, 0);
  assert.equal((await api.ibHead.listSops()).length, 0);
  await rejects(api.viewer.versionPayload(v0), /ไม่มีสิทธิ์/);
  await assertFails(getDoc(doc(dbs.viewer, 'sopVersions', v0)));
  assert.equal((await api.obHead.listSops()).length, 1);
});

test('ส่งตรวจไม่ได้ถ้าข้อมูลไม่ครบ (ทั้งหน้าเว็บและกฎ)', async () => {
  await rejects(api.obStaff.action(v0, 'submit'), /ข้อมูลยังไม่ครบ/);
  await assertFails(updateDoc(doc(dbs.obStaff, 'sopVersions', v0), { status: 'submitted', row_ver: 2 }));
});

test('ผู้จัดทำตั้งตัวเองเป็นผู้อนุมัติไม่ได้ / ผู้ตรวจต้องมีบทบาท', async () => {
  const P = await api.obStaff.versionPayload(v0);
  const body = { title: P.version.title, content: { ...full }, owner_id: 'obStaff', effective_date: '2026-11-01', review_date: '2027-11-01', row_ver: P.version.row_ver };
  await rejects(api.obStaff.saveVersion(v0, { ...body, approver_id: 'obHead' }), /Manager/);
  await rejects(api.obStaff.saveVersion(v0, { ...body, reviewer_id: 'obStaff' }), /ผู้จัดทำ/);
  await assertFails(updateDoc(doc(dbs.obStaff, 'sopVersions', v0), { approver_id: 'obStaff', row_ver: P.version.row_ver + 1, updated_by: 'obStaff' }));
  await api.obStaff.saveVersion(v0, { ...body, approver_id: 'mgr' });
});

test('บันทึกชนกัน (row_ver เก่า) ถูกปฏิเสธ', async () => {
  await rejects(api.obStaff.saveVersion(v0, { title: 'x', content: full, row_ver: 1 }), /ผู้ใช้อื่น/);
});

test('ส่งตรวจ → ล็อกการแก้ไข', async () => {
  await api.obStaff.action(v0, 'submit', 'ฝากตรวจ');
  const P = await api.obStaff.versionPayload(v0);
  assert.equal(P.version.status, 'submitted');
  assert.equal(P.permissions.canEdit, false);
  await assertFails(updateDoc(doc(dbs.obStaff, 'sopVersions', v0), { title: 'แอบแก้', row_ver: P.version.row_ver + 1, updated_by: 'obStaff' }));
});

test('ผู้จัดทำอนุมัติเองไม่ได้ / หัวหน้าแผนกอื่นตรวจไม่ได้ / ข้ามขั้นไม่ได้', async () => {
  await rejects(api.obStaff.action(v0, 'review_pass'), /ผู้จัดทำ/);
  await rejects(api.ibHead.action(v0, 'review_pass'));
  await rejects(api.mgr.action(v0, 'approve'), /สถานะ/);
  // ลองเขียนตรง: ผู้จัดทำเปลี่ยนเป็น published เอง
  await assertFails(updateDoc(doc(dbs.obStaff, 'sopVersions', v0), { status: 'published', approved_by: 'obStaff', locked: true, row_ver: 9 }));
});

test('หัวหน้าแผนก: รับตรวจ → ตรวจผ่าน; ผู้จัดการเห็นงานรออนุมัติ', async () => {
  await api.obHead.action(v0, 'start_review');
  await api.obHead.action(v0, 'review_pass', 'ถูกต้อง');
  const t = await api.mgr.myTasks();
  assert.ok(t.some(x => x.version_id === v0 && x.kind === 'approve'));
});

test('ส่งกลับต้องมีเหตุผล (กฎก็บังคับ) → Revision Required', async () => {
  await rejects(api.mgr.action(v0, 'return'), /เหตุผล/);
  await assertFails(updateDoc(doc(dbs.mgr, 'sopVersions', v0), { status: 'revision_required', row_ver: 99 }));
  await api.mgr.action(v0, 'return', 'เพิ่ม KPI');
  const P = await api.obStaff.versionPayload(v0);
  assert.equal(P.version.status, 'revision_required');
  assert.ok(P.log.some(l => l.action === 'return' && l.comment === 'เพิ่ม KPI' && l.user_name === 'ผู้จัดการ'));
  const tasks = await api.obStaff.myTasks();
  assert.ok(tasks.some(x => x.kind === 'fix'));
});

test('แก้ → ส่งใหม่ → ตรวจ → อนุมัติ → Published และล็อกถาวร', async () => {
  const P = await api.obStaff.versionPayload(v0);
  await api.obStaff.saveVersion(v0, { title: P.version.title, content: { ...P.version.content, kpi: 'Accuracy 99.8%' }, owner_id: 'obStaff', approver_id: 'mgr', effective_date: '2026-11-01', review_date: '2027-11-01', row_ver: P.version.row_ver });
  await api.obStaff.action(v0, 'submit');
  await api.obHead.action(v0, 'review_pass');
  await api.mgr.action(v0, 'approve', 'อนุมัติ');
  const Q = await api.viewer.versionPayload(v0);
  assert.equal(Q.version.status, 'published');
  assert.equal(Q.sop.current_version_id, v0);
  await assertFails(updateDoc(doc(dbs.admin, 'sopVersions', v0), { title: 'hack', row_ver: 99, updated_by: 'admin' }));
  await assertFails(deleteDoc(doc(dbs.admin, 'sopVersions', v0)));
});

test('ผู้อ่านเห็นฉบับประกาศใช้ และค้นหาจากเนื้อหาได้', async () => {
  const l = await api.viewer.listSops();
  assert.equal(l.length, 1); assert.equal(l[0].status, 'published');
  assert.equal((await api.viewer.listSops({ q: 'คลัง' })).length, 1);
  assert.equal((await api.viewer.listSops({ q: 'ไม่มีคำนี้' })).length, 0);
});

test('สร้าง Rev.01 — ฉบับเดิมยังใช้งาน ผู้อ่านไม่เห็นร่าง', async () => {
  await rejects(api.viewer.revise(sopId), /ไม่มีสิทธิ์/);
  v1 = (await api.obStaff.revise(sopId, 'ปรับขั้นตอน')).version_id;
  assert.equal(v1, `${sopId}_r1`);
  await rejects(api.obStaff.revise(sopId), /อยู่แล้ว/);
  const vl = await api.viewer.listSops();
  assert.equal(vl[0].working, null); assert.equal(vl[0].current.rev, 'Rev.00');
  await assertFails(getDoc(doc(dbs.viewer, 'sopVersions', v1)));
});

test('อนุมัติ Rev.01 → Rev.00 Superseded และเนื้อหาเดิมไม่ถูกเขียนทับ', async () => {
  const P = await api.obStaff.versionPayload(v1);
  await api.obStaff.saveVersion(v1, { title: P.version.title, content: { ...P.version.content, objective: 'หยิบให้ถูกและเร็ว' }, owner_id: 'obStaff', approver_id: 'mgr', effective_date: '2027-01-01', review_date: '2028-01-01', change_summary: 'ปรับวัตถุประสงค์', row_ver: P.version.row_ver });
  await api.obStaff.action(v1, 'submit');
  await api.obHead.action(v1, 'review_pass');
  await api.mgr.action(v1, 'approve');
  const old = await api.viewer.versionPayload(v0);
  assert.equal(old.version.status, 'superseded');
  assert.equal(old.version.content.objective, 'หยิบให้ถูก');
  assert.equal(old.versions.length, 2);
});

test('ผู้ที่ร่วมแก้ไขเนื้อหา อนุมัติฉบับนั้นไม่ได้', async () => {
  const r = await api.obStaff.createSop({ department_id: 'OB', title: 'การแพ็คสินค้า', owner_id: 'obStaff', effective_date: '2026-12-01', review_date: '2027-12-01', content: full });
  const P = await api.mgr.versionPayload(r.version_id);
  await api.mgr.saveVersion(r.version_id, { title: P.version.title, content: P.version.content, owner_id: 'obStaff', effective_date: '2026-12-01', review_date: '2027-12-01', row_ver: P.version.row_ver });
  await api.obStaff.action(r.version_id, 'submit');
  await api.obHead.action(r.version_id, 'review_pass');
  await rejects(api.mgr.action(r.version_id, 'approve'), /ร่วมแก้ไข/);
  await api.admin.action(r.version_id, 'approve');
});

test('Dashboard นับตัวเลขถูกต้อง', async () => {
  const d = await api.mgr.dashboard();
  assert.equal(d.kpi.total, 2); assert.equal(d.kpi.active, 2); assert.equal(d.kpi.pending, 0);
  assert.equal(d.byDept.find(x => x.code === 'OB').published, 2);
  assert.ok(d.monthly.at(-1).approve >= 3);
});

test('ลบฉบับร่างที่ไม่เคยประกาศใช้ได้ (เฉพาะผู้จัดทำ/ผู้ดูแล)', async () => {
  const r = await api.obStaff.createSop({ department_id: 'OB', title: 'ร่างทิ้ง' });
  await rejects(api.obHead.deleteDraft(r.version_id), /ลบได้เฉพาะ/);
  await api.obStaff.deleteDraft(r.version_id);
  await env.withSecurityRulesDisabled(async ctx => {
    assert.equal((await getDoc(doc(ctx.firestore(), 'sops', r.id))).exists(), false);
    assert.equal((await getDoc(doc(ctx.firestore(), 'sopVersions', r.version_id))).data().status, 'cancelled');
  });
});

test('บันทึกผลทบทวน และยกเลิกใช้งาน (ต้องมีเหตุผล)', async () => {
  await rejects(api.obStaff.setReviewDate(sopId, '2029-01-01', 'ok'));
  await api.obHead.setReviewDate(sopId, '2029-01-01', 'ยังเป็นปัจจุบัน');
  await rejects(api.mgr.action(v1, 'obsolete'), /เหตุผล/);
  await api.mgr.action(v1, 'obsolete', 'เลิกใช้กระบวนการ');
  const l = await api.viewer.listSops({ status: 'obsolete' });
  assert.equal(l.length, 1); assert.equal(l[0].next_review_date, '2029-01-01');
});

test('ตั้งค่า/แผนก/สมาชิก แก้ได้เฉพาะแอดมิน; log แก้/ลบไม่ได้', async () => {
  await assertFails(setDoc(doc(dbs.mgr, 'sopDepartments', 'QA'), { code: 'QA', name: 'x' }));
  await assertFails(setDoc(doc(dbs.obHead, 'sopMembers', 'obHead'), { sopRole: 'manager' }));
  await api.admin.saveDepartment(null, { code: 'qa', name: 'Quality' });
  const qa = api.admin.S.depts.find(d => d.code === 'QA');
  assert.equal(await api.admin.nextNumber(qa.id), 'QA-SOP-001');
  await rejects(api.admin.deleteDepartment('OB'), /ลบไม่ได้/);
  await api.admin.deleteDepartment(qa.id);
  const logs = await getDocs(collection(dbs.mgr, 'sopLog'));
  await assertFails(updateDoc(logs.docs[0].ref, { comment: 'แก้ประวัติ' }));
  await assertFails(deleteDoc(logs.docs[0].ref));
  await assertFails(setDoc(doc(dbs.obStaff, 'sopLog', 'fake'), { user_id: 'mgr', action: 'approve', at: serverTimestamp() }));
});
