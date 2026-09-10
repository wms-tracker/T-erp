// ===================================================================
// ui.js — small shared UI helpers (toast, confirm modal) used across
// pages so every page shows the same feedback instead of native
// alert()/confirm(). Pure DOM, no framework — matches the rest of erp/js.
// ===================================================================

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function getStack() {
  let stack = document.querySelector(".toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.className = "toast-stack";
    document.body.appendChild(stack);
  }
  return stack;
}

const TOAST_ICON = { success: "✅", error: "⚠️", info: "ℹ️" };

/**
 * Shows a toast. `opts`: { type: 'success'|'error'|'info', title, desc,
 * actionLabel, onAction, duration (ms, default 4000; 0 = sticky) }
 */
export function toast(opts) {
  const { type = "success", title, desc = "", actionLabel, onAction, duration = 4000 } = opts;
  const stack = getStack();
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `
    <span class="toast-icon">${TOAST_ICON[type] || TOAST_ICON.info}</span>
    <div class="toast-body">
      <div class="toast-title">${esc(title)}</div>
      ${desc ? `<div class="toast-desc">${esc(desc)}</div>` : ""}
    </div>
    ${actionLabel ? `<button class="toast-action">${esc(actionLabel)}</button>` : ""}
  `;
  const remove = () => {
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 180);
  };
  if (actionLabel && onAction) {
    el.querySelector(".toast-action").addEventListener("click", () => { onAction(); remove(); });
  }
  stack.appendChild(el);
  if (duration > 0) setTimeout(remove, duration);
  return remove;
}

/**
 * Styled confirm dialog replacing window.confirm(). Returns a Promise<boolean>.
 * `opts`: { icon, title, desc, confirmLabel, cancelLabel, danger (bool) }
 */
export function confirmModal(opts) {
  const { icon = "⚠️", title, desc = "", confirmLabel = "ยืนยัน", cancelLabel = "ยกเลิก", danger = true } = opts;
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal-box" role="dialog" aria-modal="true">
        <div class="modal-icon">${icon}</div>
        <h3>${esc(title)}</h3>
        ${desc ? `<p>${esc(desc)}</p>` : ""}
        <div class="modal-actions">
          <button class="btn btn-outline" data-act="cancel">${esc(cancelLabel)}</button>
          <button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-act="confirm">${esc(confirmLabel)}</button>
        </div>
      </div>
    `;
    const close = (result) => { backdrop.remove(); resolve(result); };
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(false); });
    backdrop.querySelector('[data-act="cancel"]').addEventListener("click", () => close(false));
    backdrop.querySelector('[data-act="confirm"]').addEventListener("click", () => close(true));
    document.addEventListener("keydown", function onKey(e) {
      if (e.key === "Escape") { document.removeEventListener("keydown", onKey); close(false); }
    });
    document.body.appendChild(backdrop);
    backdrop.querySelector('[data-act="confirm"]').focus();
  });
}

/** Renders the empty-state block's inner HTML — caller sets it on a container. */
export function emptyStateHTML({ icon = "📋", title, desc = "", actionLabel, actionHref }) {
  return `
    <div class="empty-state">
      <div class="empty-icon">${icon}</div>
      <div class="empty-title">${esc(title)}</div>
      ${desc ? `<div class="empty-desc">${esc(desc)}</div>` : ""}
      ${actionLabel && actionHref ? `<a class="btn btn-primary" href="${actionHref}">${esc(actionLabel)}</a>` : ""}
    </div>
  `;
}
