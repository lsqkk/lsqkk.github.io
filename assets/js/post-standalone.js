/**
 * post-standalone.js 
 * 修改说明：移除 fetch/parse 逻辑，仅保留 DOM 处理和 UI 增强。
 */

// 1. 初始化入口
document.addEventListener('DOMContentLoaded', async () => {
    initPostUI();

    // 如果 KaTeX 已经加载，渲染公式；否则等待加载
    if (window.renderMathInElement) {
        renderMath();
    } else {
        window.addEventListener('load', renderMath);
    }

    // 生成目录并添加导航
    generateTOC();

    const tagsContainer = document.getElementById('post-tags-container');
    const filename = tagsContainer.getAttribute('data-md-file');
    if (filename) {
        await addPostNavigation(filename);
    }

    // 显示侧边栏内容
    document.getElementById('sidebarContent').style.opacity = 1;
});

// 2. 渲染元数据和基础 UI
function initPostUI() {
    const tagsContainer = document.getElementById('post-tags-container');
    const date = tagsContainer.getAttribute('data-date');
    const wordCount = parseInt(tagsContainer.getAttribute('data-word-count') || '0', 10);
    const tagsJson = tagsContainer.getAttribute('data-tags');

    // 显示日期
    if (date) {
        document.getElementById('post-date').textContent = `发表于 ${date}`;
    }

    // 显示字数和预计阅读时间
    const readTime = Math.ceil(wordCount / 400);
    document.getElementById('post-wordcount').textContent = `${wordCount}字 · ${readTime}min`;

    // 显示标签
    if (tagsJson) {
        try {
            const tags = JSON.parse(tagsJson);
            if (tags && tags.length > 0) {
                tagsContainer.innerHTML = tags.map(tag =>
                    `<span class="post-tag">${tag}</span>`
                ).join('');
            }
        } catch (e) { console.error("解析标签 JSON 失败", e); }
    }
}

// 3. 渲染数学公式 (KaTeX)
function renderMath() {
    const content = document.getElementById('content');
    if (!content || !window.renderMathInElement) return;

    renderMathInElement(content, {
        delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false },
            { left: '\\(', right: '\\)', display: false },
            { left: '\\[', right: '\\]', display: true }
        ],
        throwOnError: false
    });
}

// 4. 生成目录 (TOC)
function generateTOC() {
    const headings = document.querySelectorAll('.post-content h1, .post-content h2, .post-content h3, .post-content h4');
    const tocContainer = document.querySelector('.sidebar-main-content');
    if (!tocContainer) return;

    let html = '<h4>目录</h4>';
    if (headings.length === 0) {
        html += '<p style="font-size:0.8em; color:#999;">暂无目录</p>';
    }

    headings.forEach((heading, index) => {
        const level = heading.tagName.toLowerCase();
        const id = `heading-${index}`;
        heading.id = id;
        html += `
        <div class="toc-item ${level}">
            <a href="#${id}">${heading.textContent}</a>
        </div>
        `;
    });

    // 添加翻页导航按钮容器
    html += `
        <div class="nav-arrows-container" style="margin-top: 30px; border-top: 1px solid #eee; padding-top: 15px;">
            <a id="prevPost" class="nav-arrow" style="display:block; margin-bottom:10px; cursor:pointer;">← 加载中...</a>
            <a id="nextPost" class="nav-arrow" style="display:block; cursor:pointer;">加载中... →</a>
        </div>
    `;

    tocContainer.innerHTML = html;
}

// 5. 侧边栏导航逻辑 (需要读取 posts.json)
async function addPostNavigation(currentFileBaseName) {
    try {
        const posts = await fetch('/posts/posts.json').then(r => r.json());

        // 查找当前文章索引
        const currentIndex = posts.findIndex(p => p.file.endsWith(currentFileBaseName));
        if (currentIndex === -1) return;

        // 注意：posts.json 通常是倒序排列（最新的在前面）
        const nextPost = posts[currentIndex - 1]; // 时间更晚的
        const prevPost = posts[currentIndex + 1]; // 时间更早的

        const prevBtn = document.getElementById('prevPost');
        const nextBtn = document.getElementById('nextPost');

        if (prevPost) {
            prevBtn.innerHTML = `← ${prevPost.title}`;
            prevBtn.onclick = () => window.location.href = `/posts/${prevPost.file.replace('.md', '')}`;
        } else {
            prevBtn.style.display = 'none';
        }

        if (nextPost) {
            nextBtn.innerHTML = `${nextPost.title} →`;
            nextBtn.onclick = () => window.location.href = `/posts/${nextPost.file.replace('.md', '')}`;
        } else {
            nextBtn.style.display = 'none';
        }
    } catch (e) {
        console.error("加载导航失败:", e);
    }
}

// 侧栏切换
function toggleSidebar() {
    document.querySelector('.sidebar').classList.toggle('active');
}

// 复制链接
function copyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
        alert("链接已复制到剪贴板");
    });
}