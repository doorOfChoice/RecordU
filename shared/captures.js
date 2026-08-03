import { inEarlierThanThisWeek, inThisWeek } from "./time.js";

const PALETTE = ["#3d5a80", "#2a9d8f", "#6b705c", "#577590", "#4a4e69", "#22223b", "#5c677d", "#415a77"];

export function exactOf(c) {
  return (c && c.anchor && c.anchor.exact) || "";
}

export function isScreenshot(c) {
  return !!(c && c.type === "screenshot");
}

export function contextLabel(c) {
  const exact = exactOf(c);
  if (exact) return exact;
  if (isScreenshot(c)) return "截图批注";
  return "";
}

export function hostnameOf(c) {
  if (!c || !c.pageUrl) return null;
  try {
    let h = new URL(c.pageUrl).hostname;
    if (h.startsWith("www.")) h = h.slice(4);
    return h || null;
  } catch (e) {
    return null;
  }
}

export function pageKeyOf(c) {
  if (!c || !c.pageUrl) return "__none__";
  try {
    const u = new URL(c.pageUrl);
    return u.host + u.pathname;
  } catch (e) {
    return c.pageUrl;
  }
}

export function siteColor(host) {
  const key = host || "none";
  let h = 7;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function filterCaptures(list, { status = "all", dateRange = "all" } = {}) {
  let out = status === "all" ? list.slice() : list.filter((c) => c.status === status);
  if (dateRange === "week") out = out.filter((c) => inThisWeek(c.createdAt));
  else if (dateRange === "earlier") out = out.filter((c) => inEarlierThanThisWeek(c.createdAt));
  return out;
}

export function groupBySite(list) {
  const sites = new Map();
  for (const c of list) {
    const host = hostnameOf(c);
    const key = host || "__none__";
    const label = host || "未记录来源";
    let s = sites.get(key);
    if (!s) {
      s = { key, label, items: [], latest: 0 };
      sites.set(key, s);
    }
    s.items.push(c);
    s.latest = Math.max(s.latest, c.createdAt);
  }
  const arr = [...sites.values()];
  arr.sort((a, b) => b.latest - a.latest);
  for (const s of arr) s.items.sort((a, b) => b.createdAt - a.createdAt);
  return arr;
}

export function groupArticles(items) {
  const pages = new Map();
  for (const c of items) {
    const key = pageKeyOf(c);
    let p = pages.get(key);
    if (!p) {
      p = { key, title: c.pageTitle || "", url: c.pageUrl || "", items: [] };
      pages.set(key, p);
    }
    if (!p.title && c.pageTitle) p.title = c.pageTitle;
    if (!p.url && c.pageUrl) p.url = c.pageUrl;
    p.items.push(c);
  }
  return [...pages.values()].sort((a, b) => b.items[0].createdAt - a.items[0].createdAt);
}
