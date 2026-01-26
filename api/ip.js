// api/client-info-enhanced.js
const axios = require('axios');

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
                // 尝试使用多个API获取位置信息
                const locationInfo = await getLocationFromIP(clientIP);
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

        // 3. 如果还没有坐标，获取坐标
        if ((!finalLat || !finalLon) && region !== '未知') {
            try {
                const coords = await getCoordinatesFromAddress(`${region}${city}`);
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
                browser: parseUserAgent(req.headers['user-agent'] || '').browser,
                os: parseUserAgent(req.headers['user-agent'] || '').os,
                isMobile: parseUserAgent(req.headers['user-agent'] || '').isMobile
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

// 从IP获取地理位置（使用免费API）
async function getLocationFromIP(ip) {
    // 使用多个免费API，按优先级尝试
    const apis = [
        {
            url: `https://api.ip.sb/geoip/${ip}`,
            parser: (data) => ({
                province: data.region,
                city: data.city,
                latitude: data.latitude,
                longitude: data.longitude
            })
        },
        {
            url: `https://ipwho.is/${ip}`,
            parser: (data) => ({
                province: data.region,
                city: data.city,
                latitude: data.latitude,
                longitude: data.longitude
            })
        },
        {
            url: `https://ipapi.co/${ip}/json/`,
            parser: (data) => ({
                province: data.region,
                city: data.city,
                latitude: data.latitude,
                longitude: data.longitude
            })
        }
    ];

    for (const api of apis) {
        try {
            const response = await axios.get(api.url, { timeout: 3000 });
            if (response.data && response.data.country_code === 'CN') {
                return api.parser(response.data);
            }
        } catch (error) {
            continue; // 尝试下一个API
        }
    }

    return null;
}

// 从地址获取坐标
async function getCoordinatesFromAddress(address) {
    if (!address || address === '未知') return null;

    try {
        // 使用OpenStreetMap Nominatim
        const response = await axios.get(
            `https://nominatim.openstreetmap.org/search`,
            {
                params: {
                    q: address,
                    format: 'json',
                    limit: 1
                },
                headers: {
                    'User-Agent': 'LSQKK-GeoService/1.0'
                },
                timeout: 5000
            }
        );

        if (response.data && response.data.length > 0) {
            return {
                lat: response.data[0].lat,
                lon: response.data[0].lon
            };
        }
    } catch (error) {
        console.warn('地址转坐标失败:', error.message);
    }

    return null;
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