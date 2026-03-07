import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, "public");
const INDEX_JSON_PATH = path.join(ROOT, "json", "index.json");
const SHICHA_BG_PLACEHOLDER = "__SHICHA_BACKGROUND__";

const COPY_DIRS = [
  "assets",
  "json",
];

const COPY_FILES = [
  ".nojekyll",
  "robots.txt",
  "BingSiteAuth.xml",
  "posts/rss.xml",
];

const COMPAT_IMAGE_ALIASES = [
  { source: path.join("assets", "img", "logo_blue.png"), target: path.join("image", "logo_blue.png") },
  { source: path.join("assets", "img", "touxiang.png"), target: path.join("image", "touxiang.png") },
];

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function rmIfExists(target) {
  if (await exists(target)) {
    await fs.rm(target, { recursive: true, force: true });
  }
}

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

function shouldCopyFile(srcAbs) {
  const rel = srcAbs.slice(ROOT.length + 1).replace(/\\/g, "/");
  const ext = path.extname(rel).toLowerCase();

  // Never copy runtime/build artifacts html from source tree.
  if (ext === ".html") return false;

  // Skip Python/cache tooling files.
  if (ext === ".py" || ext === ".pyc") return false;

  // Keep only markdown files that are fetched by frontend runtime.
  if (ext === ".md") {
    const allowedMarkdown = new Set([
      "assets/pages/blog/dt/dt.md",
      "assets/pages/blog/log/log.md",
    ]);
    return allowedMarkdown.has(rel);
  }

  return true;
}

async function copyTree(srcRel, dstRel) {
  const srcRoot = path.join(ROOT, srcRel);
  if (!(await exists(srcRoot))) return;

  const files = await walk(srcRoot);
  for (const file of files) {
    if (!shouldCopyFile(file)) continue;
    const rel = path.relative(srcRoot, file);
    const dest = path.join(ROOT, dstRel, rel);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(file, dest);
  }
}

async function main() {
  await fs.mkdir(PUBLIC_DIR, { recursive: true });

  for (const dir of COPY_DIRS) {
    await rmIfExists(path.join(PUBLIC_DIR, dir));
  }

  for (const file of COPY_FILES) {
    await rmIfExists(path.join(PUBLIC_DIR, file));
  }
  await rmIfExists(path.join(PUBLIC_DIR, "image"));

  for (const dir of COPY_DIRS) {
    await copyTree(dir, path.join("public", dir));
  }

  for (const file of COPY_FILES) {
    const src = path.join(ROOT, file);
    if (!(await exists(src))) continue;
    const dest = path.join(PUBLIC_DIR, file);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(src, dest);
  }

  for (const alias of COMPAT_IMAGE_ALIASES) {
    const src = path.join(ROOT, alias.source);
    if (!(await exists(src))) continue;
    const dest = path.join(PUBLIC_DIR, alias.target);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(src, dest);
  }

  // Inject parallax background at build-time to avoid runtime JSON fetch.
  if (await exists(INDEX_JSON_PATH)) {
    const indexRaw = await fs.readFile(INDEX_JSON_PATH, "utf-8");
    const indexConfig = JSON.parse(indexRaw);
    const bgPath = typeof indexConfig?.Background === "string" && indexConfig.Background.trim()
      ? indexConfig.Background.trim()
      : "/assets/img/bg.png";

    const shichaTargets = [
      path.join(PUBLIC_DIR, "assets", "js", "shicha.js"),
      path.join(PUBLIC_DIR, "assets", "css", "shicha.css"),
    ];

    for (const target of shichaTargets) {
      if (!(await exists(target))) continue;
      const original = await fs.readFile(target, "utf-8");
      if (!original.includes(SHICHA_BG_PLACEHOLDER)) continue;
      const injected = original.split(SHICHA_BG_PLACEHOLDER).join(bgPath);
      await fs.writeFile(target, injected, "utf-8");
    }
  }

  console.log("sync-public done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
