/**
 * 「谍报风云」分队与掉线剔除测试。
 *
 * 覆盖三块新规则：
 *  - 加入房间时选队伍（以及重连不夺人座位）；
 *  - 大厅 / 准备阶段的换队；
 *  - 离线玩家的移出（房主手动 + 离线超时自动）与随之而来的房主转移。
 *
 * 运行：npm run test:spy-signal
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CHAT_MAX,
  OFFLINE_KICK_MS,
  TEAM_AUTO,
  normalizeTeamPreference,
  sanitizeChatText,
} from "../../assets/pages/games/spy-signal/game-core.js";
import { applyAction, normalizeRoom } from "../../assets/pages/games/spy-signal/room-model.js";
import { roomRelease } from "../../assets/pages/games/spy-signal/rtdb.js";

const HOST = "pHOST";
const P2 = "p2";
const P3 = "p3";
const P4 = "p4";

/**
 * 模拟 RTDB 的读写：丢掉 null 与空对象（Firebase 不会保存它们），
 * 再经 normalizeRoom 补回默认值 —— 用来暴露"写进去读不回来"的形状问题。
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
 * @param {any} room
 * @returns {any}
 */
function roundTrip(room) {
  return normalizeRoom(stripForRtdb(JSON.parse(JSON.stringify(room))));
}

/**
 * @param {any} room
 * @param {string} type
 * @param {string} actorId
 * @param {Record<string, unknown>} [payload]
 * @returns {any}
 */
function act(room, type, actorId, payload) {
  return applyAction(room, { type, actorId, payload });
}

/**
 * @param {any} room
 * @param {string} type
 * @param {string} actorId
 * @param {Record<string, unknown>} [payload]
 * @param {string} [label]
 */
function actRejected(room, type, actorId, payload, label) {
  assert.equal(
    act(room, type, actorId, payload),
    undefined,
    `${label ?? `${type} (${actorId})`} 本应被拒绝`,
  );
}

/**
 * 建一个空房并把指定的人按给定队伍放进去。
 * @param {{ uid: string, team?: "A" | "B" }[]} seats 第一项即房主
 * @param {number} [healthMax]
 * @returns {any}
 */
function makeRoom(seats, healthMax = 3) {
  const [host, ...rest] = seats;
  let room = roundTrip(
    act(null, "CREATE_ROOM", host.uid, { name: host.uid, healthMax, team: host.team }),
  );
  for (const seat of rest) {
    room = roundTrip(act(room, "JOIN", seat.uid, { name: seat.uid, team: seat.team }));
  }
  return room;
}

/**
 * 把某位玩家的在线状态切到指定值（测试里代替 bindPresence 的直写）。
 * @param {any} room
 * @param {string} uid
 * @param {boolean} online
 * @returns {any}
 */
function setOnline(room, uid, online) {
  return roundTrip(act(room, "SET_ONLINE", uid, { online }));
}

/**
 * 把离线时刻往前挪，模拟"已经离线很久了"。
 *
 * 生产环境里 `offlineAt` 是服务端时间写的，测试只能自己往回拨。
 * @param {any} room
 * @param {string} uid
 * @param {number} ms
 * @returns {any}
 */
function backdateOffline(room, uid, ms) {
  const next = JSON.parse(JSON.stringify(room));
  next.players[uid].offlineAt = Date.now() - ms;
  return roundTrip(next);
}

describe("加入房间时选队伍", () => {
  it("指定 A 队就进 A 队", () => {
    const room = makeRoom([{ uid: HOST }]);
    const next = roundTrip(act(room, "JOIN", P2, { name: "二", team: "A" }));
    assert.equal(next.players[P2].team, "A");
  });

  it("指定的队伍已满员时退回补到人少的一队", () => {
    const room = makeRoom([{ uid: HOST, team: "A" }, { uid: P2, team: "A" }]);
    const next = roundTrip(act(room, "JOIN", P3, { name: "三", team: "A" }));
    assert.equal(next.players[P3].team, "B", "A 队已满，应该补到 B 队");
  });

  it("没选 / 选了非法值时按人数自动补位", () => {
    const room = makeRoom([{ uid: HOST, team: "A" }, { uid: P2, team: "A" }]);
    const next = roundTrip(act(room, "JOIN", P3, { name: "三" }));
    assert.equal(next.players[P3].team, "B");
  });

  it("重连时即使带了别的队伍也不夺走原有座位", () => {
    const room = makeRoom([{ uid: HOST, team: "A" }, { uid: P2, team: "B" }]);
    const next = roundTrip(act(room, "JOIN", P2, { name: "二", team: "A" }));
    assert.equal(next.players[P2].team, "B", "刷新重连不该把人挪到别的队");
  });

  it("四人满员时两队必然是 2 : 2", () => {
    // 自由选队之后，这条不变量要有保证：任何一次加入都只会落到没满的那队
    const room = makeRoom([
      { uid: HOST, team: "A" },
      { uid: P2, team: "A" },
      { uid: P3, team: "B" },
      { uid: P4, team: "B" },
    ]);
    const counts = { A: 0, B: 0 };
    for (const player of Object.values(room.players)) counts[player.team] += 1;
    assert.deepEqual(counts, { A: 2, B: 2 });
  });
});

describe("大厅换队", () => {
  it("换到有空位的队：队伍变了、准备状态被清掉", () => {
    let room = makeRoom([{ uid: HOST, team: "A" }, { uid: P2, team: "B" }]);
    room = roundTrip(act(room, "SET_READY", HOST, { ready: true }));
    assert.equal(room.players[HOST].ready, true);

    const next = roundTrip(act(room, "SWITCH_TEAM", HOST, { team: "B" }));
    assert.equal(next.players[HOST].team, "B");
    assert.equal(next.players[HOST].ready, false, "换队后要重新点准备");
  });

  it("目标队满员时拒绝", () => {
    const room = makeRoom([
      { uid: HOST, team: "A" },
      { uid: P2, team: "A" },
      { uid: P3, team: "B" },
    ]);
    actRejected(room, "SWITCH_TEAM", P3, { team: "A" });
  });

  it("换到自己已经在的队时拒绝", () => {
    const room = makeRoom([{ uid: HOST, team: "A" }]);
    actRejected(room, "SWITCH_TEAM", HOST, { team: "A" });
  });

  it("队伍值非法时拒绝", () => {
    const room = makeRoom([{ uid: HOST, team: "A" }, { uid: P2, team: "B" }]);
    actRejected(room, "SWITCH_TEAM", HOST, { team: TEAM_AUTO });
  });

  it("不在房间里的人不能换队", () => {
    const room = makeRoom([{ uid: HOST, team: "A" }]);
    actRejected(room, "SWITCH_TEAM", "pStranger", { team: "B" });
  });

  it("对局开始后不再允许换队", () => {
    let room = makeRoom([
      { uid: HOST, team: "A" },
      { uid: P2, team: "A" },
      { uid: P3, team: "B" },
      { uid: P4, team: "B" },
    ]);
    room = roundTrip(act(room, "DEAL_WORDS", HOST, {
      words: { A: ["甲", "乙", "丙", "丁"], B: ["戊", "己", "庚", "辛"] },
    }));
    for (const uid of [HOST, P2, P3, P4]) {
      room = roundTrip(act(room, "SET_READY", uid, { ready: true }));
    }
    room = roundTrip(act(room, "START", HOST));
    assert.equal(room.phase, "select-role");

    actRejected(room, "SWITCH_TEAM", HOST, { team: "B" });
  });
});

describe("移出离线玩家", () => {
  it("房主可以手动移出离线玩家，并留下移出记录", () => {
    let room = makeRoom([{ uid: HOST, team: "A" }, { uid: P2, team: "A" }]);
    room = setOnline(room, P2, false);

    const next = roundTrip(act(room, "KICK", HOST, { targetUid: P2, reason: "manual" }));
    assert.equal(next.players[P2], undefined);
    assert.equal(next.meta.lastKick.uid, P2);
    assert.equal(next.meta.lastKick.reason, "manual");
    assert.equal(next.meta.lastKick.by, HOST);
    assert.equal(next.phase, "lobby");
  });

  it("在线的人不能被移出", () => {
    const room = makeRoom([{ uid: HOST, team: "A" }, { uid: P2, team: "A" }]);
    actRejected(room, "KICK", HOST, { targetUid: P2, reason: "manual" }, "移出在线玩家");
  });

  it("非房主不能手动移出", () => {
    let room = makeRoom([{ uid: HOST, team: "A" }, { uid: P2, team: "A" }]);
    room = setOnline(room, HOST, false);
    actRejected(room, "KICK", P2, { targetUid: HOST, reason: "manual" }, "非房主手动移出");
  });

  it("房主不能手动把自己移出", () => {
    let room = makeRoom([{ uid: HOST, team: "A" }, { uid: P2, team: "A" }]);
    room = setOnline(room, HOST, false);
    // 房主离线时不再是"房主发起"，这条请求自然被拒
    actRejected(room, "KICK", HOST, { targetUid: HOST, reason: "manual" });
  });

  it("离线超时的移出可以由任何在场玩家发起", () => {
    let room = makeRoom([{ uid: HOST, team: "A" }, { uid: P2, team: "A" }, { uid: P3, team: "B" }]);
    room = backdateOffline(setOnline(room, P2, false), P2, OFFLINE_KICK_MS + 5000);

    const next = roundTrip(act(room, "KICK", P3, { targetUid: P2, reason: "timeout" }));
    assert.equal(next.players[P2], undefined);
    assert.equal(next.meta.lastKick.reason, "timeout");
  });

  it("还没到 2 分钟时，超时移出会被 reducer 拒绝", () => {
    // 界面上的巡检跑在各客户端的时钟上，可能因时钟偏差提前动手；
    // reducer 是所有客户端都同意的那一层，这里必须再卡一道
    let room = makeRoom([{ uid: HOST, team: "A" }, { uid: P2, team: "A" }, { uid: P3, team: "B" }]);
    room = setOnline(room, P2, false);
    actRejected(room, "KICK", P3, { targetUid: P2, reason: "timeout" }, "刚掉线就移出");

    room = backdateOffline(room, P2, OFFLINE_KICK_MS - 10000);
    actRejected(room, "KICK", P3, { targetUid: P2, reason: "timeout" }, "还差 10 秒就移出");
  });

  it("没有掉线时刻的人不能按超时移出", () => {
    // 只有 online:false、没有 offlineAt，说明根本没被标记过掉线（例如手工塞进来的脏数据）
    const room = makeRoom([{ uid: HOST, team: "A" }, { uid: P2, team: "A" }, { uid: P3, team: "B" }]);
    const doctored = JSON.parse(JSON.stringify(room));
    doctored.players[P2].online = false;
    actRejected(roundTrip(doctored), "KICK", P3, { targetUid: P2, reason: "timeout" }, "无 offlineAt 的超时移出");
  });

  it("离线超时可以移走房主，并把房主身份交给最早进房的人", () => {
    let room = makeRoom([{ uid: HOST, team: "A" }, { uid: P2, team: "A" }, { uid: P3, team: "B" }]);
    room = backdateOffline(setOnline(room, HOST, false), HOST, OFFLINE_KICK_MS + 5000);

    const next = roundTrip(act(room, "KICK", P2, { targetUid: HOST, reason: "timeout" }));
    assert.equal(next.players[HOST], undefined);
    assert.equal(next.meta.hostId, P2, "房主走了得有人接手，否则谁也开不了局");
  });

  it("不能把自己移出去（房间里只剩自己时会清空整间房）", () => {
    let room = makeRoom([{ uid: HOST, team: "A" }]);
    room = backdateOffline(setOnline(room, HOST, false), HOST, OFFLINE_KICK_MS + 5000);
    actRejected(room, "KICK", HOST, { targetUid: HOST, reason: "timeout" }, "移出最后一人");
  });

  it("对局开始后不再受理移出", () => {
    let room = makeRoom([
      { uid: HOST, team: "A" },
      { uid: P2, team: "A" },
      { uid: P3, team: "B" },
      { uid: P4, team: "B" },
    ]);
    room = roundTrip(act(room, "DEAL_WORDS", HOST, {
      words: { A: ["甲", "乙", "丙", "丁"], B: ["戊", "己", "庚", "辛"] },
    }));
    for (const uid of [HOST, P2, P3, P4]) {
      room = roundTrip(act(room, "SET_READY", uid, { ready: true }));
    }
    room = roundTrip(act(room, "START", HOST));
    room = setOnline(room, P2, false);

    actRejected(room, "KICK", HOST, { targetUid: P2, reason: "manual" });
  });
});

describe("房主离开", () => {
  it("房主退出后房主身份转给最早进房的剩余玩家", () => {
    const room = makeRoom([{ uid: HOST, team: "A" }, { uid: P2, team: "A" }, { uid: P3, team: "B" }]);
    const next = roundTrip(act(room, "LEAVE", HOST));
    assert.equal(next.meta.hostId, P2);
  });

  it("最后一人退出时房间被删除", () => {
    const room = makeRoom([{ uid: HOST, team: "A" }]);
    assert.equal(act(room, "LEAVE", HOST), null);
  });
});

describe("掉线时间戳", () => {
  it("掉线时记下时刻，重新上线时清掉", () => {
    let room = makeRoom([{ uid: HOST, team: "A" }]);
    assert.equal(room.players[HOST].offlineAt, null);

    room = setOnline(room, HOST, false);
    assert.equal(typeof room.players[HOST].offlineAt, "number");

    room = setOnline(room, HOST, true);
    assert.equal(room.players[HOST].offlineAt, null);
  });

  it("offlineAt 经服务器往返后仍在（否则倒计时算不出来）", () => {
    let room = makeRoom([{ uid: HOST, team: "A" }]);
    room = setOnline(room, HOST, false);
    const stamp = room.players[HOST].offlineAt;

    const again = roundTrip(room);
    assert.equal(again.players[HOST].offlineAt, stamp);
  });

  it("重新加入会清掉自己残留的离线时刻", () => {
    let room = makeRoom([{ uid: HOST, team: "A" }, { uid: P2, team: "A" }]);
    room = setOnline(room, P2, false);
    assert.equal(typeof room.players[P2].offlineAt, "number");

    const next = roundTrip(act(room, "JOIN", P2, { name: "二" }));
    assert.equal(next.players[P2].online, true);
    assert.equal(next.players[P2].offlineAt, null);
  });

  it("没有 joinedAt 的幽灵座位会被忽略（断线写入可能先于 JOIN 落库）", () => {
    const raw = {
      meta: { createdAt: 1, hostId: HOST, healthMax: 3 },
      players: {
        [HOST]: { name: "房主", team: "A", joinedAt: 1 },
        pGhost: { online: true, offlineAt: null },
      },
      phase: "lobby",
    };
    const room = normalizeRoom(raw);
    assert.deepEqual(Object.keys(room.players), [HOST], "幽灵座位不能占掉一个位子");
  });
});

describe("空壳房间（bindPresence 把已删除的房间写回来）", () => {
  /** 只剩 players、没有 meta 的垃圾节点 */
  const hollow = { players: { [HOST]: { online: true } } };
  /** meta 正常，但名单里全是幽灵座位（没有 joinedAt） */
  const ghostOnlySeats = {
    meta: { createdAt: 1000, hostId: HOST, healthMax: 3 },
    players: { [HOST]: { online: true }, pGhost: { online: true } },
    phase: "lobby",
    updatedAt: Date.now(),
  };

  it("没有 meta 的房间判定可释放（否则会永久占着房间码）", () => {
    assert.equal(roomRelease(hollow)?.reason, "empty");
  });

  it("名单里只剩幽灵座位时也判定可释放", () => {
    assert.equal(roomRelease(ghostOnlySeats)?.reason, "empty");
  });

  it("空壳房间不接受 JOIN，但可以被 CREATE_ROOM 覆盖", () => {
    actRejected(hollow, "JOIN", P2, { name: "二" }, "往空壳房间加入");
    const created = act(hollow, "CREATE_ROOM", P2, { name: "二" });
    assert.ok(created, "房间码既然是空的，就应该能被重新建房");
    assert.equal(created.meta.hostId, P2);
  });
});

describe("聊天文本", () => {
  it("截断到上限", () => {
    const text = sanitizeChatText("啊".repeat(CHAT_MAX + 40));
    assert.equal([...text].length, CHAT_MAX);
  });

  it("丢掉控制字符（含换行制表），并折叠多余空格", () => {
    // 与暗号 / 笔记共用同一个 sanitizeText：控制字符是删掉，不是换成空格
    assert.equal(sanitizeChatText("别\t乱\n说话"), "别乱说话");
    assert.equal(sanitizeChatText("别    乱   说话"), "别 乱 说话");
  });

  it("全空白视为空文本", () => {
    assert.equal(sanitizeChatText("   \n\t "), "");
  });

  it("按码点截断，不会把一个 emoji 劈成半个字符", () => {
    // UTF-16 单元截断会让代理对断在中间，渲染出来对四个人都是乱码
    const text = sanitizeChatText("a".repeat(CHAT_MAX - 1) + "😀");
    assert.equal(text.isWellFormed(), true);
    assert.equal([...text].length, CHAT_MAX);
    assert.ok(text.endsWith("😀"));
  });

  it("队伍偏好只认 A / B，其余按自动处理", () => {
    assert.equal(normalizeTeamPreference("a"), "A");
    assert.equal(normalizeTeamPreference("B"), "B");
    assert.equal(normalizeTeamPreference(TEAM_AUTO), null);
    assert.equal(normalizeTeamPreference(""), null);
    assert.equal(normalizeTeamPreference(undefined), null);
    assert.equal(normalizeTeamPreference("C"), null);
  });

  it("OFFLINE_KICK_MS 就是两分钟", () => {
    assert.equal(OFFLINE_KICK_MS, 120000);
  });
});
