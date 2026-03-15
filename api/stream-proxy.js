// /api/stream-proxy.js - CORS-safe media proxy for m3u8/ts/aac streams
export default async function handler(req, res) {
  const allowedDomains = ['localhost:8000', 'lsqkk.github.io', 'api.130923.xyz'];
  const referer = req.headers.referer || req.headers.referrer;
  const origin = req.headers.origin;

  let requestOrigin = '';
  if (origin) {
    try {
      const originUrl = new URL(origin);
      if (allowedDomains.some((domain) => originUrl.host === domain)) {
        requestOrigin = originUrl.origin;
      }
    } catch {
      // ignore
    }
  }
  if (!requestOrigin && referer) {
    try {
      const refererUrl = new URL(referer);
      if (allowedDomains.some((domain) => refererUrl.host === domain)) {
        requestOrigin = refererUrl.origin;
      }
    } catch {
      // ignore
    }
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (requestOrigin) {
    res.setHeader('Access-Control-Allow-Origin', requestOrigin);
  }

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!requestOrigin) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const rawUrl = String(req.query?.url || '').trim();
  if (!rawUrl) {
    return res.status(400).json({ error: 'Missing url' });
  }

  let targetUrl;
  try {
    targetUrl = new URL(rawUrl);
  } catch {
    return res.status(400).json({ error: 'Invalid url' });
  }

  if (!['http:', 'https:'].includes(targetUrl.protocol)) {
    return res.status(400).json({ error: 'Unsupported protocol' });
  }

  try {
    const upstream = await fetch(targetUrl.toString(), {
      redirect: 'follow',
      headers: {
        'User-Agent': req.headers['user-agent'] || 'lsqkk-proxy'
      }
    });

    if (!upstream.ok) {
      return res.status(upstream.status).send(await upstream.text());
    }

    const contentType = upstream.headers.get('content-type') || '';
    const isM3U = contentType.includes('application/vnd.apple.mpegurl')
      || contentType.includes('application/x-mpegURL')
      || contentType.includes('application/mpegurl')
      || targetUrl.pathname.endsWith('.m3u8');

    if (isM3U) {
      const text = await upstream.text();
      const baseOrigin = requestOrigin || `https://${req.headers.host}`;
      const proxyBase = `${baseOrigin}/api/stream-proxy?url=`;
      const rewritten = text.split(/\r?\n/).map((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
          return line;
        }
        let resolved;
        if (trimmed.startsWith('//')) {
          resolved = `${targetUrl.protocol}${trimmed}`;
        } else if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
          resolved = trimmed;
        } else {
          resolved = new URL(trimmed, targetUrl).toString();
        }
        return `${proxyBase}${encodeURIComponent(resolved)}`;
      }).join('\n');

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
      return res.status(200).send(rewritten);
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }
    return res.status(200).send(buffer);
  } catch (error) {
    console.error('stream proxy error:', error);
    return res.status(500).json({ error: 'Proxy error' });
  }
}
