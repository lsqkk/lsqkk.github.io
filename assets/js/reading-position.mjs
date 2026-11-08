const key = 'quark.reading-position.v1';
const pathOf = (path) => path.split(/[?#]/)[0].replace(/\/$/, '');
const validPath = (path) => /^\/posts\/(?!\/)[^?#\\]+$/.test(path);

function positions() {
    try {
        const data = JSON.parse(localStorage.getItem(key) || '{}');
        return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    } catch { return {}; }
}

function entries() {
    return Object.entries(positions()).filter(([path, value]) => validPath(path) &&
        typeof value?.title === 'string' && Number.isFinite(value.time) && Number.isFinite(value.fraction));
}

export function readingPosition(path) {
    return entries().find(([saved]) => saved === pathOf(path))?.[1];
}

export function resumeHref(path) {
    return readingPosition(path) ? pathOf(path) + '?resume=1' : path;
}

export function recentReading() {
    const recent = entries().sort((a, b) => b[1].time - a[1].time)[0];
    return recent && { href: resumeHref(recent[0]), title: recent[1].title };
}

export function trackReading(post, content) {
    const path = pathOf(post.url);
    const saved = readingPosition(path);
    const url = new URL(location.href);
    if (url.searchParams.get('resume') === '1') {
        url.searchParams.delete('resume');
        history.replaceState(history.state, '', url);
        if (saved && !url.hash) {
            const heading = typeof saved.heading === 'string' && document.getElementById(saved.heading);
            requestAnimationFrame(() => {
                if (heading && content.contains(heading)) heading.scrollIntoView();
                else window.scrollTo(0, scrollY + content.getBoundingClientRect().top + content.offsetHeight * saved.fraction - 100);
            });
        }
    }
    let timer;
    function save() {
        const rect = content.getBoundingClientRect();
        if (rect.top > -120 || rect.bottom < 64 || !rect.height) return;
        const heading = [...content.querySelectorAll('h2[id],h3[id],h4[id]')].findLast((el) => el.getBoundingClientRect().top <= 110);
        const position = { title: post.title, time: Date.now(), heading: heading?.id || '',
            fraction: Math.min(1, Math.max(0, (100 - rect.top) / rect.height)) };
        try {
            const all = entries().filter(([savedPath]) => savedPath !== path).sort((a, b) => b[1].time - a[1].time);
            localStorage.setItem(key, JSON.stringify(Object.fromEntries([[path, position], ...all.slice(0, 59)])));
        } catch { /* Reading continues if storage is unavailable. */ }
    }
    window.addEventListener('scroll', () => {
        clearTimeout(timer);
        timer = setTimeout(() => { timer = undefined; save(); }, 250);
    }, { passive: true });
    window.addEventListener('pagehide', () => {
        if (timer === undefined) return;
        clearTimeout(timer);
        save();
    });
}
