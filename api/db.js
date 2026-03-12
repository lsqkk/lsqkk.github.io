// /api/db.js - minimal Firebase RTDB proxy (read-only for now)
import admin from 'firebase-admin';

let app;

function initAdmin() {
  if (app) return app;
  if (admin.apps && admin.apps.length) {
    app = admin.app();
    return app;
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error('Missing FIREBASE_SERVICE_ACCOUNT');
  }
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(raw);
  } catch (err) {
    throw new Error('Invalid FIREBASE_SERVICE_ACCOUNT JSON');
  }
  if (serviceAccount.private_key && typeof serviceAccount.private_key === 'string') {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
  }
  app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL
  });
  return app;
}

function isAllowedOrigin(req) {
  const allowedDomains = ['localhost:8000', 'lsqkk.github.io'];
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

export default async function handler(req, res) {
  const requestOrigin = isAllowedOrigin(req);
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

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const path = String(req.query?.path || '').trim();
  const allowedPaths = ['presence'];
  if (!path || !allowedPaths.includes(path)) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  try {
    initAdmin();
    const db = admin.database();
    const snap = await db.ref(path).once('value');
    return res.status(200).json({ ok: true, data: snap.val() || {} });
  } catch (error) {
    console.error('db proxy error:', error);
    return res.status(500).json({ error: 'Internal error' });
  }
}
