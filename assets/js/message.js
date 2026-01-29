// message.js - 完整版修复
// 加载最近留言功能

// 全局变量
let firebaseConfig = null;
let isInitializing = false;
let initQueue = [];

// 初始化Firebase配置
async function initFirebase() {
    if (isInitializing) {
        // 如果正在初始化，将回调加入队列
        return new Promise((resolve, reject) => {
            initQueue.push({ resolve, reject });
        });
    }

    isInitializing = true;

    try {
        console.log('开始加载Firebase配置...');

        // 1. 动态加载Firebase配置脚本
        await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://api.lsqkk.space/api/firebase-config?v=' + Date.now(); // 添加时间戳防止缓存
            script.onload = resolve;
            script.onerror = () => reject(new Error('Failed to load Firebase config'));
            document.head.appendChild(script);
        });

        // 2. 检查配置是否加载成功
        if (typeof window.firebaseConfig === 'undefined') {
            throw new Error('Firebase配置加载失败：window.firebaseConfig未定义');
        }

        firebaseConfig = window.firebaseConfig;
        console.log('Firebase配置加载成功:', firebaseConfig.projectId);

        // 3. 动态加载Firebase SDK
        await loadFirebaseSDK();

        // 4. 初始化Firebase
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
            console.log('Firebase初始化成功');
        }

        // 5. 处理队列中的等待回调
        initQueue.forEach(item => item.resolve());
        initQueue = [];
        isInitializing = false;

        return true;

    } catch (error) {
        console.error('Firebase初始化失败:', error);

        // 处理队列中的等待回调
        initQueue.forEach(item => item.reject(error));
        initQueue = [];
        isInitializing = false;

        throw error;
    }
}

// 动态加载Firebase SDK
function loadFirebaseSDK() {
    return new Promise((resolve, reject) => {
        // 检查是否已加载
        if (typeof firebase !== 'undefined' &&
            typeof firebase.app !== 'undefined' &&
            typeof firebase.database !== 'undefined') {
            console.log('Firebase SDK已加载');
            resolve();
            return;
        }

        console.log('开始加载Firebase SDK...');

        // 加载firebase-app.js
        const script1 = document.createElement('script');
        script1.src = 'https://www.gstatic.com/firebasejs/8.10.0/firebase-app.js';
        script1.onerror = () => reject(new Error('Failed to load firebase-app.js'));

        script1.onload = () => {
            console.log('firebase-app.js加载成功');

            // 加载firebase-database.js
            const script2 = document.createElement('script');
            script2.src = 'https://www.gstatic.com/firebasejs/8.10.0/firebase-database.js';
            script2.onerror = () => reject(new Error('Failed to load firebase-database.js'));

            script2.onload = () => {
                console.log('firebase-database.js加载成功');
                resolve();
            };

            document.head.appendChild(script2);
        };

        document.head.appendChild(script1);
    });
}

// 获取数据库实例
function getDatabase() {
    if (!firebaseConfig || !firebase.apps.length) {
        throw new Error('Firebase未初始化，请先调用initFirebase()');
    }
    return firebase.database();
}

// 加载最近留言
async function loadRecentMessages() {
    try {
        // 确保Firebase已初始化
        if (!firebaseConfig || !firebase.apps.length) {
            await initFirebase();
        }

        const database = getDatabase();
        const messagesRef = database.ref('chatrooms/lsqkk-lyb/messages');

        // 查询最新的3条留言，按时间戳排序
        const snapshot = await messagesRef
            .orderByChild('timestamp')
            .limitToLast(3)
            .once('value');

        const messages = [];
        snapshot.forEach(childSnapshot => {
            messages.push(childSnapshot.val());
        });

        // 按时间倒序排列（最新的在前）
        messages.reverse();

        // 显示留言
        displayRecentMessages(messages);

    } catch (error) {
        console.error('加载留言失败:', error);
        showErrorMessage('留言加载失败，请稍后重试');
    }
}

// 显示最近留言
function displayRecentMessages(messages) {
    const container = document.getElementById('recent-messages');

    if (!container) {
        console.error('找不到留言容器元素 #recent-messages');
        return;
    }

    if (messages.length === 0) {
        container.innerHTML = `
            <div class="index-announcement">
                <p style="margin: 0;">暂无留言，快来留下第一条吧！</p>
            </div>
        `;
        return;
    }

    let html = '';
    messages.forEach(message => {
        // 格式化时间
        const date = new Date(message.timestamp);
        const dateStr = `${date.getMonth() + 1}-${date.getDate()} ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;

        // 截取内容
        const content = message.text.length > 30 ?
            message.text.substring(0, 30) + '...' :
            message.text;

        // 转义HTML防止XSS
        const safeNickname = escapeHtml(message.nickname || '匿名');
        const safeContent = escapeHtml(content);

        html += `
            <div class="index-announcement" style="margin-bottom: 10px; padding: 10px; border-radius: 5px; background: rgba(0,0,0,0.03);">
                <div style="font-weight: bold; margin-bottom: 5px;">${safeNickname}</div>
                <div style="font-size: 0.9em; color: #666;">${safeContent}</div>
                <div style="font-size: 0.8em; color: #999; margin-top: 5px;">${dateStr}</div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// 显示错误信息
function showErrorMessage(message) {
    const container = document.getElementById('recent-messages');
    if (container) {
        container.innerHTML = `
            <div class="index-announcement">
                <p style="margin: 0; color: #dc3545;">${escapeHtml(message)}</p>
            </div>
        `;
    }
}

// HTML转义函数（防止XSS）
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 页面加载完成后执行
document.addEventListener('DOMContentLoaded', function () {
    // 检查是否已有容器元素
    if (!document.getElementById('recent-messages')) {
        console.warn('未找到 #recent-messages 元素，自动创建');
        const container = document.createElement('div');
        container.id = 'recent-messages';
        container.className = 'recent-messages-container';
        document.body.appendChild(container);
    }

    // 延迟加载留言，确保页面完全加载
    setTimeout(() => {
        loadRecentMessages();
    }, 500);
});

// 导出函数供外部调用
window.MessageLoader = {
    initFirebase,
    loadRecentMessages,
    refreshMessages: loadRecentMessages
};

// 开发环境调试用
if (typeof console !== 'undefined') {
    console.log('MessageLoader已加载，使用 window.MessageLoader 访问相关功能');
}