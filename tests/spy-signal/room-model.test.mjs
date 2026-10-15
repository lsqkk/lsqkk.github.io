/**
 * 「谍报风云」状态机测试。
 *
 * 由于所有对局变更都收敛到 room-model.js 的纯函数 applyAction()，
 * 这里可以在没有任何网络 / DOM 的情况下把整局游戏跑完，
 * 覆盖扣血判定、情报归档、回合切换与越权提交等容易出错的地方。
 *
 * 运行：npm run test:spy-signal
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  WORD_NUMBERS,
  ROLE_DESCRIBER,
  ROLE_GUESSER,
  ROLE_LISTENER,
  drawCard,
  isCorrect,
  isValidSequence,
  judgeRound,
  otherTeam,
} from "../../assets/pages/games/spy-signal/game-core.js";
import {
  applyAction,
  createEmptyRoom,
  intelOf,
  normalizeRoom,
  playersByTeam,
} from "../../assets/pages/games/spy-signal/room-model.js";

const HOST = "pHOST";
const A1 = HOST;
const A2 = "pA2";
const B1 = "pB1";
const B2 = "pB2";
const CARD = [2, 4, 1];
const A_WORDS = ["老虎", "梧桐", "火锅", "地铁"];
const B_WORDS = ["企鹅", "玫瑰", "面条", "潜艇"];

/**
 * 模拟 RTDB 的读写：丢掉 null 与空对象（Firebase 不会保存它们），
 * 再经 normalizeRoom 补回默认值。这样能暴露"写进去读不回来"的形状问题。
 * @param {any} value
 * @returns {any}
 */
function stripForRtdb(value) {
  if (Array.isArray(value)) return value.map(stripForRtdb);
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (item === null || item === undefined) continue;
      const stripped = stripForRtdb(item);
      if (
        stripped &&
        typeof stripped === "object" &&
        !Array.isArray(stripped) &&
        Object.keys(stripped).length === 0
      ) {
        continue;
      }
      out[key] = stripped;
    }
    return out;
  }
  return value;
}

/**
 * 一次完整的"经服务器往返"。
 * @param {any} room
 * @returns {any}
 */
function roundTrip(room) {
  return normalizeRoom(stripForRtdb(JSON.parse(JSON.stringify(room))));
}

/**
 * 递归冻结，用来证明 applyAction 不修改入参（并发安全的前提）。
 * @template T
 * @param {T} value
 * @returns {T}
 */
function deepFreeze(value) {
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}

/**
 * @param {any} room
 * @param {string} type
 * @param {string} actorId
 * @param {Record<string, unknown>} [payload]
 * @returns {any}
 */
function act(room, type, actorId, payload) {
  return applyAction(deepFreeze(room), { type, actorId, payload });
}

/**
 * 断言动作被拒绝（applyAction 返回 undefined）。
 * @param {any} room
 * @param {string} type
 * @param {string} actorId
 * @param {Record<string, unknown>} [payload]
 */
function actRejected(room, type, actorId, payload) {
  assert.equal(
    act(room, type, actorId, payload),
    undefined,
    `${type} 本应被拒绝`,
  );
}

/**
 * 建好一个满员且已发牌的房间。
 * @param {number} [healthMax]
 * @returns {any}
 */
function makeReadyRoom(healthMax = 3) {
  // 入座顺序决定分队（人少的一队优先补位）：房主→B、再→A、再→B
  let room = act(null, "CREATE_ROOM", HOST, { name: "房主", healthMax });
  room = roundTrip(room);
  room = act(room, "JOIN", B1, { name: "贝一" });
  room = roundTrip(room);
  room = act(room, "JOIN", A2, { name: "阿二" });
  room = roundTrip(room);
  room = act(room, "JOIN", B2, { name: "贝二" });
  room = roundTrip(room);
  room = act(room, "DEAL_WORDS", HOST, { words: { A: A_WORDS, B: B_WORDS } });
  return roundTrip(room);
}

/**
 * 让四人都准备。
 * @param {any} room
 * @returns {any}
 */
function readyAll(room) {
  let next = room;
  for (const uid of [A1, A2, B1, B2]) {
    next = roundTrip(act(next, "SET_READY", uid, { ready: true }));
  }
  return next;
}

/**
 * 指派角色并进入描述阶段。
 * @param {any} room
 * @param {number[]} [card]
 * @returns {any}
 */
function assignRoles(room, card = CARD) {
  let next = room;
  if (next.phase === "prepare") {
    next = roundTrip(act(next, "START", HOST));
  }
  const turn = next.turn;
  const opposite = otherTeam(turn);
  next = roundTrip(
    act(next, "ASSIGN_ROLE", turn === "A" ? A1 : B1, {
      team: turn,
      role: ROLE_DESCRIBER,
      targetUid: turn === "A" ? A1 : B1,
      card,
    }),
  );
  next = roundTrip(
    act(next, "ASSIGN_ROLE", turn === "A" ? A1 : B1, {
      team: turn,
      role: ROLE_GUESSER,
      targetUid: turn === "A" ? A2 : B2,
      card,
    }),
  );
  next = roundTrip(
    act(next, "ASSIGN_ROLE", opposite === "A" ? A1 : B1, {
      team: opposite,
      role: ROLE_LISTENER,
      targetUid: opposite === "A" ? A1 : B1,
      card,
    }),
  );
  return next;
}

describe("game-core 基础判定", () => {
  it("数字卡是 1-4 中不重复的 3 个数字", () => {
    for (let i = 0; i < 200; i += 1) {
      const card = drawCard();
      assert.equal(card.length, 3);
      assert.equal(new Set(card).size, 3);
      for (const number of card) {
        assert.ok(WORD_NUMBERS.includes(number));
      }
    }
  });

  it("序列校验拒绝重复、越界与长度不符", () => {
    assert.equal(isValidSequence([1, 2, 3]), true);
    assert.equal(isValidSequence([1, 1, 2]), false, "重复数字");
    assert.equal(isValidSequence([1, 2, 5]), false, "越界");
    assert.equal(isValidSequence([1, 2]), false, "长度不足");
    assert.equal(isValidSequence([1, 2, 3, 4]), false, "长度超出");
    assert.equal(isValidSequence(null), false);
  });

  it("判定扣血时顺序敏感，且扣血可叠加到 2", () => {
    const card = [1, 2, 3];
    assert.deepEqual(judgeRound({ card, guesserGuess: [1, 2, 3], listenerGuess: null }), {
      guesserCorrect: true,
      listenerCorrect: false,
      healthLoss: 0,
    });
    assert.deepEqual(judgeRound({ card, guesserGuess: [3, 2, 1], listenerGuess: null }), {
      guesserCorrect: false,
      listenerCorrect: false,
      healthLoss: 1,
    });
    assert.deepEqual(judgeRound({ card, guesserGuess: [3, 2, 1], listenerGuess: [1, 2, 3] }), {
      guesserCorrect: false,
      listenerCorrect: true,
      healthLoss: 2,
    });
    assert.deepEqual(judgeRound({ card, guesserGuess: [1, 2, 3], listenerGuess: [1, 2, 3] }), {
      guesserCorrect: true,
      listenerCorrect: true,
      healthLoss: 1,
    });
    assert.equal(isCorrect([1, 2, 4], card), false);
  });
});

describe("房间组建", () => {
  it("创建者可建房，且只有一次能成功创建同一个房间码", () => {
    const room = act(null, "CREATE_ROOM", HOST, { name: "房主", healthMax: 4 });
    assert.equal(room.phase, "lobby");
    assert.equal(room.meta.hostId, HOST);
    assert.equal(room.meta.healthMax, 4);
    assert.equal(room.teams.A.health, 4);
    assert.equal(room.players[HOST].team, "A");
    assert.equal(room.players[HOST].name, "房主");

    // 房间码已被占用：同一个房间节点上再次创建必须失败
    assert.equal(applyAction(room, { type: "CREATE_ROOM", actorId: "pX" }), undefined);
  });

  it("血量被限制在 2-4 之间", () => {
    assert.equal(act(null, "CREATE_ROOM", HOST, { healthMax: 99 }).meta.healthMax, 4);
    assert.equal(act(null, "CREATE_ROOM", HOST, { healthMax: 0 }).meta.healthMax, 2);
    assert.equal(act(null, "CREATE_ROOM", HOST, { healthMax: "abc" }).meta.healthMax, 3);
  });

  it("满 4 人自动进入准备阶段，两队各 2 人", () => {
    const room = makeReadyRoom();
    assert.equal(room.phase, "prepare");
    assert.equal(Object.keys(room.players).length, 4);
    const grouped = playersByTeam(room);
    assert.deepEqual(grouped.A.map((entry) => entry.uid), [A1, A2]);
    assert.deepEqual(grouped.B.map((entry) => entry.uid), [B1, B2]);
  });

  it("满员后不再接受新玩家", () => {
    actRejected(makeReadyRoom(), "JOIN", "pLATE", { name: "迟到者" });
  });

  it("发牌后两队各拿到 4 个词，且开局前可以重新随机", () => {
    let room = makeReadyRoom();
    assert.deepEqual(
      [1, 2, 3, 4].map((n) => room.teams.A.words[String(n)]),
      A_WORDS,
    );

    // 换词会清掉本队准备状态
    room = readyAll(room);
    room = roundTrip(
      act(room, "REROLL", A2, { words: ["苹果", "月亮", "哨兵", "雨伞"] }),
    );
    assert.equal(room.teams.A.words["1"], "苹果");
    assert.equal(room.players[A1].ready, false, "换词后本队需要重新准备");
    assert.equal(room.players[B1].ready, true, "不该影响对方队伍");

    // 对局开始后不能再换词
    let playing = assignRoles(readyAll(makeReadyRoom()));
    actRejected(playing, "REROLL", A1, { words: ["一", "二", "三", "四"] });
  });

  it("准备不齐时房主也无法开始", () => {
    const room = makeReadyRoom();
    actRejected(room, "START", HOST);
    const ready = readyAll(room);
    const started = act(ready, "START", HOST);
    assert.equal(started.phase, "select-role");
    assert.equal(started.turn, "A");
    assert.equal(started.round, 1);
  });
});

describe("回合流程", () => {
  it("三角色就位后自动进入描述阶段并锁定数字卡", () => {
    const room = assignRoles(readyAll(makeReadyRoom()));
    assert.equal(room.phase, "describing");
    assert.deepEqual(room.currentCard, CARD);
    assert.equal(room.teams.A.describerId, A1);
    assert.equal(room.teams.A.guesserId, A2);
    assert.equal(room.teams.B.listenerId, B1);
  });

  it("描述者与猜测者不能是同一人", () => {
    let room = readyAll(makeReadyRoom());
    room = roundTrip(act(room, "START", HOST));
    room = roundTrip(
      act(room, "ASSIGN_ROLE", A1, {
        team: "A",
        role: ROLE_DESCRIBER,
        targetUid: A1,
        card: CARD,
      }),
    );
    room = roundTrip(
      act(room, "ASSIGN_ROLE", A1, {
        team: "A",
        role: ROLE_GUESSER,
        targetUid: A1, // 与描述者同一人
        card: CARD,
      }),
    );
    assert.equal(room.teams.A.describerId, null, "被顶掉的槽位要清空");
    assert.equal(room.teams.A.guesserId, A1);
    assert.equal(room.phase, "select-role", "角色不完整时不能进入描述阶段");
  });

  it("队伍只能指派自己这一侧的角色", () => {
    let room = readyAll(makeReadyRoom());
    room = roundTrip(act(room, "START", HOST));
    // A 队不能替 B 队选监听者
    actRejected(room, "ASSIGN_ROLE", A1, {
      team: "B",
      role: ROLE_LISTENER,
      targetUid: B1,
    });
    // 行动队不能指派监听者
    actRejected(room, "ASSIGN_ROLE", A1, {
      team: "A",
      role: ROLE_LISTENER,
      targetUid: A2,
    });
  });

  it("自动轮换在两名队员之间交替角色", () => {
    let room = readyAll(makeReadyRoom());
    room = roundTrip(act(room, "START", HOST));
    room = roundTrip(act(room, "AUTO_ASSIGN", A1, { team: "A", card: CARD }));
    assert.notEqual(room.teams.A.describerId, room.teams.A.guesserId);
    assert.ok([A1, A2].includes(room.teams.A.describerId));
    assert.ok([A1, A2].includes(room.teams.A.guesserId));
  });

  it("只有描述者能提交暗号，其他人被拒绝", () => {
    let room = assignRoles(readyAll(makeReadyRoom()));
    const descriptions = ["森林之王", "落叶乔木", "锅里翻滚"];

    actRejected(room, "DESCRIBE", A2, { descriptions });
    actRejected(room, "DESCRIBE", B1, { descriptions });
    actRejected(room, "DESCRIBE", A1, { descriptions: ["", "b", "c"] });

    room = roundTrip(act(room, "DESCRIBE", A1, { descriptions }));
    assert.equal(room.phase, "guessing");
    assert.deepEqual(roundTrip(room).descriptions, descriptions);
  });

  it("猜测阶段只有猜测者与监听者能提交，且各自只能提交一次", () => {
    let room = assignRoles(readyAll(makeReadyRoom()));
    room = roundTrip(act(room, "DESCRIBE", A1, { descriptions: ["甲", "乙", "丙"] }));

    actRejected(room, "GUESS", A1, { seq: [1, 2, 3] });
    actRejected(room, "GUESS", B2, { seq: [1, 2, 3] });
    actRejected(room, "GUESS", A2, { seq: [1, 1, 2] });

    room = roundTrip(act(room, "GUESS", A2, { seq: [2, 4, 1] }));
    assert.equal(room.phase, "guessing", "只有一方提交时不应结算");
    assert.deepEqual(room.guesses.A.seq, [2, 4, 1]);
    assert.equal(room.guesses.B, null);

    actRejected(room, "GUESS", A2, { seq: [1, 2, 3] });
  });

  it("双方提交后结算：猜测者猜错 + 监听者猜中 = 扣 2 血", () => {
    let room = assignRoles(readyAll(makeReadyRoom()), CARD);
    const descriptions = ["雪地猎手", "树皮发白", "铜锅涮肉"];
    room = roundTrip(act(room, "DESCRIBE", A1, { descriptions }));
    room = roundTrip(act(room, "GUESS", A2, { seq: [1, 2, 3] })); // 猜错
    room = roundTrip(act(room, "GUESS", B1, { seq: CARD })); // 监听者猜中

    assert.equal(room.phase, "reveal");
    assert.equal(room.teams.A.health, 1);
    assert.equal(room.teams.B.health, 3, "监听者所属队伍不扣血");
    assert.equal(room.roundResult.healthLoss, 2);
    assert.equal(room.roundResult.guesserCorrect, false);
    assert.equal(room.roundResult.listenerCorrect, true);
  });

  it("结算后暗号按编号归档到对方情报板，行动方自己不获得线索", () => {
    let room = assignRoles(readyAll(makeReadyRoom()), CARD);
    const descriptions = ["雪地猎手", "树皮发白", "铜锅涮肉"];
    room = roundTrip(act(room, "DESCRIBE", A1, { descriptions }));
    room = roundTrip(act(room, "GUESS", A2, { seq: [2, 4, 1] }));
    room = roundTrip(act(room, "GUESS", B1, { seq: [2, 4, 1] }));

    // CARD = [2,4,1]，对应暗号依次落到 B 队情报板的 2 / 4 / 1 号下
    assert.deepEqual(intelOf(room.teams.B, 2), ["雪地猎手"]);
    assert.deepEqual(intelOf(room.teams.B, 4), ["树皮发白"]);
    assert.deepEqual(intelOf(room.teams.B, 1), ["铜锅涮肉"]);
    assert.deepEqual(intelOf(room.teams.B, 3), []);
    // A 队不会因为自己的回合得到线索
    for (const number of WORD_NUMBERS) {
      assert.deepEqual(intelOf(room.teams.A, number), []);
    }
  });

  it("公开阶段可以推进到下一轮，行动方交替且角色清空", () => {
    let room = assignRoles(readyAll(makeReadyRoom()));
    room = roundTrip(act(room, "DESCRIBE", A1, { descriptions: ["甲", "乙", "丙"] }));
    room = roundTrip(act(room, "GUESS", A2, { seq: [1, 2, 3] }));
    room = roundTrip(act(room, "GUESS", B1, { seq: [1, 2, 3] }));

    actRejected(room, "NEXT_ROUND", "陌生人");

    room = roundTrip(act(room, "NEXT_ROUND", A2));
    assert.equal(room.round, 2);
    assert.equal(room.turn, "B", "行动方交替");
    assert.equal(room.phase, "select-role");
    assert.equal(room.currentCard, null, "数字卡必须清空，不能带到下一轮");
    assert.equal(room.descriptions, null);
    assert.deepEqual(room.guesses, { A: null, B: null });
    assert.equal(room.teams.A.describerId, null);
    assert.equal(room.teams.B.listenerId, null);
    // 上一轮日志保留
    assert.ok(room.logs.r1);
    assert.equal(room.logs.r1.turn, "A");
  });

  it("B 队回合扣的是 B 队的血，A 队情报板收到线索", () => {
    let room = assignRoles(readyAll(makeReadyRoom()));
    room = roundTrip(act(room, "DESCRIBE", A1, { descriptions: ["甲", "乙", "丙"] }));
    room = roundTrip(act(room, "GUESS", A2, { seq: CARD })); // 猜对，不扣血
    room = roundTrip(act(room, "GUESS", B1, { seq: CARD })); // 监听者猜中，A 队 −1
    room = roundTrip(act(room, "NEXT_ROUND", A2));
    assert.equal(room.teams.A.health, 2);

    room = assignRoles(room);
    room = roundTrip(act(room, "DESCRIBE", B1, { descriptions: ["南极绅士", "带刺的花", "一碗热汤"] }));
    room = roundTrip(act(room, "GUESS", B2, { seq: [1, 3, 4] })); // 猜错 −1
    room = roundTrip(act(room, "GUESS", A1, { seq: CARD })); // 监听者猜中再 −1

    assert.equal(room.teams.B.health, 1);
    assert.equal(room.teams.A.health, 2, "上一轮扣的 1 点不会因为换回合而恢复");
    assert.deepEqual(intelOf(room.teams.A, 2), ["南极绅士"]);
    assert.deepEqual(intelOf(room.teams.A, 4), ["带刺的花"]);
    assert.deepEqual(intelOf(room.teams.A, 1), ["一碗热汤"]);
  });

  it("血量归零时结束并判定胜方，之后不再接受任何提交", () => {
    let room = assignRoles(readyAll(makeReadyRoom(2)), CARD);
    room = roundTrip(act(room, "DESCRIBE", A1, { descriptions: ["甲", "乙", "丙"] }));
    room = roundTrip(act(room, "GUESS", A2, { seq: [1, 2, 3] })); // 猜错 −1
    room = roundTrip(act(room, "GUESS", B1, { seq: CARD })); // 监听者猜中 −1

    assert.equal(room.teams.A.health, 0);
    assert.equal(room.phase, "ended");
    assert.equal(room.winner, "B");

    actRejected(room, "GUESS", A2, { seq: CARD });
    actRejected(room, "DESCRIBE", A1, { descriptions: ["x", "y", "z"] });
    actRejected(room, "NEXT_ROUND", A1);
    actRejected(room, "JOIN", "pNEW", { name: "新人" });
  });

  it("房主可作废本轮，用于必要角色掉线的情况", () => {
    let room = assignRoles(readyAll(makeReadyRoom()));
    actRejected(room, "VOID_ROUND", A2);
    room = roundTrip(act(room, "VOID_ROUND", HOST));
    assert.equal(room.phase, "reveal");
    assert.equal(room.roundResult.voided, true);
    assert.equal(room.teams.A.health, 3, "作废不扣血");
  });
});

describe("情报板笔记", () => {
  it("只有情报板归属队伍的成员能读写，且只能删自己的笔记", () => {
    let room = assignRoles(readyAll(makeReadyRoom()));
    actRejected(room, "ADD_NOTE", B1, { team: "A", number: "1", text: "试探", noteId: "n1" });
    actRejected(room, "ADD_NOTE", A1, { team: "A", number: "9", text: "试探", noteId: "n2" });

    room = roundTrip(
      act(room, "ADD_NOTE", A1, { team: "A", number: "3", text: "像动物", noteId: "n3" }),
    );
    room = roundTrip(
      act(room, "ADD_NOTE", A2, { team: "A", number: "3", text: "我猜是猫科", noteId: "n4" }),
    );
    const notes = Object.entries(roundTrip(room).teams.A.notes["3"]);
    assert.equal(notes.length, 2);

    actRejected(room, "REMOVE_NOTE", A2, { team: "A", number: "3", noteId: "n3" });
    room = roundTrip(act(room, "REMOVE_NOTE", A1, { team: "A", number: "3", noteId: "n3" }));
    assert.equal(Object.keys(roundTrip(room).teams.A.notes["3"]).length, 1);
  });
});

describe("健壮性", () => {
  it("玩家退出后房间保持可用，最后一人离开则删除房间", () => {
    let room = makeReadyRoom();
    room = roundTrip(act(room, "LEAVE", B2));
    assert.equal(Object.keys(room.players).length, 3);
    assert.equal(room.phase, "lobby", "准备阶段掉人后退回大厅重新组队");

    room = roundTrip(act(room, "LEAVE", B1));
    room = roundTrip(act(room, "LEAVE", A2));
    assert.equal(act(room, "LEAVE", A1), null, "房间为空时应删除节点");
  });

  it("刷新重连沿用原座位，不会被当成新玩家挤掉队伍", () => {
    let room = makeReadyRoom();
    room = roundTrip(act(room, "SET_ONLINE", A2, { online: false }));
    assert.equal(room.players[A2].online, false);

    room = roundTrip(act(room, "JOIN", A2, { name: "阿二改名" }));
    assert.equal(Object.keys(room.players).length, 4, "不应产生第 5 个座位");
    assert.equal(room.players[A2].team, "A", "队伍保持不变");
    assert.equal(room.players[A2].online, true);
    assert.equal(room.players[A2].name, "阿二改名");
  });

  it("非法动作不会改变房间（事务应被拒绝）", () => {
    const room = makeReadyRoom();
    for (const type of ["NOPE", "DESCRIBE", "GUESS", "NEXT_ROUND", "RESTART"]) {
      actRejected(room, type, A1, {});
    }
  });

  it("normalizeRoom 能兜住残缺数据", () => {
    const empty = normalizeRoom({ meta: { hostId: "pX" } });
    assert.equal(empty.phase, "lobby");
    assert.equal(empty.turn, "A");
    assert.equal(empty.round, 1);
    assert.equal(empty.meta.healthMax, 3);
    assert.equal(empty.teams.A.health, 3);
    assert.deepEqual(empty.players, {});
    assert.equal(normalizeRoom(null), null);
    assert.equal(normalizeRoom("垃圾数据"), null);
  });

  it("再来一局会清空血量、日志与情报，并重新发牌", () => {
    let room = assignRoles(readyAll(makeReadyRoom()));
    room = roundTrip(act(room, "DESCRIBE", A1, { descriptions: ["甲", "乙", "丙"] }));
    room = roundTrip(act(room, "GUESS", A2, { seq: [2, 4, 1] }));
    room = roundTrip(act(room, "GUESS", B1, { seq: [2, 4, 1] }));
    room = roundTrip(act(room, "NEXT_ROUND", A1));

    actRejected(room, "RESTART", A2);
    room = roundTrip(act(room, "RESTART", HOST));

    assert.equal(room.phase, "prepare");
    assert.equal(room.round, 1);
    assert.equal(room.turn, "A");
    assert.deepEqual(room.logs, {});
    assert.deepEqual(room.teams.A.words, {}, "词板清空，等待重新发牌");
    assert.deepEqual(room.teams.B.intel["1"], {});
    assert.equal(room.teams.A.health, 3);
    assert.equal(room.players[A1].ready, false);
  });

  it("applyAction 不修改传入的房间对象", () => {
    const room = makeReadyRoom();
    const snapshot = JSON.stringify(room);
    act(room, "SET_READY", A1, { ready: true });
    act(room, "REROLL", A1, { words: ["甲", "乙", "丙", "丁"] });
    assert.equal(JSON.stringify(room), snapshot, "入参必须保持不变");
  });

  it("createEmptyRoom 的默认值与规则一致", () => {
    const room = createEmptyRoom({ hostId: HOST });
    assert.equal(room.meta.healthMax, 3);
    assert.deepEqual(room.guesses, { A: null, B: null });
    assert.equal(room.winner, null);
    assert.deepEqual(Object.keys(room.logs), []);
  });
});
