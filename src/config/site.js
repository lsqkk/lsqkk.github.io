import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const NAV_PATH = path.join(ROOT, "src", "config", "json", "nav.json");
const INDEX_PATH = path.join(ROOT, "src", "config", "json", "index.json");

function readJson(filePath, fallback = {}) {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

const navConfig = readJson(NAV_PATH, {});
const indexConfig = readJson(INDEX_PATH, {});

export const SITE_TITLE = typeof navConfig?.title?.text === "string" && navConfig.title.text.trim()
  ? navConfig.title.text.trim()
  : "夸克博客";

export const SITE_LOGO_URL = typeof navConfig?.logo?.url === "string" && navConfig.logo.url.trim()
  ? navConfig.logo.url.trim()
  : "/assets/img/logo_blue.png";

export const SITE_BACKGROUND = typeof indexConfig?.Background === "string" && indexConfig.Background.trim()
  ? indexConfig.Background.trim()
  : "/assets/img/bg.png";
