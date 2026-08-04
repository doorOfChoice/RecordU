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
      background: rgba(196, 163, 90, 0.28);
      border-radius: 2px;
      cursor: pointer;
      box-shadow: 0 0 0 1px rgba(196, 163, 90, 0.28);
    }
    .rc-highlight:hover {
      background: rgba(196, 163, 90, 0.42);
    }
  `,

    floatBtnCss: `
    #rc-float-btn {
      position: fixed;
      z-index: 2147483646;
      width: 24px;
      height: 24px;
      border-radius: 3px;
      background: ${paper};
      border: 1px solid ${line};
      box-shadow: 0 1px 4px rgba(26, 26, 26, 0.08);
      cursor: pointer;
      display: none;
      align-items: center;
      justify-content: center;
      color: ${ink};
      line-height: 0;
      padding: 0;
      transition: color 0.12s, border-color 0.12s, background 0.12s, box-shadow 0.12s;
    }
    #rc-float-btn:hover {
      color: ${ink};
      border-color: ${warm};
      background: #f7f5f0;
      box-shadow: 0 2px 6px rgba(26, 26, 26, 0.1);
    }
    #rc-float-btn svg {
      width: 12px;
      height: 12px;
      display: block;
      stroke-width: 1.75;
    }
    #rc-float-btn.rc-show { display: flex; }
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
      min-height: 120px;
      outline: none;
      transition: border-color 0.15s;
    }
    #rc-overlay textarea.rc-input:focus {
      border-color: ${ink};
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
