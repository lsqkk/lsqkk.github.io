const biliOrigin = 'https://uapis.cn';
const biliPaths = new Set([
  '/api/v1/social/bilibili/archives',
  '/api/v1/social/bilibili/videoinfo'
]);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (req.query?.mode !== 'bili') {
    return res.status(400).json({ error: 'Only Bilibili metadata is supported' });
  }

  let target;
  try {
    target = new URL(req.query?.url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }
  if (target.origin !== biliOrigin || !biliPaths.has(target.pathname)
      || target.username || target.password) {
    return res.status(400).json({ error: 'Unsupported Bilibili API URL' });
  }

  try {
    const upstream = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.bilibili.com/',
        'Accept': 'application/json'
      },
      redirect: 'error',
      signal: AbortSignal.timeout(15000)
    });

    if (!upstream.ok || !upstream.headers.get('content-type')?.includes('application/json')) {
      await upstream.body?.cancel();
      return res.status(upstream.ok ? 502 : upstream.status).json({ error: 'Bilibili metadata unavailable' });
    }

    const data = await upstream.json();
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
    return res.status(200).json(data);
  } catch (error) {
    console.error('bili-proxy error:', error);
    return res.status(502).json({ error: 'Failed to fetch Bilibili metadata' });
  }
}
