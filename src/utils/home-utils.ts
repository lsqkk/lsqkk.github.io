import fs from "node:fs/promises";
import path from "node:path";

export function escapeHtml(text: unknown): string {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function stripMarkdownLinks(text: string): string {
  let result = text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  result = result.replace(/`[a-f0-9]{6}`\s*$/, "");
  return result.trim();
}

export interface LogEntry {
  type: string;
  detail: string;
  date: string;
}

export interface LogSection {
  title: string;
  content: string;
}

/** Parse log entries from the old markdown format (for backward compatibility). */
export function parseRecentLogs(content: string, maxItems: number): LogEntry[] {
  const lines = content.split(/\r?\n/);
  const items: LogEntry[] = [];
  let currentDate = "";
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const dateMatch = line.match(/^#\s+(\d{4}-\d{2}-\d{2})$/);
    if (dateMatch) {
      currentDate = dateMatch[1];
      continue;
    }
    const itemMatch = line.match(/^([一-龥A-Za-z]+)\s*-\s*(.+)$/);
    if (!itemMatch) continue;
    items.push({
      type: itemMatch[1].trim(),
      detail: stripMarkdownLinks(itemMatch[2].trim()),
      date: currentDate,
    });
    if (items.length >= maxItems) break;
  }
  return items;
}

/** Parse log entries from the JSON format. Supports both old and new structures. */
export function parseRecentLogsFromJson(logData: any[], maxItems: number): LogEntry[] {
  const items: LogEntry[] = [];
  for (const section of logData) {
    let currentDate = "";
    let entries: Array<{ type: string; detail: string }> = [];

    if (section.entries) {
      // New format: { date: "YYYY-MM-DD", entries: [{ type, description, commit }] }
      currentDate = section.date || "";
      if (!currentDate.match(/^\d{4}-\d{2}-\d{2}$/)) continue;
      for (const entry of section.entries) {
        entries.push({ type: entry.type, detail: entry.description || "" });
      }
    } else if (section.title) {
      // Old format: { title: "YYYY-MM-DD", content: "type - desc\n..." }
      const dateMatch = section.title.match(/^(\d{4}-\d{2}-\d{2})$/);
      if (!dateMatch) continue;
      currentDate = dateMatch[1];
      const lines = (section.content || "").split(/\r?\n/);
      for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        const itemMatch = line.match(/^([一-龥A-Za-z]+)\s*-\s*(.+)$/);
        if (!itemMatch) continue;
        entries.push({
          type: itemMatch[1].trim(),
          detail: stripMarkdownLinks(itemMatch[2].trim()),
        });
      }
    } else {
      continue;
    }

    for (const entry of entries) {
      items.push({ type: entry.type, detail: entry.detail, date: currentDate });
      if (items.length >= maxItems) break;
    }
    if (items.length >= maxItems) break;
  }
  return items;
}

export function getLogTagClass(type: string): string {
  if (type === "更新") return "update";
  if (type === "优化") return "optimize";
  if (type === "新增") return "add";
  if (type === "修复") return "fix";
  return "default";
}

export function extractDynamicImages(content: string) {
  const matches = Array.from(content.matchAll(/!\[.*?\]\((.*?)\)/g));
  const images = matches.map((item) => item[1]).filter(Boolean);
  const text = content.replace(/!\[.*?\]\((.*?)\)/g, "").trim();
  return { text, images };
}

export function buildDynamicGallery(images: string[], id: string) {
  if (!images.length) return "";
  const total = images.length;
  const displayCount = Math.min(total, 9);
  const perRow = displayCount <= 4 ? 2 : 3;
  const rows = Math.ceil(displayCount / perRow);
  let html = `<div class="gallery-container" data-gallery-id="${id}" data-gallery-images='${escapeHtml(JSON.stringify(images))}'>`;
  let imgIdx = 0;
  for (let row = 0; row < rows; row += 1) {
    html += '<div class="gallery-row">';
    const start = row * perRow;
    const end = Math.min(start + perRow, displayCount);
    for (let i = start; i < end; i += 1, imgIdx += 1) {
      const image = images[imgIdx];
      const isOverflow = imgIdx === 8 && total > 9;
      html += `
        <button type="button" class="gallery-item${isOverflow ? " gallery-item-overflow" : ""}" aria-label="查看图片 ${imgIdx + 1}" data-gallery-index="${imgIdx}">
          <img src="${escapeHtml(image)}" alt="动态图片 ${imgIdx + 1}" loading="lazy" data-skeleton-img>
          ${isOverflow ? `<div class="gallery-overlay">+${total - 9}</div>` : ""}
        </button>
      `;
    }
    html += "</div>";
  }
  html += "</div>";
  return html;
}

export function renderPlainLines(text: string) {
  return escapeHtml(text).replace(/\n/g, "<br>");
}

export function sumArrayLengths(arr: any[] | undefined, key: string): number {
  if (!Array.isArray(arr)) return 0;
  return arr.reduce((sum: number, item: any) => sum + (item[key]?.length || 0), 0);
}

export async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
