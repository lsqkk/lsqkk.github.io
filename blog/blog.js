document.addEventListener('DOMContentLoaded', function () {
    const container = document.getElementById('functions-container');

    // 显示加载状态
    container.innerHTML = '<div class="loading">正在加载功能数据...</div>';

    // 同时加载本地配置和GitHub仓库数据
    Promise.all([
        fetchLocalFunctions(),
        fetchGitHubRepos()
    ])
        .then(([localData, githubRepos]) => {
            renderFunctions(localData, githubRepos);
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
        return fetch('functions.json')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            });
    }

    // 从GitHub API获取仓库数据
    function fetchGitHubRepos() {
        return fetch('https://api.github.com/users/lsqkk/repos')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`GitHub API错误! 状态码: ${response.status}`);
                }
                return response.json();
            })
            .then(repos => {
                // 过滤掉要排除的仓库
                const excludedRepos = ['lsqkk.github.io', 'lsqkk', 'image', 'quarkdoc', 'academic-homepage'];
                return repos.filter(repo => !excludedRepos.includes(repo.name));
            });
    }

    function renderFunctions(localData, githubRepos) {
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

            // 跳过"其他仓库项目"类别，我们将用GitHub数据动态生成
            if (category.name === "其他仓库项目") {
                return;
            }

            html += renderCategory(category);
        });

        // 添加GitHub仓库类别
        if (githubRepos && githubRepos.length > 0) {
            html += renderGitHubCategory(githubRepos);
        }

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

    function renderGitHubCategory(repos) {
        let html = `
        <div class="category-section">
            <h2 class="category-title">GitHub 项目仓库</h2>
            <div class="functions-grid">
    `;

        repos.forEach(repo => {
            // 使用语言作为标签，保持与其他卡片一致
            const categoriesHtml = repo.language
                ? `<span class="function-category">${repo.language}</span>`
                : '<span class="function-category">代码</span>';

            const description = repo.description || 'GitHub 开源项目';

            html += `
            <div class="function-card" onclick="window.open('${repo.html_url}', '_blank')">
                ${categoriesHtml}
                <h3 class="function-name">${repo.name}</h3>
                <p class="function-desc">${description}</p>
                <div class="repo-stats">
                    <span class="repo-stat">${repo.stargazers_count || 0}</span>
                    <span class="repo-stat">${repo.forks_count || 0}</span>
                </div>
                <a href="${repo.html_url}" class="function-link" target="_blank">
                    访问仓库 →
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