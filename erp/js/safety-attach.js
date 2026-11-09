// safety-attach.js — Reusable image + file attachment widget (auto-inject)
// รูปภาพ: base64 ใน Firestore field `attachments`
// ไฟล์อื่นๆ: base64 ใน subcollection `{colName}/{docId}/fileAttachments/`

import { db } from './auth.js';
import {
  collection as fsCol, doc as fsDoc, addDoc, deleteDoc, getDocs
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const IMG_MAX       = 5;
const FILE_MAX      = 5;
const FILE_SIZE_MAX = 700 * 1024; // 700 KB original ≈ ~950 KB as base64 (ต่ำกว่า 1 MB/document)
const TARGETS       = new Set(['panel-body','panel-content','panelBody','panelFormBody','modalBody']);

// ── Auto-inject when any form container renders ──────────────────────────────
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

  // รูปภาพ — อ่าน existing จาก hidden input (populated by page's formHTML)
  let existing = [];
  try { existing = JSON.parse(container.querySelector('#f-attach-existing')?.value || '[]'); } catch {}
  window.__ATTACH = { existing: existing.map(u => ({ url: u })), pending: [], max: IMG_MAX };

  // ไฟล์แนบ — preserve pre-loaded data (อาจถูก _loadFiles โหลดมาก่อน inject)
  if (!window.__FILES?.existing) {
    window.__FILES = { existing: [], pending: [], toDelete: [] };
  } else {
    window.__FILES.pending  ??= [];
    window.__FILES.toDelete ??= [];
  }

  const html = `
<div id="f-attach-wrapper" style="padding-top:11px;margin-top:2px;border-top:1px solid #e8eaf6;margin-bottom:4px;">
  <div style="font-size:.82rem;font-weight:600;color:#374151;margin-bottom:6px;">
    รูปภาพแนบ <span style="font-weight:400;color:#9ca3af;">(สูงสุด ${IMG_MAX} รูป)</span>
  </div>
  <div id="f-attach-zone"></div>

  <div style="font-size:.82rem;font-weight:600;color:#374151;margin-top:12px;margin-bottom:6px;">
    ไฟล์แนบ <span style="font-weight:400;color:#9ca3af;">(สูงสุด ${FILE_MAX} ไฟล์ · ไม่เกิน 700 KB/ไฟล์)</span>
  </div>
  <div id="f-file-zone"></div>
</div>`;

  const saveBtn = container.querySelector('button.btn-primary');
  const btnRow  = saveBtn?.parentElement;
  if (btnRow && btnRow !== container) {
    btnRow.insertAdjacentHTML('beforebegin', html);
  } else {
    container.insertAdjacentHTML('beforeend', html);
  }
  _render();
  _renderFiles();
}

// ── Image thumbnail grid ─────────────────────────────────────────────────────
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

// ── File list ────────────────────────────────────────────────────────────────
function _fileIcon(mime = '') {
  if (mime.includes('pdf'))                                      return '📄';
  if (mime.includes('word') || mime.includes('document'))        return '📝';
  if (mime.includes('excel') || mime.includes('sheet'))          return '📊';
  if (mime.includes('powerpoint') || mime.includes('presenta'))  return '📊';
  if (mime.startsWith('image/'))                                 return '🖼️';
  if (mime.startsWith('text/'))                                  return '📃';
  return '📎';
}
function _fmtSize(bytes = 0) {
  if (bytes < 1024)      return bytes + ' B';
  if (bytes < 1024*1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

function _renderFiles() {
  const zone = document.getElementById('f-file-zone');
  if (!zone || !window.__FILES) return;
  const { existing, pending } = window.__FILES;
  const total = existing.length + pending.length;

  zone.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:6px;">
      ${existing.map((f, i) => `
        <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
          <span style="font-size:1.2rem;flex-shrink:0;">${_fileIcon(f.mime)}</span>
          <span style="flex:1;font-size:.82rem;color:#374151;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${f.name}">${f.name}</span>
          <span style="font-size:.72rem;color:#9ca3af;white-space:nowrap;flex-shrink:0;">${_fmtSize(f.size)}</span>
          ${f.data ? `<a href="${f.data}" download="${f.name}" style="font-size:.72rem;color:#3b82f6;text-decoration:none;white-space:nowrap;flex-shrink:0;">⬇ ดาวน์โหลด</a>` : ''}
          <button onclick="window.__fileRmEx(${i})" style="width:20px;height:20px;border-radius:50%;background:#ef4444;color:#fff;border:none;cursor:pointer;font-size:11px;flex-shrink:0;line-height:1;">✕</button>
        </div>`).join('')}
      ${pending.map((f, i) => `
        <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:#eff6ff;border-radius:8px;border:1px solid #93c5fd;">
          <span style="font-size:1.2rem;flex-shrink:0;">${_fileIcon(f.file.type)}</span>
          <span style="flex:1;font-size:.82rem;color:#374151;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${f.file.name}">${f.file.name}</span>
          <span style="font-size:.72rem;color:#3b82f6;white-space:nowrap;flex-shrink:0;">ใหม่</span>
          <span style="font-size:.72rem;color:#9ca3af;white-space:nowrap;flex-shrink:0;">${_fmtSize(f.file.size)}</span>
          <button onclick="window.__fileRmPd(${i})" style="width:20px;height:20px;border-radius:50%;background:#ef4444;color:#fff;border:none;cursor:pointer;font-size:11px;flex-shrink:0;line-height:1;">✕</button>
        </div>`).join('')}
      ${total < FILE_MAX ? `
        <label for="f-file-input" style="display:flex;align-items:center;gap:8px;padding:7px 10px;border:2px dashed #cbd5e1;border-radius:8px;cursor:pointer;color:#9ca3af;">
          <span style="font-size:1.2rem;">📎</span>
          <span style="font-size:.8rem;">เพิ่มไฟล์ (PDF, Word, Excel, ...)</span>
        </label>
        <input type="file" id="f-file-input" multiple style="display:none" onchange="window.__fileAdd(this)">
      ` : ''}
    </div>
    <div style="font-size:.72rem;color:#9ca3af;margin-top:4px;">${total}/${FILE_MAX} ไฟล์</div>`;
}

// ── Window event handlers — images ───────────────────────────────────────────
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

// ── Window event handlers — files ────────────────────────────────────────────
window.__fileAdd = inp => {
  const st = window.__FILES; if (!st) return;
  const rem = FILE_MAX - st.existing.length - st.pending.length;
  const tooBig = [];
  Array.from(inp.files).slice(0, rem).forEach(f => {
    if (f.size > FILE_SIZE_MAX) { tooBig.push(`${f.name} (${_fmtSize(f.size)})`); return; }
    st.pending.push({ file: f });
  });
  if (tooBig.length) alert(`ไฟล์ต่อไปนี้ใหญ่เกิน 700 KB (จำกัดของ Firestore):\n${tooBig.join('\n')}`);
  inp.value = ''; _renderFiles();
};
window.__fileRmEx = i => {
  const f = window.__FILES?.existing.splice(i, 1)[0];
  if (f?.id) (window.__FILES.toDelete ??= []).push({ id: f.id });
  _renderFiles();
};
window.__fileRmPd = i => { window.__FILES?.pending.splice(i, 1); _renderFiles(); };

// ── Image: resize + compress → base64 JPEG ──────────────────────────────────
function _toBase64(file, maxPx = 1024, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width: w, height: h } = img;
      if (w > maxPx || h > maxPx) {
        if (w >= h) { h = Math.round(h * maxPx / w); w = maxPx; }
        else        { w = Math.round(w * maxPx / h); h = maxPx; }
      }
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ── File: อ่านเป็น base64 DataURL ────────────────────────────────────────────
function _fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── commitAttachments: รูปภาพ → base64 array (ไว้ใน main doc) ───────────────
async function commitAttachments() {
  if (!window.__ATTACH) return [];
  const { existing, pending } = window.__ATTACH;
  const converted = await Promise.all(pending.map(({ file }) => _toBase64(file)));
  return [...existing.map(e => e.url), ...converted];
}

// ── commitFileAttachments: บันทึกไฟล์ → subcollection ───────────────────────
// เรียกหลัง setDoc/addDoc เสมอ เพื่อให้รู้ docId
// colName = ชื่อ collection หลัก เช่น 'safetyIncidents'
// docId   = ID ของ document หลักที่บันทึกไปแล้ว
async function commitFileAttachments(colName, docId) {
  const st = window.__FILES;
  if (!st || (!st.pending.length && !st.toDelete?.length)) return st?.existing ?? [];

  // ลบไฟล์ที่กดลบ
  for (const { id } of (st.toDelete ?? [])) {
    try { await deleteDoc(fsDoc(db, colName, docId, 'fileAttachments', id)); } catch {}
  }
  st.toDelete = [];

  // อัปโหลดไฟล์ใหม่
  const newRefs = [];
  for (const { file } of st.pending) {
    const data = await _fileToBase64(file);
    const ref  = await addDoc(fsCol(db, colName, docId, 'fileAttachments'), {
      name: file.name,
      mime: file.type || 'application/octet-stream',
      size: file.size,
      data,
      uploadedAt: new Date().toISOString()
    });
    newRefs.push({ id: ref.id, name: file.name, mime: file.type, size: file.size, data });
  }
  st.pending  = [];
  st.existing = [...st.existing, ...newRefs];
  return st.existing;
}

// ── loadFileAttachments: โหลดไฟล์จาก subcollection (ตอน edit) ───────────────
// เรียกหลังโหลด form data แล้ว widget inject แล้ว
async function loadFileAttachments(colName, docId) {
  const snap = await getDocs(fsCol(db, colName, docId, 'fileAttachments'));
  window.__FILES = {
    existing: snap.docs.map(d => ({ id: d.id, ...d.data() })),
    pending:  [],
    toDelete: []
  };
  _renderFiles();
}

export { commitAttachments, commitFileAttachments, loadFileAttachments };

// ── Global shortcuts (ใช้ได้จาก non-module script ด้วย) ─────────────────────
window.__commitAttach = commitAttachments;
window.__commitFiles  = commitFileAttachments;
window.__loadFiles    = loadFileAttachments;
