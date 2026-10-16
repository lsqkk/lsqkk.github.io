// @ts-check
/**
 * 「谍报风云」可复用界面部件。
 *
 * 部件只负责"把数据画出来"，所有交互通过 `ctx.act()` 抛给控制器，
 * 因此本文件不直接接触 Firebase。
 */

import { el, frag } from "./dom.js";
import { OFFLINE_KICK_MS, ROLE_LABELS, TEAM_SIZE, WORD_NUMBERS, formatCard, otherTeam } from "./game-core.js";
import { cluesOf, entriesOf, intelOf, playersByTeam } from "./room-model.js";
import { serverNow } from "./rtdb.js";

/**
 * 界面层与控制器之间的契约：视图只读 `room`，其余一律通过回调交回控制器。
 * @typedef {object} ViewContext
 * @property {import("./room-model.js").Room} room
 * @property {string} uid
 * @property {string} roomId
 * @property {string | null} releaseHint 房间自动释放的倒计时提示
 * @property {(type: string, payload?: Record<string, unknown>) => Promise<boolean>} act 返回事务是否提交；视图据此决定要不要把用户输入还回去
 * @property {(message: string, tone?: string) => void} toast
 * @property {() => void} copyRoomCode
 * @property {() => void} confirmLeave
 * @property {() => void} onReroll
 * @property {() => void} onRestart
 * @property {(team: "A" | "B") => void} onSwitchTeam 把自己换到另一队
 * @property {(targetUid: string, name: string) => void} onKick 房主手动移出离线玩家
 * @property {number[]} draftGuess 猜测面板的草稿序列（存在控制器里，重绘不丢）
 * @property {(seq: number[]) => void} onDraftGuess
 */

/**
 * 掉线倒计时的文案。
 *
 * 由 `views-shared` 提供、控制器每秒直接改文本节点用 ——
 * 倒计时每秒变一次，整屏重绘的代价远大于改一个 span 的 textContent。
 * @param {number} leftMs
 * @returns {string}
 */
export function offlineCountdownText(leftMs) {
  if (leftMs <= 0) return "即将移出…";
  const total = Math.ceil(leftMs / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `离线 ${minutes}:${String(seconds).padStart(2, "0")} 后移出`;
}

/**
 * 现在是否处在"可以挪动座位"的阶段：只有大厅 / 准备阶段允许换队与移出。
 * @param {import("./room-model.js").Room} room
 * @returns {boolean}
 */
export function seatChangeAllowed(room) {
  return room.phase === "lobby" || room.phase === "prepare";
}

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
 * 把 URL 包成可以安全写进 CSS 的 `url("…")`。
 *
 * 含引号 / 括号 / 反斜杠 / 空白的地址直接判空：`sanitizeAvatar()` 放行的是**原始字符串**
 * （它只校验解析出来的 host 与后缀），所以形如 `https://avatars.githubusercontent.com/u/1?v=4"`
 * 这种地址能通过校验、却会把 `url("…")` 提前闭合掉。这里再挡一次。
 * @param {unknown} value
 * @returns {string}
 */
export function safeCssUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  // sanitizeAvatar 已限制过来源，这里再挡一次 CSS 注入
  if (/["'()\\\s]/.test(raw)) return "";
  return `url("${raw}")`;
}

/**
 * 玩家头像：有图用图，没图就用底色 + 昵称首字。
 *
 * 入参兼容两种形状，否则很容易"静默退化成首字圆圈"：
 *  - 房间里的玩家对象：`{ name, avatarType, avatarColor, avatarUrl }`
 *  - `sanitizeAvatar()` 的返回值：`{ type, color, url }`
 *
 * @param {any} source
 * @param {{ size?: "sm" | "md" | "lg" }} [options]
 * @returns {any}
 */
export function avatar(source, options = {}) {
  const size = options.size ?? "md";
  const name = String(source?.name ?? "");
  const initial = name ? [...name][0] : "?";

  const type = source?.avatarType ?? source?.type ?? "color";
  const color = source?.avatarColor ?? source?.color ?? "var(--accent)";
  const rawUrl = source?.avatarUrl ?? source?.url ?? "";
  const imageUrl = type === "image" ? safeCssUrl(rawUrl) : "";

  /** @type {Record<string, string>} */
  const style = {};
  if (imageUrl) style.backgroundImage = imageUrl;
  else style.background = color || "var(--accent)";

  const node = el("span", {
    class: `ss-avatar ss-avatar-${size}${imageUrl ? " is-image" : ""}`,
    style,
    attrs: { "aria-hidden": "true" },
  });
  if (!imageUrl) node.textContent = initial;
  return node;
}

/**
 * 头像 + 在线小圆点。
 * @param {import("./room-model.js").Player} player
 * @param {{ size?: "sm" | "md" | "lg" }} [options]
 * @returns {any}
 */
export function avatarWithPresence(player, options = {}) {
  return el("span", { class: "ss-avatar-wrap" }, [
    avatar(player, options),
    el("i", {
      class: `ss-avatar-dot${player?.online === false ? " is-offline" : ""}`,
      title: player?.online === false ? "已离线" : "在线",
    }),
  ]);
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
    // 早先这里还给每个格子写了 animationDelay，但 .ss-pip 早已没有任何动画，
    // 那段 style 是死代码，顺带去掉
    pips.push(el("i", { class: `ss-pip${i < health ? " is-full" : ""}` }));
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
  /** 这一行的玩家本人是不是房主（用来挂「房主」标记） */
  const isHost = uid === ctx.room.meta.hostId;
  /** 正在看这个界面的我是不是房主（用来决定我有没有权限移出别人） */
  const viewerIsHost = ctx.room.meta.hostId === ctx.uid;
  const isTurnTeam = player.team === ctx.room.turn;
  const canManageSeat = seatChangeAllowed(ctx.room);

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

  // 掉线倒计时。id 固定成 ssOffline-{uid}，控制器每秒只改这一行的文字，
  // 不做整屏重绘（每秒重建一次界面比原来的"抖动"还晃眼）。
  // 用 serverNow() 与巡检、reducer 保持同一个时钟，免得显示和实际动手的时机对不上。
  const countdown =
    canManageSeat && player.online === false && player.offlineAt
      ? el("span", {
          class: "ss-offline-count",
          id: `ssOffline-${uid}`,
          text: offlineCountdownText(player.offlineAt + OFFLINE_KICK_MS - serverNow()),
        })
      : null;

  /** @type {any[]} */
  const actions = [];
  if (canManageSeat) {
    // 离线的人才需要腾位子；在线的人想走会自己点「退出」
    if (viewerIsHost && !isSelf && player.online === false) {
      actions.push(
        el("button", {
          class: "ss-btn ss-btn-danger ss-btn-mini",
          type: "button",
          text: "移出",
          title: `把「${player.name}」移出房间`,
          on: { click: () => ctx.onKick(uid, player.name) },
        }),
      );
    }
    if (isSelf && !player.online) {
      actions.push(el("span", { class: "ss-mini-tag ss-mini-tag-warn", text: "你已离线" }));
    }
    if (isSelf) {
      const target = otherTeam(player.team);
      // 复用 room-model 的分组结果，别在这儿再数一遍
      const targetCount = playersByTeam(ctx.room)[target].length;
      if (targetCount < TEAM_SIZE) {
        actions.push(
          el("button", {
            class: "ss-btn ss-btn-ghost ss-btn-mini",
            type: "button",
            text: `换到 ${target} 队`,
            on: { click: () => ctx.onSwitchTeam(target) },
          }),
        );
      }
    }
  }

  // 右侧那一组（已准备 / 换队 / 移出）包在一个容器里：
  // flex 里同时给两个元素挂 margin-left:auto 的话，空白会被均分到中间去。
  const tail = [
    player.ready && (ctx.room.phase === "lobby" || ctx.room.phase === "prepare")
      ? el("span", { class: "ss-ready-mark", text: "已准备" })
      : null,
    actions.length ? el("span", { class: "ss-player-actions" }, actions) : null,
  ].filter(Boolean);

  return el(
    "div",
    {
      class: `ss-player-row${isSelf ? " is-self" : ""}${player.online ? "" : " is-offline"}${
        isTurnTeam && ctx.room.phase !== "lobby" ? " is-turn-team" : ""
      }`,
    },
    [
      avatarWithPresence(player),
      el("span", { class: "ss-player-name", text: player.name }),
      countdown,
      el("span", { class: "ss-player-tags" }, tags),
      tail.length ? el("span", { class: "ss-player-tail" }, tail) : null,
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
    const empty = Math.max(0, TEAM_SIZE - members.length);
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
 * 取某队的秘密词用于渲染 —— **全站唯一的出口**。
 *
 * 只有两种情况允许拿到真实词：
 *   1. 看的正是自己队；
 *   2. 对局已经结束（`phase === 'ended'`）。
 *
 * 其它任何情况一律返回空对象，因此调用方**没有机会**把对方的词渲染出去。
 * 早先靠各调用点自己传 `reveal: true/false` 开关，一旦某个分支写错就会直接泄露
 * （结算面板就曾因此把行动方原词公开给双方）。现在改成"拿不到词"而不是"记得别显示"。
 *
 * @param {import("./room-model.js").Room | null | undefined} room
 * @param {import("./room-model.js").Team} team
 * @param {import("./room-model.js").Team} viewerTeam
 * @returns {Record<string, string>}
 */
export function visibleWords(room, team, viewerTeam) {
  if (!room || !team) return {};
  if (team !== viewerTeam && room.phase !== "ended") return {};
  return room.teams?.[team]?.words ?? {};
}

/**
 * 秘密词板。
 *
 * `words` 必须来自 `visibleWords()` —— 拿不到的词不会传进来，
 * 所以这里没有"要不要显示"的开关，没有词就自然是问号。
 *
 * `clues` 是**本队自己给过**的暗号（`cluesOf()` 的返回值，按编号分组）。
 * 它在词的下方逐轮列出，用来提醒下一轮换一套语义：
 * 同一个词连着给两条语义相近的暗号，对方把两条线索一对照就能锁定原词。
 * 传 null 就不渲染这一块（对方词板永远是 null）。
 *
 * @param {Record<string, string> | null | undefined} words
 * @param {{
 *   title: string,
 *   subtitle?: string,
 *   clues?: Record<string, { round: number, text: string }[]> | null,
 * }} options
 * @returns {any}
 */
export function wordBoard(words, options) {
  const clueMap = options.clues ?? null;

  /** @param {number} number */
  const clueList = (number) => {
    const entries = clueMap?.[String(number)] ?? [];
    if (entries.length === 0) return null;
    return el(
      "ul",
      { class: "ss-word-clues", attrs: { "aria-label": `${number} 号词给过的暗号` } },
      entries.map((entry) =>
        el("li", { class: "ss-word-clue" }, [
          el("span", { class: "ss-word-clue-round", text: `第${entry.round}轮` }),
          el("span", { class: "ss-word-clue-text", text: entry.text }),
        ]),
      ),
    );
  };

  const rows = WORD_NUMBERS.map((number) => {
    const word = words?.[String(number)];
    const hidden = !word;
    const clues = hidden ? null : clueList(number);
    return el("div", { class: `ss-word-row${hidden ? " is-hidden" : ""}` }, [
      el("span", { class: "ss-word-number", text: String(number) }),
      el("div", { class: "ss-word-body" }, [
        el("span", { class: "ss-word-text", text: hidden ? "？？？" : String(word) }),
        clues,
      ].filter(Boolean)),
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
 * 本队词板的暗号史，直接喂给 `wordBoard` 的 `clues`。
 *
 * 只对**能看到那块词板的人**有意义（即自己的队），所以这里不做什么权限判断 ——
 * 调用点本来就只在渲染自己词板时才调它。
 * @param {import("./room-model.js").TeamState | null | undefined} teamState
 * @returns {Record<string, { round: number, text: string }[]>}
 */
export function ownClues(teamState) {
  if (!teamState) return {};
  /** @type {Record<string, { round: number, text: string }[]>} */
  const out = {};
  for (const number of WORD_NUMBERS) {
    out[String(number)] = cluesOf(teamState, number);
  }
  return out;
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
                // ⚠️ 必须先清空再派发：`ctx.act()` 会触发整屏重绘，
                // 事后再清只会清到一个已经脱离文档的旧节点上（新节点会把旧值还原回来）。
                if (input) input.value = "";
                ctx.act("ADD_NOTE", {
                  team,
                  number: String(number),
                  text,
                  noteId: `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
                }).then((ok) => {
                  // 事务被拒（或写失败）时笔记没落库，把内容还给用户；
                  // 按 id 重新取节点，免得中途整屏重绘过、拿到的是旧节点。
                  if (ok) return;
                  const back = /** @type {any} */ (document.getElementById(inputId));
                  if (back) back.value = text;
                });
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
        text: `监听方${log.listenerCorrect ? "猜中" : "未猜中"}`,
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
