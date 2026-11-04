# 动态效果与状态过渡

动态效果用于解释操作结果，不作为内容出现的前提。页面默认不运行持续装饰动画，自定义光标效果须由用户主动开启。

## 参数与触发

采用 `tokens.css` 的 `--duration-fast`（150ms）、`--duration-normal`（240ms）与 `--ease-out`。优先过渡颜色、底色、透明度及必要的 transform，避免笼统的 `transition: all`。

- 悬停与聚焦：强调文字、描边或底色，布局保持稳定。
- 展开与切换：清楚表达当前区域、按钮状态和内容变化。
- 保存与异步操作：提供即时状态反馈，失败不能只让按钮停止转动。
- 画布和实时产品：按产品任务决定必要动画，不把主体交互误当装饰效果删除。

## 阅读与性能

正文和目录默认可见；不要把整页设成 `opacity: 0` 再依赖 JS 或动画解锁。大批列表不逐条播放长时间的错位入场，不因 hover 整块抬升造成视线漂移。

不可见区域不维持无意义的动画循环。自定义光标遵循 `cursorTrail` 偏好及精确指针条件；系统或站内设置要求减少动态效果时不启动对应效果。

## 减少动态效果

CSS 同时考虑 `@media (prefers-reduced-motion: reduce)` 与站内 `body.reduce-motion`。JavaScript 的平滑滚动、粒子或其他循环也要读取偏好，不能只覆盖 CSS。

减少动态效果后保留完整内容、焦点轮廓和成功/失败反馈。加载占位可静态显示，目录跳转与回顶应直接到达目标。

实现与验证参考[设计原则](UIDesignPrinciples.md)、[表面令牌](SurfaceSystem.md)、[加载状态](SkeletonSystem.md)及 `tests/ui/site-polish.cjs`。
