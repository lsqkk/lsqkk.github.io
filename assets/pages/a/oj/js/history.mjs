import { $, params, loadProblems, historyEntries, titleText, node, link, badge, dateLabel, problemUrl, verdicts, languages } from './workspace.mjs';

async function start() {
    const entries = historyEntries();
    const titles = new Map((await loadProblems().catch(() => [])).map(problem => [problem.id, titleText(problem.title)]));
    const label = entry => titles.get(entry.problemId) || `P${entry.problemId}`;
    const statusFilter = $('oj-verdict');
    const search = $('oj-search');
    const dialog = $('oj-record-detail');
    const size = 20;
    let page = 1;
    for (const [value, text] of Object.entries(verdicts)) {
        if (value !== 'OK') statusFilter.add(new Option(text, value));
    }
    search.value = params.get('p') || '';

    function open(entry) {
        $('oj-record-title').textContent = `P${entry.problemId} · ${label(entry)}`;
        const body = $('oj-record-content');
        const meta = node('div', null, 'oj-actions');
        meta.append(badge(entry.status), node('span', languages[entry.languageId]?.[0] || '语言未知'), node('time', dateLabel(entry.timestamp)));
        body.replaceChildren(meta);
        if (entry.time != null || entry.memory != null) {
            body.append(node('p', `耗时 ${entry.time ?? '—'} s · 内存 ${entry.memory ?? '—'} KB`, 'oj-muted'));
        }
        if (entry.cases?.length) {
            const list = node('ul', null, 'oj-case-list');
            entry.cases.forEach((test, index) => {
                const item = node('li');
                item.append(node('span', `用例 ${index + 1}`), badge(test.status));
                list.append(item);
            });
            body.append(list);
        }
        if (typeof entry.code === 'string') {
            body.append(node('pre', entry.code), link('在练习台打开源码 ↗', problemUrl(entry.problemId, { from: entry.id }), 'oj-button is-primary'));
        }
        if (!dialog.open) dialog.showModal();
    }

    function render() {
        const query = search.value.trim().toLowerCase().replace(/^p(?=\d)/, '');
        const filtered = entries.filter(entry =>
            (!statusFilter.value || entry.status === statusFilter.value) &&
            (!query || String(entry.problemId).includes(query) || label(entry).toLowerCase().includes(query)));
        const pages = Math.max(1, Math.ceil(filtered.length / size));
        $('oj-feedback').textContent = `${filtered.length} 条提交`;
        $('oj-page').textContent = `${page} / ${pages}`;
        $('oj-prev').disabled = page === 1;
        $('oj-next').disabled = page >= pages;
        const rows = filtered.slice((page - 1) * size, page * size).map(entry => {
            const row = node('button', null, 'oj-feed-row');
            const title = node('span');
            title.append(node('strong', label(entry)), node('small', `P${entry.problemId} · ${languages[entry.languageId]?.[0] || '语言未知'}`));
            row.append(title, badge(entry.status), node('time', dateLabel(entry.timestamp)));
            row.onclick = () => open(entry);
            return row;
        });
        $('oj-records').replaceChildren(...(rows.length ? rows : [node('p', entries.length ? '没有匹配的提交。' : '还没有提交记录。', 'oj-empty')]));
    }

    search.oninput = statusFilter.onchange = () => { page = 1; render(); };
    $('oj-prev').onclick = () => { page--; render(); };
    $('oj-next').onclick = () => { page++; render(); };
    render();
    const selected = entries.find(entry => entry.id === params.get('entry'));
    if (selected) open(selected);
}

start();
