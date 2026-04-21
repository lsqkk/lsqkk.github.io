# 常用无服务器 API 调用说明

以下为项目内常用 `/api` 接口的功能、方法与配置简述。

> ⚠ **白名单提示**：多数 API 有来源白名单校验，域名变更后若未同步更新 `api/*.js` 内的允许列表，前端会直接被拒绝或验证失败。

## /api/keys
- 作用：向前端注入密钥（如 `TIANDITU_KEY`、`OPENWEATHER_API_KEY` 等）
- 方法：`GET`
- 示例：`__API_BASE__/api/keys?names=tianditu`
- 环境变量：`TIANDITU_KEY`、`OPENWEATHER_API_KEY`、`QUARKCHAT_API_KEY`、`GITHUB_API_KEY`
- 说明：域名变更需更新 `api/keys.js` 允许列表

## /api/firebase-config
- 作用：注入 Firebase 配置
- 方法：`GET`
- 配套：`/assets/js/firebase-ready.js`

## /api/admin-auth
- 作用：管理员密码校验，返回 token
- 方法：`POST`
- 参数：`{ passwordHash }`
- 环境变量：`ADMIN_PASSWORD_HASH`、`ADMIN_SESSION_SECRET`

## /api/admin-verify
- 作用：校验管理员 token
- 方法：`POST`
- 参数：`{ token }`

## /api/db
- 作用：Firebase RTDB 代理（读写）
- 方法：`GET` / `POST`
- GET 参数：`path`，可选查询参数 `orderByChild` / `startAt` / `endAt` / `equalTo` / `limitToFirst` / `limitToLast`
- POST 参数：`{ path, op, value }`，op 可为 `set` / `update` / `remove` / `push`
- 环境变量：`FIREBASE_SERVICE_ACCOUNT`(或 `FIREBASE_SERVICE_ACCOUNT_JSON`)、`FIREBASE_DATABASE_URL`
- 说明：允许路径在 `api/db.js` 内白名单维护

## /api/r2-presign
- 作用：生成 R2 预签名上传链接
- 方法：`POST`
- 参数：`{ originalName, contentType, folder }`
- 环境变量：`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`、`R2_ENDPOINT`、`R2_BUCKET`、`R2_PUBLIC_BASE_URL`

## /api/turnstile-verify
- 作用：Turnstile 人机验证
- 方法：`POST`
- 参数：`{ token, purpose }`
- 环境变量：`TURNSTILE_SECRET_KEY`

## /api/email-send
- 作用：发送邮箱验证码（Resend）
- 方法：`POST`
- 参数：`{ email, purpose }`
- 环境变量：`RESEND_API_KEY`、`RESEND_FROM`、`EMAIL_TOKEN_SECRET`

## /api/email-verify
- 作用：校验邮箱验证码
- 方法：`POST`
- 参数：`{ email, code, token, purpose }`
- 环境变量：`EMAIL_TOKEN_SECRET`

## /api/github-user
- 作用：GitHub OAuth 用户信息读取
- 方法：`GET`
- 依赖：GitHub OAuth 配置与 `GITHUB_API_KEY`

## /api/ip
- 作用：返回请求 IP（用于安全/风控）
- 方法：`GET`

## /api/stream-proxy
- 作用：流式代理（用于大模型流式输出）
- 方法：`POST`
