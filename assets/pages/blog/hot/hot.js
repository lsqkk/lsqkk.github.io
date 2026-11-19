const board = document.querySelector('[data-hotboard]');
const selects = [...board.querySelectorAll('[data-hot-source]')];
const panels = [...board.querySelectorAll('[data-hot-panel]')];
const search = board.querySelector('[data-hot-search]');
const refresh = board.querySelector('[data-hot-refresh]');
const dateFormat = new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Shanghai',
});
const cache = new Map();
const requests = new Map();
const errors = new Set();

function parseSnapshot(data) {
    if (!Array.isArray(data?.list)) throw new Error('缺少榜单数据');
    const items = new Map();
    for (const [index, row] of data.list.slice(0, 100).entries()) {
        const title = typeof row?.title === 'string' ? row.title.trim() : '';
        if (!title) continue;
        const key = title.normalize('NFKC').toLowerCase();
        if (items.has(key)) continue;
        let url;
        try {
            const link = new URL(row.url);
            if (['https:', 'http:'].includes(link.protocol) && !link.username && !link.password) url = link.href;
        } catch {
            // Some sources return entries without a link.
        }
        const rank = Number(row.index);
        const hot = row.hot_value ?? row.hot;
        items.set(key, {
            key, title, url,
            index: Number.isSafeInteger(rank) && rank > 0 ? rank : index + 1,
            hot_value: typeof hot === 'string' || typeof hot === 'number' ? String(hot) : '',
        });
    }
    const time = Date.parse(data.update_time);
    return {
        update_time: Number.isFinite(time) ? new Date(time).toISOString() : '',
        list: [...items.values()].sort((a, b) => a.index - b.index),
    };
}

function storageKey(source) {
    return 'quark:hotboard:v1:' + source;
}

function snapshots(source) {
    if (!cache.has(source)) {
        let history = {};
        try {
            const saved = JSON.parse(localStorage.getItem(storageKey(source)));
            if (saved?.current) history = {
                current: parseSnapshot(saved.current),
                previous: saved.previous ? parseSnapshot(saved.previous) : undefined,
            };
        } catch {
            // A blocked or invalid cache should leave the live board usable.
        }
        cache.set(source, history);
    }
    return cache.get(source);
}

function saveSnapshot(source, current) {
    const old = snapshots(source);
    if (old.current?.update_time && current.update_time && old.current.update_time > current.update_time) return;
    const previous = old.current?.update_time && current.update_time > old.current.update_time
        ? old.current
        : old.previous;
    const history = { current, previous };
    cache.set(source, history);
    try {
        localStorage.setItem(storageKey(source), JSON.stringify(history));
    } catch {
        // Memory cache still works for the current page.
    }
}

function renderPanel(panel, select) {
    const source = select.value;
    const { current, previous } = snapshots(source);
    const loading = requests.has(source);
    const failed = errors.has(source);
    const status = panel.querySelector('[data-hot-status]');
    const list = panel.querySelector('[data-hot-list]');
    const query = search.value.trim().normalize('NFKC').toLowerCase();
    const visible = current?.list.filter(item => item.key.includes(query)) ?? [];
    const canCompare = current?.update_time && previous?.update_time
        && current.update_time > previous.update_time && previous.list.length;
    const oldRanks = new Map(canCompare ? previous.list.map(item => [item.key, item.index]) : []);

    panel.querySelector('[data-hot-title]').textContent = select.selectedOptions[0].textContent;
    panel.querySelector('[data-hot-upstream]').href = 'https://uapis.cn/hotboard/' + source;
    const message = [];
    if (loading) message.push('正在获取榜单');
    if (failed) message.push(current ? '更新失败，显示本地缓存' : '暂时无法获取榜单，请刷新重试');
    if (current) {
        message.push(current.update_time ? '榜单更新于 ' + dateFormat.format(new Date(current.update_time)) + '（北京时间）' : '上游未提供更新时间');
        if (canCompare) message.push('对照 ' + dateFormat.format(new Date(previous.update_time)));
        if (!current.list.length) message.push('暂无条目');
        else if (query) message.push(visible.length ? '匹配 ' + visible.length + ' 条' : '没有匹配的话题');
    }
    status.textContent = message.join(' · ');
    status.hidden = false;

    list.replaceChildren(...visible.map(item => {
        const row = document.createElement('li');
        const detail = document.createElement('div');
        const heading = document.createElement('h3');
        const rank = document.createElement('span');
        rank.className = 'feature-count';
        rank.textContent = item.index + '. ';
        heading.append(rank);
        if (item.url) {
            const link = document.createElement('a');
            link.href = item.url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = item.title;
            heading.append(link);
        } else {
            heading.append(item.title);
        }
        detail.append(heading);
        if (item.hot_value) {
            const hot = document.createElement('p');
            hot.className = 'feature-meta';
            hot.textContent = '热度 ' + item.hot_value;
            detail.append(hot);
        }
        row.append(detail);
        if (canCompare) {
            const old = oldRanks.get(item.key);
            const change = old - item.index;
            const trend = document.createElement('span');
            trend.className = 'feature-meta';
            trend.dataset.rankChange = '';
            trend.textContent = old === undefined ? '新上榜'
                : change > 0 ? '升 ' + change + ' 位'
                : change < 0 ? '降 ' + Math.abs(change) + ' 位'
                : '持平';
            row.append(trend);
        }
        return row;
    }));
    list.hidden = visible.length === 0;
}

function render() {
    panels.forEach((panel, index) => renderPanel(panel, selects[index]));
    refresh.disabled = selects.some(select => requests.has(select.value));
}

async function load(source) {
    if (requests.has(source)) return;
    requests.set(source, true);
    errors.delete(source);
    render();
    try {
        const endpoint = new URL('https://uapis.cn/api/v1/misc/hotboard');
        endpoint.searchParams.set('type', source);
        const response = await fetch(endpoint, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error('热榜请求失败');
        const snapshot = parseSnapshot(await response.json());
        if (!snapshot.list.length && snapshots(source).current?.list.length) throw new Error('榜单暂时为空');
        saveSnapshot(source, snapshot);
    } catch {
        errors.add(source);
    } finally {
        requests.delete(source);
        render();
    }
}

function updateChoices() {
    selects.forEach((select, index) => {
        const otherSource = selects[1 - index].value;
        for (const option of select.options) option.disabled = option.value === otherSource;
    });
}

selects.forEach(select => select.addEventListener('change', () => {
    updateChoices();
    load(select.value);
    render();
}));
search.addEventListener('input', render);
refresh.addEventListener('click', () => selects.forEach(select => load(select.value)));

board.querySelector('[data-hot-controls]').hidden = false;
updateChoices();
selects.forEach(select => load(select.value));
