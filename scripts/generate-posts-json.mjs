import fs from "node:fs/promises";
import path from "node:path";

const PROJECT_ROOT = process.cwd();
const POSTS_DIR = path.join(PROJECT_ROOT, "posts");
const OUTPUT_FILE = path.join(POSTS_DIR, "posts.json");
const COVER_SOURCE = "https://bing.img.run/rand_1366x768.php";

function toPosix(relPath) {
  return relPath.split(path.sep).join("/");
}

function normalizeDate(value) {
  if (!value) return "1970-01-01";
  const str = String(value).trim();
  const hit = str.match(/(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/);
  if (hit) {
    return `${hit[1]}-${hit[2].padStart(2, "0")}-${hit[3].padStart(2, "0")}`;
  }
  return str;
}

function parseTags(frontmatter) {
  const fm = frontmatter.replace(/\r\n/g, "\n");

  const listBlock = fm.match(/(?:^|\n)tags:\s*\n((?:[ \t]*-[^\n]*\n?)*)/);
  if (listBlock && listBlock[1].trim()) {
    return listBlock[1]
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("-"))
      .map((line) => line.slice(1).trim())
      .filter(Boolean);
  }

  const inline = fm.match(/(?:^|\n)tags:\s*(.+)\s*(?:\n|$)/);
  if (!inline) return [];
  const raw = inline[1].trim();
  if (!raw) return [];

  if (raw.startsWith("[") && raw.endsWith("]")) {
    return raw
      .slice(1, -1)
      .split(",")
      .map((tag) => tag.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }

  return raw
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function parseDate(frontmatter) {
  const fm = frontmatter.replace(/\r\n/g, "\n");
  const hit = fm.match(/(?:^|\n)date:\s*(.+)\s*(?:\n|$)/);
  return normalizeDate(hit ? hit[1] : "");
}

function parseColumns(frontmatter) {
  const fm = frontmatter.replace(/\r\n/g, "\n");

  const listBlock = fm.match(/(?:^|\n)(?:column|columns|专栏):\s*\n((?:[ \t]*-[^\n]*\n?)*)/);
  if (listBlock && listBlock[1].trim()) {
    return listBlock[1]
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("-"))
      .map((line) => line.slice(1).trim())
      .map((item) => item.replace(/^["']|["']$/g, ""))
      .map((item) => item.replace(/[\\/]/g, "").trim())
      .filter(Boolean);
  }

  const inline = fm.match(/(?:^|\n)(?:column|columns|专栏):\s*(.+)\s*(?:\n|$)/);
  if (!inline) return [];
  const raw = inline[1].trim();
  if (!raw) return [];

  if (raw.startsWith("[") && raw.endsWith("]")) {
    return raw
      .slice(1, -1)
      .split(",")
      .map((item) => item.trim().replace(/^["']|["']$/g, ""))
      .map((item) => item.replace(/[\\/]/g, "").trim())
      .filter(Boolean);
  }

  return raw
    .split(",")
    .map((item) => item.trim().replace(/^["']|["']$/g, ""))
    .map((item) => item.replace(/[\\/]/g, "").trim())
    .filter(Boolean);
}

function stripFrontmatter(content) {
  const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/);
  if (!match) return { frontmatter: "", body: content };
  return { frontmatter: match[1], body: content.slice(match[0].length) };
}

function extractTitle(body, relPath) {
  const hit = body.match(/^\s*#\s+(.+)$/m);
  if (hit) return hit[1].trim();
  const name = path.basename(relPath, ".md");
  return name;
}

async function findAllMdFiles(dir) {
  /** @type {string[]} */
  const out = [];

  async function walk(current) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".md")) {
        out.push(toPosix(path.relative(POSTS_DIR, full)));
      }
    }
  }

  await walk(dir);
  out.sort();
  return out;
}

async function loadExistingCovers() {
  try {
    const raw = await fs.readFile(OUTPUT_FILE, "utf8");
    const items = JSON.parse(raw);
    if (!Array.isArray(items)) return new Map();
    const map = new Map();
    for (const item of items) {
      if (item && item.file && typeof item.cover === "string" && item.cover.trim()) {
        map.set(String(item.file), item.cover.trim());
      }
    }
    return map;
  } catch (err) {
    return new Map();
  }
}

async function fetchCoverUrl() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const resp = await fetch(COVER_SOURCE, { redirect: "follow", signal: controller.signal });
    const finalUrl = resp.url || COVER_SOURCE;
    if (resp.body && typeof resp.body.cancel === "function") {
      await resp.body.cancel();
    }
    return finalUrl;
  } catch (err) {
    console.warn("获取头图失败:", err?.message || err);
    return "";
  } finally {
    clearTimeout(timer);
  }
}

async function buildPostsJson() {
  const mdFiles = await findAllMdFiles(POSTS_DIR);
  const existingCovers = await loadExistingCovers();
  const posts = [];

  for (const relPath of mdFiles) {
    const fullPath = path.join(POSTS_DIR, relPath);
    const raw = await fs.readFile(fullPath, "utf8");
    const { frontmatter, body } = stripFrontmatter(raw);
    let cover = existingCovers.get(relPath) || "";
    if (!cover) {
      cover = await fetchCoverUrl();
    }
    posts.push({
      title: extractTitle(body, relPath),
      file: relPath,
      date: parseDate(frontmatter),
      tags: parseTags(frontmatter),
      columns: parseColumns(frontmatter),
      wordCount: body.trim().length,
      cover,
    });
  }

  posts.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(posts, null, 4)}\n`, "utf8");
  console.log(`已生成 posts.json，共 ${posts.length} 篇文章`);
}

buildPostsJson().catch((err) => {
  console.error("生成 posts.json 失败:", err);
  process.exit(1);
});
