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
                    <li><a href="article-list">文章</a></li>
                    <li><a href="tool">工具</a></li>
                    <li><a href="games">游戏</a></li>
                    <li><a href="a">实验室</a></li>  <!-- 新增的实验室链接 -->
                    <li><a href="daily">日报</a></li>
                    <li><a href="qtv">视频</a></li>
                    <li><a href="a/lyb" target="blank">留言</a></li>
                    <li id="login-button"><a
                            href="https://github.com/login/oauth/authorize?client_id=Ov23liKnR1apo7atwzU0&redirect_uri=https://lsqkk.github.io/auth.html&scope=user">登录</a>
                    </li>
                </ul>
            </div>
            <div class="header-search">
                <input type="text" id="searchInput" placeholder="搜索博客...">
                <button onclick="searchBlog()">搜索</button>
            </div>
        </div>
    </div>

    <div class="nav">
        <ul class="mobile-nav">
            <li><a href="article-list">文章</a></li>
            <li><a href="tool">工具</a></li>
            <li><a href="games">游戏</a></li>
            <li><a href="a">实验室</a></li>  <!-- 新增的实验室链接 -->
            <li><a href="daily">日报</a></li>
            <li><a href="qtv">视频</a></li>
            <li><a href="https://lsqkk.github.io/a/lyb" target="blank">留言</a></li>
            <li id="mobile-login-button"><a
                    href="https://github.com/login/oauth/authorize?client_id=Ov23liKnR1apo7atwzU0&redirect_uri=https://lsqkk.github.io/auth.html&scope=user">登录</a>
            </li>
        </ul>
    </div>
`);