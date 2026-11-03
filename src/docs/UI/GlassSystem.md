# 表面系统（Surface System）

> 文件名保留为 `GlassSystem.md` 以兼容旧链接；内容已更新为当前的扁平表面体系。

## 概述

全站表面由 `assets/css/tokens.css` 中的 CSS 变量统一控制，**自动适配浅色/深色模式**。旧页面中的 `--glass-*` 变量仍保留，但已映射为实色表面与描边，不再产生毛玻璃效果。

## 核心变量

| 变量 | 浅色 | 深色 | 用途 |
|------|------|------|------|
| `--page-bg` | `#f5f6f8` | `#0f1115` | 页面底色 |
| `--surface` | `#ffffff` | `#171a20` | 标准面板/输入框 |
| `--surface-strong` | `#ffffff` | `#1b1f26` | 导航、浮层、强调表面 |
| `--surface-soft` | `#f7f8fa` | `#14171c` | 次级区块、代码底 |
| `--line` | `#e4e7ec` | `#2a2f37` | 1px 描边/分隔线 |
| `--line-strong` | `#cfd4dc` | `#3a404a` | hover/强调描边 |
| `--text-main` | `#15181d` | `#e7e9ee` | 主文字 |
| `--text-subtle` | `#5a6472` | `#a3adbb` | 次级文字 |
| `--text-soft` | `#7b8593` | `#828c9a` | 辅助文字 |

## 圆角与阴影

- 圆角：`--radius-xs: 2px`、`--radius-sm: 4px`、`--radius-md: 6px`、`--radius-lg: 8px`、`--radius-xl: 10px`
- 阴影：只保留 `--shadow-main` / `--shadow-soft` 的 1px 级浮起提示；内容面板默认不加深阴影
- 不再使用 `backdrop-filter`、大圆角胶囊（除头像/圆点）和装饰性渐变

## 旧变量兼容

| 旧变量 | 现映射 |
|--------|--------|
| `--glass-bg` 系列 | `--surface` 系列 |
| `--glass-edge` 系列 | `--line` 系列 |
| `--glass-shadow` | 低透明度阴影色 |

新页面请直接使用 `--surface*` / `--line*`，不要新增玻璃材质。

## 深色模式

令牌在 `:root`、`@media (prefers-color-scheme: dark)` 与 `body.dark-mode` 三处同步。新页面只需引用变量，无需写深色覆盖。
