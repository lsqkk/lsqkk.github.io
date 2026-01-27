let db = null;
let masterPool = [];
let masteredIds = new Set();
let currentQuestion = null;
let queue = [];
// 保持存储名不变
let historyData = JSON.parse(localStorage.getItem('study_stats_v2') || '{}');

fetch('sizheng.json')
    .then(res => res.json())
    .then(data => {
        db = data;
        initChapSelectors();
    });

function initChapSelectors() {
    const sChap = document.getElementById('start-chap');
    const eChap = document.getElementById('end-chap');
    db.chaps.forEach(c => {
        let opt = `<option value="${c.chap}">${c.chapName}</option>`;
        sChap.innerHTML += opt;
        eChap.innerHTML += opt;
    });
    eChap.value = db.chaps[db.chaps.length - 1].chap;
    updateSecDropdown('start');
    updateSecDropdown('end');
    // 结束节默认选最后一个
    const eSec = document.getElementById('end-sec');
    eSec.selectedIndex = eSec.options.length - 1;
}

function updateSecDropdown(type) {
    const cVal = document.getElementById(`${type}-chap`).value;
    const sSel = document.getElementById(`${type}-sec`);
    const chapData = db.chaps.find(c => c.chap == cVal);
    sSel.innerHTML = '';
    chapData.sections.forEach(s => {
        sSel.innerHTML += `<option value="${s.sec}">${s.sec} ${s.secName}</option>`;
    });
}

function startQuiz() {
    const sc = parseInt(document.getElementById('start-chap').value);
    const ss = parseFloat(document.getElementById('start-sec').value);
    const ec = parseInt(document.getElementById('end-chap').value);
    const es = parseFloat(document.getElementById('end-sec').value);

    masterPool = [];
    masteredIds.clear();
    queue = [];

    db.chaps.forEach(c => {
        c.sections.forEach(sec => {
            const secVal = parseFloat(sec.sec);
            // 逻辑判断：在起止章节范围内，且符合节的边界
            let inRange = false;
            if (c.chap > sc && c.chap < ec) inRange = true;
            else if (c.chap === sc && c.chap === ec) inRange = (secVal >= ss && secVal <= es);
            else if (c.chap === sc) inRange = (secVal >= ss);
            else if (c.chap === ec) inRange = (secVal <= es);

            if (inRange) {
                sec.qs.forEach((q, idx) => {
                    const id = `q-${c.chap}-${sec.sec}-${idx}`;
                    masterPool.push({ ...q, id });
                });
            }
        });
    });

    if (masterPool.length === 0) return alert("该范围内没有题目，请重新选择");
    document.getElementById('config-ui').classList.add('hidden');
    document.getElementById('quiz-ui').classList.remove('hidden');
    nextQuestion();
}

function nextQuestion() {
    const remainingPool = masterPool.filter(q => !masteredIds.has(q.id));
    if (remainingPool.length === 0 && queue.length === 0) {
        document.getElementById('question-display').innerHTML = "✨ 本轮练习已全部掌握！";
        document.getElementById('answer-hint').innerText = "";
        return;
    }

    document.getElementById('quiz-progress').innerText = `掌握进度：${masteredIds.size} / ${masterPool.length}`;

    if (queue.length > 0 && queue[0].wait <= 0) {
        currentQuestion = queue.shift().data;
    } else {
        if (remainingPool.length > 0) {
            let weighted = [];
            remainingPool.forEach(q => { for (let i = 0; i < (q.l || 1); i++) weighted.push(q); });
            currentQuestion = weighted[Math.floor(Math.random() * weighted.length)];
        } else {
            currentQuestion = queue.shift().data;
        }
        queue.forEach(item => item.wait--);
    }
    renderQuestion();
}

function renderQuestion() {
    document.getElementById('question-display').innerText = currentQuestion.q;
    document.getElementById('answer-hint').innerText = document.getElementById('show-a').checked ? `需答点数：${currentQuestion.a}` : '';
}

function handleResult(isKnown) {
    const id = currentQuestion.id;
    if (!historyData[id]) historyData[id] = { count: 0, logs: [] };
    historyData[id].count++;
    historyData[id].logs.push(isKnown ? 1 : 0);
    if (historyData[id].logs.length > 5) historyData[id].logs.shift();
    localStorage.setItem('study_stats_v2', JSON.stringify(historyData));

    if (isKnown) {
        masteredIds.add(id);
        queue = queue.filter(item => item.data.id !== id);
    } else {
        masteredIds.delete(id);
        queue.push({ data: currentQuestion, wait: 3 + Math.floor(Math.random() * 2) });
    }
    nextQuestion();
}

function toggleStats() {
    const container = document.getElementById('stats-container');
    let html = '<table class="stats-table"><tr><th>题目</th><th>抽取</th><th>近况</th></tr>';
    const ids = Object.keys(historyData).reverse();
    if (!ids.length) html += '<tr><td colspan="3">无记录</td></tr>';
    ids.forEach(id => {
        const item = historyData[id];
        const logHtml = item.logs.map(l => `<span class="${l ? 'tag-yes' : 'tag-no'}">${l ? '●' : '○'}</span>`).join(' ');
        html += `<tr><td>${findQ(id)}</td><td>${item.count}</td><td>${logHtml}</td></tr>`;
    });
    container.innerHTML = html + '</table>';
    document.getElementById('config-ui').classList.add('hidden');
    document.getElementById('stats-ui').classList.remove('hidden');
    document.getElementById('title-text').innerText = "学习轨迹";
}

function findQ(id) {
    try {
        const p = id.split('-');
        return db.chaps.find(c => c.chap == p[1]).sections.find(s => s.sec == p[2]).qs[p[3]].q;
    } catch (e) { return "未知题目"; }
}