export function searchResult(item, { compact = false, localize = (href) => href } = {}) {
    const row = document.createElement('article');
    row.className = 'search-result';
    const link = document.createElement('a');
    link.className = 'search-result-title';
    link.href = localize(item.href);
    link.textContent = item.title;
    row.append(link);

    const kind = document.createElement('span');
    kind.className = 'search-result-badge';
    kind.textContent = item.type;
    row.append(kind);

    if (item.description || item.meta?.date) {
        const summary = document.createElement('p');
        summary.className = 'search-result-meta';
        summary.textContent = item.description || item.meta.date;
        row.append(summary);
    }
    if (compact) return row;

    if (item.snippet) {
        const p = document.createElement('p');
        p.className = 'search-result-snippet';
        const mark = document.createElement('mark');
        mark.textContent = item.snippet[1];
        p.append(item.snippet[0], mark, item.snippet[2]);
        row.append(p);
    }
    const tags = document.createElement('div');
    tags.className = 'search-result-tags';
    for (const [values, prefix] of [[item.meta?.tags, '/posts/?tag='], [item.meta?.columns, '/posts/']]) {
        for (const value of (values || []).slice(0, 5)) {
            const tag = document.createElement('a');
            tag.className = 'search-tag';
            tag.href = localize(prefix + encodeURIComponent(value));
            tag.textContent = value;
            tags.append(tag);
        }
    }
    if (tags.childElementCount) row.append(tags);
    return row;
}

export const starterQueries = ['图片转文字', '做参考文献', '联机五子棋'];
