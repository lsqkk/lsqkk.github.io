document.addEventListener('DOMContentLoaded', function () {
   fetch('blog.md')
        .then(response => response.text())
        .then(markdown => {
            const html = marked(markdown);
            document.getElementById('content').innerHTML = html;
            renderMathInElement(document.getElementById('content'), {
                delimiters: [
                    { left: '$$', right: '$$', display: true },
                    { left: '$', right: '$', display: false },
                    { left: '\\(', right: '\\)', display: false },
                    { left: '\\[', right: '\\]', display: true }
                ]
            });
        });
});

// 初始化KaTeX
renderMathInElement(document.body);
