import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { getDatabase } from './_firebase-admin.js';
import { quotaAccount } from './_quota-session.js';

export function requestIp(req) {
  const ip = req.headers['x-vercel-forwarded-for'];
  return typeof ip === 'string' && !ip.includes('%') && isIP(ip) ? ip : '';
}

function guestIdentity(ip) {
  if (isIP(ip) !== 6) return ip;
  const canonical = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
  const mapped = /^::ffff:([a-f0-9]+):([a-f0-9]+)$/.exec(canonical);
  if (mapped) return mapped.slice(1).flatMap((part) => [parseInt(part, 16) >> 8, parseInt(part, 16) & 255]).join('.');
  const [start, end] = canonical.split('::');
  const first = start ? start.split(':') : [];
  const last = end ? end.split(':') : [];
  const groups = end === undefined ? first : [...first, ...Array(8 - first.length - last.length).fill('0'), ...last];
  return `${groups.slice(0, 4).join(':')}::/64`;
}

export async function reserveDailyQuota(req, root, { guestLimit, accountLimit, siteLimit = Infinity }) {
  const ip = requestIp(req);
  if (!ip) throw new Error('Missing trusted client IP');
  const account = quotaAccount(req);
  const identity = account ? `account:${account}` : guestIdentity(ip);
  const limit = account ? accountLimit : guestLimit;
  const day = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const secret = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const key = createHmac('sha256', secret).update(`${day}:${identity}`).digest('hex');
  const result = await getDatabase().ref(root).transaction((current) => {
    if (current?.day > day) return;
    const quota = current?.day === day ? current : { day, total: 0, clients: {} };
    const count = quota.clients?.[key] || 0;
    if (quota.total >= siteLimit || count >= limit) return;
    return { day, total: quota.total + 1, clients: { ...quota.clients, [key]: count + 1 } };
  }, undefined, false);
  if (result.committed) return null;
  if (result.snapshot.val()?.total >= siteLimit) {
    return { code: 'SITE_QUOTA', error: '全站今天的免费额度已用完，北京时间零点刷新。' };
  }
  return account
    ? { code: 'ACCOUNT_QUOTA', error: `你的账号今天已用完 ${limit} 次额度，北京时间零点刷新。` }
    : { code: 'GUEST_QUOTA', error: `此网络今天已用完 ${limit} 次访客额度。请登录获取更多次数，或等北京时间零点刷新。` };
}
