<h1 align="center" style="color:#355fe9;">Quark Blog 夸克博客</h1>
<h3 align="center">不只「博客」，不止「前端」</h3>
<br>

<p align="center">
  <img src="https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?style=flat&logo=javascript&logoColor=black" alt="JavaScript">
  <img src="https://img.shields.io/badge/HTML5-E34F26?style=flat&logo=html5&logoColor=white" alt="HTML5">
  <img src="https://img.shields.io/badge/CSS3-1572B6?style=flat&logo=css3&logoColor=white" alt="CSS3">
  <img src="https://img.shields.io/badge/Firebase-FFCA28?style=flat&logo=firebase&logoColor=black" alt="Firebase">
  <br>
  <img src="https://img.shields.io/badge/WebRTC-333333?style=flat&logo=webrtc&logoColor=white" alt="WebRTC">
  <img src="https://img.shields.io/badge/Canvas-000000?style=flat&logo=html5&logoColor=white" alt="Canvas">
  <img src="https://img.shields.io/badge/Vercel-000000?style=flat&logo=vercel&logoColor=white" alt="Vercel">
  <img src="https://img.shields.io/badge/Node.js-339933?style=flat&logo=nodedotjs&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/Python-3776AB?style=flat&logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/GitHub%20Pages-222222?style=flat&logo=githubpages&logoColor=white" alt="GitHub Pages">
</p>



<h3 align="center" style="color:#355fe9;"> 
</h3>

<br>

这是我的个人网站仓库，主要记录前端开发、技术实验和产品思考，**不依赖任何主流架构或模板项目**，基于原生技术栈构建，部署在 GitHub Pages 并由 Vercel + 自有域名提供 Serverless 支持。由 Firebase RTDB 提供数据库服务，为工具协同、游戏对战、博客留言等提供同步。

<div align="center">
  <img src="/assets/img/readme/demo1.png" alt="demo1" style="max-height: 400px; width: auto; border-radius:10px;">
</div>

---

**网站地址**：[夸克博客](https://lsqkk.github.io)

**更新日志**：[更新日志 - 夸克博客](https://lsqkk.github.io/blog/log)

---

## 主要技术特点

Quark Blog 是 **静态 + 动态** 的结合站点，尽最大努力探索了**基于原生技术栈的纯前端解决方案**。

- **原生开发**：不依赖主流前端框架（React/Vue/Angular），使用原生 JavaScript + Canvas 实现核心功能。
- **统一 UI 设计**：规定了一套统一的 UI 设计风格。使用类似经典 Windows 7 的 Aero 模糊玻璃主题，全站使用统一的顶部导航栏、网页标题样式和格式等。
- **实时数据协同**：集成 Firebase RTDB 实现实时数据同步，支撑博客留言、在线聊天室、实时对战游戏和协同工具。
- **音视频推流**：通过**声网 Agora API** 实现直播画面的[实时推流与播放](https://lsqkk.github.io/a/live)。
- **无服务器 WebRTC 通信**：[Quark Share](https://lsqkk.github.io/a/share) 探索了无可用信令服务器状况下的 WebRTC 信令通信方案，实现 P2P 文件传输。
- **Serverless 集成**：使用 **Vercel 云函数 + 自有域名** 托管敏感配置 API Key 和自有/开放 API 服务，在 GitHub Pages 纯前端托管环境下实现后端能力。


Quark Blog 探索了在静态站点环境下实现动态应用的技术路径，通过实时数据库和无服务架构弥补前后端分离的鸿沟。


## Quark Blog 功能板块

### 网站基础功能

- [文章](https://lsqkk.github.io/posts)：日常分享、架构设计、开发心得、技术选型思考。使用可维护的文章 `html` 模板和 `py` 脚本自动生成/更新文章页面，实现类似网页生成器的效果。评论系统使用 giscus 实现。
- [工具](https://lsqkk.github.io/tool)：**30+** 自研前端工具、效率解决方案。包含使用 Firebase RTDB 集成协同功能的工具集合。
- [游戏](https://lsqkk.github.io/games)：基于 Canvas 的互动游戏等，集成 Firebase 实时对战。
- [视频](https://lsqkk.github.io/blog/qtv)：视频内容专区，观看和分享视频。基于 `uapis` API 自动更新同步B站视频信息，无需手动更新。 
- [动态](https://lsqkk.github.io/blog/dt)：分享动态内容，定期自动化搬运个人 QQ 动态条目，并开发了 [qq-emotion-parser](https://github.com/lsqkk/qq-emotion-parser) 脚本以解析渲染 Qzone 表情包。
- [留言板](https://lsqkk.github.io/blog/lyb)：网站用户反馈留言区域，Firebase RTDB 提供数据库支持。

### 实验功能

- [前端实验室](https://lsqkk.github.io/a)：原生 JavaScript 深入应用、性能优化、API 集成、浏览器兼容性等实践，目前包含 **15+** 项目，持续更新优化中。
- [实时热榜](https://lsqkk.github.io/blog/hot)：自动更新 `uapis` API 返回的各平台实时热搜，提供新闻热点聚合。
- [夸克日报](https://lsqkk.github.io//blog/daily)：定期自动化搬运知乎收藏夹，提供新鲜优质的知乎文章资讯，优化了分页和懒加载机制。
- [直播](https://lsqkk.github.io/a/live)：通过声网 Agora API 实现直播画面的实时推流与播放。
- [贴吧](https://lsqkk.github.io/blog/tieba/)：全站公共论坛。

### 已启用的仓库 Pages

- [我的学术主页](https://lsqkk.github.io/academic-homepage)：基于 Minimal Light 主题的修改版，添加了展示项目经历、竞赛获奖内容的板块。
- [夸克文档](https://lsqkk.github.io/quarkdoc)：基于 MkDocs 的文档与知识库项目，系统地整理和分享技术笔记、开源项目文档、博客文章的延伸内容以及其他值得记录的知识。目前存放着以下项目文档。
  - 【[香橙派 AI Pro 综合开发笔记：从零搭建个人AI服务器](https://lsqkk.github.io/quarkdoc/OrangePi/)】我在宿舍环境中利用香橙派AI Pro开发板从零开始搭建个人AI服务器的完整实战记录，完全源于个人真实探索过程，记录了从开箱接线到复杂服务部署的每一个步骤，系统性地整理了四大板块、共 12 个核心实战项目。（4篇）
  - 【[Quark API - 夸克博客个人 API 服务集合](https://lsqkk.github.io/quarkdoc/QuarkAPI/)】模块化、可扩展的个人 API 服务集合，提供多种 API 服务。项目采用 Node.js 开发，部署于 Vercel 平台，支持通过 RESTful API 访问丰富的问答数据。目前包含以下几个 API 服务。（4篇）

    | API 名称 | 简介 | API 文档地址 |
    | :--- | :--- | :--- |
    | **Quiz API** | 提供多主题百科题库服务，支持随机题目、ID查询、范围查询和全文搜索等功能。 | [Quiz API](https://lsqkk.github.io/quarkdoc/QuarkAPI/Quiz%20API/) |
    | **Animal API** | 提供结构化动物图片数据集的访问服务，可按类别、ID获取图片，支持随机、范围查询和搜索，并包含 GitHub 原图与 CDN 加速双链接。 | [Animal API](https://lsqkk.github.io/quarkdoc/QuarkAPI/Animal%20API/) |
    | **Bili Card** | 优雅、现代的B站用户卡片生成工具，传入UID返回精美的SVG卡片，完美嵌入个人网站、GitHub Profile或任何需要展示B站身份的场景。[仓库](https://github.com/lsqkk/bili-card) | [bili-card](https://lsqkk.github.io/quarkdoc/QuarkAPI/bili-card/) |
  - 【[其他资料](https://lsqkk.github.io/quarkdoc/资料/)】包含C程序设计考试题目等，持续更新。（2篇）

### 其他项目列表

Quark Blog 网站功能页还定期更新我的其他开源项目工具（计划改为从 Github API 自动加载），列表如下：

| 名称 | 描述 | 地址 |
|------|------|------|
| question-helper | 自定义题目学习复习工具，支持智能复习算法和多模式练习，适用于中学生/大学生文科、公务员考试等题目的高校复习。将 Markdown 格式的题目源文件自动构建为交互式学习界面，提供基于艾宾浩斯遗忘曲线的复习计划、学习进度可视化以及多维度统计功能。 | [项目地址](https://github.com/lsqkk/question-helper) |
| pmt | PMT 是一个基于 GitHub Pages 的 AI 提示词快捷链接工具，使用纯 HTML/CSS/JS 实现。通过超简洁的 URL 即可快速调用复杂的提示词模板，支持模糊搜索和自定义扩展，无需服务器，Fork 即可部署使用。 | [项目地址](https://github.com/lsqkk/pmt) |
| bili-card | 一行代码返回B站展示SVG卡片 \| 优雅、现代的B站用户卡片生成工具，通过简洁的API接口将B站用户信息转化为精美的SVG卡片。无需复杂的配置，只需一个UID，即可获得美观、可自定义的用户信息展示卡片，完美嵌入个人网站、GitHub Profile或任何需要展示B站身份的场景。 | [项目地址](https://github.com/lsqkk/bili-card) |
| github-star-tracker | 轻松追踪谁给你的GitHub仓库点了Star \| 简洁的 Python 工具，自动抓取并记录所有GitHub仓库的Star动态并对比历史数据，清晰地告诉你新增的Star来自哪些开发者和项目。 | [项目地址](https://github.com/lsqkk/github-star-tracker) |
| quark-api | Quark API 是一个模块化、可扩展的个人 API 服务集合，提供多种 API 服务。项目采用 Node.js 开发，部署于 Vercel 平台，支持通过 RESTful API 访问丰富的问答数据。 | [项目地址](https://github.com/lsqkk/quark-api) |
| deepseek-skills | DeepSeek 本地文件操作增强插件 \| 为 DeepSeek 网页版添加本地文件操作能力，模拟 SKILLS 的CODING功能。通过浏览器插件+本地服务的架构，在保障安全的前提下实现智能文件编辑。 | [项目地址](https://github.com/lsqkk/deepseek-skills) |
| FileManager | 基于AI的智能文件分类与管理工具，通过分析文件名自动将文件分类到预设的目录结构。采用Web可视化界面，支持批量处理、手动调整和实时配置更新，让文件整理变得简单高效。 | [项目地址](https://github.com/lsqkk/FileManager) |
| ppt-remote | 摆脱遥控笔，在任何设备遥控放映PPT \| 基于 Firebase Realtime Database 与 Node.js 开发的轻量级跨网络 PPT 遥控工具，允许使用手机远程控制电脑上的 PPT 翻页、黑屏、激光笔等功能，无需处于同一局域网。 | [项目地址](https://github.com/lsqkk/ppt-remote) |
| animal-recognition-dataset | A high-quality animal image dataset with 9,757+ images across 16 categories for computer vision research and CNN training. 一个用于计算机视觉研究和CNN模型训练的高质量动物图像数据集。本数据集包含9,757张经过精心筛选的动物图像，涵盖多个类别，适用于目标识别、分类和迁移学习任务。 | [项目地址](https://github.com/lsqkk/animal-recognition-dataset) |
| qq-emotion-parser | 解析QQ动态Qzone导出的 [em]e数字[/em]格式表情代码的轻量级JavaScript库，并将其转换为可显示的图片表情。 | [项目地址](https://github.com/lsqkk/qq-emotion-parser) |
| chat-analyzer | 功能强大的中文聊天记录分析工具，能够自动提取高频词汇、统计纯标点消息，并生成精美的词云可视化图表。 | [项目地址](https://github.com/lsqkk/chat-analyzer) |
| fire-risk | 一个基于机器学习的火灾风险预测系统，包含预处理数据和模型训练。 | [项目地址](https://github.com/lsqkk/fire-risk) |
| ZhihuCuration | 智能整理知乎收藏夹下载内容，调用大模型API实现可定制的自动分类。 | [项目地址](https://github.com/lsqkk/ZhihuCuration) |


## 支持与反馈

如果你喜欢这个网站的思路或实现，欢迎**点亮右上角的 star ⭐！**

如果你还对其技术架构感兴趣，也欢迎你：

- **Issues**：反馈 bug 或提出技术建议
- **Discussions**：欢迎交流原生开发、实时协同、无服务架构等技术话题

---

<h3 align="center">「无穷的远方，无数的人们，都和我有关」</h3>

在技术快速迭代的今天，我依然相信深入理解底层原理的价值。这个项目是对原生技术路线的探索，也是对一个静态站点能力边界的挑战。

感谢你的访问，期待在技术的世界里与更多同行者相遇。

<p align="center"> 
  <a href="https://github.com/lsqkk?tab=followers"><img src="https://img.shields.io/github/followers/lsqkk?label=Followers&style=plastic" height="25px" alt="github follow" /></a>
  <a href="https://scholar.google.com/citations?user=lsqkk"><img src="https://img.shields.io/badge/scholar-4385FE.svg?&style=plastic&logo=google-scholar&logoColor=white" alt="Google Scholar" height="25px"></a>
  <a href="mailto:jsxzznz@gmail.com"><img src="https://img.shields.io/badge/gmail-%23D14836.svg?&style=plastic&logo=gmail&logoColor=white" height="25px" alt="Email"></a>
  <a href="https://www.zhihu.com/people/jsxzznz"><img src="https://img.shields.io/badge/知乎-0079FF.svg?style=plastic&logo=zhihu&logoColor=white" height="25px" alt="知乎"></a>
</p>
