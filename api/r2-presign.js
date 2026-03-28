// /api/r2-presign.js - generate presigned R2 upload URL
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const allowedDomains = ['localhost:8000', 'lsqkk.github.io', '130923.xyz', 'www.130923.xyz'];

function resolveOrigin(req) {
  const referer = req.headers.referer || req.headers.referrer;
  const origin = req.headers.origin;

  if (origin) {
    try {
      const originUrl = new URL(origin);
      if (allowedDomains.some((domain) => originUrl.host === domain)) {
        return originUrl.origin;
      }
    } catch (e) {
      console.error('解析Origin出错:', e);
    }
  }

  if (referer) {
    try {
      const refererUrl = new URL(referer);
      if (allowedDomains.some((domain) => refererUrl.host === domain)) {
        return refererUrl.origin;
      }
    } catch (e) {
      console.error('解析Referer出错:', e);
    }
  }

  return '';
}

function getEnv(name) {
  return String(process.env[name] || '').trim();
}

function pickExtension(originalName, contentType) {
  const nameExt = originalName && originalName.includes('.')
    ? originalName.split('.').pop().toLowerCase()
    : '';
  if (nameExt && /^[a-z0-9]{1,10}$/.test(nameExt)) return nameExt;
  const type = String(contentType || '').toLowerCase();
  if (type.includes('png')) return 'png';
  if (type.includes('webp')) return 'webp';
  if (type.includes('gif')) return 'gif';
  if (type.includes('jpeg') || type.includes('jpg')) return 'jpg';
  return 'bin';
}

function buildFileName(originalName, contentType) {
  const ext = pickExtension(originalName, contentType);
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `${ts}-${rand}.${ext}`;
}

export default async function handler(req, res) {
  const requestOrigin = resolveOrigin(req);
  const isAllowed = Boolean(requestOrigin);

  res.setHeader('Access-Control-Allow-Origin', isAllowed ? requestOrigin : 'false');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!isAllowed) {
    console.warn('非法来源访问被阻止:', {
      origin: req.headers.origin,
      referer: req.headers.referer
    });
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const accessKeyId = getEnv('R2_ACCESS_KEY_ID');
  const secretAccessKey = getEnv('R2_SECRET_ACCESS_KEY');
  const endpoint = getEnv('R2_ENDPOINT');
  const bucket = getEnv('R2_BUCKET');
  const publicBase = getEnv('R2_PUBLIC_BASE_URL').replace(/\/+$/, '');

  const missing = [];
  if (!accessKeyId) missing.push('R2_ACCESS_KEY_ID');
  if (!secretAccessKey) missing.push('R2_SECRET_ACCESS_KEY');
  if (!endpoint) missing.push('R2_ENDPOINT');
  if (!bucket) missing.push('R2_BUCKET');
  if (!publicBase) missing.push('R2_PUBLIC_BASE_URL');

  if (missing.length) {
    return res.status(500).json({
      error: 'Missing R2 config',
      missing
    });
  }

  const body = req.body || {};
  const originalName = String(body.originalName || '').trim();
  const contentType = String(body.contentType || 'application/octet-stream').trim();

  if (!originalName) {
    return res.status(400).json({ error: 'originalName required' });
  }

  const now = new Date();
  const year = now.getFullYear();
  const fileName = buildFileName(originalName, contentType);
  const objectKey = `pic/${year}/${fileName}`;

  try {
    const client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: { accessKeyId, secretAccessKey }
    });

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      ContentType: contentType
    });

    const uploadUrl = await getSignedUrl(client, command, { expiresIn: 900 });
    const publicUrl = `${publicBase}/${objectKey}`;

    return res.status(200).json({
      uploadUrl,
      publicUrl,
      objectKey,
      fileName
    });
  } catch (error) {
    console.error('生成上传链接失败:', error);
    return res.status(500).json({ error: 'Presign failed' });
  }
}
