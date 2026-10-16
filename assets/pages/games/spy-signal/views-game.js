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
  TEAM_SIZE,
  WORD_NUMBERS,
  drawCard,
  formatCard,
  otherTeam,
} from "./game-core.js";
import { currentRoles, guessSideOf } from "./room-model.js";
import {
  avatar,
  intelBoard,
  logList,
  ownClues,
  scoreHeader,
  teamTag,
  visibleWords,
  wordBoard,
} from "./views-shared.js";

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

  const action = phaseAction(ctx, { myTeam, opponent, roles, isHost });
  // 轮到我出手时给操作区一道描边：整屏里能点的东西不少，
  // 光靠角色条上一个小小的"我"字，盯着屏幕找自己要按哪个按钮太久。
  if (ctx.myTurn) action.classList.add("is-my-turn");

  return el("div", { class: "ss-game" }, [
    scoreHeader(room, { myTurn: ctx.myTurn }),
    roleBar(ctx, roles),

    action,

    el("div", { class: "ss-board-grid" }, [
      // visibleWords 是唯一出口：对方那块的词在结束前根本取不到。
      // 自己的词板额外带上"我们给过哪些暗号"，下一轮好避开重复的语义。
      wordBoard(visibleWords(room, myTeam, myTeam), {
        title: `我方词板 · ${myTeam} 队`,
        subtitle: "只有你和你队友看得到",
        clues: ownClues(room.teams[myTeam]),
      }),
      wordBoard(visibleWords(room, opponent, myTeam), {
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
 * @param {{ describerId: string | null, guesserId: string | null }} roles
 * @returns {any}
 */
function roleBar(ctx, roles) {
  const { room } = ctx;
  const opponent = otherTeam(room.turn);

  const cell = (/** @type {string} */ label, /** @type {string | null} */ id, /** @type {"A" | "B"} */ team) => {
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
      teamTag(team, { small: true }),
    ].filter(Boolean));
  };

  // 监听方不再指派具体的人：对方队伍任一成员都能提交监听答案，
  // 所以这一格显示的是"哪支队在监听"，而不是某个人的头像。
  const listenerCell = el(
    "div",
    { class: `ss-role-cell is-collective${room.players[ctx.uid]?.team === opponent ? " is-self" : ""}` },
    [
      el("span", { class: "ss-avatar ss-avatar-md is-placeholder is-collective", text: `${TEAM_SIZE}人` }),
      el("div", { class: "ss-role-body" }, [
        el("span", { class: "ss-role-name", text: ROLE_LABELS[ROLE_LISTENER] }),
        el("span", { class: "ss-role-holder", text: `${opponent} 队任一人` }),
      ]),
      teamTag(opponent, { small: true }),
    ],
  );

  return el("section", { class: "ss-role-bar" }, [
    cell(ROLE_LABELS[ROLE_DESCRIBER], roles.describerId, room.turn),
    cell(ROLE_LABELS[ROLE_GUESSER], roles.guesserId, room.turn),
    listenerCell,
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
    const field = /** @type {"describerId" | "guesserId"} */ (
      role === ROLE_DESCRIBER ? "describerId" : "guesserId"
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
                  // 两人都就位时由该动作顺带上锁本轮数字卡，缺一个时会被状态机忽略
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

  // 监听方不需要任何准备动作，所以对"轮到对方行动"的那一队，这一屏只有等待。
  if (!isTurnTeam) {
    const turnTeam = room.turn;
    const ready = Boolean(room.teams[turnTeam].describerId) && Boolean(room.teams[turnTeam].guesserId);
    return el("section", { class: "ss-block ss-action-block" }, [
      el("header", { class: "ss-block-head" }, [
        el("h3", { class: "ss-block-title", text: `第 ${room.round} 轮 · 等待 ${turnTeam} 队出暗号` }),
        el("span", { class: "ss-block-sub", text: `${turnTeam} 队行动` }),
      ]),
      el("div", { class: "ss-awaiting" }, [
        el("span", { class: "ss-pulse" }),
        el("p", {
          class: "ss-hint",
          text: ready
            ? `${turnTeam} 队角色已就位，正在编写暗号。`
            : `等待 ${turnTeam} 队指派描述者与猜测者…`,
        }),
      ]),
      el("p", {
        class: "ss-hint",
        text: `本轮由你（${info.myTeam} 队）监听：不用指派谁，暗号公开后你们队任一人提交答案即可。`,
      }),
    ]);
  }

  const waitingForOpponent = room.teams[room.turn].describerId && room.teams[room.turn].guesserId
    ? "本队角色已就位，暗号锁定中…"
    : `${info.opponent} 队不需要派人，暗号公开后他们队任一人提交监听答案即可。`;

  return el("section", { class: "ss-block ss-action-block" }, [
    el("header", { class: "ss-block-head" }, [
      el("h3", { class: "ss-block-title", text: `第 ${room.round} 轮 · 指派角色` }),
      el("span", { class: "ss-block-sub", text: `${room.turn} 队行动` }),
    ]),
    el("p", { class: "ss-hint", text: `${room.turn} 队需要派出描述者与猜测者（两人各占一个，不能是同一人）；两人就位后自动进入描述阶段。` }),
    el("div", { class: "ss-pick-grid" }, [picker(ROLE_DESCRIBER), picker(ROLE_GUESSER)]),
    el("div", { class: "ss-action-row" }, [
      el("button", {
        class: "ss-btn",
        type: "button",
        text: "自动轮换本队角色",
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
  // 走同一个出口：描述者属于本轮行动队，所以能拿到本队的词；其余人拿到空对象。
  const words = visibleWords(room, room.turn, info.myTeam);

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
      el("span", { class: "ss-hint", text: "提交后不可修改，且会立即公开给你的队友与对方队伍（监听方）。" }),
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
    const isGuesserSide = side === room.turn;
    const submitted = room.guesses[side];
    if (alreadySubmitted && submitted) {
      // 监听方是"整队共用一个答案"，提交的很可能是队友而不是自己，
      // 光说"你已提交"会让人以为自己点过（早先就是这样）。
      const byMe = submitted.by === uid;
      const seq = (submitted.seq ?? []).join("-");
      const waiting = isGuesserSide
        ? "等待监听方提交后自动结算。"
        : "等待对方猜测者提交后自动结算。";
      panels.push(
        el("div", { class: "ss-awaiting" }, [
          el("span", { class: "ss-pulse" }),
          el("p", {
            class: "ss-hint",
            text: byMe
              ? `你已提交${isGuesserSide ? `猜测 ${seq}` : `监听答案 ${seq}`}，${waiting}`
              : `队友 ${room.players[submitted.by]?.name ?? ""} 已提交本轮的监听答案 ${seq}（先提交的算数），${waiting}`,
          }),
        ]),
      );
    } else {
      panels.push(
        el("div", { class: "ss-guess-block" }, [
          el("div", { class: "ss-guess-head" }, [
            el("h4", {
              class: "ss-guess-title",
              text: isGuesserSide ? `你是本轮${ROLE_LABELS[ROLE_GUESSER]}` : "本轮由你们队监听",
            }),
            el("span", {
              class: "ss-hint",
              text: isGuesserSide
                ? "按第 1 位 → 第 3 位依次点名编号"
                : "队里谁提交都行，先提交的那份算数",
            }),
          ]),
          guessPad(ctx),
        ]),
      );
    }
  } else {
    panels.push(
      el("div", { class: "ss-awaiting" }, [
        el("span", { class: "ss-pulse" }),
        el("p", { class: "ss-hint", text: "等待本轮猜测者与监听方提交猜测…" }),
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
    el("span", { class: `ss-flag${listenerSubmitted ? " is-ok" : ""}`, text: `监听方${listenerSubmitted ? "已提交" : "未提交"}` }),
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
      ? el("p", {
          class: "ss-notice",
          // 作废轮在 reducer 里既不扣血也不写 intel / clues（见 reduceVoidRound），
          // 早先这里写着"暗号已归档"是不对的，会让人以为情报板多了一条。
          text: "本轮由房主作废：不结算扣血，暗号也不会计入双方情报板与暗号史。",
        })
      : null,
    // 原数字卡大图已删除：下面的对应关系表里每位都带编号，那张卡纯属重复，
    // 而且它连同旁边的内容一起被误认为"原词就显示在这里"。
    el("div", { class: "ss-map-list" }, mapping),
    el("p", {
      class: "ss-hint",
      text: "本轮只公开编号与暗号的对应关系；双方原始词汇要等对局结束才揭晓。",
    }),
    el("div", { class: "ss-verdict-list" }, [
      verdictRow(`${result.turn} 队猜测者`, result.guesserGuess, result.guesserCorrect),
      verdictRow(`${otherTeam(result.turn)} 队监听方`, result.listenerGuess, result.listenerCorrect),
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
 * 房主专用的"本轮作废"入口：只在**本轮已经没法继续**时出现。
 *
 * 判据分三种：
 * 1. 描述者 / 猜测者**掉线**；
 * 2. 描述者 / 猜测者**槽位空着** —— 对局中途有人点「退出」时 `reduceLeave()` 会
 *    `clearRoles()` 而**保留当前阶段**，于是场上再没有人能描述或提交猜测。
 *    这种局面比掉线更死：掉线的人好歹还能回来，退出的座位是空的了。
 *    ⚠️ 早先这里只看"在线与否"，槽位空着（`id` 为 null）时既不报 blocker、
 *    监听方又还有人在线，按钮就永远不出现 —— 本轮彻底卡死，而房间的闲置 TTL
 *    还要求全员离线，连自动释放都等不到。
 * 3. 监听方**整队都没人在线**：监听方只要还剩一个人在线，本轮就还能正常推进
 *    （对方任一成员都能提交监听答案）。
 *
 * 只在 `describing` / `guessing` 两屏调用，那两个阶段角色槽本来必定是齐的，
 * 所以"空着"一定意味着有人中途离场。
 * @param {any} ctx
 * @param {{ roles: any, isHost: boolean }} info
 * @returns {any}
 */
function hostVoidRow(ctx, info) {
  if (!info.isHost) return null;
  const { room } = ctx;

  const blockers = [];
  const slots = [
    [ROLE_LABELS[ROLE_DESCRIBER], info.roles.describerId],
    [ROLE_LABELS[ROLE_GUESSER], info.roles.guesserId],
  ];
  for (const [label, id] of slots) {
    const player = id ? room.players[id] : null;
    if (!player) blockers.push(`${label}席位空缺`);
    else if (!player.online) blockers.push(`${label}「${player.name}」离线`);
  }

  const listenerTeam = otherTeam(room.turn);
  const listenerReachable = Object.values(room.players).some(
    (player) => player.team === listenerTeam && player.online,
  );
  if (!listenerReachable) blockers.push(`${listenerTeam} 队监听方（全员离线）`);

  if (blockers.length === 0) return null;

  return el("div", { class: "ss-void-row" }, [
    el("span", { class: "ss-hint", text: `${blockers.join("、")}，本轮已无法继续，可作废后接着打。` }),
    el("button", {
      class: "ss-btn ss-btn-danger",
      type: "button",
      text: "作废本轮",
      on: { click: () => ctx.act("VOID_ROUND", {}) },
    }),
  ]);
}
