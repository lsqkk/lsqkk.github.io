// @ts-check
(function () {
  if (window.__quarkSpaceInited) return;
  window.__quarkSpaceInited = true;

  const API_BASE = '__API_BASE__';
  const LIKE_DAILY_LIMIT = 10;

  const el = {
    list: document.getElementById('spaceSearchList'),
    activity: document.getElementById('spaceActivityList'),
    dynamic: document.getElementById('spaceDynamicList'),
    postComment: document.getElementById('spacePostCommentList'),
    oj: document.getElementById('spaceOjList'),
    status: document.getElementById('spaceProfileStatus'),
    avatar: document.getElementById('spaceAvatar'),
    avatarFallback: document.getElementById('spaceAvatarFallback'),
    nickname: document.getElementById('spaceNickname'),
    login: document.getElementById('spaceLogin'),
    loginType: document.getElementById('spaceLoginType'),
    registerAt: document.getElementById('spaceRegisterAt'),
    handle: document.getElementById('spaceHandle'),
    location: document.getElementById('spaceLocation'),
    lastSeen: document.getElementById('spaceLastSeen'),
    recentPage: document.getElementById('spaceRecentPage'),
    locationSummary: document.getElementById('spaceLocationSummary'),
    lastSeenSummary: document.getElementById('spaceLastSeenSummary'),
    recentPageSummary: document.getElementById('spaceRecentPageSummary'),
    recentList: document.getElementById('spaceRecentList'),
    selfActions: document.getElementById('spaceSelfActions'),
    logoutBtn: document.getElementById('spaceLogoutBtn'),
    searchInput: document.getElementById('spaceSearchInput'),
    searchBtn: document.getElementById('spaceSearchBtn'),
    likeBtn: document.getElementById('spaceLikeBtn'),
    likeCount: document.getElementById('spaceLikeCount'),
    likeStatus: document.getElementById('spaceLikeStatus')
  };

  const privacyButtons = Array.from(document.querySelectorAll('[data-privacy-toggle]'));
  const privacyCards = Array.from(document.querySelectorAll('.space-card[data-privacy-key]'));
  const summaryItems = Array.from(document.querySelectorAll('.summary-item[data-privacy-key]'));

  const params = new URLSearchParams(window.location.search);
  let activityCache = null;
  let currentUser = null;
  let currentUid = '';
  let currentPrivacy = {};
  let isSelfUser = false;
  let likeState = { total: 0, todayCount: 0 };

  function setText(target, value) {
    if (target) target.textContent = value;
  }

  function escapeHtml(text) {
    const shared = window.CommentShared;
    if (shared && typeof shared.escapeHtml === 'function') {
      return shared.escapeHtml(text);
    }
    return String(text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDate(ts) {
    if (!ts) return '-';
    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) return '-';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function formatDateTime(ts) {
    if (!ts) return '-';
    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('zh-CN', { hour12: false });
  }

  function formatAgo(ts) {
    if (!ts) return '-';
    const diff = Date.now() - ts;
    if (diff < 60 * 1000) return '刚刚';
    const minutes = Math.round(diff / 60000);
    if (minutes < 60) return `${minutes} 分钟前`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} 小时前`;
    const days = Math.round(hours / 24);
    return `${days} 天前`;
  }

  function getDayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  function setAvatar(url, name) {
    if (el.avatar instanceof HTMLImageElement) {
      el.avatar.src = url || '';
      el.avatar.style.display = url ? 'block' : 'none';
    }
    if (el.avatarFallback instanceof HTMLElement) {
      el.avatarFallback.textContent = name ? name.slice(0, 1).toUpperCase() : 'Q';
      el.avatarFallback.style.display = url ? 'none' : 'flex';
    }
  }

  function matchLogin(item, login, loginType) {
    if (!item || !login) return false;
    const itemLogin = String(item.login || '');
    const itemType = String(item.loginType || '');
    if (itemLogin !== login) return false;
    if (!loginType) return true;
    if (!itemType) return true;
    return itemType === loginType;
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

  async function postDb(op, path, value) {
    const resp = await fetch(`${API_BASE}/api/db`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op, path, value })
    });
    if (!resp.ok) throw new Error(`DB ${resp.status}`);
    return resp.json().catch(() => ({}));
  }

  async function loadActivityCache() {
    if (activityCache) return activityCache;
    activityCache = await fetchDb('user_activity').catch(() => ({})) || {};
    return activityCache;
  }

  function getAccountIdentifier(login, loginType) {
    const shared = window.CommentShared;
    if (shared && typeof shared.getAccountIdentifierFrom === 'function') {
      return shared.getAccountIdentifierFrom(login || '', loginType || '');
    }
    if (!login) return '';
    return loginType === 'local' ? `qb_${login}` : `gh_${login}`;
  }

  function normalizeIdentifier(raw) {
    const input = String(raw || '').trim();
    if (!input) return { login: '', loginType: '', identifier: '' };
    if (input.startsWith('qb_')) {
      return { login: input.slice(3), loginType: 'local', identifier: input };
    }
    if (input.startsWith('gh_')) {
      return { login: input.slice(3), loginType: 'github', identifier: input };
    }
    return { login: input, loginType: '', identifier: '' };
  }

  function isSelf(login, loginType) {
    const shared = window.CommentShared;
    const profile = shared && typeof shared.getLoginProfile === 'function'
      ? shared.getLoginProfile()
      : null;
    if (!profile || !profile.login) return false;
    const identifier = getAccountIdentifier(profile.login, profile.loginType || '');
    if (!identifier) return false;
    return identifier === getAccountIdentifier(login, loginType);
  }

  async function resolveUser(identifier) {
    if (!identifier) return null;
    const parsed = normalizeIdentifier(identifier);
    const activity = await loadActivityCache();
    const entries = Object.entries(activity || {});

    let matchedUid = '';
    let matchedProfile = null;

    if (parsed.login) {
      for (const [uid, item] of entries) {
        const profile = item && item.profile ? item.profile : null;
        if (!profile || !profile.login) continue;
        const profileLogin = String(profile.login);
        const profileType = String(profile.loginType || 'github');
        if (profileLogin !== parsed.login) continue;
        if (parsed.loginType && profileType !== parsed.loginType) continue;
        matchedUid = uid;
        matchedProfile = profile;
        break;
      }
    }

    if (!matchedProfile && parsed.login && parsed.loginType === 'local') {
      const qb = await fetchDb(`qb_users/${parsed.login.toLowerCase()}`).catch(() => null);
      if (qb) {
        matchedProfile = {
          login: parsed.login,
          loginType: 'local',
          nickname: qb.nickname || parsed.login,
          avatarUrl: qb.avatarUrl || '',
          avatarType: qb.avatarUrl ? 'image' : (qb.avatarType || 'color'),
          avatarColor: qb.avatarColor || '#4a6cf7',
          createdAt: qb.createdAt || 0,
          updatedAt: qb.updatedAt || 0
        };
      }
    }

    if (!matchedProfile) return null;

    const loginType = matchedProfile.loginType || parsed.loginType || 'github';
    const login = matchedProfile.login || parsed.login;
    const identifierOut = getAccountIdentifier(login, loginType);

    return {
      uid: matchedUid,
      login,
      loginType,
      identifier: identifierOut,
      profile: matchedProfile,
      raw: activity[matchedUid] || {}
    };
  }

  function renderSearchList(items) {
    if (!(el.list instanceof HTMLElement)) return;
    if (!items.length) {
      el.list.textContent = '未找到匹配用户';
      return;
    }
    el.list.innerHTML = items.map((item) => `
      <div class="space-item">
        <strong>${escapeHtml(item.nickname || item.login)}</strong>
        <div>账号标识：${escapeHtml(item.identifier)}</div>
        <a href="/space?user=${encodeURIComponent(item.identifier)}">查看主页</a>
      </div>
    `).join('');
  }

  function renderList(target, items, emptyText, builder) {
    if (!(target instanceof HTMLElement)) return;
    if (!items.length) {
      target.textContent = emptyText;
      return;
    }
    target.innerHTML = items.map(builder).join('');
  }

  function renderRecent(events) {
    if (!(el.recentList instanceof HTMLElement)) return;
    if (!events.length) {
      el.recentList.textContent = '暂无浏览记录';
      return;
    }
    el.recentList.innerHTML = events.map((item) => `
      <div class="space-item">
        <strong>${escapeHtml(item.title || '未命名页面')}</strong>
        <div>${formatDateTime(item.ts)}</div>
        <a href="${escapeHtml(item.path || '#')}">${escapeHtml(item.path || '链接')}</a>
      </div>
    `).join('');
  }

  async function loadActivity(login, loginType) {
    try {
      const raw = await fetchDb('chatrooms/lsqkk-lyb/messages');
      const list = raw ? Object.values(raw) : [];
      const items = list
        .filter((msg) => matchLogin(msg, login, loginType))
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        .slice(0, 5)
        .map((msg) => ({
          text: msg.text || '无内容',
          timestamp: msg.timestamp || 0
        }));
      renderList(el.activity, items, '暂无发言', (item) => `
        <div class="space-item">
          <strong>${escapeHtml(item.text)}</strong>
          <div>${formatDateTime(item.timestamp)}</div>
          <a href="/blog/lyb">前往留言板</a>
        </div>
      `);
    } catch (error) {
      console.error('加载发言失败:', error);
      if (el.activity) el.activity.textContent = '加载失败';
    }
  }

  async function loadDynamicComments(login, loginType) {
    try {
      const raw = await fetchDb('dynamic_posts');
      const posts = raw ? Object.entries(raw) : [];
      const items = [];
      posts.forEach(([postId, post]) => {
        const comments = post && post.comments ? post.comments : null;
        if (!comments) return;
        Object.values(comments).forEach((comment) => {
          if (matchLogin(comment, login, loginType)) {
            items.push({
              postId,
              text: comment.text || '无内容',
              timestamp: comment.timestamp || 0
            });
          }
          if (comment && comment.replies) {
            Object.values(comment.replies).forEach((reply) => {
              if (matchLogin(reply, login, loginType)) {
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
      renderList(el.dynamic, sorted, '暂无动态评论', (item) => `
        <div class="space-item">
          <strong>${escapeHtml(item.text)}</strong>
          <div>${formatDateTime(item.timestamp)}</div>
          <a href="/blog/dt/${encodeURIComponent(item.postId)}">查看动态</a>
        </div>
      `);
    } catch (error) {
      console.error('加载动态评论失败:', error);
      if (el.dynamic) el.dynamic.textContent = '加载失败';
    }
  }

  async function loadPostComments(login, loginType) {
    try {
      const raw = await fetchDb('post_annotations');
      const posts = raw ? Object.entries(raw) : [];
      const items = [];
      posts.forEach(([, post]) => {
        const highlights = post && post.highlights ? post.highlights : null;
        if (!highlights) return;
        Object.values(highlights).forEach((highlight) => {
          const comments = highlight && highlight.comments ? highlight.comments : null;
          if (!comments) return;
          Object.values(comments).forEach((comment) => {
            if (matchLogin(comment, login, loginType)) {
              items.push({
                text: comment.text || '无内容',
                timestamp: comment.timestamp || 0,
                postPath: highlight.postPath || '',
                postTitle: highlight.postTitle || ''
              });
            }
          });
        });
      });
      const sorted = items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 5);
      renderList(el.postComment, sorted, '暂无文章评论', (item) => `
        <div class="space-item">
          <strong>${escapeHtml(item.text)}</strong>
          <div>${formatDateTime(item.timestamp)}</div>
          ${item.postPath ? `<a href="${escapeHtml(item.postPath)}">查看文章${item.postTitle ? ` · ${escapeHtml(item.postTitle)}` : ''}</a>` : '<span>来源未知</span>'}
        </div>
      `);
    } catch (error) {
      console.error('加载文章评论失败:', error);
      if (el.postComment) el.postComment.textContent = '加载失败';
    }
  }

  async function loadOjDiscussions(login, loginType) {
    try {
      const raw = await fetchDb('oj-discussions');
      const list = raw ? Object.entries(raw) : [];
      const items = [];
      list.forEach(([discussionId, discussion]) => {
        const replies = discussion && discussion.replies ? discussion.replies : null;
        if (!replies) return;
        Object.values(replies).forEach((reply) => {
          if (matchLogin(reply, login, loginType)) {
            items.push({
              discussionId,
              text: reply.text || '无内容',
              timestamp: reply.timestamp || 0
            });
          }
        });
      });
      const sorted = items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 5);
      renderList(el.oj, sorted, '暂无讨论', (item) => `
        <div class="space-item">
          <strong>${escapeHtml(item.text)}</strong>
          <div>${formatDateTime(item.timestamp)}</div>
          <a href="/a/oj/discussion?id=${encodeURIComponent(item.discussionId)}">查看讨论</a>
        </div>
      `);
    } catch (error) {
      console.error('加载OJ讨论失败:', error);
      if (el.oj) el.oj.textContent = '加载失败';
    }
  }

  function applyPrivacy() {
    privacyCards.forEach((card) => {
      const key = card.getAttribute('data-privacy-key') || '';
      if (!key) return;
      const visible = currentPrivacy[key] !== false;
      if (!visible && !isSelfUser) {
        card.classList.add('is-hidden');
      } else {
        card.classList.remove('is-hidden');
      }
      card.classList.toggle('is-private', !visible && isSelfUser);
    });

    summaryItems.forEach((item) => {
      const key = item.getAttribute('data-privacy-key') || '';
      if (!key) return;
      const visible = currentPrivacy[key] !== false;
      if (!visible && !isSelfUser) {
        item.classList.add('is-hidden');
      } else {
        item.classList.remove('is-hidden');
      }
      item.classList.toggle('is-private', !visible && isSelfUser);
    });

    privacyButtons.forEach((button) => {
      const key = button.getAttribute('data-privacy-toggle') || '';
      if (!key) return;
      const visible = currentPrivacy[key] !== false;
      button.classList.toggle('is-off', !visible);
      button.setAttribute('aria-pressed', String(visible));
      const label = button.querySelector('span');
      if (label) label.textContent = visible ? '展示中' : '已隐藏';
      if (!isSelfUser) {
        button.setAttribute('disabled', 'true');
      } else {
        button.removeAttribute('disabled');
      }
    });

    if (!isSelfUser) {
      if (currentPrivacy.showLocation === false) {
        setText(el.location, 'IP 属地：已隐藏');
        setText(el.locationSummary, '已隐藏');
      }
      if (currentPrivacy.showLastSeen === false) {
        setText(el.lastSeen, '最近在线：已隐藏');
        setText(el.lastSeenSummary, '已隐藏');
      }
      if (currentPrivacy.showRecentPage === false) {
        setText(el.recentPage, '最近浏览：已隐藏');
        setText(el.recentPageSummary, '已隐藏');
      }
      if (currentPrivacy.showIdentifier === false) {
        setText(el.login, '账号标识：已隐藏');
        setText(el.handle, '@已隐藏');
      }
    }

    if (isSelfUser) {
      if (el.activity && currentPrivacy.showActivity === false) el.activity.textContent = '你已隐藏留言板';
      if (el.dynamic && currentPrivacy.showDynamic === false) el.dynamic.textContent = '你已隐藏动态评论';
      if (el.postComment && currentPrivacy.showPostComments === false) el.postComment.textContent = '你已隐藏文章讨论';
      if (el.oj && currentPrivacy.showOj === false) el.oj.textContent = '你已隐藏 OJ 讨论';
      if (el.recentList && currentPrivacy.showRecentBrowse === false) el.recentList.textContent = '你已隐藏最近浏览';
    }
  }

  async function updatePrivacy(key, visible) {
    if (!currentUid || !key) return;
    currentPrivacy = { ...currentPrivacy, [key]: visible };
    applyPrivacy();
    try {
      await postDb('update', `user_activity/${currentUid}/profile`, {
        privacy: currentPrivacy,
        updatedAt: Date.now()
      });
    } catch (error) {
      console.error('更新隐私设置失败:', error);
    }
  }

  function getLikeActorId() {
    const shared = window.CommentShared;
    const profile = shared && typeof shared.getLoginProfile === 'function'
      ? shared.getLoginProfile()
      : null;
    if (profile && profile.login) {
      return getAccountIdentifier(profile.login, profile.loginType || '');
    }
    if (shared && typeof shared.getGuestUid === 'function') {
      const guestUid = shared.getGuestUid();
      return guestUid || '';
    }
    return '';
  }

  async function loadLikes(targetUid) {
    if (!targetUid) return;
    try {
      const data = await fetchDb(`user_space_likes/${targetUid}`) || {};
      const total = typeof data.total === 'number' ? data.total : 0;
      const dayKey = getDayKey();
      const likeId = getLikeActorId();
      const todayCount = likeId && data.daily && data.daily[dayKey] && data.daily[dayKey][likeId]
        ? Number(data.daily[dayKey][likeId])
        : 0;
      likeState = { total, todayCount };
      if (el.likeCount) el.likeCount.textContent = String(total);
      if (el.likeStatus) {
        const remain = Math.max(0, LIKE_DAILY_LIMIT - todayCount);
        el.likeStatus.textContent = `今日可点赞 ${remain} 次`;
      }
    } catch (error) {
      console.error('加载点赞失败:', error);
    }
  }

  async function handleLike() {
    if (!currentUid) return;
    const likeId = getLikeActorId();
    if (!likeId) {
      if (el.likeStatus) el.likeStatus.textContent = '请先登录或刷新后再试';
      return;
    }
    const dayKey = getDayKey();
    if (likeState.todayCount >= LIKE_DAILY_LIMIT) {
      if (el.likeStatus) el.likeStatus.textContent = '今日点赞已达上限';
      return;
    }
    try {
      const data = await fetchDb(`user_space_likes/${currentUid}`) || {};
      const total = typeof data.total === 'number' ? data.total : 0;
      const todayCount = likeId && data.daily && data.daily[dayKey] && data.daily[dayKey][likeId]
        ? Number(data.daily[dayKey][likeId])
        : 0;
      if (todayCount >= LIKE_DAILY_LIMIT) {
        likeState.todayCount = todayCount;
        if (el.likeStatus) el.likeStatus.textContent = '今日点赞已达上限';
        return;
      }
      const nextCount = todayCount + 1;
      const nextTotal = total + 1;
      await postDb('update', `user_space_likes/${currentUid}`, {
        total: nextTotal,
        [`daily/${dayKey}/${likeId}`]: nextCount
      });
      likeState = { total: nextTotal, todayCount: nextCount };
      if (el.likeCount) el.likeCount.textContent = String(nextTotal);
      if (el.likeStatus) {
        const remain = Math.max(0, LIKE_DAILY_LIMIT - nextCount);
        el.likeStatus.textContent = `今日可点赞 ${remain} 次`;
      }
    } catch (error) {
      console.error('点赞失败:', error);
      if (el.likeStatus) el.likeStatus.textContent = '点赞失败，请稍后再试';
    }
  }

  async function loadProfile() {
    const rawIdentifier = params.get('user') || '';
    if (!rawIdentifier) {
      setText(el.status, '请输入用户后搜索');
      if (el.selfActions) el.selfActions.style.display = 'none';
      return;
    }
    setText(el.status, '加载中...');
    try {
      const result = await resolveUser(rawIdentifier);
      if (!result) {
        setText(el.status, '未找到用户');
        return;
      }
      const profile = result.profile || {};
      currentUser = result;
      currentUid = result.uid || '';
      currentPrivacy = profile.privacy || {};
      isSelfUser = isSelf(result.login, result.loginType);

      setText(el.status, '已加载');
      setText(el.nickname, profile.nickname || result.login);
      setText(el.login, result.identifier ? `账号标识：${result.identifier}` : '账号标识：-');
      setText(el.loginType, `类型：${result.loginType === 'local' ? '站内账号' : 'GitHub'}`);
      setText(el.registerAt, `注册时间：${formatDate(profile.createdAt || profile.updatedAt || 0)}`);
      setText(el.handle, result.identifier ? `@${result.identifier}` : '@-');

      const locationText = [profile.province, profile.city].filter(Boolean).join(' ');
      setText(el.location, `IP 属地：${locationText || '-'}`);
      setText(el.locationSummary, locationText || '-');

      const activity = await loadActivityCache();
      const userData = currentUid ? activity[currentUid] || {} : {};
      const events = userData && userData.events ? Object.values(userData.events) : [];
      const logins = userData && userData.logins ? Object.values(userData.logins) : [];
      const latestEvent = events.sort((a, b) => (b.ts || 0) - (a.ts || 0))[0];
      const latestLogin = logins.sort((a, b) => (b.ts || 0) - (a.ts || 0))[0];
      let lastSeenTs = latestEvent && latestEvent.ts ? latestEvent.ts : (latestLogin && latestLogin.ts ? latestLogin.ts : 0);

      if (currentUid) {
        const presence = await fetchDb(`presence/${currentUid}`).catch(() => null);
        if (presence && presence.lastSeen) {
          lastSeenTs = Math.max(lastSeenTs || 0, presence.lastSeen);
        }
      }

      setText(el.lastSeen, `最近在线：${formatAgo(lastSeenTs)} (${formatDateTime(lastSeenTs)})`);
      setText(el.lastSeenSummary, formatAgo(lastSeenTs));

      const recentPageTitle = latestEvent ? (latestEvent.title || latestEvent.path || '-') : '-';
      setText(el.recentPage, `最近浏览：${recentPageTitle}`);
      setText(el.recentPageSummary, recentPageTitle || '-');

      const recentEvents = events.sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 5);
      renderRecent(recentEvents);

      setAvatar(profile.avatarUrl || profile.avatar || '', profile.nickname || result.login);

      if (el.selfActions) {
        el.selfActions.style.display = isSelfUser ? 'flex' : 'none';
      }

      applyPrivacy();

      if (currentPrivacy.showActivity !== false) {
        await loadActivity(result.login, result.loginType);
      }
      if (currentPrivacy.showDynamic !== false) {
        await loadDynamicComments(result.login, result.loginType);
      }
      if (currentPrivacy.showPostComments !== false) {
        await loadPostComments(result.login, result.loginType);
      }
      if (currentPrivacy.showOj !== false) {
        await loadOjDiscussions(result.login, result.loginType);
      }

      if (currentPrivacy.showRecentBrowse === false) {
        if (el.recentList) el.recentList.textContent = isSelfUser ? '你已隐藏最近浏览' : '该用户隐藏了最近浏览';
      }

      if (currentUid) {
        await loadLikes(currentUid);
      }
    } catch (error) {
      console.error('加载用户失败:', error);
      setText(el.status, '加载失败');
    }
  }

  async function searchUsers(keyword) {
    if (!keyword) {
      renderSearchList([]);
      return;
    }
    const lower = keyword.toLowerCase();
    const [locals, activity] = await Promise.all([
      fetchDb('qb_users').catch(() => ({})),
      loadActivityCache()
    ]);
    const list = [];
    const seen = new Set();

    Object.entries(locals || {}).forEach(([login, data]) => {
      const nickname = data && data.nickname ? data.nickname : login;
      if (login.toLowerCase().includes(lower) || String(nickname).toLowerCase().includes(lower)) {
        const identifier = `qb_${login}`;
        if (!seen.has(identifier)) {
          seen.add(identifier);
          list.push({ login, loginType: 'local', nickname, identifier });
        }
      }
    });

    Object.values(activity || {}).forEach((item) => {
      const profile = item && item.profile ? item.profile : null;
      if (!profile || !profile.login) return;
      const login = String(profile.login);
      const nickname = profile.nickname || login;
      if (login.toLowerCase().includes(lower) || String(nickname).toLowerCase().includes(lower)) {
        const identifier = getAccountIdentifier(login, profile.loginType || 'github');
        if (identifier && !seen.has(identifier)) {
          seen.add(identifier);
          list.push({ login, loginType: profile.loginType || 'github', nickname, identifier });
        }
      }
    });

    renderSearchList(list.slice(0, 20));
  }

  function bindEvents() {
    if (el.searchBtn) {
      el.searchBtn.addEventListener('click', () => {
        const keyword = el.searchInput instanceof HTMLInputElement ? el.searchInput.value.trim() : '';
        void searchUsers(keyword);
      });
    }
    if (el.searchInput instanceof HTMLInputElement) {
      el.searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          void searchUsers(el.searchInput.value.trim());
        }
      });
    }
    if (el.logoutBtn) {
      el.logoutBtn.addEventListener('click', () => {
        if (window.CommentShared && typeof window.CommentShared.logout === 'function') {
          window.CommentShared.logout('/');
        }
      });
    }
    if (el.likeBtn) {
      el.likeBtn.addEventListener('click', () => {
        void handleLike();
      });
    }
    privacyButtons.forEach((button) => {
      button.addEventListener('click', () => {
        if (!isSelfUser) return;
        const key = button.getAttribute('data-privacy-toggle') || '';
        if (!key) return;
        const nextVisible = currentPrivacy[key] === false;
        void updatePrivacy(key, nextVisible);
      });
    });
  }

  function initTheme() {
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
  }

  function init() {
    initTheme();
    bindEvents();
    void loadProfile();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
