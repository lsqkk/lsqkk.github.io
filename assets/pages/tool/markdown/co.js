firebase.initializeApp(firebaseConfig);

// 全局变量
const db = firebase.database();
let docRef = null;
let presenceRef = null;
let versionsRef = null;
let currentDocId = null;
let userId = null;
let userColor = '#40E0D0';
let nickname = '';
let cursors = {};
let isTyping = false;
let lastTypedTime = 0;
let recentDocs = JSON.parse(localStorage.getItem('recent-docs')) || [];
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
const newDocBtn = document.getElementById('new-doc-btn');
const joinDocBtn = document.getElementById('join-doc-btn');
const saveVersionBtn = document.getElementById('save-version-btn');
const viewVersionsBtn = document.getElementById('view-versions-btn');
const docModal = document.getElementById('doc-modal');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const modalClose = document.getElementById('modal-close');
const modalConfirmBtn = document.getElementById('modal-confirm-btn');
const nicknameInput = document.getElementById('nickname-input');
const docCodeInput = document.getElementById('doc-code-input');
const docCodeContainer = document.getElementById('doc-code-container');
const documentInfoContainer = document.getElementById('document-info-container');
const documentCodeSpan = document.getElementById('document-code');
const copyCodeBtn = document.getElementById('copy-code-btn');
const userList = document.getElementById('user-list');
const versionsModal = document.getElementById('versions-modal');
const versionsList = document.getElementById('versions-list');

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

// 初始化
document.addEventListener('DOMContentLoaded', function () {
    // 生成用户ID
    userId = generateId();

    // 加载本地存储的用户信息
    loadUserInfo();

    // 设置事件监听器
    setupEventListeners();

    // 初始加载示例
    sampleBtn.click();

    loadRecentDocs();

});

// 生成随机ID
function generateId(length = 6) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// 加载用户信息
function loadUserInfo() {
    nickname = localStorage.getItem('md-nickname') || '';
    userColor = localStorage.getItem('md-userColor') || '#40E0D0';
}

// 保存用户信息
function saveUserInfo() {
    localStorage.setItem('md-nickname', nickname);
    localStorage.setItem('md-userColor', userColor);
}

// 设置事件监听器
function setupEventListeners() {
    document.getElementById('sidebarToggle').addEventListener('click', toggleSidebar);
    document.getElementById('refreshDocs').addEventListener('click', loadRecentDocs);

    // Markdown输入事件
    markdownInput.addEventListener('input', function () {
        preview.innerHTML = convertToHTML(this.value);
        updateWordCount();
        renderAll();

        // 同步到Firebase
        if (docRef && !isTyping) {
            isTyping = true;
            docRef.update({
                content: this.value,
                lastEdited: Date.now(),
                lastEditedBy: nickname
            });

            // 设置定时器检测是否停止输入
            lastTypedTime = Date.now();
            const checkTyping = setInterval(() => {
                if (Date.now() - lastTypedTime > 1000) {
                    isTyping = false;
                    clearInterval(checkTyping);
                }
            }, 500);
        } else if (docRef && isTyping) {
            lastTypedTime = Date.now();
        }
    });

    // 光标位置变化事件
    markdownInput.addEventListener('click', updateCursorPosition);
    markdownInput.addEventListener('keyup', updateCursorPosition);

    // 工具栏按钮事件
    clearBtn.addEventListener('click', clearEditor);
    sampleBtn.addEventListener('click', loadSample);
    downloadHtmlBtn.addEventListener('click', downloadHtml);
    downloadMdBtn.addEventListener('click', downloadMd);
    downloadWordBtn.addEventListener('click', downloadWord);

    // 文档操作按钮事件
    newDocBtn.addEventListener('click', () => showModal('new'));
    joinDocBtn.addEventListener('click', () => showModal('join'));
    saveVersionBtn.addEventListener('click', saveVersion);
    viewVersionsBtn.addEventListener('click', showVersions);
    copyCodeBtn.addEventListener('click', copyDocCode);

    // 模态框事件
    modalClose.addEventListener('click', closeModal);
    modalConfirmBtn.addEventListener('click', confirmModal);

    // 点击模态框外部关闭
    window.addEventListener('click', function (event) {
        if (event.target === docModal) {
            closeModal();
        }
        if (event.target === versionsModal) {
            versionsModal.style.display = 'none';
        }
    });
}

// 显示模态框
function showModal(type) {
    if (type === 'new') {
        modalTitle.textContent = '新建文档';
        docCodeContainer.style.display = 'none';
        nicknameInput.value = nickname;
        selectModalColor(document.querySelector('.color-option[style*="' + userColor + '"]') ||
            document.querySelector('.color-option'));
    } else {
        modalTitle.textContent = '加入文档';
        docCodeContainer.style.display = 'block';
        docCodeInput.value = '';
        nicknameInput.value = nickname;
        selectModalColor(document.querySelector('.color-option[style*="' + userColor + '"]') ||
            document.querySelector('.color-option'));
    }

    docModal.style.display = 'flex';
}

// 关闭模态框
function closeModal() {
    docModal.style.display = 'none';
}

// 选择颜色
function selectModalColor(element) {
    document.querySelectorAll('.color-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    element.classList.add('selected');
}

// 确认模态框操作
function confirmModal() {
    const newNickname = nicknameInput.value.trim();
    const selectedColor = document.querySelector('.color-option.selected').style.backgroundColor;

    if (!newNickname) {
        showToast('请输入昵称', true);
        return;
    }

    // 更新用户信息
    nickname = newNickname;
    userColor = selectedColor;
    saveUserInfo();

    if (modalTitle.textContent === '新建文档') {
        createNewDocument();
    } else {
        const docCode = docCodeInput.value.trim();
        if (!docCode || docCode.length !== 6) {
            showToast('请输入6位文档代码', true);
            return;
        }
        joinDocument(docCode);
    }

    closeModal();
}

// 创建新文档
function createNewDocument() {
    currentDocId = generateId(6);
    documentCodeSpan.textContent = currentDocId;
    documentInfoContainer.style.display = 'block';

    // 初始化Firebase引用
    docRef = db.ref(`markdown-docs/${currentDocId}`);
    presenceRef = db.ref(`presence/${currentDocId}/${userId}`);
    versionsRef = db.ref(`markdown-versions/${currentDocId}`);

    // 设置初始文档内容
    docRef.set({
        content: markdownInput.value || '',
        createdAt: Date.now(),
        createdBy: nickname,
        lastEdited: Date.now(),
        lastEditedBy: nickname
    });
    addRecentDoc(currentDocId, '未命名文档');
    // 监听文档变化
    docRef.on('value', snapshot => {
        const data = snapshot.val();
        if (data && data.content !== markdownInput.value) {
            markdownInput.value = data.content;
            preview.innerHTML = convertToHTML(data.content);
            updateWordCount();
            renderAll();
        }
    });

    // 设置用户在线状态
    setupPresence();

    showToast('文档创建成功！分享代码给其他人一起编辑吧！');
}

// 加入文档
function joinDocument(docCode) {
    currentDocId = docCode;
    documentCodeSpan.textContent = currentDocId;
    documentInfoContainer.style.display = 'block';

    // 初始化Firebase引用
    docRef = db.ref(`markdown-docs/${currentDocId}`);
    presenceRef = db.ref(`presence/${currentDocId}/${userId}`);
    versionsRef = db.ref(`markdown-versions/${currentDocId}`);

    // 检查文档是否存在
    docRef.once('value').then(snapshot => {
        if (!snapshot.exists()) {
            showToast('文档不存在，请检查代码', true);
            documentInfoContainer.style.display = 'none';
            docRef = null;
            return;
        }

        // 监听文档变化
        docRef.on('value', snapshot => {
            const data = snapshot.val();
            addRecentDoc(docCode, data.name || ''); // 添加这一行
            if (data && data.content !== markdownInput.value) {
                markdownInput.value = data.content;
                preview.innerHTML = convertToHTML(data.content);
                updateWordCount();
                renderAll();
            }
        });

        // 设置用户在线状态
        setupPresence();

        showToast('成功加入文档！');
    });


}

// 设置用户在线状态
function setupPresence() {
    // 更新用户列表
    const usersRef = db.ref(`presence/${currentDocId}`);

    usersRef.on('value', snapshot => {
        userList.innerHTML = '';
        const users = snapshot.val() || {};

        Object.keys(users).forEach(userId => {
            const user = users[userId];
            if (user.online) {
                const userBadge = document.createElement('div');
                userBadge.className = 'user-badge';
                userBadge.innerHTML = `
                        <div class="user-color" style="background: ${user.color}"></div>
                        <span>${user.nickname}</span>
                    `;
                userList.appendChild(userBadge);
            }
        });
    });

    // 设置当前用户在线状态
    presenceRef.onDisconnect().remove();

    presenceRef.set({
        online: true,
        nickname: nickname,
        color: userColor,
        lastSeen: Date.now()
    });

    // 更新光标位置
    updateCursorPosition();
}

// 更新光标位置
function updateCursorPosition() {
    if (!presenceRef) return;

    const cursorPos = markdownInput.selectionStart;
    presenceRef.update({
        cursorPos: cursorPos,
        lastUpdated: Date.now()
    });

    // 清除旧光标
    clearCursors();

    // 获取其他用户的光标位置
    db.ref(`presence/${currentDocId}`).once('value').then(snapshot => {
        const users = snapshot.val() || {};

        Object.keys(users).forEach(userId => {
            const user = users[userId];
            if (user.online && userId !== userId && user.cursorPos !== undefined) {
                createCursor(userId, user.nickname, user.color, user.cursorPos);
            }
        });
    });
}

// 创建光标指示器
function createCursor(userId, name, color, position) {
    // 如果已有该用户的光标，先移除
    if (cursors[userId]) {
        document.body.removeChild(cursors[userId].cursor);
        document.body.removeChild(cursors[userId].label);
    }

    // 计算光标位置
    const textBeforeCursor = markdownInput.value.substring(0, position);
    const tempDiv = document.createElement('div');
    tempDiv.style.position = 'absolute';
    tempDiv.style.whiteSpace = 'pre-wrap';
    tempDiv.style.visibility = 'hidden';
    tempDiv.style.fontFamily = getComputedStyle(markdownInput).fontFamily;
    tempDiv.style.fontSize = getComputedStyle(markdownInput).fontSize;
    tempDiv.style.lineHeight = getComputedStyle(markdownInput).lineHeight;
    tempDiv.style.width = markdownInput.clientWidth + 'px';
    tempDiv.textContent = textBeforeCursor;
    document.body.appendChild(tempDiv);

    const range = document.createRange();
    range.selectNodeContents(tempDiv);
    const rects = range.getClientRects();
    let x = 0, y = 0;

    if (rects.length > 0) {
        const lastRect = rects[rects.length - 1];
        x = lastRect.right;
        y = lastRect.top;
    } else {
        // 如果没有任何文本，使用输入框的起始位置
        const inputRect = markdownInput.getBoundingClientRect();
        x = inputRect.left;
        y = inputRect.top;
    }

    document.body.removeChild(tempDiv);

    // 创建光标元素
    const cursor = document.createElement('div');
    cursor.className = 'cursor';
    cursor.style.left = x + 'px';
    cursor.style.top = y + 'px';
    cursor.style.setProperty('--cursor-color', color);
    cursor.style.height = getComputedStyle(markdownInput).lineHeight;

    // 创建标签元素
    const label = document.createElement('div');
    label.className = 'cursor-label';
    label.textContent = name;
    label.style.left = x + 'px';
    label.style.top = (y - 20) + 'px';
    label.style.backgroundColor = color;

    document.body.appendChild(cursor);
    document.body.appendChild(label);

    // 保存光标引用
    cursors[userId] = { cursor, label };

    // 设置定时器自动移除过时光标
    setTimeout(() => {
        if (cursors[userId]) {
            document.body.removeChild(cursors[userId].cursor);
            document.body.removeChild(cursors[userId].label);
            delete cursors[userId];
        }
    }, 3000);
}

// 清除所有光标
function clearCursors() {
    Object.keys(cursors).forEach(userId => {
        document.body.removeChild(cursors[userId].cursor);
        document.body.removeChild(cursors[userId].label);
    });
    cursors = {};
}

// 保存版本
function saveVersion() {
    if (!versionsRef || !markdownInput.value.trim()) {
        showToast('没有内容可保存', true);
        return;
    }

    const timestamp = Date.now();
    const date = new Date(timestamp);
    const versionName = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;

    versionsRef.push({
        content: markdownInput.value,
        createdAt: timestamp,
        createdBy: nickname,
        name: versionName
    });

    showToast('版本保存成功！');
}

// 显示版本历史
function showVersions() {
    if (!versionsRef) {
        showToast('没有可查看的历史版本', true);
        return;
    }

    versionsList.innerHTML = '';
    versionsRef.once('value').then(snapshot => {
        const versions = snapshot.val() || {};
        const versionArray = [];

        Object.keys(versions).forEach(versionId => {
            versionArray.push({
                id: versionId,
                ...versions[versionId]
            });
        });

        // 按时间倒序排序
        versionArray.sort((a, b) => b.createdAt - a.createdAt);

        if (versionArray.length === 0) {
            versionsList.innerHTML = '<div class="version-item">暂无历史版本</div>';
            return;
        }

        versionArray.forEach(version => {
            const versionItem = document.createElement('div');
            versionItem.className = 'version-item';
            versionItem.innerHTML = `
                    <div class="version-time">${version.name}</div>
                    <div class="version-content">${version.createdBy} 保存</div>
                `;

            versionItem.addEventListener('click', () => {
                markdownInput.value = version.content;
                preview.innerHTML = convertToHTML(version.content);
                updateWordCount();
                renderAll();
                versionsModal.style.display = 'none';
                showToast(`已恢复到 ${version.name} 的版本`);
            });

            versionsList.appendChild(versionItem);
        });
    });

    versionsModal.style.display = 'flex';
}

// 复制文档代码
function copyDocCode() {
    navigator.clipboard.writeText(currentDocId).then(() => {
        showToast('文档代码已复制');
    }).catch(err => {
        console.error('复制失败:', err);
        showToast('复制失败，请手动复制', true);
    });
}



// 清空编辑器
function clearEditor() {
    markdownInput.value = '';
    preview.innerHTML = '';
    updateWordCount();
    showToast('已清空输入');
}

// 加载示例
function loadSample() {
    markdownInput.value = sampleMarkdown;
    preview.innerHTML = convertToHTML(sampleMarkdown);
    updateWordCount();
    renderAll();
    showToast('已加载示例内容');
}

// 下载HTML
function downloadHtml() {
    const htmlContent = preview.innerHTML;
    const blob = new Blob([`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Markdown Export</title></head><body>${htmlContent}</body></html>`], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentDocId ? `doc-${currentDocId}.html` : 'markdown-export.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('HTML文件已下载');
}

// 下载Markdown
function downloadMd() {
    const mdContent = markdownInput.value;
    const blob = new Blob([mdContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentDocId ? `doc-${currentDocId}.md` : 'markdown-export.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Markdown文件已下载');
}

// 下载Word
async function downloadWord() {
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
        a.download = currentDocId ? `doc-${currentDocId}.docx` : 'markdown-export.docx';
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

// 更新字数统计
function updateWordCount() {
    const text = markdownInput.value;
    const count = text.trim() === '' ? 0 : text.length;
    wordCount.textContent = `${count} 字`;
}

// 手动触发 MathJax 渲染
function renderAll() {
    try {
        if (window.MathJax?.typeset) {
            MathJax.typeset();
        }

        if (window.mermaid?.init) {
            try {
                mermaid.init(undefined, document.querySelectorAll('.mermaid'));
            } catch (mermaidErr) {
                console.error('Mermaid渲染错误:', mermaidErr);
            }
        } else {
            console.warn('Mermaid未加载完成');
        }
    } catch (err) {
        console.error('渲染错误:', err);
    }
}

// Markdown 转 HTML 函数
function convertToHTML(md) {
    const mermaidBlocks = [];
    let html = md.replace(/```mermaid([\s\S]*?)```/g, (match, code) => {
        mermaidBlocks.push(code.trim());
        return `<div class="mermaid">${code.trim()}</div>`;
    });

    const codeBlocks = [];
    html = html.replace(/```([\s\S]*?)```/g, (match, code) => {
        codeBlocks.push(code);
        return `\x1BCODE${codeBlocks.length - 1}\x1B`;
    });

    const inlineCodes = [];
    html = html.replace(/`([^`]+)`/g, (match, code) => {
        inlineCodes.push(code);
        return `\x1BINLINE${inlineCodes.length - 1}\x1B`;
    });

    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => {
        return `<img src="${src.trim()}" alt="${alt.trim()}" class="md-image">`;
    });

    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
        return `<a href="${url.trim()}" class="md-link">${text.trim()}</a>`;
    });

    html = html.replace(/\$\$([\s\S]+?)\$\$/g, (_, formula) => {
        const cleaned = formula.trim();
        return cleaned ? `<div class="math-block">\\[ ${cleaned} \\]</div>` : '';
    });

    html = html.replace(/(^|[^\\\$])\$([^$\n]+?)\$($|[^$])/g, (_, prefix, formula, suffix) => {
        return `${prefix}<span class="math-inline">\\( ${formula.trim()} \\)</span>${suffix}`;
    });
    html = html
        .replace(/^# (.*$)/gm, '<h1>$1</h1>')
        .replace(/^## (.*$)/gm, '<h2>$1</h2>')
        .replace(/^### (.*$)/gm, '<h3>$1</h3>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/^\s*[\-+*]\s+(.*$)/gm, '<li>$1</li>')
        .replace(/^\s*\d+\.\s+(.*$)/gm, '<li>$1</li>')
        // 分组无序列表
        .replace(/(<li>.*?<\/li>\s*)+/g, function (match) {
            // 检查是否包含数字开头的li（有序列表）
            if (match.match(/<li>\d/)) {
                return `<ol>${match}</ol>`;
            } else {
                return `<ul>${match}</ul>`;
            }
        })
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
        .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');

    html = html.replace(/\x1BCODE(\d+)\x1B/g, (_, n) =>
        `
            <pre><code>${codeBlocks[n]}</code></pre>`
    );
    html = html.replace(/\x1BINLINE(\d+)\x1B/g, (_, n) =>
        `<code>${inlineCodes[n]}</code>`
    );

    html = html.replace(/([^\n]+)(\n\n|$)/g, '<p>$1</p>');

    return html;
}

// 显示 Toast 通知
function showToast(message, isError = false) {
    toastMessage.textContent = message;
    toast.className = isError ? 'toast error show' : 'toast show';
    setTimeout(() => {
        toast.className = 'toast';
    }, 3000);
}
function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('active');
}

function loadRecentDocs() {
    const docsList = document.getElementById('docsList');
    docsList.innerHTML = '';

    recentDocs.forEach(doc => {
        const li = document.createElement('li');
        li.className = `doc-item ${doc.id === currentDocId ? 'active' : ''}`;
        li.dataset.id = doc.id;

        li.innerHTML = `
            <span class="doc-name">${doc.name || '未命名文档'}</span>
            <div class="doc-actions">
                <button class="doc-action-btn edit-doc" title="重命名">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="doc-action-btn delete-doc" title="删除">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
            <span class="doc-code">${doc.id}</span>
            `;

        li.addEventListener('click', (e) => {
            if (!e.target.closest('.doc-action-btn')) {
                joinDocument(doc.id);
            }
        });

        docsList.appendChild(li);
    });

    // 添加事件监听器
    document.querySelectorAll('.edit-doc').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const docId = btn.closest('.doc-item').dataset.id;
            editDocName(docId);
        });
    });

    document.querySelectorAll('.delete-doc').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const docId = btn.closest('.doc-item').dataset.id;
            deleteRecentDoc(docId);
        });
    });
}

function addRecentDoc(docId, docName = '') {
    // 避免重复添加
    if (!recentDocs.some(doc => doc.id === docId)) {
        recentDocs.unshift({
            id: docId,
            name: docName,
            lastAccessed: Date.now()
        });

        // 限制最近文档数量
        if (recentDocs.length > 10) {
            recentDocs = recentDocs.slice(0, 10);
        }

        saveRecentDocs();
        loadRecentDocs();
    }
}

function editDocName(docId) {
    const doc = recentDocs.find(d => d.id === docId);
    if (!doc) return;

    const newName = prompt('输入新的文档名称', doc.name || '未命名文档');
    if (newName !== null) {
        doc.name = newName.trim();
        doc.lastAccessed = Date.now();
        saveRecentDocs();
        loadRecentDocs();
    }
}

function deleteRecentDoc(docId) {
    if (!confirm('确定要从最近文档中移除此文档吗？')) return;

    recentDocs = recentDocs.filter(doc => doc.id !== docId);
    saveRecentDocs();
    loadRecentDocs();
}

function saveRecentDocs() {
    localStorage.setItem('recent-docs', JSON.stringify(recentDocs));
}