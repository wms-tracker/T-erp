/* Service Worker — PWA: ติดตั้งเป็นแอป + ออฟไลน์
   กลยุทธ์ network-first:
   - ออนไลน์  → ดึงของใหม่จาก server เสมอ (เห็นอัปเดตล่าสุดทันที) แล้วเก็บ cache ไว้
   - ออฟไลน์ → ใช้ cache ที่เก็บไว้ล่าสุด
   - /api/*   → network-only (ข้อมูลบอลต้องสด ไม่ cache)
*/
const CACHE = "ape-v3";   // ← bump เวอร์ชันเพื่อล้าง cache เก่า (แก้บั๊ก undefined Response)
const SHELL = ["/", "/ai-predictive-engine.html", "/predictions.html", "/accuracy.html",
               "/dashboard.html", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  // ลบ cache เวอร์ชันเก่าทั้งหมด
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
          .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;

  // ข้อมูลบอลต้องสด → network-only
  if (url.pathname.startsWith("/api/")) {
    e.respondWith(fetch(e.request));
    return;
  }

  // อื่นๆ → network-first: เอาของใหม่ก่อน, ถ้าออฟไลน์ค่อยใช้ cache
  // สำคัญ: ต้องคืน Response เสมอ (ไม่งั้น "Failed to convert value to Response")
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() =>
      caches.match(e.request).then(cached =>
        cached || new Response(
          "⚠️ ออฟไลน์ หรือเซิร์ฟเวอร์ไม่ทำงาน — เปิดผ่าน localhost:3000 (รัน server) หรือใช้เว็บจริง",
          { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }
        )
      )
    )
  );
});
