const typesByExtension = {
    avif: 'image/avif', bmp: 'image/bmp', gif: 'image/gif', heic: 'image/heic',
    heif: 'image/heif', ico: 'image/x-icon', jpeg: 'image/jpeg', jpg: 'image/jpeg',
    jxl: 'image/jxl', png: 'image/png', svg: 'image/svg+xml', tif: 'image/tiff',
    tiff: 'image/tiff', webp: 'image/webp'
};
const extensions = Object.fromEntries(Object.entries(typesByExtension).map(([ext, type]) => [type, ext]));

export function imageType(file) {
    const type = file.type.toLowerCase();
    if (type.startsWith('image/')) return type;
    if (type && type !== 'application/octet-stream') return '';
    return typesByExtension[file.name.split('.').pop().toLowerCase()] || '';
}

export function formatSize(size) {
    if (size < 1024) return size + ' B';
    if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB';
    return (size / (1024 * 1024)).toFixed(2) + ' MB';
}

export function httpUrl(value) {
    try {
        const url = new URL(value);
        if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) return url.href;
    } catch {
        // Ignore malformed or unsupported URLs.
    }
    return '';
}

export async function importImage(value) {
    const url = httpUrl(value);
    if (!url) throw new Error('请输入 HTTP 或 HTTPS 图片网址');
    const response = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error('无法读取图片（HTTP ' + response.status + '）');

    const type = (response.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
    let name = new URL(response.url || url).pathname.split('/').pop() || '';
    try { name = decodeURIComponent(name); } catch { /* Keep the encoded name. */ }
    name = name.replace(/[\\/]/g, '_').replace(/[\u0000-\u001f\u007f]/g, '');
    const contentType = imageType({ name, type });
    if (!contentType) throw new Error('该网址未返回图片');
    if (!/\.[a-z0-9]{1,10}$/i.test(name)) name = (name || '网络图片') + '.' + (extensions[contentType] || 'img');

    const limit = 32 * 1024 * 1024;
    if (Number(response.headers.get('Content-Length')) > limit) throw new Error('网址导入上限为 32 MB');
    const reader = response.body.getReader();
    const parts = [];
    let size = 0;
    try {
        while (true) {
            const { done, value: chunk } = await reader.read();
            if (done) break;
            size += chunk.byteLength;
            if (size > limit) throw new Error('网址导入上限为 32 MB');
            parts.push(chunk);
        }
    } finally {
        await reader.cancel().catch(() => {});
    }
    if (!size) throw new Error('该网址返回了空文件');
    return new File(parts, name, { type: contentType });
}

function inspectImage(url) {
    const image = new Image();
    image.src = url;
    return image.decode().then(() => image);
}

export async function imageDimensions(url) {
    try {
        const image = await inspectImage(url);
        return [image.naturalWidth, image.naturalHeight];
    } catch {
        return [0, 0];
    }
}

// Check the container flags before asking the canvas to decode a single frame.
async function preserveOriginal(file) {
    if (['image/gif', 'image/svg+xml', 'image/apng', 'image/jxl', 'image/heic-sequence', 'image/heif-sequence'].includes(file.type)) return true;
    if (file.type === 'image/webp') {
        const head = new Uint8Array(await file.slice(0, 21).arrayBuffer());
        return String.fromCharCode(...head.slice(12, 16)) === 'VP8X' && Boolean(head[20] & 2);
    }
    if (file.type === 'image/avif') {
        const head = await file.slice(0, 64).text();
        return head.includes('avis');
    }
    if (file.type === 'image/png') {
        let offset = 8;
        while (offset + 8 <= file.size) {
            const head = new DataView(await file.slice(offset, offset + 8).arrayBuffer());
            const type = head.getUint32(4);
            if (type === 0x6163544c) return true; // acTL
            if (type === 0x49444154 || type === 0x49454e44) break; // IDAT or IEND
            offset += head.getUint32(0) + 12;
        }
    }
    return false;
}

export async function prepareImage(entry, { maxSide, format, quality }) {
    const { file, previewUrl, width, height } = entry;
    const original = { file, width, height };
    if (!maxSide && format === 'original') return original;
    if (await preserveOriginal(file)) return { ...original, preserved: true };
    const image = await inspectImage(previewUrl).catch(() => {
        throw new Error('浏览器无法处理此格式，可切换到原始尺寸和格式后重试');
    });
    const scale = maxSide ? Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight)) : 1;
    if (scale === 1 && format === 'original') return original;
    const targetType = format === 'original' ? file.type : format;

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器无法创建图片处理画布');
    if (targetType === 'image/jpeg') {
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, targetType, quality / 100));
    if (!blob) throw new Error('无法生成图片，可尝试缩小输出尺寸');
    if (blob.type !== targetType && format !== 'original') throw new Error('当前浏览器不支持所选输出格式');
    const extension = extensions[blob.type] || 'png';
    const stem = file.name.replace(/\.[^.]+$/, '') || 'image';
    return {
        file: new File([blob], stem + '.' + extension, { type: blob.type }),
        width: canvas.width,
        height: canvas.height
    };
}

function escapeHtml(value) {
    const chars = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return value.replace(/[&<>"']/g, char => chars[char]);
}

export function shareCode(item, format) {
    const alt = item.alt ?? item.originalName;
    const url = item.publicUrl;
    if (format === 'markdown') {
        const label = alt.replace(/[\r\n]+/g, ' ').replace(/[\\\[\]<>]/g, '\\$&');
        return '![' + label + '](<' + url + '>)';
    }
    if (format === 'html') return '<img src="' + escapeHtml(url) + '" alt="' + escapeHtml(alt) + '">';
    if (format === 'bbcode') return '[img]' + url.replaceAll('[', '%5B').replaceAll(']', '%5D') + '[/img]';
    return url;
}
