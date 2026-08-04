import { dateRangeLabel } from "../shared/time.js";
import { renderSplitView } from "./split-view.js";
import { clampFocus, focusedCapture, queueList, state } from "./state.js";

/**
 * @param {object} opts
 * @param {HTMLElement} opts.root
 * @param {HTMLElement} opts.progressEl
 * @param {HTMLElement} opts.emptyEl
 * @param {(id: string) => Promise<void>} opts.onDrop
 * @param {(id: string) => Promise<void>} [opts.onEdit]
 */
export function renderQueue({ root, progressEl, emptyEl, onDrop, onEdit }) {
  clampFocus();
  const list = queueList();
  const rangeLabel = state.dateRange === "week" ? "本周" : dateRangeLabel(state.dateRange);

  if (!list.length) {
    progressEl.textContent = `0 条`;
    emptyEl.classList.remove("hidden");
    root.classList.add("hidden");
    root.innerHTML = "";
    emptyEl.querySelector(".rv-empty-text").textContent =
      state.dateRange === "all"
        ? "没有待回顾的感触。看到让你咯噔的内容，选中后记下即可。"
        : `${rangeLabel}没有待回顾。可切换「全部」看看。`;
    return null;
  }

  progressEl.textContent = `第 ${state.focusIndex + 1} / ${list.length} 条`;
  emptyEl.classList.add("hidden");
  root.classList.remove("hidden");

  return renderSplitView({
    root,
    list,
    focusIndex: state.focusIndex,
    onSelect: (index) => {
      state.focusIndex = index;
      renderQueue({ root, progressEl, emptyEl, onDrop, onEdit });
    },
    onAction: async (c, act) => {
      if (act === "drop") await onDrop(c.id);
      if (act === "edit" && onEdit) await onEdit(c.id);
    }
  }) || focusedCapture();
}
