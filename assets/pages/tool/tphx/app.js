const byId = (id) => document.getElementById(id);
const form = byId('settings');
const method = byId('method');
const iterations = byId('iterations');
const seed = byId('seed');
const recipe = byId('recipe');
const source = byId('source-img');
const result = byId('display-img');
const picker = byId('ipt');
const drop = byId('drop-area');
const status = byId('status');
const methods = {
    gilbert: '沿空间曲线移动像素。可还原旧版结果，旧 JPEG 中已有的压缩痕迹会保留。',
    lattice: '分别重排行与列，在结果中保留交织的纹理。还原时输入同一个种子。',
    pixels: '用种子重排每一个像素。适合获得颗粒化的视觉效果。'
};
let inputBlob;
let decodedSource;
let outputBlob;
let sourceUrl;
let resultUrl;
let worker;
let busy = false;
let loadGeneration = 0;

function announce(message, error = false) {
    status.textContent = message;
    status.dataset.error = String(error);
}

function updateButtons() {
    byId('enc').disabled = byId('dec').disabled = busy || !inputBlob;
    byId('reuse').disabled = busy || !outputBlob;
    byId('download').disabled = !outputBlob;
    form.setAttribute('aria-busy', String(busy));
}

function updateMethod() {
    const legacy = method.value === 'gilbert';
    byId('rounds-field').hidden = !legacy;
    iterations.disabled = !legacy;
    byId('seed-field').hidden = legacy;
    byId('method-help').textContent = methods[method.value];
}

function getSettings() {
    if (method.value === 'gilbert') {
        const rounds = iterations.valueAsNumber;
        if (!Number.isInteger(rounds) || rounds < 1 || rounds > 10) throw new Error('混淆次数须为 1 到 10 的整数。');
        return { method: method.value, rounds };
    }
    const value = seed.value.trim();
    if (!value) throw new Error('请输入种子，或点击「随机」生成一个。');
    return { method: method.value, seed: value };
}

function clearResult() {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    result.removeAttribute('src');
    result.hidden = true;
    outputBlob = resultUrl = null;
    byId('result-kind').textContent = '';
}

async function loadImage(blob) {
    if (busy) return;
    if (!blob.type.startsWith('image/')) {
        announce('请选择浏览器支持的图片文件。', true);
        return;
    }
    const generation = ++loadGeneration;
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.src = url;
    try {
        await image.decode();
        if (generation !== loadGeneration) return;
        if (image.naturalWidth * image.naturalHeight > 12000000) throw new Error('图片超过 1200 万像素，请缩小后重试。');
        if (sourceUrl) URL.revokeObjectURL(sourceUrl);
        clearResult();
        inputBlob = blob;
        decodedSource = image;
        sourceUrl = url;
        source.src = url;
        source.hidden = false;
        byId('image-size').textContent = image.naturalWidth + ' × ' + image.naturalHeight;
        announce('已载入图片。');
        updateButtons();
    } catch (error) {
        if (generation === loadGeneration) announce(error.name === 'EncodingError' ? '图片无法解码，请换一张。' : error.message, true);
    } finally {
        if (url !== sourceUrl) URL.revokeObjectURL(url);
    }
}

function runTransform(pixels, width, height, settings) {
    return new Promise((resolve, reject) => {
        worker ||= new Worker(new URL('./worker.mjs', import.meta.url), { type: 'module' });
        worker.onmessage = ({ data }) => {
            if (data.error) reject(new Error(data.error));
            else resolve(data.result);
        };
        worker.onerror = () => {
            worker.terminate();
            worker = null;
            reject(new Error('图片处理进程无法运行。'));
        };
        worker.postMessage({ pixels, width, height, settings }, [pixels]);
    });
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || !inputBlob || !event.submitter) return;
    let settings;
    try { settings = getSettings(); }
    catch (error) { announce(error.message, true); return; }
    const reverse = event.submitter.value === 'decode';
    loadGeneration++;
    busy = true;
    clearResult();
    updateButtons();
    announce(reverse ? '正在还原…' : '正在混淆…');
    try {
        const canvas = document.createElement('canvas');
        const width = canvas.width = decodedSource.naturalWidth;
        const height = canvas.height = decodedSource.naturalHeight;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(decodedSource, 0, 0);
        const pixels = context.getImageData(0, 0, width, height).data.buffer;
        const buffer = await runTransform(pixels, width, height, { ...settings, reverse });
        context.putImageData(new ImageData(new Uint8ClampedArray(buffer), width, height), 0, 0);
        outputBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (!outputBlob) throw new Error('生成 PNG 失败。');
        resultUrl = URL.createObjectURL(outputBlob);
        result.src = resultUrl;
        result.hidden = false;
        byId('result-kind').textContent = reverse ? '已还原' : '已混淆';
        announce('处理完成，可以下载 PNG。');
    } catch (error) {
        clearResult();
        announce(error.message, true);
    } finally {
        busy = false;
        updateButtons();
    }
});

picker.addEventListener('change', () => {
    if (picker.files[0]) void loadImage(picker.files[0]);
    picker.value = '';
});
drop.addEventListener('dragover', (event) => {
    event.preventDefault();
    drop.classList.add('active');
});
drop.addEventListener('dragleave', () => drop.classList.remove('active'));
drop.addEventListener('drop', (event) => {
    event.preventDefault();
    drop.classList.remove('active');
    if (event.dataTransfer.files[0]) void loadImage(event.dataTransfer.files[0]);
});
document.addEventListener('paste', (event) => {
    const image = Array.from(event.clipboardData?.files || []).find((file) => file.type.startsWith('image/'));
    if (!image) return;
    event.preventDefault();
    void loadImage(image);
});
byId('reuse').addEventListener('click', () => {
    if (outputBlob) void loadImage(outputBlob);
});
byId('download').addEventListener('click', () => {
    if (!resultUrl) return;
    const link = document.createElement('a');
    link.href = resultUrl;
    link.download = (byId('result-kind').textContent === '已还原' ? 'restored-' : 'scrambled-') + Date.now() + '.png';
    link.click();
});
method.addEventListener('change', updateMethod);
byId('random').addEventListener('click', () => {
    seed.value = Array.from(crypto.getRandomValues(new Uint8Array(8)), (byte) => byte.toString(16).padStart(2, '0')).join('');
});
byId('copy-recipe').addEventListener('click', async () => {
    try {
        recipe.value = JSON.stringify({ version: 1, ...getSettings() });
    } catch (error) {
        announce(error.message, true);
        return;
    }
    try {
        await navigator.clipboard.writeText(recipe.value);
        announce('参数码已复制。');
    } catch {
        recipe.select();
        announce('参数码已选中，可手动复制。');
    }
});
byId('import-recipe').addEventListener('click', () => {
    try {
        const data = JSON.parse(recipe.value);
        if (data?.version !== 1 || !Object.hasOwn(methods, data.method)) throw new Error();
        if (data.method === 'gilbert') {
            if (!Number.isInteger(data.rounds) || data.rounds < 1 || data.rounds > 10) throw new Error();
            iterations.value = String(data.rounds);
        } else {
            if (typeof data.seed !== 'string' || !data.seed.trim() || data.seed.length > 80) throw new Error();
            seed.value = data.seed;
        }
        method.value = data.method;
        updateMethod();
        announce('参数已应用。');
    } catch {
        announce('参数码格式或内容无效。', true);
    }
});

function applyTheme() {
    const theme = window.QuarkUserPreferences?.get()?.theme;
    if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
}
window.addEventListener('quark-preferences-updated', applyTheme);
window.addEventListener('storage', applyTheme);
document.addEventListener('DOMContentLoaded', applyTheme);
updateMethod();
