import crypto from 'node:crypto';

export default function handler(req, res) {
    const allowedOrigins = ['http://localhost:8000', 'https://localhost:8000', 'https://lsqkk.github.io'];
    const requestOrigin = req.headers.origin;
    const isOriginAllowed = requestOrigin && allowedOrigins.includes(requestOrigin);

    res.setHeader('Access-Control-Allow-Origin', isOriginAllowed ? requestOrigin : 'false');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const secret = process.env.ADMIN_SESSION_SECRET;
    if (!secret) {
        return res.status(500).json({ error: 'Missing ADMIN_SESSION_SECRET' });
    }

    let body;
    try {
        body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
        return res.status(400).json({ valid: false, error: 'Invalid JSON format' });
    }

    const token = body?.token;
    if (!token || typeof token !== 'string') {
        return res.status(400).json({ valid: false, error: 'Missing token' });
    }

    const [payloadBase64, signature] = token.split('.');
    if (!payloadBase64 || !signature) {
        return res.status(401).json({ valid: false, error: 'Invalid token format' });
    }

    const expected = crypto.createHmac('sha256', secret).update(payloadBase64).digest('hex');
    let sigOk = expected.length === signature.length;
    for (let i = 0; i < expected.length && i < signature.length; i++) {
        if (expected[i] !== signature[i]) sigOk = false;
    }
    if (!sigOk) {
        return res.status(401).json({ valid: false, error: 'Invalid token signature' });
    }

    let payload;
    try {
        payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf8'));
    } catch {
        return res.status(401).json({ valid: false, error: 'Invalid token payload' });
    }

    if (!payload?.exp || Date.now() > payload.exp) {
        return res.status(401).json({ valid: false, error: 'Token expired' });
    }

    return res.status(200).json({ valid: true, expiresAt: payload.exp });
}
