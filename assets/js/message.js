// @ts-check

/**
 * @typedef {Object} RecentMessageItem
 * @property {number=} timestamp
 * @property {string=} text
 * @property {string=} nickname
 */

let firebaseInitialized = false;
let isWaiting = false;
/** @type {number | null} */
let configCheckInterval = null;
let notifiedFirebaseReady = false;

/**
 * @returns {FirebaseConfig | null}
 */
function getFirebaseConfig() {
    return window.firebaseConfig || window._firebaseConfig || null;
}

function notifyFirebaseConfigReady(config) {
    if (notifiedFirebaseReady) return;
    if (!config || !config.projectId) return;
    notifiedFirebaseReady = true;
    window.dispatchEvent(new CustomEvent('firebase-config-loaded', { detail: config }));
}

// 静候Firebase配置加载（无限等待）
function waitForFirebaseConfig() {
    return new Promise((resolve) => {
        const existingConfig = getFirebaseConfig();
        if (existingConfig && existingConfig.projectId) {
            notifyFirebaseConfigReady(existingConfig);
            resolve(existingConfig);
            return;
        }

        console.log('🔄 等待Firebase配置加载...');

        window.__firebaseConfigLoaded = (config) => {
            if (typeof config === 'object' && config.projectId) {
                console.log('✅ Firebase配置通过全局事件加载');
                window.firebaseConfig = config;
                if (configCheckInterval !== null) {
                    window.clearInterval(configCheckInterval);
                    configCheckInterval = null;
                }
                notifyFirebaseConfigReady(config);
                resolve(config);
            }
        };

        Object.defineProperty(window, 'firebaseConfig', {
            set(value) {
                if (value && value.projectId) {
                    console.log('✅ Firebase配置通过属性设置加载');
                    if (configCheckInterval !== null) {
                        window.clearInterval(configCheckInterval);
                        configCheckInterval = null;
                    }
                    notifyFirebaseConfigReady(value);
                    resolve(value);
                }
                this._firebaseConfig = value;
            },
            get() {
                return this._firebaseConfig;
            },
            configurable: true
        });

        configCheckInterval = window.setInterval(() => {
            const config = getFirebaseConfig();
            if (config && config.projectId) {
                console.log('✅ Firebase配置通过轮询发现');
                if (configCheckInterval !== null) {
                    window.clearInterval(configCheckInterval);
                    configCheckInterval = null;
                }
                notifyFirebaseConfigReady(config);
                resolve(config);
            }
        }, 300);
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
        script.src = `__API_BASE__/api/firebase-config?v=${Date.now()}`;

        script.onload = () => {
            console.log('📦 配置脚本加载完成');
            window.setTimeout(() => {
                const config = getFirebaseConfig();
                if (config && config.projectId) {
                    resolve(config);
                    return;
                }

                window.setTimeout(() => {
                    const fallbackConfig = getFirebaseConfig();
                    if (fallbackConfig && fallbackConfig.projectId) {
                        resolve(fallbackConfig);
                    } else {
                        reject(new Error('配置未定义'));
                    }
                }, 100);
            }, 50);
        };

        script.onerror = (error) => {
            console.error('❌ 配置脚本加载失败:', error);
            reject(error);
        };

        script.async = true;
        document.head.appendChild(script);
    });
}

// 完全静候的加载函数
async function loadRecentMessagesWithInfiniteWait() {
    if (isWaiting) {
        console.log('⏳ 已经在等待加载中...');
        return;
    }

    isWaiting = true;
    const container = document.getElementById('recent-messages');

    try {
        if (container instanceof HTMLElement) {
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

        const config = getFirebaseConfig();
        if (config && config.projectId) {
            console.log('✅ 使用现有Firebase配置');
            await initializeAndLoadMessages();
            return;
        }

        console.log('⏳ 进入静候模式...');

        try {
            await reloadFirebaseConfig();
            console.log('✅ 配置重新加载成功');
        } catch (reloadError) {
            console.log('⚠️ 重新加载失败，继续静候现有配置:', reloadError);
        }

        await waitForFirebaseConfig();
        console.log('🎉 配置加载成功，开始初始化...');
        await initializeAndLoadMessages();
    } catch (error) {
        console.error('💥 加载过程出错:', error);
        showErrorMessage('留言加载失败，稍后会自动重试...');

        window.setTimeout(() => {
            console.log('🔄 自动重试加载...');
            isWaiting = false;
            void loadRecentMessagesWithInfiniteWait();
        }, 30000);
    }
}

// 初始化和加载消息
async function initializeAndLoadMessages() {
    const firebaseGlobal = window.firebase;
    if (!firebaseGlobal) {
        throw new Error('Firebase SDK未加载');
    }

    if (!firebaseInitialized) {
        try {
            const config = getFirebaseConfig();
            if (!config || !config.projectId) {
                throw new Error('Firebase配置无效');
            }

            if (!firebaseGlobal.apps.length) {
                firebaseGlobal.initializeApp(config);
            }
            firebaseInitialized = true;
            console.log('✅ Firebase初始化成功');
        } catch (initError) {
            console.error('❌ Firebase初始化失败:', initError);
            throw initError;
        }
    }

    const database = firebaseGlobal.database();
    const messagesRef = database.ref('chatrooms/lsqkk-lyb/messages');
    const snapshot = await messagesRef
        .orderByChild('timestamp')
        .limitToLast(3)
        .once('value');

    /** @type {RecentMessageItem[]} */
    const messages = [];
    snapshot.forEach(
        /** @param {{ val: () => RecentMessageItem }} childSnapshot */
        (childSnapshot) => {
            messages.push(childSnapshot.val());
        }
    );

    messages.reverse();
    displayRecentMessages(messages);
    isWaiting = false;
}

/**
 * @param {RecentMessageItem[]} messages
 */
function displayRecentMessages(messages) {
    const container = document.getElementById('recent-messages');
    if (!(container instanceof HTMLElement)) {
        return;
    }

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
    messages.forEach((message) => {
        const date = new Date(message.timestamp || Date.now());
        const timeStr = `${date.getMonth() + 1}-${date.getDate()} ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
        const content = message.text && message.text.length > 30
            ? `${message.text.substring(0, 30)}...`
            : (message.text || '无内容');
        const baseName = message.nickname || '匿名用户';
        const login = message.login || '';
        const displayName = login
            ? `${baseName}<span class="login-badge">${message.loginType === 'local'
                ? `<span class="login-icon"><img src="/assets/img/logo_blue.png" alt="qb"></span>`
                : `<i class="fab fa-github login-icon"></i>`}@${login}</span>`
            : baseName;

        html += `
            <div class="index-announcement" style="margin-bottom: 10px; padding: 10px; border-radius: 5px; background: rgba(0,0,0,0.03);">
                <div style="font-weight: bold; margin-bottom: 5px;">${displayName}</div>
                <div style="font-size: 0.9em; color: #666;">${content}</div>
                <div style="font-size: 0.8em; color: #dcdcdc; margin-top: 5px;">${timeStr}</div>
            </div>
        `;
    });

    container.innerHTML = html;
}

/**
 * @param {string} message
 */
function showErrorMessage(message) {
    const container = document.getElementById('recent-messages');
    if (container instanceof HTMLElement) {
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

    window.setTimeout(() => {
        void loadRecentMessagesWithInfiniteWait();
    }, 100);

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && !firebaseInitialized) {
            console.log('👀 页面重新可见，重试加载...');
            isWaiting = false;
            window.setTimeout(() => {
                void loadRecentMessagesWithInfiniteWait();
            }, 1000);
        }
    });

    window.addEventListener('online', () => {
        console.log('🌐 网络恢复，重试加载...');
        if (!firebaseInitialized) {
            isWaiting = false;
            window.setTimeout(() => {
                void loadRecentMessagesWithInfiniteWait();
            }, 2000);
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMessages);
} else {
    initMessages();
}
