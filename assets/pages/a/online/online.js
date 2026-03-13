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

    function getGuestName(uid) {
        const suffix = uid ? String(uid).slice(-4) : '0000';
        return `访客${suffix}`;
    }

    function getDisplayName(nickname, login, uid) {
        const nick = nickname && String(nickname).trim();
        if (nick && nick !== '访客') return nick;
        const lg = login && String(login).trim();
        if (lg) return lg;
        return getGuestName(uid);
    }

    function selectUser(item) {
        if (!el.detail) return;
        const locationText = [item.province, item.city].filter(Boolean).join(' ');
        const name = getDisplayName(item.nickname, item.login, item.uid);
        el.detail.innerHTML = `
            <h3>选中用户</h3>
            <div class="detail-row"><span>昵称</span><strong>${name}</strong></div>
            <div class="detail-row"><span>账号</span><strong>${item.login || '-'}</strong></div>
            <div class="detail-row"><span>属地</span><strong>${locationText || '-'}</strong></div>
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
            const name = getDisplayName(item.nickname, item.login, item.uid);
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
                  <div class="online-page">${[item.province, item.city].filter(Boolean).join(' ') || (item.title || item.path || '')}</div>
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
            const resp = await fetch(`${API_BASE}/api/db?path=presence`, { credentials: 'omit' });
            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}`);
            }
            const payload = await resp.json();
            const raw = (payload && payload.data) ? payload.data : {};
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
                    province: item.province || '',
                    city: item.city || '',
                    ip: item.ip || '',
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
