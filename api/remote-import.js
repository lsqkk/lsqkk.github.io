import { parse } from 'parse5';
import { publicResource, publicResourceEndpoint, RelayError } from './_public-resource.js';

const imageTypes = new Map([
    ['image/jpeg', b => b[0] === 255 && b[1] === 216 && b[2] === 255],
    ['image/png', b => b.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))],
    ['image/gif', b => /^(GIF87a|GIF89a)$/.test(b.toString('ascii', 0, 6))],
    ['image/webp', b => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP'],
    ['image/avif', b => b.toString('ascii', 4, 8) === 'ftyp' && /avif|avis/.test(b.toString('ascii', 8, 48))]
]);

function webpageMetadata(body, url, contentType) {
    const charset = /charset=["']?([\w-]+)/i.exec(contentType)?.[1]
        || /charset\s*=\s*["']?([\w-]+)/i.exec(body.toString('latin1', 0, 4096))?.[1] || 'utf-8';
    let decoder;
    try { decoder = new TextDecoder(charset); } catch { decoder = new TextDecoder(); }
    const doc = parse(decoder.decode(body));
    const head = doc.childNodes.find(node => node.tagName === 'html')?.childNodes.find(node => node.tagName === 'head');
    const metadata = new Map();
    let title = '';
    for (const node of head?.childNodes ?? []) {
        if (node.tagName === 'title') title ||= node.childNodes.map(child => child.value ?? '').join('');
        if (node.tagName !== 'meta') continue;
        const attrs = Object.fromEntries(node.attrs.map(({ name, value }) => [name, value]));
        const key = (attrs.property || attrs.name || '').toLowerCase();
        if (attrs.content && !metadata.has(key)) metadata.set(key, attrs.content);
    }
    const clean = (value, max) => (value || '').replace(/\s+/g, ' ').trim().slice(0, max);
    const cover = clean(metadata.get('og:image:secure_url') || metadata.get('og:image') || metadata.get('twitter:image'), 1500);
    let image = '';
    try {
        if (cover) {
            const resolved = new URL(cover, url);
            if (resolved.protocol === 'https:' && !resolved.username && !resolved.password && !resolved.port) image = resolved.href;
        }
    } catch { /* Metadata can contain malformed URLs. */ }
    return {
        url: url.href,
        title: clean(metadata.get('og:title') || metadata.get('twitter:title') || title, 300) || url.hostname,
        description: clean(metadata.get('og:description') || metadata.get('description') || metadata.get('twitter:description'), 420),
        image
    };
}

export default publicResourceEndpoint(async ({ url, kind }, res) => {
    if (!['image', 'link'].includes(kind)) throw new RelayError('未知的导入类型', 400);
    const picture = kind === 'image';
    const { body, status, headers, url: finalUrl } = await publicResource(url, picture
        ? { limit: 4 * 1024 * 1024, accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif' }
        : { limit: 256 * 1024, accept: 'text/html,application/xhtml+xml', prefixOnly: true });
    if (status < 200 || status >= 300) throw new RelayError('来源站点返回 HTTP ' + status);
    const contentType = headers['content-type'] || '';
    if (picture) {
        const type = [...imageTypes].find(([, signature]) => signature(body))?.[0];
        if (!type) throw new RelayError('中转仅支持 JPEG、PNG、GIF、WebP 和 AVIF 图片', 415);
        res.setHeader('Content-Type', type);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Access-Control-Expose-Headers', 'X-Resource-Url');
        res.setHeader('X-Resource-Url', finalUrl.href);
        return res.status(200).send(body);
    }
    if (!/^(?:text\/html|application\/xhtml\+xml)(?:\s*;|$)/i.test(contentType))
        throw new RelayError('该网址没有返回网页，可按原链接收藏', 415);
    return res.status(200).json(webpageMetadata(body, finalUrl, contentType));
});
