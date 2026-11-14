let indexPromise;
let fulltextPromise;

const aliases = {
    '/tool/ocr': ['图片转文字', '照片提取文字', '识别图片', '扫描文字'],
    '/tool/audio2txt': ['录音转文字', '音频转文字', '语音转文字', '听写'],
    '/tool/chat-analyzer': ['聊天记录分析与词云', '聊天词频', '关键词语境'],
    '/a/music-visualizer': ['音乐可视化', '声谱图', '音频片段循环'],
    '/tool/ref': ['做参考文献', '生成引用', '参考文献格式', 'GB/T 7714'],
    '/tool/pomodoro': ['专注计时', '计时器', '学习计时'],
    '/tool/decision': ['比较方案', '做决策', '利弊比较'],
    '/tool/markdown': ['写笔记', '编辑 Markdown', '协同编辑', 'Markdown 转 PDF', '笔记转 PDF', '导出 Word'],
    '/tool/calculator': ['算积分', '求导', '算矩阵', '解方程'],
    '/a/share': ['跨设备传文件', '发文件', '文件互传'],
    '/games/5ziqi': ['和朋友下五子棋', '在线五子棋', '联机五子棋'],
    '/games/xjtx': ['猜校园地点', '校园图寻', '交大地图猜地点'],
    '/desk': ['接着读', '继续阅读', '我的摘录', '待读'],
    '/a/quarkbot': ['问站内', '理解当前页', '网站助手'],
    '/a/qai': ['配置模型', '管理长对话', '自定义模型'],
    '/settings': ['切换深色模式', '调整字体', '网站设置'],
};

export function siteRouteKey(pathname) {
    return pathname.replace(/\/index(?:\.html)?\/?$/, '').replace(/\/+$/, '') || '/';
}

export async function loadSearchIndex() {
    if (indexPromise) return indexPromise;
    const files = ['/json/site-pages.json', '/json/posts.json', '/assets/pages/tool/tool.json',
        '/assets/pages/a/projects.json', '/assets/pages/blog/functions.json', '/assets/pages/games/game.json'];
    indexPromise = Promise.all(files.map(async (url) => {
        try {
            const response = await fetch(url, { redirect: 'error' });
            return response.ok ? await response.json() : null;
        } catch { return null; }
    })).then(([pages, posts, tools, labs, blog, games]) => {
        const records = new Map();
        const add = (path, title, type, description = '', indexedHref, meta) => {
            if (!path || !title) return;
            const url = new URL(path, location.origin);
            if (url.origin !== location.origin) return;
            const key = siteRouteKey(url.pathname);
            if (/^\/(?:api|login|space|admin)(?:\/|$)|\/(?:manage|admin-users)(?:\/|$)/i.test(key)) return;
            const href = indexedHref || records.get(key)?.href || (url.pathname.endsWith('/') && key !== '/' ? key + '/' : key);
            const previous = records.get(key);
            records.set(key, { href, url: new URL(href, location.origin).href,
                title: String(title).slice(0, 140), type,
                description: String(description || previous?.description || '').slice(0, 220),
                ...(meta && { meta }) });
        };
        const addCatalog = (catalog, collection, prefix, type) => {
            (catalog?.categories || []).flatMap((category) => category[collection] || []).forEach((item) => {
                const path = item.url || item.link;
                if (path) add(/^(\/|https?:)/i.test(path) ? path : `/${prefix}${path}`,
                    item.name, type, item.description || item.desc || item.intro || '');
            });
        };
        add('/', '奇夸克首页', '导航');
        add('/tool/', '工具箱', '导航');
        add('/posts/', '文章与博客', '导航');
        add('/games/', '游戏目录', '导航', '休闲游戏、多人游戏和经典游戏');
        add('/a/', '实验室', '导航');
        (Array.isArray(pages) ? pages : []).forEach((page) => {
            const href = typeof page.href === 'string' && /^\/(?![\/\\])/.test(page.href) ? page.href : undefined;
            add('/' + page.path, page.title, '页面', '', href);
        });
        (Array.isArray(posts) ? posts : []).forEach((post) => add(
            post.file && `/posts/${post.file.replace(/\.md$/, '')}`, post.title, '文章',
            post.description || post.summary, undefined,
            { tags: post.tags || [], columns: post.columns || [], date: post.date, wordCount: post.wordCount }));
        addCatalog(blog, 'functions', 'blog/', '博客');
        addCatalog(labs, 'projects', 'a/', '实验室');
        addCatalog(tools, 'tools', 'tool/', '工具');
        add('/desk/', '拾页 · 阅读工作台', '导航', '继续阅读、待读清单与私人摘录');
        add('/a/qai/', 'QAI WebUI', '工具', '配置模型、预设和附件，管理长对话');
        add('/a/quarkbot/', 'QuarkBot', '实验室', '问站内、理解当前页，继续之前的会话');
        add('/settings/', '网站设置', '导航', '调整主题、字体、动效和 AI 连接');
        for (const key of ['multiplayer', 'singlePlayer', 'classic']) {
            for (const game of games?.[key] || []) {
                if (game.link) add(/^(\/|https?:)/i.test(game.link) ? game.link : `/games/${game.link}`, game.name, '游戏', game.description);
            }
        }
        if (![pages, posts, tools, labs, blog, games].some(Boolean)) throw new Error('站点索引暂时无法加载');
        return [...records.values()];
    }).catch((error) => { indexPromise = undefined; throw error; });
    return indexPromise;
}

function normalize(value) {
    return String(value || '').normalize('NFKC').toLowerCase().replace(/[\s，。、；,!?！？·]+/g, '');
}

function match(text, term, weight) {
    const value = normalize(text);
    if (value === term) return weight;
    if (value.startsWith(term)) return weight * 0.7;
    return value.includes(term) ? weight * 0.5 : 0;
}

function excerpt(text, query) {
    const start = text.toLowerCase().indexOf(query.toLowerCase());
    if (start < 0) return null;
    const from = Math.max(0, start - 48);
    const to = Math.min(text.length, start + query.length + 48);
    return [`${from ? '…' : ''}${text.slice(from, start)}`, text.slice(start, start + query.length),
        `${text.slice(start + query.length, to)}${to < text.length ? '…' : ''}`];
}

async function fulltext() {
    fulltextPromise ??= fetch('/json/search-fulltext.json').then((response) => {
        if (!response.ok) throw new Error('正文索引暂时无法加载');
        return response.json();
    }).catch((error) => { fulltextPromise = undefined; throw error; });
    return fulltextPromise;
}

export async function findSite(query, { signal, includeFulltext = false } = {}) {
    const raw = String(query || '').trim().slice(0, 120);
    const keyword = normalize(raw);
    if (!keyword) return [];
    signal?.throwIfAborted();
    const [records, body] = await Promise.all([loadSearchIndex(), includeFulltext ? fulltext() : null]);
    signal?.throwIfAborted();
    const merged = new Map(records.map((record) => [siteRouteKey(record.href), record]));
    for (const item of [...(body?.posts || []), ...(body?.dynamics || [])]) {
        const snippet = excerpt(item.content, raw);
        if (!snippet) continue;
        const key = siteRouteKey(item.path);
        const record = merged.get(key) || { title: item.title, href: item.path, url: new URL(item.path, location.origin).href,
            type: item.type === 'post' ? '文章' : '动态', description: '', meta: item };
        merged.set(key, { ...record, type: item.type === 'dynamic' ? '动态' : record.type, snippet });
    }
    const terms = [...new Set([keyword, ...raw.split(/[\s，。、；,!?！？]+/).map(normalize).filter(Boolean)])];
    return [...merged].map(([key, record]) => {
        const names = aliases[key] || [];
        const tags = [...(record.meta?.tags || []), ...(record.meta?.columns || [])];
        const score = terms.reduce((total, term) => total + Math.max(
            match(record.title, term, 60), match(record.href, term, 20), match(record.description, term, 16),
            ...names.map((name) => match(name, term, 65)), ...tags.map((tag) => match(tag, term, 28))
        ), record.snippet ? 4 : 0);
        return { ...record, score };
    }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
}

export async function searchSite(query, signal) {
    const results = await findSite(query, { signal });
    return results.slice(0, 6).map(({ href, url, title, type, description }) => ({ href, url, title, type, description }));
}
