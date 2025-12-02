class FileTransfer {
    constructor() {
        this.peerConnection = null;
        this.dataChannel = null;
        this.localId = this.generateId();
        this.remoteId = null;
        this.isInitiator = false;
        this.pendingCandidates = [];
        this.fileQueue = [];
        this.currentTransfer = null;

        this.init();
    }

    generateId() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    init() {
        // 显示本地ID
        document.getElementById('myId').textContent = this.localId;

        // 设置事件监听器
        this.setupEventListeners();

        // 监听连接请求
        this.listenForConnections();

        // 更新状态
        this.updateStatus('准备连接', 'ready');
    }

    setupEventListeners() {
        // 连接按钮
        document.getElementById('connectBtn').addEventListener('click', () => {
            this.connectToPeer();
        });

        // 回车连接
        document.getElementById('peerIdInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.connectToPeer();
        });

        // 文件选择
        document.getElementById('fileInput').addEventListener('change', (e) => {
            this.handleFiles(e.target.files);
        });

        // 文件拖放
        const dropZone = document.getElementById('dropZone');
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragover');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            this.handleFiles(e.dataTransfer.files);
        });
    }

    connectToPeer() {
        const peerId = document.getElementById('peerIdInput').value.trim();
        if (!peerId) {
            alert('请输入对方ID');
            return;
        }

        this.remoteId = peerId;
        this.isInitiator = true;

        this.updateStatus('正在连接...', 'connecting');

        // 检查对方是否在线
        database.ref(`connections/${peerId}`).once('value').then((snapshot) => {
            if (snapshot.exists()) {
                this.createPeerConnection();
                this.sendOffer();
                document.getElementById('peerName').textContent = peerId;
            } else {
                alert('对方不在线，请确保对方已打开页面');
                this.updateStatus('对方不在线', 'disconnected');
            }
        });
    }

    createPeerConnection() {
        // 配置ICE服务器（使用免费的STUN服务器）
        const config = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' },
                { urls: 'stun:stun4.l.google.com:19302' }
            ],
            iceCandidatePoolSize: 10
        };

        this.peerConnection = new RTCPeerConnection(config);

        // 创建数据通道（发起方）
        if (this.isInitiator) {
            this.dataChannel = this.peerConnection.createDataChannel('fileTransfer', {
                ordered: true, // 保证顺序
                maxRetransmits: 5 // 重传次数
            });
            this.setupDataChannel();
        }

        // 监听传入的数据通道
        this.peerConnection.ondatachannel = (event) => {
            this.dataChannel = event.channel;
            this.setupDataChannel();
        };

        // ICE候选处理
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendSignal({
                    type: 'candidate',
                    candidate: event.candidate
                });
            }
        };

        // 连接状态变化
        this.peerConnection.onconnectionstatechange = () => {
            const state = this.peerConnection.connectionState;
            console.log('Connection state:', state);

            if (state === 'connected') {
                this.updateStatus('已连接', 'connected');
                this.showTransferPanel();
            } else if (state === 'disconnected' || state === 'failed') {
                this.updateStatus('连接断开', 'disconnected');
                this.resetConnection();
            }
        };

        // ICE连接状态
        this.peerConnection.oniceconnectionstatechange = () => {
            const state = this.peerConnection.iceConnectionState;
            console.log('ICE state:', state);

            if (state === 'disconnected' || state === 'failed') {
                this.updateStatus('网络连接中断', 'disconnected');
            }
        };
    }

    setupDataChannel() {
        this.dataChannel.binaryType = 'arraybuffer';

        this.dataChannel.onopen = () => {
            console.log('Data channel opened');
            this.updateStatus('通道已建立', 'connected');
        };

        this.dataChannel.onclose = () => {
            console.log('Data channel closed');
            this.updateStatus('通道已关闭', 'disconnected');
        };

        this.dataChannel.onmessage = (event) => {
            this.handleMessage(event.data);
        };

        this.dataChannel.onerror = (error) => {
            console.error('Data channel error:', error);
        };
    }

    async sendOffer() {
        try {
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);

            this.sendSignal({
                type: 'offer',
                sdp: offer.sdp
            });
        } catch (error) {
            console.error('Error creating offer:', error);
            alert('创建连接失败: ' + error.message);
        }
    }

    async handleOffer(offer) {
        try {
            if (!this.peerConnection) {
                this.createPeerConnection();
            }

            await this.peerConnection.setRemoteDescription(new RTCSessionDescription({
                type: 'offer',
                sdp: offer.sdp
            }));

            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);

            this.sendSignal({
                type: 'answer',
                sdp: answer.sdp
            });

            // 处理之前收到的候选
            this.pendingCandidates.forEach(candidate => {
                this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            });
            this.pendingCandidates = [];

        } catch (error) {
            console.error('Error handling offer:', error);
        }
    }

    handleAnswer(answer) {
        if (!this.peerConnection) return;

        this.peerConnection.setRemoteDescription(new RTCSessionDescription({
            type: 'answer',
            sdp: answer.sdp
        })).catch(error => {
            console.error('Error setting answer:', error);
        });
    }

    handleCandidate(candidate) {
        if (!this.peerConnection) {
            // 存储候选，稍后添加
            this.pendingCandidates.push(candidate);
            return;
        }

        this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
            .catch(error => {
                console.error('Error adding ICE candidate:', error);
            });
    }

    sendSignal(message) {
        const signalRef = database.ref(`signaling/${this.getRoomId()}`).push();
        signalRef.set({
            from: this.localId,
            to: this.remoteId,
            type: message.type,
            data: message,
            timestamp: Date.now()
        });

        // 清理旧的信令消息（1分钟后）
        setTimeout(() => {
            signalRef.remove();
        }, 60000);
    }

    getRoomId() {
        // 确保房间ID按字母顺序排序，这样双方使用相同的ID
        const ids = [this.localId, this.remoteId].sort();
        return `${ids[0]}_${ids[1]}`;
    }

    listenForConnections() {
        // 注册自己为在线
        database.ref(`connections/${this.localId}`).set(true);

        // 监听信令消息
        database.ref(`signaling`).on('child_added', (snapshot) => {
            const roomId = snapshot.key;
            if (!roomId.includes(this.localId)) return;

            snapshot.ref.on('child_added', (messageSnapshot) => {
                const message = messageSnapshot.val();

                // 检查消息是否发给自己
                if (message.to !== this.localId && message.from !== this.remoteId) return;

                this.remoteId = message.from;
                document.getElementById('peerName').textContent = this.remoteId;

                switch (message.data.type) {
                    case 'offer':
                        this.handleOffer(message.data);
                        break;
                    case 'answer':
                        this.handleAnswer(message.data);
                        break;
                    case 'candidate':
                        this.handleCandidate(message.data.candidate);
                        break;
                }

                // 清理消息
                messageSnapshot.ref.remove();
            });
        });

        // 清理离线用户
        database.ref('connections').onDisconnect().remove();
    }

    handleMessage(data) {
        try {
            if (typeof data === 'string') {
                const message = JSON.parse(data);
                this.handleControlMessage(message);
            } else if (data instanceof ArrayBuffer) {
                this.handleFileChunk(data);
            }
        } catch (error) {
            console.error('Error handling message:', error);
        }
    }

    handleControlMessage(message) {
        switch (message.type) {
            case 'file-start':
                this.startReceivingFile(message);
                break;
            case 'file-chunk':
                // 处理文件块（实际在handleFileChunk中处理）
                break;
            case 'file-end':
                this.completeReceivingFile();
                break;
            case 'file-cancel':
                this.cancelReceivingFile();
                break;
        }
    }

    handleFiles(files) {
        if (!files || files.length === 0) return;
        if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
            alert('请先建立连接');
            return;
        }

        Array.from(files).forEach(file => {
            if (file.size > 100 * 1024 * 1024) {
                alert(`文件 "${file.name}" 超过100MB限制`);
                return;
            }

            this.addToQueue(file);
        });

        // 如果没有正在传输的文件，开始传输
        if (!this.currentTransfer) {
            this.startNextTransfer();
        }
    }

    addToQueue(file) {
        const transferId = Date.now() + Math.random();
        const transferItem = {
            id: transferId,
            file: file,
            progress: 0,
            status: 'waiting'
        };

        this.fileQueue.push(transferItem);
        this.updateQueueDisplay();
    }

    async startNextTransfer() {
        if (this.fileQueue.length === 0 || this.currentTransfer) return;

        this.currentTransfer = this.fileQueue[0];
        this.currentTransfer.status = 'sending';

        await this.sendFile(this.currentTransfer.file);

        // 传输完成，从队列移除
        this.fileQueue.shift();
        this.currentTransfer = null;

        // 继续下一个文件
        if (this.fileQueue.length > 0) {
            this.startNextTransfer();
        }
    }

    async sendFile(file) {
        const CHUNK_SIZE = 16384; // 16KB

        // 发送文件信息
        this.dataChannel.send(JSON.stringify({
            type: 'file-start',
            name: file.name,
            size: file.size,
            type: file.type,
            lastModified: file.lastModified
        }));

        // 分块发送文件
        const reader = file.stream().getReader();
        let offset = 0;
        let lastUpdate = Date.now();
        let bytesSent = 0;

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                // 发送数据块
                this.dataChannel.send(value);

                offset += value.byteLength;
                bytesSent += value.byteLength;

                // 更新进度（限制频率）
                const now = Date.now();
                if (now - lastUpdate > 100) { // 每秒更新10次
                    this.updateProgress(offset, file.size);
                    this.updateSpeed(bytesSent, now);
                    lastUpdate = now;
                    bytesSent = 0;
                }
            }

            // 发送结束标记
            this.dataChannel.send(JSON.stringify({
                type: 'file-end'
            }));

            console.log('File sent:', file.name);
            this.updateProgress(file.size, file.size);

            // 添加到历史记录
            this.addToHistory(file, 'sent');

        } catch (error) {
            console.error('Error sending file:', error);
            this.dataChannel.send(JSON.stringify({
                type: 'file-cancel'
            }));
        }
    }

    updateProgress(current, total) {
        const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

        document.getElementById('progressFill').style.width = percentage + '%';
        document.getElementById('progressText').textContent =
            `传输中: ${percentage}% (${this.formatBytes(current)} / ${this.formatBytes(total)})`;
    }

    updateSpeed(bytes, time) {
        const speed = bytes / (time / 1000); // bytes per second
        document.getElementById('speedText').textContent =
            `速度: ${this.formatBytes(speed)}/s`;
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    startReceivingFile(fileInfo) {
        console.log('Start receiving file:', fileInfo);
        // 实现接收逻辑...
    }

    completeReceivingFile() {
        console.log('File received');
        // 实现接收完成逻辑...
    }

    updateQueueDisplay() {
        const queueElement = document.getElementById('transferQueue');
        queueElement.innerHTML = '';

        this.fileQueue.forEach(item => {
            const div = document.createElement('div');
            div.className = 'transfer-item';
            div.innerHTML = `
                <div class="file-icon">
                    <svg width="20" height="20" fill="currentColor">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
                        <path d="M14 2v6h6"/>
                    </svg>
                </div>
                <div class="file-info">
                    <div class="file-name">${item.file.name}</div>
                    <div class="file-size">${this.formatBytes(item.file.size)}</div>
                </div>
                <div class="transfer-progress">
                    <div class="transfer-progress-fill" style="width: ${item.progress}%"></div>
                </div>
            `;
            queueElement.appendChild(div);
        });
    }

    addToHistory(file, direction) {
        const historyList = document.getElementById('historyList');
        const emptyState = historyList.querySelector('.empty-state');

        if (emptyState) {
            emptyState.remove();
            document.getElementById('fileList').classList.remove('hidden');
        }

        const item = document.createElement('div');
        item.className = 'history-item';
        item.innerHTML = `
            <div class="file-icon">
                <svg width="20" height="20" fill="currentColor">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
                    <path d="M14 2v6h6"/>
                </svg>
            </div>
            <div class="file-info">
                <div class="file-name">${file.name}</div>
                <div class="file-size">${this.formatBytes(file.size)} • ${direction === 'sent' ? '已发送' : '已接收'}</div>
            </div>
            <span style="color: var(--text-tertiary); font-size: 12px;">${new Date().toLocaleTimeString()}</span>
        `;

        historyList.insertBefore(item, historyList.firstChild);

        // 限制历史记录数量
        if (historyList.children.length > 10) {
            historyList.removeChild(historyList.lastChild);
        }
    }

    updateStatus(text, state) {
        const indicator = document.getElementById('statusIndicator');
        const dot = indicator.querySelector('.dot');
        const span = indicator.querySelector('span');

        span.textContent = text;
        dot.className = 'dot';
        dot.classList.add(state);
    }

    showTransferPanel() {
        document.getElementById('connectionPanel').classList.add('hidden');
        document.getElementById('transferPanel').classList.remove('hidden');
        document.getElementById('fileList').classList.remove('hidden');
    }

    resetConnection() {
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        this.dataChannel = null;
        this.remoteId = null;
        this.isInitiator = false;
        this.pendingCandidates = [];

        document.getElementById('transferPanel').classList.add('hidden');
        document.getElementById('connectionPanel').classList.remove('hidden');
    }

    disconnect() {
        if (confirm('确定要断开连接吗？')) {
            this.resetConnection();
            this.updateStatus('已断开连接', 'disconnected');
        }
    }
}

// 工具函数
function copyMyId() {
    const myId = document.getElementById('myId').textContent;
    navigator.clipboard.writeText(myId).then(() => {
        alert('ID已复制到剪贴板');
    }).catch(err => {
        console.error('复制失败:', err);
    });
}

function clearHistory() {
    if (confirm('确定要清空传输历史吗？')) {
        document.getElementById('historyList').innerHTML =
            '<div class="empty-state">暂无传输记录</div>';
        document.getElementById('fileList').classList.add('hidden');
    }
}

// 页面加载时初始化
let fileTransfer;

window.addEventListener('DOMContentLoaded', () => {
    fileTransfer = new FileTransfer();
});

// 页面卸载时清理
window.addEventListener('beforeunload', () => {
    database.ref(`connections/${fileTransfer.localId}`).remove();
});