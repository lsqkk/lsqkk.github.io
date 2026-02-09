// 全局变量
let currentViewer = null;
let currentScene = null;
let scenesData = [];
let isUnlocked = localStorage.getItem('watermarkUnlocked') === 'true';
let isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// 初始化函数
function init() {
    // 检测设备类型
    detectDeviceType();

    // 加载场景数据
    loadScenesData();

    // 设置事件监听器
    setupEventListeners();

    // 检查水印状态
    checkWatermarkStatus();

    // 移动端初始化
    if (isMobile) {
        initMobileLayout();
    }
}

// 检测设备类型
function detectDeviceType() {
    isMobile = window.innerWidth <= 768;
    // 监听窗口大小变化
    window.addEventListener('resize', function () {
        isMobile = window.innerWidth <= 768;
    });
}

// 移动端布局初始化
function initMobileLayout() {
    // 移动端默认隐藏面板
    document.getElementById('leftPanel').style.display = 'none';
    document.getElementById('rightPanel').style.display = 'none';
}

// 加载场景数据
function loadScenesData() {
    fetch('scenes.json')
        .then(response => {
            if (!response.ok) {
                throw new Error('无法加载场景数据文件');
            }
            return response.json();
        })
        .then(data => {
            scenesData = data;
            // 渲染场景列表
            renderSceneList();

            // 默认显示第一个场景
            if (scenesData.length > 0) {
                loadScene(scenesData[0]);
            }
        })
        .catch(error => {
            console.error('加载场景数据失败:', error);
            // 如果加载失败，可以显示错误信息或使用备用方案
            document.getElementById('sceneList').innerHTML = '<p style="color: red; text-align: center;">加载场景数据失败，请检查scenes.json文件</p>';
        });
}

// 渲染场景列表
function renderSceneList(filter = '') {
    const sceneList = document.getElementById('sceneList');
    sceneList.innerHTML = '';

    const filteredScenes = scenesData.filter(scene =>
        scene.name.toLowerCase().includes(filter.toLowerCase()) ||
        scene.contributor.toLowerCase().includes(filter.toLowerCase())
    );

    if (filteredScenes.length === 0) {
        sceneList.innerHTML = '<p style="text-align: center; color: #666;">未找到匹配的场景</p>';
        return;
    }

    filteredScenes.forEach(scene => {
        const sceneItem = document.createElement('div');
        sceneItem.className = 'scene-item';
        if (currentScene && currentScene.name === scene.name) {
            sceneItem.classList.add('active');
        }

        // 删除图标，只显示地点名称和贡献者
        sceneItem.innerHTML = `
                    <div class="scene-thumb">
                        <i class="fas fa-map-marker-alt"></i>
                    </div>
                    <div class="scene-info">
                        <h4 class="scene-name">${scene.name}</h4>
                        <p class="scene-contributor">贡献者: ${scene.contributor}</p>
                    </div>
                `;

        sceneItem.addEventListener('click', () => {
            loadScene(scene);
            // 移动端点击后自动隐藏面板
            if (isMobile) {
                document.getElementById('leftPanel').classList.remove('panel-mobile-visible');
            }
        });

        sceneList.appendChild(sceneItem);
    });
}

// 加载场景
function loadScene(scene) {
    currentScene = scene;

    // 更新场景列表中的活动项
    document.querySelectorAll('.scene-item').forEach(item => {
        item.classList.remove('active');
    });

    // 查找并激活当前场景项
    const sceneItems = document.querySelectorAll('.scene-item');
    for (let i = 0; i < sceneItems.length; i++) {
        const name = sceneItems[i].querySelector('.scene-name').textContent;
        if (name === scene.name) {
            sceneItems[i].classList.add('active');
            break;
        }
    }

    // 创建或更新全景查看器
    if (currentViewer) {
        currentViewer.destroy();
    }

    // 处理图片路径 - 如果是移动设备且图片路径不是base64，则进行缩放处理
    let panoramaPath = scene.path;

    // 检查是否是移动设备且图片路径不是base64格式
    if (isMobile && !scene.path.startsWith('data:')) {
        // 添加移动端缩放参数
        panoramaPath = addMobileScaleParams(scene.path);
    }

    currentViewer = pannellum.viewer('panorama', {
        type: 'equirectangular',
        panorama: panoramaPath,
        autoLoad: true,
        showControls: true,
        autoRotate: true,
        hotSpots: []
    });

    // 更新水印
    updateWatermark(scene);

    // 添加自定义右键菜单项
    currentViewer.on('load', function () {
        addCustomContextMenuItem(currentViewer);
    });
}

// 为移动端添加图片缩放参数
function addMobileScaleParams(imagePath) {
    // 这里可以根据需要添加缩放参数
    // 例如，如果图片服务支持URL参数缩放，可以添加类似?width=4096的参数
    // 这里只是一个示例，具体实现取决于您的图片服务
    if (imagePath.includes('?')) {
        return imagePath + '&mobile=1&scale=0.5';
    } else {
        return imagePath + '?mobile=1&scale=0.5';
    }
}

// 处理大图片 - 使用Canvas缩放图片
function resizeImageForMobile(imageDataUrl, maxWidth = 4096, callback) {
    const img = new Image();
    img.onload = function () {
        // 计算缩放比例
        const scale = Math.min(1, maxWidth / img.width);

        // 如果不需要缩放，直接返回原图
        if (scale >= 1) {
            callback(imageDataUrl);
            return;
        }

        // 计算新尺寸
        const newWidth = Math.floor(img.width * scale);
        const newHeight = Math.floor(img.height * scale);

        // 创建Canvas进行缩放
        const canvas = document.createElement('canvas');
        canvas.width = newWidth;
        canvas.height = newHeight;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, newWidth, newHeight);

        // 获取缩放后的图片数据
        const resizedDataUrl = canvas.toDataURL('image/jpeg', 0.9);
        callback(resizedDataUrl);
    };
    img.src = imageDataUrl;
}

// 更新水印
function updateWatermark(scene) {
    const watermark = document.getElementById('watermark');

    if (isUnlocked) {
        watermark.style.display = 'none';
        return;
    }

    // 只有预置场景显示水印，用户上传的不显示
    if (scene && scene.contributor) {
        // 在水印中添加地点信息
        watermark.textContent = `交大360° | 夸克博客 | ${scene.contributor} | ${scene.name}`;
        watermark.style.display = 'block';
    } else {
        watermark.style.display = 'none';
    }
}

// 检查水印状态
function checkWatermarkStatus() {
    isUnlocked = localStorage.getItem('watermarkUnlocked') === 'true';

    if (isUnlocked) {
        document.getElementById('watermark').style.display = 'none';
    }
}

// 设置事件监听器
function setupEventListeners() {
    // 搜索功能
    document.getElementById('searchInput').addEventListener('input', function (e) {
        renderSceneList(e.target.value);
    });

    // 上传功能
    document.getElementById('uploadArea').addEventListener('click', function () {
        document.getElementById('fileInput').click();
    });

    document.getElementById('fileInput').addEventListener('change', function (e) {
        if (e.target.files.length > 0) {
            handleFileUpload(e.target.files[0]);
        }
    });

    // 拖拽上传
    document.body.addEventListener('dragover', function (e) {
        e.preventDefault();
        document.getElementById('uploadArea').style.borderColor = 'var(--primary-color)';
        document.getElementById('uploadArea').style.background = 'rgba(52, 152, 219, 0.1)';
    });

    document.body.addEventListener('dragleave', function (e) {
        if (!document.getElementById('uploadArea').contains(e.relatedTarget)) {
            document.getElementById('uploadArea').style.borderColor = '#ddd';
            document.getElementById('uploadArea').style.background = 'rgba(240, 240, 240, 0.5)';
        }
    });

    document.body.addEventListener('drop', function (e) {
        e.preventDefault();
        document.getElementById('uploadArea').style.borderColor = '#ddd';
        document.getElementById('uploadArea').style.background = 'rgba(240, 240, 240, 0.5)';

        if (e.dataTransfer.files.length > 0) {
            handleFileUpload(e.dataTransfer.files[0]);
        }
    });

    // 桌面端面板折叠/展开
    document.getElementById('collapseLeft').addEventListener('click', function () {
        togglePanel('leftPanel', 'toggleLeft');
    });

    document.getElementById('collapseRight').addEventListener('click', function () {
        togglePanel('rightPanel', 'toggleRight');
    });

    document.getElementById('toggleLeft').addEventListener('click', function () {
        togglePanel('leftPanel', 'toggleLeft');
    });

    document.getElementById('toggleRight').addEventListener('click', function () {
        togglePanel('rightPanel', 'toggleRight');
    });

    // 移动端面板切换
    document.getElementById('mobileMenuToggle').addEventListener('click', function () {
        toggleMobilePanel('leftPanel');
    });

    document.getElementById('mobileInfoToggle').addEventListener('click', function () {
        toggleMobilePanel('rightPanel');
    });

    // 密码对话框
    document.getElementById('confirmPassword').addEventListener('click', function () {
        verifyPassword();
    });

    document.getElementById('cancelPassword').addEventListener('click', function () {
        document.getElementById('passwordDialog').style.display = 'none';
    });

    document.getElementById('passwordInput').addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            verifyPassword();
        }
    });

    // 右键菜单
    document.body.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        showContextMenu(e.pageX, e.pageY);
    });

    document.body.addEventListener('click', function () {
        hideContextMenu();
    });

    // 双击去除水印对话框
    document.getElementById('watermark').addEventListener('dblclick', function () {
        if (!isUnlocked) {
            document.getElementById('passwordDialog').style.display = 'flex';
        }
    });

    // 修复可编辑内容中的链接点击问题
    document.getElementById('editableContent').addEventListener('click', function (e) {
        if (e.target.tagName === 'A') {
            // 如果点击的是链接，不阻止默认行为，允许跳转
            e.stopPropagation();
        }
    });
}

// 处理文件上传
function handleFileUpload(file) {
    if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const base64data = e.target.result;

            // 如果是移动设备，对上传的图片进行缩放
            if (isMobile) {
                resizeImageForMobile(base64data, 4096, function (resizedData) {
                    createTempScene(resizedData);
                });
            } else {
                createTempScene(base64data);
            }
        };
        reader.readAsDataURL(file);
    } else {
        alert('请上传图片文件');
    }
}

// 创建临时场景
function createTempScene(imageData) {
    // 创建临时场景对象
    const tempScene = {
        name: '上传的图片',
        contributor: '用户上传',
        path: imageData
    };

    // 加载场景
    loadScene(tempScene);

    // 添加到场景列表顶部
    scenesData.unshift(tempScene);
    renderSceneList();

    // 用户上传的图片不显示水印
    document.getElementById('watermark').style.display = 'none';
}

// 切换面板显示/隐藏（桌面端）
function togglePanel(panelId, toggleBtnId) {
    const panel = document.getElementById(panelId);
    const toggleBtn = document.getElementById(toggleBtnId);

    if (panel.style.display === 'none') {
        panel.style.display = 'flex';
        toggleBtn.innerHTML = panelId === 'leftPanel' ?
            '<i class="fas fa-chevron-right"></i>' :
            '<i class="fas fa-chevron-left"></i>';
    } else {
        panel.style.display = 'none';
        toggleBtn.innerHTML = panelId === 'leftPanel' ?
            '<i class="fas fa-chevron-left"></i>' :
            '<i class="fas fa-chevron-right"></i>';
    }
}

// 切换面板显示/隐藏（移动端）
function toggleMobilePanel(panelId) {
    const panel = document.getElementById(panelId);

    if (panel.classList.contains('panel-mobile-visible')) {
        panel.classList.remove('panel-mobile-visible');
    } else {
        // 隐藏其他面板
        document.getElementById('leftPanel').classList.remove('panel-mobile-visible');
        document.getElementById('rightPanel').classList.remove('panel-mobile-visible');

        // 显示当前面板
        panel.classList.add('panel-mobile-visible');
    }
}

// 验证密码 (安全API版本)
async function verifyPassword() {
    const password = document.getElementById('passwordInput').value;
    const errorMsg = document.getElementById('passwordError');
    const submitBtn = document.getElementById('passwordSubmitBtn'); // 假设你的提交按钮有这个ID，用于防止重复提交

    // 可选：添加防重复提交和加载状态
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = '验证中...';
    }
    errorMsg.style.display = 'none'; // 先隐藏错误信息

    try {
        // 1. 计算用户输入密码的SHA-256哈希 (与之前算法保持一致)
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // 2. 调用Vercel安全API进行验证
        const response = await fetch('https://api.130923.xyz/api/admin-auth', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ passwordHash: hashHex })
        });

        const result = await response.json();

        // 3. 根据API返回结果处理
        if (response.ok && result.success) {
            // 密码正确
            isUnlocked = true;
            localStorage.setItem('watermarkUnlocked', 'true');
            document.getElementById('watermark').style.display = 'none';
            document.getElementById('passwordDialog').style.display = 'none';
            document.getElementById('passwordInput').value = ''; // 清空输入框
            // 解锁成功后的其他操作...
        } else {
            // 密码错误 (API返回 401 或其他错误)
            errorMsg.textContent = result.error || '密码错误，请重试。';
            errorMsg.style.display = 'block';
            document.getElementById('passwordInput').value = ''; // 清空输入框
            document.getElementById('passwordInput').focus(); // 聚焦到输入框，方便重试
        }

    } catch (error) {
        // 网络错误或API异常
        console.error('验证过程出错:', error);
        errorMsg.textContent = '网络错误或验证服务异常，请稍后重试。';
        errorMsg.style.display = 'block';
    } finally {
        // 无论成功失败，都恢复按钮状态
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = '解锁'; // 恢复按钮原始文字
        }
    }
}
// 显示上下文菜单
function showContextMenu(x, y) {
    // 这里可以添加自定义右键菜单项
    // 暂时使用浏览器默认的右键菜单
}

// 隐藏上下文菜单
function hideContextMenu() {
    // 隐藏自定义右键菜单
}

// 添加自定义右键菜单项到全景查看器
function addCustomContextMenuItem(viewer) {
    viewer.on('contextmenu', function (e) {
        // 这里可以添加自定义菜单项
        // 由于Pannellum的限制，可能需要更复杂的实现
    });
}

// 下载当前页面
function downloadPage() {
    const htmlContent = document.documentElement.outerHTML;
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '交大360°全景图.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// 页面加载完成后初始化
window.addEventListener('DOMContentLoaded', init);