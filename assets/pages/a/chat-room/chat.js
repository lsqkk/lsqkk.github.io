(() => {
    const byId = (id) => document.getElementById(id);
    const stream = byId('messagesContainer');
    const list = byId('messagesList');
    const input = byId('messageInput');
    const compose = byId('messageForm');
    const pageSize = 40;
    const imageLimit = 220000;
    const dateLabel = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' });
    const timeLabel = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' });
    const mobile = matchMedia('(max-width: 700px)');
    let feedbackTimer;
    const managedPattern = /^QC-[A-Z0-9_-]{12}$/;
    let managed;
    let pollTimer;
    let requestVersion = 0;
    let presenceRef;
    let presenceListener;
    let presenceEntry;
    let presenceCount = null;
    let databasePromise;
    let room = '';
    let version = 0;
    let reference;
    let query;
    let queryListener;
    let connectionRef;
    let connectionListener;
    let online = false;
    let received = false;
    let recentKeys = new Set();
    let latestKey = '';
    let historyCursor = '';
    let lastRead = '';
    let unread = 0;
    let reply;
    let attachment;
    let taskTitle = '';
    let sending = false;
    let preparing = false;
    const messages = new Map();
    const messageRows = new Map();

    function stored(key, fallback) {
        try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
        catch { return fallback; }
    }

    const deviceId = localStorage.getItem('qc-device') || crypto.randomUUID();
    localStorage.setItem('qc-device', deviceId);
    const guest = stored('qc-profile', { name: localStorage.getItem('nickname') || '', color: '#5874dd' });
    let profile = guest;

    function avatarUrl(value) {
        try {
            if (typeof value !== 'string' || value.length > 500) return '';
            const url = new URL(value);
            return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
        } catch { return ''; }
    }

    function node(tag, className, content) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (content !== undefined) element.textContent = content;
        return element;
    }

    function button(text, action, className) {
        const control = node('button', className, text);
        control.type = 'button';
        control.addEventListener('click', action);
        return control;
    }

    function inform(text) {
        clearTimeout(feedbackTimer);
        const feedback = byId('chatFeedback');
        feedback.textContent = text;
        feedback.hidden = !text;
        if (text) feedbackTimer = setTimeout(() => { feedback.hidden = true; }, 6000);
    }

    function setRail(open) {
        byId('chatRail').classList.toggle('qc-closed', !open);
        byId('mobileMenuBtn').setAttribute('aria-expanded', String(open));
    }

    byId('mobileMenuBtn').onclick = () => setRail(byId('chatRail').classList.contains('qc-closed'));
    byId('closeChatRail').onclick = () => {
        setRail(false);
        byId('mobileMenuBtn').focus();
    };
    byId('profileButton').onclick = openProfile;
    document.querySelectorAll('[data-close]').forEach((control) => {
        control.addEventListener('click', () => byId(control.dataset.close).close());
    });

    function updateProfile() {
        const account = window.QuarkUserProfile?.getProfile();
        profile = account?.login && account.nickname ? {
            name: account.nickname.slice(0, 32), color: account.avatarColor || guest.color,
            avatarUrl: avatarUrl(account.avatarUrl), account: true
        } : guest;
        const control = byId('profileButton');
        control.replaceChildren();
        const avatar = profile.avatarUrl && node('img', 'qc-profile-image');
        if (avatar) {
            avatar.src = profile.avatarUrl;
            avatar.referrerPolicy = 'no-referrer';
            avatar.alt = '';
            avatar.onerror = () => avatar.remove();
            control.append(avatar);
        }
        control.append(node('span', '', profile.name || '设置昵称'));
        compose.hidden = !room || !profile.name;
    }

    function openProfile() {
        byId('nicknameInput').value = profile.name || '';
        byId('nicknameInput').disabled = Boolean(profile.account);
        byId('profileColor').disabled = Boolean(profile.account);
        byId('profileSave').hidden = Boolean(profile.account);
        byId('accountProfileLink').hidden = !profile.account;
        byId('profileColor').value = /^#[a-f0-9]{6}$/i.test(profile.color) ? profile.color : '#5874dd';
        byId('profileDialog').showModal();
    }

    byId('profileForm').onsubmit = (event) => {
        event.preventDefault();
        const name = byId('nicknameInput').value.trim();
        if (!name || profile.account) return;
        profile.name = name;
        profile.color = byId('profileColor').value;
        localStorage.setItem('qc-profile', JSON.stringify(profile));
        updateProfile();
        byId('profileDialog').close();
        if (room) input.focus();
    };

    window.addEventListener('quark-user-updated', updateProfile);
    window.addEventListener('storage', updateProfile);

    function validRoom(name) {
        return !!name && name.length <= 64 && !/[.#$\[\]/\u0000-\u001f\u007f]/u.test(name) && name !== 'lsqkk-lyb';
    }

    function updateRooms() {
        const rooms = stored('qc-recentRooms', stored('recentRooms', []));
        const container = byId('roomList');
        container.replaceChildren();
        rooms.filter((name) => typeof name === 'string' && validRoom(name)).forEach((name) => {
            const control = button('#  ' + name, () => void join(name), 'qc-room');
            if (name === room) control.setAttribute('aria-current', 'true');
            container.append(control);
        });
        if (!container.children.length) container.append(node('p', '', '访问过的房间会显示在这里。'));
    }

    function roomStorage(part, name = room) {
        return 'qc-' + part + ':' + name;
    }

    function nearBottom() {
        return stream.scrollHeight - stream.scrollTop - stream.clientHeight < 90;
    }

    function markRead() {
        if (!room || managed?.private || !latestKey || document.hidden || !nearBottom() || (unread && lastRead)) return;
        localStorage.setItem(roomStorage('read'), latestKey);
    }

    function scrollLatest() {
        unread = 0;
        lastRead = '';
        if (list.querySelector('.qc-unread')) render();
        stream.scrollTop = stream.scrollHeight;
        updateJump();
        markRead();
    }

    function updateJump() {
        byId('jumpUnread').hidden = !unread || !lastRead;
        byId('jumpLatest').textContent = unread ? '跳到最新 · ' + unread + ' 条新消息' : '回到最新消息';
        byId('jumpBar').hidden = !received || (!unread && nearBottom());
    }

    stream.addEventListener('scroll', () => { updateJump(); markRead(); });
    document.addEventListener('visibilitychange', markRead);
    byId('jumpLatest').onclick = scrollLatest;
    byId('jumpUnread').onclick = async () => {
        const key = lastRead;
        if (!key) return;
        await reveal(key);
    };

    function resetComposer() {
        reply = null;
        attachment = null;
        taskTitle = '';
        byId('imageFile').value = '';
        byId('imagePreview').removeAttribute('src');
        updateComposer();
    }

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = () => {
                script.remove();
                reject(new Error('Firebase SDK load failed'));
            };
            document.head.append(script);
        });
    }

    function getDatabase() {
        if (!databasePromise) {
            databasePromise = (async () => {
                if (!window.firebase?.SDK_VERSION) await loadScript('https://www.gstatic.com/firebasejs/8.10.0/firebase-app.js');
                if (!window.firebase?.database?.ServerValue) await loadScript('https://www.gstatic.com/firebasejs/8.10.0/firebase-database.js');
                return window.QuarkFirebaseReady.ensureDatabase({ loadConfig: true });
            })().catch((error) => {
                databasePromise = null;
                throw error;
            });
        }
        return databasePromise;
    }

    async function api(action, payload) {
        const response = await fetch('__API_BASE__/api/db?view=chat-room', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, member: deviceId, ...payload }),
            signal: AbortSignal.timeout(12000)
        });
        const data = await response.json();
        if (!response.ok) throw Object.assign(new Error(data.error || '聊天室服务暂不可用'), { status: response.status });
        return data;
    }

    function managedCall(action, payload = {}, session = managed) {
        return api(action, { ...payload, code: session.code, token: session.token });
    }

    function updateConnection() {
        const label = byId('connection');
        const count = presenceCount === null ? '在线人数暂不可用' : presenceCount + ' 个在线设备';
        if (!online) label.textContent = '正在重新连接…';
        else if (managed) label.textContent = (managed.private ? '口令房间' : '链接房间') + ' · ' + count + ' · ' + dateLabel.format(managed.expiresAt) + ' ' + timeLabel.format(managed.expiresAt) + ' 到期';
        else label.textContent = '公开房间 · ' + count + ' · 旧房间不自动清理';
    }

    function disconnectRoom() {
        clearTimeout(pollTimer);
        if (managed) void managedCall('leave').catch(() => {});
        managed = null;
        if (presenceRef) presenceRef.off('value', presenceListener);
        if (presenceEntry) {
            const entry = presenceEntry;
            void entry.remove().then(() => entry.onDisconnect().cancel()).catch(() => {});
        }
        presenceRef = null;
        presenceEntry = null;
        presenceCount = null;
    }

    function openAccess(name) {
        byId('accessCode').value = name;
        byId('accessPassword').value = '';
        byId('accessError').textContent = '';
        byId('accessDialog').showModal();
    }

    async function enterManaged(name, password) {
        const active = ++requestVersion;
        try {
            const token = sessionStorage.getItem(roomStorage('token', name));
            const session = await api('join', { code: name, token, password });
            if (active !== requestVersion) return;
            if (byId('accessDialog').open) byId('accessDialog').close();
            sessionStorage.setItem(roomStorage('token', name), session.token);
            await join(name, session);
        } catch (error) {
            if (active !== requestVersion) return;
            if (byId('accessDialog').open) byId('accessError').textContent = error.message;
            else if (error.status === 401 || error.status === 403) openAccess(name);
            else inform(error.message || '无法加入房间');
        }
    }

    byId('accessForm').onsubmit = async event => {
        event.preventDefault();
        const submit = event.currentTarget.querySelector('button[type=submit]');
        submit.disabled = true;
        try { await enterManaged(byId('accessCode').value, byId('accessPassword').value); }
        finally { submit.disabled = false; }
    };
    byId('accessDialog').addEventListener('close', () => { requestVersion++; });
    byId('createRoom').onclick = () => {
        byId('createError').textContent = '';
        byId('createDialog').showModal();
    };
    byId('createForm').onsubmit = async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const submit = form.querySelector('button[type=submit]');
        const active = ++requestVersion;
        submit.disabled = true;
        byId('createError').textContent = '';
        try {
            const session = await api('create', {
                title: byId('createTitle').value,
                password: byId('createPassword').value,
                hours: Number(byId('createRetention').value)
            });
            if (active !== requestVersion || !byId('createDialog').open) return;
            sessionStorage.setItem(roomStorage('token', session.code), session.token);
            byId('createDialog').close();
            form.reset();
            await join(session.code, session);
        } catch (error) { byId('createError').textContent = error.message; }
        finally { submit.disabled = false; }
    };

    async function poll(session, active) {
        if (active !== version) return;
        try {
            const update = await managedCall('poll', { revision: session.revision }, session);
            if (active !== version) return;
            online = true;
            presenceCount = update.online;
            session.revision = update.revision;
            if (update.items) acceptMessages(update.items, active, update.hasMore);
        } catch (error) {
            if (active !== version) return;
            if ([401, 404, 410].includes(error.status)) {
                online = false;
                received = false;
                messages.clear();
                messageRows.clear();
                list.replaceChildren();
                byId('moreHistory').hidden = true;
                byId('jumpBar').hidden = true;
                byId('connection').textContent = error.message;
                compose.hidden = true;
                sessionStorage.removeItem(roomStorage('token', room));
                resetComposer();
                input.value = '';
                return;
            }
            online = false;
        }
        updateConnection();
        updateComposer();
        pollTimer = setTimeout(() => void poll(session, active), document.hidden ? 12000 : 4500);
    }

    async function join(name, session) {
        if (/^QC-/i.test(name) && !session) {
            if (!managedPattern.test(name.toUpperCase())) { inform('房间号格式有误，请检查邀请链接。'); return; }
            await enterManaged(name.toUpperCase());
            return;
        }
        requestVersion++;
        if (!validRoom(name)) {
            inform('请输入有效房间号，房间号不能包含 . # $ [ ] /。');
            return;
        }
        if (room === name && online) return;
        if (room && !managed) localStorage.setItem(roomStorage('draft'), input.value);
        disconnectRoom();
        managed = session || null;
        if (query) query.off('value', queryListener);
        if (connectionRef) connectionRef.off('value', connectionListener);
        const active = ++version;
        room = name;
        reference = null;
        query = null;
        connectionRef = null;
        received = false;
        online = false;
        recentKeys = new Set();
        latestKey = '';
        historyCursor = '';
        unread = 0;
        lastRead = managed?.private ? '' : localStorage.getItem(roomStorage('read')) || '';
        messages.clear();
        messageRows.clear();
        list.replaceChildren();
        resetComposer();
        byId('roomInput').value = room;
        input.value = managed ? '' : localStorage.getItem(roomStorage('draft')) || '';
        byId('currentRoomTitle').textContent = managed?.title || '# ' + room;
        byId('connection').textContent = '连接中…';
        byId('chatEmpty').hidden = true;
        byId('moreHistory').hidden = true;
        byId('roomActions').hidden = false;
        const url = new URL(location.href);
        url.searchParams.set('room', room);
        history.replaceState(null, '', url);
        const recent = stored('qc-recentRooms', stored('recentRooms', [])).filter((item) => item !== room);
        localStorage.setItem('qc-recentRooms', JSON.stringify([room, ...recent].slice(0, 10)));
        updateRooms();
        updateProfile();
        updateJump();
        if (mobile.matches) setRail(false);
        if (managed) {
            void poll(managed, active);
            if (!profile.name && !byId('profileDialog').open) openProfile();
            return;
        }

        try {
            const database = await getDatabase();
            if (active !== version) return;
            reference = database.ref('chatrooms/' + name + '/messages');
            query = reference.orderByKey().limitToLast(pageSize);
            presenceRef = database.ref('chatrooms/' + name + '/presence');
            presenceEntry = presenceRef.child(crypto.randomUUID());
            presenceListener = snapshot => {
                if (active !== version) return;
                presenceCount = snapshot.numChildren();
                updateConnection();
            };
            presenceRef.on('value', presenceListener, () => { presenceCount = null; });
            connectionRef = database.ref('.info/connected');
            connectionListener = (snapshot) => {
                online = snapshot.val() === true;
                if (online) {
                    const entry = presenceEntry;
                    entry.onDisconnect().remove().then(() => {
                        if (active === version) return entry.set(true);
                        return entry.onDisconnect().cancel();
                    }).catch(() => {});
                }
                updateConnection();
                updateComposer();
            };
            connectionRef.on('value', connectionListener);
            queryListener = snapshot => {
                const items = [];
                snapshot.forEach(child => { items.push([child.key, child.val()]); });
                acceptMessages(items, active);
            };
            query.on('value', queryListener, showConnectionError);
            if (!profile.name && !byId('profileDialog').open) openProfile();
        } catch {
            if (active === version) showConnectionError();
        }
    }

    function acceptMessages(items, active, hasMore = items.length >= pageSize) {
        if (active !== version) return;
        const shouldFollow = nearBottom() && !document.hidden && (!unread || !lastRead);
        const nextKeys = new Set();
        let unseen = 0;
        items.forEach(([key, value]) => {
            nextKeys.add(key);
            if (value && typeof value === 'object') {
                messages.set(key, value);
                if (received && key > latestKey && value.sender !== deviceId) {
                    unseen++;
                    notify(value);
                }
            }
        });
        const first = nextKeys.values().next().value;
        if (!historyCursor && first) historyCursor = first;
        recentKeys.forEach((key) => {
            if (!nextKeys.has(key) && (!first || key > first || !hasMore)) messages.delete(key);
        });
        recentKeys = nextKeys;
        const previousLatest = latestKey;
        latestKey = Array.from(nextKeys).at(-1) || '';
        byId('moreHistory').hidden = byId('moreHistory').dataset.exhausted === String(active) || !hasMore;
        if (!received) {
            unread = lastRead ? [...nextKeys].filter((key) => key > lastRead).length : 0;
        } else if (!shouldFollow && unseen) {
            if (!unread) lastRead = managed?.private ? previousLatest : localStorage.getItem(roomStorage('read')) || '';
            unread += unseen;
        }
        const wasReceived = received;
        received = true;
        render();
        if ((!wasReceived && !unread) || (wasReceived && shouldFollow)) scrollLatest();
        else if (!wasReceived && messageRows.has(lastRead)) messageRows.get(lastRead).scrollIntoView({ block: 'center' });
        updateJump();
    }

    function showConnectionError() {
        online = false;
        byId('connection').textContent = '连接失败，请重新进入房间';
        updateComposer();
    }

    byId('roomForm').onsubmit = (event) => {
        event.preventDefault();
        void join(byId('roomInput').value.trim());
    };
    byId('shareRoom').onclick = async () => {
        try {
            await navigator.clipboard.writeText(location.href);
            inform('房间链接已复制');
        } catch { inform('可从地址栏复制房间链接'); }
    };

    function updateNotifications() {
        const enabled = localStorage.getItem('qc-notifications') === 'yes' && window.Notification?.permission === 'granted';
        byId('notifications').setAttribute('aria-pressed', String(enabled));
        byId('notifications').setAttribute('aria-label', enabled ? '关闭桌面通知' : '开启桌面通知');
    }

    byId('notifications').onclick = async () => {
        if (!window.Notification) { inform('此浏览器不支持桌面通知'); return; }
        const permission = await Notification.requestPermission();
        const enable = permission === 'granted' && localStorage.getItem('qc-notifications') !== 'yes';
        localStorage.setItem('qc-notifications', enable ? 'yes' : 'no');
        updateNotifications();
        inform(permission === 'granted' ? (enable ? '已开启桌面通知' : '已关闭桌面通知') : '浏览器未授予通知权限');
    };

    function notify(message) {
        if (!document.hidden || localStorage.getItem('qc-notifications') !== 'yes' || window.Notification?.permission !== 'granted') return;
        if (managed?.private) return;
        try { new Notification('夸克聊天室 · ' + room, { body: (message.nickname || '访客') + '：' + excerpt(message), tag: 'qc-' + room }); }
        catch { /* Browsers with service-worker-only notifications can still read the in-page count. */ }
    }

    async function loadHistory() {
        if ((!reference && !managed) || byId('moreHistory').disabled) return;
        const active = version;
        const first = historyCursor;
        if (!first) return;
        const control = byId('moreHistory');
        control.disabled = true;
        control.textContent = '加载中…';
        try {
            let items = [];
            let hasMore;
            if (managed) {
                ({ items, hasMore } = await managedCall('history', { before: first }));
            } else {
                const snapshot = await reference.orderByKey().endAt(first).limitToLast(pageSize + 1).once('value');
                snapshot.forEach(child => { if (child.key !== first) items.push([child.key, child.val()]); });
            }
            if (active !== version) return;
            items.forEach(([key, value]) => {
                if (key < historyCursor) historyCursor = key;
                if (value && typeof value === 'object') messages.set(key, value);
            });
            const oldTop = stream.scrollTop;
            const oldHeight = stream.scrollHeight;
            control.hidden = !(hasMore ?? items.length >= pageSize);
            if (control.hidden) control.dataset.exhausted = String(active);
            render();
            stream.scrollTop = oldTop + stream.scrollHeight - oldHeight;
        } catch { if (active === version) inform('历史消息加载失败，请重试'); }
        finally {
            control.disabled = false;
            control.textContent = '加载更早消息';
        }
    }

    byId('moreHistory').onclick = loadHistory;

    async function reveal(key) {
        if (typeof key !== 'string' || !/^[-\w]{1,128}$/.test(key)) return;
        if (!messageRows.has(key) && (reference || managed)) {
            const active = version;
            try {
                if (managed) {
                    const { item } = await managedCall('read', { key });
                    if (active !== version) return;
                    messages.set(...item);
                    render();
                } else {
                    const snapshot = await reference.orderByKey().endAt(key).limitToLast(pageSize).once('value');
                    if (active !== version) return;
                    snapshot.forEach((child) => {
                        const value = child.val();
                        if (value && typeof value === 'object') messages.set(child.key, value);
                    });
                    render();
                }
            } catch { if (active === version) inform('无法加载原消息'); return; }
        }
        const row = messageRows.get(key);
        if (!row) { inform('原消息已不可用'); return; }
        row.scrollIntoView({ block: 'center' });
        row.focus({ preventScroll: true });
    }

    function excerpt(message) {
        return String(message.text || message.task?.title || (message.image ? '图片' : '')).slice(0, 120);
    }

    function safeImage(value) {
        return typeof value === 'string' && value.length <= imageLimit &&
            /^data:image\/(?:webp|jpeg|png);base64,[a-z\d+/]+=*$/i.test(value);
    }

    function buildRow(key, message) {
        const name = String(message.nickname || '访客').slice(0, 32);
        const own = message.sender === deviceId;
        const row = node('li', own ? 'qc-message qc-own' : 'qc-message');
        row.tabIndex = -1;
        const avatar = node('span', 'qc-avatar', [...name][0]);
        if (typeof message.color === 'string' && (/^#[a-f\d]{3,8}$/i.test(message.color) || /^rgb\([\d ,]+\)$/.test(message.color))) avatar.style.backgroundColor = message.color;
        avatar.setAttribute('aria-hidden', 'true');
        const photoUrl = avatarUrl(message.avatarUrl);
        if (photoUrl) {
            const photo = node('img');
            photo.src = photoUrl;
            photo.alt = '';
            photo.loading = 'lazy';
            photo.referrerPolicy = 'no-referrer';
            photo.onerror = () => photo.remove();
            avatar.append(photo);
        }
        const body = node('div', 'qc-body');
        const meta = node('div', 'qc-meta');
        meta.append(node('strong', '', name), node('time', '', formatDate(timeLabel, message.timestamp)));
        const bubble = node('div', 'qc-bubble');
        if (message.reply && typeof message.reply.id === 'string') {
            bubble.append(button(String(message.reply.name || '引用') + ' · ' + String(message.reply.text || '').slice(0, 120),
                () => void reveal(message.reply.id), 'qc-quote'));
        }
        if (message.text) bubble.append(node('p', 'qc-text', String(message.text).slice(0, 4000)));
        if (safeImage(message.image)) {
            const preview = button('', () => {
                byId('expandedImage').src = message.image;
                byId('imageDialog').showModal();
            }, 'qc-photo');
            const image = node('img');
            image.src = message.image;
            image.alt = '查看 ' + name + ' 发送的图片';
            image.loading = 'lazy';
            const width = Number(message.imageWidth);
            const height = Number(message.imageHeight);
            if (width > 0 && height > 0 && width <= 1440 && height <= 1440) {
                image.width = width;
                image.height = height;
            }
            preview.append(image);
            bubble.append(preview);
        }
        if (message.task?.title) {
            const card = node('div', 'qc-task');
            const done = message.task.done === true;
            card.append(node('span', 'qc-task-state', done ? '已完成 · ' + String(message.task.by || '房间成员').slice(0, 32) : '待处理'),
                node('strong', '', String(message.task.title).slice(0, 160)));
            card.append(button(done ? '重新打开' : '标为完成', async (event) => {
                if (!online || (!reference && !managed) || !profile.name) { inform('连接后设置昵称即可更新待办'); return; }
                event.currentTarget.disabled = true;
                try {
                    const active = version;
                    if (managed) {
                        const { item } = await managedCall('task', { key, done: !done, nickname: profile.name });
                        if (active === version) { messages.set(...item); render(); }
                        return;
                    }
                    const taskRef = reference.child(key).child('task');
                    if (!recentKeys.has(key)) await taskRef.once('value');
                    const result = await taskRef.transaction((task) => task && task.done === done
                        ? { ...task, done: !done, by: profile.name } : undefined);
                    if (active === version && !recentKeys.has(key) && result?.snapshot) {
                        messages.set(key, { ...messages.get(key), task: result.snapshot.val() });
                        render();
                    }
                } catch { inform('待办更新失败'); }
                finally { card.querySelector('button').disabled = false; }
            }));
            bubble.append(card);
        }
        const actions = node('div', 'qc-message-actions');
        actions.append(button('引用', () => {
            if (!profile.name) { openProfile(); return; }
            reply = { id: key, name, text: excerpt(message) };
            updateComposer();
            input.focus();
        }));
        if (message.text) actions.append(button('复制', async () => {
            try { await navigator.clipboard.writeText(String(message.text)); inform('消息已复制'); }
            catch { inform('无法访问剪贴板'); }
        }));
        body.append(meta, bubble, actions);
        row.append(avatar, body);
        return row;
    }

    function formatDate(format, timestamp) {
        const date = new Date(Number(timestamp));
        return timestamp && Number.isFinite(date.getTime()) ? format.format(date) : '';
    }

    function render() {
        const focusedRow = document.activeElement?.closest('.qc-message');
        const focusedKey = focusedRow?.dataset.message;
        const oldTop = stream.scrollTop;
        const fragment = document.createDocumentFragment();
        messageRows.clear();
        let previousDate;
        let unreadDividerShown = false;
        [...messages.keys()].sort().forEach((key) => {
            const message = messages.get(key);
            const date = formatDate(dateLabel, message.timestamp);
            if (date && date !== previousDate) fragment.append(node('li', 'qc-divider', date));
            previousDate = date;
            if (unread && lastRead && key > lastRead && !unreadDividerShown) {
                fragment.append(node('li', 'qc-divider qc-unread', '上次读到这里'));
                unreadDividerShown = true;
            }
            const row = buildRow(key, message);
            row.dataset.message = key;
            messageRows.set(key, row);
            fragment.append(row);
        });
        if (!fragment.children.length) fragment.append(node('li', 'qc-no-messages', '房间还没有消息。'));
        list.replaceChildren(fragment);
        if (byId('roomTasksDialog').open) renderTasks();
        if (byId('searchChatDialog').open) renderSearch();
        stream.scrollTop = oldTop;
        if (focusedKey) messageRows.get(focusedKey)?.focus({ preventScroll: true });
    }

    function updateComposer() {
        byId('replyContext').hidden = !reply;
        byId('replyText').textContent = reply ? '引用 ' + reply.name + ' · ' + reply.text : '';
        byId('imageContext').hidden = !attachment && !taskTitle;
        byId('imagePreview').hidden = !attachment;
        if (attachment) byId('imagePreview').src = attachment.image;
        byId('imageLabel').textContent = attachment ? '图片 · ' + Math.ceil(attachment.image.length / 1024) + ' KB' : '待办 · ' + taskTitle;
        byId('sendMessage').disabled = !online || sending || preparing;
        byId('attachImage').disabled = preparing;
    }

    byId('clearReply').onclick = () => { reply = null; updateComposer(); };
    byId('clearImage').onclick = () => {
        attachment = null;
        taskTitle = '';
        byId('imageFile').value = '';
        updateComposer();
    };
    byId('attachImage').onclick = () => byId('imageFile').click();
    byId('imageFile').onchange = () => {
        const file = byId('imageFile').files[0];
        byId('imageFile').value = '';
        if (file) void attach(file);
    };
    input.addEventListener('paste', (event) => {
        const file = [...event.clipboardData.files].find((item) => item.type.startsWith('image/'));
        if (file) { event.preventDefault(); void attach(file); }
    });

    async function attach(file) {
        if (preparing) return;
        if (!/^image\/(png|jpeg|webp|gif|avif)$/.test(file.type) || file.size > 15 * 1024 * 1024) {
            inform('请选择 15 MB 以内的 PNG、JPEG、WebP、GIF 或 AVIF 图片');
            return;
        }
        const active = version;
        preparing = true;
        updateComposer();
        let bitmap;
        try {
            bitmap = await createImageBitmap(file);
            if (active !== version) return;
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            for (const maxSide of [1440, 1080, 800, 560, 360, 240]) {
                const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
                canvas.width = Math.max(1, Math.round(bitmap.width * scale));
                canvas.height = Math.max(1, Math.round(bitmap.height * scale));
                context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
                const image = canvas.toDataURL('image/webp', .76);
                if (safeImage(image) && (!managed || image.length <= 85000)) {
                    attachment = { image, imageWidth: canvas.width, imageHeight: canvas.height };
                    taskTitle = '';
                    if (file.type === 'image/gif') inform('GIF 将以静态预览发送。');
                    return;
                }
            }
            inform('图片压缩后仍然过大');
        } catch { if (active === version) inform('无法读取此图片'); }
        finally {
            bitmap?.close();
            preparing = false;
            updateComposer();
        }
    }

    byId('addTask').onclick = () => {
        byId('taskInput').value = taskTitle;
        byId('taskDialog').showModal();
    };
    byId('taskForm').onsubmit = (event) => {
        event.preventDefault();
        taskTitle = byId('taskInput').value.trim();
        if (!taskTitle) return;
        attachment = null;
        updateComposer();
        byId('taskDialog').close();
        input.focus();
    };

    input.addEventListener('input', () => {
        if (room && !managed) localStorage.setItem(roomStorage('draft'), input.value);
    });
    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
            event.preventDefault();
            compose.requestSubmit();
        }
    });

    compose.onsubmit = async (event) => {
        event.preventDefault();
        const text = input.value.trim();
        if ((!reference && !managed) || !online || !profile.name || sending || preparing || (!text && !attachment && !taskTitle)) return;
        const active = version;
        const draft = input.value;
        const currentReply = reply;
        const currentAttachment = attachment;
        const currentTask = taskTitle;
        const record = { text, nickname: profile.name, color: profile.color, avatarUrl: profile.avatarUrl || '', sender: deviceId };
        if (!managed) record.timestamp = firebase.database.ServerValue.TIMESTAMP;
        if (reply) record.reply = reply;
        if (attachment) Object.assign(record, attachment);
        if (taskTitle) record.task = { title: taskTitle, done: false };
        sending = true;
        updateComposer();
        try {
            if (managed) {
                const { item } = await managedCall('send', { message: record });
                if (active === version) { messages.set(...item); render(); }
            } else await reference.push(record);
            if (active !== version) return;
            if (input.value === draft) {
                input.value = '';
                localStorage.removeItem(roomStorage('draft'));
            }
            if (reply === currentReply) reply = null;
            if (attachment === currentAttachment) attachment = null;
            if (taskTitle === currentTask) taskTitle = '';
            scrollLatest();
        } catch { if (active === version) inform('消息发送失败，内容已保留'); }
        finally { sending = false; updateComposer(); }
    };

    byId('roomTasks').onclick = () => {
        renderTasks();
        byId('roomTasksDialog').showModal();
    };

    function renderTasks() {
        const tasks = byId('roomTasksList');
        tasks.replaceChildren();
        const pending = [...messages].filter(([, message]) => message.task?.title && !message.task.done).reverse();
        if (!pending.length) tasks.append(node('li', '', '已加载的消息中没有未完成待办。'));
        for (const [key, message] of pending) {
            const item = node('li');
            item.append(button(String(message.task.title).slice(0, 160), () => {
                byId('roomTasksDialog').close();
                void reveal(key);
            }));
            tasks.append(item);
        }
    }

    const searchDialog = byId('searchChatDialog');
    const searchInput = byId('searchChatInput');
    function renderSearch() {
        const query = searchInput.value.trim().toLocaleLowerCase();
        const results = byId('searchChatResults');
        const status = byId('searchChatStatus');
        results.replaceChildren();
        if (!query) { status.textContent = '搜索当前已加载的消息。'; return; }
        const matches = [...messages].sort(([a], [b]) => b.localeCompare(a)).filter(([, message]) =>
            [message.text, message.nickname, message.task?.title].some((value) =>
                String(value || '').toLocaleLowerCase().includes(query)));
        status.textContent = matches.length > 50
            ? '找到 ' + matches.length + ' 条消息，显示最近 50 条。'
            : '找到 ' + matches.length + ' 条消息。';
        matches.slice(0, 50).forEach(([key, message]) => {
            const item = node('li');
            const caption = (message.nickname || '访客') + ' · ' + excerpt(message);
            item.append(button(caption, () => { searchDialog.close(); void reveal(key); }));
            results.append(item);
        });
    }
    byId('searchChat').onclick = () => {
        searchInput.value = '';
        renderSearch();
        searchDialog.showModal();
        searchInput.focus();
    };
    searchInput.addEventListener('input', renderSearch);
    searchDialog.querySelector('form').addEventListener('submit', (event) => {
        if (event.submitter?.tagName !== 'BUTTON') event.preventDefault();
    });
    byId('copyRoomCode').onclick = async () => {
        try { await navigator.clipboard.writeText(room); inform('房间号已复制'); }
        catch { inform('可从房间输入框复制房间号'); }
    };

    updateProfile();
    updateRooms();
    updateNotifications();
    updateComposer();
    setRail(false);
    const initialRoom = new URL(location.href).searchParams.get('room');
    if (initialRoom) void join(initialRoom);
    else setRail(true);
})();
