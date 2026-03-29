const GUEST_DAILY_LIMIT = 20;
const LOGGED_DAILY_LIMIT = 100;
const RTDB_LIMIT_ROOT = 'pic_upload_limits';
const API_BASE = '__API_BASE__';

let clientIp = 'unknown';
let exemptIpSet = new Set();
let uploadedResults = [];

const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const clearBtn = document.getElementById('clearBtn');
const statusText = document.getElementById('statusText');
const progressBar = document.getElementById('progressBar');
const fileList = document.getElementById('fileList');
const resultBox = document.getElementById('resultBox');
const limitText = document.getElementById('limitText');
const copyMarkdownBtn = document.getElementById('copyMarkdownBtn');
const copyHtmlBtn = document.getElementById('copyHtmlBtn');
const loginTip = document.getElementById('picLoginTip');
let database = null;

document.addEventListener('DOMContentLoaded', async () => {
    bindEvents();
    await initializePageContext();
});

function bindEvents() {
    fileInput.addEventListener('change', renderSelectedFiles);
    uploadBtn.addEventListener('click', handleUpload);
    clearBtn.addEventListener('click', clearResults);
    copyMarkdownBtn.addEventListener('click', copyMarkdownLinks);
    copyHtmlBtn.addEventListener('click', copyHtmlLinks);
}

async function initializePageContext() {
    try {
        await ensureFirebaseDatabase();
        const [ip, exemptIps] = await Promise.all([getClientIp(), loadExemptIps()]);
        clientIp = ip;
        exemptIpSet = new Set(exemptIps);
        updateLoginTip();
        await refreshLimitText();
    } catch (error) {
        setStatus(`初始化失败：${error.message}`);
    }
}

async function ensureFirebaseDatabase() {
    if (database) return database;
    if (window.QuarkFirebaseReady && typeof window.QuarkFirebaseReady.ensureDatabase === 'function') {
        database = await window.QuarkFirebaseReady.ensureDatabase({ loadConfig: true });
        return database;
    }
    if (window.firebase && window.firebase.database) {
        if (!window.firebase.apps || !window.firebase.apps.length) {
            if (window.firebaseConfig && window.firebaseConfig.projectId) {
                window.firebase.initializeApp(window.firebaseConfig);
            }
        }
        database = window.firebase.database();
        return database;
    }
    throw new Error('Firebase 未就绪');
}

function isLoggedUser() {
    if (window.CommentShared && typeof window.CommentShared.getLoginProfile === 'function') {
        const profile = window.CommentShared.getLoginProfile();
        return Boolean(profile && profile.isLoggedUser);
    }
    return Boolean(localStorage.getItem('github_code') || localStorage.getItem('github_user') || localStorage.getItem('qb_user'));
}

function getDailyLimit() {
    return isLoggedUser() ? LOGGED_DAILY_LIMIT : GUEST_DAILY_LIMIT;
}

function updateLoginTip() {
    if (!(loginTip instanceof HTMLElement)) return;
    if (isLoggedUser()) {
        loginTip.textContent = '已登录，上传额度提升至 100 张/天';
        loginTip.classList.add('is-logged');
    } else {
        loginTip.textContent = '未登录用户每日可上传 20 张，登录后提升至 100 张';
        loginTip.classList.remove('is-logged');
    }
}

function renderSelectedFiles() {
    fileList.innerHTML = '';
    const files = Array.from(fileInput.files || []);
    files.forEach((file, idx) => {
        const li = document.createElement('li');
        li.textContent = `${idx + 1}. ${file.name} (${formatFileSize(file.size)})`;
        fileList.appendChild(li);
    });
}

async function handleUpload() {
    const files = Array.from(fileInput.files || []);
    if (!files.length) {
        setStatus('请先选择至少一张图片');
        return;
    }

    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    if (!imageFiles.length) {
        setStatus('请选择图片文件');
        return;
    }

    const todayKey = getDateKey();
    const quotaHold = await holdQuota(todayKey, imageFiles.length);
    if (!quotaHold.ok) {
        setStatus(quotaHold.message);
        await refreshLimitText();
        return;
    }

    uploadBtn.disabled = true;
    progressBar.style.width = '0%';

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        try {
            const presign = await requestPresignedUpload(file);
            await uploadToR2(presign.uploadUrl, file);

            uploadedResults.push({
                originalName: file.name,
                fileName: presign.fileName,
                publicUrl: presign.publicUrl
            });

            addResultItem(file.name, presign.publicUrl);
            successCount += 1;
        } catch (error) {
            failCount += 1;
            addFailureItem(file.name, error.message);
        }

        const percent = Math.round(((i + 1) / imageFiles.length) * 100);
        progressBar.style.width = `${percent}%`;
        setStatus(`上传中：${i + 1}/${imageFiles.length}`);
    }

    if (failCount > 0 && quotaHold.reserved > 0) {
        await rollbackQuota(todayKey, failCount);
    }

    setStatus(`完成：成功 ${successCount}，失败 ${failCount}`);
    uploadBtn.disabled = false;
    await refreshLimitText();
}

async function requestPresignedUpload(file) {
    const resp = await fetch(`${API_BASE}/api/r2-presign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            originalName: file.name,
            contentType: file.type || 'application/octet-stream'
        })
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data?.uploadUrl || !data?.publicUrl) {
        throw new Error(data?.error || '获取上传链接失败');
    }
    return data;
}

async function uploadToR2(uploadUrl, file) {
    const resp = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
            'Content-Type': file.type || 'application/octet-stream'
        },
        body: file
    });

    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`R2 上传失败（${resp.status}）：${text.slice(0, 120)}`);
    }
}

function addResultItem(originalName, publicUrl) {
    const box = document.createElement('div');
    box.className = 'pic-item';
    box.innerHTML = `
        <p><strong>${escapeHtml(originalName)}</strong></p>
        <p>图片直链：<a href="${publicUrl}" target="_blank" rel="noopener noreferrer">${publicUrl}</a></p>
    `;
    resultBox.appendChild(box);
}

function addFailureItem(originalName, reason) {
    const box = document.createElement('div');
    box.className = 'pic-item';
    box.innerHTML = `
        <p><strong>${escapeHtml(originalName)}</strong></p>
        <p>上传失败：${escapeHtml(reason)}</p>
    `;
    resultBox.appendChild(box);
}

function clearResults() {
    uploadedResults = [];
    resultBox.innerHTML = '';
    fileList.innerHTML = '';
    fileInput.value = '';
    progressBar.style.width = '0%';
    setStatus('等待上传');
}

async function loadExemptIps() {
    const resp = await fetch('/assets/pages/a/pic/exempt-ips.json', { cache: 'no-store' });
    if (!resp.ok) {
        throw new Error('读取 exempt-ips.json 失败');
    }
    const data = await resp.json();
    return Array.isArray(data.ips) ? data.ips : [];
}

async function getClientIp() {
    try {
        const resp = await fetch(`${API_BASE}/api/ip`, { cache: 'no-store' });
        if (resp.ok) {
            const data = await resp.json();
            if (data && data.ip) {
                return data.ip;
            }
        }
    } catch (error) {
    }

    try {
        const localResp = await fetch('/api/ip', { cache: 'no-store' });
        if (localResp.ok) {
            const localData = await localResp.json();
            if (localData && localData.ip) {
                return localData.ip;
            }
        }
    } catch (error) {
    }

    const backupResp = await fetch('https://api.ipify.org?format=json');
    const backupData = await backupResp.json();
    return backupData.ip || 'unknown';
}

async function refreshLimitText() {
    const exempt = isExemptIp();
    if (exempt) {
        limitText.textContent = `当前IP：${clientIp}（豁免）`;
        return;
    }

    const count = await getTodayUploadCount(getDateKey());
    limitText.textContent = `当前IP：${clientIp}，今日已上传 ${count}/${getDailyLimit()}`;
}

function getTodayUploadCount(dateKey) {
    if (isExemptIp()) {
        return Promise.resolve(0);
    }

    const ipKey = toIpKey(clientIp);
    return database
        .ref(`${RTDB_LIMIT_ROOT}/${dateKey}/${ipKey}/count`)
        .once('value')
        .then(snapshot => Number(snapshot.val() || 0));
}

async function holdQuota(dateKey, countToAdd) {
    if (isExemptIp()) {
        return { ok: true, reserved: 0 };
    }

    const ipKey = toIpKey(clientIp);
    const ref = database.ref(`${RTDB_LIMIT_ROOT}/${dateKey}/${ipKey}`);

    let exceed = false;
    const result = await ref.transaction(current => {
        const currentCount = Number(current?.count || 0);
        if (currentCount + countToAdd > getDailyLimit()) {
            exceed = true;
            return;
        }

        return {
            count: currentCount + countToAdd,
            ip: clientIp,
            updatedAt: Date.now()
        };
    });

    if (!result || !result.committed || exceed) {
        return {
            ok: false,
            reserved: 0,
            message: `今日上传额度不足：最多 ${getDailyLimit()} 张/天`
        };
    }

    return { ok: true, reserved: countToAdd };
}

async function rollbackQuota(dateKey, failedCount) {
    if (isExemptIp() || failedCount <= 0) {
        return;
    }

    const ipKey = toIpKey(clientIp);
    const ref = database.ref(`${RTDB_LIMIT_ROOT}/${dateKey}/${ipKey}`);

    await ref.transaction(current => {
        const currentCount = Number(current?.count || 0);
        const nextCount = Math.max(0, currentCount - failedCount);
        return {
            count: nextCount,
            ip: clientIp,
            updatedAt: Date.now()
        };
    });
}

function toIpKey(ip) {
    return String(ip || 'unknown').replace(/[.:]/g, '_');
}

function isExemptIp() {
    return exemptIpSet.has(clientIp);
}

function getDateKey() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function setStatus(text) {
    statusText.textContent = text;
}

function formatFileSize(size) {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function copyMarkdownLinks() {
    const content = uploadedResults
        .map(item => `![${item.fileName}](${item.publicUrl})`)
        .join('\n');
    copyText(content, 'Markdown');
}

function copyHtmlLinks() {
    const content = uploadedResults
        .map(item => `<img src="${item.publicUrl}" alt="${item.fileName}">`)
        .join('\n');
    copyText(content, 'HTML');
}

function copyText(text, label) {
    if (!text) {
        setStatus(`没有可复制的 ${label} 内容`);
        return;
    }

    navigator.clipboard.writeText(text)
        .then(() => setStatus(`${label} 已复制`))
        .catch(() => setStatus(`${label} 复制失败`));
}

function escapeHtml(input) {
    return String(input)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
