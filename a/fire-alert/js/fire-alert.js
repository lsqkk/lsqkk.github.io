// Firebase配置
const firebaseConfig = {
    apiKey: "AIzaSyAeSI1akqwsPBrVyv7YKirV06fqdkL3YNI",
    authDomain: "quark-b7305.firebaseapp.com",
    projectId: "quark-b7305",
    storageBucket: "quark-b7305.firebasestorage.app",
    messagingSenderId: "843016834358",
    appId: "1:843016834358:web:9438c729be28c4d492f797",
    measurementId: "G-5BVT26KRT6"
};

// 初始化Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// 全局变量
let map, currentLocation, weatherData, fireRiskLevel;
const firesRef = firebase.database().ref('fire-alert/fires');
const alertsRef = firebase.database().ref('fire-alert/alerts');

// 检查天地图API是否加载完成
function waitForTMap() {
    return new Promise((resolve, reject) => {
        const checkT = () => {
            if (window.T) {
                resolve();
            } else {
                setTimeout(checkT, 100);
            }
        };
        checkT();

        // 10秒超时
        setTimeout(() => reject(new Error('天地图API加载超时')), 10000);
    });
}

// 主初始化函数
document.addEventListener('DOMContentLoaded', function () {
    initSystem();
    setInterval(updateSystem, 30000); // 每30秒更新一次
});

async function initSystem() {
    try {
        await waitForTMap(); // 等待天地图API加载完成
        await initMap();
        await getCurrentLocation();
        await loadWeatherData();
        calculateFireRisk();
        loadFireData();
        loadAlerts();
        updateDecisionSupport();
        updateTime();
    } catch (error) {
        console.error('系统初始化失败:', error);
        document.getElementById('currentLocation').textContent = '系统初始化失败';
    }
}

// 初始化天地图
function initMap() {
    return new Promise((resolve, reject) => {
        try {
            // 创建地图实例
            map = new T.Map('fireMap');

            // 设置地图中心和缩放级别
            const center = new T.LngLat(108.990221, 34.252705); // 西安坐标
            map.centerAndZoom(center, 10);

            // 添加卫星图层
            const satelliteLayer = new T.TileLayer('img_w', {
                minZoom: 3,
                maxZoom: 18
            });
            map.addLayer(satelliteLayer);

            // 添加标注图层
            const markerLayer = new T.TileLayer('cia_w', {
                minZoom: 3,
                maxZoom: 18
            });
            map.addLayer(markerLayer);

            console.log('天地图初始化成功');
            resolve();
        } catch (error) {
            console.error('地图初始化失败:', error);
            reject(error);
        }
    });
}

// 获取当前位置
async function getCurrentLocation() {
    return new Promise((resolve) => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                async (position) => {
                    currentLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };

                    // 获取位置信息
                    try {
                        const locationInfo = await getLocationInfo(currentLocation.lat, currentLocation.lng);
                        document.getElementById('currentLocation').textContent =
                            `${locationInfo.province} ${locationInfo.city}`;
                    } catch (error) {
                        document.getElementById('currentLocation').textContent = '定位成功';
                    }

                    // 移动地图到当前位置
                    if (map) {
                        const center = new T.LngLat(currentLocation.lng, currentLocation.lat);
                        map.centerAndZoom(center, 12);

                        // 添加当前位置标记
                        addCurrentLocationMarker();
                    }
                    resolve();
                },
                async (error) => {
                    console.log('GPS定位失败:', error);
                    // 定位失败时使用IP定位
                    try {
                        const ipInfo = await getIPLocation();
                        currentLocation = {
                            lat: ipInfo.latitude_3,
                            lng: ipInfo.longitude_3
                        };
                        document.getElementById('currentLocation').textContent =
                            `${ipInfo.province_name_3} ${ipInfo.city_name_3}`;

                        if (map) {
                            const center = new T.LngLat(currentLocation.lng, currentLocation.lat);
                            map.centerAndZoom(center, 10);
                            addCurrentLocationMarker();
                        }
                    } catch (ipError) {
                        console.error('IP定位失败:', ipError);
                        document.getElementById('currentLocation').textContent = '定位失败';
                    }
                    resolve();
                }
            );
        } else {
            console.log('浏览器不支持地理定位');
            resolve();
        }
    });
}

// 添加当前位置标记
function addCurrentLocationMarker() {
    if (!map || !currentLocation) return;

    // 清除现有标记
    map.clearOverLays();

    // 创建图标
    const icon = new T.Icon({
        iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJDNy41ODIgMiA0IDUuNTgyIDQgMTBDNCAxNS4wMTggNy4wNDYgMTkuNDUgMTIgMjJDMTAuOTU0IDIyLjY3IDggMjIgOCAyMkM4IDIyIDE2IDIwIDE2IDEwQzE2IDUuNTgyIDEyLjQxOCAyIDEyIDJaIiBmaWxsPSIjMzE4MmNlIi8+CjxjaXJjbGUgY3g9IjEyIiBjeT0iMTAiIHI9IjMiIGZpbGw9IndoaXRlIi8+Cjwvc3ZnPg==',
        iconSize: new T.Point(24, 24),
        iconAnchor: new T.Point(12, 24)
    });

    const marker = new T.Marker(new T.LngLat(currentLocation.lng, currentLocation.lat), {
        icon: icon
    });

    marker.addEventListener('click', () => {
        alert('这是您的当前位置');
    });

    map.addOverLay(marker);
}

// IP定位
async function getIPLocation() {
    try {
        const response = await fetch('https://api.b52m.cn/api/IP/?key=60606913cdba7c');
        const data = await response.json();
        if (data.code === 200) {
            return data.data;
        }
        throw new Error('IP定位失败');
    } catch (error) {
        // 备用IP定位服务
        try {
            const response = await fetch('https://ipapi.co/json/');
            const data = await response.json();
            return {
                province_name_3: data.region,
                city_name_3: data.city,
                latitude_3: data.latitude,
                longitude_3: data.longitude
            };
        } catch (fallbackError) {
            throw new Error('所有定位服务都失败了');
        }
    }
}

// 获取详细位置信息
async function getLocationInfo(lat, lng) {
    // 使用逆地理编码获取位置信息
    return new Promise((resolve, reject) => {
        if (!window.T) {
            reject(new Error('天地图API未加载'));
            return;
        }

        const geocoder = new T.Geocoder();
        const point = new T.LngLat(lng, lat);

        geocoder.getLocation(point, (result) => {
            if (result && result.addressComponent) {
                resolve({
                    province: result.addressComponent.province,
                    city: result.addressComponent.city
                });
            } else {
                reject(new Error('逆地理编码失败'));
            }
        });
    });
}

// 加载天气数据
async function loadWeatherData() {
    if (!currentLocation) {
        // 如果没有当前位置，使用默认位置（西安）
        currentLocation = { lat: 34.252705, lng: 108.990221 };
    }

    try {
        const API_KEY = '271d3f7012a6dc06a07cea3d08888fb1';
        const response = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?lat=${currentLocation.lat}&lon=${currentLocation.lng}&appid=${API_KEY}&units=metric&lang=zh_cn`
        );

        if (response.ok) {
            weatherData = await response.json();
            updateWeatherDisplay();
        } else {
            throw new Error('天气API请求失败');
        }
    } catch (error) {
        console.error('天气数据加载失败:', error);
        // 使用模拟数据
        weatherData = {
            main: { temp: 25, humidity: 40, feels_like: 26 },
            wind: { speed: 3.5 },
            weather: [{ description: '晴' }]
        };
        updateWeatherDisplay();
    }
}

// 更新天气显示
function updateWeatherDisplay() {
    if (weatherData) {
        document.getElementById('temperature').textContent = `${Math.round(weatherData.main.temp)} °C`;
        document.getElementById('humidity').textContent = `${weatherData.main.humidity} %`;
        document.getElementById('windSpeed').textContent = `${weatherData.wind.speed} m/s`;

        // 计算干旱指数（简化版）
        const droughtIndex = calculateDroughtIndex(weatherData);
        document.getElementById('droughtIndex').textContent = droughtIndex.toFixed(1);
    }
}

// 计算火险等级
function calculateFireRisk() {
    if (!weatherData) {
        // 使用默认值
        updateRiskDisplay(30, '低风险', 'fire-risk-low', 25);
        return;
    }

    const temp = weatherData.main.temp;
    const humidity = weatherData.main.humidity;
    const windSpeed = weatherData.wind.speed;

    // 简化版火险指数计算
    let fireRisk = (temp * 0.3) + ((100 - humidity) * 0.4) + (windSpeed * 2);

    // 调整风险等级
    let riskLevel, riskClass, riskPercentage;

    if (fireRisk < 25) {
        riskLevel = '低风险';
        riskClass = 'fire-risk-low';
        riskPercentage = 25;
    } else if (fireRisk < 50) {
        riskLevel = '中风险';
        riskClass = 'fire-risk-medium';
        riskPercentage = 50;
    } else if (fireRisk < 75) {
        riskLevel = '高风险';
        riskClass = 'fire-risk-high';
        riskPercentage = 75;
    } else {
        riskLevel = '极高风险';
        riskClass = 'fire-risk-extreme';
        riskPercentage = 100;
    }

    updateRiskDisplay(fireRisk, riskLevel, riskClass, riskPercentage);
}

function updateRiskDisplay(fireRisk, riskLevel, riskClass, riskPercentage) {
    document.getElementById('fireRiskLevel').textContent = riskLevel;
    document.getElementById('fireRiskLevel').className = `status-value ${riskClass}`;
    document.getElementById('riskMeter').style.width = `${riskPercentage}%`;
    document.getElementById('riskText').textContent = `当前火险等级: ${riskLevel} (指数: ${fireRisk.toFixed(1)})`;

    fireRiskLevel = riskLevel;
}

// 计算干旱指数（简化版）
function calculateDroughtIndex(weatherData) {
    const temp = weatherData.main.temp;
    const humidity = weatherData.main.humidity;
    return (temp * (100 - humidity)) / 100;
}

// 加载火情数据
function loadFireData() {
    firesRef.on('value', (snapshot) => {
        const fires = [];
        snapshot.forEach((childSnapshot) => {
            const fire = childSnapshot.val();
            fire.id = childSnapshot.key;
            fires.push(fire);
        });

        updateFireDisplay(fires);
        updateFireMap(fires);
    }, (error) => {
        console.error('火情数据加载失败:', error);
        // 使用模拟数据
        const mockFires = [
            {
                id: 'mock_001',
                location: '演示火点 - 秦岭北麓',
                latitude: 34.2,
                longitude: 108.9,
                severity: '高风险',
                status: 'active',
                timestamp: Date.now(),
                description: '这是演示火点数据'
            }
        ];
        updateFireDisplay(mockFires);
        updateFireMap(mockFires);
    });
}

// 更新火情显示
function updateFireDisplay(fires) {
    const container = document.getElementById('firesList');
    const activeFires = fires.filter(fire => fire.status === 'active');

    document.getElementById('activeFires').textContent = activeFires.length;

    if (activeFires.length === 0) {
        container.innerHTML = '<div class="no-fires">暂无活跃火情</div>';
        return;
    }

    container.innerHTML = activeFires.map(fire => `
        <div class="fire-item">
            <div class="fire-header">
                <div class="fire-location">${fire.location}</div>
                <div class="fire-status">${fire.severity}</div>
            </div>
            <div class="fire-details">
                上报时间: ${new Date(fire.timestamp).toLocaleString()}
                ${fire.description ? `<br>${fire.description}` : ''}
            </div>
        </div>
    `).join('');
}

// 在地图上更新火情
function updateFireMap(fires) {
    if (!map) return;

    // 清除现有火情标记（保留当前位置标记）
    const overlays = map.getOverlays();
    for (let i = overlays.length - 1; i >= 0; i--) {
        const overlay = overlays[i];
        // 只删除火情标记，保留当前位置标记
        if (overlay.getTitle && overlay.getTitle() === 'fire_marker') {
            map.removeOverLay(overlay);
        }
    }

    fires.forEach(fire => {
        if (fire.latitude && fire.longitude && fire.status === 'active') {
            // 根据严重程度设置标记颜色
            let iconColor;
            switch (fire.severity) {
                case '低风险': iconColor = '#38a169'; break;
                case '中风险': iconColor = '#ed8936'; break;
                case '高风险': iconColor = '#e53e3e'; break;
                case '极高风险': iconColor = '#9b2c2c'; break;
                default: iconColor = '#e53e3e';
            }

            // 创建火情标记
            const marker = new T.Marker(new T.LngLat(fire.longitude, fire.latitude), {
                title: 'fire_marker'
            });

            // 自定义标记样式
            marker.setIcon(new T.Icon({
                iconUrl: `data:image/svg+xml;base64,${btoa(`
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M8 16C8 19.31 10.69 22 14 22C17.31 22 20 19.31 20 16C20 13.24 17.09 9.15 14 6C10.91 9.15 8 13.24 8 16Z" fill="${iconColor}"/>
                        <path d="M14 6C14 6 10 10 10 14C10 15.1046 10.8954 16 12 16C13.1046 16 14 15.1046 14 14C14 12.8954 14.8954 12 16 12C17.1046 12 18 11.1046 18 10C18 8 14 6 14 6Z" fill="#FFD700"/>
                    </svg>
                `)}`,
                iconSize: new T.Point(24, 24),
                iconAnchor: new T.Point(12, 24)
            }));

            marker.addEventListener('click', () => {
                alert(`火情信息:\n位置: ${fire.location}\n等级: ${fire.severity}\n时间: ${new Date(fire.timestamp).toLocaleString()}`);
            });

            map.addOverLay(marker);
        }
    });
}

// 加载预警信息
function loadAlerts() {
    alertsRef.on('value', (snapshot) => {
        const alerts = [];
        snapshot.forEach((childSnapshot) => {
            const alert = childSnapshot.val();
            alert.id = childSnapshot.key;
            alerts.push(alert);
        });

        updateAlertsDisplay(alerts);
    }, (error) => {
        console.error('预警信息加载失败:', error);
        // 使用模拟预警
        const mockAlerts = [
            {
                id: 'mock_alert',
                title: '系统演示预警',
                content: '这是山火预警系统的演示数据，实际使用时将显示真实的预警信息。',
                level: 'medium',
                timestamp: Date.now()
            }
        ];
        updateAlertsDisplay(mockAlerts);
    });
}

// 更新预警显示
function updateAlertsDisplay(alerts) {
    const container = document.getElementById('alertsList');

    if (alerts.length === 0) {
        container.innerHTML = '<div class="no-alerts">暂无预警信息</div>';
        return;
    }

    // 按时间倒序排列
    alerts.sort((a, b) => b.timestamp - a.timestamp);

    container.innerHTML = alerts.map(alert => `
        <div class="alert-item alert-${alert.level}">
            <div class="alert-header">
                <div class="alert-title">${alert.title}</div>
                <div class="alert-level">${getAlertLevelText(alert.level)}</div>
            </div>
            <div class="alert-content">${alert.content}</div>
            <div class="alert-time">${new Date(alert.timestamp).toLocaleString()}</div>
        </div>
    `).join('');
}

// 获取预警等级文本
function getAlertLevelText(level) {
    const levels = {
        'low': '低',
        'medium': '中',
        'high': '高',
        'extreme': '极高'
    };
    return levels[level] || level;
}

// 更新决策支持
function updateDecisionSupport() {
    if (!weatherData) {
        // 使用默认值
        document.getElementById('rescueWindow').textContent = '需要天气数据';
        document.getElementById('evacuationRoute').textContent = '需要天气数据';
        document.getElementById('spreadPrediction').textContent = '需要天气数据';
        return;
    }

    // 最佳扑救窗口分析
    const rescueWindow = analyzeRescueWindow(weatherData);
    document.getElementById('rescueWindow').textContent = rescueWindow;

    // 安全撤离路线
    const evacuationRoute = planEvacuationRoute();
    document.getElementById('evacuationRoute').textContent = evacuationRoute;

    // 火势蔓延预测
    const spreadPrediction = predictFireSpread(weatherData);
    document.getElementById('spreadPrediction').textContent = spreadPrediction;
}

// 分析最佳扑救窗口
function analyzeRescueWindow(weatherData) {
    const temp = weatherData.main.temp;
    const windSpeed = weatherData.wind.speed;
    const humidity = weatherData.main.humidity;

    if (temp < 25 && windSpeed < 3 && humidity > 60) {
        return '当前是理想扑救窗口期';
    } else if (temp < 30 && windSpeed < 5 && humidity > 50) {
        return '条件较好，适合扑救';
    } else if (temp < 35 && windSpeed < 8 && humidity > 40) {
        return '条件一般，需谨慎扑救';
    } else {
        return '条件不利，建议等待更好时机';
    }
}

// 规划撤离路线
function planEvacuationRoute() {
    if (!weatherData) return '需要更多数据';

    // 简化版：根据风险等级给出建议
    if (fireRiskLevel === '极高风险') {
        return '立即向逆风方向撤离';
    } else if (fireRiskLevel === '高风险') {
        return '准备向安全区域撤离';
    } else {
        return '保持警惕，熟悉撤离路线';
    }
}

// 预测火势蔓延
function predictFireSpread(weatherData) {
    const windSpeed = weatherData.wind.speed;

    if (windSpeed < 3) {
        return '蔓延速度较慢';
    } else if (windSpeed < 6) {
        return '中等蔓延速度';
    } else if (windSpeed < 10) {
        return '快速蔓延，需警惕';
    } else {
        return '极速蔓延，立即行动';
    }
}

// 更新时间
function updateTime() {
    const now = new Date();
    document.getElementById('updateTime').textContent = now.toLocaleString();
}

// 刷新地图
function refreshMap() {
    if (currentLocation && map) {
        const center = new T.LngLat(currentLocation.lng, currentLocation.lat);
        map.centerAndZoom(center, map.getZoom());
    }
    loadFireData();
    loadAlerts();
}

// 系统更新
function updateSystem() {
    loadWeatherData().then(() => {
        calculateFireRisk();
        updateDecisionSupport();
        updateTime();
    });
}

// SHA256加密函数（用于管理员验证）
async function sha256(message) {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}