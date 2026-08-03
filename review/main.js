import { deleteCapture, getAllCaptures } from "../shared/api.js";
import { exactOf, isScreenshot } from "../shared/captures.js";
import { confirm as modalConfirm } from "../modal.js";
import { renderBrowse } from "./browse-view.js";
import { exportMarkdown } from "./export-md.js";
import { bindKeys } from "./keys.js";
import { renderQueue } from "./queue-view.js";
import { browseList, clampFocus, modeList, queueList, state } from "./state.js";

const progressEl = document.getElementById("rv-progress");
const contentEl = document.getElementById("rv-content");
const emptyEl = document.getElementById("rv-empty");

async function load() {
  state.captures = await getAllCaptures();
  clampFocus();
  render();
}

function render() {
  syncChrome();
  if (state.mode === "queue") {
    renderQueue({
      root: contentEl,
      progressEl,
      emptyEl,
      onDrop: drop
    });
  } else {
    renderBrowse({
      root: contentEl,
      progressEl,
      emptyEl,
      onDrop: drop
    });
  }
}

function syncChrome() {
  document.querySelectorAll("[data-mode]").forEach((el) => {
    el.classList.toggle("is-active", el.dataset.mode === state.mode);
  });
  document.querySelectorAll("[data-range]").forEach((el) => {
    el.classList.toggle("is-active", el.dataset.range === state.dateRange);
  });
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
  if (state.mode === "site") {
    await deleteCapture(id);
  } else {
    const list = modeList();
    const idx = list.findIndex((x) => x.id === id);
    await deleteCapture(id);
    if (idx >= 0 && state.focusIndex > idx) state.focusIndex -= 1;
  }
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
  const list = state.mode === "queue" ? queueList() : browseList();
  const statusLabel = state.mode === "queue" ? "待回顾" : "按网站";
  exportMarkdown(list, { dateRange: state.dateRange, statusLabel });
});

bindKeys({
  onNavigate: render,
  onDrop: drop
});

load();
