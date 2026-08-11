import { escapeHtml } from "../shared/dom.js";

function svgDrop() {
  return `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>`;
}

function svgEdit() {
  return `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M9.5 3.5l3 3L6 13H3v-3l6.5-6.5z"/><path d="M8.5 4.5l3 3"/></svg>`;
}

function svgLearn() {
  return `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg>`;
}

function svgSpeak() {
  return `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M2.5 6.5h2L7.5 4v8l-3-2.5h-2z"/><path d="M10 6a3.2 3.2 0 010 4"/><path d="M11.6 4.4a5.6 5.6 0 010 7.2"/></svg>`;
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
 * @param {string} label
 * @param {string} [id]
 * @param {boolean} [learned]
 */
export function learnActionHtml(label = "学会了", id, learned = false) {
  const idAttr = id ? ` data-id="${escapeHtml(id)}"` : "";
  const learnedClass = learned ? " is-learned" : "";
  return `<button type="button" class="rv-icon-act rv-icon-learn${learnedClass}" data-act="learn"${idAttr} title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${svgLearn()}</button>`;
}

/**
 * @param {string} [id]
 */
export function entryActionsHtml(id) {
  return `${editActionHtml("编辑", id)}${dropActionHtml("删除", id)}`;
}

/**
 * @param {string} word
 */
export function speakActionHtml(word) {
  const term = String(word || "").trim();
  if (!term) return "";
  return `<button type="button" class="rv-icon-act rv-icon-speak" data-act="speak" data-term="${escapeHtml(
    term
  )}" title="朗读" aria-label="朗读">${svgSpeak()}</button>`;
}

/**
 * @param {string} [id]
 * @param {boolean} [learned]
 */
export function wordActionsHtml(id, learned = false) {
  const learnLabel = learned ? "还在学" : "学会了";
  return `${learnActionHtml(learnLabel, id, learned)}${entryActionsHtml(id)}`;
}
