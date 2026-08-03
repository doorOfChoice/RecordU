import { exactOf, hostnameOf } from "../shared/captures.js";
import { escapeHtml } from "../shared/dom.js";
import { fmtTime } from "../shared/time.js";
import { dropActionHtml } from "./action-icons.js";

/**
 * Shared left-rail + right-pane layout.
 * @param {object} opts
 * @param {HTMLElement} opts.root
 * @param {object[]} opts.list
 * @param {number} opts.focusIndex
 * @param {(index: number) => void} opts.onSelect
 * @param {(capture: object, act: string) => Promise<void>|void} opts.onAction
 * @param {(capture: object) => string} [opts.railSub]
 * @param {(capture: object) => string} [opts.actionsHtml]
 */
export function renderSplitView({
  root,
  list,
  focusIndex,
  onSelect,
  onAction,
  railSub,
  actionsHtml
}) {
  const focus = list[focusIndex] || null;
  if (!focus) {
    root.innerHTML = "";
    return null;
  }

  const defaultSub = (c) => {
    const host = hostnameOf(c) || "未记录来源";
    return `${host} · ${fmtTime(c.createdAt, true)}`;
  };
  const subFn = railSub || defaultSub;

  const defaultActions = () => dropActionHtml("删除");
  const actsFn = actionsHtml || defaultActions;

  const railItems = list
    .map((c, i) => {
      return `
        <button type="button" class="rv-rail-item${i === focusIndex ? " is-on" : ""}" data-index="${i}">
          <span class="rv-rail-note">${escapeHtml(c.text)}</span>
          <span class="rv-rail-sub">${escapeHtml(subFn(c))}</span>
        </button>
      `;
    })
    .join("");

  const exact = exactOf(focus);
  const host = hostnameOf(focus) || "未记录来源";

  root.innerHTML = `
    <div class="rv-split">
      <aside class="rv-rail" aria-label="列表">${railItems}</aside>
      <section class="rv-pane">
        <p class="rv-note">${escapeHtml(focus.text)}</p>
        ${exact ? `<blockquote class="rv-quote">${escapeHtml(exact)}</blockquote>` : ""}
        <div class="rv-meta">
          <span class="rv-meta-info">
            <span>${escapeHtml(host)}</span>
            <span>${fmtTime(focus.createdAt, true)}</span>
            ${
              focus.pageUrl
                ? `<a class="rv-source" href="${escapeHtml(focus.pageUrl)}" target="_blank" rel="noopener">原文</a>`
                : ""
            }
          </span>
          <span class="rv-meta-actions">${actsFn(focus)}</span>
        </div>
      </section>
    </div>
  `;

  const onItem = root.querySelector(`.rv-rail-item[data-index="${focusIndex}"]`);
  if (onItem) onItem.scrollIntoView({ block: "nearest", behavior: "smooth" });

  root.querySelectorAll(".rv-rail-item").forEach((btn) => {
    btn.addEventListener("click", () => onSelect(Number(btn.dataset.index)));
  });

  root.querySelector(".rv-meta-actions").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    await onAction(focus, btn.dataset.act);
  });

  return focus;
}
