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
const ITEMS_PER_PAGE = 15;

// 日历/热力图数据
let dailyCounts = {};
let monthData = {};
let dateSectionIndex = {}; // date -> index in allSections

const GITHUB_REPO = 'https://github.com/lsqkk/lsqkk.github.io';

function escapeHtml(text) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
}

// ════════════════════════════════════════
//   Page rendering (entries)
// ════════════════════════════════════════
function renderPage(pageNumber) {
    const container = document.getElementById('changelog-container');
    const startIndex = (pageNumber - 1) * ITEMS_PER_PAGE;
    const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, allSections.length);
    const pageSections = allSections.slice(startIndex, endIndex);

    let html = '';

    pageSections.forEach(section => {
        if (section.entries) {
            // New structured format: { date, entries: [{ type, description, commit }] }
            let sectionHtml = `<div class="update-card"><h2>${escapeHtml(section.date)}</h2><div class="content">`;
            section.entries.forEach(entry => {
                const tagClass = TAG_COLORS[entry.type] || 'default';
                // Fixed-width hash column — keeps tag at same position
                const hashHtml = entry.commit
                    ? `<span class="entry-hash"><a href="${GITHUB_REPO}/commit/${escapeHtml(entry.commit)}"><code>${escapeHtml(entry.commit)}</code></a></span>`
                    : `<span class="entry-hash">&nbsp;</span>`;
                const tagHtml = `<span class="tag ${tagClass}">${escapeHtml(entry.type)}</span>`;
                const descHtml = marked.parseInline
                    ? marked.parseInline(entry.description || '')
                    : marked.parse(entry.description || '');
                sectionHtml += `<p>${hashHtml}${tagHtml}<span class="entry-desc">${descHtml}</span></p>`;
            });
            sectionHtml += '</div></div>';
            html += sectionHtml;
        } else {
            // Legacy format (header section with { title, content })
            const title = section.title;
            const content = section.content || '';
            const processedContent = processParagraph(content);
            const parsedContent = marked.parse(processedContent);

            html += `
                <div class="update-card">
                    <h2>${escapeHtml(title)}</h2>
                    <div class="content">${parsedContent}</div>
                </div>
            `;
        }
    });

    container.innerHTML = html || '<div class="loading">暂无更新内容</div>';
    currentPage = pageNumber;

    updatePaginationUI();
}

// ════════════════════════════════════════
//   Legacy content processing (unchanged)
// ════════════════════════════════════════
function processContent(text) {
    const tagPattern = /^[一-龥]+ - /;

    if (tagPattern.test(text)) {
        const match = text.match(/^([一-龥a-zA-Z]+) - /);
        if (match) {
            const tag = match[1];
            let content = text.replace(/^[一-龥a-zA-Z]+ - /, '');
            const tagClass = TAG_COLORS[tag] || 'default';

            // 检测并移动 commit hash（六位十六进制）到最前
            const hashPattern = /\[`([a-f0-9]{6})`\]\([^)]+\)\s*$/;
            const hashMatch = content.match(hashPattern);
            if (hashMatch) {
                const hashMd = hashMatch[0].trim();
                content = content.replace(hashPattern, '').trim();
                return `${hashMd} <span class="tag ${tagClass}">${tag}</span>${content}`;
            }

            return `<span class="tag ${tagClass}">${tag}</span>${content}`;
        }
    }
    return text;
}

function processParagraph(text) {
    const lines = text.split('\n');
    let processedText = '';

    lines.forEach(line => {
        const processedLine = processContent(line.trim());
        processedText += processedLine + '\n';
    });

    return processedText;
}

// ════════════════════════════════════════
//   Pagination
// ════════════════════════════════════════
function createPaginationButtons(totalPages) {
    const container = document.getElementById('pagination-container');

    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let buttonsHTML = '';
    const maxVisibleButtons = 7;

    // 上一页按钮
    buttonsHTML += `
        <button class="pagination-btn prev-btn ${currentPage === 1 ? 'disabled' : ''}"
                data-page="${currentPage - 1}">
            上一页
        </button>
    `;

    let startPage, endPage;
    if (totalPages <= maxVisibleButtons) {
        startPage = 1;
        endPage = totalPages;
    } else {
        const halfVisible = Math.floor(maxVisibleButtons / 2);
        if (currentPage <= halfVisible + 1) {
            startPage = 1;
            endPage = maxVisibleButtons - 2;
        } else if (currentPage >= totalPages - halfVisible) {
            startPage = totalPages - maxVisibleButtons + 3;
            endPage = totalPages;
        } else {
            startPage = currentPage - halfVisible + 2;
            endPage = currentPage + halfVisible - 2;
        }
    }

    if (startPage > 1) {
        buttonsHTML += `
            <button class="pagination-btn ${currentPage === 1 ? 'active' : ''}"
                    data-page="1">1</button>
        `;
        if (startPage > 2) {
            buttonsHTML += `<span class="pagination-ellipsis">...</span>`;
        }
    }

    for (let i = startPage; i <= endPage; i++) {
        buttonsHTML += `
            <button class="pagination-btn ${currentPage === i ? 'active' : ''}"
                    data-page="${i}">${i}</button>
        `;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            buttonsHTML += `<span class="pagination-ellipsis">...</span>`;
        }
        buttonsHTML += `
            <button class="pagination-btn ${currentPage === totalPages ? 'active' : ''}"
                    data-page="${totalPages}">${totalPages}</button>
        `;
    }

    buttonsHTML += `
        <button class="pagination-btn next-btn ${currentPage === totalPages ? 'disabled' : ''}"
                data-page="${currentPage + 1}">
            下一页
        </button>
    `;

    const startItem = (currentPage - 1) * ITEMS_PER_PAGE + 1;
    const endItem = Math.min(currentPage * ITEMS_PER_PAGE, allSections.length);
    const totalItems = allSections.length;

    buttonsHTML += `
        <div class="pagination-info">
            第 ${startItem}-${endItem} 条，共 ${totalItems} 条更新
        </div>
    `;

    container.innerHTML = buttonsHTML;

    container.querySelectorAll('.pagination-btn:not(.disabled)').forEach(btn => {
        btn.addEventListener('click', () => {
            const page = parseInt(btn.dataset.page);
            if (!isNaN(page) && page >= 1 && page <= totalPages) {
                renderPage(page);
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
    });
}

function updatePaginationUI() {
    const totalPages = Math.ceil(allSections.length / ITEMS_PER_PAGE);
    createPaginationButtons(totalPages);
}

// ════════════════════════════════════════
//   Calendar / heatmap data
// ════════════════════════════════════════
function buildCalendarData(sections) {
    dailyCounts = {};
    monthData = {};
    dateSectionIndex = {};

    sections.forEach((s, idx) => {
        if (s.date && s.entries) {
            // Daily counts
            dailyCounts[s.date] = (dailyCounts[s.date] || 0) + s.entries.length;
            dateSectionIndex[s.date] = idx;

            // Monthly data
            const monthKey = s.date.substring(0, 7);
            if (!monthData[monthKey]) {
                monthData[monthKey] = { count: 0, firstIdx: idx };
            }
            monthData[monthKey].count += s.entries.length;

            // Keep the earliest (chronologically first) section index for jump
            if (idx < monthData[monthKey].firstIdx) {
                monthData[monthKey].firstIdx = idx;
            }
        }
    });
}

function toDateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// ════════════════════════════════════════
//   Sidebar rendering
// ════════════════════════════════════════
function renderSidebar() {
    const sidebar = document.getElementById('log-sidebar-content');
    if (!sidebar) return;

    let html = '';

    // 1. Stats widget
    html += renderStats();
    // 2. Heatmap widget
    html += renderHeatmap();
    // 3. Month list widget
    html += renderMonthList();

    sidebar.innerHTML = html;

    // Attach events
    attachHeatmapEvents();
    attachMonthEvents();
}

function renderStats() {
    const totalUpdates = allSections.reduce((sum, s) => {
        return sum + (s.entries ? s.entries.length : 0);
    }, 0);
    const totalDays = Object.keys(dailyCounts).length;
    const months = Object.keys(monthData).length;
    const latestDate = Object.keys(dailyCounts).sort().pop() || '—';

    return `
        <div class="log-sidebar-widget">
            <h3>📊 统计概览</h3>
            <div class="log-stats">
                <div class="log-stat-item">
                    <span>更新条目</span>
                    <span class="log-stat-value">${totalUpdates}</span>
                </div>
                <div class="log-stat-item">
                    <span>活跃天数</span>
                    <span class="log-stat-value">${totalDays}</span>
                </div>
                <div class="log-stat-item">
                    <span>覆盖月份</span>
                    <span class="log-stat-value">${months}</span>
                </div>
                <div class="log-stat-item">
                    <span>最近更新</span>
                    <span class="log-stat-value">${latestDate}</span>
                </div>
            </div>
        </div>
    `;
}

function renderHeatmap() {
    const dates = Object.keys(dailyCounts).sort();
    if (dates.length === 0) return '';

    const lastDate = new Date(dates[dates.length - 1]);
    // Go back ~18 weeks from last data date, aligned to Monday
    const startDate = new Date(lastDate);
    startDate.setDate(startDate.getDate() - 18 * 7);
    {
        const dow = startDate.getDay();
        const monOff = dow === 0 ? -6 : 1 - dow;
        startDate.setDate(startDate.getDate() + monOff);
    }

    const endDate = new Date(lastDate);

    // Month labels
    const monthLabelsHtml = buildMonthLabels(startDate, endDate);

    // Build grid
    let cells = '';
    const cur = new Date(startDate);
    const end = new Date(endDate);
    // extend to end of week (Sunday)
    end.setDate(end.getDate() + (6 - end.getDay()));

    while (cur <= end) {
        for (let d = 0; d < 7; d++) {
            const ds = toDateStr(cur);
            const count = dailyCounts[ds] || 0;
            const level = count === 0 ? 0 : Math.min(Math.ceil(count / 4), 4);
            const title = count > 0 ? `${ds} · ${count} 条更新` : ds;
            cells += `<div class="heatmap-cell level-${level}" data-date="${ds}" title="${title}"></div>`;
            cur.setDate(cur.getDate() + 1);
        }
    }

    return `
        <div class="log-sidebar-widget">
            <h3>🔥 贡献热力图</h3>
            <div class="heatmap-wrapper">
                ${monthLabelsHtml}
                <div class="heatmap-body">
                    <div class="heatmap-day-labels">
                        <span>一</span><span></span><span>三</span><span></span><span>五</span><span></span><span></span>
                    </div>
                    <div class="heatmap-grid">${cells}</div>
                </div>
                <div class="heatmap-legend">
                    <span>少</span>
                    <span class="legend-cell level-0"></span>
                    <span class="legend-cell level-1"></span>
                    <span class="legend-cell level-2"></span>
                    <span class="legend-cell level-3"></span>
                    <span class="legend-cell level-4"></span>
                    <span>多</span>
                </div>
            </div>
        </div>
    `;
}

function buildMonthLabels(startDate, endDate) {
    const names = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
    const cur = new Date(startDate);
    const labels = [];
    let lastMonth = -1;

    while (cur <= endDate) {
        const m = cur.getMonth();
        if (m !== lastMonth) {
            labels.push({ text: names[m] });
            lastMonth = m;
            // Advance ~4 weeks to avoid too many labels
            cur.setDate(cur.getDate() + 28);
        } else {
            cur.setDate(cur.getDate() + 7);
        }
    }

    if (labels.length === 0) return '<div class="heatmaplabels"></div>';

    let html = '<div class="heatmaplabels">';
    const colWidth = 13; // 11px cell + 2px gap
    // Distribute labels evenly across available columns
    labels.forEach((label, i) => {
        html += `<span>${label.text}</span>`;
        if (i < labels.length - 1) {
            const spacerWidth = Math.floor(18 / labels.length) * colWidth;
            html += `<span style="display:inline-block;width:${Math.max(spacerWidth, colWidth * 2)}px"></span>`;
        }
    });
    html += '</div>';
    return html;
}

function renderMonthList() {
    const monthKeys = Object.keys(monthData).sort((a, b) => b.localeCompare(a));

    if (monthKeys.length === 0) return '';

    let html = `
        <div class="log-sidebar-widget">
            <h3>📅 月份索引</h3>
            <div class="log-month-list">
    `;

    const monthNames = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];

    monthKeys.forEach(key => {
        const data = monthData[key];
        const parts = key.split('-');
        const label = `${parts[0]}年 ${monthNames[parseInt(parts[1]) - 1]}`;

        html += `
            <button class="log-month-item" data-month-key="${key}">
                <span>${label}</span>
                <span class="log-month-count">${data.count}</span>
            </button>
        `;
    });

    html += '</div></div>';
    return html;
}

// ════════════════════════════════════════
//   Sidebar event handlers
// ════════════════════════════════════════
function attachHeatmapEvents() {
    document.querySelectorAll('.heatmap-cell[data-date]').forEach(cell => {
        cell.addEventListener('click', function () {
            const dateStr = this.getAttribute('data-date');
            if (dateStr && dateSectionIndex[dateStr] !== undefined) {
                const idx = dateSectionIndex[dateStr];
                const page = Math.floor(idx / ITEMS_PER_PAGE) + 1;
                renderPage(page);
                window.scrollTo({ top: 0, behavior: 'smooth' });

                // Highlight active heatmap cell
                document.querySelectorAll('.heatmap-cell').forEach(c => c.style.outline = 'none');
                this.style.outline = '2px solid var(--accent)';
                this.style.outlineOffset = '1px';
                setTimeout(() => { this.style.outline = 'none'; }, 1500);
            }
        });
    });
}

function attachMonthEvents() {
    document.querySelectorAll('.log-month-item').forEach(item => {
        item.addEventListener('click', function () {
            const monthKey = this.getAttribute('data-month-key');
            const data = monthData[monthKey];
            if (!data) return;

            const page = Math.floor(data.firstIdx / ITEMS_PER_PAGE) + 1;
            renderPage(page);
            window.scrollTo({ top: 0, behavior: 'smooth' });

            document.querySelectorAll('.log-month-item').forEach(el => el.classList.remove('active'));
            this.classList.add('active');
        });
    });
}

// ════════════════════════════════════════
//   Init
// ════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('changelog-container');
    container.innerHTML = '<div class="loading">正在加载更新日志...</div>';

    fetch('/assets/data/log.json')
        .then(response => {
            if (!response.ok) throw new Error('文件加载失败');
            return response.json();
        })
        .then(data => {
            allSections = Array.isArray(data) ? data.map(s => {
                if (s.entries) {
                    return { date: s.date, entries: s.entries };
                }
                return { title: s.title, content: s.content };
            }) : [];

            if (allSections.length === 0) {
                container.innerHTML = '<div class="loading">暂无更新内容</div>';
                return;
            }

            // Build calendar data from sections with dates
            buildCalendarData(allSections);

            // Render sidebar
            renderSidebar();

            // Render first page
            renderPage(1);
        })
        .catch(error => {
            container.innerHTML = `<div class="loading">${error.message || '无法加载更新日志'}</div>`;
            console.error('加载错误:', error);
        });
});

// 卡片点击效果（不干扰链接点击）
document.addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    const card = e.target.closest('.update-card');
    if (card) {
        card.classList.toggle('active');
    }
});

// 键盘导航支持
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
