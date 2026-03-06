document.addEventListener('DOMContentLoaded', () => {
    // 元素引用
    const markdownInput = document.getElementById('markdown-input');
    const preview = document.getElementById('preview');
    const customStyles = document.getElementById('custom-styles');

    // 样式输入
    const fontFamilyInput = document.getElementById('font-family');
    const baseFontSizeInput = document.getElementById('base-font-size');
    const textColorInput = document.getElementById('text-color');
    const h1SizeInput = document.getElementById('h1-size');
    const h1ColorInput = document.getElementById('h1-color');

    // 按钮
    const saveStylesBtn = document.getElementById('save-styles-btn');
    const saveContentBtn = document.getElementById('save-content-btn');
    const loadContentBtn = document.getElementById('load-content-btn');
    const clearContentBtn = document.getElementById('clear-content-btn');
    const exportPdfBtn = document.getElementById('export-pdf-btn');
    const exportDocBtn = document.getElementById('export-doc-btn');

    // 导出设置
    const paperSizeInput = document.getElementById('paper-size');
    const marginTopInput = document.getElementById('margin-top');

    // 默认样式配置
    const defaultStyles = {
        'font-family': 'sans-serif',
        'base-font-size': 16,
        'text-color': '#333333',
        'h1-size': 32,
        'h1-color': '#1a531a',
        // 可以继续添加 h2, h3 等
    };

    /**
     * 1. 样式加载与应用
     */

    // 从 localStorage 加载样式
    function loadStyles() {
        let savedStyles = {};
        try {
            savedStyles = JSON.parse(localStorage.getItem('markdownCustomStyles')) || {};
        } catch (e) {
            console.error("Failed to parse saved styles from localStorage:", e);
        }

        // 合并默认样式和保存的样式
        const currentStyles = { ...defaultStyles, ...savedStyles };

        fontFamilyInput.value = currentStyles['font-family'];
        baseFontSizeInput.value = currentStyles['base-font-size'];
        textColorInput.value = currentStyles['text-color'];
        h1SizeInput.value = currentStyles['h1-size'];
        h1ColorInput.value = currentStyles['h1-color'];

        applyStyles();
    }

    // 生成并应用 CSS
    function applyStyles() {
        const styles = {
            'font-family': fontFamilyInput.value || defaultStyles['font-family'],
            'base-font-size': parseInt(baseFontSizeInput.value) || defaultStyles['base-font-size'],
            'text-color': textColorInput.value || defaultStyles['text-color'],
            'h1-size': parseInt(h1SizeInput.value) || defaultStyles['h1-size'],
            'h1-color': h1ColorInput.value || defaultStyles['h1-color'],
        };

        const css = `
            #preview {
                font-family: ${styles['font-family']};
                font-size: ${styles['base-font-size']}px;
                color: ${styles['text-color']};
                line-height: 1.6;
            }
            #preview h1 {
                font-size: ${styles['h1-size']}px;
                color: ${styles['h1-color']};
                border-bottom: 2px solid ${styles['h1-color']}33; /* 浅色下划线 */
                padding-bottom: 5px;
            }
            /* 可以继续添加 h2, h3, p, li 等其他元素的样式 */
        `;
        customStyles.textContent = css;

        // 实时更新预览内容
        updatePreview();
    }

    // 保存当前样式到 localStorage
    saveStylesBtn.addEventListener('click', () => {
        const currentStyles = {
            'font-family': fontFamilyInput.value,
            'base-font-size': parseInt(baseFontSizeInput.value),
            'text-color': textColorInput.value,
            'h1-size': parseInt(h1SizeInput.value),
            'h1-color': h1ColorInput.value,
        };
        localStorage.setItem('markdownCustomStyles', JSON.stringify(currentStyles));
        applyStyles();
        alert('样式已保存！');
    });

    // 样式输入变化时实时应用
    [fontFamilyInput, baseFontSizeInput, textColorInput, h1SizeInput, h1ColorInput].forEach(input => {
        input.addEventListener('input', applyStyles);
    });

    /**
     * 2. Markdown 实时编辑
     */
    function updatePreview() {
        const markdownText = markdownInput.value;
        // 使用 marked 库将 markdown 转换为 HTML
        preview.innerHTML = marked.parse(markdownText);
    }

    markdownInput.addEventListener('input', updatePreview);

    /**
     * 3. 内容保存/加载
     */
    saveContentBtn.addEventListener('click', () => {
        localStorage.setItem('markdownContent', markdownInput.value);
        alert('Markdown 内容已保存到浏览器！');
    });

    loadContentBtn.addEventListener('click', () => {
        const savedContent = localStorage.getItem('markdownContent');
        if (savedContent) {
            markdownInput.value = savedContent;
            updatePreview();
            alert('Markdown 内容已加载！');
        } else {
            alert('未找到保存的 Markdown 内容。');
        }
    });

    clearContentBtn.addEventListener('click', () => {
        if (confirm('确定要清空编辑器中的内容吗？')) {
            markdownInput.value = '';
            updatePreview();
        }
    });


    /**
     * 4. 导出功能
     */

    // PDF 导出
    exportPdfBtn.addEventListener('click', () => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({
            unit: 'mm',
            format: paperSizeInput.value, // 例如: 'a4'
        });

        // 获取边距设置
        const marginTop = parseFloat(marginTopInput.value) || 20;
        const marginSides = 15; // 假设左右边距固定为 15mm

        // 从预览内容生成 PDF
        doc.html(preview, {
            callback: function (doc) {
                doc.save('document_custom.pdf');
            },
            x: marginSides,
            y: marginTop,
            html2canvas: {
                // 调整缩放比例以适应 PDF 宽度
                scale: (doc.internal.pageSize.getWidth() - 2 * marginSides) / preview.offsetWidth,
            },
            // 设置内容宽度，减去左右边距
            width: doc.internal.pageSize.getWidth() - 2 * marginSides,
        });

        alert('正在生成 PDF 文件...');
    });

    // 简易 Word (DOC) 导出 - 实际是带有 Word 标记的 HTML 文件
    exportDocBtn.addEventListener('click', () => {
        const content = preview.innerHTML;
        const filename = 'document_custom.doc';

        // 包含 Word 标记的完整 HTML 结构
        const htmlContent = `
            <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
            <head>
                <meta charset='utf-8'>
                <title>Document</title>
                <style type="text/css">${customStyles.textContent}</style>
                <style>
                    @page {
                        margin-top: ${marginTopInput.value}mm;
                        margin-left: 15mm;
                        margin-right: 15mm;
                        size: ${paperSizeInput.value}; /* 例如: A4, Letter */
                    }
                    body {
                        font-family: ${fontFamilyInput.value};
                    }
                </style>
            </head>
            <body>
                ${content}
            </body>
            </html>`;

        // 创建 Blob 对象并下载
        const blob = new Blob([htmlContent], { type: 'application/msword;charset=utf-8' });

        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        alert('正在生成 Word (.doc) 文件...');
    });


    // 初始化：加载样式和内容
    loadStyles();
    // 首次加载内容，如果 localStorage 中有内容，则加载，否则使用默认示例
    const savedContent = localStorage.getItem('markdownContent');
    if (savedContent) {
        markdownInput.value = savedContent;
    }
    updatePreview();
});