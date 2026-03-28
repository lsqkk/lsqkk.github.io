// nav.js
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/assets/css/nav.css';
document.head.appendChild(link);
const faLink = document.querySelector('link[href*="font-awesome"]');
if (!faLink) {
    const fa = document.createElement('link');
    fa.rel = 'stylesheet';
    fa.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css';
    document.head.appendChild(fa);
}
const profileScript = document.createElement('script');
profileScript.src = '/assets/js/user-profile.js';
profileScript.defer = true;
document.head.appendChild(profileScript);
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

// 获取导航配置（优先使用构建注入）
function getNavConfig() {
    if (window.__NAV_CONFIG__) {
        return window.__NAV_CONFIG__;
    }
    return defaultNavConfig;
}

// 生成导航HTML
function generateNavHTML(config) {
    const normalizeTarget = (target) => {
        if (!target) return '_blank';
        return target === 'blank' ? '_blank' : target;
    };
    return `
    <div class="header-placeholder"></div>
    <div class="header">
        <div class="header-content">
            <div class="header-left">
                <img src="${config.logo.url}" alt="${config.logo.alt}"
                style="${config.logo.style}">
                <a href="${config.title.link}" style="color: white; text-decoration: none;">
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
                        <a href="${item.link}" target="${target}">${item.name}</a>
                        <div class="nav-hover-menu" id="nav-hover-${hoverKey}"></div>
                    </li>`;
        }
        return `<li><a href="${item.link}" target="${target}">${item.name}</a></li>`;
                    }).join('')}
                    <!-- 语言切换器 - 不会被翻译 -->
                    <li class="ignore">
                        <div class="language-picker" data-language-picker>
                            <button class="language-trigger" type="button" aria-haspopup="listbox" aria-expanded="false">
                                <span class="language-label">中文/CN</span>
                                <i class="fa-solid fa-chevron-down"></i>
                            </button>
                            <ul class="language-menu" role="listbox">
                                <li><button type="button" data-lang="chinese_simplified">中文/CN</button></li>
                                <li><button type="button" data-lang="english">English</button></li>
                            </ul>
                            <select id="languageSelector" class="language-selector" aria-hidden="true" tabindex="-1">
                                <option value="chinese_simplified">中文/CN</option>
                                <option value="english">English</option>
                            </select>
                        </div>
                    </li>
                </ul>
            </div>
            <div class="header-right">
                <div class="header-search">
                    <input type="text" id="searchInput" placeholder="搜索站内...">
                    <button onclick="handleGlobalSearch()">搜索</button>
                </div>
                <div class="header-login nav-login" id="header-login">
                    <a href="${config.login.url}">登录</a>
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
                    ${config.navItems.map(item =>
        `<li><a href="${item.link}" target="${normalizeTarget(item.target)}">${item.name}</a></li>`
    ).join('')}
                </ul>
            </div>
            <div class="navsidebar-search">
                <input type="text" id="mobileSearchInput" placeholder="搜索站内...">
                <button onclick="handleMobileSearch()">搜索</button>
            </div>
            <div class="navsidebar-controls">
                <div class="navsidebar-language">
                    <div class="language-picker" data-language-picker>
                        <button class="language-trigger" type="button" aria-haspopup="listbox" aria-expanded="false">
                            <span class="language-label">中文/CN</span>
                            <i class="fa-solid fa-chevron-down"></i>
                        </button>
                        <ul class="language-menu" role="listbox">
                            <li><button type="button" data-lang="chinese_simplified">中文/CN</button></li>
                            <li><button type="button" data-lang="english">English</button></li>
                        </ul>
                        <select id="mobileLanguageSelector" class="language-selector" aria-hidden="true" tabindex="-1">
                            <option value="chinese_simplified">中文/CN</option>
                            <option value="english">English</option>
                        </select>
                    </div>
                </div>
                <div class="navsidebar-login" id="mobile-login-button">
                    <a href="${config.login.url}">登录</a>
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
        window.location.href = `/search?${searchParams.toString()}`;
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
    window.location.href = `/search?${searchParams.toString()}`;
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
                target: '_blank'
            }));
        sections = [{
            title: '专栏',
            items: [
                { name: '查看全部文章', link: '/posts', target: '_blank' },
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
                target: item.target || '_blank'
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
                target: '_blank'
            }))
        })).filter(section => section.items.length > 0);
    } else if (key === 'a') {
        const data = await fetch('/assets/pages/a/projects.json').then(r => r.json());
        sections = (data.categories || []).map(cat => ({
            title: cat.name || '实验室',
            items: (cat.projects || []).map(item => ({
                name: item.name || '未命名',
                link: normalizeLabLink(item.link || ''),
                target: '_blank'
            }))
        })).filter(section => section.items.length > 0);
    } else if (key === 'blog') {
        const data = await fetch('/assets/pages/blog/functions.json').then(r => r.json());
        sections = (data.categories || []).map(cat => ({
            title: cat.name || '更多',
            items: (cat.functions || []).map(item => ({
                name: item.name || '未命名',
                link: item.link || '#',
                target: item.target === '_self' ? '_self' : '_blank'
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
                        ${section.items.map(item => `<li><a href="${item.link}" target="${item.target}">${item.name}</a></li>`).join('')}
                    </ul>
                </div>
            `).join('')}
        </div>
    `;
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
            if (navHoverCache[key]) return;
            try {
                const sections = await loadHoverSections(key);
                renderHoverMenu(menuEl, key, sections);
            } catch (error) {
                console.error(`加载${key}导航项失败:`, error);
                menuEl.innerHTML = '<div class="nav-hover-empty">加载失败</div>';
            }
        };

        const closeMenuWithDelay = () => {
            if (closeTimer) clearTimeout(closeTimer);
            closeTimer = setTimeout(() => {
                item.classList.remove('open');
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
        translate.language.setLocal('chinese_simplified');
        translate.selectLanguageTag.show = false; // 确保隐藏自带选择框

        // 2. 为自定义的选择器绑定事件
        const languageSelectors = document.querySelectorAll('.language-selector');
        languageSelectors.forEach(selector => {
            selector.addEventListener('change', function () {
                const selectedLanguage = this.value;
                performLanguageChange(selectedLanguage);
            });
        });

        // 3. 初始化完成后，可尝试设置一个默认状态（可选）
        console.log('Translate.js 初始化完成');
        syncLanguagePickers('chinese_simplified');
    };
    document.head.appendChild(script);
}

// 4. 封装统一的语言切换执行函数
function performLanguageChange(targetLanguage) {
    // 在切换前，特别是切回中文时，尝试清除该语种的缓存
    if (targetLanguage === 'chinese_simplified') {
        console.log('切换到中文，尝试清除缓存确保更新');
    }

    // 执行语言切换
    translate.changeLanguage(targetLanguage);

    // 强制进行一次翻译执行，确保内容更新，特别是从其他语言切回中文时
    translate.execute();

    // 同步所有选择器的状态
    document.querySelectorAll('.language-selector').forEach(sel => {
        sel.value = targetLanguage;
    });
    syncLanguagePickers(targetLanguage);
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
        });
    };

    pickers.forEach(picker => {
        if (!(picker instanceof HTMLElement)) return;
        const trigger = picker.querySelector('.language-trigger');
        const select = picker.querySelector('.language-selector');
        const menuButtons = picker.querySelectorAll('.language-menu button');

        if (select) {
            const currentValue = select.value || 'chinese_simplified';
            syncLanguagePickers(currentValue);
        }

        if (trigger) {
            trigger.addEventListener('click', (event) => {
                event.stopPropagation();
                const isOpen = picker.classList.contains('is-open');
                closeAll();
                if (!isOpen) {
                    picker.classList.add('is-open');
                    trigger.setAttribute('aria-expanded', 'true');
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
                <a href="/a/account"><i class="fa-regular fa-user"></i><span>账号中心</span></a>
                <a href="${spaceUrl}"><i class="fa-regular fa-id-badge"></i><span>我的主页</span></a>
                <button type="button" data-action="logout"><i class="fa-solid fa-right-from-bracket"></i><span>退出登录</span></button>
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
                    window.CommentShared.logout('/');
                } else {
                    localStorage.clear();
                    window.location.href = '/';
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

// 页面加载完成后初始化翻译和登录状态检查
function initializeAll() {
    initializeLanguagePickers();
    initializeTranslation();
    initializeSidebar();
    initializeNavHoverMenus();
    initializeNavThemeMode();
    initializeNavScrollBehavior();
    initializeSearchInputs();

    // 延迟执行登录状态检查，确保DOM完全加载
    setTimeout(() => {
        checkLoginStatus();
    }, 100);

    window.addEventListener('storage', (event) => {
        if (!event || !event.key) return;
        if (event.key === 'github_user' || event.key === 'github_code' || event.key === 'quark_user_profile' || event.key === 'qb_user') {
            checkLoginStatus();
        }
    });

    window.addEventListener('quark-user-updated', () => {
        checkLoginStatus();
    });
}

function initializeNavThemeMode() {
    const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = () => {
        const isDark = darkModeQuery.matches;
        const header = document.querySelector('.header');
        const mobileSidebar = document.getElementById('mobilenavsidebar');

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
