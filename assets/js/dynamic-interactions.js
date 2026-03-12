// @ts-check

(function () {
    if (window.__dynamicInteractionsInited) return;
    window.__dynamicInteractionsInited = true;

    const DB_ROOT = 'dynamic_posts';
    const DEVICE_ID_KEY = 'dynamic_device_id';
    const NICKNAME_KEY = 'dynamic_comment_nickname';
    /** @type {any} */
    let rootRef = null;
    let bootPromise = null;
    let latestStatsMap = {};
    /** @type {Map<string, () => void>} */
    const cardListenerCleanupMap = new Map();

    /**
     * @param {string} src
     * @param {string} id
     * @returns {Promise<void>}
     */
    function loadScript(src, id) {
        return new Promise((resolve, reject) => {
            const existing = document.getElementById(id);
            if (existing) {
                resolve();
                return;
            }
            const script = document.createElement('script');
            script.id = id;
            script.src = src;
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`脚本加载失败: ${src}`));
            document.head.appendChild(script);
        });
    }

    function getFirebaseConfig() {
        return window.firebaseConfig || window._firebaseConfig || null;
    }

    function waitForFirebaseConfig(timeout = 20000) {
        return new Promise((resolve, reject) => {
            const existing = getFirebaseConfig();
            if (existing && existing.projectId) {
                resolve(existing);
                return;
            }

            const started = Date.now();
            const timer = window.setInterval(() => {
                const config = getFirebaseConfig();
                if (config && config.projectId) {
                    window.clearInterval(timer);
                    resolve(config);
                    return;
                }
                if (Date.now() - started > timeout) {
                    window.clearInterval(timer);
                    reject(new Error('Firebase配置加载超时'));
                }
            }, 200);
        });
    }

    async function waitForAppCheck() {
        if (window.__quarkAppCheckReady && typeof window.__quarkAppCheckReady.then === 'function') {
            try {
                await window.__quarkAppCheckReady;
            } catch {
                // ignore
            }
        }
    }

    function sleep(ms) {
        return new Promise((resolve) => {
            window.setTimeout(resolve, ms);
        });
    }

    function getDeviceId() {
        let id = localStorage.getItem(DEVICE_ID_KEY);
        if (id) return id;
        id = `u_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
        localStorage.setItem(DEVICE_ID_KEY, id);
        return id;
    }


    function escapeHtml(text) {
        return String(text ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatTime(ts) {
        const shared = window.CommentRenderShared;
        if (shared && typeof shared.formatTime === 'function') {
            return shared.formatTime(ts);
        }
        if (!ts) return '刚刚';
        const d = new Date(Number(ts));
        if (Number.isNaN(d.getTime())) return '刚刚';
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        return `${y}-${m}-${day} ${hh}:${mm}`;
    }

    function renderCommentText(text) {
        const shared = window.CommentRenderShared;
        if (shared && typeof shared.renderMarkdown === 'function') {
            return shared.renderMarkdown(text, false);
        }
        return escapeHtml(text || '').replace(/\n/g, '<br>');
    }

    function getLoginProfile() {
        const profile = window.QuarkUserProfile && typeof window.QuarkUserProfile.getProfile === 'function'
            ? window.QuarkUserProfile.getProfile()
            : null;
        let login = profile && profile.login ? profile.login : '';
        let loginType = profile && profile.loginType ? profile.loginType : '';
        if (!login) {
            const raw = localStorage.getItem('github_user');
            if (raw) {
                try {
                    const data = JSON.parse(raw);
                    login = data.login || '';
                    loginType = login ? 'github' : '';
                } catch {
                    login = '';
                }
            }
        }
        if (!login) {
            const raw = localStorage.getItem('qb_user');
            if (raw) {
                try {
                    const data = JSON.parse(raw);
                    login = data.login || data.username || '';
                    loginType = login ? 'local' : '';
                } catch {
                    login = '';
                }
            }
        }
        return {
            nickname: (profile && profile.nickname) ? profile.nickname : '',
            login,
            loginType,
            avatarUrl: profile && profile.avatarUrl ? profile.avatarUrl : '',
            avatarColor: profile && profile.avatarColor ? profile.avatarColor : '',
            avatarType: profile && profile.avatarType ? profile.avatarType : 'color'
        };
    }

    function renderDisplayName(nickname, login, loginType, uid) {
        const shared = window.CommentShared;
        if (shared && typeof shared.renderDisplayName === 'function') {
            return shared.renderDisplayName(nickname || '', login || '', loginType || '', uid || '');
        }
        const base = nickname || login || '访客';
        if (login) {
            const icon = loginType === 'local'
                ? `<span class="login-icon"><img src="/assets/img/logo_blue.png" alt="qb"></span>`
                : `<i class="fab fa-github login-icon"></i>`;
            return `${escapeHtml(base)}<span class="login-badge">${icon}@${escapeHtml(login)}</span>`;
        }
        if (uid) {
            const suffix = String(uid).slice(-4);
            return `${escapeHtml(base)}<span class="login-badge guest-badge">@访客${escapeHtml(suffix)}</span>`;
        }
        return escapeHtml(base);
    }

    function getLikeCount(likesBy) {
        if (!likesBy || typeof likesBy !== 'object') return 0;
        return Object.keys(likesBy).length;
    }

    function getCommentCount(comments) {
        if (!comments || typeof comments !== 'object') return 0;
        return Object.keys(comments).length;
    }

    function getCommentsSorted(comments) {
        if (!comments || typeof comments !== 'object') return [];
        return Object.keys(comments)
            .map((id) => ({ id, ...comments[id] }))
            .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    }

    function parseStatsMap(raw) {
        const map = {};
        const data = raw && typeof raw === 'object' ? raw : {};
        Object.keys(data).forEach((id) => {
            const item = data[id] || {};
            map[id] = {
                likes: getLikeCount(item.likesBy),
                comments: getCommentCount(item.comments)
            };
        });
        return map;
    }

    /**
     * @returns {Promise<any>}
     */
    async function getRootRef() {
        if (rootRef) return rootRef;
        if (bootPromise) {
            await bootPromise;
            return rootRef;
        }

        bootPromise = (async () => {
            if (typeof window.firebase === 'undefined' || !window.firebase.database) {
                await loadScript('https://www.gstatic.com/firebasejs/8.10.0/firebase-app.js', 'dynamic-firebase-app');
                await loadScript('https://www.gstatic.com/firebasejs/8.10.0/firebase-database.js', 'dynamic-firebase-db');
            }

            let config = getFirebaseConfig();
            if (!config || !config.projectId) {
                let lastError = null;
                const maxAttempts = 3;
                for (let i = 1; i <= maxAttempts; i++) {
                    try {
                        await loadScript(
                            `__API_BASE__/api/firebase-config?v=${Date.now()}_${i}`,
                            `dynamic-firebase-config-${i}`
                        );
                    } catch (error) {
                        lastError = error;
                    }

                    try {
                        config = await waitForFirebaseConfig(12000);
                        break;
                    } catch {
                        // continue retry
                    }
                    await sleep(900 * i);
                }

                if (!config || !config.projectId) {
                    try {
                        config = await waitForFirebaseConfig(45000);
                    } catch {
                        if (lastError) throw lastError;
                        throw new Error('Firebase配置加载失败');
                    }
                }
            }

            if (!window.firebase.apps || !window.firebase.apps.length) {
                window.firebase.initializeApp(config);
            }
            await waitForAppCheck();
            rootRef = window.firebase.database().ref(DB_ROOT);
        })();

        await bootPromise;
        return rootRef;
    }

    function bindCardNavigate() {
        document.querySelectorAll('[data-dynamic-id][data-dynamic-link]').forEach((card) => {
            if (!(card instanceof HTMLElement) || card.dataset.linkBound === '1') return;
            card.dataset.linkBound = '1';
            card.style.cursor = 'pointer';
            card.addEventListener('click', (event) => {
                const target = event.target;
                if (target instanceof Element && target.closest('a,button,input,textarea,select,label')) return;
                const link = card.dataset.dynamicLink;
                if (link) window.location.href = link;
            });
        });
    }

    function refreshCardStats() {
        bindCardNavigate();
        document.querySelectorAll('[data-dynamic-id]').forEach((card) => {
            if (!(card instanceof HTMLElement)) return;
            const id = card.dataset.dynamicId || '';
            const stats = latestStatsMap[id] || { likes: 0, comments: 0 };
            const likeEl = card.querySelector('[data-dynamic-like-count]');
            const commentEl = card.querySelector('[data-dynamic-comment-count]');
            if (likeEl) likeEl.textContent = String(stats.likes);
            if (commentEl) commentEl.textContent = String(stats.comments);
        });
    }

    function collectDynamicIds() {
        const ids = new Set();
        document.querySelectorAll('[data-dynamic-id]').forEach((card) => {
            if (!(card instanceof HTMLElement)) return;
            const id = card.dataset.dynamicId || '';
            if (id) ids.add(id);
        });
        return ids;
    }

    function syncCardListeners() {
        const ids = collectDynamicIds();
        if (!ids.size) return;

        void getRootRef().then((dbRef) => {
            ids.forEach((id) => {
                if (cardListenerCleanupMap.has(id)) return;
                const ref = dbRef.child(id);
                const onValue = (snapshot) => {
                    const item = snapshot.val() || {};
                    latestStatsMap[id] = {
                        likes: getLikeCount(item.likesBy),
                        comments: getCommentCount(item.comments)
                    };
                    refreshCardStats();
                };
                ref.on('value', onValue);
                cardListenerCleanupMap.set(id, () => ref.off('value', onValue));
            });

            Array.from(cardListenerCleanupMap.keys()).forEach((id) => {
                if (ids.has(id)) return;
                const cleanup = cardListenerCleanupMap.get(id);
                if (cleanup) cleanup();
                cardListenerCleanupMap.delete(id);
                delete latestStatsMap[id];
            });
        }).catch((error) => {
            console.error('动态计数监听失败:', error);
        });
    }

    function bindListAndHomeCounts() {
        if (document.querySelector('[data-dynamic-comments-panel]')) {
            return;
        }

        refreshCardStats();
        if (document.querySelector('[data-dynamic-id]')) {
            syncCardListeners();
        }

        const observedContainers = [
            document.getElementById('dynamic-entries'),
            document.getElementById('dynamic-content')
        ].filter((el) => el instanceof HTMLElement);

        if (!observedContainers.length) return;

        let rafId = 0;
        const observer = new MutationObserver(() => {
            if (rafId) return;
            rafId = window.requestAnimationFrame(() => {
                rafId = 0;
                if (!document.querySelector('[data-dynamic-id]')) return;
                refreshCardStats();
                syncCardListeners();
            });
        });
        observedContainers.forEach((container) => {
            observer.observe(container, { childList: true, subtree: true });
        });

        window.setTimeout(() => observer.disconnect(), 30000);
    }

    function bindDetailInteractions() {
        const panel = document.querySelector('[data-dynamic-comments-panel]');
        if (!(panel instanceof HTMLElement)) return;

        const host = document.querySelector('[data-dynamic-id]');
        if (!(host instanceof HTMLElement)) return;
        const dynamicId = host.dataset.dynamicId || '';
        if (!dynamicId) return;

        const likeBtn = host.querySelector('[data-dynamic-like-btn]');
        const likeCountEl = host.querySelector('[data-dynamic-like-count]');
        const commentCountEl = host.querySelector('[data-dynamic-comment-count]');
        const nicknameInput = panel.querySelector('[data-dynamic-comment-nickname]');
        const textInput = panel.querySelector('[data-dynamic-comment-text]');
        const submitBtn = panel.querySelector('[data-dynamic-comment-submit]');
        const listEl = panel.querySelector('[data-dynamic-comment-list]');
        const replyStateEl = panel.querySelector('[data-dynamic-reply-state]');
        const paginationEl = panel.querySelector('[data-dynamic-comment-pagination]');
        const uid = getDeviceId();
        const COMMENT_PAGE_SIZE = 8;
        const COMMENT_COOLDOWN_MS = 10000;
        const ACTION_COOLDOWN_MS = 700;
        let currentPage = 1;
        let replyToCommentId = '';
        let replyToNickname = '';
        let latestComments = [];
        let postRef = null;

        const loginProfile = getLoginProfile();
        const isLoggedUser = Boolean(loginProfile.login) && Boolean(localStorage.getItem('github_code') || localStorage.getItem('github_user') || localStorage.getItem('qb_user'));
        if (nicknameInput instanceof HTMLInputElement) {
            const preferred = loginProfile.nickname || loginProfile.login || (localStorage.getItem(NICKNAME_KEY) || '');
            nicknameInput.value = preferred;
            if (preferred) localStorage.setItem(NICKNAME_KEY, preferred);
            if (isLoggedUser) {
                nicknameInput.setAttribute('disabled', 'true');
                nicknameInput.placeholder = '已登录';
            }
        }

        const setCommentsLoading = (message, isError = false) => {
            if (listEl instanceof HTMLElement) {
                listEl.innerHTML = `<div class="dynamic-comment-empty">${escapeHtml(message)}</div>`;
            }
            if (paginationEl instanceof HTMLElement) {
                paginationEl.innerHTML = '';
            }
            if (submitBtn instanceof HTMLButtonElement) {
                submitBtn.disabled = true;
                submitBtn.textContent = isError ? '评论不可用' : '连接中...';
            }
        };

        const setCommentsReady = () => {
            if (submitBtn instanceof HTMLButtonElement) {
                submitBtn.disabled = false;
                submitBtn.textContent = '发布评论';
            }
        };

        setCommentsLoading('评论服务连接中，请稍候...');

        function cooldownKey(suffix) {
            return `dynamic_${suffix}_${dynamicId}_${uid}`;
        }

        function passCooldown(key, ms) {
            const now = Date.now();
            const last = Number(localStorage.getItem(key) || 0);
            if (now - last < ms) {
                return false;
            }
            localStorage.setItem(key, String(now));
            return true;
        }

        function setReplyState() {
            if (!(replyStateEl instanceof HTMLElement)) return;
            if (!replyToCommentId) {
                replyStateEl.innerHTML = '';
                return;
            }
            replyStateEl.innerHTML = `回复 <strong>${escapeHtml(replyToNickname || '该评论')}</strong>`;
            const cancel = document.createElement('button');
            cancel.type = 'button';
            cancel.textContent = '取消';
            cancel.addEventListener('click', () => {
                replyToCommentId = '';
                replyToNickname = '';
                setReplyState();
            });
            replyStateEl.appendChild(cancel);
        }

        function getReplyLikeCount(reply) {
            return getLikeCount(reply.likesBy);
        }

        function getRepliesSorted(replies) {
            if (!replies || typeof replies !== 'object') return [];
            return Object.keys(replies)
                .map((id) => ({ id, ...replies[id] }))
                .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        }

        function renderPagination(total) {
            if (!(paginationEl instanceof HTMLElement)) return;
            const totalPages = Math.max(1, Math.ceil(total / COMMENT_PAGE_SIZE));
            currentPage = Math.min(Math.max(1, currentPage), totalPages);
            if (totalPages <= 1) {
                paginationEl.innerHTML = '';
                return;
            }
            paginationEl.innerHTML = `
                <button class="dynamic-page-btn" data-page-action="prev" ${currentPage === 1 ? 'disabled' : ''}>上一页</button>
                <span class="dynamic-page-info">第 ${currentPage} / ${totalPages} 页</span>
                <button class="dynamic-page-btn" data-page-action="next" ${currentPage === totalPages ? 'disabled' : ''}>下一页</button>
            `;
        }

        function renderCommentList(comments) {
            if (!(listEl instanceof HTMLElement)) return;
            latestComments = comments;
            renderPagination(comments.length);

            if (!comments.length) {
                listEl.innerHTML = '<div class="dynamic-comment-empty">还没有评论，欢迎第一条留言。</div>';
                return;
            }

            const totalPages = Math.max(1, Math.ceil(comments.length / COMMENT_PAGE_SIZE));
            currentPage = Math.min(Math.max(1, currentPage), totalPages);
            const start = (currentPage - 1) * COMMENT_PAGE_SIZE;
            const pageItems = comments.slice(start, start + COMMENT_PAGE_SIZE);

            listEl.innerHTML = pageItems.map((comment) => {
                const commentLikeCount = getLikeCount(comment.likesBy);
                const commentLiked = !!(comment.likesBy && comment.likesBy[uid]);
                const replies = getRepliesSorted(comment.replies);
                return `
                    <div class="dynamic-comment-item" data-comment-id="${escapeHtml(comment.id)}">
                        <div class="dynamic-comment-head">
                            <strong>${renderDisplayName(comment.nickname, comment.login, comment.loginType, comment.uid)}</strong>
                            <span>${escapeHtml(formatTime(comment.timestamp))}</span>
                        </div>
                        <div class="dynamic-comment-text">${renderCommentText(comment.text || '')}</div>
                        <div class="dynamic-comment-actions">
                            <button type="button" class="dynamic-comment-btn" data-action="reply">回复</button>
                            <button type="button" class="dynamic-comment-btn" data-action="like-comment">
                                ${commentLiked ? '取消赞' : '点赞'} (${commentLikeCount})
                            </button>
                        </div>
                        ${replies.length ? `
                            <div class="dynamic-reply-list">
                                ${replies.map((reply) => {
                                    const replyLikeCount = getReplyLikeCount(reply);
                                    const replyLiked = !!(reply.likesBy && reply.likesBy[uid]);
                                    return `
                                        <div class="dynamic-reply-item" data-reply-id="${escapeHtml(reply.id)}">
                                            <div class="dynamic-comment-head">
                                                <strong>${renderDisplayName(reply.nickname, reply.login, reply.loginType, reply.uid)}</strong>
                                                <span>${escapeHtml(formatTime(reply.timestamp))}</span>
                                            </div>
                                            <div class="dynamic-comment-text">${renderCommentText(reply.text || '')}</div>
                                            <div class="dynamic-comment-actions">
                                                <button type="button" class="dynamic-comment-btn" data-action="like-reply">
                                                    ${replyLiked ? '取消赞' : '点赞'} (${replyLikeCount})
                                                </button>
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        ` : ''}
                    </div>
                `;
            }).join('');
        }

        void getRootRef().then((dbRef) => {
            postRef = dbRef.child(dynamicId);
            setCommentsReady();
            postRef.on('value', (snapshot) => {
                const data = snapshot.val() || {};
                const likesBy = data.likesBy || {};
                const comments = getCommentsSorted(data.comments).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                const liked = !!likesBy[uid];
                const likeCount = getLikeCount(likesBy);

                if (likeCountEl) likeCountEl.textContent = String(likeCount);
                if (commentCountEl) commentCountEl.textContent = String(comments.length);

                if (likeBtn instanceof HTMLElement) {
                    likeBtn.textContent = `${liked ? '取消点赞' : '点赞'} (${likeCount})`;
                }

                renderCommentList(comments);
            });

            if (likeBtn instanceof HTMLElement) {
                likeBtn.addEventListener('click', async () => {
                    if (!passCooldown(cooldownKey('post_like_cd'), ACTION_COOLDOWN_MS)) return;
                    await postRef.child('likesBy').transaction((likesBy) => {
                        const next = likesBy || {};
                        if (next[uid]) {
                            delete next[uid];
                        } else {
                            next[uid] = true;
                        }
                        return next;
                    });
                });
            }

            if (submitBtn instanceof HTMLElement && textInput instanceof HTMLTextAreaElement) {
                submitBtn.addEventListener('click', async () => {
                    if (!passCooldown(cooldownKey('comment_cd'), COMMENT_COOLDOWN_MS)) {
                        alert('评论过于频繁，请稍后再试');
                        return;
                    }
                    const text = textInput.value.trim();
                    if (!text) {
                        alert('评论内容不能为空');
                        return;
                    }
                    const nickname = isLoggedUser
                        ? (loginProfile.nickname || loginProfile.login || '访客')
                        : (nicknameInput instanceof HTMLInputElement ? (nicknameInput.value.trim() || '访客') : '访客');
                    if (!isLoggedUser) localStorage.setItem(NICKNAME_KEY, nickname);
                    const shared = window.CommentShared;
                    const guestUid = isLoggedUser
                        ? (window.QuarkUserProfile && typeof window.QuarkUserProfile.getUid === 'function'
                            ? window.QuarkUserProfile.getUid()
                            : '')
                        : (shared && typeof shared.getGuestUid === 'function' ? shared.getGuestUid() : '');
                    const payload = {
                        nickname,
                        login: isLoggedUser ? (loginProfile.login || '') : '',
                        loginType: isLoggedUser ? (loginProfile.loginType || '') : '',
                        uid: isLoggedUser ? (window.QuarkUserProfile && typeof window.QuarkUserProfile.getUid === 'function'
                            ? window.QuarkUserProfile.getUid()
                            : '') : guestUid,
                        text,
                        timestamp: Date.now(),
                        likesBy: {}
                    };
                    if (replyToCommentId) {
                        await postRef.child('comments').child(replyToCommentId).child('replies').push(payload);
                        replyToCommentId = '';
                        replyToNickname = '';
                        setReplyState();
                    } else {
                        await postRef.child('comments').push(payload);
                    }
                    textInput.value = '';
                });
            }

            if (listEl instanceof HTMLElement) {
                listEl.addEventListener('click', async (event) => {
                    const target = event.target;
                    if (!(target instanceof HTMLElement)) return;
                    const btn = target.closest('[data-action]');
                    if (!(btn instanceof HTMLElement) || !(postRef)) return;
                    const action = btn.dataset.action || '';
                    const commentEl = btn.closest('[data-comment-id]');
                    if (!(commentEl instanceof HTMLElement)) return;
                    const commentId = commentEl.dataset.commentId || '';
                    if (!commentId) return;

                    if (action === 'reply') {
                        const comment = latestComments.find((item) => item.id === commentId);
                        replyToCommentId = commentId;
                        replyToNickname = comment?.nickname || '该评论';
                        setReplyState();
                        if (textInput instanceof HTMLTextAreaElement) {
                            textInput.focus();
                        }
                        return;
                    }

                    if (!passCooldown(cooldownKey('comment_like_cd'), ACTION_COOLDOWN_MS)) return;

                    if (action === 'like-comment') {
                        await postRef.child('comments').child(commentId).child('likesBy').transaction((likesBy) => {
                            const next = likesBy || {};
                            if (next[uid]) {
                                delete next[uid];
                            } else {
                                next[uid] = true;
                            }
                            return next;
                        });
                        return;
                    }

                    if (action === 'like-reply') {
                        const replyEl = btn.closest('[data-reply-id]');
                        if (!(replyEl instanceof HTMLElement)) return;
                        const replyId = replyEl.dataset.replyId || '';
                        if (!replyId) return;
                        await postRef
                            .child('comments')
                            .child(commentId)
                            .child('replies')
                            .child(replyId)
                            .child('likesBy')
                            .transaction((likesBy) => {
                                const next = likesBy || {};
                                if (next[uid]) {
                                    delete next[uid];
                                } else {
                                    next[uid] = true;
                                }
                                return next;
                            });
                    }
                });
            }

            if (paginationEl instanceof HTMLElement) {
                paginationEl.addEventListener('click', (event) => {
                    const target = event.target;
                    if (!(target instanceof HTMLElement)) return;
                    const btn = target.closest('[data-page-action]');
                    if (!(btn instanceof HTMLElement)) return;
                    const action = btn.dataset.pageAction || '';
                    const totalPages = Math.max(1, Math.ceil(latestComments.length / COMMENT_PAGE_SIZE));
                    if (action === 'prev') {
                        currentPage = Math.max(1, currentPage - 1);
                    } else if (action === 'next') {
                        currentPage = Math.min(totalPages, currentPage + 1);
                    }
                    renderCommentList(latestComments);
                });
            }
        }).catch((error) => {
            console.error('动态详情交互初始化失败:', error);
            setCommentsLoading('评论服务连接失败，请稍后刷新重试。', true);
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        bindListAndHomeCounts();
        bindDetailInteractions();
    });
})();
