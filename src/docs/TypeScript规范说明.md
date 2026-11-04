# 渐进类型检查

客户端以可直接加载的 JavaScript 和 ESM 为主，Astro 及部分构建工具使用 TypeScript。类型改造逐步进行，不能把当前检查描述为全仓通过。

## 当前范围

`npm run typecheck` 执行 `tsc -p jsconfig.json --noEmit`。检查范围以 `jsconfig.json` 的 include 为准，包含首页、导航、文章增强、评论、偏好、站内搜索、全局声明与谍报风云模块。它不等于所有页面脚本或所有 Astro 模板的类型检查。

`assets/js/globals.d.ts` 保存部分浏览器全局扩展；现有声明并不覆盖全部运行时成员。代码中仍有 DOM 类型收窄、回调签名和全局声明等历史诊断。

## 开发约定

- 复杂数据通过 JSDoc `@typedef` 或 TypeScript interface 定义，核心脚本逐步加入 `@ts-check`。
- DOM 查询先判断空值，并收窄到实际类型后访问 value、checked 或 style。
- 需要挂载到 window 的能力有明确名称与声明；模块内部能力优先使用 import / export。
- 加入检查范围之前整理依赖和类型边界，不为清除报告而批量增加 any 或 ts-ignore。
- 纯状态模型使用 Node 单测，浏览器交互使用实际页面回归；语法检查不替代类型或行为验证。

## 命令与解释

~~~sh
npm run check:syntax
npm run typecheck
~~~

语法检查验证脚本可解析。类型检查输出中的 error 要按实际结果记录：存在既有错误时，核对当前改动与同一环境下 HEAD 基线的诊断，不写“类型检查通过”。

基线文件和日志放进忽略目录 `test-results/`，不得为比较而覆写工作区中的用户改动。后续逐步消除历史诊断，并将已整理的模块加入 include 范围。
