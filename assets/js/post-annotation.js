// @ts-check

(function () {
    'use strict';

    /**
     * @typedef {{ uid: string, nickname: string, avatarType: 'color' | 'image', avatarColor: string, avatarUrl: string }} AnnotationProfile
     * @typedef {{ id: string, text?: string, timestamp?: number, nickname?: string, avatarType?: 'color' | 'image', avatarColor?: string, avatarUrl?: string, likesBy?: Record<string, boolean> }} AnnotationComment
     * @typedef {{ exactText?: string, prefix?: string, suffix?: string, startHint?: number, createdAt?: number, likesBy?: Record<string, boolean>, comments?: Record<string, AnnotationComment>, [key: string]: unknown }} AnnotationHighlight
     */

    const STORAGE_KEYS = {
        uid: 'postAnnoUid',
        nickname: 'nickname',
        avatarType: 'postAnnoAvatarType',
        avatarColor: 'postAnnoAvatarColor',
        avatarUrl: 'postAnnoAvatarUrl'
    };

    const BLOCK_SELECTOR = 'p,li,blockquote,pre,h1,h2,h3,h4,h5,h6,td,th';
    const COLOR_OPTIONS = ['#2563eb', '#dc2626', '#16a34a', '#ca8a04', '#7c3aed'];

    /** @type {{
     * initialized: boolean,
     * contentEl: HTMLElement | null,
     * dbRef: any,
     * safePostKey: string,
     * highlights: Record<string, AnnotationHighlight>,
     * pendingRange: Range | null,
     * pendingText: string,
     * activeHighlightId: string,
     * profile: AnnotationProfile | null
     * }} */
    const state = {
        initialized: false,
        contentEl: null,
        dbRef: null,
        safePostKey: '',
        highlights: {},
        pendingRange: null,
        pendingText: '',
        activeHighlightId: '',
        profile: null
    };

    /** @type {any} */
    const ui = {};

    /** @param {unknown} text */
    function escapeHtml(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function getOrCreateUid() {
        let uid = localStorage.getItem(STORAGE_KEYS.uid);
        if (!uid) {
            uid = `u_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
            localStorage.setItem(STORAGE_KEYS.uid, uid);
        }
        return uid;
    }

    /** @returns {AnnotationProfile} */
    function loadProfile() {
        const externalProfile = window.QuarkUserProfile && typeof window.QuarkUserProfile.getProfile === 'function'
            ? window.QuarkUserProfile.getProfile()
            : null;
        const nickname = ((externalProfile && externalProfile.nickname) || localStorage.getItem(STORAGE_KEYS.nickname) || '').trim();
        const rawAvatarType = (externalProfile && externalProfile.avatarType) || localStorage.getItem(STORAGE_KEYS.avatarType) || 'color';
        /** @type {'color' | 'image'} */
        const avatarType = rawAvatarType === 'image' ? 'image' : 'color';
        const avatarColor = (externalProfile && externalProfile.avatarColor) || localStorage.getItem(STORAGE_KEYS.avatarColor) || COLOR_OPTIONS[0];
        const avatarUrl = ((externalProfile && externalProfile.avatarUrl) || localStorage.getItem(STORAGE_KEYS.avatarUrl) || '').trim();
        return {
            uid: getOrCreateUid(),
            nickname: nickname || '访客',
            avatarType,
            avatarColor,
            avatarUrl
        };
    }

    /** @param {AnnotationProfile} profile */
    function saveProfile(profile) {
        localStorage.setItem(STORAGE_KEYS.nickname, profile.nickname);
        localStorage.setItem(STORAGE_KEYS.avatarType, profile.avatarType);
        localStorage.setItem(STORAGE_KEYS.avatarColor, profile.avatarColor);
        localStorage.setItem(STORAGE_KEYS.avatarUrl, profile.avatarUrl);
        if (window.QuarkUserProfile && typeof window.QuarkUserProfile.syncProfile === 'function') {
            window.QuarkUserProfile.syncProfile(profile);
        }
    }

    /** @param {string} input */
    function toSafeKey(input) {
        try {
            const utf8 = encodeURIComponent(input).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16)));
            return btoa(utf8).replace(/[+/=]/g, '_');
        } catch (e) {
            return input.replace(/[.#$/\[\]]/g, '_');
        }
    }

    /**
     * @param {string} src
     * @param {string} id
     * @returns {Promise<void>}
     */
    function loadScript(src, id) {
        return new Promise((resolve, reject) => {
            if (id) {
                const exists = document.getElementById(id);
                if (exists) {
                    if (exists.dataset.loaded === 'true') {
                        resolve();
                        return;
                    }
                    exists.addEventListener('load', () => resolve(), { once: true });
                    exists.addEventListener('error', () => reject(new Error(`load failed: ${src}`)), { once: true });
                    return;
                }
            }

            const script = document.createElement('script');
            if (id) {
                script.id = id;
            }
            script.src = src;
            script.async = true;
            script.onload = () => {
                script.dataset.loaded = 'true';
                resolve();
            };
            script.onerror = () => reject(new Error(`load failed: ${src}`));
            document.head.appendChild(script);
        });
    }

    /**
     * @param {() => boolean} checkFn
     * @param {number} timeoutMs
     * @returns {Promise<void>}
     */
    function waitFor(checkFn, timeoutMs) {
        return new Promise((resolve, reject) => {
            const started = Date.now();
            const timer = setInterval(() => {
                if (checkFn()) {
                    clearInterval(timer);
                    resolve();
                    return;
                }
                if (Date.now() - started > timeoutMs) {
                    clearInterval(timer);
                    reject(new Error('timeout'));
                }
            }, 80);
        });
    }

    async function ensureFirebaseReady() {
        if (typeof window.firebase === 'undefined' || !window.firebase.database) {
            await loadScript('https://www.gstatic.com/firebasejs/8.10.0/firebase-app.js', 'firebase-app-sdk');
            await loadScript('https://www.gstatic.com/firebasejs/8.10.0/firebase-database.js', 'firebase-db-sdk');
        }
        if (typeof window.firebaseConfig === 'undefined') {
            await loadScript(`__API_BASE__/api/firebase-config?v=${Date.now()}`, 'post-anno-firebase-config');
            await waitFor(() => typeof window.firebaseConfig !== 'undefined', 15000);
        }
        if (!window.firebase.apps || !window.firebase.apps.length) {
            window.firebase.initializeApp(window.firebaseConfig);
        }
    }

    function unwrapElement(el) {
        const parent = el.parentNode;
        if (!parent) {
            return;
        }
        while (el.firstChild) {
            parent.insertBefore(el.firstChild, el);
        }
        parent.removeChild(el);
        parent.normalize();
    }

    function clearRenderedHighlights() {
        if (!state.contentEl) return;
        state.contentEl.querySelectorAll('.post-annotation-highlight').forEach(unwrapElement);
    }

    function buildIndices(fullText, exact) {
        const out = [];
        if (!exact) {
            return out;
        }
        let idx = fullText.indexOf(exact);
        while (idx !== -1) {
            out.push(idx);
            idx = fullText.indexOf(exact, idx + 1);
        }
        return out;
    }

    function chooseBestIndex(fullText, item) {
        const exact = item.exactText || '';
        if (!exact) {
            return -1;
        }
        const indices = buildIndices(fullText, exact);
        if (!indices.length) {
            return -1;
        }

        let best = indices[0];
        let bestScore = -Infinity;
        const prefix = item.prefix || '';
        const suffix = item.suffix || '';
        const hint = typeof item.startHint === 'number' ? item.startHint : null;

        indices.forEach((idx) => {
            let score = 0;
            if (prefix) {
                const actualPrefix = fullText.slice(Math.max(0, idx - prefix.length), idx);
                if (actualPrefix === prefix) {
                    score += 4;
                }
            }
            if (suffix) {
                const actualSuffix = fullText.slice(idx + exact.length, idx + exact.length + suffix.length);
                if (actualSuffix === suffix) {
                    score += 4;
                }
            }
            if (hint !== null) {
                score += Math.max(0, 2 - Math.abs(idx - hint) / 800);
            }
            if (score > bestScore) {
                bestScore = score;
                best = idx;
            }
        });
        return best;
    }

    function createRangeFromOffsets(root, start, end) {
        if (start < 0 || end <= start) {
            return null;
        }

        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                if (!node.nodeValue || !node.nodeValue.length) {
                    return NodeFilter.FILTER_REJECT;
                }
                if (node.parentElement && node.parentElement.closest('.post-annotation-highlight')) {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        });

        let pos = 0;
        let startNode = null;
        let endNode = null;
        let startOffset = 0;
        let endOffset = 0;
        let lastNode = null;

        while (walker.nextNode()) {
            const node = walker.currentNode;
            const len = node.nodeValue.length;
            const nextPos = pos + len;
            lastNode = node;

            if (!startNode && start >= pos && start <= nextPos) {
                startNode = node;
                startOffset = Math.max(0, Math.min(len, start - pos));
            }
            if (!endNode && end >= pos && end <= nextPos) {
                endNode = node;
                endOffset = Math.max(0, Math.min(len, end - pos));
            }
            pos = nextPos;
            if (startNode && endNode) {
                break;
            }
        }

        if (!startNode || !endNode) {
            if (lastNode && !endNode && end === pos) {
                endNode = lastNode;
                endOffset = lastNode.nodeValue.length;
            } else {
                return null;
            }
        }

        const range = document.createRange();
        range.setStart(startNode, startOffset);
        range.setEnd(endNode, endOffset);
        if (range.collapsed) {
            return null;
        }
        return range;
    }

    function wrapRange(range, highlightId) {
        const span = document.createElement('span');
        span.className = 'post-annotation-highlight';
        span.dataset.highlightId = highlightId;

        try {
            range.surroundContents(span);
        } catch (e) {
            const fragment = range.extractContents();
            span.appendChild(fragment);
            range.insertNode(span);
        }
        return span;
    }

    function getLikeCount(likesBy) {
        if (!likesBy || typeof likesBy !== 'object') {
            return 0;
        }
        return Object.keys(likesBy).length;
    }

    function getCommentCount(comments) {
        if (!comments || typeof comments !== 'object') {
            return 0;
        }
        return Object.keys(comments).length;
    }

    function getSortedComments(item) {
        if (!item.comments || typeof item.comments !== 'object') {
            return [];
        }
        return Object.keys(item.comments)
            .map((id) => ({ id, ...item.comments[id] }))
            .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    }

    function getDisplayAvatar(user) {
        if (user.avatarType === 'image' && user.avatarUrl) {
            return `<span class="post-annotation-avatar-preview" style="background-image:url('${escapeHtml(user.avatarUrl)}');background-color:#e2e8f0;"></span>`;
        }
        const letter = escapeHtml((user.nickname || '访').slice(0, 1).toUpperCase());
        return `<span class="post-annotation-avatar-preview" style="background:${escapeHtml(user.avatarColor || COLOR_OPTIONS[0])};">${letter}</span>`;
    }

    function updateProfilePreview() {
        const nickname = ui.nicknameInput.value.trim() || '访客';
        const avatarType = ui.avatarTypeSelect.value;
        const avatarColor = ui.colorPicker.querySelector('.post-annotation-color.active')?.dataset.color || COLOR_OPTIONS[0];
        const avatarUrl = ui.avatarUrlInput.value.trim();

        if (avatarType === 'image' && avatarUrl) {
            ui.avatarPreview.style.backgroundImage = `url('${avatarUrl}')`;
            ui.avatarPreview.style.backgroundColor = '#e2e8f0';
            ui.avatarPreview.textContent = '';
        } else {
            ui.avatarPreview.style.backgroundImage = 'none';
            ui.avatarPreview.style.backgroundColor = avatarColor;
            ui.avatarPreview.textContent = nickname.slice(0, 1).toUpperCase();
        }
    }

    function collectProfileFromUI() {
        if (!state.profile) {
            state.profile = loadProfile();
        }
        const nickname = (ui.nicknameInput.value.trim() || '访客').slice(0, 24);
        /** @type {'color' | 'image'} */
        const avatarType = ui.avatarTypeSelect.value === 'image' ? 'image' : 'color';
        const avatarColor = ui.colorPicker.querySelector('.post-annotation-color.active')?.dataset.color || COLOR_OPTIONS[0];
        const avatarUrl = ui.avatarUrlInput.value.trim().slice(0, 500);

        /** @type {AnnotationProfile} */
        const profile = {
            uid: state.profile.uid,
            nickname,
            avatarType,
            avatarColor,
            avatarUrl
        };
        state.profile = profile;
        saveProfile(profile);
        return profile;
    }

    function formatTime(timestamp) {
        if (!timestamp) {
            return '';
        }
        const date = new Date(timestamp);
        return date.toLocaleString();
    }

    function buildTooltipText(item) {
        const likes = getLikeCount(item.likesBy);
        const comments = getSortedComments(item);
        let text = `点赞 ${likes} · 评论 ${comments.length}`;
        if (comments.length) {
            const recent = comments.slice(-2).map((c) => `${c.nickname || '访客'}: ${(c.text || '').slice(0, 30)}`);
            text += `\n${recent.join('\n')}`;
        }
        return text;
    }

    function showTooltip(item, x, y) {
        ui.tooltip.textContent = buildTooltipText(item);
        ui.tooltip.style.display = 'block';
        const rect = ui.tooltip.getBoundingClientRect();
        const left = Math.min(window.innerWidth - rect.width - 8, Math.max(8, x + 12));
        const top = Math.max(8, y - rect.height - 12);
        ui.tooltip.style.left = `${left}px`;
        ui.tooltip.style.top = `${top}px`;
    }

    function hideTooltip() {
        ui.tooltip.style.display = 'none';
    }

    function renderHighlights() {
        if (!state.contentEl) {
            return;
        }

        clearRenderedHighlights();
        const fullText = state.contentEl.textContent || '';
        const positioned = Object.keys(state.highlights).map((id) => {
            const item = { id, ...state.highlights[id] };
            return {
                item,
                idx: chooseBestIndex(fullText, item)
            };
        }).filter((x) => x.idx >= 0);

        // 从后往前渲染，避免先渲染前文导致后文偏移
        positioned.sort((a, b) => b.idx - a.idx);

        positioned.forEach(({ item, idx }) => {
            const range = createRangeFromOffsets(state.contentEl, idx, idx + item.exactText.length);
            if (!range) {
                return;
            }
            const span = wrapRange(range, item.id);
            span.addEventListener('mouseenter', (evt) => showTooltip(item, evt.clientX, evt.clientY));
            span.addEventListener('mousemove', (evt) => showTooltip(item, evt.clientX, evt.clientY));
            span.addEventListener('mouseleave', hideTooltip);
            span.addEventListener('click', (evt) => {
                evt.preventDefault();
                evt.stopPropagation();
                openModal(item.id);
            });
        });
    }

    function getClosestBlock(node) {
        if (!node) {
            return null;
        }
        const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
        return el ? el.closest(BLOCK_SELECTOR) : null;
    }

    function isSelectionValid(range, text) {
        if (!range || !text || text.length < 2 || text.length > 400) {
            return false;
        }
        const startBlock = getClosestBlock(range.startContainer);
        const endBlock = getClosestBlock(range.endContainer);
        if (!startBlock || !endBlock || startBlock !== endBlock) {
            return false;
        }
        if (range.cloneContents().querySelector && range.cloneContents().querySelector('img,pre,code,table')) {
            return false;
        }
        return true;
    }

    function showPopover(rect) {
        const pop = ui.popover;
        pop.style.display = 'flex';
        const popRect = pop.getBoundingClientRect();
        const left = Math.max(8, Math.min(window.innerWidth - popRect.width - 8, rect.left + rect.width / 2 - popRect.width / 2));
        const top = Math.max(8, rect.top - popRect.height - 10);
        pop.style.left = `${left}px`;
        pop.style.top = `${top}px`;
    }

    function hidePopover() {
        ui.popover.style.display = 'none';
        state.pendingRange = null;
        state.pendingText = '';
    }

    function getSelectionApproxStart(range) {
        const temp = range.cloneRange();
        temp.selectNodeContents(state.contentEl);
        temp.setEnd(range.startContainer, range.startOffset);
        return temp.toString().length;
    }

    function buildAnchorFromPending() {
        if (!state.pendingRange || !state.pendingText) {
            return null;
        }
        const fullText = state.contentEl.textContent || '';
        const exactText = state.pendingText;
        const indices = buildIndices(fullText, exactText);
        if (!indices.length) {
            return null;
        }

        const approx = getSelectionApproxStart(state.pendingRange);
        let start = indices[0];
        let delta = Math.abs(indices[0] - approx);
        for (let i = 1; i < indices.length; i += 1) {
            const d = Math.abs(indices[i] - approx);
            if (d < delta) {
                delta = d;
                start = indices[i];
            }
        }

        const end = start + exactText.length;
        const prefix = fullText.slice(Math.max(0, start - 24), start);
        const suffix = fullText.slice(end, end + 24);

        return {
            exactText,
            prefix,
            suffix,
            startHint: start
        };
    }

    function findExistingHighlightByAnchor(anchor) {
        const ids = Object.keys(state.highlights);
        for (let i = 0; i < ids.length; i += 1) {
            const id = ids[i];
            const item = state.highlights[id];
            if (!item) {
                continue;
            }
            if (item.exactText !== anchor.exactText) {
                continue;
            }
            if (item.prefix === anchor.prefix && item.suffix === anchor.suffix) {
                return id;
            }
            if (typeof item.startHint === 'number' && Math.abs(item.startHint - anchor.startHint) < 3) {
                return id;
            }
        }
        return '';
    }

    async function ensureHighlightFromPending(autoLike) {
        const anchor = buildAnchorFromPending();
        if (!anchor) {
            return '';
        }

        let highlightId = findExistingHighlightByAnchor(anchor);
        if (!highlightId) {
            const profile = collectProfileFromUI();
            const newRef = state.dbRef.push();
            highlightId = newRef.key;
            await newRef.set({
                ...anchor,
                createdAt: Date.now(),
                createdBy: {
                    uid: profile.uid,
                    nickname: profile.nickname,
                    avatarType: profile.avatarType,
                    avatarColor: profile.avatarColor,
                    avatarUrl: profile.avatarUrl
                },
                likesBy: {},
                comments: {}
            });
        }

        if (autoLike) {
            await state.dbRef.child(highlightId).child('likesBy').transaction((likesBy) => {
                const next = likesBy || {};
                next[state.profile.uid] = true;
                return next;
            });
        }

        return highlightId;
    }

    async function toggleHighlightLike(highlightId) {
        await state.dbRef.child(highlightId).child('likesBy').transaction((likesBy) => {
            const next = likesBy || {};
            if (next[state.profile.uid]) {
                delete next[state.profile.uid];
            } else {
                next[state.profile.uid] = true;
            }
            return next;
        });
    }

    async function submitComment() {
        const text = ui.commentInput.value.trim();
        if (!text) {
            return;
        }
        const profile = collectProfileFromUI();
        const highlightId = state.activeHighlightId;
        if (!highlightId) {
            return;
        }
        const newRef = state.dbRef.child(highlightId).child('comments').push();
        await newRef.set({
            text: text.slice(0, 2000),
            timestamp: Date.now(),
            nickname: profile.nickname,
            avatarType: profile.avatarType,
            avatarColor: profile.avatarColor,
            avatarUrl: profile.avatarUrl,
            likesBy: {}
        });
        ui.commentInput.value = '';
    }

    async function toggleCommentLike(highlightId, commentId) {
        const ref = state.dbRef.child(highlightId).child('comments').child(commentId).child('likesBy');
        await ref.transaction((likesBy) => {
            const next = likesBy || {};
            if (next[state.profile.uid]) {
                delete next[state.profile.uid];
            } else {
                next[state.profile.uid] = true;
            }
            return next;
        });
    }

    function renderModalContent() {
        const item = state.highlights[state.activeHighlightId];
        if (!item) {
            ui.modal.style.display = 'none';
            return;
        }

        const likeCount = getLikeCount(item.likesBy);
        const commentList = getSortedComments(item);
        const userLiked = !!(item.likesBy && item.likesBy[state.profile.uid]);

        ui.modalQuote.textContent = item.exactText || '';
        ui.modalLikeBtn.textContent = `${userLiked ? '取消点赞' : '点赞'} (${likeCount})`;
        ui.modalStats.textContent = `评论 ${getCommentCount(item.comments)}`;

        if (!commentList.length) {
            ui.commentList.innerHTML = '<div class="post-annotation-empty">还没有评论，欢迎第一个发言。</div>';
            return;
        }

        ui.commentList.innerHTML = commentList.map((comment) => {
            const likes = getLikeCount(comment.likesBy);
            const liked = !!(comment.likesBy && comment.likesBy[state.profile.uid]);
            const avatar = getDisplayAvatar(comment);
            return `
                <div class="post-annotation-comment">
                    <div class="post-annotation-comment-head">
                        <div class="post-annotation-user">${avatar}<strong>${escapeHtml(comment.nickname || '访客')}</strong></div>
                        <span class="post-annotation-comment-time">${escapeHtml(formatTime(comment.timestamp))}</span>
                    </div>
                    <div class="post-annotation-comment-text">${escapeHtml(comment.text || '')}</div>
                    <div class="post-annotation-comment-actions">
                        <button data-comment-like="${escapeHtml(comment.id)}">${liked ? '取消赞' : '点赞'} (${likes})</button>
                    </div>
                </div>
            `;
        }).join('');

        ui.commentList.querySelectorAll('[data-comment-like]').forEach((btn) => {
            btn.addEventListener('click', () => {
                toggleCommentLike(state.activeHighlightId, btn.dataset.commentLike);
            });
        });
    }

    function openModal(highlightId) {
        state.activeHighlightId = highlightId;
        ui.modal.style.display = 'flex';
        renderModalContent();
    }

    function closeModal() {
        state.activeHighlightId = '';
        ui.modal.style.display = 'none';
    }

    function bindSelectionEvents() {
        document.addEventListener('mouseup', () => {
            setTimeout(() => {
                const selection = window.getSelection();
                if (!selection || !selection.rangeCount || selection.isCollapsed) {
                    hidePopover();
                    return;
                }
                const range = selection.getRangeAt(0);
                if (!state.contentEl.contains(range.commonAncestorContainer)) {
                    hidePopover();
                    return;
                }

                const startHighlight = (selection.anchorNode?.parentElement || null)?.closest('.post-annotation-highlight');
                const endHighlight = (selection.focusNode?.parentElement || null)?.closest('.post-annotation-highlight');
                if (startHighlight && endHighlight && startHighlight === endHighlight) {
                    hidePopover();
                    if (startHighlight instanceof HTMLElement && startHighlight.dataset.highlightId) {
                        openModal(startHighlight.dataset.highlightId);
                    }
                    selection.removeAllRanges();
                    return;
                }

                const text = selection.toString().trim();
                if (!isSelectionValid(range, text)) {
                    hidePopover();
                    return;
                }

                state.pendingRange = range.cloneRange();
                state.pendingText = text;
                showPopover(range.getBoundingClientRect());
            }, 0);
        });

        document.addEventListener('mousedown', (evt) => {
            if (ui.popover.contains(evt.target)) {
                return;
            }
            hidePopover();
            hideTooltip();
        });

        window.addEventListener('scroll', () => {
            hidePopover();
            hideTooltip();
        }, { passive: true });
    }

    function createColorOptions() {
        ui.colorPicker.innerHTML = '';
        COLOR_OPTIONS.forEach((color) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'post-annotation-color';
            btn.style.background = color;
            btn.dataset.color = color;
            if (state.profile.avatarColor === color) {
                btn.classList.add('active');
            }
            btn.addEventListener('click', () => {
                ui.colorPicker.querySelectorAll('.post-annotation-color').forEach((x) => x.classList.remove('active'));
                btn.classList.add('active');
                updateProfilePreview();
            });
            ui.colorPicker.appendChild(btn);
        });
    }

    function applyProfileToUI() {
        ui.nicknameInput.value = state.profile.nickname || '';
        ui.avatarTypeSelect.value = state.profile.avatarType || 'color';
        ui.avatarUrlInput.value = state.profile.avatarUrl || '';
        createColorOptions();
        const target = ui.colorPicker.querySelector(`[data-color="${state.profile.avatarColor}"]`) || ui.colorPicker.querySelector('.post-annotation-color');
        if (target) {
            ui.colorPicker.querySelectorAll('.post-annotation-color').forEach((x) => x.classList.remove('active'));
            target.classList.add('active');
        }
        updateProfilePreview();
    }

    function createUI() {
        ui.popover = document.createElement('div');
        ui.popover.className = 'post-annotation-popover';
        ui.popover.innerHTML = `
            <button type="button" data-action="like">点赞这段</button>
            <button type="button" data-action="comment">评论这段</button>
        `;
        document.body.appendChild(ui.popover);

        ui.tooltip = document.createElement('div');
        ui.tooltip.className = 'post-annotation-tooltip';
        document.body.appendChild(ui.tooltip);

        ui.modal = document.createElement('div');
        ui.modal.className = 'post-annotation-modal';
        ui.modal.innerHTML = `
            <div class="post-annotation-modal-panel">
                <div class="post-annotation-modal-head">
                    <div class="post-annotation-modal-title">段落讨论</div>
                    <button type="button" class="post-annotation-close" data-close-modal>&times;</button>
                </div>
                <div class="post-annotation-quote" data-modal-quote></div>
                <div class="post-annotation-meta">
                    <button type="button" class="post-annotation-btn" data-modal-like>点赞</button>
                    <span data-modal-stats></span>
                </div>
                <div class="post-annotation-profile">
                    <div class="post-annotation-profile-row">
                        <label>昵称</label>
                        <input type="text" data-profile-nickname maxlength="24" placeholder="输入昵称">
                        <span class="post-annotation-avatar-preview" data-avatar-preview></span>
                    </div>
                    <div class="post-annotation-profile-row">
                        <label>头像</label>
                        <select data-profile-avatar-type>
                            <option value="color">颜色</option>
                            <option value="image">图片URL</option>
                        </select>
                        <input type="text" data-profile-avatar-url placeholder="https://example.com/avatar.png">
                    </div>
                    <div class="post-annotation-profile-row" data-color-picker-row>
                        <div data-color-picker></div>
                    </div>
                </div>
                <div class="post-annotation-comments" data-comment-list></div>
                <div class="post-annotation-form">
                    <textarea data-comment-input placeholder="写下你对这一段的看法..."></textarea>
                    <div class="post-annotation-form-footer">
                        <button type="button" class="post-annotation-btn" data-send-comment>发布评论</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(ui.modal);

        ui.modalQuote = ui.modal.querySelector('[data-modal-quote]');
        ui.modalLikeBtn = ui.modal.querySelector('[data-modal-like]');
        ui.modalStats = ui.modal.querySelector('[data-modal-stats]');
        ui.commentList = ui.modal.querySelector('[data-comment-list]');
        ui.commentInput = ui.modal.querySelector('[data-comment-input]');

        ui.nicknameInput = ui.modal.querySelector('[data-profile-nickname]');
        ui.avatarTypeSelect = ui.modal.querySelector('[data-profile-avatar-type]');
        ui.avatarUrlInput = ui.modal.querySelector('[data-profile-avatar-url]');
        ui.avatarPreview = ui.modal.querySelector('[data-avatar-preview]');
        ui.colorPicker = ui.modal.querySelector('[data-color-picker]');

        ui.popover.querySelector('[data-action="like"]').addEventListener('click', async () => {
            const id = await ensureHighlightFromPending(true);
            hidePopover();
            window.getSelection().removeAllRanges();
            if (id) {
                openModal(id);
            }
        });

        ui.popover.querySelector('[data-action="comment"]').addEventListener('click', async () => {
            const id = await ensureHighlightFromPending(false);
            hidePopover();
            window.getSelection().removeAllRanges();
            if (id) {
                openModal(id);
            }
        });

        ui.modal.querySelector('[data-close-modal]').addEventListener('click', closeModal);
        ui.modal.addEventListener('click', (evt) => {
            if (evt.target === ui.modal) {
                closeModal();
            }
        });

        ui.modalLikeBtn.addEventListener('click', async () => {
            if (!state.activeHighlightId) {
                return;
            }
            collectProfileFromUI();
            await toggleHighlightLike(state.activeHighlightId);
        });

        ui.modal.querySelector('[data-send-comment]').addEventListener('click', submitComment);
        ui.nicknameInput.addEventListener('input', () => {
            state.profile.nickname = ui.nicknameInput.value.trim() || '访客';
            updateProfilePreview();
        });
        ui.avatarTypeSelect.addEventListener('change', updateProfilePreview);
        ui.avatarUrlInput.addEventListener('input', updateProfilePreview);
    }

    function subscribeHighlights() {
        state.dbRef.on('value', (snapshot) => {
            /** @type {Record<string, AnnotationHighlight>} */
            const next = {};
            snapshot.forEach((child) => {
                next[child.key] = child.val();
            });
            state.highlights = next;
            renderHighlights();
            if (state.activeHighlightId) {
                renderModalContent();
            }
        });
    }

    async function initPostAnnotations() {
        if (state.initialized || window.__postAnnotationsInitFlag) {
            return;
        }
        window.__postAnnotationsInitFlag = true;
        state.contentEl = document.getElementById('content');
        if (!state.contentEl) {
            return;
        }

        state.profile = loadProfile();
        createUI();
        applyProfileToUI();
        bindSelectionEvents();

        try {
            await ensureFirebaseReady();
        } catch (e) {
            console.error('[post-annotation] Firebase初始化失败:', e);
            return;
        }

        state.safePostKey = toSafeKey(window.location.pathname.replace(/\/$/, ''));
        state.dbRef = window.firebase.database().ref(`post_annotations/${state.safePostKey}/highlights`);
        subscribeHighlights();
        state.initialized = true;
    }

    window.initPostAnnotations = initPostAnnotations;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initPostAnnotations();
        });
    } else {
        initPostAnnotations();
    }
})();
