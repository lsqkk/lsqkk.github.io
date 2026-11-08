const room = document.querySelector("[data-media-origin]");
const find = (name) => room.querySelector(`[data-${name}]`);
const origin = room.dataset.mediaOrigin;
const video = find("video");
const badge = find("status");
const elapsed = find("elapsed");
const standby = find("standby");
const playerNote = find("player-note");
const playButton = find("play");
const retry = find("retry");
const edge = find("edge");
const backupPlayer = find("backup-player");
const backupActions = find("backup-actions");
const backupToggle = find("backup-toggle");
const form = find("chat-form");
const nickname = form.elements.nickname;
const message = form.elements.message;
const send = form.querySelector("button");
const feed = find("feed");
const messages = find("messages");
const chatEmpty = find("chat-empty");
const chatEmptyNote = find("chat-empty-note");
const chatNote = find("chat-note");
const chatState = find("chat-state");
const timeFormat = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" });

let connection = "connecting";
let streamId = null;
let startedAt = NaN;
let player = null;
let engine = null;
let retryAt = 0;
let chatEnabled = false;
let sending = false;
let polling = false;
let pollTimer;
let displayedIds = [];
let revision = "";
let backupEnabled = true;

try {
  nickname.value = localStorage.getItem("quark-live-nickname") || "";
} catch {
  // The room can still be used with browser storage disabled.
}

async function request(path, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5500);
  try {
    const response = await fetch(origin + path, {
      cache: "no-store",
      ...options,
      signal: controller.signal,
    });
    return { ok: response.ok, data: await response.json() };
  } finally {
    clearTimeout(timeout);
  }
}

function cover(title, detail, canRetry = false) {
  standby.hidden = false;
  video.hidden = true;
  playButton.hidden = true;
  edge.hidden = true;
  retry.hidden = !canRetry;
  find("standby-title").textContent = title;
  find("standby-text").textContent = detail;
}

function updateBackup() {
  const offline = connection === "offline";
  const showBackup = offline && backupEnabled;
  backupActions.hidden = !offline;
  if (showBackup && !backupPlayer.hasAttribute("src")) {
    backupPlayer.src = backupPlayer.dataset.src;
  } else if (!showBackup && backupPlayer.hasAttribute("src")) {
    backupPlayer.removeAttribute("src");
  }
  backupPlayer.hidden = !showBackup;
  if (offline) {
    standby.hidden = showBackup;
    backupToggle.textContent = showBackup ? "收起备播" : "播放备播";
    playerNote.textContent = showBackup ? "备播 · 联合国网络电视 · 预录节目" : "本页会自动检查开播状态";
  }
}

backupToggle.addEventListener("click", () => {
  backupEnabled = !backupEnabled;
  updateBackup();
});

function stopPlayback() {
  if (!player) return;
  clearTimeout(player.timeout);
  player = null;
  engine?.destroy();
  engine = null;
  video.pause();
  video.removeAttribute("src");
  video.load();
  video.hidden = true;
  playButton.hidden = true;
  edge.hidden = true;
}

function playbackFailed(attempt) {
  if (!attempt || player !== attempt) return;
  stopPlayback();
  retryAt = Date.now() + 10000;
  cover("暂时无法播放", "直播仍在进行，正在等待重新连接。", true);
  playerNote.textContent = "等待恢复画面";
}

async function play() {
  const attempt = player;
  try {
    await video.play();
  } catch (error) {
    if (player !== attempt) return;
    if (error.name !== "NotAllowedError") return;
    playButton.hidden = false;
    playerNote.textContent = "点击播放观看直播";
  }
}

async function startPlayback() {
  if (player || !streamId) return;
  const attempt = { timeout: setTimeout(() => playbackFailed(attempt), 18000) };
  player = attempt;
  cover("正在接入直播", "正在等待第一帧画面。");
  playerNote.textContent = "正在加载直播画面";
  video.muted = true;
  const source = origin + "/quark/index.m3u8";
  const native = Boolean(video.canPlayType("application/vnd.apple.mpegurl"));

  try {
    const { default: Hls } = await import("hls.js/light");
    if (player !== attempt) return;
    if (!Hls.isSupported()) {
      if (native) {
        video.src = source;
        return;
      }
      stopPlayback();
      retryAt = Infinity;
      cover("浏览器暂不支持播放", "请使用较新版本的 Safari、Chrome 或 Edge。");
      playerNote.textContent = "浏览器缺少 HLS 播放支持";
      return;
    }
    engine = new Hls({ lowLatencyMode: false, liveSyncDurationCount: 3, liveMaxLatencyDurationCount: 7 });
    engine.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) playbackFailed(attempt);
    });
    engine.loadSource(source);
    engine.attachMedia(video);
  } catch {
    if (player !== attempt) return;
    if (native && !engine) video.src = source;
    else playbackFailed(attempt);
  }
}

video.addEventListener("canplay", () => {
  if (!player || !video.hidden) return;
  clearTimeout(player.timeout);
  video.hidden = false;
  standby.hidden = true;
  edge.hidden = false;
  void play();
});
video.addEventListener("playing", () => {
  if (!player) return;
  playButton.hidden = true;
  playerNote.textContent = video.muted ? "正在播放 · 可在播放器内开启声音" : "正在播放直播";
});
video.addEventListener("volumechange", () => {
  if (!video.paused && player) {
    playerNote.textContent = video.muted ? "正在播放 · 可在播放器内开启声音" : "正在播放直播";
  }
});
video.addEventListener("error", () => playbackFailed(player));
video.addEventListener("waiting", () => {
  if (player && !video.hidden) playerNote.textContent = "正在缓冲";
});
playButton.addEventListener("click", () => void play());
edge.addEventListener("click", () => {
  const ranges = video.seekable;
  if (!ranges.length) return;
  const range = ranges.length - 1;
  video.currentTime = engine?.liveSyncPosition ?? Math.max(ranges.start(range), ranges.end(range) - 2);
  void play();
});

function updateClock() {
  elapsed.hidden = !Number.isFinite(startedAt);
  if (elapsed.hidden) return;
  const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const values = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60];
  elapsed.textContent = values.map((value) => String(value).padStart(2, "0")).join(":");
}

function updateChatControls() {
  nickname.disabled = !chatEnabled;
  message.disabled = !chatEnabled;
  send.disabled = !chatEnabled || sending;
  message.placeholder = chatEnabled ? "发一条消息…" : "等开播后再聊";
  const available = connection === "live" || connection === "offline";
  chatState.textContent = chatEnabled ? "开放" : available ? "休息中" : "连接中";
  chatEmptyNote.textContent = chatEnabled ? "来发一条消息吧。" : "开播后可以在这里打个招呼。";
}

function showMessages(list) {
  const ids = list.map(({ id }) => id);
  if (ids.length === displayedIds.length && ids.every((id, i) => id === displayedIds[i])) return;
  const atBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 45;
  while (messages.firstElementChild && !ids.includes(messages.firstElementChild.dataset.id)) {
    messages.firstElementChild.remove();
  }
  for (const entry of list) {
    if (displayedIds.includes(entry.id)) continue;
    const row = document.createElement("li");
    row.className = "message";
    row.dataset.id = entry.id;
    const time = document.createElement("time");
    time.dateTime = entry.time;
    time.textContent = timeFormat.format(new Date(entry.time));
    const author = document.createElement("strong");
    author.textContent = entry.nickname;
    row.append(time, author, document.createTextNode(entry.message));
    messages.append(row);
  }
  displayedIds = ids;
  chatEmpty.hidden = ids.length !== 0;
  if (atBottom) feed.scrollTop = feed.scrollHeight;
}

function updateRoom(data) {
  if (connection === "unavailable") chatNote.textContent = message.value.trim() ? "连接已恢复，可以重新发送。" : "";
  const nextId = data.live ? data.startedAt : null;
  if (nextId !== streamId) {
    stopPlayback();
    streamId = nextId;
    retryAt = 0;
    chatNote.textContent = "";
  }
  connection = nextId ? "live" : "offline";
  startedAt = nextId ? Date.parse(nextId) : NaN;
  badge.dataset.state = connection;
  badge.textContent = nextId ? "直播中" : "未开播";
  updateClock();

  if (nextId) {
    if (!player && Date.now() >= retryAt) void startPlayback();
  } else {
    cover("现在未开播", "开播后，画面会在这里出现。");
  }
  updateBackup();

  chatEnabled = Boolean(nextId && data.chatOpen);
  updateChatControls();
  if (Array.isArray(data.messages)) showMessages(data.messages);
  revision = data.revision || "";
}

async function poll() {
  if (polling) return;
  clearTimeout(pollTimer);
  polling = true;
  try {
    const { ok, data } = await request("/api/room?since=" + encodeURIComponent(revision));
    if (!ok) throw new Error("Room unavailable");
    updateRoom(data);
  } catch {
    connection = "unavailable";
    badge.dataset.state = connection;
    badge.textContent = "连接中断";
    updateBackup();
    chatEnabled = false;
    updateChatControls();
    chatNote.textContent = message.value.trim() ? "直播间连接中断，输入已保留。恢复连接后可重新发送。" : "直播间连接中断，正在重连…";
    if (!player) {
      cover("暂时连不上直播间", "稍后会自动重试，也可以手动重连。", true);
      playerNote.textContent = "等待直播服务恢复";
    }
  } finally {
    polling = false;
    const interval = connection === "live" ? 3000 : 10000;
    pollTimer = setTimeout(poll, document.hidden ? 20000 : interval);
  }
}

retry.addEventListener("click", () => {
  retryAt = 0;
  void poll();
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) void poll();
});
window.addEventListener("online", poll);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const draft = message.value;
  if (!chatEnabled || sending || !draft.trim()) return;
  sending = true;
  updateChatControls();
  chatNote.textContent = "发送中…";
  try {
    const { ok, data } = await request("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: nickname.value, message: draft, streamId }),
    });
    if (!ok) {
      chatNote.textContent = data.error || "消息未发送，请稍后再试。";
      return;
    }
    if (message.value === draft) message.value = "";
    chatNote.textContent = "";
    try {
      localStorage.setItem("quark-live-nickname", nickname.value);
    } catch {
      // Storage is optional.
    }
    void poll();
  } catch {
    chatNote.textContent = "未能确认消息是否送达，请先查看聊天列表。";
  } finally {
    sending = false;
    updateChatControls();
  }
});

find("share").addEventListener("click", async (event) => {
  const label = event.currentTarget.querySelector("span");
  const url = document.querySelector('link[rel="canonical"]').href;
  try {
    await navigator.clipboard.writeText(url);
    find("share-status").textContent = "直播间链接已复制";
    label.textContent = "链接已复制";
  } catch {
    window.prompt("复制直播间链接", url);
  }
});

setInterval(updateClock, 1000);
void poll();
