export const MAX_FILES = 500;
export const MAX_RECEIVE = 512 * 1024 * 1024;
export const MAX_OFFLINE = 25 * 1024 * 1024;
export const MAX_NOTE = 500;
export const CHUNK = 16 * 1024;

export function bytes(size) {
    if (size < 1024) return `${size} B`;
    if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KiB`;
    if (size < 1024 ** 3) return `${(size / 1024 ** 2).toFixed(1)} MiB`;
    return `${(size / 1024 ** 3).toFixed(1)} GiB`;
}

export function safePath(path) {
    if (typeof path !== 'string' || !path || path.length > 640) return '';
    return path.replaceAll('\\', '/').split('/').map((part) => {
        const clean = part.normalize('NFC').replace(/[<>:"|?*\u0000-\u001f\u007f]/g, '_').trim().replace(/[. ]+$/g, '');
        return clean && !/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(clean)
            ? clean.slice(0, 160) : '_';
    }).join('/');
}

function suffixed(name, index) {
    const suffix = ` (${index})`;
    const dot = name.lastIndexOf('.');
    const extension = dot > 0 && name.length - dot <= 20 ? name.slice(dot) : '';
    const stem = name.slice(0, name.length - extension.length);
    return stem.slice(0, 160 - suffix.length - extension.length) + suffix + extension;
}

export class PathIndex {
    #files = new Set();
    #directories = new Map();

    add(path) {
        const parts = path.split('/');
        const name = parts.pop();
        let parent = '';
        for (const part of parts) {
            const original = parent + part;
            let directory = this.#directories.get(original.toLowerCase());
            if (!directory) {
                directory = original;
                for (let i = 2; this.#files.has(directory.toLowerCase()) || this.#directories.has(directory.toLowerCase()); i++) {
                    directory = parent + suffixed(part, i);
                }
                this.#directories.set(original.toLowerCase(), directory);
                this.#directories.set(directory.toLowerCase(), directory);
            }
            parent = directory + '/';
        }
        let candidate = parent + name;
        for (let i = 2; this.#files.has(candidate.toLowerCase()) || this.#directories.has(candidate.toLowerCase()); i++) {
            candidate = parent + suffixed(name, i);
        }
        this.#files.add(candidate.toLowerCase());
        return candidate;
    }
}

export function previewType(path) {
    const ext = path.toLowerCase().split('.').pop();
    const types = {
        png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
        webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp',
        mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac',
        mp4: 'video/mp4', webm: 'video/webm',
        txt: 'text/plain', md: 'text/plain', csv: 'text/plain', json: 'text/plain', log: 'text/plain',
        html: 'text/plain', svg: 'text/plain'
    };
    return Object.hasOwn(types, ext) ? types[ext] : '';
}

export function manifestItems(input, maxBytes = MAX_RECEIVE) {
    if (!Array.isArray(input) || input.length > MAX_FILES) throw new Error('文件清单超出数量限制。');
    let total = 0;
    const used = new PathIndex();
    const items = input.map((item) => {
        const path = safePath(item?.path);
        const size = item?.size;
        if (!path || !Number.isSafeInteger(size) || size < 0) throw new Error('文件清单格式无效。');
        total += size;
        if (total > maxBytes) throw new Error(`文件总大小超过本次接收上限（${bytes(maxBytes)}）。`);
        const unique = used.add(path);
        if (unique.length > 640) throw new Error('文件路径过长。');
        return { path: unique, size };
    });
    return { items, total };
}

export function normalizedCode(value) {
    const code = value.trim().toUpperCase().replace(/[\s-]/g, '');
    return /^(?:[A-Z]{3}|[2-9A-HJ-NP-Z]{8})$/.test(code) ? code : '';
}

export function makeLink(data, current = location.href) {
    const url = new URL(current);
    url.search = '';
    url.hash = new URLSearchParams(data).toString();
    return url.toString();
}

export function parseInvite(raw, current = location.href) {
    const code = normalizedCode(raw);
    if (code) return { room: code };
    try {
        const base = new URL(current);
        const url = new URL(raw.trim(), base);
        const trustedOrigin = [base.origin, 'https://lsqkk.github.io', 'https://130923.xyz', 'https://www.130923.xyz'].includes(url.origin);
        if (!trustedOrigin || url.pathname.replace(/\/$/, '') !== base.pathname.replace(/\/$/, '')) return null;
        const values = new URLSearchParams(url.hash.slice(1));
        const room = normalizedCode(values.get('room') || '');
        if (room) return { room };
        const day = values.get('day');
        const id = values.get('drop');
        const key = values.get('key');
        if (/^\d{4}-\d{2}-\d{2}$/.test(day || '') && /^[a-f0-9]{32}$/.test(id || '') && /^[A-Za-z0-9_-]{43}$/.test(key || '')) {
            return { day, id, key };
        }
    } catch {}
    return null;
}
