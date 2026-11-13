import { MAX_OFFLINE, MAX_NOTE, manifestItems } from './share-model.mjs';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const stamp = encoder.encode('QSD1');
const metaLength = 4;
const ivLength = 12;
const tagLength = 16;

function encodeKey(value) {
    return btoa(String.fromCharCode(...value)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function decodeKey(value) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(value)) throw new Error('离线包密钥格式无效。');
    return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/') + '='), (char) => char.charCodeAt(0));
}

export function offlineSize(files, note) {
    const meta = encoder.encode(JSON.stringify({ note, files: files.map(({ path, size }) => ({ path, size })) }));
    const size = files.reduce((sum, file) => sum + file.size, 0);
    return stamp.length + ivLength + tagLength + metaLength + meta.byteLength + size;
}

export async function sealDrop(files, note) {
    if (!crypto.subtle) throw new Error('离线包加密需要 HTTPS 和支持 Web Crypto 的浏览器。');
    manifestItems(files, MAX_OFFLINE);
    if (typeof note !== 'string' || note.length > MAX_NOTE || (!files.length && !note.trim())) throw new Error('请添加文件或附言。');
    const meta = encoder.encode(JSON.stringify({ note, files: files.map(({ path, size }) => ({ path, size })) }));
    if (offlineSize(files, note) > MAX_OFFLINE) throw new Error('加密后离线包超过 25 MiB。');
    const prefix = new Uint8Array(metaLength);
    new DataView(prefix.buffer).setUint32(0, meta.byteLength);
    const data = await new Blob([prefix, meta, ...files.map(({ blob }) => blob)]).arrayBuffer();
    const raw = crypto.getRandomValues(new Uint8Array(32));
    const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(ivLength));
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: stamp }, key, data);
    return { key: encodeKey(raw), blob: new Blob([stamp, iv, cipher], { type: 'application/octet-stream' }) };
}

export async function openDrop(buffer, keyText) {
    if (!crypto.subtle) throw new Error('取件解密需要 HTTPS 和支持 Web Crypto 的浏览器。');
    const encrypted = new Uint8Array(buffer);
    if (encrypted.length > MAX_OFFLINE || encrypted.length <= stamp.length + ivLength + tagLength + metaLength
        || !stamp.every((byte, i) => encrypted[i] === byte)) throw new Error('离线包格式无效。');
    const raw = decodeKey(keyText);
    const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
    let data;
    try {
        data = await crypto.subtle.decrypt({
            name: 'AES-GCM',
            iv: encrypted.subarray(stamp.length, stamp.length + ivLength),
            additionalData: stamp
        }, key, encrypted.subarray(stamp.length + ivLength));
    } catch {
        throw new Error('无法解密。请确认复制了完整取件链接。');
    }
    const view = new DataView(data);
    const metaEnd = metaLength + view.getUint32(0);
    if (metaEnd > data.byteLength) throw new Error('离线包文件清单不完整。');
    const { note, files } = JSON.parse(decoder.decode(new Uint8Array(data, metaLength, metaEnd - metaLength)));
    const manifest = manifestItems(files, MAX_OFFLINE);
    if (typeof note !== 'string' || note.length > MAX_NOTE || metaEnd + manifest.total !== data.byteLength) {
        throw new Error('离线包文件内容不完整。');
    }
    let offset = metaEnd;
    const output = manifest.items.map((file) => {
        const blob = new Blob([new Uint8Array(data, offset, file.size)]);
        offset += file.size;
        return { ...file, blob };
    });
    return { note, files: output };
}
