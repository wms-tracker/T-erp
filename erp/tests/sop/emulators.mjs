// เปิด Firebase Emulator (Auth + Firestore) พร้อมกฎจริงของ ERP สำหรับทดสอบ sop.html ในเครื่อง
// ใช้:  node emulators.mjs   แล้ว  node seed.mjs   แล้วเปิด http://localhost:8099/erp/login.html?emulator=1
// (Java อ่าน path ภาษาไทยไม่ได้ จึงคัดลอกกฎไปไว้ในโฟลเดอร์ temp ที่เป็นภาษาอังกฤษ)
import { copyFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const work = join(tmpdir(), 'sop-emulator');
mkdirSync(work, { recursive: true });
copyFileSync(new URL('../../firestore.rules.example', import.meta.url), join(work, 'firestore.rules'));
writeFileSync(join(work, 'firebase.json'), JSON.stringify({
  firestore: { rules: 'firestore.rules' },
  emulators: { firestore: { port: 8085 }, auth: { port: 9099 }, ui: { enabled: false } },
}, null, 2));
const env = { ...process.env };
const jdkRoot = 'C:\Program Files\Microsoft';
if (existsSync(jdkRoot)) { const j = readdirSync(jdkRoot).find(d => d.startsWith('jdk-21')); if (j) env.PATH = `${jdkRoot}\${j}\bin;${env.PATH}`; }
const p = spawn('firebase emulators:start --only firestore,auth --project tong-erp', { cwd: work, env, stdio: 'inherit', shell: true });
p.on('exit', c => process.exit(c ?? 0));
