// @ts-check
/**
 * 「谍报风云」词库加载与抽词。
 *
 * 词库是 `words.json`（按分类分组的静态数据），运行时按需 fetch 一次并缓存，
 * 这样 57KB 的词表不会进入页面首屏关键路径。
 * 数据文件可通过 `npm run check:words` 校验，追加词条只需编辑 JSON。
 */

import { WORDS_PER_TEAM, randomInt } from "./game-core.js";

/** @typedef {{ word: string, en: string, cat: string }} WordEntry */
/** @typedef {{ slug: string, label: string, words: WordEntry[] }} WordCategory */

/** 与当前模块同目录的 words.json，路径跟随站点实际部署位置 */
const WORDS_URL = new URL("./words.json", import.meta.url).href;

/** @type {WordEntry[]} */
let flatWords = [];
/** @type {WordCategory[]} */
let categories = [];
/** @type {Promise<WordEntry[]> | null} */
let loading = null;

/**
 * 词库是否已就绪。
 * @returns {boolean}
 */
export function isWordPoolReady() {
  return flatWords.length > 0;
}

/**
 * 加载词库（幂等，重复调用共用同一个请求）。
 * @returns {Promise<WordEntry[]>}
 */
export function loadWords() {
  if (flatWords.length > 0) return Promise.resolve(flatWords);
  if (loading) return loading;

  loading = fetch(WORDS_URL, { cache: "force-cache" })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`词库加载失败：HTTP ${response.status}`);
      }
      return response.json();
    })
    .then((payload) => {
      const list = normalizePayload(payload);
      if (list.length === 0) throw new Error("词库为空");
      flatWords = list;
      return flatWords;
    })
    .catch((error) => {
      loading = null; // 允许重试
      throw error;
    });

  return loading;
}

/**
 * 把 words.json 的结构展平，并为每个词补上分类标签。
 * @param {any} payload
 * @returns {WordEntry[]}
 */
function normalizePayload(payload) {
  const rawCategories = Array.isArray(payload?.categories) ? payload.categories : [];
  /** @type {WordCategory[]} */
  const parsed = [];
  /** @type {WordEntry[]} */
  const flat = [];
  const seen = new Set();

  for (const rawCategory of rawCategories) {
    const label = String(rawCategory?.label ?? "").trim();
    const slug = String(rawCategory?.slug ?? "").trim();
    const rawWords = Array.isArray(rawCategory?.words) ? rawCategory.words : [];
    /** @type {WordEntry[]} */
    const words = [];
    for (const rawWord of rawWords) {
      const word = String(rawWord?.word ?? "").trim();
      if (!word || seen.has(word)) continue;
      seen.add(word);
      const entry = { word, en: String(rawWord?.en ?? "").trim(), cat: label };
      words.push(entry);
      flat.push(entry);
    }
    if (words.length > 0) parsed.push({ slug, label, words });
  }

  categories = parsed;
  return flat;
}

/**
 * 已加载的词表（未加载时为空数组）。
 * @returns {WordEntry[]}
 */
export function getWords() {
  return flatWords;
}

/**
 * 分类列表（未加载时为空数组）。
 * @returns {WordCategory[]}
 */
export function getCategories() {
  return categories;
}

/**
 * 随机抽取不重复的词。
 * @param {number} count
 * @param {Iterable<string>} [excludeWords] 需要避开的词
 * @returns {string[]}
 */
export function pickWords(count, excludeWords) {
  if (flatWords.length === 0) return [];
  const used = new Set(excludeWords ?? []);
  /** @type {string[]} */
  const picked = [];
  let guard = 0;
  const guardLimit = Math.max(flatWords.length * 20, 200);
  while (picked.length < count && guard < guardLimit) {
    guard += 1;
    const candidate = flatWords[randomInt(flatWords.length)];
    if (!candidate || used.has(candidate.word)) continue;
    used.add(candidate.word);
    picked.push(candidate.word);
  }
  return picked;
}

/**
 * 为两队一次性发牌，保证 8 个词互不相同。
 * @returns {{ A: string[], B: string[] }}
 */
export function dealWords() {
  const all = pickWords(WORDS_PER_TEAM * 2);
  return {
    A: all.slice(0, WORDS_PER_TEAM),
    B: all.slice(WORDS_PER_TEAM, WORDS_PER_TEAM * 2),
  };
}

/**
 * 为单支队伍抽 4 个新词（重新随机用），避开指定词。
 * @param {Iterable<string>} excludeWords
 * @returns {string[]}
 */
export function rerollWords(excludeWords) {
  return pickWords(WORDS_PER_TEAM, excludeWords);
}
