/**
 * In-page capture UI theme (Bauhaus · 白底黑框 / 红黄蓝原色).
 * Loaded before content.js as a classic script (sets globalThis.RcCaptureTheme).
 * Values must stay in sync with :root tokens in styles/tokens.css.
 */
(function (g) {
  const ink = "#000000";
  const sumi = "#000000";
  const thin = "#000000";
  const line = "#000000";
  const paper = "#ffffff";
  const paperDeep = "#ffffff";
  const accent = "#0000ff";
  const accentPress = "#0000ff";
  const warm = "#ffcc00";
  const vermilion = "#ff0000";
  const ok = "#0000ff";
  const radius = "0";
  const radiusLg = "0";
  const sans =
    '"Helvetica Neue", Helvetica, Arial, "PingFang SC", "Heiti SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
  const serif = sans;

  g.RcCaptureTheme = {
    highlightCss: `
    .rc-highlight {
      background: color-mix(in srgb, var(--rc-idea-hl, ${warm}) 32%, transparent);
      border-radius: 0;
      cursor: pointer;
      box-shadow: inset 0 -3px 0 color-mix(in srgb, var(--rc-idea-hl, ${warm}) 55%, transparent);
    }
    .rc-highlight:hover {
      background: color-mix(in srgb, var(--rc-idea-hl, ${warm}) 60%, transparent);
    }
    html[data-rc-idea-style="underline"] .rc-highlight {
      background: transparent;
      border-radius: 0;
      box-shadow: none;
      border-bottom: 3px solid var(--rc-idea-hl, ${warm});
      padding-bottom: 1px;
    }
    html[data-rc-idea-style="underline"] .rc-highlight:hover {
      background: transparent;
      border-bottom-color: var(--rc-idea-hl, ${warm});
    }
    .rc-word-highlight {
      background: color-mix(in srgb, var(--rc-word-hl, ${accent}) 26%, transparent);
      border-radius: 0;
      cursor: pointer;
      box-shadow: inset 0 -3px 0 color-mix(in srgb, var(--rc-word-hl, ${accent}) 40%, transparent);
    }
    .rc-word-highlight:hover {
      background: color-mix(in srgb, var(--rc-word-hl, ${accent}) 45%, transparent);
    }
    html[data-rc-word-style="underline"] .rc-word-highlight {
      background: transparent;
      border-radius: 0;
      box-shadow: none;
      border-bottom: 3px solid var(--rc-word-hl, ${accent});
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
      width: 30px;
      height: 30px;
      border-radius: 0;
      background: ${paper};
      border: 2px solid ${ink};
      box-shadow: none;
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
      font-weight: 900;
      font-style: normal;
      letter-spacing: 0.04em;
      transition: background-color 0.12s ease-out, color 0.12s ease-out, border-color 0.12s ease-out;
    }
    #rc-float-bar .rc-float-item:hover {
      border-color: ${ink};
      background: ${ink};
      color: ${paper};
    }
    #rc-float-bar .rc-float-item[data-action="idea"] {
      background: ${warm};
      color: ${ink};
    }
    #rc-float-bar .rc-float-item[data-action="idea"]:hover {
      background: ${vermilion};
      color: ${paper};
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
      border: 4px solid ${ink};
      border-radius: ${radiusLg};
      box-shadow: none;
      font-family: ${sans};
      font-size: 14px;
      line-height: 1.6;
      letter-spacing: 0.01em;
      color: ${ink};
      overflow: hidden;
      box-sizing: border-box;
      opacity: 0;
      transform: translateY(6px);
      transition: opacity 0.15s ease-out, transform 0.15s ease-out;
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
      padding: 12px 12px 0;
      font-weight: 900;
      color: ${ink};
      font-size: 11px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
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
      border: 2px solid ${ink};
      border-radius: 0;
      cursor: pointer;
      color: ${ink};
      font-size: 16px;
      font-weight: 900;
      line-height: 1;
      font-family: inherit;
      transition: background-color 0.12s ease-out, color 0.12s ease-out;
    }
    #rc-overlay .rc-close:hover {
      color: ${paper};
      background: ${ink};
    }
    #rc-overlay .rc-ctx {
      margin: 10px 16px 0;
      padding: 4px 0 10px;
      background: transparent;
      border: 0;
      border-radius: 0;
      font-size: 13px;
      font-weight: 700;
      color: ${ink};
      line-height: 1.7;
      max-height: 120px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }
    #rc-overlay .rc-ctx .rc-q {
      display: block;
      color: ${ink};
      font-size: 10px;
      font-weight: 900;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      margin: 0 0 4px;
    }
    #rc-overlay .rc-shot {
      margin: 10px 16px 0;
      border-radius: 0;
      overflow: hidden;
      border: 2px solid ${ink};
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
      border: 2px solid ${ink};
      border-radius: 0;
      padding: 10px 12px;
      font-size: 14px;
      font-weight: 700;
      font-family: ${serif};
      line-height: 1.65;
      color: ${ink};
      background: ${paper};
      resize: vertical;
      min-height: 88px;
      outline: none;
      transition: background-color 0.15s ease-out, border-color 0.15s ease-out;
    }
    #rc-overlay textarea.rc-input:focus {
      border-color: ${ink};
      background: ${paper};
      box-shadow: 0 0 0 3px ${warm};
    }
    #rc-overlay .rc-lookup {
      margin: 10px 16px 0;
    }
    #rc-overlay .rc-lookup-status {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.06em;
      color: ${ink};
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
      font-size: 10px;
      font-weight: 900;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: ${ink};
    }
    #rc-overlay .rc-field input {
      width: 100%;
      border: 2px solid ${ink};
      border-radius: 0;
      padding: 8px 10px;
      font-size: 13px;
      font-weight: 700;
      font-family: ${sans};
      color: ${ink};
      background: ${paper};
      outline: none;
      transition: background-color 0.15s ease-out;
    }
    #rc-overlay .rc-field input:focus {
      background: ${paper};
      box-shadow: 0 0 0 3px ${warm};
    }
    #rc-overlay .rc-readonly {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      min-height: 33px;
      font-size: 13px;
      font-weight: 700;
      font-family: ${sans};
      color: ${ink};
      user-select: text;
    }
    #rc-overlay .rc-readonly:empty::before {
      content: "—";
      opacity: 0.45;
    }
    #rc-overlay .rc-field-row {
      display: flex;
      gap: 6px;
    }
    #rc-overlay .rc-field-row input {
      flex: 1;
      min-width: 0;
    }
    #rc-overlay .rc-speak {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 34px;
      border: 2px solid ${ink};
      background: transparent;
      color: ${ink};
      border-radius: 0;
      cursor: pointer;
      transition: background-color 0.15s ease-out;
    }
    #rc-overlay .rc-speak:hover {
      background: ${warm};
    }
    #rc-overlay .rc-speak svg {
      width: 15px;
      height: 15px;
    }
    #rc-overlay .rc-lookup-error {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      font-size: 12px;
      font-weight: 700;
      color: ${ink};
      padding: 4px 0;
    }
    #rc-overlay .rc-lookup-retry {
      border: 2px solid ${ink};
      background: transparent;
      color: ${ink};
      border-radius: 0;
      padding: 3px 8px;
      font-size: 11px;
      font-weight: 900;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      cursor: pointer;
      font-family: inherit;
      transition: background-color 0.15s ease-out;
    }
    #rc-overlay .rc-lookup-retry:hover {
      background: ${warm};
    }
    #rc-overlay .rc-match {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      margin: 10px 16px 0;
      font-size: 11px;
      font-weight: 700;
      color: ${ink};
    }
    #rc-overlay .rc-match-label {
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: ${ink};
      margin-right: 2px;
    }
    #rc-overlay .rc-match-opt {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      border: 2px solid ${ink};
      border-radius: 0;
      cursor: pointer;
      user-select: none;
      transition: background-color 0.15s ease-out;
    }
    #rc-overlay .rc-match-opt:hover {
      background: ${warm};
    }
    #rc-overlay .rc-match-opt:has(input:checked) {
      border-color: ${ink};
      color: ${ink};
      background: ${warm};
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
      border: 3px solid ${ink};
      background: transparent;
      color: ${ink};
      border-radius: 0;
      padding: 8px 0;
      font-size: 12px;
      font-weight: 900;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      cursor: pointer;
      font-family: inherit;
      transition: background-color 0.15s ease-out, color 0.15s ease-out, border-color 0.15s ease-out;
    }
    #rc-overlay .rc-actions button:hover {
      background: ${warm};
    }
    #rc-overlay .rc-actions button.rc-save {
      background: ${ink};
      border-color: ${ink};
      color: ${paper};
    }
    #rc-overlay .rc-actions button.rc-save:hover {
      background: ${vermilion};
      border-color: ${ink};
      color: ${paper};
    }
    #rc-overlay .rc-actions button.rc-learn {
      flex: 0 0 auto;
      min-width: 64px;
      color: ${paper};
      background: ${accent};
      border-color: ${ink};
    }
    #rc-overlay .rc-actions button.rc-learn:hover {
      background: ${ink};
      color: ${paper};
    }
    #rc-overlay .rc-actions button.rc-learn.is-learned {
      color: ${paper};
      border-color: ${ink};
      background: ${accent};
    }
    #rc-overlay .rc-actions button.rc-learn.is-learned:hover {
      background: ${ink};
      border-color: ${ink};
    }
    #rc-overlay .rc-actions button.rc-delete {
      flex: 0 0 auto;
      min-width: 64px;
      color: ${ink};
      border-color: ${ink};
    }
    #rc-overlay .rc-actions button.rc-delete:hover {
      background: ${vermilion};
      color: ${paper};
    }
    #rc-overlay .rc-toast {
      position: absolute;
      left: 50%;
      bottom: 16px;
      transform: translateX(-50%) translateY(6px);
      background: ${ink};
      color: ${paper};
      padding: 7px 14px;
      border-radius: 0;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.06em;
      opacity: 0;
      transition: opacity 0.15s ease-out, transform 0.15s ease-out;
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
      background: rgba(0, 0, 0, 0.4);
    }
    #rc-region-mask .rc-region-tip {
      position: fixed;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      background: ${paper};
      color: ${ink};
      border: 2px solid ${ink};
      font: 700 12px/1.4 ${sans};
      letter-spacing: 0.06em;
      text-transform: uppercase;
      padding: 8px 14px;
      border-radius: 0;
      pointer-events: none;
      box-shadow: none;
    }
    #rc-region-mask .rc-region-box {
      position: fixed;
      border: 3px solid ${warm};
      background: rgba(255, 204, 0, 0.12);
      box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.42);
      display: none;
      pointer-events: none;
    }
  `
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
