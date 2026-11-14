import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getDatabase } from './_firebase-admin.js';
import { reserveDailyQuota } from './_daily-quota.js';
import { ShareError } from './_share-error.js';

const ROOM_ROOT = 'quark_share_rooms_v2';
const ROOM_TTL = 15 * 60 * 1000;
const CLAIM_TTL = 60 * 1000;
const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const dayKey = (now) => new Date(now).toISOString().slice(0, 10);
const randomToken = () => randomBytes(24).toString('base64url');
const roomCode = () => Array.from(randomBytes(8), (byte) => alphabet[byte & 31]).join('');

function description(value, type) {
  if (value?.type !== type || typeof value.sdp !== 'string' || value.sdp.length > 18_000 || !/^v=0\r?\n/.test(value.sdp)) {
    throw new ShareError(400, '设备信令格式无效。');
  }
  return { type, sdp: value.sdp };
}

function tokenValue(token) {
  if (!/^[A-Za-z0-9_-]{32}$/.test(token || '')) throw new ShareError(400, '连接凭证无效。');
  return token;
}

let cleanedDay = '';

async function createRoom(db, req, body, now) {
  const offer = description(body.offer, 'offer');
  if (!['send', 'collect'].includes(body.intent)) throw new ShareError(400, '连接模式无效。');
  const quota = await reserveDailyQuota(req, 'quark_share_room_quota', { guestLimit: 60, accountLimit: 150, siteLimit: 1200 });
  if (quota) throw new ShareError(quota.code === 'QUOTA_SESSION_REQUIRED' ? 401 : 429, quota.error);

  const day = dayKey(now);
  if (cleanedDay !== day) {
    const oldDays = await db.ref(ROOM_ROOT).orderByKey().endAt(dayKey(now - 2 * 86_400_000)).once('value');
    const removals = {};
    oldDays.forEach((oldDay) => { removals[oldDay.key] = null; });
    if (Object.keys(removals).length) await db.ref(ROOM_ROOT).update(removals);
    cleanedDay = day;
  }

  const host = randomToken();
  const expiresAt = now + ROOM_TTL;
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = roomCode();
    const result = await db.ref(`${ROOM_ROOT}/${day}/${code}`).transaction((room) => {
      if (room) return;
      return { offer, host, expiresAt, intent: body.intent };
    }, undefined, false);
    if (result.committed) return { code, token: host, expiresAt };
  }
  throw new ShareError(503, '暂时无法分配连接码，请重试。');
}

async function lookupRoom(db, code, now) {
  if (!/^[2-9A-HJ-NP-Z]{8}$/.test(code || '')) throw new ShareError(400, '请输入有效的连接码。');
  for (const day of [dayKey(now), dayKey(now - 86_400_000)]) {
    const ref = db.ref(`${ROOM_ROOT}/${day}/${code}`);
    const room = (await ref.once('value')).val();
    if (room?.expiresAt > now) return { ref, room };
  }
  throw new ShareError(404, '连接码不存在或已过期。请让对方重新生成。');
}

async function joinRoom(ref, room, now) {
  const guest = randomToken();
  const result = await ref.transaction((current) => {
    if (!current) return null;
    if (current.expiresAt <= now || current.answer || current.claimUntil > now) return;
    const { guestIce, ...available } = current;
    return { ...available, guest, claimUntil: now + CLAIM_TTL };
  }, undefined, false);
  if (!result.committed || result.snapshot.val()?.guest !== guest) throw new ShareError(409, '此连接码正在使用，请向对方索取新的连接码。');
  return { offer: room.offer, intent: room.intent, token: guest, expiresAt: room.expiresAt };
}

async function updateRoom(ref, room, body, now) {
  const token = tokenValue(body.token);
  if (token !== room.host && token !== room.guest) throw new ShareError(403, '设备连接凭证无效。');
  if (body.action === 'room-poll') {
    const isHost = token === room.host;
    const side = isHost ? 'hostIce' : 'guestIce';
    const incoming = body.candidates ?? [];
    if (!Array.isArray(incoming) || incoming.length > 48 || incoming.some((item) =>
      !item || typeof item.candidate !== 'string' || item.candidate.length > 1024
      || !item.candidate.startsWith('candidate:') || !Number.isSafeInteger(item.sdpMLineIndex)
      || item.sdpMLineIndex < 0 || item.sdpMLineIndex > 5
      || typeof item.sdpMid !== 'string' || item.sdpMid.length > 32
    )) throw new ShareError(400, '网络候选信令格式无效。');
    if (incoming.length) {
      const result = await ref.transaction((current) => {
        if (!current) return null;
        if (current.expiresAt <= now || token !== current[isHost ? 'host' : 'guest']) return;
        const candidates = [...(current[side] || [])];
        const seen = new Set(candidates.map(({ candidate }) => candidate));
        for (const { candidate, sdpMid, sdpMLineIndex } of incoming) {
          if (seen.has(candidate) || candidates.length >= 48) continue;
          seen.add(candidate);
          candidates.push({ candidate, sdpMid, sdpMLineIndex });
        }
        return { ...current, [side]: candidates };
      }, undefined, false);
      if (!result.committed || !result.snapshot.val()) throw new ShareError(403, '设备连接凭证已失效。');
      room = result.snapshot.val();
    }
    return { answer: isHost ? room.answer || null : null, candidates: room[isHost ? 'guestIce' : 'hostIce'] || [] };
  }

  if (body.action === 'room-answer' && token === room.guest) {
    const answer = description(body.answer, 'answer');
    const result = await ref.transaction((current) => {
      if (!current) return null;
      if (current.guest !== token || current.expiresAt <= now || current.claimUntil <= now) return;
      if (current.answer && current.answer.sdp !== answer.sdp) return;
      return { ...current, answer };
    }, undefined, false);
    if (!result.committed || !result.snapshot.val()?.answer) throw new ShareError(409, '连接邀请已失效。请重新加入。');
    return { ok: true };
  }

  if (body.action === 'room-close') {
    if (token === room.host) await ref.remove();
    else await ref.transaction((current) => {
      if (!current) return null;
      if (current.guest !== token || current.answer) return;
      const { guest, claimUntil, guestIce, ...released } = current;
      return released;
    }, undefined, false);
    return { ok: true };
  }

  throw new ShareError(403, '当前设备不能执行此操作。');
}

function legacySignature(code, offer, expiresAt) {
  const secret = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  return createHmac('sha256', secret).update(JSON.stringify(['share-legacy', code, offer.sdp, expiresAt])).digest('hex');
}

async function legacyRoom(db, body, now) {
  const { code, action } = body;
  if (!/^[A-Z]{3}$/.test(code || '')) throw new ShareError(400, '旧版连接码必须是三位英文字母。');
  const ref = db.ref(`rooms/${code}`);
  if (action === 'legacy-answer') {
    const answer = description(body.answer, 'answer');
    const expiresAt = body.expiresAt;
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + CLAIM_TTL || !/^[a-f0-9]{64}$/.test(body.claim || '')) {
      throw new ShareError(403, '旧版连接凭证已失效。');
    }
    const result = await ref.transaction((current) => {
      if (!current) return null;
      if (!current.sender?.sdp || current.receiver?.sdp) return;
      const expected = legacySignature(code, current.sender.sdp, expiresAt);
      if (!timingSafeEqual(Buffer.from(body.claim, 'hex'), Buffer.from(expected, 'hex'))) return;
      return { ...current, receiver: { ...current.receiver, sdp: answer } };
    }, undefined, false);
    if (!result.committed || !result.snapshot.val()?.receiver?.sdp) throw new ShareError(409, '旧版邀请已被使用或关闭。');
    return { ok: true };
  }
  const room = (await ref.once('value')).val();
  if (!room?.sender?.sdp) throw new ShareError(404, '未找到旧版房间。请让对方重新生成连接码。');
  if (room.receiver?.sdp) throw new ShareError(409, '旧版邀请已被使用。');
  const offer = description(room.sender.sdp, 'offer');
  const expiresAt = now + CLAIM_TTL;
  const claim = legacySignature(code, offer, expiresAt);
  const candidates = Object.values(room.sender.iceCandidates || {}).slice(0, 50);
  return { offer, candidates, expiresAt, claim };
}

export async function handleRoom(req, body) {
  const { action, code } = body;
  if (!['room-create', 'room-join', 'room-poll', 'room-answer', 'room-close', 'legacy-read', 'legacy-answer'].includes(action)) {
    throw new ShareError(400, '闪传操作无效。');
  }
  const db = getDatabase();
  const now = Date.now();
  if (action === 'room-create') return createRoom(db, req, body, now);
  if (action.startsWith('legacy-')) return legacyRoom(db, body, now);
  const { ref, room } = await lookupRoom(db, code, now);
  if (action === 'room-join') return joinRoom(ref, room, now);
  return updateRoom(ref, room, body, now);
}
