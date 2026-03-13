// @ts-check

(function () {
    if (window.__quarkAccountInited) return;
    window.__quarkAccountInited = true;
    const API_BASE = '__API_BASE__';
    const LOGIN_URL = (window.__NAV_CONFIG__ && window.__NAV_CONFIG__.login && window.__NAV_CONFIG__.login.url) || '/auth.html';
    const DB_USERS = 'qb_users';
    const DB_EMAIL_INDEX = 'qb_email_index';

    /** @type {Record<string, any>} */
    const el = {};

    function cacheElements() {
        el.nickname = document.getElementById('nicknameInput');
        el.githubLogin = document.getElementById('githubLogin');
        el.accountUid = document.getElementById('accountUid');
        el.avatarFile = document.getElementById('avatarFile');
        el.avatarUrl = document.getElementById('avatarUrl');
        el.avatarImage = document.getElementById('avatarImage');
        el.avatarFallback = document.getElementById('avatarFallback');
        el.avatarClear = document.getElementById('avatarClear');
        el.avatarFromGithub = document.getElementById('avatarFromGithub');
        el.cropperModal = document.getElementById('cropperModal');
        el.cropperCanvas = document.getElementById('cropperCanvas');
        el.cropperZoom = document.getElementById('cropperZoom');
        el.cropperApply = document.getElementById('cropperApply');
        el.cropperReset = document.getElementById('cropperReset');
        el.cropperClose = document.getElementById('cropperClose');
        el.saveBtn = document.getElementById('saveProfile');
        el.refreshBtn = document.getElementById('refreshProfile');
        el.status = document.getElementById('saveStatus');
        el.accountSpaceLink = document.getElementById('accountSpaceLink');
        el.createdAt = document.getElementById('accountCreatedAt');
        el.accountAge = document.getElementById('accountAge');
        el.lastSyncAt = document.getElementById('lastSyncAt');
        el.currentPage = document.getElementById('currentPage');
        el.accountLocation = document.getElementById('accountLocation');
        el.avatarState = document.getElementById('avatarState');
        el.loginHistoryBody = document.getElementById('loginHistoryBody');
        el.localSyncToggle = document.getElementById('localSyncToggle');
        el.bindEmail = document.getElementById('bindEmail');
        el.bindEmailCode = document.getElementById('bindEmailCode');
        el.bindEmailSend = document.getElementById('bindEmailSend');
        el.bindEmailApply = document.getElementById('bindEmailApply');
        el.bindEmailEdit = document.getElementById('bindEmailEdit');
        el.bindEmailRemove = document.getElementById('bindEmailRemove');
        el.bindEmailStatus = document.getElementById('bindEmailStatus');
        el.bindTurnstileContainer = document.getElementById('bindTurnstileContainer');
        el.accountLogout = document.getElementById('accountLogout');
        el.loginTypeLabel = document.getElementById('loginTypeLabel');
        el.emailBindSection = document.getElementById('emailBindSection');
    }

    let firebaseReady = false;
    let cachedRemote = null;
    let emailEditMode = false;
    let cropper = null;

    function getGithubUser() {
        const raw = localStorage.getItem('github_user');
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch {
            return null;
        }
    }

    function getLocalUser() {
        const raw = localStorage.getItem('qb_user');
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch {
            return null;
        }
    }

    function getStoredLoginFallback() {
        const login = localStorage.getItem('github_login');
        return login ? { login } : null;
    }

    function ensureLogin() {
        const user = getGithubUser() || getLocalUser() || getStoredLoginFallback();
        if (user && user.login) return user;
        window.location.href = LOGIN_URL;
        return null;
    }

    function setText(target, value) {
        if (!target) return;
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
            target.value = value ?? '';
            return;
        }
        target.textContent = value;
    }

    function getProfile() {
        if (window.QuarkUserProfile && typeof window.QuarkUserProfile.getProfile === 'function') {
            return window.QuarkUserProfile.getProfile();
        }
        return {
            nickname: '',
            login: '',
            loginType: '',
            avatarUrl: '',
            avatarType: 'color',
            avatarColor: '#2563eb',
            profileUrl: ''
        };
    }

    function getLoginType() {
        if (window.QuarkUserProfile && typeof window.QuarkUserProfile.getProfile === 'function') {
            return window.QuarkUserProfile.getProfile().loginType || '';
        }
        return localStorage.getItem('quark_login_type') || '';
    }

    function getUid() {
        if (window.QuarkUserProfile && typeof window.QuarkUserProfile.getUid === 'function') {
            return window.QuarkUserProfile.getUid();
        }
        const localUser = getLocalUser();
        if (localUser && localUser.login) return `qb_${String(localUser.login).toLowerCase()}`;
        const user = getGithubUser();
        if (user && user.login) return `gh_${String(user.login).toLowerCase()}`;
        return localStorage.getItem('quark_uid') || '';
    }

    function getLegacyUid() {
        const uid = localStorage.getItem('quark_uid');
        return uid && uid.startsWith('q_') ? uid : '';
    }

    function updateAvatarPreview(url, name) {
        if (!el.avatarImage || !el.avatarFallback) return;
        const clean = (url || '').trim();
        if (clean) {
            el.avatarImage.src = clean;
            el.avatarImage.style.display = 'block';
            el.avatarFallback.style.display = 'none';
        } else {
            el.avatarImage.removeAttribute('src');
            el.avatarImage.style.display = 'none';
            el.avatarFallback.textContent = (name || 'Q').trim().slice(0, 1).toUpperCase();
            el.avatarFallback.style.display = 'block';
        }
        setText(el.avatarState, clean ? '已设置头像' : '使用默认头像');
    }

    function formatTime(ts) {
        if (!ts) return '-';
        return new Date(ts).toLocaleString('zh-CN', { hour12: false });
    }

    function formatDuration(ts) {
        if (!ts) return '-';
        const diff = Date.now() - ts;
        const days = Math.max(1, Math.floor(diff / (1000 * 60 * 60 * 24)));
        const years = Math.floor(days / 365);
        if (years > 0) return `${years} 年 ${days % 365} 天`;
        return `${days} 天`;
    }

    function setStatus(text) {
        setText(el.status, text);
    }

    function setEmailStatus(text) {
        setText(el.bindEmailStatus, text);
    }

    function normalizeEmail(value) {
        return String(value || '').trim().toLowerCase();
    }

    function validateEmail(value) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    }

    function getTurnstileSiteKey() {
        return window.QuarkTurnstile ? window.QuarkTurnstile.getSiteKey() : '';
    }

    function resetBindTurnstile() {
        if (window.QuarkTurnstile) {
            window.QuarkTurnstile.reset('bind');
        }
    }

    function ensureBindTurnstileRendered() {
        const key = getTurnstileSiteKey();
        if (!key || !(el.bindTurnstileContainer instanceof HTMLElement)) return;
        if (!window.QuarkTurnstile) return;
        if (!window.QuarkTurnstile.isRendered('bind')) {
            window.QuarkTurnstile.render(el.bindTurnstileContainer, 'bind');
        }
    }


    async function verifyBindTurnstile(statusEl) {
        if (!window.QuarkTurnstile) {
            setEmailStatus('验证码未加载');
            return false;
        }
        return window.QuarkTurnstile.verify('bind', (msg) => setEmailStatus(msg));
    }

    function emailKey(email) {
        return normalizeEmail(email).replace(/[.#$/\[\]]/g, '_');
    }

    function initCropper(image) {
        if (!(el.cropperCanvas instanceof HTMLCanvasElement) || !(el.cropperZoom instanceof HTMLInputElement)) return;
        const canvas = el.cropperCanvas;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const size = 360;
        canvas.width = size;
        canvas.height = size;
        cropper = {
            image,
            scale: 1,
            offsetX: 0,
            offsetY: 0,
            dragging: false,
            startX: 0,
            startY: 0,
            baseScale: 1,
            render: () => {}
        };

        const baseScale = Math.max(size / image.width, size / image.height);
        cropper.baseScale = baseScale;
        cropper.scale = baseScale;
        el.cropperZoom.value = '1';

        const render = () => {
            ctx.clearRect(0, 0, size, size);
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(0, 0, size, size);
            const drawWidth = image.width * cropper.scale;
            const drawHeight = image.height * cropper.scale;
            const dx = (size - drawWidth) / 2 + cropper.offsetX;
            const dy = (size - drawHeight) / 2 + cropper.offsetY;
            ctx.drawImage(image, dx, dy, drawWidth, drawHeight);
            ctx.strokeStyle = 'rgba(255,255,255,0.6)';
            ctx.lineWidth = 2;
            ctx.strokeRect(0, 0, size, size);
        };
        cropper.render = render;

        const applyZoom = (value) => {
            const zoom = Math.max(1, Math.min(3, Number(value)));
            cropper.scale = baseScale * zoom;
            render();
        };

        const startDrag = (x, y) => {
            cropper.dragging = true;
            cropper.startX = x;
            cropper.startY = y;
        };

        const moveDrag = (x, y) => {
            if (!cropper.dragging) return;
            cropper.offsetX += x - cropper.startX;
            cropper.offsetY += y - cropper.startY;
            cropper.startX = x;
            cropper.startY = y;
            render();
        };

        const endDrag = () => {
            cropper.dragging = false;
        };

        canvas.onpointerdown = (event) => {
            canvas.setPointerCapture(event.pointerId);
            startDrag(event.clientX, event.clientY);
        };
        canvas.onpointermove = (event) => moveDrag(event.clientX, event.clientY);
        canvas.onpointerup = endDrag;
        canvas.onpointerleave = endDrag;

        el.cropperZoom.oninput = () => applyZoom(el.cropperZoom.value);
        render();
    }

    function openCropper(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                initCropper(img);
                if (el.cropperModal) el.cropperModal.classList.add('active');
            };
            img.src = String(reader.result || '');
        };
        reader.readAsDataURL(file);
    }

    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = String(reader.result || '');
                const commaIndex = result.indexOf(',');
                resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
            };
            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.readAsDataURL(blob);
        });
    }

    function canvasToBlob(canvas) {
        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error('图片导出失败'));
            }, 'image/png', 0.92);
        });
    }

    function buildAvatarFileName(login) {
        const safeLogin = (login || 'guest').replace(/[^a-zA-Z0-9_-]/g, '');
        const ts = Date.now();
        const rand = Math.random().toString(36).slice(2, 8);
        return `${safeLogin}-${ts}-${rand}.png`;
    }

    async function uploadToGitHub({ token, repoPath, base64Content, originalName }) {
        const url = `https://api.github.com/repos/lsqkk/image/contents/${encodeURI(repoPath)}`;
        const body = {
            message: `upload avatar: ${originalName} -> ${repoPath}`,
            content: base64Content,
            branch: 'main'
        };

        const resp = await fetch(url, {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!resp.ok) {
            const text = await resp.text();
            throw new Error(`GitHub 上传失败（${resp.status}）：${text.slice(0, 120)}`);
        }
    }

    async function uploadCroppedAvatar() {
        if (!(el.cropperCanvas instanceof HTMLCanvasElement)) return;
        const token = window.GITHUB_API_KEY;
        if (!token) {
            setStatus('未获取到 GITHUB_API_KEY，请稍后重试');
            return;
        }

        try {
            setStatus('头像上传中...');
            const blob = await canvasToBlob(el.cropperCanvas);
            const base64Content = await blobToBase64(blob);
            const login = (el.githubLogin instanceof HTMLInputElement ? el.githubLogin.value.trim() : '') || '';
            const fileName = buildAvatarFileName(login);
            const year = new Date().getFullYear();
            const repoPath = `pic/avatar/${year}/${fileName}`;
            await uploadToGitHub({
                token,
                repoPath,
                base64Content,
                originalName: fileName
            });

            const cdnUrl = `https://cdn.jsdelivr.net/gh/lsqkk/image@main/${repoPath}`;
            if (el.avatarUrl instanceof HTMLInputElement) el.avatarUrl.value = cdnUrl;
            updateAvatarPreview(cdnUrl, el.nickname && el.nickname.value);
            setStatus('头像已上传并应用');
            if (el.cropperModal) el.cropperModal.classList.remove('active');
        } catch (error) {
            console.error('头像上传失败:', error);
            setStatus('头像上传失败，请稍后重试');
        }
    }

    function applyCropper() {
        void uploadCroppedAvatar();
    }

    function closeCropper() {
        if (el.cropperModal) el.cropperModal.classList.remove('active');
    }

    function handleAvatarFile(file) {
        if (!file) return;
        openCropper(file);
    }

    function bindEvents() {
        if (el.avatarFile instanceof HTMLInputElement) {
            el.avatarFile.addEventListener('change', () => {
                const file = el.avatarFile.files ? el.avatarFile.files[0] : null;
                handleAvatarFile(file);
                el.avatarFile.value = '';
            });
        }
        if (el.avatarUrl instanceof HTMLInputElement) {
            el.avatarUrl.addEventListener('input', () => {
                updateAvatarPreview(el.avatarUrl.value, el.nickname && el.nickname.value);
            });
        }
        if (el.avatarClear) {
            el.avatarClear.addEventListener('click', () => {
                if (el.avatarUrl instanceof HTMLInputElement) el.avatarUrl.value = '';
                updateAvatarPreview('', el.nickname && el.nickname.value);
            });
        }
        if (el.avatarFromGithub) {
            el.avatarFromGithub.addEventListener('click', () => {
                const githubUser = getGithubUser();
                const avatar = githubUser && githubUser.avatar_url ? githubUser.avatar_url : '';
                if (!avatar) {
                    setStatus('未读取到 GitHub 头像');
                    return;
                }
                if (el.avatarUrl instanceof HTMLInputElement) el.avatarUrl.value = avatar;
                updateAvatarPreview(avatar, el.nickname && el.nickname.value);
            });
        }
        if (el.cropperApply) el.cropperApply.addEventListener('click', () => applyCropper());
        if (el.cropperReset instanceof HTMLButtonElement && el.cropperZoom instanceof HTMLInputElement) {
            el.cropperReset.addEventListener('click', () => {
                if (!cropper) return;
                el.cropperZoom.value = '1';
                cropper.offsetX = 0;
                cropper.offsetY = 0;
                cropper.scale = cropper.baseScale;
                cropper.render();
            });
        }
        if (el.cropperClose) el.cropperClose.addEventListener('click', () => closeCropper());
        if (el.saveBtn) el.saveBtn.addEventListener('click', () => void saveProfile());
        if (el.refreshBtn) el.refreshBtn.addEventListener('click', () => void loadRemoteProfile(true));
        if (el.bindEmailSend) {
            el.bindEmailSend.addEventListener('click', () => {
                if (el.bindEmail instanceof HTMLInputElement) {
                    ensureBindTurnstileRendered();
                    void sendEmailCode(el.bindEmail.value.trim(), 'bind');
                }
            });
        }
        if (el.bindEmailEdit) {
            el.bindEmailEdit.addEventListener('click', () => {
                emailEditMode = true;
                ensureBindTurnstileRendered();
                setEmailBindingState(el.bindEmail instanceof HTMLInputElement ? el.bindEmail.value.trim() : '', true);
                if (el.bindEmailCode instanceof HTMLInputElement) el.bindEmailCode.value = '';
                setEmailStatus('请输入新邮箱并完成验证');
            });
        }
        if (el.bindEmailApply) {
            el.bindEmailApply.addEventListener('click', () => { void bindEmail(); });
        }
        if (el.bindEmailRemove) {
            el.bindEmailRemove.addEventListener('click', () => { void unbindEmail(); });
        }
        if (el.accountLogout) {
            el.accountLogout.addEventListener('click', () => {
                if (window.CommentShared && typeof window.CommentShared.logout === 'function') {
                    window.CommentShared.logout('/');
                } else {
                    localStorage.clear();
                    window.location.href = '/';
                }
            });
        }
    }

    async function ensureFirebase() {
        if (firebaseReady) return window.firebase.database();
        if (!window.QuarkFirebaseReady) {
            throw new Error('Firebase就绪模块未加载');
        }
        const db = await window.QuarkFirebaseReady.ensureDatabase({
            scriptId: 'firebase-config-loader-account'
        });
        firebaseReady = true;
        return db;
    }

    async function sendEmailCode(email, purpose) {
        if (!validateEmail(email)) {
            setEmailStatus('邮箱格式不正确');
            return false;
        }
        const captchaOk = await verifyBindTurnstile();
        if (!captchaOk) return false;
        setEmailStatus('验证码发送中...');
        try {
            const resp = await fetch(`${API_BASE}/api/email-send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, purpose })
            });
            const data = await resp.json();
            if (!resp.ok || !data?.token) {
                throw new Error(data?.error || '发送失败');
            }
            try {
                sessionStorage.setItem(`qb_email_token_${purpose}_${emailKey(email)}`, data.token);
            } catch {
                // ignore
            }
            setEmailStatus('验证码已发送');
            return true;
        } catch (error) {
            console.error('发送邮箱验证码失败:', error);
            setEmailStatus('验证码发送失败');
            return false;
        }
    }

    function readEmailToken(email, purpose) {
        try {
            return sessionStorage.getItem(`qb_email_token_${purpose}_${emailKey(email)}`) || '';
        } catch {
            return '';
        }
    }

    async function verifyEmailCode(email, code, purpose) {
        const token = readEmailToken(email, purpose);
        if (!token) return false;
        try {
            const resp = await fetch(`${API_BASE}/api/email-verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, code, token, purpose })
            });
            const data = await resp.json();
            return !!(resp.ok && data && data.ok);
        } catch (error) {
            console.error('邮箱验证码校验失败:', error);
            return false;
        }
    }

    async function migrateLegacyUid() {
        const legacyUid = getLegacyUid();
        const targetUid = getUid();
        if (!legacyUid || !targetUid || legacyUid === targetUid) return;
        try {
            const db = await ensureFirebase();
            const legacySnap = await db.ref('user_activity').child(legacyUid).once('value');
            const legacyData = legacySnap.val();
            if (!legacyData) {
                localStorage.setItem('quark_uid', targetUid);
                return;
            }
            const targetSnap = await db.ref('user_activity').child(targetUid).once('value');
            const targetData = targetSnap.val() || {};
            const legacyProfile = legacyData.profile || {};
            const targetProfile = targetData.profile || {};
            const legacyUpdatedAt = legacyProfile.updatedAt || 0;
            const targetUpdatedAt = targetProfile.updatedAt || 0;
            const mergedProfile = legacyUpdatedAt > targetUpdatedAt ? legacyProfile : targetProfile;

            await db.ref('user_activity').child(targetUid).update({
                profile: mergedProfile,
                events: { ...(legacyData.events || {}), ...(targetData.events || {}) },
                logins: { ...(legacyData.logins || {}), ...(targetData.logins || {}) }
            });
            await db.ref('user_activity').child(legacyUid).remove();
            localStorage.setItem('quark_uid', targetUid);
        } catch (error) {
            console.warn('账号迁移失败:', error);
        }
    }

    function applyProfileToForm(profile) {
        if (el.nickname instanceof HTMLInputElement) el.nickname.value = profile.nickname || '';
        if (el.avatarUrl instanceof HTMLInputElement) el.avatarUrl.value = profile.avatarUrl || '';
        updateAvatarPreview(profile.avatarUrl || '', profile.nickname || '');
    }

    async function loadRemoteProfile(force = false) {
        try {
            const db = await ensureFirebase();
            const uid = getUid();
            const snap = await db.ref('user_activity').child(uid).child('profile').once('value');
            const remote = snap.val() || null;
            cachedRemote = remote;
            if (remote && (force || remote.updatedAt)) {
                const localMeta = window.QuarkUserProfile && typeof window.QuarkUserProfile.getStoredProfile === 'function'
                    ? window.QuarkUserProfile.getStoredProfile()
                    : null;
                const localUpdatedAt = localMeta && typeof localMeta.updatedAt === 'number' ? localMeta.updatedAt : 0;
                const remoteUpdatedAt = typeof remote.updatedAt === 'number' ? remote.updatedAt : 0;
                if (remoteUpdatedAt > localUpdatedAt && window.QuarkUserProfile && typeof window.QuarkUserProfile.syncProfile === 'function') {
                    window.QuarkUserProfile.syncProfile(remote);
                }
                applyProfileToForm(remote);
                if (remote.login) setText(el.githubLogin, remote.login);
                setText(el.lastSyncAt, formatTime(remote.updatedAt));
                const location = [remote.province, remote.city].filter(Boolean).join(' ');
                setText(el.accountLocation, location || '-');
            }
        } catch (error) {
            console.error('加载远程资料失败:', error);
            setStatus('云端资料加载失败');
        }
    }

    async function loadRegistrationInfo() {
        let createdAt = 0;
        const loginType = getLoginType();
        if (loginType === 'local') {
            const localUser = getLocalUser();
            if (localUser && localUser.login) {
                try {
                    const db = await ensureFirebase();
                    const snap = await db.ref(`${DB_USERS}/${String(localUser.login).toLowerCase()}`).once('value');
                    const data = snap.val() || {};
                    if (typeof data.createdAt === 'number') {
                        createdAt = data.createdAt;
                    }
                } catch (error) {
                    console.warn('读取注册时间失败:', error);
                }
            }
        }
        if (!createdAt && cachedRemote && typeof cachedRemote.createdAt === 'number') {
            createdAt = cachedRemote.createdAt;
        }
        if (!createdAt && cachedRemote && typeof cachedRemote.updatedAt === 'number') {
            createdAt = cachedRemote.updatedAt;
        }
        if (createdAt) {
            setText(el.createdAt, formatTime(createdAt));
            setText(el.accountAge, formatDuration(createdAt));
        } else {
            setText(el.createdAt, '-');
            setText(el.accountAge, '-');
        }
    }

    function setEmailBindingState(email, editable = false) {
        const bound = Boolean(email);
        const canEdit = editable || !bound;
        const controls = [el.bindEmail, el.bindEmailCode, el.bindEmailSend, el.bindEmailApply];
        controls.forEach((item) => {
            if (item instanceof HTMLInputElement || item instanceof HTMLButtonElement) {
                item.disabled = !canEdit;
            }
        });
        if (el.bindEmailEdit instanceof HTMLButtonElement) {
            el.bindEmailEdit.style.display = bound && !canEdit ? 'inline-flex' : 'none';
        }
        if (el.bindEmailRemove instanceof HTMLButtonElement) {
            el.bindEmailRemove.style.display = bound ? 'inline-flex' : 'none';
            el.bindEmailRemove.disabled = !bound;
        }
        if (el.bindEmailApply instanceof HTMLButtonElement) {
            el.bindEmailApply.style.display = canEdit ? 'inline-flex' : 'none';
        }
    }

    async function loadBoundEmail() {
        if (!(el.bindEmail instanceof HTMLInputElement)) return;
        const loginType = getLoginType();
        const isLocal = loginType === 'local';
        if (el.emailBindSection instanceof HTMLElement) {
            el.emailBindSection.style.display = isLocal ? 'block' : 'none';
        }
        const controls = [el.bindEmail, el.bindEmailCode, el.bindEmailSend, el.bindEmailApply, el.bindEmailRemove, el.bindEmailEdit];
        controls.forEach((item) => {
            if (item instanceof HTMLInputElement || item instanceof HTMLButtonElement) {
                item.disabled = !isLocal;
            }
        });
        if (!isLocal) {
            if (el.bindEmail instanceof HTMLInputElement) el.bindEmail.value = '';
            if (el.bindEmailEdit instanceof HTMLButtonElement) el.bindEmailEdit.style.display = 'none';
            if (el.bindEmailRemove instanceof HTMLButtonElement) el.bindEmailRemove.style.display = 'none';
            setEmailStatus('仅支持站内账号绑定邮箱');
            return;
        }
        const localUser = getLocalUser();
        if (!localUser || !localUser.login) {
            setEmailStatus('未读取到账号信息');
            return;
        }
        try {
            const db = await ensureFirebase();
            const snap = await db.ref(`${DB_USERS}/${String(localUser.login).toLowerCase()}`).once('value');
            const data = snap.val() || {};
            const email = data.email || '';
            if (el.bindEmail instanceof HTMLInputElement) el.bindEmail.value = email;
            emailEditMode = false;
            setEmailBindingState(email, false);
            setEmailStatus(email ? '已绑定邮箱' : '未绑定邮箱');
        } catch (error) {
            console.error('加载邮箱失败:', error);
            setEmailStatus('邮箱信息加载失败');
        }
    }

    function renderLoginHistory(items) {
        if (!el.loginHistoryBody) return;
        if (!items.length) {
            el.loginHistoryBody.innerHTML = '暂无记录';
            return;
        }
        el.loginHistoryBody.innerHTML = items.map((item) => {
            const time = formatTime(item.ts);
            const device = item.deviceId ? `设备 ${item.deviceId.slice(-6)}` : '未知设备';
            const ua = (item.ua || '').slice(0, 80);
            return `
                <div class="record-entry">
                    <strong>${time}</strong>
                    <div>${device}</div>
                    <div>${ua || '-'}</div>
                </div>
            `;
        }).join('');
    }

    async function loadLoginHistory() {
        if (!el.loginHistoryBody) return;
        try {
            const db = await ensureFirebase();
            const uid = getUid();
            const snap = await db.ref('user_activity').child(uid).child('logins').once('value');
            const raw = snap.val() || {};
            const items = Object.values(raw)
                .filter((item) => item && item.ts)
                .sort((a, b) => b.ts - a.ts)
                .slice(0, 8);
            renderLoginHistory(items);
        } catch (error) {
            console.error('加载登录记录失败:', error);
            if (el.loginHistoryBody) el.loginHistoryBody.textContent = '加载失败';
        }
    }

    async function bindEmail() {
        if (!(el.bindEmail instanceof HTMLInputElement) || !(el.bindEmailCode instanceof HTMLInputElement)) return;
        const loginType = getLoginType();
        if (loginType !== 'local') {
            setEmailStatus('仅支持站内账号绑定邮箱');
            return;
        }
        const email = el.bindEmail.value.trim();
        const code = el.bindEmailCode.value.trim();
        if (!validateEmail(email)) {
            setEmailStatus('邮箱格式不正确');
            return;
        }
        if (!code) {
            setEmailStatus('请输入邮箱验证码');
            return;
        }
        const ok = await verifyEmailCode(email, code, 'bind');
        if (!ok) {
            setEmailStatus('邮箱验证码无效或已过期');
            return;
        }
        const localUser = getLocalUser();
        if (!localUser || !localUser.login) {
            setEmailStatus('未读取到账号信息');
            return;
        }
        try {
            const db = await ensureFirebase();
            const key = emailKey(email);
            const existing = await db.ref(`${DB_EMAIL_INDEX}/${key}`).once('value');
            const existLogin = existing.val();
            if (existLogin && String(existLogin).toLowerCase() !== String(localUser.login).toLowerCase()) {
                setEmailStatus('该邮箱已绑定其他账号');
                return;
            }
            await db.ref(`${DB_USERS}/${String(localUser.login).toLowerCase()}`).update({
                email: normalizeEmail(email),
                updatedAt: Date.now()
            });
            await db.ref(`${DB_EMAIL_INDEX}/${key}`).set(String(localUser.login).toLowerCase());
            await db.ref('user_activity').child(getUid()).child('profile').update({
                email: normalizeEmail(email),
                updatedAt: Date.now()
            });
            emailEditMode = false;
            setEmailBindingState(normalizeEmail(email), false);
            setEmailStatus('邮箱已绑定');
        } catch (error) {
            console.error('绑定邮箱失败:', error);
            setEmailStatus('绑定失败，请稍后重试');
        }
    }

    async function unbindEmail() {
        if (!(el.bindEmail instanceof HTMLInputElement)) return;
        const loginType = getLoginType();
        if (loginType !== 'local') {
            setEmailStatus('仅支持站内账号解绑邮箱');
            return;
        }
        const localUser = getLocalUser();
        if (!localUser || !localUser.login) {
            setEmailStatus('未读取到账号信息');
            return;
        }
        const email = el.bindEmail.value.trim();
        try {
            const db = await ensureFirebase();
            if (email) {
                await db.ref(`${DB_EMAIL_INDEX}/${emailKey(email)}`).remove();
            }
            await db.ref(`${DB_USERS}/${String(localUser.login).toLowerCase()}`).update({
                email: '',
                updatedAt: Date.now()
            });
            await db.ref('user_activity').child(getUid()).child('profile').update({
                email: '',
                updatedAt: Date.now()
            });
            if (el.bindEmail instanceof HTMLInputElement) el.bindEmail.value = '';
            emailEditMode = false;
            setEmailBindingState('', true);
            setEmailStatus('邮箱已解绑');
        } catch (error) {
            console.error('解绑邮箱失败:', error);
            setEmailStatus('解绑失败，请稍后重试');
        }
    }

    async function saveProfile() {
        const user = ensureLogin();
        if (!user) return;
        const login = user.login || '';
        const loginType = (window.QuarkUserProfile && typeof window.QuarkUserProfile.getProfile === 'function'
            ? (window.QuarkUserProfile.getProfile().loginType || '')
            : (localStorage.getItem('quark_login_type') || '')) || '';
        const nickname = el.nickname instanceof HTMLInputElement ? el.nickname.value.trim() : '';
        const avatarUrl = el.avatarUrl instanceof HTMLInputElement ? el.avatarUrl.value.trim() : '';
        const profileUrl = user.html_url || '';
        const uid = getUid();
        const createdAt = cachedRemote && typeof cachedRemote.createdAt === 'number' ? cachedRemote.createdAt : Date.now();

        const profile = {
            uid,
            nickname,
            login,
            loginType,
            avatarUrl,
            avatarType: avatarUrl ? 'image' : 'color',
            avatarColor: '#2563eb',
            profileUrl,
            createdAt,
            updatedAt: Date.now()
        };

        if (el.localSyncToggle && el.localSyncToggle instanceof HTMLInputElement && el.localSyncToggle.checked) {
            if (window.QuarkUserProfile && typeof window.QuarkUserProfile.syncProfile === 'function') {
                window.QuarkUserProfile.syncProfile(profile);
            }
        }

        try {
            const db = await ensureFirebase();
            await db.ref('user_activity').child(uid).child('profile').update(profile);
            if (loginType === 'local' && login) {
                await db.ref('qb_users').child(String(login).toLowerCase()).update({
                    nickname: profile.nickname || '',
                    avatarUrl: profile.avatarUrl || '',
                    updatedAt: Date.now()
                });
            }
            await db.ref('presence').child(uid).update({
                uid,
                nickname,
                login,
                loginType,
                avatarUrl,
                avatarType: avatarUrl ? 'image' : 'color',
                avatarColor: '#2563eb',
                path: location.pathname,
                title: document.title || '',
                lastSeen: Date.now()
            });
            cachedRemote = profile;
            setStatus('资料已保存并同步');
            setText(el.lastSyncAt, formatTime(profile.updatedAt));
        } catch (error) {
            console.error('保存资料失败:', error);
            setStatus('保存失败，请稍后再试');
        }
    }

    function fillStaticInfo() {
        const user = ensureLogin();
        if (!user) return;
        const profile = getProfile();
        applyProfileToForm(profile);
        setText(el.githubLogin, user.login || profile.login || '');
        const loginType = getLoginType();
        const loginTypeLabel = loginType === 'github' ? 'GitHub 登录' : (loginType === 'local' ? '站内账号' : '未知');
        setText(el.loginTypeLabel, `登录方式：${loginTypeLabel}`);
        setText(el.accountUid, getUid());
        setText(el.currentPage, location.pathname);
        setText(el.lastSyncAt, profile.updatedAt ? formatTime(profile.updatedAt) : '-');
        if (el.avatarFromGithub instanceof HTMLElement) {
            el.avatarFromGithub.style.display = loginType === 'github' ? 'inline-flex' : 'none';
        }
        if (el.accountSpaceLink instanceof HTMLAnchorElement) {
            const login = user.login || profile.login || '';
            const identifier = window.CommentShared && typeof window.CommentShared.getAccountIdentifier === 'function'
                ? window.CommentShared.getAccountIdentifier({ login, loginType })
                : (login ? (loginType === 'local' ? `qb_${login}` : `gh_${login}`) : '');
            el.accountSpaceLink.href = identifier ? `/space?user=${encodeURIComponent(identifier)}` : '/space';
        }
    }

    function initThemeSync() {
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const apply = () => {
            document.body.classList.toggle('dark-mode', media.matches);
        };
        apply();
        if (typeof media.addEventListener === 'function') {
            media.addEventListener('change', apply);
        } else if (typeof media.addListener === 'function') {
            media.addListener(apply);
        }
    }

    async function init() {
        initThemeSync();
        cacheElements();
        fillStaticInfo();
        bindEvents();
        await migrateLegacyUid();
        await loadRemoteProfile();
        await loadRegistrationInfo();
        await loadBoundEmail();
        await loadLoginHistory();
        const profile = getProfile();
        if (profile.login) {
            setText(el.githubLogin, profile.login);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { void init(); });
    } else {
        void init();
    }
})();
