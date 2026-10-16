/**
 * 「谍报风云」房间生命周期与自动释放策略测试。
 *
 * 覆盖两件事：
 *  1. reducer 是否正确记录 createdAt / dealtAt / startedAt / endedAt；
 *  2. rtdb.js 的释放策略在各种"废弃"情形下的判定（含不该释放的反例）。
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ROOM_TTL, roomRelease, roomReleaseDeadline } from "../../assets/pages/games/spy-signal/rtdb.js";
import { applyAction } from "../../assets/pages/games/spy-signal/room-model.js";

const HOST = "pHOST";
const A2 = "pA2";
const B1 = "pB1";
const B2 = "pB2";
const MINUTE = 60 * 1000;

const say = (room, type, actorId, payload) => {
  const next = applyAction(room, { type, actorId, payload });
  if (next === undefined) {
    throw new Error(`${type} 在 ${room?.phase ?? "null"} 阶段被意外拒绝`);
  }
  return next;
};

/**
 * 造一个满员未开局的房间。
 * @returns {any}
 */
function fullRoom() {
  let room = say(null, "CREATE_ROOM", HOST, { name: "房主", healthMax: 2 });
  room = say(room, "JOIN", B1, { name: "乙" });
  room = say(room, "JOIN", A2, { name: "丙" });
  room = say(room, "JOIN", B2, { name: "丁" });
  return say(room, "DEAL_WORDS", HOST, {
    words: { A: ["甲一", "甲二", "甲三", "甲四"], B: ["乙一", "乙二", "乙三", "乙四"] },
  });
}

/**
 * 把所有人标记为离线。
 * @param {any} room
 * @returns {any}
 */
function allOffline(room) {
  let next = room;
  for (const uid of [HOST, A2, B1, B2]) {
    if (next.players[uid]) next = say(next, "SET_ONLINE", uid, { online: false });
  }
  return next;
}

/**
 * 显式设置房间的时间字段（而不是靠"减去一段时长"推算），
 * 这样每个用例的时间线一目了然。
 * @param {any} room
 * @param {{ createdAt?: number, endedAt?: number, updatedAt?: number }} times
 * @returns {any}
 */
function withTimes(room, times) {
  return {
    ...room,
    meta: {
      ...room.meta,
      createdAt: times.createdAt ?? room.meta.createdAt,
      endedAt: times.endedAt ?? room.meta.endedAt,
    },
    updatedAt: times.updatedAt ?? room.updatedAt,
  };
}

describe("房间时间戳", () => {
  it("建房时只有 createdAt，其余为空", () => {
    const room = say(null, "CREATE_ROOM", HOST, { name: "房主" });
    assert.ok(room.meta.createdAt > 0);
    assert.equal(room.meta.dealtAt, null);
    assert.equal(room.meta.startedAt, null);
    assert.equal(room.meta.endedAt, null);
  });

  it("发牌记录 dealtAt（等价于真正凑满 4 人）", () => {
    const room = fullRoom();
    assert.ok(room.meta.dealtAt > 0);
  });

  it("开局记录 startedAt，结束记录 endedAt", () => {
    let room = fullRoom();
    for (const uid of [HOST, A2, B1, B2]) room = say(room, "SET_READY", uid, { ready: true });
    room = say(room, "START", HOST);
    assert.ok(room.meta.startedAt > 0);
    assert.equal(room.meta.endedAt, null);

    // 监听方不需要指派，行动队两人就位即进入描述阶段
    const card = [1, 2, 3];
    room = say(room, "ASSIGN_ROLE", HOST, { team: "A", role: "describer", targetUid: HOST, card });
    room = say(room, "ASSIGN_ROLE", HOST, { team: "A", role: "guesser", targetUid: A2, card });
    room = say(room, "DESCRIBE", HOST, { descriptions: ["一", "二", "三"] });
    room = say(room, "GUESS", A2, { seq: [3, 2, 1] }); // 猜错 −1
    room = say(room, "GUESS", B1, { seq: card }); // 监听方任一人猜中 −1 → A 0 血，结束

    assert.equal(room.phase, "ended");
    assert.ok(room.meta.endedAt > 0, "结束时间必须记录，房间释放依赖它");

    // 再来一局会清掉 startedAt / endedAt
    room = say(room, "RESTART", HOST);
    assert.equal(room.meta.startedAt, null);
    assert.equal(room.meta.endedAt, null);
    assert.ok(room.meta.dealtAt > 0, "dealtAt 保留，表示这个房间凑满过人");
  });
});

describe("房间自动释放策略", () => {
  it("从未凑满 4 人：超过 15 分钟就释放，哪怕还有人挂着", () => {
    const now = Date.now();
    let room = say(null, "CREATE_ROOM", HOST, { name: "房主" }); // 只有 1 人，没有 dealtAt
    room = say(room, "JOIN", B1, { name: "乙" });
    const fresh = withTimes(room, { createdAt: now, updatedAt: now });

    assert.equal(roomRelease(fresh, now + 5 * MINUTE), null, "刚建的房间不能释放");
    assert.equal(roomRelease(fresh, now + 14 * MINUTE), null, "还没到 15 分钟");
    assert.equal(roomRelease(fresh, now + 16 * MINUTE)?.reason, "never-filled");
  });

  it("已经凑满过人的大厅不会被 never-filled 规则释放", () => {
    const now = Date.now();
    const room = withTimes(fullRoom(), { createdAt: now, updatedAt: now });
    assert.equal(roomRelease(room, now + 60 * MINUTE), null, "凑满过的房间不适用该规则");
  });

  it("对局结束：给一段复盘时间，之后释放", () => {
    const now = Date.now();
    const room = withTimes({ ...fullRoom(), phase: "ended" }, {
      createdAt: now,
      endedAt: now,
      updatedAt: now,
    });

    assert.equal(roomRelease(room, now + 9 * MINUTE), null, "10 分钟内不释放");
    assert.equal(roomRelease(room, now + 11 * MINUTE)?.reason, "ended");
  });

  it("对局结束且全员离线：更快释放", () => {
    const now = Date.now();
    const offline = allOffline({ ...fullRoom(), phase: "ended" });
    const room = withTimes(offline, { createdAt: now, endedAt: now, updatedAt: now });

    assert.equal(
      roomRelease(room, now + ROOM_TTL.endedIdle + MINUTE)?.reason,
      "ended",
      "结束且无人时按 endedIdle 释放",
    );
  });

  it("对局进行中但全员离线 15 分钟 → 释放", () => {
    const now = Date.now();
    let room = fullRoom();
    for (const uid of [HOST, A2, B1, B2]) room = say(room, "SET_READY", uid, { ready: true });
    room = say(room, "START", HOST);

    const offline = withTimes(allOffline(room), { createdAt: now, updatedAt: now });
    assert.equal(roomRelease(offline, now + 5 * MINUTE), null);
    assert.equal(roomRelease(offline, now + 16 * MINUTE)?.reason, "idle");

    // 只要还有一人在线就不动它
    const online = {
      ...offline,
      players: { ...offline.players, [HOST]: { ...offline.players[HOST], online: true } },
    };
    assert.equal(roomRelease(online, now + 60 * MINUTE), null);
  });

  it("座位为空的房间立即释放", () => {
    const now = Date.now();
    const room = { ...fullRoom(), players: {} };
    assert.equal(roomRelease(room, now)?.reason, "empty");
  });

  it("倒计时只在有期限的阶段给出", () => {
    const now = Date.now();

    // 未凑满的大厅有期限
    const lobby = withTimes(say(null, "CREATE_ROOM", HOST, { name: "房主" }), {
      createdAt: now,
      updatedAt: now,
    });
    assert.equal(roomReleaseDeadline(lobby), now + ROOM_TTL.neverFilled);

    // 已凑满的大厅没有期限
    assert.equal(roomReleaseDeadline(withTimes(fullRoom(), { createdAt: now })), null);

    // 结束页有期限
    const ended = withTimes({ ...fullRoom(), phase: "ended" }, { endedAt: now });
    assert.equal(roomReleaseDeadline(ended), now + ROOM_TTL.ended);

    // 对局中没有倒计时
    assert.equal(roomReleaseDeadline({ ...fullRoom(), phase: "describing" }), null);
  });
});
