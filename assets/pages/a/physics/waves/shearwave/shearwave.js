// 获取Canvas元素和上下文
const canvas = document.getElementById('waveCanvas');
const ctx = canvas.getContext('2d');

// 设置Canvas尺寸
function resizeCanvas() {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
}

// 初始调整尺寸
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// 波参数
let waveParams = {
    wavelength: 150,
    frequency: 0.03,
    amplitude: 40,
    nodeCount: 40,
    speed: 1.0,
    time: 0,
    isPaused: false,
    waveType: 'sine'
};

// 获取UI元素
const wavelengthSlider = document.getElementById('wavelength');
const wavelengthValue = document.getElementById('wavelengthValue');
const frequencySlider = document.getElementById('frequency');
const frequencyValue = document.getElementById('frequencyValue');
const amplitudeSlider = document.getElementById('amplitude');
const amplitudeValue = document.getElementById('amplitudeValue');
const nodeCountSlider = document.getElementById('nodeCount');
const nodeCountValue = document.getElementById('nodeCountValue');
const speedSlider = document.getElementById('speed');
const speedValue = document.getElementById('speedValue');
const waveOptions = document.querySelectorAll('.wave-option');
const pauseBtn = document.getElementById('pauseBtn');
const resetBtn = document.getElementById('resetBtn');

// 更新UI显示的值
function updateUIValues() {
    wavelengthValue.textContent = waveParams.wavelength;
    frequencyValue.textContent = waveParams.frequency.toFixed(2);
    amplitudeValue.textContent = waveParams.amplitude;
    nodeCountValue.textContent = waveParams.nodeCount;
    speedValue.textContent = waveParams.speed.toFixed(1);
}

// 初始化UI值
updateUIValues();

// 事件监听器
wavelengthSlider.addEventListener('input', function () {
    waveParams.wavelength = parseInt(this.value);
    updateUIValues();
});

frequencySlider.addEventListener('input', function () {
    waveParams.frequency = parseFloat(this.value);
    updateUIValues();
});

amplitudeSlider.addEventListener('input', function () {
    waveParams.amplitude = parseInt(this.value);
    updateUIValues();
});

nodeCountSlider.addEventListener('input', function () {
    waveParams.nodeCount = parseInt(this.value);
    updateUIValues();
});

speedSlider.addEventListener('input', function () {
    waveParams.speed = parseFloat(this.value);
    updateUIValues();
});

waveOptions.forEach(option => {
    option.addEventListener('click', function () {
        waveOptions.forEach(opt => opt.classList.remove('active'));
        this.classList.add('active');
        waveParams.waveType = this.getAttribute('data-type');
    });
});

pauseBtn.addEventListener('click', function () {
    waveParams.isPaused = !waveParams.isPaused;
    this.textContent = waveParams.isPaused ? '继续' : '暂停';
});

resetBtn.addEventListener('click', function () {
    waveParams.wavelength = 150;
    waveParams.frequency = 0.03;
    waveParams.amplitude = 40;
    waveParams.nodeCount = 40;
    waveParams.speed = 1.0;
    waveParams.time = 0;
    waveParams.isPaused = false;
    waveParams.waveType = 'sine';

    wavelengthSlider.value = waveParams.wavelength;
    frequencySlider.value = waveParams.frequency;
    amplitudeSlider.value = waveParams.amplitude;
    nodeCountSlider.value = waveParams.nodeCount;
    speedSlider.value = waveParams.speed;

    waveOptions.forEach(opt => {
        opt.classList.remove('active');
        if (opt.getAttribute('data-type') === 'sine') {
            opt.classList.add('active');
        }
    });

    pauseBtn.textContent = '暂停';

    updateUIValues();
});

// 计算波函数值
function waveFunction(x, time, type) {
    const k = 2 * Math.PI / waveParams.wavelength; // 波数
    const ω = 2 * Math.PI * waveParams.frequency; // 角频率

    let value;

    switch (type) {
        case 'sine':
            value = Math.sin(k * x - ω * time);
            break;
        case 'triangle':
            // 三角波近似
            value = Math.asin(Math.sin(k * x - ω * time)) * 2 / Math.PI;
            break;
        case 'square':
            // 方波
            value = Math.sign(Math.sin(k * x - ω * time));
            break;
        default:
            value = Math.sin(k * x - ω * time);
    }

    return value * waveParams.amplitude;
}

// 绘制波
function drawWave() {
    // 清除画布
    ctx.fillStyle = 'rgba(10, 20, 50, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const centerY = canvas.height / 2;
    const nodeSpacing = canvas.width / waveParams.nodeCount;

    // 绘制平衡位置参考线
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.moveTo(0, centerY);
    ctx.lineTo(canvas.width, centerY);
    ctx.stroke();
    ctx.setLineDash([]);

    // 绘制波传播方向箭头
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(79, 172, 254, 0.7)';
    ctx.lineWidth = 2;
    ctx.moveTo(canvas.width - 50, centerY - 30);
    ctx.lineTo(canvas.width - 20, centerY - 30);
    ctx.lineTo(canvas.width - 30, centerY - 40);
    ctx.moveTo(canvas.width - 20, centerY - 30);
    ctx.lineTo(canvas.width - 30, centerY - 20);
    ctx.stroke();

    // 绘制波传播方向文本
    ctx.fillStyle = 'rgba(79, 172, 254, 0.9)';
    ctx.font = '14px Arial';
    ctx.fillText('传播方向', canvas.width - 100, centerY - 45);

    // 绘制波
    ctx.beginPath();
    ctx.strokeStyle = '#4facfe';
    ctx.lineWidth = 3;

    for (let i = 0; i <= waveParams.nodeCount; i++) {
        const x = i * nodeSpacing;
        const y = centerY + waveFunction(x, waveParams.time, waveParams.waveType);

        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }

    ctx.stroke();

    // 绘制节点
    for (let i = 0; i <= waveParams.nodeCount; i++) {
        const x = i * nodeSpacing;
        const y = centerY + waveFunction(x, waveParams.time, waveParams.waveType);

        // 创建渐变颜色
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, 8);
        gradient.addColorStop(0, '#00f2fe');
        gradient.addColorStop(1, '#4facfe');

        ctx.beginPath();
        ctx.fillStyle = gradient;
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fill();

        // 绘制节点振动方向指示线
        if (i % 5 === 0) {
            const nextY = centerY + waveFunction(x, waveParams.time + 0.1, waveParams.waveType);
            const direction = nextY > y ? 1 : -1;

            ctx.beginPath();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.lineWidth = 1;
            ctx.moveTo(x, y);
            ctx.lineTo(x, y + direction * 15);
            ctx.stroke();

            // 绘制箭头
            ctx.beginPath();
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.moveTo(x - 3, y + direction * 12);
            ctx.lineTo(x + 3, y + direction * 12);
            ctx.lineTo(x, y + direction * 17);
            ctx.fill();
        }
    }

    // 绘制波峰和波谷标记
    for (let i = 0; i <= waveParams.nodeCount; i++) {
        const x = i * nodeSpacing;
        const y = centerY + waveFunction(x, waveParams.time, waveParams.waveType);

        // 标记波峰
        if (i > 0 && i < waveParams.nodeCount) {
            const prevY = centerY + waveFunction((i - 1) * nodeSpacing, waveParams.time, waveParams.waveType);
            const nextY = centerY + waveFunction((i + 1) * nodeSpacing, waveParams.time, waveParams.waveType);

            if (y < prevY && y < nextY) {

                ctx.fillStyle = 'rgba(255, 100, 100, 0.7)';
                ctx.fillText('波峰', x - 15, y + 25);
            } else if (y > prevY && y > nextY) {

                ctx.fillStyle = 'rgba(100, 255, 100, 0.7)';
                ctx.fillText('波谷', x - 15, y - 15);
            }
        }
    }

    // 如果不是暂停状态，更新时间
    if (!waveParams.isPaused) {
        waveParams.time += 0.02 * waveParams.speed;
    }
}

// 动画循环
function animate() {
    drawWave();
    requestAnimationFrame(animate);
}

// 启动动画
animate();