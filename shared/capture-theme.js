/**
 * In-page capture UI theme (Apple × 日系 · 和紙 / 墨 / 藍).
 * Loaded before content.js as a classic script (sets globalThis.RcCaptureTheme).
 * Values must stay in sync with :root tokens in styles/tokens.css.
 */
(function (g) {
  const ink = "#1d1d1f";
  const sumi = "#6e6e73";
  const thin = "#86868b";
  const line = "#e5e5ea";
  const paper = "#ffffff";
  const paperDeep = "#f5f5f7";
  const accent = "#3f5f8a";
  const accentPress = "#355278";
  const warm = "#c4923a";
  const vermilion = "#c45c4a";
  const ok = "#5a8f6b";
  const radius = "6px";
  const radiusLg = "10px";
  const sans =
    '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif';
  const serif =
    '"Hiragino Mincho ProN", "Songti SC", "STSong", "Noto Serif CJK SC", "SimSun", serif';

  g.RcCaptureTheme = {
    highlightCss: `
    .rc-highlight {
      background: color-mix(in srgb, var(--rc-idea-hl, ${warm}) 28%, transparent);
      border-radius: 2px;
      cursor: pointer;
      box-shadow: inset 0 -1px 0 color-mix(in srgb, var(--rc-idea-hl, ${warm}) 35%, transparent);
    }
    .rc-highlight:hover {
      background: color-mix(in srgb, var(--rc-idea-hl, ${warm}) 42%, transparent);
    }
    html[data-rc-idea-style="underline"] .rc-highlight {
      background: transparent;
      border-radius: 0;
      box-shadow: none;
      border-bottom: 2px solid color-mix(in srgb, var(--rc-idea-hl, ${warm}) 90%, transparent);
      padding-bottom: 1px;
    }
    html[data-rc-idea-style="underline"] .rc-highlight:hover {
      background: transparent;
      border-bottom-color: var(--rc-idea-hl, ${warm});
    }
    .rc-word-highlight {
      background: color-mix(in srgb, var(--rc-word-hl, ${accent}) 18%, transparent);
      border-radius: 2px;
      cursor: pointer;
    }
    .rc-word-highlight:hover {
      background: color-mix(in srgb, var(--rc-word-hl, ${accent}) 30%, transparent);
    }
    html[data-rc-word-style="underline"] .rc-word-highlight {
      background: transparent;
      border-radius: 0;
      box-shadow: none;
      border-bottom: 2px solid color-mix(in srgb, var(--rc-word-hl, ${accent}) 90%, transparent);
      padding-bottom: 1px;
    }
    html[data-rc-word-style="underline"] .rc-word-highlight:hover {
      background: transparent;
      border-bottom-color: var(--rc-word-hl, ${accent});
    }
  `,

    floatBtnCss: `
    #rc-float-bar {
      position: fixed;
      z-index: 2147483646;
      display: none;
      flex-direction: row;
      align-items: center;
      gap: 6px;
      padding: 0;
      margin: 0;
      border: none;
      background: transparent;
      box-shadow: none;
    }
    #rc-float-bar.rc-show {
      display: flex;
    }
    #rc-float-bar .rc-float-item {
      width: 28px;
      height: 28px;
      border-radius: 4px;
      background: ${paper};
      border: 1px solid #c7c7cc;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: ${ink};
      line-height: 1;
      padding: 0;
      margin: 0;
      font-family: ${sans};
      font-size: 13px;
      font-weight: 600;
      font-style: normal;
      letter-spacing: 0.04em;
      transition: color 0.12s, border-color 0.12s, background 0.12s, box-shadow 0.12s;
    }
    #rc-float-bar .rc-float-item:hover {
      border-color: ${accent};
      background: ${paperDeep};
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
    }
    #rc-float-bar .rc-float-item[data-action="word"] {
      font-size: 12px;
      letter-spacing: -0.02em;
    }
    #rc-float-bar .rc-float-letter {
      display: block;
      line-height: 1;
      pointer-events: none;
      user-select: none;
    }
  `,

    overlayCss: `
    #rc-overlay {
      position: fixed;
      top: 20px;
      left: 20px;
      z-index: 2147483647;
      width: 360px;
      max-width: calc(100vw - 16px);
      background: ${paper};
      border: 1px solid ${line};
      border-radius: ${radiusLg};
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08), 0 2px 6px rgba(0, 0, 0, 0.05);
      font-family: ${sans};
      font-size: 14px;
      line-height: 1.6;
      letter-spacing: 0.01em;
      color: ${ink};
      overflow: hidden;
      box-sizing: border-box;
      opacity: 0;
      transform: translateY(6px);
      transition: opacity 0.18s ease, transform 0.18s ease;
    }
    #rc-overlay.rc-show {
      opacity: 1;
      transform: translateY(0);
    }
    #rc-overlay *, #rc-overlay *::before, #rc-overlay *::after {
      box-sizing: border-box;
    }
    #rc-overlay .rc-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px 0;
      font-weight: 500;
      color: ${thin};
      font-size: 11px;
      letter-spacing: 0.12em;
      background: transparent;
      cursor: grab;
      user-select: none;
      touch-action: none;
    }
    #rc-overlay.rc-dragging .rc-head {
      cursor: grabbing;
    }
    #rc-overlay.rc-dragging {
      transition: none;
      opacity: 1;
      transform: none;
    }
    #rc-overlay .rc-close {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      margin: 0;
      padding: 0;
      background: transparent;
      border: none;
      border-radius: ${radius};
      cursor: pointer;
      color: ${thin};
      font-size: 18px;
      font-weight: 400;
      line-height: 1;
      font-family: inherit;
    }
    #rc-overlay .rc-close:hover {
      color: ${ink};
      background: rgba(0, 0, 0, 0.05);
    }
    #rc-overlay .rc-ctx {
      margin: 10px 16px 0;
      padding: 0 0 0 12px;
      background: transparent;
      border-left: 2px solid ${accent};
      border-radius: 0;
      font-size: 13px;
      color: ${sumi};
      line-height: 1.7;
      max-height: 120px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }
    #rc-overlay .rc-ctx .rc-q {
      display: block;
      color: ${thin};
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.08em;
      margin: 0 0 4px;
    }
    #rc-overlay .rc-shot {
      margin: 10px 16px 0;
      border-radius: ${radius};
      overflow: hidden;
      border: 1px solid ${line};
      background: ${paperDeep};
      max-height: 180px;
    }
    #rc-overlay .rc-shot img {
      display: block;
      width: 100%;
      height: auto;
      max-height: 180px;
      object-fit: contain;
    }
    #rc-overlay textarea.rc-input {
      display: block;
      width: calc(100% - 32px);
      max-width: calc(100% - 32px);
      margin: 10px 16px 0;
      border: 1px solid ${line};
      border-radius: ${radius};
      padding: 10px 12px;
      font-size: 15px;
      font-family: ${serif};
      line-height: 1.65;
      color: ${ink};
      background: rgba(255, 255, 255, 0.55);
      resize: vertical;
      min-height: 88px;
      outline: none;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    #rc-overlay textarea.rc-input:focus {
      border-color: ${accent};
      box-shadow: 0 0 0 3px rgba(63, 95, 138, 0.12);
    }
    #rc-overlay .rc-lookup {
      margin: 10px 16px 0;
    }
    #rc-overlay .rc-lookup-status {
      font-size: 12px;
      letter-spacing: 0.06em;
      color: ${thin};
      padding: 4px 0;
    }
    #rc-overlay .rc-lookup-fields {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    #rc-overlay .rc-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin: 0;
    }
    #rc-overlay .rc-field > span {
      font-size: 11px;
      letter-spacing: 0.1em;
      color: ${thin};
    }
    #rc-overlay .rc-field input {
      width: 100%;
      border: 1px solid ${line};
      border-radius: ${radius};
      padding: 8px 10px;
      font-size: 13px;
      font-family: ${sans};
      color: ${ink};
      background: rgba(255, 255, 255, 0.55);
      outline: none;
    }
    #rc-overlay .rc-field input:focus {
      border-color: ${accent};
      box-shadow: 0 0 0 3px rgba(63, 95, 138, 0.12);
    }
    #rc-overlay .rc-lookup-error {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      font-size: 12px;
      color: ${sumi};
      padding: 4px 0;
    }
    #rc-overlay .rc-lookup-retry {
      border: 1px solid ${line};
      background: transparent;
      color: ${ink};
      border-radius: ${radius};
      padding: 3px 8px;
      font-size: 11px;
      letter-spacing: 0.06em;
      cursor: pointer;
      font-family: inherit;
    }
    #rc-overlay .rc-lookup-retry:hover {
      border-color: ${accent};
      background: rgba(63, 95, 138, 0.08);
    }
    #rc-overlay .rc-match {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      margin: 10px 16px 0;
      font-size: 11px;
      color: ${sumi};
    }
    #rc-overlay .rc-match-label {
      letter-spacing: 0.08em;
      color: ${thin};
      margin-right: 2px;
    }
    #rc-overlay .rc-match-opt {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      border: 1px solid ${line};
      border-radius: ${radius};
      cursor: pointer;
      user-select: none;
    }
    #rc-overlay .rc-match-opt:has(input:checked) {
      border-color: ${accent};
      color: ${accent};
      background: rgba(63, 95, 138, 0.1);
    }
    #rc-overlay .rc-match-opt input {
      margin: 0;
    }
    #rc-overlay .rc-actions {
      display: flex;
      gap: 8px;
      padding: 14px 16px 16px;
    }
    #rc-overlay .rc-actions button {
      flex: 1;
      border: 1px solid ${line};
      background: transparent;
      color: ${sumi};
      border-radius: ${radius};
      padding: 8px 0;
      font-size: 12px;
      letter-spacing: 0.08em;
      cursor: pointer;
      font-family: inherit;
      transition: background 0.15s, color 0.15s, border-color 0.15s;
    }
    #rc-overlay .rc-actions button:hover {
      color: ${ink};
      border-color: ${line};
      background: rgba(0, 0, 0, 0.05);
    }
    #rc-overlay .rc-actions button.rc-save {
      background: ${accent};
      border-color: ${accent};
      color: ${paper};
      font-weight: 500;
    }
    #rc-overlay .rc-actions button.rc-save:hover {
      background: ${accentPress};
      border-color: ${accentPress};
    }
    #rc-overlay .rc-actions button.rc-learn {
      flex: 0 0 auto;
      min-width: 64px;
      color: ${ok};
      border-color: rgba(90, 143, 107, 0.4);
    }
    #rc-overlay .rc-actions button.rc-learn:hover {
      color: #fff;
      background: ${ok};
      border-color: ${ok};
    }
    #rc-overlay .rc-actions button.rc-learn.is-learned {
      color: #fff;
      border-color: ${ok};
      background: ${ok};
    }
    #rc-overlay .rc-actions button.rc-learn.is-learned:hover {
      color: #fff;
      background: #4d7c5c;
      border-color: #4d7c5c;
    }
    #rc-overlay .rc-actions button.rc-delete {
      flex: 0 0 auto;
      min-width: 64px;
      color: ${vermilion};
      border-color: rgba(196, 92, 74, 0.4);
    }
    #rc-overlay .rc-actions button.rc-delete:hover {
      color: #fff;
      background: ${vermilion};
      border-color: ${vermilion};
    }
    #rc-overlay .rc-toast {
      position: absolute;
      left: 50%;
      bottom: 16px;
      transform: translateX(-50%) translateY(6px);
      background: ${ink};
      color: ${paper};
      padding: 6px 14px;
      border-radius: ${radius};
      font-size: 12px;
      letter-spacing: 0.06em;
      opacity: 0;
      transition: opacity 0.2s, transform 0.2s;
      pointer-events: none;
    }
    #rc-overlay .rc-toast.show {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  `,

    regionCss: `
    #rc-region-mask {
      position: fixed;
      inset: 0;
      z-index: 2147483646;
      cursor: crosshair;
      user-select: none;
      background: rgba(0, 0, 0, 0.2);
    }
    #rc-region-mask .rc-region-tip {
      position: fixed;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      background: ${paper};
      color: ${sumi};
      border: 1px solid ${line};
      font: 12px/1.4 ${sans};
      letter-spacing: 0.06em;
      padding: 8px 14px;
      border-radius: ${radius};
      pointer-events: none;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
    }
    #rc-region-mask .rc-region-box {
      position: fixed;
      border: 1px solid ${accent};
      background: rgba(255, 252, 247, 0.08);
      box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.36);
      display: none;
      pointer-events: none;
    }
  `
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
