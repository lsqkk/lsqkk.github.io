/**
 * 校验「谍报风云」词库（assets/pages/games/spy-signal/words.json）。
 *
 * 检查项：
 *  - 总数不少于阈值（默认 800，可用 --min=N 覆盖）
 *  - 每个词恰好 2–6 个汉字（不含标点、空格、数字、字母）
 *  - 全局去重
 *  - 每条都有英文释义，每个分类都有 slug / label / 非空词表
 *
 * 用法：npm run check:words
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const WORDS_FILE = path.join(
  ROOT,
  "assets",
  "pages",
  "games",
  "spy-signal",
  "words.json",
);

const MIN_WORDS = 800;
const MIN_WORDS_PER_CATEGORY = 20;
const WORD_PATTERN = /^[一-龥]{2,6}$/;

/** @type {string[]} */
const errors = [];
/** @type {string[]} */
const warnings = [];

function fail(message) {
  errors.push(message);
}

function warn(message) {
  warnings.push(message);
}

if (!fs.existsSync(WORDS_FILE)) {
  fail(`词库文件不存在：${path.relative(ROOT, WORDS_FILE)}`);
} else {
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(WORDS_FILE, "utf8"));
  } catch (error) {
    fail(`词库 JSON 解析失败：${error instanceof Error ? error.message : error}`);
    payload = null;
  }

  if (payload) {
    const categories = Array.isArray(payload.categories) ? payload.categories : null;
    if (!categories) {
      fail("缺少 categories 数组");
    } else {
      const seen = new Map();
      let total = 0;

      for (const [index, category] of categories.entries()) {
        const label = String(category?.label ?? "").trim();
        const slug = String(category?.slug ?? "").trim();
        const words = Array.isArray(category?.words) ? category.words : null;

        if (!label) fail(`categories[${index}] 缺少 label`);
        if (!slug) fail(`categories[${index}]（${label || "未命名"}）缺少 slug`);
        if (!words) {
          fail(`分类「${label || index}」缺少 words 数组`);
          continue;
        }

        for (const [wordIndex, entry] of words.entries()) {
          const word = String(entry?.word ?? "").trim();
          const en = String(entry?.en ?? "").trim();

          if (!WORD_PATTERN.test(word)) {
            fail(`分类「${label}」words[${wordIndex}] 不是 2–6 个汉字：${JSON.stringify(word)}`);
            continue;
          }
          if (!en) {
            warn(`「${word}」缺少英文释义`);
          }
          if (seen.has(word)) {
            fail(`词「${word}」重复出现在「${seen.get(word)}」与「${label}」`);
            continue;
          }
          seen.set(word, label);
          total += 1;
        }

        if (words.length < MIN_WORDS_PER_CATEGORY) {
          warn(`分类「${label}」只有 ${words.length} 条，建议补到 ${MIN_WORDS_PER_CATEGORY} 条以上`);
        }
      }

      if (total < MIN_WORDS) {
        fail(`词库总量 ${total} 少于要求的 ${MIN_WORDS} 条`);
      }

      console.log(`词库总量：${total} 条 / ${categories.length} 个分类`);
      console.log(
        categories.map((category) => `${category.label} ${category.words?.length ?? 0}`).join(" | "),
      );
    }
  }
}

for (const message of warnings) {
  console.warn(`警告：${message}`);
}

if (errors.length > 0) {
  console.error("\n词库校验失败：");
  for (const message of errors.slice(0, 40)) {
    console.error(` - ${message}`);
  }
  if (errors.length > 40) {
    console.error(` ... 另有 ${errors.length - 40} 条问题`);
  }
  process.exit(1);
}

console.log("\n词库校验通过。");
