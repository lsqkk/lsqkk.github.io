// 获取当前页面的 file 参数
function getFileNameFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('file') || '';
}

// 从 JSON 数据中查找文章标题
async function fetchPostTitle() {
    const fileName = getFileNameFromURL(); // 获取文件名
    if (!fileName) return;

    try {
        // 加载 posts.json 文件
        const response = await fetch('json/posts.json');
        const posts = await response.json();

        // 查找当前文章的标题
        const post = posts.find(p => p.file === fileName);
        if (post) {
            document.title = `${post.title} - 夸克博客`; // 设置页面标题
        } else {
            document.title = `夸克博客`; // 如果未找到文章
        }
    } catch (error) {
        console.error('加载 JSON 数据失败:', error);
        document.title = `夸克博客`;
    }
}

window.onload = fetchPostTitle;

// 获取URL参数
function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
}

// 自定义Markdown渲染器以保留TeX
const renderer = {
    code(code, infostring) {
        if (infostring === 'math') {
            return `<div class="math-block">${code}</div>`;
        }
        return false; // 使用默认渲染
    }
};
marked.use({ renderer });

// 加载文章内容
async function loadPost() {
    const filename = getQueryParam('file');
    if (!filename) {
        document.getElementById('content').innerHTML = '<p>文章未找到</p>';
        return;
    }

    try {
        const postsData = await fetch('json/posts.json').then(r => r.json());
        const post = postsData.find(p => p.file === filename);
        // 在 loadPost 函数中找到这部分代码
        if (post) {
            // 显示日期
            const dateElement = document.getElementById('post-date');
            dateElement.textContent = `发表于 ${post.date}`;

            // 新增：显示字数和标签
            const wordCount = post.wordCount || 0;
            const readTime = Math.ceil(wordCount / 400);

            // 显示字数信息
            const wordCountElement = document.getElementById('post-wordcount');
            wordCountElement.textContent = `${wordCount}字·${readTime}min`;

            // 显示标签
            const tagsContainer = document.getElementById('post-tags-container');
            if (post.tags && post.tags.length > 0) {
                tagsContainer.innerHTML = post.tags.map(tag =>
                    `<span class="post-tag">${tag}</span>`
                ).join('');
            }
        } else {
            console.warn('未找到文章信息');
        }

        const mdContent = await fetch(`/posts/${filename}`).then(r => r.text());
        const htmlContent = marked.parse(mdContent);
        document.getElementById('content').innerHTML = htmlContent;


        // 渲染数学公式
        renderMathInElement(document.getElementById('content'), {
            delimiters: [
                { left: '$$', right: '$$', display: true },
                { left: '$', right: '$', display: false }
            ],
            throwOnError: false
        });

        generateTOC();
        addPostNavigation(filename);

    } catch (error) {
        document.getElementById('content').innerHTML = '<p>加载文章失败</p>';
    }
}

// 复制链接功能
function copyLink() {
    const currentURL = window.location.href;
    navigator.clipboard.writeText(currentURL).then(() => {
        const notice = document.getElementById('copy-notice');
        notice.style.display = 'inline';
        setTimeout(() => notice.style.display = 'none', 2000);
    }).catch(err => {
        console.error('复制失败:', err);
    });
}

// 切换黑暗/白天模式
function toggleMode() {
    const body = document.body;
    const modeToggle = document.querySelector('.mode-toggle');
    const isDarkMode = body.style.backgroundImage.includes('image/star.gif');

    if (isDarkMode) {
        body.style.backgroundImage = "url('image/light.gif')";
        modeToggle.innerText = '☀️';
    } else {
        body.style.backgroundImage = "url('image/star.gif')";
        modeToggle.innerText = '🌙';
    }
}
// 生成目录
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

    html += `
        <div style="margin-top: 20px;">
            <a id="prevPost" class="nav-arrow" style="cursor:pointer;margin-right:15px;">← 前一篇</a>
            <a id="nextPost" class="nav-arrow" style="cursor:pointer;">后一篇 →</a>
        </div>
        `;

    tocContainer.innerHTML = html;
}

// 切换侧栏
function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    sidebar.classList.toggle('active');
}

async function addPostNavigation(currentFile) {
    const posts = await fetch('json/posts.json').then(r => r.json());
    const currentIndex = posts.findIndex(p => p.file === currentFile);

    const prevPost = posts[currentIndex + 1]; // 因为文章是按时间倒序排列
    const nextPost = posts[currentIndex - 1];

    const prevBtn = document.getElementById('prevPost');
    const nextBtn = document.getElementById('nextPost');

    if (prevPost) {
        prevBtn.innerHTML = `← ${prevPost.title}`;
        prevBtn.href = `post.html?file=${prevPost.file}`;
    } else {
        prevBtn.style.display = 'none';
    }

    if (nextPost) {
        nextBtn.innerHTML = `${nextPost.title} →`;
        nextBtn.href = `post.html?file=${nextPost.file}`;
    } else {
        nextBtn.style.display = 'none';
    }
}


// 初始化加载
document.addEventListener('DOMContentLoaded', () => {
    loadPost().then(() => {
        document.getElementById('sidebarContent').style.opacity = 1;
    });
});