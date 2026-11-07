// /api/email.js - Send or verify a one-time email challenge.
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { allowOrigin, SITE_ORIGINS } from './_cors.js';
import { getDatabase } from './_firebase-admin.js';
import { issueQuotaSession } from './_quota-session.js';

const subjects = {
  login: '奇夸克登录验证码',
  register: '奇夸克注册验证码',
  reset: '奇夸克重置密码验证码',
  bind: '奇夸克绑定邮箱验证码'
};
const rateWindow = 60_000;
const lifetime = 10 * 60_000;
const ipLimiter = new Map();
const digest = (secret, value) => createHmac('sha256', secret).update(value).digest('hex');

async function sendChallenge(req, res, ref, { email, purpose, secret }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) return res.status(500).json({ error: 'Missing email configuration' });

  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  const key = `${ip}:${purpose}`;
  const now = Date.now();
  if (now - (ipLimiter.get(key) || 0) < rateWindow) return res.status(429).json({ error: 'Too many requests' });
  ipLimiter.set(key, now);

  const code = String(randomInt(100000, 1000000));
  const token = randomBytes(24).toString('base64url');
  const challenge = {
    token: digest(secret, token),
    code: digest(secret, `${token}:${code}`),
    sentAt: now, expiresAt: now + lifetime, attempts: 0
  };
  const result = await ref.transaction((current) => {
    if (current && now - current.sentAt < rateWindow) return;
    return challenge;
  }, undefined, false);
  if (!result.committed) return res.status(429).json({ error: 'Too many requests' });

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: email, subject: subjects[purpose],
      html: `<p>你的验证码是 <strong>${code}</strong>，10 分钟内有效。</p>` }),
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) return res.status(500).json({ error: 'Email send failed' });
  return res.status(200).json({ ok: true, token, expiresIn: lifetime });
}

async function verifyChallenge(res, ref, { body, email, purpose, secret }) {
  const code = String(body?.code || '').trim();
  const token = String(body?.token || '').trim();
  if (!/^\d{6}$/.test(code) || !/^[A-Za-z0-9_-]{32}$/.test(token)) {
    return res.status(400).json({ ok: false, error: 'Invalid challenge' });
  }
  const tokenHash = digest(secret, token);
  const codeHash = Buffer.from(digest(secret, `${token}:${code}`), 'hex');
  const attempt = randomBytes(16).toString('hex');
  const result = await ref.transaction((current) => {
    // An uncached transaction first receives null. Submit it so RTDB can check the latest value.
    if (!current) return null;
    if (current.token !== tokenHash || current.expiresAt <= Date.now() || current.usedBy || current.attempts >= 6) return;
    if (timingSafeEqual(Buffer.from(current.code, 'hex'), codeHash)) {
      return { sentAt: current.sentAt, usedBy: attempt };
    }
    return { ...current, attempts: current.attempts + 1 };
  }, undefined, false);
  if (!result.committed || result.snapshot.val()?.usedBy !== attempt) {
    return res.status(400).json({ ok: false, error: 'Verification failed' });
  }
  if (purpose !== 'login') return res.status(200).json({ ok: true });

  const db = getDatabase();
  const emailKey = email.replace(/[.#$/\[\]]/g, '_');
  const login = (await db.ref(`qb_email_index/${emailKey}`).once('value')).val();
  if (typeof login !== 'string' || !/^[a-z]{3,20}$/.test(login)) return res.status(200).json({ ok: true });
  const account = (await db.ref(`qb_users/${login}`).once('value')).val();
  const boundEmail = typeof account?.email === 'string' ? account.email.trim().toLowerCase() : '';
  const quotaSession = boundEmail === email ? issueQuotaSession(`email:${email}`) : null;
  return res.status(200).json({ ok: true, ...(quotaSession ? { quotaSession } : {}) });
}

export default async function handler(req, res) {
  const allowed = allowOrigin(req, res, SITE_ORIGINS);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (!allowed) return res.status(403).json({ error: 'Forbidden' });
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const action = req.query?.action;
  if (!['send', 'verify'].includes(action)) return res.status(400).json({ error: 'Invalid action' });
  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).json({ error: 'Invalid JSON format' }); }

  const secret = process.env.EMAIL_TOKEN_SECRET;
  if (!secret) return res.status(500).json({ error: 'Missing EMAIL_TOKEN_SECRET' });
  const email = String(body?.email || '').trim().toLowerCase();
  const purpose = String(body?.purpose || 'login');
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !Object.hasOwn(subjects, purpose)) {
    return res.status(400).json({ error: 'Invalid email or purpose' });
  }

  try {
    const ref = getDatabase().ref(`quark_email_challenges/${purpose}/${digest(secret, email)}`);
    const args = { body, email, purpose, secret };
    return await (action === 'send' ? sendChallenge(req, res, ref, args) : verifyChallenge(res, ref, args));
  } catch (error) {
    console.error('Email challenge failed:', error.message);
    return res.status(500).json({ ok: false, error: 'Email challenge unavailable' });
  }
}
