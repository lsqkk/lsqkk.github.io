// /api/admin-auth.js - 完整版本 (包含CORS和预检请求处理)
export default async function handler(req, res) {
    // ----- 1. 处理 CORS 和 OPTIONS 预检请求 -----
    // 定义允许访问的源（你的前端页面所在的域名）
    const allowedOrigins = ['localhost:8000', 'lsqkk.github.io'];
    const requestOrigin = req.headers.origin;

    // 检查请求来源是否在白名单中
    let isOriginAllowed = false;
    if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
        isOriginAllowed = true;
    }

    // 设置 CORS 响应头。如果来源被允许，则动态设置；否则可以省略或设为 false。
    res.setHeader('Access-Control-Allow-Origin', isOriginAllowed ? requestOrigin : 'false');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // 如果请求方法是 OPTIONS，立即返回成功响应，结束处理（这是预检请求）
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // ----- 2. 安全检查（仅针对 POST 请求）-----
    // 非 POST 请求不予处理
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // 【可选但推荐】额外的Referer安全检查（如果OPTIONS预检通过，浏览器才会发送POST，但此处可做二次验证）
    const referer = req.headers.referer || req.headers.referrer;
    const allowedDomains = ['localhost', 'lsqkk.github.io'];
    let isRefererAllowed = false;
    if (referer) {
        try {
            const refererUrl = new URL(referer);
            if (allowedDomains.some(domain => refererUrl.hostname.includes(domain))) {
                isRefererAllowed = true;
            }
        } catch (e) { /* 忽略解析错误 */ }
    }
    // 如果来源和Referer都不允许，可以拒绝请求（注意：Origin检查已通过CORS头处理，这里是第二层防御）
    // 为了调试，你可以暂时注释掉下面的403检查，先确保登录流程畅通。
    /*
    if (!isOriginAllowed && !isRefererAllowed) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    */

    // ----- 3. 核心的密码验证逻辑 -----
    try {
        // 获取前端传来的 JSON 数据
        const { passwordHash } = req.body; // 注意：Vercel Serverless Functions 中，req.body 可能需要根据框架解析

        // 为了兼容性，建议使用以下方式解析 body (如果 req.body 不是对象)
        let body;
        try {
            body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        } catch (e) {
            return res.status(400).json({ error: 'Invalid JSON format' });
        }
        const submittedHash = body.passwordHash;

        if (!submittedHash || submittedHash.length !== 64) {
            return res.status(400).json({ error: 'Invalid request data' });
        }

        // 从环境变量读取正确的哈希
        const correctHash = process.env.ADMIN_PASSWORD_HASH;

        // 恒定时间比较（防止计时攻击）
        let isCorrect = true;
        if (!correctHash || submittedHash.length !== correctHash.length) {
            isCorrect = false;
        } else {
            // 只有在长度一致时才逐字符比较
            for (let i = 0; i < submittedHash.length; i++) {
                if (submittedHash[i] !== correctHash[i]) {
                    isCorrect = false;
                }
            }
        }

        // 返回验证结果
        if (isCorrect) {
            return res.status(200).json({ success: true, message: 'Authentication successful' });
        } else {
            return res.status(401).json({ success: false, error: 'Authentication failed' });
        }

    } catch (error) {
        console.error('Auth API error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}