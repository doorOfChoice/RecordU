import { getScreenshotDataUrl } from "../shared/api.js";
import { contextLabel, exactOf, isScreenshot } from "../shared/captures.js";
import { escapeHtml } from "../shared/dom.js";
import { favSlotHtml, fillFavSlots } from "../shared/favicon.js";
import { dateRangeLabel, fmtTime } from "../shared/time.js";
import { entryActionsHtml } from "./action-icons.js";
import { bindShotPreview } from "./image-preview.js";
import { clampFocus, focusedSite, siteGroups, state } from "./state.js";

/**
 * @param {object} opts
 * @param {HTMLElement} opts.root
 * @param {HTMLElement} opts.progressEl
 * @param {HTMLElement} opts.emptyEl
 * @param {(id: string) => Promise<void>} opts.onDrop
 * @param {(id: string) => Promise<void>} [opts.onEdit]
 */
export function renderBrowse({ root, progressEl, emptyEl, onDrop, onEdit }) {
  clampFocus();
  const sites = siteGroups();
  const range = dateRangeLabel(state.dateRange);
  const totalItems = sites.reduce((n, s) => n + s.items.length, 0);

  if (!sites.length) {
    progressEl.textContent = `按网站 · 0 站 · ${range}`;
    emptyEl.classList.remove("hidden");
    root.classList.add("hidden");
    root.innerHTML = "";
    emptyEl.querySelector(".rv-empty-text").textContent = "这个范围下没有记录。";
    return null;
  }

  progressEl.textContent = `按网站 · ${sites.length} 站 · ${totalItems} 条 · ${range}`;
  emptyEl.classList.add("hidden");
  root.classList.remove("hidden");

  const site = focusedSite() || sites[0];
  const railItems = sites
    .map((s, i) => {
      const host = s.key === "__none__" ? null : s.key;
      return `
        <button type="button" class="rv-rail-item rv-rail-item-site${i === state.focusIndex ? " is-on" : ""}" data-index="${i}">
          ${favSlotHtml(host)}
          <span class="rv-rail-body">
            <span class="rv-rail-note">${escapeHtml(s.label)}</span>
            <span class="rv-rail-sub">${s.items.length} 条 · 最近 ${fmtTime(s.latest, true)}</span>
          </span>
        </button>
      `;
    })
    .join("");

  const entries = site.items
    .map((c) => {
      const exact = exactOf(c);
      const ctx = contextLabel(c);
      const shot = isScreenshot(c)
        ? `<div class="rv-shot rv-shot-sm" data-shot-id="${escapeHtml(c.id)}"><div class="rv-shot-loading">加载截图…</div></div>`
        : "";
      return `
        <article class="rv-site-entry" data-id="${escapeHtml(c.id)}">
          <p class="rv-note">${escapeHtml(c.text)}</p>
          ${shot}
          ${exact ? `<blockquote class="rv-quote">${escapeHtml(exact)}</blockquote>` : ""}
          ${!exact && ctx ? `<p class="rv-ctx-label">${escapeHtml(ctx)}</p>` : ""}
          <div class="rv-meta">
            <span class="rv-meta-info">
              <span>${fmtTime(c.createdAt, true)}</span>
              ${
                c.pageUrl
                  ? `<a class="rv-source" href="${escapeHtml(c.pageUrl)}" target="_blank" rel="noopener">${escapeHtml(c.pageTitle || "原文")}</a>`
                  : ""
              }
            </span>
            <span class="rv-meta-actions">${entryActionsHtml(c.id)}</span>
          </div>
        </article>
      `;
    })
    .join("");

  root.innerHTML = `
    <div class="rv-split">
      <aside class="rv-rail" aria-label="网站列表">${railItems}</aside>
      <section class="rv-pane rv-pane-site">
        <header class="rv-pane-site-head">
          <div class="rv-pane-site-title-row">
            ${favSlotHtml(site.key === "__none__" ? null : site.key)}
            <div>
              <h2 class="rv-pane-site-title">${escapeHtml(site.label)}</h2>
              <p class="rv-pane-site-sub">${site.items.length} 条感触</p>
            </div>
          </div>
        </header>
        <div class="rv-site-entries">${entries}</div>
      </section>
    </div>
  `;

  fillFavSlots(root);

  root.querySelectorAll(".rv-shot[data-shot-id]").forEach((el) => {
    const id = el.dataset.shotId;
    getScreenshotDataUrl(id).then((dataUrl) => {
      if (!el.isConnected) return;
      if (!dataUrl) {
        el.innerHTML = `<div class="rv-shot-loading">截图不可用</div>`;
        return;
      }
      el.innerHTML = `<img alt="截图" src="${dataUrl}">`;
      bindShotPreview(el, dataUrl);
    });
  });

  const onItem = root.querySelector(`.rv-rail-item[data-index="${state.focusIndex}"]`);
  if (onItem) onItem.scrollIntoView({ block: "nearest", behavior: "smooth" });

  root.querySelectorAll(".rv-rail-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.focusIndex = Number(btn.dataset.index);
      renderBrowse({ root, progressEl, emptyEl, onDrop, onEdit });
    });
  });

  root.querySelector(".rv-site-entries").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const id = btn.dataset.id;
    if (!id) return;
    if (btn.dataset.act === "drop") await onDrop(id);
    if (btn.dataset.act === "edit" && onEdit) await onEdit(id);
  });

  return site;
}
