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
let pendingInput = ""; // 待处理的输入
let lastInputTime = 0; // 上次输入时间

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
    initCharts();

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
        const response = await fetch('texts.json');
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

    // 截取到目标长度
    currentText = text.substring(0, targetLength);
    currentTextArray = currentText.split('');
    currentCharIndex = 0;

    // 重置错误和打字数据
    errors = [];
    typingData = [];
    keyErrors = {};
    backspaceCount = 0;
    totalCharsTyped = 0;
    correctChars = 0;
    pendingInput = "";
    isComposing = false;

    // 显示文本
    displayText();

    // 更新键盘错误分布图
    resetKeyboardErrorMap();

    // 重置实时显示
    updateLiveStats();

    // 清空输入框
    typingInput.value = '';
}

// 显示文本（带高亮）
function displayText() {
    let html = '';

    for (let i = 0; i < currentTextArray.length; i++) {
        let charClass = 'char-pending';

        if (i < currentCharIndex) {
            // 已输入的字符
            const isError = errors.some(error => error.index === i);
            charClass = isError ? 'char-wrong' : 'char-correct';
        } else if (i === currentCharIndex) {
            // 当前字符
            charClass = 'char-current';
        }

        // 处理换行符和空格
        const char = currentTextArray[i];
        const displayChar = char === '\n' ? '↵\n' : (char === ' ' ? '&nbsp;' : char);

        html += `<span class="${charClass}">${displayChar}</span>`;
    }

    textDisplay.innerHTML = html;

    // 滚动到当前字符位置
    const currentCharElement = textDisplay.querySelector('.char-current');
    if (currentCharElement) {
        currentCharElement.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }
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

    // 中文输入法事件监听
    typingInput.addEventListener('compositionstart', () => {
        isComposing = true;
        console.log('开始中文输入法组合');
    });

    typingInput.addEventListener('compositionend', (e) => {
        isComposing = false;
        console.log('结束中文输入法组合，输入内容:', e.data);
        // 延迟处理，确保输入框内容已更新
        setTimeout(() => {
            processInputAfterComposition();
        }, 10);
    });

    // 文本类型变化
    textCategory.addEventListener('change', generateRandomText);
    textLength.addEventListener('change', generateRandomText);

    // 时间限制变化
    timeLimit.addEventListener('change', updateTimerDisplay);

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

    // 键盘快捷键
    document.addEventListener('keydown', (e) => {
        // Ctrl+Enter 开始/重新开始测试
        if (e.ctrlKey && e.key === 'Enter') {
            if (isTesting) {
                resetTest();
            } else {
                startTest();
            }
        }

        // Esc 暂停/继续
        if (e.key === 'Escape' && isTesting) {
            togglePause();
        }

        // 空格键重新开始（当测试未进行时）
        if (e.key === ' ' && !isTesting && e.target !== typingInput) {
            startTest();
            e.preventDefault();
        }
    });
}

// 优化的打字处理函数
function handleTypingOptimized(e) {
    if (!isTesting || isPaused) return;

    // 如果是中文输入法组合期间，不处理
    if (isComposing) {
        console.log('中文输入法组合中，跳过处理');
        return;
    }

    const inputText = typingInput.value;
    const inputLength = inputText.length;
    const now = Date.now();

    // 限制输入频率，防止过快的输入事件
    if (now - lastInputTime < 10) {
        console.log('输入事件过快，跳过');
        return;
    }
    lastInputTime = now;

    // 如果输入长度减少（退格），不记录错误
    if (inputLength < currentCharIndex) {
        const charsDeleted = currentCharIndex - inputLength;
        currentCharIndex = inputLength;

        // 移除最近删除的错误记录
        for (let i = 0; i < charsDeleted; i++) {
            const removedIndex = currentCharIndex + i;
            const errorIndex = errors.findIndex(error => error.index === removedIndex);
            if (errorIndex !== -1) {
                const error = errors[errorIndex];
                // 减少键位错误计数
                const key = error.typedChar.toLowerCase();
                if (keyErrors[key]) {
                    keyErrors[key]--;
                    if (keyErrors[key] <= 0) {
                        delete keyErrors[key];
                    }
                }
                errors.splice(errorIndex, 1);
            }
        }

        displayText();
        updateLiveStats();
        updateKeyboardErrorMap();
        return;
    }

    // 处理正常输入
    processTypingInput(inputText);
}

// 处理打字输入
function processTypingInput(inputText) {
    if (!isTesting || isPaused) return;

    // 检查输入文本是否比当前索引长
    if (inputText.length <= currentCharIndex) {
        return;
    }

    // 获取新输入的字符
    const newChar = inputText[currentCharIndex];
    const targetChar = currentTextArray[currentCharIndex];

    // 特殊处理：如果用户按回车键跳过
    if (newChar === '\n' && targetChar !== '\n') {
        // 回车键跳过当前字符，不记录为错误
        console.log('用户按回车跳过字符:', targetChar);
        currentCharIndex++;
        typingInput.value = inputText.substring(0, currentCharIndex);
        displayText();
        updateLiveStats();
        return;
    }

    // 检查字符是否正确
    const isCorrect = newChar === targetChar;

    // 记录打字数据
    typingData.push({
        time: new Date(),
        charIndex: currentCharIndex,
        typedChar: newChar,
        targetChar: targetChar,
        isCorrect: isCorrect,
        wpm: calculateCurrentWPM()
    });

    if (!isCorrect) {
        // 记录错误
        errors.push({
            index: currentCharIndex,
            typedChar: newChar,
            targetChar: targetChar,
            timestamp: new Date()
        });

        // 记录键位错误（只记录字母和数字）
        if (/[a-zA-Z0-9]/.test(newChar)) {
            const key = newChar.toLowerCase();
            keyErrors[key] = (keyErrors[key] || 0) + 1;
        }
    } else {
        correctChars++;
    }

    totalCharsTyped++;
    currentCharIndex++;

    // 检查是否完成
    if (currentCharIndex >= currentTextArray.length) {
        finishTest();
    }

    // 更新显示
    displayText();
    updateLiveStats();
    updateCharts();
    updateKeyboardErrorMap();
}

// 中文输入法组合结束后处理
function processInputAfterComposition() {
    if (!isTesting || isPaused) return;

    const inputText = typingInput.value;

    // 检查输入是否比当前索引长（中文可能一次输入多个字符）
    if (inputText.length <= currentCharIndex) {
        return;
    }

    // 获取从当前索引开始的新输入
    const newInput = inputText.substring(currentCharIndex);

    // 逐个字符处理新输入
    for (let i = 0; i < newInput.length; i++) {
        if (currentCharIndex >= currentTextArray.length) break;

        const newChar = newInput[i];
        const targetChar = currentTextArray[currentCharIndex];

        // 检查字符是否正确
        const isCorrect = newChar === targetChar;

        // 记录打字数据
        typingData.push({
            time: new Date(),
            charIndex: currentCharIndex,
            typedChar: newChar,
            targetChar: targetChar,
            isCorrect: isCorrect,
            wpm: calculateCurrentWPM()
        });

        if (!isCorrect) {
            // 记录错误
            errors.push({
                index: currentCharIndex,
                typedChar: newChar,
                targetChar: targetChar,
                timestamp: new Date()
            });

            // 记录键位错误（只记录字母和数字）
            if (/[a-zA-Z0-9]/.test(newChar)) {
                const key = newChar.toLowerCase();
                keyErrors[key] = (keyErrors[key] || 0) + 1;
            }
        } else {
            correctChars++;
        }

        totalCharsTyped++;
        currentCharIndex++;
    }

    // 检查是否完成
    if (currentCharIndex >= currentTextArray.length) {
        finishTest();
    }

    // 更新显示
    displayText();
    updateLiveStats();
    updateCharts();
    updateKeyboardErrorMap();
}

// 处理按键事件（记录退格）
function handleKeyDown(e) {
    if (!isTesting || isPaused) return;

    // 如果是中文输入法组合期间，不处理退格计数
    if (isComposing) return;

    if (e.key === 'Backspace') {
        backspaceCount++;
        totalErrors.textContent = errors.length;
        backspaceCountDisplay.textContent = backspaceCount;

        // 记录退格事件
        typingData.push({
            time: new Date(),
            type: 'backspace',
            charIndex: currentCharIndex
        });
    } else if (e.key === 'Enter' && !e.ctrlKey) {
        // 回车键处理 - 防止默认行为干扰
        e.preventDefault();

        // 如果当前字符不是换行符，我们已经在processTypingInput中处理了跳过逻辑
        // 这里只需要确保不会产生额外的换行
        if (currentCharIndex < currentTextArray.length) {
            const targetChar = currentTextArray[currentCharIndex];
            if (targetChar === '\n') {
                // 如果目标字符就是换行符，正常处理
                return;
            }
            // 否则，我们已经在processTypingInput中处理了跳过逻辑
        }
    }
}

// 计算当前WPM
function calculateCurrentWPM() {
    if (!startTime || currentCharIndex === 0) return 0;

    const now = new Date();
    const minutesElapsed = (now - startTime) / (1000 * 60);
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
    return Math.min(100, Math.round((currentCharIndex / currentTextArray.length) * 100));
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

    // 生成新文本
    generateRandomText();

    // 重置状态
    currentCharIndex = 0;
    errors = [];
    typingData = [];
    keyErrors = {};
    backspaceCount = 0;
    totalCharsTyped = 0;
    correctChars = 0;
    pendingInput = "";
    isComposing = false;
    lastInputTime = 0;
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

    // 启动计时器
    startTimer();

    // 更新实时显示
    updateLiveStats();

    // 重置图表
    resetCharts();
}

// 开始计时器
function startTimer() {
    const limit = parseInt(timeLimit.value);
    let timeLeft = limit;

    updateTimerDisplay(timeLeft);

    if (limit > 0) {
        timerInterval = setInterval(() => {
            if (!isPaused) {
                timeLeft--;
                updateTimerDisplay(timeLeft);

                if (timeLeft <= 0) {
                    finishTest();
                }
            }
        }, 1000);
    }
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
    if (timeLeft <= 10) {
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
        pauseTestBtn.innerHTML = '<i class="fas fa-play"></i> 继续';
        typingInput.disabled = true;

        // 记录暂停时间
        typingData.push({
            time: new Date(),
            type: 'pause',
            charIndex: currentCharIndex
        });
    } else {
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
    pendingInput = "";

    // 更新UI
    typingInput.disabled = true;
    typingInput.value = '';
    startTestBtn.disabled = false;
    pauseTestBtn.disabled = true;
    textCategory.disabled = false;
    textLength.disabled = false;
    timeLimit.disabled = false;

    // 重置计时器显示
    updateTimerDisplay();

    // 生成新文本
    generateRandomText();
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

    // 计算最终结果
    const testDuration = (endTime - startTime) / 1000; // 秒
    const finalWPM = calculateCurrentWPM();
    const finalAccuracy = calculateAccuracy();

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
}

// 关闭结果模态框
function closeResultsModal() {
    resultsModal.classList.remove('active');
}

// 开始新测试
function startNewTest() {
    closeResultsModal();
    resetTest();
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
    alert('结果已保存到本地存储中！');
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
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.7)'
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
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.7)'
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.7)'
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
                intervals.push(interval);
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