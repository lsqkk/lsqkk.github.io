// 从同级JSON文件加载项目数据
document.addEventListener('DOMContentLoaded', function () {
    const projectsContainer = document.getElementById('projects-container');
    const footerProjects = document.getElementById('footer-projects');

    // 加载projects.json文件
    fetch('./projects.json')
        .then(response => {
            if (!response.ok) {
                throw new Error('网络响应不正常');
            }
            return response.json();
        })
        .then(projects => {
            // 清空加载动画
            projectsContainer.innerHTML = '';

            // 渲染项目卡片
            projects.forEach(project => {
                // 创建项目卡片
                const projectCard = document.createElement('div');
                projectCard.className = 'project-card';
                projectCard.innerHTML = `
                            <i class="fas ${project.icon} project-icon"></i>
                            <h3>${project.name}</h3>
                            <p>${project.description}</p>
                            <a href="${project.link}" class="project-link">查看项目 <i class="fas fa-arrow-right"></i></a>
                        `;
                projectsContainer.appendChild(projectCard);

                // 创建页脚项目链接
                const footerLink = document.createElement('li');
                footerLink.innerHTML = `<a href="${project.link}">${project.name}</a>`;
                footerProjects.appendChild(footerLink);
            });
        })
        .catch(error => {
            console.error('加载项目数据时出错:', error);
            projectsContainer.innerHTML = '<p class="error">无法加载项目数据，请稍后再试。</p>';
        });
});