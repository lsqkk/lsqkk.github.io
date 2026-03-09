export interface DynamicEntry {
  id: string;
  title: string;
  date: string;
  content: string;
  lines: string[];
}

function normalizeDate(dateText: string): string {
  const trimmed = (dateText || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  return "";
}

export function parseDynamicEntries(markdown: string): DynamicEntry[] {
  const lines = markdown.split(/\r?\n/);
  const rawEntries: Array<{ title: string; date: string; lines: string[] }> = [];
  let current: { title: string; date: string; lines: string[] } | null = null;

  for (const rawLine of lines) {
    const line = rawLine ?? "";
    if (line.startsWith("# ")) {
      if (current) rawEntries.push(current);
      current = { title: line.slice(2).trim(), date: "", lines: [] };
      continue;
    }
    if (!current) continue;
    if (line.startsWith("## 日期：")) {
      current.date = normalizeDate(line.replace("## 日期：", "").trim());
      continue;
    }
    if (!line.startsWith("#") && line.trim()) {
      current.lines.push(line.trim());
    }
  }

  if (current) rawEntries.push(current);

  const dateCounters = new Map<string, number>();
  return rawEntries.map((item, index) => {
    const dateKey = item.date || "undated";
    const seq = (dateCounters.get(dateKey) || 0) + 1;
    dateCounters.set(dateKey, seq);
    const id = `${dateKey}-${seq}`;
    return {
      id,
      title: item.title || `未命名动态-${index + 1}`,
      date: item.date,
      content: item.lines.join("\n"),
      lines: item.lines,
    };
  });
}
