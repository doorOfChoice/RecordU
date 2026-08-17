/** Global extension settings (chrome.storage.local). */

export const SETTINGS_KEY = "rc_settings";

export const DEFAULT_LLM_LOOKUP_PROMPT = `你是英汉互译助手。请处理用户输入「{{word}}」（单词、短语或短句）。

要求：
1. 只输出一个 JSON 对象，不要 markdown 代码块，不要其它说明文字。
2. JSON 格式严格为：{"phonetic":"...","translation":"..."}
3. 若输入主要为中文：translation 填合适英文（词/短语用自然对应，句子通顺）；phonetic 为该英文的 IPA（两侧可带斜杠），句子无法确定时用空字符串。
4. 若输入主要为英文或其它外语：phonetic 使用 IPA（两侧可带斜杠，如 /ˈwɜːrd/；无法确定则空字符串）；translation 为简洁中文释义（可含词性），多个义项用分号分隔。`;

export const DEFAULT_LLM_QUIZ_PROMPT = `你是英语词汇练习出题助手。按指定难度出题，帮助学习者巩固词表。

要求：
1. 只输出一个 JSON 对象，不要 markdown 代码块，不要其它说明。
2. JSON 格式：{"items":[...]}
3. items 中每题 type 只能是 "choice" | "blank" | "match"：
   - choice: {"type":"choice","prompt":"题干","options":["选项1","选项2","选项3","选项4"],"answerIndex":0}
     options 必须恰好 4 个；answerIndex 为正确选项下标（0-3）。
   - blank: {"type":"blank","prompt":"题干","answer":"标准答案"}
   - match: {"type":"match","left":["左1","左2",...],"right":["右1","右2",...],"links":[2,0,1]}
     left 与 right 长度相同（3～5）；links[i] 表示 left[i] 对应的 right 下标。
4. 难度：{{difficulty}}（easy | normal | hard），严格按档出题：
   - easy（简单）：**禁止 blank（填空题）**，只能用 choice 与 match。以认词/释义为主；choice 可用「词→义」或「义→词」；match 可为「英文词 ↔ 中文释义」。少做近义/形近辨析。
   - normal（普通）：认用混合，可用 choice / blank / match。约一半题可认词/释义，其余为简短语境或轻量用法；blank 答案仍优先为英文词；干扰项可略近义，但不必刁钻。
   - hard（困难）：侧重用法/辨析/情境产出，可用 choice / blank / match。blank（词量允许时至少一半）用英文语境挖空，答案为目标英文词；choice 考用法正误、近义/形近辨析；match 左侧为细微场景/用法提示。禁止机械「词↔义」互译与「X 是什么意思？」+ 无关选项。
5. 每词尽量只考一次；优先产出英文词（尤其 normal / hard）。
6. 词表字段：word / translation / phonetic? / note? / pageTitle? / context?。有 note 或 context 时优先改编进题干（可改写，勿原样剧透答案词）；无语境时自造自然短句。
7. 出题方向：{{promptLang}}
   - en：题干以英文为主（语境/用法）；easy 档题干可用中英混合
   - zh：题干可用中文场景，但 blank 的 answer 仍优先为英文词
8. 干扰项要合理；正确答案必须对应词表中的目标词，不要引入词表外的「正确对应」当答案。

词表（JSON）：
{{words}}`;

export const DEFAULT_SETTINGS = {
  /** 感触高亮色 */
  ideaHighlightColor: "#ffcc00",
  /** 感触高亮风格：fill = 背景填充；underline = 下划线 */
  ideaHighlightStyle: "fill",
  /** 单词高亮色 */
  wordHighlightColor: "#0000ff",
  /** 单词高亮风格：fill = 背景填充；underline = 下划线 */
  wordHighlightStyle: "fill",
  /** 单词高亮匹配：exact = 整词精确；variant = 双向词形变体 */
  wordMatchMode: "variant",
  /** 高亮黑名单：这些 host（及子域）不渲染感触/单词高亮 */
  highlightHostBlacklist: [],
  /** 页面级高亮黑名单：host+pathname（忽略 query/hash） */
  highlightPageBlacklist: [],
  /** API key（仅本地） */
  llmApiKey: "",
  /** Chat model name */
  llmModel: "deepseek-chat",
  /** OpenAI-compatible base URL */
  llmBaseUrl: "https://api.deepseek.com",
  /**
   * DeepSeek thinking / reasoning_effort.
   * off = thinking disabled; low | high | max = enabled with that effort.
   */
  llmReasoningEffort: "off",
  /** Lookup prompt template; must contain {{word}} */
  llmLookupPrompt: DEFAULT_LLM_LOOKUP_PROMPT,
  /** Quiz generation prompt; should contain {{words}}, {{promptLang}}, and {{difficulty}} */
  llmQuizPrompt: DEFAULT_LLM_QUIZ_PROMPT
};

const HEX_RE = /^#([0-9a-fA-F]{6})$/;

export function normalizeHexColor(value, fallback) {
  const raw = String(value || "").trim();
  if (HEX_RE.test(raw)) return raw.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toLowerCase()}`;
  return fallback;
}

export function normalizeWordMatchMode(value) {
  return value === "exact" ? "exact" : "variant";
}

/** Highlight visual style: fill | underline */
export function normalizeHighlightStyle(value) {
  return value === "underline" ? "underline" : "fill";
}

/** Per-word match: inherit | exact | variant */
export function normalizeEntryMatchMode(value) {
  if (value === "exact" || value === "variant") return value;
  return "inherit";
}

export function normalizeLlmModel(value) {
  const v = String(value || "").trim();
  return v || DEFAULT_SETTINGS.llmModel;
}

export function normalizeLlmBaseUrl(value) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  if (!raw) return DEFAULT_SETTINGS.llmBaseUrl;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") {
      return DEFAULT_SETTINGS.llmBaseUrl;
    }
    return u.origin + (u.pathname === "/" ? "" : u.pathname.replace(/\/+$/, ""));
  } catch (e) {
    return DEFAULT_SETTINGS.llmBaseUrl;
  }
}

/** DeepSeek reasoning: off | low | high | max */
export function normalizeLlmReasoningEffort(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "low" || v === "high" || v === "max") return v;
  if (v === "off" || v === "disabled" || v === "none") return "off";
  // legacy / aliases
  if (v === "medium" || v === "xhigh") return "high";
  return DEFAULT_SETTINGS.llmReasoningEffort;
}

export function normalizeLlmLookupPrompt(value) {
  const raw = String(value == null ? "" : value);
  if (!raw.trim()) return DEFAULT_LLM_LOOKUP_PROMPT;
  const LEGACY_LLM_LOOKUP_PROMPT = `你是英语词典助手。请为单词或短语「{{word}}」给出音标与中文释义。

要求：
1. 只输出一个 JSON 对象，不要 markdown 代码块，不要其它说明文字。
2. JSON 格式严格为：{"phonetic":"...","translation":"..."}
3. phonetic 使用 IPA，两侧可带斜杠，如 /ˈwɜːrd/；若无法确定则用空字符串。
4. translation 为简洁中文释义（可含词性），多个义项用分号分隔。`;
  if (raw.trim() === LEGACY_LLM_LOOKUP_PROMPT.trim()) return DEFAULT_LLM_LOOKUP_PROMPT;
  return raw;
}

export function normalizeLlmQuizPrompt(value) {
  const raw = String(value == null ? "" : value);
  if (!raw.trim()) return DEFAULT_LLM_QUIZ_PROMPT;
  return raw;
}

/**
 * Parse one blacklist line into a hostname, or null if empty/invalid/comment.
 * Accepts bare hosts or full URLs.
 */
export function parseHighlightHostLine(line) {
  let raw = String(line || "").trim();
  if (!raw || raw.startsWith("#")) return null;
  if (/^https?:\/\//i.test(raw) || raw.includes("/")) {
    try {
      const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      raw = new URL(withProto).hostname;
    } catch (e) {
      return null;
    }
  }
  raw = raw.replace(/:\d+$/, "").replace(/\.+$/, "").toLowerCase();
  if (!raw || raw.includes(" ")) return null;
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i.test(raw)) {
    return null;
  }
  return raw;
}

/** Normalize blacklist from string[] or multiline text → deduped hostnames. */
export function normalizeHighlightHostBlacklist(value) {
  let lines;
  if (Array.isArray(value)) {
    lines = value.map((v) => String(v == null ? "" : v));
  } else if (typeof value === "string") {
    lines = value.split(/\r?\n/);
  } else {
    return [];
  }
  const seen = new Set();
  const out = [];
  for (const line of lines) {
    const host = parseHighlightHostLine(line);
    if (!host || seen.has(host)) continue;
    seen.add(host);
    out.push(host);
  }
  return out;
}

/**
 * @param {string} hostname
 * @param {string[]} list
 */
export function isHostInHighlightBlacklist(hostname, list) {
  const host = String(hostname || "")
    .replace(/:\d+$/, "")
    .replace(/\.+$/, "")
    .toLowerCase();
  if (!host || !Array.isArray(list) || !list.length) return false;
  for (const entry of list) {
    const e = String(entry || "")
      .replace(/:\d+$/, "")
      .replace(/\.+$/, "")
      .toLowerCase();
    if (!e) continue;
    if (host === e || host.endsWith(`.${e}`)) return true;
  }
  return false;
}

/** Strip www. / port; align with content samePage host compare. */
export function normalizePageHost(host) {
  return String(host || "")
    .replace(/:\d+$/, "")
    .replace(/\.+$/, "")
    .replace(/^www\./i, "")
    .toLowerCase();
}

/** Collapse trailing slash except root `/`. */
export function normalizePagePathname(pathname) {
  let p = String(pathname || "/");
  if (!p.startsWith("/")) p = `/${p}`;
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

/**
 * Canonical page key: `host/path` (host without www; path normalized).
 * @returns {string|null}
 */
export function pageKeyFromUrl(url) {
  if (!url) return null;
  try {
    const raw = String(url).trim();
    if (!raw) return null;
    const withProto = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw) ? raw : `https://${raw}`;
    const u = new URL(withProto);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const host = normalizePageHost(u.hostname);
    if (!host) return null;
    return host + normalizePagePathname(u.pathname);
  } catch (e) {
    return null;
  }
}

/**
 * Parse one page-blacklist line into a page key, or null.
 * Accepts full URLs or `host/path`.
 */
export function parseHighlightPageLine(line) {
  let raw = String(line || "").trim();
  if (!raw || raw.startsWith("#")) return null;
  return pageKeyFromUrl(raw);
}

/** Normalize page blacklist from string[] or multiline text → deduped page keys. */
export function normalizeHighlightPageBlacklist(value) {
  let lines;
  if (Array.isArray(value)) {
    lines = value.map((v) => String(v == null ? "" : v));
  } else if (typeof value === "string") {
    lines = value.split(/\r?\n/);
  } else {
    return [];
  }
  const seen = new Set();
  const out = [];
  for (const line of lines) {
    const key = parseHighlightPageLine(line);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/**
 * @param {string} pageKeyOrUrl canonical key or URL
 * @param {string[]} list
 */
export function isPageInHighlightBlacklist(pageKeyOrUrl, list) {
  if (!Array.isArray(list) || !list.length) return false;
  const raw = String(pageKeyOrUrl || "").trim();
  if (!raw) return false;
  const key = pageKeyFromUrl(raw) || pageKeyFromUrl(`https://${raw.replace(/^\/+/, "")}`);
  if (!key) return false;
  for (const entry of list) {
    if (String(entry || "") === key) return true;
  }
  return false;
}

export function normalizeSettings(input) {
  const src = input && typeof input === "object" ? input : {};
  return {
    ideaHighlightColor: normalizeHexColor(
      src.ideaHighlightColor,
      DEFAULT_SETTINGS.ideaHighlightColor
    ),
    ideaHighlightStyle: normalizeHighlightStyle(src.ideaHighlightStyle),
    wordHighlightColor: normalizeHexColor(
      src.wordHighlightColor,
      DEFAULT_SETTINGS.wordHighlightColor
    ),
    wordHighlightStyle: normalizeHighlightStyle(src.wordHighlightStyle),
    wordMatchMode: normalizeWordMatchMode(src.wordMatchMode),
    highlightHostBlacklist: normalizeHighlightHostBlacklist(src.highlightHostBlacklist),
    highlightPageBlacklist: normalizeHighlightPageBlacklist(src.highlightPageBlacklist),
    llmApiKey: typeof src.llmApiKey === "string" ? src.llmApiKey : "",
    llmModel: normalizeLlmModel(src.llmModel),
    llmBaseUrl: normalizeLlmBaseUrl(src.llmBaseUrl),
    llmReasoningEffort: normalizeLlmReasoningEffort(src.llmReasoningEffort),
    llmLookupPrompt: normalizeLlmLookupPrompt(src.llmLookupPrompt),
    llmQuizPrompt: normalizeLlmQuizPrompt(src.llmQuizPrompt)
  };
}

export function mergeSettings(base, patch) {
  return normalizeSettings({ ...(base || DEFAULT_SETTINGS), ...(patch || {}) });
}

/** Settings safe to send to content scripts (no API key). */
export function settingsForContent(settings) {
  const s = normalizeSettings(settings);
  return { ...s, llmApiKey: "" };
}

/** Default values for general (non-LLM) settings only. */
export function generalSettingsDefaults() {
  return {
    ideaHighlightColor: DEFAULT_SETTINGS.ideaHighlightColor,
    ideaHighlightStyle: DEFAULT_SETTINGS.ideaHighlightStyle,
    wordHighlightColor: DEFAULT_SETTINGS.wordHighlightColor,
    wordHighlightStyle: DEFAULT_SETTINGS.wordHighlightStyle,
    wordMatchMode: DEFAULT_SETTINGS.wordMatchMode,
    highlightHostBlacklist: [...DEFAULT_SETTINGS.highlightHostBlacklist],
    highlightPageBlacklist: [...DEFAULT_SETTINGS.highlightPageBlacklist]
  };
}

/** Default values for LLM connection settings (no prompts). */
export function llmSettingsDefaults() {
  return {
    llmApiKey: DEFAULT_SETTINGS.llmApiKey,
    llmModel: DEFAULT_SETTINGS.llmModel,
    llmBaseUrl: DEFAULT_SETTINGS.llmBaseUrl,
    llmReasoningEffort: DEFAULT_SETTINGS.llmReasoningEffort
  };
}

/** Default values for lookup / quiz prompt settings. */
export function promptSettingsDefaults() {
  return {
    llmLookupPrompt: DEFAULT_SETTINGS.llmLookupPrompt,
    llmQuizPrompt: DEFAULT_SETTINGS.llmQuizPrompt
  };
}

/** Parse #rrggbb → { r, g, b }. */
export function hexToRgb(hex) {
  const normalized = normalizeHexColor(hex, "#000000");
  const n = parseInt(normalized.slice(1), 16);
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255
  };
}

/**
 * Build in-page highlight CSS from settings.
 * Safe to inject into content-script <style>.
 */
export function buildHighlightCss(settings) {
  const s = normalizeSettings(settings);
  const idea = hexToRgb(s.ideaHighlightColor);
  const word = hexToRgb(s.wordHighlightColor);
  const ideaFill = s.ideaHighlightStyle !== "underline";
  const wordFill = s.wordHighlightStyle !== "underline";

  const ideaRules = ideaFill
    ? `
    .rc-highlight {
      background: rgba(${idea.r}, ${idea.g}, ${idea.b}, 0.28);
      border-radius: 2px;
      cursor: pointer;
      box-shadow: 0 0 0 1px rgba(${idea.r}, ${idea.g}, ${idea.b}, 0.28);
    }
    .rc-highlight:hover {
      background: rgba(${idea.r}, ${idea.g}, ${idea.b}, 0.42);
    }`
    : `
    .rc-highlight {
      background: transparent;
      border-radius: 0;
      cursor: pointer;
      box-shadow: none;
      border-bottom: 2px solid rgba(${idea.r}, ${idea.g}, ${idea.b}, 0.9);
      padding-bottom: 1px;
    }
    .rc-highlight:hover {
      border-bottom-color: rgba(${idea.r}, ${idea.g}, ${idea.b}, 1);
    }`;

  const wordRules = wordFill
    ? `
    .rc-word-highlight {
      background: rgba(${word.r}, ${word.g}, ${word.b}, 0.22);
      border-radius: 2px;
      cursor: pointer;
      box-shadow: 0 0 0 1px rgba(${word.r}, ${word.g}, ${word.b}, 0.22);
    }
    .rc-word-highlight:hover {
      background: rgba(${word.r}, ${word.g}, ${word.b}, 0.36);
    }`
    : `
    .rc-word-highlight {
      background: transparent;
      border-radius: 0;
      cursor: pointer;
      box-shadow: none;
      border-bottom: 2px solid rgba(${word.r}, ${word.g}, ${word.b}, 0.9);
      padding-bottom: 1px;
    }
    .rc-word-highlight:hover {
      border-bottom-color: rgba(${word.r}, ${word.g}, ${word.b}, 1);
    }`;

  return `${ideaRules}${wordRules}`;
}
