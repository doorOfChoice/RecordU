import { escapeHtml } from "./shared/dom.js";
import { speakWord } from "./shared/tts.js";
import { bindDayMultiselect, dayMultiselectHtml } from "./shared/day-multiselect.js";
import { dayFilterFromChecks, normalizeDayFilter } from "./shared/quiz.js";

let current = null;

function build({ title, message, confirmText, cancelText, danger }) {
  const overlay = document.createElement("div");
  overlay.className = "rc-modal-overlay";
  overlay.innerHTML = `
    <div class="rc-modal" role="dialog" aria-modal="true">
      <div class="rc-modal-title">${escapeHtml(title || "")}</div>
      <div class="rc-modal-body">${escapeHtml(message || "")}</div>
      <div class="rc-modal-actions">
        <button type="button" class="btn rc-modal-cancel">${escapeHtml(cancelText || "取消")}</button>
        <button type="button" class="btn btn-primary ${danger ? "rc-modal-danger" : ""}">${escapeHtml(confirmText || "确定")}</button>
      </div>
    </div>
  `;
  return overlay;
}

function open(overlay) {
  if (current) current.resolve("cancel");

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("show"));

  const confirmBtn = overlay.querySelector(".btn-primary");
  const cancelBtn = overlay.querySelector(".rc-modal-cancel");
  confirmBtn.focus();

  return new Promise((resolve) => {
    current = { overlay, resolve };

    function done(result) {
      if (current && current.overlay === overlay) current = null;
      overlay.classList.remove("show");
      overlay.addEventListener("transitionend", () => overlay.remove(), { once: true });
      setTimeout(() => overlay.remove(), 250);
      document.removeEventListener("keydown", onKeydown);
      resolve(result);
    }

    function onKeydown(e) {
      if (e.key === "Escape") done("cancel");
      if (e.key === "Enter") done("confirm");
      if (e.key === "Tab") {
        const focusables = overlay.querySelectorAll("button:not([disabled])");
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    confirmBtn.addEventListener("click", () => done("confirm"));
    if (cancelBtn) cancelBtn.addEventListener("click", () => done("cancel"));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) done("cancel");
    });
    document.addEventListener("keydown", onKeydown);
  });
}

export function confirm(opts = {}) {
  const overlay = build({
    title: opts.title || "确认",
    message: opts.message || "",
    confirmText: opts.confirmText || "确定",
    cancelText: opts.cancelText || "取消",
    danger: opts.danger
  });
  return open(overlay).then((result) => {
    if (result === "confirm") {
      if (opts.onConfirm) opts.onConfirm();
      return true;
    }
    if (opts.onCancel) opts.onCancel();
    return false;
  });
}

export function alert(opts = {}) {
  const overlay = build({
    title: opts.title || "提示",
    message: opts.message || "",
    confirmText: opts.confirmText || "知道了",
    cancelText: null,
    danger: opts.danger
  });
  const cancel = overlay.querySelector(".rc-modal-cancel");
  if (cancel) cancel.remove();
  return open(overlay).then((result) => {
    if (result === "confirm" && opts.onConfirm) opts.onConfirm();
  });
}

/** Edit dialog with textarea. Resolves to trimmed string, or null if cancelled. */
export function promptEdit(opts = {}) {
  const overlay = document.createElement("div");
  overlay.className = "rc-modal-overlay";
  overlay.innerHTML = `
    <div class="rc-modal rc-modal-edit" role="dialog" aria-modal="true">
      <div class="rc-modal-title">${escapeHtml(opts.title || "编辑")}</div>
      <textarea class="rc-modal-input" rows="6" placeholder="${escapeHtml(opts.placeholder || "")}"></textarea>
      <div class="rc-modal-actions">
        <button type="button" class="btn rc-modal-cancel">${escapeHtml(opts.cancelText || "取消")}</button>
        <button type="button" class="btn btn-primary">${escapeHtml(opts.confirmText || "保存")}</button>
      </div>
    </div>
  `;
  const textarea = overlay.querySelector(".rc-modal-input");
  textarea.value = opts.value || "";

  if (current) current.resolve("cancel");
  document.body.appendChild(overlay);
  requestAnimationFrame(() => {
    overlay.classList.add("show");
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  });

  return new Promise((resolve) => {
    current = { overlay, resolve };

    function done(result) {
      if (current && current.overlay === overlay) current = null;
      overlay.classList.remove("show");
      overlay.addEventListener("transitionend", () => overlay.remove(), { once: true });
      setTimeout(() => overlay.remove(), 250);
      document.removeEventListener("keydown", onKeydown);
      resolve(result);
    }

    function onKeydown(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        done(null);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        done(textarea.value);
      }
    }

    overlay.querySelector(".btn-primary").addEventListener("click", () => done(textarea.value));
    overlay.querySelector(".rc-modal-cancel").addEventListener("click", () => done(null));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) done(null);
    });
    document.addEventListener("keydown", onKeydown);
  }).then((value) => {
    if (value == null || value === "cancel") return null;
    return String(value);
  });
}

/**
 * Word edit dialog. Resolves to { phonetic, translation, note, matchMode } or null.
 * @param {object} opts
 */
export function promptWordEdit(opts = {}) {
  const matchMode = opts.matchMode === "exact" || opts.matchMode === "variant" ? opts.matchMode : "inherit";
  const word = String(opts.word || "").trim();
  const overlay = document.createElement("div");
  overlay.className = "rc-modal-overlay";
  overlay.innerHTML = `
    <div class="rc-modal rc-modal-edit rc-modal-edit-word" role="dialog" aria-modal="true">
      <div class="rc-modal-title">${escapeHtml(opts.title || "编辑单词")}</div>
      <div class="rc-modal-field">
        <span class="rc-modal-field-label">单词</span>
        <div class="rc-modal-ro-row">
          <div class="rc-modal-ro-value">${escapeHtml(word)}</div>
          <button type="button" class="rc-modal-speak" title="朗读" aria-label="朗读"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M2.5 6.5h2L7.5 4v8l-3-2.5h-2z"/><path d="M10 6a3.2 3.2 0 010 4"/><path d="M11.6 4.4a5.6 5.6 0 010 7.2"/></svg></button>
        </div>
      </div>
      <div class="rc-modal-field">
        <span class="rc-modal-field-label">音标</span>
        <div class="rc-modal-ro-value">${escapeHtml(opts.phonetic || "")}</div>
      </div>
      <div class="rc-modal-field">
        <span class="rc-modal-field-label">翻译</span>
        <div class="rc-modal-ro-value">${escapeHtml(opts.translation || "")}</div>
      </div>
      <div class="rc-modal-field">
        <label for="rc-modal-note">备注</label>
        <textarea id="rc-modal-note" rows="4" placeholder="释义或备注……">${escapeHtml(opts.note || "")}</textarea>
      </div>
      <div class="rc-modal-field">
        <label for="rc-modal-match">匹配规则</label>
        <select id="rc-modal-match">
          <option value="inherit" ${matchMode === "inherit" ? "selected" : ""}>跟随全局</option>
          <option value="variant" ${matchMode === "variant" ? "selected" : ""}>变体匹配</option>
          <option value="exact" ${matchMode === "exact" ? "selected" : ""}>精准匹配</option>
        </select>
      </div>
      <div class="rc-modal-actions">
        <button type="button" class="btn rc-modal-cancel">${escapeHtml(opts.cancelText || "取消")}</button>
        <button type="button" class="btn btn-primary">${escapeHtml(opts.confirmText || "保存")}</button>
      </div>
    </div>
  `;

  const noteEl = overlay.querySelector("#rc-modal-note");
  const matchEl = overlay.querySelector("#rc-modal-match");
  const speakBtn = overlay.querySelector(".rc-modal-speak");
  if (speakBtn) {
    speakBtn.addEventListener("click", () => speakWord(word));
  }

  if (current) current.resolve("cancel");
  document.body.appendChild(overlay);
  requestAnimationFrame(() => {
    overlay.classList.add("show");
    noteEl.focus();
    noteEl.setSelectionRange(noteEl.value.length, noteEl.value.length);
  });

  return new Promise((resolve) => {
    current = { overlay, resolve };

    function collect() {
      const mode = matchEl.value;
      return {
        phonetic: String(opts.phonetic || "").trim(),
        translation: String(opts.translation || "").trim(),
        note: noteEl.value.trim(),
        matchMode: mode === "exact" || mode === "variant" ? mode : "inherit"
      };
    }

    function done(result) {
      if (current && current.overlay === overlay) current = null;
      overlay.classList.remove("show");
      overlay.addEventListener("transitionend", () => overlay.remove(), { once: true });
      setTimeout(() => overlay.remove(), 250);
      document.removeEventListener("keydown", onKeydown);
      resolve(result);
    }

    function onKeydown(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        done(null);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        done(collect());
      }
    }

    overlay.querySelector(".btn-primary").addEventListener("click", () => done(collect()));
    overlay.querySelector(".rc-modal-cancel").addEventListener("click", () => done(null));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) done(null);
    });
    document.addEventListener("keydown", onKeydown);
  }).then((value) => {
    if (value == null || value === "cancel") return null;
    return value;
  });
}

/**
 * Quiz generate dialog.
 * @param {{ maxCount: number, defaultCount?: number, title?: string, confirmText?: string, cancelText?: string }} opts
 * @returns {Promise<{ count: number, promptLang: "en"|"zh" }|null>}
 */
export function promptQuizGenerate(opts = {}) {
  const hideDay = !!opts.hideDay;
  const dayOptions = Array.isArray(opts.dayOptions) && opts.dayOptions.length
    ? opts.dayOptions
    : [{ key: "all", label: "全部", count: Math.max(1, Number(opts.maxCount) || 1) }];
  const countByKey = new Map(dayOptions.map((o) => [String(o.key), Math.max(1, Number(o.count) || 1)]));
  let activeMax = Math.min(50, countByKey.get(hideDay ? String(dayOptions[0].key) : "all") || Math.max(1, Number(opts.maxCount) || 1));
  if (hideDay) {
    activeMax = Math.min(50, Math.max(1, Number(opts.maxCount) || activeMax));
  }
  const defaultCount = Math.min(activeMax, Math.max(1, Number(opts.defaultCount) || Math.min(10, activeMax)));
  const countLabelText =
    opts.countLabel ||
    (hideDay
      ? `练习几个易错词（1–${activeMax}）`
      : `练习几个未学完的单词（1–${activeMax}）`);

  const daySelectHtml = hideDay
    ? ""
    : dayMultiselectHtml(dayOptions, { name: "rc-modal-quiz-day" });

  const overlay = document.createElement("div");
  overlay.className = "rc-modal-overlay";
  overlay.innerHTML = `
    <div class="rc-modal rc-modal-edit rc-modal-edit-quiz" role="dialog" aria-modal="true">
      <div class="rc-modal-title">${escapeHtml(opts.title || "生成试卷")}</div>
      ${
        hideDay
          ? ""
          : `<div class="rc-modal-field">
        <span class="rc-modal-field-label" id="rc-modal-quiz-day-label">时间</span>
        ${daySelectHtml}
      </div>`
      }
      <div class="rc-modal-field">
        <label for="rc-modal-quiz-count" id="rc-modal-quiz-count-label">${escapeHtml(countLabelText)}</label>
        <input type="number" id="rc-modal-quiz-count" min="1" max="${activeMax}" value="${defaultCount}">
      </div>
      <div class="rc-modal-field">
        <span class="rc-modal-field-label">出题方向</span>
        <div class="rc-modal-radios" role="radiogroup" aria-label="出题方向">
          <label class="rc-modal-radio">
            <input type="radio" name="rc-modal-quiz-lang" value="en" checked>
            <span>以英文出题</span>
          </label>
          <label class="rc-modal-radio">
            <input type="radio" name="rc-modal-quiz-lang" value="zh">
            <span>以中文出题</span>
          </label>
        </div>
      </div>
      <div class="rc-modal-field">
        <span class="rc-modal-field-label">难度</span>
        <div class="rc-modal-radios" role="radiogroup" aria-label="难度">
          <label class="rc-modal-radio">
            <input type="radio" name="rc-modal-quiz-difficulty" value="easy" checked>
            <span>简单</span>
          </label>
          <label class="rc-modal-radio">
            <input type="radio" name="rc-modal-quiz-difficulty" value="normal">
            <span>普通</span>
          </label>
          <label class="rc-modal-radio">
            <input type="radio" name="rc-modal-quiz-difficulty" value="hard">
            <span>困难</span>
          </label>
        </div>
      </div>
      <div class="rc-modal-field">
        <span class="rc-modal-field-label">是否展示考点词</span>
        <div class="rc-modal-radios" role="radiogroup" aria-label="是否展示考点词">
          <label class="rc-modal-radio">
            <input type="radio" name="rc-modal-quiz-show-words" value="0" checked>
            <span>不展示</span>
          </label>
          <label class="rc-modal-radio">
            <input type="radio" name="rc-modal-quiz-show-words" value="1">
            <span>展示</span>
          </label>
        </div>
      </div>
      <div class="rc-modal-actions">
        <button type="button" class="btn rc-modal-cancel">${escapeHtml(opts.cancelText || "取消")}</button>
        <button type="button" class="btn btn-primary">${escapeHtml(opts.confirmText || "生成")}</button>
      </div>
    </div>
  `;

  const countEl = overlay.querySelector("#rc-modal-quiz-count");
  const countLabel = overlay.querySelector("#rc-modal-quiz-count-label");
  const dayBoxes = hideDay ? [] : [...overlay.querySelectorAll('input[name="rc-modal-quiz-day"]')];

  function selectedDayCount() {
    const filter = normalizeDayFilter(dayBoxes.filter((el) => el.checked).map((el) => el.value));
    if (filter === "all") return countByKey.get("all") || 1;
    return filter.reduce((sum, key) => sum + (countByKey.get(key) || 0), 0);
  }

  function syncCountLimit() {
    if (hideDay) {
      activeMax = Math.min(50, Math.max(1, Number(opts.maxCount) || 1));
      countLabel.textContent =
        opts.countLabel || `练习几个易错词（1–${activeMax}）`;
    } else {
      const raw = selectedDayCount();
      activeMax = Math.min(50, Math.max(1, raw));
      countLabel.textContent = `练习几个未学完的单词（1–${activeMax}）`;
    }
    countEl.max = String(activeMax);
    let n = Math.round(Number(countEl.value));
    if (!Number.isFinite(n)) n = Math.min(10, activeMax);
    countEl.value = String(Math.min(activeMax, Math.max(1, n)));
  }

  if (dayBoxes.length) {
    const wrap = overlay.querySelector(".ru-day-ms");
    bindDayMultiselect(wrap, syncCountLimit);
  }

  if (current) current.resolve("cancel");
  document.body.appendChild(overlay);
  requestAnimationFrame(() => {
    overlay.classList.add("show");
    countEl.focus();
    countEl.select();
  });

  return new Promise((resolve) => {
    current = { overlay, resolve };

    function collect() {
      let count = Math.round(Number(countEl.value));
      if (!Number.isFinite(count)) count = Math.min(10, activeMax);
      count = Math.min(activeMax, Math.max(1, count));
      const langEl = overlay.querySelector('input[name="rc-modal-quiz-lang"]:checked');
      const difficultyEl = overlay.querySelector('input[name="rc-modal-quiz-difficulty"]:checked');
      const showWordsEl = overlay.querySelector('input[name="rc-modal-quiz-show-words"]:checked');
      const dayKeyVal = hideDay ? "all" : dayFilterFromChecks(dayBoxes);
      const difficultyRaw = difficultyEl && difficultyEl.value;
      const difficulty =
        difficultyRaw === "normal" || difficultyRaw === "hard" ? difficultyRaw : "easy";
      return {
        count,
        promptLang: langEl && langEl.value === "zh" ? "zh" : "en",
        difficulty,
        dayKey: dayKeyVal === "all" ? "all" : dayKeyVal,
        showSourceWords: !!(showWordsEl && showWordsEl.value === "1")
      };
    }

    function done(result) {
      if (current && current.overlay === overlay) current = null;
      overlay.classList.remove("show");
      overlay.addEventListener("transitionend", () => overlay.remove(), { once: true });
      setTimeout(() => overlay.remove(), 250);
      document.removeEventListener("keydown", onKeydown);
      resolve(result);
    }

    function onKeydown(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        done(null);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        done(collect());
      }
    }

    overlay.querySelector(".btn-primary").addEventListener("click", () => done(collect()));
    overlay.querySelector(".rc-modal-cancel").addEventListener("click", () => done(null));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) done(null);
    });
    document.addEventListener("keydown", onKeydown);
  }).then((value) => {
    if (value == null || value === "cancel") return null;
    return value;
  });
}

export function close() {
  if (current) current.resolve("cancel");
}

window.RcModal = { confirm, alert, promptEdit, promptWordEdit, promptQuizGenerate, close };
