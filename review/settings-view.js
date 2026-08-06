import { escapeHtml } from "../shared/dom.js";
import {
  DEFAULT_LLM_LOOKUP_PROMPT,
  DEFAULT_SETTINGS,
  generalSettingsDefaults,
  llmSettingsDefaults
} from "../shared/settings.js";
import { state } from "./state.js";

const PRESETS = [
  { id: "washi", label: "和紙", idea: "#c4a35a", word: "#3d5a80" },
  { id: "ink", label: "墨色", idea: "#8b7355", word: "#4a5568" },
  { id: "moss", label: "苔绿", idea: "#6b8f71", word: "#3d6b7a" },
  { id: "clay", label: "朱土", idea: "#b86b4b", word: "#5c6b8a" }
];

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

  const tab = state.settingsTab === "llm" ? "llm" : "general";
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
  const llmProvider = settings.llmProvider || DEFAULT_SETTINGS.llmProvider;
  const llmModel = settings.llmModel || DEFAULT_SETTINGS.llmModel;
  const llmBaseUrl = settings.llmBaseUrl || DEFAULT_SETTINGS.llmBaseUrl;
  const llmApiKey = typeof settings.llmApiKey === "string" ? settings.llmApiKey : "";
  const llmLookupPrompt =
    typeof settings.llmLookupPrompt === "string" && settings.llmLookupPrompt.trim()
      ? settings.llmLookupPrompt
      : DEFAULT_LLM_LOOKUP_PROMPT;

  root.innerHTML = `
    <div class="rv-settings">
      <nav class="rv-settings-tabs" role="tablist" aria-label="设置分类">
        <button type="button" class="rv-settings-tab${tab === "general" ? " is-on" : ""}" data-stab="general" role="tab" aria-selected="${tab === "general"}">通用</button>
        <button type="button" class="rv-settings-tab${tab === "llm" ? " is-on" : ""}" data-stab="llm" role="tab" aria-selected="${tab === "llm"}">大模型</button>
      </nav>

      <div class="rv-settings-panel" data-spanel="general" ${tab === "general" ? "" : "hidden"}>
        <section class="rv-settings-section">
          <h2 class="rv-settings-title">高亮</h2>
          <p class="rv-settings-desc">感触与单词可分别选择颜色与风格（背景填充或下划线）。保存后立即对所有标签页生效。</p>

          <div class="rv-settings-hl-block">
            <div class="rv-settings-hl-title">感触高亮</div>
            <div class="rv-settings-row">
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
            <div class="rv-settings-row">
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

          <div class="rv-settings-presets" role="group" aria-label="预设配色">
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
        </section>

        <section class="rv-settings-section">
          <h2 class="rv-settings-title">单词匹配</h2>
          <p class="rv-settings-desc">全局默认规则。变体匹配会高亮常见英语词形（如 overwhelm ↔ overwhelmed）；精准匹配仅高亮与标记完全相同的词。标记单词时可覆盖为单词级规则（优先级高于此处）。</p>
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

        <section class="rv-settings-section">
          <h2 class="rv-settings-title">高亮黑名单</h2>
          <p class="rv-settings-desc">一行一个域名（也可粘贴完整 URL）。名单内站点及其子域不显示感触与单词高亮；划词与捕获仍可用。以 <code>#</code> 开头的行为注释。</p>
          <label class="rv-settings-label" for="rv-set-hl-blacklist">域名列表</label>
          <textarea id="rv-set-hl-blacklist" class="rv-settings-textarea" rows="4" spellcheck="false" placeholder="example.com&#10;https://news.ycombinator.com">${escapeHtml(blacklistText)}</textarea>
        </section>

        <section class="rv-settings-section">
          <div class="rv-settings-actions">
            <button type="button" class="btn btn-primary" id="rv-set-save-general">保存</button>
            <button type="button" class="btn" id="rv-set-reset-general">恢复默认</button>
            <span class="rv-settings-toast" id="rv-set-toast-general" hidden></span>
          </div>
        </section>

        <section class="rv-settings-section">
          <h2 class="rv-settings-title">数据备份</h2>
          <p class="rv-settings-desc">
            卸载扩展或清除站点数据会丢掉本地记录；同一扩展 ID 下重新加载通常不会。
            定期下载 ZIP 备份（含感触、截图、单词与设置）。恢复将清空当前本地数据并以备份为准。
          </p>
          <div class="rv-settings-actions">
            <button type="button" class="btn btn-primary" id="rv-set-backup">下载备份</button>
            <button type="button" class="btn" id="rv-set-restore">从备份恢复</button>
            <input type="file" id="rv-set-restore-file" accept=".zip,application/zip" hidden>
            <span class="rv-settings-toast" id="rv-set-backup-toast" hidden></span>
          </div>
        </section>
      </div>

      <div class="rv-settings-panel" data-spanel="llm" ${tab === "llm" ? "" : "hidden"}>
        <section class="rv-settings-section">
          <h2 class="rv-settings-title">大模型配置</h2>
          <p class="rv-settings-desc">用于划词标记时自动查询音标与中文释义。API Key 仅保存在本机，不会上传到 RecordU 服务器。</p>

          <div class="rv-settings-row">
            <label class="rv-settings-label" for="rv-set-llm-provider">Provider</label>
            <select id="rv-set-llm-provider" class="rv-settings-select">
              <option value="deepseek" ${llmProvider === "deepseek" ? "selected" : ""}>DeepSeek</option>
            </select>
          </div>

          <div class="rv-settings-row rv-settings-row-stack">
            <label class="rv-settings-label" for="rv-set-llm-base">Base URL</label>
            <input type="url" id="rv-set-llm-base" class="rv-settings-text" value="${escapeHtml(llmBaseUrl)}" spellcheck="false" placeholder="https://api.deepseek.com">
          </div>

          <div class="rv-settings-row">
            <label class="rv-settings-label" for="rv-set-llm-model">Model</label>
            <input type="text" id="rv-set-llm-model" class="rv-settings-text rv-settings-text-sm" value="${escapeHtml(llmModel)}" spellcheck="false" placeholder="deepseek-chat">
          </div>

          <div class="rv-settings-row rv-settings-row-stack">
            <label class="rv-settings-label" for="rv-set-llm-key">API Key</label>
            <input type="password" id="rv-set-llm-key" class="rv-settings-text" value="${escapeHtml(llmApiKey)}" spellcheck="false" autocomplete="off" placeholder="sk-…">
          </div>
        </section>

        <section class="rv-settings-section">
          <h2 class="rv-settings-title">翻译提示词</h2>
          <p class="rv-settings-desc">须包含 <code>{{word}}</code> 占位符；模型应返回 JSON：<code>{"phonetic":"…","translation":"…"}</code>。</p>
          <textarea id="rv-set-llm-prompt" class="rv-settings-prompt" rows="10" spellcheck="false">${escapeHtml(llmLookupPrompt)}</textarea>
          <div class="rv-settings-actions rv-settings-actions-tight">
            <button type="button" class="btn" id="rv-set-prompt-reset">恢复默认提示词</button>
          </div>
        </section>

        <section class="rv-settings-section">
          <div class="rv-settings-actions">
            <button type="button" class="btn btn-primary" id="rv-set-save-llm">保存</button>
            <button type="button" class="btn" id="rv-set-reset-llm">恢复默认</button>
            <span class="rv-settings-toast" id="rv-set-toast-llm" hidden></span>
          </div>
        </section>
      </div>
    </div>
  `;

  root.querySelectorAll("[data-stab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = btn.dataset.stab === "llm" ? "llm" : "general";
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

  if (tab === "general") {
    bindGeneralPanel({
      root,
      onSave,
      onBackup,
      onRestore,
      onAfterRestore
    });
  } else {
    bindLlmPanel({ root, onSave });
  }
}

function bindGeneralPanel({ root, onSave, onBackup, onRestore, onAfterRestore }) {
  const ideaColor = root.querySelector("#rv-set-idea");
  const ideaHex = root.querySelector("#rv-set-idea-hex");
  const wordColor = root.querySelector("#rv-set-word");
  const wordHex = root.querySelector("#rv-set-word-hex");
  const ideaSwatch = root.querySelector(".rv-settings-swatch-idea");
  const wordSwatch = root.querySelector(".rv-settings-swatch-word");
  const toast = root.querySelector("#rv-set-toast-general");
  const backupToast = root.querySelector("#rv-set-backup-toast");
  const backupBtn = root.querySelector("#rv-set-backup");
  const restoreBtn = root.querySelector("#rv-set-restore");
  const restoreFile = root.querySelector("#rv-set-restore-file");

  function selectedIdeaStyle() {
    const checked = root.querySelector('input[name="rv-idea-style"]:checked');
    return checked && checked.value === "underline" ? "underline" : "fill";
  }

  function selectedWordStyle() {
    const checked = root.querySelector('input[name="rv-word-style"]:checked');
    return checked && checked.value === "underline" ? "underline" : "fill";
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

  function selectedMatchMode() {
    const checked = root.querySelector('input[name="rv-word-match"]:checked');
    return checked && checked.value === "exact" ? "exact" : "variant";
  }

  function setMatchMode(mode) {
    const value = mode === "exact" ? "exact" : "variant";
    root.querySelectorAll('input[name="rv-word-match"]').forEach((el) => {
      el.checked = el.value === value;
    });
  }

  const blacklistEl = root.querySelector("#rv-set-hl-blacklist");

  function setBlacklist(list) {
    if (!blacklistEl) return;
    blacklistEl.value = Array.isArray(list) ? list.join("\n") : "";
  }

  function readBlacklistText() {
    return blacklistEl ? blacklistEl.value : "";
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

  root.querySelector("#rv-set-save-general").addEventListener("click", async () => {
    const next = await onSave({
      ideaHighlightColor: ideaColor.value,
      ideaHighlightStyle: selectedIdeaStyle(),
      wordHighlightColor: wordColor.value,
      wordHighlightStyle: selectedWordStyle(),
      wordMatchMode: selectedMatchMode(),
      highlightHostBlacklist: readBlacklistText()
    });
    if (next) {
      setIdea(next.ideaHighlightColor);
      setWord(next.wordHighlightColor);
      setIdeaStyle(next.ideaHighlightStyle);
      setWordStyle(next.wordHighlightStyle);
      setMatchMode(next.wordMatchMode);
      setBlacklist(next.highlightHostBlacklist);
      showToast(toast, "✓ 已保存");
    } else {
      showToast(toast, "保存失败");
    }
  });

  root.querySelector("#rv-set-reset-general").addEventListener("click", async () => {
    const next = await onSave(generalSettingsDefaults());
    if (next) {
      setIdea(next.ideaHighlightColor);
      setWord(next.wordHighlightColor);
      setIdeaStyle(next.ideaHighlightStyle);
      setWordStyle(next.wordHighlightStyle);
      setMatchMode(next.wordMatchMode);
      setBlacklist(next.highlightHostBlacklist);
      showToast(toast, "✓ 已恢复默认");
    }
  });

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
  const provider = root.querySelector("#rv-set-llm-provider");
  const baseUrl = root.querySelector("#rv-set-llm-base");
  const model = root.querySelector("#rv-set-llm-model");
  const apiKey = root.querySelector("#rv-set-llm-key");
  const prompt = root.querySelector("#rv-set-llm-prompt");
  const toast = root.querySelector("#rv-set-toast-llm");

  function applyLlmFields(s) {
    if (!s) return;
    provider.value = s.llmProvider || DEFAULT_SETTINGS.llmProvider;
    baseUrl.value = s.llmBaseUrl || DEFAULT_SETTINGS.llmBaseUrl;
    model.value = s.llmModel || DEFAULT_SETTINGS.llmModel;
    apiKey.value = typeof s.llmApiKey === "string" ? s.llmApiKey : "";
    prompt.value =
      typeof s.llmLookupPrompt === "string" && s.llmLookupPrompt.trim()
        ? s.llmLookupPrompt
        : DEFAULT_LLM_LOOKUP_PROMPT;
  }

  root.querySelector("#rv-set-prompt-reset").addEventListener("click", () => {
    prompt.value = DEFAULT_LLM_LOOKUP_PROMPT;
    showToast(toast, "已填入默认提示词（未保存）");
  });

  root.querySelector("#rv-set-save-llm").addEventListener("click", async () => {
    const next = await onSave({
      llmProvider: provider.value,
      llmBaseUrl: baseUrl.value.trim(),
      llmModel: model.value.trim(),
      llmApiKey: apiKey.value,
      llmLookupPrompt: prompt.value
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
