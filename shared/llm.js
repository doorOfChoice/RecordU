/**
 * LLM word lookup (OpenAI-compatible chat completions).
 * Runs in the extension service worker — never expose API keys to pages.
 */

import {
  DEFAULT_LLM_LOOKUP_PROMPT,
  normalizeLlmBaseUrl,
  normalizeLlmLookupPrompt,
  normalizeLlmModel,
  normalizeSettings
} from "./settings.js";

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

/**
 * @param {string} word
 * @param {object} settings
 * @returns {Promise<{ phonetic: string, translation: string }>}
 */
export async function lookupWordWithLlm(word, settings) {
  const s = normalizeSettings(settings);
  const term = String(word || "").replace(/\s+/g, " ").trim();
  if (!term) {
    const err = new Error("word is required");
    err.code = "bad_request";
    throw err;
  }
  if (!s.llmApiKey.trim()) {
    const err = new Error("missing api key");
    err.code = "need_key";
    throw err;
  }

  const base = normalizeLlmBaseUrl(s.llmBaseUrl);
  const url = `${base}/v1/chat/completions`;
  const model = normalizeLlmModel(s.llmModel);
  const userContent = renderLookupPrompt(s.llmLookupPrompt, term);

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
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: "You return only valid JSON objects for dictionary lookups."
          },
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

  return {
    phonetic: typeof parsed.phonetic === "string" ? parsed.phonetic.trim() : "",
    translation: typeof parsed.translation === "string" ? parsed.translation.trim() : ""
  };
}
