document.addEventListener('DOMContentLoaded', function () {
  const grid = document.getElementById('project-grid');
  if (!grid) return;

  const excludedRepos = new Set(['lsqkk.github.io', 'lsqkk', 'image', 'quarkdoc', 'academic-homepage']);

  // Show skeleton
  grid.innerHTML = '<div class="project-skeleton-grid">' +
    Array(6).fill('<div class="project-skeleton-card"><div class="s-head"><div class="s-title"></div><div class="s-branch"></div></div><div class="s-desc"></div><div class="s-desc-short"></div><div class="s-stats"><div class="s-stat"></div><div class="s-stat"></div><div class="s-stat"></div></div><div class="s-foot"><div class="s-updated"></div><div class="s-open"></div></div></div>').join('') +
    '</div>';

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
          <a class="project-title" href="${repo.html_url}" target="_blank" rel="noopener">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>
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
          <span class="project-open">打开仓库 →</span>
        </div>
      </article>
    `).join('');
  }

  fetch('https://api.github.com/users/lsqkk/repos', { headers: { Accept: 'application/vnd.github+json' } })
    .then((response) => {
      if (!response.ok) throw new Error(`GitHub API: ${response.status}`);
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
