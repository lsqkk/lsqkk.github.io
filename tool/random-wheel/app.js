// 随机转盘抽取器 - 主逻辑

// 默认转盘数据（将从JSON文件加载）
const DEFAULT_WHEELS = [
    {
        id: 'lunch',
        name: '午饭吃什么',
        description: '每天最纠结的问题',
        options: [
            { text: '米饭+炒菜', weight: 1.0, color: '#3498db' },
            { text: '面条', weight: 0.9, color: '#2ecc71' },
            { text: '饺子', weight: 0.8, color: '#e74c3c' },
            { text: '汉堡/快餐', weight: 0.7, color: '#f39c12' },
            { text: '沙拉轻食', weight: 0.6, color: '#9b59b6' },
            { text: '麻辣烫/火锅', weight: 0.9, color: '#1abc9c' },
            { text: '日料/韩餐', weight: 0.5, color: '#34495e' },
            { text: '随便', weight: 0.3, color: '#95a5a6' }
        ],
        drawCount: 1,
        drawMode: 'without-replacement',
        createdAt: new Date().toISOString()
    },
    {
        id: 'dinner',
        name: '晚饭吃什么',
        description: '晚餐选择',
        options: [
            { text: '家常菜', weight: 1.0, color: '#3498db' },
            { text: '外卖', weight: 0.8, color: '#2ecc71' },
            { text: '出去吃', weight: 0.7, color: '#e74c3c' },
            { text: '简单吃点', weight: 0.9, color: '#f39c12' },
            { text: '不吃', weight: 0.2, color: '#9b59b6' }
        ],
        drawCount: 1,
        drawMode: 'without-replacement',
        createdAt: new Date().toISOString()
    },
    {
        id: 'weekend',
        name: '周末做什么',
        description: '周末活动选择',
        options: [
            { text: '宅在家里', weight: 1.0, color: '#3498db' },
            { text: '看电影', weight: 0.9, color: '#2ecc71' },
            { text: '运动健身', weight: 0.7, color: '#e74c3c' },
            { text: '逛街购物', weight: 0.6, color: '#f39c12' },
            { text: '学习充电', weight: 0.8, color: '#9b59b6' },
            { text: '朋友聚会', weight: 0.9, color: '#1abc9c' }
        ],
        drawCount: 1,
        drawMode: 'without-replacement',
        createdAt: new Date().toISOString()
    }
];

// 应用状态
const state = {
    wheels: [],
    currentWheel: null,
    editingOption: null,
    results: [],
    lastSaved: null,
    isSpinning: false,
    spinAnimation: null
};

// DOM元素
const elements = {
    // 转盘相关
    wheelCanvas: document.getElementById('wheel-canvas'),
    currentWheelTitle: document.getElementById('current-wheel-title'),
    spinBtn: document.getElementById('spin-btn'),
    resetBtn: document.getElementById('reset-btn'),
    optionCount: document.getElementById('option-count'),
    drawMode: document.getElementById('draw-mode'),

    // 结果相关
    resultsList: document.getElementById('results-list'),
    clearResults: document.getElementById('clear-results'),
    exportResults: document.getElementById('export-results'),

    // 转盘管理
    wheelList: document.getElementById('wheel-list'),
    createWheel: document.getElementById('create-wheel'),
    wheelName: document.getElementById('wheel-name'),
    drawCount: document.getElementById('draw-count'),
    drawModeSelect: document.getElementById('draw-mode-select'),

    // 选项管理
    optionsList: document.getElementById('options-list'),
    addOption: document.getElementById('add-option'),
    normalizeWeights: document.getElementById('normalize-weights'),
    equalWeights: document.getElementById('equal-weights'),
    clearOptions: document.getElementById('clear-options'),

    // 数据管理
    saveWheel: document.getElementById('save-wheel'),
    deleteWheel: document.getElementById('delete-wheel'),
    importJson: document.getElementById('import-json'),
    exportJson: document.getElementById('export-json'),
    lastSaved: document.getElementById('last-saved'),

    // 模态框
    optionModal: document.getElementById('option-modal'),
    wheelModal: document.getElementById('wheel-modal'),
    optionText: document.getElementById('option-text'),
    optionWeight: document.getElementById('option-weight'),
    optionColor: document.getElementById('option-color'),
    saveOption: document.getElementById('save-option'),
    cancelOption: document.getElementById('cancel-option'),
    newWheelName: document.getElementById('new-wheel-name'),
    newWheelDescription: document.getElementById('new-wheel-description'),
    presetOptions: document.getElementById('preset-options'),
    saveWheelModal: document.getElementById('save-wheel-modal'),
    cancelWheel: document.getElementById('cancel-wheel'),
    modalWheelTitle: document.getElementById('modal-wheel-title'),

    // 页脚
    currentYear: document.getElementById('current-year')
};

// 工具函数
const utils = {
    // 生成唯一ID
    generateId: () => {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    // 格式化日期
    formatDate: (date) => {
        return new Date(date).toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    // 计算权重总和
    calculateTotalWeight: (options) => {
        return options.reduce((sum, option) => sum + option.weight, 0);
    },

    // 根据权重随机选择
    weightedRandom: (options) => {
        const totalWeight = utils.calculateTotalWeight(options);
        let random = Math.random() * totalWeight;

        for (const option of options) {
            random -= option.weight;
            if (random <= 0) {
                return option;
            }
        }

        return options[options.length - 1];
    },

    // 归一化权重（使总和为1）
    normalizeWeights: (options) => {
        const totalWeight = utils.calculateTotalWeight(options);
        if (totalWeight === 0) return options;

        return options.map(option => ({
            ...option,
            weight: option.weight / totalWeight
        }));
    },

    // 设置平均权重
    setEqualWeights: (options) => {
        const weight = 1 / options.length;
        return options.map(option => ({
            ...option,
            weight: weight
        }));
    },

    // 导出为JSON文件
    exportToJson: (data, filename) => {
        const jsonStr = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename || 'wheel-data.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    // 从文件导入JSON
    importFromJson: (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    resolve(data);
                } catch (error) {
                    reject(new Error('无效的JSON文件'));
                }
            };
            reader.onerror = () => reject(new Error('读取文件失败'));
            reader.readAsText(file);
        });
    }
};

// 转盘绘制函数
const wheelRenderer = {
    ctx: null,
    spinning: false,
    rotation: 0,
    spinSpeed: 0,

    init: function () {
        this.ctx = elements.wheelCanvas.getContext('2d');
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    },

    resizeCanvas: function () {
        const container = elements.wheelCanvas.parentElement;
        const size = Math.min(container.clientWidth, 500);

        elements.wheelCanvas.width = size;
        elements.wheelCanvas.height = size;

        if (state.currentWheel) {
            this.drawWheel(state.currentWheel.options);
        }
    },

    drawWheel: function (options) {
        if (!options || options.length === 0) {
            this.drawEmptyWheel();
            return;
        }

        const ctx = this.ctx;
        const width = elements.wheelCanvas.width;
        const height = elements.wheelCanvas.height;
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) / 2 - 10;

        // 清空画布
        ctx.clearRect(0, 0, width, height);

        // 绘制转盘背景
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(this.rotation);

        const totalWeight = utils.calculateTotalWeight(options);
        let startAngle = 0;

        // 绘制每个扇形
        options.forEach((option, index) => {
            const angle = (option.weight / totalWeight) * 2 * Math.PI;

            // 绘制扇形
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, radius, startAngle, startAngle + angle);
            ctx.closePath();

            // 填充颜色
            ctx.fillStyle = option.color;
            ctx.fill();

            // 绘制边框
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 2;
            ctx.stroke();

            // 绘制文字
            ctx.save();
            ctx.rotate(startAngle + angle / 2);
            ctx.textAlign = 'right';
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 14px Arial';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            ctx.shadowBlur = 3;

            // 调整文字位置
            ctx.translate(radius - 30, 0);
            ctx.rotate(Math.PI / 2);

            // 限制文字长度
            let text = option.text;
            const maxLength = 10;
            if (text.length > maxLength) {
                text = text.substring(0, maxLength - 2) + '...';
            }

            ctx.fillText(text, 0, 0);
            ctx.restore();

            startAngle += angle;
        });

        // 绘制中心圆
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, 2 * Math.PI);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.restore();
    },

    drawEmptyWheel: function () {
        const ctx = this.ctx;
        const width = elements.wheelCanvas.width;
        const height = elements.wheelCanvas.height;
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) / 2 - 10;

        // 清空画布
        ctx.clearRect(0, 0, width, height);

        // 绘制空转盘
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // 绘制提示文字
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('请添加选项', centerX, centerY - 10);
        ctx.font = '14px Arial';
        ctx.fillText('点击"添加选项"按钮', centerX, centerY + 15);
    },

    spin: function (onComplete) {
        if (this.spinning || !state.currentWheel || state.currentWheel.options.length === 0) {
            return;
        }

        this.spinning = true;
        state.isSpinning = true;
        elements.spinBtn.disabled = true;
        elements.spinBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 抽取中...';

        // 随机旋转角度和减速曲线
        const spins = 5 + Math.random() * 3; // 5-8圈
        const targetRotation = this.rotation + spins * 2 * Math.PI + (Math.random() * 2 * Math.PI);

        const startTime = Date.now();
        const duration = 3000 + Math.random() * 2000; // 3-5秒

        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // 使用缓动函数（先快后慢）
            const easeOut = 1 - Math.pow(1 - progress, 3);

            this.rotation = easeOut * targetRotation;
            this.drawWheel(state.currentWheel.options);

            if (progress < 1) {
                this.spinAnimation = requestAnimationFrame(animate);
            } else {
                this.spinning = false;
                state.isSpinning = false;
                elements.spinBtn.disabled = false;
                elements.spinBtn.innerHTML = '<i class="fas fa-play"></i> 开始抽取';

                // 计算选中项
                const normalizedRotation = this.rotation % (2 * Math.PI);
                const options = state.currentWheel.options;
                const totalWeight = utils.calculateTotalWeight(options);

                let currentAngle = 0;
                let selectedOption = null;

                for (const option of options) {
                    const angle = (option.weight / totalWeight) * 2 * Math.PI;
                    if (normalizedRotation >= currentAngle && normalizedRotation < currentAngle + angle) {
                        selectedOption = option;
                        break;
                    }
                    currentAngle += angle;
                }

                if (selectedOption && onComplete) {
                    onComplete(selectedOption);
                }
            }
        };

        animate();
    },

    stopSpin: function () {
        if (this.spinAnimation) {
            cancelAnimationFrame(this.spinAnimation);
            this.spinning = false;
            state.isSpinning = false;
            elements.spinBtn.disabled = false;
            elements.spinBtn.innerHTML = '<i class="fas fa-play"></i> 开始抽取';
        }
    }
};

// 数据管理
const dataManager = {
    // 从本地存储加载数据
    loadFromStorage: function () {
        try {
            const savedWheels = localStorage.getItem('randomWheelData');
            if (savedWheels) {
                const parsed = JSON.parse(savedWheels);
                state.wheels = parsed.wheels || [];
                state.currentWheel = parsed.currentWheel ?
                    state.wheels.find(w => w.id === parsed.currentWheel.id) : null;
                state.results = parsed.results || [];
                state.lastSaved = parsed.lastSaved;

                // 更新最后保存时间显示
                if (state.lastSaved) {
                    elements.lastSaved.textContent = `上次保存: ${utils.formatDate(state.lastSaved)}`;
                }

                return true;
            }
        } catch (error) {
            console.error('加载本地存储数据失败:', error);
        }

        return false;
    },

    // 保存到本地存储
    saveToStorage: function () {
        try {
            const data = {
                wheels: state.wheels,
                currentWheel: state.currentWheel,
                results: state.results,
                lastSaved: new Date().toISOString()
            };

            localStorage.setItem('randomWheelData', JSON.stringify(data));
            state.lastSaved = data.lastSaved;
            elements.lastSaved.textContent = `上次保存: ${utils.formatDate(state.lastSaved)}`;

            return true;
        } catch (error) {
            console.error('保存到本地存储失败:', error);
            return false;
        }
    },

    // 加载默认转盘
    loadDefaultWheels: async function () {
        try {
            // 尝试从JSON文件加载
            const response = await fetch('data/default-wheels.json');
            if (response.ok) {
                const defaultWheels = await response.json();
                return defaultWheels;
            }
        } catch (error) {
            console.log('使用内置默认转盘数据');
        }

        return DEFAULT_WHEELS;
    },

    // 初始化数据
    initializeData: async function () {
        // 首先尝试加载本地存储数据
        const hasSavedData = this.loadFromStorage();

        // 如果没有保存的数据，加载默认转盘
        if (!hasSavedData || state.wheels.length === 0) {
            const defaultWheels = await this.loadDefaultWheels();
            state.wheels = defaultWheels.map(wheel => ({
                ...wheel,
                id: wheel.id || utils.generateId()
            }));

            // 设置第一个转盘为当前转盘
            if (state.wheels.length > 0) {
                state.currentWheel = state.wheels[0];
            }

            // 保存默认数据
            this.saveToStorage();
        }

        // 更新UI
        uiManager.updateWheelList();
        if (state.currentWheel) {
            uiManager.setCurrentWheel(state.currentWheel);
        }
    }
};

// UI管理
const uiManager = {
    // 更新转盘列表
    updateWheelList: function () {
        elements.wheelList.innerHTML = '';

        state.wheels.forEach(wheel => {
            const isActive = state.currentWheel && state.currentWheel.id === wheel.id;

            const wheelItem = document.createElement('div');
            wheelItem.className = `wheel-item ${isActive ? 'active' : ''}`;
            wheelItem.dataset.id = wheel.id;

            wheelItem.innerHTML = `
                <div class="wheel-info">
                    <div class="wheel-name">${wheel.name}</div>
                    <div class="wheel-description">${wheel.description || ''}</div>
                </div>
                <div class="wheel-meta">
                    <span class="wheel-options-count">${wheel.options.length}项</span>
                    <div class="item-actions">
                        <button class="item-action-btn edit-wheel" title="编辑">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="item-action-btn delete-wheel" title="删除">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;

            // 点击切换转盘
            wheelItem.addEventListener('click', (e) => {
                if (!e.target.closest('.item-actions')) {
                    this.setCurrentWheel(wheel);
                }
            });

            // 编辑转盘
            wheelItem.querySelector('.edit-wheel').addEventListener('click', (e) => {
                e.stopPropagation();
                this.showEditWheelModal(wheel);
            });

            // 删除转盘
            wheelItem.querySelector('.delete-wheel').addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteWheel(wheel.id);
            });

            elements.wheelList.appendChild(wheelItem);
        });
    },

    // 设置当前转盘
    setCurrentWheel: function (wheel) {
        state.currentWheel = wheel;

        // 更新标题
        elements.currentWheelTitle.textContent = wheel.name;
        elements.wheelName.value = wheel.name;
        elements.drawCount.value = wheel.drawCount;
        elements.drawModeSelect.value = wheel.drawMode;
        elements.drawMode.textContent = wheel.drawMode === 'with-replacement' ? '放回' : '不放回';
        elements.optionCount.textContent = wheel.options.length;

        // 更新选项列表
        this.updateOptionsList();

        // 更新转盘显示
        wheelRenderer.drawWheel(wheel.options);

        // 更新转盘列表的高亮
        document.querySelectorAll('.wheel-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.id === wheel.id) {
                item.classList.add('active');
            }
        });

        // 保存状态
        dataManager.saveToStorage();
    },

    // 更新选项列表
    updateOptionsList: function () {
        if (!state.currentWheel) {
            elements.optionsList.innerHTML = '<p class="empty-message">请先选择或创建转盘</p>';
            return;
        }

        elements.optionsList.innerHTML = '';

        state.currentWheel.options.forEach((option, index) => {
            const optionItem = document.createElement('div');
            optionItem.className = 'option-item';
            optionItem.dataset.index = index;

            optionItem.innerHTML = `
                <div class="option-color" style="width: 12px; height: 12px; border-radius: 50%; background: ${option.color}; margin-right: 10px;"></div>
                <div class="option-name">${option.text}</div>
                <div class="option-weight">${option.weight.toFixed(2)}</div>
                <div class="item-actions">
                    <button class="item-action-btn edit-option" title="编辑">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="item-action-btn delete-option" title="删除">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;

            // 编辑选项
            optionItem.querySelector('.edit-option').addEventListener('click', () => {
                this.showEditOptionModal(index);
            });

            // 删除选项
            optionItem.querySelector('.delete-option').addEventListener('click', () => {
                this.deleteOption(index);
            });

            elements.optionsList.appendChild(optionItem);
        });

        // 如果没有选项，显示提示
        if (state.currentWheel.options.length === 0) {
            elements.optionsList.innerHTML = '<p class="empty-message">暂无选项，点击"添加选项"按钮添加</p>';
        }
    },

    // 更新结果列表
    updateResultsList: function () {
        elements.resultsList.innerHTML = '';

        if (state.results.length === 0) {
            elements.resultsList.innerHTML = '<p class="empty-results">暂无抽取结果</p>';
            return;
        }

        // 显示最近20条结果
        const recentResults = state.results.slice(-20).reverse();

        recentResults.forEach((result, index) => {
            const resultItem = document.createElement('div');
            resultItem.className = 'result-item';

            resultItem.innerHTML = `
                <div class="result-content">
                    <span class="result-index">${state.results.length - index}.</span>
                    <span class="result-text">${result.option.text}</span>
                    <small class="result-time">${utils.formatDate(result.timestamp)}</small>
                </div>
                <div class="result-actions">
                    <button class="item-action-btn delete-result" title="删除此结果" data-index="${state.results.length - 1 - index}">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;

            // 删除单条结果
            resultItem.querySelector('.delete-result').addEventListener('click', (e) => {
                const resultIndex = parseInt(e.target.closest('.delete-result').dataset.index);
                this.deleteResult(resultIndex);
            });

            elements.resultsList.appendChild(resultItem);
        });
    },

    // 添加抽取结果
    addResult: function (option) {
        const result = {
            option: option,
            wheelId: state.currentWheel.id,
            wheelName: state.currentWheel.name,
            timestamp: new Date().toISOString()
        };

        state.results.push(result);
        this.updateResultsList();
        dataManager.saveToStorage();
    },

    // 删除单条结果
    deleteResult: function (index) {
        if (index >= 0 && index < state.results.length) {
            state.results.splice(index, 1);
            this.updateResultsList();
            dataManager.saveToStorage();
        }
    },

    // 清空结果
    clearResults: function () {
        if (state.results.length > 0 && confirm('确定要清空所有抽取结果吗？')) {
            state.results = [];
            this.updateResultsList();
            dataManager.saveToStorage();
        }
    },

    // 显示编辑选项模态框
    showEditOptionModal: function (index = null) {
        state.editingOption = index;

        if (index !== null && state.currentWheel) {
            // 编辑现有选项
            const option = state.currentWheel.options[index];
            elements.optionText.value = option.text;
            elements.optionWeight.value = option.weight;
            elements.optionColor.value = option.color;
        } else {
            // 添加新选项
            elements.optionText.value = '';
            elements.optionWeight.value = 1;

            // 随机颜色
            const colors = ['#3498db', '#2ecc71', '#e74c3c', '#f39c12', '#9b59b6', '#1abc9c', '#34495e', '#95a5a6'];
            elements.optionColor.value = colors[Math.floor(Math.random() * colors.length)];
        }

        elements.optionModal.classList.add('active');
        elements.optionText.focus();
    },

    // 保存选项
    saveOption: function () {
        const text = elements.optionText.value.trim();
        const weight = parseFloat(elements.optionWeight.value);
        const color = elements.optionColor.value;

        if (!text) {
            alert('请输入选项名称');
            return;
        }

        if (isNaN(weight) || weight <= 0) {
            alert('请输入有效的权重值（大于0）');
            return;
        }

        const option = { text, weight, color };

        if (state.editingOption !== null) {
            // 更新现有选项
            state.currentWheel.options[state.editingOption] = option;
        } else {
            // 添加新选项
            state.currentWheel.options.push(option);
        }

        // 更新UI
        this.updateOptionsList();
        wheelRenderer.drawWheel(state.currentWheel.options);
        elements.optionCount.textContent = state.currentWheel.options.length;

        // 保存数据
        dataManager.saveToStorage();

        // 关闭模态框
        this.hideOptionModal();
    },

    // 隐藏选项模态框
    hideOptionModal: function () {
        elements.optionModal.classList.remove('active');
        state.editingOption = null;
    },

    // 删除选项
    deleteOption: function (index) {
        if (state.currentWheel && index >= 0 && index < state.currentWheel.options.length) {
            if (confirm('确定要删除这个选项吗？')) {
                state.currentWheel.options.splice(index, 1);

                // 更新UI
                this.updateOptionsList();
                wheelRenderer.drawWheel(state.currentWheel.options);
                elements.optionCount.textContent = state.currentWheel.options.length;

                // 保存数据
                dataManager.saveToStorage();
            }
        }
    },

    // 显示创建/编辑转盘模态框
    showCreateWheelModal: function (wheel = null) {
        if (wheel) {
            // 编辑现有转盘
            elements.modalWheelTitle.textContent = '编辑转盘';
            elements.newWheelName.value = wheel.name;
            elements.newWheelDescription.value = wheel.description || '';
            elements.saveWheelModal.textContent = '保存';
            elements.modalWheelTitle.dataset.id = wheel.id;
        } else {
            // 创建新转盘
            elements.modalWheelTitle.textContent = '新建转盘';
            elements.newWheelName.value = '';
            elements.newWheelDescription.value = '';
            elements.presetOptions.value = '';
            elements.saveWheelModal.textContent = '创建';
            delete elements.modalWheelTitle.dataset.id;
        }

        elements.wheelModal.classList.add('active');
        elements.newWheelName.focus();
    },

    // 保存转盘
    saveWheelModal: function () {
        const name = elements.newWheelName.value.trim();
        const description = elements.newWheelDescription.value.trim();
        const preset = elements.presetOptions.value;

        if (!name) {
            alert('请输入转盘名称');
            return;
        }

        let newWheel;
        const existingId = elements.modalWheelTitle.dataset.id;

        if (existingId) {
            // 更新现有转盘
            const existingWheel = state.wheels.find(w => w.id === existingId);
            if (existingWheel) {
                existingWheel.name = name;
                existingWheel.description = description;
                newWheel = existingWheel;
            }
        } else {
            // 创建新转盘
            newWheel = {
                id: utils.generateId(),
                name,
                description,
                options: [],
                drawCount: 1,
                drawMode: 'without-replacement',
                createdAt: new Date().toISOString()
            };

            // 如果选择了预设，添加预设选项
            if (preset) {
                this.addPresetOptions(newWheel, preset);
            }

            state.wheels.push(newWheel);
        }

        // 更新UI
        this.updateWheelList();

        // 如果是新转盘或当前没有转盘，设置为当前转盘
        if (!existingId || !state.currentWheel) {
            this.setCurrentWheel(newWheel);
        } else if (existingId === state.currentWheel.id) {
            // 如果编辑的是当前转盘，更新显示
            this.setCurrentWheel(newWheel);
        }

        // 保存数据
        dataManager.saveToStorage();

        // 关闭模态框
        this.hideWheelModal();
    },

    // 添加预设选项
    addPresetOptions: function (wheel, preset) {
        const presets = {
            lunch: [
                { text: '米饭+炒菜', weight: 1.0, color: '#3498db' },
                { text: '面条', weight: 0.9, color: '#2ecc71' },
                { text: '饺子', weight: 0.8, color: '#e74c3c' },
                { text: '汉堡/快餐', weight: 0.7, color: '#f39c12' }
            ],
            dinner: [
                { text: '家常菜', weight: 1.0, color: '#3498db' },
                { text: '外卖', weight: 0.8, color: '#2ecc71' },
                { text: '出去吃', weight: 0.7, color: '#e74c3c' },
                { text: '简单吃点', weight: 0.9, color: '#f39c12' }
            ],
            games: [
                { text: '动作游戏', weight: 1.0, color: '#3498db' },
                { text: '角色扮演', weight: 0.9, color: '#2ecc71' },
                { text: '策略游戏', weight: 0.8, color: '#e74c3c' },
                { text: '体育游戏', weight: 0.7, color: '#f39c12' },
                { text: '休闲游戏', weight: 0.9, color: '#9b59b6' }
            ],
            movies: [
                { text: '科幻片', weight: 1.0, color: '#3498db' },
                { text: '喜剧片', weight: 0.9, color: '#2ecc71' },
                { text: '动作片', weight: 0.8, color: '#e74c3c' },
                { text: '爱情片', weight: 0.7, color: '#f39c12' },
                { text: '恐怖片', weight: 0.5, color: '#9b59b6' }
            ]
        };

        if (presets[preset]) {
            wheel.options = [...presets[preset]];
        }
    },

    // 隐藏转盘模态框
    hideWheelModal: function () {
        elements.wheelModal.classList.remove('active');
    },

    // 删除转盘
    deleteWheel: function (wheelId) {
        if (state.wheels.length <= 1) {
            alert('至少需要保留一个转盘');
            return;
        }

        if (confirm('确定要删除这个转盘吗？此操作不可撤销。')) {
            const index = state.wheels.findIndex(w => w.id === wheelId);
            if (index !== -1) {
                // 如果要删除的是当前转盘，切换到另一个转盘
                if (state.currentWheel && state.currentWheel.id === wheelId) {
                    const newIndex = index === 0 ? 1 : index - 1;
                    this.setCurrentWheel(state.wheels[newIndex]);
                }

                // 删除转盘
                state.wheels.splice(index, 1);

                // 更新UI
                this.updateWheelList();

                // 保存数据
                dataManager.saveToStorage();
            }
        }
    },

    // 执行抽取
    performDraw: function () {
        if (!state.currentWheel || state.currentWheel.options.length === 0) {
            alert('当前转盘没有选项，请先添加选项');
            return;
        }

        if (state.isSpinning) {
            return;
        }

        const drawCount = parseInt(elements.drawCount.value) || 1;
        const drawMode = elements.drawModeSelect.value;

        // 验证抽取数量
        if (drawMode === 'without-replacement' && drawCount > state.currentWheel.options.length) {
            alert(`不放回抽取时，抽取数量不能超过选项数量（当前有${state.currentWheel.options.length}个选项）`);
            return;
        }

        // 开始转盘动画
        wheelRenderer.spin((selectedOption) => {
            // 单次抽取
            if (drawCount === 1) {
                this.addResult(selectedOption);

                // 如果不放回抽取，从转盘中移除该选项
                if (drawMode === 'without-replacement') {
                    const optionIndex = state.currentWheel.options.findIndex(
                        opt => opt.text === selectedOption.text && opt.color === selectedOption.color
                    );

                    if (optionIndex !== -1) {
                        state.currentWheel.options.splice(optionIndex, 1);
                        this.updateOptionsList();
                        elements.optionCount.textContent = state.currentWheel.options.length;
                        dataManager.saveToStorage();

                        // 如果转盘空了，重置转盘
                        if (state.currentWheel.options.length === 0) {
                            alert('所有选项都已被抽取！转盘已重置。');
                            this.resetWheel();
                        }
                    }
                }
            } else {
                // 多次抽取
                const results = [];
                let availableOptions = [...state.currentWheel.options];

                for (let i = 0; i < drawCount; i++) {
                    if (availableOptions.length === 0) {
                        alert(`只有${state.currentWheel.options.length}个选项，无法抽取${drawCount}次`);
                        break;
                    }

                    const selected = utils.weightedRandom(availableOptions);
                    results.push(selected);

                    // 如果不放回抽取，从可用选项中移除
                    if (drawMode === 'without-replacement') {
                        const optionIndex = availableOptions.findIndex(
                            opt => opt.text === selected.text && opt.color === selected.color
                        );
                        availableOptions.splice(optionIndex, 1);
                    }
                }

                // 添加所有结果
                results.forEach(option => {
                    this.addResult(option);
                });

                // 如果不放回抽取，更新转盘
                if (drawMode === 'without-replacement') {
                    state.currentWheel.options = availableOptions;
                    this.updateOptionsList();
                    elements.optionCount.textContent = state.currentWheel.options.length;
                    dataManager.saveToStorage();

                    // 如果转盘空了，重置转盘
                    if (state.currentWheel.options.length === 0) {
                        alert('所有选项都已被抽取！转盘已重置。');
                        this.resetWheel();
                    }
                }
            }

            // 重新绘制转盘
            wheelRenderer.drawWheel(state.currentWheel.options);
        });
    },

    // 重置转盘
    resetWheel: function () {
        if (!state.currentWheel) return;

        // 恢复所有选项（从原始数据中找回）
        const originalWheel = DEFAULT_WHEELS.find(w => w.id === state.currentWheel.id);
        if (originalWheel) {
            state.currentWheel.options = [...originalWheel.options];
        } else {
            // 如果没有原始数据，至少保留一个选项
            if (state.currentWheel.options.length === 0) {
                state.currentWheel.options = [
                    { text: '选项1', weight: 1, color: '#3498db' },
                    { text: '选项2', weight: 1, color: '#2ecc71' }
                ];
            }
        }

        // 更新UI
        this.updateOptionsList();
        wheelRenderer.drawWheel(state.currentWheel.options);
        elements.optionCount.textContent = state.currentWheel.options.length;

        // 保存数据
        dataManager.saveToStorage();
    },

    // 归一化权重
    normalizeWeights: function () {
        if (!state.currentWheel || state.currentWheel.options.length === 0) {
            return;
        }

        state.currentWheel.options = utils.normalizeWeights(state.currentWheel.options);
        this.updateOptionsList();
        wheelRenderer.drawWheel(state.currentWheel.options);
        dataManager.saveToStorage();
    },

    // 设置平均权重
    setEqualWeights: function () {
        if (!state.currentWheel || state.currentWheel.options.length === 0) {
            return;
        }

        state.currentWheel.options = utils.setEqualWeights(state.currentWheel.options);
        this.updateOptionsList();
        wheelRenderer.drawWheel(state.currentWheel.options);
        dataManager.saveToStorage();
    },

    // 清空选项
    clearOptions: function () {
        if (!state.currentWheel || state.currentWheel.options.length === 0) {
            return;
        }

        if (confirm('确定要清空所有选项吗？此操作不可撤销。')) {
            state.currentWheel.options = [];
            this.updateOptionsList();
            wheelRenderer.drawWheel(state.currentWheel.options);
            elements.optionCount.textContent = 0;
            dataManager.saveToStorage();
        }
    },

    // 导出结果
    exportResults: function () {
        if (state.results.length === 0) {
            alert('没有可导出的结果');
            return;
        }

        const data = {
            exportDate: new Date().toISOString(),
            wheel: state.currentWheel ? {
                name: state.currentWheel.name,
                id: state.currentWheel.id
            } : null,
            results: state.results
        };

        const filename = `随机转盘结果_${new Date().toISOString().slice(0, 10)}.json`;
        utils.exportToJson(data, filename);
    },

    // 导出JSON
    exportWheelsJson: function () {
        if (state.wheels.length === 0) {
            alert('没有可导出的转盘数据');
            return;
        }

        const data = {
            exportDate: new Date().toISOString(),
            wheels: state.wheels
        };

        const filename = `转盘数据_${new Date().toISOString().slice(0, 10)}.json`;
        utils.exportToJson(data, filename);
    },

    // 导入JSON
    importWheelsJson: function () {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const importedData = await utils.importFromJson(file);

                if (!importedData.wheels || !Array.isArray(importedData.wheels)) {
                    throw new Error('无效的转盘数据格式');
                }

                if (confirm(`是否导入 ${importedData.wheels.length} 个转盘？现有数据将被覆盖。`)) {
                    state.wheels = importedData.wheels.map(wheel => ({
                        ...wheel,
                        id: wheel.id || utils.generateId()
                    }));

                    // 设置第一个转盘为当前转盘
                    if (state.wheels.length > 0) {
                        state.currentWheel = state.wheels[0];
                        this.setCurrentWheel(state.currentWheel);
                    }

                    // 重置结果
                    state.results = [];

                    // 更新UI
                    this.updateWheelList();
                    this.updateResultsList();

                    // 保存数据
                    dataManager.saveToStorage();

                    alert(`成功导入 ${importedData.wheels.length} 个转盘`);
                }
            } catch (error) {
                alert(`导入失败: ${error.message}`);
            }
        };

        input.click();
    },

    // 保存转盘更改
    saveWheelChanges: function () {
        if (!state.currentWheel) return;

        // 更新当前转盘属性
        state.currentWheel.name = elements.wheelName.value;
        state.currentWheel.drawCount = parseInt(elements.drawCount.value) || 1;
        state.currentWheel.drawMode = elements.drawModeSelect.value;

        // 更新显示
        elements.currentWheelTitle.textContent = state.currentWheel.name;
        elements.drawMode.textContent = state.currentWheel.drawMode === 'with-replacement' ? '放回' : '不放回';

        // 更新转盘列表
        this.updateWheelList();

        // 保存数据
        dataManager.saveToStorage();

        alert('转盘设置已保存');
    }
};

// 事件绑定
function setupEventListeners() {
    // 开始抽取
    elements.spinBtn.addEventListener('click', () => uiManager.performDraw());

    // 重置转盘
    elements.resetBtn.addEventListener('click', () => uiManager.resetWheel());

    // 清空结果
    elements.clearResults.addEventListener('click', () => uiManager.clearResults());

    // 导出结果
    elements.exportResults.addEventListener('click', () => uiManager.exportResults());

    // 创建新转盘
    elements.createWheel.addEventListener('click', () => uiManager.showCreateWheelModal());

    // 添加选项
    elements.addOption.addEventListener('click', () => uiManager.showEditOptionModal());

    // 归一化权重
    elements.normalizeWeights.addEventListener('click', () => uiManager.normalizeWeights());

    // 设置平均权重
    elements.equalWeights.addEventListener('click', () => uiManager.setEqualWeights());

    // 清空选项
    elements.clearOptions.addEventListener('click', () => uiManager.clearOptions());

    // 保存转盘更改
    elements.saveWheel.addEventListener('click', () => uiManager.saveWheelChanges());

    // 删除当前转盘
    elements.deleteWheel.addEventListener('click', () => {
        if (state.currentWheel) {
            uiManager.deleteWheel(state.currentWheel.id);
        }
    });

    // 导入JSON
    elements.importJson.addEventListener('click', () => uiManager.importWheelsJson());

    // 导出JSON
    elements.exportJson.addEventListener('click', () => uiManager.exportWheelsJson());

    // 选项模态框
    elements.saveOption.addEventListener('click', () => uiManager.saveOption());
    elements.cancelOption.addEventListener('click', () => uiManager.hideOptionModal());
    elements.optionModal.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => uiManager.hideOptionModal());
    });

    // 转盘模态框
    elements.saveWheelModal.addEventListener('click', () => uiManager.saveWheelModal());
    elements.cancelWheel.addEventListener('click', () => uiManager.hideWheelModal());
    elements.wheelModal.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => uiManager.hideWheelModal());
    });

    // 关闭模态框（点击背景）
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                if (modal === elements.optionModal) {
                    uiManager.hideOptionModal();
                } else if (modal === elements.wheelModal) {
                    uiManager.hideWheelModal();
                }
            }
        });
    });

    // 表单输入实时更新
    elements.wheelName.addEventListener('change', () => {
        if (state.currentWheel) {
            state.currentWheel.name = elements.wheelName.value;
            elements.currentWheelTitle.textContent = state.currentWheel.name;
            uiManager.updateWheelList();
            dataManager.saveToStorage();
        }
    });

    elements.drawCount.addEventListener('change', () => {
        if (state.currentWheel) {
            state.currentWheel.drawCount = parseInt(elements.drawCount.value) || 1;
            dataManager.saveToStorage();
        }
    });

    elements.drawModeSelect.addEventListener('change', () => {
        if (state.currentWheel) {
            state.currentWheel.drawMode = elements.drawModeSelect.value;
            elements.drawMode.textContent = state.currentWheel.drawMode === 'with-replacement' ? '放回' : '不放回';
            dataManager.saveToStorage();
        }
    });

    // 设置当前年份
    elements.currentYear.textContent = new Date().getFullYear();
}

// 初始化应用
async function init() {
    // 初始化转盘渲染器
    wheelRenderer.init();

    // 初始化数据
    await dataManager.initializeData();

    // 设置事件监听器
    setupEventListeners();

    // 初始更新UI
    uiManager.updateResultsList();

    console.log('随机转盘抽取器已初始化');
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);