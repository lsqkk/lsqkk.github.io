import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const DIST_POSTS = path.join(ROOT, "dist", "posts");
const ROOT_POSTS = path.join(ROOT, "posts");
const DIST_BLOG = path.join(ROOT, "dist", "blog");
const ROOT_BLOG = path.join(ROOT, "blog");
const DIST_TOOL = path.join(ROOT, "dist", "tool");
const ROOT_TOOL = path.join(ROOT, "tool");
const DIST_GAMES = path.join(ROOT, "dist", "games");
const ROOT_GAMES = path.join(ROOT, "games");
const DIST_A = path.join(ROOT, "dist", "a");
const ROOT_A = path.join(ROOT, "a");

async function walk(dir) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walk(full)));
      continue;
    }
    out.push(full);
  }
  return out;
}

async function publishPostsHtml() {
  const publishDirs = [
    { distDir: DIST_POSTS, rootDir: ROOT_POSTS, label: "posts" },
    { distDir: DIST_BLOG, rootDir: ROOT_BLOG, label: "blog" },
    { distDir: DIST_TOOL, rootDir: ROOT_TOOL, label: "tool" },
    { distDir: DIST_GAMES, rootDir: ROOT_GAMES, label: "games" },
    { distDir: DIST_A, rootDir: ROOT_A, label: "a" },
  ];

  let hasBuildOutput = false;
  const publishStats = [];
  for (const { distDir, rootDir, label } of publishDirs) {
    try {
      await fs.access(distDir);
    } catch {
      continue;
    }
    hasBuildOutput = true;
    const dirFiles = await walk(distDir);
    const dirHtmlFiles = dirFiles.filter((file) => file.toLowerCase().endsWith(".html"));
    let dirCopied = 0;
    for (const src of dirHtmlFiles) {
      const rel = path.relative(distDir, src);
      const dest = path.join(rootDir, rel);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.copyFile(src, dest);
      dirCopied += 1;
    }
    publishStats.push(`${label} HTML ${dirCopied} 个`);
  }

  if (!hasBuildOutput) {
    throw new Error("未找到 dist/posts、dist/blog、dist/tool、dist/games、dist/a，请先执行 npm run build");
  }

  const distIndex = path.join(ROOT, "dist", "index.html");
  const rootIndex = path.join(ROOT, "index.html");
  let indexCopied = false;
  try {
    await fs.access(distIndex);
    await fs.copyFile(distIndex, rootIndex);
    indexCopied = true;
  } catch {
    indexCopied = false;
  }

  const statsText = publishStats.join("，");
  console.log(`已发布 Astro 页面: ${statsText}${indexCopied ? "，并更新根目录 index.html" : ""}`);
}

publishPostsHtml().catch((err) => {
  console.error("发布 Astro 文章页失败:", err);
  process.exit(1);
});
