// /api/admin-auth.js
export default async function handler(req, res) {
    console.log(`[Admin Auth] 收到请求:`, {
        method: req.method,
        path: req.url,
        origin: req.headers.origin,
        referer: req.headers.referer,
        ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress
    });

    // 1. 只允许 POST 方法

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // 2. 检查来源（复用你的安全检查逻辑，此处简化示意）
    // 1. 获取请求来源
    const referer = req.headers.referer || req.headers.referrer;
    const origin = req.headers.origin;
    const allowedDomains = ['localhost', 'lsqkk.github.io', 'api.lsqkk.space'];
    let isAllowed = false;
    let requestOrigin = '';

    if (origin) {
        try {
            const originUrl = new URL(origin);
            if (allowedDomains.some(domain => originUrl.hostname.includes(domain))) {
                isAllowed = true;
                requestOrigin = origin;
            }
        } catch (e) { }
    }
    if (!isAllowed && referer) {
        try {
            const refererUrl = new URL(referer);
            if (allowedDomains.some(domain => refererUrl.hostname.includes(domain))) {
                isAllowed = true;
                requestOrigin = refererUrl.origin;
            }
        } catch (e) { }
    }

    // 在 if (!isAllowed) { 代码块内，修改为：
    if (!isAllowed) {
        // 将调试信息返回，方便查看
        return res.status(403).json({
            error: 'Forbidden',
            debug: {
                receivedOrigin: origin,
                receivedReferer: referer,
                allowedDomains: allowedDomains
            }
        });
    }
    try {
        // 3. 获取前端传来的密码哈希
        const { passwordHash } = await req.body();

        if (!passwordHash || passwordHash.length !== 64) { // SHA-256哈希长度为64
            return res.status(400).json({ error: 'Invalid request data' });
        }

        // 4. 从环境变量读取正确的哈希
        const correctHash = process.env.ADMIN_PASSWORD_HASH;

        // 5. 使用恒定时间比较来防止计时攻击
        let isCorrect = true;
        if (passwordHash.length !== correctHash.length) {
            isCorrect = false;
        }
        for (let i = 0; i < Math.max(passwordHash.length, correctHash.length); i++) {
            if (passwordHash[i] !== correctHash[i]) {
                isCorrect = false;
            }
        }

        // 6. 返回验证结果
        if (isCorrect) {
            // 登录成功！你可以在这里生成一个JWT或Session Token返回，用于后续其他管理员操作的身份验证。
            // 目前先返回一个成功状态。
            return res.status(200).json({ success: true, message: 'Authentication successful' });
        } else {
            return res.status(401).json({ success: false, error: 'Authentication failed' });
        }

    } catch (error) {
        console.error('Auth API error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}