firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// -----------------------------------------------------------
// 2. 核心变量与 DOM 元素
// -----------------------------------------------------------
let currentRoomCode = null;
let localWebSocket = null;

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
// 3. 实用函数
// -----------------------------------------------------------

function logStatus(message, type) {
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    const cls = type ? `log-${type}` : '';
    const entry = document.createElement('span');
    entry.className = 'log-entry';
    entry.innerHTML = `<span class="log-time">${time}</span><span class="${cls}">${message}</span>`;
    statusDiv.insertBefore(entry, statusDiv.firstChild);
    // keep max ~30 entries
    while (statusDiv.children.length > 30) {
        statusDiv.removeChild(statusDiv.lastChild);
    }
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
// 4. 放映端 (Projector) 逻辑
// -----------------------------------------------------------

function setupProjector(code) {
    currentRoomCode = code;
    joinSection.style.display = 'none';
    projectorView.style.display = 'block';
    projectorCodeDisplay.textContent = code;
    logStatus(`放映端启动，房间 ${code}，连接桥接程序...`, 'info');

    localWebSocket = new WebSocket('ws://localhost:8080');

    localWebSocket.onopen = () => {
        localBridgeStatus.textContent = '连接成功';
        localBridgeStatus.style.color = 'var(--main-green)';
        logStatus('已连接本地桥接程序', 'ok');

        localWebSocket.send(JSON.stringify({
            type: 'CONNECT_ROOM',
            code: currentRoomCode
        }));

        let lastTimestamp = 0;
        database.ref(`rooms/${currentRoomCode}/command`).on('value', (snapshot) => {
            if (!snapshot.exists()) return;
            const cmd = snapshot.val();
            if (cmd && cmd.action && cmd.timestamp > lastTimestamp) {
                lastTimestamp = cmd.timestamp;
                logStatus(`桥接执行: ${cmd.action}`, 'action');
                firebaseListenStatus.textContent = `已执行: ${cmd.action}`;
                firebaseListenStatus.style.color = 'var(--main-green)';
                if (localWebSocket.readyState === WebSocket.OPEN) {
                    localWebSocket.send(JSON.stringify({
                        type: 'EXECUTE',
                        action: cmd.action,
                        timestamp: cmd.timestamp
                    }));
                }
            }
        });

        firebaseListenStatus.textContent = `Firebase 监听中 (房间 ${code})`;
    };

    localWebSocket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            logStatus(`桥接: ${data.message || data.status || event.data}`, 'info');
        } catch (e) {
            logStatus(`桥接: ${event.data}`, 'info');
        }
    };

    localWebSocket.onclose = () => {
        localBridgeStatus.textContent = '断开中 (ws://localhost:8080)';
        localBridgeStatus.style.color = 'var(--main-red)';
        firebaseListenStatus.textContent = '未启动';
        firebaseListenStatus.style.color = '#333';
        logStatus('与本地桥接程序断开连接', 'err');
        if (currentRoomCode) {
            database.ref(`rooms/${currentRoomCode}/command`).off('value');
        }
    };

    localWebSocket.onerror = () => {
        localBridgeStatus.textContent = '连接失败 (ws://localhost:8080)';
        localBridgeStatus.style.color = 'var(--main-red)';
        logStatus('桥接 WebSocket 连接失败，请确认程序已管理员身份运行', 'err');
    };
}

// -----------------------------------------------------------
// 5. 遥控端 (Controller) 逻辑
// -----------------------------------------------------------

/** 动作显示名称映射 */
const ACTION_LABELS = {
    next: '下一页', prev: '上一页', first: '首页', last: '尾页',
    blank: '黑屏', white: '白屏', endshow: '退出放映',
    pointer: '激光笔', pen: '笔模式', arrow: '箭头指针', eraser: '橡皮擦',
    hideptr: '隐藏指针', showptr: '显示指针',
    zoomin: '放大', zoomout: '缩小',
};

function setupController(code) {
    currentRoomCode = code;
    joinSection.style.display = 'none';
    controllerView.style.display = 'block';
    controllerCodeDisplay.textContent = code;
    logStatus(`遥控端已连接，房间 ${code}`, 'ok');

    database.ref(`rooms/${code}/command`).once('value').then(snapshot => {
        const cmdStatus = document.getElementById('command-status');
        if (snapshot.exists()) {
            cmdStatus.textContent = '状态: 连接成功，可开始控制';
        } else {
            cmdStatus.textContent = '状态: 等待放映端创建房间...';
        }
    });
}

function sendCommand(action) {
    if (!currentRoomCode) {
        document.getElementById('command-status').textContent = '❌ 未连接房间';
        logStatus('未连接房间，无法发送命令', 'err');
        return;
    }

    const label = ACTION_LABELS[action] || action;
    const commandRef = database.ref(`rooms/${currentRoomCode}/command`);
    const commandPayload = {
        action: action,
        timestamp: Date.now()
    };

    commandRef.set(commandPayload)
        .then(() => {
            document.getElementById('command-status').textContent = `✓ ${label} 已发送`;
            logStatus(`发送命令: ${label}`, 'ok');
        })
        .catch(error => {
            document.getElementById('command-status').textContent = `❌ 发送失败`;
            logStatus(`发送失败: ${error.message}`, 'err');
        });
}

// 暴露到全局供 onclick 调用
window.sendCommand = sendCommand;

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
        logStatus('连接码必须是三位大写字母', 'err');
        return;
    }
    setupController(roomCode);
});
