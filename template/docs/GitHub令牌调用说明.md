# GitHub 令牌调用说明

## 功能概述
通过调用安全 API（`https://api.130923.xyz/api/github-api-key`）动态获取 GitHub 令牌，避免在前端代码中硬编码泄露。

## 快速开始

### 1. 引入令牌脚本
在需要调用 GitHub API 的页面中，先引入：

```html
<script src="https://api.130923.xyz/api/github-api-key"></script>
```

### 2. 使用全局变量
引入后可通过全局变量 `window.GITHUB_API_KEY`（或 `GITHUB_API_KEY`）使用。

```html
<script>
async function fetchMyRepos() {
    if (typeof GITHUB_API_KEY === 'undefined') {
        alert('GitHub 令牌加载失败，请刷新页面重试。');
        return;
    }

    const resp = await fetch('https://api.github.com/user/repos', {
        headers: {
            Authorization: `Bearer ${GITHUB_API_KEY}`,
            Accept: 'application/vnd.github+json'
        }
    });

    if (!resp.ok) {
        console.error('GitHub API 请求失败:', await resp.text());
        return;
    }

    const repos = await resp.json();
    console.log('我的仓库列表:', repos);
}

fetchMyRepos();
</script>
```

## 注意事项
1. 引入顺序：必须先引入 `github-api-key`，再执行依赖令牌的业务代码。
2. 安全边界：该接口已做来源校验，仅允许你的站点域名调用。
3. 缓存策略：当前缓存为 1 小时，如令牌已轮换可在 URL 后加版本参数强刷，如 `/api/github-api-key?v=2`。
4. 令牌更新：只需在 Vercel 环境变量中更新 `GITHUB_API_KEY`，前端代码无需改动。
5. 权限最小化：建议给该令牌配置最小必要权限，避免授予不必要作用域。
