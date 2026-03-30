
// 交大360全景平台 - 核心脚本
const API_BASE = '__API_BASE__';
const DB_ROOT = 'xjtu360';
const DB_SCENES = `${DB_ROOT}/scenes`;
const DB_PENDING = `${DB_ROOT}/pending`;
const DB_META = `${DB_ROOT}/meta`;
const ADMIN_TOKEN_KEY = 'xjtu360_admin_token';
const MAP_BOUNDS = {
    nw: [108.974535, 34.252553],
    se: [108.983328, 34.242716]
};

let currentViewer = null;
let currentScene = null;
let scenesData = [];
let pendingData = [];
let database = null;
let map = null;
let mapCardHome = null;
let mapCardNext = null;
let vectorSource = null;
let previewViewer = null;
let nearbyHotspotIds = new Set();
let pickMarkerSource = null;
let pickMarkerFeature = null;
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
    el.collapseLeft = document.getElementById('collapseLeft');
    el.panelToggleBtn = document.getElementById('panelToggleBtn');
    el.mapToggleBtn = document.getElementById('mapToggleBtn');
    el.mapCard = document.querySelector('.map-card');
    el.copyApkLink = document.getElementById('copyApkLink');
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
    el.previewLoader = document.getElementById('previewLoader');
    el.panoLoader = document.getElementById('panoLoader');
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
    el.allScenesSection = document.getElementById('allScenesSection');
    el.allScenesList = document.getElementById('allScenesList');
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

function ensureTurnstileRendered() {
    if (!window.QuarkTurnstile) return;
    const key = window.QuarkTurnstile.getSiteKey();
    if (!key) {
        setUploadStatus('验证码未配置，请联系站长');
        return;
    }
    window.QuarkTurnstile.waitReady().then(() => {
        window.QuarkTurnstile.autoRender();
    });
}

function initMobileLayout() {
    setPanelOpen(!isMobile);
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

async function verifyUploadTurnstile() {
    if (window.SecurityShared && typeof window.SecurityShared.verifyTurnstile === 'function') {
        return window.SecurityShared.verifyTurnstile('xjtu360-upload', el.uploadStatus, 'xjtu360-upload');
    }
    if (!window.QuarkTurnstile) {
        setUploadStatus('验证码未加载');
        return false;
    }
    return window.QuarkTurnstile.verify('xjtu360-upload', (msg) => setUploadStatus(msg));
}

async function postLybMessage(textContent) {
    if (!database) return;
    const profile = getLoginProfile();
    const nickname = profile.nickname || profile.login || '访客';
    const avatarType = profile.avatarType === 'image' && profile.avatarUrl ? 'image' : 'color';
    const avatar = avatarType === 'image' ? profile.avatarUrl : (profile.avatarColor || '#4a6cf7');
    const uid = profile.uid || (window.CommentShared && typeof window.CommentShared.getGuestUid === 'function'
        ? window.CommentShared.getGuestUid()
        : '');
    const message = {
        text: textContent,
        nickname: nickname,
        login: profile.login || '',
        loginType: profile.isLoggedUser ? (profile.loginType || localStorage.getItem('quark_login_type') || '') : '',
        uid: uid,
        avatar: avatar,
        avatarType: avatarType,
        timestamp: Date.now(),
        isMarkdown: false,
        likes: 0
    };
    try {
        await database.ref('chatrooms/lsqkk-lyb/messages').push(message);
    } catch (error) {
        console.warn('留言板同步失败:', error);
    }
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
    scenesData = dedupeScenes(jsonData.map((scene, idx) => ({
        id: scene.id || `json_${idx}`,
        name: scene.name,
        contributor: scene.contributor || '未知',
        path: scene.path,
        lat: scene.lat ?? null,
        lng: scene.lng ?? null,
        source: 'json'
    })));
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
        renderAllScenes();
        if (!currentScene && scenesData.length > 0) {
            void loadScene(scenesData[0]);
        } else if (currentScene) {
            updateNearbyHotspots(currentScene);
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
    const list = Object.keys(data).map((id) => {
        const item = data[id] || {};
        const latNum = typeof item.lat === 'number' ? item.lat : parseFloat(item.lat);
        const lngNum = typeof item.lng === 'number' ? item.lng : parseFloat(item.lng);
        return {
            id,
            ...item,
            lat: Number.isNaN(latNum) ? null : latNum,
            lng: Number.isNaN(lngNum) ? null : lngNum
        };
    });
    return dedupeScenes(list).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function dedupeScenes(list) {
    const seen = new Map();
    list.forEach((item) => {
        const path = String(item.path || '').trim();
        const lat = typeof item.lat === 'number' ? item.lat.toFixed(6) : '';
        const lng = typeof item.lng === 'number' ? item.lng.toFixed(6) : '';
        const key = `${path}@@${lat}@@${lng}`;
        if (!seen.has(key)) {
            seen.set(key, item);
        }
    });
    return Array.from(seen.values());
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
        if (scene.id) sceneItem.dataset.sceneId = scene.id;
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
            selectScene(scene);
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

    setPanoramaLoading(true);

    if (currentViewer) {
        currentViewer.destroy();
    }

    const baseHfov = isMobile ? 80 : 100;
    currentViewer = pannellum.viewer('panorama', {
        type: 'equirectangular',
        panorama: panoramaPath,
        autoLoad: true,
        showControls: true,
        autoRotate: true,
        hfov: baseHfov,
        hotSpots: []
    });

    updateWatermark(scene);
    currentViewer.on('load', function () {
        addCustomContextMenuItem(currentViewer);
        setPanoramaLoading(false);
        updateNearbyHotspots(scene);
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

function updateNearbyHotspots(scene) {
    if (!currentViewer || !scene) return;
    if (typeof scene.lat !== 'number' || typeof scene.lng !== 'number') return;
    // 清理旧的热点
    nearbyHotspotIds.forEach((id) => {
        try { currentViewer.removeHotSpot(id); } catch { /* ignore */ }
    });
    nearbyHotspotIds = new Set();

    const neighbors = scenesData.filter((s) => s && s.id !== scene.id && typeof s.lat === 'number' && typeof s.lng === 'number');
    neighbors.forEach((s) => {
        const dist = haversineDistance(scene.lat, scene.lng, s.lat, s.lng);
        if (dist > 200) return;
        const bearing = bearingDegrees(scene.lat, scene.lng, s.lat, s.lng);
        const yaw = normalizeYaw(bearing);
        const size = Math.max(10, 22 - (dist / 200) * 10);
        const opacity = Math.max(0.35, 0.9 - (dist / 200) * 0.6);
        const hotId = `near_${s.id}`;
        const hotspot = {
            id: hotId,
            pitch: 0,
            yaw,
            cssClass: 'nearby-hotspot',
            createTooltipFunc: (div) => {
                div.classList.add('nearby-hotspot');
                div.style.setProperty('--nearby-size', `${size}px`);
                div.style.setProperty('--nearby-opacity', `${opacity}`);
                div.title = `${s.name || '未知地点'} · ${Math.round(dist)}m`;
                div.addEventListener('click', () => {
                    selectScene(s);
                });
            }
        };
        try {
            currentViewer.addHotSpot(hotspot);
            nearbyHotspotIds.add(hotId);
        } catch (error) {
            console.warn('添加附近热点失败:', error);
        }
    });
}

function haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function bearingDegrees(lat1, lng1, lat2, lng2) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const toDeg = (rad) => (rad * 180) / Math.PI;
    const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
    const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
    const brng = toDeg(Math.atan2(y, x));
    return (brng + 360) % 360;
}

function normalizeYaw(deg) {
    let yaw = deg;
    while (yaw > 180) yaw -= 360;
    while (yaw < -180) yaw += 360;
    return yaw;
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
            setPickMode({ type: 'upload', id: 'upload', sticky: true });
        });
    }

    if (el.submitUploadBtn) {
        el.submitUploadBtn.addEventListener('click', () => { void submitUpload(); });
    }

    if (el.collapseLeft) {
        el.collapseLeft.addEventListener('click', () => setPanelOpen(false));
    }
    if (el.panelToggleBtn) {
        el.panelToggleBtn.addEventListener('click', () => togglePanelState());
    }
    if (el.mapToggleBtn) {
        el.mapToggleBtn.addEventListener('click', () => toggleMapExpand());
    }
    if (el.mapCard) {
        el.mapCard.addEventListener('click', (event) => {
            if (el.mapCard.classList.contains('expanded')) {
                event.stopPropagation();
            }
        });
    }
    if (el.copyApkLink) {
        el.copyApkLink.addEventListener('click', () => {
            const link = 'https://img.130923.xyz/drive/2026/1774862908183-jlwpl4.apk';
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(link).then(() => {
                    setUploadStatus('下载链接已复制');
                }).catch(() => {
                    window.prompt('复制下载链接：', link);
                });
            } else {
                window.prompt('复制下载链接：', link);
            }
        });
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

    const captchaOk = await verifyUploadTurnstile();
    if (!captchaOk) return;

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
        await postLybMessage(`我在 XJTU 360° 上传了一张全景待审核：${name}`);

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
    pickMarkerSource = new ol.source.Vector();
    const pickLayer = new ol.layer.Vector({
        source: pickMarkerSource,
        style: new ol.style.Style({
            image: new ol.style.Circle({
                radius: 10,
                fill: new ol.style.Fill({ color: 'rgba(52, 152, 219, 0.35)' }),
                stroke: new ol.style.Stroke({ color: 'rgba(52, 152, 219, 0.9)', width: 2 })
            })
        })
    });
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
        layers: [vecLayer, cvaLayer, vectorLayer, pickLayer],
        view: new ol.View({
            center: ol.proj.fromLonLat([108.983, 34.246]),
            zoom: 16
        })
    });

    fitMapToCampus();

    map.on('click', (evt) => {
        const [lon, lat] = ol.proj.toLonLat(evt.coordinate);
        showPickMarker(lat, lon);
        showMapRipple(evt.pixel);
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
                if (scene) selectScene(scene);
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
    if (pickMode && mode && pickMode.type === mode.type && pickMode.id === mode.id) {
        pickMode = null;
        if (el.mapTip) el.mapTip.textContent = '点击地图可选择经纬度';
        return;
    }
    pickMode = mode;
    if (el.mapTip) {
        el.mapTip.textContent = '请在地图上点击选择坐标（可多次点击）';
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
    } else if (pickMode.type === 'scene-all') {
        const latEl = document.getElementById(`scene-all-lat-${pickMode.id}`);
        const lngEl = document.getElementById(`scene-all-lng-${pickMode.id}`);
        if (latEl) latEl.value = lat.toFixed(6);
        if (lngEl) lngEl.value = lng.toFixed(6);
    }
    if (!pickMode || !pickMode.sticky) {
        pickMode = null;
        if (el.mapTip) el.mapTip.textContent = '点击地图可选择经纬度';
    }
}

function showPickMarker(lat, lng) {
    if (!pickMarkerSource) return;
    const coord = ol.proj.fromLonLat([lng, lat]);
    if (!pickMarkerFeature) {
        pickMarkerFeature = new ol.Feature({ geometry: new ol.geom.Point(coord) });
        pickMarkerSource.addFeature(pickMarkerFeature);
    } else {
        pickMarkerFeature.setGeometry(new ol.geom.Point(coord));
    }
    if (el.mapTip) {
        const label = pickMode ? '已选择坐标' : '已点击坐标';
        el.mapTip.textContent = `${label}: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    }
}

function showMapRipple(pixel) {
    if (!map) return;
    const viewport = map.getViewport();
    if (!viewport) return;
    const ripple = document.createElement('div');
    ripple.className = 'map-ripple';
    ripple.style.left = `${pixel[0]}px`;
    ripple.style.top = `${pixel[1]}px`;
    viewport.appendChild(ripple);
    window.setTimeout(() => ripple.remove(), 700);
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
            setPickMode({ type: 'pending', id: item.id, sticky: true });
        });
        block.querySelector('[data-action="approve"]').addEventListener('click', () => {
            const lat = parseFloat(document.getElementById(`pending-lat-${item.id}`).value || '');
            const lng = parseFloat(document.getElementById(`pending-lng-${item.id}`).value || '');
            void approvePending(item.id, lat, lng, block);
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
            setPickMode({ type: 'scene', id: scene.id, sticky: true });
        });
        block.querySelector('[data-action="save"]').addEventListener('click', () => {
            const lat = parseFloat(document.getElementById(`scene-lat-${scene.id}`).value || '');
            const lng = parseFloat(document.getElementById(`scene-lng-${scene.id}`).value || '');
            void updateSceneCoords(scene.id, lat, lng);
        });
        el.missingCoordsList.appendChild(block);
    });
}

async function approvePending(id, lat, lng, blockEl) {
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

    if (blockEl) {
        const approveBtn = blockEl.querySelector('[data-action="approve"]');
        if (approveBtn) {
            approveBtn.disabled = true;
            approveBtn.textContent = '已通过';
        }
    }
    await database.ref(`${DB_SCENES}/${id}`).set(payload);
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

function renderAllScenes() {
    if (!el.allScenesList) return;
    el.allScenesList.innerHTML = '';
    if (!isAdmin) return;

    if (!scenesData.length) {
        el.allScenesList.innerHTML = '<div class="admin-item">暂无场景数据</div>';
        return;
    }

    scenesData.forEach((scene) => {
        const block = document.createElement('div');
        block.className = 'admin-item';
        block.innerHTML = `
            <div><strong>${escapeHtml(scene.name || '未命名')}</strong></div>
            <div class="field">
                <label>地点名称</label>
                <input id="scene-name-${scene.id}" type="text" value="${escapeHtml(scene.name || '')}">
            </div>
            <div class="field">
                <label>贡献者</label>
                <input id="scene-contrib-${scene.id}" type="text" value="${escapeHtml(scene.contributor || '')}">
            </div>
            <div class="field">
                <label>全景地址</label>
                <input id="scene-path-${scene.id}" type="text" value="${escapeHtml(scene.path || '')}">
            </div>
            <div class="field row">
                <input id="scene-all-lat-${scene.id}" type="number" step="0.000001" placeholder="纬度" value="${formatNumber(scene.lat)}">
                <input id="scene-all-lng-${scene.id}" type="number" step="0.000001" placeholder="经度" value="${formatNumber(scene.lng)}">
            </div>
            <div class="actions">
                <button class="btn ghost" data-action="pick">地图选点</button>
                <button class="btn primary" data-action="save">保存修改</button>
                <button class="btn ghost" data-action="preview">预览全景</button>
                <button class="btn ghost" data-action="delete">删除</button>
            </div>
        `;
        block.querySelector('[data-action="pick"]').addEventListener('click', () => {
            setPickMode({ type: 'scene-all', id: scene.id, sticky: true });
        });
        block.querySelector('[data-action="save"]').addEventListener('click', () => {
            const name = document.getElementById(`scene-name-${scene.id}`).value.trim();
            const contributor = document.getElementById(`scene-contrib-${scene.id}`).value.trim();
            const path = document.getElementById(`scene-path-${scene.id}`).value.trim();
            const lat = parseFloat(document.getElementById(`scene-all-lat-${scene.id}`).value || '');
            const lng = parseFloat(document.getElementById(`scene-all-lng-${scene.id}`).value || '');
            void updateSceneInfo(scene.id, { name, contributor, path, lat, lng });
        });
        block.querySelector('[data-action="preview"]').addEventListener('click', () => {
            previewPanorama(scene);
        });
        block.querySelector('[data-action="delete"]').addEventListener('click', () => {
            void deleteScene(scene.id);
        });
        el.allScenesList.appendChild(block);
    });
}

async function updateSceneInfo(id, payload) {
    if (!isAdmin) return;
    const next = {};
    if (payload.name) next.name = payload.name;
    if (payload.contributor) next.contributor = payload.contributor;
    if (payload.path) next.path = payload.path;
    if (!Number.isNaN(payload.lat)) next.lat = payload.lat;
    if (!Number.isNaN(payload.lng)) next.lng = payload.lng;
    next.updatedAt = Date.now();
    await database.ref(`${DB_SCENES}/${id}`).update(next);
}

async function deleteScene(id) {
    if (!isAdmin) return;
    const ok = confirm('确定要删除该场景吗？');
    if (!ok) return;
    await database.ref(`${DB_SCENES}/${id}`).remove();
}

function selectScene(scene) {
    if (!scene) return;
    if (el.previewPanorama) {
        void previewPanorama(scene);
    } else if (document.getElementById('panorama')) {
        void loadScene(scene);
    }
    if (scene.id) {
        const node = document.querySelector(`.scene-item[data-scene-id="${scene.id}"]`);
        if (node) {
            node.scrollIntoView({ behavior: 'smooth', block: 'center' });
            document.querySelectorAll('.scene-item').forEach((item) => item.classList.remove('active'));
            node.classList.add('active');
        }
    }
}

async function previewPanorama(scene) {
    if (!scene || !scene.path) return;
    if (!el.previewPanorama || !el.previewPanorama.classList) return;
    let panoramaPath = scene.path;
    if (isMobile && scene.path && !scene.path.startsWith('data:')) {
        try {
            panoramaPath = await getMobilePanorama(scene.path);
        } catch {
            panoramaPath = scene.path;
        }
    }
    setPreviewLoading(true);
    if (previewViewer) {
        previewViewer.destroy();
    }
    const previewHfov = isMobile ? 85 : 100;
    previewViewer = pannellum.viewer('previewPanorama', {
        type: 'equirectangular',
        panorama: panoramaPath,
        autoLoad: true,
        showControls: true,
        hfov: previewHfov
    });
    previewViewer.on('load', function () {
        setPreviewLoading(false);
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
    if (el.allScenesSection) el.allScenesSection.style.display = isAdmin ? 'block' : 'none';
    if (isAdmin) {
        setAdminStatus('管理员已登录');
    } else {
        setAdminStatus('管理员未登录');
    }
    refreshMapMarkers();
    renderPendingList();
    renderMissingCoords();
    renderAllScenes();
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
    if (!panel) return;
    const isHidden = panel.style.display === 'none';
    setPanelOpen(isHidden);
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

function setPanelOpen(open) {
    if (!el.leftPanel) return;
    const shouldOpen = !!open;
    el.leftPanel.style.display = shouldOpen ? 'flex' : 'none';
    if (el.leftPanel.classList) {
        if (shouldOpen) {
            el.leftPanel.classList.add('panel-mobile-visible');
        } else {
            el.leftPanel.classList.remove('panel-mobile-visible');
        }
    }
    if (el.panelToggleBtn) {
        el.panelToggleBtn.classList.toggle('opened', shouldOpen);
        el.panelToggleBtn.innerHTML = shouldOpen
            ? '<i class="fas fa-chevron-left"></i><span>收起侧栏</span>'
            : '<i class="fas fa-list"></i>';
    }
}

function togglePanelState() {
    if (!el.leftPanel) return;
    const isOpen = el.leftPanel.style.display !== 'none';
    setPanelOpen(!isOpen);
}

function toggleMapExpand(force) {
    if (!el.mapCard) return;
    const shouldExpand = typeof force === 'boolean'
        ? force
        : !el.mapCard.classList.contains('expanded');
    if (shouldExpand) {
        if (!mapCardHome) {
            mapCardHome = el.mapCard.parentElement;
            mapCardNext = el.mapCard.nextElementSibling;
        }
        document.body.appendChild(el.mapCard);
    } else if (mapCardHome) {
        if (mapCardNext && mapCardHome.contains(mapCardNext)) {
            mapCardHome.insertBefore(el.mapCard, mapCardNext);
        } else {
            mapCardHome.appendChild(el.mapCard);
        }
    }
    el.mapCard.classList.toggle('expanded', shouldExpand);
    if (el.mapToggleBtn) {
        el.mapToggleBtn.textContent = shouldExpand ? '收起地图' : '放大地图';
    }
    if (map) {
        setTimeout(() => map.updateSize(), 200);
    }
}

function setPanoramaLoading(isLoading) {
    if (!el.panoLoader) return;
    el.panoLoader.classList.toggle('show', !!isLoading);
}

function setPreviewLoading(isLoading) {
    if (!el.previewLoader) return;
    el.previewLoader.classList.toggle('show', !!isLoading);
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
    ensureTurnstileRendered();
    initMobileLayout();
    checkWatermarkStatus();
    updateLoginPrefill();
    setPanoramaLoading(true);
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
