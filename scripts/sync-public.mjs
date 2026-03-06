import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, "public");

const COPY_DIRS = [
  "assets",
  "json",
];

const COPY_FILES = [
  ".nojekyll",
  "robots.txt",
  "BingSiteAuth.xml",
  "sitemap.xml",
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

  // Keep markdown content under blog used by frontend logic.
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

  console.log("sync-public done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
