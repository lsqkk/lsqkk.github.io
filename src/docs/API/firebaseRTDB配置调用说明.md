# Firebase RTDB 配置调用说明

## 功能概述
通过 `__API_BASE__/api/firebase-config` 动态注入 Firebase 配置，避免在前端硬编码敏感信息。推荐搭配 `assets/js/firebase-ready.js` 使用，确保配置与 SDK 就绪后再初始化。

## 推荐用法（QuarkFirebaseReady）
### 1. HTML 中引入
```html
<script src="https://www.gstatic.com/firebasejs/8.10.0/firebase-app.js"></script>
<script src="https://www.gstatic.com/firebasejs/8.10.0/firebase-database.js"></script>
<script src="__API_BASE__/api/firebase-config?v=1"></script>
<script src="/assets/js/firebase-ready.js"></script>
```

### 2. JS 中初始化
```javascript
async function initDb() {
  if (!window.QuarkFirebaseReady) throw new Error('Firebase就绪模块未加载');
  const database = await window.QuarkFirebaseReady.ensureDatabase({ loadConfig: true });
  // database 即 firebase.database()
  return database;
}
```

## 传统用法（不推荐）
如果必须自行初始化，确保在 `firebaseConfig` 注入完成后执行。
```javascript
if (typeof firebaseConfig !== 'undefined') {
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  const database = firebase.database();
}
```

## 重要说明
- 必须使用 `__API_BASE__/api/firebase-config`，不要写死 `api.130923.xyz`。
- `firebase-ready.js` 会负责等待配置加载并保证单例初始化，建议所有新页面使用。
- 如需切换项目，只需在 Vercel 环境变量中更新配置，无需改前端。
> ⚠ **白名单提示**：域名变更需同步更新 `api/firebase-config.js` 的允许列表，否则配置注入会被拒绝。
