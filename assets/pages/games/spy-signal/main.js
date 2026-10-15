// @ts-check
/**
 * 「谍报风云」控制器。
 *
 * 职责边界：
 * - 本文件只做"编排"：身份、房间生命周期、动作派发、界面路由；
 * - 规则在 `room-model.js`，网络在 `rtdb.js`，绘制在 `views-*.js`。
 *
 * 界面每次都用 RTDB 推来的完整房间重绘，因此刷新 / 掉线重连后
 * 会自动回到当前阶段，无需任何本地状态修补。
 */

import { append, byId, clear, copyText, withPreservedInputs, el } from "./dom.js";
import {
  HEALTH_DEFAULT,
  ROOM_CODE_LENGTH,
  ROOM_CAPACITY,
  createRoomCode,
  createUid,
  normalizeRoomCode,
  otherTeam,
  sanitizeNickname,
} from "./game-core.js";
import {
  bindPresence,
  dispatch,
  forgetRoom,
  getDatabase,
  readRecentRooms,
  reapAbandonedRooms,
  rememberRoom,
  roomReleaseDeadline,
  watchRoom,
} from "./rtdb.js";
import { dealWords, isWordPoolReady, loadWords, rerollWords } from "./word-pool.js";
import { readEntryForm, renderEntry } from "./views-entry.js";
import { renderGameScreen } from "./views-game.js";
import { renderEndedScreen } from "./views-ended.js";
import { renderRoomScreen } from "./views-room.js";

const STORAGE_UID = "spySignalUid";
const STORAGE_NICKNAME = "spySignalNickname";
const STORAGE_HEALTH = "spySignalHealth";
const STORAGE_SESSION = "spySignalSession";

/** URL 参数名：?room=ABC123，便于直接分享邀请链接 */
const ROOM_PARAM = "room";
/** 房间倒计时的刷新间隔与废弃房间扫描间隔 */
const COUNTDOWN_REFRESH_MS = 20000;
const REAP_INTERVAL_MS = 60000;

/** 会被明确提示给用户的事务拒绝原因 */
const REJECT_MESSAGES = {
  JOIN: "无法加入：房间不存在、已满员，或对局已经开始",
  CREATE_ROOM: "房间码冲突，请重试",
  START: "还不能开始：需要 4 人齐、两队都已发牌，并且全员准备",
  REROLL: "换词失败，请确认仍在准备阶段",
  SET_HEALTH_MAX: "血量只能在开局前修改",
  RESTART: "只有房主可以在 4 人齐时开新局",
};

const state = {
  /** @type {string} */ uid: "",
  /** @type {string} */ nickname: "",
  /** @type {number} */ healthMax: HEALTH_DEFAULT,
  /** @type {any} */ db: null,
  /** @type {string} */ roomId: "",
  /** @type {import("./room-model.js").Room | null} */ room: null,
  /** @type {(() => void) | null} */ unwatch: null,
  /** @type {(() => void) | null} */ presence: null,
  /** @type {string | null} */ notice: null,
  /** @type {boolean} */ busy: false,
  /** @type {number[]} */ draftGuess: [],
  /** @type {boolean} */ connected: false,
  /** @type {string} */ dealToken: "",
  /** @type {string} */ wordError: "",
  /** @type {boolean} */ restoring: false,
  /** @type {boolean} */ reapScheduled: false,
  /** 来自 ?room= 的房间码，用于预填加入框 */
  /** @type {string} */ prefillCode: "",
};

let toastTimer = 0;

/* ------------------------------------------------------------------ *
 * 启动
 * ------------------------------------------------------------------ */

/**
 * 页面入口：Astro 页面里的内联 module 会调用它。
 */
export function boot() {
  readIdentity();
  const container = byId("ssScreens");
  if (!container) return;

  state.prefillCode = readRoomParam();

  // 词库体积较大，首屏后台预取，避免满员发牌时才开始下载
  loadWords().catch((error) => {
    state.wordError = `词库加载失败：${messageOf(error)}`;
    render();
  });

  render();

  const session = readSession();
  if (state.prefillCode && session?.roomId !== state.prefillCode) {
    // 别人分享来的邀请链接：走"填昵称 → 加入"，不跳回自己上一局，
    // 避免旧会话把邀请链接劫走。
    clearSession();
    render();
    focusEntryNickname();
  } else {
    // 没有邀请参数，或邀请的正是自己正在玩的那间房（刷新场景）→ 恢复对局
    restoreSession(session);
  }

  scheduleReap();
  window.setInterval(() => {
    // 大厅/准备/结算页有释放倒计时，需要定期刷新
    if (state.room && ["lobby", "prepare", "ended"].includes(state.room.phase)) render();
  }, COUNTDOWN_REFRESH_MS);
}

/**
 * 顺手清理到期房间：只在已经建立过连接的客户端上跑，
 * 免得让"只来看规则"的访客白白连一次实时服务。
 */
function scheduleReap() {
  if (!state.db || state.reapScheduled) return;
  state.reapScheduled = true;
  const sweep = () => {
    reapAbandonedRooms(state.db).catch(() => {
      /* 清理失败不影响正常玩法 */
    });
  };
  window.setTimeout(sweep, 3000);
  window.setInterval(sweep, REAP_INTERVAL_MS);
}

/* ------------------------------------------------------------------ *
 * URL ?room= 支持
 * ------------------------------------------------------------------ */

/**
 * @returns {string}
 */
function readRoomParam() {
  try {
    const params = new URLSearchParams(window.location.search);
    return normalizeRoomCode(params.get(ROOM_PARAM) ?? "");
  } catch {
    return "";
  }
}

/**
 * 把当前房间写进地址栏，让链接可以直接分享；离开房间时移除。
 * @param {string} code
 */
function writeRoomParam(code) {
  try {
    const url = new URL(window.location.href);
    if (code) url.searchParams.set(ROOM_PARAM, code);
    else url.searchParams.delete(ROOM_PARAM);
    window.history.replaceState({}, "", url);
  } catch {
    /* 无法改写地址时忽略，功能不受影响 */
  }
}

/**
 * 邀请链接。
 * @param {string} code
 * @returns {string}
 */
function shareUrl(code) {
  const url = new URL(window.location.href);
  url.searchParams.set(ROOM_PARAM, code);
  url.hash = "";
  return url.toString();
}

function focusEntryNickname() {
  const input = /** @type {any} */ (byId("ssNickname"));
  if (input && !String(input.value ?? "").trim()) input.focus();
}

function readIdentity() {
  let uid = "";
  try {
    uid = window.localStorage.getItem(STORAGE_UID) ?? "";
    const savedNickname = window.localStorage.getItem(STORAGE_NICKNAME);
    const savedHealth = Number(window.localStorage.getItem(STORAGE_HEALTH));
    if (savedNickname) state.nickname = savedNickname;
    if (Number.isFinite(savedHealth) && savedHealth > 0) state.healthMax = savedHealth;
  } catch {
    /* 隐私模式下 localStorage 不可用时退化为临时身份 */
  }
  if (!uid) {
    uid = createUid();
    try {
      window.localStorage.setItem(STORAGE_UID, uid);
    } catch {
      /* 忽略 */
    }
  }
  state.uid = uid;
}

/**
 * @returns {{ roomId: string, nickname?: string } | null}
 */
function readSession() {
  try {
    const raw = window.localStorage.getItem(STORAGE_SESSION);
    const session = raw ? JSON.parse(raw) : null;
    if (!session || typeof session.roomId !== "string" || !session.roomId) return null;
    return session;
  } catch {
    return null;
  }
}

/**
 * 刷新 / 掉线重连：如果上次在房间里，自动重新入座。
 * @param {{ roomId: string, nickname?: string } | null} [known]
 */
async function restoreSession(known) {
  const session = known === undefined ? readSession() : known;
  if (!session) return;

  state.restoring = true;
  render();
  try {
    const room = await joinRoomInternal(session.roomId, session.nickname || state.nickname);
    if (!room) {
      clearSession();
      state.notice = "上次的房间已解散或已满员，已返回大厅。";
    }
  } catch (error) {
    state.notice = `恢复房间失败：${messageOf(error)}`;
  } finally {
    state.restoring = false;
    render();
  }
}

/* ------------------------------------------------------------------ *
 * 房间生命周期
 * ------------------------------------------------------------------ */

/**
 * @returns {Promise<any>}
 */
async function ensureDb() {
  if (state.db) return state.db;
  state.notice = "正在连接实时服务…";
  state.busy = true;
  render();
  try {
    state.db = await getDatabase();
    state.notice = null;
    scheduleReap();
    return state.db;
  } finally {
    state.busy = false;
    render();
  }
}

async function createRoom() {
  const form = readEntryForm();
  const nickname = sanitizeNickname(form.nickname);
  if (!nickname) {
    toast("请先填写昵称");
    return;
  }
  state.nickname = nickname;
  state.healthMax = form.healthMax;
  persistIdentity();

  try {
    state.busy = true;
    render();
    const db = await ensureDb();

    // 房间码冲突时换一个重试（4 位随机量级极小，正常情况下一次成功）
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = createRoomCode();
      const result = await dispatch(db, code, {
        type: "CREATE_ROOM",
        actorId: state.uid,
        payload: { name: nickname, healthMax: form.healthMax },
      });
      if (result.committed) {
        enterRoom(code, nickname);
        return;
      }
    }
    toast("房间码生成失败，请重试");
  } catch (error) {
    toast(`创建房间失败：${messageOf(error)}`);
  } finally {
    state.busy = false;
    render();
  }
}

/**
 * 从入口屏加入房间。
 * @param {string} rawCode
 */
async function joinRoom(rawCode) {
  const form = readEntryForm();
  const nickname = sanitizeNickname(form.nickname);
  if (!nickname) {
    toast("请先填写昵称");
    return;
  }
  const code = normalizeRoomCode(rawCode);
  if (code.length !== ROOM_CODE_LENGTH) {
    toast(`请输入 ${ROOM_CODE_LENGTH} 位房间码`);
    return;
  }
  state.nickname = nickname;
  persistIdentity();

  try {
    state.busy = true;
    render();
    const ok = await joinRoomInternal(code, nickname);
    if (!ok) toast(REJECT_MESSAGES.JOIN);
  } catch (error) {
    toast(`加入房间失败：${messageOf(error)}`);
  } finally {
    state.busy = false;
    render();
  }
}

/**
 * 执行加入并订阅房间。
 * @param {string} code
 * @param {string} nickname
 * @returns {Promise<boolean>}
 */
async function joinRoomInternal(code, nickname) {
  const db = await ensureDb();
  const result = await dispatch(db, code, {
    type: "JOIN",
    actorId: state.uid,
    payload: { name: sanitizeNickname(nickname) || "匿名特工" },
  });
  if (!result.committed) return false;
  enterRoom(code, nickname);
  return true;
}

/**
 * 进入房间：订阅 + 在线状态 + 本地记忆。
 * @param {string} code
 * @param {string} nickname
 */
function enterRoom(code, nickname) {
  leaveRoomWatchers();
  state.roomId = code;
  state.draftGuess = [];
  state.dealToken = "";
  state.prefillCode = "";
  rememberRoom({ roomId: code, name: nickname });
  // 让地址栏直接就是一条可分享的邀请链接
  writeRoomParam(code);

  try {
    window.localStorage.setItem(
      STORAGE_SESSION,
      JSON.stringify({ roomId: code, nickname }),
    );
  } catch {
    /* 忽略 */
  }

  state.unwatch = watchRoom(
    state.db,
    code,
    (room) => {
      if (!room) {
        handleRoomGone();
        return;
      }
      state.room = room;
      maybeDealWords(room);
      render();
    },
    (error) => {
      toast(`实时同步中断：${messageOf(error)}`);
    },
  );

  state.presence = bindPresence(state.db, code, state.uid, (connected) => {
    state.connected = connected;
    const badge = byId("ssConnBadge");
    if (badge) {
      badge.textContent = connected ? "实时同步中" : "连接中断，正在重连…";
      badge.className = `ss-conn${connected ? " is-online" : " is-offline"}`;
    }
  });

  render();
}

function handleRoomGone() {
  leaveRoomWatchers();
  clearSession();
  writeRoomParam("");
  state.roomId = "";
  state.room = null;
  state.notice = "房间已解散。";
  render();
}

async function leaveRoom() {
  const roomId = state.roomId;
  const uid = state.uid;
  const db = state.db;
  leaveRoomWatchers();
  state.roomId = "";
  state.room = null;
  state.draftGuess = [];
  clearSession();
  writeRoomParam("");
  forgetRoom(roomId);
  render();

  if (db && roomId) {
    // 显式退出才移除座位；单纯刷新 / 掉线只标记离线，以便原样恢复对局
    try {
      await dispatch(db, roomId, { type: "LEAVE", actorId: uid });
    } catch {
      /* 房间可能已经被解散，忽略 */
    }
  }
}

function leaveRoomWatchers() {
  if (state.unwatch) {
    state.unwatch();
    state.unwatch = null;
  }
  if (state.presence) {
    state.presence();
    state.presence = null;
  }
  state.connected = false;
}

function clearSession() {
  try {
    window.localStorage.removeItem(STORAGE_SESSION);
  } catch {
    /* 忽略 */
  }
}

function persistIdentity() {
  try {
    window.localStorage.setItem(STORAGE_NICKNAME, state.nickname);
    window.localStorage.setItem(STORAGE_HEALTH, String(state.healthMax));
  } catch {
    /* 忽略 */
  }
}

/* ------------------------------------------------------------------ *
 * 动作派发
 * ------------------------------------------------------------------ */

/**
 * @param {string} type
 * @param {Record<string, unknown>} [payload]
 */
async function act(type, payload) {
  if (!state.db || !state.roomId) return;
  try {
    const result = await dispatch(state.db, state.roomId, {
      type,
      actorId: state.uid,
      payload,
    });
    if (!result.committed && REJECT_MESSAGES[type]) {
      toast(REJECT_MESSAGES[type]);
    }
  } catch (error) {
    toast(`操作失败：${messageOf(error)}`);
  }
}

/**
 * 满 4 人且还没发牌时，由最先反应到的客户端代两队抽词。
 * 词在动作载荷里，因此所有客户端看到的是同一份结果。
 * @param {import("./room-model.js").Room} room
 */
function maybeDealWords(room) {
  const dealt =
    Object.keys(room.teams?.A?.words ?? {}).length === 4 &&
    Object.keys(room.teams?.B?.words ?? {}).length === 4;
  if (dealt) {
    state.dealToken = "";
    return;
  }
  if (room.phase !== "prepare") return;
  if (Object.keys(room.players).length !== ROOM_CAPACITY) return;

  const token = `${state.roomId}:${room.round}`;
  if (state.dealToken === token) return;
  state.dealToken = token;

  if (!isWordPoolReady()) {
    loadWords()
      .then(() => {
        state.dealToken = "";
        if (state.room) maybeDealWords(state.room);
      })
      .catch((error) => {
        state.dealToken = "";
        toast(`词库加载失败：${messageOf(error)}`);
      });
    return;
  }

  act("DEAL_WORDS", { words: dealWords() });
}

function rerollMyTeam() {
  const room = state.room;
  const me = room?.players?.[state.uid];
  if (!room || !me) return;
  if (!isWordPoolReady()) {
    toast("词库尚未就绪，请稍后再试");
    return;
  }
  const mine = Object.values(room.teams[me.team].words ?? {});
  const theirs = Object.values(room.teams[otherTeam(me.team)].words ?? {});
  const words = rerollWords([...mine, ...theirs]);
  if (words.length < 4) {
    toast("词库余量不足，无法换词");
    return;
  }
  act("REROLL", { words });
}

async function restart() {
  state.dealToken = "";
  await act("RESTART", {});
}

/* ------------------------------------------------------------------ *
 * 渲染
 * ------------------------------------------------------------------ */

function render() {
  const topbar = byId("ssTopbar");
  const screens = byId("ssScreens");
  if (!topbar || !screens) return;

  withPreservedInputs(topbar, () => {
    clear(topbar);
    append(topbar, buildTopbar());
  });
  withPreservedInputs(screens, () => {
    clear(screens);
    append(screens, buildScreen());
  });
}

function buildTopbar() {
  /** @type {any[]} */
  const children = [
    el("a", { class: "ss-brand", href: "/games", attrs: { "aria-label": "返回游戏列表" } }, [
      el("span", { class: "ss-brand-mark", text: "◂" }),
      el("span", { class: "ss-brand-text", text: "谍报风云" }),
    ]),
  ];

  if (state.roomId) {
    children.push(
      el("div", { class: "ss-room-chip" }, [
        el("span", { class: "ss-room-chip-label", text: "房间" }),
        el("span", { class: "ss-room-chip-code", text: state.roomId }),
        el("button", {
          class: "ss-icon-btn",
          type: "button",
          title: "复制邀请链接",
          text: "⧉",
          on: { click: () => copyRoomCode() },
        }),
      ]),
      // 对局中也必须能退出：否则玩家只能关标签页，座位移不掉
      el("button", {
        class: "ss-topbar-exit",
        type: "button",
        text: "退出",
        title: "离开房间",
        on: { click: () => confirmLeave() },
      }),
    );
  }

  children.push(
    el("div", {
      id: "ssConnBadge",
      class: `ss-conn${state.connected ? " is-online" : " is-offline"}`,
      text: state.connected ? "实时同步中" : "未连接",
    }),
  );

  return children;
}

async function copyRoomCode() {
  const link = shareUrl(state.roomId);
  const ok = await copyText(link);
  toast(ok ? "邀请链接已复制，发给队友即可" : `复制失败，请手动记录房间码：${state.roomId}`);
}

/**
 * 房间自动释放的倒计时提示（没有期限时返回 null）。
 * @param {import("./room-model.js").Room} room
 * @returns {string | null}
 */
function releaseHintOf(room) {
  const deadline = roomReleaseDeadline(room);
  if (!deadline) return null;
  const left = deadline - Date.now();
  if (left <= 0) return "房间即将自动释放…";
  const minutes = Math.max(1, Math.ceil(left / 60000));
  if (room.phase === "ended") {
    return `对局已结束，房间将在约 ${minutes} 分钟后自动释放，想再来一局请尽快。`;
  }
  return `还差人不齐，房间将在约 ${minutes} 分钟后自动释放。`;
}

function confirmLeave() {
  const inGame = state.room && state.room.phase !== "lobby" && state.room.phase !== "prepare";
  const message = inGame
    ? "对局进行中，离开会移出你的座位（队友可以用「作废本轮」继续）。确定退出吗？"
    : "确定退出房间吗？";
  if (window.confirm(message)) leaveRoom();
}

function buildScreen() {
  if (state.restoring) {
    return el("section", { class: "ss-block ss-block-muted" }, [
      el("div", { class: "ss-awaiting" }, [
        el("span", { class: "ss-pulse" }),
        el("p", { class: "ss-hint", text: "正在恢复上一局…" }),
      ]),
    ]);
  }

  if (!state.roomId || !state.room) {
    return renderEntry({
      nickname: state.nickname,
      healthMax: state.healthMax,
      recentRooms: readRecentRooms(),
      prefillCode: state.prefillCode,
      busy: state.busy,
      notice: state.notice ?? state.wordError ?? null,
      onCreate: () => createRoom(),
      onJoin: (code) => joinRoom(code),
      onOpenRecent: (code) => joinRoom(code),
    });
  }

  const room = state.room;
  const ctx = {
    room,
    uid: state.uid,
    roomId: state.roomId,
    releaseHint: releaseHintOf(room),
    act: (type, payload) => act(type, payload),
    toast,
    copyRoomCode: () => copyRoomCode(),
    confirmLeave: () => confirmLeave(),
    onReroll: () => rerollMyTeam(),
    onRestart: () => restart(),
    draftGuess: state.draftGuess,
    onDraftGuess: (seq) => {
      state.draftGuess = seq;
      render();
    },
  };

  if (room.phase === "ended") {
    return renderEndedScreen(ctx);
  }
  if (room.phase === "lobby" || room.phase === "prepare") {
    return renderRoomScreen(ctx);
  }
  return renderGameScreen(ctx);
}

/**
 * @param {string} message
 * @param {string} [tone]
 */
function toast(message, tone) {
  const node = byId("ssToast");
  if (!node) return;
  node.textContent = message;
  node.className = `ss-toast${tone ? ` is-${tone}` : ""}`;
  node.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    node.hidden = true;
  }, 2800);
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function messageOf(error) {
  if (error instanceof Error) return error.message;
  return String(error ?? "未知错误");
}

// 供 Astro 页面内联脚本访问
/** @type {any} */ (window).QuarkSpySignal = { boot };
