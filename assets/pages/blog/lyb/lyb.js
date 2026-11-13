// @ts-check

/**
 * @typedef {{ id?: string, text: string, nickname: string, avatar: string, avatarType: 'color' | 'image', timestamp: number, isMarkdown?: boolean, likes?: number, replies?: Record<string, ReplyItem> }} MessageItem
 * @typedef {{ id: string, text: string, nickname: string, avatar: string, avatarType: 'color' | 'image', timestamp: number, isMarkdown?: boolean }} ReplyItem
 */

let firebaseReadyPromise = null;

async function ensureDatabaseReady() {
    if (firebaseReadyPromise) return firebaseReadyPromise;
    if (!window.QuarkFirebaseReady) {
        throw new Error('Firebase就绪模块未加载');
    }
    firebaseReadyPromise = window.QuarkFirebaseReady.ensureDatabase({
        scriptId: 'lyb-firebase-config'
    });
    return firebaseReadyPromise;
}

// 全局变量
const BOARD_NAME = 'lsqkk-lyb';
/** @type {any} */
let messagesRef = null;
let currentPage = 1;
const PAGE_SIZE = 20;
let totalMessages = 0;
let sortMode = 'newest'; // 'newest' | 'oldest' | 'hot'
const ADMIN_TOKEN_KEY = 'lyb_admin_token';
let isAdmin = false;
/** @type {'color' | 'image'} */
let userAvatarType = 'color';
let userColor = '#4a6cf7';
let userAvatarUrl = '';
let nickname = localStorage.getItem('nickname') || '';
let loginName = '';
let loginType = '';
let isLoggedUser = false;
let identityInstance = null;

// 消息缓存 + 实时监听
/** @type {MessageItem[]} */
let messagesCache = [];
/** @type {((snapshot: any) => void) | null} */
let messagesListener = null;
const categories = new Map([['general', '随手留言'], ['idea', '建议'], ['issue', '问题反馈']]);
const savedMessages = new Set(readDraft('lyb-saved', []));
const replyDrafts = new Map();
const pendingReplies = new Set();
let activeReply = '';
let publishPending = false;
let previewOpen = false;
let boardLoaded = false;

function readDraft(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
}

function setStatus(id, text) {
    const status = byId(id);
    if (status) status.textContent = text;
}

function escapeHtml(value) {
    return window.CommentShared?.escapeHtml(value) ?? '';
}

function safeContent(text, markdown) {
    return window.QuarkSanitizeMarkdownHtml(window.CommentRenderShared.renderMarkdown(text, markdown), { editor: true });
}

function refreshDraft() {
    const content = /** @type {HTMLTextAreaElement} */ (byId('messageContent'));
    const markdown = /** @type {HTMLInputElement} */ (byId('useMarkdown'));
    const category = /** @type {HTMLSelectElement} */ (byId('messageCategory'));
    const preview = byId('messagePreview');
    setStatus('composeCount', content.value.length + ' / 5000');
    localStorage.setItem('lyb-compose-draft', JSON.stringify({ text: content.value, markdown: markdown.checked, category: category.value }));
    preview.hidden = !previewOpen;
    content.hidden = previewOpen;
    if (previewOpen) preview.innerHTML = content.value.trim() ? safeContent(content.value, markdown.checked) : '<p>写下内容后可在这里预览。</p>';
}

function initDraft() {
    const content = /** @type {HTMLTextAreaElement} */ (byId('messageContent'));
    const markdown = /** @type {HTMLInputElement} */ (byId('useMarkdown'));
    const category = /** @type {HTMLSelectElement} */ (byId('messageCategory'));
    const toggle = byId('previewToggle');
    const draft = readDraft('lyb-compose-draft', {});
    content.value = String(draft.text || '').slice(0, 5000);
    markdown.checked = draft.markdown !== false;
    category.value = categories.has(draft.category) ? draft.category : 'general';
    content.addEventListener('input', refreshDraft);
    markdown.addEventListener('change', refreshDraft);
    category.addEventListener('change', refreshDraft);
    toggle.addEventListener('click', () => {
        previewOpen = !previewOpen;
        toggle.setAttribute('aria-pressed', String(previewOpen));
        toggle.textContent = previewOpen ? '继续编辑' : '预览';
        refreshDraft();
        if (!previewOpen) content.focus();
    });
    content.addEventListener('keydown', (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            void submitMessage();
        }
    });
    for (const filterId of ['categoryFilter', 'savedOnly']) {
        byId(filterId).addEventListener('change', () => {
            currentPage = 1;
            applyFiltersAndRender();
        });
    }
    refreshDraft();
}

function getGuestUid() {
    const shared = window.CommentShared;
    return shared && typeof shared.getGuestUid === 'function' ? shared.getGuestUid() : '';
}

/**
 * @param {string} id
 * @returns {HTMLElement | null}
 */
function byId(id) {
    return document.getElementById(id);
}

function getAdminToken() {
    return localStorage.getItem(ADMIN_TOKEN_KEY) || '';
}

function setAdminToken(token) {
    if (token) {
        localStorage.setItem(ADMIN_TOKEN_KEY, token);
    } else {
        localStorage.removeItem(ADMIN_TOKEN_KEY);
    }
}

async function verifyAdminSession() {
    const token = getAdminToken();
    if (!token) {
        isAdmin = false;
        updateAdminUI(false);
        return false;
    }

    try {
        const response = await fetch('__API_BASE__/api/admin?action=verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
        });
        const result = await response.json();
        isAdmin = !!(response.ok && result.valid);
        if (!isAdmin) setAdminToken('');
    } catch (error) {
        console.error('校验管理员会话失败:', error);
        isAdmin = false;
    }

    updateAdminUI(false);
    return isAdmin;
}

// 设置Firebase实时监听
function setupRealtimeListener() {
    if (!messagesRef) {
        messagesRef = firebase.database().ref(`chatrooms/${BOARD_NAME}/messages`);
    }

    // 清除旧监听
    if (messagesListener) {
        messagesRef.off('value', messagesListener);
    }

    messagesListener = messagesRef.on('value', function (snapshot) {
        /** @type {MessageItem[]} */
        const messages = [];
        snapshot.forEach(function (childSnapshot) {
            const message = childSnapshot.val();
            if (!message || typeof message.text !== 'string' || typeof message.nickname !== 'string') return;
            message.id = childSnapshot.key;
            messages.push(message);
        });
        boardLoaded = true;
        setStatus('feedStatus', '');
        messagesCache = messages;
        applyFiltersAndRender();
    }, () => {
        byId('messagesContainer')?.replaceChildren();
        setStatus('feedStatus', '留言加载失败，请刷新后重试。');
    });
}

// 从缓存中过滤、排序、渲染
function applyFiltersAndRender() {
    const searchInput = byId('searchInput');
    const term = searchInput instanceof HTMLInputElement ? searchInput.value.trim().toLowerCase() : '';
    if (!boardLoaded) return;

    const category = /** @type {HTMLSelectElement} */ (byId('categoryFilter')).value;
    const onlySaved = /** @type {HTMLInputElement} */ (byId('savedOnly')).checked;
    let filtered = messagesCache.filter((message) =>
        (!category || (categories.has(message.category) ? message.category : 'general') === category)
        && (!onlySaved || savedMessages.has(message.id)));

    // 搜索过滤
    if (term) {
        filtered = filtered.filter(function (m) {
            return m.text.toLowerCase().includes(term) ||
                m.nickname.toLowerCase().includes(term) ||
                String(m.login || '').toLowerCase().includes(term);
        });
    }

    // 排序
    if (sortMode === 'newest') {
        filtered.sort(function (a, b) { return b.timestamp - a.timestamp; });
    } else if (sortMode === 'oldest') {
        filtered.sort(function (a, b) { return a.timestamp - b.timestamp; });
    } else if (sortMode === 'hot') {
        filtered.sort(function (a, b) { return (b.likes || 0) - (a.likes || 0) || (b.timestamp - a.timestamp); });
    }

    totalMessages = filtered.length;
    currentPage = Math.min(currentPage, Math.max(1, Math.ceil(totalMessages / PAGE_SIZE)));

    // 更新留言数
    const countEl = byId('messageCount');
    if (countEl) countEl.textContent = String(totalMessages);

    renderMessages(filtered);
    renderPagination();
}

// DOM加载完成后初始化
document.addEventListener('DOMContentLoaded', async function () {
    initTheme();
    initDraft();

    if (window.CommentInputShared && typeof window.CommentInputShared.init === 'function') {
        identityInstance = window.CommentInputShared.init({ variant: 'lyb' });
        syncIdentityState();
    }

    // 骨架屏：Firebase 数据到达前显示加载占位
    const msgContainer = byId('messagesContainer');
    if (msgContainer) {
        msgContainer.innerHTML = '';
        for (let i = 0; i < 4; i++) {
            const row = document.createElement('div');
            row.className = 'lyb-skeleton-row';
            row.innerHTML = '<div class="lyb-skeleton-avatar"></div><div class="lyb-skeleton-body"><div class="s-author"></div><div class="s-text"></div><div class="s-text-short"></div><div class="s-time"></div></div>';
            msgContainer.appendChild(row);
        }
    }

    // 设置实时监听（自动加载并渲染留言，会替换骨架屏）
    try {
        const database = await ensureDatabaseReady();
        messagesRef = database.ref('chatrooms/' + BOARD_NAME + '/messages');
        await messagesRef.once('value');
        setupRealtimeListener();
        void verifyAdminSession().then(() => applyFiltersAndRender());
    } catch (error) {
        firebaseReadyPromise = null;
        console.error('留言板 Firebase 初始化失败:', error);
        msgContainer?.replaceChildren();
        setStatus('feedStatus', '连接留言板失败，请刷新后重试。');
    }

    // 监听搜索框输入（去抖）
    const searchInput = byId('searchInput');
    if (searchInput instanceof HTMLInputElement) {
        var debounceTimer = null;
        searchInput.addEventListener('input', function () {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(function () {
                currentPage = 1;
                applyFiltersAndRender();
            }, 250);
        });
    }

    syncIdentityState();
});

// 主题切换
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    let theme;
    if (savedTheme) {
        theme = savedTheme;
    } else {
        theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        localStorage.setItem('theme', theme);
    }
    document.body.classList.add(theme + '-mode');
    if (window.matchMedia) {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        mediaQuery.addEventListener('change', function (e) {
            if (!localStorage.getItem('theme')) {
                const newTheme = e.matches ? 'dark' : 'light';
                document.body.classList.remove('dark-mode', 'light-mode');
                document.body.classList.add(newTheme + '-mode');
                localStorage.setItem('theme', newTheme);
            }
        });
    }
}

// ---- Admin ----

function toggleAdminPanel() {
    const panel = byId('adminPanel');
    if (!panel) return;
    const isVisible = panel.style.display !== 'none';
    panel.style.display = isVisible ? 'none' : 'flex';
}

async function adminLogin() {
    const passwordInput = byId('adminPassword');
    if (!(passwordInput instanceof HTMLInputElement)) return;
    const password = passwordInput.value.trim();
    /** @type {HTMLButtonElement | null} */
    const submitBtn = document.querySelector('.admin-btn[onclick="adminLogin()"]');
    if (!password) { alert('请输入管理员密码'); return; }

    let originalText = '登录';
    if (submitBtn) { originalText = submitBtn.textContent || '登录'; submitBtn.disabled = true; submitBtn.textContent = '验证中...'; }

    try {
        const hash = await sha256(password);
        const response = await fetch('__API_BASE__/api/admin?action=auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ passwordHash: hash })
        });
        const result = await response.json();
        if (response.ok && result.success && result.token) {
            isAdmin = true;
            setAdminToken(result.token);
            updateAdminUI(true);
            passwordInput.value = '';
        } else {
            alert('密码错误: ' + (result.error || ''));
        }
    } catch (error) {
        console.error('登录过程出错:', error);
        alert('登录失败：网络错误或验证服务异常，请稍后重试。');
    } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalText; }
    }
}

function logoutAdmin() {
    isAdmin = false;
    setAdminToken('');
    updateAdminUI(true);
}

function updateAdminUI(reloadMessages) {
    const loginForm = byId('adminLoginForm');
    const adminActions = byId('adminActions');
    if (!(loginForm instanceof HTMLElement) || !(adminActions instanceof HTMLElement)) return;
    loginForm.style.display = isAdmin ? 'none' : 'flex';
    adminActions.style.display = isAdmin ? 'flex' : 'none';
    // 不需要重新加载，如果数据变化监听器会自动更新
    if (reloadMessages) applyFiltersAndRender();
}

// ---- Sort ----

/**
 * @param {string} mode
 */
function setSort(mode) {
    sortMode = mode;
    document.querySelectorAll('.sort-btn').forEach(function (btn) {
        const active = btn.getAttribute('data-sort') === mode;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', String(active));
    });
    currentPage = 1;
    applyFiltersAndRender();
}

// ---- Submit Message ----

async function submitMessage() {
    const nicknameInput = byId('nickname');
    const contentInput = byId('messageContent');
    const markdownInput = byId('useMarkdown');
    if (!(nicknameInput instanceof HTMLInputElement) ||
        !(contentInput instanceof HTMLTextAreaElement) ||
        !(markdownInput instanceof HTMLInputElement)) return;

    if (identityInstance && typeof identityInstance.refreshFromInputs === 'function') {
        identityInstance.refreshFromInputs();
        syncIdentityState();
    }
    const currentNickname = isLoggedUser ? (nickname || loginName || '已登录') : nicknameInput.value.trim();
    const content = contentInput.value.trim();
    const useMarkdown = markdownInput.checked;
    if (publishPending) return;
    if (!currentNickname || !content) { setStatus('composeStatus', '请填写昵称和留言内容'); return; }
    if (!messagesRef) { setStatus('composeStatus', '留言板尚未连接，草稿已保留'); return; }
    const category = /** @type {HTMLSelectElement} */ (byId('messageCategory')).value;
    const publish = /** @type {HTMLButtonElement} */ (byId('publishMessage'));
    const submittedValue = contentInput.value;
    publishPending = true;
    publish.disabled = true;
    setStatus('composeStatus', '发布中…');

    const message = {
        text: content,
        category: categories.has(category) ? category : 'general',
        nickname: currentNickname,
        login: loginName || '',
        loginType: isLoggedUser ? (loginType || localStorage.getItem('quark_login_type') || '') : '',
        uid: isLoggedUser ? (window.QuarkUserProfile && typeof window.QuarkUserProfile.getUid === 'function'
            ? window.QuarkUserProfile.getUid() : '') : getGuestUid(),
        avatar: userAvatarType === 'color' ? userColor : userAvatarUrl,
        avatarType: userAvatarType,
        timestamp: Date.now(),
        isMarkdown: useMarkdown,
        likes: 0
    };

    try {
        await messagesRef.push(message);
        if (contentInput.value === submittedValue) contentInput.value = '';
        if (previewOpen) byId('previewToggle').click();
        refreshDraft();
        if (sortMode === 'newest') currentPage = 1;
        applyFiltersAndRender();
        setStatus('composeStatus', '留言已发布');
    } catch (error) {
        console.error('提交留言失败:', error);
        setStatus('composeStatus', '发布失败，草稿已保留');
    } finally {
        publishPending = false;
        publish.disabled = false;
    }
}

function syncIdentityState() {
    if (!identityInstance || typeof identityInstance.getState !== 'function') return;
    const state = identityInstance.getState();
    nickname = state.nickname || '';
    loginName = state.login || '';
    loginType = state.loginType || '';
    isLoggedUser = Boolean(state.isLoggedUser);
    userAvatarType = state.avatarType || userAvatarType;
    userColor = state.avatarColor || userColor;
    userAvatarUrl = state.avatarUrl || userAvatarUrl;
}

// ---- Render Messages ----

/**
 * @param {MessageItem[]} messages
 */
function renderMessages(messages) {
    const container = byId('messagesContainer');
    if (!(container instanceof HTMLElement)) return;
    const sharedList = window.CommentListShared;
    const pageMessages = sharedList && typeof sharedList.paginate === 'function'
        ? sharedList.paginate(messages, currentPage, PAGE_SIZE)
        : messages.slice((currentPage - 1) * PAGE_SIZE, Math.min(currentPage * PAGE_SIZE, messages.length));

    const activeElement = document.activeElement;
    const focusedReply = activeElement instanceof HTMLTextAreaElement && activeElement.closest('.reply-inline') ? activeElement : null;
    const selection = focusedReply ? [focusedReply.selectionStart, focusedReply.selectionEnd] : null;
    container.innerHTML = '';

    if (pageMessages.length === 0) {
        var emptyMsg = messagesCache.length === 0
            ? '<i class="fas fa-comments"></i><p>暂无留言</p>'
            : '<i class="fas fa-search"></i><p>没有匹配的留言</p>';
        container.innerHTML = '<div class="empty-state">' + emptyMsg + '</div>';
        return;
    }

    pageMessages.forEach(function (message) {
        var element = createMessageElement(message);
        container.appendChild(element);
    });
    if (selection && activeReply) {
        const replacement = byId('message-' + activeReply)?.querySelector('textarea');
        replacement?.focus({ preventScroll: true });
        replacement?.setSelectionRange(selection[0], selection[1]);
    }
}

/**
 * @param {MessageItem} message
 * @returns {HTMLDivElement}
 */
function createMessageElement(message) {
    const row = document.createElement('div');
    row.className = 'message-row';
    row.id = 'message-' + message.id;
    const category = categories.get(message.category) || categories.get('general');
    const markedSaved = savedMessages.has(message.id);
    const isReplying = activeReply === message.id;
    row.innerHTML =
        '<div class="message-header">' + renderIdentity(message, 'message-avatar') +
            '<span class="lyb-category">' + category + '</span>' +
        '</div>' +
        '<div class="message-content">' + safeContent(message.text, message.isMarkdown) + '</div>' +
        '<div class="message-actions lyb-message-toolbar">' +
            '<button class="action-btn" data-lyb-action="like"><i class="fas fa-heart" aria-hidden="true"></i> 赞 <span>' + (Number(message.likes) || 0) + '</span></button>' +
            '<button class="action-btn" data-lyb-action="reply" aria-expanded="' + isReplying + '">回复</button>' +
            '<button class="action-btn" data-lyb-action="save" aria-pressed="' + markedSaved + '">' + (markedSaved ? '已收藏' : '收藏') + '</button>' +
            (isAdmin ? '<button class="delete-btn" data-lyb-action="delete">删除</button>' : '') +
        '</div>';

    const replies = Object.entries(message.replies || {}).filter(([, value]) => value && typeof value.text === 'string');
    if (replies.length) {
        const thread = document.createElement('div');
        thread.className = 'replies';
        replies.sort(([, a], [, b]) => Number(a.timestamp) - Number(b.timestamp));
        for (const [key, reply] of replies) {
            const replyRow = document.createElement('div');
            replyRow.className = 'reply-row';
            replyRow.innerHTML = '<div class="reply-header">' + renderIdentity(reply, 'reply-avatar') +
                (isAdmin ? '<button class="delete-btn">删除</button>' : '') +
                '</div><div class="message-content">' + safeContent(reply.text, reply.isMarkdown) + '</div>';
            replyRow.querySelector('.delete-btn')?.addEventListener('click', () => void deleteReply(message.id, key));
            thread.append(replyRow);
        }
        row.append(thread);
    }

    const actions = {
        like: () => void likeMessage(message.id),
        reply: () => toggleReplyForm(message.id),
        save: () => {
            if (savedMessages.has(message.id)) savedMessages.delete(message.id);
            else savedMessages.add(message.id);
            localStorage.setItem('lyb-saved', JSON.stringify([...savedMessages]));
            applyFiltersAndRender();
            byId(row.id)?.querySelector('button[data-lyb-action="save"]')?.focus({ preventScroll: true });
        },
        delete: () => void deleteMessage(message.id)
    };
    for (const button of row.querySelectorAll('button[data-lyb-action]')) {
        button.addEventListener('click', actions[button.getAttribute('data-lyb-action')]);
    }
    if (isReplying) row.append(createReplyForm(message.id));
    return row;
}

function renderIdentity(person, avatarClass) {
    const name = String(person.nickname || '访客');
    const time = window.CommentRenderShared.formatTime(person.timestamp);
    const displayName = window.CommentListShared.getDisplayName(name, person.login, person.loginType, person.uid);
    const spaceUrl = window.CommentShared.getUserSpaceUrl(person.login, person.loginType);
    let avatar = '<span>' + escapeHtml([...name][0]) + '</span>';
    let style = '';
    if (person.avatarType === 'image') {
        try {
            const url = new URL(person.avatar, location.href);
            if (['https:', 'http:'].includes(url.protocol)) avatar = '<img src="' + escapeHtml(url.href) + '" alt="" loading="lazy" referrerpolicy="no-referrer">';
        } catch { /* Fall back to initials. */ }
    } else if (/^(#[0-9a-f]{3,8}|rgb\([\d ,]+\))$/i.test(person.avatar || person.color || '')) {
        style = ' style="background-color:' + (person.avatar || person.color) + '"';
    }
    avatar = '<div class="' + avatarClass + '"' + style + '>' + avatar + '</div>';
    if (spaceUrl) avatar = '<a class="user-avatar-link" href="' + escapeHtml(spaceUrl) + '" aria-label="' + escapeHtml(name) + ' 的空间">' + avatar + '</a>';
    return avatar + '<div class="message-info"><div class="message-author">' + displayName + '</div><div class="message-time">' + escapeHtml(time) + '</div></div>';
}

function createReplyForm(id) {
    const form = document.createElement('form');
    form.className = 'reply-inline';
    form.innerHTML = '<textarea rows="3" maxlength="5000" aria-label="回复内容" placeholder="写下你的回复…"></textarea>' +
        '<div class="reply-inline-footer"><label class="markdown-toggle"><input type="checkbox"> Markdown</label>' +
        '<div class="reply-inline-actions"><button class="cancel-btn" type="button">取消</button>' +
        '<button class="submit-btn" type="submit">发布回复</button></div></div><p class="lyb-reply-status" role="status"></p>';
    const input = form.querySelector('textarea');
    const markdown = form.querySelector('input');
    const draft = replyDrafts.get(id) || { text: '', markdown: true };
    input.value = draft.text;
    markdown.checked = draft.markdown;
    form.querySelector('.submit-btn').disabled = pendingReplies.has(id);
    function updateDraft() { replyDrafts.set(id, { text: input.value, markdown: markdown.checked }); }
    input.addEventListener('input', updateDraft);
    markdown.addEventListener('change', updateDraft);
    form.querySelector('.cancel-btn').addEventListener('click', () => toggleReplyForm(id));
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        void submitReply(id, input.value.trim(), markdown.checked);
    });
    return form;
}

function toggleReplyForm(messageId) {
    activeReply = activeReply === messageId ? '' : messageId;
    applyFiltersAndRender();
    if (activeReply) byId('message-' + messageId)?.querySelector('textarea')?.focus();
    else byId('message-' + messageId)?.querySelector('button[data-lyb-action="reply"]')?.focus();
}

async function submitReply(messageId, content, markdown) {
    if (pendingReplies.has(messageId) || !messagesRef) return;
    const nicknameInput = /** @type {HTMLInputElement} */ (byId('nickname'));
    identityInstance?.refreshFromInputs();
    syncIdentityState();
    const currentNickname = isLoggedUser ? (nickname || loginName || '已登录') : nicknameInput.value.trim();
    const status = () => byId('message-' + messageId)?.querySelector('.lyb-reply-status');
    if (!currentNickname || !content) {
        const feedback = status();
        if (feedback) feedback.textContent = '请填写昵称和回复内容';
        if (!currentNickname) nicknameInput.focus();
        return;
    }
    const draft = replyDrafts.get(messageId);
    const replyRef = messagesRef.child(messageId).child('replies').push();
    pendingReplies.add(messageId);
    const publish = () => byId('message-' + messageId)?.querySelector('form .submit-btn');
    if (publish()) publish().disabled = true;
    try {
        await replyRef.set({
            id: replyRef.key,
            text: content,
            nickname: currentNickname,
            login: loginName || '',
            loginType: isLoggedUser ? (loginType || localStorage.getItem('quark_login_type') || '') : '',
            uid: isLoggedUser ? (window.QuarkUserProfile?.getUid() || '') : getGuestUid(),
            avatar: userAvatarType === 'color' ? userColor : userAvatarUrl,
            avatarType: userAvatarType,
            timestamp: Date.now(),
            isMarkdown: markdown
        });
        if (replyDrafts.get(messageId) === draft) {
            replyDrafts.delete(messageId);
            if (activeReply === messageId) activeReply = '';
        }
        applyFiltersAndRender();
    } catch {
        const feedback = status();
        if (feedback) feedback.textContent = '回复发布失败，草稿已保留';
    } finally {
        pendingReplies.delete(messageId);
        if (publish()) publish().disabled = false;
    }
}
// ---- Pagination ----

function renderPagination() {
    const pagination = byId('pagination');
    const sharedList = window.CommentListShared;
    if (!sharedList || typeof sharedList.renderPagination !== 'function') return;
    sharedList.renderPagination({
        container: pagination,
        total: totalMessages,
        pageSize: PAGE_SIZE,
        current: currentPage,
        showArrows: true,
        onChange: function (page) {
            currentPage = page;
            applyFiltersAndRender();
            var area = byId('messagesContainer');
            if (area) area.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
}

// ---- Like ----

async function likeMessage(messageId) {
    var msgRef = firebase.database().ref('chatrooms/' + BOARD_NAME + '/messages/' + messageId);
    const sharedList = window.CommentListShared;
    try {
        if (sharedList && typeof sharedList.incrementLike === 'function') {
            await sharedList.incrementLike(msgRef.child('likes'));
        } else {
            await msgRef.transaction(function (message) {
                if (message) { message.likes = (message.likes || 0) + 1; }
                return message;
            });
        }
    } catch (error) {
        console.error('点赞失败:', error);
        setStatus('feedStatus', '点赞失败，请重试。');
    }
    // 实时监听自动更新
}

// ---- Admin Delete ----

async function deleteMessage(messageId) {
    if (!isAdmin) { alert('无权限删除留言'); return; }
    if (confirm('确定要删除这条留言吗？')) {
        var ref = firebase.database().ref('chatrooms/' + BOARD_NAME + '/messages/' + messageId);
        try {
            await ref.remove();
        } catch (error) {
            console.error('删除留言失败:', error);
            setStatus('feedStatus', '删除留言失败，请重试。');
        }
        // 实时监听自动更新
    }
}

async function deleteReply(messageId, replyId) {
    if (!isAdmin || !messagesRef || !confirm('确定要删除这条回复吗？')) return;
    try {
        await messagesRef.child(messageId).child('replies').child(replyId).remove();
    } catch (error) {
        console.error('删除回复失败:', error);
        setStatus('feedStatus', '删除回复失败，请重试。');
    }
}
// ---- SHA256 ----

/**
 * @param {string} message
 * @returns {Promise<string>}
 */
function sha256(message) {
    const crypto = window.crypto;
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    return crypto.subtle.digest('SHA-256', data).then(function (hash) {
        return Array.from(new Uint8Array(hash))
            .map(function (b) { return b.toString(16).padStart(2, '0'); })
            .join('');
    });
}
