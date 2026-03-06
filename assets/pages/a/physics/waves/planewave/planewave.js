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
    wavelength: 50,
    frequency: 0.05,
    amplitude: 1.0,
    time: 0,
    isPaused: false,
    colorScheme: 'blue'
};

// 波源位置（Canvas中心）
let sourceX, sourceY;

// 更新波源位置
function updateSourcePosition() {
    sourceX = canvas.width / 2;
    sourceY = canvas.height / 2;
}

// 初始化波源位置
updateSourcePosition();

// 获取UI元素
const wavelengthSlider = document.getElementById('wavelength');
const wavelengthValue = document.getElementById('wavelengthValue');
const frequencySlider = document.getElementById('frequency');
const frequencyValue = document.getElementById('frequencyValue');
const amplitudeSlider = document.getElementById('amplitude');
const amplitudeValue = document.getElementById('amplitudeValue');
const colorOptions = document.querySelectorAll('.color-option');
const pauseBtn = document.getElementById('pauseBtn');
const resetBtn = document.getElementById('resetBtn');

// 更新UI显示的值
function updateUIValues() {
    wavelengthValue.textContent = waveParams.wavelength;
    frequencyValue.textContent = waveParams.frequency.toFixed(2);
    amplitudeValue.textContent = waveParams.amplitude.toFixed(1);
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
    waveParams.amplitude = parseFloat(this.value);
    updateUIValues();
});

colorOptions.forEach(option => {
    option.addEventListener('click', function () {
        colorOptions.forEach(opt => opt.classList.remove('active'));
        this.classList.add('active');
        waveParams.colorScheme = this.getAttribute('data-scheme');
    });
});

pauseBtn.addEventListener('click', function () {
    waveParams.isPaused = !waveParams.isPaused;
    this.textContent = waveParams.isPaused ? '继续' : '暂停';
});

resetBtn.addEventListener('click', function () {
    waveParams.wavelength = 50;
    waveParams.frequency = 0.05;
    waveParams.amplitude = 1.0;
    waveParams.time = 0;
    waveParams.isPaused = false;

    wavelengthSlider.value = waveParams.wavelength;
    frequencySlider.value = waveParams.frequency;
    amplitudeSlider.value = waveParams.amplitude;
    pauseBtn.textContent = '暂停';

    updateUIValues();
});

// 根据颜色方案获取颜色
function getColor(intensity) {
    const r = Math.max(0, Math.min(255, Math.floor(intensity * 255)));

    switch (waveParams.colorScheme) {
        case 'blue':
            return `rgb(0, ${r}, 255)`;
        case 'green':
            return `rgb(0, 255, ${r})`;
        case 'red':
            return `rgb(255, ${r}, 0)`;
        default:
            return `rgb(0, ${r}, 255)`;
    }
}

// 绘制波
function drawWave() {
    // 清除画布
    ctx.fillStyle = '#16213e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 更新波源位置
    updateSourcePosition();

    // 绘制波
    const imageData = ctx.createImageData(canvas.width, canvas.height);
    const data = imageData.data;

    for (let x = 0; x < canvas.width; x++) {
        for (let y = 0; y < canvas.height; y++) {
            // 计算到波源的距离
            const dx = x - sourceX;
            const dy = y - sourceY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // 计算波的相位
            const phase = (2 * Math.PI * distance / waveParams.wavelength) - (2 * Math.PI * waveParams.frequency * waveParams.time);

            // 计算波的高度（用于颜色）
            const waveHeight = Math.sin(phase) * waveParams.amplitude;

            // 将波高转换为颜色强度 (0-1)
            const intensity = (waveHeight + 1) / 2;

            // 计算像素索引
            const index = (y * canvas.width + x) * 4;

            // 获取颜色
            const color = getColor(intensity);

            // 解析颜色值
            const colorValues = color.match(/\d+/g);

            // 设置像素颜色
            data[index] = parseInt(colorValues[0]);     // R
            data[index + 1] = parseInt(colorValues[1]); // G
            data[index + 2] = parseInt(colorValues[2]); // B
            data[index + 3] = 255;                      // A
        }
    }

    // 将图像数据放回画布
    ctx.putImageData(imageData, 0, 0);

    // 如果不是暂停状态，更新时间
    if (!waveParams.isPaused) {
        waveParams.time += 0.05;
    }
}

// 动画循环
function animate() {
    drawWave();
    requestAnimationFrame(animate);
}

// 启动动画
animate();