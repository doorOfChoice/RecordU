import { escapeHtml } from "../shared/dom.js";
import { dayKey, formatDayLabel } from "../shared/time.js";
import { wordActionsHtml } from "./action-icons.js";
import { renderQuizList, renderQuizTake } from "./quiz-view.js";
import { clampFocus, focusedWord, wordsList, state } from "./state.js";

const NAV_ITEMS = [
  { id: "list", label: "单词列表" },
  { id: "quizzes", label: "试题列表" }
];

/**
 * @param {Array<{id: string, createdAt?: number}>} list
 * @returns {{ key: string, label: string, items: Array<{ word: object, index: number }> }[]}
 */
function groupWordsByDay(list) {
  const groups = [];
  const byKey = new Map();

  list.forEach((w, index) => {
    const d = new Date(w.createdAt || Date.now());
    const key = dayKey(d);
    let group = byKey.get(key);
    if (!group) {
      group = { key, label: formatDayLabel(key), items: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.items.push({ word: w, index });
  });

  for (const group of groups) {
    group.items.sort((a, b) => Number(!!a.word.learned) - Number(!!b.word.learned));
  }

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
  const learned = !!w.learned;
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
  if (learned) {
    metaBits.push(`<span class="rv-word-learned-tag">已学会</span>`);
  }
  if (w.matchMode && w.matchMode !== "inherit") {
    metaBits.push(
      `<span class="rv-word-match-tag">${escapeHtml(matchModeLabel(w.matchMode))}</span>`
    );
  }
  return `
    <article class="rv-word-entry${focused ? " is-on" : ""}${learned ? " is-learned" : ""}" data-id="${escapeHtml(w.id)}" data-index="${i}">
      <p class="rv-word-term">${escapeHtml(w.word)}</p>
      ${metaBits.length ? `<div class="rv-word-meta">${metaBits.join("")}</div>` : ""}
      ${
        body
          ? `<p class="rv-word-note">${escapeHtml(body)}</p>`
          : `<p class="rv-word-note rv-word-note-empty">无释义</p>`
      }
      <div class="rv-word-foot">
        ${source ? `<span class="rv-word-source">${source}</span>` : `<span class="rv-word-source"></span>`}
        <span class="rv-meta-actions">${wordActionsHtml(w.id, learned)}</span>
      </div>
    </article>`;
}

function listPanelHtml() {
  const list = wordsList();
  if (!list.length) {
    return `<p class="rv-words-panel-empty">还没有标记单词。在网页上划词后点「标记单词」即可。</p>`;
  }
  const groups = groupWordsByDay(list);
  return `
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
}

/**
 * @param {object} opts
 * @param {HTMLElement} opts.root
 * @param {HTMLElement} opts.progressEl
 * @param {HTMLElement} opts.emptyEl
 * @param {(id: string) => Promise<void>} opts.onDrop
 * @param {(id: string) => Promise<void>} [opts.onEdit]
 * @param {(id: string) => Promise<void>} [opts.onLearn]
 */
export function renderWords({ root, progressEl, emptyEl, onDrop, onEdit, onLearn }) {
  clampFocus();
  emptyEl.classList.add("hidden");
  root.classList.remove("hidden");

  const tab = state.wordsTab === "quizzes" ? "quizzes" : "list";
  state.wordsTab = tab;

  root.innerHTML = `
    <div class="rv-words-shell">
      <nav class="rv-words-nav" role="tablist" aria-label="单词分类" aria-orientation="vertical">
        ${NAV_ITEMS.map(
          (item) => `
          <button type="button"
            class="rv-words-nav-item${tab === item.id ? " is-on" : ""}"
            data-wtab="${item.id}"
            role="tab"
            aria-selected="${tab === item.id}">
            ${escapeHtml(item.label)}
          </button>`
        ).join("")}
      </nav>
      <div class="rv-words-main" role="tabpanel" id="rv-words-main"></div>
    </div>
  `;

  root.querySelectorAll("[data-wtab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = btn.dataset.wtab === "quizzes" ? "quizzes" : "list";
      if (next === state.wordsTab && !state.activeQuizId) return;
      state.wordsTab = next;
      state.activeQuizId = null;
      renderWords({ root, progressEl, emptyEl, onDrop, onEdit, onLearn });
    });
  });

  const main = root.querySelector("#rv-words-main");

  if (tab === "quizzes") {
    const activeId = state.activeQuizId;
    const quiz =
      activeId && Array.isArray(state.quizzes)
        ? state.quizzes.find((q) => q.id === activeId)
        : null;
    if (activeId && quiz) {
      renderQuizTake({
        root: main,
        progressEl,
        quiz,
        onBack: () => {
          state.activeQuizId = null;
          renderWords({ root, progressEl, emptyEl, onDrop, onEdit, onLearn });
        },
        onUpdated: (updated) => {
          state.quizzes = (state.quizzes || []).map((q) =>
            q.id === updated.id ? updated : q
          );
          state.activeQuizId = updated.id;
          renderWords({ root, progressEl, emptyEl, onDrop, onEdit, onLearn });
        }
      });
    } else {
      state.activeQuizId = null;
      renderQuizList({
        root: main,
        progressEl,
        onRefresh: () => renderWords({ root, progressEl, emptyEl, onDrop, onEdit, onLearn }),
        onOpen: (id) => {
          state.activeQuizId = id;
          renderWords({ root, progressEl, emptyEl, onDrop, onEdit, onLearn });
        }
      });
    }
    return null;
  }

  const list = wordsList();
  if (!list.length) {
    progressEl.textContent = "单词 · 0 个";
  } else {
    progressEl.textContent = `单词 · ${list.length} 个 · 第 ${state.focusIndex + 1} 个`;
  }

  main.innerHTML = listPanelHtml();

  main.querySelectorAll(".rv-word-entry").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest && e.target.closest("[data-act], a.rv-source")) return;
      const idx = Number(el.dataset.index);
      if (!Number.isFinite(idx)) return;
      state.focusIndex = idx;
      renderWords({ root, progressEl, emptyEl, onDrop, onEdit, onLearn });
    });
  });

  main.querySelectorAll("[data-act]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = btn.dataset.id;
      if (!id) return;
      if (btn.dataset.act === "drop") await onDrop(id);
      if (btn.dataset.act === "edit" && onEdit) await onEdit(id);
      if (btn.dataset.act === "learn" && onLearn) await onLearn(id);
    });
  });

  const onEl = main.querySelector(".rv-word-entry.is-on");
  if (onEl && typeof onEl.scrollIntoView === "function") {
    onEl.scrollIntoView({ block: "nearest" });
  }

  return focusedWord();
}
