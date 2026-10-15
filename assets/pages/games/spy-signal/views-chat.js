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
 * 频道页签。
 * @param {"room" | "team"} channel
 * @param {string} label
 * @param {number} unread
 * @param {boolean} active
 * @param {(channel: "room" | "team") => void} onTab
 * @returns {any}
 */
function tabButton(channel, label, unread, active, onTab) {
  return el("button", {
    class: `ss-chat-tab is-${channel}${active ? " is-active" : ""}`,
    type: "button",
    attrs: { role: "tab", "aria-selected": active ? "true" : "false" },
    on: { click: () => onTab(channel) },
  }, [
    el("span", { text: label }),
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
 *   uid: string,
 *   playerCount: number,
 *   noticeOpen: boolean,
 *   channels: Record<"room" | "team", { messages: { id: string, value: any }[], unread: number }>,
 *   onToggle: () => void,
 *   onTab: (channel: "room" | "team") => void,
 *   onToggleNotice: (open: boolean) => void,
 *   onSend: (text: string) => void,
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
    tabs.push(tabButton("team", options.teamLabel, options.channels.team.unread, options.tab === "team", options.onTab));
  }

  const isTeam = options.tab === "team";
  const bucket = options.channels[isTeam ? "team" : "room"];
  const rows = bucket.messages.length
    ? bucket.messages.map((entry) => messageRow(entry, options.uid, isTeam ? "team" : "room"))
    : [
        el("p", {
          class: "ss-chat-empty",
          text: isTeam ? "还没有队内消息，和队友商量两句？" : "还没有人说话，打个招呼吧。",
        }),
      ];

  // 队内频道按队伍色着色（--ss-chat-tone），一眼能看出"这条只队友可见"
  const teamTone =
    isTeam && options.team ? ` ss-chat-team-${options.team.toLowerCase()}` : "";

  // ESC 关闭由 chat.js 在 document 上统一监听：面板自身监听的话，
  // 输入框里的 ESC 会走两遍（关掉又打开）。
  const panel = el("section", {
    class: `ss-chat-panel${isTeam ? ` is-team${teamTone}` : ""}`,
    attrs: { "aria-label": "房间聊天" },
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
          options.onSend(text);
          if (input) input.value = "";
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
 * 把消息列表钉到底部。
 *
 * 只在用户本来就在底部附近时才自动滚动 —— 否则他正翻看历史消息，
 * 被一条新消息拽到底下会很烦。
 * @param {any} host 聊天容器
 * @returns {void}
 */
export function pinChatScroll(host) {
  const list = host?.querySelector?.("#ssChatList");
  if (!list) return;
  const distance = list.scrollHeight - list.scrollTop - list.clientHeight;
  if (distance < 48) list.scrollTop = list.scrollHeight;
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
