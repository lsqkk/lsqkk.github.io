// 卫星页面专用JavaScript
let satelliteMap;

document.addEventListener('DOMContentLoaded', function () {
    initSatelliteMap();
});

async function initSatelliteMap() {
    try {
        await waitForTMap();

        satelliteMap = new T.Map('satelliteMap');
        const center = new T.LngLat(108.990221, 34.252705);
        satelliteMap.centerAndZoom(center, 8);

        // 添加卫星图层
        const satelliteLayer = new T.TileLayer('img_w', {
            minZoom: 3,
            maxZoom: 18
        });
        satelliteMap.addLayer(satelliteLayer);

        // 添加热源点模拟数据
        addHotspotMarkers();

    } catch (error) {
        console.error('卫星地图初始化失败:', error);
    }
}

function addHotspotMarkers() {
    if (!satelliteMap) return;

    // 模拟热源点数据
    const hotspots = [
        { lng: 108.8, lat: 34.1, intensity: 85 },
        { lng: 109.2, lat: 34.3, intensity: 45 },
        { lng: 108.5, lat: 33.9, intensity: 70 }
    ];

    hotspots.forEach(hotspot => {
        const marker = new T.Marker(new T.LngLat(hotspot.lng, hotspot.lat));

        let color;
        if (hotspot.intensity > 80) color = '#e53e3e';
        else if (hotspot.intensity > 60) color = '#ed8936';
        else color = '#ecc94b';

        marker.setIcon(new T.Icon({
            iconUrl: `data:image/svg+xml;base64,${btoa(`
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="10" cy="10" r="8" fill="${color}" fill-opacity="0.7"/>
                    <circle cx="10" cy="10" r="4" fill="${color}"/>
                </svg>
            `)}`,
            iconSize: new T.Point(20, 20),
            iconAnchor: new T.Point(10, 10)
        }));

        satelliteMap.addOverLay(marker);
    });
}

function toggleHeatmap() {
    alert('热力图功能开发中...');
}

function refreshSatellite() {
    if (satelliteMap) {
        satelliteMap.clearOverLays();
        addHotspotMarkers();
        alert('卫星数据已更新');
    }
}