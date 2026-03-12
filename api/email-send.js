import crypto from 'node:crypto';

const ipLimiter = new Map();
const emailLimiter = new Map();
const RATE_WINDOW_MS = 60 * 1000;

function buildToken(payload, secret) {
    const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', secret).update(payloadBase64).digest('hex');
    return `${payloadBase64}.${signature}`;
}

function allowOrigin(req, res) {
    const allowed = ['http://localhost:8000', 'https://localhost:8000', 'https://lsqkk.github.io'];
    const origin = req.headers.origin;
    if (origin && allowed.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        return true;
    }
    res.setHeader('Access-Control-Allow-Origin', 'false');
    return false;
}

export default async function handler(req, res) {
    allowOrigin(req, res);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    let body;
    try {
        body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
        return res.status(400).json({ error: 'Invalid JSON format' });
    }

    const email = String(body?.email || '').trim().toLowerCase();
    const purpose = String(body?.purpose || 'login');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Invalid email' });
    }

    const now = Date.now();
    const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').toString().split(',')[0].trim();
    const ipKey = `ip:${ip}:${purpose}`;
    const emailKey = `mail:${email}:${purpose}`;
    const ipLast = ipLimiter.get(ipKey) || 0;
    const mailLast = emailLimiter.get(emailKey) || 0;
    if (now - ipLast < RATE_WINDOW_MS || now - mailLast < RATE_WINDOW_MS) {
        return res.status(429).json({ error: 'Too many requests' });
    }
    ipLimiter.set(ipKey, now);
    emailLimiter.set(emailKey, now);

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM;
    const tokenSecret = process.env.EMAIL_TOKEN_SECRET;
    if (!apiKey || !from || !tokenSecret) {
        return res.status(500).json({ error: 'Missing email configuration' });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresInMs = 10 * 60 * 1000;
    const payload = {
        email,
        purpose,
        code,
        exp: Date.now() + expiresInMs
    };
    const token = buildToken(payload, tokenSecret);

    const subjectMap = {
        login: '夸克博客登录验证码',
        register: '夸克博客注册验证码',
        reset: '夸克博客重置密码验证码'
    };
    const subject = subjectMap[purpose] || subjectMap.login;

    try {
        const resp = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from,
                to: email,
                subject,
                html: `<p>你的验证码是 <strong>${code}</strong>，10 分钟内有效。</p>`
            })
        });
        if (!resp.ok) {
            const text = await resp.text();
            return res.status(500).json({ error: `Email send failed: ${text.slice(0, 120)}` });
        }
        return res.status(200).json({ ok: true, token, expiresIn: expiresInMs });
    } catch (error) {
        console.error('Email send failed:', error);
        return res.status(500).json({ error: 'Email send failed' });
    }
}
