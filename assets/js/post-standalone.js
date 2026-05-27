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

    // 显示侧边栏内容 — TOC 内容由 generateTOC 填充
    const tocContent = document.getElementById('postTocContent');
    if (tocContent instanceof HTMLElement) {
        tocContent.style.opacity = '1';
    }

    // 初始化动态侧栏遮罩（渐隐效果）
    updateSidebarMask();
    var sidebarScroll = document.querySelector('.post-sidebar-scroll');
    if (sidebarScroll) {
        sidebarScroll.addEventListener('scroll', updateSidebarMask, { passive: true });
    }
    window.addEventListener('resize', updateSidebarMask);

    // 初始化段落划线点赞评论
    await initPostAnnotationFeature();

    // 加载同标签/同专栏相关文章
    loadRelatedPosts();
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
    // On mobile, toggle post-toc-sidebar visibility
    const tocSidebar = document.getElementById('postTocSidebar');
    if (tocSidebar) {
        const isWide = window.matchMedia('(min-width: 1201px)').matches;
        if (!isWide) {
            tocSidebar.classList.remove('active');
        }
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

// ── Dynamic sidebar scroll mask ──
function applyScrollMask(el) {
    var st = el.scrollTop;
    var sh = el.scrollHeight;
    var ch = el.clientHeight;

    // No mask if content doesn't overflow
    if (sh <= ch + 1) {
        el.style.removeProperty('-webkit-mask-image');
        el.style.removeProperty('mask-image');
        return;
    }

    var atTop = st <= 3;
    var atBottom = sh - st - ch <= 3;

    var mask = 'linear-gradient(to bottom';
    if (atTop) {
        mask += ', black 0%';
    } else {
        mask += ', transparent 0%, black 16px';
    }
    mask += ', black calc(100% - 16px)';
    if (atBottom) {
        mask += ', black 100%';
    } else {
        mask += ', transparent 100%';
    }
    mask += ')';

    el.style.setProperty('-webkit-mask-image', mask);
    el.style.setProperty('mask-image', mask);
}

function updateSidebarMask() {
    var scrollEl = document.querySelector('.post-sidebar-scroll');
    if (scrollEl) applyScrollMask(scrollEl);
    var mobileEl = document.querySelector('.post-sidebar-group.active');
    if (mobileEl) applyScrollMask(mobileEl);
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

// 4. 生成目录 (TOC) — 单独在 toc-box 中
function generateTOC() {
    const tocContainer = document.getElementById('postTocContent');
    if (!tocContainer) return;

    var headings = Array.from(document.querySelectorAll('.post-content h1, .post-content h2, .post-content h3, .post-content h4'))
        .filter(function (heading) { return heading.getClientRects().length > 0; });

    var tocBox = document.getElementById('postTocBox');
    if (headings.length === 0) {
        // No headings — hide TOC box entirely
        if (tocBox) tocBox.classList.add('is-empty');
        return;
    }

    // Show TOC box (remove empty state if previously set)
    if (tocBox) tocBox.classList.remove('is-empty');

    var html = [
        '<div class="toc-shell">',
        '  <div class="toc-header">',
        '    <p class="toc-eyebrow">On This Page</p>',
        '    <div class="toc-title-row">',
        '      <h4 class="toc-title">文章目录</h4>',
        '      <span class="toc-count">' + headings.length + '</span>',
        '    </div>',
        '  </div>',
        '  <div class="toc-list-wrap">'
    ].join('\n');

    headings.forEach(function (heading, index) {
        var level = heading.tagName.toLowerCase();
        var id = 'heading-' + index;
        heading.id = id;
        html += [
            '<div class="toc-item ' + level + '" data-heading="' + id + '">',
            '  <a href="#' + id + '">',
            '    <span class="toc-item-marker">&gt;</span>',
            '    <span class="toc-item-text">' + heading.textContent + '</span>',
            '  </a>',
            '</div>'
        ].join('\n');
    });

    html += '</div></div>';

    tocContainer.innerHTML = html;
}

function initTOCSpy() {
    const headings = Array.from(document.querySelectorAll('.post-content h1, .post-content h2, .post-content h3, .post-content h4'))
        .filter((heading) => heading.getClientRects().length > 0);
    const tocItems = Array.from(document.querySelectorAll('.toc-item'));
    if (!headings.length || !tocItems.length) return;

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
        }

        // Auto-scroll sidebar to keep active item in view
        if (activeItem) {
            scrollActiveTocIntoView(activeItem);
        }
    };

    updateActive();
    window.addEventListener('scroll', () => {
        window.requestAnimationFrame(updateActive);
    }, { passive: true });
    window.addEventListener('resize', updateActive);
}

// ── Sidebar auto-scroll to keep active TOC item visible ──
function scrollActiveTocIntoView(activeItem) {
    var scrollContainer = document.querySelector('.post-sidebar-scroll');
    if (!scrollContainer) return;

    var itemRect = activeItem.getBoundingClientRect();
    var containerRect = scrollContainer.getBoundingClientRect();
    var relTop = itemRect.top - containerRect.top;
    var relBottom = itemRect.bottom - containerRect.top;
    var padding = 16;

    if (relBottom > containerRect.height - padding) {
        scrollContainer.scrollTop += relBottom - containerRect.height + padding;
    } else if (relTop < padding) {
        scrollContainer.scrollTop += relTop - padding;
    }
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

// 6. 同标签 / 同专栏相关文章
async function loadRelatedPosts() {
    var container = document.getElementById('post-tags-container');
    if (!(container instanceof HTMLElement)) return;

    var tagsJson = container.getAttribute('data-tags');
    var columnsJson = container.getAttribute('data-columns');
    var currentTitle = container.getAttribute('data-post-title') || '';
    var currentPath = container.getAttribute('data-post-path') || '';

    /** @type {string[]} */
    var tags = [];
    /** @type {string[]} */
    var columns = [];
    try { if (tagsJson) tags = JSON.parse(tagsJson); } catch (e) { tags = []; }
    try { if (columnsJson) columns = JSON.parse(columnsJson); } catch (e) { columns = []; }

    var hasTag = tags.length > 0;
    var hasColumn = columns.length > 0;
    if (!hasTag && !hasColumn) return;

    try {
        var resp = await fetch('/json/posts.json');
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        /** @type {Array<{title:string,file:string,date:string,tags:string[],columns:string[]}>} */
        var allPosts = await resp.json();
        if (!Array.isArray(allPosts)) throw new Error('Invalid posts.json');

        // Filter out current post by path
        var currentFile = '';
        // data-post-path looks like 2026/2606
        if (currentPath) currentFile = currentPath + '.md';

        // Same tag matches — show first matching tag name
        if (hasTag) {
            var tagLabel = tags[0] + '标签下的文章';
            var relatedByTag = allPosts.filter(function (p) {
                if (p.file === currentFile) return false;
                if (!Array.isArray(p.tags)) return false;
                return p.tags.some(function (t) { return tags.indexOf(t) >= 0; });
            }).slice(0, 5);

            renderRelatedList('relatedByTag', relatedByTag, tagLabel);
        }

        // Same column matches — show first matching column name
        if (hasColumn) {
            var colLabel = columns[0] + '专栏下的文章';
            var relatedByColumn = allPosts.filter(function (p) {
                if (p.file === currentFile) return false;
                if (!Array.isArray(p.columns) || p.columns.length === 0) return false;
                return p.columns.some(function (c) { return columns.indexOf(c) >= 0; });
            }).slice(0, 5);

            renderRelatedList('relatedByColumn', relatedByColumn, colLabel);
        }

        // Show the box if anything was rendered
        var box = document.getElementById('postRelatedBox');
        if (box && (document.getElementById('relatedByTag')?.children.length > 0 ||
                     document.getElementById('relatedByColumn')?.children.length > 0)) {
            box.classList.remove('is-empty');
        }
    } catch (e) {
        console.warn('相关文章加载失败:', e);
    }
}

/**
 * @param {string} containerId
 * @param {Array<{title:string,file:string,date:string}>} posts
 * @param {string} label
 */
function renderRelatedList(containerId, posts, label) {
    var container = document.getElementById(containerId);
    if (!container) return;
    if (!posts || posts.length === 0) {
        container.innerHTML = '';
        return;
    }
    var sectionId = containerId + '-items';
    var html = '<div class="related-section">';
    html += '<button class="related-toggle" type="button" aria-expanded="false" onclick="toggleRelatedSection(this)">';
    html += '<span class="related-toggle-icon">▶</span> ';
    html += '<span class="related-section-title">' + label + '</span>';
    html += '<span class="related-count">' + posts.length + '</span>';
    html += '</button>';
    html += '<div class="related-items" id="' + sectionId + '" hidden>';
    posts.forEach(function (p) {
        var slug = p.file.replace(/\.md$/i, '');
        var href = '/posts/' + slug;
        html += '<a class="related-post-item" href="' + href + '">' +
                p.title +
                '<span class="related-post-date">' + (p.date || '') + '</span>' +
                '</a>';
    });
    html += '</div></div>';
    container.innerHTML = html;
}

window.toggleRelatedSection = function(btn) {
    var items = btn.nextElementSibling;
    var expanded = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', String(!expanded));
    if (items) {
        items.hidden = expanded;
    }
};

// 侧栏切换（移动端展开/收起整个 sidebar-group）
function toggleSidebar() {
    const group = document.querySelector('.post-sidebar-group');
    const backdrop = document.querySelector('.sidebar-backdrop');
    if (!(group instanceof HTMLElement)) return;
    const willOpen = !group.classList.contains('active');
    group.classList.toggle('active', willOpen);
    document.body.classList.toggle('sidebar-open', willOpen);
    if (backdrop instanceof HTMLElement) {
        backdrop.classList.toggle('active', willOpen);
    }
    const toggle = document.querySelector('.sidebar-toggle');
    if (toggle instanceof HTMLElement) {
        toggle.setAttribute('aria-expanded', String(willOpen));
    }

    // Update sidebar mask after toggle
    if (willOpen) {
        requestAnimationFrame(function () {
            updateSidebarMask();
            // Add scroll listener for mobile sidebar
            if (window.matchMedia('(max-width: 1100px)').matches && group) {
                group.addEventListener('scroll', updateSidebarMask, { passive: true });
            }
        });
    } else {
        // Clean up mobile mask and scroll listener on close
        if (group) {
            group.style.removeProperty('-webkit-mask-image');
            group.style.removeProperty('mask-image');
            group.removeEventListener('scroll', updateSidebarMask);
        }
    }
}

// Toast 提示
function showToast(message) {
    var existing = document.getElementById('post-toast');
    if (existing) existing.remove();

    var toast = document.createElement('div');
    toast.id = 'post-toast';
    toast.className = 'post-toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    // Trigger entrance
    requestAnimationFrame(function () {
        toast.classList.add('is-visible');
    });

    // Auto-dismiss
    setTimeout(function () {
        toast.classList.remove('is-visible');
        setTimeout(function () { toast.remove(); }, 300);
    }, 2200);
}

// 复制链接
function copyLink() {
    navigator.clipboard.writeText(window.location.href).then(function () {
        showToast('链接已复制');
    }).catch(function () {
        showToast('复制失败');
    });
}
