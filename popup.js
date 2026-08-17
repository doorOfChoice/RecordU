import { saveCapture, startRegionCapture, getSettings, saveSettings, lookupWord } from "./shared/api.js";
import {
  isHostInHighlightBlacklist,
  isPageInHighlightBlacklist,
  pageKeyFromUrl
} from "./shared/settings.js";
import { speakWord } from "./shared/tts.js";

const LOOKUP_MAX = 500;
const SPEAK_MAX = 40;

const input = document.getElementById("input");
const toast = document.getElementById("toast");
const blockRow = document.getElementById("hl-block-row");
const btnPage = document.getElementById("hl-block-page");
const btnHost = document.getElementById("hl-block-host");
const lookupInput = document.getElementById("lookup-input");
const lookupGo = document.getElementById("lookup-go");
const lookupStatus = document.getElementById("lookup-status");
const lookupError = document.getElementById("lookup-error");
const lookupErrorText = document.getElementById("lookup-error-text");
const lookupRetry = document.getElementById("lookup-retry");
const lookupResult = document.getElementById("lookup-result");
const lookupPhoneticRow = document.getElementById("lookup-phonetic-row");
const lookupPhonetic = document.getElementById("lookup-phonetic");
const lookupTranslation = document.getElementById("lookup-translation");
const lookupTranslationLabel = document.getElementById("lookup-translation-label");
const lookupSpeak = document.getElementById("lookup-speak");
const lookupSpeakAlt = document.getElementById("lookup-speak-alt");
const panelNote = document.getElementById("panel-note");
const panelLookup = document.getElementById("panel-lookup");
const modeNote = document.getElementById("mode-note");
const modeLookup = document.getElementById("mode-lookup");

let currentTab = null;
let currentSettings = null;
let pageKey = null;
let hostKey = null;
let tabUsable = false;
let savingBlock = false;
let lookupBusy = false;
let lookupGen = 0;
let lastLookupTerm = "";
let lastSpeakTerm = "";

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
  setPopupMode("lookup");
}

function setPopupMode(mode) {
  const lookup = mode === "lookup";
  panelNote.hidden = lookup;
  panelLookup.hidden = !lookup;
  modeNote.classList.toggle("is-on", !lookup);
  modeLookup.classList.toggle("is-on", lookup);
  modeNote.setAttribute("aria-selected", lookup ? "false" : "true");
  modeLookup.setAttribute("aria-selected", lookup ? "true" : "false");
  requestAnimationFrame(() => {
    if (lookup) lookupInput.focus();
    else input.focus();
  });
}

function canSpeakTerm(term) {
  const t = String(term || "").trim();
  return !!t && !/[\r\n]/.test(t) && t.length <= SPEAK_MAX;
}

function inputLooksChinese(term) {
  return /[\u4e00-\u9fff]/.test(String(term || ""));
}

function lookupErrorMessage(res) {
  const code = res && res.code;
  if (code === "need_key") return "请到设置 → 大模型 填写 API Key";
  if (code === "auth") return "API Key 无效或无权限";
  if (code === "network") return "网络错误，请重试";
  return (res && res.error) || "查询失败，请重试";
}

function showLookupLoading() {
  lookupError.hidden = true;
  lookupResult.hidden = true;
  lookupStatus.hidden = false;
  lookupStatus.textContent = "正在查询…";
}

function showLookupError(msg) {
  lookupStatus.hidden = true;
  lookupResult.hidden = true;
  lookupError.hidden = false;
  lookupErrorText.textContent = msg;
}

function showLookupResult(phonetic, translation, term) {
  lookupStatus.hidden = true;
  lookupError.hidden = true;
  lookupResult.hidden = false;
  const ph = String(phonetic || "").trim();
  const rendered = String(translation || "").trim();
  const zhIn = inputLooksChinese(term);
  lookupPhonetic.textContent = ph;
  lookupTranslation.textContent = rendered || (zhIn ? "（无英文）" : "（无翻译）");
  if (lookupTranslationLabel) lookupTranslationLabel.textContent = zhIn ? "英文" : "翻译";
  lastSpeakTerm = zhIn ? rendered : term;
  const speak = canSpeakTerm(lastSpeakTerm);
  lookupPhoneticRow.hidden = !ph;
  lookupSpeak.hidden = !ph || !speak;
  lookupSpeakAlt.hidden = !!ph || !speak;
}

async function runLookup() {
  if (lookupBusy) return;
  const term = String(lookupInput.value || "").replace(/\s+/g, " ").trim();
  if (!term) {
    showLookupError("请输入单词或句子");
    lookupInput.focus();
    return;
  }
  if (term.length > LOOKUP_MAX) {
    showLookupError(`请控制在 ${LOOKUP_MAX} 字以内`);
    return;
  }
  lastLookupTerm = term;
  const gen = ++lookupGen;
  lookupBusy = true;
  lookupGo.disabled = true;
  showLookupLoading();
  let res;
  try {
    res = await lookupWord(term);
  } catch (e) {
    if (gen !== lookupGen) return;
    showLookupError("查询失败，请重试");
    lookupBusy = false;
    lookupGo.disabled = false;
    return;
  }
  if (gen !== lookupGen) return;
  lookupBusy = false;
  lookupGo.disabled = false;
  if (chrome.runtime.lastError || !res || !res.ok) {
    showLookupError(lookupErrorMessage(res));
    return;
  }
  showLookupResult(res.phonetic, res.translation, term);
}

function speakLookup() {
  if (canSpeakTerm(lastSpeakTerm)) speakWord(lastSpeakTerm);
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
if (modeNote) modeNote.addEventListener("click", () => setPopupMode("note"));
if (modeLookup) modeLookup.addEventListener("click", () => setPopupMode("lookup"));

if (lookupGo) lookupGo.addEventListener("click", runLookup);
if (lookupRetry) lookupRetry.addEventListener("click", runLookup);
if (lookupSpeak) lookupSpeak.addEventListener("click", speakLookup);
if (lookupSpeakAlt) lookupSpeakAlt.addEventListener("click", speakLookup);
if (lookupInput) {
  lookupInput.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      runLookup();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      runLookup();
    }
  });
}

init();
