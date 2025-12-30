// Firebase 配置
const firebaseConfig = {
    apiKey: "AIzaSyAeSI1akqwsPBrVyv7YKirV06fqdkL3YNI",
    authDomain: "quark-b7305.firebaseapp.com",
    projectId: "quark-b7305",
    storageBucket: "quark-b7305.firebasestorage.app",
    messagingSenderId: "843016834358",
    appId: "1:843016834358:web:9438c729be28c4d492f797",
    measurementId: "G-5BVT26KRT6"
};

// 初始化 Firebase
firebase.initializeApp(firebaseConfig);

// 全局变量
let roomName = '';
let messagesRef = null;
let userColor = localStorage.getItem('userColor') || '#40E0D0';
let nickname = localStorage.getItem('nickname') || '';
let roomJoinTime = null;
let isAtBottom = true;
let recentRooms = JSON.parse(localStorage.getItem('recentRooms') || '[]');

// DOM 加载完成后初始化
document.addEventListener('DOMContentLoaded', function () {
    // 初始化主题
    initTheme();

    // 初始化移动端菜单按钮
    document.getElementById('mobileMenuBtn').addEventListener('click', toggleSidebar);

    // 初始化主题切换按钮
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);

    // 初始化最近聊天室列表
    updateRecentRoomsList();

    // 请求通知权限
    requestNotificationPermission();

    // 监听消息容器滚动
    const messagesContainer = document.getElementById('messagesContainer');
    messagesContainer.addEventListener('scroll', function () {
        const { scrollTop, scrollHeight, clientHeight } = messagesContainer;
        isAtBottom = scrollHeight - scrollTop === clientHeight;
    });

    // 如果已有昵称，隐藏个人资料设置
    if (nickname) {
        document.getElementById('profileSetup').style.display = 'none';
    }
});

// 初始化主题
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.body.className = savedTheme + '-mode';
    updateThemeIcon(savedTheme);
}

// 切换主题
function toggleTheme() {
    const isDark = document.body.classList.contains('dark-mode');
    const newTheme = isDark ? 'light' : 'dark';

    document.body.classList.remove(isDark ? 'dark-mode' : 'light-mode');
    document.body.classList.add(newTheme + '-mode');
    localStorage.setItem('theme', newTheme);

    updateThemeIcon(newTheme);
}

// 更新主题图标
function updateThemeIcon(theme) {
    const icon = document.getElementById('themeToggle').querySelector('i');
    icon.className = theme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
}

// 切换侧边栏（移动端）
function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
}

// 更新最近聊天室列表
function updateRecentRoomsList() {
    const roomList = document.getElementById('roomList');

    if (recentRooms.length === 0) {
        roomList.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">
                            <i class="fas fa-comments"></i>
                        </div>
                        <p>暂无聊天室</p>
                    </div>
                `;
        return;
    }

    roomList.innerHTML = '';
    recentRooms.forEach(room => {
        const roomItem = document.createElement('div');
        roomItem.className = 'room-item';
        roomItem.innerHTML = `
                    <i class="fas fa-hashtag room-icon"></i>
                    <span>${room}</span>
                `;
        roomItem.addEventListener('click', () => {
            document.getElementById('roomInput').value = room;
            joinRoom();
        });
        roomList.appendChild(roomItem);
    });
}

// 添加最近聊天室
function addRecentRoom(room) {
    if (!recentRooms.includes(room)) {
        recentRooms.unshift(room);
        if (recentRooms.length > 5) {
            recentRooms = recentRooms.slice(0, 5);
        }
        localStorage.setItem('recentRooms', JSON.stringify(recentRooms));
        updateRecentRoomsList();
    }
}

// 加入房间
function joinRoom() {
    roomName = document.getElementById('roomInput').value.trim();
    if (!roomName) return;

    // 添加到最近聊天室
    addRecentRoom(roomName);

    // 更新当前房间标题
    document.getElementById('currentRoomTitle').textContent = `房间: ${roomName}`;

    // 记录加入时间
    roomJoinTime = Date.now();

    // 如果已有昵称，直接初始化聊天
    if (nickname) {
        initializeChat();
    } else {
        // 否则显示个人资料设置
        document.getElementById('profileSetup').style.display = 'block';
        document.getElementById('nicknameInput').value = nickname;

        // 标记当前选中的颜色
        document.querySelectorAll('.color-option').forEach(opt => {
            opt.classList.toggle('selected', opt.style.background === userColor);
        });

        // 滚动到个人资料设置
        document.getElementById('messagesContainer').scrollTo(0, document.getElementById('messagesContainer').scrollHeight);
    }

    // 关闭移动端侧边栏
    document.getElementById('sidebar').classList.remove('open');
}

// 选择颜色
function selectColor(element) {
    document.querySelectorAll('.color-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    element.classList.add('selected');
    userColor = element.style.backgroundColor;
}

// 保存个人资料
function saveProfile() {
    nickname = document.getElementById('nicknameInput').value.trim();
    if (!nickname) return;

    localStorage.setItem('nickname', nickname);
    localStorage.setItem('userColor', userColor);

    initializeChat();
}

// 初始化聊天
function initializeChat() {
    // 隐藏个人资料设置
    document.getElementById('profileSetup').style.display = 'none';

    // 显示输入区域
    document.getElementById('inputArea').style.display = 'flex';

    // 清空消息列表
    document.getElementById('messagesList').innerHTML = '';

    // 初始化 Firebase 引用
    messagesRef = firebase.database().ref(`chatrooms/${roomName}/messages`);

    // 监听消息
    messagesRef.on('child_added', snapshot => {
        const { text, nickname, color, timestamp } = snapshot.val();
        addMessageToChat(text, nickname, color, timestamp);

        // 如果用户在看最新消息，自动滚动到底部
        if (isAtBottom) {
            scrollToBottom();
        }

        // 如果是15秒后收到的新消息且不是自己发送的，显示通知
        if (roomJoinTime && timestamp > roomJoinTime + 15000) {
            if (nickname !== localStorage.getItem('nickname')) {
                showNotification(`新消息来自 ${nickname}`, text);
            }
        }
    });

    // 滚动到底部
    scrollToBottom();
}

// 添加消息到聊天界面
function addMessageToChat(text, nickname, color, timestamp) {
    const li = document.createElement('li');
    li.className = 'message-item';

    const date = new Date(timestamp);
    const dateStr = date.toLocaleDateString();
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    li.innerHTML = `
                <div class="avatar" style="background: ${color}">${nickname[0].toUpperCase()}</div>
                <div class="message-content">
                    <div class="message-header">
                        <span class="username">${nickname}</span>
                        <span class="timestamp">${dateStr} ${timeStr}</span>
                    </div>
                    <div>${text}</div>
                </div>
            `;

    document.getElementById('messagesList').appendChild(li);
}

// 发送消息
function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    const messageText = messageInput.value.trim();

    if (!messageText || !roomName || !nickname) return;

    const message = {
        text: messageText,
        nickname: nickname,
        color: userColor,
        timestamp: Date.now()
    };

    messagesRef.push(message);
    messageInput.value = '';

    // 滚动到底部
    scrollToBottom();
}

// 处理键盘事件（按Enter发送消息）
function handleKeyPress(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}

// 滚动到底部
function scrollToBottom() {
    const messagesContainer = document.getElementById('messagesContainer');
    messagesContainer.scrollTo(0, messagesContainer.scrollHeight);
    isAtBottom = true;
}

// 请求通知权限
function requestNotificationPermission() {
    if (!('Notification' in window)) {
        console.log('当前浏览器不支持通知功能');
        return;
    }

    if (Notification.permission === 'granted') {
        console.log('通知权限已授予');
    } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                console.log('通知权限已授予');
            } else {
                console.log('通知权限被拒绝');
            }
        });
    } else {
        console.log('通知权限被拒绝，需手动启用');
    }
}

// 显示通知
function showNotification(title, body) {
    if (Notification.permission === 'granted') {
        new Notification(title, {
            body: body,
            icon: '/assets/img/logo_blue.png'
        });
    }
}