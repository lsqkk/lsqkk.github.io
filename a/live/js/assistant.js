// Firebase配置
const firebaseConfig = {
    apiKey: "AIzaSyAeSI1akqwsPBrVyv7YKirV06fqdkL3YNI",
    authDomain: "quark-b7305.firebaseapp.com",
    databaseURL: "https://quark-b7305-default-rtdb.firebaseio.com",
    projectId: "quark-b7305",
    storageBucket: "quark-b7305.firebasestorage.app",
    messagingSenderId: "843016834358",
    appId: "1:843016834358:web:9438c729be28c4d492f797",
    measurementId: "G-5BVT26KRT6"
};

// 初始化Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// 更新流信息（由主窗口调用）
function updateStreamInfo(info) {
    if (info.title) {
        document.getElementById('stream-title').textContent = info.title;
    }
    if (info.channel) {
        document.getElementById('channel-name').textContent = info.channel;
    }
    if (info.viewerUrl) {
        document.getElementById('viewer-url').textContent = info.viewerUrl;
    }
}

// 发送聊天消息
function sendChatMessage() {
    const messageInput = document.getElementById('chat-message-input');
    const message = messageInput.value.trim();

    if (message) {
        database.ref('live/chat').push({
            text: message,
            timestamp: Date.now(),
            user: '蓝色奇夸克',
            avatar: '/assets/img/touxiang.png',
            avatarType: 'image',
            isMarkdown: false
        });
        messageInput.value = '';
    }
}

// 初始化数据监听
function initializeStats() {
    // 监听观众数
    database.ref('live/viewers').on('value', (snapshot) => {
        const viewers = snapshot.val();
        const viewerCount = viewers ? Object.keys(viewers).length : 0;
        document.getElementById('viewer-count').textContent = viewerCount;
    });

    // 监听点赞数
    database.ref('live/stats/likes').on('value', (snapshot) => {
        const likes = snapshot.val();
        document.getElementById('like-count').textContent = likes || 0;
    });

    // 监听消息数
    database.ref('live/chat').on('value', (snapshot) => {
        const messages = snapshot.val();
        const messageCount = messages ? Object.keys(messages).length : 0;
        document.getElementById('message-count').textContent = messageCount;
        document.getElementById('chat-count').textContent = messageCount;
    });
}

// 初始化聊天监听
function initializeChat() {
    const messagesElement = document.getElementById('messages');

    // 监听新消息
    database.ref('live/chat').on('child_added', (snapshot) => {
        const message = snapshot.val();
        addMessageToChat(message);
    });
}

// 添加消息到聊天窗口
function addMessageToChat(messageData) {
    const messagesElement = document.getElementById('messages');
    const messageElement = document.createElement('div');
    messageElement.className = 'message';

    const time = new Date(messageData.timestamp).toLocaleTimeString('zh-CN', {
        hour: '2-digit', minute: '2-digit'
    });

    const avatarStyle = messageData.avatarType === 'color' ?
        `background: ${messageData.avatar}` :
        `background-image: url(${messageData.avatar})`;

    const avatarContent = messageData.avatarType === 'color' ?
        (messageData.user ? messageData.user[0].toUpperCase() : '?') : '';

    messageElement.innerHTML = `
                <div class="message-header">
                    <div class="message-avatar" style="${avatarStyle}">${avatarContent}</div>
                    <span class="user">${messageData.user || '观众'}</span>
                    <span class="time">${time}</span>
                </div>
                <div class="message-content">${messageData.text}</div>
            `;

    messagesElement.appendChild(messageElement);
    messagesElement.scrollTop = messagesElement.scrollHeight;
}

// 复制观看地址
function copyViewerUrl() {
    const url = document.getElementById('viewer-url').textContent;
    navigator.clipboard.writeText(url).then(() => {
        alert('观看地址已复制到剪贴板');
    });
}

// 复制频道名称
function copyChannelName() {
    const channelName = document.getElementById('channel-name').textContent;
    navigator.clipboard.writeText(channelName).then(() => {
        alert('频道名称已复制到剪贴板');
    });
}

// 停止直播（通知主窗口）
function stopStreaming() {
    if (window.opener && !window.opener.closed) {
        window.opener.stopStreaming();
    } else {
        alert('无法连接到主窗口，请在主窗口中停止直播');
    }
}

// 更新当前时间
function updateCurrentTime() {
    const now = new Date();
    document.getElementById('current-time').textContent =
        now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function () {
    // 初始化数据监听
    initializeStats();
    initializeChat();

    // 事件监听
    document.getElementById('stop-stream-btn').addEventListener('click', stopStreaming);
    document.getElementById('copy-url-btn').addEventListener('click', copyViewerUrl);
    document.getElementById('copy-channel-btn').addEventListener('click', copyChannelName);

    // 聊天发送按钮事件
    document.getElementById('chat-send-btn').addEventListener('click', sendChatMessage);
    document.getElementById('chat-message-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendChatMessage();
        }
    });

    // 更新当前时间
    updateCurrentTime();
    setInterval(updateCurrentTime, 60000);

    // 监听直播时长
    setInterval(() => {
        database.ref('live/stream-info').once('value').then((snapshot) => {
            const streamInfo = snapshot.val();
            if (streamInfo && streamInfo.startTime) {
                const duration = Math.floor((Date.now() - streamInfo.startTime) / 1000);
                const minutes = Math.floor(duration / 60);
                const seconds = duration % 60;
                document.getElementById('stream-duration').textContent =
                    `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
        });
    }, 1000);
});

// 暴露函数给主窗口调用
window.updateStreamInfo = updateStreamInfo;