document.addEventListener('DOMContentLoaded', function () {
    // 文件上传功能
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const uploadPreview = document.getElementById('uploadPreview');

    uploadArea.addEventListener('click', function () {
        fileInput.click();
    });

    uploadArea.addEventListener('dragover', function (e) {
        e.preventDefault();
        uploadArea.style.borderColor = '#ff6b35';
        uploadArea.style.background = 'rgba(255, 107, 53, 0.1)';
    });

    uploadArea.addEventListener('dragleave', function () {
        uploadArea.style.borderColor = 'var(--card-border)';
        uploadArea.style.background = 'transparent';
    });

    uploadArea.addEventListener('drop', function (e) {
        e.preventDefault();
        uploadArea.style.borderColor = 'var(--card-border)';
        uploadArea.style.background = 'transparent';

        const files = e.dataTransfer.files;
        handleFiles(files);
    });

    fileInput.addEventListener('change', function () {
        handleFiles(this.files);
    });

    // 表单提交
    document.getElementById('reportForm').addEventListener('submit', function (e) {
        e.preventDefault();
        submitReport();
    });
});

// 处理上传的文件
function handleFiles(files) {
    const uploadPreview = document.getElementById('uploadPreview');

    for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // 检查文件类型
        if (!file.type.match('image.*') && !file.type.match('video.*')) {
            alert('请上传图片或视频文件');
            continue;
        }

        // 检查文件大小 (限制为10MB)
        if (file.size > 10 * 1024 * 1024) {
            alert('文件大小不能超过10MB');
            continue;
        }

        const reader = new FileReader();

        reader.onload = function (e) {
            const previewItem = document.createElement('div');
            previewItem.className = 'preview-item';

            if (file.type.match('image.*')) {
                previewItem.innerHTML = `
                            <img src="${e.target.result}" class="preview-img" alt="预览">
                            <button type="button" class="remove-btn" onclick="removePreview(this)">×</button>
                        `;
            } else if (file.type.match('video.*')) {
                previewItem.innerHTML = `
                            <video src="${e.target.result}" class="preview-img" controls></video>
                            <button type="button" class="remove-btn" onclick="removePreview(this)">×</button>
                        `;
            }

            uploadPreview.appendChild(previewItem);
        };

        reader.readAsDataURL(file);
    }

    // 清空文件输入，允许重复选择相同文件
    document.getElementById('fileInput').value = '';
}

// 移除预览
function removePreview(button) {
    const previewItem = button.parentElement;
    previewItem.remove();
}

// 获取当前位置
function getCurrentLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            function (position) {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;

                // 在实际应用中，这里会调用逆地理编码API获取地址
                // 这里使用数据
                document.getElementById('reportLocation').value = `经度: ${lng.toFixed(6)}, 纬度: ${lat.toFixed(6)}`;

                alert('位置获取成功！');
            },
            function (error) {
                alert('无法获取位置信息：' + error.message);
            }
        );
    } else {
        alert('浏览器不支持地理位置功能');
    }
}

// 提交上报
function submitReport() {
    const title = document.getElementById('reportTitle').value;
    const location = document.getElementById('reportLocation').value;
    const type = document.getElementById('reportType').value;
    const severity = document.getElementById('reportSeverity').value;
    const description = document.getElementById('reportDescription').value;
    const name = document.getElementById('reporterName').value;
    const phone = document.getElementById('reporterPhone').value;

    // 简单验证
    if (!title || !location || !type || !severity || !description || !name || !phone) {
        alert('请填写所有必填字段');
        return;
    }

    // 在实际应用中，这里会将数据发送到服务器
    // 这里只是提交成功

    // 创建新的历史记录
    const historyList = document.getElementById('historyList');
    const now = new Date();
    const timeStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    const historyItem = document.createElement('div');
    historyItem.className = 'history-item';
    historyItem.innerHTML = `
                <div class="history-header">
                    <div class="history-title">${title}</div>
                    <div class="history-time">${timeStr}</div>
                </div>
                <div class="history-desc">${description}</div>
                <span class="history-status status-pending">处理中</span>
            `;

    historyList.insertBefore(historyItem, historyList.firstChild);

    // 清空表单
    document.getElementById('reportForm').reset();
    document.getElementById('uploadPreview').innerHTML = '';

    // 隐藏空状态
    document.getElementById('emptyHistory').style.display = 'none';

    alert('火情上报提交成功！我们会尽快处理。');
}