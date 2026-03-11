import fs from "node:fs/promises";
import path from "node:path";

const POSTS_DIR = path.join(process.cwd(), "posts");

export async function buildPostCaseMap() {
  const map = new Map<string, string>();
  async function walk(current: string) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".md")) {
        const rel = path.relative(POSTS_DIR, full);
        const posix = rel.split(path.sep).join("/").replace(/\.md$/i, "");
        map.set(posix.toLowerCase(), posix);
      }
    }
  }
  await walk(POSTS_DIR);
  return map;
}

export function resolveCaseSlug(raw: string, caseMap: Map<string, string>) {
  if (!raw) return raw;
  return caseMap.get(String(raw).toLowerCase()) || raw;
}
