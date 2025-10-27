particlesJS('particles-js', {
    particles: {
        number: { value: 80, density: { enable: true, value_area: 800 } },
        color: { value: "#00a8ff" },
        shape: { type: "circle" },
        opacity: { value: 0.5, random: true },
        size: { value: 3, random: true },
        line_linked: {
            enable: true,
            distance: 150,
            color: "#9c88ff",
            opacity: 0.4,
            width: 1
        },
        move: {
            enable: true,
            speed: 2,
            direction: "none",
            random: true,
            straight: false,
            out_mode: "out",
            bounce: false
        }
    },
    interactivity: {
        detect_on: "canvas",
        events: {
            onhover: { enable: true, mode: "repulse" },
            onclick: { enable: true, mode: "push" },
            resize: true
        }
    }
});

// 从同级JSON文件加载项目数据
document.addEventListener('DOMContentLoaded', function () {
    const opticsContainer = document.getElementById('optics-container');
    const wavesContainer = document.getElementById('waves-container');
    const footerProjects = document.getElementById('footer-projects');

    // 加载projects.json文件
    fetch('./projects.json')
        .then(response => {
            if (!response.ok) {
                throw new Error('网络响应不正常');
            }
            return response.json();
        })
        .then(data => {
            // 清空加载动画
            opticsContainer.innerHTML = '';
            wavesContainer.innerHTML = '';

            // 渲染光学实验项目
            if (data.optics) {
                data.optics.forEach(project => {
                    const projectCard = createProjectCard(project);
                    opticsContainer.appendChild(projectCard);
                });
            }

            // 渲染波动实验项目
            if (data.waves) {
                data.waves.forEach(project => {
                    const projectCard = createProjectCard(project);
                    wavesContainer.appendChild(projectCard);
                });
            }

            // 创建页脚项目链接
            if (data.optics) {
                data.optics.forEach(project => {
                    const footerLink = document.createElement('li');
                    footerLink.innerHTML = `<a href="${project.link}">${project.name}</a>`;
                    footerProjects.appendChild(footerLink);
                });
            }
            if (data.waves) {
                data.waves.forEach(project => {
                    const footerLink = document.createElement('li');
                    footerLink.innerHTML = `<a href="${project.link}">${project.name}</a>`;
                    footerProjects.appendChild(footerLink);
                });
            }
        })
        .catch(error => {
            console.error('加载项目数据时出错:', error);
            opticsContainer.innerHTML = '<p class="error">无法加载项目数据，请稍后再试。</p>';
            wavesContainer.innerHTML = '<p class="error">无法加载项目数据，请稍后再试。</p>';
        });

    // 创建项目卡片的辅助函数
    function createProjectCard(project) {
        const projectCard = document.createElement('div');
        projectCard.className = 'project-card';
        projectCard.innerHTML = `
                    <i class="fas ${project.icon} project-icon"></i>
                    <h3>${project.name}</h3>
                    <p>${project.description}</p>
                    <a href="${project.link}" class="project-link">开始实验 <i class="fas fa-arrow-right"></i></a>
                `;
        return projectCard;
    }
});