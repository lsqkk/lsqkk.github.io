function displayPath(value) {
    try { return decodeURIComponent(value); }
    catch { return value; }
}

function distance(left, right) {
    let row = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let i = 0; i < left.length; i++) {
        const next = [i + 1];
        for (let j = 0; j < right.length; j++) {
            next.push(Math.min(next[j] + 1, row[j + 1] + 1, row[j] + Number(left[i] !== right[j])));
        }
        row = next;
    }
    return row[right.length];
}

async function showMatchingPages() {
    const pathname = location.pathname.replace(/^\/+|\/+$/g, '');
    const slug = pathname.replace(/\.html$/i, '');
    if (!slug || slug === '404') return;
    let pages;
    try {
        const response = await fetch('/json/site-pages.json', { redirect: 'error' });
        if (!response.ok) return;
        pages = await response.json();
    } catch { return; }
    if (!Array.isArray(pages)) return;
    const indexed = pages.filter((page) => typeof page?.path === 'string'
        && typeof page.href === 'string' && /^\/(?![\/\\])/.test(page.href));
    if (pathname !== slug && indexed.some((page) => page.path === slug && page.href === '/' + slug + '/')) {
        location.replace('/' + slug + '/' + location.search + location.hash);
        return;
    }
    const target = displayPath(slug).toLowerCase().slice(0, 140);
    const matches = indexed.map((page) => ({
        page,
        distance: distance(target, displayPath(page.path).toLowerCase().slice(0, 140)),
    })).filter((match) => match.distance <= Math.max(2, target.length * .55))
        .sort((a, b) => a.distance - b.distance).slice(0, 3);
    if (!matches.length) return;
    const list = document.getElementById('suggestionList');
    for (const { page } of matches) {
        const row = document.createElement('li');
        const link = document.createElement('a');
        const route = document.createElement('small');
        link.href = page.href;
        link.textContent = page.title || displayPath(page.href);
        route.textContent = displayPath(page.href);
        link.append(route);
        row.append(link);
        list.append(row);
    }
    document.getElementById('searchSuggestions').hidden = false;
}

void showMatchingPages();
