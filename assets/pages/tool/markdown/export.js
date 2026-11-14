const byId = (id) => document.getElementById(id);

export function downloadFile(name, type, value) {
    const url = URL.createObjectURL(new Blob([value], { type }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
}

export function setupExport({ input, preview, downloadWord, replaceText }) {
    const dialog = byId('export-dialog');
    const feedback = byId('export-feedback');
    const fields = ['font-family', 'base-font-size', 'text-color', 'h1-size', 'h1-color', 'paper-size', 'margin-top'];
    const storageKey = 'markdownCustomStyles';
    let stored = {};
    try { stored = JSON.parse(localStorage.getItem(storageKey)) || {}; } catch {}
    for (const field of fields) {
        if (stored[field] != null) byId(field).value = stored[field];
    }
    if (!byId('paper-size').value) byId('paper-size').value = 'a4';

    function filename() {
        return byId('export-name').value.trim().replace(/[\\/:*?"<>|\x00-\x1f]/g, '-') || 'markdown';
    }

    function number(id, min, max, fallback) {
        return Math.min(max, Math.max(min, Number(byId(id).value) || fallback));
    }

    function styles() {
        const family = byId('font-family').value.trim();
        const font = /^[\p{L}\p{N}\s'",-]+$/u.test(family) ? family : 'sans-serif';
        const size = number('base-font-size', 8, 40, 16);
        const heading = number('h1-size', 12, 72, 32);
        const margin = number('margin-top', 5, 45, 20);
        const paper = byId('paper-size').value;
        return `
            @page { size: ${paper}; margin: ${margin}mm; }
            body { font-family: ${font}; font-size: ${size}px; color: ${byId('text-color').value}; line-height: 1.65; }
            h1 { font-size: ${heading}px; color: ${byId('h1-color').value}; }
            img, svg { max-width: 100%; height: auto; }
            pre { white-space: pre-wrap; padding: .6em; background: #f4f5f7; }
            table { border-collapse: collapse; }
            td, th { border: 1px solid #b6b9bd; padding: .3em .6em; }
            blockquote { margin-left: 0; padding-left: 1em; border-left: 3px solid #ccc; }
        `;
    }

    function exportDocument() {
        const title = document.createElement('title');
        title.textContent = filename();
        const content = preview.cloneNode(true);
        // Keep the rendered diagram and formula elements, but avoid transient UI state.
        content.removeAttribute('id');
        return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">' +
            title.outerHTML + '<style>' + styles() + '</style></head><body>' + content.innerHTML + '</body></html>';
    }

    function withContent(fn) {
        feedback.textContent = '';
        if (!input.value.trim()) { feedback.textContent = '没有可导出的内容。'; return; }
        return fn();
    }

    byId('markdownHandoff').onclick = () => { feedback.textContent = ''; dialog.showModal(); };
    byId('download-md-btn').onclick = () => withContent(() => downloadFile(filename() + '.md', 'text/markdown;charset=utf-8', input.value));
    byId('download-html-btn').onclick = () => withContent(() => downloadFile(filename() + '.html', 'text/html;charset=utf-8', exportDocument()));
    byId('export-doc-btn').onclick = () => withContent(() => downloadFile(filename() + '.doc', 'application/msword;charset=utf-8', exportDocument()));
    byId('download-word-btn').onclick = () => withContent(() => downloadWord(filename()));
    byId('export-pdf-btn').onclick = () => withContent(() => {
        const frame = document.createElement('iframe');
        frame.title = '打印文档';
        frame.style.cssText = 'position:fixed;width:0;height:0;border:0';
        frame.onload = () => {
            frame.contentWindow.document.title = filename();
            frame.contentWindow.addEventListener('afterprint', () => frame.remove(), { once: true });
            frame.contentWindow.focus();
            frame.contentWindow.print();
        };
        frame.srcdoc = exportDocument();
        document.body.append(frame);
    });
    byId('save-styles-btn').onclick = () => {
        try {
            localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(fields.map(field => [field, byId(field).value]))));
            feedback.textContent = '已保存导出设置。';
        } catch { feedback.textContent = '无法保存导出设置。'; }
    };
    const oldDraft = localStorage.getItem('markdownContent');
    const loadDraft = byId('load-content-btn');
    loadDraft.hidden = oldDraft === null;
    loadDraft.onclick = () => {
        if (replaceText(oldDraft, '用旧版导出稿替换当前编辑区？')) dialog.close();
    };
}
