class Terminal {
    constructor() {
        this.storage = new StorageManager();
        this.commands = new CommandManager(this.storage, this.output.bind(this));
        this.history = [];
        this.historyIndex = -1;

        this.initializeTerminal();
        this.setupEventListeners();
        this.showWelcome();
    }

    initializeTerminal() {
        this.updatePrompt();
    }

    setupEventListeners() {
        const commandInput = document.getElementById('command-input');

        commandInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.executeCommand(commandInput.value);
                commandInput.value = '';
                this.historyIndex = -1;
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.navigateHistory(-1);
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.navigateHistory(1);
            } else if (e.key === 'Tab') {
                e.preventDefault();
                this.autoComplete(commandInput);
            }
        });

        // 多行输入模态框事件
        document.getElementById('save-multiline').addEventListener('click', () => {
            this.commands.saveMultilineContent();
        });

        document.getElementById('cancel-multiline').addEventListener('click', () => {
            this.commands.hideMultilineInput();
        });

        document.getElementById('multiline-textarea').addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                this.commands.saveMultilineContent();
            } else if (e.key === 'Escape') {
                this.commands.hideMultilineInput();
            }
        });

        // 点击模态框背景关闭
        document.getElementById('multiline-modal').addEventListener('click', (e) => {
            if (e.target.id === 'multiline-modal') {
                this.commands.hideMultilineInput();
            }
        });

        // 确保终端始终获得焦点
        document.addEventListener('click', () => {
            commandInput.focus();
        });
    }

    executeCommand(command) {
        if (!command.trim()) return;

        // 显示命令
        this.output(`<span style="color: #00ff00">${this.getPrompt()}</span> ${command}`);

        // 添加到历史记录
        this.storage.addCommandToHistory(command);
        this.history.push(command);

        // 执行命令
        this.commands.execute(command);

        // 更新提示符（路径可能已改变）
        this.updatePrompt();

        // 滚动到底部
        this.scrollToBottom();
    }

    output(content, className = '') {
        const outputElement = document.getElementById('output');
        const line = document.createElement('div');
        line.className = `output-line ${className}`;

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
        const promptElement = document.getElementById('prompt');
        promptElement.textContent = this.getPrompt();
    }

    getPrompt() {
        const currentPath = this.storage.getCurrentPath();
        // 简化为类似 Linux 的提示符风格
        const dirName = currentPath === '/' ? '/' : currentPath.split('/').pop() || '/';
        return `[quark@terminal ${dirName}]$`;
    }

    navigateHistory(direction) {
        const commandInput = document.getElementById('command-input');
        const history = this.storage.getCommandHistory();

        if (history.length === 0) return;

        if (direction === -1) { // 向上
            if (this.historyIndex < history.length - 1) {
                this.historyIndex++;
            }
        } else { // 向下
            if (this.historyIndex > 0) {
                this.historyIndex--;
            } else if (this.historyIndex === 0) {
                this.historyIndex = -1;
                commandInput.value = '';
                return;
            }
        }

        if (this.historyIndex >= 0) {
            commandInput.value = history[history.length - 1 - this.historyIndex];
        }
    }

    autoComplete(inputElement) {
        const input = inputElement.value;
        const currentPath = this.storage.getCurrentPath();

        // 简单的自动完成实现
        const items = this.storage.listDirectory(currentPath);
        const matches = items.filter(item =>
            item.name.toLowerCase().startsWith(input.toLowerCase())
        );

        if (matches.length === 1) {
            inputElement.value = matches[0].name;
        } else if (matches.length > 1) {
            this.output('可能的补全:');
            matches.forEach(match => {
                this.output(`  ${match.name}${match.type === 'dir' ? '/' : ''}`);
            });
        }
    }

    showWelcome() {
        const welcomeText = `
&nbsp;&nbsp;.oooooo.&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;ooooo&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;ooo&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;.o.&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;ooooooooo.&nbsp;&nbsp;&nbsp;oooo&nbsp;&nbsp;&nbsp;&nbsp;oooo&nbsp; | 欢迎使用 夸克终端 v1.0
&nbsp;d8P'&nbsp;&nbsp;&nbsp;Y8b&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;888'&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;8'&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;.888.&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;888&nbsp;&nbsp;&nbsp;&nbsp;Y88.&nbsp;&nbsp;888&nbsp;&nbsp;&nbsp;.8P'&nbsp;&nbsp;
888&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;888&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;888&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;8&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;.8"888.&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;888&nbsp;&nbsp;&nbsp;.d88'&nbsp;&nbsp;888&nbsp;&nbsp;d8'&nbsp;&nbsp;&nbsp;&nbsp;  | 输入"帮助"/"help"查看可用命令
888&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;888&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;888&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;8&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;.8'&nbsp;&nbsp;888.&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;888ooo88P'&nbsp;&nbsp;&nbsp;88888[&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;   
888&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;888&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;888&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;8&nbsp;&nbsp;&nbsp;&nbsp;.88ooo8888.&nbsp;&nbsp;&nbsp;&nbsp;888&nbsp;88b.&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;888&nbsp;88b.&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;| QuarkBlog Terminal [版本 v1.0]
&nbsp;88b&nbsp;&nbsp;&nbsp;&nbsp;d88b&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;88.&nbsp;&nbsp;&nbsp;&nbsp;.8'&nbsp;&nbsp;&nbsp;.8'&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;888.&nbsp;&nbsp;&nbsp;888&nbsp;&nbsp;&nbsp;88b.&nbsp;&nbsp;&nbsp;888&nbsp;&nbsp;&nbsp;88b.&nbsp;&nbsp;
&nbsp;&nbsp;Y8bood8P'Ybd'&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;YbodP'&nbsp;&nbsp;&nbsp;&nbsp;o88o&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;o8888o&nbsp;o888o&nbsp;&nbsp;o888o&nbsp;o888o&nbsp;&nbsp;o888o&nbsp; | (c) Quark BLog 夸克博客 All rights reserved.
<br>
<br>
        `.trim();

        this.output(welcomeText, 'info');
        this.output('─'.repeat(60));
    }
}

// 初始化终端
document.addEventListener('DOMContentLoaded', () => {
    new Terminal();
});