// @ts-check

(function () {
    const API_BASE = '__API_BASE__';
    const ONLINE_WINDOW = 15 * 60 * 1000;

    const el = {
        grid: document.getElementById('onlineGrid'),
        count: document.getElementById('onlineCount'),
        updated: document.getElementById('onlineUpdated'),
        status: document.getElementById('onlineStatus'),
        filter: document.getElementById('onlineFilter'),
        detail: document.getElementById('onlineDetail')
    };

    let firebaseReady = false;
    let presenceItems = [];

    function setText(target, value) {
        if (target) target.textContent = value;
    }

    function formatTime(ts) {
        if (!ts) return '-';
        return new Date(ts).toLocaleString('zh-CN', { hour12: false });
    }

    function formatAgo(ts) {
        if (!ts) return '-';
        const diff = Date.now() - ts;
        const minutes = Math.max(1, Math.round(diff / 60000));
        if (minutes < 60) return `${minutes} 分钟前`;
        const hours = Math.round(minutes / 60);
        return `${hours} 小时前`;
    }

    function getInitial(name) {
        const str = (name || '').trim();
        if (!str) return 'Q';
        return str.slice(0, 1).toUpperCase();
    }

    function loadScript(src, id) {
        return new Promise((resolve, reject) => {
            const existing = document.getElementById(id);
            if (existing) {
                resolve();
                return;
            }
            const script = document.createElement('script');
            script.id = id;
            script.src = src;
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`load failed: ${src}`));
            document.head.appendChild(script);
        });
    }

    function waitForFirebaseConfig(timeout = 20000) {
        return new Promise((resolve, reject) => {
            const start = Date.now();
            const timer = window.setInterval(() => {
                const config = window.firebaseConfig || window._firebaseConfig;
                if (config && config.projectId) {
                    window.clearInterval(timer);
                    resolve(config);
                    return;
                }
                if (Date.now() - start > timeout) {
                    window.clearInterval(timer);
                    reject(new Error('firebase config timeout'));
                }
            }, 200);
        });
    }

    async function ensureFirebase() {
        if (firebaseReady) return window.firebase.database();
        if (typeof window.firebase === 'undefined' || !window.firebase.database) {
            await loadScript('https://www.gstatic.com/firebasejs/8.10.0/firebase-app.js', 'online-firebase-app');
            await loadScript('https://www.gstatic.com/firebasejs/8.10.0/firebase-database.js', 'online-firebase-db');
        }
        if (!window.firebaseConfig) {
            await loadScript(`${API_BASE}/api/firebase-config?v=${Date.now()}`, 'online-firebase-config');
            await waitForFirebaseConfig(20000);
        }
        if (!window.firebase.apps || !window.firebase.apps.length) {
            window.firebase.initializeApp(window.firebaseConfig);
        }
        firebaseReady = true;
        return window.firebase.database();
    }

    function selectUser(item) {
        if (!el.detail) return;
        el.detail.innerHTML = `
            <h3>选中用户</h3>
            <div class="detail-row"><span>昵称</span><strong>${item.nickname || '匿名用户'}</strong></div>
            <div class="detail-row"><span>账号</span><strong>${item.login || '-'}</strong></div>
            <div class="detail-row"><span>当前页面</span><strong>${item.title || item.path || '-'}</strong></div>
            <div class="detail-row"><span>路径</span><strong>${item.path || '-'}</strong></div>
            <div class="detail-row"><span>最后心跳</span><strong>${formatTime(item.lastSeen)}</strong></div>
            <div class="detail-row"><span>距离现在</span><strong>${formatAgo(item.lastSeen)}</strong></div>
        `;
    }

    function render() {
        if (!el.grid) return;
        const keyword = (el.filter && el.filter.value || '').trim().toLowerCase();
        const filtered = presenceItems.filter((item) => {
            const text = `${item.nickname || ''} ${item.login || ''}`.toLowerCase();
            return !keyword || text.includes(keyword);
        });
        setText(el.count, String(filtered.length));
        setText(el.updated, formatTime(Date.now()));

        if (filtered.length === 0) {
            el.grid.innerHTML = '<div class="online-status">暂无在线用户</div>';
            if (el.detail) {
                el.detail.innerHTML = '<h3>选中用户</h3><p class="detail-empty">暂无在线用户</p>';
            }
            return;
        }

        el.grid.innerHTML = filtered.map((item, index) => {
            const name = item.nickname || item.login || '匿名用户';
            const login = item.login ? `@${item.login}` : '';
            const avatar = item.avatarUrl
                ? `<img src="${item.avatarUrl}" alt="${name}">`
                : `<span>${getInitial(name)}</span>`;
            return `
                <div class="online-card" data-index="${index}">
                  <div class="online-avatar">${avatar}</div>
                  <div>
                    <div class="online-name">${name}</div>
                    <div class="online-login">${login}</div>
                  </div>
                  <div class="online-page">${item.title || item.path || ''}</div>
                </div>
            `;
        }).join('');

        el.grid.querySelectorAll('.online-card').forEach((card) => {
            card.addEventListener('click', () => {
                const index = Number(card.getAttribute('data-index'));
                const item = filtered[index];
                if (item) selectUser(item);
            });
        });
    }

    async function loadPresence() {
        try {
            setText(el.status, '正在加载在线用户...');
            const db = await ensureFirebase();
            const snap = await db.ref('presence').once('value');
            const raw = snap.val() || {};
            const now = Date.now();
            presenceItems = Object.values(raw)
                .filter((item) => item && item.lastSeen && now - item.lastSeen <= ONLINE_WINDOW)
                .map((item) => ({
                    uid: item.uid || '',
                    nickname: item.nickname || '',
                    login: item.login || '',
                    avatarUrl: item.avatarUrl || '',
                    path: item.path || '',
                    title: item.title || '',
                    lastSeen: item.lastSeen || 0
                }))
                .sort((a, b) => b.lastSeen - a.lastSeen);
            setText(el.status, `在线窗口：最近 ${ONLINE_WINDOW / 60000} 分钟`);
            render();
        } catch (error) {
            console.error('在线用户加载失败:', error);
            setText(el.status, '在线用户加载失败');
        }
    }

    function bindEvents() {
        if (el.filter instanceof HTMLInputElement) {
            el.filter.addEventListener('input', () => render());
        }
    }

    async function init() {
        bindEvents();
        await loadPresence();
        window.setInterval(loadPresence, 60 * 1000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { void init(); });
    } else {
        void init();
    }
})();
