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

    window.CommentShared = {
        escapeHtml,
        getGuestUid,
        renderGuestBadge,
        renderLoginBadge,
        renderDisplayName
    };
})();
