# GitHub 令牌调用说明

## 功能概述
通过 `__API_BASE__/api/keys?names=github` 动态获取 GitHub 令牌，避免在前端硬编码泄露。

## 重要更新
图床上传已迁移到 Cloudflare R2，不再依赖 GitHub Token。GitHub Token 仅在需要调用 GitHub API 时使用。

## 快速开始
```html
<script src="__API_BASE__/api/keys?names=github"></script>
<script>
async function fetchRepos() {
  if (typeof GITHUB_API_KEY === 'undefined') return;
  const resp = await fetch('https://api.github.com/user/repos', {
    headers: { Authorization: `Bearer ${GITHUB_API_KEY}` }
  });
  const data = await resp.json();
  console.log(data);
}
</script>
```

## 注意事项
- 域名变更需同步更新 `api/keys.js` 的允许列表。
- 令牌更新只需改 Vercel 环境变量 `GITHUB_API_KEY`。
