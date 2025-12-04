/**
 * 夸克博客 OJ 题目列表页逻辑 (Problem List Page)
 * 依赖于 ./utils.js (utils.js 必须先加载)
 */

const PROBLEM_INDEX_URL = 'problems/index.json';
const $problemListTableBody = document.getElementById('oj-problem-list-body');
const $searchQueryDisplay = document.getElementById('search-query-display');
// 🏆 新增：分页控件 DOM 元素
const $paginationControls = document.getElementById('oj-pagination');
const $pageSelector = document.getElementById('oj-page-selector');

// 🏆 全局变量：存储所有题目（过滤后的）
let filteredProblems = [];
// 🏆 默认分页设置
const DEFAULT_PAGE_SIZE = 30;

/**
 * 1. 从 URL 获取当前页码和每页显示数量
 * 依赖 utils.js 中的 getUrlParam 函数
 * @returns {{page: number, size: number}}
 */
function getPaginationParams() {
    // URL 中 page 从 1 开始，但 getUrlParam 返回的是字符串
    const page = parseInt(getUrlParam('page') || '1', 10);
    const size = parseInt(getUrlParam('size') || String(DEFAULT_PAGE_SIZE), 10);
    return {
        page: Math.max(1, page), // 确保页码最小为 1
        size: Math.max(1, size) // 确保数量最小为 1
    };
}

/**
 * 2. 渲染题目列表 (更新为带分页功能)
 */
async function renderProblemList() {
    let allProblems = await fetchProblemIndex();

    if (typeof getProblemStatus === 'undefined' || typeof getSearchQueryFromUrl === 'undefined' || typeof getUrlParam === 'undefined') {
        if ($problemListTableBody) {
            $problemListTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">本地存储或 URL 工具未加载。</td></tr>`;
        }
        return;
    }

    // A. 处理搜索逻辑
    const searchQuery = getSearchQueryFromUrl();
    if (searchQuery) {
        const query = searchQuery.toLowerCase();

        if ($searchQueryDisplay) {
            $searchQueryDisplay.textContent = `(搜索: "${searchQuery}")`;
        }

        // 过滤题目列表：匹配 ID 或 Title
        filteredProblems = allProblems.filter(problem =>
            String(problem.id).includes(query) ||
            problem.title.toLowerCase().includes(query)
        );
    } else {
        filteredProblems = allProblems;
    }

    // B. 处理分页逻辑
    const { page, size } = getPaginationParams();
    const totalProblems = filteredProblems.length;
    const totalPages = Math.ceil(totalProblems / size);

    // 计算当前页的起始和结束索引
    const startIndex = (page - 1) * size;
    const endIndex = Math.min(startIndex + size, totalProblems);
    const problemsForPage = filteredProblems.slice(startIndex, endIndex);

    // C. 渲染题目表格
    let html = '';
    problemsForPage.forEach(problem => {
        const status = getProblemStatus(problem.id);

        let statusClass = 'oj-status-badge-unattempted';
        if (status === 'AC') statusClass = 'oj-status-badge-ac';
        else if (status === 'WA') statusClass = 'oj-status-badge-wa';
        else if (status !== '未尝试') statusClass = 'oj-status-badge-error';

        html += `
            <tr class="oj-list-row">
                <td><span class="oj-status-badge ${statusClass}">${status}</span></td>
                <td><a href="index.html?p=${problem.id}" class="oj-problem-link">${problem.id}</a></td>
                <td><a href="index.html?p=${problem.id}" class="oj-problem-link">${problem.title}</a></td>
                <td class="oj-difficulty-${problem.difficulty}">${problem.difficulty}</td>
            </tr>
        `;
    });

    if ($problemListTableBody) {
        if (problemsForPage.length === 0) {
            html = `<tr><td colspan="4" style="text-align:center;">${searchQuery ? '没有找到匹配的题目。' : '当前页没有题目。'}</td></tr>`;
        }
        $problemListTableBody.innerHTML = html;
    }

    // D. 渲染分页控件
    renderPaginationControls(page, totalPages, totalProblems);
}

/**
 * 3. 渲染分页控件
 * @param {number} currentPage 当前页码
 * @param {number} totalPages 总页数
 * @param {number} totalProblems 总题目数
 */
function renderPaginationControls(currentPage, totalPages, totalProblems) {
    if (!$pageSelector) return;

    if (totalProblems <= DEFAULT_PAGE_SIZE && !getSearchQueryFromUrl()) {
        // 如果题目总数小于默认数量，且没有搜索，则隐藏分页控件
        $paginationControls.style.display = 'none';
        return;
    }

    $paginationControls.style.display = 'flex';
    let pageHtml = '';

    // 上一页按钮
    pageHtml += `<button onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>上一页</button>`;

    // 中间页码（简化展示，只显示当前页周围的页码）
    const maxPagesToShow = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

    if (endPage - startPage + 1 < maxPagesToShow) {
        startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }

    if (startPage > 1) {
        pageHtml += `<button onclick="changePage(1)">1</button>`;
        if (startPage > 2) pageHtml += `<span>...</span>`;
    }

    for (let i = startPage; i <= endPage; i++) {
        const activeClass = i === currentPage ? 'active-page' : '';
        pageHtml += `<button class="${activeClass}" onclick="changePage(${i})">${i}</button>`;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) pageHtml += `<span>...</span>`;
        pageHtml += `<button onclick="changePage(${totalPages})">${totalPages}</button>`;
    }

    // 下一页按钮
    pageHtml += `<button onclick="changePage(${currentPage + 1})" ${currentPage === totalPages || totalProblems === 0 ? 'disabled' : ''}>下一页</button>`;

    $pageSelector.innerHTML = pageHtml;
}

// 🏆 暴露到全局，供 HTML 中的按钮调用

/**
 * 4. 页面跳转函数
 * @param {number} newPage 要跳转到的页码
 */
function changePage(newPage) {
    const url = new URL(window.location.href);
    const { size } = getPaginationParams();
    const totalPages = Math.ceil(filteredProblems.length / size);

    if (newPage >= 1 && newPage <= totalPages) {
        url.searchParams.set('page', newPage);
        window.location.href = url.toString();
    }
}

/**
 * 5. 改变每页显示数量
 * @param {string} newSizeStr 新的每页数量
 */
function changePageSize(newSizeStr) {
    const newSize = parseInt(newSizeStr, 10);
    const url = new URL(window.location.href);

    // 改变数量时，重置到第一页
    url.searchParams.set('size', newSize);
    url.searchParams.set('page', '1');

    window.location.href = url.toString();
}

// 供 HTML 访问的全局函数
window.changePage = changePage;
window.changePageSize = changePageSize;


/**
 * 6. 获取所有题目列表 (原函数，未修改)
 */
async function fetchProblemIndex() {
    try {
        const response = await fetch(PROBLEM_INDEX_URL);
        if (!response.ok) {
            throw new Error(`无法加载题目索引文件 ${PROBLEM_INDEX_URL}`);
        }
        return await response.json();
    } catch (error) {
        console.error("获取题目索引失败:", error);
        if ($problemListTableBody) {
            $problemListTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: #f44336;">加载题目列表失败: ${error.message}</td></tr>`;
        }
        return [];
    }
}


// --- 初始化 ---
document.addEventListener('DOMContentLoaded', () => {
    // 确保搜索框如果有值，在页面加载时回显
    const searchQuery = getSearchQueryFromUrl();
    const $searchInput = document.getElementById('oj-search-input');
    if ($searchInput && searchQuery) {
        $searchInput.value = searchQuery;
    }

    // 🏆 确保每页数量选择框回显
    const { size } = getPaginationParams();
    const $pageSizeSelect = document.getElementById('page-size-select');
    if ($pageSizeSelect) {
        $pageSizeSelect.value = String(size);
    }

    renderProblemList();
});