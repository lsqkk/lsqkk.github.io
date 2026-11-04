---
title: "关于本站与版权声明"
description: "夸克博客的内容、技术、数据使用和授权说明"
date: 2025-02-01
tags: 网站
---

# 关于本站与版权声明

夸克博客（Quark Blog）是[蓝色奇夸克](https://github.com/lsqkk)维护的个人网站，记录学习、生活与思考，也提供浏览器工具、多人游戏和前端实验。

[网站主页](https://lsqkk.github.io/) · [源码仓库](https://github.com/lsqkk/lsqkk.github.io) · [RSS 订阅](/posts/rss.xml) · [联系邮箱](mailto:jsxzznz@163.com)

## 网站如何运行

页面由 Astro 根据 Markdown、JSON 与组件生成，交互主要使用原生 JavaScript、CSS、Canvas 和 WebRTC。静态文件部署在 GitHub Pages；需要在线服务的功能通过 Vercel Serverless、Firebase Realtime Database 或相关第三方服务实现。

界面采用实色表面、细分隔线与响应式排版，跟随系统深浅主题。阅读、工具、动态与游戏使用各自适合的布局；默认使用霞鹜文楷，字体、语言和动态效果可在网站设置中调整。

## 内容与代码的授权

### 文章

除单篇另有标注外，本站原创文章采用[知识共享署名—非商业性使用—相同方式共享 4.0 国际许可协议（CC BY-NC-SA 4.0）](https://creativecommons.org/licenses/by-nc-sa/4.0/)。

在该协议范围内分享或改编时，请保留作者、原文链接和许可说明，并注明修改；改编内容按协议规定的相同许可发布。商业使用或协议范围以外的授权，请联系站主。

文章中的引用、转载、图片、音视频、附件与其他第三方材料不因收录在文章中而获得原创文章的授权。使用这些材料时，请核对其来源及各自的许可。

### 站点代码

站点代码按仓库内的 [LICENSE](https://github.com/lsqkk/lsqkk.github.io/blob/main/LICENSE) 授权，其文本为 **GNU Affero General Public License v3.0（AGPLv3）**。复制、修改和分发时，以完整许可证及对应文件的版权声明为准。[GNU 官方许可证说明](https://www.gnu.org/licenses/agpl-3.0.html)可供查阅。

第三方代码、图标、字体与素材保留各自的许可和版权声明，不能将整个资源目录视为统一的原创素材授权包。

## 数据保存在什么地方

- **本机数据**：阅读清单、私人摘录、阅读想法、偏好及部分工具状态保存在浏览器中。阅读工作台不把清单、摘录与想法上传到服务器，可主动导出手记和 JSON 备份；清除浏览器数据会移除未备份内容。
- **公开互动**：评论、留言、动态互动、实时房间等按功能写入对应在线服务。提交前应注意该区域的公开范围，不要发布个人敏感信息。
- **登录与账号**：GitHub 登录通过 OAuth 获取身份资料；站内账号及相关资料使用站点账号服务。密码、验证码、会话与服务端配置按对应功能处理。
- **文件与媒体**：上传图床的文件可能生成公开链接；实时传输、会议、语音识别及其他媒体功能的权限和数据流以页面操作说明为准。
- **外部请求**：访问统计、评论、地图、翻译、媒体与 AI 等功能可能向其服务商发起请求。浏览器本地保存的阅读记录与全站已有在线服务属于不同的数据范围。

## 使用的服务与资源

下表列出主要依赖；具体功能是否发起请求取决于所访问页面、设置和启用的服务。

| 服务或资源 | 用途 |
| --- | --- |
| [Astro](https://astro.build/) / [GitHub Pages](https://pages.github.com/) | 内容构建与静态站点托管 |
| [Vercel](https://vercel.com/) | 独立 Serverless API |
| [Firebase Realtime Database](https://firebase.google.com/products/realtime-database) | 公开互动、账号资料、协作与实时房间 |
| [GitHub OAuth](https://docs.github.com/apps/oauth-apps) / [GitHub API](https://docs.github.com/rest) | 身份授权、仓库信息及相关功能 |
| [Cloudflare R2](https://developers.cloudflare.com/r2/) | 文件存储与上传 |
| [Cloudflare Turnstile](https://www.cloudflare.com/products/turnstile/) / [Resend](https://resend.com/) | 人机验证与邮件验证码 |
| [giscus](https://giscus.app/zh-CN) | 文章底部评论 |
| [不蒜子](https://www.busuanzi.cc/) | 页面访问统计 |
| [KaTeX](https://katex.org/) / [Mermaid](https://mermaid.js.org/) / [highlight.js](https://highlightjs.org/) | 公式、图表与代码展示；代码也使用构建期 Shiki 高亮 |
| [Font Awesome Free](https://fontawesome.com/license/free) / [霞鹜文楷](https://github.com/lxgw/LxgwWenKai) | 图标与可选阅读字库；默认阅读字体来自霞鹜文楷 |
| [天地图](https://www.tianditu.gov.cn/) / [Agora](https://www.agora.io/) | 地图与部分音视频功能 |
| [uapis](https://uapis.cn/) / [北梦 API](https://api.b52m.cn/) | 视频、聚合内容或可选访客问候；IP 问候默认关闭 |
| [妖狐 API](https://api.yaohud.cn/) / [慕名 API](https://api.suol.cc/) / [TextDB](https://textdb.online/) | 数字人文字与语音、贴吧等特定页面 |
| 用户配置的 AI、搜索或翻译服务 | 根据具体页面、模型、端点及语言选择提供能力 |

历史文章与动态还可能引用 Bing、Postimages、GitHub 图床等外部图片。外链内容及第三方服务的可用性、条款和数据处理规则由相应提供方决定。

## 使用与反馈

本站内容用于个人分享、学习与实验，工具结果和文章观点不保证适用于所有场景。请根据具体用途自行核对信息，并在发布内容或处理文件时尊重他人的权利。实验性功能、外部接口和在线房间可能因网络、配置或维护而暂时不可用。

如发现错误、失效链接、数据问题或疑似侵权内容，请通过[邮件](mailto:jsxzznz@163.com)或[仓库 Issues](https://github.com/lsqkk/lsqkk.github.io/issues)联系。版权相关反馈请附上具体链接、权利依据与简要说明，便于核实处理。

本页说明不替代各许可证完整文本和页面具体提示。

---

说明维护日期：2026-11-04。文章初始发布日期保留在页首。
