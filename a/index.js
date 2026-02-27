document.addEventListener('DOMContentLoaded', function () {
    const projectsContainer = document.getElementById('projects-container');
    const footerProjects = document.getElementById('footer-projects');

    fetch('./projects.json')
        .then(response => {
            if (!response.ok) {
                throw new Error('网络响应不正常');
            }
            return response.json();
        })
        .then(data => {
            const categories = normalizeCategories(data);

            projectsContainer.innerHTML = '';
            footerProjects.innerHTML = '';

            categories.forEach(category => {
                renderCategory(projectsContainer, category);
                renderFooterCategory(footerProjects, category);
            });
        })
        .catch(error => {
            console.error('加载项目数据时出错:', error);
            projectsContainer.innerHTML = '<p class="error">无法加载项目数据，请稍后再试。</p>';
        });
});

function normalizeCategories(data) {
    // 兼容旧格式：数组扁平项目列表
    if (Array.isArray(data)) {
        return [{ name: '全部实验', projects: data }];
    }

    const categories = Array.isArray(data?.categories) ? data.categories : [];
    return categories
        .map(item => ({
            name: item.name || '未分类',
            projects: Array.isArray(item.projects) ? item.projects : []
        }))
        .filter(item => item.projects.length > 0);
}

function renderCategory(container, category) {
    const section = document.createElement('section');
    section.className = 'project-category';

    const title = document.createElement('h3');
    title.className = 'category-title';
    title.textContent = category.name;
    section.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'projects-grid';

    category.projects.forEach(project => {
        const card = document.createElement('article');
        card.className = 'project-card';
        card.innerHTML = `
            <i class="fas ${project.icon || 'fa-flask'} project-icon"></i>
            <h4>${project.name || '未命名项目'}</h4>
            <p>${project.description || '暂无描述'}</p>
            <a href="${project.link || '#'}" class="project-link">查看项目 <i class="fas fa-arrow-right"></i></a>
        `;
        grid.appendChild(card);
    });

    section.appendChild(grid);
    container.appendChild(section);
}

function renderFooterCategory(container, category) {
    const titleLi = document.createElement('li');
    titleLi.className = 'footer-group-title';
    titleLi.textContent = category.name;
    container.appendChild(titleLi);

    category.projects.forEach(project => {
        const item = document.createElement('li');
        item.innerHTML = `<a href="${project.link || '#'}">${project.name || '未命名项目'}</a>`;
        container.appendChild(item);
    });
}
