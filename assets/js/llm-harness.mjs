import { readChatCompletion } from './llm-stream.mjs';

const searchTool = {
    type: 'function',
    function: {
        name: 'search_site',
        description: '搜索奇夸克站内公开页面、工具、实验室和文章索引。返回标题、简介、站内路径和完整 URL。引用时直接使用结果中的 url。',
        parameters: {
            type: 'object',
            properties: { query: { type: 'string', description: '简短关键词，如 OCR、番茄钟、OrangePi' } },
            required: ['query'],
            additionalProperties: false
        }
    }
};

let indexPromise;
async function getIndex() {
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
        const add = (path, title, type, description = '') => {
            if (!path || !title) return;
            const url = new URL(path, location.origin);
            if (url.origin !== location.origin) return;
            const href = url.pathname.replace(/\/index(?:\.html)?\/?$/, '/').replace(/\/$/, '') + '/';
            if (/^\/(?:api|login|settings|space|admin)(?:\/|$)|\/manage\//i.test(href)) return;
            records.set(href, { href, url: new URL(href, location.origin).href,
                title: String(title).slice(0, 140), type, description: String(description).slice(0, 220) });
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
        add('/a/qai/', 'QAI WebUI', '实验室', '支持自定义模型的 AI 对话工作台');
        add('/a/terminal/', 'Quark 终端', '实验室', '网页命令行和 AI 对话');
        (Array.isArray(pages) ? pages : []).forEach((page) => add('/' + page.path, page.title, '页面'));
        (Array.isArray(posts) ? posts : []).forEach((post) => add(
            post.file && `/posts/${post.file.replace(/\.md$/, '')}`, post.title, '文章',
            [post.description || post.summary, ...(post.tags || [])].filter(Boolean).join(' · ')));
        addCatalog(tools, 'tools', 'tool/', '工具');
        addCatalog(labs, 'projects', 'a/', '实验室');
        addCatalog(blog, 'functions', 'blog/', '博客');
        for (const key of ['multiplayer', 'singlePlayer', 'classic']) {
            for (const game of games?.[key] || []) {
                if (game.link) add(game.link.startsWith('/') ? game.link : `/games/${game.link}`, game.name, '游戏', game.description);
            }
        }
        if (![pages, posts, tools, labs, blog, games].some(Boolean)) indexPromise = undefined;
        return [...records.values()];
    }).catch((error) => { indexPromise = undefined; throw error; });
    return indexPromise;
}

export async function searchSite(query, signal) {
    const keyword = String(query || '').trim().slice(0, 120).toLowerCase();
    if (!keyword) return [];
    signal?.throwIfAborted();
    const records = await getIndex();
    signal?.throwIfAborted();
    const terms = [...new Set([keyword, ...keyword.split(/[\s，。、；,!?]+/).filter(Boolean)])];
    return records.map((record) => {
        const title = record.title.toLowerCase();
        const description = record.description.toLowerCase();
        const score = terms.reduce((sum, term) => sum + (title === term ? 20 : title.includes(term) ? 8
            : record.href.toLowerCase().includes(term) ? 4 : description.includes(term) ? 2 : 0), 0);
        return { record, score };
    }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 6).map((item) => item.record);
}

export async function runHarness({ settings, body, useSearch, signal, onProgress = () => {}, onText }) {
    const config = window.QuarkLLMConfig;
    const messages = [...body.messages];
    const sources = new Map();
    const trace = [];
    const started = performance.now();
    const maxToolRounds = 3;
    let callsLeft = 6;
    let totalUsage = null;
    const cachedSearches = new Map();
    let retryFinal = false;

    async function requestModel(request) {
        for (let attempt = 0; ; attempt++) {
            signal?.throwIfAborted();
            let response;
            try {
                response = await config.requestChat(settings, request, signal);
            } catch (error) {
                if (attempt || signal?.aborted || !(error instanceof TypeError)) throw error;
            }
            if (response?.ok) return readChatCompletion(response, {
                apiKey: settings.apiKey, signal, onUpdate: (update) => {
                    if (update.content) onText?.(update.content);
                }
            });
            if (response && (attempt || ![408, 429, 500, 502, 503, 504].includes(response.status))) {
                throw new Error(await config.parseErrorResponse(response, settings.apiKey));
            }
            if (response?.body) void response.body.cancel().catch(() => {});
            onProgress('连接暂时失败，正在自动重试…');
            await new Promise((resolve) => setTimeout(resolve, 700));
        }
    }

    for (let round = 0; round <= maxToolRounds + 1; round++) {
        signal?.throwIfAborted();
        const canUseTools = useSearch && round < maxToolRounds && callsLeft > 0;
        const finalMessages = retryFinal ? [
            { role: 'system', content: `直接回答用户的问题。工具阶段已经结束，请依据已有的站内资料作答，不再请求工具。站内资料：${JSON.stringify([...sources.values()])}` },
            ...body.messages
        ] : messages;
        onProgress(retryFinal ? '正在根据已找到的页面继续生成…' : round ? '正在整理工具结果…' : '正在请求模型…');
        const { message, usage, stopped } = await requestModel({
            ...body, messages: finalMessages, stream: Boolean(onText), ...(canUseTools ? { tools: [searchTool] } : {})
        });
        if (usage) {
            totalUsage ??= {};
            for (const key of ['prompt_tokens', 'completion_tokens', 'total_tokens']) {
                totalUsage[key] = (totalUsage[key] || 0) + (Number(usage[key]) || 0);
            }
        }
        const calls = Array.isArray(message?.tool_calls) ? message.tool_calls.filter((call) => call?.id) : [];
        const content = typeof message?.content === 'string' ? message.content.trim() : '';
        if (!calls.length && content) {
            return {
                text: content, reasoning: message.reasoning_content || '', usage: totalUsage,
                sources: [...sources.values()], trace, elapsed: Math.round(performance.now() - started), stopped
            };
        }
        onText?.('');
        if (!canUseTools || !calls.length) {
            if (retryFinal || !useSearch || stopped) break;
            callsLeft = 0;
            retryFinal = true;
            continue;
        }
        const accepted = calls.slice(0, callsLeft);
        messages.push({ role: 'assistant', content: message.content ?? null, tool_calls: accepted,
            ...(message.reasoning_content ? { reasoning_content: message.reasoning_content } : {}) });
        for (const call of accepted) {
            signal?.throwIfAborted();
            callsLeft--;
            let result;
            if (call.function?.name !== 'search_site') {
                result = { error: '工具不在允许列表中。' };
            } else {
                let query = '';
                try { query = String(JSON.parse(call.function.arguments).query || '').slice(0, 120); } catch {}
                onProgress(`正在搜索站内：${query}`);
                try {
                    const normalized = query.trim().toLowerCase();
                    let matches = cachedSearches.get(normalized);
                    if (!matches) {
                        matches = await searchSite(query, signal);
                        cachedSearches.set(normalized, matches);
                    }
                    matches.forEach((match) => sources.set(match.href, match));
                    trace.push({ query, count: matches.length });
                    result = { results: matches };
                } catch (error) {
                    if (signal?.aborted) throw signal.reason;
                    result = { error: '站点索引暂时无法加载。' };
                }
            }
            messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
        }
        if (accepted.length < calls.length) retryFinal = true;
    }
    if (sources.size) {
        return { text: '我找到了以下站内页面，可以从搜索记录中的链接继续查看。',
            trace, sources: [...sources.values()], usage: totalUsage, elapsed: Math.round(performance.now() - started) };
    }
    throw new Error('模型暂时未能生成回答，请稍后重试。');
}

export function appendRunDetails(parent, result, { showElapsed = true } = {}) {
    const trace = Array.isArray(result.trace) ? result.trace : [];
    const sources = Array.isArray(result.sources) ? result.sources : [];
    if (!trace.length && !sources.length && !showElapsed) return;
    const details = document.createElement('details');
    details.className = 'quark-run-details';
    const summary = document.createElement('summary');
    summary.textContent = [trace.length ? `站内搜索 ${trace.length} 次` : '运行详情',
        showElapsed && Number.isFinite(result.elapsed) ? `${(result.elapsed / 1000).toFixed(1)} 秒` : ''].filter(Boolean).join(' · ');
    details.append(summary);
    for (const step of trace) {
        const row = document.createElement('div');
        row.textContent = `${step.query || '空关键词'} · ${step.count} 条结果`;
        details.append(row);
    }
    for (const source of sources) {
        if (!/^\/(?![\/\\])/.test(source.href)) continue;
        const link = document.createElement('a');
        link.href = source.href;
        link.textContent = source.title;
        details.append(link);
    }
    parent.append(details);
}
