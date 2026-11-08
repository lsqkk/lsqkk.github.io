import { findSite } from './site-search-index.mjs';
import { searchResult, starterQueries } from './search-results.mjs';

const form = document.getElementById('siteSearchForm');
const input = document.getElementById('siteSearchInput');
const fulltext = document.getElementById('siteSearchFulltext');
const results = document.getElementById('siteSearchResults');
const status = document.getElementById('siteSearchStatus');
const bing = document.getElementById('bingSearchLink');
const localize = (href) => typeof window.buildLocalizedUrl === 'function' ? window.buildLocalizedUrl(href) : href;
let searchId = 0;

function suggestions(terms) {
    for (const term of terms) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'search-tag';
        button.textContent = term;
        button.onclick = () => { input.value = term; input.focus(); void search(); };
        results.append(button);
    }
}

async function search() {
    const id = ++searchId;
    const query = input.value.trim();
    const url = new URL(location.href);
    url.searchParams.delete('search');
    if (query) url.searchParams.set('q', query); else url.searchParams.delete('q');
    if (fulltext.checked) url.searchParams.set('full', '1'); else url.searchParams.delete('full');
    history.replaceState(history.state, '', url);
    bing.href = 'https://cn.bing.com/search?q=' + encodeURIComponent(query + ' site:' + bing.dataset.site);
    results.replaceChildren();
    if (!query) {
        status.textContent = '输入文章标题、工具名称，或试试下面的任务。';
        suggestions(starterQueries);
        return;
    }
    status.textContent = '正在加载站点索引…';
    try {
        const matches = await findSite(query, { includeFulltext: fulltext.checked });
        if (id !== searchId) return;
        if (!matches.length) {
            status.textContent = fulltext.checked ? '未找到相关结果，可以换一个说法。' : '未找到相关结果，可以换一个说法或打开全文搜索。';
            suggestions(starterQueries);
            return;
        }
        status.textContent = '找到 ' + matches.length + ' 条结果';
        results.replaceChildren(...matches.map((item) => searchResult(item, { localize })));
    } catch (error) {
        if (id !== searchId) return;
        status.textContent = error.message + '。';
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'search-tag';
        retry.textContent = '重试';
        retry.onclick = search;
        results.replaceChildren(retry);
    }
}

const params = new URLSearchParams(location.search);
input.value = params.get('q') || params.get('search') || '';
fulltext.checked = params.get('full') === '1';
form.addEventListener('submit', (event) => { event.preventDefault(); void search(); });
fulltext.addEventListener('change', search);
void search();
