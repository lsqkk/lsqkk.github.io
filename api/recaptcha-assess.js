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

  const apiKey = process.env.RECAPTCHA_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Missing RECAPTCHA_API_KEY' });
    return;
  }

  const projectId = process.env.RECAPTCHA_PROJECT_ID || 'quark-b7305';
  const siteKey = process.env.APP_CHECK_SITE_KEY || '6Lfy44csAAAAABar96wms8Gtrgm1ZiMHjs_G-yu-';

  try {
    const { token, action } = req.body || {};
    if (!token) {
      res.status(400).json({ error: 'Missing token' });
      return;
    }

    const response = await fetch(`https://recaptchaenterprise.googleapis.com/v1/projects/${projectId}/assessments?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: {
          token,
          siteKey,
          expectedAction: action || 'app_check',
          userAgent: req.headers['user-agent'] || '',
          userIpAddress: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || ''
        }
      })
    });

    const data = await response.json();
    if (!response.ok) {
      res.status(200).json({ ok: false, error: 'assessment_failed', detail: data });
      return;
    }

    res.status(200).json({
      ok: true,
      score: data?.riskAnalysis?.score ?? null,
      reasons: data?.riskAnalysis?.reasons ?? []
    });
  } catch (error) {
    console.error('reCAPTCHA assess error:', error);
    res.status(500).json({ ok: false, error: 'assessment_error' });
  }
}
