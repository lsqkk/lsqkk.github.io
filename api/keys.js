// /api/keys.js - inject API keys for trusted origins
export default function handler(req, res) {
  const allowedDomains = ['localhost:8000', 'lsqkk.github.io'];
  let isAllowed = false;
  let requestOrigin = '';

  const referer = req.headers.referer || req.headers.referrer;
  const origin = req.headers.origin;

  if (origin) {
    try {
      const originUrl = new URL(origin);
      if (allowedDomains.some((domain) => originUrl.host === domain)) {
        isAllowed = true;
        requestOrigin = originUrl.origin;
      }
    } catch (e) {
      console.error('解析Origin出错:', e);
    }
  }

  if (!isAllowed && referer) {
    try {
      const refererUrl = new URL(referer);
      if (allowedDomains.some((domain) => refererUrl.host === domain)) {
        isAllowed = true;
        requestOrigin = refererUrl.origin;
      }
    } catch (e) {
      console.error('解析Referer出错:', e);
    }
  }

  res.setHeader('Access-Control-Allow-Origin', isAllowed ? requestOrigin : 'false');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!isAllowed) {
    console.warn('非法来源访问被阻止:', { origin, referer, allowedDomains });
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const keyMap = {
    tianditu: process.env.TIANDITU_KEY,
    openweather: process.env.OPENWEATHER_API_KEY,
    quarkchat: process.env.QUARKCHAT_API_KEY,
    github: process.env.GITHUB_API_KEY
  };

  const namesRaw = String(req.query?.names || req.query?.name || '').trim();
  const names = namesRaw
    ? namesRaw.split(',').map((item) => item.trim()).filter(Boolean)
    : Object.keys(keyMap);

  const missing = names.filter((name) => !keyMap[name]);
  if (missing.length) {
    return res.status(500).json({
      error: 'Missing API keys',
      missing
    });
  }

  const lines = names.map((name) => {
    const value = keyMap[name];
    if (!value) return '';
    const varName = name === 'tianditu'
      ? 'TIANDITU_KEY'
      : name === 'openweather'
        ? 'OPENWEATHER_API_KEY'
        : name === 'quarkchat'
          ? 'QUARKCHAT_API_KEY'
          : 'GITHUB_API_KEY';
    return `window.${varName} = "${value}";`;
  }).filter(Boolean);

  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.send(lines.join('\n'));
}
