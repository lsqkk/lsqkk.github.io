// @ts-check

/**
 * @typedef {{ id?: string, text: string, nickname: string, avatar: string, avatarType: 'color' | 'image', timestamp: number, isMarkdown?: boolean, likes?: number, replies?: Record<string, ReplyItem> }} MessageItem
 * @typedef {{ id: string, text: string, nickname: string, avatar: string, avatarType: 'color' | 'image', timestamp: number, isMarkdown?: boolean }} ReplyItem
 */

firebase.initializeApp(firebaseConfig);

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
/** @type {string | null} */
let replyingTo = null; // 当前回复的留言ID

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

    const profile = window.QuarkUserProfile && typeof window.QuarkUserProfile.getProfile === 'function'
        ? window.QuarkUserProfile.getProfile()
        : null;
    if (profile) {
        if (profile.nickname) nickname = profile.nickname;
        if (profile.avatarUrl) {
            userAvatarType = 'image';
            userAvatarUrl = profile.avatarUrl;
        } else if (profile.avatarColor) {
            userAvatarType = 'color';
            userColor = profile.avatarColor;
        }
    }

    // 初始化头像切换
    initAvatarToggle();

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

    // 如果已有昵称，填充昵称输入框
    const nicknameInput = byId('nickname');
    if (nicknameInput instanceof HTMLInputElement) {
        if (nickname) nicknameInput.value = nickname;
        nicknameInput.addEventListener('input', () => {
            nickname = nicknameInput.value.trim();
            localStorage.setItem('nickname', nickname);
            if (window.QuarkUserProfile && typeof window.QuarkUserProfile.syncProfile === 'function') {
                window.QuarkUserProfile.syncProfile({
                    nickname,
                    avatarType: userAvatarType,
                    avatarColor: userColor,
                    avatarUrl: userAvatarUrl
                });
            }
            updateAvatarPreview();
        });
    }

    const avatarUrlInput = byId('avatarUrl');
    if (avatarUrlInput instanceof HTMLInputElement && userAvatarUrl) {
        avatarUrlInput.value = userAvatarUrl;
    }
    updateAvatarPreview();
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

    const nickname = nicknameInput.value.trim();
    const content = contentInput.value.trim();
    const useMarkdown = markdownInput.checked;

    if (!nickname || !content) {
        alert('请填写昵称和留言内容');
        return;
    }

    // 保存昵称到本地存储
    localStorage.setItem('nickname', nickname);

    const message = {
        text: content,
        nickname: nickname,
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

// 初始化头像切换
function initAvatarToggle() {
    const colorToggle = byId('colorToggle');
    const imageToggle = byId('imageToggle');
    const colorPicker = byId('colorPicker');
    const avatarUrl = byId('avatarUrl');
    if (!(colorToggle instanceof HTMLElement) ||
        !(imageToggle instanceof HTMLElement) ||
        !(colorPicker instanceof HTMLElement) ||
        !(avatarUrl instanceof HTMLInputElement)) {
        return;
    }

    colorToggle.addEventListener('click', function () {
        userAvatarType = 'color';
        colorToggle.classList.add('active');
        imageToggle.classList.remove('active');
        colorPicker.style.display = 'flex';
        avatarUrl.style.display = 'none';
        updateAvatarPreview();
    });

    imageToggle.addEventListener('click', function () {
        userAvatarType = 'image';
        imageToggle.classList.add('active');
        colorToggle.classList.remove('active');
        colorPicker.style.display = 'none';
        avatarUrl.style.display = 'block';
        updateAvatarPreview();
    });

    avatarUrl.addEventListener('input', updateAvatarPreview);
}

// 选择颜色
function selectColor(element) {
    document.querySelectorAll('.color-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    element.classList.add('selected');
    userColor = element.style.backgroundColor;
    updateAvatarPreview();
}

// 更新头像预览
function updateAvatarPreview() {
    const avatarPreview = byId('avatarPreview');
    if (!(avatarPreview instanceof HTMLElement)) {
        return;
    }

    if (userAvatarType === 'color') {
        avatarPreview.style.background = userColor;
        avatarPreview.style.backgroundImage = 'none';
        avatarPreview.textContent = nickname ? nickname[0].toUpperCase() : 'A';
        if (window.QuarkUserProfile && typeof window.QuarkUserProfile.syncProfile === 'function') {
            window.QuarkUserProfile.syncProfile({
                nickname,
                avatarType: 'color',
                avatarColor: userColor,
                avatarUrl: ''
            });
        }
    } else {
        const avatarUrlInput = byId('avatarUrl');
        const url = avatarUrlInput instanceof HTMLInputElement ? avatarUrlInput.value.trim() : '';
        if (url && (url.endsWith('.jpg') || url.endsWith('.png') || url.endsWith('.webp'))) {
            avatarPreview.style.backgroundImage = `url(${url})`;
            avatarPreview.textContent = '';
            userAvatarUrl = url;
            if (window.QuarkUserProfile && typeof window.QuarkUserProfile.syncProfile === 'function') {
                window.QuarkUserProfile.syncProfile({
                    nickname,
                    avatarType: 'image',
                    avatarColor: userColor,
                    avatarUrl: userAvatarUrl
                });
            }
        } else {
            avatarPreview.style.background = userColor;
            avatarPreview.style.backgroundImage = 'none';
            avatarPreview.textContent = nickname ? nickname[0].toUpperCase() : 'A';
        }
    }
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
                !message.nickname.toLowerCase().includes(searchTerm)) {
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
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    const endIndex = Math.min(startIndex + PAGE_SIZE, messages.length);
    const pageMessages = messages.slice(startIndex, endIndex);

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

    const date = new Date(message.timestamp);
    const dateStr = date.toLocaleDateString();
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // 渲染内容（Markdown或纯文本）
    let content = message.text;
    if (message.isMarkdown) {
        content = marked.parse(content);
    } else {
        content = content.replace(/\n/g, '<br>');
    }

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

    messageDiv.innerHTML = `
                <div class="message-header">
                    <div class="message-avatar" style="${message.avatarType === 'color' ?
            `background: ${message.avatar}` :
            `background-image: url(${message.avatar})`}">
                        ${message.avatarType === 'color' ? message.nickname[0].toUpperCase() : ''}
                    </div>
                    <div class="message-info">
                        <div class="message-author">${message.nickname}</div>
                        <div class="message-time">${dateStr} ${timeStr}</div>
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
    const date = new Date(reply.timestamp);
    const dateStr = date.toLocaleDateString();
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // 渲染内容（Markdown或纯文本）
    let content = reply.text;
    if (reply.isMarkdown) {
        content = marked.parse(content);
    } else {
        content = content.replace(/\n/g, '<br>');
    }

    return `
                <div class="reply-card">
                    <div class="reply-header">
                        <div class="reply-avatar" style="${reply.avatarType === 'color' ?
            `background: ${reply.avatar}` :
            `background-image: url(${reply.avatar})`}">
                            ${reply.avatarType === 'color' ? reply.nickname[0].toUpperCase() : ''}
                        </div>
                        <div class="message-info">
                            <div class="message-author">${reply.nickname}</div>
                            <div class="message-time">${dateStr} ${timeStr}</div>
                        </div>
                        ${isAdmin ? `<button class="delete-btn" onclick="deleteReply('${reply.id}')">删除</button>` : ''}
                    </div>
                    <div class="message-content">${content}</div>
                </div>
            `;
}

// 渲染分页
function renderPagination() {
    const totalPages = Math.ceil(totalMessages / PAGE_SIZE);
    const pagination = byId('pagination');
    if (!(pagination instanceof HTMLElement)) return;

    pagination.innerHTML = '';

    if (totalPages <= 1) return;

    // 上一页按钮
    if (currentPage > 1) {
        const prevBtn = document.createElement('button');
        prevBtn.className = 'page-btn';
        prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
        prevBtn.addEventListener('click', () => {
            currentPage--;
            loadMessages();
        });
        pagination.appendChild(prevBtn);
    }

    // 页码按钮
    for (let i = 1; i <= totalPages; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.className = `page-btn ${i === currentPage ? 'active' : ''}`;
        pageBtn.textContent = String(i);
        pageBtn.addEventListener('click', () => {
            currentPage = i;
            loadMessages();
        });
        pagination.appendChild(pageBtn);
    }

    // 下一页按钮
    if (currentPage < totalPages) {
        const nextBtn = document.createElement('button');
        nextBtn.className = 'page-btn';
        nextBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
        nextBtn.addEventListener('click', () => {
            currentPage++;
            loadMessages();
        });
        pagination.appendChild(nextBtn);
    }
}

// 点赞留言
function likeMessage(messageId) {
    const messageRef = firebase.database().ref(`chatrooms/${BOARD_NAME}/messages/${messageId}`);

    messageRef.transaction(message => {
        if (message) {
            message.likes = (message.likes || 0) + 1;
        }
        return message;
    });

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
    const nickname = nicknameInput.value.trim();
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
