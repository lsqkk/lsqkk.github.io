// @ts-check

(function () {
    const API_BASE = '__API_BASE__';
    const ADMIN_TOKEN_KEY = 'admin_users_token';
    const ONLINE_WINDOW = 15 * 60 * 1000;
    const LOGIN_WINDOW = 24 * 60 * 60 * 1000;
    const VIEW_WINDOW = 60 * 60 * 1000;
    const GROUP_WINDOW = 10 * 60 * 1000;

    const el = {
        loginTip: document.getElementById('adminLoginTip'),
        loginBtn: document.getElementById('adminLoginBtn'),
        passwordInput: document.getElementById('adminPassword'),
        refreshBtn: document.getElementById('adminRefreshBtn'),
        nowTime: document.getElementById('adminNowTime'),
        sessionState: document.getElementById('adminSessionState'),
        firebaseState: document.getElementById('adminFirebaseState'),
        summaryUsers: document.getElementById('summaryUsers'),
        summaryOnline: document.getElementById('summaryOnline'),
        summaryLogins: document.getElementById('summaryLogins'),
        summaryViews: document.getElementById('summaryViews'),
        usersBody: document.getElementById('adminUsersBody'),
        loginFeed: document.getElementById('adminLoginFeed'),
        activityFeed: document.getElementById('adminActivityFeed')
    };

    let firebaseReady = false;
    let lastData = { users: {}, presence: {} };

    function setText(target, value) {
        if (target) target.textContent = value;
    }

    function formatTime(ts) {
        if (!ts) return '-';
        try {
            return new Date(ts).toLocaleString('zh-CN', { hour12: false });
        } catch {
            return '-';
        }
    }

    function formatShortTime(ts) {
        if (!ts) return '-';
        const date = new Date(ts);
        return `${date.getMonth() + 1}-${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
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
            await loadScript('https://www.gstatic.com/firebasejs/8.10.0/firebase-app.js', 'admin-firebase-app');
            await loadScript('https://www.gstatic.com/firebasejs/8.10.0/firebase-database.js', 'admin-firebase-db');
        }
        if (!window.firebaseConfig) {
            await loadScript(`${API_BASE}/api/firebase-config?v=${Date.now()}`, 'admin-firebase-config');
            await waitForFirebaseConfig(20000);
        }
        if (!window.firebase.apps || !window.firebase.apps.length) {
            window.firebase.initializeApp(window.firebaseConfig);
        }
        firebaseReady = true;
        setText(el.firebaseState, '已连接');
        return window.firebase.database();
    }

    function getAdminToken() {
        return localStorage.getItem(ADMIN_TOKEN_KEY) || '';
    }

    function setAdminToken(token) {
        if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token);
        else localStorage.removeItem(ADMIN_TOKEN_KEY);
    }

    async function sha256(text) {
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        const hash = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }

    async function verifyAdminSession() {
        const token = getAdminToken();
        if (!token) {
            setText(el.sessionState, '未登录');
            return false;
        }
        try {
            const response = await fetch(`${API_BASE}/api/admin-verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token })
            });
            const result = await response.json();
            const valid = !!(response.ok && result.valid);
            if (!valid) setAdminToken('');
            setText(el.sessionState, valid ? '已验证' : '失效');
            return valid;
        } catch (error) {
            console.error('管理员校验失败:', error);
            setText(el.sessionState, '失败');
            return false;
        }
    }

    async function adminLogin() {
        if (!(el.passwordInput instanceof HTMLInputElement)) return;
        const password = el.passwordInput.value.trim();
        if (!password) {
            setText(el.loginTip, '请输入管理员密码');
            el.passwordInput.focus();
            return;
        }
        if (el.loginBtn) el.loginBtn.setAttribute('disabled', 'true');
        setText(el.loginTip, '正在验证...');
        try {
            const hash = await sha256(password);
            const response = await fetch(`${API_BASE}/api/admin-auth`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ passwordHash: hash })
            });
            const result = await response.json();
            if (response.ok && result.token) {
                setAdminToken(result.token);
                setText(el.loginTip, '管理员登录成功');
                setText(el.sessionState, '已验证');
                el.passwordInput.value = '';
                await loadAllData();
            } else {
                setText(el.loginTip, result.error || '管理员验证失败');
            }
        } catch (error) {
            console.error('管理员登录失败:', error);
            setText(el.loginTip, '管理员验证失败');
        } finally {
            if (el.loginBtn) el.loginBtn.removeAttribute('disabled');
        }
    }

    function collectItems(map) {
        if (!map || typeof map !== 'object') return [];
        return Object.values(map).filter((item) => item && typeof item === 'object');
    }

    function groupEvents(events) {
        const sorted = events
            .filter((ev) => ev && ev.ts)
            .sort((a, b) => a.ts - b.ts);
        /** @type {Array<{path: string, start: number, end: number, count: number, items: any[]}>} */
        const groups = [];
        for (const ev of sorted) {
            const path = ev.path || '/';
            const last = groups[groups.length - 1];
            if (last && last.path === path && ev.ts - last.end <= GROUP_WINDOW) {
                last.end = ev.ts;
                last.count += 1;
                last.items.push(ev);
            } else {
                groups.push({ path, start: ev.ts, end: ev.ts, count: 1, items: [ev] });
            }
        }
        return groups.reverse();
    }

    function renderSummary(users, presence) {
        const userEntries = Object.entries(users || {});
        setText(el.summaryUsers, String(userEntries.length));

        const now = Date.now();
        const onlineCount = Object.values(presence || {}).filter((item) => item && item.lastSeen && now - item.lastSeen <= ONLINE_WINDOW).length;
        setText(el.summaryOnline, String(onlineCount));

        let recentLogins = 0;
        let recentViews = 0;
        userEntries.forEach(([, user]) => {
            const logins = collectItems(user?.logins);
            recentLogins += logins.filter((item) => item.ts && now - item.ts <= LOGIN_WINDOW).length;
            const events = collectItems(user?.events);
            recentViews += events.filter((item) => item.ts && now - item.ts <= VIEW_WINDOW).length;
        });
        setText(el.summaryLogins, String(recentLogins));
        setText(el.summaryViews, String(recentViews));
    }

    function renderUsers(users, presence) {
        if (!el.usersBody) return;
        const entries = Object.entries(users || {}).map(([uid, user]) => {
            const profile = user?.profile || {};
            const logins = collectItems(user?.logins);
            const events = collectItems(user?.events);
            const lastLogin = logins.reduce((acc, cur) => (cur.ts && cur.ts > acc ? cur.ts : acc), 0);
            const lastEvent = events.reduce((acc, cur) => (cur.ts && cur.ts > acc ? cur.ts : acc), 0);
            const presenceItem = presence?.[uid];
            const lastSeen = presenceItem?.lastSeen || lastEvent || lastLogin || 0;
            return { uid, profile, logins, events, lastLogin, lastEvent, presenceItem, lastSeen };
        }).sort((a, b) => b.lastSeen - a.lastSeen);

        if (entries.length === 0) {
            el.usersBody.innerHTML = '<div class="feed-secondary">暂无用户数据</div>';
            return;
        }

        el.usersBody.innerHTML = entries.map((entry) => {
            const name = entry.profile.nickname || entry.profile.login || '未命名用户';
            const login = entry.profile.login ? `@${entry.profile.login}` : '';
            const avatarUrl = entry.profile.avatarUrl || '';
            const profileUrl = entry.profile.profileUrl || '';
            const presenceItem = entry.presenceItem || {};
            const groups = groupEvents(entry.events).slice(0, 6);
            const avatarHtml = avatarUrl
                ? `<img src="${avatarUrl}" alt="${name}">`
                : `<span>${getInitial(name)}</span>`;

            const metaHtml = `
                <div class="admin-user-meta">
                  <span>最近登录：${formatShortTime(entry.lastLogin)}</span>
                  <span>最近访问：${formatShortTime(entry.lastEvent)}</span>
                  <span>当前页面：${presenceItem.path || '-'}</span>
                </div>
            `;

            const eventsHtml = groups.length
                ? `
                    <div class="admin-user-events">
                      ${groups.map((group) => `
                        <details class="event-group">
                          <summary>
                            <span class="event-path">${group.path}</span>
                            <span class="event-meta">${formatShortTime(group.start)} - ${formatShortTime(group.end)} · ${group.count} 次</span>
                          </summary>
                          <div class="event-items">
                            ${group.items.slice(-6).map((item) => `
                              <div>${formatShortTime(item.ts)} · ${(item.title || item.path || '').slice(0, 48)}</div>
                            `).join('')}
                          </div>
                        </details>
                      `).join('')}
                    </div>
                `
                : '<div class="feed-secondary">暂无访问记录</div>';

            const header = `
                <div class="admin-user-header">
                  <div class="admin-user-name">${name}</div>
                  <div class="admin-user-login">${login}</div>
                </div>
            `;

            const wrappedHeader = profileUrl
                ? `<a href="${profileUrl}" target="_blank" rel="noreferrer">${header}</a>`
                : header;

            return `
                <div class="admin-user">
                  <div class="admin-avatar">${avatarHtml}</div>
                  <div>
                    ${wrappedHeader}
                    ${metaHtml}
                    ${eventsHtml}
                  </div>
                </div>
            `;
        }).join('');
    }

    function renderLoginFeed(users) {
        if (!el.loginFeed) return;
        const items = [];
        Object.entries(users || {}).forEach(([uid, user]) => {
            collectItems(user?.logins).forEach((login) => {
                items.push({
                    uid,
                    ts: login.ts || 0,
                    nickname: login.nickname || user?.profile?.nickname || '未知用户',
                    login: login.login || user?.profile?.login || ''
                });
            });
        });
        items.sort((a, b) => b.ts - a.ts);
        const display = items.slice(0, 20);
        if (display.length === 0) {
            el.loginFeed.innerHTML = '<div class="feed-secondary">暂无登录记录</div>';
            return;
        }
        el.loginFeed.innerHTML = display.map((item) => `
            <div class="feed-item">
              <div>
                <div class="feed-primary">${item.nickname}${item.login ? ` · @${item.login}` : ''}</div>
                <div class="feed-secondary">${item.uid}</div>
              </div>
              <div class="feed-secondary">${formatShortTime(item.ts)}</div>
            </div>
        `).join('');
    }

    function renderActivityFeed(users) {
        if (!el.activityFeed) return;
        const items = [];
        Object.entries(users || {}).forEach(([uid, user]) => {
            collectItems(user?.events).forEach((event) => {
                items.push({
                    uid,
                    ts: event.ts || 0,
                    path: event.path || '/',
                    title: event.title || '',
                    nickname: event.nickname || user?.profile?.nickname || '未知用户',
                    login: event.login || user?.profile?.login || ''
                });
            });
        });
        items.sort((a, b) => b.ts - a.ts);
        const display = items.slice(0, 30);
        if (display.length === 0) {
            el.activityFeed.innerHTML = '<div class="feed-secondary">暂无访问记录</div>';
            return;
        }
        el.activityFeed.innerHTML = display.map((item) => `
            <div class="feed-item">
              <div>
                <div class="feed-primary">${item.nickname}${item.login ? ` · @${item.login}` : ''}</div>
                <div class="feed-secondary">${item.title || item.path}</div>
              </div>
              <div class="feed-secondary">${formatShortTime(item.ts)}</div>
            </div>
        `).join('');
    }

    async function loadAllData() {
        const isAdmin = await verifyAdminSession();
        if (!isAdmin) {
            setText(el.loginTip, '需要管理员登录才能查看数据');
            return;
        }
        try {
            const db = await ensureFirebase();
            const [usersSnap, presenceSnap] = await Promise.all([
                db.ref('user_activity').once('value'),
                db.ref('presence').once('value')
            ]);
            lastData = {
                users: usersSnap.val() || {},
                presence: presenceSnap.val() || {}
            };
            renderSummary(lastData.users, lastData.presence);
            renderUsers(lastData.users, lastData.presence);
            renderLoginFeed(lastData.users);
            renderActivityFeed(lastData.users);
        } catch (error) {
            console.error('加载用户活动失败:', error);
            if (el.usersBody) el.usersBody.innerHTML = '<div class="feed-secondary">数据加载失败</div>';
        }
    }

    function startClock() {
        const tick = () => {
            setText(el.nowTime, formatTime(Date.now()));
        };
        tick();
        window.setInterval(tick, 1000);
    }

    function bindEvents() {
        if (el.loginBtn) el.loginBtn.addEventListener('click', () => adminLogin());
        if (el.refreshBtn) el.refreshBtn.addEventListener('click', () => loadAllData());
        if (el.passwordInput instanceof HTMLInputElement) {
            el.passwordInput.addEventListener('keypress', (event) => {
                if (event.key === 'Enter') adminLogin();
            });
        }
    }

    async function init() {
        startClock();
        bindEvents();
        await verifyAdminSession();
        await loadAllData();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { void init(); });
    } else {
        void init();
    }
})();
