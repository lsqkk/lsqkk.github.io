# Firebase RTDB 配置

`/api/firebase-config` 提供浏览器配置脚本；`assets/js/firebase-ready.js` 统一加载依赖、等待配置并复用 Firebase 实例。

~~~html
<script src="__API_BASE__/api/firebase-config?v=1"></script>
<script src="/assets/js/firebase-ready.js"></script>
~~~

~~~js
const database = await window.QuarkFirebaseReady.ensureDatabase({loadConfig:true});
~~~

页面需处理配置请求、SDK 或数据库权限失败，不让可独立使用的本地功能一起卡住。避免重复初始化或自己轮询全局变量。

浏览器配置中的 API key、项目 ID 和数据库 URL 可以被客户端读取，不能当作服务端秘密。`FIREBASE_SERVICE_ACCOUNT` / `FIREBASE_SERVICE_ACCOUNT_JSON` 仅供 Serverless Admin SDK 使用，不返回给前端。数据访问的最终边界是数据库规则与处理器权限。

来源设置在 `api/_cors.js`，环境变量见[部署说明](../迁移部署说明.md)。新增房间路径需在实际 Firebase 项目中设置规则；不要从“前端能拿到配置”推断所有路径都允许读写。
