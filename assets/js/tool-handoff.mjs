const destinations = { editor: '/tool/markdown/', export: '/tool/markdown/export/' };
const maxText = 256 * 1024;
const lifetime = 30 * 60 * 1000;
const key = (target) => 'quark.handoff.' + target;
const notices = new WeakMap();

function report(button, message) {
    let status = notices.get(button);
    if (!status) {
        status = document.createElement('span');
        status.className = 'quark-handoff-feedback';
        status.role = 'status';
        button.after(status);
        notices.set(button, status);
    }
    status.textContent = message;
}

export function openHandoff(button, target, title, text) {
    if (!text.trim()) { report(button, '这里还没有可带走的内容。'); return; }
    if (text.length > maxText) { report(button, '内容过长，请先导出为文件。'); return; }
    const token = crypto.randomUUID();
    try {
        sessionStorage.setItem(key(target), JSON.stringify({ token, title: title.slice(0, 100), text, time: Date.now() }));
    } catch {
        report(button, '浏览器暂时无法传递内容，可以复制或导出。');
        return;
    }
    location.assign(destinations[target] + '?handoff=' + token);
}

export function showHandoff(target, input, actions) {
    const url = new URL(location.href);
    const token = url.searchParams.get('handoff');
    if (!token) return;
    let payload;
    try { payload = JSON.parse(sessionStorage.getItem(key(target)) || 'null'); } catch {}
    const pane = document.createElement('section');
    pane.className = 'quark-handoff';
    pane.setAttribute('aria-label', '接收上一步的内容');
    const remove = () => {
        const currentUrl = new URL(location.href);
        currentUrl.searchParams.delete('handoff');
        history.replaceState(history.state, '', currentUrl);
        pane.remove();
    };
    input.before(pane);
    if (payload?.token !== token || typeof payload.text !== 'string' || payload.text.length > maxText ||
        !Number.isFinite(payload.time) || Date.now() - payload.time > lifetime) {
        pane.textContent = '接力内容已失效，请回到上一步重新发送。';
        return;
    }
    const heading = document.createElement('strong');
    heading.textContent = '收到「' + String(payload.title || '上一步的内容') + '」';
    const preview = document.createElement('pre');
    preview.textContent = payload.text.slice(0, 480) + (payload.text.length > 480 ? '…' : '');
    const buttons = document.createElement('div');
    const status = document.createElement('p');
    status.role = 'status';
    function finish() {
        try {
            const current = JSON.parse(sessionStorage.getItem(key(target)) || 'null');
            if (current?.token === token) sessionStorage.removeItem(key(target));
        } catch {}
        remove();
    }
    for (const [label, apply] of [...actions, ['取消', () => {}]]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.onclick = () => {
            try {
                if (apply(payload.text, payload.title) === false) return;
                finish();
                input.focus({ preventScroll: true });
            } catch { status.textContent = '无法应用内容，请检查浏览器存储后重试。'; }
        };
        buttons.append(button);
    }
    pane.append(heading, preview, buttons, status);
}

export function appendHandoff(current, incoming) {
    return current.trim() ? current.trimEnd() + '\n\n' + incoming : incoming;
}
