// Shared Firebase readiness helpers (config + shim + database)
(function () {
  if (window.QuarkFirebaseReady) return;

  const API_BASE = '__API_BASE__';

  function getConfig() {
    return window.firebaseConfig || window._firebaseConfig || null;
  }

  function ensureConfigObserver(resolve) {
    if (typeof window.__firebaseConfigLoaded !== 'function') {
      window.__firebaseConfigLoaded = (config) => {
        if (config && config.projectId) {
          window.firebaseConfig = config;
          resolve(config);
        }
      };
    }

    if (!Object.getOwnPropertyDescriptor(window, 'firebaseConfig')) {
      Object.defineProperty(window, 'firebaseConfig', {
        set(value) {
          if (value && value.projectId) {
            resolve(value);
          }
          this._firebaseConfig = value;
        },
        get() {
          return this._firebaseConfig;
        },
        configurable: true
      });
    }
  }

  function loadConfigScript(options = {}) {
    const {
      id = 'firebase-config-loader',
      force = false,
      timeout = 15000
    } = options;

    return new Promise((resolve, reject) => {
      const existing = getConfig();
      if (existing && existing.projectId) {
        resolve(existing);
        return;
      }

      ensureConfigObserver(resolve);

      if (force) {
        const old = document.getElementById(id);
        if (old) old.remove();
      }

      if (!document.getElementById(id)) {
        const script = document.createElement('script');
        script.id = id;
        script.src = `${API_BASE}/api/firebase-config?v=${Date.now()}`;
        script.async = true;
        script.onload = () => {
          const config = getConfig();
          if (config && config.projectId) {
            resolve(config);
          }
        };
        script.onerror = () => reject(new Error('firebase-config load failed'));
        document.head.appendChild(script);
      }

      if (timeout) {
        window.setTimeout(() => {
          const config = getConfig();
          if (config && config.projectId) {
            resolve(config);
          } else {
            reject(new Error('firebase-config timeout'));
          }
        }, timeout);
      }
    });
  }

  function waitForConfig(timeout = 15000) {
    return new Promise((resolve, reject) => {
      const existing = getConfig();
      if (existing && existing.projectId) {
        resolve(existing);
        return;
      }

      ensureConfigObserver(resolve);

      const started = Date.now();
      const timer = window.setInterval(() => {
        const config = getConfig();
        if (config && config.projectId) {
          window.clearInterval(timer);
          resolve(config);
          return;
        }
        if (Date.now() - started > timeout) {
          window.clearInterval(timer);
          reject(new Error('firebase-config timeout'));
        }
      }, 300);
    });
  }

  function waitForShim(timeout = 15000) {
    return new Promise((resolve, reject) => {
      if (window.firebase && window.firebase.database) {
        resolve();
        return;
      }
      const started = Date.now();
      const timer = window.setInterval(() => {
        if (window.firebase && window.firebase.database) {
          window.clearInterval(timer);
          resolve();
          return;
        }
        if (Date.now() - started > timeout) {
          window.clearInterval(timer);
          reject(new Error('Firebase代理未就绪'));
        }
      }, 120);
    });
  }

  async function ensureDatabase(options = {}) {
    const {
      timeout = 15000,
      scriptId = 'firebase-config-loader',
      loadConfig = true
    } = options;

    if (loadConfig) {
      try {
        await loadConfigScript({ id: scriptId, timeout });
      } catch {
        // fallback to waitForConfig
      }
    }

    const config = await waitForConfig(timeout).catch(() => getConfig());
    await waitForShim(timeout);

    if (!window.firebase || !window.firebase.database) {
      throw new Error('Firebase代理未就绪');
    }
    if (!window.firebase.apps || !window.firebase.apps.length) {
      if (config && config.projectId) {
        window.firebase.initializeApp(config);
      }
    }
    return window.firebase.database();
  }

  window.QuarkFirebaseReady = {
    getConfig,
    loadConfigScript,
    waitForConfig,
    waitForShim,
    ensureDatabase
  };
})();
