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

// 主初始化函数
document.addEventListener('DOMContentLoaded', function () {
    initSystem();
    setInterval(updateSystem, 30000); // 每30秒更新一次
});

async function initSystem() {
    await initMap();
    await getCurrentLocation();
    await loadWeatherData();
    calculateFireRisk();
    loadFireData();
    loadAlerts();
    updateDecisionSupport();
    updateTime();
}

// 初始化天地图
function initMap() {
    return new Promise((resolve) => {
        map = new T.Map('fireMap');
        map.centerAndZoom(new T.LngLat(108.990221, 34.252705), 10);

        // 添加卫星图层
        const satelliteLayer = new T.TileLayer('vec_w', {
            minZoom: 3,
            maxZoom: 18
        });
        map.addLayer(satelliteLayer);

        resolve();
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
                    map.centerAndZoom(new T.LngLat(currentLocation.lng, currentLocation.lat), 12);
                    resolve();
                },
                async () => {
                    // 定位失败时使用IP定位
                    try {
                        const ipInfo = await getIPLocation();
                        currentLocation = {
                            lat: ipInfo.latitude_3,
                            lng: ipInfo.longitude_3
                        };
                        document.getElementById('currentLocation').textContent =
                            `${ipInfo.province_name_3} ${ipInfo.city_name_3}`;
                        map.centerAndZoom(new T.LngLat(currentLocation.lng, currentLocation.lat), 10);
                    } catch (error) {
                        console.error('定位失败:', error);
                        document.getElementById('currentLocation').textContent = '定位失败';
                    }
                    resolve();
                }
            );
        } else {
            resolve();
        }
    });
}

// IP定位
async function getIPLocation() {
    const response = await fetch('https://api.b52m.cn/api/IP/?key=60606913cdba7c');
    const data = await response.json();
    if (data.code === 200) {
        return data.data;
    }
    throw new Error('IP定位失败');
}

// 获取详细位置信息
async function getLocationInfo(lat, lng) {
    // 这里可以集成逆地理编码API
    return { province: '陕西省', city: '西安市' };
}

// 加载天气数据
async function loadWeatherData() {
    if (!currentLocation) return;

    try {
        const API_KEY = '271d3f7012a6dc06a07cea3d08888fb1';
        const response = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?lat=${currentLocation.lat}&lon=${currentLocation.lng}&appid=${API_KEY}&units=metric&lang=zh_cn`
        );

        if (response.ok) {
            weatherData = await response.json();
            updateWeatherDisplay();
        }
    } catch (error) {
        console.error('天气数据加载失败:', error);
        // 使用模拟数据
        weatherData = {
            main: { temp: 25, humidity: 40 },
            wind: { speed: 3.5 }
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
    if (!weatherData) return;

    const temp = weatherData.main.temp;
    const humidity = weatherData.main.humidity;
    const windSpeed = weatherData.wind.speed;

    // 简化版火险指数计算
    let fireRisk = (temp * 0.3) + ((100 - humidity) * 0.4) + (windSpeed * 0.3);

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

    // 更新显示
    document.getElementById('fireRiskLevel').textContent = riskLevel;
    document.getElementById('fireRiskLevel').className = `status-value ${riskClass}`;
    document.getElementById('riskMeter').style.width = `${riskPercentage}%`;
    document.getElementById('riskText').textContent = `当前火险等级: ${riskLevel}`;

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
    // 清除现有标记
    map.clearOverLays();

    fires.forEach(fire => {
        if (fire.latitude && fire.longitude) {
            const marker = new T.Marker(new T.LngLat(fire.longitude, fire.latitude));

            // 根据严重程度设置标记颜色
            let iconColor;
            switch (fire.severity) {
                case '低风险': iconColor = 'green'; break;
                case '中风险': iconColor = 'orange'; break;
                case '高风险': iconColor = 'red'; break;
                case '极高风险': iconColor = 'darkred'; break;
                default: iconColor = 'red';
            }

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
    if (!weatherData) return;

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

    if (temp < 30 && windSpeed < 5 && humidity > 50) {
        return '当前是理想扑救窗口期';
    } else if (temp < 35 && windSpeed < 8 && humidity > 40) {
        return '条件较好，适合扑救';
    } else {
        return '条件不利，建议等待更好时机';
    }
}

// 规划撤离路线
function planEvacuationRoute() {
    if (!weatherData) return '需要更多数据';

    const windDirection = '东南风'; // 简化处理
    return `建议向${getOppositeDirection(windDirection)}方向撤离`;
}

// 获取相反风向
function getOppositeDirection(direction) {
    const opposites = {
        '东风': '西', '西风': '东',
        '南风': '北', '北风': '南',
        '东南风': '西北', '西北风': '东南',
        '东北风': '西南', '西南风': '东北'
    };
    return opposites[direction] || '安全';
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
    if (currentLocation) {
        map.centerAndZoom(new T.LngLat(currentLocation.lng, currentLocation.lat), 12);
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