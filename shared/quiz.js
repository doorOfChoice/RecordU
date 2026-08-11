import { normalizeWordKey } from "./db.js";
import { DEFAULT_LLM_QUIZ_PROMPT } from "./settings.js";
import { dayKey, formatDayLabel } from "./time.js";

export const DEFAULT_QUIZ_PROMPT = DEFAULT_LLM_QUIZ_PROMPT;

/**
 * @param {unknown} value
 * @returns {"easy"|"normal"|"hard"}
 */
export function normalizeQuizDifficulty(value) {
  if (value === "easy" || value === "hard") return value;
  return "normal";
}

/**
 * Human label for quiz difficulty.
 * @param {unknown} value
 * @returns {string}
 */
export function quizDifficultyLabel(value) {
  const d = normalizeQuizDifficulty(value);
  if (d === "easy") return "简单";
  if (d === "hard") return "困难";
  return "普通";
}

/**
 * @param {object[]} words
 * @returns {object[]}
 */
export function quizWordPool(words) {
  return (Array.isArray(words) ? words : []).filter((w) => {
    if (!w || w.learned) return false;
    const word = String(w.word || "").trim();
    const translation = String(w.translation || "").trim();
    return !!(word && translation);
  });
}

/**
 * Distinct local days in the quiz pool, newest first.
 * @param {object[]} pool
 * @returns {{ key: string, label: string, count: number }[]}
 */
export function quizDayOptions(pool) {
  const byKey = new Map();
  for (const w of Array.isArray(pool) ? pool : []) {
    if (!w) continue;
    const key = dayKey(new Date(w.createdAt || Date.now()));
    const prev = byKey.get(key);
    if (prev) prev.count += 1;
    else byKey.set(key, { key, label: formatDayLabel(key), count: 1 });
  }
  return [...byKey.values()].sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0));
}

/**
 * @param {object[]} pool
 * @param {string} [day]
 * @returns {object[]}
 */
export function filterQuizPoolByDay(pool, day) {
  const list = Array.isArray(pool) ? pool : [];
  const key = String(day || "").trim();
  if (!key || key === "all") return list;
  return list.filter((w) => w && dayKey(new Date(w.createdAt || Date.now())) === key);
}

const CONTEXT_MAX_LEN = 160;

/**
 * @param {object[]} pool
 * @param {number} count
 */
export function pickRandomWords(pool, count) {
  const list = pool.slice();
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = list[i];
    list[i] = list[j];
    list[j] = t;
  }
  const n = Math.max(0, Math.min(count, list.length));
  return list.slice(0, n).map((w) => ({
    id: w.id || "",
    word: String(w.word || "").trim(),
    translation: String(w.translation || "").trim(),
    phonetic: String(w.phonetic || "").trim(),
    note: String(w.note || "").trim(),
    pageTitle: String(w.pageTitle || "").trim(),
    pageUrl: String(w.pageUrl || "").trim()
  }));
}

function clipContext(text) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  if (s.length <= CONTEXT_MAX_LEN) return s;
  return `${s.slice(0, CONTEXT_MAX_LEN - 1)}…`;
}

function captureSnippet(c) {
  if (!c || typeof c !== "object") return "";
  const a = c.anchor && typeof c.anchor === "object" ? c.anchor : null;
  if (a) {
    const joined = `${a.prefix || ""}${a.exact || ""}${a.suffix || ""}`.replace(/\s+/g, " ").trim();
    if (joined) return joined;
  }
  return String(c.text || "").replace(/\s+/g, " ").trim();
}

function captureMentionsWord(snippet, word) {
  const hay = String(snippet || "");
  const needle = String(word || "").trim();
  if (!hay || !needle) return false;
  if (/[A-Za-z]/.test(needle)) {
    try {
      const re = new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      return re.test(hay);
    } catch (e) {
      return hay.toLowerCase().includes(needle.toLowerCase());
    }
  }
  return hay.includes(needle);
}

/** Max captures scanned for cross-page word mention fallback. */
const ENRICH_ANY_PAGE_SCAN_MAX = 400;

/**
 * Attach optional reading context from captures (best-effort).
 * Prefers same pageUrl (indexed); falls back to a bounded scan of other captures.
 * @param {object[]} words from pickRandomWords
 * @param {object[]} captures
 * @returns {object[]}
 */
export function enrichWordsForQuiz(words, captures) {
  const list = Array.isArray(words) ? words : [];
  const caps = Array.isArray(captures) ? captures : [];
  /** @type {Map<string, object[]>} */
  const byUrl = new Map();
  for (const c of caps) {
    if (!c) continue;
    const url = String(c.pageUrl || "").trim();
    if (!url) continue;
    let bucket = byUrl.get(url);
    if (!bucket) {
      bucket = [];
      byUrl.set(url, bucket);
    }
    bucket.push(c);
  }

  return list.map((w) => {
    const word = String(w.word || "").trim();
    const pageUrl = String(w.pageUrl || "").trim();
    let samePage = null;
    let anyPage = null;

    const sameList = pageUrl ? byUrl.get(pageUrl) : null;
    if (sameList) {
      for (const c of sameList) {
        const snip = captureSnippet(c);
        if (!snip || !captureMentionsWord(snip, word)) continue;
        samePage = snip;
        break;
      }
    }

    if (!samePage) {
      const scanLimit = Math.min(caps.length, ENRICH_ANY_PAGE_SCAN_MAX);
      for (let i = 0; i < scanLimit; i++) {
        const c = caps[i];
        if (!c) continue;
        const cUrl = String(c.pageUrl || "").trim();
        if (pageUrl && cUrl === pageUrl) continue;
        const snip = captureSnippet(c);
        if (!snip || !captureMentionsWord(snip, word)) continue;
        anyPage = snip;
        break;
      }
    }

    const context = clipContext(samePage || anyPage || "");
    const out = {
      id: w.id || "",
      word,
      translation: String(w.translation || "").trim(),
      phonetic: String(w.phonetic || "").trim(),
      note: String(w.note || "").trim(),
      pageTitle: String(w.pageTitle || "").trim(),
      pageUrl
    };
    if (context) out.context = context;
    return out;
  });
}

/** Chunk an array into fixed-size batches (last batch may be smaller). */
export function chunkList(list, size) {
  const arr = Array.isArray(list) ? list : [];
  const n = Math.max(1, Math.floor(Number(size) || 8));
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/**
 * Split blanks into exact local matches vs ones that need LLM soft-grading.
 * @param {Array<{ id: string, prompt?: string, answer: string, userAnswer: string }>} blanks
 * @returns {{ localGrades: Record<string, boolean>, needsLlm: typeof blanks }}
 */
export function splitBlanksForGrading(blanks) {
  const localGrades = {};
  const needsLlm = [];
  for (const b of Array.isArray(blanks) ? blanks : []) {
    if (!b || !b.id) continue;
    const user = String(b.userAnswer == null ? "" : b.userAnswer).trim();
    if (!user) continue;
    if (answersMatch(user, b.answer)) {
      localGrades[String(b.id)] = true;
    } else {
      needsLlm.push(b);
    }
  }
  return { localGrades, needsLlm };
}

function itemId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Fisher–Yates shuffle (in place). */
function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

/** Shuffle choice options; remaps answerIndex. */
function shuffleChoiceOptions(options, answerIndex) {
  const paired = options.map((text, i) => ({ text, correct: i === answerIndex }));
  shuffleInPlace(paired);
  return {
    options: paired.map((p) => p.text),
    answerIndex: Math.max(
      0,
      paired.findIndex((p) => p.correct)
    )
  };
}

/**
 * Shuffle match left & right independently; remaps links.
 * @param {string[]} left
 * @param {string[]} right
 * @param {number[]} links leftIndex → rightIndex
 */
function shuffleMatchSides(left, right, links) {
  const n = left.length;
  const leftOrder = shuffleInPlace([...Array(n).keys()]);
  const rightOrder = shuffleInPlace([...Array(n).keys()]);
  const newLeft = leftOrder.map((i) => left[i]);
  const newRight = rightOrder.map((i) => right[i]);
  const newLinks = leftOrder.map((oldLeftIdx) => {
    const oldRightIdx = links[oldLeftIdx];
    return rightOrder.indexOf(oldRightIdx);
  });
  return { left: newLeft, right: newRight, links: newLinks };
}

/**
 * Normalize LLM quiz items into fixed schema. Throws if nothing usable.
 * @param {unknown} raw
 * @param {"en"|"zh"} promptLang
 */
export function normalizeQuizItems(raw, promptLang) {
  const root = raw && typeof raw === "object" ? raw : null;
  const list = root && Array.isArray(root.items) ? root.items : Array.isArray(raw) ? raw : null;
  if (!list || !list.length) {
    const err = new Error("模型未返回有效题目");
    err.code = "parse";
    throw err;
  }

  const items = [];
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    const type = row.type;
    if (type === "choice") {
      const options = Array.isArray(row.options)
        ? row.options.map((o) => String(o == null ? "" : o).trim()).filter(Boolean)
        : [];
      if (options.length < 2) continue;
      while (options.length < 4) options.push(options[options.length - 1] || "—");
      const opts = options.slice(0, 4);
      let answerIndex = Number(row.answerIndex);
      if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= opts.length) {
        answerIndex = 0;
      }
      const prompt = String(row.prompt || "").trim();
      if (!prompt) continue;
      const shuffled = shuffleChoiceOptions(opts, answerIndex);
      items.push({
        id: itemId(),
        type: "choice",
        prompt,
        options: shuffled.options,
        answerIndex: shuffled.answerIndex,
        userAnswer: null,
        correct: null
      });
    } else if (type === "blank") {
      const prompt = String(row.prompt || "").trim();
      const answer = String(row.answer || "").trim();
      if (!prompt || !answer) continue;
      items.push({
        id: itemId(),
        type: "blank",
        prompt,
        answer,
        userAnswer: null,
        correct: null
      });
    } else if (type === "match") {
      const left = Array.isArray(row.left)
        ? row.left.map((x) => String(x == null ? "" : x).trim()).filter(Boolean)
        : [];
      const right = Array.isArray(row.right)
        ? row.right.map((x) => String(x == null ? "" : x).trim()).filter(Boolean)
        : [];
      if (left.length < 2 || right.length < 2 || left.length !== right.length) continue;
      let links = Array.isArray(row.links) ? row.links.map((n) => Number(n)) : [];
      if (links.length !== left.length) {
        links = left.map((_, i) => i);
      }
      const used = new Set();
      const fixed = links.map((li, i) => {
        if (Number.isInteger(li) && li >= 0 && li < right.length && !used.has(li)) {
          used.add(li);
          return li;
        }
        for (let j = 0; j < right.length; j++) {
          if (!used.has(j)) {
            used.add(j);
            return j;
          }
        }
        return i % right.length;
      });
      const shuffled = shuffleMatchSides(left, right, fixed);
      items.push({
        id: itemId(),
        type: "match",
        left: shuffled.left,
        right: shuffled.right,
        links: shuffled.links,
        userAnswer: null,
        correct: null
      });
    }
  }

  if (!items.length) {
    const err = new Error("模型返回的题目无法解析");
    err.code = "parse";
    throw err;
  }

  void promptLang;
  return items;
}

function answersMatch(user, expected) {
  const u = String(user || "").trim();
  const e = String(expected || "").trim();
  if (!u || !e) return false;
  return normalizeWordKey(u) === normalizeWordKey(e);
}

/**
 * Grade quiz in place; returns { correct, total }.
 * For blank items, pass blankGrades: { [itemId]: boolean } from LLM judge.
 * Empty blank answers are always wrong; missing grades fall back to local match.
 * @param {object} quiz
 * @param {{ blankGrades?: Record<string, boolean> }} [opts]
 */
export function scoreQuiz(quiz, opts = {}) {
  const blankGrades = opts.blankGrades && typeof opts.blankGrades === "object" ? opts.blankGrades : null;
  const items = Array.isArray(quiz.items) ? quiz.items : [];
  let correct = 0;
  let total = 0;

  for (const item of items) {
    if (item.type === "choice") {
      total += 1;
      const ok =
        item.userAnswer != null &&
        Number(item.userAnswer) === Number(item.answerIndex);
      item.correct = ok;
      if (ok) correct += 1;
    } else if (item.type === "blank") {
      total += 1;
      const user = String(item.userAnswer == null ? "" : item.userAnswer).trim();
      let ok = false;
      if (!user) {
        ok = false;
      } else if (blankGrades && Object.prototype.hasOwnProperty.call(blankGrades, item.id)) {
        ok = !!blankGrades[item.id];
      } else {
        ok = answersMatch(user, item.answer);
      }
      item.correct = ok;
      if (ok) correct += 1;
    } else if (item.type === "match") {
      const links = Array.isArray(item.links) ? item.links : [];
      const user = Array.isArray(item.userAnswer) ? item.userAnswer : [];
      const n = links.length;
      total += n;
      let pairOk = 0;
      for (let i = 0; i < n; i++) {
        if (Number(user[i]) === Number(links[i])) pairOk += 1;
      }
      item.correct = pairOk === n;
      correct += pairOk;
    }
  }

  return { correct, total };
}

/** Collect blank items that need LLM grading (non-empty user answers). */
export function blankItemsForGrading(quiz) {
  const items = Array.isArray(quiz.items) ? quiz.items : [];
  return items
    .filter((item) => item && item.type === "blank")
    .map((item) => ({
      id: item.id,
      prompt: String(item.prompt || ""),
      answer: String(item.answer || ""),
      userAnswer: String(item.userAnswer == null ? "" : item.userAnswer).trim()
    }))
    .filter((row) => row.userAnswer);
}

/**
 * @param {string} template
 * @param {object[]} words
 * @param {"en"|"zh"} promptLang
 * @param {"easy"|"normal"|"hard"} [difficulty]
 */
export function renderQuizPrompt(template, words, promptLang, difficulty) {
  const lang = promptLang === "zh" ? "zh" : "en";
  const level = normalizeQuizDifficulty(difficulty);
  const wordsJson = JSON.stringify(
    words.map((w) => {
      const row = {
        word: w.word,
        translation: w.translation
      };
      if (w.phonetic) row.phonetic = w.phonetic;
      if (w.note) row.note = w.note;
      if (w.pageTitle) row.pageTitle = w.pageTitle;
      if (w.context) row.context = w.context;
      return row;
    }),
    null,
    2
  );
  let out = String(template || DEFAULT_QUIZ_PROMPT);
  if (!out.includes("{{words}}")) {
    out = `${out}\n\n词表：\n{{words}}`;
  }
  if (!out.includes("{{promptLang}}")) {
    out = `${out}\n出题方向：{{promptLang}}`;
  }
  if (!out.includes("{{difficulty}}")) {
    out = `${out}\n难度：{{difficulty}}`;
  }
  return out
    .split("{{promptLang}}")
    .join(lang)
    .split("{{difficulty}}")
    .join(level)
    .split("{{words}}")
    .join(wordsJson);
}
