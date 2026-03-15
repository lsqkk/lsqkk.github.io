const agoraConfig = {
    appId: "195fc077c2f74396968d899b8d5025ff",
    channel: "lsqkk",
    token: "",
    uid: null
};

// 初始化Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// 全局变量
let agoraClient = null;
let remoteUsers = {};
let likeClicked = false;
let viewerId = generateViewerId();
let isConnecting = false;
let currentStreamInfo = null;
let isManualMode = false;
let audioContext = null;
let userAvatarType = 'color';
let userColor = '#4a6cf7';
let userAvatarUrl = '';
let nickname = localStorage.getItem('nickname') || '观众';
const API_BASE = '__API_BASE__';
const fallbackPlaylistUrl = 'https://raw.githubusercontent.com/YanG-1989/m3u/main/Gather.m3u';
const fallbackDefaultName = '咪咕直播 𝟙「移动」';
const fallbackProxyBase = `${API_BASE}/api/stream-proxy?url=`;
let fallbackHls = null;

function showFallbackStream() {
    const placeholder = document.getElementById('video-placeholder');
    const fallbackVideo = document.getElementById('fallback-video');
    const fallbackStatus = document.getElementById('fallback-status');

    if (placeholder) {
        placeholder.style.display = 'block';
    }

    if (fallbackVideo && fallbackVideo.dataset.streamActive === 'true') {
        fallbackVideo.style.display = 'block';
    }

    if (fallbackStatus) {
        fallbackStatus.textContent = '播放中';
    }
}

function hideFallbackStream() {
    const placeholder = document.getElementById('video-placeholder');
    const fallbackVideo = document.getElementById('fallback-video');
    const fallbackStatus = document.getElementById('fallback-status');

    if (placeholder) {
        placeholder.style.display = 'none';
    }

    if (fallbackVideo) {
        fallbackVideo.pause();
        fallbackVideo.removeAttribute('src');
        fallbackVideo.load();
        fallbackVideo.dataset.streamActive = 'false';
    }

    if (fallbackHls) {
        fallbackHls.destroy();
        fallbackHls = null;
    }

    if (fallbackStatus) {
        fallbackStatus.textContent = '已暂停';
    }
}

// 生成唯一观众ID
function generateViewerId() {
    return 'viewer_' + Math.random().toString(36).substr(2, 9);
}

// 更新当前时间
function updateCurrentTime() {
    const now = new Date();
    document.getElementById('current-time').textContent =
        now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

// 检查AgoraRTC是否已加载
function checkAgoraLoaded() {
    if (typeof AgoraRTC === 'undefined') {
        showError('声网Agora SDK加载失败，请刷新页面重试');
        return false;
    }
    return true;
}

function applyUserProfile() {
    const profile = window.QuarkUserProfile && typeof window.QuarkUserProfile.getProfile === 'function'
        ? window.QuarkUserProfile.getProfile()
        : null;
    if (!profile) return;
    if (profile.nickname) nickname = profile.nickname;
    if (profile.avatarUrl) {
        userAvatarType = 'image';
        userAvatarUrl = profile.avatarUrl;
    } else if (profile.avatarColor) {
        userAvatarType = 'color';
        userColor = profile.avatarColor;
    }
    if (window.QuarkUserProfile && typeof window.QuarkUserProfile.syncProfile === 'function') {
        window.QuarkUserProfile.syncProfile({
            nickname,
            avatarType: userAvatarType,
            avatarColor: userColor,
            avatarUrl: userAvatarUrl
        });
    }
}

// 初始化声网Agora客户端
async function initializeAgoraClient() {
    try {
        if (!checkAgoraLoaded()) {
            throw new Error('AgoraRTC SDK未加载');
        }

        agoraClient = AgoraRTC.createClient({
            mode: "live",
            codec: "vp8"
        });

        return agoraClient;
    } catch (error) {
        console.error('初始化Agora客户端失败:', error);
        throw error;
    }
}

// 监听直播状态变化
function initializeStreamListener() {
    console.log("开始监听直播状态...");

    database.ref('live/stream-info').on('value', (snapshot) => {
        const streamInfo = snapshot.val();
        console.log("收到直播状态更新:", streamInfo);

        if (streamInfo && streamInfo.isLive) {
            currentStreamInfo = streamInfo;

            // 更新页面显示的直播标题和描述
            if (streamInfo.title) {
                document.getElementById('stream-title').textContent = streamInfo.title;
                document.title = `${streamInfo.title} - 夸克博客直播间`;
            }

            if (streamInfo.description) {
                document.getElementById('stream-description').textContent = streamInfo.description;
            }

            // 如果有Token且正在直播，尝试连接
            if (streamInfo.token) {
                console.log("检测到直播开始，Token:", streamInfo.token.substring(0, 20) + "...");
                agoraConfig.token = streamInfo.token;
                agoraConfig.channel = streamInfo.channel || "lsqkk";

                if (!isConnecting && !isManualMode) {
                    joinChannel();
                }
            }
        } else {
            // 直播已结束
            handleStreamEnded();
        }
    }, (error) => {
        console.error('监听直播状态失败:', error);
        showError('无法获取直播状态: ' + error.message);
    });
}

// 处理直播结束
function handleStreamEnded() {
    if (agoraClient) {
        leaveChannel();
    }

    const videoElement = document.getElementById('live-video');
    videoElement.style.display = 'none';
    showFallbackStream();

    updateStatus('等待直播');
    showMessage('直播已结束或尚未开始', 'success');
}

// 手动连接模式
function toggleManualPanel() {
    const panel = document.getElementById('manual-panel');
    panel.classList.toggle('active');
}

// 手动连接
function connectManually() {
    const tokenInput = document.getElementById('manual-token').value.trim();
    const channelInput = document.getElementById('manual-channel').value.trim() || "lsqkk";

    if (!tokenInput) {
        showError('请输入Token');
        return;
    }

    isManualMode = true;
    agoraConfig.token = tokenInput;
    agoraConfig.channel = channelInput;

    joinChannel();
    toggleManualPanel();
}

// 加入频道并订阅流
async function joinChannel() {
    if (isConnecting) {
        console.log('正在连接中，跳过重复连接');
        return;
    }

    if (!agoraConfig.token) {
        console.log('等待Token...');
        return;
    }

    try {
        isConnecting = true;
        updateStatus('连接中...');

        await initializeAgoraClient();

        // 设置客户端角色为观众
        await agoraClient.setClientRole("audience");

        // 添加事件监听器
        agoraClient.on("user-published", handleUserPublished);
        agoraClient.on("user-unpublished", handleUserUnpublished);
        agoraClient.on("user-left", handleUserLeft);
        agoraClient.on("connection-state-change", handleConnectionStateChange);

        // 加入频道
        const uid = await agoraClient.join(
            agoraConfig.appId,
            agoraConfig.channel,
            agoraConfig.token,
            null
        );

        console.log("加入频道成功，UID:", uid);
        updateStatus('已连接');
        isConnecting = false;

        // 记录观众信息到Realtime Database
        database.ref('live/viewers/' + viewerId).set({
            timestamp: Date.now(),
            userAgent: navigator.userAgent
        });

    } catch (error) {
        console.error('加入频道失败:', error);
        isConnecting = false;

        if (error.code === 4096) {
            showError('认证失败：Token可能已过期');
        } else if (error.code === 17) {
            showError('加入频道失败：请检查网络连接');
        } else {
            showError('连接失败: ' + error.message);
        }
        updateStatus('连接失败');

        // 5秒后重试
        setTimeout(() => {
            if (currentStreamInfo && currentStreamInfo.isLive) {
                joinChannel();
            }
        }, 5000);
    }
}

// 处理连接状态变化
function handleConnectionStateChange(curState, prevState) {
    console.log('连接状态变化:', prevState, '->', curState);

    if (curState === 'DISCONNECTED' && prevState === 'CONNECTED') {
        showMessage('连接断开，正在尝试重新连接...', 'success');
        updateStatus('重新连接中');

        setTimeout(() => {
            if (currentStreamInfo && currentStreamInfo.isLive) {
                joinChannel();
            }
        }, 3000);
    }
}

// 更新音频状态
function updateAudioStatus(hasAudio) {
    const audioStatusElement = document.getElementById('audio-status');
    if (hasAudio) {
        audioStatusElement.innerHTML = '<i class="fas fa-volume-up"></i> 音频正常';
        audioStatusElement.style.color = '#08d9d6';
    } else {
        audioStatusElement.innerHTML = '<i class="fas fa-volume-mute"></i> 无音频';
        audioStatusElement.style.color = '#ff4757';
    }
}

// 处理用户发布流
async function handleUserPublished(user, mediaType) {
    console.log("用户发布流:", user.uid, mediaType);

    await agoraClient.subscribe(user, mediaType);

    if (mediaType === "video") {
        const videoElement = document.getElementById('live-video');

        user.videoTrack.play(videoElement);

        hideFallbackStream();
        videoElement.style.display = 'block';

        updateStatus('直播中');

        // 尝试自动播放，但捕获可能的错误
        videoElement.play().catch(error => {
            console.log('视频自动播放被阻止，等待用户交互');
        });
    }

    if (mediaType === "audio") {
        console.log("开始播放音频轨道");
        try {
            // 直接播放音频轨道
            user.audioTrack.play();
            console.log("音频播放成功");

            // 设置音量
            if (typeof user.audioTrack.setVolume === 'function') {
                user.audioTrack.setVolume(100);
            }

            // 更新音频状态
            updateAudioStatus(true);

        } catch (audioError) {
            console.error("音频播放失败:", audioError);
        }
    }

    remoteUsers[user.uid] = user;
}

// 处理用户取消发布流
async function handleUserUnpublished(user, mediaType) {
    console.log("用户取消发布流:", user.uid, mediaType);

    if (mediaType === "video") {
        const videoElement = document.getElementById('live-video');

        videoElement.style.display = 'none';
        showFallbackStream();

        updateStatus('直播暂停');
    }
}

// 处理用户离开
async function handleUserLeft(user) {
    console.log("用户离开:", user.uid);

    delete remoteUsers[user.uid];

    if (Object.keys(remoteUsers).length === 0) {
        handleStreamEnded();
    }
}

// 离开频道
async function leaveChannel() {
    if (agoraClient) {
        Object.values(remoteUsers).forEach(user => {
            if (user.videoTrack) user.videoTrack.stop();
            if (user.audioTrack) user.audioTrack.stop();
        });
        remoteUsers = {};

        agoraClient.off("user-published", handleUserPublished);
        agoraClient.off("user-unpublished", handleUserUnpublished);
        agoraClient.off("user-left", handleUserLeft);
        agoraClient.off("connection-state-change", handleConnectionStateChange);

        await agoraClient.leave();
        agoraClient = null;

        console.log("离开频道成功");
        updateStatus('已断开');
    }
}

// 更新状态显示
function updateStatus(status) {
    const statusElement = document.getElementById('status');
    statusElement.textContent = status;

    if (status === '直播中') {
        statusElement.style.background = 'rgba(8, 217, 214, 0.2)';
        statusElement.style.color = '#08d9d6';
    } else if (status === '连接失败' || status === '直播结束') {
        statusElement.style.background = 'rgba(255, 71, 87, 0.2)';
        statusElement.style.color = '#ff4757';
    } else {
        statusElement.style.background = 'rgba(255, 255, 255, 0.1)';
        statusElement.style.color = '#ffffff';
    }
}

// 显示错误信息
function showError(message) {
    const errorElement = document.getElementById('error-message');
    errorElement.textContent = message;
    errorElement.style.display = 'block';
    setTimeout(() => {
        errorElement.style.display = 'none';
    }, 5000);
}

// 显示成功信息
function showMessage(message, type = 'success') {
    console.log(message);
}

// 头像系统初始化
function initializeAvatarSystem() {
    const avatarPreview = document.getElementById('avatar-preview');
    const avatarOptions = document.getElementById('avatar-options');
    const colorToggle = document.getElementById('color-toggle');
    const imageToggle = document.getElementById('image-toggle');
    const colorPicker = document.getElementById('color-picker');
    const avatarUrl = document.getElementById('avatar-url');
    const nicknameInput = document.getElementById('nickname');

    // 从本地存储加载用户设置
    const savedAvatarType = localStorage.getItem('avatarType');
    const savedColor = localStorage.getItem('avatarColor');
    const savedAvatarUrl = localStorage.getItem('avatarUrl');
    const savedNickname = localStorage.getItem('nickname');

    if (savedAvatarType) userAvatarType = savedAvatarType;
    if (savedColor) userColor = savedColor;
    if (savedAvatarUrl) userAvatarUrl = savedAvatarUrl;
    if (savedNickname) nickname = savedNickname;

    // 更新UI
    updateAvatarPreview();

    // 头像预览点击事件
    avatarPreview.addEventListener('click', function () {
        avatarOptions.classList.toggle('active');
    });

    // 颜色/图片切换
    colorToggle.addEventListener('click', function () {
        userAvatarType = 'color';
        colorToggle.classList.add('active');
        imageToggle.classList.remove('active');
        colorPicker.style.display = 'flex';
        avatarUrl.style.display = 'none';
        updateAvatarPreview();
        saveAvatarSettings();
    });

    imageToggle.addEventListener('click', function () {
        userAvatarType = 'image';
        imageToggle.classList.add('active');
        colorToggle.classList.remove('active');
        colorPicker.style.display = 'none';
        avatarUrl.style.display = 'block';
        updateAvatarPreview();
        saveAvatarSettings();
    });

    // 颜色选择
    document.querySelectorAll('.color-option').forEach(option => {
        option.addEventListener('click', function () {
            document.querySelectorAll('.color-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            this.classList.add('selected');
            userColor = this.style.backgroundColor;
            updateAvatarPreview();
            saveAvatarSettings();
        });
    });

    // 图片URL输入
    avatarUrl.addEventListener('input', function () {
        userAvatarUrl = this.value;
        updateAvatarPreview();
        saveAvatarSettings();
    });

    // 昵称输入
    nicknameInput.value = nickname;
    nicknameInput.addEventListener('input', function () {
        nickname = this.value;
        localStorage.setItem('nickname', nickname);
        updateAvatarPreview();
        if (window.QuarkUserProfile && typeof window.QuarkUserProfile.syncProfile === 'function') {
            window.QuarkUserProfile.syncProfile({
                nickname,
                avatarType: userAvatarType,
                avatarColor: userColor,
                avatarUrl: userAvatarUrl
            });
        }
    });

    // 点击页面其他区域关闭头像选项
    document.addEventListener('click', function (e) {
        if (!avatarPreview.contains(e.target) && !avatarOptions.contains(e.target)) {
            avatarOptions.classList.remove('active');
        }
    });
}

// 更新头像预览
function updateAvatarPreview() {
    const avatarPreview = document.getElementById('avatar-preview');

    if (userAvatarType === 'color') {
        avatarPreview.style.background = userColor;
        avatarPreview.style.backgroundImage = 'none';
        avatarPreview.textContent = nickname ? nickname[0].toUpperCase() : 'A';
    } else {
        if (userAvatarUrl && (userAvatarUrl.endsWith('.jpg') || userAvatarUrl.endsWith('.png') || userAvatarUrl.endsWith('.webp'))) {
            avatarPreview.style.backgroundImage = `url(${userAvatarUrl})`;
            avatarPreview.textContent = '';
        } else {
            avatarPreview.style.background = userColor;
            avatarPreview.style.backgroundImage = 'none';
            avatarPreview.textContent = nickname ? nickname[0].toUpperCase() : 'A';
        }
    }
}

// 保存头像设置
function saveAvatarSettings() {
    localStorage.setItem('avatarType', userAvatarType);
    localStorage.setItem('avatarColor', userColor);
    localStorage.setItem('avatarUrl', userAvatarUrl);
    if (window.QuarkUserProfile && typeof window.QuarkUserProfile.syncProfile === 'function') {
        window.QuarkUserProfile.syncProfile({
            nickname,
            avatarType: userAvatarType,
            avatarColor: userColor,
            avatarUrl: userAvatarUrl
        });
    }
}

// Firebase实时聊天功能
function initializeChat() {
    const messagesElement = document.getElementById('messages');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-btn');
    const useMarkdown = document.getElementById('use-markdown');

    // 监听新消息
    database.ref('live/chat').on('child_added', (snapshot) => {
        const message = snapshot.val();
        addMessageToChat(message);
        updateMessageCount();
    });

    function sendMessage() {
        const message = messageInput.value.trim();
        if (message) {
            database.ref('live/chat').push({
                text: message,
                timestamp: Date.now(),
                user: nickname || '观众',
                avatar: userAvatarType === 'color' ? userColor : userAvatarUrl,
                avatarType: userAvatarType,
                isMarkdown: useMarkdown.checked,
                viewerId: viewerId
            });
            messageInput.value = '';
        }
    }

    sendButton.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
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
                <div class="message-content">${messageData.isMarkdown ? marked.parse(messageData.text) : messageData.text.replace(/\n/g, '<br>')}</div>
            `;

    messagesElement.appendChild(messageElement);
    messagesElement.scrollTop = messagesElement.scrollHeight;
}

// 点赞功能
function initializeLikes() {
    const likeButton = document.getElementById('like-btn');
    const likeCountElement = document.getElementById('like-count');

    // 监听点赞数变化
    database.ref('live/stats/likes').on('value', (snapshot) => {
        const likes = snapshot.val();
        likeCountElement.textContent = likes || 0;
    });

    // 处理点赞点击
    likeButton.addEventListener('click', () => {
        if (!likeClicked) {
            database.ref('live/stats/likes').transaction((currentLikes) => {
                return (currentLikes || 0) + 1;
            });

            likeButton.classList.add('liked');
            likeButton.innerHTML = '<i class="fas fa-heart"></i> 已点赞';
            likeClicked = true;

            setTimeout(() => {
                likeButton.classList.remove('liked');
                likeButton.innerHTML = '<i class="fas fa-heart"></i> 点赞';
                likeClicked = false;
            }, 3000);
        }
    });
}

// 更新消息计数
function updateMessageCount() {
    const messages = document.querySelectorAll('.message');
    document.getElementById('message-count').textContent = messages.length - 1;
    document.getElementById('message-count-stat').textContent = messages.length - 1;
}

// 观众计数
function initializeViewerCount() {
    const viewerCountElement = document.getElementById('viewer-count');

    // 记录观众进入
    database.ref('live/viewers/' + viewerId).set({
        timestamp: Date.now(),
        userAgent: navigator.userAgent
    });

    // 监听在线观众数
    database.ref('live/viewers').on('value', (snapshot) => {
        const viewers = snapshot.val();
        const viewerCount = viewers ? Object.keys(viewers).length : 0;
        viewerCountElement.textContent = viewerCount;
    });
}

// 控制功能
function toggleFullscreen() {
    const videoContainer = document.querySelector('.video-container');
    if (!document.fullscreenElement) {
        videoContainer.requestFullscreen().catch(err => {
            console.log(`全屏错误: ${err.message}`);
        });
    } else {
        document.exitFullscreen();
    }
}

// 静音切换功能
function toggleMute() {
    const video = document.getElementById('live-video');
    video.muted = !video.muted;

    // 同时静音所有音频轨道
    Object.values(remoteUsers).forEach(user => {
        if (user.audioTrack) {
            user.audioTrack.setVolume(video.muted ? 0 : 100);
        }
    });

    showMessage(video.muted ? '已静音' : '已取消静音', 'success');
}

function copyInviteLink() {
    const inviteLink = window.location.href;
    navigator.clipboard.writeText(inviteLink).then(() => {
        showMessage('邀请链接已复制到剪贴板', 'success');
    });
}

// 重新连接功能
function reconnect() {
    showMessage('尝试重新连接...', 'success');
    leaveChannel().then(() => {
        joinChannel();
    });
}

// 音频测试功能
function testAudio() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    // 恢复 AudioContext 如果被暂停
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }

    try {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.type = 'sine';
        oscillator.frequency.value = 440;
        gainNode.gain.value = 0.1;

        oscillator.start();
        setTimeout(() => {
            oscillator.stop();
            showMessage('音频测试完成', 'success');
        }, 500);
    } catch (error) {
        console.error('播放测试音调失败:', error);
        showMessage('音频测试失败', 'error');
    }
}

// 自动播放失败处理
function setupAutoplayFailureHandler() {
    AgoraRTC.onAutoplayFailed = () => {
        console.log('自动播放失败，显示用户交互提示');
        showAutoplayPrompt();
    };
}

// 显示自动播放提示
function showAutoplayPrompt() {
    const prompt = document.createElement('div');
    prompt.className = 'autoplay-prompt';
    prompt.id = 'autoplay-prompt';

    prompt.innerHTML = `
                <div class="autoplay-content">
                    <h3>🔊 需要启用音频</h3>
                    <p>请点击下方按钮启用直播音频</p>
                    <button id="enable-audio-btn">启用音频</button>
                </div>
            `;

    document.body.appendChild(prompt);

    // 添加按钮点击事件
    document.getElementById('enable-audio-btn').addEventListener('click', function () {
        resumeAllAudioTracks();
        document.body.removeChild(prompt);
    });
}

// 恢复所有音频轨道
function resumeAllAudioTracks() {
    console.log('恢复音频播放...');

    // 恢复远程用户的音频轨道
    Object.values(remoteUsers).forEach(user => {
        if (user.audioTrack) {
            try {
                user.audioTrack.play();
                if (typeof user.audioTrack.setVolume === 'function') {
                    user.audioTrack.setVolume(100);
                }
                console.log('恢复音频轨道:', user.uid);
            } catch (error) {
                console.error('恢复音频轨道失败:', error);
            }
        }
    });

    // 恢复视频元素的音频
    const videoElement = document.getElementById('live-video');
    if (videoElement) {
        videoElement.play().catch(e => {
            console.log('视频播放恢复失败:', e);
        });
    }

    // 恢复 AudioContext
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
            console.log('AudioContext 已恢复');
        });
    }

    updateAudioStatus(true);
    showMessage('音频已启用', 'success');
}

function parseM3U(text) {
    const lines = text.split(/\r?\n/);
    const channels = [];
    let currentMeta = null;

    lines.forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        if (trimmed.startsWith('#EXTINF')) {
            const nameMatch = trimmed.match(/,(.*)$/);
            const name = nameMatch ? nameMatch[1].trim() : '未命名频道';
            currentMeta = { name };
            return;
        }
        if (!trimmed.startsWith('#') && currentMeta) {
            const url = trimmed;
            channels.push({ name: currentMeta.name, url });
            currentMeta = null;
        }
    });

    return channels;
}

function setFallbackStatus(message, isError = false) {
    const fallbackStatus = document.getElementById('fallback-status');
    if (!fallbackStatus) return;
    fallbackStatus.textContent = message;
    if (isError) {
        fallbackStatus.style.background = 'rgba(255, 71, 87, 0.2)';
        fallbackStatus.style.color = '#ff4757';
        fallbackStatus.style.borderColor = 'rgba(255, 71, 87, 0.4)';
    } else {
        fallbackStatus.style.background = 'rgba(8, 217, 214, 0.15)';
        fallbackStatus.style.color = 'var(--secondary-color)';
        fallbackStatus.style.borderColor = 'rgba(8, 217, 214, 0.35)';
    }
}

async function loadFallbackPlaylist() {
    const select = document.getElementById('fallback-select');
    if (!select) return;

    select.innerHTML = '';
    setFallbackStatus('加载中...');

    try {
        const proxiedPlaylist = `${fallbackProxyBase}${encodeURIComponent(fallbackPlaylistUrl)}`;
        const response = await fetch(proxiedPlaylist, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error('播放列表加载失败');
        }
        const text = await response.text();
        const channels = parseM3U(text);
        if (!channels.length) {
            throw new Error('未解析到可用频道');
        }

        channels.forEach((channel) => {
            const option = document.createElement('option');
            option.value = channel.url;
            option.textContent = channel.name;
            select.appendChild(option);
        });

        let defaultOption = Array.from(select.options).find(opt => opt.textContent.includes(fallbackDefaultName));
        if (!defaultOption) {
            defaultOption = select.options[0];
        }
        if (defaultOption) {
            select.value = defaultOption.value;
            playFallbackStream(defaultOption.value);
        }
    } catch (error) {
        console.error('加载备用播放列表失败:', error);
        setFallbackStatus('加载失败', true);
    }
}

function playFallbackStream(url) {
    const video = document.getElementById('fallback-video');
    if (!video || !url) return;

    video.dataset.streamActive = 'true';
    setFallbackStatus('连接中...');

    if (fallbackHls) {
        fallbackHls.destroy();
        fallbackHls = null;
    }

    const proxiedUrl = `${fallbackProxyBase}${encodeURIComponent(url)}`;
    if (Hls.isSupported()) {
        fallbackHls = new Hls({
            lowLatencyMode: true,
            backBufferLength: 30
        });
        fallbackHls.loadSource(proxiedUrl);
        fallbackHls.attachMedia(video);
        fallbackHls.on(Hls.Events.MANIFEST_PARSED, () => {
            video.play().catch(() => {
                setFallbackStatus('等待播放');
            });
        });
        fallbackHls.on(Hls.Events.ERROR, () => {
            setFallbackStatus('播放失败', true);
        });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = proxiedUrl;
        video.addEventListener('loadedmetadata', () => {
            video.play().catch(() => {
                setFallbackStatus('等待播放');
            });
        }, { once: true });
    } else {
        setFallbackStatus('不支持播放', true);
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function () {
    applyUserProfile();
    updateCurrentTime();
    setInterval(updateCurrentTime, 60000);

    // 初始化Firebase监听
    initializeStreamListener();

    // 初始化音频处理
    setupAutoplayFailureHandler();

    // 初始化头像系统
    initializeAvatarSystem();

    // 初始化Firebase功能
    initializeChat();
    initializeLikes();
    initializeViewerCount();

    // 初始化备用频道播放列表
    loadFallbackPlaylist();
    const fallbackSelect = document.getElementById('fallback-select');
    const fallbackReload = document.getElementById('fallback-reload');
    if (fallbackSelect) {
        fallbackSelect.addEventListener('change', (event) => {
            playFallbackStream(event.target.value);
        });
    }
    if (fallbackReload) {
        fallbackReload.addEventListener('click', loadFallbackPlaylist);
    }

    // 初始化AudioContext
    document.addEventListener('click', function initAudio() {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        document.removeEventListener('click', initAudio);
    }, { once: true });

    // 清理过期观众记录
    setInterval(() => {
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
        database.ref('live/viewers').once('value').then((snapshot) => {
            const updates = {};
            snapshot.forEach((childSnapshot) => {
                if (childSnapshot.val().timestamp < fiveMinutesAgo) {
                    updates[childSnapshot.key] = null;
                }
            });
            database.ref('live/viewers').update(updates);
        });
    }, 60000);
});
