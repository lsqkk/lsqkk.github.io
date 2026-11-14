const byId = (id) => document.getElementById(id);

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.append(script);
    });
}

let database;
async function getDatabase() {
    database ??= (async () => {
        const sdk = 'https://www.gstatic.com/firebasejs/8.10.0/';
        if (!window.firebase) await loadScript(sdk + 'firebase-app.js');
        if (!window.firebase.database) await loadScript(sdk + 'firebase-database.js');
        const configured = document.body.dataset.firebaseConfig;
        if (!window.firebaseConfig?.databaseURL) await loadScript(configured);
        if (!window.firebase.apps.length) {
            window.firebase.initializeApp(window.firebaseConfig);
        }
        return window.firebase.database();
    })().catch(error => { database = null; throw error; });
    return database;
}

function readRecent() {
    try {
        const docs = JSON.parse(localStorage.getItem('recent-docs'));
        return Array.isArray(docs) ? docs.filter(doc => doc && /^[a-z0-9]{6}$/i.test(doc.id)) : [];
    } catch { return []; }
}

function randomCode() {
    const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    return [...crypto.getRandomValues(new Uint8Array(6))].map(value => alphabet[value % alphabet.length]).join('');
}

export function setupCollaboration({ input, refresh, onExit, feedback }) {
    const dialog = byId('collaboration-dialog');
    const status = byId('collaboration-status');
    const nicknameInput = byId('nickname-input');
    const codeInput = byId('doc-code-input');
    const message = byId('collaboration-feedback');
    const versionList = byId('versions-list');
    const versionsButton = byId('view-versions-btn');
    const saveVersionButton = byId('save-version-btn');
    let recent = readRecent();
    let active = null;
    let busy = false;
    let connectionRequest = 0;
    nicknameInput.value = localStorage.getItem('md-nickname') || '';
    codeInput.value = new URL(location.href).searchParams.get('doc')?.slice(0, 6) || '';

    function inform(text) {
        if (dialog.open) message.textContent = text;
        else feedback(text);
    }

    function renderRecent() {
        const list = byId('docsList');
        list.replaceChildren();
        for (const doc of recent) {
            const li = document.createElement('li');
            const open = document.createElement('button');
            open.textContent = [doc.name, doc.id].filter(Boolean).join(' · ');
            open.onclick = () => { codeInput.value = doc.id; connect(false); };
            const rename = document.createElement('button');
            rename.textContent = '重命名';
            rename.onclick = () => {
                const name = prompt('最近文档名称', doc.name || doc.id)?.trim();
                if (name) { doc.name = name; persistRecent(); }
            };
            const remove = document.createElement('button');
            remove.textContent = '移除';
            remove.onclick = () => { recent = recent.filter(item => item !== doc); persistRecent(); };
            li.append(open, rename, remove);
            list.append(li);
        }
        if (!recent.length) {
            const empty = document.createElement('li');
            empty.textContent = '暂无共享文档';
            list.append(empty);
        }
    }

    function persistRecent() {
        try { localStorage.setItem('recent-docs', JSON.stringify(recent)); } catch {}
        renderRecent();
    }

    function leave(restore = true) {
        connectionRequest++;
        const room = active;
        if (!room) return;
        flush(room);
        active = null;
        room.docRef.off('value', room.onDocument);
        room.usersRef.off('value', room.onUsers);
        room.connectedRef.off('value', room.onConnection);
        room.userRef.remove().then(() => room.userRef.onDisconnect().cancel()).catch(console.error);
        status.hidden = true;
        versionsButton.disabled = true;
        saveVersionButton.disabled = true;
        versionList.hidden = true;
        const url = new URL(location.href);
        url.searchParams.delete('doc');
        history.replaceState(history.state, '', url);
        if (restore) onExit();
    }

    function flush(room) {
        clearTimeout(room.timer);
        if (room.pending === null) return;
        const content = room.pending;
        room.pending = null;
        room.docRef.update({
            content,
            lastEdited: Date.now(),
            lastEditedBy: room.nickname
        }).catch(() => {
            if (active === room && room.latest === content && room.pending === null) {
                room.pending = content;
                input.value = content;
                refresh();
            }
            inform('共享内容保存失败，可复制源码后重试。');
        });
    }

    function write(content) {
        if (!active) return;
        const room = active;
        room.latest = content;
        room.pending = content;
        clearTimeout(room.timer);
        room.timer = setTimeout(() => flush(room), 250);
    }

    async function connect(create) {
        if (busy) return;
        const nickname = nicknameInput.value.trim();
        const code = create ? randomCode() : codeInput.value.trim();
        if (!nickname) { inform('请先输入昵称。'); nicknameInput.focus(); return; }
        if (!/^[a-z0-9]{6}$/i.test(code)) { inform('请输入六位文档代码。'); return; }
        if (active?.code === code) { dialog.close(); return; }
        const initialContent = input.value;
        const request = ++connectionRequest;
        busy = true;
        inform('正在连接共享文档…');
        try {
            const db = await getDatabase();
            if (request !== connectionRequest) return;
            const docRef = db.ref('markdown-docs/' + code);
            const snapshot = create
                ? await docRef.transaction(existing => existing === null ? {
                    content: initialContent, createdAt: Date.now(), createdBy: nickname,
                    lastEdited: Date.now(), lastEditedBy: nickname
                } : undefined, undefined, false).then(result => {
                    if (!result.committed) throw new Error('文档代码已使用，请重新创建。');
                    return result.snapshot;
                })
                : await docRef.once('value');
            if (request !== connectionRequest) return;
            if (!snapshot.exists()) { inform('没有找到该文档，请检查代码。'); return; }
            leave(false);
            const usersRef = db.ref('presence/' + code);
            const room = {
                code, docRef, usersRef, nickname, pending: null,
                userRef: usersRef.push(),
                connectedRef: db.ref('.info/connected'),
                versionsRef: db.ref('markdown-versions/' + code)
            };
            active = room;
            const existing = recent.find(item => item.id === code);
            recent = [{ id: code, name: existing?.name || snapshot.val().name || '' }, ...recent.filter(item => item.id !== code)].slice(0, 30);
            try { localStorage.setItem('md-nickname', nickname); } catch {}
            persistRecent();
            const url = new URL('/tool/markdown/', location.origin);
            url.searchParams.set('doc', code);
            history.replaceState(history.state, '', url);
            byId('document-code').textContent = '文档代码 ' + code;
            status.hidden = false;
            versionsButton.disabled = false;
            saveVersionButton.disabled = false;
            room.onDocument = current => {
                if (active !== room || room.pending !== null) return;
                const value = current.val()?.content;
                if (typeof value === 'string' && value !== input.value) {
                    const { selectionStart, selectionEnd, scrollTop } = input;
                    input.value = value;
                    input.setSelectionRange(selectionStart, selectionEnd);
                    input.scrollTop = scrollTop;
                    refresh();
                }
            };
            room.onUsers = current => {
                if (active !== room) return;
                const names = Object.values(current.val() || {}).filter(user => user?.online).map(user => user.nickname);
                byId('user-list').textContent = names.length ? '在线 · ' + names.join('、') : '';
            };
            room.onConnection = async current => {
                if (active !== room || !current.val()) return;
                try {
                    await room.userRef.onDisconnect().remove();
                    if (active !== room) {
                        await room.userRef.onDisconnect().cancel();
                        return;
                    }
                    await room.userRef.set({ nickname, online: true, lastSeen: Date.now() });
                } catch { inform('在线状态同步失败。'); }
            };
            input.value = snapshot.val().content || '';
            refresh();
            docRef.on('value', room.onDocument, () => inform('文档同步已中断。'));
            usersRef.on('value', room.onUsers);
            room.connectedRef.on('value', room.onConnection);
            dialog.close();
            feedback(create ? '已创建共享文档，可复制邀请链接。' : '已加入共享文档。');
        } catch (error) {
            console.error(error);
            inform('连接共享文档失败，请检查网络后重试。');
        } finally {
            busy = false;
        }
    }

    byId('collaboration-button').onclick = () => { message.textContent = ''; dialog.showModal(); };
    byId('new-doc-btn').onclick = () => connect(true);
    byId('join-doc-btn').onclick = () => connect(false);
    codeInput.onkeydown = event => { if (event.key === 'Enter') connect(false); };
    byId('leave-doc-btn').onclick = () => leave();
    byId('copy-code-btn').onclick = async () => {
        try {
            await navigator.clipboard.writeText(location.href);
            feedback('已复制协同邀请链接。');
        } catch { feedback('请从地址栏复制协同邀请链接。'); }
    };
    saveVersionButton.onclick = async () => {
        const room = active;
        if (!room) return;
        const now = Date.now();
        try {
            await room.versionsRef.push({ content: input.value, createdAt: now, name: new Date(now).toLocaleString('zh-CN'), createdBy: room.nickname });
            inform('已保存版本。');
        } catch { inform('保存版本失败。'); }
    };
    versionsButton.onclick = async () => {
        const room = active;
        if (!room) return;
        try {
            const current = await room.versionsRef.limitToLast(50).once('value');
            if (active !== room) return;
            const versions = Object.values(current.val() || {}).sort((a, b) => b.createdAt - a.createdAt);
            versionList.replaceChildren();
            versionList.hidden = false;
            if (!versions.length) inform('暂无历史版本。');
            for (const version of versions) {
                if (typeof version.content !== 'string') continue;
                const item = document.createElement('li');
                const button = document.createElement('button');
                button.textContent = '恢复 ' + version.name + ' · ' + version.createdBy;
                button.onclick = () => {
                    if (active !== room || !confirm('将这个版本恢复为共享文档的当前内容？')) return;
                    input.value = version.content;
                    input.dispatchEvent(new Event('input'));
                    dialog.close();
                };
                item.append(button);
                versionList.append(item);
            }
        } catch { inform('读取版本历史失败。'); }
    };
    renderRecent();
    document.addEventListener('visibilitychange', () => { if (document.hidden && active) flush(active); });
    return { get code() { return active?.code; }, leave, write };
}
