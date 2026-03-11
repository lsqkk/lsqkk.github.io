// @ts-check

(function () {
    const PROFILE_KEY = 'quark_user_profile';
    const GITHUB_USER_KEY = 'github_user';
    const UID_KEY = 'quark_uid';

    function safeParse(raw) {
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch {
            return null;
        }
    }

    function readStoredProfile() {
        const data = safeParse(localStorage.getItem(PROFILE_KEY));
        if (!data || typeof data !== 'object') return null;
        return data;
    }

    function readGithubUser() {
        const raw = localStorage.getItem(GITHUB_USER_KEY);
        const data = safeParse(raw);
        if (!data || typeof data !== 'object') return null;
        const nickname = data.name || data.login || data.nickname || '';
        const login = data.login || '';
        const avatarUrl = data.avatar_url || data.avatarUrl || data.avatar || '';
        const profileUrl = data.html_url || data.profileUrl || '';
        return { nickname, login, avatarUrl, profileUrl };
    }

    function readLocalProfile() {
        const nickname = (localStorage.getItem('nickname') || '').trim();
        const avatarUrl = (localStorage.getItem('postAnnoAvatarUrl') || '').trim();
        const avatarColor = localStorage.getItem('postAnnoAvatarColor') || '#2563eb';
        const avatarType = avatarUrl ? 'image' : (localStorage.getItem('postAnnoAvatarType') === 'image' ? 'image' : 'color');
        const stored = readStoredProfile();
        const updatedAt = stored && typeof stored.updatedAt === 'number' ? stored.updatedAt : 0;
        return { nickname, avatarUrl, avatarColor, avatarType, updatedAt };
    }

    function buildProfile() {
        const githubUser = readGithubUser();
        const local = readLocalProfile();
        const nickname = local.nickname || ((githubUser && githubUser.nickname) ? githubUser.nickname : '');
        const avatarUrl = local.avatarUrl || ((githubUser && githubUser.avatarUrl) ? githubUser.avatarUrl : '');
        const login = (githubUser && githubUser.login) ? githubUser.login : '';
        const avatarType = avatarUrl ? 'image' : local.avatarType;
        const avatarColor = local.avatarColor || '#2563eb';
        const profileUrl = (githubUser && githubUser.profileUrl) ? githubUser.profileUrl : '';
        const updatedAt = local.updatedAt || 0;
        return { nickname, login, avatarUrl, avatarType, avatarColor, profileUrl, updatedAt };
    }

    function getUid() {
        const githubUser = readGithubUser();
        if (githubUser && githubUser.login) {
            return `gh_${String(githubUser.login).toLowerCase()}`;
        }
        let uid = localStorage.getItem(UID_KEY);
        if (!uid) {
            uid = `q_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
            localStorage.setItem(UID_KEY, uid);
        }
        return uid;
    }

    let syncing = false;

    function syncProfile(profile) {
        if (!profile || typeof profile !== 'object') return;
        if (syncing) return;
        syncing = true;
        const updatedAt = typeof profile.updatedAt === 'number' ? profile.updatedAt : Date.now();
        if (typeof profile.nickname === 'string') {
            const nickname = profile.nickname.trim();
            if (nickname) localStorage.setItem('nickname', nickname);
            else localStorage.removeItem('nickname');
        }
        if (profile.login) localStorage.setItem('github_login', profile.login);
        localStorage.setItem('postAnnoAvatarType', profile.avatarType || 'color');
        if (profile.avatarColor) localStorage.setItem('postAnnoAvatarColor', profile.avatarColor);
        if (typeof profile.avatarUrl === 'string') {
            if (profile.avatarUrl) localStorage.setItem('postAnnoAvatarUrl', profile.avatarUrl);
            else localStorage.removeItem('postAnnoAvatarUrl');
        }
        localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...profile, updatedAt }));
        try {
            window.dispatchEvent(new CustomEvent('quark-user-updated', { detail: { ...profile, updatedAt } }));
        } catch {
            // ignore
        }
        syncing = false;
    }

    function getProfile() {
        const profile = buildProfile();
        return profile;
    }

    window.QuarkUserProfile = {
        getProfile,
        syncProfile,
        getUid,
        getStoredProfile: readStoredProfile
    };
})();
