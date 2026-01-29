// message.js - 用于首页显示最近留言
let firebaseInitialized = false;

// 加载最近留言
async function loadRecentMessages() {
    try {
        console.log('开始加载最近留言...');

        // 检查Firebase配置是否已加载
        if (typeof firebaseConfig === 'undefined') {
            console.error('Firebase配置未加载，请确保firebase-config.js已加载');
            document.getElementById('recent-messages').innerHTML =
                '<div class="index-announcement"><p style="margin: 0;">留言功能初始化失败</p></div>';
            return;
        }

        // 检查Firebase SDK是否已加载
        if (typeof firebase === 'undefined') {
            console.error('Firebase SDK未加载');
            document.getElementById('recent-messages').innerHTML =
                '<div class="index-announcement"><p style="margin: 0;">留言功能初始化失败</p></div>';
            return;
        }

        // 初始化Firebase（如果尚未初始化）
        if (!firebaseInitialized) {
            try {
                if (!firebase.apps.length) {
                    firebase.initializeApp(firebaseConfig);
                }
                firebaseInitialized = true;
                console.log('Firebase初始化成功');
            } catch (initError) {
                console.error('Firebase初始化失败:', initError);
                document.getElementById('recent-messages').innerHTML =
                    '<div class="index-announcement"><p style="margin: 0;">留言功能初始化失败</p></div>';
                return;
            }
        }

        const database = firebase.database();
        const messagesRef = database.ref('chatrooms/lsqkk-lyb/messages');

        // 获取最近3条留言
        const snapshot = await messagesRef
            .orderByChild('timestamp')
            .limitToLast(3)
            .once('value');

        const messages = [];
        snapshot.forEach(childSnapshot => {
            const message = childSnapshot.val();
            messages.push(message);
        });

        // 按时间倒序排列（最新的在前面）
        messages.reverse();
        displayRecentMessages(messages);

    } catch (error) {
        console.error('加载留言失败:', error);
        const container = document.getElementById('recent-messages');
        if (container) {
            container.innerHTML =
                '<div class="index-announcement"><p style="margin: 0;">留言加载失败</p></div>';
        }
    }
}

// 显示最近留言
function displayRecentMessages(messages) {
    const container = document.getElementById('recent-messages');
    if (!container) return;

    if (messages.length === 0) {
        container.innerHTML = '<div class="index-announcement"><p style="margin: 0;">暂无留言</p></div>';
        return;
    }

    let html = '';
    messages.forEach(message => {
        const date = new Date(message.timestamp);
        const month = date.getMonth() + 1;
        const day = date.getDate();
        const hours = date.getHours();
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const dateStr = `${month}-${day} ${hours}:${minutes}`;

        // 截取内容前30个字符
        const content = message.text && message.text.length > 30 ?
            message.text.substring(0, 30) + '...' :
            (message.text || '无内容');

        const nickname = message.nickname || '匿名用户';

        html += `
            <div class="index-announcement" style="margin-bottom: 10px; padding: 10px; border-radius: 5px; background: rgba(0,0,0,0.03);">
                <div style="font-weight: bold; margin-bottom: 5px;">${nickname}</div>
                <div style="font-size: 0.9em; color: #666;">${content}</div>
                <div style="font-size: 0.8em; color: #999; margin-top: 5px;">${dateStr}</div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// 页面加载完成后执行
document.addEventListener('DOMContentLoaded', function () {
    // 添加一个延迟，确保所有脚本都加载完成
    setTimeout(() => {
        console.log('DOM加载完成，开始加载留言...');
        loadRecentMessages();
    }, 500);
});

// 如果DOM已经加载完成
if (document.readyState === 'interactive' || document.readyState === 'complete') {
    setTimeout(() => {
        console.log('文档已就绪，开始加载留言...');
        loadRecentMessages();
    }, 500);
}