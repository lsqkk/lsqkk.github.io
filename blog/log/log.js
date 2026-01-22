// 配置marked.js
marked.setOptions({
    breaks: true,
    gfm: true,
    highlight: function (code) {
        return code;
    }
});

// 标签分类和颜色映射
const TAG_COLORS = {
    '更新': 'update',
    '优化': 'optimize',
    '新增': 'add',
    '修复': 'fix'
};

// 提取并处理标签
function processContent(text) {
    // 匹配类似 "更新 - "、"优化 - " 等模式
    const tagPattern = /^[\u4e00-\u9fa5]+ - /;

    if (tagPattern.test(text)) {
        const match = text.match(/^([\u4e00-\u9fa5a-zA-Z]+) - /);
        if (match) {
            const tag = match[1];
            const content = text.replace(/^[\u4e00-\u9fa5a-zA-Z]+ - /, '');
            const tagClass = TAG_COLORS[tag] || 'default';
            return `<span class="tag ${tagClass}">${tag}</span>${content}`;
        }
    }
    return text;
}

// 处理段落中的标签
function processParagraph(text) {
    const lines = text.split('\n');
    let processedText = '';

    lines.forEach(line => {
        // 处理行首的标签
        const processedLine = processContent(line.trim());
        processedText += processedLine + '\n';
    });

    return processedText;
}

// 自动读取并解析
window.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('changelog-container');
    container.innerHTML = '<div class="loading">正在加载更新日志...</div>';

    fetch('log.md')
        .then(response => {
            if (!response.ok) throw new Error('文件加载失败');
            return response.text();
        })
        .then(text => {
            // 按一级标题分割内容
            const sections = text.split(/(?=^# )/m);
            let html = '';

            sections.forEach(section => {
                if (section.trim()) {
                    // 提取标题
                    const titleMatch = section.match(/^# (.*)$/m);
                    if (titleMatch) {
                        const title = titleMatch[1];
                        let content = section.replace(/^# .*$/m, '').trim();

                        // 处理内容中的标签
                        content = processParagraph(content);

                        // 将处理后的内容传递给marked解析
                        const parsedContent = marked.parse(content);

                        // 对解析后的HTML中的段落进行进一步处理，确保标签样式生效
                        const finalContent = parsedContent.replace(/<p>(.*?)<\/p>/g, (match, pContent) => {
                            // 如果段落以标签开头，保持原样（已经在processParagraph中处理）
                            return match;
                        });

                        html += `
                            <div class="update-card">
                                <h2>${title}</h2>
                                <div class="content">${finalContent}</div>
                            </div>
                        `;
                    }
                }
            });

            container.innerHTML = html || '<div class="loading">暂无更新内容</div>';
        })
        .catch(error => {
            container.innerHTML = `<div class="loading">${error.message || '无法加载更新日志'}</div>`;
            console.error('加载错误:', error);
        });
});

// 卡片点击效果
document.addEventListener('click', (e) => {
    if (e.target.closest('.update-card')) {
        e.target.closest('.update-card').classList.toggle('active');
    }
});