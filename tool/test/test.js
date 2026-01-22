let currentTestData = null;
let currentQuestion = 0;
let answers = {};
let dimensions = {};

// 页面加载入口
window.onload = function () {
    const urlParams = new URLSearchParams(window.location.search);
    const testId = urlParams.get('test');

    if (testId) {
        loadTest(testId);
    } else {
        loadIndex();
    }
};

// 加载索引列表
function loadIndex() {
    fetch('test_index.json')
        .then(res => res.json())
        .then(data => {
            const listContainer = document.getElementById('test-index');
            listContainer.innerHTML = data.map(item => `
                <div class="test-card" onclick="location.href='?test=${item.id}'">
                    <h3>${item.icon} ${item.title}</h3>
                    <p>${item.description}</p>
                </div>
            `).join('');
        });
}

// 加载特定问卷
function loadTest(id) {
    fetch(`${id}.json`)
        .then(res => res.json())
        .then(data => {
            currentTestData = data;
            document.getElementById('list-view').classList.add('hidden');
            document.getElementById('test-view').classList.remove('hidden');
            document.getElementById('test-title').textContent = data.title;

            // 动态初始化维度
            data.dimensions_config.forEach(d => {
                dimensions[d.left] = 0;
                dimensions[d.right] = 0;
            });

            showQuestion(0);
        })
        .catch(() => alert('问卷加载失败，请检查路径。'));
}

function showQuestion(index) {
    const container = document.querySelector('.question-container');
    const question = currentTestData.questions[index];
    currentQuestion = index;

    let optionsHTML = question.options.map((option, i) => `
        <div class="option">
            <input type="radio" name="answer" id="option${i}" value="${i}" 
                   ${answers[index] === i ? 'checked' : ''}
                   onchange="selectAnswer(${index}, ${i})">
            <label for="option${i}">${option.text}</label>
        </div>
    `).join('');

    container.innerHTML = `
        <div class="question">${index + 1}. ${question.question}</div>
        <div class="options">${optionsHTML}</div>
    `;

    updateProgress();
    updateNavigation();
}

function updateProgress() {
    const progress = (currentQuestion / currentTestData.questions.length) * 100;
    document.querySelector('.progress').style.width = `${progress}%`;
}

function updateNavigation() {
    document.getElementById('prevBtn').disabled = currentQuestion === 0;
    const isLast = currentQuestion === currentTestData.questions.length - 1;
    document.getElementById('nextBtn').disabled = !answers.hasOwnProperty(currentQuestion);
    document.getElementById('nextBtn').textContent = isLast ? '查看结果' : '下一题';
}

function selectAnswer(qIdx, oIdx) {
    answers[qIdx] = oIdx;
    updateNavigation();
}

function prevQuestion() {
    if (currentQuestion > 0) showQuestion(currentQuestion - 1);
}

function nextQuestion() {
    if (currentQuestion < currentTestData.questions.length - 1) {
        showQuestion(currentQuestion + 1);
    } else {
        calculateAndShowResults();
    }
}

function calculateAndShowResults() {
    // 计分
    Object.entries(answers).forEach(([qIdx, oIdx]) => {
        const scores = currentTestData.questions[qIdx].options[oIdx].scores;
        Object.entries(scores).forEach(([dim, val]) => {
            if (dimensions.hasOwnProperty(dim)) dimensions[dim] += val;
        });
    });

    const container = document.querySelector('.container');
    let html = `<div class="result-container"><h2>测试结果</h2>`;

    // 绘制条形图
    currentTestData.dimensions_config.forEach(pair => {
        const total = (dimensions[pair.left] || 0) + (dimensions[pair.right] || 0) || 1;
        const leftP = Math.round((dimensions[pair.left] / total) * 100);
        html += `
            <div class="dimension-bar">
                <div class="bar-label">
                    <span>${pair.left} ${leftP}%</span>
                    <span>${pair.name}</span>
                    <span>${pair.right} ${100 - leftP}%</span>
                </div>
                <div class="bar"><div class="bar-fill" style="width: ${leftP}%"></div></div>
            </div>`;
    });

    // 维度说明
    html += `<div class="dimension-descriptions"><h3>维度说明</h3>`;
    currentTestData.dimension_descriptions.forEach(desc => {
        html += `<div class="dimension-group"><h4>${desc.title}</h4><p>${desc.content}</p></div>`;
    });
    html += `</div><button onclick="location.href='?'" class="retry-btn">返回列表</button></div>`;

    container.innerHTML = html;
}