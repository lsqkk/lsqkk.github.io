// @ts-check
/**
 * 「谍报风云」确认对话框。
 *
 * 替代 `window.confirm()`：原生确认框会**阻塞整个 JS 线程**（打开期间 RTDB 推送、
 * 倒计时、音效全部停摆），样式也和本页的玻璃拟态完全两回事 —— 一个深色档案室的
 * 桌游里弹出一个系统灰框，是整套界面里最出戏的地方。
 *
 * 复用入口屏那套 `<dialog class="ss-modal">`：
 * 自带焦点陷阱、ESC（`cancel` 事件）与遮罩，和 `.ss-modal-open` 的光标还原规则
 * （见 `main.js` 里对 top layer 与自定义光标的说明）。
 * 结构与绘制都在这里，生命周期（什么时候弹、关掉后 resolve 什么）在 `main.js`。
 */

import { el } from "./dom.js";

/**
 * @param {{
 *   title: string,
 *   message: string,
 *   hint?: string,
 *   confirmText: string,
 *   cancelText: string,
 *   danger?: boolean,
 *   onConfirm: () => void,
 *   onCancel: () => void,
 * }} options
 * @returns {any}
 */
export function renderConfirmDialog(options) {
  /**
   * 关掉对话框（不结算）：`close` 事件会把结果交给 `onCancel()`，
   * 于是按钮 / ESC / 点遮罩三条路都汇到同一个出口。
   * @param {any} event
   */
  const closeSelf = (event) => {
    const dialog = event.currentTarget?.closest?.("dialog");
    if (dialog && typeof dialog.close === "function") dialog.close();
  };

  return el(
    "dialog",
    {
      class: "ss-modal ss-confirm",
      attrs: { "aria-label": options.title },
      on: {
        // close 是最后一道网：无论怎么关上的，都要有人把 Promise 结掉，
        // 否则 await 它的代码会永远挂着（例如"退出房间"之后再也点不动）
        close: () => options.onCancel(),
        click: (/** @type {MouseEvent} */ event) => {
          if (event.target === event.currentTarget) closeSelf(event);
        },
        cancel: (/** @type {Event} */ event) => {
          event.preventDefault();
          closeSelf(event);
        },
      },
    },
    [
      el("div", { class: "ss-modal-head" }, [
        el("h3", { class: "ss-modal-title", text: options.title }),
      ]),
      el("div", { class: "ss-modal-body" }, [
        el("p", { class: "ss-confirm-message", text: options.message }),
        options.hint ? el("p", { class: "ss-hint", text: options.hint }) : null,
      ].filter(Boolean)),
      el("div", { class: "ss-modal-foot" }, [
        el("button", {
          id: "ssConfirmCancel",
          class: "ss-btn",
          type: "button",
          text: options.cancelText,
          on: { click: () => options.onCancel() },
        }),
        el("button", {
          id: "ssConfirmAccept",
          class: `ss-btn${options.danger ? " ss-btn-danger" : " ss-btn-primary"}`,
          type: "button",
          text: options.confirmText,
          on: { click: () => options.onConfirm() },
        }),
      ]),
    ],
  );
}
