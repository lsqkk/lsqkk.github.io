// message.js - 完全重写为静候加载模式
let firebaseInitialized = false;
let isWaiting = false;
let configCheckInterval = null;

// 静候Firebase配置加载（无限等待）
function waitForFirebaseConfig() {
    return new Promise((resolve, reject) => {
        // 立即检查
        if (typeof firebaseConfig !== 'undefined') {
            resolve(firebaseConfig);
            return;
        }

        console.log('🔄 等待Firebase配置加载...');

        // 创建全局事件监听
        window.__firebaseConfigLoaded = (config) => {
            if (typeof config === 'object' && config.projectId) {
                console.log('✅ Firebase配置通过全局事件加载');
                window.firebaseConfig = config;
                clearInterval(configCheckInterval);
                resolve(config);
            }
        };

        // 设置配置监听器
        Object.defineProperty(window, 'firebaseConfig', {
            set: function (value) {
                if (value && value.projectId) {
                    console.log('✅ Firebase配置通过属性设置加载');
                    clearInterval(configCheckInterval);
                    resolve(value);
                }
                // 保存到闭包变量
                this._firebaseConfig = value;
            },
            get: function () {
                return this._firebaseConfig;
            },
            configurable: true
        });

        // 静候轮询（低频率，不阻塞）
        configCheckInterval = setInterval(() => {
            if (window._firebaseConfig || window.firebaseConfig) {
                const config = window._firebaseConfig || window.firebaseConfig;
                if (config && config.projectId) {
                    console.log('✅ Firebase配置通过轮询发现');
                    clearInterval(configCheckInterval);
                    resolve(config);
                }
            }

            // 额外检查：直接执行配置脚本
            if (typeof firebaseConfig !== 'undefined') {
                console.log('✅ Firebase配置通过全局变量发现');
                clearInterval(configCheckInterval);
                resolve(firebaseConfig);
            }
        }, 300); // 每300ms检查一次，非常轻量
    });
}

// 主动触发配置脚本重新加载
function reloadFirebaseConfig() {
    return new Promise((resolve, reject) => {
        console.log('🔄 重新加载Firebase配置...');

        const scriptId = 'firebase-config-loader';
        const existingScript = document.getElementById(scriptId);
        if (existingScript) {
            existingScript.remove();
        }

        const script = document.createElement('script');
        script.id = scriptId;
        script.src = 'https://api.130923.xyz/api/firebase-config?v=' + Date.now();

        script.onload = () => {
            console.log('📦 配置脚本加载完成');
            // 等待一小段时间让变量定义
            setTimeout(() => {
                if (typeof firebaseConfig !== 'undefined') {
                    resolve(firebaseConfig);
                } else {
                    // 检查是否通过其他方式定义
                    setTimeout(() => {
                        if (window.firebaseConfig || window._firebaseConfig) {
                            resolve(window.firebaseConfig || window._firebaseConfig);
                        } else {
                            reject(new Error('配置未定义'));
                        }
                    }, 100);
                }
            }, 50);
        };

        script.onerror = (error) => {
            console.error('❌ 配置脚本加载失败:', error);
            reject(error);
        };

        // 添加到head，但保持异步
        script.async = true;
        document.head.appendChild(script);
    });
}

// 完全静候的加载函数
async function loadRecentMessagesWithInfiniteWait() {
    // 如果已经在等待，避免重复
    if (isWaiting) {
        console.log('⏳ 已经在等待加载中...');
        return;
    }

    isWaiting = true;
    const container = document.getElementById('recent-messages');

    try {
        // 显示等待状态
        if (container) {
            container.innerHTML = `
                <div class="index-announcement" style="text-align: center; padding: 15px;">
                    <div style="display: inline-flex; align-items: center; gap: 8px; color: #666;">
                        <div class="loading-spinner" style="
                            width: 16px;
                            height: 16px;
                            border: 2px solid #f3f3f3;
                            border-top: 2px solid #3498db;
                            border-radius: 50%;
                            animation: spin 1s linear infinite;
                        "></div>
                        <span>留言加载中...</span>
                    </div>
                    <style>
                        @keyframes spin {
                            0% { transform: rotate(0deg); }
                            100% { transform: rotate(360deg); }
                        }
                    </style>
                </div>
            `;
        }

        console.log('🚀 开始静候加载流程...');

        // 第1步：尝试直接使用现有配置
        if (typeof firebaseConfig !== 'undefined' && firebaseConfig.projectId) {
            console.log('✅ 使用现有Firebase配置');
            await initializeAndLoadMessages();
            return;
        }

        // 第2步：静候配置加载（无限等待）
        console.log('⏳ 进入静候模式...');

        try {
            // 尝试主动重新加载配置
            await reloadFirebaseConfig();
            console.log('✅ 配置重新加载成功');
        } catch (reloadError) {
            console.log('⚠️ 重新加载失败，继续静候现有配置:', reloadError);
            // 继续等待，不放弃
        }

        // 无限等待配置
        const config = await waitForFirebaseConfig();
        console.log('🎉 配置加载成功，开始初始化...');

        // 初始化并加载消息
        await initializeAndLoadMessages();

    } catch (error) {
        console.error('💥 加载过程出错:', error);
        showErrorMessage('留言加载失败，稍后会自动重试...');

        // 30秒后自动重试（完全静候模式）
        setTimeout(() => {
            console.log('🔄 自动重试加载...');
            isWaiting = false;
            loadRecentMessagesWithInfiniteWait();
        }, 30000);
    }
}

// 初始化和加载消息
async function initializeAndLoadMessages() {
    // 检查Firebase SDK
    if (typeof firebase === 'undefined') {
        throw new Error('Firebase SDK未加载');
    }

    // 初始化Firebase
    if (!firebaseInitialized) {
        try {
            // 确保我们使用正确的配置
            const config = window.firebaseConfig || firebaseConfig;

            if (!config || !config.projectId) {
                throw new Error('Firebase配置无效');
            }

            if (!firebase.apps.length) {
                firebase.initializeApp(config);
            }
            firebaseInitialized = true;
            console.log('✅ Firebase初始化成功');
        } catch (initError) {
            console.error('❌ Firebase初始化失败:', initError);
            throw initError;
        }
    }

    // 加载消息
    const database = firebase.database();
    const messagesRef = database.ref('chatrooms/lsqkk-lyb/messages');

    const snapshot = await messagesRef
        .orderByChild('timestamp')
        .limitToLast(3)
        .once('value');

    const messages = [];
    snapshot.forEach(childSnapshot => {
        messages.push(childSnapshot.val());
    });

    messages.reverse();
    displayRecentMessages(messages);
    isWaiting = false;
}

// 显示消息
function displayRecentMessages(messages) {
    const container = document.getElementById('recent-messages');
    if (!container) return;

    if (messages.length === 0) {
        container.innerHTML = `
            <div class="index-announcement">
                <p style="margin: 0; color: #666;">
                    <i class="fas fa-comment" style="margin-right: 5px;"></i>
                    暂无留言
                </p>
            </div>
        `;
        return;
    }

    let html = '';
    messages.forEach(message => {
        const date = new Date(message.timestamp);
        const timeStr = `${date.getMonth() + 1}-${date.getDate()} ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
        const content = message.text && message.text.length > 30 ?
            message.text.substring(0, 30) + '...' :
            (message.text || '无内容');
        const nickname = message.nickname || '匿名用户';

        html += `
            <div class="index-announcement" style="margin-bottom: 10px; padding: 10px; border-radius: 5px; background: rgba(0,0,0,0.03);">
                <div style="font-weight: bold; margin-bottom: 5px;">${nickname}</div>
                <div style="font-size: 0.9em; color: #666;">${content}</div>
                <div style="font-size: 0.8em; color: #dcdcdc; margin-top: 5px;">${timeStr}</div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// 显示错误
function showErrorMessage(message) {
    const container = document.getElementById('recent-messages');
    if (container) {
        container.innerHTML = `
            <div class="index-announcement" style="text-align: center; padding: 15px;">
                <div style="color: #f44336; margin-bottom: 8px;">
                    <i class="fas fa-exclamation-circle"></i>
                </div>
                <p style="margin: 0; font-size: 0.9em; color: #666;">${message}</p>
            </div>
        `;
    }
}

// 初始化（完全静候）
function initMessages() {
    console.log('🔧 初始化消息模块...');

    // 添加CSS样式
    const style = document.createElement('style');
    style.textContent = `
        .loading-spinner {
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(style);

    // 立即开始加载（静候模式）
    setTimeout(() => {
        loadRecentMessagesWithInfiniteWait();
    }, 100);

    // 监听页面可见性变化，当页面重新获得焦点时重试
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && !firebaseInitialized) {
            console.log('👀 页面重新可见，重试加载...');
            isWaiting = false;
            setTimeout(() => loadRecentMessagesWithInfiniteWait(), 1000);
        }
    });

    // 网络状态恢复时重试
    window.addEventListener('online', () => {
        console.log('🌐 网络恢复，重试加载...');
        if (!firebaseInitialized) {
            isWaiting = false;
            setTimeout(() => loadRecentMessagesWithInfiniteWait(), 2000);
        }
    });
}

// 页面加载完成后启动
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMessages);
} else {
    initMessages();
}