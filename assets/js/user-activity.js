// @ts-check

(function () {
    const DB_ROOT = 'user_activity';
    const PRESENCE_ROOT = 'presence';
    const LOGIN_CACHE_KEY = 'quark_last_login_at';
    const PAGE_VIEW_CACHE_KEY = 'quark_last_page_view';

    let bootPromise = null;
    let rootRef = null;
    let presenceRef = null;

    function getProfile() {
        if (window.QuarkUserProfile && typeof window.QuarkUserProfile.getProfile === 'function') {
            return window.QuarkUserProfile.getProfile();
        }
        return {
            nickname: localStorage.getItem('nickname') || '',
            login: localStorage.getItem('github_login') || '',
            avatarUrl: '',
            avatarType: 'color',
            avatarColor: '#2563eb',
            profileUrl: ''
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

    function loadScript(src, id) {
        return new Promise((resolve, reject) => {
            const existing = document.getElementById(id);
            if (existing) {
                resolve();
                return;
            }
            const script = document.createElement('script');
            script.id = id;
            script.src = src;
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`load failed: ${src}`));
            document.head.appendChild(script);
        });
    }

    function waitForFirebaseConfig(timeout = 20000) {
        return new Promise((resolve, reject) => {
            const start = Date.now();
            const timer = window.setInterval(() => {
                const config = window.firebaseConfig || window._firebaseConfig;
                if (config && config.projectId) {
                    window.clearInterval(timer);
                    resolve(config);
                    return;
                }
                if (Date.now() - start > timeout) {
                    window.clearInterval(timer);
                    reject(new Error('firebase config timeout'));
                }
            }, 200);
        });
    }

    async function ensureFirebaseReady() {
        if (rootRef) return;
        if (bootPromise) {
            await bootPromise;
            return;
        }
        bootPromise = (async () => {
            if (typeof window.firebase === 'undefined' || !window.firebase.database) {
                await loadScript('https://www.gstatic.com/firebasejs/8.10.0/firebase-app.js', 'activity-firebase-app');
                await loadScript('https://www.gstatic.com/firebasejs/8.10.0/firebase-database.js', 'activity-firebase-db');
            }
            if (!window.firebaseConfig) {
                await loadScript(`__API_BASE__/api/firebase-config?v=${Date.now()}`, 'activity-firebase-config');
                await waitForFirebaseConfig(20000);
            }
            if (!window.firebase.apps || !window.firebase.apps.length) {
                window.firebase.initializeApp(window.firebaseConfig);
            }
            rootRef = window.firebase.database().ref(DB_ROOT);
            presenceRef = window.firebase.database().ref(PRESENCE_ROOT);
        })();
        await bootPromise;
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
        await rootRef.child(uid).child('logins').push({
            ts: now,
            nickname: profile.nickname || '',
            avatarUrl: profile.avatarUrl || '',
            login: profile.login || ''
        });
    }

    async function recordPageView(uid, profile) {
        if (!shouldSendPageView()) return;
        await rootRef.child(uid).child('events').push({
            ts: Date.now(),
            path: location.pathname,
            title: document.title || '',
            nickname: profile.nickname || '',
            avatarUrl: profile.avatarUrl || '',
            login: profile.login || ''
        });
    }

    async function upsertProfile(uid, profile) {
        await rootRef.child(uid).child('profile').set({
            uid,
            nickname: profile.nickname || '',
            login: profile.login || '',
            avatarUrl: profile.avatarUrl || '',
            avatarType: profile.avatarType || 'color',
            avatarColor: profile.avatarColor || '',
            profileUrl: profile.profileUrl || '',
            updatedAt: Date.now()
        });
    }

    async function heartbeat(uid, profile) {
        await presenceRef.child(uid).set({
            uid,
            nickname: profile.nickname || '',
            login: profile.login || '',
            avatarUrl: profile.avatarUrl || '',
            avatarType: profile.avatarType || 'color',
            avatarColor: profile.avatarColor || '',
            path: location.pathname,
            title: document.title || '',
            lastSeen: Date.now()
        });
    }

    async function run() {
        await ensureFirebaseReady();
        const uid = getUid();
        const profile = getProfile();
        await upsertProfile(uid, profile);

        if (localStorage.getItem('github_user')) {
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
