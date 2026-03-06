// 获取DOM元素
const fileInput = document.getElementById('fileInput');
const selectBtn = document.getElementById('selectBtn');
const dropArea = document.getElementById('dropArea');
const imagePreviews = document.getElementById('imagePreviews');
const recognizeBtn = document.getElementById('recognizeBtn');
const resultText = document.getElementById('resultText');
const copyBtn = document.getElementById('copyBtn');
const exportBtn = document.getElementById('exportBtn');
const clearBtn = document.getElementById('clearBtn');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const statusText = document.getElementById('statusText');
const languageSelect = document.getElementById('language');
const currentYearSpan = document.getElementById('currentYear');

// 设置当前年份
currentYearSpan.textContent = new Date().getFullYear();

// 存储上传的图片
let uploadedImages = [];

// 初始化拖拽排序
let sortable = new Sortable(imagePreviews, {
    animation: 150,
    handle: '.drag-handle',
    ghostClass: 'dragging',
    chosenClass: 'drag-over',
    onEnd: function () {
        // 重新排序数组以匹配DOM顺序
        const items = imagePreviews.querySelectorAll('.image-preview-item');
        const newOrder = Array.from(items).map(item =>
            uploadedImages.find(img => img.id === item.dataset.id)
        ).filter(Boolean);
        uploadedImages = newOrder;
    }
});

// 点击选择按钮触发文件输入
selectBtn.addEventListener('click', () => {
    fileInput.click();
});

// 文件选择处理
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFiles(Array.from(e.target.files));
    }
});

// 拖放区域事件处理
dropArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropArea.style.borderColor = 'var(--accent-color)';
    dropArea.style.backgroundColor = 'rgba(255, 0, 110, 0.1)';
});

dropArea.addEventListener('dragleave', () => {
    dropArea.style.borderColor = 'var(--primary-color)';
    dropArea.style.backgroundColor = '';
});

dropArea.addEventListener('drop', (e) => {
    e.preventDefault();
    dropArea.style.borderColor = 'var(--primary-color)';
    dropArea.style.backgroundColor = '';

    if (e.dataTransfer.files.length > 0) {
        handleFiles(Array.from(e.dataTransfer.files));
    }
});

// 处理选择的文件
function handleFiles(files) {
    // 过滤非图片文件
    const imageFiles = files.filter(file => file.type.match('image.*'));

    if (imageFiles.length === 0) {
        alert('请选择图片文件');
        return;
    }

    // 添加到上传图片数组
    imageFiles.forEach(file => {
        const id = 'img-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
        uploadedImages.push({
            id: id,
            file: file
        });

        // 显示图片预览
        const reader = new FileReader();
        reader.onload = (e) => {
            addImagePreview(id, e.target.result);
            recognizeBtn.disabled = false;
        };
        reader.readAsDataURL(file);
    });
}

// 添加图片预览
function addImagePreview(id, src) {
    const previewItem = document.createElement('div');
    previewItem.className = 'image-preview-item';
    previewItem.dataset.id = id;

    previewItem.innerHTML = `
                <img src="${src}" alt="预览">
                <button class="remove-btn" title="移除图片">×</button>
                <button class="drag-handle" title="拖动排序">↔</button>
            `;

    // 添加移除按钮事件
    const removeBtn = previewItem.querySelector('.remove-btn');
    removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeImage(id);
    });

    imagePreviews.appendChild(previewItem);
}

// 移除图片
function removeImage(id) {
    // 从数组中移除
    uploadedImages = uploadedImages.filter(img => img.id !== id);

    // 从DOM中移除
    const itemToRemove = imagePreviews.querySelector(`.image-preview-item[data-id="${id}"]`);
    if (itemToRemove) {
        itemToRemove.remove();
    }

    // 如果没有图片了，禁用识别按钮
    if (uploadedImages.length === 0) {
        recognizeBtn.disabled = true;
    }
}

// 识别按钮点击事件
recognizeBtn.addEventListener('click', async () => {
    if (uploadedImages.length === 0) return;

    // 显示进度条
    progressContainer.style.display = 'block';
    progressBar.style.width = '0%';
    statusText.textContent = '准备识别...';

    // 获取选择的语言
    const lang = languageSelect.value;

    // 清空结果文本框
    resultText.value = '';
    resultText.readOnly = false;

    // 禁用按钮防止重复点击
    recognizeBtn.disabled = true;
    recognizeBtn.textContent = '识别中...';

    try {
        // 按顺序识别每张图片
        for (let i = 0; i < uploadedImages.length; i++) {
            const image = uploadedImages[i];
            statusText.textContent = `正在识别图片 ${i + 1}/${uploadedImages.length}...`;

            // 识别当前图片
            const { data: { text } } = await Tesseract.recognize(
                image.file,
                lang,
                {
                    logger: m => {
                        // 更新进度
                        if (m.status === 'recognizing text') {
                            const totalProgress = (i + m.progress) / uploadedImages.length;
                            progressBar.style.width = `${Math.round(totalProgress * 100)}%`;
                            statusText.textContent = `识别图片 ${i + 1}/${uploadedImages.length}: ${Math.round(m.progress * 100)}%`;
                        }
                    }
                }
            );

            // 处理识别结果：智能处理空格和换行
            let processedText = text;
            if (lang.includes('chi')) {
                // 中文标点Unicode范围
                const chinesePunctuation = '\\u3000-\\u303F\\uFF00-\\uFFEF\\u2000-\\u206F';

                // 第一步：保护换行符
                processedText = processedText.replace(/\n/g, '{保护换行符}');

                // 第二步：处理汉字和标点间的空格
                processedText = processedText.replace(
                    new RegExp(`([\\u4e00-\\u9fa5${chinesePunctuation}])\\s+(?=[\\u4e00-\\u9fa5${chinesePunctuation}])`, 'g'),
                    '$1'
                );

                // 第三步：恢复换行符
                processedText = processedText.replace(/{保护换行符}/g, '\n');

                // 第四步：合并多余空行（保留1-2个换行作为段落分隔）
                processedText = processedText.replace(/\n{3,}/g, '\n\n');

                // 第五步：确保标点前无空格
                processedText = processedText.replace(
                    new RegExp(`\\s+([${chinesePunctuation}])`, 'g'),
                    '$1'
                );

                // 新增：替换错误的中英文符号（空格+英文符号 → 中文符号）
                processedText = processedText.replace(/\s*,\s*/g, '，');  // " , " → "，"
                processedText = processedText.replace(/\s*;\s*/g, '；');  // " ; " → "；"
                processedText = processedText.replace(/\s*:\s*/g, '：');  // " : " → "："
                processedText = processedText.replace(/\s*\?\s*/g, '？'); // " ? " → "？"
                processedText = processedText.replace(/\s*!\s*/g, '！');  // " ! " → "！"
                processedText = processedText.replace(/\s*"\s*/g, '“');   // 英文引号 → 中文引号（仅处理左半边）
                processedText = processedText.replace(/"\s*/g, '”');      // 英文引号 → 中文引号（右半边）
            }

            // 添加到结果文本框
            if (resultText.value) {
                resultText.value += '\n\n' + processedText;
            } else {
                resultText.value = processedText;
            }
        }

        // 识别完成
        statusText.textContent = `识别完成! 共识别了 ${uploadedImages.length} 张图片`;
        progressBar.style.width = '100%';

        // 启用操作按钮
        copyBtn.disabled = false;
        exportBtn.disabled = false;

    } catch (err) {
        console.error(err);
        statusText.textContent = '识别失败: ' + err.message;
    } finally {
        // 恢复按钮状态
        recognizeBtn.disabled = false;
        recognizeBtn.textContent = '开始识别';
    }
});

// 复制按钮点击事件
copyBtn.addEventListener('click', () => {
    resultText.select();
    document.execCommand('copy');

    // 显示复制成功提示
    const originalText = copyBtn.textContent;
    copyBtn.textContent = '已复制!';
    copyBtn.classList.add('pulse');
    setTimeout(() => {
        copyBtn.textContent = originalText;
        copyBtn.classList.remove('pulse');
    }, 2000);
});

// 导出按钮点击事件
exportBtn.addEventListener('click', () => {
    if (!resultText.value) return;

    // 创建Blob对象
    const blob = new Blob([resultText.value], { type: 'text/plain' });

    // 创建下载链接
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ocr_result.txt';

    // 触发下载
    document.body.appendChild(a);
    a.click();

    // 清理
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
});

// 清空按钮点击事件
clearBtn.addEventListener('click', () => {
    // 清空所有数据
    uploadedImages = [];
    imagePreviews.innerHTML = '';
    resultText.value = '';
    resultText.readOnly = true;
    recognizeBtn.disabled = true;
    copyBtn.disabled = true;
    exportBtn.disabled = true;
    progressContainer.style.display = 'none';
    statusText.textContent = '准备就绪';

    // 重置文件输入
    fileInput.value = '';
});


// 更多工具按钮点击事件
document.getElementById('moreToolsBtn').addEventListener('click', () => {
    window.open('/tool', '_blank');
});