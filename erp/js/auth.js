// ===================================================================
// auth.js — โมดูลกลางสำหรับ Login / Logout / ตรวจสอบสิทธิ์ผู้ใช้ (RBAC)
// ใช้ Firebase Authentication + Firestore (เก็บ role ของผู้ใช้)
// ===================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

// แมป role -> หน้า dashboard ของแต่ละแผนก
export const ROLE_HOME = {
  sales:      "dashboard-sales.html",
  warehouse:  "dashboard-warehouse.html",
  accounting: "dashboard-accounting.html",
  admin:      "dashboard-admin.html",
  manager:    "dashboard-manager.html",
};

// ---------- เข้าสู่ระบบ ----------
export async function login(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const profile = await getUserProfile(cred.user.uid);
  if (!profile || !profile.active) {
    await signOut(auth);
    throw new Error("บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้งาน หรือถูกระงับ กรุณาติดต่อผู้ดูแลระบบ (Admin)");
  }
  return profile;
}

export function logout() { return signOut(auth); }

// ---------- ดึงโปรไฟล์ + สิทธิ์ผู้ใช้จาก Firestore ----------
export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}

// ---------- ตัวช่วย "การ์ดหน้า" สำหรับทุกหน้า dashboard ----------
// เรียกใช้ที่ต้นไฟล์ของทุกหน้า dashboard เพื่อ:
//   1. เด้งกลับหน้า login ถ้ายังไม่ได้ login
//   2. ตรวจว่า role ตรงกับหน้านี้หรือไม่ (กันคนเดารหัส URL เข้าหน้าแผนกอื่น)
//   3. คืนค่าโปรไฟล์ผู้ใช้กลับไปให้หน้านั้นใช้งานต่อ
export function requireRole(allowedRoles) {
  return new Promise((resolve, reject) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) { window.location.href = "login.html"; return reject("not-authenticated"); }
      const profile = await getUserProfile(user.uid);
      if (!profile || !profile.active) {
        await signOut(auth);
        window.location.href = "login.html?msg=ยังไม่ได้รับสิทธิ์";
        return reject("not-authorized");
      }
      if (allowedRoles && !allowedRoles.includes(profile.role) && profile.role !== "admin") {
        // ไม่มีสิทธิ์เข้าหน้านี้ -> เด้งกลับหน้า dashboard ของตัวเอง
        window.location.href = ROLE_HOME[profile.role] || "login.html";
        return reject("wrong-role");
      }
      resolve(profile);
    });
  });
}
