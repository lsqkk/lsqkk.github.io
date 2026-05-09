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
        updateAdminUI();
        return false;
    }

    try {
        const response = await fetch('__API_BASE__/api/admin-verify', {
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

    updateAdminUI();
    return isAdmin;
}

// DOM加载完成后初始化
document.addEventListener('DOMContentLoaded', async function () {
    initTheme();

    if (window.CommentInputShared && typeof window.CommentInputShared.init === 'function') {
        identityInstance = window.CommentInputShared.init({ variant: 'lyb' });
        syncIdentityState();
    }

    try {
        await ensureDatabaseReady();
    } catch (error) {
        console.error('留言板 Firebase 初始化失败:', error);
    }

    // 初始化Firebase引用
    try {
        messagesRef = firebase.database().ref(`chatrooms/${BOARD_NAME}/messages`);
    } catch (error) {
        console.error('留言板 Firebase 引用初始化失败:', error);
    }

    // 加载留言
    await loadMessages();

    // 初始化管理员状态
    await verifyAdminSession();

    // 监听搜索框输入
    const searchInput = byId('searchInput');
    if (searchInput instanceof HTMLInputElement) {
        searchInput.addEventListener('input', function () {
            currentPage = 1;
            loadMessages();
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
    document.body.className = theme + '-mode';
    if (window.matchMedia) {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        mediaQuery.addEventListener('change', function (e) {
            if (!localStorage.getItem('theme')) {
                const newTheme = e.matches ? 'dark' : 'light';
                document.body.className = newTheme + '-mode';
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
        const response = await fetch('__API_BASE__/api/admin-auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ passwordHash: hash })
        });
        const result = await response.json();
        if (response.ok && result.success && result.token) {
            isAdmin = true;
            setAdminToken(result.token);
            updateAdminUI();
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
    updateAdminUI();
}

function updateAdminUI() {
    const loginForm = byId('adminLoginForm');
    const adminActions = byId('adminActions');
    if (!(loginForm instanceof HTMLElement) || !(adminActions instanceof HTMLElement)) return;
    loginForm.style.display = isAdmin ? 'none' : 'flex';
    adminActions.style.display = isAdmin ? 'flex' : 'none';
    loadMessages();
}

// ---- Sort ----

/**
 * @param {string} mode
 */
function setSort(mode) {
    sortMode = mode;
    document.querySelectorAll('.sort-btn').forEach(function (btn) {
        btn.classList.toggle('active', btn.getAttribute('data-sort') === mode);
    });
    currentPage = 1;
    loadMessages();
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
    if (!currentNickname || !content) { alert('请填写昵称和留言内容'); return; }

    const message = {
        text: content,
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

    if (!messagesRef) {
        messagesRef = firebase.database().ref(`chatrooms/${BOARD_NAME}/messages`);
    }
    try {
        if (messagesRef && typeof messagesRef.push === 'function') {
            await messagesRef.push(message);
        }
    } catch (error) {
        console.error('提交留言失败:', error);
    } finally {
        contentInput.value = '';
        if (sortMode === 'newest') currentPage = 1;
        await loadMessages();
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

// ---- Load Messages ----

async function loadMessages() {
    const searchInput = byId('searchInput');
    const searchTerm = searchInput instanceof HTMLInputElement ? searchInput.value.trim().toLowerCase() : '';
    if (!messagesRef) {
        messagesRef = firebase.database().ref(`chatrooms/${BOARD_NAME}/messages`);
    }

    return messagesRef.once('value').then((snapshot) => {
        /** @type {MessageItem[]} */
        const messages = [];
        snapshot.forEach((childSnapshot) => {
            const message = childSnapshot.val();
            message.id = childSnapshot.key;
            if (searchTerm &&
                !message.text.toLowerCase().includes(searchTerm) &&
                !message.nickname.toLowerCase().includes(searchTerm) &&
                !(message.login || '').toLowerCase().includes(searchTerm)) return;
            messages.push(message);
        });

        // 排序
        if (sortMode === 'newest') {
            messages.sort((a, b) => b.timestamp - a.timestamp);
        } else if (sortMode === 'oldest') {
            messages.sort((a, b) => a.timestamp - b.timestamp);
        } else if (sortMode === 'hot') {
            messages.sort((a, b) => (b.likes || 0) - (a.likes || 0) || (b.timestamp - a.timestamp));
        }

        totalMessages = messages.length;

        // 更新留言数
        const countEl = byId('messageCount');
        if (countEl) countEl.textContent = String(totalMessages);

        renderMessages(messages);
        renderPagination();
    });
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

    container.innerHTML = '';

    if (pageMessages.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-comments"></i><p>暂无留言</p></div>';
        return;
    }

    pageMessages.forEach(message => {
        const messageElement = createMessageElement(message);
        container.appendChild(messageElement);
    });
}

/**
 * @param {MessageItem} message
 * @returns {HTMLDivElement}
 */
function createMessageElement(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message-row';
    messageDiv.id = `message-${message.id}`;

    const renderShared = window.CommentRenderShared;
    const timeText = renderShared && typeof renderShared.formatTime === 'function'
        ? renderShared.formatTime(message.timestamp)
        : new Date(message.timestamp || Date.now()).toLocaleString();

    const content = renderShared && typeof renderShared.renderMarkdown === 'function'
        ? renderShared.renderMarkdown(message.text, message.isMarkdown)
        : String(message.text || '').replace(/\n/g, '<br>');

    // 构建回复HTML
    let repliesHtml = '';
    if (message.replies) {
        const replyKeys = Object.keys(message.replies);
        replyKeys.sort((a, b) => message.replies[a].timestamp - message.replies[b].timestamp);
        repliesHtml = '<div class="replies">';
        replyKeys.forEach(key => {
            const reply = message.replies[key];
            repliesHtml += createReplyElement(reply);
        });
        repliesHtml += '</div>';
    }

    // 头像
    const sharedList = window.CommentListShared;
    const authorHtml = sharedList && typeof sharedList.getDisplayName === 'function'
        ? sharedList.getDisplayName(message.nickname, message.login, message.loginType, message.uid)
        : (message.nickname || '访客');
    const shared = window.CommentShared;
    const spaceUrl = shared && typeof shared.getUserSpaceUrl === 'function'
        ? shared.getUserSpaceUrl(message.login, message.loginType) : '';
    const safeSpaceUrl = shared && typeof shared.escapeHtml === 'function'
        ? shared.escapeHtml(spaceUrl) : spaceUrl;

    const avatarInner = `
        <div class="message-avatar" style="${message.avatarType === 'color'
            ? `background: ${message.avatar}`
            : `background-image: url(${message.avatar})`}">
            ${message.avatarType === 'color' ? (message.nickname || '访')[0].toUpperCase() : ''}
        </div>`;
    const avatarHtml = spaceUrl
        ? `<a class="user-avatar-link" href="${safeSpaceUrl}">${avatarInner}</a>`
        : avatarInner;

    // 回复内联表单（默认隐藏）
    const replyFormHtml = `
        <div class="reply-inline" id="reply-inline-${message.id}" style="display:none">
            <textarea id="replyContent-${message.id}" rows="3" placeholder="写下您的回复..."></textarea>
            <div class="reply-inline-footer">
                <label class="markdown-toggle">
                    <input type="checkbox" id="replyUseMarkdown-${message.id}" checked>
                    <span>Markdown</span>
                </label>
                <div class="reply-inline-actions">
                    <button class="cancel-btn" onclick="hideReplyForm('${message.id}')">取消</button>
                    <button class="submit-btn" onclick="submitReply('${message.id}')">回复</button>
                </div>
            </div>
        </div>`;

    messageDiv.innerHTML = `
        <div class="message-header">
            ${avatarHtml}
            <div class="message-info">
                <div class="message-author">${authorHtml}</div>
                <div class="message-time">${timeText}</div>
            </div>
            <div class="message-actions">
                <button class="action-btn" onclick="likeMessage('${message.id}')">
                    <i class="fas fa-heart"></i>
                    <span>${message.likes || 0}</span>
                </button>
                <button class="action-btn" onclick="toggleReplyForm('${message.id}')">
                    <i class="fas fa-reply"></i>
                    <span>回复</span>
                </button>
                ${isAdmin ? `<button class="delete-btn" onclick="deleteMessage('${message.id}')">删除</button>` : ''}
            </div>
        </div>
        <div class="message-content">${content}</div>
        ${repliesHtml}
        ${replyFormHtml}`;

    return messageDiv;
}

/**
 * @param {ReplyItem} reply
 * @returns {string}
 */
function createReplyElement(reply) {
    const renderShared = window.CommentRenderShared;
    const timeText = renderShared && typeof renderShared.formatTime === 'function'
        ? renderShared.formatTime(reply.timestamp)
        : new Date(reply.timestamp || Date.now()).toLocaleString();

    const content = renderShared && typeof renderShared.renderMarkdown === 'function'
        ? renderShared.renderMarkdown(reply.text, reply.isMarkdown)
        : String(reply.text || '').replace(/\n/g, '<br>');

    const sharedList = window.CommentListShared;
    const authorHtml = sharedList && typeof sharedList.getDisplayName === 'function'
        ? sharedList.getDisplayName(reply.nickname, reply.login, reply.loginType, reply.uid)
        : (reply.nickname || '访客');
    const shared = window.CommentShared;
    const spaceUrl = shared && typeof shared.getUserSpaceUrl === 'function'
        ? shared.getUserSpaceUrl(reply.login, reply.loginType) : '';
    const safeSpaceUrl = shared && typeof shared.escapeHtml === 'function'
        ? shared.escapeHtml(spaceUrl) : spaceUrl;

    const avatarInner = `
        <div class="reply-avatar" style="${reply.avatarType === 'color'
            ? `background: ${reply.avatar}`
            : `background-image: url(${reply.avatar})`}">
            ${reply.avatarType === 'color' ? (reply.nickname || '访')[0].toUpperCase() : ''}
        </div>`;
    const avatarHtml = spaceUrl
        ? `<a class="user-avatar-link" href="${safeSpaceUrl}">${avatarInner}</a>`
        : avatarInner;

    return `
        <div class="reply-row">
            <div class="reply-header">
                ${avatarHtml}
                <div class="message-info">
                    <div class="message-author">${authorHtml}</div>
                    <div class="message-time">${timeText}</div>
                </div>
                ${isAdmin ? `<button class="delete-btn" onclick="deleteReply('${reply.id}')">删除</button>` : ''}
            </div>
            <div class="message-content">${content}</div>
        </div>`;
}

// ---- Inline Reply ----

/**
 * @param {string} messageId
 */
function toggleReplyForm(messageId) {
    const form = byId(`reply-inline-${messageId}`);
    if (!form) return;
    // 隐藏其他打开的回复表单
    document.querySelectorAll('.reply-inline').forEach(function (el) {
        if (el.id !== `reply-inline-${messageId}`) el.style.display = 'none';
    });
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

/**
 * @param {string} messageId
 */
function hideReplyForm(messageId) {
    const form = byId(`reply-inline-${messageId}`);
    if (form) form.style.display = 'none';
}

/**
 * @param {string} messageId
 */
async function submitReply(messageId) {
    const nicknameInput = byId('nickname');
    const replyContentInput = byId(`replyContent-${messageId}`);
    const replyMarkdownInput = byId(`replyUseMarkdown-${messageId}`);
    if (!(nicknameInput instanceof HTMLInputElement) ||
        !(replyContentInput instanceof HTMLTextAreaElement) ||
        !(replyMarkdownInput instanceof HTMLInputElement)) return;

    if (identityInstance && typeof identityInstance.refreshFromInputs === 'function') {
        identityInstance.refreshFromInputs();
        syncIdentityState();
    }
    const currentNickname = isLoggedUser ? (nickname || loginName || '已登录') : nicknameInput.value.trim();
    const content = replyContentInput.value.trim();
    const useMarkdown = replyMarkdownInput.checked;
    if (!currentNickname || !content) { alert('请填写昵称和回复内容'); return; }

    const reply = {
        id: Date.now().toString(),
        text: content,
        nickname: currentNickname,
        login: loginName || '',
        loginType: isLoggedUser ? (loginType || localStorage.getItem('quark_login_type') || '') : '',
        uid: isLoggedUser ? (window.QuarkUserProfile && typeof window.QuarkUserProfile.getUid === 'function'
            ? window.QuarkUserProfile.getUid() : '') : getGuestUid(),
        avatar: userAvatarType === 'color' ? userColor : userAvatarUrl,
        avatarType: userAvatarType,
        timestamp: Date.now(),
        isMarkdown: useMarkdown
    };

    const replyRef = firebase.database().ref(`chatrooms/${BOARD_NAME}/messages/${messageId}/replies/${reply.id}`);
    try {
        await replyRef.set(reply);
    } catch (error) {
        console.error('提交回复失败:', error);
    } finally {
        hideReplyForm(messageId);
        await loadMessages();
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
        onChange: (page) => {
            currentPage = page;
            loadMessages();
            // 滚动到留言列表顶部
            const area = byId('messagesContainer');
            if (area) area.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
}

// ---- Like ----

async function likeMessage(messageId) {
    const messageRef = firebase.database().ref(`chatrooms/${BOARD_NAME}/messages/${messageId}`);
    const sharedList = window.CommentListShared;
    try {
        if (sharedList && typeof sharedList.incrementLike === 'function') {
            await sharedList.incrementLike(messageRef.child('likes'));
        } else {
            await messageRef.transaction(message => {
                if (message) { message.likes = (message.likes || 0) + 1; }
                return message;
            });
        }
    } catch (error) {
        console.error('点赞失败:', error);
    } finally {
        await loadMessages();
    }
}

// ---- Admin Delete ----

async function deleteMessage(messageId) {
    if (!isAdmin) { alert('无权限删除留言'); return; }
    if (confirm('确定要删除这条留言吗？')) {
        const messageRef = firebase.database().ref(`chatrooms/${BOARD_NAME}/messages/${messageId}`);
        try {
            await messageRef.remove();
        } catch (error) {
            console.error('删除留言失败:', error);
        } finally {
            await loadMessages();
        }
    }
}

// 删除回复（通过遍历查找所属留言）
async function deleteReply(replyId) {
    if (!isAdmin) { alert('无权限删除回复'); return; }
    if (!messagesRef) { alert('留言板未就绪'); return; }

    // 找到包含此回复的留言
    const snapshot = await messagesRef.once('value');
    let foundMessageId = null;
    snapshot.forEach((childSnapshot) => {
        if (foundMessageId) return;
        const msg = childSnapshot.val();
        if (msg.replies && msg.replies[replyId]) {
            foundMessageId = childSnapshot.key;
        }
    });

    if (!foundMessageId) { alert('未找到该回复'); return; }
    if (!confirm('确定要删除这条回复吗？')) return;

    const replyRef = firebase.database().ref(`chatrooms/${BOARD_NAME}/messages/${foundMessageId}/replies/${replyId}`);
    try {
        await replyRef.remove();
    } catch (error) {
        console.error('删除回复失败:', error);
    } finally {
        await loadMessages();
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
    return crypto.subtle.digest('SHA-256', data).then(hash => {
        return Array.from(new Uint8Array(hash))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    });
}
