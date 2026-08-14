import { normalizeWordKey } from "./db.js";
import { enrichWordsForQuiz, pickRandomWords, quizWordPool } from "./quiz.js";

export const SPRINT_DURATION_MIN = 10;
export const SPRINT_DURATION_MAX = 300;
export const SPRINT_DURATION_STEP = 10;
export const SPRINT_DURATION_DEFAULT = 60;
export const SPRINT_DURATION_SEC = SPRINT_DURATION_DEFAULT;
export const DETECTIVE_DEFAULT_COUNT = 8;

/**
 * @param {unknown} value
 * @returns {number}
 */
export function clampSprintDuration(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return SPRINT_DURATION_DEFAULT;
  const stepped = Math.round(raw / SPRINT_DURATION_STEP) * SPRINT_DURATION_STEP;
  return Math.min(SPRINT_DURATION_MAX, Math.max(SPRINT_DURATION_MIN, stepped));
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeArenaDayKey(value) {
  const key = String(value || "").trim();
  return key || "all";
}

/**
 * Remaining milliseconds for a sprint session (based on startedAt).
 * @param {object} session
 * @returns {number}
 */
export function sprintRemainingMs(session) {
  if (!session) return 0;
  const durationMs = clampSprintDuration(session.durationSec) * 1000;
  const started = Number(session.startedAt) || Date.now();
  return Math.max(0, started + durationMs - Date.now());
}

/**
 * @param {unknown} value
 * @returns {"en2zh"|"zh2en"}
 */
export function normalizeSprintDirection(value) {
  return value === "zh2en" ? "zh2en" : "en2zh";
}

/**
 * @param {string} user
 * @param {string} expected
 */
export function answersMatchWord(user, expected) {
  const u = String(user || "").trim();
  const e = String(expected || "").trim();
  if (!u || !e) return false;
  return normalizeWordKey(u) === normalizeWordKey(e);
}

/**
 * Prefer words that have reading context; then fill with the rest.
 * @param {object[]} pool
 * @param {object[]} captures
 * @param {number} count
 */
export function pickDetectiveWords(pool, captures, count) {
  const n = Math.max(1, Math.min(Number(count) || DETECTIVE_DEFAULT_COUNT, (pool || []).length));
  if (!n) return [];
  const enriched = enrichWordsForQuiz(
    pickRandomWords(pool, Math.min(pool.length, Math.max(n * 3, n))),
    captures
  );
  const withCtx = [];
  const without = [];
  for (const w of enriched) {
    if (w && w.context) withCtx.push(w);
    else if (w) without.push(w);
  }
  const shuffledCtx = shuffleCopy(withCtx);
  const shuffledRest = shuffleCopy(without);
  return [...shuffledCtx, ...shuffledRest].slice(0, n);
}

/**
 * Build a cloze prompt from context, or fall back to translation → word.
 * @param {object} word enriched pick
 */
export function buildDetectiveItem(word) {
  const w = word && typeof word === "object" ? word : {};
  const term = String(w.word || "").trim();
  const translation = String(w.translation || "").trim();
  const phonetic = String(w.phonetic || "").trim();
  const pageTitle = String(w.pageTitle || "").trim();
  const pageUrl = String(w.pageUrl || "").trim();
  const context = String(w.context || "").trim();
  const cloze = context ? makeCloze(context, term) : null;
  return {
    id: w.id || "",
    word: term,
    translation,
    phonetic,
    pageTitle,
    pageUrl,
    mode: cloze ? "context" : "gloss",
    promptText: cloze ? cloze.text : translation,
    blankLabel: cloze ? cloze.blank : "______",
    userAnswer: "",
    correct: null,
    revealed: false
  };
}

/**
 * @param {string} context
 * @param {string} word
 * @returns {{ text: string, blank: string } | null}
 */
function makeCloze(context, word) {
  const hay = String(context || "");
  const needle = String(word || "").trim();
  if (!hay || !needle) return null;

  let match = null;
  if (/[A-Za-z]/.test(needle)) {
    try {
      const re = new RegExp(`\\b${escapeRegExp(needle)}\\b`, "i");
      match = hay.match(re);
    } catch (e) {
      match = null;
    }
  }
  if (!match) {
    const idx = hay.toLowerCase().indexOf(needle.toLowerCase());
    if (idx >= 0) {
      match = [hay.slice(idx, idx + needle.length)];
      match.index = idx;
    }
  }
  if (!match || match.index == null) return null;

  const blank = "______";
  const text = `${hay.slice(0, match.index)}${blank}${hay.slice(match.index + match[0].length)}`;
  return { text, blank };
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build one sprint multiple-choice question.
 * @param {object[]} pool quizWordPool items (full records ok)
 * @param {"en2zh"|"zh2en"} direction
 * @param {Set<string>} [recentIds] avoid immediate repeats when possible
 */
export function buildSprintQuestion(pool, direction, recentIds) {
  const list = Array.isArray(pool) ? pool.filter((w) => w && w.word && w.translation) : [];
  if (list.length < 1) return null;

  const dir = normalizeSprintDirection(direction);
  const recent = recentIds instanceof Set ? recentIds : new Set();
  let candidates = list.filter((w) => !recent.has(String(w.id || "")));
  if (!candidates.length) candidates = list;

  const target = candidates[Math.floor(Math.random() * candidates.length)];
  const correctText = dir === "en2zh" ? String(target.translation).trim() : String(target.word).trim();
  const prompt = dir === "en2zh" ? String(target.word).trim() : String(target.translation).trim();

  const distractors = [];
  const used = new Set([normalizeWordKey(correctText)]);
  const others = shuffleCopy(list.filter((w) => String(w.id) !== String(target.id)));
  for (const w of others) {
    if (distractors.length >= 3) break;
    const text = dir === "en2zh" ? String(w.translation || "").trim() : String(w.word || "").trim();
    const key = normalizeWordKey(text);
    if (!text || used.has(key)) continue;
    used.add(key);
    distractors.push(text);
  }

  while (distractors.length < 3) {
    distractors.push("—");
  }

  const options = shuffleCopy([correctText, ...distractors.slice(0, 3)]);
  const answerIndex = Math.max(
    0,
    options.findIndex((t) => normalizeWordKey(t) === normalizeWordKey(correctText))
  );

  return {
    wordId: target.id || "",
    word: String(target.word || "").trim(),
    translation: String(target.translation || "").trim(),
    phonetic: String(target.phonetic || "").trim(),
    prompt,
    direction: dir,
    options,
    answerIndex
  };
}

/**
 * @template T
 * @param {T[]} arr
 * @returns {T[]}
 */
function shuffleCopy(arr) {
  const list = (Array.isArray(arr) ? arr : []).slice();
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = list[i];
    list[i] = list[j];
    list[j] = t;
  }
  return list;
}

/**
 * @param {object[]} words
 * @param {object[]} captures
 * @param {number} [count]
 * @param {string} [dayKey]
 */
export function createDetectiveSession(words, captures, count = DETECTIVE_DEFAULT_COUNT, dayKey = "all") {
  const pool = quizWordPool(words);
  const picked = pickDetectiveWords(pool, captures, count);
  return {
    mode: "detective",
    dayKey: normalizeArenaDayKey(dayKey),
    items: picked.map(buildDetectiveItem),
    index: 0,
    correctCount: 0,
    combo: 0,
    maxCombo: 0,
    finished: false,
    /** @type {{ wordId: string, word: string, translation: string, phonetic: string }[]} */
    misses: []
  };
}

/**
 * @param {object[]} words
 * @param {"en2zh"|"zh2en"} direction
 * @param {number} [durationSec]
 * @param {string} [dayKey]
 */
export function createSprintSession(words, direction = "en2zh", durationSec, dayKey = "all") {
  const pool = quizWordPool(words);
  const duration = clampSprintDuration(durationSec);
  return {
    mode: "sprint",
    pool,
    dayKey: normalizeArenaDayKey(dayKey),
    direction: normalizeSprintDirection(direction),
    durationSec: duration,
    remainingSec: duration,
    answered: 0,
    correctCount: 0,
    combo: 0,
    maxCombo: 0,
    recentIds: new Set(),
    /** @type {{ wordId: string, word: string, translation: string, phonetic: string, picked: string }[]} */
    misses: [],
    current: null,
    finished: false,
    startedAt: Date.now()
  };
}

/** Advance sprint to a new question (mutates session). */
export function nextSprintQuestion(session) {
  if (!session || session.finished) return null;
  const q = buildSprintQuestion(session.pool, session.direction, session.recentIds);
  session.current = q;
  if (q && q.wordId) {
    session.recentIds.add(String(q.wordId));
    if (session.recentIds.size > 8) {
      const first = session.recentIds.values().next().value;
      session.recentIds.delete(first);
    }
  }
  return q;
}

/**
 * Apply a sprint choice. Returns { ok, correctText }.
 * @param {object} session
 * @param {number} optionIndex
 */
export function answerSprint(session, optionIndex) {
  const q = session && session.current;
  if (!q || session.finished) return { ok: false, correctText: "" };
  const ok = Number(optionIndex) === Number(q.answerIndex);
  const correctText = q.options[q.answerIndex] || "";
  const picked = q.options[Number(optionIndex)] || "";
  session.answered += 1;
  if (ok) {
    session.correctCount += 1;
    session.combo += 1;
    if (session.combo > session.maxCombo) session.maxCombo = session.combo;
  } else {
    session.combo = 0;
    if (!Array.isArray(session.misses)) session.misses = [];
    const wordId = String(q.wordId || q.word || "");
    const already = session.misses.some(
      (m) => m && String(m.wordId || m.word || "") === wordId && wordId
    );
    if (!already) {
      session.misses.push({
        wordId,
        word: String(q.word || "").trim(),
        translation: String(q.translation || "").trim(),
        phonetic: String(q.phonetic || "").trim(),
        picked: String(picked).trim()
      });
    }
  }
  return {
    ok,
    correctText
  };
}

/**
 * Grade detective answer for current item.
 * @param {object} session
 * @param {string} userAnswer
 */
export function answerDetective(session, userAnswer) {
  if (!session || session.finished) return { ok: false };
  const item = session.items[session.index];
  if (!item || item.correct != null) return { ok: false };
  const raw = String(userAnswer == null ? "" : userAnswer).trim();
  item.userAnswer = raw;
  const ok = answersMatchWord(raw, item.word);
  item.correct = ok;
  item.revealed = true;
  if (ok) {
    session.correctCount += 1;
    session.combo += 1;
    if (session.combo > session.maxCombo) session.maxCombo = session.combo;
  } else {
    session.combo = 0;
    if (!Array.isArray(session.misses)) session.misses = [];
    const wordId = String(item.id || item.word || "");
    const already = session.misses.some(
      (m) => m && String(m.wordId || m.word || "") === wordId && wordId
    );
    if (!already) {
      session.misses.push({
        wordId,
        word: String(item.word || "").trim(),
        translation: String(item.translation || "").trim(),
        phonetic: String(item.phonetic || "").trim()
      });
    }
  }
  return { ok };
}
