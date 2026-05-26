// nav.js
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/assets/css/nav.css';
document.head.appendChild(link);
const profileScript = document.createElement('script');
profileScript.src = '/assets/js/user-profile.js';
profileScript.defer = true;
document.head.appendChild(profileScript);
if (!document.querySelector('script[src="/assets/js/comment-shared.js"]')) {
    const sharedScript = document.createElement('script');
    sharedScript.src = '/assets/js/comment-shared.js';
    sharedScript.defer = true;
    document.head.appendChild(sharedScript);
}
if (!document.querySelector('script[src="/assets/js/firebase-ready.js"]')) {
    const firebaseReadyScript = document.createElement('script');
    firebaseReadyScript.src = '/assets/js/firebase-ready.js';
    firebaseReadyScript.defer = true;
    document.head.appendChild(firebaseReadyScript);
}
const preferenceScript = document.createElement('script');
preferenceScript.src = '/assets/js/user-preferences.js';
preferenceScript.defer = true;
document.head.appendChild(preferenceScript);
const activityScript = document.createElement('script');
activityScript.src = '/assets/js/user-activity.js';
activityScript.defer = true;
document.head.appendChild(activityScript);
function ensureCursorTrail() {
    const hasCursorCss = !!document.querySelector('link[href*="cursor.css"]');
    const hasCursorScript = !!document.querySelector('script[src="/assets/js/cursor-trail.js"]');
    if (!hasCursorCss) {
        const cursorCss = document.createElement('link');
        cursorCss.rel = 'stylesheet';
        cursorCss.href = '/assets/css/cursor.css';
        document.head.appendChild(cursorCss);
    }
    if (hasCursorScript) return;
    const cursorScript = document.createElement('script');
    cursorScript.src = '/assets/js/cursor-trail.js';
    cursorScript.defer = true;
    document.head.appendChild(cursorScript);
}
ensureCursorTrail();
const hoverRootMap = {
    '/posts': 'posts',
    '/tool': 'tool',
    '/games': 'games',
    '/a': 'a',
    '/blog': 'blog'
};
const hoverRootLabelMap = {
    posts: '文章',
    tool: '工具',
    games: '游戏',
    a: '实验室',
    blog: '更多'
};
const LANGUAGE_STORAGE_KEY = 'quark_language_preference';
const DEFAULT_LANGUAGE = 'chinese_simplified';
const LANGUAGE_OPTIONS = [
    { code: 'chinese_simplified', urlCode: '', label: '中文/CN', htmlLang: 'zh-CN' },
    { code: 'english', urlCode: 'en', label: 'English', htmlLang: 'en' },
    { code: 'japanese', urlCode: 'ja', label: '日本語', htmlLang: 'ja' },
    { code: 'korean', urlCode: 'ko', label: '한국어', htmlLang: 'ko' },
    { code: 'french', urlCode: 'fr', label: 'Français', htmlLang: 'fr' },
    { code: 'german', urlCode: 'de', label: 'Deutsch', htmlLang: 'de' },
    { code: 'spanish', urlCode: 'es', label: 'Español', htmlLang: 'es' },
    { code: 'russian', urlCode: 'ru', label: 'Русский', htmlLang: 'ru' }
];
const LANGUAGE_OPTION_MAP = new Map(LANGUAGE_OPTIONS.map(option => [option.code, option]));
const LANGUAGE_URL_MAP = new Map(LANGUAGE_OPTIONS.filter(option => option.urlCode).map(option => [option.urlCode, option]));

function normalizeLanguageCode(language) {
    if (!language) return DEFAULT_LANGUAGE;
    return LANGUAGE_OPTION_MAP.has(language) ? language : DEFAULT_LANGUAGE;
}

function getLanguageOption(language) {
    return LANGUAGE_OPTION_MAP.get(normalizeLanguageCode(language)) || LANGUAGE_OPTION_MAP.get(DEFAULT_LANGUAGE);
}

function getLanguageFromUrl() {
    try {
        const lan = new URLSearchParams(window.location.search).get('lan');
        if (!lan) return null;
        const option = LANGUAGE_URL_MAP.get(String(lan).toLowerCase());
        return option ? option.code : null;
    } catch {
        return null;
    }
}

function getStoredLanguage() {
    try {
        return normalizeLanguageCode(localStorage.getItem(LANGUAGE_STORAGE_KEY));
    } catch {
        return DEFAULT_LANGUAGE;
    }
}

function persistLanguagePreference(language) {
    try {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, normalizeLanguageCode(language));
        const pref = window.QuarkUserPreferences;
        if (pref && typeof pref.update === 'function') {
            void pref.update({ language: normalizeLanguageCode(language) });
        }
    } catch {
        // ignore storage errors
    }
}

function resolvePreferredLanguage() {
    return normalizeLanguageCode(getLanguageFromUrl() || getStoredLanguage() || DEFAULT_LANGUAGE);
}

let currentLanguage = resolvePreferredLanguage();

function buildLocalizedUrl(href, language = currentLanguage) {
    if (!href || typeof href !== 'string') return href;
    if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
        return href;
    }

    try {
        const url = new URL(href, window.location.origin);
        if (url.origin !== window.location.origin) return href;

        const option = getLanguageOption(language);
        if (option.urlCode) {
            url.searchParams.set('lan', option.urlCode);
        } else {
            url.searchParams.delete('lan');
        }

        return `${url.pathname}${url.search}${url.hash}`;
    } catch {
        return href;
    }
}

function updateCurrentPageLanguageUrl(language) {
    const localizedUrl = buildLocalizedUrl(window.location.pathname + window.location.search + window.location.hash, language);
    if (localizedUrl) {
        window.history.replaceState(window.history.state, '', localizedUrl);
    }
}

function updateDocumentLanguage(language) {
    const option = getLanguageOption(language);
    if (document.documentElement) {
        document.documentElement.lang = option.htmlLang || 'zh-CN';
    }
}

function renderLanguageMenuItems() {
    return LANGUAGE_OPTIONS.map(option => `<li><button type="button" data-lang="${option.code}">${option.label}</button></li>`).join('');
}

function renderLanguageSelectOptions() {
    return LANGUAGE_OPTIONS.map(option => `<option value="${option.code}">${option.label}</option>`).join('');
}

// SVG icon helper — replaces Font Awesome dependency
function svgIcon(name) {
  var svgs = {
    "chevron-down": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" width="1em" height="1em" fill="currentColor" style="vertical-align:middle;display:inline-block"><path d="M224 416c-8.188 0-16.38-3.125-22.62-9.375l-192-192c-12.5-12.5-12.5-32.75 0-45.25s32.75-12.5 45.25 0L224 338.8l169.4-169.4c12.5-12.5 32.75-12.5 45.25 0s12.5 32.75 0 45.25l-192 192C240.4 412.9 232.2 416 224 416z"/></svg>',
    search: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1em" height="1em" fill="currentColor" style="vertical-align:middle;display:inline-block"><path d="M500.3 443.7l-119.7-119.7c27.22-40.41 40.65-90.9 33.46-144.7C401.8 87.79 326.8 13.32 235.2 1.723C99.01-15.51-15.51 99.01 1.724 235.2c11.6 91.64 86.08 166.7 177.6 178.9c53.8 7.189 104.3-6.236 144.7-33.46l119.7 119.7c15.62 15.62 40.95 15.62 56.57 0C515.9 484.7 515.9 459.3 500.3 443.7zM79.1 208c0-70.58 57.42-128 128-128s128 57.42 128 128c0 70.58-57.42 128-128 128S79.1 278.6 79.1 208z"/></svg>',
    gear: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1em" height="1em" fill="currentColor" style="vertical-align:middle;display:inline-block"><path d="M495.9 166.6C499.2 175.2 496.4 184.9 489.6 191.2L446.3 230.6C447.4 238.9 448 247.4 448 256C448 264.6 447.4 273.1 446.3 281.4L489.6 320.8C496.4 327.1 499.2 336.8 495.9 345.4C491.5 357.3 486.2 368.8 480.2 379.7L475.5 387.8C468.9 398.8 461.5 409.2 453.4 419.1C447.4 426.2 437.7 428.7 428.9 425.9L373.2 408.1C359.8 418.4 344.1 427 329.2 433.6L316.7 490.7C314.7 499.7 307.7 506.1 298.5 508.5C284.7 510.8 270.5 512 255.1 512C241.5 512 227.3 510.8 213.5 508.5C204.3 506.1 197.3 499.7 195.3 490.7L182.8 433.6C167 427 152.2 418.4 138.8 408.1L83.14 425.9C74.3 428.7 64.55 426.2 58.63 419.1C50.52 409.2 43.12 398.8 36.52 387.8L31.84 379.7C25.77 368.8 20.49 357.3 16.06 345.4C12.82 336.8 15.55 327.1 22.41 320.8L65.67 281.4C64.57 273.1 64 264.6 64 256C64 247.4 64.57 238.9 65.67 230.6L22.41 191.2C15.55 184.9 12.82 175.3 16.06 166.6C20.49 154.7 25.78 143.2 31.84 132.3L36.51 124.2C43.12 113.2 50.52 102.8 58.63 92.95C64.55 85.8 74.3 83.32 83.14 86.14L138.8 103.9C152.2 93.56 167 84.96 182.8 78.43L195.3 21.33C197.3 12.25 204.3 5.04 213.5 3.51C227.3 1.201 241.5 0 256 0C270.5 0 284.7 1.201 298.5 3.51C307.7 5.04 314.7 12.25 316.7 21.33L329.2 78.43C344.1 84.96 359.8 93.56 373.2 103.9L428.9 86.14C437.7 83.32 447.4 85.8 453.4 92.95C461.5 102.8 468.9 113.2 475.5 124.2L480.2 132.3C486.2 143.2 491.5 154.7 495.9 166.6V166.6zM256 336C300.2 336 336 300.2 336 255.1C336 211.8 300.2 175.1 256 175.1C211.8 175.1 176 211.8 176 255.1C176 300.2 211.8 336 256 336z"/></svg>',
    user: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" width="1em" height="1em" fill="currentColor" style="vertical-align:middle;display:inline-block"><path d="M224 256c70.7 0 128-57.31 128-128s-57.3-128-128-128C153.3 0 96 57.31 96 128S153.3 256 224 256zM274.7 304H173.3C77.61 304 0 381.6 0 477.3c0 19.14 15.52 34.67 34.66 34.67h378.7C432.5 512 448 496.5 448 477.3C448 381.6 370.4 304 274.7 304z"/></svg>',
    "id-badge": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" width="1em" height="1em" fill="currentColor" style="vertical-align:middle;display:inline-block"><path d="M336 0h-288C21.49 0 0 21.49 0 48v416C0 490.5 21.49 512 48 512h288c26.51 0 48-21.49 48-48v-416C384 21.49 362.5 0 336 0zM192 160c35.35 0 64 28.65 64 64s-28.65 64-64 64S128 259.3 128 224S156.7 160 192 160zM288 416H96c-8.836 0-16-7.164-16-16C80 355.8 115.8 320 160 320h64c44.18 0 80 35.82 80 80C304 408.8 296.8 416 288 416zM240 96h-96C135.2 96 128 88.84 128 80S135.2 64 144 64h96C248.8 64 256 71.16 256 80S248.8 96 240 96z"/></svg>',
    "right-from-bracket": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1em" height="1em" fill="currentColor" style="vertical-align:middle;display:inline-block"><path d="M96 480h64C177.7 480 192 465.7 192 448S177.7 416 160 416H96c-17.67 0-32-14.33-32-32V128c0-17.67 14.33-32 32-32h64C177.7 96 192 81.67 192 64S177.7 32 160 32H96C42.98 32 0 74.98 0 128v256C0 437 42.98 480 96 480zM504.8 238.5l-144.1-136c-6.975-6.578-17.2-8.375-26-4.594c-8.803 3.797-14.51 12.47-14.51 22.05l-.0918 72l-128-.001c-17.69 0-32.02 14.33-32.02 32v64c0 17.67 14.34 32 32.02 32l128 .001l.0918 71.1c0 9.578 5.707 18.25 14.51 22.05c8.803 3.781 19.03 1.984 26-4.594l144.1-136C514.4 264.4 514.4 247.6 504.8 238.5z"/></svg>'
  };
  return svgs[name] || '';
}
function updateLocalizedLinks(root = document) {
    const scope = root && typeof root.querySelectorAll === 'function' ? root : document;
    scope.querySelectorAll('a[href]').forEach(anchor => {
        if (!(anchor instanceof HTMLAnchorElement)) return;
        if (anchor.dataset.languageIgnore === 'true') return;
        const href = anchor.getAttribute('href');
        const localizedHref = buildLocalizedUrl(href, currentLanguage);
        if (localizedHref && localizedHref !== href) {
            anchor.setAttribute('href', localizedHref);
        }
    });
}

// 默认配置
const defaultNavConfig = {
    logo: {
        url: "/assets/img/logo_blue.png",
        alt: "网站logo",
        style: "width: 27px; border-radius: 50%; margin: 3px 7px 0px 0px; overflow: hidden;"
    },
    title: {
        text: "夸克博客",
        link: "/"
    },
    navItems: [
        { name: "文章", link: "/posts", target: "blank" },
        { name: "工具", link: "/tool", target: "blank" },
        { name: "游戏", link: "/games", target: "blank" },
        { name: "实验室", link: "/a", target: "blank" },
        { name: "项目", link: "/blog/project", target: "blank" },
        { name: "视频", link: "/blog/qtv", target: "blank" },
        { name: "留言", link: "/blog/lyb", target: "blank" },
        { name: "更多", link: "/blog", target: "blank" }
    ],
    login: {
        url: "/login",
        githubUrl: "https://github.com/login/oauth/authorize?client_id=Ov23liKnR1apo7atwzU0&redirect_uri=https://lsqkk.github.io/auth.html&scope=user",
    }
};

// 固定定位下拉菜单：溢出 overflow:hidden 容器时使用 fixed 定位来避免被裁剪
// 注意：backdrop-filter / transform 会创建 fixed 定位的包含块，
// 导致 position:fixed 相对于该元素而非视口，因此将菜单移动到 body 下再定位。
function _positionFixedDropdown(triggerEl, menuEl) {
    if (!triggerEl || !menuEl) return;

    // 记录原始父节点以便恢复
    if (!menuEl._origParent) {
        menuEl._origParent = menuEl.parentNode;
        menuEl._origNextSibling = menuEl.nextSibling;
    }

    // 移动到 body 以避开 header 的 backdrop-filter 包含块
    if (menuEl.parentNode !== document.body) {
        menuEl._origParent = menuEl.parentNode;
        menuEl._origNextSibling = menuEl.nextSibling;
        document.body.appendChild(menuEl);
    }

    menuEl.classList.add('nav-hover-body');

    const rect = triggerEl.getBoundingClientRect();
    const menuWidth = menuEl.offsetWidth || 200;
    let left = rect.left;
    if (left + menuWidth > window.innerWidth - 12) {
        left = Math.max(12, window.innerWidth - menuWidth - 12);
    }
    menuEl.style.position = 'fixed';
    menuEl.style.top = (rect.bottom + 10) + 'px';
    menuEl.style.left = left + 'px';
}
function _resetFixedDropdown(menuEl) {
    if (!menuEl) return;

    menuEl.classList.remove('nav-hover-body');
    menuEl.style.position = '';
    menuEl.style.top = '';
    menuEl.style.left = '';

    // 恢复到原始父节点
    if (menuEl._origParent && menuEl.parentNode !== menuEl._origParent) {
        if (menuEl._origNextSibling && menuEl._origNextSibling.parentNode === menuEl._origParent) {
            menuEl._origParent.insertBefore(menuEl, menuEl._origNextSibling);
        } else {
            menuEl._origParent.appendChild(menuEl);
        }
    }
}

// 获取导航配置（优先使用构建注入）
function getNavConfig() {
    if (window.__NAV_CONFIG__) {
        return window.__NAV_CONFIG__;
    }
    return defaultNavConfig;
}

// 生成导航HTML
function generateNavHTML(config) {
    const normalizeTarget = () => '_self';
    return `
    <div class="header-placeholder"></div>
    <div class="header">
        <div class="header-content">
            <div class="header-left">
                <img src="${config.logo.url}" alt="${config.logo.alt}"
                style="${config.logo.style}">
                <a href="${buildLocalizedUrl(config.title.link)}" style="color: white; text-decoration: none;">
                    <h1>${config.title.text}</h1>
                </a>
                <!-- 移动端汉堡菜单按钮 -->
                <button class="hamburger-menu" id="hamburgerMenu">
                    <span></span>
                    <span></span>
                    <span></span>
                </button>
            </div>
            <div class="header-nav-container">
                <ul class="header-nav">
                    ${config.navItems.map(item => {
        const hoverKey = hoverRootMap[item.link];
        const target = normalizeTarget(item.target);
        if (hoverKey) {
            return `<li class="nav-hover-item" data-hover-key="${hoverKey}">
                        <a href="${buildLocalizedUrl(item.link)}" target="${target}">${item.name}</a>
                        <div class="nav-hover-menu" id="nav-hover-${hoverKey}"></div>
                    </li>`;
        }
        if (item.name === "视频") {
            return `<li class="nav-video-item"><a href="${buildLocalizedUrl(item.link)}" target="${target}">${item.name}</a></li>`;
        }
        return `<li><a href="${buildLocalizedUrl(item.link)}" target="${target}">${item.name}</a></li>`;
                    }).join('')}
                    <!-- 语言切换器 - 不会被翻译 -->
                    <li class="ignore">
                        <div class="language-picker" data-language-picker>
                            <button class="language-trigger" type="button" aria-haspopup="listbox" aria-expanded="false">
                                <span class="language-label">${getLanguageOption(currentLanguage).label}</span>
                                ${svgIcon('chevron-down')}
                            </button>
                            <ul class="language-menu" role="listbox">
                                ${renderLanguageMenuItems()}
                            </ul>
                            <select id="languageSelector" class="language-selector" aria-hidden="true" tabindex="-1">
                                ${renderLanguageSelectOptions()}
                            </select>
                        </div>
                    </li>
                </ul>
            </div>
            <div class="header-right">
                <div class="header-search">
                    <input type="text" id="searchInput" placeholder="搜索站内..." autocomplete="off">
                    <button type="button" class="header-search-btn" onclick="handleGlobalSearch()" aria-label="搜索">
                        ${svgIcon('search')}
                    </button>
                </div>
                <a class="nav-settings-btn" href="${buildLocalizedUrl('/settings')}" aria-label="网站设置" title="网站设置">
                    ${svgIcon('gear')}
                </a>
                <div class="header-login nav-login" id="header-login">
                    <a href="${buildLocalizedUrl(config.login.url)}">登录</a>
                    <div class="nav-login-tip">登录后享受更多权益</div>
                </div>
                <div class="header-user" id="header-user"></div>
            </div>
        </div>
    </div>

    <!-- 移动端侧边栏 -->
    <div class="mobile-navsidebar" id="mobilenavsidebar">
        <div class="navsidebar-overlay" id="navsidebarOverlay"></div>
        <div class="navsidebar-content">
            <div class="navsidebar-header">
                <h2>导航菜单</h2>
                <button class="navsidebar-close" id="navsidebarClose">&times;</button>
            </div>
            <div class="navsidebar-nav">
                <ul>
                    ${config.navItems.map(item => {
        if (item.name === "视频") {
            return `<li class="nav-video-item"><a href="${buildLocalizedUrl(item.link)}" target="${normalizeTarget(item.target)}">${item.name}</a></li>`;
        }
        return `<li><a href="${buildLocalizedUrl(item.link)}" target="${normalizeTarget(item.target)}">${item.name}</a></li>`;
    }).join('')}
                </ul>
            </div>
            <div class="navsidebar-search">
                <input type="text" id="mobileSearchInput" placeholder="搜索站内...">
                <button onclick="handleMobileSearch()">搜索</button>
            </div>
            <div class="navsidebar-controls">
                <a class="navsidebar-settings" href="${buildLocalizedUrl('/settings')}">
                    ${svgIcon('gear')}
                    <span>网站设置</span>
                </a>
                <div class="navsidebar-language">
                    <div class="language-picker" data-language-picker>
                        <button class="language-trigger" type="button" aria-haspopup="listbox" aria-expanded="false">
                            <span class="language-label">${getLanguageOption(currentLanguage).label}</span>
                            ${svgIcon('chevron-down')}
                        </button>
                        <ul class="language-menu" role="listbox">
                            ${renderLanguageMenuItems()}
                        </ul>
                        <select id="mobileLanguageSelector" class="language-selector" aria-hidden="true" tabindex="-1">
                            ${renderLanguageSelectOptions()}
                        </select>
                    </div>
                </div>
                <div class="navsidebar-login" id="mobile-login-button">
                    <a href="${buildLocalizedUrl(config.login.url)}">登录</a>
                </div>
                <div class="navsidebar-user" id="mobile-user"></div>
            </div>
        </div>
    </div>
  `;
}

// 获取配置并写入导航栏
const navConfig = getNavConfig();
document.write(generateNavHTML(navConfig));

// 检查视频API是否可用，不可用则隐藏导航中的"视频"项
(async function checkVideoApi() {
    try {
        const proxyUrl = '__API_BASE__/api/stream-proxy?mode=bili&url=';
        const targetUrl = `https://uapis.cn/api/v1/social/bilibili/archives?${new URLSearchParams({
            mid: '2105459088',
            pn: '1',
            ps: '1',
            orderby: 'pubdate'
        })}`;
        const response = await fetch(proxyUrl + encodeURIComponent(targetUrl));
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
        if (!data.videos || data.videos.length === 0) throw new Error('No videos');
    } catch (e) {
        console.warn('视频API不可用，隐藏视频导航项:', e);
        document.querySelectorAll('.nav-video-item').forEach(el => el.remove());
    }
})();

// 全局搜索处理函数
function handleGlobalSearch() {
    const searchTerm = document.getElementById('searchInput').value.trim();

    if (!searchTerm) {
        return; // 搜索词为空时不执行任何操作
    }

    // 检查当前页面是否是文章列表页
    const currentPath = window.location.pathname;
    const isArticleListPage = currentPath === '/posts' ||
        currentPath.endsWith('/posts');

    if (isArticleListPage) {
        // 如果在文章列表页，调用该页面的搜索函数
        if (typeof window.searchBlog === 'function') {
            window.searchBlog();
        }
    } else {
        // 如果在其他页面，跳转到全站搜索页
        const searchParams = new URLSearchParams();
        searchParams.set('q', searchTerm);
        window.location.href = buildLocalizedUrl(`/search?${searchParams.toString()}`);
    }
}

// 移动端搜索处理函数
function handleMobileSearch() {
    const searchTerm = document.getElementById('mobileSearchInput').value.trim();

    if (!searchTerm) {
        return;
    }

    // 关闭侧边栏
    closeSidebar();

    // 跳转到全站搜索页面
    const searchParams = new URLSearchParams();
    searchParams.set('q', searchTerm);
    window.location.href = buildLocalizedUrl(`/search?${searchParams.toString()}`);
}

// 侧边栏控制函数
function openSidebar() {
    document.getElementById('mobilenavsidebar').classList.add('active');
    document.body.style.overflow = 'hidden'; // 防止背景滚动
}

function closeSidebar() {
    document.getElementById('mobilenavsidebar').classList.remove('active');
    document.body.style.overflow = ''; // 恢复背景滚动
}

// 初始化侧边栏事件
function initializeSidebar() {
    const hamburgerMenu = document.getElementById('hamburgerMenu');
    const sidebarClose = document.getElementById('navsidebarClose');
    const sidebarOverlay = document.getElementById('navsidebarOverlay');

    if (hamburgerMenu) {
        hamburgerMenu.addEventListener('click', openSidebar);
    }
    if (sidebarClose) {
        sidebarClose.addEventListener('click', closeSidebar);
    }
    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', closeSidebar);
    }
}

const navHoverCache = {
    posts: null,
    tool: null,
    games: null,
    a: null,
    blog: null
};
const preloadedNavHover = window.__NAV_HOVER_DATA__ || null;

function normalizeLabLink(link) {
    if (!link) return '#';
    if (link.startsWith('http://') || link.startsWith('https://') || link.startsWith('/')) return link;
    return `/a/${link}`;
}

function normalizeGamesLink(link) {
    if (!link) return '#';
    if (link.startsWith('http://') || link.startsWith('https://') || link.startsWith('/')) return link;
    return `/games/${link}`;
}

async function loadHoverSections(key) {
    if (navHoverCache[key]) return navHoverCache[key];
    if (preloadedNavHover && preloadedNavHover[key]) {
        navHoverCache[key] = preloadedNavHover[key];
        return navHoverCache[key];
    }

    let sections = [];
    if (key === 'posts') {
        const data = await fetch('/json/posts.json')
            .then(r => {
                if (r.ok) return r.json();
                return fetch('/posts/posts.json').then(r2 => r2.json());
            });
        const allColumns = new Set();
        (data || []).forEach(post => {
            (post.columns || []).forEach(column => {
                if (column && String(column).trim()) {
                    allColumns.add(String(column).trim());
                }
            });
        });
        const columnItems = Array.from(allColumns)
            .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
            .map(name => ({
                name,
                link: `/posts/${encodeURIComponent(name)}`,
                target: '_self'
            }));
        sections = [{
            title: '专栏',
            items: [
                { name: '查看全部文章', link: '/posts', target: '_self' },
                ...columnItems
            ]
        }];
    } else if (key === 'tool') {
        const data = await fetch('/assets/pages/tool/tool.json').then(r => r.json());
        sections = (data.categories || []).map(cat => ({
            title: cat.name || '工具',
            items: (cat.tools || []).map(item => ({
                name: item.name || '未命名',
                link: item.url || '#',
                target: '_self'
            }))
        })).filter(section => section.items.length > 0);
    } else if (key === 'games') {
        const data = await fetch('/assets/pages/games/game.json').then(r => r.json());
        const groups = [
            { title: '多人联机', items: data.multiplayer || [] },
            { title: '单机游戏', items: data.singlePlayer || [] },
            { title: '经典游戏', items: data.classic || [] }
        ];
        sections = groups.map(group => ({
            title: group.title,
            items: group.items.map(item => ({
                name: item.name || '未命名',
                link: normalizeGamesLink(item.link || ''),
                target: '_self'
            }))
        })).filter(section => section.items.length > 0);
    } else if (key === 'a') {
        const data = await fetch('/assets/pages/a/projects.json').then(r => r.json());
        sections = (data.categories || []).map(cat => ({
            title: cat.name || '实验室',
            items: (cat.projects || []).map(item => ({
                name: item.name || '未命名',
                link: normalizeLabLink(item.link || ''),
                target: '_self'
            }))
        })).filter(section => section.items.length > 0);
    } else if (key === 'blog') {
        const data = await fetch('/assets/pages/blog/functions.json').then(r => r.json());
        sections = (data.categories || []).map(cat => ({
            title: cat.name || '更多',
            items: (cat.functions || []).map(item => ({
                name: item.name || '未命名',
                link: item.link || '#',
                target: '_self'
            }))
        })).filter(section => section.items.length > 0);
    }

    navHoverCache[key] = sections;
    return sections;
}

function renderHoverMenu(menuEl, key, sections) {
    if (!menuEl) return;
    if (!sections || sections.length === 0) {
        menuEl.innerHTML = `<div class="nav-hover-empty">${hoverRootLabelMap[key] || '列表'}暂时为空</div>`;
        return;
    }

    menuEl.innerHTML = `
        <div class="nav-hover-scroll">
            ${sections.map(section => `
                <div class="nav-hover-section">
                    <div class="nav-hover-section-title">${section.title}</div>
                    <ul class="nav-hover-list">
                        ${section.items.map(item => `<li><a href="${buildLocalizedUrl(item.link)}" target="${item.target}">${item.name}</a></li>`).join('')}
                    </ul>
                </div>
            `).join('')}
        </div>
    `;
    updateLocalizedLinks(menuEl);
}

function initializeNavHoverMenus() {
    if (window.innerWidth <= 768) return;

    document.querySelectorAll('.nav-hover-item').forEach(item => {
        if (!(item instanceof HTMLElement)) return;
        const key = item.dataset.hoverKey;
        if (!key) return;
        const menuEl = item.querySelector('.nav-hover-menu');
        if (!(menuEl instanceof HTMLElement)) return;

        if (preloadedNavHover && preloadedNavHover[key]) {
            navHoverCache[key] = preloadedNavHover[key];
            renderHoverMenu(menuEl, key, navHoverCache[key]);
        }

        let closeTimer = null;

        const openMenu = async () => {
            if (closeTimer) {
                clearTimeout(closeTimer);
                closeTimer = null;
            }
            item.classList.add('open');
            // 用 fixed 定位避免被 overflow:hidden 容器裁剪
            _positionFixedDropdown(item, menuEl);
            if (navHoverCache[key]) return;
            try {
                const sections = await loadHoverSections(key);
                renderHoverMenu(menuEl, key, sections);
                // 内容加载后再校准一次位置
                requestAnimationFrame(() => _positionFixedDropdown(item, menuEl));
            } catch (error) {
                console.error(`加载${key}导航项失败:`, error);
                menuEl.innerHTML = '<div class="nav-hover-empty">加载失败</div>';
            }
        };

        const closeMenuWithDelay = () => {
            if (closeTimer) clearTimeout(closeTimer);
            closeTimer = setTimeout(() => {
                item.classList.remove('open');
                _resetFixedDropdown(menuEl);
                closeTimer = null;
            }, 300);
        };

        item.addEventListener('mouseenter', openMenu);
        item.addEventListener('mouseleave', closeMenuWithDelay);
        menuEl.addEventListener('mouseenter', openMenu);
        menuEl.addEventListener('mouseleave', closeMenuWithDelay);
    });
}

// 多语言翻译功能
function initializeTranslation() {
    const script = document.createElement('script');
    script.src = 'https://cdn.staticfile.net/translate.js/3.17.0/translate.js';
    script.onload = function () {
        // 1. 基础配置：设置本地语种并隐藏自动生成的选择框
        translate.language.setLocal(DEFAULT_LANGUAGE);
        translate.selectLanguageTag.show = false; // 确保隐藏自带选择框
        if (translate.service && typeof translate.service.use === 'function') {
            translate.service.use('client.edge');
        }

        // 2. 初始化完成后同步当前状态
        syncLanguagePickers(currentLanguage);
        performLanguageChange(currentLanguage, { force: true });
    };
    document.head.appendChild(script);
}

// 4. 封装统一的语言切换执行函数
function performLanguageChange(targetLanguage, options = {}) {
    const normalizedLanguage = normalizeLanguageCode(targetLanguage);
    const { force = false } = options;
    const previousLanguage = currentLanguage;
    currentLanguage = normalizedLanguage;

    persistLanguagePreference(normalizedLanguage);
    updateCurrentPageLanguageUrl(normalizedLanguage);
    updateDocumentLanguage(normalizedLanguage);
    updateLocalizedLinks();

    document.querySelectorAll('.language-selector').forEach(sel => {
        sel.value = normalizedLanguage;
    });
    syncLanguagePickers(normalizedLanguage);

    if (!window.translate || typeof translate.changeLanguage !== 'function') {
        return;
    }

    if (!force && normalizedLanguage === previousLanguage) {
        return;
    }

    // 在切换前，特别是切回中文时，尝试清除该语种的缓存
    if (normalizedLanguage === DEFAULT_LANGUAGE) {
    }

    // 执行语言切换
    translate.changeLanguage(normalizedLanguage);

    // 强制进行一次翻译执行，确保内容更新，特别是从其他语言切回中文时
    translate.execute();
}

function syncLanguagePickers(targetLanguage) {
    document.querySelectorAll('[data-language-picker]').forEach(picker => {
        if (!(picker instanceof HTMLElement)) return;
        const select = picker.querySelector('.language-selector');
        if (select && select.value !== targetLanguage) {
            select.value = targetLanguage;
        }
        const option = select ? select.querySelector(`option[value="${targetLanguage}"]`) : null;
        const label = picker.querySelector('.language-label');
        if (label) {
            label.textContent = option ? option.textContent : targetLanguage;
        }
        picker.querySelectorAll('.language-menu button').forEach(btn => {
            btn.classList.toggle('is-active', btn.dataset.lang === targetLanguage);
        });
    });
}

function initializeLanguagePickers() {
    const pickers = document.querySelectorAll('[data-language-picker]');
    if (pickers.length === 0) return;

    const closeAll = () => {
        pickers.forEach(picker => {
            picker.classList.remove('is-open');
            const trigger = picker.querySelector('.language-trigger');
            if (trigger) trigger.setAttribute('aria-expanded', 'false');
            // 恢复语言菜单定位
            const menu = picker.querySelector('.language-menu');
            if (menu instanceof HTMLElement) {
                _resetFixedDropdown(menu);
            }
        });
    };

    pickers.forEach(picker => {
        if (!(picker instanceof HTMLElement)) return;
        const trigger = picker.querySelector('.language-trigger');
        const select = picker.querySelector('.language-selector');
        const menuButtons = picker.querySelectorAll('.language-menu button');

        if (select) {
            const currentValue = currentLanguage || DEFAULT_LANGUAGE;
            select.value = currentValue;
            syncLanguagePickers(currentValue);
            if (!select.dataset.languageBound) {
                select.addEventListener('change', () => {
                    performLanguageChange(select.value);
                });
                select.dataset.languageBound = 'true';
            }
        }

        if (trigger) {
            trigger.addEventListener('click', (event) => {
                event.stopPropagation();
                const isOpen = picker.classList.contains('is-open');
                closeAll();
                if (!isOpen) {
                    picker.classList.add('is-open');
                    trigger.setAttribute('aria-expanded', 'true');
                    // 导航栏内的语言菜单使用 fixed 定位避免被裁剪
                    const menu = picker.querySelector('.language-menu');
                    if (menu instanceof HTMLElement && picker.closest('.header-nav-container')) {
                        _positionFixedDropdown(trigger, menu);
                    }
                }
            });
        }

        menuButtons.forEach(btn => {
            btn.addEventListener('click', (event) => {
                event.stopPropagation();
                const lang = btn.dataset.lang;
                if (!lang) return;
                if (select) {
                    select.value = lang;
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                } else {
                    performLanguageChange(lang);
                }
                closeAll();
            });
        });
    });

    document.addEventListener('click', closeAll);
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeAll();
    });
}

function initializeSearchInputs() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                handleGlobalSearch();
            }
        });
    }

    const mobileSearchInput = document.getElementById('mobileSearchInput');
    if (mobileSearchInput) {
        mobileSearchInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                handleMobileSearch();
            }
        });
    }
}

// 检查登录状态（与index.js保持一致）
function checkLoginStatus() {
    // 使用与index.js完全相同的逻辑
    const isLoggedIn = localStorage.getItem('github_code') || localStorage.getItem('github_user') || localStorage.getItem('qb_user');

    const loginButton = document.getElementById('login-button');
    const mobileLoginButton = document.getElementById('mobile-login-button');
    const headerLoginButton = document.getElementById('header-login');

    if (isLoggedIn) {
        // 隐藏电脑端和移动端的登录按钮
        if (loginButton) loginButton.style.display = 'none';
        if (mobileLoginButton) mobileLoginButton.style.display = 'none';
        if (headerLoginButton) headerLoginButton.style.display = 'none';
    } else {
        // 确保登录按钮显示（可能在之前被隐藏了）
        if (loginButton) loginButton.style.display = 'block';
        if (mobileLoginButton) mobileLoginButton.style.display = 'block';
        if (headerLoginButton) headerLoginButton.style.display = 'flex';
    }

    renderUserProfile();
}

function getUserProfile() {
    if (window.QuarkUserProfile && typeof window.QuarkUserProfile.getProfile === 'function') {
        return window.QuarkUserProfile.getProfile();
    }
    return null;
}

function readGithubUserFallback() {
    const raw = localStorage.getItem('github_user');
    if (!raw) return null;
    try {
        const data = JSON.parse(raw);
        if (!data || typeof data !== 'object') return null;
        return {
            nickname: data.name || data.login || data.nickname || '',
            avatarUrl: data.avatar_url || data.avatarUrl || data.avatar || '',
            profileUrl: data.html_url || data.profileUrl || ''
        };
    } catch {
        return null;
    }
}

function readLocalUserFallback() {
    const raw = localStorage.getItem('qb_user');
    if (!raw) return null;
    try {
        const data = JSON.parse(raw);
        if (!data || typeof data !== 'object') return null;
        return {
            nickname: data.nickname || data.login || data.username || '',
            avatarUrl: data.avatarUrl || '',
            profileUrl: ''
        };
    } catch {
        return null;
    }
}

function renderUserProfile() {
    let profile = getUserProfile();
    const headerUser = document.getElementById('header-user');
    const mobileUser = document.getElementById('mobile-user');
    if (!headerUser && !mobileUser) return;

    const isLoggedIn = localStorage.getItem('github_code') || localStorage.getItem('github_user') || localStorage.getItem('qb_user');
    if (!profile || (!profile.nickname && !profile.avatarUrl)) {
        const fallback = readGithubUserFallback() || readLocalUserFallback();
        if (fallback && (fallback.nickname || fallback.avatarUrl)) {
            profile = fallback;
        }
    }

    if (!profile || (!profile.nickname && !profile.avatarUrl)) {
        if (!isLoggedIn) {
            if (headerUser) headerUser.innerHTML = '';
            if (mobileUser) mobileUser.innerHTML = '';
            return;
        }
        profile = profile || { nickname: '', avatarUrl: '', profileUrl: '' };
        profile.nickname = '已登录';
    }

    if (!profile) return;

    if (!profile.nickname && !profile.avatarUrl) {
        if (headerUser) headerUser.innerHTML = '';
        if (mobileUser) mobileUser.innerHTML = '';
        return;
    }

    const avatarUrl = profile.avatarUrl || '/assets/img/touxiang.png';
    const nickname = profile.nickname || '已登录';
    const sharedProfile = window.CommentShared && typeof window.CommentShared.getLoginProfile === 'function'
        ? window.CommentShared.getLoginProfile()
        : null;
    const login = (sharedProfile && sharedProfile.login) || '';
    const loginType = (sharedProfile && sharedProfile.loginType) || '';
    const identifier = window.CommentShared && typeof window.CommentShared.getAccountIdentifier === 'function'
        ? window.CommentShared.getAccountIdentifier(sharedProfile)
        : (login ? (loginType === 'local' ? `qb_${login}` : `gh_${login}`) : '');
    const spaceUrl = identifier ? `/space?user=${encodeURIComponent(identifier)}` : '/space';
    const inner = `
        <div class="user-pill">
            <img class="user-avatar" src="${avatarUrl}" alt="avatar">
            <span class="user-name">${nickname}</span>
        </div>
    `;
    const dropdown = `
        <div class="nav-user-menu">
            <div class="nav-user-meta">
                <img class="nav-user-avatar" src="${avatarUrl}" alt="avatar">
                <div>
                    <div class="nav-user-name">${nickname}</div>
                    <div class="nav-user-sub">${login ? `@${login}` : '已登录用户'}</div>
                </div>
            </div>
            <div class="nav-user-actions">
                <a href="${buildLocalizedUrl('/a/account')}">${svgIcon('user')}<span>账号中心</span></a>
                <a href="${buildLocalizedUrl('/settings')}">${svgIcon('gear')}<span>网站设置</span></a>
                <a href="${buildLocalizedUrl(spaceUrl)}">${svgIcon('id-badge')}<span>我的主页</span></a>
                <button type="button" data-action="logout">${svgIcon('right-from-bracket')}<span>退出登录</span></button>
            </div>
        </div>
    `;
    const wrapped = `
        <div class="nav-user-wrap">
            ${inner}
            ${isLoggedIn ? dropdown : ''}
        </div>
    `;

    if (headerUser) headerUser.innerHTML = wrapped;
    if (mobileUser) mobileUser.innerHTML = inner;

    if (headerUser) {
        bindUserMenuHover(headerUser);
        headerUser.querySelectorAll('[data-action="logout"]').forEach((btn) => {
            btn.addEventListener('click', () => {
                if (window.CommentShared && typeof window.CommentShared.logout === 'function') {
                    window.CommentShared.logout(buildLocalizedUrl('/'));
                } else {
                    const savedLanguage = getStoredLanguage();
                    localStorage.clear();
                    persistLanguagePreference(savedLanguage);
                    window.location.href = buildLocalizedUrl('/');
                }
            });
        });
    }
}

function bindUserMenuHover(root) {
    const wrap = root.querySelector('.nav-user-wrap');
    if (!(wrap instanceof HTMLElement)) return;
    let hideTimer = null;
    const open = () => {
        if (hideTimer) {
            window.clearTimeout(hideTimer);
            hideTimer = null;
        }
        wrap.classList.add('is-open');
    };
    const close = () => {
        if (hideTimer) window.clearTimeout(hideTimer);
        hideTimer = window.setTimeout(() => {
            wrap.classList.remove('is-open');
        }, 200);
    };
    wrap.addEventListener('mouseenter', open);
    wrap.addEventListener('mouseleave', close);
}

window.renderNavUserProfile = renderUserProfile;

function initNavCollapse() {
    const header = document.querySelector('.header');
    const search = document.querySelector('.header-search');
    if (!header || !search) return;

    const checkOverflow = () => {
        if (!header.isConnected) return;
        requestAnimationFrame(() => {
            if (header.scrollWidth > header.clientWidth + 2) {
                search.classList.add('search-collapsed');
            } else {
                search.classList.remove('search-collapsed');
            }
        });
    };

    let rafId = null;
    const handleResize = () => {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(checkOverflow);
    };

    setTimeout(checkOverflow, 300);
    window.addEventListener('resize', handleResize, { passive: true });
}

function initNavScrollWheel() {
    const navContainer = document.querySelector('.header-nav-container');
    const navList = navContainer?.querySelector('.header-nav');
    if (!navContainer || !navList) return;

    let pos = 0;

    const applyClamp = () => {
        if (!navContainer.isConnected) return;
        const maxScroll = Math.max(0, navList.scrollWidth - navContainer.clientWidth);
        pos = Math.max(-maxScroll, Math.min(0, pos));
        navList.style.transform = `translateX(${pos}px)`;
    };

    const recalc = () => requestAnimationFrame(applyClamp);
    applyClamp();

    // 监听容器和列表尺寸变化
    const ro = new ResizeObserver(recalc);
    ro.observe(navContainer);
    ro.observe(navList);

    // 字体加载后重新计算（防止初始布局偏移）
    if (document.fonts) {
        document.fonts.ready.then(recalc);
    }

    // 多次布局稳定后重算
    setTimeout(recalc, 300);
    setTimeout(recalc, 1000);

    navContainer.addEventListener('wheel', (event) => {
        if (event.ctrlKey || event.metaKey) return;
        const maxScroll = Math.max(0, navList.scrollWidth - navContainer.clientWidth);
        if (maxScroll <= 0) return;
        // 同时支持鼠标滚轮（垂直）和触控板横向滑动
        let delta = 0;
        if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
            delta = event.deltaX; // 触控板横向滑动
        } else {
            delta = event.deltaY; // 鼠标滚轮（转换为横向）
        }
        if (delta === 0) return;
        event.preventDefault();
        const step = event.deltaMode === 1 ? delta * 30 : delta;
        const prevPos = pos;
        pos = Math.max(-maxScroll, Math.min(0, pos - step));
        if (pos !== prevPos) {
            navList.style.transform = `translateX(${pos}px)`;
        }
    }, { passive: false });
}

// 页面加载完成后初始化翻译和登录状态检查
function initializeAll() {
    if (window.QuarkUserPreferences && typeof window.QuarkUserPreferences.get === 'function') {
        const prefLanguage = window.QuarkUserPreferences.get().language;
        if (prefLanguage && prefLanguage !== currentLanguage) {
            currentLanguage = normalizeLanguageCode(prefLanguage);
        }
    }
    updateDocumentLanguage(currentLanguage);
    initializeLanguagePickers();
    initializeTranslation();
    initializeSidebar();
    initializeNavHoverMenus();
    initializeNavThemeMode();
    initializeNavScrollBehavior();
    initializeSearchInputs();
    initNavCollapse();
    initNavScrollWheel();
    updateLocalizedLinks();

    // 延迟执行登录状态检查，确保DOM完全加载
    setTimeout(() => {
        checkLoginStatus();
    }, 100);

    window.addEventListener('storage', (event) => {
        if (!event || !event.key) return;
        if (event.key === LANGUAGE_STORAGE_KEY) {
            const nextLanguage = resolvePreferredLanguage();
            if (nextLanguage !== currentLanguage) {
                performLanguageChange(nextLanguage, { force: true });
            }
        }
        if (event.key === 'github_user' || event.key === 'github_code' || event.key === 'quark_user_profile' || event.key === 'qb_user') {
            checkLoginStatus();
        }
    });

    window.addEventListener('quark-user-updated', () => {
        checkLoginStatus();
    });
    window.addEventListener('quark-preferences-updated', (event) => {
        const nextLanguage = event && event.detail ? normalizeLanguageCode(event.detail.language) : getStoredLanguage();
        if (nextLanguage && nextLanguage !== currentLanguage) {
            performLanguageChange(nextLanguage, { force: true });
        } else {
            syncLanguagePickers(currentLanguage);
        }
        initializeNavThemeMode();
    });
}

function initializeNavThemeMode() {
    const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = () => {
        const preference = window.QuarkUserPreferences && typeof window.QuarkUserPreferences.get === 'function'
            ? window.QuarkUserPreferences.get()
            : null;
        const isDark = preference ? preference.isDark : darkModeQuery.matches;
        const body = document.body;
        const header = document.querySelector('.header');
        const mobileSidebar = document.getElementById('mobilenavsidebar');

        // 统一控制 body.dark-mode——触发全站所有深色模式 CSS 规则
        if (body) body.classList.toggle('dark-mode', isDark);
        if (header) header.classList.toggle('nav-dark', isDark);
        if (mobileSidebar) mobileSidebar.classList.toggle('nav-dark', isDark);
    };

    applyTheme();

    if (typeof darkModeQuery.addEventListener === 'function') {
        darkModeQuery.addEventListener('change', applyTheme);
    } else if (typeof darkModeQuery.addListener === 'function') {
        darkModeQuery.addListener(applyTheme);
    }
}

function initializeNavScrollBehavior() {
    const header = document.querySelector('.header');
    if (!header) return;
    let lastY = window.scrollY;
    let ticking = false;
    const threshold = 8;

    const update = () => {
        const currentY = window.scrollY;
        const delta = currentY - lastY;
        if (Math.abs(delta) > threshold) {
            if (currentY > 120 && delta > 0) {
                header.classList.add('header-hidden');
            } else if (delta < 0) {
                header.classList.remove('header-hidden');
            }
            lastY = currentY;
        }
        ticking = false;
    };

    window.addEventListener('scroll', () => {
        if (!ticking) {
            ticking = true;
            window.requestAnimationFrame(update);
        }
    }, { passive: true });
}

// 页面加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAll);
} else {
    initializeAll();
}

// 添加一个全局函数，供其他页面手动调用登录状态检查
window.checkLoginStatus = checkLoginStatus;
