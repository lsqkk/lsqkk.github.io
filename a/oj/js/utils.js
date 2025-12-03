/**
 * 封装的工具函数：处理本地存储和 URL 参数
 */

// 提交记录的 localStorage 键
const STORAGE_KEY = 'quark_oj_submissions';

/**
 * 从 URL 获取题目 ID 参数
 * @returns {number|null} 题目 ID
 */
function getProblemIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const p = params.get('p');
    if (p && !isNaN(parseInt(p))) {
        return parseInt(p);
    }
    return null;
}

/**
 * 从本地存储获取所有提交记录
 * @returns {Object} 提交记录对象
 */
function getSubmissions() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : {};
    } catch (e) {
        console.error("读取本地存储失败:", e);
        return {};
    }
}

/**
 * 获取特定题目的最新状态
 * @param {number} problemId
 * @returns {string} 状态字符串 (AC, WA, TLE, etc.) 或 '未尝试'
 */
function getProblemStatus(problemId) {
    const submissions = getSubmissions();
    const record = submissions[problemId];
    return record ? record.status : '未尝试';
}

// js/utils.js (更新后的 saveSubmission 函数)

// ... (省略前面的常量和函数) ...

/**
 * 保存一次成功的判题记录（AC/WA/TLE等）
 * @param {number} problemId
 * @param {number} statusId - Judge0 返回的状态 ID
 * @param {string} time - 运行时间
 * @param {number} memory - 内存占用
 * @param {string} code - 提交的源代码 (新增)
 * @param {string} languageId - 提交的语言ID (新增)
 */
function saveSubmission(problemId, statusId, time, memory, code, languageId) {
    const submissions = getSubmissions();
    let statusText = '未知';

    const STATUS_MAP = {
        3: 'AC', 4: 'WA', 5: 'TLE', 6: 'CE', 7: 'RTE', 10: 'SYS_ERR'
    };

    statusText = STATUS_MAP[statusId] || 'WA';

    // 只有当状态为 AC 时，或者当前记录是未尝试或非 AC 时，才更新记录
    if (statusText === 'AC' || !submissions[problemId] || submissions[problemId].status !== 'AC') {
        submissions[problemId] = {
            status: statusText,
            time: time,
            memory: memory,
            timestamp: Date.now(),
            code: code, // <-- 新增
            languageId: languageId // <-- 新增
        };
    } else if (statusText !== 'AC') {
        // 对于非 AC 状态，也记录最新的提交代码
        submissions[problemId] = {
            status: statusText,
            time: time,
            memory: memory,
            timestamp: Date.now(),
            code: code, // <-- 新增
            languageId: languageId // <-- 新增
        };
    }

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(submissions));
    } catch (e) {
        console.error("保存本地存储失败:", e);
    }
}