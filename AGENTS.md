# AGENTS.md - 夸克博客项目仓库

Agent 应在必要时更新修改此文档，但必须非常慎重，以确保其准确性。

## 项目概述
- **项目名称**：夸克博客
- **简介**：基于 Astro 构建的静态+动态结合博客网站
- **仓库地址**：https://lsqkk.github.io
- **本地地址**：D:\git\lsqkk\lsqkk.github.io

## 技术栈
- **框架**：Astro
- **文章格式**：Markdown
- **包管理器**：npm
- **部署平台**：Vercel 提供 serverless 服务以部署`/api`，GitHub Pages 托管本项目静态站点
- **数据库**：Firebase Realtime Database (RTDB)
- **网站登录认证**：GitHub OAuth + 站内账号
- **前端技术**：原生 JavaScript (ES6+)、Canvas、WebRTC、CSS3
- **后端语言**：Node.js (Vercel Serverless)、Python (Quark CLI)

## 目录结构
```
lsqkk.github.io/
├── api/                 # serverless函数，部署在vercel（github同账号登录）
├── assets/              # 静态资源
│   ├── js/              # 公共js资源
│   ├── css/             # 公共css资源
│   ├── ......           # 其他类型资源
│   ├── pages/           # /arc/pages具体某项目专属资源，和其目录对应
│   ├── img/             # 图片资源（bg.png, logo_blue.png, favicon.ico, touxiang.png）
│   └── md/              # 部分项目使用的markdown文件等（log.md更新日志[不需要agents更新]、dt.md动态等）
├── posts/               # markdown博客文章位置（按年份分子文件夹如2026/）
├── src/
│   ├── components/      # 可复用的 Astro 组件
│   ├── config/
│   │   ├── json/       # 配置文件目录
│   │   │   ├── friends.json      # 友链信息
│   │   │   ├── index_config.json # 主页板块显示配置
│   │   │   ├── index.json        # 个人信息及主页展示项
│   │   │   ├── manifest.json     # PWA应用配置
│   │   │   ├── nav.json          # 导航栏展示项
│   │   │   ├── popups.json       # 主页弹窗展示信息
│   │   │   └── ......            # 更多文件
│   │   ├── site.js
│   │   └── docs/       # 说明文档，添加或修改功能后更新此处
│   │       ├── API/               # serverless等说明文件
│   │       ├── debug/             # debug重要记录
│   │       └── page_template/     # 一般性页面结构模板
│   ├── layouts/         # 页面布局组件（BaseLayout、PostLayout）
│   ├── pages/           # 路由页面（.astro文件，基于文件路由）
│   └── utils/           # 工具函数（日期格式化、标签处理等）
├── public/              # 公共静态资源
├── dist/                # 构建产物目录
├── quark/               # quark命令行工具安装包
├── astro.config.mjs     # Astro 配置文件
├── tsconfig.json        # TypeScript 配置
├── package.json
├── requirements.txt     # Python依赖
└── .env                 # 环境变量（不提交到仓库）
```

## 构建与开发

### 构建链路
1. 运行 `npm run build` 或 `quark build`
2. 构建过程：先处理 public 目录，然后生成 posts.json，最后 Astro 构建输出到 dist
3. 部署内容为 dist 目录

### TypeScript策略
- 采用渐进式 TS 工程化：`@ts-check + JSDoc + globals.d.ts`
- 类型检查命令：
  ```bash
  npm run typecheck
  npm run check:syntax
  ```

### 本地开发
```bash
# 安装前端依赖（首次）
npm install

# 本地构建站点
quark build          # 默认source模式
quark build --mode artifact  # 导出可分发产物（已废弃，勿使用）

# 预览dist
quark serve          # 启动 localhost:8000
```

## quark 命令行工具
quark 是一个自定义的 Python 命令行工具，通过 `pip install -e .` 安装

### 常用命令
- `quark build` - 构建站点（默认source模式）
- `quark serve` - 启动预览服务器
- `quark new` - 在 VSCode 中创建新文章（需在VSCode终端执行）
- `quark ppush` - 推送文章（自动执行构建并创建提交记录）
- `quark push` - 普通推送（不构建站点）
- `quark --help` - 查看帮助

### 文章创建注意事项
- 需要 `/posts` 目录下存在以**当前年份**命名的文件夹（如 `2026`）
- 如不存在需手动创建

## 项目代码风格与约定

### 新建页面/组件
- 参考 `/src/config/docs/page_template/` 中的模板文件
- 提供 `.astro` 模板和 `astro页面构建说明.md`

### UI设计规范
参考 `astro页面构建说明.md` 实现效果。
- 统一 Windows 7 经典 Aero 模糊玻璃主题
- 全站统一顶部导航、字体、标题样式
- 深浅色切换跟随系统
- 视差滚动效果

### 添加新项目到网站
更新以下文件以在网站中显示新项目：
- `/assets/pages/blog/functions.json`
- `/src/config/json/nav.json`（构建后生成 `/json/nav.json`）
- 在 `/tool` 、 `/games` 和 `/a` 目录更新项目后，应更新对应json文件

## serverless 函数说明
详见 `/src/config/docs/API/` 目录，目前包含以下文档：
- 安全验证 Turnstile 说明.md
- 管理员密钥调用说明.md
- 天地图密钥调用说明.md
- 总：API 无服务器函数说明.md
- firebaseRTDB 配置调用说明.md
- GitHub 令牌调用说明.md
- R2 上传与图床说明.md

可按需查找对应文档了解具体实现。

## 重要配置文件说明

### JSON 配置文件（`/src/config/json/`）
| 文件 | 用途 |
|------|------|
| `friends.json` | 友链信息 |
| `index_config.json` | 调整主页各板块显示与否与显示顺序 |
| `index.json` | 个人信息及主页展示项 |
| `manifest.json` | PWA应用配置，填入站点信息 |
| `nav.json` | 导航栏展示项 |
| `popups.json` | 主页弹窗展示信息 |

### 自定义图像（`/assets/img/`）
- `bg.png` - 网站背景
- `logo_blue.png` 和 `favicon.ico` - 网站图标
- `touxiang.png` - 个人头像

## Git 提交规范
commit 使用以下命名方法：
- `更新 - 更新描述`
- `优化 - 优化描述`
- `修复 - 修复描述`
- 其他前缀根据实际情况添加

## 测试
修改后须运行 `npm run build` 并等待构建完成，检查产物是否正确生成。

## 其他重要注意事项
1. 构建产物位于 `dist` 目录，Github Pages部署时将部署此目录
2. GitHub Pages 推荐使用仓库内置工作流 `.github/workflows/deploy-pages.yml` 在远端构建并部署
3. 网站地图由 Astro 构建自动生成