# 过渡动效系统 (Transition System)

## 概述

全站统一的过渡动效体系。目标是让页面交互有「呼吸感」——每个动效都服务于「我在和这个页面互动」的感知，而非为了炫技。动效应轻、软、有目的，不干扰阅读和操作。

## 核心原则

### 1. 动效必须有触发原因

| 触发类型 | 示例 | 说明 |
|---------|------|------|
| 用户悬停 | 卡片抬起、下划线展开 | 反馈「这个元素可交互」 |
| 用户聚焦 | 输入框发光边框 | 反馈「此处正在输入」 |
| 用户点击/按压 | 按钮 `scale(0.97)` | 反馈「按到了」 |
| 页面加载 | 元素错位淡入 | 引导视线流动 |
| 状态切换 | Tab 内容滑动切入 | 连接新旧状态的视觉过渡 |

### 2. 动效参数范围

| 参数 | 推荐值 | 过快 | 过慢 |
|------|--------|------|------|
| 悬停/聚焦过渡 | `0.2s ~ 0.3s` | 感觉不到 | 拖沓 |
| 入场动画 | `0.35s ~ 0.55s` | 来不及看清 | 等待焦虑 |
| 弹性效果 | `cubic-bezier(0.34, 1.56, 0.64, 1)` | — | — |
| 标准缓动 | `ease` 或 `ease-out` | — | — |

### 3. 尊重用户偏好

所有动效必须同时支持两种禁用方式：

```css
/* 1. 系统级减少动效 */
@media (prefers-reduced-motion: reduce) {
    .my-animated-element {
        animation: none !important;
        opacity: 1 !important;
        transform: none !important;
        transition: none !important;
    }
}

/* 2. 用户主动设置（通过 user-preferences.js 的 body.reduce-motion） */
body.reduce-motion .my-animated-element {
    animation: none !important;
    opacity: 1 !important;
    transform: none !important;
}
```

### 4. 不可见不做动画

元素初始状态 `opacity: 0; transform: translateY(...)` 配合 `animation-fill-mode: forwards`，确保 JS 依赖布局的元素在动画开始前仍占据空间（不要用 `display: none`）。

---

## 动效类型与合适场景

### A. 入场动画 (Entrance)

用于页面/区块加载时引导视线。

| 子类型 | 方向 | 适合场景 | 案例 |
|--------|------|---------|------|
| fadeInUp | `translateY(12~20px)` → `0` | 大部分卡片、列表项、区块 | 主页文章列表、工具箱卡片、游戏卡片 |
| fadeInDown | `translateY(-10~-16px)` → `0` | 标题、导航 | 实验室页 Hero 标题 |
| fadeInLeft | `translateX(-8~-14px)` → `0` | 侧栏、分类导航 | 留言条目、热门页分类栏 |
| fadeInScale | `scale(0.96~0.97)` + 淡入 | 密集型卡片网格 | 游戏卡片、书签卡片 |
| scaleIn | `scale(0.8)` → `1` | 突出的单元素 | 404 页面大标题 |

**错位时间间隔参考：**

| 元素数量 | 每项延迟 | 总持续时间 |
|----------|---------|-----------|
| 3 项 | `0.07s ~ 0.10s` | ~0.5s |
| 6 项 | `0.06s ~ 0.08s` | ~0.7s |
| 12+ 项 | `0.02s ~ 0.04s` | ~0.6s |

**代码示例：**

```css
/* 标准错位淡入模式 */
.my-item {
    opacity: 0;
    transform: translateY(16px);
    animation: my-item-in 0.4s ease forwards;
}
.my-item:nth-child(1) { animation-delay: 0.04s; }
.my-item:nth-child(2) { animation-delay: 0.08s; }
/* ... */
@keyframes my-item-in {
    to { opacity: 1; transform: translateY(0); }
}
```

---

### B. 悬停交互 (Hover)

用于反馈「这个元素可点击/可交互」。

| 效果 | 实现 | 适用元素 | 案例位置 |
|------|------|---------|---------|
| 抬起 lift | `translateY(-2~-5px)` + 阴影增强 | 卡片、按钮 | 主页面板、游戏卡片、工具卡片 |
| 下划线展开 | `::after` width `0` → `100%` | 文本链接、标题 | 文章区块标题、实验室分类标题 |
| 平移指示 | `translateX(2~5px)` | 列表项、链接箭头 | 主页文章悬停、工具链接箭头 |
| 光圈脉冲 | `::before` border + animation | 圆形元素、头像 | 主页头像悬停 |
| 弹性放大 | `scale(1.02~1.08)` + spring curve | 标签、徽章、图标 | 日志标签、书签文件夹 |
| 旋转反馈 | `rotate(Ndeg)` | 图标、装饰元素 | 友链标题图标、导航 logo |

**代码示例 - 下划线展开：**

```css
.section-title a {
    position: relative;
    display: inline-block;
}
.section-title a::after {
    content: '';
    position: absolute;
    left: 50%;
    bottom: -2px;
    width: 0;
    height: 2px;
    background: var(--accent);
    transform: translateX(-50%);
    transition: width 0.35s ease, opacity 0.35s ease;
    opacity: 0;
}
.section-title a:hover::after {
    width: 100%;
    opacity: 1;
}
```

---

### C. 聚焦交互 (Focus)

用于输入类元素的状态反馈。

| 效果 | 实现 | 适用元素 |
|------|------|---------|
| 发光边框 | `box-shadow: 0 0 0 3px rgba(...)` | input, select, textarea |
| 微缩放 | `transform: scale(1.01)` | 输入框 |
| 背景变化 | `background` 变实 | 输入框 |
| 宽度扩展 | `width` 增加 | 搜索框 |

**代码示例：**

```css
.my-input {
    transition: border-color 0.3s ease, box-shadow 0.3s ease, transform 0.25s ease;
}
.my-input:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.18);
    transform: scale(1.01);
    outline: none;
}
```

---

### D. 按压反馈 (Active/Press)

用于按钮点击的即时触感。

| 效果 | 实现 | 说明 |
|------|------|------|
| 微缩 | `transform: scale(0.96~0.98)` | 标准按压反馈 |
| 阴影压缩 | `box-shadow` 减弱 | 配合缩放 |

```css
.my-button:active {
    transform: scale(0.97);
}
```

---

### E. 持续动效 (Ambient)

用于为页面增添微妙生命力，必须非常克制。

| 效果 | 适用元素 | 说明 |
|------|---------|------|
| 浮动呼吸 | `translateY` 循环 3~5s | emoji、装饰图标 |
| 脉冲光晕 | `scale + opacity` 循环 2~3s | 头像悬停光环 |
| 骨架屏闪烁 | `background-position` 循环 1.8s | 加载占位 |

```css
/* 浮动呼吸 - 极轻，不要让用户注意到循环 */
.emoji-decoration {
    animation: float 4s ease-in-out infinite;
}
@keyframes float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-4px); }
}
```

---

## 动效在各页面的分布（代表性案例）

| 页面 | CSS 文件 | 代表性动效 | 类型 |
|------|---------|-----------|------|
| 主页 `/` | `index.css` | 头像悬停光圈脉冲 | B 悬停 |
| 主页 `/` | `index.css` | 文章/侧栏错位淡入 | A 入场 |
| 主页 `/` | `index.css` | 区块标题下划线展开 | B 悬停 |
| 登录 `/login` | `login.css` | 卡片错位淡入入场 | A 入场 |
| 登录 `/login` | `login.css` | Tab/登录模式切换滑入 | A 入场 |
| 登录 `/login` | `login.css` | 输入框聚焦发光 + 微缩放 | C 聚焦 |
| 登录 `/login` | `login.css` | GitHub 按钮图标旋转 | B 悬停 |
| 登录 `/login` | `login.css` | 重置面板展开滑入 | A 入场 |
| 设置 `/settings` | `settings.css` | 各区块错位淡入 | A 入场 |
| 设置 `/settings` | `settings.css` | 下拉框聚焦发光 | C 聚焦 |
| 设置 `/settings` | `settings.css` | 按钮抬起 + 按压反馈 | B/D |
| 文章列表 `/posts` | `posts.css` | 文章条目错位淡入 | A 入场 |
| 文章列表 `/posts` | `posts.css` | 标签按钮悬停扩展 + 按压缩放 | B/D |
| 文章列表 `/posts` | `posts.css` | 分页按钮抬起 + 阴影 | B |
| 实验室 `/a` | `a/style.css` | Hero 标题/段落依次滑入 | A 入场 |
| 实验室 `/a` | `a/style.css` | 项目卡片错位淡入 + 悬停抬起 | A/B |
| 实验室 `/a` | `a/style.css` | 分类标题下划线展开 | B 悬停 |
| 工具箱 `/tool` | `tool.css` | 工具卡片错位淡入 | A 入场 |
| 工具箱 `/tool` | `tool.css` | 分类标题下划线展开 | B 悬停 |
| 工具箱 `/tool` | `tool.css` | 链接箭头 → 悬停滑动 | B 悬停 |
| 游戏 `/games` | `games/style.css` | 卡片错位淡入 + 微缩放 | A 入场 |
| 游戏 `/games` | `games/style.css` | 分类标题装饰线展开 | B 悬停 |
| 博客导航 `/blog` | `blog/blog.css` | 功能卡片错位淡入 | A 入场 |
| 404 `/404` | `404.css` | 容器缩放淡入 | A 入场 |
| 404 `/404` | `404.css` | 标题缩放弹出 | A 入场 |
| 404 `/404` | `404.css` | 建议项错位从左滑入 | A 入场 |
| 空间 `/space` | `space/style.css` | 卡片错位淡入 + 悬停抬起 | A/B |
| 空间 `/space` | `space/style.css` | 搜索框聚焦发光 + 微缩放 | C 聚焦 |
| 日志 `/blog/log` | `log/log.css` | 更新卡片错位淡入 | A 入场 |
| 日志 `/blog/log` | `log/log.css` | 标签徽章弹性放大 | B 悬停 |
| 日志 `/blog/log` | `log/log.css` | emoji 持续浮动微动效 | E 持续 |
| 留言板 `/blog/lyb` | `lyb/lyb.css` | 留言条目左侧滑入错位 | A 入场 |
| 留言板 `/blog/lyb` | `lyb/lyb.css` | 回复行悬停左边框变色 | B 悬停 |
| 友链 `/blog/friends` | `friends/style.css` | 卡片错位淡入 | A 入场 |
| 友链 `/blog/friends` | `friends/style.css` | 图标悬停旋转 | B 悬停 |
| 友链 `/blog/friends` | `friends/style.css` | 头像悬停旋转 + 缩放 | B 悬停 |
| 个人介绍 `/a/me` | `me/me.css` | 标题左侧滑入 | A 入场 |
| 个人介绍 `/a/me` | `me/me.css` | 技能卡片错位淡入 | A 入场 |
| 书签导航 `/tool/nav` | `nav/style.css` | 书签卡片错位 + 微缩放 | A 入场 |
| 书签导航 `/tool/nav` | `nav/style.css` | Logo 图标悬停旋转 | B 悬停 |
| 文件分享 `/a/share` | `share/share.css` | 卡片错位淡入 | A 入场 |
| 文件分享 `/a/share` | `share/share.css` | 按钮按压反馈 (scale 0.98) | D 按压 |

---

## 技术模式

### CSS 变量 + transition 模式（适用于悬停/聚焦）

```css
.my-element {
    transition: transform 0.28s ease, box-shadow 0.28s ease, border-color 0.28s ease;
}
.my-element:hover {
    transform: translateY(-2px);
    box-shadow: 0 24px 56px var(--glass-shadow-hover);
}
```

### @keyframes + animation 模式（适用于入场/持续动效）

```css
.my-element {
    opacity: 0;
    animation: my-in 0.4s ease forwards;
}
@keyframes my-in {
    to { opacity: 1; transform: translateY(0); }
}
```

### 弹性曲线模式（适用于趣味性交互）

```css
.my-bouncy-item:hover {
    transform: scale(1.06);
    transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

此曲线 (`0.34, 1.56, 0.64, 1`) 的特点是过冲后再回弹，适合标签、徽章、小图标的悬停。

### 叠加 transform

注意 `animation` 和 `transition` 都会操作 `transform`。入场动画结束后 `animation-fill-mode: forwards` 可保持最终值，hover 的 transform 会正常生效，因为动画已结束。

```css
/* 入场（animation） */
.item {
    transform: translateY(16px); /* 初始被 animation 覆盖 */
    animation: item-in 0.4s ease forwards;
}
@keyframes item-in {
    to { transform: translateY(0); } /* 动画结束后保持 */
}

/* 悬停（transition）—— 在动画结束后正常工作 */
.item:hover {
    transform: translateY(-2px); /* 覆盖 animation 的最终值 */
}
```

---

## 避坑指南

### 不要做的

1. **不要对所有元素用同一个动画时间和曲线** —— 大的元素稍慢，小的元素稍快，制造节奏感。
2. **不要用 `all` 做 transition** —— 明确列出要动画的属性，避免性能问题。
3. **不要忽略初始透明** —— 入场动画的元素必须有 `opacity: 0` 初始值，否则动画开始前会闪一下。
4. **不要在入场动画的初始状态用 `display: none`** —— 元素不占布局空间会导致布局抖动。
5. **不要在动效里改变 `width`/`height`/`top`/`left` 等布局属性** —— 会触发重排，仅用 `transform` 和 `opacity`。
6. **不要忘记 `animation-fill-mode: forwards`** —— 否则动画结束后元素回到不可见状态。
7. **不要给已经有很多样式的元素加 `animation`** —— 可能覆盖掉重要的布局属性，建议加在最前面。

### 动效排查步骤

如果动效不生效：

1. 检查是否有 `${...}-in` 的 `@keyframes` 定义
2. 检查 `animation-delay` 是否写了负数
3. 检查是否被 `prefers-reduced-motion` 或 `.reduce-motion` 禁用
4. 检查 `animation` 的 `forwards` 是否丢失
5. 检查 `opacity/transform` 是否被其他更高优先级的规则覆盖

---

## 配套资源

- `assets/css/tokens.css` — CSS 变量（阴影、颜色、圆角）
- `src/docs/UI/GlassSystem.md` — 玻璃效果系统
- `src/docs/UI/FlatUI.md` — 扁平 UI 设计规范
