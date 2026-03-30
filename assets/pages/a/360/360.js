
// 交大360全景平台 - 核心脚本
const API_BASE = '__API_BASE__';
const DB_ROOT = 'xjtu360';
const DB_SCENES = `${DB_ROOT}/scenes`;
const DB_PENDING = `${DB_ROOT}/pending`;
const DB_META = `${DB_ROOT}/meta`;
const ADMIN_TOKEN_KEY = 'xjtu360_admin_token';
const MAP_BOUNDS = {
    nw: [108.97932615618622, 34.25098474333452],
    se: [108.98800060553368, 34.241275648541404]
};

let currentViewer = null;
let currentScene = null;
let scenesData = [];
let pendingData = [];
let database = null;
let map = null;
let vectorSource = null;
let previewViewer = null;
let isUnlocked = localStorage.getItem('watermarkUnlocked') === 'true';
let isMobile = false;
let isAdmin = false;
let pickMode = null;
let uploadFile = null;

const el = {};


function loadScriptOnce(src, id) {
    return new Promise((resolve, reject) => {
        const existing = id ? document.getElementById(id) : null;
        if (existing) {
            if (window.ol) {
                resolve();
                return;
            }
            const onLoad = () => {
                cleanup();
                resolve();
            };
            const onError = () => {
                cleanup();
                reject(new Error(`load script failed: ${src}`));
            };
            const cleanup = () => {
                existing.removeEventListener('load', onLoad);
                existing.removeEventListener('error', onError);
            };
            existing.addEventListener('load', onLoad);
            existing.addEventListener('error', onError);
            const started = Date.now();
            const timer = window.setInterval(() => {
                if (window.ol) {
                    cleanup();
                    window.clearInterval(timer);
                    resolve();
                    return;
                }
                if (Date.now() - started > 10000) {
                    cleanup();
                    window.clearInterval(timer);
                    reject(new Error(`load script timeout: ${src}`));
                }
            }, 120);
            return;
        }
        const script = document.createElement('script');
        if (id) script.id = id;
        script.src = src;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`load script failed: ${src}`));
        document.head.appendChild(script);
    });
}

async function ensureOpenLayers() {
    if (window.ol) return;
    await loadScriptOnce('https://cdn.jsdelivr.net/npm/ol@7.3.0/dist/ol.js', 'ol-lib');
}

async function ensureTiandituKey(timeout = 5000) {
    if (window.TIANDITU_KEY) return window.TIANDITU_KEY;
    try {
        await loadScriptOnce(`${API_BASE}/api/keys?names=tianditu`, 'tianditu-key');
    } catch {
        // ignore load error, will fallback to timeout
    }
    if (window.TIANDITU_KEY) return window.TIANDITU_KEY;
    const started = Date.now();
    return new Promise((resolve, reject) => {
        const timer = window.setInterval(() => {
            if (window.TIANDITU_KEY) {
                window.clearInterval(timer);
                resolve(window.TIANDITU_KEY);
                return;
            }
            if (Date.now() - started > timeout) {
                window.clearInterval(timer);
                reject(new Error('TIANDITU_KEY timeout'));
            }
        }, 150);
    });
}



function cacheElements() {
    el.leftPanel = document.getElementById('leftPanel');
    el.toggleLeft = document.getElementById('toggleLeft');
    el.collapseLeft = document.getElementById('collapseLeft');
    el.mobileMenuToggle = document.getElementById('mobileMenuToggle');
    el.uploadArea = document.getElementById('uploadArea');
    el.fileInput = document.getElementById('fileInput');
    el.sceneNameInput = document.getElementById('sceneNameInput');
    el.sceneUserInput = document.getElementById('sceneUserInput');
    el.sceneLatInput = document.getElementById('sceneLatInput');
    el.sceneLngInput = document.getElementById('sceneLngInput');
    el.pickPointBtn = document.getElementById('pickPointBtn');
    el.submitUploadBtn = document.getElementById('submitUploadBtn');
    el.uploadPreview = document.getElementById('uploadPreview');
    el.uploadStatus = document.getElementById('uploadStatus');
    el.searchInput = document.getElementById('searchInput');
    el.sceneList = document.getElementById('sceneList');
    el.mapTip = document.getElementById('mapTip');
    el.previewPanorama = document.getElementById('previewPanorama');
    el.adminLoginForm = document.getElementById('adminLoginForm');
    el.adminPassword = document.getElementById('adminPassword');
    el.adminLoginBtn = document.getElementById('adminLoginBtn');
    el.adminActions = document.getElementById('adminActions');
    el.adminLogoutBtn = document.getElementById('adminLogoutBtn');
    el.adminStatus = document.getElementById('adminStatus');
    el.pendingSection = document.getElementById('pendingSection');
    el.pendingList = document.getElementById('pendingList');
    el.missingCoordsSection = document.getElementById('missingCoordsSection');
    el.missingCoordsList = document.getElementById('missingCoordsList');
    el.watermark = document.getElementById('watermark');
    el.passwordDialog = document.getElementById('passwordDialog');
    el.passwordInput = document.getElementById('passwordInput');
    el.passwordError = document.getElementById('passwordError');
    el.confirmPassword = document.getElementById('confirmPassword');
    el.cancelPassword = document.getElementById('cancelPassword');
}

function detectDeviceType() {
    isMobile = window.innerWidth <= 768;
    window.addEventListener('resize', () => {
        isMobile = window.innerWidth <= 768;
    });
}

function initMobileLayout() {
    if (!isMobile) return;
    if (el.leftPanel) el.leftPanel.style.display = 'none';
}

async function ensureFirebaseDatabase() {
    if (database) return database;
    if (window.QuarkFirebaseReady && typeof window.QuarkFirebaseReady.ensureDatabase === 'function') {
        database = await window.QuarkFirebaseReady.ensureDatabase({ loadConfig: true });
        return database;
    }
    if (window.firebase && window.firebase.database) {
        if (!window.firebase.apps || !window.firebase.apps.length) {
            if (window.firebaseConfig && window.firebaseConfig.projectId) {
                window.firebase.initializeApp(window.firebaseConfig);
            }
        }
        database = window.firebase.database();
        return database;
    }
    throw new Error('Firebase 未就绪');
}

function getLoginProfile() {
    if (window.CommentShared && typeof window.CommentShared.getLoginProfile === 'function') {
        return window.CommentShared.getLoginProfile();
    }
    return { nickname: '', login: '', loginType: '', isLoggedUser: false };
}

function setUploadStatus(text) {
    if (el.uploadStatus) el.uploadStatus.textContent = text;
}

function setAdminStatus(text) {
    if (el.adminStatus) el.adminStatus.textContent = text;
}

function updateLoginPrefill() {
    const profile = getLoginProfile();
    const name = profile.nickname || profile.login || '';
    if (el.sceneUserInput && name) {
        el.sceneUserInput.value = name;
    }
}


async function bootstrapScenesFromJson() {
    let jsonData = [];
    try {
        const resp = await fetch('/assets/pages/a/360/scenes.json', { cache: 'no-store' });
        if (resp.ok) jsonData = await resp.json();
    } catch (error) {
        console.warn('读取 scenes.json 失败:', error);
    }
    if (!Array.isArray(jsonData) || jsonData.length === 0) return;
    scenesData = jsonData.map((scene, idx) => ({
        id: scene.id || `json_${idx}`,
        name: scene.name,
        contributor: scene.contributor || '未知',
        path: scene.path,
        lat: scene.lat ?? null,
        lng: scene.lng ?? null,
        source: 'json'
    }));
    renderSceneList(el.searchInput ? el.searchInput.value : '');
    refreshMapMarkers();
    if (!currentScene && scenesData.length > 0) {
        void loadScene(scenesData[0]);
    }
}

async function seedScenesIfNeeded() {
    const metaSnap = await database.ref(DB_META).once('value');
    const meta = metaSnap?.val() || {};
    const scenesSnap = await database.ref(DB_SCENES).once('value');
    const existing = scenesSnap && scenesSnap.val ? (scenesSnap.val() || {}) : {};
    const existingList = Object.values(existing || {});
    const existingKeySet = new Set(
        existingList.map((item) => `${item?.name || ''}@@${item?.path || ''}`)
    );

    let jsonData = [];
    try {
        const resp = await fetch('/assets/pages/a/360/scenes.json', { cache: 'no-store' });
        if (resp.ok) jsonData = await resp.json();
    } catch (error) {
        console.warn('读取 scenes.json 失败:', error);
    }

    if (!Array.isArray(jsonData) || jsonData.length === 0) {
        return;
    }

    const now = Date.now();
    let seededCount = 0;
    for (const scene of jsonData) {
        if (!scene || !scene.name || !scene.path) continue;
        const key = `${scene.name}@@${scene.path}`;
        if (existingKeySet.has(key)) continue;
        try {
            await database.ref(DB_SCENES).push({
                name: scene.name,
                contributor: scene.contributor || '未知',
                path: scene.path,
                lat: scene.lat ?? null,
                lng: scene.lng ?? null,
                createdAt: now,
                approvedAt: now,
                source: 'seed'
            });
            seededCount += 1;
        } catch (error) {
            console.warn('seed scene failed:', scene.name, error);
        }
    }
    if (seededCount > 0 || !meta.seeded) {
        await database.ref(DB_META).update({
            seeded: true,
            seededAt: Date.now(),
            seededCount: (meta.seededCount || 0) + seededCount
        });
    }
}

function watchScenes() {
    database.ref(DB_SCENES).on('value', (snapshot) => {
        scenesData = normalizeSnapshot(snapshot);
        renderSceneList(el.searchInput ? el.searchInput.value : '');
        refreshMapMarkers();
        renderMissingCoords();
        if (!currentScene && scenesData.length > 0) {
            void loadScene(scenesData[0]);
        }
    });
}

function watchPending() {
    database.ref(DB_PENDING).on('value', (snapshot) => {
        pendingData = normalizeSnapshot(snapshot);
        renderPendingList();
        refreshMapMarkers();
    });
}

function normalizeSnapshot(snapshot) {
    if (!snapshot || !snapshot.val) return [];
    const data = snapshot.val() || {};
    return Object.keys(data).map((id) => {
        const item = data[id] || {};
        const latNum = typeof item.lat === 'number' ? item.lat : parseFloat(item.lat);
        const lngNum = typeof item.lng === 'number' ? item.lng : parseFloat(item.lng);
        return {
            id,
            ...item,
            lat: Number.isNaN(latNum) ? null : latNum,
            lng: Number.isNaN(lngNum) ? null : lngNum
        };
    }).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function renderSceneList(filter = '') {
    if (!el.sceneList) return;
    el.sceneList.innerHTML = '';

    const lower = filter.trim().toLowerCase();
    const filtered = scenesData.filter((scene) => {
        const name = String(scene.name || '').toLowerCase();
        const contributor = String(scene.contributor || '').toLowerCase();
        return !lower || name.includes(lower) || contributor.includes(lower);
    });

    if (filtered.length === 0) {
        el.sceneList.innerHTML = '<p style="text-align:center;color:#666;">未找到匹配的场景</p>';
        return;
    }

    filtered.forEach((scene) => {
        const sceneItem = document.createElement('div');
        sceneItem.className = 'scene-item';
        if (currentScene && currentScene.id === scene.id) {
            sceneItem.classList.add('active');
        }
        const hasCoords = typeof scene.lat === 'number' && typeof scene.lng === 'number';
        const coordText = hasCoords ? `坐标: ${scene.lat.toFixed(5)}, ${scene.lng.toFixed(5)}` : '坐标缺失';
        sceneItem.innerHTML = `
            <div class="scene-thumb"><i class="fas fa-map-marker-alt"></i></div>
            <div class="scene-info">
                <h4 class="scene-name">${escapeHtml(scene.name || '未命名')}</h4>
                <p class="scene-contributor">贡献者: ${escapeHtml(scene.contributor || '未知')}</p>
                <p class="scene-contributor">${coordText}</p>
            </div>
        `;
        sceneItem.addEventListener('click', () => {
            void loadScene(scene);
            if (isMobile) {
                el.leftPanel?.classList.remove('panel-mobile-visible');
            }
        });
        if (isAdmin) {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn ghost';
            deleteBtn.textContent = '删除';
            deleteBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                void deleteScene(scene.id);
            });
            sceneItem.appendChild(deleteBtn);
        }
        el.sceneList.appendChild(sceneItem);
    });
}
async function loadScene(scene) {
    if (!scene) return;
    currentScene = scene;

    document.querySelectorAll('.scene-item').forEach((item) => item.classList.remove('active'));

    let panoramaPath = scene.path;
    if (isMobile && scene.path && !scene.path.startsWith('data:')) {
        try {
            panoramaPath = await getMobilePanorama(scene.path);
        } catch (error) {
            panoramaPath = scene.path;
        }
    }

    if (currentViewer) {
        currentViewer.destroy();
    }

    currentViewer = pannellum.viewer('panorama', {
        type: 'equirectangular',
        panorama: panoramaPath,
        autoLoad: true,
        showControls: true,
        autoRotate: true,
        hotSpots: []
    });

    updateWatermark(scene);
    currentViewer.on('load', function () {
        addCustomContextMenuItem(currentViewer);
    });
}

async function getMobilePanorama(url) {
    const resp = await fetch(url, { mode: 'cors' });
    if (!resp.ok) throw new Error('image fetch failed');
    const blob = await resp.blob();
    const img = await loadImageFromBlob(blob);
    const maxWidth = 4096;
    const scale = Math.min(1, maxWidth / img.width);
    if (scale >= 1) return url;

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(img.width * scale);
    canvas.height = Math.floor(img.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.9);
}

function loadImageFromBlob(blob) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(blob);
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('image load failed'));
        };
        img.src = url;
    });
}

function updateWatermark(scene) {
    if (!el.watermark) return;
    if (isUnlocked) {
        el.watermark.style.display = 'none';
        return;
    }
    if (scene && scene.contributor) {
        el.watermark.textContent = `交大360° | 夸克博客 | ${scene.contributor} | ${scene.name}`;
        el.watermark.style.display = 'block';
    } else {
        el.watermark.style.display = 'none';
    }
}

function checkWatermarkStatus() {
    isUnlocked = localStorage.getItem('watermarkUnlocked') === 'true';
    if (isUnlocked && el.watermark) {
        el.watermark.style.display = 'none';
    }
}

function setupEventListeners() {
    if (el.searchInput) {
        el.searchInput.addEventListener('input', (e) => {
            renderSceneList(e.target.value);
        });
    }

    if (el.uploadArea) {
        el.uploadArea.addEventListener('click', () => el.fileInput?.click());
        el.uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            el.uploadArea.style.borderColor = 'var(--primary-color)';
            el.uploadArea.style.background = 'rgba(52, 152, 219, 0.1)';
        });
        el.uploadArea.addEventListener('dragleave', () => {
            el.uploadArea.style.borderColor = '#ddd';
            el.uploadArea.style.background = 'rgba(240, 240, 240, 0.5)';
        });
        el.uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            el.uploadArea.style.borderColor = '#ddd';
            el.uploadArea.style.background = 'rgba(240, 240, 240, 0.5)';
            const file = e.dataTransfer.files && e.dataTransfer.files[0];
            if (file) handleFileSelected(file);
        });
    }

    if (el.fileInput) {
        el.fileInput.addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            if (file) handleFileSelected(file);
        });
    }

    if (el.pickPointBtn) {
        el.pickPointBtn.addEventListener('click', () => {
            setPickMode({ type: 'upload' });
        });
    }

    if (el.submitUploadBtn) {
        el.submitUploadBtn.addEventListener('click', () => { void submitUpload(); });
    }

    if (el.collapseLeft) {
        el.collapseLeft.addEventListener('click', () => togglePanel('leftPanel', 'toggleLeft'));
    }
    if (el.toggleLeft) {
        el.toggleLeft.addEventListener('click', () => togglePanel('leftPanel', 'toggleLeft'));
    }

    if (el.mobileMenuToggle) {
        el.mobileMenuToggle.addEventListener('click', () => toggleMobilePanel('leftPanel'));
    }

    if (el.adminLoginBtn) {
        el.adminLoginBtn.addEventListener('click', () => { void adminLogin(); });
    }
    if (el.adminLogoutBtn) {
        el.adminLogoutBtn.addEventListener('click', () => logoutAdmin());
    }

    if (el.confirmPassword) {
        el.confirmPassword.addEventListener('click', () => { void verifyPassword(); });
    }
    if (el.cancelPassword) {
        el.cancelPassword.addEventListener('click', () => {
            if (el.passwordDialog) el.passwordDialog.style.display = 'none';
        });
    }
    if (el.passwordInput) {
        el.passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                void verifyPassword();
            }
        });
    }

    if (el.watermark) {
        el.watermark.addEventListener('dblclick', () => {
            if (!isUnlocked && el.passwordDialog) {
                el.passwordDialog.style.display = 'flex';
            }
        });
    }
}

function handleFileSelected(file) {
    if (!file || !file.type.startsWith('image/')) {
        alert('请上传图片文件');
        return;
    }
    uploadFile = file;
    if (el.uploadPreview) {
        el.uploadPreview.innerHTML = `已选择：${escapeHtml(file.name)}`;
        const reader = new FileReader();
        reader.onload = () => {
            const img = document.createElement('img');
            img.src = String(reader.result || '');
            img.alt = file.name;
            el.uploadPreview.appendChild(img);
        };
        reader.readAsDataURL(file);
    }
    setUploadStatus('图片已选择，填写信息后提交审核');
}

async function submitUpload() {
    if (!uploadFile) {
        setUploadStatus('请先选择图片');
        return;
    }
    const name = (el.sceneNameInput?.value || '').trim();
    const contributor = (el.sceneUserInput?.value || '').trim();
    const lat = parseFloat(el.sceneLatInput?.value || '');
    const lng = parseFloat(el.sceneLngInput?.value || '');

    if (!name || !contributor) {
        setUploadStatus('请填写地点名称和上传者');
        return;
    }
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
        setUploadStatus('请填写经纬度或在地图上选点');
        return;
    }

    try {
        setUploadStatus('上传中...');
        if (el.submitUploadBtn) el.submitUploadBtn.disabled = true;

        const presign = await requestPresignedUpload(uploadFile.name, uploadFile.type, 'xjtu360');
        await uploadToR2(presign.uploadUrl, uploadFile, uploadFile.type);

        const profile = getLoginProfile();
        const payload = {
            name,
            contributor,
            path: presign.publicUrl,
            lat,
            lng,
            createdAt: Date.now(),
            uploaderUid: profile.uid || '',
            uploaderLogin: profile.login || '',
            status: 'pending'
        };

        await database.ref(DB_PENDING).push(payload);

        setUploadStatus('已提交审核，管理员通过后对所有人可见');
        resetUploadForm();
    } catch (error) {
        console.error('上传失败:', error);
        setUploadStatus('上传失败，请稍后重试');
    } finally {
        if (el.submitUploadBtn) el.submitUploadBtn.disabled = false;
    }
}

function resetUploadForm() {
    uploadFile = null;
    if (el.fileInput) el.fileInput.value = '';
    if (el.sceneNameInput) el.sceneNameInput.value = '';
    updateLoginPrefill();
    if (el.sceneLatInput) el.sceneLatInput.value = '';
    if (el.sceneLngInput) el.sceneLngInput.value = '';
    if (el.uploadPreview) el.uploadPreview.innerHTML = '';
}

async function requestPresignedUpload(fileName, contentType, folder) {
    const resp = await fetch(`${API_BASE}/api/r2-presign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            originalName: fileName,
            contentType: contentType || 'application/octet-stream',
            folder: folder || 'xjtu360'
        })
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data?.uploadUrl || !data?.publicUrl) {
        throw new Error(data?.error || '获取上传链接失败');
    }
    return data;
}

async function uploadToR2(uploadUrl, file, contentType) {
    const resp = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType || 'application/octet-stream' },
        body: file
    });
    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`R2 上传失败（${resp.status}）：${text.slice(0, 120)}`);
    }
}

async function initMap() {
    if (!window.ol) {
        try {
            await ensureOpenLayers();
        } catch (error) {
            const mapEl = document.getElementById('sceneMap');
            if (mapEl) mapEl.innerHTML = '<div style="padding:12px;color:#666;">地图库加载失败</div>';
            console.error('OpenLayers 未就绪', error);
            return;
        }
    }
    if (!window.ol) {
        console.error('OpenLayers 未就绪');
        return;
    }
    let TIANDITU_KEY = window.TIANDITU_KEY || '';
    if (!TIANDITU_KEY) {
        try {
            TIANDITU_KEY = await ensureTiandituKey();
        } catch (error) {
            TIANDITU_KEY = '';
        }
    }
    const mapEl = document.getElementById('sceneMap');
    if (!mapEl) return;

    if (!TIANDITU_KEY) {
        mapEl.innerHTML = '<div style="padding:12px;color:#666;">地图服务未配置</div>';
        return;
    }

    const vecLayer = new ol.layer.Tile({
        source: new ol.source.WMTS({
            url: 'https://t0.tianditu.gov.cn/vec_w/wmts?tk=' + TIANDITU_KEY,
            layer: 'vec',
            style: 'default',
            matrixSet: 'w',
            format: 'tiles',
            projection: 'EPSG:3857',
            tileGrid: buildTiandituTileGrid()
        })
    });
    const cvaLayer = new ol.layer.Tile({
        source: new ol.source.WMTS({
            url: 'https://t0.tianditu.gov.cn/cva_w/wmts?tk=' + TIANDITU_KEY,
            layer: 'cva',
            style: 'default',
            matrixSet: 'w',
            format: 'tiles',
            projection: 'EPSG:3857',
            tileGrid: buildTiandituTileGrid()
        })
    });

    vectorSource = new ol.source.Vector();
    const vectorLayer = new ol.layer.Vector({
        source: vectorSource,
        style: (feature) => {
            const status = feature.get('status') || 'approved';
            const color = status === 'pending' ? 'rgba(255, 107, 53, 0.85)' : 'rgba(52, 152, 219, 0.85)';
            return new ol.style.Style({
                image: new ol.style.Circle({
                    radius: 7,
                    fill: new ol.style.Fill({ color }),
                    stroke: new ol.style.Stroke({ color: '#fff', width: 2 })
                })
            });
        }
    });

    map = new ol.Map({
        target: 'sceneMap',
        layers: [vecLayer, cvaLayer, vectorLayer],
        view: new ol.View({
            center: ol.proj.fromLonLat([108.983, 34.246]),
            zoom: 16
        })
    });

    fitMapToCampus();

    map.on('click', (evt) => {
        const [lon, lat] = ol.proj.toLonLat(evt.coordinate);
        if (pickMode) {
            applyPickedPoint(lat, lon);
            return;
        }
        const feature = map.forEachFeatureAtPixel(evt.pixel, (ft) => ft);
        if (feature) {
            const sceneId = feature.get('sceneId');
            const pendingId = feature.get('pendingId');
            if (sceneId) {
                const scene = scenesData.find((s) => s.id === sceneId);
                if (scene) void loadScene(scene);
            } else if (pendingId) {
                const pending = pendingData.find((p) => p.id === pendingId);
                if (pending) {
                    setUploadStatus(`待审核：${pending.name}`);
                }
            }
        }
    });
    refreshMapMarkers();
}

function buildTiandituTileGrid() {
    return new ol.tilegrid.WMTS({
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
    });
}

function fitMapToCampus() {
    if (!map) return;
    const nw = ol.proj.fromLonLat(MAP_BOUNDS.nw);
    const se = ol.proj.fromLonLat(MAP_BOUNDS.se);
    const extent = [nw[0], se[1], se[0], nw[1]];
    const padding = 40;
    map.getView().fit(extent, { padding: [padding, padding, padding, padding], duration: 300 });
}

function refreshMapMarkers() {
    if (!vectorSource) return;
    vectorSource.clear();

    scenesData.forEach((scene) => {
        if (typeof scene.lat !== 'number' || typeof scene.lng !== 'number') return;
        const feature = new ol.Feature({
            geometry: new ol.geom.Point(ol.proj.fromLonLat([scene.lng, scene.lat]))
        });
        feature.set('sceneId', scene.id);
        feature.set('status', 'approved');
        vectorSource.addFeature(feature);
    });

    if (isAdmin) {
        pendingData.forEach((scene) => {
            if (typeof scene.lat !== 'number' || typeof scene.lng !== 'number') return;
            const feature = new ol.Feature({
                geometry: new ol.geom.Point(ol.proj.fromLonLat([scene.lng, scene.lat]))
            });
            feature.set('pendingId', scene.id);
            feature.set('status', 'pending');
            vectorSource.addFeature(feature);
        });
    }
}

function setPickMode(mode) {
    pickMode = mode;
    if (el.mapTip) {
        el.mapTip.textContent = '请在地图上点击选择坐标';
    }
}

function applyPickedPoint(lat, lng) {
    if (!pickMode) return;
    if (pickMode.type === 'upload') {
        if (el.sceneLatInput) el.sceneLatInput.value = lat.toFixed(6);
        if (el.sceneLngInput) el.sceneLngInput.value = lng.toFixed(6);
    } else if (pickMode.type === 'scene') {
        const latEl = document.getElementById(`scene-lat-${pickMode.id}`);
        const lngEl = document.getElementById(`scene-lng-${pickMode.id}`);
        if (latEl) latEl.value = lat.toFixed(6);
        if (lngEl) lngEl.value = lng.toFixed(6);
    } else if (pickMode.type === 'pending') {
        const latEl = document.getElementById(`pending-lat-${pickMode.id}`);
        const lngEl = document.getElementById(`pending-lng-${pickMode.id}`);
        if (latEl) latEl.value = lat.toFixed(6);
        if (lngEl) lngEl.value = lng.toFixed(6);
    }
    pickMode = null;
    if (el.mapTip) el.mapTip.textContent = '点击地图可选择经纬度';
}

function renderPendingList() {
    if (!el.pendingList) return;
    el.pendingList.innerHTML = '';
    if (!isAdmin) return;

    if (!pendingData.length) {
        el.pendingList.innerHTML = '<div class="admin-item">暂无待审核内容</div>';
        return;
    }

    pendingData.forEach((item) => {
        const block = document.createElement('div');
        block.className = 'admin-item';
        block.innerHTML = `
            <div><strong>${escapeHtml(item.name || '未命名')}</strong></div>
            <div class="meta">上传者: ${escapeHtml(item.contributor || '未知')}</div>
            <div class="field row">
                <input id="pending-lat-${item.id}" type="number" step="0.000001" placeholder="纬度" value="${formatNumber(item.lat)}">
                <input id="pending-lng-${item.id}" type="number" step="0.000001" placeholder="经度" value="${formatNumber(item.lng)}">
            </div>
            <div class="actions">
                <button class="btn ghost" data-action="preview">预览全景</button>
                <button class="btn ghost" data-action="pick">地图选点</button>
                <button class="btn primary" data-action="approve">通过</button>
                <button class="btn ghost" data-action="reject">删除</button>
            </div>
        `;
        block.querySelector('[data-action="preview"]').addEventListener('click', () => {
            previewPanorama(item);
        });
        block.querySelector('[data-action="pick"]').addEventListener('click', () => {
            setPickMode({ type: 'pending', id: item.id });
        });
        block.querySelector('[data-action="approve"]').addEventListener('click', () => {
            const lat = parseFloat(document.getElementById(`pending-lat-${item.id}`).value || '');
            const lng = parseFloat(document.getElementById(`pending-lng-${item.id}`).value || '');
            void approvePending(item.id, lat, lng);
        });
        block.querySelector('[data-action="reject"]').addEventListener('click', () => {
            void deletePending(item.id);
        });
        el.pendingList.appendChild(block);
    });
}

function renderMissingCoords() {
    if (!el.missingCoordsList) return;
    el.missingCoordsList.innerHTML = '';
    if (!isAdmin) return;

    const missing = scenesData.filter((scene) => !(typeof scene.lat === 'number' && typeof scene.lng === 'number'));
    if (!missing.length) {
        el.missingCoordsList.innerHTML = '<div class="admin-item">坐标已齐全</div>';
        return;
    }

    missing.forEach((scene) => {
        const block = document.createElement('div');
        block.className = 'admin-item';
        block.innerHTML = `
            <div><strong>${escapeHtml(scene.name || '未命名')}</strong></div>
            <div class="meta">贡献者: ${escapeHtml(scene.contributor || '未知')}</div>
            <div class="field row">
                <input id="scene-lat-${scene.id}" type="number" step="0.000001" placeholder="纬度" value="${formatNumber(scene.lat)}">
                <input id="scene-lng-${scene.id}" type="number" step="0.000001" placeholder="经度" value="${formatNumber(scene.lng)}">
            </div>
            <div class="actions">
                <button class="btn ghost" data-action="pick">地图选点</button>
                <button class="btn primary" data-action="save">保存</button>
            </div>
        `;
        block.querySelector('[data-action="pick"]').addEventListener('click', () => {
            setPickMode({ type: 'scene', id: scene.id });
        });
        block.querySelector('[data-action="save"]').addEventListener('click', () => {
            const lat = parseFloat(document.getElementById(`scene-lat-${scene.id}`).value || '');
            const lng = parseFloat(document.getElementById(`scene-lng-${scene.id}`).value || '');
            void updateSceneCoords(scene.id, lat, lng);
        });
        el.missingCoordsList.appendChild(block);
    });
}

async function approvePending(id, lat, lng) {
    if (!isAdmin) return;
    const item = pendingData.find((p) => p.id === id);
    if (!item) return;
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
        alert('请填写经纬度');
        return;
    }

    const payload = {
        name: item.name || '未命名',
        contributor: item.contributor || '未知',
        path: item.path,
        lat,
        lng,
        createdAt: item.createdAt || Date.now(),
        approvedAt: Date.now(),
        source: 'user'
    };

    await database.ref(DB_SCENES).push(payload);
    await database.ref(`${DB_PENDING}/${id}`).remove();
}

async function deletePending(id) {
    if (!isAdmin) return;
    await database.ref(`${DB_PENDING}/${id}`).remove();
}

async function updateSceneCoords(id, lat, lng) {
    if (!isAdmin) return;
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
        alert('请填写经纬度');
        return;
    }
    await database.ref(`${DB_SCENES}/${id}`).update({ lat, lng, updatedAt: Date.now() });
}

async function deleteScene(id) {
    if (!isAdmin) return;
    const ok = confirm('确定要删除该场景吗？');
    if (!ok) return;
    await database.ref(`${DB_SCENES}/${id}`).remove();
}

async function previewPanorama(scene) {
    if (!scene || !scene.path) return;
    if (!el.previewPanorama) return;
    let panoramaPath = scene.path;
    if (isMobile && scene.path && !scene.path.startsWith('data:')) {
        try {
            panoramaPath = await getMobilePanorama(scene.path);
        } catch {
            panoramaPath = scene.path;
        }
    }
    if (previewViewer) {
        previewViewer.destroy();
    }
    previewViewer = pannellum.viewer('previewPanorama', {
        type: 'equirectangular',
        panorama: panoramaPath,
        autoLoad: true,
        showControls: true
    });
}
function getAdminToken() {
    return localStorage.getItem(ADMIN_TOKEN_KEY) || '';
}

function setAdminToken(token) {
    if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token);
    else localStorage.removeItem(ADMIN_TOKEN_KEY);
}

async function verifyAdminSession() {
    const token = getAdminToken();
    if (!token) {
        isAdmin = false;
        updateAdminUI();
        return false;
    }
    try {
        const response = await fetch(`${API_BASE}/api/admin-verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
        });
        const result = await response.json();
        isAdmin = !!(response.ok && result.valid);
        if (!isAdmin) setAdminToken('');
    } catch (error) {
        console.error('校验管理员会话失败:', error);
        isAdmin = false;
    }
    updateAdminUI();
    return isAdmin;
}

async function adminLogin() {
    const password = (el.adminPassword?.value || '').trim();
    if (!password) {
        alert('请输入管理员密码');
        return;
    }

    if (el.adminLoginBtn) {
        el.adminLoginBtn.disabled = true;
        el.adminLoginBtn.textContent = '验证中...';
    }

    try {
        const hash = await sha256(password);
        const response = await fetch(`${API_BASE}/api/admin-auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ passwordHash: hash })
        });
        const result = await response.json();
        if (response.ok && result.success && result.token) {
            isAdmin = true;
            setAdminToken(result.token);
            if (el.adminPassword) el.adminPassword.value = '';
            setAdminStatus('管理员已登录');
            updateAdminUI();
        } else {
            alert('密码错误');
        }
    } catch (error) {
        console.error('管理员登录失败:', error);
        alert('登录失败，请稍后重试');
    } finally {
        if (el.adminLoginBtn) {
            el.adminLoginBtn.disabled = false;
            el.adminLoginBtn.textContent = '管理员登录';
        }
    }
}

function logoutAdmin() {
    isAdmin = false;
    setAdminToken('');
    updateAdminUI();
}

function updateAdminUI() {
    if (el.adminLoginForm) el.adminLoginForm.style.display = isAdmin ? 'none' : 'flex';
    if (el.adminActions) el.adminActions.style.display = isAdmin ? 'flex' : 'none';
    if (el.pendingSection) el.pendingSection.style.display = isAdmin ? 'block' : 'none';
    if (el.missingCoordsSection) el.missingCoordsSection.style.display = isAdmin ? 'block' : 'none';
    if (isAdmin) {
        setAdminStatus('管理员已登录');
    } else {
        setAdminStatus('管理员未登录');
    }
    refreshMapMarkers();
    renderPendingList();
    renderMissingCoords();
}

async function verifyPassword() {
    const password = el.passwordInput?.value || '';
    if (el.passwordError) el.passwordError.style.display = 'none';

    try {
        const hash = await sha256(password);
        const response = await fetch(`${API_BASE}/api/admin-auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ passwordHash: hash })
        });
        const result = await response.json();
        if (response.ok && result.success) {
            isUnlocked = true;
            localStorage.setItem('watermarkUnlocked', 'true');
            if (el.watermark) el.watermark.style.display = 'none';
            if (el.passwordDialog) el.passwordDialog.style.display = 'none';
            if (el.passwordInput) el.passwordInput.value = '';
        } else {
            if (el.passwordError) {
                el.passwordError.textContent = result.error || '密码错误，请重试。';
                el.passwordError.style.display = 'block';
            }
            if (el.passwordInput) {
                el.passwordInput.value = '';
                el.passwordInput.focus();
            }
        }
    } catch (error) {
        console.error('验证过程出错:', error);
        if (el.passwordError) {
            el.passwordError.textContent = '网络错误或验证服务异常，请稍后重试。';
            el.passwordError.style.display = 'block';
        }
    }
}

async function sha256(message) {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

function togglePanel(panelId, toggleBtnId) {
    const panel = document.getElementById(panelId);
    const toggleBtn = document.getElementById(toggleBtnId);
    if (!panel || !toggleBtn) return;

    if (panel.style.display === 'none') {
        panel.style.display = 'flex';
        toggleBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
    } else {
        panel.style.display = 'none';
        toggleBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
    }
}

function toggleMobilePanel(panelId) {
    const panel = document.getElementById(panelId);
    if (!panel) return;
    if (panel.classList.contains('panel-mobile-visible')) {
        panel.classList.remove('panel-mobile-visible');
    } else {
        panel.classList.add('panel-mobile-visible');
    }
}

function addCustomContextMenuItem(viewer) {
    viewer.on('contextmenu', function () {
        // 保留扩展入口
    });
}

function formatNumber(value) {
    return typeof value === 'number' && !Number.isNaN(value) ? value.toFixed(6) : '';
}

function escapeHtml(input) {
    return String(input || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function init() {
    detectDeviceType();
    cacheElements();
    setupEventListeners();
    initMobileLayout();
    checkWatermarkStatus();
    updateLoginPrefill();
    void bootstrapScenesFromJson();

    try {
        await ensureFirebaseDatabase();
        await seedScenesIfNeeded();
        watchScenes();
        watchPending();
    } catch (error) {
        console.error('Firebase 初始化失败:', error);
    }

    setTimeout(() => {
        if (!scenesData.length) {
            void bootstrapScenesFromJson();
        }
    }, 1500);

    try {
        await ensureOpenLayers();
    } catch (error) {
        console.error('OpenLayers 加载失败:', error);
    }
    if (document.getElementById('sceneMap')) {
        await initMap();
    }
    void verifyAdminSession();
}

window.addEventListener('DOMContentLoaded', init);
