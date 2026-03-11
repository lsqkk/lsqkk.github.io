// @ts-check

(function () {
    const API_BASE = '__API_BASE__';
    const LOGIN_URL = (window.__NAV_CONFIG__ && window.__NAV_CONFIG__.login && window.__NAV_CONFIG__.login.url) || '/auth.html';

    const el = {
        nickname: document.getElementById('nicknameInput'),
        githubLogin: document.getElementById('githubLogin'),
        accountUid: document.getElementById('accountUid'),
        avatarFile: document.getElementById('avatarFile'),
        avatarUrl: document.getElementById('avatarUrl'),
        avatarImage: document.getElementById('avatarImage'),
        avatarFallback: document.getElementById('avatarFallback'),
        avatarClear: document.getElementById('avatarClear'),
        avatarFromPic: document.getElementById('avatarFromPic'),
        saveBtn: document.getElementById('saveProfile'),
        refreshBtn: document.getElementById('refreshProfile'),
        status: document.getElementById('saveStatus'),
        createdAt: document.getElementById('accountCreatedAt'),
        accountAge: document.getElementById('accountAge'),
        lastSyncAt: document.getElementById('lastSyncAt'),
        currentPage: document.getElementById('currentPage'),
        accountLocation: document.getElementById('accountLocation'),
        avatarState: document.getElementById('avatarState'),
        localSyncToggle: document.getElementById('localSyncToggle')
    };

    let firebaseReady = false;
    let cachedRemote = null;

    function getGithubUser() {
        const raw = localStorage.getItem('github_user');
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch {
            return null;
        }
    }

    function ensureLogin() {
        const user = getGithubUser();
        if (user && user.login) return user;
        window.location.href = LOGIN_URL;
        return null;
    }

    function setText(target, value) {
        if (target) target.textContent = value;
    }

    function getProfile() {
        if (window.QuarkUserProfile && typeof window.QuarkUserProfile.getProfile === 'function') {
            return window.QuarkUserProfile.getProfile();
        }
        return {
            nickname: '',
            login: '',
            avatarUrl: '',
            avatarType: 'color',
            avatarColor: '#2563eb',
            profileUrl: ''
        };
    }

    function getUid() {
        if (window.QuarkUserProfile && typeof window.QuarkUserProfile.getUid === 'function') {
            return window.QuarkUserProfile.getUid();
        }
        const user = getGithubUser();
        if (user && user.login) return `gh_${String(user.login).toLowerCase()}`;
        return localStorage.getItem('quark_uid') || '';
    }

    function updateAvatarPreview(url, name) {
        if (!el.avatarImage || !el.avatarFallback) return;
        const clean = (url || '').trim();
        if (clean) {
            el.avatarImage.src = clean;
            el.avatarImage.style.display = 'block';
            el.avatarFallback.style.display = 'none';
        } else {
            el.avatarImage.removeAttribute('src');
            el.avatarImage.style.display = 'none';
            el.avatarFallback.textContent = (name || 'Q').trim().slice(0, 1).toUpperCase();
            el.avatarFallback.style.display = 'block';
        }
        setText(el.avatarState, clean ? '已设置头像' : '使用默认头像');
    }

    function formatTime(ts) {
        if (!ts) return '-';
        return new Date(ts).toLocaleString('zh-CN', { hour12: false });
    }

    function formatDuration(ts) {
        if (!ts) return '-';
        const diff = Date.now() - ts;
        const days = Math.max(1, Math.floor(diff / (1000 * 60 * 60 * 24)));
        const years = Math.floor(days / 365);
        if (years > 0) return `${years} 年 ${days % 365} 天`;
        return `${days} 天`;
    }

    function setStatus(text) {
        setText(el.status, text);
    }

    function cropToSquare(image) {
        const canvas = document.createElement('canvas');
        const size = Math.min(image.width, image.height);
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return '';
        const sx = (image.width - size) / 2;
        const sy = (image.height - size) / 2;
        ctx.drawImage(image, sx, sy, size, size, 0, 0, size, size);
        return canvas.toDataURL('image/png', 0.92);
    }

    function handleAvatarFile(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const dataUrl = cropToSquare(img);
                if (el.avatarUrl) el.avatarUrl.value = dataUrl;
                updateAvatarPreview(dataUrl, el.nickname && el.nickname.value);
            };
            img.src = String(reader.result || '');
        };
        reader.readAsDataURL(file);
    }

    function bindEvents() {
        if (el.avatarFile instanceof HTMLInputElement) {
            el.avatarFile.addEventListener('change', () => {
                const file = el.avatarFile.files ? el.avatarFile.files[0] : null;
                handleAvatarFile(file);
            });
        }
        if (el.avatarUrl instanceof HTMLInputElement) {
            el.avatarUrl.addEventListener('input', () => {
                updateAvatarPreview(el.avatarUrl.value, el.nickname && el.nickname.value);
            });
        }
        if (el.avatarClear) {
            el.avatarClear.addEventListener('click', () => {
                if (el.avatarUrl instanceof HTMLInputElement) el.avatarUrl.value = '';
                updateAvatarPreview('', el.nickname && el.nickname.value);
            });
        }
        if (el.avatarFromPic) {
            el.avatarFromPic.addEventListener('click', () => {
                window.open('/a/pic', '_blank');
            });
        }
        if (el.saveBtn) el.saveBtn.addEventListener('click', () => void saveProfile());
        if (el.refreshBtn) el.refreshBtn.addEventListener('click', () => void loadRemoteProfile(true));
    }

    function getFirebaseConfig() {
        return window.firebaseConfig || window._firebaseConfig || null;
    }

    function waitForFirebaseReady() {
        return new Promise((resolve) => {
            const existingConfig = getFirebaseConfig();
            if (window.firebase && window.firebase.database && existingConfig && existingConfig.projectId) {
                resolve(existingConfig);
                return;
            }

            window.__firebaseConfigLoaded = (config) => {
                if (typeof config === 'object' && config.projectId) {
                    window.firebaseConfig = config;
                }
            };

            Object.defineProperty(window, 'firebaseConfig', {
                set(value) {
                    this._firebaseConfig = value;
                },
                get() {
                    return this._firebaseConfig;
                },
                configurable: true
            });

            const timer = window.setInterval(() => {
                const config = getFirebaseConfig();
                if (window.firebase && window.firebase.database && config && config.projectId) {
                    window.clearInterval(timer);
                    resolve(config);
                }
            }, 300);
        });
    }

    async function ensureFirebase() {
        if (firebaseReady) return window.firebase.database();
        const config = await waitForFirebaseReady();
        if (!window.firebase.apps || !window.firebase.apps.length) {
            window.firebase.initializeApp(config);
        }
        firebaseReady = true;
        return window.firebase.database();
    }

    function applyProfileToForm(profile) {
        if (el.nickname instanceof HTMLInputElement) el.nickname.value = profile.nickname || '';
        if (el.avatarUrl instanceof HTMLInputElement) el.avatarUrl.value = profile.avatarUrl || '';
        updateAvatarPreview(profile.avatarUrl || '', profile.nickname || '');
    }

    async function loadRemoteProfile(force = false) {
        try {
            const db = await ensureFirebase();
            const uid = getUid();
            const snap = await db.ref('user_activity').child(uid).child('profile').once('value');
            const remote = snap.val() || null;
            cachedRemote = remote;
            if (remote && (force || remote.updatedAt)) {
                const localMeta = window.QuarkUserProfile && typeof window.QuarkUserProfile.getStoredProfile === 'function'
                    ? window.QuarkUserProfile.getStoredProfile()
                    : null;
                const localUpdatedAt = localMeta && typeof localMeta.updatedAt === 'number' ? localMeta.updatedAt : 0;
                const remoteUpdatedAt = typeof remote.updatedAt === 'number' ? remote.updatedAt : 0;
                if (remoteUpdatedAt > localUpdatedAt && window.QuarkUserProfile && typeof window.QuarkUserProfile.syncProfile === 'function') {
                    window.QuarkUserProfile.syncProfile(remote);
                }
                applyProfileToForm(remote);
                setText(el.createdAt, formatTime(remote.createdAt));
                setText(el.accountAge, formatDuration(remote.createdAt));
                setText(el.lastSyncAt, formatTime(remote.updatedAt));
                const location = [remote.province, remote.city].filter(Boolean).join(' ');
                setText(el.accountLocation, location || '-');
            }
        } catch (error) {
            console.error('加载远程资料失败:', error);
            setStatus('云端资料加载失败');
        }
    }

    async function saveProfile() {
        const user = ensureLogin();
        if (!user) return;
        const login = user.login || '';
        const nickname = el.nickname instanceof HTMLInputElement ? el.nickname.value.trim() : '';
        const avatarUrl = el.avatarUrl instanceof HTMLInputElement ? el.avatarUrl.value.trim() : '';
        const profileUrl = user.html_url || '';
        const uid = getUid();
        const createdAt = cachedRemote && typeof cachedRemote.createdAt === 'number' ? cachedRemote.createdAt : Date.now();

        const profile = {
            uid,
            nickname,
            login,
            avatarUrl,
            avatarType: avatarUrl ? 'image' : 'color',
            avatarColor: '#2563eb',
            profileUrl,
            createdAt,
            updatedAt: Date.now()
        };

        if (el.localSyncToggle && el.localSyncToggle instanceof HTMLInputElement && el.localSyncToggle.checked) {
            if (window.QuarkUserProfile && typeof window.QuarkUserProfile.syncProfile === 'function') {
                window.QuarkUserProfile.syncProfile(profile);
            }
        }

        try {
            const db = await ensureFirebase();
            await db.ref('user_activity').child(uid).child('profile').update(profile);
            await db.ref('presence').child(uid).update({
                uid,
                nickname,
                login,
                avatarUrl,
                avatarType: avatarUrl ? 'image' : 'color',
                avatarColor: '#2563eb',
                path: location.pathname,
                title: document.title || '',
                lastSeen: Date.now()
            });
            cachedRemote = profile;
            setStatus('资料已保存并同步');
            setText(el.lastSyncAt, formatTime(profile.updatedAt));
        } catch (error) {
            console.error('保存资料失败:', error);
            setStatus('保存失败，请稍后再试');
        }
    }

    function fillStaticInfo() {
        const user = ensureLogin();
        if (!user) return;
        const profile = getProfile();
        applyProfileToForm(profile);
        setText(el.githubLogin, user.login || '');
        setText(el.accountUid, getUid());
        setText(el.currentPage, location.pathname);
        setText(el.lastSyncAt, profile.updatedAt ? formatTime(profile.updatedAt) : '-');
    }

    async function init() {
        fillStaticInfo();
        bindEvents();
        await loadRemoteProfile();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { void init(); });
    } else {
        void init();
    }
})();
