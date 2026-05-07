// @ts-check

(function () {
    const LANGUAGE_OPTIONS = [
        { code: 'chinese_simplified', label: '中文/CN' },
        { code: 'english', label: 'English' },
        { code: 'japanese', label: '日本語' },
        { code: 'korean', label: '한국어' },
        { code: 'french', label: 'Français' },
        { code: 'german', label: 'Deutsch' },
        { code: 'spanish', label: 'Español' },
        { code: 'russian', label: 'Русский' }
    ];

    const el = {};

    function cache() {
        el.language = document.getElementById('settingLanguage');
        el.theme = document.getElementById('settingTheme');
        el.font = document.getElementById('settingFont');
        el.motion = document.getElementById('settingMotion');
        el.cursorTrail = document.getElementById('settingCursorTrail');
        el.save = document.getElementById('saveSettings');
        el.reset = document.getElementById('resetSettings');
        el.status = document.getElementById('settingsStatus');
        el.syncHint = document.getElementById('settingsSyncHint');
    }

    function setStatus(text) {
        if (el.status) el.status.textContent = text;
    }

    function isLoggedIn() {
        return Boolean(localStorage.getItem('github_user') || localStorage.getItem('github_code') || localStorage.getItem('qb_user'));
    }

    function fillOptions() {
        if (el.language instanceof HTMLSelectElement) {
            el.language.innerHTML = LANGUAGE_OPTIONS.map((item) => `<option value="${item.code}">${item.label}</option>`).join('');
        }
        if (el.font instanceof HTMLSelectElement && window.QuarkUserPreferences) {
            el.font.innerHTML = window.QuarkUserPreferences.getFonts()
                .map((item) => `<option value="${item.id}">${item.label}</option>`)
                .join('');
        }
    }

    function readForm() {
        return {
            language: el.language instanceof HTMLSelectElement ? el.language.value : 'chinese_simplified',
            theme: el.theme instanceof HTMLSelectElement ? el.theme.value : 'system',
            font: el.font instanceof HTMLSelectElement ? el.font.value : 'xwwk',
            motion: el.motion instanceof HTMLSelectElement ? el.motion.value : 'full',
            cursorTrail: el.cursorTrail instanceof HTMLInputElement ? el.cursorTrail.checked : true
        };
    }

    function writeForm(prefs) {
        if (el.language instanceof HTMLSelectElement) el.language.value = prefs.language || 'chinese_simplified';
        if (el.theme instanceof HTMLSelectElement) el.theme.value = prefs.theme || 'system';
        if (el.font instanceof HTMLSelectElement) el.font.value = prefs.font || 'xwwk';
        if (el.motion instanceof HTMLSelectElement) el.motion.value = prefs.motion || 'full';
        if (el.cursorTrail instanceof HTMLInputElement) el.cursorTrail.checked = prefs.cursorTrail !== false;
    }

    async function save() {
        if (!window.QuarkUserPreferences) return;
        setStatus('保存中...');
        const prefs = await window.QuarkUserPreferences.update(readForm());
        writeForm(prefs);
        setStatus(isLoggedIn() ? '已保存并同步到账号' : '已保存到本机');
    }

    async function reset() {
        if (!window.QuarkUserPreferences) return;
        setStatus('恢复中...');
        const prefs = await window.QuarkUserPreferences.update({
            language: 'chinese_simplified',
            theme: 'system',
            font: 'xwwk',
            motion: 'full',
            cursorTrail: true
        });
        writeForm(prefs);
        setStatus('已恢复默认设置');
    }

    function bind() {
        [el.language, el.theme, el.font, el.motion, el.cursorTrail].forEach((item) => {
            if (!item) return;
            item.addEventListener('change', () => {
                if (!window.QuarkUserPreferences) return;
                void window.QuarkUserPreferences.update(readForm(), { sync: false });
                setStatus('有未同步更改，点击保存写入账号');
            });
        });
        if (el.save) el.save.addEventListener('click', () => { void save(); });
        if (el.reset) el.reset.addEventListener('click', () => { void reset(); });
        window.addEventListener('quark-preferences-updated', (event) => {
            if (event && event.detail) writeForm(event.detail);
        });
    }

    async function init() {
        cache();
        fillOptions();
        if (!window.QuarkUserPreferences) {
            setStatus('设置模块加载失败');
            return;
        }
        writeForm(window.QuarkUserPreferences.get());
        if (el.syncHint) {
            el.syncHint.textContent = isLoggedIn()
                ? '当前已登录，设置会跟随账号同步到其他设备。'
                : '当前未登录，设置会保存在此浏览器。登录后会自动同步。';
        }
        await window.QuarkUserPreferences.loadRemote(true);
        writeForm(window.QuarkUserPreferences.get());
        bind();
        setStatus('等待操作');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { void init(); });
    } else {
        void init();
    }
})();
