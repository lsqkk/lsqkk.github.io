import crypto from 'node:crypto';

function verifyToken(token, secret) {
    const parts = String(token || '').split('.');
    if (parts.length !== 2) return null;
    const [payloadBase64, signature] = parts;
    const expected = crypto.createHmac('sha256', secret).update(payloadBase64).digest('hex');
    if (expected !== signature) return null;
    try {
        const payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf8'));
        return payload;
    } catch {
        return null;
    }
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
        return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    let body;
    try {
        body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
        return res.status(400).json({ ok: false, error: 'Invalid JSON format' });
    }

    const email = String(body?.email || '').trim().toLowerCase();
    const code = String(body?.code || '').trim();
    const token = String(body?.token || '').trim();
    const purpose = String(body?.purpose || 'login');
    const secret = process.env.EMAIL_TOKEN_SECRET;
    if (!secret) {
        return res.status(500).json({ ok: false, error: 'Missing EMAIL_TOKEN_SECRET' });
    }

    const payload = verifyToken(token, secret);
    if (!payload) {
        return res.status(400).json({ ok: false, error: 'Invalid token' });
    }
    if (payload.exp && Date.now() > payload.exp) {
        return res.status(400).json({ ok: false, error: 'Token expired' });
    }
    if (payload.email !== email || payload.code !== code || payload.purpose !== purpose) {
        return res.status(400).json({ ok: false, error: 'Verification failed' });
    }

    return res.status(200).json({ ok: true });
}
