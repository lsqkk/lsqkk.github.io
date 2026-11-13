import { randomBytes } from 'node:crypto';
import { S3Client, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getDatabase } from './_firebase-admin.js';
import { reserveDailyQuota } from './_daily-quota.js';
import { quotaAccount } from './_quota-session.js';
import { ShareError } from './_share-error.js';

const ROOT = 'quark_share_drops';
const MAX_BYTES = 25 * 1024 * 1024;
const UPLOAD_SECONDS = 900;
const TYPE = 'application/octet-stream';
const dayKey = (now) => new Date(now).toISOString().slice(0, 10);
const env = (name) => String(process.env[name] || '').trim();
let storage;
let cleanedDay = '';

export function dropAvailable() {
  const bucket = env('R2_SHARE_BUCKET');
  return Boolean(bucket && bucket !== env('R2_BUCKET') && env('R2_ENDPOINT')
    && env('R2_ACCESS_KEY_ID') && env('R2_SECRET_ACCESS_KEY'));
}

function dropStorage() {
  if (!dropAvailable()) throw new ShareError(503, '离线包存储尚未启用。');
  storage ??= new S3Client({
    region: 'auto',
    endpoint: env('R2_ENDPOINT'),
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials: {
      accessKeyId: env('R2_ACCESS_KEY_ID'),
      secretAccessKey: env('R2_SECRET_ACCESS_KEY')
    }
  });
  return storage;
}

function owner(req) {
  const account = quotaAccount(req);
  if (!account) throw new ShareError(401, '请登录并验证账号后创建或管理离线包。');
  return account.subject;
}

function objectInput(day, id) {
  return { Bucket: env('R2_SHARE_BUCKET'), Key: `share-drop/${day}/${id}.bin` };
}

function signingDate(url) {
  const value = new URL(url).searchParams.get('X-Amz-Date');
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value || '');
  if (!match) throw new Error('Missing R2 signature time');
  return Date.parse(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`);
}

export function signedUpload(client, object, size) {
  return getSignedUrl(client, new PutObjectCommand({
    ...object,
    ContentType: TYPE,
    ContentLength: size,
    IfNoneMatch: '*',
    CacheControl: 'private, no-store'
  }), {
    expiresIn: UPLOAD_SECONDS,
    signableHeaders: new Set(['content-type', 'content-length', 'if-none-match', 'cache-control'])
  });
}

async function createDrop(req, body, client, db, now) {
  const subject = owner(req);
  const size = body.size;
  const hours = body.hours;
  if (!Number.isSafeInteger(size) || size < 32 || size > MAX_BYTES || ![1, 6, 24].includes(hours)) {
    throw new ShareError(400, '离线包大小或有效期超出限制。');
  }
  const quota = await reserveDailyQuota(req, 'quark_share_drop_quota', { guestLimit: 0, accountLimit: 10, siteLimit: 80 });
  if (quota) throw new ShareError(quota.code === 'QUOTA_SESSION_REQUIRED' ? 401 : 429, quota.error);

  const day = dayKey(now);
  if (cleanedDay !== day) {
    const oldDays = await db.ref(ROOT).orderByKey().endAt(dayKey(now - 2 * 86_400_000)).once('value');
    const removals = {};
    oldDays.forEach((oldDay) => { removals[oldDay.key] = null; });
    if (Object.keys(removals).length) await db.ref(ROOT).update(removals);
    cleanedDay = day;
  }

  const id = randomBytes(16).toString('hex');
  const ref = db.ref(`${ROOT}/${day}/${id}`);
  const uploadUrl = await signedUpload(client, objectInput(day, id), size);
  const uploadUntil = signingDate(uploadUrl) + UPLOAD_SECONDS * 1000;
  await ref.set({ size, hours, owner: subject, uploadUntil });
  return { id, day, uploadUrl };
}

async function lookupDrop(db, { day, id }, now) {
  if (!/^[a-f0-9]{32}$/.test(id || '') || ![dayKey(now), dayKey(now - 86_400_000), dayKey(now - 2 * 86_400_000)].includes(day)) {
    throw new ShareError(404, '离线包不存在或已过期。');
  }
  const ref = db.ref(`${ROOT}/${day}/${id}`);
  const record = (await ref.once('value')).val();
  if (!record) throw new ShareError(404, '离线包不存在或已过期。');
  return { ref, record, object: objectInput(day, id) };
}

async function finishDrop(ref, record, object, client, now) {
  if (record.revoked) throw new ShareError(410, '离线包已撤回。');
  if (record.expiresAt > now) return { expiresAt: record.expiresAt };
  if (record.uploadUntil <= now) throw new ShareError(410, '上传凭证已过期。请重新创建离线包。');
  let objectInfo;
  try {
    objectInfo = await client.send(new HeadObjectCommand(object));
  } catch (error) {
    if (error.$metadata?.httpStatusCode !== 404) throw error;
    throw new ShareError(409, '未找到上传完成的离线包。请重试。');
  }
  if (objectInfo.ContentLength !== record.size || objectInfo.ContentType !== TYPE) {
    throw new ShareError(409, '离线包上传内容校验失败。');
  }
  const result = await ref.transaction((current) => {
    if (!current) return null;
    if (current.revoked || current.uploadUntil <= now) return;
    return { ...current, expiresAt: current.expiresAt || now + current.hours * 3_600_000 };
  }, undefined, false);
  const expiresAt = result.snapshot.val()?.expiresAt;
  if (!result.committed || !expiresAt) throw new ShareError(410, '离线包已失效。');
  return { expiresAt };
}

export async function handleDrop(req, body) {
  if (!['drop-create', 'drop-finish', 'drop-read', 'drop-revoke'].includes(body.action)) {
    throw new ShareError(400, '离线包操作无效。');
  }
  const client = dropStorage();
  const db = getDatabase();
  const now = Date.now();
  if (body.action === 'drop-create') return createDrop(req, body, client, db, now);
  const { ref, record, object } = await lookupDrop(db, body, now);

  if (body.action === 'drop-read') {
    const seconds = Math.min(90, Math.floor((record.expiresAt - now) / 1000));
    if (record.revoked || !(seconds > 0)) throw new ShareError(410, '离线包尚未发布、已撤回或已过期。');
    const downloadUrl = await getSignedUrl(client, new GetObjectCommand(object), { expiresIn: seconds });
    return { downloadUrl, expiresAt: record.expiresAt, size: record.size };
  }

  if (owner(req) !== record.owner) throw new ShareError(403, '只有创建者可以管理此离线包。');
  if (body.action === 'drop-finish') return finishDrop(ref, record, object, client, now);
  await ref.update({ revoked: true });
  // Keep the immutable object while its original PUT signature can still be used.
  // The bucket lifecycle removes ciphertext from interrupted uploads and revocations.
  if (record.uploadUntil + 60_000 <= now) await client.send(new DeleteObjectCommand(object));
  return { ok: true };
}
