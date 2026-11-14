import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { BlockList } from 'node:net';
import { createGunzip } from 'node:zlib';
import { allowOrigin, SITE_ORIGINS } from './_cors.js';
import { reserveDailyQuota } from './_daily-quota.js';

const redirects = new Set([301, 302, 303, 307, 308]);
const blocked = new BlockList();
for (const [network, bits] of [
    ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
    ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
    ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
    ['203.0.113.0', 24], ['224.0.0.0', 3]
]) blocked.addSubnet(network, bits, 'ipv4');

export class RelayError extends Error {
    constructor(message, status = 502) { super(message); this.status = status; }
}

function validateUrl(url) {
    if (url.protocol !== 'https:' || url.port || url.username || url.password ||
        !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}$/i.test(url.hostname) ||
        /\.(?:localhost|local|internal|lan|home|test|invalid|onion)$/i.test(url.hostname)) {
        throw new RelayError('只支持公网 HTTPS 域名和标准端口');
    }
}

async function resolvePublicAddress(hostname, signal) {
    signal.throwIfAborted();
    const addresses = await new Promise((resolve, reject) => {
        const abort = () => reject(signal.reason);
        signal.addEventListener('abort', abort, { once: true });
        lookup(hostname, { family: 4, all: true }).then(resolve, reject)
            .finally(() => signal.removeEventListener('abort', abort));
    });
    signal.throwIfAborted();
    if (!addresses.length || addresses.some(({ address }) => blocked.check(address, 'ipv4'))) {
        throw new RelayError('目标必须解析到公网 IPv4 地址');
    }
    return addresses[0].address;
}

function fetchResource(url, address, signal, { method, limit, accept, prefixOnly }) {
    return new Promise((resolve, reject) => {
        const upstream = request(url, {
            method,
            signal,
            family: 4,
            agent: false,
            // Keep the original hostname for Host and TLS, but connect to the checked address.
            lookup: (_host, _options, callback) => callback(null, address, 4),
            headers: { 'User-Agent': 'Quark-Site', Accept: accept, 'Accept-Encoding': 'gzip' }
        }, response => {
            const status = response.statusCode;
            if (redirects.has(status) && response.headers.location) {
                resolve({ redirect: response.headers.location });
                response.destroy();
                return;
            }
            const hasBody = method !== 'HEAD' && status !== 204 && status !== 304;
            const stream = hasBody && response.headers['content-encoding'] === 'gzip'
                ? response.pipe(createGunzip()) : response;
            const chunks = [];
            let size = 0;
            stream.on('data', chunk => {
                size += chunk.length;
                if (size > limit) {
                    if (prefixOnly) {
                        chunks.push(chunk.subarray(0, chunk.length - (size - limit)));
                        resolve(result());
                    } else {
                        reject(new RelayError('远程资源超过 ' + Math.floor(limit / 1024) + ' KiB', 413));
                    }
                    stream.destroy();
                    upstream.destroy();
                    return;
                }
                chunks.push(chunk);
            });
            if (stream !== response) response.on('error', error => stream.destroy(error));
            stream.on('error', reject);
            const result = () => ({ status, headers: response.headers, body: Buffer.concat(chunks), url });
            stream.on('end', () => resolve(result()));
        });
        upstream.on('error', reject);
        upstream.end();
    });
}

export async function publicResource(target, { method = 'GET', limit, accept = '*/*', prefixOnly = false }) {
    let url;
    try {
        if (typeof target !== 'string' || target.length > 2048 || !['GET', 'HEAD'].includes(method)) throw new Error();
        url = new URL(target);
        validateUrl(url);
    } catch (error) {
        throw new RelayError(error instanceof RelayError ? error.message : 'URL 或请求方法无效', 400);
    }
    const signal = AbortSignal.timeout(10000);
    try {
        for (let hop = 0; hop <= 4; hop++) {
            const address = await resolvePublicAddress(url.hostname, signal);
            const result = await fetchResource(url, address, signal, { method, limit, accept, prefixOnly });
            if (!result.redirect) return result;
            url = new URL(result.redirect, url);
            validateUrl(url);
        }
        throw new RelayError('HTTPS 重定向次数过多');
    } catch (error) {
        if (error instanceof RelayError) throw error;
        throw new RelayError(signal.aborted ? '上游请求超时'
            : error.code === 'ENOTFOUND' ? '域名没有可用的 IPv4 记录' : '无法连接上游 HTTPS 服务');
    }
}

export function publicResourceEndpoint(handle) {
    return async (req, res) => {
        res.setHeader('Vary', 'Origin');
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        if (!allowOrigin(req, res, SITE_ORIGINS)) return res.status(403).json({ error: '此来源不可使用远程导入' });
        if (req.method === 'OPTIONS') return res.status(204).end();
        if (req.method !== 'GET') return res.status(405).json({ error: '不支持该请求方式' });
        if (process.env.VERCEL) {
            try {
                const quota = await reserveDailyQuota(req, 'public_resource_daily_quota', {
                    guestLimit: 120, accountLimit: 120, siteLimit: 5000
                });
                if (quota) return res.status(429).json({ error: '今日远程请求额度已用完，请在北京时间零点后重试。' });
            } catch {
                return res.status(503).json({ error: '远程导入额度服务暂不可用' });
            }
        }
        try {
            return await handle(req.query, res);
        } catch (error) {
            return res.status(error instanceof RelayError ? error.status : 502)
                .json({ error: error instanceof RelayError ? error.message : '无法读取远程资源' });
        }
    };
}
