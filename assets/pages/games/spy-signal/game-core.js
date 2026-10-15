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
export const CHAT_MAX = 120;

/** 聊天记录读取条数（只影响读取窗口，写入不做裁剪） */
export const CHAT_HISTORY = 60;
/** 两条聊天消息之间的最小间隔，挡住手滑连点造成的刷屏 */
export const CHAT_MIN_INTERVAL_MS = 700;

/**
 * 掉线多久后自动移出房间。
 *
 * 倒计时从断线那一刻算起（服务端写在 `players/{uid}/offlineAt`），
 * 因此中途刷新 / 短暂断网只要在窗口内回来，座位原样保留。
 *
 * ⚠️ 客户端被强杀时 RTDB 要等心跳超时（通常 ≤60s）才会判定断线，
 * 所以实际倒计时的起点可能比"关掉页面那一刻"晚半分钟左右。
 */
export const OFFLINE_KICK_MS = 2 * 60 * 1000;

/** 加入房间时的队伍偏好：让系统自动塞进人少的一队 */
export const TEAM_AUTO = "auto";
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
 * 规范化房间码输入：转大写、去掉所有分隔符与易混字符。
 *
 * 注意房间码字母表本身就排除了 I / O / 0 / 1（避免口头或手抄时读错），
 * 所以这些字符不可能出现在合法房间码里 —— 直接去掉，而不是"猜"成别的字符
 * （早先版本把 O 当成 0、I 当成 1，反而会造出字母表里不存在的字符）。
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeRoomCode(value) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/[IO01]/g, "")
    .slice(0, ROOM_CODE_LENGTH);
}

/**
 * 从用户输入里取出房间码，同时兼容三种写法：
 * - 纯房间码：`ABC123`
 * - 带查询串：`?room=ABC123`
 * - 完整邀请链接：`https://lsqkk.github.io/games/spy-signal/?room=ABC123`
 *
 * @param {unknown} value
 * @returns {string} 解析出的房间码；是链接但没带房间码时返回空串
 */
export function extractRoomCode(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const inline = /[?&]room=([A-Za-z0-9_-]+)/.exec(raw);
  if (inline) return normalizeRoomCode(inline[1]);

  // 看着像链接（或至少带路径）却没有 room 参数：不要硬塞进房间码框
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.includes("/")) {
    try {
      const params = new URL(raw).searchParams.get("room");
      return params ? normalizeRoomCode(params) : "";
    } catch {
      return "";
    }
  }

  return normalizeRoomCode(raw);
}

/** 手动填写身份时可选的头像底色 */
export const AVATAR_COLORS = [
  "#4a6cf7",
  "#0ea5a3",
  "#c2761f",
  "#c0392b",
  "#7c5cd6",
  "#2f855a",
  "#b83280",
  "#0b6bcb",
];

/**
 * 常见的"地址里没有图片后缀"的头像来源。
 *
 * GitHub 的头像是 `https://avatars.githubusercontent.com/u/123?v=4`，
 * 带查询串、看不出后缀，所以单独放行这些域名。
 */
const AVATAR_IMAGE_HOSTS = [
  "avatars.githubusercontent.com",
  "github.com",
  "raw.githubusercontent.com",
  "cdn.jsdelivr.net",
];

/** 与站点评论头像（comment-input-shared.js）保持一致的图片后缀白名单 */
export const AVATAR_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

/**
 * 判断一个 URL 能否当头像。
 *
 * 规则刻意与站点评论头像保持一致：**https + 常见图片后缀**即可，
 * 另外额外放行 GitHub 这类"后缀看不出来"的固定域名。
 *
 * 早先这里只允许四个白名单域名，结果把用户自己在站点里设置的头像
 * （例如图床地址）也一并挡掉了，表现为"昵称同步了但没有头像"。
 * 既然站点的评论头像本来就允许任意图片地址，游戏里再严格一套只会造成不一致。
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isAllowedAvatarUrl(value) {
  const url = String(value ?? "").trim();
  if (!url) return false;

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;

  const pathname = parsed.pathname.toLowerCase();
  if (AVATAR_IMAGE_EXTENSIONS.some((ext) => pathname.endsWith(ext))) return true;

  return AVATAR_IMAGE_HOSTS.some(
    (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`),
  );
}

/**
 * 归一化头像：只接受"映射到允许域名的图片"或"预设/合法的十六进制颜色"。
 * 任何不合规的输入都退回默认色，保证房间里不会出现坏图或注入。
 *
 * @param {{ type?: unknown, color?: unknown, url?: unknown }} [input]
 * @returns {{ type: "color" | "image", color: string, url: string }}
 */
export function sanitizeAvatar(input) {
  const fallbackColor = AVATAR_COLORS[0];
  const rawColor = String(input?.color ?? "").trim();
  const color = /^#[0-9a-fA-F]{6}$/.test(rawColor)
    ? rawColor.toLowerCase()
    : /^#[0-9a-fA-F]{3}$/.test(rawColor)
      ? `#${rawColor[1]}${rawColor[1]}${rawColor[2]}${rawColor[2]}${rawColor[3]}${rawColor[3]}`.toLowerCase()
      : fallbackColor;

  const url = String(input?.url ?? "").trim();
  if (input?.type === "image" && isAllowedAvatarUrl(url)) {
    return { type: "image", color, url };
  }
  return { type: "color", color, url: "" };
}

/**
 * 清洗用户文本：去掉控制字符、折叠空白、限制长度。
 * 返回值始终为字符串，可直接用于 textContent。
 *
 * 长度按**码点**截断而不是按 UTF-16 单元：`slice()` 数的是 UTF-16 单元，
 * 一个 emoji 占 2 个，正好卡在边界上就会把代理对劈成半个字符，
 * 存进去再渲染出来对四个人都是乱码（聊天里 emoji 很常见）。
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
  const points = [...out];
  return points.length > maxLength ? points.slice(0, maxLength).join("") : out;
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
 * 清洗聊天文本。与其它文本一样走 `sanitizeText`：控制字符会被丢掉、
 * 空白会被折叠，返回值可直接写进 `textContent`。
 * @param {unknown} value
 * @returns {string}
 */
export function sanitizeChatText(value) {
  return sanitizeText(value, CHAT_MAX);
}

/**
 * 规格化"加入房间时想进的队伍"：只认 A / B，其余（含缺失、'' 、'auto'）都当作自动。
 * @param {unknown} value
 * @returns {"A" | "B" | null}
 */
export function normalizeTeamPreference(value) {
  const raw = String(value ?? "").trim().toUpperCase();
  if (raw === "A" || raw === "B") return raw;
  return null;
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
