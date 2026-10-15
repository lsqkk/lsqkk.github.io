// @ts-check
/**
 * 「谍报风云」房间聊天室的控制器。
 *
 * 两个频道：
 * - `room` 公共房间聊天，4 个人都看得到；
 * - `team` 队内私聊，只有自己队那两个人看得到 —— 靠**分开的 RTDB 路径**实现
 *   （客户端根本不订阅对方队伍的节点），而不是"同一个列表按字段过滤"。
 *
 * 本文件只管：订阅、未读 / 打开 / 当前频道这点状态、发送限流、新消息提醒
 * （红点 + 提示音）。绘制在 `views-chat.js`，网络在 `rtdb.js`，音效在 `sound.js`。
 *
 * 聊天监听器与房间监听器是**两条独立的线**：`onChange` 只重画聊天面板，
 * 不触发整屏 `render()`，因此别人说话不会让对局界面重排。
 */

import { CHAT_MIN_INTERVAL_MS, sanitizeChatText } from "./game-core.js";
import { sendChatMessage, watchChat } from "./rtdb.js";
import { play } from "./sound.js";

/** @typedef {"room" | "team"} Channel */

/**
 * @param {any} list
 * @returns {{ id: string, value: any }[]}
 */
function sortMessages(list) {
  return list
    .slice()
    .sort((a, b) => (Number(a.value?.at) || 0) - (Number(b.value?.at) || 0));
}

/**
 * @param {{
 *   db: any,
 *   roomId: string,
 *   uid: string,
 *   describeSelf: () => { nickname: string, avatar: { type: string, color: string, url: string } },
 *   onChange: () => void,
 *   onNotice: (message: string) => void,
 * }} options
 */
export function createChat(options) {
  const { db, roomId, uid, describeSelf, onChange, onNotice } = options;

  const state = {
    open: false,
    /** @type {Channel} */ tab: "room",
    /** 注意事项默认展开，用户折叠后重绘不再弹开 */
    noticeOpen: true,
    /** 刚被打开时置位，由渲染方消费一次用来聚焦输入框 */
    focusPending: false,
    /** @type {number} */
    lastSentAt: 0,
    /** @type {"A" | "B" | null} */ team: null,
    channels: {
      room: { /** @type {{ id: string, value: any }[]} */ messages: [], unread: 0, seeded: false },
      team: { /** @type {{ id: string, value: any }[]} */ messages: [], unread: 0, seeded: false },
    },
  };

  /** 每个频道已见过的消息 id，用来只对"新来的"消息做未读与响铃 */
  /** @type {Record<Channel, Set<string>>} */
  const knownIds = { room: new Set(), team: new Set() };

  let disposed = false;
  /** @type {(() => void) | null} */
  let stopRoom = null;
  /** @type {(() => void) | null} */
  let stopTeam = null;

  /**
   * 订阅一个频道。
   * @param {Channel} channel
   * @param {"A" | "B" | null} team
   */
  function subscribe(channel, team) {
    return watchChat(
      db,
      roomId,
      (list) => {
        if (disposed) return;
        const bucket = state.channels[channel];
        const sorted = sortMessages(list);
        const fresh = bucket.seeded
          ? sorted.filter((item) => !knownIds[channel].has(item.id) && item.value?.uid !== uid)
          : [];
        knownIds[channel] = new Set(sorted.map((item) => item.id));
        bucket.seeded = true;
        bucket.messages = sorted;

        if (fresh.length > 0) {
          // 正在看这个频道、窗口也在前台，才算"已读"；否则攒进红点
          const watching = state.open && state.tab === channel && !document.hidden;
          if (!watching) bucket.unread += fresh.length;
          play("message");
        }
        onChange();
      },
      () => {
        /* 聊天读不到不影响对局，安静降级：面板显示"还没有人说话" */
      },
      channel,
      team,
    );
  }

  stopRoom = subscribe("room", null);

  /**
   * 跟随自己的队伍切换队内频道。换队后会自动退订旧队伍、订阅新队伍，
   * 于是旧队伍的聊天记录既不会被显示，也不会留在内存里。
   * @param {"A" | "B" | null} team
   */
  function setTeam(team) {
    const next = team === "B" ? "B" : team === "A" ? "A" : null;
    if (next === state.team) return;
    state.team = next;
    if (stopTeam) {
      stopTeam();
      stopTeam = null;
    }
    // 换了队伍，旧队伍的未读与历史都不再属于自己
    state.channels.team = { messages: [], unread: 0, seeded: false };
    knownIds.team = new Set();
    if (state.tab === "team" && !next) state.tab = "room";
    if (next) stopTeam = subscribe("team", next);
    onChange();
  }

  const onKeydown = (/** @type {KeyboardEvent} */ event) => {
    if (event.key === "Escape" && state.open) close();
  };
  document.addEventListener("keydown", onKeydown);

  function open() {
    if (state.open) return;
    state.open = true;
    markTabRead(state.tab);
    state.focusPending = true;
    onChange();
  }

  function close() {
    if (!state.open) return;
    state.open = false;
    onChange();
  }

  function toggle() {
    if (state.open) close();
    else open();
  }

  /**
   * @param {Channel} channel
   */
  function markTabRead(channel) {
    const bucket = state.channels[channel];
    if (bucket.unread !== 0) bucket.unread = 0;
  }

  /**
   * @param {Channel} tab
   */
  function setTab(tab) {
    const next = tab === "team" ? "team" : "room";
    if (next === state.tab) return;
    state.tab = next;
    markTabRead(next);
    // 切频道时输入框里的草稿没有意义，交给重绘清空
    state.focusPending = true;
    onChange();
  }

  /** 窗口重新获得焦点时清掉当前频道的红点。 */
  function markRead() {
    if (!state.open) return;
    const bucket = state.channels[state.tab];
    if (bucket.unread === 0) return;
    markTabRead(state.tab);
    onChange();
  }

  /**
   * 取用"该聚焦输入框"的信号（只会为 true 一次）。
   * @returns {boolean}
   */
  function consumeFocusRequest() {
    if (!state.focusPending) return false;
    state.focusPending = false;
    return true;
  }

  /**
   * 往当前频道发一条消息。
   * @param {string} rawText
   * @returns {Promise<void>}
   */
  async function send(rawText) {
    const text = sanitizeChatText(rawText);
    if (!text) return;

    const channel = state.tab;
    const team = state.team;
    if (channel === "team" && !team) {
      onNotice("还没有分队，暂时发不了队内消息");
      return;
    }

    const now = Date.now();
    if (now - state.lastSentAt < CHAT_MIN_INTERVAL_MS) {
      onNotice("发得太快了，缓一下再发");
      return;
    }
    state.lastSentAt = now;

    const self = describeSelf();
    try {
      await sendChatMessage(
        db,
        roomId,
        {
          uid,
          name: self.nickname || "匿名特工",
          text,
          avatarType: self.avatar.type,
          avatarColor: self.avatar.color,
          avatarUrl: self.avatar.url,
          at: now,
        },
        channel,
        team,
      );
    } catch (error) {
      onNotice(`消息发送失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function dispose() {
    disposed = true;
    document.removeEventListener("keydown", onKeydown);
    if (stopRoom) {
      stopRoom();
      stopRoom = null;
    }
    if (stopTeam) {
      stopTeam();
      stopTeam = null;
    }
  }

  return { state, setTeam, setTab, open, close, toggle, markRead, consumeFocusRequest, send, dispose };
}
