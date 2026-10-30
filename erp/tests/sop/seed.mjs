// ใส่บัญชีทดสอบลงใน Emulator (ไม่แตะฐานข้อมูลจริง) — รหัสผ่านทุกบัญชี: Test-1234!
const AUTH = 'http://127.0.0.1:9099', FS = 'http://127.0.0.1:8085', PROJECT = 'tong-erp', PASSWORD = 'Test-1234!';
const USERS = [
  ['admin@test.local', 'แอดมินทดสอบ', 'admin', null],
  ['manager@test.local', 'ผู้จัดการคลัง', 'manager', { sopRole: 'manager', position: 'Warehouse Operations Manager' }],
  ['obhead@test.local', 'หัวหน้า OB', 'warehouse', { sopRole: 'dept_head', deptId: 'OB', position: 'Outbound Supervisor' }],
  ['obstaff@test.local', 'พนักงาน OB', 'warehouse', { sopRole: 'author', deptId: 'OB', position: 'Outbound Officer' }],
  ['viewer@test.local', 'ผู้อ่าน', 'sales', null],
];
const fsVal = v => v === null ? { nullValue: null } : typeof v === 'boolean' ? { booleanValue: v } : { stringValue: String(v) };
async function putDoc(path, data) {
  const fields = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, fsVal(v)]));
  const r = await fetch(`${FS}/v1/projects/${PROJECT}/databases/(default)/documents/${path}`, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
  if (!r.ok) throw new Error(path + ': ' + await r.text());
}
for (const [email, name, role, sop] of USERS) {
  let r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }) });
  let j = await r.json();
  if (!r.ok) { r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }) }); j = await r.json(); }
  await putDoc(`users/${j.localId}`, { name, email, role, department: role, active: true, createdAt: '2026-10-30' });
  if (sop) await putDoc(`sopMembers/${j.localId}`, { name, email, active: true, deptId: '', erpRole: role, ...sop });
  console.log('seeded', email, role, sop?.sopRole || '');
}
