/**
 * In-page capture UI theme (和紙).
 * Loaded before content.js as a classic script (sets globalThis.RcCaptureTheme).
 * Values must stay in sync with :root tokens in styles.css.
 */
(function (g) {
  const ink = "#1a1a1a";
  const sumi = "#5c5c5c";
  const thin = "#9a958c";
  const line = "#d8d2c8";
  const paper = "#f2f0eb";
  const paperDeep = "#e8e4db";
  const accent = "#3d5a80";
  const warm = "#c4a35a";
  const sans =
    '"PingFang SC", "Hiragino Sans", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
  const serif =
    '"Hiragino Mincho ProN", "Songti SC", "STSong", "SimSun", serif';

  g.RcCaptureTheme = {
    highlightCss: `
    .rc-highlight {
      background: color-mix(in srgb, var(--rc-idea-hl, ${warm}) 28%, transparent);
      border-radius: 2px;
      cursor: pointer;
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--rc-idea-hl, ${warm}) 28%, transparent);
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
      background: color-mix(in srgb, var(--rc-word-hl, ${accent}) 22%, transparent);
      border-radius: 2px;
      cursor: pointer;
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--rc-word-hl, ${accent}) 22%, transparent);
    }
    .rc-word-highlight:hover {
      background: color-mix(in srgb, var(--rc-word-hl, ${accent}) 36%, transparent);
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
      gap: 4px;
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
      width: 24px;
      height: 24px;
      border-radius: 3px;
      background: ${paper};
      border: 1px solid ${line};
      box-shadow: 0 1px 4px rgba(26, 26, 26, 0.08);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: ${ink};
      line-height: 1;
      padding: 0;
      margin: 0;
      font-family: ${serif};
      font-size: 13px;
      font-weight: 600;
      font-style: italic;
      letter-spacing: 0;
      transition: color 0.12s, border-color 0.12s, background 0.12s, box-shadow 0.12s;
    }
    #rc-float-bar .rc-float-item:hover {
      color: ${ink};
      border-color: ${warm};
      background: #f7f5f0;
      box-shadow: 0 2px 6px rgba(26, 26, 26, 0.1);
    }
    #rc-float-bar .rc-float-item[data-action="word"] {
      font-style: normal;
      font-size: 12px;
      letter-spacing: -0.02em;
    }
    #rc-float-bar .rc-float-item[data-action="word"]:hover {
      border-color: ${accent};
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
      border-radius: 4px;
      box-shadow: 0 10px 32px rgba(26, 26, 26, 0.12);
      font-family: ${sans};
      font-size: 14px;
      line-height: 1.6;
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
      padding: 10px 14px 0;
      font-weight: 500;
      color: ${thin};
      font-size: 11px;
      letter-spacing: 0.1em;
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
      border-radius: 2px;
      cursor: pointer;
      color: ${thin};
      font-size: 18px;
      font-weight: 400;
      line-height: 1;
      font-family: inherit;
    }
    #rc-overlay .rc-close:hover {
      color: ${ink};
      background: rgba(26, 26, 26, 0.05);
    }
    #rc-overlay .rc-ctx {
      margin: 10px 14px 0;
      padding: 0 0 0 12px;
      background: transparent;
      border-left: 1px solid ${accent};
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
      margin: 10px 14px 0;
      border-radius: 2px;
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
      width: calc(100% - 28px);
      max-width: calc(100% - 28px);
      margin: 10px 14px 0;
      border: 1px solid ${line};
      border-radius: 2px;
      padding: 10px 12px;
      font-size: 15px;
      font-family: ${serif};
      line-height: 1.65;
      color: ${ink};
      background: rgba(255, 255, 255, 0.45);
      resize: vertical;
      min-height: 88px;
      outline: none;
      transition: border-color 0.15s;
    }
    #rc-overlay textarea.rc-input:focus {
      border-color: ${ink};
    }
    #rc-overlay .rc-lookup {
      margin: 10px 14px 0;
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
      letter-spacing: 0.08em;
      color: ${thin};
    }
    #rc-overlay .rc-field input {
      width: 100%;
      border: 1px solid ${line};
      border-radius: 2px;
      padding: 8px 10px;
      font-size: 13px;
      font-family: ${sans};
      color: ${ink};
      background: rgba(255, 255, 255, 0.45);
      outline: none;
    }
    #rc-overlay .rc-field input:focus {
      border-color: ${ink};
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
      border-radius: 2px;
      padding: 3px 8px;
      font-size: 11px;
      letter-spacing: 0.06em;
      cursor: pointer;
      font-family: inherit;
    }
    #rc-overlay .rc-lookup-retry:hover {
      border-color: ${ink};
    }
    #rc-overlay .rc-match {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      margin: 10px 14px 0;
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
      border-radius: 2px;
      cursor: pointer;
      user-select: none;
    }
    #rc-overlay .rc-match-opt:has(input:checked) {
      border-color: ${ink};
      color: ${ink};
    }
    #rc-overlay .rc-match-opt input {
      margin: 0;
    }
    #rc-overlay .rc-actions {
      display: flex;
      gap: 8px;
      padding: 12px 14px 14px;
    }
    #rc-overlay .rc-actions button {
      flex: 1;
      border: 1px solid ${line};
      background: transparent;
      color: ${sumi};
      border-radius: 2px;
      padding: 7px 0;
      font-size: 12px;
      letter-spacing: 0.08em;
      cursor: pointer;
      font-family: inherit;
      transition: background 0.15s, color 0.15s, border-color 0.15s;
    }
    #rc-overlay .rc-actions button:hover {
      color: ${ink};
      border-color: ${ink};
      background: rgba(26, 26, 26, 0.03);
    }
    #rc-overlay .rc-actions button.rc-save {
      background: ${ink};
      border-color: ${ink};
      color: #f7f5f0;
      font-weight: 500;
    }
    #rc-overlay .rc-actions button.rc-save:hover {
      background: #2a2a2a;
      border-color: #2a2a2a;
    }
    #rc-overlay .rc-actions button.rc-delete {
      flex: 0 0 auto;
      min-width: 64px;
      color: #9b2226;
      border-color: rgba(155, 34, 38, 0.35);
    }
    #rc-overlay .rc-actions button.rc-delete:hover {
      color: #fff;
      background: #9b2226;
      border-color: #9b2226;
    }
    #rc-overlay .rc-toast {
      position: absolute;
      left: 50%;
      bottom: 16px;
      transform: translateX(-50%) translateY(6px);
      background: ${ink};
      color: #f7f5f0;
      padding: 6px 14px;
      border-radius: 2px;
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
      background: rgba(26, 26, 26, 0.22);
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
      border-radius: 2px;
      pointer-events: none;
      box-shadow: 0 4px 16px rgba(26, 26, 26, 0.1);
    }
    #rc-region-mask .rc-region-box {
      position: fixed;
      border: 1px solid ${ink};
      background: rgba(247, 245, 240, 0.08);
      box-shadow: 0 0 0 9999px rgba(26, 26, 26, 0.4);
      display: none;
      pointer-events: none;
    }
  `
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
