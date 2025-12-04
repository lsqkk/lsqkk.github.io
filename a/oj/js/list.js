/**
 * 夸克博客 OJ 题目列表页逻辑 (Problem List Page)
 * 依赖于 ./utils.js (utils.js 必须先加载)
 */

const PROBLEM_INDEX_URL = 'problems/index.json';
const $problemListTableBody = document.getElementById('oj-problem-list-body');
// 🏆 新增：获取搜索查询提示的 DOM 元素
const $searchQueryDisplay = document.getElementById('search-query-display');

/**
 * 1. 获取所有题目列表
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

/**
 * 2. 渲染题目列表
 */
async function renderProblemList() {
    let problems = await fetchProblemIndex();

    // 检查 utils.js 是否加载
    if (typeof getProblemStatus === 'undefined' || typeof getSearchQueryFromUrl === 'undefined') {
        if ($problemListTableBody) {
            $problemListTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">本地存储工具未加载。</td></tr>`;
        }
        return;
    }

    // 🏆 核心修改：处理搜索逻辑
    const searchQuery = getSearchQueryFromUrl();
    if (searchQuery) {
        const query = searchQuery.toLowerCase();

        // 更新页面标题以显示搜索查询
        if ($searchQueryDisplay) {
            $searchQueryDisplay.textContent = `(搜索: "${searchQuery}")`;
        }

        // 过滤题目列表：匹配 ID 或 Title
        problems = problems.filter(problem =>
            String(problem.id).includes(query) ||
            problem.title.toLowerCase().includes(query)
        );
    }
    // ------------------------------------

    let html = '';
    problems.forEach(problem => {
        const status = getProblemStatus(problem.id);

        // 根据状态设置徽章样式
        let statusClass = 'oj-status-badge-unattempted';
        if (status === 'AC') statusClass = 'oj-status-badge-ac';
        else if (status === 'WA') statusClass = 'oj-status-badge-wa';
        else if (status !== '未尝试') statusClass = 'oj-status-badge-error'; // 其他错误状态

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
        if (problems.length === 0) {
            // 🏆 搜索无结果时的提示
            html = `<tr><td colspan="4" style="text-align:center;">没有找到匹配的题目。</td></tr>`;
        }
        $problemListTableBody.innerHTML = html;
    }
}

// --- 初始化 ---
document.addEventListener('DOMContentLoaded', () => {
    // 🏆 确保搜索框如果有值，在页面加载时回显
    const searchQuery = getSearchQueryFromUrl();
    const $searchInput = document.getElementById('oj-search-input');
    if ($searchInput && searchQuery) {
        $searchInput.value = searchQuery;
    }

    renderProblemList();
});