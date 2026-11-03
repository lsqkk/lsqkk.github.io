// DOM 元素
const timerDisplay = document.getElementById('timer');
const startButton = document.getElementById('start');
const stopButton = document.getElementById('stop');
const resetButton = document.getElementById('reset');
const progressBar = document.getElementById('progressBar');
const alarmSound = document.getElementById('alarmSound');
const timeOptions = document.querySelectorAll('.time-option');
const themeToggle = document.getElementById('themeToggle');

// 变量
let countdown;
let timeLeft;
let totalTime;
let isDarkMode = false;

// 初始化
initTimer(1500);

// 事件监听
startButton.addEventListener('click', startTimer);
stopButton.addEventListener('click', stopTimer);
resetButton.addEventListener('click', resetTimer);

timeOptions.forEach(option => {
    option.addEventListener('click', () => {
        timeOptions.forEach(opt => { opt.classList.remove('active'); opt.setAttribute('aria-pressed','false'); });
        option.classList.add('active'); option.setAttribute('aria-pressed','true');
        const newTime = parseInt(option.dataset.time);
        initTimer(newTime);
    });
});

themeToggle.addEventListener('click', toggleTheme);

// 函数
function initTimer(seconds) {
    clearInterval(countdown);
    totalTime = seconds;
    timeLeft = seconds;
    updateDisplay();
    startButton.disabled = false;
    stopButton.disabled = true;
    progressBar.style.width = '100%';
}

function startTimer() {
    clearInterval(countdown);

    countdown = setInterval(() => {
        timeLeft--;
        updateDisplay();

        // 更新进度条
        const progressPercentage = (timeLeft / totalTime) * 100;
        progressBar.style.width = `${progressPercentage}%`;

        if (timeLeft <= 0) {
            clearInterval(countdown);
            timerComplete();
        }
    }, 1000);

    startButton.disabled = true;
    stopButton.disabled = false;
}

function stopTimer() {
    clearInterval(countdown);
    startButton.disabled = false;
    stopButton.disabled = true;
}

function resetTimer() {
    initTimer(totalTime);
}

function updateDisplay() {
    const minutes = Math.floor(timeLeft / 60);
    let seconds = timeLeft % 60;
    seconds = seconds < 10 ? '0' + seconds : seconds;
    timerDisplay.textContent = `${minutes}:${seconds}`;

    // 最后10秒变为红色
    if (timeLeft <= 10) {
        timerDisplay.style.color = '#e74c3c';
        progressBar.style.backgroundColor = '#e74c3c';
    } else {
        timerDisplay.style.color = '';
        progressBar.style.backgroundColor = '';
    }
}

function timerComplete() {
    timerDisplay.textContent = '00:00';
    stopButton.disabled = true;
    progressBar.style.width = '0%';

    // 播放提示音
    alarmSound.play().catch(() => {});

    // 显示通知
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('番茄钟完成', {
            body: '时间到！该休息一下了。'
        });
    } else if ('Notification' in window && Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                new Notification('番茄钟完成', {
                    body: '时间到！该休息一下了。'
                });
            }
        });
    }
}

function toggleTheme() {
    isDarkMode = !isDarkMode;
    document.body.dataset.timerTheme = isDarkMode ? 'dark' : 'light';
    themeToggle.textContent = isDarkMode ? '🌞' : '🌓';

    // 保存主题偏好到本地存储
    localStorage.setItem('themePreference', isDarkMode ? 'dark' : 'light');
}

// 检查本地存储中的主题偏好
const savedTheme = localStorage.getItem('themePreference');
if (savedTheme === 'dark') {
    isDarkMode = true;
    document.body.dataset.timerTheme = 'dark';
    themeToggle.textContent = '🌞';
}

// Notification permission is requested after a completed focus session.