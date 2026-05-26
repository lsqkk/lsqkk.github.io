/**
 * Build-time script: extract only the Font Awesome icons we actually use.
 * Reads SVG files from node_modules/@fortawesome and generates:
 *   1. public/assets/js/fa-icons.js   — client-side window.__FA_ICONS__
 *   2. public/assets/js/fa-icons.json — same data as JSON for Astro build
 *
 * Both are gitignored — never committed to source.
 * To add a new icon, add its name+style to the ICONS list and rebuild.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ---- CONFIG: list every FA icon used across the site ----
const ICONS = [
  // Homepage (index.astro)
  { name: "envelope",            style: "solid" },
  { name: "phone",               style: "solid" },
  { name: "file-lines",          style: "solid" },
  { name: "graduation-cap",      style: "solid" },
  { name: "rss",                 style: "solid" },
  { name: "folder",              style: "solid" },
  { name: "tag",                 style: "solid" },
  { name: "calendar",            style: "regular" },

  // Nav (nav.js)
  { name: "chevron-down",        style: "solid" },
  { name: "magnifying-glass",    style: "solid" },  // "search" icon
  { name: "gear",                style: "solid" },
  { name: "user",                style: "solid" },
  { name: "id-badge",            style: "solid" },
  { name: "right-from-bracket",  style: "solid" },

  // Index / homepage JS (index.js)
  { name: "github",              style: "brands" },
];

const STYLE_DIR = { solid: "solid", regular: "regular", brands: "brands" };

function extractSvg(icon) {
  const dir = STYLE_DIR[icon.style];
  const filePath = resolve(
    ROOT, "node_modules", "@fortawesome", "fontawesome-free", "svgs", dir, `${icon.name}.svg`
  );
  if (!existsSync(filePath)) {
    console.error(`[fa-icons] WARNING: ${icon.name} (${icon.style}) not found at ${filePath}`);
    return null;
  }
  const raw = readFileSync(filePath, "utf8");
  const vbMatch = raw.match(/viewBox="([^"]+)"/);
  const pathMatch = raw.match(/<path\s+d="([^"]+)"/);
  if (!vbMatch || !pathMatch) {
    console.error(`[fa-icons] WARNING: could not parse ${icon.name} (${icon.style})`);
    return null;
  }
  return { viewBox: vbMatch[1], path: pathMatch[1] };
}

function toSvgHtml(data) {
  if (!data) return "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${data.viewBox}" class="svg-inline" fill="currentColor"><path d="${data.path}"/></svg>`;
}

function toSvgHtmlInline(data) {
  if (!data) return "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${data.viewBox}" width="1em" height="1em" fill="currentColor" style="vertical-align:middle;display:inline-block"><path d="${data.path}"/></svg>`;
}

// Build data
const iconData = {};
for (const icon of ICONS) {
  const data = extractSvg(icon);
  iconData[icon.name] = {
    html: toSvgHtml(data),
    inline: toSvgHtmlInline(data),
  };
}

// Convert to the two formats needed
const astroFormat = {};   // uses class="svg-inline"
const clientFormat = {};  // uses inline width/height/style
for (const [name, d] of Object.entries(iconData)) {
  astroFormat[name] = d.html;
  clientFormat[name] = d.inline;
}

// Ensure output directory exists
const OUT = resolve(ROOT, "public", "assets", "js");
mkdirSync(OUT, { recursive: true });

// 1. JSON for Astro build (read via fs.readFileSync in frontmatter)
const jsonPath = resolve(OUT, "fa-icons.json");
writeFileSync(jsonPath, JSON.stringify(astroFormat, null, 2) + "\n");

// 2. JS for client-side (sets window.__FA_ICONS__)
const jsPath = resolve(OUT, "fa-icons.js");
writeFileSync(jsPath, `window.__FA_ICONS__ = ${JSON.stringify(clientFormat)};\n`);

console.log(`[fa-icons] Generated ${Object.keys(iconData).length} icons`);
