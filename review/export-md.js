import { exactOf, hostnameOf } from "../shared/captures.js";
import { dateRangeLabel, fmtTime, weekLabel } from "../shared/time.js";

export function exportMarkdown(list, { dateRange = "all", statusLabel = "全部" } = {}) {
  const lines = [];
  const sorted = list.slice().sort((a, b) => b.createdAt - a.createdAt);
  const sites = new Set(sorted.map((c) => hostnameOf(c)).filter(Boolean));

  lines.push(`# RecordU · 导出`);
  lines.push(`导出时间：${fmtTime(Date.now())}`);
  lines.push(`筛选：${dateRangeLabel(dateRange)} · ${statusLabel}`);
  lines.push(`共 ${sorted.length} 条，来自 ${sites.size} 个网站。`);
  lines.push("");

  const groups = [];
  for (const c of sorted) {
    const key = weekLabel(c.createdAt);
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = { key, items: [] };
      groups.push(g);
    }
    g.items.push(c);
  }

  for (const g of groups) {
    lines.push(`## ${g.key}`);
    lines.push("");
    for (const c of g.items) {
      const src = c.pageUrl ? `\n\n来源：[${c.pageTitle || c.pageUrl}](${c.pageUrl})` : "";
      const exact = exactOf(c);
      const ctx = exact ? `\n> ${exact.split("\n").join("\n> ")}` : "";
      lines.push(`### ${fmtTime(c.createdAt)}`);
      lines.push("");
      lines.push(c.text);
      if (ctx) lines.push(ctx);
      if (src) lines.push(src);
      lines.push("");
    }
  }

  const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `RecordU-${new Date().toISOString().slice(0, 10)}.md`;
  a.click();
  URL.revokeObjectURL(url);
}
