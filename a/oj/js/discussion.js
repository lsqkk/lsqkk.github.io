/**
 * 夸克博客 OJ 讨论区核心逻辑
 * 功能完善版：包含 Firebase 交互、多级回复、Markdown 解析、完整的头像/昵称管理、管理员登录，
 * 采用列表/详情双视图模式，移除发布模态框。
 */

// --- Firebase 配置 ---
// **请将此处替换为您的实际 Firebase 配置**

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
// 确保 firebase 在 discussion.html 中已加载
if (typeof firebase !== 'undefined' && firebase.apps.length === 0) {
    firebase.initializeApp(firebaseConfig);
}

// --- 全局变量和常量 ---
const BOARD_NAME = 'oj-discussions';
let discussionsRef = null;
let currentPage = 1;
const PAGE_SIZE = 10;
let totalDiscussions = 0;
let isAdmin = localStorage.getItem('isAdmin') === 'true';

// 用户信息 (从本地存储读取)
let userAvatarType = localStorage.getItem('avatarType') || 'color';
let userColor = localStorage.getItem('userColor') || '#4a6cf7';
let userAvatarUrl = localStorage.getItem('userAvatarUrl') || '';
let nickname = localStorage.getItem('nickname') || '';


// --- 视图控制函数 ---

/**
 * 切换到列表视图 (默认视图)
 */
window.showListView = function () {
    document.getElementById('listView').style.display = 'block';
    document.getElementById('detailView').style.display = 'none';
    loadDiscussionsList();
}

/**
 * 切换到详情视图并加载内容
 * @param {string} discussionId - 要加载的讨论帖 ID
 */
window.showDetailView = function (discussionId) {
    document.getElementById('listView').style.display = 'none';
    document.getElementById('detailView').style.display = 'block';

    // 清空旧内容并显示加载状态
    const contentContainer = document.getElementById('singleDiscussionContent');
    if (contentContainer) contentContainer.innerHTML = '<div style="text-align: center; padding: 50px; color: #cbd5e0;">正在加载详情...</div>';

    loadSingleDiscussion(discussionId);
}


// --- 辅助函数 (时间、头像、分页、管理员登录) ---

function formatTime(timestamp) {
    if (!timestamp) return '未知时间';
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getUserAvatarStyle(currentNickname = nickname) {
    if (userAvatarType === 'image' && userAvatarUrl) {
        return { style: `background-image: url(${userAvatarUrl})`, content: '' };
    }
    return { style: `background: ${userColor}`, content: currentNickname ? currentNickname[0].toUpperCase() : 'A' };
}

function renderPagination() {
    const totalPages = Math.ceil(totalDiscussions / PAGE_SIZE);
    const paginationDiv = document.getElementById('pagination');
    if (!paginationDiv) return;

    paginationDiv.innerHTML = '';

    if (totalPages <= 1) return;

    for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement('button');
        btn.textContent = i;
        btn.className = (i === currentPage ? 'active' : '');
        btn.onclick = () => {
            currentPage = i;
            loadDiscussionsList();
        };
        paginationDiv.appendChild(btn);
    }
}

/**
 * 更新头像预览和本地存储 (包含昵称同步)
 */
window.updateAvatar = function (type) {
    const colorPicker = document.getElementById('colorPicker');
    const avatarUrlInput = document.getElementById('avatarUrl');
    const nicknameInput = document.getElementById('nickname');

    if (!nicknameInput) return; // 确保表单元素存在

    nickname = nicknameInput.value.trim();
    localStorage.setItem('nickname', nickname);

    userAvatarType = type;
    localStorage.setItem('avatarType', userAvatarType);

    if (type === 'color' && colorPicker) {
        userColor = colorPicker.value;
        localStorage.setItem('userColor', userColor);
    } else if (avatarUrlInput) {
        userAvatarUrl = avatarUrlInput.value.trim();
        localStorage.setItem('userAvatarUrl', userAvatarUrl);
    }

    const preview = getUserAvatarStyle(nickname);
    const avatarPreview = document.getElementById('avatarPreview');
    if (avatarPreview) {
        avatarPreview.style.cssText = preview.style;
        avatarPreview.textContent = preview.content;
    }
}

/**
 * 初始化头像类型切换逻辑
 */
function initAvatarToggle() {
    const colorToggle = document.getElementById('color-toggle');
    const imageToggle = document.getElementById('image-toggle');
    const colorSelector = document.getElementById('color-selector');
    const imageSelector = document.getElementById('image-selector');
    const nicknameInput = document.getElementById('nickname');

    if (!nicknameInput || !colorToggle) return; // 确保表单元素存在

    document.getElementById('colorPicker').value = userColor;
    document.getElementById('avatarUrl').value = userAvatarUrl;
    nicknameInput.value = nickname;

    const selectors = [
        { btn: colorToggle, sel: colorSelector, type: 'color' },
        { btn: imageToggle, sel: imageSelector, type: 'image' }
    ];

    selectors.forEach(item => {
        item.btn.onclick = () => {
            selectors.forEach(s => {
                s.btn.classList.remove('active');
                s.sel.classList.remove('active');
            });
            item.btn.classList.add('active');
            item.sel.classList.add('active');
            updateAvatar(item.type);
        };
    });

    // 设置默认状态
    selectors.forEach(item => {
        if (item.type === userAvatarType) {
            item.btn.classList.add('active');
            item.sel.classList.add('active');
        }
    });

    document.getElementById('colorPicker').addEventListener('change', () => updateAvatar('color'));
    document.getElementById('avatarUrl').addEventListener('input', () => updateAvatar('image'));
    nicknameInput.addEventListener('input', () => updateAvatar(userAvatarType));

    updateAvatar(userAvatarType);
}

/**
 * 异步 SHA-256 哈希计算 (用于管理员登录)
 */
async function sha256(message) {
    const crypto = window.crypto || window.msCrypto;
    if (!crypto || !crypto.subtle) {
        throw new Error("浏览器不支持 Web Crypto API");
    }
    const encoder = new TextEncoder();
    const data = encoder.encode(message);

    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * 管理员登录逻辑
 */
window.adminLogin = async function () {
    const passwordInput = document.getElementById('adminPassword');
    const password = passwordInput.value.trim();

    if (!password) {
        alert('请输入管理员密码');
        return;
    }

    try {
        const hash = await sha256(password);
        // [重要] 请将此哈希值替换为您实际管理员密码的 SHA-256 哈希值
        const expectedHash = '936a185caaa266bb9cbe981e9e05cb78cd732b0b3280eb944412bb6f8f8f07af';

        if (hash === expectedHash) {
            isAdmin = true;
            localStorage.setItem('isAdmin', 'true');
            alert('管理员登录成功');
            passwordInput.value = '';
            updateAdminUI();

            // 根据当前视图重新加载内容
            const isDetailView = document.getElementById('detailView').style.display !== 'none';
            if (isDetailView) {
                const currentDiscussionId = document.getElementById('singleDiscussionContent').dataset.discussionId;
                if (currentDiscussionId) loadSingleDiscussion(currentDiscussionId);
            } else {
                loadDiscussionsList();
            }
        } else {
            alert('密码错误');
        }
    } catch (e) {
        alert('登录出错: ' + e.message);
    }
}

/**
 * 更新管理员 UI 状态 (隐藏/显示登录框)
 */
function updateAdminUI() {
    const loginArea = document.getElementById('admin-login-area');
    if (loginArea) {
        loginArea.style.display = isAdmin ? 'none' : 'flex';
    }
}


// --- 列表视图逻辑 ---

/**
 * 加载并渲染讨论列表的总结项
 */
function loadDiscussionsList() {
    const searchTerm = (document.getElementById('discussionSearchInput') || { value: '' }).value.trim().toLowerCase();
    const discussionsContainer = document.getElementById('discussionsContainer');
    if (discussionsContainer) discussionsContainer.innerHTML = '正在加载讨论...';

    discussionsRef.once('value').then(snapshot => {
        const discussions = [];
        snapshot.forEach(childSnapshot => {
            const discussion = childSnapshot.val();
            discussion.id = childSnapshot.key;

            if (searchTerm &&
                !discussion.title.toLowerCase().includes(searchTerm) &&
                !discussion.nickname.toLowerCase().includes(searchTerm) &&
                !(discussion.problemId && discussion.problemId.toString() === searchTerm)) {
                return;
            }

            discussions.push(discussion);
        });

        discussions.sort((a, b) => b.timestamp - a.timestamp);

        totalDiscussions = discussions.length;
        renderDiscussionsSummaries(discussions);
        renderPagination();
    }).catch(error => {
        console.error("加载讨论列表失败:", error);
        if (discussionsContainer) discussionsContainer.innerHTML = '讨论列表加载失败。';
    });
}

function renderDiscussionsSummaries(discussions) {
    const container = document.getElementById('discussionsContainer');
    if (!container) return;

    const startIndex = (currentPage - 1) * PAGE_SIZE;
    const endIndex = Math.min(startIndex + PAGE_SIZE, discussions.length);
    const pageDiscussions = discussions.slice(startIndex, endIndex);

    container.innerHTML = '';

    if (pageDiscussions.length === 0) {
        container.innerHTML = `<div style="text-align: center; padding: 20px;" class="glass-card">暂无讨论帖。</div>`;
        return;
    }

    pageDiscussions.forEach(discussion => {
        const summaryDiv = document.createElement('div');
        summaryDiv.className = 'discussion-summary';
        summaryDiv.onclick = () => showDetailView(discussion.id);

        // 截取前100字符作为摘要
        const summaryText = (discussion.text || '').substring(0, 100) + (discussion.text.length > 100 ? '...' : '');
        const replyCount = Object.keys(discussion.replies || {}).length;

        summaryDiv.innerHTML = `
            <div class="summary-header">
                <div class="summary-title">${discussion.title}</div>
                <div class="summary-meta">
                    <span class="problem-tag">P${discussion.problemId}</span>
                    <span><i class="fas fa-user"></i> ${discussion.nickname}</span>
                    <span><i class="fas fa-comment"></i> ${replyCount}</span>
                </div>
            </div>
            <p style="color: #a0aec0; font-size: 0.9em; margin: 5px 0 0 0;">
                ${summaryText}
            </p>
        `;
        container.appendChild(summaryDiv);
    });
}

/**
 * 提交新的主讨论帖 (从常驻表单)
 */
window.submitNewDiscussion = function () {
    const nicknameInput = document.getElementById('nickname');
    const title = document.getElementById('newDiscussionTitle');
    const content = document.getElementById('newDiscussionContent');
    const problemId = document.getElementById('newDiscussionProblemId');

    if (!nicknameInput || !title || !content || !problemId) return; // 安全检查

    const currentNickname = nicknameInput.value.trim();
    const currentTitle = title.value.trim();
    const currentContent = content.value.trim();
    const currentProblemId = problemId.value.trim();

    if (!currentNickname || !currentTitle || !currentContent || !currentProblemId) {
        alert('请填写昵称、主题、内容和关联题目 ID');
        return;
    }

    const parsedProblemId = parseInt(currentProblemId);
    if (isNaN(parsedProblemId) || parsedProblemId <= 0) {
        alert('关联题目 ID 必须是有效的数字');
        return;
    }

    updateAvatar(userAvatarType); // 确保最新头像和昵称已同步

    const discussion = {
        title: currentTitle,
        problemId: parsedProblemId,
        text: currentContent,
        nickname: nickname,
        avatar: userAvatarType === 'color' ? userColor : userAvatarUrl,
        avatarType: userAvatarType,
        timestamp: Date.now(),
        isMarkdown: true,
        likes: 0
    };

    discussionsRef.push(discussion)
        .then(() => {
            alert('讨论发布成功！');
            // 清空表单
            title.value = '';
            content.value = '';
            // 重新加载列表
            loadDiscussionsList();
        })
        .catch(error => {
            alert("发布讨论失败：" + error.message);
        });
}


// --- 详情视图逻辑 ---

/**
 * 加载单个讨论帖的详情和回复
 */
function loadSingleDiscussion(discussionId) {
    discussionsRef.child(discussionId).once('value').then(snapshot => {
        const discussion = snapshot.val();
        if (!discussion) {
            alert('讨论帖不存在。');
            showListView();
            return;
        }
        discussion.id = discussionId;
        renderSingleDiscussion(discussion);
    }).catch(error => {
        console.error("加载详情失败:", error);
        const container = document.getElementById('singleDiscussionContent');
        if (container) container.innerHTML = '<div style="color: red; padding: 20px;">加载讨论详情失败。</div>';
    });
}

/**
 * 渲染单个讨论帖的完整内容
 */
function renderSingleDiscussion(discussion) {
    const container = document.getElementById('singleDiscussionContent');
    if (!container) return;

    container.dataset.discussionId = discussion.id;

    // 主帖内容渲染
    const contentHtml = marked.parse(discussion.text || '');

    // 主帖头像 (仅用于展示作者信息，不渲染在这里，而是渲染在 reply-meta 里)

    // 回复树渲染
    const repliesHtml = renderRepliesTree(discussion.id, discussion.replies || {});

    container.innerHTML = `
        <div class="detail-header">
            <h1 class="discussion-title">${discussion.title}</h1>
            <div class="detail-meta-row">
                <div class="author-time">
                    <span class="problem-tag">P${discussion.problemId}</span>
                    <span style="font-weight: bold; color: #81D4FA;">作者：${discussion.nickname}</span>
                    <span>发布于：${formatTime(discussion.timestamp)}</span>
                </div>
                <div class="message-actions">
                    <button class="action-btn" onclick="likeDiscussion('${discussion.id}')">
                        <i class="fas fa-heart"></i>
                        <span>${discussion.likes || 0}</span>
                    </button>
                    ${isAdmin ? `<button class="delete-btn" onclick="deleteDiscussion('${discussion.id}')">删除主帖</button>` : ''}
                </div>
            </div>
        </div>

        <div class="post-content">${contentHtml}</div>

        <div class="replies-section">
            <h2>评论与回复</h2>
            
            <div id="replyInputArea" class="reply-input-area">
                <textarea id="replyContent" rows="4" placeholder="回复此讨论 (支持 Markdown)"></textarea>
                <div class="reply-actions">
                    <button class="submit-btn" onclick="submitReply('${discussion.id}', null)">发布回复</button>
                </div>
            </div>
            
            <div class="replies-container">
                ${repliesHtml}
            </div>
        </div>
    `;
}

/**
 * 递归渲染回复树
 */
function renderRepliesTree(discussionId, replies) {
    if (!replies || Object.keys(replies).length === 0) return '';

    const replyMap = {};
    Object.keys(replies).forEach(key => {
        const reply = replies[key];
        reply.id = key;
        reply.replies = [];
        reply.discussionId = discussionId;
        replyMap[key] = reply;
    });

    const rootReplies = [];
    Object.keys(replyMap).forEach(key => {
        const reply = replyMap[key];
        if (reply.parentReplyId && replyMap[reply.parentReplyId]) {
            replyMap[reply.parentReplyId].replies.push(reply);
        } else {
            rootReplies.push(reply);
        }
    });

    rootReplies.sort((a, b) => a.timestamp - b.timestamp);

    let html = '';

    const renderNode = (node, depth = 0) => {
        const contentHtml = marked.parse(node.text || '');
        const parentNickname = node.parentReplyId && replyMap[node.parentReplyId] ? replyMap[node.parentReplyId].nickname : null;

        const avatarStyle = node.avatarType === 'image' ?
            `background-image: url(${node.avatar})` :
            `background: ${node.avatar}`;
        const avatarContent = node.avatarType === 'color' && node.nickname ? node.nickname[0].toUpperCase() : '';

        html += `
            <div class="reply-card depth-${Math.min(depth, 2)}">
                <div class="reply-header">
                    <div class="reply-meta">
                        <div class="message-avatar" style="${avatarStyle}">
                            ${avatarContent}
                        </div>
                        <div class="message-info">
                            <div class="message-author">
                                ${node.nickname} 
                                ${parentNickname ? `<span class="replying-to">回复 ${parentNickname}</span>` : ''}
                            </div>
                            <div class="message-time">${formatTime(node.timestamp)}</div>
                        </div>
                    </div>
                    
                    <div class="message-actions">
                        <button class="action-btn" onclick="likeReply('${discussionId}', '${node.id}')">
                            <i class="fas fa-heart"></i>
                            <span>${node.likes || 0}</span>
                        </button>
                        <button class="action-btn" onclick="promptReply('${discussionId}', '${node.id}', '${node.nickname}')">
                            <i class="fas fa-reply"></i>
                            <span>回复</span>
                        </button>
                        ${isAdmin ? `<button class="delete-btn" onclick="deleteReply('${discussionId}', '${node.id}')">删除</button>` : ''}
                    </div>
                </div>
                <div class="post-content" style="border-bottom: none; padding: 5px 0 10px 0;">${contentHtml}</div>
            </div>
        `;

        node.replies.sort((a, b) => a.timestamp - b.timestamp);
        node.replies.forEach(child => renderNode(child, depth + 1));
    };

    rootReplies.forEach(node => renderNode(node));

    return html;
}

/**
 * 提示用户回复，并将回复目标ID和昵称绑定到回复输入框
 */
window.promptReply = function (discussionId, parentReplyId, parentNickname) {
    const replyContent = document.getElementById('replyContent');
    const replyActions = document.querySelector('#replyInputArea .reply-actions');

    if (!replyContent || !replyActions) return;

    replyContent.value = `回复 @${parentNickname}：`;
    replyContent.focus();

    // 重新绑定提交按钮的事件，确保目标正确
    replyActions.innerHTML = `
        <button class="submit-btn" onclick="submitReply('${discussionId}', '${parentReplyId}')">发布回复</button>
        <button class="action-btn" onclick="resetReplyInput('${discussionId}')" style="margin-left: 10px;"><i class="fas fa-times"></i> 取消</button>
    `;
}

/**
 * 重置回复输入框 (回复目标重置为主帖)
 */
window.resetReplyInput = function (discussionId) {
    const replyContent = document.getElementById('replyContent');
    const replyActions = document.querySelector('#replyInputArea .reply-actions');

    if (replyContent) replyContent.value = '';

    if (replyActions) {
        replyActions.innerHTML = `
            <button class="submit-btn" onclick="submitReply('${discussionId}', null)">发布回复</button>
        `;
    }
}


// --- 初始化入口 ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. 初始化 Firebase 引用
    if (typeof firebase !== 'undefined' && firebase.apps.length > 0) {
        discussionsRef = firebase.database().ref(BOARD_NAME);
    } else {
        const container = document.getElementById('discussionsContainer');
        if (container) container.innerHTML = '<div style="color: red; padding: 20px;">Firebase 初始化失败，请检查 discussion.html 头部脚本和配置。</div>';
        return;
    }

    // 2. 初始化头像设置和常驻表单
    initAvatarToggle();

    // 3. 加载讨论列表 (默认视图)
    loadDiscussionsList();

    // 4. 绑定搜索事件
    const searchInput = document.getElementById('discussionSearchInput');
    const searchButton = document.getElementById('discussionSearchButton');
    if (searchInput) {
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') loadDiscussionsList();
        });
    }
    if (searchButton) {
        searchButton.addEventListener('click', loadDiscussionsList);
    }

    // 5. 更新管理员UI状态
    updateAdminUI();
});