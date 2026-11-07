const key = 'quark_quota_session';

export function saveQuotaSession(session) {
    try {
        if (session?.token && Number.isFinite(session.expiresAt)) localStorage.setItem(key, JSON.stringify(session));
        else localStorage.removeItem(key);
    } catch {}
}

export function quotaHeaders() {
    try {
        const session = JSON.parse(localStorage.getItem(key));
        if (session?.token && session.expiresAt > Date.now()) return { Authorization: `Bearer ${session.token}` };
    } catch {}
    return {};
}

export function quotaLoginUrl() {
    return `/login/?benefits=1&next=${encodeURIComponent(location.pathname + location.search + location.hash)}`;
}

export function quotaReturnPath(raw, fallback) {
    if (typeof raw === 'string' && /^\/(?![\/\\])/.test(raw)) {
        const url = new URL(raw, location.origin);
        if (url.origin === location.origin) return url.pathname + url.search + url.hash;
    }
    return fallback;
}
