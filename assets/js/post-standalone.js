// post-standalone.js

// 自定义Markdown渲染器以保留TeX
const renderer = {
    code(code, infostring) {
        if (infostring === 'math') {
            // 注意：因为是独立页面，路径可能需要调整。这里假设/js/post-standalone.js可以访问到posts下的文件
            return `<div class="math-block">${code}</div>`;
        }
        return false; // 使用默认渲染
    }
};
marked.use({ renderer });

// 加载文章内容和元数据 (适配独立页面)
async function loadPostStandalone() {
    const tagsContainer = document.getElementById('post-tags-container');
    // 从 HTML 元素中读取由 Python 脚本注入的元数据
    const filename = tagsContainer.getAttribute('data-md-file');
    const date = tagsContainer.getAttribute('data-date');
    const wordCount = parseInt(tagsContainer.getAttribute('data-word-count') || '0', 10);
    const tagsJson = tagsContainer.getAttribute('data-tags');

    if (!filename) {
        document.getElementById('content').innerHTML = '<p>文章信息加载失败</p>';
        return;
    }

    try {
        // 1. 显示元数据
        if (date) {
            document.getElementById('post-date').textContent = `发表于 ${date}`;
        }

        // 显示字数和预计阅读时间
        const readTime = Math.ceil(wordCount / 400);
        document.getElementById('post-wordcount').textContent = `${wordCount}字·${readTime}min`;

        // 显示标签
        if (tagsJson) {
            const tags = JSON.parse(tagsJson);
            if (tags && tags.length > 0) {
                tagsContainer.innerHTML = tags.map(tag =>
                    `<span class="post-tag">${tag}</span>`
                ).join('');
            }
        }

        // 2. 加载 Markdown 内容
        // 关键：读取同级目录的MD文件
        const currentDir = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
        const mdPath = currentDir + filename; // 假设 MD 文件和 HTML 文件在同一目录下

        const mdContent = await fetch(mdPath).then(r => r.text());
        const htmlContent = marked.parse(mdContent);
        document.getElementById('content').innerHTML = htmlContent;

        // 3. 渲染数学公式
        renderMathInElement(document.getElementById('content'), {
            delimiters: [
                { left: '$$', right: '$$', display: true },
                { left: '$', right: '$', display: false }
            ],
            throwOnError: false
        });

        // 4. 生成目录和导航（导航逻辑需要修改以适配独立页面）
        generateTOC();
        // 独立页面下的导航逻辑需要从posts.json中全局查找，这里简化为只显示箭头
        addPostNavigation(filename);

    } catch (error) {
        document.getElementById('content').innerHTML = '<p>加载文章失败</p>';
        console.error("加载文章或元数据出错:", error);
    }
}

// 复制链接功能 (不变)
function copyLink() {
    const currentURL = window.location.href;
    navigator.clipboard.writeText(currentURL).then(() => {
        // 假设有一个提示元素 'copy-notice'
        const notice = document.getElementById('copy-notice');
        if (notice) {
            notice.style.display = 'inline';
            setTimeout(() => notice.style.display = 'none', 2000);
        }
    }).catch(err => {
        console.error('复制失败:', err);
    });
}

// 生成目录 (不变)
function generateTOC() {
    const headings = document.querySelectorAll('.post-content h1, .post-content h2, .post-content h3');
    const tocContainer = document.querySelector('.sidebar-main-content');
    let html = '<h4>目录</h4>';

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

    // 导航链接占位符
    html += `
        <div style="margin-top: 20px;">
            <a id="prevPost" class="nav-arrow" style="cursor:pointer;margin-right:15px;">← 前一篇</a>
            <a id="nextPost" class="nav-arrow" style="cursor:pointer;">后一篇 →</a>
        </div>
        `;

    tocContainer.innerHTML = html;
}

// 切换侧栏 (不变)
function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    sidebar.classList.toggle('active');
}

// 独立页面下的导航逻辑：需要再次加载posts.json来确定前后篇
async function addPostNavigation(currentFileBaseName) {
    try {
        const posts = await fetch('/json/posts.json').then(r => r.json()); // 注意：这里假设 posts.json 在网站根目录或已知路径

        // 找到完整的 file 路径 (e.g., '2025/2502.md')
        const currentPost = posts.find(p => p.file.endsWith(currentFileBaseName));
        if (!currentPost) return;

        const currentIndex = posts.findIndex(p => p.file === currentPost.file);

        const prevPost = posts[currentIndex + 1]; // 因为文章是按时间倒序排列
        const nextPost = posts[currentIndex - 1];

        const prevBtn = document.getElementById('prevPost');
        const nextBtn = document.getElementById('nextPost');

        if (prevPost) {
            prevBtn.innerHTML = `← ${prevPost.title}`;
            // 构造独立页面的路径，例如：/posts/2025/2502.html
            const prevPath = `/posts/${prevPost.file.replace('.md', '')}`;
            prevBtn.href = prevPath;
        } else {
            prevBtn.style.display = 'none';
        }

        if (nextPost) {
            nextBtn.innerHTML = `${nextPost.title} →`;
            const nextPath = `/posts/${nextPost.file.replace('.md', '')}`;
            nextBtn.href = nextPath;
        } else {
            nextBtn.style.display = 'none';
        }
    } catch (e) {
        console.error("加载 posts.json 或设置导航失败:", e);
        // 如果失败，至少隐藏导航按钮
        document.getElementById('prevPost').style.display = 'none';
        document.getElementById('nextPost').style.display = 'none';
    }
}


// 初始化加载
document.addEventListener('DOMContentLoaded', () => {
    loadPostStandalone().then(() => {
        document.getElementById('sidebarContent').style.opacity = 1;
    });
});