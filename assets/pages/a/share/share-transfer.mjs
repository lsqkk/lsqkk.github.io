import { bytes, CHUNK, manifestItems, MAX_FILES, MAX_NOTE, MAX_RECEIVE, safePath } from './share-model.mjs';

const WINDOW = 1024 * 1024;
const LOW_WATER = WINDOW / 4;
const WAIT = 30_000;
const MAX_CONTROL = 16 * 1024;
const encoder = new TextEncoder();

function newId() {
    return Array.from(crypto.getRandomValues(new Uint8Array(8)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function idMatches(id) {
    return typeof id === 'string' && /^[a-f0-9]{16}$/.test(id);
}

function waitForBuffer(channel, signal, threshold = WINDOW) {
    signal.throwIfAborted();
    if (channel.readyState !== 'open') throw new Error('设备连接已关闭。');
    if (channel.bufferedAmount < threshold) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const done = (error) => {
            channel.removeEventListener('bufferedamountlow', ready);
            channel.removeEventListener('close', closed);
            signal.removeEventListener('abort', aborted);
            clearTimeout(timer);
            if (error) reject(error);
            else resolve();
        };
        const ready = () => done();
        const closed = () => done(new Error('设备连接已关闭。'));
        const aborted = () => done(signal.reason);
        const timer = setTimeout(() => done(new Error('通道长时间没有响应，传输已停止。')), WAIT);
        channel.addEventListener('bufferedamountlow', ready, { once: true });
        channel.addEventListener('close', closed, { once: true });
        signal.addEventListener('abort', aborted, { once: true });
        if (channel.bufferedAmount <= channel.bufferedAmountLowThreshold) ready();
    });
}

export class LiveTransfer {
    constructor(channel, { legacy, role, maxMessageSize = 65536, events }) {
        this.channel = channel;
        this.channel.bufferedAmountLowThreshold = LOW_WATER;
        this.events = events;
        this.legacy = legacy;
        this.role = role;
        this.chunkSize = Math.max(1, Math.min(CHUNK, maxMessageSize || CHUNK));
        this.maxControl = Math.min(this.chunkSize, MAX_CONTROL);
        this.available = false;
        this.outgoing = null;
        this.incoming = null;
        this.pending = null;
    }

    control(value) {
        if (this.channel.readyState !== 'open') return;
        const wire = JSON.stringify(value);
        if (encoder.encode(wire).byteLength > this.maxControl) throw new Error('文件清单条目超过对方设备的单条消息上限。');
        this.channel.send(wire);
    }

    hello() {
        if (!this.legacy) this.control({ type: 'hello', version: 2 });
    }

    request(files, note) {
        if (!this.available || this.outgoing) throw new Error('正在等待对方设备就绪。');
        if (!files.length && !note.trim()) throw new Error('请添加文件或附言。');
        const { items, total } = manifestItems(files);
        const job = { id: newId(), files, note, total, abort: new AbortController(), stage: 'request' };
        job.timer = setTimeout(() => {
            if (this.outgoing !== job) return;
            this.cancel('对方尚未确认接收，请重新发送。');
        }, 90_000);
        this.outgoing = job;
        try {
            this.control({ type: 'offer', id: job.id, count: items.length, noteLength: note.length });
            for (let offset = 0; offset < items.length; offset += 5) {
                this.control({ type: 'offer-files', id: job.id, files: items.slice(offset, offset + 5) });
            }
            this.control({ type: 'offer-complete', id: job.id });
        } catch (error) {
            this.cancel(error.message);
            throw error;
        }
        this.events.waiting();
    }

    accept() {
        if (!this.pending) return;
        this.incoming = { ...this.pending, index: 0, done: 0, note: '', noteReceived: false, chunks: [], part: 0, started: performance.now() };
        this.pending = null;
        this.events.request(null);
        this.events.receiving(this.incoming.total);
        this.control({ type: 'accept', id: this.incoming.id });
    }

    decline() {
        if (!this.pending) return;
        this.control({ type: 'decline', id: this.pending.id });
        this.pending = null;
        this.events.request(null);
    }

    async send(job) {
        job.stage = 'sending';
        const signal = job.abort.signal;
        const started = performance.now();
        const channel = this.channel;
        let sent = 0;
        this.events.sending(job.total);
        try {
            this.control({ type: 'note', id: job.id, note: job.note });
            for (const { blob, path } of job.files) {
                let offset = 0;
                while (offset < blob.size) {
                    await waitForBuffer(channel, signal);
                    const data = await blob.slice(offset, offset + this.chunkSize).arrayBuffer();
                    signal.throwIfAborted();
                    channel.send(data);
                    sent += data.byteLength;
                    offset += data.byteLength;
                    this.events.progress(sent, job.total, path, started);
                }
                this.control({ type: 'end-file', id: job.id });
            }
            this.control({ type: 'end-transfer', id: job.id });
            this.events.progress(job.total, job.total, '等待接收回执', started, true);
            job.stage = 'receipt';
            job.timer = setTimeout(() => {
                if (this.outgoing !== job) return;
                this.cancel('未收到接收回执。请向对方确认文件是否完整。');
            }, WAIT);
        } catch (error) {
            if (this.outgoing === job) this.cancel(error.message || '发送失败。');
        }
    }

    cancel(reason = '已取消本次传输。', notify = true) {
        const outgoing = this.outgoing;
        const incoming = this.incoming || this.pending;
        this.outgoing = this.incoming = this.pending = null;
        this.manifest = null;
        if (outgoing) {
            clearTimeout(outgoing.timer);
            outgoing.abort.abort(new Error(reason));
        }
        const id = outgoing?.id || incoming?.id;
        if (notify && id) {
            try { this.control({ type: 'cancel', id }); } catch {}
        }
        if (outgoing || incoming) {
            this.events.request(null);
            this.events.cancelled(reason);
        }
    }

    disconnected(reason) {
        this.cancel(reason, false);
        this.available = false;
    }

    message(data) {
        if (this.legacy) {
            this.handleLegacy(data);
            return;
        }
        try {
            if (data instanceof ArrayBuffer) {
                this.receiveChunk(data);
                return;
            }
            if (typeof data !== 'string' || encoder.encode(data).byteLength > MAX_CONTROL) throw new Error('对方发送了不受支持的信令。');
            const message = JSON.parse(data);
            if (message?.type === 'hello' && message.version === 2) {
                this.available = true;
                this.events.ready();
                return;
            }
            if (!idMatches(message?.id)) throw new Error('传输请求格式无效。');
            this.route(message);
        } catch (error) {
            this.cancel(error.message || '传输数据异常。');
            this.events.invalid(error.message || '传输数据异常。');
        }
    }

    route(message) {
        if (message.type === 'offer' && this.role === 'receive') {
            if (this.pending || this.incoming || this.manifest) {
                this.control({ type: 'decline', id: message.id });
                return;
            }
            const { id, count, noteLength } = message;
            if (!Number.isSafeInteger(count) || count < 0 || count > MAX_FILES || !Number.isSafeInteger(noteLength)
                || noteLength < 0 || noteLength > MAX_NOTE || (!count && !noteLength)) {
                this.control({ type: 'decline', id });
                return;
            }
            this.manifest = { id, count, noteLength, files: [] };
            return;
        }
        if (message.id === this.manifest?.id) {
            this.receiveManifest(message);
            return;
        }
        if (this.outgoing?.id === message.id) {
            const job = this.outgoing;
            if (message.type === 'accept' && job.stage === 'request') {
                clearTimeout(job.timer);
                void this.send(job);
            }
            if (message.type === 'decline') this.cancel('对方拒绝了本次传输。', false);
            if (message.type === 'receipt' && job.stage === 'receipt') {
                this.outgoing = null;
                clearTimeout(job.timer);
                this.events.sent(job.files.length, job.total);
            }
        }
        if (this.incoming?.id === message.id) this.finishIncoming(message);
        if (message.type === 'cancel' && [this.pending?.id, this.incoming?.id, this.outgoing?.id].includes(message.id)) {
            this.cancel('对方取消了本次传输。', false);
        }
    }

    receiveManifest(message) {
        const { files, id, count, noteLength } = this.manifest;
        if (message.type === 'offer-files' && Array.isArray(message.files) && message.files.length <= 5
            && files.length + message.files.length <= count) {
            files.push(...message.files);
        } else if (message.type === 'offer-complete' && files.length === count) {
            this.manifest = null;
            try {
                const { items, total } = manifestItems(files);
                this.pending = { id, files: items, total, noteLength };
                this.events.request(this.pending);
            } catch (error) {
                this.control({ type: 'decline', id });
                this.events.invalid(error.message);
            }
        } else {
            this.manifest = null;
            if (message.type !== 'cancel') this.control({ type: 'decline', id });
        }
    }

    receiveChunk(data) {
        const job = this.incoming;
        const file = job?.files[job.index];
        // Once cancelled, the already buffered frames may still arrive.
        if (!job) return;
        if (!job.noteReceived || !file || !data.byteLength || job.part + data.byteLength > file.size) {
            throw new Error('收到的字节数与文件清单不符。');
        }
        job.chunks.push(data);
        job.part += data.byteLength;
        job.done += data.byteLength;
        this.events.progress(job.done, job.total, file.path, job.started);
    }

    finishIncoming(message) {
        const job = this.incoming;
        if (message.type === 'note') {
            if (job.noteReceived || typeof message.note !== 'string' || message.note.length !== job.noteLength) {
                throw new Error('收到的附言与文件清单不符。');
            }
            job.note = message.note;
            job.noteReceived = true;
        }
        if (message.type === 'end-file') {
            const file = job.files[job.index];
            if (!job.noteReceived || !file || job.part !== file.size) throw new Error('文件未完整接收。');
            this.events.file({ ...file, blob: new Blob(job.chunks) });
            job.index += 1;
            job.chunks = [];
            job.part = 0;
        }
        if (message.type === 'end-transfer') {
            if (!job.noteReceived || job.index !== job.files.length || job.done !== job.total) throw new Error('文件未完整接收。');
            this.incoming = null;
            this.control({ type: 'receipt', id: job.id });
            this.events.received(job.note, job.files.length, job.total);
        }
    }

    handleLegacy(data) {
        try {
            if (typeof data === 'string') {
                const message = JSON.parse(data);
                if (message.label !== 'metadata') return;
                const path = safePath(message.fileName);
                const { fileSize: size, fileIndex: index, totalFiles: total } = message;
                if (!path || !Number.isSafeInteger(size) || size < 0 || size > MAX_RECEIVE
                    || !Number.isInteger(index) || !Number.isInteger(total) || index < 1 || total > MAX_FILES || index > total
                    || this.incoming) throw new Error('旧版文件清单超出限制或尚未接收完成。');
                if (index === 1) {
                    this.legacyTotal = 0;
                    this.events.receiving(size);
                }
                if ((this.legacyTotal || 0) + size > MAX_RECEIVE) throw new Error(`旧版文件超过 ${bytes(MAX_RECEIVE)} 接收上限。`);
                this.incoming = { path, size, index, total, chunks: [], done: 0, started: performance.now() };
            }
            const item = this.incoming;
            if (!item) return;
            if (data instanceof ArrayBuffer) {
                if (item.done + data.byteLength > item.size) throw new Error('收到的字节数与旧版文件清单不符。');
                item.chunks.push(data);
                item.done += data.byteLength;
                this.events.progress(item.done, item.size, item.path, item.started);
            }
            if (item.done === item.size) {
                this.events.file({ path: item.path, size: item.size, blob: new Blob(item.chunks) });
                this.incoming = null;
                this.legacyTotal = (this.legacyTotal || 0) + item.size;
                if (item.index === item.total) this.events.received('', item.total, this.legacyTotal);
            }
        } catch (error) {
            this.cancel(error.message, false);
            this.events.invalid(error.message);
        }
    }
}
