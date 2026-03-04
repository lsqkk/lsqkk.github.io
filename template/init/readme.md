<h1 align="center" style="color:#355fe9;">Quark Blog 夸克博客</h1>
<h3 align="center">轻量级博客网站模板</h3>
<br>

<p align="center">
  <img src="https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?style=flat&logo=javascript&logoColor=black" alt="JavaScript">
  <img src="https://img.shields.io/badge/HTML5-E34F26?style=flat&logo=html5&logoColor=white" alt="HTML5">
  <img src="https://img.shields.io/badge/CSS3-1572B6?style=flat&logo=css3&logoColor=white" alt="CSS3">
  <img src="https://img.shields.io/badge/Canvas-000000?style=flat&logo=html5&logoColor=white" alt="Canvas">
  <img src="https://img.shields.io/badge/Node.js-339933?style=flat&logo=nodedotjs&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/Python-3776AB?style=flat&logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/GitHub%20Pages-222222?style=flat&logo=githubpages&logoColor=white" alt="GitHub Pages">
</p>


<a href="https://lsqkk.github.io"><img src="/assets/img/readme/demo1.png" alt="demo1"></a>

**模板Demo**：[夸克博客](https://lsqkk.github.io)


## 主要技术特点

Quark Blog 是 **静态 + 动态** 的结合站点，尽最大努力探索了**基于原生技术栈的纯前端解决方案**。

- **TypeScript 支持**：采用 `@ts-check + JSDoc + globals.d.ts` 的轻量策略，在不破坏静态站点直出模式的前提下逐步引入类型约束，提升重构安全性与可维护性。
  
- **统一 UI 设计**：统一的 UI 设计风格，使用类似经典 Windows 7 的 Aero 模糊玻璃主题，全站使用统一的顶部导航、字体、标题样式，深浅色切换跟随系统，优雅的视差滚动效果等。
    <table>
      <tr>
        <td align="center"><img src="/assets/img/readme/nav.png" width="90%"></td>
        <td align="center"><img src="/assets/img/readme/demo2.png" width="90%"></td>
      </tr>
      <tr>
        <td align="center">Aero 主题顶栏</td>
        <td align="center">Aero 主题卡片 UI</td>
      </tr>
      <tr>
        <td align="center"><img src="/assets/img/readme/demo3.png" width="90%"></td>
        <td align="center"><img src="/assets/img/readme/demo4.png" width="90%"></td>
      </tr>
      <tr>
        <td align="center">统一网页标题名称</td>
        <td align="center">统一标题样式</td>
      </tr>
    </table>
  </p>

- **网站流量计数**：引入 [不蒜子](https://www.busuanzi.cc/) 实现无服务器网站流量计数，统计文章访问量。使用 [Bing Webmaster Tools](https://www.bing.com/webmasters) 监控网站总体情况。
  
  <img src="/assets/img/readme/demo9.png">

- **PWA 网站应用支持**：通过 PWA 实现应用化体验，支持快速安装到设备桌面，提供离线访问、推送通知等原生应用功能。
  
  <img src="/assets/img/readme/demo10.png">

- **自定义网站管理工具**：开发了 **Quark 命令行工具**，通过 Python 包形式封装博客管理操作，实现了类似 `quark serve`、`quark push` 等简洁命令，支持动态命令加载和扩展，提升本地管理效率。
  
  <img src="/assets/img/readme/demo11.png">

- **博客文章 RSS 订阅支持**：内置符合标准协议的 RSS 订阅源，可通过主流阅读器实时获取博客更新，支持全文或摘要输出，保障内容同步的及时性与跨平台阅读体验。RSS 订阅地址：[https://lsqkk.github.io/posts/rss.xml](https://lsqkk.github.io/posts/rss.xml)

  <img src="https://cdn.jsdelivr.net/gh/lsqkk/image@main/1770365755714.jpg">


Quark Blog 探索了在静态站点环境下实现动态应用的技术路径，通过实时数据库和无服务架构弥补前后端分离的鸿沟。

## 迁移使用与部署

### 创建你的项目

点击[原项目仓库](https://github.com/lsqkk/lsqkk.github.io)上方 `Use this template` 创建你的新项目并克隆到本地。

### 安装 Quark 并初始化

1. 安装 `Quark` 命令行工具

```bash
# 可选但推荐：创建虚拟环境
python -m venv .venv
.venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt

# 安装 Quark 工具
pip install -e .

# 可选：查看帮助
quark --help
```

2. 初始化项目

这会清除项目中多余的内容（如此模板原作者的个人博文等无关内容）并进行初始化。

```bash
# 初始化
quark initrepo --apply

# 运行服务器并检查
quark serve
```
如果没有报错，则说明项目已经初始化成功，并可在 `localhost:8000` 访问。出现以下页面，则表示已经初始化成功。

![](https://cdn.jsdelivr.net/gh/lsqkk/image@main/20260304165210711.png)

### 自定义配置

1. 修改 `json` 配置目录下的配置项，填入个人信息
  - `friends.json` 友链信息
  - `index_config.json` 调整主页各板块显示与否与显示顺序，更新后需运行`quark index`命令以更新主页
  - `index.json` 你的个人信息及主页展示项等
  - `menifest.json` PWA 应用配置，填入站点信息等
  - `nav.json` 导航栏展示项
  - `popups.json` 主页弹窗展示信息

2. 设置自定义图像

打开 `/assets/img` 目录，更新以下文件：
  - bg.png 网站背景
  - logo_blue.png 和 favicon.ico 网站图标
  - touxiang.png 个人头像

### 博文写作与上传

1. 创建新文章。在 VSCode 终端中使用 `quark new` 创建新文章。如创建失败，请检查`/posts`目录下是否存在名为【当前年】的文件夹，如 `2026` 。如不存在，可手动创建。

2. `quark ppush` 以推送文章。这会自动更新发生改动的所有文章的页面，更新站点地图，并创建一个名为"更新 - 更新了一批文章"的提交记录。【注意：`quark push` 是普通推送，不会渲染文章、更新地图，与此命令不同。】

关于 Quark 工具的其他用法，可 `quark --help` 查看。

### 扩展与二创项目

可以关注 `/template` 中的相关文件。将 `html_template网页模板说明.md`添加为 Skills 后，可保证你的网站新项目在结构和 UI 设计上的统一性。

更新新项目后，可以更新 `/blog/functions.json` 和 `/json/nav.json` 以在网站中显示您的新项目。

### TS说明

本项目支持 TypeScript 检查，可以安装前端类型检查依赖并执行检查。

```bash
npm install
npm run typecheck
npm run check:syntax
```

### 许可证声明

需要注意的是，本仓库使用 GPLv3 协议，此协议支持自由查看、学习、修改、搭建自己的版本，但需保证：
- 在使用我的代码时必须保留我的署名 [lsqkk / 蓝色奇夸克 / Quark](https://github.com/lsqkk)；
- 修改后发布的版本必须继续遵守 GPLv3 协议。

许可证详情见 [LICENSE](LICENSE) 。


---

- **Issues**：反馈 bug 或提出技术建议
- **Discussions**：欢迎交流原生开发、实时协同、无服务架构等技术话题

> 模板作者 Quark

<h3 align="center">「无穷的远方，无数的人们，都和我有关」</h3>

在技术快速迭代的今天，我依然相信深入理解底层原理的价值。这个项目是对原生技术路线的探索，也是对一个静态站点能力边界的挑战。

感谢你的访问，期待在技术的世界里与更多同行者相遇。

<p align="center"> 
  <a href="https://github.com/lsqkk?tab=followers"><img src="https://img.shields.io/github/followers/lsqkk?label=Followers&style=plastic" height="25px" alt="github follow" /></a>
  <a href="https://scholar.google.com/citations?user=lsqkk"><img src="https://img.shields.io/badge/scholar-4385FE.svg?&style=plastic&logo=google-scholar&logoColor=white" alt="Google Scholar" height="25px"></a>
  <a href="mailto:jsxzznz@gmail.com"><img src="https://img.shields.io/badge/gmail-%23D14836.svg?&style=plastic&logo=gmail&logoColor=white" height="25px" alt="Email"></a>
  <a href="https://www.zhihu.com/people/jsxzznz"><img src="https://img.shields.io/badge/知乎-0079FF.svg?style=plastic&logo=zhihu&logoColor=white" height="25px" alt="知乎"></a>
</p>
