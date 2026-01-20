// 天地图密钥
const tiandituKey = '6e5b0e71ae628b8c2ab60c9144a7848e';

// 初始化地图
let map;
let currentLayer = 'satellite';
let firePointsLayer, historyLayer, boundariesLayer;

function initMap() {
    // 创建影像底图图层
    const imgLayer = new ol.layer.Tile({
        source: new ol.source.WMTS({
            url: 'http://t0.tianditu.gov.cn/img_w/wmts?tk=' + tiandituKey,
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
            url: 'http://t0.tianditu.gov.cn/ter_w/wmts?tk=' + tiandituKey,
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

    // 创建矢量底图图层
    const vecLayer = new ol.layer.Tile({
        source: new ol.source.WMTS({
            url: 'http://t0.tianditu.gov.cn/vec_w/wmts?tk=' + tiandituKey,
            layer: 'vec',
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

    // 创建火点图层
    const firePointsSource = new ol.source.Vector();
    firePointsLayer = new ol.layer.Vector({
        source: firePointsSource,
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

    // 创建历史火场边界图层
    const historySource = new ol.source.Vector();
    historyLayer = new ol.layer.Vector({
        source: historySource,
        style: new ol.style.Style({
            fill: new ol.style.Fill({
                color: 'rgba(231, 76, 60, 0.2)'
            }),
            stroke: new ol.style.Stroke({
                color: 'rgba(231, 76, 60, 0.8)',
                width: 2
            })
        })
    });

    // 创建行政边界图层
    const boundariesSource = new ol.source.Vector();
    boundariesLayer = new ol.layer.Vector({
        source: boundariesSource,
        style: new ol.style.Style({
            stroke: new ol.style.Stroke({
                color: 'rgba(52, 152, 219, 0.8)',
                width: 1
            })
        })
    });

    // 创建地图
    map = new ol.Map({
        target: 'map',
        layers: [imgLayer, firePointsLayer, historyLayer],
        view: new ol.View({
            center: ol.proj.fromLonLat([108.5, 34.5]), // 北京中心点
            zoom: 3
        })
    });

    // 添加数据
    addMockFirePoints();
    addMockHistoryBoundaries();
}

// 添加火点
function addMockFirePoints() {
    const firePoints = [
    ];

    firePoints.forEach(point => {
        const feature = new ol.Feature({
            geometry: new ol.geom.Point(ol.proj.fromLonLat([point[0], point[1]])),
            name: point[2],
            temperature: point[3]
        });
        firePointsLayer.getSource().addFeature(feature);
    });
}

// 添加历史火场边界
function addMockHistoryBoundaries() {
    // 创建边界
    const coordinates = [

    ].map(coord => ol.proj.fromLonLat(coord));

    const polygon = new ol.geom.Polygon([coordinates]);
    const feature = new ol.Feature({
        geometry: polygon,
        name: "2023-08-15 火场"
    });

    historyLayer.getSource().addFeature(feature);
}

// 切换地图图层
function switchLayer(layerType) {
    currentLayer = layerType;
    const baseLayer = map.getLayers().item(0);

    // 更新控制按钮状态
    document.getElementById('satelliteBtn').classList.toggle('active', layerType === 'satellite');
    document.getElementById('terrainBtn').classList.toggle('active', layerType === 'terrain');
    document.getElementById('vectorBtn').classList.toggle('active', layerType === 'vector');

    if (layerType === 'satellite') {
        baseLayer.setSource(new ol.source.WMTS({
            url: 'http://t0.tianditu.gov.cn/img_w/wmts?tk=' + tiandituKey,
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
            url: 'http://t0.tianditu.gov.cn/ter_w/wmts?tk=' + tiandituKey,
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
    } else if (layerType === 'vector') {
        baseLayer.setSource(new ol.source.WMTS({
            url: 'http://t0.tianditu.gov.cn/vec_w/wmts?tk=' + tiandituKey,
            layer: 'vec',
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

// 切换火点显示
function toggleFirePoints() {
    const isVisible = firePointsLayer.getVisible();
    firePointsLayer.setVisible(!isVisible);

    // 更新按钮状态
    document.getElementById('firePointsBtn').classList.toggle('active', !isVisible);
}

// 切换历史火场显示
function toggleHistoryBoundaries() {
    const isVisible = historyLayer.getVisible();
    historyLayer.setVisible(!isVisible);

    // 更新按钮状态
    document.getElementById('historyBtn').classList.toggle('active', !isVisible);
}

// 切换图层显示
function toggleLayer(layerType) {
    const layerItem = event.currentTarget;
    layerItem.classList.toggle('active');

    // 在实际应用中，这里会根据layerType控制对应图层的显示/隐藏
    // 这里只是
    alert('切换图层: ' + layerType);
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function () {
    initMap();
});