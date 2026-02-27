const DAILY_LIMIT = 20;
const RTDB_LIMIT_ROOT = 'pic_upload_limits';
const REPO_OWNER = 'lsqkk';
const REPO_NAME = 'image';
const BRANCH = 'main';

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

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const database = firebase.database();

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
        const [ip, exemptIps] = await Promise.all([getClientIp(), loadExemptIps()]);
        clientIp = ip;
        exemptIpSet = new Set(exemptIps);
        await refreshLimitText();
    } catch (error) {
        setStatus(`初始化失败：${error.message}`);
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
    const token = window.GITHUB_API_KEY;
    if (!token) {
        setStatus('未获取到 GITHUB_API_KEY，请检查 /api/github-api-key');
        return;
    }

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
        const year = new Date().getFullYear();
        const fileName = buildFileName(file, i);
        const repoPath = `pic/${year}/${fileName}`;

        try {
            const base64Content = await fileToBase64(file);
            await uploadToGitHub({ token, repoPath, base64Content, originalName: file.name });

            const rawUrl = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/${repoPath}`;
            const cdnUrl = `https://cdn.jsdelivr.net/gh/${REPO_OWNER}/${REPO_NAME}@${BRANCH}/${repoPath}`;

            uploadedResults.push({
                originalName: file.name,
                fileName,
                rawUrl,
                cdnUrl
            });

            addResultItem(file.name, cdnUrl, rawUrl);
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

async function uploadToGitHub({ token, repoPath, base64Content, originalName }) {
    const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${encodeURI(repoPath)}`;
    const body = {
        message: `upload pic: ${originalName} -> ${repoPath}`,
        content: base64Content,
        branch: BRANCH
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

function addResultItem(originalName, cdnUrl, rawUrl) {
    const box = document.createElement('div');
    box.className = 'pic-item';
    box.innerHTML = `
        <p><strong>${escapeHtml(originalName)}</strong></p>
        <p>加速链接：<a href="${cdnUrl}" target="_blank" rel="noopener noreferrer">${cdnUrl}</a></p>
        <p>Raw 直链：<a href="${rawUrl}" target="_blank" rel="noopener noreferrer">${rawUrl}</a></p>
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
    const resp = await fetch('./exempt-ips.json', { cache: 'no-store' });
    if (!resp.ok) {
        throw new Error('读取 exempt-ips.json 失败');
    }
    const data = await resp.json();
    return Array.isArray(data.ips) ? data.ips : [];
}

async function getClientIp() {
    try {
        const resp = await fetch('https://api.130923.xyz/api/ip', { cache: 'no-store' });
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
    limitText.textContent = `当前IP：${clientIp}，今日已上传 ${count}/${DAILY_LIMIT}`;
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
        if (currentCount + countToAdd > DAILY_LIMIT) {
            exceed = true;
            return;
        }

        return {
            count: currentCount + countToAdd,
            ip: clientIp,
            updatedAt: Date.now()
        };
    });

    if (!result.committed || exceed) {
        return {
            ok: false,
            reserved: 0,
            message: `今日上传额度不足：最多 ${DAILY_LIMIT} 张/天`
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

function buildFileName(file, index) {
    const ext = getFileExtension(file);
    const ts = Date.now();
    const random = Math.random().toString(36).slice(2, 8);
    return `${ts}-${index + 1}-${random}.${ext}`;
}

function getFileExtension(file) {
    const nameExt = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : '';
    if (nameExt) {
        return nameExt;
    }

    const type = file.type.toLowerCase();
    if (type.includes('png')) return 'png';
    if (type.includes('webp')) return 'webp';
    if (type.includes('gif')) return 'gif';
    return 'jpg';
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = String(reader.result || '');
            const commaIndex = result.indexOf(',');
            resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
        };
        reader.onerror = () => reject(new Error('文件读取失败'));
        reader.readAsDataURL(file);
    });
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
        .map(item => `![${item.fileName}](${item.cdnUrl})`)
        .join('\n');
    copyText(content, 'Markdown');
}

function copyHtmlLinks() {
    const content = uploadedResults
        .map(item => `<img src="${item.cdnUrl}" alt="${item.fileName}">`)
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
