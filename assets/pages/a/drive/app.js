// @ts-check

(function () {
    const API_BASE = '__API_BASE__';
    const ADMIN_STATE_KEY = 'isAdmin';
    const DRIVE_ITEMS_KEY = 'quark_drive_items';
    const DRIVE_SYNC_KEY = 'quark_drive_sync_at';
    const MAX_LOCAL_ITEMS = 200;
    const DRIVE_OPTIONS_KEY = 'quark_drive_options';
    const LARGE_FILE_THRESHOLD = 100 * 1024 * 1024;

    const el = {
        adminSession: document.getElementById('adminSession'),
        adminStatus: document.getElementById('adminStatus'),
        adminPassword: document.getElementById('adminPassword'),
        adminLoginBtn: document.getElementById('adminLoginBtn'),
        adminLogoutBtn: document.getElementById('adminLogoutBtn'),
        fileInput: document.getElementById('fileInput'),
        uploadBtn: document.getElementById('uploadBtn'),
        clearBtn: document.getElementById('clearBtn'),
        statusText: document.getElementById('statusText'),
        progressBar: document.getElementById('progressBar'),
        fileList: document.getElementById('fileList'),
        resultBox: document.getElementById('resultBox'),
        copyAllBtn: document.getElementById('copyAllBtn'),
        historyBox: document.getElementById('historyBox'),
        clearLocalBtn: document.getElementById('clearLocalBtn'),
        localSyncState: document.getElementById('localSyncState')
    };

    /** @type {Array<{name: string, size: number, url: string, uploadedAt: number}>} */
    let uploadedResults = [];
    let uploadOptions = {
        keepOriginalName: true,
        appendNickname: false,
        nickname: ''
    };

    function setText(target, value) {
        if (target) target.textContent = value;
    }

    function isAdmin() {
        return localStorage.getItem(ADMIN_STATE_KEY) === 'true';
    }

    function setAdminState(value) {
        localStorage.setItem(ADMIN_STATE_KEY, value ? 'true' : 'false');
    }

    function updateAdminUI() {
        const admin = isAdmin();
        document.body.classList.toggle('admin-ready', admin);
        setText(el.adminSession, admin ? '已登录' : '未登录');
        setText(el.adminStatus, admin ? '管理员登录成功' : '等待登录');
    }

    async function sha256(text) {
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        const hash = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }

    async function adminLogin() {
        if (!(el.adminPassword instanceof HTMLInputElement)) return;
        const password = el.adminPassword.value.trim();
        if (!password) {
            setText(el.adminStatus, '请输入管理员密码');
            el.adminPassword.focus();
            return;
        }
        if (el.adminLoginBtn) el.adminLoginBtn.setAttribute('disabled', 'true');
        setText(el.adminStatus, '验证中...');
        try {
            const passwordHash = await sha256(password);
            const response = await fetch('https://api.130923.xyz/api/admin-auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ passwordHash })
            });
            const result = await response.json().catch(() => ({}));
            if (response.ok && (result.success || result.token)) {
                setAdminState(true);
                setText(el.adminStatus, '管理员登录成功');
                el.adminPassword.value = '';
                updateAdminUI();
                renderHistory(loadLocalItems());
            } else {
                setText(el.adminStatus, result.error || '密码错误');
                el.adminPassword.select();
            }
        } catch (error) {
            console.error('管理员登录失败:', error);
            setText(el.adminStatus, '登录失败：网络或服务异常');
        } finally {
            if (el.adminLoginBtn) el.adminLoginBtn.removeAttribute('disabled');
        }
    }

    function adminLogout() {
        setAdminState(false);
        updateAdminUI();
    }

    function bindEvents() {
        if (el.adminLoginBtn) el.adminLoginBtn.addEventListener('click', () => void adminLogin());
        if (el.adminLogoutBtn) el.adminLogoutBtn.addEventListener('click', adminLogout);
        if (el.adminPassword instanceof HTMLInputElement) {
            el.adminPassword.addEventListener('keypress', (event) => {
                if (event.key === 'Enter') void adminLogin();
            });
        }
        const keepNameToggle = document.getElementById('keepNameToggle');
        const nicknameToggle = document.getElementById('nicknameToggle');
        const nicknameInput = document.getElementById('nicknameInput');
        if (keepNameToggle) {
            keepNameToggle.addEventListener('change', () => {
                uploadOptions.keepOriginalName = keepNameToggle.checked;
                persistOptions();
                updateOptionTip();
            });
        }
        if (nicknameToggle) {
            nicknameToggle.addEventListener('change', () => {
                uploadOptions.appendNickname = nicknameToggle.checked;
                persistOptions();
            });
        }
        if (nicknameInput instanceof HTMLInputElement) {
            nicknameInput.addEventListener('input', () => {
                uploadOptions.nickname = nicknameInput.value.trim();
                persistOptions();
            });
        }
        if (el.fileInput) el.fileInput.addEventListener('change', renderSelectedFiles);
        if (el.uploadBtn) el.uploadBtn.addEventListener('click', () => void handleUpload());
        if (el.clearBtn) el.clearBtn.addEventListener('click', clearResults);
        if (el.copyAllBtn) el.copyAllBtn.addEventListener('click', copyAllLinks);
        if (el.clearLocalBtn) el.clearLocalBtn.addEventListener('click', clearLocalHistory);
    }

    function renderSelectedFiles() {
        if (!el.fileList || !el.fileInput) return;
        el.fileList.innerHTML = '';
        const files = Array.from(el.fileInput.files || []);
        files.forEach((file, idx) => {
            const li = document.createElement('li');
            li.textContent = `${idx + 1}. ${file.name} (${formatFileSize(file.size)})`;
            el.fileList.appendChild(li);
        });
    }

    async function handleUpload() {
        if (!isAdmin()) {
            setText(el.statusText, '需要管理员登录才能上传');
            return;
        }
        if (!el.fileInput) return;
        const files = Array.from(el.fileInput.files || []);
        if (!files.length) {
            setText(el.statusText, '请先选择文件');
            return;
        }

        if (el.uploadBtn) el.uploadBtn.setAttribute('disabled', 'true');
        if (el.progressBar) el.progressBar.style.width = '0%';
        setText(el.statusText, '开始上传...');

        let successCount = 0;
        let failCount = 0;
        const totalBytes = files.reduce((sum, file) => sum + (file.size || 0), 0) || 1;
        let completedBytes = 0;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            try {
                const uploadName = buildUploadName(file.name);
                const presign = await requestPresignedUpload(file, uploadName);
                await uploadWithRetry(presign.uploadUrl, file, (loaded) => {
                    const percent = Math.min(100, Math.round(((completedBytes + loaded) / totalBytes) * 100));
                    if (el.progressBar) el.progressBar.style.width = `${percent}%`;
                });
                const record = {
                    name: file.name,
                    storedName: uploadName,
                    size: file.size,
                    url: presign.publicUrl,
                    uploadedAt: Date.now()
                };
                completedBytes += file.size || 0;
                uploadedResults.push(record);
                addResultItem(record);
                appendLocalItem(record);
                successCount += 1;
            } catch (error) {
                failCount += 1;
                completedBytes += file.size || 0;
                addFailureItem(file.name, error.message || '上传失败');
            }

            const percent = Math.round(((i + 1) / files.length) * 100);
            if (el.progressBar) el.progressBar.style.width = `${percent}%`;
            setText(el.statusText, `上传中：${i + 1}/${files.length}`);
        }

        if (el.uploadBtn) el.uploadBtn.removeAttribute('disabled');
        setText(el.statusText, `完成：成功 ${successCount}，失败 ${failCount}`);
    }

    function buildUploadName(originalName) {
        const safeOriginal = sanitizeFileName(originalName);
        let name = safeOriginal;
        if (!uploadOptions.keepOriginalName) {
            name = `${Date.now()}-${safeOriginal}`;
        }
        if (uploadOptions.appendNickname && uploadOptions.nickname) {
            const nick = sanitizeFileName(uploadOptions.nickname);
            if (nick) name = `${nick}-${name}`;
        }
        return name;
    }

    async function requestPresignedUpload(file, uploadName) {
        const resp = await fetch(`${API_BASE}/api/r2-presign`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                originalName: uploadName || file.name,
                contentType: file.type || 'application/octet-stream',
                folder: 'drive'
            })
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !data?.uploadUrl || !data?.publicUrl) {
            throw new Error(data?.error || '获取上传链接失败');
        }
        return data;
    }

    async function uploadWithRetry(uploadUrl, file, onProgress) {
        const maxRetries = file.size >= LARGE_FILE_THRESHOLD ? 2 : 1;
        let attempt = 0;
        while (attempt <= maxRetries) {
            try {
                await uploadToR2(uploadUrl, file, onProgress);
                return;
            } catch (error) {
                attempt += 1;
                if (attempt > maxRetries) throw error;
                await wait(800 * attempt);
                setText(el.statusText, `大文件上传波动，正在重试（${attempt}/${maxRetries}）...`);
            }
        }
    }

    function uploadToR2(uploadUrl, file, onProgress) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('PUT', uploadUrl, true);
            xhr.timeout = 0;
            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable && typeof onProgress === 'function') {
                    onProgress(event.loaded);
                }
            };
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve();
                } else {
                    reject(new Error(`上传失败（${xhr.status}）：${String(xhr.responseText || '').slice(0, 120)}`));
                }
            };
            xhr.onerror = () => reject(new Error('网络错误，上传中断'));
            xhr.onabort = () => reject(new Error('上传已取消'));
            xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
            xhr.send(file);
        });
    }

    function addResultItem(record) {
        if (!el.resultBox) return;
        const box = document.createElement('div');
        box.className = 'drive-item';
        const nameLine = record.storedName && record.storedName !== record.name
            ? `${escapeHtml(record.name)} → ${escapeHtml(record.storedName)}`
            : escapeHtml(record.name);
        box.innerHTML = `
            <p><strong>${nameLine}</strong></p>
            <p>大小：${formatFileSize(record.size)}</p>
            <p>直链：<a href="${record.url}" target="_blank" rel="noopener noreferrer">${record.url}</a></p>
            <div class="drive-item-actions">
                <button type="button" data-copy="${record.url}">复制直链</button>
            </div>
        `;
        const copyBtn = box.querySelector('button[data-copy]');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => copyText(record.url, '直链'));
        }
        el.resultBox.appendChild(box);
    }

    function addFailureItem(name, reason) {
        if (!el.resultBox) return;
        const box = document.createElement('div');
        box.className = 'drive-item';
        box.innerHTML = `
            <p><strong>${escapeHtml(name)}</strong></p>
            <p>上传失败：${escapeHtml(reason)}</p>
        `;
        el.resultBox.appendChild(box);
    }

    function clearResults() {
        uploadedResults = [];
        if (el.resultBox) el.resultBox.innerHTML = '';
        if (el.fileList) el.fileList.innerHTML = '';
        if (el.fileInput) el.fileInput.value = '';
        if (el.progressBar) el.progressBar.style.width = '0%';
        setText(el.statusText, '等待上传');
    }

    function copyAllLinks() {
        const items = uploadedResults.length ? uploadedResults : loadLocalItems();
        if (!items.length) {
            setText(el.statusText, '暂无可复制的直链');
            return;
        }
        const content = items.map((item) => item.url).join('\n');
        copyText(content, '直链');
    }

    function copyText(text, label) {
        if (!text) {
            setText(el.statusText, `没有可复制的 ${label}`);
            return;
        }
        navigator.clipboard.writeText(text)
            .then(() => setText(el.statusText, `${label} 已复制`))
            .catch(() => setText(el.statusText, `${label} 复制失败`));
    }

    function escapeHtml(input) {
        return String(input)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatFileSize(size) {
        if (!size && size !== 0) return '-';
        if (size < 1024) return `${size} B`;
        if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
        if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(2)} MB`;
        return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }

    function formatTime(ts) {
        if (!ts) return '-';
        try {
            return new Date(ts).toLocaleString('zh-CN', { hour12: false });
        } catch {
            return '-';
        }
    }

    function loadLocalItems() {
        try {
            const raw = localStorage.getItem(DRIVE_ITEMS_KEY);
            const items = raw ? JSON.parse(raw) : [];
            if (Array.isArray(items)) {
                return items.filter((item) => item && item.url);
            }
        } catch (error) {
            console.warn('读取本地记录失败:', error);
        }
        return [];
    }

    function appendLocalItem(item) {
        const existing = loadLocalItems();
        const merged = [item, ...existing]
            .filter((entry) => entry && entry.url)
            .slice(0, MAX_LOCAL_ITEMS);
        localStorage.setItem(DRIVE_ITEMS_KEY, JSON.stringify(merged));
        localStorage.setItem(DRIVE_SYNC_KEY, String(Date.now()));
        updateLocalSyncState();
        renderHistory(merged);
    }

    function renderHistory(items) {
        if (!el.historyBox) return;
        if (!items.length) {
            el.historyBox.innerHTML = '<div class="drive-item">暂无本地记录</div>';
            return;
        }
        el.historyBox.innerHTML = items.map((item) => {
            const nameLine = item.storedName && item.storedName !== item.name
                ? `${escapeHtml(item.name)} → ${escapeHtml(item.storedName)}`
                : escapeHtml(item.name);
            return `
            <div class="drive-item">
                <p><strong>${nameLine}</strong></p>
                <p>大小：${formatFileSize(item.size)}</p>
                <p>时间：${formatTime(item.uploadedAt)}</p>
                <p>直链：<a href="${item.url}" target="_blank" rel="noopener noreferrer">${item.url}</a></p>
                <div class="drive-item-actions">
                    <button type="button" data-copy="${item.url}">复制直链</button>
                </div>
            </div>
        `;
        }).join('');
        el.historyBox.querySelectorAll('button[data-copy]').forEach((btn) => {
            btn.addEventListener('click', () => copyText(btn.getAttribute('data-copy') || '', '直链'));
        });
    }

    function clearLocalHistory() {
        localStorage.removeItem(DRIVE_ITEMS_KEY);
        localStorage.removeItem(DRIVE_SYNC_KEY);
        updateLocalSyncState();
        renderHistory([]);
    }

    function updateLocalSyncState() {
        const ts = Number(localStorage.getItem(DRIVE_SYNC_KEY) || 0);
        if (!ts) {
            setText(el.localSyncState, '本地记录未同步');
            return;
        }
        setText(el.localSyncState, `本地记录已同步 · ${formatTime(ts)}`);
    }

    function wait(ms) {
        return new Promise((resolve) => window.setTimeout(resolve, ms));
    }

    function sanitizeFileName(name) {
        return String(name || '')
            .replace(/[\\/:*?"<>|]/g, '-')
            .replace(/\\s+/g, ' ')
            .trim();
    }

    function loadOptions() {
        try {
            const raw = localStorage.getItem(DRIVE_OPTIONS_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                uploadOptions = {
                    keepOriginalName: parsed?.keepOriginalName !== false,
                    appendNickname: !!parsed?.appendNickname,
                    nickname: String(parsed?.nickname || '').trim()
                };
            }
        } catch (error) {
            console.warn('读取上传选项失败:', error);
        }
        const keepNameToggle = document.getElementById('keepNameToggle');
        const nicknameToggle = document.getElementById('nicknameToggle');
        const nicknameInput = document.getElementById('nicknameInput');
        if (keepNameToggle) keepNameToggle.checked = uploadOptions.keepOriginalName;
        if (nicknameToggle) nicknameToggle.checked = uploadOptions.appendNickname;
        if (nicknameInput instanceof HTMLInputElement) nicknameInput.value = uploadOptions.nickname;
        updateOptionTip();
    }

    function persistOptions() {
        localStorage.setItem(DRIVE_OPTIONS_KEY, JSON.stringify(uploadOptions));
    }

    function updateOptionTip() {
        const tip = document.getElementById('optionTip');
        if (!tip) return;
        tip.textContent = uploadOptions.keepOriginalName
            ? '已保持原文件名，若担心重名可取消此项自动追加时间戳。'
            : '已自动追加时间戳以避免重名。';
    }

    function init() {
        bindEvents();
        loadOptions();
        updateAdminUI();
        updateLocalSyncState();
        if (isAdmin()) {
            renderHistory(loadLocalItems());
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
