firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// -----------------------------------------------------------
// 2. 核心变量与 DOM 元素
// -----------------------------------------------------------
let currentRoomCode = null;
let localWebSocket = null;

// DOM 元素引用
const joinSection = document.getElementById('join-section-remote');
const projectorView = document.getElementById('projector-view');
const controllerView = document.getElementById('controller-view');
const roomCodeInput = document.getElementById('room-code-input-remote');
const projectorCodeDisplay = document.getElementById('projector-code-display');
const controllerCodeDisplay = document.getElementById('controller-code-display');
const localBridgeStatus = document.getElementById('local-bridge-status');
const firebaseListenStatus = document.getElementById('firebase-listen-status');
const statusDiv = document.getElementById('status-remote');


// -----------------------------------------------------------
// 3. 核心函数：实用工具
// -----------------------------------------------------------

function logStatus(message) {
    statusDiv.innerHTML = `[${new Date().toLocaleTimeString()}] ${message}\n` + statusDiv.innerHTML;
    if (statusDiv.scrollTop > 0) statusDiv.scrollTop = 0;
}

function generateRoomCode() {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (let i = 0; i < 3; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

// -----------------------------------------------------------
// 4. 放映端 (Projector) 逻辑 - 连接本地桥接程序
// -----------------------------------------------------------

function setupProjector(code) {
    currentRoomCode = code;
    joinSection.style.display = 'none';
    projectorView.style.display = 'block';
    projectorCodeDisplay.textContent = code;
    logStatus(`放映端启动。尝试连接本地桥接程序 ws://localhost:8080 ...`);

    // 1. 启动 WebSocket 连接
    localWebSocket = new WebSocket('ws://localhost:8080');

    localWebSocket.onopen = () => {
        localBridgeStatus.textContent = '连接成功';
        localBridgeStatus.style.color = 'var(--main-green)';
        logStatus('✅ 已连接本地桥接程序。发送 Firebase 房间码。');

        // 2. 发送命令给本地程序，让它去监听 Firebase
        localWebSocket.send(JSON.stringify({
            type: 'CONNECT_ROOM',
            code: currentRoomCode
        }));
    };

    localWebSocket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.status === 'LISTENING') {
                firebaseListenStatus.textContent = `已开始监听 Firebase 房间 ${data.code}`;
                firebaseListenStatus.style.color = 'var(--main-blue)';
                logStatus(`本地桥接程序已确认监听 Firebase 房间 ${data.code}。`);
            }
        } catch (e) {
            logStatus(`收到桥接程序信息: ${event.data}`);
        }
    };

    localWebSocket.onclose = () => {
        localBridgeStatus.textContent = '断开中 (ws://localhost:8080)';
        localBridgeStatus.style.color = 'var(--main-red)';
        firebaseListenStatus.textContent = '未启动';
        firebaseListenStatus.style.color = '#333';
        logStatus('❌ 与本地桥接程序断开连接。请确保程序正在运行。');
    };

    localWebSocket.onerror = (error) => {
        localBridgeStatus.textContent = '连接失败 (ws://localhost:8080)';
        localBridgeStatus.style.color = 'var(--main-red)';
        logStatus(`❌ 本地 WebSocket 错误，请检查程序是否运行: ${error.message}`);
    };
}


// -----------------------------------------------------------
// 5. 遥控端 (Controller) 逻辑 - 发送命令
// -----------------------------------------------------------

function setupController(code) {
    currentRoomCode = code;
    joinSection.style.display = 'none';
    controllerView.style.display = 'block';
    controllerCodeDisplay.textContent = code;
    logStatus(`遥控端连接中。房间: ${code}`);

    // 检查房间状态
    database.ref(`rooms/${code}/command`).once('value').then(snapshot => {
        const commandStatusP = document.getElementById('command-status');
        if (snapshot.exists()) {
            commandStatusP.textContent = '状态: 连接成功，可开始控制';
        } else {
            commandStatusP.textContent = '状态: 警告！等待放映端创建房间...';
        }
    });
}

/** 发送命令到 Firebase */
function sendCommand(action) {
    if (!currentRoomCode) {
        document.getElementById('command-status').textContent = '❌ 未连接房间。请重试。';
        return;
    }

    const commandRef = database.ref(`rooms/${currentRoomCode}/command`);
    const commandPayload = {
        action: action,
        timestamp: Date.now()
    };

    // 使用 set() 覆盖旧命令
    commandRef.set(commandPayload)
        .then(() => {
            document.getElementById('command-status').textContent = `命令 ${action.toUpperCase()} 发送成功！`;
        })
        .catch(error => {
            document.getElementById('command-status').textContent = `❌ 命令发送失败: ${error.message}`;
            logStatus(`❌ 命令发送失败: ${error.message}`);
        });
}

// -----------------------------------------------------------
// 6. 事件监听器
// -----------------------------------------------------------

document.getElementById('start-projector-btn').addEventListener('click', () => {
    let roomCode = roomCodeInput.value.toUpperCase().trim();
    if (roomCode.length !== 3) {
        roomCode = generateRoomCode();
    }
    setupProjector(roomCode);
});

document.getElementById('join-controller-btn').addEventListener('click', () => {
    const roomCode = roomCodeInput.value.toUpperCase().trim();
    if (roomCode.length !== 3) {
        logStatus('❌ 连接码必须是三位大写字母。');
        return;
    }
    setupController(roomCode);
});