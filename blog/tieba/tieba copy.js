// API配置
const API_BASE = 'https://api.textdb.online/update/';
const READ_BASE = 'https://textdb.online/';
const KEY_PREFIX = 'lsqkk-lyb-';
const HIDDEN_BOARD_KEY = KEY_PREFIX + 'hidden';
const DEFAULT_BOARD = 'moren';

// 应用状态
let currentBoard = DEFAULT_BOARD;
let messages = [];
let boards = [DEFAULT_BOARD];
let isAdmin = false;
let userData = {
    nickname: '游客',
    avatarUrl: ''
};

// DOM元素
const messagesPanel = document.getElementById('messagesPanel');
const boardSelect = document.getElementById('boardSelect');
const nicknameInput = document.getElementById('nickname');
const avatarUrlInput = document.getElementById('avatarUrl');
const messageInput = document.getElementById('message');
const submitMessageBtn = document.getElementById('submitMessage');
const userAvatar = document.getElementById('userAvatar');
const userName = document.getElementById('userName');
const adminControls = document.getElementById('adminControls');
const newBoardBtn = document.getElementById('newBoardBtn');
const adminLoginBtn = document.getElementById('adminLoginBtn');
const deleteBoardBtn = document.getElementById('deleteBoardBtn');
const newBoardModal = document.getElementById('newBoardModal');
const adminLoginModal = document.getElementById('adminLoginModal');
const deleteConfirmModal = document.getElementById('deleteConfirmModal');
const toast = document.getElementById('toast');

// 初始化
document.addEventListener('DOMContentLoaded', init);

async function init() {
    loadUserData();
    await loadBoards();
    await loadMessages(currentBoard);
    setupEventListeners();
}

function loadUserData() {
    const saved = localStorage.getItem('quarkBlogUser');
    if (saved) {
        userData = JSON.parse(saved);
        nicknameInput.value = userData.nickname;
        avatarUrlInput.value = userData.avatarUrl;
        updateUserDisplay();
    }
}

function saveUserData() {
    userData.nickname = nicknameInput.value || '游客';
    userData.avatarUrl = avatarUrlInput.value;
    localStorage.setItem('quarkBlogUser', JSON.stringify(userData));
    updateUserDisplay();
}

function updateUserDisplay() {
    userName.textContent = userData.nickname;

    if (userData.avatarUrl) {
        userAvatar.innerHTML = `<img src="${userData.avatarUrl}" alt="${userData.nickname}" onerror="this.style.display='none'; this.parentElement.textContent='${userData.nickname.charAt(0)}'">`;
    } else {
        userAvatar.textContent = userData.nickname.charAt(0);
    }
}

async function loadBoards() {
    try {
        const response = await fetch(`${READ_BASE}${HIDDEN_BOARD_KEY}`);
        if (response.ok) {
            const data = await response.text();
            if (data) {
                boards = JSON.parse(data);
                updateBoardSelect();
            }
        }
    } catch (error) {
        console.error('加载帖子列表失败:', error);
        showToast('加载帖子列表失败', 'error');
    }
}

function updateBoardSelect() {
    boardSelect.innerHTML = '';
    boards.forEach(board => {
        const option = document.createElement('option');
        option.value = board;
        option.textContent = board === 'moren' ? '默认帖子' : board;
        boardSelect.appendChild(option);
    });
    boardSelect.value = currentBoard;
}

async function loadMessages(boardKey) {
    try {
        messagesPanel.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

        const response = await fetch(`${READ_BASE}${KEY_PREFIX}${boardKey}`);
        if (response.ok) {
            const data = await response.text();
            if (data) {
                messages = JSON.parse(data);
                renderMessages();
            } else {
                messages = [];
                renderMessages();
            }
        } else if (response.status === 404) {
            messages = [];
            renderMessages();
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
    } catch (error) {
        console.error('加载留言失败:', error);
        messagesPanel.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-exclamation-circle"></i>
                        <h3>网络异常</h3>
                        <p>无法加载留言，请检查网络连接</p>
                    </div>
                `;
    }
}

function renderMessages() {
    if (messages.length === 0) {
        messagesPanel.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-comment-slash"></i>
                        <h3>暂无留言</h3>
                        <p>成为第一个留言的人吧！</p>
                    </div>
                `;
        return;
    }

    // 按时间倒序排列
    messages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    messagesPanel.innerHTML = '';
    messages.forEach((msg, index) => {
        const messageEl = document.createElement('div');
        messageEl.className = 'message';

        const avatarContent = msg.avatarUrl ?
            `<img src="${msg.avatarUrl}" alt="${msg.nickname}" onerror="this.style.display='none'; this.parentElement.textContent='${msg.nickname.charAt(0)}'">` :
            msg.nickname.charAt(0);

        messageEl.innerHTML = `
                    <div class="message-header">
                        <div class="message-user">
                            <div class="message-avatar">${avatarContent}</div>
                            <div>
                                <strong>${msg.nickname}</strong>
                                <div class="message-time">${formatTime(msg.timestamp)}</div>
                            </div>
                        </div>
                        ${isAdmin || (userData.nickname === msg.nickname && userData.avatarUrl === msg.avatarUrl) ?
                `<button class="delete-message" data-index="${index}">
                                <i class="fas fa-trash"></i> 删除
                            </button>` : ''}
                    </div>
                    <div class="message-content">${msg.content}</div>
                `;

        messagesPanel.appendChild(messageEl);
    });

    // 添加删除事件监听
    document.querySelectorAll('.delete-message').forEach(btn => {
        btn.addEventListener('click', function () {
            const index = parseInt(this.getAttribute('data-index'));
            showDeleteConfirm(index);
        });
    });
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;

    return date.toLocaleDateString('zh-CN');
}

async function submitMessage() {
    const content = messageInput.value.trim();
    if (!content) {
        showToast('请输入留言内容', 'error');
        return;
    }

    if (!userData.nickname) {
        showToast('请输入昵称', 'error');
        return;
    }

    try {
        // 创建新消息
        const newMessage = {
            nickname: userData.nickname,
            avatarUrl: userData.avatarUrl,
            content: content,
            timestamp: new Date().toISOString()
        };

        // 添加到消息列表
        const updatedMessages = [...messages, newMessage];

        // 保存到API
        const success = await saveToAPI(currentBoard, updatedMessages);

        if (success) {
            messageInput.value = '';
            messages = updatedMessages;
            renderMessages();
            showToast('留言发布成功', 'success');

            // 如果是管理员，更新隐藏帖子
            if (isAdmin) {
                await updateHiddenBoard();
            }
        } else {
            showToast('发布失败，请重试', 'error');
        }
    } catch (error) {
        console.error('发布留言失败:', error);
        showToast('网络异常，发布失败', 'error');
    }
}

async function saveToAPI(key, data) {
    try {
        const formData = new FormData();
        formData.append('key', KEY_PREFIX + key);
        formData.append('value', JSON.stringify(data));

        const response = await fetch(API_BASE, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        return result.status === 1;
    } catch (error) {
        console.error('保存到API失败:', error);
        return false;
    }
}

async function deleteMessage(index) {
    try {
        const updatedMessages = [...messages];
        updatedMessages.splice(index, 1);

        const success = await saveToAPI(currentBoard, updatedMessages);

        if (success) {
            messages = updatedMessages;
            renderMessages();
            showToast('留言删除成功', 'success');

            // 如果是管理员，更新隐藏帖子
            if (isAdmin) {
                await updateHiddenBoard();
            }
        } else {
            showToast('删除失败，请重试', 'error');
        }
    } catch (error) {
        console.error('删除留言失败:', error);
        showToast('网络异常，删除失败', 'error');
    }
}

async function createNewBoard(name, id) {
    // 验证ID格式
    if (!/^[a-zA-Z0-9-]+$/.test(id)) {
        showToast('ID只能包含字母、数字和连字符(-)', 'error');
        return;
    }

    if (id.length < 2) {
        showToast('ID至少需要2个字符', 'error');
        return;
    }

    if (boards.includes(id)) {
        showToast('该ID已存在，请使用其他ID', 'error');
        return;
    }

    try {
        // 创建空帖子
        const success = await saveToAPI(id, []);

        if (success) {
            // 添加到帖子列表
            boards.push(id);

            // 更新隐藏帖子
            await updateHiddenBoard();

            // 更新选择器
            updateBoardSelect();

            // 切换到新帖子
            boardSelect.value = id;
            currentBoard = id;
            await loadMessages(currentBoard);

            showToast(`帖子"${name}"创建成功`, 'success');
            closeModal(newBoardModal);
        } else {
            showToast('创建失败，请重试', 'error');
        }
    } catch (error) {
        console.error('创建帖子失败:', error);
        showToast('网络异常，创建失败', 'error');
    }
}

async function deleteCurrentBoard() {
    try {
        const success = await saveToAPI(currentBoard, '');

        if (success) {
            // 从帖子列表中移除
            const index = boards.indexOf(currentBoard);
            if (index > -1) {
                boards.splice(index, 1);
            }

            // 更新隐藏帖子
            await updateHiddenBoard();

            // 切换到默认帖子
            currentBoard = DEFAULT_BOARD;
            updateBoardSelect();
            await loadMessages(currentBoard);

            showToast('帖子删除成功', 'success');
        } else {
            showToast('删除失败，请重试', 'error');
        }
    } catch (error) {
        console.error('删除帖子失败:', error);
        showToast('网络异常，删除失败', 'error');
    }
}

async function updateHiddenBoard() {
    // 检查是否需要更新隐藏帖子（每天一次）
    const lastUpdate = localStorage.getItem('hiddenBoardLastUpdate');
    const today = new Date().toDateString();

    if (lastUpdate === today && !isAdmin) {
        return; // 非管理员且今天已经更新过
    }

    try {
        await saveToAPI('hidden', boards);
        localStorage.setItem('hiddenBoardLastUpdate', today);
    } catch (error) {
        console.error('更新隐藏帖子失败:', error);
    }
}

function adminLogin(password) {
    // 计算SHA-256哈希
    const encoder = new TextEncoder();
    const data = encoder.encode(password);

    return crypto.subtle.digest('SHA-256', data).then(hash => {
        const hashArray = Array.from(new Uint8Array(hash));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // 密码的SHA-256哈希
        const correctHash = '936a185caaa266bb9cbe981e9e05cb78cd732b0b3280eb944412bb6f8f8f07af';

        if (hashHex === correctHash) {
            isAdmin = true;
            adminControls.style.display = 'block';
            showToast('管理员登录成功', 'success');
            closeModal(adminLoginModal);

            // 更新隐藏帖子（每日首次管理员访问）
            updateHiddenBoard();

            return true;
        } else {
            showToast('密码错误', 'error');
            return false;
        }
    });
}

function showDeleteConfirm(index) {
    const message = messages[index];
    document.getElementById('deleteMessage').textContent =
        `您确定要删除"${message.nickname}"的留言吗？此操作无法撤销。`;

    const confirmBtn = document.getElementById('confirmDeleteBtn');
    confirmBtn.onclick = () => {
        deleteMessage(index);
        closeModal(deleteConfirmModal);
    };

    openModal(deleteConfirmModal);
}

function openModal(modal) {
    modal.style.display = 'flex';
}

function closeModal(modal) {
    modal.style.display = 'none';
}

function showToast(message, type = '') {
    toast.textContent = message;
    toast.className = 'toast';

    if (type) {
        toast.classList.add(type);
    }

    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function setupEventListeners() {
    // 用户数据保存
    nicknameInput.addEventListener('change', saveUserData);
    avatarUrlInput.addEventListener('change', saveUserData);

    // 发布留言
    submitMessageBtn.addEventListener('click', submitMessage);

    // 切换帖子
    boardSelect.addEventListener('change', async function () {
        currentBoard = this.value;
        await loadMessages(currentBoard);

        // 如果是管理员，更新隐藏帖子（每日首次访问）
        if (isAdmin) {
            await updateHiddenBoard();
        }
    });

    // 新建帖子
    newBoardBtn.addEventListener('click', () => openModal(newBoardModal));

    // 管理员登录
    adminLoginBtn.addEventListener('click', () => openModal(adminLoginModal));

    // 删除帖子
    deleteBoardBtn.addEventListener('click', () => {
        if (confirm('确定要删除当前帖子吗？此操作将永久删除所有留言！')) {
            deleteCurrentBoard();
        }
    });

    // 创建帖子
    document.getElementById('createBoardBtn').addEventListener('click', () => {
        const name = document.getElementById('boardName').value.trim();
        const id = document.getElementById('boardId').value.trim();

        if (!name) {
            showToast('请输入帖子名称', 'error');
            return;
        }

        if (!id) {
            showToast('请输入帖子ID', 'error');
            return;
        }

        createNewBoard(name, id);
    });

    // 管理员登录
    document.getElementById('loginBtn').addEventListener('click', () => {
        const password = document.getElementById('adminPassword').value;
        if (password) {
            adminLogin(password);
        } else {
            showToast('请输入密码', 'error');
        }
    });

    // 关闭模态框
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', function () {
            closeModal(this.closest('.modal'));
        });
    });

    document.getElementById('cancelDeleteBtn').addEventListener('click', () => {
        closeModal(deleteConfirmModal);
    });

    // 点击模态框外部关闭
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            closeModal(e.target);
        }
    });
}