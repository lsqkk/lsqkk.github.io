// === 完整修复的 app.js - 直接替换 ===

// ========== 1. 全局调试函数（放在最前面，确保立即可用）==========
window.debugConnection = function () {
    console.clear();
    console.log('=== WebRTC 调试信息 ===');

    if (!window.rtcInstance) {
        console.error('❌ RTC实例不存在');
        return;
    }

    console.log('本地ID:', window.rtcInstance.localId);
    console.log('远程ID:', window.rtcInstance.remoteId);
    console.log('是否是发起方:', window.rtcInstance.isInitiator);

    if (window.rtcInstance.peerConnection) {
        const pc = window.rtcInstance.peerConnection;
        console.log('Peer Connection 状态:');
        console.log('- connectionState:', pc.connectionState);
        console.log('- iceConnectionState:', pc.iceConnectionState);
        console.log('- iceGatheringState:', pc.iceGatheringState);
        console.log('- signalingState:', pc.signalingState);
        console.log('- localDescription:', pc.localDescription ? '已设置' : '未设置');
        console.log('- remoteDescription:', pc.remoteDescription ? '已设置' : '未设置');
    } else {
        console.log('❌ Peer Connection: 未创建');
    }

    if (window.rtcInstance.dataChannel) {
        console.log('数据通道状态:', window.rtcInstance.dataChannel.readyState);
    }

    console.log('=== Firebase 连接测试 ===');
    firebase.database().ref('.info/connected').once('value').then(snapshot => {
        console.log('Firebase连接状态:', snapshot.val() ? '已连接' : '未连接');
    });

    console.log('=== STUN 服务器测试 ===');
    const testPC = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    testPC.createDataChannel('test');
    testPC.createOffer()
        .then(offer => {
            console.log('✅ STUN服务器: 可达');
            testPC.close();
        })
        .catch(err => {
            console.error('❌ STUN服务器: 失败', err);
        });

    console.log('=== 调试完成 ===');
};

// 测试WebRTC支持的函数
window.testWebRTC = function () {
    console.log('=== WebRTC 支持测试 ===');

    // 基本检查
    console.log('RTCPeerConnection:', !!window.RTCPeerConnection);
    console.log('RTCSessionDescription:', !!window.RTCSessionDescription);
    console.log('RTCIceCandidate:', !!window.RTCIceCandidate);

    // 创建测试连接
    try {
        const pc = new RTCPeerConnection();
        console.log('✅ 可以创建PeerConnection');

        const dc = pc.createDataChannel('test');
        console.log('✅ 可以创建DataChannel');

        pc.close();
        console.log('✅ WebRTC基础功能正常');
    } catch (error) {
        console.error('❌ WebRTC初始化失败:', error);
    }
};

// ========== 2. Firebase 配置 ==========
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

// ========== 3. 主类定义 ==========
class SimpleP2PTransfer {
    constructor() {
        console.log('=== 初始化 SimpleP2PTransfer ===');

        // 检查WebRTC支持
        if (!this.checkWebRTC()) {
            this.showError('您的浏览器不支持WebRTC，请使用Chrome/Firefox/Edge的最新版本');
            return;
        }

        // 生成ID
        this.localId = this.generateId();
        this.remoteId = null;

        // WebRTC
        this.peerConnection = null;
        this.dataChannel = null;
        this.isInitiator = false;

        // 状态
        this.connected = false;
        this.connecting = false;

        // 缓存
        this.pendingCandidates = [];
        this.pendingOffers = [];
        this.pendingAnswers = [];

        // 文件传输
        this.fileQueue = [];
        this.currentFile = null;
        this.receivingFile = null;

        // 初始化
        this.init();
    }

    generateId() {
        // 尝试从localStorage获取稳定ID
        let savedId = localStorage.getItem('p2p_user_id');
        if (!savedId) {
            savedId = 'user_' + Math.random().toString(36).substring(2, 8);
            localStorage.setItem('p2p_user_id', savedId);
        }
        return savedId;
    }

    checkWebRTC() {
        const required = [
            'RTCPeerConnection',
            'RTCSessionDescription',
            'RTCIceCandidate'
        ];

        for (const api of required) {
            if (!window[api]) {
                console.error(`缺少WebRTC API: ${api}`);
                return false;
            }
        }

        console.log('✅ WebRTC支持检查通过');
        return true;
    }

    init() {
        console.log('初始化，用户ID:', this.localId);

        // 显示ID
        document.getElementById('myId').textContent = this.localId;

        // 初始化Firebase
        try {
            firebase.initializeApp(firebaseConfig);
            console.log('✅ Firebase初始化成功');
        } catch (error) {
            console.warn('Firebase可能已初始化:', error.message);
        }

        // 设置事件监听
        this.setupEventListeners();

        // 注册在线状态
        this.registerOnline();

        // 监听信令
        this.setupSignalListener();

        // 更新状态
        this.updateStatus('准备连接', 'ready');

        // 测试连接
        this.testBasicConnection();

        console.log('初始化完成');
    }

    testBasicConnection() {
        console.log('测试基本连接...');

        // 测试STUN服务器
        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        pc.createDataChannel('test');
        pc.createOffer()
            .then(offer => {
                console.log('✅ STUN服务器可达');
                pc.close();
            })
            .catch(err => {
                console.warn('⚠️ STUN服务器可能被阻止:', err);
            });
    }

    setupEventListeners() {
        console.log('设置事件监听器');

        // 连接按钮
        document.getElementById('connectBtn').addEventListener('click', () => {
            console.log('点击连接按钮');
            this.connectToPeer();
        });

        // 输入框回车
        document.getElementById('peerIdInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                console.log('回车连接');
                this.connectToPeer();
            }
        });

        // 文件选择
        document.getElementById('fileInput').addEventListener('change', (e) => {
            console.log('选择文件:', e.target.files.length);
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
            console.log('拖放文件:', e.dataTransfer.files.length);
            this.handleFiles(e.dataTransfer.files);
        });

        // 断开按钮
        const disconnectBtn = document.getElementById('disconnectBtn');
        if (disconnectBtn) {
            disconnectBtn.addEventListener('click', () => this.disconnect());
        }
    }

    registerOnline() {
        console.log('注册在线状态');

        const db = firebase.database();
        db.ref(`connections/${this.localId}`).set({
            online: true,
            timestamp: Date.now()
        });

        // 页面关闭时清理
        window.addEventListener('beforeunload', () => {
            db.ref(`connections/${this.localId}`).remove();
            db.ref(`signaling`).orderByChild('from').equalTo(this.localId).remove();
        });
    }

    setupSignalListener() {
        console.log('设置信令监听器');

        const db = firebase.database();

        // 监听所有信令消息
        db.ref('signaling').on('child_added', (roomSnapshot) => {
            const roomId = roomSnapshot.key;

            // 检查是否与我们相关的房间
            if (!this.isOurRoom(roomId)) return;

            console.log('监听到房间:', roomId);

            // 监听房间内的消息
            roomSnapshot.ref.on('child_added', (messageSnapshot) => {
                const message = messageSnapshot.val();

                // 检查消息是否发给我们
                if (message.to !== this.localId) return;

                console.log('收到信令消息:', message.type);

                // 处理消息
                this.handleSignal(message);

                // 删除已处理的消息
                setTimeout(() => {
                    messageSnapshot.ref.remove().catch(e => console.log('清理消息失败:', e));
                }, 100);
            });
        });
    }

    isOurRoom(roomId) {
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

        console.log('开始连接:', peerId);

        this.remoteId = peerId;
        this.isInitiator = this.localId < peerId;
        this.connecting = true;

        this.updateStatus('正在连接...', 'connecting');

        // 检查对方是否在线
        try {
            const snapshot = await firebase.database().ref(`connections/${peerId}`).once('value');
            if (!snapshot.exists()) {
                throw new Error('对方不在线，请确保对方已打开页面');
            }

            console.log('对方在线，开始WebRTC连接');

            // 创建WebRTC连接
            this.createPeerConnection();

            // 显示对方ID
            document.getElementById('peerName').textContent = peerId;

            // 如果是发起方，创建并发送Offer
            if (this.isInitiator) {
                console.log('作为发起方，创建Offer');
                await this.createAndSendOffer();
            }

        } catch (error) {
            console.error('连接失败:', error);
            this.updateStatus('连接失败', 'error');
            alert(`连接失败: ${error.message}`);
            this.resetConnection();
        }
    }

    createPeerConnection() {
        console.log('=== 创建PeerConnection ===');

        // 关闭现有连接
        if (this.peerConnection) {
            console.log('关闭现有连接');
            this.peerConnection.close();
            this.peerConnection = null;
        }

        // 极简配置 - 只用最可靠的STUN服务器
        const config = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' }
            ],
            iceTransportPolicy: 'all',
            bundlePolicy: 'max-compat'
        };

        console.log('使用配置:', config);

        try {
            this.peerConnection = new RTCPeerConnection(config);
            console.log('✅ PeerConnection创建成功');
        } catch (error) {
            console.error('❌ 创建PeerConnection失败:', error);
            this.updateStatus(`创建连接失败: ${error.message}`, 'error');
            return;
        }

        // 设置事件监听器
        this.setupPeerConnectionEvents();

        // 创建数据通道（如果是发起方）
        if (this.isInitiator) {
            console.log('创建数据通道');
            this.createDataChannel();
        } else {
            console.log('等待对方的数据通道');
            this.peerConnection.ondatachannel = (event) => {
                console.log('收到数据通道:', event.channel.label);
                this.setupDataChannel(event.channel);
            };
        }

        console.log('=== PeerConnection创建完成 ===');
    }

    setupPeerConnectionEvents() {
        const pc = this.peerConnection;

        // ICE候选
        pc.onicecandidate = (event) => {
            if (!event.candidate) {
                console.log('ICE候选收集完成');
                return;
            }

            console.log('生成ICE候选:', event.candidate.candidate.substring(0, 50) + '...');

            // 发送候选
            if (this.remoteId) {
                this.sendSignal('candidate', {
                    candidate: event.candidate.candidate,
                    sdpMid: event.candidate.sdpMid || '0',
                    sdpMLineIndex: event.candidate.sdpMLineIndex ?? 0
                });
            }
        };

        // ICE连接状态
        pc.oniceconnectionstatechange = () => {
            const state = pc.iceConnectionState;
            console.log('ICE连接状态:', state);

            switch (state) {
                case 'checking':
                    this.updateStatus('正在建立连接...', 'connecting');
                    break;
                case 'connected':
                case 'completed':
                    console.log('✅ ICE连接成功');
                    this.updateStatus('已连接', 'connected');
                    this.connected = true;
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
        pc.onconnectionstatechange = () => {
            const state = pc.connectionState;
            console.log('连接状态:', state);

            if (state === 'connected') {
                console.log('✅ P2P连接成功');
                this.showTransferPanel();
            } else if (state === 'failed' || state === 'disconnected') {
                console.error('连接失败');
                this.connected = false;
            }
        };

        // 信令状态（调试用）
        pc.onsignalingstatechange = () => {
            console.log('信令状态:', pc.signalingState);
        };
    }

    createDataChannel() {
        console.log('创建数据通道');

        try {
            this.dataChannel = this.peerConnection.createDataChannel('fileTransfer', {
                ordered: true
            });

            this.setupDataChannel(this.dataChannel);
        } catch (error) {
            console.error('创建数据通道失败:', error);
        }
    }

    setupDataChannel(channel) {
        this.dataChannel = channel;
        this.dataChannel.binaryType = 'arraybuffer';

        this.dataChannel.onopen = () => {
            console.log('✅ 数据通道已打开');
            this.updateStatus('已连接，可以传输文件', 'connected');
            this.connected = true;
            this.showTransferPanel();
        };

        this.dataChannel.onclose = () => {
            console.log('数据通道已关闭');
            this.updateStatus('连接已关闭', 'disconnected');
            this.connected = false;
        };

        this.dataChannel.onmessage = (event) => {
            this.handleIncomingData(event.data);
        };

        this.dataChannel.onerror = (error) => {
            console.error('数据通道错误:', error);
        };
    }

    async createAndSendOffer() {
        try {
            console.log('创建Offer...');

            const offer = await this.peerConnection.createOffer({
                offerToReceiveAudio: false,
                offerToReceiveVideo: false
            });

            console.log('设置本地描述...');
            await this.peerConnection.setLocalDescription(offer);

            console.log('发送Offer...');
            this.sendSignal('offer', {
                type: 'offer',
                sdp: offer.sdp
            });

            console.log('✅ Offer创建并发送成功');

        } catch (error) {
            console.error('创建Offer失败:', error);
            this.updateStatus('创建连接失败', 'error');
        }
    }

    handleSignal(message) {
        if (!message || !message.data) return;

        const data = message.data;

        switch (message.type) {
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
    }

    async handleOffer(offerData) {
        console.log('处理Offer');

        if (!this.peerConnection) {
            console.log('创建新的PeerConnection来处理Offer');
            this.createPeerConnection();
        }

        try {
            const offer = new RTCSessionDescription({
                type: 'offer',
                sdp: offerData.sdp
            });

            console.log('设置远程描述（Offer）...');
            await this.peerConnection.setRemoteDescription(offer);
            console.log('✅ 远程描述设置成功');

            // 处理缓存的候选
            this.processPendingCandidates();

            // 创建Answer
            console.log('创建Answer...');
            const answer = await this.peerConnection.createAnswer();

            console.log('设置本地描述（Answer）...');
            await this.peerConnection.setLocalDescription(answer);

            // 发送Answer
            console.log('发送Answer...');
            this.sendSignal('answer', {
                type: 'answer',
                sdp: answer.sdp
            });

            console.log('✅ Answer处理完成');

        } catch (error) {
            console.error('处理Offer失败:', error);
        }
    }

    async handleAnswer(answerData) {
        console.log('处理Answer');

        try {
            const answer = new RTCSessionDescription({
                type: 'answer',
                sdp: answerData.sdp
            });

            console.log('设置远程描述（Answer）...');
            await this.peerConnection.setRemoteDescription(answer);
            console.log('✅ 远程描述设置成功');

            // 处理缓存的候选
            this.processPendingCandidates();

        } catch (error) {
            console.error('处理Answer失败:', error);
        }
    }

    async handleCandidate(candidateData) {
        if (!candidateData || !candidateData.candidate) {
            console.warn('无效的候选数据');
            return;
        }

        try {
            const candidate = new RTCIceCandidate({
                candidate: candidateData.candidate,
                sdpMid: candidateData.sdpMid || null,
                sdpMLineIndex: candidateData.sdpMLineIndex ?? null
            });

            // 如果还没有远程描述，缓存候选
            if (!this.peerConnection.remoteDescription) {
                console.log('缓存ICE候选，等待远程描述');
                this.pendingCandidates.push(candidate);
                return;
            }

            console.log('添加ICE候选...');
            await this.peerConnection.addIceCandidate(candidate);

        } catch (error) {
            // 忽略一些无害的错误
            if (!error.toString().includes('duplicate')) {
                console.warn('添加ICE候选失败:', error);
            }
        }
    }

    processPendingCandidates() {
        if (this.pendingCandidates.length === 0) return;

        console.log('处理缓存的ICE候选:', this.pendingCandidates.length);

        this.pendingCandidates.forEach(candidate => {
            this.peerConnection.addIceCandidate(candidate)
                .catch(err => console.log('添加缓存候选失败:', err));
        });

        this.pendingCandidates = [];
    }

    sendSignal(type, data) {
        if (!this.remoteId) {
            console.warn('没有远程ID，无法发送信令');
            return;
        }

        const roomId = this.getRoomId();
        const db = firebase.database();

        const signalRef = db.ref(`signaling/${roomId}`).push();
        signalRef.set({
            from: this.localId,
            to: this.remoteId,
            type: type,
            data: data,
            timestamp: Date.now()
        });

        // 30秒后清理
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

        if (!this.connected) {
            alert('请先建立连接');
            return;
        }

        console.log('处理文件:', files.length, '个');

        Array.from(files).forEach(file => {
            if (file.size > 100 * 1024 * 1024) {
                alert(`文件 "${file.name}" 超过100MB限制`);
                return;
            }

            this.addToQueue(file);
        });
    }

    addToQueue(file) {
        const item = {
            id: Date.now(),
            file: file,
            progress: 0,
            status: '等待'
        };

        this.fileQueue.push(item);
        this.updateQueueDisplay();

        console.log(`添加到队列: ${file.name}`);
    }

    updateQueueDisplay() {
        const queueElement = document.getElementById('transferQueue');
        if (!queueElement) return;

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
                    <div class="file-size">${this.formatBytes(item.file.size)} - ${item.status}</div>
                </div>
            `;
            queueElement.appendChild(div);
        });
    }

    async sendFile(file) {
        const CHUNK_SIZE = 16384;

        console.log(`开始发送: ${file.name}`);

        try {
            // 发送元数据
            this.dataChannel.send(JSON.stringify({
                type: 'file-start',
                name: file.name,
                size: file.size,
                type: file.type
            }));

            // 分块发送
            let offset = 0;
            while (offset < file.size) {
                const chunk = file.slice(offset, offset + CHUNK_SIZE);
                const buffer = await this.readChunk(chunk);
                this.dataChannel.send(buffer);
                offset += CHUNK_SIZE;

                // 更新进度
                this.updateProgress(offset, file.size);
            }

            // 完成
            this.dataChannel.send(JSON.stringify({
                type: 'file-end'
            }));

            console.log(`发送完成: ${file.name}`);

        } catch (error) {
            console.error('发送文件失败:', error);
        }
    }

    readChunk(chunk) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsArrayBuffer(chunk);
        });
    }

    handleIncomingData(data) {
        // 简化的接收逻辑
        if (typeof data === 'string') {
            try {
                const msg = JSON.parse(data);
                console.log('收到控制消息:', msg.type);
            } catch (e) {
                console.log('收到文本消息:', data.substring(0, 50));
            }
        } else {
            console.log('收到二进制数据:', data.byteLength, 'bytes');
        }
    }

    updateProgress(current, total) {
        const percent = Math.round((current / total) * 100);
        const fill = document.getElementById('progressFill');
        const text = document.getElementById('progressText');

        if (fill) fill.style.width = percent + '%';
        if (text) text.textContent = `${percent}% (${this.formatBytes(current)}/${this.formatBytes(total)})`;
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
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

    attemptReconnect() {
        console.log('尝试重新连接...');
        setTimeout(() => {
            if (this.remoteId && !this.connected) {
                console.log('执行重连');
                this.resetConnection();
                this.connectToPeer();
            }
        }, 2000);
    }

    disconnect() {
        if (confirm('确定要断开连接吗？')) {
            this.resetConnection();
            this.updateStatus('已断开', 'disconnected');
        }
    }

    resetConnection() {
        console.log('重置连接');

        // 关闭WebRTC
        if (this.dataChannel) {
            this.dataChannel.close();
            this.dataChannel = null;
        }

        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        // 发送关闭信号
        if (this.remoteId) {
            this.sendSignal('close', { reason: 'disconnect' });
        }

        // 重置状态
        this.remoteId = null;
        this.isInitiator = false;
        this.connected = false;
        this.connecting = false;
        this.pendingCandidates = [];

        // 显示连接面板
        document.getElementById('transferPanel').classList.add('hidden');
        document.getElementById('connectionPanel').classList.remove('hidden');

        // 清空队列
        this.fileQueue = [];
        this.updateQueueDisplay();
    }

    handleRemoteClose() {
        console.log('对方断开连接');
        this.resetConnection();
        this.updateStatus('对方已断开', 'disconnected');
    }

    showError(message) {
        console.error('严重错误:', message);
        alert(message);

        // 显示错误状态
        const indicator = document.getElementById('statusIndicator');
        if (indicator) {
            indicator.innerHTML = `<span style="color: #ff4444;">❌ ${message}</span>`;
        }
    }
}

// ========== 4. 页面加载初始化 ==========
window.addEventListener('DOMContentLoaded', () => {
    console.log('页面加载完成，开始初始化...');

    // 创建实例并保存到全局
    window.rtcInstance = new SimpleP2PTransfer();

    // 确保调试按钮工作
    const debugBtn = document.createElement('button');
    debugBtn.textContent = '调试连接';
    debugBtn.style.cssText = `
        position: fixed;
        bottom: 10px;
        right: 10px;
        z-index: 9999;
        padding: 5px 10px;
        background: rgba(100, 108, 255, 0.2);
        border: 1px solid #646cff;
        color: #646cff;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
    `;
    debugBtn.onclick = debugConnection;
    document.body.appendChild(debugBtn);

    console.log('✅ 初始化完成，调试按钮已添加');
});

// ========== 5. 错误处理 ==========
window.addEventListener('error', (event) => {
    console.error('全局错误:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('未处理的Promise拒绝:', event.reason);
});

// 测试函数
console.log('app.js 加载完成');