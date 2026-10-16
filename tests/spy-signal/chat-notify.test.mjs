/**
 * 「谍报风云」聊天新消息判定的测试。
 *
 * 聊天是 `limitToLast()` + `on('value')` 订阅：每次回调拿到的都是**整段最近记录**，
 * 而不是增量的一条，所以"哪几条是新的"必须自己按 id 做差集算出来。
 * 这块判定出错的直接后果就是"有人说话却没响铃 / 没红点"——
 * 属于最难靠肉眼复现、最容易写错的一类逻辑，值得钉住。
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { freshMessages } from "../../assets/pages/games/spy-signal/game-core.js";

const ME = "pME";
const OTHER = "pOTHER";

/**
 * @param {string} id
 * @param {string} uid
 * @param {number} at
 */
const msg = (id, uid, at) => ({ id, value: { uid, text: id, at } });

describe("聊天新消息判定", () => {
  it("整段记录都是没见过的 id 时全部算新", () => {
    const list = [msg("a", OTHER, 1), msg("b", OTHER, 2)];
    assert.deepEqual(freshMessages(list, new Set(), ME).map((item) => item.id), ["a", "b"]);
  });

  it("见过的不再算新，只挑出新增的那条", () => {
    const list = [msg("a", OTHER, 1), msg("b", OTHER, 2), msg("c", OTHER, 3)];
    const known = new Set(["a", "b"]);
    assert.deepEqual(freshMessages(list, known, ME).map((item) => item.id), ["c"]);
  });

  it("自己发的消息不算新（本地已经渲染过一次，不该再响铃）", () => {
    const list = [msg("a", OTHER, 1), msg("b", ME, 2)];
    assert.deepEqual(freshMessages(list, new Set(), ME).map((item) => item.id), ["a"]);
  });

  it("同一个 id 的回调重复到达时不会重复通知", () => {
    const list = [msg("a", OTHER, 1), msg("b", OTHER, 2)];
    const known = new Set(["a", "b"]);
    assert.equal(freshMessages(list, known, ME).length, 0);
  });

  it("滑动窗口把老消息挤出列表时，剩下的仍然各算各的", () => {
    // 60 条上限的窗口往右滑一格：最老的掉队，最新的进来
    const list = [msg("b", OTHER, 2), msg("c", OTHER, 3)];
    const known = new Set(["a", "b"]);
    assert.deepEqual(freshMessages(list, known, ME).map((item) => item.id), ["c"]);
  });

  it("值缺失的脏数据不会抛错，也不会被误当成自己的消息", () => {
    const list = [{ id: "a", value: null }, msg("b", OTHER, 2)];
    assert.deepEqual(freshMessages(list, new Set(), ME).map((item) => item.id), ["a", "b"]);
  });
});
