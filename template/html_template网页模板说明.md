# 网页模板说明

## 整体要求

### 提示词不完善的情况
当你认为用户描述的功能不够详细、具体，提示词存在歧义、缺少重要信息，可能导致你的输出使用户不满意时，应当首先**不输出代码**，并**详细询问用户更多信息**。

### 严禁改动
严禁私自改动、删除给定的html_template.html网页模板引入的固定内容，除非以下另有要求。

---

## UI 设计说明

### 严禁样式命名碰撞
模板引入的nav.css包含了以下样式名，因此你在生成新的样式时严格禁止使用以下样式名，并特别注意header等常见名称时禁用的。并且，应当避免设计任何固定在网页顶部的顶栏（最好不要设计任何顶栏，仅恰当出现h1标题即可）。
```css
.header, .header h1, .header-content, .header-left, .header-nav-container, .header-nav, .header-nav li, .header-nav li a, .language-selector, .language-selector option, .header-search, .header-search input, .header-search input::placeholder, .header-search button, .hamburger-menu, .hamburger-menu span, .mobile-navsidebar, .navsidebar-overlay, .navsidebar-content, .navsidebar-header, .navsidebar-header h2, .navsidebar-close, .navsidebar-nav, .navsidebar-nav ul, .navsidebar-nav li, .navsidebar-nav a, .navsidebar-search, .navsidebar-search input, .navsidebar-search input::placeholder, .navsidebar-search button, .navsidebar-controls, .navsidebar-language, .navsidebar-language .language-selector, .navsidebar-login, .navsidebar-login a, .mobile-navsidebar.active, .mobile-navsidebar.active .navsidebar-overlay, .mobile-navsidebar.active .navsidebar-content, .header-placeholder
```

### 网页背景
默认背景图片（提示词中为博客背景）使用图片地址为`/assets/img/bg.png`。当用户明确说明（使用博客背景/使用默认背景）或未指定任何背景时，使用此地址。
其他推荐的背景为：纯色（推荐深蓝色或其他较深色）背景、浅色低饱和渐变背景（方向角135°）。
禁止使用白色或极浅灰背景，并注意整体颜色协调。

### 卡片和背景
1. 元素(如方框卡片)的默认UI设计为浅白色、高透明、圆角的**液态毛玻璃**主题，saturate值在120%左右。
2. 如果背景使用默认的`bg.png`，则推荐的与导航栏匹配的基础液态毛玻璃样式如下（可供参考，数值可微调）：
```css
.glass-card {
    background: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 12px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1) inset 0 1px 0 rgba(255, 255, 255, 0.1);
    padding: 20px;
    margin-bottom: 20px;
    color: #fff;
}
```
如果用户指定使用默认背景以外的纯色或浅色系微小渐变背景，则卡片参数可做更多调整以增强显示效果。

### 网页大标题 h1
当页面功能集中在首页（即用户不需要向下滑动翻页，当页就可以使用功能）时，你可以自行设计 h1 标题以节约空间，这种情况较少。
当网页功能较多或显示内容较多、需要翻页时，则不必节省 h1 空间，此时你可以直接使用在`basic.css`中定义过的`class="page-title"`样式（你无需再新项目样式中再定义一遍，可直接使用），其内容如下：
```css
.page-title {
    color: #fff;
    text-align: center;
    margin-bottom: 50px;
    font-size: 2.8rem;
    font-weight: 300;
    text-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
    letter-spacing: 1px;
}
```
如果选择使用这个样式，则 h1 的名称格式为“中文名 / 英文名”。例如 `文章 / POST` 、 `工具 / TOOL` ，英文名首字母大写或全大写均可。


### 时刻保持简洁、大气
严禁使用任何花里胡哨的任何高饱和（尤其是蓝紫色）渐变、边缘线条等虽属于现代UI但烂大街的庸俗页面设计，应当力求简洁、大气、用更少的样式表达更好的视觉效果。

### 响应式设计
进行必要的适当响应式设计，以优化移动端适配。

### 交互设计
允许使用极少量的简洁悬浮交互（如轻微亮度变化、光影追随、Y轴翻转）等，但不宜太多，需根据提示词具体对页面美观或简洁的需求进行调整。

### 负面清单：禁止使用的 UI 或交互
1. hover时的轻微上升
2. 任何紫色渐变或高饱和渐变
3. 白色或极浅灰背景

### 不使用emoji
极其不推荐使用emoji，非必要情况禁用。如果需要使用图标以简化或强调，应当优先使用fa-系列图标库或类似图标库，或自行绘制svg图线。

### 不设置字体族
不在 body 设置任何`font-family`，因为basic.css已经包含统一设置。

---

## 网页设计准则
    
### 注意使用localStorage
当提示词没有要求使用 Firebase 数据库，但需要存储用户相关信息的，存储在`localStorage`中。键值命名保持专业、规范。

### 在合适位置添加版权信息
如提示词要求或合适时，可以在在页尾恰当地方显示如下版权信息（包含结尾的英文"."符号），并在“夸克博客”字样处提供跳转至/posts/copyright的链接：
> © 2024 - 当前年份(2026，或写一个简单的js函数) 功能名 / 夸克博客 All rights reserved.
    
### 在必要时开放右键
当网页需要用户输入隐私（如API密钥）但存储在本地并不上传，用户在提示词中指定强调“使用者可右键查看源码以检验代码安全性”等类似场合，应当取消模板中的`<script src="/assets/js/disable-right-click.js"></script>`这一行代码，使得可以右键查看网页源码。

### json 文件读取规范
如果给定或要求读取`json`文件，使用`fetch`等方法进行真实读取，**严禁任何模拟方法**。

### 长列表展示
如果需要从加载的文件中读取信息，并展示很长的列表（50条信息以上）时，需要设置合适的**页底分页**机制和**懒加载**机制。
如果用户指令提及或有必要时，可以：
1. 添加搜索检索功能，用户按回车或搜索按钮后展示搜索结果。注意搜索框和`button`样式名不得与上方列举的`nav.css`重复。
2. 网址参数化功能。如`?page=xxx&search=xxx`等。

### 网页结构设计
严格禁止将style样式和script脚本放置在html文件中，应当拆分为`html`+`js`+`css`的结构：
- 如果整体规模不算特别大，推荐的拆分 js 和 css 名称分别为`app.js`和`style.css`并放置在同级目录。
- 如果规模较大或合适时，也可以按照功能名拆分成多个js或css文件放在同级`/js`和`/css`等文件夹中，输出时应当将整体文件架构一并输出。
- 如有其他的多个同类型文件，存储在`同级/文件类型名/文件`位置。如：`/ini/xxx.ini`。
- 图片（不分jpg、png）统一默认存储在同级`/img`文件夹下。

---

## 输出开始时
你应当在每轮次对话输出开始时（包括后的修改），都要严格按照以下内容要求输出。
- 首轮对话：
```text
好的夸克，我已经仔细阅读网页模板说明并保证严格遵守其中的每条网页设计要求。我将……
```
- 从第二轮之后：
```text
好的夸克，我仍然记得并严格遵守网页模板说明的每条网页设计要求。…………
```