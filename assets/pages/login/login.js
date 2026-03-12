// @ts-check

(function () {
  if (window.__quarkLoginInited) return;
  window.__quarkLoginInited = true;

  const DB_USERS = 'qb_users';
  const LOGIN_TYPE_KEY = 'quark_login_type';
  const QB_USER_KEY = 'qb_user';
  const QB_LOGIN_KEY = 'qb_login';

  const el = {
    githubBtn: document.getElementById('githubLoginBtn'),
    tabButtons: document.querySelectorAll('.tab-btn'),
    tabPanels: document.querySelectorAll('.tab-panel'),
    loginUsername: document.getElementById('loginUsername'),
    loginPassword: document.getElementById('loginPassword'),
    loginCaptcha: document.getElementById('loginCaptcha'),
    captchaCanvas: document.getElementById('captchaCanvas'),
    captchaRefresh: document.getElementById('captchaRefresh'),
    loginSubmit: document.getElementById('loginSubmit'),
    loginReset: document.getElementById('loginReset'),
    loginStatus: document.getElementById('loginStatus'),
    registerUsername: document.getElementById('registerUsername'),
    registerNickname: document.getElementById('registerNickname'),
    registerPassword: document.getElementById('registerPassword'),
    registerPassword2: document.getElementById('registerPassword2'),
    registerSubmit: document.getElementById('registerSubmit'),
    registerReset: document.getElementById('registerReset'),
    registerStatus: document.getElementById('registerStatus')
  };

  let captchaCode = '';
  let firebaseReady = false;

  function setText(target, value) {
    if (!target) return;
    target.textContent = value;
  }

  function initThemeSync() {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.body.classList.toggle('dark-mode', media.matches);
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

  function randomCaptcha() {
    const chars = '23456789';
    let code = '';
    for (let i = 0; i < 4; i += 1) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  function drawCaptcha() {
    const canvas = el.captchaCanvas;
    if (!(canvas instanceof HTMLCanvasElement)) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    captchaCode = randomCaptcha();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(248,250,252,0.9)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = '24px sans-serif';
    ctx.fillStyle = '#1e293b';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(captchaCode, canvas.width / 2, canvas.height / 2 + 2);
    for (let i = 0; i < 6; i += 1) {
      ctx.strokeStyle = `rgba(148,163,184,${0.3 + Math.random() * 0.4})`;
      ctx.beginPath();
      ctx.moveTo(Math.random() * canvas.width, Math.random() * canvas.height);
      ctx.lineTo(Math.random() * canvas.width, Math.random() * canvas.height);
      ctx.stroke();
    }
  }

  function normalizeUsername(value) {
    return String(value || '').trim().toLowerCase();
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

  async function ensureFirebase() {
    if (firebaseReady) return window.firebase.database();
    const config = await waitForFirebaseReady();
    if (!window.firebase.apps || !window.firebase.apps.length) {
      window.firebase.initializeApp(config);
    }
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

  async function handleRegister() {
    if (!(el.registerUsername instanceof HTMLInputElement) ||
      !(el.registerPassword instanceof HTMLInputElement) ||
      !(el.registerPassword2 instanceof HTMLInputElement)) {
      return;
    }

    const usernameRaw = el.registerUsername.value;
    const username = normalizeUsername(usernameRaw);
    const nicknameInput = el.registerNickname instanceof HTMLInputElement ? el.registerNickname.value.trim() : '';
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

      const salt = genSalt();
      const hash = await sha256(`${salt}:${password}`);
      const nickname = nicknameInput || buildNickname(username);
      const payload = {
        username,
        nickname,
        salt,
        passwordHash: hash,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      await userRef.set(payload);

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
      !(el.loginPassword instanceof HTMLInputElement) ||
      !(el.loginCaptcha instanceof HTMLInputElement)) {
      return;
    }

    const usernameRaw = el.loginUsername.value;
    const username = normalizeUsername(usernameRaw);
    const password = el.loginPassword.value;
    const captcha = el.loginCaptcha.value.trim();

    if (!validateUsername(usernameRaw)) {
      setText(el.loginStatus, '账号名需为 3-20 位英文字母');
      return;
    }
    if (!password) {
      setText(el.loginStatus, '请输入密码');
      return;
    }
    if (captcha.toLowerCase() !== captchaCode.toLowerCase()) {
      setText(el.loginStatus, '验证码错误');
      drawCaptcha();
      return;
    }

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

    if (el.captchaRefresh) {
      el.captchaRefresh.addEventListener('click', () => drawCaptcha());
    }
    if (el.captchaCanvas) {
      el.captchaCanvas.addEventListener('click', () => drawCaptcha());
    }
    if (el.loginReset) {
      el.loginReset.addEventListener('click', () => {
        if (el.loginUsername instanceof HTMLInputElement) el.loginUsername.value = '';
        if (el.loginPassword instanceof HTMLInputElement) el.loginPassword.value = '';
        if (el.loginCaptcha instanceof HTMLInputElement) el.loginCaptcha.value = '';
        setText(el.loginStatus, '等待登录');
        drawCaptcha();
      });
    }
    if (el.loginSubmit) {
      el.loginSubmit.addEventListener('click', () => { void handleLogin(); });
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
  }

  function init() {
    initThemeSync();
    if (localStorage.getItem('github_user') || localStorage.getItem('qb_user')) {
      window.location.href = '/a/account';
      return;
    }
    drawCaptcha();
    bindEvents();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
