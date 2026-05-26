/**
 * Build-time script: auto-discover and extract Font Awesome icons used in source.
 *
 * Scans src/ and assets/js/ for FA class patterns, deduplicates,
 * reads the official SVG from node_modules/@fortawesome, and generates:
 *   1. public/assets/js/fa-icons.js   — client-side window.__FA_ICONS__
 *   2. public/assets/js/fa-icons.json — same data as JSON for Astro build
 *
 * Both are gitignored (public/ is in .gitignore).
 * To use a new icon: just write the FA class in any .astro or .js file, rebuild.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const SCAN_DIRS = ["src/pages", "src/layouts", "src/components", "assets/js"];
const SCAN_EXTS = new Set([".astro", ".js", ".mjs"]);

const STYLE_MAP = {
  "fa-solid": "solid",   "fas": "solid",
  "fa-regular": "regular", "far": "regular",
  "fa-brands": "brands",  "fab": "brands",
};
const SUPPORTED = new Set(["solid", "regular", "brands"]);

// FA5→FA6 icon renames (icons that changed names in Font Awesome 6)
const FA5_RENAMES = {
  "calendar-alt": "calendar-days",
  "check-circle": "circle-check",
  "cog": "gear",
  "cogs": "gears",
  "comment-alt": "comment-dots",
  "edit": "pen-to-square",
  "exclamation-circle": "circle-exclamation",
  "exclamation-triangle": "triangle-exclamation",
  "file-alt": "file-lines",
  "file-upload": "file-arrow-up",
  "history": "clock-rotate-left",
  "home": "house",
  "hourglass-half": "hourglass",
  "info-circle": "circle-info",
  "magic": "wand-magic-sparkles",
  "map-marker-alt": "location-dot",
  "mobile-alt": "mobile-screen-button",
  "play-circle": "circle-play",
  "plus-circle": "circle-plus",
  "portrait": "image-portrait",
  "question-circle": "circle-question",
  "redo": "arrow-rotate-right",
  "save": "floppy-disk",
  "search": "magnifying-glass",
  "share-alt": "share-nodes",
  "shield-alt": "shield",
  "sign-out-alt": "right-from-bracket",
  "sliders-h": "sliders",
  "sticky-note": "note-sticky",
  "sync-alt": "arrow-rotate-right",
  "tachometer-alt": "gauge-high",
  "th": "table-cells",
  "th-list": "table-list",
  "times": "xmark",
  "tools": "screwdriver-wrench",
  "trash-alt": "trash-can",
  "undo": "arrow-rotate-left",
  "user-alt": "user",
  "user-circle": "circle-user",
  "user-friends": "user-group",
  "volume-mute": "volume-xmark",
  "volume-up": "volume-high",
  "cloud-upload-alt": "cloud-arrow-up",
  "broadcast-tower": "tower-cell",
  "basketball-ball": "basketball",
  "book-reader": "book-open-reader",
  "sign-in-alt": "right-to-bracket",
  "balance-scale": "scale-balanced",
};

// Match FA class patterns: fa-solid fa-name, fas fa-name, fab fa-name, etc.
const FA_RE = /(?:fa-solid|fas|fa-regular|far|fa-brands|fab)\s+(fa-[a-z][a-z0-9-]*)/gi;
// Match helper calls: icon('name'), faIcon('name'), svgIcon('name'), and ${svgIcon('name')}
const HELP_RE = /(?:icon|faIcon|svgIcon)\s*\(\s*['"]([a-z][a-z0-9-]*)['"]\s*\)/gi;
// Match icon property assignments: icon: "name"
const ICON_PROP_RE = /icon:\s*['"]([a-z][a-z0-9-]*)['"]/gi;

function walk(dir, results) {
  results = results || [];
  let entries;
  try { entries = readdirSync(dir); } catch { return results; }
  for (const name of entries) {
    const full = join(dir, name);
    try {
      const st = statSync(full);
      if (st.isDirectory()) { walk(full, results); }
      else if (st.isFile()) {
        const parts = name.split(".");
        const ext = "." + (parts.length > 1 ? parts.pop() : "");
        if (SCAN_EXTS.has(ext)) results.push(full);
      }
    } catch { /* skip */ }
  }
  return results;
}

function discoverIcons() {
  const found = new Map();
  for (const scanDir of SCAN_DIRS) {
    const dir = resolve(ROOT, scanDir);
    const files = walk(dir);
    for (const file of files) {
      try {
        const content = readFileSync(file, "utf8");
        let m;
        // Discover FA class patterns (fa-solid fa-name, fas fa-name, etc.)
        while ((m = FA_RE.exec(content)) !== null) {
          const prefix = m[0].split(/\s+/)[0].toLowerCase();
          const style = STYLE_MAP[prefix];
          if (!style || !SUPPORTED.has(style)) continue;
          const rawName = m[1].replace(/^fa-/, "");
          if (!found.has(rawName)) found.set(rawName, style);
        }
        // Discover helper function calls: icon('name'), faIcon('name'), svgIcon('name')
        while ((m = HELP_RE.exec(content)) !== null) {
          const rawName = m[1];
          if (!found.has(rawName)) found.set(rawName, "solid");
        }
        // Discover icon property assignments: icon: "name" (e.g. in contactItems)
        while ((m = ICON_PROP_RE.exec(content)) !== null) {
          const rawName = m[1];
          if (!found.has(rawName)) found.set(rawName, "solid");
        }
      } catch { /* skip unreadable */ }
    }
  }
  return Array.from(found.entries()).map(([n, s]) => ({ name: n, style: s }));
}

function parseSvg(filePath) {
  const raw = readFileSync(filePath, "utf8");
  const vb = raw.match(/viewBox="([^"]+)"/);
  const pd = raw.match(/<path\s+d="([^"]+)"/);
  if (!vb || !pd) return null;
  return { viewBox: vb[1], path: pd[1] };
}

function extractSvg(name, style) {
  const candidates = [name, FA5_RENAMES[name]].filter(Boolean);
  const dirs = [...new Set([style === "brands" ? "brands" : style === "regular" ? "regular" : "solid", "solid", "regular", "brands"])];
  for (const c of candidates) {
    for (const d of dirs) {
      const fp = resolve(ROOT, "node_modules", "@fortawesome", "fontawesome-free", "svgs", d, c + ".svg");
      if (existsSync(fp)) return parseSvg(fp);
    }
  }
  return null;
}

function main() {
  const icons = discoverIcons();
  if (icons.length === 0) { console.warn("[fa-icons] No icons found — writing empty file"); }

  const astroFmt = {}, clientFmt = {};
  let ok = 0, skip = 0;
  for (const { name, style } of icons) {
    const data = extractSvg(name, style);
    if (!data) { console.log("  [skip] " + name); skip++; continue; }
    astroFmt[name] = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + data.viewBox + '" class="svg-inline" fill="currentColor"><path d="' + data.path + '"/></svg>';
    clientFmt[name] = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + data.viewBox + '" width="1em" height="1em" fill="currentColor" style="vertical-align:middle;display:inline-block"><path d="' + data.path + '"/></svg>';
    ok++;
  }

  const out = resolve(ROOT, "public", "assets", "js");
  mkdirSync(out, { recursive: true });
  writeFileSync(resolve(out, "fa-icons.json"), JSON.stringify(astroFmt, null, 2) + "\n");
  writeFileSync(resolve(out, "fa-icons.js"), "window.__FA_ICONS__ = " + JSON.stringify(clientFmt) + ";\n");
  console.log("[fa-icons] " + ok + " icons extracted" + (skip ? ", " + skip + " skipped" : ""));
}

main();
