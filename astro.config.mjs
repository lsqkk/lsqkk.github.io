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

function rehypeFilePreview() {
  return (tree) => {
    let hasFilePreview = false;

    const visit = (node, parent = null, index = -1) => {
      if (!node || typeof node !== "object") return;

      if (node.type === "element" && node.tagName === "filepreview" && parent && index >= 0) {
        hasFilePreview = true;
        const src = toText(node.properties?.src);
        const title = toText(node.properties?.title);
        const rawSize = toText(node.properties?.size);

        if (!src) {
          parent.children[index] = createElement("div", { className: ["post-file-preview-error"] }, [
            createTextNode("文件预览：缺少 src 属性"),
          ]);
          return;
        }

        // ── Derive file type from src extension ──
        const ext = src.split(".").pop().toLowerCase();
        const fileType = ext || "file";
        const typeUpper = fileType.toUpperCase();

        // ── Display name ──
        const fileName = src.split("/").pop();
        const displayName = title || fileName;

        // ── URL-encode for non-ASCII characters ──
        const encodedSrc = src
          .split("/")
          .map((part) => {
            try {
              return encodeURIComponent(decodeURIComponent(part));
            } catch {
              return encodeURIComponent(part);
            }
          })
          .join("/");

        // ── Build viewer content ──
        const isPdf = fileType === "pdf";
        let viewerChildren;
        if (isPdf) {
          viewerChildren = [
            createElement("iframe", {
              className: ["post-file-preview-frame"],
              "data-src": encodedSrc + "#view=FitH",
              loading: "lazy",
              title: displayName,
              referrerpolicy: "no-referrer",
            }),
          ];
        } else {
          viewerChildren = [
            createElement("div", { className: ["post-file-preview-placeholder"] }, [
              createTextNode(`此 ${typeUpper} 文件暂不支持在线预览，请下载后查看。`),
            ]),
          ];
        }

        const viewer = createElement("div", { className: ["post-file-preview-viewer"] }, viewerChildren);
        const body = createElement("div", { className: ["post-file-preview-body"], "data-fp-body": "" }, [
          viewer,
        ]);

        // ── Header ──
        const iconText = createElement("span", { className: ["post-file-preview-icon-text"] }, [createTextNode(typeUpper)]);
        const icon = createElement("div", { className: ["post-file-preview-icon"] }, [iconText]);

        const nameEl = createElement("span", { className: ["post-file-preview-name"] }, [createTextNode(displayName)]);
        const metaParts = [`${typeUpper} 文档`];
        if (rawSize) metaParts.push(`· ${rawSize}`);
        const metaEl = createElement("span", { className: ["post-file-preview-meta"] }, [
          createTextNode(metaParts.join(" ")),
        ]);
        const info = createElement("div", { className: ["post-file-preview-info"] }, [nameEl, metaEl]);

        // ── Actions ──
        const toggleLabel = createElement("span", { className: ["post-file-preview-toggle-label"] }, [
          createTextNode("展开预览"),
        ]);
        const toggleArrow = createElement("span", { className: ["post-file-preview-toggle-arrow"] }, [
          createTextNode("▶"),
        ]);
        const toggleEl = createElement("span", { className: ["post-file-preview-toggle"] }, [toggleLabel, toggleArrow]);

        const downloadLink = createElement("a", {
          className: ["post-file-preview-download"],
          href: encodedSrc,
          download: "",
          "aria-label": "下载文件",
        }, [createTextNode("下载")]);

        const actions = createElement("div", { className: ["post-file-preview-actions"] }, [toggleEl, downloadLink]);
        const header = createElement(
          "div",
          {
            className: ["post-file-preview-header"],
            "data-fp-toggle": "",
            role: "button",
            tabindex: "0",
            "aria-expanded": "false",
          },
          [icon, info, actions],
        );

        // ── Root ──
        parent.children[index] = createElement(
          "div",
          { className: ["post-file-preview"], "data-fp-root": "" },
          [header, body],
        );
        return;
      }

      if (Array.isArray(node.children)) {
        node.children.forEach((child, childIndex) => visit(child, node, childIndex));
      }
    };

    visit(tree);

    // ── Inject the shared toggle script once per post ──
    if (hasFilePreview) {
      const scriptCode =
        '!function(){var d=document;function t(e){var h=e.type==="click"?e.target.closest("[data-fp-toggle]"):e.target.closest("[data-fp-toggle]");if(!h)return;if(e.type==="keydown"&&e.key!=="Enter"&&e.key!==" ")return;if(e.type==="keydown")e.preventDefault();if(e.target.closest(".post-file-preview-download"))return;var r=h.closest("[data-fp-root]");if(!r)return;var b=r.querySelector("[data-fp-body]");var x=r.classList.toggle("is-expanded");h.setAttribute("aria-expanded",x);if(x){var f=b.querySelector("iframe[data-src]");if(f){f.src=f.dataset.src;f.removeAttribute("data-src")}}requestAnimationFrame(function(){b.style.maxHeight=x?b.scrollHeight+"px":"0px"})}d.addEventListener("click",t);d.addEventListener("keydown",t)}();';
      tree.children.push({
        type: "element",
        tagName: "script",
        properties: { "data-fp-init": "" },
        children: [{ type: "text", value: scriptCode }],
      });
    }
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
  site: "https://lsqkk.github.io", // canonical URL (also in src/config/site.js)
  integrations: [sitemap(), apiBaseInjector()],
  markdown: {
    remarkRehype: {
      allowDangerousHtml: true,
    },
    rehypePlugins: [rehypeRaw, rehypePostCard, rehypeFilePreview],
  },
  build: {
    format: "file",
    assets: "assets",
  },
  vite: {
    build: {
      cssMinify: "lightningcss",
      minify: "esbuild",
    },
    resolve: {
      alias: {
        "@siteConfig": path.resolve("src/config/site.js"),
      },
    },
  },
});
