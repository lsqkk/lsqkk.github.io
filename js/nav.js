// nav.js
document.write(`
    <div class="header-placeholder"></div>
    <div class="header">
        <div class="header-content">
            <a href="https://lsqkk.github.io" style="color: white; text-decoration: none;">
                <h1>夸克博客</h1>
            </a>
            <div class="header-nav-container">
                <ul class="header-nav">
                    <li><a href="/article-list">文章</a></li>
                    <li><a href="/tool">工具</a></li>
                    <li><a href="/a/live">LIVE</a></li>
                    <li><a href="/games">游戏</a></li>
                    <li><a href="/a">实验室</a></li>
                    <li><a href="/daily">日报</a></li>
                    <li><a href="/qtv">视频</a></li>
                    <li><a href="/a/lyb" target="blank">留言</a></li>
                    <!-- 语言切换器 - 不会被翻译 -->
                    <li class="ignore">
                        <select id="languageSelector" class="language-selector">
                            <option value="chinese_simplified">中文</option>
                            <option value="english">English</option>
                        </select>
                    </li>
                    <li id="login-button" style="display: none;"><a
                            href="https://github.com/login/oauth/authorize?client_id=Ov23liKnR1apo7atwzU0&redirect_uri=https://lsqkk.github.io/auth.html&scope=user">登录</a>
                    </li>
                    <li id="user-info" style="display: none;">
                        <span id="username" style="color: white;"></span>
                    </li>
                </ul>
            </div>
            <div class="header-search">
                <input type="text" id="searchInput" placeholder="搜索博客...">
                <button onclick="handleGlobalSearch()">搜索</button>
            </div>
        </div>
    </div>

    <div class="nav">
        <ul class="mobile-nav">
            <li><a href="/article-list">文章</a></li>
            <li><a href="/tool">工具</a></li>
            <li><a href="/a/live">LIVE</a></li>
            <li><a href="/games">游戏</a></li>
            <li><a href="/a">实验室</a></li>
            <li><a href="/daily">日报</a></li>
            <li><a href="/qtv">视频</a></li>
            <li><a href="/a/lyb" target="blank">留言</a></li>
            <!-- 移动端语言切换器 -->
            <li class="ignore">
                <select id="mobileLanguageSelector" class="language-selector">
                    <option value="chinese_simplified">中文</option>
                    <option value="english">English</option>
                </select>
            </li>
            <li id="mobile-login-button" style="display: none;"><a
                    href="https://github.com/login/oauth/authorize?client_id=Ov23liKnR1apo7atwzU0&redirect_uri=https://lsqkk.github.io/auth.html&scope=user">登录</a>
            </li>
            <li id="mobile-user-info" style="display: none;">
                <span id="mobile-username" style="color: white;"></span>
            </li>
        </ul>
    </div>
`);

// 检查登录状态的函数
function checkLoginStatus() {
    const token = localStorage.getItem('github_token');
    const username = localStorage.getItem('github_username');

    const loginButton = document.getElementById('login-button');
    const mobileLoginButton = document.getElementById('mobile-login-button');
    const userInfo = document.getElementById('user-info');
    const mobileUserInfo = document.getElementById('mobile-user-info');
    const usernameSpan = document.getElementById('username');
    const mobileUsernameSpan = document.getElementById('mobile-username');

    if (token && username) {
        // 用户已登录，隐藏登录按钮，显示用户信息
        if (loginButton) loginButton.style.display = 'none';
        if (mobileLoginButton) mobileLoginButton.style.display = 'none';
        if (userInfo) {
            userInfo.style.display = 'block';
            if (usernameSpan) usernameSpan.textContent = username;
        }
        if (mobileUserInfo) {
            mobileUserInfo.style.display = 'block';
            if (mobileUsernameSpan) mobileUsernameSpan.textContent = username;
        }
    } else {
        // 用户未登录，显示登录按钮，隐藏用户信息
        if (loginButton) loginButton.style.display = 'block';
        if (mobileLoginButton) mobileLoginButton.style.display = 'block';
        if (userInfo) userInfo.style.display = 'none';
        if (mobileUserInfo) mobileUserInfo.style.display = 'none';
    }
}

// 添加登出功能
function addLogoutListener() {
    const userInfo = document.getElementById('user-info');
    const mobileUserInfo = document.getElementById('mobile-user-info');

    if (userInfo) {
        userInfo.addEventListener('click', function () {
            if (confirm('确定要退出登录吗？')) {
                localStorage.removeItem('github_token');
                localStorage.removeItem('github_username');
                checkLoginStatus();
                window.location.reload();
            }
        });
    }

    if (mobileUserInfo) {
        mobileUserInfo.addEventListener('click', function () {
            if (confirm('确定要退出登录吗？')) {
                localStorage.removeItem('github_token');
                localStorage.removeItem('github_username');
                checkLoginStatus();
                window.location.reload();
            }
        });
    }
}

// 全局搜索处理函数
function handleGlobalSearch() {
    const searchTerm = document.getElementById('searchInput').value.trim();

    if (!searchTerm) {
        return; // 搜索词为空时不执行任何操作
    }

    // 检查当前页面是否是文章列表页
    const currentPath = window.location.pathname;
    const isArticleListPage = currentPath.includes('article-list') ||
        currentPath === '/article-list' ||
        currentPath.endsWith('article-list.html');

    if (isArticleListPage) {
        // 如果在文章列表页，调用该页面的搜索函数
        if (typeof window.searchBlog === 'function') {
            window.searchBlog();
        }
    } else {
        // 如果在其他页面，跳转到文章列表页并传递搜索参数
        const searchParams = new URLSearchParams();
        searchParams.set('search', searchTerm);
        window.location.href = `/article-list.html?${searchParams.toString()}`;
    }
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
}

// 页面加载完成后初始化翻译和登录状态
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
        initializeTranslation();
        checkLoginStatus();
        addLogoutListener();
    });
} else {
    initializeTranslation();
    checkLoginStatus();
    addLogoutListener();
}