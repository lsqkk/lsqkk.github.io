// /api/admin.js - 管理员会话管理（合并 admin-auth + admin-verify）
// POST ?action=auth   → 密码验证，生成 session token
// POST ?action=verify → 验证 session token
import crypto from 'node:crypto';
import { allowOrigin } from './_cors.js';

const SESSION_DURATION = 2 * 60 * 60 * 1000; // 2 小时

function buildToken(payload, secret) {
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payloadBase64).digest('hex');
  return `${payloadBase64}.${signature}`;
}

function verifyToken(token, secret) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return null;
  const [payloadBase64, signature] = parts;
  const expected = crypto.createHmac('sha256', secret).update(payloadBase64).digest('hex');
  if (expected !== signature) return null;
  try {
    return JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  allowOrigin(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const action = req.query?.action;
  if (!action || !['auth', 'verify'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action. Use ?action=auth or ?action=verify' });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON format' });
  }

  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    return res.status(500).json({ error: 'Missing ADMIN_SESSION_SECRET' });
  }

  // ── 密码验证 ──
  if (action === 'auth') {
    const submittedHash = body.passwordHash;
    if (!submittedHash || submittedHash.length !== 64) {
      return res.status(400).json({ error: 'Invalid request data' });
    }

    const correctHash = process.env.ADMIN_PASSWORD_HASH;
    let isCorrect = true;
    if (!correctHash || submittedHash.length !== correctHash.length) {
      isCorrect = false;
    } else {
      for (let i = 0; i < submittedHash.length; i++) {
        if (submittedHash[i] !== correctHash[i]) isCorrect = false;
      }
    }

    if (!isCorrect) {
      return res.status(401).json({ success: false, error: 'Authentication failed' });
    }

    const payload = {
      exp: Date.now() + SESSION_DURATION,
      iat: Date.now(),
      nonce: crypto.randomBytes(8).toString('hex'),
    };
    const token = buildToken(payload, secret);

    return res.status(200).json({
      success: true,
      message: 'Authentication successful',
      token,
      expiresAt: payload.exp,
    });
  }

  // ── Token 验证 ──
  const token = body?.token;
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ valid: false, error: 'Missing token' });
  }

  const payload = verifyToken(token, secret);
  if (!payload) {
    return res.status(401).json({ valid: false, error: 'Invalid token signature' });
  }
  if (!payload?.exp || Date.now() > payload.exp) {
    return res.status(401).json({ valid: false, error: 'Token expired' });
  }

  return res.status(200).json({ valid: true, expiresAt: payload.exp });
}
