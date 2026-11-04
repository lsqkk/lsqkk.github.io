# GitHub API 与 OAuth 配置

GitHub 登录由 `api/github-user.js` 在服务端用 `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` 交换 OAuth code。前端授权入口在 `src/config/json/nav.json`，迁移时同步修改 client_id 和 redirect_uri。

`api/keys.js` 还提供 `names=github` 的浏览器配置映射，对应 `GITHUB_API_KEY`。该映射与 OAuth 登录不是同一条调用链，不能在文档中把 API token 写成 OAuth 必需项。当前图床上传使用 R2，不依赖 GitHub 上传 token。

通过配置脚本返回的 token 能在浏览器中读取，不能把它视为隐藏凭据的方案。需要保密或具有写权限的令牌应留在服务端；公开仓库信息优先使用满足需求的公开 API。

所有来源设置集中在 `api/_cors.js`。按需调用明确的名称，不请求不使用的映射；服务端环境变量不填写进公开 JSON。
