document.addEventListener('DOMContentLoaded', function () {
    const container = document.getElementById('functions-container');

    // 显示加载状态
    container.innerHTML = '<div class="loading">正在加载功能数据...</div>';

    // 仅加载本地配置，项目仓库迁移到 /blog/project 页面
    fetchLocalFunctions()
        .then((localData) => {
            renderFunctions(localData);
        })
        .catch(error => {
            console.error('加载数据失败:', error);
            container.innerHTML = `
            <div class="error">
                加载功能数据失败<br>
                <small>${error.message}</small>
            </div>
        `;
        });

    // 加载本地配置文件
    function fetchLocalFunctions() {
        if (window.__BLOG_FUNCTIONS__) {
            return Promise.resolve(window.__BLOG_FUNCTIONS__);
        }
        return fetch('/assets/pages/blog/functions.json')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            });
    }

    function renderFunctions(localData) {
        if (!localData || !localData.categories || !Array.isArray(localData.categories)) {
            container.innerHTML = '<div class="error">配置文件格式错误</div>';
            return;
        }

        let html = '';

        // 渲染本地配置的类别（排除"其他仓库项目"）
        localData.categories.forEach(category => {
            if (!category.name || !category.functions || !Array.isArray(category.functions)) {
                return;
            }

            html += renderCategory(category);
        });

        container.innerHTML = html;
    }

    function renderCategory(category) {
        let html = `
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

            // 处理链接打开方式
            const target = func.target === '_blank' ? '_blank' : '_self';
            const onClick = target === '_blank'
                ? `onclick="window.open('${func.link}', '_blank')"`
                : `onclick="window.location.href='${func.link}'"`;

            html += `
                <div class="function-card" ${onClick}>
                    ${categoriesHtml}
                    <h3 class="function-name">${func.name}</h3>
                    ${func.description ? `<p class="function-desc">${func.description}</p>` : ''}
                    <a href="${func.link}" class="function-link" target="${target}">
                        访问功能 →
                    </a>
                </div>
            `;
        });

        html += `
                </div>
            </div>
        `;

        return html;
    }
});
