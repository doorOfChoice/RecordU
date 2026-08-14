import { escapeHtml } from "./dom.js";
import { applyExclusiveAllDayChecks, dayFilterFromChecks, normalizeDayFilter } from "./quiz.js";

/**
 * @param {{ key: string, label?: string, count?: number }[]} options
 * @param {{ name?: string, dataDay?: string, wrapAttrs?: string }} [opts]
 * @returns {string}
 */
export function dayMultiselectHtml(options, opts = {}) {
  const list = Array.isArray(options) ? options : [];
  const nameAttr = opts.name ? ` name="${escapeHtml(opts.name)}"` : "";
  const dataDay = opts.dataDay ? ` data-arena-day="${escapeHtml(opts.dataDay)}"` : "";
  const wrapAttrs = opts.wrapAttrs ? ` ${opts.wrapAttrs}` : "";
  const rows = list
    .map((o) => {
      const key = String(o.key);
      const count = Math.max(0, Number(o.count) || 0);
      const label = key === "all" ? String(o.label || "全部") : `${o.label || key}（${count}）`;
      const checked = key === "all" ? " checked" : "";
      return `<label class="ru-day-ms-option">
        <input type="checkbox" value="${escapeHtml(key)}"${nameAttr}${dataDay}${checked}>
        <span>${escapeHtml(label)}</span>
      </label>`;
    })
    .join("");
  return `<div class="ru-day-ms"${wrapAttrs}>
    <button type="button" class="ru-day-ms-trigger" aria-expanded="false" aria-haspopup="true">
      <span class="ru-day-ms-summary">全部</span>
    </button>
    <div class="ru-day-ms-panel" hidden role="group" aria-label="时间">
      ${rows}
    </div>
  </div>`;
}

/**
 * @param {Iterable<HTMLInputElement>|NodeListOf<HTMLInputElement>} boxes
 * @returns {string}
 */
export function dayMultiselectSummary(boxes) {
  const list = [...(boxes || [])];
  const checked = list.filter((el) => el.checked);
  const filter = normalizeDayFilter(checked.map((el) => el.value));
  const labelOf = (value) => {
    const el = list.find((box) => box.value === value);
    const span = el && el.closest("label") && el.closest("label").querySelector("span");
    return (span && span.textContent) || value;
  };
  if (filter === "all") return labelOf("all") || "全部";
  if (filter.length === 1) return labelOf(filter[0]);
  return `已选 ${filter.length} 天`;
}

/**
 * @param {HTMLElement} wrap
 * @param {() => void} [onChange]
 */
export function bindDayMultiselect(wrap, onChange) {
  if (!wrap) return;
  const trigger = wrap.querySelector(".ru-day-ms-trigger");
  const panel = wrap.querySelector(".ru-day-ms-panel");
  const summary = wrap.querySelector(".ru-day-ms-summary");
  const boxes = wrap.querySelectorAll('input[type="checkbox"]');
  if (!trigger || !panel) return;

  function syncSummary() {
    if (summary) summary.textContent = dayMultiselectSummary(boxes);
  }

  function setOpen(open) {
    wrap.classList.toggle("is-open", open);
    panel.hidden = !open;
    trigger.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      document.addEventListener("pointerdown", onDoc, true);
      document.addEventListener("keydown", onKey, true);
    } else {
      document.removeEventListener("pointerdown", onDoc, true);
      document.removeEventListener("keydown", onKey, true);
    }
  }

  function onDoc(e) {
    if (!wrap.isConnected) {
      setOpen(false);
      return;
    }
    if (wrap.contains(e.target)) return;
    setOpen(false);
  }

  function onKey(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      trigger.focus();
    }
  }

  trigger.addEventListener("click", () => {
    setOpen(panel.hidden);
  });

  panel.addEventListener("change", (e) => {
    const target = e.target;
    if (!target || target.type !== "checkbox") return;
    applyExclusiveAllDayChecks(boxes, target);
    syncSummary();
    if (typeof onChange === "function") onChange();
  });

  syncSummary();
}
