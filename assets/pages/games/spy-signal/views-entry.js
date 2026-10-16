// @ts-check
/**
 * 「谍报风云」入口屏。
 *
 * 结构上刻意分三块、每块只做一件事：
 *   身份 → 创建房间（含血量设置）→ 加入房间（点开才输码）
 * 已经登录夸克博客时直接用博客昵称与头像，不再让人重复填；未登录才展开
 * "昵称 + 头像底色" 的手动表单。选择会记进 localStorage，下次免填。
 */

import { el } from "./dom.js";
import {
  AVATAR_COLORS,
  HEALTH_DEFAULT,
  HEALTH_MAX,
  HEALTH_MIN,
  NICKNAME_MAX,
  ROOM_CODE_LENGTH,
} from "./game-core.js";
import { avatar, safeCssUrl } from "./views-shared.js";

const RULES = [
  "4 人分两队，每队 2 人；每队持有 4 个只有自己看得见的秘密词。",
  "每轮行动队派出描述者与猜测者，另一队整队担任监听方（不用派人，任一人提交即可）。",
  "系统随机抽出 3 个不重复编号作为数字卡，描述者按卡片顺序为对应词填写暗号。",
  "行动队猜测者猜对不扣血、猜错扣 1 血；监听方猜中再扣 1 血（最多一次扣 2 血）。",
  "每轮结束公开数字卡，对方把暗号归档进自己的情报板，逐步逼近你的词；我方词板下方也会记下自己给过的暗号。",
  "暗号公开后、结果揭晓前，队内私聊暂停，只能用公共频道。",
  "任意一队血量归零，对局结束并公开双方全部词汇与线索。",
];

/**
 * 把头像画进预览节点（昵称首字随输入实时变化）。
 *
 * 图片地址走 `safeCssUrl()`（与词板、名册用的同一个出口），
 * 不自己拼 `url("…")`：`sanitizeAvatar()` 校验的是解析后的 host 与后缀，
 * 原始串里仍可能带引号，直接拼会把 CSS 值提前闭合。
 * @param {any} node
 * @param {string} name
 * @param {{ type: string, color: string, url: string }} spec
 */
function paintAvatar(node, name, spec) {
  if (!node) return;
  const imageUrl = spec.type === "image" ? safeCssUrl(spec.url) : "";
  if (imageUrl) {
    node.style.background = "";
    node.style.backgroundImage = imageUrl;
    node.textContent = "";
    return;
  }
  node.style.backgroundImage = "";
  node.style.background = spec.color;
  node.textContent = name ? [...name][0] : "?";
}

/**
 * @param {{
 *   identity: {
 *     mode: "site" | "manual",
 *     hasSiteIdentity: boolean,
 *     siteNickname: string,
 *     siteAvatar: { type: string, color: string, url: string },
 *     manualNickname: string,
 *     manualColor: string,
 *   },
 *   preview: { nickname: string, avatar: { type: string, color: string, url: string } },
 *   healthMax: number,
 *   prefillCode: string,
 *   recentRooms: { roomId: string }[],
 *   busy: boolean,
 *   notice: string | null,
 *   onOpenModal: (kind: "create" | "join") => void,
 *   onJoinInvite: () => void,
 *   onToggleIdentityMode: (mode: "site" | "manual") => void,
 *   onManualNickname: (name: string) => void,
 *   onManualColor: (color: string) => void,
 * }} options
 * @returns {any}
 */
export function renderEntry(options) {
  return el("div", { class: "ss-entry" }, [
    el("header", { class: "ss-entry-hero" }, [
      el("p", { class: "ss-eyebrow", text: "情报交换 · 双向猜词" }),
      el("h1", { class: "ss-entry-title", text: "谍报风云" }),
      el("p", {
        class: "ss-entry-lede",
        text: "用暗号把队友领到自己藏好的 4 个词上，同时别让对面的监听者顺着暗号摸清你的底牌。",
      }),
    ]),

    options.notice ? el("p", { class: "ss-notice", text: options.notice }) : null,

    identityBlock(options),
    actionsBlock(options),
    rulesBlock(),
  ].filter(Boolean));
}

/**
 * 入口屏用到的对话框参数（在独立容器里渲染，避免打字时被整屏重绘打断）。
 * @param {any} options
 * @returns {any}
 */
export function modalOptions(options) {
  return {
    modal: options.modal,
    healthMax: options.healthMax,
    recentRooms: options.recentRooms,
    busy: options.busy,
    onCreate: options.onCreate,
    onJoin: options.onJoin,
    onOpenRecent: options.onOpenRecent,
    onHealthChange: options.onHealthChange,
    onCloseModal: options.onCloseModal,
  };
}

/* ── 身份 ─────────────────────────────────────────────────────────────── */

/**
 * @param {any} options
 * @returns {any}
 */
function identityBlock(options) {
  const { identity, preview } = options;
  const usingSite = identity.mode === "site";

  const previewNode = el("span", {
    id: "ssAvatarPreview",
    class: "ss-avatar ss-avatar-lg",
    attrs: { "aria-hidden": "true" },
  });
  // 首屏也要有内容；之后随昵称输入实时更新
  paintAvatar(previewNode, preview.nickname, preview.avatar);

  /** @type {any[]} */
  const body = [];

  if (usingSite) {
    // 一行排开即可，不再套一层面板（面板里再放面板就是套娃）
    body.push(
      el("div", { class: "ss-identity-card" }, [
        avatar({ name: identity.siteNickname, ...identity.siteAvatar }, { size: "lg" }),
        el("div", { class: "ss-identity-text" }, [
          el("span", { class: "ss-identity-name", text: identity.siteNickname }),
          el("span", { class: "ss-identity-note", text: "已使用夸克博客登录身份" }),
        ]),
        el("button", {
          class: "ss-btn ss-btn-ghost ss-btn-chip",
          type: "button",
          text: "改用手动填写",
          on: { click: () => options.onToggleIdentityMode("manual") },
        }),
      ]),
    );
  } else {
    body.push(
      el("div", { class: "ss-identity-form" }, [
        el("div", { class: "ss-identity-preview" }, [previewNode]),
        el("div", { class: "ss-identity-fields" }, [
          el("input", {
            id: "ssNickname",
            class: "ss-input",
            type: "text",
            maxlength: NICKNAME_MAX,
            placeholder: "输入昵称，例如：夜莺",
            value: identity.manualNickname,
            autocomplete: "off",
            on: {
              // 回车跟着"当前最可能的意图"走：带着邀请链接进来的人想入座，不是想建房。
              // 早先无条件 createRoom()，顺着邀请链接来的人打完昵称一回车就多出一间空房。
              keydown: (/** @type {KeyboardEvent} */ event) => {
                if (event.key !== "Enter") return;
                if (options.prefillCode) options.onJoinInvite();
                else options.onCreate();
              },
              input: (/** @type {Event} */ event) => {
                const target = /** @type {any} */ (event.target);
                const value = String(target?.value ?? "");
                options.onManualNickname(value);
                paintAvatar(previewNode, value, preview.avatar);
              },
            },
          }),
          el("div", { class: "ss-swatches", attrs: { role: "radiogroup", "aria-label": "头像底色" } },
            AVATAR_COLORS.map((color) =>
              el("label", {
                class: `ss-swatch${color === identity.manualColor ? " is-selected" : ""}`,
                style: { background: color },
                title: `头像底色 ${color}`,
              }, [
                el("input", {
                  type: "radio",
                  name: "ssAvatarColor",
                  value: color,
                  checked: color === identity.manualColor,
                  on: { change: () => options.onManualColor(color) },
                }),
              ]),
            ),
          ),
        ]),
      ]),
      identity.hasSiteIdentity
        ? el("button", {
            class: "ss-btn ss-btn-ghost ss-btn-chip",
            type: "button",
            text: "改用博客登录身份",
            on: { click: () => options.onToggleIdentityMode("site") },
          })
        : el("p", {
            class: "ss-hint",
            text: "登录夸克博客后可直接使用博客昵称与头像，无需每次填写。",
          }),
    );
  }

  return el("section", { class: "ss-block" }, [
    el("header", { class: "ss-block-head" }, [
      el("h3", { class: "ss-block-title", text: "身份" }),
      el("span", { class: "ss-block-sub", text: usingSite ? "来自博客账号" : "本地保存，下次免填" }),
    ]),
    ...body,
  ]);
}

/* ── 两个动作：创建 / 加入 ─────────────────────────────────────────────── */

/**
 * 就两个按钮：
 * - **创建房间**点开对话框选初始血量；
 * - **加入房间**在没有邀请码时点开对话框填房间码，
 *   而地址栏里已经带着邀请码时**直接进房** —— 房间码都摆在提示里了，
 *   再让人在弹窗里看一遍同样的 6 个字符、再点一次「加入」，纯属多此一举。
 *
 * 分队不在这里问：进房后在大厅随时能换队，加入时选一次没有意义。
 *
 * 刻意不套 `.ss-block`：按 UI 规范，按钮本身就是明确的点击入口，
 * 再给它加一层框只是无意义的套娃。
 * @param {any} options
 * @returns {any}
 */
function actionsBlock(options) {
  const invited = Boolean(options.prefillCode);

  return el("div", { class: "ss-actions" }, [
    invited
      ? el("div", { class: "ss-invite" }, [
          el("span", {
            text: `你收到一条房间邀请：${options.prefillCode}。填好昵称后点「加入邀请的房间」即可入座。`,
          }),
          // 邀请码在地址栏里，但人可能想进的是另一间（例如手上有两个房间码），
          // 所以留一个出口给"我要输别的码"
          el("button", {
            class: "ss-invite-alt",
            type: "button",
            text: "换成别的房间码",
            on: { click: () => options.onOpenModal("join") },
          }),
        ])
      : null,
    el("div", { class: "ss-tabs" }, [
      el("button", {
        class: "ss-tab is-primary",
        type: "button",
        text: "创建房间",
        disabled: options.busy,
        on: { click: () => options.onOpenModal("create") },
      }),
      el("button", {
        class: "ss-tab",
        type: "button",
        text: invited ? "加入邀请的房间" : "加入房间",
        disabled: options.busy,
        on: { click: () => (invited ? options.onJoinInvite() : options.onOpenModal("join")) },
      }),
    ]),
  ].filter(Boolean));
}

/* ── 对话框 ───────────────────────────────────────────────────────────── */

/**
 * 用原生 <dialog>：自带焦点陷阱、ESC 关闭与背景遮罩，不用手搓伪弹窗。
 * @param {any} options
 * @returns {any}
 */
export function renderModal(options) {
  const kind = options.modal;
  if (!kind) return null;

  const isCreate = kind === "create";

  const segments = [];
  if (isCreate) {
    for (let value = HEALTH_MIN; value <= HEALTH_MAX; value += 1) {
      segments.push(
        el("label", { class: "ss-segment" }, [
          el("input", {
            type: "radio",
            name: "ssHealthMax",
            value: String(value),
            checked: value === options.healthMax,
            on: { change: () => options.onHealthChange(value) },
          }),
          el("span", { text: `${value} 点` }),
        ]),
      );
    }
  }

  const submit = () => {
    if (isCreate) {
      options.onCreate();
      return;
    }
    const input = /** @type {any} */ (document.getElementById("ssJoinCode"));
    options.onJoin(String(input?.value ?? ""));
  };

  const close = (/** @type {any} */ dialog) => {
    if (dialog && typeof dialog.close === "function") dialog.close();
  };

  return el(
    "dialog",
    {
      class: "ss-modal",
      attrs: { "aria-label": isCreate ? "创建房间" : "加入房间" },
      on: {
        close: () => options.onCloseModal(),
        // 点遮罩关闭（原生 dialog 的遮罩点击 target 就是 dialog 本身）
        click: (/** @type {MouseEvent} */ event) => {
          if (event.target === event.currentTarget) close(event.currentTarget);
        },
        cancel: (/** @type {Event} */ event) => {
          event.preventDefault();
          close(event.currentTarget);
        },
      },
    },
    [
      el("div", { class: "ss-modal-head" }, [
        el("h3", { class: "ss-modal-title", text: isCreate ? "创建房间" : "加入房间" }),
        el("button", {
          class: "ss-icon-btn ss-modal-close",
          type: "button",
          title: "关闭",
          text: "×",
          on: {
            click: (/** @type {MouseEvent} */ event) =>
              close(/** @type {any} */ (event.currentTarget).closest("dialog")),
          },
        }),
      ]),

      el("div", { class: "ss-modal-body" }, isCreate
        ? [
            el("div", { class: "ss-field" }, [
              el("label", { class: "ss-field-label", text: "初始血量" }),
              el("div", { class: "ss-segmented" }, segments),
            ]),
            el("p", { class: "ss-hint", text: "每队各自的血量上限；开局前房主还能在房间里随时改。" }),
          ]
        : [
            el("div", { class: "ss-field" }, [
              el("label", { class: "ss-field-label", attrs: { for: "ssJoinCode" }, text: "房间码或邀请链接" }),
              el("input", {
                id: "ssJoinCode",
                class: "ss-input ss-input-code",
                type: "text",
                // 要能整段粘贴邀请链接，所以不限制长度
                placeholder: `6 位房间码，或整条邀请链接`,
                autocomplete: "off",
                spellcheck: "false",
                on: {
                  keydown: (/** @type {KeyboardEvent} */ event) => {
                    if (event.key === "Enter") submit();
                  },
                },
              }),
            ]),
            el("p", {
              class: "ss-hint",
              text: `粘贴整条邀请链接会自动识别其中的 ${ROOM_CODE_LENGTH} 位房间码；字母不区分大小写。`,
            }),
            el("p", {
              class: "ss-hint",
              text: "队伍先按人数自动补齐，进房后在大厅还能换队。",
            }),
            options.recentRooms.length
              ? el("div", { class: "ss-field" }, [
                  el("label", { class: "ss-field-label", text: "最近加入过" }),
                  el(
                    "div",
                    { class: "ss-recent" },
                    options.recentRooms.map((entry) =>
                      el("button", {
                        class: "ss-recent-item",
                        type: "button",
                        text: entry.roomId,
                        on: { click: () => options.onOpenRecent(entry.roomId) },
                      }),
                    ),
                  ),
                ])
              : null,
          ].filter(Boolean)),

      el("div", { class: "ss-modal-foot" }, [
        el("button", {
          class: "ss-btn",
          type: "button",
          text: "取消",
          on: {
            click: (/** @type {MouseEvent} */ event) =>
              close(/** @type {any} */ (event.currentTarget).closest("dialog")),
          },
        }),
        el("button", {
          id: "ssModalSubmit",
          class: "ss-btn ss-btn-primary",
          type: "button",
          text: isCreate ? (options.busy ? "处理中…" : "创建") : "加入",
          disabled: options.busy,
          on: { click: submit },
        }),
      ]),
    ],
  );
}

/* ── 玩法说明（默认折叠，保持首屏清爽）─────────────────────────────────── */

/**
 * @returns {any}
 */
function rulesBlock() {
  return el("details", { class: "ss-block ss-details" }, [
    el("summary", { class: "ss-details-summary" }, [
      el("span", { class: "ss-block-title", text: "怎么玩" }),
      el("span", { class: "ss-block-sub", text: `默认 ${HEALTH_DEFAULT} 点血 · 先手 A 队 · 点开看规则` }),
    ]),
    el(
      "ol",
      { class: "ss-rule-list" },
      RULES.map((rule) => el("li", { class: "ss-rule-item", text: rule })),
    ),
  ]);
}

/**
 * 读取入口屏表单。
 *
 * 注意：血量与面板开合都记在控制器状态里（面板关掉后输入框就不存在了），
 * 所以这里只取仍然存在的输入。对话框没打开时它里面的控件当然也读不到，
 * 那几个字段会返回空串 / 默认值，调用方按"没填"处理即可。
 * @returns {{ nickname: string, joinCode: string, avatarColor: string }}
 */
export function readEntryForm() {
  const nicknameInput = /** @type {any} */ (document.getElementById("ssNickname"));
  const codeInput = /** @type {any} */ (document.getElementById("ssJoinCode"));
  const color = /** @type {any} */ (document.querySelector('input[name="ssAvatarColor"]:checked'));
  return {
    nickname: String(nicknameInput?.value ?? "").trim(),
    joinCode: String(codeInput?.value ?? "").trim(),
    avatarColor: String(color?.value ?? ""),
  };
}
