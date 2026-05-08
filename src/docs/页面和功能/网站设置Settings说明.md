# 网站设置与管理面板说明

## 网站设置页

`/settings` 是面向网站访问者的偏好设置页，使用 `LuxuryBackground` 背景。

当前支持：
- 默认语言：与顶栏语言选择共用 `quark_language_preference`
- 站点字体：读取 `assets/js/user-preferences.js` 中维护的字体列表，并写入 `--site-font-family`
- 动效强度与指针轨迹开关

偏好由 `assets/js/user-preferences.js` 统一管理，保存到 `localStorage` 的 `quark_site_preferences`。若用户已登录，会同步到 Firebase RTDB：

```text
user_activity/{uid}/settings
```

顶栏语言选择也会调用同一套偏好保存逻辑，因此登录用户在其他设备登录后会自动读取云端语言偏好。