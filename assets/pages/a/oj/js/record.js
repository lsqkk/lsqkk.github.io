/**
 * 夸克博客 OJ 提交记录页逻辑 (Submission Record Page)
 * 依赖于 ./js/utils.js
 */

const $submissionListTableBody = document.getElementById('oj-submission-list-body');
// --- Modal DOM 引用 ---
const $codeModal = document.getElementById('code-modal');
const $modalCloseBtn = document.getElementById('code-modal-close');
const $modalTitle = document.getElementById('modal-title');
const $modalLangInfo = document.getElementById('modal-lang-info');
const $modalCodeDisplay = document.getElementById('modal-code-display');


/**
 * 映射 Judge0 语言 ID 到名称
 */
function getLanguageName(id) {
    const map = {
        '54': 'C++ (GCC 9.2.0)',
        '71': 'Python 3',
        '62': 'Java (OpenJDK 13.0.1)'
        // 如果您使用了其他语言ID，请在此处添加映射
    };
    return map[id] || `ID: ${id}`;
}

/**
 * 将时间戳格式化为可读的日期时间字符串
 */
function formatTimestamp(timestamp) {
    if (!timestamp) return '未知时间';
    const date = new Date(timestamp);
    return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

/**
 * 处理查看代码按钮点击事件
 */
function handleViewCode(event) {
    const button = event.currentTarget;
    const problemId = button.getAttribute('data-id');

    // 从本地存储获取该题的记录
    const submissions = getSubmissions();
    const record = submissions[problemId];

    if (!record || !record.code) {
        alert("该记录没有存储代码数据。");
        return;
    }

    const langName = getLanguageName(record.languageId);

    $modalTitle.textContent = `题目 ${problemId} - 提交代码`;
    $modalLangInfo.textContent = `使用语言: ${langName}`;
    $modalCodeDisplay.textContent = record.code; // 直接使用存储的原始代码

    $codeModal.style.display = 'block';
}

/**
 * 渲染提交记录列表
 */
function renderSubmissionRecords() {
    if (typeof getSubmissions === 'undefined' || !$submissionListTableBody) return;

    const submissions = getSubmissions();
    const problemIds = Object.keys(submissions);

    if (problemIds.length === 0) {
        $submissionListTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;">暂无提交记录。请尝试在题目页提交代码。</td></tr>`;
        return;
    }

    const statusMap = {
        'AC': 'oj-status-badge-ac', 'WA': 'oj-status-badge-wa', 'TLE': 'oj-status-badge-error',
        'CE': 'oj-status-badge-error', 'RTE': 'oj-status-badge-error', 'SYS_ERR': 'oj-status-badge-error'
    };

    let html = '';

    problemIds.forEach(id => {
        const record = submissions[id];
        const statusClass = statusMap[record.status] || 'oj-status-badge-error';
        const time = record.time ? `${record.time} s` : '--';
        const memory = record.memory ? `${record.memory.toFixed(2)} KB` : '--';

        // 操作按钮：跳转到题目 + 查看代码按钮
        html += `
            <tr class="oj-list-row">
                <td><a href="train.html?p=${id}" class="oj-problem-link">${id}</a></td>
                <td><span class="oj-status-badge ${statusClass}">${record.status}</span></td>
                <td>${time}</td>
                <td>${memory}</td>
                <td>${formatTimestamp(record.timestamp)}</td>
                <td>
                    <button class="oj-view-code-btn" data-id="${id}">查看代码</button>
                </td>
            </tr>
        `;
    });

    $submissionListTableBody.innerHTML = html;

    // 绑定查看代码按钮事件
    document.querySelectorAll('.oj-view-code-btn').forEach(button => {
        button.addEventListener('click', handleViewCode);
    });
}

/**
 * 初始化模态框关闭事件
 */
function initializeModal() {
    if ($modalCloseBtn && $codeModal) {
        $modalCloseBtn.onclick = function () {
            $codeModal.style.display = "none";
        }

        // 点击外部区域关闭
        window.onclick = function (event) {
            if (event.target == $codeModal) {
                $codeModal.style.display = "none";
            }
        }
    }
}


// --- 初始化 ---
document.addEventListener('DOMContentLoaded', () => {
    renderSubmissionRecords();
    initializeModal();
});