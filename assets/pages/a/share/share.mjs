import { Zip, ZipPassThrough } from 'fflate';
import qrcode from 'qrcode-generator';
import { quotaHeaders, quotaLoginUrl } from '../../../js/quota-session.mjs';
import { bytes, makeLink, MAX_FILES, MAX_OFFLINE, MAX_RECEIVE, parseInvite, PathIndex, previewType, safePath } from './share-model.mjs';
import { offlineSize, openDrop, sealDrop } from './share-offline.mjs';
import { describeConnection, LiveRoom } from './share-live.mjs';
import { LiveTransfer } from './share-transfer.mjs';

const HISTORY = 'quark_share_history_v2';
const DROP_HISTORY = 'quark_share_created_drops';
const MAX_SAVED = 12;
const labels = {
    idle: '等待操作', waiting: '等待另一台设备', online: '设备已连接',
    working: '传输中', done: '已完成', error: '需要处理'
};

function readHistory() {
    try {
        const value = JSON.parse(localStorage.getItem(HISTORY));
        return Array.isArray(value) ? value.filter((row) => row && typeof row.kind === 'string'
            && Number.isFinite(row.date) && Number.isFinite(row.size) && Number.isFinite(row.count)).slice(0, MAX_SAVED) : [];
    } catch { return []; }
}

function readDropHistory() {
    try {
        const value = JSON.parse(localStorage.getItem(DROP_HISTORY));
        return Array.isArray(value) ? value.filter((row) => row && /^[a-f0-9]{32}$/.test(row.id)
            && /^[a-f0-9]{64}$/.test(row.account) && /^\d{4}-\d{2}-\d{2}$/.test(row.day)
            && Number.isFinite(row.expiresAt) && row.expiresAt > Date.now()) : [];
    } catch { return []; }
}

function accountScope(headers = quotaHeaders()) {
    try {
        const body = headers.Authorization.slice(7).split('.')[0].replaceAll('-', '+').replaceAll('_', '/');
        const subject = JSON.parse(atob(body)).sub;
        // Display hint only. The API verifies the signed session on every write.
        return /^[a-f0-9]{64}$/.test(subject) ? subject : '';
    } catch { return ''; }
}

function actionButton(text, onclick, description = text) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'share-btn share-btn-small';
    button.textContent = text;
    button.setAttribute('aria-label', description);
    button.addEventListener('click', onclick);
    return button;
}

function fileRow(path, size, buttons = []) {
    const row = document.createElement('li');
    row.className = 'share-file-row';
    const text = document.createElement('div');
    const name = document.createElement('strong');
    const sizeNode = document.createElement('small');
    name.textContent = path;
    sizeNode.textContent = bytes(size);
    text.append(name, sizeNode);
    row.append(text);
    if (buttons.length) {
        const actions = document.createElement('div');
        actions.className = 'share-actions';
        actions.append(...buttons);
        row.append(actions);
    }
    return row;
}

function drawQr(canvas, value) {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const modules = qr.getModuleCount();
    const scale = Math.max(3, Math.floor(280 / (modules + 8)));
    const offset = scale * 4;
    canvas.width = canvas.height = scale * (modules + 8);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#151b2a';
    for (let row = 0; row < modules; row++) {
        for (let col = 0; col < modules; col++) {
            if (qr.isDark(row, col)) ctx.fillRect(offset + col * scale, offset + row * scale, scale, scale);
        }
    }
}

function download(blob, path) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = path.split('/').at(-1);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

async function bundleZip(files, progress) {
    const chunks = [];
    let zip;
    const done = new Promise((resolve, reject) => {
        zip = new Zip((error, data, final) => {
            if (error) reject(error);
            else {
                chunks.push(data);
                if (final) resolve(new Blob(chunks, { type: 'application/zip' }));
            }
        });
    });
    const used = new PathIndex();
    for (const [index, { path, blob }] of files.entries()) {
        const stream = new ZipPassThrough(used.add(path));
        zip.add(stream);
        const reader = blob.stream().getReader();
        try {
            while (true) {
                const { done: eof, value } = await reader.read();
                if (eof) break;
                stream.push(value);
            }
        } finally { reader.releaseLock(); }
        stream.push(new Uint8Array(), true);
        progress(index + 1, files.length);
    }
    zip.end();
    return done;
}

async function droppedEntries(dataTransfer, limit) {
    const entries = [...dataTransfer.items].map((item) => item.webkitGetAsEntry?.()).filter(Boolean);
    if (!entries.length) return [...dataTransfer.files].slice(0, limit + 1).map((blob) => ({ blob, path: blob.name }));
    const files = [];
    let walked = 0;
    async function visit(entry, base = '', depth = 0) {
        if (files.length > limit || walked++ > 3000 || depth > 24) return;
        if (entry.isFile) {
            const blob = await new Promise((resolve, reject) => entry.file(resolve, reject));
            files.push({ blob, path: base + blob.name });
        }
        if (entry.isDirectory) {
            const reader = entry.createReader();
            while (files.length <= limit && walked <= 3000) {
                const children = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
                if (!children.length) break;
                for (const child of children) await visit(child, `${base}${entry.name}/`, depth + 1);
            }
        }
    }
    for (const entry of entries) await visit(entry);
    return files;
}

function upload(url, blob, signal, progress) {
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open('PUT', url);
        request.timeout = 15 * 60_000;
        request.setRequestHeader('Content-Type', 'application/octet-stream');
        request.setRequestHeader('Cache-Control', 'private, no-store');
        request.setRequestHeader('If-None-Match', '*');
        const abort = () => request.abort();
        const done = (error) => {
            signal.removeEventListener('abort', abort);
            if (error) reject(error);
            else resolve();
        };
        request.upload.onprogress = (event) => progress(event.loaded);
        request.onload = () => request.status >= 200 && request.status < 300
            ? done() : done(new Error(`存储服务未接受上传（HTTP ${request.status}）。`));
        request.onerror = () => done(new Error('无法上传离线包。请检查网络或存储跨域配置。'));
        request.ontimeout = () => done(new Error('上传超时，请重试。'));
        request.onabort = () => done(signal.reason || new Error('上传已取消。'));
        signal.addEventListener('abort', abort, { once: true });
        request.send(blob);
    });
}

async function downloadDrop(url, size, signal, progress) {
    const response = await fetch(url, { signal, referrerPolicy: 'no-referrer', cache: 'no-store' });
    if (!response.ok || !response.body) throw new Error('无法下载离线包。请检查网络，或重新打开完整链接。');
    const reader = response.body.getReader();
    const output = new Uint8Array(size);
    let written = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (written + value.length > size) {
                await reader.cancel();
                throw new Error('下载内容大小异常。');
            }
            output.set(value, written);
            written += value.length;
            progress(written);
        }
    } finally { reader.releaseLock(); }
    if (written !== size) throw new Error('离线包下载不完整。');
    return output.buffer;
}

export function mountShare() {
    const el = (id) => document.getElementById(id);
    const page = document.querySelector('.share-page');
    const modes = [...page.querySelectorAll('[data-mode]')];
    let mode = 'send';
    let role = 'send';
    let queue = [];
    let received = [];
    let activeRoom = null;
    let transfer = null;
    let offlineJob = null;
    let offlineEnabled = null;
    let offlineLimit = MAX_OFFLINE;
    let offlineInline = false;
    let invitation = null;
    let previewUrl = null;
    let history = readHistory();
    let dropHistory = readDropHistory();
    let dropHistoryTimer = null;
    let flow = '';
    let legacy = false;
    let lastProgress = 0;
    let remainingBytes = 0;
    let dropCheck = null;

    async function api(action, body = {}, { signal, keepalive = false, auth = false, accountHeaders } = {}) {
        let response;
        try {
            response = await fetch(page.dataset.apiBase + '/api/share', {
                method: 'POST', cache: 'no-store', credentials: 'omit', signal, keepalive,
                headers: { 'Content-Type': 'application/json', ...(accountHeaders || (auth ? quotaHeaders() : {})) },
                body: JSON.stringify({ ...body, action })
            });
        } catch (error) {
            if (signal?.aborted) throw error;
            throw new Error('无法连接闪传服务，请检查网络后重试。');
        }
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload) {
            const error = new Error(payload?.error || '闪传服务暂不可用。');
            error.status = response.status;
            throw error;
        }
        return payload;
    }

    function status(state, detail) {
        el('connection-state').dataset.state = state;
        el('connection-title').textContent = labels[state];
        el('connection-detail').textContent = detail;
    }

    function message(text = '', error = false) {
        const box = el('work-message');
        box.hidden = !text;
        box.textContent = text;
        box.dataset.error = error;
    }

    function renderHistory() {
        el('history-empty').hidden = history.length > 0;
        el('clear-history').hidden = history.length === 0;
        el('transfer-history').replaceChildren(...history.map(({ date, kind, count, size }) => {
            const row = document.createElement('li');
            const title = document.createElement('strong');
            const time = document.createElement('time');
            title.textContent = `${kind} · ${count} 个文件 · ${bytes(size)}`;
            time.dateTime = new Date(date).toISOString();
            time.textContent = new Date(date).toLocaleString('zh-CN', { hour12: false });
            row.append(title, time);
            return row;
        }));
    }

    function saveHistory(kind, count, size) {
        history = [{ kind, count, size, date: Date.now() }, ...history].slice(0, MAX_SAVED);
        try { localStorage.setItem(HISTORY, JSON.stringify(history)); } catch {}
        renderHistory();
    }

    function renderDropHistory() {
        clearTimeout(dropHistoryTimer);
        dropHistory = dropHistory.filter(({ expiresAt }) => expiresAt > Date.now());
        const account = accountScope();
        const active = dropHistory.filter((row) => row.account === account);
        el('drop-history').hidden = active.length === 0;
        el('active-drops').replaceChildren(...active.map((record) => {
            const row = document.createElement('li');
            const time = document.createElement('time');
            const expiry = new Date(record.expiresAt);
            time.dateTime = expiry.toISOString();
            time.textContent = `有效至 ${expiry.toLocaleString('zh-CN', { hour12: false })}`;
            const button = actionButton('撤回', () => void revokeDrop(record, button), `撤回有效至 ${time.textContent.slice(4)} 的离线包`);
            row.append(time, button);
            return row;
        }));
        if (dropHistory.length) {
            const expiresAt = Math.min(...dropHistory.map((row) => row.expiresAt));
            dropHistoryTimer = setTimeout(persistDropHistory, Math.max(20, expiresAt - Date.now()));
        }
    }

    function persistDropHistory() {
        renderDropHistory();
        try { localStorage.setItem(DROP_HISTORY, JSON.stringify(dropHistory)); } catch {}
    }

    async function revokeDrop(record, button) {
        if (button.disabled) return;
        button.disabled = true;
        try {
            await api('drop-revoke', { day: record.day, id: record.id }, { auth: true });
            if (invitation?.id === record.id) renderInvitation(null);
            dropHistory = dropHistory.filter(({ id }) => id !== record.id);
            persistDropHistory();
            message('已撤回离线包。');
        } catch (error) {
            message(error.status === 403 ? '请切换到创建此离线包的账号后重试。' : error.message, true);
        }
        finally { button.disabled = false; }
    }

    function showProgress(done, total, path, start, force = false) {
        const now = performance.now();
        if (done !== total && now - lastProgress < 100 && !force) return;
        lastProgress = now;
        const ratio = total ? Math.min(1, done / total) : 1;
        const duration = (now - start) / 1000;
        const speed = duration > .25 && done > 0 ? done / duration : 0;
        const remaining = speed > 0 ? Math.ceil((total - done) / speed) : 0;
        el('progress-panel').hidden = false;
        el('progress-file').textContent = path;
        el('progress-pct').textContent = `${Math.floor(ratio * 100)}%`;
        el('progress-bytes').textContent = `${bytes(done)} / ${bytes(total)}`;
        el('progress-speed').textContent = speed ? `${bytes(Math.round(speed))}/s` : '';
        el('progress-eta').textContent = remaining > 0
            ? remaining < 60 ? `约 ${remaining} 秒` : `约 ${Math.ceil(remaining / 60)} 分钟` : '';
        el('transfer-progress').value = ratio * 100;
    }

    function renderInvitation(value) {
        invitation = value;
        el('invite-panel').hidden = !value;
        el('manual-invite').hidden = true;
        el('manual-invite').value = '';
        if (!value) {
            el('invite-code').textContent = '';
            el('invite-qr').width = el('invite-qr').width;
            return;
        }
        const { link, code, expiresAt, offline } = value;
        el('invite-label').textContent = offline ? '离线包取件链接' : '设备连接码';
        el('invite-code').hidden = !code;
        el('invite-code').textContent = code ? code.replace(/(.{4})(.{4})/, '$1-$2') : '';
        el('invite-expiry').textContent = `有效至 ${new Date(expiresAt).toLocaleString('zh-CN', { hour12: false })}`;
        el('copy-code').hidden = !code;
        el('native-share').hidden = typeof navigator.share !== 'function';
        el('revoke-drop').hidden = !offline;
        try {
            drawQr(el('invite-qr'), link);
            el('invite-qr').hidden = false;
        } catch { el('invite-qr').hidden = true; }
    }

    async function copyText(text, kind) {
        try {
            await navigator.clipboard.writeText(text);
            message(`已复制${kind}。`);
        } catch {
            const manual = el('manual-invite');
            if (kind === '链接' || kind === '连接码') {
                manual.value = text;
                manual.hidden = false;
                manual.select();
            }
            message('浏览器未授予剪贴板权限，请手动复制。', true);
        }
    }

    function queueSize() {
        return queue.reduce((sum, file) => sum + file.size, 0);
    }

    function render() {
        const busy = Boolean(flow);
        const room = Boolean(activeRoom);
        const canEdit = !offlineJob && !transfer?.outgoing;
        const sendHere = role === 'send' && room;
        const compose = !room ? mode !== 'receive' : sendHere;
        const canSend = queue.length > 0 || Boolean(el('send-note').value.trim());
        const offline = !room && mode === 'offline';
        const offlineRead = flow === 'offline-read';
        modes.forEach((button) => {
            button.disabled = busy || room;
            button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
        });
        el('join-panel').hidden = mode !== 'receive' || room || offlineRead;
        el('file-panel').hidden = !compose || offlineRead;
        el('offline-options').hidden = !offline;
        el('leave-room').hidden = !room;
        el('work-actions').hidden = (!compose || offlineRead) && !offlineJob && !transfer?.incoming && !transfer?.outgoing;
        el('primary-action').hidden = !compose || offlineRead;
        el('primary-action').textContent = offline ? '加密并创建取件链接' : room ? '发送内容' : '生成连接码';
        el('primary-action').disabled = busy || (room && !transfer?.available) || !canSend
            || (offline && (offlineEnabled !== true || !accountScope()));
        el('cancel-job').hidden = !offlineJob && !transfer?.incoming && !transfer?.outgoing;
        el('add-files').disabled = !canEdit;
        el('add-folder').disabled = !canEdit;
        el('clear-files').disabled = !canEdit;
        el('send-note').disabled = !canEdit;
        el('expire-hours').disabled = Boolean(offlineJob);
        el('create-collect').disabled = busy;
        el('join-form').querySelector('button').disabled = busy;
        const titles = offlineRead ? ['取件', '离线包正在浏览器内下载并解密。']
            : room ? role === 'send' ? ['准备发送', '对方确认文件清单后，浏览器才会开始发送。']
                : ['接收文件', legacy ? '旧版设备连接成功后即可直接发送文件。' : '确认对方的发送请求后再接收。']
            : mode === 'receive' ? ['取件与收集', '打开对方分享的链接，或创建一个收集邀请。']
            : offline ? ['创建离线包', offlineEnabled
                ? `文件名、内容和附言一起加密。单包最多 ${bytes(offlineLimit)}。`
                : '文件名、内容和附言一起加密。']
            : ['准备文件', '选好内容后，生成连接码交给接收方。'];
        el('work-title').textContent = titles[0];
        el('work-subtitle').textContent = titles[1];
    }

    function renderQueue() {
        el('queue-count').textContent = queue.length ? `${queue.length} 个文件 · ${bytes(queueSize())}` : '还没有选文件';
        el('clear-files').hidden = !queue.length;
        el('send-queue').replaceChildren(...queue.map(({ path, size }, index) => fileRow(path, size, [
            actionButton('移除', () => {
                if (offlineJob || transfer?.outgoing) return;
                queue.splice(index, 1);
                renderQueue();
            }, `移除 ${path}`)
        ])));
        render();
    }

    function addFiles(items) {
        if (offlineJob || transfer?.outgoing || el('file-panel').hidden) return;
        let omitted = 0;
        const used = new PathIndex();
        queue.forEach(({ path }) => used.add(path));
        let total = queueSize();
        for (const { blob, path } of items) {
            const clean = safePath(path);
            if (!clean || queue.length >= MAX_FILES || total + blob.size > MAX_RECEIVE) { omitted += 1; continue; }
            const unique = used.add(clean);
            if (unique.length > 640) { omitted += 1; continue; }
            queue.push({ path: unique, size: blob.size, blob });
            total += blob.size;
        }
        message(omitted ? `${omitted} 项未加入。每批最多 ${MAX_FILES} 个文件，合计 ${bytes(MAX_RECEIVE)}。` : '', Boolean(omitted));
        renderQueue();
    }

    async function preview(file) {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        const type = previewType(file.path);
        if (!type) return;
        el('preview-title').textContent = file.path;
        const host = el('preview-content');
        host.replaceChildren();
        if (type === 'text/plain') {
            const pre = document.createElement('pre');
            const cap = 64 * 1024;
            pre.textContent = await file.blob.slice(0, cap).text() + (file.blob.size > cap ? '\n… 仅显示前 64 KiB' : '');
            host.append(pre);
        } else {
            const tag = type.startsWith('image/') ? 'img' : type.split('/')[0];
            const media = document.createElement(tag);
            previewUrl = URL.createObjectURL(file.blob.slice(0, file.blob.size, type));
            media.src = previewUrl;
            if (tag === 'img') media.alt = file.path;
            else media.controls = true;
            host.append(media);
        }
        const dialog = el('file-preview');
        if (!dialog.open) dialog.showModal();
    }

    function pushReceived(file) {
        received.push(file);
        remainingBytes += file.size;
        const actions = [];
        if (previewType(file.path)) actions.push(actionButton('预览', () => void preview(file), `预览 ${file.path}`));
        actions.push(actionButton('下载', () => download(file.blob, file.path), `下载 ${file.path}`));
        el('received-files').append(fileRow(file.path, file.size, actions));
        el('received-panel').hidden = false;
        el('download-zip').hidden = received.length < 2 && !file.path.includes('/');
    }

    function showReceived(note) {
        el('received-panel').hidden = false;
        el('received-note').hidden = !note;
        el('received-note-value').textContent = note;
    }

    function resetReceived() {
        received = [];
        remainingBytes = 0;
        el('received-files').replaceChildren();
        el('received-note-value').textContent = '';
        el('received-note').hidden = true;
        el('received-panel').hidden = true;
    }

    function showIncoming(value) {
        el('incoming-panel').hidden = !value;
        if (value) {
            const { files, total, noteLength } = value;
            el('incoming-detail').textContent = `${files.length} 个文件 · ${bytes(total)}${noteLength ? ' · 含附言' : ''}`;
            el('incoming-list').replaceChildren(...files.map(({ path, size }) => fileRow(path, size)));
            status('waiting', '对方已提供文件清单。确认接收后开始传输。');
            el('accept-transfer').focus();
        } else el('incoming-list').replaceChildren();
    }

    function refreshStatus() {
        if (!activeRoom) return;
        if (activeRoom.connected) void describeConnection(activeRoom.pc).then((detail) => {
            if (activeRoom?.connected && !flow) status('online', detail);
        });
    }

    function complete(kind, count, total, note = '') {
        flow = '';
        if (kind === '已接收' || kind === '离线取件') showReceived(note);
        status('done', `${kind} · ${count} 个文件 · ${bytes(total)}`);
        saveHistory(kind, count, total);
        render();
    }

    function endRoom(detail = '已退出设备连接。', failed = false) {
        transfer?.disconnected(detail);
        activeRoom?.close();
        activeRoom = transfer = null;
        flow = '';
        role = mode === 'send' ? 'send' : 'receive';
        legacy = false;
        if (!invitation?.offline) renderInvitation(null);
        showIncoming(null);
        if (failed) status('error', detail);
        else status('idle', detail);
        render();
    }

    function transferEvents(room) {
        return {
            ready() { refreshStatus(); render(); },
            waiting() { flow = 'waiting'; status('waiting', '已将文件清单发给对方，等待确认。'); render(); },
            request(value) { showIncoming(value); },
            sending(total) {
                flow = 'live';
                status('working', '正在发送文件和附言。');
                showProgress(0, total, '开始发送', performance.now(), true);
                render();
            },
            receiving(total) {
                flow = 'live';
                resetReceived();
                status('working', '正在接收文件。');
                showProgress(0, total, '开始接收', performance.now(), true);
                render();
            },
            progress: showProgress,
            file: pushReceived,
            received(note, count, total) { complete('已接收', count, total, note); },
            sent(count, total) { complete('对方已接收', count, total); },
            cancelled(detail) {
                flow = '';
                message(detail);
                refreshStatus();
                render();
            },
            invalid(detail) {
                message(detail, true);
                if (room.legacy) endRoom(detail, true);
            }
        };
    }

    async function connect(intent, code = '') {
        if (activeRoom || flow) return;
        renderInvitation(null);
        message();
        el('progress-panel').hidden = true;
        if (!window.RTCPeerConnection) { message('此浏览器不支持 WebRTC。可以尝试离线包。', true); return; }
        role = intent === 'send' ? 'send' : 'receive';
        flow = 'connect';
        const room = new LiveRoom(api, {
            invite(invite) {
                renderInvitation({ ...invite, link: makeLink({ room: invite.code }) });
                status('waiting', '把连接码或链接发给对方，请保持当前页面打开。');
            },
            role(next, old) { role = next; legacy = old; render(); },
            connected(channel, pc, old) {
                flow = '';
                renderInvitation(null);
                status('online', '加密通道已就绪。');
                transfer = new LiveTransfer(channel, { legacy: old, role, maxMessageSize: pc.sctp?.maxMessageSize, events: transferEvents(room) });
                transfer.hello();
                refreshStatus();
                render();
            },
            message(data) { transfer?.message(data); },
            reconnecting() { status('waiting', '网络波动，正在尝试恢复连接。'); },
            reconnected() { refreshStatus(); },
            failed(detail) { if (activeRoom === room) endRoom(detail, true); }
        });
        activeRoom = room;
        status('waiting', intent === 'join' ? '正在加入对方设备。' : '正在创建邀请。');
        render();
        try {
            if (intent === 'join') await room.join(code);
            else await room.host(intent);
        } catch (error) {
            if (activeRoom === room) endRoom(error.message || '设备连接失败。', true);
        }
    }

    async function checkOffline() {
        if (dropCheck) return dropCheck;
        el('offline-login').href = quotaLoginUrl();
        el('offline-login').hidden = Boolean(accountScope());
        el('offline-status').textContent = '正在检查离线包服务…';
        dropCheck = api('status').then(({ offline, maxBytes, inline }) => {
            offlineEnabled = offline === true && Boolean(crypto.subtle);
            offlineLimit = maxBytes || MAX_OFFLINE;
            offlineInline = inline === true;
            el('offline-status').textContent = !offlineEnabled
                ? '离线包暂不可用。你仍可使用在线直传。'
                : accountScope() ? '此功能每天最多创建 10 个包。取件方无需登录。'
                : '发送前请登录并验证账号。取件方无需登录。';
        }).catch((error) => {
            offlineEnabled = false;
            el('offline-status').textContent = error.message;
        }).finally(() => { dropCheck = null; render(); });
        return dropCheck;
    }

    async function createOffline() {
        if (flow) return;
        const note = el('send-note').value;
        const accountHeaders = quotaHeaders();
        const account = accountScope(accountHeaders);
        if (!account) { message('请登录并验证账号后创建离线包。', true); return; }
        if (offlineSize(queue, note) > offlineLimit) { message(`加密后离线包超过 ${bytes(offlineLimit)}。请减少文件或使用在线直传。`, true); return; }
        const job = new AbortController();
        offlineJob = job;
        flow = 'offline-create';
        renderInvitation(null);
        message();
        status('working', '正在浏览器内加密文件。');
        render();
        let record;
        try {
            const { key, blob } = await sealDrop(queue, note);
            job.signal.throwIfAborted();
            status('working', '正在上传加密后的离线包。');
            const start = performance.now();
            showProgress(0, blob.size, '上传密文', start, true);
            const payload = { size: blob.size, hours: Number(el('expire-hours').value) };
            if (offlineInline) {
                const data = new Uint8Array(await blob.arrayBuffer());
                let raw = '';
                for (let offset = 0; offset < data.length; offset += 8192) {
                    raw += String.fromCharCode(...data.subarray(offset, offset + 8192));
                }
                payload.ciphertext = btoa(raw);
            }
            job.signal.throwIfAborted();
            const created = await api('drop-create', payload, { accountHeaders });
            const { day, id, uploadUrl } = created;
            record = { day, id };
            job.signal.throwIfAborted();
            let { expiresAt } = created;
            if (uploadUrl) {
                await upload(uploadUrl, blob, job.signal, (count) => showProgress(count, blob.size, '上传密文', start));
                ({ expiresAt } = await api('drop-finish', record, { signal: job.signal, accountHeaders }));
            }
            const link = makeLink({ day, drop: id, key });
            renderInvitation({ day, id, expiresAt, offline: true, link });
            dropHistory = [{ day, id, expiresAt, account }, ...dropHistory.filter((row) => row.id !== id)].slice(0, 100);
            persistDropHistory();
            showProgress(blob.size, blob.size, '加密包已上传', start, true);
            status('done', '离线包已生成，可以复制链接或让对方扫码。');
            saveHistory('已创建离线包', queue.length, queueSize());
        } catch (error) {
            if (record) void api('drop-revoke', record, { accountHeaders }).catch(() => {});
            const detail = job.signal.aborted ? '已取消创建离线包。' : error.message || '创建离线包失败。';
            status(job.signal.aborted ? 'idle' : 'error', detail);
            message(detail, !job.signal.aborted);
            if (error.status === 401) el('offline-login').hidden = false;
        } finally {
            if (offlineJob === job) offlineJob = null;
            flow = '';
            render();
        }
    }

    async function readOffline({ day, id, key }) {
        if (flow || activeRoom) return;
        const job = new AbortController();
        mode = 'receive';
        offlineJob = job;
        flow = 'offline-read';
        renderInvitation(null);
        message();
        status('working', '正在查询离线包。');
        render();
        try {
            if (!crypto.subtle) throw new Error('请使用 HTTPS 和支持 Web Crypto 的浏览器打开取件链接。');
            const { downloadUrl, ciphertext, size } = await api('drop-read', { day, id }, { signal: job.signal });
            if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_OFFLINE) throw new Error('离线包大小超出限制。');
            const start = performance.now();
            showProgress(0, size, '下载密文', start, true);
            const buffer = typeof ciphertext === 'string'
                ? Uint8Array.from(atob(ciphertext), (char) => char.charCodeAt(0)).buffer
                : await downloadDrop(downloadUrl, size, job.signal, (count) => showProgress(count, size, '下载密文', start));
            if (buffer.byteLength !== size) throw new Error('离线包大小与登记信息不符。');
            status('working', '正在浏览器内解密。');
            const { files, note } = await openDrop(buffer, key);
            job.signal.throwIfAborted();
            resetReceived();
            files.forEach(pushReceived);
            complete('离线取件', files.length, remainingBytes, note);
        } catch (error) {
            const detail = job.signal.aborted ? '已取消取件。' : error.message || '取件失败。';
            status(job.signal.aborted ? 'idle' : 'error', detail);
            message(detail, !job.signal.aborted);
        } finally {
            if (offlineJob === job) offlineJob = null;
            flow = '';
            render();
        }
    }

    function selectMode(value) {
        if (activeRoom || flow) return;
        mode = value;
        role = mode === 'send' ? 'send' : 'receive';
        message();
        if (mode === 'offline') void checkOffline();
        render();
    }

    function handleInvite(raw) {
        const value = parseInvite(raw);
        if (!value) { message('请输入有效的连接码或完整取件链接。', true); return; }
        if (value.room) void connect('join', value.room);
        else void readOffline(value);
    }

    modes.forEach((button) => button.addEventListener('click', () => selectMode(button.dataset.mode)));
    el('join-form').addEventListener('submit', (event) => {
        event.preventDefault();
        handleInvite(el('join-value').value);
    });
    el('create-collect').onclick = () => void connect('collect');
    el('leave-room').onclick = () => endRoom();
    el('primary-action').onclick = () => {
        if (mode === 'offline') { void createOffline(); return; }
        if (!activeRoom) { void connect('send'); return; }
        try { transfer?.request(queue, el('send-note').value); message(); }
        catch (error) { message(error.message, true); }
    };
    el('cancel-job').onclick = () => {
        if (offlineJob) offlineJob.abort();
        else transfer?.cancel();
    };
    el('accept-transfer').onclick = () => transfer?.accept();
    el('decline-transfer').onclick = () => { transfer?.decline(); refreshStatus(); };
    el('copy-invite').onclick = () => invitation && void copyText(invitation.link, '链接');
    el('copy-code').onclick = () => invitation?.code && void copyText(invitation.code, '连接码');
    el('copy-note').onclick = () => void copyText(el('received-note-value').textContent, '附言');
    el('native-share').onclick = () => invitation && void navigator.share({ title: '夸克闪传', url: invitation.link }).catch(() => {});
    el('revoke-drop').onclick = async () => {
        if (invitation?.offline) await revokeDrop(invitation, el('revoke-drop'));
    };
    el('clear-history').onclick = () => {
        history = [];
        try { localStorage.removeItem(HISTORY); } catch {}
        renderHistory();
    };
    el('download-zip').onclick = async () => {
        if (!received.length) return;
        const button = el('download-zip');
        button.disabled = true;
        try {
            const blob = await bundleZip([...received], (count, total) => { button.textContent = `打包 ${count}/${total}`; });
            download(blob, 'QuarkShare.zip');
        } catch (error) { message(error.message || 'ZIP 打包失败。', true); }
        finally { button.disabled = false; button.textContent = '打包下载 ZIP'; }
    };
    el('file-preview').addEventListener('close', () => {
        el('preview-content').replaceChildren();
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = null;
    });
    el('clear-files').onclick = () => { queue = []; renderQueue(); };
    el('send-note').addEventListener('input', render);
    el('add-files').onclick = () => el('pick-files').click();
    el('add-folder').onclick = () => el('pick-folder').click();
    if (!('webkitdirectory' in el('pick-folder'))) el('add-folder').hidden = true;
    for (const id of ['pick-files', 'pick-folder']) {
        const picker = el(id);
        picker.addEventListener('change', () => {
            addFiles([...picker.files].map((blob) => ({ blob, path: blob.webkitRelativePath || blob.name })));
            picker.value = '';
        });
    }

    const drop = el('drop-zone');
    drop.addEventListener('dragover', (event) => {
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        drop.dataset.over = 'true';
    });
    drop.addEventListener('dragleave', (event) => {
        if (!drop.contains(event.relatedTarget)) delete drop.dataset.over;
    });
    drop.addEventListener('drop', async (event) => {
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        delete drop.dataset.over;
        try { addFiles(await droppedEntries(event.dataTransfer, MAX_FILES - queue.length)); }
        catch { message('无法读取拖入的文件夹。请尝试使用“选文件夹”。', true); }
    });
    page.addEventListener('paste', (event) => {
        if (el('file-panel').hidden || event.target.matches('input, textarea') || !event.clipboardData?.files.length) return;
        event.preventDefault();
        addFiles([...event.clipboardData.files].map((blob) => ({ blob, path: blob.name || 'clipboard.png' })));
    });
    window.addEventListener('pagehide', (event) => { if (!event.persisted) activeRoom?.close(); });
    renderQueue();
    renderHistory();
    persistDropHistory();
    window.addEventListener('storage', (event) => {
        if (event.key === DROP_HISTORY) { dropHistory = readDropHistory(); renderDropHistory(); }
        if (event.key === 'quark_quota_session') { renderDropHistory(); if (mode === 'offline') void checkOffline(); }
    });

    function syncLocation() {
        if (!location.hash || activeRoom || flow) return;
        const value = parseInvite(location.href);
        if (value) {
            mode = 'receive';
            el('join-value').value = value.room || location.href;
            render();
            if (value.id) void readOffline(value);
        }
    }
    window.addEventListener('hashchange', syncLocation);
    syncLocation();
}
