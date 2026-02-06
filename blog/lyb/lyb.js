firebase.initializeApp(firebaseConfig);

// 全局变量
const BOARD_NAME = 'lsqkk-lyb';
let messagesRef = null;
let currentPage = 1;
const PAGE_SIZE = 20;
let totalMessages = 0;
let isAdmin = localStorage.getItem('isAdmin') === 'true';
let userAvatarType = 'color'; // 'color' 或 'image'
let userColor = '#4a6cf7';
let userAvatarUrl = '';
let nickname = localStorage.getItem('nickname') || '';
let replyingTo = null; // 当前回复的留言ID

// DOM加载完成后初始化
document.addEventListener('DOMContentLoaded', function () {
    // 初始化主题（自动跟随系统）
    initTheme();

    // 初始化头像切换
    initAvatarToggle();

    // 初始化Firebase引用
    messagesRef = firebase.database().ref(`chatrooms/${BOARD_NAME}/messages`);

    // 加载留言
    loadMessages();

    // 初始化管理员状态
    updateAdminUI();

    // 监听搜索框输入
    document.getElementById('searchInput').addEventListener('input', function () {
        loadMessages();
    });

    // 如果已有昵称，填充昵称输入框
    if (nickname) {
        document.getElementById('nickname').value = nickname;
    }
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
    const nicknameInput = document.getElementById('nickname');
    const contentInput = document.getElementById('messageContent');

    const nickname = nicknameInput.value.trim();
    const content = contentInput.value.trim();
    const useMarkdown = document.getElementById('useMarkdown').checked;

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
    const colorToggle = document.getElementById('colorToggle');
    const imageToggle = document.getElementById('imageToggle');
    const colorPicker = document.getElementById('colorPicker');
    const avatarUrl = document.getElementById('avatarUrl');

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
    const avatarPreview = document.getElementById('avatarPreview');

    if (userAvatarType === 'color') {
        avatarPreview.style.background = userColor;
        avatarPreview.style.backgroundImage = 'none';
        avatarPreview.textContent = nickname ? nickname[0].toUpperCase() : 'A';
    } else {
        const url = document.getElementById('avatarUrl').value.trim();
        if (url && (url.endsWith('.jpg') || url.endsWith('.png') || url.endsWith('.webp'))) {
            avatarPreview.style.backgroundImage = `url(${url})`;
            avatarPreview.textContent = '';
            userAvatarUrl = url;
        } else {
            avatarPreview.style.background = userColor;
            avatarPreview.style.backgroundImage = 'none';
            avatarPreview.textContent = nickname ? nickname[0].toUpperCase() : 'A';
        }
    }
}

// 加载留言
function loadMessages() {
    const searchTerm = document.getElementById('searchInput').value.trim().toLowerCase();

    // 确保messagesRef已初始化
    if (!messagesRef) {
        messagesRef = firebase.database().ref(`chatrooms/${BOARD_NAME}/messages`);
    }

    messagesRef.once('value').then(snapshot => {
        const messages = [];
        snapshot.forEach(childSnapshot => {
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
function renderMessages(messages) {
    const container = document.getElementById('messagesContainer');
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
    const pagination = document.getElementById('pagination');

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
        pageBtn.textContent = i;
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
    document.getElementById('replyModal').style.display = 'flex';
}

// 关闭回复模态框
function closeReplyModal() {
    replyingTo = null;
    document.getElementById('replyModal').style.display = 'none';
    document.getElementById('replyContent').value = '';
}

// 提交回复
function submitReply() {
    if (!replyingTo) return;

    const nickname = document.getElementById('nickname').value.trim();
    const content = document.getElementById('replyContent').value.trim();
    const useMarkdown = document.getElementById('replyUseMarkdown').checked;

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
    const passwordInput = document.getElementById('adminPassword');
    const password = passwordInput.value.trim();
    const submitBtn = document.querySelector('button[onclick="adminLogin()"]'); // 获取触发登录的按钮

    if (!password) {
        alert('请输入管理员密码');
        return;
    }

    // 可选：添加防重复提交和加载状态
    let originalBtnText = '登录'; // 默认按钮文字
    if (submitBtn) {
        originalBtnText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = '验证中...';
    }

    try {
        // 1. 计算用户输入密码的SHA-256哈希 (保持同步计算方式)
        const hash = sha256(password); // 注意：这里假设 sha256 是同步函数

        // 2. 调用Vercel安全API进行验证
        const response = await fetch('https://api.lsqkk.space/api/admin-auth', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ passwordHash: hash })
        });

        const result = await response.json();

        // 3. 根据API返回结果处理
        if (response.ok && result.success) {
            // 登录成功
            isAdmin = true;
            localStorage.setItem('isAdmin', 'true');
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
    localStorage.setItem('isAdmin', 'false');
    updateAdminUI();
}

// 更新管理员UI
function updateAdminUI() {
    const loginForm = document.getElementById('adminLoginForm');
    const adminActions = document.getElementById('adminActions');

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
function sha256(message) {
    // 简化版SHA256实现（实际项目中应使用更完整的实现或库）
    // 这里仅用于演示，实际使用时建议使用成熟的加密库
    const crypto = window.crypto || window.msCrypto;
    const encoder = new TextEncoder();
    const data = encoder.encode(message);

    return crypto.subtle.digest('SHA-256', data).then(hash => {
        return Array.from(new Uint8Array(hash))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    });
}