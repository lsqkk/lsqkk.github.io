document.addEventListener('DOMContentLoaded', function () {
    const container = document.getElementById('tools-container');

    // 显示加载状态
    container.innerHTML = '<div class="loading">正在加载工具箱数据...</div>';

    // 读取配置文件
    fetch('/json/tool.json')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP错误! 状态码: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            // 移除emoji并处理数据
            const processedData = processToolsData(data);
            renderTools(processedData);
        })
        .catch(error => {
            console.error('加载工具箱数据失败:', error);
            container.innerHTML = `
                        <div class="error">
                            加载工具箱数据失败<br>
                            <small>${error.message}</small>
                        </div>
                    `;
        });

    function processToolsData(data) {
        // 移除所有emoji
        const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;

        data.categories.forEach(category => {
            // 清理分类名称中的英文部分（如果有的话）
            category.name = category.name.split(' ')[0];

            category.tools.forEach(tool => {
                // 移除工具名称中的emoji
                tool.name = tool.name.replace(emojiRegex, '').trim();

                // 确保URL格式正确
                if (tool.url && !tool.url.startsWith('http') && !tool.url.startsWith('/')) {
                    tool.url = '/' + tool.url;
                }
            });
        });

        return data;
    }

    function renderTools(data) {
        if (!data || !data.categories || !Array.isArray(data.categories)) {
            container.innerHTML = '<div class="error">配置文件格式错误</div>';
            return;
        }

        let html = '';

        data.categories.forEach(category => {
            if (!category.name || !category.tools || !Array.isArray(category.tools)) {
                return;
            }

            html += `
                        <div class="category-section">
                            <h2 class="category-title">${category.name}</h2>
                            <div class="tools-grid">
                    `;

            category.tools.forEach(tool => {
                if (!tool.name || !tool.url) {
                    return;
                }

                html += `
                            <div class="tool-card" onclick="window.open('${tool.url}', '${tool.target || '_blank'}')">
                                <span class="tool-category">${category.name}</span>
                                <h3 class="tool-name">${tool.name}</h3>
                                <a href="${tool.url}" class="tool-link" target="${tool.target || '_blank'}">
                                    使用工具
                                </a>
                            </div>
                        `;
            });

            html += `
                            </div>
                        </div>
                    `;
        });

        container.innerHTML = html;
    }
});