// JSON配置编辑器应用
document.addEventListener('DOMContentLoaded', function () {
    // 全局变量
    let currentFile = null;
    let currentData = null;
    let editor = null;
    let isModified = false;
    let files = [];

    // DOM元素
    const fileList = document.getElementById('fileList');
    const fileCount = document.getElementById('fileCount');
    const directoryPath = document.getElementById('directoryPath');
    const currentFileTitle = document.getElementById('currentFile');
    const fileSize = document.getElementById('fileSize');
    const fileStatus = document.getElementById('fileStatus');
    const statusMessage = document.getElementById('statusMessage');
    const searchInput = document.getElementById('searchInput');

    // 按钮
    const refreshBtn = document.getElementById('refreshBtn');
    const createBtn = document.getElementById('createBtn');
    const saveBtn = document.getElementById('saveBtn');
    const validateBtn = document.getElementById('validateBtn');

    // 模式按钮
    const modeButtons = document.querySelectorAll('.mode-btn');

    // 模态框
    const createModal = document.getElementById('createModal');
    const deleteModal = document.getElementById('deleteModal');
    const notification = document.getElementById('notification');

    // 初始化JSON编辑器
    function initJSONEditor() {
        const container = document.getElementById('jsoneditor');

        // 创建编辑器
        editor = new JSONEditor(container, {
            mode: 'tree',
            modes: ['tree', 'code', 'preview'],
            onEditable: function (node) {
                // 所有节点都可编辑
                return true;
            },
            onChange: function () {
                if (currentFile && !isModified) {
                    isModified = true;
                    updateFileStatus('modified');
                }
            },
            search: false,
            history: true,
            theme: 'bootstrap4'
        });
    }

    // 加载文件列表
    function loadFileList() {
        fileList.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> 加载中...</div>';

        fetch('/api/files')
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    files = data.data;
                    renderFileList(files);
                    fileCount.textContent = data.count;
                    directoryPath.textContent = data.directory;
                } else {
                    showError('加载文件列表失败: ' + data.error);
                }
            })
            .catch(error => {
                showError('网络错误: ' + error.message);
            });
    }

    // 渲染文件列表
    function renderFileList(filesToRender) {
        if (filesToRender.length === 0) {
            fileList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-folder-open"></i>
                    <p>没有JSON文件</p>
                    <p>点击"新建文件"按钮创建第一个配置文件</p>
                </div>
            `;
            return;
        }

        fileList.innerHTML = '';

        filesToRender.forEach(file => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            if (currentFile === file.name) {
                fileItem.classList.add('active');
            }

            // 格式化文件大小
            const size = formatFileSize(file.size);

            // 格式化时间
            const date = new Date(file.lastModified * 1000);
            const timeString = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();

            // 检查是否有错误
            const hasError = file.error;

            fileItem.innerHTML = `
                <div class="file-info">
                    <div class="file-name">
                        <i class="fas fa-file-code"></i>
                        ${file.name}
                        ${hasError ? '<i class="fas fa-exclamation-circle" style="color: #f56565;"></i>' : ''}
                    </div>
                    <div class="file-meta">
                        <span>${size}</span>
                        <span>${timeString}</span>
                        ${hasError ? '<span style="color: #f56565;">错误</span>' :
                    file.keys.length > 0 ? `<span>${file.keys.length} 个键</span>` : ''}
                    </div>
                </div>
                <div class="file-actions">
                    <button class="file-action-btn" data-action="validate" data-file="${file.name}" title="验证">
                        <i class="fas fa-check-circle"></i>
                    </button>
                    <button class="file-action-btn" data-action="delete" data-file="${file.name}" title="删除">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            `;

            // 点击文件项
            fileItem.addEventListener('click', (e) => {
                if (!e.target.closest('.file-action-btn')) {
                    selectFile(file.name);
                }
            });

            // 文件操作按钮
            const actionButtons = fileItem.querySelectorAll('.file-action-btn');
            actionButtons.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const action = btn.getAttribute('data-action');
                    const filename = btn.getAttribute('data-file');

                    if (action === 'validate') {
                        validateFile(filename);
                    } else if (action === 'delete') {
                        showDeleteModal(filename);
                    }
                });
            });

            fileList.appendChild(fileItem);
        });
    }

    // 选择文件
    function selectFile(filename) {
        if (currentFile === filename) return;

        // 检查当前文件是否有未保存的修改
        if (isModified && currentFile) {
            if (!confirm(`文件 ${currentFile} 有未保存的修改。是否保存？`)) {
                // 如果不保存，继续加载新文件
                loadFileContent(filename);
            } else {
                saveFile(() => {
                    loadFileContent(filename);
                });
            }
        } else {
            loadFileContent(filename);
        }
    }

    // 加载文件内容
    function loadFileContent(filename) {
        showStatus('正在加载文件...', 'info');

        fetch(`/api/file/${encodeURIComponent(filename)}`)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // 更新当前文件信息
                    currentFile = filename;
                    currentData = data.data;

                    // 更新UI
                    currentFileTitle.textContent = filename;
                    fileSize.textContent = formatFileSize(data.size);
                    updateFileStatus('clean');

                    // 设置编辑器内容
                    editor.set(data.data);

                    // 高亮当前文件项
                    document.querySelectorAll('.file-item').forEach(item => {
                        item.classList.remove('active');
                        if (item.querySelector(`[data-file="${filename}"]`)) {
                            item.classList.add('active');
                        }
                    });

                    // 启用按钮
                    saveBtn.disabled = false;
                    validateBtn.disabled = false;

                    // 更新状态
                    isModified = false;
                    showStatus('文件加载成功', 'success');

                } else {
                    showError(`加载文件失败: ${data.error}`);
                    if (data.raw) {
                        // 显示原始内容（即使JSON格式错误）
                        editor.setText(data.raw);
                        currentFileTitle.textContent = filename + ' (格式错误)';
                        showStatus('JSON格式错误，已显示原始内容', 'warning');
                    }
                }
            })
            .catch(error => {
                showError('网络错误: ' + error.message);
            });
    }

    // 保存文件
    function saveFile(callback) {
        if (!currentFile) return;

        showStatus('正在保存文件...', 'info');

        try {
            const data = editor.get();
            const payload = { data: data };

            fetch(`/api/file/${encodeURIComponent(currentFile)}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        isModified = false;
                        updateFileStatus('clean');
                        fileSize.textContent = formatFileSize(data.size);
                        showNotification('文件保存成功', 'success');

                        // 重新加载文件列表以更新元数据
                        loadFileList();

                        if (callback) callback();
                    } else {
                        showError(`保存失败: ${data.error}`);
                    }
                })
                .catch(error => {
                    showError('网络错误: ' + error.message);
                });

        } catch (error) {
            showError('编辑器数据错误: ' + error.message);
        }
    }

    // 验证文件
    function validateFile(filename) {
        showStatus('正在验证文件...', 'info');

        fetch(`/api/validate/${encodeURIComponent(filename)}`)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    if (data.valid) {
                        showNotification(`文件格式正确`, 'success');
                        showStatus('JSON格式正确', 'success');
                    } else {
                        showNotification(`JSON格式错误: ${data.error}`, 'error');
                        showStatus(`JSON格式错误: ${data.error}`, 'error');
                    }
                } else {
                    showError(`验证失败: ${data.error}`);
                }
            })
            .catch(error => {
                showError('网络错误: ' + error.message);
            });
    }

    // 创建新文件
    function createNewFile() {
        const fileNameInput = document.getElementById('fileName');
        const templateSelect = document.getElementById('templateSelect');

        // 显示模态框
        createModal.classList.add('active');
        fileNameInput.focus();

        // 确认创建
        const confirmBtn = createModal.querySelector('.modal-confirm');
        const cancelBtn = createModal.querySelector('.modal-cancel');
        const closeBtn = createModal.querySelector('.modal-close');

        const closeModal = () => {
            createModal.classList.remove('active');
        };

        const createFile = () => {
            const filename = fileNameInput.value.trim();
            if (!filename) {
                showError('请输入文件名');
                return;
            }

            // 准备内容
            let content = {};
            switch (templateSelect.value) {
                case 'empty':
                    content = {};
                    break;
                case 'config':
                    content = {
                        name: filename.replace('.json', ''),
                        description: "配置文件",
                        version: "1.0.0",
                        settings: {},
                        metadata: {
                            created: new Date().toISOString(),
                            author: "系统"
                        }
                    };
                    break;
                case 'settings':
                    content = {
                        settings: {
                            theme: "light",
                            language: "zh-CN",
                            autoSave: true,
                            fontSize: 14,
                            enableNotifications: true
                        },
                        preferences: {}
                    };
                    break;
                case 'data':
                    content = {
                        data: [],
                        schema: {},
                        metadata: {}
                    };
                    break;
            }

            fetch('/api/file/new', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    filename: filename,
                    content: content
                })
            })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        showNotification(`文件 ${data.filename} 创建成功`, 'success');
                        closeModal();

                        // 重新加载文件列表并选择新文件
                        loadFileList();
                        setTimeout(() => {
                            selectFile(data.filename);
                        }, 500);

                        // 重置表单
                        fileNameInput.value = '';
                        templateSelect.value = 'empty';
                    } else {
                        showError(`创建失败: ${data.error}`);
                    }
                })
                .catch(error => {
                    showError('网络错误: ' + error.message);
                });
        };

        // 事件监听器
        const tempConfirm = () => {
            createFile();
            confirmBtn.removeEventListener('click', tempConfirm);
        };
        const tempCancel = () => {
            closeModal();
            cancelBtn.removeEventListener('click', tempCancel);
        };
        const tempClose = () => {
            closeModal();
            closeBtn.removeEventListener('click', tempClose);
        };

        confirmBtn.addEventListener('click', tempConfirm, { once: true });
        cancelBtn.addEventListener('click', tempCancel, { once: true });
        closeBtn.addEventListener('click', tempClose, { once: true });

        // 回车键提交
        fileNameInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                createFile();
            }
        });
    }

    // 显示删除确认模态框
    function showDeleteModal(filename) {
        document.getElementById('deleteFileName').textContent = filename;
        deleteModal.classList.add('active');

        const confirmBtn = deleteModal.querySelector('.modal-confirm');
        const cancelBtn = deleteModal.querySelector('.modal-cancel');
        const closeBtn = deleteModal.querySelector('.modal-close');

        const closeModal = () => {
            deleteModal.classList.remove('active');
        };

        const deleteFile = () => {
            fetch(`/api/file/${encodeURIComponent(filename)}`, {
                method: 'DELETE'
            })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        showNotification(`文件 ${filename} 已删除`, 'success');
                        closeModal();

                        // 如果删除的是当前文件，清除编辑器
                        if (currentFile === filename) {
                            currentFile = null;
                            currentData = null;
                            editor.set({});
                            currentFileTitle.textContent = '选择文件开始编辑';
                            fileSize.textContent = '0 bytes';
                            updateFileStatus('unknown');
                            saveBtn.disabled = true;
                            validateBtn.disabled = true;
                            showStatus('文件已删除', 'info');
                        }

                        // 重新加载文件列表
                        loadFileList();
                    } else {
                        showError(`删除失败: ${data.error}`);
                    }
                })
                .catch(error => {
                    showError('网络错误: ' + error.message);
                });
        };

        // 事件监听器
        const tempConfirm = () => {
            deleteFile();
            confirmBtn.removeEventListener('click', tempConfirm);
        };
        const tempCancel = () => {
            closeModal();
            cancelBtn.removeEventListener('click', tempCancel);
        };
        const tempClose = () => {
            closeModal();
            closeBtn.removeEventListener('click', tempClose);
        };

        confirmBtn.addEventListener('click', tempConfirm, { once: true });
        cancelBtn.addEventListener('click', tempCancel, { once: true });
        closeBtn.addEventListener('click', tempClose, { once: true });
    }

    // 更新文件状态
    function updateFileStatus(status) {
        fileStatus.textContent = {
            'unknown': '未修改',
            'clean': '已保存',
            'modified': '已修改',
            'error': '错误'
        }[status];

        fileStatus.className = `status-${status}`;
    }

    // 显示状态消息
    function showStatus(message, type = 'info') {
        statusMessage.innerHTML = `
            <i class="fas fa-${type === 'error' ? 'exclamation-circle' :
                type === 'warning' ? 'exclamation-triangle' :
                    type === 'success' ? 'check-circle' : 'info-circle'}"></i>
            ${message}
        `;

        statusMessage.style.color = {
            'info': '#718096',
            'success': '#48bb78',
            'warning': '#ed8936',
            'error': '#f56565'
        }[type];
    }

    // 显示通知
    function showNotification(message, type = 'info') {
        const icon = notification.querySelector('.notification-icon');
        const msg = notification.querySelector('.notification-message');

        // 设置内容
        icon.className = `notification-icon fas ${type === 'success' ? 'fa-check-circle' :
                type === 'error' ? 'fa-exclamation-circle' :
                    type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle'
            }`;
        msg.textContent = message;

        // 设置类型
        notification.className = `notification ${type}`;

        // 显示
        notification.classList.add('show');

        // 3秒后隐藏
        setTimeout(() => {
            notification.classList.remove('show');
        }, 3000);
    }

    // 显示错误
    function showError(message) {
        showNotification(message, 'error');
        console.error(message);
    }

    // 格式化文件大小
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 bytes';
        const k = 1024;
        const sizes = ['bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // 搜索功能
    function setupSearch() {
        searchInput.addEventListener('input', function () {
            const query = this.value.toLowerCase().trim();

            if (query === '') {
                renderFileList(files);
            } else {
                const filtered = files.filter(file =>
                    file.name.toLowerCase().includes(query) ||
                    (file.keys && file.keys.some(key => key.toLowerCase().includes(query)))
                );
                renderFileList(filtered);
            }
        });
    }

    // 设置编辑器模式
    function setupEditorModes() {
        modeButtons.forEach(btn => {
            btn.addEventListener('click', function () {
                // 更新按钮状态
                modeButtons.forEach(b => b.classList.remove('active'));
                this.classList.add('active');

                // 切换编辑器模式
                const mode = this.getAttribute('data-mode');
                editor.setMode(mode);
            });
        });
    }

    // 初始化事件监听器
    function initEventListeners() {
        // 刷新按钮
        refreshBtn.addEventListener('click', loadFileList);

        // 新建文件按钮
        createBtn.addEventListener('click', createNewFile);

        // 保存按钮
        saveBtn.addEventListener('click', () => saveFile());

        // 验证按钮
        validateBtn.addEventListener('click', () => {
            if (currentFile) {
                validateFile(currentFile);
            }
        });

        // 快捷键：Ctrl+S 保存
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                if (currentFile) {
                    saveFile();
                }
            }
        });

        // 搜索
        setupSearch();

        // 编辑器模式
        setupEditorModes();
    }

    // 初始化应用
    function initApp() {
        initJSONEditor();
        initEventListeners();
        loadFileList();

        // 显示欢迎消息
        setTimeout(() => {
            showStatus('选择左侧文件开始编辑，或创建新文件', 'info');
        }, 1000);
    }

    // 启动应用
    initApp();
});