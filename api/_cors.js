// /api/_cors.js - Shared CORS configuration for all API endpoints
// Centralizes allowed origins/domains so adding a new domain only needs one change.

const ALLOWED_DOMAINS = ['localhost:8000', 'lsqkk.github.io', '130923.xyz', 'www.130923.xyz', 'api.130923.xyz'];
const ALLOWED_ORIGINS = ['http://localhost:8000', 'https://localhost:8000', 'https://lsqkk.github.io'];

/**
 * Resolve the allowed origin from request headers using host matching.
 * Supports both Origin and Referer headers. Returns empty string if not allowed.
 */
function resolveOrigin(req, domains = ALLOWED_DOMAINS) {
  const referer = req.headers.referer || req.headers.referrer;
  const origin = req.headers.origin;

  if (origin) {
    try {
      const originUrl = new URL(origin);
      if (domains.some((domain) => originUrl.host === domain || originUrl.hostname.includes(domain))) {
        return originUrl.origin;
      }
    } catch { /* ignore */ }
  }

  if (referer) {
    try {
      const refererUrl = new URL(referer);
      if (domains.some((domain) => refererUrl.host === domain || refererUrl.hostname.includes(domain))) {
        return refererUrl.origin;
      }
    } catch { /* ignore */ }
  }

  return '';
}

/**
 * Set CORS headers using exact origin matching (stricter).
 * Returns true if origin is allowed, false otherwise.
 */
function allowOrigin(req, res, origins = ALLOWED_ORIGINS) {
  const origin = req.headers.origin;
  if (origin && origins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    return true;
  }
  res.setHeader('Access-Control-Allow-Origin', 'false');
  return false;
}

export { ALLOWED_DOMAINS, ALLOWED_ORIGINS, resolveOrigin, allowOrigin };
