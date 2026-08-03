(function () {
  const listenerRegistry = [];
  const AFFIX_LEN = 64;

  let floatBtn = null;
  let floatText = "";
  let pendingRange = null;
  let tipEl = null;
  let reconcileTimer = null;
  let failCount = 0;
  let observer = null;
  let applyingHighlight = false;
  let lastUrl = location.href;
  let historyPatched = false;
  let origPushState = null;
  let origReplaceState = null;

  function on(target, type, fn, capture) {
    target.addEventListener(type, fn, capture);
    listenerRegistry.push({ target, type, fn, capture });
  }

  function cleanup() {
    for (const { target, type, fn, capture } of listenerRegistry) {
      try {
        target.removeEventListener(type, fn, capture);
      } catch (e) {}
    }
    listenerRegistry.length = 0;
    if (floatBtn) {
      floatBtn.remove();
      floatBtn = null;
    }
    const overlay = document.getElementById("rc-overlay");
    if (overlay) overlay.remove();
    const tip = document.getElementById("rc-tip");
    if (tip) tip.remove();
    tipEl = null;
    if (styleEl) styleEl.remove();
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (reconcileTimer) {
      clearTimeout(reconcileTimer);
      reconcileTimer = null;
    }
    if (historyPatched) {
      if (origPushState) history.pushState = origPushState;
      if (origReplaceState) history.replaceState = origReplaceState;
      historyPatched = false;
      origPushState = null;
      origReplaceState = null;
    }
  }

  if (window.__rcInstalled && typeof window.__rcDestroy === "function") {
    try {
      window.__rcDestroy();
    } catch (e) {}
  }
  window.__rcInstalled = true;
  window.__rcDestroy = cleanup;

  const PAGE_STYLE = `
    .rc-highlight {
      background: rgba(255, 212, 0, 0.35);
      border-radius: 2px;
      cursor: pointer;
      box-shadow: 0 0 0 1px rgba(255, 180, 0, 0.35);
    }
    .rc-highlight:hover {
      background: rgba(255, 180, 0, 0.55);
    }
  `;
  const styleEl = document.createElement("style");
  styleEl.textContent = PAGE_STYLE;
  (document.head || document.documentElement).appendChild(styleEl);

  // ---------- floating capture button ----------

  const BTN_STYLE = `
    #rc-float-btn {
      position: fixed;
      z-index: 2147483646;
      width: 22px;
      height: 22px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.96);
      border: 1px solid rgba(232, 89, 12, 0.28);
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
      cursor: pointer;
      display: none;
      align-items: center;
      justify-content: center;
      color: #e8590c;
      line-height: 0;
      padding: 0;
      transition: color 0.12s, border-color 0.12s, box-shadow 0.12s;
    }
    #rc-float-btn:hover {
      color: #c2410c;
      border-color: rgba(194, 65, 12, 0.4);
      box-shadow: 0 2px 6px rgba(194, 65, 12, 0.18);
    }
    #rc-float-btn svg {
      width: 12px;
      height: 12px;
      display: block;
      stroke-width: 1.75;
    }
    #rc-float-btn.rc-show { display: flex; }
  `;

  const BTN_ICON = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 7.5c0-1.8 1-3 2.5-3V5c-.9 0-1.3.6-1.3 1.5H4zm6 0c0-1.8 1-3 2.5-3V5c-.9 0-1.3.6-1.3 1.5H10z"/></svg>`;

  function ensureButton() {
    if (floatBtn) return floatBtn;
    const btn = document.createElement("button");
    btn.id = "rc-float-btn";
    btn.type = "button";
    btn.title = "捕获感触";
    btn.innerHTML = `<style>${BTN_STYLE}</style>${BTN_ICON}`;
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", () => {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
        pendingRange = sel.getRangeAt(0).cloneRange();
      }
      hideFloatButton();
      showOverlay(floatText || (sel ? sel.toString().trim() : ""));
    });
    document.documentElement.appendChild(btn);
    floatBtn = btn;
    return btn;
  }

  function showFloatButton(rect) {
    const btn = ensureButton();
    const w = btn.offsetWidth || 22;
    const h = btn.offsetHeight || 22;
    let x = rect.right + 4;
    let y = rect.top;
    if (x + w > window.innerWidth - 4) x = rect.left - w - 4;
    if (x < 4) x = 4;
    if (y + h > window.innerHeight - 4) y = rect.bottom + 8;
    if (y < 4) y = 4;
    btn.style.left = x + "px";
    btn.style.top = y + "px";
    btn.classList.add("rc-show");
  }

  function hideFloatButton() {
    if (floatBtn) floatBtn.classList.remove("rc-show");
  }

  function isInsideOwnUI(node) {
    if (!node || !node.parentElement) return false;
    return !!node.parentElement.closest("#rc-overlay, #rc-float-btn, #rc-tip");
  }

  function handleSelection() {
    const sel = window.getSelection();
    const text = sel ? sel.toString().trim() : "";
    if (!text || text.length < 1 || sel.rangeCount === 0 || isInsideOwnUI(sel.anchorNode)) {
      hideFloatButton();
      return;
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      hideFloatButton();
      return;
    }
    floatText = text;
    showFloatButton(rect);
  }

  on(document, "mouseup", handleSelection, true);
  on(document, "selectionchange", () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) hideFloatButton();
  }, true);
  on(window, "scroll", hideFloatButton, true);
  on(window, "resize", hideFloatButton, true);

  // ---------- capture overlay ----------

  const STYLE = `
    #rc-overlay {
      position: fixed;
      top: 20px;
      left: 20px;
      z-index: 2147483647;
      width: 360px;
      max-width: calc(100vw - 16px);
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif;
      font-size: 14px;
      line-height: 1.6;
      color: #1f2328;
      overflow: hidden;
      box-sizing: border-box;
    }
    #rc-overlay *, #rc-overlay *::before, #rc-overlay *::after {
      box-sizing: border-box;
    }
    #rc-overlay .rc-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      background: #fff0e6;
      font-weight: 700;
      color: #e8590c;
      font-size: 13px;
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
      border-radius: 6px;
      cursor: pointer;
      color: #6b7280;
      font-size: 18px;
      font-weight: 400;
      line-height: 1;
      font-family: inherit;
    }
    #rc-overlay .rc-close:hover {
      color: #1f2328;
      background: #f3f4f6;
    }
    #rc-overlay .rc-ctx {
      margin: 10px 14px 0;
      padding: 8px 10px;
      background: #f9fafb;
      border-left: 3px solid #e8590c;
      border-radius: 6px;
      font-size: 13px;
      color: #6b7280;
      max-height: 120px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }
    #rc-overlay .rc-ctx .rc-q { color: #e8590c; font-weight: 700; margin-right: 4px; }
    #rc-overlay textarea.rc-input {
      display: block;
      width: calc(100% - 28px);
      max-width: calc(100% - 28px);
      margin: 10px 14px 0;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 10px;
      font-size: 14px;
      font-family: inherit;
      line-height: 1.5;
      resize: vertical;
      min-height: 64px;
      outline: none;
    }
    #rc-overlay textarea.rc-input:focus { border-color: #e8590c; }
    #rc-overlay .rc-actions {
      display: flex;
      gap: 8px;
      padding: 10px 14px 14px;
    }
    #rc-overlay .rc-actions button {
      flex: 1;
      border: 1px solid #e5e7eb;
      background: #fff;
      color: #1f2328;
      border-radius: 8px;
      padding: 7px 0;
      font-size: 13px;
      cursor: pointer;
      font-family: inherit;
    }
    #rc-overlay .rc-actions button:hover { background: #f3f4f6; }
    #rc-overlay .rc-actions button.rc-save {
      background: #e8590c;
      border-color: #e8590c;
      color: #fff;
      font-weight: 600;
    }
    #rc-overlay .rc-actions button.rc-save:hover { background: #d9480f; }
    #rc-overlay .rc-toast {
      position: absolute;
      left: 50%;
      bottom: 16px;
      transform: translateX(-50%);
      background: #e8590c;
      color: #fff;
      padding: 6px 16px;
      border-radius: 20px;
      font-size: 13px;
      opacity: 0;
      transition: opacity 0.2s;
      pointer-events: none;
    }
    #rc-overlay .rc-toast.show { opacity: 1; }
  `;

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === "rc-show-capture") {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
        pendingRange = sel.getRangeAt(0).cloneRange();
      }
      hideFloatButton();
      showOverlay(msg.exact || "");
      sendResponse({ ok: true });
    }
  });

  function getSelectionRect() {
    if (pendingRange) {
      try {
        const rect = pendingRange.getBoundingClientRect();
        if (rect && (rect.width > 0 || rect.height > 0)) return rect;
      } catch (e) {}
    }
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      if (rect && (rect.width > 0 || rect.height > 0)) return rect;
    }
    return null;
  }

  function positionOverlayNearSelection(overlay) {
    const pad = 8;
    const gap = 10;
    const w = overlay.offsetWidth || 360;
    const h = overlay.offsetHeight || 220;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rect = getSelectionRect();

    let x;
    let y;

    if (!rect) {
      x = Math.max(pad, vw - w - 20);
      y = 20;
    } else {
      // Prefer just below the selection, left-aligned to it.
      x = rect.left;
      y = rect.bottom + gap;

      if (y + h > vh - pad) {
        y = rect.top - h - gap;
      }

      // If vertical space is still tight, place beside the selection.
      if (y < pad) {
        y = Math.min(Math.max(pad, rect.top), Math.max(pad, vh - h - pad));
        x = rect.right + gap;
        if (x + w > vw - pad) x = rect.left - w - gap;
      }

      if (x + w > vw - pad) x = vw - w - pad;
      if (x < pad) x = pad;
      if (y + h > vh - pad) y = vh - h - pad;
      if (y < pad) y = pad;
    }

    overlay.style.left = Math.round(x) + "px";
    overlay.style.top = Math.round(y) + "px";
  }

  function showOverlay(exactText) {
    hideFloatButton();
    const old = document.getElementById("rc-overlay");
    if (old) old.remove();

    const overlay = document.createElement("div");
    overlay.id = "rc-overlay";

    const ctx = exactText
      ? `<div class="rc-ctx"><span class="rc-q">原文</span>${escapeHtml(exactText)}</div>`
      : "";

    overlay.innerHTML = `
      <style>${STYLE}</style>
      <div class="rc-head">
        <span>捕获感触</span>
        <button type="button" class="rc-close" title="关闭 (Esc)" aria-label="关闭">×</button>
      </div>
      ${ctx}
      <textarea class="rc-input" rows="3"
        placeholder="你的感触，用你自己的话……&#10;Enter 保存，Shift+Enter 换行"></textarea>
      <div class="rc-actions">
        <button class="rc-save">保存 (Enter)</button>
        <button class="rc-cancel">取消</button>
      </div>
      <div class="rc-toast">✓ 已保存</div>
    `;

    document.documentElement.appendChild(overlay);
    positionOverlayNearSelection(overlay);

    const textarea = overlay.querySelector(".rc-input");
    const toast = overlay.querySelector(".rc-toast");

    function close() {
      overlay.remove();
    }

    async function save() {
      const text = textarea.value.trim();
      if (!text) {
        close();
        return;
      }
      const range = pendingRange;
      pendingRange = null;
      let anchor = null;
      let fragments = null;
      if (range) {
        const described = describeRange(range);
        if (described) {
          anchor = described.anchor;
          fragments = described.fragments;
        } else {
          console.warn("[RecordU] 无法从选区生成锚点");
        }
      }
      const res = await chrome.runtime.sendMessage({
        type: "rc-save",
        text,
        anchor,
        pageTitle: document.title,
        pageUrl: location.href
      });
      if (fragments && res && res.ok) {
        try {
          applyHighlight(fragments, res.id, text);
        } catch (e) {
          console.warn("[RecordU] 立即高亮失败", e);
        }
      }
      toast.classList.add("show");
      setTimeout(close, 650);
    }

    overlay.querySelector(".rc-save").addEventListener("click", save);
    overlay.querySelector(".rc-cancel").addEventListener("click", close);
    overlay.querySelector(".rc-close").addEventListener("click", close);
    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        save();
      }
      if (e.key === "Escape") {
        close();
      }
    });

    textarea.focus();
  }

  // ---------- highlight & anchoring ----------

  function normalizeWs(s) {
    return String(s).replace(/\s+/g, " ").trim();
  }

  function normalizeHost(host) {
    return host.replace(/^www\./i, "").toLowerCase();
  }

  function normalizePathname(pathname) {
    if (pathname.length > 1 && pathname.endsWith("/")) {
      return pathname.slice(0, -1);
    }
    return pathname;
  }

  function acceptTextNode(node, skipHighlights) {
    if (!node || !node.nodeValue) return NodeFilter.FILTER_REJECT;
    const parent = node.parentElement;
    if (!parent) return NodeFilter.FILTER_REJECT;
    if (parent.closest("script, style, noscript, textarea, #rc-overlay, #rc-float-btn, #rc-tip")) {
      return NodeFilter.FILTER_REJECT;
    }
    if (skipHighlights && parent.closest(".rc-highlight")) {
      return NodeFilter.FILTER_REJECT;
    }
    return NodeFilter.FILTER_ACCEPT;
  }

  function buildTextMap(options) {
    const skipHighlights = !options || options.skipHighlights !== false;
    let normText = "";
    const charMap = [];
    if (!document.body) return { normText, charMap };

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return acceptTextNode(node, skipHighlights);
      }
    });

    while (walker.nextNode()) {
      const node = walker.currentNode;
      const val = node.nodeValue;
      for (let k = 0; k < val.length; k++) {
        const ch = val[k];
        if (/\s/.test(ch)) {
          if (normText.length > 0 && normText[normText.length - 1] !== " ") {
            normText += " ";
            charMap.push({ node, offset: k });
          }
        } else {
          normText += ch;
          charMap.push({ node, offset: k });
        }
      }
    }
    return { normText, charMap };
  }

  function rangeBoundsInMap(range, charMap) {
    let start = -1;
    let end = -1;
    for (let i = 0; i < charMap.length; i++) {
      const { node, offset } = charMap[i];
      try {
        if (range.comparePoint(node, offset) === 0) {
          if (start < 0) start = i;
          end = i + 1;
        }
      } catch (e) {
        // node detached / not in range's document
      }
    }
    if (start < 0 || end <= start) return null;
    return { start, end };
  }

  function trimBounds(normText, start, end) {
    let s = start;
    let e = end;
    while (s < e && normText[s] === " ") s++;
    while (e > s && normText[e - 1] === " ") e--;
    if (s >= e) return null;
    return { start: s, end: e };
  }

  function offsetsToFragments(charMap, start, end) {
    const fragments = [];
    let cur = null;
    for (let i = start; i < end; i++) {
      const { node, offset } = charMap[i];
      if (!cur || cur.node !== node) {
        if (cur) fragments.push(cur);
        cur = { node, start: offset, end: offset + 1 };
      } else {
        cur.end = Math.max(cur.end, offset + 1);
      }
    }
    if (cur) fragments.push(cur);
    return fragments;
  }

  function describeRange(range) {
    const { normText, charMap } = buildTextMap({ skipHighlights: true });
    if (!charMap.length) return null;
    const bounds = rangeBoundsInMap(range, charMap);
    if (!bounds) return null;
    const trimmed = trimBounds(normText, bounds.start, bounds.end);
    if (!trimmed) return null;
    const { start, end } = trimmed;
    const exact = normText.slice(start, end);
    if (!exact) return null;
    return {
      anchor: {
        exact,
        prefix: normText.slice(Math.max(0, start - AFFIX_LEN), start),
        suffix: normText.slice(end, Math.min(normText.length, end + AFFIX_LEN)),
        start,
        end
      },
      fragments: offsetsToFragments(charMap, start, end)
    };
  }

  function scoreAffix(actual, expected, side) {
    if (!expected) return 0;
    const a = normalizeWs(actual);
    const e = normalizeWs(expected);
    if (!a || !e) return 0;
    const max = Math.min(a.length, e.length);
    let n = 0;
    if (side === "end") {
      for (let i = 1; i <= max; i++) {
        if (a.slice(-i) === e.slice(-i)) n = i;
        else break;
      }
    } else {
      for (let i = 1; i <= max; i++) {
        if (a.slice(0, i) === e.slice(0, i)) n = i;
        else break;
      }
    }
    return n;
  }

  function locateByQuote(anchor) {
    const exact = normalizeWs(anchor.exact);
    if (!exact) return null;
    const { normText, charMap } = buildTextMap({ skipHighlights: true });
    if (!charMap.length) return null;

    const matches = [];
    let from = 0;
    while (from <= normText.length) {
      const idx = normText.indexOf(exact, from);
      if (idx < 0) break;
      matches.push(idx);
      from = idx + 1;
    }
    if (!matches.length) return null;

    let best = matches[0];
    if (matches.length > 1) {
      let bestScore = -1;
      for (const idx of matches) {
        const pre = normText.slice(Math.max(0, idx - AFFIX_LEN), idx);
        const suf = normText.slice(idx + exact.length, idx + exact.length + AFFIX_LEN);
        let score = scoreAffix(pre, anchor.prefix, "end") + scoreAffix(suf, anchor.suffix, "start");
        if (typeof anchor.start === "number" && anchor.start >= 0) {
          score -= Math.min(Math.abs(idx - anchor.start), 200) / 200;
        }
        if (score > bestScore) {
          bestScore = score;
          best = idx;
        }
      }
    }

    return offsetsToFragments(charMap, best, best + exact.length);
  }

  function locateByPosition(anchor) {
    if (typeof anchor.start !== "number" || typeof anchor.end !== "number") return null;
    if (anchor.start < 0 || anchor.end <= anchor.start) return null;

    const exact = normalizeWs(anchor.exact);
    if (!exact) return null;
    const { normText, charMap } = buildTextMap({ skipHighlights: true });
    if (!charMap.length) return null;

    if (anchor.end <= normText.length) {
      const slice = normalizeWs(normText.slice(anchor.start, anchor.end));
      if (slice === exact) {
        return offsetsToFragments(charMap, anchor.start, anchor.end);
      }
    }

    const windowSize = 120;
    const from = Math.max(0, anchor.start - windowSize);
    const to = Math.min(normText.length, anchor.start + windowSize);
    const region = normText.slice(from, to);
    const rel = region.indexOf(exact);
    if (rel < 0) {
      console.warn("[RecordU] TextPosition 校验失败，附近未找到原文");
      return null;
    }
    const idx = from + rel;
    return offsetsToFragments(charMap, idx, idx + exact.length);
  }

  function locateAnchor(anchor) {
    if (!anchor || !anchor.exact) return null;
    const byQuote = locateByQuote(anchor);
    if (byQuote && byQuote.length) return byQuote;
    const byPos = locateByPosition(anchor);
    if (byPos && byPos.length) return byPos;
    return null;
  }

  function wrapTextRange(node, start, end, id, note) {
    if (!node || !node.parentNode || start >= end) return;
    if (node.parentElement && node.parentElement.closest(".rc-highlight")) return;

    const text = node.nodeValue || "";
    let s = Math.max(0, start);
    let e = Math.min(text.length, end);
    if (s >= e) return;

    let target = node;
    if (e < target.nodeValue.length) {
      target.splitText(e);
    }
    if (s > 0) {
      target = target.splitText(s);
    }

    const span = document.createElement("span");
    span.className = "rc-highlight";
    span.dataset.rcId = id;
    if (note) span.dataset.rcNote = note;
    target.parentNode.replaceChild(span, target);
    span.appendChild(target);
  }

  function applyHighlight(fragments, id, note) {
    if (!fragments || !fragments.length) return;

    const sorted = fragments.slice().sort((a, b) => {
      if (a.node === b.node) return b.start - a.start;
      const pos = a.node.compareDocumentPosition(b.node);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return 1;
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return -1;
      return 0;
    });

    applyingHighlight = true;
    try {
      for (const frag of sorted) {
        if (!frag.node || !frag.node.isConnected) continue;
        wrapTextRange(frag.node, frag.start, frag.end, id, note);
      }
    } finally {
      applyingHighlight = false;
    }
  }

  function unwrapHighlight(el) {
    el.replaceWith(...el.childNodes);
  }

  function updateHighlightNotes(id, note) {
    document.querySelectorAll(`span.rc-highlight[data-rc-id="${CSS.escape(id)}"]`).forEach((el) => {
      if (note) el.dataset.rcNote = note;
      else delete el.dataset.rcNote;
    });
  }

  // ---------- hover tooltip (你的感触) ----------

  const TIP_STYLE = `
    #rc-tip {
      position: fixed;
      z-index: 2147483647;
      max-width: 320px;
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.18);
      padding: 8px 12px;
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif;
      font-size: 13px;
      line-height: 1.55;
      color: #1f2328;
      white-space: pre-wrap;
      word-break: break-word;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.15s;
    }
    #rc-tip.rc-show { opacity: 1; }
    #rc-tip .rc-tip-label {
      font-size: 11px;
      font-weight: 700;
      color: #e8590c;
      margin-bottom: 4px;
    }
  `;

  function ensureTip() {
    if (tipEl) return tipEl;
    const tip = document.createElement("div");
    tip.id = "rc-tip";
    tip.innerHTML = `<style>${TIP_STYLE}</style><div class="rc-tip-label">你的感触</div><div class="rc-tip-body"></div>`;
    document.documentElement.appendChild(tip);
    tipEl = tip;
    return tip;
  }

  function showTip(e, note) {
    const tip = ensureTip();
    tip.querySelector(".rc-tip-body").textContent = note;
    tip.classList.add("rc-show");
    positionTip(e);
  }

  function positionTip(e) {
    const tip = ensureTip();
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    let x = e.clientX + 14;
    let y = e.clientY + 14;
    if (x + w > window.innerWidth - 8) x = e.clientX - w - 14;
    if (y + h > window.innerHeight - 8) y = e.clientY - h - 14;
    if (x < 8) x = 8;
    if (y < 8) y = 8;
    tip.style.left = x + "px";
    tip.style.top = y + "px";
  }

  function hideTip() {
    if (tipEl) tipEl.classList.remove("rc-show");
  }

  on(
    document,
    "mouseover",
    (e) => {
      const h = e.target.closest && e.target.closest(".rc-highlight");
      if (!h) return;
      const note = h.dataset.rcNote;
      if (!note) return;
      showTip(e, note);
    },
    true
  );

  on(
    document,
    "mousemove",
    (e) => {
      if (tipEl && tipEl.classList.contains("rc-show")) positionTip(e);
    },
    true
  );

  on(
    document,
    "mouseout",
    (e) => {
      const from = e.target.closest && e.target.closest(".rc-highlight");
      if (!from) return;
      const to = e.relatedTarget;
      if (to && to.closest && to.closest(".rc-highlight")) return;
      hideTip();
    },
    true
  );

  function samePage(url) {
    try {
      const a = new URL(url, location.href);
      const b = new URL(location.href);
      return (
        normalizeHost(a.host) === normalizeHost(b.host) &&
        normalizePathname(a.pathname) === normalizePathname(b.pathname)
      );
    } catch (e) {
      return false;
    }
  }

  function mutationTouchesContent(mutations) {
    for (const m of mutations) {
      if (m.type === "characterData") {
        const parent = m.target.parentElement;
        if (parent && parent.closest(".rc-highlight, #rc-overlay, #rc-float-btn, #rc-tip")) continue;
        return true;
      }
      const nodes = [...m.addedNodes, ...m.removedNodes];
      for (const n of nodes) {
        if (n.nodeType === Node.ELEMENT_NODE) {
          if (n.id === "rc-overlay" || n.id === "rc-float-btn" || n.id === "rc-tip") continue;
          if (n.classList && n.classList.contains("rc-highlight")) continue;
          if (n.closest && n.closest("#rc-overlay, #rc-float-btn, #rc-tip")) continue;
          return true;
        }
        if (n.nodeType === Node.TEXT_NODE) {
          const parent = n.parentElement;
          if (parent && parent.closest(".rc-highlight, #rc-overlay, #rc-float-btn, #rc-tip")) continue;
          return true;
        }
      }
    }
    return false;
  }

  async function reconcileHighlights() {
    const data = await chrome.storage.local.get("rc_captures");
    const captures = (data.rc_captures || []).filter(
      (c) => c.anchor && c.anchor.exact && samePage(c.pageUrl)
    );
    const ids = new Set(captures.map((c) => c.id));

    document.querySelectorAll("span.rc-highlight").forEach((el) => {
      if (!ids.has(el.dataset.rcId)) unwrapHighlight(el);
    });

    let matched = 0;
    for (const c of captures) {
      const existing = document.querySelectorAll(
        `span.rc-highlight[data-rc-id="${CSS.escape(c.id)}"]`
      );
      if (existing.length) {
        updateHighlightNotes(c.id, c.text);
        matched++;
        continue;
      }
      const fragments = locateAnchor(c.anchor);
      if (fragments && fragments.length) {
        try {
          applyHighlight(fragments, c.id, c.text);
          matched++;
        } catch (e) {
          console.warn("[RecordU] 恢复高亮失败", c.id, e);
        }
      } else {
        console.warn("[RecordU] 未定位到锚点", c.id, c.anchor.exact.slice(0, 40));
      }
    }

    if (captures.length) {
      console.log(`[RecordU] 本页捕获 ${captures.length} 条，已高亮 ${matched} 条`);
    }

    if (matched < captures.length) {
      failCount++;
      ensureObserver();
      if (failCount <= 12) scheduleReconcile();
    } else {
      failCount = 0;
      // All matched: keep observer alive but idle; it wakes on real DOM changes.
      ensureObserver();
    }
  }

  function scheduleReconcile(delay) {
    const d = delay != null ? delay : Math.min(400 * Math.pow(1.45, failCount), 6000);
    if (reconcileTimer) clearTimeout(reconcileTimer);
    reconcileTimer = setTimeout(() => {
      reconcileTimer = null;
      reconcileHighlights();
    }, d);
  }

  function ensureObserver() {
    if (observer || !document.body) return;
    observer = new MutationObserver((mutations) => {
      if (applyingHighlight) return;
      if (!mutationTouchesContent(mutations)) return;
      failCount = 0;
      scheduleReconcile(300);
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  function onUrlMaybeChanged() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    failCount = 0;
    scheduleReconcile(100);
    [400, 1200, 3000].forEach((ms) => setTimeout(reconcileHighlights, ms));
  }

  function hookSpaNavigation() {
    if (historyPatched) return;
    origPushState = history.pushState;
    origReplaceState = history.replaceState;
    history.pushState = function (...args) {
      const ret = origPushState.apply(this, args);
      onUrlMaybeChanged();
      return ret;
    };
    history.replaceState = function (...args) {
      const ret = origReplaceState.apply(this, args);
      onUrlMaybeChanged();
      return ret;
    };
    historyPatched = true;
    on(window, "popstate", onUrlMaybeChanged);
    on(window, "hashchange", onUrlMaybeChanged);
  }

  function init() {
    hookSpaNavigation();
    reconcileHighlights();
    ensureObserver();
    [800, 2000, 5000].forEach((ms) => setTimeout(reconcileHighlights, ms));
  }

  if (document.readyState === "loading") {
    on(document, "DOMContentLoaded", init);
  } else {
    init();
  }

  on(window, "pageshow", () => {
    failCount = 0;
    lastUrl = location.href;
    reconcileHighlights();
    ensureObserver();
    [500, 1500, 4000].forEach((ms) => setTimeout(reconcileHighlights, ms));
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.rc_captures) {
      failCount = 0;
      reconcileHighlights();
    }
  });

  function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }
})();
