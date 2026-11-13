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
    const profile = stored('qc-profile', {
        name: window.QuarkUserProfile?.getProfile()?.nickname || localStorage.getItem('nickname') || '',
        color: localStorage.getItem('userColor') || '#5874dd'
    });

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

    function applyTheme(dark) {
        document.body.classList.toggle('qc-dark', dark);
        byId('themeToggle').setAttribute('aria-pressed', String(dark));
    }

    applyTheme((localStorage.getItem('theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark');
    byId('themeToggle').onclick = () => {
        const dark = !document.body.classList.contains('qc-dark');
        localStorage.setItem('theme', dark ? 'dark' : 'light');
        applyTheme(dark);
    };
    byId('mobileMenuBtn').onclick = () => setRail(byId('chatRail').classList.contains('qc-closed'));
    byId('profileButton').onclick = openProfile;
    document.querySelectorAll('[data-close]').forEach((control) => {
        control.addEventListener('click', () => byId(control.dataset.close).close());
    });

    function updateProfile() {
        byId('profileButton').textContent = profile.name || '设置昵称';
        compose.hidden = !room || !profile.name;
    }

    function openProfile() {
        byId('nicknameInput').value = profile.name || '';
        byId('profileColor').value = /^#[a-f0-9]{6}$/i.test(profile.color) ? profile.color : '#5874dd';
        byId('profileDialog').showModal();
    }

    byId('profileForm').onsubmit = (event) => {
        event.preventDefault();
        const name = byId('nicknameInput').value.trim();
        if (!name) return;
        profile.name = name;
        profile.color = byId('profileColor').value;
        localStorage.setItem('qc-profile', JSON.stringify(profile));
        updateProfile();
        byId('profileDialog').close();
        if (room) input.focus();
    };

    function validRoom(name) {
        return !!name && name.length <= 64 && !/[.#$\[\]/\u0000-\u001f\u007f]/u.test(name) && name !== 'lsqkk-lyb';
    }

    function updateRooms() {
        const rooms = stored('recentRooms', []);
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
        if (!room || !latestKey || document.hidden || !nearBottom() || (unread && lastRead)) return;
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

    async function join(name) {
        if (!validRoom(name)) {
            inform('请输入有效房间号，房间号不能包含 . # $ [ ] /。');
            return;
        }
        if (room) localStorage.setItem(roomStorage('draft'), input.value);
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
        lastRead = localStorage.getItem(roomStorage('read')) || '';
        messages.clear();
        messageRows.clear();
        list.replaceChildren();
        resetComposer();
        byId('roomInput').value = room;
        input.value = localStorage.getItem(roomStorage('draft')) || '';
        byId('currentRoomTitle').textContent = '# ' + room;
        byId('connection').textContent = '连接中…';
        byId('chatEmpty').hidden = true;
        byId('moreHistory').hidden = true;
        byId('roomActions').hidden = false;
        const url = new URL(location.href);
        url.searchParams.set('room', room);
        history.replaceState(null, '', url);
        const recent = stored('recentRooms', []).filter((item) => item !== room);
        localStorage.setItem('recentRooms', JSON.stringify([room, ...recent].slice(0, 10)));
        updateRooms();
        updateProfile();
        updateJump();
        if (mobile.matches) setRail(false);

        try {
            const database = await getDatabase();
            if (active !== version) return;
            reference = database.ref('chatrooms/' + name + '/messages');
            query = reference.orderByKey().limitToLast(pageSize);
            connectionRef = database.ref('.info/connected');
            connectionListener = (snapshot) => {
                online = snapshot.val() === true;
                byId('connection').textContent = online ? '实时连接' : '正在重新连接…';
                updateComposer();
            };
            connectionRef.on('value', connectionListener);
            queryListener = (snapshot) => {
                const shouldFollow = nearBottom() && !document.hidden && (!unread || !lastRead);
                const nextKeys = new Set();
                let unseen = 0;
                snapshot.forEach((child) => {
                    const value = child.val();
                    nextKeys.add(child.key);
                    if (value && typeof value === 'object') {
                        messages.set(child.key, value);
                        if (received && child.key > latestKey && value.sender !== deviceId) {
                            unseen++;
                            notify(value);
                        }
                    }
                });
                const first = nextKeys.values().next().value;
                if (!historyCursor && first) historyCursor = first;
                recentKeys.forEach((key) => {
                    if (!nextKeys.has(key) && (!first || key > first || nextKeys.size < pageSize)) messages.delete(key);
                });
                recentKeys = nextKeys;
                latestKey = Array.from(nextKeys).at(-1) || '';
                byId('moreHistory').hidden = byId('moreHistory').dataset.exhausted === String(active) || nextKeys.size < pageSize;
                if (!received) {
                    unread = lastRead ? [...nextKeys].filter((key) => key > lastRead).length : 0;
                } else if (!shouldFollow && unseen) {
                    if (!unread) lastRead = localStorage.getItem(roomStorage('read')) || '';
                    unread += unseen;
                }
                const wasReceived = received;
                received = true;
                render();
                if ((!wasReceived && !unread) || (wasReceived && shouldFollow)) scrollLatest();
                else if (!wasReceived && messageRows.has(lastRead)) messageRows.get(lastRead).scrollIntoView({ block: 'center' });
                updateJump();
            };
            query.on('value', queryListener, showConnectionError);
            if (!profile.name && !byId('profileDialog').open) openProfile();
        } catch {
            if (active === version) showConnectionError();
        }
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
        try { new Notification('夸克聊天室 · ' + room, { body: (message.nickname || '访客') + '：' + excerpt(message), tag: 'qc-' + room }); }
        catch { /* Browsers with service-worker-only notifications can still read the in-page count. */ }
    }

    async function loadHistory() {
        if (!reference || byId('moreHistory').disabled) return;
        const active = version;
        const first = historyCursor;
        if (!first) return;
        const control = byId('moreHistory');
        control.disabled = true;
        control.textContent = '加载中…';
        try {
            const snapshot = await reference.orderByKey().endAt(first).limitToLast(pageSize + 1).once('value');
            if (active !== version) return;
            snapshot.forEach((child) => {
                const value = child.val();
                if (child.key < historyCursor) historyCursor = child.key;
                if (child.key !== first && value && typeof value === 'object') messages.set(child.key, value);
            });
            const oldTop = stream.scrollTop;
            const oldHeight = stream.scrollHeight;
            control.hidden = snapshot.numChildren() <= pageSize;
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
        if (!messageRows.has(key) && reference) {
            const active = version;
            try {
                const snapshot = await reference.orderByKey().endAt(key).limitToLast(pageSize).once('value');
                if (active !== version) return;
                snapshot.forEach((child) => {
                    const value = child.val();
                    if (value && typeof value === 'object') messages.set(child.key, value);
                });
                render();
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
                if (!online || !reference || !profile.name) { inform('连接后设置昵称即可更新待办'); return; }
                event.currentTarget.disabled = true;
                try {
                    const active = version;
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
            for (const maxSide of [1440, 1080, 800, 560, 360]) {
                const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
                canvas.width = Math.max(1, Math.round(bitmap.width * scale));
                canvas.height = Math.max(1, Math.round(bitmap.height * scale));
                context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
                const image = canvas.toDataURL('image/webp', .76);
                if (safeImage(image)) {
                    attachment = { image, imageWidth: canvas.width, imageHeight: canvas.height };
                    taskTitle = '';
                    inform('图片将随消息发送，使用 Firebase 流量。GIF 会发送静态预览。');
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
        if (room) localStorage.setItem(roomStorage('draft'), input.value);
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
        if (!reference || !online || !profile.name || sending || preparing || (!text && !attachment && !taskTitle)) return;
        const active = version;
        const draft = input.value;
        const currentReply = reply;
        const currentAttachment = attachment;
        const currentTask = taskTitle;
        const record = { text, nickname: profile.name, color: profile.color, sender: deviceId, timestamp: firebase.database.ServerValue.TIMESTAMP };
        if (reply) record.reply = reply;
        if (attachment) Object.assign(record, attachment);
        if (taskTitle) record.task = { title: taskTitle, done: false };
        sending = true;
        updateComposer();
        try {
            await reference.push(record);
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

    updateProfile();
    updateRooms();
    updateNotifications();
    updateComposer();
    setRail(false);
    const initialRoom = new URL(location.href).searchParams.get('room');
    if (initialRoom) void join(initialRoom);
    else setRail(true);
})();
