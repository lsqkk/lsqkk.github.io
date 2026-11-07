import { loadSiteNotices, organizeNotices } from './site-notices.mjs';
import { createDesk, deskPostFromMeta, readDesk } from './reading-desk-store.mjs';

const appearance = {
    theme: {
        label: '主题', topic: /主题|配色|深色|暗色|夜间模式|浅色|亮色|白天模式|theme|(?:dark|light) mode/i,
        choices: {
            system: ['跟随系统', /跟随系统|系统主题|system/i],
            light: ['浅色', /浅色|亮色|白天模式|\blight\b/i],
            dark: ['深色', /深色|暗色|夜间模式|\bdark\b/i],
        },
    },
    font: {
        label: '站点字体', topic: /字体|字型|文楷|唐美人|衬线|\bfont\b/i,
        choices: {
            xwwk: ['霞鹜文楷', /文楷|xwwk/i],
            tang: ['汉仪唐美人', /唐美人|tang/i],
            system: ['系统默认', /系统(?:默认|字体)|\bsystem\b/i],
            serif: ['衬线阅读', /(?<!无)衬线|(?<!sans-)\bserif\b/i],
        },
    },
    readingSize: {
        label: '文章字号', topic: /字号|字的大小|字体大小|文字大小|字(?:调|放|变|大|小|点)|阅读.{0,3}大小|text size|font size|reading size/i,
        choices: {
            normal: ['标准', /标准|默认|正常|调小|缩小|\b(?:normal|default)\b/i],
            large: ['大', /(?<![特最])大(?!小)|(?<!extra[ -])\blarge(?:r)?\b|\bincrease\b/i],
            extra: ['特大', /特大|最大|\b(?:extra[- ]?large|largest)\b/i],
        },
    },
    motion: {
        label: '动效', topic: /动效|动画|动画效果|motion|animations?/i,
        choices: {
            system: ['跟随系统', /跟随系统|系统设置|\bsystem\b/i],
            full: ['完整动效', /完整|全部|开启|打开|恢复|\b(?:full|enable)\b/i],
            reduce: ['减少动效', /减少|减弱|关闭|关掉|降低|\b(?:reduce|disable)\b/i],
        },
    },
};

const changeVerb = /切换|换(?:成|到)?|改(?:成|为|到)?|调(?:整|成|到|大|小)?|设(?:置)?(?:成|为)|开启|打开|关闭|关掉|减少|减弱|降低|放大|缩小|恢复|使用|\b(?:set|switch|change|enable|disable|reduce|increase)\b/i;
const hypothetical = /如果|假如|比如|例如|示例|假设|怎么|如何|教程|区别|是不是|能否支持|可以修改吗|会怎样|会发生|有什么|有哪些|什么是|是什么意思|为什么|解释|翻译|\b(?:how|example|if|whether|what happens|what is)\b/i;
const negated = /(?:不要|别|不用|无需|不想|不必|不能|不可以)\s*(?:再|去|帮我)?\s*(?:切换|换|改|调|设|开|关|减少|恢复|使用|用|放大|缩小)|\b(?:don['’]t|do not|never)\b/i;
const outsideQuotes = (query) => query.replace(/```[\s\S]*?```|`[^`]*`|“[^”]*”|「[^」]*」|"[^"]*"/g, '');
const currentArticle = '(?:这篇(?:文章)?|本文|当前(?:这篇)?文章|this article)(?!\\s*(?:文章)?[里中的内])';
const saveArticle = new RegExp(`(?:收藏|保存|加上|存下|\\b(?:save|bookmark)\\b)\\s*(?:一下)?\\s*${currentArticle}|(?:把|将)\\s*${currentArticle}\\s*(?:先)?\\s*(?:收藏|保存|加入|添加|放进|留到下次|存[到进入]|存起来)`, 'i');

function explicitChanges(query) {
    const candidates = new Map();
    const unquoted = outsideQuotes(query);
    if (/如果|假如|假设|\bif\b/i.test(unquoted)) return {};
    for (const clause of unquoted.split(/[，,。；;！!\n]/)) {
        const action = changeVerb.exec(clause);
        if (!action || hypothetical.test(clause) || negated.test(clause)) continue;
        const target = clause.slice(action.index);
        for (const [key, { topic, choices }] of Object.entries(appearance)) {
            if (!topic.test(clause)) continue;
            if (key === 'theme' && /关闭|关掉|disable/i.test(action[0])) continue;
            const options = Object.entries(choices);
            const afterVerb = options.filter(([, [, pattern]]) => pattern.test(target));
            const matches = afterVerb.length ? afterVerb : options.filter(([, [, pattern]]) => pattern.test(clause));
            if (matches.length !== 1) continue;
            const value = matches[0][0];
            candidates.set(key, !candidates.has(key) || candidates.get(key) === value ? value : null);
        }
    }
    return Object.fromEntries([...candidates].filter(([, value]) => value !== null));
}

function tool(name, description, activity, run, properties = {}) {
    return {
        definition: { type: 'function', function: { name, description,
            parameters: { type: 'object', properties, additionalProperties: false } } },
        activity,
        run,
    };
}

function readingBudget(query) {
    if (/半\s*(?:个)?小时/.test(query)) return 30;
    const time = query.match(/(?<![\d.])(\d{1,3}|[零一二两三四五六七八九十]{1,3})\s*(?:分钟|minutes?\b|min\b)/i)?.[1];
    if (!time) return null;
    if (/^\d+$/.test(time)) return Number(time);
    if (!/^(?:[零一二两三四五六七八九]|[一二两三四五六七八九]?十[一二三四五六七八九]?)$/.test(time)) return null;
    const digit = (value) => '零一二三四五六七八九'.indexOf(value.replace('两', '二'));
    const [tens, ones] = time.split('十');
    return ones === undefined ? Math.max(0, digit(tens)) : (tens ? digit(tens) : 1) * 10 + (ones ? digit(ones) : 0);
}

export function getQuarkBotTools(query, { includePage, showReadingResults } = {}) {
    const tools = [];
    const prefs = window.QuarkUserPreferences;
    const mentioned = Object.keys(appearance).filter((key) => appearance[key].topic.test(query));
    if (prefs && (mentioned.length || /网站设置|外观设置|阅读设置|site settings|appearance settings/i.test(query))) {
        tools.push(tool('read_site_appearance', '查看用户提到的网站外观选项和可用值。', '正在读取网站外观…', () => {
            const current = prefs.get();
            const fields = mentioned.length ? mentioned : Object.keys(appearance);
            const settings = Object.fromEntries(fields.map((key) => [appearance[key].label, {
                当前: appearance[key].choices[current[key]]?.[0],
                可用: Object.values(appearance[key].choices).map(([label]) => label),
            }]));
            return { result: { settings, settingsUrl: '/settings#appearance' }, detail: Object.keys(settings).join('、') };
        }));
        const allowed = explicitChanges(query);
        if (Object.keys(allowed).length) {
            const properties = Object.fromEntries(Object.entries(allowed).map(([key, value]) => [
                key, { type: 'string', enum: [value], description: appearance[key].label },
            ]));
            tools.push(tool('set_site_appearance', '立即应用用户在本条消息里明确要求的外观设置。只提交明确要求的字段，并以工具返回的结果为准。', '正在应用网站外观…', async (args) => {
                const patch = Object.entries(args);
                if (!patch.length || patch.some(([key, value]) => !Object.hasOwn(allowed, key) || value !== allowed[key])) {
                    return { result: { error: '参数不符合本条消息中明确指定的外观设置。请先向用户确认。' } };
                }
                const applied = await prefs.update(args, { sync: false });
                const settings = Object.fromEntries(patch.map(([key]) => [appearance[key].label, appearance[key].choices[applied[key]][0]]));
                const detail = Object.entries(settings).map(([label, value]) => `${label}：${value}`).join('，');
                return { result: { applied: settings, settingsUrl: '/settings#appearance' }, detail, receipt: `已应用：${detail}。` };
            }, properties));
        }
    }
    if (/通知|公告|弹窗|节日.{0,4}提醒|announcements?|notifications?/i.test(query)) {
        const archived = /往期|历史|以前|过去|archiv|previous|past/i.test(query);
        tools.push(tool('read_site_notices', `查看${archived ? '往期' : '当前'}的公开站点通知。`, '正在查看站点通知…', async () => {
            const groups = organizeNotices(await loadSiteNotices());
            const notices = (archived ? groups.archive : groups.active).slice(0, 5).map(({ title, date, content, action }) => ({
                title, date, content: content.slice(0, 400), ...(action && { action }),
            }));
            return { result: { notices }, detail: `${notices.length} 条${archived ? '往期' : '当前'}通知` };
        }));
    }
    if (includePage && /^\/posts\//.test(location.pathname) && /目录|章节|大纲|小节|outline|headings|table of contents/i.test(query)) {
        tools.push(tool('read_article_outline', '提取当前公开文章的章节标题与站内锚点。', '正在读取文章目录…', () => {
            const headings = [...document.querySelectorAll('.post-content :is(h2,h3,h4)')].slice(0, 20)
                .map((heading) => ({
                    title: heading.textContent.trim().slice(0, 120),
                    ...(heading.id && { url: `${location.origin}${location.pathname}#${encodeURIComponent(heading.id)}` }),
                })).filter((heading) => heading.title);
            return { result: { headings }, detail: `${headings.length} 个章节` };
        }));
    }
    const request = outsideQuotes(query);
    if (saveArticle.test(request) && !hypothetical.test(request)
        && !/不要|不用|无需|不想|别|已经|是否|有没有|收藏了|保存了|取消|移除|删除|下载|导出|离线|PDF|\b(?:don['’]t|do not|never|already|remove|download|export)\b/i.test(request)) {
        const meta = document.getElementById('post-tags-container');
        const post = meta && document.querySelector('.post-content') && deskPostFromMeta(meta.dataset);
        if (post) tools.push(tool('save_current_article', '把当前这篇文章加入浏览器的拾页待读清单。只在用户明确要求时调用。', '正在保存当前文章…', (args) => {
            if (Object.keys(args).length) return { result: { error: '只可保存当前文章，此工具没有参数。' } };
            const desk = createDesk();
            const alreadySaved = desk.read().queue.some((item) => item.url.split('#')[0] === post.url);
            if (!alreadySaved && !desk.add([post])) return { result: { error: desk.error } };
            const detail = alreadySaved ? '已在待读清单中' : '已加入待读清单';
            return { result: { status: detail, deskUrl: '/desk/' }, detail, receipt: `这篇文章${detail}。可在[拾页](/desk/)查看。` };
        }));
    }
    if (showReadingResults && /拾页|待读|阅读清单|reading (?:list|queue)/i.test(query)
        && /推荐|读哪|看哪|读什么|看什么|下一篇|接着读|继续读|还有什么|有(?:哪|几)|看看|查看|what to read|next|recommend|show/i.test(query)) {
        const budget = readingBudget(query);
        tools.push(tool('show_reading_queue', '按本轮给出的时间筛选拾页里的本机待读文章。由浏览器直接在对话中显示结果。', '正在查看拾页待读…', () => {
            const waiting = readDesk(undefined, true).queue.filter((item) => !item.completed);
            const items = waiting.filter((item) => budget === null || item.minutes <= budget).slice(0, 3);
            showReadingResults({ items, budget, hasWaiting: waiting.length > 0 });
            return { result: { displayed: true, deskUrl: '/desk/' }, detail: `本机显示 ${items.length} 篇`,
                receipt: '已在这条对话中显示拾页的筛选结果。' };
        }));
    }
    return tools;
}
