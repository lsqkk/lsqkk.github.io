// /api/tianditu-key.js - 完整版本 (带严格来源验证)
export default function handler(req, res) {
    // 1. 定义允许的来源域名列表（精确匹配主机名）
    const allowedDomains = ['localhost:8000', 'lsqkk.github.io'];
    let isAllowed = false;
    let requestOrigin = '';

    // 2. 获取请求来源
    const referer = req.headers.referer || req.headers.referrer;
    const origin = req.headers.origin;

    // 3. 处理 CORS 和 OPTIONS 预检请求
    // 首先检查 Origin 头
    if (origin) {
        try {
            const originUrl = new URL(origin);
            // 精确匹配主机名
            if (allowedDomains.some(domain => originUrl.host === domain)) {
                isAllowed = true;
                requestOrigin = originUrl.origin; // 包含协议和端口
            }
        } catch (e) {
            console.error('解析Origin出错:', e);
        }
    }

    // 其次检查 Referer 头
    if (!isAllowed && referer) {
        try {
            const refererUrl = new URL(referer);
            // 精确匹配主机名
            if (allowedDomains.some(domain => refererUrl.host === domain)) {
                isAllowed = true;
                requestOrigin = refererUrl.origin;
            }
        } catch (e) {
            console.error('解析Referer出错:', e);
        }
    }

    // 4. 设置 CORS 响应头
    res.setHeader('Access-Control-Allow-Origin', isAllowed ? requestOrigin : 'false');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // 5. 处理 OPTIONS 预检请求
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // 6. 来源验证失败处理
    if (!isAllowed) {
        console.warn(`非法来源访问被阻止:`, { origin, referer, allowedDomains });
        return res.status(403).json({
            error: 'Forbidden',
            debug: {
                receivedOrigin: origin,
                receivedReferer: referer,
                allowedDomains: allowedDomains
            }
        });
    }

    // 7. 仅允许 GET 方法
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // 8. 从环境变量读取天地图密钥
    const tiandituKey = process.env.TIANDITU_KEY;

    if (!tiandituKey) {
        console.error('TIANDITU_KEY 环境变量未设置');
        return res.status(500).json({ error: 'Server configuration error' });
    }

    // 9. 返回纯JavaScript代码，将密钥设置为全局变量
    const jsContent = `window.TIANDITU_KEY = "${tiandituKey}";`;

    // 10. 设置响应头
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 缓存24小时，因为密钥基本不变

    // 记录成功访问（可选）
    console.log(`密钥请求成功，来源: ${requestOrigin}`);

    res.send(jsContent);
}