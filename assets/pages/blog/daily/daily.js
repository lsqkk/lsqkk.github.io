const archive = document.querySelector('[data-reading-archive]');
const months = [...archive.querySelectorAll('[data-archive-months] details')];
const search = archive.querySelector('[data-archive-search]');
const tag = archive.querySelector('[data-archive-tag]');
const budget = archive.querySelector('[data-archive-budget]');
const pick = archive.querySelector('[data-archive-pick]');
const reset = archive.querySelector('[data-archive-reset]');
const heading = archive.querySelector('[data-archive-heading]');
const status = archive.querySelector('[data-archive-status]');
const archiveStatus = status.textContent;
const originalOpen = new Map();
const storageKey = 'quark:reading-archive:v1:read';
const normalize = value => value.normalize('NFKC').toLowerCase();
let read = new Set();
let plan = null;
let filtered = false;
let storageUnavailable = false;

try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (Array.isArray(saved)) read = new Set(saved.filter(value => typeof value === 'string'));
} catch {
    // Missing browser storage should not block browsing or making a list.
}

const entries = [...archive.querySelectorAll('[data-archive-entry]')].map(row => ({
    row,
    url: row.querySelector('a').href,
    tags: JSON.parse(row.dataset.tags),
    minutes: Number(row.dataset.minutes),
    index: normalize(row.textContent),
    button: row.querySelector('[data-archive-read]'),
}));

function matches(entry) {
    const query = normalize(search.value.trim());
    return (!tag.value || entry.tags.includes(tag.value)) && entry.index.includes(query);
}

function render() {
    const filtering = Boolean(search.value.trim() || tag.value || plan);
    const visibleEntries = plan ?? entries.filter(matches);
    const visibleRows = new Set(visibleEntries.map(entry => entry.row));
    for (const entry of entries) {
        entry.row.hidden = !visibleRows.has(entry.row);
        const marked = read.has(entry.url);
        entry.button.hidden = false;
        entry.button.textContent = marked ? '已读' : '标为已读';
        entry.button.setAttribute('aria-pressed', String(marked));
    }
    for (const month of months) {
        if (filtering && !filtered) originalOpen.set(month, month.open);
        month.hidden = !month.querySelector('[data-archive-entry]:not([hidden])');
        if (filtering) month.open = !month.hidden;
        else if (filtered) month.open = originalOpen.get(month);
    }
    filtered = filtering;
    reset.hidden = !plan;
    heading.textContent = plan ? '短读清单' : '收藏档案';
    if (plan) {
        const minutes = plan.reduce((total, entry) => total + entry.minutes, 0);
        const finished = plan.filter(entry => read.has(entry.url)).length;
        status.textContent = plan.length
            ? '共 ' + plan.length + ' 篇，已读 ' + finished + ' 篇，预计 ' + minutes + ' / ' + budget.value + ' 分钟。'
            : '当前条件下没有符合时间预算的未读收藏。';
    } else {
        status.textContent = filtering ? '匹配 ' + visibleEntries.length + ' 篇收藏。' : archiveStatus;
    }
    if (storageUnavailable) status.textContent += ' 已读状态仅保留到本页关闭。';
}

function makePlan() {
    let remaining = Number(budget.value);
    plan = [];
    for (const entry of entries) {
        if (!matches(entry) || read.has(entry.url) || !Number.isFinite(entry.minutes)
            || entry.minutes <= 0 || entry.minutes > remaining) continue;
        plan.push(entry);
        remaining -= entry.minutes;
        if (remaining === 0) break;
    }
    render();
}

archive.addEventListener('click', event => {
    const entry = entries.find(item => item.button === event.target);
    if (!entry) return;
    if (read.has(entry.url)) read.delete(entry.url);
    else read.add(entry.url);
    try {
        localStorage.setItem(storageKey, JSON.stringify([...read]));
    } catch {
        storageUnavailable = true;
    }
    render();
});
const updateFilters = () => {
    if (plan) makePlan();
    else render();
};
search.addEventListener('input', updateFilters);
tag.addEventListener('change', updateFilters);
budget.addEventListener('change', updateFilters);
pick.addEventListener('click', makePlan);
reset.addEventListener('click', () => {
    plan = null;
    render();
    pick.focus();
});

archive.querySelector('[data-archive-controls]').hidden = false;
render();
