# firebase realtime database 配置调用说明

当遇到firebase RTDB存储/读写实时数据时，需要引入`api.130923.xyz/api/firebase-config`脚本及相关功能：

### 功能概述
通过调用部署在 `api.130923.xyz` 的安全接口，动态获取 Firebase 实时数据库（RTDB）的完整配置，并完成初始化。所有敏感配置信息已托管于 Vercel 环境变量中。
需要确保加载的 Firebase SDK（如 `firebase-app.js`, `firebase-database.js`）已正确引入。（需在新项目html中引入）

### 引入步骤与样例代码
#### 场景A：在 HTML 文件中的 `<script>` 标签内使用
**引入顺序至关重要**：必须先引入配置，再初始化 Firebase。
```html
1. 引入必要的Firebase SDK
<script src="https://www.gstatic.com/firebasejs/8.10.0/firebase-app.js"></script>
<script src="https://www.gstatic.com/firebasejs/8.10.0/firebase-database.js"></script>

2. 引入动态配置
<script src="https://api.130923.xyz/api/firebase-config"></script>

3. 初始化并使用Firebase
<script>
    // 配置已通过上方的脚本加载为全局变量 `window.firebaseConfig`
    if (typeof firebaseConfig !== 'undefined') {
        // 初始化Firebase应用（确保只初始化一次）
        if (!firebase.apps.length) {
            const app = firebase.initializeApp(firebaseConfig);
        }
        // 获取数据库实例
        const database = firebase.database();
        // 此后可进行数据库读写操作...
    } else {
        console.error('未能加载Firebase配置。');
    }
</script>
```

#### 场景B：在独立的 JavaScript (.js) 文件中使用
**关键**：确保该JS文件在引入配置的 `<script>` 标签**之后**执行。
```html
在HTML中的正确引入顺序
<head>
    1. 引入Firebase SDK
    <script src="https://www.gstatic.com/firebasejs/8.10.0/firebase-app.js"></script>
    <script src="https://www.gstatic.com/firebasejs/8.10.0/firebase-database.js"></script>
    2. 引入动态配置
    <script src="https://api.130923.xyz/api/firebase-config"></script>
</head>
<body>
    3. 引入你的业务JS文件（此时firebaseConfig已就绪）
    <script src="your-app-logic.js"></script>
</body>
```
`your-app-logic.js` 文件中的代码：
```javascript
// 直接使用全局变量 `firebaseConfig` 和 `firebase`
if (typeof firebaseConfig !== 'undefined') {
    // 初始化检查
    if (!firebase.apps.length) {
        const app = firebase.initializeApp(firebaseConfig);
    }
    const database = firebase.database();
    // 开始你的数据库操作...
} else {
    console.error('Firebase配置未找到，请检查引入顺序。');
}
```

### 注意事项
单次初始化：使用 `if (!firebase.apps.length)` 防止重复初始化导致错误。
配置就绪：任何依赖于 `firebaseConfig` 或 `firebase.database()` 的代码，都必须确保在配置脚本加载完成后执行。
    