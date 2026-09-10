// ===================================================================
// shell.js — 2-panel sidebar navigation (Primary icon rail + Secondary sub-menu)
// แต่ละหน้าจะเรียก renderShell(profile, currentPageKey) แล้วแทรกเนื้อหาตัวเองลงใน #main-content
// ===================================================================
import { logout } from "./auth.js";

const ROLE_LABEL = {
  sales:      "ฝ่ายขาย",
  warehouse:  "คลังสินค้า",
  accounting: "บัญชี",
  admin:      "แอดมิน",
  manager:    "ผู้บริหาร",
};

// NAV แบบ Grouped: แต่ละ role มี array ของ group
// group = { groupKey, icon, label, items: [{key, label, href}] }
const NAV = {
  warehouse: [
    { groupKey: 'gs-import', icon: '📊', label: 'นำเข้า', items: [
      { key: 'import-dashboard', label: '⬇️ Import จาก Sheets',  href: 'dashboard-warehouse.html#import-dashboard' },
      { key: 'import-settings',  label: '⚙️ ตั้งค่า Import',      href: 'dashboard-warehouse.html#import-settings' },
    ]},
    { groupKey: 'manifest', icon: '📋', label: 'กำกับ', items: [
      { key: 'manifest-create', label: '🆕 สร้างกำกับสินค้า',  href: 'dashboard-warehouse.html#manifest-create' },
      { key: 'manifest',        label: '📂 จัดการกำกับสินค้า', href: 'dashboard-warehouse.html#manifest' },
    ]},
    { groupKey: 'receive', icon: '📥', label: 'รับเข้า', items: [
      { key: 'inbound',    label: 'รับสินค้าเข้า (Inbound)',          href: 'dashboard-warehouse.html#inbound' },
      { key: 'putaway',    label: 'จัดเก็บเข้าตำแหน่ง (Put Away)',    href: 'dashboard-warehouse.html#putaway' },
    ]},
    { groupKey: 'stock', icon: '📦', label: 'สต๊อก', items: [
      { key: 'stock',      label: 'จัดการสต๊อกสินค้า',                href: 'dashboard-warehouse.html#stock' },
      { key: 'cyclecount', label: 'ตรวจนับสต๊อก (Cycle Count)',       href: 'dashboard-warehouse.html#cyclecount' },
    ]},
    { groupKey: 'picking-mgmt', icon: '🗂', label: 'กลุ่มหยิบ', items: [
      { key: 'picking-strategy', label: '⚙️ กลยุทธ์จัดกลุ่ม',        href: 'dashboard-warehouse.html#picking-strategy' },
      { key: 'picking-groups',   label: '📋 กลุ่มงานหยิบ (PG)',       href: 'dashboard-warehouse.html#picking-groups' },
    ]},
    { groupKey: 'pipeline', icon: '🔄', label: 'ออเดอร์', items: [
      { key: 'picking',           label: '🛒 หยิบสินค้า (Picking)',           href: 'dashboard-warehouse.html#picking' },
      { key: 'verification',      label: '🔍 ตรวจสอบสินค้า',                  href: 'dashboard-warehouse.html#verification' },
      { key: 'verification-scan', label: '📱 สแกน PDA Mode',                  href: 'dashboard-warehouse.html#verification-scan' },
      { key: 'outbound',          label: '🚚 จัดส่งสินค้า (Outbound)',         href: 'dashboard-warehouse.html#outbound' },
    ]},
    { groupKey: 'damage', icon: '🧱', label: 'ความเสียหาย', items: [
      { key: 'damage-dashboard', label: '📊 แดชบอร์ดความเสียหาย',  href: 'damage-reports.html' },
      { key: 'damage-create',    label: '🆕 แจ้งความเสียหาย',       href: 'damage-report-form.html' },
    ]},
    { groupKey: 'freight', icon: '🚚', label: 'ค่าขนส่ง', items: [
      { key: 'freight-dashboard',    label: '📊 แดชบอร์ดค่าขนส่ง',    href: 'freight-dashboard.html' },
      { key: 'freight-calculator',   label: '🧮 คำนวณค่าขนส่ง',      href: 'freight-calculator.html' },
      { key: 'freight-compare',      label: '⚖️ เปรียบเทียบ Carrier', href: 'freight-compare.html' },
      { key: 'freight-calculations', label: '📋 ประวัติการคำนวณ',    href: 'freight-calculations.html' },
      { key: 'freight-zones',        label: '📍 Zone Mapping',        href: 'freight-zones.html' },
    ]},
  ],
  admin: [
    { groupKey: 'orders', icon: '📋', label: 'ออเดอร์', items: [
      { key: 'orders',     label: 'ออเดอร์ทั้งหมด',                   href: 'dashboard-admin.html#orders' },
      { key: 'documents',  label: 'เอกสารขาย / ขนส่ง',               href: 'dashboard-admin.html#documents' },
      { key: 'routing',    label: 'จัดรูทขนส่ง / คัตออฟ',             href: 'dashboard-admin.html#routing' },
    ]},
    { groupKey: 'purchase', icon: '🛒', label: 'จัดซื้อ', items: [
      { key: 'po',         label: 'ใบสั่งซื้อ (PO)',                  href: 'dashboard-admin.html#po' },
    ]},
    { groupKey: 'damage', icon: '🧱', label: 'ความเสียหาย', items: [
      { key: 'damage-dashboard', label: '📊 แดชบอร์ดความเสียหาย',  href: 'damage-reports.html' },
      { key: 'damage-create',    label: '🆕 แจ้งความเสียหาย',       href: 'damage-report-form.html' },
    ]},
    { groupKey: 'freight', icon: '🚚', label: 'ค่าขนส่ง', items: [
      { key: 'freight-dashboard',    label: '📊 แดชบอร์ดค่าขนส่ง',      href: 'freight-dashboard.html' },
      { key: 'freight-calculator',   label: '🧮 คำนวณค่าขนส่ง',        href: 'freight-calculator.html' },
      { key: 'freight-compare',      label: '⚖️ เปรียบเทียบ Carrier',   href: 'freight-compare.html' },
      { key: 'freight-calculations', label: '📋 ประวัติการคำนวณ',      href: 'freight-calculations.html' },
      { key: 'freight-carriers',     label: '🚚 Carrier',                href: 'freight-carriers.html' },
      { key: 'freight-rates',        label: '💴 Rate Card',              href: 'freight-rates.html' },
      { key: 'freight-zones',        label: '📍 Zone Mapping',           href: 'freight-zones.html' },
      { key: 'freight-import',       label: '⬇️ นำเข้าจาก Excel',        href: 'freight-import.html' },
    ]},
    { groupKey: 'team', icon: '👥', label: 'ทีม', items: [
      { key: 'users',      label: 'จัดการผู้ใช้งาน & สิทธิ์',         href: 'dashboard-admin.html#users' },
    ]},
    { groupKey: 'reports', icon: '📊', label: 'รายงาน', items: [
      { key: 'reports',    label: 'รายงานประจำวัน',                   href: 'dashboard-admin.html#reports' },
    ]},
    { groupKey: 'goto', icon: '🔗', label: 'แผนกอื่น', items: [
      { key: 'go-warehouse',  label: 'คลังสินค้า',                    href: 'dashboard-warehouse.html#stock' },
      { key: 'go-accounting', label: 'บัญชี',                        href: 'dashboard-accounting.html#invoices' },
      { key: 'go-sales',      label: 'ฝ่ายขาย',                      href: 'dashboard-sales.html#orders' },
    ]},
  ],
  sales: [
    { groupKey: 'orders', icon: '📋', label: 'ออเดอร์', items: [
      { key: 'orders',     label: 'ออเดอร์ของฉัน',                    href: 'dashboard-sales.html' },
    ]},
    { groupKey: 'stock', icon: '📦', label: 'สต๊อก', items: [
      { key: 'stock',      label: 'ตรวจสอบสต๊อก (ดูอย่างเดียว)',      href: 'view-stock.html' },
    ]},
    { groupKey: 'shipping', icon: '🚚', label: 'ขนส่ง', items: [
      { key: 'shipping',   label: 'ติดตามสถานะจัดส่ง',                href: 'view-shipping.html' },
    ]},
    { groupKey: 'freight', icon: '🧮', label: 'ค่าขนส่ง', items: [
      { key: 'freight-calculator',   label: '🧮 คำนวณค่าขนส่ง',   href: 'freight-calculator.html' },
      { key: 'freight-compare',      label: '⚖️ เปรียบเทียบ Carrier', href: 'freight-compare.html' },
      { key: 'freight-calculations', label: '📋 ประวัติการคำนวณ', href: 'freight-calculations.html' },
    ]},
  ],
  accounting: [
    { groupKey: 'docs', icon: '🧾', label: 'เอกสาร', items: [
      { key: 'invoices',   label: 'ใบแจ้งหนี้ / ใบกำกับภาษี',        href: 'dashboard-accounting.html#invoices' },
    ]},
    { groupKey: 'money', icon: '💵', label: 'รับ-จ่าย', items: [
      { key: 'payments',   label: 'รับ-จ่ายเงิน',                     href: 'dashboard-accounting.html#payments' },
      { key: 'ar-ap',      label: 'กระทบยอดลูกหนี้/เจ้าหนี้',        href: 'dashboard-accounting.html#arap' },
    ]},
    { groupKey: 'reports', icon: '📊', label: 'รายงาน', items: [
      { key: 'reports',    label: 'รายงานทางการเงิน',                 href: 'dashboard-accounting.html#reports' },
    ]},
  ],
  manager: [
    { groupKey: 'overview', icon: '📊', label: 'ภาพรวม', items: [
      { key: 'overview',   label: 'ภาพรวมทุกแผนก',                   href: 'dashboard-manager.html#overview' },
    ]},
    { groupKey: 'orders', icon: '📋', label: 'ออเดอร์', items: [
      { key: 'orders',     label: 'ออเดอร์ทั้งหมด (ดูอย่างเดียว)',   href: 'dashboard-manager.html#orders' },
    ]},
    { groupKey: 'finance', icon: '💰', label: 'การเงิน', items: [
      { key: 'finance',    label: 'รายงานการเงิน (ดูอย่างเดียว)',     href: 'dashboard-manager.html#finance' },
    ]},
    { groupKey: 'shipping', icon: '🚚', label: 'ส่งออก', items: [
      { key: 'shipping',   label: 'ยอดส่งออกประจำเดือน',              href: 'dashboard-export-trend.html' },
    ]},
    { groupKey: 'damage', icon: '🧱', label: 'ความเสียหาย', items: [
      { key: 'damage-dashboard', label: 'แดชบอร์ดความเสียหาย (ดูอย่างเดียว)', href: 'damage-reports.html' },
    ]},
    { groupKey: 'freight', icon: '🚚', label: 'ค่าขนส่ง', items: [
      { key: 'freight-dashboard',    label: '📊 แดชบอร์ดค่าขนส่ง (ดูอย่างเดียว)', href: 'freight-dashboard.html' },
      { key: 'freight-calculations', label: '📋 ประวัติการคำนวณค่าขนส่ง', href: 'freight-calculations.html' },
    ]},
  ],
};

const PAGE_DEPARTMENT = {
  "dashboard-sales.html":       "sales",
  "dashboard-warehouse.html":   "warehouse",
  "dashboard-accounting.html":  "accounting",
  "dashboard-admin.html":       "admin",
  "dashboard-manager.html":     "manager",
};

// ===================================================================
// ฟังก์ชันหลัก: สร้าง shell แบบ 2-panel
// ===================================================================
export function renderShell(profile, activeKey, title) {
  const currentPage = location.pathname.split('/').pop();
  const navKey = (profile.role === 'admin' && PAGE_DEPARTMENT[currentPage])
    ? PAGE_DEPARTMENT[currentPage]
    : profile.role;

  const groups = NAV[navKey] || [];
  // หา group ที่ activeKey อยู่ใน
  const activeGroup = groups.find(g => g.items.some(i => i.key === activeKey)) || groups[0];

  const isAdminViewing = profile.role === 'admin' && navKey !== 'admin';

  // ---- CSS inline สำหรับ 2-panel ----
  const css = `
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:'Sarabun',sans-serif;background:#f0f2f8;overflow:hidden;}
    .erp-shell{display:flex;height:100dvh;width:100vw;overflow:hidden;}
    .nav-drawer{display:flex;background:#fff;} /* wraps primary+secondary — inline row on desktop, slide-in unit on mobile (see media query) */

    /* === Primary rail === */
    .nav-primary{
      width:70px;flex-shrink:0;
      background:linear-gradient(180deg,#1a237e 0%,#283593 100%);
      display:flex;flex-direction:column;align-items:center;
      padding:0;overflow-y:auto;overflow-x:hidden;
      scrollbar-width:none;z-index:20;
    }
    .nav-primary::-webkit-scrollbar{display:none;}
    .nav-brand{padding:14px 0 6px;font-size:1.4rem;line-height:1;}
    .nav-brand-label{font-size:0.52rem;color:rgba(255,255,255,0.6);text-align:center;padding:0 4px 12px;line-height:1.3;}
    .nav-group-btn{
      display:flex;flex-direction:column;align-items:center;gap:3px;
      width:56px;padding:9px 4px;border-radius:10px;
      text-decoration:none;cursor:pointer;border:none;background:none;
      transition:background .15s;margin-bottom:3px;
    }
    .nav-group-btn:hover{background:rgba(255,255,255,0.12);}
    .nav-group-btn.active{background:rgba(255,255,255,0.22);}
    .nav-group-btn .g-icon{font-size:1.25rem;line-height:1;}
    .nav-group-btn .g-label{font-size:0.58rem;color:rgba(255,255,255,0.8);text-align:center;line-height:1.3;word-break:keep-all;}
    .nav-group-btn.active .g-label{color:#fff;font-weight:700;}
    .nav-logout{
      margin-top:auto;padding:12px 0 10px;width:100%;
      display:flex;flex-direction:column;align-items:center;gap:6px;
    }
    .nav-avatar{
      width:34px;height:34px;border-radius:50%;
      background:rgba(255,255,255,0.18);
      display:flex;align-items:center;justify-content:center;
      font-size:1rem;color:#fff;font-weight:700;
    }
    .nav-logout-btn{
      font-size:0.58rem;color:rgba(255,255,255,0.65);
      background:rgba(255,255,255,0.1);border:none;border-radius:6px;
      padding:5px 8px;cursor:pointer;width:52px;text-align:center;
    }
    .nav-logout-btn:hover{background:rgba(255,255,255,0.2);color:#fff;}

    /* === Secondary panel === */
    .nav-secondary{
      width:196px;flex-shrink:0;
      background:#fff;
      border-right:1px solid #e0e3ef;
      display:flex;flex-direction:column;
      overflow-y:auto;overflow-x:hidden;
      scrollbar-width:thin;
    }
    .nav-sec-header{
      padding:16px 14px 4px;
      font-size:0.95rem;font-weight:700;color:#1a237e;
      letter-spacing:0.2px;
    }
    .nav-sec-role{
      padding:2px 14px 10px;
      font-size:0.72rem;color:#999;
    }
    .nav-sec-items{padding:4px 8px;flex:1;}
    .nav-sec-item{
      display:block;padding:9px 12px;border-radius:8px;
      text-decoration:none;font-size:0.84rem;
      color:#444;margin-bottom:2px;
      transition:background .12s,color .12s;
      line-height:1.4;
    }
    .nav-sec-item:hover{background:#f0f3ff;color:#1a237e;}
    .nav-sec-item.active{
      background:rgba(26,115,232,0.1);
      color:#1a73e8;font-weight:700;
    }
    .nav-admin-badge{
      margin:8px 10px 4px;
      background:linear-gradient(135deg,#fff3cd,#ffe9a8);
      color:#7a5b00;font-size:0.72rem;padding:8px 10px;
      border-radius:10px;text-align:center;
    }
    .nav-admin-badge a{
      display:inline-block;margin-top:6px;
      background:#7a5b00;color:#fff;padding:4px 10px;
      border-radius:6px;text-decoration:none;font-size:0.7rem;font-weight:600;
    }

    /* === Main content === */
    .erp-main{flex:1;overflow-y:auto;overflow-x:hidden;background:#f0f2f8;}
    .erp-main-inner{padding:20px 24px;max-width:1400px;}
    .erp-main h1{font-size:1.3rem;font-weight:700;color:#1a237e;margin-bottom:16px;}

    /* Pass-through classes ที่ components ใช้ */
    .main{} /* alias */
    .card{background:#fff;border-radius:14px;padding:18px 20px;margin-bottom:16px;box-shadow:0 2px 8px rgba(60,80,160,0.07);}
    .btn{display:inline-flex;align-items:center;gap:5px;padding:8px 14px;border-radius:8px;border:none;cursor:pointer;font-size:0.85rem;font-family:inherit;transition:filter .15s;}
    .btn:hover{filter:brightness(1.08);}
    .btn-primary{background:#1a73e8;color:#fff;}
    .btn-success{background:#1a8a3a;color:#fff;}
    .btn-danger{background:#d23;color:#fff;}
    .btn-outline{background:#fff;border:1.5px solid #c5c8d6;color:#333;}
    .btn-warning{background:#f59e0b;color:#fff;}
    .badge{display:inline-block;padding:3px 8px;border-radius:20px;font-size:0.75rem;font-weight:600;}
    .badge-pending{background:#fff3cd;color:#7a5b00;}
    .badge-progress{background:#cce5ff;color:#004085;}
    .badge-done{background:#d4edda;color:#155724;}
    .badge-cancel{background:#f8d7da;color:#721c24;}
    table{width:100%;border-collapse:collapse;font-size:0.86rem;}
    th,td{padding:9px 12px;text-align:left;border-bottom:1px solid #eef0f6;}
    th{background:#f4f6ff;font-weight:600;color:#333;}
    tr:hover td{background:#fafbff;}
    input,select,textarea{font-family:inherit;}
    .msg{font-size:0.86rem;min-height:18px;padding:4px 0;}
    .msg.ok{color:#1a8a3a;}
    .msg.error{color:#c00;}
    .mono{font-family:monospace;}

    /* === Mobile topbar (hamburger + title) — hidden on desktop === */
    .mobile-topbar{
      display:none;align-items:center;gap:10px;
      height:52px;flex-shrink:0;padding:0 12px;
      background:#fff;border-bottom:1px solid #e0e3ef;
      position:sticky;top:0;z-index:15;
    }
    .hamburger-btn{
      width:38px;height:38px;flex-shrink:0;border:none;border-radius:9px;
      background:#f0f2f8;color:#1a237e;font-size:1.2rem;cursor:pointer;
      display:flex;align-items:center;justify-content:center;
    }
    .hamburger-btn:hover{background:#e5e8f5;}
    .mobile-topbar-title{
      font-size:0.98rem;font-weight:700;color:#1a237e;
      overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
    }
    .nav-backdrop{
      display:none;position:fixed;inset:0;background:rgba(15,20,40,0.45);z-index:29;
    }

    /* Mobile responsive — drawer takes over below 768px per the design spec's own breakpoint */
    @media(max-width:768px){
      .mobile-topbar{display:flex;}
      .erp-main h1{display:none;} /* shown in the mobile topbar instead, avoid duplicate title */
      .nav-drawer{
        position:fixed;top:0;left:0;height:100dvh;z-index:30;
        transform:translateX(-100%);transition:transform .22s ease;
      }
      .nav-drawer.open{transform:translateX(0);box-shadow:6px 0 24px rgba(0,0,0,0.18);}
      .nav-backdrop.open{display:block;}
      .nav-secondary{width:220px;}
    }
    @media(max-width:420px){
      .nav-primary{width:64px;}
      .nav-group-btn{width:52px;}
      .nav-secondary{width:190px;}
      .erp-main-inner{padding:14px 12px;}
    }
  `;

  // ---- สร้าง HTML ----
  const initGroupKey = activeGroup ? activeGroup.groupKey : (groups[0]?.groupKey || '');
  const userName = (profile.name || profile.email || '?');
  const userInitial = userName.charAt(0).toUpperCase();

  document.body.innerHTML = `
    <style>${css}</style>
    <div class="erp-shell">

      <div class="nav-backdrop" id="nav-backdrop"></div>

      <!-- Nav drawer: primary rail + secondary panel together — inline on desktop, slide-in on mobile -->
      <div class="nav-drawer" id="nav-drawer">
        <!-- Primary rail -->
        <nav class="nav-primary">
          <div class="nav-brand">🏢</div>
          <div class="nav-brand-label">Web<br>ERP</div>
          <div id="nav-primary-items" style="display:flex;flex-direction:column;align-items:center;width:100%;padding:0 7px;gap:2px;">
            ${groups.map(g => `
              <button class="nav-group-btn ${g.groupKey === initGroupKey ? 'active' : ''}"
                data-gkey="${g.groupKey}"
                title="${g.label}">
                <span class="g-icon">${g.icon}</span>
                <span class="g-label">${g.label}</span>
              </button>
            `).join('')}
          </div>
          <div class="nav-logout">
            <div class="nav-avatar">${userInitial}</div>
            <button class="nav-logout-btn" id="btn-logout">ออกจาก<br>ระบบ</button>
          </div>
        </nav>

        <!-- Secondary panel -->
        <aside class="nav-secondary" id="nav-secondary">
          <!-- filled by JS below -->
        </aside>
      </div>

      <!-- Main -->
      <div class="erp-main">
        <div class="mobile-topbar">
          <button class="hamburger-btn" id="btn-hamburger" aria-label="เปิดเมนู">☰</button>
          <div class="mobile-topbar-title">${title}</div>
        </div>
        <div class="erp-main-inner">
          <h1>${title}</h1>
          <div id="main-content"></div>
        </div>
      </div>

    </div>
  `;

  // ---- render secondary panel ----
  function renderSecondary(group) {
    if (!group) return;
    const sec = document.getElementById('nav-secondary');
    const adminBadge = isAdminViewing
      ? `<div class="nav-admin-badge">
           <div style="font-weight:700;">👁 กำลังดูแผนก:<br>${ROLE_LABEL[navKey] || navKey}</div>
           <a href="dashboard-admin.html">⬅ กลับแอดมิน</a>
         </div>`
      : '';
    sec.innerHTML = `
      <div class="nav-sec-header">${group.icon} ${group.label}</div>
      <div class="nav-sec-role">${ROLE_LABEL[profile.role] || profile.role}</div>
      ${adminBadge}
      <div class="nav-sec-items">
        ${group.items.map(item => `
          <a href="${item.href}"
             class="nav-sec-item ${item.key === activeKey ? 'active' : ''}">
            ${item.label}
          </a>
        `).join('')}
      </div>
    `;
  }

  // ---- wire up primary buttons ----
  document.querySelectorAll('.nav-group-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const gkey = btn.dataset.gkey;
      const group = groups.find(g => g.groupKey === gkey);
      // update active highlight
      document.querySelectorAll('.nav-group-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderSecondary(group);
    });
  });

  // ---- render initial secondary ----
  renderSecondary(activeGroup || groups[0]);

  // ---- logout ----
  document.getElementById('btn-logout').addEventListener('click', async () => {
    await logout();
    location.href = 'login.html';
  });

  // ---- mobile hamburger drawer ----
  const drawer = document.getElementById('nav-drawer');
  const backdrop = document.getElementById('nav-backdrop');
  const openDrawer = () => { drawer.classList.add('open'); backdrop.classList.add('open'); document.body.style.overflow = 'hidden'; };
  const closeDrawer = () => { drawer.classList.remove('open'); backdrop.classList.remove('open'); document.body.style.overflow = ''; };
  document.getElementById('btn-hamburger').addEventListener('click', openDrawer);
  backdrop.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

  return document.getElementById('main-content');
}

// ===================================================================
// Floating Action Button — mobile-only (hidden on desktop via CSS),
// opt-in per page: call renderFAB([{icon,label,href}, ...]) from a page
// that wants a quick-add shortcut (e.g. the damage-reports dashboard).
// Not baked into renderShell() itself since it's a per-feature action,
// not something every department's page needs.
// ===================================================================
export function renderFAB(items) {
  if (!items || !items.length) return;
  if (document.getElementById('fab-root')) return; // avoid duplicates if called twice

  const style = document.createElement('style');
  style.textContent = `
    .fab-root{display:none;}
    @media(max-width:768px){
      .fab-root{display:block;position:fixed;right:18px;bottom:22px;z-index:40;}
      .fab-main{
        width:56px;height:56px;border-radius:50%;border:none;
        background:linear-gradient(135deg,#2e6cf6,#1a73e8);color:#fff;font-size:1.6rem;
        box-shadow:0 6px 18px rgba(26,115,232,0.45);cursor:pointer;
        display:flex;align-items:center;justify-content:center;
        transition:transform .18s ease;
      }
      .fab-root.open .fab-main{transform:rotate(45deg);}
      .fab-menu{
        position:absolute;right:0;bottom:68px;display:flex;flex-direction:column;
        align-items:flex-end;gap:10px;opacity:0;pointer-events:none;transform:translateY(8px);
        transition:opacity .16s ease,transform .16s ease;
      }
      .fab-root.open .fab-menu{opacity:1;pointer-events:auto;transform:translateY(0);}
      .fab-item{
        display:flex;align-items:center;gap:10px;text-decoration:none;
        background:#fff;color:#1a237e;font-size:0.84rem;font-weight:600;
        padding:9px 14px 9px 9px;border-radius:26px;box-shadow:0 4px 14px rgba(20,30,60,0.18);
        white-space:nowrap;
      }
      .fab-item .fi{
        width:32px;height:32px;border-radius:50%;background:#eaf1ff;
        display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0;
      }
      .fab-backdrop{display:none;position:fixed;inset:0;z-index:39;}
      .fab-root.open .fab-backdrop{display:block;}
    }
  `;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.className = 'fab-root';
  root.id = 'fab-root';
  root.innerHTML = `
    <div class="fab-backdrop"></div>
    <div class="fab-menu">
      ${items.map((it) => `<a class="fab-item" href="${it.href}"><span class="fi">${it.icon}</span>${it.label}</a>`).join("")}
    </div>
    <button class="fab-main" id="fab-main" aria-label="เพิ่ม">＋</button>
  `;
  document.body.appendChild(root);

  const toggle = () => root.classList.toggle('open');
  document.getElementById('fab-main').addEventListener('click', toggle);
  root.querySelector('.fab-backdrop').addEventListener('click', toggle);
}

// ===================================================================
// Notification bell — opt-in per page, same pattern as renderFAB.
// items: [{ tone:'critical'|'warning'|'overdue'|'success', icon, title, desc, href }]
// This is a load-time snapshot (computed once when the calling page loads
// its data), not a live listener — matches the rest of the app, which has
// no real-time updates anywhere else either.
// ===================================================================
export function renderNotifications(items) {
  if (document.getElementById('notif-root')) return;
  items = items || [];

  const style = document.createElement('style');
  style.textContent = `
    .notif-root{position:fixed;top:10px;right:16px;z-index:41;}
    .notif-bell{
      width:38px;height:38px;border-radius:50%;border:none;background:#fff;
      box-shadow:0 2px 10px rgba(20,30,60,0.12);cursor:pointer;font-size:1.1rem;
      display:flex;align-items:center;justify-content:center;position:relative;
    }
    .notif-badge{
      position:absolute;top:-2px;right:-2px;background:#c62828;color:#fff;
      font-size:0.62rem;font-weight:700;min-width:16px;height:16px;border-radius:9px;
      display:flex;align-items:center;justify-content:center;padding:0 3px;
    }
    .notif-panel{
      display:none;position:absolute;top:46px;right:0;width:320px;max-width:calc(100vw - 32px);
      background:#fff;border-radius:14px;box-shadow:0 12px 32px rgba(15,20,45,0.2);
      max-height:70vh;overflow-y:auto;
    }
    .notif-root.open .notif-panel{display:block;}
    .notif-header{padding:14px 16px 10px;font-weight:700;color:#1a237e;font-size:0.92rem;border-bottom:1px solid #eef0f7;}
    .notif-item{display:flex;gap:10px;padding:11px 16px;text-decoration:none;border-bottom:1px solid #f4f5fa;}
    .notif-item:last-child{border-bottom:none;}
    .notif-item:hover{background:#f7f9ff;}
    .notif-item .ni-icon{font-size:1.05rem;flex-shrink:0;line-height:1.3;}
    .notif-item .ni-title{font-size:0.84rem;font-weight:600;color:#222;line-height:1.35;}
    .notif-item .ni-desc{font-size:0.76rem;color:#999;margin-top:1px;}
    .notif-empty{padding:28px 16px;text-align:center;color:#999;font-size:0.84rem;}
    @media(max-width:768px){ .notif-root{top:7px;right:56px;} }
  `;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.className = 'notif-root';
  root.id = 'notif-root';
  root.innerHTML = `
    <button class="notif-bell" id="notif-bell" aria-label="การแจ้งเตือน">
      🔔
      ${items.length ? `<span class="notif-badge">${items.length > 9 ? "9+" : items.length}</span>` : ""}
    </button>
    <div class="notif-panel">
      <div class="notif-header">🔔 การแจ้งเตือน (${items.length})</div>
      ${items.length
        ? items.map((it) => `<a class="notif-item" href="${it.href}"><span class="ni-icon">${it.icon}</span><div><div class="ni-title">${it.title}</div><div class="ni-desc">${it.desc || ""}</div></div></a>`).join("")
        : `<div class="notif-empty">ไม่มีการแจ้งเตือนใหม่</div>`}
    </div>
  `;
  document.body.appendChild(root);

  document.getElementById('notif-bell').addEventListener('click', (e) => {
    e.stopPropagation();
    root.classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    if (!root.contains(e.target)) root.classList.remove('open');
  });
}

export function statusBadge(status) {
  const map = {
    'รอดำเนินการ':    'badge-pending',
    'กำลังดำเนินการ': 'badge-progress',
    'กำลังแพ็ค':      'badge-progress',
    'จัดส่งแล้ว':     'badge-progress',
    'เสร็จสิ้น':      'badge-done',
    'ยกเลิก':         'badge-cancel',
  };
  return `<span class="badge ${map[status] || 'badge-pending'}">${status}</span>`;
}
