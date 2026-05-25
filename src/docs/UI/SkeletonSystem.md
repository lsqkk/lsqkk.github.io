# 骨架屏加载系统 (Skeleton System)

## 概述

全站统一的骨架屏（Skeleton Screen）加载系统。用于在异步数据到达前，用与真实内容形态接近的浅色占位块填充页面，避免白屏或突兀的内容跳变。

**核心目标：** 让用户感知到「内容正在加载」，而非「页面坏了」。

---

## 已有骨架屏覆盖的页面

| 页面 | CSS 文件 | JS 文件 | 骨架形态 | 数据来源 |
|------|---------|---------|---------|---------|
| 主页 `/` | `assets/css/index.css` | `assets/js/index.js` | 视频/仓库/在线/消息/公告 5 种 + 图片懒加载 | 多 JSON fetch |
| 工具箱 `/tool` | `assets/css/tool.css` | `assets/js/tool.js` | 6 张工具卡片占位 | `tool.json` |
| 游戏 `/games` | `assets/pages/games/style.css` | `assets/pages/games/game.js` | 3 个分类 x 6 张卡片占位 | `game.json` |
| 动态 `/blog/dt` | `assets/css/dt.css` | `assets/pages/blog/dt/dt.js` | 3 条动态卡片占位 | `dt.json` |
| 实验室 `/a` | `assets/pages/a/style.css` | `assets/pages/a/index.js` | 6 张项目卡片占位 | `projects.json` |
| 留言板 `/blog/lyb` | `assets/pages/blog/lyb/lyb.css` | `assets/pages/blog/lyb/lyb.js` | 4 条留言行占位 | Firebase RTDB |

---

## 骨架屏规范结构

### 1. CSS 定义模式

每个页面的 CSS 中需定义：

```css
/* ── Skeleton loading for [页面名] ── */
@keyframes [前缀]-shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
}
```

骨架元素的命名规则：

```
[前缀]-skeleton-[容器/项]  →  最外层容器 / 单个占位单元
[前缀]-skeleton-[项] .s-[部件]  →  占位单元内部的组成部分
```

示例（tool.css）：

```
.tool-skeleton-grid        → 网格容器
.tool-skeleton-card        → 单张卡片占位
.tool-skeleton-card .s-category → 分类标签占位
.tool-skeleton-card .s-name     → 标题占位
```

### 2. JS 注入模式

每个异步加载数据的 JS 中需在数据请求前插入骨架 HTML：

```javascript
function show[页面]Skeleton(container) {
    container.innerHTML = '...骨架HTML...';
}

// 在数据加载前调用
showSkeleton(container);
fetchData().then(data => {
    container.innerHTML = '';  // 清除骨架
    renderRealContent(data);    // 渲染真实内容
});
```

骨架必须满足两个条件：
- 初始占据真实内容相同的布局空间（margin/padding 一致），防止布局偏移
- 数据到达后立即被替换（`container.innerHTML = ''` 或 `removeChild`）

### 3. Shimmer 动画参数

| 参数 | 值 | 说明 |
|------|-----|------|
| 动画时长 | `1.8s` | 一次完整扫描周期 |
| 缓动函数 | `ease-in-out` | 平滑开始和结束 |
| 渐变方向 | `90deg` | 水平从左到右 |
| 渐变范围 | `200%` → `-200%` | 覆盖整个元素宽度 |
| 循环模式 | `infinite` | 持续闪烁直到被替换 |

### 4. 色彩方案

浅色模式下的渐变（使用 CSS 变量自动适应当前主题）：

```css
background: linear-gradient(
    90deg,
    var(--surface) 25%,
    var(--surface-tint) 50%,
    var(--surface) 75%
);
background-size: 200% 100%;
```

深色模式时，`--surface` 和 `--surface-tint` 变量由 `tokens.css` 自动切换。对于未使用 CSS 变量的页面，需要单独定义深色模式覆盖：

```css
@media (prefers-color-scheme: dark) {
    .my-skeleton-element {
        background: linear-gradient(90deg, rgba(17,28,46,0.5) 25%, rgba(66,108,170,0.12) 50%, rgba(17,28,46,0.5) 75%);
        background-size: 200% 100%;
    }
}
```

---

## 骨架单元类型速查表

| 占位单元 | 尺寸 | 圆角 | 用途 |
|----------|------|------|------|
| `.s-line` | `100% x 14px` | `4px` | 文本行 |
| `.s-line:last-child` | `65% x 14px` | `4px` | 短文本行 |
| `.s-title` | `55~65% x 22~28px` | `6px` | 标题行 |
| `.s-category` | `80px x 24px` | `12px` | 分类标签 |
| `.s-date` / `.s-time` | `30% x 12~14px` | `4px` | 日期时间 |
| `.s-btn` | `80~100px x 32~36px` | `12px` / `999px` | 按钮 |
| `.s-avatar` | `40px x 40px` | `50%` | 头像圆形 |
| `.s-name` | `60% x 22px` | `6px` | 名称行 |
| `.s-desc` | `90% x 14px` | `4px` | 描述行 |
| `.s-top` | `40px x 40px` | `10px` | 图标方块 |

---

## 骨架屏 vs 文字加载 vs Spinner

| 方案 | 感知速度 | 视觉安抚度 | 实现成本 |
|------|---------|-----------|---------|
| **骨架屏** | 高 | 高（用户看到结构雏形） | 中 |
| **文字「加载中...」** | 低 | 低 | 低 |
| **Spinner 旋转动画** | 中 | 中（不告知加载内容） | 低 |
| **无任何反馈** | 很差 | 很差 | 零 |

**推荐策略：** 所有异步加载内容的页面优先使用骨架屏。如果骨架屏实现成本过高，至少使用 spinner 或文字提示，绝不能无任何加载反馈。

---

## 添加骨架屏到新页面的步骤

1. 在页面的 CSS 文件中添加 skeleton 样式（参考上方的规范模式）
2. 在页面的 JS 文件中添加 `showXxxSkeleton()` 函数
3. 在数据请求发起前调用骨架函数
4. 在数据到达并渲染前清除骨架内容
5. 验证深色模式适配
6. 添加 `body.reduce-motion` 支持（禁用动画时保留纯色占位）

---

## 图片懒加载骨架

用于 `<img>` 标签的加载占位，定义在 `index.css`：

```css
.img-skeleton-wrap {
    position: relative;
    overflow: hidden;
    background: linear-gradient(90deg, var(--surface) 25%, var(--surface-tint) 50%, var(--surface) 75%);
    background-size: 200% 100%;
    animation: skeleton-shimmer 1.8s ease-in-out infinite;
}
.img-skeleton-wrap img {
    opacity: 0;
    transition: opacity 0.5s ease;
}
.img-skeleton-wrap.is-loaded {
    background: none !important;
    animation: none;
}
.img-skeleton-wrap.is-loaded img {
    opacity: 1;
}
```

通过 JS 在图片加载完成后给容器添加 `.is-loaded` 类来触发切换。

---

## 配套资源

- `assets/css/tokens.css` — 颜色变量（`--surface`, `--surface-tint`）
- `src/docs/UI/TransitionSystem.md` — 过渡动效体系
- `src/docs/UI/FlatUI.md` — 扁平 UI 设计规范
