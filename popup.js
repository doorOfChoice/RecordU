import { saveCapture, startRegionCapture } from "./shared/api.js";

const input = document.getElementById("input");
const toast = document.getElementById("toast");
let currentTab = null;

function isMac() {
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || "");
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;
  const info = document.getElementById("page-info");
  if (tab && tab.url && !/^(chrome|edge|about):/i.test(tab.url)) {
    let host = "";
    try {
      host = new URL(tab.url).hostname;
    } catch (e) {
      host = tab.url;
    }
    info.textContent = `${tab.title || "无标题"} · ${host}`;
    info.title = tab.url;
  } else {
    info.textContent = "当前页面（未记录来源）";
  }
  const hint = document.getElementById("shot-hint");
  if (hint) hint.textContent = isMac() ? "⌥⇧S" : "Alt+Shift+S";
  input.focus();
}

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 800);
}

async function save() {
  const text = input.value.trim();
  if (!text) {
    window.close();
    return;
  }
  await saveCapture({
    text,
    anchor: null,
    pageTitle: currentTab && currentTab.title ? currentTab.title : "",
    pageUrl: currentTab && currentTab.url ? currentTab.url : ""
  });
  showToast("✓ 已保存");
  setTimeout(() => window.close(), 700);
}

document.getElementById("save").addEventListener("click", save);
document.getElementById("cancel").addEventListener("click", () => window.close());
document.getElementById("shot").addEventListener("click", () => {
  startRegionCapture();
  window.close();
});

init();
