/**
 * LLM word lookup + quiz generation (OpenAI-compatible chat completions).
 * Runs in the extension service worker — never expose API keys to pages.
 */

import {
  DEFAULT_LLM_LOOKUP_PROMPT,
  normalizeLlmBaseUrl,
  normalizeLlmLookupPrompt,
  normalizeLlmModel,
  normalizeLlmQuizPrompt,
  normalizeLlmReasoningEffort,
  normalizeSettings
} from "./settings.js";
import { normalizeQuizDifficulty, normalizeQuizItems, renderQuizPrompt } from "./quiz.js";

/** Default timeouts for chat completions (ms). */
export const LLM_LOOKUP_TIMEOUT_MS = 60000;
export const LLM_QUIZ_TIMEOUT_MS = 120000;
export const LLM_GRADE_TIMEOUT_MS = 60000;

function extractJsonObject(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {}
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch (e) {}
  }
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch (e) {}
  }
  return null;
}

export function renderLookupPrompt(template, word) {
  const prompt = normalizeLlmLookupPrompt(template || DEFAULT_LLM_LOOKUP_PROMPT);
  const w = String(word || "").trim();
  if (!prompt.includes("{{word}}")) {
    return `${prompt}\n\n单词：${w}`;
  }
  return prompt.split("{{word}}").join(w);
}

/** Build DeepSeek thinking / reasoning_effort fields for chat body. */
function thinkingBodyFields(settings) {
  const effort = normalizeLlmReasoningEffort(settings && settings.llmReasoningEffort);
  if (effort === "off") {
    return { thinking: { type: "disabled" } };
  }
  return {
    thinking: { type: "enabled" },
    reasoning_effort: effort
  };
}

function isAbortError(e) {
  return !!(e && (e.name === "AbortError" || e.code === 20));
}

function llmLog(...args) {
  console.log("[RecordU llm]", ...args);
}

function llmWarn(...args) {
  console.warn("[RecordU llm]", ...args);
}

/**
 * @param {object} opts
 * @param {object} opts.settings
 * @param {string} opts.userContent
 * @param {string} opts.systemContent
 * @param {number} [opts.temperature]
 * @param {number} [opts.timeoutMs]
 * @param {AbortSignal} [opts.signal]
 * @param {string} [opts.tag]
 */
async function chatCompletions({
  settings,
  userContent,
  systemContent,
  temperature,
  timeoutMs,
  signal,
  tag
}) {
  const s = normalizeSettings(settings);
  if (!s.llmApiKey.trim()) {
    const err = new Error("missing api key");
    err.code = "need_key";
    throw err;
  }

  if (signal && signal.aborted) {
    const err = new Error("aborted");
    err.code = "aborted";
    throw err;
  }

  const base = normalizeLlmBaseUrl(s.llmBaseUrl);
  const url = `${base}/v1/chat/completions`;
  const model = normalizeLlmModel(s.llmModel);
  const thinking = thinkingBodyFields(s);
  const label = tag || "chat";
  const ms = typeof timeoutMs === "number" && timeoutMs > 0 ? timeoutMs : LLM_LOOKUP_TIMEOUT_MS;
  const started = Date.now();

  llmLog(`${label} start`, {
    model,
    base,
    timeoutMs: ms,
    promptChars: String(userContent || "").length,
    reasoning: s.llmReasoningEffort
  });

  const ctrl = new AbortController();
  const timer = setTimeout(() => {
    llmWarn(`${label} abort by timeout after ${ms}ms`);
    ctrl.abort();
  }, ms);
  const onExternalAbort = () => ctrl.abort();
  if (signal) signal.addEventListener("abort", onExternalAbort, { once: true });

  const heartbeat = setInterval(() => {
    llmLog(`${label} waiting…`, `${Math.round((Date.now() - started) / 1000)}s / ${Math.round(ms / 1000)}s`);
  }, 10000);

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${s.llmApiKey.trim()}`
      },
      body: JSON.stringify({
        model,
        temperature: typeof temperature === "number" ? temperature : 0.2,
        messages: [
          { role: "system", content: systemContent },
          { role: "user", content: userContent }
        ],
        ...thinking
      }),
      signal: ctrl.signal
    });
  } catch (e) {
    const elapsed = Date.now() - started;
    if (isAbortError(e) || ctrl.signal.aborted) {
      const abortedByCaller = !!(signal && signal.aborted);
      llmWarn(`${label} ${abortedByCaller ? "aborted" : "timeout"}`, `${elapsed}ms`);
      const err = new Error(abortedByCaller ? "aborted" : "request timed out");
      err.code = abortedByCaller ? "aborted" : "timeout";
      throw err;
    }
    llmWarn(`${label} network error`, `${elapsed}ms`, e && e.message ? e.message : e);
    const err = new Error(e && e.message ? e.message : "network error");
    err.code = "network";
    throw err;
  } finally {
    clearInterval(heartbeat);
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onExternalAbort);
  }

  llmLog(`${label} http`, res.status, `${Date.now() - started}ms`);

  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = (body && body.error && body.error.message) || JSON.stringify(body);
    } catch (e) {
      try {
        detail = await res.text();
      } catch (e2) {}
    }
    llmWarn(`${label} http error`, res.status, detail);
    const err = new Error(detail || `HTTP ${res.status}`);
    err.code = res.status === 401 || res.status === 403 ? "auth" : "http";
    err.status = res.status;
    throw err;
  }

  let data;
  try {
    data = await res.json();
  } catch (e) {
    llmWarn(`${label} invalid JSON body`, `${Date.now() - started}ms`);
    const err = new Error("invalid response");
    err.code = "parse";
    throw err;
  }

  const content =
    data &&
    data.choices &&
    data.choices[0] &&
    data.choices[0].message &&
    data.choices[0].message.content;
  const parsed = extractJsonObject(content);
  if (!parsed || typeof parsed !== "object") {
    llmWarn(`${label} model did not return JSON`, {
      elapsedMs: Date.now() - started,
      contentPreview: String(content || "").slice(0, 200)
    });
    const err = new Error("model did not return JSON");
    err.code = "parse";
    throw err;
  }
  llmLog(`${label} ok`, `${Date.now() - started}ms`);
  return parsed;
}

/**
 * @param {string} word
 * @param {object} settings
 * @param {{ signal?: AbortSignal, timeoutMs?: number }} [opts]
 * @returns {Promise<{ phonetic: string, translation: string }>}
 */
export async function lookupWordWithLlm(word, settings, opts = {}) {
  const term = String(word || "").replace(/\s+/g, " ").trim();
  if (!term) {
    const err = new Error("word is required");
    err.code = "bad_request";
    throw err;
  }
  const s = normalizeSettings(settings);
  const parsed = await chatCompletions({
    settings: s,
    userContent: renderLookupPrompt(s.llmLookupPrompt, term),
    systemContent: "You return only valid JSON objects for dictionary lookups.",
    temperature: 0.2,
    timeoutMs: opts.timeoutMs != null ? opts.timeoutMs : LLM_LOOKUP_TIMEOUT_MS,
    signal: opts.signal,
    tag: "lookup"
  });

  return {
    phonetic: typeof parsed.phonetic === "string" ? parsed.phonetic.trim() : "",
    translation: typeof parsed.translation === "string" ? parsed.translation.trim() : ""
  };
}

/**
 * @param {object[]} words snapshots { word, translation, phonetic? }
 * @param {"en"|"zh"} promptLang
 * @param {object} settings
 * @param {{ signal?: AbortSignal, timeoutMs?: number, difficulty?: "easy"|"normal"|"hard" }} [opts]
 * @returns {Promise<object[]>} normalized quiz items
 */
export async function generateQuizWithLlm(words, promptLang, settings, opts = {}) {
  const list = Array.isArray(words) ? words : [];
  if (!list.length) {
    const err = new Error("no words");
    err.code = "bad_request";
    throw err;
  }
  const lang = promptLang === "zh" ? "zh" : "en";
  const level = normalizeQuizDifficulty(opts.difficulty);
  const s = normalizeSettings(settings);
  const quizPrompt = normalizeLlmQuizPrompt(s.llmQuizPrompt);
  const parsed = await chatCompletions({
    settings: s,
    userContent: renderQuizPrompt(quizPrompt, list, lang, level),
    systemContent: "You return only a valid JSON object for vocabulary quizzes.",
    temperature: 0.7,
    timeoutMs: opts.timeoutMs != null ? opts.timeoutMs : LLM_QUIZ_TIMEOUT_MS,
    signal: opts.signal,
    tag: `quiz(${list.length}w)`
  });
  let items = normalizeQuizItems(parsed, lang);
  if (level === "easy") {
    items = items.filter((it) => it && it.type !== "blank");
    if (!items.length) {
      const err = new Error("简单难度未返回有效题目（已排除填空）");
      err.code = "parse";
      throw err;
    }
  }
  llmLog(`quiz normalize ok`, items.length, "items");
  return items;
}

/**
 * Soft-grade blank answers with LLM (synonyms / minor variants OK).
 * @param {Array<{ id: string, prompt: string, answer: string, userAnswer: string }>} blanks
 * @param {"en"|"zh"} promptLang
 * @param {object} settings
 * @param {{ signal?: AbortSignal, timeoutMs?: number }} [opts]
 * @returns {Promise<Record<string, boolean>>}
 */
export async function gradeBlankAnswersWithLlm(blanks, promptLang, settings, opts = {}) {
  const list = (Array.isArray(blanks) ? blanks : []).filter(
    (b) => b && b.id && String(b.userAnswer || "").trim()
  );
  if (!list.length) return {};

  void promptLang;
  const payload = list.map((b) => ({
    id: b.id,
    prompt: String(b.prompt || ""),
    expected: String(b.answer || ""),
    userAnswer: String(b.userAnswer || "").trim()
  }));

  const userContent = `你是英语词汇练习阅卷助手。请判断填空题用户答案是否可接受。

规则：
1. 只输出一个 JSON 对象：{"results":[{"id":"...","correct":true}]}
2. 以 expected 为准：英文词/短语允许合理词形变化、大小写与空格差异；中文允许同义/近义与轻微措辞差异。
3. 语义正确可判 correct=true；完全无关、反义、漏掉关键词义则 correct=false。
4. 不要根据题干语言硬性规定「必须答中文」或「必须答英文」——看 expected 与 userAnswer 是否等价。
5. results 必须覆盖下列每一道题的 id，不要增加其它字段说明。

题目：
${JSON.stringify(payload, null, 2)}`;

  const parsed = await chatCompletions({
    settings,
    userContent,
    systemContent: "You return only a valid JSON object for quiz blank grading.",
    temperature: 0.1,
    timeoutMs: opts.timeoutMs != null ? opts.timeoutMs : LLM_GRADE_TIMEOUT_MS,
    signal: opts.signal,
    tag: `grade(${list.length})`
  });

  const results = parsed && Array.isArray(parsed.results) ? parsed.results : [];
  const grades = {};
  for (const row of results) {
    if (!row || row.id == null) continue;
    grades[String(row.id)] = !!row.correct;
  }
  llmLog("grade results", Object.keys(grades).length, "/", list.length);
  // Any unanswered-by-model blanks with user input → leave unset for local fallback
  return grades;
}
