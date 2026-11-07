# 网站设置与管理面板说明

## 网站设置页

`/settings` 是面向网站访问者的偏好设置页，使用 `LuxuryBackground` 背景。

访客可以切换浅色、深色和系统主题，设置默认语言、字体、文章字号、动效和指针轨迹。设置立即在本机生效，登录后可以保存到账号。站点偏好可导出为 JSON。

### 通知与日程

顶栏铃铛和首页通知卡片使用同一份日程。通知中心打开时自动展开当前通知，往期通知可按需展开。访问者可分别控制自动弹出和节日庆祝。个人提醒支持单次和每年重复，保存在本机，访问网站时按设备日期显示。

全站日程在 [notices.json](../../config/json/notices.json) 中维护。每项需要唯一的 `id`、`title` 和 `content`。用 `startDate` 和可选的 `endDate` 定义有效期，用 `annual`（`MM-DD`）定义年度节日。将 `popup` 设为 `true` 后，每次日程可自动弹出一次。用 `kind: "celebration"` 标记节日，用 `action` 提供站内链接。

### 共享 AI 连接

QuarkBot、QAI WebUI 和网页 Quark 终端共用浏览器中的 OpenAI 兼容连接。浏览器直接向所选提供商发送 API Key 和当次请求，本站服务与账号同步均不接收密钥。可在设置里测试连接、清除本机密钥，并控制 QuarkBot 的页面摘录与站内搜索权限。

偏好由 `assets/js/user-preferences.js` 统一管理，保存到 `localStorage` 的 `quark_site_preferences`。若用户已登录，会同步到 Firebase RTDB：

```text
user_activity/{uid}/settings
```

顶栏语言选择也会调用同一套偏好保存逻辑，因此登录用户在其他设备登录后会自动读取云端语言偏好。
