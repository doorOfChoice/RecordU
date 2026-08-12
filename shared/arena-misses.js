/** Persistent arena miss bank (chrome.storage.local). */

export const ARENA_MISSES_KEY = "rc_arena_misses";
export const ARENA_MISSES_MAX = 100;

/**
 * @param {unknown} input
 * @returns {{ wordId: string, word: string, translation: string, phonetic: string, missedAt: number, source: "sprint"|"detective" } | null}
 */
export function normalizeArenaMiss(input) {
  if (!input || typeof input !== "object") return null;
  const wordId = String(input.wordId || "").trim();
  if (!wordId) return null;
  const word = String(input.word || "").trim();
  const translation = String(input.translation || "").trim();
  const phonetic = String(input.phonetic || "").trim();
  const missedAtRaw = Number(input.missedAt);
  const missedAt = Number.isFinite(missedAtRaw) && missedAtRaw > 0 ? missedAtRaw : Date.now();
  const source = input.source === "detective" ? "detective" : "sprint";
  return { wordId, word, translation, phonetic, missedAt, source };
}

/**
 * @param {unknown} list
 * @returns {{ wordId: string, word: string, translation: string, phonetic: string, missedAt: number, source: "sprint"|"detective" }[]}
 */
export function normalizeArenaMissList(list) {
  const out = [];
  const seen = new Set();
  const arr = Array.isArray(list) ? list : [];
  for (const row of arr) {
    const m = normalizeArenaMiss(row);
    if (!m || seen.has(m.wordId)) continue;
    seen.add(m.wordId);
    out.push(m);
  }
  out.sort((a, b) => b.missedAt - a.missedAt);
  return out.slice(0, ARENA_MISSES_MAX);
}

/**
 * Merge incoming misses into existing list (dedupe by wordId, refresh missedAt).
 * @param {unknown[]} existing
 * @param {unknown[]} incoming
 */
export function mergeArenaMisses(existing, incoming) {
  const map = new Map();
  for (const row of normalizeArenaMissList(existing)) {
    map.set(row.wordId, row);
  }
  const now = Date.now();
  for (const raw of Array.isArray(incoming) ? incoming : []) {
    const m = normalizeArenaMiss({ ...raw, missedAt: now });
    if (!m) continue;
    const prev = map.get(m.wordId);
    map.set(m.wordId, {
      wordId: m.wordId,
      word: m.word || (prev && prev.word) || "",
      translation: m.translation || (prev && prev.translation) || "",
      phonetic: m.phonetic || (prev && prev.phonetic) || "",
      missedAt: now,
      source: m.source
    });
  }
  return normalizeArenaMissList([...map.values()]);
}

/**
 * @param {unknown[]} existing
 * @param {string[]} ids
 */
export function removeArenaMissIds(existing, ids) {
  const drop = new Set(
    (Array.isArray(ids) ? ids : []).map((id) => String(id || "").trim()).filter(Boolean)
  );
  if (!drop.size) return normalizeArenaMissList(existing);
  return normalizeArenaMissList(existing).filter((m) => !drop.has(m.wordId));
}

/**
 * Resolve miss bank against live words: usable quiz pool + stale ids to prune.
 * Usable = unlearned word with translation, sorted by missedAt desc.
 * @param {unknown[]} misses
 * @param {object[]} words
 * @returns {{ usable: object[], staleIds: string[] }}
 */
export function resolveArenaMissPool(misses, words) {
  const byId = new Map();
  for (const w of Array.isArray(words) ? words : []) {
    if (w && w.id) byId.set(String(w.id), w);
  }
  const usable = [];
  const staleIds = [];
  for (const m of normalizeArenaMissList(misses)) {
    const live = byId.get(m.wordId);
    if (!live || live.learned) {
      staleIds.push(m.wordId);
      continue;
    }
    const word = String(live.word || "").trim();
    const translation = String(live.translation || "").trim();
    if (!word || !translation) {
      staleIds.push(m.wordId);
      continue;
    }
    usable.push({
      ...live,
      word,
      translation,
      phonetic: String(live.phonetic || m.phonetic || "").trim(),
      missedAt: m.missedAt
    });
  }
  return { usable, staleIds };
}

/**
 * Take the most recent N miss-resolved words (already sorted desc by missedAt).
 * @param {object[]} usable
 * @param {number} count
 */
export function pickRecentMissWords(usable, count) {
  const n = Math.max(0, Math.min(50, Math.round(Number(count)) || 0));
  return (Array.isArray(usable) ? usable : []).slice(0, n);
}

export async function loadArenaMisses() {
  const data = await chrome.storage.local.get(ARENA_MISSES_KEY);
  return normalizeArenaMissList(data[ARENA_MISSES_KEY]);
}

export async function saveArenaMisses(list) {
  const next = normalizeArenaMissList(list);
  await chrome.storage.local.set({ [ARENA_MISSES_KEY]: next });
  return next;
}

export async function upsertArenaMissesStorage(incoming) {
  const current = await loadArenaMisses();
  const next = mergeArenaMisses(current, incoming);
  await chrome.storage.local.set({ [ARENA_MISSES_KEY]: next });
  return next;
}

export async function removeArenaMissesStorage(ids) {
  const current = await loadArenaMisses();
  const next = removeArenaMissIds(current, ids);
  await chrome.storage.local.set({ [ARENA_MISSES_KEY]: next });
  return next;
}
