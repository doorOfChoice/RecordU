import { escapeHtml } from "./shared/dom.js";

let current = null;

function build({ title, message, confirmText, cancelText, danger }) {
  const overlay = document.createElement("div");
  overlay.className = "rc-modal-overlay";
  overlay.innerHTML = `
    <div class="rc-modal" role="dialog" aria-modal="true">
      <div class="rc-modal-title">${escapeHtml(title || "")}</div>
      <div class="rc-modal-body">${escapeHtml(message || "")}</div>
      <div class="rc-modal-actions">
        <button type="button" class="btn rc-modal-cancel">${escapeHtml(cancelText || "取消")}</button>
        <button type="button" class="btn btn-primary ${danger ? "rc-modal-danger" : ""}">${escapeHtml(confirmText || "确定")}</button>
      </div>
    </div>
  `;
  return overlay;
}

function open(overlay) {
  if (current) current.resolve("cancel");

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("show"));

  const confirmBtn = overlay.querySelector(".btn-primary");
  const cancelBtn = overlay.querySelector(".rc-modal-cancel");
  confirmBtn.focus();

  return new Promise((resolve) => {
    current = { overlay, resolve };

    function done(result) {
      if (current && current.overlay === overlay) current = null;
      overlay.classList.remove("show");
      overlay.addEventListener("transitionend", () => overlay.remove(), { once: true });
      setTimeout(() => overlay.remove(), 250);
      document.removeEventListener("keydown", onKeydown);
      resolve(result);
    }

    function onKeydown(e) {
      if (e.key === "Escape") done("cancel");
      if (e.key === "Enter") done("confirm");
      if (e.key === "Tab") {
        const focusables = overlay.querySelectorAll("button:not([disabled])");
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    confirmBtn.addEventListener("click", () => done("confirm"));
    if (cancelBtn) cancelBtn.addEventListener("click", () => done("cancel"));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) done("cancel");
    });
    document.addEventListener("keydown", onKeydown);
  });
}

export function confirm(opts = {}) {
  const overlay = build({
    title: opts.title || "确认",
    message: opts.message || "",
    confirmText: opts.confirmText || "确定",
    cancelText: opts.cancelText || "取消",
    danger: opts.danger
  });
  return open(overlay).then((result) => {
    if (result === "confirm") {
      if (opts.onConfirm) opts.onConfirm();
      return true;
    }
    if (opts.onCancel) opts.onCancel();
    return false;
  });
}

export function alert(opts = {}) {
  const overlay = build({
    title: opts.title || "提示",
    message: opts.message || "",
    confirmText: opts.confirmText || "知道了",
    cancelText: null,
    danger: opts.danger
  });
  const cancel = overlay.querySelector(".rc-modal-cancel");
  if (cancel) cancel.remove();
  return open(overlay).then((result) => {
    if (result === "confirm" && opts.onConfirm) opts.onConfirm();
  });
}

export function close() {
  if (current) current.resolve("cancel");
}

window.RcModal = { confirm, alert, close };
