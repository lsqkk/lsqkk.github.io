import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const TOPS = ["a", "games", "tool"];
const ASSET_EXT = new Set([".js", ".css", ".json"]);

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

function toPosix(p) {
  return p.replace(/\\/g, "/");
}

function ensurePosixJoin(...parts) {
  return toPosix(path.posix.normalize(parts.join("/").replace(/\\/g, "/")));
}

async function copyProjectAssets() {
  for (const top of TOPS) {
    const srcRoot = path.join(ROOT, top);
    const files = await walk(srcRoot);
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (!ASSET_EXT.has(ext)) continue;
      const rel = toPosix(path.relative(ROOT, file));
      const dest = path.join(ROOT, "assets", "pages", rel);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.copyFile(file, dest);
    }
  }
}

function getAstroWebDir(absPath) {
  const rel = toPosix(path.relative(path.join(ROOT, "src", "pages"), absPath));
  if (rel.endsWith("/index/index.astro")) {
    return rel.slice(0, -"/index/index.astro".length);
  }
  if (rel.endsWith("/index.astro")) {
    return rel.slice(0, -"/index.astro".length);
  }
  if (rel === "index.astro") return "";
  const route = rel.slice(0, -".astro".length);
  return route.includes("/") ? route.slice(0, route.lastIndexOf("/")) : "";
}

function mapRelativeRef(relRef, webDir) {
  const [rawPath, query = ""] = relRef.split("?");
  const normalized = ensurePosixJoin(webDir || "", rawPath);
  const first = normalized.split("/")[0];
  if (!TOPS.includes(first)) return null;
  return `/assets/pages/${normalized}${query ? `?${query}` : ""}`;
}

function rewriteContent(content, webDir) {
  let out = content;

  // Absolute refs: /a/**.js|css|json -> /assets/pages/a/**
  out = out.replace(
    /(["'(])\/(a|games|tool)\/([^"'()\s]+\.(?:js|css|json)(?:\?[^"'()\s]*)?)(["')])/g,
    (_, p1, top, rest, p4) => `${p1}/assets/pages/${top}/${rest}${p4}`,
  );

  // Relative refs in quoted strings.
  out = out.replace(
    /(["'])(?!https?:\/\/|\/|#)([^"'\r\n]*\.(?:js|css|json)(?:\?[^"'\r\n]*)?)\1/g,
    (m, quote, relRef) => {
      const mapped = mapRelativeRef(relRef, webDir);
      if (!mapped) return m;
      return `${quote}${mapped}${quote}`;
    },
  );

  return out;
}

async function rewriteAstroFiles() {
  const srcRoot = path.join(ROOT, "src");
  const files = (await walk(srcRoot)).filter((f) => f.endsWith(".astro"));
  for (const file of files) {
    const webDir = getAstroWebDir(file);
    const content = await fs.readFile(file, "utf8");
    const next = rewriteContent(content, webDir);
    if (next !== content) {
      await fs.writeFile(file, next, "utf8");
    }
  }
}

async function rewriteJsFiles() {
  const targets = [
    path.join(ROOT, "assets", "js"),
    path.join(ROOT, "assets", "pages"),
  ];

  for (const dir of targets) {
    try {
      await fs.access(dir);
    } catch {
      continue;
    }

    const files = (await walk(dir)).filter((f) => f.endsWith(".js"));
    for (const file of files) {
      let webDir = "";
      const relToAssetsPages = toPosix(path.relative(path.join(ROOT, "assets", "pages"), file));
      if (!relToAssetsPages.startsWith("..")) {
        webDir = relToAssetsPages.includes("/") ? relToAssetsPages.slice(0, relToAssetsPages.lastIndexOf("/")) : "";
      }

      const content = await fs.readFile(file, "utf8");
      const next = rewriteContent(content, webDir);
      if (next !== content) {
        await fs.writeFile(file, next, "utf8");
      }
    }
  }
}

async function main() {
  await copyProjectAssets();
  await rewriteAstroFiles();
  await rewriteJsFiles();
  console.log("migrate-assets-done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});