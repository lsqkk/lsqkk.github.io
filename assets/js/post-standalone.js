/**
 * post-standalone.js 
 * 修改说明：移除 fetch/parse 逻辑，仅保留 DOM 处理和 UI 增强。
 */
// @ts-check

// 1. 初始化入口
document.addEventListener('DOMContentLoaded', async () => {
    initPostUI();
    wrapPostTables();
    await initPostGallery();
    initSidebarToggle();
    initBackToTop();

    // 如果 KaTeX 已经加载，渲染公式；否则等待加载
    if (window.renderMathInElement) {
        renderMath();
    } else {
        window.addEventListener('load', renderMath);
    }

    // 生成目录并添加导航
    generateTOC();
    initTOCSpy();
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

function wrapPostTables() {
    const tables = document.querySelectorAll('.post-content table');
    tables.forEach((table) => {
        if (!(table instanceof HTMLTableElement)) return;
        if (table.parentElement && table.parentElement.classList.contains('table-scroll')) return;
        const wrapper = document.createElement('div');
        wrapper.className = 'table-scroll';
        table.parentElement?.insertBefore(wrapper, table);
        wrapper.appendChild(table);
    });
}

async function initPostGallery() {
    ensureStyle('/assets/css/dynamic-gallery.css', 'dynamic-gallery-style');
    try {
        await ensureScript('/assets/js/dynamic-gallery.js', 'dynamic-gallery-script');
    } catch (err) {
        console.warn('Dynamic gallery load failed', err);
        return;
    }

    if (!window.DynamicGallery || typeof window.DynamicGallery.registerImages !== 'function') {
        return;
    }

    const content = document.querySelector('.post-content');
    if (!content) return;
    const images = Array.from(content.querySelectorAll('img'));
    if (!images.length) return;

    const urls = images.map((img) => img.currentSrc || img.src).filter(Boolean);
    if (!urls.length) return;
    const galleryId = window.DynamicGallery.registerImages(urls);
    if (!galleryId) return;

    images.forEach((img, index) => {
        if (!(img instanceof HTMLImageElement)) return;
        if (img.dataset.galleryBound === 'true') return;
        img.dataset.galleryBound = 'true';
        img.classList.add('post-gallery-image');
        img.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            window.DynamicGallery.open(galleryId, index);
        });
    });
}

function initSidebarToggle() {
    const toggle = document.querySelector('.sidebar-toggle');
    if (toggle instanceof HTMLElement) {
        toggle.setAttribute('aria-expanded', 'false');
    }
}

function initBackToTop() {
    const button = document.querySelector('.back-to-top');
    if (!(button instanceof HTMLElement)) return;
    const updateVisibility = () => {
        if (window.scrollY > 240) {
            button.style.opacity = '1';
            button.style.pointerEvents = 'auto';
            button.style.transform = 'translateY(0)';
        } else {
            button.style.opacity = '0';
            button.style.pointerEvents = 'none';
            button.style.transform = 'translateY(6px)';
        }
    };
    updateVisibility();
    window.addEventListener('scroll', updateVisibility, { passive: true });
    button.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
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
                tagsContainer.innerHTML = tags.map((tag) => {
                    const href = `/posts?tag=${encodeURIComponent(tag)}`;
                    return `<a class="post-tag post-tag-link" href="${href}">${tag}</a>`;
                }).join('');
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
    const headings = Array.from(document.querySelectorAll('.post-content h1, .post-content h2, .post-content h3, .post-content h4'))
        .filter((heading) => heading.getClientRects().length > 0);
    const tocContainer = document.querySelector('.sidebar-main-content');
    if (!tocContainer) return;

    let html = '<div class="toc-highlight" id="toc-highlight"></div>';
    if (headings.length === 0) {
        html += '<p style="font-size:0.8em; color:#999;">暂无目录</p>';
    }

    headings.forEach((heading, index) => {
        const level = heading.tagName.toLowerCase();
        const id = `heading-${index}`;
        heading.id = id;
        html += `
        <div class="toc-item ${level}" data-heading="${id}">
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

function initTOCSpy() {
    const headings = Array.from(document.querySelectorAll('.post-content h1, .post-content h2, .post-content h3, .post-content h4'))
        .filter((heading) => heading.getClientRects().length > 0);
    const tocItems = Array.from(document.querySelectorAll('.toc-item'));
    const highlight = document.getElementById('toc-highlight');
    if (!headings.length || !tocItems.length || !(highlight instanceof HTMLElement)) return;

    const headingMap = new Map();
    tocItems.forEach((item) => {
        if (!(item instanceof HTMLElement)) return;
        const id = item.getAttribute('data-heading');
        if (!id) return;
        headingMap.set(id, item);
    });

    const updateActive = () => {
        let activeId = headings[0].id;
        const threshold = 140;
        for (const heading of headings) {
            const rect = heading.getBoundingClientRect();
            if (rect.top <= threshold) {
                activeId = heading.id;
            } else {
                break;
            }
        }
        tocItems.forEach((item) => item.classList.remove('active'));
        const activeItem = headingMap.get(activeId);
        if (activeItem) {
            activeItem.classList.add('active');
            const visualOffset = 20;
            const top = Math.max(0, activeItem.offsetTop - visualOffset);
            const height = activeItem.offsetHeight;
            highlight.style.transform = `translateY(${top}px)`;
            highlight.style.height = `${height}px`;
            highlight.style.opacity = '1';
        }
    };

    updateActive();
    window.addEventListener('scroll', () => {
        window.requestAnimationFrame(updateActive);
    }, { passive: true });
    window.addEventListener('resize', updateActive);
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
    const backdrop = document.querySelector('.sidebar-backdrop');
    if (!(sidebar instanceof HTMLElement)) return;
    const willOpen = !sidebar.classList.contains('active');
    sidebar.classList.toggle('active', willOpen);
    document.body.classList.toggle('sidebar-open', willOpen);
    if (backdrop instanceof HTMLElement) {
        backdrop.classList.toggle('active', willOpen);
    }
    const toggle = document.querySelector('.sidebar-toggle');
    if (toggle instanceof HTMLElement) {
        toggle.setAttribute('aria-expanded', String(willOpen));
    }
}

// 复制链接
function copyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
        alert("链接已复制到剪贴板");
    });
}
