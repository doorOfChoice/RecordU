import {
  deleteCapture as dbDeleteCapture,
  getAllCaptures as dbGetAllCaptures,
  getCapture as dbGetCapture,
  getFavicon as dbGetFavicon,
  getScreenshot as dbGetScreenshot,
  migrateFromStorage,
  putFavicon as dbPutFavicon,
  saveCapture as dbSaveCapture,
  saveScreenshotCapture as dbSaveScreenshotCapture,
  updateCapture as dbUpdateCapture
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

async function notifyCapturesChanged(pageUrl) {
  try {
    const tabs = await chrome.tabs.query({});
    await Promise.all(
      tabs.map(async (tab) => {
        if (!tab.id || !tab.url) return;
        if (!/^https?:/i.test(tab.url) && !/\.pdf(\?|#|$)/i.test(tab.url)) return;
        try {
          await chrome.tabs.sendMessage(tab.id, {
            type: "rc-captures-changed",
            pageUrl: pageUrl || null
          });
        } catch (e) {
          // tab without content script
        }
      })
    );
  } catch (e) {}
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
        files: ["content.js"]
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
    title: "捕获感触",
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
