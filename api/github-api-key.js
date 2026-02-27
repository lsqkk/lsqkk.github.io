// /api/github-api-key.js - 返回 GitHub Token 的 JS（带来源验证）
export default function handler(req, res) {
    const allowedDomains = ['localhost:8000', 'lsqkk.github.io'];
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
        console.warn('非法来源访问被阻止:', { origin, referer, allowedDomains });
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

    const githubApiKey = process.env.GITHUB_API_KEY;
    if (!githubApiKey) {
        console.error('GITHUB_API_KEY 环境变量未设置');
        return res.status(500).json({ error: 'Server configuration error' });
    }

    const jsContent = `window.GITHUB_API_KEY = "${githubApiKey}";`;

    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    console.log(`GitHub Token 请求成功，来源: ${requestOrigin}`);
    return res.send(jsContent);
}
