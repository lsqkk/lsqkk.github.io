# 首页开屏

`src/components/HomeCover.astro` 位于原首页导航和内容之前。底部箭头通过 `#home-content` 跳到原首页，普通滚动和触摸滑动也可以直接进入。全站导航仍会在原首页内容处出现。

Canvas 波纹使用原生浏览器 API。动效构思参考 [sine-waves](https://github.com/isuttell/sine-waves) 的多层波形和 [Flow Fields](https://github.com/evoluteur/flow-fields) 的柔和流线，未引入外部代码、运行时依赖或资源请求。离开开屏或切到后台时暂停动画；系统或站内开启减少动态效果时只绘制静态波纹。触屏保留原生滚动手势。
