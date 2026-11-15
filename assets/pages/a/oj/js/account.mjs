import { quotaHeaders, quotaLoginUrl, quotaNeedsVerification } from '../../../../js/quota-session.mjs';
import {
    canPublishSubmission, normalizeSubmission, submissionKey, OJ_BATCH_SIZE,
    OJ_SOLUTION_TITLE_LIMIT, OJ_SOLUTION_BODY_LIMIT,
} from './account-schema.mjs';

const cachePrefix = 'quark_oj_pending_v1:';
const sessionStorageKey = 'quark_quota_session';

function currentAccount() {
    const headers = quotaHeaders();
    const token = headers.Authorization?.split(' ')[1]?.split('.')[0];
    try {
        const claims = JSON.parse(atob(token.replaceAll('-', '+').replaceAll('_', '/')));
        if (!claims.networkLimited && /^[a-f0-9]{64}$/.test(claims.sub)) return { id: claims.sub, headers };
    } catch {}
    return null;
}

async function request(op, { headers = {}, data, problemId, before, signal } = {}) {
    const query = new URLSearchParams({ view: 'quark-oj', op });
    if (problemId != null) query.set('p', String(problemId));
    if (before) query.set('before', before);
    const timeout = AbortSignal.timeout(9_000);
    const response = await fetch(`__API_BASE__/api/db?${query}`, {
        method: data === undefined ? 'GET' : 'POST',
        headers: data === undefined ? headers : { ...headers, 'Content-Type': 'application/json' },
        body: data === undefined ? undefined : JSON.stringify(data),
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
        signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.error) {
        const error = new Error(result.error || '账号服务暂不可用，请稍后重试。');
        error.status = response.status;
        throw error;
    }
    return result;
}

function readPending(prefix) {
    const pending = new Map();
    try {
        for (let index = 0; index < localStorage.length; index++) {
            const key = localStorage.key(index);
            if (key?.startsWith(prefix)) {
                const entry = JSON.parse(localStorage.getItem(key));
                if (entry) pending.set(key.slice(prefix.length), entry);
            }
        }
    } catch {}
    return pending;
}

function keyForPending(context, entry) {
    const key = submissionKey(entry);
    const persisted = JSON.stringify(entry);
    context.pending.set(key, entry);
    try {
        localStorage.setItem(context.prefix + key, persisted);
        return true;
    } catch {
        return false;
    }
}

function mergeEntries(context) {
    return [...new Map([...context.entries, ...context.pending]).values()]
        .sort((a, b) => b.timestamp - a.timestamp || b.id.localeCompare(a.id));
}

async function importableEntry(old) {
    if (!old?.id?.startsWith('old-')) return normalizeSubmission(old);
    const material = JSON.stringify([old.problemId, old.timestamp, old.status, old.languageId, old.code]);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
    const id = 'legacy-' + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    return normalizeSubmission({ ...old, id });
}

export function openOjAccount(guestHistory, saveGuest) {
    const account = new EventTarget();
    let active = null;
    let initialReady;
    const changed = () => account.dispatchEvent(new Event('change'));

    function refreshIdentity() {
        const login = currentAccount();
        if ((active?.id || '') === (login?.id || '')) {
            if (active) active.headers = login.headers;
            return false;
        }
        active?.controller.abort();
        if (!login) {
            active = null;
        } else {
            const prefix = cachePrefix + login.id + ':';
            active = {
                ...login, prefix, controller: new AbortController(), entries: new Map(),
                pending: readPending(prefix), pulling: null, flushing: null,
                nextCursor: undefined, error: '', confirmed: false,
            };
        }
        changed();
        return true;
    }

    function rememberError(context, error) {
        if (active !== context) return;
        if (error?.status === 401) {
            context.confirmed = false;
            context.error = '登录已失效，请重新登录。';
        } else {
            context.error = error?.name === 'TimeoutError' || error instanceof TypeError
                ? '连接账号服务失败，请检查网络后重试。'
                : error?.message || '同步失败，请稍后重试。';
        }
    }

    async function pullPage(context, before) {
        const result = await request('history', { headers: context.headers, before, signal: context.controller.signal });
        if (active !== context) return undefined;
        for (const entry of result.entries ?? []) {
            const checked = normalizeSubmission(entry);
            if (checked) context.entries.set(submissionKey(checked), checked);
        }
        context.confirmed = true;
        changed();
        return result.nextCursor;
    }

    async function initialPull(context) {
        try {
            const initialPage = await pullPage(context);
            if (context.nextCursor === undefined) context.nextCursor = initialPage;
            context.error = '';
        } catch (error) {
            rememberError(context, error);
        } finally {
            if (active === context) changed();
        }
    }

    async function loadOlder(context) {
        if (context.pulling || !context.nextCursor || active !== context) return context.pulling;
        context.pulling = (async () => {
            try {
                while (context.nextCursor && active === context) {
                    const previous = context.nextCursor;
                    const next = await pullPage(context, previous);
                    context.nextCursor = next === previous ? null : next;
                }
            } catch (error) {
                rememberError(context, error);
            } finally {
                context.pulling = null;
                if (active === context) changed();
            }
        })();
        return context.pulling;
    }

    function flush(context) {
        if (context.flushing || active !== context) return context.flushing;
        context.flushing = (async () => {
            await Promise.resolve();
            try {
                while (active === context) {
                    const batch = [];
                    for (const entry of context.pending.values()) {
                        const checked = normalizeSubmission(entry);
                        if (checked) batch.push(checked);
                        if (batch.length >= OJ_BATCH_SIZE) break;
                    }
                    if (!batch.length) break;
                    await request('sync', { headers: context.headers, data: { entries: batch }, signal: context.controller.signal });
                    if (active !== context) break;
                    context.confirmed = true;
                    context.error = '';
                    for (const entry of batch) {
                        const key = submissionKey(entry);
                        context.entries.set(key, entry);
                        context.pending.delete(key);
                        try { localStorage.removeItem(context.prefix + key); } catch {}
                    }
                }
            } catch (error) {
                rememberError(context, error);
            } finally {
                context.flushing = null;
                if (active === context) changed();
            }
        })();
        return context.flushing;
    }

    function syncNow() {
        refreshIdentity();
        const context = active;
        if (!context) return Promise.resolve();
        if (context.refreshing) return context.refreshing;
        context.refreshing = Promise.resolve(context.pulling).then(() => {
            if (active !== context) return;
            context.nextCursor = undefined;
            return initialPull(context);
        }).then(() => {
            void loadOlder(context);
            return flush(context);
        }).finally(() => {
            context.refreshing = null;
            if (active === context) changed();
        });
        changed();
        return context.refreshing;
    }

    Object.defineProperties(account, {
        accountId: { get: () => active?.id || '' },
        ready: { get: () => initialReady },
        confirmed: { get: () => Boolean(active?.confirmed) },
        syncing: { get: () => Boolean(active?.refreshing || active?.flushing || active?.pulling || active?.initializing) },
        message: { get: () => {
            if (!active) return quotaHeaders().Authorization || quotaNeedsVerification()
                ? '如需账号同步，请使用 GitHub 或邮箱验证码重新登录。'
                : '游客的提交记录保存在当前浏览器。';
            if (active.error) return active.error;
            if (account.syncing) return '正在同步账号记录…';
            const localOnly = [...active.pending.values()].filter(entry => !normalizeSubmission(entry)).length;
            if (localOnly) return `已同步账号记录，${localOnly} 条超出同步限制的记录仅保存在当前浏览器。`;
            return '已连接账号同步。';
        } },
    });

    account.entries = () => active ? mergeEntries(active) : guestHistory();
    account.findEntry = async id => {
        if (!id) return undefined;
        const context = active;
        const find = () => account.entries().find(entry => entry.id === id);
        const immediate = find();
        if (immediate || !context) return immediate;
        await initialReady;
        if (active !== context) return undefined;
        const recent = find();
        if (recent) return recent;
        await loadOlder(context);
        return active === context ? find() : undefined;
    };
    account.guestCount = () => guestHistory().length;
    account.sync = syncNow;
    account.save = (entry, expectedAccountId) => {
        refreshIdentity();
        if (expectedAccountId !== undefined && expectedAccountId !== account.accountId) return false;
        if (!active) {
            const saved = saveGuest(entry);
            changed();
            return saved;
        }
        const saved = keyForPending(active, entry);
        void flush(active);
        changed();
        return saved;
    };
    account.importGuest = async () => {
        const context = active;
        if (!context?.confirmed) return { count: 0, skipped: 0 };
        let count = 0;
        let skipped = 0;
        for (const entry of guestHistory()) {
            const checked = await importableEntry(entry);
            if (active !== context) break;
            if (!checked) { skipped++; continue; }
            const key = submissionKey(checked);
            if (context.entries.has(key) || context.pending.has(key)) continue;
            keyForPending(context, checked);
            count++;
        }
        await flush(context);
        const pending = context.pending.size;
        return { count, skipped, pending };
    };
    account.solutions = problemId => request('solutions', {
        problemId, headers: active?.headers, signal: active?.controller.signal,
    });
    account.publish = async (problemId, submission, values) => {
        const context = active;
        if (!context?.confirmed) throw new Error('请先登录并完成账号同步。');
        await flush(context);
        if (active !== context) throw new Error('登录账号已切换。');
        return request('publish', {
            problemId, headers: context.headers, signal: context.controller.signal,
            data: { ...values, submission },
        });
    };
    account.withdraw = problemId => request('withdraw', {
        problemId, headers: active?.headers, data: {}, signal: active?.controller.signal,
    });

    // Guests render immediately. Signed-in users get the first page even if an
    // offline queue requires a longer background upload.
    refreshIdentity();
    const context = active;
    if (context) {
        context.initializing = true;
        initialReady = initialPull(context).then(() => {
            context.initializing = false;
            void loadOlder(context);
            void flush(context);
        });
    } else initialReady = Promise.resolve();

    window.addEventListener('online', () => void syncNow());
    window.addEventListener('storage', event => {
        if (!event.key || event.key === sessionStorageKey) {
            void syncNow();
        } else if (active && event.key.startsWith(active.prefix) && event.newValue) {
            const queue = readPending(active.prefix);
            for (const [key, entry] of queue) active.pending.set(key, entry);
            changed();
        } else if (!active && event.key.startsWith('quark_oj_')) {
            changed();
        }
    });
    window.addEventListener('focus', () => {
        if (refreshIdentity() || active?.error) void syncNow();
    });
    return account;
}

function element(tag, text, className) {
    const item = document.createElement(tag);
    if (text) item.textContent = text;
    if (className) item.className = className;
    return item;
}

function button(text, action) {
    const item = element('button', text);
    item.type = 'button';
    item.addEventListener('click', action);
    return item;
}

function loginLink(text = '登录并同步 ↗') {
    const login = element('a', text);
    login.href = quotaLoginUrl();
    return login;
}

export function mountOjSync(host, account) {
    if (!host) return;
    const status = element('p', '', 'oj-muted');
    status.setAttribute('role', 'status');
    const actions = element('div', '', 'oj-actions');
    const message = element('p', '', 'oj-muted');
    message.setAttribute('role', 'status');
    let importing = false;
    const retry = button('立即同步', () => void account.sync());
    const importButton = button('导入此浏览器的游客记录', async () => {
        importing = true;
        render();
        try {
            const { count, skipped, pending } = await account.importGuest();
            message.textContent = `已加入账号同步 ${count} 条${pending ? '，部分记录待同步' : ''}${skipped ? `，跳过 ${skipped} 条无法导入的记录` : ''}。`;
        } catch {
            message.textContent = '导入失败，请稍后重试。';
        } finally {
            importing = false;
            render();
        }
    });
    const manage = element('a', '账号管理 ↗');
    manage.href = '/a/account';
    const login = loginLink();
    actions.append(retry, importButton, manage, login);
    function render() {
        status.textContent = account.message;
        const signedIn = Boolean(account.accountId);
        retry.hidden = !signedIn;
        retry.disabled = account.syncing;
        importButton.hidden = !signedIn || !account.guestCount();
        importButton.disabled = importing || !account.confirmed;
        manage.hidden = !account.confirmed;
        login.hidden = account.confirmed;
        login.textContent = signedIn ? '重新登录 ↗' : '登录并同步 ↗';
    }
    host.replaceChildren(status, actions, message);
    account.addEventListener('change', render);
    render();
}

export function mountOjSolutions(host, { account, problemId, languages }) {
    if (!host) return;
    const list = element('div', '', 'oj-solutions-list');
    const status = element('p', '正在加载题解…', 'oj-muted');
    status.setAttribute('role', 'status');
    const signedOut = element('p', '登录并通过本题后可以发布题解。', 'oj-muted');
    signedOut.append(' ', loginLink('登录 ↗'));
    const gate = element('p', '', 'oj-muted');

    const form = element('form', '', 'oj-solution-form');
    const title = element('input');
    title.type = 'text';
    title.maxLength = OJ_SOLUTION_TITLE_LIMIT;
    title.required = true;
    const titleLabel = element('label', '题解标题');
    titleLabel.append(title);
    const explanation = element('textarea');
    explanation.rows = 5;
    explanation.maxLength = OJ_SOLUTION_BODY_LIMIT;
    explanation.required = true;
    explanation.placeholder = '说明思路、关键步骤和复杂度';
    const explanationLabel = element('label', '正文');
    explanationLabel.append(explanation);
    const selection = element('select');
    const selectionLabel = element('label', '附上通过的提交');
    selectionLabel.append(selection);
    const code = element('pre');
    const attachment = element('details', '', 'oj-solution-detail');
    const attachmentLabel = element('summary');
    attachment.append(attachmentLabel, code);
    const disclosure = element('p', '发布后，正文与所附源码将公开显示。', 'oj-muted');
    const actions = element('div', '', 'oj-actions');
    const submit = element('button', '发布题解', 'is-primary');
    submit.type = 'submit';
    const withdraw = button('撤下题解', async () => {
        if (!window.confirm('要撤下这篇公开题解吗？')) return;
        await update('题解已撤下。', () => account.withdraw(problemId));
    });
    actions.append(submit, withdraw);
    form.append(titleLabel, explanationLabel, selectionLabel, attachment, disclosure, actions);
    host.replaceChildren(element('h2', '题解'), status, list, signedOut, gate, form);

    let own;
    let selectedKey = '';
    let solutionsLoaded = false;
    let busy = false;
    let owner = account.accountId;
    let requestId = 0;
    const languageName = id => languages[id]?.[0] || `语言 ${id}`;
    const dateFormat = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'medium' });
    function attachments() {
        const options = new Map();
        for (const entry of account.entries()) {
            if (entry.problemId === problemId && canPublishSubmission(normalizeSubmission(entry))) {
                options.set(submissionKey(entry), entry);
            }
        }
        if (own?.submission && !options.has(own.submission)) {
            options.set(own.submission, { ...own, timestamp: Number(own.submission.slice(0, 13)) });
        }
        return options;
    }
    function renderState() {
        const options = attachments();
        if (!options.has(selectedKey)) selectedKey = own?.submission || options.keys().next().value || '';
        const selected = options.get(selectedKey);
        const labels = Array.from(options, ([key, entry]) => {
            const current = own?.submission === key ? ' · 当前已发布' : '';
            return `${dateFormat.format(entry.timestamp)} · ${languageName(entry.languageId)}${current}`;
        });
        const currentOptions = Array.from(selection.options);
        const keys = [...options.keys()];
        if (currentOptions.length !== options.size
            || !currentOptions.every((option, index) => option.value === keys[index] && option.text === labels[index])) {
            selection.replaceChildren(...keys.map((key, index) => new Option(labels[index], key)));
        }
        selection.value = selectedKey;
        selectionLabel.hidden = options.size < 2;
        selection.disabled = busy;
        attachment.hidden = !selected;
        attachmentLabel.textContent = selected ? `预览源码 · ${languageName(selected.languageId)}` : '';
        code.textContent = selected?.code || '';
        signedOut.hidden = Boolean(account.accountId);
        gate.hidden = !account.accountId || !solutionsLoaded || Boolean(account.confirmed && (selected || own));
        gate.textContent = account.confirmed
            ? '通过本题后，这里会显示发布入口。'
            : '同步账号后可以发布题解。';
        form.hidden = !solutionsLoaded || !account.confirmed || (!selected && !own);
        submit.disabled = busy || !selected;
        withdraw.disabled = busy;
        withdraw.hidden = !own;
        submit.textContent = own ? '更新题解' : '发布题解';
    }

    function renderSolution(solution) {
        const detail = element('details', '', 'oj-solution-detail');
        const summary = element('summary');
        const label = solution.author === own?.author ? '我的题解' : `练习者 ${solution.author.slice(0, 6)}`;
        summary.append(element('strong', solution.title), element('span', label, 'oj-muted'));
        detail.append(summary,
            element('p', solution.explanation, 'oj-solution-text'),
            element('p', languageName(solution.languageId), 'oj-muted'),
            element('pre', solution.code));
        return detail;
    }

    async function load(success = '') {
        const sequence = ++requestId;
        try {
            const data = await account.solutions(problemId);
            if (sequence !== requestId) return;
            own = data.own;
            selectedKey = own?.submission || '';
            solutionsLoaded = true;
            const solutions = data.solutions ?? [];
            if (own && !solutions.some(item => item.author === own.author)) solutions.unshift(own);
            list.replaceChildren(...solutions.map(renderSolution));
            title.value = own?.title || '';
            explanation.value = own?.explanation || '';
            status.textContent = success || (solutions.length ? '' : '还没有公开题解。');
        } catch (error) {
            if (sequence !== requestId) return;
            status.replaceChildren('题解加载失败。 ', button('重试', () => void load()));
        } finally {
            if (sequence === requestId) renderState();
        }
    }

    async function update(success, operation) {
        busy = true;
        status.textContent = '正在保存…';
        renderState();
        try {
            await operation();
            await load(success);
        } catch (error) {
            status.textContent = error.message || '操作失败，请稍后重试。';
        } finally {
            busy = false;
            renderState();
        }
    }

    form.addEventListener('submit', event => {
        event.preventDefault();
        if (!selectedKey || busy) return;
        const submission = selectedKey;
        void update('题解已发布。', () => account.publish(problemId, submission, {
            title: title.value, explanation: explanation.value,
        }));
    });
    selection.addEventListener('change', () => {
        selectedKey = selection.value;
        renderState();
    });
    account.addEventListener('change', () => {
        if (owner !== account.accountId) {
            owner = account.accountId;
            own = null;
            selectedKey = '';
            solutionsLoaded = false;
            title.value = '';
            explanation.value = '';
            void load();
        }
        renderState();
    });
    renderState();
    void load();
}
