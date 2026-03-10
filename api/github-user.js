// /api/github-user.js - 通过 GitHub OAuth code 获取用户信息
export default async function handler(req, res) {
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

    const code = req.query?.code;
    if (!code) {
        return res.status(400).json({ error: 'Missing code' });
    }

    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        return res.status(500).json({ error: 'Server configuration error' });
    }

    try {
        const tokenResp = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                client_id: clientId,
                client_secret: clientSecret,
                code: String(code)
            })
        });

        const tokenData = await tokenResp.json();
        const accessToken = tokenData.access_token;
        if (!accessToken) {
            return res.status(401).json({ error: 'Invalid code', detail: tokenData });
        }

        const userResp = await fetch('https://api.github.com/user', {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/vnd.github+json'
            }
        });
        if (!userResp.ok) {
            return res.status(userResp.status).json({ error: 'GitHub user fetch failed' });
        }
        const user = await userResp.json();

        return res.json({
            login: user.login,
            name: user.name,
            avatar_url: user.avatar_url,
            html_url: user.html_url
        });
    } catch (error) {
        console.error('GitHub OAuth 失败:', error);
        return res.status(500).json({ error: 'OAuth failed' });
    }
}
