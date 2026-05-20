// /api/ip.js - 返回客户端IP（用于上传限流）
import { resolveOrigin } from './_cors.js';

export default function handler(req, res) {
    const requestOrigin = resolveOrigin(req);
    const isAllowed = Boolean(requestOrigin);

    res.setHeader('Access-Control-Allow-Origin', isAllowed ? requestOrigin : 'false');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (!isAllowed) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const forwardedIps = (req.headers['x-forwarded-for'] || '').split(',').map(v => v.trim()).filter(Boolean);
    const clientIP = forwardedIps.length > 1
        ? forwardedIps[1]
        : forwardedIps[0] || req.headers['x-real-ip'] || req.connection?.remoteAddress || 'unknown';

    return res.status(200).json({ ip: clientIP });
}
