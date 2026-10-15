// @ts-check
/**
 * 「谍报风云」房间屏：大厅与准备阶段。
 * 准备阶段展示本队 4 个秘密词（可重新随机），对方词板保持遮蔽。
 */

import { el } from "./dom.js";
import { HEALTH_MAX, HEALTH_MIN, ROOM_CAPACITY } from "./game-core.js";
import { rosterTable, teamTag, visibleWords, wordBoard } from "./views-shared.js";

/**
 * @param {import("./views-shared.js").ViewContext} ctx
 * @returns {any}
 */
export function renderRoomScreen(ctx) {
  const { room, uid } = ctx;
  const me = room.players[uid];
  const playerCount = Object.keys(room.players).length;
  const isHost = room.meta.hostId === uid;
  const isPrepare = room.phase === "prepare";
  const myTeam = me?.team ?? "A";
  const opponent = myTeam === "A" ? "B" : "A";

  const teamMembers = Object.values(room.players).filter((player) => player.team === myTeam);
  const opponentMembers = Object.values(room.players).filter((player) => player.team === opponent);
  const allReady = Object.values(room.players).length === ROOM_CAPACITY &&
    Object.values(room.players).every((player) => player.ready);
  const wordsDealt =
    Object.keys(room.teams.A.words ?? {}).length === 4 &&
    Object.keys(room.teams.B.words ?? {}).length === 4;

  const statusLines = [];
  if (playerCount < ROOM_CAPACITY) {
    statusLines.push(`等待玩家加入（${playerCount} / ${ROOM_CAPACITY}）`);
  } else if (!wordsDealt) {
    statusLines.push("正在为两队发牌…");
  } else if (!allReady) {
    statusLines.push("等待全员点击「准备」");
  } else if (!isHost) {
    statusLines.push("全员已就绪，等待房主开始游戏");
  } else {
    statusLines.push("全员已就绪，可以开始游戏");
  }

  return el("div", { class: "ss-room" }, [
    el("section", { class: "ss-block ss-room-head" }, [
      el("header", { class: "ss-block-head" }, [
        el("h3", { class: "ss-block-title", text: "房间" }),
        el("span", { class: "ss-block-sub", text: `你是 ${myTeam} 队成员` }),
      ]),
      el("div", { class: "ss-room-code-row" }, [
        el("span", { class: "ss-room-code-label", text: "房间码" }),
        el("span", { class: "ss-room-code", text: ctx.roomId }),
        el("button", {
          class: "ss-btn ss-btn-ghost",
          type: "button",
          text: "复制邀请链接",
          on: { click: () => ctx.copyRoomCode() },
        }),
      ]),
      el("p", { class: "ss-hint", text: statusLines[0] }),
      ctx.releaseHint ? el("p", { class: "ss-hint ss-hint-warn", text: ctx.releaseHint }) : null,
      el("div", { class: "ss-room-actions" }, [
        el("button", {
          class: `ss-btn${me?.ready ? " ss-btn-active" : ""}`,
          type: "button",
          text: me?.ready ? "已准备（点击取消）" : "准备",
          disabled: !isPrepare && room.phase !== "lobby",
          on: { click: () => ctx.act("SET_READY", { ready: !me?.ready }) },
        }),
        isHost
          ? el("button", {
              class: "ss-btn ss-btn-primary",
              type: "button",
              text: "开始游戏",
              disabled: !(isPrepare && wordsDealt && allReady && playerCount === ROOM_CAPACITY),
              on: { click: () => ctx.act("START", {}) },
            })
          : null,
        el("button", {
          class: "ss-btn ss-btn-danger",
          type: "button",
          text: "退出房间",
          on: { click: () => ctx.confirmLeave() },
        }),
      ].filter(Boolean)),
    ]),

    isHost
      ? el("section", { class: "ss-block" }, [
          el("header", { class: "ss-block-head" }, [
            el("h3", { class: "ss-block-title", text: "房主设置" }),
            el("span", { class: "ss-block-sub", text: "开局后不可修改" }),
          ]),
          el("div", { class: "ss-field" }, [
            el("label", { class: "ss-field-label", text: "初始血量" }),
            el(
              "div",
              { class: "ss-segmented" },
              Array.from({ length: HEALTH_MAX - HEALTH_MIN + 1 }, (_, index) => {
                const value = HEALTH_MIN + index;
                return el("label", { class: "ss-segment" }, [
                  el("input", {
                    type: "radio",
                    name: "ssRoomHealth",
                    value: String(value),
                    checked: value === room.meta.healthMax,
                    on: {
                      change: () => ctx.act("SET_HEALTH_MAX", { healthMax: value }),
                    },
                  }),
                  el("span", { text: `${value} 点` }),
                ]);
              }),
            ),
          ]),
        ])
      : null,

    el("section", { class: "ss-block" }, [
      el("header", { class: "ss-block-head" }, [
        el("h3", { class: "ss-block-title", text: "分队情况" }),
        el("span", { class: "ss-block-sub", text: "每队 2 人，人少的一队优先补位" }),
      ]),
      rosterTable(ctx),
    ]),

    isPrepare && wordsDealt
      ? el("div", { class: "ss-prepare-grid" }, [
          el("div", { class: "ss-prepare-cell" }, [
            wordBoard(visibleWords(room, myTeam, myTeam), {
              title: `我方词板 · ${myTeam} 队`,
              subtitle: `${teamMembers.length} / 2 人可见`,
            }),
            el("div", { class: "ss-prepare-actions" }, [
              el("button", {
                class: "ss-btn",
                type: "button",
                text: "重新随机",
                on: { click: () => ctx.onReroll() },
              }),
              el("span", { class: "ss-hint", text: "队内任一成员都可换词，换词后本队需要重新准备。" }),
            ]),
          ]),
          el("div", { class: "ss-prepare-cell" }, [
            // 对方的词在这里取不到（visibleWords 只会返回空对象）
            wordBoard(visibleWords(room, opponent, myTeam), {
              title: `对方词板 · ${opponent} 队`,
              subtitle: `${opponentMembers.length} / 2 人，开局前不可见`,
            }),
            el("p", { class: "ss-hint", text: `对局结束前，你永远看不到 ${opponent} 队的原始词汇。` }),
          ]),
        ])
      : el("section", { class: "ss-block ss-block-muted" }, [
          el("header", { class: "ss-block-head" }, [
            el("h3", { class: "ss-block-title", text: "秘密词板" }),
            el("span", { class: "ss-block-sub", text: "满 4 人后自动发牌" }),
          ]),
          el("div", { class: "ss-awaiting" }, [
            teamTag(myTeam),
            el("p", { class: "ss-hint", text: `正在等待另外 ${ROOM_CAPACITY - playerCount} 位特工就位…` }),
          ]),
        ]),
  ].filter(Boolean));
}
