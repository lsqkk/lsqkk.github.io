// /api/stream-proxy.js - CORS-safe proxy for m3u8/ts/aac streams & AI search API
// GET  ?url=...  → media stream proxy (m3u8/ts/aac)
// POST ?target=... → AI search API proxy (Qianfan etc.)

function isAllowed(req) {
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
  return requestOrigin;
}

// ── Media stream proxy (m3u8/ts/aac) ──
async function handleMediaProxy(req, res, requestOrigin) {
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', requestOrigin || '*');

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
        'User-Agent': req.headers['user-agent'] || 'lsqkk-proxy',
        'Accept': req.headers.accept || '*/*',
        'Accept-Language': req.headers['accept-language'] || 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': targetUrl.origin + '/',
        'Origin': targetUrl.origin
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
      const forwardedProto = req.headers['x-forwarded-proto'] || 'https';
      const forwardedHost = req.headers['x-forwarded-host'] || req.headers.host;
      const baseOrigin = requestOrigin || `${forwardedProto}://${forwardedHost}`;
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

// ── AI search API proxy ──
async function handleAISearchProxy(req, res, requestOrigin) {
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Origin', requestOrigin || '*');

  const targetUrl = String(req.query?.target || '').trim();
  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing target URL (add ?target=...)' });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    return res.status(400).json({ error: 'Invalid target URL' });
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return res.status(400).json({ error: 'Unsupported protocol' });
  }

  const authHeader = req.headers.authorization || '';

  try {
    const upstream = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader ? { 'Authorization': authHeader } : {}),
      },
      body: JSON.stringify(req.body),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      return res.status(upstream.status).send(errText);
    }

    const contentType = upstream.headers.get('content-type') || '';

    if (contentType.includes('text/event-stream')) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(decoder.decode(value, { stream: true }));
      }
      res.end();
    } else {
      const data = await upstream.json();
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).json(data);
    }
  } catch (error) {
    console.error('AI search proxy error:', error);
    return res.status(500).json({ error: error.message });
  }
}

// ── Main handler ──
export default async function handler(req, res) {
  const requestOrigin = isAllowed(req);

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', requestOrigin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    return handleAISearchProxy(req, res, requestOrigin);
  }

  if (req.method === 'GET') {
    return handleMediaProxy(req, res, requestOrigin);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
