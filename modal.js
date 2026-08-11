import { escapeHtml } from "./shared/dom.js";

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
  const overlay = document.createElement("div");
  overlay.className = "rc-modal-overlay";
  overlay.innerHTML = `
    <div class="rc-modal rc-modal-edit rc-modal-edit-word" role="dialog" aria-modal="true">
      <div class="rc-modal-title">${escapeHtml(opts.title || "编辑单词")}</div>
      <div class="rc-modal-field">
        <label for="rc-modal-phonetic">音标</label>
        <input type="text" id="rc-modal-phonetic" value="${escapeHtml(opts.phonetic || "")}" placeholder="/ˈwɜːrd/">
      </div>
      <div class="rc-modal-field">
        <label for="rc-modal-translation">翻译</label>
        <input type="text" id="rc-modal-translation" value="${escapeHtml(opts.translation || "")}" placeholder="中文释义">
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

  const phoneticEl = overlay.querySelector("#rc-modal-phonetic");
  const translationEl = overlay.querySelector("#rc-modal-translation");
  const noteEl = overlay.querySelector("#rc-modal-note");
  const matchEl = overlay.querySelector("#rc-modal-match");

  if (current) current.resolve("cancel");
  document.body.appendChild(overlay);
  requestAnimationFrame(() => {
    overlay.classList.add("show");
    phoneticEl.focus();
  });

  return new Promise((resolve) => {
    current = { overlay, resolve };

    function collect() {
      const mode = matchEl.value;
      return {
        phonetic: phoneticEl.value.trim(),
        translation: translationEl.value.trim(),
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
  const dayOptions = Array.isArray(opts.dayOptions) && opts.dayOptions.length
    ? opts.dayOptions
    : [{ key: "all", label: "全部", count: Math.max(1, Number(opts.maxCount) || 1) }];
  const countByKey = new Map(dayOptions.map((o) => [String(o.key), Math.max(1, Number(o.count) || 1)]));
  let activeMax = Math.min(50, countByKey.get("all") || Math.max(1, Number(opts.maxCount) || 1));
  const defaultCount = Math.min(activeMax, Math.max(1, Number(opts.defaultCount) || Math.min(10, activeMax)));

  const daySelectHtml = dayOptions
    .map((o, i) => {
      const key = String(o.key);
      const count = Math.max(0, Number(o.count) || 0);
      const label =
        key === "all" ? String(o.label || "全部") : `${o.label || key}（${count}）`;
      return `<option value="${escapeHtml(key)}"${i === 0 ? " selected" : ""}>${escapeHtml(label)}</option>`;
    })
    .join("");

  const overlay = document.createElement("div");
  overlay.className = "rc-modal-overlay";
  overlay.innerHTML = `
    <div class="rc-modal rc-modal-edit rc-modal-edit-quiz" role="dialog" aria-modal="true">
      <div class="rc-modal-title">${escapeHtml(opts.title || "生成试卷")}</div>
      <div class="rc-modal-field">
        <label for="rc-modal-quiz-day">时间</label>
        <select id="rc-modal-quiz-day">${daySelectHtml}</select>
      </div>
      <div class="rc-modal-field">
        <label for="rc-modal-quiz-count" id="rc-modal-quiz-count-label">练习几个未学完的单词（1–${activeMax}）</label>
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
  const dayEl = overlay.querySelector("#rc-modal-quiz-day");

  function syncCountLimit() {
    const key = dayEl.value || "all";
    const raw = countByKey.get(key) || 1;
    activeMax = Math.min(50, Math.max(1, raw));
    countLabel.textContent = `练习几个未学完的单词（1–${activeMax}）`;
    countEl.max = String(activeMax);
    let n = Math.round(Number(countEl.value));
    if (!Number.isFinite(n)) n = Math.min(10, activeMax);
    countEl.value = String(Math.min(activeMax, Math.max(1, n)));
  }

  dayEl.addEventListener("change", syncCountLimit);

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
      const dayKeyVal = String(dayEl.value || "all");
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
