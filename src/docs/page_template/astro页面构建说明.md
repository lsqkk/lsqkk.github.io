# Astro 页面构建

页面文件位于 `src/pages/`，专属静态资源位于 `assets/pages/`，共享资源位于 `assets/css/` 和 `assets/js/`。

## 先选择现有布局

- 文章使用 `PostLayout.astro`，内容进入 `posts/` 和 Astro 内容集合。
- 工具、游戏、实验室和功能导航目录使用 `CatalogLayout.astro`。
- 实时房间优先核对 `RealtimeRoomLayout.astro` 及已有房间实现。
- 独立交互应用可使用单独页面，复用导航、站点配置与主题令牌。

[基础模板](page_template.astro)在文档目录中，不参与路由。复制后调整相对导入、页面名称与真实资源；模板本身不引用不存在的 demo JS/CSS。

## 路由和配置

当前生产配置是 `build.format: "file"`。例如 `src/pages/tool/example/index/index.astro` 输出 `tool/example/index.html`，供 `/tool/example/` 访问。开发模式通过适配处理目录入口，生产验收仍使用 build + preview。

站点身份从 `@siteConfig` 获取；导航配置可直接导入 `src/config/json/nav.json`。构建期读取资源时以 `process.cwd()` 或源码 JSON import 为起点，不用编译后 `import.meta.url` 去猜仓库资源路径。

确定的标题、正文和目录入口在 Astro 中输出。只注入客户端真正需要的数据；`define:vars` 可供传统脚本读取。内嵌 JSON 需转义小于号，用户文本不直接写进 HTML。

## 样式

引入 `/assets/css/basic.css`，按需要引入导航与页面样式。主题来自 `tokens.css`，表面使用 `--surface*` / `--line*`。`LuxuryBackground` 实际提供实色背景与导航数据，组件名称不代表装饰材质。

使用页面前缀类名，避免覆盖全局 header、button 等选择器。字体由站点偏好统一管理，输入控件继承，代码保持等宽。图标用本地 `fa-local.css` 或提取的 SVG。

正文、结果与链接默认可见，不依赖入场动画。移动端保留共享 gutter、安全区和实际触控范围；表格与代码使用局部横向滚动。进一步说明见[设计原则](../UI/UIDesignPrinciples.md)。

## 脚本和在线能力

静态资源脚本使用绝对公开路径；ESM 通过 `type="module"` 引入。首次开发或修改 `assets/` 后同步 `public/`，不直接编辑生成目录。

API 地址使用 `__API_BASE__` 或页面明确传入的配置。账号资料通过 `QuarkUserProfile` 获取；Firebase 通过 `QuarkFirebaseReady` 初始化。处理失败、空数据、重复绑定与断线，不将真实云端数据用于布局回归。

弹窗和抽屉处理焦点、Esc、滚动锁和指针可见性。对保存、复制、下载、上传等操作给出成功与失败反馈；本地数据说明保存范围并提供必要的导出。

## 登记与验收

根据页面用途修改相应目录 JSON，核对导航、站内搜索、sitemap 与必要的旧地址跳转。下线入口维护 `retired-pages.json`，而不是留下断链。

运行适用的语法、文档和功能检查，再做正式构建。浏览器检查深浅主题、320px 起的屏宽、键盘操作和失败状态。详细命令见[维护索引](../README.md)。
