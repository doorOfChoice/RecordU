import { escapeHtml } from "../shared/dom.js";
import { dayKey, dayStr } from "../shared/time.js";
import { entryActionsHtml } from "./action-icons.js";
import { clampFocus, focusedWord, wordsList, state } from "./state.js";

/**
 * @param {Array<{id: string, createdAt?: number}>} list
 * @returns {{ key: string, label: string, items: Array<{ word: object, index: number }> }[]}
 */
function groupWordsByDay(list) {
  const today = dayStr(0);
  const yesterday = dayStr(1);
  const thisYear = new Date().getFullYear();
  const groups = [];
  const byKey = new Map();

  list.forEach((w, index) => {
    const d = new Date(w.createdAt || Date.now());
    const key = dayKey(d);
    let group = byKey.get(key);
    if (!group) {
      let label;
      if (key === today) label = "今天";
      else if (key === yesterday) label = "昨天";
      else if (d.getFullYear() === thisYear) label = `${d.getMonth() + 1}月${d.getDate()}日`;
      else label = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
      group = { key, label, items: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.items.push({ word: w, index });
  });

  return groups;
}

function matchModeLabel(mode) {
  if (mode === "exact") return "精准";
  if (mode === "variant") return "变体";
  return "跟随全局";
}

function wordCardHtml(w, i, focused) {
  const note = (w.note || "").trim();
  const translation = (w.translation || "").trim();
  const phonetic = (w.phonetic || "").trim();
  const body = note || translation;
  const source =
    focused && w.pageUrl
      ? `<a class="rv-source" href="${escapeHtml(w.pageUrl)}" target="_blank" rel="noopener">${escapeHtml(
          w.pageTitle || "来源"
        )}</a>`
      : "";
  const metaBits = [];
  if (phonetic) {
    metaBits.push(`<span class="rv-word-phonetic">${escapeHtml(phonetic)}</span>`);
  }
  if (w.matchMode && w.matchMode !== "inherit") {
    metaBits.push(
      `<span class="rv-word-match-tag">${escapeHtml(matchModeLabel(w.matchMode))}</span>`
    );
  }
  return `
    <article class="rv-word-entry${focused ? " is-on" : ""}" data-id="${escapeHtml(w.id)}" data-index="${i}">
      <p class="rv-word-term">${escapeHtml(w.word)}</p>
      ${metaBits.length ? `<div class="rv-word-meta">${metaBits.join("")}</div>` : ""}
      ${
        body
          ? `<p class="rv-word-note">${escapeHtml(body)}</p>`
          : `<p class="rv-word-note rv-word-note-empty">无释义</p>`
      }
      <div class="rv-word-foot">
        ${source ? `<span class="rv-word-source">${source}</span>` : `<span class="rv-word-source"></span>`}
        <span class="rv-meta-actions">${entryActionsHtml(w.id)}</span>
      </div>
    </article>`;
}

/**
 * @param {object} opts
 * @param {HTMLElement} opts.root
 * @param {HTMLElement} opts.progressEl
 * @param {HTMLElement} opts.emptyEl
 * @param {(id: string) => Promise<void>} opts.onDrop
 * @param {(id: string) => Promise<void>} [opts.onEdit]
 */
export function renderWords({ root, progressEl, emptyEl, onDrop, onEdit }) {
  clampFocus();
  const list = wordsList();

  if (!list.length) {
    progressEl.textContent = "单词 · 0 个";
    emptyEl.classList.remove("hidden");
    root.classList.add("hidden");
    root.innerHTML = "";
    emptyEl.querySelector(".rv-empty-text").textContent =
      "还没有标记单词。在网页上划词后点「标记单词」即可。";
    return null;
  }

  progressEl.textContent = `单词 · ${list.length} 个 · 第 ${state.focusIndex + 1} 个`;
  emptyEl.classList.add("hidden");
  root.classList.remove("hidden");

  const groups = groupWordsByDay(list);
  root.innerHTML = `
    <div class="rv-words-timeline">
      ${groups
        .map(
          (g) => `
        <section class="rv-words-day" data-day="${escapeHtml(g.key)}">
          <h2 class="rv-words-day-title">${escapeHtml(g.label)} · ${g.items.length}</h2>
          <div class="rv-words-grid">
            ${g.items.map(({ word: w, index: i }) => wordCardHtml(w, i, i === state.focusIndex)).join("")}
          </div>
        </section>`
        )
        .join("")}
    </div>
  `;

  root.querySelectorAll(".rv-word-entry").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest && e.target.closest("[data-act], a.rv-source")) return;
      const idx = Number(el.dataset.index);
      if (!Number.isFinite(idx)) return;
      state.focusIndex = idx;
      renderWords({ root, progressEl, emptyEl, onDrop, onEdit });
    });
  });

  root.querySelectorAll("[data-act]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = btn.dataset.id;
      if (!id) return;
      if (btn.dataset.act === "drop") await onDrop(id);
      if (btn.dataset.act === "edit" && onEdit) await onEdit(id);
    });
  });

  const onEl = root.querySelector(".rv-word-entry.is-on");
  if (onEl && typeof onEl.scrollIntoView === "function") {
    onEl.scrollIntoView({ block: "nearest" });
  }

  return focusedWord();
}
