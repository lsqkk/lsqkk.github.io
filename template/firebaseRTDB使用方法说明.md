# firebase realtime database 相关功能使用说明
## 管理员登录相关
当提示词要求你使用管理员登录密码时，你需要在代码中引入`api.lsqkk.space/api/admin-auth`执行以下操作：
    
### 引入步骤与样例代码

#### 1. 前端登录函数模板
下面是一个包含基础错误处理和UI状态管理的异步登录函数模板，需要你根据页面元素ID进行调整。

```javascript
/**
 * 管理员登录函数
 * @param {string} passwordInputId - 密码输入框的HTML ID
 * @param {string} loginButtonId - 登录按钮的HTML ID (可选，用于状态反馈)
 */
async function adminLogin(passwordInputId = 'adminPassword', loginButtonId = 'adminLoginBtn') {
    const passwordInput = document.getElementById(passwordInputId);
    const loginButton = document.getElementById(loginButtonId);
    const password = passwordInput.value.trim();

    // 1. 基础验证
    if (!password) {
        alert('请输入密码');
        return;
    }

    // 2. 设置加载状态（可选）
    let originalButtonText = '登录';
    if (loginButton) {
        originalButtonText = loginButton.textContent;
        loginButton.disabled = true;
        loginButton.textContent = '验证中...';
    }

    try {
        // 3. 计算密码哈希 (使用你项目中已有的同步或异步 sha256 函数)
        const passwordHash = await sha256(password); // 或使用同步版本：sha256(password)

        // 4. 调用安全验证API
        const response = await fetch('https://api.lsqkk.space/api/admin-auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ passwordHash })
        });

        const result = await response.json();

        // 5. 处理响应
        if (response.ok && result.success) {
            // 登录成功逻辑
            localStorage.setItem('isAdmin', 'true'); // 设置登录状态
            alert('管理员登录成功');
            passwordInput.value = ''; // 清空密码框
            // 调用页面特定的UI更新函数，例如：
            if (typeof updateAdminUI === 'function') updateAdminUI();
            // 可在此处跳转或重载数据...

        } else {
            // 登录失败
            alert('密码错误');
            passwordInput.value = '';
            passwordInput.focus();
        }
    } catch (error) {
        // 网络或意外错误
        console.error('登录请求失败:', error);
        alert('登录失败：网络或服务异常');
    } finally {
        // 6. 恢复按钮状态
        if (loginButton) {
            loginButton.disabled = false;
            loginButton.textContent = originalButtonText;
        }
    }
}

管理员登出函数

function adminLogout() {
    localStorage.setItem('isAdmin', 'false');
    alert('已退出管理员登录');
    // 调用页面特定的UI更新函数
    if (typeof updateAdminUI === 'function') updateAdminUI();
}
```

#### 2. 登录状态检查与UI更新样例
在每个需要管理员权限的页面加载时，检查本地存储的状态并更新界面。

```javascript
// 页面加载时检查登录状态
document.addEventListener('DOMContentLoaded', function() {
    const isAdmin = localStorage.getItem('isAdmin') === 'true';
    if (typeof updateAdminUI === 'function') {
        updateAdminUI(isAdmin); // 根据状态更新按钮、菜单等
    }
});

// 一个简单的UI更新函数示例
function updateAdminUI(isAdmin) {
    const adminOnlyElements = document.querySelectorAll('.admin-only');
    adminOnlyElements.forEach(el => {
        el.style.display = isAdmin ? 'block' : 'none';
    });
    // 也可以更新一个“登录/退出”按钮的文字和事件
    const adminBtn = document.getElementById('adminToggleBtn');
    if (adminBtn) {
        if (isAdmin) {
            adminBtn.textContent = '退出管理';
            adminBtn.onclick = adminLogout;
        } else {
            adminBtn.textContent = '管理员登录';
            adminBtn.onclick = () => {
                const pwd = prompt('请输入管理员密码：');
                if (pwd) {
                    // 这里可以简化调用，或弹出专用登录框
                    document.getElementById('adminPassword').value = pwd;
                    adminLogin();
                }
            };
        }
    }
}
```

### 注意事项
哈希函数：确保 `sha256` 函数在全局可用，且调用方式（同步/异步）与上述示例匹配。
状态持久化：使用 `localStorage` 在浏览器会话间保持登录状态。请根据安全需求评估其适用性。
API安全：该接口已配置来源检查，仅允许你生成网页所放置的域名调用，无需担心前端密钥泄露并额外加任何验证机制。
错误信息：可根据 `result.error` 细化错误提示（如“密码错误”、“请求无效”等）。
    

## Firebase realtime database相关
当提示词要求你使用firebase RTDB存储/读写实时数据时，你需要引入`api.lsqkk.space/api/firebase-config`脚本及相关功能：

### 功能概述
通过调用部署在 `api.lsqkk.space` 的安全接口，动态获取 Firebase 实时数据库（RTDB）的完整配置，并完成初始化。所有敏感配置信息已托管于 Vercel 环境变量中。
需要确保加载的 Firebase SDK（如 `firebase-app.js`, `firebase-database.js`）已正确引入。（需在新项目html中引入）

### 引入步骤与样例代码
#### 场景A：在 HTML 文件中的 `<script>` 标签内使用
**引入顺序至关重要**：必须先引入配置，再初始化 Firebase。
```html
1. 引入必要的Firebase SDK
<script src="https://www.gstatic.com/firebasejs/8.10.0/firebase-app.js"></script>
<script src="https://www.gstatic.com/firebasejs/8.10.0/firebase-database.js"></script>

2. 引入动态配置
<script src="https://api.lsqkk.space/api/firebase-config"></script>

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
    <script src="https://api.lsqkk.space/api/firebase-config"></script>
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
    