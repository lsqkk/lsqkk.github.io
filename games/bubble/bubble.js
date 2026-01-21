// 游戏主逻辑
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('score');
const livesElement = document.getElementById('lives');
const bestElement = document.getElementById('best');
const restartBtn = document.getElementById('restartBtn');
const pauseBtn = document.getElementById('pauseBtn');
const gameOverOverlay = document.getElementById('gameOverOverlay');
const finalScoreElement = document.getElementById('finalScore');
const newBestBadge = document.getElementById('newBestBadge');
const playAgainBtn = document.getElementById('playAgainBtn');
const overlay = document.getElementById('overlay');
const dontShowAgainCheckbox = document.getElementById('dontShowAgain');
const startGameBtn = document.getElementById('startGameBtn');

// 设置全屏画布
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// 游戏状态
let score = 0;
let lives = 10;
let bubbles = [];
let gameActive = false;
let gamePaused = false;
let bestScore = localStorage.getItem('bubbleGameBestScore') || 0;
let touchCooldown = false;
let lastBottomHitTime = 0;
let bottomHitCount = 0;
const BOTTOM_HIT_COOLDOWN = 1000; // 1秒内只计算一次触底

bestElement.textContent = bestScore;

// 气泡颜色配置
const BUBBLE_COLORS = [
    'rgba(255, 107, 107, 0.9)',    // 红色
    'rgba(255, 159, 67, 0.9)',     // 橙色
    'rgba(86, 217, 140, 0.9)',     // 绿色
    'rgba(46, 134, 193, 0.9)',     // 蓝色
    'rgba(155, 81, 224, 0.9)'      // 紫色（最小气泡）
];

// 检查是否显示规则
if (localStorage.getItem('bubbleGameDontShowRules') === 'true') {
    overlay.style.display = 'none';
    gameActive = true;
    gameLoop();
}

// 开始游戏
startGameBtn.addEventListener('click', () => {
    if (dontShowAgainCheckbox.checked) {
        localStorage.setItem('bubbleGameDontShowRules', 'true');
    }
    overlay.style.display = 'none';
    gameActive = true;
    gameLoop();
});

// 气泡类
class Bubble {
    constructor(x, y, size, level) {
        this.x = x;
        this.y = y;
        this.size = size;
        this.level = level;
        this.color = BUBBLE_COLORS[Math.min(level, BUBBLE_COLORS.length - 1)];
        this.dx = (Math.random() - 0.5) * (3 + level); // 降低水平速度
        this.dy = (Math.random() * 0.5 + 0.2); // 降低垂直速度
        this.rotation = Math.random() * Math.PI * 2;
        this.rotationSpeed = (Math.random() - 0.5) * 0.02;
        this.pulsePhase = Math.random() * Math.PI * 2;
        this.pulseSpeed = 0.02 + Math.random() * 0.03;
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);

        // 脉动效果
        const pulseScale = 1 + Math.sin(this.pulsePhase) * 0.05;
        ctx.scale(pulseScale, pulseScale);

        // 气泡主体渐变
        const gradient = ctx.createRadialGradient(
            -this.size * 0.3,
            -this.size * 0.3,
            this.size * 0.1,
            0,
            0,
            this.size
        );
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
        gradient.addColorStop(0.6, this.color);
        gradient.addColorStop(1, this.color.replace('0.9', '0.6'));

        // 绘制气泡
        ctx.beginPath();
        ctx.arc(0, 0, this.size, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.shadowColor = 'rgba(255, 255, 255, 0.3)';
        ctx.shadowBlur = 15;
        ctx.fill();

        // 高光
        ctx.beginPath();
        ctx.ellipse(
            -this.size * 0.3,
            -this.size * 0.3,
            this.size * 0.3,
            this.size * 0.15,
            Math.PI / 4,
            0,
            Math.PI * 2
        );
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fill();

        // 反射光
        ctx.beginPath();
        ctx.ellipse(
            this.size * 0.2,
            this.size * 0.2,
            this.size * 0.15,
            this.size * 0.08,
            -Math.PI / 4,
            0,
            Math.PI * 2
        );
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.fill();

        ctx.restore();
        this.pulsePhase += this.pulseSpeed;
    }

    update() {
        if (gamePaused) return true;

        // 边界碰撞
        if (this.x + this.size > canvas.width || this.x - this.size < 0) {
            this.dx *= -0.9;
            this.x = Math.max(this.size, Math.min(canvas.width - this.size, this.x));
        }

        if (this.y - this.size < 0) {
            this.dy = Math.abs(this.dy) * 0.9;
            this.y = this.size;
        }

        // 底部碰撞检测（降低惩罚频率）
        if (this.y + this.size > canvas.height) {
            const now = Date.now();
            if (now - lastBottomHitTime > BOTTOM_HIT_COOLDOWN) {
                lastBottomHitTime = now;
                bottomHitCount = Math.min(bottomHitCount + 1, 5);
                const penalty = Math.floor(bottomHitCount * 0.5) + 1;
                lives = Math.max(0, lives - penalty);
                livesElement.textContent = lives;
                createHitEffect(this.x, this.y, 'rgba(255, 82, 82, 0.8)');
            }
            return false;
        }

        // 物理更新
        this.dx *= 0.995; // 空气阻力
        this.dy = Math.min(this.dy + 0.08, 8); // 降低重力加速度
        this.x += this.dx;
        this.y += this.dy;
        this.rotation += this.rotationSpeed;

        return true;
    }

    isClicked(mx, my) {
        const distance = Math.sqrt((mx - this.x) ** 2 + (my - this.y) ** 2);
        return distance < this.size;
    }
}

// 创建点击特效
function createHitEffect(x, y, color) {
    const effect = document.createElement('div');
    effect.className = 'bubble-hit-effect';
    effect.style.cssText = `
                position: fixed;
                left: ${x}px;
                top: ${y}px;
                width: 40px;
                height: 40px;
                border-radius: 50%;
                background: radial-gradient(circle, ${color}, transparent 70%);
                transform: translate(-50%, -50%);
                pointer-events: none;
                z-index: 10;
            `;
    document.body.appendChild(effect);
    setTimeout(() => effect.remove(), 600);
}

// 创建新气泡
function createBubble() {
    const level = Math.floor(Math.random() * 4);
    const size = 60 - (level * 12);
    const x = Math.random() * (canvas.width - size * 2) + size;
    const y = -size; // 从顶部生成
    bubbles.push(new Bubble(x, y, size, level));
}

// 分裂气泡
function splitBubble(bubble, clickX, clickY) {
    // 点击气泡恢复生命值（越大的气泡恢复越多）
    const lifeGain = Math.max(1, Math.floor((5 - bubble.level) * 0.5));
    lives = Math.min(20, lives + lifeGain); // 生命上限20
    livesElement.textContent = lives;

    // 重置触底惩罚计数器
    bottomHitCount = Math.max(0, bottomHitCount - 1);

    if (bubble.level < 4) {
        // 分裂为2-3个小气泡
        const splitCount = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < splitCount; i++) {
            const angle = (i * Math.PI * 2) / splitCount + Math.random() * 0.5;
            const newSize = bubble.size * (0.5 + Math.random() * 0.2);
            const newX = clickX + Math.cos(angle) * bubble.size * 0.7;
            const newY = clickY + Math.sin(angle) * bubble.size * 0.7;
            bubbles.push(new Bubble(newX, newY, newSize, bubble.level + 1));
        }
        score += (5 - bubble.level) * 15;
    } else {
        // 最小气泡：额外奖励
        lives = Math.min(20, lives + 2);
        livesElement.textContent = lives;
        score += 25;
        createHitEffect(clickX, clickY, 'rgba(100, 255, 100, 0.8)');
    }

    scoreElement.textContent = score;
    createHitEffect(clickX, clickY, 'rgba(255, 255, 255, 0.6)');
}

// 游戏结束
function gameOver() {
    gameActive = false;
    gameOverOverlay.style.display = 'flex';
    finalScoreElement.textContent = `得分: ${score}`;

    if (score > bestScore) {
        bestScore = score;
        localStorage.setItem('bubbleGameBestScore', bestScore);
        bestElement.textContent = bestScore;
        newBestBadge.style.display = 'block';
    } else {
        newBestBadge.style.display = 'none';
    }

    restartBtn.style.display = 'block';
}

// 游戏主循环
function gameLoop() {
    if (!gameActive || gamePaused) return;

    // 清除画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 生成新气泡（频率随得分增加）
    const spawnRate = 0.01 + (score / 50000);
    if (Math.random() < spawnRate && bubbles.length < 30) {
        createBubble();
    }

    // 更新和绘制气泡
    bubbles = bubbles.filter(bubble => {
        const keep = bubble.update();
        if (keep) bubble.draw();
        return keep;
    });

    // 检查游戏结束
    if (lives <= 0) {
        gameOver();
        return;
    }

    requestAnimationFrame(gameLoop);
}

// 点击事件处理
function handleClick(x, y) {
    if (!gameActive || gamePaused || touchCooldown) return;

    let bubbleClicked = false;
    for (let i = bubbles.length - 1; i >= 0; i--) {
        const bubble = bubbles[i];
        if (bubble.isClicked(x, y)) {
            splitBubble(bubble, x, y);
            bubbles.splice(i, 1);
            bubbleClicked = true;

            // 触摸设备冷却
            if ('ontouchstart' in window) {
                touchCooldown = true;
                setTimeout(() => touchCooldown = false, 100);
            }
            break;
        }
    }

    // 点击空白处轻微恢复生命
    if (!bubbleClicked && lives < 20) {
        lives = Math.min(20, lives + 0.5);
        livesElement.textContent = Math.floor(lives);
        createHitEffect(x, y, 'rgba(100, 100, 255, 0.4)');
    }
}

// 事件监听
canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    handleClick(x, y);
});

canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    handleClick(x, y);
}, { passive: false });

// 控制按钮事件
pauseBtn.addEventListener('click', () => {
    gamePaused = !gamePaused;
    pauseBtn.textContent = gamePaused ? '继续' : '暂停';
    if (!gamePaused && gameActive) {
        gameLoop();
    }
});

restartBtn.addEventListener('click', () => {
    resetGame();
    gameOverOverlay.style.display = 'none';
});

playAgainBtn.addEventListener('click', () => {
    resetGame();
    gameOverOverlay.style.display = 'none';
});

// 重置游戏
function resetGame() {
    bubbles = [];
    score = 0;
    lives = 10;
    gameActive = true;
    gamePaused = false;
    bottomHitCount = 0;
    scoreElement.textContent = score;
    livesElement.textContent = lives;
    pauseBtn.textContent = '暂停';
    restartBtn.style.display = 'none';
    gameLoop();
}

// 版权信息
const currentYear = new Date().getFullYear();
const footer = document.createElement('footer');
footer.style.cssText = `
            position: fixed;
            bottom: 10px;
            right: 20px;
            color: rgba(255, 255, 255, 0.6);
            font-size: 12px;
            z-index: 100;
        `;
footer.innerHTML = `© 2024-${currentYear} 戳气泡游戏 / <a href="/posts/copyright" style="color: rgba(255, 255, 255, 0.8); text-decoration: none;">夸克博客</a> All rights reserved.`;
document.body.appendChild(footer);