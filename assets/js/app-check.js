// @ts-check

(function () {
  if (window.__quarkAppCheckBooted) return;
  window.__quarkAppCheckBooted = true;

  const SITE_KEY = window.__APP_CHECK_SITE_KEY__ || '';
  const DEBUG_FLAG_KEY = 'quark_appcheck_debug';
  const ASSESS_FLAG_KEY = 'quark_appcheck_assess_done';
  const ASSESS_TTL_MS = 6 * 60 * 60 * 1000;
  if (!window.__quarkAppCheckReady) {
    window.__quarkAppCheckReady = Promise.resolve();
  }
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('appcheck_debug') === '1') {
    try {
      localStorage.setItem(DEBUG_FLAG_KEY, '1');
    } catch {
      // ignore
    }
  }
  if (localStorage.getItem(DEBUG_FLAG_KEY) === '1') {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }

  function loadSdk() {
    return new Promise((resolve) => {
      if (window.firebase && window.firebase.appCheck) {
        resolve();
        return;
      }
      const existing = document.getElementById('firebase-app-check-sdk');
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.id = 'firebase-app-check-sdk';
      script.src = 'https://www.gstatic.com/firebasejs/8.10.0/firebase-app-check.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => resolve();
      document.head.appendChild(script);
    });
  }

  function loadRecaptcha() {
    return new Promise((resolve) => {
      if (!SITE_KEY) {
        resolve();
        return;
      }
      if (window.grecaptcha && typeof window.grecaptcha.render === 'function') {
        resolve();
        return;
      }
      const existing = document.getElementById('recaptcha-sdk');
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.id = 'recaptcha-sdk';
      script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(SITE_KEY)}`;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => resolve();
      document.head.appendChild(script);
    });
  }

  function shouldRequestAssessment() {
    try {
      const raw = localStorage.getItem(ASSESS_FLAG_KEY);
      if (!raw) return true;
      const last = Number(raw);
      if (!Number.isFinite(last)) return true;
      return Date.now() - last > ASSESS_TTL_MS;
    } catch {
      return true;
    }
  }

  async function requestAssessment() {
    if (!SITE_KEY) return;
    if (!shouldRequestAssessment()) return;
    await loadRecaptcha();
    if (!(window.grecaptcha && typeof window.grecaptcha.execute === 'function')) {
      return;
    }
    try {
      let token = '';
      if (typeof window.grecaptcha.ready === 'function') {
        await new Promise((resolve) => window.grecaptcha.ready(resolve));
      }
      token = await window.grecaptcha.execute(SITE_KEY, { action: 'app_check' });
      if (!token) return;
      const resp = await fetch('__API_BASE__/api/recaptcha-assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action: 'app_check' })
      });
      const data = await resp.json();
      if (resp.ok && data && data.ok) {
        localStorage.setItem(ASSESS_FLAG_KEY, String(Date.now()));
      }
    } catch {
      // ignore
    }
  }

  async function activate() {
    if (!SITE_KEY) return;
    if (!window.firebase || !window.firebase.appCheck) return;
    if (window.__quarkAppCheckActivated) return;
    await loadRecaptcha();
    try {
      window.firebase.appCheck().activate(SITE_KEY, true);
      window.__quarkAppCheckReady = window.firebase.appCheck().getToken(true)
        .then(() => true)
        .catch(() => false);
      window.__quarkAppCheckActivated = true;
      void requestAssessment();
      // Minimal diagnostics for App Check failures
      try {
        const cfg = window.firebaseConfig || window._firebaseConfig || {};
        console.info('[app-check] activated', {
          origin: window.location.origin,
          appId: cfg.appId || '',
          apiKey: cfg.apiKey ? `${String(cfg.apiKey).slice(0, 6)}***` : '',
          siteKey: SITE_KEY ? `${SITE_KEY.slice(0, 6)}***` : '',
          debug: localStorage.getItem(DEBUG_FLAG_KEY) === '1'
        });
      } catch {
        // ignore
      }
    } catch {
      // ignore
    }
  }

  function patchInitialize() {
    if (!window.firebase || window.__quarkInitPatched) return;
    const original = window.firebase.initializeApp;
    if (typeof original !== 'function') return;
    window.firebase.initializeApp = function (...args) {
      const app = original.apply(window.firebase, args);
      void loadSdk().then(() => activate());
      return app;
    };
    window.__quarkInitPatched = true;
  }

  function bootstrap() {
    if (!SITE_KEY) return;
    if (window.firebase) {
      patchInitialize();
      if (window.firebase.apps && window.firebase.apps.length) {
        void loadSdk().then(() => activate());
      }
      void requestAssessment();
      return;
    }
    const timer = window.setInterval(() => {
      if (!window.firebase) return;
      window.clearInterval(timer);
      patchInitialize();
    }, 200);
    window.setTimeout(() => window.clearInterval(timer), 15000);
  }

  bootstrap();
})();
