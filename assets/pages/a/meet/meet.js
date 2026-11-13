import { CAPACITY, MeetingPeer, formatCode, makeCode, meetingSecret, parseCode } from "./meet-core.mjs";

const byId = (id) => document.getElementById(id);
const icon = (name) => {
    const element = document.createElement("i");
    element.className = `fas ${name}`;
    element.setAttribute("aria-hidden", "true");
    return element;
};
const node = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text) element.textContent = text;
    if (className) element.className = className;
    return element;
};
const cleanText = (value, limit) => typeof value === "string" ? value.trim().slice(0, limit) : "";
const labels = {
    mic: ["开启麦克风", "静音", "fa-microphone-slash", "fa-microphone"],
    camera: ["开启摄像头", "关闭摄像头", "fa-video-slash", "fa-video"],
    share: ["共享屏幕", "停止共享", "fa-desktop", "fa-desktop"],
    hand: ["举手", "放下手", "fa-hand", "fa-hand"]
};
const live = (track) => track?.readyState === "live" ? track : null;
const tracks = { mic: null, camera: null, share: null };
const pendingMedia = new Set();
const deviceIds = { mic: "", camera: "" };
const roomMaxAge = 8 * 60 * 60 * 1000;
let mirror = true;
let mediaEpoch = 0;
let mode = "create";
let busy = false;
let database;
let meeting;
let panel = "";
let focus = null;
let toasting;
let unread = 0;

function storage(key, value) {
    try {
        if (value !== undefined) localStorage.setItem(`qm:${key}`, value);
        else return localStorage.getItem(`qm:${key}`);
    } catch { return null; }
}

function readRecent() {
    try {
        const recent = JSON.parse(storage("recent") || "[]");
        return Array.isArray(recent) ? recent.filter((item) => parseCode(item?.code || "")).slice(0, 8) : [];
    } catch { return []; }
}

function updateRecent() {
    const list = byId("recent-list");
    list.replaceChildren();
    for (const item of readRecent()) {
        const li = node("li");
        const name = node("span", cleanText(item.topic, 64) || "快速会议", "qm-recent-name");
        const date = node("time", new Date(item.at).toLocaleDateString("zh-CN"));
        const button = node("button", formatCode(item.code));
        button.type = "button";
        button.title = "将会议码填入加入表单";
        button.onclick = () => {
            changeMode("join");
            byId("meet-code").value = formatCode(item.code);
            byId("meet-code").focus();
        };
        li.append(name, date, button);
        list.append(li);
    }
    byId("recent-meetings").hidden = !list.children.length;
}

function changeMode(next) {
    if (busy) return;
    mode = next;
    byId("mode-create").setAttribute("aria-pressed", String(mode === "create"));
    byId("mode-join").setAttribute("aria-pressed", String(mode === "join"));
    byId("topic-field").hidden = mode !== "create";
    byId("code-field").hidden = mode !== "join";
    byId("meet-code").required = mode === "join";
    byId("enter-meet").replaceChildren(mode === "create" ? "发起会议" : "加入会议", icon("fa-arrow-right"));
    lobbyError("");
}

function lobbyError(message) {
    byId("lobby-error").textContent = message;
    byId("lobby-error").hidden = !message;
}

function toast(message) {
    const element = byId("meet-toast");
    element.textContent = message;
    element.hidden = false;
    clearTimeout(toasting);
    toasting = setTimeout(() => { element.hidden = true; }, 4200);
}

function toggleLabel(button, slot, active) {
    const [off, on, offIcon, onIcon] = labels[slot];
    button.setAttribute("aria-pressed", String(active));
    button.querySelector("span").textContent = active ? on : off;
    button.querySelector("i").className = `fas ${active ? onIcon : offIcon}`;
}

function bindVideo(video, track, show) {
    const changed = (video.srcObject?.getTracks()[0] || null) !== track;
    const wasHidden = video.hidden;
    if (changed) video.srcObject = track ? new MediaStream([track]) : null;
    video.hidden = !show;
    if (show && (changed || wasHidden)) video.play().catch(() => {});
}

function updateMediaUI() {
    const camera = live(tracks.camera);
    const mic = live(tracks.mic);
    const video = byId("preview-video");
    video.classList.toggle("qm-mirrored", mirror);
    bindVideo(video, camera, Boolean(camera));
    byId("preview-avatar").hidden = Boolean(camera);
    byId("preview-status").textContent = camera || mic
        ? [camera ? "摄像头已开启" : "摄像头已关闭", mic ? "麦克风已开启" : "麦克风已关闭"].join(" · ")
        : "摄像头与麦克风已关闭";
    for (const slot of ["mic", "camera", "share"]) {
        const roomButton = byId(`room-${slot}`);
        const previewButton = byId(`preview-${slot}`);
        for (const button of [roomButton, previewButton]) {
            if (!button) continue;
            toggleLabel(button, slot, Boolean(live(tracks[slot])));
            button.disabled = pendingMedia.has(slot)
                || (slot === "share" ? !navigator.mediaDevices?.getDisplayMedia : !navigator.mediaDevices?.getUserMedia);
        }
    }
    if (meeting) {
        renderTiles(meeting);
        renderMembers(meeting);
    }
}

function publishMedia(session) {
    if (!session) return;
    const status = {};
    for (const [slot, track] of Object.entries(tracks)) status[slot] = Boolean(live(track));
    session.memberRef.transaction((member) => member ? { ...member, ...status } : undefined, undefined, false)
        .catch(() => { if (meeting === session) toast("设备已调整，成员状态同步失败。"); });
    for (const entry of session.peers.values()) entry.peer.updateTracks();
}

async function setMedia(slot, enabled, replace = false) {
    if (pendingMedia.has(slot)) return;
    const epoch = mediaEpoch;
    const old = tracks[slot];
    const previousChoice = old?.getSettings().deviceId || "";
    if (!enabled) {
        tracks[slot] = null;
        old?.stop();
        updateMediaUI();
        publishMedia(meeting);
        return;
    }

    pendingMedia.add(slot);
    updateMediaUI();
    try {
        const choice = deviceIds[slot];
        const selected = choice ? { deviceId: { exact: choice } } : {};
        const stream = slot === "share"
            ? await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 15, max: 30 } }, audio: false })
            : await navigator.mediaDevices.getUserMedia(slot === "mic"
                ? { audio: { echoCancellation: true, noiseSuppression: true, ...selected } }
                : { video: { width: { ideal: 960 }, height: { ideal: 540 }, ...selected } });
        const track = stream.getTracks()[0];
        if (!track || epoch !== mediaEpoch) {
            stream.getTracks().forEach((item) => item.stop());
            return;
        }
        tracks[slot] = track;
        old?.stop();
        track.addEventListener("ended", () => {
            if (tracks[slot] === track) setMedia(slot, false);
        });
        publishMedia(meeting);
        refreshDevices();
    } catch (error) {
        const name = { mic: "麦克风", camera: "摄像头", share: "屏幕共享" }[slot];
        if (epoch === mediaEpoch) {
            if (replace) {
                deviceIds[slot] = previousChoice;
                refreshDevices();
            }
            const reason = error.name === "NotAllowedError" ? "浏览器未授权或已取消"
                : error.name === "NotFoundError" ? "未找到可用设备" : "设备暂时不可用";
            toast(`${replace ? "切换" : "开启"}${name}失败，${reason}。`);
        }
    } finally {
        pendingMedia.delete(slot);
        updateMediaUI();
    }
}

async function refreshDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        for (const [slot, kind] of [["mic", "audioinput"], ["camera", "videoinput"]]) {
            const select = byId(`${slot}-select`);
            const choices = devices.filter((device) => device.kind === kind && device.deviceId && device.deviceId !== "default");
            select.replaceChildren(new Option("系统默认", ""), ...choices.map((device, index) =>
                new Option(device.label || `设备 ${index + 1}`, device.deviceId)));
            if (!choices.some((device) => device.deviceId === deviceIds[slot])) deviceIds[slot] = "";
            select.value = deviceIds[slot];
        }
    } catch { /* Device permissions can be blocked by the browser. */ }
}

function closeMedia() {
    mediaEpoch += 1;
    for (const [slot, track] of Object.entries(tracks)) {
        tracks[slot] = null;
        track?.stop();
    }
    updateMediaUI();
}

function withTimeout(promise, message, ms = 9000) {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
    })]).finally(() => clearTimeout(timer));
}

async function getDatabase() {
    if (!window.firebase?.database?.ServerValue || !window.firebaseConfig?.databaseURL) {
        throw new Error("会议信令未加载。请刷新页面后重试。");
    }
    if (!window.isSecureContext || !crypto.subtle || !window.RTCPeerConnection) {
        throw new Error("请在支持 WebRTC 的浏览器中通过 HTTPS 打开会议。");
    }
    if (!database) {
        const app = window.firebase.apps.find((item) => item.name === "quark-meeting")
            || window.firebase.initializeApp(window.firebaseConfig, "quark-meeting");
        database = app.database();
    }
    const info = database.ref(".info/connected");
    let listener;
    try {
        await withTimeout(new Promise((resolve, reject) => {
            listener = (snapshot) => { if (snapshot.val()) resolve(); };
            info.on("value", listener, reject);
        }), "无法连接会议服务，请检查网络后重试。");
    } finally {
        if (listener) info.off("value", listener);
    }
    return database;
}

function bind(session, ref, event, callback) {
    ref.on(event, callback, () => {
        if (meeting === session) exitRoom("会议服务连接已失效。");
    });
    session.cleanup.push(() => ref.off(event, callback));
}

function validState(state, now) {
    return Boolean(state?.host && state.members?.[state.host] && state.createdAt > now - roomMaxAge);
}

async function reserveMeeting({ code, name, topic, create }) {
    const db = await getDatabase();
    const secret = await meetingSecret(code);
    const session = {
        id: crypto.randomUUID(),
        code,
        secret,
        root: db.ref(secret.address),
        cleanup: [],
        peers: new Map(),
        tiles: new Map(),
        profiles: new Map(),
        self: name,
        dbConnected: true
    };
    session.stateRef = session.root.child("state");
    session.memberRef = session.stateRef.child(`members/${session.id}`);
    session.inbox = session.root.child(`signals/${session.id}`);
    const offset = await withTimeout(db.ref(".info/serverTimeOffset").once("value"), "会议时间同步失败，请重试。");
    const now = Date.now() + (Number(offset.val()) || 0);
    const profile = await secret.seal({ name }, `profile:${session.id}`);
    const title = create ? await secret.seal({ topic }, "topic") : null;
    const member = { profile, joinedAt: now, mic: Boolean(live(tracks.mic)), camera: Boolean(live(tracks.camera)), share: false, hand: false };

    // Prime the transaction cache before an updater can decide that an existing room is missing.
    const pin = () => {};
    session.stateRef.on("value", pin);
    try {
        await withTimeout(session.stateRef.once("value"), "会议数据加载超时，请重试。");
        await withTimeout(session.memberRef.onDisconnect().remove(), "无法登记会议在线状态，请重试。");
        await withTimeout(session.inbox.onDisconnect().remove(), "无法登记会议在线状态，请重试。");
        let reason = "会议状态已变化，请重试。";
        let canceled = false;
        const reservation = session.stateRef.transaction((state) => {
            if (canceled) return;
            if (create) {
                if (validState(state, now)) {
                    reason = "会议码已占用，请重新发起。";
                    return;
                }
                return { title, host: session.id, createdAt: now, locked: false, members: { [session.id]: member } };
            }
            if (!validState(state, now)) {
                reason = "该会议不存在或已结束，请核对邀请。";
                return;
            }
            if (state.locked) {
                reason = "主持人已锁定会议，请联系主持人。";
                return;
            }
            if (Object.keys(state.members).length >= CAPACITY) {
                reason = "会议人数已满（最多 6 人）。";
                return;
            }
            return { ...state, members: { ...state.members, [session.id]: member } };
        }, undefined, false);
        let outcome;
        try {
            outcome = await withTimeout(reservation, "会议服务响应超时，请重试。");
        } catch (error) {
            canceled = true;
            reservation.then(({ committed }) => { if (committed) return session.memberRef.remove(); }).catch(() => {});
            throw error;
        }
        const { committed, snapshot } = outcome;
        if (!committed) throw new Error(reason);
        session.state = snapshot.val();
        session.topic = cleanText((await secret.open(session.state.title, "topic")).topic, 64) || "快速会议";
        session.host = session.state.host === session.id;
        session.localStart = Date.now() - Math.max(0, now - session.state.createdAt);
        session.profiles.set(session.id, name);
        return session;
    } catch (error) {
        // A failure after reservation must not leave a seat occupied.
        session.memberRef.remove().then(() => session.memberRef.onDisconnect().cancel()).catch(() => {});
        session.inbox.onDisconnect().cancel().catch(() => {});
        throw error;
    } finally {
        session.stateRef.off("value", pin);
    }
}

function memberName(session, id) {
    return session.profiles.get(id) || "参会者";
}

function receiveSignal(session, snapshot) {
    const packet = snapshot.val();
    if (typeof packet?.from !== "string" || !/^[a-f0-9-]{36}$/.test(packet.from) || packet.from === session.id) {
        session.inbox.child(snapshot.key).remove().catch(() => {});
        return;
    }
    const entry = ensurePeer(session, packet.from);
    if (!entry) return;
    entry.inbox = entry.inbox.then(async () => {
        let data;
        try {
            data = await session.secret.open(packet.body, `signal:${packet.from}:${session.id}`);
        } catch { return; }
        if (meeting === session && !entry.peer.closed) await entry.peer.receive(data);
    }).finally(() => session.inbox.child(snapshot.key).remove().catch(() => {}));
}

function ensurePeer(session, id) {
    if (id === session.id || session.peers.has(id)) return session.peers.get(id);
    if (!session.state.members?.[id]) return null;
    const entry = { tracks: {}, state: "new", inbox: Promise.resolve() };
    const audio = node("audio");
    audio.autoplay = true;
    audio.hidden = true;
    entry.audio = audio;
    byId("room-tiles").append(audio);
    const peer = new MeetingPeer({
        initiator: session.id < id,
        trackFor: (slot) => live(tracks[slot]),
        send: async (data) => {
            const body = await session.secret.seal(data, `signal:${session.id}:${id}`);
            if (meeting !== session || !session.state.members?.[id]) return;
            await session.root.child(`signals/${id}`).push({ from: session.id, body });
        },
        onState: (state) => {
            if (meeting !== session) return;
            entry.state = state;
            renderNetwork(session);
            renderTiles(session);
            renderMembers(session);
        },
        onTrack: (slot, track) => {
            if (meeting !== session || !slot) return;
            entry.tracks[slot] = track;
            if (slot === "mic") {
                audio.srcObject = new MediaStream([track]);
                audio.play().catch(() => { if (meeting === session) byId("resume-audio").hidden = false; });
            } else {
                renderTiles(session);
                for (const event of ["unmute", "mute", "ended"]) track.addEventListener(event, () => {
                    if (meeting === session) renderTiles(session);
                });
            }
        },
        onMessage: (message) => {
            if (meeting !== session) return;
            const text = cleanText(message?.text, 800);
            if (message?.type === "chat" && text) appendChat(session, id, text);
        }
    });
    entry.peer = peer;
    session.peers.set(id, entry);
    return entry;
}

function syncRoster(session, snapshot) {
    if (meeting !== session) return;
    const state = snapshot.val();
    if (!state?.members?.[state.host] || !state.members[session.id]) {
        exitRoom(state?.members?.[state.host] ? "你已离开会议，可以从会前页面重新加入。" : "主持人已结束会议或断开连接。");
        return;
    }
    session.state = state;
    for (const [id, entry] of session.peers) {
        if (state.members[id]) continue;
        entry.peer.close();
        entry.audio.remove();
        session.peers.delete(id);
    }
    for (const [id, member] of Object.entries(state.members)) {
        if (id === session.id || !/^[a-f0-9-]{36}$/.test(id)) continue;
        ensurePeer(session, id);
        if (!session.profiles.has(id)) {
            session.profiles.set(id, "参会者");
            session.secret.open(member.profile, `profile:${id}`).then((profile) => {
                if (meeting !== session) return;
                session.profiles.set(id, cleanText(profile?.name, 24) || "访客");
                renderTiles(session);
                renderMembers(session);
            }).catch(() => {});
        }
    }
    for (const [key, packet] of session.earlySignals) {
        if (!state.members[packet.val()?.from]) continue;
        session.earlySignals.delete(key);
        receiveSignal(session, packet);
    }
    renderNetwork(session);
    renderTiles(session);
    renderMembers(session);
}

function renderNetwork(session) {
    const network = byId("room-network");
    const entries = [...session.peers.values()];
    const connected = entries.filter((entry) => entry.state === "connected").length;
    const issues = entries.some((entry) => ["failed", "error", "signaling"].includes(entry.state));
    const unstable = entries.some((entry) => entry.state === "disconnected");
    network.dataset.state = !session.dbConnected || issues || unstable ? "warn" : "ok";
    const status = !session.dbConnected ? "信令重连中"
        : issues ? `部分连接失败 · ${connected}/${entries.length}`
        : unstable ? "音视频重连中"
        : !entries.length ? "等待成员"
        : connected === entries.length ? "音视频已连接" : `连接中 · ${connected}/${entries.length}`;
    if (network.textContent !== status) network.textContent = status;
    network.title = issues ? "可尝试切换网络或重新入会。受限网络可能无法建立直连。" : "";
}

function createTile(session, key, kind) {
    const tile = byId("tile-template").content.firstElementChild.cloneNode(true);
    tile.dataset.kind = kind;
    tile.dataset.color = String(key.charCodeAt(0) % 4);
    tile.querySelector("video").muted = true;
    tile.querySelector("button").onclick = () => {
        focus = focus === key ? "grid" : key;
        renderTiles(session);
    };
    byId("room-tiles").append(tile);
    session.tiles.set(key, tile);
    return tile;
}

function renderTiles(session) {
    const rendered = new Set();
    const shares = [];
    const members = Object.entries(session.state.members || {});
    for (const [id, member] of members) {
        const mine = id === session.id;
        const name = memberName(session, id);
        const current = mine ? tracks : session.peers.get(id)?.tracks || {};
        const tile = session.tiles.get(id) || createTile(session, id, "camera");
        rendered.add(id);
        const video = tile.querySelector("video");
        const camera = live(current.camera);
        const hasCamera = mine ? Boolean(camera) : Boolean(member.camera && camera && !camera.muted);
        bindVideo(video, camera, hasCamera);
        video.classList.toggle("qm-mirrored", mine && mirror);
        const avatar = tile.querySelector(".qm-tile-avatar");
        avatar.hidden = hasCamera;
        avatar.textContent = Array.from(name)[0] || "访";
        tile.querySelector(".qm-tile-label").textContent = mine ? `${name}（我）` : name;
        const microphone = mine ? live(tracks.mic) : member.mic;
        const status = [member.hand ? "✋ 举手" : "", microphone ? "" : "已静音"].filter(Boolean);
        tile.querySelector(".qm-tile-state").textContent = status.join(" · ");

        if (mine ? live(tracks.share) : member.share) {
            const shareId = `${id}:share`;
            const shareTile = session.tiles.get(shareId) || createTile(session, shareId, "share");
            const track = live(current.share);
            const showing = Boolean(track && !track.muted);
            bindVideo(shareTile.querySelector("video"), track, showing);
            const shareAvatar = shareTile.querySelector(".qm-tile-avatar");
            shareAvatar.hidden = showing;
            if (!shareAvatar.firstChild) shareAvatar.append(icon("fa-desktop"));
            shareTile.querySelector(".qm-tile-label").textContent = `${name}的屏幕`;
            shareTile.querySelector(".qm-tile-state").textContent = showing ? "" : "正在接收共享";
            rendered.add(shareId);
            shares.push(shareId);
        }
    }
    for (const [key, tile] of session.tiles) {
        if (rendered.has(key)) continue;
        tile.remove();
        session.tiles.delete(key);
    }
    const focused = rendered.has(focus) ? focus : focus === "grid" ? null : shares[0];
    for (const [key, tile] of session.tiles) {
        tile.classList.toggle("is-focused", key === focused);
        const label = key === focused ? "退出聚焦" : `聚焦${tile.querySelector(".qm-tile-label").textContent}`;
        const button = tile.querySelector("button");
        button.title = label;
        button.setAttribute("aria-label", label);
        button.hidden = rendered.size < 2;
    }
    const grid = byId("room-tiles");
    grid.dataset.count = String(rendered.size);
    grid.classList.toggle("is-focused", Boolean(focused));
    byId("room-layout").setAttribute("aria-pressed", String(Boolean(focused)));
    byId("room-layout").disabled = rendered.size < 2;
    byId("room-waiting").hidden = members.length > 1;
}

function renderMembers(session) {
    const members = Object.entries(session.state.members || {}).sort(([left], [right]) => {
        return Number(right === session.state.host) - Number(left === session.state.host);
    });
    const list = byId("member-list");
    list.replaceChildren();
    for (const [id, member] of members) {
        const li = node("li");
        const name = memberName(session, id);
        const role = [id === session.state.host ? "主持人" : "", id === session.id ? "我" : ""].filter(Boolean);
        const state = [member.mic ? "麦克风开启" : "已静音", member.camera ? "摄像头开启" : "", member.share ? "正在共享屏幕" : "", member.hand ? "已举手" : ""].filter(Boolean);
        const avatar = node("span", Array.from(name)[0], "qm-member-icon");
        const info = node("span", "", "qm-member-info");
        info.append(node("strong", role.length ? `${name}（${role.join(" · ")}）` : name), node("small", state.join(" · ")));
        li.append(avatar, info);
        list.append(li);
    }
    byId("room-people").querySelector("span").textContent = `成员 ${members.length}`;
    if (panel === "people") byId("panel-title").textContent = `成员 ${members.length}/${CAPACITY}`;
    const locked = session.state.locked;
    byId("host-controls").hidden = !session.host;
    byId("room-lock").setAttribute("aria-pressed", String(Boolean(locked)));
    byId("room-lock").querySelector("span").textContent = locked ? "解除锁定" : "锁定会议";
    toggleLabel(byId("room-hand"), "hand", Boolean(session.state.members[session.id]?.hand));
}

function elapsed(session) {
    const total = Math.max(0, Math.floor((Date.now() - session.localStart) / 1000));
    const clock = [Math.floor(total / 60) % 60, total % 60].map((value) => String(value).padStart(2, "0")).join(":");
    return total < 3600 ? clock : `${Math.floor(total / 3600)}:${clock}`;
}

function startRoom(session) {
    meeting = session;
    session.earlySignals = new Map();
    byId("meet-lobby").hidden = true;
    byId("meet-room").hidden = false;
    byId("room-title").textContent = session.topic;
    byId("room-code").textContent = formatCode(session.code);
    byId("room-notes-text").value = storage(`notes:${session.code}`) || "";
    byId("room-leave").querySelector("span").textContent = session.host ? "结束会议" : "离开";
    byId("room-elapsed").textContent = elapsed(session);
    session.timer = setInterval(() => {
        byId("room-elapsed").textContent = elapsed(session);
        if (Date.now() - session.localStart >= roomMaxAge) exitRoom("会议已达到 8 小时上限。", true);
    }, 1000);

    bind(session, session.stateRef, "value", (snapshot) => syncRoster(session, snapshot));
    bind(session, session.inbox, "child_added", (snapshot) => {
        if (meeting !== session) return;
        const sender = snapshot.val()?.from;
        // A new participant's ICE can arrive before the roster listener sees the join.
        if (session.state.members?.[sender]) receiveSignal(session, snapshot);
        else if (session.earlySignals.size < 64) session.earlySignals.set(snapshot.key, snapshot);
        else session.inbox.child(snapshot.key).remove().catch(() => {});
    });
    bind(session, database.ref(".info/connected"), "value", (snapshot) => {
        if (meeting !== session) return;
        session.dbConnected = Boolean(snapshot.val());
        if (session.dbConnected) {
            session.memberRef.onDisconnect().remove().catch(() => {});
            session.inbox.onDisconnect().remove().catch(() => {});
        }
        renderNetwork(session);
    });
    const record = { code: session.code, topic: session.topic, at: Date.now() };
    storage("recent", JSON.stringify([record, ...readRecent().filter((item) => item.code !== session.code)].slice(0, 8)));
    updateMediaUI();
    renderNetwork(session);
    byId("room-invite").focus();
}

function exitRoom(message, cleanUp = false) {
    const session = meeting;
    if (!session) return;
    meeting = null;
    if (cleanUp) {
        if (session.host) session.root.remove().catch(() => toast("会议结束请求未能同步。"));
        else {
            session.memberRef.remove().then(() => session.memberRef.onDisconnect().cancel()).catch(() => {});
            session.inbox.remove().then(() => session.inbox.onDisconnect().cancel()).catch(() => {});
        }
    }
    for (const off of session.cleanup) off();
    for (const { peer } of session.peers.values()) peer.close();
    clearInterval(session.timer);
    closeMedia();
    focus = null;
    unread = 0;
    updateUnread();
    byId("room-messages").replaceChildren(node("p", "发送第一条会议消息。"));
    byId("room-messages").firstElementChild.id = "chat-empty";
    byId("room-chat-input").value = "";
    byId("room-tiles").replaceChildren();
    byId("resume-audio").hidden = true;
    showPanel("");
    for (const id of ["devices-dialog", "invite-dialog", "leave-dialog"]) {
        if (byId(id).open) byId(id).close();
    }
    byId("meet-room").hidden = true;
    byId("meet-lobby").hidden = false;
    updateRecent();
    if (mode === "join") byId("meet-code").focus();
    else byId("meet-name").focus();
    toast(message);
}
function showPanel(name) {
    panel = name;
    byId("room-side").hidden = !panel;
    byId("room-workspace").classList.toggle("has-panel", Boolean(panel));
    for (const option of ["people", "chat", "notes"]) {
        byId(`${option}-panel`).hidden = panel !== option;
        byId(`room-${option}`).setAttribute("aria-pressed", String(panel === option));
    }
    if (panel === "people" && meeting) renderMembers(meeting);
    if (panel === "chat") {
        byId("panel-title").textContent = "会议聊天";
        unread = 0;
        updateUnread();
        const messages = byId("room-messages");
        messages.scrollTop = messages.scrollHeight;
    }
    if (panel === "notes") byId("panel-title").textContent = "个人纪要";
}

function updateUnread() {
    const badge = byId("room-chat-unread");
    badge.textContent = unread > 99 ? "99+" : String(unread);
    badge.hidden = unread === 0;
    byId("room-chat").setAttribute("aria-label", unread ? `聊天，${unread} 条未读` : "聊天");
}

function appendChat(session, sender, text) {
    const mine = sender === session.id;
    const list = byId("room-messages");
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 75;
    byId("chat-empty")?.remove();
    const message = node("article", "", mine ? "qm-msg is-mine" : "qm-msg");
    const time = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    message.append(node("header", `${mine ? "我" : memberName(session, sender)} · ${time}`), node("p", text));
    list.append(message);
    if (list.children.length > 200) list.firstElementChild.remove();
    if (nearBottom || mine) list.scrollTop = list.scrollHeight;
    if (!mine && panel !== "chat") {
        unread += 1;
        updateUnread();
    }
}

function openInvite() {
    if (!meeting) return;
    const url = new URL(location.href);
    url.search = "";
    url.hash = formatCode(meeting.code);
    byId("invite-link").value = url.href;
    byId("invite-code").textContent = `会议码 ${formatCode(meeting.code)}`;
    byId("invite-copy").lastChild.textContent = " 复制邀请信息";
    byId("invite-dialog").showModal();
}

async function copyInvite() {
    if (!meeting) return;
    try {
        await navigator.clipboard.writeText(`夸克会议 · ${meeting.topic}\n会议码 ${formatCode(meeting.code)}\n${byId("invite-link").value}`);
        byId("invite-copy").lastChild.textContent = " 已复制";
    } catch {
        byId("invite-link").select();
        byId("invite-copy").lastChild.textContent = " 请手动复制链接";
    }
}

function openDevices() {
    refreshDevices();
    byId("devices-dialog").showModal();
}

function downloadNotes(session) {
    const notes = byId("room-notes-text").value.trim();
    if (!notes) {
        toast("先在纪要中记录内容，再导出。");
        return;
    }
    const file = new Blob([`# ${session.topic}\n\n${new Date(session.state.createdAt).toLocaleString("zh-CN")} · 个人会议纪要\n\n${notes}\n`],
        { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(file);
    const link = node("a");
    link.href = url;
    link.download = `夸克会议-${formatCode(session.code)}.md`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

byId("mode-create").onclick = () => changeMode("create");
byId("mode-join").onclick = () => changeMode("join");
byId("lobby-form").onsubmit = async (event) => {
    event.preventDefault();
    if (busy) return;
    const create = mode === "create";
    const code = create ? makeCode() : parseCode(byId("meet-code").value);
    if (!code) {
        lobbyError("请输入 16 位会议码或有效的邀请链接。");
        return;
    }
    busy = true;
    lobbyError("");
    const button = byId("enter-meet");
    for (const id of ["enter-meet", "mode-create", "mode-join", "meet-name", "meet-topic", "meet-code"]) byId(id).disabled = true;
    button.textContent = create ? "正在发起会议…" : "正在加入会议…";
    const name = cleanText(byId("meet-name").value, 24) || "访客";
    const topic = cleanText(byId("meet-topic").value, 64) || "快速会议";
    try {
        const session = await reserveMeeting({ code, name, topic, create });
        storage("name", name);
        startRoom(session);
    } catch (error) {
        const message = error.code === "PERMISSION_DENIED" ? "会议服务拒绝连接，请稍后再试。"
            : error.message || "无法进入会议，请重试。";
        lobbyError(message);
    } finally {
        busy = false;
        for (const id of ["enter-meet", "mode-create", "mode-join", "meet-name", "meet-topic", "meet-code"]) byId(id).disabled = false;
        button.replaceChildren(create ? "发起会议" : "加入会议", icon("fa-arrow-right"));
    }
};

for (const slot of ["mic", "camera", "share"]) {
    const toggle = () => setMedia(slot, !live(tracks[slot]));
    byId(`room-${slot}`).onclick = toggle;
    const preview = byId(`preview-${slot}`);
    if (preview) preview.onclick = toggle;
}
for (const slot of ["mic", "camera"]) {
    byId(`${slot}-select`).onchange = ({ target }) => {
        deviceIds[slot] = target.value;
        if (live(tracks[slot])) setMedia(slot, true, true);
    };
}
navigator.mediaDevices?.addEventListener("devicechange", refreshDevices);
byId("mirror-camera").onchange = ({ target }) => {
    mirror = target.checked;
    storage("mirror", String(mirror));
    updateMediaUI();
};
byId("room-layout").onclick = () => {
    if (!meeting) return;
    const grid = byId("room-tiles");
    const shared = [...meeting.tiles.keys()].find((key) => key.endsWith(":share"));
    const remote = [...meeting.peers.keys()][0];
    focus = grid.classList.contains("is-focused") ? "grid" : shared || remote || meeting.id;
    renderTiles(meeting);
};
byId("room-invite").onclick = openInvite;
byId("waiting-invite").onclick = () => {
    openInvite();
    copyInvite();
};
byId("invite-copy").onclick = copyInvite;
byId("preview-devices").onclick = openDevices;
byId("room-devices").onclick = openDevices;
for (const option of ["people", "chat", "notes"]) {
    byId(`room-${option}`).onclick = () => showPanel(panel === option ? "" : option);
}
byId("panel-close").onclick = () => {
    const previous = panel;
    showPanel("");
    if (previous) byId(`room-${previous}`).focus();
};
byId("room-hand").onclick = async () => {
    if (!meeting) return;
    const button = byId("room-hand");
    button.disabled = true;
    try {
        await meeting.memberRef.transaction((member) => member ? { ...member, hand: !member.hand } : undefined, undefined, false);
    }
    catch { toast("举手状态同步失败，请重试。"); }
    finally { button.disabled = false; }
};
byId("room-lock").onclick = async () => {
    if (!meeting?.host) return;
    const button = byId("room-lock");
    button.disabled = true;
    const session = meeting;
    try {
        await session.stateRef.transaction((state) => state?.host === session.id ? { ...state, locked: !state.locked } : undefined, undefined, false);
    }
    catch { toast("会议锁定状态同步失败，请重试。"); }
    finally { button.disabled = false; }
};
byId("room-leave").onclick = () => {
    if (meeting?.host) byId("leave-dialog").showModal();
    else exitRoom("已离开会议。", true);
};
byId("confirm-leave").onclick = () => exitRoom("会议已结束。", true);
byId("resume-audio").onclick = async () => {
    if (!meeting) return;
    const active = [...meeting.peers.values()].filter(({ audio }) => audio.srcObject);
    const attempts = await Promise.allSettled(active.map(({ audio }) => audio.play()));
    byId("resume-audio").hidden = attempts.every((attempt) => attempt.status === "fulfilled");
};
byId("room-chat-form").onsubmit = (event) => {
    event.preventDefault();
    if (!meeting) return;
    const input = byId("room-chat-input");
    const text = cleanText(input.value, 800);
    if (!text) return;
    const recipients = [...meeting.peers.values()];
    const sent = recipients.filter(({ peer }) => peer.sendMessage({ type: "chat", text })).length;
    if (recipients.length && !sent) {
        toast("其他成员还在连接中，消息未发送。");
        return;
    }
    if (!recipients.length) {
        toast("等其他成员加入后，就可以发送消息。");
        return;
    }
    if (sent < recipients.length) toast(`消息已发送给 ${sent}/${recipients.length} 位已连接成员。`);
    appendChat(meeting, meeting.id, text);
    input.value = "";
    input.focus();
};
byId("room-notes-text").oninput = ({ target }) => {
    if (meeting) storage(`notes:${meeting.code}`, target.value);
};
byId("notes-stamp").onclick = () => {
    if (!meeting) return;
    const field = byId("room-notes-text");
    const prefix = field.selectionStart && field.value[field.selectionStart - 1] !== "\n" ? "\n" : "";
    const stamp = `${prefix}- [${elapsed(meeting)}] `;
    if (field.value.length - (field.selectionEnd - field.selectionStart) + stamp.length > field.maxLength) return;
    field.setRangeText(stamp, field.selectionStart, field.selectionEnd, "end");
    field.dispatchEvent(new Event("input"));
    field.focus();
};
byId("notes-export").onclick = () => { if (meeting) downloadNotes(meeting); };
window.addEventListener("pagehide", () => {
    if (meeting) exitRoom("已离开会议。", true);
    else closeMedia();
});

function applyInvite() {
    if (busy || meeting) return;
    const code = parseCode(location.hash.slice(1));
    if (code) {
        changeMode("join");
        byId("meet-code").value = formatCode(code);
    }
}
applyInvite();
window.addEventListener("hashchange", applyInvite);
function prefillName() {
    const field = byId("meet-name");
    if (!field.value) field.value = cleanText(storage("name") || window.QuarkUserProfile?.getProfile()?.nickname, 24);
}
prefillName();
window.addEventListener("DOMContentLoaded", prefillName, { once: true });
mirror = storage("mirror") !== "false";
byId("mirror-camera").checked = mirror;
updateRecent();
updateMediaUI();
