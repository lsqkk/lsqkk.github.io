// 弹窗系统
let currentPopup = null;
let isLocalhost = window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';

// 检查并显示弹窗
async function checkAndShowPopup() {
    try {
        const response = await fetch('json/popups.json');
        const popups = await response.json();

        const today = new Date().toISOString().split('T')[0];

        for (const popup of popups) {
            if (shouldShowPopup(popup, today)) {
                showPopup(popup);
                break; // 每次只显示一个弹窗
            }
        }
    } catch (error) {
        console.error('加载弹窗配置失败:', error);
    }
}

// 判断是否应该显示弹窗
function shouldShowPopup(popup, today) {
    // 检查日期范围
    if (today < popup.startDate || today > popup.endDate) {
        return false;
    }

    // 检查是否被永久禁用
    const neverShowKey = `popup_never_${popup.id}`;
    if (localStorage.getItem(neverShowKey) === 'true') {
        return false;
    }

    // 在localhost环境下，允许一个ID多次显示（跳过时间检查）
    if (isLocalhost) {
        return true;
    }

    // 检查今天是否已经显示过
    const todayShownKey = `popup_shown_${popup.id}_${today}`;
    if (localStorage.getItem(todayShownKey) === 'true') {
        return false;
    }

    return true;
}

// 显示弹窗
function showPopup(popup) {
    document.body.style.cursor = 'auto';
    currentPopup = popup;

    const overlay = document.getElementById('popup-overlay');
    const container = document.getElementById('popup-container');
    const title = document.getElementById('popup-title');
    const content = document.getElementById('popup-content');

    title.textContent = popup.title;

    // 配置Marked选项，使单换行符转换为<br>
    marked.setOptions({
        breaks: true,  // 关键：将单个换行符转换为 <br>
        gfm: true      // 启用GitHub风格的Markdown
    });

    const formattedContent = marked.parse(popup.content);
    content.innerHTML = formattedContent;

    // 设置链接在新标签页打开并添加样式类
    content.querySelectorAll('a').forEach(link => {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        if (!link.classList.contains('popup-link')) {
            link.classList.add('popup-link');
        }
    });

    // 设置弹窗样式
    if (popup.backgroundColor) {
        container.style.background = popup.backgroundColor;
    }
    if (popup.textColor) {
        container.style.color = popup.textColor;
        title.style.color = popup.textColor;
    }

    // 显示弹窗
    overlay.style.display = 'flex';

    // 记录今天已显示（localhost环境下不记录）
    if (!isLocalhost) {
        const today = new Date().toISOString().split('T')[0];
        const todayShownKey = `popup_shown_${popup.id}_${today}`;
        localStorage.setItem(todayShownKey, 'true');
    }

    // 自动关闭
    if (popup.autoClose) {
        setTimeout(() => {
            closePopup();
        }, 8000);
    }

    // 庆祝动效
    if (popup.celebration) {
        startCelebration();
    }

    // 设置事件监听
    setupPopupEvents();
}

// 设置弹窗事件
function setupPopupEvents() {
    const overlay = document.getElementById('popup-overlay');
    const closeBtn = document.getElementById('popup-close');
    const confirmBtn = document.getElementById('popup-confirm');
    const neverShowCheckbox = document.getElementById('popup-never-show');

    // 关闭按钮
    closeBtn.onclick = closePopup;

    // 确认按钮
    confirmBtn.onclick = closePopup;

    // 点击遮罩层关闭
    overlay.onclick = (e) => {
        if (e.target === overlay) {
            closePopup();
        }
    };

    // ESC键关闭
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closePopup();
        }
    });

    // 不再显示选项
    neverShowCheckbox.onchange = (e) => {
        if (e.target.checked && currentPopup) {
            localStorage.setItem(`popup_never_${currentPopup.id}`, 'true');
        }
    };
}

// 关闭弹窗
function closePopup() {
    document.body.style.cursor = 'none';
    const overlay = document.getElementById('popup-overlay');
    const neverShowCheckbox = document.getElementById('popup-never-show');

    overlay.style.display = 'none';
    neverShowCheckbox.checked = false;
    stopCelebration();
    currentPopup = null;
}

// 庆祝动效
function startCelebration() {
    const container = document.getElementById('celebration-container');
    container.innerHTML = '';

    // 创建彩色纸屑效果
    for (let i = 0; i < 50; i++) {
        createConfetti(container);
    }
}

function createConfetti(container) {
    const confetti = document.createElement('div');
    confetti.className = 'confetti';
    confetti.style.left = Math.random() * 100 + 'vw';
    confetti.style.animationDelay = Math.random() * 2 + 's';
    confetti.style.background = getRandomColor();
    container.appendChild(confetti);

    // 自动清理
    setTimeout(() => {
        if (confetti.parentNode) {
            confetti.parentNode.removeChild(confetti);
        }
    }, 3000);
}

function getRandomColor() {
    const colors = [
        '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57',
        '#ff9ff3', '#54a0ff', '#5f27cd', '#00d2d3', '#ff9f43'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

function stopCelebration() {
    const container = document.getElementById('celebration-container');
    container.innerHTML = '';
}