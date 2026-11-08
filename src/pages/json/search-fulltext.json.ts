import fs from 'node:fs/promises';
import path from 'node:path';
const PROJECT_ROOT = process.cwd();
const postsIndexPath = path.join(PROJECT_ROOT, "posts", "posts.json");
const dtDataPath = path.join(PROJECT_ROOT, "assets", "data", "dt.json");

function stripMarkdown(text: string): string {
  return String(text || "")
    .replace(/^---[\s\S]*?---\s*/g, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[[^\]]+\]\([^)]+\)/g, (match) => {
      const label = match.replace(/\[|\].*$/g, "");
      return label || " ";
    })
    .replace(/@\{uin:\d+,nick:([^,}]+)(?:,who:\d+)?\}/g, " @$1 ")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/^\s{0,3}[-*+]\s+/gm, "")
    .replace(/^\s{0,3}\d+\.\s+/gm, "")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

let postsFulltext: Array<Record<string, any>> = [];
let dynamicFulltext: Array<Record<string, any>> = [];

try {
  const postsRaw = await fs.readFile(postsIndexPath, "utf8");
  const posts = JSON.parse(postsRaw);
  postsFulltext = await Promise.all(
    (Array.isArray(posts) ? posts : []).map(async (post: any) => {
      const file = post?.file || "";
      const title = post?.title || file;
      const fullPath = file ? path.join(PROJECT_ROOT, "posts", file) : "";
      let content = "";
      try {
        const md = await fs.readFile(fullPath, "utf8");
        content = stripMarkdown(md);
      } catch {
        content = "";
      }
      return {
        type: "post",
        title,
        path: file ? `/posts/${String(file).replace(/\.md$/, "")}` : "",
        tags: Array.isArray(post?.tags) ? post.tags : [],
        columns: Array.isArray(post?.columns) ? post.columns : [],
        date: post?.date || "",
        wordCount: post?.wordCount || 0,
        content
      };
    })
  );
} catch {
  postsFulltext = [];
}

try {
  const dtData = JSON.parse(await fs.readFile(dtDataPath, "utf8"));
  dynamicFulltext = (Array.isArray(dtData) ? dtData : []).map((entry: any) => ({
    type: "dynamic",
    id: entry.id,
    title: entry.title || entry.date,
    date: entry.date,
    path: `/blog/dt/${entry.id}`,
    content: stripMarkdown(entry.content || "")
  }));
} catch {
  dynamicFulltext = [];
}

const fulltextIndex = {
  posts: postsFulltext,
  dynamics: dynamicFulltext
};
export function GET() { return Response.json(fulltextIndex); }
