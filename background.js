import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  mergeSettings,
  normalizeSettings,
  settingsForContent
} from "./shared/settings.js";
import { lookupWordWithLlm } from "./shared/llm.js";
import {
  deleteCapture as dbDeleteCapture,
  deleteWord as dbDeleteWord,
  getAllCaptures as dbGetAllCaptures,
  getAllFavicons as dbGetAllFavicons,
  getAllScreenshots as dbGetAllScreenshots,
  getAllWords as dbGetAllWords,
  getCapture as dbGetCapture,
  getFavicon as dbGetFavicon,
  getScreenshot as dbGetScreenshot,
  getWord as dbGetWord,
  findWordByNormalized as dbFindWordByNormalized,
  importAllData as dbImportAllData,
  migrateFromStorage,
  putFavicon as dbPutFavicon,
  putScreenshot as dbPutScreenshot,
  saveCapture as dbSaveCapture,
  saveScreenshotCapture as dbSaveScreenshotCapture,
  saveWord as dbSaveWord,
  updateCapture as dbUpdateCapture,
  updateWord as dbUpdateWord
} from "./shared/db.js";

const faviconMem = new Map();
let migratePromise = null;

function ensureMigrated() {
  if (!migratePromise) {
    migratePromise = migrateFromStorage().then((res) => {
      if (res && res.migrated && (res.captures || res.favicons)) {
        console.log("[RecordU] migrated to IndexedDB", res);
      }
      return res;
    });
  }
  return migratePromise;
}

function hostFromUrl(url) {
  try {
    let h = new URL(url).hostname;
    if (h.startsWith("www.")) h = h.slice(4);
    return h || null;
  } catch (e) {
    return null;
  }
}

async function broadcastToContentTabs(message) {
  try {
    const tabs = await chrome.tabs.query({});
    await Promise.all(
      tabs.map(async (tab) => {
        if (!tab.id || !tab.url) return;
        if (!/^https?:/i.test(tab.url) && !/\.pdf(\?|#|$)/i.test(tab.url)) return;
        try {
          await chrome.tabs.sendMessage(tab.id, message);
        } catch (e) {
          // tab without content script
        }
      })
    );
  } catch (e) {}
}

async function notifyCapturesChanged(pageUrl) {
  await broadcastToContentTabs({
    type: "rc-captures-changed",
    pageUrl: pageUrl || null
  });
}

async function notifyWordsChanged() {
  await broadcastToContentTabs({ type: "rc-words-changed" });
}

async function notifySettingsChanged(settings) {
  await broadcastToContentTabs({
    type: "rc-settings-changed",
    settings: settingsForContent(settings)
  });
}

async function getSettings() {
  const data = await chrome.storage.local.get(SETTINGS_KEY);
  return normalizeSettings(data[SETTINGS_KEY]);
}

async function saveSettings(patch) {
  const current = await getSettings();
  const next = mergeSettings(current, patch);
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  await notifySettingsChanged(next);
  return next;
}

async function resetSettings() {
  const next = { ...DEFAULT_SETTINGS };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  await notifySettingsChanged(next);
  return next;
}

async function lookupWord(word) {
  const settings = await getSettings();
  return lookupWordWithLlm(word, settings);
}

async function saveWord(payload) {
  await ensureMigrated();
  const record = await dbSaveWord(payload);
  await notifyWordsChanged();
  return record;
}

async function updateWord(id, patch) {
  await ensureMigrated();
  const next = await dbUpdateWord(id, patch);
  if (next) await notifyWordsChanged();
  return next;
}

async function deleteWord(id) {
  await ensureMigrated();
  await dbDeleteWord(id);
  await notifyWordsChanged();
}

async function saveCapture(capture) {
  await ensureMigrated();
  const record = await dbSaveCapture(capture);
  const host = hostFromUrl(record.pageUrl);
  if (host) fetchFaviconDataUrl(host);
  await notifyCapturesChanged(record.pageUrl);
  return record;
}

async function updateCapture(id, patch) {
  await ensureMigrated();
  const next = await dbUpdateCapture(id, patch);
  if (next) await notifyCapturesChanged(next.pageUrl);
  return next;
}

async function deleteCapture(id) {
  await ensureMigrated();
  const existing = await dbGetCapture(id);
  await dbDeleteCapture(id);
  await notifyCapturesChanged(existing && existing.pageUrl);
}

function mimeToExt(mime) {
  const m = String(mime || "").toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  if (m.includes("svg")) return "svg";
  if (m.includes("x-icon") || m.includes("vnd.microsoft.icon") || m.includes("icon")) return "ico";
  return "jpg";
}

function mimeFromDataUrl(dataUrl) {
  if (typeof dataUrl !== "string") return "";
  const m = /^data:([^;,]+)/i.exec(dataUrl);
  return (m && m[1]) || "";
}

function sanitizeHostForFile(host) {
  return String(host || "unknown")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120) || "unknown";
}

async function exportBackupMeta() {
  await ensureMigrated();
  const [captures, words, favicons, screenshots, settings] = await Promise.all([
    dbGetAllCaptures(),
    dbGetAllWords(),
    dbGetAllFavicons(),
    dbGetAllScreenshots(),
    getSettings()
  ]);
  const shotIndex = (screenshots || [])
    .filter((s) => s && s.captureId)
    .map((s) => {
      const mime = s.mime || (s.blob && s.blob.type) || "image/jpeg";
      const ext = mimeToExt(mime);
      return {
        captureId: s.captureId,
        mime,
        w: typeof s.w === "number" ? s.w : 0,
        h: typeof s.h === "number" ? s.h : 0,
        file: `screenshots/${s.captureId}.${ext}`
      };
    });
  const usedFavNames = new Set();
  const favIndex = (favicons || [])
    .filter((f) => f && f.host && f.dataUrl)
    .map((f) => {
      const mime = mimeFromDataUrl(f.dataUrl) || "image/png";
      const ext = mimeToExt(mime);
      let base = sanitizeHostForFile(f.host);
      let file = `favicons/${base}.${ext}`;
      let n = 2;
      while (usedFavNames.has(file)) {
        file = `favicons/${base}_${n}.${ext}`;
        n++;
      }
      usedFavNames.add(file);
      return {
        host: f.host,
        mime,
        updatedAt: f.updatedAt || 0,
        file
      };
    });
  return {
    format: "recordu-backup",
    version: 1,
    exportedAt: Date.now(),
    settings,
    captures: captures || [],
    words: words || [],
    favicons: favIndex,
    screenshots: shotIndex
  };
}

async function getScreenshotBuffer(captureId) {
  await ensureMigrated();
  const row = await dbGetScreenshot(captureId);
  if (!row || !row.blob) return null;
  // Prefer base64 over ArrayBuffer — some Chromium forks drop binary in messages.
  const dataUrl = await blobToDataUrl(row.blob);
  const comma = dataUrl.indexOf(",");
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : "";
  return {
    captureId: row.captureId,
    mime: row.mime || row.blob.type || "image/jpeg",
    w: typeof row.w === "number" ? row.w : 0,
    h: typeof row.h === "number" ? row.h : 0,
    base64
  };
}

async function getFaviconBuffer(host) {
  await ensureMigrated();
  if (!host) return null;
  const dataUrl = await dbGetFavicon(host);
  if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) return null;
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  const meta = dataUrl.slice(0, comma);
  const base64 = dataUrl.slice(comma + 1);
  if (!base64) return null;
  const mimeMatch = /^data:([^;,]+)/i.exec(meta);
  return {
    host,
    mime: (mimeMatch && mimeMatch[1]) || "image/png",
    base64
  };
}

async function importBackupBegin(payload) {
  await ensureMigrated();
  if (!payload || payload.format !== "recordu-backup") {
    throw new Error("invalid backup format");
  }
  const settings = normalizeSettings(payload.settings);
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  // Legacy backups embed favicon dataUrl in JSON; file-based favicons are imported later.
  const legacyFavs = (Array.isArray(payload.favicons) ? payload.favicons : []).filter(
    (f) => f && f.host && typeof f.dataUrl === "string" && f.dataUrl.startsWith("data:")
  );
  const counts = await dbImportAllData({
    captures: payload.captures,
    words: payload.words,
    favicons: legacyFavs,
    screenshots: []
  });
  faviconMem.clear();
  await notifySettingsChanged(settings);
  await notifyCapturesChanged(null);
  await notifyWordsChanged();
  return { ...counts, settings };
}

async function importScreenshotRow(msg) {
  await ensureMigrated();
  const captureId = msg.captureId;
  if (!captureId) throw new Error("captureId required");
  let blob = null;
  const mime = typeof msg.mime === "string" && msg.mime ? msg.mime : "image/jpeg";
  // Prefer base64 — ArrayBuffer is dropped by some Chromium forks (e.g. Quark).
  if (typeof msg.base64 === "string" && msg.base64.length > 0) {
    blob = base64ToBlob(msg.base64, mime);
  } else if (msg.buffer && typeof msg.buffer.byteLength === "number" && msg.buffer.byteLength > 0) {
    blob = new Blob([msg.buffer], { type: mime });
  } else if (typeof msg.dataUrl === "string" && msg.dataUrl.startsWith("data:image/")) {
    blob = dataUrlToBlob(msg.dataUrl);
  } else {
    throw new Error("missing screenshot payload");
  }
  if (!blob || blob.size < 32) {
    throw new Error("empty screenshot payload");
  }
  await dbPutScreenshot({
    captureId,
    blob,
    mime: blob.type || mime,
    w: typeof msg.w === "number" ? msg.w : 0,
    h: typeof msg.h === "number" ? msg.h : 0
  });
  return { captureId };
}

async function importFaviconRow(msg) {
  await ensureMigrated();
  const host = typeof msg.host === "string" ? msg.host.trim() : "";
  if (!host) throw new Error("host required");
  let dataUrl = null;
  if (typeof msg.dataUrl === "string" && msg.dataUrl.startsWith("data:")) {
    dataUrl = msg.dataUrl;
  } else if (typeof msg.base64 === "string" && msg.base64.length > 0) {
    const mime = typeof msg.mime === "string" && msg.mime ? msg.mime : "image/png";
    dataUrl = `data:${mime};base64,${msg.base64}`;
  } else {
    throw new Error("missing favicon payload");
  }
  await dbPutFavicon(host, dataUrl);
  faviconMem.set(host, dataUrl);
  return { host };
}

async function blobToDataUrl(blob) {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  const mime = blob.type || "image/jpeg";
  return `data:${mime};base64,${btoa(binary)}`;
}

function base64ToBlob(base64, mime) {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime || "image/jpeg" });
}

/** SW cannot reliably fetch(data:) URLs; parse base64 manually. */
function dataUrlToBlob(dataUrl) {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("invalid dataUrl");
  const meta = dataUrl.slice(0, comma);
  const payload = dataUrl.slice(comma + 1);
  const mimeMatch = /^data:([^;,]+)/i.exec(meta);
  const mime = (mimeMatch && mimeMatch[1]) || "image/jpeg";
  if (!/;base64/i.test(meta)) {
    throw new Error("expected base64 dataUrl");
  }
  return base64ToBlob(payload, mime);
}

async function saveScreenshotCapture(msg) {
  await ensureMigrated();
  let blob = null;
  let mime = typeof msg.mime === "string" && msg.mime ? msg.mime : "image/jpeg";

  // Prefer base64 string — ArrayBuffer is dropped by some Chromium forks (e.g. Quark).
  if (typeof msg.base64 === "string" && msg.base64.length > 0) {
    blob = base64ToBlob(msg.base64, mime);
  } else if (msg.buffer && typeof msg.buffer.byteLength === "number" && msg.buffer.byteLength > 0) {
    blob = new Blob([msg.buffer], { type: mime });
  } else if (typeof msg.dataUrl === "string" && msg.dataUrl.startsWith("data:image/")) {
    blob = dataUrlToBlob(msg.dataUrl);
    mime = blob.type || mime;
  } else {
    throw new Error("missing screenshot payload");
  }

  if (!blob || blob.size < 32) {
    throw new Error("empty screenshot blob");
  }

  const record = await dbSaveScreenshotCapture(
    {
      text: msg.text,
      pageTitle: msg.pageTitle,
      pageUrl: msg.pageUrl,
      createdAt: msg.createdAt
    },
    {
      blob,
      mime,
      w: typeof msg.w === "number" ? msg.w : 0,
      h: typeof msg.h === "number" ? msg.h : 0
    }
  );
  const host = hostFromUrl(record.pageUrl);
  if (host) fetchFaviconDataUrl(host);
  try {
    await notifyCapturesChanged(record.pageUrl);
  } catch (e) {}
  return record;
}

async function startRegionCaptureOnTab(tabId) {
  if (!tabId) return { ok: false, error: "no-tab" };
  try {
    await chrome.tabs.sendMessage(tabId, { type: "rc-start-region-capture" });
    return { ok: true };
  } catch (e) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["shared/capture-theme.js", "content.js"]
      });
      await chrome.tabs.sendMessage(tabId, { type: "rc-start-region-capture" });
      return { ok: true };
    } catch (e2) {
      return { ok: false, error: "inject-failed" };
    }
  }
}

async function startRegionCaptureActive() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return { ok: false, error: "no-tab" };
  if (tab.url && /^(chrome|edge|about|chrome-extension):/i.test(tab.url)) {
    return { ok: false, error: "restricted-url" };
  }
  return startRegionCaptureOnTab(tab.id);
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "rc-capture-selection",
    title: "记下感触",
    contexts: ["selection"]
  });
  ensureMigrated();
});

ensureMigrated();

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "rc-capture-selection") return;
  if (!tab || !tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: "rc-show-capture",
      exact: info.selectionText || ""
    });
  } catch (e) {
    chrome.action.openPopup();
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "capture") {
    chrome.action.openPopup();
    return;
  }
  if (command === "capture-screenshot") {
    await startRegionCaptureActive();
  }
});

async function bufferToDataUrl(buf, mime) {
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return `data:${mime || "image/x-icon"};base64,${btoa(binary)}`;
}

async function fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "force-cache",
      signal: ctrl.signal,
      credentials: "omit"
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFaviconDataUrl(host) {
  if (!host || host === "__none__") return null;
  if (faviconMem.has(host)) return faviconMem.get(host);

  await ensureMigrated();
  const cached = await dbGetFavicon(host);
  if (cached) {
    faviconMem.set(host, cached);
    return cached;
  }

  const urls = [
    `https://icons.duckduckgo.com/ip3/${host}.ico`,
    `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent("https://" + host)}`,
    `https://favicon.yandex.net/favicon/${host}`,
    `https://icon.horse/icon/${host}`,
    `https://${host}/favicon.ico`,
    `https://${host}/apple-touch-icon.png`
  ];

  for (const url of urls) {
    try {
      const res = await fetchWithTimeout(url, 5000);
      if (!res || !res.ok) continue;
      const buf = await res.arrayBuffer();
      if (!buf || buf.byteLength < 32) continue;
      const head = String.fromCharCode.apply(null, new Uint8Array(buf.slice(0, 64))).toLowerCase();
      if (head.includes("<!doctype") || head.includes("<html")) continue;
      const mime = (res.headers.get("content-type") || "").split(";")[0].trim();
      if (mime.startsWith("text/")) continue;
      const dataUrl = await bufferToDataUrl(buf, mime.startsWith("image/") ? mime : "image/x-icon");
      faviconMem.set(host, dataUrl);
      await dbPutFavicon(host, dataUrl);
      return dataUrl;
    } catch (e) {
      // try next
    }
  }

  faviconMem.set(host, null);
  return null;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;

  if (msg.type === "rc-save") {
    saveCapture({
      text: msg.text,
      anchor: msg.anchor,
      pageTitle: msg.pageTitle,
      pageUrl: msg.pageUrl,
      type: msg.captureType === "screenshot" ? "screenshot" : "text"
    })
      .then((record) => sendResponse({ ok: true, id: record.id }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  if (msg.type === "rc-save-screenshot") {
    saveScreenshotCapture(msg)
      .then((record) => sendResponse({ ok: true, id: record.id }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  if (msg.type === "rc-update") {
    updateCapture(msg.id, msg.patch)
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  if (msg.type === "rc-delete") {
    deleteCapture(msg.id)
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  if (msg.type === "rc-get-all") {
    ensureMigrated()
      .then(() => dbGetAllCaptures())
      .then((all) => sendResponse({ ok: true, captures: all }))
      .catch((e) => sendResponse({ ok: false, captures: [], error: String(e) }));
    return true;
  }

  if (msg.type === "rc-get-page") {
    ensureMigrated()
      .then(() => dbGetAllCaptures())
      .then((all) => sendResponse({ ok: true, captures: all || [] }))
      .catch((e) => sendResponse({ ok: false, captures: [], error: String(e) }));
    return true;
  }

  if (msg.type === "rc-get-one") {
    ensureMigrated()
      .then(() => dbGetCapture(msg.id))
      .then((capture) => sendResponse({ ok: true, capture }))
      .catch((e) => sendResponse({ ok: false, capture: null, error: String(e) }));
    return true;
  }

  if (msg.type === "rc-save-word") {
    saveWord({
      word: msg.word,
      note: msg.note,
      phonetic: msg.phonetic,
      translation: msg.translation,
      matchMode: msg.matchMode,
      pageTitle: msg.pageTitle,
      pageUrl: msg.pageUrl
    })
      .then((record) => sendResponse({ ok: true, id: record.id, word: record }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  if (msg.type === "rc-update-word") {
    updateWord(msg.id, msg.patch)
      .then((word) => sendResponse({ ok: true, word }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  if (msg.type === "rc-delete-word") {
    deleteWord(msg.id)
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  if (msg.type === "rc-get-all-words") {
    ensureMigrated()
      .then(() => dbGetAllWords())
      .then((all) => sendResponse({ ok: true, words: all || [] }))
      .catch((e) => sendResponse({ ok: false, words: [], error: String(e) }));
    return true;
  }

  if (msg.type === "rc-get-word") {
    ensureMigrated()
      .then(() => dbGetWord(msg.id))
      .then((word) => sendResponse({ ok: true, word }))
      .catch((e) => sendResponse({ ok: false, word: null, error: String(e) }));
    return true;
  }

  if (msg.type === "rc-find-word") {
    ensureMigrated()
      .then(() => dbFindWordByNormalized(msg.word))
      .then((word) => sendResponse({ ok: true, word: word || null }))
      .catch((e) => sendResponse({ ok: false, word: null, error: String(e) }));
    return true;
  }

  if (msg.type === "rc-get-settings") {
    getSettings()
      .then((settings) => {
        const keepKey = msg.forContent === false || msg.source === "review";
        sendResponse({
          ok: true,
          settings: keepKey ? settings : settingsForContent(settings)
        });
      })
      .catch((e) =>
        sendResponse({
          ok: false,
          settings: settingsForContent(DEFAULT_SETTINGS),
          error: String(e)
        })
      );
    return true;
  }

  if (msg.type === "rc-lookup-word") {
    lookupWord(msg.word)
      .then((result) =>
        sendResponse({
          ok: true,
          phonetic: result.phonetic,
          translation: result.translation
        })
      )
      .catch((e) =>
        sendResponse({
          ok: false,
          error: String(e && e.message ? e.message : e),
          code: (e && e.code) || "error"
        })
      );
    return true;
  }

  if (msg.type === "rc-save-settings") {
    saveSettings(msg.patch || msg.settings || {})
      .then((settings) => sendResponse({ ok: true, settings }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  if (msg.type === "rc-reset-settings") {
    resetSettings()
      .then((settings) => sendResponse({ ok: true, settings }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  if (msg.type === "rc-get-screenshot") {
    ensureMigrated()
      .then(() => dbGetScreenshot(msg.id))
      .then(async (row) => {
        if (!row || !row.blob) {
          sendResponse({ ok: true, dataUrl: null });
          return;
        }
        const dataUrl = await blobToDataUrl(row.blob);
        sendResponse({ ok: true, dataUrl, w: row.w, h: row.h });
      })
      .catch((e) => sendResponse({ ok: false, dataUrl: null, error: String(e) }));
    return true;
  }

  if (msg.type === "rc-export-backup-meta") {
    exportBackupMeta()
      .then((meta) => sendResponse({ ok: true, meta }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  if (msg.type === "rc-get-screenshot-buffer") {
    getScreenshotBuffer(msg.captureId || msg.id)
      .then((row) => {
        if (!row) {
          sendResponse({ ok: true, shot: null });
          return;
        }
        sendResponse({ ok: true, shot: row });
      })
      .catch((e) => sendResponse({ ok: false, shot: null, error: String(e) }));
    return true;
  }

  if (msg.type === "rc-get-favicon-buffer") {
    getFaviconBuffer(msg.host)
      .then((row) => sendResponse({ ok: true, fav: row }))
      .catch((e) => sendResponse({ ok: false, fav: null, error: String(e) }));
    return true;
  }

  if (msg.type === "rc-import-backup-begin") {
    importBackupBegin(msg.payload || msg.meta || {})
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  if (msg.type === "rc-import-screenshot") {
    importScreenshotRow(msg)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  if (msg.type === "rc-import-favicon") {
    importFaviconRow(msg)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  if (msg.type === "rc-import-backup-finish") {
    Promise.all([notifyCapturesChanged(null), notifyWordsChanged()])
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  if (msg.type === "rc-capture-visible") {
    const tabId = sender.tab && sender.tab.id;
    const windowId = sender.tab && sender.tab.windowId;
    if (!tabId) {
      sendResponse({ ok: false, error: "no-sender-tab" });
      return true;
    }
    chrome.tabs
      .captureVisibleTab(windowId, { format: "png" })
      .then((dataUrl) => sendResponse({ ok: true, dataUrl }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  if (msg.type === "rc-start-region-capture") {
    // Allow a tick for popup to close so capture isn't blocked.
    setTimeout(() => {
      startRegionCaptureActive()
        .then((res) => sendResponse(res))
        .catch((e) => sendResponse({ ok: false, error: String(e) }));
    }, 80);
    return true;
  }

  if (msg.type === "rc-favicon") {
    fetchFaviconDataUrl(msg.host)
      .then((dataUrl) => sendResponse({ ok: true, dataUrl }))
      .catch(() => sendResponse({ ok: true, dataUrl: null }));
    return true;
  }
});
