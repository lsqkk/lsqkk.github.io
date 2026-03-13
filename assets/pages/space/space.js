// @ts-check
(function () {
  if (window.__quarkSpaceInited) return;
  window.__quarkSpaceInited = true;

  const API_BASE = '__API_BASE__';
  const listEl = document.getElementById('spaceSearchList');
  const activityEl = document.getElementById('spaceActivityList');
  const dynamicEl = document.getElementById('spaceDynamicList');
  const ojEl = document.getElementById('spaceOjList');
  const statusEl = document.getElementById('spaceProfileStatus');
  const avatarEl = document.getElementById('spaceAvatar');
  const avatarFallback = document.getElementById('spaceAvatarFallback');
  const nicknameEl = document.getElementById('spaceNickname');
  const loginEl = document.getElementById('spaceLogin');
  const loginTypeEl = document.getElementById('spaceLoginType');
  const registerAtEl = document.getElementById('spaceRegisterAt');
  const selfActions = document.getElementById('spaceSelfActions');
  const logoutBtn = document.getElementById('spaceLogoutBtn');
  const searchInput = document.getElementById('spaceSearchInput');
  const searchBtn = document.getElementById('spaceSearchBtn');
  const privacyToggle = document.getElementById('spaceShowActivity');

  const params = new URLSearchParams(window.location.search);

  function setText(el, value) {
    if (el) el.textContent = value;
  }

  function setAvatar(url, name) {
    if (avatarEl instanceof HTMLImageElement) {
      avatarEl.src = url || '';
      avatarEl.style.display = url ? 'block' : 'none';
    }
    if (avatarFallback instanceof HTMLElement) {
      avatarFallback.textContent = name ? name.slice(0, 1).toUpperCase() : 'Q';
      avatarFallback.style.display = url ? 'none' : 'flex';
    }
  }

  function formatTime(ts) {
    if (!ts) return '-';
    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) return '-';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function isSelf(login, loginType) {
    const profile = window.CommentShared && typeof window.CommentShared.getLoginProfile === 'function'
      ? window.CommentShared.getLoginProfile()
      : null;
    if (!profile || !profile.login) return false;
    if (window.CommentShared && typeof window.CommentShared.getAccountIdentifier === 'function') {
      return window.CommentShared.getAccountIdentifier(profile) === (loginType === 'local' ? `qb_${login}` : `gh_${login}`);
    }
    if (profile.loginType === 'local') {
      return loginType === 'local' && profile.login === login;
    }
    return loginType === 'github' && profile.login === login;
  }

  async function fetchDb(path, query) {
    if (!path) return null;
    const params = new URLSearchParams({ path });
    if (query) {
      Object.keys(query).forEach((key) => {
        const value = query[key];
        if (value !== undefined && value !== null && value !== '') {
          params.set(key, String(value));
        }
      });
    }
    const resp = await fetch(`${API_BASE}/api/db?${params.toString()}`);
    if (!resp.ok) throw new Error(`DB ${resp.status}`);
    const data = await resp.json();
    return data && data.data ? data.data : null;
  }

  function renderSearchList(items) {
    if (!(listEl instanceof HTMLElement)) return;
    if (!items.length) {
      listEl.textContent = '未找到匹配用户';
      return;
    }
    listEl.innerHTML = items.map((item) => `
      <div class="space-item">
        <strong>${item.nickname || item.login}</strong>
        <div>账号标识：${item.identifier}</div>
        <a href="/space?user=${encodeURIComponent(item.identifier)}">查看主页</a>
      </div>
    `).join('');
  }

  function renderActivity(items) {
    if (!(activityEl instanceof HTMLElement)) return;
    if (!items.length) {
      activityEl.textContent = '暂无发言';
      return;
    }
    activityEl.innerHTML = items.map((item) => `
      <div class="space-item">
        <strong>${item.text}</strong>
        <div>${formatTime(item.timestamp)}</div>
        <a href="/blog/lyb">前往留言板</a>
      </div>
    `).join('');
  }

  function renderDynamic(items) {
    if (!(dynamicEl instanceof HTMLElement)) return;
    if (!items.length) {
      dynamicEl.textContent = '暂无动态评论';
      return;
    }
    dynamicEl.innerHTML = items.map((item) => `
      <div class="space-item">
        <strong>${item.text}</strong>
        <div>${formatTime(item.timestamp)}</div>
        <a href="/blog/dt/${encodeURIComponent(item.postId)}">查看动态</a>
      </div>
    `).join('');
  }

  function renderOj(items) {
    if (!(ojEl instanceof HTMLElement)) return;
    if (!items.length) {
      ojEl.textContent = '暂无讨论';
      return;
    }
    ojEl.innerHTML = items.map((item) => `
      <div class="space-item">
        <strong>${item.text}</strong>
        <div>${formatTime(item.timestamp)}</div>
        <a href="/a/oj/discussion?id=${encodeURIComponent(item.discussionId)}">查看讨论</a>
      </div>
    `).join('');
  }

  async function loadActivity(login) {
    try {
      const raw = await fetchDb('chatrooms/lsqkk-lyb/messages');
      const list = raw ? Object.values(raw) : [];
      const items = list
        .filter((msg) => msg && msg.login === login)
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        .slice(0, 5)
        .map((msg) => ({
          text: msg.text || '无内容',
          timestamp: msg.timestamp || 0
        }));
      renderActivity(items);
    } catch (error) {
      console.error('加载发言失败:', error);
      if (activityEl instanceof HTMLElement) activityEl.textContent = '加载失败';
    }
  }

  async function loadDynamicComments(login) {
    try {
      const raw = await fetchDb('dynamic_posts');
      const posts = raw ? Object.entries(raw) : [];
      const items = [];
      posts.forEach(([postId, post]) => {
        const comments = post && post.comments ? post.comments : null;
        if (!comments) return;
        Object.values(comments).forEach((comment) => {
          if (comment && comment.login === login) {
            items.push({
              postId,
              text: comment.text || '无内容',
              timestamp: comment.timestamp || 0
            });
          }
          if (comment && comment.replies) {
            Object.values(comment.replies).forEach((reply) => {
              if (reply && reply.login === login) {
                items.push({
                  postId,
                  text: reply.text || '无内容',
                  timestamp: reply.timestamp || 0
                });
              }
            });
          }
        });
      });
      const sorted = items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 5);
      renderDynamic(sorted);
    } catch (error) {
      console.error('加载动态评论失败:', error);
      if (dynamicEl instanceof HTMLElement) dynamicEl.textContent = '加载失败';
    }
  }

  async function loadOjDiscussions(login) {
    try {
      const raw = await fetchDb('oj-discussions');
      const list = raw ? Object.entries(raw) : [];
      const items = [];
      list.forEach(([discussionId, discussion]) => {
        const replies = discussion && discussion.replies ? discussion.replies : null;
        if (!replies) return;
        Object.values(replies).forEach((reply) => {
          if (reply && reply.login === login) {
            items.push({
              discussionId,
              text: reply.text || '无内容',
              timestamp: reply.timestamp || 0
            });
          }
        });
      });
      const sorted = items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 5);
      renderOj(sorted);
    } catch (error) {
      console.error('加载OJ讨论失败:', error);
      if (ojEl instanceof HTMLElement) ojEl.textContent = '加载失败';
    }
  }

  async function resolveUser(identifier) {
    if (!identifier) return null;
    let login = identifier;
    let loginType = 'github';
    if (identifier.startsWith('qb_')) {
      login = identifier.slice(3);
      loginType = 'local';
    } else if (identifier.startsWith('gh_')) {
      login = identifier.slice(3);
      loginType = 'github';
    }

    if (loginType === 'local') {
      const data = await fetchDb(`qb_users/${login.toLowerCase()}`);
      if (!data) return null;
      let avatarUrl = data.avatarUrl || '';
      let privacy = {};
      let createdAt = data.createdAt || 0;
      try {
        const activity = await fetchDb('user_activity');
        const list = activity ? Object.values(activity) : [];
        const matched = list.find((item) => item && item.profile && item.profile.login === login);
        if (matched && matched.profile) {
          const profile = matched.profile;
          avatarUrl = profile.avatarUrl || avatarUrl;
          privacy = profile.privacy || {};
          if (!createdAt && profile.createdAt) createdAt = profile.createdAt;
        }
      } catch {
        // ignore
      }
      return {
        login,
        loginType,
        nickname: data.nickname || login,
        avatarUrl,
        createdAt,
        privacy,
        identifier: `qb_${login}`
      };
    }

    const activity = await fetchDb('user_activity');
    if (!activity) return null;
    const list = Object.values(activity);
    const matched = list.find((item) => item && item.profile && item.profile.login === login);
    if (!matched) return null;
    const profile = matched.profile || {};
    return {
      login,
      loginType: profile.loginType || 'github',
      nickname: profile.nickname || login,
      avatarUrl: profile.avatarUrl || profile.avatar || '',
      createdAt: profile.createdAt || profile.updatedAt || 0,
      privacy: profile.privacy || {},
      identifier: `gh_${login}`
    };
  }

  async function searchUsers(keyword) {
    if (!keyword) {
      renderSearchList([]);
      return;
    }
    const lower = keyword.toLowerCase();
    const [locals, activity] = await Promise.all([
      fetchDb('qb_users').catch(() => ({})),
      fetchDb('user_activity').catch(() => ({}))
    ]);
    const list = [];
    Object.entries(locals || {}).forEach(([login, data]) => {
      const nickname = data && data.nickname ? data.nickname : login;
      if (login.toLowerCase().includes(lower) || String(nickname).toLowerCase().includes(lower)) {
        list.push({
          login,
          loginType: 'local',
          nickname,
          identifier: `qb_${login}`
        });
      }
    });
    Object.values(activity || {}).forEach((item) => {
      const profile = item && item.profile ? item.profile : null;
      if (!profile || !profile.login) return;
      const login = String(profile.login);
      const nickname = profile.nickname || login;
      if (login.toLowerCase().includes(lower) || String(nickname).toLowerCase().includes(lower)) {
        list.push({
          login,
          loginType: profile.loginType || 'github',
          nickname,
          identifier: `gh_${login}`
        });
      }
    });
    renderSearchList(list.slice(0, 20));
  }

  async function loadProfile() {
    const identifier = params.get('user') || '';
    if (!identifier) {
      setText(statusEl, '请输入用户后搜索');
      if (selfActions) selfActions.style.display = 'none';
      return;
    }
    setText(statusEl, '加载中...');
    try {
      const user = await resolveUser(identifier);
      if (!user) {
        setText(statusEl, '未找到用户');
        return;
      }
      setText(statusEl, '已加载');
      setText(nicknameEl, user.nickname || user.login);
      setText(loginEl, `账号标识：${user.identifier}`);
      setText(loginTypeEl, `类型：${user.loginType === 'local' ? '站内账号' : 'GitHub'}`);
      setText(registerAtEl, `注册时间：${formatTime(user.createdAt)}`);
      setAvatar(user.avatarUrl, user.nickname || user.login);
      if (selfActions instanceof HTMLElement) {
        selfActions.style.display = isSelf(user.login, user.loginType) ? 'flex' : 'none';
      }
      const showActivity = user.privacy && user.privacy.showActivity === false ? false : true;
      if (privacyToggle instanceof HTMLInputElement) {
        privacyToggle.checked = showActivity;
      }
      if (showActivity) {
        await loadActivity(user.login);
        await loadDynamicComments(user.login);
        await loadOjDiscussions(user.login);
      } else {
        if (activityEl instanceof HTMLElement) activityEl.textContent = '该用户隐藏了最近发言';
        if (dynamicEl instanceof HTMLElement) dynamicEl.textContent = '该用户隐藏了最近发言';
        if (ojEl instanceof HTMLElement) ojEl.textContent = '该用户隐藏了最近发言';
      }
      if (isSelf(user.login, user.loginType)) {
        if (privacyToggle instanceof HTMLInputElement) {
          privacyToggle.disabled = false;
        }
      } else if (privacyToggle instanceof HTMLInputElement) {
        privacyToggle.disabled = true;
      }
    } catch (error) {
      console.error('加载用户失败:', error);
      setText(statusEl, '加载失败');
    }
  }

  function bindEvents() {
    if (searchBtn) {
      searchBtn.addEventListener('click', () => {
        const keyword = searchInput instanceof HTMLInputElement ? searchInput.value.trim() : '';
        void searchUsers(keyword);
      });
    }
    if (searchInput instanceof HTMLInputElement) {
      searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          void searchUsers(searchInput.value.trim());
        }
      });
    }
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        if (window.CommentShared && typeof window.CommentShared.logout === 'function') {
          window.CommentShared.logout('/');
        }
      });
    }
    if (privacyToggle instanceof HTMLInputElement) {
      privacyToggle.addEventListener('change', async () => {
        const profile = window.CommentShared && typeof window.CommentShared.getLoginProfile === 'function'
          ? window.CommentShared.getLoginProfile()
          : null;
        if (!profile || !profile.login) return;
        try {
          const uid = window.QuarkUserProfile && typeof window.QuarkUserProfile.getUid === 'function'
            ? window.QuarkUserProfile.getUid()
            : '';
          if (!uid) return;
          await fetch(`${API_BASE}/api/db`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              op: 'update',
              path: `user_activity/${uid}/profile`,
              value: {
                privacy: { showActivity: privacyToggle.checked },
                updatedAt: Date.now()
              }
            })
          });
          if (!privacyToggle.checked) {
            if (activityEl instanceof HTMLElement) activityEl.textContent = '你已隐藏最近发言';
            if (dynamicEl instanceof HTMLElement) dynamicEl.textContent = '你已隐藏最近发言';
            if (ojEl instanceof HTMLElement) ojEl.textContent = '你已隐藏最近发言';
          } else {
            void loadActivity(profile.login);
            void loadDynamicComments(profile.login);
            void loadOjDiscussions(profile.login);
          }
        } catch (error) {
          console.error('更新隐私设置失败:', error);
        }
      });
    }
  }

  function init() {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      document.body.classList.toggle('dark-mode', media.matches);
    };
    applyTheme();
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', applyTheme);
    } else if (typeof media.addListener === 'function') {
      media.addListener(applyTheme);
    }
    bindEvents();
    const keyword = searchInput instanceof HTMLInputElement ? searchInput.value.trim() : '';
    if (keyword) {
      void searchUsers(keyword);
    }
    void loadProfile();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
