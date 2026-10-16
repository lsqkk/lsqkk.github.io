// @ts-check
/**
 * 「谍报风云」音效。
 *
 * 全部用 WebAudio 振荡器现场合成，**不引入任何音频文件**：仓库里没有可复用的音效资源
 * （其它小游戏引用的 `.mp3` 大多已不在部署产物里），而合成音既不用新增二进制、
 * 离线也能响，音量与音色还能直接在代码里调。
 * 仓库内 AudioContext 的既有先例见 `assets/pages/games/piano/piano.js`。
 *
 * 音色不是"裸振荡器"：所有音符先过一道低通（削掉方波/锯齿最刺耳的高次谐波），
 * 再分成干、湿两路 —— 湿路进一个合成脉冲响应的卷积混响，给整个界面一点"房间感"。
 * 桌游的音效之所以"成熟"，一半来自这一层空间感，而不是音本身。
 *
 * 浏览器要求先有用户手势才允许出声，所以 AudioContext 是**懒创建**的，
 * 由 `armUnlock()` 挂在第一次 pointerdown / keydown 上。播放时若上下文还没跑起来，
 * 这一个音直接丢掉（挂起期间排进去的音会在恢复的那一刻一起响，变成一串迟到的鬼叫），
 * 并把解锁监听重新挂上，避免"第一次解锁失败之后再也没声音"。
 */

const STORAGE_KEY = "spySignalSound";

/** 总音量。预设里的 gain 都按这个比例缩放，改一处即可整体调轻/调响。 */
const MASTER_GAIN = 0.85;
/** 低通截止：去掉齿音，保留"木头/金属"的质感 */
const SOFTEN_HZ = 6800;
/** 混响湿音量：0.16 大致是"小房间"的听感，再大就糊了 */
const REVERB_MIX = 0.16;
/** 合成脉冲响应的长度（秒） */
const REVERB_SECONDS = 1.1;

/**
 * 一个音符：从 `freq` 起，用 `dur` 秒衰减到静音；
 * 给了 `to` 就在这段时间里滑到那个频率，`delay` 用来把音排成短句。
 *
 * @typedef {object} Note
 * @property {number} freq
 * @property {number} dur
 * @property {number} [gain]
 * @property {number} [delay]
 * @property {number} [to]
 * @property {OscillatorType} [type]
 * @property {number} [attack] 起音时间（秒），默认 0.012；弦乐类可以放宽
 * @property {number} [spread] 失谐量（音分）。给了就叠一个略微走音的副振荡器，
 *   两个正弦拍频会产生轻微的合唱感 —— 单个纯正弦听起来"电子"，叠一点就"乐器"了。
 */

/**
 * 预设音效。音量刻意压在 0.04–0.18 之间，是"提示"而不是"吓人"。
 *
 * 命名分成四组：界面手感（click / toggle / copy / denied）、
 * 聊天（message / teamMessage）、房间（join / leave / full / ready）、
 * 对局（start / deal / shuffle / turn / myTurn / submit / settle* / win / lose）。
 * @type {Record<string, Note[]>}
 */
const PRESETS = {
  /* ── 界面手感 ─────────────────────────────────────────────────── */

  /** 按钮轻点：极短的一声"嗒"。全局挂在按钮的 pointerdown 上，必须够轻。 */
  click: [{ freq: 1180, dur: 0.04, gain: 0.045, type: "triangle" }],
  /** 页签 / 开关切换：比 click 略低、带一点回弹 */
  toggle: [
    { freq: 720, dur: 0.05, gain: 0.05, type: "triangle" },
    { freq: 1120, dur: 0.07, gain: 0.042, delay: 0.04, type: "triangle" },
  ],
  /** 复制成功：一声清脆的上扬 */
  copy: [
    { freq: 1046.5, dur: 0.07, gain: 0.09 },
    { freq: 1568, dur: 0.13, gain: 0.07, delay: 0.06 },
  ],
  /** 操作被拒：两声低沉的"嗯哼"，明说"这条路不通" */
  denied: [
    { freq: 196, dur: 0.11, gain: 0.1, type: "square" },
    { freq: 164.81, dur: 0.15, gain: 0.09, delay: 0.1, type: "square" },
  ],

  /* ── 聊天 ─────────────────────────────────────────────────────── */

  /** 公共频道新消息：两声轻快的"叮咚" */
  message: [
    { freq: 880, dur: 0.09, gain: 0.16 },
    { freq: 1318.51, dur: 0.13, gain: 0.13, delay: 0.085 },
  ],
  /** 队内频道新消息：更高更贴耳，和公共频道一听就能分开 */
  teamMessage: [
    { freq: 987.77, dur: 0.07, gain: 0.13, spread: 9 },
    { freq: 1479.98, dur: 0.12, gain: 0.1, delay: 0.07, spread: 9 },
  ],

  /* ── 房间 ─────────────────────────────────────────────────────── */

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
  /** 4 人齐：比 join 更完整的一小段上行，值得为"可以开局了"停一下 */
  full: [
    { freq: 587.33, dur: 0.1, gain: 0.12, spread: 6 },
    { freq: 783.99, dur: 0.1, gain: 0.12, delay: 0.09, spread: 6 },
    { freq: 1174.66, dur: 0.22, gain: 0.11, delay: 0.18, spread: 6 },
  ],
  /** 有人点了「准备」：一声干净的上行双音 */
  ready: [
    { freq: 659.25, dur: 0.08, gain: 0.12 },
    { freq: 987.77, dur: 0.14, gain: 0.1, delay: 0.07 },
  ],
  /** 取消准备：把 ready 反过来 */
  unready: [
    { freq: 659.25, dur: 0.08, gain: 0.1 },
    { freq: 493.88, dur: 0.14, gain: 0.09, delay: 0.07 },
  ],

  /* ── 对局 ─────────────────────────────────────────────────────── */

  /** 开局 */
  start: [
    { freq: 523.25, dur: 0.12, gain: 0.13, spread: 7 },
    { freq: 783.99, dur: 0.12, gain: 0.13, delay: 0.1, spread: 7 },
    { freq: 1046.5, dur: 0.24, gain: 0.12, delay: 0.2, spread: 7 },
  ],
  /** 发牌：短促的四连"嗒"再收一个和弦，像把词牌摊在桌上 */
  deal: [
    { freq: 1318.51, dur: 0.05, gain: 0.08, type: "triangle" },
    { freq: 1174.66, dur: 0.05, gain: 0.08, delay: 0.055, type: "triangle" },
    { freq: 1046.5, dur: 0.05, gain: 0.08, delay: 0.11, type: "triangle" },
    { freq: 880, dur: 0.07, gain: 0.08, delay: 0.165, type: "triangle" },
    { freq: 523.25, dur: 0.2, gain: 0.1, delay: 0.25, spread: 8 },
    { freq: 783.99, dur: 0.2, gain: 0.09, delay: 0.25, spread: 8 },
  ],
  /** 换词：一串细碎的洗牌声 */
  shuffle: [
    { freq: 1568, dur: 0.035, gain: 0.07, type: "triangle" },
    { freq: 1174.66, dur: 0.035, gain: 0.07, delay: 0.05, type: "triangle" },
    { freq: 1396.91, dur: 0.035, gain: 0.07, delay: 0.1, type: "triangle" },
    { freq: 1046.5, dur: 0.035, gain: 0.07, delay: 0.15, type: "triangle" },
    { freq: 1318.51, dur: 0.035, gain: 0.07, delay: 0.2, type: "triangle" },
    { freq: 880, dur: 0.12, gain: 0.08, delay: 0.26 },
  ],
  /** 阶段推进：中性两音，提示"画面要换了" */
  turn: [
    { freq: 659.25, dur: 0.1, gain: 0.15 },
    { freq: 987.77, dur: 0.16, gain: 0.12, delay: 0.09 },
  ],
  /**
   * 轮到我出手：比 turn 更强调（三音、音更高、尾巴更长），
   * 是整局里唯一需要"抬头看一眼"的提示。
   */
  myTurn: [
    { freq: 783.99, dur: 0.09, gain: 0.15, spread: 6 },
    { freq: 1046.5, dur: 0.09, gain: 0.15, delay: 0.085, spread: 6 },
    { freq: 1318.51, dur: 0.3, gain: 0.13, delay: 0.17, spread: 6 },
  ],
  /** 提交暗号 / 猜测：一声明确的"确认" */
  submit: [
    { freq: 587.33, dur: 0.07, gain: 0.12 },
    { freq: 880, dur: 0.18, gain: 0.11, delay: 0.06 },
  ],
  /** 本轮没扣血（中性收尾） */
  settleGood: [
    { freq: 587.33, dur: 0.12, gain: 0.12, spread: 6 },
    { freq: 783.99, dur: 0.2, gain: 0.11, delay: 0.11, spread: 6 },
  ],
  /** 本轮掉血：低音下行 + 方波，听起来"不妙" */
  settleBad: [
    { freq: 311.13, dur: 0.16, gain: 0.14, type: "triangle" },
    { freq: 207.65, dur: 0.28, gain: 0.13, delay: 0.14, type: "triangle" },
  ],
  /** 本轮作废：一声平淡的中音 */
  void: [{ freq: 440, dur: 0.22, gain: 0.11, to: 415.3, type: "triangle" }],

  /* ── 收尾 ─────────────────────────────────────────────────────── */

  /** 被移出房间：低沉的两次下滑 */
  kick: [
    { freq: 233.08, dur: 0.18, gain: 0.14, to: 174.61, type: "sawtooth" },
    { freq: 174.61, dur: 0.3, gain: 0.12, delay: 0.16, to: 116.54, type: "sawtooth" },
  ],
  /** 我方获胜：上行大三和弦 */
  win: [
    { freq: 523.25, dur: 0.14, gain: 0.13, spread: 7 },
    { freq: 659.25, dur: 0.14, gain: 0.13, delay: 0.13, spread: 7 },
    { freq: 783.99, dur: 0.16, gain: 0.13, delay: 0.26, spread: 7 },
    { freq: 1046.5, dur: 0.34, gain: 0.12, delay: 0.4, spread: 7 },
  ],
  /** 我方落败：下行小三和弦 */
  lose: [
    { freq: 523.25, dur: 0.16, gain: 0.12, type: "triangle" },
    { freq: 415.3, dur: 0.16, gain: 0.12, delay: 0.15, type: "triangle" },
    { freq: 311.13, dur: 0.4, gain: 0.11, delay: 0.3, type: "triangle" },
  ],

  /* ── 音效开关自身的反馈 ───────────────────────────────────────── */

  /** 打开音效：上行，和"亮起来"对应 */
  on: [
    { freq: 659.25, dur: 0.08, gain: 0.12 },
    { freq: 1046.5, dur: 0.16, gain: 0.1, delay: 0.07 },
  ],
  /** 关闭音效：下行。这一声必须放在"关掉之后还能响"的时机里播，见 main.js */
  off: [
    { freq: 880, dur: 0.08, gain: 0.11 },
    { freq: 587.33, dur: 0.16, gain: 0.09, delay: 0.07 },
  ],
};

/** @type {AudioContext | null} */
let context = null;
/** @type {GainNode | null} */
let master = null;
/** @type {BiquadFilterNode | null} */
let softener = null;
let enabled = readEnabled();
/** 手势解锁监听是否已经挂上（幂等，见 `armUnlock()`） */
let unlockArmed = false;

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
 * 合成一段脉冲响应：白噪声按指数衰减，尾巴再淡出。
 * 卷积混响不需要真实房间录音，这样一段"噪声尾巴"已经足够把声音从"贴脸"推到"有空间"。
 * @param {AudioContext} ctx
 * @returns {AudioBuffer}
 */
function makeImpulse(ctx) {
  const length = Math.max(1, Math.floor(ctx.sampleRate * REVERB_SECONDS));
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      const decay = (1 - i / length) ** 2.6;
      data[i] = (Math.random() * 2 - 1) * decay;
    }
  }
  return buffer;
}

/**
 * 建好"音符 → 低通 →（干 / 湿）→ 输出"的固定总线。只在创建上下文时走一次。
 * @param {AudioContext} ctx
 * @returns {void}
 */
function buildGraph(ctx) {
  master = ctx.createGain();
  master.gain.value = MASTER_GAIN;
  master.connect(ctx.destination);

  softener = ctx.createBiquadFilter();
  softener.type = "lowpass";
  softener.frequency.value = SOFTEN_HZ;
  softener.Q.value = 0.6;
  softener.connect(master);

  try {
    const convolver = ctx.createConvolver();
    convolver.buffer = makeImpulse(ctx);
    const wet = ctx.createGain();
    wet.gain.value = REVERB_MIX;
    softener.connect(convolver);
    convolver.connect(wet);
    wet.connect(master);
  } catch {
    // 少数环境不支持 ConvolverNode：退化成纯干声，不影响出声
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
    buildGraph(context);
  } catch {
    context = null;
  }
  return context;
}

/**
 * 在文档上挂手势解锁监听。
 *
 * ⚠️ 早先是"响了第一次就把监听摘掉"，于是只要那一次 `resume()` 被拒
 * （或上下文还是挂起的），后面就再也解不开了 —— 表现就是"有的音效时有时无"。
 * 现在改成：只要上下文还没跑起来就一直留着，谁先成功谁生效；重复调用无副作用。
 * @returns {void}
 */
export function armUnlock() {
  if (unlockArmed) return;
  unlockArmed = true;

  function release() {
    document.removeEventListener("pointerdown", handler);
    document.removeEventListener("keydown", handler);
    unlockArmed = false;
  }

  function handler() {
    const ctx = ensureContext();
    if (!ctx) {
      // 这个环境根本出不了声，别白挂监听
      release();
      return;
    }
    if (ctx.state === "running") {
      release();
      return;
    }
    ctx.resume()
      .then(() => {
        if (ctx.state === "running") release();
      })
      .catch(() => {
        /* 还没拿到手势时会被拒，等下一次手势再试 */
      });
  }

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
 * 叠一层失谐副振荡器，让纯正弦有点"乐器感"。
 * @param {AudioContext} ctx
 * @param {Note} note
 * @param {number} start
 * @param {number} end
 * @param {number} peak
 * @returns {void}
 */
function scheduleVoice(ctx, note, start, end, peak) {
  const type = note.type ?? "sine";
  const attack = note.attack ?? 0.012;
  const spread = note.spread ?? 0;
  // spread=0 时只有一层，避免白烧一个振荡器
  const layers = spread > 0 ? [-spread, spread] : [0];

  for (const cents of layers) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(note.freq, start);
    if (cents !== 0) {
      osc.detune.setValueAtTime(cents, start);
    }
    if (note.to) osc.frequency.exponentialRampToValueAtTime(note.to, end);

    const amp = ctx.createGain();
    // 指数斜坡不能取 0，用极小值代替；这样不会有"咔"的爆音
    // 副振荡器音量减半：拍频只需要一点点，多了就变成"走音"而不是"厚度"
    const layerPeak = cents === 0 ? peak : peak * 0.5;
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(layerPeak, start + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(amp);
    if (softener) amp.connect(softener);
    else amp.connect(master ?? ctx.destination);
    osc.start(start);
    osc.stop(end + 0.02);
  }
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

  // 还没拿到用户手势：这一声直接丢掉，并把解锁监听重新挂上。
  // 挂起状态下 `currentTime` 是冻结的，硬排进去的音会在恢复的那一刻一起炸出来。
  if (ctx.state !== "running") {
    armUnlock();
    ctx.resume().catch(() => {
      /* 无手势时会被拒；下一次手势再试 */
    });
    return;
  }

  const now = ctx.currentTime;
  for (const note of notes) {
    const start = now + (note.delay ?? 0) + 0.01;
    scheduleVoice(ctx, note, start, start + note.dur, note.gain ?? 0.13);
  }
}
