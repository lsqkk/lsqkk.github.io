/**
 * 夸克博客 OJ 题目详情页逻辑 (Problem Detail Page)
 * 依赖于 Judge0 API 和 ./utils.js (utils.js 必须先加载)
 */

const JUDGE0_API_URL = 'https://ce.judge0.com/submissions';
const DEFAULT_PROBLEM_ID = 1001; // 默认题目 ID

// --- DOM 元素引用 ---
const $title = document.getElementById('problem-title');
const $timeLimit = document.getElementById('time-limit');
const $memoryLimit = document.getElementById('memory-limit');
const $description = document.getElementById('problem-description');
const $inputFormat = document.getElementById('problem-input-format');
const $outputFormat = document.getElementById('problem-output-format');
const $sampleInput = document.getElementById('sample-input');
const $sampleOutput = document.getElementById('sample-output');
const $languageSelect = document.getElementById('language-select');
const $submitBtn = document.getElementById('submit-button');
const $resultPanel = document.getElementById('result-panel');
const $resultStatus = document.getElementById('result-status');
const $resultTime = document.getElementById('result-time');
const $resultMemory = document.getElementById('result-memory');
const $resultOutput = document.getElementById('result-output');
const $resultError = document.getElementById('result-error');

let problemData = null; // 存储加载的题目数据

/**
 * 规范化样例文本中的转义换行符
 * @param {string} text
 * @returns {string}
 */
function normalizeSampleText(text) {
    if (typeof text !== 'string') return '';
    return text.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\\r/g, '\r');
}

/**
 * 渲染 Markdown 内容并启用 LaTeX 渲染
 * @param {string} markdownText - Markdown 文本
 * @param {HTMLElement} element - 要渲染到的元素
 */
function renderMarkdownWithLatex(markdownText, element) {
    if (!markdownText || !element) return;

    // 1. 使用 marked 渲染 Markdown 为 HTML
    let html = marked.parse(markdownText);

    // 2. 将 HTML 设置到元素中
    element.innerHTML = html;

    // 3. 使用 KaTeX 渲染数学公式
    if (window.renderMathInElement) {
        renderMathInElement(element, {
            // 指定分隔符
            delimiters: [
                { left: '$$', right: '$$', display: true },
                { left: '$', right: '$', display: false },
                { left: '\\(', right: '\\)', display: false },
                { left: '\\[', right: '\\]', display: true }
            ],
            // 忽略某些元素内的公式
            ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
            // 出错时不抛出异常
            throwOnError: false,
            // 不显示错误信息
            errorColor: '#cc0000'
        });
    } else {
        console.warn('KaTeX auto-render 未加载');
    }
}

/**
 * 1. 加载题目数据
 */
async function loadProblemData(id) {
    try {
        const response = await fetch(`/assets/pages/a/oj/problems/${id}.json`);

        if (!response.ok) {
            // 增强错误信息，提示文件路径
            throw new Error(`题目文件加载失败 (Status: ${response.status})。请检查路径: /assets/pages/a/oj/problems/${id}.json`);
        }
        problemData = await response.json();
        renderProblemUI(problemData);
    } catch (error) {
        console.error("加载题目失败:", error);

        // 🏆 修正区域：让错误信息在页面上更加突出，避免用户误认为“没有报错”
        const errorMessage = `❌ 错误：题目加载失败。详细信息：${error.message}`;
        if ($title) {
            $title.innerHTML = `<span style="color: #d32f2f;">${errorMessage}</span>`;

            // 清空其他区域
            if ($timeLimit) $timeLimit.textContent = '---';
            if ($memoryLimit) $memoryLimit.textContent = '---';
            if ($description) $description.innerHTML = '<p>请检查控制台(F12)和文件路径是否正确。</p>';
        }
        // ----------------------------------------------------
    }
}

/**
 * 2. 渲染题目内容到 UI
 */
function renderProblemUI(data) {
    if (!$title) return;

    $title.textContent = `${data.id}. ${data.title}`;
    $timeLimit.textContent = data.time_limit;
    $memoryLimit.textContent = data.memory_limit;

    // 使用 Markdown + LaTeX 渲染
    renderMarkdownWithLatex(data.description, $description);
    renderMarkdownWithLatex(data.input_format, $inputFormat);
    renderMarkdownWithLatex(data.output_format, $outputFormat);

    // 示例输入输出保持原样（代码块）
    $sampleInput.textContent = normalizeSampleText(data.sample_input);
    $sampleOutput.textContent = normalizeSampleText(data.sample_output);

    const currentLink = document.querySelector(`.oj-nav-link[href="train.html"]`);
    if (currentLink) {
        currentLink.href = `train.html?p=${data.id}`;
    }
}

/**
 * 3. 提交代码到 Judge0 API
 */
async function submitCode(code, languageId, stdin) {
    const payload = {
        source_code: code,
        language_id: languageId,
        stdin: stdin,
        base64_encoded: false,
    };

    try {
        const response = await fetch(JUDGE0_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Judge0 API 提交失败: ${response.statusText}`);
        }

        const data = await response.json();
        return data.token;
    } catch (error) {
        console.error('提交代码到 API 失败:', error);
        $resultStatus.textContent = `系统错误: ${error.message}`;
        return null;
    }
}

/**
 * 4. 轮询获取判题结果
 */
function getResult(token) {
    return new Promise((resolve, reject) => {
        const url = `${JUDGE0_API_URL}/${token}?base64_encoded=false&fields=status_id,stdout,stderr,compile_output,time,memory`;

        const intervalId = setInterval(async () => {
            try {
                const response = await fetch(url);
                const data = await response.json();

                if (data.status_id >= 3) {
                    clearInterval(intervalId);
                    resolve(data);
                } else {
                    $resultStatus.textContent = data.status_id === 1 ? '判题中 (In Queue)...' : '判题中 (Processing)...';
                }
            } catch (error) {
                clearInterval(intervalId);
                reject(error);
            }
        }, 1000);
    });
}

/**
 * 5. 核心判题和结果展示流程
 */
async function handleSubmission() {
    if (!problemData) return;

    $submitBtn.disabled = true;
    $resultPanel.style.display = 'block';
    $resultStatus.textContent = '正在提交...';

    // 🏆 使用 train.html 中创建的全局变量 'editor'
    if (typeof editor === 'undefined' || !editor || !editor.getValue) {
        $resultStatus.innerHTML = `<span style="color: #F44336; font-size: 1.2em;">错误：代码编辑器未准备好。请检查 train.html 脚本。</span>`;
        $submitBtn.disabled = false;
        return;
    }
    const code = editor.getValue();
    // ----------------------------------------------------

    const languageId = $languageSelect.value;

    let finalStatusId = 3;
    let finalResult = null;
    let totalTime = 0;
    let maxMemory = 0;

    // 确保 problemData.hidden_tests 存在
    if (!problemData.hidden_tests || problemData.hidden_tests.length === 0) {
        $resultStatus.innerHTML = `<span style="color: #F44336; font-size: 1.2em;">错误：题目缺少测试用例数据。</span>`;
        $submitBtn.disabled = false;
        return;
    }


    for (const [index, testCase] of problemData.hidden_tests.entries()) {
        $resultStatus.textContent = `正在测试用例 ${index + 1}/${problemData.hidden_tests.length}...`;

        // 提交代码并获取 token
        const token = await submitCode(code, languageId, testCase.input);
        if (!token) { finalStatusId = 10; break; }

        // 轮询获取结果
        const result = await getResult(token);

        totalTime += result.time ? parseFloat(result.time) : 0;
        maxMemory = Math.max(maxMemory, result.memory ? parseFloat(result.memory) : 0);

        // 检查非 AC 状态
        if (result.status_id !== 3) {
            finalStatusId = result.status_id;
            finalResult = result;
            break;
        }

        // 检查 Wrong Answer (WA)
        const actualOutput = result.stdout ? result.stdout.trim() : '';
        const expectedOutput = testCase.expected_output.trim();

        if (actualOutput !== expectedOutput) {
            finalStatusId = 4;
            finalResult = {
                ...result,
                stdout: `预期输出:\n${expectedOutput}\n\n实际输出:\n${actualOutput}`
            };
            break;
        }
        finalResult = result;
    }

    renderFinalResult(finalStatusId, finalResult, totalTime.toFixed(3), maxMemory);

    // 使用 utils.js 保存提交记录
    if (typeof saveSubmission !== 'undefined' && problemData) {
        saveSubmission(
            problemData.id,
            finalStatusId,
            totalTime.toFixed(3),
            maxMemory,
            code,             // <-- 传入源代码
            languageId        // <-- 传入语言ID
        );
    }

    $submitBtn.disabled = false;
}

/**
 * 6. 渲染最终结果
 */
function renderFinalResult(statusId, result, time, memory) {
    const STATUS_MAP = {
        3: 'Accepted (AC)', 4: 'Wrong Answer (WA)', 5: 'Time Limit Exceeded (TLE)',
        6: 'Compilation Error (CE)', 7: 'Runtime Error (RTE)', 10: 'System Error (请检查 API)'
    };

    const statusText = STATUS_MAP[statusId] || '未知错误';
    const statusColor = statusId === 3 ? '#4CAF50' : (statusId === 4 ? '#FF9800' : '#F44336');
    $resultStatus.innerHTML = `<span style="color: ${statusColor}; font-size: 1.2em;">${statusText}</span>`;

    $resultTime.textContent = statusId === 3 ? `${time} s (Total)` : (result.time ? `${result.time} s` : '--');
    $resultMemory.textContent = statusId === 3 ? `${memory.toFixed(2)} KB (Max)` : (result.memory ? `${result.memory} KB` : '--');

    if (result && (result.compile_output || result.stderr)) {
        $resultError.textContent = result.compile_output || result.stderr;
        $resultError.style.display = 'block';
    } else {
        $resultError.style.display = 'none';
        $resultError.textContent = '';
    }

    if (result && result.stdout && statusId !== 6) {
        $resultOutput.textContent = result.stdout;
        $resultOutput.style.display = 'block';
    } else {
        $resultOutput.style.display = 'none';
        $resultOutput.textContent = '';
    }
}


// --- 页面初始化入口 ---
function initializeProblemPage() {
    if (typeof getProblemIdFromUrl === 'undefined') {
        console.error("错误: utils.js (getProblemIdFromUrl) 未加载。");
        return;
    }

    const problemId = getProblemIdFromUrl() || DEFAULT_PROBLEM_ID;

    // 确保 DEFAULT_PROBLEM_ID 1001 也有对应的文件
    loadProblemData(problemId);

    if ($submitBtn) {
        $submitBtn.addEventListener('click', handleSubmission);
    }
}
