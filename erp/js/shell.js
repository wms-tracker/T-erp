// ===================================================================
// shell.js — สร้างโครง sidebar + header ของทุกหน้า dashboard ให้เหมือนกัน
// แต่ละหน้าจะเรียก renderShell(profile, currentPageKey) แล้วแทรกเนื้อหาตัวเองลงใน #main-content
// ===================================================================
import { logout } from "./auth.js";

const ROLE_LABEL = {
  sales: "ฝ่ายขาย (Sales)",
  warehouse: "คลังสินค้า (Warehouse)",
  accounting: "บัญชี (Accounting)",
  admin: "แอดมิน (Admin)",
  manager: "ผู้บริหาร (Manager)",
};

// เมนูของแต่ละแผนก: key ต้องตรงกับ "page" ที่ส่งเข้ามาตอนเรียก renderShell
const NAV = {
  sales: [
    { key: "orders",    label: "📋 ออเดอร์ของฉัน",      href: "dashboard-sales.html" },
    { key: "stock",     label: "📦 ตรวจสอบสต๊อก (ดูอย่างเดียว)", href: "view-stock.html" },
    { key: "shipping",  label: "🚚 ติดตามสถานะจัดส่ง",   href: "view-shipping.html" },
  ],
  warehouse: [
    { key: "inbound",   label: "📥 รับสินค้าเข้า (Inbound)",      href: "dashboard-warehouse.html#inbound" },
    { key: "putaway",   label: "🗄 จัดเก็บเข้าตำแหน่ง (Put Away)", href: "dashboard-warehouse.html#putaway" },
    { key: "stock",     label: "📦 จัดการสต๊อกสินค้า",            href: "dashboard-warehouse.html#stock" },
    { key: "picking",   label: "🛒 หยิบสินค้า (Picking)",          href: "dashboard-warehouse.html#picking" },
    { key: "packing",   label: "📦 แพ็คสินค้า (Packing)",          href: "dashboard-warehouse.html#packing" },
    { key: "qc",        label: "✅ ตรวจสอบสินค้า (QC)",            href: "dashboard-warehouse.html#qc" },
    { key: "outbound",  label: "🚚 จัดส่งสินค้า (Outbound)",       href: "dashboard-warehouse.html#outbound" },
    { key: "cyclecount",label: "🔢 ตรวจนับสต๊อก (Cycle Count)",    href: "dashboard-warehouse.html#cyclecount" },
  ],
  accounting: [
    { key: "invoices",  label: "🧾 ใบแจ้งหนี้ / ใบกำกับภาษี", href: "dashboard-accounting.html#invoices" },
    { key: "payments",  label: "💵 รับ-จ่ายเงิน",              href: "dashboard-accounting.html#payments" },
    { key: "ar-ap",     label: "🔁 กระทบยอดลูกหนี้/เจ้าหนี้",  href: "dashboard-accounting.html#arap" },
    { key: "reports",   label: "📊 รายงานทางการเงิน",          href: "dashboard-accounting.html#reports" },
  ],
  admin: [
    { key: "orders",    label: "📋 ออเดอร์ทั้งหมด",         href: "dashboard-admin.html#orders" },
    { key: "documents", label: "📑 เอกสารขาย/ขนส่ง",         href: "dashboard-admin.html#documents" },
    { key: "routing",   label: "🗺 จัดรูทขนส่ง / คัตออฟ",     href: "dashboard-admin.html#routing" },
    { key: "users",     label: "👥 จัดการผู้ใช้งาน & สิทธิ์", href: "dashboard-admin.html#users" },
    { key: "reports",   label: "📊 รายงานประจำวัน",          href: "dashboard-admin.html#reports" },
  ],
  manager: [
    { key: "overview",  label: "📊 ภาพรวมทุกแผนก", href: "dashboard-manager.html#overview" },
    { key: "orders",    label: "📋 ออเดอร์ทั้งหมด (ดูอย่างเดียว)", href: "dashboard-manager.html#orders" },
    { key: "finance",   label: "💰 รายงานการเงิน (ดูอย่างเดียว)", href: "dashboard-manager.html#finance" },
  ],
};

export function renderShell(profile, activeKey, title) {
  const nav = NAV[profile.role] || [];
  const navHtml = nav.map(item =>
    `<a href="${item.href}" class="${item.key === activeKey ? 'active' : ''}">${item.label}</a>`
  ).join('');

  document.body.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <h2>🏢 Web ERP</h2>
        <span class="role-badge">${ROLE_LABEL[profile.role] || profile.role}</span>
        <nav>${navHtml}</nav>
        <div class="spacer"></div>
        <div class="user-box">
          เข้าสู่ระบบในชื่อ<br/><b style="color:#fff">${profile.name || profile.email}</b><br/>
          <button class="btn btn-outline" id="btn-logout" style="margin-top:10px;width:100%;">ออกจากระบบ</button>
        </div>
      </aside>
      <main class="main">
        <h1>${title}</h1>
        <div id="main-content"></div>
      </main>
    </div>
  `;
  document.getElementById('btn-logout').addEventListener('click', async () => {
    await logout();
    location.href = 'login.html';
  });
  return document.getElementById('main-content');
}

export function statusBadge(status) {
  const map = {
    'รอดำเนินการ': 'badge-pending',
    'กำลังดำเนินการ': 'badge-progress',
    'กำลังแพ็ค': 'badge-progress',
    'จัดส่งแล้ว': 'badge-progress',
    'เสร็จสิ้น': 'badge-done',
    'ยกเลิก': 'badge-cancel',
  };
  return `<span class="badge ${map[status] || 'badge-pending'}">${status}</span>`;
}
