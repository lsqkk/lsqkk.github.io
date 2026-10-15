// @ts-check
/**
 * 「谍报风云」对局屏。
 *
 * 信息可见性严格按规则实现：
 * - 数字卡只在描述阶段对"本轮描述者"可见，公开阶段才对所有人展示；
 * - 猜测阶段只显示暗号，不显示任何一方的猜测内容；
 * - 对方原始词汇在对局结束前始终遮蔽。
 */

import { el } from "./dom.js";
import {
  CARD_LENGTH,
  ROLE_DESCRIBER,
  ROLE_GUESSER,
  ROLE_LABELS,
  ROLE_LISTENER,
  WORD_NUMBERS,
  drawCard,
  formatCard,
  otherTeam,
} from "./game-core.js";
import { currentRoles, guessSideOf } from "./room-model.js";
import { avatar, cardDisplay, intelBoard, logList, scoreHeader, teamTag, wordBoard } from "./views-shared.js";

/**
 * @param {import("./views-shared.js").ViewContext} ctx
 * @returns {any}
 */
export function renderGameScreen(ctx) {
  const { room, uid } = ctx;
  const me = room.players[uid];
  const myTeam = me?.team ?? "A";
  const opponent = otherTeam(myTeam);
  const roles = currentRoles(room);
  const isHost = room.meta.hostId === uid;

  return el("div", { class: "ss-game" }, [
    scoreHeader(room),
    roleBar(ctx, roles),

    phaseAction(ctx, { myTeam, opponent, roles, isHost }),

    el("div", { class: "ss-board-grid" }, [
      wordBoard(room.teams[myTeam], {
        reveal: true,
        title: `我方词板 · ${myTeam} 队`,
        subtitle: "只有你和你队友看得到",
      }),
      wordBoard(room.teams[opponent], {
        reveal: false,
        title: `对方词板 · ${opponent} 队`,
        subtitle: "对局结束前保持遮蔽",
      }),
    ]),

    intelBoard(ctx, myTeam, { editable: true }),
    logList(room, { limit: 12 }),
  ].filter(Boolean));
}

/**
 * 本轮角色条。
 * @param {any} ctx
 * @param {{ describerId: string | null, guesserId: string | null, listenerId: string | null }} roles
 * @returns {any}
 */
function roleBar(ctx, roles) {
  const { room } = ctx;
  const opponent = otherTeam(room.turn);

  const cell = (/** @type {string} */ label, /** @type {string | null} */ id, /** @type {string | null} */ team) => {
    const player = id ? room.players[id] : null;
    const isSelf = id === ctx.uid;
    return el("div", { class: `ss-role-cell${isSelf ? " is-self" : ""}${player ? "" : " is-empty"}` }, [
      player
        ? avatar(player, { size: "md" })
        : el("span", { class: "ss-avatar ss-avatar-md is-placeholder", text: "?" }),
      el("div", { class: "ss-role-body" }, [
        el("span", { class: "ss-role-name", text: label }),
        el("span", { class: "ss-role-holder", text: player ? player.name : "未指派" }),
      ]),
      team ? teamTag(/** @type {any} */ (team), { small: true }) : null,
    ].filter(Boolean));
  };

  return el("section", { class: "ss-role-bar" }, [
    cell(ROLE_LABELS[ROLE_DESCRIBER], roles.describerId, room.turn),
    cell(ROLE_LABELS[ROLE_GUESSER], roles.guesserId, room.turn),
    cell(ROLE_LABELS[ROLE_LISTENER], roles.listenerId, opponent),
  ]);
}

/**
 * 按阶段渲染操作区。
 * @param {any} ctx
 * @param {{ myTeam: "A" | "B", opponent: "A" | "B", roles: any, isHost: boolean }} info
 * @returns {any}
 */
function phaseAction(ctx, info) {
  const { room } = ctx;
  switch (room.phase) {
    case "select-role":
      return selectRolePanel(ctx, info);
    case "describing":
      return describingPanel(ctx, info);
    case "guessing":
      return guessingPanel(ctx, info);
    case "reveal":
      return revealPanel(ctx, info);
    default:
      return el("section", { class: "ss-block ss-block-muted" }, [
        el("p", { class: "ss-hint", text: "等待对局开始…" }),
      ]);
  }
}

/**
 * 选角色阶段。
 * @param {any} ctx
 * @param {{ myTeam: "A" | "B", opponent: "A" | "B" }} info
 * @returns {any}
 */
function selectRolePanel(ctx, info) {
  const { room, uid } = ctx;
  const isTurnTeam = info.myTeam === room.turn;
  const myTeamState = room.teams[info.myTeam];
  const members = Object.entries(room.players)
    .filter(([, player]) => player.team === info.myTeam)
    .sort((a, b) => a[1].joinedAt - b[1].joinedAt);

  /**
   * @param {string} role
   * @returns {any}
   */
  const picker = (role) => {
    const field = /** @type {"describerId" | "guesserId" | "listenerId"} */ (
      role === ROLE_DESCRIBER ? "describerId" : role === ROLE_GUESSER ? "guesserId" : "listenerId"
    );
    const holder = myTeamState[field];
    return el("div", { class: "ss-pick" }, [
      el("div", { class: "ss-pick-label" }, [
        el("span", { text: `本队${ROLE_LABELS[role]}` }),
        el("span", { class: "ss-pick-value", text: holder && room.players[holder] ? room.players[holder].name : "待指派" }),
      ]),
      el(
        "div",
        { class: "ss-pick-options" },
        members.map(([memberId, player]) =>
          el("button", {
            class: `ss-btn ss-btn-chip${holder === memberId ? " is-selected" : ""}`,
            type: "button",
            on: {
              click: () =>
                ctx.act("ASSIGN_ROLE", {
                  team: info.myTeam,
                  role,
                  targetUid: holder === memberId ? null : memberId,
                  // 三个角色集齐时由该动作顺带上锁本轮数字卡，未集齐时会被状态机忽略
                  card: drawCard(),
                }),
            },
          }, [
            avatar(player, { size: "sm" }),
            el("span", { text: `${player.name}${memberId === uid ? "（我）" : ""}` }),
          ]),
        ),
      ),
    ]);
  };

  const waitingForOpponent = isTurnTeam
    ? room.teams[info.opponent].listenerId
      ? `对方已派出监听者：${room.players[room.teams[info.opponent].listenerId]?.name ?? ""}`
      : "等待对方队伍派出监听者…"
    : room.teams[room.turn].describerId && room.teams[room.turn].guesserId
      ? "对方角色已就位，等你派出监听者"
      : "等待对方队伍指派描述者与猜测者…";

  return el("section", { class: "ss-block ss-action-block" }, [
    el("header", { class: "ss-block-head" }, [
      el("h3", { class: "ss-block-title", text: `第 ${room.round} 轮 · 指派角色` }),
      el("span", { class: "ss-block-sub", text: `${room.turn} 队行动` }),
    ]),
    el("p", { class: "ss-hint", text: `${room.turn} 队需要派出描述者与猜测者，另一队派出监听者；三者就位后自动进入描述阶段。` }),
    isTurnTeam
      ? el("div", { class: "ss-pick-grid" }, [picker(ROLE_DESCRIBER), picker(ROLE_GUESSER)])
      : el("div", { class: "ss-pick-grid" }, [picker(ROLE_LISTENER)]),
    el("div", { class: "ss-action-row" }, [
      el("button", {
        class: "ss-btn",
        type: "button",
        text: isTurnTeam ? "自动轮换本队角色" : "自动指派监听者",
        on: { click: () => ctx.act("AUTO_ASSIGN", { team: info.myTeam, card: drawCard() }) },
      }),
      el("span", { class: "ss-hint", text: waitingForOpponent }),
    ]),
  ]);
}

/**
 * 描述阶段。
 * @param {any} ctx
 * @param {{ myTeam: "A" | "B", opponent: "A" | "B", roles: any, isHost: boolean }} info
 * @returns {any}
 */
function describingPanel(ctx, info) {
  const { room, uid } = ctx;
  const isDescriber = uid === info.roles.describerId;
  const card = room.currentCard ?? [];
  const words = room.teams[room.turn].words ?? {};

  if (!isDescriber) {
    return el("section", { class: "ss-block ss-action-block" }, [
      el("header", { class: "ss-block-head" }, [
        el("h3", { class: "ss-block-title", text: "描述者正在编写暗号" }),
        el("span", { class: "ss-block-sub", text: `数字卡对所有人保密，直到本轮公开` }),
      ]),
      el("div", { class: "ss-awaiting" }, [
        el("span", { class: "ss-pulse" }),
        el("p", {
          class: "ss-hint",
          text: `${room.players[info.roles.describerId ?? ""]?.name ?? "描述者"} 正在为 3 个词填写暗号，完成后立刻进入猜测阶段。`,
        }),
      ]),
      hostVoidRow(ctx, info),
    ].filter(Boolean));
  }

  const rows = [];
  for (let i = 0; i < CARD_LENGTH; i += 1) {
    const number = card[i];
    rows.push(
      el("div", { class: "ss-desc-row" }, [
        el("div", { class: "ss-desc-word" }, [
          el("span", { class: "ss-desc-order", text: `第${i + 1}位` }),
          el("span", { class: "ss-desc-number", text: number ? String(number) : "?" }),
          el("span", { class: "ss-desc-text", text: words[String(number)] ?? "—" }),
        ]),
        el("input", {
          id: `ssDesc${i}`,
          class: "ss-input ss-desc-input",
          type: "text",
          maxlength: 24,
          placeholder: "写下暗号…",
          autocomplete: "off",
        }),
      ]),
    );
  }

  return el("section", { class: "ss-block ss-action-block" }, [
    el("header", { class: "ss-block-head" }, [
      el("h3", { class: "ss-block-title", text: "你是本轮描述者" }),
      el("span", { class: "ss-block-sub", text: "只有你能看到数字卡与对应词" }),
    ]),
    el("p", {
      class: "ss-hint",
      text: `按数字卡顺序依次为 3 个词写暗号。你的队友只看到暗号，要凭它还原出 ${formatCard(card)}。`,
    }),
    el("div", { class: "ss-desc-list" }, rows),
    el("div", { class: "ss-action-row" }, [
      el("button", {
        class: "ss-btn ss-btn-primary",
        type: "button",
        text: "提交暗号",
        on: {
          click: () => {
            const values = [];
            for (let i = 0; i < CARD_LENGTH; i += 1) {
              const input = /** @type {any} */ (document.getElementById(`ssDesc${i}`));
              values.push(String(input?.value ?? "").trim());
            }
            if (values.some((value) => !value)) {
              ctx.toast("3 条暗号都要填写");
              return;
            }
            ctx.act("DESCRIBE", { descriptions: values });
          },
        },
      }),
      el("span", { class: "ss-hint", text: "提交后不可修改，且会立即公开给你的队友与对方监听者。" }),
    ]),
    hostVoidRow(ctx, info),
  ].filter(Boolean));
}

/**
 * 猜测阶段。
 * @param {any} ctx
 * @param {{ myTeam: "A" | "B", opponent: "A" | "B", roles: any, isHost: boolean }} info
 * @returns {any}
 */
function guessingPanel(ctx, info) {
  const { room, uid } = ctx;
  const descriptions = room.descriptions ?? [];
  const side = guessSideOf(room, uid);
  const alreadySubmitted = side ? Boolean(room.guesses[side]) : false;

  const clueNodes = descriptions.map((text, index) =>
    el("div", { class: "ss-clue-row" }, [
      el("span", { class: "ss-clue-order", text: `第${index + 1}位` }),
      el("span", { class: "ss-clue-text", text: text }),
    ]),
  );

  const panels = [
    el("header", { class: "ss-block-head" }, [
      el("h3", { class: "ss-block-title", text: "公开暗号" }),
      el("span", { class: "ss-block-sub", text: "数字卡仍然保密，需要还原出顺序" }),
    ]),
    el("div", { class: "ss-clue-list" }, clueNodes),
  ];

  if (side) {
    const roleLabel = side === room.turn ? ROLE_LABELS[ROLE_GUESSER] : ROLE_LABELS[ROLE_LISTENER];
    if (alreadySubmitted) {
      panels.push(
        el("div", { class: "ss-awaiting" }, [
          el("span", { class: "ss-pulse" }),
          el("p", {
            class: "ss-hint",
            text: `你已作为${roleLabel}提交了 ${(room.guesses[side]?.seq ?? []).join("-")}，等待另一方提交后自动结算。`,
          }),
        ]),
      );
    } else {
      panels.push(
        el("div", { class: "ss-guess-block" }, [
          el("div", { class: "ss-guess-head" }, [
            el("h4", { class: "ss-guess-title", text: `你是本轮${roleLabel}` }),
            el("span", { class: "ss-hint", text: "按第 1 位 → 第 3 位依次点名编号" }),
          ]),
          guessPad(ctx),
        ]),
      );
    }
  } else {
    panels.push(
      el("div", { class: "ss-awaiting" }, [
        el("span", { class: "ss-pulse" }),
        el("p", { class: "ss-hint", text: "等待本轮猜测者与监听者提交猜测…" }),
      ]),
    );
  }

  const submittedFlags = [];
  const guesserSubmitted = Boolean(room.guesses[room.turn]);
  const listenerSubmitted = Boolean(room.guesses[otherTeam(room.turn)]);
  submittedFlags.push(
    el("span", { class: `ss-flag${guesserSubmitted ? " is-ok" : ""}`, text: `猜测者${guesserSubmitted ? "已提交" : "未提交"}` }),
  );
  submittedFlags.push(
    el("span", { class: `ss-flag${listenerSubmitted ? " is-ok" : ""}`, text: `监听者${listenerSubmitted ? "已提交" : "未提交"}` }),
  );

  panels.push(el("div", { class: "ss-flag-row" }, submittedFlags));
  panels.push(hostVoidRow(ctx, info));

  return el("section", { class: "ss-block ss-action-block" }, panels.filter(Boolean));
}

/**
 * 猜测输入：3 个槽位 + 数字键盘。
 * @param {any} ctx
 * @returns {any}
 */
function guessPad(ctx) {
  const seq = Array.isArray(ctx.draftGuess) ? ctx.draftGuess : [];

  const slots = [];
  for (let i = 0; i < CARD_LENGTH; i += 1) {
    const value = seq[i];
    slots.push(
      el("button", {
        class: `ss-guess-slot${value ? " is-filled" : ""}`,
        type: "button",
        title: value ? "点击清空这一位及之后" : "待填写",
        on: { click: () => ctx.onDraftGuess(seq.slice(0, i)) },
      }, [
        el("span", { class: "ss-guess-order", text: `第${i + 1}位` }),
        el("span", { class: "ss-guess-value", text: value ? String(value) : "·" }),
      ]),
    );
  }

  const digits = WORD_NUMBERS.map((number) =>
    el("button", {
      class: `ss-guess-digit${seq.includes(number) ? " is-used" : ""}`,
      type: "button",
      text: String(number),
      disabled: seq.includes(number) || seq.length >= CARD_LENGTH,
      on: { click: () => ctx.onDraftGuess([...seq, number]) },
    }),
  );

  return el("div", { class: "ss-guess-pad" }, [
    el("div", { class: "ss-guess-slots" }, slots),
    el("div", { class: "ss-guess-digits" }, digits),
    el("div", { class: "ss-action-row" }, [
      el("button", {
        class: "ss-btn ss-btn-primary",
        type: "button",
        text: "提交猜测",
        disabled: seq.length !== CARD_LENGTH,
        on: {
          click: () => {
            if (seq.length !== CARD_LENGTH) return;
            ctx.act("GUESS", { seq });
            ctx.onDraftGuess([]);
          },
        },
      }),
      el("button", {
        class: "ss-btn ss-btn-ghost",
        type: "button",
        text: "清空",
        disabled: seq.length === 0,
        on: { click: () => ctx.onDraftGuess([]) },
      }),
    ]),
  ]);
}

/**
 * 公开阶段。
 * @param {any} ctx
 * @param {{ myTeam: "A" | "B", opponent: "A" | "B" }} info
 * @returns {any}
 */
function revealPanel(ctx, info) {
  const { room } = ctx;
  const result = room.roundResult;
  if (!result) {
    return el("section", { class: "ss-block ss-action-block" }, [
      el("p", { class: "ss-hint", text: "正在结算本轮…" }),
    ]);
  }

  // ⚠️ 这里只公开"数字卡 ↔ 暗号"的对应关系，绝不能带出原词。
  // 原词要等对局结束才揭晓 —— 否则监听者每轮都直接拿到答案，
  // 靠情报板逐轮逼近对方词汇的玩法就整个失效了。
  const mapping = (result.descriptions ?? []).map((text, index) => {
    const number = result.card?.[index];
    return el("div", { class: "ss-map-row" }, [
      el("span", { class: "ss-map-order", text: `第${index + 1}位` }),
      el("span", { class: "ss-map-number", text: number ? String(number) : "?" }),
      el("span", { class: "ss-map-clue", text: text }),
    ]);
  });

  const verdictRow = (/** @type {string} */ label, /** @type {any} */ guess, /** @type {boolean} */ correct) =>
    el("div", { class: `ss-verdict-row${correct ? " is-ok" : " is-bad"}` }, [
      el("span", { class: "ss-verdict-who", text: label }),
      el("span", { class: "ss-verdict-seq", text: guess ? (guess.seq ?? []).join("-") : "未提交" }),
      el("span", { class: "ss-verdict-result", text: correct ? "猜中" : "未中" }),
    ]);

  const isLast = room.phase === "ended";

  return el("section", { class: "ss-block ss-action-block" }, [
    el("header", { class: "ss-block-head" }, [
      el("h3", { class: "ss-block-title", text: `第 ${result.round} 轮公开` }),
      el("span", { class: "ss-block-sub", text: `数字卡 ${formatCard(result.card)}` }),
    ]),
    result.voided
      ? el("p", { class: "ss-notice", text: "本轮由房主作废，不结算扣血，但暗号已归档进对方情报板。" })
      : null,
    cardDisplay(result.card, { note: `${result.turn} 队的数字卡` }),
    el("div", { class: "ss-map-list" }, mapping),
    el("p", {
      class: "ss-hint",
      text: "本轮只公开数字卡与暗号的对应关系；双方原始词汇要等对局结束才揭晓。",
    }),
    el("div", { class: "ss-verdict-list" }, [
      verdictRow(`${result.turn} 队猜测者`, result.guesserGuess, result.guesserCorrect),
      verdictRow(`${otherTeam(result.turn)} 队监听者`, result.listenerGuess, result.listenerCorrect),
    ]),
    el("div", { class: "ss-delta" }, [
      el("span", { class: `ss-delta-value${result.healthLoss > 0 ? " is-loss" : ""}`, text: result.healthLoss > 0 ? `${result.turn} 队 −${result.healthLoss}` : "无人扣血" }),
      el("span", { class: "ss-delta-health", text: `剩余血量 A ${result.healthAfter?.A ?? "?"} · B ${result.healthAfter?.B ?? "?"}` }),
    ]),
    el("p", {
      class: "ss-hint",
      text: `${otherTeam(result.turn)} 队已把这 3 条暗号归档到自己的情报板对应编号下。`,
    }),
    el("div", { class: "ss-action-row" }, [
      isLast
        ? null
        : el("button", {
            class: "ss-btn ss-btn-primary",
            type: "button",
            text: `进入第 ${room.round + 1} 轮`,
            on: { click: () => ctx.act("NEXT_ROUND", {}) },
          }),
      el("span", { class: "ss-hint", text: isLast ? "" : "任意在场玩家都可以推进" }),
    ].filter(Boolean)),
  ].filter(Boolean));
}

/**
 * 房主专用的"本轮作废"入口：只在必要角色掉线时出现。
 * @param {any} ctx
 * @param {{ roles: any, isHost: boolean }} info
 * @returns {any}
 */
function hostVoidRow(ctx, info) {
  if (!info.isHost) return null;
  const required = [info.roles.describerId, info.roles.guesserId, info.roles.listenerId];
  const offline = required.filter((id) => id && ctx.room.players[id] && !ctx.room.players[id].online);
  if (offline.length === 0) return null;

  return el("div", { class: "ss-void-row" }, [
    el("span", { class: "ss-hint", text: `${offline.length} 位必要角色当前离线，可作废本轮继续对局。` }),
    el("button", {
      class: "ss-btn ss-btn-danger",
      type: "button",
      text: "作废本轮",
      on: { click: () => ctx.act("VOID_ROUND", {}) },
    }),
  ]);
}
