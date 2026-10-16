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

import { createChat } from "./chat.js";
import { append, byId, clear, copyText, withPreservedInputs, el } from "./dom.js";
import {
  AVATAR_COLORS,
  HEALTH_DEFAULT,
  OFFLINE_KICK_MS,
  ROOM_CODE_LENGTH,
  ROOM_CAPACITY,
  createRoomCode,
  createUid,
  extractRoomCode,
  isTeamChatLocked,
  otherTeam,
  sanitizeAvatar,
  sanitizeNickname,
} from "./game-core.js";
import { clampHealth, currentRoles, guessSideOf } from "./room-model.js";
import {
  bindPresence,
  clearChat,
  dispatch,
  forgetRoom,
  getDatabase,
  readRecentRooms,
  reapAbandonedRooms,
  rememberRoom,
  roomReleaseDeadline,
  serverNow,
  watchRoom,
  watchServerClock,
} from "./rtdb.js";
import { attachUnlock, isEnabled as isSoundEnabled, play, setEnabled as setSoundEnabled } from "./sound.js";
import { renderChatDock, focusChatInput, pinChatScroll } from "./views-chat.js";
import { dealWords, isWordPoolReady, loadWords, rerollWords } from "./word-pool.js";
import { modalOptions, readEntryForm, renderEntry, renderModal } from "./views-entry.js";
import { renderGameScreen } from "./views-game.js";
import { renderEndedScreen } from "./views-ended.js";
import { renderRoomScreen } from "./views-room.js";
import { offlineCountdownText } from "./views-shared.js";

const STORAGE_UID = "spySignalUid";
const STORAGE_NICKNAME = "spySignalNickname";
const STORAGE_HEALTH = "spySignalHealth";
const STORAGE_SESSION = "spySignalSession";
const STORAGE_AVATAR_COLOR = "spySignalAvatarColor";
/**
 * 身份来源偏好。**只在用户显式点过"改用…"时才写入**。
 *
 * 早先这里在每次存档时都会写入当前模式，于是"当时还没登录所以算出 manual"
 * 会被当成用户的明确选择记下来；等真的登录了也一直停在手动表单上，
 * 看起来就是"登录了却读不到博客身份"。换一个键名顺便让旧值失效。
 */
const STORAGE_IDENTITY_PREF = "spySignalIdentityPref";

/** URL 参数名：?room=ABC123，便于直接分享邀请链接 */
const ROOM_PARAM = "room";
/** 房间倒计时的刷新间隔与废弃房间扫描间隔 */
const COUNTDOWN_REFRESH_MS = 20000;
const REAP_INTERVAL_MS = 60000;
/** 离线倒计时的文本刷新与超时剔除的巡检节奏 */
const OFFLINE_TICK_MS = 1000;
const OFFLINE_SWEEP_EVERY = 10; // 每 10 次 tick（≈10 秒）扫一次
/**
 * 超时剔除的宽限：`offlineAt` 是服务端时间，和本机时钟可能差几百毫秒，
 * 多等 3 秒可以避免"倒计时刚归零就被踢"这种差一点的体验。
 */
const OFFLINE_GRACE_MS = 3000;

/** 会被明确提示给用户的事务拒绝原因 */
const REJECT_MESSAGES = {
  JOIN: "无法加入：房间不存在、已满员，或对局已经开始",
  CREATE_ROOM: "房间码冲突，请重试",
  START: "还不能开始：需要 4 人齐、两队都已发牌，并且全员准备",
  REROLL: "换词失败，请确认仍在准备阶段",
  SET_HEALTH_MAX: "血量只能在开局前修改",
  RESTART: "只有房主可以在 4 人齐时开新局",
  SWITCH_TEAM: "换队失败：目标队伍已满员，或对局已经开始",
  KICK: "无法移出：只有房主能移出离线玩家，且开局后不再受理",
  GUESS: "提交失败：本轮猜测已经提交或已经结算",
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
  /** @type {boolean} */ clockScheduled: false,
  /** 来自 ?room= 的房间码，用于预填加入框 */
  /** @type {string} */ prefillCode: "",
  /** 聊天控制器：进房时创建，离房时销毁 */
  /** @type {ReturnType<typeof createChat> | null} */ chat: null,
  /**
   * 上一次渲染时房间的指纹。数据完全没变就跳过整屏重建。
   *
   * 命中面不大（真正改了东西的动作都会推进 `updatedAt`，指纹必然不同），
   * 它主要挡的是"重连后把整份数据重推一遍"以及断线 / 上线两次写入落在同一状态
   * 这类噪声 —— 而那些恰好是最容易让整页白闪一下的时机。
   */
  /** @type {string} */ roomKey: "",
  /** @type {number} */ offlineTimer: 0,
  /** @type {number} */ offlineTicks: 0,
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

  // 浏览器要求先有用户手势才允许出声，挂一次性的解锁监听
  attachUnlock();

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

  // 身份可能在别处发生变化，几种情况都要能即时跟上，不必手动刷新：
  //  - 站内模块自己更新（QuarkUserProfile.syncProfile 会派发）
  //  - 在另一个标签页登录 / 退出（storage 事件）
  //  - 从登录页切回来（visibilitychange：auth.astro 是直接写 localStorage 的，不会派发事件）
  const refreshSiteIdentity = () => {
    const next = readSiteIdentity();
    const changed =
      next.hasSiteIdentity !== state.site.hasSiteIdentity ||
      next.nickname !== state.site.nickname ||
      next.avatar.url !== state.site.avatar.url;
    if (!changed) return;
    state.site = next;
    if (!state.roomId) render();
  };
  window.addEventListener("quark-user-updated", refreshSiteIdentity);
  window.addEventListener("storage", (event) => {
    if (!event.key || !["github_user", "qb_user", "quark_login_type", "nickname"].includes(event.key)) {
      return;
    }
    refreshSiteIdentity();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      refreshSiteIdentity();
      // 切回前台时，面板开着的那些未读消息就算已读了
      state.chat?.markRead();
    }
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
  try {
    // 显式偏好：只有走这条路径才记录下来
    window.localStorage.setItem(STORAGE_IDENTITY_PREF, state.identityMode);
  } catch {
    /* 忽略 */
  }
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
    // 地址栏里已经带着邀请码时，点按钮直接进房，不再先弹一个"再填一遍房间码"的框
    onJoinInvite: () => joinRoom(state.prefillCode),
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
  // 有登录身份就默认用它；只有用户显式切到"手动"才坚持手动
  state.identityMode = state.site.hasSiteIdentity
    ? readStored(STORAGE_IDENTITY_PREF) === "manual"
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
    // 注意：这里**不**写 STORAGE_IDENTITY_PREF —— 只有 setIdentityMode() 才代表用户显式选择
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
    startServerClock();
    return state.db;
  } finally {
    state.busy = false;
    render();
  }
}

/**
 * 订阅服务器时钟偏移。
 *
 * `offlineAt` 是服务端时间写的，而"满没满 2 分钟"只能由客户端判断；
 * 本机时钟快几分钟就会误判成已超时、把刚掉线的人当场移出。
 * `.info/serverTimeOffset` 是连接级的，页面生命周期内挂一次就够。
 */
function startServerClock() {
  if (!state.db || state.clockScheduled) return;
  state.clockScheduled = true;
  watchServerClock(state.db);
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
 *
 * 不再接受"加入时选队伍"：分队由座位数自动补齐（人少的一队优先），
 * 进房后在大厅还能随时换队，加入时多问一次只是多一道没必要的关卡。
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
 * 进入房间：订阅 + 在线状态 + 聊天 + 本地记忆。
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
  state.roomKey = "";
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
      // 自己不在这间房的座位上了：被房主移出，或离线超时被剔
      if (state.room && state.room.players[state.uid] && !room.players[state.uid]) {
        handleRemoved(room);
        return;
      }

      const previous = state.room;
      state.room = room;
      // 队内频道跟着自己的队伍走；换队会自动退订旧队伍、订阅新队伍。
      // 停用状态要先同步（它不触发重绘），否则 `setTeam` 那一次重绘会用到上一帧的旧值。
      state.chat?.setTeamLocked(isTeamChatLocked(room.phase));
      state.chat?.setTeam(room.players[state.uid]?.team ?? null);
      announceRoomChange(previous, room);
      maybeDealWords(room);
      sweepOffline();

      // 房间内容完全没变就别重绘（重连重推、同一位置的重复写入）
      const key = roomKeyOf(room);
      if (key === state.roomKey) return;
      state.roomKey = key;
      render();
    },
    (error) => {
      toast(`实时同步中断：${messageOf(error)}`);
    },
  );

  state.presence = bindPresence(state.db, code, state.uid, (connected) => {
    state.connected = connected;
    const badge = byId("ssConnBadge");
    if (!badge) return;
    badge.className = `ss-conn${connected ? " is-online" : " is-offline"}`;
    const text = badge.querySelector(".ss-conn-text");
    if (text) text.textContent = connected ? "实时同步中" : "连接中断，正在重连…";
  });

  // 聊天走自己的一条监听线，回调只重画聊天面板，不惊动整屏
  state.chat = createChat({
    db: state.db,
    roomId: code,
    uid: state.uid,
    describeSelf: () => currentIdentity(),
    onChange: () => renderChat(),
    onNotice: (message) => toast(message),
  });

  startOfflineTimer();
  render();
}

/**
 * 离开房间时统一把"邀请码"这件事收尾。
 *
 * ⚠️ 必须连 `state.prefillCode` 一起清：入口屏的「加入邀请的房间」按钮是拿它直接进房的，
 * 墙上那句邀请提示也是它。只清地址栏的话，"刚被移出房间"的人回到入口屏会看到
 * **自己那间房**的邀请提示，还带着一个一点就重进的按钮。
 * @param {string | null} notice
 */
function backToEntry(notice) {
  clearSession();
  writeRoomParam("");
  state.prefillCode = "";
  state.roomId = "";
  state.room = null;
  state.notice = notice;
  render();
}

function handleRoomGone() {
  leaveRoomWatchers();
  backToEntry("房间已解散。");
}

/**
 * 自己被移出房间（房主手动移出，或离线超过 OFFLINE_KICK_MS 被剔）。
 * 房间本身还在，所以不能走 handleRoomGone（那句"房间已解散"会误导人）。
 * @param {import("./room-model.js").Room} room
 */
function handleRemoved(room) {
  const kick = room.meta?.lastKick;
  const mine = kick && kick.uid === state.uid ? kick : null;

  leaveRoomWatchers();
  backToEntry(
    mine
      ? mine.reason === "timeout"
        ? "你离线超过 2 分钟，已被自动移出房间。"
        : "你已被房主移出房间。"
      : "你已不在房间中。",
  );
  play("kick");
}

async function leaveRoom() {
  const roomId = state.roomId;
  const uid = state.uid;
  const db = state.db;
  leaveRoomWatchers();
  state.draftGuess = [];
  state.modal = null;
  forgetRoom(roomId);
  // 顺带清掉 prefillCode：自己退出的房间不该在入口屏继续挂着"邀请"
  backToEntry(null);

  if (db && roomId) {
    // 显式退出才移除座位；单纯刷新 / 掉线只标记离线，以便原样恢复对局
    try {
      const result = await dispatch(db, roomId, { type: "LEAVE", actorId: uid });
      // 最后一人离开时房间节点被直接删除，聊天是兄弟路径，得跟着一起清掉
      if (!result.room) await clearChat(db, roomId).catch(() => {});
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
  if (state.chat) {
    state.chat.dispose();
    state.chat = null;
  }
  stopOfflineTimer();
  state.roomKey = "";
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
 * 掉线巡检与音效提示
 * ------------------------------------------------------------------ */

/**
 * 房间的稳定指纹，用来判断"这次推送是否真的改了东西"。
 * @param {import("./room-model.js").Room} room
 * @returns {string}
 */
function roomKeyOf(room) {
  return JSON.stringify(room);
}

/**
 * 比较前后两次房间状态，放音效。只在真正相关的变化上响，不做"什么都响一下"。
 * @param {import("./room-model.js").Room | null} previous
 * @param {import("./room-model.js").Room} room
 */
function announceRoomChange(previous, room) {
  if (!previous) return;

  const before = Object.keys(previous.players ?? {});
  const now = Object.keys(room.players ?? {});
  if (now.some((uid) => !before.includes(uid))) play("join");
  else if (before.some((uid) => !now.includes(uid))) play("leave");

  const previousResultAt = previous.roundResult?.at ?? 0;
  const resultAt = room.roundResult?.at ?? 0;
  if (resultAt && resultAt !== previousResultAt) {
    const myTeam = room.players[state.uid]?.team;
    if (room.phase === "ended") {
      play(room.winner && room.winner === myTeam ? "win" : "lose");
    } else if (room.roundResult?.voided) {
      play("void");
    } else if (room.roundResult && room.roundResult.healthLoss > 0 && room.roundResult.turn === myTeam) {
      play("settleBad");
    } else {
      play("settleGood");
    }
    return;
  }

  if (previous.phase === room.phase) return;
  if (room.phase === "select-role") {
    play(previous.phase === "prepare" ? "start" : "turn");
  } else if (needsMyAction(room)) {
    play("turn");
  }
}

/**
 * 当前阶段下"该我出手了吗"：描述者要写暗号、猜测者 / 监听者要提交猜测。
 * @param {import("./room-model.js").Room} room
 * @returns {boolean}
 */
function needsMyAction(room) {
  if (!room.players[state.uid]) return false;
  if (room.phase === "describing") return currentRoles(room).describerId === state.uid;
  if (room.phase !== "guessing") return false;
  const side = guessSideOf(room, state.uid);
  return Boolean(side) && !room.guesses[side];
}

/**
 * 把离线超时的玩家移出房间。
 *
 * 没有服务端定时任务，只能由**在场玩家**顺手做（和房间释放是同一个思路）：
 * 每次巡检只移出一个人，避免同一瞬间并发派发好几个事务；
 * 谁先跑到谁生效，其余人的事务会因为"目标已经不在座"而自动中止，天然幂等。
 */
function sweepOffline() {
  const room = state.room;
  if (!room || !state.db || !state.roomId) return;
  // 踢人只在大厅 / 准备阶段有用：对局中途换人会让词板与角色指派全部失效
  if (room.phase !== "lobby" && room.phase !== "prepare") return;
  // 自己都不在座了就别再帮着踢人
  if (!room.players[state.uid]) return;

  // 用服务器时钟比较（offlineAt 也是服务端时间写的），免得本机时钟偏了就误踢
  const now = serverNow();
  const expired = Object.entries(room.players).find(([, player]) => {
    if (player.online || !player.offlineAt) return false;
    return now - player.offlineAt > OFFLINE_KICK_MS + OFFLINE_GRACE_MS;
  });
  if (!expired) return;

  // silent：多个人同时扫到同一个超时目标时，慢一步的那个会收到事务中止，
  // 那是正常竞争，不该弹"无法移出"吓人
  act("KICK", { targetUid: expired[0], reason: "timeout" }, { silent: true });
}

function startOfflineTimer() {
  stopOfflineTimer();
  state.offlineTicks = 0;
  state.offlineTimer = window.setInterval(() => {
    state.offlineTicks += 1;
    tickOfflineCountdown();
    if (state.offlineTicks % OFFLINE_SWEEP_EVERY === 0) sweepOffline();
  }, OFFLINE_TICK_MS);
}

function stopOfflineTimer() {
  if (state.offlineTimer) {
    window.clearInterval(state.offlineTimer);
    state.offlineTimer = 0;
  }
}

/**
 * 每秒只改倒计时那几行文字，不做整屏重绘 ——
 * 否则每秒重建一次界面，比原来的"抖动"还晃眼。
 */
function tickOfflineCountdown() {
  const room = state.room;
  if (!room) return;
  if (room.phase !== "lobby" && room.phase !== "prepare") return;

  const now = serverNow();
  for (const [uid, player] of Object.entries(room.players)) {
    if (player.online || !player.offlineAt) continue;
    const node = byId(`ssOffline-${uid}`);
    if (!node) continue;
    node.textContent = offlineCountdownText(player.offlineAt + OFFLINE_KICK_MS - now);
  }
}

/**
 * 房主手动移出离线玩家（自动超时那条路不需要确认）。
 * @param {string} targetUid
 * @param {string} name
 */
function confirmKick(targetUid, name) {
  const ok = window.confirm(`把「${name}」移出房间？对方离线后一直没回来。`);
  if (!ok) return;
  act("KICK", { targetUid, reason: "manual" });
}

/* ------------------------------------------------------------------ *
 * 动作派发
 * ------------------------------------------------------------------ */

/**
 * 派发一个动作。
 *
 * 返回值是"事务是否真的提交了"：视图层靠它决定要不要把用户刚填的东西还回去
 * （例如情报板笔记被拒时把文字塞回输入框）。被拒时的提示文案仍由这里统一负责。
 *
 * @param {string} type
 * @param {Record<string, unknown>} [payload]
 * @param {{ silent?: boolean }} [options] silent：事务被中止时不弹提示（后台巡检用）
 * @returns {Promise<boolean>}
 */
async function act(type, payload, options) {
  if (!state.db || !state.roomId) return false;
  const silent = options?.silent === true;
  try {
    const result = await dispatch(state.db, state.roomId, {
      type,
      actorId: state.uid,
      payload,
    });
    if (!result.committed && !silent && REJECT_MESSAGES[type]) {
      toast(REJECT_MESSAGES[type]);
    }
    return result.committed === true;
  } catch (error) {
    if (!silent) toast(`操作失败：${messageOf(error)}`);
    return false;
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

  // 整屏是 clear + 重建：视口与滚动位置会被顶回去，先记下来、渲染完还回去。
  // 不加这一步时，任何一次状态刷新都会让正在往下看的玩家被弹回原处。
  const scrollY = window.scrollY;

  withPreservedInputs(topbar, () => {
    clear(topbar);
    append(topbar, buildTopbar());
  });
  withPreservedInputs(screens, () => {
    clear(screens);
    append(screens, buildScreen());
  });
  renderModalHost();
  renderChat();

  window.scrollTo(0, scrollY);
}

/**
 * 聊天停靠区。
 *
 * 单独渲染在 `#ssChat` 里（与 `#ssModals` 同理）：它既不能被 `#ssScreens` 的重绘
 * 波及，也不该在每次房间刷新时重建整屏 —— 聊天自己那条监听线只调这个函数。
 */
function renderChat() {
  const host = byId("ssChat");
  if (!host) return;

  const chat = state.chat;
  if (!chat || !state.roomId || !state.room) {
    clear(host);
    return;
  }

  const myTeam = state.room.players[state.uid]?.team ?? null;

  withPreservedInputs(host, () => {
    clear(host);
    append(host, renderChatDock({
      open: chat.state.open,
      tab: chat.state.tab,
      team: myTeam,
      teamLabel: myTeam ? `${myTeam} 队` : null,
      teamLocked: chat.state.teamLocked,
      channels: chat.state.channels,
      uid: state.uid,
      playerCount: Object.keys(state.room?.players ?? {}).length,
      noticeOpen: chat.state.noticeOpen,
      onToggle: () => chat.toggle(),
      onTab: (channel) => chat.setTab(channel),
      onToggleNotice: (isOpen) => {
        // 只记状态，不重绘：<details> 自己已经切换好了
        chat.state.noticeOpen = isOpen;
      },
      // 返回"是否受理"给视图：被拒绝时视图要把草稿还回输入框
      onSend: (text) => chat.send(text),
    }));
  });

  pinChatScroll(host);
  if (chat.state.open && chat.consumeFocusRequest()) focusChatInput(host);
}

/**
 * 上一次渲染出来的对话框种类，用来判断是否需要重建。
 * 初值刻意是个不可能等于 `state.modal ?? ""` 的哨兵值，
 * 好让首次渲染走一遍完整流程（而不是被"没变化"提前短路）。
 */
let renderedModal = " ";

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

  // 自定义光标是个 z-index:9999 的元素，而原生 dialog 在 top layer，
  // 层级高于任何 z-index —— 光标会被对话框和遮罩盖住，
  // 偏偏 cursor-trail.js 又注入了 `* { cursor: none !important }`，
  // 结果是整个屏幕都看不见光标、只能盲点。开着对话框时把原生的还回来。
  document.body.classList.toggle("ss-modal-open", Boolean(key));

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
    // 状态点 + 文字：窄屏只留点（顶栏挤不下时文字会一个字一行地竖排）
    el(
      "div",
      {
        id: "ssConnBadge",
        class: `ss-conn${state.connected ? " is-online" : " is-offline"}`,
      },
      [
        el("i", { class: "ss-conn-dot", attrs: { "aria-hidden": "true" } }),
        el("span", { class: "ss-conn-text", text: state.connected ? "实时同步中" : "未连接" }),
      ],
    ),
  );

  // 音效开关放在最右（`.ss-conn` 的 margin-left:auto 会自动把这一组推到边上）。
  // 它在所有屏都常驻：对局里的回合/结算音效也归它管，不只管聊天。
  const soundOn = isSoundEnabled();
  children.push(
    el("button", {
      class: `ss-sound-btn${soundOn ? " is-on" : ""}`,
      type: "button",
      title: soundOn ? "关闭音效" : "开启音效",
      text: soundOn ? "🔊" : "🔇",
      attrs: { "aria-label": soundOn ? "关闭音效" : "开启音效" },
      on: {
        click: () => {
          // 先切换再试听，开着的时候点一下能立刻听到确认音
          const next = setSoundEnabled(!isSoundEnabled());
          if (next) play("message");
          render();
        },
      },
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
    onSwitchTeam: (team) => act("SWITCH_TEAM", { team }),
    onKick: (targetUid, name) => confirmKick(targetUid, name),
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
