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
        if (window.T) {
            resolve();
            return;
        }

        let checkCount = 0;
        const checkInterval = setInterval(() => {
            checkCount++;
            if (window.T) {
                clearInterval(checkInterval);
                resolve();
            } else if (checkCount > 50) { // 5秒超时
                clearInterval(checkInterval);
                reject(new Error('天地图API加载超时'));
            }
        }, 100);
    });
}

// 主初始化函数
document.addEventListener('DOMContentLoaded', function () {
    console.log('DOM加载完成，开始初始化系统...');
    initSystem();
    setInterval(updateSystem, 30000);
});

async function initSystem() {
    try {
        console.log('等待天地图API加载...');
        await waitForTMap();
        console.log('天地图API加载成功，开始初始化地图...');

        await initMap();
        console.log('地图初始化成功');

        await getCurrentLocation();
        console.log('位置获取成功');

        await loadWeatherData();
        console.log('天气数据加载成功');

        calculateFireRisk();
        loadFireData();
        loadAlerts();
        updateDecisionSupport();
        updateTime();

        console.log('系统初始化完成');
    } catch (error) {
        console.error('系统初始化失败:', error);
        document.getElementById('currentLocation').textContent = '系统初始化失败: ' + error.message;
        // 即使地图失败，也要继续其他功能
        loadWeatherData().then(() => {
            calculateFireRisk();
            updateDecisionSupport();
        });
        loadFireData();
        loadAlerts();
        updateTime();
    }
}

// 初始化天地图 - 使用正确的方法
function initMap() {
    return new Promise((resolve, reject) => {
        try {
            // 创建地图实例
            map = new T.Map('fireMap');
            console.log('地图实例创建成功');

            // 设置地图中心和缩放级别
            const center = new T.LngLat(108.990221, 34.252705);
            map.centerAndZoom(center, 10);
            console.log('地图中心设置成功');

            // 使用正确的图层创建方式
            // 创建矢量地图图层
            const vecLayer = new T.TileLayer({
                // 使用正确的URL模板
                getTileUrl: function (tileCoord, zoom) {
                    const x = tileCoord.x;
                    const y = tileCoord.y;
                    const z = zoom;
                    const subdomain = (x + y) % 8;
                    return `https://t${subdomain}.tianditu.gov.cn/vec_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=vec&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX=${z}&TILEROW=${y}&TILECOL=${x}&tk=6e5b0e71ae628b8c2ab60c9144a7848e`;
                },
                minZoom: 3,
                maxZoom: 18
            });

            // 创建标注图层
            const cvaLayer = new T.TileLayer({
                getTileUrl: function (tileCoord, zoom) {
                    const x = tileCoord.x;
                    const y = tileCoord.y;
                    const z = zoom;
                    const subdomain = (x + y) % 8;
                    return `https://t${subdomain}.tianditu.gov.cn/cva_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cva&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX=${z}&TILEROW=${y}&TILECOL=${x}&tk=6e5b0e71ae628b8c2ab60c9144a7848e`;
                },
                minZoom: 3,
                maxZoom: 18
            });

            // 添加图层到地图
            map.addLayer(vecLayer);
            map.addLayer(cvaLayer);
            console.log('地图图层添加成功');

            // 添加地图控件
            map.addControl(new T.Control.Zoom());
            map.addControl(new T.Control.Scale());

            resolve();
        } catch (error) {
            console.error('地图初始化失败:', error);
            // 创建备用地图显示
            createFallbackMap();
            reject(error);
        }
    });
}

// 备用地图方案
function createFallbackMap() {
    const mapContainer = document.getElementById('fireMap');
    mapContainer.innerHTML = `
        <div style="width:100%;height:100%;background:#1a365d;display:flex;flex-direction:column;justify-content:center;align-items:center;color:white;">
            <i class="fas fa-map-marked-alt" style="font-size:3rem;margin-bottom:1rem;"></i>
            <div>地图加载失败</div>
            <div style="font-size:0.8rem;margin-top:0.5rem;">请检查网络连接和API密钥</div>
            <button class="btn-secondary" onclick="retryMap()" style="margin-top:1rem;">
                <i class="fas fa-redo"></i> 重试加载地图
            </button>
        </div>
    `;
}

// 重试地图加载
function retryMap() {
    initMap().then(() => {
        if (currentLocation) {
            const center = new T.LngLat(currentLocation.lng, currentLocation.lat);
            map.centerAndZoom(center, 12);
            addCurrentLocationMarker();
        }
        loadFireData();
    }).catch(error => {
        console.error('地图重试失败:', error);
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
                    console.log('GPS定位成功:', currentLocation);

                    try {
                        const locationInfo = await getLocationInfo(currentLocation.lat, currentLocation.lng);
                        document.getElementById('currentLocation').textContent =
                            `${locationInfo.province} ${locationInfo.city}`;
                    } catch (error) {
                        document.getElementById('currentLocation').textContent = '定位成功';
                    }

                    // 移动地图到当前位置
                    if (map && window.T) {
                        const center = new T.LngLat(currentLocation.lng, currentLocation.lat);
                        map.centerAndZoom(center, 12);
                        addCurrentLocationMarker();
                    }
                    resolve();
                },
                async (error) => {
                    console.log('GPS定位失败:', error);
                    try {
                        const ipInfo = await getIPLocation();
                        currentLocation = {
                            lat: ipInfo.latitude_3,
                            lng: ipInfo.longitude_3
                        };
                        console.log('IP定位成功:', currentLocation);
                        document.getElementById('currentLocation').textContent =
                            `${ipInfo.province_name_3} ${ipInfo.city_name_3}`;

                        if (map && window.T) {
                            const center = new T.LngLat(currentLocation.lng, currentLocation.lat);
                            map.centerAndZoom(center, 10);
                            addCurrentLocationMarker();
                        }
                    } catch (ipError) {
                        console.error('IP定位失败:', ipError);
                        document.getElementById('currentLocation').textContent = '使用默认位置(西安)';
                        currentLocation = { lat: 34.252705, lng: 108.990221 };

                        if (map && window.T) {
                            const center = new T.LngLat(currentLocation.lng, currentLocation.lat);
                            map.centerAndZoom(center, 10);
                        }
                    }
                    resolve();
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 60000
                }
            );
        } else {
            console.log('浏览器不支持地理定位，使用IP定位');
            getIPLocation().then(ipInfo => {
                currentLocation = {
                    lat: ipInfo.latitude_3,
                    lng: ipInfo.longitude_3
                };
                document.getElementById('currentLocation').textContent =
                    `${ipInfo.province_name_3} ${ipInfo.city_name_3}`;
                resolve();
            }).catch(() => {
                document.getElementById('currentLocation').textContent = '使用默认位置(西安)';
                currentLocation = { lat: 34.252705, lng: 108.990221 };
                resolve();
            });
        }
    });
}

// 添加当前位置标记
function addCurrentLocationMarker() {
    if (!map || !currentLocation || !window.T) return;

    try {
        // 清除现有标记
        const overlays = map.getOverlays();
        for (let i = overlays.length - 1; i >= 0; i--) {
            const overlay = overlays[i];
            if (overlay._opts && overlay._opts.isCurrentLocation) {
                map.removeOverLay(overlay);
            }
        }

        // 创建自定义图标
        const icon = new T.Icon({
            iconUrl: createLocationIconSvg('#3182ce'),
            iconSize: new T.Point(25, 25),
            iconAnchor: new T.Point(12, 25)
        });

        const marker = new T.Marker(new T.LngLat(currentLocation.lng, currentLocation.lat), {
            icon: icon,
            isCurrentLocation: true // 自定义属性用于识别
        });

        marker.addEventListener('click', () => {
            alert('这是您的当前位置');
        });

        map.addOverLay(marker);
        console.log('当前位置标记添加成功');
    } catch (error) {
        console.error('添加位置标记失败:', error);
    }
}

// 创建位置图标SVG
function createLocationIconSvg(color) {
    const svg = `
        <svg width="25" height="25" viewBox="0 0 25 25" xmlns="http://www.w3.org/2000/svg">
            <path d="M12.5 2C8.081 2 4.5 5.581 4.5 10C4.5 15.018 7.546 19.45 12.5 23C17.454 19.45 20.5 15.018 20.5 10C20.5 5.581 16.919 2 12.5 2Z" fill="${color}" fill-opacity="0.8"/>
            <circle cx="12.5" cy="10" r="3" fill="white"/>
            <circle cx="12.5" cy="10" r="1.5" fill="${color}"/>
        </svg>
    `;
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
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
    return new Promise((resolve, reject) => {
        if (!window.T) {
            reject(new Error('天地图API未加载'));
            return;
        }

        try {
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
        } catch (error) {
            reject(error);
        }
    });
}

// 加载天气数据
async function loadWeatherData() {
    if (!currentLocation) {
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

        const droughtIndex = calculateDroughtIndex(weatherData);
        document.getElementById('droughtIndex').textContent = droughtIndex.toFixed(1);
    }
}

// 计算火险等级
function calculateFireRisk() {
    if (!weatherData) {
        updateRiskDisplay(30, '低风险', 'fire-risk-low', 25);
        return;
    }

    const temp = weatherData.main.temp;
    const humidity = weatherData.main.humidity;
    const windSpeed = weatherData.wind.speed;

    let fireRisk = (temp * 0.3) + ((100 - humidity) * 0.4) + (windSpeed * 2);

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

// 计算干旱指数
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
    if (!map || !window.T) return;

    try {
        // 清除现有火情标记（保留当前位置标记）
        const overlays = map.getOverlays();
        for (let i = overlays.length - 1; i >= 0; i--) {
            const overlay = overlays[i];
            if (overlay._opts && !overlay._opts.isCurrentLocation) {
                map.removeOverLay(overlay);
            }
        }

        fires.forEach(fire => {
            if (fire.latitude && fire.longitude && fire.status === 'active') {
                let iconColor;
                switch (fire.severity) {
                    case '低风险': iconColor = '#38a169'; break;
                    case '中风险': iconColor = '#ed8936'; break;
                    case '高风险': iconColor = '#e53e3e'; break;
                    case '极高风险': iconColor = '#9b2c2c'; break;
                    default: iconColor = '#e53e3e';
                }

                const marker = new T.Marker(new T.LngLat(fire.longitude, fire.latitude), {
                    title: 'fire_marker'
                });

                marker.setIcon(new T.Icon({
                    iconUrl: createFireIconSvg(iconColor),
                    iconSize: new T.Point(20, 20),
                    iconAnchor: new T.Point(10, 20)
                }));

                marker.addEventListener('click', () => {
                    alert(`火情信息:\n位置: ${fire.location}\n等级: ${fire.severity}\n时间: ${new Date(fire.timestamp).toLocaleString()}`);
                });

                map.addOverLay(marker);
            }
        });
    } catch (error) {
        console.error('更新火情地图失败:', error);
    }
}

// 创建火情图标SVG
function createFireIconSvg(color) {
    const svg = `
        <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
            <path d="M10 2C6 2 2 6 2 10C2 14 6 18 10 18C14 18 18 14 18 10C18 6 14 2 10 2Z" fill="${color}" fill-opacity="0.8"/>
            <path d="M10 6C10 6 6 10 6 14C6 15.1046 6.89543 16 8 16C9.10457 16 10 15.1046 10 14C10 12.8954 10.8954 12 12 12C13.1046 12 14 11.1046 14 10C14 8 10 6 10 6Z" fill="#FFD700"/>
        </svg>
    `;
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
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
        document.getElementById('rescueWindow').textContent = '需要天气数据';
        document.getElementById('evacuationRoute').textContent = '需要天气数据';
        document.getElementById('spreadPrediction').textContent = '需要天气数据';
        return;
    }

    const rescueWindow = analyzeRescueWindow(weatherData);
    document.getElementById('rescueWindow').textContent = rescueWindow;

    const evacuationRoute = planEvacuationRoute();
    document.getElementById('evacuationRoute').textContent = evacuationRoute;

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
    if (currentLocation && map && window.T) {
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

// SHA256加密函数
async function sha256(message) {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}