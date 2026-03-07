import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const POSTS_JSON = path.join(ROOT, "posts", "posts.json");
const POSTS_DIR = path.join(ROOT, "posts");
const OUTPUT = path.join(POSTS_DIR, "rss.xml");
const SITE_URL = "https://lsqkk.github.io";
const MAX_ITEMS = 50;

function escapeXml(input) {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toRfc822(dateLike) {
  const d = new Date(`${dateLike}T00:00:00+08:00`);
  if (Number.isNaN(d.getTime())) return new Date().toUTCString();
  return d.toUTCString();
}

function stripFrontmatter(raw) {
  const match = raw.match(/^---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n?/);
  return match ? raw.slice(match[0].length) : raw;
}

function extractExcerpt(markdown) {
  const clean = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_>~-]/g, " ")
    .replace(/\r?\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return clean.slice(0, 220);
}

function postUrl(file) {
  const noExt = file.replace(/\.md$/i, "");
  return `${SITE_URL}/posts/${noExt.replace(/\\/g, "/")}`;
}

async function buildRss() {
  const posts = JSON.parse(await fs.readFile(POSTS_JSON, "utf8"));
  const items = [];

  for (const post of posts.slice(0, MAX_ITEMS)) {
    const sourcePath = path.join(POSTS_DIR, post.file);
    let excerpt = "";
    try {
      const raw = await fs.readFile(sourcePath, "utf8");
      excerpt = extractExcerpt(stripFrontmatter(raw));
    } catch {
      excerpt = "";
    }

    const link = postUrl(post.file);
    const tags = Array.isArray(post.tags) ? post.tags.filter(Boolean).join(", ") : "";

    items.push(`
    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      <pubDate>${escapeXml(toRfc822(post.date))}</pubDate>
      <description>${escapeXml(tags || excerpt)}</description>
      <content:encoded><![CDATA[${escapeXml(excerpt)}]]></content:encoded>
    </item>`);
  }

  const latestDate = posts[0]?.date ? toRfc822(posts[0].date) : new Date().toUTCString();
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<rss xmlns:content="http://purl.org/rss/1.0/modules/content/" version="2.0">
  <channel>
    <title>Quark Blog</title>
    <description>夸克博客</description>
    <link>${SITE_URL}/</link>
    <language>zh-cn</language>
    <lastBuildDate>${latestDate}</lastBuildDate>${items.join("")}
  </channel>
</rss>
`;

  await fs.writeFile(OUTPUT, xml, "utf8");
  console.log(`已生成 RSS: posts/rss.xml（${items.length} 项）`);
}

buildRss().catch((err) => {
  console.error("生成 RSS 失败:", err);
  process.exit(1);
});
