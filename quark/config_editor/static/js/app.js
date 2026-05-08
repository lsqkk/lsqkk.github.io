/**
 * Quark 配置编辑器 — 应用脚本
 * 自然表单渲染引擎
 */
(function () {
    'use strict';

    // ── 状态 ────────────────────────────────────────────────────
    let currentFileId = null;
    let currentData = null;
    let currentSchema = null;
    let isModified = false;
    let files = [];
    /** @type {Object<string, string>} fileId → schema title */
    let schemaTitleMap = {};

    // ── DOM 引用 ────────────────────────────────────────────────
    const $ = (sel) => document.querySelector(sel);

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
        t._timer = setTimeout(function () { t.classList.remove('show'); }, 3000);
    }

    // ── Schema 标题映射（用于侧栏自然语言显示）─────────────────
    function buildSchemaTitleMap() {
        return fetch('/api/schemas')
            .then(function (r) { return r.json(); })
            .then(function (d) {
                if (!d.success) return;
                var ids = d.data || [];
                // 并行获取所有 schema 的 title
                return Promise.all(ids.map(function (id) {
                    return fetch('/api/schema/' + encodeURIComponent(id))
                        .then(function (r) { return r.json(); })
                        .then(function (sd) {
                            if (sd && sd.success && sd.data && sd.data.title) {
                                schemaTitleMap[id] = sd.data.title;
                            }
                        })
                        .catch(function () {});
                }));
            })
            .catch(function () {});
    }

    function getDisplayName(file) {
        var id = file.id || file.name;
        if (schemaTitleMap[id]) return schemaTitleMap[id];
        // 去掉 .json 后缀作为兜底
        return file.name.replace(/\.json$/i, '');
    }

    // ── 文件列表 ────────────────────────────────────────────────
    function loadFiles() {
        dom.fileList.innerHTML = '<div class="loading-state"><div class="spinner"></div><span>加载文件列表...</span></div>';
        fetch('/api/files')
            .then(function (r) { return r.json(); })
            .then(function (d) {
                if (!d.success) throw new Error(d.error);
                files = d.data;
                renderFileList(files);
                dom.fileCount.textContent = d.count;
                dom.dirPath.textContent = d.directory || '';
            })
            .catch(function (e) { toast('加载文件列表失败: ' + e.message, 'error'); });
    }

    function renderFileList(list) {
        var html = '';

        // 文件列表项
        if (list.length === 0) {
            html += '<div class="loading-state"><i class="fas fa-folder-open" style="font-size:32px;opacity:0.3"></i><span>没有配置文件</span></div>';
        } else {
            html += list.map(function (f) {
                var id = escAttr(f.id || f.name);
                var isActive = currentFileId === (f.id || f.name);
                var displayName = getDisplayName(f);
                return '<div class="file-item' + (isActive ? ' active' : '') + '" data-file-id="' + id + '">' +
                    '<div class="file-item-icon"><i class="fas fa-sliders-h"></i></div>' +
                    '<div class="file-item-info">' +
                    '<div class="file-item-name">' + escHtml(displayName) + '</div>' +
                    '<div class="file-item-meta">' + escHtml(f.name) + ' · ' + formatSize(f.size) + '</div>' +
                    '</div>' +
                    (f.error ? '<span class="file-item-badge">错误</span>' : '') +
                    '<div class="file-item-actions">' +
                    '<button class="btn-icon" data-action="validate" data-file="' + id + '" title="验证"><i class="fas fa-check-circle"></i></button>' +
                    '<button class="btn-icon" data-action="delete" data-file="' + id + '" title="删除"><i class="fas fa-trash-alt"></i></button>' +
                    '</div>' +
                    '</div>';
            }).join('');
        }

        // 分隔线 + 维护命令入口
        html += '<div class="sidebar-sep"></div>';
        var cmdActive = currentFileId === '__commands__';
        html += '<div class="file-item' + (cmdActive ? ' active' : '') + '" data-file-id="__commands__">' +
            '<div class="file-item-icon" style="background:' + (cmdActive ? 'rgba(255,255,255,0.2)' : 'var(--q-primary-light)') + ';color:' + (cmdActive ? '#fff' : 'var(--q-primary)') + '"><i class="fas fa-terminal"></i></div>' +
            '<div class="file-item-info">' +
            '<div class="file-item-name">维护命令</div>' +
            '<div class="file-item-meta">构建 / 检查 / 部署</div>' +
            '</div>' +
            '</div>';

        dom.fileList.innerHTML = html;

        // 绑定点击
        dom.fileList.querySelectorAll('.file-item').forEach(function (el) {
            el.addEventListener('click', function (e) {
                if (e.target.closest('.file-item-actions')) return;
                selectFile(el.dataset.fileId);
            });
        });
        // 绑定操作按钮
        dom.fileList.querySelectorAll('[data-action="validate"]').forEach(function (b) {
            b.addEventListener('click', function (e) { e.stopPropagation(); validateFile(b.dataset.file); });
        });
        dom.fileList.querySelectorAll('[data-action="delete"]').forEach(function (b) {
            b.addEventListener('click', function (e) { e.stopPropagation(); showDeleteModal(b.dataset.file); });
        });
    }

    function selectFile(fileId) {
        if (currentFileId === fileId) return;
        if (fileId === '__commands__') {
            if (isModified && currentFileId) {
                if (!confirm('当前文件有未保存的修改，是否放弃？')) return;
            }
            currentFileId = '__commands__';
            currentData = null;
            currentSchema = null;
            isModified = false;
            dom.panelTitle.textContent = '维护命令';
            dom.panelDesc.textContent = '在本地仓库中执行 Quark 和 npm 命令';
            renderCommandPanel();
            updateButtons();
            renderFileList(files); // 刷新侧栏高亮
            return;
        }
        if (isModified && currentFileId && currentFileId !== '__commands__') {
            if (!confirm('当前文件有未保存的修改，是否放弃？')) return;
        }
        loadFile(fileId);
    }

    function loadFile(fileId) {
        currentFileId = fileId;
        currentSchema = null;
        isModified = false;
        updateButtons();
        dom.panelBody.innerHTML = '<div class="loading-state"><div class="spinner"></div><span>加载中...</span></div>';
        dom.panelTitle.textContent = getDisplayName({ id: fileId, name: fileId.split('/').pop() });

        Promise.all([
            fetch('/api/file/' + encodeURIComponent(fileId)).then(function (r) { return r.json(); }),
            fetch('/api/schema/' + encodeURIComponent(fileId)).then(function (r) { return r.json(); })
        ]).then(function (results) {
            var fileData = results[0];
            var schemaData = results[1];
            if (!fileData.success) throw new Error(fileData.error);
            currentData = fileData.data;
            currentSchema = (schemaData && schemaData.success && schemaData.data) ? schemaData.data : null;

            dom.panelTitle.textContent = currentSchema ? (currentSchema.title || getDisplayName({ id: fileId, name: fileId.split('/').pop() })) : getDisplayName({ id: fileId, name: fileId.split('/').pop() });
            dom.panelDesc.textContent = currentSchema ? (currentSchema.description || '') : '';
            renderForm(currentData, currentSchema);
            updateButtons();
            renderFileList(files);
        }).catch(function (e) {
            dom.panelBody.innerHTML = '<div class="loading-state" style="color:#dc2626"><i class="fas fa-exclamation-circle" style="font-size:32px"></i><span>加载失败: ' + escHtml(e.message) + '</span></div>';
        });
    }

    // ── 命令面板渲染 ────────────────────────────────────────────
    function renderCommandPanel() {
        dom.saveBtn.style.display = 'none';
        dom.validateBtn.style.display = 'none';
        dom.panelBody.innerHTML = '<div class="loading-state"><div class="spinner"></div><span>加载命令...</span></div>';

        fetch('/api/commands')
            .then(function (r) { return r.json(); })
            .then(function (d) {
                if (!d.success) throw new Error(d.error);
                var commands = d.data || [];
                var html = '<div class="form-section">' +
                    '<div class="form-section-header">' +
                    '<div class="form-section-title">常用命令</div>' +
                    '<div class="form-section-desc">点击按钮执行对应的 Shell 命令</div>' +
                    '</div>' +
                    '<div class="command-grid" id="cmdGrid">' +
                    commands.map(function (c) {
                        return '<button class="command-card" data-command="' + escAttr(c.id) + '">' +
                            '<strong>' + escHtml(c.label) + '</strong>' +
                            '<span>' + escHtml(c.description || '') + '</span>' +
                            '</button>';
                    }).join('') +
                    '</div>' +
                    '</div>' +
                    '<div class="form-section">' +
                    '<div class="form-section-header" style="display:flex;justify-content:space-between;align-items:center">' +
                    '<div><div class="form-section-title"><i class="fas fa-terminal"></i> 命令输出</div></div>' +
                    '<button class="btn btn-ghost" id="cmdClearOutput">清空</button>' +
                    '</div>' +
                    '<pre class="command-output" id="cmdOutput" style="max-height:400px">等待执行命令...</pre>' +
                    '</div>';

                dom.panelBody.innerHTML = html;

                // 绑定命令按钮
                dom.panelBody.querySelectorAll('[data-command]').forEach(function (b) {
                    b.addEventListener('click', function () {
                        runCommand(b.dataset.command, b);
                    });
                });

                // 清空按钮
                var clearBtn = $('#cmdClearOutput');
                if (clearBtn) {
                    clearBtn.addEventListener('click', function () {
                        var out = $('#cmdOutput');
                        if (out) out.textContent = '等待执行命令...';
                    });
                }
            })
            .catch(function (e) {
                dom.panelBody.innerHTML = '<div class="loading-state" style="color:#dc2626"><span>加载命令失败: ' + escHtml(e.message) + '</span></div>';
            });
    }

    function runCommand(id, btn) {
        btn.disabled = true;
        var outputEl = $('#cmdOutput') || dom.panelBody.querySelector('.command-output');
        if (outputEl) outputEl.textContent = '正在执行 ' + id + '...\n';

        fetch('/api/commands/' + encodeURIComponent(id), { method: 'POST' })
            .then(function (r) { return r.json(); })
            .then(function (d) {
                var status = d.success ? '完成' : '失败';
                var code = typeof d.returnCode === 'number' ? ' (退出码 ' + d.returnCode + ')' : '';
                if (outputEl) outputEl.textContent = '[' + status + '] ' + id + code + '\n\n' + (d.output || d.error || '');
                toast(id + ' ' + status, d.success ? 'success' : 'error');
            })
            .catch(function (e) {
                if (outputEl) outputEl.textContent = '命令执行失败: ' + e.message;
                toast('命令执行失败', 'error');
            })
            .finally(function () { btn.disabled = false; });
    }

    // ── 文件模式时恢复按钮 ──────────────────────────────────────
    function restoreFileModeButtons() {
        dom.saveBtn.style.display = '';
        dom.validateBtn.style.display = '';
    }

    // ── 表单渲染（同前，略作调整）───────────────────────────────
    function renderForm(data, schema) {
        restoreFileModeButtons();
        if (!schema) {
            renderGenericForm(data);
            return;
        }

        var html = '';

        if (schema.sections) {
            for (var i = 0; i < schema.sections.length; i++) {
                var section = schema.sections[i];
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
        var html = '<div class="form-section">';
        if (section.title) {
            html += '<div class="form-section-header">';
            html += '<div class="form-section-title">' + escHtml(section.title) + '</div>';
            if (section.description) html += '<div class="form-section-desc">' + escHtml(section.description) + '</div>';
            html += '</div>';
        }
        html += '<div class="form-grid">';
        var keys = Object.keys(section.fields);
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var field = section.fields[key];
            var val = getByPath(data, key);
            html += renderField(key, field, val);
        }
        html += '</div></div>';
        return html;
    }

    function renderField(key, field, value) {
        var cls = 'form-field';
        if (field.type === 'textarea') cls += ' full-width';

        var html = '<div class="' + cls + '">';
        html += '<label class="form-label">' + escHtml(field.label || key) + '</label>';
        if (field.description) html += '<span class="form-hint">' + escHtml(field.description) + '</span>';

        var name = 'field_' + key.replace(/\./g, '__');
        var val = value !== undefined && value !== null ? value : '';

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
                var opts = field.options || [];
                for (var o = 0; o < opts.length; o++) {
                    html += '<option value="' + escAttr(opts[o].value) + '"' + (String(val) === String(opts[o].value) ? ' selected' : '') + '>' + escHtml(opts[o].label) + '</option>';
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
            default:
                html += '<input class="form-input" type="text" name="' + name + '" data-key="' + escAttr(key) + '" value="' + escAttr(String(val)) + '">';
        }
        html += '</div>';
        return html;
    }

    function renderArraySection(data, section) {
        var arr = getByPath(data, section.key) || [];
        var html = '<div class="form-section">';
        html += '<div class="form-section-header">';
        html += '<div class="form-section-title">' + escHtml(section.title || section.key) + '</div>';
        if (section.description) html += '<div class="form-section-desc">' + escHtml(section.description) + '</div>';
        html += '</div>';
        html += '<div class="array-list" data-array-key="' + escAttr(section.key) + '" data-flat="' + (section.flat ? '1' : '0') + '">';

        for (var i = 0; i < arr.length; i++) {
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
        var arr = Array.isArray(data) ? data : [];
        var html = '<div class="form-section">';
        html += '<div class="form-section-header">';
        html += '<div class="form-section-title">' + escHtml(schema.title || '列表') + '</div>';
        if (schema.description) html += '<div class="form-section-desc">' + escHtml(schema.description) + '</div>';
        html += '</div>';
        html += '<div class="array-list" data-array-key="__root__" data-root-array="1">';
        for (var i = 0; i < arr.length; i++) {
            html += renderArrayItem(schema.item_schema, arr[i], i);
        }
        html += '</div>';
        html += '<button class="array-add-btn" data-array-add="__root__"><i class="fas fa-plus"></i> 添加项目</button>';
        html += '</div>';
        return html;
    }

    function renderArrayItem(itemSchema, item, index) {
        var html = '<div class="array-item" data-index="' + index + '">';
        html += '<div class="array-item-content">';
        var keys = Object.keys(itemSchema);
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var field = itemSchema[key];
            if (field && typeof field === 'object' && field.type === 'array') continue;
            var val = item && item[key] !== undefined ? item[key] : '';
            html += '<div class="form-field">';
            html += '<label class="form-label">' + escHtml(field.label || key) + '</label>';
            var name = 'arr_' + index + '_' + key;
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
        var html = '<div class="flat-array-item" data-index="' + index + '">';
        html += '<span style="font-size:12px;color:var(--q-text-muted);min-width:24px">' + (index + 1) + '.</span>';
        var name = 'flat_' + index + '_val';
        if (section.item_schema && section.item_schema.value) {
            html += renderSimpleInput(section.item_schema.value, name, value !== undefined ? value : '');
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
                var s = '<select class="form-select" name="' + name + '">';
                var opts = field.options || [];
                for (var o = 0; o < opts.length; o++) {
                    s += '<option value="' + escAttr(opts[o].value) + '"' + (String(val) === String(opts[o].value) ? ' selected' : '') + '>' + escHtml(opts[o].label) + '</option>';
                }
                s += '</select>';
                return s;
            case 'url':
                return '<input class="form-input" type="url" name="' + name + '" value="' + escAttr(String(val || '')) + '" placeholder="https://...">';
            case 'color':
                return '<div class="form-color-wrapper">' +
                    '<input class="form-color" type="color" value="' + escAttr(String(val || '#000000')) + '" data-sync-name="' + name + '">' +
                    '<input class="form-input" type="text" name="' + name + '" value="' + escAttr(String(val || '')) + '">' +
                    '</div>';
            default:
                return '<input class="form-input" type="text" name="' + name + '" value="' + escAttr(String(val || '')) + '">';
        }
    }

    function renderKeyValSection(data, schema) {
        var obj = (data && typeof data === 'object' && !Array.isArray(data)) ? data : {};
        var html = '<div class="form-section">';
        html += '<div class="form-section-header">';
        html += '<div class="form-section-title">' + escHtml(schema.title || '键值映射') + '</div>';
        if (schema.description) html += '<div class="form-section-desc">' + escHtml(schema.description) + '</div>';
        html += '</div>';
        html += '<div class="keyval-list" data-keyval="1">';
        var keys = Object.keys(obj);
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            html += '<div class="keyval-item">';
            html += '<input class="form-input" type="text" placeholder="' + escAttr(schema.key_label || '键') + '" value="' + escAttr(k) + '" data-keyval-key="1">';
            html += '<input class="form-input" type="text" placeholder="' + escAttr(schema.value_label || '值') + '" value="' + escAttr(String(obj[k])) + '" data-keyval-value="1">';
            html += '<button class="btn-icon keyval-remove" title="删除" style="color:var(--q-danger)"><i class="fas fa-times"></i></button>';
            html += '</div>';
        }
        html += '</div>';
        html += '<button class="array-add-btn" data-keyval-add="1"><i class="fas fa-plus"></i> 添加条目</button>';
        html += '</div>';
        return html;
    }

    function renderKeyValObjSection(data, schema) {
        var obj = (data && typeof data === 'object' && !Array.isArray(data)) ? data : {};
        var html = '<div class="form-section">';
        html += '<div class="form-section-header">';
        html += '<div class="form-section-title">' + escHtml(schema.title || '分类列表') + '</div>';
        if (schema.description) html += '<div class="form-section-desc">' + escHtml(schema.description) + '</div>';
        html += '</div>';
        var keys = Object.keys(obj);
        for (var ki = 0; ki < keys.length; ki++) {
            var key = keys[ki];
            html += '<div style="margin-bottom:20px">';
            html += '<h4 style="font-size:14px;margin-bottom:10px;display:flex;align-items:center;gap:8px">' + escHtml(key) + '</h4>';
            html += '<div class="array-list" data-keyval-obj-key="' + escAttr(key) + '">';
            if (Array.isArray(obj[key])) {
                for (var i = 0; i < obj[key].length; i++) {
                    html += renderArrayItem(schema.value_schema.item_schema, obj[key][i], i);
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
        restoreFileModeButtons();
        var html = '<div class="generic-editor-notice"><i class="fas fa-info-circle"></i> 该文件暂无定制表单，以下为通用键值编辑器。保存时按 JSON 格式写入。</div>';
        html += '<div class="form-section"><div class="generic-fields" data-generic="1">';
        if (data && typeof data === 'object' && !Array.isArray(data)) {
            var keys = Object.keys(data);
            for (var i = 0; i < keys.length; i++) {
                html += renderGenericField(keys[i], data[keys[i]]);
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
        var type = typeof value;
        var valInput = '';
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
        return '<div class="generic-field-row" style="display:flex;gap:10px;align-items:center">' +
            '<input class="form-input" type="text" value="' + escAttr(key) + '" data-generic-key="1" style="flex:0.35">' +
            valInput +
            '<button class="btn-icon generic-remove" title="删除" style="color:var(--q-danger)"><i class="fas fa-times"></i></button>' +
            '</div>';
    }

    // ── 表单事件绑定 ─────────────────────────────────────────────
    function bindFormEvents() {
        dom.panelBody.querySelectorAll('input, textarea, select').forEach(function (el) {
            el.addEventListener('change', function () { isModified = true; updateButtons(); });
            el.addEventListener('input', function () { isModified = true; updateButtons(); });
        });

        dom.panelBody.querySelectorAll('.form-color').forEach(function (el) {
            el.addEventListener('input', function () {
                var syncName = this.dataset.syncName;
                if (syncName) {
                    var target = dom.panelBody.querySelector('[name="' + syncName + '"]');
                    if (target) target.value = this.value;
                }
            });
        });

        dom.panelBody.querySelectorAll('[data-array-add]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var key = this.dataset.arrayAdd;
                var container = key === '__root__'
                    ? dom.panelBody.querySelector('[data-root-array="1"]')
                    : dom.panelBody.querySelector('[data-array-key="' + CSS.escape(key) + '"]');
                if (!container) return;
                if (key.startsWith('keyval_obj_')) {
                    addArrayItemTo(container, key.replace('keyval_obj_', ''));
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

        dom.panelBody.querySelectorAll('.array-item-remove, .flat-item-remove').forEach(function (btn) {
            btn.addEventListener('click', function () {
                this.closest('.array-item, .flat-array-item').remove();
                isModified = true;
                updateButtons();
            });
        });

        dom.panelBody.querySelectorAll('.array-item-up').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var item = this.closest('.array-item');
                var prev = item.previousElementSibling;
                if (prev && prev.classList.contains('array-item')) {
                    item.parentNode.insertBefore(item, prev);
                    isModified = true;
                    updateButtons();
                }
            });
        });

        dom.panelBody.querySelectorAll('.array-item-down').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var item = this.closest('.array-item');
                var next = item.nextElementSibling;
                if (next && next.classList.contains('array-item')) {
                    item.parentNode.insertBefore(next, item);
                    isModified = true;
                    updateButtons();
                }
            });
        });

        dom.panelBody.querySelectorAll('.keyval-remove').forEach(function (btn) {
            btn.addEventListener('click', function () {
                this.closest('.keyval-item').remove();
                isModified = true;
                updateButtons();
            });
        });

        dom.panelBody.querySelectorAll('[data-keyval-add]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var list = this.previousElementSibling;
                var item = document.createElement('div');
                item.className = 'keyval-item';
                item.innerHTML = '<input class="form-input" type="text" placeholder="键" data-keyval-key="1">' +
                    '<input class="form-input" type="text" placeholder="值" data-keyval-value="1">' +
                    '<button class="btn-icon keyval-remove" title="删除" style="color:var(--q-danger)"><i class="fas fa-times"></i></button>';
                list.appendChild(item);
                isModified = true;
                updateButtons();
                bindFormEvents();
            });
        });

        dom.panelBody.querySelectorAll('[data-generic-add]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var container = dom.panelBody.querySelector('[data-generic="1"]');
                var row = document.createElement('div');
                row.style.cssText = 'display:flex;gap:10px;align-items:center';
                row.innerHTML = '<input class="form-input" type="text" placeholder="字段名" data-generic-key="1" style="flex:0.35">' +
                    '<input class="form-input" type="text" placeholder="值" data-generic-value="1" style="flex:1">' +
                    '<button class="btn-icon generic-remove" title="删除" style="color:var(--q-danger)"><i class="fas fa-times"></i></button>';
                container.appendChild(row);
                isModified = true;
                updateButtons();
                bindFormEvents();
            });
        });

        dom.panelBody.querySelectorAll('.generic-remove').forEach(function (btn) {
            btn.addEventListener('click', function () {
                this.closest('.generic-field-row').remove();
                isModified = true;
                updateButtons();
            });
        });
    }

    function addArrayItemTo(container) {
        var div = document.createElement('div');
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
        var div = document.createElement('div');
        div.className = 'flat-array-item';
        var idx = container.children.length;
        div.innerHTML = '<span style="font-size:12px;color:var(--q-text-muted);min-width:24px">' + (idx + 1) + '.</span>' +
            '<input class="form-input" type="text" style="flex:1">' +
            '<button class="btn-icon flat-item-remove" style="color:var(--q-danger)"><i class="fas fa-times"></i></button>';
        container.appendChild(div);
    }

    function addRootArrayItemTo(container) {
        addArrayItemTo(container);
    }

    // ── 表单值收集 ───────────────────────────────────────────────
    function collectFormData() {
        if (currentSchema) return collectFromSchema(currentSchema);
        var jsonArea = $('#genericJsonArea');
        if (jsonArea) {
            try { return JSON.parse(jsonArea.value); } catch (e) { toast('JSON 格式错误: ' + e.message, 'error'); return null; }
        }
        return collectGenericForm();
    }

    function collectFromSchema(schema) {
        if (schema.type === 'array' && schema.root_array) return collectArray('__root__', schema.item_schema, true);
        if (schema.type === 'keyval') return collectKeyVal();
        if (schema.type === 'keyval_obj') return collectKeyValObj(schema);
        if (schema.sections) {
            var result = Array.isArray(currentData) ? [] : {};
            for (var i = 0; i < schema.sections.length; i++) {
                var section = schema.sections[i];
                if (section.type === 'array' && section.key) {
                    setByPath(result, section.key, collectArray(section.key, section.item_schema, false, section.flat));
                } else if (section.fields) {
                    var keys = Object.keys(section.fields);
                    for (var j = 0; j < keys.length; j++) {
                        setByPath(result, keys[j], getFieldValue(keys[j], section.fields[keys[j]]));
                    }
                }
            }
            return result;
        }
        if (schema.fields) {
            var r = {};
            var fkeys = Object.keys(schema.fields);
            for (var k = 0; k < fkeys.length; k++) {
                setByPath(r, fkeys[k], getFieldValue(fkeys[k], schema.fields[fkeys[k]]));
            }
            return r;
        }
        return currentData;
    }

    function getFieldValue(key, field) {
        var name = 'field_' + key.replace(/\./g, '__');
        var el = dom.panelBody.querySelector('[name="' + CSS.escape(name) + '"]');
        if (!el) return null;
        if (field.type === 'toggle') return el.checked;
        if (field.type === 'number') {
            var v = parseFloat(el.value);
            return isNaN(v) ? (el.value || 0) : v;
        }
        return el.value;
    }

    function collectArray(key, itemSchema, isRoot, isFlat) {
        var result = [];
        var container = isRoot
            ? dom.panelBody.querySelector('[data-root-array="1"]')
            : dom.panelBody.querySelector('[data-array-key="' + CSS.escape(key) + '"]');
        if (!container) return result;

        var items = container.querySelectorAll(isFlat ? '.flat-array-item' : '.array-item');
        items.forEach(function (item, idx) {
            if (isFlat) {
                var input = item.querySelector('input');
                if (input) result.push(input.value);
            } else {
                var obj = {};
                var ikeys = Object.keys(itemSchema);
                for (var i = 0; i < ikeys.length; i++) {
                    var k = ikeys[i];
                    var field = itemSchema[k];
                    if (field && typeof field === 'object' && field.type === 'array') continue;
                    var name = 'arr_' + idx + '_' + k;
                    var el = item.querySelector('[name="' + CSS.escape(name) + '"]');
                    if (!el) continue;
                    if (field.type === 'toggle') obj[k] = el.checked;
                    else if (field.type === 'number') {
                        var nv = parseFloat(el.value);
                        obj[k] = isNaN(nv) ? (el.value || 0) : nv;
                    } else obj[k] = el.value;
                }
                result.push(obj);
            }
        });
        return result;
    }

    function collectKeyVal() {
        var result = {};
        dom.panelBody.querySelectorAll('.keyval-item').forEach(function (item) {
            var keyEl = item.querySelector('[data-keyval-key]');
            var valEl = item.querySelector('[data-keyval-value]');
            if (keyEl && valEl && keyEl.value.trim()) {
                result[keyEl.value.trim()] = valEl.value;
            }
        });
        return result;
    }

    function collectKeyValObj(schema) {
        var result = {};
        dom.panelBody.querySelectorAll('[data-keyval-obj-key]').forEach(function (list) {
            var key = list.dataset.keyvalObjKey;
            result[key] = [];
            list.querySelectorAll('.array-item').forEach(function (item, idx) {
                var obj = {};
                var ikeys = Object.keys(schema.value_schema.item_schema);
                for (var i = 0; i < ikeys.length; i++) {
                    var k = ikeys[i];
                    var field = schema.value_schema.item_schema[k];
                    var name = 'arr_' + idx + '_' + k;
                    var el = item.querySelector('[name="' + CSS.escape(name) + '"]');
                    if (!el) continue;
                    if (field.type === 'toggle') obj[k] = el.checked;
                    else if (field.type === 'number') {
                        var nv = parseFloat(el.value);
                        obj[k] = isNaN(nv) ? (el.value || 0) : nv;
                    } else obj[k] = el.value;
                }
                result[key].push(obj);
            });
        });
        return result;
    }

    function collectGenericForm() {
        var result = {};
        dom.panelBody.querySelectorAll('.generic-field-row').forEach(function (row) {
            var keyEl = row.querySelector('[data-generic-key]');
            var valEl = row.querySelector('[data-generic-value]');
            if (keyEl && valEl && keyEl.value.trim()) {
                var val = valEl.value;
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
        var parts = path.split('.');
        var cur = obj;
        for (var i = 0; i < parts.length; i++) {
            if (cur === null || cur === undefined) return undefined;
            cur = cur[parts[i]];
        }
        return cur;
    }

    function setByPath(obj, path, value) {
        var parts = path.split('.');
        var cur = obj;
        for (var i = 0; i < parts.length - 1; i++) {
            if (!(parts[i] in cur) || typeof cur[parts[i]] !== 'object') {
                cur[parts[i]] = {};
            }
            cur = cur[parts[i]];
        }
        cur[parts[parts.length - 1]] = value;
    }

    // ── 保存 / 验证 ──────────────────────────────────────────────
    function saveFile() {
        if (!currentFileId || currentFileId === '__commands__') return;
        var data = collectFormData();
        if (data === null) return;
        dom.saveBtn.disabled = true;
        dom.saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 保存中...';
        fetch('/api/file/' + encodeURIComponent(currentFileId), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: data })
        }).then(function (r) { return r.json(); }).then(function (d) {
            if (!d.success) throw new Error(d.error);
            isModified = false;
            currentData = data;
            updateButtons();
            toast('文件保存成功', 'success');
            loadFiles();
        }).catch(function (e) {
            toast('保存失败: ' + e.message, 'error');
        }).finally(function () { updateButtons(); });
    }

    function validateFile(fileId) {
        fetch('/api/validate/' + encodeURIComponent(fileId))
            .then(function (r) { return r.json(); })
            .then(function (d) {
                if (d.valid) toast('JSON 格式正确', 'success');
                else toast('格式错误: ' + d.message, 'error');
            })
            .catch(function (e) { toast('验证失败: ' + e.message, 'error'); });
    }

    function updateButtons() {
        if (currentFileId === '__commands__') {
            dom.saveBtn.style.display = 'none';
            dom.validateBtn.style.display = 'none';
            return;
        }
        dom.saveBtn.style.display = '';
        dom.validateBtn.style.display = '';
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
        var name = $('#fileName').value.trim();
        if (!name) return toast('请输入文件名', 'warning');
        var root = $('#rootSelect') ? $('#rootSelect').value : 'src/config/json';
        var tpl = $('#templateSelect') ? $('#templateSelect').value : 'empty';
        var content = {};
        if (tpl === 'empty') content = {};
        else if (tpl === 'config') content = { name: name, description: '', version: '1.0.0', settings: {} };
        else if (tpl === 'settings') content = { theme: 'light', language: 'zh-CN', enableNotifications: true };
        else if (tpl === 'data') content = { data: [], metadata: {} };

        fetch('/api/file/new', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: name, root: root, content: content })
        }).then(function (r) { return r.json(); }).then(function (d) {
            if (!d.success) throw new Error(d.error);
            toast('文件创建成功', 'success');
            hideCreateModal();
            loadFiles();
        }).catch(function (e) { toast('创建失败: ' + e.message, 'error'); });
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
        var fileId = dom.deleteModal.dataset.fileId;
        if (!fileId) return;
        fetch('/api/file/' + encodeURIComponent(fileId), { method: 'DELETE' })
            .then(function (r) { return r.json(); }).then(function (d) {
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
            }).catch(function (e) { toast('删除失败: ' + e.message, 'error'); });
    }

    // ── 工具 ──────────────────────────────────────────────────────
    function formatSize(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        var k = 1024;
        var sizes = ['B', 'KB', 'MB', 'GB'];
        var i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function escHtml(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

    function escAttr(s) { return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

    // ── 初始化 ────────────────────────────────────────────────────
    function init() {
        dom.refreshBtn.addEventListener('click', loadFiles);
        dom.createBtn.addEventListener('click', showCreateModal);
        dom.saveBtn.addEventListener('click', saveFile);
        dom.validateBtn.addEventListener('click', function () { if (currentFileId && currentFileId !== '__commands__') validateFile(currentFileId); });

        dom.searchInput.addEventListener('input', function () {
            var q = this.value.toLowerCase().trim();
            if (q) {
                var filtered = files.filter(function (f) {
                    var dn = getDisplayName(f).toLowerCase();
                    return dn.includes(q) || f.name.toLowerCase().includes(q) || (f.group && f.group.toLowerCase().includes(q));
                });
                renderFileList(filtered);
            } else {
                renderFileList(files);
            }
        });

        // 模态框
        $('#createModal .modal-confirm').addEventListener('click', createFile);
        $('#createModal .modal-cancel').addEventListener('click', hideCreateModal);
        $('#createModal .modal-close').addEventListener('click', hideCreateModal);
        $('#deleteModal .modal-confirm').addEventListener('click', deleteFile);
        $('#deleteModal .modal-cancel').addEventListener('click', hideDeleteModal);
        $('#deleteModal .modal-close').addEventListener('click', hideDeleteModal);

        document.addEventListener('keydown', function (e) {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                if (currentFileId && currentFileId !== '__commands__') saveFile();
            }
        });

        // 先构建 schema 标题映射，再加载文件列表
        buildSchemaTitleMap().then(function () {
            loadFiles();
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
