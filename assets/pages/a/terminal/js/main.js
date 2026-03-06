class Terminal {
    constructor() {


        if (this.checkDestruction()) {
            this.showDestructionScreen();
            return; // 停止正常初始化
        }


        this.storage = new StorageManager();
        this.commands = new CommandManager(this.storage, this.output.bind(this));
        this.history = [];
        this.historyIndex = -1;

        this.initializeTerminal();
        this.setupEventListeners();
        this.showWelcome();
    }


    checkDestruction() {
        try {
            // 检查多种存储方式中的自毁标志
            const storageManager = new StorageManager();
            return storageManager.shouldShowDestruction();
        } catch (e) {
            console.error('检查自毁状态时出错:', e);
            return false;
        }
    }

    showDestructionScreen() {
        // 阻止终端正常初始化
        document.getElementById('terminal').style.display = 'none';

        // 创建自毁界面
        const destructionDiv = document.createElement('div');
        destructionDiv.id = 'destruction-screen';
        destructionDiv.innerHTML = `
            <div style="
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: #000;
                color: #f00;
                font-family: 'Courier New', monospace;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                z-index: 9999;
                text-align: center;
                padding: 20px;
            ">
                <div style="font-size: 80px; margin-bottom: 30px;">💀</div>
                <div style="font-size: 24px; margin-bottom: 20px; text-shadow: 0 0 10px #f00;">
                    系统已被破坏
                </div>
                <div style="font-size: 18px; margin-bottom: 10px; color: #ff6666;">
                    检测到先前执行的危险指令
                </div>
                <div style="font-size: 16px; margin-bottom: 30px; color: #ff9999;">
                    所有终端功能已被永久禁用
                </div>
                <div style="
                    border: 2px solid #f00;
                    padding: 20px;
                    border-radius: 5px;
                    max-width: 600px;
                    background: rgba(255, 0, 0, 0.1);
                    text-align: left;
                    color: #ffcc00;
                ">
                    <strong>恢复方法：</strong><br>
                    1. 清除浏览器所有本地存储数据 (LocalStorage)<br>
                    2. 清除所有Cookie<br>
                    3. 清除站点数据<br>
                    4. 或使用无痕/隐私模式访问<br>
                    <br>
                    <small style="color: #999;">警告：系统自毁状态已永久记录</small>
                </div>
                <div style="margin-top: 30px; font-size: 14px; color: #666;">
                    刷新页面无效 - 必须清除本地存储数据
                </div>
            </div>
        `;

        document.body.appendChild(destructionDiv);

        // 阻止键盘输入
        document.addEventListener('keydown', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });

        // 阻止右键菜单
        document.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });

        // 定期检查，确保自毁状态
        setInterval(() => {
            try {
                localStorage.setItem('terminal_self_destruct', 'true');
                document.cookie = "terminal_destroyed=true; max-age=31536000; path=/";
            } catch (e) {
                // 忽略错误
            }
        }, 10000);
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
&nbsp;&nbsp;.oooooo.&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;ooooo&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;ooo&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;.o.&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;ooooooooo.&nbsp;&nbsp;&nbsp;oooo&nbsp;&nbsp;&nbsp;&nbsp;oooo&nbsp; | 欢迎使用 夸克终端 v1.0 <br>
&nbsp;d8P'&nbsp;&nbsp;&nbsp;Y8b&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;888'&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;8'&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;.888.&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;888&nbsp;&nbsp;&nbsp;&nbsp;Y88.&nbsp;&nbsp;888&nbsp;&nbsp;&nbsp;.8P'&nbsp;&nbsp; <br>
888&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;888&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;888&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;8&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;.8"888.&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;888&nbsp;&nbsp;&nbsp;.d88'&nbsp;&nbsp;888&nbsp;&nbsp;d8'&nbsp;&nbsp;&nbsp;&nbsp;  | 输入"帮助"/"help"查看可用命令 <br>
888&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;888&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;888&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;8&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;.8'&nbsp;&nbsp;888.&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;888ooo88P'&nbsp;&nbsp;&nbsp;88888[&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;   <br>
888&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;888&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;888&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;8&nbsp;&nbsp;&nbsp;&nbsp;.88ooo8888.&nbsp;&nbsp;&nbsp;&nbsp;888&nbsp;88b.&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;888&nbsp;88b.&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;| QuarkBlog Terminal [版本 v1.0] <br>
&nbsp;88b&nbsp;&nbsp;&nbsp;&nbsp;d88b&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;88.&nbsp;&nbsp;&nbsp;&nbsp;.8'&nbsp;&nbsp;&nbsp;.8'&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;888.&nbsp;&nbsp;&nbsp;888&nbsp;&nbsp;&nbsp;88b.&nbsp;&nbsp;&nbsp;888&nbsp;&nbsp;&nbsp;88b.&nbsp;&nbsp; <br>
&nbsp;&nbsp;Y8bood8P'Ybd'&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;YbodP'&nbsp;&nbsp;&nbsp;&nbsp;o88o&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;o8888o&nbsp;o888o&nbsp;&nbsp;o888o&nbsp;o888o&nbsp;&nbsp;o888o&nbsp; | (c) Quark BLog 夸克博客 All rights reserved. <br>
        `.trim();

        this.output(welcomeText, 'info');
        this.output('─'.repeat(60));
    }
}

// 初始化终端
document.addEventListener('DOMContentLoaded', () => {
    new Terminal();
});