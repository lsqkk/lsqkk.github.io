import { createHmac, timingSafeEqual } from 'node:crypto';

const duration = 30 * 24 * 60 * 60 * 1000;

function digest(value) {
  const secret = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  return secret ? createHmac('sha256', secret).update(`quark-quota-session:${value}`).digest('hex') : '';
}

export function issueQuotaSession(identity, { networkLimited = false } = {}) {
  const subject = digest(`account:${identity}`);
  if (!subject) return null;
  const expiresAt = Date.now() + duration;
  const payload = Buffer.from(JSON.stringify({ sub: subject, exp: expiresAt, ...(networkLimited && { networkLimited }) })).toString('base64url');
  return { token: `${payload}.${digest(`token:${payload}`)}`, expiresAt };
}

export function quotaAccount(req) {
  const match = /^Bearer ([A-Za-z0-9_-]{1,240})\.([a-f0-9]{64})$/.exec(req.headers.authorization || '');
  if (!match) return null;
  const [, payload, signature] = match;
  const expected = digest(`token:${payload}`);
  if (!expected || !timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) return null;
  try {
    const { sub, exp, networkLimited } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return /^[a-f0-9]{64}$/.test(sub) && Number.isSafeInteger(exp) && exp > Date.now()
      ? { subject: sub, networkLimited: networkLimited === true }
      : null;
  } catch { return null; }
}
