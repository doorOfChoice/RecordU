(function () {
  const listenerRegistry = [];
  const AFFIX_LEN = 64;

  let floatBar = null;
  let floatText = "";
  let pendingRange = null;
  let pendingScreenshot = null;
  let regionMask = null;
  let reconcilePassTimer = null;
  let failCount = 0;
  let observer = null;
  let applyingHighlight = false;
  let applyingWordHighlight = false;
  let wordHlQuietUntil = 0;
  let cachedWords = [];
  let wordsCacheFresh = false;
  let cachedCaptures = null;
  let cachedSettings = null;
  let lastUrl = location.href;
  let historyPatched = false;
  let origPushState = null;
  let origReplaceState = null;
  let wordTipEl = null;
  let wordTipHideTimer = null;
  let pendingPass = { idea: false, wordFull: false, wordIncremental: false };
  const dirtyWordRoots = new Set();
  const MUTATION_RECONCILE_MS = 550;
  let reconcilePassRunning = false;

  const OWN_UI_SEL = "#rc-overlay, #rc-float-bar, #rc-region-mask, #rc-word-tip";
  const WORD_HL_MAX = 40;
  const WORD_DIRTY_ROOT_FULL_THRESHOLD = 24;

  // 与 shared/tts.js 保持同步：content script 无法 import，这里内联同一套逻辑。
  let ttsVoicesReady = false;
  let ttsReadyWaiters = [];
  const TTS_PREFERRED_VOICE_NAMES = [
    "Google US English",
    "Samantha",
    "Microsoft Aria Online (Natural)",
    "Microsoft Jenny Online (Natural)",
    "Microsoft Guy Online (Natural)",
    "Aria Natural",
    "Jenny Natural",
    "Guy Natural",
    "Victoria",
    "Susan",
    "Karen",
    "Moira",
    "Daniel"
  ];

  function ttsSyncVoices() {
    if (!("speechSynthesis" in window)) return [];
    const list = speechSynthesis.getVoices();
    if (list.length && !ttsVoicesReady) {
      ttsVoicesReady = true;
      const waiters = ttsReadyWaiters;
      ttsReadyWaiters = [];
      waiters.forEach((resolve) => resolve());
    }
    return list;
  }

  function ttsPickVoice() {
    const list = ttsSyncVoices();
    if (!list.length) return null;
    for (const name of TTS_PREFERRED_VOICE_NAMES) {
      const hit = list.find((v) => v.lang === "en-US" && v.name.includes(name));
      if (hit) return hit;
    }
    const english = list.filter((v) => (v.lang || "").toLowerCase().startsWith("en"));
    return english.find((v) => v.lang === "en-US") || english[0] || null;
  }

  if ("speechSynthesis" in window) {
    ttsSyncVoices();
    speechSynthesis.addEventListener("voiceschanged", ttsSyncVoices);
  }

  function speakWordText(text) {
    if (!("speechSynthesis" in window)) return;
    const clean = String(text || "").trim();
    if (!clean) return;
    speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(clean);
    utter.lang = "en-US";
    utter.rate = 0.7;
    utter.pitch = 0.95;
    const speakNow = () => {
      const voice = ttsPickVoice();
      if (voice) utter.voice = voice;
      speechSynthesis.speak(utter);
    };
    if (ttsVoicesReady) {
      speakNow();
      return;
    }
    Promise.race([
      new Promise((resolve) => ttsReadyWaiters.push(resolve)),
      new Promise((resolve) => setTimeout(resolve, 300))
    ]).then(() => {
      speechSynthesis.cancel();
      speakNow();
    });
  }

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
    if (floatBar) {
      floatBar.remove();
      floatBar = null;
    }
    const overlay = document.getElementById("rc-overlay");
    if (overlay) overlay.remove();
    hideWordTip();
    tearDownRegionMask();
    if (styleEl) styleEl.remove();
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (reconcilePassTimer) {
      clearTimeout(reconcilePassTimer);
      reconcilePassTimer = null;
    }
    dirtyWordRoots.clear();
    pendingPass = { idea: false, wordFull: false, wordIncremental: false };
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

  const theme = (typeof globalThis !== "undefined" && globalThis.RcCaptureTheme) || {};
  const PAGE_STYLE = theme.highlightCss || `
    .rc-highlight {
      background: color-mix(in srgb, var(--rc-idea-hl, #ffcc00) 32%, transparent);
      border-radius: 0;
      cursor: pointer;
      box-shadow: inset 0 -3px 0 color-mix(in srgb, var(--rc-idea-hl, #ffcc00) 55%, transparent);
    }
    .rc-highlight:hover {
      background: color-mix(in srgb, var(--rc-idea-hl, #ffcc00) 60%, transparent);
    }
    html[data-rc-idea-style="underline"] .rc-highlight {
      background: transparent;
      border-radius: 0;
      box-shadow: none;
      border-bottom: 3px solid var(--rc-idea-hl, #ffcc00);
      padding-bottom: 1px;
    }
    html[data-rc-idea-style="underline"] .rc-highlight:hover {
      background: transparent;
      border-bottom-color: var(--rc-idea-hl, #ffcc00);
    }
    .rc-word-highlight {
      background: color-mix(in srgb, var(--rc-word-hl, #0000ff) 26%, transparent);
      border-radius: 0;
      cursor: pointer;
      box-shadow: inset 0 -3px 0 color-mix(in srgb, var(--rc-word-hl, #0000ff) 40%, transparent);
    }
    .rc-word-highlight:hover {
      background: color-mix(in srgb, var(--rc-word-hl, #0000ff) 45%, transparent);
    }
    html[data-rc-word-style="underline"] .rc-word-highlight {
      background: transparent;
      border-radius: 0;
      box-shadow: none;
      border-bottom: 3px solid var(--rc-word-hl, #0000ff);
      padding-bottom: 1px;
    }
    html[data-rc-word-style="underline"] .rc-word-highlight:hover {
      background: transparent;
      border-bottom-color: var(--rc-word-hl, #0000ff);
    }
  `;
  const styleEl = document.createElement("style");
  styleEl.textContent = PAGE_STYLE;
  (document.head || document.documentElement).appendChild(styleEl);

  function applyHighlightSettings(settings) {
    if (!settings) return;
    cachedSettings = settings;
    const root = document.documentElement;
    if (settings.ideaHighlightColor) {
      root.style.setProperty("--rc-idea-hl", settings.ideaHighlightColor);
    }
    if (settings.wordHighlightColor) {
      root.style.setProperty("--rc-word-hl", settings.wordHighlightColor);
    }
    root.dataset.rcIdeaStyle =
      settings.ideaHighlightStyle === "underline" ? "underline" : "fill";
    root.dataset.rcWordStyle =
      settings.wordHighlightStyle === "underline" ? "underline" : "fill";
  }

  function isHostInHighlightBlacklist(hostname, list) {
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

  function isHighlightBlocked() {
    const hostList =
      cachedSettings && Array.isArray(cachedSettings.highlightHostBlacklist)
        ? cachedSettings.highlightHostBlacklist
        : [];
    if (isHostInHighlightBlacklist(location.hostname, hostList)) return true;

    const pageList =
      cachedSettings && Array.isArray(cachedSettings.highlightPageBlacklist)
        ? cachedSettings.highlightPageBlacklist
        : [];
    if (!pageList.length) return false;
    const host = normalizeHost(location.hostname);
    const path = normalizePathname(location.pathname || "/");
    const key = host + path;
    for (const entry of pageList) {
      if (String(entry || "") === key) return true;
    }
    return false;
  }

  function clearAllPageHighlights() {
    applyingHighlight = true;
    applyingWordHighlight = true;
    try {
      document.querySelectorAll("span.rc-highlight").forEach((el) => {
        unwrapHighlight(el);
      });
      document.querySelectorAll("span.rc-word-highlight").forEach((el) => {
        unwrapWordHighlight(el);
      });
    } finally {
      applyingHighlight = false;
      applyingWordHighlight = false;
      wordHlQuietUntil = Date.now() + 250;
    }
  }

  function currentWordMatchMode() {
    const mode = cachedSettings && cachedSettings.wordMatchMode;
    return mode === "exact" ? "exact" : "variant";
  }

  /** Per-word matchMode overrides global; inherit/missing → global. */
  function resolveWordMatchMode(entry) {
    const m = entry && entry.matchMode;
    if (m === "exact" || m === "variant") return m;
    return currentWordMatchMode();
  }

  async function loadHighlightSettings() {
    try {
      const res = await chrome.runtime.sendMessage({ type: "rc-get-settings" });
      if (res && res.settings) applyHighlightSettings(res.settings);
    } catch (e) {}
  }

  loadHighlightSettings();

  // ---------- floating capture bar ----------

  const BTN_STYLE = theme.floatBtnCss || "";
  function ensureFloatBar() {
    if (floatBar) return floatBar;
    const bar = document.createElement("div");
    bar.id = "rc-float-bar";
    bar.innerHTML = `
      <style>${BTN_STYLE}</style>
      <button type="button" class="rc-float-item" data-action="capture" title="记下感触"><span class="rc-float-letter" aria-hidden="true">i</span></button>
      <button type="button" class="rc-float-item" data-action="word" title="标记单词"><span class="rc-float-letter" aria-hidden="true">w</span></button>
    `;
    bar.addEventListener("mousedown", (e) => e.preventDefault());
    bar.addEventListener("click", (e) => {
      const btn = e.target.closest && e.target.closest(".rc-float-item");
      if (!btn) return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
        pendingRange = sel.getRangeAt(0).cloneRange();
      }
      const text = floatText || (sel ? sel.toString().trim() : "");
      hideFloatButton();
      if (btn.dataset.action === "word") {
        const existing = findCachedWord(text);
        showWordOverlay(
          text,
          existing
            ? {
                wordId: existing.id,
                note: existing.note || "",
                phonetic: existing.phonetic || "",
                translation: existing.translation || "",
                matchMode: existing.matchMode || "inherit",
                learned: !!existing.learned
              }
            : {}
        );
      } else {
        const existingId = captureIdFromSelection();
        if (existingId) {
          const rect = pendingRange ? pendingRange.getBoundingClientRect() : null;
          showEditOverlay(existingId, rect);
        } else {
          showOverlay(text);
        }
      }
    });
    document.documentElement.appendChild(bar);
    floatBar = bar;
    return bar;
  }

  function showFloatButton(rect) {
    const bar = ensureFloatBar();
    const w = bar.offsetWidth || 52;
    const h = bar.offsetHeight || 24;
    let x = rect.right + 6;
    let y = rect.top + Math.max(0, (rect.height - h) / 2);
    if (x + w > window.innerWidth - 4) x = rect.left - w - 4;
    if (x < 4) x = 4;
    if (y + h > window.innerHeight - 4) y = Math.max(4, window.innerHeight - h - 4);
    if (y < 4) y = 4;
    bar.style.left = x + "px";
    bar.style.top = y + "px";
    bar.classList.add("rc-show");
  }

  function hideFloatButton() {
    if (floatBar) floatBar.classList.remove("rc-show");
  }

  function isSelectionBackward(sel) {
    if (!sel || !sel.anchorNode || !sel.focusNode) return false;
    if (sel.anchorNode === sel.focusNode) {
      return sel.focusOffset < sel.anchorOffset;
    }
    const pos = sel.anchorNode.compareDocumentPosition(sel.focusNode);
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return true;
    return false;
  }

  /** Rect near where the user finished selecting (last word), not the full multi-line box. */
  function getSelectionFloatRect(sel) {
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);

    try {
      if (sel.focusNode) {
        const caret = document.createRange();
        caret.setStart(sel.focusNode, sel.focusOffset);
        caret.collapse(true);
        const r = caret.getBoundingClientRect();
        if (r && (r.height > 0 || r.width > 0)) return r;
      }
    } catch (e) {}

    try {
      const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 || r.height > 0);
      if (rects.length) {
        return isSelectionBackward(sel) ? rects[0] : rects[rects.length - 1];
      }
    } catch (e) {}

    const box = range.getBoundingClientRect();
    if (box && (box.width > 0 || box.height > 0)) return box;
    return null;
  }

  function isInsideOwnUI(node) {
    if (!node || !node.parentElement) return false;
    return !!node.parentElement.closest(OWN_UI_SEL);
  }

  function handleSelection() {
    const sel = window.getSelection();
    const text = sel ? sel.toString().trim() : "";
    if (!text || text.length < 1 || sel.rangeCount === 0 || isInsideOwnUI(sel.anchorNode)) {
      hideFloatButton();
      return;
    }
    const rect = getSelectionFloatRect(sel);
    if (!rect) {
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

  const STYLE = theme.overlayCss || "";

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.type) return;
    if (msg.type === "rc-show-capture") {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
        pendingRange = sel.getRangeAt(0).cloneRange();
      }
      hideFloatButton();
      showOverlay(msg.exact || "");
      sendResponse({ ok: true });
      return;
    }
    if (msg.type === "rc-start-region-capture") {
      startRegionCapture();
      sendResponse({ ok: true });
      return;
    }
    if (msg.type === "rc-captures-changed") {
      const pageUrl = msg.pageUrl;
      if (pageUrl == null || samePage(pageUrl)) {
        cachedCaptures = null;
        failCount = 0;
        scheduleReconcilePass(50, { idea: true });
      }
      sendResponse({ ok: true });
      return;
    }
    if (msg.type === "rc-words-changed") {
      wordsCacheFresh = false;
      scheduleReconcilePass(50, { wordFull: true });
      sendResponse({ ok: true });
      return;
    }
    if (msg.type === "rc-settings-changed") {
      applyHighlightSettings(msg.settings);
      scheduleReconcilePass(50, { idea: true, wordFull: true });
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

  function positionOverlay(overlay, anchorRect) {
    const pad = 8;
    const gap = 10;
    const w = overlay.offsetWidth || 360;
    const h = overlay.offsetHeight || 220;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rect = anchorRect || getSelectionRect();

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

  function bindOverlayDrag(overlay) {
    const head = overlay.querySelector(".rc-head");
    if (!head) return;

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let originLeft = 0;
    let originTop = 0;

    function clamp(left, top) {
      const pad = 8;
      const w = overlay.offsetWidth || 360;
      const h = overlay.offsetHeight || 220;
      const maxL = Math.max(pad, window.innerWidth - w - pad);
      const maxT = Math.max(pad, window.innerHeight - h - pad);
      return {
        left: Math.min(Math.max(pad, left), maxL),
        top: Math.min(Math.max(pad, top), maxT)
      };
    }

    function onMove(e) {
      if (!dragging) return;
      e.preventDefault();
      const next = clamp(originLeft + (e.clientX - startX), originTop + (e.clientY - startY));
      overlay.style.left = Math.round(next.left) + "px";
      overlay.style.top = Math.round(next.top) + "px";
    }

    function onUp() {
      if (!dragging) return;
      dragging = false;
      overlay.classList.remove("rc-dragging");
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onUp, true);
    }

    head.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      if (e.target.closest(".rc-close")) return;
      e.preventDefault();
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      originLeft = parseFloat(overlay.style.left) || overlay.offsetLeft || 0;
      originTop = parseFloat(overlay.style.top) || overlay.offsetTop || 0;
      overlay.classList.add("rc-dragging");
      try {
        head.setPointerCapture(e.pointerId);
      } catch (err) {}
      window.addEventListener("pointermove", onMove, true);
      window.addEventListener("pointerup", onUp, true);
      window.addEventListener("pointercancel", onUp, true);
    });
  }

  /** Close overlay when pointerdown lands outside it. Returns teardown. */
  function bindOverlayOutsideClose(overlay, close) {
    const onPointerDown = (e) => {
      if (!overlay.isConnected) {
        teardown();
        return;
      }
      if (e.button != null && e.button !== 0) return;
      const t = e.target;
      if (t && overlay.contains(t)) return;
      close();
    };

    function teardown() {
      document.removeEventListener("pointerdown", onPointerDown, true);
    }

    // Defer so the click/tap that opened the panel does not instantly dismiss it.
    setTimeout(() => {
      if (!overlay.isConnected) return;
      document.addEventListener("pointerdown", onPointerDown, true);
    }, 0);

    return teardown;
  }

  function openOverlay({
    mode = "create",
    title = "记下感触",
    exactText = "",
    initialText = "",
    captureId = null,
    anchorRect = null,
    screenshot = null
  } = {}) {
    hideFloatButton();
    const old = document.getElementById("rc-overlay");
    if (old) old.remove();

    const overlay = document.createElement("div");
    overlay.id = "rc-overlay";

    const ctx = exactText
      ? `<div class="rc-ctx"><span class="rc-q">原文</span>${escapeHtml(exactText)}</div>`
      : "";
    const shotHtml =
      screenshot && screenshot.dataUrl
        ? `<div class="rc-shot"><img alt="截图预览" src="${screenshot.dataUrl}"></div>`
        : "";
    const deleteBtn =
      mode === "edit" && captureId
        ? `<button type="button" class="rc-delete">删除</button>`
        : "";

    overlay.innerHTML = `
      <style>${STYLE}</style>
      <div class="rc-head">
        <span>${escapeHtml(title)}</span>
        <button type="button" class="rc-close" title="关闭" aria-label="关闭">×</button>
      </div>
      ${shotHtml}
      ${ctx}
      <textarea class="rc-input" rows="5"
        placeholder="你的感触，用你自己的话……"></textarea>
      <div class="rc-actions">
        <button type="button" class="rc-save">保存</button>
        ${deleteBtn}
      </div>
      <div class="rc-toast">✓ 已保存</div>
    `;

    document.documentElement.appendChild(overlay);
    positionOverlay(overlay, anchorRect);
    bindOverlayDrag(overlay);
    requestAnimationFrame(() => overlay.classList.add("rc-show"));

    const textarea = overlay.querySelector(".rc-input");
    const toast = overlay.querySelector(".rc-toast");
    textarea.value = initialText;

    let unbindOutside = null;
    function close() {
      if (unbindOutside) {
        unbindOutside();
        unbindOutside = null;
      }
      if (mode === "create" && screenshot) {
        if (screenshot.revokePreview) screenshot.revokePreview();
        pendingScreenshot = null;
      }
      overlay.remove();
    }
    unbindOutside = bindOverlayOutsideClose(overlay, close);

    async function removeCapture() {
      if (!captureId) return;
      const res = await chrome.runtime.sendMessage({ type: "rc-delete", id: captureId });
      if (chrome.runtime.lastError || !res || !res.ok) {
        toast.textContent = "删除失败";
        toast.classList.add("show");
        setTimeout(() => toast.classList.remove("show"), 900);
        return;
      }
      applyingHighlight = true;
      try {
        document
          .querySelectorAll(`span.rc-highlight[data-rc-id="${CSS.escape(captureId)}"]`)
          .forEach((el) => unwrapHighlight(el));
      } finally {
        applyingHighlight = false;
      }
      toast.textContent = "✓ 已删除";
      toast.classList.add("show");
      setTimeout(close, 650);
    }

    async function save() {
      const text = textarea.value.trim();
      if (!text) {
        close();
        return;
      }

      if (mode === "edit" && captureId) {
        const res = await chrome.runtime.sendMessage({
          type: "rc-update",
          id: captureId,
          patch: { text }
        });
        if (res && res.ok) updateHighlightNotes(captureId, text);
        toast.textContent = "✓ 已更新";
      } else if (screenshot && (screenshot.base64 || screenshot.dataUrl)) {
        const shot = screenshot;
        pendingScreenshot = null;
        let res;
        try {
          const payload = {
            type: "rc-save-screenshot",
            text,
            w: shot.w,
            h: shot.h,
            mime: shot.mime || "image/jpeg",
            pageTitle: document.title,
            pageUrl: location.href
          };
          if (shot.base64) {
            payload.base64 = shot.base64;
          } else if (typeof shot.dataUrl === "string" && shot.dataUrl.startsWith("data:image/")) {
            payload.dataUrl = shot.dataUrl;
          } else {
            throw new Error("missing screenshot base64");
          }
          res = await chrome.runtime.sendMessage(payload);
        } catch (e) {
          console.warn("[RecordU] 截图保存失败", e);
          toast.textContent = "保存失败";
          toast.classList.add("show");
          setTimeout(close, 900);
          return;
        }
        if (chrome.runtime.lastError || !res || !res.ok) {
          console.warn(
            "[RecordU] 截图保存失败",
            (chrome.runtime.lastError && chrome.runtime.lastError.message) ||
              (res && res.error) ||
              res
          );
          toast.textContent = "保存失败";
          toast.classList.add("show");
          setTimeout(close, 900);
          return;
        }
        if (shot.revokePreview) shot.revokePreview();
        toast.textContent = "✓ 已保存";
      } else {
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
        toast.textContent = "✓ 已保存";
      }

      toast.classList.add("show");
      setTimeout(close, 650);
    }

    overlay.querySelector(".rc-save").addEventListener("click", save);
    overlay.querySelector(".rc-close").addEventListener("click", close);
    const delBtn = overlay.querySelector(".rc-delete");
    if (delBtn) delBtn.addEventListener("click", removeCapture);

    textarea.focus();
  }

  function showOverlay(exactText) {
    openOverlay({ mode: "create", exactText });
  }

  function normalizeWordKeyLocal(word) {
    const trimmed = String(word || "").replace(/\s+/g, " ").trim();
    if (!trimmed) return "";
    return trimmed.replace(/[A-Za-z]+/g, (m) => m.toLowerCase());
  }

  function findCachedWord(wordText) {
    const key = normalizeWordKeyLocal(wordText);
    if (!key) return null;
    return cachedWords.find((w) => normalizeWordKeyLocal(w.word) === key) || null;
  }

  function captureIdFromSelection() {
    const sel = window.getSelection();
    if (!sel || !sel.anchorNode) return null;
    const el =
      sel.anchorNode.nodeType === Node.ELEMENT_NODE
        ? sel.anchorNode
        : sel.anchorNode.parentElement;
    const h = el && el.closest && el.closest(".rc-highlight");
    return h && h.dataset.rcId ? h.dataset.rcId : null;
  }

  function upsertCachedWord(record) {
    if (!record || !record.id) return;
    const idx = cachedWords.findIndex((w) => w.id === record.id);
    if (idx >= 0) cachedWords[idx] = record;
    else cachedWords.push(record);
    wordsCacheFresh = true;
  }

  async function fetchStoredWord(wordText, wordId) {
    try {
      if (wordId) {
        const byId = await chrome.runtime.sendMessage({ type: "rc-get-word", id: wordId });
        if (byId && byId.ok && byId.word) return byId.word;
      }
      if (wordText) {
        const byKey = await chrome.runtime.sendMessage({
          type: "rc-find-word",
          word: wordText
        });
        if (byKey && byKey.ok && byKey.word) return byKey.word;
      }
    } catch (e) {}
    return findCachedWord(wordText);
  }

  function showWordOverlay(wordText, opts = {}) {
    hideFloatButton();
    const old = document.getElementById("rc-overlay");
    if (old) old.remove();

    const word = String(wordText || "").replace(/\s+/g, " ").trim();
    let wordId = opts.wordId || null;
    let initialNote = typeof opts.note === "string" ? opts.note : "";
    let initialPhonetic = typeof opts.phonetic === "string" ? opts.phonetic : "";
    let initialTranslation = typeof opts.translation === "string" ? opts.translation : "";
    let matchMode =
      opts.matchMode === "exact" || opts.matchMode === "variant" ? opts.matchMode : "inherit";
    let learned = !!opts.learned;
    let isEdit = !!wordId;
    let lookupGen = 0;

    const overlay = document.createElement("div");
    overlay.id = "rc-overlay";
    const ctx = word
      ? `<div class="rc-ctx"><span class="rc-q">单词</span>${escapeHtml(word)}</div>`
      : "";

    overlay.innerHTML = `
      <style>${STYLE}</style>
      <div class="rc-head">
        <span class="rc-head-title">${isEdit ? "编辑单词" : "标记单词"}</span>
        <button type="button" class="rc-close" title="关闭" aria-label="关闭">×</button>
      </div>
      ${ctx}
      <div class="rc-lookup" aria-live="polite">
        <div class="rc-lookup-status">正在查询…</div>
        <div class="rc-lookup-fields" hidden>
          <label class="rc-field">
            <span>音标</span>
            <div class="rc-field-row">
              <div class="rc-readonly rc-phonetic"></div>
              <button type="button" class="rc-speak" title="朗读" aria-label="朗读"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M2.5 6.5h2L7.5 4v8l-3-2.5h-2z"/><path d="M10 6a3.2 3.2 0 010 4"/><path d="M11.6 4.4a5.6 5.6 0 010 7.2"/></svg></button>
            </div>
          </label>
          <label class="rc-field">
            <span>翻译</span>
            <div class="rc-readonly rc-translation"></div>
          </label>
        </div>
        <div class="rc-lookup-error" hidden>
          <span class="rc-lookup-error-text"></span>
          <button type="button" class="rc-lookup-retry">重试</button>
        </div>
      </div>
      <textarea class="rc-input" rows="3" placeholder="释义或备注……"></textarea>
      <div class="rc-match" role="radiogroup" aria-label="匹配规则">
        <span class="rc-match-label">匹配</span>
        <label class="rc-match-opt"><input type="radio" name="rc-word-match" value="inherit" ${matchMode === "inherit" ? "checked" : ""}><span>跟随全局</span></label>
        <label class="rc-match-opt"><input type="radio" name="rc-word-match" value="variant" ${matchMode === "variant" ? "checked" : ""}><span>变体</span></label>
        <label class="rc-match-opt"><input type="radio" name="rc-word-match" value="exact" ${matchMode === "exact" ? "checked" : ""}><span>精准</span></label>
      </div>
      <div class="rc-actions">
        <button type="button" class="rc-save">保存</button>
        <button type="button" class="rc-learn" hidden>学会了</button>
        <button type="button" class="rc-delete" hidden>取消标记</button>
      </div>
      <div class="rc-toast">✓ 已标记</div>
    `;

    document.documentElement.appendChild(overlay);
    positionOverlay(overlay, opts.anchorRect || null);
    bindOverlayDrag(overlay);
    requestAnimationFrame(() => overlay.classList.add("rc-show"));

    const headTitle = overlay.querySelector(".rc-head-title");
    const textarea = overlay.querySelector(".rc-input");
    const phoneticEl = overlay.querySelector(".rc-phonetic");
    const translationEl = overlay.querySelector(".rc-translation");
    const statusEl = overlay.querySelector(".rc-lookup-status");
    const fieldsEl = overlay.querySelector(".rc-lookup-fields");
    const errorEl = overlay.querySelector(".rc-lookup-error");
    const errorTextEl = overlay.querySelector(".rc-lookup-error-text");
    const retryBtn = overlay.querySelector(".rc-lookup-retry");
    const delBtn = overlay.querySelector(".rc-delete");
    const learnBtn = overlay.querySelector(".rc-learn");
    const toast = overlay.querySelector(".rc-toast");
    const speakBtn = overlay.querySelector(".rc-speak");
    if (speakBtn) {
      speakBtn.addEventListener("click", () => speakWordText(word));
    }

    phoneticEl.textContent = initialPhonetic;
    translationEl.textContent = initialTranslation;
    textarea.value = initialNote;
    fieldsEl.hidden = false;
    if (initialPhonetic.trim() && initialTranslation.trim()) {
      statusEl.hidden = true;
    }

    function syncLearnUi() {
      learnBtn.hidden = !isEdit;
      learnBtn.textContent = learned ? "还在学" : "学会了";
      learnBtn.classList.toggle("is-learned", learned);
    }

    if (isEdit) delBtn.hidden = false;
    syncLearnUi();

    const snap = {
      phonetic: initialPhonetic,
      translation: initialTranslation,
      note: initialNote
    };

    function setMatchModeUi(mode) {
      const value = mode === "exact" || mode === "variant" ? mode : "inherit";
      overlay.querySelectorAll('input[name="rc-word-match"]').forEach((el) => {
        el.checked = el.value === value;
      });
      matchMode = value;
    }

    function applyStoredWord(stored) {
      if (!stored) return;
      wordId = stored.id || wordId;
      isEdit = !!wordId;
      learned = !!stored.learned;
      if (headTitle) headTitle.textContent = isEdit ? "编辑单词" : "标记单词";
      delBtn.hidden = !isEdit;
      syncLearnUi();
      if (!phoneticEl.textContent.trim() && stored.phonetic) {
        phoneticEl.textContent = stored.phonetic;
        snap.phonetic = stored.phonetic;
      }
      if (!translationEl.textContent.trim() && stored.translation) {
        translationEl.textContent = stored.translation;
        snap.translation = stored.translation;
      }
      if (!textarea.value.trim() && stored.note) {
        textarea.value = stored.note;
        snap.note = stored.note;
      }
      if (stored.matchMode) setMatchModeUi(stored.matchMode);
      upsertCachedWord(stored);
    }

    function selectedMatchMode() {
      const checked = overlay.querySelector('input[name="rc-word-match"]:checked');
      const v = checked && checked.value;
      return v === "exact" || v === "variant" ? v : "inherit";
    }

    let unbindOutside = null;
    function close() {
      if (unbindOutside) {
        unbindOutside();
        unbindOutside = null;
      }
      lookupGen += 1;
      overlay.remove();
    }
    unbindOutside = bindOverlayOutsideClose(overlay, close);

    function showLookupLoading() {
      statusEl.hidden = false;
      statusEl.textContent = "正在查询…";
      errorEl.hidden = true;
    }

    function showLookupError(msg) {
      statusEl.hidden = true;
      errorEl.hidden = false;
      errorTextEl.textContent = msg;
    }

    function showLookupIdle() {
      statusEl.hidden = true;
      errorEl.hidden = true;
    }

    function applyLookupResult(phonetic, translation) {
      const ph = String(phonetic || "").trim();
      const tr = String(translation || "").trim();
      if (phoneticEl.textContent === snap.phonetic) {
        phoneticEl.textContent = ph;
        snap.phonetic = ph;
      }
      if (translationEl.textContent === snap.translation) {
        translationEl.textContent = tr;
        snap.translation = tr;
      }
      showLookupIdle();
    }

    async function runLookup(lookupOpts = {}) {
      if (!word) {
        showLookupIdle();
        return;
      }
      const force = !!lookupOpts.force;
      if (!force && phoneticEl.textContent.trim() && translationEl.textContent.trim()) {
        showLookupIdle();
        return;
      }
      const gen = ++lookupGen;
      showLookupLoading();
      snap.phonetic = phoneticEl.textContent;
      snap.translation = translationEl.textContent;
      snap.note = textarea.value;
      let res;
      try {
        res = await chrome.runtime.sendMessage({ type: "rc-lookup-word", word });
      } catch (e) {
        if (gen !== lookupGen) return;
        showLookupError("查询失败，请重试");
        return;
      }
      if (gen !== lookupGen) return;
      if (chrome.runtime.lastError || !res || !res.ok) {
        const code = res && res.code;
        if (code === "need_key") {
          showLookupError("请到设置 → 大模型 填写 API Key");
        } else if (code === "auth") {
          showLookupError("API Key 无效或无权限");
        } else if (code === "network") {
          showLookupError("网络错误，请重试");
        } else {
          showLookupError((res && res.error) || "查询失败，请重试");
        }
        return;
      }
      applyLookupResult(res.phonetic, res.translation);
    }

    async function removeWord() {
      if (!wordId) return;
      const res = await chrome.runtime.sendMessage({ type: "rc-delete-word", id: wordId });
      if (chrome.runtime.lastError || !res || !res.ok) {
        toast.textContent = "取消失败";
        toast.classList.add("show");
        setTimeout(() => toast.classList.remove("show"), 900);
        return;
      }
      cachedWords = cachedWords.filter((w) => w.id !== wordId);
      wordsCacheFresh = true;
      toast.textContent = "✓ 已取消标记";
      toast.classList.add("show");
      scheduleWordReconcile(50);
      setTimeout(close, 650);
    }

    async function toggleLearned() {
      if (!wordId || !isEdit) return;
      const next = !learned;
      const res = await chrome.runtime.sendMessage({
        type: "rc-update-word",
        id: wordId,
        patch: { learned: next }
      });
      if (chrome.runtime.lastError || !res || !res.ok) {
        toast.textContent = "更新失败";
        toast.classList.add("show");
        setTimeout(() => toast.classList.remove("show"), 900);
        return;
      }
      if (res.word) {
        upsertCachedWord(res.word);
        learned = !!res.word.learned;
      } else {
        learned = next;
      }
      syncLearnUi();
      toast.textContent = learned ? "✓ 已学会" : "✓ 还在学";
      toast.classList.add("show");
      scheduleWordReconcile(50);
      setTimeout(() => toast.classList.remove("show"), 900);
    }

    async function save() {
      if (!word) {
        close();
        return;
      }
      const note = textarea.value.trim();
      const phonetic = phoneticEl.textContent.trim();
      const translation = translationEl.textContent.trim();
      matchMode = selectedMatchMode();
      let res;
      if (isEdit && wordId) {
        res = await chrome.runtime.sendMessage({
          type: "rc-update-word",
          id: wordId,
          patch: { note, phonetic, translation, matchMode }
        });
      } else {
        res = await chrome.runtime.sendMessage({
          type: "rc-save-word",
          word,
          note,
          phonetic,
          translation,
          matchMode,
          pageTitle: document.title,
          pageUrl: location.href
        });
      }
      if (chrome.runtime.lastError || !res || !res.ok) {
        toast.textContent = "保存失败";
        toast.classList.add("show");
        setTimeout(close, 900);
        return;
      }
      if (res.word) upsertCachedWord(res.word);
      toast.textContent = isEdit ? "✓ 已更新" : "✓ 已标记";
      toast.classList.add("show");
      scheduleWordReconcile(80);
      setTimeout(close, 650);
    }

    async function bootstrap() {
      const stored = await fetchStoredWord(word, wordId);
      if (stored) applyStoredWord(stored);
      if (phoneticEl.textContent.trim() && translationEl.textContent.trim()) {
        showLookupIdle();
        return;
      }
      await runLookup();
    }

    overlay.querySelector(".rc-save").addEventListener("click", save);
    overlay.querySelector(".rc-close").addEventListener("click", close);
    delBtn.addEventListener("click", removeWord);
    learnBtn.addEventListener("click", toggleLearned);
    retryBtn.addEventListener("click", () => runLookup({ force: true }));
    textarea.focus();
    bootstrap();
  }

  async function showEditOverlay(captureId, anchorRect) {
    try {
      const res = await chrome.runtime.sendMessage({ type: "rc-get-one", id: captureId });
      const capture = res && res.capture;
      if (!capture) return;
      const exactText = (capture.anchor && capture.anchor.exact) || "";
      let screenshot = null;
      if (capture.type === "screenshot") {
        const shot = await chrome.runtime.sendMessage({ type: "rc-get-screenshot", id: captureId });
        if (shot && shot.dataUrl) screenshot = { dataUrl: shot.dataUrl, w: shot.w, h: shot.h };
      }
      openOverlay({
        mode: "edit",
        title: "编辑感触",
        exactText,
        initialText: capture.text || "",
        captureId,
        anchorRect,
        screenshot
      });
    } catch (e) {
      console.warn("[RecordU] 无法打开编辑", e);
    }
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
    if (parent.closest(`script, style, noscript, textarea, ${OWN_UI_SEL}`)) {
      return NodeFilter.FILTER_REJECT;
    }
    if (skipHighlights === "word") {
      if (parent.closest(".rc-word-highlight")) return NodeFilter.FILTER_REJECT;
    } else if (skipHighlights && parent.closest(".rc-highlight, .rc-word-highlight")) {
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

  function rangeBoundsInMapComparePoint(range, charMap) {
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

  function rangeBoundsInMap(range, charMap) {
    if (!charMap.length) return null;
    const sc = range.startContainer;
    const ec = range.endContainer;
    const so = range.startOffset;
    const eo = range.endOffset;

    if (sc.nodeType !== Node.TEXT_NODE || ec.nodeType !== Node.TEXT_NODE) {
      return rangeBoundsInMapComparePoint(range, charMap);
    }

    let start = -1;
    let end = -1;
    let lastNode = null;
    let nodeBeforeEc = true;

    for (let i = 0; i < charMap.length; i++) {
      const { node, offset } = charMap[i];
      if (start < 0) {
        if (node === sc && offset >= so) start = i;
        else continue;
      }

      if (node !== lastNode) {
        lastNode = node;
        if (node === ec || node === sc) {
          nodeBeforeEc = true;
        } else {
          const pos = node.compareDocumentPosition(ec);
          nodeBeforeEc =
            !!(pos & Node.DOCUMENT_POSITION_FOLLOWING) ||
            !!(pos & Node.DOCUMENT_POSITION_CONTAINS);
        }
      }

      if (node === ec) {
        if (offset < eo) end = i + 1;
        else break;
      } else if (nodeBeforeEc) {
        end = i + 1;
      } else {
        break;
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

  function locateByQuote(anchor, map) {
    const exact = normalizeWs(anchor.exact);
    if (!exact) return null;
    const { normText, charMap } = map || buildTextMap({ skipHighlights: true });
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

  function locateByPosition(anchor, map) {
    if (typeof anchor.start !== "number" || typeof anchor.end !== "number") return null;
    if (anchor.start < 0 || anchor.end <= anchor.start) return null;

    const exact = normalizeWs(anchor.exact);
    if (!exact) return null;
    const { normText, charMap } = map || buildTextMap({ skipHighlights: true });
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

  function locateAnchor(anchor, map) {
    if (!anchor || !anchor.exact) return null;
    const byQuote = locateByQuote(anchor, map);
    if (byQuote && byQuote.length) return byQuote;
    const byPos = locateByPosition(anchor, map);
    if (byPos && byPos.length) return byPos;
    return null;
  }

  function wrapTextRange(node, start, end, id, note) {
    if (!node || !node.parentNode || start >= end) return;
    if (node.parentElement && node.parentElement.closest(".rc-highlight, .rc-word-highlight")) return;

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

  // ---------- click highlight to edit / unmark ----------

  on(
    document,
    "click",
    (e) => {
      const wordEl = e.target.closest && e.target.closest(".rc-word-highlight");
      if (wordEl) {
        if (document.getElementById("rc-overlay")) return;
        e.preventDefault();
        e.stopPropagation();
        hideWordTip();
        const word = wordEl.dataset.rcWord || wordEl.textContent || "";
        const wordId = wordEl.dataset.rcWordId || null;
        const existing = wordId
          ? cachedWords.find((w) => w.id === wordId) || {
              id: wordId,
              note: wordEl.dataset.rcNote || ""
            }
          : findCachedWord(word);
        showWordOverlay(word, {
          wordId: existing && existing.id,
          note: (existing && existing.note) || wordEl.dataset.rcNote || "",
          phonetic: (existing && existing.phonetic) || "",
          translation: (existing && existing.translation) || "",
          matchMode: (existing && existing.matchMode) || "inherit",
          learned: !!(existing && existing.learned),
          anchorRect: wordEl.getBoundingClientRect()
        });
        return;
      }
      const h = e.target.closest && e.target.closest(".rc-highlight");
      if (!h || !h.dataset.rcId) return;
      if (document.getElementById("rc-overlay")) return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().trim()) return;
      e.preventDefault();
      e.stopPropagation();
      showEditOverlay(h.dataset.rcId, h.getBoundingClientRect());
    },
    true
  );

  function hideWordTip() {
    if (wordTipHideTimer) {
      clearTimeout(wordTipHideTimer);
      wordTipHideTimer = null;
    }
    if (wordTipEl) {
      wordTipEl.remove();
      wordTipEl = null;
    }
  }

  function tipTextForWordEl(wordEl) {
    let phonetic = (wordEl.dataset.rcPhonetic || "").trim();
    let note = (wordEl.dataset.rcNote || "").trim();
    let translation = (wordEl.dataset.rcTranslation || "").trim();

    if (!phonetic || (!note && !translation)) {
      const wordId = wordEl.dataset.rcWordId || null;
      const word = wordEl.dataset.rcWord || wordEl.textContent || "";
      const existing = wordId
        ? cachedWords.find((w) => w.id === wordId)
        : findCachedWord(word);
      if (existing) {
        if (!phonetic) phonetic = (existing.phonetic || "").trim();
        if (!note) note = (existing.note || "").trim();
        if (!translation) translation = (existing.translation || "").trim();
      }
    }

    const meaning = note || translation;
    if (phonetic && meaning) return `${phonetic}\n${meaning}`;
    if (phonetic) return phonetic;
    return meaning;
  }

  function showWordTip(wordEl) {
    const tip = tipTextForWordEl(wordEl);
    if (!tip) {
      hideWordTip();
      return;
    }
    hideWordTip();
    const el = document.createElement("div");
    el.id = "rc-word-tip";
    el.setAttribute("role", "tooltip");
    el.style.cssText = [
      "position:fixed",
      "z-index:2147483646",
      "max-width:260px",
      "padding:7px 11px",
      "background:#000000",
      "color:#ffffff",
      "font:700 12px/1.5 'Helvetica Neue',Helvetica,Arial,'PingFang SC','Heiti SC','Microsoft YaHei',sans-serif",
      "border-radius:0",
      "box-shadow:none",
      "pointer-events:none",
      "white-space:pre-wrap",
      "word-break:break-word",
      "opacity:0",
      "transition:opacity 0.12s ease"
    ].join(";");
    el.textContent = tip;
    document.documentElement.appendChild(el);

    const rect = wordEl.getBoundingClientRect();
    const w = el.offsetWidth || 140;
    const h = el.offsetHeight || 32;
    let x = rect.left;
    let y = rect.bottom + 6;
    if (x + w > window.innerWidth - 8) x = window.innerWidth - w - 8;
    if (x < 8) x = 8;
    if (y + h > window.innerHeight - 8) y = rect.top - h - 6;
    if (y < 8) y = 8;
    el.style.left = Math.round(x) + "px";
    el.style.top = Math.round(y) + "px";
    requestAnimationFrame(() => {
      el.style.opacity = "1";
    });
    wordTipEl = el;
  }

  on(
    document,
    "mouseover",
    (e) => {
      const wordEl = e.target.closest && e.target.closest(".rc-word-highlight");
      if (!wordEl) return;
      if (document.getElementById("rc-overlay")) return;
      const from = e.relatedTarget;
      if (from && wordEl.contains(from)) return;
      showWordTip(wordEl);
    },
    true
  );

  on(
    document,
    "mouseout",
    (e) => {
      const wordEl = e.target.closest && e.target.closest(".rc-word-highlight");
      if (!wordEl) return;
      const to = e.relatedTarget;
      if (to && wordEl.contains(to)) return;
      if (wordTipHideTimer) clearTimeout(wordTipHideTimer);
      wordTipHideTimer = setTimeout(hideWordTip, 80);
    },
    true
  );

  on(window, "scroll", hideWordTip, true);

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
        if (parent && parent.closest(`.rc-highlight, .rc-word-highlight, ${OWN_UI_SEL}`)) continue;
        return true;
      }
      const nodes = [...m.addedNodes, ...m.removedNodes];
      for (const n of nodes) {
        if (n.nodeType === Node.ELEMENT_NODE) {
          if (n.id === "rc-overlay" || n.id === "rc-float-bar" || n.id === "rc-region-mask" || n.id === "rc-word-tip") continue;
          if (n.classList && (n.classList.contains("rc-highlight") || n.classList.contains("rc-word-highlight"))) continue;
          if (n.closest && n.closest(OWN_UI_SEL)) continue;
          return true;
        }
        if (n.nodeType === Node.TEXT_NODE) {
          const parent = n.parentElement;
          if (parent && parent.closest(`.rc-highlight, .rc-word-highlight, ${OWN_UI_SEL}`)) continue;
          return true;
        }
      }
    }
    return false;
  }

  async function ensureCapturesCache() {
    if (cachedCaptures) return cachedCaptures;
    try {
      const res = await chrome.runtime.sendMessage({ type: "rc-get-page" });
      cachedCaptures = (res && res.captures) || [];
    } catch (e) {
      return cachedCaptures || [];
    }
    return cachedCaptures;
  }

  async function ensureWordsCache() {
    if (wordsCacheFresh) return cachedWords;
    try {
      const res = await chrome.runtime.sendMessage({ type: "rc-get-all-words" });
      cachedWords = (res && res.words) || [];
      wordsCacheFresh = true;
    } catch (e) {
      return cachedWords;
    }
    return cachedWords;
  }

  async function reconcileHighlights() {
    if (!cachedSettings) {
      await loadHighlightSettings();
    }
    if (isHighlightBlocked()) {
      clearAllPageHighlights();
      return;
    }
    let all = [];
    try {
      all = await ensureCapturesCache();
    } catch (e) {
      return;
    }
    const captures = all.filter((c) => c.anchor && c.anchor.exact && samePage(c.pageUrl));
    const ids = new Set(captures.map((c) => c.id));

    document.querySelectorAll("span.rc-highlight").forEach((el) => {
      if (!ids.has(el.dataset.rcId)) unwrapHighlight(el);
    });

    const needLocate = [];
    let matched = 0;
    for (const c of captures) {
      const existing = document.querySelectorAll(
        `span.rc-highlight[data-rc-id="${CSS.escape(c.id)}"]`
      );
      if (existing.length) {
        updateHighlightNotes(c.id, c.text);
        matched++;
      } else {
        needLocate.push(c);
      }
    }

    const sharedMap = needLocate.length ? buildTextMap({ skipHighlights: true }) : null;
    for (const c of needLocate) {
      const fragments = locateAnchor(c.anchor, sharedMap);
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
      if (failCount <= 12) scheduleReconcilePass(null, { idea: true });
    } else {
      failCount = 0;
      // All matched: keep observer alive but idle; it wakes on real DOM changes.
      ensureObserver();
    }
  }

  function scheduleReconcilePass(delay, opts) {
    if (!opts) opts = {};
    if (opts.idea) pendingPass.idea = true;
    if (opts.wordFull) {
      pendingPass.wordFull = true;
      pendingPass.wordIncremental = false;
      dirtyWordRoots.clear();
    } else if (opts.wordIncremental && !pendingPass.wordFull) {
      pendingPass.wordIncremental = true;
      if (opts.roots) {
        for (const r of opts.roots) {
          if (r && r.nodeType === Node.ELEMENT_NODE && r.isConnected) dirtyWordRoots.add(r);
        }
      }
    }

    let d = delay;
    if (d == null) {
      if (pendingPass.wordFull || pendingPass.wordIncremental) d = 350;
      else d = Math.min(400 * Math.pow(1.45, failCount), 6000);
    }

    if (reconcilePassTimer) clearTimeout(reconcilePassTimer);
    reconcilePassTimer = setTimeout(() => {
      reconcilePassTimer = null;
      runReconcilePass();
    }, d);
  }

  async function runReconcilePass() {
    if (reconcilePassRunning) {
      if (!reconcilePassTimer) {
        reconcilePassTimer = setTimeout(() => {
          reconcilePassTimer = null;
          runReconcilePass();
        }, MUTATION_RECONCILE_MS);
      }
      return;
    }
    if (!pendingPass.idea && !pendingPass.wordFull && !pendingPass.wordIncremental) return;

    const doIdea = pendingPass.idea;
    const wordFull = pendingPass.wordFull;
    const wordInc = pendingPass.wordIncremental && !wordFull;
    const roots = wordInc ? [...dirtyWordRoots] : [];
    pendingPass = { idea: false, wordFull: false, wordIncremental: false };
    dirtyWordRoots.clear();

    reconcilePassRunning = true;
    try {
      if (doIdea) await reconcileHighlights();
      if (wordFull) await reconcileWordHighlights({ full: true });
      else if (wordInc) await reconcileWordHighlights({ full: false, roots });
    } finally {
      reconcilePassRunning = false;
      if (pendingPass.idea || pendingPass.wordFull || pendingPass.wordIncremental) {
        scheduleReconcilePass(0, {});
      }
    }
  }

  /** Back-compat helpers for local call sites. */
  function scheduleReconcile(delay) {
    scheduleReconcilePass(delay, { idea: true });
  }

  function scheduleWordReconcile(delay) {
    scheduleReconcilePass(delay, { wordFull: true });
  }

  // ---------- word highlights (global) ----------

  function isLatinWord(word) {
    return /^[A-Za-z0-9][A-Za-z0-9'\-]*$/.test(word);
  }

  /** Keep in sync with isLatinWord: hyphen/apostrophe stay inside one token (e.g. high-profile, don't). */
  function isWordChar(ch) {
    return /[A-Za-z0-9'\-]/.test(ch);
  }

  /** Longest-first English suffixes for stem derivation. */
  const LATIN_STEM_SUFFIXES = [
    "ingly",
    "tions",
    "ments",
    "ings",
    "tion",
    "sion",
    "ment",
    "ness",
    "able",
    "ible",
    "less",
    "ful",
    "ous",
    "ive",
    "ial",
    "ies",
    "ied",
    "ers",
    "est",
    "ing",
    "ion",
    "ions",
    "ly",
    "er",
    "al",
    "ic",
    "es",
    "ed",
    "en",
    "s",
    "y",
    "d",
    "n"
  ];

  const LATIN_WORD_SUFFIX =
    /^(s|es|ed|ing|ings|ingly|er|ers|est|ly|ies|ied|ion|ions|tion|tions|ment|ments|ness|able|ible|ful|less|ous|ive|al|ial|ic|y|d|en|n)$/i;

  function deriveLatinStem(lower) {
    if (!lower || lower.length < 5) return lower || "";
    for (const suf of LATIN_STEM_SUFFIXES) {
      if (lower.length - suf.length >= 4 && lower.endsWith(suf)) {
        return lower.slice(0, -suf.length);
      }
    }
    return lower;
  }

  function isSuffixRest(rest) {
    return rest.length > 0 && LATIN_WORD_SUFFIX.test(rest);
  }

  /**
   * Match page token to saved Latin word.
   * exact: whole-token equality; variant: bidirectional stem / common suffixes.
   */
  function latinTokenMatches(tokenLower, wordLower, mode) {
    if (!tokenLower || !wordLower) return false;
    if (tokenLower === wordLower) return true;
    if (mode === "exact") return false;

    const stemT = deriveLatinStem(tokenLower);
    const stemW = deriveLatinStem(wordLower);
    if (stemW.length >= 4 && stemT === stemW) return true;

    if (wordLower.length >= 4 && tokenLower.startsWith(wordLower) && isSuffixRest(tokenLower.slice(wordLower.length))) {
      return true;
    }
    if (tokenLower.length >= 4 && wordLower.startsWith(tokenLower) && isSuffixRest(wordLower.slice(tokenLower.length))) {
      return true;
    }
    return false;
  }

  function unwrapWordHighlight(el) {
    el.replaceWith(...el.childNodes);
  }

  function wrapWordRange(node, start, end, id, word, tip) {
    if (!node || !node.parentNode || start >= end) return;
    if (node.parentElement && node.parentElement.closest(".rc-word-highlight")) return;

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
    span.className = "rc-word-highlight";
    span.dataset.rcWordId = id;
    span.dataset.rcWord = word;
    if (tip.note) span.dataset.rcNote = tip.note;
    if (tip.translation) span.dataset.rcTranslation = tip.translation;
    if (tip.phonetic) span.dataset.rcPhonetic = tip.phonetic;
    target.parentNode.replaceChild(span, target);
    span.appendChild(target);
  }

  function findWordMatchesInNode(nodeValue, word, latin, mode) {
    const matches = [];
    if (!nodeValue || !word) return matches;
    if (latin) {
      const lowerWord = word.toLowerCase();
      let i = 0;
      while (i < nodeValue.length) {
        if (!isWordChar(nodeValue[i])) {
          i++;
          continue;
        }
        let j = i + 1;
        while (j < nodeValue.length && isWordChar(nodeValue[j])) j++;
        const tokenLower = nodeValue.slice(i, j).toLowerCase();
        if (latinTokenMatches(tokenLower, lowerWord, mode)) {
          matches.push({ start: i, end: j });
        }
        i = j;
      }
    } else {
      let from = 0;
      while (from <= nodeValue.length - word.length) {
        const idx = nodeValue.indexOf(word, from);
        if (idx < 0) break;
        matches.push({ start: idx, end: idx + word.length });
        from = idx + word.length;
      }
    }
    return matches;
  }

  function countExistingWordHighlights() {
    const counts = new Map();
    document.querySelectorAll("span.rc-word-highlight").forEach((el) => {
      const id = el.dataset.rcWordId;
      if (!id) return;
      counts.set(id, (counts.get(id) || 0) + 1);
    });
    return counts;
  }

  function buildActiveWordMatchers(words) {
    const matchers = [];
    for (const w of words) {
      if (!w || w.learned || !w.word || !w.id) continue;
      matchers.push({
        entry: w,
        word: w.word,
        latin: isLatinWord(w.word),
        mode: resolveWordMatchMode(w)
      });
    }
    return matchers;
  }

  function collectWordHighlightPlans(root, matchers, counts) {
    const planned = [];
    if (!root || !matchers.length) return planned;

    function overlapsPlanned(node, start, end) {
      for (const p of planned) {
        if (p.node !== node) continue;
        if (start < p.end && p.start < end) return true;
      }
      return false;
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return acceptTextNode(node, "word");
      }
    });

    while (walker.nextNode()) {
      const node = walker.currentNode;
      const value = node.nodeValue;
      if (!value) continue;
      for (const m of matchers) {
        const used = counts.get(m.entry.id) || 0;
        if (used >= WORD_HL_MAX) continue;
        const hits = findWordMatchesInNode(value, m.word, m.latin, m.mode);
        for (const hit of hits) {
          const n = counts.get(m.entry.id) || 0;
          if (n >= WORD_HL_MAX) break;
          if (overlapsPlanned(node, hit.start, hit.end)) continue;
          planned.push({
            node,
            start: hit.start,
            end: hit.end,
            entry: m.entry
          });
          counts.set(m.entry.id, n + 1);
        }
      }
    }
    return planned;
  }

  function sortAndWrapWordPlans(planned) {
    const sorted = planned.slice().sort((a, b) => {
      if (a.node === b.node) return b.start - a.start;
      const pos = a.node.compareDocumentPosition(b.node);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return 1;
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return -1;
      return 0;
    });

    for (const frag of sorted) {
      if (!frag.node || !frag.node.isConnected) continue;
      const entry = frag.entry;
      wrapWordRange(frag.node, frag.start, frag.end, entry.id, entry.word, {
        note: entry.note || "",
        translation: entry.translation || "",
        phonetic: entry.phonetic || ""
      });
    }
    return sorted.length;
  }

  function unwrapAllWordHighlights() {
    document.querySelectorAll("span.rc-word-highlight").forEach((el) => {
      unwrapWordHighlight(el);
    });
  }

  function normalizeDirtyRoots(roots) {
    const list = [];
    for (const r of roots || []) {
      if (!r || r.nodeType !== Node.ELEMENT_NODE || !r.isConnected) continue;
      if (r.closest && r.closest(OWN_UI_SEL)) continue;
      list.push(r);
    }
    if (!list.length) return [];

    // Drop roots contained by another dirty root.
    const filtered = [];
    for (const r of list) {
      let contained = false;
      for (const o of list) {
        if (o !== r && o.contains(r)) {
          contained = true;
          break;
        }
      }
      if (!contained) filtered.push(r);
    }
    return filtered;
  }

  function collectWordDirtyFromMutations(mutations) {
    const roots = [];
    let forceFull = false;
    let removedHighlightParent = false;

    for (const m of mutations) {
      if (m.type === "characterData") {
        const parent = m.target && m.target.parentElement;
        if (parent) roots.push(parent);
        continue;
      }

      for (const n of m.removedNodes) {
        if (n.nodeType !== Node.ELEMENT_NODE) continue;
        const hadWordHl =
          (n.classList && n.classList.contains("rc-word-highlight")) ||
          (n.querySelector && n.querySelector("span.rc-word-highlight"));
        if (hadWordHl) {
          removedHighlightParent = true;
          if (m.target && m.target.nodeType === Node.ELEMENT_NODE) roots.push(m.target);
        }
      }

      for (const n of m.addedNodes) {
        if (n.nodeType === Node.ELEMENT_NODE) {
          if (n.id === "rc-overlay" || n.id === "rc-float-bar" || n.id === "rc-region-mask" || n.id === "rc-word-tip") {
            continue;
          }
          if (n.classList && (n.classList.contains("rc-highlight") || n.classList.contains("rc-word-highlight"))) {
            continue;
          }
          if (n.closest && n.closest(OWN_UI_SEL)) continue;
          roots.push(n);
        } else if (n.nodeType === Node.TEXT_NODE && n.parentElement) {
          roots.push(n.parentElement);
        }
      }
    }

    const normalized = normalizeDirtyRoots(roots);
    if (normalized.length >= WORD_DIRTY_ROOT_FULL_THRESHOLD) forceFull = true;
    for (const r of normalized) {
      if (r === document.body || r === document.documentElement) forceFull = true;
    }
    // Large subtree swaps that drop old highlights: prefer full rebuild for correctness.
    if (removedHighlightParent && normalized.length > 8) forceFull = true;

    return { roots: normalized, forceFull };
  }

  async function reconcileWordHighlights(options) {
    const opts = options || { full: true };
    if (!cachedSettings) {
      await loadHighlightSettings();
    }
    if (isHighlightBlocked()) {
      clearAllPageHighlights();
      return;
    }

    let words;
    try {
      words = await ensureWordsCache();
    } catch (e) {
      return;
    }

    const matchers = buildActiveWordMatchers(words);
    applyingWordHighlight = true;
    try {
      if (opts.full) {
        unwrapAllWordHighlights();
        const counts = new Map();
        const planned = collectWordHighlightPlans(document.body, matchers, counts);
        sortAndWrapWordPlans(planned);
      } else {
        const roots = normalizeDirtyRoots(opts.roots || []);
        if (!roots.length) return;
        // Unwrap word highlights inside dirty roots so text nodes are scannable again.
        for (const root of roots) {
          root.querySelectorAll("span.rc-word-highlight").forEach((el) => {
            unwrapWordHighlight(el);
          });
          if (root.classList && root.classList.contains("rc-word-highlight")) {
            unwrapWordHighlight(root);
          }
        }
        const counts = countExistingWordHighlights();
        const planned = [];
        for (const root of roots) {
          if (!root.isConnected) continue;
          planned.push(...collectWordHighlightPlans(root, matchers, counts));
        }
        sortAndWrapWordPlans(planned);
      }
    } finally {
      applyingWordHighlight = false;
      wordHlQuietUntil = Date.now() + 250;
    }
  }

  function ensureObserver() {
    if (observer || !document.body) return;
    observer = new MutationObserver((mutations) => {
      if (applyingHighlight || applyingWordHighlight) return;
      if (Date.now() < wordHlQuietUntil) return;
      if (!mutationTouchesContent(mutations)) return;

      const { roots, forceFull } = collectWordDirtyFromMutations(mutations);
      const pass = { idea: true };
      if (forceFull) pass.wordFull = true;
      else {
        pass.wordIncremental = true;
        pass.roots = roots;
      }
      // Do not reset failCount on every mutation; backoff stays until a successful full match.
      scheduleReconcilePass(MUTATION_RECONCILE_MS, pass);
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  function scheduleDelayedReconcilePasses(delays) {
    for (const ms of delays) {
      setTimeout(() => {
        scheduleReconcilePass(0, { idea: true, wordFull: true });
      }, ms);
    }
  }

  function onUrlMaybeChanged() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    failCount = 0;
    cachedCaptures = null;
    scheduleReconcilePass(100, { idea: true, wordFull: true });
    scheduleDelayedReconcilePasses([800, 2500]);
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
    scheduleReconcilePass(0, { idea: true, wordFull: true });
    ensureObserver();
    scheduleDelayedReconcilePasses([800, 2500]);
  }

  if (document.readyState === "loading") {
    on(document, "DOMContentLoaded", init);
  } else {
    init();
  }

  on(window, "pageshow", () => {
    failCount = 0;
    lastUrl = location.href;
    cachedCaptures = null;
    wordsCacheFresh = false;
    scheduleReconcilePass(0, { idea: true, wordFull: true });
    ensureObserver();
    scheduleDelayedReconcilePasses([800, 2500]);
  });

  // ---------- region screenshot ----------

  function tearDownRegionMask() {
    if (!regionMask) return;
    try {
      regionMask.remove();
    } catch (e) {}
    regionMask = null;
  }

  function waitFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }

  function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("image load failed"));
      img.src = dataUrl;
    });
  }

  function canvasToJpegBlob(canvas, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) reject(new Error("toBlob failed"));
          else resolve(blob);
        },
        "image/jpeg",
        quality
      );
    });
  }

  async function blobToBase64(blob) {
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const chunk = 0x8000;
    let binary = "";
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  async function cropVisibleToJpeg(dataUrl, rect) {
    const img = await loadImage(dataUrl);
    const dpr = window.devicePixelRatio || 1;
    const sx = Math.max(0, Math.round(rect.left * dpr));
    const sy = Math.max(0, Math.round(rect.top * dpr));
    const sw = Math.max(1, Math.round(rect.width * dpr));
    const sh = Math.max(1, Math.round(rect.height * dpr));
    const maxSide = 1200;
    const scale = Math.min(1, maxSide / Math.max(sw, sh));
    const dw = Math.max(1, Math.round(sw * scale));
    const dh = Math.max(1, Math.round(sh * scale));
    const canvas = document.createElement("canvas");
    canvas.width = dw;
    canvas.height = dh;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
    const blob = await canvasToJpegBlob(canvas, 0.72);
    const previewUrl = URL.createObjectURL(blob);
    const base64 = await blobToBase64(blob);
    return {
      dataUrl: previewUrl,
      base64,
      mime: "image/jpeg",
      w: dw,
      h: dh,
      revokePreview: () => {
        try {
          URL.revokeObjectURL(previewUrl);
        } catch (e) {}
      }
    };
  }

  async function finishRegionCapture(cssRect) {
    tearDownRegionMask();
    await waitFrame();
    let res;
    try {
      res = await chrome.runtime.sendMessage({ type: "rc-capture-visible" });
    } catch (e) {
      console.warn("[RecordU] captureVisible failed", e);
      return;
    }
    if (!res || !res.ok || !res.dataUrl) {
      console.warn("[RecordU] captureVisible error", res && res.error);
      return;
    }
    try {
      const shot = await cropVisibleToJpeg(res.dataUrl, cssRect);
      pendingScreenshot = shot;
      openOverlay({
        mode: "create",
        title: "截图批注",
        screenshot: shot,
        anchorRect: {
          left: cssRect.left,
          top: cssRect.top,
          right: cssRect.left + cssRect.width,
          bottom: cssRect.top + cssRect.height,
          width: cssRect.width,
          height: cssRect.height
        }
      });
    } catch (e) {
      console.warn("[RecordU] crop failed", e);
    }
  }

  function startRegionCapture() {
    if (regionMask) tearDownRegionMask();
    hideFloatButton();
    const old = document.getElementById("rc-overlay");
    if (old) old.remove();

    const mask = document.createElement("div");
    mask.id = "rc-region-mask";
    mask.innerHTML = `
      <style>${theme.regionCss || ""}</style>
      <div class="rc-region-tip">拖拽选择区域 · Esc 取消</div>
      <div class="rc-region-box"></div>
    `;
    document.documentElement.appendChild(mask);
    regionMask = mask;

    const box = mask.querySelector(".rc-region-box");
    let startX = 0;
    let startY = 0;
    let dragging = false;

    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        cleanupListeners();
        tearDownRegionMask();
      }
    }

    function cleanupListeners() {
      mask.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("mousemove", onMove, true);
      window.removeEventListener("mouseup", onUp, true);
      window.removeEventListener("keydown", onKey, true);
    }

    function onDown(e) {
      if (e.button !== 0) return;
      e.preventDefault();
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      box.style.display = "block";
      box.style.left = startX + "px";
      box.style.top = startY + "px";
      box.style.width = "0px";
      box.style.height = "0px";
    }

    function onMove(e) {
      if (!dragging) return;
      const x1 = Math.min(startX, e.clientX);
      const y1 = Math.min(startY, e.clientY);
      const x2 = Math.max(startX, e.clientX);
      const y2 = Math.max(startY, e.clientY);
      box.style.left = x1 + "px";
      box.style.top = y1 + "px";
      box.style.width = x2 - x1 + "px";
      box.style.height = y2 - y1 + "px";
    }

    function onUp(e) {
      if (!dragging) return;
      dragging = false;
      const x1 = Math.min(startX, e.clientX);
      const y1 = Math.min(startY, e.clientY);
      const x2 = Math.max(startX, e.clientX);
      const y2 = Math.max(startY, e.clientY);
      const w = x2 - x1;
      const h = y2 - y1;
      cleanupListeners();
      if (w < 8 || h < 8) {
        tearDownRegionMask();
        return;
      }
      finishRegionCapture({ left: x1, top: y1, width: w, height: h });
    }

    mask.addEventListener("mousedown", onDown, true);
    window.addEventListener("mousemove", onMove, true);
    window.addEventListener("mouseup", onUp, true);
    window.addEventListener("keydown", onKey, true);
  }

  function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }
})();
