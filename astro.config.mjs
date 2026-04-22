import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import rehypeRaw from "rehype-raw";

const API_BASE_PLACEHOLDER = "__API_BASE__";
const ROOT = process.cwd();
const API_JSON_CANDIDATES = [
  path.join(ROOT, "src", "config", "json", "api.json"),
  path.join(ROOT, "json", "api.json"),
];

function toText(value) {
  if (value == null) return "";
  if (Array.isArray(value)) return value.join(" ").trim();
  return String(value).trim();
}

function createTextNode(value) {
  return { type: "text", value };
}

function createElement(tagName, properties = {}, children = []) {
  return { type: "element", tagName, properties, children };
}

function rehypePostCard() {
  const visit = (node, parent = null, index = -1) => {
    if (!node || typeof node !== "object") return;

    if (node.type === "element" && node.properties) {
      const id = toText(node.properties.id);
      if (id === "card" && parent && index >= 0) {
        const title = toText(node.properties.title) || "未命名卡片";
        const intro = toText(node.properties.intro || node.properties.summary);
        const tag = toText(node.properties.tag);
        const description = toText(node.properties.description);
        const href = toText(node.properties.href || node.properties.link);
        const image = toText(node.properties.image || node.properties.img || node.properties.src);
        const metaChildren = [];

        if (tag) {
          metaChildren.push(
            createElement("span", { className: ["post-inline-card-chip", "is-tag"] }, [createTextNode(tag)]),
          );
        }
        if (description) {
          metaChildren.push(
            createElement(
              "span",
              { className: ["post-inline-card-chip", "is-description"] },
              [createTextNode(description)],
            ),
          );
        }

        const bodyChildren = [];
        if (metaChildren.length > 0) {
          bodyChildren.push(createElement("div", { className: ["post-inline-card-meta"] }, metaChildren));
        }
        bodyChildren.push(
          createElement("h3", { className: ["post-inline-card-title"] }, [createTextNode(title)]),
        );
        if (intro) {
          bodyChildren.push(
            createElement("p", { className: ["post-inline-card-intro"] }, [createTextNode(intro)]),
          );
        }

        const cardChildren = [];
        if (image) {
          cardChildren.push(
            createElement("div", { className: ["post-inline-card-media"] }, [
              createElement("img", {
                className: ["post-inline-card-image"],
                src: image,
                alt: title,
                loading: "lazy",
                decoding: "async",
                referrerpolicy: "no-referrer",
              }),
            ]),
          );
        }
        cardChildren.push(createElement("div", { className: ["post-inline-card-body"] }, bodyChildren));

        const tagName = href ? "a" : "div";
        const properties = {
          className: ["post-inline-card", href ? "is-link" : "is-static"],
        };
        if (href) properties.href = href;

        parent.children[index] = createElement(tagName, properties, cardChildren);
        return;
      }
    }

    if (Array.isArray(node.children)) {
      node.children.forEach((child, childIndex) => visit(child, node, childIndex));
    }
  };

  return (tree) => {
    visit(tree);
  };
}

function apiBaseInjector() {
  return {
    name: "api-base-injector",
    hooks: {
      "astro:build:done": async ({ dir }) => {
        let apiBase = "https://api.130923.xyz";
        try {
          let raw = "";
          let loadedPath = "";

          for (const candidate of API_JSON_CANDIDATES) {
            try {
              raw = await fs.readFile(candidate, "utf-8");
              loadedPath = candidate;
              break;
            } catch {
              // Try the next candidate path.
            }
          }

          if (!raw) {
            throw new Error(`api.json not found in: ${API_JSON_CANDIDATES.join(", ")}`);
          }

          const config = JSON.parse(raw);
          if (typeof config?.apiBase === "string" && config.apiBase.trim()) {
            apiBase = config.apiBase.trim();
          }
          if (loadedPath) {
            console.log(`[api-base-injector] Loaded api base from ${path.relative(ROOT, loadedPath)}`);
          }
        } catch (err) {
          console.warn("[api-base-injector] Failed to read api.json, using default.", err);
        }

        if (!apiBase || !apiBase.includes("http")) return;

        const distRoot = fileURLToPath(dir);
        const textExts = new Set([".js", ".css", ".html", ".json", ".xml", ".svg"]);

        const walk = async (dirPath) => {
          const entries = await fs.readdir(dirPath, { withFileTypes: true });
          for (const entry of entries) {
            const full = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
              await walk(full);
              continue;
            }
            const ext = path.extname(entry.name).toLowerCase();
            if (!textExts.has(ext)) continue;
            const content = await fs.readFile(full, "utf-8");
            if (!content.includes(API_BASE_PLACEHOLDER)) continue;
            const injected = content.split(API_BASE_PLACEHOLDER).join(apiBase);
            await fs.writeFile(full, injected, "utf-8");
          }
        };

        await walk(distRoot);

        // Build site pages index from sitemap + html titles.
        try {
          const distJsonDir = path.join(distRoot, "json");
          await fs.mkdir(distJsonDir, { recursive: true });

          const readIfExists = async (target) => {
            try {
              return await fs.readFile(target, "utf-8");
            } catch {
              return "";
            }
          };

          const extractLocs = (xml) => {
            if (!xml) return [];
            const locs = [];
            const re = /<loc>([^<]+)<\/loc>/g;
            let match;
            while ((match = re.exec(xml))) {
              locs.push(match[1].trim());
            }
            return locs;
          };

          const normalizePath = (url) => {
            try {
              const parsed = new URL(url, "https://lsqkk.github.io");
              return parsed.pathname.replace(/^\//, "").replace(/\/$/, "");
            } catch {
              return String(url || "").replace(/^\//, "").replace(/\/$/, "");
            }
          };

          const normalizeInternalPath = (link, prefix = "") => {
            if (!link) return "";
            const raw = String(link).trim();
            if (!raw) return "";
            if (raw.startsWith("http://") || raw.startsWith("https://")) return "";
            if (raw.startsWith("/")) return normalizePath(raw);
            if (prefix) return normalizePath(`/${prefix}/${raw}`);
            return normalizePath(`/${raw}`);
          };

          const sitemapCandidates = [
            path.join(distRoot, "sitemap-index.xml"),
            path.join(distRoot, "sitemap.xml"),
            path.join(distRoot, "sitemap-0.xml"),
          ];

          let sitemapXml = "";
          for (const candidate of sitemapCandidates) {
            sitemapXml = await readIfExists(candidate);
            if (sitemapXml) break;
          }

          const urlSet = new Set();
          if (sitemapXml.includes("<sitemapindex")) {
            const childLocs = extractLocs(sitemapXml);
            for (const child of childLocs) {
              const childPath = normalizePath(child);
              const childXml = await readIfExists(path.join(distRoot, childPath));
              extractLocs(childXml).forEach((loc) => {
                const pathValue = normalizePath(loc);
                if (pathValue) urlSet.add(pathValue);
              });
            }
          } else {
            extractLocs(sitemapXml).forEach((loc) => {
              const pathValue = normalizePath(loc);
              if (pathValue) urlSet.add(pathValue);
            });
          }

          const readTitle = async (pathValue) => {
            const candidates = [];
            if (!pathValue || pathValue === "") {
              candidates.push(path.join(distRoot, "index.html"));
            } else if (pathValue.endsWith(".html")) {
              candidates.push(path.join(distRoot, pathValue));
            } else {
              candidates.push(path.join(distRoot, pathValue, "index.html"));
              candidates.push(path.join(distRoot, `${pathValue}.html`));
            }

            for (const filePath of candidates) {
              const html = await readIfExists(filePath);
              if (!html) continue;
              const match = html.match(/<title>([^<]+)<\/title>/i);
              if (match && match[1]) {
                return match[1].trim();
              }
            }
            return "";
          };

          const entries = [];
          for (const pathValue of urlSet) {
            const title = await readTitle(pathValue);
            entries.push({
              path: pathValue,
              title: title || (pathValue ? `/${pathValue}` : "首页"),
            });
          }

          const extraEntries = [];
          const loadJson = async (relPath) => {
            try {
              const raw = await fs.readFile(path.join(ROOT, relPath), "utf-8");
              return JSON.parse(raw);
            } catch {
              return null;
            }
          };

          const toolData = await loadJson(path.join("assets", "pages", "tool", "tool.json"));
          if (toolData?.categories) {
            toolData.categories.forEach((cat) => {
              (cat.tools || []).forEach((tool) => {
                const pathValue = normalizeInternalPath(tool.url || tool.link || "");
                if (!pathValue) return;
                extraEntries.push({ path: pathValue, title: tool.name || pathValue });
              });
            });
          }

          const gamesData = await loadJson(path.join("assets", "pages", "games", "game.json"));
          if (gamesData) {
            ["multiplayer", "singlePlayer", "classic"].forEach((key) => {
              (gamesData[key] || []).forEach((game) => {
                const pathValue = normalizeInternalPath(game.link || "", "games");
                if (!pathValue) return;
                extraEntries.push({ path: pathValue, title: game.name || pathValue });
              });
            });
          }

          const labData = await loadJson(path.join("assets", "pages", "a", "projects.json"));
          if (labData?.categories) {
            labData.categories.forEach((cat) => {
              (cat.projects || []).forEach((proj) => {
                const pathValue = normalizeInternalPath(proj.link || "", "a");
                if (!pathValue) return;
                extraEntries.push({ path: pathValue, title: proj.name || pathValue });
              });
            });
          }

          const blogData = await loadJson(path.join("assets", "pages", "blog", "functions.json"));
          if (blogData?.categories) {
            blogData.categories.forEach((cat) => {
              (cat.functions || []).forEach((fn) => {
                const pathValue = normalizeInternalPath(fn.link || "");
                if (!pathValue) return;
                extraEntries.push({ path: pathValue, title: fn.name || pathValue });
              });
            });
          }

          const mergedMap = new Map();
          entries.forEach((item) => mergedMap.set(item.path, item));
          extraEntries.forEach((item) => {
            if (!item.path) return;
            if (!mergedMap.has(item.path)) mergedMap.set(item.path, item);
          });

          const outPath = path.join(distJsonDir, "site-pages.json");
          await fs.writeFile(outPath, JSON.stringify(Array.from(mergedMap.values()), null, 2), "utf-8");
        } catch (err) {
          console.warn("[api-base-injector] Failed to build site-pages.json", err);
        }
      },
    },
  };
}

export default defineConfig({
  site: "https://lsqkk.github.io",
  integrations: [sitemap(), apiBaseInjector()],
  markdown: {
    remarkRehype: {
      allowDangerousHtml: true,
    },
    rehypePlugins: [rehypeRaw, rehypePostCard],
  },
  build: {
    format: "file",
  },
  vite: {
    resolve: {
      alias: {
        "@siteConfig": path.resolve("src/config/site.js"),
      },
    },
  },
});
