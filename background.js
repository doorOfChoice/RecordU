const STORAGE_KEY = "rc_captures";

async function getAllCaptures() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return data[STORAGE_KEY] || [];
}

function normalizeAnchor(anchor) {
  if (!anchor || typeof anchor !== "object") return null;
  const exact = typeof anchor.exact === "string" ? anchor.exact : "";
  if (!exact) return null;
  return {
    exact,
    prefix: typeof anchor.prefix === "string" ? anchor.prefix : "",
    suffix: typeof anchor.suffix === "string" ? anchor.suffix : "",
    start: typeof anchor.start === "number" ? anchor.start : -1,
    end: typeof anchor.end === "number" ? anchor.end : -1
  };
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

async function saveCapture(capture) {
  const all = await getAllCaptures();
  const record = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    text: capture.text || "",
    anchor: normalizeAnchor(capture.anchor),
    pageTitle: capture.pageTitle || "",
    pageUrl: capture.pageUrl || "",
    createdAt: capture.createdAt || Date.now(),
    status: "kept"
  };
  all.push(record);
  await chrome.storage.local.set({ [STORAGE_KEY]: all });
  const host = hostFromUrl(record.pageUrl);
  if (host) fetchFaviconDataUrl(host); // warm cache for review page
  return record;
}

async function updateCapture(id, patch) {
  const all = await getAllCaptures();
  const idx = all.findIndex((c) => c.id === id);
  if (idx === -1) return;
  const next = { ...all[idx], ...patch };
  if ("anchor" in patch) next.anchor = normalizeAnchor(patch.anchor);
  all[idx] = next;
  await chrome.storage.local.set({ [STORAGE_KEY]: all });
}

async function deleteCapture(id) {
  const all = await getAllCaptures();
  await chrome.storage.local.set({
    [STORAGE_KEY]: all.filter((c) => c.id !== id)
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "rc-capture-selection",
    title: "捕获感触",
    contexts: ["selection"]
  });
});

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

chrome.commands.onCommand.addListener((command) => {
  if (command === "capture") {
    chrome.action.openPopup();
  }
});

const faviconCache = new Map();
const FAVICON_STORAGE = "rc_favicon_cache";

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

async function loadFaviconDiskCache() {
  try {
    const data = await chrome.storage.local.get(FAVICON_STORAGE);
    const map = data[FAVICON_STORAGE] || {};
    for (const [host, dataUrl] of Object.entries(map)) {
      if (dataUrl) faviconCache.set(host, dataUrl);
    }
  } catch (e) {}
}

async function saveFaviconDiskCache(host, dataUrl) {
  try {
    const data = await chrome.storage.local.get(FAVICON_STORAGE);
    const map = data[FAVICON_STORAGE] || {};
    map[host] = dataUrl;
    // Keep cache bounded.
    const keys = Object.keys(map);
    if (keys.length > 200) {
      for (const k of keys.slice(0, keys.length - 200)) delete map[k];
    }
    await chrome.storage.local.set({ [FAVICON_STORAGE]: map });
  } catch (e) {}
}

loadFaviconDiskCache();

async function fetchFaviconDataUrl(host) {
  if (!host || host === "__none__") return null;
  if (faviconCache.has(host)) return faviconCache.get(host);

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
      // Skip obvious HTML error pages.
      const head = String.fromCharCode.apply(null, new Uint8Array(buf.slice(0, 64))).toLowerCase();
      if (head.includes("<!doctype") || head.includes("<html")) continue;
      const mime = (res.headers.get("content-type") || "").split(";")[0].trim();
      if (mime.startsWith("text/")) continue;
      const dataUrl = await bufferToDataUrl(buf, mime.startsWith("image/") ? mime : "image/x-icon");
      faviconCache.set(host, dataUrl);
      saveFaviconDiskCache(host, dataUrl);
      return dataUrl;
    } catch (e) {
      // try next source
    }
  }

  faviconCache.set(host, null);
  return null;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "rc-save") {
    const capture = {
      text: msg.text,
      anchor: msg.anchor,
      pageTitle: msg.pageTitle,
      pageUrl: msg.pageUrl
    };
    saveCapture(capture).then((record) => sendResponse({ ok: true, id: record.id }));
    return true;
  }
  if (msg && msg.type === "rc-update") {
    updateCapture(msg.id, msg.patch).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg && msg.type === "rc-delete") {
    deleteCapture(msg.id).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg && msg.type === "rc-get-all") {
    getAllCaptures().then((all) => sendResponse({ ok: true, captures: all }));
    return true;
  }
  if (msg && msg.type === "rc-favicon") {
    fetchFaviconDataUrl(msg.host).then((dataUrl) => sendResponse({ ok: true, dataUrl }));
    return true;
  }
});
