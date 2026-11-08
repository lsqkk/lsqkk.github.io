import { openHandoff } from '/assets/js/tool-handoff.mjs';
import { loadScript } from '/assets/js/load-script.mjs';

const get = id => document.getElementById(id);
const fileInput = get('fileInput');
const dropArea = get('dropArea');
const previews = get('imagePreviews');
const recognize = get('recognizeBtn');
const result = get('resultText');
const progress = get('progressBar');
const status = get('statusText');
const pageSelect = get('ocrPage');
const threshold = get('ocrThreshold');
const source = get('ocrSourceImage');
const mark = get('ocrSourceMark');
const detail = get('ocrDetail');
const reviewStatus = get('ocrReviewStatus');
const handoff = get('ocrHandoff');
const copy = get('copyBtn');
const download = get('exportBtn');
const items = new Map();
let pages = [];
let suspects = [];
let current = 0;
let busy = false;
let originalResult = '';

let sortable;
const sorter = 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js';
const engine = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

function addHandle(item) {
    const handle = document.createElement('button');
    handle.className = 'drag-handle';
    handle.type = 'button';
    handle.title = '拖动排序';
    handle.textContent = '↔';
    item.append(handle);
}

function report(message) {
    get('progressContainer').style.display = 'block';
    status.textContent = message;
}

function refreshActions() {
    recognize.disabled = busy || !items.size;
    recognize.textContent = busy ? '识别中…' : '开始识别';
    for (const control of [get('clearBtn'), get('selectBtn'), get('ocrSample'), get('language'),
        ...previews.querySelectorAll('button')]) control.disabled = busy;
    sortable?.option('disabled', busy);
    result.readOnly = busy || !pages.length;
    get('ocrLocate').disabled = busy || !suspects[current];
    copy.disabled = download.disabled = handoff.disabled = !result.value.trim();
}

function clearReview() {
    pages = [];
    suspects = [];
    originalResult = '';
    pageSelect.replaceChildren();
    source.removeAttribute('src');
    get('ocrReview').hidden = true;
}

function addImages(files) {
    if (busy) return;
    for (const file of files.filter(file => file.type.startsWith('image/'))) {
        const id = crypto.randomUUID();
        const url = URL.createObjectURL(file);
        const item = document.createElement('div');
        item.className = 'image-preview-item';
        item.dataset.id = id;
        const image = new Image();
        image.alt = file.name;
        image.src = url;
        const remove = document.createElement('button');
        remove.className = 'remove-btn';
        remove.type = 'button';
        remove.textContent = '×';
        remove.setAttribute('aria-label', '移除 ' + file.name);
        remove.onclick = () => {
            if (busy) return;
            // Recognized pages keep their source until the results are replaced.
            if (!pages.some(page => page.url === url)) URL.revokeObjectURL(url);
            items.delete(id);
            item.remove();
            refreshActions();
        };
        item.append(image, remove);
        if (sortable) addHandle(item);
        items.set(id, { image, url, name: file.name });
        previews.append(item);
    }
    refreshActions();
    if (items.size > 1 && !sortable) {
        void loadScript(sorter, 'Sortable').then(() => {
            if (sortable) return;
            sortable = new window.Sortable(previews, { animation: 150, handle: '.drag-handle' });
            for (const item of previews.children) addHandle(item);
            refreshActions();
        }).catch(() => {});
    }
}

function releaseDetachedPages() {
    const queued = new Set([...items.values()].map(item => item.url));
    for (const page of pages) {
        if (!queued.has(page.url)) URL.revokeObjectURL(page.url);
    }
}

get('selectBtn').onclick = () => fileInput.click();
fileInput.onchange = () => {
    addImages([...fileInput.files]);
    fileInput.value = '';
};
dropArea.ondragover = event => event.preventDefault();
dropArea.ondrop = event => {
    event.preventDefault();
    addImages([...event.dataTransfer.files]);
};
document.addEventListener('paste', event => {
    if (busy) return;
    const images = [...event.clipboardData.files].filter(file => file.type.startsWith('image/'));
    if (images.length) {
        event.preventDefault();
        addImages(images);
    }
});

get('ocrSample').onclick = async () => {
    const button = get('ocrSample');
    button.disabled = true;
    try {
        const response = await fetch('/assets/pages/tool/ocr/sample.svg');
        if (!response.ok) throw new Error();
        const blob = await response.blob();
        if (!busy) {
            get('language').value = 'eng';
            addImages([new File([blob], '示例.svg', { type: 'image/svg+xml' })]);
        }
    } catch {
        if (!busy) report('示例加载失败，请重试或选择自己的图片。');
    } finally {
        refreshActions();
    }
};

function normalizeImage(image) {
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 3600 / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
}

function appendPage(item, canvas, data) {
    const raw = data.text.trim();
    const offset = originalResult.length ? originalResult.length + 2 : 0;
    if (raw) originalResult += (originalResult ? '\n\n' : '') + raw;
    let cursor = 0;
    const words = [];
    for (const { text, confidence, bbox } of data.words || []) {
        if (!text.trim() || !bbox || !Object.values(bbox).every(Number.isFinite) ||
            bbox.x1 <= bbox.x0 || bbox.y1 <= bbox.y0 || !Number.isFinite(confidence)) continue;
        const index = raw.indexOf(text, cursor);
        if (index !== -1) cursor = index + text.length;
        words.push({ text, confidence, bbox, offset: index === -1 ? -1 : offset + index });
    }
    const page = { ...item, width: canvas.width, height: canvas.height, words };
    pageSelect.add(new Option((pages.length + 1) + ' · ' + item.name, pages.length));
    pages.push(page);
    result.value = originalResult;
    get('ocrReview').hidden = false;
    if (pages.length === 1) showPage();
    refreshActions();
}

async function createWorker(language, logger) {
    let rejectStartup;
    const startupFailure = new Promise((_, reject) => { rejectStartup = reject; });
    const pending = window.Tesseract.createWorker(language, 1, {
        logger,
        errorHandler: error => rejectStartup?.(new Error(String(error)))
    });
    const timeout = setTimeout(() => rejectStartup(new Error('OCR engine startup timed out')), 90000);
    try {
        return await Promise.race([pending, startupFailure]);
    } catch (error) {
        void pending.then(worker => worker.terminate()).catch(() => {});
        throw error;
    } finally {
        clearTimeout(timeout);
        rejectStartup = null;
    }
}

recognize.onclick = async () => {
    const queue = [...previews.children].map(item => items.get(item.dataset.id));
    if (busy || !queue.length) return;
    busy = true;
    refreshActions();
    const language = get('language').value;
    let worker;
    let index = 0;
    let failures = 0;
    try {
        report('正在加载识别引擎和语言模型…');
        progress.style.width = '0%';
        await loadScript(engine, 'Tesseract');
        worker = await createWorker(language, event => {
            if (event.status === 'recognizing text') {
                progress.style.width = (100 * (index + event.progress) / queue.length) + '%';
                report('识别第 ' + (index + 1) + ' / ' + queue.length + ' 张 · ' + Math.round(event.progress * 100) + '%');
            }
        });
        for (const [position, item] of queue.entries()) {
            index = position;
            try {
                await item.image.decode();
                const canvas = normalizeImage(item.image);
                const { data } = await worker.recognize(canvas, {}, { blocks: true, text: true });
                if (failures === position) {
                    releaseDetachedPages();
                    clearReview();
                }
                appendPage(item, canvas, data);
            } catch (error) {
                console.error(error);
                failures++;
            }
        }
        progress.style.width = '100%';
        report('识别完成 · 成功 ' + (queue.length - failures) + ' 张' + (failures ? '，失败 ' + failures + ' 张。' : '。'));
    } catch (error) {
        console.error(error);
        report('识别引擎暂未就绪，图片仍在，可以检查网络后重试。');
    } finally {
        busy = false;
        refreshActions();
        await worker?.terminate().catch(console.error);
    }
};

function showPage() {
    const page = pages[Number(pageSelect.value)];
    source.src = page.url;
    suspects = page.words.filter(word => word.confidence < Number(threshold.value))
        .sort((a, b) => a.confidence - b.confidence);
    current = 0;
    showWord();
}

function showWord() {
    const word = suspects[current];
    get('ocrPrev').disabled = current <= 0;
    get('ocrNext').disabled = current >= suspects.length - 1;
    get('ocrLocate').disabled = busy || !word;
    mark.hidden = detail.hidden = !word;
    if (!word) {
        reviewStatus.textContent = '这一页没有低于当前阈值的词。可以调高阈值，或继续检查整页。';
        return;
    }
    const page = pages[Number(pageSelect.value)];
    const { x0, y0, x1, y1 } = word.bbox;
    mark.style.left = (100 * x0 / page.width) + '%';
    mark.style.top = (100 * y0 / page.height) + '%';
    mark.style.width = (100 * (x1 - x0) / page.width) + '%';
    mark.style.height = (100 * (y1 - y0) / page.height) + '%';

    const scaleX = page.image.naturalWidth / page.width;
    const scaleY = page.image.naturalHeight / page.height;
    const pad = Math.max(8, y1 - y0);
    const left = Math.max(0, x0 - pad);
    const top = Math.max(0, y0 - pad / 2);
    const width = Math.min(page.width, x1 + pad) - left;
    const height = Math.min(page.height, y1 + pad / 2) - top;
    const zoom = Math.min(3, 460 / width, 160 / height);
    detail.width = Math.max(1, Math.round(width * zoom));
    detail.height = Math.max(1, Math.round(height * zoom));
    const context = detail.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, detail.width, detail.height);
    context.drawImage(page.image, left * scaleX, top * scaleY, width * scaleX, height * scaleY,
        0, 0, detail.width, detail.height);
    context.strokeStyle = '#cf3c15';
    context.lineWidth = 2;
    context.strokeRect((x0 - left) * zoom, (y0 - top) * zoom, (x1 - x0) * zoom, (y1 - y0) * zoom);
    reviewStatus.textContent = '第 ' + (current + 1) + ' / ' + suspects.length + ' 处 · 「' + word.text +
        '」 · 置信度 ' + Math.round(word.confidence);
}

pageSelect.onchange = threshold.onchange = showPage;
get('ocrPrev').onclick = () => { current--; showWord(); };
get('ocrNext').onclick = () => { current++; showWord(); };
get('ocrLocate').onclick = () => {
    const word = suspects[current];
    if (busy || !word) return;
    let offset = word.offset;
    if (result.value !== originalResult || offset === -1) {
        const first = result.value.indexOf(word.text);
        offset = first === result.value.lastIndexOf(word.text) ? first : -1;
    }
    if (offset < 0) {
        reviewStatus.textContent = '结果中无法唯一定位「' + word.text + '」，可以对照原图手动修改。';
        return;
    }
    result.focus();
    result.setSelectionRange(offset, offset + word.text.length);
};

result.oninput = refreshActions;
handoff.onclick = () => openHandoff(handoff, 'editor', 'OCR 识别结果', result.value);
copy.onclick = async () => {
    try {
        await navigator.clipboard.writeText(result.value);
        report('已复制识别结果。');
    } catch {
        result.select();
        report('文字已选中，可以手动复制。');
    }
};
download.onclick = () => {
    const url = URL.createObjectURL(new Blob([result.value], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ocr_result.txt';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};
get('clearBtn').onclick = () => {
    releaseDetachedPages();
    for (const item of items.values()) URL.revokeObjectURL(item.url);
    items.clear();
    clearReview();
    previews.replaceChildren();
    result.value = '';
    get('progressContainer').style.display = 'none';
    refreshActions();
};
get('moreToolsBtn').onclick = () => window.location.assign('/tool/');
get('currentYear').textContent = new Date().getFullYear();
refreshActions();
