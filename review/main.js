import {
  deleteCapture,
  deleteWord,
  getAllCaptures,
  getAllQuizzes,
  getAllWords,
  getSettings,
  saveSettings,
  updateCapture,
  updateWord
} from "../shared/api.js";
import { exactOf, isScreenshot } from "../shared/captures.js";
import { DEFAULT_SETTINGS } from "../shared/settings.js";
import { confirm as modalConfirm, promptEdit, promptWordEdit } from "../modal.js";
import { downloadBackup, restoreBackupFromFile } from "./backup.js";
import { renderBrowse } from "./browse-view.js";
import { exportMarkdown } from "./export-md.js";
import { bindKeys } from "./keys.js";
import { renderQueue } from "./queue-view.js";
import { renderSettings } from "./settings-view.js";
import { renderWords } from "./words-view.js";
import {
  browseList,
  clampFocus,
  isSiteCaptureView,
  modeList,
  queueList,
  state
} from "./state.js";

const progressEl = document.getElementById("rv-progress");
const contentEl = document.getElementById("rv-content");
const emptyEl = document.getElementById("rv-empty");
const filtersEl = document.querySelector(".rv-toolbar-filters");
const viewNav = document.querySelector(".rv-view");
const rangeNav = document.querySelector(".rv-range");
const exportLink = document.getElementById("rv-export");

async function load() {
  const [captures, words, settings, quizzes] = await Promise.all([
    getAllCaptures(),
    getAllWords(),
    getSettings(),
    getAllQuizzes()
  ]);
  state.captures = captures;
  state.words = words;
  state.quizzes = quizzes;
  state.settings = settings || { ...DEFAULT_SETTINGS };
  clampFocus();
  render();
}

function render() {
  syncChrome();
  if (state.mode === "settings") {
    renderSettings({
      root: contentEl,
      progressEl,
      emptyEl,
      settings: state.settings || DEFAULT_SETTINGS,
      onSave: async (patch) => {
        const res = await saveSettings(patch);
        if (!res || !res.ok) return null;
        state.settings = res.settings;
        return res.settings;
      },
      onBackup: async (onProgress) => {
        await downloadBackup(onProgress);
      },
      onRestore: async (file, onProgress) => {
        const ok = await modalConfirm({
          title: "从备份恢复？",
          message:
            "将清空当前本地的感触、截图、单词、试卷与站点图标，并以备份文件为准。此操作不可撤销。",
          confirmText: "清空并恢复",
          cancelText: "取消",
          danger: true
        });
        if (!ok) return { cancelled: true };
        await restoreBackupFromFile(file, onProgress);
        return { cancelled: false };
      },
      onAfterRestore: load
    });
  } else if (state.mode === "words") {
    renderWords({
      root: contentEl,
      progressEl,
      emptyEl,
      onDrop: dropWord,
      onEdit: editWord,
      onLearn: toggleWordLearned
    });
  } else if (state.captureView === "site") {
    renderBrowse({
      root: contentEl,
      progressEl,
      emptyEl,
      onDrop: drop,
      onEdit: edit
    });
  } else {
    renderQueue({
      root: contentEl,
      progressEl,
      emptyEl,
      onDrop: drop,
      onEdit: edit
    });
  }
}

function syncChrome() {
  document.querySelectorAll("[data-mode]").forEach((el) => {
    el.classList.toggle("is-active", el.dataset.mode === state.mode);
  });
  document.querySelectorAll("[data-view]").forEach((el) => {
    el.classList.toggle("is-active", el.dataset.view === state.captureView);
  });
  document.querySelectorAll("[data-range]").forEach((el) => {
    el.classList.toggle("is-active", el.dataset.range === state.dateRange);
  });
  const hideChrome = state.mode === "words" || state.mode === "settings";
  if (filtersEl) filtersEl.classList.toggle("hidden", hideChrome);
  if (viewNav) viewNav.classList.toggle("hidden", hideChrome);
  if (rangeNav) rangeNav.classList.toggle("hidden", hideChrome);
  if (exportLink) exportLink.classList.toggle("hidden", hideChrome);
}

async function edit(id) {
  const c = state.captures.find((x) => x.id === id);
  if (!c) return;
  const next = await promptEdit({
    title: "编辑感触",
    value: c.text || "",
    placeholder: "你的感触，用你自己的话……",
    confirmText: "保存",
    cancelText: "取消"
  });
  if (next == null) return;
  const text = next.trim();
  if (!text || text === (c.text || "").trim()) return;
  await updateCapture(id, { text });
  await load();
}

async function drop(id) {
  const c = state.captures.find((x) => x.id === id);
  if (!c) return;
  const exact = exactOf(c);
  const extra = exact ? `\n\n原文：${exact}` : isScreenshot(c) ? "\n\n（含截图）" : "";
  const ok = await modalConfirm({
    title: "删除这条感触？",
    message: `${c.text}${extra}`,
    confirmText: "删除",
    cancelText: "取消",
    danger: true
  });
  if (!ok) return;
  if (isSiteCaptureView()) {
    await deleteCapture(id);
  } else {
    const list = modeList();
    const idx = list.findIndex((x) => x.id === id);
    await deleteCapture(id);
    if (idx >= 0 && state.focusIndex > idx) state.focusIndex -= 1;
  }
  await load();
}

async function editWord(id) {
  const w = state.words.find((x) => x.id === id);
  if (!w) return;
  const next = await promptWordEdit({
    title: `编辑单词 · ${w.word}`,
    phonetic: w.phonetic || "",
    translation: w.translation || "",
    note: w.note || "",
    matchMode: w.matchMode || "inherit",
    confirmText: "保存",
    cancelText: "取消"
  });
  if (next == null) return;
  const patch = {
    phonetic: next.phonetic,
    translation: next.translation,
    note: next.note,
    matchMode: next.matchMode
  };
  const same =
    patch.phonetic === (w.phonetic || "").trim() &&
    patch.translation === (w.translation || "").trim() &&
    patch.note === (w.note || "").trim() &&
    patch.matchMode === (w.matchMode || "inherit");
  if (same) return;
  await updateWord(id, patch);
  await load();
}

async function dropWord(id) {
  const w = state.words.find((x) => x.id === id);
  if (!w) return;
  const extra = w.note ? `\n\n${w.note}` : "";
  const ok = await modalConfirm({
    title: "删除这个单词？",
    message: `${w.word}${extra}`,
    confirmText: "删除",
    cancelText: "取消",
    danger: true
  });
  if (!ok) return;
  const list = modeList();
  const idx = list.findIndex((x) => x.id === id);
  await deleteWord(id);
  if (idx >= 0 && state.focusIndex > idx) state.focusIndex -= 1;
  await load();
}

async function toggleWordLearned(id) {
  const w = state.words.find((x) => x.id === id);
  if (!w) return;
  await updateWord(id, { learned: !w.learned });
  await load();
}

document.querySelectorAll("[data-mode]").forEach((el) => {
  el.addEventListener("click", (e) => {
    e.preventDefault();
    state.mode = el.dataset.mode;
    state.focusIndex = 0;
    render();
  });
});

document.querySelectorAll("[data-view]").forEach((el) => {
  el.addEventListener("click", (e) => {
    e.preventDefault();
    const view = el.dataset.view === "site" ? "site" : "queue";
    state.captureView = view;
    state.focusIndex = 0;
    render();
  });
});

document.querySelectorAll("[data-range]").forEach((el) => {
  el.addEventListener("click", (e) => {
    e.preventDefault();
    state.dateRange = el.dataset.range;
    state.focusIndex = 0;
    render();
  });
});

document.getElementById("rv-export").addEventListener("click", (e) => {
  e.preventDefault();
  if (state.mode === "words" || state.mode === "settings") return;
  const list = state.captureView === "site" ? browseList() : queueList();
  const statusLabel = state.captureView === "site" ? "按网站" : "待回顾";
  exportMarkdown(list, { dateRange: state.dateRange, statusLabel });
});

bindKeys({
  onNavigate: render,
  onDrop: (id) => (state.mode === "words" ? dropWord(id) : drop(id)),
  onEdit: (id) => (state.mode === "words" ? editWord(id) : edit(id)),
  onLearn: (id) => (state.mode === "words" ? toggleWordLearned(id) : null)
});

load();
