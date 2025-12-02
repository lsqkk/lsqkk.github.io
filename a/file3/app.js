// Firebase配置 - 使用你提供的配置
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
let localStream = null;
let peerConnections = {};
let dataChannels = {};
let localPeerId;
let roomId = null;
let currentFile = null;
let isInitiator = false;
const CHUNK_SIZE = 16384; // 16KB chunks - WebRTC DataChannel推荐大小

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
    return Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
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
    connectionStatus.textContent = '正在连接房间...';

    // 设置房间监听
    setupRoom();
}

function setupRoom() {
    const roomRef = database.ref('rooms/' + roomId);

    // 监听房间中的peer
    roomRef.on('value', snapshot => {
        const peers = snapshot.val() || {};
        updatePeerList(peers);

        // 如果是第一个加入的，成为发起者
        const peerIds = Object.keys(peers);
        if (peerIds.length === 1 && peerIds[0] === localPeerId) {
            isInitiator = true;
            connectionStatus.textContent = '已创建房间，等待其他人加入...';
            connectionStatus.style.color = '#27ae60';
        } else {
            connectionStatus.textContent = `已连接到房间，已连接设备: ${peerIds.length}台`;
            connectionStatus.style.color = '#2980b9';
        }
    });

    // 添加自己到房间
    roomRef.child(localPeerId).set({
        id: localPeerId,
        timestamp: Date.now()
    });

    // 监听自己的移除（当离开页面时）
    window.addEventListener('beforeunload', () => {
        roomRef.child(localPeerId).remove();
    });

    // 监听其他peer
    roomRef.on('child_added', async snapshot => {
        const peerId = snapshot.key;
        const peerData = snapshot.val();

        if (peerId !== localPeerId) {
            await initiatePeerConnection(peerId);
        }
    });

    roomRef.on('child_removed', snapshot => {
        const peerId = snapshot.key;
        if (peerConnections[peerId]) {
            peerConnections[peerId].close();
            delete peerConnections[peerId];
            delete dataChannels[peerId];
        }
        updatePeerListUI();
    });

    // 显示传输区域
    transferSection.style.display = 'block';
    joinRoomBtn.innerHTML = '<i class="fas fa-check"></i> 已连接';
}

// 初始化对等连接
async function initiatePeerConnection(remotePeerId) {
    console.log(`正在连接到: ${remotePeerId}`);

    // 配置STUN服务器
    const configuration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' }
        ]
    };

    const peerConnection = new RTCPeerConnection(configuration);
    peerConnections[remotePeerId] = peerConnection;

    // 创建DataChannel
    const dataChannel = peerConnection.createDataChannel('fileTransfer', {
        ordered: true, // 保证顺序
        maxRetransmits: 3 // 重传次数
    });

    dataChannels[remotePeerId] = dataChannel;
    setupDataChannel(dataChannel, remotePeerId);

    // ICE候选处理
    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            sendSignal(remotePeerId, {
                type: 'candidate',
                candidate: event.candidate
            });
        }
    };

    // 连接状态变化
    peerConnection.onconnectionstatechange = () => {
        console.log(`连接状态 ${remotePeerId}:`, peerConnection.connectionState);
    };

    // 如果是发起者，创建offer
    if (isInitiator) {
        try {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);

            sendSignal(remotePeerId, {
                type: 'offer',
                sdp: offer.sdp
            });
        } catch (error) {
            console.error('创建offer失败:', error);
        }
    }

    // 监听远程描述
    peerConnection.ondatachannel = event => {
        const dataChannel = event.channel;
        dataChannels[remotePeerId] = dataChannel;
        setupDataChannel(dataChannel, remotePeerId);
    };
}

// 设置DataChannel
function setupDataChannel(dataChannel, remotePeerId) {
    dataChannel.binaryType = 'arraybuffer';

    dataChannel.onopen = () => {
        console.log(`DataChannel已连接到 ${remotePeerId}`);
        updatePeerListUI();
    };

    dataChannel.onclose = () => {
        console.log(`DataChannel已断开 ${remotePeerId}`);
        delete dataChannels[remotePeerId];
        updatePeerListUI();
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
    database.ref('signals/' + roomId + '/' + remotePeerId + '_' + localPeerId).set({
        ...message,
        from: localPeerId,
        timestamp: Date.now()
    });

    // 5秒后清理旧信号
    setTimeout(() => {
        database.ref('signals/' + roomId + '/' + remotePeerId + '_' + localPeerId).remove();
    }, 5000);
}

// 监听信令消息
function setupSignalListener() {
    const signalsRef = database.ref('signals/' + roomId);

    signalsRef.on('child_added', async snapshot => {
        const signalId = snapshot.key;
        const signalData = snapshot.val();

        // 检查是否是发送给我们的消息
        if (signalId.includes(localPeerId)) {
            const remotePeerId = signalId.split('_').find(id => id !== localPeerId);

            if (!remotePeerId || !signalData.from) return;

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

            // 清理已处理的消息
            snapshot.ref.remove();
        }
    });
}

// 处理Offer
async function handleOffer(remotePeerId, signalData) {
    console.log(`收到来自 ${remotePeerId} 的offer`);

    if (!peerConnections[remotePeerId]) {
        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };

        peerConnections[remotePeerId] = new RTCPeerConnection(configuration);

        peerConnections[remotePeerId].onicecandidate = event => {
            if (event.candidate) {
                sendSignal(remotePeerId, {
                    type: 'candidate',
                    candidate: event.candidate
                });
            }
        };

        peerConnections[remotePeerId].ondatachannel = event => {
            const dataChannel = event.channel;
            dataChannels[remotePeerId] = dataChannel;
            setupDataChannel(dataChannel, remotePeerId);
        };
    }

    const peerConnection = peerConnections[remotePeerId];

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
}

// 处理Answer
async function handleAnswer(remotePeerId, signalData) {
    console.log(`收到来自 ${remotePeerId} 的answer`);

    const peerConnection = peerConnections[remotePeerId];
    if (peerConnection) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription({
            type: 'answer',
            sdp: signalData.sdp
        }));
    }
}

// 处理Candidate
async function handleCandidate(remotePeerId, signalData) {
    const peerConnection = peerConnections[remotePeerId];
    if (peerConnection && signalData.candidate) {
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(signalData.candidate));
        } catch (error) {
            console.error('添加ICE candidate失败:', error);
        }
    }
}

// 更新设备列表
function updatePeerList(peers) {
    peerList.innerHTML = '';

    Object.keys(peers).forEach(peerId => {
        if (peerId !== localPeerId) {
            const li = document.createElement('li');
            li.className = 'peer-item';
            li.innerHTML = `
                <span>设备 ${peerId.substring(0, 8)}</span>
                <span style="color: ${dataChannels[peerId] && dataChannels[peerId].readyState === 'open' ? '#27ae60' : '#e74c3c'}">
                    ${dataChannels[peerId] && dataChannels[peerId].readyState === 'open' ? '已连接' : '连接中...'}
                </span>
            `;
            peerList.appendChild(li);
        }
    });
}

function updatePeerListUI() {
    // 这里可以添加更复杂的UI更新逻辑
    // 现在由updatePeerList处理
}

// 文件拖拽和选择
fileDropArea.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', handleFileSelect);

fileDropArea.addEventListener('dragover', event => {
    event.preventDefault();
    fileDropArea.classList.add('dragover');
});

fileDropArea.addEventListener('dragleave', () => {
    fileDropArea.classList.remove('dragover');
});

fileDropArea.addEventListener('drop', event => {
    event.preventDefault();
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

    // 如果有已连接的设备，显示发送按钮
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
    if (!currentFile) return;

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
            timestamp: Date.now()
        };

        dataChannel.send(JSON.stringify(metadata));

        // 读取并发送文件
        const reader = new FileReader();
        let offset = 0;
        let chunkIndex = 0;

        reader.onload = function (e) {
            const chunk = e.target.result;

            // 发送分片
            dataChannel.send(chunk);

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
                const endSignal = {
                    type: 'file-end',
                    name: currentFile.name,
                    size: currentFile.size,
                    timestamp: Date.now()
                };

                dataChannel.send(JSON.stringify(endSignal));

                progressText.textContent = '文件发送完成！';
                sendFileBtn.disabled = false;
                sendFileBtn.innerHTML = '<i class="fas fa-paper-plane"></i> 发送文件';

                setTimeout(() => {
                    progressContainer.classList.remove('show');
                    fileInfo.classList.remove('show');
                    progressFill.style.width = '0%';
                    currentFile = null;
                    fileInput.value = '';
                }, 3000);
            }
        };

        reader.onerror = function (error) {
            console.error('读取文件失败:', error);
            progressText.textContent = '发送失败！';
            sendFileBtn.disabled = false;
            sendFileBtn.innerHTML = '<i class="fas fa-paper-plane"></i> 发送文件';
        };

        function readNextChunk() {
            const slice = currentFile.slice(offset, offset + CHUNK_SIZE);
            reader.readAsArrayBuffer(slice);
        }

        // 开始读取
        readNextChunk();

    } catch (error) {
        console.error('发送文件失败:', error);
        progressText.textContent = '发送失败！';
        sendFileBtn.disabled = false;
        sendFileBtn.innerHTML = '<i class="fas fa-paper-plane"></i> 发送文件';
    }
}

// 处理接收到的消息
let receivedFiles = {};
let currentReceiver = null;

function handleDataChannelMessage(data, remotePeerId) {
    try {
        // 尝试解析JSON消息（元数据）
        if (typeof data === 'string') {
            const message = JSON.parse(data);

            if (message.type === 'file-start') {
                // 开始接收新文件
                receivedFiles[remotePeerId] = {
                    name: message.name,
                    size: message.size,
                    mimeType: message.mimeType,
                    receivedSize: 0,
                    chunks: [],
                    timestamp: message.timestamp
                };

                currentReceiver = remotePeerId;

                progressContainer.classList.add('show');
                progressFill.style.width = '0%';
                progressText.textContent = `准备接收文件: ${message.name}`;

            } else if (message.type === 'file-end') {
                // 文件接收完成
                const fileInfo = receivedFiles[remotePeerId];
                if (fileInfo) {
                    // 合并所有分片
                    const blob = new Blob(fileInfo.chunks, { type: fileInfo.mimeType });

                    // 创建下载链接
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = fileInfo.name;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);

                    progressText.textContent = `文件已接收: ${fileInfo.name}`;

                    // 清理
                    delete receivedFiles[remotePeerId];
                    setTimeout(() => {
                        progressContainer.classList.remove('show');
                        progressFill.style.width = '0%';
                    }, 3000);
                }
            }
        } else if (data instanceof ArrayBuffer) {
            // 二进制数据（文件分片）
            if (currentReceiver && receivedFiles[currentReceiver]) {
                const fileInfo = receivedFiles[currentReceiver];
                fileInfo.chunks.push(data);
                fileInfo.receivedSize += data.byteLength;

                // 更新进度
                const progress = Math.round((fileInfo.receivedSize / fileInfo.size) * 100);
                progressFill.style.width = progress + '%';
                progressText.textContent = `接收中... ${progress}%`;
            }
        }
    } catch (error) {
        console.error('处理消息失败:', error);
    }
}

// 工具函数
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

// 页面加载完成后设置信令监听
window.addEventListener('DOMContentLoaded', () => {
    setupSignalListener();
});