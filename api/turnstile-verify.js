import { createHash, timingSafeEqual } from 'node:crypto';
import { allowOrigin, SITE_ORIGINS } from './_cors.js';
import { getDatabase } from './_firebase-admin.js';
import { issueQuotaSession } from './_quota-session.js';

async function passwordLogin(req, res) {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || !/^[a-z]{3,20}$/.test(username)
    || typeof password !== 'string' || !password || password.length > 128) {
    return res.status(400).json({ ok: false, error: '账号名或密码格式有误。' });
  }
  const user = (await getDatabase().ref(`qb_users/${username}`).once('value')).val();
  if (typeof user?.salt !== 'string' || typeof user.passwordHash !== 'string' || !/^[a-f0-9]{64}$/.test(user.passwordHash)) {
    return res.status(401).json({ ok: false, error: '账号名或密码错误。' });
  }
  const actual = createHash('sha256').update(`${user.salt}:${password}`).digest();
  if (!timingSafeEqual(actual, Buffer.from(user.passwordHash, 'hex'))) {
    return res.status(401).json({ ok: false, error: '账号名或密码错误。' });
  }
  const quotaSession = issueQuotaSession(`local:${username}`, { networkLimited: true });
  if (!quotaSession) return res.status(503).json({ ok: false, error: '暂时无法建立登录会话，请稍后重试。' });
  return res.status(200).json({
    ok: true, quotaSession,
    profile: {
      login: username,
      nickname: typeof user.nickname === 'string' ? user.nickname : '',
      avatarUrl: typeof user.avatarUrl === 'string' ? user.avatarUrl : ''
    }
  });
}

export default async function handler(req, res) {
  const allowed = allowOrigin(req, res, SITE_ORIGINS);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    res.status(500).json({ error: 'Missing TURNSTILE_SECRET_KEY' });
    return;
  }

  try {
    const { token, purpose } = req.body || {};
    if (purpose === 'password-login' && !allowed) return res.status(403).json({ ok: false, error: '来源不受支持。' });
    if (!token) {
      res.status(400).json({ error: 'Missing token' });
      return;
    }

    const form = new URLSearchParams();
    form.append('secret', secret);
    form.append('response', token);

    const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form
    });
    const data = await resp.json();
    if (!resp.ok || !data?.success) {
      res.status(200).json({ ok: false, error: '验证码验证失败', detail: data });
      return;
    }

    const hostname = data.hostname || '';
    if ((hostname || purpose === 'password-login') && hostname !== 'lsqkk.github.io') {
      res.status(200).json({ ok: false, error: '域名校验失败' });
      return;
    }

    if (purpose === 'password-login') return await passwordLogin(req, res);
    res.status(200).json({ ok: true, purpose: purpose || 'login' });
  } catch (error) {
    console.error('Turnstile verify error:', error);
    res.status(500).json({ ok: false, error: '验证失败' });
  }
}
