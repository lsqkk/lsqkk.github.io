# 温润浊玉玻璃系统 (Glass System)

## 概述

全站统一的毛玻璃效果系统。通过 `tokens.css` 中的 CSS 变量控制，**自动适配浅色/深色模式**，新页面无需编写 `body.dark-mode` 覆盖。

## 可用变量

定义于 `assets/css/tokens.css`（`:root` + `@media` dark + `body.dark-mode` 三处同步）：

### 背景色

| 变量 | 浅色模式 | 深色模式 | 用途 |
|------|---------|---------|------|
| `--glass-bg` | `rgba(253,250,242,0.55)` | `rgba(17,28,46,0.55)` | 标准玻璃卡片 |
| `--glass-bg-strong` | `rgba(253,250,242,0.6)` | `rgba(17,28,46,0.65)` | hover 态、更实 |
| `--glass-bg-soft` | `rgba(253,250,242,0.5)` | `rgba(17,28,46,0.45)` | 更透、标签栏 |
| `--glass-bg-solid` | `rgba(253,250,242,0.9)` | `rgba(17,28,46,0.85)` | 导航栏等近实心 |

### 内边框高亮

| 变量 | 浅色模式 | 深色模式 | 用途 |
|------|---------|---------|------|
| `--glass-edge` | `rgba(255,250,235,0.5)` | `rgba(134,171,226,0.12)` | 标准玻璃边缘光 |
| `--glass-edge-strong` | `rgba(255,250,235,0.7)` | `rgba(134,171,226,0.2)` | hover 强化 |
| `--glass-edge-soft` | `rgba(255,250,235,0.4)` | `rgba(134,171,226,0.08)` | 柔和版本 |

### 阴影

| 变量 | 浅色模式 | 深色模式 | 用途 |
|------|---------|---------|------|
| `--glass-shadow` | `rgba(7,24,52,0.12)` | `rgba(0,0,0,0.42)` | 标准阴影色 |
| `--glass-shadow-hover` | `rgba(7,24,52,0.18)` | `rgba(0,0,0,0.5)` | hover 加深 |

## 标准卡片模板

```css
.my-card {
    background: var(--glass-bg);
    backdrop-filter: blur(22px) saturate(135%);
    -webkit-backdrop-filter: blur(22px) saturate(135%);
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: 0 8px 32px var(--glass-shadow), inset 0 0 0 1px var(--glass-edge);
}

.my-card:hover {
    background: var(--glass-bg-strong);
    box-shadow: 0 12px 40px var(--glass-shadow-hover), inset 0 0 0 1px var(--glass-edge-strong);
    border-color: var(--line-strong);
}
```

## 通用原则

1. **背景用 `var(--glass-bg)`**：不要写死 `rgba(253, 250, 242, ...)`
2. **边框用 `var(--line)`**：不要写死边框色
3. **内边缘光用 `var(--glass-edge)`**：不要写死 `rgba(255, 250, 235, ...)`
4. **阴影色用 `var(--glass-shadow)`**：不要写死 `rgba(0, 0, 0, ...)`
5. **blur 值可自定义**：根据视觉效果在 18px-24px 之间选择
6. **不要写 body.dark-mode 覆盖**：变量自动适应深色模式
7. **输入框等控件**：用 `var(--glass-bg-soft)` + `var(--line)` 组合

## 深色模式说明

玻璃变量在 `tokens.css` 中有三处定义：

- `:root { --glass-bg: ... }` — 浅色模式默认值
- `@media (prefers-color-scheme: dark) { :root { --glass-bg: ... } }` — 跟随系统深色
- `body.dark-mode { --glass-bg: ... }` — 手动切换深色

这使得玻璃效果在三种模式下都正确渲染。**新页面只需引用变量，无需关心深色模式逻辑。**

## 已迁移页面（使用本系统）

- 首页 (`index.css`) — `body.home-page .home-panel`
- 动态时间线 (`dt.css`, `dt-detail.css`)
- 文章列表 (`posts.css`)
- 文章内容 (`post.css`)
- 侧边栏 (`style.css`)
- 搜索 (`site-search.css`)
- 登录 (`login.css`)
- 账号中心 (`account.css`)
- 设置 (`settings.css`)
- 在线 (`online.css`)
- 404 (`404.css`)
- 个人中心 (`me.css`)
- 友链 (`friends/style.css`)
- 更新日志 (`log/log.css`)
- 留言板 (`lyb/lyb.css`)
- QTV (`qtv/style.css`)
- 工具页 (`tool.css`, `tool/nav/style.css`)
- 导航 (`nav.css`)
- 功能页 (`blog.css`)
