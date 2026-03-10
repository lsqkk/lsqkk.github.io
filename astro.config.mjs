import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

const API_BASE_PLACEHOLDER = "__API_BASE__";
const API_JSON_PATH = path.resolve("json", "api.json");

function apiBaseInjector() {
  return {
    name: "api-base-injector",
    hooks: {
      "astro:build:done": async ({ dir }) => {
        let apiBase = "https://api.130923.xyz";
        try {
          const raw = await fs.readFile(API_JSON_PATH, "utf-8");
          const config = JSON.parse(raw);
          if (typeof config?.apiBase === "string" && config.apiBase.trim()) {
            apiBase = config.apiBase.trim();
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
      },
    },
  };
}

export default defineConfig({
  site: "https://lsqkk.github.io",
  integrations: [sitemap(), apiBaseInjector()],
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
