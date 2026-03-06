// 全局变量
let chatData = '';
let wordFrequencies = {};
let specialCounts = { period: 0, question: 0 };
let analysisResults = {};
let stopwords = new Set();

// 初始化排除词列表（与Python版本一致的核心排除词）
function initStopwords() {
    const defaultStopwords = [
        // 中文常用单字
        '的', '了', '和', '是', '就', '都', '而', '及', '与', '或',
        '在', '中', '我', '你', '他', '她', '它', '们',
        '这', '那', '哪', '谁', '什么', '怎么', '为什么',
        '啊', '哦', '嗯', '哈', '啦', '呀', '吧', '吗', '呢',
        '不', '没', '有', '也', '又', '再',
        '上', '下', '左', '右', '前', '后', '里', '外',
        '一', '二', '三', '四', '五', '六', '七', '八', '九', '十',
        '很', '最', '太', '更', '非常', '特别',

        // 常见无意义词
        '这个', '那个', '一个', '一些', '一种', '一样',
        '时候', '时间', '开始', '然后', '最后',
        '可以', '可能', '可是', '但是', '虽然', '如果',
        '因为', '所以', '而且', '那么',
        '这样', '那样', '怎么', '什么', '为什么',
        '有点', '有些', '有点', '有些',
        '自己', '别人', '大家', '有人',
        '知道', '觉得', '认为', '以为',
        '看到', '听见', '听到', '想到',
        '今天', '明天', '昨天', '现在', '以前', '以后',
        '还有', '还有', '还是', '还有',
        '这里', '那里', '哪里', '这边', '那边',
        '的话', '的说', '的是', '了了',
    ];

    defaultStopwords.forEach(word => stopwords.add(word));
}


// 文件上传处理
document.addEventListener('DOMContentLoaded', function () {
    initStopwords();

    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const fileInfo = document.getElementById('fileInfo');
    const fileName = document.getElementById('fileName');
    const fileSize = document.getElementById('fileSize');
    const analyzeBtn = document.getElementById('analyzeBtn');

    // 点击上传区域触发文件选择
    uploadArea.addEventListener('click', () => fileInput.click());

    // 拖放功能
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('drag-over');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('drag-over');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');

        if (e.dataTransfer.files.length) {
            fileInput.files = e.dataTransfer.files;
            handleFileSelect();
        }
    });

    // 文件选择变化
    fileInput.addEventListener('change', handleFileSelect);

    function handleFileSelect() {
        if (fileInput.files.length === 0) return;

        const file = fileInput.files[0];

        // 验证文件类型
        if (!file.name.toLowerCase().endsWith('.txt')) {
            alert('请选择.txt格式的文本文件');
            fileInput.value = '';
            return;
        }

        // 显示文件信息
        fileName.textContent = file.name;
        fileSize.textContent = formatFileSize(file.size);
        fileInfo.style.display = 'block';

        // 启用分析按钮
        analyzeBtn.disabled = false;

        // 读取文件内容
        const reader = new FileReader();
        reader.onload = function (e) {
            chatData = e.target.result;
        };
        reader.readAsText(file, 'UTF-8');
    }

    // 开始分析按钮
    analyzeBtn.addEventListener('click', startAnalysis);

    // 重置按钮
    document.getElementById('resetBtn').addEventListener('click', resetAnalysis);

    // 下载按钮
    document.getElementById('downloadDetailed').addEventListener('click', () => downloadFile('detailed'));
    document.getElementById('downloadVocab').addEventListener('click', () => downloadFile('vocab'));
    document.getElementById('downloadSummary').addEventListener('click', () => downloadFile('summary'));
});

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 开始分析
function startAnalysis() {
    if (!chatData) {
        alert('请先上传聊天记录文件');
        return;
    }

    // 获取配置
    const minFrequency = parseInt(document.getElementById('minFrequency').value) || 20;
    const enablePunctuationStats = document.getElementById('punctuationStats').checked;

    // 显示进度条和加载动画
    document.getElementById('progressContainer').style.display = 'block';
    document.getElementById('loader').style.display = 'block';
    document.getElementById('analyzeBtn').disabled = true;

    // 重置结果区域
    document.getElementById('resultsSection').style.display = 'none';

    // 分析过程（模拟进度）
    simulateProgress();

    // 实际分析（使用setTimeout避免阻塞UI）
    setTimeout(() => {
        performAnalysis(minFrequency, enablePunctuationStats);
    }, 100);
}

// 模拟进度显示
function simulateProgress() {
    let progress = 0;
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const loaderDetail = document.getElementById('loaderDetail');

    const interval = setInterval(() => {
        progress += Math.random() * 15;
        if (progress > 95) progress = 95;

        progressFill.style.width = `${progress}%`;
        progressText.textContent = `${Math.round(progress)}%`;

        // 更新加载详情
        if (progress < 30) {
            loaderDetail.textContent = '正在读取文件内容...';
        } else if (progress < 60) {
            loaderDetail.textContent = '正在进行分词处理...';
        } else {
            loaderDetail.textContent = '正在统计词频和生成词云...';
        }

        if (progress >= 100) {
            clearInterval(interval);
        }
    }, 200);

    return interval;
}

// 执行分析
function performAnalysis(minFrequency, enablePunctuationStats) {
    // 重置数据
    wordFrequencies = {};
    specialCounts = { period: 0, question: 0 };

    const lines = chatData.split('\n');
    let totalLines = lines.length;
    let processedLines = 0;

    // 中文分词简单实现（模拟jieba功能）
    function simpleChineseSegment(text) {
        // 移除URL
        text = text.replace(/https?:\/\/\S+/g, '');
        // 移除邮箱
        text = text.replace(/\S+@\S+/g, '');
        // 保留中文、英文、数字和基本标点
        text = text.replace(/[^\w\u4e00-\u9fff\s\.\,\!\?，。！？]/g, '');
        // 合并多个空格
        text = text.replace(/\s+/g, ' ').trim();

        if (!text) return [];

        // 简单的分词逻辑（实际应用中应该使用更复杂的分词算法）
        let words = [];
        let currentWord = '';

        for (let char of text) {
            // 如果是中文或数字，添加到当前词
            if (/[\u4e00-\u9fff0-9]/.test(char)) {
                currentWord += char;
            }
            // 如果是英文，添加到当前词
            else if (/[a-zA-Z]/.test(char)) {
                currentWord += char;
            }
            // 如果是分隔符，结束当前词
            else if (currentWord) {
                words.push(currentWord);
                currentWord = '';
            }
        }

        // 添加最后一个词
        if (currentWord) {
            words.push(currentWord);
        }

        return words;
    }

    // 处理每一行
    for (let line of lines) {
        processedLines++;

        // 更新进度（每处理100行更新一次）
        if (processedLines % 100 === 0) {
            const progress = Math.min(95, (processedLines / totalLines) * 90);
            document.getElementById('progressFill').style.width = `${progress}%`;
            document.getElementById('progressText').textContent = `${Math.round(progress)}%`;
        }

        const trimmedLine = line.trim();

        // 检查纯标点消息（如果开启）
        if (enablePunctuationStats) {
            // 检查是否整行都是句号
            if (/^[。]+$/.test(trimmedLine)) {
                specialCounts.period++;
                continue;
            }

            // 检查是否整行都是问号
            if (/^[？]+$/.test(trimmedLine)) {
                specialCounts.question++;
                continue;
            }
        }

        // 分词和统计
        const words = simpleChineseSegment(trimmedLine);

        for (let word of words) {
            if (word) {
                wordFrequencies[word] = (wordFrequencies[word] || 0) + 1;
            }
        }
    }

    // 过滤和排序
    const filteredWords = {};
    let totalWords = 0;

    for (let [word, freq] of Object.entries(wordFrequencies)) {
        if (freq >= minFrequency && !stopwords.has(word)) {
            filteredWords[word] = freq;
            totalWords++;
        }
    }

    // 转换为数组并排序
    const sortedWords = Object.entries(filteredWords)
        .sort((a, b) => b[1] - a[1]);

    // 添加特殊标点到结果（如果达到阈值）
    const finalResults = [...sortedWords];

    if (enablePunctuationStats) {
        if (specialCounts.period >= minFrequency) {
            finalResults.push(['[整行都是句号]', specialCounts.period]);
        }
        if (specialCounts.question >= minFrequency) {
            finalResults.push(['[整行都是问号]', specialCounts.question]);
        }

        // 重新排序
        finalResults.sort((a, b) => b[1] - a[1]);
    }

    // 保存分析结果
    analysisResults = {
        words: finalResults,
        specialCounts,
        totalLines,
        filteredCount: finalResults.length,
        minFrequency,
        enablePunctuationStats,
        timestamp: new Date().toLocaleString('zh-CN')
    };

    // 完成进度
    document.getElementById('progressFill').style.width = '100%';
    document.getElementById('progressText').textContent = '100%';

    // 显示结果
    setTimeout(displayResults, 500);
}

// 显示分析结果
function displayResults() {
    // 隐藏进度和加载动画
    document.getElementById('progressContainer').style.display = 'none';
    document.getElementById('loader').style.display = 'none';

    // 更新统计信息
    document.getElementById('statWordCount').textContent = analysisResults.filteredCount;
    document.getElementById('statPeriodCount').textContent = analysisResults.specialCounts.period;
    document.getElementById('statQuestionCount').textContent = analysisResults.specialCounts.question;
    document.getElementById('statTotalLines').textContent = analysisResults.totalLines;

    // 更新摘要
    document.getElementById('resultsSummary').textContent =
        `共分析 ${analysisResults.totalLines} 行，发现 ${analysisResults.filteredCount} 个高频词（出现次数 ≥ ${analysisResults.minFrequency}）`;

    document.getElementById('analysisTime').textContent = analysisResults.timestamp;

    // 显示高频词列表
    const wordListContainer = document.getElementById('wordList');
    wordListContainer.innerHTML = '';

    const topWords = analysisResults.words.slice(0, 50);
    for (let [word, freq] of topWords) {
        const wordItem = document.createElement('div');
        wordItem.className = 'word-item';
        wordItem.innerHTML = `
                    <span class="word-text">${word}</span>
                    <span class="word-count">${freq}</span>
                `;
        wordListContainer.appendChild(wordItem);
    }

    // 生成词云
    generateWordCloud();

    // 显示结果区域
    document.getElementById('resultsSection').style.display = 'block';

    // 滚动到结果区域
    document.getElementById('resultsSection').scrollIntoView({ behavior: 'smooth' });

    // 重新启用分析按钮
    document.getElementById('analyzeBtn').disabled = false;
}

// 生成词云
function generateWordCloud() {
    const canvas = document.getElementById('wordcloudCanvas');
    const ctx = canvas.getContext('2d');

    // 清空画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 准备词云数据
    const wordcloudData = [];
    const maxWords = parseInt(document.getElementById('maxWords').value) || 200;
    const colorScheme = document.getElementById('wordcloudColor').value;

    // 过滤掉特殊标记
    const wordsForCloud = analysisResults.words
        .filter(item => !item[0].startsWith('[整行都是'))
        .slice(0, maxWords);

    // 计算最大和最小频率
    const maxFreq = wordsForCloud.length > 0 ? wordsForCloud[0][1] : 1;
    const minFreq = wordsForCloud.length > 0 ? wordsForCloud[wordsForCloud.length - 1][1] : 1;

    // 准备数据
    for (let [word, freq] of wordsForCloud) {
        // 计算权重（相对大小）
        const weight = 0.3 + 0.7 * (freq - minFreq) / (maxFreq - minFreq || 1);

        wordcloudData.push([word, Math.max(10, weight * 100)]);
    }

    if (wordcloudData.length === 0) {
        // 如果没有数据，显示提示
        ctx.fillStyle = '#333';
        ctx.font = '24px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('没有足够的高频词生成词云', canvas.width / 2, canvas.height / 2);
        return;
    }

    // 根据配色方案设置颜色
    // 根据配色方案设置颜色
    let colorFunction;
    switch (colorScheme) {
        case 'rainbow':
            colorFunction = () => {
                const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8'];
                return colors[Math.floor(Math.random() * colors.length)];
            };
            break;
        case 'pastel':
            colorFunction = () => {
                const colors = ['#FFB6C1', '#87CEEB', '#98FB98', '#DDA0DD', '#FFD700', '#F0E68C'];
                return colors[Math.floor(Math.random() * colors.length)];
            };
            break;
        case 'vibrant':
            colorFunction = () => {
                const colors = ['#FF0000', '#00FF00', '#0000FF', '#FF00FF', '#FFFF00', '#00FFFF'];
                return colors[Math.floor(Math.random() * colors.length)];
            };
            break;
        case 'colorful':
        default:
            colorFunction = () => {
                const hue = Math.floor(Math.random() * 360);
                return `hsl(${hue}, 70%, 60%)`;
            };
    }

    // 使用wordcloud2生成词云
    WordCloud(canvas, {
        list: wordcloudData,
        gridSize: Math.round(16 * canvas.width / 1024),
        weightFactor: 1,
        fontFamily: 'Microsoft YaHei, sans-serif',
        color: colorFunction,
        rotateRatio: 0.1,
        rotationSteps: 2,
        backgroundColor: 'white',
        shuffle: false,
        shape: 'circle',
        ellipticity: 0.9,
        drawOutOfBound: false,
        shrinkToFit: true,
        minSize: 8
    });
}

// 下载文件
function downloadFile(type) {
    if (!analysisResults.words || analysisResults.words.length === 0) {
        alert('请先完成分析');
        return;
    }

    let content = '';
    let filename = '';
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

    switch (type) {
        case 'detailed':
            filename = `高频词分析结果_${timestamp}.txt`;
            content = generateDetailedContent();
            break;
        case 'vocab':
            filename = `高频词汇表_${timestamp}.txt`;
            content = generateVocabContent();
            break;
        case 'summary':
            filename = `分析摘要_${timestamp}.txt`;
            content = generateSummaryContent();
            break;
    }

    // 创建下载链接
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// 生成详细内容
function generateDetailedContent() {
    let content = `高频词分析结果 (出现次数 ≥ ${analysisResults.minFrequency})\n`;
    content += '='.repeat(50) + '\n\n';

    // 特殊标点统计
    if (analysisResults.enablePunctuationStats &&
        (analysisResults.specialCounts.period >= analysisResults.minFrequency ||
            analysisResults.specialCounts.question >= analysisResults.minFrequency)) {
        content += "特殊标点统计 (整行都是该标点):\n";
        content += '-'.repeat(40) + '\n';

        if (analysisResults.specialCounts.period >= analysisResults.minFrequency) {
            content += `[整行都是句号]: ${analysisResults.specialCounts.period.toString().padStart(6)}\n`;
        }

        if (analysisResults.specialCounts.question >= analysisResults.minFrequency) {
            content += `[整行都是问号]: ${analysisResults.specialCounts.question.toString().padStart(6)}\n`;
        }

        content += '\n';
    }

    // 高频词汇
    content += "高频词汇:\n";
    content += '-'.repeat(40) + '\n';

    for (let [word, freq] of analysisResults.words) {
        if (!word.startsWith('[整行都是')) {
            content += `${word.padEnd(15)} ${freq.toString().padStart(6)}\n`;
        }
    }

    return content;
}

// 生成词汇表内容
function generateVocabContent() {
    let content = '';

    for (let [word, freq] of analysisResults.words) {
        if (!word.startsWith('[整行都是')) {
            content += `${word}\n`;
        }
    }

    return content;
}

// 生成摘要内容
function generateSummaryContent() {
    let content = "聊天记录高频词分析摘要\n";
    content += '='.repeat(50) + '\n\n';
    content += `分析时间: ${analysisResults.timestamp}\n`;
    content += `最小出现次数阈值: ${analysisResults.minFrequency}\n`;
    content += `纯标点统计: ${analysisResults.enablePunctuationStats ? '开启' : '关闭'}\n`;
    content += `发现的高频词数量: ${analysisResults.filteredCount}\n`;
    content += `使用的排除词数量: ${stopwords.size}\n\n`;

    // 特殊标点统计
    if (analysisResults.enablePunctuationStats) {
        content += "特殊标点统计:\n";
        content += '-'.repeat(30) + '\n';
        content += `整行都是句号: ${analysisResults.specialCounts.period}次\n`;
        content += `整行都是问号: ${analysisResults.specialCounts.question}次\n\n`;
    }

    // 词汇长度分布
    const lengthDist = {};
    for (let [word, freq] of analysisResults.words) {
        if (!word.startsWith('[整行都是')) {
            const length = word.length;
            lengthDist[length] = (lengthDist[length] || 0) + 1;
        }
    }

    content += "词汇长度分布:\n";
    const sortedLengths = Object.keys(lengthDist).sort((a, b) => a - b);
    for (let length of sortedLengths) {
        content += `  长度${length}: ${lengthDist[length]}个\n`;
    }

    return content;
}

// 重置分析
function resetAnalysis() {
    chatData = '';
    wordFrequencies = {};
    specialCounts = { period: 0, question: 0 };
    analysisResults = {};

    // 重置UI
    document.getElementById('fileInput').value = '';
    document.getElementById('fileInfo').style.display = 'none';
    document.getElementById('resultsSection').style.display = 'none';
    document.getElementById('progressContainer').style.display = 'none';
    document.getElementById('loader').style.display = 'none';
    document.getElementById('analyzeBtn').disabled = true;

    // 清空词云
    const canvas = document.getElementById('wordcloudCanvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 清空词列表
    document.getElementById('wordList').innerHTML = '';

    alert('已重置所有数据，可以重新上传文件进行分析。');
}