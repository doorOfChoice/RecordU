/** Global extension settings (chrome.storage.local). */

export const SETTINGS_KEY = "rc_settings";

export const DEFAULT_LLM_LOOKUP_PROMPT = `你是英语词典助手。请为单词或短语「{{word}}」给出音标与中文释义。

要求：
1. 只输出一个 JSON 对象，不要 markdown 代码块，不要其它说明文字。
2. JSON 格式严格为：{"phonetic":"...","translation":"..."}
3. phonetic 使用 IPA，两侧可带斜杠，如 /ˈwɜːrd/；若无法确定则用空字符串。
4. translation 为简洁中文释义（可含词性），多个义项用分号分隔。`;

export const DEFAULT_SETTINGS = {
  /** 感触高亮色 */
  ideaHighlightColor: "#c4a35a",
  /** 单词高亮色 */
  wordHighlightColor: "#3d5a80",
  /** 单词高亮匹配：exact = 整词精确；variant = 双向词形变体 */
  wordMatchMode: "variant",
  /** LLM provider id */
  llmProvider: "deepseek",
  /** API key（仅本地） */
  llmApiKey: "",
  /** Chat model name */
  llmModel: "deepseek-chat",
  /** OpenAI-compatible base URL */
  llmBaseUrl: "https://api.deepseek.com",
  /** Lookup prompt template; must contain {{word}} */
  llmLookupPrompt: DEFAULT_LLM_LOOKUP_PROMPT
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

/** Per-word match: inherit | exact | variant */
export function normalizeEntryMatchMode(value) {
  if (value === "exact" || value === "variant") return value;
  return "inherit";
}

export function normalizeLlmProvider(value) {
  const v = String(value || "").trim().toLowerCase();
  return v || DEFAULT_SETTINGS.llmProvider;
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

export function normalizeLlmLookupPrompt(value) {
  const raw = String(value == null ? "" : value);
  if (!raw.trim()) return DEFAULT_LLM_LOOKUP_PROMPT;
  return raw;
}

export function normalizeSettings(input) {
  const src = input && typeof input === "object" ? input : {};
  return {
    ideaHighlightColor: normalizeHexColor(
      src.ideaHighlightColor,
      DEFAULT_SETTINGS.ideaHighlightColor
    ),
    wordHighlightColor: normalizeHexColor(
      src.wordHighlightColor,
      DEFAULT_SETTINGS.wordHighlightColor
    ),
    wordMatchMode: normalizeWordMatchMode(src.wordMatchMode),
    llmProvider: normalizeLlmProvider(src.llmProvider),
    llmApiKey: typeof src.llmApiKey === "string" ? src.llmApiKey : "",
    llmModel: normalizeLlmModel(src.llmModel),
    llmBaseUrl: normalizeLlmBaseUrl(src.llmBaseUrl),
    llmLookupPrompt: normalizeLlmLookupPrompt(src.llmLookupPrompt)
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
    wordHighlightColor: DEFAULT_SETTINGS.wordHighlightColor,
    wordMatchMode: DEFAULT_SETTINGS.wordMatchMode
  };
}

/** Default values for LLM-related settings. */
export function llmSettingsDefaults() {
  return {
    llmProvider: DEFAULT_SETTINGS.llmProvider,
    llmApiKey: DEFAULT_SETTINGS.llmApiKey,
    llmModel: DEFAULT_SETTINGS.llmModel,
    llmBaseUrl: DEFAULT_SETTINGS.llmBaseUrl,
    llmLookupPrompt: DEFAULT_SETTINGS.llmLookupPrompt
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
  return `
    .rc-highlight {
      background: rgba(${idea.r}, ${idea.g}, ${idea.b}, 0.28);
      border-radius: 2px;
      cursor: pointer;
      box-shadow: 0 0 0 1px rgba(${idea.r}, ${idea.g}, ${idea.b}, 0.28);
    }
    .rc-highlight:hover {
      background: rgba(${idea.r}, ${idea.g}, ${idea.b}, 0.42);
    }
    .rc-word-highlight {
      background: rgba(${word.r}, ${word.g}, ${word.b}, 0.22);
      border-radius: 2px;
      cursor: pointer;
      box-shadow: 0 0 0 1px rgba(${word.r}, ${word.g}, ${word.b}, 0.22);
    }
    .rc-word-highlight:hover {
      background: rgba(${word.r}, ${word.g}, ${word.b}, 0.36);
    }
  `;
}
