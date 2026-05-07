// @ts-check

(function () {
    if (window.QuarkUserPreferences) return;

    const STORAGE_KEY = 'quark_site_preferences';
    const UPDATED_EVENT = 'quark-preferences-updated';
    const FORCED_DARK_STYLE_ID = 'quark-forced-dark-style';
    const FORCED_LIGHT_STYLE_ID = 'quark-forced-light-style';
    const DEFAULTS = {
        language: 'chinese_simplified',
        theme: 'system',
        font: 'serif',
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
    /** @type {Array<{selector: string, cssText: string}>|null} */
    let darkRulesCache = null;
    let darkRulesCollected = false;

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

    // ── CSSOM 暗色规则收集 ──────────────────────────────────────────
    function collectDarkModeRules() {
        if (darkRulesCollected && darkRulesCache) return darkRulesCache;
        /** @type {Array<{selector: string, cssText: string}>} */
        const rules = [];
        try {
            for (const sheet of document.styleSheets) {
                try {
                    if (!sheet.cssRules) continue;
                    for (const rule of sheet.cssRules) {
                        if (rule instanceof CSSMediaRule) {
                            const cond = (rule.conditionText || '').toLowerCase();
                            if (cond.includes('prefers-color-scheme: dark') || cond.includes('prefers-color-scheme:dark')) {
                                for (const inner of rule.cssRules) {
                                    if (inner instanceof CSSStyleRule) {
                                        rules.push({
                                            selector: inner.selectorText,
                                            cssText: inner.style.cssText
                                        });
                                    }
                                }
                            }
                        }
                    }
                } catch (_e) {
                    // cross-origin 或不可访问的 stylesheet，跳过
                }
            }
        } catch (_e) {
            // 整个遍历失败时回退到空列表
        }
        darkRulesCache = rules;
        darkRulesCollected = true;
        return rules;
    }

    function invalidateDarkRulesCache() {
        darkRulesCache = null;
        darkRulesCollected = false;
    }

    // ── 选择器前缀转换 ──────────────────────────────────────────────
    function prefixDarkSelectors(selector) {
        return selector.split(',')
            .map((part) => {
                const item = part.trim();
                if (!item) return '';
                if (item === ':root') return 'html[data-site-resolved-theme="dark"]';
                if (item === 'body') return 'body.dark-mode';
                if (item.startsWith('body.')) return item.replace(/^body/, 'body.dark-mode');
                if (item.startsWith('body ')) return item.replace(/^body/, 'body.dark-mode');
                if (item.startsWith('html')) return `html[data-site-resolved-theme="dark"] ${item}`;
                return `body.dark-mode ${item}`;
            })
            .filter(Boolean)
            .join(', ');
    }

    // ── 注入强制深色样式 ────────────────────────────────────────────
    function injectForcedDarkStyles(rules) {
        const old = document.getElementById(FORCED_DARK_STYLE_ID);
        if (old) old.remove();

        if (!rules || rules.length === 0) return;

        const style = document.createElement('style');
        style.id = FORCED_DARK_STYLE_ID;
        let css = '';
        for (const rule of rules) {
            css += prefixDarkSelectors(rule.selector) + ' { ' + rule.cssText + ' }\n';
        }
        style.textContent = css;
        document.head.appendChild(style);
    }

    // ── 自动生成强制浅色覆盖样式 ────────────────────────────────────
    function generateLightOverrideCSS(rules) {
        const overridableProps = new Set([
            'color', 'background', 'background-color', 'border-color',
            'box-shadow', 'text-shadow', 'color-scheme'
        ]);

        /** @type {Map<string, Set<string>>} */
        const selectorProps = new Map();

        for (const rule of rules) {
            const sel = rule.selector;
            if (!selectorProps.has(sel)) selectorProps.set(sel, new Set());
            const props = selectorProps.get(sel);
            // 从 cssText 提取属性名
            rule.cssText.split(';').forEach((decl) => {
                const colonIdx = decl.indexOf(':');
                if (colonIdx < 0) return;
                const prop = decl.slice(0, colonIdx).trim();
                if (overridableProps.has(prop)) {
                    props.add(prop);
                }
            });
        }

        let css = '';

        // 根级规则
        css += 'body.force-light-mode { color: #1f2937 !important; color-scheme: light !important; }\n';

        for (const [sel, props] of selectorProps) {
            // 跳过 :root 和 body（已在上面处理）
            if (sel === ':root' || sel === 'body') continue;

            let declarations = '';
            if (props.has('color')) declarations += 'color: #1f2937 !important; ';
            if (props.has('background') || props.has('background-color')) {
                declarations += 'background: rgba(255, 255, 255, 0.78) !important; ';
            }
            if (props.has('border-color')) declarations += 'border-color: rgba(148, 163, 184, 0.28) !important; ';
            if (props.has('box-shadow')) declarations += 'box-shadow: 0 12px 28px rgba(15, 23, 42, 0.12) !important; ';
            if (props.has('text-shadow')) declarations += 'text-shadow: none !important; ';

            if (declarations) {
                css += 'body.force-light-mode ' + sel + ' { ' + declarations + ' }\n';
            }
        }

        // 补充常用暗色区域的硬编码覆盖（兜底 cssText 中无法精确提取的情况）
        css += `
body.force-light-mode code { background: rgba(241, 245, 249, 0.86) !important; color: #1f2937 !important; }
body.force-light-mode pre { background: rgba(248, 250, 252, 0.9) !important; border-color: rgba(148, 163, 184, 0.28) !important; }
body.force-light-mode input, body.force-light-mode textarea, body.force-light-mode select {
  background: rgba(255, 255, 255, 0.9) !important; color: #1f2937 !important; border-color: rgba(148, 163, 184, 0.35) !important;
}
body.force-light-mode a { color: #0366d6 !important; }
body.force-light-mode .tool-link, body.force-light-mode .function-link, body.force-light-mode .project-open,
body.force-light-mode .back-home, body.force-light-mode .chat-link, body.force-light-mode .notice-link {
  color: #0366d6 !important; background: transparent !important;
}
body.force-light-mode .btn, body.force-light-mode .submit-btn, body.force-light-mode .admin-btn {
  background: rgba(31, 118, 110, 0.12) !important; color: #1f2937 !important; border-color: rgba(148, 163, 184, 0.35) !important;
}
body.force-light-mode .sidebar-main-content, body.force-light-mode .morenpost {
  color: #1f2937 !important;
}
body.force-light-mode .dynamic-content.is-clamped::before {
  background: linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.95)) !important;
}
body.force-light-mode .dynamic-content.is-clamped::after {
  color: #2563eb !important; background: rgba(255,255,255,0.95) !important;
}
body.force-light-mode .game-card-overlay {
  background: linear-gradient(transparent, rgba(255,255,255,0.85)) !important;
}
body.force-light-mode.home-page .main-content,
body.force-light-mode.home-page .sidebar-index,
body.force-light-mode.home-page .dynamic-feed .dynamic-card,
body.force-light-mode.home-page .recent-posts .post-item-link,
body.force-light-mode.home-page .recent-posts .post-item {
  background: transparent !important; border-color: transparent !important; box-shadow: none !important;
}
`;

        return css;
    }

    function injectForcedLightStyles(rules) {
        const old = document.getElementById(FORCED_LIGHT_STYLE_ID);
        if (old) old.remove();

        const style = document.createElement('style');
        style.id = FORCED_LIGHT_STYLE_ID;
        style.textContent = generateLightOverrideCSS(rules || []);
        document.head.appendChild(style);
    }

    // ── 清理所有强制样式 ────────────────────────────────────────────
    function removeAllForcedStyles() {
        const dark = document.getElementById(FORCED_DARK_STYLE_ID);
        if (dark) dark.remove();
        const light = document.getElementById(FORCED_LIGHT_STYLE_ID);
        if (light) light.remove();
    }

    // ── 应用设置 ────────────────────────────────────────────────────
    function apply(next = prefs) {
        // 字体
        const font = FONT_MAP.get(next.font) || FONT_MAP.get(DEFAULTS.font);
        if (font) document.documentElement.style.setProperty('--site-font-family', font.family);

        // data 属性
        document.documentElement.dataset.siteTheme = next.theme;
        document.documentElement.dataset.motion = next.motion;
        document.documentElement.dataset.cursorTrail = next.cursorTrail ? 'on' : 'off';

        const dark = isDarkTheme(next);

        if (document.body) {
            document.body.classList.toggle('dark-mode', dark);
            document.body.classList.toggle('force-light-mode', next.theme === 'light');
            document.body.classList.toggle('reduce-motion', next.motion === 'reduce');
            document.body.classList.toggle('cursor-trail-disabled', !next.cursorTrail);
        }
        document.documentElement.dataset.siteResolvedTheme = dark ? 'dark' : 'light';

        // 主题强制样式
        if (next.theme === 'dark') {
            // 用户强制深色 → 注入 body.dark-mode 版本的所有暗色规则
            const rules = collectDarkModeRules();
            injectForcedDarkStyles(rules);
            // 清掉可能残留的浅色强制样式
            const fl = document.getElementById(FORCED_LIGHT_STYLE_ID);
            if (fl) fl.remove();
        } else if (next.theme === 'light') {
            // 用户强制浅色 → 注入覆盖样式对抗系统暗色规则
            const rules = collectDarkModeRules();
            injectForcedLightStyles(rules);
            // 清掉可能残留的深色强制样式
            const fd = document.getElementById(FORCED_DARK_STYLE_ID);
            if (fd) fd.remove();
        } else {
            // 跟随系统 → 不需要任何强制样式
            removeAllForcedStyles();
        }

        bindSystemThemeListener();
    }

    // ── 系统主题变更监听 ────────────────────────────────────────────
    function bindSystemThemeListener() {
        if (themeListenerBound || !window.matchMedia) return;
        themeListenerBound = true;
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const onChange = () => {
            if (prefs.theme === 'system') {
                invalidateDarkRulesCache(); // 系统主题变了，可能需要重新收集规则
                apply(prefs);
            }
            dispatch();
        };
        if (typeof media.addEventListener === 'function') media.addEventListener('change', onChange);
        else if (typeof media.addListener === 'function') media.addListener(onChange);
    }

    // ── 事件分发 ────────────────────────────────────────────────────
    function dispatch() {
        try {
            window.dispatchEvent(new CustomEvent(UPDATED_EVENT, { detail: { ...prefs, isDark: isDarkTheme(prefs) } }));
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

    // ── 公开 API ────────────────────────────────────────────────────
    window.QuarkUserPreferences = {
        get,
        getFonts,
        update,
        loadRemote,
        syncRemote,
        apply,
        eventName: UPDATED_EVENT,
        invalidateDarkRulesCache
    };

    // ── 初始化 ──────────────────────────────────────────────────────
    apply(prefs);
    // DOM 完全就绪后再次收集（此时动态注入的样式表通常已加载）
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            invalidateDarkRulesCache();
            apply(prefs);
            void loadRemote();
        });
    } else {
        void loadRemote();
    }
    // 所有资源加载完成后最后收集一次，确保覆盖所有样式表
    window.addEventListener('load', () => {
        invalidateDarkRulesCache();
        apply(prefs);
    }, { once: true });
    window.addEventListener('quark-user-updated', () => {
        void loadRemote(true);
    });
})();
