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
  normalizeSettings
} from "./settings.js";
import { normalizeQuizItems, renderQuizPrompt } from "./quiz.js";

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

async function chatCompletions({ settings, userContent, systemContent, temperature }) {
  const s = normalizeSettings(settings);
  if (!s.llmApiKey.trim()) {
    const err = new Error("missing api key");
    err.code = "need_key";
    throw err;
  }

  const base = normalizeLlmBaseUrl(s.llmBaseUrl);
  const url = `${base}/v1/chat/completions`;
  const model = normalizeLlmModel(s.llmModel);

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
        ]
      })
    });
  } catch (e) {
    const err = new Error(e && e.message ? e.message : "network error");
    err.code = "network";
    throw err;
  }

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
    const err = new Error(detail || `HTTP ${res.status}`);
    err.code = res.status === 401 || res.status === 403 ? "auth" : "http";
    err.status = res.status;
    throw err;
  }

  let data;
  try {
    data = await res.json();
  } catch (e) {
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
    const err = new Error("model did not return JSON");
    err.code = "parse";
    throw err;
  }
  return parsed;
}

/**
 * @param {string} word
 * @param {object} settings
 * @returns {Promise<{ phonetic: string, translation: string }>}
 */
export async function lookupWordWithLlm(word, settings) {
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
    temperature: 0.2
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
 * @returns {Promise<object[]>} normalized quiz items
 */
export async function generateQuizWithLlm(words, promptLang, settings) {
  const list = Array.isArray(words) ? words : [];
  if (!list.length) {
    const err = new Error("no words");
    err.code = "bad_request";
    throw err;
  }
  const lang = promptLang === "zh" ? "zh" : "en";
  const s = normalizeSettings(settings);
  const quizPrompt = normalizeLlmQuizPrompt(s.llmQuizPrompt);
  const parsed = await chatCompletions({
    settings: s,
    userContent: renderQuizPrompt(quizPrompt, list, lang),
    systemContent: "You return only a valid JSON object for vocabulary quizzes.",
    temperature: 0.7
  });
  return normalizeQuizItems(parsed, lang);
}

/**
 * Soft-grade blank answers with LLM (synonyms / minor variants OK).
 * @param {Array<{ id: string, prompt: string, answer: string, userAnswer: string }>} blanks
 * @param {"en"|"zh"} promptLang
 * @param {object} settings
 * @returns {Promise<Record<string, boolean>>}
 */
export async function gradeBlankAnswersWithLlm(blanks, promptLang, settings) {
  const list = (Array.isArray(blanks) ? blanks : []).filter(
    (b) => b && b.id && String(b.userAnswer || "").trim()
  );
  if (!list.length) return {};

  const lang = promptLang === "zh" ? "zh" : "en";
  const payload = list.map((b) => ({
    id: b.id,
    prompt: String(b.prompt || ""),
    expected: String(b.answer || ""),
    userAnswer: String(b.userAnswer || "").trim()
  }));

  const userContent = `你是英语词汇练习阅卷助手。请判断填空题用户答案是否可接受。

规则：
1. 只输出一个 JSON 对象：{"results":[{"id":"...","correct":true}]}
2. 语义正确、同义/近义、词形轻微差异、大小写/空格差异可判 correct=true。
3. 完全无关、反义、漏掉关键词义则 correct=false。
4. 出题方向为 ${lang}（en=题干英文答中文；zh=题干中文答英文）；按该方向理解 expected 与 userAnswer。
5. results 必须覆盖下列每一道题的 id，不要增加其它字段说明。

题目：
${JSON.stringify(payload, null, 2)}`;

  const parsed = await chatCompletions({
    settings,
    userContent,
    systemContent: "You return only a valid JSON object for quiz blank grading.",
    temperature: 0.1
  });

  const results = parsed && Array.isArray(parsed.results) ? parsed.results : [];
  const grades = {};
  for (const row of results) {
    if (!row || row.id == null) continue;
    grades[String(row.id)] = !!row.correct;
  }
  // Any unanswered-by-model blanks with user input → leave unset for local fallback
  return grades;
}
