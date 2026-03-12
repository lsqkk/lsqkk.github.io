// @ts-check

(function () {
  if (window.CommentListShared) return;

  function getDisplayName(nickname, login, loginType, uid) {
    const shared = window.CommentShared;
    if (shared && typeof shared.renderDisplayName === 'function') {
      return shared.renderDisplayName(nickname || '', login || '', loginType || '', uid || '');
    }
    const base = nickname || login || '访客';
    if (login) {
      const icon = loginType === 'local'
        ? `<span class="login-icon"><img src="/assets/img/logo_blue.png" alt="qb"></span>`
        : `<i class="fab fa-github login-icon"></i>`;
      return `${base}<span class="login-badge">${icon}@${login}</span>`;
    }
    return base;
  }

  function paginate(list, page, pageSize) {
    const startIndex = (page - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, list.length);
    return list.slice(startIndex, endIndex);
  }

  function renderPagination(opts) {
    const container = opts.container;
    if (!(container instanceof HTMLElement)) return;
    const totalPages = Math.ceil(opts.total / opts.pageSize);
    container.innerHTML = '';
    if (totalPages <= 1) return;

    const makeBtn = (label, page, active = false) => {
      const btn = document.createElement('button');
      btn.className = `page-btn${active ? ' active' : ''}`;
      btn.textContent = label;
      btn.addEventListener('click', () => {
        opts.onChange(page);
      });
      return btn;
    };

    if (opts.showArrows && opts.current > 1) {
      const prev = makeBtn('‹', opts.current - 1, false);
      container.appendChild(prev);
    }

    for (let i = 1; i <= totalPages; i += 1) {
      container.appendChild(makeBtn(String(i), i, i === opts.current));
    }

    if (opts.showArrows && opts.current < totalPages) {
      const next = makeBtn('›', opts.current + 1, false);
      container.appendChild(next);
    }
  }

  function incrementLike(ref) {
    if (!ref || typeof ref.transaction !== 'function') return;
    ref.transaction((value) => {
      const current = typeof value === 'number' ? value : 0;
      return current + 1;
    });
  }

  window.CommentListShared = {
    getDisplayName,
    paginate,
    renderPagination,
    incrementLike
  };
})();
