// 配置marked.js
marked.setOptions({
    breaks: true,
    gfm: true,
    highlight: function (code) {
        return code;
    }
});

// 标签分类和颜色映射
const TAG_COLORS = {
    '更新': 'update',
    '优化': 'optimize',
    '新增': 'add',
    '修复': 'fix'
};

// 全局变量
let allSections = [];
let currentPage = 1;
const ITEMS_PER_PAGE = 15; // 每页显示15条

// 提取并处理标签
function processContent(text) {
    const tagPattern = /^[\u4e00-\u9fa5]+ - /;

    if (tagPattern.test(text)) {
        const match = text.match(/^([\u4e00-\u9fa5a-zA-Z]+) - /);
        if (match) {
            const tag = match[1];
            const content = text.replace(/^[\u4e00-\u9fa5a-zA-Z]+ - /, '');
            const tagClass = TAG_COLORS[tag] || 'default';
            return `<span class="tag ${tagClass}">${tag}</span>${content}`;
        }
    }
    return text;
}

// 处理段落中的标签
function processParagraph(text) {
    const lines = text.split('\n');
    let processedText = '';

    lines.forEach(line => {
        const processedLine = processContent(line.trim());
        processedText += processedLine + '\n';
    });

    return processedText;
}

// 渲染指定页面的内容
function renderPage(pageNumber) {
    const container = document.getElementById('changelog-container');
    const startIndex = (pageNumber - 1) * ITEMS_PER_PAGE;
    const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, allSections.length);
    const pageSections = allSections.slice(startIndex, endIndex);

    let html = '';

    pageSections.forEach(section => {
        const title = section.title;
        const content = section.content;

        // 处理内容中的标签
        const processedContent = processParagraph(content);
        const parsedContent = marked.parse(processedContent);

        html += `
            <div class="update-card">
                <h2>${title}</h2>
                <div class="content">${parsedContent}</div>
            </div>
        `;
    });

    container.innerHTML = html || '<div class="loading">暂无更新内容</div>';
    currentPage = pageNumber;

    // 更新分页UI
    updatePaginationUI();
}

// 生成分页按钮
function createPaginationButtons(totalPages) {
    const container = document.getElementById('pagination-container');

    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let buttonsHTML = '';
    const maxVisibleButtons = 7; // 最多显示7个页码按钮

    // 上一页按钮
    buttonsHTML += `
        <button class="pagination-btn prev-btn ${currentPage === 1 ? 'disabled' : ''}" 
                data-page="${currentPage - 1}">
            上一页
        </button>
    `;

    // 计算页码范围
    let startPage, endPage;
    if (totalPages <= maxVisibleButtons) {
        startPage = 1;
        endPage = totalPages;
    } else {
        const halfVisible = Math.floor(maxVisibleButtons / 2);
        if (currentPage <= halfVisible + 1) {
            startPage = 1;
            endPage = maxVisibleButtons - 2; // 留出位置给省略号和最后一页
        } else if (currentPage >= totalPages - halfVisible) {
            startPage = totalPages - maxVisibleButtons + 3; // 留出位置给第一页和省略号
            endPage = totalPages;
        } else {
            startPage = currentPage - halfVisible + 2;
            endPage = currentPage + halfVisible - 2;
        }
    }

    // 第一页
    if (startPage > 1) {
        buttonsHTML += `
            <button class="pagination-btn ${currentPage === 1 ? 'active' : ''}" 
                    data-page="1">1</button>
        `;
        if (startPage > 2) {
            buttonsHTML += `<span class="pagination-ellipsis">...</span>`;
        }
    }

    // 中间页码
    for (let i = startPage; i <= endPage; i++) {
        buttonsHTML += `
            <button class="pagination-btn ${currentPage === i ? 'active' : ''}" 
                    data-page="${i}">${i}</button>
        `;
    }

    // 最后一页
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            buttonsHTML += `<span class="pagination-ellipsis">...</span>`;
        }
        buttonsHTML += `
            <button class="pagination-btn ${currentPage === totalPages ? 'active' : ''}" 
                    data-page="${totalPages}">${totalPages}</button>
        `;
    }

    // 下一页按钮
    buttonsHTML += `
        <button class="pagination-btn next-btn ${currentPage === totalPages ? 'disabled' : ''}" 
                data-page="${currentPage + 1}">
            下一页
        </button>
    `;

    // 分页信息
    const startItem = (currentPage - 1) * ITEMS_PER_PAGE + 1;
    const endItem = Math.min(currentPage * ITEMS_PER_PAGE, allSections.length);
    const totalItems = allSections.length;

    buttonsHTML += `
        <div class="pagination-info">
            第 ${startItem}-${endItem} 条，共 ${totalItems} 条更新
        </div>
    `;

    container.innerHTML = buttonsHTML;

    // 添加事件监听
    container.querySelectorAll('.pagination-btn:not(.disabled)').forEach(btn => {
        btn.addEventListener('click', () => {
            const page = parseInt(btn.dataset.page);
            if (!isNaN(page) && page >= 1 && page <= totalPages) {
                renderPage(page);
                // 平滑滚动到顶部
                window.scrollTo({
                    top: 0,
                    behavior: 'smooth'
                });
            }
        });
    });
}

// 更新分页UI
function updatePaginationUI() {
    const totalPages = Math.ceil(allSections.length / ITEMS_PER_PAGE);
    createPaginationButtons(totalPages);
}

// 解析markdown内容
function parseMarkdownContent(text) {
    const sections = text.split(/(?=^# )/m);
    allSections = [];

    sections.forEach(section => {
        if (section.trim()) {
            const titleMatch = section.match(/^# (.*)$/m);
            if (titleMatch) {
                const title = titleMatch[1];
                const content = section.replace(/^# .*$/m, '').trim();

                allSections.push({
                    title: title,
                    content: content
                });
            }
        }
    });

    return allSections;
}

// 懒加载逻辑（后台处理）
function lazyLoadContent() {
    // 这里可以添加懒加载逻辑，例如：
    // 1. 使用Intersection Observer监听元素进入视口
    // 2. 分批次加载数据
    // 3. 预加载下一页数据

    // 示例：简单预加载下一页
    const nextPage = currentPage + 1;
    const totalPages = Math.ceil(allSections.length / ITEMS_PER_PAGE);

    if (nextPage <= totalPages) {
        // 这里可以预加载下一页的数据
        // 在实际应用中，可以从服务器预加载数据
        console.log(`预加载第 ${nextPage} 页数据`);
    }
}

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
            parseMarkdownContent(text);

            if (allSections.length === 0) {
                container.innerHTML = '<div class="loading">暂无更新内容</div>';
                return;
            }

            // 渲染第一页
            renderPage(1);

            // 初始化懒加载逻辑
            setTimeout(lazyLoadContent, 1000);
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

// 添加键盘导航支持
document.addEventListener('keydown', (e) => {
    const totalPages = Math.ceil(allSections.length / ITEMS_PER_PAGE);

    if (e.key === 'ArrowLeft' && currentPage > 1) {
        e.preventDefault();
        renderPage(currentPage - 1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (e.key === 'ArrowRight' && currentPage < totalPages) {
        e.preventDefault();
        renderPage(currentPage + 1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
});