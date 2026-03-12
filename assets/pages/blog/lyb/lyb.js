// @ts-check

/**
 * @typedef {{ id?: string, text: string, nickname: string, avatar: string, avatarType: 'color' | 'image', timestamp: number, isMarkdown?: boolean, likes?: number, replies?: Record<string, ReplyItem> }} MessageItem
 * @typedef {{ id: string, text: string, nickname: string, avatar: string, avatarType: 'color' | 'image', timestamp: number, isMarkdown?: boolean }} ReplyItem
 */

firebase.initializeApp(firebaseConfig);

async function waitForAppCheck() {
    if (window.__quarkAppCheckReady && typeof window.__quarkAppCheckReady.then === 'function') {
        try {
            await window.__quarkAppCheckReady;
        } catch {
            // ignore
        }
    }
}

// 全局变量
const BOARD_NAME = 'lsqkk-lyb';
/** @type {any} */
let messagesRef = null;
let currentPage = 1;
const PAGE_SIZE = 20;
let totalMessages = 0;
const ADMIN_TOKEN_KEY = 'lyb_admin_token';
let isAdmin = false;
/** @type {'color' | 'image'} */
let userAvatarType = 'color'; // 'color' 或 'image'
let userColor = '#4a6cf7';
let userAvatarUrl = '';
let nickname = localStorage.getItem('nickname') || '';
let loginName = '';
let loginType = '';
let isLoggedUser = false;
let identityInstance = null;
/** @type {string | null} */
let replyingTo = null; // 当前回复的留言ID

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
    // 初始化主题（自动跟随系统）
    initTheme();

    if (window.CommentInputShared && typeof window.CommentInputShared.init === 'function') {
        identityInstance = window.CommentInputShared.init({ variant: 'lyb' });
        syncIdentityState();
    }

    await waitForAppCheck();

    // 初始化Firebase引用
    messagesRef = firebase.database().ref(`chatrooms/${BOARD_NAME}/messages`);

    // 加载留言
    loadMessages();

    // 初始化管理员状态
    await verifyAdminSession();

    // 监听搜索框输入
    const searchInput = byId('searchInput');
    if (searchInput instanceof HTMLInputElement) {
        searchInput.addEventListener('input', function () {
            loadMessages();
        });
    }

    syncIdentityState();
});

// 初始化主题 - 自动跟随系统
function initTheme() {
    // 检查是否已保存主题
    const savedTheme = localStorage.getItem('theme');
    let theme;

    if (savedTheme) {
        theme = savedTheme;
    } else {
        // 自动检测系统主题
        theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        localStorage.setItem('theme', theme);
    }

    document.body.className = theme + '-mode';

    // 监听系统主题变化
    if (window.matchMedia) {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        mediaQuery.addEventListener('change', function (e) {
            // 只有在没有手动设置过主题时才跟随系统
            if (!localStorage.getItem('theme')) {
                const newTheme = e.matches ? 'dark' : 'light';
                document.body.className = newTheme + '-mode';
                localStorage.setItem('theme', newTheme);
            }
        });
    }
}

// 提交留言
function submitMessage() {
    const nicknameInput = byId('nickname');
    const contentInput = byId('messageContent');
    const markdownInput = byId('useMarkdown');
    if (!(nicknameInput instanceof HTMLInputElement) ||
        !(contentInput instanceof HTMLTextAreaElement) ||
        !(markdownInput instanceof HTMLInputElement)) {
        return;
    }

    if (identityInstance && typeof identityInstance.refreshFromInputs === 'function') {
        identityInstance.refreshFromInputs();
        syncIdentityState();
    }
    const nickname = isLoggedUser ? (nickname || loginName || '已登录') : nicknameInput.value.trim();
    const content = contentInput.value.trim();
    const useMarkdown = markdownInput.checked;

    if (!nickname || !content) {
        alert('请填写昵称和留言内容');
        return;
    }

    // 保存昵称到本地存储
    const message = {
        text: content,
        nickname: nickname,
        login: loginName || '',
        loginType: isLoggedUser ? (loginType || localStorage.getItem('quark_login_type') || '') : '',
        uid: isLoggedUser ? (window.QuarkUserProfile && typeof window.QuarkUserProfile.getUid === 'function'
            ? window.QuarkUserProfile.getUid()
            : '') : getGuestUid(),
        avatar: userAvatarType === 'color' ? userColor : userAvatarUrl,
        avatarType: userAvatarType,
        timestamp: Date.now(),
        isMarkdown: useMarkdown,
        likes: 0
    };

    // 确保messagesRef已初始化
    if (!messagesRef) {
        messagesRef = firebase.database().ref(`chatrooms/${BOARD_NAME}/messages`);
    }

    messagesRef.push(message);
    contentInput.value = '';

    // 重新加载留言
    loadMessages();
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

// 加载留言
function loadMessages() {
    const searchInput = byId('searchInput');
    const searchTerm = searchInput instanceof HTMLInputElement ? searchInput.value.trim().toLowerCase() : '';

    // 确保messagesRef已初始化
    if (!messagesRef) {
        messagesRef = firebase.database().ref(`chatrooms/${BOARD_NAME}/messages`);
    }

    messagesRef.once('value').then((snapshot) => {
        /** @type {MessageItem[]} */
        const messages = [];
        snapshot.forEach((childSnapshot) => {
            const message = childSnapshot.val();
            message.id = childSnapshot.key;

            // 搜索过滤
            if (searchTerm &&
                !message.text.toLowerCase().includes(searchTerm) &&
                !message.nickname.toLowerCase().includes(searchTerm) &&
                !(message.login || '').toLowerCase().includes(searchTerm)) {
                return;
            }

            messages.push(message);
        });

        // 按时间倒序排列（新的在前）
        messages.sort((a, b) => b.timestamp - a.timestamp);

        totalMessages = messages.length;
        renderMessages(messages);
        renderPagination();
    });
}

// 渲染留言
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
        container.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: var(--text-light);">
                        <i class="fas fa-comments" style="font-size: 3rem; margin-bottom: 16px;"></i>
                        <p>暂无留言</p>
                    </div>
                `;
        return;
    }

    pageMessages.forEach(message => {
        const messageElement = createMessageElement(message);
        container.appendChild(messageElement);
    });
}

// 创建留言元素
/**
 * @param {MessageItem} message
 * @returns {HTMLDivElement}
 */
function createMessageElement(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message-card';
    messageDiv.id = `message-${message.id}`;

    const renderShared = window.CommentRenderShared;
    const timeText = renderShared && typeof renderShared.formatTime === 'function'
        ? renderShared.formatTime(message.timestamp)
        : new Date(message.timestamp || Date.now()).toLocaleString();

    // 渲染内容（Markdown或纯文本）
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

    const sharedList = window.CommentListShared;
    const authorHtml = sharedList && typeof sharedList.getDisplayName === 'function'
        ? sharedList.getDisplayName(message.nickname, message.login, message.loginType, message.uid)
        : (message.nickname || '访客');
    messageDiv.innerHTML = `
                <div class="message-header">
                    <div class="message-avatar" style="${message.avatarType === 'color' ?
            `background: ${message.avatar}` :
            `background-image: url(${message.avatar})`}">
                        ${message.avatarType === 'color' ? (message.nickname || '访')[0].toUpperCase() : ''}
                    </div>
                    <div class="message-info">
                        <div class="message-author">${authorHtml}</div>
                        <div class="message-time">${timeText}</div>
                    </div>
                    <div class="message-actions">
                        <button class="action-btn" onclick="likeMessage('${message.id}')">
                            <i class="fas fa-heart"></i>
                            <span>${message.likes || 0}</span>
                        </button>
                        <button class="action-btn" onclick="openReplyModal('${message.id}')">
                            <i class="fas fa-reply"></i>
                            <span>回复</span>
                        </button>
                        ${isAdmin ? `<button class="delete-btn" onclick="deleteMessage('${message.id}')">删除</button>` : ''}
                    </div>
                </div>
                <div class="message-content">${content}</div>
                ${repliesHtml}
            `;

    return messageDiv;
}

// 创建回复元素
/**
 * @param {ReplyItem} reply
 * @returns {string}
 */
function createReplyElement(reply) {
    const renderShared = window.CommentRenderShared;
    const timeText = renderShared && typeof renderShared.formatTime === 'function'
        ? renderShared.formatTime(reply.timestamp)
        : new Date(reply.timestamp || Date.now()).toLocaleString();

    // 渲染内容（Markdown或纯文本）
    const content = renderShared && typeof renderShared.renderMarkdown === 'function'
        ? renderShared.renderMarkdown(reply.text, reply.isMarkdown)
        : String(reply.text || '').replace(/\n/g, '<br>');

    const sharedList = window.CommentListShared;
    const authorHtml = sharedList && typeof sharedList.getDisplayName === 'function'
        ? sharedList.getDisplayName(reply.nickname, reply.login, reply.loginType, reply.uid)
        : (reply.nickname || '访客');
    return `
                <div class="reply-card">
                    <div class="reply-header">
                        <div class="reply-avatar" style="${reply.avatarType === 'color' ?
            `background: ${reply.avatar}` :
            `background-image: url(${reply.avatar})`}">
                            ${reply.avatarType === 'color' ? (reply.nickname || '访')[0].toUpperCase() : ''}
                        </div>
                        <div class="message-info">
                            <div class="message-author">${authorHtml}</div>
                            <div class="message-time">${timeText}</div>
                        </div>
                        ${isAdmin ? `<button class="delete-btn" onclick="deleteReply('${reply.id}')">删除</button>` : ''}
                    </div>
                    <div class="message-content">${content}</div>
                </div>
            `;
}

// 渲染分页
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
        }
    });
}

// 点赞留言
function likeMessage(messageId) {
    const messageRef = firebase.database().ref(`chatrooms/${BOARD_NAME}/messages/${messageId}`);
    const sharedList = window.CommentListShared;
    if (sharedList && typeof sharedList.incrementLike === 'function') {
        sharedList.incrementLike(messageRef.child('likes'));
    } else {
        messageRef.transaction(message => {
            if (message) {
                message.likes = (message.likes || 0) + 1;
            }
            return message;
        });
    }

    // 重新加载留言
    loadMessages();
}

// 打开回复模态框
function openReplyModal(messageId) {
    replyingTo = messageId;
    const replyModal = byId('replyModal');
    if (replyModal instanceof HTMLElement) {
        replyModal.style.display = 'flex';
    }
}

// 关闭回复模态框
function closeReplyModal() {
    replyingTo = null;
    const replyModal = byId('replyModal');
    const replyContent = byId('replyContent');
    if (replyModal instanceof HTMLElement) {
        replyModal.style.display = 'none';
    }
    if (replyContent instanceof HTMLTextAreaElement) {
        replyContent.value = '';
    }
}

// 提交回复
function submitReply() {
    if (!replyingTo) return;

    const nicknameInput = byId('nickname');
    const replyContentInput = byId('replyContent');
    const replyMarkdownInput = byId('replyUseMarkdown');
    if (!(nicknameInput instanceof HTMLInputElement) ||
        !(replyContentInput instanceof HTMLTextAreaElement) ||
        !(replyMarkdownInput instanceof HTMLInputElement)) {
        return;
    }
    if (identityInstance && typeof identityInstance.refreshFromInputs === 'function') {
        identityInstance.refreshFromInputs();
        syncIdentityState();
    }
    const nickname = isLoggedUser ? (nickname || loginName || '已登录') : nicknameInput.value.trim();
    const content = replyContentInput.value.trim();
    const useMarkdown = replyMarkdownInput.checked;

    if (!nickname || !content) {
        alert('请填写昵称和回复内容');
        return;
    }

    const reply = {
        id: Date.now().toString(), // 简单ID生成
        text: content,
        nickname: nickname,
        login: loginName || '',
        loginType: isLoggedUser ? (loginType || localStorage.getItem('quark_login_type') || '') : '',
        uid: isLoggedUser ? (window.QuarkUserProfile && typeof window.QuarkUserProfile.getUid === 'function'
            ? window.QuarkUserProfile.getUid()
            : '') : getGuestUid(),
        avatar: userAvatarType === 'color' ? userColor : userAvatarUrl,
        avatarType: userAvatarType,
        timestamp: Date.now(),
        isMarkdown: useMarkdown
    };

    const replyRef = firebase.database().ref(`chatrooms/${BOARD_NAME}/messages/${replyingTo}/replies/${reply.id}`);
    replyRef.set(reply);

    closeReplyModal();

    // 重新加载留言
    loadMessages();
}

// 管理员登录 (安全API版本)
async function adminLogin() {
    const passwordInput = byId('adminPassword');
    if (!(passwordInput instanceof HTMLInputElement)) {
        return;
    }
    const password = passwordInput.value.trim();
    /** @type {HTMLButtonElement | null} */
    const submitBtn = document.querySelector('button[onclick="adminLogin()"]');

    if (!password) {
        alert('请输入管理员密码');
        return;
    }

    // 可选：添加防重复提交和加载状态
    let originalBtnText = '登录';
    if (submitBtn) {
        originalBtnText = submitBtn.textContent || '登录';
        submitBtn.disabled = true;
        submitBtn.textContent = '验证中...';
    }

    try {
        // 1. 计算用户输入密码的SHA-256哈希
        const hash = await sha256(password);

        // 2. 调用Vercel安全API进行验证
        const response = await fetch('__API_BASE__/api/admin-auth', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ passwordHash: hash })
        });

        const result = await response.json();

        // 3. 根据API返回结果处理
        if (response.ok && result.success && result.token) {
            // 登录成功
            isAdmin = true;
            setAdminToken(result.token);
            updateAdminUI();
            passwordInput.value = '';
            alert('管理员登录成功');
        } else {
            // 登录失败
            alert('密码错误: ' + (result.error || ''));
        }

    } catch (error) {
        // 网络错误或API异常
        console.error('登录过程出错:', error);
        alert('登录失败：网络错误或验证服务异常，请稍后重试。');
    } finally {
        // 无论成功失败，都恢复按钮状态
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalBtnText;
        }
    }
}

// 管理员退出
function logoutAdmin() {
    isAdmin = false;
    setAdminToken('');
    updateAdminUI();
}

// 更新管理员UI
function updateAdminUI() {
    const loginForm = byId('adminLoginForm');
    const adminActions = byId('adminActions');
    if (!(loginForm instanceof HTMLElement) || !(adminActions instanceof HTMLElement)) {
        return;
    }

    if (isAdmin) {
        loginForm.style.display = 'none';
        adminActions.style.display = 'flex';
    } else {
        loginForm.style.display = 'flex';
        adminActions.style.display = 'none';
    }

    // 重新加载留言以显示/隐藏删除按钮
    loadMessages();
}

// 删除留言
function deleteMessage(messageId) {
    if (!isAdmin) {
        alert('无权限删除留言');
        return;
    }

    if (confirm('确定要删除这条留言吗？')) {
        const messageRef = firebase.database().ref(`chatrooms/${BOARD_NAME}/messages/${messageId}`);
        messageRef.remove();

        // 重新加载留言
        loadMessages();
    }
}

// 删除回复
function deleteReply(replyId) {
    if (!isAdmin) {
        alert('无权限删除回复');
        return;
    }

    if (!replyingTo) {
        alert('无法确定回复所属的留言');
        return;
    }

    if (confirm('确定要删除这条回复吗？')) {
        const replyRef = firebase.database().ref(`chatrooms/${BOARD_NAME}/messages/${replyingTo}/replies/${replyId}`);
        replyRef.remove();

        // 重新加载留言
        loadMessages();
    }
}

// SHA256哈希函数
/**
 * @param {string} message
 * @returns {Promise<string>}
 */
function sha256(message) {
    // 简化版SHA256实现（实际项目中应使用更完整的实现或库）
    // 这里仅用于演示，实际使用时建议使用成熟的加密库
    const crypto = window.crypto;
    const encoder = new TextEncoder();
    const data = encoder.encode(message);

    return crypto.subtle.digest('SHA-256', data).then(hash => {
        return Array.from(new Uint8Array(hash))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    });
}
