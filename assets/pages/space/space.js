// @ts-check
(function () {
  if (window.__quarkSpaceInited) return;
  window.__quarkSpaceInited = true;

  const API_BASE = '__API_BASE__';
  const LIKE_DAILY_LIMIT = 10;
  const STICKY_MAX_LENGTH = 200;

  const el = {
    list: document.getElementById('spaceSearchList'),
    activity: document.getElementById('spaceActivityList'),
    dynamic: document.getElementById('spaceDynamicList'),
    postComment: document.getElementById('spacePostCommentList'),
    oj: document.getElementById('spaceOjList'),
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
    searchCard: document.getElementById('spaceSearchCard'),
    likeBtn: document.getElementById('spaceLikeBtn'),
    likeCount: document.getElementById('spaceLikeCount'),
    likeStatus: document.getElementById('spaceLikeStatus'),
    badgeDisplay: document.getElementById('spaceBadge'),
    tabs: document.querySelectorAll('.space-tab'),
    panels: document.querySelectorAll('.space-panel[data-panel]'),
    // New elements
    speechTabs: document.querySelectorAll('.speech-subtab'),
    speechPanels: document.querySelectorAll('.speech-panel[data-speech-panel]'),
    signature: document.getElementById('spaceSignature'),
    bannerBg: document.getElementById('spaceBannerBg'),
    bannerImg: document.getElementById('spaceBannerImg'),
    stickiesForm: document.getElementById('stickiesForm'),
    stickiesInput: document.getElementById('stickiesInput'),
    stickiesSubmit: document.getElementById('stickiesSubmit'),
    stickiesList: document.getElementById('stickiesList'),
    stickiesCount: document.getElementById('stickiesCount'),
    stickiesGuestHint: document.getElementById('stickiesGuestHint')
  };

  const SKELETON_LISTS = ['activity', 'dynamic', 'postComment', 'oj', 'recentList'];
  const SKELETON_TEXT_FIELDS = ['loginType', 'registerAt', 'login', 'locationSummary', 'lastSeenSummary', 'recentPageSummary', 'location', 'lastSeen', 'recentPage'];

  const privacyButtons = Array.from(document.querySelectorAll('[data-privacy-toggle]'));
  const overviewItems = Array.from(document.querySelectorAll('.overview-item[data-privacy-key]'));

  const params = new URLSearchParams(window.location.search);
  let activityCache = null;
  let currentUser = null;
  let currentUid = '';
  let currentPrivacy = {};
  let isSelfUser = false;
  let likeState = { total: 0, todayCount: 0 };

  // ── Primary tab switching ──
  function initTabs() {
    el.tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        el.tabs.forEach(function (t) { t.classList.remove('is-active'); });
        tab.classList.add('is-active');
        el.panels.forEach(function (p) { p.classList.remove('is-active'); });
        var panel = document.querySelector('[data-panel="' + tab.dataset.tab + '"]');
        if (panel) panel.classList.add('is-active');
      });
    });
  }

  // ── Speech sub-tab switching ──
  function initSpeechTabs() {
    el.speechTabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        el.speechTabs.forEach(function (t) { t.classList.remove('is-active'); });
        tab.classList.add('is-active');
        el.speechPanels.forEach(function (p) { p.classList.remove('is-active'); });
        var panel = document.querySelector('[data-speech-panel="' + tab.dataset.speech + '"]');
        if (panel) panel.classList.add('is-active');
      });
    });
  }

  // ── Skeleton helpers ──
  function removeSkeletonText(targets) {
    if (!targets) return;
    (Array.isArray(targets) ? targets : [targets]).forEach(function (target) {
      if (target) {
        var skeletons = target.querySelectorAll('.skeleton-text');
        skeletons.forEach(function (s) { s.remove(); });
      }
    });
  }

  function showSkeletonList(listEl) {
    if (!listEl) return;
    listEl.innerHTML = '';
    listEl.classList.add('skeleton-placeholder');
  }

  function hideSkeletonList(listEl) {
    if (!listEl) return;
    listEl.classList.remove('skeleton-placeholder');
  }

  function setText(target, value) {
    if (!target) return;
    removeSkeletonText(target);
    target.textContent = value;
  }

  function escapeHtml(text) {
    var shared = window.CommentShared;
    if (shared && typeof shared.escapeHtml === 'function') {
      return shared.escapeHtml(text);
    }
    return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function escapeAttr(text) {
    return String(text ?? '').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function formatDate(ts) {
    if (!ts) return '-';
    var date = new Date(ts);
    if (Number.isNaN(date.getTime())) return '-';
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }

  function formatDateTime(ts) {
    if (!ts) return '-';
    var date = new Date(ts);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('zh-CN', { hour12: false });
  }

  function formatAgo(ts) {
    if (!ts) return '-';
    var diff = Date.now() - ts;
    if (diff < 60 * 1000) return '刚刚';
    var minutes = Math.round(diff / 60000);
    if (minutes < 60) return minutes + ' 分钟前';
    var hours = Math.round(minutes / 60);
    if (hours < 24) return hours + ' 小时前';
    var days = Math.round(hours / 24);
    return days + ' 天前';
  }

  function getDayKey() {
    var now = new Date();
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  }

  function setAvatar(url, name) {
    if (el.avatar instanceof HTMLImageElement) {
      if (url) {
        el.avatar.src = url;
        el.avatar.style.display = 'block';
        el.avatar.classList.remove('loaded');
        el.avatar.addEventListener('load', function () {
          el.avatar.classList.add('loaded');
          if (el.avatarFallback) el.avatarFallback.style.display = 'none';
        }, { once: true });
        el.avatar.addEventListener('error', function () {
          el.avatar.style.display = 'none';
          if (el.avatarFallback) el.avatarFallback.style.display = 'flex';
        }, { once: true });
      } else {
        el.avatar.style.display = 'none';
      }
    }
    if (el.avatarFallback instanceof HTMLElement) {
      var letter = name ? name.slice(0, 1).toUpperCase() : 'Q';
      el.avatarFallback.textContent = letter;
      el.avatarFallback.style.display = url ? 'none' : 'flex';
    }
  }

  function setBannerBackground(url) {
    if (!el.bannerBg || !el.bannerImg) return;
    if (url) {
      el.bannerImg.src = url;
      el.bannerImg.classList.remove('loaded');
      el.bannerBg.classList.add('has-image');
      el.bannerImg.addEventListener('load', function () {
        el.bannerImg.classList.add('loaded');
      }, { once: true });
      el.bannerImg.addEventListener('error', function () {
        el.bannerBg.classList.remove('has-image');
        el.bannerImg.style.display = 'none';
      }, { once: true });
    } else {
      el.bannerBg.classList.remove('has-image');
      el.bannerImg.classList.remove('loaded');
      el.bannerImg.removeAttribute('src');
    }
  }

  function setSignature(text) {
    if (!el.signature) return;
    if (text && String(text).trim()) {
      el.signature.textContent = String(text).trim();
      el.signature.removeAttribute('data-empty');
    } else {
      el.signature.textContent = '';
      el.signature.setAttribute('data-empty', 'true');
    }
  }

  function matchLogin(item, login, loginType) {
    if (!item || !login) return false;
    var itemLogin = String(item.login || '');
    var itemType = String(item.loginType || '');
    if (itemLogin !== login) return false;
    if (!loginType) return true;
    if (!itemType) return true;
    return itemType === loginType;
  }

  async function fetchDb(path, query) {
    if (!path) return null;
    var urlParams = new URLSearchParams({ path: path });
    if (query) {
      Object.keys(query).forEach(function (key) {
        var value = query[key];
        if (value !== undefined && value !== null && value !== '') {
          urlParams.set(key, String(value));
        }
      });
    }
    var resp = await fetch(API_BASE + '/api/db?' + urlParams.toString());
    if (!resp.ok) throw new Error('DB ' + resp.status);
    var data = await resp.json();
    return data && data.data ? data.data : null;
  }

  async function postDb(op, path, value) {
    var resp = await fetch(API_BASE + '/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op: op, path: path, value: value })
    });
    if (!resp.ok) throw new Error('DB ' + resp.status);
    return resp.json().catch(function () { return {}; });
  }

  async function loadActivityCache() {
    if (activityCache) return activityCache;
    activityCache = await fetchDb('user_activity').catch(function () { return {}; }) || {};
    return activityCache;
  }

  function getAccountIdentifier(login, loginType) {
    var shared = window.CommentShared;
    if (shared && typeof shared.getAccountIdentifierFrom === 'function') {
      return shared.getAccountIdentifierFrom(login || '', loginType || '');
    }
    if (!login) return '';
    return loginType === 'local' ? 'qb_' + login : 'gh_' + login;
  }

  function normalizeIdentifier(raw) {
    var input = String(raw || '').trim();
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
    var shared = window.CommentShared;
    var profile = shared && typeof shared.getLoginProfile === 'function'
      ? shared.getLoginProfile()
      : null;
    if (!profile || !profile.login) return false;
    var identifier = getAccountIdentifier(profile.login, profile.loginType || '');
    if (!identifier) return false;
    return identifier === getAccountIdentifier(login, loginType);
  }

  function getLoginProfile() {
    var shared = window.CommentShared;
    return shared && typeof shared.getLoginProfile === 'function'
      ? shared.getLoginProfile()
      : null;
  }

  function isLoggedIn() {
    var profile = getLoginProfile();
    return !!(profile && profile.login);
  }

  async function resolveUser(identifier) {
    if (!identifier) return null;
    var parsed = normalizeIdentifier(identifier);
    var activity = await loadActivityCache();
    var entries = Object.entries(activity || {});
    var matchedUid = '';
    var matchedProfile = null;

    if (parsed.login) {
      for (var _i = 0; _i < entries.length; _i++) {
        var entry = entries[_i];
        var uid = entry[0];
        var item = entry[1];
        var profile = item && item.profile ? item.profile : null;
        if (!profile || !profile.login) continue;
        var profileLogin = String(profile.login);
        var profileType = String(profile.loginType || 'github');
        if (profileLogin !== parsed.login) continue;
        if (parsed.loginType && profileType !== parsed.loginType) continue;
        matchedUid = uid;
        matchedProfile = profile;
        break;
      }
    }

    if (!matchedProfile && parsed.login && parsed.loginType === 'local') {
      var qb = await fetchDb('qb_users/' + parsed.login.toLowerCase()).catch(function () { return null; });
      if (qb) {
        matchedProfile = {
          login: parsed.login,
          loginType: 'local',
          nickname: qb.nickname || parsed.login,
          avatarUrl: qb.avatarUrl || '',
          avatarType: qb.avatarUrl ? 'image' : (qb.avatarType || 'color'),
          avatarColor: qb.avatarColor || '#4a6cf7',
          createdAt: qb.createdAt || 0,
          updatedAt: qb.updatedAt || 0,
          signature: qb.signature || '',
          backgroundImage: qb.backgroundImage || ''
        };
      }
    }

    if (!matchedProfile) return null;
    var loginType = matchedProfile.loginType || parsed.loginType || 'github';
    var login = matchedProfile.login || parsed.login;
    var identifierOut = getAccountIdentifier(login, loginType);

    return {
      uid: matchedUid,
      login: login,
      loginType: loginType,
      identifier: identifierOut,
      profile: matchedProfile,
      raw: activity[matchedUid] || {}
    };
  }

  function renderSearchList(items) {
    if (!(el.list instanceof HTMLElement)) return;
    hideSkeletonList(el.list);
    if (!items.length) {
      el.list.textContent = '未找到匹配用户';
      return;
    }
    el.list.innerHTML = items.map(function (item, i) {
      return '<div class="space-row" style="--i:' + i + '">' +
        '<strong>' + escapeHtml(item.nickname || item.login) + '</strong>' +
        '<div>账号标识：' + escapeHtml(item.identifier) + '</div>' +
        '<a href="/space?user=' + encodeURIComponent(item.identifier) + '">查看主页</a>' +
        '</div>';
    }).join('');
  }

  function renderList(target, items, emptyText, builder) {
    if (!(target instanceof HTMLElement)) return;
    hideSkeletonList(target);
    if (!items.length) {
      target.textContent = emptyText;
      return;
    }
    target.innerHTML = items.map(function (item, i) {
      return builder(item).replace('<div', '<div style="--i:' + i + '"');
    }).join('');
  }

  function renderRecent(events) {
    if (!(el.recentList instanceof HTMLElement)) return;
    hideSkeletonList(el.recentList);
    if (!events.length) {
      el.recentList.textContent = '暂无浏览记录';
      return;
    }
    el.recentList.innerHTML = events.map(function (item, i) {
      return '<div class="space-row" style="--i:' + i + '">' +
        '<strong>' + escapeHtml(item.title || '未命名页面') + '</strong>' +
        '<div>' + formatDateTime(item.ts) + '</div>' +
        '<a href="' + escapeAttr(item.path || '#') + '">' + escapeHtml(item.path || '链接') + '</a>' +
        '</div>';
    }).join('');
  }

  // ── Badge display ──
  function renderBadge(identifier) {
    var shared = window.CommentShared;
    if (shared && typeof shared.renderBadge === 'function') {
      return shared.renderBadge(identifier);
    }
    var badges = window.__USER_BADGES__ || {};
    var data = badges[identifier];
    if (!data || !data.badge) return '';
    return '<span class="user-badge">' + escapeHtml(String(data.badge)) + '</span>';
  }

  async function loadActivity(login, loginType) {
    try {
      var raw = await fetchDb('chatrooms/lsqkk-lyb/messages');
      var list = raw ? Object.values(raw) : [];
      var items = list.filter(function (msg) { return matchLogin(msg, login, loginType); })
        .sort(function (a, b) { return (b.timestamp || 0) - (a.timestamp || 0); })
        .slice(0, 5)
        .map(function (msg) { return { text: msg.text || '无内容', timestamp: msg.timestamp || 0 }; });
      renderList(el.activity, items, '暂无发言', function (item) {
        return '<div class="space-row">' +
          '<strong>' + escapeHtml(item.text) + '</strong>' +
          '<div>' + formatDateTime(item.timestamp) + '</div>' +
          '<a href="/blog/lyb">前往留言板</a>' +
          '</div>';
      });
    } catch (error) {
      console.error('加载发言失败:', error);
      hideSkeletonList(el.activity);
      if (el.activity) el.activity.textContent = '加载失败';
    }
  }

  async function loadDynamicComments(login, loginType) {
    try {
      var raw = await fetchDb('dynamic_posts');
      var posts = raw ? Object.entries(raw) : [];
      var items = [];
      posts.forEach(function (entry) {
        var postId = entry[0];
        var post = entry[1];
        var comments = post && post.comments ? post.comments : null;
        if (!comments) return;
        Object.values(comments).forEach(function (comment) {
          if (matchLogin(comment, login, loginType)) {
            items.push({ postId: postId, text: comment.text || '无内容', timestamp: comment.timestamp || 0 });
          }
          if (comment && comment.replies) {
            Object.values(comment.replies).forEach(function (reply) {
              if (matchLogin(reply, login, loginType)) {
                items.push({ postId: postId, text: reply.text || '无内容', timestamp: reply.timestamp || 0 });
              }
            });
          }
        });
      });
      var sorted = items.sort(function (a, b) { return (b.timestamp || 0) - (a.timestamp || 0); }).slice(0, 5);
      renderList(el.dynamic, sorted, '暂无动态评论', function (item) {
        return '<div class="space-row">' +
          '<strong>' + escapeHtml(item.text) + '</strong>' +
          '<div>' + formatDateTime(item.timestamp) + '</div>' +
          '<a href="/blog/dt/' + encodeURIComponent(item.postId) + '">查看动态</a>' +
          '</div>';
      });
    } catch (error) {
      console.error('加载动态评论失败:', error);
      hideSkeletonList(el.dynamic);
      if (el.dynamic) el.dynamic.textContent = '加载失败';
    }
  }

  async function loadPostComments(login, loginType) {
    try {
      var raw = await fetchDb('post_annotations');
      var posts = raw ? Object.entries(raw) : [];
      var items = [];
      posts.forEach(function (entry) {
        var post = entry[1];
        var highlights = post && post.highlights ? post.highlights : null;
        if (!highlights) return;
        Object.values(highlights).forEach(function (highlight) {
          var comments = highlight && highlight.comments ? highlight.comments : null;
          if (!comments) return;
          Object.values(comments).forEach(function (comment) {
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
      var sorted = items.sort(function (a, b) { return (b.timestamp || 0) - (a.timestamp || 0); }).slice(0, 5);
      renderList(el.postComment, sorted, '暂无文章评论', function (item) {
        return '<div class="space-row">' +
          '<strong>' + escapeHtml(item.text) + '</strong>' +
          '<div>' + formatDateTime(item.timestamp) + '</div>' +
          (item.postPath ? '<a href="' + escapeAttr(item.postPath) + '">查看文章' + (item.postTitle ? ' · ' + escapeHtml(item.postTitle) : '') + '</a>' : '<span>来源未知</span>') +
          '</div>';
      });
    } catch (error) {
      console.error('加载文章评论失败:', error);
      hideSkeletonList(el.postComment);
      if (el.postComment) el.postComment.textContent = '加载失败';
    }
  }

  async function loadOjDiscussions(login, loginType) {
    try {
      var raw = await fetchDb('oj-discussions');
      var list = raw ? Object.entries(raw) : [];
      var items = [];
      list.forEach(function (entry) {
        var discussionId = entry[0];
        var discussion = entry[1];
        var replies = discussion && discussion.replies ? discussion.replies : null;
        if (!replies) return;
        Object.values(replies).forEach(function (reply) {
          if (matchLogin(reply, login, loginType)) {
            items.push({ discussionId: discussionId, text: reply.text || '无内容', timestamp: reply.timestamp || 0 });
          }
        });
      });
      var sorted = items.sort(function (a, b) { return (b.timestamp || 0) - (a.timestamp || 0); }).slice(0, 5);
      renderList(el.oj, sorted, '暂无讨论', function (item) {
        return '<div class="space-row">' +
          '<strong>' + escapeHtml(item.text) + '</strong>' +
          '<div>' + formatDateTime(item.timestamp) + '</div>' +
          '<a href="/a/oj/discussion?id=' + encodeURIComponent(item.discussionId) + '">查看讨论</a>' +
          '</div>';
      });
    } catch (error) {
      console.error('加载OJ讨论失败:', error);
      hideSkeletonList(el.oj);
      if (el.oj) el.oj.textContent = '加载失败';
    }
  }

  // ── Stickies (随心贴) ──
  function renderStickies(items) {
    if (!(el.stickiesList instanceof HTMLElement)) return;
    hideSkeletonList(el.stickiesList);
    if (!items.length) {
      el.stickiesList.innerHTML = '<div class="sticky-empty">还没有留言，来写第一条吧 ✨</div>';
      return;
    }
    el.stickiesList.innerHTML = items.map(function (item, i) {
      var letter = escapeHtml((item.authorNickname || '?')[0].toUpperCase());
      var avatarHtml;
      if (item.authorAvatarUrl) {
        avatarHtml = '<div class="sticky-avatar"><img src="' + escapeAttr(item.authorAvatarUrl) + '" alt="" onerror="this.outerHTML=\'<span class=sticky-avatar-fallback>' + letter + '</span>\'" /></div>';
      } else {
        avatarHtml = '<div class="sticky-avatar-fallback">' + letter + '</div>';
      }
      return '<div class="sticky-item" style="--i:' + i + '">' +
        avatarHtml +
        '<div class="sticky-body">' +
        '<div class="sticky-header">' +
        '<span class="sticky-author">' + escapeHtml(item.authorNickname || '匿名') + '</span>' +
        '<span class="sticky-time">' + formatAgo(item.timestamp) + '</span>' +
        '</div>' +
        '<div class="sticky-text">' + escapeHtml(item.text) + '</div>' +
        '</div>' +
        '</div>';
    }).join('');
  }

  async function loadStickies(targetUid) {
    if (!targetUid) return;
    try {
      var data = await fetchDb('user_space_stickies/' + targetUid + '/messages');
      var list = data ? Object.values(data) : [];
      var sorted = list.sort(function (a, b) { return (b.timestamp || 0) - (a.timestamp || 0); });
      renderStickies(sorted);
    } catch (error) {
      console.error('加载随心贴失败:', error);
      hideSkeletonList(el.stickiesList);
      if (el.stickiesList) el.stickiesList.textContent = '加载失败';
    }
  }

  function updateStickiesCount() {
    if (!el.stickiesCount || !el.stickiesInput) return;
    var len = el.stickiesInput.value.length;
    el.stickiesCount.textContent = len + ' / ' + STICKY_MAX_LENGTH;
    if (el.stickiesSubmit instanceof HTMLButtonElement) {
      el.stickiesSubmit.disabled = len === 0 || len > STICKY_MAX_LENGTH;
    }
  }

  async function postSticky() {
    if (!currentUid || !(el.stickiesInput instanceof HTMLTextAreaElement)) return;
    var text = el.stickiesInput.value.trim();
    if (!text || text.length > STICKY_MAX_LENGTH) return;
    var profile = getLoginProfile();
    if (!profile || !profile.login) return;
    if (el.stickiesSubmit instanceof HTMLButtonElement) el.stickiesSubmit.disabled = true;
    try {
      var sticky = {
        authorLogin: profile.login,
        authorLoginType: profile.loginType || 'github',
        authorNickname: profile.nickname || profile.login,
        authorAvatarUrl: profile.avatarUrl || '',
        text: text,
        timestamp: Date.now()
      };
      await postDb('push', 'user_space_stickies/' + currentUid + '/messages', sticky);
      el.stickiesInput.value = '';
      updateStickiesCount();
      void loadStickies(currentUid);
    } catch (error) {
      console.error('发布随心贴失败:', error);
      if (el.stickiesSubmit instanceof HTMLButtonElement) el.stickiesSubmit.disabled = false;
    }
  }

  function initStickiesForm() {
    if (!el.stickiesInput || !el.stickiesCount || !el.stickiesSubmit) return;
    el.stickiesInput.addEventListener('input', updateStickiesCount);
    el.stickiesSubmit.addEventListener('click', function () { void postSticky(); });
    el.stickiesInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        void postSticky();
      }
    });
    updateStickiesCount();
  }

  function toggleStickiesForm() {
    if (!el.stickiesForm || !el.stickiesGuestHint) return;
    if (isLoggedIn()) {
      el.stickiesForm.style.display = 'flex';
      el.stickiesGuestHint.style.display = 'none';
    } else {
      el.stickiesForm.style.display = 'none';
      el.stickiesGuestHint.style.display = 'flex';
    }
  }

  function applyPrivacy() {
    overviewItems.forEach(function (item) {
      var key = item.getAttribute('data-privacy-key') || '';
      if (!key) return;
      var visible = currentPrivacy[key] !== false;
      if (!visible && !isSelfUser) {
        item.classList.add('is-hidden');
      } else {
        item.classList.remove('is-hidden');
      }
      item.classList.toggle('is-private', !visible && isSelfUser);
    });

    privacyButtons.forEach(function (button) {
      var key = button.getAttribute('data-privacy-toggle') || '';
      if (!key) return;
      var visible = currentPrivacy[key] !== false;
      button.classList.toggle('is-off', !visible);
      if (!isSelfUser) {
        button.setAttribute('disabled', 'true');
      } else {
        button.removeAttribute('disabled');
      }
    });
  }

  async function updatePrivacy(key, visible) {
    if (!currentUid || !key) return;
    currentPrivacy = Object.assign({}, currentPrivacy);
    currentPrivacy[key] = visible;
    applyPrivacy();
    try {
      await postDb('update', 'user_activity/' + currentUid + '/profile', {
        privacy: currentPrivacy,
        updatedAt: Date.now()
      });
    } catch (error) {
      console.error('更新隐私设置失败:', error);
    }
  }

  function getLikeActorId() {
    var shared = window.CommentShared;
    var profile = shared && typeof shared.getLoginProfile === 'function'
      ? shared.getLoginProfile()
      : null;
    if (profile && profile.login) {
      return getAccountIdentifier(profile.login, profile.loginType || '');
    }
    if (shared && typeof shared.getGuestUid === 'function') {
      return shared.getGuestUid() || '';
    }
    return '';
  }

  async function loadLikes(targetUid) {
    if (!targetUid) return;
    try {
      var data = await fetchDb('user_space_likes/' + targetUid) || {};
      var total = typeof data.total === 'number' ? data.total : 0;
      var dayKey = getDayKey();
      var likeId = getLikeActorId();
      var todayCount = likeId && data.daily && data.daily[dayKey] && data.daily[dayKey][likeId]
        ? Number(data.daily[dayKey][likeId]) : 0;
      likeState = { total: total, todayCount: todayCount };
      if (el.likeCount) el.likeCount.textContent = String(total);
      if (el.likeStatus) {
        var remain = Math.max(0, LIKE_DAILY_LIMIT - todayCount);
        el.likeStatus.textContent = '今日可点赞 ' + remain + ' 次';
      }
    } catch (error) {
      console.error('加载点赞失败:', error);
    }
  }

  async function handleLike() {
    if (!currentUid) return;
    var likeId = getLikeActorId();
    if (!likeId) {
      if (el.likeStatus) el.likeStatus.textContent = '请先登录或刷新后再试';
      return;
    }
    var dayKey = getDayKey();
    if (likeState.todayCount >= LIKE_DAILY_LIMIT) {
      if (el.likeStatus) el.likeStatus.textContent = '今日点赞已达上限';
      return;
    }
    try {
      var data = await fetchDb('user_space_likes/' + currentUid) || {};
      var total = typeof data.total === 'number' ? data.total : 0;
      var todayCount = likeId && data.daily && data.daily[dayKey] && data.daily[dayKey][likeId]
        ? Number(data.daily[dayKey][likeId]) : 0;
      if (todayCount >= LIKE_DAILY_LIMIT) {
        likeState.todayCount = todayCount;
        if (el.likeStatus) el.likeStatus.textContent = '今日点赞已达上限';
        return;
      }
      var nextCount = todayCount + 1;
      var nextTotal = total + 1;
      await postDb('update', 'user_space_likes/' + currentUid, {
        total: nextTotal,
        ['daily/' + dayKey + '/' + likeId]: nextCount
      });
      likeState = { total: nextTotal, todayCount: nextCount };
      if (el.likeCount) el.likeCount.textContent = String(nextTotal);
      if (el.likeStatus) {
        var remain = Math.max(0, LIKE_DAILY_LIMIT - nextCount);
        el.likeStatus.textContent = '今日可点赞 ' + remain + ' 次';
      }
    } catch (error) {
      console.error('点赞失败:', error);
      if (el.likeStatus) el.likeStatus.textContent = '点赞失败，请稍后再试';
    }
  }

  async function loadProfile() {
    var rawIdentifier = params.get('user') || '';
    if (!rawIdentifier) {
      SKELETON_TEXT_FIELDS.forEach(function (key) { removeSkeletonText(el[key]); });
      SKELETON_LISTS.forEach(function (key) { hideSkeletonList(el[key]); });
      if (el.nickname) setText(el.nickname, '请输入用户后搜索');
      if (el.selfActions) el.selfActions.style.display = 'none';
      return;
    }

    try {
      var result = await resolveUser(rawIdentifier);
      if (!result) {
        SKELETON_TEXT_FIELDS.forEach(function (key) { removeSkeletonText(el[key]); });
        SKELETON_LISTS.forEach(function (key) { hideSkeletonList(el[key]); });
        setText(el.nickname, '未找到用户');
        return;
      }

      var profile = result.profile || {};
      currentUser = result;
      currentUid = result.uid || '';
      currentPrivacy = profile.privacy || {};
      isSelfUser = isSelf(result.login, result.loginType);

      SKELETON_TEXT_FIELDS.forEach(function (key) { removeSkeletonText(el[key]); });

      setText(el.nickname, profile.nickname || result.login);
      setText(el.handle, result.identifier ? '@' + result.identifier : '@-');
      setText(el.loginType, '类型：' + (result.loginType === 'local' ? '站内账号' : 'GitHub'));
      setText(el.registerAt, '注册时间：' + formatDate(profile.createdAt || profile.updatedAt || 0));
      setText(el.login, result.identifier ? '账号标识：' + result.identifier : '账号标识：-');

      // Signature
      setSignature(profile.signature || '');

      // Background image
      setBannerBackground(profile.backgroundImage || '');

      var locationText = [profile.province, profile.city].filter(Boolean).join(' ');
      setText(el.location, 'IP 属地：' + (locationText || '-'));
      setText(el.locationSummary, locationText || '-');

      var activity = await loadActivityCache();
      var userData = currentUid ? activity[currentUid] || {} : {};
      var events = userData && userData.events ? Object.values(userData.events) : [];
      var logins = userData && userData.logins ? Object.values(userData.logins) : [];
      var latestEvent = events.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); })[0];
      var latestLogin = logins.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); })[0];
      var lastSeenTs = latestEvent && latestEvent.ts ? latestEvent.ts : (latestLogin && latestLogin.ts ? latestLogin.ts : 0);

      if (currentUid) {
        var presence = await fetchDb('presence/' + currentUid).catch(function () { return null; });
        if (presence && presence.lastSeen) {
          lastSeenTs = Math.max(lastSeenTs || 0, presence.lastSeen);
        }
      }

      setText(el.lastSeen, formatAgo(lastSeenTs) + ' (' + formatDateTime(lastSeenTs) + ')');
      setText(el.lastSeenSummary, formatAgo(lastSeenTs));

      var recentPageTitle = latestEvent ? (latestEvent.title || latestEvent.path || '-') : '-';
      setText(el.recentPage, recentPageTitle);
      setText(el.recentPageSummary, recentPageTitle || '-');

      var recentEvents = events.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); }).slice(0, 5);
      renderRecent(recentEvents);

      setAvatar(profile.avatarUrl || profile.avatar || '', profile.nickname || result.login);

      // Show badge
      if (el.badgeDisplay && result.identifier) {
        el.badgeDisplay.innerHTML = renderBadge(result.identifier);
      }

      if (el.selfActions) {
        el.selfActions.style.display = isSelfUser ? 'flex' : 'none';
      }

      applyPrivacy();

      // Load data for tabs
      if (currentPrivacy.showActivity !== false) await loadActivity(result.login, result.loginType);
      if (currentPrivacy.showDynamic !== false) await loadDynamicComments(result.login, result.loginType);
      if (currentPrivacy.showPostComments !== false) await loadPostComments(result.login, result.loginType);
      if (currentPrivacy.showOj !== false) await loadOjDiscussions(result.login, result.loginType);
      if (currentUid) {
        await loadStickies(currentUid);
        await loadLikes(currentUid);
      }

      toggleStickiesForm();
    } catch (error) {
      console.error('加载用户失败:', error);
      SKELETON_TEXT_FIELDS.forEach(function (key) { removeSkeletonText(el[key]); });
      SKELETON_LISTS.forEach(function (key) { hideSkeletonList(el[key]); });
      setText(el.nickname, '加载失败');
    }
  }

  async function searchUsers(keyword) {
    if (!keyword) {
      if (el.searchCard) el.searchCard.style.display = 'none';
      return;
    }
    if (el.searchCard) el.searchCard.style.display = 'block';
    showSkeletonList(el.list);
    try {
      var lower = keyword.toLowerCase();
      var locals = await fetchDb('qb_users').catch(function () { return {}; });
      var activity = await loadActivityCache();
      var list = [];
      var seen = new Set();

      Object.entries(locals || {}).forEach(function (entry) {
        var plogin = entry[0];
        var data = entry[1];
        var nickname = data && data.nickname ? data.nickname : plogin;
        if (plogin.toLowerCase().includes(lower) || String(nickname).toLowerCase().includes(lower)) {
          var identifier = 'qb_' + plogin;
          if (!seen.has(identifier)) {
            seen.add(identifier);
            list.push({ login: plogin, loginType: 'local', nickname: nickname, identifier: identifier });
          }
        }
      });

      Object.values(activity || {}).forEach(function (item) {
        var profile = item && item.profile ? item.profile : null;
        if (!profile || !profile.login) return;
        var pLogin = String(profile.login);
        var nickname = profile.nickname || pLogin;
        if (pLogin.toLowerCase().includes(lower) || String(nickname).toLowerCase().includes(lower)) {
          var identifier = getAccountIdentifier(pLogin, profile.loginType || 'github');
          if (identifier && !seen.has(identifier)) {
            seen.add(identifier);
            list.push({ login: pLogin, loginType: profile.loginType || 'github', nickname: nickname, identifier: identifier });
          }
        }
      });

      renderSearchList(list.slice(0, 20));
    } catch (error) {
      console.error('搜索失败:', error);
      hideSkeletonList(el.list);
      if (el.list) el.list.textContent = '搜索失败';
    }
  }

  function bindEvents() {
    if (el.searchBtn) {
      el.searchBtn.addEventListener('click', function () {
        var keyword = el.searchInput instanceof HTMLInputElement ? el.searchInput.value.trim() : '';
        void searchUsers(keyword);
      });
    }
    if (el.searchInput instanceof HTMLInputElement) {
      el.searchInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          void searchUsers(el.searchInput.value.trim());
        }
      });
    }
    if (el.logoutBtn) {
      el.logoutBtn.addEventListener('click', function () {
        if (window.CommentShared && typeof window.CommentShared.logout === 'function') {
          window.CommentShared.logout('/');
        }
      });
    }
    if (el.likeBtn) {
      el.likeBtn.addEventListener('click', function () { void handleLike(); });
    }
    privacyButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        if (!isSelfUser) return;
        var key = button.getAttribute('data-privacy-toggle') || '';
        if (!key) return;
        var nextVisible = currentPrivacy[key] === false;
        void updatePrivacy(key, nextVisible);
      });
    });
  }

  function initTheme() {
    var media = window.matchMedia('(prefers-color-scheme: dark)');
    var applyTheme = function () {
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
    initTabs();
    initSpeechTabs();
    initStickiesForm();
    bindEvents();
    void loadProfile();
    // Safety net: force clear skeletons after 25s
    setTimeout(function () {
      ['nickname', 'handle', 'loginType', 'registerAt', 'login', 'locationSummary', 'lastSeenSummary', 'recentPageSummary', 'location', 'lastSeen', 'recentPage'].forEach(function (key) {
        var t = el[key];
        if (t) { var s = t.querySelectorAll('.skeleton-text'); s.forEach(function (x) { x.remove(); }); }
      });
      SKELETON_LISTS.forEach(function (key) { hideSkeletonList(el[key]); });
      if (el.stickiesList) hideSkeletonList(el.stickiesList);
      if (el.nickname && (!el.nickname.textContent || el.nickname.textContent === '' || el.nickname.textContent === '-')) {
        el.nickname.textContent = '加载超时，请刷新重试';
      }
    }, 25000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
