document.addEventListener('DOMContentLoaded', function () {
    const grid = document.getElementById('project-grid');
    if (!grid) return;

    const excludedRepos = new Set(['lsqkk.github.io', 'lsqkk', 'image', 'quarkdoc', 'academic-homepage']);

    function formatCompactNumber(value) {
        const count = Number(value) || 0;
        if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
        if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
        return String(count);
    }

    function formatDateText(dateText) {
        if (!dateText) return '--';
        const date = new Date(dateText);
        if (Number.isNaN(date.getTime())) return '--';
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    function escapeHtml(text) {
        return String(text ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function renderProjects(repos) {
        if (!repos.length) {
            grid.innerHTML = '<div class="project-empty">暂无可展示的公开仓库</div>';
            return;
        }

        grid.innerHTML = repos.map((repo) => `
            <article class="project-card" onclick="window.open('${repo.html_url}', '_blank')">
                <div class="project-card-head">
                    <a class="project-title" href="${repo.html_url}" target="_blank">
                        <i class="fab fa-github"></i>
                        <span>${escapeHtml(repo.name)}</span>
                    </a>
                    <span class="project-branch">${escapeHtml(repo.default_branch || 'main')}</span>
                </div>
                <p class="project-desc">${escapeHtml(repo.description || 'GitHub 开源项目')}</p>
                <div class="project-stats">
                    <div class="project-stat">
                        <div class="project-stat-label">Stars</div>
                        <div class="project-stat-value">${formatCompactNumber(repo.watchers)}</div>
                    </div>
                    <div class="project-stat">
                        <div class="project-stat-label">Forks</div>
                        <div class="project-stat-value">${formatCompactNumber(repo.forks)}</div>
                    </div>
                    <div class="project-stat">
                        <div class="project-stat-label">Issues</div>
                        <div class="project-stat-value">${formatCompactNumber(repo.open_issues_count)}</div>
                    </div>
                </div>
                <div class="project-foot">
                    <span class="project-updated">Updated ${formatDateText(repo.updated_at)}</span>
                    <span class="project-open">打开仓库</span>
                </div>
            </article>
        `).join('');
    }

    fetch('https://api.github.com/users/lsqkk/repos', { headers: { Accept: 'application/vnd.github+json' } })
        .then((response) => {
            if (!response.ok) {
                throw new Error(`GitHub API: ${response.status}`);
            }
            return response.json();
        })
        .then((repos) => (repos || [])
            .filter((repo) => !excludedRepos.has(repo.name))
            .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)))
        .then(renderProjects)
        .catch((error) => {
            console.error('加载项目仓库失败:', error);
            grid.innerHTML = `
                <div class="project-error">
                    项目加载失败
                    <small>${escapeHtml(error.message || '请稍后重试')}</small>
                </div>
            `;
        });
});

