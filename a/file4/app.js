// Firebase 配置
const firebaseConfig = {
    apiKey: "AIzaSyAeSI1akqwsPBrVyv7YKirV06fqdkL3YNI",
    authDomain: "quark-b7305.firebaseapp.com",
    projectId: "quark-b7305",
    storageBucket: "quark-b7305.firebasestorage.app",
    messagingSenderId: "843016834358",
    appId: "1:843016834358:web:9438c729be28c4d492f797",
    measurementId: "G-5BVT26KRT6",
    databaseURL: "https://quark-b7305-default-rtdb.firebaseio.com" // 需要添加这个
};

// 初始化 Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// WebRTC 配置
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
    ]
};

// 全局变量
let peerConnection = null;
let dataChannel = null;
let roomRef = null;
let localId = null;
let remoteId = null;
let currentRoomCode = null;
let selectedFiles = [];
let isInitiator = false;
let iceCandidates = [];
let isConnected = false;

// DOM 元素
const elements = {
    roomCode: document.getElementById('roomCode'),
    createRoomBtn: document.getElementById('createRoomBtn'),
    randomRoomBtn: document.getElementById('randomRoomBtn'),
    roomSection: document.getElementById('roomSection'),
    connectedSection: document.getElementById('connectedSection'),
    connectionStatus: document.getElementById('connectionStatus'),
    roomInfo: document.getElementById('roomInfo'),
    peerStatusText: document.getElementById('peerStatusText'),
    peerIcon: document.getElementById('peerIcon'),
    peerId: document.getElementById('peerId'),
    fileInput: document.getElementById('fileInput'),
    fileDropArea: document.getElementById('fileDropArea'),
    fileList: document.getElementById('fileList'),
    sendBtn: document.getElementById('sendBtn'),
    clearBtn: document.getElementById('clearBtn'),
    progressSection: document.getElementById('progressSection'),
    progressList: document.getElementById('progressList'),
    receiveSection: document.getElementById('receiveSection'),
    receivedFiles: document.getElementById('receivedFiles'),
    closeProgressBtn: document.getElementById('closeProgressBtn')
};

// 生成随机房间号（3位字母）
function generateRoomCode() {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 3; i++) {
        code += letters.charAt(Math.floor(Math.random() * letters.length));
    }
    return code;
}

// 生成本地ID
function generateLocalId() {
    return 'user_' + Math.random().toString(36).substr(2, 9);
}

// 更新连接状态
function updateConnectionStatus(status, type = 'info') {
    const statusEl = elements.connectionStatus;
    const icon = statusEl.querySelector('i');
    const text = statusEl.querySelector('span');

    text.textContent = status;

    switch (type) {
        case 'success':
            icon.style.color = 'var(--success-color)';
            break;
        case 'warning':
            icon.style.color = 'var(--warning-color)';
            break;
        case 'error':
            icon.style.color = 'var(--error-color)';
            break;
        default:
            icon.style.color = 'var(--text-secondary)';
    }
}

// 显示房间信息
function showRoomInfo(roomCode) {
    elements.roomInfo.textContent = `房间号: ${roomCode}`;
    elements.roomInfo.style.display = 'block';
}

// 切换视图
function switchToConnectedView() {
    elements.roomSection.style.display = 'none';
    elements.connectedSection.style.display = 'block';
    elements.connectionStatus.style.display = 'flex';
}

function switchToRoomView() {
    elements.connectedSection.style.display = 'none';
    elements.roomSection.style.display = 'block';
    elements.progressSection.style.display = 'none';
    elements.receiveSection.style.display = 'none';
    updateConnectionStatus('已断开连接', 'warning');
}

// 初始化房间
async function initializeRoom(roomCode, isCreator = false) {
    try {
        currentRoomCode = roomCode;
        localId = generateLocalId();
        isInitiator = isCreator;

        // 显示房间信息
        showRoomInfo(roomCode);
        switchToConnectedView();

        // 连接Firebase房间
        roomRef = database.ref('rooms/' + roomCode);

        // 设置房间数据
        await roomRef.child(localId).set({
            joined: true,
            timestamp: Date.now()
        });

        // 设置房间过期时间（30分钟）
        await roomRef.child('expires').set(Date.now() + 30 * 60 * 1000);

        // 监听房间变化
        setupRoomListeners();

        updateConnectionStatus('等待对方加入...', 'warning');
        updatePeerStatus('等待对方加入...', false);

    } catch (error) {
        console.error('初始化房间失败:', error);
        alert('房间初始化失败，请重试');
        switchToRoomView();
    }
}

// 设置房间监听器
function setupRoomListeners() {
    // 监听其他用户加入
    roomRef.on('child_added', (snapshot) => {
        if (snapshot.key !== localId && snapshot.key !== 'expires') {
            remoteId = snapshot.key;
            console.log('检测到对方:', remoteId);

            if (isInitiator) {
                // 如果是创建者，创建peer connection
                createPeerConnection();
                updatePeerStatus('对方已加入，正在连接...', false);
            }
        }
    });

    // 监听用户离开
    roomRef.on('child_removed', (snapshot) => {
        if (snapshot.key === remoteId) {
            console.log('对方离开房间');
            remoteId = null;
            updatePeerStatus('对方已离开', false);
            updateConnectionStatus('等待对方加入...', 'warning');

            // 清理连接
            cleanupConnection();
        }
    });

    // 监听信令消息
    roomRef.child('signals').on('child_added', (snapshot) => {
        const signal = snapshot.val();
        console.log('收到信令:', signal);

        if (signal.to === localId) {
            handleSignal(signal);
            // 删除已处理的消息
            snapshot.ref.remove();
        }
    });

    // 清理过期房间
    roomRef.child('expires').on('value', (snapshot) => {
        const expires = snapshot.val();
        if (expires && Date.now() > expires) {
            console.log('房间已过期');
            leaveRoom();
        }
    });
}

// 创建Peer Connection
function createPeerConnection() {
    try {
        peerConnection = new RTCPeerConnection(configuration);

        // 创建数据通道
        dataChannel = peerConnection.createDataChannel('fileTransfer', {
            ordered: true,
            maxRetransmits: 5
        });

        setupDataChannel();

        // 收集ICE候选
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                iceCandidates.push(event.candidate);

                // 定期发送收集的ICE候选
                if (iceCandidates.length % 3 === 0) {
                    sendSignal({
                        type: 'ice-candidates',
                        candidates: iceCandidates.slice(-3),
                        from: localId,
                        to: remoteId
                    });
                }
            }
        };

        // 监听ICE连接状态
        peerConnection.oniceconnectionstatechange = () => {
            console.log('ICE状态:', peerConnection.iceConnectionState);

            switch (peerConnection.iceConnectionState) {
                case 'connected':
                case 'completed':
                    isConnected = true;
                    updateConnectionStatus('已连接', 'success');
                    updatePeerStatus('已连接', true);
                    break;
                case 'disconnected':
                case 'failed':
                    isConnected = false;
                    updateConnectionStatus('连接断开', 'error');
                    updatePeerStatus('连接断开', false);
                    break;
            }
        };

        // 如果是发起者，创建offer
        if (isInitiator) {
            createOffer();
        }

    } catch (error) {
        console.error('创建Peer Connection失败:', error);
        updateConnectionStatus('连接失败', 'error');
    }
}

// 设置数据通道
function setupDataChannel() {
    dataChannel.onopen = () => {
        console.log('数据通道已打开');
        elements.sendBtn.disabled = selectedFiles.length === 0;
    };

    dataChannel.onclose = () => {
        console.log('数据通道已关闭');
        elements.sendBtn.disabled = true;
    };

    dataChannel.onerror = (error) => {
        console.error('数据通道错误:', error);
    };

    dataChannel.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            handleDataChannelMessage(message);
        } catch (error) {
            console.error('解析消息失败:', error);
        }
    };

    // 监听对方的数据通道
    peerConnection.ondatachannel = (event) => {
        dataChannel = event.channel;
        setupDataChannel();
    };
}

// 创建Offer
async function createOffer() {
    try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        sendSignal({
            type: 'offer',
            sdp: offer,
            from: localId,
            to: remoteId
        });

    } catch (error) {
        console.error('创建Offer失败:', error);
    }
}

// 处理信令
async function handleSignal(signal) {
    try {
        if (!peerConnection) {
            createPeerConnection();
        }

        switch (signal.type) {
            case 'offer':
                await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);

                sendSignal({
                    type: 'answer',
                    sdp: answer,
                    from: localId,
                    to: signal.from
                });
                break;

            case 'answer':
                await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
                break;

            case 'ice-candidates':
                if (signal.candidates) {
                    for (const candidate of signal.candidates) {
                        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                    }
                }
                break;
        }

    } catch (error) {
        console.error('处理信令失败:', error);
    }
}

// 发送信令
function sendSignal(signal) {
    if (roomRef) {
        roomRef.child('signals').push(signal);
    }
}

// 更新对端状态
function updatePeerStatus(text, isConnected) {
    elements.peerStatusText.textContent = text;
    elements.peerIcon.className = isConnected ? 'fas fa-user-check connected' : 'fas fa-user-clock';
    elements.peerId.textContent = isConnected ? `连接ID: ${remoteId}` : '';
}

// 清理连接
function cleanupConnection() {
    if (dataChannel) {
        dataChannel.close();
        dataChannel = null;
    }

    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    iceCandidates = [];
    isConnected = false;
    remoteId = null;
}

// 离开房间
function leaveRoom() {
    if (roomRef) {
        roomRef.child(localId).remove();
        roomRef.off();
        roomRef = null;
    }

    cleanupConnection();
    switchToRoomView();
    elements.roomInfo.style.display = 'none';
    currentRoomCode = null;
}

// 文件处理
elements.fileDropArea.addEventListener('click', () => {
    elements.fileInput.click();
});

elements.fileInput.addEventListener('change', handleFileSelect);

elements.fileDropArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    elements.fileDropArea.classList.add('dragover');
});

elements.fileDropArea.addEventListener('dragleave', () => {
    elements.fileDropArea.classList.remove('dragover');
});

elements.fileDropArea.addEventListener('drop', (e) => {
    e.preventDefault();
    elements.fileDropArea.classList.remove('dragover');

    if (e.dataTransfer.files.length) {
        handleFileSelect({ target: { files: e.dataTransfer.files } });
    }
});

function handleFileSelect(event) {
    const files = Array.from(event.target.files);

    files.forEach(file => {
        if (selectedFiles.find(f => f.name === file.name && f.size === file.size)) {
            return; // 跳过重复文件
        }

        selectedFiles.push(file);
        renderFileItem(file);
    });

    elements.sendBtn.disabled = selectedFiles.length === 0 || !isConnected;
}

function renderFileItem(file) {
    const item = document.createElement('div');
    item.className = 'file-item';

    const size = formatFileSize(file.size);

    item.innerHTML = `
        <div style="display: flex; align-items: center; flex: 1;">
            <i class="fas fa-file file-icon"></i>
            <div class="file-info">
                <div class="file-name">${file.name}</div>
                <div class="file-size">${size}</div>
            </div>
        </div>
        <i class="fas fa-times remove-file" style="color: var(--text-secondary); cursor: pointer;"></i>
    `;

    item.querySelector('.remove-file').addEventListener('click', () => {
        const index = selectedFiles.findIndex(f => f.name === file.name && f.size === file.size);
        if (index > -1) {
            selectedFiles.splice(index, 1);
            item.remove();
        }
        elements.sendBtn.disabled = selectedFiles.length === 0 || !isConnected;
    });

    elements.fileList.appendChild(item);
}

// 发送文件
elements.sendBtn.addEventListener('click', sendFiles);

async function sendFiles() {
    if (!dataChannel || dataChannel.readyState !== 'open') {
        alert('连接未就绪，请等待连接建立');
        return;
    }

    elements.progressSection.style.display = 'block';

    for (const file of selectedFiles) {
        await sendFile(file);
    }

    selectedFiles = [];
    elements.fileList.innerHTML = '';
    elements.sendBtn.disabled = true;
}

async function sendFile(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        const chunkSize = 16 * 1024; // 16KB chunks
        let offset = 0;
        const fileId = Date.now() + '_' + Math.random().toString(36).substr(2, 9);

        // 发送文件元数据
        const metadata = {
            type: 'file-metadata',
            fileId: fileId,
            name: file.name,
            type: file.type,
            size: file.size,
            chunks: Math.ceil(file.size / chunkSize)
        };

        dataChannel.send(JSON.stringify(metadata));
        addProgressItem(fileId, file.name, 0);

        reader.onload = function (e) {
            const chunk = {
                type: 'file-chunk',
                fileId: fileId,
                data: e.target.result,
                offset: offset,
                isLast: offset + chunkSize >= file.size
            };

            dataChannel.send(JSON.stringify(chunk));

            const progress = Math.min(100, Math.round((offset / file.size) * 100));
            updateProgress(fileId, progress);

            offset += chunkSize;

            if (offset < file.size) {
                readNextChunk();
            } else {
                updateProgress(fileId, 100, true);
                resolve();
            }
        };

        function readNextChunk() {
            const slice = file.slice(offset, offset + chunkSize);
            reader.readAsDataURL(slice);
        }

        readNextChunk();
    });
}

// 处理接收到的消息
function handleDataChannelMessage(message) {
    switch (message.type) {
        case 'file-metadata':
            receiveFileStart(message);
            break;
        case 'file-chunk':
            receiveFileChunk(message);
            break;
    }
}

let receivingFiles = {};

function receiveFileStart(metadata) {
    receivingFiles[metadata.fileId] = {
        name: metadata.name,
        type: metadata.type,
        size: metadata.size,
        totalChunks: metadata.chunks,
        receivedChunks: 0,
        data: []
    };

    addProgressItem(metadata.fileId, `接收: ${metadata.name}`, 0);
}

function receiveFileChunk(chunk) {
    const file = receivingFiles[chunk.fileId];
    if (!file) return;

    file.data.push(chunk.data);
    file.receivedChunks++;

    const progress = Math.min(100, Math.round((file.receivedChunks / file.totalChunks) * 100));
    updateProgress(chunk.fileId, progress);

    if (chunk.isLast) {
        completeFile(chunk.fileId);
    }
}

function completeFile(fileId) {
    const file = receivingFiles[fileId];
    if (!file) return;

    // 合并所有chunk
    const dataURL = file.data.join('').replace(/^data:[^,]+,/, '');
    const binary = atob(dataURL);
    const array = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
        array[i] = binary.charCodeAt(i);
    }

    const blob = new Blob([array], { type: file.type });
    const url = URL.createObjectURL(blob);

    // 显示接收到的文件
    showReceivedFile(file.name, url);

    // 清理
    delete receivingFiles[fileId];
    updateProgress(fileId, 100, true);
}

// 进度显示
function addProgressItem(fileId, fileName, progress) {
    const item = document.createElement('div');
    item.className = 'progress-item';
    item.id = `progress-${fileId}`;

    item.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <span>${fileName}</span>
            <span>${progress}%</span>
        </div>
        <div class="progress-bar">
            <div class="progress-fill" style="width: ${progress}%"></div>
        </div>
    `;

    elements.progressList.appendChild(item);
}

function updateProgress(fileId, progress, completed = false) {
    const item = document.getElementById(`progress-${fileId}`);
    if (item) {
        const percentSpan = item.querySelector('span:last-child');
        const progressFill = item.querySelector('.progress-fill');

        if (percentSpan) percentSpan.textContent = `${progress}%`;
        if (progressFill) progressFill.style.width = `${progress}%`;

        if (completed) {
            item.style.opacity = '0.7';
            setTimeout(() => {
                if (item.parentNode) {
                    item.parentNode.removeChild(item);
                }
            }, 2000);
        }
    }
}

// 显示接收到的文件
function showReceivedFile(fileName, url) {
    elements.receiveSection.style.display = 'block';

    const item = document.createElement('div');
    item.className = 'received-file';

    item.innerHTML = `
        <div>
            <i class="fas fa-file-download"></i>
            <span style="margin-left: 10px;">${fileName}</span>
        </div>
        <a href="${url}" download="${fileName}" class="btn-secondary" style="background: white; color: var(--success-color); padding: 5px 15px; font-size: 14px;">
            下载
        </a>
    `;

    elements.receivedFiles.appendChild(item);

    // 清理旧的接收文件
    const items = elements.receivedFiles.querySelectorAll('.received-file');
    if (items.length > 3) {
        items[0].remove();
    }
}

// 工具函数
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 事件监听
elements.createRoomBtn.addEventListener('click', () => {
    const roomCode = elements.roomCode.value.trim().toUpperCase();

    if (!/^[A-Z]{3}$/.test(roomCode)) {
        alert('请输入3位字母（A-Z）作为房间号');
        return;
    }

    initializeRoom(roomCode, true);
});

elements.randomRoomBtn.addEventListener('click', () => {
    const roomCode = generateRoomCode();
    elements.roomCode.value = roomCode;
    initializeRoom(roomCode, true);
});

elements.clearBtn.addEventListener('click', () => {
    selectedFiles = [];
    elements.fileList.innerHTML = '';
    elements.sendBtn.disabled = true;
});

elements.closeProgressBtn.addEventListener('click', () => {
    elements.progressSection.style.display = 'none';
});

// 页面卸载时清理
window.addEventListener('beforeunload', () => {
    leaveRoom();
});

// 初始化
updateConnectionStatus('准备就绪', 'info');