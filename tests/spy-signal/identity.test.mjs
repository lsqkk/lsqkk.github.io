/**
 * 「谍报风云」输入解析与头像归一化测试。
 *
 * 覆盖三件容易出错的事：
 *  - 房间码的规范化（字母表本身不含 I/O/0/1，不能"猜"成别的字符）；
 *  - 加入框同时接受纯房间码与完整邀请链接；
 *  - 头像只允许预设颜色或白名单域名下的 https 图片。
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AVATAR_COLORS,
  extractRoomCode,
  isAllowedAvatarUrl,
  normalizeRoomCode,
  sanitizeAvatar,
} from "../../assets/pages/games/spy-signal/game-core.js";

// 合法房间码只由 ABCDEFGHJKLMNPQRSTUVWXYZ23456789 组成（不含 I/O/0/1）
const CODE = "K7M2XP";

describe("房间码规范化", () => {
  it("转大写并去掉分隔符", () => {
    assert.equal(normalizeRoomCode(CODE.toLowerCase()), CODE);
    assert.equal(normalizeRoomCode(` ${CODE} `), CODE);
    assert.equal(normalizeRoomCode("K7M-2XP"), CODE);
    assert.equal(normalizeRoomCode("K7M 2XP"), CODE);
  });

  it("丢掉房间码字母表里不存在的 I / O / 0 / 1", () => {
    // 这些字符永远不会出现在合法房间码里，只能当作误输入丢掉，
    // 而不是"猜"成别的字符（早先版本把 O→0、I→1，反而造出了字母表外的字符）
    assert.equal(normalizeRoomCode("AIO0B1"), "AB");
    assert.equal(normalizeRoomCode("OOOIII"), "");
  });

  it("超长输入截断到 6 位", () => {
    assert.equal(normalizeRoomCode("ABCDEFGHJK"), "ABCDEF");
  });

  it("非字符串输入不炸", () => {
    assert.equal(normalizeRoomCode(null), "");
    assert.equal(normalizeRoomCode(undefined), "");
    // 数字会被转成字符串再规范化，其中的 0/1 同样被丢掉
    assert.equal(normalizeRoomCode(123456), "23456");
  });
});

describe("加入框解析（兼容房间码与邀请链接）", () => {
  it("纯房间码", () => {
    assert.equal(extractRoomCode(CODE.toLowerCase()), CODE);
    assert.equal(extractRoomCode(`  ${CODE}  `), CODE);
  });

  it("只带查询串", () => {
    assert.equal(extractRoomCode(`?room=${CODE}`), CODE);
    assert.equal(extractRoomCode(`&room=${CODE}`), CODE);
  });

  it("完整邀请链接", () => {
    assert.equal(
      extractRoomCode(`https://lsqkk.github.io/games/spy-signal/?room=${CODE}`),
      CODE,
    );
    assert.equal(
      extractRoomCode(`http://localhost:8000/games/spy-signal/?room=${CODE.toLowerCase()}&x=1`),
      CODE,
    );
    // 前面还有别的参数也要能取到
    assert.equal(extractRoomCode(`https://x.test/p?utm=1&room=${CODE}`), CODE);
  });

  it("是链接但没有房间码时返回空串（而不是把整条链接当房间码）", () => {
    assert.equal(extractRoomCode("https://lsqkk.github.io/games/spy-signal/"), "");
    assert.equal(extractRoomCode("https://lsqkk.github.io/games/spy-signal/?foo=1"), "");
  });

  it("空输入返回空串", () => {
    assert.equal(extractRoomCode(""), "");
    assert.equal(extractRoomCode("   "), "");
    assert.equal(extractRoomCode(null), "");
  });
});

describe("头像归一化", () => {
  it("接受合法的六位与三位十六进制颜色", () => {
    assert.equal(sanitizeAvatar({ color: "#4A6CF7" }).color, "#4a6cf7");
    assert.equal(sanitizeAvatar({ color: "#abc" }).color, "#aabbcc");
    assert.equal(sanitizeAvatar({ color: "#4a6cf7" }).type, "color");
  });

  it("非法颜色退回默认色", () => {
    assert.equal(sanitizeAvatar({ color: "red" }).color, AVATAR_COLORS[0]);
    assert.equal(sanitizeAvatar({ color: "#12345" }).color, AVATAR_COLORS[0]);
    assert.equal(sanitizeAvatar({}).color, AVATAR_COLORS[0]);
    assert.equal(sanitizeAvatar(undefined).color, AVATAR_COLORS[0]);
  });

  it("只接受白名单域名下的 https 图片", () => {
    assert.equal(isAllowedAvatarUrl("https://avatars.githubusercontent.com/u/1?v=4"), true);
    assert.equal(isAllowedAvatarUrl("https://cdn.jsdelivr.net/gh/a/b.png"), true);

    assert.equal(isAllowedAvatarUrl("http://avatars.githubusercontent.com/u/1"), false, "http 拒绝");
    assert.equal(isAllowedAvatarUrl("https://evil.test/a.png"), false, "陌生域名拒绝");
    assert.equal(isAllowedAvatarUrl("javascript:alert(1)"), false);
    assert.equal(isAllowedAvatarUrl("data:image/svg+xml;base64,PHN2Zz4="), false);
    assert.equal(isAllowedAvatarUrl(""), false);
  });

  it("图片不合法时安静地退回颜色头像", () => {
    const bad = sanitizeAvatar({ type: "image", url: "https://evil.test/a.png", color: "#4a6cf7" });
    assert.equal(bad.type, "color");
    assert.equal(bad.url, "");
    assert.equal(bad.color, "#4a6cf7", "颜色仍然保留");

    const good = sanitizeAvatar({
      type: "image",
      url: "https://avatars.githubusercontent.com/u/1?v=4",
      color: "#4a6cf7",
    });
    assert.equal(good.type, "image");
    assert.ok(good.url.startsWith("https://avatars.githubusercontent.com/"));
  });

  it("声明为图片但没给 URL 时退回颜色", () => {
    const result = sanitizeAvatar({ type: "image", color: "#0ea5a3" });
    assert.equal(result.type, "color");
    assert.equal(result.color, "#0ea5a3");
  });
});
