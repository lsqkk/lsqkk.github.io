// 代码高亮和复制功能
document.addEventListener('DOMContentLoaded', function () {
    // 初始化 highlight.js
    hljs.highlightAll();

    // 为代码块添加标题栏和复制按钮
    addCodeBlockHeaders();

    // 添加复制功能
    initCopyButtons();
});

/**
 * 为代码块添加标题栏
 */
function addCodeBlockHeaders() {
    const codeBlocks = document.querySelectorAll('.post-content pre');

    codeBlocks.forEach((pre, index) => {
        // 查找code标签中的语言类
        const codeElement = pre.querySelector('code');
        let language = 'text';

        if (codeElement) {
            // 提取语言类型
            const classList = codeElement.className.split(' ');
            for (const className of classList) {
                if (className.startsWith('language-')) {
                    language = className.replace('language-', '').toLowerCase();
                    break;
                } else if (className.startsWith('hljs language-')) {
                    // 处理 highlight.js 的类名
                    const match = className.match(/language-(\w+)/);
                    if (match) {
                        language = match[1].toLowerCase();
                    }
                    break;
                }
            }
        }

        // 语言名称映射
        const languageNames = {
            'python': 'Python',
            'javascript': 'JavaScript',
            'js': 'JavaScript',
            'typescript': 'TypeScript',
            'ts': 'TypeScript',
            'html': 'HTML',
            'css': 'CSS',
            'java': 'Java',
            'c': 'C',
            'cpp': 'C++',
            'csharp': 'C#',
            'cs': 'C#',
            'go': 'Go',
            'rust': 'Rust',
            'php': 'PHP',
            'bash': 'Bash',
            'shell': 'Shell',
            'sh': 'Shell',
            'sql': 'SQL',
            'json': 'JSON',
            'yaml': 'YAML',
            'yml': 'YAML',
            'markdown': 'Markdown',
            'md': 'Markdown',
            'text': 'Text'
        };

        // 创建标题栏
        const header = document.createElement('div');
        header.className = 'code-header';

        const languageSpan = document.createElement('span');
        languageSpan.className = 'code-language';
        languageSpan.setAttribute('data-language', language);
        languageSpan.textContent = languageNames[language] || language.charAt(0).toUpperCase() + language.slice(1);

        const copyButton = document.createElement('button');
        copyButton.className = 'copy-code-btn';
        copyButton.setAttribute('data-code-index', index);
        copyButton.innerHTML = '复制';

        header.appendChild(languageSpan);
        header.appendChild(copyButton);

        // 插入标题栏
        pre.prepend(header);
    });
}

/**
 * 初始化复制按钮功能
 */
function initCopyButtons() {
    const copyButtons = document.querySelectorAll('.copy-code-btn');

    copyButtons.forEach(button => {
        button.addEventListener('click', function () {
            const codeIndex = this.getAttribute('data-code-index');
            const codeBlock = document.querySelectorAll('.post-content pre')[codeIndex];
            const codeElement = codeBlock.querySelector('code');

            if (codeElement) {
                // 获取代码文本
                let codeText = codeElement.textContent;

                // 复制到剪贴板
                navigator.clipboard.writeText(codeText).then(() => {
                    // 显示成功状态
                    const originalText = this.innerHTML;
                    this.classList.add('copied');
                    this.innerHTML = '已复制';

                    // 2秒后恢复原状
                    setTimeout(() => {
                        this.classList.remove('copied');
                        this.innerHTML = originalText;
                    }, 2000);
                }).catch(err => {
                    console.error('复制失败: ', err);
                    // 备用方案：使用 document.execCommand
                    const textArea = document.createElement('textarea');
                    textArea.value = codeText;
                    document.body.appendChild(textArea);
                    textArea.select();

                    try {
                        document.execCommand('copy');
                        // 显示成功状态
                        const originalText = this.innerHTML;
                        this.classList.add('copied');
                        this.innerHTML = '已复制';

                        setTimeout(() => {
                            this.classList.remove('copied');
                            this.innerHTML = originalText;
                        }, 2000);
                    } catch (e) {
                        console.error('备用复制方案也失败了: ', e);
                        this.innerHTML = '复制失败';
                        setTimeout(() => {
                            this.innerHTML = '复制';
                        }, 2000);
                    }

                    document.body.removeChild(textArea);
                });
            }
        });
    });
}