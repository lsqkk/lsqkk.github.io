// 天地图密钥
const TIANDITU_KEY = "6e5b0e71ae628b8c2ab60c9144a7848e";

// 全局变量
let map, currentLayer, userLocation, userMarker;
let drawnItems = new L.FeatureGroup();
let measureControl;
let is3DMode = false;

// 初始化地图
function initMap() {
    // 创建地图实例
    map = L.map('map', {
        center: [39.9042, 116.4074], // 默认中心点（北京）
        zoom: 10,
        zoomControl: false
    });

    // 添加缩放控件
    L.control.zoom({
        position: 'bottomright'
    }).addTo(map);

    // 添加定位控件
    L.control.locate({
        position: 'bottomright',
        strings: {
            title: "定位到我的位置"
        }
    }).addTo(map);

    // 添加比例尺
    L.control.scale({
        position: 'bottomleft',
        imperial: false
    }).addTo(map);

    // 初始化图层
    initLayers();

    // 添加绘制项目图层
    map.addLayer(drawnItems);

    // 定位用户位置
    locateUser();

    // 绑定事件
    bindEvents();

    // 加载保存的数据
    loadSavedData();

    // 隐藏加载动画
    document.getElementById('loader').style.display = 'none';
}

// 初始化图层
function initLayers() {
    // 矢量图层
    const vectorLayer = L.tileLayer(`http://t{0-7}.tianditu.gov.cn/vec_w/wmts?tk=${TIANDITU_KEY}`, {
        maxZoom: 18,
        minZoom: 1,
        subdomains: ['t0', 't1', 't2', 't3', 't4', 't5', 't6', 't7']
    });

    // 矢量注记
    const vectorAnnotation = L.tileLayer(`http://t{0-7}.tianditu.gov.cn/cva_w/wmts?tk=${TIANDITU_KEY}`, {
        maxZoom: 18,
        minZoom: 1,
        subdomains: ['t0', 't1', 't2', 't3', 't4', 't5', 't6', 't7']
    });

    // 影像图层
    const imageLayer = L.tileLayer(`http://t{0-7}.tianditu.gov.cn/img_w/wmts?tk=${TIANDITU_KEY}`, {
        maxZoom: 18,
        minZoom: 1,
        subdomains: ['t0', 't1', 't2', 't3', 't4', 't5', 't6', 't7']
    });

    // 影像注记
    const imageAnnotation = L.tileLayer(`http://t{0-7}.tianditu.gov.cn/cia_w/wmts?tk=${TIANDITU_KEY}`, {
        maxZoom: 18,
        minZoom: 1,
        subdomains: ['t0', 't1', 't2', 't3', 't4', 't5', 't6', 't7']
    });

    // 地形图层
    const terrainLayer = L.tileLayer(`http://t{0-7}.tianditu.gov.cn/ter_w/wmts?tk=${TIANDITU_KEY}`, {
        maxZoom: 18,
        minZoom: 1,
        subdomains: ['t0', 't1', 't2', 't3', 't4', 't5', 't6', 't7']
    });

    // 地形注记
    const terrainAnnotation = L.tileLayer(`http://t{0-7}.tianditu.gov.cn/cta_w/wmts?tk=${TIANDITU_KEY}`, {
        maxZoom: 18,
        minZoom: 1,
        subdomains: ['t0', 't1', 't2', 't3', 't4', 't5', 't6', 't7']
    });

    // 图层组
    const baseLayers = {
        "矢量地图": L.layerGroup([vectorLayer, vectorAnnotation]),
        "卫星影像": L.layerGroup([imageLayer, imageAnnotation]),
        "地形地图": L.layerGroup([terrainLayer, terrainAnnotation])
    };

    // 添加默认图层
    currentLayer = baseLayers["矢量地图"];
    currentLayer.addTo(map);

    // 添加图层控制
    L.control.layers(baseLayers, null, {
        position: 'topright'
    }).addTo(map);
}

// 定位用户位置
function locateUser() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            function (position) {
                const { latitude, longitude } = position.coords;
                userLocation = [latitude, longitude];

                // 添加用户位置标记
                userMarker = L.marker([latitude, longitude], {
                    icon: L.divIcon({
                        className: 'user-location-marker',
                        html: '<div style="background-color:#0066cc; width:16px; height:16px; border-radius:50%; border:3px solid white; box-shadow:0 0 10px rgba(0,102,204,0.5);"></div>',
                        iconSize: [22, 22],
                        iconAnchor: [11, 11]
                    })
                }).addTo(map);

                // 显示位置信息
                document.getElementById('location-info').textContent =
                    `当前位置: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

                // 移动到用户位置
                map.setView([latitude, longitude], 13);
            },
            function (error) {
                console.error("定位失败:", error);
                document.getElementById('location-info').textContent =
                    "定位失败，请检查浏览器位置权限";
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 300000
            }
        );
    } else {
        document.getElementById('location-info').textContent =
            "您的浏览器不支持地理定位功能";
    }
}

// 绑定事件
function bindEvents() {
    // 切换面板
    document.querySelector('.toggle-panel').addEventListener('click', function () {
        const panel = document.querySelector('.control-panel');
        panel.classList.toggle('panel-collapsed');
    });

    // 视图切换按钮
    document.getElementById('vector-btn').addEventListener('click', function () {
        switchLayer('矢量地图');
        setActiveButton(this);
    });

    document.getElementById('satellite-btn').addEventListener('click', function () {
        switchLayer('卫星影像');
        setActiveButton(this);
    });

    document.getElementById('terrain-btn').addEventListener('click', function () {
        switchLayer('地形地图');
        setActiveButton(this);
    });

    document.getElementById('3d-btn').addEventListener('click', function () {
        alert('3D模式需要加载额外资源，即将推出...');
        setActiveButton(this);
    });

    // 添加标记按钮
    document.getElementById('add-marker-btn').addEventListener('click', function () {
        if (!userLocation) {
            alert('请先获取您的位置');
            return;
        }

        const name = prompt('请输入地点名称:');
        if (name) {
            addSavedMarker(userLocation, name);
        }
    });

    // 绘制线路按钮
    document.getElementById('draw-line-btn').addEventListener('click', function () {
        alert('线路绘制功能即将推出...');
    });

    // 清除线路按钮
    document.getElementById('clear-lines-btn').addEventListener('click', function () {
        clearLines();
    });

    // 测量按钮
    document.getElementById('measure-distance-btn').addEventListener('click', function () {
        alert('距离测量功能即将推出...');
    });

    document.getElementById('measure-area-btn').addEventListener('click', function () {
        alert('面积测量功能即将推出...');
    });
}

// 切换图层
function switchLayer(layerName) {
    map.removeLayer(currentLayer);

    // 这里需要根据图层名称添加新图层
    // 简化实现，实际应根据initLayers中的图层组进行切换
    initLayers();
}

// 设置活动按钮
function setActiveButton(button) {
    // 移除同组中其他按钮的active类
    const parent = button.parentElement;
    const siblings = parent.querySelectorAll('button');
    siblings.forEach(btn => btn.classList.remove('active'));

    // 添加active类到当前按钮
    button.classList.add('active');
}

// 添加保存的标记
function addSavedMarker(latlng, name) {
    const marker = L.marker(latlng).addTo(map);
    marker.bindPopup(`<b>${name}</b><br>${latlng[0].toFixed(6)}, ${latlng[1].toFixed(6)}`);

    // 保存到localStorage
    const markers = JSON.parse(localStorage.getItem('savedMarkers') || '[]');
    markers.push({
        latlng: latlng,
        name: name
    });
    localStorage.setItem('savedMarkers', JSON.stringify(markers));

    // 更新UI
    updateSavedMarkersList();
}

// 清除线路
function clearLines() {
    // 清除所有绘制的线路
    drawnItems.clearLayers();

    // 清除localStorage中的线路数据
    localStorage.removeItem('savedRoutes');

    // 更新UI
    updateSavedRoutesList();
}

// 加载保存的数据
function loadSavedData() {
    updateSavedMarkersList();
    updateSavedRoutesList();
}

// 更新保存的标记列表
function updateSavedMarkersList() {
    const container = document.getElementById('saved-markers');
    container.innerHTML = '';

    const markers = JSON.parse(localStorage.getItem('savedMarkers') || '[]');

    if (markers.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:#888;padding:10px;">暂无收藏地点</p>';
        return;
    }

    markers.forEach((marker, index) => {
        const item = document.createElement('div');
        item.className = 'saved-item';
        item.innerHTML = `
                    <div>${marker.name}</div>
                    <div class="actions">
                        <button onclick="centerMap([${marker.latlng}])">定位</button>
                        <button onclick="deleteMarker(${index})">删除</button>
                    </div>
                `;
        container.appendChild(item);
    });
}

// 更新保存的路线列表
function updateSavedRoutesList() {
    const container = document.getElementById('saved-routes');
    container.innerHTML = '';

    const routes = JSON.parse(localStorage.getItem('savedRoutes') || '[]');

    if (routes.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:#888;padding:10px;">暂无保存路线</p>';
        return;
    }

    routes.forEach((route, index) => {
        const item = document.createElement('div');
        item.className = 'saved-item';
        item.innerHTML = `
                    <div>路线 ${index + 1}</div>
                    <div class="actions">
                        <button onclick="centerMap([${route.center}])">查看</button>
                        <button onclick="deleteRoute(${index})">删除</button>
                    </div>
                `;
        container.appendChild(item);
    });
}

// 居中地图到指定位置
function centerMap(latlng) {
    map.setView(latlng, 15);
}

// 删除标记
function deleteMarker(index) {
    const markers = JSON.parse(localStorage.getItem('savedMarkers') || '[]');
    markers.splice(index, 1);
    localStorage.setItem('savedMarkers', JSON.stringify(markers));
    updateSavedMarkersList();
}

// 删除路线
function deleteRoute(index) {
    const routes = JSON.parse(localStorage.getItem('savedRoutes') || '[]');
    routes.splice(index, 1);
    localStorage.setItem('savedRoutes', JSON.stringify(routes));
    updateSavedRoutesList();
}

// 页面加载完成后初始化地图
window.onload = initMap;