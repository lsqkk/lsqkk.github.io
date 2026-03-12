// @ts-check

(function () {
  if (window.__quarkAppCheckBooted) return;
  window.__quarkAppCheckBooted = true;

  const SITE_KEY = window.__APP_CHECK_SITE_KEY__ || '';

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

  function activate() {
    if (!SITE_KEY) return;
    if (!window.firebase || !window.firebase.appCheck) return;
    if (window.__quarkAppCheckActivated) return;
    try {
      window.firebase.appCheck().activate(SITE_KEY, true);
      window.__quarkAppCheckActivated = true;
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
