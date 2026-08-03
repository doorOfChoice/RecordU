import { escapeHtml } from "../shared/dom.js";

function svgDrop() {
  return `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>`;
}

/**
 * @param {string} label
 * @param {string} [id]
 */
export function dropActionHtml(label = "删除", id) {
  const idAttr = id ? ` data-id="${escapeHtml(id)}"` : "";
  return `<button type="button" class="rv-icon-act rv-icon-drop" data-act="drop"${idAttr} title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${svgDrop()}</button>`;
}
