// @ts-check

(function () {
    const API_BASE = '__API_BASE__';
    const DB_ROOT = 'user_activity';
    const PRESENCE_ROOT = 'presence';
    const LOGIN_CACHE_KEY = 'quark_last_login_at';
    const PAGE_VIEW_CACHE_KEY = 'quark_last_page_view';
    const IP_CACHE_KEY = 'quark_ip_info';
    const IP_CACHE_TTL = 24 * 60 * 60 * 1000;
    const DEVICE_ID_KEY = 'quark_device_id';

    function getProfile() {
        if (window.QuarkUserProfile && typeof window.QuarkUserProfile.getProfile === 'function') {
            return window.QuarkUserProfile.getProfile();
        }
        return {
            nickname: localStorage.getItem('nickname') || '',
            login: localStorage.getItem('github_login') || localStorage.getItem('qb_login') || '',
            loginType: localStorage.getItem('quark_login_type') || '',
            avatarUrl: '',
            avatarType: 'color',
            avatarColor: '#2563eb',
            profileUrl: '',
            updatedAt: 0
        };
    }

    function getUid() {
        if (window.QuarkUserProfile && typeof window.QuarkUserProfile.getUid === 'function') {
            return window.QuarkUserProfile.getUid();
        }
        let uid = localStorage.getItem('quark_uid');
        if (!uid) {
            uid = `q_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
            localStorage.setItem('quark_uid', uid);
        }
        return uid;
    }

    function getDeviceId() {
        let id = localStorage.getItem(DEVICE_ID_KEY);
        if (!id) {
            id = `d_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
            localStorage.setItem(DEVICE_ID_KEY, id);
        }
        return id;
    }

    function getLegacyUid() {
        const uid = localStorage.getItem('quark_uid');
        return uid && uid.startsWith('q_') ? uid : '';
    }

    function readCachedIpInfo() {
        const raw = localStorage.getItem(IP_CACHE_KEY);
        if (!raw) return null;
        try {
            const parsed = JSON.parse(raw);
            if (!parsed || !parsed.ts) return null;
            if (Date.now() - parsed.ts > IP_CACHE_TTL) return null;
            return parsed.data || null;
        } catch {
            return null;
        }
    }

    function writeCachedIpInfo(data) {
        try {
            localStorage.setItem(IP_CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
        } catch {
            // ignore
        }
    }

    async function fetchIpInfo() {
        const cached = readCachedIpInfo();
        if (cached) return cached;
        try {
            const resp = await fetch('https://api.b52m.cn/api/IP/');
            const json = await resp.json();
            if (json && json.code === 200 && json.data) {
                const data = json.data;
                const info = {
                    ip: data.ip || '',
                    province: data.region_name || data.province_name_2 || '',
                    city: data.city_name || data.city_name_2 || '',
                    district: data.district_name_3 || data.district_name || ''
                };
                writeCachedIpInfo(info);
                return info;
            }
        } catch {
            // ignore
        }
        try {
            const resp = await fetch('__API_BASE__/api/ip', { cache: 'no-store' });
            const json = await resp.json();
            const info = { ip: json.ip || '', province: '', city: '', district: '' };
            writeCachedIpInfo(info);
            return info;
        } catch {
            return null;
        }
    }

    async function dbGet(path) {
        const resp = await fetch(`${API_BASE}/api/db?path=${encodeURIComponent(path)}`, { credentials: 'omit' });
        if (!resp.ok) throw new Error(`db get ${resp.status}`);
        const data = await resp.json();
        return data && data.data ? data.data : null;
    }

    async function dbSet(path, value) {
        const resp = await fetch(`${API_BASE}/api/db`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'omit',
            body: JSON.stringify({ op: 'set', path, value })
        });
        if (!resp.ok) throw new Error(`db set ${resp.status}`);
    }

    async function dbUpdate(path, value) {
        const resp = await fetch(`${API_BASE}/api/db`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'omit',
            body: JSON.stringify({ op: 'update', path, value })
        });
        if (!resp.ok) throw new Error(`db update ${resp.status}`);
    }

    async function dbRemove(path) {
        const resp = await fetch(`${API_BASE}/api/db`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'omit',
            body: JSON.stringify({ op: 'remove', path })
        });
        if (!resp.ok) throw new Error(`db remove ${resp.status}`);
    }

    async function dbPush(path, value) {
        const resp = await fetch(`${API_BASE}/api/db`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'omit',
            body: JSON.stringify({ op: 'push', path, value })
        });
        if (!resp.ok) throw new Error(`db push ${resp.status}`);
        const data = await resp.json();
        return data && data.key ? data.key : '';
    }

    function shouldSendPageView() {
        const last = localStorage.getItem(PAGE_VIEW_CACHE_KEY);
        const now = Date.now();
        if (!last) {
            localStorage.setItem(PAGE_VIEW_CACHE_KEY, JSON.stringify({ ts: now, path: location.pathname }));
            return true;
        }
        try {
            const parsed = JSON.parse(last);
            if (parsed.path !== location.pathname || now - parsed.ts > 5 * 60 * 1000) {
                localStorage.setItem(PAGE_VIEW_CACHE_KEY, JSON.stringify({ ts: now, path: location.pathname }));
                return true;
            }
        } catch {
            localStorage.setItem(PAGE_VIEW_CACHE_KEY, JSON.stringify({ ts: now, path: location.pathname }));
            return true;
        }
        return false;
    }

    async function recordLogin(uid, profile) {
        const now = Date.now();
        const last = Number(localStorage.getItem(LOGIN_CACHE_KEY) || 0);
        if (now - last < 6 * 60 * 60 * 1000) return;
        localStorage.setItem(LOGIN_CACHE_KEY, String(now));
        await dbPush(`${DB_ROOT}/${uid}/logins`, {
            ts: now,
            nickname: profile.nickname || '',
            avatarUrl: profile.avatarUrl || '',
            login: profile.login || '',
            loginType: profile.loginType || '',
            deviceId: getDeviceId(),
            ua: navigator.userAgent || ''
        });
    }

    async function recordPageView(uid, profile) {
        if (!shouldSendPageView()) return;
        await dbPush(`${DB_ROOT}/${uid}/events`, {
            ts: Date.now(),
            path: location.pathname,
            title: document.title || '',
            nickname: profile.nickname || '',
            avatarUrl: profile.avatarUrl || '',
            login: profile.login || '',
            loginType: profile.loginType || ''
        });
    }

    async function getRemoteProfile(uid) {
        const data = await dbGet(`${DB_ROOT}/${uid}/profile`);
        return data || null;
    }

    function getLocalProfileMeta() {
        if (window.QuarkUserProfile && typeof window.QuarkUserProfile.getStoredProfile === 'function') {
            return window.QuarkUserProfile.getStoredProfile();
        }
        return null;
    }

    function applyRemoteProfile(remote) {
        if (!remote || typeof remote !== 'object') return false;
        if (!window.QuarkUserProfile || typeof window.QuarkUserProfile.syncProfile !== 'function') return false;
        window.QuarkUserProfile.syncProfile(remote);
        return true;
    }

    async function upsertProfile(uid, profile, createdAt) {
        const ipInfo = await fetchIpInfo();
        await dbSet(`${DB_ROOT}/${uid}/profile`, {
            uid,
            nickname: profile.nickname || '',
            login: profile.login || '',
            loginType: profile.loginType || '',
            avatarUrl: profile.avatarUrl || '',
            avatarType: profile.avatarType || 'color',
            avatarColor: profile.avatarColor || '',
            profileUrl: profile.profileUrl || '',
            ip: ipInfo?.ip || '',
            province: ipInfo?.province || '',
            city: ipInfo?.city || '',
            district: ipInfo?.district || '',
            createdAt: createdAt || Date.now(),
            updatedAt: Date.now()
        });
    }

    async function migrateLegacyUid(targetUid) {
        const legacyUid = getLegacyUid();
        if (!legacyUid || legacyUid === targetUid) return;
        try {
            const legacyData = await dbGet(`${DB_ROOT}/${legacyUid}`);
            if (!legacyData) return;

            const targetData = await dbGet(`${DB_ROOT}/${targetUid}`) || {};

            const legacyProfile = legacyData.profile || {};
            const targetProfile = targetData.profile || {};
            const legacyUpdatedAt = legacyProfile.updatedAt || 0;
            const targetUpdatedAt = targetProfile.updatedAt || 0;

            const mergedProfile = legacyUpdatedAt > targetUpdatedAt
                ? legacyProfile
                : targetProfile;

            const mergedEvents = {
                ...(legacyData.events || {}),
                ...(targetData.events || {})
            };

            const mergedLogins = {
                ...(legacyData.logins || {}),
                ...(targetData.logins || {})
            };

            await dbUpdate(`${DB_ROOT}/${targetUid}`, {
                profile: mergedProfile,
                events: mergedEvents,
                logins: mergedLogins
            });

            await dbRemove(`${DB_ROOT}/${legacyUid}`);
            localStorage.setItem('quark_uid', targetUid);
        } catch (error) {
            console.warn('迁移旧UID失败:', error);
        }
    }

    async function heartbeat(uid, profile) {
        const ipInfo = await fetchIpInfo();
        await dbSet(`${PRESENCE_ROOT}/${uid}`, {
            uid,
            nickname: profile.nickname || '',
            login: profile.login || '',
            loginType: profile.loginType || '',
            avatarUrl: profile.avatarUrl || '',
            avatarType: profile.avatarType || 'color',
            avatarColor: profile.avatarColor || '',
            path: location.pathname,
            title: document.title || '',
            ip: ipInfo?.ip || '',
            province: ipInfo?.province || '',
            city: ipInfo?.city || '',
            district: ipInfo?.district || '',
            lastSeen: Date.now()
        });
    }

    async function run() {
        const uid = getUid();
        await migrateLegacyUid(uid);
        let profile = getProfile();

        const localMeta = getLocalProfileMeta();
        const remoteProfile = await getRemoteProfile(uid);
        const remoteUpdatedAt = remoteProfile && typeof remoteProfile.updatedAt === 'number' ? remoteProfile.updatedAt : 0;
        const localUpdatedAt = localMeta && typeof localMeta.updatedAt === 'number' ? localMeta.updatedAt : 0;
        if (remoteUpdatedAt > localUpdatedAt) {
            const applied = applyRemoteProfile(remoteProfile);
            if (applied) {
                profile = getProfile();
            }
        }

        const createdAt = remoteProfile && typeof remoteProfile.createdAt === 'number' ? remoteProfile.createdAt : 0;
        await upsertProfile(uid, profile, createdAt);

        if (localStorage.getItem('github_user') || localStorage.getItem('qb_user')) {
            await recordLogin(uid, profile);
        }
        await recordPageView(uid, profile);
        await heartbeat(uid, profile);

        window.setInterval(() => {
            const latestProfile = getProfile();
            heartbeat(uid, latestProfile).catch(() => { });
        }, 10 * 60 * 1000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            run().catch(() => { });
        });
    } else {
        run().catch(() => { });
    }
})();
