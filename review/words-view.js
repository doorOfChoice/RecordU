import { escapeHtml } from "../shared/dom.js";
import { dayKey, formatDayLabel } from "../shared/time.js";
import { wordActionsHtml } from "./action-icons.js";
import { renderArena } from "./arena-view.js";
import { renderQuizList, renderQuizTake } from "./quiz-view.js";
import { clampFocus, focusedWord, wordsList, state } from "./state.js";

const NAV_ITEMS = [
  { id: "list", label: "单词列表" },
  { id: "arena", label: "练习场" },
  { id: "quizzes", label: "试卷" }
];

function normalizeWordsTab(value) {
  if (value === "quizzes" || value === "arena") return value;
  return "list";
}

export const WORDS_PAGE_SIZE = 48;

/** @type {IntersectionObserver | null} */
let wordsSentinelObserver = null;

function disconnectWordsSentinel() {
  if (wordsSentinelObserver) {
    wordsSentinelObserver.disconnect();
    wordsSentinelObserver = null;
  }
}

/**
 * Clamp / expand visible count so focus stays covered and length stays valid.
 * @param {number} total
 * @returns {number}
 */
function syncWordsVisibleCount(total) {
  const page = WORDS_PAGE_SIZE;
  let n = Number(state.wordsVisibleCount);
  if (!Number.isFinite(n) || n < page) n = page;
  const need = Math.max(n, (Number(state.focusIndex) || 0) + 1);
  n = Math.ceil(need / page) * page;
  if (total > 0 && n > total) n = total;
  if (total <= 0) n = page;
  state.wordsVisibleCount = n;
  return n;
}

/**
 * @param {Array<{id: string, createdAt?: number}>} list
 * @param {number} [indexOffset]
 * @returns {{ key: string, label: string, items: Array<{ word: object, index: number }> }[]}
 */
function groupWordsByDay(list, indexOffset = 0) {
  const groups = [];
  const byKey = new Map();

  list.forEach((w, i) => {
    const index = indexOffset + i;
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

/**
 * @param {object[]} list full word list
 * @param {number} visibleCount
 */
function listPanelHtml(list, visibleCount) {
  if (!list.length) {
    return `<p class="rv-words-panel-empty">还没有标记单词。在网页上划词后点「标记单词」即可。</p>`;
  }
  const visible = list.slice(0, visibleCount);
  const groups = groupWordsByDay(visible, 0);
  const atEnd = visibleCount >= list.length;
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
    ${
      atEnd
        ? `<p class="rv-words-end">已显示全部</p>`
        : `<div class="rv-words-sentinel" data-words-sentinel aria-hidden="true"></div>`
    }
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
 * @param {boolean} [opts.preserveScroll]
 */
function bindWordsListPanel(main, { root, progressEl, emptyEl, onDrop, onEdit, onLearn, preserveScroll }) {
  const list = wordsList();
  const visibleCount = syncWordsVisibleCount(list.length);
  const scrollY = preserveScroll ? window.scrollY : null;

  if (!list.length) {
    progressEl.textContent = "单词 · 0 个";
  } else if (visibleCount < list.length) {
    progressEl.textContent = `单词 · ${list.length} 个 · 已显示 ${visibleCount}`;
  } else {
    progressEl.textContent = `单词 · ${list.length} 个 · 第 ${state.focusIndex + 1} 个`;
  }

  disconnectWordsSentinel();
  main.innerHTML = listPanelHtml(list, visibleCount);

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

  const sentinel = main.querySelector("[data-words-sentinel]");
  if (sentinel && visibleCount < list.length) {
    wordsSentinelObserver = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((en) => en.isIntersecting);
        if (!hit) return;
        if (state.mode !== "words" || state.wordsTab !== "list") return;
        const total = wordsList().length;
        if (state.wordsVisibleCount >= total) return;
        state.wordsVisibleCount = Math.min(total, state.wordsVisibleCount + WORDS_PAGE_SIZE);
        const panel = root.querySelector("#rv-words-main");
        if (!panel) return;
        bindWordsListPanel(panel, {
          root,
          progressEl,
          emptyEl,
          onDrop,
          onEdit,
          onLearn,
          preserveScroll: true
        });
      },
      { root: null, rootMargin: "200px 0px", threshold: 0 }
    );
    wordsSentinelObserver.observe(sentinel);
  }

  const onEl = main.querySelector(".rv-word-entry.is-on");
  if (onEl && typeof onEl.scrollIntoView === "function" && !preserveScroll) {
    onEl.scrollIntoView({ block: "nearest" });
  } else if (preserveScroll && scrollY != null) {
    requestAnimationFrame(() => window.scrollTo(0, scrollY));
  }
}

/**
 * @param {object} opts
 * @param {HTMLElement} opts.root
 * @param {HTMLElement} opts.progressEl
 * @param {HTMLElement} opts.emptyEl
 * @param {(id: string) => Promise<void>} opts.onDrop
 * @param {(id: string) => Promise<void>} [opts.onEdit]
 * @param {(id: string) => Promise<void>} [opts.onLearn]
 * @param {boolean} [opts.preserveScroll]
 */
export function renderWords({ root, progressEl, emptyEl, onDrop, onEdit, onLearn, preserveScroll = false }) {
  clampFocus();
  emptyEl.classList.add("hidden");
  root.classList.remove("hidden");

  const tab = normalizeWordsTab(state.wordsTab);
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
      const next = normalizeWordsTab(btn.dataset.wtab);
      if (
        next === state.wordsTab &&
        !state.activeQuizId &&
        !state.activeArenaMode
      ) {
        return;
      }
      state.wordsTab = next;
      state.activeQuizId = null;
      state.activeArenaMode = null;
      state.arenaSession = null;
      if (next === "list") state.wordsVisibleCount = WORDS_PAGE_SIZE;
      renderWords({ root, progressEl, emptyEl, onDrop, onEdit, onLearn });
    });
  });

  const main = root.querySelector("#rv-words-main");

  if (tab === "arena") {
    disconnectWordsSentinel();
    renderArena({
      root: main,
      progressEl,
      onRefresh: () => renderWords({ root, progressEl, emptyEl, onDrop, onEdit, onLearn })
    });
    return null;
  }

  if (tab === "quizzes") {
    disconnectWordsSentinel();
    state.activeArenaMode = null;
    state.arenaSession = null;
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

  bindWordsListPanel(main, {
    root,
    progressEl,
    emptyEl,
    onDrop,
    onEdit,
    onLearn,
    preserveScroll
  });

  return focusedWord();
}
