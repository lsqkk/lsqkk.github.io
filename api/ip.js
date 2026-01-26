
module.exports = async (req, res) => {
    // 设置CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    try {
        // 获取客户端IP
        const clientIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
            req.headers['x-real-ip'] ||
            req.connection.remoteAddress ||
            'unknown';

        // 获取Vercel地理位置头信息
        const vercelCountry = req.headers['x-vercel-ip-country'];
        const vercelCity = req.headers['x-vercel-ip-city'];
        const latitude = req.headers['x-vercel-ip-latitude'];
        const longitude = req.headers['x-vercel-ip-longitude'];

        let region = '未知';
        let city = '未知';
        let finalLat = latitude;
        let finalLon = longitude;

        // 1. 首先使用Vercel头信息
        if (vercelCity && vercelCity !== 'unknown') {
            const cityParts = vercelCity.split('-');
            if (cityParts.length > 1) {
                region = cityParts[0];
                city = cityParts[1];
            } else {
                city = vercelCity;
                region = '未知';
            }
        }

        // 2. 如果Vercel信息不足，使用其他API查询
        if (region === '未知' || city === '未知') {
            try {
                // 使用原生fetch查询IP位置
                const locationInfo = await fetchIPLocation(clientIP);
                if (locationInfo) {
                    region = locationInfo.province || region;
                    city = locationInfo.city || city;
                    finalLat = locationInfo.latitude || finalLat;
                    finalLon = locationInfo.longitude || finalLon;
                }
            } catch (error) {
                console.warn('IP定位API查询失败:', error.message);
            }
        }

        // 3. 如果还没有坐标，且知道省份城市，尝试获取坐标
        if ((!finalLat || !finalLon) && region !== '未知' && city !== '未知') {
            try {
                const coords = await fetchCoordinates(`${region}${city}`);
                if (coords) {
                    finalLat = coords.lat;
                    finalLon = coords.lon;
                }
            } catch (error) {
                console.warn('坐标查询失败:', error.message);
            }
        }

        // 4. 计算距离（西安坐标）
        const bloggerLat = 34.252705;
        const bloggerLon = 108.990221;
        let distance = '未知';

        if (finalLat && finalLon) {
            distance = calculateDistance(
                bloggerLat, bloggerLon,
                parseFloat(finalLat), parseFloat(finalLon)
            ).toFixed(2);
        }

        // 解析User-Agent
        const userAgent = req.headers['user-agent'] || '';
        const deviceInfo = parseUserAgent(userAgent);

        // 返回完整信息
        const result = {
            ip: clientIP,
            location: {
                country: vercelCountry === 'CN' ? '中国' : vercelCountry || '未知',
                region: region,
                city: city,
                latitude: finalLat,
                longitude: finalLon
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
            timestamp: new Date().toISOString()
        };

        res.status(200).json(result);

    } catch (error) {
        console.error('处理请求失败:', error);
        res.status(500).json({
            error: '内部服务器错误',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
};

// 原生fetch函数
async function fetchIPLocation(ip) {
    const apis = [
        `https://api.ip.sb/geoip/${ip}`,
        `https://ipwho.is/${ip}`,
        `https://ipapi.co/${ip}/json/`
    ];

    for (const apiUrl of apis) {
        try {
            const response = await fetchWithTimeout(apiUrl, 3000);
            const data = JSON.parse(response);

            if (data && data.country_code === 'CN') {
                return {
                    province: data.region || data.province,
                    city: data.city,
                    latitude: data.latitude,
                    longitude: data.longitude
                };
            }
        } catch (error) {
            continue;
        }
    }

    return null;
}

// 获取坐标
async function fetchCoordinates(address) {
    if (!address || address === '未知') return null;

    try {
        // 使用OpenStreetMap Nominatim
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
        const response = await fetchWithTimeout(url, 5000, {
            'User-Agent': 'LSQKK-GeoService/1.0'
        });

        const data = JSON.parse(response);
        if (data && data.length > 0) {
            return {
                lat: data[0].lat,
                lon: data[0].lon
            };
        }
    } catch (error) {
        // 静默失败
    }

    return null;
}

// 原生fetch实现（Vercel环境支持原生fetch）
async function fetchWithTimeout(url, timeout = 5000, headers = {}) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: headers
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

// 计算两个坐标点之间的距离（公里）
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // 地球半径（公里）
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