let currentQuestion = null;
let userCoords = null;
let stats = {
    total: 0,
    scores: [],
    lastUpdate: null
};

async function loadQuestion() {
    const response = await fetch('data.json');
    const data = await response.json();
    currentQuestion = data[Math.floor(Math.random() * data.length)];

    document.getElementById('question-image').innerHTML = `
                <img src="/games/xjtx/images/${currentQuestion.image}" alt="题目图片">
            `;
}

function showMap() {
    document.getElementById('satellite-map').style.display = 'block';
    document.body.insertAdjacentHTML('beforeend', '<div class="overlay"></div>');

    const mapImg = document.getElementById('map-image');
    mapImg.onclick = function (e) {
        const rect = mapImg.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width * 50;
        const y = (e.clientY - rect.top) / rect.height * 70;
        userCoords = { x: Math.round(x), y: Math.round(y) };

        const marker = document.getElementById('user-marker');
        marker.style.left = `${e.clientX - rect.left}px`;
        marker.style.top = `${e.clientY - rect.top}px`;
        marker.style.display = 'block';
    };
}

function submitAnswer() {
    const dx = currentQuestion.x - userCoords.x;
    const dy = currentQuestion.y - userCoords.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const actualDistance = distance * 15.7;
    let score = 0;

    if (distance <= 5) {
        score = 5000;
    } else if (distance >= 70) {
        score = 0;
    } else {
        score = Math.round(5000 * (1 - distance / 70));
    }

    const mapImg = document.getElementById('map-image');
    const rect = mapImg.getBoundingClientRect();

    // 更新正确标记
    const correctMarker = document.getElementById('correct-marker');
    correctMarker.style.left = `${(currentQuestion.x / 50 * rect.width)}px`;
    correctMarker.style.top = `${(currentQuestion.y / 70 * rect.height)}px`;
    correctMarker.style.display = 'block';

    // 绘制连接线
    const userX = parseFloat(document.getElementById('user-marker').style.left);
    const userY = parseFloat(document.getElementById('user-marker').style.top);
    const correctX = parseFloat(correctMarker.style.left);
    const correctY = parseFloat(correctMarker.style.top);

    const line = document.getElementById('connection-line');
    const length = Math.sqrt(Math.pow(correctX - userX, 2) + Math.pow(correctY - userY, 2));
    const angle = Math.atan2(correctY - userY, correctX - userX);

    line.style.width = `${length}px`;
    line.style.left = `${userX}px`;
    line.style.top = `${userY}px`;
    line.style.transform = `rotate(${angle}rad)`;
    line.style.display = 'block';

    // 更新结果展示
    document.getElementById('map-result').innerHTML = `
                <p>实际距离：<span>${actualDistance.toFixed(1)}米</span></p>
                <p>得分：<span>${score}</span></p>
            `;

    // 切换按钮功能
    const submitBtn = document.getElementById('submit-btn');
    submitBtn.textContent = '下一题';
    submitBtn.onclick = nextQuestion;

    updateStats(score);
}

function nextQuestion() {
    // 重置地图元素
    document.getElementById('satellite-map').style.display = 'none';
    document.querySelector('.overlay')?.remove();

    // 清除标记和连线
    document.getElementById('correct-marker').style.display = 'none';
    document.getElementById('user-marker').style.display = 'none';
    document.getElementById('connection-line').style.display = 'none';
    document.getElementById('map-result').innerHTML = '';

    // 重置按钮功能
    const submitBtn = document.getElementById('submit-btn');
    submitBtn.textContent = '确定';
    submitBtn.onclick = submitAnswer;

    loadQuestion();
}

function updateStats(score) {
    const today = new Date().toDateString();
    if (stats.lastUpdate !== today) {
        stats = { total: 0, scores: [], lastUpdate: today };
    }

    stats.total++;
    stats.scores.push(score);

    localStorage.setItem('gameStats', JSON.stringify(stats));

    document.getElementById('total-questions').textContent = stats.total;
    document.getElementById('high-score').textContent = Math.max(...stats.scores);
    document.getElementById('low-score').textContent = Math.min(...stats.scores);
    document.getElementById('average-score').textContent =
        (stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length).toFixed(1);
}

window.onload = function () {
    const savedStats = localStorage.getItem('gameStats');
    if (savedStats) {
        stats = JSON.parse(savedStats);
        if (new Date().toDateString() !== stats.lastUpdate) {
            stats = { total: 0, scores: [], lastUpdate: new Date().toDateString() };
        }
    }
    loadQuestion();
};