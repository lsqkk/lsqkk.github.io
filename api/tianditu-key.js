// /api/tianditu-key.js
export default function handler(req, res) {
    // 1. 处理 CORS 和 OPTIONS 预检请求
    const allowedOrigins = ['http://localhost:8080', 'https://lsqkk.github.io'];
    const requestOrigin = req.headers.origin;

    let isOriginAllowed = false;
    if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
        isOriginAllowed = true;
    }

    res.setHeader('Access-Control-Allow-Origin', isOriginAllowed ? requestOrigin : 'false');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // 2. 仅允许 GET 方法
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // 3. 【可选】Referer安全检查（可与你的其他API保持一致）
    const referer = req.headers.referer || req.headers.referrer;
    const allowedDomains = ['localhost', 'lsqkk.github.io'];
    let isRefererAllowed = false;
    if (referer) {
        try {
            const refererUrl = new URL(referer);
            if (allowedDomains.some(domain => refererUrl.hostname.includes(domain))) {
                isRefererAllowed = true;
            }
        } catch (e) { }
    }
    // 如果不需要严格的二次验证，可以注释掉下面的403检查
    /*
    if (!isOriginAllowed && !isRefererAllowed) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    */

    // 4. 从环境变量读取天地图密钥
    const tiandituKey = process.env.TIANDITU_KEY;

    if (!tiandituKey) {
        console.error('TIANDITU_KEY 环境变量未设置');
        return res.status(500).json({ error: 'Server configuration error' });
    }

    // 5. 返回纯JavaScript代码，将密钥设置为全局变量
    const jsContent = `window.TIANDITU_KEY = "${tiandituKey}";`;

    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 缓存24小时，因为密钥基本不变
    res.send(jsContent);
}