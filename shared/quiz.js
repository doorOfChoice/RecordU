import { normalizeWordKey } from "./db.js";
import { DEFAULT_LLM_QUIZ_PROMPT } from "./settings.js";

export const DEFAULT_QUIZ_PROMPT = DEFAULT_LLM_QUIZ_PROMPT;
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
    phonetic: String(w.phonetic || "").trim()
  }));
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

function answersMatch(user, expected, promptLang) {
  const u = String(user || "").trim();
  const e = String(expected || "").trim();
  if (!u || !e) return false;
  if (promptLang === "zh") {
    return normalizeWordKey(u) === normalizeWordKey(e);
  }
  return u.toLowerCase() === e.toLowerCase();
}

/**
 * Grade quiz in place; returns { correct, total }.
 * For blank items, pass blankGrades: { [itemId]: boolean } from LLM judge.
 * Empty blank answers are always wrong; missing grades fall back to local match.
 * @param {object} quiz
 * @param {{ blankGrades?: Record<string, boolean> }} [opts]
 */
export function scoreQuiz(quiz, opts = {}) {
  const promptLang = quiz.promptLang === "zh" ? "zh" : "en";
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
        ok = answersMatch(user, item.answer, promptLang);
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
 */
export function renderQuizPrompt(template, words, promptLang) {
  const lang = promptLang === "zh" ? "zh" : "en";
  const wordsJson = JSON.stringify(
    words.map((w) => ({
      word: w.word,
      translation: w.translation,
      phonetic: w.phonetic || undefined
    })),
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
  return out.split("{{promptLang}}").join(lang).split("{{words}}").join(wordsJson);
}
