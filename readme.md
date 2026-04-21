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
  <img src="https://img.shields.io/badge/Astro-FF5D01?style=flat&logo=astro&logoColor=white" alt="Astro">
  <img src="https://img.shields.io/badge/Vercel-000000?style=flat&logo=vercel&logoColor=white" alt="Vercel">
  <img src="https://img.shields.io/badge/Node.js-339933?style=flat&logo=nodedotjs&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/Python-3776AB?style=flat&logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/GitHub%20Pages-222222?style=flat&logo=githubpages&logoColor=white" alt="GitHub Pages">
</p>

一个基于 Astro 5 构建的静态 + 动态结合博客站点模板，同时也是[@蓝色奇夸克](https://github.com/lsqkk) 的个人网站仓库。静态页面由 GitHub Pages 托管，动态能力通过独立的 Vercel Serverless API 提供，前端交互以原生 JavaScript、Canvas、WebRTC 和 Firebase RTDB 为核心。


**网站演示**：[夸克博客](https://lsqkk.github.io)


## 项目特点

- Astro 5 + Markdown + `astro:content` 驱动内容页与静态构建
- 原生 JavaScript 为主，保留轻量运行时与较强浏览器可控性
- GitHub Pages 托管静态站点，Vercel 仅承接 `/api` Serverless
- Firebase RTDB 支持留言、评论、在线状态、实时互动等动态能力
- 支持 GitHub OAuth、站内账号、Turnstile、人机验证、邮件验证码等认证能力
- 提供自定义、可扩展的 Quark CLI，封装构建、文章创建、日志更新与推送流程

> 更多技术细节及本站使用服务清单，欢迎查看[更新日志](/assets/md/log.md)、[Agent文档](AGENTS.md)以及[关于本站](/posts/copyright.md)。

## 技术架构

本仓库不是“单平台一键部署”的常见纯静态模板，而是分成两部分运行：

1. GitHub Pages 负责部署 Astro 构建产物 `dist/`
2. Vercel 负责部署根目录 `api/` 下的 Serverless 函数
3. 前端通过 `src/config/json/api.json` 中的 `apiBase` 指向你的 API 域名

这意味着迁移时至少要完成两件事：

- 把静态站点部署到你自己的 GitHub Pages 或其他静态托管
- 把本仓库导入到你自己的 Vercel 项目，并补齐所需环境变量

## 快速开始

### 如何迁移使用与部署

完整的迁移部署说明见于以下文档：

- [迁移部署指南](src/docs/迁移部署说明.md)
- [构建与数据产物说明](src/docs/构建与数据产物说明.md)
- [Serverless API 说明](src/docs/API/README.md)

它们将涉及GitHub Pages 静态部署、Vercel Serverless 导入与环境变量配置、`API_BASE`绑定域名、第三方服务接入等。

如果你只是想先跑通一个“只含静态博客页面”的版本，可以先按照以下步骤完成本地构建和 GitHub Pages 部署。但只要你需要评论、留言、登录、数据库、上传或其他动态功能，就必须继续完成 Vercel Serverless 与相关环境变量配置。

### 本地初始化

点击本项目仓库上方 `Use this template` 或直接 `Fork` 创建你的新项目并**克隆到本地**。推荐使用 **VSCode** 管理项目，下述 Quark 工具部分功能（如文章快捷创建）依赖 VSCode 实现。

```bash
# 可选但推荐：创建虚拟环境
python -m venv .venv
.venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt

# 安装 Quark CLI
pip install -e .

# 可选：查看帮助
quark --help

npm install
pip install -r requirements.txt
pip install -e .
```

### 本地构建与预览

```bash
npm run build
quark serve
```

或使用 Quark CLI:

```bash
quark build
quark serve
```

访问 `http://localhost:8000`，若页面正常渲染，说明本地构建链路可用。

### 常用命令

```bash
quark new          # 新建文章
quark build        # 完整构建
quark serve        # 预览 dist
quark updatelog    # 根据 Git 提交刷新日志

npm run build
npm run typecheck
npm run check:syntax
```

### 配置入口

常见站点配置集中于 `src/config/json/`:

- `api.json`: 前端注入的 API 基地址
- `nav.json`: 导航、标题、GitHub OAuth 地址、Turnstile site key
- `index.json`: 首页个人信息与展示数据
- `index_config.json`: 首页板块开关与排序
- `friends.json`: 友链数据
- `manifest.json`: PWA 配置
- `popups.json`: 首页弹窗配置

站点图片资源主要位于 `assets/img/`，需要替换:

- `bg.png`
- `logo_blue.png`
- `favicon.ico`
- `touxiang.png`


## 项目目录概览

```text
.
├── api/                 # Vercel Serverless 函数
├── assets/              # 静态资源源目录
├── posts/               # 博文源码与生成数据
├── public/              # 构建前同步产物，不建议手改
├── src/
│   ├── components/
│   ├── config/json/
│   ├── docs/
│   ├── layouts/
│   ├── pages/
│   └── utils/
├── scripts/             # 构建与同步脚本
├── quark/               # Python CLI
├── dist/                # Astro 构建产物
└── vercel.json          # Vercel 仅承接 API，不负责静态构建
```

## 许可证

需要注意的是，本仓库使用 GPLv3 协议，此协议支持自由查看、学习、修改、搭建自己的版本，但需保证：
- 在使用我的代码时必须保留我的署名 [lsqkk / 蓝色奇夸克 / Quark](https://github.com/lsqkk)；
- 修改后发布的版本必须继续遵守 GPLv3 协议。

许可证详情见 [LICENSE](LICENSE) 。

## 支持与反馈

如果你喜欢这个网站的思路或实现，欢迎**点亮右上角的 star ⭐！**

如果你还对其技术架构感兴趣，也欢迎你：

- **Issues**：反馈 bug 或提出技术建议
- **Discussions**：欢迎交流原生开发、实时协同、无服务架构等技术话题

---

<h3 align="center">「无穷的远方，无数的人们，都和我有关」</h3>

<p align="center"> 
  <a href="https://github.com/lsqkk?tab=followers"><img src="https://img.shields.io/github/followers/lsqkk?label=Followers&style=plastic" height="25px" alt="github follow" /></a>
  <a href="https://scholar.google.com/citations?user=lsqkk"><img src="https://img.shields.io/badge/scholar-4385FE.svg?&style=plastic&logo=google-scholar&logoColor=white" alt="Google Scholar" height="25px"></a>
  <a href="mailto:jsxzznz@gmail.com"><img src="https://img.shields.io/badge/gmail-%23D14836.svg?&style=plastic&logo=gmail&logoColor=white" height="25px" alt="Email"></a>
  <a href="https://www.zhihu.com/people/jsxzznz"><img src="https://img.shields.io/badge/知乎-0079FF.svg?style=plastic&logo=zhihu&logoColor=white" height="25px" alt="知乎"></a>
</p>