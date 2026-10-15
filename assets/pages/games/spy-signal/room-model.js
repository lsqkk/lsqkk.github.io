// @ts-check
/**
 * 「谍报风云」房间数据模型与状态机。
 *
 * 所有变更都通过 `applyAction(room, action)` 这一个纯函数完成：
 * 客户端把 action 交给 Firebase 的 `runTransaction` 执行，由 RTDB 负责串行化，
 * 因此不会出现两个玩家同时扣血 / 同时换回合导致的并发错乱。
 *
 * 纯函数 + 单一入口的另一个好处是：整个规则状态机可以脱离网络单独验证。
 */

import {
  CARD_LENGTH,
  HEALTH_DEFAULT,
  HEALTH_MAX,
  HEALTH_MIN,
  PHASES,
  ROLE_DESCRIBER,
  ROLE_GUESSER,
  ROLE_LISTENER,
  ROOM_CAPACITY,
  TEAMS,
  TEAM_SIZE,
  WORDS_PER_TEAM,
  isValidRoleForTeam,
  isValidSequence,
  judgeRound,
  otherTeam,
  sanitizeAvatar,
  sanitizeDescription,
  sanitizeNote,
  sanitizeNickname,
  toWordRecord,
} from "./game-core.js";
import { dealWords } from "./word-pool.js";

/**
 * @typedef {"A" | "B"} Team
 * @typedef {"lobby" | "prepare" | "select-role" | "describing" | "guessing" | "reveal" | "ended"} Phase
 * @typedef {"describer" | "guesser" | "listener"} Role
 *
 * @typedef {object} Player
 * @property {string} name
 * @property {Team} team
 * @property {string | null} role 本轮担任的角色
 * @property {boolean} ready
 * @property {boolean} online
 * @property {number} joinedAt
 * @property {"color" | "image"} avatarType
 * @property {string} avatarColor
 * @property {string} avatarUrl
 *
 * @typedef {object} TeamState
 * @property {Record<string, string>} words 编号 1-4 → 秘密词
 * @property {Record<string, Record<string, string>>} intel 编号 1-4 → 本队收集到的对方暗号
 * @property {Record<string, Record<string, { text: string, by: string, name: string, at: number }>>} notes 编号 1-4 → 本队自定义笔记
 * @property {number} health
 * @property {string | null} describerId
 * @property {string | null} guesserId
 * @property {string | null} listenerId
 *
 * @typedef {object} Guess
 * @property {number[]} seq
 * @property {string} by
 * @property {number} at
 *
 * @typedef {object} RoundResult
 * @property {number} round
 * @property {Team} turn
 * @property {number[]} card
 * @property {string[]} descriptions
 * @property {Guess | null} guesserGuess
 * @property {Guess | null} listenerGuess
 * @property {boolean} guesserCorrect
 * @property {boolean} listenerCorrect
 * @property {number} healthLoss
 * @property {Record<Team, number>} healthAfter
 * @property {boolean} voided
 * @property {number} at
 *
 * @typedef {object} RoomMeta
 * @property {number} createdAt 建房时间
 * @property {string} hostId 房主 uid
 * @property {number} healthMax 初始血量
 * @property {number | null} dealtAt 首次发牌时间（等价于真正凑满 4 人的时刻）
 * @property {number | null} startedAt 开局时间
 * @property {number | null} endedAt 结束时间
 *
 * @typedef {object} Room
 * @property {RoomMeta} meta
 * @property {Record<string, Player>} players
 * @property {Record<Team, TeamState>} teams
 * @property {Phase} phase
 * @property {Team} turn
 * @property {number} round
 * @property {number[] | null} currentCard
 * @property {string[] | null} descriptions
 * @property {Record<Team, Guess | null>} guesses
 * @property {RoundResult | null} roundResult
 * @property {Record<string, RoundResult>} logs
 * @property {Team | null} winner
 * @property {number} updatedAt
 *
 * @typedef {object} Action
 * @property {string} type
 * @property {string} [actorId]
 * @property {any} [payload]
 */

/** 交易被拒绝时的返回值（firebase v8 约定：updateFn 返回 undefined 即中止） */
export const ABORT = undefined;

/**
 * @returns {TeamState}
 */
function createTeamState() {
  return {
    words: {},
    intel: { 1: {}, 2: {}, 3: {}, 4: {} },
    notes: { 1: {}, 2: {}, 3: {}, 4: {} },
    health: HEALTH_DEFAULT,
    describerId: null,
    guesserId: null,
    listenerId: null,
  };
}

/**
 * 创建空房间。
 * @param {{ hostId: string, healthMax?: number, now?: number }} options
 * @returns {Room}
 */
export function createEmptyRoom({ hostId, healthMax, now = Date.now() }) {
  const safeHealth = clampHealth(healthMax);
  return {
    meta: {
      createdAt: now,
      hostId,
      healthMax: safeHealth,
      dealtAt: null,
      startedAt: null,
      endedAt: null,
    },
    players: {},
    teams: {
      A: { ...createTeamState(), health: safeHealth },
      B: { ...createTeamState(), health: safeHealth },
    },
    phase: "lobby",
    turn: "A",
    round: 1,
    currentCard: null,
    descriptions: null,
    guesses: { A: null, B: null },
    roundResult: null,
    logs: {},
    winner: null,
    updatedAt: now,
  };
}

/**
 * @param {unknown} value
 * @returns {number}
 */
export function clampHealth(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return HEALTH_DEFAULT;
  return Math.min(HEALTH_MAX, Math.max(HEALTH_MIN, Math.round(num)));
}

/**
 * 把 RTDB 读回的房间数据补齐，避免界面因字段缺失崩溃。
 * @param {any} raw
 * @returns {Room | null}
 */
export function normalizeRoom(raw) {
  if (!raw || typeof raw !== "object") return null;
  const players = raw.players && typeof raw.players === "object" ? raw.players : {};
  /** @type {Record<string, Player>} */
  const normalizedPlayers = {};
  for (const [uid, value] of Object.entries(players)) {
    const player = /** @type {any} */ (value);
    if (!player || typeof player !== "object") continue;
    const team = player.team === "B" ? "B" : "A";
    const avatar = sanitizeAvatar({
      type: player.avatarType,
      color: player.avatarColor,
      url: player.avatarUrl,
    });
    normalizedPlayers[uid] = {
      name: sanitizeNickname(player.name) || "匿名特工",
      team,
      role: typeof player.role === "string" ? player.role : null,
      ready: player.ready === true,
      online: player.online === true,
      joinedAt: Number(player.joinedAt) || 0,
      avatarType: avatar.type,
      avatarColor: avatar.color,
      avatarUrl: avatar.url,
    };
  }

  const healthMax = clampHealth(raw.meta?.healthMax);
  /** @type {Record<Team, TeamState>} */
  const teams = {
    A: normalizeTeam(raw.teams?.A, healthMax),
    B: normalizeTeam(raw.teams?.B, healthMax),
  };

  const phase = PHASES.includes(raw.phase) ? raw.phase : "lobby";
  const logs = raw.logs && typeof raw.logs === "object" ? raw.logs : {};

  return {
    meta: {
      createdAt: Number(raw.meta?.createdAt) || 0,
      hostId: typeof raw.meta?.hostId === "string" ? raw.meta.hostId : "",
      healthMax,
      dealtAt: Number(raw.meta?.dealtAt) || null,
      startedAt: Number(raw.meta?.startedAt) || null,
      endedAt: Number(raw.meta?.endedAt) || null,
    },
    players: normalizedPlayers,
    teams,
    phase,
    turn: raw.turn === "B" ? "B" : "A",
    round: Number(raw.round) || 1,
    currentCard: normalizeNumberList(raw.currentCard),
    descriptions: normalizeStringList(raw.descriptions),
    guesses: {
      A: normalizeGuess(raw.guesses?.A),
      B: normalizeGuess(raw.guesses?.B),
    },
    roundResult: raw.roundResult && typeof raw.roundResult === "object" ? raw.roundResult : null,
    logs,
    winner: raw.winner === "A" || raw.winner === "B" ? raw.winner : null,
    updatedAt: Number(raw.updatedAt) || 0,
  };
}

/**
 * @param {any} raw
 * @param {number} healthMax
 * @returns {TeamState}
 */
function normalizeTeam(raw, healthMax) {
  const base = createTeamState();
  if (!raw || typeof raw !== "object") {
    return { ...base, health: healthMax };
  }
  return {
    words: raw.words && typeof raw.words === "object" ? raw.words : {},
    intel: {
      1: raw.intel?.[1] ?? {},
      2: raw.intel?.[2] ?? {},
      3: raw.intel?.[3] ?? {},
      4: raw.intel?.[4] ?? {},
    },
    notes: {
      1: raw.notes?.[1] ?? {},
      2: raw.notes?.[2] ?? {},
      3: raw.notes?.[3] ?? {},
      4: raw.notes?.[4] ?? {},
    },
    health: Number.isFinite(Number(raw.health)) ? Number(raw.health) : healthMax,
    describerId: raw.describerId ?? null,
    guesserId: raw.guesserId ?? null,
    listenerId: raw.listenerId ?? null,
  };
}

/**
 * @param {any} value
 * @returns {number[] | null}
 */
function normalizeNumberList(value) {
  if (!value) return null;
  const list = Array.isArray(value) ? value : Object.values(value);
  return isValidSequence(list) ? /** @type {number[]} */ (list) : null;
}

/**
 * @param {any} value
 * @returns {string[] | null}
 */
function normalizeStringList(value) {
  if (!value) return null;
  const list = Array.isArray(value) ? value : Object.values(value);
  const texts = list.map((item) => String(item ?? ""));
  if (texts.length !== CARD_LENGTH) return null;
  return texts;
}

/**
 * @param {any} value
 * @returns {Guess | null}
 */
function normalizeGuess(value) {
  if (!value || typeof value !== "object") return null;
  const seq = normalizeNumberList(value.seq);
  if (!seq) return null;
  return { seq, by: String(value.by ?? ""), at: Number(value.at) || 0 };
}

/* ------------------------------------------------------------------ *
 * 状态机
 * ------------------------------------------------------------------ */

/**
 * 房间状态机：输入当前房间与一个动作，返回新房间。
 * 返回 `ABORT`（undefined）表示该动作在当前状态下非法，事务应被拒绝。
 *
 * @param {Room | null} room
 * @param {Action} action
 * @returns {Room | null | undefined}
 */
export function applyAction(room, action) {
  if (!action || typeof action.type !== "string") return ABORT;

  // 创建房间是唯一允许 room 为 null 的动作
  if (!room) {
    if (action.type === "CREATE_ROOM") {
      const hostId = String(action.actorId ?? "");
      if (!hostId) return ABORT;
      const created = createEmptyRoom({
        hostId,
        healthMax: action.payload?.healthMax,
      });
      return commit(created, {
        players: {
          [hostId]: createPlayer(action.payload?.name, "A", true, action.payload?.avatar),
        },
      });
    }
    return ABORT;
  }

  switch (action.type) {
    case "CREATE_ROOM":
      // 房间码已被占用，拒绝创建
      return ABORT;
    case "JOIN":
      return reduceJoin(room, action);
    case "SET_ONLINE":
      return reduceSetOnline(room, action);
    case "LEAVE":
      return reduceLeave(room, action);
    case "SET_READY":
      return reduceSetReady(room, action);
    case "SET_HEALTH_MAX":
      return reduceSetHealthMax(room, action);
    case "DEAL_WORDS":
      return reduceDealWords(room, action);
    case "REROLL":
      return reduceReroll(room, action);
    case "START":
      return reduceStart(room, action);
    case "ASSIGN_ROLE":
      return reduceAssignRole(room, action);
    case "AUTO_ASSIGN":
      return reduceAutoAssign(room, action);
    case "DESCRIBE":
      return reduceDescribe(room, action);
    case "GUESS":
      return reduceGuess(room, action);
    case "VOID_ROUND":
      return reduceVoidRound(room, action);
    case "NEXT_ROUND":
      return reduceNextRound(room, action);
    case "ADD_NOTE":
      return reduceAddNote(room, action);
    case "REMOVE_NOTE":
      return reduceRemoveNote(room, action);
    case "RESTART":
      return reduceRestart(room, action);
    default:
      return ABORT;
  }
}

/**
 * 以不可变方式写回房间，并刷新 `updatedAt`。
 * @param {Room} room
 * @param {Partial<Room>} patch
 * @returns {Room}
 */
function commit(room, patch) {
  return /** @type {Room} */ ({ ...room, ...patch, updatedAt: Date.now() });
}

/**
 * @param {unknown} name
 * @param {Team} team
 * @param {boolean} online
 * @param {unknown} [avatar]
 * @returns {Player}
 */
function createPlayer(name, team, online, avatar) {
  const safeAvatar = sanitizeAvatar(/** @type {any} */ (avatar));
  return {
    name: sanitizeNickname(name) || "匿名特工",
    team,
    role: null,
    ready: false,
    online,
    joinedAt: Date.now(),
    avatarType: safeAvatar.type,
    avatarColor: safeAvatar.color,
    avatarUrl: safeAvatar.url,
  };
}

/**
 * @param {Record<string, Player>} players
 * @returns {Team}
 */
function pickBalancedTeam(players) {
  const counts = { A: 0, B: 0 };
  for (const player of Object.values(players)) counts[player.team] += 1;
  if (counts.A <= counts.B) return "A";
  return "B";
}

/**
 * @param {Record<string, Player>} players
 * @returns {number}
 */
function countPlayers(players) {
  return Object.keys(players).length;
}

/**
 * @param {Room} room
 * @returns {boolean}
 */
function rosterComplete(room) {
  if (countPlayers(room.players) !== ROOM_CAPACITY) return false;
  const counts = { A: 0, B: 0 };
  for (const player of Object.values(room.players)) counts[player.team] += 1;
  return counts.A === 2 && counts.B === 2;
}

/**
 * @param {Room} room
 * @param {Team} team
 * @returns {string[]}
 */
function membersOf(room, team) {
  return Object.entries(room.players)
    .filter(([, player]) => player.team === team)
    .sort((a, b) => a[1].joinedAt - b[1].joinedAt)
    .map(([uid]) => uid);
}

/**
 * 清空所有角色指派（回合切换、玩家退出时使用）。
 * @param {Room} room
 * @returns {Room}
 */
function clearRoles(room) {
  /** @type {Record<string, Player>} */
  const players = {};
  for (const [uid, player] of Object.entries(room.players)) {
    players[uid] = { ...player, role: null };
  }
  return commit(room, {
    players,
    teams: {
      A: { ...room.teams.A, describerId: null, guesserId: null, listenerId: null },
      B: { ...room.teams.B, describerId: null, guesserId: null, listenerId: null },
    },
  });
}

/**
 * @param {Room} room
 * @param {Action} action
 * @returns {Room | undefined}
 */
function reduceJoin(room, action) {
  const uid = String(action.actorId ?? "");
  if (!uid) return ABORT;
  const name = sanitizeNickname(action.payload?.name) || "匿名特工";
  const incomingAvatar = action.payload?.avatar;
  const hasAvatar = incomingAvatar && typeof incomingAvatar === "object";
  const avatar = hasAvatar
    ? sanitizeAvatar(/** @type {any} */ (incomingAvatar))
    : null;

  // 重连 / 刷新：沿用原有座位
  if (room.players[uid]) {
    const existing = room.players[uid];
    const player = {
      ...existing,
      name,
      online: true,
      // 没带头像时保留原样，避免重连把已设置的头像洗掉
      avatarType: avatar ? avatar.type : existing.avatarType,
      avatarColor: avatar ? avatar.color : existing.avatarColor,
      avatarUrl: avatar ? avatar.url : existing.avatarUrl,
    };
    return commit(room, { players: { ...room.players, [uid]: player } });
  }

  if (countPlayers(room.players) >= ROOM_CAPACITY) return ABORT;
  // 对局中不再接受新玩家，避免破坏双方词板
  if (room.phase !== "lobby" && room.phase !== "prepare") return ABORT;

  const team = pickBalancedTeam(room.players);
  const player = createPlayer(name, team, true, hasAvatar ? incomingAvatar : undefined);
  let next = commit(room, { players: { ...room.players, [uid]: player } });

  // 满员后进入准备阶段，等待任意客户端发牌
  if (rosterComplete(next) && next.phase === "lobby") {
    next = commit(next, { phase: "prepare" });
  }
  return next;
}

/**
 * @param {Room} room
 * @param {Action} action
 * @returns {Room | undefined}
 */
function reduceSetOnline(room, action) {
  const uid = String(action.actorId ?? "");
  const player = room.players[uid];
  if (!player) return ABORT;
  const online = action.payload?.online === true;
  if (player.online === online) return ABORT;
  return commit(room, {
    players: { ...room.players, [uid]: { ...player, online } },
  });
}

/**
 * @param {Room} room
 * @param {Action} action
 * @returns {Room | null | undefined}
 */
function reduceLeave(room, action) {
  const uid = String(action.actorId ?? "");
  if (!room.players[uid]) return ABORT;

  /** @type {Record<string, Player>} */
  const players = {};
  for (const [key, player] of Object.entries(room.players)) {
    if (key === uid) continue;
    players[key] = player;
  }
  if (countPlayers(players) === 0) return null; // 最后一人离开，删除房间

  let next = clearRoles(commit(room, { players }));

  // 准备阶段掉人 → 退回大厅重新组队；对局中保留进度，交由房主决定作废或重开
  if (next.phase === "lobby" || next.phase === "prepare") {
    next = commit(next, { phase: "lobby" });
  }
  return next;
}

/**
 * @param {Room} room
 * @param {Action} action
 * @returns {Room | undefined}
 */
function reduceSetReady(room, action) {
  const uid = String(action.actorId ?? "");
  const player = room.players[uid];
  if (!player) return ABORT;
  if (room.phase !== "lobby" && room.phase !== "prepare") return ABORT;
  const ready = action.payload?.ready === true;
  if (player.ready === ready) return ABORT;
  return commit(room, {
    players: { ...room.players, [uid]: { ...player, ready } },
  });
}

/**
 * @param {Room} room
 * @param {Action} action
 * @returns {Room | undefined}
 */
function reduceSetHealthMax(room, action) {
  if (!isHost(room, action.actorId)) return ABORT;
  if (room.phase !== "lobby" && room.phase !== "prepare") return ABORT;
  const healthMax = clampHealth(action.payload?.healthMax);
  if (healthMax === room.meta.healthMax) return ABORT;
  return commit(room, {
    meta: { ...room.meta, healthMax },
    teams: {
      A: { ...room.teams.A, health: healthMax },
      B: { ...room.teams.B, health: healthMax },
    },
  });
}

/**
 * 发牌：仅在准备阶段且某一队词板为空时生效，保证只发一次。
 * @param {Room} room
 * @param {Action} action
 * @returns {Room | undefined}
 */
function reduceDealWords(room, action) {
  if (room.phase !== "prepare") return ABORT;
  if (!rosterComplete(room)) return ABORT;

  const provided = action.payload?.words;
  const hasProvided =
    provided && validWordList(provided.A) && validWordList(provided.B);
  const existingReady = hasWords(room.teams.A) && hasWords(room.teams.B);
  if (existingReady && !action.payload?.force) return ABORT;

  const words = hasProvided ? { A: provided.A, B: provided.B } : dealWords();

  // 重新发牌时清空上一局残留的情报
  return commit(room, {
    meta: { ...room.meta, dealtAt: room.meta.dealtAt ?? Date.now() },
    teams: {
      A: { ...room.teams.A, words: toWordRecord(words.A) },
      B: { ...room.teams.B, words: toWordRecord(words.B) },
    },
  });
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function validWordList(value) {
  return (
    Array.isArray(value) &&
    value.length === WORDS_PER_TEAM &&
    value.every((item) => typeof item === "string" && item.length > 0)
  );
}

/**
 * @param {TeamState} team
 * @returns {boolean}
 */
function hasWords(team) {
  return Object.keys(team.words ?? {}).length === WORDS_PER_TEAM;
}

/**
 * 重新随机：队内任一成员均可操作，只有准备阶段允许。
 * @param {Room} room
 * @param {Action} action
 * @returns {Room | undefined}
 */
function reduceReroll(room, action) {
  const uid = String(action.actorId ?? "");
  const player = room.players[uid];
  if (!player) return ABORT;
  if (room.phase !== "prepare") return ABORT;

  const team = player.team;
  const words = action.payload?.words;
  if (!validWordList(words)) return ABORT;

  // 换词后本队重新确认准备状态
  /** @type {Record<string, Player>} */
  const players = {};
  for (const [key, value] of Object.entries(room.players)) {
    players[key] = value.team === team ? { ...value, ready: false } : value;
  }

  return commit(room, {
    players,
    teams: { ...room.teams, [team]: { ...room.teams[team], words: toWordRecord(words) } },
  });
}

/**
 * @param {Room} room
 * @param {Action} action
 * @returns {Room | undefined}
 */
function reduceStart(room, action) {
  if (!isHost(room, action.actorId)) return ABORT;
  if (room.phase !== "prepare") return ABORT;
  if (!rosterComplete(room)) return ABORT;
  if (!hasWords(room.teams.A) || !hasWords(room.teams.B)) return ABORT;
  const allReady = Object.values(room.players).every((player) => player.ready);
  if (!allReady) return ABORT;

  return commit(clearRoles(room), {
    meta: { ...room.meta, startedAt: Date.now(), endedAt: null },
    phase: "select-role",
    turn: "A",
    round: 1,
    currentCard: null,
    descriptions: null,
    guesses: { A: null, B: null },
    roundResult: null,
    logs: {},
    winner: null,
  });
}

/**
 * 指派角色：本队只能派描述者 / 猜测者，对方队伍只能派监听者。
 * @param {Room} room
 * @param {Action} action
 * @returns {Room | undefined}
 */
function reduceAssignRole(room, action) {
  const uid = String(action.actorId ?? "");
  const actor = room.players[uid];
  if (!actor) return ABORT;
  if (room.phase !== "select-role") return ABORT;

  const payload = action.payload ?? {};
  const team = payload.team === "B" ? "B" : "A";
  const role = payload.role;
  // 只有本队成员能为自己队伍派角色
  if (actor.team !== team) return ABORT;
  if (!isValidRoleForTeam(team, room.turn, role)) return ABORT;

  const targetUid = payload.targetUid ? String(payload.targetUid) : null;
  if (targetUid && !isTeamMember(room, team, targetUid)) return ABORT;

  const field = roleField(role);
  /** @type {Record<string, Player>} */
  const players = {};
  for (const [key, player] of Object.entries(room.players)) {
    players[key] = { ...player };
  }

  const teamState = { ...room.teams[team] };
  const previousHolder = teamState[field];

  // 同一玩家不能在两个槽位重复出现：先把旧槽位清掉
  if (targetUid) {
    for (const slot of ["describerId", "guesserId", "listenerId"]) {
      if (teamState[slot] === targetUid) teamState[slot] = null;
    }
    players[targetUid].role = role;
  }
  if (previousHolder && players[previousHolder] && previousHolder !== targetUid) {
    players[previousHolder].role = null;
  }
  teamState[field] = targetUid;

  // 当前回合队伍的描述者与猜测者必须是两个人
  if (team === room.turn) {
    if (role === ROLE_DESCRIBER && teamState.guesserId === targetUid) teamState.guesserId = null;
    if (role === ROLE_GUESSER && teamState.describerId === targetUid) teamState.describerId = null;
  }

  let next = commit(room, {
    players,
    teams: { ...room.teams, [team]: teamState },
  });

  next = tryBeginDescribing(next, action.payload?.card);
  return next;
}

/**
 * 自动轮换：按轮次奇偶把描述者 / 猜测者在本队两人之间交替，监听者同理。
 * 这样每局不必手动点选，同时避免同一人连续两轮担任同一角色。
 * @param {Room} room
 * @param {Action} action
 * @returns {Room | undefined}
 */
function reduceAutoAssign(room, action) {
  const uid = String(action.actorId ?? "");
  const actor = room.players[uid];
  if (!actor) return ABORT;
  if (room.phase !== "select-role") return ABORT;

  const team = action.payload?.team === "B" ? "B" : "A";
  if (actor.team !== team) return ABORT;

  const members = membersOf(room, team);
  if (members.length < TEAM_SIZE) return ABORT;

  const parity = room.round % TEAM_SIZE;
  const teamState = { ...room.teams[team] };
  /** @type {Record<string, Player>} */
  const players = {};
  for (const [key, player] of Object.entries(room.players)) players[key] = { ...player };
  // 先清掉本队旧指派，避免"同一人占两个槽位"的中间态
  for (const slot of ["describerId", "guesserId", "listenerId"]) {
    const previous = teamState[slot];
    if (previous && players[previous]) players[previous].role = null;
    teamState[slot] = null;
  }

  if (team === room.turn) {
    teamState.describerId = members[parity];
    teamState.guesserId = members[(parity + 1) % TEAM_SIZE];
    if (players[teamState.describerId]) players[teamState.describerId].role = ROLE_DESCRIBER;
    if (players[teamState.guesserId]) players[teamState.guesserId].role = ROLE_GUESSER;
  } else {
    teamState.listenerId = members[parity];
    if (players[teamState.listenerId]) players[teamState.listenerId].role = ROLE_LISTENER;
  }

  let next = commit(room, {
    players,
    teams: { ...room.teams, [team]: teamState },
  });
  next = tryBeginDescribing(next, action.payload?.card);
  return next;
}

/**
 * @param {Room} room
 * @param {string} uid
 * @param {Team} team
 * @returns {boolean}
 */
function isTeamMember(room, team, uid) {
  return Boolean(room.players[uid]) && room.players[uid].team === team;
}

/**
 * @param {string} role
 * @returns {"describerId" | "guesserId" | "listenerId"}
 */
function roleField(role) {
  if (role === ROLE_DESCRIBER) return "describerId";
  if (role === ROLE_GUESSER) return "guesserId";
  return "listenerId";
}

/**
 * 三个角色就位后自动进入描述阶段，并锁定本轮数字卡。
 * @param {Room} room
 * @param {unknown} card
 * @returns {Room}
 */
function tryBeginDescribing(room, card) {
  if (room.phase !== "select-role") return room;
  const current = room.teams[room.turn];
  const opposite = room.teams[otherTeam(room.turn)];
  const ready =
    Boolean(current.describerId) &&
    Boolean(current.guesserId) &&
    Boolean(opposite.listenerId);
  if (!ready) return room;
  if (!isValidSequence(card)) return room;

  return commit(room, {
    phase: "describing",
    currentCard: /** @type {number[]} */ (card),
    descriptions: null,
    guesses: { A: null, B: null },
    roundResult: null,
  });
}

/**
 * @param {Room} room
 * @param {Action} action
 * @returns {Room | undefined}
 */
function reduceDescribe(room, action) {
  if (room.phase !== "describing") return ABORT;
  const uid = String(action.actorId ?? "");
  if (uid !== room.teams[room.turn].describerId) return ABORT;

  const raw = action.payload?.descriptions;
  if (!Array.isArray(raw) || raw.length !== CARD_LENGTH) return ABORT;
  const descriptions = raw.map((item) => sanitizeDescription(item));
  if (descriptions.some((item) => item.length === 0)) return ABORT;

  return commit(room, {
    descriptions,
    phase: "guessing",
    guesses: { A: null, B: null },
  });
}

/**
 * 提交猜测；双方都提交后立即判定并进入公开阶段。
 * @param {Room} room
 * @param {Action} action
 * @returns {Room | undefined}
 */
function reduceGuess(room, action) {
  if (room.phase !== "guessing") return ABORT;
  const uid = String(action.actorId ?? "");
  const seq = action.payload?.seq;
  if (!isValidSequence(seq)) return ABORT;

  const current = room.teams[room.turn];
  const opposite = room.teams[otherTeam(room.turn)];

  /** @type {Team} */
  let side;
  if (uid && uid === current.guesserId) side = room.turn;
  else if (uid && uid === opposite.listenerId) side = otherTeam(room.turn);
  else return ABORT;

  if (room.guesses[side]) return ABORT;

  const guesses = {
    ...room.guesses,
    [side]: { seq, by: uid, at: Date.now() },
  };
  let next = commit(room, { guesses });

  if (next.guesses.A && next.guesses.B) {
    next = finalizeRound(next);
  }
  return next;
}

/**
 * 房主作废本轮：用于必要角色掉线导致无法提交的场景。
 * @param {Room} room
 * @param {Action} action
 * @returns {Room | undefined}
 */
function reduceVoidRound(room, action) {
  if (!isHost(room, action.actorId)) return ABORT;
  if (room.phase !== "describing" && room.phase !== "guessing") return ABORT;

  const card = room.currentCard ?? [];
  const descriptions = room.descriptions ?? [];
  const result = buildResult(room, {
    card,
    descriptions,
    guesserGuess: room.guesses[room.turn] ?? null,
    listenerGuess: room.guesses[otherTeam(room.turn)] ?? null,
    guesserCorrect: false,
    listenerCorrect: false,
    healthLoss: 0,
    voided: true,
  });

  return commit(room, {
    phase: "reveal",
    roundResult: result,
    logs: { ...room.logs, [`r${room.round}`]: result },
  });
}

/**
 * 判定本轮：扣血、写入日志、把暗号加进对方情报板、必要时结束游戏。
 * @param {Room} room
 * @returns {Room}
 */
function finalizeRound(room) {
  const turn = room.turn;
  const opponent = otherTeam(turn);
  const card = room.currentCard ?? [];
  const guesserGuess = room.guesses[turn] ?? null;
  const listenerGuess = room.guesses[opponent] ?? null;

  const verdict = judgeRound({
    card,
    guesserGuess: guesserGuess?.seq ?? null,
    listenerGuess: listenerGuess?.seq ?? null,
  });

  const result = buildResult(room, {
    card,
    descriptions: room.descriptions ?? [],
    guesserGuess,
    listenerGuess,
    guesserCorrect: verdict.guesserCorrect,
    listenerCorrect: verdict.listenerCorrect,
    healthLoss: verdict.healthLoss,
    voided: false,
  });

  // 当前队伍扣血（规则中只有行动方会掉血）
  const currentTeam = room.teams[turn];
  const health = Math.max(0, currentTeam.health - verdict.healthLoss);
  const opponentTeam = { ...room.teams[opponent] };

  // 对方队伍把本轮暗号按编号归档到自己的情报板
  const intel = { ...opponentTeam.intel };
  if (Array.isArray(result.descriptions) && result.descriptions.length === CARD_LENGTH) {
    for (let i = 0; i < CARD_LENGTH; i += 1) {
      const number = card[i];
      if (!number) continue;
      const bucket = intel[number] ?? {};
      const nextBucket = { ...bucket };
      // 用递增序号 + 轮次作为 key，天然按轮次排序且不会互相覆盖
      nextBucket[`r${result.round}`] = result.descriptions[i];
      intel[number] = nextBucket;
    }
  }
  opponentTeam.intel = intel;

  const teams = {
    ...room.teams,
    [turn]: { ...currentTeam, health },
    [opponent]: opponentTeam,
  };
  result.healthAfter = { A: teams.A.health, B: teams.B.health };

  const finished = health <= 0;
  let phase = /** @type {Phase} */ ("reveal");
  let winner = /** @type {Team | null} */ (null);
  if (finished) {
    phase = "ended";
    winner = opponent;
  }

  return commit(room, {
    meta: { ...room.meta, endedAt: finished ? Date.now() : room.meta.endedAt },
    teams,
    phase,
    winner,
    roundResult: result,
    logs: { ...room.logs, [`r${room.round}`]: result },
  });
}

/**
 * @param {Room} room
 * @param {Omit<RoundResult, "round" | "turn" | "healthAfter" | "at">} draft
 * @returns {RoundResult}
 */
function buildResult(room, draft) {
  return {
    round: room.round,
    turn: room.turn,
    card: draft.card,
    descriptions: draft.descriptions,
    guesserGuess: draft.guesserGuess,
    listenerGuess: draft.listenerGuess,
    guesserCorrect: draft.guesserCorrect,
    listenerCorrect: draft.listenerCorrect,
    healthLoss: draft.healthLoss,
    healthAfter: { A: room.teams.A.health, B: room.teams.B.health },
    voided: draft.voided,
    at: Date.now(),
  };
}

/**
 * 进入下一轮：交换行动方、清空本轮临时状态、重新选角色。
 * @param {Room} room
 * @param {Action} action
 * @returns {Room | undefined}
 */
function reduceNextRound(room, action) {
  const uid = String(action.actorId ?? "");
  // 任意在场玩家都可以推进（事务保证重复点击是幂等的）
  if (!room.players[uid]) return ABORT;
  if (room.phase !== "reveal") return ABORT;

  const nextTurn = otherTeam(room.turn);
  let next = clearRoles(room);
  next = commit(next, {
    turn: nextTurn,
    round: room.round + 1,
    currentCard: null,
    descriptions: null,
    guesses: { A: null, B: null },
    roundResult: null,
    phase: rosterComplete(room) ? "select-role" : "lobby",
  });
  return next;
}

/**
 * @param {Room} room
 * @param {Action} action
 * @returns {Room | undefined}
 */
function reduceAddNote(room, action) {
  const uid = String(action.actorId ?? "");
  const actor = room.players[uid];
  if (!actor) return ABORT;

  // 只有情报板归属队伍的两名成员可以写笔记
  const team = action.payload?.team;
  if (team !== actor.team) return ABORT;
  const number = String(action.payload?.number ?? "");
  if (!["1", "2", "3", "4"].includes(number)) return ABORT;

  const text = sanitizeNote(action.payload?.text);
  if (!text) return ABORT;

  const noteId = String(action.payload?.noteId ?? "");
  if (!noteId) return ABORT;

  const teamState = room.teams[team];
  const bucket = { ...(teamState.notes[number] ?? {}) };
  // by 存 uid（识别归属），name 仅用于展示，避免同名玩家互相删不掉笔记
  bucket[noteId] = { text, by: uid, name: actor.name, at: Date.now() };

  return commit(room, {
    teams: {
      ...room.teams,
      [team]: { ...teamState, notes: { ...teamState.notes, [number]: bucket } },
    },
  });
}

/**
 * @param {Room} room
 * @param {Action} action
 * @returns {Room | undefined}
 */
function reduceRemoveNote(room, action) {
  const uid = String(action.actorId ?? "");
  const actor = room.players[uid];
  if (!actor) return ABORT;

  const team = action.payload?.team;
  if (team !== actor.team) return ABORT;
  const number = String(action.payload?.number ?? "");
  if (!["1", "2", "3", "4"].includes(number)) return ABORT;

  const noteId = String(action.payload?.noteId ?? "");
  const teamState = room.teams[team];
  const bucket = { ...(teamState.notes[number] ?? {}) };
  if (!(noteId in bucket)) return ABORT;

  const note = bucket[noteId];
  // 只能删除自己写的笔记
  if (!note || note.by !== uid) return ABORT;
  delete bucket[noteId];

  return commit(room, {
    teams: {
      ...room.teams,
      [team]: { ...teamState, notes: { ...teamState.notes, [number]: bucket } },
    },
  });
}

/**
 * 再来一局：房主重置为准备阶段，词板清空后由客户端重新发牌。
 * 只在"已经在打或已经打完"时可用，避免在大厅/准备阶段误清刚抽好的词。
 * @param {Room} room
 * @param {Action} action
 * @returns {Room | undefined}
 */
function reduceRestart(room, action) {
  if (!isHost(room, action.actorId)) return ABORT;
  if (room.phase === "lobby" || room.phase === "prepare") return ABORT;
  if (!rosterComplete(room)) return ABORT;

  const healthMax = room.meta.healthMax;
  /** @type {Record<string, Player>} */
  const players = {};
  for (const [uid, player] of Object.entries(room.players)) {
    players[uid] = { ...player, role: null, ready: false };
  }

  return commit(room, {
    meta: { ...room.meta, startedAt: null, endedAt: null },
    players,
    teams: {
      A: { ...createTeamState(), health: healthMax },
      B: { ...createTeamState(), health: healthMax },
    },
    phase: "prepare",
    turn: "A",
    round: 1,
    currentCard: null,
    descriptions: null,
    guesses: { A: null, B: null },
    roundResult: null,
    logs: {},
    winner: null,
  });
}

/**
 * @param {Room} room
 * @param {unknown} uid
 * @returns {boolean}
 */
function isHost(room, uid) {
  return Boolean(uid) && room.meta.hostId === uid;
}

/* ------------------------------------------------------------------ *
 * 只读派生工具（供界面层使用）
 * ------------------------------------------------------------------ */

/**
 * 把 `{ pushId: value }` 结构转为按键值升序 / 保序排列的数组。
 * @template T
 * @param {Record<string, T> | null | undefined} record
 * @returns {{ id: string, value: T }[]}
 */
export function entriesOf(record) {
  if (!record || typeof record !== "object") return [];
  return Object.entries(record).map(([id, value]) => ({ id, value }));
}

/**
 * 读取情报板上某个编号下的线索（按轮次排序）。
 * @param {TeamState} teamState
 * @param {number} number
 * @returns {string[]}
 */
export function intelOf(teamState, number) {
  const bucket = teamState?.intel?.[number];
  if (!bucket) return [];
  return Object.entries(bucket)
    .sort((a, b) => roundIndex(a[0]) - roundIndex(b[0]))
    .map(([, text]) => String(text))
    .filter((text) => text.length > 0);
}

/**
 * @param {string} key
 * @returns {number}
 */
function roundIndex(key) {
  const match = /^r(\d+)$/.exec(String(key));
  return match ? Number(match[1]) : 0;
}

/**
 * 当前回合应当提交猜测的玩家，以及应当描述 / 监听的玩家。
 * @param {Room} room
 * @returns {{ describerId: string | null, guesserId: string | null, listenerId: string | null }}
 */
export function currentRoles(room) {
  const current = room.teams[room.turn];
  const opposite = room.teams[otherTeam(room.turn)];
  return {
    describerId: current.describerId ?? null,
    guesserId: current.guesserId ?? null,
    listenerId: opposite.listenerId ?? null,
  };
}

/**
 * 判断某位玩家在当前阶段是否可以提交猜测。
 * @param {Room} room
 * @param {string} uid
 * @returns {Team | null}
 */
export function guessSideOf(room, uid) {
  if (room.phase !== "guessing") return null;
  const roles = currentRoles(room);
  if (uid && uid === roles.guesserId) return room.turn;
  if (uid && uid === roles.listenerId) return otherTeam(room.turn);
  return null;
}

/**
 * 汇总玩家列表，按队伍分组并按加入时间排序。
 * @param {Room} room
 * @returns {Record<Team, { uid: string, player: Player }[]>}
 */
export function playersByTeam(room) {
  return {
    A: groupOf(room, "A"),
    B: groupOf(room, "B"),
  };
}

/**
 * @param {Room} room
 * @param {Team} team
 * @returns {{ uid: string, player: Player }[]}
 */
function groupOf(room, team) {
  return Object.entries(room.players)
    .filter(([, player]) => player.team === team)
    .sort((a, b) => a[1].joinedAt - b[1].joinedAt)
    .map(([uid, player]) => ({ uid, player }));
}
