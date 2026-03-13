// Shared Turnstile helper
(function () {
  if (window.QuarkTurnstile) return;

  const API_BASE = '__API_BASE__';
  const widgetIds = new Map();
  const tokens = new Map();

  function getSiteKey() {
    return window.__TURNSTILE_SITE_KEY__ || '';
  }

  function waitReady() {
    return new Promise((resolve) => {
      if (window.turnstile && typeof window.turnstile.render === 'function') {
        resolve();
        return;
      }
      const timer = window.setInterval(() => {
        if (window.turnstile && typeof window.turnstile.render === 'function') {
          window.clearInterval(timer);
          resolve();
        }
      }, 200);
    });
  }

  function render(container, kind, options = {}) {
    const key = getSiteKey();
    if (!key || !(container instanceof HTMLElement)) return null;
    if (!window.turnstile || typeof window.turnstile.render !== 'function') return null;
    container.innerHTML = '';
    tokens.set(kind, '');
    const theme = document.body.classList.contains('dark-mode') ? 'dark' : 'light';
    const widgetId = window.turnstile.render(container, {
      sitekey: key,
      theme,
      callback: (token) => {
        tokens.set(kind, token || '');
      },
      'expired-callback': () => {
        tokens.set(kind, '');
      },
      'error-callback': () => {
        tokens.set(kind, '');
      },
      ...options
    });
    widgetIds.set(kind, widgetId);
    return widgetId;
  }

  function getResponse(kind) {
    if (!window.turnstile || typeof window.turnstile.getResponse !== 'function') return '';
    const widgetId = widgetIds.get(kind);
    if (widgetId === null || typeof widgetId === 'undefined') return '';
    return window.turnstile.getResponse(widgetId) || '';
  }

  function getToken(kind) {
    return tokens.get(kind) || getResponse(kind) || '';
  }

  function reset(kind) {
    if (!window.turnstile || typeof window.turnstile.reset !== 'function') return;
    const widgetId = widgetIds.get(kind);
    if (widgetId === null || typeof widgetId === 'undefined') return;
    tokens.set(kind, '');
    window.turnstile.reset(widgetId);
  }

  async function verify(kind, statusCb, purposeOverride) {
    const key = getSiteKey();
    if (!key) {
      if (typeof statusCb === 'function') statusCb('验证码未配置，请联系站长');
      return false;
    }
    const token = getToken(kind);
    if (!token) {
      if (typeof statusCb === 'function') statusCb('请先完成安全校验');
      return false;
    }
    try {
      const resp = await fetch(`${API_BASE}/api/turnstile-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, purpose: purposeOverride || kind })
      });
      const data = await resp.json();
      if (resp.ok && data && data.ok) return true;
      if (typeof statusCb === 'function') statusCb(data?.error || '验证码校验失败');
      reset(kind);
      return false;
    } catch (error) {
      console.error('验证码校验失败:', error);
      if (typeof statusCb === 'function') statusCb('验证码校验失败');
      reset(kind);
      return false;
    }
  }

  window.QuarkTurnstile = {
    getSiteKey,
    waitReady,
    render,
    getToken,
    reset,
    verify
  };
})();
