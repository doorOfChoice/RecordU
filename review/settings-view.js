import { escapeHtml } from "../shared/dom.js";
import { DEFAULT_SETTINGS } from "../shared/settings.js";

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
 * @param {() => Promise<object|null>} opts.onReset
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
  onReset,
  onBackup,
  onRestore,
  onAfterRestore
}) {
  progressEl.textContent = "全局设置";
  emptyEl.classList.add("hidden");
  root.classList.remove("hidden");

  const idea = settings.ideaHighlightColor || DEFAULT_SETTINGS.ideaHighlightColor;
  const word = settings.wordHighlightColor || DEFAULT_SETTINGS.wordHighlightColor;
  const matchMode =
    settings.wordMatchMode === "exact" ? "exact" : DEFAULT_SETTINGS.wordMatchMode;

  root.innerHTML = `
    <div class="rv-settings">
      <section class="rv-settings-section">
        <h2 class="rv-settings-title">高亮颜色</h2>
        <p class="rv-settings-desc">感触与单词在网页上的高亮底色。保存后立即对所有标签页生效。</p>

        <div class="rv-settings-row">
          <label class="rv-settings-label" for="rv-set-idea">感触高亮</label>
          <div class="rv-settings-color">
            <input type="color" id="rv-set-idea" value="${escapeHtml(idea)}" aria-label="感触高亮色">
            <input type="text" id="rv-set-idea-hex" class="rv-settings-hex" value="${escapeHtml(idea)}" maxlength="7" spellcheck="false">
            <span class="rv-settings-swatch rv-settings-swatch-idea" style="--swatch:${escapeHtml(idea)}" aria-hidden="true">示例</span>
          </div>
        </div>

        <div class="rv-settings-row">
          <label class="rv-settings-label" for="rv-set-word">单词高亮</label>
          <div class="rv-settings-color">
            <input type="color" id="rv-set-word" value="${escapeHtml(word)}" aria-label="单词高亮色">
            <input type="text" id="rv-set-word-hex" class="rv-settings-hex" value="${escapeHtml(word)}" maxlength="7" spellcheck="false">
            <span class="rv-settings-swatch rv-settings-swatch-word" style="--swatch:${escapeHtml(word)}" aria-hidden="true">示例</span>
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
        <p class="rv-settings-desc">变体匹配会高亮常见英语词形（如 overwhelm ↔ overwhelmed）；精准匹配仅高亮与标记完全相同的词。</p>
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
        <div class="rv-settings-actions">
          <button type="button" class="btn btn-primary" id="rv-set-save">保存</button>
          <button type="button" class="btn" id="rv-set-reset">恢复默认</button>
          <span class="rv-settings-toast" id="rv-set-toast" hidden></span>
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
  `;

  const ideaColor = root.querySelector("#rv-set-idea");
  const ideaHex = root.querySelector("#rv-set-idea-hex");
  const wordColor = root.querySelector("#rv-set-word");
  const wordHex = root.querySelector("#rv-set-word-hex");
  const ideaSwatch = root.querySelector(".rv-settings-swatch-idea");
  const wordSwatch = root.querySelector(".rv-settings-swatch-word");
  const toast = root.querySelector("#rv-set-toast");
  const backupToast = root.querySelector("#rv-set-backup-toast");
  const backupBtn = root.querySelector("#rv-set-backup");
  const restoreBtn = root.querySelector("#rv-set-restore");
  const restoreFile = root.querySelector("#rv-set-restore-file");

  function syncSwatches() {
    if (ideaSwatch) ideaSwatch.style.setProperty("--swatch", ideaColor.value);
    if (wordSwatch) wordSwatch.style.setProperty("--swatch", wordColor.value);
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

  function showToast(el, msg) {
    el.hidden = false;
    el.textContent = msg;
    clearTimeout(el._toastT);
    el._toastT = setTimeout(() => {
      el.hidden = true;
    }, 2200);
  }

  function setBusy(busy) {
    backupBtn.disabled = busy;
    restoreBtn.disabled = busy;
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

  root.querySelectorAll(".rv-settings-preset").forEach((btn) => {
    btn.addEventListener("click", () => {
      setIdea(btn.dataset.idea);
      setWord(btn.dataset.word);
    });
  });

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

  root.querySelector("#rv-set-save").addEventListener("click", async () => {
    const next = await onSave({
      ideaHighlightColor: ideaColor.value,
      wordHighlightColor: wordColor.value,
      wordMatchMode: selectedMatchMode()
    });
    if (next) {
      setIdea(next.ideaHighlightColor);
      setWord(next.wordHighlightColor);
      setMatchMode(next.wordMatchMode);
      showToast(toast, "✓ 已保存");
    } else {
      showToast(toast, "保存失败");
    }
  });

  root.querySelector("#rv-set-reset").addEventListener("click", async () => {
    const next = await onReset();
    if (next) {
      setIdea(next.ideaHighlightColor);
      setWord(next.wordHighlightColor);
      setMatchMode(next.wordMatchMode);
      showToast(toast, "✓ 已恢复默认");
    }
  });

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

function normalizeLocalHex(value) {
  const raw = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toLowerCase()}`;
  return null;
}
