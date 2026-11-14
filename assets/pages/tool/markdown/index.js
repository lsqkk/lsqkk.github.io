import { appendHandoff, showHandoff } from '/assets/js/tool-handoff.mjs';

// DOM 元素
const markdownInput = document.getElementById('markdown-input');
const preview = document.getElementById('preview');
const wordCount = document.getElementById('word-count');
const clearBtn = document.getElementById('clear-btn');
const sampleBtn = document.getElementById('sample-btn');
const downloadHtmlBtn = document.getElementById('download-html-btn');
const downloadMdBtn = document.getElementById('download-md-btn');
const downloadWordBtn = document.getElementById('download-word-btn');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const notesList = document.getElementById('notesList');
const newNoteName = document.getElementById('newNoteName');
const addNoteBtn = document.getElementById('addNoteBtn');
const refreshNotes = document.getElementById('refreshNotes');
import { setupCollaboration } from './co.js';
import { setupExport } from './export.js';
const draftKey = 'quark.markdown.draft.v1';
const lastNoteKey = 'quark.markdown.last-note.v1';

// 示例 Markdown 内容
const sampleMarkdown = `# Markdown 与 TeX 公式示例

除支持markdown全部常见语法外，本编辑器还支持$TeX$ 和 $mermaid$语法，喜欢的话请收藏本工具~

[这是示例链接](https://lsqkk.github.io)

## 行内公式
这是行内公式 $E=mc^2$ 和 $\\frac{d}{dx}f(x)=\\lim_{h\\to 0}\\frac{f(x+h)-f(x)}{h}$ 的例子。

## 块级公式
$$
\\int_a^b f(x)dx = F(b) - F(a)
$$

## 代码块中的公式不会被转换：
\`\`\`  $这不是公式$
\`\`\`
`;

// 笔记管理
let notes = readNotes();
let currentNoteId = null;

// 显示 Toast 通知
let toastTimer;
function showToast(message, isError = false) {
    clearTimeout(toastTimer);
    toastMessage.textContent = message;
    toast.className = isError ? 'toast error show' : 'toast show';
    toastTimer = setTimeout(() => {
        toast.className = 'toast';
    }, 3000);
}

// 更新字数统计
function updateWordCount() {
    const text = markdownInput.value;
    const count = Array.from(text.trim()).length;
    const lines = count ? text.split(/\r?\n/).length : 0;
    wordCount.textContent = `${count} 字符 · ${lines} 行`;
}

// 渲染公式和图表，保留失败时的源码。
let renderTimer;
let mathQueue = Promise.resolve();
let mermaidInitialized = false;
function renderAll() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => {
        const generation = preview.firstChild;
        if (window.MathJax?.typesetPromise) {
            mathQueue = mathQueue.then(() => {
                if (generation === preview.firstChild) return window.MathJax.typesetPromise([preview]);
            }).catch(console.error);
        }
        const diagrams = [...preview.querySelectorAll('code.language-mermaid')];
        if (!window.mermaid?.run || !diagrams.length) return;
        if (!mermaidInitialized) {
            window.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
            mermaidInitialized = true;
        }
        for (const source of diagrams) {
            const node = document.createElement('div');
            node.className = 'mermaid';
            node.textContent = source.textContent;
            source.parentElement.after(node);
            window.mermaid.run({ nodes: [node], suppressErrors: true }).then(() => {
                if (node.querySelector('svg')) source.parentElement?.remove();
                else node.remove();
            }).catch(() => node.remove());
        }
    }, 180);
}

function convertToHTML(md) {
    return window.QuarkSafeMarkdown(md, { editor: true });
}

function readNotes() {
    try {
        const items = JSON.parse(localStorage.getItem('markdown-notes'));
        return Array.isArray(items) ? items.filter(note => typeof note?.id === 'string' && typeof note.name === 'string' && typeof note.content === 'string') : [];
    } catch {
        return [];
    }
}
// 渲染笔记列表
function renderNotesList() {
    notesList.innerHTML = '';
    notes.forEach(note => {
        const li = document.createElement('li');
        li.className = `note-item ${note.id === currentNoteId ? 'active' : ''}`;
        li.dataset.id = note.id;

        li.innerHTML = `
                <button type="button" class="note-name"></button>
                <div class="note-actions">
                    <button class="note-action-btn edit-note" title="重命名">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="note-action-btn delete-note" title="删除">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;

        li.querySelector('.note-name').textContent = note.name;
        li.addEventListener('click', (e) => {
            if (!e.target.closest('.note-action-btn')) {
                loadNote(note.id);
            }
        });

        notesList.appendChild(li);
    });

    // 添加事件监听器
    document.querySelectorAll('.edit-note').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const noteId = btn.closest('.note-item').dataset.id;
            editNote(noteId);
        });
    });

    document.querySelectorAll('.delete-note').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const noteId = btn.closest('.note-item').dataset.id;
            deleteNote(noteId);
        });
    });
}

// 加载笔记
function loadNote(noteId) {
    const note = notes.find(n => n.id === noteId);
    if (note) {
        collaboration?.leave(false);
        currentNoteId = noteId;
        try { localStorage.setItem(lastNoteKey, noteId); } catch {}
        markdownInput.value = note.content;
        refreshEditor();
        renderNotesList();
        showToast(`已加载笔记: ${note.name}`);
    }
}

// 添加新笔记
function addNote() {
    const name = newNoteName.value.trim();
    if (!name) {
        showToast('请输入笔记名称', true);
        return;
    }

    const newNote = {
        id: Date.now().toString(),
        name: name,
        content: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    notes = [...readNotes(), newNote];
    saveNotes();
    newNoteName.value = '';
    loadNote(newNote.id);
    showToast(`已创建笔记: ${name}`);
}

// 编辑笔记名称
function editNote(noteId) {
    const note = notes.find(n => n.id === noteId);
    if (!note) return;

    const newName = prompt('输入新的笔记名称', note.name);
    if (newName && newName.trim() !== note.name) {
        note.name = newName.trim();
        note.updatedAt = new Date().toISOString();
        saveNotes();
        renderNotesList();
        showToast('笔记名称已更新');
    }
}

// 删除笔记
function deleteNote(noteId) {
    if (!confirm('确定要删除此笔记吗？')) return;

    notes = notes.filter(n => n.id !== noteId);
    saveNotes();

    if (currentNoteId === noteId) {
        currentNoteId = null;
        try { localStorage.removeItem(lastNoteKey); } catch {}
        if (!collaboration.code) loadLocalDraft();
    }

    renderNotesList();
    showToast('笔记已删除');
}

// 保存笔记到localStorage
function saveNotes() {
    localStorage.setItem('markdown-notes', JSON.stringify(notes));
}

// 保存当前笔记内容
function saveCurrentNote() {
    if (!currentNoteId) {
        localStorage.setItem(draftKey, markdownInput.value);
        return;
    }

    notes = readNotes();
    const note = notes.find(n => n.id === currentNoteId);
    if (note) {
        note.content = markdownInput.value;
        note.updatedAt = new Date().toISOString();
        saveNotes();
    } else {
        throw new Error('笔记已在另一个标签页中删除');
    }
}

// 下载Word文件
async function downloadWord(filename) {
    const markdownText = markdownInput.value.trim();
    if (!markdownText) {
        showToast('没有内容可导出', true);
        return;
    }

    try {
        downloadWordBtn.classList.add('processing');
        showToast('正在生成Word文档...');

        const html = convertToHTML(markdownText);
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;

        const { Document, Paragraph, TextRun, HeadingLevel, AlignmentType,
            Table, TableRow, TableCell, WidthType, convertInchesToTwip,
            ExternalHyperlink, UnderlineType } = docx;

        const children = [];

        for (let i = 0; i < tempDiv.childNodes.length; i++) {
            const node = tempDiv.childNodes[i]; if (node.nodeName === 'P') {
                const paragraph = new Paragraph({ children: parseInlineNodes(node), spacing: { after: 200 } });
                children.push(paragraph);
            } else if (node.nodeName.match(/^H[1-6]$/)) {
                const level = parseInt(node.nodeName[1]);
                const headingLevel = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4,
                HeadingLevel.HEADING_5, HeadingLevel.HEADING_6][level - 1]; const paragraph = new Paragraph({
                    text: node.textContent,
                    heading: headingLevel, spacing: { before: 200, after: 100 }
                }); children.push(paragraph);
            } else if
                (node.nodeName === 'UL') {
                const listItems = node.querySelectorAll('li'); listItems.forEach(item => {
                    const paragraph = new Paragraph({
                        text: item.textContent,
                        bullet: { level: 0 },
                        spacing: { after: 100 }
                    });
                    children.push(paragraph);
                });
            }
            else if (node.nodeName === 'OL') {
                const listItems = node.querySelectorAll('li');
                listItems.forEach((item, index) => {
                    const paragraph = new Paragraph({
                        text: item.textContent,
                        numbering: { level: 0, reference: 'ordered-list', style: 'default' },
                        spacing: { after: 100 }
                    });
                    children.push(paragraph);
                });
            }
            else if (node.nodeName === 'PRE') {
                const code = node.textContent;
                const paragraph = new Paragraph({
                    children: [
                        new TextRun({
                            text: code,
                            font: 'Consolas',
                            size: 20,
                            color: '333333',
                            break: 1
                        })
                    ],
                    indent: { left: convertInchesToTwip(0.5) },
                    spacing: { line: 240, after: 100 },
                    border: {
                        bottom: { color: 'DDDDDD', size: 6, style: 'single' },
                        left: { color: 'DDDDDD', size: 6, style: 'single' },
                        right: { color: 'DDDDDD', size: 6, style: 'single' },
                        top: { color: 'DDDDDD', size: 6, style: 'single' }
                    },
                    shading: { fill: 'F5F5F5' }
                });
                children.push(paragraph);
            }
            else if (node.nodeName === 'TABLE') {
                const rows = node.querySelectorAll('tr');
                const tableRows = [];

                rows.forEach(row => {
                    const cells = row.querySelectorAll('td, th');
                    const tableCells = [];

                    cells.forEach(cell => {
                        const isHeader = cell.nodeName === 'TH';
                        const tableCell = new TableCell({
                            children: [
                                new Paragraph({
                                    children: parseInlineNodes(cell),
                                    alignment: AlignmentType.CENTER
                                })
                            ],
                            shading: isHeader ? { fill: 'F0F0F0' } : undefined
                        });
                        tableCells.push(tableCell);
                    });

                    tableRows.push(new TableRow({ children: tableCells }));
                });

                const table = new Table({
                    rows: tableRows,
                    width: { size: 100, type: WidthType.PERCENTAGE }
                });

                children.push(table);
            }
            else if (node.nodeName === 'BLOCKQUOTE') {
                const paragraph = new Paragraph({
                    children: parseInlineNodes(node),
                    indent: { left: convertInchesToTwip(0.5) },
                    border: { left: { color: '4A6FA5', size: 6, style: 'single' } },
                    spacing: { after: 100 }
                });
                children.push(paragraph);
            }
            else if (node.nodeName === 'HR') {
                children.push(
                    new Paragraph({
                        border: { bottom: { color: '999999', size: 6, style: 'single' } },
                        spacing: { after: 200, before: 200 }
                    })
                );
            }
        }

        const doc = new Document({
            styles: {
                paragraphStyles: [
                    {
                        id: 'Normal',
                        name: 'Normal',
                        run: {
                            font: '微软雅黑',
                            size: 24,
                            color: '333333'
                        },
                        paragraph: {
                            spacing: { line: 276, after: 100 }
                        }
                    },
                    {
                        id: 'Heading1',
                        name: 'Heading 1',
                        basedOn: 'Normal',
                        next: 'Normal',
                        run: {
                            font: '微软雅黑',
                            size: 32,
                            bold: true,
                            color: '4A6FA5'
                        },
                        paragraph: {
                            spacing: { before: 240, after: 120 }
                        }
                    },
                    {
                        id: 'Heading2',
                        name: 'Heading 2',
                        basedOn: 'Normal',
                        next: 'Normal',
                        run: {
                            font: '微软雅黑',
                            size: 28,
                            bold: true,
                            color: '4A6FA5'
                        },
                        paragraph: {
                            spacing: { before: 200, after: 100 }
                        }
                    }
                ]
            },
            numbering: {
                config: [
                    {
                        reference: 'ordered-list',
                        levels: [
                            {
                                level: 0,
                                format: 'decimal',
                                text: '%1.',
                                alignment: AlignmentType.START
                            }
                        ]
                    }
                ]
            },
            sections: [{
                properties: {},
                children: children
            }]
        });

        const blob = await docx.Packer.toBlob(doc);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename + '.docx';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast('Word文档生成成功！');
    } catch (error) {
        console.error('转换失败:', error);
        showToast('转换失败: ' + error.message, true);
    } finally {
        downloadWordBtn.classList.remove('processing');
    }
}

// 解析内联节点
function parseInlineNodes(parentNode) {
    const children = [];

    for (let node of parentNode.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
            if (node.textContent.trim()) {
                children.push(new docx.TextRun({
                    text: node.textContent,
                    font: '微软雅黑',
                    size: 24
                }));
            }
        }
        else if (node.nodeName === 'STRONG' || node.nodeName === 'B') {
            children.push(new docx.TextRun({
                text: node.textContent,
                bold: true,
                font: '微软雅黑',
                size: 24
            }));
        }
        else if (node.nodeName === 'EM' || node.nodeName === 'I') {
            children.push(new docx.TextRun({
                text: node.textContent,
                italics: true,
                font: '微软雅黑',
                size: 24
            }));
        }
        else if (node.nodeName === 'CODE') {
            children.push(new docx.TextRun({
                text: node.textContent,
                font: 'Consolas',
                size: 20,
                color: '333333'
            }));
        }
        else if (node.nodeName === 'A') {
            children.push(
                new docx.ExternalHyperlink({
                    children: [
                        new docx.TextRun({
                            text: node.textContent,
                            font: '微软雅黑',
                            size: 24,
                            color: '0563C1',
                            underline: {
                                type: UnderlineType.SINGLE,
                                color: '0563C1'
                            }
                        })
                    ],
                    link: node.href
                })
            );
        }
        else if (node.nodeName === 'IMG') {
            children.push(new docx.TextRun({
                text: `[图片: ${node.alt || '无描述'}]`,
                font: '微软雅黑',
                size: 24,
                color: '666666'
            }));
        }
        else if (node.nodeType === Node.ELEMENT_NODE) {
            const inlineChildren = parseInlineNodes(node);
            children.push(...inlineChildren);
        }
    }

    return children;
}


const byId = (id) => document.getElementById(id);
const outline = byId('outline');
const workspace = byId('workspace');
const documentLabel = byId('workspace-document');
const collaboration = setupCollaboration({
    input: markdownInput,
    refresh: refreshEditor,
    onExit: restoreLocal,
    feedback: showToast
});

function refreshEditor() {
    window.MathJax?.typesetClear?.([preview]);
    preview.innerHTML = convertToHTML(markdownInput.value);
    const headings = [...preview.querySelectorAll('h1,h2,h3,h4,h5,h6')];
    outline.length = 1;
    for (const [index, heading] of headings.entries()) {
        outline.add(new Option(heading.textContent, index));
    }
    outline.hidden = !headings.length;
    documentLabel.textContent = collaboration?.code
        ? '共享文档 ' + collaboration.code
        : notes.find(note => note.id === currentNoteId)?.name || '临时草稿';
    updateWordCount();
    renderAll();
}
outline.onchange = () => {
    if (outline.value !== '') preview.querySelectorAll('h1,h2,h3,h4,h5,h6')[Number(outline.value)]?.scrollIntoView({ block: 'nearest' });
};
for (const button of workspace.querySelectorAll('button[data-view]')) {
    button.onclick = () => {
        workspace.dataset.view = button.dataset.view;
        for (const peer of workspace.querySelectorAll('button[data-view]')) {
            peer.setAttribute('aria-pressed', String(peer === button));
        }
    };
}
function loadLocalDraft() {
    collaboration.leave(false);
    currentNoteId = null;
    localStorage.removeItem(lastNoteKey);
    markdownInput.value = localStorage.getItem(draftKey) ?? '';
    renderNotesList();
    refreshEditor();
}
function restoreLocal() {
    const local = notes.find(note => note.id === currentNoteId);
    if (local) loadNote(local.id);
    else loadLocalDraft();
}

markdownInput.addEventListener('input', () => {
    refreshEditor();
    if (collaboration.code) {
        collaboration.write(markdownInput.value);
        return;
    }
    try { saveCurrentNote(); }
    catch { showToast('草稿未能保存，请导出或复制当前内容。', true); }
});

function replaceText(value, warning) {
    if (warning && markdownInput.value.trim() && !confirm(warning)) return false;
    markdownInput.value = value;
    markdownInput.dispatchEvent(new Event('input'));
    return true;
}
clearBtn.onclick = () => replaceText('', '清空当前编辑内容？');
sampleBtn.onclick = () => replaceText(sampleMarkdown, '用示例替换当前编辑内容？');

const templates = {
    heading: ['## ', '', '标题'],
    bold: ['**', '**', '粗体文字'],
    italic: ['*', '*', '斜体文字'],
    link: ['[', '](https://example.com)', '链接文字'],
    task: ['- [ ] ', '', '任务'],
    code: ['```text\n', '\n```', '代码']
};
function format(type) {
    if (workspace.dataset.view === 'preview') workspace.querySelector('button[data-view=split]').click();
    const [prefix, suffix, placeholder] = templates[type];
    const start = markdownInput.selectionStart;
    const end = markdownInput.selectionEnd;
    const selection = markdownInput.value.slice(start, end) || placeholder;
    const block = ['heading', 'task', 'code'].includes(type);
    const boundary = block && start > 0 && markdownInput.value[start - 1] !== '\n' ? '\n' : '';
    markdownInput.setRangeText(boundary + prefix + selection + suffix, start, end, 'end');
    markdownInput.focus();
    markdownInput.setSelectionRange(start + boundary.length + prefix.length, start + boundary.length + prefix.length + selection.length);
    markdownInput.dispatchEvent(new Event('input'));
}
for (const button of workspace.querySelectorAll('[data-format]')) button.onclick = () => format(button.dataset.format);
markdownInput.addEventListener('keydown', event => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
    const key = event.key.toLowerCase();
    if (key === 'b' || key === 'i') {
        event.preventDefault();
        format(key === 'b' ? 'bold' : 'italic');
    }
});
byId('copy-source-btn').onclick = async () => {
    try {
        await navigator.clipboard.writeText(markdownInput.value);
        showToast('已复制 Markdown 源码');
    } catch { showToast('无法访问剪贴板，请手动复制。', true); }
};
const importFile = byId('import-file');
byId('import-btn').onclick = () => importFile.click();
importFile.onchange = async () => {
    const file = importFile.files[0];
    importFile.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { showToast('请选择 2 MB 以内的文本文件。', true); return; }
    const original = markdownInput.value;
    try {
        const text = await file.text();
        if (markdownInput.value !== original) { showToast('内容已变化，请重新导入。', true); return; }
        if (replaceText(text, '用导入的文件替换当前内容？')) showToast('已导入 ' + file.name);
    } catch { showToast('文件读取失败。', true); }
};

sidebarToggle.onclick = () => {
    sidebar.hidden = !sidebar.hidden;
    sidebarToggle.setAttribute('aria-expanded', String(!sidebar.hidden));
};
byId('open-draft-btn').onclick = loadLocalDraft;
addNoteBtn.onclick = addNote;
newNoteName.onkeydown = event => { if (event.key === 'Enter') addNote(); };
refreshNotes.onclick = () => { notes = readNotes(); renderNotesList(); };

setupExport({ input: markdownInput, preview, downloadWord, replaceText });

const previous = localStorage.getItem(lastNoteKey);
if (!matchMedia('(max-width: 950px)').matches) sidebarToggle.click();
renderNotesList();
if (notes.some(note => note.id === previous)) loadNote(previous);
else {
    markdownInput.value = localStorage.getItem(draftKey) ?? (location.search.includes('handoff=') ? '' : sampleMarkdown);
    refreshEditor();
}
const path = location.pathname.replace(/\/$/, '');
const url = new URL(location.href);
const handoffTarget = path.endsWith('/export') || url.searchParams.get('source') === 'export' ? 'export' : 'editor';
if (handoffTarget === 'export' && !url.searchParams.has('handoff')) byId('markdownHandoff').click();
if (path.endsWith('/co') || url.searchParams.has('doc')) byId('collaboration-button').click();
showHandoff(handoffTarget, markdownInput, [
    ['新建笔记', (text, title) => {
        const stored = readNotes();
        const date = new Date().toISOString();
        const note = { id: crypto.randomUUID(), name: String(title || '接力笔记'), content: text, createdAt: date, updatedAt: date };
        localStorage.setItem('markdown-notes', JSON.stringify([...stored, note]));
        notes = [...stored, note];
        loadNote(note.id);
    }],
    ['追加到当前内容', (text) => replaceText(appendHandoff(markdownInput.value, text))]
]);

for (const id of ['MathJax-script', 'mermaid-script']) {
    byId(id)?.addEventListener('load', renderAll);
}
