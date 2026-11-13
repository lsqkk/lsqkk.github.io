const API_BASE = '__API_BASE__';

async function readIp() {
    for (const url of [API_BASE + '/api/ip', '/api/ip', 'https://api.ipify.org?format=json']) {
        try {
            const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
            const data = response.ok && await response.json();
            if (typeof data.ip === 'string' && /^[0-9a-f.:]+$/i.test(data.ip)) return data.ip;
        } catch {
            // Try the next IP source.
        }
    }
    throw new Error('暂时无法识别上传额度，请重试');
}

function getDateKey() {
    const now = new Date();
    return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
}

let quotaContext;

function loadQuota() {
    if (!quotaContext) {
        quotaContext = Promise.all([
            readIp(),
            fetch('/assets/pages/a/pic/exempt-ips.json', { cache: 'no-store', signal: AbortSignal.timeout(8000) })
                .then(response => {
                    if (!response.ok) throw new Error('无法读取上传额度配置');
                    return response.json();
                })
        ]).then(async ([ip, exemption]) => {
            if (Array.isArray(exemption.ips) && exemption.ips.includes(ip)) return { exempt: true };
            const database = await window.QuarkFirebaseReady.ensureDatabase({ loadConfig: true });
            return {
                exempt: false, ip,
                ref(date) { return database.ref('pic_upload_limits/' + date + '/' + ip.replace(/[.:]/g, '_')); }
            };
        }).catch(error => {
            quotaContext = undefined;
            throw error;
        });
    }
    return quotaContext;
}

export function isLoggedUser() {
    return Boolean(window.CommentShared?.getLoginProfile?.()?.isLoggedUser);
}

function dailyLimit() {
    return isLoggedUser() ? 100 : 20;
}

export async function readQuota() {
    const quota = await loadQuota();
    if (quota.exempt) return { exempt: true };
    const snap = await quota.ref(getDateKey()).once('value');
    return { used: Number(snap.val()?.count || 0), limit: dailyLimit() };
}

async function changeQuota(ref, ip, delta, limit) {
    const update = async () => {
        let accepted = false;
        const result = await ref.transaction(current => {
            const count = Math.max(0, Number(current?.count || 0) + delta);
            accepted = count <= limit;
            if (!accepted) return;
            return { ...current, count, ip, updatedAt: Date.now() };
        });
        return result?.committed ?? accepted;
    };
    // The site's Firebase shim uses a read/write pair. Serialize it across tabs on this browser.
    return navigator.locks ? navigator.locks.request('quark-pic-quota', update) : update();
}

export async function reserveQuota(count) {
    const quota = await loadQuota();
    if (quota.exempt) return async () => {};
    const ref = quota.ref(getDateKey());
    const limit = dailyLimit();
    if (!await changeQuota(ref, quota.ip, count, limit)) throw new Error('今日剩余额度不足。请移除部分图片后再上传（每日 ' + limit + ' 张）');
    return unused => unused ? changeQuota(ref, quota.ip, -unused, Infinity) : Promise.resolve();
}

export async function presign(file) {
    const response = await fetch(API_BASE + '/api/r2-presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originalName: file.name, contentType: file.type }),
        signal: AbortSignal.timeout(20000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.uploadUrl || !data.publicUrl) {
        throw new Error(data.error || '无法获取上传链接（HTTP ' + response.status + '）');
    }
    return data;
}

export function uploadToR2(url, file, onProgress) {
    return new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open('PUT', url);
        request.timeout = 180000;
        request.setRequestHeader('Content-Type', file.type);
        request.upload.addEventListener('progress', event => {
            if (event.lengthComputable) onProgress(event.loaded / event.total);
        });
        request.onload = () => {
            if (request.status >= 200 && request.status < 300) resolve();
            else reject(new Error('上传失败（HTTP ' + request.status + '）'));
        };
        request.onerror = () => reject(new Error('上传连接中断，请重试'));
        request.ontimeout = () => reject(new Error('上传超时，请重试'));
        request.send(file);
    });
}
