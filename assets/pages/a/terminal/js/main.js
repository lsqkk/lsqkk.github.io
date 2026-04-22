class Terminal {
    constructor() {
        if (this.checkDestruction()) {
            this.showDestructionScreen();
            return;
        }

        this.storage = new StorageManager();
        this.commands = new CommandManager(this.storage, this.output.bind(this));
        this.historyIndex = -1;

        this.initializeTerminal();
        this.setupEventListeners();
        this.showWelcome();
    }

    checkDestruction() {
        try {
            const storageManager = new StorageManager();
            return storageManager.shouldShowDestruction();
        } catch (error) {
            console.error('检查自毁状态失败:', error);
            return false;
        }
    }

    showDestructionScreen() {
        document.getElementById('terminal').style.display = 'none';

        const destructionDiv = document.createElement('div');
        destructionDiv.id = 'destruction-screen';
        destructionDiv.innerHTML = `
            <div class="destruction-inner">
                <div class="destruction-skull">💀</div>
                <div class="destruction-title">系统已被破坏</div>
                <div class="destruction-subtitle">检测到先前执行的危险指令，终端功能已被禁用。</div>
                <div class="destruction-help">
                    1. 清除浏览器 LocalStorage / Cookie
                    2. 清除站点数据
                    3. 或使用无痕模式访问
                </div>
            </div>
        `;
        document.body.appendChild(destructionDiv);

        document.addEventListener('keydown', (event) => {
            event.preventDefault();
            event.stopPropagation();
        });
        document.addEventListener('contextmenu', (event) => {
            event.preventDefault();
        });
    }

    initializeTerminal() {
        this.updatePrompt();
    }

    setupEventListeners() {
        const commandInput = document.getElementById('command-input');

        commandInput.addEventListener('keydown', async (event) => {
            if (event.key === 'Enter') {
                await this.executeCommand(commandInput.value);
                commandInput.value = '';
                this.historyIndex = -1;
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                this.navigateHistory(-1);
            } else if (event.key === 'ArrowDown') {
                event.preventDefault();
                this.navigateHistory(1);
            } else if (event.key === 'Tab') {
                event.preventDefault();
                this.autoComplete(commandInput);
            }
        });

        document.getElementById('save-multiline').addEventListener('click', () => {
            this.commands.saveMultilineContent();
        });

        document.getElementById('cancel-multiline').addEventListener('click', () => {
            this.commands.hideMultilineInput();
        });

        document.getElementById('multiline-textarea').addEventListener('keydown', (event) => {
            if (event.ctrlKey && event.key === 'Enter') {
                this.commands.saveMultilineContent();
            } else if (event.key === 'Escape') {
                this.commands.hideMultilineInput();
            }
        });

        document.getElementById('multiline-modal').addEventListener('click', (event) => {
            if (event.target.id === 'multiline-modal') {
                this.commands.hideMultilineInput();
            }
        });

        document.addEventListener('click', () => {
            commandInput.focus();
        });
    }

    async executeCommand(command) {
        if (!command.trim()) return;

        this.output(`<span style="color:#7ee787">${this.getPrompt()}</span> ${command}`, 'command');
        this.storage.addCommandToHistory(command);

        await this.commands.execute(command);
        this.updatePrompt();
        this.scrollToBottom();
    }

    output(content, className = '') {
        const outputElement = document.getElementById('output');
        const line = document.createElement('div');
        line.className = `output-line ${className}`.trim();

        if (typeof content === 'string') {
            line.innerHTML = content;
        } else {
            line.appendChild(content);
        }

        outputElement.appendChild(line);
        this.scrollToBottom();
    }

    scrollToBottom() {
        const outputElement = document.getElementById('output');
        outputElement.scrollTop = outputElement.scrollHeight;
    }

    updatePrompt() {
        document.getElementById('prompt').textContent = this.getPrompt();
    }

    getPrompt() {
        const currentPath = this.storage.getCurrentPath();
        const dirName = currentPath === '/' ? '/' : currentPath.split('/').pop() || '/';
        return `[quark@terminal ${dirName}]$`;
    }

    navigateHistory(direction) {
        const input = document.getElementById('command-input');
        const history = this.storage.getCommandHistory();
        if (!history.length) return;

        if (direction === -1) {
            if (this.historyIndex < history.length - 1) {
                this.historyIndex += 1;
            }
        } else if (this.historyIndex > -1) {
            this.historyIndex -= 1;
        }

        if (this.historyIndex === -1) {
            input.value = '';
            return;
        }

        input.value = history[history.length - 1 - this.historyIndex];
    }

    autoComplete(inputElement) {
        let candidates = [];
        try {
            candidates = this.commands.getAutocompleteCandidates(inputElement.value);
        } catch (error) {
            return;
        }

        if (!candidates.length) return;

        if (candidates.length === 1) {
            const raw = inputElement.value;
            const trimmed = raw.trimEnd();
            const parts = trimmed.split(/\s+/);

            if (parts.length <= 1 && !raw.endsWith(' ')) {
                inputElement.value = candidates[0];
                return;
            }

            parts[parts.length - 1] = candidates[0];
            inputElement.value = `${parts.join(' ')}${candidates[0].endsWith('/') ? '' : ''}`;
            return;
        }

        this.output('可补全候选:', 'info');
        this.output(this.commands.createCodeBlock(candidates.join('\n')), 'info');
    }

    showWelcome() {
        const settings = window.QuarkLLMConfig.getSettings();
        const hasApiKey = settings.apiKey ? '已检测到共享 API Key，可直接使用 llm 对话' : '未检测到 API Key，可执行 llm-key <key> 或前往 /a/ds 设置';
        const welcomeText = `
  ____                  __      ______                        _             __
 / __ \\__  ______ _____/ /__   /_  __/__  _________ ___  ____(_)___  ____ _/ /
/ / / / / / / __ \`/ __  / _ \\   / / / _ \\/ ___/ __ \`__ \\/ __/ / __ \\/ __ \`/ / 
/ /_/ / /_/ / /_/ / /_/ /  __/  / / /  __/ /  / / / / / / /_/ / / / / /_/ / /  
\\___\\_\\\\__,_/\\__,_/\\___/  /_/  \\___/_/  /_/ /_/ /_/\\__/_/_/ /_/\\__,_/_/   

Quark Terminal v2
${hasApiKey}
输入 help 查看命令，支持 pwd / ls / grep / find / cp / mv / llm 等常见 shell 指令。
        `.trim();

        this.output(this.commands.createCodeBlock(welcomeText), 'info');
        this.output('------------------------------------------------------------');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new Terminal();
});
