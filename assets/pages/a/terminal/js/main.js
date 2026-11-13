class Terminal {
    constructor() {
        this.storage = new StorageManager();
        this.commands = new CommandManager(this.storage, this.output.bind(this));
        this.commands.ui = this;
        this.input = document.getElementById('command-input');
        this.log = document.getElementById('output');
        this.editor = document.getElementById('multiline-modal');
        this.historyDialog = document.getElementById('history-modal');
        this.historyFilter = document.getElementById('history-filter');
        this.historyIndex = -1;
        this.draft = '';
        this.controller = null;
        this.completion = null;
        this.setupEvents();
        this.updateTheme();
        this.updateWorkspace();
        this.setBusy(false);
        this.output('夸克终端 · qsh 3.0', 'session-title');
        this.output('当前会话使用本浏览器的虚拟文件系统。输入 help 查看命令，或用 agent 生成可执行计划。', 'info');
        if (matchMedia('(pointer: fine)').matches) this.input.focus({ preventScroll: true });
    }

    setupEvents() {
        document.getElementById('input-line').addEventListener('submit', (event) => {
            event.preventDefault();
            this.submitInput();
        });
        this.input.addEventListener('input', () => {
            this.historyIndex = -1;
            this.updateCompletion();
        });
        this.input.addEventListener('keydown', (event) => this.handleKeys(event));
        document.addEventListener('keydown', (event) => {
            if (this.editor.open || this.historyDialog.open || event.isComposing || !event.ctrlKey || event.altKey || event.metaKey) return;
            if (event.key.toLowerCase() === 'r' && (event.target === this.input || event.target === this.log)) {
                event.preventDefault();
                this.openHistory();
            }
            if (event.key.toLowerCase() === 'l' && !event.target.matches('textarea,select,input:not(#command-input)')) {
                event.preventDefault();
                this.commands.clearScreen();
                this.scrollToBottom();
                this.input.focus({ preventScroll: true });
            }
            if (event.key.toLowerCase() === 'c' && this.controller && !window.getSelection()?.toString() &&
                !(this.input.selectionEnd > this.input.selectionStart) && !event.target.matches('textarea,select,input:not(#command-input)')) {
                event.preventDefault();
                this.controller.abort();
            }
        });

        document.getElementById('interrupt-command').addEventListener('click', () => this.controller?.abort());
        document.getElementById('restart-terminal').addEventListener('click', () => location.reload());
        document.getElementById('open-history').addEventListener('click', () => this.openHistory());
        this.historyFilter.addEventListener('input', () => this.updateHistoryResults());
        this.historyFilter.addEventListener('keydown', (event) => {
            if (event.isComposing || !['ArrowDown', 'Enter'].includes(event.key)) return;
            const result = document.querySelector('#history-results button');
            if (!result) return;
            event.preventDefault();
            if (event.key === 'Enter') result.click();
            else result.focus();
        });
        document.getElementById('history-results').addEventListener('keydown', (event) => {
            if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
            event.preventDefault();
            const entry = event.target.closest('li');
            const next = event.key === 'ArrowDown' ? entry?.nextElementSibling : entry?.previousElementSibling;
            (next?.querySelector('button') || this.historyFilter).focus();
        });
        this.historyDialog.addEventListener('close', () => this.input.focus({ preventScroll: true }));
        document.getElementById('accept-completion').addEventListener('click', () => {
            this.acceptCompletion();
            this.input.focus();
        });
        this.log.addEventListener('scroll', () => this.updateScrollButton());
        document.getElementById('scroll-latest').addEventListener('click', () => this.scrollToBottom());
        document.getElementById('copy-output').addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(this.log.innerText);
                this.output('已复制终端记录', 'success');
            } catch {
                this.output('复制失败，可在输出区选中文本后手动复制。', 'warning');
            }
        });

        const theme = document.getElementById('terminal-theme');
        theme.addEventListener('change', () => this.theme(theme.value));
        window.addEventListener('quark-preferences-updated', () => this.updateTheme());
        window.addEventListener('storage', (event) => {
            if (event.key === 'quark_site_preferences' || event.key === 'quark_terminal_theme') this.updateTheme();
            if (event.key === 'fileSystem' || event.key === 'currentPath') this.updateWorkspace();
            if (event.key === window.QuarkLLMConfig.STORAGE_KEYS.apiKey) this.updateConnection();
        });

        const sidebar = document.getElementById('workbench-tools');
        const toggle = document.getElementById('workbench-toggle');
        const compact = matchMedia('(max-width: 820px)');
        const showSidebar = (open) => {
            sidebar.hidden = !open;
            toggle.setAttribute('aria-expanded', String(open));
            sidebar.closest('main').classList.toggle('sidebar-closed', !open);
        };
        showSidebar(!compact.matches);
        compact.addEventListener('change', (event) => showSidebar(!event.matches));
        toggle.addEventListener('click', () => showSidebar(sidebar.hidden));

        document.getElementById('go-up').addEventListener('click', () => this.executeCommand('cd ..', { shell: true }));
        document.getElementById('import-file').addEventListener('click', () => this.importFile());
        document.getElementById('file-picker').addEventListener('change', (event) => this.handleImport(event.target));

        document.getElementById('agent-form').addEventListener('submit', async (event) => {
            event.preventDefault();
            const task = document.getElementById('agent-task');
            if (!task.value.trim() || this.controller) return;
            await this.executeCommand('agent ' + task.value, { privateEntry: true });
        });
        document.getElementById('run-plan').addEventListener('click', () => this.executeCommand('agent run'));
        document.getElementById('cancel-plan').addEventListener('click', () => this.executeCommand('agent cancel'));
        for (const button of document.querySelectorAll('[data-example]')) {
            button.addEventListener('click', () => this.executeCommand(button.dataset.example, { shell: true }));
        }

        document.getElementById('save-multiline').addEventListener('click', () => this.commands.saveMultilineContent());
        document.getElementById('cancel-multiline').addEventListener('click', () => this.commands.hideMultilineInput());
        this.editor.addEventListener('close', () => {
            this.commands.multilineCallback = null;
            this.updateWorkspace();
            this.input.focus({ preventScroll: true });
        });
        document.getElementById('multiline-textarea').addEventListener('keydown', (event) => {
            if (event.isComposing) return;
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                this.commands.saveMultilineContent();
            }
        });
    }

    handleKeys(event) {
        if (event.isComposing || event.keyCode === 229) return;
        if (event.key === 'Enter') {
            event.preventDefault();
            if (!event.repeat) this.submitInput();
        } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            this.navigateHistory(event.key === 'ArrowUp' ? 1 : -1);
        } else if (event.key === 'Tab' && !event.shiftKey && this.completion?.matches.length === 1) {
            event.preventDefault();
            this.acceptCompletion();
        } else if (event.key === 'Escape') {
            this.closeCompletion();
        }
    }

    submitInput() {
        const value = this.input.value;
        if (!value.trim() || this.controller) return;
        this.input.value = '';
        this.historyIndex = -1;
        this.draft = '';
        this.closeCompletion();
        this.executeCommand(value);
    }

    async executeCommand(command, { shell = false, privateEntry = false } = {}) {
        if (!command.trim() || this.controller || this.editor.open || this.historyDialog.open) return;
        const raw = shell && this.commands.isLlmSessionActive() ? '!' + command : command;
        const sensitive = this.commands.isSensitive(raw);
        const row = document.createElement('span');
        const prompt = document.createElement('span');
        prompt.className = 'prompt-text';
        prompt.textContent = this.getPrompt();
        const display = sensitive ? 'llm-key [已隐藏]' : privateEntry ? 'agent [工作区任务]' : raw;
        row.append(prompt, document.createTextNode(' ' + display));
        this.scrollToBottom();
        this.output(row, 'command');

        this.controller = new AbortController();
        const { signal } = this.controller;
        this.setBusy(true);
        const started = performance.now();
        let status = 0;
        try {
            if (!sensitive && !privateEntry && !this.commands.shouldHandleAsLlmSession(raw)) this.storage.addCommandToHistory(raw);
            status = await this.commands.execute(raw, signal);
            if (signal.aborted) {
                status = 130;
                this.output('^C 已中断', 'warning');
            }
        } catch (error) {
            status = 1;
            this.output(error.message, 'error');
        } finally {
            this.controller = null;
            document.getElementById('exit-status').textContent = `退出码 ${status ?? 0} · ${Math.round(performance.now() - started)} ms`;
            document.getElementById('exit-status').classList.toggle('nonzero', Boolean(status));
            this.setBusy(false);
            this.updateWorkspace();
        }
    }

    setBusy(busy) {
        document.getElementById('run-command').disabled = busy;
        document.getElementById('interrupt-command').hidden = !busy;
        document.querySelector('#agent-form button').disabled = busy;
        document.getElementById('run-plan').disabled = busy;
        document.getElementById('cancel-plan').disabled = busy;
        const status = document.getElementById('session-status');
        const dot = document.createElement('span');
        dot.className = 'status-dot';
        dot.setAttribute('aria-hidden', 'true');
        status.classList.toggle('busy', busy);
        status.replaceChildren(dot, document.createTextNode(busy ? ' 执行中' :
            this.commands.isLlmSessionActive() ? ' AI 对话' : ' 本地 qsh'));
    }

    output(content, className = '') {
        const follow = this.isAtBottom();
        const line = document.createElement('div');
        line.className = ('output-line ' + className).trim();
        if (content instanceof Node) line.append(content);
        else line.textContent = String(content ?? '');
        this.log.append(line);
        if (follow) this.scrollToBottom();
        else this.updateScrollButton();
    }

    isAtBottom() {
        return this.log.scrollHeight - this.log.scrollTop - this.log.clientHeight < 48;
    }

    scrollToBottom() {
        this.log.scrollTop = this.log.scrollHeight;
        this.updateScrollButton();
    }

    updateScrollButton() {
        document.getElementById('scroll-latest').hidden = this.isAtBottom();
    }

    getPrompt() {
        return `quark${this.commands.isLlmSessionActive() ? ':ai' : ''}:${this.storage.getCurrentPath()} $`;
    }

    navigateHistory(delta) {
        const history = this.storage.getCommandHistory().filter((command) => !this.commands.isSensitive(command));
        if (!history.length) return;
        if (this.historyIndex === -1) this.draft = this.input.value;
        this.historyIndex = Math.max(-1, Math.min(history.length - 1, this.historyIndex + delta));
        this.input.value = this.historyIndex === -1 ? this.draft : history[history.length - 1 - this.historyIndex];
        this.input.setSelectionRange(this.input.value.length, this.input.value.length);
        this.closeCompletion();
    }

    openHistory() {
        this.historyFilter.value = '';
        this.updateHistoryResults();
        this.historyDialog.showModal();
        this.historyFilter.focus();
    }

    updateHistoryResults() {
        const query = this.historyFilter.value.toLowerCase().trim();
        const entries = [...new Set(this.storage.getCommandHistory().reverse())]
            .filter((entry) => !this.commands.isSensitive(entry) && entry.toLowerCase().includes(query));
        const list = document.getElementById('history-results');
        list.replaceChildren();
        for (const entry of entries) {
            const item = document.createElement('li');
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = entry;
            button.addEventListener('click', () => {
                this.input.value = entry;
                this.historyIndex = -1;
                this.closeCompletion();
                this.historyDialog.close();
                this.input.setSelectionRange(entry.length, entry.length);
            });
            item.append(button);
            list.append(item);
        }
        if (entries.length) return;
        const empty = document.createElement('li');
        empty.className = 'history-help';
        empty.textContent = '没有匹配的命令';
        list.append(empty);
    }

    updateCompletion() {
        this.completion = this.commands.getCompletion(this.input.value);
        const matches = this.completion?.matches || [];
        const area = document.getElementById('completion');
        area.hidden = !matches.length;
        const label = document.getElementById('completion-label');
        label.textContent = matches.slice(0, 6).join('   ') + (matches.length > 6 ? `   +${matches.length - 6}` : '');
        document.getElementById('accept-completion').hidden = matches.length !== 1;
    }

    closeCompletion() {
        this.completion = null;
        document.getElementById('completion').hidden = true;
    }

    acceptCompletion() {
        if (this.completion?.matches.length !== 1) return;
        this.input.value = this.completion.prefix + this.completion.matches[0] + this.completion.suffix;
        this.closeCompletion();
    }

    updateWorkspace() {
        const path = this.storage.recoverCurrentPath();
        document.getElementById('prompt').textContent = this.getPrompt();
        document.getElementById('console-location').textContent = path;
        document.getElementById('file-path').textContent = path;
        document.getElementById('go-up').disabled = path === '/';
        const files = document.getElementById('workspace-files');
        files.replaceChildren();

        for (const entry of this.storage.listDirectory(path)) {
            const item = document.createElement('li');
            const button = document.createElement('button');
            button.type = 'button';
            button.className = entry.type === 'dir' ? 'directory' : 'file';
            button.textContent = entry.name + (entry.type === 'dir' ? '/' : '');
            button.title = entry.type === 'dir' ? '进入 ' + entry.name : '编辑 ' + entry.name;
            button.addEventListener('click', () => this.executeCommand(
                (entry.type === 'dir' ? 'cd ' : 'edit ') + ShellSyntax.quote(entry.path), { shell: true }
            ));
            item.append(button);
            if (entry.type === 'file') {
                const save = document.createElement('button');
                save.type = 'button';
                save.className = 'file-download';
                save.textContent = '↓';
                save.setAttribute('aria-label', '下载 ' + entry.name);
                save.addEventListener('click', () => this.executeCommand('download ' + ShellSyntax.quote(entry.path), { shell: true }));
                item.append(save);
            }
            files.append(item);
        }
        if (!files.childElementCount) {
            const empty = document.createElement('li');
            empty.className = 'files-empty';
            empty.textContent = '此目录为空';
            files.append(empty);
        }
        this.updateConnection();
    }

    updateConnection() {
        const { apiKey, model } = window.QuarkLLMConfig.getSettings();
        document.getElementById('agent-connection').textContent = apiKey
            ? model + ' · 仅发送任务和当前目录，审阅后执行'
            : '连接模型后，可生成并执行虚拟终端命令。';
    }

    showPlan(plan) {
        const panel = document.getElementById('agent-plan');
        panel.hidden = !plan;
        document.getElementById('agent-summary').textContent = plan?.summary || '';
        const list = document.getElementById('agent-steps');
        list.replaceChildren();
        if (!plan) return;
        for (const job of plan.steps) {
            const item = document.createElement('li');
            const code = document.createElement('code');
            code.textContent = this.commands.agent.describe(job);
            item.append(code);
            list.append(item);
        }
        this.output(plan.summary, 'success');
        this.output(this.commands.createCodeBlock(plan.steps.map((job, i) => `${i + 1}. ${this.commands.agent.describe(job)}`).join('\n')));
        this.output('输入 agent run 执行，或 agent cancel 丢弃计划。', 'info');
    }

    importFile() {
        if (this.editor.open) return;
        const picker = document.getElementById('file-picker');
        picker.value = '';
        picker.dataset.path = this.storage.getCurrentPath();
        picker.click();
    }

    async handleImport(picker) {
        const file = picker.files[0];
        if (!file) return;
        try {
            if (file.size > 512 * 1024) throw new Error('导入上限为 512 KiB');
            const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
            if (text.includes('\0')) throw new Error('请选择 UTF-8 文本文件');
            const directory = picker.dataset.path || this.storage.getCurrentPath();
            const path = this.storage.createFile(directory, file.name, text);
            this.output('已导入 ' + path, 'success');
            this.updateWorkspace();
        } catch (error) {
            this.output('导入失败：' + error.message, 'error');
        }
    }

    download(name, text) {
        const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
        const link = document.createElement('a');
        link.download = name;
        link.href = url;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    theme(value) {
        if (!value) {
            this.output('主题设置: ' + document.getElementById('terminal-theme').value, 'info');
            return;
        }
        if (!['site', 'light', 'dark'].includes(value)) throw new Error('用法: theme site|light|dark');
        if (value === 'site') localStorage.removeItem('quark_terminal_theme');
        else localStorage.setItem('quark_terminal_theme', value);
        this.updateTheme();
    }

    updateTheme() {
        const local = localStorage.getItem('quark_terminal_theme');
        let site;
        try {
            site = JSON.parse(localStorage.getItem('quark_site_preferences') || '{}')?.theme;
        } catch {}
        const explicit = ['light', 'dark'].includes(local) ? local : null;
        document.getElementById('terminal-theme').value = explicit || 'site';
        const resolved = explicit || site;
        if (['light', 'dark'].includes(resolved)) document.documentElement.dataset.terminalTheme = resolved;
        else delete document.documentElement.dataset.terminalTheme;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new Terminal();
});
