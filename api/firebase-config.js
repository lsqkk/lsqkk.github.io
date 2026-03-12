export default function handler(req, res) {
    // 1. 获取请求来源
    const referer = req.headers.referer || req.headers.referrer;
    const origin = req.headers.origin;
    const allowedDomains = ['localhost:8000', 'lsqkk.github.io', 'api.130923.xyz'];
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
        const hasOriginOrReferer = Boolean(origin || referer);
        if (hasOriginOrReferer) {
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
        // 允许无 Origin/Referer（如 referrer-policy: no-referrer 的脚本请求）
        isAllowed = true;
    }

    // 2. 从环境变量读取配置
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

    // 3. 返回纯JavaScript代码，这是关键！
    const jsContent = [
        `window.firebaseConfig = ${JSON.stringify(firebaseConfig, null, 2)};`,
        `try { window.dispatchEvent(new CustomEvent('firebase-config-loaded', { detail: window.firebaseConfig })); } catch (e) { }`,
        `if (!window.firebase || !window.firebase.database) {`,
        `  var s = document.createElement('script');`,
        `  s.src = window.location.origin + '/assets/js/firebase-shim.js';`,
        `  s.async = true;`,
        `  document.head.appendChild(s);`,
        `}`
    ].join('\n');

    // 4. 设置正确的响应头
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    if (requestOrigin) {
        res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    }
    res.setHeader('Cache-Control', 'no-store');
    res.send(jsContent);
}
