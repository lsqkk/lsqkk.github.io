// @ts-check

(function () {
  if (window.__quarkLoginInited) return;
  window.__quarkLoginInited = true;

  const API_BASE = '__API_BASE__';
  const DB_USERS = 'qb_users';
  const DB_EMAIL_INDEX = 'qb_email_index';
  const LOGIN_TYPE_KEY = 'quark_login_type';
  const QB_USER_KEY = 'qb_user';
  const QB_LOGIN_KEY = 'qb_login';

  /** @type {Record<string, any>} */
  const el = {};

  function cacheElements() {
    el.githubBtn = document.getElementById('githubLoginBtn');
    el.tabButtons = document.querySelectorAll('.tab-btn');
    el.tabPanels = document.querySelectorAll('.tab-panel');
    el.loginUsername = document.getElementById('loginUsername');
    el.loginPassword = document.getElementById('loginPassword');
    el.turnstileContainer = document.getElementById('turnstileContainer');
    el.loginSubmit = document.getElementById('loginSubmit');
    el.loginReset = document.getElementById('loginReset');
    el.loginStatus = document.getElementById('loginStatus');
    el.emailLoginAddress = document.getElementById('emailLoginAddress');
    el.emailLoginCode = document.getElementById('emailLoginCode');
    el.emailLoginSend = document.getElementById('emailLoginSend');
    el.emailLoginSubmit = document.getElementById('emailLoginSubmit');
    el.toggleReset = document.getElementById('toggleReset');
    el.resetPanel = document.getElementById('resetPanel');
    el.resetEmail = document.getElementById('resetEmail');
    el.resetCode = document.getElementById('resetCode');
    el.resetSend = document.getElementById('resetSend');
    el.resetPassword = document.getElementById('resetPassword');
    el.resetPassword2 = document.getElementById('resetPassword2');
    el.resetSubmit = document.getElementById('resetSubmit');
    el.resetStatus = document.getElementById('resetStatus');
    el.registerUsername = document.getElementById('registerUsername');
    el.registerEmail = document.getElementById('registerEmail');
    el.registerEmailCode = document.getElementById('registerEmailCode');
    el.registerEmailSend = document.getElementById('registerEmailSend');
    el.registerNickname = document.getElementById('registerNickname');
    el.registerPassword = document.getElementById('registerPassword');
    el.registerPassword2 = document.getElementById('registerPassword2');
    el.registerSubmit = document.getElementById('registerSubmit');
    el.registerReset = document.getElementById('registerReset');
    el.registerStatus = document.getElementById('registerStatus');
  }

  let turnstileToken = '';
  let turnstileWidgetId = null;
  let firebaseReady = false;
  let emailTokenCache = {};
  let loginMode = 'password';

  function setText(target, value) {
    if (!target) return;
    target.textContent = value;
  }

  function setStatus(target, value) {
    setText(target, value);
  }

  function initThemeSync() {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.body.classList.toggle('dark-mode', media.matches);
      if (window.turnstile && typeof window.turnstile.render === 'function' && getTurnstileSiteKey()) {
        renderTurnstile();
      }
    };
    apply();
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', apply);
    } else if (typeof media.addListener === 'function') {
      media.addListener(apply);
    }
  }

  function switchTab(target) {
    el.tabButtons.forEach((btn) => {
      if (!(btn instanceof HTMLElement)) return;
      btn.classList.toggle('active', btn.dataset.tab === target);
    });
    el.tabPanels.forEach((panel) => {
      if (!(panel instanceof HTMLElement)) return;
      panel.classList.toggle('active', panel.dataset.panel === target);
    });
  }

  function switchLoginMode(mode) {
    loginMode = mode;
    const btns = document.querySelectorAll('.mode-btn');
    btns.forEach((btn) => {
      if (!(btn instanceof HTMLElement)) return;
      btn.classList.toggle('active', btn.dataset.loginMode === mode);
    });
    const panels = document.querySelectorAll('.login-mode');
    panels.forEach((panel) => {
      if (!(panel instanceof HTMLElement)) return;
      panel.classList.toggle('active', panel.dataset.loginPanel === mode);
    });
  }

  function getTurnstileSiteKey() {
    return window.__TURNSTILE_SITE_KEY__ || '';
  }

  function resetTurnstile() {
    turnstileToken = '';
    if (window.turnstile && typeof window.turnstile.reset === 'function' && turnstileWidgetId !== null) {
      window.turnstile.reset(turnstileWidgetId);
    }
  }

  function renderTurnstile() {
    const key = getTurnstileSiteKey();
    if (!key || !el.turnstileContainer) return;
    if (!window.turnstile || typeof window.turnstile.render !== 'function') return;
    el.turnstileContainer.innerHTML = '';
    turnstileToken = '';
    const theme = document.body.classList.contains('dark-mode') ? 'dark' : 'light';
    turnstileWidgetId = window.turnstile.render(el.turnstileContainer, {
      sitekey: key,
      theme,
      callback: (token) => {
        turnstileToken = token || '';
      },
      'expired-callback': () => {
        turnstileToken = '';
      },
      'error-callback': () => {
        turnstileToken = '';
      }
    });
  }

  function waitForTurnstileReady() {
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

  function normalizeUsername(value) {
    return String(value || '').trim().toLowerCase();
  }

  function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function emailKey(email) {
    return normalizeEmail(email).replace(/[.#$/\[\]]/g, '_');
  }

  function validateEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function validateUsername(value) {
    return /^[a-zA-Z]{3,20}$/.test(value);
  }

  function validatePassword(value) {
    return /^(?=.*[a-zA-Z])(?=.*\d)[a-zA-Z\d]{8,20}$/.test(value);
  }

  function buildNickname(username) {
    const uid = `qb_${username}`;
    const suffix = uid.slice(-4);
    return `夸客${suffix}`;
  }

  async function sha256(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  function genSalt() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function getFirebaseConfig() {
    return window.firebaseConfig || window._firebaseConfig || null;
  }

  function waitForFirebaseReady() {
    return new Promise((resolve) => {
      const timer = window.setInterval(() => {
        const config = getFirebaseConfig();
        if (window.firebase && window.firebase.database && config && config.projectId) {
          window.clearInterval(timer);
          resolve(config);
        }
      }, 300);
    });
  }

  async function waitForAppCheck() {
    if (window.__quarkAppCheckReady && typeof window.__quarkAppCheckReady.then === 'function') {
      try {
        await window.__quarkAppCheckReady;
      } catch {
        // ignore
      }
    }
  }

  async function ensureFirebase() {
    if (firebaseReady) return window.firebase.database();
    const config = await waitForFirebaseReady();
    if (!window.firebase.apps || !window.firebase.apps.length) {
      window.firebase.initializeApp(config);
    }
    await waitForAppCheck();
    firebaseReady = true;
    return window.firebase.database();
  }

  function setLocalLogin(profile) {
    localStorage.setItem(LOGIN_TYPE_KEY, 'local');
    localStorage.setItem(QB_LOGIN_KEY, profile.login || '');
    localStorage.setItem(QB_USER_KEY, JSON.stringify(profile));
    localStorage.removeItem('github_user');
    localStorage.removeItem('github_code');
    localStorage.removeItem('github_login');
    if (window.QuarkUserProfile && typeof window.QuarkUserProfile.syncProfile === 'function') {
      window.QuarkUserProfile.syncProfile({
        nickname: profile.nickname || '',
        login: profile.login || '',
        loginType: 'local',
        avatarUrl: profile.avatarUrl || '',
        avatarType: profile.avatarUrl ? 'image' : 'color',
        avatarColor: '#2563eb',
        profileUrl: '',
        updatedAt: Date.now()
      });
    }
  }

  function getEmailTokenKey(purpose, email) {
    return `qb_email_token_${purpose}_${emailKey(email)}`;
  }

  function cacheEmailToken(purpose, email, token) {
    emailTokenCache[getEmailTokenKey(purpose, email)] = token;
    try {
      sessionStorage.setItem(getEmailTokenKey(purpose, email), token);
    } catch {
      // ignore
    }
  }

  function readEmailToken(purpose, email) {
    const key = getEmailTokenKey(purpose, email);
    if (emailTokenCache[key]) return emailTokenCache[key];
    try {
      const stored = sessionStorage.getItem(key);
      if (stored) {
        emailTokenCache[key] = stored;
        return stored;
      }
    } catch {
      // ignore
    }
    return '';
  }

  async function sendEmailCode(email, purpose, statusEl) {
    if (!validateEmail(email)) {
      setStatus(statusEl, '邮箱格式不正确');
      return false;
    }
    setStatus(statusEl, '验证码发送中...');
    try {
      const resp = await fetch(`${API_BASE}/api/email-send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, purpose })
      });
      const data = await resp.json();
      if (!resp.ok || !data?.token) {
        throw new Error(data?.error || '发送失败');
      }
      cacheEmailToken(purpose, email, data.token);
      setStatus(statusEl, '验证码已发送');
      return true;
    } catch (error) {
      console.error('发送邮箱验证码失败:', error);
      setStatus(statusEl, '验证码发送失败');
      return false;
    }
  }

  async function verifyEmailCode(email, code, purpose) {
    const token = readEmailToken(purpose, email);
    if (!token) return false;
    try {
      const resp = await fetch(`${API_BASE}/api/email-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, token, purpose })
      });
      const data = await resp.json();
      return !!(resp.ok && data && data.ok);
    } catch (error) {
      console.error('邮箱验证码校验失败:', error);
      return false;
    }
  }

  async function verifyTurnstileToken(purpose) {
    const key = getTurnstileSiteKey();
    if (!key) {
      setStatus(el.loginStatus, '验证码未配置，请联系站长');
      return false;
    }
    if (!turnstileToken) {
      setStatus(el.loginStatus, '请先完成安全校验');
      return false;
    }
    try {
      const resp = await fetch(`${API_BASE}/api/turnstile-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: turnstileToken, purpose })
      });
      const data = await resp.json();
      if (resp.ok && data && data.ok) return true;
      setStatus(el.loginStatus, data?.error || '验证码校验失败');
      resetTurnstile();
      return false;
    } catch (error) {
      console.error('验证码校验失败:', error);
      setStatus(el.loginStatus, '验证码校验失败');
      resetTurnstile();
      return false;
    }
  }

  async function lookupUsernameByEmail(email) {
    const db = await ensureFirebase();
    const key = emailKey(email);
    const snap = await db.ref(`${DB_EMAIL_INDEX}/${key}`).once('value');
    const value = snap.val();
    return value ? String(value) : '';
  }

  async function loadUserByUsername(username) {
    const db = await ensureFirebase();
    const snap = await db.ref(`${DB_USERS}/${username}`).once('value');
    return snap.exists() ? snap.val() : null;
  }

  async function handleRegister() {
    if (!(el.registerUsername instanceof HTMLInputElement) ||
      !(el.registerPassword instanceof HTMLInputElement) ||
      !(el.registerPassword2 instanceof HTMLInputElement)) {
      return;
    }

    const usernameRaw = el.registerUsername.value;
    const username = normalizeUsername(usernameRaw);
    const nicknameInput = el.registerNickname instanceof HTMLInputElement ? el.registerNickname.value.trim() : '';
    const emailInput = el.registerEmail instanceof HTMLInputElement ? el.registerEmail.value.trim() : '';
    const emailCodeInput = el.registerEmailCode instanceof HTMLInputElement ? el.registerEmailCode.value.trim() : '';
    const password = el.registerPassword.value;
    const password2 = el.registerPassword2.value;

    if (!validateUsername(usernameRaw)) {
      setText(el.registerStatus, '账号名需为 3-20 位英文字母');
      return;
    }
    if (!validatePassword(password)) {
      setText(el.registerStatus, '密码需 8-20 位，包含字母和数字');
      return;
    }
    if (password !== password2) {
      setText(el.registerStatus, '两次输入的密码不一致');
      return;
    }

    setText(el.registerStatus, '正在注册...');

    try {
      const db = await ensureFirebase();
      const userRef = db.ref(`${DB_USERS}/${username}`);
      const snap = await userRef.once('value');
      if (snap.exists()) {
        setText(el.registerStatus, '该账号名已被注册');
        return;
      }

      let email = '';
      if (emailInput) {
        if (!validateEmail(emailInput)) {
          setText(el.registerStatus, '邮箱格式不正确');
          return;
        }
        const emailOk = await verifyEmailCode(emailInput, emailCodeInput, 'register');
        if (!emailOk) {
          setText(el.registerStatus, '邮箱验证码无效或已过期');
          return;
        }
        const existing = await lookupUsernameByEmail(emailInput);
        if (existing) {
          setText(el.registerStatus, '该邮箱已绑定其他账号');
          return;
        }
        email = normalizeEmail(emailInput);
      }

      const salt = genSalt();
      const hash = await sha256(`${salt}:${password}`);
      const nickname = nicknameInput || buildNickname(username);
      const payload = {
        username,
        nickname,
        salt,
        passwordHash: hash,
        email,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      await userRef.set(payload);
      if (email) {
        await db.ref(`${DB_EMAIL_INDEX}/${emailKey(email)}`).set(username);
      }

      setLocalLogin({
        login: username,
        nickname,
        avatarUrl: ''
      });
      setText(el.registerStatus, '注册成功，已自动登录');
      window.location.href = '/a/account';
    } catch (error) {
      console.error('注册失败:', error);
      setText(el.registerStatus, '注册失败，请稍后再试');
    }
  }

  async function handleLogin() {
    if (!(el.loginUsername instanceof HTMLInputElement) ||
      !(el.loginPassword instanceof HTMLInputElement)) {
      return;
    }

    const usernameRaw = el.loginUsername.value;
    const username = normalizeUsername(usernameRaw);
    const password = el.loginPassword.value;

    if (!validateUsername(usernameRaw)) {
      setText(el.loginStatus, '账号名需为 3-20 位英文字母');
      return;
    }
    if (!password) {
      setText(el.loginStatus, '请输入密码');
      return;
    }

    const captchaOk = await verifyTurnstileToken('login');
    if (!captchaOk) return;

    setText(el.loginStatus, '正在登录...');

    try {
      const db = await ensureFirebase();
      const userRef = db.ref(`${DB_USERS}/${username}`);
      const snap = await userRef.once('value');
      if (!snap.exists()) {
        setText(el.loginStatus, '账号不存在');
        return;
      }
      const user = snap.val();
      const hash = await sha256(`${user.salt}:${password}`);
      if (hash !== user.passwordHash) {
        setText(el.loginStatus, '密码错误');
        return;
      }

      const nickname = user.nickname || buildNickname(username);
      setLocalLogin({
        login: username,
        nickname,
        avatarUrl: user.avatarUrl || ''
      });
      setText(el.loginStatus, '登录成功');
      window.location.href = '/a/account';
    } catch (error) {
      console.error('登录失败:', error);
      setText(el.loginStatus, '登录失败，请稍后再试');
    }
  }

  async function handleEmailLogin() {
    if (!(el.emailLoginAddress instanceof HTMLInputElement) ||
      !(el.emailLoginCode instanceof HTMLInputElement)) {
      return;
    }
    const email = el.emailLoginAddress.value.trim();
    const code = el.emailLoginCode.value.trim();
    if (!validateEmail(email)) {
      setText(el.loginStatus, '邮箱格式不正确');
      return;
    }
    if (!code) {
      setText(el.loginStatus, '请输入邮箱验证码');
      return;
    }
    setText(el.loginStatus, '正在验证邮箱...');
    const ok = await verifyEmailCode(email, code, 'login');
    if (!ok) {
      setText(el.loginStatus, '邮箱验证码无效或已过期');
      return;
    }
    try {
      const username = await lookupUsernameByEmail(email);
      if (!username) {
        setText(el.loginStatus, '该邮箱未绑定账号');
        return;
      }
      const user = await loadUserByUsername(username);
      if (!user) {
        setText(el.loginStatus, '账号不存在');
        return;
      }
      const nickname = user.nickname || buildNickname(username);
      setLocalLogin({
        login: username,
        nickname,
        avatarUrl: user.avatarUrl || ''
      });
      setText(el.loginStatus, '邮箱登录成功');
      window.location.href = '/a/account';
    } catch (error) {
      console.error('邮箱登录失败:', error);
      setText(el.loginStatus, '邮箱登录失败');
    }
  }

  async function handleResetPassword() {
    if (!(el.resetEmail instanceof HTMLInputElement) ||
      !(el.resetCode instanceof HTMLInputElement) ||
      !(el.resetPassword instanceof HTMLInputElement) ||
      !(el.resetPassword2 instanceof HTMLInputElement)) {
      return;
    }
    const email = el.resetEmail.value.trim();
    const code = el.resetCode.value.trim();
    const password = el.resetPassword.value;
    const password2 = el.resetPassword2.value;
    if (!validateEmail(email)) {
      setText(el.resetStatus, '邮箱格式不正确');
      return;
    }
    if (!validatePassword(password)) {
      setText(el.resetStatus, '密码需 8-20 位，包含字母和数字');
      return;
    }
    if (password !== password2) {
      setText(el.resetStatus, '两次输入的密码不一致');
      return;
    }
    const ok = await verifyEmailCode(email, code, 'reset');
    if (!ok) {
      setText(el.resetStatus, '邮箱验证码无效或已过期');
      return;
    }
    try {
      setText(el.resetStatus, '正在重置密码...');
      const username = await lookupUsernameByEmail(email);
      if (!username) {
        setText(el.resetStatus, '该邮箱未绑定账号');
        return;
      }
      const db = await ensureFirebase();
      const salt = genSalt();
      const hash = await sha256(`${salt}:${password}`);
      await db.ref(`${DB_USERS}/${username}`).update({
        salt,
        passwordHash: hash,
        updatedAt: Date.now()
      });
      setText(el.resetStatus, '密码已重置，请使用新密码登录');
    } catch (error) {
      console.error('重置密码失败:', error);
      setText(el.resetStatus, '密码重置失败');
    }
  }

  function bindEvents() {
    if (el.githubBtn) {
      el.githubBtn.addEventListener('click', () => {
        const url = window.__GITHUB_LOGIN_URL__;
        if (url) {
          window.location.href = url;
        }
      });
    }

    el.tabButtons.forEach((btn) => {
      if (!(btn instanceof HTMLElement)) return;
      btn.addEventListener('click', () => {
        const target = btn.dataset.tab || 'login';
        switchTab(target);
      });
    });

    document.querySelectorAll('.mode-btn').forEach((btn) => {
      if (!(btn instanceof HTMLElement)) return;
      btn.addEventListener('click', () => {
        const mode = btn.dataset.loginMode || 'password';
        switchLoginMode(mode);
      });
    });

    if (el.loginReset) {
      el.loginReset.addEventListener('click', () => {
        if (el.loginUsername instanceof HTMLInputElement) el.loginUsername.value = '';
        if (el.loginPassword instanceof HTMLInputElement) el.loginPassword.value = '';
        setText(el.loginStatus, '等待登录');
        resetTurnstile();
      });
    }
    if (el.loginSubmit) {
      el.loginSubmit.addEventListener('click', () => { void handleLogin(); });
    }
    if (el.emailLoginSend) {
      el.emailLoginSend.addEventListener('click', () => {
        if (el.emailLoginAddress instanceof HTMLInputElement) {
          void sendEmailCode(el.emailLoginAddress.value.trim(), 'login', el.loginStatus);
        }
      });
    }
    if (el.emailLoginSubmit) {
      el.emailLoginSubmit.addEventListener('click', () => { void handleEmailLogin(); });
    }

    if (el.toggleReset) {
      el.toggleReset.addEventListener('click', () => {
        if (el.resetPanel instanceof HTMLElement) {
          el.resetPanel.classList.toggle('active');
        }
      });
    }
    if (el.resetSend) {
      el.resetSend.addEventListener('click', () => {
        if (el.resetEmail instanceof HTMLInputElement) {
          void sendEmailCode(el.resetEmail.value.trim(), 'reset', el.resetStatus);
        }
      });
    }
    if (el.resetSubmit) {
      el.resetSubmit.addEventListener('click', () => { void handleResetPassword(); });
    }

    if (el.registerReset) {
      el.registerReset.addEventListener('click', () => {
        if (el.registerUsername instanceof HTMLInputElement) el.registerUsername.value = '';
        if (el.registerNickname instanceof HTMLInputElement) el.registerNickname.value = '';
        if (el.registerPassword instanceof HTMLInputElement) el.registerPassword.value = '';
        if (el.registerPassword2 instanceof HTMLInputElement) el.registerPassword2.value = '';
        setText(el.registerStatus, '等待注册');
      });
    }
    if (el.registerSubmit) {
      el.registerSubmit.addEventListener('click', () => { void handleRegister(); });
    }

    if (el.registerEmailSend) {
      el.registerEmailSend.addEventListener('click', () => {
        if (el.registerEmail instanceof HTMLInputElement) {
          void sendEmailCode(el.registerEmail.value.trim(), 'register', el.registerStatus);
        }
      });
    }
  }

  function init() {
    initThemeSync();
    cacheElements();
    if (localStorage.getItem('github_user') || localStorage.getItem('qb_user')) {
      window.location.href = '/a/account';
      return;
    }
    switchLoginMode('password');
    if (el.resetPanel instanceof HTMLElement) {
      el.resetPanel.classList.remove('active');
    }
    if (getTurnstileSiteKey()) {
      void waitForTurnstileReady().then(() => renderTurnstile());
    } else {
      setStatus(el.loginStatus, '验证码未配置，请联系站长');
    }
    bindEvents();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
