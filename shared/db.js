const DB_NAME = "recordu";
const DB_VERSION = 2;
const MIGRATE_FLAG = "rc_migrated_v1";
const OLD_CAPTURES_KEY = "rc_captures";
const OLD_FAVICON_KEY = "rc_favicon_cache";

let dbPromise = null;

function ensureWordsStore(db) {
  if (db.objectStoreNames.contains("words")) return;
  const store = db.createObjectStore("words", { keyPath: "id" });
  store.createIndex("by_word", "wordKey", { unique: true });
  store.createIndex("by_createdAt", "createdAt", { unique: false });
}

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error || new Error("IndexedDB open failed"));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("captures")) {
        const store = db.createObjectStore("captures", { keyPath: "id" });
        store.createIndex("by_pageUrl", "pageUrl", { unique: false });
        store.createIndex("by_createdAt", "createdAt", { unique: false });
      }
      if (!db.objectStoreNames.contains("screenshots")) {
        db.createObjectStore("screenshots", { keyPath: "captureId" });
      }
      if (!db.objectStoreNames.contains("favicons")) {
        db.createObjectStore("favicons", { keyPath: "host" });
      }
      ensureWordsStore(db);
    };
    req.onsuccess = () => resolve(req.result);
  });
  return dbPromise;
}

/** Normalize word for dedupe: trim + lowercase Latin letters only. */
export function normalizeWordKey(word) {
  const trimmed = String(word || "").replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  return trimmed.replace(/[A-Za-z]+/g, (m) => m.toLowerCase());
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("IndexedDB aborted"));
  });
}

export function normalizeAnchor(anchor) {
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

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function normalizeCapture(input) {
  const type = input.type === "screenshot" ? "screenshot" : "text";
  return {
    id: input.id || newId(),
    type,
    text: input.text || "",
    anchor: normalizeAnchor(input.anchor),
    pageTitle: input.pageTitle || "",
    pageUrl: input.pageUrl || "",
    createdAt: input.createdAt || Date.now(),
    status: input.status || "kept"
  };
}

export async function getAllCaptures() {
  const db = await openDB();
  const tx = db.transaction("captures", "readonly");
  const all = await reqToPromise(tx.objectStore("captures").getAll());
  await txDone(tx);
  return all || [];
}

export async function getCapture(id) {
  if (!id) return null;
  const db = await openDB();
  const tx = db.transaction("captures", "readonly");
  const row = await reqToPromise(tx.objectStore("captures").get(id));
  await txDone(tx);
  return row || null;
}

export async function getCapturesByPageUrl(pageUrl) {
  if (!pageUrl) return [];
  const db = await openDB();
  const tx = db.transaction("captures", "readonly");
  const all = await reqToPromise(tx.objectStore("captures").getAll());
  await txDone(tx);
  return (all || []).filter((c) => c.pageUrl === pageUrl);
}

export async function saveCapture(capture) {
  const record = normalizeCapture(capture);
  const db = await openDB();
  const tx = db.transaction("captures", "readwrite");
  tx.objectStore("captures").put(record);
  await txDone(tx);
  return record;
}

export async function updateCapture(id, patch) {
  const existing = await getCapture(id);
  if (!existing) return null;
  const next = { ...existing, ...patch, id: existing.id };
  if ("anchor" in patch) next.anchor = normalizeAnchor(patch.anchor);
  if ("type" in patch) next.type = patch.type === "screenshot" ? "screenshot" : "text";
  const db = await openDB();
  const tx = db.transaction("captures", "readwrite");
  tx.objectStore("captures").put(next);
  await txDone(tx);
  return next;
}

export async function deleteCapture(id) {
  const db = await openDB();
  const tx = db.transaction(["captures", "screenshots"], "readwrite");
  tx.objectStore("captures").delete(id);
  tx.objectStore("screenshots").delete(id);
  await txDone(tx);
}

export async function putScreenshot({ captureId, blob, mime, w, h }) {
  if (!captureId || !blob) throw new Error("screenshot requires captureId and blob");
  const db = await openDB();
  const tx = db.transaction("screenshots", "readwrite");
  tx.objectStore("screenshots").put({
    captureId,
    blob,
    mime: mime || blob.type || "image/jpeg",
    w: typeof w === "number" ? w : 0,
    h: typeof h === "number" ? h : 0
  });
  await txDone(tx);
}

export async function getScreenshot(captureId) {
  if (!captureId) return null;
  const db = await openDB();
  const tx = db.transaction("screenshots", "readonly");
  const row = await reqToPromise(tx.objectStore("screenshots").get(captureId));
  await txDone(tx);
  return row || null;
}

export async function saveScreenshotCapture(capture, shot) {
  const record = normalizeCapture({ ...capture, type: "screenshot", anchor: null });
  const db = await openDB();
  const tx = db.transaction(["captures", "screenshots"], "readwrite");
  tx.objectStore("captures").put(record);
  tx.objectStore("screenshots").put({
    captureId: record.id,
    blob: shot.blob,
    mime: shot.mime || shot.blob.type || "image/jpeg",
    w: typeof shot.w === "number" ? shot.w : 0,
    h: typeof shot.h === "number" ? shot.h : 0
  });
  await txDone(tx);
  return record;
}

export async function putFavicon(host, dataUrl) {
  if (!host || !dataUrl) return;
  const db = await openDB();
  const tx = db.transaction("favicons", "readwrite");
  tx.objectStore("favicons").put({ host, dataUrl, updatedAt: Date.now() });
  await txDone(tx);

  // Bound cache size (~200).
  const all = await getAllFavicons();
  if (all.length > 200) {
    const drop = all
      .slice()
      .sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0))
      .slice(0, all.length - 200);
    const tx2 = db.transaction("favicons", "readwrite");
    const store = tx2.objectStore("favicons");
    for (const row of drop) store.delete(row.host);
    await txDone(tx2);
  }
}

export async function getFavicon(host) {
  if (!host) return null;
  const db = await openDB();
  const tx = db.transaction("favicons", "readonly");
  const row = await reqToPromise(tx.objectStore("favicons").get(host));
  await txDone(tx);
  return row ? row.dataUrl : null;
}

export async function getAllFavicons() {
  const db = await openDB();
  const tx = db.transaction("favicons", "readonly");
  const all = await reqToPromise(tx.objectStore("favicons").getAll());
  await txDone(tx);
  return all || [];
}

function normalizeWordRecord(input) {
  const word = String(input.word || "").replace(/\s+/g, " ").trim();
  const wordKey = input.wordKey || normalizeWordKey(word);
  return {
    id: input.id || newId(),
    word,
    wordKey,
    note: typeof input.note === "string" ? input.note : "",
    pageTitle: input.pageTitle || "",
    pageUrl: input.pageUrl || "",
    createdAt: input.createdAt || Date.now()
  };
}

export async function getAllWords() {
  const db = await openDB();
  const tx = db.transaction("words", "readonly");
  const all = await reqToPromise(tx.objectStore("words").getAll());
  await txDone(tx);
  return all || [];
}

export async function getWord(id) {
  if (!id) return null;
  const db = await openDB();
  const tx = db.transaction("words", "readonly");
  const row = await reqToPromise(tx.objectStore("words").get(id));
  await txDone(tx);
  return row || null;
}

export async function findWordByNormalized(wordOrKey) {
  const key = normalizeWordKey(wordOrKey);
  if (!key) return null;
  const db = await openDB();
  const tx = db.transaction("words", "readonly");
  const row = await reqToPromise(tx.objectStore("words").index("by_word").get(key));
  await txDone(tx);
  return row || null;
}

/** Insert or update by normalized word key (dedupe). */
export async function saveWord(input) {
  const word = String(input.word || "").replace(/\s+/g, " ").trim();
  if (!word) throw new Error("word is required");
  const wordKey = normalizeWordKey(word);
  const existing = await findWordByNormalized(wordKey);
  const record = normalizeWordRecord({
    ...input,
    id: existing ? existing.id : input.id,
    word,
    wordKey,
    note: input.note != null ? input.note : existing ? existing.note : "",
    pageTitle: input.pageTitle != null ? input.pageTitle : existing ? existing.pageTitle : "",
    pageUrl: input.pageUrl != null ? input.pageUrl : existing ? existing.pageUrl : "",
    createdAt: existing ? existing.createdAt : input.createdAt
  });
  const db = await openDB();
  const tx = db.transaction("words", "readwrite");
  tx.objectStore("words").put(record);
  await txDone(tx);
  return record;
}

export async function updateWord(id, patch) {
  const existing = await getWord(id);
  if (!existing) return null;
  const next = { ...existing, ...patch, id: existing.id };
  if ("word" in patch) {
    next.word = String(patch.word || "").replace(/\s+/g, " ").trim();
    next.wordKey = normalizeWordKey(next.word);
  }
  if ("note" in patch) next.note = typeof patch.note === "string" ? patch.note : "";
  const db = await openDB();
  const tx = db.transaction("words", "readwrite");
  tx.objectStore("words").put(next);
  await txDone(tx);
  return next;
}

export async function deleteWord(id) {
  if (!id) return;
  const db = await openDB();
  const tx = db.transaction("words", "readwrite");
  tx.objectStore("words").delete(id);
  await txDone(tx);
}

/** Clear all RecordU object stores (captures, screenshots, words, favicons). */
export async function clearAllStores() {
  const db = await openDB();
  const tx = db.transaction(["captures", "screenshots", "words", "favicons"], "readwrite");
  tx.objectStore("captures").clear();
  tx.objectStore("screenshots").clear();
  tx.objectStore("words").clear();
  tx.objectStore("favicons").clear();
  await txDone(tx);
}

/** All screenshot rows (blobs included). */
export async function getAllScreenshots() {
  const db = await openDB();
  const tx = db.transaction("screenshots", "readonly");
  const all = await reqToPromise(tx.objectStore("screenshots").getAll());
  await txDone(tx);
  return all || [];
}

/**
 * Replace local data with backup payload.
 * @param {{ captures?: object[], words?: object[], favicons?: object[], screenshots?: object[] }} payload
 *   screenshots entries: { captureId, blob, mime?, w?, h? }
 */
export async function importAllData(payload) {
  const captures = Array.isArray(payload.captures) ? payload.captures : [];
  const words = Array.isArray(payload.words) ? payload.words : [];
  const favicons = Array.isArray(payload.favicons) ? payload.favicons : [];
  const screenshots = Array.isArray(payload.screenshots) ? payload.screenshots : [];

  await clearAllStores();

  const db = await openDB();
  const tx = db.transaction(["captures", "screenshots", "words", "favicons"], "readwrite");
  const captureStore = tx.objectStore("captures");
  const shotStore = tx.objectStore("screenshots");
  const wordStore = tx.objectStore("words");
  const favStore = tx.objectStore("favicons");

  for (const c of captures) {
    if (!c || !c.id) continue;
    captureStore.put(normalizeCapture(c));
  }
  for (const w of words) {
    if (!w || !w.id) continue;
    const word = String(w.word || "").replace(/\s+/g, " ").trim();
    if (!word) continue;
    wordStore.put(
      normalizeWordRecord({
        ...w,
        word,
        wordKey: w.wordKey || normalizeWordKey(word)
      })
    );
  }
  for (const f of favicons) {
    if (!f || !f.host || !f.dataUrl) continue;
    favStore.put({
      host: f.host,
      dataUrl: f.dataUrl,
      updatedAt: typeof f.updatedAt === "number" ? f.updatedAt : Date.now()
    });
  }
  for (const s of screenshots) {
    if (!s || !s.captureId || !s.blob) continue;
    shotStore.put({
      captureId: s.captureId,
      blob: s.blob,
      mime: s.mime || s.blob.type || "image/jpeg",
      w: typeof s.w === "number" ? s.w : 0,
      h: typeof s.h === "number" ? s.h : 0
    });
  }

  await txDone(tx);
  return {
    captures: captures.length,
    words: words.length,
    favicons: favicons.length,
    screenshots: screenshots.length
  };
}

/** One-time migrate from chrome.storage.local into IndexedDB. */
export async function migrateFromStorage() {
  const flag = await chrome.storage.local.get(MIGRATE_FLAG);
  if (flag[MIGRATE_FLAG]) return { migrated: false, reason: "already" };

  const data = await chrome.storage.local.get([OLD_CAPTURES_KEY, OLD_FAVICON_KEY]);
  const oldCaptures = data[OLD_CAPTURES_KEY];
  const oldFavicons = data[OLD_FAVICON_KEY];
  const hasCaptures = Array.isArray(oldCaptures) && oldCaptures.length > 0;
  const hasFavicons = oldFavicons && typeof oldFavicons === "object" && Object.keys(oldFavicons).length > 0;

  if (!hasCaptures && !hasFavicons) {
    await chrome.storage.local.set({ [MIGRATE_FLAG]: true });
    await chrome.storage.local.remove([OLD_CAPTURES_KEY, OLD_FAVICON_KEY]);
    return { migrated: true, captures: 0, favicons: 0 };
  }

  try {
    await openDB();
    let captureCount = 0;
    if (hasCaptures) {
      for (const c of oldCaptures) {
        await saveCapture({
          id: c.id,
          type: "text",
          text: c.text,
          anchor: c.anchor,
          pageTitle: c.pageTitle,
          pageUrl: c.pageUrl,
          createdAt: c.createdAt,
          status: c.status || "kept"
        });
        captureCount++;
      }
    }
    let favCount = 0;
    if (hasFavicons) {
      for (const [host, dataUrl] of Object.entries(oldFavicons)) {
        if (host && dataUrl) {
          await putFavicon(host, dataUrl);
          favCount++;
        }
      }
    }
    await chrome.storage.local.set({ [MIGRATE_FLAG]: true });
    await chrome.storage.local.remove([OLD_CAPTURES_KEY, OLD_FAVICON_KEY]);
    return { migrated: true, captures: captureCount, favicons: favCount };
  } catch (e) {
    console.error("[RecordU] IndexedDB migrate failed; keeping chrome.storage", e);
    return { migrated: false, error: String(e && e.message ? e.message : e) };
  }
}
