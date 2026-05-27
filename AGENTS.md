# AGENTS.md - 夸克博客项目仓库

Agent 应在必要时更新本文件，但必须非常慎重，确保内容与仓库现状一致。若发现文档与代码不符，应优先修正文档中的错误描述，而不是延续旧说法。

- 应检查 `/src/docs/dev` 是否有未完成的 BUG 修复或功能更新任务
- 在进行重大架构调整或引入了新的第三方服务/API等情况下，应同步更新`/posts/copyright.md`
- 同样，在必要时检视项目介绍文档 `README.md` 并更新
- 根据下述要求，在必要时于项目说明文档 `/src/docs` 处或其他合适位置更新、新建说明文档

## 项目概述
- **项目名称**：夸克博客
- **简介**：基于 Astro 构建的静态 + 动态结合博客网站
- **仓库地址**：https://github.com/lsqkk/lsqkk.github.io
- **网站地址**：https://lsqkk.github.io
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
- **前端技术**：原生 JavaScript (ES6+、@ts-check + JSDoc)、Canvas、WebRTC、CSS3、TypeScript（渐进式）
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
│   │   ├── 页面与功能/           # 页面功能相关文档
│   │   ├── dev/                 # 待修复的 BUG 和待实现的功能新增或修改
│   │   ├── UI/                  # 可复用的界面风格与布局规范
│   │   └── page_template/       # 页面模板与样式规范
│   ├── layouts/                 # 页面布局，如 Post/OJ/FireAlert/RealtimeRoom
│   ├── pages/                   # Astro 路由页面
│   └── utils/                   # 构建与页面工具函数（如 home-utils.ts、dynamic-entries.ts 等）
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
  - `src/docs/UI/`
  - `src/docs/page_template/`

### 2. 生成目录与禁止手改项
- 以下目录/文件主要由构建或脚本生成，除非明确在修生成逻辑，否则不要直接手改：
  - `public/`
  - `dist/`
  - `.quark-artifact/`
  - `posts/posts.json`
  - `posts/rss.xml`
  - `public/json/posts.json`
  - `public/assets/js/fa-icons.js`
  - `public/assets/js/fa-icons.json`
  - `dist/json/site-pages.json`

### 3. 私有目录与敏感信息
- `private/` 已被 `.gitignore` 忽略，用于本地私有脚本和中间数据，不应纳入提交。
- `.env`、`.env.local` 等环境变量文件不提交。
- `src/config/json/api.json` 只保存 API 基础地址，不存放真正密钥。

## 硬编码预防规范（新增/修改代码时必读）

### 核心原则

任何可能因环境、部署、用户或时间变化的值，都不应硬编码在代码中。

### 三步自查流程

新增或修改代码时，按此顺序检查每个值：

**第一步：是否已有对应的 config JSON？**
- 检查 `src/config/json/` 目录下是否有合适的配置文件
- 这些文件在构建时通过 `scripts/sync-public.mjs` 自动同步到 `public/json/`，前端可通过 fetch(`/json/xxx.json`) 读取
- 优先在现有配置文件中新增字段，而不是新建文件

**第二步：是否需要在 Astro 模板/服务端使用？**
- 通过 `src/config/site.js` 导出（构建时读取 config JSON 生成）
- 在 Astro 组件中 `import { XXX } from "@siteConfig"` 使用
- 示例：`PostLayout.astro` 中读取 `SITE_URL`、`AUTHOR_NAME` 等

**第三步：是否需要在浏览器端 JS 中使用？**
- 方案 A（推荐）：使用 `__API_BASE__` 占位符，构建时自动注入实际值
  - 在 JS 文件中写 `const BASE = "__API_BASE__";`
  - `astro.config.mjs` 和 `scripts/sync-public.mjs` 都会在构建后替换为 `api.json` 中的 `apiBase`
- 方案 B：使用 `define:vars` 在 Astro 模板中传递
  - 在 Astro 页面中 `<script define:vars={{ myValue }}>` 注入
  - 适用于 Astro 构建时可获取的值
- 方案 C：运行时从 `/json/*.json` fetch
  - 适用于运行时可以异步获取的配置
  - 例：`fetch('/json/giscus.json')`

### 什么必须进 config JSON

| 类型 | 示例 | 存放位置 |
|------|------|----------|
| API 地址 | `https://api.130923.xyz` | `api.json` → `apiBase` |
| 站点 URL | `https://lsqkk.github.io` | `api.json` → `siteUrl`（或 `site.js` 硬编码底线） |
| OAuth 相关 | GitHub OAuth client ID | 环境变量（不提交），通过 serverless 使用 |
| 用户标识 | Bilibili UID `2105459088` | `index.json` 的 `socialLinks` |
| 第三方服务配置 | Giscus repo/category ID | `giscus.json` |
| 评论系统主题 | Giscus theme | `giscus.json` |
| 站点导航 | 导航栏标题、链接 | `nav.json` |
| 个人信息 | 昵称、简介、头像 | `index.json` |
| 友链 | 朋友博客链接 | `friends.json` |
| PWA 配置 | manifest 字段 | `manifest.json` |
| 字体配置 | 字体族、来源 | `font.json` |
| 弹窗 | 首页弹窗内容 | `popups.json` |
| CORS 域名列表 | 允许的跨域来源 | `api/_cors.js` 的 `ALLOWED_DOMAINS` / `ALLOWED_ORIGINS` |

### 什么可以硬编码（底线值）

- `src/config/site.js` 中的 fallback 字符串（当 config JSON 读取失败时的兜底）
- CSS 中的视觉设计值（颜色变量已在 `tokens.css` 中定义，不应再硬编码颜色值）
- CDN 静态资源 URL（如 KaTeX、highlight.js 等，更换成本较高）

### 新增 API serverless 函数的约束

- Vercel 免费版 = 最多 12 个 serverless 函数
- 纯配置数据 → 放在 `src/config/json/`，不要使用 serverless 函数
- 新增 API 文件必须复用 `api/_cors.js` 中的 CORS 函数：
  - `allowOrigin(req, res, origins?)` — 精确 origin 匹配，用于 admin-auth 等需要严格控制的 API
  - `resolveOrigin(req, domains?)` — host 匹配（返回允许的 origin 或空字符串），用于 db、github-user 等
- 不要新建 serverless 函数来提供配置数据

### 构建时注入的两个占位符

| 占位符 | 注入来源 | 注入阶段 |
|--------|----------|----------|
| `__API_BASE__` | `api.json` → `apiBase` | `sync-public` 脚本 + `astro build` |
| `__SHICHA_BACKGROUND__` | `index.json` → `Background` | `sync-public` 脚本 |

如果要新增类似的构建时变量注入，在 `scripts/sync-public.mjs` 和 `astro.config.mjs`（如果涉及 Astro 构建产物）中同步添加替换逻辑。

### 新增配置字段的注意事项

- `src/config/json/` 新增或修改字段后，需要同步更新 Quark CLI Web UI 以保持功能正常
- 配置文件中的字段名尽量使用 camelCase 英文命名
- 提供有意义的默认值/fallback，避免因配置文件缺失导致构建失败

## 构建与开发

### npm 构建链路
运行 `npm run build` 时，实际顺序为：

> **注意**：build 输出每个页面的详细日志（270+ 行）会浪费 token，因此 `npm run build` 的输出应通过 `grep -iE "(error|warn|\bcompleted\b|✓|built in)"` 过滤，只保留关键行。完整原始输出仅在调试构建失败时使用。

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
- 构建使用 LightningCSS 压缩 CSS（通过 `vite.build.cssMinify: "lightningcss"` 配置）

详细说明见：`src/docs/构建与数据产物说明.md`

### Quark CLI
`quark` 是项目自定义 Python CLI，已通过 `pip install -e .` 安装。

常用命令：
- `quark build`：执行完整构建流程；默认 `source` 模式，只生成 `dist`
- `quark build --mode artifact`：额外导出 `.quark-artifact/`（不推荐使用）
- `quark serve`：启动 Astro 开发服务器（HMR 热更新），默认端口 `4321`
- `quark new`：创建文章；支持 `--draft`
- `quark updatelog`：根据 Git 提交记录更新 `assets/data/log.json`，默认从现有日志最新日期开始刷新
- `quark ppush`：构建并推送
- `quark push`：普通推送，不构建
- `quark updateposts`：兼容别名，当前实际转到 `quark build`
- `quark web`：启动管理面板 Web UI
- `quark qqexport`：自动同步 qq 动态到博客动态
- `quark pic`：上传图片到 Cloudflare R2 图床，默认上传 `/private/pic/` 下的图片，支持 `--naming md5|ts|original` 三种命名模式，上传后自动移至 `/private/pic_done/`
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
- `assets/data/dt.json`：动态内容源，构建与运行时均会读取
- `assets/data/log.json`：更新日志源，首页”最近更新”和日志页会使用
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

当新增或修改此目录下配置项类别时，应同步修改Quark Web UI以保证功能正常。

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
- 若涉及首页、聚合列表、侧栏等扁平玻璃风格改造，优先参考：
  - `src/docs/UI/FlatUI.md`
- 本仓库遵循统一的 Aero / 玻璃拟态视觉风格，新增页面应尽量保持导航、字体、背景、视差体验一致

### CSS 架构说明（2025-05 重构）
- **`dark-mode.css` 已合并到 `tokens.css` 并删除源文件**：所有暗色模式样式已迁移到 `tokens.css` 底部，`dark-mode.css` 源文件已删除
  - 新页面只需引入 `basic.css`（已 `@import tokens.css`），暗色模式通过 CSS 变量自动生效
  - 不要在 Astro 页面中引用 `dark-mode.css`，它已不存在
- **CSS 变量优先**：避免硬编码颜色值，使用 `tokens.css` 中定义的 `var(--accent)`、`var(--surface)`、`var(--text-main)` 等变量
- 渐变色等场景可使用 `color-mix(in srgb, var(--accent) 12%, transparent)` 代替 `rgba` 硬编码

### JS 依赖说明（2025-05 重构）
- **jQuery 已移除**：页面不再依赖 jQuery，旧有 `social-share.js` 已替换为原生分享按钮
- 公共脚本仍在 `assets/js/` 中，页面专属脚本在 `assets/pages/` 中
- 新页面优先使用原生 ES 模块，避免引入第三方库

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
- 当前 9 个核心脚本已纳入类型检查（见 `jsconfig.json` include 列表）
- `globals.d.ts` 覆盖了所有 window 全局属性（Firebase、marked、DynamicGallery 等）
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
4. 若修改首页、文章列表、侧栏聚合区等页面的结构与视觉层级，优先检查 `src/docs/UI/FlatUI.md` 是否也需要同步更新。
5. 不要把 `private/`、`.env`、`public/`、`dist/` 当作普通源码目录处理。
