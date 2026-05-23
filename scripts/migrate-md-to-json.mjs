import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const GITHUB_REPO = "https://github.com/lsqkk/lsqkk.github.io";

/**
 * Parse dt.md content into the new format:
 * { id, title, date, content (pure text), images (string[]) }
 */
function parseDtMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/);
  const rawEntries = [];
  let current = null;

  for (const rawLine of lines) {
    const line = rawLine ?? "";
    if (line.startsWith("# ")) {
      if (current) rawEntries.push(current);
      current = { title: line.slice(2).trim(), date: "", lines: [] };
      continue;
    }
    if (!current) continue;
    if (line.startsWith("## 日期：")) {
      current.date = line.replace("## 日期：", "").trim();
      continue;
    }
    if (!line.startsWith("#") && line.trim()) {
      current.lines.push(line.trim());
    }
  }
  if (current) rawEntries.push(current);

  const dateCounters = new Map();
  return rawEntries.map((item, index) => {
    const dateKey = item.date || "undated";
    const seq = (dateCounters.get(dateKey) || 0) + 1;
    dateCounters.set(dateKey, seq);
    const id = `${dateKey}-${seq}`;

    // Separate images from text lines
    const images = [];
    const textLines = [];
    for (const line of item.lines) {
      const imgMatch = line.match(/^!\[.*?\]\((.*?)\)$/);
      if (imgMatch && imgMatch[1]) {
        images.push(imgMatch[1]);
      } else {
        textLines.push(line);
      }
    }

    return {
      id,
      title: item.title || `未命名动态-${index + 1}`,
      date: item.date,
      content: textLines.join("\n"),
      images,
    };
  });
}

/**
 * Parse log.md into new structured format.
 * Date sections become { date, entries: [{ type, description, commit }] }.
 * The header section stays as { title, content }.
 */
function parseLogMarkdown(markdown) {
  const sections = [];
  const parts = markdown.split(/(?=^# )/m);

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const titleMatch = trimmed.match(/^# (.*)$/m);
    if (!titleMatch) continue;
    const title = titleMatch[1];
    const content = trimmed.replace(/^# .*$/m, "").trim().replace(/\r\n/g, "\n");

    // Check if this is a date section
    if (/^\d{4}-\d{2}-\d{2}$/.test(title)) {
      const entries = [];
      for (const rawLine of content.split("\n")) {
        const line = rawLine.trim();
        if (!line) continue;
        const entryMatch = line.match(/^([一-龥A-Za-z]+)\s*-\s*(.+)$/);
        if (!entryMatch) continue;
        const type = entryMatch[1].trim();
        let detail = entryMatch[2].trim();
        // Extract trailing commit hash link: [`hash`](url)
        const hashMatch = detail.match(/\[`([a-f0-9]{6})`\]\([^)]+\)\s*$/);
        let commit = "";
        if (hashMatch) {
          commit = hashMatch[1];
          detail = detail.replace(hashMatch[0], "").trim();
        }
        entries.push({ type, description: detail, commit });
      }
      if (entries.length > 0) {
        sections.push({ date: title, entries });
      }
    } else {
      // Header or other non-date section
      sections.push({ title, content });
    }
  }
  return sections;
}

async function main() {
  const dtMdPath = path.join(ROOT, "assets", "md", "dt.md");
  const logMdPath = path.join(ROOT, "assets", "md", "log.md");
  const dataDir = path.join(ROOT, "assets", "data");

  await fs.mkdir(dataDir, { recursive: true });

  // --- Migrate dt.md → dt.json ---
  try {
    const dtMd = await fs.readFile(dtMdPath, "utf8");
    const dtEntries = parseDtMarkdown(dtMd);
    await fs.writeFile(
      path.join(dataDir, "dt.json"),
      JSON.stringify(dtEntries, null, 2),
      "utf8"
    );
    console.log(`dt.json: ${dtEntries.length} entries written.`);
  } catch (err) {
    console.warn("dt.md parse error, writing empty dt.json.", err.message);
    await fs.writeFile(path.join(dataDir, "dt.json"), "[]", "utf8");
  }

  // --- Migrate log.md → log.json ---
  try {
    const logMd = await fs.readFile(logMdPath, "utf8");
    const logSections = parseLogMarkdown(logMd);
    await fs.writeFile(
      path.join(dataDir, "log.json"),
      JSON.stringify(logSections, null, 2),
      "utf8"
    );
    console.log(`log.json: ${logSections.length} sections written.`);
  } catch (err) {
    console.warn("log.md parse error, writing empty log.json.", err.message);
    await fs.writeFile(path.join(dataDir, "log.json"), "[]", "utf8");
  }

  console.log("Migration complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
