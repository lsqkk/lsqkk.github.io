firebase.initializeApp(firebaseConfig);

async function waitForAppCheck() {
}

// --- 全局变量和常量 ---
const BOARD_NAME = 'oj-discussions';
let discussionsRef = null;
let currentPage = 1;
const PAGE_SIZE = 10;
let totalDiscussions = 0;
const ADMIN_TOKEN_KEY = 'oj_discussion_admin_token';
let isAdmin = false;

// 用户信息 (从本地存储读取)
let userAvatarType = localStorage.getItem('avatarType') || 'color';
let userColor = localStorage.getItem('userColor') || '#4a6cf7';
let userAvatarUrl = localStorage.getItem('userAvatarUrl') || '';
let nickname = localStorage.getItem('nickname') || '';
let loginName = '';
let loginType = '';
let isLoggedUser = false;
let identityInstance = null;

function getGuestUid() {
    const shared = window.CommentShared;
    return shared && typeof shared.getGuestUid === 'function' ? shared.getGuestUid() : '';
}

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
    const shared = window.CommentRenderShared;
    if (shared && typeof shared.formatTime === 'function') {
        return shared.formatTime(timestamp);
    }
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

function formatAuthor(nick, login, type, uid) {
    const shared = window.CommentShared;
    if (shared && typeof shared.renderDisplayName === 'function') {
        return shared.renderDisplayName(nick || '', login || '', type || '', uid || '');
    }
    const base = nick || login || '访客';
    if (login) {
        const icon = type === 'local'
            ? `<span class="login-icon"><img src="/assets/img/logo_blue.png" alt="qb"></span>`
            : `<i class="fab fa-github login-icon"></i>`;
        return `${base}<span class="login-badge">${icon}@${login}</span>`;
    }
    const guestBadge = shared && typeof shared.renderGuestBadge === 'function' ? shared.renderGuestBadge(uid) : '';
    return `${base}${guestBadge}`;
}

function renderPagination() {
    const paginationDiv = document.getElementById('pagination');
    const sharedList = window.CommentListShared;
    if (!sharedList || typeof sharedList.renderPagination !== 'function') return;
    sharedList.renderPagination({
        container: paginationDiv,
        total: totalDiscussions,
        pageSize: PAGE_SIZE,
        current: currentPage,
        showArrows: true,
        onChange: (page) => {
            currentPage = page;
            loadDiscussionsList();
        }
    });
}

/**
 * 更新头像预览和本地存储 (包含昵称同步)
 */
function syncIdentityState() {
    if (!identityInstance || typeof identityInstance.getState !== 'function') return;
    const state = identityInstance.getState();
    nickname = state.nickname || '';
    loginName = state.login || '';
    loginType = state.loginType || '';
    isLoggedUser = Boolean(state.isLoggedUser);
    userAvatarType = state.avatarType || userAvatarType;
    userColor = state.avatarColor || userColor;
    userAvatarUrl = state.avatarUrl || userAvatarUrl;
}

/**
 * 初始化头像类型切换逻辑
 */
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

function getAdminToken() {
    return localStorage.getItem(ADMIN_TOKEN_KEY) || '';
}

function setAdminToken(token) {
    if (token) {
        localStorage.setItem(ADMIN_TOKEN_KEY, token);
    } else {
        localStorage.removeItem(ADMIN_TOKEN_KEY);
    }
}

async function verifyAdminSession() {
    const token = getAdminToken();
    if (!token) {
        isAdmin = false;
        updateAdminUI();
        return false;
    }

    try {
        const response = await fetch('__API_BASE__/api/admin-verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
        });
        const result = await response.json();
        isAdmin = !!(response.ok && result.valid);
        if (!isAdmin) setAdminToken('');
    } catch (e) {
        console.error('校验管理员会话失败:', e);
        isAdmin = false;
    }

    updateAdminUI();
    return isAdmin;
}

/**
 * 管理员登录逻辑 (安全版本)
 */
window.adminLogin = async function () {
    const passwordInput = document.getElementById('adminPassword');
    const password = passwordInput.value.trim();

    if (!password) {
        alert('请输入管理员密码');
        return;
    }

    try {
        // 1. 前端计算用户输入密码的哈希
        const userInputHash = await sha256(password);

        // 2. 调用 Vercel 安全API进行验证
        const response = await fetch('__API_BASE__/api/admin-auth', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ passwordHash: userInputHash }) // 发送哈希值
        });

        const result = await response.json();

        // 3. 根据API返回结果处理
        if (response.ok && result.success && result.token) {
            isAdmin = true;
            setAdminToken(result.token);
            alert('管理员登录成功');
            passwordInput.value = '';
            updateAdminUI();

            // ... (你原有的重新加载内容的逻辑)
            const isDetailView = document.getElementById('detailView').style.display !== 'none';
            if (isDetailView) {
                const currentDiscussionId = document.getElementById('singleDiscussionContent').dataset.discussionId;
                if (currentDiscussionId) loadSingleDiscussion(currentDiscussionId);
            } else {
                loadDiscussionsList();
            }
        } else {
            // 登录失败
            alert('密码错误: ' + (result.error || ''));
        }

    } catch (e) {
        console.error('登录过程出错:', e);
        alert('登录过程发生错误，请检查网络或稍后再试。');
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

// --- 新增：点赞功能实现 ---

/**
 * 点赞讨论帖
 */
window.likeDiscussion = function (discussionId) {
    if (!discussionsRef) return;

    const discussionRef = discussionsRef.child(discussionId);
    const sharedList = window.CommentListShared;
    if (sharedList && typeof sharedList.incrementLike === 'function') {
        sharedList.incrementLike(discussionRef.child('likes'));
    } else {
        discussionRef.transaction(discussion => {
            if (discussion) {
                discussion.likes = (discussion.likes || 0) + 1;
            }
            return discussion;
        });
    }
    Promise.resolve().then(() => {
        // 重新加载当前讨论详情以更新点赞数
        loadSingleDiscussion(discussionId);
    }).catch(error => {
        console.error("点赞失败:", error);
        alert("点赞失败，请重试");
    });
}

/**
 * 点赞回复
 */
window.likeReply = function (discussionId, replyId) {
    if (!discussionsRef) return;

    const replyRef = discussionsRef.child(discussionId).child('replies').child(replyId);
    const sharedList = window.CommentListShared;
    if (sharedList && typeof sharedList.incrementLike === 'function') {
        sharedList.incrementLike(replyRef.child('likes'));
    } else {
        replyRef.transaction(reply => {
            if (reply) {
                reply.likes = (reply.likes || 0) + 1;
            }
            return reply;
        });
    }
    Promise.resolve().then(() => {
        // 重新加载当前讨论详情以更新点赞数
        loadSingleDiscussion(discussionId);
    }).catch(error => {
        console.error("点赞失败:", error);
        alert("点赞失败，请重试");
    });
}

// --- 新增：删除功能实现 ---

/**
 * 删除讨论帖（管理员）
 */
window.deleteDiscussion = function (discussionId) {
    if (!isAdmin) {
        alert('无权限删除讨论帖');
        return;
    }

    if (!confirm('确定要删除这个讨论帖吗？此操作不可恢复。')) {
        return;
    }

    discussionsRef.child(discussionId).remove()
        .then(() => {
            alert('讨论帖已删除');
            showListView(); // 返回列表视图
        })
        .catch(error => {
            console.error("删除失败:", error);
            alert("删除失败: " + error.message);
        });
}

/**
 * 删除回复（管理员）
 */
window.deleteReply = function (discussionId, replyId) {
    if (!isAdmin) {
        alert('无权限删除回复');
        return;
    }

    if (!confirm('确定要删除这条回复吗？')) {
        return;
    }

    discussionsRef.child(discussionId).child('replies').child(replyId).remove()
        .then(() => {
            alert('回复已删除');
            loadSingleDiscussion(discussionId); // 重新加载详情
        })
        .catch(error => {
            console.error("删除失败:", error);
            alert("删除失败: " + error.message);
        });
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
                !(discussion.login || '').toLowerCase().includes(searchTerm) &&
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
    const sharedList = window.CommentListShared;
    const pageDiscussions = sharedList && typeof sharedList.paginate === 'function'
        ? sharedList.paginate(discussions, currentPage, PAGE_SIZE)
        : discussions.slice(startIndex, Math.min(startIndex + PAGE_SIZE, discussions.length));

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
                    <span><i class="fas fa-user"></i> ${formatAuthor(discussion.nickname, discussion.login, discussion.loginType, discussion.uid)}</span>
                    <span><i class="fas fa-heart"></i> ${discussion.likes || 0}</span>
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

    if (identityInstance && typeof identityInstance.refreshFromInputs === 'function') {
        identityInstance.refreshFromInputs();
        syncIdentityState();
    }

    const currentNickname = isLoggedUser ? (nickname || loginName || '') : nicknameInput.value.trim();
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

    const discussion = {
        title: currentTitle,
        problemId: parsedProblemId,
        text: currentContent,
        nickname: nickname,
        login: loginName || '',
        loginType: isLoggedUser ? (loginType || localStorage.getItem('quark_login_type') || '') : '',
        uid: isLoggedUser ? (window.QuarkUserProfile && typeof window.QuarkUserProfile.getUid === 'function'
            ? window.QuarkUserProfile.getUid()
            : '') : getGuestUid(),
        avatar: userAvatarType === 'color' ? userColor : userAvatarUrl,
        avatarType: userAvatarType,
        timestamp: Date.now(),
        isMarkdown: true,
        likes: 0,
        replies: {} // 初始化回复对象
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
    const renderShared = window.CommentRenderShared;
    const contentHtml = renderShared && typeof renderShared.renderMarkdown === 'function'
        ? renderShared.renderMarkdown(discussion.text || '', true)
        : marked.parse(discussion.text || '');

    // 回复树渲染
    const repliesHtml = renderRepliesTree(discussion.id, discussion.replies || {});

    container.innerHTML = `
        <div class="detail-header">
            <h1 class="discussion-title">${discussion.title}</h1>
            <div class="detail-meta-row">
                <div class="author-time">
                    <span class="problem-tag">P${discussion.problemId}</span>
                    <span style="font-weight: bold; color: #81D4FA;">作者：${formatAuthor(discussion.nickname, discussion.login, discussion.loginType, discussion.uid)}</span>
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

    const renderShared = window.CommentRenderShared;
    const tree = renderShared && typeof renderShared.buildReplyTree === 'function'
        ? renderShared.buildReplyTree(replies)
        : { roots: [], map: {} };
    const rootReplies = tree.roots || [];
    const replyMap = tree.map || {};

    let html = '';

    const renderNode = (node, depth = 0) => {
        const contentHtml = renderShared && typeof renderShared.renderMarkdown === 'function'
            ? renderShared.renderMarkdown(node.text || '', true)
            : marked.parse(node.text || '');
        const parentNickname = node.parentReplyId && replyMap[node.parentReplyId] ? replyMap[node.parentReplyId].nickname : null;

        const avatarStyle = node.avatarType === 'image' ?
            `background-image: url(${node.avatar})` :
            `background: ${node.avatar}`;
        const avatarContent = node.avatarType === 'color' && node.nickname ? node.nickname[0].toUpperCase() : '';
        const shared = window.CommentShared;
        const spaceUrl = shared && typeof shared.getUserSpaceUrl === 'function'
            ? shared.getUserSpaceUrl(node.login || '', node.loginType || '')
            : '';
        const safeSpaceUrl = shared && typeof shared.escapeHtml === 'function'
            ? shared.escapeHtml(spaceUrl)
            : spaceUrl;
        const avatarBlock = `
                        <div class="message-avatar" style="${avatarStyle}">
                            ${avatarContent}
                        </div>
                    `;
        const avatarHtml = spaceUrl
            ? `<a class="user-avatar-link" href="${safeSpaceUrl}">${avatarBlock}</a>`
            : avatarBlock;

        html += `
            <div class="reply-card depth-${Math.min(depth, 2)}">
                <div class="reply-header">
                    <div class="reply-meta">
                        ${avatarHtml}
                        <div class="message-info">
                            <div class="message-author">
                                ${formatAuthor(node.nickname, node.login, node.loginType, node.uid)} 
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

        node.replies.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        node.replies.forEach(child => renderNode(child, depth + 1));
    };

    rootReplies.forEach(node => renderNode(node));

    return html;
}

// --- 新增：回复功能实现 ---

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

/**
 * 提交回复
 */
window.submitReply = function (discussionId, parentReplyId) {
    const replyContent = document.getElementById('replyContent');
    const content = replyContent.value.trim();

    if (!content) {
        alert('请输入回复内容');
        return;
    }

    // 检查昵称
    const nicknameInput = document.getElementById('nickname');
    if (identityInstance && typeof identityInstance.refreshFromInputs === 'function') {
        identityInstance.refreshFromInputs();
        syncIdentityState();
    }
    if (nicknameInput) {
        nickname = nicknameInput.value.trim() || nickname;
        if (!nickname) {
            if (!isLoggedUser) {
                alert('请先填写昵称');
                return;
            }
            nickname = loginName || '访客';
        }
    }

    const reply = {
        text: content,
        nickname: nickname,
        login: loginName || '',
        loginType: isLoggedUser ? (loginType || localStorage.getItem('quark_login_type') || '') : '',
        uid: isLoggedUser ? (window.QuarkUserProfile && typeof window.QuarkUserProfile.getUid === 'function'
            ? window.QuarkUserProfile.getUid()
            : '') : getGuestUid(),
        avatar: userAvatarType === 'color' ? userColor : userAvatarUrl,
        avatarType: userAvatarType,
        timestamp: Date.now(),
        isMarkdown: true,
        likes: 0,
        parentReplyId: parentReplyId || null
    };

    // 生成唯一的回复ID
    const replyId = 'reply_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

    // 保存到Firebase
    discussionsRef.child(discussionId).child('replies').child(replyId).set(reply)
        .then(() => {
            alert('回复发布成功！');
            replyContent.value = '';
            resetReplyInput(discussionId);
            loadSingleDiscussion(discussionId); // 重新加载详情
        })
        .catch(error => {
            alert("发布回复失败：" + error.message);
        });
}

// --- 初始化入口 ---
document.addEventListener('DOMContentLoaded', async () => {
    // 1. 初始化 Firebase 引用
    if (typeof firebase !== 'undefined' && firebase.apps.length > 0) {
        await waitForAppCheck();
        discussionsRef = firebase.database().ref(BOARD_NAME);
    } else {
        const container = document.getElementById('discussionsContainer');
        if (container) container.innerHTML = '<div style="color: red; padding: 20px;">Firebase 初始化失败，请检查 discussion.html 头部脚本和配置。</div>';
        return;
    }

    // 2. 初始化头像设置和常驻表单
    if (window.CommentInputShared && typeof window.CommentInputShared.init === 'function') {
        identityInstance = window.CommentInputShared.init({ variant: 'oj' });
        syncIdentityState();
    }

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

    // 5. 校验并更新管理员UI状态
    verifyAdminSession();
});
