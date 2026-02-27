// /api/ip.js - 返回客户端IP（用于上传限流）
export default function handler(req, res) {
    const allowedDomains = ['localhost:8000', 'lsqkk.github.io', 'api.130923.xyz'];
    let isAllowed = false;
    let requestOrigin = '';

    const referer = req.headers.referer || req.headers.referrer;
    const origin = req.headers.origin;

    if (origin) {
        try {
            const originUrl = new URL(origin);
            if (allowedDomains.some(domain => originUrl.host === domain)) {
                isAllowed = true;
                requestOrigin = originUrl.origin;
            }
        } catch (e) {
            console.error('解析Origin出错:', e);
        }
    }

    if (!isAllowed && referer) {
        try {
            const refererUrl = new URL(referer);
            if (allowedDomains.some(domain => refererUrl.host === domain)) {
                isAllowed = true;
                requestOrigin = refererUrl.origin;
            }
        } catch (e) {
            console.error('解析Referer出错:', e);
        }
    }

    res.setHeader('Access-Control-Allow-Origin', isAllowed ? requestOrigin : 'false');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (!isAllowed) {
        return res.status(403).json({
            error: 'Forbidden',
            debug: {
                receivedOrigin: origin,
                receivedReferer: referer,
                allowedDomains
            }
        });
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
