# AGENTS.md - 夸克博客项目仓库

Agent 应在必要时更新本文件，但必须非常慎重，确保内容与仓库现状一致。若发现文档与代码不符，应优先修正文档中的错误描述，而不是延续旧说法。

- 应检查 `/src/docs/dev` 是否有未完成的 BUG 修复或功能更新任务
- 在进行重大架构调整或引入了新的第三方服务/API等情况下，应同步更新`/posts/copyright.md`
- 同样，在必要时检视项目介绍文档 `README.md` 并更新
- 根据下述要求，在必要时于项目说明文档 `/src/docs` 处或其他合适位置更新、新建说明文档

## 项目概述
- **项目名称**：夸克博客
- **简介**：基于 Astro 构建的静态 + 动态结合博客网站
- **仓库地址**：https://lsqkk.github.io
- **本地地址**：`D:\git\lsqkk\lsqkk.github.io`

## 技术栈
- **框架**：Astro 5
- **内容系统**：Markdown + `astro:content`
- **包管理器**：npm
- **部署平台**：
  - GitHub Pages 托管静态站点
  - Vercel 仅用于 `/api` serverless，不负责本站静态构建
- **数据库**：Firebase Realtime Database (RTDB)
- **网站登录认证**：GitHub OAuth + 站内账号
- **前端技术**：原生 JavaScript (ES6+)、Canvas、WebRTC、CSS3、少量 TypeScript
- **后端语言**：Node.js (Vercel Serverless)、Python (Quark CLI)

## 目录结构
```text
lsqkk.github.io/
├── api/                         # Vercel serverless 函数
├── assets/                      # 主静态资源源目录（构建时复制到 public/assets）
│   ├── css/                     # 公共样式
│   ├── js/                      # 公共脚本与共享逻辑
│   ├── md/                      # 运行时会读取的 Markdown 数据，如 dt.md / log.md
│   ├── pages/                   # 各功能页专属资源（a/blog/games/tool）
│   ├── img/                     # 背景、logo、头像等图片
│   └── ...
├── posts/                       # 博客文章源文件与生成产物 posts.json / rss.xml
├── public/                      # 构建前同步出的公共静态目录（生成目录，不建议手改）
├── src/
│   ├── components/              # Astro 组件
│   ├── config/
│   │   ├── json/                # 站点配置源
│   │   └── site.js              # 从配置中派生站点标题 / logo / 背景
│   ├── docs/                    # 项目说明文档
│   │   ├── API/                 # serverless 与密钥相关文档
│   │   ├── dev/                 # 待修复的 BUG 和待实现的功能新增或修改
│   │   └── page_template/       # 页面模板与样式规范
│   ├── layouts/                 # 页面布局，如 Post/OJ/FireAlert/RealtimeRoom
│   ├── pages/                   # Astro 路由页面
│   └── utils/                   # 构建与页面工具函数
├── scripts/                     # Node 构建/同步/校验脚本
├── quark/                       # Python CLI 与配置编辑器
├── private/                     # 本地私有辅助文件，已 gitignore，不应提交
├── dist/                        # Astro 构建产物
├── .quark-artifact/             # quark build --mode artifact 导出的额外产物
├── astro.config.mjs             # Astro 配置与构建后注入逻辑
├── package.json
├── pyproject.toml               # quark CLI 包定义
├── requirements.txt
└── vercel.json                  # Vercel 仅保留 API，不做静态站点构建
```

## 关键事实与维护约定

### 1. 项目文档
- 添加或修改功能后，优先在以下位置补充说明：
  - `src/docs/xxx.md`
  - `src/docs/API/`
  - `src/docs/page_template/`

### 2. 生成目录与禁止手改项
- 以下目录/文件主要由构建或脚本生成，除非明确在修生成逻辑，否则不要直接手改：
  - `public/`
  - `dist/`
  - `.quark-artifact/`
  - `posts/posts.json`
  - `posts/rss.xml`
  - `public/json/posts.json`
  - `dist/json/site-pages.json`

### 3. 私有目录与敏感信息
- `private/` 已被 `.gitignore` 忽略，用于本地私有脚本和中间数据，不应纳入提交。
- `.env`、`.env.local` 等环境变量文件不提交。
- `src/config/json/api.json` 只保存 API 基础地址，不存放真正密钥。

## 构建与开发

### npm 构建链路
运行 `npm run build` 时，实际顺序为：

1. `prebuild`
2. `gen:posts-json`：扫描 `posts/**/*.md` 生成 `posts/posts.json`
3. `gen:rss`：基于 `posts/posts.json` 生成 `posts/rss.xml`
4. `sync:public`：将 `assets/`、`src/config/json/` 等同步到 `public/`
5. `astro build`
6. `postbuild`
7. `verify-dist`：检查 `dist/index.html` 等关键产物是否存在

补充说明：
- `scripts/sync-public.mjs` 会把 `src/config/json/*.json` 暴露到 `public/json/`
- `scripts/sync-public.mjs` 会把 `posts/posts.json` 复制到 `public/json/posts.json`
- `astro.config.mjs` 会在构建结束后继续处理 `dist/`，包括：
  - 将 `__API_BASE__` 注入文本产物
  - 生成 `dist/json/site-pages.json`，供站内搜索和页面索引使用

详细说明见：`src/docs/构建与数据产物说明.md`

### Quark CLI
`quark` 是项目自定义 Python CLI，已通过 `pip install -e .` 安装。

常用命令：
- `quark build`：执行完整构建流程；默认 `source` 模式，只生成 `dist`
- `quark build --mode artifact`：额外导出 `.quark-artifact/`（不推荐使用）
- `quark serve`：启动本地 `dist` 预览，默认端口 `8000`
- `quark new`：创建文章；支持 `--draft`
- `quark updatelog`：根据 Git 提交记录更新 `assets/md/log.md`，默认从现有日志最新日期开始刷新
- `quark ppush`：构建并推送
- `quark push`：普通推送，不构建
- `quark updateposts`：兼容别名，当前实际转到 `quark build`
- `quark config`：启动 JSON 配置编辑器 Web UI
- `quark checkassets`：检查 `assets/css`、`assets/js` 是否被页面引用

### 本地开发
```bash
npm install
pip install -r requirements.txt
pip install -e .

npm run build
quark serve
```

## 内容与数据源

### 博客文章
- 文章源文件位于 `posts/`
- 文章路由由 `src/pages/posts/[...slug].astro` 处理
- 文章通过 `astro:content` 加载，同时读取 `posts/posts.json` 中的封面等派生数据
- 文章支持以下 frontmatter 字段：
  - `title`
  - `description`
  - `date`
  - `tags`
  - `column` / `columns` / `专栏`
- 路由额外做了 slug 大小写兼容：见 `src/utils/post-case-map.ts`

### 动态与日志
- `assets/md/dt.md`：动态内容源，构建与运行时均会读取
- `assets/md/log.md`：更新日志源，首页“最近更新”和日志页会使用
- 更新日志推荐通过 `quark updatelog` 维护；旧 `assets/md/commits.py` 仅保留为兼容转发入口
- 动态解析逻辑见 `src/utils/dynamic-entries.ts`
- 动态详情页为 `src/pages/blog/dt/[id].astro`

### 搜索
- `src/pages/search/index.astro` 会在构建时预载文章与动态全文索引
- 前端脚本 `assets/js/site-search.js` 会同时读取：
  - `/json/site-pages.json`
  - `/json/posts.json`
  - 站点地图 `sitemap*.xml`
- 因此若修改构建链路、页面收录逻辑或文章元数据，需留意搜索是否仍可工作

### 评论与互动
- 文章页底评论系统使用 Giscus 评论：`src/layouts/PostLayout.astro`
- 留言板、动态评论、文章段落讨论、首页留言预览等功能依赖 Firebase RTDB 与共享评论脚本：
  - `assets/js/comment-shared.js`
  - `assets/js/comment-render-shared.js`
  - `assets/js/message.js`
  - `assets/js/dynamic-interactions.js`
- `src/components/DynamicCommentPanel.astro` 是动态详情页评论输入组件

## 重要配置文件说明

### `src/config/json/`
| 文件 | 用途 |
|------|------|
| `api.json` | API 基础地址，构建时注入 `__API_BASE__` |
| `city-banter.json` | 首页 IP 欢迎语 / 地域化问候语数据 |
| `friends.json` | 友链信息 |
| `index_config.json` | 首页主区、侧栏、页脚板块显隐与顺序 |
| `index.json` | 主页个人信息、联系方式、公告、展示数量等 |
| `manifest.json` | PWA 配置 |
| `nav.json` | 导航栏、标题、logo 等 |
| `popups.json` | 首页弹窗信息 |

### 其他关键文件
- `astro.config.mjs`：Astro 配置、Markdown 插件、构建后注入、`site-pages.json` 生成
- `src/content.config.ts`：文章 collection schema
- `src/config/site.js`：从配置派生站点标题 / logo / 背景
- `vercel.json`：Vercel 明确跳过静态构建，只承接 API

## 页面与资源约定

### 新建页面/组件
- 页面模板与 UI 规范参考：
  - `src/docs/page_template/page_template.astro`
  - `src/docs/page_template/astro页面构建说明.md`
- 本仓库遵循统一的 Aero / 玻璃拟态视觉风格，新增页面应尽量保持导航、字体、背景、视差体验一致

### 专属资源目录
- 各项目页的专属 JS/CSS/JSON 统一放在 `assets/pages/`
- 当前主要分区：
  - `assets/pages/a/`：实验室 / 账号 / 实时应用
  - `assets/pages/blog/`：动态、留言板、视频、友链等
  - `assets/pages/games/`：游戏页
  - `assets/pages/tool/`：工具页

### 添加新项目到网站
若新增页面需要在导航或聚合页中显示，通常还要同步更新：
- `assets/pages/blog/functions.json`
- `assets/pages/a/projects.json`
- `assets/pages/games/game.json`
- `assets/pages/tool/tool.json`
- `src/config/json/nav.json`

注意：
- 构建后会生成 `/json/nav.json`
- 搜索页与 `site-pages.json` 也会基于这些聚合文件补充站点页面条目

## serverless 函数说明
详见 `src/docs/API/`，当前包含：
- `README.md`
- `安全验证Turnstile说明.md`
- `管理员密钥调用说明.md`
- `天地图密钥调用说明.md`
- `firebaseRTDB配置调用说明.md`
- `GitHub令牌调用说明.md`
- `R2上传与图床说明.md`

补充说明：
- `api/github-user.js` 用于 GitHub OAuth 回调换取用户信息，前端入口页为 `src/pages/auth.astro`
- `api/firebase-config.js` 会在前端以脚本方式加载 Firebase 公共配置

## TypeScript 策略
- 采用渐进式 TS 工程化：`@ts-check + JSDoc + globals.d.ts`
- 详细规范见：`src/docs/TypeScript规范说明.md`
- 类型检查命令：
```bash
npm run typecheck
npm run check:syntax
```

## 提交与测试

### 构建测试
在涉及代码修改后，至少执行：
```bash
npm run build
```

必要时补充：
```bash
npm run typecheck
npm run check:syntax
```
### Git 提交规范
推荐使用以下前缀：
- `更新 - 更新描述`
- `优化 - 优化描述`
- `修复 - 修复描述`
- 其他前缀按实际情况补充

在代码更改已完成并确认无问题（历史现存的无关问题可忽略）后，应当按上述commit格式约定提交一次commit，纳入所有涉及的工作区改动。

## Agent 工作提醒
1. 优先相信代码与当前目录结构，不要延续旧文档中的过时路径。
2. 若修改了构建脚本、JSON 配置结构、聚合数据文件或路由，应同步检查：
   - 首页
   - `/posts`
   - `/search`
   - 相关功能聚合页
3. 若新增可复用约定或修复了容易误判的结构，优先补充 `AGENTS.md` 或 `src/docs/`。
4. 不要把 `private/`、`.env`、`public/`、`dist/` 当作普通源码目录处理。