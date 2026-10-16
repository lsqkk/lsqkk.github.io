// @ts-check
/**
 * 「谍报风云」房间聊天室的界面部件。
 *
 * 只有两个东西：右下角的圆形入口按钮（带未读红点）和点开后浮在上面的面板。
 * 面板里有「房间」与「X 队」两个频道页签，各自带自己的未读小点。
 *
 * 刻意**不用原生 `<dialog>`**：`<dialog>` 渲染在 top layer，层级高于任何 z-index，
 * 会把站点自定义光标（`cursor-trail.js` 注入 `* { cursor: none !important }` 后用
 * 一个 z-index:9999 的元素当光标）整个盖住，导致整屏看不见指针、只能盲点
 * —— 这正是入口屏对话框踩过的坑。浮动面板不进 top layer，z-index 只要低于 9999
 * 光标就还在；另外聊天面板需要一直开着看对局，本来也不该是模态的。
 */

import { el } from "./dom.js";
import { CHAT_MAX } from "./game-core.js";
import { avatar } from "./views-shared.js";

/** 公共频道的注意事项。刻意写短 —— 它默认展开，太长会把消息列表挤没。 */
const ROOM_NOTICE = [
  "公共频道 4 个人都能看到，别发真实姓名、住址、联系方式等个人信息。",
  "别刷屏、谩骂或发广告，连点发不出去（有限流）。",
  "别报自己的秘密词、别把暗号对应的编号写出来 —— 等于把答案交给对手。",
];

/** 队内频道的注意事项 */
const TEAM_NOTICE = [
  "只有你和队友看得到，对手看不到。",
  "别把数字卡顺序、该猜的编号写出来 —— 那等同于作弊。",
  "描述与猜测阶段队内频道会暂停（队友正等着猜，私聊等于直接报答案），公开后才恢复。",
  "换队后会切到新队伍的频道，原队伍的记录不再显示。",
];

/**
 * @param {unknown} at
 * @returns {string} HH:MM
 */
function timeText(at) {
  const date = new Date(Number(at) || Date.now());
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
}

/**
 * 一条消息。
 * @param {{ id: string, value: any }} entry
 * @param {string} uid 当前玩家
 * @param {"room" | "team"} channel
 * @returns {any}
 */
function messageRow(entry, uid, channel) {
  const message = entry.value ?? {};
  const isSelf = message.uid === uid;
  const name = String(message.name ?? "匿名特工");

  return el("div", { class: `ss-chat-msg is-${channel}${isSelf ? " is-self" : ""}` }, [
    isSelf ? null : avatar(message, { size: "sm" }),
    el("div", { class: "ss-chat-bubble" }, [
      el("div", { class: "ss-chat-meta" }, [
        el("span", { class: "ss-chat-name", text: isSelf ? "我" : name }),
        el("span", { class: "ss-chat-time", text: timeText(message.at) }),
      ]),
      // textContent 写入：聊天内容里的任何字符都不会被当成 HTML
      el("div", { class: "ss-chat-text", text: String(message.text ?? "") }),
    ]),
  ].filter(Boolean));
}

/**
 * "以下是 N 条新消息"分隔线。
 *
 * 打开面板会清掉红点（不清的话面板看起来像卡住了），但"清掉"不等于玩家看见了。
 * 这条线是那个清零点留下的痕迹：红点没了，新消息从哪一条开始仍然一眼可见。
 * 玩家真的碰了面板（`acknowledge()`）之后才收掉。位置由 `channels[].markerId` 决定。
 * @param {number} count 分隔线之后有几条消息
 * @returns {any}
 */
function unreadDivider(count) {
  return el("div", { class: "ss-chat-divider", attrs: { role: "separator" } }, [
    el("span", { class: "ss-chat-divider-text", text: `以下 ${count} 条新消息` }),
  ]);
}

/**
 * 频道页签。
 * @param {"room" | "team"} channel
 * @param {string} label
 * @param {number} unread
 * @param {boolean} active
 * @param {(channel: "room" | "team") => void} onTab
 * @param {boolean} [disabled]
 * @returns {any}
 */
function tabButton(channel, label, unread, active, onTab, disabled) {
  return el("button", {
    class: `ss-chat-tab is-${channel}${active ? " is-active" : ""}${disabled ? " is-locked" : ""}`,
    type: "button",
    disabled,
    attrs: {
      role: "tab",
      "aria-selected": active ? "true" : "false",
      ...(disabled ? { title: "本轮暗号已发出，队内私聊暂时关闭" } : {}),
    },
    on: { click: () => onTab(channel) },
  }, [
    el("span", { text: label }),
    disabled ? el("span", { class: "ss-chat-tab-lock", text: "🔒", attrs: { "aria-hidden": "true" } }) : null,
    unread > 0
      ? el("span", { class: "ss-chat-tab-dot", text: unread > 9 ? "9+" : String(unread) })
      : null,
  ].filter(Boolean));
}

/**
 * 聊天停靠区：入口按钮 + 面板。
 *
 * @param {{
 *   open: boolean,
 *   tab: "room" | "team",
 *   team: "A" | "B" | null,
 *   teamLabel: string | null,
 *   teamLocked: boolean,
 *   uid: string,
 *   playerCount: number,
 *   noticeOpen: boolean,
 *   channels: Record<"room" | "team", {
 *     messages: { id: string, value: any }[],
 *     unread: number,
 *     markerId: string | null,
 *   }>,
 *   onToggle: () => void,
 *   onTab: (channel: "room" | "team") => void,
 *   onToggleNotice: (open: boolean) => void,
 *   onSend: (text: string) => boolean | void,
 *   onInteract: () => void,
 * }} options
 * @returns {any}
 */
export function renderChatDock(options) {
  const unreadTotal = options.channels.room.unread + options.channels.team.unread;

  const fab = el("button", {
    class: `ss-chat-fab${options.open ? " is-open" : ""}`,
    type: "button",
    attrs: {
      "aria-label": unreadTotal > 0 ? `房间聊天，${unreadTotal} 条未读` : "房间聊天",
      "aria-expanded": options.open ? "true" : "false",
    },
    on: { click: () => options.onToggle() },
  }, [
    el("span", { class: "ss-chat-fab-icon", text: "💬", attrs: { "aria-hidden": "true" } }),
    unreadTotal > 0
      ? el("span", {
          class: "ss-chat-badge",
          text: unreadTotal > 99 ? "99+" : String(unreadTotal),
        })
      : null,
  ].filter(Boolean));

  if (!options.open) {
    return el("div", { class: "ss-chat-dock" }, [fab]);
  }

  // 队伍还没分出来时（理论上不会发生）也不给一个点进去全是空的页签
  const tabs = [tabButton("room", "房间", options.channels.room.unread, options.tab === "room", options.onTab)];
  if (options.teamLabel) {
    tabs.push(
      tabButton(
        "team",
        options.teamLabel,
        options.channels.team.unread,
        options.tab === "team",
        options.onTab,
        options.teamLocked,
      ),
    );
  }

  const isTeam = options.tab === "team";
  const bucket = options.channels[isTeam ? "team" : "room"];
  // "新消息"分隔线：按 `markerId` 找位置。找不到（那条已经被滑出读取窗口）就不画。
  const dividerAt = bucket.markerId
    ? bucket.messages.findIndex((entry) => entry.id === bucket.markerId)
    : -1;

  /** @type {any[]} */
  const rows = [];
  if (bucket.messages.length === 0) {
    rows.push(
      el("p", {
        class: "ss-chat-empty",
        text: isTeam ? "还没有队内消息，和队友商量两句？" : "还没有人说话，打个招呼吧。",
      }),
    );
  } else {
    bucket.messages.forEach((entry, index) => {
      if (index === dividerAt) rows.push(unreadDivider(bucket.messages.length - dividerAt));
      rows.push(messageRow(entry, options.uid, isTeam ? "team" : "room"));
    });
  }

  // 队内频道按队伍色着色（--ss-chat-tone），一眼能看出"这条只队友可见"
  const teamTone =
    isTeam && options.team ? ` ss-chat-team-${options.team.toLowerCase()}` : "";

  // ESC 关闭由 chat.js 在 document 上统一监听：面板自身监听的话，
  // 输入框里的 ESC 会走两遍（关掉又打开）。
  const panel = el("section", {
    class: `ss-chat-panel${isTeam ? ` is-team${teamTone}` : ""}`,
    attrs: { "aria-label": "房间聊天" },
    // 点一下消息本身就算"我看到了"（清红点、收掉"以下是 N 条新消息"）。
    //
    // 三个刻意的限制：
    // 1. 用 click 而不是 pointerdown —— 清未读会重绘面板，若在 pointerdown 阶段
    //    就把节点换掉，这次点击的 mouseup 落在新节点上，click 事件根本不会派发，
    //    表现就是"面板里的第一个按钮点不动"。
    // 2. 跳过交互控件：消息列表以外的东西都有自己的职责
    //    （<details> 的展开、开关弹层、发送…），替它们顺手清未读只会互相打架。
    // 3. 挂在面板上而不是整个停靠区上：点入口按钮是要开关面板，不该顺手清未读。
    on: {
      click: (/** @type {MouseEvent} */ event) => {
        const target = /** @type {any} */ (event.target);
        if (target?.closest?.("button, input, textarea, select, summary, label, a")) return;
        options.onInteract();
      },
    },
  }, [
    el("header", { class: "ss-chat-head" }, [
      el("div", { class: "ss-chat-head-text" }, [
        el("h3", { class: "ss-chat-title", text: "房间聊天" }),
        el("span", {
          class: "ss-chat-sub",
          text: isTeam ? "队内私聊 · 对手看不到" : `${options.playerCount} 人在房间`,
        }),
      ]),
      el("button", {
        class: "ss-icon-btn ss-chat-close",
        type: "button",
        title: "收起聊天",
        text: "×",
        on: { click: () => options.onToggle() },
      }),
    ]),

    el("div", { class: "ss-chat-tabs", attrs: { role: "tablist" } }, tabs),

    // 停用原因必须写在界面上：只说"队内频道点不动"的话，
    // 玩家会以为是网络或 bug，而不是规则如此。
    options.teamLocked
      ? el("p", {
          class: "ss-chat-lock",
          text: "本轮暗号已发出：为防止把答案直接说给自己人，队内私聊暂时关闭，公开后恢复。",
        })
      : null,

    el("details", {
      class: "ss-chat-notice",
      open: options.noticeOpen,
      on: {
        toggle: (/** @type {Event} */ event) =>
          options.onToggleNotice(/** @type {any} */ (event.currentTarget).open === true),
      },
    }, [
      el("summary", { class: "ss-chat-notice-summary", text: "聊天注意事项" }),
      el(
        "ul",
        { class: "ss-chat-notice-list" },
        (isTeam ? TEAM_NOTICE : ROOM_NOTICE).map((item) => el("li", { text: item })),
      ),
    ]),

    el("div", { class: "ss-chat-list", id: "ssChatList" }, rows),

    el("form", {
      class: "ss-chat-form",
      on: {
        submit: (/** @type {Event} */ event) => {
          event.preventDefault();
          const input = /** @type {any} */ (document.getElementById("ssChatInput"));
          const text = String(input?.value ?? "").trim();
          if (!text) return;
          // ⚠️ 必须先清空、再发送：消息一写出就会经 RTDB 回调触发 `renderChat()`，
          // 而重绘会把这个输入框换成一个新节点（`withPreservedInputs` 还会把旧值搬过去）。
          // 发送之后再清，清到的是已经脱离文档的旧节点，新节点里那行字原封不动地留着
          // —— 表现就是"发完还得手动删一次"。
          if (input) input.value = "";
          // 没被受理（队内已停用 / 限流）就把草稿还回去：
          // 那种情况下并没有写出任何东西，也就没有重绘，这个节点还是活的。
          if (options.onSend(text) === false && input) input.value = text;
        },
      },
    }, [
      el("input", {
        id: "ssChatInput",
        class: "ss-input ss-chat-input",
        type: "text",
        maxlength: CHAT_MAX,
        placeholder: isTeam ? "只队友可见…" : "对房间里说话…",
        autocomplete: "off",
        attrs: { "aria-label": isTeam ? "队内聊天内容" : "房间聊天内容" },
      }),
      el("button", { class: "ss-btn ss-btn-primary ss-chat-send", type: "submit", text: "发送" }),
    ]),
  ]);

  return el("div", { class: "ss-chat-dock" }, [panel, fab]);
}

/**
 * 读一次消息列表的滚动状态，供重绘后还原。
 *
 * ⚠️ 这个函数必须在**清空容器之前**调用。
 *
 * `renderChat()` 是 `clear + 重建`，所以重绘后拿到的是一个全新的 `#ssChatList`，
 * 它的 `scrollTop` 永远是 0。早先的做法是重绘**之后**再判断"离底部远不远"，
 * 那时量到的永远是最顶端到最底部的距离，于是每次都判成"用户在翻历史"、
 * 一次都不自动滚动 —— 表现就是"聊天框有时突然闪回顶部，还得自己往下拉"。
 * 想在重绘后决定滚到哪里，唯一的办法是重绘前先把状态量下来。
 *
 * @param {any} host 聊天容器
 * @returns {{ top: number, atBottom: boolean } | null} 面板没打开（列表不存在）时返回 null
 */
export function readChatScroll(host) {
  const list = /** @type {any} */ (host?.querySelector?.("#ssChatList"));
  if (!list) return null;
  return {
    top: list.scrollTop,
    // 贴底判定留 48px 余量，容忍一两行的高度差
    atBottom: list.scrollHeight - list.scrollTop - list.clientHeight < 48,
  };
}

/**
 * 重绘后还原滚动位置。
 *
 * - 原本贴着底部（或面板刚打开、读不到旧状态）→ 钉到最新一条：
 *   新消息永远就在眼前，"有没有人说话"不需要再手动拉一下才能确认；
 * - 原本正在往上翻历史 → 停在原处，不被新消息拽走。
 *
 * @param {any} host 聊天容器
 * @param {{ top: number, atBottom: boolean } | null} snapshot `readChatScroll()` 的返回值
 * @returns {void}
 */
export function restoreChatScroll(host, snapshot) {
  const list = /** @type {any} */ (host?.querySelector?.("#ssChatList"));
  if (!list) return;
  if (!snapshot || snapshot.atBottom) {
    list.scrollTop = list.scrollHeight;
    return;
  }
  list.scrollTop = Math.min(snapshot.top, list.scrollHeight);
}

/**
 * 面板打开后把光标放进输入框（桌面端；触屏上聚焦会弹键盘，所以只在有指针设备时做）。
 * @param {any} host
 * @returns {void}
 */
export function focusChatInput(host) {
  const input = /** @type {any} */ (host?.querySelector?.("#ssChatInput"));
  if (!input) return;
  if (window.matchMedia && !window.matchMedia("(hover: hover)").matches) return;
  input.focus();
}
