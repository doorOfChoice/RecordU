import { fetchFavicon } from "./api.js";
import { siteColor } from "./captures.js";
import { escapeHtml } from "./dom.js";

export function favSlotHtml(host) {
  if (!host || host === "__none__") {
    return letterHtml("none", "?");
  }
  return `<span class="rv-fav-slot" data-host="${escapeHtml(host)}"></span>`;
}

function letterHtml(host, letter) {
  const ch = letter || (host && host[0] ? host[0].toUpperCase() : "?");
  return `<span class="rv-fav rv-fav-letter" data-host="${escapeHtml(host || "none")}" style="background:${siteColor(host)}">${escapeHtml(ch)}</span>`;
}

function makeLetter(host) {
  const el = document.createElement("span");
  el.className = "rv-fav rv-fav-letter";
  el.dataset.host = host || "none";
  el.style.background = siteColor(host);
  el.textContent = (host && host[0] ? host[0] : "?").toUpperCase();
  return el;
}

function findPlaceholder(root, host, fallback) {
  if (fallback && fallback.isConnected) return fallback;
  if (!root) return null;
  return root.querySelector(`.rv-fav-letter[data-host="${CSS.escape(host)}"]`);
}

function upgradeToImage(el, dataUrl) {
  if (!el || !el.isConnected || !dataUrl) return false;
  const img = document.createElement("img");
  img.className = "rv-fav";
  img.alt = "";
  img.decoding = "async";
  img.src = dataUrl;
  el.replaceWith(img);
  return true;
}

function tryDirectImage(root, host, el) {
  const sources = [
    `https://icons.duckduckgo.com/ip3/${host}.ico`,
    `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(host)}`,
    `https://favicon.yandex.net/favicon/${host}`
  ];
  let i = 0;
  const img = new Image();
  img.referrerPolicy = "no-referrer";
  img.onload = () => {
    const target = findPlaceholder(root, host, el);
    if (target) upgradeToImage(target, img.src);
  };
  img.onerror = () => {
    i++;
    if (i < sources.length) img.src = sources[i];
  };
  img.src = sources[0];
}

export function fillFavSlots(root) {
  if (!root) return;
  const slots = [...root.querySelectorAll(".rv-fav-slot[data-host]")];
  for (const slot of slots) {
    const host = slot.dataset.host;
    if (!host) {
      slot.replaceWith(makeLetter("none"));
      continue;
    }
    const placeholder = makeLetter(host);
    slot.replaceWith(placeholder);

    fetchFavicon(host)
      .then((dataUrl) => {
        const target = findPlaceholder(root, host, placeholder);
        if (dataUrl && upgradeToImage(target, dataUrl)) return;
        tryDirectImage(root, host, placeholder);
      })
      .catch(() => tryDirectImage(root, host, placeholder));
  }
}
