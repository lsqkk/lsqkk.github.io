// @ts-check

(function () {
    if (window.QuarkUserPreferences) return;

    const STORAGE_KEY = 'quark_site_preferences';
    const UPDATED_EVENT = 'quark-preferences-updated';
    const DEFAULTS = {
        language: 'chinese_simplified',
        theme: 'system',
        font: 'xwwk',
        motion: 'full',
        cursorTrail: true
    };
    const FONTS = [
        {
            id: 'xwwk',
            label: '霞鹜文楷',
            family: "'XWWK', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif"
        },
        {
            id: 'tang',
            label: '汉仪唐美人',
            family: "'HYTangMeiRen', 'XWWK', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif"
        },
        {
            id: 'system',
            label: '系统默认',
            family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif"
        },
        {
            id: 'serif',
            label: '衬线阅读',
            family: "'LXGW Neo ZhiSong CHS', 'Songti SC', 'SimSun', serif"
        }
    ];
    const FONT_MAP = new Map(FONTS.map((item) => [item.id, item]));
    const THEME_VALUES = new Set(['system', 'light', 'dark']);
    const MOTION_VALUES = new Set(['full', 'reduce']);

    let prefs = loadLocal();
    let firebaseReady = false;
    let hasLoadedRemote = false;
    let themeListenerBound = false;

    function safeParse(raw) {
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch {
            return null;
        }
    }

    function normalize(input) {
        const base = input && typeof input === 'object' ? input : {};
        const next = { ...DEFAULTS, ...base };
        if (!FONT_MAP.has(next.font)) next.font = DEFAULTS.font;
        if (!THEME_VALUES.has(next.theme)) next.theme = DEFAULTS.theme;
        if (!MOTION_VALUES.has(next.motion)) next.motion = DEFAULTS.motion;
        next.cursorTrail = next.cursorTrail !== false;
        next.language = String(next.language || DEFAULTS.language);
        next.updatedAt = Number(next.updatedAt || 0);
        return next;
    }

    function loadLocal() {
        return normalize(safeParse(localStorage.getItem(STORAGE_KEY)));
    }

    function saveLocal(next) {
        prefs = normalize({ ...next, updatedAt: next.updatedAt || Date.now() });
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
            localStorage.setItem('quark_language_preference', prefs.language);
        } catch {
            // ignore storage errors
        }
        apply(prefs);
        dispatch();
        return prefs;
    }

    function isDarkTheme(next = prefs) {
        if (next.theme === 'dark') return true;
        if (next.theme === 'light') return false;
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    function apply(next = prefs) {
        const font = FONT_MAP.get(next.font) || FONT_MAP.get(DEFAULTS.font);
        if (font) document.documentElement.style.setProperty('--site-font-family', font.family);
        document.documentElement.dataset.siteTheme = next.theme;
        document.documentElement.dataset.motion = next.motion;
        document.documentElement.dataset.cursorTrail = next.cursorTrail ? 'on' : 'off';
        if (document.body) {
            const dark = isDarkTheme(next);
            document.body.classList.toggle('dark-mode', dark);
            document.body.classList.toggle('force-light-mode', next.theme === 'light');
            document.body.classList.toggle('reduce-motion', next.motion === 'reduce');
            document.body.classList.toggle('cursor-trail-disabled', !next.cursorTrail);
        }
        bindSystemThemeListener();
    }

    function bindSystemThemeListener() {
        if (themeListenerBound || !window.matchMedia) return;
        themeListenerBound = true;
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const onChange = () => {
            if (prefs.theme === 'system') apply(prefs);
            dispatch();
        };
        if (typeof media.addEventListener === 'function') media.addEventListener('change', onChange);
        else if (typeof media.addListener === 'function') media.addListener(onChange);
    }

    function dispatch() {
        try {
            window.dispatchEvent(new CustomEvent(UPDATED_EVENT, { detail: { ...prefs, isDark: isDarkTheme(prefs) } }));
        } catch {
            // ignore
        }
    }

    function getUid() {
        if (window.QuarkUserProfile && typeof window.QuarkUserProfile.getUid === 'function') {
            return window.QuarkUserProfile.getUid();
        }
        return localStorage.getItem('quark_uid') || '';
    }

    function isLoggedIn() {
        return Boolean(localStorage.getItem('github_user') || localStorage.getItem('github_code') || localStorage.getItem('qb_user'));
    }

    async function ensureFirebase() {
        if (firebaseReady && window.firebase && window.firebase.database) return window.firebase.database();
        if (!window.QuarkFirebaseReady) throw new Error('Firebase readiness helper missing');
        const db = await window.QuarkFirebaseReady.ensureDatabase({ scriptId: 'firebase-config-loader-preferences' });
        firebaseReady = true;
        return db;
    }

    async function loadRemote(force = false) {
        if (!isLoggedIn()) return prefs;
        if (hasLoadedRemote && !force) return prefs;
        hasLoadedRemote = true;
        try {
            const uid = getUid();
            if (!uid) return prefs;
            const db = await ensureFirebase();
            const snap = await db.ref('user_activity').child(uid).child('settings').once('value');
            const remote = normalize(snap.val() || null);
            if (remote.updatedAt && remote.updatedAt > Number(prefs.updatedAt || 0)) {
                saveLocal(remote);
            } else if (Number(prefs.updatedAt || 0) && prefs.updatedAt > remote.updatedAt) {
                await syncRemote();
            }
        } catch (error) {
            console.warn('用户设置云端同步失败:', error);
        }
        return prefs;
    }

    async function syncRemote() {
        if (!isLoggedIn()) return false;
        try {
            const uid = getUid();
            if (!uid) return false;
            const db = await ensureFirebase();
            await db.ref('user_activity').child(uid).child('settings').update(prefs);
            return true;
        } catch (error) {
            console.warn('用户设置保存到云端失败:', error);
            return false;
        }
    }

    async function update(partial, options = {}) {
        const next = saveLocal({ ...prefs, ...partial, updatedAt: Date.now() });
        if (options.sync !== false) await syncRemote();
        return next;
    }

    function get() {
        return { ...prefs, isDark: isDarkTheme(prefs) };
    }

    function getFonts() {
        return FONTS.map((item) => ({ ...item }));
    }

    window.QuarkUserPreferences = {
        get,
        getFonts,
        update,
        loadRemote,
        syncRemote,
        apply,
        eventName: UPDATED_EVENT
    };

    apply(prefs);
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            apply(prefs);
            void loadRemote();
        });
    } else {
        void loadRemote();
    }
    window.addEventListener('quark-user-updated', () => {
        void loadRemote(true);
    });
})();
