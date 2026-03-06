// 设置当前年份
document.getElementById('currentYear').textContent = new Date().getFullYear();

// DOM元素
const fileInput = document.getElementById('fileInput');
const uploadArea = document.getElementById('uploadArea');
const dragDropHint = document.getElementById('dragDropHint');
const imagePreview = document.getElementById('imagePreview');
const gridOverlay = document.getElementById('gridOverlay');
const gridSizeSlider = document.getElementById('gridSize');
const gridSizeValue = document.getElementById('gridSizeValue');
const generateBtn = document.getElementById('generateBtn');
const copyBtn = document.getElementById('copyBtn');
const moreToolsBtn = document.getElementById('moreToolsBtn');
const emojiResult = document.getElementById('emojiResult');

// Emoji配置 - 便于后续添加
const emojiConfig = [
    { name: '蓝色圆圈', emoji: '🔵', color: [0, 0, 255], shape: 'circle' },
    { name: '蓝色方块', emoji: '🟦', color: [0, 0, 255], shape: 'square' },
    { name: '绿色圆圈', emoji: '🟢', color: [0, 128, 0], shape: 'circle' },
    { name: '绿色方块', emoji: '🟩', color: [0, 128, 0], shape: 'square' },
    { name: '绿色书本', emoji: '📗', color: [0, 150, 0], shape: 'other' },
    { name: '红色圆圈', emoji: '🔴', color: [255, 0, 0], shape: 'circle' },
    { name: '红色方块', emoji: '🟥', color: [255, 0, 0], shape: 'square' },
    { name: '黄色圆圈', emoji: '🟡', color: [255, 255, 0], shape: 'circle' },
    { name: '浅黄色', emoji: '💛', color: [255, 230, 100], shape: 'other' },
    { name: '深黄色', emoji: '😋', color: [255, 200, 50], shape: 'other' },
    { name: '黄色方块', emoji: '🟨', color: [255, 255, 0], shape: 'square' },
    { name: '橙色圆圈', emoji: '🟠', color: [255, 165, 0], shape: 'circle' },
    { name: '橙色方块', emoji: '🟧', color: [255, 165, 0], shape: 'square' },
    { name: '紫色圆圈', emoji: '🟣', color: [128, 0, 128], shape: 'circle' },
    { name: '紫色方块', emoji: '🟪', color: [128, 0, 128], shape: 'square' },
    { name: '棕色圆圈', emoji: '🟤', color: [165, 42, 42], shape: 'circle' },
    { name: '棕色方块', emoji: '🟫', color: [165, 42, 42], shape: 'square' },
    { name: '黑色圆圈', emoji: '⚫', color: [0, 0, 0], shape: 'circle' },
    { name: '黑色方块', emoji: '⬛', color: [0, 0, 0], shape: 'square' },
    { name: '白色圆圈', emoji: '⚪', color: [255, 255, 255], shape: 'circle' },
    { name: '白色方块', emoji: '⬜', color: [255, 255, 255], shape: 'square' },
    { name: '灰色方块', emoji: '◽', color: [200, 200, 200], shape: 'square' }
];

// 当前图片和网格设置
let currentImage = null;
let gridSize = parseInt(gridSizeSlider.value);

// 事件监听器
fileInput.addEventListener('change', handleImageUpload);
uploadArea.addEventListener('click', () => fileInput.click());
uploadArea.addEventListener('dragover', handleDragOver);
uploadArea.addEventListener('dragleave', handleDragLeave);
uploadArea.addEventListener('drop', handleDrop);
gridSizeSlider.addEventListener('input', updateGridSize);
generateBtn.addEventListener('click', generateEmojiMatrix);
copyBtn.addEventListener('click', copyToClipboard);
moreToolsBtn.addEventListener('click', () => {
    window.location.href = '/tool';
});

// 处理拖拽相关事件
function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    dragDropHint.classList.add('active');
    uploadArea.classList.add('active');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    dragDropHint.classList.remove('active');
    uploadArea.classList.remove('active');
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    dragDropHint.classList.remove('active');
    uploadArea.classList.remove('active');

    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type.startsWith('image/')) {
        fileInput.files = files;
        handleImageUpload({ target: fileInput });
    }
}

// 处理图片上传
function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        imagePreview.src = e.target.result;
        imagePreview.onload = function () {
            currentImage = imagePreview;
            imagePreview.style.display = 'block';
            generateBtn.disabled = false;
            updateGridOverlay();
        };
    };
    reader.readAsDataURL(file);
}

// 更新网格大小
function updateGridSize() {
    gridSize = parseInt(gridSizeSlider.value);
    gridSizeValue.textContent = gridSize;
    if (currentImage) {
        updateGridOverlay();
    }
}

// 更新网格覆盖层
function updateGridOverlay() {
    const canvas = gridOverlay;
    const ctx = canvas.getContext('2d');

    // 设置canvas尺寸与图片相同
    canvas.width = currentImage.width;
    canvas.height = currentImage.height;
    canvas.style.display = 'block';

    // 计算网格参数
    const cellWidth = canvas.width / gridSize;
    const cellHeight = cellWidth; // 保持正方形
    const rows = Math.floor(canvas.height / cellHeight);

    // 绘制网格线
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
    ctx.lineWidth = 1;

    // 垂直线
    for (let i = 0; i <= gridSize; i++) {
        const x = i * cellWidth;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, rows * cellHeight);
        ctx.stroke();
    }

    // 水平线
    for (let j = 0; j <= rows; j++) {
        const y = j * cellHeight;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
}

// 生成Emoji矩阵
function generateEmojiMatrix() {
    if (!currentImage) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // 设置canvas尺寸与图片相同
    canvas.width = currentImage.width;
    canvas.height = currentImage.height;

    // 绘制图片到canvas
    ctx.drawImage(currentImage, 0, 0, canvas.width, canvas.height);

    // 计算网格参数
    const cellWidth = canvas.width / gridSize;
    const cellHeight = cellWidth; // 保持正方形
    const rows = Math.floor(canvas.height / cellHeight);

    let emojiMatrix = '';

    // 遍历每个网格单元
    for (let j = 0; j < rows; j++) {
        let rowEmojis = '';

        for (let i = 0; i < gridSize; i++) {
            // 获取当前网格单元的图像数据
            const x = i * cellWidth;
            const y = j * cellHeight;
            const imageData = ctx.getImageData(x, y, cellWidth, cellHeight);

            // 计算平均颜色
            const avgColor = getAverageColor(imageData);

            // 找到最接近的Emoji
            const emoji = findClosestEmoji(avgColor);

            rowEmojis += emoji;
        }

        emojiMatrix += rowEmojis + '\n';
    }

    // 显示结果
    emojiResult.textContent = emojiMatrix;
    copyBtn.disabled = false;

    // 滚动到结果区域
    emojiResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// 计算图像数据的平均颜色
function getAverageColor(imageData) {
    const data = imageData.data;
    let r = 0, g = 0, b = 0, count = 0;

    // 跳过透明像素
    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 0) { // 检查alpha通道
            r += data[i];
            g += data[i + 1];
            b += data[i + 2];
            count++;
        }
    }

    if (count === 0) return [0, 0, 0]; // 全透明则返回黑色

    return [
        Math.round(r / count),
        Math.round(g / count),
        Math.round(b / count)
    ];
}

// 找到最接近的Emoji
function findClosestEmoji(rgb) {
    let minDistance = Infinity;
    let closestEmoji = '⬛';

    for (const item of emojiConfig) {
        const distance = colorDistance(rgb, item.color);
        if (distance < minDistance) {
            minDistance = distance;
            closestEmoji = item.emoji;
        }
    }

    return closestEmoji;
}

// 计算颜色距离 (欧几里得距离)
function colorDistance(rgb1, rgb2) {
    const dr = rgb1[0] - rgb2[0];
    const dg = rgb1[1] - rgb2[1];
    const db = rgb1[2] - rgb2[2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
}

// 复制到剪贴板
function copyToClipboard() {
    const text = emojiResult.textContent;
    navigator.clipboard.writeText(text).then(() => {
        const originalText = copyBtn.innerHTML;
        copyBtn.innerHTML = '<i class="fas fa-check"></i> 已复制';
        setTimeout(() => {
            copyBtn.innerHTML = originalText;
        }, 2000);
    }).catch(err => {
        console.error('复制失败: ', err);
    });
}