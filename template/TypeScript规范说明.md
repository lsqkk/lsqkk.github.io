# TypeScript 规范说明（渐进改造版）

本文用于指导本仓库后续 JS -> TS 的渐进改造，以及新功能开发时的类型规范。

## 1. 总体策略

- 采用“渐进改造”，不强制一次性切换到完整打包流程。
- 现阶段以 `JavaScript + @ts-check + JSDoc` 为主，保证线上仍可直接加载 `.js`。
- 优先改造高复杂度、高复用、多人维护频繁的脚本。

## 2. 必做项

- 新建或重构的核心脚本，文件头添加：`// @ts-check`
- 复杂对象必须写 `@typedef`（例如配置对象、API 返回结构、消息结构）。
- 所有 DOM 查询必须做类型收窄或空值判断，例如：
  - `if (el instanceof HTMLInputElement) { ... }`
- 全局对象扩展统一写到：`/assets/js/globals.d.ts`

## 3. 类型检查命令

```bash
# 安装依赖
npm install

# 类型检查（当前白名单脚本）
npm run typecheck

# 语法检查
npm run check:syntax
```

说明：
- `typecheck` 采用白名单策略，先保证已改造脚本稳定，再逐步扩展范围。
- 每新增一个已完成改造的脚本，再加入 `jsconfig.json` 的 `include` 列表。

## 4. 推荐改造顺序

1. 页面入口脚本（如 `index.js` / `post-standalone.js`）
2. 业务状态复杂脚本（如评论、协同、实时模块）
3. 工具类与通用模块
4. 历史脚本与实验脚本

## 5. 禁止事项

- 不要在“未完成类型整理”的情况下直接把全仓 JS 一次性纳入 strict 检查。
- 不要在无空值保护时直接访问 DOM 属性（如 `.value`、`.style`、`.checked`）。
- 不要把全局变量随意挂在 `window`，若必须挂载，先补 `globals.d.ts` 声明。

## 6. 新项目参考模板

- 复制本仓库的 `package.json`、`jsconfig.json`、`assets/js/globals.d.ts`。
- 首批只纳入 1~3 个核心脚本做 `typecheck`，通过后再扩展。
- 任何新增能力都优先补类型定义，再写业务逻辑。
