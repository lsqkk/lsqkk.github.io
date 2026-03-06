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
        const response = await fetch('/assets/pages/blog/dt/dt.md');
        const mdContent = await response.text();
        allEntries = parseDynamicEntries(mdContent);

        // 分析月份数据
        analyzeMonthData();

        // 初始化显示
        renderCalendar();
        renderPage(1);
    } catch (error) {
        document.getElementById('dynamic-content').innerHTML = `
            <div class="dynamic-card">
                <h3>动态加载失败</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
}

function parseDynamicEntries(content) {
    return content.split(/\n(?=# )/g).map(entry => {
        const [header, ...body] = entry.split('\n');
        const titleMatch = header.match(/^# (.*)/);
        const dateMatch = body.join('\n').match(/## 日期：(.+)/);

        // 提取图片URL
        const imageMatches = body.join('\n').match(/!\[.*?\]\((.*?)\)/g);
        const images = imageMatches ? imageMatches.map(img => {
            const match = img.match(/!\[.*?\]\((.*?)\)/);
            return match ? match[1] : null;
        }).filter(Boolean) : [];

        // 解析日期
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

        return {
            title: titleMatch ? titleMatch[1].trim() : '未命名动态',
            date: dateStr,
            year: year,
            month: month,
            monthKey: monthKey,
            content: body.join('\n').replace(/## 日期：.+\n?/, '').trim(),
            images: images
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
    const emotionParser = new QQEmotionParser();

    container.innerHTML = entries.map((entry, index) => {
        let contentWithoutImages = entry.content.replace(/!\[.*?\]\((.*?)\)/g, '');
        let parsedContent = emotionParser.parse(contentWithoutImages);
        const htmlContent = marked.parse(parsedContent, {
            breaks: true,
            gfm: true
        });

        const globalIndex = allEntries.findIndex(e =>
            e.title === entry.title && e.date === entry.date
        );

        return `
        <div class="dynamic-card" data-entry-index="${globalIndex}">
            <h2 class="dynamic-title">${entry.title}</h2>
            ${entry.date ? `<div class="dynamic-date">📅 ${entry.date}</div>` : ''}
            <div class="dynamic-content">
                ${htmlContent}
            </div>
            ${entry.images.length > 0 ? renderImageGallery(entry.images, globalIndex) : ''}
        </div>
        `;
    }).join('');

    // 初始化所有画廊
    document.querySelectorAll('.gallery-container').forEach(initGallery);
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

// 以下为原有的图片画廊相关函数，保持不变
function renderImageGallery(images, entryIndex) {
    const totalImages = images.length;
    let colsPerRow;

    if (totalImages <= 4) {
        colsPerRow = 2;
    } else {
        colsPerRow = 3;
    }

    const rows = Math.ceil(totalImages / colsPerRow);

    let galleryHTML = '<div class="gallery-container">';

    for (let row = 0; row < rows; row++) {
        galleryHTML += '<div class="gallery-row">';
        const startIdx = row * colsPerRow;
        const endIdx = Math.min(startIdx + colsPerRow, totalImages);

        for (let i = startIdx; i < endIdx; i++) {
            galleryHTML += `
                <div class="gallery-item" data-entry-index="${entryIndex}" data-img-index="${i}">
                    <img src="${images[i]}" 
                         alt="动态图片" 
                         loading="lazy"
                         onclick="openGallery(${entryIndex}, ${i})">
                </div>
            `;
        }
        galleryHTML += '</div>';
    }

    galleryHTML += '</div>';
    return galleryHTML;
}

function initGallery(container) {
    // 初始化逻辑
}

function openGallery(entryIndex, imgIndex) {
    const entry = document.querySelector(`[data-entry-index="${entryIndex}"]`);
    const images = entry.querySelectorAll('.gallery-item img');
    const imageUrls = Array.from(images).map(img => img.src);

    const modal = document.createElement('div');
    modal.className = 'gallery-modal';
    modal.innerHTML = `
        <div class="gallery-modal-content">
            <span class="close-btn" onclick="closeGallery()">&times;</span>
            <div class="gallery-modal-main">
                <img src="${imageUrls[imgIndex]}" class="current-image" alt="全屏图片">
                <div class="gallery-nav">
                    ${imgIndex > 0 ? `<button class="nav-btn prev-btn" onclick="changeImage(${imgIndex - 1}, ${entryIndex})">❮</button>` : ''}
                    <span class="image-counter">${imgIndex + 1} / ${imageUrls.length}</span>
                    ${imgIndex < imageUrls.length - 1 ? `<button class="nav-btn next-btn" onclick="changeImage(${imgIndex + 1}, ${entryIndex})">❯</button>` : ''}
                </div>
            </div>
            <div class="gallery-thumbnails">
                ${imageUrls.map((url, index) => `
                    <img src="${url}" 
                         class="thumbnail ${index === imgIndex ? 'active' : ''}" 
                         onclick="changeImage(${index}, ${entryIndex})"
                         alt="缩略图 ${index + 1}">
                `).join('')}
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
}

function closeGallery() {
    const modal = document.querySelector('.gallery-modal');
    if (modal) {
        modal.remove();
        document.body.style.overflow = 'auto';
    }
}

function changeImage(newIndex, entryIndex) {
    const entry = document.querySelector(`[data-entry-index="${entryIndex}"]`);
    const images = entry.querySelectorAll('.gallery-item img');
    const imageUrls = Array.from(images).map(img => img.src);

    if (newIndex >= 0 && newIndex < imageUrls.length) {
        const modal = document.querySelector('.gallery-modal');
        if (modal) {
            modal.querySelector('.current-image').src = imageUrls[newIndex];
            modal.querySelector('.image-counter').textContent = `${newIndex + 1} / ${imageUrls.length}`;

            modal.querySelectorAll('.thumbnail').forEach((thumb, index) => {
                thumb.classList.toggle('active', index === newIndex);
            });

            const prevBtn = modal.querySelector('.prev-btn');
            const nextBtn = modal.querySelector('.next-btn');

            if (prevBtn) {
                prevBtn.onclick = () => changeImage(newIndex - 1, entryIndex);
                prevBtn.style.visibility = newIndex > 0 ? 'visible' : 'hidden';
            }

            if (nextBtn) {
                nextBtn.onclick = () => changeImage(newIndex + 1, entryIndex);
                nextBtn.style.visibility = newIndex < imageUrls.length - 1 ? 'visible' : 'hidden';
            }
        }
    }
}

// 添加ESC键关闭功能
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeGallery();
    }
});

loadDynamic();
