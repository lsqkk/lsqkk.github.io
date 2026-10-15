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
  AVATAR_COLORS,
  HEALTH_DEFAULT,
  ROOM_CODE_LENGTH,
  ROOM_CAPACITY,
  createRoomCode,
  createUid,
  extractRoomCode,
  otherTeam,
  sanitizeAvatar,
  sanitizeNickname,
} from "./game-core.js";
import { clampHealth } from "./room-model.js";
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
import { modalOptions, readEntryForm, renderEntry, renderModal } from "./views-entry.js";
import { renderGameScreen } from "./views-game.js";
import { renderEndedScreen } from "./views-ended.js";
import { renderRoomScreen } from "./views-room.js";

const STORAGE_UID = "spySignalUid";
const STORAGE_NICKNAME = "spySignalNickname";
const STORAGE_HEALTH = "spySignalHealth";
const STORAGE_SESSION = "spySignalSession";
const STORAGE_AVATAR_COLOR = "spySignalAvatarColor";
const STORAGE_IDENTITY_MODE = "spySignalIdentityMode";

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
  /** 站点登录身份（可能不存在） */
  /** @type {{ hasSiteIdentity: boolean, nickname: string, avatar: { type: string, color: string, url: string }, login: string }} */
  site: { hasSiteIdentity: false, nickname: "", avatar: { type: "color", color: AVATAR_COLORS[0], url: "" }, login: "" },
  /** @type {"site" | "manual"} */ identityMode: "manual",
  /** @type {string} */ manualNickname: "",
  /** @type {string} */ manualColor: AVATAR_COLORS[0],
  /** 当前弹出的对话框：创建 / 加入 */
  /** @type {"create" | "join" | null} */ modal: null,
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
    // 别人分享来的邀请链接：走"填昵称 → 点加入房间"，不跳回自己上一局，
    // 避免旧会话把邀请链接劫走。
    //
    // 这里刻意不自动弹加入对话框：昵称输入框在对话框之外，
    // 一旦弹窗它就是 inert 的，昵称还没填的人会被卡住。
    // 房间码留在入口页的邀请提示里，点「加入房间」时会自动带进对话框。
    clearSession();
    render();
    focusEntryNickname();
  } else {
    // 没有邀请参数，或邀请的正是自己正在玩的那间房（刷新场景）→ 恢复对局
    restoreSession(session);
  }

  // 在别处登录 / 退出后，入口屏的身份区要跟着更新
  window.addEventListener("quark-user-updated", () => {
    state.site = readSiteIdentity();
    if (!state.roomId) render();
  });

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
    return extractRoomCode(window.location.search);
  } catch {
    return "";
  }
}

/**
 * 切换"用博客身份 / 手动填写"。切到手动时带出博客昵称，省得重新打。
 * @param {"site" | "manual"} mode
 */
function setIdentityMode(mode) {
  state.identityMode = mode === "manual" ? "manual" : "site";
  if (state.identityMode === "manual" && !state.manualNickname && state.site.nickname) {
    state.manualNickname = state.site.nickname;
  }
  persistIdentity();
  render();
  if (state.identityMode === "manual") {
    const input = /** @type {any} */ (byId("ssNickname"));
    if (input) input.focus();
  }
}

/**
 * @param {string} color
 */
function setManualColor(color) {
  if (AVATAR_COLORS.includes(color)) {
    state.manualColor = color;
    persistIdentity();
  }
  render();
}

/**
 * 入口屏的渲染参数（屏幕与对话框共用同一份，避免两处不一致）。
 * @returns {any}
 */
function currentEntryOptions() {
  return {
    identity: {
      mode: state.identityMode,
      hasSiteIdentity: state.site.hasSiteIdentity,
      siteNickname: state.site.nickname,
      siteAvatar: state.site.avatar,
      manualNickname: state.manualNickname,
      manualColor: state.manualColor,
    },
    preview: currentIdentity(),
    healthMax: state.healthMax,
    modal: state.modal,
    prefillCode: state.prefillCode,
    recentRooms: readRecentRooms(),
    busy: state.busy,
    notice: state.notice ?? state.wordError ?? null,
    onCreate: () => createRoom(),
    onJoin: (value) => joinRoom(value),
    onOpenRecent: (code) => joinRoom(code),
    onOpenModal: (kind) => openModal(kind),
    onCloseModal: () => closeModal(),
    onToggleIdentityMode: (mode) => setIdentityMode(mode),
    onManualNickname: (name) => {
      state.manualNickname = name;
    },
    onManualColor: (color) => setManualColor(color),
    onHealthChange: (value) => setHealthMax(value),
  };
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
  state.manualNickname = readStored(STORAGE_NICKNAME) ?? "";
  const savedHealth = Number(readStored(STORAGE_HEALTH));
  if (Number.isFinite(savedHealth) && savedHealth > 0) state.healthMax = savedHealth;
  const savedColor = readStored(STORAGE_AVATAR_COLOR);
  if (savedColor && AVATAR_COLORS.includes(savedColor)) state.manualColor = savedColor;

  state.site = readSiteIdentity();
  // 有登录身份就默认用它；显式选过"手动"才坚持手动
  state.identityMode = state.site.hasSiteIdentity
    ? readStored(STORAGE_IDENTITY_MODE) === "manual"
      ? "manual"
      : "site"
    : "manual";
  state.nickname = currentIdentity().nickname;
  state.uid = resolveUid();
}

/**
 * @param {string} key
 * @returns {string | null}
 */
function readStored(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * 读取站点登录身份（夸克博客的 GitHub / 站内账号）。
 * 复用全站统一的 `QuarkUserProfile`，它已经处理好了"登录用哪个昵称/头像、
 * 未登录用本地昵称/颜色"的优先级，这里不重复造一套。
 * @returns {{ hasSiteIdentity: boolean, nickname: string, avatar: { type: string, color: string, url: string }, login: string }}
 */
function readSiteIdentity() {
  const empty = {
    hasSiteIdentity: false,
    nickname: "",
    avatar: { type: "color", color: AVATAR_COLORS[0], url: "" },
    login: "",
  };

  const api = /** @type {any} */ (window).QuarkUserProfile;
  if (!api || typeof api.getProfile !== "function") return empty;

  let profile = null;
  try {
    profile = api.getProfile();
  } catch {
    return empty;
  }
  if (!profile) return empty;

  const nickname = String(profile.nickname ?? "").trim();
  const login = String(profile.login ?? "").trim();
  if (!nickname && !login) return empty;

  return {
    hasSiteIdentity: true,
    // 昵称优先，没有昵称就用登录名兜底
    nickname: nickname || login,
    avatar: sanitizeAvatar({
      type: profile.avatarType,
      color: profile.avatarColor,
      url: profile.avatarUrl,
    }),
    login,
  };
}

/**
 * 当前生效的身份（昵称 + 头像），供预览与入座共用。
 * @returns {{ nickname: string, avatar: { type: string, color: string, url: string } }}
 */
function currentIdentity() {
  if (state.identityMode === "site" && state.site.hasSiteIdentity) {
    return { nickname: state.site.nickname, avatar: state.site.avatar };
  }
  return {
    nickname: sanitizeNickname(state.manualNickname),
    avatar: { type: "color", color: state.manualColor, url: "" },
  };
}

/**
 * 玩家 uid：优先用全站统一身份（登录后跨设备认得出是同一个人），
 * 否则退回本页自己持久化的匿名 uid。
 * @returns {string}
 */
function resolveUid() {
  const api = /** @type {any} */ (window).QuarkUserProfile;
  if (api && typeof api.getUid === "function") {
    try {
      const uid = String(api.getUid() ?? "").trim();
      if (uid) return uid;
    } catch {
      /* 落到下面的兜底 */
    }
  }

  let uid = readStored(STORAGE_UID) ?? "";
  if (!uid) {
    uid = createUid();
    try {
      window.localStorage.setItem(STORAGE_UID, uid);
    } catch {
      /* 隐私模式下不可写则用内存里的临时身份 */
    }
  }
  return uid;
}

function persistIdentity() {
  const identity = currentIdentity();
  state.nickname = identity.nickname;
  try {
    window.localStorage.setItem(STORAGE_IDENTITY_MODE, state.identityMode);
    window.localStorage.setItem(STORAGE_AVATAR_COLOR, state.manualColor);
    window.localStorage.setItem(STORAGE_HEALTH, String(state.healthMax));
    if (state.manualNickname) window.localStorage.setItem(STORAGE_NICKNAME, state.manualNickname);
  } catch {
    /* 忽略写入失败 */
  }
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
  const identity = applyEntryForm(form);
  if (!identity) return;

  try {
    state.busy = true;
    render();
    const db = await ensureDb();

    // 房间码冲突时换一个重试（随机量级极大，正常情况下一次成功）
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = createRoomCode();
      const result = await dispatch(db, code, {
        type: "CREATE_ROOM",
        actorId: state.uid,
        payload: { name: identity.nickname, healthMax: state.healthMax, avatar: identity.avatar },
      });
      if (result.committed) {
        enterRoom(code, identity.nickname);
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
 * 把表单里的选择并入身份状态并持久化。
 * 手动模式下昵称为空会提示并聚焦，返回 null。
 * @param {ReturnType<typeof readEntryForm>} form
 * @returns {{ nickname: string, avatar: { type: string, color: string, url: string } } | null}
 */
function applyEntryForm(form) {
  if (state.identityMode === "manual") {
    state.manualNickname = sanitizeNickname(form.nickname);
    if (form.avatarColor) state.manualColor = form.avatarColor;
  }

  const identity = currentIdentity();
  if (!identity.nickname) {
    toast("请先填写昵称");
    const input = /** @type {any} */ (byId("ssNickname"));
    if (input) input.focus();
    return null;
  }
  persistIdentity();
  return identity;
}

/**
 * 从入口屏加入房间。
 * 输入既可以是纯房间码，也可以是整条邀请链接（自动取 `?room=`）。
 * @param {string} rawValue
 */
async function joinRoom(rawValue) {
  const form = readEntryForm();
  const identity = applyEntryForm(form);
  if (!identity) return;

  // 是链接但没带房间码时给更明确的提示，而不是笼统地说"格式不对"
  const looksLikeLink = /^[a-z][a-z0-9+.-]*:/i.test(rawValue.trim()) || rawValue.includes("/");
  const code = extractRoomCode(rawValue);
  if (!code) {
    toast(looksLikeLink ? "这条链接里没有找到房间码" : "请输入房间码");
    return;
  }
  if (code.length !== ROOM_CODE_LENGTH) {
    toast(`房间码应为 ${ROOM_CODE_LENGTH} 位，当前识别到 ${code.length} 位：${code}`);
    return;
  }

  try {
    state.busy = true;
    render();
    const ok = await joinRoomInternal(code, identity.nickname, identity.avatar);
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
 * @param {{ type: string, color: string, url: string }} [avatar]
 * @returns {Promise<boolean>}
 */
async function joinRoomInternal(code, nickname, avatar) {
  const db = await ensureDb();
  const result = await dispatch(db, code, {
    type: "JOIN",
    actorId: state.uid,
    payload: {
      name: sanitizeNickname(nickname) || "匿名特工",
      ...(avatar ? { avatar } : {}),
    },
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
  state.modal = null;
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
  state.modal = null;
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
  renderModalHost();
}

/** 上一次渲染出来的对话框种类，用来判断是否需要重建 */
let renderedModal = " ";

/**
 * 对话框单独渲染在一个容器里。
 *
 * 刻意与 `#ssScreens` 分开：入口屏会因为昵称输入等原因重绘，
 * 如果对话框跟着重建，正在输入的房间码就会被清掉、焦点也会丢。
 * 只有"该弹哪个框"真正变化时才重建它。
 */
function renderModalHost() {
  const host = byId("ssModals");
  if (!host) return;

  const key = state.modal ?? "";
  if (key === renderedModal) {
    // 结构不变，只同步提交按钮的忙碌状态
    const submit = byId("ssModalSubmit");
    if (submit) submit.disabled = state.busy;
    return;
  }
  renderedModal = key;

  const existing = /** @type {any} */ (host.querySelector("dialog"));
  if (existing && existing.open) existing.close();
  clear(host);
  if (!key) return;

  const dialog = /** @type {any} */ (renderModal(modalOptions(currentEntryOptions())));
  if (!dialog) return;
  append(host, dialog);

  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");

  if (key === "join") {
    const input = /** @type {any} */ (byId("ssJoinCode"));
    if (input) {
      input.focus();
      if (typeof input.select === "function") input.select();
    }
  }
}

/**
 * 打开对话框。
 *
 * 手动模式下昵称是必填项 —— 先在入口页提示，别让人在弹窗里绕一圈再被打回来。
 * @param {"create" | "join"} kind
 */
function openModal(kind) {
  if (state.identityMode === "manual" && !currentIdentity().nickname) {
    toast("请先填写昵称");
    const input = /** @type {any} */ (byId("ssNickname"));
    if (input) input.focus();
    return;
  }
  state.modal = kind;
  render();
}

function closeModal() {
  state.modal = null;
  render();
}

/**
 * @param {number} value
 */
function setHealthMax(value) {
  state.healthMax = clampHealth(value);
  persistIdentity();
  render();
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
    return renderEntry(currentEntryOptions());
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
