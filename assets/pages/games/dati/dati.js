firebase.initializeApp(firebaseConfig);

// 全局变量
const TIME_LIMIT = 10;
const WIN_SCORE = 100;
let currentQuestionData = null;
let currentBattleQuestionData = null;
let roomName = '';
let gameRef = null;
let playersRef = null;
let questionRef = null;
let userColor = localStorage.getItem('userColor') || '#40E0D0';
let nickname = localStorage.getItem('nickname') || '';
let gameMode = 'solo';
let recentRooms = JSON.parse(localStorage.getItem('recentRooms') || '[]');
let currentAnswer = '';
let selectedOption = null;
let selectedAnswer = '';
let timer = null;
let timeLeft = TIME_LIMIT;
let player1 = null;
let player2 = null;
let score1 = 0;
let score2 = 0;
let gameActive = false;
let currentQuestion = null;
let answeredPlayers = [];

// 统计信息
let stats = {
    total: 0,
    correct: 0,
    date: new Date().toLocaleDateString()
};

// DOM 加载完成后初始化
document.addEventListener('DOMContentLoaded', function () {
    initTheme();
    document.getElementById('mobileMenuBtn').addEventListener('click', toggleSidebar);
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
    updateRecentRoomsList();

    if (nickname) {
        document.getElementById('nicknameInput').value = nickname;
    }

    document.querySelectorAll('.color-option').forEach(opt => {
        opt.classList.toggle('selected', opt.style.background === userColor);
    });

    loadStats();
    if (gameMode === 'solo') {
        getQuestion();
    }
});

// 初始化主题
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.body.className = savedTheme + '-mode';
    updateThemeIcon(savedTheme);
}

// 切换主题
function toggleTheme() {
    const isDark = document.body.classList.contains('dark-mode');
    const newTheme = isDark ? 'light' : 'dark';
    document.body.classList.remove(isDark ? 'dark-mode' : 'light-mode');
    document.body.classList.add(newTheme + '-mode');
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
}

// 更新主题图标
function updateThemeIcon(theme) {
    const icon = document.getElementById('themeToggle').querySelector('i');
    icon.className = theme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
}

// 切换侧边栏（移动端）
function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
}

// 更新最近房间列表
function updateRecentRoomsList() {
    const roomList = document.getElementById('roomList');

    if (recentRooms.length === 0) {
        roomList.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon"><i class="fas fa-question-circle"></i></div>
                        <p>暂无房间记录</p>
                    </div>
                `;
        return;
    }

    roomList.innerHTML = '';
    recentRooms.forEach(room => {
        const roomItem = document.createElement('div');
        roomItem.className = 'room-item';
        roomItem.innerHTML = `<i class="fas fa-door-open room-icon"></i><span>${room}</span>`;
        roomItem.addEventListener('click', () => {
            document.getElementById('roomInput').value = room;
            joinRoom();
        });
        roomList.appendChild(roomItem);
    });
}

// 添加最近房间
function addRecentRoom(room) {
    if (!recentRooms.includes(room)) {
        recentRooms.unshift(room);
        if (recentRooms.length > 5) {
            recentRooms = recentRooms.slice(0, 5);
        }
        localStorage.setItem('recentRooms', JSON.stringify(recentRooms));
        updateRecentRoomsList();
    }
}

// 选择模式
function selectMode(mode, evt) {
    document.querySelectorAll('.role-btn').forEach(btn => {
        btn.classList.remove('selected');
    });
    const trigger = evt && (evt.currentTarget || evt.target);
    if (trigger && trigger.classList) {
        trigger.classList.add('selected');
    }
    gameMode = mode;
}

// 加入房间
function joinRoom() {
    roomName = document.getElementById('roomInput').value.trim();
    if (!roomName) return;

    addRecentRoom(roomName);
    document.getElementById('currentRoomTitle').textContent = `房间: ${roomName}`;
    document.getElementById('sidebar').classList.remove('open');

    if (nickname && gameMode) {
        initializeGame();
    }
}

// 选择颜色
function selectColor(element) {
    document.querySelectorAll('.color-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    element.classList.add('selected');
    userColor = element.style.backgroundColor;
}

// 保存个人资料
function saveProfile() {
    nickname = document.getElementById('nicknameInput').value.trim();
    if (!nickname) {
        alert('请填写昵称');
        return;
    }

    localStorage.setItem('nickname', nickname);
    localStorage.setItem('userColor', userColor);

    if (gameMode === 'solo') {
        startSoloMode();
    } else {
        initializeGame();
    }
}

// 开始单人模式
function startSoloMode() {
    document.getElementById('profileSetup').style.display = 'none';
    document.getElementById('soloContent').style.display = 'block';
    document.getElementById('currentRoomTitle').textContent = '每日知识挑战';
    getQuestion();
}

// 初始化游戏
function initializeGame() {
    document.getElementById('profileSetup').style.display = 'none';
    document.getElementById('battleContent').style.display = 'block';

    gameRef = firebase.database().ref(`quiz_battle/${roomName}`);
    playersRef = gameRef.child('players');
    questionRef = gameRef.child('question');

    const myPlayerInfo = {
        nickname: nickname,
        color: userColor,
        role: gameMode,
        timestamp: Date.now()
    };

    // 加入游戏
    playersRef.child(gameMode).set(myPlayerInfo);

    // 监听玩家变化
    playersRef.on('value', snapshot => {
        const players = snapshot.val() || {};
        player1 = players.player1 || null;
        player2 = players.player2 || null;

        updatePlayerInfo();
        checkGameStart();
    });

    // 监听问题变化
    questionRef.on('value', snapshot => {
        const questionData = snapshot.val() || {};

        if (questionData.question) {
            currentQuestion = questionData;
            displayBattleQuestion(questionData);

            if (questionData.winner) {
                showWinner(questionData.winner);
            }
        }
    });

    // 初始化对战状态
    if (gameMode === 'player1' || gameMode === 'player2') {
        document.getElementById('battleOptions').addEventListener('click', handleBattleAnswer);
    }
}

// 更新玩家信息显示
function updatePlayerInfo() {
    // 更新玩家1信息
    const player1El = document.getElementById('player1');
    if (player1) {
        player1El.innerHTML = `
                    <div class="player-avatar" style="background: ${player1.color}">${player1.nickname[0].toUpperCase()}</div>
                    <div>
                        <div class="player-name">${player1.nickname}</div>
                        <div class="player-role">玩家1 ${gameMode === 'player1' ? '(你)' : ''}</div>
                    </div>
                `;
    } else {
        player1El.innerHTML = `
                    <div class="player-avatar">P1</div>
                    <div>
                        <div class="player-name">等待玩家1...</div>
                        <div class="player-role">玩家1</div>
                    </div>
                `;
    }

    // 更新玩家2信息
    const player2El = document.getElementById('player2');
    if (player2) {
        player2El.innerHTML = `
                    <div class="player-avatar" style="background: ${player2.color}">${player2.nickname[0].toUpperCase()}</div>
                    <div>
                        <div class="player-name">${player2.nickname}</div>
                        <div class="player-role">玩家2 ${gameMode === 'player2' ? '(你)' : ''}</div>
                    </div>
                `;
    } else {
        player2El.innerHTML = `
                    <div class="player-avatar">P2</div>
                    <div>
                        <div class="player-name">等待玩家2...</div>
                        <div class="player-role">玩家2</div>
                    </div>
                `;
    }
}

// 检查游戏是否可以开始
function checkGameStart() {
    if (player1 && player2 && !gameActive) {
        gameActive = true;
        score1 = 0;
        score2 = 0;
        updateScores();

        if (gameMode === 'player1' || gameMode === 'player2') {
            document.getElementById('restartBtn').style.display = 'block';
        } else {
            document.getElementById('restartBtn').style.display = 'none';
        }

        startNewQuestion();
    }
}

// 开始新问题
function startNewQuestion() {
    answeredPlayers = [];
    timeLeft = TIME_LIMIT;
    updateTimer();

    if (timer) clearInterval(timer);
    timer = setInterval(() => {
        timeLeft--;
        updateTimer();

        if (timeLeft <= 0) {
            clearInterval(timer);
            endQuestion();
        }
    }, 1000);

    getBattleQuestion();
}

// 更新计时器显示
function updateTimer() {
    document.getElementById('timer').textContent = timeLeft;
}

// 获取对战问题
async function getBattleQuestion() {
    try {
        // 需要 include_answers=true 来获取正确答案
        const response = await fetch('https://quark-api.130923.xyz/api/quiz/random?count=1&include_answers=true');
        const data = await response.json();

        if (data.success && data.data.questions) {
            const question = data.data.questions;
            // 提取正确答案 - 现在选项会包含 is_correct 字段
            let correctAnswer = '';
            const correctOption = question.options.find(opt => opt.is_correct);
            if (correctOption) {
                correctAnswer = correctOption.letter;
            } else {
                // 如果没有 is_correct 字段，可能需要其他方式获取正确答案
                // 这里先设置为空，或者从其他字段获取
                console.warn('未找到正确答案标记');
            }

            // 格式化选项
            const options = question.options.map(opt => {
                // 如果有正确答案标记，添加星号
                const marker = opt.is_correct ? ' ✓' : '';
                return `${opt.letter}. ${opt.text}${marker}`;
            }).join('\n');

            questionRef.set({
                question: {
                    msg: question.question,
                    option: options,
                    answer: correctAnswer,
                    // 保存完整问题信息用于后续显示
                    fullData: question
                },
                answers: {},
                winner: null
            });
        } else {
            throw new Error('API返回数据格式错误');
        }
    } catch (error) {
        console.error('获取题目失败:', error);
        setTimeout(getBattleQuestion, 2000);
    }
}

function displayBattleQuestion(data) {
    const questionData = data.question;
    currentAnswer = questionData.answer;
    // 保存完整数据
    currentBattleQuestionData = questionData;

    document.getElementById('battleQuestion').innerHTML = `<p>${questionData.msg.replace(/\n/g, '<br>')}</p>`;

    const optionsContainer = document.getElementById('battleOptions');
    optionsContainer.innerHTML = questionData.option.split('\n').map(opt => {
        const letter = opt[0];
        return `<button class="option-btn" data-answer="${letter}">${opt}</button>`;
    }).join('');

    // 更新状态显示
    document.getElementById('battleStatus').textContent = gameMode === 'spectator' ?
        '观战中...' : `你有 ${timeLeft} 秒时间答题`;
}
// 处理对战答题
function handleBattleAnswer(event) {
    if (!gameActive || answeredPlayers.includes(gameMode)) return;

    const target = event.target.closest('.option-btn');
    if (!target) return;

    const answer = target.getAttribute('data-answer');
    const isCorrect = answer === currentAnswer;

    // 记录答案
    questionRef.child('answers').child(gameMode).set({
        answer: answer,
        correct: isCorrect,
        timestamp: Date.now()
    });

    // 添加到已答玩家列表
    answeredPlayers.push(gameMode);

    // 检查是否双方都已答
    questionRef.child('answers').once('value', snapshot => {
        const answers = snapshot.val() || {};
        if (Object.keys(answers).length === 2) {
            endQuestion();
        }
    });
}

// 7. 在对战模式结束后，如果需要显示正确答案，可以添加：
function endQuestion() {
    clearInterval(timer);

    questionRef.child('answers').once('value', snapshot => {
        const answers = snapshot.val() || {};
        const players = Object.keys(answers);

        // 计算得分
        const correctPlayers = players.filter(p => answers[p].correct);
        const sortedPlayers = players.sort((a, b) =>
            answers[a].timestamp - answers[b].timestamp);

        // 给第一个答对的玩家10分，第二个5分
        correctPlayers.forEach((player, index) => {
            if (player === 'player1') {
                score1 += index === 0 ? 10 : 5;
            } else {
                score2 += index === 0 ? 10 : 5;
            }
        });

        // 给答错的玩家扣5分
        players.filter(p => !answers[p].correct).forEach(player => {
            if (player === 'player1') {
                score1 = Math.max(0, score1 - 5);
            } else {
                score2 = Math.max(0, score2 - 5);
            }
        });

        updateScores();

        // 显示正确答案（如果需要）
        if (currentBattleQuestionData && currentBattleQuestionData.fullData) {
            const correctOpt = currentBattleQuestionData.fullData.options.find(opt => opt.is_correct);
            if (correctOpt) {
                const battleStatus = document.getElementById('battleStatus');
                battleStatus.textContent = `正确答案: ${correctOpt.letter} - ${correctOpt.text}`;
                battleStatus.className = 'correct-answer';
                setTimeout(() => {
                    battleStatus.textContent = gameMode === 'spectator' ? '观战中...' : '准备下一题...';
                    battleStatus.className = '';
                }, 3000);
            }
        }

        // 检查是否有玩家达到胜利分数
        let winner = null;
        if (score1 >= WIN_SCORE) {
            winner = 'player1';
        } else if (score2 >= WIN_SCORE) {
            winner = 'player2';
        }

        if (winner) {
            questionRef.update({ winner: winner });
        } else {
            // 3秒后进入下一题
            setTimeout(startNewQuestion, 3000);
        }
    });
}


// 更新分数显示
function updateScores() {
    document.getElementById('score1').textContent = score1;
    document.getElementById('score2').textContent = score2;
    document.getElementById('progress1').style.width = `${(score1 / WIN_SCORE) * 100}%`;
    document.getElementById('progress2').style.width = `${(score2 / WIN_SCORE) * 100}%`;
}

// 显示胜利者
function showWinner(winner) {
    gameActive = false;
    clearInterval(timer);

    const winnerName = winner === 'player1' ?
        (player1 ? player1.nickname : '玩家1') :
        (player2 ? player2.nickname : '玩家2');

    document.getElementById('winnerName').textContent = winnerName;
    document.getElementById('winnerOverlay').style.display = 'flex';
}

// 请求重新开始游戏
function requestRestart() {
    if (confirm('确定要重新开始游戏吗?')) {
        score1 = 0;
        score2 = 0;
        updateScores();
        questionRef.set({});
        document.getElementById('winnerOverlay').style.display = 'none';
        startNewQuestion();
    }
}

// 从localStorage加载统计信息
function loadStats() {
    const saved = localStorage.getItem('quizStats');
    if (saved) {
        const savedStats = JSON.parse(saved);
        if (savedStats.date === new Date().toLocaleDateString()) {
            stats = savedStats;
        }
    }
}

// 保存统计信息
function saveStats() {
    stats.date = new Date().toLocaleDateString();
    localStorage.setItem('quizStats', JSON.stringify(stats));
    if (stats.correct >= 10) {
        localStorage.setItem('dailyAchievement', new Date().toLocaleDateString());
    }
}

// 获取问题（单人模式）
async function getQuestion() {
    try {
        // 同样需要 include_answers=true
        const response = await fetch('https://quark-api.130923.xyz/api/quiz/random?count=1&include_answers=true');
        const data = await response.json();

        if (data.success && data.data.questions) {
            const question = data.data.questions;
            // 提取正确答案
            let correctAnswer = '';
            const correctOption = question.options.find(opt => opt.is_correct);
            if (correctOption) {
                correctAnswer = correctOption.letter;
            }

            // 格式化选项 - 显示时先不显示正确答案标记
            const options = question.options.map(opt => `${opt.letter}. ${opt.text}`).join('\n');

            displayQuestion({
                msg: question.question,
                option: options,
                answer: correctAnswer,
                // 保存完整问题用于显示正确答案
                fullData: question
            });
        } else {
            throw new Error('API返回数据格式错误');
        }
    } catch (error) {
        console.error('获取题目失败:', error);
        showMessage('获取题目失败，请重试', 'error');
        setTimeout(getQuestion, 5000);
    }
}

// 3. 修改 displayQuestion 函数，保存完整数据：
function displayQuestion(data) {
    document.getElementById('question').innerHTML = `<p>${data.msg.replace(/\n/g, '<br>')}</p>`;
    document.getElementById('options').innerHTML = data.option.split('\n').map(opt => {
        const letter = opt[0];
        return `<button class="option-btn" onclick="selectOption(this, '${letter}')" data-answer="${letter}">${opt}</button>`;
    }).join('');
    currentAnswer = data.answer;
    // 保存完整数据用于显示正确答案
    currentQuestionData = data.fullData || data;
    updateStatsDisplay();
}

// 选择选项（单人模式）
function selectOption(btn, value) {
    if (selectedOption) selectedOption.classList.remove('selected');
    selectedOption = btn;
    selectedAnswer = value;
    selectedOption.classList.add('selected');
    document.getElementById('submitBtn').disabled = false;
}

// 提交答案（单人模式）
async function submitAnswer() {
    if (!selectedOption) return;

    const isCorrect = selectedAnswer === currentAnswer;
    stats.total++;
    if (isCorrect) {
        stats.correct++;
        playSound('correct');
        showMessage('🎉 回答正确！', 'success');
    } else {
        playSound('wrong');
        showMessage('❌ 回答错误', 'error');
        displayCorrectAnswer(currentAnswer);
    }

    saveStats();

    if (selectedOption) {
        selectedOption.classList.remove('selected');
    }
    selectedOption = null;
    selectedAnswer = '';
    document.getElementById('submitBtn').disabled = true;

    await getQuestion();
}

// 4. 修改 displayCorrectAnswer 函数，显示正确答案：
function displayCorrectAnswer(correctAnswer) {
    const optionsContainer = document.getElementById('options');
    const correctOption = optionsContainer.querySelector(`button[data-answer="${correctAnswer}"]`);
    if (correctOption) {
        const correctText = correctOption.textContent.trim();
        const msgDiv = document.getElementById('resultMessage');
        msgDiv.innerHTML += ` 正确答案是：${correctAnswer} - ${correctText}`;
    } else if (currentQuestionData && currentQuestionData.fullData) {
        // 使用保存的完整数据显示正确答案
        const correctOpt = currentQuestionData.fullData.options.find(opt => opt.letter === correctAnswer);
        if (correctOpt) {
            const msgDiv = document.getElementById('resultMessage');
            msgDiv.innerHTML += ` 正确答案是：${correctAnswer} - ${correctOpt.text}`;
        }
    }
}

// 更新统计显示
function updateStatsDisplay() {
    document.getElementById('stats').innerHTML = `
                今日答题统计：
                答题数：${stats.total}次 | 
                正确率：${stats.total ? ((stats.correct / stats.total) * 100).toFixed(1) : 0}% |
                正确数：${stats.correct}
            `;
}

// 显示提示信息
function showMessage(text, type) {
    const msgDiv = document.getElementById('resultMessage');
    msgDiv.textContent = text;
    msgDiv.className = type;
    setTimeout(() => msgDiv.textContent = '', 2000);
}

// 播放音效
function playSound(type) {
    const audio = new Audio();
    audio.src = type === 'correct' ? '3.MP3' : '2.MP3';
    audio.play();
}
