document.addEventListener('DOMContentLoaded', function () {
    // DOM元素
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const sidebar = document.getElementById('sidebar');
    const formulaList = document.getElementById('formulaList');
    const addFormulaBtn = document.getElementById('addFormulaBtn');
    const formulaName = document.getElementById('formulaName');
    const formulaPreview = document.getElementById('formulaPreview');
    const formulaBuilder = document.getElementById('formulaBuilder');
    const addFixedSegmentBtn = document.getElementById('addFixedSegmentBtn');
    const addVariableSegmentBtn = document.getElementById('addVariableSegmentBtn');
    const saveFormulaBtn = document.getElementById('saveFormulaBtn');
    const deleteFormulaBtn = document.getElementById('deleteFormulaBtn');
    const variableInputs = document.getElementById('variableInputs');
    const resultContent = document.getElementById('resultContent');
    const copyResultBtn = document.getElementById('copyResultBtn');

    // 状态变量
    let formulas = [];
    let currentFormulaId = null;

    // 初始化
    init();

    // 事件监听器
    mobileMenuBtn.addEventListener('click', toggleSidebar);
    addFormulaBtn.addEventListener('click', createNewFormula);
    addFixedSegmentBtn.addEventListener('click', () => addSegment('fixed'));
    addVariableSegmentBtn.addEventListener('click', () => addSegment('variable'));
    saveFormulaBtn.addEventListener('click', saveFormula);
    deleteFormulaBtn.addEventListener('click', deleteFormula);
    copyResultBtn.addEventListener('click', copyResult);

    // 函数定义
    function init() {
        loadFormulas();

        // 如果没有公式，创建一个示例公式
        if (formulas.length === 0) {
            createExampleFormula();
        } else {
            // 默认显示第一个公式
            displayFormula(formulas[0].id);
        }
    }

    function toggleSidebar() {
        sidebar.classList.toggle('show');
    }

    function loadFormulas() {
        const savedFormulas = localStorage.getItem('formulas');
        if (savedFormulas) {
            formulas = JSON.parse(savedFormulas);
            renderFormulaList();
        }
    }

    function saveFormulas() {
        localStorage.setItem('formulas', JSON.stringify(formulas));
    }

    function renderFormulaList() {
        formulaList.innerHTML = '';

        formulas.forEach(formula => {
            const li = document.createElement('li');
            li.className = `formula-item ${formula.id === currentFormulaId ? 'active' : ''}`;
            li.textContent = formula.name;
            li.dataset.id = formula.id;

            const actions = document.createElement('div');
            actions.className = 'formula-actions';

            const editBtn = document.createElement('button');
            editBtn.className = 'formula-btn';
            editBtn.textContent = '编辑';
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                displayFormula(formula.id);
            });

            actions.appendChild(editBtn);
            li.appendChild(actions);

            li.addEventListener('click', () => {
                displayFormula(formula.id);
            });

            formulaList.appendChild(li);
        });
    }

    function createExampleFormula() {
        const exampleFormula = {
            id: generateId(),
            name: 'ZY公式 - 夸克博客',
            segments: [
                { type: 'fixed', content: '今天' },
                { type: 'variable', name: '事件a', content: '' },
                { type: 'fixed', content: '之前听到有人讨论我\n我一靠近就吓得不敢说话\n但你们也不能这样吧\n我知道你们是嫉妒我' },
                { type: 'variable', name: '形容b', content: '' },
                { type: 'fixed', content: '\n希望你们能主动' },
                { type: 'variable', name: '行为c', content: '' }
            ]
        };

        formulas.push(exampleFormula);
        saveFormulas();
        displayFormula(exampleFormula.id);
        renderFormulaList();
    }

    function createNewFormula() {
        const newFormula = {
            id: generateId(),
            name: '新公式',
            segments: []
        };

        formulas.push(newFormula);
        saveFormulas();
        displayFormula(newFormula.id);
        renderFormulaList();

        // 聚焦到名称输入框
        formulaName.focus();
    }

    function displayFormula(formulaId) {
        const formula = formulas.find(f => f.id === formulaId);
        if (!formula) return;

        currentFormulaId = formulaId;
        formulaName.value = formula.name;

        // 渲染公式构建器
        renderFormulaBuilder(formula);

        // 渲染预览
        updatePreview();

        // 渲染变量输入
        renderVariableInputs(formula);

        // 更新结果
        updateResult();

        // 高亮当前选中的公式
        renderFormulaList();

        // 在移动设备上自动关闭侧边栏
        if (window.innerWidth <= 768) {
            sidebar.classList.remove('show');
        }
    }

    function renderFormulaBuilder(formula) {
        formulaBuilder.innerHTML = '';

        formula.segments.forEach((segment, index) => {
            const segmentDiv = document.createElement('div');
            segmentDiv.className = 'segment';

            const typeSpan = document.createElement('span');
            typeSpan.className = `segment-type ${segment.type}`;
            typeSpan.textContent = segment.type === 'fixed' ? '固定' : '变量';

            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'segment-input';
            input.value = segment.type === 'fixed' ? segment.content : segment.name;
            input.placeholder = segment.type === 'fixed' ? '输入固定文本' : '输入变量名称';

            const actions = document.createElement('div');
            actions.className = 'segment-actions';

            const upBtn = document.createElement('button');
            upBtn.className = 'segment-btn';
            upBtn.innerHTML = '↑';
            upBtn.addEventListener('click', () => moveSegment(index, 'up'));

            const downBtn = document.createElement('button');
            downBtn.className = 'segment-btn';
            downBtn.innerHTML = '↓';
            downBtn.addEventListener('click', () => moveSegment(index, 'down'));

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'segment-btn';
            deleteBtn.innerHTML = '×';
            deleteBtn.addEventListener('click', () => deleteSegment(index));

            actions.appendChild(upBtn);
            actions.appendChild(downBtn);
            actions.appendChild(deleteBtn);

            segmentDiv.appendChild(typeSpan);
            segmentDiv.appendChild(input);
            segmentDiv.appendChild(actions);

            // 添加输入事件监听器
            input.addEventListener('input', () => {
                if (segment.type === 'fixed') {
                    segment.content = input.value;
                } else {
                    segment.name = input.value;
                }
                updatePreview();
                renderVariableInputs(formula);
                updateResult();
            });

            formulaBuilder.appendChild(segmentDiv);
        });
    }

    function addSegment(type) {
        const formula = formulas.find(f => f.id === currentFormulaId);
        if (!formula) return;

        const newSegment = type === 'fixed'
            ? { type: 'fixed', content: '' }
            : { type: 'variable', name: '', content: '' };

        formula.segments.push(newSegment);
        saveFormulas();
        renderFormulaBuilder(formula);
        updatePreview();
        renderVariableInputs(formula);
        updateResult();
    }

    function deleteSegment(index) {
        const formula = formulas.find(f => f.id === currentFormulaId);
        if (!formula || !formula.segments[index]) return;

        formula.segments.splice(index, 1);
        saveFormulas();
        renderFormulaBuilder(formula);
        updatePreview();
        renderVariableInputs(formula);
        updateResult();
    }

    function moveSegment(index, direction) {
        const formula = formulas.find(f => f.id === currentFormulaId);
        if (!formula || !formula.segments[index]) return;

        if (direction === 'up' && index > 0) {
            [formula.segments[index - 1], formula.segments[index]] =
                [formula.segments[index], formula.segments[index - 1]];
        } else if (direction === 'down' && index < formula.segments.length - 1) {
            [formula.segments[index], formula.segments[index + 1]] =
                [formula.segments[index + 1], formula.segments[index]];
        }

        saveFormulas();
        renderFormulaBuilder(formula);
        updatePreview();
        renderVariableInputs(formula);
        updateResult();
    }

    function updatePreview() {
        const formula = formulas.find(f => f.id === currentFormulaId);
        if (!formula) return;

        let previewHtml = '';

        formula.segments.forEach(segment => {
            if (segment.type === 'fixed') {
                previewHtml += `<span style="color: #155724;">${segment.content || '[空]'}</span>`;
            } else {
                previewHtml += `<span style="color: #004085;">[${segment.name || '未命名变量'}]</span>`;
            }
        });

        formulaPreview.innerHTML = previewHtml || '<span style="color: #6c757d;">暂无内容，请添加段落后输入文本</span>';
    }

    function renderVariableInputs(formula) {
        variableInputs.innerHTML = '';

        const variables = formula.segments.filter(s => s.type === 'variable');

        if (variables.length === 0) {
            variableInputs.innerHTML = '<p>此公式没有变量字段。</p>';
            return;
        }

        variables.forEach((variable, index) => {
            const div = document.createElement('div');
            div.className = 'variable-input';

            const label = document.createElement('label');
            label.textContent = variable.name || `变量 ${index + 1}`;
            label.htmlFor = `var-${index}`;

            const input = document.createElement('input');
            input.type = 'text';
            input.id = `var-${index}`;
            input.dataset.index = index;
            input.value = variable.content;
            input.placeholder = '输入变量值';

            input.addEventListener('input', () => {
                variable.content = input.value;
                updateResult();
            });

            div.appendChild(label);
            div.appendChild(input);
            variableInputs.appendChild(div);
        });
    }

    function updateResult() {
        const formula = formulas.find(f => f.id === currentFormulaId);
        if (!formula) return;

        let result = '';

        formula.segments.forEach(segment => {
            if (segment.type === 'fixed') {
                result += segment.content;
            } else {
                result += segment.content;
            }
        });

        resultContent.textContent = result || '输入变量值以生成结果';
    }

    function saveFormula() {
        const formula = formulas.find(f => f.id === currentFormulaId);
        if (!formula) return;

        formula.name = formulaName.value;
        saveFormulas();
        renderFormulaList();
    }

    function deleteFormula() {
        if (!confirm('确定要删除这个公式吗？此操作无法撤销。')) return;

        const index = formulas.findIndex(f => f.id === currentFormulaId);
        if (index === -1) return;

        formulas.splice(index, 1);
        saveFormulas();

        if (formulas.length > 0) {
            displayFormula(formulas[0].id);
        } else {
            createNewFormula();
        }

        renderFormulaList();
    }

    async function copyResult() {
        try {
            await navigator.clipboard.writeText(resultContent.textContent);
            alert('已复制到剪贴板！');
        } catch (err) {
            console.error('复制失败:', err);
            alert('复制失败，请手动复制。');
        }
    }

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
});