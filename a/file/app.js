class QuarkTransfer {
    constructor() {
        this.peer = null;
        this.connection = null;
        this.files = [];
        this.currentTransfers = new Map();
        this.history = [];
        this.deviceId = this.generateDeviceId();
        this.isConnected = false;

        this.init();
    }

    init() {
        // 初始化UI
        this.initUI();

        // 初始化设置
        this.loadSettings();

        // 加载历史记录
        this.loadHistory();

        // 初始化WebRTC
        this.initWebRTC();

        // 绑定事件
        this.bindEvents();
    }

    initUI() {
        // 显示设备ID
        document.getElementById('deviceId').textContent = this.deviceId;

        // 更新状态
        this.updateStatus('等待连接...', 'disconnected');

        // 生成初始连接码
        this.generateCode();

        // 初始化拖放功能
        this.initDragAndDrop();
    }

    generateDeviceId() {
        // 生成唯一设备ID
        return 'QK-' + Math.random().toString(36).substr(2, 8).toUpperCase();
    }

    initWebRTC() {
        // 创建简单的Peer实例用于局域网发现
        try {
            // 尝试使用WebRTC进行局域网通信
            const config = {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:global.stun.twilio.com:3478' }
                ]
            };

            this.peer = new SimplePeer({
                initiator: false,
                trickle: false,
                config: config
            });

            this.setupPeerEvents();
        } catch (error) {
            console.error('WebRTC初始化失败:', error);
        }
    }

    setupPeerEvents() {
        this.peer.on('signal', (data) => {
            // 发送信令数据给对等方
            if (this.connection) {
                this.sendMessage({ type: 'signal', data });
            }
        });

        this.peer.on('connect', () => {
            console.log('WebRTC连接成功');
            this.isConnected = true;
            this.updateStatus('已连接', 'connected');

            // 发送设备信息
            this.sendMessage({
                type: 'device_info',
                id: this.deviceId,
                name: navigator.userAgent
            });
        });

        this.peer.on('data', (data) => {
            this.handleIncomingData(data);
        });

        this.peer.on('error', (err) => {
            console.error('WebRTC错误:', err);
            this.updateStatus('连接错误', 'error');
        });

        this.peer.on('close', () => {
            this.isConnected = false;
            this.updateStatus('连接断开', 'disconnected');
        });
    }

    // 局域网发现功能
    async discoverDevices() {
        try {
            // 尝试通过mDNS或WebSocket发现设备
            const devices = await this.scanLocalNetwork();
            this.updateDeviceList(devices);
        } catch (error) {
            console.log('自动发现失败，使用手动连接模式');
        }
    }

    async scanLocalNetwork() {
        const devices = [];

        // 尝试通过WebRTC数据通道发现
        for (let i = 2; i <= 254; i++) {
            // 这里简化处理，实际需要更复杂的发现机制
            const ip = `192.168.1.${i}`;

            // 尝试建立连接
            try {
                // 这里应该是实际的发现逻辑
                // 由于浏览器限制，完整的局域网发现需要额外的服务器
            } catch (error) {
                continue;
            }
        }

        return devices;
    }

    // 连接管理
    connectManual() {
        const code = document.getElementById('connectionCode').value;
        if (code.length === 6 && /^\d+$/.test(code)) {
            this.connectUsingCode(code);
        } else {
            alert('请输入6位数字连接码');
        }
    }

    connectUsingCode(code) {
        // 使用连接码建立连接
        // 这里简化处理，实际应该通过某种方式找到对应设备
        this.updateStatus('正在连接...', 'connecting');

        // 模拟连接成功
        setTimeout(() => {
            this.updateStatus('已连接', 'connected');
            this.showMessage('连接成功！');
        }, 1000);
    }

    // 文件传输
    async sendFiles(files) {
        if (!this.isConnected) {
            alert('请先建立连接');
            return;
        }

        const maxSize = parseInt(document.getElementById('maxFileSize').value) * 1024 * 1024;

        for (const file of files) {
            if (file.size > maxSize) {
                alert(`文件 ${file.name} 超过${maxSize / (1024 * 1024)}MB限制`);
                continue;
            }

            // 创建传输任务
            const transferId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
            this.createTransferUI(file, transferId);

            // 发送文件元数据
            this.sendMessage({
                type: 'file_start',
                id: transferId,
                name: file.name,
                size: file.size,
                type: file.type,
                lastModified: file.lastModified
            });

            // 分块发送文件
            const chunkSize = parseInt(document.getElementById('chunkSize').value) * 1024 * 1024;
            const totalChunks = Math.ceil(file.size / chunkSize);
            let chunkIndex = 0;

            const reader = new FileReader();
            let offset = 0;

            reader.onload = (e) => {
                const chunk = e.target.result;

                this.sendMessage({
                    type: 'file_chunk',
                    id: transferId,
                    chunkIndex: chunkIndex,
                    totalChunks: totalChunks,
                    data: chunk
                });

                // 更新进度
                this.updateTransferProgress(transferId, chunkIndex + 1, totalChunks);

                chunkIndex++;
                offset += chunkSize;

                if (offset < file.size) {
                    this.readNextChunk(file, offset, chunkSize, reader);
                } else {
                    // 发送完成
                    this.sendMessage({
                        type: 'file_end',
                        id: transferId
                    });

                    // 添加到历史记录
                    this.addToHistory(file, 'sent');
                }
            };

            this.readNextChunk(file, offset, chunkSize, reader);
        }
    }

    readNextChunk(file, offset, chunkSize, reader) {
        const chunk = file.slice(offset, offset + chunkSize);
        reader.readAsArrayBuffer(chunk);
    }

    // 接收文件
    handleIncomingData(data) {
        try {
            const message = JSON.parse(data.toString());

            switch (message.type) {
                case 'file_start':
                    this.startReceivingFile(message);
                    break;

                case 'file_chunk':
                    this.receiveFileChunk(message);
                    break;

                case 'file_end':
                    this.finishReceivingFile(message.id);
                    break;

                case 'signal':
                    if (this.peer) {
                        this.peer.signal(message.data);
                    }
                    break;

                case 'device_info':
                    this.showConnectionRequest(message);
                    break;
            }
        } catch (error) {
            console.error('处理数据错误:', error);
        }
    }

    startReceivingFile(message) {
        const autoAccept = document.getElementById('autoAccept').checked;

        if (!autoAccept) {
            this.showFileRequestDialog(message);
            return;
        }

        this.createReceiverUI(message);
        this.currentTransfers.set(message.id, {
            name: message.name,
            size: message.size,
            chunks: [],
            received: 0
        });
    }

    receiveFileChunk(message) {
        const transfer = this.currentTransfers.get(message.id);
        if (transfer) {
            transfer.chunks[message.chunkIndex] = message.data;
            transfer.received++;

            // 更新进度
            this.updateReceiverProgress(message.id, transfer.received, message.totalChunks);
        }
    }

    finishReceivingFile(transferId) {
        const transfer = this.currentTransfers.get(transferId);
        if (transfer) {
            // 合并所有chunks
            const totalSize = transfer.chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
            const blob = new Blob(transfer.chunks, { type: 'application/octet-stream' });

            // 创建下载链接
            this.createDownloadLink(blob, transfer.name);

            // 添加到历史记录
            this.addToHistory({
                name: transfer.name,
                size: transfer.size
            }, 'received');

            this.currentTransfers.delete(transferId);
        }
    }

    // UI更新
    updateStatus(text, status) {
        const indicator = document.getElementById('statusIndicator');
        const statusText = document.getElementById('statusText');

        statusText.textContent = text;

        indicator.className = 'status-indicator';
        switch (status) {
            case 'connected':
                indicator.classList.add('connected');
                document.getElementById('transferBtn').disabled = false;
                break;
            case 'connecting':
                indicator.classList.add('connecting');
                break;
            case 'error':
                indicator.classList.add('error');
                break;
            default:
                indicator.classList.add('disconnected');
                document.getElementById('transferBtn').disabled = true;
        }
    }

    createTransferUI(file, transferId) {
        const progressList = document.getElementById('fileProgressList');
        const item = document.createElement('div');
        item.className = 'file-progress-item';
        item.id = `transfer-${transferId}`;
        item.innerHTML = `
            <div class="file-progress-info">
                <span class="file-name">${file.name}</span>
                <span class="file-progress-text">准备中...</span>
            </div>
            <div class="progress-bar">
                <div class="progress-fill" style="width: 0%"></div>
            </div>
        `;
        progressList.appendChild(item);

        document.getElementById('progressSection').style.display = 'block';
    }

    updateTransferProgress(transferId, current, total) {
        const percent = (current / total) * 100;
        const item = document.getElementById(`transfer-${transferId}`);

        if (item) {
            const progressBar = item.querySelector('.progress-fill');
            const progressText = item.querySelector('.file-progress-text');

            progressBar.style.width = `${percent}%`;
            progressText.textContent = `${Math.round(percent)}% (${current}/${total})`;
        }

        // 更新总体进度
        this.updateOverallProgress();
    }

    // 历史记录管理
    addToHistory(file, direction) {
        const historyItem = {
            id: Date.now(),
            name: file.name,
            size: file.size,
            direction: direction,
            timestamp: new Date().toLocaleString(),
            device: this.deviceId
        };

        this.history.unshift(historyItem);
        this.saveHistory();
        this.updateHistoryUI();
    }

    saveHistory() {
        if (document.getElementById('saveHistory').checked) {
            localStorage.setItem('quark_transfer_history', JSON.stringify(this.history));
        }
    }

    loadHistory() {
        const saved = localStorage.getItem('quark_transfer_history');
        if (saved) {
            this.history = JSON.parse(saved);
            this.updateHistoryUI();
        }
    }

    updateHistoryUI() {
        const historyList = document.getElementById('historyList');
        historyList.innerHTML = '';

        if (this.history.length === 0) {
            historyList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-history"></i>
                    <p>暂无传输记录</p>
                </div>
            `;
            return;
        }

        this.history.forEach(item => {
            const element = document.createElement('div');
            element.className = 'history-item';
            element.innerHTML = `
                <div class="history-info">
                    <div class="history-name">${item.name}</div>
                    <div class="history-meta">
                        <span class="history-size">${this.formatSize(item.size)}</span>
                        <span class="history-time">${item.timestamp}</span>
                        <span class="history-direction ${item.direction}">
                            ${item.direction === 'sent' ? '发送' : '接收'}
                        </span>
                    </div>
                </div>
                <div class="history-actions">
                    <button class="btn-icon" onclick="downloadHistoryFile(${item.id})">
                        <i class="fas fa-download"></i>
                    </button>
                </div>
            `;
            historyList.appendChild(element);
        });
    }

    // 工具函数
    formatSize(bytes) {
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;

        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }

        return `${size.toFixed(2)} ${units[unitIndex]}`;
    }

    sendMessage(message) {
        if (this.peer && this.peer.connected) {
            this.peer.send(JSON.stringify(message));
        }
    }

    bindEvents() {
        // 设置切换
        document.querySelectorAll('.setting-item input').forEach(input => {
            input.addEventListener('change', () => this.saveSettings());
        });
    }

    loadSettings() {
        const settings = JSON.parse(localStorage.getItem('quark_settings') || '{}');
        Object.keys(settings).forEach(key => {
            const element = document.getElementById(key);
            if (element) {
                if (element.type === 'checkbox') {
                    element.checked = settings[key];
                } else {
                    element.value = settings[key];
                }
            }
        });
    }

    saveSettings() {
        const settings = {
            autoAccept: document.getElementById('autoAccept').checked,
            saveHistory: document.getElementById('saveHistory').checked,
            maxFileSize: document.getElementById('maxFileSize').value,
            chunkSize: document.getElementById('chunkSize').value
        };
        localStorage.setItem('quark_settings', JSON.stringify(settings));
    }
}

// 全局函数
let app;

function initApp() {
    app = new QuarkTransfer();
}

function handleFilesSelected(files) {
    const fileList = document.getElementById('fileList');
    const totalFiles = document.getElementById('totalFiles');
    const totalSize = document.getElementById('totalSize');

    // 清除空状态
    if (fileList.querySelector('.empty-state')) {
        fileList.innerHTML = '';
    }

    let totalSizeBytes = 0;

    Array.from(files).forEach(file => {
        totalSizeBytes += file.size;

        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.innerHTML = `
            <div class="file-icon">
                <i class="fas fa-file"></i>
            </div>
            <div class="file-info">
                <div class="file-name">${file.name}</div>
                <div class="file-size">${app.formatSize(file.size)}</div>
            </div>
            <button class="btn-icon" onclick="removeFile(this)">
                <i class="fas fa-times"></i>
            </button>
        `;

        fileList.appendChild(fileItem);
    });

    totalFiles.textContent = files.length;
    totalSize.textContent = app.formatSize(totalSizeBytes);
}

function startTransfer() {
    if (app && app.isConnected) {
        const fileInput = document.getElementById('fileInput');
        app.sendFiles(Array.from(fileInput.files));
    }
}

function generateCode() {
    const code = Math.floor(100000 + Math.random() * 900000);
    document.getElementById('myCode').textContent =
        code.toString().replace(/(\d{3})/g, '$1 ').trim();
    return code;
}

// 初始化应用
window.addEventListener('DOMContentLoaded', initApp);

// 拖放功能
function initDragAndDrop() {
    const fileList = document.getElementById('fileList');

    fileList.addEventListener('dragover', (e) => {
        e.preventDefault();
        fileList.classList.add('drag-over');
    });

    fileList.addEventListener('dragleave', () => {
        fileList.classList.remove('drag-over');
    });

    fileList.addEventListener('drop', (e) => {
        e.preventDefault();
        fileList.classList.remove('drag-over');

        if (e.dataTransfer.files.length) {
            handleFilesSelected(e.dataTransfer.files);
        }
    });
}