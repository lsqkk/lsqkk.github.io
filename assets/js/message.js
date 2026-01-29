// 加载最近留言的函数
async function loadRecentMessages() {
    try {
        // 检查全局配置是否已加载
        if (typeof firebaseConfig === 'undefined') {
            console.error('Firebase配置未加载，请确保firebase-config.js已加载');
            document.getElementById('recent-messages').innerHTML =
                '<div class="index-announcement"><p style="margin: 0;">留言功能初始化失败</p></div>';
            return;
        }

        // 检查Firebase SDK是否已加载
        if (typeof firebase === 'undefined') {
            console.error('Firebase SDK未加载，请确保firebase-app.js和firebase-database.js已加载');
            document.getElementById('recent-messages').innerHTML =
                '<div class="index-announcement"><p style="margin: 0;">留言功能初始化失败</p></div>';
            return;
        }

        // 初始化Firebase - 使用全局的firebaseConfig
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);  // 使用全局配置
        }

        const database = firebase.database();
        const messagesRef = database.ref('chatrooms/lsqkk-lyb/messages');

        // 获取最近3条留言
        messagesRef.orderByChild('timestamp').limitToLast(3).once('value').then(snapshot => {
            const messages = [];
            snapshot.forEach(childSnapshot => {
                const message = childSnapshot.val();
                messages.push(message);
            });

            // 按时间倒序排列（最新的在前面）
            messages.reverse();
            displayRecentMessages(messages);
        }).catch(error => {
            console.error('加载留言失败:', error);
            document.getElementById('recent-messages').innerHTML =
                '<div class="index-announcement"><p style="margin: 0;">留言加载失败</p></div>';
        });

    } catch (error) {
        console.error('初始化Firebase失败:', error);
        document.getElementById('recent-messages').innerHTML =
            '<div class="index-announcement"><p style="margin: 0;">留言功能暂不可用</p></div>';
    }
}

// 显示最近留言
function displayRecentMessages(messages) {
    const container = document.getElementById('recent-messages');

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
        const content = message.text.length > 30 ?
            message.text.substring(0, 30) + '...' :
            message.text;

        html += `
            <div class="index-announcement" style="margin-bottom: 10px; padding: 10px; border-radius: 5px; background: rgba(0,0,0,0.03);">
                <div style="font-weight: bold; margin-bottom: 5px;">${message.nickname || '匿名用户'}</div>
                <div style="font-size: 0.9em; color: #666;">${content}</div>
                <div style="font-size: 0.8em; color: #999; margin-top: 5px;">${dateStr}</div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// 页面加载完成后自动调用加载函数
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
        // 确保所有依赖都加载完成后再执行
        setTimeout(loadRecentMessages, 100);
    });
} else {
    // 如果文档已经加载完成，直接执行
    setTimeout(loadRecentMessages, 100);
}