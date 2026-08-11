import { saveCapture, startRegionCapture, getSettings, saveSettings } from "./shared/api.js";
import {
  isHostInHighlightBlacklist,
  isPageInHighlightBlacklist,
  pageKeyFromUrl
} from "./shared/settings.js";

const input = document.getElementById("input");
const toast = document.getElementById("toast");
const blockRow = document.getElementById("hl-block-row");
const btnPage = document.getElementById("hl-block-page");
const btnHost = document.getElementById("hl-block-host");

let currentTab = null;
let currentSettings = null;
let pageKey = null;
let hostKey = null;
let tabUsable = false;
let savingBlock = false;

function isMac() {
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || "");
}

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 800);
}

function normalizeHostEntry(host) {
  return String(host || "")
    .replace(/:\d+$/, "")
    .replace(/\.+$/, "")
    .toLowerCase();
}

function hostBlocked() {
  if (!hostKey || !currentSettings) return false;
  return isHostInHighlightBlacklist(hostKey, currentSettings.highlightHostBlacklist || []);
}

function pageBlocked() {
  if (!pageKey || !currentSettings) return false;
  return isPageInHighlightBlacklist(pageKey, currentSettings.highlightPageBlacklist || []);
}

/** Prefer bare domain without www. when writing to the list. */
function hostEntryToStore() {
  return normalizeHostEntry(hostKey).replace(/^www\./, "");
}

function refreshBlockUi() {
  if (!blockRow || !btnPage || !btnHost) return;

  if (!tabUsable) {
    blockRow.classList.add("is-disabled");
    blockRow.title = "当前页面无法设置高亮黑名单";
    btnPage.disabled = true;
    btnHost.disabled = true;
    btnPage.setAttribute("aria-pressed", "false");
    btnHost.setAttribute("aria-pressed", "false");
    btnPage.classList.remove("is-on");
    btnHost.classList.remove("is-on");
    btnPage.title = "";
    return;
  }

  blockRow.classList.remove("is-disabled");
  blockRow.title = "";
  btnHost.disabled = false;

  const onHost = hostBlocked();
  const onPage = onHost || pageBlocked();

  btnHost.setAttribute("aria-pressed", onHost ? "true" : "false");
  btnHost.classList.toggle("is-on", onHost);

  btnPage.setAttribute("aria-pressed", onPage ? "true" : "false");
  btnPage.classList.toggle("is-on", onPage);
  btnPage.disabled = onHost;
  btnPage.title = onHost ? "本域已暂停高亮，本页无需单独设置" : "";
}

function removeMatchingHosts(list, hostname) {
  const host = normalizeHostEntry(hostname);
  return (list || []).filter((h) => {
    const e = normalizeHostEntry(h);
    if (!e) return false;
    // Drop entries that currently block this host
    if (host === e || host.endsWith(`.${e}`)) return false;
    return true;
  });
}

async function toggleHostBlock() {
  if (!tabUsable || !hostKey || savingBlock) return;
  savingBlock = true;
  try {
    const list = currentSettings.highlightHostBlacklist || [];
    const on = hostBlocked();
    const nextList = on
      ? removeMatchingHosts(list, hostKey)
      : [...removeMatchingHosts(list, hostKey), hostEntryToStore()];
    const res = await saveSettings({ highlightHostBlacklist: nextList });
    if (!res || !res.ok || !res.settings) {
      showToast("保存失败");
      return;
    }
    currentSettings = res.settings;
    refreshBlockUi();
    showToast(on ? "✓ 已恢复本域高亮" : "✓ 已暂停本域高亮");
  } finally {
    savingBlock = false;
  }
}

async function togglePageBlock() {
  if (!tabUsable || !pageKey || savingBlock || hostBlocked()) return;
  savingBlock = true;
  try {
    const list = [...(currentSettings.highlightPageBlacklist || [])];
    const on = pageBlocked();
    const nextList = on ? list.filter((k) => k !== pageKey) : list.includes(pageKey) ? list : [...list, pageKey];
    const res = await saveSettings({ highlightPageBlacklist: nextList });
    if (!res || !res.ok || !res.settings) {
      showToast("保存失败");
      return;
    }
    currentSettings = res.settings;
    refreshBlockUi();
    showToast(on ? "✓ 已恢复本页高亮" : "✓ 已暂停本页高亮");
  } finally {
    savingBlock = false;
  }
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;
  const info = document.getElementById("page-info");

  if (tab && tab.url && !/^(chrome|edge|about|chrome-extension|devtools):/i.test(tab.url)) {
    let host = "";
    try {
      const u = new URL(tab.url);
      host = u.hostname;
      hostKey = normalizeHostEntry(u.hostname);
      pageKey = pageKeyFromUrl(tab.url);
      tabUsable = (u.protocol === "http:" || u.protocol === "https:") && !!hostKey && !!pageKey;
    } catch (e) {
      host = tab.url;
      tabUsable = false;
    }
    info.textContent = `${tab.title || "无标题"} · ${host}`;
    info.title = tab.url;
  } else {
    info.textContent = "当前页面（未记录来源）";
    tabUsable = false;
  }

  try {
    currentSettings = (await getSettings()) || {
      highlightHostBlacklist: [],
      highlightPageBlacklist: []
    };
  } catch (e) {
    currentSettings = { highlightHostBlacklist: [], highlightPageBlacklist: [] };
  }
  refreshBlockUi();

  const hint = document.getElementById("shot-hint");
  if (hint) hint.textContent = isMac() ? "⌥⇧S" : "Alt+Shift+S";
  input.focus();
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

if (btnPage) btnPage.addEventListener("click", togglePageBlock);
if (btnHost) btnHost.addEventListener("click", toggleHostBlock);

init();
