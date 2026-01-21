// 配置marked.js
marked.setOptions({
    breaks: true,
    gfm: true,
    highlight: function (code) {
        return code;
    }
});

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
                        const content = section.replace(/^# .*$/m, '').trim();

                        html += `
                                    <div class="update-card">
                                        <h2>${title}</h2>
                                        <div class="content">${marked.parse(content)}</div>
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