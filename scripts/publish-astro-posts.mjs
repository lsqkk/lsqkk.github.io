import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const DIST_POSTS = path.join(ROOT, "dist", "posts");
const ROOT_POSTS = path.join(ROOT, "posts");

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
  try {
    await fs.access(DIST_POSTS);
  } catch {
    throw new Error("未找到 dist/posts，请先执行 npm run build");
  }

  const files = await walk(DIST_POSTS);
  const htmlFiles = files.filter((file) => file.toLowerCase().endsWith(".html"));

  let copied = 0;
  for (const src of htmlFiles) {
    const rel = path.relative(DIST_POSTS, src);
    const dest = path.join(ROOT_POSTS, rel);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(src, dest);
    copied += 1;
  }

  console.log(`已发布 Astro 文章页到根目录 posts/: ${copied} 个 HTML 文件`);
}

publishPostsHtml().catch((err) => {
  console.error("发布 Astro 文章页失败:", err);
  process.exit(1);
});
