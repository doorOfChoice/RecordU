export function pad(n) {
  return String(n).padStart(2, "0");
}

export function dayKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function dayStr(offset) {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return dayKey(d);
}

/** Human label for a local YYYY-MM-DD key (今天 / 昨天 / M月D日 / Y年M月D日). */
export function formatDayLabel(key) {
  const s = String(key || "");
  const today = dayStr(0);
  const yesterday = dayStr(1);
  if (s === today) return "今天";
  if (s === yesterday) return "昨天";
  const parts = s.split("-").map((x) => Number(x));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return s;
  const [y, m, d] = parts;
  if (y === new Date().getFullYear()) return `${m}月${d}日`;
  return `${y}年${m}月${d}日`;
}

export function weekStart(ts = Date.now()) {
  const d = new Date(ts);
  const day = (d.getDay() + 6) % 7;
  const monday = new Date(d);
  monday.setDate(d.getDate() - day);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export function weekEnd(ts = Date.now()) {
  const end = weekStart(ts);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function inThisWeek(ts) {
  const t = new Date(ts).getTime();
  return t >= weekStart().getTime() && t <= weekEnd().getTime();
}

export function inEarlierThanThisWeek(ts) {
  return new Date(ts).getTime() < weekStart().getTime();
}

export function inDay(ts, offset, exact) {
  const d = new Date(ts);
  if (exact) return dayKey(d) === exact;
  return dayKey(d) === dayStr(offset);
}

/** Count items whose createdAt falls on local today. */
export function countCreatedToday(items) {
  return (Array.isArray(items) ? items : []).filter((x) => x && inDay(x.createdAt, 0)).length;
}

export function fmtTime(ts, short) {
  const d = new Date(ts);
  if (short) {
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function weekLabel(ts) {
  const monday = weekStart(ts);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (x) => `${x.getMonth() + 1}月${x.getDate()}日`;
  return `${monday.getFullYear()} 年 ${fmt(monday)} ~ ${fmt(sunday)}`;
}

export function dateRangeLabel(range) {
  if (range === "week") return "本周";
  if (range === "earlier") return "更早";
  if (range === "all") return "全部";
  return range;
}
