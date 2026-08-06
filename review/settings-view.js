import { escapeHtml } from "../shared/dom.js";
import {
  DEFAULT_LLM_LOOKUP_PROMPT,
  DEFAULT_LLM_QUIZ_PROMPT,
  DEFAULT_SETTINGS,
  generalSettingsDefaults,
  llmSettingsDefaults,
  promptSettingsDefaults
} from "../shared/settings.js";
import { state } from "./state.js";

const PRESETS = [
  { id: "washi", label: "和紙", idea: "#c4a35a", word: "#3d5a80" },
  { id: "ink", label: "墨色", idea: "#8b7355", word: "#4a5568" },
  { id: "moss", label: "苔绿", idea: "#6b8f71", word: "#3d6b7a" },
  { id: "clay", label: "朱土", idea: "#b86b4b", word: "#5c6b8a" }
];

const NAV_ITEMS = [
  { id: "highlight", label: "高亮" },
  { id: "llm", label: "大模型" },
  { id: "prompts", label: "提示词" },
  { id: "backup", label: "数据备份" }
];

const VALID_TABS = new Set(NAV_ITEMS.map((item) => item.id));

/** @param {string} raw */
function resolveTab(raw) {
  if (VALID_TABS.has(raw)) return raw;
  // legacy tabs → highlight
  if (raw === "general" || raw === "match" || raw === "blacklist") return "highlight";
  return "highlight";
}

/**
 * @param {object} opts
 * @param {HTMLElement} opts.root
 * @param {HTMLElement} opts.progressEl
 * @param {HTMLElement} opts.emptyEl
 * @param {object} opts.settings
 * @param {(patch: object) => Promise<object|null>} opts.onSave
 * @param {(onProgress: (msg: string) => void) => Promise<void>} [opts.onBackup]
 * @param {(file: File, onProgress: (msg: string) => void) => Promise<{cancelled?: boolean}|void>} [opts.onRestore]
 * @param {() => Promise<void>} [opts.onAfterRestore]
 */
export function renderSettings({
  root,
  progressEl,
  emptyEl,
  settings,
  onSave,
  onBackup,
  onRestore,
  onAfterRestore
}) {
  progressEl.textContent = "全局设置";
  emptyEl.classList.add("hidden");
  root.classList.remove("hidden");

  const tab = resolveTab(state.settingsTab);
  state.settingsTab = tab;

  root.innerHTML = `
    <div class="rv-settings">
      <nav class="rv-settings-nav" role="tablist" aria-label="设置分类" aria-orientation="vertical">
        ${NAV_ITEMS.map(
          (item) => `
          <button type="button"
            class="rv-settings-nav-item${tab === item.id ? " is-on" : ""}"
            data-stab="${item.id}"
            role="tab"
            aria-selected="${tab === item.id}">
            ${escapeHtml(item.label)}
          </button>`
        ).join("")}
      </nav>
      <div class="rv-settings-main" role="tabpanel">
        ${renderPanel(tab, settings)}
      </div>
    </div>
  `;

  root.querySelectorAll("[data-stab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = resolveTab(btn.dataset.stab || "");
      if (next === state.settingsTab) return;
      state.settingsTab = next;
      renderSettings({
        root,
        progressEl,
        emptyEl,
        settings,
        onSave,
        onBackup,
        onRestore,
        onAfterRestore
      });
    });
  });

  if (tab === "highlight") bindHighlightPanel({ root, onSave });
  else if (tab === "backup") {
    bindBackupPanel({ root, onBackup, onRestore, onAfterRestore });
  } else if (tab === "llm") bindLlmPanel({ root, onSave });
  else if (tab === "prompts") bindPromptsPanel({ root, onSave });
}

/** @param {string} tab @param {object} settings */
function renderPanel(tab, settings) {
  if (tab === "highlight") return renderHighlightPanel(settings);
  if (tab === "backup") return renderBackupPanel();
  if (tab === "prompts") return renderPromptsPanel(settings);
  return renderLlmPanel(settings);
}

function renderHighlightPanel(settings) {
  const idea = settings.ideaHighlightColor || DEFAULT_SETTINGS.ideaHighlightColor;
  const word = settings.wordHighlightColor || DEFAULT_SETTINGS.wordHighlightColor;
  const ideaStyle =
    settings.ideaHighlightStyle === "underline" ? "underline" : "fill";
  const wordStyle =
    settings.wordHighlightStyle === "underline" ? "underline" : "fill";
  const matchMode =
    settings.wordMatchMode === "exact" ? "exact" : DEFAULT_SETTINGS.wordMatchMode;
  const highlightHostBlacklist = Array.isArray(settings.highlightHostBlacklist)
    ? settings.highlightHostBlacklist
    : [];
  const blacklistText = highlightHostBlacklist.join("\n");

  return `
    <header class="rv-settings-header">
      <h2 class="rv-settings-title">高亮</h2>
      <p class="rv-settings-desc">分别设置颜色与风格；保存后全站立即生效。</p>
    </header>

    <div class="rv-settings-hl-grid">
      <div class="rv-settings-hl-block">
        <div class="rv-settings-hl-title">感触高亮</div>
        <div class="rv-settings-field">
          <label class="rv-settings-label" for="rv-set-idea">颜色</label>
          <div class="rv-settings-color">
            <input type="color" id="rv-set-idea" value="${escapeHtml(idea)}" aria-label="感触高亮色">
            <input type="text" id="rv-set-idea-hex" class="rv-settings-hex" value="${escapeHtml(idea)}" maxlength="7" spellcheck="false">
            <span class="rv-settings-swatch rv-settings-swatch-idea${ideaStyle === "underline" ? " is-underline" : ""}" style="--swatch:${escapeHtml(idea)}" aria-hidden="true">示例</span>
          </div>
        </div>
        <div class="rv-settings-modes" role="radiogroup" aria-label="感触高亮风格">
          <label class="rv-settings-mode">
            <input type="radio" name="rv-idea-style" value="fill" ${ideaStyle === "fill" ? "checked" : ""}>
            <span>背景填充</span>
          </label>
          <label class="rv-settings-mode">
            <input type="radio" name="rv-idea-style" value="underline" ${ideaStyle === "underline" ? "checked" : ""}>
            <span>下划线</span>
          </label>
        </div>
      </div>

      <div class="rv-settings-hl-block">
        <div class="rv-settings-hl-title">单词高亮</div>
        <div class="rv-settings-field">
          <label class="rv-settings-label" for="rv-set-word">颜色</label>
          <div class="rv-settings-color">
            <input type="color" id="rv-set-word" value="${escapeHtml(word)}" aria-label="单词高亮色">
            <input type="text" id="rv-set-word-hex" class="rv-settings-hex" value="${escapeHtml(word)}" maxlength="7" spellcheck="false">
            <span class="rv-settings-swatch rv-settings-swatch-word${wordStyle === "underline" ? " is-underline" : ""}" style="--swatch:${escapeHtml(word)}" aria-hidden="true">示例</span>
          </div>
        </div>
        <div class="rv-settings-modes" role="radiogroup" aria-label="单词高亮风格">
          <label class="rv-settings-mode">
            <input type="radio" name="rv-word-style" value="fill" ${wordStyle === "fill" ? "checked" : ""}>
            <span>背景填充</span>
          </label>
          <label class="rv-settings-mode">
            <input type="radio" name="rv-word-style" value="underline" ${wordStyle === "underline" ? "checked" : ""}>
            <span>下划线</span>
          </label>
        </div>
      </div>
    </div>

    <div class="rv-settings-field">
      <div class="rv-settings-label" id="rv-set-presets-label">预设配色</div>
      <div class="rv-settings-presets" role="group" aria-labelledby="rv-set-presets-label">
        ${PRESETS.map(
          (p) => `
          <button type="button" class="rv-settings-preset" data-idea="${escapeHtml(p.idea)}" data-word="${escapeHtml(p.word)}">
            <span class="rv-settings-preset-dots">
              <i style="background:${escapeHtml(p.idea)}"></i>
              <i style="background:${escapeHtml(p.word)}"></i>
            </span>
            ${escapeHtml(p.label)}
          </button>`
        ).join("")}
      </div>
    </div>

    <section class="rv-settings-block">
      <h3 class="rv-settings-subtitle">单词匹配</h3>
      <p class="rv-settings-desc rv-settings-desc-tight">变体含常见词形；精准仅完全相同。单词级规则可覆盖。</p>
      <div class="rv-settings-modes" role="radiogroup" aria-label="单词匹配模式">
        <label class="rv-settings-mode">
          <input type="radio" name="rv-word-match" value="variant" ${matchMode === "variant" ? "checked" : ""}>
          <span>变体匹配</span>
        </label>
        <label class="rv-settings-mode">
          <input type="radio" name="rv-word-match" value="exact" ${matchMode === "exact" ? "checked" : ""}>
          <span>精准匹配</span>
        </label>
      </div>
    </section>

    <section class="rv-settings-block">
      <h3 class="rv-settings-subtitle">高亮黑名单</h3>
      <p class="rv-settings-desc rv-settings-desc-tight">一行一个域名；名单内站点不显示高亮。以 <code>#</code> 开头为注释。</p>
      <div class="rv-settings-field">
        <label class="rv-settings-label" for="rv-set-hl-blacklist">域名列表</label>
        <textarea id="rv-set-hl-blacklist" class="rv-settings-textarea" rows="5" spellcheck="false" placeholder="example.com&#10;https://news.ycombinator.com">${escapeHtml(blacklistText)}</textarea>
      </div>
    </section>

    ${renderFooter("highlight")}
  `;
}

function renderBackupPanel() {
  return `
    <header class="rv-settings-header">
      <h2 class="rv-settings-title">数据备份</h2>
      <p class="rv-settings-desc">ZIP 含感触、截图、单词与设置。恢复会覆盖本机数据。</p>
    </header>
    <div class="rv-settings-footer">
      <div class="rv-settings-actions">
        <button type="button" class="btn btn-primary" id="rv-set-backup">下载备份</button>
        <button type="button" class="btn" id="rv-set-restore">从备份恢复</button>
        <input type="file" id="rv-set-restore-file" accept=".zip,application/zip" hidden>
        <span class="rv-settings-toast" id="rv-set-backup-toast" hidden></span>
      </div>
    </div>
  `;
}

function renderLlmPanel(settings) {
  const llmModel = settings.llmModel || DEFAULT_SETTINGS.llmModel;
  const llmBaseUrl = settings.llmBaseUrl || DEFAULT_SETTINGS.llmBaseUrl;
  const llmApiKey = typeof settings.llmApiKey === "string" ? settings.llmApiKey : "";
  const effortRaw = settings.llmReasoningEffort;
  const effort =
    effortRaw === "low" || effortRaw === "high" || effortRaw === "max" ? effortRaw : "off";

  return `
    <header class="rv-settings-header">
      <h2 class="rv-settings-title">大模型</h2>
      <p class="rv-settings-desc">用于划词查词与试卷出题。API Key 仅保存在本机。提示词见左侧「提示词」。</p>
    </header>

    <div class="rv-settings-field">
      <label class="rv-settings-label" for="rv-set-llm-base">Base URL</label>
      <input type="url" id="rv-set-llm-base" class="rv-settings-text" value="${escapeHtml(llmBaseUrl)}" spellcheck="false" placeholder="https://api.deepseek.com">
    </div>

    <div class="rv-settings-field">
      <label class="rv-settings-label" for="rv-set-llm-model">Model</label>
      <input type="text" id="rv-set-llm-model" class="rv-settings-text" value="${escapeHtml(llmModel)}" spellcheck="false" placeholder="deepseek-chat">
    </div>

    <div class="rv-settings-field">
      <label class="rv-settings-label" for="rv-set-llm-key">API Key</label>
      <input type="password" id="rv-set-llm-key" class="rv-settings-text" value="${escapeHtml(llmApiKey)}" spellcheck="false" autocomplete="off" placeholder="sk-…">
    </div>

    <div class="rv-settings-field">
      <div class="rv-settings-label" id="rv-set-llm-effort-label">思考程度</div>
      <p class="rv-settings-desc rv-settings-desc-tight">对应 DeepSeek <code>thinking</code> / <code>reasoning_effort</code>。关闭更快更省；开启后出题质量可能更好但更慢更贵。</p>
      <div class="rv-settings-modes" role="radiogroup" aria-labelledby="rv-set-llm-effort-label">
        <label class="rv-settings-mode">
          <input type="radio" name="rv-set-llm-effort" value="off" ${effort === "off" ? "checked" : ""}>
          <span>关闭</span>
        </label>
        <label class="rv-settings-mode">
          <input type="radio" name="rv-set-llm-effort" value="low" ${effort === "low" ? "checked" : ""}>
          <span>低</span>
        </label>
        <label class="rv-settings-mode">
          <input type="radio" name="rv-set-llm-effort" value="high" ${effort === "high" ? "checked" : ""}>
          <span>高</span>
        </label>
        <label class="rv-settings-mode">
          <input type="radio" name="rv-set-llm-effort" value="max" ${effort === "max" ? "checked" : ""}>
          <span>最大</span>
        </label>
      </div>
    </div>

    ${renderFooter("llm")}
  `;
}

function renderPromptsPanel(settings) {
  const llmLookupPrompt =
    typeof settings.llmLookupPrompt === "string" && settings.llmLookupPrompt.trim()
      ? settings.llmLookupPrompt
      : DEFAULT_LLM_LOOKUP_PROMPT;
  const llmQuizPrompt =
    typeof settings.llmQuizPrompt === "string" && settings.llmQuizPrompt.trim()
      ? settings.llmQuizPrompt
      : DEFAULT_LLM_QUIZ_PROMPT;

  return `
    <header class="rv-settings-header">
      <h2 class="rv-settings-title">提示词</h2>
      <p class="rv-settings-desc">自定义查词与出题所用提示词；端点与 API Key 在「大模型」中配置。</p>
    </header>

    <div class="rv-settings-field">
      <label class="rv-settings-label" for="rv-set-llm-prompt">翻译提示词</label>
      <p class="rv-settings-desc rv-settings-desc-tight">须含 <code>{{word}}</code>；返回 JSON：<code>{"phonetic":"…","translation":"…"}</code>。</p>
      <textarea id="rv-set-llm-prompt" class="rv-settings-prompt" rows="8" spellcheck="false">${escapeHtml(llmLookupPrompt)}</textarea>
      <div class="rv-settings-actions rv-settings-actions-tight">
        <button type="button" class="btn" id="rv-set-prompt-reset">恢复默认翻译提示词</button>
      </div>
    </div>

    <div class="rv-settings-field">
      <label class="rv-settings-label" for="rv-set-llm-quiz-prompt">出题提示词</label>
      <p class="rv-settings-desc rv-settings-desc-tight">须含 <code>{{words}}</code>（词表 JSON，可含 note / context）与 <code>{{promptLang}}</code>（en / zh）；返回约定题型 JSON。清空或点「恢复默认」可换用新的语境/辨析出题默认。</p>
      <textarea id="rv-set-llm-quiz-prompt" class="rv-settings-prompt" rows="12" spellcheck="false">${escapeHtml(llmQuizPrompt)}</textarea>
      <div class="rv-settings-actions rv-settings-actions-tight">
        <button type="button" class="btn" id="rv-set-quiz-prompt-reset">恢复默认出题提示词</button>
      </div>
    </div>

    ${renderFooter("prompts")}
  `;
}

/** @param {"highlight"|"llm"|"prompts"} kind */
function renderFooter(kind) {
  const saveId =
    kind === "llm"
      ? "rv-set-save-llm"
      : kind === "prompts"
        ? "rv-set-save-prompts"
        : "rv-set-save-highlight";
  const resetId =
    kind === "llm"
      ? "rv-set-reset-llm"
      : kind === "prompts"
        ? "rv-set-reset-prompts"
        : "rv-set-reset-highlight";
  const toastId =
    kind === "llm"
      ? "rv-set-toast-llm"
      : kind === "prompts"
        ? "rv-set-toast-prompts"
        : "rv-set-toast-highlight";

  return `
    <div class="rv-settings-footer">
      <div class="rv-settings-actions">
        <button type="button" class="btn btn-primary" id="${saveId}">保存</button>
        <button type="button" class="btn" id="${resetId}">恢复默认</button>
        <span class="rv-settings-toast" id="${toastId}" hidden></span>
      </div>
    </div>
  `;
}

function bindHighlightPanel({ root, onSave }) {
  const ideaColor = root.querySelector("#rv-set-idea");
  const ideaHex = root.querySelector("#rv-set-idea-hex");
  const wordColor = root.querySelector("#rv-set-word");
  const wordHex = root.querySelector("#rv-set-word-hex");
  const ideaSwatch = root.querySelector(".rv-settings-swatch-idea");
  const wordSwatch = root.querySelector(".rv-settings-swatch-word");
  const blacklistEl = root.querySelector("#rv-set-hl-blacklist");
  const toast = root.querySelector("#rv-set-toast-highlight");

  function selectedIdeaStyle() {
    const checked = root.querySelector('input[name="rv-idea-style"]:checked');
    return checked && checked.value === "underline" ? "underline" : "fill";
  }

  function selectedWordStyle() {
    const checked = root.querySelector('input[name="rv-word-style"]:checked');
    return checked && checked.value === "underline" ? "underline" : "fill";
  }

  function selectedMatchMode() {
    const checked = root.querySelector('input[name="rv-word-match"]:checked');
    return checked && checked.value === "exact" ? "exact" : "variant";
  }

  function syncSwatches() {
    if (ideaSwatch) {
      ideaSwatch.style.setProperty("--swatch", ideaColor.value);
      ideaSwatch.classList.toggle("is-underline", selectedIdeaStyle() === "underline");
    }
    if (wordSwatch) {
      wordSwatch.style.setProperty("--swatch", wordColor.value);
      wordSwatch.classList.toggle("is-underline", selectedWordStyle() === "underline");
    }
  }

  function setIdea(hex) {
    const v = normalizeLocalHex(hex) || ideaColor.value;
    ideaColor.value = v;
    ideaHex.value = v;
    syncSwatches();
  }

  function setWord(hex) {
    const v = normalizeLocalHex(hex) || wordColor.value;
    wordColor.value = v;
    wordHex.value = v;
    syncSwatches();
  }

  function setIdeaStyle(style) {
    const value = style === "underline" ? "underline" : "fill";
    root.querySelectorAll('input[name="rv-idea-style"]').forEach((el) => {
      el.checked = el.value === value;
    });
    syncSwatches();
  }

  function setWordStyle(style) {
    const value = style === "underline" ? "underline" : "fill";
    root.querySelectorAll('input[name="rv-word-style"]').forEach((el) => {
      el.checked = el.value === value;
    });
    syncSwatches();
  }

  function setMatchMode(mode) {
    const value = mode === "exact" ? "exact" : "variant";
    root.querySelectorAll('input[name="rv-word-match"]').forEach((el) => {
      el.checked = el.value === value;
    });
  }

  function setBlacklist(list) {
    if (!blacklistEl) return;
    blacklistEl.value = Array.isArray(list) ? list.join("\n") : "";
  }

  function applyGeneral(s) {
    if (!s) return;
    setIdea(s.ideaHighlightColor);
    setWord(s.wordHighlightColor);
    setIdeaStyle(s.ideaHighlightStyle);
    setWordStyle(s.wordHighlightStyle);
    setMatchMode(s.wordMatchMode);
    setBlacklist(s.highlightHostBlacklist);
  }

  ideaColor.addEventListener("input", () => {
    ideaHex.value = ideaColor.value;
    syncSwatches();
  });
  wordColor.addEventListener("input", () => {
    wordHex.value = wordColor.value;
    syncSwatches();
  });
  ideaHex.addEventListener("change", () => setIdea(ideaHex.value));
  wordHex.addEventListener("change", () => setWord(wordHex.value));

  root.querySelectorAll('input[name="rv-idea-style"]').forEach((el) => {
    el.addEventListener("change", syncSwatches);
  });
  root.querySelectorAll('input[name="rv-word-style"]').forEach((el) => {
    el.addEventListener("change", syncSwatches);
  });

  root.querySelectorAll(".rv-settings-preset").forEach((btn) => {
    btn.addEventListener("click", () => {
      setIdea(btn.dataset.idea);
      setWord(btn.dataset.word);
    });
  });

  root.querySelector("#rv-set-save-highlight").addEventListener("click", async () => {
    const next = await onSave({
      ideaHighlightColor: ideaColor.value,
      ideaHighlightStyle: selectedIdeaStyle(),
      wordHighlightColor: wordColor.value,
      wordHighlightStyle: selectedWordStyle(),
      wordMatchMode: selectedMatchMode(),
      highlightHostBlacklist: blacklistEl ? blacklistEl.value : ""
    });
    if (next) {
      applyGeneral(next);
      showToast(toast, "✓ 已保存");
    } else {
      showToast(toast, "保存失败");
    }
  });

  root.querySelector("#rv-set-reset-highlight").addEventListener("click", async () => {
    const next = await onSave(generalSettingsDefaults());
    if (next) {
      applyGeneral(next);
      showToast(toast, "✓ 已恢复默认");
    }
  });
}

function bindBackupPanel({ root, onBackup, onRestore, onAfterRestore }) {
  const backupToast = root.querySelector("#rv-set-backup-toast");
  const backupBtn = root.querySelector("#rv-set-backup");
  const restoreBtn = root.querySelector("#rv-set-restore");
  const restoreFile = root.querySelector("#rv-set-restore-file");

  function setBusy(busy) {
    backupBtn.disabled = busy;
    restoreBtn.disabled = busy;
  }

  backupBtn.addEventListener("click", async () => {
    if (!onBackup) return;
    setBusy(true);
    try {
      await onBackup((msg) => {
        backupToast.hidden = false;
        backupToast.textContent = msg;
      });
      showToast(backupToast, backupToast.textContent || "✓ 备份已下载");
    } catch (e) {
      showToast(backupToast, `备份失败：${e && e.message ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  });

  restoreBtn.addEventListener("click", () => {
    if (!onRestore) return;
    restoreFile.value = "";
    restoreFile.click();
  });

  restoreFile.addEventListener("change", async () => {
    const file = restoreFile.files && restoreFile.files[0];
    if (!file || !onRestore) return;
    setBusy(true);
    try {
      const result = await onRestore(file, (msg) => {
        backupToast.hidden = false;
        backupToast.textContent = msg;
      });
      if (result && result.cancelled) {
        backupToast.hidden = true;
        return;
      }
      showToast(backupToast, backupToast.textContent || "✓ 已恢复");
      if (onAfterRestore) {
        setTimeout(() => {
          onAfterRestore().catch(() => {});
        }, 600);
      }
    } catch (e) {
      showToast(backupToast, `恢复失败：${e && e.message ? e.message : e}`);
    } finally {
      setBusy(false);
      restoreFile.value = "";
    }
  });
}

function bindLlmPanel({ root, onSave }) {
  const baseUrl = root.querySelector("#rv-set-llm-base");
  const model = root.querySelector("#rv-set-llm-model");
  const apiKey = root.querySelector("#rv-set-llm-key");
  const toast = root.querySelector("#rv-set-toast-llm");

  function selectedEffort() {
    const el = root.querySelector('input[name="rv-set-llm-effort"]:checked');
    const v = el && el.value;
    return v === "low" || v === "high" || v === "max" ? v : "off";
  }

  function applyLlmFields(s) {
    if (!s) return;
    baseUrl.value = s.llmBaseUrl || DEFAULT_SETTINGS.llmBaseUrl;
    model.value = s.llmModel || DEFAULT_SETTINGS.llmModel;
    apiKey.value = typeof s.llmApiKey === "string" ? s.llmApiKey : "";
    const effort =
      s.llmReasoningEffort === "low" ||
      s.llmReasoningEffort === "high" ||
      s.llmReasoningEffort === "max"
        ? s.llmReasoningEffort
        : "off";
    root.querySelectorAll('input[name="rv-set-llm-effort"]').forEach((input) => {
      input.checked = input.value === effort;
    });
  }

  root.querySelector("#rv-set-save-llm").addEventListener("click", async () => {
    const next = await onSave({
      llmBaseUrl: baseUrl.value.trim(),
      llmModel: model.value.trim(),
      llmApiKey: apiKey.value,
      llmReasoningEffort: selectedEffort()
    });
    if (next) {
      applyLlmFields(next);
      showToast(toast, "✓ 已保存");
    } else {
      showToast(toast, "保存失败");
    }
  });

  root.querySelector("#rv-set-reset-llm").addEventListener("click", async () => {
    const next = await onSave(llmSettingsDefaults());
    if (next) {
      applyLlmFields(next);
      showToast(toast, "✓ 已恢复默认");
    }
  });
}

function bindPromptsPanel({ root, onSave }) {
  const prompt = root.querySelector("#rv-set-llm-prompt");
  const quizPrompt = root.querySelector("#rv-set-llm-quiz-prompt");
  const toast = root.querySelector("#rv-set-toast-prompts");

  function applyPromptFields(s) {
    if (!s) return;
    prompt.value =
      typeof s.llmLookupPrompt === "string" && s.llmLookupPrompt.trim()
        ? s.llmLookupPrompt
        : DEFAULT_LLM_LOOKUP_PROMPT;
    quizPrompt.value =
      typeof s.llmQuizPrompt === "string" && s.llmQuizPrompt.trim()
        ? s.llmQuizPrompt
        : DEFAULT_LLM_QUIZ_PROMPT;
  }

  root.querySelector("#rv-set-prompt-reset").addEventListener("click", () => {
    prompt.value = DEFAULT_LLM_LOOKUP_PROMPT;
    showToast(toast, "已填入默认翻译提示词（未保存）");
  });

  root.querySelector("#rv-set-quiz-prompt-reset").addEventListener("click", () => {
    quizPrompt.value = DEFAULT_LLM_QUIZ_PROMPT;
    showToast(toast, "已填入默认出题提示词（未保存）");
  });

  root.querySelector("#rv-set-save-prompts").addEventListener("click", async () => {
    const next = await onSave({
      llmLookupPrompt: prompt.value,
      llmQuizPrompt: quizPrompt.value
    });
    if (next) {
      applyPromptFields(next);
      showToast(toast, "✓ 已保存");
    } else {
      showToast(toast, "保存失败");
    }
  });

  root.querySelector("#rv-set-reset-prompts").addEventListener("click", async () => {
    const next = await onSave(promptSettingsDefaults());
    if (next) {
      applyPromptFields(next);
      showToast(toast, "✓ 已恢复默认");
    }
  });
}

function showToast(el, msg) {
  if (!el) return;
  el.hidden = false;
  el.textContent = msg;
  clearTimeout(el._toastT);
  el._toastT = setTimeout(() => {
    el.hidden = true;
  }, 2200);
}

function normalizeLocalHex(value) {
  const raw = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toLowerCase()}`;
  return null;
}
