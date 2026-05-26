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
        searchInput: document.getElementById('adminSearchInput'),
        exportRegisteredBtn: document.getElementById('exportRegisteredBtn'),
        exportUsersBtn: document.getElementById('exportUsersBtn'),
        exportEventsBtn: document.getElementById('exportEventsBtn'),
        viewFilter: document.getElementById('adminViewFilter'),
        nowTime: document.getElementById('adminNowTime'),
        sessionState: document.getElementById('adminSessionState'),
        firebaseState: document.getElementById('adminFirebaseState'),
        summaryUsers: document.getElementById('summaryUsers'),
        summaryOnline: document.getElementById('summaryOnline'),
        summaryLogins: document.getElementById('summaryLogins'),
        summaryViews: document.getElementById('summaryViews'),
        summaryRegistered: document.getElementById('summaryRegistered'),
        usersBody: document.getElementById('adminUsersBody'),
        registeredBody: document.getElementById('adminRegisteredBody'),
        loginFeed: document.getElementById('adminLoginFeed'),
        activityFeed: document.getElementById('adminActivityFeed'),
        badgeUserInput: document.getElementById('badgeUserInput'),
        badgeNameInput: document.getElementById('badgeNameInput'),
        badgeSetBtn: document.getElementById('badgeSetBtn'),
        badgeRemoveBtn: document.getElementById('badgeRemoveBtn'),
        badgeTip: document.getElementById('badgeTip'),
        badgeList: document.getElementById('badgeList')
    };

    let firebaseReady = false;
    let lastData = { users: {}, presence: {} };
    let filteredEntries = [];

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

    function getGuestName(uid) {
        const suffix = uid ? String(uid).slice(-4) : '0000';
        return `访客${suffix}`;
    }

    function getDisplayName(nickname, login, uid) {
        if (nickname && String(nickname).trim()) return String(nickname).trim();
        if (login && String(login).trim()) return String(login).trim();
        return getGuestName(uid);
    }

    async function ensureFirebase() {
        if (firebaseReady) return window.firebase.database();
        if (!window.QuarkFirebaseReady) {
            throw new Error('Firebase就绪模块未加载');
        }
        setText(el.firebaseState, '等待中');
        const db = await window.QuarkFirebaseReady.ensureDatabase({
            scriptId: 'firebase-config-loader-admin'
        });
        firebaseReady = true;
        setText(el.firebaseState, '已连接');
        return db;
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
            const response = await fetch(`${API_BASE}/api/admin?action=verify`, {
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
            const response = await fetch(`${API_BASE}/api/admin?action=auth`, {
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

    function isRegisteredEntry(entry) {
        return Boolean(entry?.profile?.login && String(entry.profile.login).trim());
    }

    function toCsv(rows) {
        return rows.map((row) => row.map((cell) => {
            const value = cell === null || cell === undefined ? '' : String(cell);
            if (value.includes('"') || value.includes(',') || value.includes('\n')) {
                return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
        }).join(',')).join('\n');
    }

    function downloadCsv(filename, rows) {
        const csv = toCsv(rows);
        const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
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

        const registeredCount = userEntries.filter(([, user]) => {
            const login = user?.profile?.login;
            return Boolean(login && String(login).trim());
        }).length;
        setText(el.summaryRegistered, String(registeredCount));
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

        filteredEntries = applyFilters(entries);

        if (filteredEntries.length === 0) {
            el.usersBody.innerHTML = '<div class="feed-secondary">暂无用户数据</div>';
            return;
        }

        var maxShow = filteredEntries.length > 80 ? filteredEntries.length : 0;
        var displayList = filteredEntries.slice(0, 80);
        el.usersBody.innerHTML = displayList.map((entry) => {
            const name = getDisplayName(entry.profile.nickname, entry.profile.login, entry.uid);
            const login = entry.profile.login ? `@${entry.profile.login}` : '';
            const badge = entry.profile.login ? getBadgeHtml(entry.profile.login, entry.profile.loginType || '') : '';
            const avatarUrl = entry.profile.avatarUrl || '';
            const profileUrl = entry.profile.profileUrl || '';
            const presenceItem = entry.presenceItem || {};
            const locationText = [presenceItem.province || entry.profile.province, presenceItem.city || entry.profile.city]
                .filter(Boolean)
                .join(' ');
            const groups = groupEvents(entry.events).slice(0, 6);
            const avatarHtml = avatarUrl
                ? `<img src="${avatarUrl}" alt="${name}">`
                : `<span>${getInitial(name)}</span>`;

            const metaHtml = `
                <div class="admin-user-meta">
                  <span>最近登录：${formatShortTime(entry.lastLogin)}</span>
                  <span>最近访问：${formatShortTime(entry.lastEvent)}</span>
                  <span>当前页面：${presenceItem.path || '-'}</span>
                  <span>属地：${locationText || '-'}</span>
                  <span>IP：${presenceItem.ip || entry.profile.ip || '-'}</span>
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
                  <div class="admin-user-name">${name}${badge}</div>
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
        }).join('') + (maxShow ? '<div class="feed-secondary" style="text-align:center;padding:8px;">仅显示前 80 条，共 ' + maxShow + ' 条</div>' : '');
    }

    function applyFilters(entries) {
        const keyword = (el.searchInput && el.searchInput.value || '').trim().toLowerCase();
        const filter = el.viewFilter && el.viewFilter.value || 'all';
        const now = Date.now();
        return entries.filter((entry) => {
            if (filter === 'online') {
                const lastSeen = entry.presenceItem?.lastSeen || 0;
                if (!lastSeen || now - lastSeen > ONLINE_WINDOW) return false;
            }
            if (filter === 'recent') {
                const lastEvent = entry.lastEvent || 0;
                const lastLogin = entry.lastLogin || 0;
                const last = Math.max(lastEvent, lastLogin);
                if (!last || now - last > LOGIN_WINDOW) return false;
            }
            if (!keyword) return true;
            const text = [
                entry.profile.nickname,
                entry.profile.login,
                entry.presenceItem?.path,
                entry.presenceItem?.title
            ].filter(Boolean).join(' ').toLowerCase();
            return text.includes(keyword);
        });
    }

    function getBadgeHtml(login, loginType) {
        var badges = window.__USER_BADGES__ || {};
        var key = loginType === 'local' ? 'qb_' + login : 'gh_' + login;
        var data = badges[key];
        if (data && data.badge) return ' <span class="user-badge">' + data.badge + '</span>';
        return '';
    }

    function renderRegisteredUsers(entries) {
        if (!el.registeredBody) return;
        var registered = entries.filter(function (entry) { return isRegisteredEntry(entry); });
        if (registered.length === 0) {
            el.registeredBody.innerHTML = '<div class="feed-secondary">暂无注册用户</div>';
            return;
        }

        el.registeredBody.innerHTML = registered.map(function (entry) {
            var name = getDisplayName(entry.profile.nickname, entry.profile.login, entry.uid);
            var login = entry.profile.login || '';
            var loginType = entry.profile.loginType === 'local' ? '夸克账号' : 'GitHub';
            var avatarUrl = entry.profile.avatarUrl || '';
            var avatarHtml = avatarUrl
                ? '<img src="' + avatarUrl + '" alt="' + name + '">'
                : '<span>' + getInitial(name) + '</span>';
            var locationText = [entry.presenceItem?.province || entry.profile.province, entry.presenceItem?.city || entry.profile.city]
                .filter(Boolean)
                .join(' ');
            var badgeHtml = entry.profile.login ? getBadgeHtml(entry.profile.login, entry.profile.loginType || '') : '';

            return '<div class="registered-user-item">' +
                '<div class="admin-avatar registered-user-avatar">' + avatarHtml + '</div>' +
                '<div class="registered-user-main">' +
                '<div class="registered-user-name">' + name + badgeHtml + '</div>' +
                '<div class="registered-user-login">@' + login + '</div>' +
                '</div>' +
                '<div class="registered-user-meta">' +
                '<span>' + loginType + '</span>' +
                '<span>' + (locationText || '位置未知') + '</span>' +
                '<span>最近活跃 ' + formatShortTime(entry.lastSeen) + '</span>' +
                '</div>' +
                '</div>';
        }).join('');
    }

    function renderLoginFeed(users) {
        if (!el.loginFeed) return;
        var items = [];
        var entries = Object.entries(users || {});
        for (var _i4 = 0; _i4 < entries.length && items.length < 120; _i4++) {
            var entry = entries[_i4];
            var uid = entry[0];
            var user = entry[1];
            var logins = collectItems(user?.logins);
            for (var _j = 0; _j < logins.length && items.length < 120; _j++) {
                var login = logins[_j];
                var fallbackName = getDisplayName(user?.profile?.nickname, user?.profile?.login, uid);
                items.push({
                    uid: uid,
                    ts: login.ts || 0,
                    nickname: login.nickname || user?.profile?.nickname || fallbackName,
                    login: login.login || user?.profile?.login || ''
                });
            }
        }
        items.sort(function (a, b) { return b.ts - a.ts; });
        var display = items.slice(0, 20);
        if (display.length === 0) {
            el.loginFeed.innerHTML = '<div class="feed-secondary">暂无登录记录</div>';
            return;
        }
        el.loginFeed.innerHTML = display.map(function (item) {
            return '<div class="feed-item">' +
                '<div>' +
                '<div class="feed-primary">' + item.nickname + (item.login ? ' · @' + item.login : '') + '</div>' +
                '<div class="feed-secondary">' + item.uid + '</div>' +
                '</div>' +
                '<div class="feed-secondary">' + formatShortTime(item.ts) + '</div>' +
                '</div>';
        }).join('');
    }

    function renderActivityFeed(users) {
        if (!el.activityFeed) return;
        var items = [];
        var entries = Object.entries(users || {});
        for (var _i5 = 0; _i5 < entries.length && items.length < 150; _i5++) {
            var entry = entries[_i5];
            var uid = entry[0];
            var user = entry[1];
            var events = collectItems(user?.events);
            for (var _j2 = 0; _j2 < events.length && items.length < 150; _j2++) {
                var event = events[_j2];
                var fallbackName = getDisplayName(user?.profile?.nickname, user?.profile?.login, uid);
                items.push({
                    uid: uid,
                    ts: event.ts || 0,
                    path: event.path || '/',
                    title: event.title || '',
                    nickname: event.nickname || user?.profile?.nickname || fallbackName,
                    login: event.login || user?.profile?.login || ''
                });
            }
        }
        items.sort(function (a, b) { return b.ts - a.ts; });
        var display = items.slice(0, 30);
        if (display.length === 0) {
            el.activityFeed.innerHTML = '<div class="feed-secondary">暂无访问记录</div>';
            return;
        }
        el.activityFeed.innerHTML = display.map(function (item) {
            return '<div class="feed-item">' +
                '<div>' +
                '<div class="feed-primary">' + item.nickname + (item.login ? ' · @' + item.login : '') + '</div>' +
                '<div class="feed-secondary">' + (item.title || item.path) + '</div>' +
                '</div>' +
                '<div class="feed-secondary">' + formatShortTime(item.ts) + '</div>' +
                '</div>';
        }).join('');
    }

    function exportUsers() {
        if (!filteredEntries.length) return;
        const rows = [
            ['uid', 'nickname', 'login', 'avatarUrl', 'profileUrl', 'province', 'city', 'ip', 'lastLogin', 'lastEvent', 'currentPath', 'lastSeen']
        ];
        filteredEntries.forEach((entry) => {
            rows.push([
                entry.uid,
                entry.profile.nickname || '',
                entry.profile.login || '',
                entry.profile.avatarUrl || '',
                entry.profile.profileUrl || '',
                entry.profile.province || entry.presenceItem?.province || '',
                entry.profile.city || entry.presenceItem?.city || '',
                entry.profile.ip || entry.presenceItem?.ip || '',
                formatTime(entry.lastLogin),
                formatTime(entry.lastEvent),
                entry.presenceItem?.path || '',
                formatTime(entry.presenceItem?.lastSeen || 0)
            ]);
        });
        downloadCsv(`admin-users-${Date.now()}.csv`, rows);
    }

    function exportRegisteredUsers() {
        const registeredEntries = filteredEntries.filter((entry) => isRegisteredEntry(entry));
        if (!registeredEntries.length) return;
        const rows = [
            ['uid', 'nickname', 'login', 'loginType', 'avatarUrl', 'profileUrl', 'province', 'city', 'ip', 'lastLogin', 'lastEvent', 'currentPath', 'lastSeen']
        ];
        registeredEntries.forEach((entry) => {
            rows.push([
                entry.uid,
                entry.profile.nickname || '',
                entry.profile.login || '',
                entry.profile.loginType || '',
                entry.profile.avatarUrl || '',
                entry.profile.profileUrl || '',
                entry.profile.province || entry.presenceItem?.province || '',
                entry.profile.city || entry.presenceItem?.city || '',
                entry.profile.ip || entry.presenceItem?.ip || '',
                formatTime(entry.lastLogin),
                formatTime(entry.lastEvent),
                entry.presenceItem?.path || '',
                formatTime(entry.presenceItem?.lastSeen || 0)
            ]);
        });
        downloadCsv(`admin-registered-users-${Date.now()}.csv`, rows);
    }

    function exportEvents() {
        const rows = [
            ['uid', 'nickname', 'login', 'province', 'city', 'ip', 'path', 'title', 'time']
        ];
        Object.entries(lastData.users || {}).forEach(([uid, user]) => {
            const profile = user?.profile || {};
            collectItems(user?.events).forEach((event) => {
                rows.push([
                    uid,
                    event.nickname || profile.nickname || '',
                    event.login || profile.login || '',
                    profile.province || '',
                    profile.city || '',
                    profile.ip || '',
                    event.path || '',
                    event.title || '',
                    formatTime(event.ts)
                ]);
            });
        });
        if (rows.length === 1) return;
        downloadCsv(`admin-events-${Date.now()}.csv`, rows);
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
            renderRegisteredUsers(filteredEntries);
            renderLoginFeed(lastData.users);
            renderActivityFeed(lastData.users);
        } catch (error) {
            console.error('加载用户活动失败:', error);
            if (el.usersBody) el.usersBody.innerHTML = '<div class="feed-secondary">数据加载失败</div>';
            if (el.registeredBody) el.registeredBody.innerHTML = '<div class="feed-secondary">数据加载失败</div>';
        }
    }

    // ── Badge Management ──

    function dbFetchWithTimeout(path, timeout) {
        timeout = timeout || 15000;
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, timeout);
        return fetch(API_BASE + '/api/db?path=' + encodeURIComponent(path), { signal: controller.signal })
            .then(function (resp) {
                clearTimeout(timer);
                if (!resp.ok) throw new Error('HTTP ' + resp.status);
                return resp.json();
            })
            .catch(function (err) {
                clearTimeout(timer);
                throw err;
            });
    }

    function dbPostWithTimeout(op, path, value, timeout) {
        timeout = timeout || 15000;
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, timeout);
        return fetch(API_BASE + '/api/db', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({ op: op, path: path, value: value })
        })
            .then(function (resp) {
                clearTimeout(timer);
                if (!resp.ok) throw new Error('HTTP ' + resp.status);
                return resp.json();
            })
            .catch(function (err) {
                clearTimeout(timer);
                throw err;
            });
    }

    async function loadBadgeList() {
        try {
            var data = await dbFetchWithTimeout('user_badges');
            var badges = (data && data.data) ? data.data : {};
            if (!badges || typeof badges !== 'object') badges = {};
            window.__USER_BADGES__ = badges;
            if (el.badgeList) {
                var entries = Object.entries(badges);
                if (entries.length === 0) {
                    el.badgeList.innerHTML = '<div class="feed-secondary">暂无已设置的标识</div>';
                    return;
                }
                el.badgeList.innerHTML = entries.map(function (pair) {
                    var key = pair[0];
                    var val = pair[1];
                    return '<div class="badge-list-item">' +
                        '<span class="badge-list-key">' + key + '</span>' +
                        '<span class="user-badge">' + (val.badge || '') + '</span>' +
                        '<button class="admin-btn ghost badge-edit-btn" data-badge-key="' + key + '" data-badge-name="' + (val.badge || '') + '">编辑</button>' +
                        '</div>';
                }).join('');
                el.badgeList.querySelectorAll('.badge-edit-btn').forEach(function (btn) {
                    btn.addEventListener('click', function () {
                        var key = btn.getAttribute('data-badge-key');
                        var name = btn.getAttribute('data-badge-name');
                        if (el.badgeUserInput instanceof HTMLInputElement) el.badgeUserInput.value = key;
                        if (el.badgeNameInput instanceof HTMLInputElement) el.badgeNameInput.value = name;
                        setText(el.badgeTip, '已填充，点击「设置标识」保存');
                    });
                });
            }
            return badges;
        } catch (error) {
            console.error('加载标识列表失败:', error);
            if (el.badgeList) el.badgeList.innerHTML = '<div class="feed-secondary">暂无标识数据，可直接创建</div>';
            return {};
        }
    }

    async function setBadge() {
        var isValid = await verifyAdminSession();
        if (!isValid) { setText(el.badgeTip, '需要管理员登录'); return; }
        var userInput = el.badgeUserInput instanceof HTMLInputElement ? el.badgeUserInput.value.trim() : '';
        var badgeName = el.badgeNameInput instanceof HTMLInputElement ? el.badgeNameInput.value.trim() : '';
        if (!userInput) { setText(el.badgeTip, '请填写用户标识 (如 gh_lsqkk)'); return; }
        if (!badgeName) { setText(el.badgeTip, '请填写标识名称 (如 站主)'); return; }
        setText(el.badgeTip, '正在设置...');
        try {
            await dbPostWithTimeout('update', 'user_badges/' + userInput, { badge: badgeName, assignedAt: Date.now() });
            setText(el.badgeTip, '标识已设置');
            await loadBadgeList();
            if (window.CommentShared && typeof window.CommentShared.loadBadges === 'function') {
                void window.CommentShared.loadBadges();
            }
        } catch (error) {
            console.error('设置标识失败:', error);
            setText(el.badgeTip, '设置失败：' + (error.message || '网络错误'));
        }
    }

    async function removeBadge() {
        var isValid = await verifyAdminSession();
        if (!isValid) { setText(el.badgeTip, '需要管理员登录'); return; }
        var userInput = el.badgeUserInput instanceof HTMLInputElement ? el.badgeUserInput.value.trim() : '';
        if (!userInput) { setText(el.badgeTip, '请填写用户标识'); return; }
        if (!confirm('确定移除 ' + userInput + ' 的标识？')) return;
        setText(el.badgeTip, '正在移除...');
        try {
            await dbPostWithTimeout('update', 'user_badges/' + userInput, null);
            setText(el.badgeTip, '标识已移除');
            await loadBadgeList();
            if (window.CommentShared && typeof window.CommentShared.loadBadges === 'function') {
                void window.CommentShared.loadBadges();
            }
        } catch (error) {
            console.error('移除标识失败:', error);
            setText(el.badgeTip, '移除失败：' + (error.message || '网络错误'));
        }
    }

    function startClock() {
        var tick = function () {
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
        if (el.searchInput instanceof HTMLInputElement) {
            el.searchInput.addEventListener('input', () => {
                renderUsers(lastData.users, lastData.presence);
                renderRegisteredUsers(filteredEntries);
            });
        }
        if (el.viewFilter instanceof HTMLSelectElement) {
            el.viewFilter.addEventListener('change', () => {
                renderUsers(lastData.users, lastData.presence);
                renderRegisteredUsers(filteredEntries);
            });
        }
        if (el.exportRegisteredBtn) el.exportRegisteredBtn.addEventListener('click', () => exportRegisteredUsers());
        if (el.exportUsersBtn) el.exportUsersBtn.addEventListener('click', () => exportUsers());
        if (el.exportEventsBtn) el.exportEventsBtn.addEventListener('click', () => exportEvents());
        // Badge management
        if (el.badgeSetBtn) el.badgeSetBtn.addEventListener('click', () => { void setBadge(); });
        if (el.badgeRemoveBtn) el.badgeRemoveBtn.addEventListener('click', () => { void removeBadge(); });
    }

    async function init() {
        startClock();
        bindEvents();
        await verifyAdminSession();
        await loadAllData();
        await loadBadgeList();
        if (window.CommentShared && typeof window.CommentShared.loadBadges === 'function') {
            void window.CommentShared.loadBadges();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { void init(); });
    } else {
        void init();
    }
})();
