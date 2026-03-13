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

function isAllowedPath(path) {
  const allowedRoots = [
    'presence',
    'user_activity',
    'chatrooms/lsqkk-lyb',
    'dynamic_posts',
    'post_annotations',
    'oj-discussions',
    'qb_users',
    'qb_email_index',
    'pic_upload_limits'
  ];
  const clean = String(path || '').replace(/^\/+/, '');
  if (!clean) return false;
  return allowedRoots.some((root) => clean === root || clean.startsWith(`${root}/`));
}

function applyQuery(ref, query) {
  let chain = ref;
  if (query.orderByChild) {
    chain = chain.orderByChild(String(query.orderByChild));
  }
  if (typeof query.startAt !== 'undefined') {
    chain = chain.startAt(query.startAt);
  }
  if (typeof query.endAt !== 'undefined') {
    chain = chain.endAt(query.endAt);
  }
  if (typeof query.equalTo !== 'undefined') {
    chain = chain.equalTo(query.equalTo);
  }
  if (query.limitToLast) {
    chain = chain.limitToLast(Number(query.limitToLast));
  }
  if (query.limitToFirst) {
    chain = chain.limitToFirst(Number(query.limitToFirst));
  }
  return chain;
}

export default async function handler(req, res) {
  const requestOrigin = isAllowedOrigin(req);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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

  const path = String(req.query?.path || req.body?.path || '').trim();
  if (!path || !isAllowedPath(path)) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  try {
    initAdmin();
    const db = admin.database();

    if (req.method === 'GET') {
      const query = {
        orderByChild: req.query?.orderByChild,
        startAt: req.query?.startAt,
        endAt: req.query?.endAt,
        equalTo: req.query?.equalTo,
        limitToLast: req.query?.limitToLast,
        limitToFirst: req.query?.limitToFirst
      };
      const ref = applyQuery(db.ref(path), query);
      const snap = await ref.once('value');
      const data = snap.exists() ? snap.val() : null;
      return res.status(200).json({ ok: true, data });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const op = String(req.body?.op || '').trim();
    const value = req.body?.value;
    const ref = db.ref(path);

    if (op === 'set') {
      await ref.set(value);
      return res.status(200).json({ ok: true });
    }
    if (op === 'update') {
      await ref.update(value || {});
      return res.status(200).json({ ok: true });
    }
    if (op === 'remove') {
      await ref.remove();
      return res.status(200).json({ ok: true });
    }
    if (op === 'push') {
      const child = ref.push();
      await child.set(value);
      return res.status(200).json({ ok: true, key: child.key });
    }

    return res.status(400).json({ error: 'Invalid op' });
  } catch (error) {
    console.error('db proxy error:', error);
    return res.status(500).json({ error: 'Internal error' });
  }
}
