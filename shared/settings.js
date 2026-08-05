/** Global extension settings (chrome.storage.local). */

export const SETTINGS_KEY = "rc_settings";

export const DEFAULT_SETTINGS = {
  /** 感触高亮色 */
  ideaHighlightColor: "#c4a35a",
  /** 单词高亮色 */
  wordHighlightColor: "#3d5a80"
};

const HEX_RE = /^#([0-9a-fA-F]{6})$/;

export function normalizeHexColor(value, fallback) {
  const raw = String(value || "").trim();
  if (HEX_RE.test(raw)) return raw.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toLowerCase()}`;
  return fallback;
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
    )
  };
}

export function mergeSettings(base, patch) {
  return normalizeSettings({ ...(base || DEFAULT_SETTINGS), ...(patch || {}) });
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
