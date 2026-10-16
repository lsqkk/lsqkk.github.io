// @ts-check
/**
 * 「谍报风云」房间聊天室的控制器。
 *
 * 两个频道：
 * - `room` 公共房间聊天，4 个人都看得到；
 * - `team` 队内私聊，只有自己队那两个人看得到 —— 靠**分开的 RTDB 路径**实现
 *   （客户端根本不订阅对方队伍的节点），而不是"同一个列表按字段过滤"。
 *
 * 本文件只管：订阅、未读 / 已读这点状态、发送限流、新消息提醒（红点 + 提示音）。
 * 绘制在 `views-chat.js`，网络在 `rtdb.js`，音效在 `sound.js`。
 *
 * 聊天监听器与房间监听器是**两条独立的线**：`onChange` 只重画聊天面板，
 * 不触发整屏 `render()`，因此别人说话不会让对局界面重排。
 *
 * ## 已读与"新消息"标记（很容易做错，单列出来）
 *
 * 红点（`unread`）按常规语义走：打开面板 / 切到该频道 / 自己发言就算已读，清零。
 *
 * 但**"清零"不等于"玩家真的看见了"**：早先的规则里还有一条
 * "窗口重新可见时立刻清红点"，于是玩家切到别的标签页、有人说话（响了铃但他没听见），
 * 切回来的一瞬间红点就被清掉了 —— 从玩家的角度看就是"有时候根本没提醒我"。
 * 现在窗口重新可见**不再**动红点，只有玩家在页面上的动作才算数。
 *
 * 另外，清零时会把"新消息从哪一条开始"记进 `markerId`（见 `markTabRead`），
 * 面板据此画一条"以下是 N 条新消息"的分隔线。这条线是**给"打开面板就等于读过了"打的补丁**：
 * 清红点让面板不像卡住，分隔线负责说清刚才来的是哪几条。
 * 它只在玩家真的碰了面板（`acknowledge()`）时才收掉。
 *
 * 提示音与红点分开判定：红点只在"没在看"时累积，**铃声则每条别人的消息都响** ——
 * 看漏一条消息的代价远大于多响一声。
 */

import { CHAT_MIN_INTERVAL_MS, freshMessages, sanitizeChatText } from "./game-core.js";
import { sendChatMessage, watchChat } from "./rtdb.js";
import { play } from "./sound.js";

/** @typedef {"room" | "team"} Channel */

/**
 * 一个频道的本地状态。
 *
 * - `messages`：最近一段记录（读取窗口最多 `CHAT_HISTORY` 条）；
 * - `unread`：红点上的数字；
 * - `seeded`：是否已经用第一帧数据播种过（进房时墙上已有的记录不算"新消息"）；
 * - `markerId`：上次清零红点时"第一条没看过的消息"的 id，面板据此画分隔线。
 *   记 id 而不是下标：读取窗口是滑动的，老消息会被挤出去，下标会跟着漂。
 * @returns {{ messages: { id: string, value: any }[], unread: number, seeded: boolean, markerId: string | null }}
 */
function chatBucket() {
  return { messages: [], unread: 0, seeded: false, markerId: null };
}

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
    /**
     * 队内频道是否被规则停用（描述 / 猜测阶段，见 `game-core.js` 的 `isTeamChatLocked`）。
     * 由控制器在每次房间更新时同步进来，本文件不自己去问房间状态。
     */
    teamLocked: false,
    channels: {
      room: chatBucket(),
      team: chatBucket(),
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
        // 首次回调只用来"播种"：进房时墙上已有的记录不是新消息，不该让刚坐下的人被一串铃轰炸
        const fresh = bucket.seeded ? freshMessages(sorted, knownIds[channel], uid) : [];
        knownIds[channel] = new Set(sorted.map((item) => item.id));
        bucket.seeded = true;
        bucket.messages = sorted;

        if (fresh.length > 0) {
          // 正在看这个频道、窗口也在前台，才算"已读"；否则攒进红点。
          // 注意这里**不**再看 `document.hidden` 决定要不要响铃 —— 铃是单独的判定。
          const watching = state.open && state.tab === channel && !document.hidden;
          if (!watching) bucket.unread += fresh.length;
          play(channel === "team" ? "teamMessage" : "message");
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
   *
   * ⚠️ `null` 一律当作"这次推送没读到我的队伍"处理，**不动现有订阅**。
   * `main.js` 每次房间更新都会调这里，而 `normalizeRoom()` 会把没有 `joinedAt` 的
   * 幽灵座位过滤掉、`bindPresence()` 又可能先一步写出 `players/{uid}` ——
   * 于是会出现"某一帧里我的座位上没有人"。早先这里会把队伍降成 null，
   * 顺手退订队内频道并清空未读，下一帧再订回来，期间队友说的话就变成了"历史记录"，
   * 既不响铃也不给红点（表现正是"通知时有时无"）。
   * @param {"A" | "B" | null} team
   */
  function setTeam(team) {
    const next = team === "B" ? "B" : team === "A" ? "A" : null;
    if (!next || next === state.team) return;
    state.team = next;
    if (stopTeam) {
      stopTeam();
      stopTeam = null;
    }
    // 换了队伍，旧队伍的未读与历史都不再属于自己
    state.channels.team = chatBucket();
    knownIds.team = new Set();
    stopTeam = subscribe("team", next);
    onChange();
  }

  const onKeydown = (/** @type {KeyboardEvent} */ event) => {
    if (event.key === "Escape" && state.open) close();
  };
  document.addEventListener("keydown", onKeydown);

  function open() {
    if (state.open) return;
    state.open = true;
    // 打开就算已读：面板里那几条新消息就在眼前，红点再挂着反而像卡住了。
    // 但清零时记下起点，面板会画一条"以下是 N 条新消息"。
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
   * 把某个频道的未读清零，顺手记下"第一条没看过的消息"。
   * @param {Channel} channel
   */
  function markTabRead(channel) {
    const bucket = state.channels[channel];
    if (bucket.unread === 0) return;
    bucket.markerId = bucket.messages[bucket.messages.length - bucket.unread]?.id ?? null;
    bucket.unread = 0;
  }

  /**
   * 玩家真的看了这个面板（点了一下里面的东西）：连"以下是 N 条新消息"一起收掉。
   *
   * 红点本身多半已经被 `open()` / `setTab()` 清掉了，这里主要管分隔线。
   * @returns {void}
   */
  function acknowledge() {
    const bucket = state.channels[state.tab];
    if (bucket.unread === 0 && !bucket.markerId) return;
    bucket.unread = 0;
    bucket.markerId = null;
    onChange();
  }

  /**
   * 同步"队内频道此刻是否被规则停用"。
   *
   * 刻意**不触发 onChange**：调用方（`main.js`）紧接着就会因为房间变化自己重绘，
   * 这里再回调一次只会多画一帧。停用期间如果正停在队内页签上，顺手切回公共频道。
   * @param {boolean} locked
   */
  function setTeamLocked(locked) {
    const next = locked === true;
    if (next === state.teamLocked) return;
    state.teamLocked = next;
    if (next && state.tab === "team") {
      state.tab = "room";
      markTabRead("room");
    }
  }

  /**
   * @param {Channel} tab
   */
  function setTab(tab) {
    const next = tab === "team" ? "team" : "room";
    if (next === "team" && state.teamLocked) {
      onNotice("本轮暗号已发出，队内私聊暂停，请在公共频道说。");
      play("denied");
      return;
    }
    if (next === state.tab) {
      // 点已经选中的页签也算"我在看这个频道"，顺手清掉未读
      acknowledge();
      return;
    }
    state.tab = next;
    markTabRead(next);
    // 切频道时输入框里的草稿没有意义，交给重绘清空
    state.focusPending = true;
    play("toggle");
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
   *
   * 返回的是**同步**的"这条消息被受理了吗"：被规则拒绝（没分队 / 队内已停用）或被限流时
   * 返回 false。调用方（`views-chat.js`）会先把输入框清空再调这里（重绘会把输入框换成新节点，
   * 顺序反过来就清不掉），拿到 false 时再把草稿还回去 —— 否则字被清掉又没发出去，
   * 人会以为是自己按丢了。
   *
   * 真正的写入是异步的：写失败只提示，不再往输入框里塞回去（那时输入框多半已经重绘过了，
   * 而"发到一半失败"把整句话丢回输入框，反而更让人摸不着头脑）。
   *
   * @param {string} rawText
   * @returns {boolean}
   */
  function send(rawText) {
    const text = sanitizeChatText(rawText);
    if (!text) return false;

    const channel = state.tab;
    const team = state.team;
    if (channel === "team" && !team) {
      onNotice("还没有分队，暂时发不了队内消息");
      play("denied");
      return false;
    }
    // 描述 / 猜测阶段队内频道是关闭的：描述者已经拿到数字卡，
    // 队内频道能发言就等于可以隔空把答案念给猜测者听。
    if (channel === "team" && state.teamLocked) {
      onNotice("本轮暗号已发出，队内私聊暂停，请在公共频道说。");
      play("denied");
      return false;
    }

    const now = Date.now();
    if (now - state.lastSentAt < CHAT_MIN_INTERVAL_MS) {
      onNotice("发得太快了，缓一下再发");
      play("denied");
      return false;
    }
    state.lastSentAt = now;
    // 自己发完话，这条频道就是"我正在看"的：未读与"以下是 N 条新消息"一起收掉
    acknowledge();

    const self = describeSelf();
    sendChatMessage(
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
    ).catch((error) => {
      onNotice(`消息发送失败：${error instanceof Error ? error.message : String(error)}`);
      play("denied");
    });
    return true;
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

  return {
    state,
    setTeam,
    setTeamLocked,
    setTab,
    open,
    close,
    toggle,
    acknowledge,
    consumeFocusRequest,
    send,
    dispose,
  };
}
