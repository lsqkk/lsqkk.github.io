// api/client-info.js
module.exports = async (req, res) => {
    // 获取客户端真实IP
    const ip = req.headers['x-forwarded-for'] ||
        req.headers['x-real-ip'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress;

    // Vercel特定的头信息
    const vercelInfo = {
        ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim(),
        country: req.headers['x-vercel-ip-country'],
        region: req.headers['x-vercel-ip-country-region'],
        city: req.headers['x-vercel-ip-city'],
        latitude: req.headers['x-vercel-ip-latitude'],
        longitude: req.headers['x-vercel-ip-longitude'],
        timezone: req.headers['x-vercel-ip-timezone']
    };

    // 从User-Agent解析设备信息
    const userAgent = req.headers['user-agent'] || '';
    const deviceInfo = parseUserAgent(userAgent);

    const result = {
        ip: vercelInfo.ip || ip,
        location: {
            country: vercelInfo.country || '未知',
            region: vercelInfo.region || '未知',
            city: vercelInfo.city || '未知',
            coordinates: {
                latitude: vercelInfo.latitude,
                longitude: vercelInfo.longitude
            },
            timezone: vercelInfo.timezone
        },
        network: {
            // Cloudflare/Vercel特定的头
            cfRay: req.headers['cf-ray'],
            vercelId: req.headers['x-vercel-id']
        },
        device: deviceInfo,
        headers: {
            // 安全的头信息（过滤掉敏感信息）
            acceptLanguage: req.headers['accept-language'],
            referer: req.headers['referer'],
            origin: req.headers['origin']
        },
        timestamp: new Date().toISOString()
    };

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json(result);
};

// 简单的User-Agent解析函数
function parseUserAgent(ua) {
    const isMobile = /mobile|android|iphone|ipad|ipod/i.test(ua);
    const isTablet = /tablet|ipad/i.test(ua);
    const isDesktop = !isMobile && !isTablet;

    let browser = '未知';
    let os = '未知';

    // 浏览器检测
    if (/firefox/i.test(ua)) browser = 'Firefox';
    else if (/chrome/i.test(ua) && !/edg/i.test(ua)) browser = 'Chrome';
    else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';
    else if (/edg/i.test(ua)) browser = 'Edge';
    else if (/opera|opr/i.test(ua)) browser = 'Opera';

    // 操作系统检测
    if (/windows/i.test(ua)) os = 'Windows';
    else if (/mac os/i.test(ua)) os = 'macOS';
    else if (/linux/i.test(ua)) os = 'Linux';
    else if (/android/i.test(ua)) os = 'Android';
    else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';

    return {
        isMobile,
        isTablet,
        isDesktop,
        browser,
        os,
        raw: ua
    };
}