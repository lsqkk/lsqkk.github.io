import { createHmac, randomBytes } from 'node:crypto';

export function iceConfiguration() {
  const secret = process.env.SHARE_TURN_SECRET?.trim();
  const urls = (process.env.SHARE_TURN_URLS || '').split(',').map((url) => url.trim()).filter(Boolean);
  if (!secret || !urls.length || urls.some((url) => !/^turns?:[^\s]+$/i.test(url))) return { iceServers: [] };

  const username = `${Math.floor(Date.now() / 1000) + 1800}:share-${randomBytes(8).toString('hex')}`;
  const credential = createHmac('sha1', secret).update(username).digest('base64');
  return { iceServers: [{ urls, username, credential }] };
}
