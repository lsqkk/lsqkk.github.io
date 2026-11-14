import { request } from 'node:https';
import { allowOrigin, SITE_ORIGINS } from './_cors.js';

const hosts = new Set(['api.github.com', 'raw.githubusercontent.com', 'registry.npmjs.org', 'www.iana.org', 'example.com', 'example.org']);
const headersToExpose = ['content-type', 'content-length', 'cache-control', 'date', 'etag', 'last-modified', 'location', 'server'];
const limit = 64 * 1024;

function fetchPublicText(url, method) {
    return new Promise((resolve, reject) => {
        const upstream = request(url, {
            method,
            signal: AbortSignal.timeout(6500),
            headers: { 'User-Agent': 'Quark-Terminal', Accept: '*/*', 'Accept-Encoding': 'identity' }
        }, response => {
            const chunks = [];
            let size = 0;
            response.on('data', chunk => {
                size += chunk.length;
                if (size > limit) {
                    reject(new Error('响应超过 64 KiB'));
                    upstream.destroy();
                    return;
                }
                chunks.push(chunk);
            });
            response.on('error', reject);
            response.on('end', () => resolve({
                status: response.statusCode,
                headers: headersToExpose.filter(name => response.headers[name] !== undefined).map(name => [name, response.headers[name]]),
                body: Buffer.concat(chunks).toString('utf8')
            }));
        });
        upstream.on('error', reject);
        upstream.end();
    });
}

export default async function handler(req, res) {
    res.setHeader('Vary', 'Origin');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    if (!allowOrigin(req, res, SITE_ORIGINS)) return res.status(403).json({ error: '此来源不可使用终端转发服务' });
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET') return res.status(405).json({ error: '不支持该请求方式' });
    const { url: target, method = 'GET' } = req.query;
    let url;
    try {
        if (typeof target !== 'string' || target.length > 2048) throw new Error();
        url = new URL(target);
    } catch {
        return res.status(400).json({ error: 'URL 无效' });
    }
    if (url.protocol !== 'https:' || url.port || url.username || url.password ||
        !hosts.has(url.hostname) || !['GET', 'HEAD'].includes(method)) {
        return res.status(400).json({ error: '仅支持向已配置的 HTTPS 服务转发 GET / HEAD' });
    }
    try {
        return res.status(200).json(await fetchPublicText(url, method));
    } catch (error) {
        return res.status(502).json({ error: error.message === '响应超过 64 KiB' ? error.message : '上游请求失败或超时' });
    }
}
