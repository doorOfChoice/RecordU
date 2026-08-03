import { escapeHtml } from "../shared/dom.js";

function svgDrop() {
  return `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>`;
}

function svgEdit() {
  return `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M9.5 3.5l3 3L6 13H3v-3l6.5-6.5z"/><path d="M8.5 4.5l3 3"/></svg>`;
}

/**
 * @param {string} label
 * @param {string} [id]
 */
export function dropActionHtml(label = "删除", id) {
  const idAttr = id ? ` data-id="${escapeHtml(id)}"` : "";
  return `<button type="button" class="rv-icon-act rv-icon-drop" data-act="drop"${idAttr} title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${svgDrop()}</button>`;
}

/**
 * @param {string} label
 * @param {string} [id]
 */
export function editActionHtml(label = "编辑", id) {
  const idAttr = id ? ` data-id="${escapeHtml(id)}"` : "";
  return `<button type="button" class="rv-icon-act rv-icon-edit" data-act="edit"${idAttr} title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${svgEdit()}</button>`;
}

/**
 * @param {string} [id]
 */
export function entryActionsHtml(id) {
  return `${editActionHtml("编辑", id)}${dropActionHtml("删除", id)}`;
}
