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
                    <li><a href="/games">游戏</a></li>
                    <li><a href="/a">实验室</a></li>
                    <li><a href="/daily">日报</a></li>
                    <li><a href="/qtv">视频</a></li>
                    <li><a href="/a/lyb" target="blank">留言</a></li>
                    <li id="login-button"><a
                            href="https://github.com/login/oauth/authorize?client_id=Ov23liKnR1apo7atwzU0&redirect_uri=https://lsqkk.github.io/auth.html&scope=user">登录</a>
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
            <li><a href="/games">游戏</a></li>
            <li><a href="/a">实验室</a></li>
            <li><a href="/daily">日报</a></li>
            <li><a href="/qtv">视频</a></li>
            <li><a href="/a/lyb" target="blank">留言</a></li>
            <li id="mobile-login-button"><a
                    href="https://github.com/login/oauth/authorize?client_id=Ov23liKnR1apo7atwzU0&redirect_uri=https://lsqkk.github.io/auth.html&scope=user">登录</a>
            </li>
        </ul>
    </div>
`);

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