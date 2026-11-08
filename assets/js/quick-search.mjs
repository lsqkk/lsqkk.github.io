import { findSite, loadSearchIndex, siteRouteKey } from './site-search-index.mjs';
import { searchResult, starterQueries } from './search-results.mjs';
import { readPocket } from './pocket-store.mjs';
import { recentReading } from './reading-position.mjs';

export function mountQuickSearch(localize) {
    let dialog, input, results, status, all, source, sequence = 0;
    let active = -1;
    const searchUrl = (query) => localize('/search/' + (query ? '?q=' + encodeURIComponent(query) : ''));
    const getLinks = () => [...results.querySelectorAll('.search-result-title')];

    function select(index) {
        const links = getLinks();
        active = links.length ? (index + links.length) % links.length : -1;
        links.forEach((link, i) => link.classList.toggle('is-selected', i === active));
        links[active]?.scrollIntoView({ block: 'nearest' });
    }

    async function update() {
        const id = ++sequence;
        const query = input.value.trim();
        all.href = searchUrl(query);
        active = -1;
        results.replaceChildren();
        status.textContent = query ? '正在搜索…' : '常用入口';
        try {
            let entries;
            if (query) {
                entries = (await findSite(query)).slice(0, 7);
            } else {
                const index = await loadSearchIndex();
                const byPath = new Map(index.map((entry) => [siteRouteKey(entry.href), entry]));
                let pocket;
                try { pocket = readPocket(localStorage, new Set(byPath.keys())); } catch {}
                const pins = pocket?.pins || [];
                const recent = (pocket?.recent || []).filter((path) => !pins.includes(path));
                entries = [...pins.map((path) => ({ ...byPath.get(path), type: '收藏' })),
                    ...recent.map((path) => ({ ...byPath.get(path), type: '最近打开' }))].slice(0, 6);
                const reading = recentReading();
                if (reading) entries.unshift({ ...reading, type: '继续读' });
                if (!entries.length) entries = ['/tool', '/desk', '/games'].map((path) => byPath.get(path)).filter(Boolean);
            }
            if (id !== sequence || !dialog.open) return;
            status.textContent = query ? (entries.length ? '匹配结果' : '未找到相关结果，试试下面的关键词。') : '常用入口';
            results.replaceChildren(...entries.map((entry) => searchResult(entry, { compact: true, localize })));
            if (!entries.length) {
                for (const term of starterQueries) {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'quick-search-example';
                    button.textContent = term;
                    button.onclick = () => { input.value = term; input.focus(); void update(); };
                    results.append(button);
                }
            }
        } catch {
            if (id !== sequence) return;
            status.textContent = '站点索引暂时无法加载。';
            const retry = document.createElement('button');
            retry.type = 'button';
            retry.className = 'quick-search-example';
            retry.textContent = '重试';
            retry.onclick = () => void update();
            results.replaceChildren(retry);
        }
    }

    function open(trigger) {
        if (!dialog) {
            const style = document.createElement('link');
            style.rel = 'stylesheet';
            style.href = '/assets/css/quick-search.css';
            document.head.append(style);
            dialog = document.createElement('dialog');
            dialog.className = 'quick-search';
            dialog.setAttribute('aria-labelledby', 'quick-search-title');
            dialog.innerHTML = `<header><h2 id="quick-search-title">搜索奇夸克</h2>
                <button type="button" data-close aria-label="关闭搜索">×</button></header>
                <input type="search" placeholder="试试「图片转文字」" aria-label="搜索站内" autocomplete="off" maxlength="120" autofocus>
                <p class="quick-search-status" role="status"></p>
                <div class="quick-search-results"></div>
                <footer><a data-all>查看完整搜索与正文结果 ↗</a></footer>`;
            document.body.append(dialog);
            input = dialog.querySelector('input');
            results = dialog.querySelector('.quick-search-results');
            status = dialog.querySelector('[role="status"]');
            all = dialog.querySelector('[data-all]');
            dialog.querySelector('[data-close]').onclick = () => dialog.close();
            dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
            dialog.addEventListener('close', () => source?.focus({ preventScroll: true }));
            input.addEventListener('input', update);
            input.addEventListener('keydown', (event) => {
                if (event.isComposing) return;
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault();
                    select(active < 0 && event.key === 'ArrowUp' ? getLinks().length - 1 : active + (event.key === 'ArrowDown' ? 1 : -1));
                }
                if (event.key === 'Enter') {
                    event.preventDefault();
                    (getLinks()[active < 0 ? 0 : active] || all).click();
                }
            });
        }
        if (dialog.open) return;
        source = trigger;
        input.value = '';
        dialog.showModal();
        void update();
    }

    document.querySelector('[data-site-search-open]')?.addEventListener('click', (event) => {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        open(event.currentTarget);
    });
    document.addEventListener('keydown', (event) => {
        if (event.defaultPrevented || event.isComposing || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k') return;
        if (document.querySelector('dialog[open]')) return;
        event.preventDefault();
        open(document.activeElement);
    });
}
