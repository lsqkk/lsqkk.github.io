// Firebase配置
const firebaseConfig = {
    apiKey: "AIzaSyAeSI1akqwsPBrVyv7YKirV06fqdkL3YNI",
    authDomain: "quark-b7305.firebaseapp.com",
    projectId: "quark-b7305",
    storageBucket: "quark-b7305.firebasestorage.app",
    messagingSenderId: "843016834358",
    appId: "1:843016834358:web:9438c729be28c4d492f797",
    measurementId: "G-5BVT26KRT6",
    databaseURL: "https://quark-b7305-default-rtdb.firebaseio.com/" // 添加这个
};

// 初始化Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// WebRTC配置
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// 全局变量
let localConnection = null;
let dataChannel = null;
let roomId = null;
let isInitiator = false;
let filesToSend = [];
let currentFileIndex = 0;
let chunkSize = 16384; // 16KB 每个分片
let currentChunk = 0;
let totalChunks = 0;
let fileData = null;
let fileReader = null;
let connectionRef = null;
let signalingRef = null;

// DOM元素
const elements = {
    connectionPanel: document.getElementById('connectionPanel'),
    transferPanel: document.getElementById('transferPanel'),
    roomIdInput: document.getElementById('roomId'),
    generateRoom: document.getElementById('generateRoom'),
    copyRoom: document.getElementById('copyRoom'),
    createRoom: document.getElementById('createRoom'),
    joinRoom: document.getElementById('joinRoom'),
    dropZone: document.getElementById('dropZone'),
    fileInput: document.getElementById('fileInput'),
    selectFile: document.getElementById('selectFile'),
    fileList: document.querySelector('.file-list-content'),
    sendFiles: document.getElementById('sendFiles'),
    progressContainer: document.getElementById('progressContainer'),
    progressFill: document.getElementById('progressFill'),
    progressText: document.getElementById('progressText'),
    progressDetails: document.getElementById('progressDetails'),
    receivedFiles: document.getElementById('receivedFiles'),
    receivedList: document.querySelector('.received-list'),
    statusDot: document.getElementById('statusDot'),
    statusText: document.getElementById('statusText'),
    toast: document.getElementById('toast')
};

// 生成随机房间号
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// 显示提示
function showToast(message, duration = 3000) {
    elements.toast.textContent = message;
    elements.toast.classList.add('show');
    setTimeout(() => {
        elements.toast.classList.remove('show');
    }, duration);
}

// 更新连接状态
function updateConnectionStatus(connected, message = '') {
    if (connected) {
        elements.statusDot.classList.add('connected');
        elements.statusText.textContent = '已连接' + (message ? ` (${message})` : '');
        elements.statusText.style.color = '#2ed573';
    } else {
        elements.statusDot.classList.remove('connected');
        elements.statusText.textContent = message || '未连接';
        elements.statusText.style.color = '#ff4757';
    }
}

// 初始化事件监听
function initEventListeners() {
    // 生成房间号
    elements.generateRoom.addEventListener('click', () => {
        elements.roomIdInput.value = generateRoomId();
        showToast('已生成新房间号');
    });

    // 复制房间号
    elements.copyRoom.addEventListener('click', () => {
        navigator.clipboard.writeText(elements.roomIdInput.value)
            .then(() => showToast('房间号已复制'))
            .catch(() => showToast('复制失败'));
    });

    // 创建房间
    elements.createRoom.addEventListener('click', () => {
        roomId = elements.roomIdInput.value || generateRoomId();
        elements.roomIdInput.value = roomId;
        isInitiator = true;
        setupRoom();
        showToast(`房间 ${roomId} 已创建`);
    });

    // 加入房间
    elements.joinRoom.addEventListener('click', () => {
        roomId = elements.roomIdInput.value;
        if (!roomId) {
            showToast('请输入房间号');
            return;
        }
        isInitiator = false;
        setupRoom();
        showToast(`正在加入房间 ${roomId}...`);
    });

    // 文件选择
    elements.selectFile.addEventListener('click', () => {
        elements.fileInput.click();
    });

    elements.fileInput.addEventListener('change', handleFileSelect);

    // 拖放文件
    elements.dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        elements.dropZone.classList.add('dragover');
    });

    elements.dropZone.addEventListener('dragleave', () => {
        elements.dropZone.classList.remove('dragover');
    });

    elements.dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        elements.dropZone.classList.remove('dragover');
        handleFileSelect({ target: { files: e.dataTransfer.files } });
    });

    // 发送文件
    elements.sendFiles.addEventListener('click', sendFiles);
}

// 处理文件选择
function handleFileSelect(e) {
    const files = Array.from(e.target.files);

    files.forEach(file => {
        // 检查文件大小（限制100MB）
        if (file.size > 100 * 1024 * 1024) {
            showToast(`文件 ${file.name} 超过100MB限制`);
            return;
        }

        // 检查是否已存在同名文件
        if (filesToSend.some(f => f.name === file.name)) {
            showToast(`文件 ${file.name} 已存在`);
            return;
        }

        filesToSend.push(file);
        addFileToList(file);
    });

    updateSendButton();
    elements.fileInput.value = '';
}

// 添加文件到列表
function addFileToList(file) {
    const fileItem = document.createElement('div');
    fileItem.className = 'file-item';
    fileItem.dataset.name = file.name;

    const fileSize = formatFileSize(file.size);

    fileItem.innerHTML = `
        <div class="file-info">
            <i class="fas fa-file file-icon"></i>
            <div class="file-name">${file.name}</div>
            <div class="file-size">${fileSize}</div>
        </div>
        <button class="file-remove" title="移除">
            <i class="fas fa-times"></i>
        </button>
    `;

    fileItem.querySelector('.file-remove').addEventListener('click', () => {
        removeFile(file.name);
    });

    elements.fileList.appendChild(fileItem);
}

// 移除文件
function removeFile(fileName) {
    filesToSend = filesToSend.filter(f => f.name !== fileName);
    const fileItem = elements.fileList.querySelector(`[data-name="${fileName}"]`);
    if (fileItem) {
        fileItem.remove();
    }
    updateSendButton();
}

// 更新发送按钮状态
function updateSendButton() {
    elements.sendFiles.disabled = filesToSend.length === 0 || !dataChannel || dataChannel.readyState !== 'open';
}

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 设置房间
function setupRoom() {
    elements.connectionPanel.style.display = 'none';
    elements.transferPanel.style.display = 'block';

    // 清理之前的连接
    cleanup();

    // 连接到Firebase信令通道
    connectionRef = database.ref(`connections/${roomId}`);
    signalingRef = connectionRef.child('signaling');

    // 监听信令消息
    signalingRef.on('value', snapshot => {
        const data = snapshot.val();
        if (data) {
            handleSignalingMessage(data);
        }
    });

    // 设置心跳检测
    setupHeartbeat();

    // 如果是创建者，初始化WebRTC连接
    if (isInitiator) {
        setTimeout(() => {
            createPeerConnection();
        }, 1000);
    }
}

// 清理资源
function cleanup() {
    if (localConnection) {
        localConnection.close();
        localConnection = null;
    }
    if (dataChannel) {
        dataChannel.close();
        dataChannel = null;
    }
    if (signalingRef) {
        signalingRef.off();
    }
    filesToSend = [];
    currentFileIndex = 0;
    currentChunk = 0;
    updateConnectionStatus(false, '连接已断开');
    updateSendButton();
}

// 设置心跳检测
function setupHeartbeat() {
    const myRef = connectionRef.child(isInitiator ? 'initiator' : 'receiver');

    // 更新在线状态
    myRef.set({
        online: true,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    });

    // 定期更新
    const heartbeatInterval = setInterval(() => {
        myRef.update({
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
    }, 30000);

    // 监听对方状态
    const otherRef = connectionRef.child(isInitiator ? 'receiver' : 'initiator');
    otherRef.on('value', snapshot => {
        const data = snapshot.val();
        if (data && data.online) {
            updateConnectionStatus(true, '等待对方就绪...');
        }
    });

    // 页面卸载时清理
    window.addEventListener('beforeunload', () => {
        clearInterval(heartbeatInterval);
        myRef.remove();
    });
}

// 创建WebRTC连接
function createPeerConnection() {
    try {
        localConnection = new RTCPeerConnection(configuration);

        // 创建数据通道
        dataChannel = localConnection.createDataChannel('fileTransfer', {
            ordered: true,
            maxRetransmits: 10
        });

        setupDataChannel();

        // ICE候选处理
        localConnection.onicecandidate = event => {
            if (event.candidate) {
                sendSignalingMessage({
                    type: 'candidate',
                    candidate: event.candidate
                });
            }
        };

        localConnection.oniceconnectionstatechange = () => {
            console.log('ICE连接状态:', localConnection.iceConnectionState);
        };

        // 如果是创建者，创建offer
        if (isInitiator) {
            localConnection.createOffer()
                .then(offer => localConnection.setLocalDescription(offer))
                .then(() => {
                    sendSignalingMessage({
                        type: 'offer',
                        sdp: localConnection.localDescription
                    });
                })
                .catch(error => {
                    console.error('创建offer失败:', error);
                    showToast('创建连接失败');
                });
        }
    } catch (error) {
        console.error('创建WebRTC连接失败:', error);
        showToast('创建连接失败');
    }
}

// 设置数据通道
function setupDataChannel() {
    if (!dataChannel) return;

    dataChannel.onopen = () => {
        console.log('数据通道已打开');
        updateConnectionStatus(true, '连接已建立');
        updateSendButton();
        showToast('连接已建立，可以发送文件了');
    };

    dataChannel.onclose = () => {
        console.log('数据通道已关闭');
        updateConnectionStatus(false, '连接已断开');
        updateSendButton();
        showToast('连接已断开');
    };

    dataChannel.onerror = (error) => {
        console.error('数据通道错误:', error);
        showToast('数据传输错误');
    };

    dataChannel.onmessage = handleIncomingMessage;
}

// 处理信令消息
function handleSignalingMessage(message) {
    if (!localConnection) {
        if (message.type === 'offer' && !isInitiator) {
            createPeerConnection();
        } else {
            return;
        }
    }

    switch (message.type) {
        case 'offer':
            if (!isInitiator) {
                localConnection.setRemoteDescription(new RTCSessionDescription(message.sdp))
                    .then(() => localConnection.createAnswer())
                    .then(answer => localConnection.setLocalDescription(answer))
                    .then(() => {
                        sendSignalingMessage({
                            type: 'answer',
                            sdp: localConnection.localDescription
                        });
                    })
                    .catch(error => {
                        console.error('处理offer失败:', error);
                        showToast('连接失败');
                    });
            }
            break;

        case 'answer':
            if (isInitiator) {
                localConnection.setRemoteDescription(new RTCSessionDescription(message.sdp))
                    .catch(error => {
                        console.error('处理answer失败:', error);
                    });
            }
            break;

        case 'candidate':
            localConnection.addIceCandidate(new RTCIceCandidate(message.candidate))
                .catch(error => {
                    console.error('添加ICE候选失败:', error);
                });
            break;
    }
}

// 发送信令消息
function sendSignalingMessage(message) {
    if (signalingRef) {
        signalingRef.set(message);
    }
}

// 发送文件
function sendFiles() {
    if (filesToSend.length === 0 || !dataChannel || dataChannel.readyState !== 'open') {
        showToast('无法发送文件');
        return;
    }

    currentFileIndex = 0;
    sendNextFile();
}

// 发送下一个文件
function sendNextFile() {
    if (currentFileIndex >= filesToSend.length) {
        showToast('所有文件发送完成');
        resetProgress();
        return;
    }

    const file = filesToSend[currentFileIndex];
    fileData = {
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
        chunks: Math.ceil(file.size / chunkSize)
    };

    totalChunks = fileData.chunks;
    currentChunk = 0;

    // 发送文件元数据
    dataChannel.send(JSON.stringify({
        type: 'metadata',
        data: fileData
    }));

    showToast(`开始发送: ${file.name}`);
    updateProgress(0, `准备发送 ${file.name}...`);

    // 开始发送文件内容
    sendNextChunk();
}

// 发送下一个分片
function sendNextChunk() {
    if (currentChunk >= totalChunks) {
        // 文件发送完成
        currentFileIndex++;
        setTimeout(sendNextFile, 100);
        return;
    }

    const file = filesToSend[currentFileIndex];
    const start = currentChunk * chunkSize;
    const end = Math.min(start + chunkSize, file.size);

    if (!fileReader) {
        fileReader = new FileReader();
        fileReader.onload = (e) => {
            // 发送分片数据
            dataChannel.send(JSON.stringify({
                type: 'chunk',
                index: currentChunk,
                total: totalChunks,
                data: Array.from(new Uint8Array(e.target.result))
            }));

            // 更新进度
            const progress = Math.round(((currentChunk + 1) / totalChunks) * 100);
            updateProgress(progress, `发送中: ${file.name} (${currentChunk + 1}/${totalChunks})`);

            currentChunk++;

            // 控制发送速率，避免阻塞
            setTimeout(sendNextChunk, 10);
        };
    }

    const slice = file.slice(start, end);
    fileReader.readAsArrayBuffer(slice);
}

// 处理接收到的消息
function handleIncomingMessage(event) {
    try {
        const message = JSON.parse(event.data);

        switch (message.type) {
            case 'metadata':
                receiveFileMetadata(message.data);
                break;

            case 'chunk':
                receiveFileChunk(message);
                break;

            case 'complete':
                completeFileReceival();
                break;
        }
    } catch (error) {
        console.error('解析消息失败:', error);
    }
}

// 接收文件元数据
let receivingFile = null;
let receivedChunks = [];
function receiveFileMetadata(metadata) {
    receivingFile = {
        name: metadata.name,
        size: metadata.size,
        type: metadata.type,
        totalChunks: metadata.chunks,
        receivedChunks: 0,
        chunks: new Array(metadata.chunks)
    };

    receivedChunks = [];

    elements.receivedFiles.style.display = 'block';
    updateProgress(0, `准备接收: ${metadata.name}...`);
    showToast(`开始接收: ${metadata.name}`);
}

// 接收文件分片
function receiveFileChunk(chunkData) {
    if (!receivingFile) return;

    // 存储分片
    receivingFile.chunks[chunkData.index] = new Uint8Array(chunkData.data);
    receivingFile.receivedChunks++;

    // 更新进度
    const progress = Math.round((receivingFile.receivedChunks / receivingFile.totalChunks) * 100);
    updateProgress(progress,
        `接收中: ${receivingFile.name} (${receivingFile.receivedChunks}/${receivingFile.totalChunks})`
    );

    // 检查是否接收完成
    if (receivingFile.receivedChunks === receivingFile.totalChunks) {
        completeFileReceival();
    }
}

// 完成文件接收
function completeFileReceival() {
    if (!receivingFile) return;

    try {
        // 合并所有分片
        const totalSize = receivingFile.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const fileData = new Uint8Array(totalSize);
        let offset = 0;

        for (let i = 0; i < receivingFile.totalChunks; i++) {
            const chunk = receivingFile.chunks[i];
            fileData.set(chunk, offset);
            offset += chunk.length;
        }

        // 创建Blob并下载
        const blob = new Blob([fileData], { type: receivingFile.type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = receivingFile.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // 添加到接收列表
        addToReceivedList(receivingFile.name, receivingFile.size);

        showToast(`文件 ${receivingFile.name} 接收完成`);
        updateProgress(100, `接收完成: ${receivingFile.name}`);

        // 重置接收状态
        receivingFile = null;
        receivedChunks = [];

    } catch (error) {
        console.error('保存文件失败:', error);
        showToast('保存文件失败');
    }
}

// 添加到接收列表
function addToReceivedList(fileName, fileSize) {
    const fileItem = document.createElement('div');
    fileItem.className = 'file-item';

    fileItem.innerHTML = `
        <div class="file-info">
            <i class="fas fa-download file-icon" style="color: #2ed573;"></i>
            <div class="file-name">${fileName}</div>
            <div class="file-size">${formatFileSize(fileSize)}</div>
        </div>
        <div class="file-status">
            <i class="fas fa-check-circle" style="color: #2ed573;"></i>
        </div>
    `;

    elements.receivedList.appendChild(fileItem);
}

// 更新进度显示
function updateProgress(percentage, details = '') {
    elements.progressContainer.style.display = 'block';
    elements.progressFill.style.width = percentage + '%';
    elements.progressText.textContent = percentage + '%';
    elements.progressDetails.textContent = details;
}

// 重置进度
function resetProgress() {
    elements.progressContainer.style.display = 'none';
    elements.progressFill.style.width = '0%';
    elements.progressText.textContent = '0%';
    elements.progressDetails.textContent = '';
}

// 页面加载完成
document.addEventListener('DOMContentLoaded', () => {
    // 生成初始房间号
    elements.roomIdInput.value = generateRoomId();

    // 初始化事件监听
    initEventListeners();

    // 页面卸载时清理
    window.addEventListener('beforeunload', () => {
        if (connectionRef) {
            connectionRef.remove();
        }
        cleanup();
    });

    showToast('文件传输工具已就绪');
});