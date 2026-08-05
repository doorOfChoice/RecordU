import { escapeHtml } from "../shared/dom.js";
import { fmtTime } from "../shared/time.js";
import { entryActionsHtml } from "./action-icons.js";
import { clampFocus, focusedWord, wordsList, state } from "./state.js";

/**
 * @param {object} opts
 * @param {HTMLElement} opts.root
 * @param {HTMLElement} opts.progressEl
 * @param {HTMLElement} opts.emptyEl
 * @param {(id: string) => Promise<void>} opts.onDrop
 * @param {(id: string) => Promise<void>} [opts.onEdit]
 */
export function renderWords({ root, progressEl, emptyEl, onDrop, onEdit }) {
  clampFocus();
  const list = wordsList();

  if (!list.length) {
    progressEl.textContent = "单词 · 0 个";
    emptyEl.classList.remove("hidden");
    root.classList.add("hidden");
    root.innerHTML = "";
    emptyEl.querySelector(".rv-empty-text").textContent =
      "还没有标记单词。在网页上划词后点「标记单词」即可。";
    return null;
  }

  progressEl.textContent = `单词 · ${list.length} 个 · 第 ${state.focusIndex + 1} 个`;
  emptyEl.classList.add("hidden");
  root.classList.remove("hidden");

  root.innerHTML = `
    <div class="rv-words">
      ${list
        .map((w, i) => {
          const note = (w.note || "").trim();
          return `
        <article class="rv-word-entry${i === state.focusIndex ? " is-on" : ""}" data-id="${escapeHtml(w.id)}" data-index="${i}">
          <p class="rv-word-term">${escapeHtml(w.word)}</p>
          ${note ? `<p class="rv-word-note">${escapeHtml(note)}</p>` : `<p class="rv-word-note rv-word-note-empty">无释义</p>`}
          <div class="rv-meta">
            <span class="rv-meta-info">
              <span>${fmtTime(w.createdAt, true)}</span>
              ${
                w.pageUrl
                  ? `<a class="rv-source" href="${escapeHtml(w.pageUrl)}" target="_blank" rel="noopener">${escapeHtml(w.pageTitle || "来源")}</a>`
                  : ""
              }
            </span>
            <span class="rv-meta-actions">${entryActionsHtml(w.id)}</span>
          </div>
        </article>`;
        })
        .join("")}
    </div>
  `;

  root.querySelectorAll(".rv-word-entry").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest && e.target.closest("[data-act]")) return;
      const idx = Number(el.dataset.index);
      if (!Number.isFinite(idx)) return;
      state.focusIndex = idx;
      renderWords({ root, progressEl, emptyEl, onDrop, onEdit });
    });
  });

  root.querySelectorAll("[data-act]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = btn.dataset.id;
      if (!id) return;
      if (btn.dataset.act === "drop") await onDrop(id);
      if (btn.dataset.act === "edit" && onEdit) await onEdit(id);
    });
  });

  const onEl = root.querySelector(".rv-word-entry.is-on");
  if (onEl && typeof onEl.scrollIntoView === "function") {
    onEl.scrollIntoView({ block: "nearest" });
  }

  return focusedWord();
}
