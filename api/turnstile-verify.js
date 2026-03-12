function allowOrigin(req, res) {
  const allowed = ['http://localhost:8000', 'https://localhost:8000', 'https://lsqkk.github.io'];
  const origin = req.headers.origin;
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    return true;
  }
  res.setHeader('Access-Control-Allow-Origin', 'false');
  return false;
}

export default async function handler(req, res) {
  allowOrigin(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    res.status(500).json({ error: 'Missing TURNSTILE_SECRET_KEY' });
    return;
  }

  try {
    const { token, purpose } = req.body || {};
    if (!token) {
      res.status(400).json({ error: 'Missing token' });
      return;
    }

    const form = new URLSearchParams();
    form.append('secret', secret);
    form.append('response', token);

    const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form
    });
    const data = await resp.json();
    if (!resp.ok || !data?.success) {
      res.status(200).json({ ok: false, error: '验证码验证失败', detail: data });
      return;
    }

    const hostname = data.hostname || '';
    if (hostname && hostname !== 'lsqkk.github.io') {
      res.status(200).json({ ok: false, error: '域名校验失败' });
      return;
    }

    res.status(200).json({ ok: true, purpose: purpose || 'login' });
  } catch (error) {
    console.error('Turnstile verify error:', error);
    res.status(500).json({ ok: false, error: '验证失败' });
  }
}
