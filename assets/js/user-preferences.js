// @ts-check

(function () {
    if (window.QuarkUserPreferences) return;

    const STORAGE_KEY = 'quark_site_preferences';
    const UPDATED_EVENT = 'quark-preferences-updated';
    const DEFAULTS = {
        language: 'chinese_simplified',
        font: 'xwwk',
        theme: 'system',
        motion: 'system',
        cursorTrail: false,
        readingSize: 'normal',
        noticePopups: true,
        noticeCelebrations: true,
        botEnabled: true,
        botContext: true,
        botSearch: true,
        agentSearch: false
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
    const MOTION_VALUES = new Set(['system', 'full', 'reduce']);

    let prefs = loadLocal();
    let firebaseReady = false;
    let hasLoadedRemote = false;
    let systemListenerBound = false;

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
        // Only these site preferences may be sent to the account settings store.
        const next = {
            ...DEFAULTS,
            fontChosen: typeof base.fontChosen === 'boolean' ? base.fontChosen : false,
            updatedAt: Number(base.updatedAt) || 0
        };
        for (const [key, value] of Object.entries(DEFAULTS)) {
            if (typeof base[key] === typeof value) next[key] = base[key];
        }
        // 旧版本把“系统默认”当作初始值；未主动选择时迁移到站点默认字库
        if (!next.fontChosen && next.font === 'system') next.font = DEFAULTS.font;
        if (!FONT_MAP.has(next.font)) next.font = DEFAULTS.font;
        if (!['system', 'light', 'dark'].includes(next.theme)) next.theme = DEFAULTS.theme;
        if (!['normal', 'large', 'extra'].includes(next.readingSize)) next.readingSize = DEFAULTS.readingSize;
        if (!MOTION_VALUES.has(next.motion)) next.motion = DEFAULTS.motion;
        next.cursorTrail = typeof base.cursorTrail === 'boolean' ? base.cursorTrail : DEFAULTS.cursorTrail;
        next.language = String(next.language || DEFAULTS.language);
        return next;
    }

    function loadLocal() {
        try {
            return normalize(safeParse(localStorage.getItem(STORAGE_KEY)));
        } catch {
            return normalize(null);
        }
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

    function isDark(next = prefs) {
        return next.theme === 'dark' || (next.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }

    function apply(next = prefs) {
        // 字体
        const font = FONT_MAP.get(next.font) || FONT_MAP.get(DEFAULTS.font);
        if (font) document.documentElement.style.setProperty('--site-font-family', font.family);
        if (fontOnly) return;

        // data 属性
        const reduceMotion = next.motion === 'reduce' || (next.motion === 'system' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        document.documentElement.dataset.motion = reduceMotion ? 'reduce' : 'full';
        document.documentElement.dataset.cursorTrail = next.cursorTrail ? 'on' : 'off';
        const theme = document.documentElement.hasAttribute('data-system-theme') ? 'system' : next.theme;
        document.documentElement.dataset.siteTheme = theme;
        document.documentElement.dataset.readingSize = next.readingSize;

        const dark = isDark({ ...next, theme });

        if (document.body) {
            document.body.classList.toggle('dark-mode', dark);
            document.body.classList.toggle('reduce-motion', reduceMotion);
            document.body.classList.toggle('cursor-trail-disabled', !next.cursorTrail);
            // 确保废弃的类不会残留
            document.body.classList.remove('force-light-mode');
        }
        document.documentElement.dataset.siteResolvedTheme = dark ? 'dark' : 'light';

        bindSystemListener();
    }

    function bindSystemListener() {
        if (systemListenerBound || !window.matchMedia) return;
        systemListenerBound = true;
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const onChange = () => {
            apply(prefs);
            dispatch();
        };
        if (typeof media.addEventListener === 'function') {
            media.addEventListener('change', onChange);
            window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', onChange);
        } else if (typeof media.addListener === 'function') {
            media.addListener(onChange);
        }
    }

    function dispatch() {
        try {
            window.dispatchEvent(new CustomEvent(UPDATED_EVENT, {
                detail: get()
            }));
        } catch {
            // ignore
        }
    }

    // ── 用户标识 ────────────────────────────────────────────────────
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
        const patch = { ...partial };
        if ('font' in patch) patch.fontChosen = true;
        const next = saveLocal({ ...prefs, ...patch, updatedAt: Date.now() });
        if (options.sync !== false) await syncRemote();
        return next;
    }

    function get() {
        return { ...prefs, isDark: isDark() };
    }

    function getFonts() {
        return FONTS.map((item) => ({ ...item }));
    }

    // ── 公开 API ────────────────────────────────────────────────────
    window.QuarkUserPreferences = {
        defaults: Object.freeze({ ...DEFAULTS }),
        get,
        getFonts,
        update,
        loadRemote,
        syncRemote,
        apply,
        eventName: UPDATED_EVENT
    };

    // ── 初始化 ──────────────────────────────────────────────────────
    const fontOnly = document.currentScript?.hasAttribute('data-font-only');
    apply(prefs);
    dispatch();
    window.addEventListener('storage', (event) => {
        if (event.key !== STORAGE_KEY && event.key !== null) return;
        prefs = loadLocal();
        apply(prefs);
        dispatch();
    });
    if (fontOnly) return;
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
