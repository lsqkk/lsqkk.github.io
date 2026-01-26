// api/client-info-enhanced.js
module.exports = async (req, res) => {
    // 设置CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    try {
        // 获取客户端真实IP（注意：x-forwarded-for第一个是Vercel节点IP，第二个才是客户端IP）
        const forwardedIps = req.headers['x-forwarded-for']?.split(',') || [];
        const clientIP = forwardedIps.length > 1
            ? forwardedIps[1].trim()  // 第二个是真实客户端IP
            : forwardedIps[0]?.trim() ||
            req.headers['x-real-ip'] ||
            req.connection.remoteAddress ||
            'unknown';

        console.log('原始IP信息:', {
            'x-forwarded-for': req.headers['x-forwarded-for'],
            'x-real-ip': req.headers['x-real-ip'],
            'clientIP': clientIP
        });

        // 使用IP直接查询真实地理位置（不使用Vercel头信息）
        const ipInfo = await getAccurateLocationFromIP(clientIP);

        if (ipInfo) {
            // 计算距离（西安坐标）
            const bloggerLat = 34.252705;
            const bloggerLon = 108.990221;
            let distance = '未知';

            if (ipInfo.latitude && ipInfo.longitude) {
                distance = calculateDistance(
                    bloggerLat, bloggerLon,
                    parseFloat(ipInfo.latitude), parseFloat(ipInfo.longitude)
                ).toFixed(2);
            }

            // 解析User-Agent
            const userAgent = req.headers['user-agent'] || '';
            const deviceInfo = parseUserAgent(userAgent);

            // 返回准确信息
            const result = {
                ip: clientIP,
                location: {
                    country: ipInfo.country || '中国',
                    region: ipInfo.province || '未知',
                    city: ipInfo.city || '未知',
                    latitude: ipInfo.latitude,
                    longitude: ipInfo.longitude,
                    isp: ipInfo.isp || '未知',
                    source: ipInfo.source || 'IP查询API'
                },
                distance: {
                    value: distance,
                    unit: '公里',
                    bloggerLocation: {
                        city: '西安',
                        latitude: bloggerLat,
                        longitude: bloggerLon
                    }
                },
                userAgent: {
                    browser: deviceInfo.browser,
                    os: deviceInfo.os,
                    isMobile: deviceInfo.isMobile
                },
                timestamp: new Date().toISOString(),
                debug: {
                    originalForwardedFor: req.headers['x-forwarded-for'],
                    vercelCity: req.headers['x-vercel-ip-city'],
                    isChina: ipInfo.country_code === 'CN'
                }
            };

            res.status(200).json(result);
        } else {
            throw new Error('无法获取地理位置信息');
        }

    } catch (error) {
        console.error('处理请求失败:', error);
        res.status(500).json({
            error: '内部服务器错误',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
};

// 准确获取IP地理位置（不使用Vercel头信息）
async function getAccurateLocationFromIP(ip) {
    // 排除内网IP
    if (isPrivateIP(ip)) {
        return {
            country: '中国',
            province: '内网',
            city: '本地网络',
            isp: 'LAN',
            source: '内网IP'
        };
    }

    // 按优先级尝试多个准确的IP查询API
    const apiPromises = [
        queryIPSB(ip),
        queryIPAPI(ip),
        queryIPWhoIs(ip),
        queryIPGeolocation(ip)
    ];

    // 等待所有API响应，选择最准确的结果
    const results = await Promise.allSettled(apiPromises);

    for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
            const data = result.value;
            // 优先选择中国地区且有城市信息的结果
            if (data.country_code === 'CN' && data.city && data.city !== 'Unknown') {
                console.log('选择API结果:', data.source, data.city);
                return data;
            }
        }
    }

    // 如果没有找到准确结果，返回第一个有效结果
    for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
            return result.value;
        }
    }

    return null;
}

// 查询api.ip.sb（最准确的中国IP库）
async function queryIPSB(ip) {
    try {
        const response = await fetchWithTimeout(`https://api.ip.sb/geoip/${ip}`, 3000);
        const data = JSON.parse(response);

        if (data && data.ip) {
            return {
                ip: data.ip,
                country: data.country || '未知',
                country_code: data.country_code || '未知',
                province: data.region || '未知',
                city: data.city || '未知',
                latitude: data.latitude,
                longitude: data.longitude,
                isp: data.isp || '未知',
                source: 'ip.sb'
            };
        }
    } catch (error) {
        console.warn('ip.sb查询失败:', error.message);
    }
    return null;
}

// 查询ipapi.co
async function queryIPAPI(ip) {
    try {
        const response = await fetchWithTimeout(`https://ipapi.co/${ip}/json/`, 3000);
        const data = JSON.parse(response);

        if (data && data.ip) {
            return {
                ip: data.ip,
                country: data.country_name || '未知',
                country_code: data.country_code || '未知',
                province: data.region || data.region_code || '未知',
                city: data.city || '未知',
                latitude: data.latitude,
                longitude: data.longitude,
                isp: data.org || '未知',
                source: 'ipapi.co'
            };
        }
    } catch (error) {
        console.warn('ipapi.co查询失败:', error.message);
    }
    return null;
}

// 查询ipwho.is
async function queryIPWhoIs(ip) {
    try {
        const response = await fetchWithTimeout(`https://ipwho.is/${ip}`, 3000);
        const data = JSON.parse(response);

        if (data && data.success) {
            return {
                ip: data.ip,
                country: data.country || '未知',
                country_code: data.country_code || '未知',
                province: data.region || '未知',
                city: data.city || '未知',
                latitude: data.latitude,
                longitude: data.longitude,
                isp: data.connection?.isp || '未知',
                source: 'ipwho.is'
            };
        }
    } catch (error) {
        console.warn('ipwho.is查询失败:', error.message);
    }
    return null;
}

// 查询ipgeolocation.io（备用）
async function queryIPGeolocation(ip) {
    try {
        const response = await fetchWithTimeout(`https://api.ipgeolocation.io/ipgeo?apiKey=demo&ip=${ip}`, 3000);
        const data = JSON.parse(response);

        if (data && data.ip) {
            return {
                ip: data.ip,
                country: data.country_name || '未知',
                country_code: data.country_code2 || '未知',
                province: data.state_prov || '未知',
                city: data.city || '未知',
                latitude: data.latitude,
                longitude: data.longitude,
                isp: data.isp || '未知',
                source: 'ipgeolocation'
            };
        }
    } catch (error) {
        console.warn('ipgeolocation查询失败:', error.message);
    }
    return null;
}

// 检查是否为私有IP
function isPrivateIP(ip) {
    if (!ip) return false;

    // IPv4私有地址范围
    const ipParts = ip.split('.').map(Number);
    if (ipParts.length !== 4) return false;

    // 10.0.0.0/8
    if (ipParts[0] === 10) return true;

    // 172.16.0.0/12
    if (ipParts[0] === 172 && ipParts[1] >= 16 && ipParts[1] <= 31) return true;

    // 192.168.0.0/16
    if (ipParts[0] === 192 && ipParts[1] === 168) return true;

    // 127.0.0.0/8
    if (ipParts[0] === 127) return true;

    return false;
}

// 原生fetch实现
async function fetchWithTimeout(url, timeout = 5000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; LSQKK-GeoService/1.0)'
            }
        });

        clearTimeout(id);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        return await response.text();
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
}

// 计算距离
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// 解析User-Agent
function parseUserAgent(ua) {
    const isMobile = /mobile|android|iphone|ipad|ipod/i.test(ua);
    const isTablet = /tablet|ipad/i.test(ua);
    const isDesktop = !isMobile && !isTablet;

    let browser = '未知';
    let os = '未知';

    if (/firefox/i.test(ua)) browser = 'Firefox';
    else if (/chrome/i.test(ua) && !/edg/i.test(ua)) browser = 'Chrome';
    else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';
    else if (/edg/i.test(ua)) browser = 'Edge';
    else if (/opera|opr/i.test(ua)) browser = 'Opera';

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
        os
    };
}