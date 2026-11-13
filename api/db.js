// /api/db.js - minimal Firebase RTDB proxy (read-only for now)
import { getDatabase } from './_firebase-admin.js';
import { resolveOrigin } from './_cors.js';
import managedChat from './_chat-room.js';

const onlineWindowMs = 15 * 60 * 1000;

function isAllowedOrigin(req) {
  const requestOrigin = resolveOrigin(req, ['localhost:8000', 'lsqkk.github.io']);
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
    'pic_upload_limits',
    'user_space_likes',
    'xjtu360',
    'rooms',
    'user_badges',
    'user_space_stickies'
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
  if (req.query?.view === 'chat-room' || (req.method === 'GET' && process.env.CRON_SECRET &&
      req.headers.authorization === 'Bearer ' + process.env.CRON_SECRET)) return managedChat(req, res);
  const requestOrigin = isAllowedOrigin(req);
  const path = String(req.query?.path || req.body?.path || '').trim();
  const view = req.query?.view;
  const countView = req.method === 'GET' && path === 'user_activity' && view === 'count';
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (countView) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (requestOrigin) {
    res.setHeader('Access-Control-Allow-Origin', requestOrigin);
  }

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!requestOrigin && !countView) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (!path || !isAllowedPath(path)) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  try {
    const db = getDatabase();

    if (req.method === 'GET') {
      const ref = db.ref(path);
      if (countView) {
        const snap = await ref.once('value');
        let count = 0;
        snap.forEach((user) => {
          const nickname = user.child('profile/nickname').val();
          const login = user.child('profile/login').val();
          if ((typeof nickname === 'string' && nickname.trim())
              || (typeof login === 'string' && login.trim())) {
            count++;
          }
        });
        res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
        return res.status(200).json({ ok: true, data: count });
      }

      if (path === 'presence' && view === 'online') {
        const snap = await ref.orderByChild('lastSeen')
          .startAt(Date.now() - onlineWindowMs)
          .endAt(Number.MAX_SAFE_INTEGER)
          .once('value');
        return res.status(200).json({ ok: true, data: snap.val() });
      }

      const query = {
        orderByChild: req.query?.orderByChild,
        startAt: req.query?.startAt,
        endAt: req.query?.endAt,
        equalTo: req.query?.equalTo,
        limitToLast: req.query?.limitToLast,
        limitToFirst: req.query?.limitToFirst
      };
      const snap = await applyQuery(ref, query).once('value');
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
