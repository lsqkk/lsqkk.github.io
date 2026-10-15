// @ts-check
/**
 * 「谍报风云」音效。
 *
 * 全部用 WebAudio 振荡器现场合成，**不引入任何音频文件**：仓库里没有可复用的音效资源
 * （其它小游戏引用的 `.mp3` 大多已不在部署产物里），而合成音既不用新增二进制、
 * 离线也能响，音量与音色还能直接在代码里调。
 * 仓库内 AudioContext 的既有先例见 `assets/pages/games/piano/piano.js`。
 *
 * 浏览器要求先有用户手势才允许出声，所以 AudioContext 是**懒创建**的：
 * 第一次 pointerdown / keydown 时才 `unlock()`；播放时若被挂起还会再 resume 一次。
 */

const STORAGE_KEY = "spySignalSound";

/**
 * 一个音符：从 `freq` 起，用 `dur` 秒衰减到静音；
 * 给了 `to` 就在这段时间里滑到那个频率，`delay` 用来把音排成短句。
 * @typedef {object} Note
 * @property {number} freq
 * @property {number} dur
 * @property {number} [gain]
 * @property {number} [delay]
 * @property {number} [to]
 * @property {OscillatorType} [type]
 */

/** 预设音效。音量刻意压在 0.10–0.18 之间，是"提示"而不是"吓人"。 */
/** @type {Record<string, Note[]>} */
const PRESETS = {
  /** 新消息：两声轻快的"叮咚" */
  message: [
    { freq: 880, dur: 0.09, gain: 0.16 },
    { freq: 1318.51, dur: 0.13, gain: 0.13, delay: 0.085 },
  ],
  /** 有人进房：上行两音 */
  join: [
    { freq: 587.33, dur: 0.1, gain: 0.13 },
    { freq: 880, dur: 0.16, gain: 0.11, delay: 0.095 },
  ],
  /** 有人离开：下行两音 */
  leave: [
    { freq: 587.33, dur: 0.1, gain: 0.12 },
    { freq: 392, dur: 0.18, gain: 0.11, delay: 0.095 },
  ],
  /** 开局 */
  start: [
    { freq: 523.25, dur: 0.12, gain: 0.13 },
    { freq: 783.99, dur: 0.12, gain: 0.13, delay: 0.1 },
    { freq: 1046.5, dur: 0.24, gain: 0.12, delay: 0.2 },
  ],
  /** 轮到我出手：上行三音，比 start 更短促 */
  turn: [
    { freq: 659.25, dur: 0.1, gain: 0.15 },
    { freq: 987.77, dur: 0.16, gain: 0.12, delay: 0.09 },
  ],
  /** 本轮没扣血（中性收尾） */
  settleGood: [
    { freq: 587.33, dur: 0.12, gain: 0.12 },
    { freq: 783.99, dur: 0.2, gain: 0.11, delay: 0.11 },
  ],
  /** 本轮掉血：低音下行 + 方波，听起来"不妙" */
  settleBad: [
    { freq: 311.13, dur: 0.16, gain: 0.14, type: "triangle" },
    { freq: 207.65, dur: 0.28, gain: 0.13, delay: 0.14, type: "triangle" },
  ],
  /** 本轮作废：一声平淡的中音 */
  void: [{ freq: 440, dur: 0.22, gain: 0.11, to: 415.3, type: "triangle" }],
  /** 被移出房间：低沉的两次下滑 */
  kick: [
    { freq: 233.08, dur: 0.18, gain: 0.14, to: 174.61, type: "sawtooth" },
    { freq: 174.61, dur: 0.3, gain: 0.12, delay: 0.16, to: 116.54, type: "sawtooth" },
  ],
  /** 我方获胜：上行大三和弦 */
  win: [
    { freq: 523.25, dur: 0.14, gain: 0.13 },
    { freq: 659.25, dur: 0.14, gain: 0.13, delay: 0.13 },
    { freq: 783.99, dur: 0.16, gain: 0.13, delay: 0.26 },
    { freq: 1046.5, dur: 0.34, gain: 0.12, delay: 0.4 },
  ],
  /** 我方落败：下行小三和弦 */
  lose: [
    { freq: 523.25, dur: 0.16, gain: 0.12, type: "triangle" },
    { freq: 415.3, dur: 0.16, gain: 0.12, delay: 0.15, type: "triangle" },
    { freq: 311.13, dur: 0.4, gain: 0.11, delay: 0.3, type: "triangle" },
  ],
};

/** @type {AudioContext | null} */
let context = null;
let enabled = readEnabled();

/**
 * 读开关。用 `globalThis` 而不是 `window`，这样这个模块在非浏览器环境
 * （单测、SSR）里 import 也不会炸，只是安静地退化成"没有音效"。
 * @returns {boolean}
 */
function readEnabled() {
  try {
    return globalThis.localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

/**
 * 懒创建 AudioContext。环境不支持时返回 null（静默退化成无声）。
 * @returns {AudioContext | null}
 */
function ensureContext() {
  if (context) return context;
  const scope = /** @type {any} */ (globalThis);
  const Ctor = scope.AudioContext || scope.webkitAudioContext;
  if (typeof Ctor !== "function") return null;
  try {
    context = new Ctor();
  } catch {
    context = null;
  }
  return context;
}

/**
 * 首次用户手势时调用：把被浏览器挂起的 AudioContext 恢复起来。
 * 重复调用无副作用。
 * @returns {void}
 */
export function unlock() {
  const ctx = ensureContext();
  if (ctx && ctx.state === "suspended") {
    ctx.resume().catch(() => {
      /* 还没拿到手势时 resume 会被拒，等下一次手势再试 */
    });
  }
}

/**
 * 在文档上挂一次性的手势解锁监听（pointerdown / keydown 各挂一个，
 * 谁先触发就把两个都摘掉）。
 * @returns {void}
 */
export function attachUnlock() {
  const handler = () => {
    unlock();
    document.removeEventListener("pointerdown", handler);
    document.removeEventListener("keydown", handler);
  };
  document.addEventListener("pointerdown", handler);
  document.addEventListener("keydown", handler);
}

/**
 * @returns {boolean}
 */
export function isEnabled() {
  return enabled;
}

/**
 * @param {boolean} value
 * @returns {boolean} 设置后的状态
 */
export function setEnabled(value) {
  enabled = value === true;
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    /* 隐私模式下写不进去，本次会话内仍按内存值生效 */
  }
  return enabled;
}

/**
 * @returns {boolean} 切换后的状态
 */
export function toggle() {
  return setEnabled(!enabled);
}

/**
 * 播放一个预设音效。未开启、名字不存在、浏览器不支持时都安静返回。
 * @param {keyof typeof PRESETS | string} name
 * @returns {void}
 */
export function play(name) {
  if (!enabled) return;
  const notes = PRESETS[name];
  if (!notes || notes.length === 0) return;

  const ctx = ensureContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {
      /* 无手势时会被拒；下一次播放再试 */
    });
  }

  const now = ctx.currentTime;
  for (const note of notes) {
    const start = now + (note.delay ?? 0) + 0.01;
    const end = start + note.dur;
    const peak = note.gain ?? 0.13;

    const osc = ctx.createOscillator();
    osc.type = note.type ?? "sine";
    osc.frequency.setValueAtTime(note.freq, start);
    if (note.to) osc.frequency.exponentialRampToValueAtTime(note.to, end);

    const amp = ctx.createGain();
    // 指数斜坡不能取 0，用极小值代替；这样不会有"咔"的爆音
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(peak, start + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(start);
    osc.stop(end + 0.02);
  }
}
