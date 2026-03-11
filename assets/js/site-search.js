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

async function runSearch(keyword) {
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
            const path = String(page.path);
            if (!path || path.endsWith('.xml') || path.endsWith('.txt')) return;
            const meta = postMetaMap.get(path) || null;
            merged.set(path, {
                path,
                title: page.title || (meta?.title || buildTitle(path, postTitleMap)),
                meta,
            });
        });
    }

    const fallbackPaths = pages.length ? urls : [];
    fallbackPaths.forEach((path) => {
        if (!path || path.endsWith('.xml') || path.endsWith('.txt')) return;
        if (merged.has(path)) return;
        const meta = postMetaMap.get(path) || null;
        merged.set(path, {
            path,
            title: meta?.title || buildTitle(path, postTitleMap),
            meta,
        });
    });

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
            return {
                ...item,
                score: Math.max(titleScore, pathScore, tagScore)
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
        const tagHtml = tags.slice(0, 6).map((tag) => `<span class="search-tag">${tag}</span>`).join('');
        const columnHtml = columns.slice(0, 3).map((col) => `<span class="search-tag search-tag-col">${col}</span>`).join('');
        const metaHtml = meta ? `
            <div class="search-result-tags">
                ${date ? `<span class="search-tag search-tag-date">${date}</span>` : ''}
                ${wordCount ? `<span class="search-tag search-tag-word">${wordCount}字${readTime ? ` · ${readTime}min` : ''}</span>` : ''}
                ${columnHtml}
                ${tagHtml}
            </div>
        ` : '';
        return `
            <a class="search-result" href="/${item.path}">
                <div class="search-result-title">${item.title}</div>
                <div class="search-result-meta">/${item.path}</div>
                ${metaHtml}
            </a>
        `;
    }).join('');
}

function initSearchPage() {
    const input = document.getElementById('siteSearchInput');
    const btn = document.getElementById('siteSearchBtn');
    if (!(input instanceof HTMLInputElement) || !(btn instanceof HTMLElement)) return;

    const params = new URLSearchParams(window.location.search);
    const initial = params.get('q') || params.get('search') || '';
    if (initial) {
        input.value = initial;
        runSearch(initial);
    }

    btn.addEventListener('click', () => {
        const value = input.value.trim();
        const url = new URL(window.location.href);
        if (value) {
            url.searchParams.set('q', value);
        } else {
            url.searchParams.delete('q');
        }
        window.history.replaceState({}, '', url);
        runSearch(value);
    });

    input.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            btn.click();
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSearchPage);
} else {
    initSearchPage();
}
