// @ts-check
/**
 * 「谍报风云」结束屏：公开双方原始词汇、双方情报板与完整回合日志。
 */

import { el } from "./dom.js";
import { otherTeam } from "./game-core.js";
import { intelBoard, logList, scoreHeader, teamTag, visibleWords, wordBoard } from "./views-shared.js";

/**
 * @param {import("./views-shared.js").ViewContext} ctx
 * @returns {any}
 */
export function renderEndedScreen(ctx) {
  const { room, uid } = ctx;
  const winner = room.winner;
  const isHost = room.meta.hostId === uid;
  const me = room.players[uid];
  const myTeamWon = Boolean(winner && me && me.team === winner);

  return el("div", { class: "ss-ended" }, [
    el("section", { class: `ss-winner${winner ? ` ss-winner-${winner.toLowerCase()}` : ""}` }, [
      el("p", { class: "ss-eyebrow", text: "对局结束" }),
      el("h2", { class: "ss-winner-title" }, [
        winner ? teamTag(winner) : null,
        el("span", { text: winner ? " 获胜" : " 平局" }),
      ].filter(Boolean)),
      me
        ? el("p", {
            class: "ss-winner-sub",
            text: myTeamWon ? "你们的暗号守住了底线。" : "对面的监听者摸清了你们的底牌。",
          })
        : null,
      el("div", { class: "ss-winner-actions" }, [
        isHost
          ? el("button", {
              class: "ss-btn ss-btn-primary",
              type: "button",
              text: "再来一局",
              on: { click: () => ctx.onRestart() },
            })
          : el("span", { class: "ss-hint", text: "等待房主开启新一局" }),
        el("button", {
          class: "ss-btn",
          type: "button",
          text: "复制邀请链接",
          on: { click: () => ctx.copyRoomCode() },
        }),
        el("button", {
          class: "ss-btn",
          type: "button",
          text: "退出房间",
          on: { click: () => ctx.confirmLeave() },
        }),
      ]),
      ctx.releaseHint ? el("p", { class: "ss-hint ss-hint-warn", text: ctx.releaseHint }) : null,
    ].filter(Boolean)),

    scoreHeader(room),

    el("div", { class: "ss-reveal-grid" }, [
      // 到了结束阶段，visibleWords 才会真正把双方的词交出来
      wordBoard(visibleWords(room, "A", me?.team ?? "A"), {
        title: "A 队原始词汇",
        subtitle: "对局结束，全部公开",
      }),
      wordBoard(visibleWords(room, "B", me?.team ?? "A"), {
        title: "B 队原始词汇",
        subtitle: "对局结束，全部公开",
      }),
    ]),

    el("div", { class: "ss-intel-reveal" }, [
      el("p", {
        class: "ss-hint",
        text: "下面是两队各自的情报板：每块板上记录的是该队对“对方编号 1-4”的推断。",
      }),
      el("div", { class: "ss-intel-reveal-grid" }, [
        intelBoard(ctx, "A", {
          editable: false,
          opponentLabel: `A 队对 ${otherTeam("A")} 队编号的线索`,
        }),
        intelBoard(ctx, "B", {
          editable: false,
          opponentLabel: `B 队对 ${otherTeam("B")} 队编号的线索`,
        }),
      ]),
    ]),

    logList(room),
  ].filter(Boolean));
}
