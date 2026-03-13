// @ts-check

function parseXml(text) {
    return new DOMParser().parseFromString(text, 'text/xml');
}

function normalizePathFromUrl(url) {
    try {
        const urlObj = new URL(url, window.location.origin);
        return urlObj.pathname.replace(/^\//, '').replace(/\/$/, '');
    } catch {
        return '';
    }
}

async function fetchTextWithFallback(target) {
    const tried = new Set();
    const urls = [];

    if (target) urls.push(target);
    try {
        const u = new URL(target, window.location.origin);
        urls.push(u.toString());
        urls.push(u.pathname.startsWith('/') ? u.pathname : `/${u.pathname}`);
    } catch {
        // ignore
    }

    for (const raw of urls) {
        const candidate = String(raw || '').trim();
        if (!candidate || tried.has(candidate)) continue;
        tried.add(candidate);
        try {
            const resp = await fetch(candidate, { cache: 'no-store' });
            if (resp.ok) return await resp.text();
        } catch {
            // try next candidate
        }
    }

    throw new Error(`fetch failed: ${target}`);
}

async function getSitemapUrls() {
    const urlSet = new Set();
    const candidates = ['/sitemap-index.xml', '/sitemap.xml', '/sitemap-0.xml'];

    for (const candidate of candidates) {
        try {
            const xmlText = await fetchTextWithFallback(candidate);
            const xmlDoc = parseXml(xmlText);

            const sitemapNodes = Array.from(xmlDoc.getElementsByTagName('sitemap'));
            if (sitemapNodes.length > 0) {
                const childUrls = [];
                sitemapNodes.forEach((node) => {
                    const loc = node.getElementsByTagName('loc')[0]?.textContent?.trim();
                    if (loc) childUrls.push(loc);
                });

                for (const child of childUrls) {
                    try {
                        const childPath = normalizePathFromUrl(child);
                        const childText = await fetchTextWithFallback(childPath ? `/${childPath}` : child);
                        const childDoc = parseXml(childText);
                        const locElements = Array.from(childDoc.getElementsByTagName('loc'));
                        locElements.forEach((el) => {
                            const p = normalizePathFromUrl(el.textContent || '');
                            if (p) urlSet.add(p);
                        });
                    } catch (e) {
                        console.warn('加载子 sitemap 失败:', child, e);
                    }
                }

                if (urlSet.size > 0) return Array.from(urlSet);
            }

            const locElements = Array.from(xmlDoc.getElementsByTagName('loc'));
            locElements.forEach((el) => {
                const p = normalizePathFromUrl(el.textContent || '');
                if (p) urlSet.add(p);
            });
            if (urlSet.size > 0) return Array.from(urlSet);
        } catch (error) {
            console.warn('加载站点地图失败:', candidate, error);
        }
    }

    return [];
}

async function loadSitePagesIndex() {
    try {
        const resp = await fetch('/json/site-pages.json', { cache: 'no-store' });
        if (!resp.ok) return [];
        return await resp.json();
    } catch {
        return [];
    }
}

async function loadPostsIndex() {
    try {
        const resp = await fetch('/json/posts.json');
        if (resp.ok) return await resp.json();
        const fallback = await fetch('/posts/posts.json');
        if (!fallback.ok) return [];
        return await fallback.json();
    } catch {
        return [];
    }
}

function buildBingUrl(keyword) {
    const q = `${keyword} site:lsqkk.github.io`;
    return `https://cn.bing.com/search?q=${encodeURIComponent(q)}`;
}

function escapeHtml(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizePath(path) {
    return String(path || '').replace(/^\/+/, '').replace(/\/$/, '');
}

function buildSnippet(content, keyword) {
    const text = String(content || '');
    const lowerText = text.toLowerCase();
    const lowerKeyword = keyword.toLowerCase();
    const index = lowerText.indexOf(lowerKeyword);
    if (index < 0) return '';
    const context = 48;
    const start = Math.max(0, index - context);
    const end = Math.min(text.length, index + lowerKeyword.length + context);
    const before = text.slice(start, index);
    const hit = text.slice(index, index + lowerKeyword.length);
    const after = text.slice(index + lowerKeyword.length, end);
    const prefix = start > 0 ? '…' : '';
    const suffix = end < text.length ? '…' : '';
    return `${prefix}${escapeHtml(before)}<mark>${escapeHtml(hit)}</mark>${escapeHtml(after)}${suffix}`;
}

function loadFulltextIndex() {
    if (window.__FULLTEXT_INDEX__) return window.__FULLTEXT_INDEX__;
    return { posts: [], dynamics: [] };
}

function scoreMatch(text, keyword) {
    const t = text.toLowerCase();
    const k = keyword.toLowerCase();
    if (t === k) return 3;
    if (t.startsWith(k)) return 2;
    if (t.includes(k)) return 1;
    return 0;
}

function buildTitle(path, postMap) {
    if (postMap.has(path)) return postMap.get(path);
    return path === '' ? '首页' : `/${path}`;
}

async function runSearch(keyword, fulltextEnabled) {
    const resultsEl = document.getElementById('siteSearchResults');
    const statusEl = document.getElementById('siteSearchStatus');
    const bingLink = document.getElementById('bingSearchLink');
    if (!resultsEl || !statusEl) return;

    const trimmed = keyword.trim();
    if (!trimmed) {
        resultsEl.innerHTML = '';
        statusEl.textContent = '请输入关键词开始搜索';
        if (bingLink) bingLink.setAttribute('href', buildBingUrl(''));
        return;
    }

    statusEl.textContent = '正在加载站点索引...';
    if (bingLink) bingLink.setAttribute('href', buildBingUrl(trimmed));

    const [pages, urls, posts] = await Promise.all([
        loadSitePagesIndex(),
        getSitemapUrls(),
        loadPostsIndex()
    ]);
    const postTitleMap = new Map();
    const postMetaMap = new Map();
    posts.forEach((post) => {
        if (post && post.file) {
            const path = `posts/${String(post.file).replace(/\.md$/, '')}`;
            postTitleMap.set(path, post.title || path);
            postMetaMap.set(path, {
                title: post.title || path,
                tags: Array.isArray(post.tags) ? post.tags : [],
                columns: Array.isArray(post.columns) ? post.columns : [],
                date: post.date || '',
                wordCount: post.wordCount || 0,
            });
        }
    });

    const merged = new Map();

    if (pages.length) {
        pages.forEach((page) => {
            if (!page || !page.path) return;
            const path = normalizePath(page.path);
            if (!path || path.endsWith('.xml') || path.endsWith('.txt')) return;
            const meta = postMetaMap.get(path) || null;
            merged.set(path, {
                path,
                title: page.title || (meta?.title || buildTitle(path, postTitleMap)),
                meta,
                kind: meta ? 'post' : 'page'
            });
        });
    }

    const fallbackPaths = pages.length ? urls : [];
    fallbackPaths.forEach((path) => {
        const cleanPath = normalizePath(path);
        if (!cleanPath || cleanPath.endsWith('.xml') || cleanPath.endsWith('.txt')) return;
        if (merged.has(cleanPath)) return;
        const meta = postMetaMap.get(path) || null;
        merged.set(cleanPath, {
            path: cleanPath,
            title: meta?.title || buildTitle(path, postTitleMap),
            meta,
            kind: meta ? 'post' : 'page'
        });
    });

    if (fulltextEnabled) {
        const fullIndex = loadFulltextIndex();
        const postItems = Array.isArray(fullIndex.posts) ? fullIndex.posts : [];
        const dynamicItems = Array.isArray(fullIndex.dynamics) ? fullIndex.dynamics : [];

        postItems.forEach((item) => {
            if (!item || !item.content) return;
            const snippet = buildSnippet(item.content, trimmed);
            if (!snippet) return;
            const path = normalizePath(item.path || '');
            if (!path) return;
            const existing = merged.get(path);
            const meta = existing?.meta || postMetaMap.get(path) || {
                title: item.title || path,
                tags: item.tags || [],
                columns: item.columns || [],
                date: item.date || '',
                wordCount: item.wordCount || 0
            };
            merged.set(path, {
                path,
                title: item.title || existing?.title || buildTitle(path, postTitleMap),
                meta,
                snippet,
                kind: 'post'
            });
        });

        dynamicItems.forEach((item) => {
            if (!item || !item.content) return;
            const snippet = buildSnippet(item.content, trimmed);
            if (!snippet) return;
            const path = normalizePath(item.path || '');
            if (!path) return;
            if (!merged.has(path)) {
                merged.set(path, {
                    path,
                    title: item.title || item.date || path,
                    meta: null,
                    snippet,
                    kind: 'dynamic',
                    date: item.date || ''
                });
            } else {
                const existing = merged.get(path);
                merged.set(path, {
                    ...existing,
                    snippet: existing.snippet || snippet,
                    kind: existing.kind || 'dynamic',
                    date: existing.date || item.date || ''
                });
            }
        });
    }

    const filtered = Array.from(merged.values())
        .map((item) => {
            const titleScore = scoreMatch(item.title || '', trimmed);
            const pathScore = scoreMatch(item.path || '', trimmed);
            let tagScore = 0;
            if (item.meta) {
                const tagText = (item.meta.tags || []).join(' ');
                const columnText = (item.meta.columns || []).join(' ');
                tagScore = Math.max(scoreMatch(tagText, trimmed), scoreMatch(columnText, trimmed));
            }
            const fulltextScore = item.snippet ? 1 : 0;
            return {
                ...item,
                score: Math.max(titleScore, pathScore, tagScore, fulltextScore)
            };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));

    if (filtered.length === 0) {
        statusEl.textContent = '未找到相关结果';
        resultsEl.innerHTML = '';
        return;
    }

    statusEl.textContent = `找到 ${filtered.length} 条结果`;
    resultsEl.innerHTML = filtered.map((item) => {
        const meta = item.meta;
        const tags = meta && Array.isArray(meta.tags) ? meta.tags : [];
        const columns = meta && Array.isArray(meta.columns) ? meta.columns : [];
        const date = meta?.date || '';
        const wordCount = meta?.wordCount || 0;
        const readTime = wordCount ? Math.ceil(wordCount / 400) : 0;
        const tagHtml = tags.slice(0, 6)
            .map((tag) => `<a class="search-tag tag-link" href="/posts?tag=${encodeURIComponent(tag)}"><i class="fa-solid fa-tag"></i>${tag}</a>`)
            .join('');
        const columnHtml = columns.slice(0, 3)
            .map((col) => `<a class="search-tag search-tag-col tag-link" href="/posts?columns=${encodeURIComponent(col)}"><i class="fa-solid fa-folder"></i>${col}</a>`)
            .join('');
        const metaHtml = meta ? `
            <div class="search-result-tags">
                ${date ? `<span class="search-tag search-tag-date">${date}</span>` : ''}
                ${wordCount ? `<span class="search-tag search-tag-word">${wordCount}字${readTime ? ` · ${readTime}min` : ''}</span>` : ''}
                ${columnHtml}
                ${tagHtml}
            </div>
        ` : (item.kind === 'dynamic' ? `
            <div class="search-result-tags">
                ${item.date ? `<span class="search-tag search-tag-date">${item.date}</span>` : ''}
                <span class="search-result-badge">动态全文</span>
            </div>
        ` : '');
        const badge = item.kind === 'post' && item.snippet ? `<span class="search-result-badge">文章全文</span>` : '';
        const snippetHtml = item.snippet ? `<div class="search-result-snippet">${item.snippet}</div>` : '';
        return `
            <div class="search-result" data-href="/${item.path}">
                <div class="search-result-title">${item.title}${badge}</div>
                <div class="search-result-meta">/${item.path}</div>
                ${metaHtml}
                ${snippetHtml}
            </div>
        `;
    }).join('');

    bindSearchResultLinks(resultsEl);
}

function initSearchPage() {
    const input = document.getElementById('siteSearchInput');
    const btn = document.getElementById('siteSearchBtn');
    const fulltextToggle = document.getElementById('siteSearchFulltext');
    if (!(input instanceof HTMLInputElement) || !(btn instanceof HTMLElement)) return;

    const params = new URLSearchParams(window.location.search);
    const initial = params.get('q') || params.get('search') || '';
    const fulltextInitial = params.get('full') === '1';
    if (fulltextToggle instanceof HTMLInputElement) {
        fulltextToggle.checked = fulltextInitial;
    }
    if (initial) {
        input.value = initial;
        runSearch(initial, fulltextInitial);
    }

    btn.addEventListener('click', () => {
        const value = input.value.trim();
        const url = new URL(window.location.href);
        const fulltextEnabled = fulltextToggle instanceof HTMLInputElement ? fulltextToggle.checked : false;
        if (value) {
            url.searchParams.set('q', value);
        } else {
            url.searchParams.delete('q');
        }
        if (fulltextEnabled) {
            url.searchParams.set('full', '1');
        } else {
            url.searchParams.delete('full');
        }
        window.history.replaceState({}, '', url);
        runSearch(value, fulltextEnabled);
    });

    input.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            btn.click();
        }
    });

    if (fulltextToggle instanceof HTMLInputElement) {
        fulltextToggle.addEventListener('change', () => {
            const value = input.value.trim();
            if (!value) return;
            btn.click();
        });
    }
}

function bindSearchResultLinks(container) {
    if (!(container instanceof HTMLElement)) return;
    container.querySelectorAll('.search-result').forEach((item) => {
        if (!(item instanceof HTMLElement)) return;
        if (item.dataset.bound === 'true') return;
        const href = item.getAttribute('data-href');
        if (!href) return;
        item.dataset.bound = 'true';
        item.setAttribute('role', 'link');
        item.setAttribute('tabindex', '0');
        item.addEventListener('click', (event) => {
            const target = event.target;
            if (target instanceof HTMLElement && target.closest('.tag-link')) {
                return;
            }
            window.location.href = href;
        });
        item.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                window.location.href = href;
            }
        });
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSearchPage);
} else {
    initSearchPage();
}
