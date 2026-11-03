let currentQuestion = null;
let userCoords = null;
let stats = {
    total: 0,
    scores: [],
    lastUpdate: null
};

const MAP = {
    width: 50,
    height: 70,
    scoreMax: 5000,
    zeroDistance: 70,
    kmPerUnit: 15.7,
    perfectDistance: 5
};

function $id(id) {
    return document.getElementById(id);
}

async function loadQuestion() {
    const data = Array.isArray(window.__XJTX_DATA__)
        ? window.__XJTX_DATA__
        : await fetch('/assets/pages/games/xjtx/data.json').then((response) => response.json());
    currentQuestion = data[Math.floor(Math.random() * data.length)];

    $id('question-image').innerHTML = `
        <img src="/assets/pages/games/xjtx/images/${currentQuestion.image}" alt="校园题目照片">
    `;
}

function resetMapState() {
    userCoords = null;
    ['correct-marker', 'user-marker', 'connection-line'].forEach((id) => {
        const el = $id(id);
        if (el) el.style.display = 'none';
    });
    const result = $id('map-result');
    if (result) result.innerHTML = '';
    const submit = $id('submit-btn');
    if (submit) {
        submit.textContent = '确定';
        submit.onclick = submitAnswer;
    }
}

function showMap() {
    resetMapState();
    $id('satellite-map').classList.add('is-open');
    document.body.classList.add('xjtx-modal-open');
}

function closeMap() {
    $id('satellite-map').classList.remove('is-open');
    document.body.classList.remove('xjtx-modal-open');
}

function pickMapPoint(event) {
    const mapImg = $id('map-image');
    const rect = mapImg.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width * MAP.width;
    const y = (event.clientY - rect.top) / rect.height * MAP.height;
    userCoords = { x: Math.round(x), y: Math.round(y) };

    const marker = $id('user-marker');
    marker.style.left = `${event.clientX - rect.left}px`;
    marker.style.top = `${event.clientY - rect.top}px`;
    marker.style.display = 'block';
}

function scoreForDistance(distance) {
    if (distance <= MAP.perfectDistance) return MAP.scoreMax;
    if (distance >= MAP.zeroDistance) return 0;
    return Math.round(MAP.scoreMax * (1 - distance / MAP.zeroDistance));
}

function submitAnswer() {
    if (!currentQuestion || !userCoords) {
        const result = $id('map-result');
        if (result) result.innerHTML = '<p class="xjtx-result-hint">请先在地图上点选一个位置。</p>';
        return;
    }

    const dx = currentQuestion.x - userCoords.x;
    const dy = currentQuestion.y - userCoords.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const actualDistance = distance * MAP.kmPerUnit;
    const score = scoreForDistance(distance);

    const mapImg = $id('map-image');
    const rect = mapImg.getBoundingClientRect();

    const correctMarker = $id('correct-marker');
    correctMarker.style.left = `${(currentQuestion.x / MAP.width * rect.width)}px`;
    correctMarker.style.top = `${(currentQuestion.y / MAP.height * rect.height)}px`;
    correctMarker.style.display = 'block';

    const userMarker = $id('user-marker');
    const userX = parseFloat(userMarker.style.left);
    const userY = parseFloat(userMarker.style.top);
    const correctX = parseFloat(correctMarker.style.left);
    const correctY = parseFloat(correctMarker.style.top);

    const line = $id('connection-line');
    const length = Math.sqrt((correctX - userX) ** 2 + (correctY - userY) ** 2);
    const angle = Math.atan2(correctY - userY, correctX - userX);
    line.style.width = `${length}px`;
    line.style.left = `${userX}px`;
    line.style.top = `${userY}px`;
    line.style.transform = `rotate(${angle}rad)`;
    line.style.display = 'block';

    $id('map-result').innerHTML = `
        <p>实际距离 <span>${actualDistance.toFixed(1)} 米</span></p>
        <p>本局得分 <span>${score}</span></p>
    `;

    const submitBtn = $id('submit-btn');
    submitBtn.textContent = '下一题';
    submitBtn.onclick = nextQuestion;

    updateStats(score);
}

function nextQuestion() {
    closeMap();
    resetMapState();
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

    $id('total-questions').textContent = stats.total;
    $id('high-score').textContent = Math.max(...stats.scores);
    $id('low-score').textContent = Math.min(...stats.scores);
    $id('average-score').textContent =
        (stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length).toFixed(1);
}

document.addEventListener('DOMContentLoaded', function () {
    const savedStats = localStorage.getItem('gameStats');
    if (savedStats) {
        try {
            stats = JSON.parse(savedStats);
        } catch {
            stats = { total: 0, scores: [], lastUpdate: null };
        }
        if (new Date().toDateString() !== stats.lastUpdate) {
            stats = { total: 0, scores: [], lastUpdate: new Date().toDateString() };
        }
    }
    $id('map-image').addEventListener('click', pickMapPoint);
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && $id('satellite-map').classList.contains('is-open')) closeMap();
    });
    loadQuestion();
});
