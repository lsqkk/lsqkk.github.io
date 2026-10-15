// @ts-check
/**
 * 「谍报风云」纯逻辑层。
 *
 * 本文件不依赖 DOM，也不依赖 Firebase，仅包含常量、随机数、判定与文本清洗等纯函数，
 * 保证规则本身可以被独立验证。状态变换见 `room-model.js`，实时同步见 `rtdb.js`，
 * 词库加载与抽词见 `word-pool.js`。
 */

/** 队伍标识 */
export const TEAMS = /** @type {const} */ (["A", "B"]);
/** A 队固定先手 */
export const FIRST_TEAM = "A";
/** 秘密词编号取值范围 */
export const WORD_NUMBERS = [1, 2, 3, 4];
/** 每轮从 4 个编号中抽取 3 个 */
export const CARD_LENGTH = 3;
/** 每队秘密词数量 */
export const WORDS_PER_TEAM = 4;
/** 每队人数 */
export const TEAM_SIZE = 2;
/** 房间容量（4 人两队） */
export const ROOM_CAPACITY = TEAM_SIZE * 2;
/** 可选的初始血量范围 */
export const HEALTH_MIN = 2;
export const HEALTH_MAX = 4;
export const HEALTH_DEFAULT = 3;
/** 房间码：去掉易混淆的 0/O/1/I */
const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 6;
/** 文本长度上限 */
export const NICKNAME_MAX = 12;
export const DESCRIPTION_MAX = 24;
export const NOTE_MAX = 60;
/** 角色标识 */
export const ROLE_DESCRIBER = "describer";
export const ROLE_GUESSER = "guesser";
export const ROLE_LISTENER = "listener";
/** 角色中文名 */
export const ROLE_LABELS = {
  describer: "描述者",
  guesser: "猜测者",
  listener: "监听者",
};

/** 房间阶段 */
export const PHASES = /** @type {const} */ ([
  "lobby",
  "prepare",
  "select-role",
  "describing",
  "guessing",
  "reveal",
  "ended",
]);

/**
 * 生成 `[0, maxExclusive)` 的随机整数。
 * 优先使用 crypto.getRandomValues，非安全上下文（如局域网 http）退回 Math.random。
 * @param {number} maxExclusive
 * @returns {number}
 */
export function randomInt(maxExclusive) {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    throw new RangeError(`randomInt 需要正整数，收到 ${maxExclusive}`);
  }
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
    const buffer = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
    let value = 0;
    do {
      cryptoObj.getRandomValues(buffer);
      value = buffer[0];
    } while (value >= limit);
    return value % maxExclusive;
  }
  return Math.floor(Math.random() * maxExclusive);
}

/**
 * Fisher-Yates 洗牌，返回新数组，不修改入参。
 * @template T
 * @param {readonly T[]} list
 * @returns {T[]}
 */
export function shuffle(list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/**
 * 抽取数字卡：从 [1,2,3,4] 中不重复地取出 3 个，顺序天然随机。
 * @returns {number[]}
 */
export function drawCard() {
  const pool = shuffle(WORD_NUMBERS);
  return pool.slice(0, CARD_LENGTH);
}

/**
 * 校验数字卡 / 猜测序列：长度 3、取值 1-4、互不重复。
 * @param {unknown} value
 * @returns {value is number[]}
 */
export function isValidSequence(value) {
  if (!Array.isArray(value) || value.length !== CARD_LENGTH) return false;
  const seen = new Set();
  for (const item of value) {
    if (!Number.isInteger(item) || !WORD_NUMBERS.includes(item)) return false;
    if (seen.has(item)) return false;
    seen.add(item);
  }
  return true;
}

/**
 * 猜测是否与数字卡完全一致（顺序敏感）。
 * @param {unknown} guess
 * @param {readonly number[]} card
 * @returns {boolean}
 */
export function isCorrect(guess, card) {
  if (!isValidSequence(guess)) return false;
  return guess.every((value, index) => value === card[index]);
}

/**
 * 判定单轮扣血。
 *
 * 规则（可叠加）：本队猜测者猜错 −1；本队猜测者猜对 ±0；对方监听者猜对 −1；对方监听者猜错 ±0。
 * 因此"猜测者猜错 + 监听者猜对"= −2。
 * @param {{ card: readonly number[], guesserGuess: unknown, listenerGuess: unknown }} input
 * @returns {{ guesserCorrect: boolean, listenerCorrect: boolean, healthLoss: number }}
 */
export function judgeRound({ card, guesserGuess, listenerGuess }) {
  const guesserCorrect = isCorrect(guesserGuess, card);
  const listenerCorrect = isCorrect(listenerGuess, card);
  let healthLoss = 0;
  if (!guesserCorrect) healthLoss += 1;
  if (listenerCorrect) healthLoss += 1;
  return { guesserCorrect, listenerCorrect, healthLoss };
}

/**
 * @param {"A" | "B"} team
 * @returns {"A" | "B"}
 */
export function otherTeam(team) {
  return team === "A" ? "B" : "A";
}

/**
 * 生成玩家 uid（localStorage 持久化，刷新后据此恢复身份）。
 * @returns {string}
 */
export function createUid() {
  const random = randomInt(0x100000000).toString(36).padStart(7, "0");
  return `p${Date.now().toString(36)}${random}`;
}

/**
 * 生成房间码。
 * @returns {string}
 */
export function createRoomCode() {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
    code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * 规范化房间码输入：大写、去空格、把易混字符还原。
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeRoomCode(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/O/g, "0")
    .replace(/I/g, "1")
    .slice(0, ROOM_CODE_LENGTH);
}

/**
 * 清洗用户文本：去掉控制字符、折叠空白、限制长度。
 * 返回值始终为字符串，可直接用于 textContent。
 * @param {unknown} value
 * @param {number} maxLength
 * @returns {string}
 */
export function sanitizeText(value, maxLength) {
  const raw = String(value ?? "");
  let out = "";
  for (const char of raw) {
    const code = char.codePointAt(0) ?? 0;
    // 丢弃 C0/C1 控制字符（含换行、制表）与 DEL
    if (code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f)) continue;
    out += char;
  }
  out = out.replace(/\s+/g, " ").trim();
  return out.slice(0, maxLength);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function sanitizeNickname(value) {
  const name = sanitizeText(value, NICKNAME_MAX);
  return name || "";
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function sanitizeDescription(value) {
  return sanitizeText(value, DESCRIPTION_MAX);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function sanitizeNote(value) {
  return sanitizeText(value, NOTE_MAX);
}

/**
 * 把 RTDB 读回的 3 元素数组补齐 / 归一。
 * @param {unknown} value
 * @returns {number[] | null}
 */
export function toSequence(value) {
  if (!value) return null;
  const list = Array.isArray(value) ? value : Object.values(value);
  if (!isValidSequence(list)) return null;
  return /** @type {number[]} */ (list);
}

/**
 * 把 RTDB 读回的对象 / 数组归一成字符串数组（保序）。
 * @param {unknown} value
 * @returns {string[]}
 */
export function toTextList(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : Object.values(value);
  return list.filter((item) => typeof item === "string" && item.length > 0);
}

/**
 * 判定指定队伍当前应派出的角色是否合法。
 * 当前回合队伍只能派描述者与猜测者，对方队伍只能派监听者。
 * @param {"A" | "B"} team
 * @param {"A" | "B"} turn
 * @param {string} role
 * @returns {boolean}
 */
export function isValidRoleForTeam(team, turn, role) {
  if (team === turn) return role === ROLE_DESCRIBER || role === ROLE_GUESSER;
  return role === ROLE_LISTENER;
}

/**
 * 把秘密词数组转成 RTDB 友好的 `{ "1": "词", ... }` 结构。
 * @param {readonly string[]} words
 * @returns {Record<string, string>}
 */
export function toWordRecord(words) {
  /** @type {Record<string, string>} */
  const record = {};
  words.slice(0, WORDS_PER_TEAM).forEach((word, index) => {
    record[String(index + 1)] = word;
  });
  return record;
}

/**
 * 解释一条数字卡为展示文本，如 `1-2-4`。
 * @param {readonly number[] | null | undefined} card
 * @returns {string}
 */
export function formatCard(card) {
  if (!card || card.length === 0) return "—";
  return card.join("-");
}
