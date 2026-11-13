import { formatSize, httpUrl, imageDimensions, imageType, importImage, prepareImage, shareCode } from './images.mjs';
import { isLoggedUser, presign, readQuota, reserveQuota, uploadToR2 } from './upload.mjs';

const elements = Object.fromEntries(Array.from(document.querySelectorAll('#picApp [id]'), el => [el.id, el]));
const {
    fileInput, pickBtn, dropZone, fileList, statusText, progressBar, uploadBtn, clearBtn, cancelBtn,
    urlForm, urlInput, urlBtn, uploadOptions, resetOptions, sizeOption, formatOption, qualityOption,
    qualitySetting, qualityValue, optionHint, limitText, quotaMeter, picLoginTip, queueCount,
    historyCount, historyHint, historyEmpty, emptyTitle, emptyText, historyGrid, historySearch,
    historySort, favoritesBtn, libraryTools, libraryStatus, shareFormat, selectVisible, downloadLinks,
    copyLinks, clearHistory, previewDialog, closePreview, previewImage, previewTitle, previewMeta,
    previewDetails, previewError, previewCode, previewStatus, altInput, saveAlt, copyPreview, openOriginal,
    recentBatch, recentStatus, copyRecent
} = elements;

const MAX_QUEUE = 100;
const MAX_HISTORY = 200;
const HISTORY_KEY = 'quark_pic_history_v1';
const SETTINGS_KEY = 'quark_pic_settings_v1';
const queue = [];
const selected = new Set();
const dateFormat = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });
let activeBatch;
let recentRecords = [];
let activePreview;
let importing = false;
let favoritesOnly = false;
let visibleHistory = [];
let storageAvailable = true;
let history = loadHistory();
let quotaReadVersion = 0;

function loadHistory() {
    try {
        const items = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
        return items.filter(item => typeof item?.originalName === 'string' && typeof item.publicUrl === 'string'
            && httpUrl(item.publicUrl) && (item.alt == null || typeof item.alt === 'string')
            && Number.isFinite(item.uploadedAt) && Math.abs(item.uploadedAt) <= 8.64e15
            && Number.isFinite(item.size)).slice(0, MAX_HISTORY);
    } catch {
        return [];
    }
}

function updateHistory(update) {
    history = update(storageAvailable ? loadHistory() : history).slice(0, MAX_HISTORY);
    try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
        storageAvailable = true;
    } catch {
        storageAvailable = false;
    }
    renderLibrary();
}

function readOptions() {
    return { maxSide: Number(sizeOption.value), format: formatOption.value, quality: Number(qualityOption.value) };
}

function updateOptions(persist = true) {
    const { maxSide, format, quality } = readOptions();
    qualitySetting.hidden = !['image/webp', 'image/jpeg'].includes(format) && !(maxSide && format === 'original');
    qualityValue.value = quality + '%';
    optionHint.textContent = maxSide || format !== 'original'
        ? '在浏览器处理。动画和 SVG 会保留原样，JPEG 的透明区域会填充白色。'
        : '默认原样上传。调整尺寸或格式时，浏览器会重新编码支持的静态图片。';
    if (persist) {
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify({ maxSide, format, quality, share: shareFormat.value }));
        } catch { /* Settings remain available in this tab. */ }
    }
}

function restoreOptions() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
        for (const [control, value] of [[sizeOption, saved.maxSide], [formatOption, saved.format], [shareFormat, saved.share]]) {
            if (Array.from(control.options).some(option => option.value === String(value))) control.value = value;
        }
        if (Number.isFinite(saved.quality)) qualityOption.value = saved.quality;
    } catch { /* Use the defaults. */ }
    updateOptions(false);
}

function makeElement(tag, className, content) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (content != null) element.textContent = content;
    return element;
}

function action(label, click, quiet = false) {
    const button = makeElement('button', quiet ? 'pic-button pic-quiet' : 'pic-button', label);
    button.type = 'button';
    button.addEventListener('click', click);
    return button;
}

function thumbnail(item, source, open) {
    const button = makeElement('button', 'pic-thumb');
    button.type = 'button';
    button.setAttribute('aria-label', '预览 ' + item.originalName);
    const fallback = makeElement('span', '', '图片');
    const img = makeElement('img');
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('load', () => { fallback.hidden = true; });
    img.addEventListener('error', () => { img.hidden = true; });
    img.src = source;
    button.append(fallback, img);
    button.addEventListener('click', open);
    return button;
}

function details(item) {
    return [item.width && item.height ? item.width + ' × ' + item.height : '', formatSize(item.size)]
        .filter(Boolean).join(' · ');
}

function setStatus(message) {
    statusText.textContent = message;
}

function addFiles(files) {
    let added = 0;
    let duplicates = 0;
    let rejected = 0;
    let overflow = 0;
    for (const file of files) {
        const type = imageType(file);
        if (!type || !file.size) {
            rejected++;
            continue;
        }
        const signature = JSON.stringify([file.name, file.size, file.lastModified, type]);
        if (queue.some(entry => entry.signature === signature)) {
            duplicates++;
            continue;
        }
        if (queue.length >= MAX_QUEUE) {
            overflow++;
            continue;
        }
        const source = type === file.type ? file : new File([file], file.name, { type, lastModified: file.lastModified });
        const entry = {
            file: source, signature, originalName: file.name, size: file.size,
            previewUrl: URL.createObjectURL(source), state: 'waiting', progress: 0
        };
        queue.push(entry);
        added++;
        imageDimensions(entry.previewUrl).then(([width, height]) => {
            entry.width = width;
            entry.height = height;
            if (entry.row) entry.meta.textContent = details(entry);
        });
    }
    renderQueue();
    const messages = [];
    if (added) messages.push('已添加 ' + added + ' 张图片');
    if (duplicates) messages.push('跳过 ' + duplicates + ' 张已在队列的图片');
    if (rejected) messages.push(rejected + ' 个文件为空或格式无法识别');
    if (overflow) messages.push('队列最多 ' + MAX_QUEUE + ' 张，' + overflow + ' 张未添加');
    if (messages.length) setStatus(messages.join('，'));
    return added;
}

function renderQueueRow(entry) {
    if (!entry.row) {
        entry.row = makeElement('li', 'pic-queue-row');
        const content = makeElement('div');
        const title = makeElement('span', 'pic-queue-title', entry.originalName);
        title.title = entry.originalName;
        entry.meta = makeElement('span', 'pic-queue-meta');
        entry.status = makeElement('span', 'pic-row-status');
        content.append(title, entry.meta, entry.status);
        const actions = makeElement('div', 'pic-actions');
        entry.retry = action('重试', () => startBatch([entry]));
        entry.remove = action('移除', () => {
            const index = queue.indexOf(entry);
            removeEntry(entry);
            renderQueue();
            setStatus('已移除 ' + entry.originalName);
            (queue[index] || queue[index - 1])?.remove.focus();
            if (!queue.length) pickBtn.focus();
        }, true);
        entry.remove.setAttribute('aria-label', '移除 ' + entry.originalName);
        entry.retry.setAttribute('aria-label', '重试 ' + entry.originalName);
        actions.append(entry.retry, entry.remove);
        entry.row.append(thumbnail(entry, entry.previewUrl, () => showPreview(entry)), content, actions);
        fileList.append(entry.row);
    }
    entry.meta.textContent = details(entry);
    entry.status.dataset.state = entry.state;
    entry.status.textContent = {
        waiting: '待上传',
        preparing: '正在准备…',
        uploading: '正在上传 ' + Math.round(entry.progress * 100) + '%',
        done: entry.preserved ? '已上传 · 已保留原图' : '已上传',
        failed: entry.error
    }[entry.state];
    entry.retry.hidden = entry.state !== 'failed';
    entry.retry.disabled = importing || Boolean(activeBatch);
    entry.remove.disabled = Boolean(activeBatch);
}

function renderQueue() {
    for (const entry of queue) renderQueueRow(entry);
    fileList.hidden = !queue.length;
    const pending = queue.filter(entry => entry.state !== 'done').length;
    queueCount.textContent = queue.length ? queue.length + ' 张 · ' + pending + ' 张待完成' : '队列为空';
    uploadBtn.textContent = activeBatch ? '上传中…' : pending ? '上传 ' + pending + ' 张' : '开始上传';
    uploadBtn.disabled = importing || Boolean(activeBatch) || !pending;
    clearBtn.hidden = !queue.length || Boolean(activeBatch);
    cancelBtn.hidden = !activeBatch;
    cancelBtn.disabled = Boolean(activeBatch?.stopped);
    pickBtn.disabled = Boolean(activeBatch);
    urlBtn.disabled = importing || Boolean(activeBatch);
    uploadOptions.disabled = resetOptions.disabled = Boolean(activeBatch);
}

function renderRecent() {
    const labels = { url: '直链', markdown: 'Markdown', html: 'HTML', bbcode: 'BBCode' };
    recentBatch.hidden = !recentRecords.length;
    recentStatus.textContent = '本批已生成 ' + recentRecords.length + ' 张图片的链接';
    copyRecent.textContent = '复制本批 ' + labels[shareFormat.value];
}

function removeEntry(entry) {
    queue.splice(queue.indexOf(entry), 1);
    URL.revokeObjectURL(entry.previewUrl);
    entry.row.remove();
}

async function refreshQuota() {
    const version = ++quotaReadVersion;
    picLoginTip.hidden = isLoggedUser();
    try {
        const { exempt, used, limit } = await readQuota();
        if (version !== quotaReadVersion) return;
        quotaMeter.hidden = Boolean(exempt);
        if (exempt) limitText.textContent = '不限额';
        else {
            limitText.textContent = '剩余 ' + Math.max(0, limit - used) + ' / ' + limit + ' 张';
            quotaMeter.max = limit;
            quotaMeter.value = used;
        }
    } catch {
        if (version !== quotaReadVersion) return;
        quotaMeter.hidden = true;
        limitText.textContent = '暂不可用';
    }
}

function renderProgress(batch) {
    const total = batch.entries.reduce((sum, entry) => sum + entry.progress, 0);
    progressBar.value = Math.round(total / batch.entries.length * 100);
}

async function uploadEntry(entry, batch) {
    entry.state = 'preparing';
    renderQueueRow(entry);
    try {
        const output = await prepareImage(entry, batch.options);
        if (batch.stopped) {
            entry.state = 'waiting';
            return;
        }
        const signed = await presign(output.file);
        const publicUrl = httpUrl(signed.publicUrl);
        const uploadUrl = httpUrl(signed.uploadUrl);
        if (!publicUrl || !uploadUrl) throw new Error('服务器返回了无效的上传链接');
        if (batch.stopped) {
            entry.state = 'waiting';
            return;
        }
        entry.state = 'uploading';
        renderQueueRow(entry);
        await uploadToR2(uploadUrl, output.file, fraction => {
            // Reserve 100% for a successful server response.
            entry.progress = Math.min(0.99, fraction);
            renderQueueRow(entry);
            renderProgress(batch);
        });
        entry.state = 'done';
        entry.preserved = output.preserved;
        batch.success++;
        const record = {
            publicUrl, originalName: entry.originalName, size: output.file.size,
            width: output.width || 0, height: output.height || 0, uploadedAt: Date.now()
        };
        batch.records[batch.entries.indexOf(entry)] = record;
        updateHistory(items => [record, ...items.filter(item => item.publicUrl !== publicUrl)]);
    } catch (error) {
        if (batch.stopped && entry.state !== 'uploading') {
            entry.state = 'waiting';
            return;
        }
        entry.state = 'failed';
        entry.error = error.message || '上传失败，请重试';
        batch.failed++;
    } finally {
        if (entry.state !== 'waiting') entry.progress = 1;
        renderQueueRow(entry);
        renderProgress(batch);
    }
}

async function startBatch(entries) {
    if (activeBatch || importing || !entries.length) return;
    const batch = { entries, options: readOptions(), stopped: false, success: 0, failed: 0, next: 0, records: [] };
    activeBatch = batch;
    for (const entry of entries) entry.progress = 0;
    progressBar.value = 0;
    progressBar.hidden = false;
    renderQueue();
    setStatus('正在确认上传额度…');

    let refund;
    try {
        refund = await reserveQuota(entries.length);
        if (!batch.stopped) setStatus('正在上传 ' + entries.length + ' 张图片…');
        const worker = async () => {
            while (!batch.stopped && batch.next < entries.length) {
                const entry = entries[batch.next++];
                await uploadEntry(entry, batch);
            }
        };
        await Promise.all(Array.from({ length: Math.min(3, entries.length) }, worker));
        if (batch.success) {
            recentRecords = batch.records.filter(Boolean);
            renderRecent();
        }
        const remaining = entries.length - batch.success - batch.failed;
        const summary = '成功 ' + batch.success + ' 张，失败 ' + batch.failed + ' 张';
        setStatus(batch.stopped ? '已停止 · ' + summary + '，' + remaining + ' 张待上传' : '上传完成 · ' + summary);
    } catch (error) {
        progressBar.hidden = true;
        setStatus(error.message || '暂时无法上传，请重试');
    } finally {
        try {
            if (refund) await refund(entries.length - batch.success);
        } catch {
            statusText.textContent += '。未用额度暂未退回。';
        }
        activeBatch = undefined;
        renderQueue();
        void refreshQuota();
    }
}

function renderLibraryActions() {
    const visibleSelected = visibleHistory.filter(item => selected.has(item.publicUrl)).length;
    const all = visibleHistory.length > 0 && visibleSelected === visibleHistory.length;
    selectVisible.textContent = all ? '取消全选' : '全选';
    copyLinks.textContent = selected.size ? '复制所选（' + selected.size + '）' : '复制全部';
    copyLinks.disabled = downloadLinks.disabled = !selected.size && !visibleHistory.length;
    selectVisible.disabled = !visibleHistory.length;
}

function renderLibrary() {
    for (const url of selected) {
        if (!history.some(item => item.publicUrl === url)) selected.delete(url);
    }
    const query = historySearch.value.trim().toLocaleLowerCase();
    visibleHistory = history.filter(item => (!favoritesOnly || item.favorite)
        && (!query || [item.originalName, item.alt || ''].some(value => value.toLocaleLowerCase().includes(query))));
    const sorts = {
        newest: (a, b) => b.uploadedAt - a.uploadedAt,
        oldest: (a, b) => a.uploadedAt - b.uploadedAt,
        name: (a, b) => a.originalName.localeCompare(b.originalName, 'zh-CN'),
        size: (a, b) => b.size - a.size
    };
    visibleHistory.sort(sorts[historySort.value]);

    historyCount.textContent = visibleHistory.length === history.length
        ? history.length + ' 张' : visibleHistory.length + ' / ' + history.length + ' 张';
    historyHint.textContent = storageAvailable
        ? '最近 200 条记录保存在当前浏览器，移除记录不会删除云端图片。'
        : '当前浏览器无法保存历史，记录仅在此页面保留。';
    libraryTools.hidden = clearHistory.hidden = !history.length;
    historyEmpty.hidden = Boolean(visibleHistory.length);
    historyGrid.hidden = !visibleHistory.length;
    emptyTitle.textContent = history.length ? '没有匹配的图片' : '暂无上传记录';
    emptyText.textContent = history.length ? '试试其他关键词或关闭收藏筛选。' : '成功上传后，可在这里预览、收藏或复制链接。';
    historyGrid.replaceChildren(...visibleHistory.map(historyCard));
    renderLibraryActions();
}

function historyCard(item) {
    const card = makeElement('li', 'pic-card');
    const preview = makeElement('div', 'pic-card-preview');
    const checkbox = makeElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = selected.has(item.publicUrl);
    checkbox.setAttribute('aria-label', '选择 ' + item.originalName);
    checkbox.addEventListener('change', () => {
        if (checkbox.checked) selected.add(item.publicUrl);
        else selected.delete(item.publicUrl);
        renderLibraryActions();
    });
    preview.append(thumbnail(item, item.publicUrl, () => showPreview(item)), checkbox);

    const body = makeElement('div', 'pic-card-body');
    const title = makeElement('span', 'pic-card-name', item.originalName);
    title.title = item.originalName;
    const info = makeElement('span', 'pic-card-meta', details(item));
    const date = makeElement('span', 'pic-card-meta', dateFormat.format(item.uploadedAt));
    const actions = makeElement('div', 'pic-actions');
    const favorite = action(item.favorite ? '已收藏' : '收藏', () => {
        updateHistory(items => items.map(record => record.publicUrl === item.publicUrl
            ? { ...record, favorite: !record.favorite } : record));
        (Array.from(historyGrid.children).find(node => node.dataset.url === item.publicUrl)
            ?.querySelector('[aria-pressed]') || favoritesBtn).focus();
    });
    favorite.setAttribute('aria-pressed', String(Boolean(item.favorite)));
    const copy = action('复制', () => copyContent(shareCode(item, shareFormat.value), libraryMessage));
    const remove = action('移除', () => {
        updateHistory(items => items.filter(record => record.publicUrl !== item.publicUrl));
        libraryMessage('已移除本机记录');
        (historyGrid.querySelector('button') || pickBtn).focus();
    }, true);
    remove.title = '移除本机记录';
    actions.append(copy, favorite, remove);
    body.append(title, info, date, actions);
    card.dataset.url = item.publicUrl;
    card.append(preview, body);
    return card;
}

function libraryMessage(message) {
    libraryStatus.hidden = false;
    libraryStatus.textContent = message;
}

function showPreview(item) {
    activePreview = item;
    previewTitle.textContent = item.originalName;
    previewMeta.textContent = details(item);
    previewDetails.hidden = !item.publicUrl;
    previewStatus.textContent = '';
    previewError.hidden = true;
    previewImage.hidden = false;
    previewImage.alt = item.alt ?? item.originalName;
    previewImage.referrerPolicy = 'no-referrer';
    previewImage.src = item.publicUrl || item.previewUrl;
    if (item.publicUrl) {
        altInput.value = item.alt ?? item.originalName;
        openOriginal.href = item.publicUrl;
        previewCode.value = shareCode(item, shareFormat.value);
    }
    previewDialog.showModal();
}

async function copyContent(value, report, field) {
    try {
        await navigator.clipboard.writeText(value);
        report('已复制到剪贴板');
    } catch {
        if (field) {
            field.select();
            report('无法自动复制，已选中内容，可手动复制');
        } else {
            report('无法访问剪贴板，可导出 TXT，或在图片预览中手动复制');
        }
    }
}

function batchCodes() {
    const items = selected.size ? history.filter(item => selected.has(item.publicUrl)) : visibleHistory;
    return items.map(item => shareCode(item, shareFormat.value)).join('\n');
}

function downloadText(value) {
    const anchor = makeElement('a');
    const url = URL.createObjectURL(new Blob([value + '\n'], { type: 'text/plain;charset=utf-8' }));
    anchor.href = url;
    anchor.download = 'quark-pic-' + shareFormat.value + '.txt';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    libraryMessage('已导出分享内容');
}

pickBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
    if (!activeBatch) addFiles(fileInput.files);
    fileInput.value = '';
});
let dragDepth = 0;
function isFileDrag(event) {
    return event.dataTransfer?.types.includes('Files');
}
document.addEventListener('dragenter', event => {
    if (!isFileDrag(event) || activeBatch || previewDialog.open) return;
    dragDepth++;
    dropZone.classList.add('is-dragging');
});
document.addEventListener('dragleave', event => {
    if (!isFileDrag(event)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) dropZone.classList.remove('is-dragging');
});
document.addEventListener('dragover', event => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = activeBatch || previewDialog.open ? 'none' : 'copy';
});
document.addEventListener('drop', event => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    dragDepth = 0;
    dropZone.classList.remove('is-dragging');
    if (!activeBatch && !previewDialog.open) addFiles(event.dataTransfer.files);
});
document.addEventListener('paste', event => {
    if (activeBatch || previewDialog.open || event.target.closest('input, textarea, [contenteditable]')) return;
    const files = Array.from(event.clipboardData?.files || []).filter(imageType);
    if (!files.length) return;
    event.preventDefault();
    addFiles(files);
});
urlForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (importing || activeBatch) return;
    importing = true;
    renderQueue();
    setStatus('正在读取图片网址…');
    try {
        const file = await importImage(urlInput.value);
        if (addFiles([file])) urlInput.value = '';
    } catch (error) {
        setStatus(error.name === 'TypeError'
            ? '无法读取该图片，请检查网址及来源站点的跨域权限'
            : error.message);
    } finally {
        importing = false;
        renderQueue();
    }
});
uploadOptions.addEventListener('input', () => updateOptions());
resetOptions.addEventListener('click', () => {
    sizeOption.value = '0';
    formatOption.value = 'original';
    qualityOption.value = '85';
    updateOptions();
});
uploadBtn.addEventListener('click', () => startBatch(queue.filter(entry => entry.state !== 'done')));
cancelBtn.addEventListener('click', () => {
    activeBatch.stopped = true;
    cancelBtn.disabled = true;
    setStatus('正在停止，已发送的图片会完成上传…');
});
clearBtn.addEventListener('click', () => {
    while (queue.length) removeEntry(queue[0]);
    progressBar.hidden = true;
    renderQueue();
    pickBtn.focus();
    setStatus('队列已清空');
});
historySearch.addEventListener('input', renderLibrary);
historySort.addEventListener('change', renderLibrary);
favoritesBtn.addEventListener('click', () => {
    favoritesOnly = !favoritesOnly;
    favoritesBtn.setAttribute('aria-pressed', String(favoritesOnly));
    renderLibrary();
});
shareFormat.addEventListener('change', () => {
    updateOptions();
    renderRecent();
});
selectVisible.addEventListener('click', () => {
    const allSelected = visibleHistory.every(item => selected.has(item.publicUrl));
    for (const card of historyGrid.children) {
        if (allSelected) selected.delete(card.dataset.url);
        else selected.add(card.dataset.url);
        card.querySelector('input').checked = !allSelected;
    }
    renderLibraryActions();
});
copyLinks.addEventListener('click', () => copyContent(batchCodes(), libraryMessage));
copyRecent.addEventListener('click', () => {
    const value = recentRecords.map(record => {
        const latest = history.find(item => item.publicUrl === record.publicUrl) || record;
        return shareCode(latest, shareFormat.value);
    }).join('\n');
    void copyContent(value, message => { recentStatus.textContent = message; });
});
downloadLinks.addEventListener('click', () => downloadText(batchCodes()));
clearHistory.addEventListener('click', () => {
    if (!window.confirm('清空当前浏览器的上传历史？云端图片仍可通过原链接访问。')) return;
    updateHistory(() => []);
    historySearch.value = '';
    favoritesOnly = false;
    favoritesBtn.setAttribute('aria-pressed', 'false');
    pickBtn.focus();
    libraryMessage('已清空本机上传历史');
});
closePreview.addEventListener('click', () => previewDialog.close());
previewDialog.addEventListener('click', event => {
    if (event.target !== previewDialog) return;
    const bounds = previewDialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right
        || event.clientY < bounds.top || event.clientY > bounds.bottom) previewDialog.close();
});
previewDialog.addEventListener('close', () => {
    activePreview = undefined;
    previewImage.removeAttribute('src');
});
previewImage.addEventListener('error', () => {
    if (!previewDialog.open) return;
    previewImage.hidden = true;
    previewError.hidden = false;
});
saveAlt.addEventListener('click', () => {
    const record = { ...activePreview, alt: altInput.value.trim() };
    updateHistory(items => items.map(item => item.publicUrl === record.publicUrl ? { ...item, alt: record.alt } : item));
    activePreview = record;
    previewImage.alt = record.alt;
    previewCode.value = shareCode(record, shareFormat.value);
    previewStatus.textContent = '已保存替代文字';
});
copyPreview.addEventListener('click', () => copyContent(previewCode.value, message => {
    previewStatus.textContent = message;
}, previewCode));
window.addEventListener('storage', event => {
    if (event.key === HISTORY_KEY && storageAvailable) {
        history = loadHistory();
        renderLibrary();
    }
});
window.addEventListener('pageshow', event => {
    if (event.persisted) void refreshQuota();
});

restoreOptions();
renderQueue();
renderLibrary();
void refreshQuota();
