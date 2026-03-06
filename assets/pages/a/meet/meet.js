firebase.initializeApp(firebaseConfig);

const database = firebase.database();

const STUN_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun.minisipserver.com' },
    { urls: 'turn:numb.viagenie.ca', username: 'webrtc@live.com', credential: 'webrtc' } // TURN
];

// -----------------------------------------------------------
// 2. 全局变量与 DOM 元素
// -----------------------------------------------------------
let peerConnection;
let localStream = null; // 包含摄像头/麦克风/屏幕的流
let currentRoomCode = null;
let isCreator = false;
let isInitialSetup = false; // 用于隔离首次 addTrack 逻辑
let isSignalingLocked = false; // 用于信令重协商锁

// 媒体状态
let isCameraOn = false;
let isMicOn = false;
let isScreenSharing = false;

// DOM 元素
const roomCodeInput = document.getElementById('room-code-input');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const controlsSection = document.getElementById('controls-section');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const remoteVideoCard = document.getElementById('remote-video-card');
const statusLogDiv = document.getElementById('status-log');
const cameraBtn = document.getElementById('camera-btn');
const micBtn = document.getElementById('mic-btn');
const screenShareBtn = document.getElementById('screen-share-btn');
const hangupBtn = document.getElementById('hangup-btn');
const meetingTitle = document.getElementById('meeting-title');


// -----------------------------------------------------------
// 3. UI/工具函数
// -----------------------------------------------------------

/** 记录状态 */
function logStatus(message) {
    statusLogDiv.innerHTML = `[${new Date().toLocaleTimeString()}] ${message}\n` + statusLogDiv.innerHTML;
    console.log(message);
}

/** 生成三位随机大写字母码 */
function generateRoomCode() {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (let i = 0; i < 3; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

/** 更新按钮状态和文本 */
function updateButton(btn, state, iconOn, iconOff, textOn, textOff) {
    if (state) {
        btn.classList.add('active');
        btn.innerHTML = `<i class="${iconOn}"></i> <span>${textOn}</span>`;
    } else {
        btn.classList.remove('active');
        btn.innerHTML = `<i class="${iconOff}"></i> <span>${textOff}</span>`;
    }
}

/** 重置会议 UI 和状态 */
function resetUI() {
    createRoomBtn.disabled = false;
    joinRoomBtn.disabled = false;
    roomCodeInput.disabled = false;
    controlsSection.style.display = 'none';
    remoteVideoCard.style.display = 'none';

    localVideo.srcObject = null;
    remoteVideo.srcObject = null;

    isCameraOn = false;
    isMicOn = false;
    isScreenSharing = false;
    isSignalingLocked = false;

    updateButton(cameraBtn, isCameraOn, 'fas fa-video', 'fas fa-video-slash', '关闭摄像头', '打开摄像头');
    updateButton(micBtn, isMicOn, 'fas fa-microphone', 'fas fa-microphone-slash', '静音', '启用麦克风');
    updateButton(screenShareBtn, isScreenSharing, 'fas fa-desktop', 'fas fa-desktop', '停止共享', '共享屏幕');

    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    currentRoomCode = null;
    logStatus('会话已结束或重置。');
}


// -----------------------------------------------------------
// 4. 媒体流和轨道管理 
// -----------------------------------------------------------

/** * 获取并更新本地媒体流 (摄像头/麦克风) */
async function getLocalMedia(video = true, audio = true) {
    if (!peerConnection && !isInitialSetup) {
        logStatus('错误：PeerConnection 未初始化，无法获取媒体流。');
        return;
    }

    if (!video && !audio && !isScreenSharing) {
        // 如果所有都关闭，停止旧流
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
            localVideo.srcObject = null;
        }
        logStatus('本地媒体流已全部停止。');
        isCameraOn = false;
        isMicOn = false;
        return;
    }

    // 如果是屏幕共享状态，则不应更改摄像头和麦克风流
    if (isScreenSharing) return;

    try {
        // 1. 获取新流
        const stream = await navigator.mediaDevices.getUserMedia({ video, audio });

        // 2. 停止旧流的轨道（如果有）
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }

        localStream = stream;
        localVideo.srcObject = localStream;
        isCameraOn = video;
        isMicOn = audio;

        // 3. 替换 PeerConnection 中的轨道 (仅在连接建立后执行)
        if (peerConnection) {
            let shouldRenegotiate = false;

            stream.getTracks().forEach(track => {
                const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === track.kind);

                if (sender) {
                    // 替换已存在的轨道
                    sender.replaceTrack(track);
                    logStatus(`✅ 替换 ${track.kind} 轨道成功。`);
                } else if (!isInitialSetup) {
                    // 动态添加新轨道 (如从无视频到有视频)
                    peerConnection.addTrack(track, localStream);
                    shouldRenegotiate = true; // 新增轨道，需要重协商
                    logStatus(`✅ 动态添加 ${track.kind} 轨道成功。`);
                }
            });

            // 4. 通知远端更新 (只有在动态添加新轨道时才需要重协商)
            if (shouldRenegotiate && isCreator) {
                await createOffer(currentRoomCode);
            }
        }

        logStatus(`✅ 本地媒体流已更新。视频: ${video}, 音频: ${audio}`);
    } catch (e) {
        logStatus(`❌ 获取本地媒体失败: ${e.name}: ${e.message}`);
        // 如果失败，更新状态为关闭
        isCameraOn = false;
        isMicOn = false;
    } finally {
        // 无论成功失败，都更新按钮状态
        updateButton(cameraBtn, isCameraOn, 'fas fa-video', 'fas fa-video-slash', '关闭摄像头', '打开摄像头');
        updateButton(micBtn, isMicOn, 'fas fa-microphone', 'fas fa-microphone-slash', '静音', '启用麦克风');
        updateButton(screenShareBtn, isScreenSharing, 'fas fa-desktop', 'fas fa-desktop', '停止共享', '共享屏幕');
    }
}

/** 切换屏幕共享 */
async function toggleScreenShare() {
    if (!peerConnection) {
        logStatus('请先加入会议才能共享屏幕。');
        return;
    }
    if (isScreenSharing) {
        // 停止屏幕共享，恢复摄像头/麦克风
        logStatus('停止屏幕共享，恢复摄像头/麦克风...');
        isScreenSharing = false;
        // 恢复到之前的媒体状态 (isCameraOn, isMicOn)
        await getLocalMedia(isCameraOn, isMicOn);
    } else {
        // 开始屏幕共享
        try {
            // 1. 获取屏幕共享流
            const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });

            // 2. 停止旧流的轨道
            if (localStream) {
                localStream.getTracks().forEach(track => track.stop());
            }
            localStream = screenStream;
            localVideo.srcObject = localStream;
            isScreenSharing = true;
            isCameraOn = false;
            isMicOn = localStream.getAudioTracks().length > 0; // 屏幕流可能有系统声音

            // 3. 替换 PeerConnection 中的轨道 (修复: 确保 sender.track 存在)
            peerConnection.getSenders().forEach(sender => {
                // FIX: 确保 sender.track 存在，否则跳过，避免 Cannot read properties of null 错误
                if (!sender.track) return;

                let trackToReplace = null;
                if (sender.track.kind === 'video') {
                    // 尝试从新的屏幕共享流中获取视频轨道
                    trackToReplace = localStream.getVideoTracks()[0] || null;
                } else if (sender.track.kind === 'audio') {
                    // 尝试从新的屏幕共享流中获取音频轨道
                    trackToReplace = localStream.getAudioTracks()[0] || null;
                }

                // 如果找到了对应的轨道，或者 trackToReplace 为 null (表示停止发送该类型媒体)
                sender.replaceTrack(trackToReplace);
            });

            // 4. 监听屏幕共享结束事件 (如用户点击浏览器停止按钮)
            screenStream.getVideoTracks()[0].onended = () => {
                logStatus('屏幕共享已通过浏览器控件停止。');
                if (isScreenSharing) { // 避免重复触发
                    toggleScreenShare();
                }
            };

            logStatus('✅ 屏幕共享已开始。');

            // 5. 通知远端更新 
            if (isCreator) {
                await createOffer(currentRoomCode);
            }
        } catch (err) {
            logStatus(`❌ 屏幕共享失败: ${err.name}: ${err.message}`);
            isScreenSharing = false;
            // 如果获取失败，需要恢复按钮状态
            updateButton(screenShareBtn, isScreenSharing, 'fas fa-desktop', 'fas fa-desktop', '停止共享', '共享屏幕');
            return;
        }
    }
    // 6. 更新按钮 UI
    updateButton(screenShareBtn, isScreenSharing, 'fas fa-desktop', 'fas fa-desktop', '停止共享', '共享屏幕');
    updateButton(cameraBtn, isCameraOn, 'fas fa-video', 'fas fa-video-slash', '关闭摄像头', '打开摄像头');
    updateButton(micBtn, isMicOn, 'fas fa-microphone', 'fas fa-microphone-slash', '静音', '启用麦克风');
}


// -----------------------------------------------------------
// 5. WebRTC 信令与连接 (移除 onnegotiationneeded 监听)
// -----------------------------------------------------------

/** 初始化 RTCPeerConnection */
function createPeerConnection(roomCode, isCreatorDevice) {
    peerConnection = new RTCPeerConnection({ iceServers: STUN_SERVERS });
    currentRoomCode = roomCode;
    isCreator = isCreatorDevice;
    isSignalingLocked = false; // 重置锁

    logStatus(`创建 WebRTC 连接，身份: ${isCreator ? '会议主持' : '参会者'}。连接码: ${roomCode}`);
    meetingTitle.textContent = `会议中：${roomCode}`;
    createRoomBtn.disabled = true;
    joinRoomBtn.disabled = true;
    roomCodeInput.disabled = true;
    controlsSection.style.display = 'block';

    // 1. ICE 候选者发送
    peerConnection.onicecandidate = async (event) => {
        if (event.candidate) {
            const role = isCreator ? 'creator' : 'joiner';
            const candidatesRef = database.ref(`rooms/${roomCode}/${role}/iceCandidates`);
            await candidatesRef.push(event.candidate.toJSON());
            logStatus('发送 ICE 候选者...');
        }
    };

    // 2. 远端流接收
    peerConnection.ontrack = (event) => {
        if (remoteVideo.srcObject !== event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
            remoteVideoCard.style.display = 'block';
            logStatus('✅ 接收到远端媒体流。');
        }
    };

    // 3. 连接状态变更
    peerConnection.oniceconnectionstatechange = () => {
        logStatus(`ICE 连接状态: ${peerConnection.iceConnectionState}`);
        if (peerConnection.iceConnectionState === 'connected') {
            logStatus('🎉 P2P 连接建立成功！');
        } else if (peerConnection.iceConnectionState === 'failed' || peerConnection.iceConnectionState === 'closed') {
            logStatus('❌ P2P 连接断开或失败。');
        }
    };

    // 4. onnegotiationneeded 事件：已移除，由显式调用 createOffer 控制信令流。
}

/** 监听远端信令 */
function listenForRemoteSignals(roomCode, remoteRole) {
    // 监听 ICE 候选者
    database.ref(`rooms/${roomCode}/${remoteRole}/iceCandidates`).on('child_added', (snapshot) => {
        const candidate = snapshot.val();
        if (candidate) {
            try {
                if (peerConnection && peerConnection.signalingState !== 'closed') {
                    peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                }
            } catch (e) {
                logStatus(`❌ 添加 ICE 候选者失败: ${e.message}`);
            }
        }
    });
}

/** 主持方创建 Offer */
async function createOffer(roomCode) {
    if (!peerConnection || isSignalingLocked) {
        logStatus('⚠️ 忽略 Offer 请求，信令被锁定或 PeerConnection 未就绪。');
        return;
    }

    isSignalingLocked = true; // 锁定信令

    try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        await database.ref(`rooms/${roomCode}/creator/sdp`).set(peerConnection.localDescription.toJSON());
        logStatus('✅ 发送 Offer 完成。等待参会者 Answer...');

        // 监听参会者的 Answer
        database.ref(`rooms/${roomCode}/joiner/sdp`).off('value');
        database.ref(`rooms/${roomCode}/joiner/sdp`).on('value', async (snapshot) => {
            const answer = snapshot.val();
            if (answer && peerConnection.remoteDescription?.sdp !== answer.sdp) {

                if (peerConnection.signalingState === 'stable' || peerConnection.signalingState === 'have-local-offer') {
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
                    logStatus('✅ 接收到 Answer，设置远端描述。');
                    listenForRemoteSignals(roomCode, 'joiner');
                } else {
                    logStatus(`⚠️ 收到 Answer，但 PeerConnection 状态为 ${peerConnection.signalingState}，暂缓设置。`);
                }
                isSignalingLocked = false; // 成功设置或收到 Answer 即解锁
            }
        });
    } catch (e) {
        logStatus(`❌ 创建 Offer 失败: ${e.message}`);
        isSignalingLocked = false; // 失败后解锁
    }
}

/** 参会方创建 Answer */
async function createAnswer(roomCode) {
    if (!peerConnection) {
        logStatus('⚠️ PeerConnection 未就绪，无法启动 Answer 流程。');
        return;
    }

    // 监听主持方的 Offer
    database.ref(`rooms/${roomCode}/creator/sdp`).off('value');
    database.ref(`rooms/${roomCode}/creator/sdp`).on('value', async (snapshot) => {
        const offer = snapshot.val();
        if (!offer) {
            logStatus(`❌ 房间 ${roomCode} 不存在 Offer。请创建者先生成。`);
            return;
        }

        // 忽略重复的 Offer
        if (peerConnection.remoteDescription?.sdp === offer.sdp) {
            return;
        }

        // 收到新 Offer，尝试锁定信令
        if (isSignalingLocked) {
            logStatus('⚠️ 收到新 Offer，但信令已锁定，暂缓处理。');
            return;
        }
        isSignalingLocked = true;

        try {
            // 检查状态，防止 InvalidStateError
            if (peerConnection.signalingState === 'stable' || peerConnection.signalingState === 'have-remote-offer') {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
                logStatus('✅ 接收到 Offer，开始创建 Answer...');

                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                await database.ref(`rooms/${roomCode}/joiner/sdp`).set(peerConnection.localDescription.toJSON());
                logStatus('✅ 发送 Answer 完成。');

                listenForRemoteSignals(roomCode, 'creator');
            } else {
                logStatus(`⚠️ 收到 Offer，但 PeerConnection 状态为 ${peerConnection.signalingState}，暂缓设置。`);
            }
        } catch (e) {
            logStatus(`❌ 创建 Answer 失败: ${e.message}`);
        } finally {
            isSignalingLocked = false; // 解锁信令
        }
    });
}


// -----------------------------------------------------------
// 6. 事件监听器
// -----------------------------------------------------------

// 监听：创建房间
createRoomBtn.addEventListener('click', async () => {
    const roomCode = generateRoomCode();
    roomCodeInput.value = roomCode;

    await database.ref(`rooms/${roomCode}`).remove();
    logStatus(`正在初始化房间 ${roomCode} 的信令数据...`);

    // 1. 初始化 WebRTC
    createPeerConnection(roomCode, true);

    // 2. 首次添加轨道 (使用 isInitialSetup 确保只执行一次)
    isInitialSetup = true;
    await getLocalMedia(false, true); // 获取初始流 (默认麦克风)

    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }
    isInitialSetup = false;

    // 3. 发送 Offer
    await createOffer(roomCode);
});

// 监听：加入房间
joinRoomBtn.addEventListener('click', async () => {
    const roomCode = roomCodeInput.value.toUpperCase().trim();
    if (roomCode.length !== 3) {
        logStatus('❌ 会议码必须是三位大写字母。');
        return;
    }

    // 1. 初始化 WebRTC
    createPeerConnection(roomCode, false);

    // 2. 首次添加轨道 (使用 isInitialSetup 确保只执行一次)
    isInitialSetup = true;
    await getLocalMedia(false, true); // 获取初始流 (默认麦克风)

    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }
    isInitialSetup = false;

    // 3. 监听 Offer 并发送 Answer
    await createAnswer(roomCode);
});

// 监听：挂断
hangupBtn.addEventListener('click', () => {
    if (currentRoomCode) {
        database.ref(`rooms/${currentRoomCode}`).off(); // 移除所有监听
        database.ref(`rooms/${currentRoomCode}`).remove();
    }
    resetUI();
});

// 监听：摄像头开关
cameraBtn.addEventListener('click', async () => {
    if (isScreenSharing) {
        logStatus('请先停止屏幕共享再操作摄像头。');
        return;
    }
    isCameraOn = !isCameraOn;
    await getLocalMedia(isCameraOn, isMicOn);
});

// 监听：麦克风开关
micBtn.addEventListener('click', async () => {
    if (isScreenSharing) {
        logStatus('请先停止屏幕共享再操作麦克风。');
        return;
    }
    isMicOn = !isMicOn;
    await getLocalMedia(isCameraOn, isMicOn);
});

// 监听：屏幕共享
screenShareBtn.addEventListener('click', toggleScreenShare);
