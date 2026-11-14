// TypeFlow Pro - 智能打字测试系统（优化版）

// 全局变量
let textData = [];
let currentText = "";
let currentTextArray = [];
let currentCharIndex = 0;
let startTime = null;
let endTime = null;
let timerInterval = null;
let isTesting = false;
let isPaused = false;
let errors = [];
let typingData = [];
let keyErrors = {};
let backspaceCount = 0;
let totalCharsTyped = 0;
let correctChars = 0;
let testHistory = [];
let isComposing = false; // 中文输入法状态
let pausedAt = 0;
let pausedDuration = 0;
let completedResult = null;
let practiceMode = '随机练习';
let race = null;
let lastDrill = '';
let raceTrace = [];
let previousChars = [];
let attemptsByPosition = new Map();

// DOM元素
const textDisplay = document.getElementById('textDisplay');
const typingInput = document.getElementById('typingInput');
const textCategory = document.getElementById('textCategory');
const textLength = document.getElementById('textLength');
const timeLimit = document.getElementById('timeLimit');
const startTestBtn = document.getElementById('startTest');
const pauseTestBtn = document.getElementById('pauseTest');
const resetTestBtn = document.getElementById('resetTest');
const timerDisplay = document.getElementById('timer');
const liveWPM = document.getElementById('liveWPM');
const liveAccuracy = document.getElementById('liveAccuracy');
const liveProgress = document.getElementById('liveProgress');
const totalErrors = document.getElementById('totalErrors');
const backspaceCountDisplay = document.getElementById('backspaceCount');
const resultsModal = document.getElementById('resultsModal');
const resultWPM = document.getElementById('resultWPM');
const resultAccuracy = document.getElementById('resultAccuracy');
const resultTime = document.getElementById('resultTime');
const detailTotalChars = document.getElementById('detailTotalChars');
const detailCorrectChars = document.getElementById('detailCorrectChars');
const detailWrongChars = document.getElementById('detailWrongChars');
const detailBackspaces = document.getElementById('detailBackspaces');
const bestWPM = document.getElementById('bestWPM');
const bestAccuracy = document.getElementById('bestAccuracy');
const testsCompleted = document.getElementById('testsCompleted');
const errorPatterns = document.getElementById('errorPatterns');
const improvementTips = document.getElementById('improvementTips');
const saveResultBtn = document.getElementById('saveResult');
const newTestBtn = document.getElementById('newTest');
const shareResultBtn = document.getElementById('shareResult');
const modalClose = document.querySelector('.modal-close');
const summaryTotalChars = document.getElementById('summaryTotalChars');
const summaryTotalTime = document.getElementById('summaryTotalTime');
const summaryAvgWPM = document.getElementById('summaryAvgWPM');
const summaryAvgAccuracy = document.getElementById('summaryAvgAccuracy');

// 图表实例
let speedHeatmapChart = null;
let rhythmChart = null;

// 键盘布局用于错误分布图
const keyboardLayout = [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm']
];

// 初始化函数
async function init() {
    // 加载文本数据
    await loadTextData();

    // 设置当前年份
    document.getElementById('currentYear').textContent = new Date().getFullYear();

    // 加载历史数据
    loadTestHistory();

    // 设置事件监听器
    setupEventListeners();

    // 初始化图表
    if (typeof Chart !== 'undefined') initCharts();

    // 初始化键盘错误分布图
    initKeyboardErrorMap();

    // 填充文本类型选择
    populateTextCategories();

    // 生成随机文本
    generateRandomText();
}

// 加载文本数据
async function loadTextData() {
    try {
        const response = await fetch('/assets/pages/tool/typeflow/texts.json');
        if (!response.ok) {
            throw new Error('无法加载文本数据');
        }
        const data = await response.json();
        textData = data.textCategories;
        console.log(`已加载 ${textData.length} 种文本类型`);
    } catch (error) {
        console.error('加载文本数据时出错:', error);
        // 使用默认数据作为后备
        textData = [
            {
                id: "default",
                name: "默认文本",
                description: "示例文本",
                texts: ["这是一个打字速度测试示例文本。请在此输入您的打字内容，以测试您的打字速度和准确率。打字测试可以帮助您提高打字技能和效率。"]
            }
        ];
    }
}

// 填充文本类型选择
function populateTextCategories() {
    textCategory.innerHTML = '<option value="random">随机类型</option>';

    textData.forEach(category => {
        const option = document.createElement('option');
        option.value = category.id;
        option.textContent = `${category.name} - ${category.description}`;
        textCategory.appendChild(option);
    });
}

// 生成随机文本
function generateRandomText() {
    practiceMode = textCategory.selectedOptions[0]?.textContent || '随机练习';
    race = null;
    const categoryId = textCategory.value;
    const lengthOption = textLength.value;

    let targetLength;
    switch (lengthOption) {
        case 'short': targetLength = 100; break;
        case 'long': targetLength = 300; break;
        default: targetLength = 200; break;
    }

    let selectedCategory;

    if (categoryId === 'random') {
        // 随机选择一个类别
        selectedCategory = textData[Math.floor(Math.random() * textData.length)];
    } else {
        // 选择指定的类别
        selectedCategory = textData.find(cat => cat.id === categoryId);
        if (!selectedCategory) {
            selectedCategory = textData[0];
        }
    }

    // 从类别中随机选择一个文本
    let text = selectedCategory.texts[Math.floor(Math.random() * selectedCategory.texts.length)];

    // 如果文本太短，重复直到达到目标长度
    while (text.length < targetLength) {
        text += ' ' + selectedCategory.texts[Math.floor(Math.random() * selectedCategory.texts.length)];
    }

    setPracticeText(text.substring(0, targetLength).normalize('NFC'));
}

function setPracticeText(text) {
    currentText = text;
    currentTextArray = Array.from(text);
    prepareAttempt();
}

function prepareAttempt() {
    currentCharIndex = 0;
    errors = [];
    typingData = [];
    keyErrors = {};
    attemptsByPosition = new Map();
    raceTrace = [];
    previousChars = [];
    backspaceCount = totalCharsTyped = correctChars = 0;
    startTime = endTime = null;
    pausedAt = pausedDuration = 0;
    isComposing = false;
    typingInput.value = '';
    document.getElementById('practice-mode').textContent = practiceMode;
    displayText();
    updateLiveStats();
    updateRace();
    resetKeyboardErrorMap();
    resetCharts();
}

// 显示文本（带高亮）
function displayText() {
    const mistakes = new Set(errors.map(error => error.index));
    const nodes = currentTextArray.map((char, index) => {
        const span = document.createElement('span');
        span.className = index === currentCharIndex ? 'char-current' : index > currentCharIndex ? 'char-pending' :
            mistakes.has(index) ? 'char-wrong' : 'char-correct';
        span.textContent = char === '\n' ? '↵\n' : char;
        return span;
    });
    textDisplay.replaceChildren(...nodes);
    if (!isTesting || !nodes[currentCharIndex]) return;
    const target = nodes[currentCharIndex].getBoundingClientRect();
    const viewport = textDisplay.getBoundingClientRect();
    if (target.bottom > viewport.bottom - 12) textDisplay.scrollTop += target.bottom - viewport.bottom + 32;
    else if (target.top < viewport.top + 8) textDisplay.scrollTop += target.top - viewport.top - 18;
}

function activeTime() {
    return startTime ? (endTime?.getTime() ?? (pausedAt || Date.now())) - startTime.getTime() - pausedDuration : 0;
}

function updateRace() {
    const track = document.getElementById('race-track');
    const status = document.getElementById('race-status');
    track.hidden = status.hidden = !race;
    if (!race) return;
    const elapsed = activeTime();
    const ghost = race.trace.findLast(point => point.time <= elapsed)?.position ?? 0;
    const playerPercent = calculateProgress();
    const ghostPercent = Math.round(100 * ghost / currentTextArray.length);
    document.getElementById('race-player').style.width = playerPercent + '%';
    document.getElementById('race-ghost').style.left = ghostPercent + '%';
    status.textContent = `本次 ${playerPercent}% · 上次 ${ghostPercent}%`;
}

// 设置事件监听器
function setupEventListeners() {
    // 开始测试按钮
    startTestBtn.addEventListener('click', startTest);

    // 暂停/继续按钮
    pauseTestBtn.addEventListener('click', togglePause);

    // 重置按钮
    resetTestBtn.addEventListener('click', resetTest);

    // 文本输入事件 - 优化版
    typingInput.addEventListener('input', handleTypingOptimized);
    typingInput.addEventListener('keydown', handleKeyDown);

    typingInput.addEventListener('compositionstart', () => { isComposing = true; });
    typingInput.addEventListener('compositionend', () => {
        isComposing = false;
        handleTypingOptimized();
    });
    typingInput.addEventListener('paste', event => event.preventDefault());
    typingInput.addEventListener('drop', event => event.preventDefault());
    document.getElementById('use-custom').addEventListener('click', () => {
        const text = document.getElementById('custom-text').value.trim().normalize('NFC');
        const status = document.getElementById('custom-status');
        if (Array.from(text).length < 5) {
            status.textContent = '请至少输入 5 个字符。';
            return;
        }
        resetTest();
        practiceMode = '自定义练习';
        race = null;
        setPracticeText(text);
        status.textContent = '已载入练习区。';
    });
    document.getElementById('raceAgain').addEventListener('click', () => {
        race = completedResult;
        practiceMode = '同文竞速';
        setPracticeText(race.text);
        closeResultsModal();
        startTest();
    });
    document.getElementById('drillErrors').addEventListener('click', () => {
        race = null;
        practiceMode = '易错片段复练';
        setPracticeText(lastDrill);
        closeResultsModal();
        startTest();
    });

    // 文本类型变化
    textCategory.addEventListener('change', generateRandomText);
    textLength.addEventListener('change', generateRandomText);

    // 时间限制变化
    timeLimit.addEventListener('change', () => updateTimerDisplay());

    // 模态框相关
    modalClose.addEventListener('click', closeResultsModal);
    newTestBtn.addEventListener('click', startNewTest);
    saveResultBtn.addEventListener('click', saveTestResult);
    shareResultBtn.addEventListener('click', shareTestResult);

    // 点击模态框外部关闭
    resultsModal.addEventListener('click', (e) => {
        if (e.target === resultsModal) {
            closeResultsModal();
        }
    });

    document.addEventListener('keydown', event => {
        if (event.isComposing || isComposing) return;
        if (event.ctrlKey && event.key === 'Enter' && !resultsModal.classList.contains('active')) {
            event.preventDefault();
            if (isTesting) resetTest();
            startTest();
        }
        if (event.key === 'Escape') {
            if (resultsModal.classList.contains('active')) closeResultsModal();
            else if (isTesting) togglePause();
        }
    });
}

function handleTypingOptimized(event) {
    if (!isTesting || isPaused || isComposing || event?.isComposing) return;
    const chars = Array.from(typingInput.value.normalize('NFC')).slice(0, currentTextArray.length);
    const previous = previousChars;
    let prefix = 0;
    while (prefix < previous.length && previous[prefix] === chars[prefix]) prefix++;
    let end = chars.length, oldEnd = previous.length;
    while (end > prefix && oldEnd > prefix && chars[end - 1] === previous[oldEnd - 1]) {
        end--;
        oldEnd--;
    }
    const now = new Date();
    currentCharIndex = chars.length;
    errors = [];
    keyErrors = Object.create(null);
    correctChars = 0;
    chars.forEach((typedChar, index) => {
        const targetChar = currentTextArray[index];
        const isCorrect = typedChar === targetChar;
        if (isCorrect) correctChars++;
        else {
            errors.push({ index, typedChar, targetChar });
            const key = typedChar.toLowerCase();
            keyErrors[key] = (keyErrors[key] ?? 0) + 1;
        }
        if (index < prefix || index >= end) return;
        if (!isCorrect) attemptsByPosition.set(index, (attemptsByPosition.get(index) ?? 0) + 1);
        typingData.push({ time: now, charIndex: index, typedChar, targetChar, isCorrect });
    });
    totalCharsTyped = chars.length;
    previousChars = chars;
    if (typingData.at(-1)?.time === now) typingData.at(-1).wpm = calculateCurrentWPM();
    if (raceTrace.at(-1)?.position !== currentCharIndex) raceTrace.push({ time: activeTime(), position: currentCharIndex });
    displayText();
    updateLiveStats();
    updateRace();
    updateCharts();
    updateKeyboardErrorMap();
    if (currentCharIndex === currentTextArray.length) finishTest();
}

function handleKeyDown(event) {
    if (!isTesting || isPaused || isComposing || event.isComposing) return;
    if (event.key === 'Backspace') backspaceCountDisplay.textContent = ++backspaceCount;
}

// 计算当前WPM
function calculateCurrentWPM() {
    if (!startTime || currentCharIndex === 0) return 0;

    const minutesElapsed = activeTime() / 60000;
    const wordsTyped = correctChars / 5; // 平均每个单词5个字符

    return Math.round(wordsTyped / Math.max(minutesElapsed, 0.0167)); // 至少0.0167分钟（1秒）
}

// 计算准确率
function calculateAccuracy() {
    if (totalCharsTyped === 0) return 100;

    const accuracy = (correctChars / totalCharsTyped) * 100;
    return Math.min(100, Math.round(accuracy * 10) / 10); // 保留一位小数
}

// 计算进度
function calculateProgress() {
    return Math.min(100, Math.round(100 * currentCharIndex / (currentTextArray.length || 1)));
}

// 更新实时统计
function updateLiveStats() {
    const wpm = calculateCurrentWPM();
    const accuracy = calculateAccuracy();
    const progress = calculateProgress();

    liveWPM.textContent = wpm;
    liveAccuracy.textContent = `${accuracy}%`;
    liveProgress.textContent = `${progress}%`;
    totalErrors.textContent = errors.length;
    backspaceCountDisplay.textContent = backspaceCount;
}

// 开始测试
function startTest() {
    if (isTesting) return;

    if (!currentText) generateRandomText();
    prepareAttempt();
    startTime = new Date();
    isTesting = true;
    isPaused = false;

    // 更新UI
    typingInput.disabled = false;
    typingInput.focus();
    startTestBtn.disabled = true;
    pauseTestBtn.disabled = false;
    pauseTestBtn.innerHTML = '<i class="fas fa-pause"></i> 暂停';
    textCategory.disabled = true;
    textLength.disabled = true;
    timeLimit.disabled = true;
    document.getElementById('use-custom').disabled = true;

    // 启动计时器
    startTimer();

    // 更新实时显示
    updateLiveStats();

    // 重置图表
    resetCharts();
}

// 开始计时器
function startTimer() {
    const limit = Number(timeLimit.value);
    updateTimerDisplay(limit);
    timerInterval = setInterval(() => {
        if (isPaused) return;
        const elapsed = activeTime() / 1000;
        const seconds = limit ? Math.max(0, Math.ceil(limit - elapsed)) : Math.floor(elapsed);
        updateTimerDisplay(seconds);
        updateLiveStats();
        updateRace();
        if (limit && seconds === 0) finishTest();
    }, 100);
}

// 更新计时器显示
function updateTimerDisplay(timeLeft) {
    if (timeLeft === undefined) {
        const limit = parseInt(timeLimit.value);
        timeLeft = limit;
    }

    if (timeLeft <= 0) {
        timerDisplay.textContent = '00:00';
        return;
    }

    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    // 添加警告样式
    if (Number(timeLimit.value) && timeLeft <= 10 && !timerDisplay.classList.contains('pulse')) {
        timerDisplay.classList.add('pulse');
        setTimeout(() => {
            timerDisplay.classList.remove('pulse');
        }, 500);
    }
}

// 切换暂停状态
function togglePause() {
    if (!isTesting) return;

    isPaused = !isPaused;

    if (isPaused) {
        pausedAt = Date.now();
        pauseTestBtn.innerHTML = '<i class="fas fa-play"></i> 继续';
        typingInput.disabled = true;

        // 记录暂停时间
        typingData.push({
            time: new Date(),
            type: 'pause',
            charIndex: currentCharIndex
        });
    } else {
        pausedDuration += Date.now() - pausedAt;
        pausedAt = 0;
        pauseTestBtn.innerHTML = '<i class="fas fa-pause"></i> 暂停';
        typingInput.disabled = false;
        typingInput.focus();

        // 记录继续时间
        typingData.push({
            time: new Date(),
            type: 'resume',
            charIndex: currentCharIndex
        });
    }
}

// 重置测试
function resetTest() {
    // 清除计时器
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }

    // 重置状态
    isTesting = false;
    isPaused = false;
    isComposing = false;

    // 更新UI
    typingInput.disabled = true;
    typingInput.value = '';
    startTestBtn.disabled = false;
    pauseTestBtn.disabled = true;
    textCategory.disabled = false;
    textLength.disabled = false;
    timeLimit.disabled = false;
    document.getElementById('use-custom').disabled = false;

    // 重置计时器显示
    updateTimerDisplay();

    prepareAttempt();
}

// 完成测试
function finishTest() {
    if (!isTesting) return;

    isTesting = false;
    endTime = new Date();

    // 清除计时器
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }

    // 禁用输入
    typingInput.disabled = true;
    startTestBtn.disabled = false;
    pauseTestBtn.disabled = true;
    textCategory.disabled = false;
    textLength.disabled = false;
    timeLimit.disabled = false;
    document.getElementById('use-custom').disabled = false;

    // 计算最终结果
    const testDuration = activeTime() / 1000; // 秒
    const finalWPM = calculateCurrentWPM();
    const finalAccuracy = calculateAccuracy();

    completedResult = { text: currentText, trace: raceTrace };
    lastDrill = [...attemptsByPosition].sort((a, b) => b[1] - a[1]).slice(0, 8)
        .map(([index]) => currentTextArray.slice(Math.max(0, index - 3), index + 4).join(''))
        .filter(Boolean).join('  ');
    if (lastDrill) lastDrill = Array(3).fill(lastDrill).join('  ');
    document.getElementById('raceAgain').disabled = !raceTrace.some(point => point.position > 0);
    document.getElementById('drillErrors').disabled = !lastDrill;
    saveResultBtn.disabled = false;
    saveResultBtn.textContent = '保存结果';
    // 显示结果模态框
    showResultsModal(finalWPM, finalAccuracy, testDuration);

    // 分析错误模式
    analyzeErrorPatterns();

    // 生成改进建议
    generateImprovementTips(finalWPM, finalAccuracy);

    // 更新摘要
    updateSummaryStats();
}

// 显示结果模态框
function showResultsModal(wpm, accuracy, time) {
    resultWPM.textContent = wpm;
    resultAccuracy.textContent = `${accuracy}%`;
    resultTime.textContent = `${Math.round(time)}s`;

    detailTotalChars.textContent = totalCharsTyped;
    detailCorrectChars.textContent = correctChars;
    detailWrongChars.textContent = errors.length;
    detailBackspaces.textContent = backspaceCount;

    resultsModal.classList.add('active');
    modalClose.focus();
}

// 关闭结果模态框
function closeResultsModal() {
    resultsModal.classList.remove('active');
    startTestBtn.focus();
}

// 开始新测试
function startNewTest() {
    closeResultsModal();
    generateRandomText();
    startTest();
}

// 保存测试结果
function saveTestResult() {
    const result = {
        id: Date.now(),
        date: new Date().toISOString(),
        wpm: parseInt(resultWPM.textContent),
        accuracy: parseFloat(resultAccuracy.textContent),
        time: parseFloat(resultTime.textContent),
        totalChars: totalCharsTyped,
        correctChars: correctChars,
        errors: errors.length,
        backspaces: backspaceCount,
        textCategory: textCategory.value,
        textLength: textLength.value
    };

    testHistory.push(result);
    saveTestHistory();

    // 更新历史记录显示
    updateHistoryStats();

    // 显示成功消息
    saveResultBtn.disabled = true;
    saveResultBtn.textContent = '已保存';
}

// 分享测试结果
function shareTestResult() {
    const wpm = resultWPM.textContent;
    const accuracy = resultAccuracy.textContent;

    const text = `我在TypeFlow Pro打字测试中获得 ${wpm} WPM，准确率 ${accuracy}！`;

    if (navigator.share) {
        navigator.share({
            title: '我的打字测试结果',
            text: text,
            url: window.location.href
        });
    } else if (navigator.clipboard) {
        navigator.clipboard.writeText(text)
            .then(() => alert('结果已复制到剪贴板！'))
            .catch(err => console.error('复制失败:', err));
    } else {
        prompt('复制以下文本分享:', text);
    }
}

// 加载测试历史
function loadTestHistory() {
    const savedHistory = localStorage.getItem('typeflowTestHistory');
    if (savedHistory) {
        try {
            testHistory = JSON.parse(savedHistory);
        } catch (e) {
            console.error('解析历史数据时出错:', e);
            testHistory = [];
        }
    }

    updateHistoryStats();
}

// 保存测试历史
function saveTestHistory() {
    localStorage.setItem('typeflowTestHistory', JSON.stringify(testHistory));
}

// 更新历史统计
function updateHistoryStats() {
    if (testHistory.length === 0) {
        bestWPM.textContent = '0';
        bestAccuracy.textContent = '0%';
        testsCompleted.textContent = '0';
        return;
    }

    // 计算最佳WPM和准确率
    const bestWPMResult = testHistory.reduce((max, test) => test.wpm > max.wpm ? test : max, testHistory[0]);
    const bestAccuracyResult = testHistory.reduce((max, test) => test.accuracy > max.accuracy ? test : max, testHistory[0]);

    bestWPM.textContent = bestWPMResult.wpm;
    bestAccuracy.textContent = `${bestAccuracyResult.accuracy}%`;
    testsCompleted.textContent = testHistory.length;
}

// 更新摘要统计
function updateSummaryStats() {
    if (testHistory.length === 0) return;

    // 计算平均WPM和准确率
    const totalWPM = testHistory.reduce((sum, test) => sum + test.wpm, 0);
    const totalAccuracy = testHistory.reduce((sum, test) => sum + test.accuracy, 0);
    const totalChars = testHistory.reduce((sum, test) => sum + test.totalChars, 0);
    const totalTime = testHistory.reduce((sum, test) => sum + test.time, 0);

    const avgWPM = Math.round(totalWPM / testHistory.length);
    const avgAccuracy = Math.round((totalAccuracy / testHistory.length) * 10) / 10;

    summaryTotalChars.textContent = totalChars;
    summaryTotalTime.textContent = `${Math.round(totalTime)}s`;
    summaryAvgWPM.textContent = avgWPM;
    summaryAvgAccuracy.textContent = `${avgAccuracy}%`;
}

// 初始化图表
function initCharts() {
    // 速度热力图
    const speedHeatmapCtx = document.getElementById('speedHeatmap').getContext('2d');
    speedHeatmapChart = new Chart(speedHeatmapCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'WPM',
                data: [],
                borderColor: '#4facfe',
                backgroundColor: 'rgba(79, 172, 254, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    display: false
                },
                y: {
                    beginAtZero: true,
                    grid: {
                        color: getComputedStyle(document.body).getPropertyValue('--line').trim()
                    },
                    ticks: {
                        color: getComputedStyle(document.body).getPropertyValue('--text-subtle').trim()
                    }
                }
            }
        }
    });

    // 打字节奏图
    const rhythmChartCtx = document.getElementById('rhythmChart').getContext('2d');
    rhythmChart = new Chart(rhythmChartCtx, {
        type: 'bar',
        data: {
            labels: ['0-10', '10-20', '20-30', '30-40', '40-50', '50-60', '60+'],
            datasets: [{
                label: '字符间隔(ms)',
                data: [0, 0, 0, 0, 0, 0, 0],
                backgroundColor: [
                    'rgba(239, 68, 68, 0.7)',
                    'rgba(245, 158, 11, 0.7)',
                    'rgba(245, 158, 11, 0.7)',
                    'rgba(16, 185, 129, 0.7)',
                    'rgba(16, 185, 129, 0.7)',
                    'rgba(16, 185, 129, 0.7)',
                    'rgba(16, 185, 129, 0.7)'
                ],
                borderColor: [
                    'rgba(239, 68, 68, 1)',
                    'rgba(245, 158, 11, 1)',
                    'rgba(245, 158, 11, 1)',
                    'rgba(16, 185, 129, 1)',
                    'rgba(16, 185, 129, 1)',
                    'rgba(16, 185, 129, 1)',
                    'rgba(16, 185, 129, 1)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    grid: {
                        color: getComputedStyle(document.body).getPropertyValue('--line').trim()
                    },
                    ticks: {
                        color: getComputedStyle(document.body).getPropertyValue('--text-subtle').trim()
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: {
                        color: getComputedStyle(document.body).getPropertyValue('--line').trim()
                    },
                    ticks: {
                        color: getComputedStyle(document.body).getPropertyValue('--text-subtle').trim()
                    }
                }
            }
        }
    });
}

// 重置图表
function resetCharts() {
    if (speedHeatmapChart) {
        speedHeatmapChart.data.labels = [];
        speedHeatmapChart.data.datasets[0].data = [];
        speedHeatmapChart.update();
    }

    if (rhythmChart) {
        rhythmChart.data.datasets[0].data = [0, 0, 0, 0, 0, 0, 0];
        rhythmChart.update();
    }
}

// 更新图表
function updateCharts() {
    if (!speedHeatmapChart || !rhythmChart) return;

    // 更新速度热力图
    const wpmDataPoints = typingData
        .filter(point => point.wpm !== undefined)
        .slice(-20); // 只显示最近的20个点

    if (wpmDataPoints.length > 0) {
        const labels = wpmDataPoints.map((_, i) => i + 1);
        const data = wpmDataPoints.map(point => point.wpm);

        speedHeatmapChart.data.labels = labels;
        speedHeatmapChart.data.datasets[0].data = data;
        speedHeatmapChart.update();
    }

    // 更新打字节奏图
    if (typingData.length > 1) {
        // 计算字符间隔时间
        const intervals = [];
        for (let i = 1; i < typingData.length; i++) {
            if (typingData[i].time && typingData[i - 1].time) {
                const interval = typingData[i].time - typingData[i - 1].time;
                if (interval > 0 && !typingData[i].type && !typingData[i - 1].type) intervals.push(interval);
            }
        }

        // 分组统计
        const intervalRanges = [0, 10, 20, 30, 40, 50, 60];
        const counts = new Array(intervalRanges.length).fill(0);

        intervals.forEach(interval => {
            for (let i = 0; i < intervalRanges.length; i++) {
                if (i === intervalRanges.length - 1) {
                    // 最后一个区间（60ms以上）
                    counts[i]++;
                    break;
                } else if (interval >= intervalRanges[i] && interval < intervalRanges[i + 1]) {
                    counts[i]++;
                    break;
                }
            }
        });

        rhythmChart.data.datasets[0].data = counts;
        rhythmChart.update();
    }
}

// 初始化键盘错误分布图
function initKeyboardErrorMap() {
    const keyboardErrorMap = document.querySelector('.keyboard-error-map');
    keyboardErrorMap.innerHTML = '';

    keyboardLayout.forEach(row => {
        const rowElement = document.createElement('div');
        rowElement.className = 'keyboard-row';

        row.forEach(key => {
            const keyElement = document.createElement('div');
            keyElement.className = 'key';
            keyElement.textContent = key;
            keyElement.dataset.key = key;
            rowElement.appendChild(keyElement);
        });

        keyboardErrorMap.appendChild(rowElement);
    });

    // 添加空格键行
    const spaceRow = document.createElement('div');
    spaceRow.className = 'keyboard-row';

    const spaceKey = document.createElement('div');
    spaceKey.className = 'key key-space';
    spaceKey.textContent = '空格';
    spaceKey.dataset.key = ' ';
    spaceRow.appendChild(spaceKey);

    keyboardErrorMap.appendChild(spaceRow);
}

// 重置键盘错误分布图
function resetKeyboardErrorMap() {
    const keys = document.querySelectorAll('.key');
    keys.forEach(key => {
        key.classList.remove('key-error-low', 'key-error-medium', 'key-error-high', 'key-error-very-high');
        key.classList.add('key-error-none');
    });
}

// 更新键盘错误分布图
function updateKeyboardErrorMap() {
    // 重置所有键
    resetKeyboardErrorMap();

    // 更新有错误的键
    Object.keys(keyErrors).forEach(key => {
        const errorCount = keyErrors[key];
        const keyElement = document.querySelector(`.key[data-key="${key}"]`);

        if (keyElement) {
            keyElement.classList.remove('key-error-none');

            if (errorCount === 1) {
                keyElement.classList.add('key-error-low');
            } else if (errorCount <= 3) {
                keyElement.classList.add('key-error-medium');
            } else if (errorCount <= 5) {
                keyElement.classList.add('key-error-high');
            } else {
                keyElement.classList.add('key-error-very-high');
            }
        }
    });
}

// 分析错误模式
function analyzeErrorPatterns() {
    const patterns = {};

    // 分析常见错误组合
    errors.forEach(error => {
        const targetChar = error.targetChar.toLowerCase();
        const typedChar = error.typedChar.toLowerCase();

        // 只分析字母和数字
        if (/[a-z0-9]/.test(targetChar) && /[a-z0-9]/.test(typedChar)) {
            const pattern = `${targetChar}→${typedChar}`;

            if (patterns[pattern]) {
                patterns[pattern]++;
            } else {
                patterns[pattern] = 1;
            }
        }
    });

    // 转换为数组并排序
    const patternArray = Object.keys(patterns).map(pattern => ({
        pattern,
        count: patterns[pattern]
    })).sort((a, b) => b.count - a.count).slice(0, 5); // 取前5个

    // 显示错误模式
    displayErrorPatterns(patternArray);
}

// 显示错误模式
function displayErrorPatterns(patterns) {
    if (patterns.length === 0) {
        errorPatterns.innerHTML = '<p class="empty-state">本次测试未发现常见错误模式</p>';
        return;
    }

    let html = '';
    patterns.forEach(item => {
        const [targetChar, typedChar] = item.pattern.split('→');
        html += `
            <div class="pattern-item">
                <span class="pattern-key">${targetChar}</span> 经常误输入为 
                <span class="pattern-key">${typedChar}</span>
                <span class="pattern-count">${item.count}次</span>
            </div>
        `;
    });

    errorPatterns.innerHTML = html;
}

// 生成改进建议
function generateImprovementTips(wpm, accuracy) {
    const tips = [];

    // 基于WPM的建议
    if (wpm < 30) {
        tips.push("您的打字速度较慢，建议从基础键位练习开始，熟悉每个手指的负责区域。");
    } else if (wpm < 50) {
        tips.push("您的打字速度处于中等水平，可以通过练习减少错误率来进一步提高速度。");
    } else if (wpm < 80) {
        tips.push("您的打字速度良好，可以尝试更复杂的文本类型来挑战自己。");
    } else {
        tips.push("您的打字速度非常优秀！可以尝试编程代码或学术论文等专业文本类型。");
    }

    // 基于准确率的建议
    if (accuracy < 85) {
        tips.push("准确率有待提高，建议放慢速度优先保证正确率，熟练后再提升速度。");
    } else if (accuracy < 95) {
        tips.push("准确率良好，但仍有提升空间。注意容易出错的键位，进行针对性练习。");
    } else {
        tips.push("准确率非常出色！保持这个水平的同时尝试进一步提升速度。");
    }

    // 基于错误模式的建议
    if (backspaceCount > totalCharsTyped * 0.1) {
        tips.push("您使用了较多退格键，建议在输入前多思考，减少修改次数。");
    }

    // 基于打字节奏的建议
    if (typingData.length > 10) {
        const intervals = [];
        for (let i = 1; i < typingData.length; i++) {
            if (typingData[i].time && typingData[i - 1].time) {
                intervals.push(typingData[i].time - typingData[i - 1].time);
            }
        }

        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        if (avgInterval > 500) {
            tips.push("您的打字节奏较慢且有停顿，建议练习保持连贯的打字节奏。");
        } else if (avgInterval < 100) {
            tips.push("您的打字节奏很快，但要注意保持准确率，避免因过快导致错误增加。");
        }
    }

    // 显示改进建议
    displayImprovementTips(tips);
}

// 显示改进建议
function displayImprovementTips(tips) {
    if (tips.length === 0) {
        tips.push("继续练习，保持良好习惯！");
    }

    let html = '';
    tips.forEach((tip, index) => {
        html += `
            <div class="tip-item">
                <i class="fas fa-lightbulb"></i> ${tip}
            </div>
        `;
    });

    improvementTips.innerHTML = html;
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);