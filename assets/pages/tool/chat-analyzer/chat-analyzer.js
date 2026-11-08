import { wordsIn } from './words.mjs';
import { loadScript } from '/assets/js/load-script.mjs';

const get = id => document.getElementById(id);
const analyze = get('analyzeBtn');
const fileInput = get('fileInput');
const upload = get('uploadArea');
const chatStatus = get('chatStatus');
const stopwords = new Set();
let chatData = '';
let generation = 0;
let analysisResults = {};
let lookup;

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



initStopwords();

function reset() {
    generation++;
    lookup = null;
    chatData = '';
    analysisResults = {};
    fileInput.value = '';
    get('fileInfo').style.display = 'none';
    get('resultsSection').style.display = 'none';
    get('progressContainer').style.display = 'none';
    get('concordance').hidden = true;
    get('concordanceLines').replaceChildren();
    get('wordList').replaceChildren();
    analyze.disabled = true;
    chatStatus.textContent = '';
}

function setText(name, text) {
    chatData = text;
    get('fileName').textContent = name;
    get('fileSize').textContent = new Intl.NumberFormat('zh-CN').format(text.length) + ' 字符';
    get('fileInfo').style.display = 'block';
    analyze.disabled = !text.trim();
    chatStatus.textContent = analyze.disabled ? '文件没有可分析的文字。' : '可以开始分析。';
}

async function loadFile(file) {
    reset();
    if (!file) return;
    if (!/\.txt$/i.test(file.name) || file.size > 10 * 1024 * 1024) {
        chatStatus.textContent = '请选择 10 MB 以内的 UTF-8 文本文件（.txt）。';
        return;
    }
    const request = generation;
    chatStatus.textContent = '正在读取文件…';
    try {
        const text = await file.text();
        if (request === generation) setText(file.name, text);
    } catch {
        if (request === generation) chatStatus.textContent = '无法读取文件，请重新选择。';
    }
}

get('chooseChatFile').onclick = () => fileInput.click();
fileInput.onchange = () => loadFile(fileInput.files[0]);
upload.ondragover = event => {
    event.preventDefault();
    upload.classList.add('drag-over');
};
upload.ondragleave = () => upload.classList.remove('drag-over');
upload.ondrop = event => {
    event.preventDefault();
    upload.classList.remove('drag-over');
    loadFile(event.dataTransfer.files[0]);
};
get('chatSample').onclick = () => {
    reset();
    setText('读书会示例', [
        '读书会这周聊科幻小说，大家先选一段最喜欢的原文。',
        '我读了三篇科幻小说，想从叙事视角来比较。',
        '我觉得科幻小说里这个城市的设定适合做读书会主题。',
        '周末读书会可以线上开，书单放群里吧。',
        '有些科幻小说的开头很慢，读到后面就停不下来。'
    ].join('\n'));
    analyze.click();
};
get('resetBtn').onclick = reset;
get('downloadDetailed').onclick = () => downloadFile('detailed');
get('downloadVocab').onclick = () => downloadFile('vocab');
get('downloadSummary').onclick = () => downloadFile('summary');

const punctuation = {
    period: { label: '[整行都是句号]', pattern: /^[。]+$/u },
    question: { label: '[整行都是问号]', pattern: /^[？]+$/u }
};
const yieldToPage = () => new Promise(resolve => setTimeout(resolve, 0));

analyze.onclick = async () => {
    if (!chatData.trim()) return;
    const request = ++generation;
    lookup = null;
    const lines = chatData.split(/\r\n|\n|\r/);
    const minFrequency = Math.max(1, Math.min(1000, Number.parseInt(get('minFrequency').value, 10) || 3));
    const enablePunctuationStats = get('punctuationStats').checked;
    const frequencies = new Map();
    const specialCounts = { period: 0, question: 0 };
    analyze.disabled = true;
    get('resultsSection').style.display = 'none';
    get('concordance').hidden = true;
    get('concordanceLines').replaceChildren();
    get('progressContainer').style.display = 'block';
    chatStatus.textContent = '正在分词和统计…';

    let index = 0;
    while (index < lines.length) {
        const percent = Math.floor(index * 100 / lines.length) + '%';
        get('progressFill').style.width = percent;
        get('progressText').textContent = percent;
        await yieldToPage();
        if (request !== generation) return;
        const deadline = performance.now() + 12;
        do {
            const line = lines[index++].trim();
            if (enablePunctuationStats) {
                if (punctuation.period.pattern.test(line)) specialCounts.period++;
                if (punctuation.question.pattern.test(line)) specialCounts.question++;
            }
            for (const { word } of wordsIn(line)) {
                if (!stopwords.has(word)) frequencies.set(word, (frequencies.get(word) || 0) + 1);
            }
        } while (index < lines.length && performance.now() < deadline);
    }

    const words = [...frequencies].filter(([, count]) => count >= minFrequency);
    for (const [kind, { label }] of Object.entries(punctuation)) {
        if (enablePunctuationStats && specialCounts[kind] >= minFrequency) words.push([label, specialCounts[kind]]);
    }
    words.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh'));
    analysisResults = {
        words, lines, specialCounts, totalLines: lines.length,
        filteredCount: words.length, minFrequency, enablePunctuationStats,
        timestamp: new Date().toLocaleString('zh-CN')
    };
    displayResults();
};

function displayResults() {
    const { words, specialCounts, totalLines, filteredCount, minFrequency, timestamp } = analysisResults;
    get('progressContainer').style.display = 'none';
    chatStatus.textContent = '分析完成。点击高频词可以回查原句。';
    get('statWordCount').textContent = filteredCount;
    get('statPeriodCount').textContent = specialCounts.period;
    get('statQuestionCount').textContent = specialCounts.question;
    get('statTotalLines').textContent = totalLines;
    get('analysisTime').textContent = timestamp;
    get('resultsSummary').textContent = '共分析 ' + totalLines + ' 行，发现 ' + filteredCount + ' 个达到阈值的词或标点项（≥ ' + minFrequency + ' 次）。';

    const list = get('wordList');
    list.replaceChildren();
    for (const [word, frequency] of words.slice(0, 50)) {
        const item = document.createElement('button');
        item.className = 'word-item';
        item.type = 'button';
        const label = document.createElement('span');
        label.className = 'word-text';
        label.textContent = word;
        const count = document.createElement('span');
        count.className = 'word-count';
        count.textContent = frequency;
        item.append(label, count);
        item.onclick = () => {
            lookup = { word, frequency, index: 0 };
            get('concordance').hidden = false;
            get('concordanceTitle').textContent = '「' + word + '」的原句';
            get('concordanceTitle').focus();
            get('concordanceLines').replaceChildren();
            void loadMatches();
        };
        list.append(item);
    }
    get('resultsSection').style.display = 'block';
    const current = generation;
    get('wordcloudCanvas').hidden = true;
    get('wordCloudStatus').textContent = '正在加载词云组件…';
    void loadScript('https://cdnjs.cloudflare.com/ajax/libs/wordcloud2.js/1.1.0/wordcloud2.min.js', 'WordCloud')
        .then(() => {
            if (current !== generation) return;
            get('wordCloudStatus').textContent = '';
            get('wordcloudCanvas').hidden = false;
            generateWordCloud();
        }).catch(() => {
            if (current === generation) get('wordCloudStatus').textContent = '词云暂不可用，可继续回查原句或导出结果。';
        });
    get('resultsSection').scrollIntoView({ behavior: 'smooth' });
    analyze.disabled = false;
}

function addMatch(line, number, match) {
    const start = Math.max(0, match.index - 95);
    const end = Math.min(line.length, match.index + match.length + 95);
    const li = document.createElement('li');
    const mark = document.createElement('mark');
    mark.textContent = line.slice(match.index, match.index + Math.min(match.length, 95));
    li.append('第 ' + number + ' 行 · ' + (start > 0 ? '…' : '') + line.slice(start, match.index),
        mark, line.slice(match.index + match.length, end) + (end < line.length || match.length > 95 ? '…' : ''));
    get('concordanceLines').append(li);
}

async function loadMatches() {
    const request = lookup;
    if (!request || request.loading) return;
    request.loading = true;
    const more = get('moreMatches');
    const status = get('concordanceStatus');
    const { lines } = analysisResults;
    const special = Object.values(punctuation).find(item => item.label === request.word);
    more.hidden = true;
    status.textContent = '正在回查原文…';
    let found = 0;
    while (request.index < lines.length && found < 20) {
        await yieldToPage();
        if (lookup !== request) return;
        const deadline = performance.now() + 12;
        do {
            const line = lines[request.index++];
            let match;
            if (special && special.pattern.test(line.trim())) {
                match = { index: line.indexOf(line.trim()), length: line.trim().length };
            } else if (!special && line.toLowerCase().includes(request.word)) {
                for (const token of wordsIn(line)) {
                    if (token.word === request.word) { match = token; break; }
                }
            }
            if (match) {
                addMatch(line, request.index, match);
                found++;
            }
        } while (request.index < lines.length && found < 20 && performance.now() < deadline);
    }
    request.loading = false;
    more.hidden = request.index === lines.length;
    status.textContent = '已列出 ' + get('concordanceLines').childElementCount + ' 行 · 统计共 ' + request.frequency + ' 次';
}
get('moreMatches').onclick = loadMatches;

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

    window.WordCloud(canvas, {
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
