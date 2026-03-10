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
        return { nickname, avatarUrl, avatarColor, avatarType };
    }

    function buildProfile() {
        const githubUser = readGithubUser();
        const local = readLocalProfile();
        const nickname = (githubUser && githubUser.nickname) ? githubUser.nickname : (local.nickname || '');
        const avatarUrl = (githubUser && githubUser.avatarUrl) ? githubUser.avatarUrl : (local.avatarUrl || '');
        const login = (githubUser && githubUser.login) ? githubUser.login : '';
        const avatarType = avatarUrl ? 'image' : local.avatarType;
        const avatarColor = local.avatarColor || '#2563eb';
        const profileUrl = (githubUser && githubUser.profileUrl) ? githubUser.profileUrl : '';
        return { nickname, login, avatarUrl, avatarType, avatarColor, profileUrl };
    }

    function getUid() {
        let uid = localStorage.getItem(UID_KEY);
        if (!uid) {
            uid = `q_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
            localStorage.setItem(UID_KEY, uid);
        }
        return uid;
    }

    function syncProfile(profile) {
        if (!profile || typeof profile !== 'object') return;
        if (profile.nickname) localStorage.setItem('nickname', profile.nickname);
        if (profile.login) localStorage.setItem('github_login', profile.login);
        localStorage.setItem('postAnnoAvatarType', profile.avatarType || 'color');
        if (profile.avatarColor) localStorage.setItem('postAnnoAvatarColor', profile.avatarColor);
        if (profile.avatarUrl) localStorage.setItem('postAnnoAvatarUrl', profile.avatarUrl);
        localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
        try {
            window.dispatchEvent(new CustomEvent('quark-user-updated', { detail: profile }));
        } catch {
            // ignore
        }
    }

    function getProfile() {
        const profile = buildProfile();
        if (profile.nickname || profile.avatarUrl) {
            syncProfile(profile);
        }
        return profile;
    }

    window.QuarkUserProfile = {
        getProfile,
        syncProfile,
        getUid
    };
})();
