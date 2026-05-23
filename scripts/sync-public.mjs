import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, "public");
const INDEX_JSON_PATH = path.join(ROOT, "src", "config", "json", "index.json");
const API_JSON_PATH = path.join(ROOT, "src", "config", "json", "api.json");
const FONT_JSON_PATH = path.join(ROOT, "src", "config", "json", "font.json");
const POSTS_JSON_PATH = path.join(ROOT, "posts", "posts.json");
const SHICHA_BG_PLACEHOLDER = "__SHICHA_BACKGROUND__";
const API_BASE_PLACEHOLDER = "__API_BASE__";

const COPY_DIRS = [
  "assets",
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

  // Never copy markdown files (data is now stored in JSON under assets/data/).
  if (ext === ".md") return false;

  return true;
}

function cssString(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function cssFamily(value) {
  const family = String(value ?? "").trim();
  if (!family) return "";
  if (/^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-serif|ui-sans-serif|ui-monospace|emoji|math|fangsong|BlinkMacSystemFont)$/i.test(family) ||
    family.startsWith("-")) {
    return family;
  }
  return `'${cssString(family)}'`;
}

function normalizePublicUrl(source) {
  const value = String(source ?? "").trim();
  if (!value) return "";
  if (/^(https?:)?\/\//i.test(value) || value.startsWith("/") || value.startsWith("data:")) return value;
  return `/${value.replace(/^\.?\//, "")}`;
}

function inferFontFormat(source) {
  const pathname = source.split("?")[0].split("#")[0].toLowerCase();
  if (pathname.endsWith(".woff2")) return "woff2";
  if (pathname.endsWith(".woff")) return "woff";
  return "";
}

function isCssSource(source) {
  return source.split("?")[0].split("#")[0].toLowerCase().endsWith(".css");
}

function isFontSource(source) {
  const pathname = source.split("?")[0].split("#")[0].toLowerCase();
  return pathname.endsWith(".woff2") || pathname.endsWith(".woff");
}

function sourceToLocalAssetsPath(source) {
  const value = String(source ?? "").trim().replace(/\\/g, "/");
  if (!value || /^(https?:)?\/\//i.test(value) || value.startsWith("data:")) return "";
  const normalized = value.startsWith("/") ? value.slice(1) : value.replace(/^\.?\//, "");
  return path.join(ROOT, normalized);
}

async function isUsableConfiguredSource(source) {
  const localPath = sourceToLocalAssetsPath(source);
  if (!localPath) return true;
  return exists(localPath);
}

async function generateFontConfigCss() {
  /** @type {{ preferred?: Array<Record<string, unknown>>, includeAssetsFonts?: boolean, systemFallbacks?: string[] }} */
  let fontConfig = {};
  if (await exists(FONT_JSON_PATH)) {
    try {
      fontConfig = JSON.parse(await fs.readFile(FONT_JSON_PATH, "utf-8"));
    } catch (err) {
      console.warn("Failed to load font.json, using default font fallbacks.", err);
    }
  }

  const imports = [];
  const fontFaces = [];
  const familyStack = [];
  const configuredFonts = Array.isArray(fontConfig.preferred) ? fontConfig.preferred : [];

  for (const item of configuredFonts) {
    const family = typeof item?.family === "string" ? item.family.trim() : "";
    const source = normalizePublicUrl(item?.source);
    if (!family || !source || !(await isUsableConfiguredSource(source))) continue;

    if (isCssSource(source)) {
      imports.push(`@import url('${cssString(source)}');`);
      familyStack.push(family);
      continue;
    }

    if (isFontSource(source)) {
      const format = inferFontFormat(source);
      fontFaces.push([
        "@font-face {",
        `    font-family: ${cssFamily(family)};`,
        `    src: url('${cssString(source)}')${format ? ` format('${format}')` : ""};`,
        `    font-weight: ${item.weight || "normal"};`,
        `    font-style: ${item.style || "normal"};`,
        "    font-display: swap;",
        "}",
      ].join("\n"));
      familyStack.push(family);
    }
  }

  if (fontConfig.includeAssetsFonts !== false) {
    const fontDir = path.join(ROOT, "assets", "fonts");
    if (await exists(fontDir)) {
      const entries = await fs.readdir(fontDir, { withFileTypes: true });
      const fontFiles = entries
        .filter((entry) => entry.isFile() && isFontSource(entry.name))
        .map((entry) => entry.name)
        .sort((a, b) => a.localeCompare(b, "zh-CN"));

      fontFiles.forEach((fileName, index) => {
        const ext = path.extname(fileName);
        const baseName = path.basename(fileName, ext);
        const family = `QuarkLocalFont${index + 1}`;
        const source = `/assets/fonts/${fileName}`;
        const format = inferFontFormat(source);
        fontFaces.push([
          "@font-face {",
          `    font-family: '${family}';`,
          `    src: url('${cssString(source)}')${format ? ` format('${format}')` : ""};`,
          "    font-weight: normal;",
          "    font-style: normal;",
          "    font-display: swap;",
          "}",
        ].join("\n"));
        familyStack.push(family);

        if (baseName === "霞鹜文楷") {
          fontFaces.push([
            "@font-face {",
            "    font-family: 'XWWK';",
            `    src: url('${cssString(source)}')${format ? ` format('${format}')` : ""};`,
            "    font-weight: normal;",
            "    font-style: normal;",
            "    font-display: swap;",
            "}",
          ].join("\n"));
          familyStack.push("XWWK");
        }
      });
    }
  }

  const systemFallbacks = Array.isArray(fontConfig.systemFallbacks) && fontConfig.systemFallbacks.length
    ? fontConfig.systemFallbacks
    : ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "Microsoft YaHei", "sans-serif"];
  const stack = [...familyStack, ...systemFallbacks]
    .map(cssFamily)
    .filter(Boolean)
    .filter((family, index, array) => array.indexOf(family) === index);

  const css = [
    "/* This file is generated by scripts/sync-public.mjs from src/config/json/font.json and assets/fonts/. */",
    ...imports,
    ...fontFaces,
    ":root {",
    `    --site-font-family: ${stack.join(", ")};`,
    "}",
    "",
  ].filter(Boolean).join("\n\n");

  const target = path.join(PUBLIC_DIR, "assets", "css", "font-config.css");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, css, "utf-8");
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
  await rmIfExists(path.join(PUBLIC_DIR, "json"));

  for (const file of COPY_FILES) {
    await rmIfExists(path.join(PUBLIC_DIR, file));
  }
  await rmIfExists(path.join(PUBLIC_DIR, "image"));

  for (const dir of COPY_DIRS) {
    await copyTree(dir, path.join("public", dir));
  }
  await copyTree(path.join("src", "config", "json"), path.join("public", "json"));
  await generateFontConfigCss();

  for (const file of COPY_FILES) {
    const src = path.join(ROOT, file);
    if (!(await exists(src))) continue;
    const dest = path.join(PUBLIC_DIR, file);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(src, dest);
  }

  // Expose posts metadata for frontend hover menus (文章 -> 专栏列表).
  if (await exists(POSTS_JSON_PATH)) {
    const postsJsonTarget = path.join(PUBLIC_DIR, "json", "posts.json");
    await fs.mkdir(path.dirname(postsJsonTarget), { recursive: true });
    await fs.copyFile(POSTS_JSON_PATH, postsJsonTarget);
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

  // Inject API base at build-time to avoid hardcoded hostnames in source.
  let apiBase = "https://api.130923.xyz";
  if (await exists(API_JSON_PATH)) {
    try {
      const apiRaw = await fs.readFile(API_JSON_PATH, "utf-8");
      const apiConfig = JSON.parse(apiRaw);
      if (typeof apiConfig?.apiBase === "string" && apiConfig.apiBase.trim()) {
        apiBase = apiConfig.apiBase.trim();
      }
    } catch (err) {
      console.warn("Failed to load api.json, using default api base.", err);
    }
  }

  if (apiBase && apiBase.includes("http")) {
    const files = await walk(PUBLIC_DIR);
    const textExts = new Set([".js", ".css", ".html", ".json", ".xml", ".svg"]);
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (!textExts.has(ext)) continue;
      const content = await fs.readFile(file, "utf-8");
      if (!content.includes(API_BASE_PLACEHOLDER)) continue;
      const injected = content.split(API_BASE_PLACEHOLDER).join(apiBase);
      await fs.writeFile(file, injected, "utf-8");
    }
  }

  console.log("sync-public done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
