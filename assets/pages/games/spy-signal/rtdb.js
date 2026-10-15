// @ts-check
/**
 * 「谍报风云」实时同步层。
 *
 * 约定：
 * - 所有状态变更都走 `dispatch()` → RTDB `runTransaction()` → `applyAction()`，
 *   由服务端串行化，天然避免两个客户端同时扣血 / 同时换回合造成的状态错乱。
 * - 只在 `players/{uid}/online` 上使用 onDisconnect，其余数据（座位、词板、情报板）
 *   在刷新后保留，因此掉线重连可以原样恢复对局。
 *
 * Firebase 配置通过 `__API_BASE__/api/firebase-config` 注入，
 * 具体用法见 src/docs/API/firebaseRTDB配置调用说明.md。
 */

import { normalizeRoom, applyAction } from "./room-model.js";

/** RTDB 根路径，与其他小游戏（gomoku）分区隔离 */
const ROOT_PATH = "spy-signal";
const ROOMS_PATH = `${ROOT_PATH}/rooms`;

/**
 * 取得 database 实例。优先使用站点统一的 firebase-ready 模块，
 * 确保配置与 Firebase SDK 都已就绪。
 * @returns {Promise<any>}
 */
export async function getDatabase() {
  const ready = /** @type {any} */ (window).QuarkFirebaseReady;
  if (!ready || typeof ready.ensureDatabase !== "function") {
    throw new Error("Firebase 就绪模块未加载，请刷新页面重试");
  }
  return ready.ensureDatabase({ loadConfig: true });
}

/**
 * @param {any} db
 * @param {string} roomId
 * @returns {any}
 */
export function roomRef(db, roomId) {
  return db.ref(`${ROOMS_PATH}/${roomId}`);
}

/**
 * @param {any} db
 * @returns {any}
 */
export function roomsRef(db) {
  return db.ref(ROOMS_PATH);
}

/**
 * 提交一个动作。整个房间节点在一次事务里被读写，因此是原子的。
 *
 * ⚠️ 这里必须显式挂一个监听器把节点"钉"在本地缓存里，原因是一个很容易踩的坑：
 * `ref.once('value')` 在 v8 SDK 内部是"临时监听 → 取值 → 立刻移除监听"，
 * 而缓存是按查询引用计数管理的，移除监听会把刚取到的数据一起丢掉。
 * 于是紧随其后的 `runTransaction()` 会读到空缓存并拿到 `null`，
 * 表现为"房间明明存在却总是加入失败"（造房反而不受影响，因为那里 null 本来就是正确答案）。
 *
 * 保留一个 no-op 监听器可让缓存持续有效；事务本身仍然是原子的，
 * 且 RTDB 会在服务端做哈希校验，缓存过期也会自动用真实数据重跑 reducer。
 *
 * @param {any} db
 * @param {string} roomId
 * @param {import("./room-model.js").Action} action
 * @returns {Promise<{ committed: boolean, room: ReturnType<typeof normalizeRoom> }>}
 */
export async function dispatch(db, roomId, action) {
  const ref = roomRef(db, roomId);
  const keepWarm = () => {};
  ref.on("value", keepWarm);
  try {
    // 等一次服务端读取，确保缓存里放的是服务端数据而不是空值
    await ref.once("value");

    const result = await ref.transaction((raw) => {
      const current = normalizeRoom(raw);
      // undefined = 动作在当前状态下非法，中止事务（RTDB 会保留原值）
      return applyAction(current, action);
    });

    return {
      committed: result.committed === true,
      room: normalizeRoom(result.snapshot ? result.snapshot.val() : null),
    };
  } finally {
    ref.off("value", keepWarm);
  }
}

/**
 * 监听整个房间，任何变化都会回调归一化后的房间对象。
 * @param {any} db
 * @param {string} roomId
 * @param {(room: import("./room-model.js").Room | null) => void} callback
 * @param {(error: Error) => void} [onError]
 * @returns {() => void} 取消监听
 */
export function watchRoom(db, roomId, callback, onError) {
  const ref = roomRef(db, roomId);
  const handler = (/** @type {any} */ snapshot) => {
    callback(normalizeRoom(snapshot.val()));
  };
  const errorHandler = (/** @type {any} */ error) => {
    if (onError) onError(error);
  };
  ref.on("value", handler, errorHandler);
  return () => {
    ref.off("value", handler);
  };
}

/**
 * 绑定在线状态：连上后写入 online=true，并注册断线自动置 false。
 * @param {any} db
 * @param {string} roomId
 * @param {string} uid
 * @param {(connected: boolean) => void} [onConnectionChange]
 * @returns {() => void}
 */
export function bindPresence(db, roomId, uid, onConnectionChange) {
  const connectedRef = db.ref(".info/connected");
  const onlineRef = roomRef(db, roomId).child(`players/${uid}/online`);

  const handler = (/** @type {any} */ snapshot) => {
    const connected = snapshot.val() === true;
    if (onConnectionChange) onConnectionChange(connected);
    if (!connected) return;
    // 先注册 onDisconnect，再置为在线，保证断开时一定会被标记
    onlineRef
      .onDisconnect()
      .set(false)
      .then(() => onlineRef.set(true))
      .catch(() => {
        /* 断线注册失败时忽略，重连后会再次尝试 */
      });
  };

  connectedRef.on("value", handler);

  return () => {
    connectedRef.off("value", handler);
    onlineRef.onDisconnect().cancel();
  };
}

/**
 * 房间是否存在。
 * @param {any} db
 * @param {string} roomId
 * @returns {Promise<boolean>}
 */
export async function roomExists(db, roomId) {
  const snapshot = await roomRef(db, roomId).once("value");
  return snapshot.exists();
}

/**
 * 房间自动释放策略。
 *
 * 玩家直接关标签页时不会发出 LEAVE，房间会一直留在库里，
 * 所以除了"最后一人退出即删除"，还需要按时间兜底释放。
 */
export const ROOM_TTL = {
  /** 建房后一直没凑满 4 人（从未发牌）→ 释放 */
  neverFilled: 15 * 60 * 1000,
  /** 对局已结束，留一段时间给大家复盘，之后释放 */
  ended: 10 * 60 * 1000,
  /** 已结束且全员离线 → 更快释放 */
  endedIdle: 3 * 60 * 1000,
  /** 对局进行中但全员离线 → 释放 */
  idle: 15 * 60 * 1000,
};

/**
 * 判断房间是否应当释放。
 * @param {any} room
 * @param {number} [now]
 * @returns {{ reason: string, at: number } | null}
 */
export function roomRelease(room, now = Date.now()) {
  if (!room || typeof room !== "object") return null;

  const meta = room.meta ?? {};
  const players = Object.values(room.players ?? {});
  const anyoneOnline = players.some((player) => /** @type {any} */ (player)?.online === true);
  const createdAt = Number(meta.createdAt) || 0;
  const endedAt = Number(meta.endedAt) || 0;
  const updatedAt = Number(room.updatedAt) || 0;

  // 座位空了（例如最后一人异常掉线没走成 LEAVE）
  if (players.length === 0) return { reason: "empty", at: now };

  // 从来没凑满 4 人：到点就释放，不看有没有人在等
  if ((room.phase === "lobby" || room.phase === "prepare") && !meta.dealtAt && createdAt) {
    const at = createdAt + ROOM_TTL.neverFilled;
    if (now >= at) return { reason: "never-filled", at };
  }

  if (room.phase === "ended" && endedAt) {
    const at = endedAt + ROOM_TTL.ended;
    if (now >= at) return { reason: "ended", at };
    if (!anyoneOnline && now - updatedAt > ROOM_TTL.endedIdle) {
      return { reason: "ended", at: updatedAt + ROOM_TTL.endedIdle };
    }
  }

  // 进行中但全员离线
  if (!anyoneOnline && updatedAt && now - updatedAt > ROOM_TTL.idle) {
    return { reason: "idle", at: updatedAt + ROOM_TTL.idle };
  }

  return null;
}

/**
 * 当前房间的"预计释放时间"，供界面显示倒计时；没有期限则返回 null。
 * @param {any} room
 * @returns {number | null}
 */
export function roomReleaseDeadline(room) {
  if (!room || typeof room !== "object") return null;
  const meta = room.meta ?? {};
  if (room.phase === "lobby" || room.phase === "prepare") {
    if (meta.dealtAt || !meta.createdAt) return null;
    return Number(meta.createdAt) + ROOM_TTL.neverFilled;
  }
  if (room.phase === "ended" && meta.endedAt) {
    return Number(meta.endedAt) + ROOM_TTL.ended;
  }
  return null;
}

/**
 * 扫描并释放到期房间。任何一位在线玩家都可以顺手做这件事。
 * @param {any} db
 * @returns {Promise<string[]>} 被释放的房间码
 */
export async function reapAbandonedRooms(db) {
  const snapshot = await roomsRef(db).once("value");
  if (!snapshot.exists()) return [];

  const now = Date.now();
  /** @type {string[]} */
  const removed = [];

  for (const [code, raw] of Object.entries(snapshot.val() ?? {})) {
    if (!roomRelease(/** @type {any} */ (raw), now)) continue;
    try {
      await roomRef(db, code).remove();
      removed.push(code);
    } catch {
      // 单个房间删不掉就跳过，不影响其它房间
    }
  }

  return removed;
}

/**
 * 已加入的房间记录（用于刷新后自动回到房间）。
 * @returns {{ roomId: string, name: string, at: number }[]}
 */
export function readRecentRooms() {
  try {
    const raw = window.localStorage.getItem("spySignalRooms");
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.roomId === "string")
      .slice(0, 5);
  } catch {
    return [];
  }
}

/**
 * @param {{ roomId: string, name: string }} entry
 */
export function rememberRoom(entry) {
  const list = readRecentRooms().filter((item) => item.roomId !== entry.roomId);
  list.unshift({ roomId: entry.roomId, name: entry.name, at: Date.now() });
  try {
    window.localStorage.setItem("spySignalRooms", JSON.stringify(list.slice(0, 5)));
  } catch {
    /* 隐私模式下写入失败时忽略 */
  }
}

/**
 * @param {string} roomId
 */
export function forgetRoom(roomId) {
  const list = readRecentRooms().filter((item) => item.roomId !== roomId);
  try {
    window.localStorage.setItem("spySignalRooms", JSON.stringify(list));
  } catch {
    /* 忽略 */
  }
}
