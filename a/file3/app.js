// Firebase配置
const firebaseConfig = {
    apiKey: "AIzaSyAeSI1akqwsPBrVyv7YKirV06fqdkL3YNI",
    authDomain: "quark-b7305.firebaseapp.com",
    projectId: "quark-b7305",
    storageBucket: "quark-b7305.firebasestorage.app",
    messagingSenderId: "843016834358",
    appId: "1:843016834358:web:9438c729be28c4d492f797",
    measurementId: "G-5BVT26KRT6"
};

// 初始化Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// 全局变量
let peerConnections = {};
let dataChannels = {};
let localPeerId;
let roomId = null;
let currentFile = null;
let isInitiator = false;
let fileTransferActive = false;
const CHUNK_SIZE = 16 * 1024; // 16KB chunks

// 改进的ICE服务器配置（针对中国大陆优化）
const getIceServers = () => {
    return {
        iceServers: [
            // 中国大陆优先服务器
            { urls: 'stun:stun.chat.bilibili.com:3478' },
            { urls: 'stun:stun.miwifi.com:3478' },

            // 国际备用服务器
            { urls: 'stun:stun.cloudflare.com:3478' },
            { urls: 'stun:stun.stunprotocol.org:3478' },
            { urls: 'stun:stun.sipnet.com:3478' },
            { urls: 'stun:stun.sonetel.com:3478' },
            { urls: 'stun:stun.nextcloud.com:3478' },
            { urls: 'stun:stun.freeswitch.org:3478' },

            // Google STUN服务器（某些网络可能可用）
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
        ],
        iceCandidatePoolSize: 10,
        iceTransportPolicy: 'all',
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
    };
};

// DOM元素
const roomCodeInput = document.getElementById('roomCode');
const joinRoomBtn = document.getElementById('joinRoom');
const connectionStatus = document.getElementById('connectionStatus');
const transferSection = document.querySelector('.transfer-section');
const fileDropArea = document.getElementById('fileDropArea');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const fileSize = document.getElementById('fileSize');
const targetPeer = document.getElementById('targetPeer');
const sendFileBtn = document.getElementById('sendFile');
const progressContainer = document.getElementById('progressContainer');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const peerList = document.getElementById('peerList');

// 生成随机Peer ID
function generatePeerId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return 'peer_' + result;
}

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// 更新连接状态
function updateStatus(message, isError = false) {
    connectionStatus.textContent = message;
    connectionStatus.style.color = isError ? '#e74c3c' : '#2c3e50';
    console.log(message);
}

// 加入房间
joinRoomBtn.addEventListener('click', joinRoom);

function joinRoom() {
    const code = roomCodeInput.value.toUpperCase().trim();

    if (!code.match(/^[A-Z]{3}$/)) {
        alert('请输入三位字母的房间码 (如: ABC)');
        return;
    }

    roomId = code;
    localPeerId = generatePeerId();

    joinRoomBtn.disabled = true;
    joinRoomBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 连接中...';
    updateStatus('正在初始化连接...');

    setupRoom();
}

function setupRoom() {
    const roomRef = database.ref('rooms/' + roomId);

    // 清除可能存在的旧房间数据（超过10分钟的）
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    roomRef.orderByChild('timestamp').endAt(tenMinutesAgo).remove();

    // 监听房间中的peer
    roomRef.on('value', snapshot => {
        const peers = snapshot.val() || {};
        updatePeerList(peers);

        const peerIds = Object.keys(peers);
        if (peerIds.length === 1 && peerIds[0] === localPeerId) {
            isInitiator = true;
            updateStatus('房间已创建，等待其他用户加入...');
        } else if (peerIds.length > 1) {
            updateStatus(`已连接房间，${peerIds.length - 1}个设备在线`);
        }
    });

    // 添加自己到房间
    roomRef.child(localPeerId).set({
        id: localPeerId,
        timestamp: Date.now(),
        platform: navigator.platform,
        lastSeen: Date.now()
    });

    // 定期更新最后在线时间
    const keepAliveInterval = setInterval(() => {
        if (roomId) {
            roomRef.child(localPeerId).update({
                lastSeen: Date.now()
            });
        }
    }, 30000);

    // 监听其他peer加入
    roomRef.on('child_added', async snapshot => {
        const peerId = snapshot.key;
        const peerData = snapshot.val();

        if (peerId !== localPeerId) {
            console.log(`新设备加入: ${peerId}`);

            // 等待500ms避免竞争条件
            setTimeout(() => {
                initiatePeerConnection(peerId);
            }, 500);
        }
    });

    // 监听其他peer离开
    roomRef.on('child_removed', snapshot => {
        const peerId = snapshot.key;
        console.log(`设备离开: ${peerId}`);
        cleanupPeerConnection(peerId);
    });

    // 设置信令监听
    setupSignalListener();

    // 显示传输区域
    transferSection.style.display = 'block';
    joinRoomBtn.innerHTML = '<i class="fas fa-check"></i> 已连接';

    // 清理函数
    window.addEventListener('beforeunload', () => {
        clearInterval(keepAliveInterval);
        roomRef.child(localPeerId).remove();
        database.ref('signals/' + roomId).orderByChild('from').equalTo(localPeerId).remove();

        // 关闭所有连接
        Object.keys(peerConnections).forEach(peerId => {
            cleanupPeerConnection(peerId);
        });
    });
}

// 初始化对等连接
async function initiatePeerConnection(remotePeerId) {
    console.log(`正在连接到: ${remotePeerId}`);

    if (peerConnections[remotePeerId]) {
        console.log(`已存在到 ${remotePeerId} 的连接，跳过`);
        return;
    }

    const configuration = getIceServers();
    const peerConnection = new RTCPeerConnection(configuration);
    peerConnections[remotePeerId] = peerConnection;

    // 连接超时设置
    let connectionTimeout = setTimeout(() => {
        if (peerConnection.connectionState !== 'connected' &&
            peerConnection.connectionState !== 'connecting') {
            console.warn(`连接 ${remotePeerId} 超时`);
            updateStatus(`连接超时，请检查网络`, true);
            cleanupPeerConnection(remotePeerId);

            // 尝试重新连接
            setTimeout(() => {
                initiatePeerConnection(remotePeerId);
            }, 3000);
        }
    }, 20000);

    // ICE连接状态变化
    peerConnection.oniceconnectionstatechange = () => {
        const state = peerConnection.iceConnectionState;
        console.log(`ICE连接状态 ${remotePeerId}: ${state}`);

        if (state === 'connected' || state === 'completed') {
            clearTimeout(connectionTimeout);
            updateStatus(`已连接到 ${remotePeerId.substring(5, 9)}`);
        } else if (state === 'failed' || state === 'disconnected') {
            console.warn(`连接 ${remotePeerId} 失败，状态: ${state}`);

            if (state === 'failed') {
                cleanupPeerConnection(remotePeerId);
                setTimeout(() => {
                    initiatePeerConnection(remotePeerId);
                }, 3000);
            }
        }
    };

    // ICE收集状态
    peerConnection.onicegatheringstatechange = () => {
        console.log(`ICE收集状态 ${remotePeerId}: ${peerConnection.iceGatheringState}`);
    };

    // ICE候选收集
    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            sendSignal(remotePeerId, {
                type: 'candidate',
                candidate: event.candidate
            });
        } else {
            console.log(`ICE候选收集完成 ${remotePeerId}`);
        }
    };

    // 连接状态变化
    peerConnection.onconnectionstatechange = () => {
        console.log(`连接状态 ${remotePeerId}: ${peerConnection.connectionState}`);
    };

    // 创建DataChannel
    try {
        const dataChannel = peerConnection.createDataChannel('fileTransfer', {
            ordered: true,
            maxRetransmits: 3,
            maxPacketLifeTime: 3000
        });

        setupDataChannel(dataChannel, remotePeerId);
        dataChannels[remotePeerId] = dataChannel;

        // 如果是发起者，创建offer
        if (isInitiator) {
            setTimeout(async () => {
                try {
                    const offer = await peerConnection.createOffer({
                        offerToReceiveAudio: false,
                        offerToReceiveVideo: false
                    });

                    await peerConnection.setLocalDescription(offer);

                    sendSignal(remotePeerId, {
                        type: 'offer',
                        sdp: offer.sdp
                    });
                } catch (error) {
                    console.error('创建offer失败:', error);
                }
            }, 1000);
        }
    } catch (error) {
        console.error('创建DataChannel失败:', error);
    }

    // 监听远程DataChannel
    peerConnection.ondatachannel = event => {
        const dataChannel = event.channel;
        console.log(`收到远程DataChannel: ${remotePeerId}`);
        setupDataChannel(dataChannel, remotePeerId);
        dataChannels[remotePeerId] = dataChannel;
    };
}

// 设置DataChannel
function setupDataChannel(dataChannel, remotePeerId) {
    dataChannel.binaryType = 'arraybuffer';

    dataChannel.onopen = () => {
        console.log(`DataChannel已连接 ${remotePeerId}`);
        updatePeerListUI();
        updateStatus(`已连接 ${remotePeerId.substring(5, 9)}，可以传输文件`);
    };

    dataChannel.onclose = () => {
        console.log(`DataChannel已关闭 ${remotePeerId}`);
        if (dataChannels[remotePeerId]) {
            delete dataChannels[remotePeerId];
            updatePeerListUI();
        }
    };

    dataChannel.onerror = error => {
        console.error(`DataChannel错误 ${remotePeerId}:`, error);
    };

    dataChannel.onmessage = event => {
        handleDataChannelMessage(event.data, remotePeerId);
    };
}

// 发送信令消息
function sendSignal(remotePeerId, message) {
    const signalId = `${localPeerId}_${remotePeerId}_${Date.now()}`;
    const signalRef = database.ref('signals/' + roomId + '/' + signalId);

    signalRef.set({
        ...message,
        from: localPeerId,
        to: remotePeerId,
        timestamp: Date.now()
    });

    // 10秒后清理
    setTimeout(() => {
        signalRef.remove();
    }, 10000);
}

// 监听信令消息
function setupSignalListener() {
    const signalsRef = database.ref('signals/' + roomId);

    signalsRef.on('child_added', async snapshot => {
        const signalData = snapshot.val();

        // 如果是发送给我们的消息
        if (signalData.to === localPeerId) {
            const remotePeerId = signalData.from;

            try {
                if (signalData.type === 'offer') {
                    await handleOffer(remotePeerId, signalData);
                } else if (signalData.type === 'answer') {
                    await handleAnswer(remotePeerId, signalData);
                } else if (signalData.type === 'candidate') {
                    await handleCandidate(remotePeerId, signalData);
                }
            } catch (error) {
                console.error('处理信令失败:', error);
            }

            // 清理消息
            setTimeout(() => {
                snapshot.ref.remove();
            }, 1000);
        }
    });
}

// 处理Offer
async function handleOffer(remotePeerId, signalData) {
    console.log(`收到来自 ${remotePeerId} 的offer`);

    if (peerConnections[remotePeerId]) {
        console.log(`已存在到 ${remotePeerId} 的连接，跳过`);
        return;
    }

    const configuration = getIceServers();
    const peerConnection = new RTCPeerConnection(configuration);
    peerConnections[remotePeerId] = peerConnection;

    // 设置事件监听
    peerConnection.oniceconnectionstatechange = () => {
        console.log(`ICE连接状态 ${remotePeerId}:`, peerConnection.iceConnectionState);
    };

    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            sendSignal(remotePeerId, {
                type: 'candidate',
                candidate: event.candidate
            });
        }
    };

    peerConnection.ondatachannel = event => {
        const dataChannel = event.channel;
        setupDataChannel(dataChannel, remotePeerId);
        dataChannels[remotePeerId] = dataChannel;
    };

    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription({
            type: 'offer',
            sdp: signalData.sdp
        }));

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        sendSignal(remotePeerId, {
            type: 'answer',
            sdp: answer.sdp
        });
    } catch (error) {
        console.error('处理offer失败:', error);
        cleanupPeerConnection(remotePeerId);
    }
}

// 处理Answer
async function handleAnswer(remotePeerId, signalData) {
    console.log(`收到来自 ${remotePeerId} 的answer`);

    const peerConnection = peerConnections[remotePeerId];
    if (peerConnection && peerConnection.signalingState !== 'closed') {
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription({
                type: 'answer',
                sdp: signalData.sdp
            }));
        } catch (error) {
            console.error('设置远程description失败:', error);
        }
    }
}

// 处理Candidate
async function handleCandidate(remotePeerId, signalData) {
    const peerConnection = peerConnections[remotePeerId];
    if (peerConnection && signalData.candidate &&
        peerConnection.remoteDescription) {
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(signalData.candidate));
        } catch (error) {
            console.error('添加ICE candidate失败:', error);
        }
    }
}

// 清理连接
function cleanupPeerConnection(peerId) {
    if (peerConnections[peerId]) {
        try {
            peerConnections[peerId].close();
        } catch (e) {
            console.error('关闭连接时出错:', e);
        }
        delete peerConnections[peerId];
    }
    if (dataChannels[peerId]) {
        try {
            dataChannels[peerId].close();
        } catch (e) {
            console.error('关闭DataChannel时出错:', e);
        }
        delete dataChannels[peerId];
    }
    updatePeerListUI();
}

// 更新设备列表UI
function updatePeerList(peers) {
    if (!peerList) return;

    peerList.innerHTML = '';

    Object.keys(peers).forEach(peerId => {
        if (peerId !== localPeerId) {
            const li = document.createElement('li');
            li.className = 'peer-item';

            const isConnected = dataChannels[peerId] &&
                dataChannels[peerId].readyState === 'open';
            const shortId = peerId.length > 8 ? peerId.substring(5, 9) : peerId;

            li.innerHTML = `
                <span>设备 ${shortId}</span>
                <span style="color: ${isConnected ? '#27ae60' : '#e74c3c'}">
                    ${isConnected ? '✓ 已连接' : '...连接中'}
                </span>
            `;

            // 点击设备可以选择发送文件
            li.addEventListener('click', () => {
                if (isConnected && currentFile) {
                    targetPeer.textContent = `设备 ${shortId}`;
                    fileInfo.classList.add('show');
                }
            });

            peerList.appendChild(li);
        }
    });
}

function updatePeerListUI() {
    if (roomId) {
        const roomRef = database.ref('rooms/' + roomId);
        roomRef.once('value').then(snapshot => {
            updatePeerList(snapshot.val() || {});
        });
    }
}

// 文件拖拽和选择
fileDropArea.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', handleFileSelect);

fileDropArea.addEventListener('dragover', event => {
    event.preventDefault();
    event.stopPropagation();
    fileDropArea.classList.add('dragover');
});

fileDropArea.addEventListener('dragleave', () => {
    fileDropArea.classList.remove('dragover');
});

fileDropArea.addEventListener('drop', event => {
    event.preventDefault();
    event.stopPropagation();
    fileDropArea.classList.remove('dragover');

    const files = event.dataTransfer.files;
    if (files.length > 0) {
        handleFile(files[0]);
    }
});

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        handleFile(file);
    }
}

// 处理选择的文件
function handleFile(file) {
    // 检查文件大小
    if (file.size > 100 * 1024 * 1024) {
        alert('文件太大！最大支持100MB');
        return;
    }

    if (file.size < 10 * 1024) {
        alert('文件太小！建议使用其他方式传输');
        return;
    }

    currentFile = file;

    // 显示文件信息
    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);

    // 检查是否有已连接的设备
    const connectedPeers = Object.keys(dataChannels).filter(
        peerId => dataChannels[peerId] && dataChannels[peerId].readyState === 'open'
    );

    if (connectedPeers.length > 0) {
        targetPeer.textContent = `已连接设备 (${connectedPeers.length}台)`;
        fileInfo.classList.add('show');
    } else {
        alert('请等待设备连接完成');
        return;
    }
}

// 发送文件
sendFileBtn.addEventListener('click', sendFile);

async function sendFile() {
    if (!currentFile || fileTransferActive) return;

    const connectedPeers = Object.keys(dataChannels).filter(
        peerId => dataChannels[peerId] && dataChannels[peerId].readyState === 'open'
    );

    if (connectedPeers.length === 0) {
        alert('没有已连接的设备');
        return;
    }

    // 默认发送给第一个已连接的设备
    const targetPeerId = connectedPeers[0];
    const dataChannel = dataChannels[targetPeerId];

    if (!dataChannel || dataChannel.readyState !== 'open') {
        alert('数据通道未就绪');
        return;
    }

    fileTransferActive = true;
    sendFileBtn.disabled = true;
    sendFileBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 发送中...';
    progressContainer.classList.add('show');
    progressText.textContent = '准备传输...';

    try {
        // 发送文件元数据
        const metadata = {
            type: 'file-start',
            name: currentFile.name,
            size: currentFile.size,
            mimeType: currentFile.type,
            timestamp: Date.now(),
            totalChunks: Math.ceil(currentFile.size / CHUNK_SIZE)
        };

        dataChannel.send(JSON.stringify(metadata));

        // 延迟确保元数据已发送
        await new Promise(resolve => setTimeout(resolve, 100));

        // 读取并发送文件
        const reader = new FileReader();
        let offset = 0;
        let chunkIndex = 0;

        reader.onload = function (e) {
            const chunk = e.target.result;

            // 发送分片
            try {
                dataChannel.send(chunk);
            } catch (error) {
                console.error('发送分片失败:', error);
                onTransferError('发送分片失败');
                return;
            }

            offset += chunk.byteLength;
            chunkIndex++;

            // 更新进度
            const progress = Math.round((offset / currentFile.size) * 100);
            progressFill.style.width = progress + '%';
            progressText.textContent = `发送中... ${progress}%`;

            if (offset < currentFile.size) {
                // 继续读取下一块
                readNextChunk();
            } else {
                // 发送完成
                setTimeout(() => {
                    const endSignal = {
                        type: 'file-end',
                        name: currentFile.name,
                        size: currentFile.size,
                        timestamp: Date.now()
                    };

                    try {
                        dataChannel.send(JSON.stringify(endSignal));
                        onTransferComplete();
                    } catch (error) {
                        console.error('发送完成信号失败:', error);
                        onTransferComplete();
                    }
                }, 100);
            }
        };

        reader.onerror = function (error) {
            console.error('读取文件失败:', error);
            onTransferError('读取文件失败');
        };

        function readNextChunk() {
            const slice = currentFile.slice(offset, offset + CHUNK_SIZE);
            reader.readAsArrayBuffer(slice);
        }

        // 开始读取
        readNextChunk();

    } catch (error) {
        console.error('发送文件失败:', error);
        onTransferError('发送文件失败');
    }
}

// 传输完成处理
function onTransferComplete() {
    progressText.textContent = '文件发送完成！';
    progressFill.style.width = '100%';

    setTimeout(() => {
        progressContainer.classList.remove('show');
        fileInfo.classList.remove('show');
        progressFill.style.width = '0%';
        sendFileBtn.disabled = false;
        sendFileBtn.innerHTML = '<i class="fas fa-paper-plane"></i> 发送文件';
        currentFile = null;
        fileInput.value = '';
        fileTransferActive = false;
    }, 3000);
}

// 传输错误处理
function onTransferError(message) {
    progressText.textContent = message;
    progressFill.style.backgroundColor = '#e74c3c';

    setTimeout(() => {
        progressContainer.classList.remove('show');
        progressFill.style.width = '0%';
        progressFill.style.backgroundColor = '';
        sendFileBtn.disabled = false;
        sendFileBtn.innerHTML = '<i class="fas fa-paper-plane"></i> 发送文件';
        fileTransferActive = false;
    }, 3000);
}

// 接收文件处理
let receivingFile = null;
let receivedChunks = [];
let totalChunksExpected = 0;

function handleDataChannelMessage(data, remotePeerId) {
    try {
        // 尝试解析JSON消息（元数据）
        if (typeof data === 'string') {
            const message = JSON.parse(data);

            if (message.type === 'file-start') {
                // 开始接收新文件
                receivingFile = {
                    name: message.name,
                    size: message.size,
                    mimeType: message.mimeType,
                    timestamp: message.timestamp,
                    totalChunks: message.totalChunks || Math.ceil(message.size / CHUNK_SIZE)
                };

                receivedChunks = [];
                totalChunksExpected = receivingFile.totalChunks;

                progressContainer.classList.add('show');
                progressFill.style.width = '0%';
                progressText.textContent = `准备接收文件: ${message.name}`;

                // 询问用户是否接收
                if (confirm(`是否接收文件 "${message.name}" (${formatFileSize(message.size)})?`)) {
                    // 发送确认接收
                    const dataChannel = dataChannels[remotePeerId];
                    if (dataChannel) {
                        dataChannel.send(JSON.stringify({
                            type: 'file-accept',
                            timestamp: Date.now()
                        }));
                    }
                } else {
                    // 拒绝接收
                    const dataChannel = dataChannels[remotePeerId];
                    if (dataChannel) {
                        dataChannel.send(JSON.stringify({
                            type: 'file-reject',
                            timestamp: Date.now()
                        }));
                    }
                    receivingFile = null;
                    receivedChunks = [];
                }

            } else if (message.type === 'file-end') {
                // 文件接收完成
                if (receivingFile) {
                    // 合并所有分片
                    const blob = new Blob(receivedChunks, { type: receivingFile.mimeType });

                    // 验证文件大小
                    if (blob.size !== receivingFile.size) {
                        console.warn(`文件大小不匹配: 预期 ${receivingFile.size}, 实际 ${blob.size}`);
                    }

                    // 创建下载链接
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = receivingFile.name;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);

                    // 清理
                    setTimeout(() => {
                        URL.revokeObjectURL(url);
                        progressText.textContent = `文件已保存: ${receivingFile.name}`;

                        setTimeout(() => {
                            progressContainer.classList.remove('show');
                            progressFill.style.width = '0%';
                        }, 2000);
                    }, 100);

                    receivingFile = null;
                    receivedChunks = [];
                }

            } else if (message.type === 'file-accept') {
                console.log('对方已接受文件');
            } else if (message.type === 'file-reject') {
                console.log('对方已拒绝文件');
                progressText.textContent = '对方拒绝了文件传输';
                setTimeout(() => {
                    progressContainer.classList.remove('show');
                    progressFill.style.width = '0%';
                }, 2000);
            }
        } else if (data instanceof ArrayBuffer) {
            // 二进制数据（文件分片）
            if (receivingFile) {
                receivedChunks.push(data);

                // 更新进度
                const progress = Math.round((receivedChunks.length / totalChunksExpected) * 100);
                progressFill.style.width = progress + '%';
                progressText.textContent = `接收中... ${progress}%`;
            }
        }
    } catch (error) {
        console.error('处理消息失败:', error);
    }
}

// 测试STUN服务器连接
function testStunServers() {
    console.log('测试STUN服务器连接...');

    const servers = getIceServers().iceServers;
    const testPromises = [];

    servers.forEach(server => {
        if (server.urls.includes('stun:')) {
            const pc = new RTCPeerConnection({ iceServers: [server] });

            const testPromise = new Promise((resolve) => {
                let hasCandidate = false;

                pc.onicecandidate = (e) => {
                    if (e.candidate) {
                        hasCandidate = true;
                    } else {
                        setTimeout(() => {
                            pc.close();
                            resolve({
                                server: server.urls,
                                available: hasCandidate
                            });
                        }, 1000);
                    }
                };

                pc.createDataChannel('test');
                pc.createOffer()
                    .then(offer => pc.setLocalDescription(offer))
                    .catch(() => {
                        pc.close();
                        resolve({
                            server: server.urls,
                            available: false
                        });
                    });
            });

            testPromises.push(testPromise);
        }
    });

    Promise.allSettled(testPromises).then(results => {
        console.log('STUN服务器测试结果:');
        results.forEach(result => {
            if (result.status === 'fulfilled') {
                const { server, available } = result.value;
                console.log(`${server}: ${available ? '可用' : '不可用'}`);
            }
        });
    });
}

// 页面加载完成后初始化
window.addEventListener('DOMContentLoaded', () => {
    console.log('WebRTC文件传输初始化完成');

    // 可选：测试STUN服务器
    // testStunServers();

    // 添加键盘快捷键支持
    roomCodeInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            joinRoom();
        }
    });

    // 自动转换为大写
    roomCodeInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.toUpperCase();
    });
});