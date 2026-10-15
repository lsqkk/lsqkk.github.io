// @ts-check
/**
 * 「谍报风云」入口屏：昵称、血量设置、创建 / 加入房间。
 */

import { el } from "./dom.js";
import { HEALTH_MAX, HEALTH_MIN, HEALTH_DEFAULT, NICKNAME_MAX, ROOM_CODE_LENGTH } from "./game-core.js";

const RULES = [
  "4 人分两队，每队 2 人；每队持有 4 个只有自己看得见的秘密词。",
  "每轮行动队派出描述者与猜测者，对方派出监听者。",
  "系统随机抽出 3 个不重复编号作为数字卡，描述者按卡片顺序为对应词填写暗号。",
  "行动队猜测者猜对不扣血、猜错扣 1 血；对方监听者猜中再扣 1 血（最多一次扣 2 血）。",
  "每轮结束公开数字卡，对方把暗号归档进自己的情报板，逐步逼近你的词。",
  "任意一队血量归零，对局结束并公开双方全部词汇与线索。",
];

/**
 * @param {{
 *   nickname: string,
 *   healthMax: number,
 *   recentRooms: { roomId: string }[],
 *   prefillCode?: string,
 *   busy: boolean,
 *   notice: string | null,
 *   onCreate: () => void,
 *   onJoin: (roomId: string) => void,
 *   onOpenRecent: (roomId: string) => void,
 * }} options
 * @returns {any}
 */
export function renderEntry(options) {
  const prefillCode = options.prefillCode ?? "";
  const healthSegments = [];
  for (let value = HEALTH_MIN; value <= HEALTH_MAX; value += 1) {
    healthSegments.push(
      el("label", { class: "ss-segment" }, [
        el("input", {
          type: "radio",
          name: "ssHealthMax",
          value: String(value),
          checked: value === options.healthMax,
        }),
        el("span", { text: `${value} 点` }),
      ]),
    );
  }

  const recent = options.recentRooms.length
    ? el(
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
      )
    : null;

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

    el("section", { class: "ss-block" }, [
      el("header", { class: "ss-block-head" }, [
        el("h3", { class: "ss-block-title", text: "设置身份" }),
        el("span", { class: "ss-block-sub", text: "无需注册，昵称仅用于本局显示" }),
      ]),
      el("div", { class: "ss-field" }, [
        el("label", { class: "ss-field-label", attrs: { for: "ssNickname" }, text: "昵称" }),
        el("input", {
          id: "ssNickname",
          class: "ss-input",
          type: "text",
          maxlength: NICKNAME_MAX,
          placeholder: "例如：夜莺",
          value: options.nickname,
          autocomplete: "off",
          on: {
            keydown: (/** @type {KeyboardEvent} */ event) => {
              if (event.key === "Enter") options.onCreate();
            },
          },
        }),
      ]),
      el("div", { class: "ss-field" }, [
        el("label", { class: "ss-field-label", text: "初始血量（创建房间时生效）" }),
        el("div", { class: "ss-segmented" }, healthSegments),
      ]),
    ]),

    el("div", { class: "ss-entry-actions" }, [
      el("button", {
        class: "ss-btn ss-btn-primary",
        type: "button",
        text: options.busy ? "处理中…" : "创建房间",
        disabled: options.busy,
        on: { click: () => options.onCreate() },
      }),
    ]),

    el("section", { class: `ss-block${prefillCode ? " ss-block-invited" : ""}` }, [
      el("header", { class: "ss-block-head" }, [
        el("h3", { class: "ss-block-title", text: prefillCode ? "接受邀请" : "加入房间" }),
        el("span", {
          class: "ss-block-sub",
          text: prefillCode ? "房间码已填好" : `输入 ${ROOM_CODE_LENGTH} 位房间码`,
        }),
      ]),
      prefillCode
        ? el("p", {
            class: "ss-invite",
            text: `你收到一条房间邀请：${prefillCode}。填好昵称后点「加入」即可入座。`,
          })
        : null,
      el("div", { class: "ss-join-row" }, [
        el("input", {
          id: "ssJoinCode",
          class: "ss-input ss-input-code",
          type: "text",
          maxlength: ROOM_CODE_LENGTH,
          placeholder: "房间码",
          value: prefillCode,
          autocomplete: "off",
          spellcheck: "false",
          on: {
            keydown: (/** @type {KeyboardEvent} */ event) => {
              if (event.key !== "Enter") return;
              const target = /** @type {any} */ (event.target);
              options.onJoin(String(target?.value ?? ""));
            },
          },
        }),
        el("button", {
          class: `ss-btn${prefillCode ? " ss-btn-primary" : ""}`,
          type: "button",
          text: "加入",
          disabled: options.busy,
          on: {
            click: () => {
              const input = /** @type {any} */ (document.getElementById("ssJoinCode"));
              options.onJoin(String(input?.value ?? ""));
            },
          },
        }),
      ]),
      el("p", {
        class: "ss-hint",
        text: "房间码不区分大小写，易混淆的 0/O、1/I 会自动纠正。",
      }),
      recent,
    ].filter(Boolean)),

    el("section", { class: "ss-block" }, [
      el("header", { class: "ss-block-head" }, [
        el("h3", { class: "ss-block-title", text: "怎么玩" }),
        el("span", { class: "ss-block-sub", text: `默认 ${HEALTH_DEFAULT} 点血 · 先手 A 队` }),
      ]),
      el(
        "ol",
        { class: "ss-rule-list" },
        RULES.map((rule) => el("li", { class: "ss-rule-item", text: rule })),
      ),
    ]),
  ].filter(Boolean));
}

/**
 * 读取入口屏表单。
 * @returns {{ nickname: string, healthMax: number, joinCode: string }}
 */
export function readEntryForm() {
  const nicknameInput = /** @type {any} */ (document.getElementById("ssNickname"));
  const codeInput = /** @type {any} */ (document.getElementById("ssJoinCode"));
  const checked = /** @type {any} */ (
    document.querySelector('input[name="ssHealthMax"]:checked')
  );
  return {
    nickname: String(nicknameInput?.value ?? "").trim(),
    healthMax: Number(checked?.value) || HEALTH_DEFAULT,
    joinCode: String(codeInput?.value ?? "").trim(),
  };
}
