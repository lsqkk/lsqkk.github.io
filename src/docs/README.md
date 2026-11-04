# 夸克博客维护文档

文档描述仓库当前结构与行为。版本变化查阅 Git 历史；待办只记录未完成事项。

## 从哪里开始

| 任务 | 文档 |
| --- | --- |
| 安装、运行、DEMO、项目概览 | [仓库 README](../../readme.md) |
| 构建、静态资源、RSS、sitemap、搜索索引 | [构建与数据产物](构建与数据产物说明.md) |
| 换站点身份、部署 Pages 与 Vercel、服务配置 | [迁移部署](迁移部署说明.md) |
| API 路由、参数与来源配置 | [API 索引](API/README.md) |
| 类型检查范围与已知限制 | [TypeScript 说明](TypeScript规范说明.md) |
| 新建 Astro 页面 | [页面构建说明](page_template/astro页面构建说明.md) / [模板](page_template/page_template.astro) |
| 界面、表面、布局、动效与加载状态 | [设计原则](UI/UIDesignPrinciples.md) |
| 文章阅读与排版交互 | [阅读体验](UI/ReadingExperience.md) |
| 未完成的维护工作 | [待办](dev/待办.md) |

## 功能说明

- [文章内联组件](页面和功能/文章内联组件说明.md)、[脚注与参考文献](页面和功能/文章脚注与参考文献说明.md)
- [阅读工作台](页面和功能/拾页阅读工作台.md)、[网站设置](页面和功能/网站设置Settings说明.md)
- [权衡决策实验室](页面和功能/权衡决策实验室.md)、[目录与随行架](UI/CatalogAndTools.md)
- [谍报风云](页面和功能/谍报风云.md)
- [终端与 Q-AI](页面和功能/a-terminal与a-qai联动说明.md)
- [Quark 本地管理面板](页面和功能/Quark%20Web%20UI%20说明.md)、[QQ 空间说说导出](页面和功能/QQ空间说说导出说明.md)

## 维护入口

`quark new` 创建文章，`quark updatelog` 根据提交记录更新 `assets/data/log.json`，`quark pic` 上传图片，`quark web` 编辑 JSON 配置。执行有外部副作用的命令前，应确认目标服务、文件与凭据。

公开内容分别维护在 `posts/`、`assets/data/` 与 `assets/pages/` 的目录 JSON 中。`public/`、`dist/`、`.quark-artifact/` 由工具生成。README 图片在 `docs/demo/`，不随 `assets/` 复制进公开站点。

## 验证范围

生产构建执行产物校验；单测覆盖 sitemap、阅读工作台状态和谍报风云规则；浏览器用例覆盖布局与交互。在线服务仍需要独立验收。测试命令以根目录 `package.json` 为准，`npm run check:docs` 检查维护文档和 README 的本地链接、API 文件引用及 DEMO 文件。
