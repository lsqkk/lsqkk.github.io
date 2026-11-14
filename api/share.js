import { SITE_ORIGINS } from './_cors.js';
import { handleRoom } from './_share-room.js';
import { handleDrop, dropLimit, INLINE_BODY_LIMIT, INLINE_BYTES } from './_share-drop.js';
import { ShareError } from './_share-error.js';
import { iceConfiguration } from './_share-ice.js';
import { reserveDailyQuota } from './_daily-quota.js';

export default async function handler(req, res) {
  const origin = req.headers.origin;
  const allowed = SITE_ORIGINS.includes(origin);
  if (allowed) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
  if (!allowed) return res.status(403).json({ error: '请求来源不受支持。' });
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: '请求方法不受支持。' });

  const body = req.body;
  const inline = body?.action === 'drop-create' && typeof body.ciphertext === 'string';
  if (!body || typeof body !== 'object' || Array.isArray(body) || JSON.stringify(body).length > (inline ? INLINE_BODY_LIMIT : 64 * 1024)) {
    return res.status(400).json({ error: '闪传请求格式无效。' });
  }

  try {
    if (body.action === 'status') {
      const maxBytes = dropLimit();
      return res.status(200).json({ offline: maxBytes > 0, maxBytes, inline: maxBytes === INLINE_BYTES });
    }
    if (body.action === 'ice-config') {
      const config = iceConfiguration();
      const quota = config.iceServers.length && await reserveDailyQuota(req, 'quark_share_ice_quota', {
        guestLimit: 120, accountLimit: 300, siteLimit: 2400
      });
      return res.status(200).json(quota ? { iceServers: [] } : config);
    }
    const operations = typeof body.action === 'string' && body.action.startsWith('drop-') ? handleDrop : handleRoom;
    return res.status(200).json(await operations(req, body));
  } catch (error) {
    if (error instanceof ShareError) return res.status(error.status).json({ error: error.message });
    console.error('Share request failed', String(body.action).slice(0, 30), error.name, error.code || error.$metadata?.httpStatusCode || '');
    return res.status(503).json({ error: '闪传服务暂不可用，请稍后重试。' });
  }
}
