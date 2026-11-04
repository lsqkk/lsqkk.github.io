# 表面与主题令牌

`assets/css/tokens.css` 是颜色、表面、描边、圆角与动效参数的来源。`basic.css` 引入令牌，生产构建会展开本地公共 CSS import。

| 变量族 | 用途 |
| --- | --- |
| `--page-bg`、`--bg-tint` | 页面底色 |
| `--surface`、`--surface-strong`、`--surface-soft` | 内容、浮层与次级表面 |
| `--text-main`、`--text-subtle`、`--text-soft` | 文字层级 |
| `--line`、`--line-strong`、`--line-soft` | 描边与分隔 |
| `--accent`、`--accent-soft`、`--focus-ring` | 交互与键盘焦点 |
| `--ok*`、`--warn*`、`--danger*`、`--violet*` | 有语义的状态反馈 |
| `--radius-xs` 至 `--radius-xl` | 2、4、6、8、10px 圆角 |
| `--shadow-main`、`--shadow-soft` | 轻量浮层阴影 |
| `--duration-fast`、`--duration-normal`、`--ease-out` | 状态过渡 |

主题在根令牌、系统深色媒体查询和 `body.dark-mode` 兼容规则中定义。页面只消费变量，不重新硬编码整套深色配色。用户偏好中的主题字段已移除，正常浏览跟随系统。

旧代码中的 `--glass-bg*`、`--glass-edge*` 等变量保留为实色表面的兼容映射；变量名不代表页面采用模糊玻璃。新代码直接使用 `--surface*` 与 `--line*`。

`LuxuryBackground.astro` 保留组件名以兼容现有页面，实际渲染实色的 `--page-bg`，同时提供导航 hover 数据。默认页面没有电影海报背景、渐变画布或持续背景动画。
