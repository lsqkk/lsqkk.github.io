# Serverless API

源码在仓库根目录 `api/`，由独立 Vercel 项目提供。前端使用 `src/config/json/api.json` 中的 `apiBase`；静态构建在资源与 HTML 中替换 `__API_BASE__`。本地 Astro 预览不直接运行这些函数。

## 路由

| 方法 / 路由 | 参数与行为 | 源文件 |
| --- | --- | --- |
| GET `/api/firebase-config` | 返回浏览器可读 Firebase 配置脚本，配合 `firebase-ready.js` | [firebase-config.js](../../../api/firebase-config.js) |
| GET `/api/keys?names=tianditu` | 返回指定名称的浏览器可读配置脚本；支持逗号分隔 | [keys.js](../../../api/keys.js) |
| GET `/api/github-user?code=...` | 用 OAuth code 获取 GitHub 用户资料和额度会话，服务端使用 client secret | [github-user.js](../../../api/github-user.js) |
| POST `/api/admin?action=auth` | `{passwordHash}`，返回管理员 token 与过期时间 | [admin.js](../../../api/admin.js) |
| POST `/api/admin?action=verify` | `{token}`，校验管理员会话 | [admin.js](../../../api/admin.js) |
| POST `/api/email?action=send` | `{email,purpose}`，发送验证码并返回校验 token | [email.js](../../../api/email.js) |
| POST `/api/email?action=verify` | `{email,code,token,purpose}`，校验一次性验证码，已绑定邮箱登录时返回额度会话 | [email.js](../../../api/email.js) |
| GET / POST `/api/db` | GET 查询允许路径；POST `{path,op,value}`，op 为 set / update / remove / push | [db.js](../../../api/db.js) |
| POST `/api/r2-presign` | `{originalName,contentType,folder}`，返回上传签名与公开地址；全景上传应用访客和账号日限额 | [r2-presign.js](../../../api/r2-presign.js) |
| POST `/api/turnstile-verify` | `{token,purpose}`，验证人机校验结果 | [turnstile-verify.js](../../../api/turnstile-verify.js) |
| GET `/api/ip` | 返回请求 IP 相关信息 | [ip.js](../../../api/ip.js) |
| GET `/api/stream-proxy?url=...` | 媒体流代理 | [stream-proxy.js](../../../api/stream-proxy.js) |
| POST `/api/stream-proxy?target=...` | 按处理器支持的目标代理 AI 搜索请求 | [stream-proxy.js](../../../api/stream-proxy.js) |
| POST `/api/quarkbot-free` | QuarkBot 免费对话，固定模型、共享日限额，流式返回 | [quarkbot-free.js](../../../api/quarkbot-free.js) |

管理员与邮箱分别使用同一处理器的 action 参数。路由和字段以对应源码为准，不能根据旧文档推导出独立函数文件。

## 配置与访问边界

环境变量按功能配置，清单见[部署说明](../迁移部署说明.md)。来源匹配集中于 [api/_cors.js](../../../api/_cors.js)，各处理器使用的匹配方式并不完全相同。迁移域名、协议或本地端口后需要核对配置。

`/api/keys` 的映射包括天地图、GitHub 和保留的天气服务字段。按需明确传入 names，避免请求未配置的无关项。没有使用对应功能时，不必补齐所有值。

配置脚本会把内容交给浏览器，不能依靠这种注入方式保密。Firebase 浏览器配置不等于 Admin 服务账号；数据库规则、服务端凭据和操作权限需要分别维护。CORS 也不能替代身份认证和业务授权。

## 配套文档

- [Firebase 配置](firebaseRTDB配置调用说明.md)
- [管理员会话](管理员密钥调用说明.md)
- [Turnstile](安全验证Turnstile说明.md)
- [天地图配置](天地图密钥调用说明.md)
- [GitHub 配置](GitHub令牌调用说明.md)
- [R2 上传](R2上传与图床说明.md)
- [用户资料同步](用户资料同步机制.md)

布局测试不会发送真实验证码、上传文件或修改在线房间。接口集成验收应在明确的服务配置和测试数据下进行。
