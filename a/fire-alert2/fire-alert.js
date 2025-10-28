// 全局变量
let currentLocation = null;
let weatherData = null;
let fireRiskLevel = 'low';
let isAdmin = false;
let map = null;

// 初始化函数
document.addEventListener('DOMContentLoaded', function () {
    initTheme();
    initFirebase();
    initMap();
    getVisitorLocation();
    loadAlerts();

    // 事件监听
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
    document.getElementById('submitReport').addEventListener('click', submitFireReport);
    document.getElementById('refreshMap').addEventListener('click', refreshMap);
    document.getElementById('toggleHeatmap').addEventListener('click', toggleHeatmap);

    // 定期更新
    setInterval(updateWeatherData, 300000); // 5分钟更新一次天气
    setInterval(loadAlerts, 60000); // 1分钟更新一次预警
});

// 主题管理
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.body.className = savedTheme + '-mode';
    updateThemeIcon(savedTheme);
}

function toggleTheme() {
    const isLight = document.body.classList.contains('light-mode');
    const newTheme = isLight ? 'dark' : 'light';

    document.body.classList.remove(isLight ? 'light-mode' : 'dark-mode');
    document.body.classList.add(newTheme + '-mode');
    localStorage.setItem('theme', newTheme);

    updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
    const icon = document.getElementById('themeToggle').querySelector('i');
    icon.className = theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
}

// Firebase初始化
function initFirebase() {
    // 配置在firebase-config.js中
    console.log('Firebase初始化完成');
}

// 天地图初始化
function initMap() {
    // 天地图API配置
    const apiKey = '6e5b0e71ae628b8c2ab60c9144a7848e';

    // 创建地图实例
    map = new T.Map('tdtMap');

    // 设置中心点和缩放级别
    map.centerAndZoom(new T.LngLat(116.391, 39.916), 10);

    // 添加矢量底图
    const vecLayer = new T.TileLayer('vec', {
        minZoom: 3,
        maxZoom: 18
    });
    map.addLayer(vecLayer);

    // 添加矢量注记
    const cvaLayer = new T.TileLayer('cva', {
        minZoom: 3,
        maxZoom: 18
    });
    map.addLayer(cvaLayer);

    console.log('天地图初始化完成');
}

// 获取访客位置
async function getVisitorLocation() {
    try {
        const response = await fetch('https://api.b52m.cn/api/IP/?key=60606913cdba7c');
        const data = await response.json();

        if (data.code === 200) {
            currentLocation = {
                province: data.data.province_name_3,
                city: data.data.city_name_3,
                district: data.data.district_name_3,
                lat: parseFloat(data.data.latitude_3),
                lon: parseFloat(data.data.longitude_3)
            };

            updateLocationInfo();
            getWeatherData(currentLocation.lat, currentLocation.lon);
        }
    } catch (error) {
        console.error('获取位置失败:', error);
        // 使用默认位置（北京）
        currentLocation = {
            province: '北京市',
            city: '北京市',
            district: '朝阳区',
            lat: 39.9042,
            lon: 116.4074
        };
        updateLocationInfo();
        getWeatherData(currentLocation.lat, currentLocation.lon);
    }
}

function updateLocationInfo() {
    const locationElement = document.getElementById('locationInfo');
    if (currentLocation) {
        locationElement.innerHTML = `
            <i class="fas fa-map-marker-alt"></i>
            <span>${currentLocation.province} ${currentLocation.city} ${currentLocation.district}</span>
        `;
    }
}

// 获取天气数据
async function getWeatherData(lat, lon) {
    const API_KEY = '271d3f7012a6dc06a07cea3d08888fb1';

    try {
        const response = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&lang=zh_cn`
        );

        if (!response.ok) {
            throw new Error('获取天气数据失败');
        }

        const data = await response.json();
        weatherData = data;
        updateWeatherDisplay();
        calculateFireRisk();
    } catch (error) {
        console.error('获取天气数据失败:', error);
        // 使用模拟数据
        weatherData = {
            main: {
                temp: 25,
                humidity: 40,
                feels_like: 26
            },
            wind: {
                speed: 3.5,
                deg: 180
            },
            weather: [{
                description: '晴朗'
            }]
        };
        updateWeatherDisplay();
        calculateFireRisk();
    }
}

function updateWeatherDisplay() {
    if (!weatherData) return;

    document.getElementById('temperatureValue').textContent = `${Math.round(weatherData.main.temp)}°C`;
    document.getElementById('temperatureDesc').textContent = weatherData.weather[0].description;

    document.getElementById('humidityValue').textContent = `${weatherData.main.humidity}%`;
    document.getElementById('humidityDesc').textContent = getHumidityDescription(weatherData.main.humidity);

    document.getElementById('windSpeedValue').textContent = `${weatherData.wind.speed} m/s`;
    document.getElementById('windDesc').textContent = getWindDescription(weatherData.wind.speed);
}

function getHumidityDescription(humidity) {
    if (humidity < 30) return '非常干燥';
    if (humidity < 50) return '干燥';
    if (humidity < 70) return '适中';
    return '湿润';
}

function getWindDescription(speed) {
    if (speed < 1) return '无风';
    if (speed < 3) return '微风';
    if (speed < 6) return '和风';
    if (speed < 10) return '强风';
    return '大风';
}

// 计算火险指数
function calculateFireRisk() {
    if (!weatherData || !currentLocation) return;

    const temp = weatherData.main.temp;
    const humidity = weatherData.main.humidity;
    const windSpeed = weatherData.wind.speed;

    // 简化版火险指数算法
    let riskScore = 0;

    // 温度因子 (0-40分)
    if (temp > 30) riskScore += 40;
    else if (temp > 25) riskScore += 30;
    else if (temp > 20) riskScore += 20;
    else if (temp > 15) riskScore += 10;

    // 湿度因子 (0-30分)
    if (humidity < 20) riskScore += 30;
    else if (humidity < 30) riskScore += 25;
    else if (humidity < 40) riskScore += 20;
    else if (humidity < 50) riskScore += 15;
    else if (humidity < 60) riskScore += 10;

    // 风速因子 (0-30分)
    if (windSpeed > 8) riskScore += 30;
    else if (windSpeed > 6) riskScore += 25;
    else if (windSpeed > 4) riskScore += 20;
    else if (windSpeed > 2) riskScore += 15;

    // 确定火险等级
    if (riskScore >= 80) {
        fireRiskLevel = 'critical';
    } else if (riskScore >= 60) {
        fireRiskLevel = 'high';
    } else if (riskScore >= 40) {
        fireRiskLevel = 'medium';
    } else {
        fireRiskLevel = 'low';
    }

    updateFireRiskDisplay(riskScore);
    updateDecisionSupport();
}

function updateFireRiskDisplay(score) {
    const riskElement = document.getElementById('fireRiskValue');
    const descElement = document.getElementById('fireRiskDesc');
    const alertElement = document.getElementById('alertLevel');

    riskElement.textContent = score;

    const riskConfig = {
        low: { text: '低风险', color: 'var(--success-green)', desc: '火险风险较低' },
        medium: { text: '中风险', color: 'var(--warning-orange)', desc: '注意防火' },
        high: { text: '高风险', color: 'var(--danger-red)', desc: '加强巡查' },
        critical: { text: '极高风险', color: '#b71c1c', desc: '立即采取防火措施' }
    };

    const config = riskConfig[fireRiskLevel];
    descElement.textContent = config.desc;
    riskElement.style.color = config.color;

    alertElement.innerHTML = `
        <i class="fas fa-exclamation-triangle" style="color: ${config.color}"></i>
        <span>火险等级：${config.text}</span>
    `;
    alertElement.className = `alert-level ${fireRiskLevel}`;
}

// 决策支持更新
function updateDecisionSupport() {
    if (!weatherData) return;

    const windSpeed = weatherData.wind.speed;
    const temp = weatherData.main.temp;

    // 最佳扑救窗口期
    let rescueWindow = '当前条件适宜扑救';
    if (windSpeed > 6 || temp > 35) {
        rescueWindow = '建议等待风速/温度下降';
    } else if (windSpeed > 4) {
        rescueWindow = '需加强防护措施';
    }

    // 安全撤离路线
    let evacuationRoute = '逆风方向撤离';
    if (weatherData.wind.deg) {
        const direction = getWindDirection(weatherData.wind.deg);
        evacuationRoute = `向${direction}方向撤离`;
    }

    // 火势蔓延预测
    let spreadPrediction = '蔓延速度较慢';
    if (windSpeed > 6) {
        spreadPrediction = '可能快速蔓延';
    } else if (windSpeed > 4) {
        spreadPrediction = '中等蔓延速度';
    }

    document.getElementById('rescueWindow').textContent = rescueWindow;
    document.getElementById('evacuationRoute').textContent = evacuationRoute;
    document.getElementById('spreadPrediction').textContent = spreadPrediction;
}

function getWindDirection(degrees) {
    const directions = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
    const index = Math.round(degrees / 45) % 8;
    return directions[index];
}

// 加载预警信息
async function loadAlerts() {
    try {
        const alertsRef = firebase.database().ref('fire-alerts/alerts');
        alertsRef.orderByChild('timestamp').limitToLast(10).once('value').then(snapshot => {
            const alerts = [];
            snapshot.forEach(childSnapshot => {
                const alert = childSnapshot.val();
                alert.id = childSnapshot.key;
                alerts.push(alert);
            });

            // 按时间倒序排列
            alerts.reverse();
            displayAlerts(alerts);
        });
    } catch (error) {
        console.error('加载预警失败:', error);
        displayMockAlerts();
    }
}

function displayAlerts(alerts) {
    const alertList = document.getElementById('alertList');
    const updateTime = document.getElementById('alertUpdateTime');

    updateTime.textContent = new Date().toLocaleTimeString();

    if (alerts.length === 0) {
        alertList.innerHTML = `
            <div class="alert-item loading">
                <i class="fas fa-check-circle"></i>
                <span>暂无预警信息</span>
            </div>
        `;
        return;
    }

    let html = '';
    alerts.forEach(alert => {
        const time = new Date(alert.timestamp).toLocaleString();
        html += `
            <div class="alert-item ${alert.severity}">
                <div class="alert-header">
                    <div class="alert-title">${alert.location}</div>
                    <span class="alert-severity ${alert.severity}">${getSeverityText(alert.severity)}</span>
                </div>
                <div class="alert-content">${alert.description}</div>
                <div class="alert-time">${time}</div>
            </div>
        `;
    });

    alertList.innerHTML = html;
}

function getSeverityText(severity) {
    const texts = {
        low: '低风险',
        medium: '中风险',
        high: '高风险',
        critical: '危急'
    };
    return texts[severity] || '未知';
}

// 模拟预警数据（备用）
function displayMockAlerts() {
    const mockAlerts = [
        {
            location: '北京市怀柔区',
            severity: 'medium',
            description: '监测到疑似火点，请加强巡查',
            timestamp: Date.now() - 3600000
        },
        {
            location: '河北省张家口市',
            severity: 'low',
            description: '干燥天气持续，注意防火',
            timestamp: Date.now() - 7200000
        }
    ];

    displayAlerts(mockAlerts);
}

// 山火信息上报
async function submitFireReport() {
    const location = document.getElementById('reportLocation').value.trim();
    const severity = document.getElementById('reportSeverity').value;
    const description = document.getElementById('reportDescription').value.trim();
    const imageFile = document.getElementById('reportImage').files[0];

    if (!location || !description) {
        alert('请填写位置描述和详细情况');
        return;
    }

    const submitBtn = document.getElementById('submitReport');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 提交中...';

    try {
        let imageUrl = '';

        // 如果有图片，先上传（简化处理，实际项目需要完整上传逻辑）
        if (imageFile) {
            // 这里简化处理，实际应该上传到Firebase Storage
            imageUrl = '待上传';
        }

        const reportData = {
            location: location,
            severity: severity,
            description: description,
            imageUrl: imageUrl,
            reporter: '匿名用户',
            timestamp: Date.now(),
            status: 'pending',
            coordinates: currentLocation ? {
                lat: currentLocation.lat,
                lon: currentLocation.lon
            } : null
        };

        // 保存到Firebase
        const reportsRef = firebase.database().ref('fire-alerts/reports');
        await reportsRef.push(reportData);

        // 清空表单
        document.getElementById('reportLocation').value = '';
        document.getElementById('reportDescription').value = '';
        document.getElementById('reportImage').value = '';

        alert('上报成功！感谢您的贡献');

    } catch (error) {
        console.error('上报失败:', error);
        alert('上报失败，请稍后重试');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> 提交上报';
    }
}

// 地图操作
function refreshMap() {
    if (map) {
        map.setZoom(map.getZoom());
        showNotification('地图已刷新');
    }
}

function toggleHeatmap() {
    const btn = document.getElementById('toggleHeatmap');
    const isActive = btn.classList.contains('active');

    if (isActive) {
        btn.classList.remove('active');
        btn.innerHTML = '<i class="fas fa-layer-group"></i> 热力图';
        // 移除热力图图层
    } else {
        btn.classList.add('active');
        btn.innerHTML = '<i class="fas fa-layer-group"></i> 关闭热力图';
        // 添加热力图图层（简化实现）
        showNotification('热力图已开启');
    }
}

// 工具函数
function showNotification(message) {
    // 创建临时通知
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: var(--accent-blue);
        color: white;
        padding: 12px 20px;
        border-radius: 5px;
        box-shadow: var(--shadow);
        z-index: 1000;
        animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// 添加CSS动画
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

// 定期更新天气数据
function updateWeatherData() {
    if (currentLocation) {
        getWeatherData(currentLocation.lat, currentLocation.lon);
    }
}

// 管理员认证检查
function checkAdminAuth() {
    const adminCode = localStorage.getItem('fire_admin');
    if (adminCode === '936a185caaa266bb9cbe981e9e05cb78cd732b0b3280eb944412bb6f8f8f07af') {
        isAdmin = true;
    }
}

// 页面可见性变化时更新数据
document.addEventListener('visibilitychange', function () {
    if (!document.hidden) {
        loadAlerts();
        if (currentLocation) {
            getWeatherData(currentLocation.lat, currentLocation.lon);
        }
    }
});