// 全局变量
let allEntries = [];
let currentPage = 1;
const entriesPerPage = 10;
let monthData = {};

marked.setOptions({
    breaks: true,
    gfm: true
});

async function loadDynamic() {
    try {
        const preloaded = Array.isArray(window.__DT_PRELOADED__) ? window.__DT_PRELOADED__ : [];
        if (preloaded.length > 0) {
            allEntries = normalizeEntries(preloaded);
        } else {
            const response = await fetch('/assets/pages/blog/dt/dt.md');
            const mdContent = await response.text();
            allEntries = parseDynamicEntries(mdContent);
        }

        analyzeMonthData();
        renderCalendar();
        renderPage(1);
    } catch (error) {
        const container = document.getElementById('dynamic-content');
        if (container) {
            container.innerHTML = `
                <div class="dynamic-card">
                    <h3>动态加载失败</h3>
                    <p>${error.message}</p>
                </div>
            `;
        }
    }
}

function normalizeEntries(preloaded) {
    return preloaded.map((entry) => {
        const dateStr = (entry.date || '').trim();
        let monthKey = '';
        let year = '';
        let month = '';
        if (dateStr) {
            const date = new Date(dateStr);
            if (!Number.isNaN(date.getTime())) {
                year = date.getFullYear();
                month = date.getMonth() + 1;
                monthKey = `${year}-${String(month).padStart(2, '0')}`;
            }
        }

        const content = typeof entry.content === 'string'
            ? entry.content
            : Array.isArray(entry.lines)
                ? entry.lines.join('\n')
                : '';
        const imageMatches = content.match(/!\[.*?\]\((.*?)\)/g);
        const images = imageMatches ? imageMatches.map((img) => {
            const match = img.match(/!\[.*?\]\((.*?)\)/);
            return match ? match[1] : null;
        }).filter(Boolean) : [];

        return {
            id: entry.id || '',
            title: entry.title || '未命名动态',
            date: dateStr,
            year,
            month,
            monthKey,
            content,
            images
        };
    });
}

function parseDynamicEntries(content) {
    const dateCountMap = {};
    return content.split(/\n(?=# )/g).map(entry => {
        const [header, ...body] = entry.split('\n');
        const titleMatch = header.match(/^# (.*)/);
        const dateMatch = body.join('\n').match(/## 日期：(.+)/);

        const imageMatches = body.join('\n').match(/!\[.*?\]\((.*?)\)/g);
        const images = imageMatches ? imageMatches.map(img => {
            const match = img.match(/!\[.*?\]\((.*?)\)/);
            return match ? match[1] : null;
        }).filter(Boolean) : [];

        const dateStr = dateMatch ? dateMatch[1].trim() : '';
        let monthKey = '';
        let year = '';
        let month = '';

        if (dateStr) {
            const date = new Date(dateStr);
            if (!isNaN(date.getTime())) {
                year = date.getFullYear();
                month = date.getMonth() + 1;
                monthKey = `${year}-${month.toString().padStart(2, '0')}`;
            }
        }

        const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : 'undated';
        dateCountMap[dateKey] = (dateCountMap[dateKey] || 0) + 1;
        const id = `${dateKey}-${dateCountMap[dateKey]}`;

        return {
            id,
            title: titleMatch ? titleMatch[1].trim() : '未命名动态',
            date: dateStr,
            year,
            month,
            monthKey,
            content: body.join('\n').replace(/## 日期：.+\n?/, '').trim(),
            images
        };
    }).filter(entry => entry.title);
}

// 分析月份数据
function analyzeMonthData() {
    monthData = {};

    allEntries.forEach((entry, index) => {
        if (entry.monthKey) {
            if (!monthData[entry.monthKey]) {
                monthData[entry.monthKey] = {
                    count: 0,
                    latestIndex: index,
                    year: entry.year,
                    month: entry.month
                };
            }
            monthData[entry.monthKey].count++;

            // 保留最新的动态索引（因为allEntries是反序的，所以第一个就是最新的）
            monthData[entry.monthKey].latestIndex = index;
        }
    });
}

// 渲染月历
function renderCalendar() {
    const sidebar = document.getElementById('calendar-sidebar');
    const monthKeys = Object.keys(monthData).sort((a, b) => b.localeCompare(a));

    let calendarHTML = '<div class="calendar-widget">';
    calendarHTML += '<h3 class="calendar-title">📅 动态月历</h3>';
    calendarHTML += '<div class="month-list">';

    if (monthKeys.length === 0) {
        calendarHTML += '<div class="month-item">暂无动态</div>';
    } else {
        monthKeys.forEach(key => {
            const data = monthData[key];
            const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月',
                '七月', '八月', '九月', '十月', '十一月', '十二月'];
            const monthName = `${data.year}年 ${monthNames[data.month - 1]}`;

            calendarHTML += `
                    <a href="javascript:void(0)" class="month-item" data-month-key="${key}">
                        <span class="month-name">${monthName}</span>
                        <span class="month-count">${data.count}</span>
                    </a>
                    `;
        });
    }

    calendarHTML += '</div></div>';
    sidebar.innerHTML = calendarHTML;

    // 添加月份点击事件
    document.querySelectorAll('.month-item[data-month-key]').forEach(item => {
        item.addEventListener('click', function () {
            const monthKey = this.getAttribute('data-month-key');
            jumpToMonth(monthKey);
        });
    });
}

// 跳转到指定月份的最新动态
function jumpToMonth(monthKey) {
    const data = monthData[monthKey];
    if (!data) return;

    // 计算该动态所在的页数
    const entryIndex = data.latestIndex;
    const page = Math.floor(entryIndex / entriesPerPage) + 1;

    // 滚动到顶部
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // 渲染该页
    renderPage(page);

    // 高亮当前月份
    document.querySelectorAll('.month-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector(`.month-item[data-month-key="${monthKey}"]`).classList.add('active');
}

// 渲染指定页
function renderPage(page) {
    currentPage = page;
    const startIndex = (page - 1) * entriesPerPage;
    const endIndex = Math.min(startIndex + entriesPerPage, allEntries.length);
    const pageEntries = allEntries.slice(startIndex, endIndex);

    renderDynamicEntries(pageEntries);
    renderPagination();
}

function renderDynamicEntries(entries) {
    const container = document.getElementById('dynamic-content');
    if (!container) return;
    const emotionParser = new QQEmotionParser();
    if (window.DynamicGallery && typeof window.DynamicGallery.reset === 'function') {
        window.DynamicGallery.reset();
    }

    container.innerHTML = entries.map((entry, index) => {
        const extracted = window.DynamicGallery
            ? window.DynamicGallery.extractImages(entry.content)
            : { text: entry.content.replace(/!\[.*?\]\((.*?)\)/g, ''), images: entry.images || [] };
        let contentWithoutImages = extracted.text;
        let parsedContent = emotionParser.parse(contentWithoutImages);
        const htmlContent = marked.parse(parsedContent, {
            breaks: true,
            gfm: true
        });

        return `
        <div class="dynamic-card" data-dynamic-id="${entry.id}" data-dynamic-link="/blog/dt/${entry.id}">
            <h2 class="dynamic-title">${entry.title}</h2>
            ${entry.date ? `<div class="dynamic-date">📅 ${entry.date}</div>` : ''}
            <div class="dynamic-content">
                ${htmlContent}
            </div>
            ${extracted.images.length > 0 && window.DynamicGallery
                ? window.DynamicGallery.createGalleryHtml(extracted.images)
                : ''}
            <div class="dynamic-entry-footer">
                <a href="/blog/dt/${entry.id}" class="dynamic-detail-link">查看详情</a>
                <div class="dynamic-entry-stats">
                    <span>点赞 <span data-dynamic-like-count>0</span></span>
                    <span>评论 <span data-dynamic-comment-count>0</span></span>
                </div>
            </div>
        </div>
        `;
    }).join('');
}

// 渲染分页
function renderPagination() {
    const totalPages = Math.ceil(allEntries.length / entriesPerPage);
    const container = document.getElementById('pagination-container');

    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let paginationHTML = '<div class="pagination">';

    // 上一页按钮
    paginationHTML += `
                <button class="page-btn prev-btn" ${currentPage === 1 ? 'disabled' : ''}
                        onclick="changePage(${currentPage - 1})">上一页</button>
            `;

    // 页码按钮
    const maxVisible = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);

    if (endPage - startPage + 1 < maxVisible) {
        startPage = Math.max(1, endPage - maxVisible + 1);
    }

    if (startPage > 1) {
        paginationHTML += `<button class="page-btn" onclick="changePage(1)">1</button>`;
        if (startPage > 2) {
            paginationHTML += `<span class="page-btn" style="cursor:default">...</span>`;
        }
    }

    for (let i = startPage; i <= endPage; i++) {
        paginationHTML += `
                    <button class="page-btn ${i === currentPage ? 'active' : ''}" 
                            onclick="changePage(${i})">${i}</button>
                `;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            paginationHTML += `<span class="page-btn" style="cursor:default">...</span>`;
        }
        paginationHTML += `<button class="page-btn" onclick="changePage(${totalPages})">${totalPages}</button>`;
    }

    // 下一页按钮
    paginationHTML += `
                <button class="page-btn next-btn" ${currentPage === totalPages ? 'disabled' : ''}
                        onclick="changePage(${currentPage + 1})">下一页</button>
            `;

    paginationHTML += '</div>';

    // 添加页面信息
    const startEntry = (currentPage - 1) * entriesPerPage + 1;
    const endEntry = Math.min(currentPage * entriesPerPage, allEntries.length);
    paginationHTML += `
                <div class="page-info">
                    显示 ${startEntry}-${endEntry} 条，共 ${allEntries.length} 条动态
                </div>
            `;

    container.innerHTML = paginationHTML;
}

// 切换页面
function changePage(page) {
    if (page < 1 || page > Math.ceil(allEntries.length / entriesPerPage)) return;

    // 滚动到顶部
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // 渲染新页面
    renderPage(page);
}

loadDynamic();
