// === 添加在 app.js 最开头 ===
console.log('=== WebRTC 兼容性测试 ===');

// 1. 测试浏览器支持
if (!window.RTCPeerConnection) {
    console.error('❌ 浏览器不支持 RTCPeerConnection');
    alert('您的浏览器不支持WebRTC，请使用Chrome/Firefox/Edge/Safari的最新版本');
} else {
    console.log('✅ 浏览器支持 WebRTC');
}

// 2. 测试 STUN 服务器
async function testSTUN() {
    console.log('测试STUN服务器连接...');
    const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    return new Promise((resolve, reject) => {
        pc.createDataChannel('test');
        pc.createOffer().then(offer => {
            console.log('✅ STUN服务器可达');
            pc.setLocalDescription(offer);
            resolve(true);
        }).catch(err => {
            console.error('❌ STUN服务器连接失败:', err);
            reject(err);
        });

        // 超时处理
        setTimeout(() => {
            console.warn('⚠️ STUN测试超时');
            resolve(false);
        }, 3000);
    });
}

// 3. 测试 Firebase 连接
async function testFirebase() {
    console.log('测试Firebase连接...');
    try {
        const connectedRef = firebase.database().ref('.info/connected');
        connectedRef.once('value').then(snapshot => {
            if (snapshot.val() === true) {
                console.log('✅ Firebase连接正常');
            } else {
                console.warn('⚠️ Firebase连接不稳定');
            }
        });
    } catch (error) {
        console.error('❌ Firebase连接失败:', error);
    }
}

// 4. 页面加载时运行测试
window.addEventListener('load', async () => {
    console.log('开始系统测试...');

    // 等待Firebase初始化
    setTimeout(async () => {
        await testFirebase();
        await testSTUN();

        console.log('=== 系统测试完成 ===');
        console.log('提示：如果卡在"创建新的Peer Connection"，请检查：');
        console.log('1. 浏览器控制台是否有错误');
        console.log('2. 防火墙是否阻止WebRTC');
        console.log('3. 是否使用HTTPS（GitHub Pages自动提供）');
    }, 1000);
});

// === 以下是你的现有代码，但需要修改关键部分 ===


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

// 初始化 Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// 2. 核心类定义
class FileTransfer {
    constructor() {
        // 生成唯一用户ID
        this.localId = this.generateUserId();
        this.remoteId = null;

        // WebRTC 相关
        this.peerConnection = null;
        this.dataChannel = null;
        this.isInitiator = false;

        // 信令状态管理
        this.pendingIceCandidates = [];
        this.hasSetLocalOffer = false;
        this.hasSetRemoteAnswer = false;
        this.connectionAttempts = 0;

        // 文件传输相关
        this.fileQueue = [];
        this.currentTransfer = null;
        this.receivingFile = null;
        this.receivedChunks = [];

        // 初始化
        this.init();
    }

    // 生成用户ID（保存到localStorage，保持稳定）
    generateUserId() {
        let userId = localStorage.getItem('p2p_user_id');
        if (!userId) {
            userId = 'user_' + Math.random().toString(36).substring(2, 10);
            localStorage.setItem('p2p_user_id', userId);
        }
        return userId;
    }

    init() {
        console.log('初始化文件传输系统，用户ID:', this.localId);

        // 显示本地ID
        document.getElementById('myId').textContent = this.localId;

        // 设置事件监听器
        this.setupEventListeners();

        // 注册为在线用户
        this.registerOnline();

        // 监听信令消息
        this.setupSignalListener();

        // 更新状态
        this.updateStatus('准备连接', 'ready');
    }

    setupEventListeners() {
        // 连接按钮
        document.getElementById('connectBtn').addEventListener('click', () => {
            this.connectToPeer();
        });

        // 输入框回车连接
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

        // 断开连接按钮
        const disconnectBtn = document.getElementById('disconnectBtn');
        if (disconnectBtn) {
            disconnectBtn.addEventListener('click', () => this.disconnect());
        }
    }

    registerOnline() {
        // 在Firebase中注册为在线用户
        database.ref(`connections/${this.localId}`).set({
            online: true,
            lastSeen: Date.now()
        });

        // 页面关闭时清理
        window.addEventListener('beforeunload', () => {
            database.ref(`connections/${this.localId}`).remove();
        });
    }

    setupSignalListener() {
        // 监听整个信令节点
        database.ref('signaling').on('child_added', (roomSnapshot) => {
            const roomId = roomSnapshot.key;

            // 检查是否与我们相关的房间
            if (!this.isOurRoom(roomId)) return;

            // 监听房间内的消息
            roomSnapshot.ref.on('child_added', (messageSnapshot) => {
                const message = messageSnapshot.val();

                // 检查消息是否发给我们
                if (message.to !== this.localId) return;

                console.log('收到信令消息:', message.type);

                // 处理消息
                this.handleSignalMessage(message.data);

                // 立即删除已处理的消息（防止重复处理）
                messageSnapshot.ref.remove();
            });
        });
    }

    isOurRoom(roomId) {
        // 房间ID格式：sorted(id1_id2)
        const ids = roomId.split('_');
        return ids.includes(this.localId);
    }

    async connectToPeer() {
        const peerId = document.getElementById('peerIdInput').value.trim();
        if (!peerId) {
            alert('请输入对方ID');
            return;
        }

        if (peerId === this.localId) {
            alert('不能连接自己');
            return;
        }

        this.remoteId = peerId;
        this.isInitiator = this.localId < peerId;

        this.updateStatus('正在连接...', 'connecting');

        // 添加连接超时
        const connectionTimeout = setTimeout(() => {
            if (this.peerConnection &&
                this.peerConnection.connectionState !== 'connected' &&
                this.peerConnection.iceConnectionState !== 'connected') {
                console.error('连接超时（15秒）');
                this.updateStatus('连接超时', 'error');
                this.resetConnection();
                alert('连接超时，请检查网络或重试');
            }
        }, 15000);

        try {
            // 检查对方是否在线
            const snapshot = await database.ref(`connections/${peerId}`).once('value');
            if (!snapshot.exists()) {
                throw new Error('对方不在线，请确保对方已打开页面');
            }

            console.log('对方在线，开始创建连接');

            // 创建WebRTC连接
            this.createPeerConnection();

            // 显示对方ID
            document.getElementById('peerName').textContent = peerId;

            // 如果是发起方，创建offer
            if (this.isInitiator) {
                console.log('开始创建Offer...');
                await this.createAndSendOffer();
            }

            // 清除超时定时器
            clearTimeout(connectionTimeout);

        } catch (error) {
            console.error('连接失败:', error);
            clearTimeout(connectionTimeout);
            this.updateStatus('连接失败', 'error');
            alert(`连接失败: ${error.message}`);
            this.resetConnection();
        }
    }

    createPeerConnection() {
        console.log('创建新的Peer Connection - 开始');

        // 关闭现有的连接
        if (this.peerConnection) {
            console.log('关闭现有连接');
            this.peerConnection.close();
            this.peerConnection = null;
        }

        // 简化配置 - 只用一个STUN服务器测试
        const config = {
            iceServers: [
                {
                    urls: [
                        'stun:stun.l.google.com:19302',
                        'stun:stun1.l.google.com:19302'
                    ]
                }
            ],
            // 简化配置，避免兼容性问题
            iceTransportPolicy: 'all',
            bundlePolicy: 'balanced',
            rtcpMuxPolicy: 'require'
        };

        console.log('使用配置:', config);

        try {
            this.peerConnection = new RTCPeerConnection(config);
            console.log('✅ Peer Connection 创建成功');
        } catch (error) {
            console.error('❌ 创建 Peer Connection 失败:', error);
            this.updateStatus('创建连接失败: ' + error.message, 'error');
            return; // 直接返回，不继续执行
        }

        // 重置状态
        this.hasSetLocalOffer = false;
        this.hasSetRemoteAnswer = false;
        this.pendingIceCandidates = [];

        // 设置事件监听器 - 添加详细的日志
        console.log('设置事件监听器...');

        // ICE候选处理
        this.peerConnection.onicecandidate = (event) => {
            console.log('onicecandidate 触发:', event.candidate ? '有候选' : '收集完成');

            if (!event.candidate) {
                console.log('ICE候选收集完成');
                return;
            }

            // 简化候选发送，避免复杂对象
            const candidate = {
                candidate: event.candidate.candidate,
                sdpMid: event.candidate.sdpMid || '0',
                sdpMLineIndex: event.candidate.sdpMLineIndex || 0
            };

            console.log('发送ICE候选:', candidate.candidate.substring(0, 50) + '...');

            if (this.remoteId) {
                this.sendSignal('candidate', candidate);
            }
        };

        // ICE连接状态
        this.peerConnection.oniceconnectionstatechange = () => {
            const state = this.peerConnection.iceConnectionState;
            console.log('ICE连接状态变化:', state);

            switch (state) {
                case 'checking':
                    this.updateStatus('正在建立连接...', 'connecting');
                    break;
                case 'connected':
                    console.log('✅ ICE连接成功');
                    this.updateStatus('已连接', 'connected');
                    break;
                case 'completed':
                    console.log('✅ ICE连接完成');
                    break;
                case 'failed':
                    console.error('❌ ICE连接失败');
                    this.updateStatus('连接失败', 'error');
                    this.attemptReconnect();
                    break;
                case 'disconnected':
                    console.warn('⚠️ ICE连接断开');
                    this.updateStatus('连接断开', 'error');
                    break;
            }
        };

        // 连接状态
        this.peerConnection.onconnectionstatechange = () => {
            const state = this.peerConnection.connectionState;
            console.log('Peer连接状态变化:', state);

            if (state === 'connected') {
                console.log('✅ Peer-to-Peer连接成功');
                this.showTransferPanel();
            } else if (state === 'failed' || state === 'disconnected') {
                console.error('❌ Peer连接失败');
            }
        };

        // 重要：添加数据通道事件监听
        this.peerConnection.ondatachannel = (event) => {
            console.log('收到数据通道:', event.channel.label);
            this.setupDataChannel(event.channel);
        };

        // 如果是发起方，立即创建数据通道
        if (this.isInitiator) {
            console.log('作为发起方，创建数据通道');
            this.createDataChannel();
        } else {
            console.log('作为接收方，等待数据通道');
        }

        console.log('创建新的Peer Connection - 完成');
    }

    setupPeerConnectionEvents() {
        // ICE候选处理 - 修复版本
        this.peerConnection.onicecandidate = (event) => {
            if (!event.candidate) {
                console.log('ICE收集完成');
                return;
            }

            // 发送ICE候选
            this.sendSignal('candidate', {
                type: 'candidate',
                candidate: event.candidate.candidate,
                sdpMid: event.candidate.sdpMid || '0',  // 防止null
                sdpMLineIndex: event.candidate.sdpMLineIndex ?? 0, // 防止null
                usernameFragment: event.candidate.usernameFragment || null
            });
        };

        // ICE连接状态
        this.peerConnection.oniceconnectionstatechange = () => {
            const state = this.peerConnection.iceConnectionState;
            console.log('ICE连接状态:', state);

            if (state === 'disconnected' || state === 'failed') {
                this.updateStatus('连接中断', 'error');
                this.attemptReconnect();
            } else if (state === 'connected') {
                this.updateStatus('已连接', 'connected');
            }
        };

        // Peer连接状态
        this.peerConnection.onconnectionstatechange = () => {
            const state = this.peerConnection.connectionState;
            console.log('Peer连接状态:', state);

            if (state === 'connected') {
                this.showTransferPanel();
            } else if (state === 'disconnected' || state === 'failed') {
                this.resetConnection();
            }
        };
    }

    createDataChannel() {
        console.log('创建数据通道');
        this.dataChannel = this.peerConnection.createDataChannel('fileTransfer', {
            ordered: true, // 保证顺序
            maxPacketLifeTime: 3000, // 3秒重传超时
            maxRetransmits: 5 // 最大重传次数
        });

        this.setupDataChannel(this.dataChannel);
    }

    setupDataChannel(channel) {
        this.dataChannel = channel;
        this.dataChannel.binaryType = 'arraybuffer';

        this.dataChannel.onopen = () => {
            console.log('数据通道已打开');
            this.updateStatus('已连接，可以传输文件', 'connected');
            this.showTransferPanel();
        };

        this.dataChannel.onclose = () => {
            console.log('数据通道已关闭');
            this.updateStatus('连接已关闭', 'disconnected');
        };

        this.dataChannel.onmessage = (event) => {
            this.handleIncomingMessage(event.data);
        };

        this.dataChannel.onerror = (error) => {
            console.error('数据通道错误:', error);
        };
    }

    async createAndSendOffer() {
        try {
            console.log('创建Offer');

            // 确保我们没有重复的本地描述
            if (this.hasSetLocalOffer) {
                throw new Error('已经设置了本地Offer');
            }

            const offer = await this.peerConnection.createOffer({
                offerToReceiveAudio: false,
                offerToReceiveVideo: false
            });

            console.log('设置本地描述');
            await this.peerConnection.setLocalDescription(offer);
            this.hasSetLocalOffer = true;

            // 发送Offer
            this.sendSignal('offer', {
                type: 'offer',
                sdp: offer.sdp
            });

        } catch (error) {
            console.error('创建Offer失败:', error);
            this.updateStatus('创建连接失败', 'error');

            // 如果是SDP错误，重试
            if (error.toString().includes('SDP')) {
                this.retryConnection();
            }
        }
    }

    handleSignalMessage(data) {
        if (!data || !data.type) return;

        try {
            switch (data.type) {
                case 'offer':
                    this.handleOffer(data);
                    break;
                case 'answer':
                    this.handleAnswer(data);
                    break;
                case 'candidate':
                    this.handleCandidate(data);
                    break;
                case 'close':
                    this.handleRemoteClose();
                    break;
            }
        } catch (error) {
            console.error('处理信令消息失败:', error);
        }
    }

    async handleOffer(offerData) {
        console.log('处理Offer');

        if (!this.peerConnection) {
            this.createPeerConnection();
        }

        try {
            const offer = new RTCSessionDescription({
                type: 'offer',
                sdp: offerData.sdp
            });

            // 设置远程描述
            await this.peerConnection.setRemoteDescription(offer);
            console.log('远程Offer设置成功');

            // 处理之前缓存的ICE候选
            this.processPendingCandidates();

            // 创建并发送Answer
            const answer = await this.peerConnection.createAnswer({
                offerToReceiveAudio: false,
                offerToReceiveVideo: false
            });

            await this.peerConnection.setLocalDescription(answer);
            this.hasSetLocalOffer = true;

            // 发送Answer
            this.sendSignal('answer', {
                type: 'answer',
                sdp: answer.sdp
            });

        } catch (error) {
            console.error('处理Offer失败:', error);
            this.updateStatus('处理连接请求失败', 'error');
        }
    }

    async handleAnswer(answerData) {
        console.log('处理Answer');

        try {
            const answer = new RTCSessionDescription({
                type: 'answer',
                sdp: answerData.sdp
            });

            // 关键修复：检查当前本地描述
            if (!this.peerConnection.localDescription) {
                console.error('没有本地描述，无法设置远程Answer');
                this.retryConnection();
                return;
            }

            // 设置远程描述
            await this.peerConnection.setRemoteDescription(answer);
            this.hasSetRemoteAnswer = true;
            console.log('远程Answer设置成功');

            // 处理之前缓存的ICE候选
            this.processPendingCandidates();

        } catch (error) {
            console.error('处理Answer失败:', error);

            // 如果是SDP不匹配，尝试重新协商
            if (error.toString().includes('SDP does not match')) {
                console.log('SDP不匹配，重新协商...');
                this.retryConnection();
            }
        }
    }

    async handleCandidate(candidateData) {
        if (!candidateData.candidate) return;

        try {
            // 修复：处理可能的null值
            const iceCandidate = new RTCIceCandidate({
                candidate: candidateData.candidate,
                sdpMid: candidateData.sdpMid || null,
                sdpMLineIndex: candidateData.sdpMLineIndex ?? null,
                usernameFragment: candidateData.usernameFragment || null
            });

            // 如果还没有设置远程描述，缓存候选
            if (!this.peerConnection.remoteDescription) {
                this.pendingIceCandidates.push(iceCandidate);
                return;
            }

            // 添加ICE候选
            await this.peerConnection.addIceCandidate(iceCandidate);

        } catch (error) {
            // 忽略某些无害的错误
            if (!error.toString().includes('duplicate') &&
                !error.toString().includes('No remote description set')) {
                console.warn('添加ICE候选失败:', error);
            }
        }
    }

    processPendingCandidates() {
        if (this.pendingIceCandidates.length === 0) return;

        console.log('处理缓存的ICE候选:', this.pendingIceCandidates.length);

        this.pendingIceCandidates.forEach(async (candidate) => {
            try {
                await this.peerConnection.addIceCandidate(candidate);
            } catch (error) {
                console.error('添加缓存候选失败:', error);
            }
        });

        this.pendingIceCandidates = [];
    }

    sendSignal(type, data) {
        if (!this.remoteId) return;

        // 生成房间ID（排序确保双方使用相同的ID）
        const roomId = this.getRoomId();

        const signalRef = database.ref(`signaling/${roomId}`).push();
        signalRef.set({
            from: this.localId,
            to: this.remoteId,
            type: type,
            data: data,
            timestamp: Date.now()
        });

        // 30秒后自动清理
        setTimeout(() => {
            signalRef.remove().catch(() => { });
        }, 30000);
    }

    getRoomId() {
        const ids = [this.localId, this.remoteId].sort();
        return `${ids[0]}_${ids[1]}`;
    }

    handleFiles(files) {
        if (!files || files.length === 0) return;

        // 检查连接状态
        if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
            alert('请先建立连接');
            return;
        }

        // 处理每个文件
        Array.from(files).forEach(file => {
            if (file.size > 100 * 1024 * 1024) {
                alert(`文件 "${file.name}" 超过100MB限制`);
                return;
            }

            this.addToTransferQueue(file);
        });

        // 如果没有正在传输的文件，开始传输
        if (!this.currentTransfer) {
            this.startNextTransfer();
        }
    }

    addToTransferQueue(file) {
        const transferId = Date.now() + Math.random();
        const transferItem = {
            id: transferId,
            file: file,
            progress: 0,
            status: '等待中'
        };

        this.fileQueue.push(transferItem);
        this.updateQueueDisplay();

        console.log(`添加到传输队列: ${file.name} (${this.formatBytes(file.size)})`);
    }

    updateQueueDisplay() {
        const queueElement = document.getElementById('transferQueue');
        if (!queueElement) return;

        queueElement.innerHTML = '';

        this.fileQueue.forEach((item, index) => {
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
                    <div class="file-size">${this.formatBytes(item.file.size)} - ${item.status}</div>
                </div>
                <div class="transfer-progress">
                    <div class="transfer-progress-fill" style="width: ${item.progress}%"></div>
                </div>
            `;
            queueElement.appendChild(div);
        });
    }

    async startNextTransfer() {
        if (this.fileQueue.length === 0 || this.currentTransfer) return;

        this.currentTransfer = this.fileQueue[0];
        this.currentTransfer.status = '传输中';

        await this.sendFile(this.currentTransfer.file);

        // 传输完成，从队列移除
        this.fileQueue.shift();
        this.currentTransfer = null;

        // 继续下一个文件
        if (this.fileQueue.length > 0) {
            setTimeout(() => this.startNextTransfer(), 500);
        }
    }

    async sendFile(file) {
        const CHUNK_SIZE = 16 * 1024; // 16KB

        console.log(`开始发送文件: ${file.name}`);

        try {
            // 发送文件元数据
            this.dataChannel.send(JSON.stringify({
                type: 'file-start',
                name: file.name,
                size: file.size,
                mimeType: file.type,
                lastModified: file.lastModified
            }));

            // 分块发送文件
            let offset = 0;
            const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

            for (let i = 0; i < totalChunks; i++) {
                const chunk = file.slice(offset, offset + CHUNK_SIZE);
                const arrayBuffer = await this.readFileChunk(chunk);

                // 发送数据块
                this.dataChannel.send(arrayBuffer);

                offset += CHUNK_SIZE;

                // 更新进度
                const progress = Math.round((offset / file.size) * 100);
                this.updateProgress(offset, file.size);

                // 添加小的延迟，防止阻塞
                if (i % 10 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
            }

            // 发送完成标记
            this.dataChannel.send(JSON.stringify({
                type: 'file-end'
            }));

            console.log(`文件发送完成: ${file.name}`);

            // 添加到历史记录
            this.addToHistory(file, 'sent');

            // 重置进度条
            this.updateProgress(0, 1);

        } catch (error) {
            console.error('发送文件失败:', error);

            // 发送取消标记
            this.dataChannel.send(JSON.stringify({
                type: 'file-cancel'
            }));
        }
    }

    readFileChunk(chunk) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsArrayBuffer(chunk);
        });
    }

    handleIncomingMessage(data) {
        try {
            if (typeof data === 'string') {
                const message = JSON.parse(data);
                this.handleControlMessage(message);
            } else if (data instanceof ArrayBuffer) {
                this.handleFileChunk(data);
            }
        } catch (error) {
            console.error('处理消息失败:', error);
        }
    }

    handleControlMessage(message) {
        console.log('收到控制消息:', message.type);

        switch (message.type) {
            case 'file-start':
                this.startReceivingFile(message);
                break;
            case 'file-end':
                this.completeReceivingFile();
                break;
            case 'file-cancel':
                this.cancelReceivingFile();
                break;
        }
    }

    startReceivingFile(fileInfo) {
        console.log('开始接收文件:', fileInfo.name);

        this.receivingFile = {
            name: fileInfo.name,
            size: fileInfo.size,
            mimeType: fileInfo.mimeType,
            receivedSize: 0,
            chunks: []
        };

        this.receivedChunks = [];

        // 显示接收状态
        this.updateProgress(0, fileInfo.size);
        document.getElementById('progressText').textContent = `接收文件: ${fileInfo.name}`;
    }

    handleFileChunk(chunkData) {
        if (!this.receivingFile) return;

        this.receivedChunks.push(chunkData);
        this.receivingFile.receivedSize += chunkData.byteLength;

        // 更新进度
        this.updateProgress(
            this.receivingFile.receivedSize,
            this.receivingFile.size
        );
    }

    completeReceivingFile() {
        if (!this.receivingFile || this.receivedChunks.length === 0) {
            console.error('没有文件可完成');
            return;
        }

        console.log('文件接收完成:', this.receivingFile.name);

        // 合并所有数据块
        const totalSize = this.receivedChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
        const combined = new Uint8Array(totalSize);
        let offset = 0;

        this.receivedChunks.forEach(chunk => {
            combined.set(new Uint8Array(chunk), offset);
            offset += chunk.byteLength;
        });

        // 创建Blob并下载
        const blob = new Blob([combined], { type: this.receivingFile.mimeType });
        this.downloadFile(blob, this.receivingFile.name);

        // 添加到历史记录
        this.addToHistory({
            name: this.receivingFile.name,
            size: this.receivingFile.size
        }, 'received');

        // 清理
        this.receivingFile = null;
        this.receivedChunks = [];

        // 重置进度
        this.updateProgress(0, 1);
        document.getElementById('progressText').textContent = '文件接收完成';
    }

    downloadFile(blob, fileName) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    cancelReceivingFile() {
        console.log('文件传输被取消');
        this.receivingFile = null;
        this.receivedChunks = [];
        this.updateProgress(0, 1);
        document.getElementById('progressText').textContent = '传输已取消';
    }

    updateProgress(current, total) {
        const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');

        if (progressFill) {
            progressFill.style.width = percentage + '%';
        }

        if (progressText && total > 1) {
            progressText.textContent =
                `传输中: ${percentage}% (${this.formatBytes(current)} / ${this.formatBytes(total)})`;
        }
    }

    addToHistory(file, direction) {
        const historyList = document.getElementById('historyList');
        if (!historyList) return;

        const emptyState = historyList.querySelector('.empty-state');
        if (emptyState) {
            emptyState.remove();
            document.getElementById('fileList')?.classList.remove('hidden');
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

    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    updateStatus(text, state) {
        const indicator = document.getElementById('statusIndicator');
        if (!indicator) return;

        const dot = indicator.querySelector('.dot');
        const span = indicator.querySelector('span');

        if (span) span.textContent = text;
        if (dot) {
            dot.className = 'dot ' + state;
        }
    }

    showTransferPanel() {
        document.getElementById('connectionPanel').classList.add('hidden');
        document.getElementById('transferPanel').classList.remove('hidden');
        document.getElementById('fileList')?.classList.remove('hidden');
    }

    retryConnection() {
        this.connectionAttempts++;

        if (this.connectionAttempts > 3) {
            this.updateStatus('连接失败，请重试', 'error');
            return;
        }

        console.log(`重试连接 (${this.connectionAttempts}/3)`);
        this.updateStatus(`重试连接中... (${this.connectionAttempts}/3)`, 'connecting');

        setTimeout(() => {
            this.resetConnection();
            this.connectToPeer();
        }, 1000 * this.connectionAttempts);
    }

    attemptReconnect() {
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            return; // 仍然连接着，不需要重连
        }

        console.log('尝试重新连接...');
        this.retryConnection();
    }

    disconnect() {
        if (confirm('确定要断开连接吗？')) {
            this.resetConnection();
            this.updateStatus('已断开连接', 'disconnected');
        }
    }

    resetConnection() {
        // 关闭WebRTC连接
        if (this.dataChannel) {
            this.dataChannel.close();
            this.dataChannel = null;
        }

        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        // 重置状态
        this.remoteId = null;
        this.isInitiator = false;
        this.pendingIceCandidates = [];
        this.hasSetLocalOffer = false;
        this.hasSetRemoteAnswer = false;
        this.connectionAttempts = 0;

        // 发送关闭信号
        if (this.remoteId) {
            this.sendSignal('close', { reason: 'disconnect' });
        }

        // 切换回连接面板
        document.getElementById('transferPanel').classList.add('hidden');
        document.getElementById('connectionPanel').classList.remove('hidden');

        // 清空文件队列
        this.fileQueue = [];
        this.currentTransfer = null;
        this.updateQueueDisplay();

        console.log('连接已重置');
    }

    handleRemoteClose() {
        console.log('对方断开连接');
        this.resetConnection();
        this.updateStatus('对方已断开连接', 'disconnected');
    }
}

// 3. 工具函数
function copyMyId() {
    const myId = document.getElementById('myId').textContent;
    navigator.clipboard.writeText(myId).then(() => {
        alert('ID已复制到剪贴板');
    }).catch(err => {
        console.error('复制失败:', err);
        // 降级方案
        const textArea = document.createElement('textarea');
        textArea.value = myId;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        alert('ID已复制');
    });
}

function clearHistory() {
    if (confirm('确定要清空传输历史吗？')) {
        const historyList = document.getElementById('historyList');
        if (historyList) {
            historyList.innerHTML = '<div class="empty-state">暂无传输记录</div>';
            document.getElementById('fileList').classList.add('hidden');
        }
    }
}

// 4. 页面加载时初始化
let fileTransfer;

document.addEventListener('DOMContentLoaded', () => {
    // 检查浏览器支持
    if (!window.RTCPeerConnection) {
        alert('您的浏览器不支持WebRTC。请使用最新版本的Chrome、Firefox、Edge或Safari。');
        return;
    }

    // 检查Firebase连接
    try {
        firebase.database().ref('.info/connected').once('value').then(() => {
            console.log('Firebase连接正常');
        });
    } catch (error) {
        console.error('Firebase连接失败:', error);
        alert('无法连接到服务器，请检查网络连接');
        return;
    }

    // 初始化应用
    fileTransfer = new FileTransfer();

    // 添加断开连接按钮（如果HTML中没有）
    if (!document.getElementById('disconnectBtn')) {
        const transferPanel = document.querySelector('#transferPanel .panel-header');
        if (transferPanel) {
            const disconnectBtn = document.createElement('button');
            disconnectBtn.id = 'disconnectBtn';
            disconnectBtn.className = 'text-btn';
            disconnectBtn.textContent = '断开连接';
            disconnectBtn.style.marginLeft = '10px';
            transferPanel.querySelector('.connection-info').appendChild(disconnectBtn);
        }
    }

    // 页面卸载时清理
    window.addEventListener('beforeunload', () => {
        if (fileTransfer) {
            database.ref(`connections/${fileTransfer.localId}`).remove();
        }
    });

    // 调试模式
    window.debugWebRTC = function () {
        console.log('=== WebRTC 调试信息 ===');
        console.log('用户ID:', fileTransfer.localId);
        console.log('Peer Connection:', fileTransfer.peerConnection);
        console.log('Data Channel:', fileTransfer.dataChannel);
        console.log('连接状态:', fileTransfer.peerConnection?.connectionState);
        console.log('ICE状态:', fileTransfer.peerConnection?.iceConnectionState);
        console.log('=====================');
    };
});

// 5. 全局错误处理
window.addEventListener('error', (event) => {
    console.error('全局错误:', event.error);

    // 如果是WebRTC相关错误，尝试恢复
    if (event.error && event.error.toString().includes('WebRTC') ||
        event.error && event.error.toString().includes('RTCPeerConnection')) {
        console.log('检测到WebRTC错误，尝试恢复...');
        if (fileTransfer && fileTransfer.remoteId) {
            setTimeout(() => fileTransfer.attemptReconnect(), 1000);
        }
    }
});

// 6. 网络状态监控
if (navigator.connection) {
    navigator.connection.addEventListener('change', () => {
        console.log('网络状态变化:', navigator.connection.type);

        // 如果是离线状态，尝试重新连接
        if (navigator.onLine === false) {
            console.log('网络离线');
            if (fileTransfer) {
                fileTransfer.updateStatus('网络已断开', 'error');
            }
        } else if (fileTransfer && fileTransfer.dataChannel &&
            fileTransfer.dataChannel.readyState !== 'open') {
            // 网络恢复，尝试重新连接
            setTimeout(() => fileTransfer.attemptReconnect(), 2000);
        }
    });
}

// 调试函数
window.debugConnection = function () {
    console.clear();
    console.log('=== 连接状态调试 ===');

    if (!fileTransfer) {
        console.error('❌ FileTransfer 实例不存在');
        return;
    }

    console.log('本地ID:', fileTransfer.localId);
    console.log('远程ID:', fileTransfer.remoteId);
    console.log('是否是发起方:', fileTransfer.isInitiator);

    if (fileTransfer.peerConnection) {
        console.log('Peer Connection 状态:');
        console.log('- connectionState:', fileTransfer.peerConnection.connectionState);
        console.log('- iceConnectionState:', fileTransfer.peerConnection.iceConnectionState);
        console.log('- iceGatheringState:', fileTransfer.peerConnection.iceGatheringState);
        console.log('- signalingState:', fileTransfer.peerConnection.signalingState);

        // 检查数据通道
        if (fileTransfer.dataChannel) {
            console.log('数据通道状态:', fileTransfer.dataChannel.readyState);
            console.log('数据通道标签:', fileTransfer.dataChannel.label);
        } else {
            console.log('数据通道: 未创建');
        }

        // 检查本地/远程描述
        console.log('本地描述:', fileTransfer.peerConnection.localDescription ? '已设置' : '未设置');
        console.log('远程描述:', fileTransfer.peerConnection.remoteDescription ? '已设置' : '未设置');
    } else {
        console.log('❌ Peer Connection: 未创建');
    }

    // 测试STUN
    const testPC = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    testPC.createDataChannel('test');
    testPC.createOffer().then(offer => {
        console.log('✅ STUN服务器测试: 正常');
        testPC.close();
    }).catch(err => {
        console.error('❌ STUN服务器测试: 失败', err);
    });

    // 清理Firebase旧消息
    database.ref('signaling').limitToLast(5).once('value').then(snapshot => {
        console.log('最近的信令消息:', snapshot.numChildren());
    });

    console.log('=== 调试完成 ===');
};