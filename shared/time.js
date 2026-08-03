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
