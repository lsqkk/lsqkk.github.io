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

    function getBadgeHtml(login, loginType) {
        var shared = window.CommentShared;
        if (shared && typeof shared.renderBadge === 'function') {
            var identifier = loginType === 'local' ? 'qb_' + login : 'gh_' + login;
            return shared.renderBadge(identifier);
        }
        var badges = window.__USER_BADGES__ || {};
        var key = loginType === 'local' ? 'qb_' + login : 'gh_' + login;
        var data = badges[key];
        if (data && data.badge) return '<span class="user-badge">' + data.badge + '</span>';
        return '';
    }

    function getSpaceUrl(login, loginType) {
        var shared = window.CommentShared;
        if (shared && typeof shared.getUserSpaceUrl === 'function') {
            return shared.getUserSpaceUrl(login, loginType);
        }
        var identifier = loginType === 'local' ? 'qb_' + login : 'gh_' + login;
        return identifier ? '/space?user=' + encodeURIComponent(identifier) : '';
    }

    function render() {
        if (!el.grid) return;
        var keyword = (el.filter && el.filter.value || '').trim().toLowerCase();
        var filtered = presenceItems.filter(function (item) {
            var text = (item.nickname || '') + ' ' + (item.login || '');
            return !keyword || text.toLowerCase().includes(keyword);
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

        el.grid.innerHTML = filtered.map(function (item, index) {
            var name = getDisplayName(item.nickname, item.login, item.uid);
            var login = item.login ? '@' + item.login : '';
            var badge = item.login ? getBadgeHtml(item.login, item.loginType || '') : '';
            var avatar = item.avatarUrl
                ? '<img src="' + item.avatarUrl + '" alt="' + name + '">'
                : '<span>' + getInitial(name) + '</span>';
            // Registered users go to their space, guests show detail
            var isGuest = !item.login;
            return '<div class="online-card" data-index="' + index + '" data-is-guest="' + isGuest + '">' +
                '<div class="online-avatar">' + avatar + '</div>' +
                '<div>' +
                '<div class="online-name">' + name + badge + '</div>' +
                '<div class="online-login">' + login + '</div>' +
                '</div>' +
                '<div class="online-page">' + ([item.province, item.city].filter(Boolean).join(' ') || (item.title || item.path || '')) + '</div>' +
                '</div>';
        }).join('');

        el.grid.querySelectorAll('.online-card').forEach(function (card) {
            card.addEventListener('click', function () {
                var index = Number(card.getAttribute('data-index'));
                var item = filtered[index];
                if (!item) return;
                var isGuest = card.getAttribute('data-is-guest') === 'true';
                if (!isGuest && item.login) {
                    // Registered user: go to their space page
                    var url = getSpaceUrl(item.login, item.loginType || '');
                    if (url) { window.location.href = url; return; }
                }
                // Guest or fallback: show detail
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
                    loginType: item.loginType || '',
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
