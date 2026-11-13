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

## 聊天室房间

聊天室通过现有 Vercel 函数的 `/api/db?view=chat-room` 管理限时房间。旧公开房间仍从 `chatrooms/` 读取，与限时房间独立。

在 Vercel 配置 `CHAT_ROOM_SECRET`（随机且稳定的服务端密钥）和 `CRON_SECRET`。前者用于签发房间访问凭证和加密消息。切换前者会使现有房间失效。后者由每日清理任务用于授权，房间到期即时停止访问，后台清理最多会延迟到下一轮定时任务。定时任务每日最多清理 250 个房间，用户访问过期房间时也会触发清理。

在 Firebase RTDB 规则的 `rules` 内合并以下设置，并确认祖先路径没有更宽松的公开读写规则。Admin SDK 不受客户端规则限制。

~~~json
{
  "quark_managed_chat_v1": {
    ".read": false,
    ".write": false,
    "rooms": {
      ".indexOn": ["expiresAt"]
    }
  },
  "quark_managed_chat_v1_create": {
    ".read": false,
    ".write": false
  },
  "quark_managed_chat_v1_join": {
    ".read": false,
    ".write": false
  }
}
~~~

限时房间的在线数按浏览器设备的近期心跳统计。旧公开房间使用 Firebase 断线事件，可按现有 `chatrooms/$room` 权限模式为其 `presence` 子节点开启读取和写入。
