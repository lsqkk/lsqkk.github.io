const scheduleKey = 'quark_personal_notices';
const readKey = 'quark_notice_reads';
const labels = { announcement: '站点公告', celebration: '节日庆祝', personal: '个人提醒' };

function readJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
}

export function localDate(date = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function getPersonalNotices() {
    const entries = readJson(scheduleKey, []);
    return Array.isArray(entries) ? entries : [];
}

export function savePersonalNotices(entries) {
    localStorage.setItem(scheduleKey, JSON.stringify(entries));
    window.dispatchEvent(new Event('quark-notices-updated'));
}

let feed;
export function loadSiteNotices() {
    return feed ??= fetch('/json/notices.json').then((response) => {
        if (!response.ok) throw new Error('站点通知暂时无法加载');
        return response.json();
    }).catch((error) => {
        feed = undefined;
        throw error;
    });
}

export function organizeNotices(entries, today = localDate()) {
    const items = entries.flatMap((entry) => {
        if (!entry?.id || !entry.title) return [];
        const year = Number(today.slice(0, 4));
        const firstYear = Math.max(year, Number(entry.startDate?.slice(0, 4)) || year);
        const years = [...new Set(Array.from({ length: 9 }, (_, index) => year - 8 + index)
            .concat(Array.from({ length: 9 }, (_, index) => firstYear + index)))];
        let dates = entry.annual
            ? years.map((y) => `${y}-${entry.annual}`)
                .filter((date) => (!entry.startDate || date >= entry.startDate) && localDate(new Date(`${date}T12:00:00`)) === date)
            : [entry.startDate];
        if (entry.annual) dates = [dates.filter((date) => date < today).at(-1),
            dates.find((date) => date === today), dates.find((date) => date > today)];
        return dates.filter(Boolean).map((date) => {
            const end = entry.annual ? date : entry.endDate;
            const state = date > today ? 'upcoming' : end && end < today ? 'archive' : 'active';
            return { ...entry, date, state, key: `${entry.id}@${date}` };
        });
    });
    return {
        active: items.filter((item) => item.state === 'active').sort((a, b) => b.date.localeCompare(a.date)),
        upcoming: items.filter((item) => item.state === 'upcoming').sort((a, b) => a.date.localeCompare(b.date)),
        archive: items.filter((item) => item.state === 'archive').sort((a, b) => b.date.localeCompare(a.date)),
    };
}

export function mountNotices() {
    const dialog = document.createElement('dialog');
    dialog.className = 'quark-site-dialog';
    dialog.setAttribute('aria-labelledby', 'quark-notice-title');
    dialog.innerHTML = `<header><div><small>QUARK · INBOX</small><h2 id="quark-notice-title">通知中心</h2></div>
        <form method="dialog"><button aria-label="关闭通知">×</button></form></header>
        <div class="quark-notice-body"></div><footer>
        <a href="/settings#notifications">通知设置与日程</a></footer>`;
    document.body.append(dialog);
    const body = dialog.querySelector('.quark-notice-body');
    const footer = dialog.querySelector('footer');
    let reads = readJson(readKey, {});
    if (!reads || typeof reads !== 'object' || Array.isArray(reads)) reads = {};
    let groups = organizeNotices([]);
    let loadFailed = false;

    const updateIndicators = () => {
        const unread = groups.active.filter((item) => !reads[item.key]).length;
        document.querySelectorAll('[data-quark-notice-open]').forEach((button) => {
            button.querySelector('.quark-notice-dot')?.toggleAttribute('hidden', !unread);
            button.setAttribute('aria-label', unread ? `通知中心，${unread} 条未读` : '通知中心');
        });
    };
    const markRead = (items) => {
        if (!items.some((item) => !reads[item.key])) return;
        items.forEach((item) => { reads[item.key] = true; });
        try { localStorage.setItem(readKey, JSON.stringify(reads)); } catch {}
        updateIndicators();
    };
    function card(item, popup = false) {
        const entry = document.createElement(popup ? 'article' : 'details');
        entry.className = 'quark-notice-entry';
        if (!popup && item.state === 'active') {
            entry.open = true;
            entry.classList.add('is-current');
        }
        const title = document.createElement(popup ? 'h3' : 'summary');
        title.textContent = item.title;
        const meta = document.createElement('small');
        meta.textContent = `${labels[item.kind] || '通知'} · ${item.date}${item.annual ? ' · 每年' : ''}`;
        const content = document.createElement('p');
        content.textContent = item.content;
        entry.append(title, meta, content);
        if (item.action && /^\/(?![\/\\])/.test(item.action.href)) {
            const link = document.createElement('a');
            link.href = item.action.href;
            link.textContent = item.action.label;
            entry.append(link);
        }
        return entry;
    }
    function render() {
        body.replaceChildren();
        if (loadFailed) {
            const hint = document.createElement('p');
            hint.textContent = '站点通知暂时无法加载，个人提醒仍可查看。';
            body.append(hint);
        }
        for (const [key, title] of [['active', '当前通知'], ['archive', '往期通知']]) {
            const heading = document.createElement('h3');
            heading.textContent = title;
            body.append(heading);
            if (!groups[key].length) {
                const empty = document.createElement('p');
                empty.textContent = '暂无';
                body.append(empty);
            }
            groups[key].forEach((item) => body.append(card(item)));
        }
        markRead(groups.active);
    }
    async function refresh(autoOpen = false) {
        let site = [];
        try { site = await loadSiteNotices(); loadFailed = false; }
        catch { loadFailed = true; }
        groups = organizeNotices([...site, ...getPersonalNotices()]);
        updateIndicators();
        const home = document.getElementById('announcement-container');
        if (home) {
            const latest = groups.active.find((item) => item.kind !== 'personal');
            home.querySelector('[data-quark-notice-label]').textContent = latest?.title || '暂无当前站点通知';
        }
        if (dialog.open && !footer.hidden) render();
        const prefs = window.QuarkUserPreferences?.get();
        if (!autoOpen || dialog.open || document.querySelector('dialog[open]') || prefs?.noticePopups === false) return;
        const item = groups.active.find((notice) => notice.popup && !reads[notice.key]
            && localStorage.getItem(`popup_never_${notice.id}`) !== 'true'
            && (notice.kind !== 'celebration' || prefs?.noticeCelebrations !== false));
        if (!item) return;
        footer.hidden = true;
        body.replaceChildren(card(item, true));
        dialog.classList.toggle('is-celebration', item.kind === 'celebration');
        dialog.showModal();
        markRead([item]);
    }
    document.addEventListener('click', (event) => {
        const opener = event.target.closest?.('[data-quark-notice-open]');
        if (!opener) return;
        event.preventDefault();
        if (dialog.open) return;
        footer.hidden = false;
        dialog.classList.remove('is-celebration');
        render();
        dialog.showModal();
        void refresh();
    });
    window.addEventListener('quark-notices-updated', () => void refresh());
    window.addEventListener('storage', (event) => {
        if (event.key === readKey) {
            const current = readJson(readKey, {});
            reads = current && typeof current === 'object' && !Array.isArray(current) ? current : {};
            updateIndicators();
        }
        if (event.key === scheduleKey) void refresh();
    });
    let day = localDate();
    setInterval(() => {
        const today = localDate();
        if (today === day) return;
        day = today;
        void refresh(true);
    }, 60_000);
    void refresh(true);
}
