# 安全验证（Turnstile）调用说明

## 功能概述
使用 Cloudflare Turnstile 进行人机验证，前端通过 `turnstile-guard.js` 渲染组件并调用 `__API_BASE__/api/turnstile-verify` 校验。

## 必要环境变量
- `TURNSTILE_SECRET_KEY`

## 前端接入步骤

## 站点密钥来源
推荐从 `json/nav.json` 的 `login.turnstileSiteKey` 读取，并通过 Astro `define:vars` 注入到 `window.__TURNSTILE_SITE_KEY__`。

### 1. 页面引入
```html
<script>
  window.__TURNSTILE_SITE_KEY__ = '<你的站点 KEY>';
</script>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script>
<script src="/assets/js/turnstile-guard.js"></script>
<script src="/assets/js/security-shared.js"></script>
```

### 2. 添加容器
```html
<div class="turnstile-box" data-turnstile-kind="xjtu360-upload"></div>
```

### 3. 提交前校验
```javascript
const ok = await window.SecurityShared.verifyTurnstile('xjtu360-upload', statusEl);
if (!ok) return;
```

## 注意事项
- 域名变更需同步更新 `api/turnstile-verify.js` 的允许列表与 hostname 校验。
- `turnstile-guard.js` 会自动渲染所有带 `data-turnstile-kind` 的容器。
