import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const NAV_PATH = path.join(ROOT, "src", "config", "json", "nav.json");
const INDEX_PATH = path.join(ROOT, "src", "config", "json", "index.json");
const API_PATH = path.join(ROOT, "src", "config", "json", "api.json");

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
const apiConfig = readJson(API_PATH, {});

export const SITE_TITLE = typeof navConfig?.title?.text === "string" && navConfig.title.text.trim()
  ? navConfig.title.text.trim()
  : "夸克博客";

export const SITE_LOGO_URL = typeof navConfig?.logo?.url === "string" && navConfig.logo.url.trim()
  ? navConfig.logo.url.trim()
  : "/assets/img/logo_blue.png";

export const SITE_BACKGROUND = typeof indexConfig?.Background === "string" && indexConfig.Background.trim()
  ? indexConfig.Background.trim()
  : "/assets/img/bg.png";

// Site identity
export const SITE_URL = "https://lsqkk.github.io";
export const SITE_DOMAIN = "lsqkk.github.io";
export const AUTHOR_NAME = "蓝色奇夸克";
export const AUTHOR_URL = "https://github.com/lsqkk";
export const SITE_DESCRIPTION = "蓝色奇夸克的个人博客，分享技术、生活与思考。";

// API base URL — reads from api.json at build time (also injected via __API_BASE__ placeholder)
export const API_BASE = typeof apiConfig?.apiBase === "string" && apiConfig.apiBase.trim()
  ? apiConfig.apiBase.trim()
  : "https://api.130923.xyz";
