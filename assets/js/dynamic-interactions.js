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

            if (!getFirebaseConfig()) {
                await loadScript(`https://api.130923.xyz/api/firebase-config?v=${Date.now()}`, 'dynamic-firebase-config');
            }
            const config = await waitForFirebaseConfig();

            if (!window.firebase.apps || !window.firebase.apps.length) {
                window.firebase.initializeApp(config);
            }
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
        const uid = getDeviceId();

        if (nicknameInput instanceof HTMLInputElement) {
            nicknameInput.value = localStorage.getItem(NICKNAME_KEY) || '';
        }

        void getRootRef().then((dbRef) => {
            const postRef = dbRef.child(dynamicId);
            postRef.on('value', (snapshot) => {
                const data = snapshot.val() || {};
                const likesBy = data.likesBy || {};
                const comments = getCommentsSorted(data.comments);
                const liked = !!likesBy[uid];
                const likeCount = getLikeCount(likesBy);

                if (likeCountEl) likeCountEl.textContent = String(likeCount);
                if (commentCountEl) commentCountEl.textContent = String(comments.length);

                if (likeBtn instanceof HTMLElement) {
                    likeBtn.textContent = `${liked ? '取消点赞' : '点赞'} (${likeCount})`;
                }

                if (!(listEl instanceof HTMLElement)) return;
                if (!comments.length) {
                    listEl.innerHTML = '<div class="dynamic-comment-empty">还没有评论，欢迎第一条留言。</div>';
                    return;
                }
                listEl.innerHTML = comments.map((comment) => `
                    <div class="dynamic-comment-item">
                        <div class="dynamic-comment-head">
                            <strong>${escapeHtml(comment.nickname || '访客')}</strong>
                            <span>${escapeHtml(formatTime(comment.timestamp))}</span>
                        </div>
                        <div class="dynamic-comment-text">${escapeHtml(comment.text || '')}</div>
                    </div>
                `).join('');
            });

            if (likeBtn instanceof HTMLElement) {
                likeBtn.addEventListener('click', async () => {
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
                    const text = textInput.value.trim();
                    if (!text) {
                        alert('评论内容不能为空');
                        return;
                    }
                    const nickname = nicknameInput instanceof HTMLInputElement
                        ? (nicknameInput.value.trim() || '访客')
                        : '访客';
                    localStorage.setItem(NICKNAME_KEY, nickname);

                    await postRef.child('comments').push({
                        nickname,
                        text,
                        timestamp: Date.now()
                    });
                    textInput.value = '';
                });
            }
        }).catch((error) => {
            console.error('动态详情交互初始化失败:', error);
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        bindListAndHomeCounts();
        bindDetailInteractions();
    });
})();
