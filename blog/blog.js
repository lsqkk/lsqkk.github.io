document.addEventListener('DOMContentLoaded', function () {
    const container = document.getElementById('functions-container');

    // 显示加载状态
    container.innerHTML = '<div class="loading">正在加载功能数据...</div>';

    // 读取配置文件
    fetch('functions.json')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            renderFunctions(data);
        })
        .catch(error => {
            console.error('加载功能数据失败:', error);
            container.innerHTML = `
                        <div class="error">
                            加载功能数据失败<br>
                            <small>${error.message}</small>
                        </div>
                    `;
        });

    function renderFunctions(data) {
        if (!data || !data.categories || !Array.isArray(data.categories)) {
            container.innerHTML = '<div class="error">配置文件格式错误</div>';
            return;
        }

        let html = '';

        data.categories.forEach(category => {
            if (!category.name || !category.functions || !Array.isArray(category.functions)) {
                return;
            }

            html += `
                        <div class="category-section">
                            <h2 class="category-title">${category.name}</h2>
                            <div class="functions-grid">
                    `;

            category.functions.forEach(func => {
                if (!func.name || !func.link) {
                    return;
                }

                const categoriesHtml = func.categories && Array.isArray(func.categories)
                    ? func.categories.map(cat => `
                                <span class="function-category">${cat}</span>
                              `).join('')
                    : '';

                html += `
                            <div class="function-card" onclick="window.open('${func.link}', '_${func.target || 'self'}')">
                                ${categoriesHtml}
                                <h3 class="function-name">${func.name}</h3>
                                ${func.description ? `<p class="function-desc">${func.description}</p>` : ''}
                                <a href="${func.link}" class="function-link" target="${func.target || '_self'}">
                                    访问功能 →
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