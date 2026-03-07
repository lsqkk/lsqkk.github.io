window.MathJax = {
    tex: {
        inlineMath: [['$', '$'], ['\\(', '\\)']],
        displayMath: [['$$', '$$'], ['\\[', '\\]']],
        processEscapes: true
    },
    startup: {
        pageReady: () => {
            return MathJax.startup.defaultPageReady().then(() => {
                console.log('MathJax初始化完成');
                if (window.markdownReady) renderAll();
            });
        }
    }
};

// Mermaid备用加载方案
function loadMermaidFallback() {
    const fallback = document.createElement('script');
    fallback.src = 'https://unpkg.com/mermaid@10/dist/mermaid.min.js';
    fallback.onload = function () {
        initMermaid();
        console.log('Mermaid备用源加载成功');
    };
    document.head.appendChild(fallback);
}

// 初始化Mermaid
function initMermaid() {
    window.mermaid = window.mermaid || {};
    mermaid.initialize({
        startOnLoad: false,
        theme: 'default',
        flowchart: {
            useMaxWidth: true,
            htmlLabels: true
        }
    });
}

// 初始化Mermaid（主加载方案）
if (window.mermaid) {
    initMermaid();
}
