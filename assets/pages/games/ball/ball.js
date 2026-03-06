// 游戏配置
const config = {
    gravity: 0.5,          // 重力加速度
    friction: 0.98,        // 摩擦系数
    ballSize: 40,          // 小球直径
    sensitivity: 0.15,     // 倾斜灵敏度
    maxSpeed: 20           // 最大速度限制
};

// 游戏状态
const gameState = {
    ball: {
        x: 0,
        y: 0,
        vx: 0,  // X轴速度
        vy: 0,  // Y轴速度
        radius: config.ballSize / 2
    },
    orientation: {
        beta: 0,    // 前后倾斜（-180° 到 180°）
        gamma: 0,   // 左右倾斜（-90° 到 90°）
        alpha: 0    // 绕Z轴旋转（0° 到 360°）
    },
    isRunning: false,
    lastTime: 0,
    obstacles: [],
    holes: [],
    stars: [],
    score: 0
};

// DOM元素
const ballEl = document.getElementById('ball');
const gameContainer = document.getElementById('gameContainer');
const startBtn = document.getElementById('startBtn');
const angleDisplay = document.getElementById('angleDisplay');
const speedDisplay = document.getElementById('speedDisplay');
const instructions = document.getElementById('instructions');

// 初始化游戏
function initGame() {
    // 重置游戏状态
    gameState.ball.vx = 0;
    gameState.ball.vy = 0;
    gameState.orientation.beta = 0;
    gameState.orientation.gamma = 0;
    gameState.orientation.alpha = 0;
    gameState.score = 0;

    // 设置小球初始位置（屏幕中央）
    gameState.ball.x = window.innerWidth / 2;
    gameState.ball.y = window.innerHeight / 2;

    // 设置小球样式
    ballEl.style.width = config.ballSize + 'px';
    ballEl.style.height = config.ballSize + 'px';

    // 更新小球位置
    updateBallPosition();

    // 清除旧的游戏元素
    clearGameElements();

    // 创建障碍物
    createObstacles();

    gameState.lastTime = Date.now();
}

// 清除旧的游戏元素
function clearGameElements() {
    // 移除所有黑洞
    const holes = document.querySelectorAll('.hole');
    holes.forEach(hole => hole.remove());

    // 移除所有星星
    const stars = document.querySelectorAll('[id^="star_"]');
    stars.forEach(star => star.remove());

    // 重置星星状态
    gameState.stars.forEach(star => {
        star.collected = false;
    });
}

// 创建障碍物和黑洞
function createObstacles() {
    gameState.obstacles = [];
    gameState.holes = [];
    gameState.stars = [];

    const width = window.innerWidth;
    const height = window.innerHeight;

    // 创建黑洞（4个角落）
    const holes = [
        { x: 50, y: 50, radius: 30 },
        { x: width - 50, y: 50, radius: 30 },
        { x: 50, y: height - 50, radius: 30 },
        { x: width - 50, y: height - 50, radius: 30 }
    ];

    holes.forEach(hole => {
        const holeEl = document.createElement('div');
        holeEl.className = 'hole';
        holeEl.style.width = hole.radius * 2 + 'px';
        holeEl.style.height = hole.radius * 2 + 'px';
        holeEl.style.left = (hole.x - hole.radius) + 'px';
        holeEl.style.top = (hole.y - hole.radius) + 'px';
        gameContainer.appendChild(holeEl);
        gameState.holes.push(hole);
    });

    // 创建星星（奖励点）
    for (let i = 0; i < 5; i++) {
        const star = {
            x: 100 + Math.random() * (width - 200),
            y: 100 + Math.random() * (height - 200),
            radius: 15,
            collected: false
        };
        gameState.stars.push(star);

        const starEl = document.createElement('div');
        starEl.innerHTML = '★';
        starEl.style.position = 'absolute';
        starEl.style.left = (star.x - star.radius) + 'px';
        starEl.style.top = (star.y - star.radius) + 'px';
        starEl.style.fontSize = star.radius * 2 + 'px';
        starEl.style.color = 'gold';
        starEl.style.textShadow = '0 0 10px rgba(255,215,0,0.8)';
        starEl.style.zIndex = '1';
        starEl.id = 'star_' + i;
        gameContainer.appendChild(starEl);
    }
}

// 重置游戏
function resetGame() {
    gameState.isRunning = false;

    // 移除方向监听
    window.removeEventListener('deviceorientation', handleOrientation);

    // 重置显示
    angleDisplay.textContent = '0°';
    speedDisplay.textContent = '0';

    // 重新初始化游戏
    initGame();

    // 显示开始按钮和说明
    instructions.style.display = 'block';
    startBtn.style.display = 'block';
}

// 游戏结束处理
function gameOver(reason) {
    gameState.isRunning = false;

    // 移除方向监听
    window.removeEventListener('deviceorientation', handleOrientation);

    // 显示游戏结束提示
    alert(reason + ' 游戏结束！点击确定重新开始。');

    // 重置游戏
    resetGame();
}

// 请求陀螺仪权限
function requestPermission() {
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {

        DeviceOrientationEvent.requestPermission()
            .then(permissionState => {
                if (permissionState === 'granted') {
                    startGame();
                } else {
                    alert('需要陀螺仪权限才能玩游戏哦~');
                }
            })
            .catch(console.error);
    } else {
        startGame();
    }
}

// 开始游戏
function startGame() {
    initGame();
    gameState.isRunning = true;
    instructions.style.display = 'none';

    // 监听设备方向
    window.addEventListener('deviceorientation', handleOrientation);

    // 开始游戏循环
    requestAnimationFrame(gameLoop);
}

// 处理方向数据
function handleOrientation(event) {
    gameState.orientation = {
        beta: event.beta || 0,     // 前后倾斜
        gamma: event.gamma || 0,   // 左右倾斜
        alpha: event.alpha || 0    // 方向
    };

    // 更新显示
    const tiltAngle = Math.sqrt(
        Math.pow(gameState.orientation.beta, 2) +
        Math.pow(gameState.orientation.gamma, 2)
    );
    angleDisplay.textContent = Math.round(tiltAngle) + '°';
}

// 游戏物理更新
function updatePhysics(deltaTime) {
    const { beta, gamma } = gameState.orientation;
    const { ball } = gameState;

    // 关键部分：将手机倾斜角度转换为加速度
    // gamma（左右倾斜）：控制X轴加速度
    // beta（前后倾斜）：控制Y轴加速度

    // 加速度计算（带灵敏度调节）
    const ax = gamma * config.sensitivity;
    const ay = beta * config.sensitivity;

    // 应用加速度（考虑时间间隔）
    const timeScale = deltaTime / 16; // 标准化时间
    ball.vx += ax * timeScale;
    ball.vy += ay * timeScale;

    // 应用重力效果
    ball.vx *= config.friction;
    ball.vy *= config.friction;

    // 速度限制
    const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
    if (speed > config.maxSpeed) {
        ball.vx = (ball.vx / speed) * config.maxSpeed;
        ball.vy = (ball.vy / speed) * config.maxSpeed;
    }

    // 更新位置
    ball.x += ball.vx;
    ball.y += ball.vy;

    // 边界碰撞检测
    const radius = ball.radius;
    if (ball.x < radius) {
        ball.x = radius;
        ball.vx = Math.abs(ball.vx) * 0.8; // 反弹并损失能量
    }
    if (ball.x > window.innerWidth - radius) {
        ball.x = window.innerWidth - radius;
        ball.vx = -Math.abs(ball.vx) * 0.8;
    }
    if (ball.y < radius) {
        ball.y = radius;
        ball.vy = Math.abs(ball.vy) * 0.8;
    }
    if (ball.y > window.innerHeight - radius) {
        ball.y = window.innerHeight - radius;
        ball.vy = -Math.abs(ball.vy) * 0.8;
    }

    // 更新速度显示
    const displaySpeed = Math.round(speed * 10) / 10;
    speedDisplay.textContent = displaySpeed;
}

// 碰撞检测
function checkCollisions() {
    const { ball } = gameState;

    // 检查黑洞碰撞（游戏结束）
    for (const hole of gameState.holes) {
        const dx = ball.x - hole.x;
        const dy = ball.y - hole.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < ball.radius + hole.radius) {
            gameOver('小球掉进黑洞了！');
            return;
        }
    }

    // 检查星星收集
    gameState.stars.forEach((star, index) => {
        if (!star.collected) {
            const dx = ball.x - star.x;
            const dy = ball.y - star.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < ball.radius + star.radius) {
                star.collected = true;
                const starEl = document.getElementById('star_' + index);
                if (starEl) {
                    starEl.style.opacity = '0.3';
                    starEl.style.transform = 'scale(0.5)';
                    starEl.style.transition = 'all 0.5s';
                }
                gameState.score++;

                // 得分效果
                if (gameState.score >= gameState.stars.length) {
                    setTimeout(() => {
                        alert('恭喜！收集了所有星星！🎉');
                        gameOver('成功完成游戏！');
                    }, 100);
                }
            }
        }
    });
}

// 更新小球位置
function updateBallPosition() {
    ballEl.style.left = (gameState.ball.x - gameState.ball.radius) + 'px';
    ballEl.style.top = (gameState.ball.y - gameState.ball.radius) + 'px';

    // 添加小球倾斜效果
    const tiltX = gameState.ball.vx * 0.5;
    const tiltY = gameState.ball.vy * 0.5;
    ballEl.style.transform = `translate(${tiltX}px, ${tiltY}px) scale(${1 + Math.abs(gameState.ball.vx + gameState.ball.vy) * 0.01})`;
}

// 游戏主循环
function gameLoop() {
    if (!gameState.isRunning) return;

    const currentTime = Date.now();
    const deltaTime = currentTime - gameState.lastTime;
    gameState.lastTime = currentTime;

    updatePhysics(deltaTime);
    checkCollisions();
    updateBallPosition();

    requestAnimationFrame(gameLoop);
}

// 窗口大小变化处理
window.addEventListener('resize', () => {
    if (!gameState.isRunning) {
        initGame();
    }
});

// 触摸设备兼容性：点击开始
startBtn.addEventListener('click', requestPermission);

// 防止滚动
document.addEventListener('touchmove', (e) => {
    e.preventDefault();
}, { passive: false });

// 初始显示
initGame();

// 演示模式（如果没有陀螺仪）
setTimeout(() => {
    if (!gameState.isRunning) {
        instructions.querySelector('p').innerHTML +=
            '<br><small>如果没有陀螺仪，可以使用键盘方向键演示</small>';

        // 键盘控制演示
        document.addEventListener('keydown', (e) => {
            if (!gameState.isRunning) return;

            switch (e.key) {
                case 'ArrowLeft': gameState.orientation.gamma = -20; break;
                case 'ArrowRight': gameState.orientation.gamma = 20; break;
                case 'ArrowUp': gameState.orientation.beta = -20; break;
                case 'ArrowDown': gameState.orientation.beta = 20; break;
            }
        });

        document.addEventListener('keyup', () => {
            gameState.orientation.gamma = 0;
            gameState.orientation.beta = 0;
        });
    }
}, 3000);