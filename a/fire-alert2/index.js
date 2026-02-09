// OpenWeatherMap API配置
const API_KEY = '271d3f7012a6dc06a07cea3d08888fb1';
const BASE_URL = 'https://api.openweathermap.org/data/2.5';

// 管理员状态
let isAdmin = localStorage.getItem('isAdmin') === 'true';

// 初始化地图
let map;
let currentLayer = 'satellite';

function initMap() {
    // 创建影像底图图层
    const imgLayer = new ol.layer.Tile({
        source: new ol.source.WMTS({
            url: 'http://t0.tianditu.gov.cn/img_w/wmts?tk=' + TIANDITU_KEY,
            layer: 'img',
            style: 'default',
            matrixSet: 'w',
            format: 'tiles',
            projection: 'EPSG:3857',
            tileGrid: new ol.tilegrid.WMTS({
                origin: [-2.003750834E7, 2.003750834E7],
                resolutions: [
                    156543.033928041,
                    78271.5169640205,
                    39135.75848201024,
                    19567.87924100512,
                    9783.93962050256,
                    4891.96981025128,
                    2445.98490512564,
                    1222.99245256282,
                    611.49622628141,
                    305.748113140705,
                    152.8740565703525,
                    76.43702828517625,
                    38.21851414258813,
                    19.109257071294063,
                    9.554628535647032,
                    4.777314267823516,
                    2.388657133911758,
                    1.194328566955879,
                    0.5971642834779395
                ],
                matrixIds: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
            }),
            wrapX: true
        })
    });

    // 创建地形底图图层
    const terLayer = new ol.layer.Tile({
        source: new ol.source.WMTS({
            url: 'http://t0.tianditu.gov.cn/ter_w/wmts?tk=' + TIANDITU_KEY,
            layer: 'ter',
            style: 'default',
            matrixSet: 'w',
            format: 'tiles',
            projection: 'EPSG:3857',
            tileGrid: new ol.tilegrid.WMTS({
                origin: [-2.003750834E7, 2.003750834E7],
                resolutions: [
                    156543.033928041,
                    78271.5169640205,
                    39135.75848201024,
                    19567.87924100512,
                    9783.93962050256,
                    4891.96981025128,
                    2445.98490512564,
                    1222.99245256282,
                    611.49622628141,
                    305.748113140705,
                    152.8740565703525,
                    76.43702828517625,
                    38.21851414258813,
                    19.109257071294063,
                    9.554628535647032,
                    4.777314267823516,
                    2.388657133911758,
                    1.194328566955879,
                    0.5971642834779395
                ],
                matrixIds: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
            }),
            wrapX: true
        })
    });

    // 创建矢量图层用于显示火点（不添加火点）
    const vectorSource = new ol.source.Vector();
    const vectorLayer = new ol.layer.Vector({
        source: vectorSource,
        style: new ol.style.Style({
            image: new ol.style.Circle({
                radius: 7,
                fill: new ol.style.Fill({
                    color: 'rgba(255, 107, 53, 0.8)'
                }),
                stroke: new ol.style.Stroke({
                    color: 'rgba(255, 255, 255, 0.8)',
                    width: 2
                })
            })
        })
    });

    // 创建地图
    map = new ol.Map({
        target: 'map',
        layers: [imgLayer, vectorLayer],
        view: new ol.View({
            center: ol.proj.fromLonLat([108.5, 34.5]), // 北京中心点
            zoom: 3
        })
    });
}

// 切换地图图层
function switchLayer(layerType) {
    currentLayer = layerType;
    const baseLayer = map.getLayers().item(0);

    if (layerType === 'satellite') {
        baseLayer.setSource(new ol.source.WMTS({
            url: 'http://t0.tianditu.gov.cn/img_w/wmts?tk=' + TIANDITU_KEY,
            layer: 'img',
            style: 'default',
            matrixSet: 'w',
            format: 'tiles',
            projection: 'EPSG:3857',
            tileGrid: new ol.tilegrid.WMTS({
                origin: [-2.003750834E7, 2.003750834E7],
                resolutions: [
                    156543.033928041,
                    78271.5169640205,
                    39135.75848201024,
                    19567.87924100512,
                    9783.93962050256,
                    4891.96981025128,
                    2445.98490512564,
                    1222.99245256282,
                    611.49622628141,
                    305.748113140705,
                    152.8740565703525,
                    76.43702828517625,
                    38.21851414258813,
                    19.109257071294063,
                    9.554628535647032,
                    4.777314267823516,
                    2.388657133911758,
                    1.194328566955879,
                    0.5971642834779395
                ],
                matrixIds: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
            }),
            wrapX: true
        }));
    } else if (layerType === 'terrain') {
        baseLayer.setSource(new ol.source.WMTS({
            url: 'http://t0.tianditu.gov.cn/ter_w/wmts?tk=' + TIANDITU_KEY,
            layer: 'ter',
            style: 'default',
            matrixSet: 'w',
            format: 'tiles',
            projection: 'EPSG:3857',
            tileGrid: new ol.tilegrid.WMTS({
                origin: [-2.003750834E7, 2.003750834E7],
                resolutions: [
                    156543.033928041,
                    78271.5169640205,
                    39135.75848201024,
                    19567.87924100512,
                    9783.93962050256,
                    4891.96981025128,
                    2445.98490512564,
                    1222.99245256282,
                    611.49622628141,
                    305.748113140705,
                    152.8740565703525,
                    76.43702828517625,
                    38.21851414258813,
                    19.109257071294063,
                    9.554628535647032,
                    4.777314267823516,
                    2.388657133911758,
                    1.194328566955879,
                    0.5971642834779395
                ],
                matrixIds: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
            }),
            wrapX: true
        }));
    }
}

// 获取真实天气数据
async function getWeatherData() {
    try {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                async position => {
                    const lat = position.coords.latitude;
                    const lon = position.coords.longitude;

                    const response = await fetch(`${BASE_URL}/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&lang=zh_cn`);
                    const data = await response.json();

                    // 更新UI
                    document.getElementById('temperature').textContent = Math.round(data.main.temp) + '°C';
                    document.getElementById('humidity').textContent = data.main.humidity + '%';
                    document.getElementById('windSpeed').textContent = data.wind.speed + ' m/s';
                    document.getElementById('precipitation').textContent = (data.rain ? data.rain['1h'] || 0 : 0) + ' mm';
                    document.getElementById('location').textContent = data.name + ', ' + (data.sys.country || '');

                    // 设置火险等级为低风险
                    document.getElementById('fireRiskValue').textContent = "低风险";
                    const riskIndicator = document.querySelector('.risk-indicator');
                    riskIndicator.className = `risk-indicator risk-low`;
                },
                error => {
                    console.error('获取位置失败:', error);
                    // 使用默认位置（北京）获取天气
                    getWeatherByCity('Beijing');
                }
            );
        } else {
            // 浏览器不支持定位，使用默认位置
            getWeatherByCity('Beijing');
        }
    } catch (error) {
        console.error('获取天气数据失败:', error);
    }
}

// 通过城市名称获取天气
async function getWeatherByCity(city) {
    try {
        const response = await fetch(`${BASE_URL}/weather?q=${city}&appid=${API_KEY}&units=metric&lang=zh_cn`);
        const data = await response.json();

        document.getElementById('temperature').textContent = Math.round(data.main.temp) + '°C';
        document.getElementById('humidity').textContent = data.main.humidity + '%';
        document.getElementById('windSpeed').textContent = data.wind.speed + ' m/s';
        document.getElementById('precipitation').textContent = (data.rain ? data.rain['1h'] || 0 : 0) + ' mm';
        document.getElementById('location').textContent = data.name + ', ' + (data.sys.country || '');
    } catch (error) {
        console.error('获取天气数据失败:', error);
    }
}

// 加载预警信息
async function loadWarnings() {
    try {
        const response = await fetch('warnings.json');
        const warnings = await response.json();
        displayWarnings(warnings);
    } catch (error) {
        console.error('加载预警信息失败:', error);
        document.getElementById('warningList').innerHTML = '<div class="warning-item">暂无预警信息</div>';
    }
}

// 显示预警信息
function displayWarnings(warnings) {
    const warningList = document.getElementById('warningList');
    warningList.innerHTML = '';

    if (warnings.length === 0) {
        warningList.innerHTML = '<div class="warning-item">暂无预警信息</div>';
        return;
    }

    warnings.forEach(warning => {
        const warningItem = document.createElement('div');
        warningItem.className = 'warning-item';
        warningItem.innerHTML = `
                    <div class="warning-title">
                        <span>${warning.title}</span>
                        <span class="warning-time">${warning.time}</span>
                    </div>
                    <p>${warning.content}</p>
                `;
        warningList.appendChild(warningItem);
    });
}

// 管理员登录 (安全API版本)
async function adminLogin() {
    const passwordInput = document.getElementById('adminPassword');
    const password = passwordInput.value.trim();
    const submitBtn = document.querySelector('button[onclick="adminLogin()"]'); // 获取登录按钮，防止重复提交

    if (!password) {
        alert('请输入管理员密码');
        return;
    }

    // 可选：添加防重复提交和加载状态
    if (submitBtn) {
        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = '验证中...';
    }

    try {
        // 1. 计算用户输入密码的SHA-256哈希
        const hash = await sha256(password);

        // 2. 调用Vercel安全API进行验证
        const response = await fetch('https://api.130923.xyz/api/admin-auth', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ passwordHash: hash })
        });

        const result = await response.json();

        // 3. 根据API返回结果处理
        if (response.ok && result.success) {
            // 登录成功
            isAdmin = true;
            localStorage.setItem('isAdmin', 'true');
            updateAdminUI();
            passwordInput.value = '';
            alert('管理员登录成功');
        } else {
            // 登录失败 (API返回 401 或其他错误)
            alert('密码错误: ' + (result.error || ''));
        }

    } catch (error) {
        // 网络错误或API异常
        console.error('登录过程出错:', error);
        alert('登录失败：网络错误或验证服务异常，请稍后重试。');
    } finally {
        // 无论成功失败，都恢复按钮状态
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    }
}

// 管理员退出 (无需修改，可保持原样)
function logoutAdmin() {
    isAdmin = false;
    localStorage.setItem('isAdmin', 'false');
    updateAdminUI();
}

// 更新管理员UI
function updateAdminUI() {
    const loginForm = document.getElementById('adminLoginForm');
    const adminActions = document.getElementById('adminActions');
    const addWarningBtn = document.getElementById('addWarningBtn');

    if (isAdmin) {
        loginForm.style.display = 'none';
        adminActions.style.display = 'flex';
        addWarningBtn.style.display = 'block';
    } else {
        loginForm.style.display = 'flex';
        adminActions.style.display = 'none';
        addWarningBtn.style.display = 'none';
    }
}

// SHA256哈希函数
async function sha256(message) {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

// 显示添加预警模态框
function showAddWarningModal() {
    document.getElementById('addWarningModal').style.display = 'flex';
}

// 关闭添加预警模态框
function closeAddWarningModal() {
    document.getElementById('addWarningModal').style.display = 'none';
}

// 添加预警
function addWarning() {
    const title = document.getElementById('warningTitle').value;
    const level = document.getElementById('warningLevel').value;
    const content = document.getElementById('warningContent').value;

    if (!title || !content) {
        alert('请填写预警标题和内容');
        return;
    }

    // 创建预警元素
    const warningList = document.getElementById('warningList');
    const warningItem = document.createElement('div');
    warningItem.className = 'warning-item';

    const now = new Date();
    const timeStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    warningItem.innerHTML = `
                <div class="warning-title">
                    <span>${title}</span>
                    <span class="warning-time">${timeStr}</span>
                </div>
                <p>${content}</p>
            `;

    // 添加到列表顶部
    warningList.insertBefore(warningItem, warningList.firstChild);

    // 清空表单并关闭模态框
    document.getElementById('warningTitle').value = '';
    document.getElementById('warningContent').value = '';
    closeAddWarningModal();

    alert('预警信息发布成功');
}

// 更新时间和IP显示
function updateTimeAndIP() {
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    document.getElementById('current-time').textContent = timeStr;
}

// 获取访客IP信息
async function getVisitorInfo() {
    try {
        const response = await fetch('https://api.b52m.cn/api/IP/?key=60606913cdba7c');
        const data = await response.json();

        if (data.code === 200) {
            const ipInfo = data.data;
            const ip = data.ip;
            document.getElementById('current-ip').textContent = `IP: ${ip}`;
        } else {
            throw new Error('API返回错误');
        }
    } catch (error) {
        console.error('获取IP信息失败:', error);
        document.getElementById('current-ip').textContent = 'IP: 未知';
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function () {
    initMap();
    getWeatherData();
    loadWarnings();
    updateAdminUI();
    updateTimeAndIP();
    getVisitorInfo();

    // 更新最后更新时间
    const now = new Date();
    document.getElementById('lastUpdate').textContent =
        `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

    // 每秒更新时间
    setInterval(updateTimeAndIP, 1000);
});