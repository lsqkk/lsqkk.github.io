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
    el.turnstileRegisterContainer = document.getElementById('turnstileRegisterContainer');
    el.loginSubmit = document.getElementById('loginSubmit');
    el.loginReset = document.getElementById('loginReset');
    el.loginStatus = document.getElementById('loginStatus');
    el.emailLoginAddress = document.getElementById('emailLoginAddress');
    el.emailLoginCode = document.getElementById('emailLoginCode');
    el.emailLoginSend = document.getElementById('emailLoginSend');
    el.emailLoginSubmit = document.getElementById('emailLoginSubmit');
    el.toggleReset = document.getElementById('toggleReset');
    el.resetPanel = document.getElementById('resetPanel');
    el.resetUsername = document.getElementById('resetUsername');
    el.resetEmailHint = document.getElementById('resetEmailHint');
    el.resetCode = document.getElementById('resetCode');
    el.resetSend = document.getElementById('resetSend');
    el.resetPassword = document.getElementById('resetPassword');
    el.resetPassword2 = document.getElementById('resetPassword2');
    el.resetSubmit = document.getElementById('resetSubmit');
    el.resetStatus = document.getElementById('resetStatus');
    el.registerUsername = document.getElementById('registerUsername');
    el.registerUsernameStatus = document.getElementById('registerUsernameStatus');
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

  let resetBoundEmail = '';
  const SEND_COOLDOWN_MS = 60 * 1000;
  const REGISTER_COOLDOWN_MS = 2 * 60 * 1000;
  let firebaseReady = false;
  let emailTokenCache = {};
  let loginMode = 'password';
  let usernameCheckTimer = null;
  let usernameCheckSeq = 0;
  let lastCheckedUsername = '';

  function setText(target, value) {
    if (!target) return;
    target.textContent = value;
  }

  function setStatus(target, value) {
    setText(target, value);
  }

  function setStatusState(target, value, state) {
    if (!target) return;
    target.textContent = value;
    if (!(target instanceof HTMLElement)) return;
    target.classList.remove('status-row--ok', 'status-row--warn', 'status-row--info');
    if (state) {
      target.classList.add(`status-row--${state}`);
    }
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
    if (getTurnstileSiteKey()) {
      void waitForTurnstileReady().then(() => renderTurnstile());
    }
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
    return window.QuarkTurnstile ? window.QuarkTurnstile.getSiteKey() : '';
  }

  function resetTurnstile() {
    if (window.QuarkTurnstile) {
      window.QuarkTurnstile.reset('login');
      window.QuarkTurnstile.reset('register');
    }
  }

  function renderTurnstile() {
    const key = getTurnstileSiteKey();
    if (!key || (!el.turnstileContainer && !el.turnstileRegisterContainer)) return;
    if (!window.QuarkTurnstile) return;
    window.QuarkTurnstile.autoRender();
  }

  function waitForTurnstileReady() {
    return new Promise((resolve) => {
      if (window.QuarkTurnstile) {
        window.QuarkTurnstile.waitReady().then(resolve);
        return;
      }
      resolve();
    });
  }

  function normalizeUsername(value) {
    return String(value || '').trim().toLowerCase();
  }

  function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function sanitizeText(value, maxLen = 32) {
    return String(value || '')
      .replace(/[<>"'\\]/g, '')
      .replace(/[\u0000-\u001F\u007F]/g, '')
      .trim()
      .slice(0, maxLen);
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

  function isWeakPattern(value) {
    if (!value) return true;
    const lower = value.toLowerCase();
    if (/^(.)\1+$/.test(lower)) return true;
    const seq = 'abcdefghijklmnopqrstuvwxyz';
    const num = '0123456789';
    for (let i = 0; i <= lower.length - 4; i += 1) {
      const chunk = lower.slice(i, i + 4);
      if (seq.includes(chunk) || seq.split('').reverse().join('').includes(chunk)) return true;
      if (num.includes(chunk) || num.split('').reverse().join('').includes(chunk)) return true;
    }
    if (/(..)\1\1/.test(lower)) return true;
    return false;
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

  async function ensureFirebase() {
    if (firebaseReady) return window.firebase.database();
    if (!window.QuarkFirebaseReady) {
      throw new Error('Firebase就绪模块未加载');
    }
    const db = await window.QuarkFirebaseReady.ensureDatabase({
      scriptId: 'firebase-config-loader-login'
    });
    firebaseReady = true;
    return db;
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

  function canSend(key, cooldown) {
    const now = Date.now();
    const last = Number(localStorage.getItem(key) || 0);
    if (now - last < cooldown) {
      return Math.ceil((cooldown - (now - last)) / 1000);
    }
    localStorage.setItem(key, String(now));
    return 0;
  }

  function startCooldown(button, seconds) {
    if (!(button instanceof HTMLButtonElement)) return;
    const original = button.textContent || '';
    let remain = seconds;
    button.disabled = true;
    button.textContent = `${remain}s`;
    const timer = window.setInterval(() => {
      remain -= 1;
      if (remain <= 0) {
        window.clearInterval(timer);
        button.disabled = false;
        button.textContent = original;
      } else {
        button.textContent = `${remain}s`;
      }
    }, 1000);
  }

  async function sendEmailCode(email, purpose, statusEl, captchaKind) {
    if (!validateEmail(email)) {
      setStatus(statusEl, '邮箱格式不正确');
      return false;
    }
    if (captchaKind) {
      const captchaOk = await verifyTurnstileToken(captchaKind, '', statusEl);
      if (!captchaOk) return false;
    }
    const cooldownLeft = canSend(`email_send_${purpose}_${emailKey(email)}`, SEND_COOLDOWN_MS);
    if (cooldownLeft > 0) {
      setStatus(statusEl, `发送过于频繁，请 ${cooldownLeft}s 后再试`);
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

  async function verifyTurnstileToken(purpose, token, statusEl) {
    if (!window.QuarkTurnstile) {
      setStatus(statusEl || el.loginStatus, '验证码未加载');
      return false;
    }
    return window.QuarkTurnstile.verify(purpose, (msg) => setStatus(statusEl || el.loginStatus, msg));
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

  async function checkUsernameAvailability(rawValue, immediate = false) {
    if (!(el.registerUsernameStatus instanceof HTMLElement)) return;
    const value = String(rawValue || '').trim();
    if (!value) {
      setStatusState(el.registerUsernameStatus, '等待输入账号名', 'info');
      return;
    }
    if (!validateUsername(value)) {
      setStatusState(el.registerUsernameStatus, '账号名需为 3-20 位英文字母', 'warn');
      return;
    }
    const normalized = normalizeUsername(value);
    if (!immediate && normalized === lastCheckedUsername) return;
    lastCheckedUsername = normalized;
    setStatusState(el.registerUsernameStatus, '正在检查账号名...', 'info');
    const seq = ++usernameCheckSeq;
    try {
      const db = await ensureFirebase();
      const snap = await db.ref(`${DB_USERS}/${normalized}`).once('value');
      if (seq !== usernameCheckSeq) return;
      if (snap.exists()) {
        setStatusState(el.registerUsernameStatus, '账号名已被占用', 'warn');
      } else {
        setStatusState(el.registerUsernameStatus, '账号名可用', 'ok');
      }
    } catch (error) {
      console.error('检查账号名失败:', error);
      if (seq !== usernameCheckSeq) return;
      setStatusState(el.registerUsernameStatus, '账号名检查失败，请稍后再试', 'warn');
    }
  }

  function scheduleUsernameCheck() {
    if (!(el.registerUsername instanceof HTMLInputElement)) return;
    if (usernameCheckTimer) {
      window.clearTimeout(usernameCheckTimer);
    }
    const value = el.registerUsername.value;
    usernameCheckTimer = window.setTimeout(() => {
      void checkUsernameAvailability(value);
    }, 400);
  }

  async function handleRegister() {
    if (!(el.registerUsername instanceof HTMLInputElement) ||
      !(el.registerPassword instanceof HTMLInputElement) ||
      !(el.registerPassword2 instanceof HTMLInputElement)) {
      return;
    }

    const usernameRaw = el.registerUsername.value;
    const username = normalizeUsername(usernameRaw);
    const nicknameInput = el.registerNickname instanceof HTMLInputElement ? sanitizeText(el.registerNickname.value, 24) : '';
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
    if (isWeakPattern(password)) {
      setText(el.registerStatus, '密码过于简单，请避免连续或重复字符');
      return;
    }
    if (password !== password2) {
      setText(el.registerStatus, '两次输入的密码不一致');
      return;
    }

    const captchaOk = await verifyTurnstileToken('register', '', el.registerStatus);
    if (!captchaOk) return;
    const registerCooldown = canSend(`register_submit_${username}`, REGISTER_COOLDOWN_MS);
    if (registerCooldown > 0) {
      setText(el.registerStatus, `注册过于频繁，请 ${registerCooldown}s 后再试`);
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
    if (isWeakPattern(password)) {
      setText(el.loginStatus, '密码过于简单，请检查后重试');
      return;
    }

    const captchaOk = await verifyTurnstileToken('login', '', el.loginStatus);
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
    const captchaOk = await verifyTurnstileToken('login', '', el.loginStatus);
    if (!captchaOk) return;
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
    if (!(el.resetUsername instanceof HTMLInputElement) ||
      !(el.resetCode instanceof HTMLInputElement) ||
      !(el.resetPassword instanceof HTMLInputElement) ||
      !(el.resetPassword2 instanceof HTMLInputElement)) {
      return;
    }
    const usernameRaw = el.resetUsername.value.trim();
    const code = el.resetCode.value.trim();
    const password = el.resetPassword.value;
    const password2 = el.resetPassword2.value;
    if (!validateUsername(usernameRaw)) {
      setText(el.resetStatus, '账号名需为 3-20 位英文字母');
      return;
    }
    if (!code) {
      setText(el.resetStatus, '请输入验证码');
      return;
    }
    if (!validatePassword(password)) {
      setText(el.resetStatus, '密码需 8-20 位，包含字母和数字');
      return;
    }
    if (isWeakPattern(password)) {
      setText(el.resetStatus, '密码过于简单，请避免连续或重复字符');
      return;
    }
    if (password !== password2) {
      setText(el.resetStatus, '两次输入的密码不一致');
      return;
    }
    const captchaOk = await verifyTurnstileToken('login', '', el.resetStatus);
    if (!captchaOk) return;
    if (!resetBoundEmail) {
      const email = await prepareResetEmail();
      if (!email) {
        setText(el.resetStatus, '未绑定邮箱，无法重置');
        return;
      }
    }
    const ok = await verifyEmailCode(resetBoundEmail, code, 'reset');
    if (!ok) {
      setText(el.resetStatus, '邮箱验证码无效或已过期');
      return;
    }
    try {
      setText(el.resetStatus, '正在重置密码...');
      const username = normalizeUsername(usernameRaw);
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

  function maskEmail(email) {
    const [name, domain] = String(email || '').split('@');
    if (!domain) return '';
    const head = name.slice(0, 2);
    return `${head}${'*'.repeat(Math.max(0, name.length - 2))}@${domain}`;
  }

  function setResetEmailHint(email) {
    if (el.resetEmailHint instanceof HTMLElement) {
      if (email) {
        el.resetEmailHint.textContent = `验证码将发送至您绑定的邮箱 ${maskEmail(email)}`;
      } else {
        el.resetEmailHint.textContent = '验证码将发送至已绑定邮箱';
      }
    }
  }

  async function prepareResetEmail() {
    if (!(el.resetUsername instanceof HTMLInputElement)) return '';
    const usernameRaw = el.resetUsername.value.trim();
    if (!validateUsername(usernameRaw)) {
      setText(el.resetStatus, '账号名需为 3-20 位英文字母');
      return '';
    }
    const username = normalizeUsername(usernameRaw);
    try {
      const db = await ensureFirebase();
      const snap = await db.ref(`${DB_USERS}/${username}`).once('value');
      if (!snap.exists()) {
        setText(el.resetStatus, '该账号不存在');
        setResetEmailHint('');
        return '';
      }
      const data = snap.val() || {};
      const email = data.email ? normalizeEmail(data.email) : '';
      if (!email) {
        setText(el.resetStatus, '该账号未绑定邮箱，无法重置');
        setResetEmailHint('');
        return '';
      }
      resetBoundEmail = email;
      setResetEmailHint(email);
      return email;
    } catch (error) {
      console.error('读取绑定邮箱失败:', error);
      setText(el.resetStatus, '读取绑定邮箱失败');
      return '';
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
          const email = el.emailLoginAddress.value.trim();
          void sendEmailCode(email, 'login', el.loginStatus, 'login').then((ok) => {
            if (ok) startCooldown(el.emailLoginSend, Math.ceil(SEND_COOLDOWN_MS / 1000));
          });
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
        resetBoundEmail = '';
        setResetEmailHint('');
      });
    }
    if (el.resetSend) {
      el.resetSend.addEventListener('click', () => {
        void prepareResetEmail().then((email) => {
          if (!email) return;
          void sendEmailCode(email, 'reset', el.resetStatus, 'login').then((ok) => {
            if (ok) startCooldown(el.resetSend, Math.ceil(SEND_COOLDOWN_MS / 1000));
          });
        });
      });
    }
    if (el.resetUsername instanceof HTMLInputElement) {
      el.resetUsername.addEventListener('input', () => {
        resetBoundEmail = '';
        setResetEmailHint('');
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
        setStatusState(el.registerUsernameStatus, '等待输入账号名', 'info');
        resetTurnstile();
      });
    }
    if (el.registerSubmit) {
      el.registerSubmit.addEventListener('click', () => { void handleRegister(); });
    }

    if (el.registerEmailSend) {
      el.registerEmailSend.addEventListener('click', () => {
        if (el.registerEmail instanceof HTMLInputElement) {
          const email = el.registerEmail.value.trim();
          void sendEmailCode(email, 'register', el.registerStatus, 'register').then((ok) => {
            if (ok) startCooldown(el.registerEmailSend, Math.ceil(SEND_COOLDOWN_MS / 1000));
          });
        }
      });
    }

    if (el.registerUsername) {
      el.registerUsername.addEventListener('input', () => {
        scheduleUsernameCheck();
      });
      el.registerUsername.addEventListener('blur', () => {
        void checkUsernameAvailability(el.registerUsername.value, true);
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
    setResetEmailHint('');
    if (getTurnstileSiteKey()) {
      void waitForTurnstileReady().then(() => renderTurnstile());
    } else {
      setStatus(el.loginStatus, '验证码未配置，请联系站长');
      setStatus(el.registerStatus, '验证码未配置，请联系站长');
    }
    setStatusState(el.registerUsernameStatus, '等待输入账号名', 'info');
    bindEvents();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
