import { createCipheriv, createDecipheriv, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { SITE_ORIGINS } from './_cors.js';
import { reserveDailyQuota } from './_daily-quota.js';
import { getDatabase } from './_firebase-admin.js';

const ROOT = 'quark_managed_chat_v1';
const HOUR = 3_600_000;
const PRESENCE_TTL = 40_000;
const MAX_BATCH_CHARS = 3_000_000;
const roomPattern = /^QC-[A-Z0-9_-]{12}$/;
const keyPattern = /^[-\w]{20}$/;
const memberPattern = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
const retentionHours = [1, 24, 168];
const derivePassword = promisify(scrypt);

class ChatError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

function secret() {
    const value = process.env.CHAT_ROOM_SECRET || process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!value) throw new Error('Missing managed chat secret');
    return value;
}

function mac(...parts) {
    return createHmac('sha256', secret()).update(JSON.stringify(parts)).digest();
}

function matches(expected, value) {
    if (typeof value !== 'string' || !/^[a-f\d]{64}$/.test(value)) return false;
    return timingSafeEqual(expected, Buffer.from(value, 'hex'));
}

function seal(code, key, value) {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', mac('chat-encryption', code), nonce);
    cipher.setAAD(Buffer.from(key));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString('base64');
}

function unseal(code, key, value) {
    try {
        const envelope = Buffer.from(value, 'base64');
        const cipher = createDecipheriv('aes-256-gcm', mac('chat-encryption', code), envelope.subarray(0, 12));
        cipher.setAAD(Buffer.from(key));
        cipher.setAuthTag(envelope.subarray(12, 28));
        return JSON.parse(Buffer.concat([cipher.update(envelope.subarray(28)), cipher.final()]).toString('utf8'));
    } catch {
        return null;
    }
}

function metadataSignature(code, room) {
    return mac('chat-metadata', code, room.title, room.expiresAt, room.salt, room.passwordHash);
}

function membership(code, room, member) {
    return mac('chat-membership', code, room.signature, member);
}

function passwordInput(value) {
    if (typeof value !== 'string' || value.length > 80) throw new ChatError(400, '房间口令格式无效。');
    return value;
}

async function checkQuota(req, scope, limit, siteLimit) {
    const quota = await reserveDailyQuota(req, ROOT + '_' + scope, { guestLimit: limit, accountLimit: limit, siteLimit });
    if (quota) throw new ChatError(429, quota.error);
}

async function createRoom(db, req, body, now) {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const password = passwordInput(body.password ?? '');
    if (!title || title.length > 40 || !retentionHours.includes(body.hours)) throw new ChatError(400, '请填写 1–40 字的房间名称并选择保存时间。');
    if (password && password.length < 8) throw new ChatError(400, '房间口令至少需要 8 个字符。');
    await checkQuota(req, 'create', 30, 600);
    const salt = randomBytes(16).toString('hex');
    const passwordHash = password ? (await derivePassword(password, salt, 32)).toString('hex') : '';
    const expiresAt = now + body.hours * HOUR;
    for (let attempt = 0; attempt < 3; attempt++) {
        const code = 'QC-' + randomBytes(9).toString('base64url').toUpperCase();
        const room = { title, expiresAt, salt, passwordHash };
        room.signature = metadataSignature(code, room).toString('hex');
        const result = await db.ref(ROOT + '/rooms/' + code).transaction(current => current ? undefined : room, undefined, false);
        if (result.committed) return { code, title, expiresAt, private: Boolean(passwordHash), token: membership(code, room, body.member).toString('hex') };
    }
    throw new ChatError(503, '暂时无法分配房间号，请重试。');
}

async function cleanup(db, now) {
    const snapshot = await db.ref(ROOT + '/rooms').orderByChild('expiresAt').endAt(now).limitToFirst(250).once('value');
    const removals = {};
    snapshot.forEach(room => {
        removals['rooms/' + room.key] = null;
        removals['content/' + room.key] = null;
        removals['presence/' + room.key] = null;
    });
    if (Object.keys(removals).length) await db.ref(ROOT).update(removals);
    return { removed: snapshot.numChildren() };
}

function safeAvatar(value) {
    try {
        if (typeof value !== 'string' || value.length > 500) return '';
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
    } catch {
        return '';
    }
}

function messageValue(value, member, now) {
    if (!value || typeof value !== 'object') throw new ChatError(400, '消息格式无效。');
    const text = typeof value.text === 'string' ? value.text.trim().slice(0, 2400) : '';
    const nickname = typeof value.nickname === 'string' ? value.nickname.trim().slice(0, 32) : '';
    const title = typeof value.task?.title === 'string' ? value.task.title.trim().slice(0, 160) : '';
    const image = typeof value.image === 'string' && value.image.length <= 85000 &&
        /^data:image\/(?:webp|jpeg|png);base64,[a-z\d+/]+=*$/i.test(value.image) ? value.image : '';
    if (!nickname || (!text && !title && !image)) throw new ChatError(400, '请填写昵称与消息内容。');
    const color = /^#[a-f\d]{6}$/i.test(value.color) ? value.color : '#5874dd';
    const message = { text, nickname, color, avatarUrl: safeAvatar(value.avatarUrl), sender: member, timestamp: now };
    if (title) message.task = { title, done: false };
    if (image) {
        message.image = image;
        message.imageWidth = Math.min(1440, Math.max(1, Number(value.imageWidth) || 1));
        message.imageHeight = Math.min(1440, Math.max(1, Number(value.imageHeight) || 1));
    }
    if (keyPattern.test(value.reply?.id || '')) {
        message.reply = { id: value.reply.id, name: String(value.reply.name || '').slice(0, 32), text: String(value.reply.text || '').slice(0, 120) };
    }
    return message;
}

async function history(content, code, before) {
    const root = content.child('messages').orderByKey();
    const query = before ? root.endBefore(before) : root;
    const snapshot = await query.limitToLast(40).once('value');
    const items = [];
    const encrypted = [];
    snapshot.forEach(child => { encrypted.push([child.key, child.val()]); });
    let batchSize = 0;
    for (const [key, data] of encrypted.reverse()) {
        if (typeof data !== 'string') continue;
        batchSize += data.length;
        if (batchSize > MAX_BATCH_CHARS) break;
        const value = unseal(code, key, data);
        if (value) items.push([key, value]);
    }
    return { items: items.reverse(), hasMore: snapshot.numChildren() === 40 };
}

async function onlineCount(presence, member, now) {
    const expired = now - PRESENCE_TTL;
    const active = await presence.transaction(current => {
        const members = Object.fromEntries(Object.entries(current || {}).filter(([, seen]) => Number.isSafeInteger(seen) && seen > expired));
        members[member] = now;
        return members;
    }, undefined, false);
    return active.snapshot.numChildren();
}

async function handle(db, req, body, now) {
    const { code, member, action } = body;
    if (!memberPattern.test(member || '')) throw new ChatError(400, '浏览器会话无效，请刷新页面。');
    if (action === 'create') return createRoom(db, req, body, now);
    if (!roomPattern.test(code || '')) throw new ChatError(400, '请输入有效房间号。');

    const ref = db.ref(ROOT);
    const room = (await ref.child('rooms/' + code).once('value')).val();
    if (!room || !matches(metadataSignature(code, room), room.signature)) throw new ChatError(404, '房间不存在或已到期。');
    if (room.expiresAt <= now) {
        await ref.update({ ['rooms/' + code]: null, ['content/' + code]: null, ['presence/' + code]: null });
        throw new ChatError(410, '房间已到期，聊天记录已关闭。');
    }

    const expected = membership(code, room, member);
    const authorized = matches(expected, body.token);
    if (action === 'join') {
        if (!authorized && room.passwordHash) {
            const password = passwordInput(body.password ?? '');
            if (!password) throw new ChatError(401, '该房间需要口令。');
            await checkQuota(req, 'join', 80, 3000);
            if (!matches(await derivePassword(password, room.salt, 32), room.passwordHash)) throw new ChatError(403, '房间口令不正确。');
        }
        return { code, title: room.title, expiresAt: room.expiresAt, private: Boolean(room.passwordHash), token: expected.toString('hex') };
    }
    if (!authorized) throw new ChatError(401, '请重新加入房间。');
    const content = ref.child('content/' + code);
    const presence = ref.child('presence/' + code);

    if (action === 'leave') {
        await presence.child(member).remove();
        return { ok: true };
    }
    if (action === 'poll') {
        const [revision, online] = await Promise.all([content.child('revision').once('value'), onlineCount(presence, member, now)]);
        const current = revision.val() || '';
        return { online, revision: current, ...(current === body.revision ? { items: null } : await history(content, code)) };
    }
    if (action === 'history' && keyPattern.test(body.before || '')) return history(content, code, body.before);
    if (action === 'read' && keyPattern.test(body.key || '')) {
        const snapshot = await messageRef.once('value');
        const value = unseal(code, body.key, snapshot.val());
        if (!value) throw new ChatError(404, '原消息已不可用。');
        return { item: [body.key, value] };
    }
    if (action === 'send') {
        const message = messageValue(body.message, member, now);
        const key = content.child('messages').push().key;
        await content.update({ ['messages/' + key]: seal(code, key, message), revision: key });
        return { item: [key, message] };
    }
    if (action === 'task' && keyPattern.test(body.key || '') && typeof body.done === 'boolean') {
        const nickname = typeof body.nickname === 'string' ? body.nickname.trim().slice(0, 32) : '';
        if (!nickname) throw new ChatError(400, '请先设置昵称。');
        const messageRef = content.child('messages/' + body.key);
        await messageRef.once('value');
        const result = await messageRef.transaction(current => {
            const value = unseal(code, body.key, current);
            if (!value?.task || value.task.done === body.done) return;
            value.task = { ...value.task, done: body.done, by: nickname };
            return seal(code, body.key, value);
        }, undefined, false);
        const stored = result.committed ? result.snapshot : await content.child('messages/' + body.key).once('value');
        const value = unseal(code, body.key, stored.val());
        if (!value?.task) throw new ChatError(404, '待办已不可用。');
        if (result.committed) await content.child('revision').set(randomBytes(12).toString('hex'));
        return { item: [body.key, value] };
    }
    throw new ChatError(400, '聊天室操作无效。');
}

export default async function handler(req, res) {
    const now = Date.now();
    const origin = req.headers.origin;
    if (SITE_ORIGINS.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-store');
    try {
        if (req.method === 'GET' && process.env.CRON_SECRET && req.headers.authorization === 'Bearer ' + process.env.CRON_SECRET) {
            return res.status(200).json(await cleanup(getDatabase(), now));
        }
        if (!SITE_ORIGINS.includes(origin)) throw new ChatError(403, '请求来源不受支持。');
        if (req.method === 'OPTIONS') return res.status(204).end();
        if (req.method !== 'POST') throw new ChatError(405, '请求方法不受支持。');
        const body = req.body;
        if (!body || typeof body !== 'object' || Array.isArray(body) || JSON.stringify(body).length > 240000) {
            throw new ChatError(400, '聊天室请求格式无效。');
        }
        return res.status(200).json(await handle(getDatabase(), req, body, now));
    } catch (error) {
        if (error instanceof ChatError) return res.status(error.status).json({ error: error.message });
        console.error('Managed chat request failed', error.name, error.code || '');
        return res.status(503).json({ error: '聊天室服务暂不可用，请稍后重试。' });
    }
}
