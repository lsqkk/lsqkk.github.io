// @ts-check
/**
 * 「谍报风云」可复用界面部件。
 *
 * 部件只负责"把数据画出来"，所有交互通过 `ctx.act()` 抛给控制器，
 * 因此本文件不直接接触 Firebase。
 */

import { el, frag } from "./dom.js";
import {
  CARD_LENGTH,
  ROLE_LABELS,
  WORD_NUMBERS,
  formatCard,
} from "./game-core.js";
import { entriesOf, intelOf, playersByTeam } from "./room-model.js";

/**
 * 界面层与控制器之间的契约：视图只读 `room`，其余一律通过回调交回控制器。
 * @typedef {object} ViewContext
 * @property {import("./room-model.js").Room} room
 * @property {string} uid
 * @property {string} roomId
 * @property {string | null} releaseHint 房间自动释放的倒计时提示
 * @property {(type: string, payload?: Record<string, unknown>) => void} act
 * @property {(message: string, tone?: string) => void} toast
 * @property {() => void} copyRoomCode
 * @property {() => void} confirmLeave
 * @property {() => void} onReroll
 * @property {() => void} onRestart
 * @property {number[]} draftGuess 猜测面板的草稿序列（存在控制器里，重绘不丢）
 * @property {(seq: number[]) => void} onDraftGuess
 */

/** 数字编号 → 中文序号展示 */
const ROLE_TONE = {
  describer: "describer",
  guesser: "guesser",
  listener: "listener",
};

/**
 * 队伍标签。
 * @param {import("./room-model.js").Team} team
 * @param {{ small?: boolean }} [options]
 * @returns {any}
 */
export function teamTag(team, options = {}) {
  return el("span", {
    class: `ss-team-tag ss-team-${team.toLowerCase()}${options.small ? " is-small" : ""}`,
    text: `${team} 队`,
  });
}

/**
 * 分段血量条：一格代表 1 点血，比进度条更能一眼看出还剩几条命。
 * @param {import("./room-model.js").Team} team
 * @param {number} health
 * @param {number} healthMax
 * @param {{ active?: boolean, label?: string }} [options]
 * @returns {any}
 */
export function healthTrack(team, health, healthMax, options = {}) {
  const pips = [];
  for (let i = 0; i < healthMax; i += 1) {
    pips.push(
      el("i", {
        class: `ss-pip${i < health ? " is-full" : ""}`,
        style: { animationDelay: `${i * 60}ms` },
      }),
    );
  }

  return el("div", { class: `ss-health ss-health-${team.toLowerCase()}${options.active ? " is-active" : ""}` }, [
    el("div", { class: "ss-health-head" }, [
      el("span", { class: "ss-health-name", text: options.label ?? `${team} 队` }),
      el("span", { class: "ss-health-value", text: `${Math.max(0, health)} / ${healthMax}` }),
    ]),
    el("div", { class: "ss-health-pips" }, pips),
  ]);
}

/**
 * 玩家行：昵称 + 在线状态 + 本轮角色 + 房主标记。
 * @param {ViewContext} ctx
 * @param {{ uid: string, player: import("./room-model.js").Player }} entry
 * @returns {any}
 */
export function playerRow(ctx, entry) {
  const { player, uid } = entry;
  const isSelf = uid === ctx.uid;
  const isHost = uid === ctx.room.meta.hostId;
  const isTurnTeam = player.team === ctx.room.turn;

  const tags = [];
  if (isSelf) tags.push(el("span", { class: "ss-mini-tag", text: "我" }));
  if (isHost) tags.push(el("span", { class: "ss-mini-tag ss-mini-tag-host", text: "房主" }));
  if (player.role) {
    tags.push(
      el("span", {
        class: `ss-mini-tag ss-role-${ROLE_TONE[player.role] ?? "none"}`,
        text: ROLE_LABELS[player.role] ?? player.role,
      }),
    );
  }

  return el(
    "div",
    {
      class: `ss-player-row${isSelf ? " is-self" : ""}${player.online ? "" : " is-offline"}${
        isTurnTeam && ctx.room.phase !== "lobby" ? " is-turn-team" : ""
      }`,
    },
    [
      el("span", { class: `ss-online-dot${player.online ? "" : " is-offline"}`, title: player.online ? "在线" : "已离线" }),
      el("span", { class: "ss-player-name", text: player.name }),
      el("span", { class: "ss-player-tags" }, tags),
      player.ready && (ctx.room.phase === "lobby" || ctx.room.phase === "prepare")
        ? el("span", { class: "ss-ready-mark", text: "已准备" })
        : null,
    ].filter(Boolean),
  );
}

/**
 * 队伍名单。
 * @param {ViewContext} ctx
 * @param {{ showReady?: boolean }} [options]
 * @returns {any}
 */
export function rosterTable(ctx, options = {}) {
  const grouped = playersByTeam(ctx.room);
  const columns = ["A", "B"].map((team) => {
    const members = grouped[/** @type {"A"} */ (team)];
    const empty = Math.max(0, 2 - members.length);
    return el("div", { class: `ss-roster-col ss-roster-${team.toLowerCase()}` }, [
      el("div", { class: "ss-roster-head" }, [
        teamTag(/** @type {any} */ (team)),
        el("span", { class: "ss-roster-count", text: `${members.length} / 2` }),
        ctx.room.phase !== "lobby" && team === ctx.room.turn
          ? el("span", { class: "ss-turn-mark", text: "本轮行动" })
          : null,
      ].filter(Boolean)),
      el(
        "div",
        { class: "ss-roster-list" },
        [
          ...members.map((entry) => playerRow(ctx, entry)),
          ...Array.from({ length: empty }, () =>
            el("div", { class: "ss-player-row is-empty" }, [
              el("span", { class: "ss-online-dot is-empty" }),
              el("span", { class: "ss-player-name", text: "等待加入…" }),
            ]),
          ),
        ],
      ),
    ]);
  });

  return el("div", { class: "ss-roster" }, columns);
}

/**
 * 秘密词板。`reveal` 为 false 时只显示编号与问号（用于对方词板）。
 * @param {import("./room-model.js").TeamState} teamState
 * @param {{ reveal: boolean, title: string, subtitle?: string }} options
 * @returns {any}
 */
export function wordBoard(teamState, options) {
  const rows = WORD_NUMBERS.map((number) => {
    const word = teamState?.words?.[String(number)];
    const hidden = !options.reveal || !word;
    return el("div", { class: `ss-word-row${hidden ? " is-hidden" : ""}` }, [
      el("span", { class: "ss-word-number", text: String(number) }),
      el("span", { class: "ss-word-text", text: hidden ? "？？？" : String(word) }),
    ]);
  });

  return el("section", { class: "ss-block ss-word-board" }, [
    el("header", { class: "ss-block-head" }, [
      el("h3", { class: "ss-block-title", text: options.title }),
      options.subtitle ? el("span", { class: "ss-block-sub", text: options.subtitle }) : null,
    ].filter(Boolean)),
    el("div", { class: "ss-word-list" }, rows),
  ]);
}

/**
 * 数字卡展示。
 * @param {readonly number[] | null | undefined} card
 * @param {{ note?: string, compact?: boolean }} [options]
 * @returns {any}
 */
export function cardDisplay(card, options = {}) {
  const slots = [];
  for (let i = 0; i < CARD_LENGTH; i += 1) {
    const value = card && card.length > i ? card[i] : null;
    slots.push(
      el("div", { class: "ss-card-slot" }, [
        el("span", { class: "ss-card-order", text: `第${i + 1}位` }),
        el("span", { class: "ss-card-digit", text: value === null ? "·" : String(value) }),
      ]),
    );
  }
  return el("div", { class: `ss-card${options.compact ? " is-compact" : ""}` }, [
    el("div", { class: "ss-card-slots" }, slots),
    options.note ? el("p", { class: "ss-card-note", text: options.note }) : null,
  ].filter(Boolean));
}

/**
 * 情报板：本队对"对方编号 1-4"的线索与自定义笔记。
 * @param {ViewContext} ctx
 * @param {import("./room-model.js").Team} team 情报板归属队伍
 * @param {{ editable?: boolean, opponentLabel?: string }} [options]
 * @returns {any}
 */
export function intelBoard(ctx, team, options = {}) {
  const teamState = ctx.room.teams[team];
  const opponent = team === "A" ? "B" : "A";
  const editable = options.editable !== false;

  const columns = WORD_NUMBERS.map((number) => {
    const clues = intelOf(teamState, number);
    const notes = entriesOf(teamState?.notes?.[number]);
    const inputId = `ssNote-${team}-${number}`;

    const clueNodes = clues.length
      ? clues.map((clue) =>
          el("div", { class: "ss-intel-clue" }, [
            el("span", { class: "ss-intel-quote", text: "”" }),
            el("span", { class: "ss-intel-clue-text", text: clue }),
          ]),
        )
      : [el("div", { class: "ss-intel-empty", text: "尚无线索" })];

    const noteNodes = notes.map((note) =>
      el("div", { class: "ss-intel-note" }, [
        el("span", { class: "ss-intel-note-text", text: note.value.text }),
        editable && note.value.by === ctx.uid
          ? el("button", {
              class: "ss-icon-btn",
              type: "button",
              title: "删除笔记",
              text: "×",
              on: {
                click: () =>
                  ctx.act("REMOVE_NOTE", { team, number: String(number), noteId: note.id }),
              },
            })
          : null,
      ].filter(Boolean)),
    );

    return el("div", { class: "ss-intel-col" }, [
      el("div", { class: "ss-intel-head" }, [
        el("span", { class: "ss-intel-number", text: String(number) }),
        el("span", { class: "ss-intel-count", text: `${clues.length} 条线索` }),
      ]),
      el("div", { class: "ss-intel-clues" }, clueNodes),
      noteNodes.length ? el("div", { class: "ss-intel-notes" }, noteNodes) : null,
      editable
        ? el("form", {
            class: "ss-intel-form",
            on: {
              submit: (/** @type {Event} */ event) => {
                event.preventDefault();
                const input = /** @type {any} */ (document.getElementById(inputId));
                const text = String(input?.value ?? "").trim();
                if (!text) return;
                ctx.act("ADD_NOTE", {
                  team,
                  number: String(number),
                  text,
                  noteId: `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
                });
                if (input) input.value = "";
              },
            },
          }, [
            el("input", {
              id: inputId,
              class: "ss-intel-input",
              type: "text",
              placeholder: "记一笔…",
              maxlength: 60,
              autocomplete: "off",
            }),
            el("button", { class: "ss-intel-add", type: "submit", text: "记" }),
          ])
        : null,
    ].filter(Boolean));
  });

  return el("section", { class: "ss-block ss-intel-board" }, [
    el("header", { class: "ss-block-head" }, [
      el("h3", { class: "ss-block-title", text: "情报板" }),
      el("span", {
        class: "ss-block-sub",
        text: options.opponentLabel ?? `对 ${opponent} 队编号的线索`,
      }),
    ]),
    el("div", { class: "ss-intel-grid" }, columns),
  ]);
}

/**
 * 回合日志。
 * @param {import("./room-model.js").Room} room
 * @param {{ limit?: number }} [options]
 * @returns {any}
 */
export function logList(room, options = {}) {
  const logs = entriesOf(room.logs)
    .map((entry) => entry.value)
    .sort((a, b) => b.round - a.round);
  const shown = options.limit ? logs.slice(0, options.limit) : logs;

  if (shown.length === 0) {
    return el("section", { class: "ss-block ss-log-block" }, [
      el("header", { class: "ss-block-head" }, [el("h3", { class: "ss-block-title", text: "回合日志" })]),
      el("div", { class: "ss-log-empty", text: "还没有完成的回合" }),
    ]);
  }

  const rows = shown.map((log) => {
    const isCurrent = log.round === room.round;
    const items = [];
    items.push(
      el("div", { class: "ss-log-line" }, [
        el("span", { class: "ss-log-label", text: "数字卡" }),
        el("span", { class: "ss-log-card", text: formatCard(log.card) }),
      ]),
    );

    if (log.descriptions && log.descriptions.length) {
      items.push(
        el(
          "div",
          { class: "ss-log-clues" },
          log.descriptions.map((text, index) =>
            el("div", { class: "ss-log-clue" }, [
              el("span", { class: "ss-log-clue-num", text: log.card?.[index] ? String(log.card[index]) : "?" }),
              el("span", { class: "ss-log-clue-text", text: text }),
            ]),
          ),
        ),
      );
    }

    const verdicts = [];
    verdicts.push(
      el("span", {
        class: `ss-verdict${log.guesserCorrect ? " is-ok" : " is-bad"}`,
        text: `本队猜测${log.guesserCorrect ? "正确" : "错误"}`,
      }),
    );
    verdicts.push(
      el("span", {
        class: `ss-verdict${log.listenerCorrect ? " is-bad" : " is-ok"}`,
        text: `监听者${log.listenerCorrect ? "猜中" : "未猜中"}`,
      }),
    );
    if (log.healthLoss > 0) {
      verdicts.push(el("span", { class: "ss-verdict is-loss", text: `${log.turn} 队 −${log.healthLoss} 血` }));
    } else {
      verdicts.push(el("span", { class: "ss-verdict is-neutral", text: "未扣血" }));
    }
    if (log.voided) {
      verdicts.push(el("span", { class: "ss-verdict is-neutral", text: "本轮作废" }));
    }
    items.push(el("div", { class: "ss-log-verdicts" }, verdicts));

    return el("div", { class: `ss-log-row${isCurrent ? " is-current" : ""}` }, [
      el("div", { class: "ss-log-head" }, [
        el("span", { class: "ss-log-round", text: `第 ${log.round} 轮` }),
        teamTag(log.turn, { small: true }),
        el("span", {
          class: "ss-log-health",
          text: `剩余 A ${log.healthAfter?.A ?? "?"} · B ${log.healthAfter?.B ?? "?"}`,
        }),
      ]),
      ...items,
    ]);
  });

  return el("section", { class: "ss-block ss-log-block" }, [
    el("header", { class: "ss-block-head" }, [
      el("h3", { class: "ss-block-title", text: "回合日志" }),
      el("span", { class: "ss-block-sub", text: `共 ${logs.length} 轮` }),
    ]),
    el("div", { class: "ss-log-list" }, rows),
  ]);
}

/**
 * 页头统计：血量 + 当前回合 + 轮次。
 * @param {import("./room-model.js").Room} room
 * @returns {any}
 */
export function scoreHeader(room) {
  return el("section", { class: "ss-scoreboard" }, [
    healthTrack("A", room.teams.A.health, room.meta.healthMax, {
      active: room.turn === "A" && room.phase !== "ended",
    }),
    el("div", { class: "ss-scoreboard-center" }, [
      el("div", { class: "ss-round-chip", text: `第 ${room.round} 轮` }),
      el("div", {
        class: "ss-phase-chip",
        text: room.phase === "ended" ? "对局结束" : `${room.turn} 队行动中`,
      }),
    ]),
    healthTrack("B", room.teams.B.health, room.meta.healthMax, {
      active: room.turn === "B" && room.phase !== "ended",
    }),
  ]);
}

/**
 * 空状态占位。
 * @param {string} text
 * @returns {any}
 */
export function emptyHint(text) {
  return el("p", { class: "ss-hint", text });
}

export { frag };
