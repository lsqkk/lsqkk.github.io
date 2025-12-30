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

// 声网Agora配置
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
let localTracks = {
    videoTrack: null,
    audioTrack: null
};
let agoraClient = null;
let streamStartTime = null;
let streamDurationInterval = null;
let isStreaming = false;
let isPreviewing = false;
let currentVideoSource = 'camera'; // 'camera' 或 'screen'
let assistantWindow = null;

// 显示消息
function showMessage(message, type = 'error') {
    const errorElement = document.getElementById('error-message');
    const successElement = document.getElementById('success-message');

    if (type === 'error') {
        errorElement.textContent = message;
        errorElement.classList.remove('hidden');
        successElement.classList.add('hidden');
    } else {
        successElement.textContent = message;
        successElement.classList.remove('hidden');
        errorElement.classList.add('hidden');
    }

    setTimeout(() => {
        errorElement.classList.add('hidden');
        successElement.classList.add('hidden');
    }, 5000);
}

// 获取设备列表
async function getDevices() {
    try {
        // 首先请求麦克风权限
        await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoSelect = document.getElementById('video-source');
        const audioSelect = document.getElementById('audio-source');

        videoSelect.innerHTML = '<option value="">选择摄像头</option>';
        audioSelect.innerHTML = '<option value="">选择麦克风</option>';

        let hasAudioDevices = false;

        devices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.text = device.label || `${device.kind} ${videoSelect.length}`;

            if (device.kind === 'videoinput') {
                videoSelect.appendChild(option);
            } else if (device.kind === 'audioinput') {
                audioSelect.appendChild(option);
                hasAudioDevices = true;
            }
        });

        if (!hasAudioDevices) {
            showMessage('未检测到音频输入设备，请检查麦克风连接', 'error');
        }

    } catch (error) {
        console.error('获取设备列表失败:', error);
        showMessage('无法获取设备列表: ' + error.message);
    }
}

// 开始视频预览
async function startPreview() {
    // 停止之前的轨道
    if (localTracks.videoTrack) {
        localTracks.videoTrack.close();
        localTracks.videoTrack = null;
    }
    if (localTracks.audioTrack) {
        localTracks.audioTrack.close();
        localTracks.audioTrack = null;
    }

    // 根据分辨率设置编码配置
    const resolution = document.getElementById('resolution').value;
    let encoderConfig;
    switch (resolution) {
        case '480p':
            encoderConfig = '480p';
            break;
        case '720p':
            encoderConfig = '720p';
            break;
        case '1080p':
            encoderConfig = '1080p';
            break;
        default:
            encoderConfig = '720p';
    }

    try {
        if (currentVideoSource === 'camera') {
            // 摄像头模式
            const videoSource = document.getElementById('video-source').value;
            const audioSource = document.getElementById('audio-source').value;

            // 创建本地音视频轨道
            localTracks.videoTrack = await AgoraRTC.createCameraVideoTrack({
                encoderConfig: encoderConfig,
                cameraId: videoSource || undefined
            });

            try {
                localTracks.audioTrack = await AgoraRTC.createMicrophoneAudioTrack({
                    microphoneId: audioSource || undefined,
                    AEC: true,  // 回声消除
                    AGC: true,  // 自动增益控制
                    ANS: true   // 噪音抑制
                });
                console.log("音频轨道创建成功");
                updateStatus('audio-status', '正常');
            } catch (audioError) {
                console.error("音频轨道创建失败:", audioError);
                showMessage('无法访问麦克风: ' + audioError.message);
                localTracks.audioTrack = await AgoraRTC.createMicrophoneAudioTrack({
                    microphoneId: 'default',
                }).catch(() => {
                    console.log("无法创建备用音频轨道");
                    localTracks.audioTrack = null;
                });
                updateStatus('audio-status', '警告 - 使用默认设备');
            }
        } else {
            // 屏幕共享模式
            try {
                // 获取屏幕共享流
                const screenStream = await navigator.mediaDevices.getDisplayMedia({
                    video: true,
                    audio: false // 不捕获屏幕音频，使用麦克风
                });

                // 创建视频轨道
                localTracks.videoTrack = await AgoraRTC.createCustomVideoTrack({
                    mediaStreamTrack: screenStream.getVideoTracks()[0]
                });

                try {
                    // 使用用户选择的音频源创建麦克风音频轨道
                    const audioSource = document.getElementById('audio-source').value;
                    localTracks.audioTrack = await AgoraRTC.createMicrophoneAudioTrack({
                        microphoneId: audioSource || undefined,
                        AEC: true,
                        AGC: true,
                        ANS: true
                    });
                    updateStatus('audio-status', '正常');
                } catch (error) {
                    console.error("无法创建麦克风音频轨道:", error);
                    localTracks.audioTrack = null;
                    updateStatus('audio-status', '无音频');
                }

                // 监听屏幕共享停止事件
                screenStream.getVideoTracks()[0].onended = () => {
                    if (isStreaming) {
                        stopStreaming();
                    }
                    stopPreview();
                    showMessage('屏幕共享已结束', 'success');
                };

            } catch (screenError) {
                console.error('屏幕共享失败:', screenError);
                showMessage('屏幕共享失败: ' + screenError.message);
                updateStatus('video-status', '错误');
                updateStatus('audio-status', '错误');
                return;
            }
        }

        const videoElement = document.getElementById('local-video');
        const placeholder = document.getElementById('preview-placeholder');

        // 播放本地视频轨道
        localTracks.videoTrack.play(videoElement);
        placeholder.classList.add('hidden');
        videoElement.classList.remove('hidden');

        updateStatus('video-status', '正常');
        isPreviewing = true;
        document.getElementById('start-preview-btn').innerHTML = '<i class="fas fa-stop"></i> 停止预览';
        document.getElementById('start-btn').disabled = false;

    } catch (error) {
        console.error('启动预览失败:', error);
        showMessage('无法访问摄像头或麦克风: ' + error.message);
        updateStatus('video-status', '错误');
        updateStatus('audio-status', '错误');
    }
}

// 停止预览
function stopPreview() {
    if (localTracks.videoTrack) {
        localTracks.videoTrack.close();
        localTracks.videoTrack = null;
    }
    if (localTracks.audioTrack) {
        localTracks.audioTrack.close();
        localTracks.audioTrack = null;
    }

    const videoElement = document.getElementById('local-video');
    const placeholder = document.getElementById('preview-placeholder');

    placeholder.classList.remove('hidden');
    videoElement.classList.add('hidden');

    updateStatus('video-status', '未连接');
    updateStatus('audio-status', '未连接');
    isPreviewing = false;
    document.getElementById('start-preview-btn').innerHTML = '<i class="fas fa-play"></i> 开始预览';
    document.getElementById('start-btn').disabled = true;
}

// 切换视频源
function toggleVideoSource(source) {
    currentVideoSource = source;

    // 更新按钮状态
    document.getElementById('camera-source-btn').classList.toggle('active', source === 'camera');
    document.getElementById('screen-source-btn').classList.toggle('active', source === 'screen');

    // 显示/隐藏相关控件
    const videoSourceSelect = document.getElementById('video-source');
    const audioSourceSelect = document.getElementById('audio-source');

    if (source === 'camera') {
        videoSourceSelect.parentElement.style.display = 'block';
        audioSourceSelect.parentElement.style.display = 'block';
    } else {
        // 屏幕共享模式下：隐藏视频源选择，但显示音频源选择
        videoSourceSelect.parentElement.style.display = 'none';
        audioSourceSelect.parentElement.style.display = 'block'; // 保持显示
    }

    // 如果正在预览，重新开始预览
    if (isPreviewing) {
        stopPreview();
        setTimeout(() => startPreview(), 500);
    }
}

// 更新状态显示
function updateStatus(elementId, status) {
    const element = document.getElementById(elementId);
    element.textContent = status;

    if (status === '正常') {
        element.style.color = '#2ed573';
    } else if (status === '错误') {
        element.style.color = '#ff4757';
    } else {
        element.style.color = '#ffa502';
    }
}

// 初始化Agora客户端
async function initializeAgoraClient() {
    if (!agoraClient) {
        // 创建Agora客户端
        agoraClient = AgoraRTC.createClient({
            mode: "live",
            codec: "vp8"
        });
    }
    return agoraClient;
}

// 验证Token格式
function validateToken(token) {
    if (!token || token.trim() === '') {
        return { valid: false, message: 'Token不能为空' };
    }

    if (token.length < 10) {
        return { valid: false, message: 'Token格式不正确，长度太短' };
    }

    return { valid: true, message: 'Token格式正确' };
}

// 打开直播助手窗口
function openAssistantWindow() {
    if (assistantWindow && !assistantWindow.closed) {
        assistantWindow.focus();
        return;
    }

    const width = 400;
    const height = 600;
    const left = (screen.width - width) / 2;
    const top = (screen.height - height) / 2;

    assistantWindow = window.open('assistant.html', '直播助手',
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`);

    if (assistantWindow) {
        // 等待窗口加载完成
        setTimeout(() => {
            if (assistantWindow.updateStreamInfo) {
                assistantWindow.updateStreamInfo({
                    title: document.getElementById('stream-title').value,
                    description: document.getElementById('stream-description').value,
                    channel: agoraConfig.channel,
                    viewerUrl: document.getElementById('viewer-url').textContent
                });
            }
        }, 1000);
    }
}

// 开始推流到声网Agora
async function startStreaming() {
    if (!localTracks.videoTrack || !localTracks.audioTrack) {
        showMessage('请先开启视频预览');
        return;
    }

    // 获取并验证Token
    const tokenInput = document.getElementById('stream-token').value.trim();
    const tokenValidation = validateToken(tokenInput);

    if (!tokenValidation.valid) {
        showMessage(tokenValidation.message);
        return;
    }

    // 更新配置中的Token
    agoraConfig.token = tokenInput;

    try {
        showMessage('正在连接声网Agora服务器...', 'success');

        // 初始化Agora客户端
        await initializeAgoraClient();

        // 设置客户端角色为主播
        await agoraClient.setClientRole("host");

        // 加入频道
        const uid = await agoraClient.join(
            agoraConfig.appId,
            agoraConfig.channel,
            agoraConfig.token,
            agoraConfig.uid
        );

        console.log("加入频道成功，UID:", uid);

        // 发布本地音视频轨道
        await agoraClient.publish([localTracks.videoTrack, localTracks.audioTrack]);

        console.log("发布本地流成功");

        // 更新状态
        isStreaming = true;
        streamStartTime = new Date();
        startStreamTimer();

        document.getElementById('start-btn').disabled = true;
        document.getElementById('stop-btn').disabled = false;
        document.getElementById('stream-info-panel').classList.remove('hidden');
        document.getElementById('stream-token').parentElement.classList.add('hidden');

        // 更新直播信息到Firebase Realtime Database
        updateStreamInfo();

        // 打开直播助手窗口
        openAssistantWindow();

        localStorage.setItem('lastStreamToken', agoraConfig.token);

        showMessage('推流成功！观众现在可以观看直播了', 'success');

    } catch (error) {
        console.error('推流失败:', error);

        if (error.code === 4096) {
            showMessage('认证失败：请检查Token是否正确或已过期');
        } else if (error.code === 17) {
            showMessage('加入频道失败：可能是Token无效或频道名不正确');
        } else {
            showMessage('推流失败: ' + error.message);
        }
    }
}

// 停止推流
async function stopStreaming() {
    try {
        if (agoraClient) {
            // 取消发布轨道
            if (localTracks.videoTrack || localTracks.audioTrack) {
                await agoraClient.unpublish([localTracks.videoTrack, localTracks.audioTrack]);
            }

            // 离开频道
            await agoraClient.leave();

            console.log("离开频道成功");
        }

        isStreaming = false;
        stopStreamTimer();

        document.getElementById('start-btn').disabled = false;
        document.getElementById('stop-btn').disabled = true;
        document.getElementById('stream-info-panel').classList.add('hidden');
        document.getElementById('stream-token').parentElement.classList.remove('hidden');

        showMessage('推流已停止', 'success');

        // 清理直播信息
        database.ref('live/stream-info').remove();

        // 关闭助手窗口
        if (assistantWindow && !assistantWindow.closed) {
            assistantWindow.close();
        }

    } catch (error) {
        console.error('停止推流失败:', error);
        showMessage('停止推流失败: ' + error.message);
    }
}

// 开始直播计时器
function startStreamTimer() {
    streamDurationInterval = setInterval(() => {
        if (streamStartTime) {
            const duration = Math.floor((new Date() - streamStartTime) / 1000);
            const minutes = Math.floor(duration / 60);
            const seconds = duration % 60;
            document.getElementById('stream-duration').textContent =
                `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
    }, 1000);
}

// 停止直播计时器
function stopStreamTimer() {
    if (streamDurationInterval) {
        clearInterval(streamDurationInterval);
        streamDurationInterval = null;
    }
    document.getElementById('stream-duration').textContent = '00:00';
}

// 更新直播信息到Firebase Realtime Database
function updateStreamInfo() {
    const streamTitle = document.getElementById('stream-title').value;
    const streamDescription = document.getElementById('stream-description').value;

    database.ref('live/stream-info').set({
        title: streamTitle,
        description: streamDescription,
        isLive: true,
        startTime: Date.now(),
        lastUpdate: Date.now(),
        channel: agoraConfig.channel,
        token: agoraConfig.token
    });
}

// 监听观众数据
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
        document.getElementById('chat-message-count').textContent = messageCount;
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

// 复制观看地址
function copyViewerUrl() {
    const url = document.getElementById('viewer-url').textContent;
    navigator.clipboard.writeText(url).then(() => {
        showMessage('观看地址已复制到剪贴板', 'success');
    });
}

// 复制频道名称
function copyChannelName() {
    const channelName = document.getElementById('agora-channel').textContent;
    navigator.clipboard.writeText(channelName).then(() => {
        showMessage('频道名称已复制到剪贴板', 'success');
    });
}

// 填充上一次使用的Token
function fillLastToken() {
    const lastToken = localStorage.getItem('lastStreamToken');
    if (lastToken) {
        document.getElementById('stream-token').value = lastToken;
        showMessage('已填充上一次使用的Token', 'success');
    } else {
        showMessage('没有找到上一次使用的Token', 'error');
    }
}

// 清空Token
function clearToken() {
    document.getElementById('stream-token').value = "";
}

// 更新当前时间
function updateCurrentTime() {
    const now = new Date();
    document.getElementById('current-time').textContent =
        now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function () {
    // 获取设备列表
    getDevices();

    // 初始化数据监听
    initializeStats();
    initializeChat();

    // 事件监听
    document.getElementById('video-source').addEventListener('change', () => {
        if (isPreviewing && currentVideoSource === 'camera') {
            stopPreview();
            setTimeout(() => startPreview(), 500);
        }
    });

    document.getElementById('audio-source').addEventListener('change', () => {
        if (isPreviewing) {
            // 重新创建音频轨道
            if (localTracks.audioTrack) {
                localTracks.audioTrack.close();
                localTracks.audioTrack = null;
            }

            const audioSource = document.getElementById('audio-source').value;
            AgoraRTC.createMicrophoneAudioTrack({
                microphoneId: audioSource || undefined,
                AEC: true,
                AGC: true,
                ANS: true
            }).then(track => {
                localTracks.audioTrack = track;
                if (isStreaming && agoraClient) {
                    // 如果正在推流，重新发布音频轨道
                    agoraClient.unpublish([localTracks.audioTrack]).then(() => {
                        return agoraClient.publish([track]);
                    });
                }
            }).catch(error => {
                console.error('切换音频源失败:', error);
                showMessage('切换音频源失败: ' + error.message);
            });
        }
    });

    document.getElementById('resolution').addEventListener('change', () => {
        if (isPreviewing) {
            stopPreview();
            setTimeout(() => startPreview(), 500);
        }
    });

    document.getElementById('start-preview-btn').addEventListener('click', () => {
        if (isPreviewing) {
            stopPreview();
        } else {
            startPreview();
        }
    });

    document.getElementById('start-btn').addEventListener('click', startStreaming);
    document.getElementById('stop-btn').addEventListener('click', stopStreaming);

    document.getElementById('camera-source-btn').addEventListener('click', () => {
        toggleVideoSource('camera');
    });

    document.getElementById('screen-source-btn').addEventListener('click', () => {
        toggleVideoSource('screen');
    });

    // 聊天发送按钮事件
    document.getElementById('chat-send-btn').addEventListener('click', sendChatMessage);
    document.getElementById('chat-message-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendChatMessage();
        }
    });

    // 更新频道名称显示
    document.getElementById('agora-channel').textContent = agoraConfig.channel;

    // 更新当前时间
    updateCurrentTime();
    setInterval(updateCurrentTime, 60000);
});