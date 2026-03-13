// @ts-check

(function () {
    if (window.CommentShared) return;

    function escapeHtml(text) {
        return String(text ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function getGuestUid() {
        let uid = localStorage.getItem('quark_uid');
        if (!uid) {
            uid = `q_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
            localStorage.setItem('quark_uid', uid);
        }
        return uid;
    }

    function renderGuestBadge(uid) {
        if (!uid) return '';
        const suffix = String(uid).slice(-4);
        return `<span class="login-badge guest-badge">@访客${escapeHtml(suffix)}</span>`;
    }

    function renderLoginBadge(login, loginType) {
        if (!login) return '';
        const icon = loginType === 'local'
            ? `<span class="login-icon"><img src="/assets/img/logo_blue.png" alt="qb"></span>`
            : `<i class="fab fa-github login-icon"></i>`;
        return `<span class="login-badge">${icon}@${escapeHtml(login)}</span>`;
    }

    function renderDisplayName(nickname, login, loginType, uid) {
        const base = escapeHtml(nickname || login || '访客');
        if (login) {
            return `${base}${renderLoginBadge(login, loginType)}`;
        }
        return `${base}${renderGuestBadge(uid)}`;
    }

    function getLoginProfile() {
        const profile = window.QuarkUserProfile && typeof window.QuarkUserProfile.getProfile === 'function'
            ? window.QuarkUserProfile.getProfile()
            : null;
        let nickname = localStorage.getItem('nickname') || '';
        let avatarType = localStorage.getItem('avatarType') || 'color';
        let avatarColor = localStorage.getItem('userColor') || '#4a6cf7';
        let avatarUrl = localStorage.getItem('userAvatarUrl') || '';
        let login = '';
        let loginType = '';

        if (profile) {
            if (profile.nickname) nickname = profile.nickname;
            if (profile.login) login = profile.login;
            if (profile.loginType) loginType = profile.loginType;
            if (profile.avatarType) avatarType = profile.avatarType;
            if (profile.avatarColor) avatarColor = profile.avatarColor;
            if (profile.avatarUrl) {
                avatarType = 'image';
                avatarUrl = profile.avatarUrl;
            }
        }

        if (!login) {
            const githubUser = localStorage.getItem('github_user');
            if (githubUser) {
                try {
                    login = JSON.parse(githubUser).login || '';
                    if (login) loginType = 'github';
                } catch {
                    login = '';
                }
            }
        }

        if (!login) {
            const qbUser = localStorage.getItem('qb_user');
            if (qbUser) {
                try {
                    const data = JSON.parse(qbUser);
                    login = data.login || data.username || '';
                    loginType = login ? 'local' : '';
                } catch {
                    login = '';
                }
            }
        }

        const isLoggedUser = Boolean(localStorage.getItem('github_code') || localStorage.getItem('github_user') || localStorage.getItem('qb_user'));
        if (isLoggedUser && !nickname) {
            nickname = login || '已登录';
        }

        const uid = window.QuarkUserProfile && typeof window.QuarkUserProfile.getUid === 'function'
            ? window.QuarkUserProfile.getUid()
            : '';

        return {
            nickname,
            login,
            loginType,
            isLoggedUser,
            avatarType,
            avatarColor,
            avatarUrl,
            uid
        };
    }

    function clearLoginStorage() {
        const keys = [
            'github_code',
            'github_user',
            'github_login',
            'qb_user',
            'qb_login',
            'quark_login_type',
            'quark_user_profile'
        ];
        keys.forEach((key) => {
            try {
                localStorage.removeItem(key);
            } catch {
                // ignore
            }
        });
        try {
            sessionStorage.removeItem('github_code');
            sessionStorage.removeItem('github_user');
        } catch {
            // ignore
        }
    }

    function logout(redirectUrl) {
        clearLoginStorage();
        try {
            window.dispatchEvent(new CustomEvent('quark-user-updated', { detail: { logout: true } }));
        } catch {
            // ignore
        }
        if (redirectUrl) {
            window.location.href = redirectUrl;
        } else {
            window.location.reload();
        }
    }

    window.CommentShared = {
        escapeHtml,
        getGuestUid,
        renderGuestBadge,
        renderLoginBadge,
        renderDisplayName,
        getLoginProfile,
        clearLoginStorage,
        logout
    };
})();
