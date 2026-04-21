# Astro 页面构建说明

设计或生成新页面前，应先阅读仓库根目录 [AGENTS.md](/AGENTS.md) 与 `src/docs/` 中相关说明，优先以当前代码结构和已有页面实践为准，不延续过时写法。

本文档主要面向 `src/pages/**/*.astro` 新页面，尤其适用于独立功能页、聚合页、工具页、实验页等未使用独立 Layout 的场景。

## 1. 页面放置与资源目录

### 页面路由
- Astro 路由文件放在 `src/pages/`
- 路由目录结构应直接反映最终 URL，例如：
  - `src/pages/tool/demo/index/index.astro` -> `/tool/demo`
  - `src/pages/a/live/assistant.astro` -> `/a/live/assistant`

### 页面专属资源
- 页面专属 JS / CSS / JSON 统一放在 `assets/pages/` 的对应分区中，不要混放到 `src/pages/`
- 当前主要分区：
  - `assets/pages/a/`
  - `assets/pages/blog/`
  - `assets/pages/games/`
  - `assets/pages/tool/`
- 若页面需要构建期读取 JSON，可直接在 frontmatter 中从仓库源目录读取
- 若页面需要运行时读取 JSON，应通过 `fetch('/json/...')` 或静态资源路径真实读取，禁止模拟数据

### 不要手改的目录
- 不要直接修改：
  - `public/`
  - `dist/`
  - `posts/posts.json`
  - `public/json/posts.json`
  - `dist/json/site-pages.json`

## 2. 新页面的默认开发方式

本仓库当前大量页面并未统一套 Layout，而是直接在 `.astro` 中：

1. 在 `---` frontmatter 里读取本地配置或数据
2. 导入背景组件与站点常量
3. 在 `<head>` 中引入公共样式与页面专属样式
4. 通过 `define:vars` 将构建期数据注入到 `window.__XXX__`
5. 在 `<body>` 中放背景、主体容器与页面脚本

因此，新页面默认也应延续这一模式，除非该页明显更适合复用现有 Layout。

同时，在项目读取过程中，如果发现有若干页面可合并一套复用 Layout ，可直接抽离并加以修改。本仓库允许一切提升代码复用的改进。

## 3. Frontmatter 规范

### 建议保留的通用导入

```astro
---
import fs from "node:fs/promises";
import path from "node:path";
import ShichaBackground from "../../../components/ShichaBackground.astro";
import { SITE_TITLE, SITE_LOGO_URL } from "@siteConfig";

const PROJECT_ROOT = process.cwd();
const navConfigPath = path.join(PROJECT_ROOT, "src", "config", "json", "nav.json");
const navConfig = JSON.parse(await fs.readFile(navConfigPath, "utf8"));

const pageTitle = `页面中文名 - ${SITE_TITLE}`;
const pageDescription = `${SITE_TITLE} 的页面描述`;
const currentYear = new Date().getFullYear();
---
```

### 实际约定
- `process.cwd()` 作为仓库根目录起点
- 配置文件优先从源码目录读取，例如：
  - `src/config/json/nav.json`
  - `src/config/json/index.json`
  - `assets/pages/.../*.json`
  - `assets/md/*.md`
  - `posts/posts.json`
- 站点标题与图标统一优先使用 `@siteConfig`
- 页面标题通常写成：
  - `页面名 - ${SITE_TITLE}`
  - `页面名 / EN - ${SITE_TITLE}`
  - `页面名 | 别名 - ${SITE_TITLE}`

### 读取本地数据的建议
- 构建期就确定的数据：在 frontmatter 里 `fs.readFile + JSON.parse`
- 页面首屏必须立即用到的数据：优先构建期注入
- 数据量较大或需要用户操作后再加载：前端脚本中按需 `fetch`
- Markdown 文本若需要预解析，可在 frontmatter 中先处理，再以 `set:html` 输出

## 4. Head 区域通用约定

### 建议包含的基础标签
- `<meta charset="UTF-8" />`
- `<meta name="viewport" content="width=device-width, initial-scale=1.0" />`
- `<title>{pageTitle}</title>`
- `<meta name="description" content={pageDescription} />`
- `<link rel="icon" href={SITE_LOGO_URL} type="image/png" />`
- `<link rel="stylesheet" href="/assets/css/basic.css" />`

### 按需引入的常见资源
- `cursor.css` + `cursor-trail.js`
  - 页面有明显交互、视觉氛围需要统一时可启用
  - 如果页面更强调简洁、专业工具属性，可省略
- `dark-mode.css`
  - 页面包含自定义卡片、输入框、文本块时通常应引入
- `style.css`
  - 首页或沿用全站若干常见样式时再引入
- Font Awesome CDN
  - 页面确实使用 `fa-` 图标时再引入
- `/json/manifest.json`
  - 不是每页都必须引入，但公共页面或入口页可以保留

### `define:vars` 用法
当页面 JS 需要直接消费构建期数据时，优先使用：

```astro
<script is:inline define:vars={{ navConfig, pageData }}>
  window.__NAV_CONFIG__ = navConfig;
  window.__PAGE_DATA__ = pageData;
</script>
```

约定：
- 全局变量命名统一使用大写下划线风格，如 `__NAV_CONFIG__`
- 只注入页面脚本真正需要的数据，避免塞入无关大对象
- 页面脚本中优先读取预载数据，不重复请求

## 5. 背景与整体视觉

### 可用背景
当前仓库主要有两类背景：

1. `ShichaBackground`
   - 适合大部分功能页、聚合页、文章列表页
   - 带有统一视差背景与导航 hover 数据
2. `LuxuryBackground`
   - 适合搜索页、偏内容检索或视觉更轻的页面
   - 通常配合 `body class="luxury-body"`

### 选择建议
- 默认优先 `ShichaBackground`
- 页面本身信息密度较高、输入检索较多、希望减少视差干扰时，可选 `LuxuryBackground`
- 不要自创第三种完全脱离站点风格的背景方案，除非用户明确要求且页面具有独立主题

### 视觉风格要求
- 延续本站 Aero / 玻璃拟态风格
- 常见卡片以浅色高透明、适度模糊、轻圆角为主
- 避免：
  - 蓝紫高饱和渐变
  - 夸张描边和侧边炫光线条
  - 过大的圆角
  - hover 上浮

### 字体与标题
- 不在 `body` 上重新设置 `font-family`
- 页面主标题若使用通用样式，可直接使用 `class="page-title"`
- 标题较正式时推荐写成：`中文名 / ENGLISH`

## 6. Body 结构建议

一个独立页面通常保持以下结构：

```astro
<body>
  <ShichaBackground />

  <div class="container">
    <h1 class="page-title">页面名 / PAGE</h1>
    <section class="glass-card">
      页面主体
    </section>
  </div>

  <script is:inline src="/assets/pages/xxx/xxx.js"></script>
  <script is:inline src="/assets/js/disable-right-click.js"></script>
</body>
```

建议：
- 页面主体用一层语义明确的外壳，如 `container`、`page-shell`、`search-shell`
- 复杂页面可拆成 `section` / `article` / `aside`
- 需要首屏即交互的页面，尽量让主要功能在首屏可见

## 7. 样式与命名规范

### 样式冲突
- `nav.js` 及相关公共样式会使用一部分通用类名
- 避免在页面里再定义过于泛化的类名，例如：
  - `header`
  - `nav`
  - `menu`
  - `title`
  - `button`
- 推荐使用带页面语义前缀的命名，例如：
  - `search-shell`
  - `tool-card`
  - `weather-panel`

### 玻璃卡片参考

```css
.glass-card {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px) saturate(120%);
  -webkit-backdrop-filter: blur(10px) saturate(120%);
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
}
```

说明：
- 数值可按页面调整，不必机械照抄
- 暗色模式下需同步检查边框、文本和阴影层级

### 响应式
- 所有新页面都应至少检查移动端首屏
- 宽布局请加断点处理，不要让卡片在手机上横向溢出
- 长表格、代码块、筛选器要考虑窄屏折叠方式

## 8. 脚本与交互规范

### 页面脚本
- 页面专属脚本放在 `assets/pages/...`
- 公共能力优先复用 `assets/js/` 中已有脚本
- Astro 页面中引入脚本时，优先：

```astro
<script is:inline src="/assets/pages/tool/demo/demo.js"></script>
```

### 右键限制
- 默认可保留：

```astro
<script is:inline src="/assets/js/disable-right-click.js"></script>
```

- 但如果页面涉及用户本地填写密钥、源码自检、透明安全说明等场景，应移除这行，让用户可右键查看源码

### 本地存储
- 未要求接入 Firebase 或服务端时，用户个性化状态可使用 `localStorage`
- 键名要专业、稳定、可读，例如：
  - `quarkWeatherCity`
  - `quarkToolDraft`

## 9. 数据展示约定

### 长列表
若页面展示 50 条以上数据，建议至少补齐以下能力中的一项或多项：
- 分页
- 懒加载
- 搜索 / 筛选
- URL 参数同步，如 `?page=2&tag=Astro`

### 搜索收录与聚合页
如果新页面需要在导航、聚合页或搜索里出现，通常还需要同步更新：
- `assets/pages/blog/functions.json`
- `assets/pages/a/projects.json`
- `assets/pages/games/game.json`
- `assets/pages/tool/tool.json`
- `src/config/json/nav.json`

若修改了这些聚合文件，还应留意：
- 首页
- `/posts`
- `/search`
- 对应聚合页

## 10. 版权与页尾

当页面是独立功能页、工具页或用户能长期访问的正式页面时，可在页尾恰当位置增加版权信息：

```astro
<div class="copyright">
  <a href="/posts/copyright">© 2024 - {currentYear} 页面名 / {SITE_TITLE} All rights reserved.</a>
</div>
```

说明：
- 是否显示页尾版权，取决于页面密度和视觉方案，不强制每页都加
- 若用户明确要求或页面较完整正式，建议添加

## 11. 新页面完成后至少检查

### 必查项
- 页面标题、描述、favicon 是否正确
- 背景是否与站点风格一致
- 移动端是否溢出
- dark mode 下文字与卡片是否可读
- 是否误用生成目录或错误路径
- 是否需要同步聚合 JSON、导航或说明文档

### 建议执行
```bash
npm run build
```

必要时补充：

```bash
npm run typecheck
npm run check:syntax
```

## 12. 推荐工作流

1. 先确认页面应放在 `src/pages` 的哪个路由层级
2. 再规划 `assets/pages/...` 下的专属资源目录
3. 复制 [page_template.astro](/d:/git/lsqkk/lsqkk.github.io/src/docs/page_template/page_template.astro) 作为初始模板
4. 按页面是否需要构建期数据，决定 frontmatter 读取内容
5. 按页面定位选择 `ShichaBackground` 或 `LuxuryBackground`
6. 接入脚本、样式、预载数据
7. 检查聚合页、搜索与构建结果

若新增的是可复用页面模式，也应顺手更新本目录文档或模板，避免后续继续复制旧写法。
