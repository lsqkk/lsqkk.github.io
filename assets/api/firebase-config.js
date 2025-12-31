// /api/firebase-config.js
export default function handler(req, res) {
    // 1. 获取请求来源
    const referer = req.headers.referer || req.headers.referrer;
    const origin = req.headers.origin;

    // 2. 允许的域名列表（请根据你的实际情况修改）
    const allowedDomains = ['localhost', 'lsqkk.github.io'];
    // 提示：你可以在这里添加你本地开发用的地址，如 '127.0.0.1:5500'

    // 3. 检查来源是否在白名单内
    let isAllowed = false;
    let requestOrigin = '';

    // 优先检查 Origin 头 (适用于fetch、axios等API请求)
    if (origin) {
        try {
            const originUrl = new URL(origin);
            if (allowedDomains.some(domain => originUrl.hostname.includes(domain))) {
                isAllowed = true;
                requestOrigin = origin; // 记录通过的origin，用于CORS设置
            }
        } catch (e) { console.error('Origin解析错误:', e); }
    }
    // 其次检查 Referer 头 (适用于<script>标签引入)
    if (!isAllowed && referer) {
        try {
            const refererUrl = new URL(referer);
            if (allowedDomains.some(domain => refererUrl.hostname.includes(domain))) {
                isAllowed = true;
                requestOrigin = refererUrl.origin;
            }
        } catch (e) { console.error('Referer解析错误:', e); }
    }

    // 4. 如果不在白名单，返回403禁止访问
    if (!isAllowed) {
        console.warn(`非法来源访问被阻止: `, { referer, origin });
        return res.status(403).json({ error: 'Forbidden' });
    }

    // 5. 这是你的Firebase配置
    const firebaseConfig = {
        apiKey: process.env.FIREBASE_API_KEY,
        authDomain: process.env.FIREBASE_AUTH_DOMAIN,
        databaseURL: process.env.FIREBASE_DATABASE_URL,
        projectId: process.env.FIREBASE_PROJECT_ID,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.FIREBASE_APP_ID,
        measurementId: process.env.FIREBASE_MEASUREMENT_ID
    };

    // 6. 返回JavaScript代码，将配置设置为全局变量
    // 同时根据通过的来源动态设置CORS头，避免跨域问题
    const jsContent = `window.firebaseConfig = ${JSON.stringify(firebaseConfig, null, 2)};`;

    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    // 动态设置允许访问的Origin，避免跨域错误
    if (requestOrigin) {
        res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    }
    res.setHeader('Cache-Control', 'public, max-age=3600'); // 缓存1小时
    res.send(jsContent);
}