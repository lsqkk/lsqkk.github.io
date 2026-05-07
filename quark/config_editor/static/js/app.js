/**
 * Quark 配置编辑器 — 应用脚本
 * 自然表单渲染引擎，替代 JSONEditor
 */
(function () {
    'use strict';

    // ── 状态 ────────────────────────────────────────────────────
    let currentFileId = null;
    let currentData = null;
    let currentSchema = null;
    let isModified = false;
    let files = [];

    // ── DOM 引用 ────────────────────────────────────────────────
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const dom = {
        fileList: $('#fileList'),
        fileCount: $('#fileCount'),
        dirPath: $('#directoryPath'),
        searchInput: $('#searchInput'),
        panelTitle: $('#panelTitle'),
        panelDesc: $('#panelDesc'),
        panelBody: $('#panelBody'),
        saveBtn: $('#saveBtn'),
        validateBtn: $('#validateBtn'),
        refreshBtn: $('#refreshBtn'),
        createBtn: $('#createBtn'),
        commandList: $('#commandList'),
        commandOutput: $('#commandOutput'),
        clearOutputBtn: $('#clearCommandOutput'),
        toast: $('#toast'),
        createModal: $('#createModal'),
        deleteModal: $('#deleteModal'),
        deleteFileName: $('#deleteFileName'),
    };

    // ── 通知 ────────────────────────────────────────────────────
    function toast(msg, type) {
        type = type || 'info';
        const t = dom.toast;
        t.className = 'toast ' + type + ' show';
        t.innerHTML = '<i class="fas fa-' + (
            type === 'success' ? 'check-circle' :
            type === 'error' ? 'exclamation-circle' :
            type === 'warning' ? 'exclamation-triangle' : 'info-circle'
        ) + '"></i><span>' + msg + '</span>';
        clearTimeout(t._timer);
        t._timer = setTimeout(() => { t.classList.remove('show'); }, 3000);
    }

    // ── 文件列表 ────────────────────────────────────────────────
    function loadFiles() {
        dom.fileList.innerHTML = '<div class="loading-state"><div class="spinner"></div><span>加载文件列表...</span></div>';
        fetch('/api/files')
            .then(r => r.json())
            .then(d => {
                if (!d.success) throw new Error(d.error);
                files = d.data;
                renderFileList(files);
                dom.fileCount.textContent = d.count;
                dom.dirPath.textContent = d.directory || '';
            })
            .catch(e => toast('加载文件列表失败: ' + e.message, 'error'));
    }

    function renderFileList(list) {
        if (list.length === 0) {
            dom.fileList.innerHTML = '<div class="loading-state"><i class="fas fa-folder-open" style="font-size:32px;opacity:0.3"></i><span>没有配置文件</span></div>';
            return;
        }
        dom.fileList.innerHTML = list.map(f => {
            const id = escAttr(f.id || f.name);
            const isActive = currentFileId === (f.id || f.name);
            return `<div class="file-item${isActive ? ' active' : ''}" data-file-id="${id}">
                <div class="file-item-icon"><i class="fas fa-file-code"></i></div>
                <div class="file-item-info">
                    <div class="file-item-name">${escHtml(f.name)}</div>
                    <div class="file-item-meta">${escHtml(f.group || '')} · ${formatSize(f.size)}</div>
                </div>
                <span class="file-item-badge">${f.error ? '错误' : (f.keys && f.keys.length ? f.keys.length + ' 键' : '')}</span>
                <div class="file-item-actions">
                    <button class="btn-icon" data-action="validate" data-file="${id}" title="验证"><i class="fas fa-check-circle"></i></button>
                    <button class="btn-icon" data-action="delete" data-file="${id}" title="删除"><i class="fas fa-trash-alt"></i></button>
                </div>
            </div>`;
        }).join('');

        // 绑定点击
        dom.fileList.querySelectorAll('.file-item').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target.closest('.file-item-actions')) return;
                selectFile(el.dataset.fileId);
            });
        });
        // 绑定操作按钮
        dom.fileList.querySelectorAll('[data-action="validate"]').forEach(b => {
            b.addEventListener('click', (e) => { e.stopPropagation(); validateFile(b.dataset.file); });
        });
        dom.fileList.querySelectorAll('[data-action="delete"]').forEach(b => {
            b.addEventListener('click', (e) => { e.stopPropagation(); showDeleteModal(b.dataset.file); });
        });
    }

    function selectFile(fileId) {
        if (currentFileId === fileId) return;
        if (isModified && currentFileId) {
            if (!confirm('当前文件有未保存的修改，是否放弃？')) return;
        }
        loadFile(fileId);
    }

    function loadFile(fileId) {
        currentFileId = fileId;
        isModified = false;
        updateButtons();
        dom.panelBody.innerHTML = '<div class="loading-state"><div class="spinner"></div><span>加载中...</span></div>';
        dom.panelTitle.textContent = fileId;

        // 并行加载文件数据和 schema
        Promise.all([
            fetch('/api/file/' + encodeURIComponent(fileId)).then(r => r.json()),
            fetch('/api/schema/' + encodeURIComponent(fileId)).then(r => r.json())
        ]).then(([fileData, schemaData]) => {
            if (!fileData.success) throw new Error(fileData.error);
            currentData = fileData.data;
            currentSchema = (schemaData && schemaData.success && schemaData.data) ? schemaData.data : null;

            dom.panelTitle.textContent = currentSchema ? (currentSchema.title || fileId) : fileId;
            dom.panelDesc.textContent = currentSchema ? (currentSchema.description || '') : '';
            renderForm(currentData, currentSchema);
            updateButtons();
        }).catch(e => {
            dom.panelBody.innerHTML = '<div class="loading-state" style="color:#dc2626"><i class="fas fa-exclamation-circle" style="font-size:32px"></i><span>加载失败: ' + escHtml(e.message) + '</span></div>';
        });
    }

    // ── 表单渲染 ────────────────────────────────────────────────
    function renderForm(data, schema) {
        if (!schema) {
            renderGenericForm(data);
            return;
        }

        let html = '';

        if (schema.sections) {
            for (const section of schema.sections) {
                if (section.type === 'array') {
                    html += renderArraySection(data, section);
                } else if (section.fields) {
                    html += renderFieldsSection(data, section);
                }
            }
        } else if (schema.type === 'array' && schema.root_array) {
            html += renderRootArray(data, schema);
        } else if (schema.type === 'keyval') {
            html += renderKeyValSection(data, schema);
        } else if (schema.type === 'keyval_obj') {
            html += renderKeyValObjSection(data, schema);
        } else if (schema.fields) {
            html += renderFieldsSection(data, { fields: schema.fields });
        } else {
            renderGenericForm(data);
            return;
        }

        dom.panelBody.innerHTML = html;
        bindFormEvents();
    }

    function renderFieldsSection(data, section) {
        let html = '<div class="form-section">';
        if (section.title) {
            html += '<div class="form-section-header">';
            html += '<div class="form-section-title">' + escHtml(section.title) + '</div>';
            if (section.description) html += '<div class="form-section-desc">' + escHtml(section.description) + '</div>';
            html += '</div>';
        }
        html += '<div class="form-grid">';
        for (const [key, field] of Object.entries(section.fields)) {
            const val = getByPath(data, key);
            html += renderField(key, field, val);
        }
        html += '</div></div>';
        return html;
    }

    function renderField(key, field, value) {
        let cls = 'form-field';
        if (field.type === 'textarea') cls += ' full-width';

        let html = '<div class="' + cls + '">';
        html += '<label class="form-label">' + escHtml(field.label || key) + '</label>';
        if (field.description) html += '<span class="form-hint">' + escHtml(field.description) + '</span>';

        const name = 'field_' + key.replace(/\./g, '__');
        const val = value !== undefined && value !== null ? value : '';

        switch (field.type) {
            case 'textarea':
                html += '<textarea class="form-textarea" name="' + name + '" data-key="' + escAttr(key) + '">' + escHtml(String(val)) + '</textarea>';
                break;
            case 'number':
                html += '<input class="form-input" type="number" name="' + name + '" data-key="' + escAttr(key) + '" value="' + escAttr(String(val)) + '" step="any">';
                break;
            case 'toggle':
                html += '<div class="toggle-wrapper">';
                html += '<span class="toggle-label">' + (val ? '开启' : '关闭') + '</span>';
                html += '<label class="toggle"><input type="checkbox" name="' + name + '" data-key="' + escAttr(key) + '"' + (val ? ' checked' : '') + '><span class="toggle-slider"></span></label>';
                html += '</div>';
                break;
            case 'select':
                html += '<select class="form-select" name="' + name + '" data-key="' + escAttr(key) + '">';
                for (const opt of (field.options || [])) {
                    html += '<option value="' + escAttr(opt.value) + '"' + (String(val) === String(opt.value) ? ' selected' : '') + '>' + escHtml(opt.label) + '</option>';
                }
                html += '</select>';
                break;
            case 'color':
                html += '<div class="form-color-wrapper">';
                html += '<input class="form-color" type="color" name="' + name + '_color" value="' + escAttr(String(val || '#000000')) + '" data-key="' + escAttr(key) + '">';
                html += '<input class="form-input" type="text" name="' + name + '" value="' + escAttr(String(val || '')) + '" data-key="' + escAttr(key) + '" data-sync="' + name + '_color' + '">';
                html += '</div>';
                break;
            case 'url':
                html += '<input class="form-input" type="url" name="' + name + '" data-key="' + escAttr(key) + '" value="' + escAttr(String(val)) + '" placeholder="https://...">';
                break;
            default: // text
                html += '<input class="form-input" type="text" name="' + name + '" data-key="' + escAttr(key) + '" value="' + escAttr(String(val)) + '">';
        }
        html += '</div>';
        return html;
    }

    function renderArraySection(data, section) {
        const arr = getByPath(data, section.key) || [];
        let html = '<div class="form-section">';
        html += '<div class="form-section-header">';
        html += '<div class="form-section-title">' + escHtml(section.title || section.key) + '</div>';
        if (section.description) html += '<div class="form-section-desc">' + escHtml(section.description) + '</div>';
        html += '</div>';
        html += '<div class="array-list" data-array-key="' + escAttr(section.key) + '" data-flat="' + (section.flat ? '1' : '0') + '">';

        for (let i = 0; i < arr.length; i++) {
            if (section.flat) {
                html += renderFlatArrayItem(section, arr[i], i);
            } else {
                html += renderArrayItem(section.item_schema, arr[i], i);
            }
        }

        html += '</div>';
        html += '<button class="array-add-btn" data-array-add="' + escAttr(section.key) + '"><i class="fas fa-plus"></i> 添加' + (section.title || '项目') + '</button>';
        html += '</div>';
        return html;
    }

    function renderRootArray(data, schema) {
        const arr = Array.isArray(data) ? data : [];
        let html = '<div class="form-section">';
        html += '<div class="form-section-header">';
        html += '<div class="form-section-title">' + escHtml(schema.title || '列表') + '</div>';
        if (schema.description) html += '<div class="form-section-desc">' + escHtml(schema.description) + '</div>';
        html += '</div>';
        html += '<div class="array-list" data-array-key="__root__" data-root-array="1">';
        for (let i = 0; i < arr.length; i++) {
            html += renderArrayItem(schema.item_schema, arr[i], i);
        }
        html += '</div>';
        html += '<button class="array-add-btn" data-array-add="__root__"><i class="fas fa-plus"></i> 添加项目</button>';
        html += '</div>';
        return html;
    }

    function renderArrayItem(itemSchema, item, index) {
        let html = '<div class="array-item" data-index="' + index + '">';
        html += '<div class="array-item-content">';
        for (const [key, field] of Object.entries(itemSchema)) {
            // 跳过嵌套数组定义（作为元数据）
            if (field && typeof field === 'object' && field.type === 'array') continue;
            const val = item && item[key] !== undefined ? item[key] : '';
            html += '<div class="form-field">';
            html += '<label class="form-label">' + escHtml(field.label || key) + '</label>';
            const name = 'arr_' + index + '_' + key;
            html += renderSimpleInput(field, name, val);
            html += '</div>';
        }
        html += '</div>';
        html += '<div class="array-item-actions">';
        html += '<button class="btn-icon array-item-up" title="上移"><i class="fas fa-chevron-up"></i></button>';
        html += '<button class="btn-icon array-item-down" title="下移"><i class="fas fa-chevron-down"></i></button>';
        html += '<button class="btn-icon array-item-remove" title="删除" style="color:var(--q-danger)"><i class="fas fa-times"></i></button>';
        html += '</div>';
        html += '</div>';
        return html;
    }

    function renderFlatArrayItem(section, value, index) {
        let html = '<div class="flat-array-item" data-index="' + index + '">';
        html += '<span style="font-size:12px;color:var(--q-text-muted);min-width:24px">' + (index + 1) + '.</span>';
        const name = 'flat_' + index + '_val';
        if (section.item_schema && section.item_schema.value) {
            const field = section.item_schema.value;
            html += renderSimpleInput(field, name, value !== undefined ? value : '');
        } else {
            html += '<input class="form-input" type="text" name="' + name + '" value="' + escAttr(String(value || '')) + '">';
        }
        html += '<button class="btn-icon flat-item-remove" title="删除" style="color:var(--q-danger)"><i class="fas fa-times"></i></button>';
        html += '</div>';
        return html;
    }

    function renderSimpleInput(field, name, val) {
        switch (field.type) {
            case 'textarea':
                return '<textarea class="form-textarea" name="' + name + '">' + escHtml(String(val || '')) + '</textarea>';
            case 'number':
                return '<input class="form-input" type="number" name="' + name + '" value="' + escAttr(String(val)) + '" step="any">';
            case 'select':
                let s = '<select class="form-select" name="' + name + '">';
                for (const opt of (field.options || [])) {
                    s += '<option value="' + escAttr(opt.value) + '"' + (String(val) === String(opt.value) ? ' selected' : '') + '>' + escHtml(opt.label) + '</option>';
                }
                s += '</select>';
                return s;
            case 'url':
                return '<input class="form-input" type="url" name="' + name + '" value="' + escAttr(String(val || '')) + '" placeholder="https://...">';
            case 'color':
                return `<div class="form-color-wrapper">
                    <input class="form-color" type="color" value="${escAttr(String(val || '#000000'))}" data-sync-name="${name}">
                    <input class="form-input" type="text" name="${name}" value="${escAttr(String(val || ''))}">
                </div>`;
            default:
                return '<input class="form-input" type="text" name="' + name + '" value="' + escAttr(String(val || '')) + '">';
        }
    }

    function renderKeyValSection(data, schema) {
        const obj = (data && typeof data === 'object' && !Array.isArray(data)) ? data : {};
        let html = '<div class="form-section">';
        html += '<div class="form-section-header">';
        html += '<div class="form-section-title">' + escHtml(schema.title || '键值映射') + '</div>';
        if (schema.description) html += '<div class="form-section-desc">' + escHtml(schema.description) + '</div>';
        html += '</div>';
        html += '<div class="keyval-list" data-keyval="1">';
        for (const [k, v] of Object.entries(obj)) {
            html += '<div class="keyval-item">';
            html += '<input class="form-input" type="text" placeholder="' + escAttr(schema.key_label || '键') + '" value="' + escAttr(k) + '" data-keyval-key="1">';
            html += '<input class="form-input" type="text" placeholder="' + escAttr(schema.value_label || '值') + '" value="' + escAttr(String(v)) + '" data-keyval-value="1">';
            html += '<button class="btn-icon keyval-remove" title="删除" style="color:var(--q-danger)"><i class="fas fa-times"></i></button>';
            html += '</div>';
        }
        html += '</div>';
        html += '<button class="array-add-btn" data-keyval-add="1"><i class="fas fa-plus"></i> 添加条目</button>';
        html += '</div>';
        return html;
    }

    function renderKeyValObjSection(data, schema) {
        const obj = (data && typeof data === 'object' && !Array.isArray(data)) ? data : {};
        let html = '<div class="form-section">';
        html += '<div class="form-section-header">';
        html += '<div class="form-section-title">' + escHtml(schema.title || '分类列表') + '</div>';
        if (schema.description) html += '<div class="form-section-desc">' + escHtml(schema.description) + '</div>';
        html += '</div>';
        for (const [key, items] of Object.entries(obj)) {
            html += '<div style="margin-bottom:20px">';
            html += '<h4 style="font-size:14px;margin-bottom:10px;display:flex;align-items:center;gap:8px">' + escHtml(key) + '</h4>';
            html += '<div class="array-list" data-keyval-obj-key="' + escAttr(key) + '">';
            if (Array.isArray(items)) {
                for (let i = 0; i < items.length; i++) {
                    html += renderArrayItem(schema.value_schema.item_schema, items[i], i);
                }
            }
            html += '</div>';
            html += '<button class="array-add-btn" data-array-add="keyval_obj_' + escAttr(key) + '"><i class="fas fa-plus"></i> 添加项目</button>';
            html += '</div>';
        }
        html += '</div>';
        return html;
    }

    function renderGenericForm(data) {
        let html = '<div class="generic-editor-notice"><i class="fas fa-info-circle"></i> 该文件暂无定制表单，以下为通用键值编辑器。保存时按 JSON 格式写入。</div>';
        html += '<div class="form-section"><div class="generic-fields" data-generic="1">';
        if (data && typeof data === 'object' && !Array.isArray(data)) {
            for (const [k, v] of Object.entries(data)) {
                html += renderGenericField(k, v);
            }
        } else if (Array.isArray(data)) {
            html += '<p style="color:var(--q-text-muted)">根节点为数组，请使用有 schema 的文件以获得更好的编辑体验。</p>';
            html += '<textarea class="form-textarea" id="genericJsonArea" style="min-height:300px;font-family:monospace">' + escHtml(JSON.stringify(data, null, 2)) + '</textarea>';
        }
        html += '</div>';
        html += '<button class="array-add-btn" style="margin-top:12px" data-generic-add="1"><i class="fas fa-plus"></i> 添加字段</button>';
        html += '</div>';
        dom.panelBody.innerHTML = html;
        bindFormEvents();
    }

    function renderGenericField(key, value) {
        const type = typeof value;
        let valInput = '';
        if (type === 'boolean') {
            valInput = '<select class="form-select" data-generic-value="1"><option value="true"' + (value ? ' selected' : '') + '>true</option><option value="false"' + (!value ? ' selected' : '') + '>false</option></select>';
        } else if (type === 'number') {
            valInput = '<input class="form-input" type="number" value="' + value + '" data-generic-value="1" step="any">';
        } else if (type === 'string') {
            if (value.length > 60) {
                valInput = '<textarea class="form-textarea" data-generic-value="1">' + escHtml(value) + '</textarea>';
            } else {
                valInput = '<input class="form-input" type="text" value="' + escAttr(value) + '" data-generic-value="1">';
            }
        } else {
            valInput = '<textarea class="form-textarea" data-generic-value="1">' + escHtml(JSON.stringify(value)) + '</textarea>';
        }
        return `<div class="generic-field-row" style="display:flex;gap:10px;align-items:center">
            <input class="form-input" type="text" value="${escAttr(key)}" data-generic-key="1" style="flex:0.35">
            ${valInput}
            <button class="btn-icon generic-remove" title="删除" style="color:var(--q-danger)"><i class="fas fa-times"></i></button>
        </div>`;
    }

    // ── 表单事件绑定 ─────────────────────────────────────────────
    function bindFormEvents() {
        // 修改标记
        dom.panelBody.querySelectorAll('input, textarea, select').forEach(el => {
            el.addEventListener('change', () => { isModified = true; updateButtons(); });
            el.addEventListener('input', () => { isModified = true; updateButtons(); });
        });

        // 颜色同步
        dom.panelBody.querySelectorAll('.form-color').forEach(el => {
            el.addEventListener('input', function () {
                const syncName = this.dataset.syncName;
                if (syncName) {
                    const target = dom.panelBody.querySelector('[name="' + syncName + '"]');
                    if (target) target.value = this.value;
                }
            });
        });

        // 数组添加
        dom.panelBody.querySelectorAll('[data-array-add]').forEach(btn => {
            btn.addEventListener('click', function () {
                const key = this.dataset.arrayAdd;
                const container = key === '__root__'
                    ? dom.panelBody.querySelector('[data-root-array="1"]')
                    : dom.panelBody.querySelector('[data-array-key="' + CSS.escape(key) + '"]');
                if (!container) return;
                if (key.startsWith('keyval_obj_')) {
                    const realKey = key.replace('keyval_obj_', '');
                    addArrayItemTo(container, realKey);
                } else if (container.dataset.flat === '1') {
                    addFlatItemTo(container);
                } else if (container.dataset.rootArray === '1') {
                    addRootArrayItemTo(container);
                } else {
                    addArrayItemTo(container, key);
                }
                isModified = true;
                updateButtons();
                bindFormEvents();
            });
        });

        // 数组项操作
        dom.panelBody.querySelectorAll('.array-item-remove, .flat-item-remove').forEach(btn => {
            btn.addEventListener('click', function () {
                this.closest('.array-item, .flat-array-item').remove();
                isModified = true;
                updateButtons();
            });
        });

        dom.panelBody.querySelectorAll('.array-item-up').forEach(btn => {
            btn.addEventListener('click', function () {
                const item = this.closest('.array-item');
                const prev = item.previousElementSibling;
                if (prev && prev.classList.contains('array-item')) {
                    item.parentNode.insertBefore(item, prev);
                    isModified = true;
                    updateButtons();
                }
            });
        });

        dom.panelBody.querySelectorAll('.array-item-down').forEach(btn => {
            btn.addEventListener('click', function () {
                const item = this.closest('.array-item');
                const next = item.nextElementSibling;
                if (next && next.classList.contains('array-item')) {
                    item.parentNode.insertBefore(next, item);
                    isModified = true;
                    updateButtons();
                }
            });
        });

        // 键值对
        dom.panelBody.querySelectorAll('.keyval-remove').forEach(btn => {
            btn.addEventListener('click', function () {
                this.closest('.keyval-item').remove();
                isModified = true;
                updateButtons();
            });
        });

        dom.panelBody.querySelectorAll('[data-keyval-add]').forEach(btn => {
            btn.addEventListener('click', function () {
                const list = this.previousElementSibling;
                const item = document.createElement('div');
                item.className = 'keyval-item';
                item.innerHTML = `<input class="form-input" type="text" placeholder="键" data-keyval-key="1">
                    <input class="form-input" type="text" placeholder="值" data-keyval-value="1">
                    <button class="btn-icon keyval-remove" title="删除" style="color:var(--q-danger)"><i class="fas fa-times"></i></button>`;
                list.appendChild(item);
                isModified = true;
                updateButtons();
                bindFormEvents();
            });
        });

        // 通用编辑器
        dom.panelBody.querySelectorAll('[data-generic-add]').forEach(btn => {
            btn.addEventListener('click', function () {
                const container = dom.panelBody.querySelector('[data-generic="1"]');
                const row = document.createElement('div');
                row.className = 'generic-field-row';
                row.style.cssText = 'display:flex;gap:10px;align-items:center';
                row.innerHTML = `<input class="form-input" type="text" placeholder="字段名" data-generic-key="1" style="flex:0.35">
                    <input class="form-input" type="text" placeholder="值" data-generic-value="1" style="flex:1">
                    <button class="btn-icon generic-remove" title="删除" style="color:var(--q-danger)"><i class="fas fa-times"></i></button>`;
                container.appendChild(row);
                isModified = true;
                updateButtons();
                bindFormEvents();
            });
        });

        dom.panelBody.querySelectorAll('.generic-remove').forEach(btn => {
            btn.addEventListener('click', function () {
                this.closest('.generic-field-row').remove();
                isModified = true;
                updateButtons();
            });
        });
    }

    function addArrayItemTo(container, key) {
        const div = document.createElement('div');
        div.className = 'array-item';
        div.innerHTML = '<div class="array-item-content"></div>' +
            '<div class="array-item-actions">' +
            '<button class="btn-icon array-item-up"><i class="fas fa-chevron-up"></i></button>' +
            '<button class="btn-icon array-item-down"><i class="fas fa-chevron-down"></i></button>' +
            '<button class="btn-icon array-item-remove" style="color:var(--q-danger)"><i class="fas fa-times"></i></button>' +
            '</div>';
        container.appendChild(div);
    }

    function addFlatItemTo(container) {
        const div = document.createElement('div');
        div.className = 'flat-array-item';
        const idx = container.children.length;
        div.innerHTML = '<span style="font-size:12px;color:var(--q-text-muted);min-width:24px">' + (idx + 1) + '.</span>' +
            '<input class="form-input" type="text" style="flex:1">' +
            '<button class="btn-icon flat-item-remove" style="color:var(--q-danger)"><i class="fas fa-times"></i></button>';
        container.appendChild(div);
    }

    function addRootArrayItemTo(container) {
        addArrayItemTo(container, '__root__');
    }

    // ── 表单值收集 ───────────────────────────────────────────────
    function collectFormData() {
        if (currentSchema) {
            return collectFromSchema(currentSchema);
        }
        // 通用编辑器或 JSON 文本区回退
        const jsonArea = $('#genericJsonArea');
        if (jsonArea) {
            try { return JSON.parse(jsonArea.value); } catch (e) { toast('JSON 格式错误: ' + e.message, 'error'); return null; }
        }
        return collectGenericForm();
    }

    function collectFromSchema(schema) {
        if (schema.type === 'array' && schema.root_array) {
            return collectArray('__root__', schema.item_schema, true);
        }
        if (schema.type === 'keyval') {
            return collectKeyVal();
        }
        if (schema.type === 'keyval_obj') {
            return collectKeyValObj(schema);
        }
        if (schema.sections) {
            const result = Array.isArray(currentData) ? [] : {};
            for (const section of schema.sections) {
                if (section.type === 'array' && section.key) {
                    setByPath(result, section.key, collectArray(section.key, section.item_schema, false, section.flat));
                } else if (section.fields) {
                    for (const [key, field] of Object.entries(section.fields)) {
                        setByPath(result, key, getFieldValue(key, field));
                    }
                }
            }
            return result;
        }
        if (schema.fields) {
            const result = {};
            for (const [key, field] of Object.entries(schema.fields)) {
                setByPath(result, key, getFieldValue(key, field));
            }
            return result;
        }
        return currentData;
    }

    function getFieldValue(key, field) {
        const name = 'field_' + key.replace(/\./g, '__');
        const el = dom.panelBody.querySelector('[name="' + CSS.escape(name) + '"]');
        if (!el) return null;

        if (field.type === 'toggle') return el.checked;
        if (field.type === 'number') {
            const v = parseFloat(el.value);
            return isNaN(v) ? (el.value || 0) : v;
        }
        return el.value;
    }

    function collectArray(key, itemSchema, isRoot, isFlat) {
        const result = [];
        const container = isRoot
            ? dom.panelBody.querySelector('[data-root-array="1"]')
            : dom.panelBody.querySelector('[data-array-key="' + CSS.escape(key) + '"]');
        if (!container) return result;

        const items = container.querySelectorAll(isFlat ? '.flat-array-item' : '.array-item');
        items.forEach((item, idx) => {
            if (isFlat) {
                const input = item.querySelector('input');
                if (input) result.push(input.value);
            } else {
                const obj = {};
                for (const [k, field] of Object.entries(itemSchema)) {
                    if (field && typeof field === 'object' && field.type === 'array') continue;
                    const name = 'arr_' + idx + '_' + k;
                    const el = item.querySelector('[name="' + CSS.escape(name) + '"]');
                    if (!el) continue;
                    if (field.type === 'toggle') obj[k] = el.checked;
                    else if (field.type === 'number') {
                        const v = parseFloat(el.value);
                        obj[k] = isNaN(v) ? (el.value || 0) : v;
                    } else obj[k] = el.value;
                }
                result.push(obj);
            }
        });
        return result;
    }

    function collectKeyVal() {
        const result = {};
        dom.panelBody.querySelectorAll('.keyval-item').forEach(item => {
            const keyEl = item.querySelector('[data-keyval-key]');
            const valEl = item.querySelector('[data-keyval-value]');
            if (keyEl && valEl && keyEl.value.trim()) {
                result[keyEl.value.trim()] = valEl.value;
            }
        });
        return result;
    }

    function collectKeyValObj(schema) {
        const result = {};
        dom.panelBody.querySelectorAll('[data-keyval-obj-key]').forEach(list => {
            const key = list.dataset.keyvalObjKey;
            result[key] = [];
            list.querySelectorAll('.array-item').forEach((item, idx) => {
                const obj = {};
                for (const [k, field] of Object.entries(schema.value_schema.item_schema)) {
                    const name = 'arr_' + idx + '_' + k;
                    const el = item.querySelector('[name="' + CSS.escape(name) + '"]');
                    if (!el) continue;
                    if (field.type === 'toggle') obj[k] = el.checked;
                    else if (field.type === 'number') {
                        const v = parseFloat(el.value);
                        obj[k] = isNaN(v) ? (el.value || 0) : v;
                    } else obj[k] = el.value;
                }
                result[key].push(obj);
            });
        });
        return result;
    }

    function collectGenericForm() {
        const result = {};
        dom.panelBody.querySelectorAll('.generic-field-row').forEach(row => {
            const keyEl = row.querySelector('[data-generic-key]');
            const valEl = row.querySelector('[data-generic-value]');
            if (keyEl && valEl && keyEl.value.trim()) {
                let val = valEl.value;
                if (valEl.tagName === 'SELECT') {
                    val = val === 'true' ? true : val === 'false' ? false : val;
                }
                result[keyEl.value.trim()] = val;
            }
        });
        return result;
    }

    // ── 路径工具 ────────────────────────────────────────────────
    function getByPath(obj, path) {
        const parts = path.split('.');
        let cur = obj;
        for (const p of parts) {
            if (cur === null || cur === undefined) return undefined;
            cur = cur[p];
        }
        return cur;
    }

    function setByPath(obj, path, value) {
        const parts = path.split('.');
        let cur = obj;
        for (let i = 0; i < parts.length - 1; i++) {
            if (!(parts[i] in cur) || typeof cur[parts[i]] !== 'object') {
                cur[parts[i]] = {};
            }
            cur = cur[parts[i]];
        }
        cur[parts[parts.length - 1]] = value;
    }

    // ── 保存 / 验证 ──────────────────────────────────────────────
    function saveFile() {
        if (!currentFileId) return toast('请先选择文件', 'warning');

        const data = collectFormData();
        if (data === null) return; // 收集失败

        dom.saveBtn.disabled = true;
        dom.saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 保存中...';

        fetch('/api/file/' + encodeURIComponent(currentFileId), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: data })
        }).then(r => r.json()).then(d => {
            if (!d.success) throw new Error(d.error);
            isModified = false;
            currentData = data;
            updateButtons();
            toast('文件保存成功', 'success');
            loadFiles(); // 刷新文件列表
        }).catch(e => {
            toast('保存失败: ' + e.message, 'error');
        }).finally(() => {
            updateButtons();
        });
    }

    function validateFile(fileId) {
        fetch('/api/validate/' + encodeURIComponent(fileId))
            .then(r => r.json())
            .then(d => {
                if (d.valid) toast('JSON 格式正确', 'success');
                else toast('格式错误: ' + d.message, 'error');
            })
            .catch(e => toast('验证失败: ' + e.message, 'error'));
    }

    function updateButtons() {
        dom.saveBtn.disabled = !currentFileId;
        if (!currentFileId) {
            dom.saveBtn.innerHTML = '<i class="fas fa-save"></i> 保存';
        } else if (isModified) {
            dom.saveBtn.innerHTML = '<i class="fas fa-save"></i> 保存 <span style="font-size:11px;opacity:0.7">●</span>';
        } else {
            dom.saveBtn.innerHTML = '<i class="fas fa-save"></i> 保存';
        }
        dom.validateBtn.disabled = !currentFileId;
    }

    // ── 模态框 ────────────────────────────────────────────────────
    function showCreateModal() {
        dom.createModal.classList.add('active');
        $('#fileName').focus();
    }

    function hideCreateModal() {
        dom.createModal.classList.remove('active');
        $('#fileName').value = '';
    }

    function createFile() {
        const name = $('#fileName').value.trim();
        if (!name) return toast('请输入文件名', 'warning');
        const root = $('#rootSelect') ? $('#rootSelect').value : 'src/config/json';
        const tpl = $('#templateSelect') ? $('#templateSelect').value : 'empty';

        let content = {};
        if (tpl === 'empty') content = {};
        else if (tpl === 'config') content = { name: name, description: '', version: '1.0.0', settings: {} };
        else if (tpl === 'settings') content = { theme: 'light', language: 'zh-CN', enableNotifications: true };
        else if (tpl === 'data') content = { data: [], metadata: {} };

        fetch('/api/file/new', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: name, root: root, content: content })
        }).then(r => r.json()).then(d => {
            if (!d.success) throw new Error(d.error);
            toast('文件创建成功', 'success');
            hideCreateModal();
            loadFiles();
        }).catch(e => toast('创建失败: ' + e.message, 'error'));
    }

    function showDeleteModal(fileId) {
        dom.deleteFileName.textContent = fileId;
        dom.deleteModal.dataset.fileId = fileId;
        dom.deleteModal.classList.add('active');
    }

    function hideDeleteModal() {
        dom.deleteModal.classList.remove('active');
    }

    function deleteFile() {
        const fileId = dom.deleteModal.dataset.fileId;
        if (!fileId) return;
        fetch('/api/file/' + encodeURIComponent(fileId), { method: 'DELETE' })
            .then(r => r.json()).then(d => {
                if (!d.success) throw new Error(d.error);
                toast('文件已删除', 'success');
                hideDeleteModal();
                if (currentFileId === fileId) {
                    currentFileId = null;
                    currentData = null;
                    currentSchema = null;
                    dom.panelBody.innerHTML = '<div class="no-file-selected"><i class="fas fa-file-alt"></i><p>选择左侧文件开始编辑</p></div>';
                    dom.panelTitle.textContent = '未选择文件';
                    dom.panelDesc.textContent = '';
                }
                updateButtons();
                loadFiles();
            }).catch(e => toast('删除失败: ' + e.message, 'error'));
    }

    // ── 命令 ──────────────────────────────────────────────────────
    function loadCommands() {
        fetch('/api/commands')
            .then(r => r.json()).then(d => {
                if (!d.success) throw new Error(d.error);
                dom.commandList.innerHTML = (d.data || []).map(c =>
                    '<button class="command-card" data-command="' + escAttr(c.id) + '"><strong>' + escHtml(c.label) + '</strong><span>' + escHtml(c.description || '') + '</span></button>'
                ).join('');
                dom.commandList.querySelectorAll('[data-command]').forEach(b => {
                    b.addEventListener('click', () => runCommand(b.dataset.command, b));
                });
            }).catch(() => {});
    }

    function runCommand(id, btn) {
        btn.disabled = true;
        dom.commandOutput.textContent = '正在执行 ' + id + '...\n';
        fetch('/api/commands/' + encodeURIComponent(id), { method: 'POST' })
            .then(r => r.json()).then(d => {
                const status = d.success ? '完成' : '失败';
                const code = typeof d.returnCode === 'number' ? ' (退出码 ' + d.returnCode + ')' : '';
                dom.commandOutput.textContent = '[' + status + '] ' + id + code + '\n\n' + (d.output || d.error || '');
                toast(id + ' ' + status, d.success ? 'success' : 'error');
            }).catch(e => {
                dom.commandOutput.textContent = '命令执行失败: ' + e.message;
                toast('命令执行失败', 'error');
            }).finally(() => { btn.disabled = false; });
    }

    // ── 工具 ──────────────────────────────────────────────────────
    function formatSize(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function escHtml(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

    function escAttr(s) { return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

    // ── 初始化 ────────────────────────────────────────────────────
    function init() {
        // 事件
        dom.refreshBtn.addEventListener('click', loadFiles);
        dom.createBtn.addEventListener('click', showCreateModal);
        dom.saveBtn.addEventListener('click', saveFile);
        dom.validateBtn.addEventListener('click', () => { if (currentFileId) validateFile(currentFileId); });
        dom.clearOutputBtn.addEventListener('click', () => { dom.commandOutput.textContent = '等待执行命令...'; });

        dom.searchInput.addEventListener('input', function () {
            const q = this.value.toLowerCase().trim();
            renderFileList(q ? files.filter(f =>
                f.name.toLowerCase().includes(q) ||
                (f.group && f.group.toLowerCase().includes(q)) ||
                (f.id && f.id.toLowerCase().includes(q))
            ) : files);
        });

        // 模态框
        $('#createModal .modal-confirm').addEventListener('click', createFile);
        $('#createModal .modal-cancel').addEventListener('click', hideCreateModal);
        $('#createModal .modal-close').addEventListener('click', hideCreateModal);
        $('#deleteModal .modal-confirm').addEventListener('click', deleteFile);
        $('#deleteModal .modal-cancel').addEventListener('click', hideDeleteModal);
        $('#deleteModal .modal-close').addEventListener('click', hideDeleteModal);

        // 快捷键
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                if (currentFileId) saveFile();
            }
        });

        // 初始加载
        loadFiles();
        loadCommands();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
