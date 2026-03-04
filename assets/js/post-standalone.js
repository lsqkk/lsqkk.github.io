/**
 * post-standalone.js 
 * 修改说明：移除 fetch/parse 逻辑，仅保留 DOM 处理和 UI 增强。
 */
// @ts-check

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
    addPostNavigationFromData();

    // 显示侧边栏内容
    const sidebarContent = document.getElementById('sidebarContent');
    if (sidebarContent instanceof HTMLElement) {
        sidebarContent.style.opacity = '1';
    }

    // 初始化段落划线点赞评论
    await initPostAnnotationFeature();
});

async function initPostAnnotationFeature() {
    ensureStyle('/assets/css/post-annotation.css', 'post-annotation-style');
    await ensureScript('/assets/js/post-annotation.js', 'post-annotation-script');
    if (typeof window.initPostAnnotations === 'function') {
        window.initPostAnnotations();
    }
}

/**
 * @param {string} href
 * @param {string} id
 */
function ensureStyle(href, id) {
    if (id && document.getElementById(id)) {
        return;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    if (id) {
        link.id = id;
    }
    document.head.appendChild(link);
}

/**
 * @param {string} src
 * @param {string} id
 * @returns {Promise<void>}
 */
function ensureScript(src, id) {
    return new Promise((resolve, reject) => {
        if (id) {
            const exists = document.getElementById(id);
            if (exists) {
                if (exists.dataset.loaded === 'true' || typeof window.initPostAnnotations === 'function') {
                    resolve();
                    return;
                }
                exists.addEventListener('load', () => resolve(), { once: true });
                exists.addEventListener('error', () => reject(new Error(`script load failed: ${src}`)), { once: true });
                return;
            }
        }

        const script = document.createElement('script');
        script.src = src;
        script.defer = true;
        if (id) {
            script.id = id;
        }
        script.onload = () => {
            script.dataset.loaded = 'true';
            resolve();
        };
        script.onerror = () => reject(new Error(`script load failed: ${src}`));
        document.body.appendChild(script);
    });
}

// 2. 渲染元数据和基础 UI
function initPostUI() {
    const tagsContainer = document.getElementById('post-tags-container');
    if (!(tagsContainer instanceof HTMLElement)) return;
    const date = tagsContainer.getAttribute('data-date');
    const wordCount = parseInt(tagsContainer.getAttribute('data-word-count') || '0', 10);
    const tagsJson = tagsContainer.getAttribute('data-tags');

    // 显示日期
    if (date) {
        const postDate = document.getElementById('post-date');
        if (postDate) {
            postDate.textContent = `发表于 ${date}`;
        }
    }

    // 显示字数和预计阅读时间
    const readTime = Math.ceil(wordCount / 400);
    const postWordcount = document.getElementById('post-wordcount');
    if (postWordcount) {
        postWordcount.textContent = `${wordCount}字 · ${readTime}min`;
    }

    // 显示标签
    if (tagsJson) {
        try {
            /** @type {string[]} */
            const tags = JSON.parse(tagsJson);
            if (tags && tags.length > 0) {
                tagsContainer.innerHTML = tags.map((tag) =>
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

    window.renderMathInElement(content, {
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

// 5. 侧边栏导航逻辑（使用构建期注入的数据，不再请求 posts.json）
function addPostNavigationFromData() {
    const tagsContainer = document.getElementById('post-tags-container');
    const prevBtn = document.getElementById('prevPost');
    const nextBtn = document.getElementById('nextPost');

    if (!(tagsContainer instanceof HTMLElement) ||
        !(prevBtn instanceof HTMLAnchorElement) ||
        !(nextBtn instanceof HTMLAnchorElement)) {
        return;
    }

    const prevTitle = tagsContainer.getAttribute('data-prev-title') || '';
    const prevUrl = tagsContainer.getAttribute('data-prev-url') || '';
    const nextTitle = tagsContainer.getAttribute('data-next-title') || '';
    const nextUrl = tagsContainer.getAttribute('data-next-url') || '';

    if (prevTitle && prevUrl) {
        prevBtn.innerHTML = `← ${prevTitle}`;
        prevBtn.href = prevUrl;
    } else {
        prevBtn.style.display = 'none';
    }

    if (nextTitle && nextUrl) {
        nextBtn.innerHTML = `${nextTitle} →`;
        nextBtn.href = nextUrl;
    } else {
        nextBtn.style.display = 'none';
    }
}

// 侧栏切换
function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar instanceof HTMLElement) {
        sidebar.classList.toggle('active');
    }
}

// 复制链接
function copyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
        alert("链接已复制到剪贴板");
    });
}
