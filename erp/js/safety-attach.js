// safety-attach.js — Reusable image attachment widget (auto-inject via MutationObserver)
// Firebase Storage 10.12.0  |  max 5 images per record
import { app } from "./auth.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

const storage  = getStorage(app);
const MAX      = 5;
const TARGETS  = new Set(['panel-body','panel-content','panelBody','panelFormBody','modalBody']);

// ── Auto-inject when any form container renders ──────────────
new MutationObserver(muts => {
  for (const m of muts) {
    if (m.type !== 'childList' || !m.addedNodes.length) continue;
    if (!TARGETS.has(m.target.id)) continue;
    const el = m.target;
    if (el.querySelector('#f-attach-zone') || !el.querySelector('input,textarea,select')) continue;
    setTimeout(() => _inject(el), 0);
  }
}).observe(document.documentElement, { childList: true, subtree: true });

function _inject(container) {
  if (container.querySelector('#f-attach-zone')) return;

  // ── Read existing URLs from hidden input (populated by page's formHTML) ──
  let existing = [];
  try { existing = JSON.parse(container.querySelector('#f-attach-existing')?.value || '[]'); } catch {}
  window.__ATTACH = { existing: existing.map(u => ({ url: u })), pending: [], max: MAX };

  const html = `
<div id="f-attach-wrapper" style="padding-top:11px;margin-top:2px;border-top:1px solid #e8eaf6;margin-bottom:4px;">
  <div style="font-size:.82rem;font-weight:600;color:#374151;margin-bottom:6px;">
    รูปภาพแนบ <span style="font-weight:400;color:#9ca3af;">(สูงสุด ${MAX} รูป)</span>
  </div>
  <div id="f-attach-zone"></div>
</div>`;

  // Insert before the button row (parent of .btn-primary)
  const saveBtn  = container.querySelector('button.btn-primary');
  const btnRow   = saveBtn?.parentElement;
  if (btnRow && btnRow !== container) {
    btnRow.insertAdjacentHTML('beforebegin', html);
  } else {
    container.insertAdjacentHTML('beforeend', html);
  }
  _render();
}

// ── Render thumbnail grid ───────────────────────────────────
function _render() {
  const zone = document.getElementById('f-attach-zone');
  if (!zone || !window.__ATTACH) return;
  const { existing, pending, max } = window.__ATTACH;
  const total = existing.length + pending.length;
  zone.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start;">
      ${existing.map((item, i) => `
        <div style="position:relative;flex-shrink:0;">
          <img src="${item.url}" style="width:76px;height:76px;object-fit:cover;border-radius:8px;border:1.5px solid #e2e8f0;display:block;">
          <button onclick="window.__attRmEx(${i})" style="position:absolute;top:-7px;right:-7px;width:20px;height:20px;border-radius:50%;background:#ef4444;color:#fff;border:none;cursor:pointer;font-size:11px;line-height:1;padding:0;display:flex;align-items:center;justify-content:center;">✕</button>
        </div>`).join('')}
      ${pending.map((item, i) => `
        <div style="position:relative;flex-shrink:0;">
          <img src="${item.preview}" style="width:76px;height:76px;object-fit:cover;border-radius:8px;border:2px solid #93c5fd;display:block;">
          <span style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,.55);border-radius:0 0 7px 7px;font-size:10px;color:#fff;padding:2px;text-align:center;">ใหม่</span>
          <button onclick="window.__attRmPd(${i})" style="position:absolute;top:-7px;right:-7px;width:20px;height:20px;border-radius:50%;background:#ef4444;color:#fff;border:none;cursor:pointer;font-size:11px;line-height:1;padding:0;display:flex;align-items:center;justify-content:center;">✕</button>
        </div>`).join('')}
      ${total < max ? `
        <label for="f-attach-input" style="width:76px;height:76px;border:2px dashed #cbd5e1;border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;color:#94a3b8;gap:4px;flex-shrink:0;">
          <span style="font-size:1.6rem;line-height:1;">📷</span>
          <span style="font-size:.68rem;text-align:center;line-height:1.2;">เพิ่มรูป</span>
        </label>
        <input type="file" id="f-attach-input" multiple accept="image/*" style="display:none" onchange="window.__attAdd(this)">
      ` : ''}
    </div>
    <div style="font-size:.72rem;color:#9ca3af;margin-top:5px;">${total}/${max} รูป</div>`;
}

// ── Window event handlers ───────────────────────────────────
window.__attAdd = inp => {
  const st = window.__ATTACH; if (!st) return;
  const rem = st.max - st.existing.length - st.pending.length;
  Array.from(inp.files).slice(0, rem).forEach(f =>
    st.pending.push({ file: f, preview: URL.createObjectURL(f) }));
  inp.value = ''; _render();
};
window.__attRmEx = i => { window.__ATTACH?.existing.splice(i, 1); _render(); };
window.__attRmPd = i => {
  const item = window.__ATTACH?.pending.splice(i, 1)[0];
  if (item) URL.revokeObjectURL(item.preview);
  _render();
};

// ── Upload pending → return final URL array ─────────────────
async function commitAttachments() {
  if (!window.__ATTACH) return [];
  const { existing, pending } = window.__ATTACH;
  const page = location.pathname.split('/').pop().replace('.html', '') || 'safety';
  const uploaded = await Promise.all(pending.map(async ({ file }) => {
    const name = `${Date.now()}_${Math.random().toString(36).slice(2)}_${file.name.replace(/[^\w.-]/g, '_')}`;
    const fileRef = ref(storage, `safety/${page}/${name}`);
    await uploadBytes(fileRef, file);
    return getDownloadURL(fileRef);
  }));
  return [...existing.map(e => e.url), ...uploaded];
}

export { commitAttachments };
window.__commitAttach = commitAttachments;
