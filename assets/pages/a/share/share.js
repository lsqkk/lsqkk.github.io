let database;
const roomListeners = [];
let connectionTimer;

// 完整的 STUN/TURN 服务器列表 - 增加 TURN 以应对严格 NAT (如教育网)
const STUN_SERVERS = [
    // STUN 服务器 (用于穿透宽松 NAT)
    { urls: 'stun:stun.minisipserver.com' },
    { urls: 'stun:stun.zoiper.com' },
    { urls: 'stun:stun.voipbuster.com' },
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun.voipstunt.com' },

    // TURN 服务器 (用于中继数据，穿透严格 NAT 和防火墙)
    // 注意: 免费 TURN 服务器的可靠性会波动。
    {
        urls: 'turn:numb.viagenie.ca',
        username: 'webrtc@live.com',
        credential: 'webrtc'
    },
    {
        urls: 'turn:stun.nextcloud.com:443',
        username: 'test',
        credential: 'test'
    }
];


// -----------------------------------------------------------
// 2. 全局变量与 DOM 元素
// -----------------------------------------------------------
let peerConnection;
let dataChannel;
let isSender = false;
let currentRoomCode = null;
let hasSentCodePrompt = false;

// 发送相关
let filesToSend = [];
let currentFileIndex = 0;

// 接收相关
let currentFileBuffer = [];
let currentFileName = '';
let currentFileSize = 0;
let totalFilesToReceive = 0;
let filesReceivedCount = 0;
let receivedFiles = []; // 存储所有已接收的文件 Blob 和文件名

const CHUNK_SIZE = 64 * 1024;
const METADATA_LABEL = 'metadata';

const joinSection = document.getElementById('join-section');
const transferSection = document.getElementById('transfer-section');
const transferTitle = document.getElementById('transfer-title');
const roomCodeInput = document.getElementById('room-code-input');
const joinBtn = document.getElementById('join-btn');
const createBtn = document.getElementById('create-btn');
const fileInput = document.getElementById('file-input');
const fileListUL = document.getElementById('file-list');
const sendBtn = document.getElementById('send-btn');
const statusDiv = document.getElementById('status');
const progressBar = document.getElementById('progress-bar');
const downloadArea = document.getElementById('download-area');
const downloadListDiv = document.getElementById('download-list');
const cleanRoomBtn = document.getElementById('clean-room-btn');
const currentFileInfoP = document.getElementById('current-file-info');
const zipDownloadBtn = document.getElementById('zip-download-btn');
const connectionSummary = document.getElementById('connection-summary');
const returnToConnect = document.getElementById('return-to-connect');

function connectionState(state, message) {
    if (state !== 'connecting') clearTimeout(connectionTimer);
    connectionSummary.dataset.connectionState = state;
    connectionSummary.textContent = message;
    returnToConnect.hidden = !currentRoomCode || state !== 'unavailable';
}

function listenRoom(ref, event, listener) {
    ref.on(event, listener, () => connectionState('unavailable', '房间同步失败，请检查网络后返回连接。'));
    roomListeners.push(() => ref.off(event, listener));
}

const GUEST_FILE_LIMIT = 20;
const LOGGED_FILE_LIMIT = 50;

function isLoggedUser() {
    if (window.CommentShared && typeof window.CommentShared.getLoginProfile === 'function') {
        const profile = window.CommentShared.getLoginProfile();
        return Boolean(profile && profile.isLoggedUser);
    }
    return Boolean(localStorage.getItem('github_code') || localStorage.getItem('github_user') || localStorage.getItem('qb_user'));
}

function getFileLimit() {
    return isLoggedUser() ? LOGGED_FILE_LIMIT : GUEST_FILE_LIMIT;
}

// -----------------------------------------------------------
// 3. 核心函数：UI 工具
// -----------------------------------------------------------

/** 记录状态 */
function logStatus(message) {
    statusDiv.prepend(document.createTextNode(`[${new Date().toLocaleTimeString()}] ${message}\n`));
    if (statusDiv.scrollTop > 0) statusDiv.scrollTop = 0;
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

/** 更新进度条 */
function updateProgress(percentage) {
    progressBar.style.width = `${Math.min(100, percentage)}%`;
}

/** 清理房间数据并重置 */
async function cleanRoomData(roomCode) {
    if (roomCode) {
        logStatus(`正在清理房间 ${roomCode} 的 Firebase 数据...`);
        try {
            await database.ref(`rooms/${roomCode}`).remove();
            logStatus('✅ 房间数据清理完毕。');
        } catch (e) {
            logStatus(`❌ 清理失败: ${e.message}`);
        }
    }
    resetUI();
}

/** 重置界面到初始状态 */
function resetUI(keepFiles = false) {
    joinSection.style.display = 'block';
    transferSection.style.display = 'none';
    transferTitle.textContent = '等待连接...';
    sendBtn.textContent = '等待连接...';
    sendBtn.disabled = true;
    if (!keepFiles) fileInput.value = '';
    fileListUL.style.display = 'none';
    fileListUL.innerHTML = '';
    currentFileInfoP.textContent = '';
    downloadListDiv.innerHTML = '';
    cleanRoomBtn.style.display = 'none';
    zipDownloadBtn.style.display = 'none';
    updateProgress(0);

    currentRoomCode = null;
    if (!keepFiles) filesToSend = [];
    currentFileIndex = 0;
    currentFileBuffer = [];
    totalFilesToReceive = 0;
    filesReceivedCount = 0;
    receivedFiles = []; // 清空已接收文件列表
    hasSentCodePrompt = false;
    roomListeners.splice(0).forEach((unsubscribe) => unsubscribe());

    if (peerConnection) {
        peerConnection.oniceconnectionstatechange = null;
        peerConnection.onicecandidate = null;
        peerConnection.ondatachannel = null;
        peerConnection.close();
        peerConnection = null;
    }
    if (dataChannel) {
        dataChannel.close();
        dataChannel = null;
    }
    logStatus('界面已重置。');
    connectionState('idle', '未连接。可以重新创建或加入房间。');
}

// -----------------------------------------------------------
// 4. WebRTC 初始化
// -----------------------------------------------------------

/** 初始化 RTCPeerConnection */
function createPeerConnection(roomCode, isSenderDevice) {
    // 使用 STUN_SERVERS 作为 iceServers 配置
    peerConnection = new RTCPeerConnection({ iceServers: STUN_SERVERS });
    currentRoomCode = roomCode;
    isSender = isSenderDevice;

    logStatus(`创建 WebRTC 连接，身份: ${isSender ? '发送方' : '接收方'}。连接码: ${roomCode}`);
    cleanRoomBtn.style.display = 'block';

    peerConnection.onicecandidate = async (event) => {
        if (event.candidate) {
            if (isSender && !hasSentCodePrompt) {
                transferTitle.textContent = `📢 连接码：${roomCode}。请将此码发送给接收方。`;
                logStatus('ICE 候选者正在发送中。**请将连接码发送给接收方。**');
                hasSentCodePrompt = true;
            }

            const role = isSender ? 'sender' : 'receiver';
            const candidatesRef = database.ref(`rooms/${roomCode}/${role}/iceCandidates`);
            await candidatesRef.push(event.candidate.toJSON());
            logStatus('发送 ICE 候选者...');
        }
    };

    peerConnection.oniceconnectionstatechange = () => {
        logStatus(`ICE 连接状态: ${peerConnection.iceConnectionState}`);
        if (['connected', 'completed'].includes(peerConnection.iceConnectionState)) {
            logStatus('✅ P2P 连接建立成功！');
            if (dataChannel?.readyState === 'open') connectionState('connected', '已连接。');
        } else if (peerConnection.iceConnectionState === 'failed' || peerConnection.iceConnectionState === 'closed') {
            logStatus('❌ P2P 连接断开或失败。请检查连接码和网络环境。');
            connectionState('unavailable', '连接已中断。请检查网络，再返回连接。');
            sendBtn.disabled = true;
        } else if (peerConnection.iceConnectionState === 'disconnected') {
            connectionState('connecting', '连接不稳定，正在尝试恢复…');
            sendBtn.disabled = true;
        }
    };

    if (isSender) {
        dataChannel = peerConnection.createDataChannel('fileTransfer', { ordered: true });
        setupDataChannel(dataChannel);
        logStatus('已创建 DataChannel...');
    } else {
        peerConnection.ondatachannel = (event) => {
            dataChannel = event.channel;
            setupDataChannel(dataChannel);
            logStatus('已接收 DataChannel...');
        };
    }
}

/** DataChannel 的通用设置 */
function setupDataChannel(channel) {
    channel.onopen = () => {
        if (dataChannel !== channel) return;
        logStatus('DataChannel 打开，可以开始传输数据。');
        connectionState('connected', '已连接。');
        transferTitle.textContent = isSender ? '连接成功！' : '等待发送方传输文件…';
        if (isSender) renderSelectedFiles();
    };
    channel.onclose = () => {
        logStatus('DataChannel 关闭。');
    };

    // 修正：更友好的 DataChannel 错误处理，忽略正常关闭时的 RTCErrorEvent
    channel.onerror = (error) => {
        const isExpectedClosure = peerConnection &&
            (peerConnection.iceConnectionState === 'closed' ||
                peerConnection.iceConnectionState === 'disconnected');

        if (isExpectedClosure) {
            logStatus('⚠️ DataChannel 错误被捕获，但连接正在关闭中，可能是正常流程。忽略此警告。');
        } else {
            logStatus(`❌ DataChannel 致命错误: ${error.message || error}`);
        }
    };

    if (!isSender) {
        channel.onmessage = handleDataChannelMessage;
    }
}

async function createSenderOffer(roomCode) {
    createPeerConnection(roomCode, true);
    const connection = peerConnection;
    transferTitle.textContent = `连接码：${roomCode}。正在等待ICE生成...`;

    try {
        const offer = await connection.createOffer();
        if (connection !== peerConnection) return;
        await connection.setLocalDescription(offer);
        if (connection !== peerConnection) return;
        await database.ref(`rooms/${roomCode}/sender/sdp`).set(connection.localDescription.toJSON());

        if (connection !== peerConnection) return;
        listenRoom(database.ref(`rooms/${roomCode}/receiver/sdp`), 'value', async (snapshot) => {
            const answer = snapshot.val();
            if (answer && connection === peerConnection && !connection.currentRemoteDescription) {
                try {
                    await connection.setRemoteDescription(new RTCSessionDescription(answer));
                    if (connection === peerConnection) listenForIceCandidates(roomCode, 'receiver');
                } catch {
                    if (connection === peerConnection) connectionState('unavailable', '无法连接对方设备，请返回连接重试。');
                }
            }
        });
    } catch (e) {
        logStatus(`❌ 发送方 Offer 失败: ${e.message}`);
        if (connection === peerConnection) connectionState('unavailable', '无法建立房间，请返回连接重试。');
    }
}

async function createReceiverAnswer(roomCode) {
    createPeerConnection(roomCode, false);
    transferTitle.textContent = `连接码：${roomCode}。正在等待发送方响应...`;

    const connection = peerConnection;
    await database.ref(`rooms/${roomCode}/sender/sdp`).once('value').then(async (snapshot) => {
        if (connection !== peerConnection) return;
        const offer = snapshot.val();
        if (!offer) {
            logStatus(`❌ 房间 ${roomCode} 不存在 Offer。`);
            connectionState('unavailable', '没有找到这个房间，请确认对方已生成连接码。');
            return;
        }

        try {
            await connection.setRemoteDescription(new RTCSessionDescription(offer));
            if (connection !== peerConnection) return;
            const answer = await connection.createAnswer();
            if (connection !== peerConnection) return;
            await connection.setLocalDescription(answer);
            if (connection !== peerConnection) return;
            await database.ref(`rooms/${roomCode}/receiver/sdp`).set(connection.localDescription.toJSON());
            if (connection === peerConnection) listenForIceCandidates(roomCode, 'sender');
        } catch (e) {
            logStatus(`❌ 接收方 Answer 失败: ${e.message}`);
            if (connection === peerConnection) connectionState('unavailable', '无法加入房间，请检查连接码和网络。');
        }
    }).catch(() => {
        if (connection === peerConnection) connectionState('unavailable', '暂时无法读取房间，请返回连接重试。');
    });
}

function listenForIceCandidates(roomCode, remoteRole) {
    const connection = peerConnection;
    listenRoom(database.ref(`rooms/${roomCode}/${remoteRole}/iceCandidates`), 'child_added', async (snapshot) => {
        const candidate = snapshot.val();
        if (candidate && connection === peerConnection) {
            try {
                await connection.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) {
                logStatus(`❌ 添加 ICE 候选者失败: ${e.message}`);
            }
        }
    });
}


// -----------------------------------------------------------
// 5. 多文件传输逻辑 (发送方)
// -----------------------------------------------------------

/** 开始传输下一个文件 */
function sendNextFile() {
    if (currentFileIndex < filesToSend.length) {
        const file = filesToSend[currentFileIndex];
        logStatus(`开始发送文件 [${currentFileIndex + 1}/${filesToSend.length}]: ${file.name}`);
        sendFileChunked(file, currentFileIndex, filesToSend.length);
    } else {
        // 所有文件发送完毕
        logStatus('✅ 所有文件发送完成！');
        transferTitle.textContent = '所有文件传输完成！';
        currentFileInfoP.textContent = '';
        sendBtn.textContent = `重新发送 (${filesToSend.length} 个文件)`;
        sendBtn.disabled = false;
    }
}

/** 分块发送单个文件 */
function sendFileChunked(file, index, total) {
    if (dataChannel.readyState !== 'open') {
        logStatus('❌ DataChannel 未打开或未连接。');
        currentFileIndex = total;
        return;
    }

    const fileSize = file.size;
    let offset = 0;

    sendBtn.disabled = true;

    // 1. 发送文件元数据
    const metadata = {
        label: METADATA_LABEL,
        fileName: file.name,
        fileSize: fileSize,
        fileIndex: index + 1, // 1-based index
        totalFiles: total,
    };
    dataChannel.send(JSON.stringify(metadata));

    const fileReader = new FileReader();

    fileReader.onload = (e) => {
        // 1. 发送当前已读取的块
        dataChannel.send(e.target.result);
        offset += e.target.result.byteLength;

        // 2. 更新 UI
        const percentage = (offset / fileSize) * 100;
        updateProgress(percentage);

        const sizeMB = (fileSize / (1024 * 1024)).toFixed(2);
        currentFileInfoP.textContent = `文件 ${index + 1}/${total} - ${file.name} (${sizeMB} MB)`;
        transferTitle.textContent = `发送中: ${file.name} | ${percentage.toFixed(1)}%`;

        // 3. 决定下一步动作
        if (offset < fileSize) {
            // 检查缓冲区水位
            if (dataChannel.bufferedAmount < dataChannel.bufferedAmountLowThreshold) {
                readSlice(offset); // 缓冲区安全，继续读取下一块
            } else {
                // 缓冲区已满，暂停读取，等待 onbufferedamountlow 事件触发
                logStatus(`DataChannel buffer full (${dataChannel.bufferedAmount} bytes). Pausing file read.`);
            }
        } else {
            // 文件发送完毕
            logStatus(`文件 [${index + 1}/${total}] 发送完毕。`);
            dataChannel.onbufferedamountlow = null; // 清除流量控制处理器
            currentFileIndex++;
            sendNextFile(); // 立即启动下一个文件传输
        }
    };

    fileReader.onerror = (error) => {
        logStatus(`❌ 文件 [${index + 1}/${total}] 读取失败: ${error}`);
        dataChannel.onbufferedamountlow = null;
        currentFileIndex++;
        sendNextFile();
    };

    const readSlice = (start) => {
        const slice = file.slice(start, start + CHUNK_SIZE);
        fileReader.readAsArrayBuffer(slice);
    };

    // 独立设置流量控制处理器
    dataChannel.onbufferedamountlow = () => {
        logStatus('DataChannel buffer low. Resuming file read.');
        if (offset < fileSize) {
            readSlice(offset);
        }
    };

    // 启动第一次读取
    readSlice(0);
}


// -----------------------------------------------------------
// 6. 多文件传输逻辑 (接收方)
// -----------------------------------------------------------

/** 处理接收到的 DataChannel 消息 */
function handleDataChannelMessage(event) {
    const data = event.data;

    if (typeof data === 'string') {
        try {
            const metadata = JSON.parse(data);
            if (metadata.label === METADATA_LABEL) {
                // 新文件开始
                if (currentFileBuffer.length > 0) {
                    logStatus(`警告：文件 ${currentFileName} 未完整接收，但收到了新文件的元数据。`);
                }

                currentFileName = metadata.fileName;
                currentFileSize = metadata.fileSize;
                totalFilesToReceive = metadata.totalFiles;
                filesReceivedCount = metadata.fileIndex - 1;
                currentFileBuffer = [];
                downloadArea.style.display = 'block';

                const sizeMB = (currentFileSize / (1024 * 1024)).toFixed(2);
                logStatus(`开始接收文件 [${metadata.fileIndex}/${totalFilesToReceive}]：${currentFileName} (${sizeMB} MB)`);
                currentFileInfoP.textContent = `文件 ${metadata.fileIndex}/${totalFilesToReceive} - ${currentFileName} (${sizeMB} MB)`;
                transferTitle.textContent = `接收中: ${currentFileName} | 0.0%`;
                updateProgress(0);
                return;
            }
        } catch (e) {
            // 忽略非元数据的字符串消息
        }
    } else if (data instanceof ArrayBuffer) {
        // 接收到数据块
        currentFileBuffer.push(data);
        const totalBytesReceived = currentFileBuffer.reduce((sum, chunk) => sum + chunk.byteLength, 0);
        const percentage = (totalBytesReceived / currentFileSize) * 100;

        updateProgress(percentage);
        transferTitle.textContent = `接收中: ${currentFileName} | ${percentage.toFixed(1)}%`;

        if (totalBytesReceived >= currentFileSize) {
            // 当前文件接收完毕
            logStatus(`✅ 文件 [${filesReceivedCount + 1}/${totalFilesToReceive}] 接收完成！正在合成...`);

            const fullFile = new Blob(currentFileBuffer);
            const downloadUrl = URL.createObjectURL(fullFile);

            // **存储已接收的文件信息**
            receivedFiles.push({
                name: currentFileName,
                blob: fullFile
            });

            // 添加到下载列表 (提供单独下载)
            const downloadElement = document.createElement('a');
            downloadElement.href = downloadUrl;
            downloadElement.download = currentFileName;
            downloadElement.textContent = `下载 ${currentFileName} (${(currentFileSize / 1024 / 1024).toFixed(2)} MB)`;
            downloadListDiv.appendChild(downloadElement);

            // 重置当前文件状态，准备接收下一个
            currentFileBuffer = [];
            filesReceivedCount++;

            if (filesReceivedCount >= totalFilesToReceive) {
                // 所有文件接收完毕
                logStatus('🎉 所有文件传输完成！');
                transferTitle.textContent = '所有文件接收完毕！请下载文件。';
                currentFileInfoP.textContent = '';

                // 显示清理和 ZIP 下载按钮
                cleanRoomBtn.style.display = 'block';
                zipDownloadBtn.style.display = 'block';
            } else {
                transferTitle.textContent = `等待发送方发送下一个文件 (${filesReceivedCount + 1}/${totalFilesToReceive})...`;
            }
        }
    }
}


// -----------------------------------------------------------
// 7. 辅助函数：ZIP 打包下载
// -----------------------------------------------------------
async function createZipAndDownload() {
    if (receivedFiles.length === 0) {
        logStatus('❌ 没有接收到的文件可以打包。');
        return;
    }

    zipDownloadBtn.disabled = true;
    zipDownloadBtn.textContent = '正在打包中...请稍候...';
    logStatus('正在打包文件为 ZIP...');

    const zip = new JSZip();
    receivedFiles.forEach(file => {
        // 将 Blob 添加到 ZIP 文件中
        zip.file(file.name, file.blob);
    });

    try {
        const content = await zip.generateAsync({ type: "blob" });

        // 创建下载链接
        const zipFileName = `QuarkShare_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.zip`;
        const zipUrl = URL.createObjectURL(content);

        const a = document.createElement('a');
        a.href = zipUrl;
        a.download = zipFileName;
        document.body.appendChild(a);
        a.click(); // 触发下载
        document.body.removeChild(a);

        URL.revokeObjectURL(zipUrl); // 清理 URL

        logStatus(`✅ ZIP 文件 ${zipFileName} 已生成并开始下载。`);

    } catch (error) {
        logStatus(`❌ ZIP 打包失败: ${error.message}`);
    } finally {
        zipDownloadBtn.disabled = false;
        zipDownloadBtn.textContent = '打包下载所有文件 (.zip)';
    }
}


// -----------------------------------------------------------
// 8. 事件监听器
// -----------------------------------------------------------

// 监听：文件选择
fileInput.addEventListener('change', (e) => {
    const limit = getFileLimit();
    const selected = Array.from(e.target.files);
    if (selected.length > limit) {
        logStatus(`⚠️ 最多选择 ${limit} 个文件${isLoggedUser() ? '' : '（登录后可提升至 50）'}，已自动截取前 ${limit} 个。`);
    }
    filesToSend = selected.slice(0, limit);
    renderSelectedFiles();
});

function renderSelectedFiles() {
    fileListUL.innerHTML = '';
    currentFileIndex = 0; // 重置索引

    if (filesToSend.length > 0) {
        fileListUL.style.display = 'block';
        filesToSend.forEach(file => {
            const li = document.createElement('li');
            li.textContent = `${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`;
            fileListUL.appendChild(li);
        });

        if (dataChannel?.readyState === 'open') {
            sendBtn.textContent = `发送 ${filesToSend.length} 个文件`;
            sendBtn.disabled = false;
        } else {
            sendBtn.textContent = `已选择 ${filesToSend.length} 个文件 (等待连接)`;
            sendBtn.disabled = true;
        }
    } else {
        fileListUL.style.display = 'none';
        sendBtn.textContent = '请选择文件';
        sendBtn.disabled = true;
    }
}

// 监听：点击发送按钮
sendBtn.addEventListener('click', () => {
    if (filesToSend.length > 0 && dataChannel && dataChannel.readyState === 'open') {
        currentFileIndex = 0; // 确保从第一个文件开始发送
        sendNextFile();
    } else {
        logStatus('❌ 请先选择文件或等待连接建立。');
    }
});

async function beginConnection(roomCode, sending) {
    joinBtn.disabled = createBtn.disabled = true;
    connectionState('connecting', '正在连接闪传服务…');
    try {
        if (!database) {
            if (!window.firebase?.database) throw new Error('Firebase unavailable');
            const config = await window.QuarkFirebaseReady.loadConfigScript({
                id: 'share-firebase-config', force: true, timeout: 8000
            });
            if (!window.firebase.apps.length) window.firebase.initializeApp(config);
            database = window.firebase.database();
        }
        joinSection.style.display = 'none';
        transferSection.style.display = 'block';
        connectionState('connecting', '等待另一台设备连接…');
        clearTimeout(connectionTimer);
        connectionTimer = setTimeout(() => {
            if (currentRoomCode === roomCode && dataChannel?.readyState !== 'open') {
                connectionState('unavailable', '连接超时，请确认另一台设备已打开闪传，再返回连接。');
            }
        }, 30000);
        renderSelectedFiles();
        if (sending) await createSenderOffer(roomCode);
        else await createReceiverAnswer(roomCode);
    } catch {
        if (!currentRoomCode) {
            joinSection.style.display = 'block';
            transferSection.style.display = 'none';
        }
        connectionState('unavailable', '闪传服务暂不可用。请检查网络后重试，连接码已保留。');
    } finally {
        joinBtn.disabled = createBtn.disabled = false;
    }
}

createBtn.addEventListener('click', () => {
    roomCodeInput.value = generateRoomCode();
    void beginConnection(roomCodeInput.value, true);
});

joinBtn.addEventListener('click', () => {
    const roomCode = roomCodeInput.value.toUpperCase().trim();
    if (!/^[A-Z]{3}$/.test(roomCode)) {
        logStatus('❌ 连接码必须是三位大写字母。');
        connectionState('idle', '请输入三位英文字母作为连接码。');
        return;
    }
    void beginConnection(roomCode, false);
});
returnToConnect.onclick = () => { resetUI(true); roomCodeInput.focus(); };

cleanRoomBtn.addEventListener('click', () => {
    cleanRoomData(currentRoomCode);
});

// ZIP 下载按钮监听
zipDownloadBtn.addEventListener('click', createZipAndDownload);
