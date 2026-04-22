class CommandManager {
    constructor(storageManager, outputHandler) {
        this.storage = storageManager;
        this.output = outputHandler;
        this.multilineCallback = null;
        this.currentFileName = null;
        this.presetCommands = { output: {}, redirect: {} };
        this.dangerAttempts = 0;
        this.contextLimit = 8;
        this.builtinCommands = [
            'help', 'man', 'ls', 'dir', 'pwd', 'cd', 'cd..', 'mkdir', 'rm', 'del', 'unlink',
            'touch', 'write', 'cat', 'type', 'less', 'head', 'tail', 'wc', 'grep', 'find',
            'cp', 'mv', 'rename', 'echo', 'clear', 'cls', 'tree', 'history', 'time', 'date',
            'calc', 'expr', 'search', 'start', 'open', 'tools', 'games', 'whoami', 'uname',
            'env', 'printenv', 'export', 'set', 'unset', 'llm', 'chat', 'ask', 'llm-config',
            'llm-key', 'llm-base', 'llm-model', 'llm-clear', 'llm-history', 'stat'
        ];

        this.loadPresetCommands();
    }

    async loadPresetCommands() {
        try {
            const response = await fetch('/assets/pages/a/terminal/js/preset-commands.json');
            if (!response.ok) {
                throw new Error('preset-commands.json not found');
            }
            this.presetCommands = await response.json();
        } catch (error) {
            this.presetCommands = { output: {}, redirect: {} };
        }
    }

    tokenize(input) {
        const tokens = [];
        let current = '';
        let quote = '';
        let escaped = false;

        for (let index = 0; index < input.length; index += 1) {
            const char = input[index];

            if (escaped) {
                current += char;
                escaped = false;
                continue;
            }

            if (char === '\\') {
                escaped = true;
                continue;
            }

            if (quote) {
                if (char === quote) {
                    quote = '';
                } else {
                    current += char;
                }
                continue;
            }

            if (char === '"' || char === '\'') {
                quote = char;
                continue;
            }

            if (/\s/.test(char)) {
                if (current) {
                    tokens.push(current);
                    current = '';
                }
                continue;
            }

            current += char;
        }

        if (quote) {
            throw new Error('引号未闭合');
        }

        if (current) {
            tokens.push(current);
        }

        return tokens.map((token) => this.expandEnv(token));
    }

    expandEnv(token) {
        const env = this.storage.getEnv();
        return String(token || '').replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (match, name) => {
            return Object.prototype.hasOwnProperty.call(env, name) ? env[name] : '';
        });
    }

    parseOptions(args) {
        const options = new Set();
        const values = [];
        args.forEach((arg) => {
            if (arg.startsWith('-') && arg.length > 1) {
                arg.slice(1).split('').forEach((flag) => options.add(flag));
            } else {
                values.push(arg);
            }
        });
        return { options, values };
    }

    createCodeBlock(text, className = '') {
        const pre = document.createElement('pre');
        pre.className = `terminal-block ${className}`.trim();
        pre.textContent = text;
        return pre;
    }

    createDefinitionList(items) {
        const wrapper = document.createElement('div');
        wrapper.className = 'terminal-kv';
        items.forEach(([key, value]) => {
            const row = document.createElement('div');
            row.className = 'terminal-kv-row';

            const keySpan = document.createElement('span');
            keySpan.className = 'terminal-kv-key';
            keySpan.textContent = key;

            const valueSpan = document.createElement('span');
            valueSpan.className = 'terminal-kv-value';
            valueSpan.textContent = value;

            row.appendChild(keySpan);
            row.appendChild(valueSpan);
            wrapper.appendChild(row);
        });
        return wrapper;
    }

    async execute(commandLine) {
        const raw = String(commandLine || '').trim();
        if (!raw) return;

        if (this.storage.getDangerMode()) {
            this.handleDangerMode(raw);
            return;
        }

        if (this.storage.shouldShowDestruction()) {
            this.triggerSelfDestruction();
            return;
        }

        if (this.storage.checkDangerousCommand(raw)) {
            this.handleDangerousCommand(raw);
            return;
        }

        let tokens;
        try {
            tokens = this.tokenize(raw);
        } catch (error) {
            this.output(`错误: ${error.message}`, 'error');
            return;
        }

        const cmd = (tokens[0] || '').toLowerCase();
        const args = tokens.slice(1);

        if (cmd.includes('shutdown')) {
            this.shutdown();
            return;
        }

        if (this.checkPresetAndCustomCommands(cmd)) {
            return;
        }

        try {
            switch (cmd) {
                case 'help':
                case '帮助':
                case 'man':
                    this.help();
                    break;
                case 'ls':
                case 'dir':
                case '列表':
                    this.list(args);
                    break;
                case 'pwd':
                    this.printWorkingDirectory();
                    break;
                case 'cd':
                case '切换目录':
                    this.changeDirectory(args);
                    break;
                case 'cd..':
                    this.changeToParentDirectory();
                    break;
                case 'mkdir':
                case '创建目录':
                    this.createDirectory(args);
                    break;
                case 'rm':
                case 'del':
                case 'unlink':
                case '删除':
                    this.delete(args);
                    break;
                case 'clear':
                case 'cls':
                case '清屏':
                    this.clearScreen();
                    break;
                case 'touch':
                case '创建文本文档':
                    this.createTextFile(args);
                    break;
                case 'write':
                case 'nano':
                case 'vim':
                case 'vi':
                case 'edit':
                    this.writeFile(args);
                    break;
                case 'cat':
                case 'type':
                case 'less':
                case '读取':
                    this.readFile(args);
                    break;
                case 'head':
                    this.head(args);
                    break;
                case 'tail':
                    this.tail(args);
                    break;
                case 'wc':
                    this.wordCount(args);
                    break;
                case 'grep':
                    this.grep(args);
                    break;
                case 'find':
                    this.find(args);
                    break;
                case 'tree':
                    this.tree(args);
                    break;
                case 'cp':
                    this.copy(args);
                    break;
                case 'mv':
                case 'rename':
                    this.move(args);
                    break;
                case 'echo':
                    this.echo(args);
                    break;
                case 'history':
                case '历史':
                    this.showHistory();
                    break;
                case 'time':
                case 'date':
                case '时间':
                    this.showTime();
                    break;
                case 'calc':
                case 'expr':
                case '计算器':
                    this.calculator(args);
                    break;
                case 'search':
                case '搜索博客':
                    this.searchBlog(args);
                    break;
                case 'start':
                case 'open':
                case '启动':
                    this.openWeb(args);
                    break;
                case 'tools':
                case '工具':
                    this.openTools();
                    break;
                case 'games':
                case '游戏':
                    this.openGames();
                    break;
                case 'whoami':
                    this.output(this.storage.getEnv().USER || 'quark', 'success');
                    break;
                case 'uname':
                    this.output('QuarkTerminal WebShell 2.0 (browser)', 'info');
                    break;
                case 'env':
                case 'printenv':
                    this.printEnv(args);
                    break;
                case 'export':
                case 'set':
                    this.setEnv(args);
                    break;
                case 'unset':
                    this.unsetEnv(args);
                    break;
                case 'llm':
                case 'chat':
                case 'ask':
                    await this.chatWithLlm(args);
                    break;
                case 'llm-config':
                    this.showLlmConfig();
                    break;
                case 'llm-key':
                    this.setLlmKey(args);
                    break;
                case 'llm-base':
                    this.setLlmBase(args);
                    break;
                case 'llm-model':
                    this.setLlmModel(args);
                    break;
                case 'llm-clear':
                    this.clearLlmHistory();
                    break;
                case 'llm-history':
                    this.showLlmHistory();
                    break;
                case 'stat':
                    this.stat(args);
                    break;
                case '自定义输出':
                    this.addCustomOutput(args);
                    break;
                case '自定义跳转':
                    this.addCustomRedirect(args);
                    break;
                default:
                    this.output(`命令未找到: ${cmd}`, 'error');
                    this.output('输入 "help" 查看可用命令', 'info');
            }
        } catch (error) {
            this.output(`错误: ${error.message}`, 'error');
        }
    }

    handleDangerousCommand(command) {
        this.dangerAttempts += 1;

        if (this.dangerAttempts >= 2) {
            this.triggerSelfDestruction();
            return;
        }

        this.output('<span style="color:#ff5f56;font-weight:bold">警告：检测到危险指令</span>', 'error');
        this.output('系统已进入保护模式。再次尝试危险操作将触发自毁。', 'warning');
        this.output('输入 "安全模式" 或 "safemode" 可退出保护模式。', 'info');

        this.storage.setDangerMode(true);

        setTimeout(() => {
            if (this.storage.getDangerMode()) {
                this.storage.setDangerMode(false);
                this.dangerAttempts = 0;
                this.output('系统保护模式已自动关闭。', 'success');
            }
        }, 10000);
    }

    handleDangerMode(command) {
        if (command.toLowerCase() === '安全模式' || command.toLowerCase() === 'safemode') {
            this.storage.setDangerMode(false);
            this.dangerAttempts = 0;
            this.output('已退出保护模式。', 'success');
            return;
        }

        if (this.storage.checkDangerousCommand(command)) {
            this.triggerSelfDestruction();
            return;
        }

        this.output('保护模式启用中，输入 "安全模式" 可恢复正常。', 'warning');
    }

    triggerSelfDestruction() {
        this.storage.setSelfDestructTriggered(true);
        this.storage.destroySystem();
        this.showDestructionSequence();
        setTimeout(() => {
            this.finalDestruction();
        }, 10000);
    }

    showDestructionSequence() {
        const messages = [
            '危险指令检测到',
            '系统完整性受到威胁',
            '启动自毁协议...',
            '正在擦除所有数据...',
            '系统核心文件销毁中...',
            '无法停止此过程',
            '倒计时: 5',
            '倒计时: 4',
            '倒计时: 3',
            '倒计时: 2',
            '倒计时: 1',
            '系统自毁完成'
        ];

        let index = 0;
        const interval = setInterval(() => {
            if (index >= messages.length) {
                clearInterval(interval);
                return;
            }
            this.output(`<span style="color:#ff5f56;font-weight:bold">${messages[index]}</span>`, 'error');
            index += 1;
        }, 600);
    }

    finalDestruction() {
        document.open();
        document.write(`
            <html>
            <head><title>系统自毁</title></head>
            <body style="margin:0;background:#000;color:#f00;font-family:Courier New,monospace;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center">
                <div>
                    <div style="font-size:96px;margin-bottom:24px">💀</div>
                    <div style="font-size:24px;margin-bottom:12px">系统已被破坏</div>
                    <div style="color:#ff9a9a">请清除站点 LocalStorage / Cookie 后再访问。</div>
                </div>
            </body>
            </html>
        `);
        document.close();
    }

    checkPresetAndCustomCommands(cmd) {
        if (this.presetCommands.output[cmd]) {
            this.output(this.presetCommands.output[cmd], 'info');
            return true;
        }

        if (this.presetCommands.redirect[cmd]) {
            this.output(`正在跳转到: ${this.presetCommands.redirect[cmd]}`, 'info');
            setTimeout(() => window.open(this.presetCommands.redirect[cmd], '_blank'), 300);
            return true;
        }

        const customOutputs = this.storage.getCustomOutputs();
        if (customOutputs[cmd]) {
            this.output(customOutputs[cmd], 'info');
            return true;
        }

        const customRedirects = this.storage.getCustomRedirects();
        if (customRedirects[cmd]) {
            this.output(`正在跳转到: ${customRedirects[cmd]}`, 'info');
            setTimeout(() => window.open(customRedirects[cmd], '_blank'), 300);
            return true;
        }

        return false;
    }

    shutdown() {
        const outputElement = document.getElementById('output');
        const inputLine = document.getElementById('input-line');
        outputElement.innerHTML = '';

        const shutdownScreen = document.createElement('div');
        shutdownScreen.className = 'shutdown-screen';
        shutdownScreen.innerHTML = `
            <div class="shutdown-spinner"></div>
            <div class="shutdown-text">正在关机...</div>
        `;
        document.body.appendChild(shutdownScreen);
        inputLine.style.display = 'none';

        setTimeout(() => {
            window.close();
            setTimeout(() => {
                document.body.innerHTML = '<div style="color:#7ee787;font-family:Courier New,monospace;text-align:center;margin-top:50px">关机完成<br>刷新以重启</div>';
            }, 800);
        }, 2600);
    }

    addCustomOutput(args) {
        if (args.length < 2) {
            this.output('用法: 自定义输出 <指令> <输出内容>', 'error');
            return;
        }
        const command = args[0].toLowerCase();
        if (this.isReservedCommand(command)) {
            this.output(`指令 "${command}" 是保留命令`, 'error');
            return;
        }
        const outputText = args.slice(1).join(' ');
        this.storage.addCustomOutput(command, outputText);
        this.output(`自定义输出已保存: ${command}`, 'success');
    }

    addCustomRedirect(args) {
        if (args.length < 2) {
            this.output('用法: 自定义跳转 <指令> <网址>', 'error');
            return;
        }
        const command = args[0].toLowerCase();
        if (this.isReservedCommand(command)) {
            this.output(`指令 "${command}" 是保留命令`, 'error');
            return;
        }
        let url = args[1];
        if (!/^https?:\/\//i.test(url)) {
            url = `https://${url}`;
        }
        this.storage.addCustomRedirect(command, url);
        this.output(`自定义跳转已保存: ${command} -> ${url}`, 'success');
    }

    isReservedCommand(command) {
        return this.builtinCommands.includes(command) ||
            ['帮助', '列表', '切换目录', '创建目录', '删除', '清屏', '创建文本文档', '写入', '读取', '搜索博客', '启动', '工具', '游戏', '时间', '计算器', '历史', '自定义输出', '自定义跳转'].includes(command);
    }

    help() {
        const helpText = `
常用命令

文件与目录:
  ls [路径]           列出目录
  pwd                 显示当前路径
  cd <路径>           切换目录，支持 .. / ~
  mkdir [-p] <目录>   创建目录
  touch <文件>        创建文件
  write <文件> [内容] 写入文件，省略内容则打开多行编辑
  cat <文件>          查看文件
  head/tail <文件>    查看文件头尾
  cp <源> <目标>      复制文件或目录
  mv <源> <目标>      移动或重命名
  rm <路径>           删除文件或目录
  tree [路径]         显示目录树
  find <关键词>       按名称查找
  grep <词> <文件>    在文件内搜索
  wc <文件>           统计行数/词数/字符数
  stat <路径>         查看路径元信息

系统与交互:
  echo <文本>         输出文本，支持 $HOME 变量
  env                 查看环境变量
  export KEY=value    设置环境变量
  unset KEY           删除环境变量
  history             查看命令历史
  clear               清屏
  date/time           显示时间
  whoami / uname      系统信息
  calc <表达式>       计算表达式

LLM:
  llm <消息>          直接和模型对话
  llm-config          查看当前 API Key / Base URL / Model
  llm-key <key>       设置 API Key
  llm-base <url>      设置 Base URL
  llm-model <model>   设置模型
  llm-history         查看终端对话历史
  llm-clear           清空终端对话历史

站内快捷入口:
  search <关键词>     搜索博客
  open <网址>         打开网页
  tools               打开工具页
  games               打开游戏页
        `.trim();

        this.output(this.createCodeBlock(helpText), 'info');
    }

    list(args) {
        const { options, values } = this.parseOptions(args);
        const target = values[0] || this.storage.getCurrentPath();
        const path = this.storage.resolvePath(target, this.storage.getCurrentPath());
        const items = this.storage.listDirectory(path);

        if (!items.length) {
            this.output('目录为空', 'info');
            return;
        }

        const lines = items
            .filter((item) => options.has('a') || !item.name.startsWith('.'))
            .map((item) => {
                const typeMark = item.type === 'dir' ? 'd' : '-';
                const size = String(item.size).padStart(6, ' ');
                return `${typeMark} ${size} ${item.name}`;
            });

        this.output(this.createCodeBlock(lines.join('\n')), 'info');
    }

    printWorkingDirectory() {
        this.output(this.storage.getCurrentPath(), 'success');
    }

    changeDirectory(args) {
        const target = args[0] || this.storage.getEnv().HOME || '/home';
        const path = this.storage.resolvePath(target, this.storage.getCurrentPath());
        if (!this.storage.fileExists(path) || !this.storage.isDirectory(path)) {
            this.output(`目录不存在: ${path}`, 'error');
            return;
        }
        this.storage.setCurrentPath(path);
        this.output(`当前目录: ${path}`, 'success');
    }

    changeToParentDirectory() {
        this.changeDirectory(['..']);
    }

    createDirectory(args) {
        const { options, values } = this.parseOptions(args);
        if (!values.length) {
            this.output('用法: mkdir [-p] <目录名>', 'error');
            return;
        }
        const target = values[0];
        const path = this.storage.createDirectory(this.storage.getCurrentPath(), target, options.has('p'));
        this.output(`目录创建成功: ${path}`, 'success');
    }

    delete(args) {
        if (!args.length) {
            this.output('用法: rm <文件或目录>', 'error');
            return;
        }

        if (args[0] === '自定义输出' && args[1]) {
            const removed = this.storage.deleteCustomOutput(args[1].toLowerCase());
            this.output(removed ? `已删除自定义输出: ${args[1]}` : `未找到自定义输出: ${args[1]}`, removed ? 'success' : 'error');
            return;
        }

        if (args[0] === '自定义跳转' && args[1]) {
            const removed = this.storage.deleteCustomRedirect(args[1].toLowerCase());
            this.output(removed ? `已删除自定义跳转: ${args[1]}` : `未找到自定义跳转: ${args[1]}`, removed ? 'success' : 'error');
            return;
        }

        const targetPath = this.storage.resolvePath(args[0], this.storage.getCurrentPath());
        if (!this.storage.fileExists(targetPath)) {
            this.output(`路径不存在: ${args[0]}`, 'error');
            return;
        }
        if (!confirm(`确定要删除 ${targetPath} 吗？`)) {
            this.output('删除已取消', 'info');
            return;
        }
        this.storage.deletePath(targetPath);
        this.output(`已删除: ${targetPath}`, 'success');
    }

    clearScreen() {
        document.getElementById('output').innerHTML = '';
    }

    createTextFile(args) {
        if (!args.length) {
            this.output('用法: touch <文件名>', 'error');
            return;
        }
        const fileName = args[0];
        if (!fileName.includes('.')) {
            this.output('请指定文件扩展名，例如 .txt / .md / .json', 'warning');
            return;
        }
        if (args.length > 1) {
            const content = args.slice(1).join(' ');
            const filePath = this.storage.createFile(this.storage.getCurrentPath(), fileName, content);
            this.output(`文件创建成功: ${filePath}`, 'success');
            return;
        }
        this.currentFileName = fileName;
        this.showMultilineInput('', (content) => {
            const filePath = this.storage.createFile(this.storage.getCurrentPath(), fileName, content);
            this.output(`文件创建成功: ${filePath}`, 'success');
            this.currentFileName = null;
        });
    }

    writeFile(args) {
        if (!args.length) {
            this.output('用法: write <文件名> [内容]', 'error');
            return;
        }

        const filePath = this.storage.resolvePath(args[0], this.storage.getCurrentPath());
        if (!this.storage.fileExists(filePath)) {
            this.output(`文件不存在: ${filePath}`, 'error');
            return;
        }

        if (args.length === 1) {
            const currentContent = this.storage.readFile(filePath);
            this.currentFileName = args[0];
            this.showMultilineInput(currentContent, (newContent) => {
                this.storage.writeFile(filePath, newContent);
                this.output(`文件写入成功: ${filePath}`, 'success');
                this.currentFileName = null;
            });
            return;
        }

        this.storage.writeFile(filePath, args.slice(1).join(' '));
        this.output(`文件写入成功: ${filePath}`, 'success');
    }

    readFile(args) {
        if (!args.length) {
            this.output('用法: cat <文件名>', 'error');
            return;
        }
        const filePath = this.storage.resolvePath(args[0], this.storage.getCurrentPath());
        const content = this.storage.readFile(filePath);
        this.output(this.createCodeBlock(content || '(空文件)'), 'info');
    }

    head(args) {
        this.outputSlice(args, 'head');
    }

    tail(args) {
        this.outputSlice(args, 'tail');
    }

    outputSlice(args, mode) {
        if (!args.length) {
            this.output(`用法: ${mode} <文件名>`, 'error');
            return;
        }
        const filePath = this.storage.resolvePath(args[0], this.storage.getCurrentPath());
        const lines = this.storage.readFile(filePath).split('\n');
        const sliced = mode === 'head' ? lines.slice(0, 10) : lines.slice(-10);
        this.output(this.createCodeBlock(sliced.join('\n')), 'info');
    }

    wordCount(args) {
        if (!args.length) {
            this.output('用法: wc <文件名>', 'error');
            return;
        }
        const filePath = this.storage.resolvePath(args[0], this.storage.getCurrentPath());
        const content = this.storage.readFile(filePath);
        const lines = content ? content.split('\n').length : 0;
        const words = content.trim() ? content.trim().split(/\s+/).length : 0;
        const chars = content.length;
        this.output(`${lines} ${words} ${chars} ${filePath}`, 'success');
    }

    grep(args) {
        if (args.length < 2) {
            this.output('用法: grep <关键词> <文件名>', 'error');
            return;
        }
        const keyword = args[0].toLowerCase();
        const filePath = this.storage.resolvePath(args[1], this.storage.getCurrentPath());
        const lines = this.storage.readFile(filePath).split('\n');
        const matches = lines
            .map((line, index) => ({ line, index: index + 1 }))
            .filter((item) => item.line.toLowerCase().includes(keyword))
            .map((item) => `${item.index}: ${item.line}`);

        if (!matches.length) {
            this.output('没有匹配结果', 'info');
            return;
        }
        this.output(this.createCodeBlock(matches.join('\n')), 'info');
    }

    find(args) {
        if (!args.length) {
            this.output('用法: find <关键词> [起始目录]', 'error');
            return;
        }
        const keyword = args[0];
        const startPath = args[1] ? this.storage.resolvePath(args[1], this.storage.getCurrentPath()) : this.storage.getCurrentPath();
        const matches = this.storage.findByName(keyword, startPath);
        if (!matches.length) {
            this.output('没有找到匹配路径', 'info');
            return;
        }
        const text = matches.map((item) => `${item.type === 'dir' ? 'dir ' : 'file'} ${item.path}`).join('\n');
        this.output(this.createCodeBlock(text), 'info');
    }

    tree(args) {
        const target = args[0] || this.storage.getCurrentPath();
        const resolvedPath = this.storage.resolvePath(target, this.storage.getCurrentPath());
        const treeItems = this.storage.getDirectoryTree(resolvedPath);
        const lines = [resolvedPath];

        treeItems.forEach((item) => {
            const indent = '    '.repeat(item.level);
            const branch = item.isLast ? '└── ' : '├── ';
            lines.push(`${indent}${branch}${item.name}${item.type === 'dir' ? '/' : ''}`);
        });

        this.output(this.createCodeBlock(lines.join('\n')), 'info');
    }

    copy(args) {
        if (args.length < 2) {
            this.output('用法: cp <源路径> <目标路径>', 'error');
            return;
        }
        const source = this.storage.resolvePath(args[0], this.storage.getCurrentPath());
        const destination = this.storage.resolvePath(args[1], this.storage.getCurrentPath());
        const target = this.storage.copyPath(source, destination);
        this.output(`复制成功: ${source} -> ${target}`, 'success');
    }

    move(args) {
        if (args.length < 2) {
            this.output('用法: mv <源路径> <目标路径>', 'error');
            return;
        }
        const source = this.storage.resolvePath(args[0], this.storage.getCurrentPath());
        const destination = this.storage.resolvePath(args[1], this.storage.getCurrentPath());
        const target = this.storage.movePath(source, destination);
        this.output(`移动成功: ${source} -> ${target}`, 'success');
    }

    echo(args) {
        this.output(args.join(' '), 'info');
    }

    showHistory() {
        const history = this.storage.getCommandHistory();
        if (!history.length) {
            this.output('命令历史为空', 'info');
            return;
        }
        const lines = history.map((cmd, index) => `${index + 1}`.padStart(4, ' ') + `  ${cmd}`);
        this.output(this.createCodeBlock(lines.join('\n')), 'info');
    }

    showTime() {
        const now = new Date();
        const timeString = now.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            weekday: 'long'
        });
        this.output(timeString, 'info');
    }

    calculator(args) {
        if (!args.length) {
            this.output('用法: calc <数学表达式>', 'error');
            return;
        }
        const expression = args.join(' ');
        const safeExpression = expression.replace(/[^0-9+\-*/().%\s]/g, '');
        try {
            const result = Function(`"use strict"; return (${safeExpression})`)();
            this.output(`${expression} = ${result}`, 'success');
        } catch (error) {
            this.output('无效的数学表达式', 'error');
        }
    }

    searchBlog(args) {
        if (!args.length) {
            this.output('用法: search <关键词>', 'error');
            return;
        }
        const keyword = encodeURIComponent(args.join(' '));
        const url = `/posts?search=${keyword}`;
        this.output(`正在打开博客搜索: ${args.join(' ')}`, 'info');
        setTimeout(() => window.open(url, '_blank'), 300);
    }

    openWeb(args) {
        if (!args.length) {
            this.output('用法: open <网址>', 'error');
            return;
        }
        let url = args.join(' ');
        if (!/^https?:\/\//i.test(url) && !url.startsWith('/')) {
            url = `https://${url}`;
        }
        this.output(`正在打开: ${url}`, 'info');
        setTimeout(() => window.open(url, '_blank'), 300);
    }

    openTools() {
        this.output('正在打开工具页...', 'info');
        setTimeout(() => window.open('/tool', '_blank'), 300);
    }

    openGames() {
        this.output('正在进入游戏页...', 'info');
        setTimeout(() => {
            window.location.href = '/games';
        }, 300);
    }

    printEnv(args) {
        const env = this.storage.getEnv();
        if (args.length === 1) {
            this.output(env[args[0]] || '', 'info');
            return;
        }
        const lines = Object.keys(env)
            .sort()
            .map((key) => `${key}=${env[key]}`);
        this.output(this.createCodeBlock(lines.join('\n')), 'info');
    }

    setEnv(args) {
        if (!args.length) {
            this.output('用法: export KEY=value', 'error');
            return;
        }

        args.forEach((entry) => {
            if (!entry.includes('=')) {
                throw new Error(`环境变量格式错误: ${entry}`);
            }
            const [key, ...rest] = entry.split('=');
            this.storage.setEnvVar(key, rest.join('='));
        });
        this.output('环境变量已更新', 'success');
    }

    unsetEnv(args) {
        if (!args.length) {
            this.output('用法: unset KEY', 'error');
            return;
        }
        args.forEach((key) => this.storage.unsetEnvVar(key));
        this.output('环境变量已删除', 'success');
    }

    async chatWithLlm(args) {
        if (!args.length) {
            this.output('用法: llm <消息>', 'error');
            this.output('也可以先在 /a/ds 设置 API Key，然后回来直接使用。', 'info');
            return;
        }

        const settings = window.QuarkLLMConfig.getSettings();
        if (!settings.apiKey) {
            this.output('未检测到 API Key。请先执行 llm-key <你的key>，或前往 /a/ds 保存。', 'error');
            return;
        }

        const prompt = args.join(' ');
        const history = this.storage.getLlmHistory()
            .slice(-this.contextLimit)
            .flatMap((entry) => [
                { role: 'user', content: entry.prompt },
                { role: 'assistant', content: entry.answer }
            ]);

        this.output('正在连接 LLM...', 'info');

        const response = await fetch(window.QuarkLLMConfig.buildChatEndpoint(settings.baseUrl), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${settings.apiKey}`
            },
            body: JSON.stringify({
                model: settings.model,
                messages: [...history, { role: 'user', content: prompt }],
                stream: false
            })
        });

        if (!response.ok) {
            throw new Error(await window.QuarkLLMConfig.parseErrorResponse(response));
        }

        const data = await response.json();
        const answer = data?.choices?.[0]?.message?.content?.trim();
        if (!answer) {
            throw new Error('LLM 未返回有效内容');
        }

        this.storage.addLlmHistory({ prompt, answer, model: settings.model });
        this.output(`模型: ${settings.model}`, 'success');
        this.output(this.createCodeBlock(answer, 'terminal-llm'), 'info');
    }

    showLlmConfig() {
        const settings = window.QuarkLLMConfig.getSettings();
        const source = localStorage.getItem(window.QuarkLLMConfig.STORAGE_KEYS.legacyApiKey) ? 'localStorage (/a/ds 联动已启用)' : 'localStorage';
        this.output(this.createDefinitionList([
            ['API Key', window.QuarkLLMConfig.maskApiKey(settings.apiKey)],
            ['Base URL', settings.baseUrl],
            ['Model', settings.model],
            ['Source', source]
        ]), 'info');
    }

    setLlmKey(args) {
        if (!args.length) {
            this.output('用法: llm-key <api-key>', 'error');
            return;
        }
        window.QuarkLLMConfig.saveSettings({ apiKey: args.join(' ') });
        this.output('LLM API Key 已保存，并已同步给 /a/ds。', 'success');
    }

    setLlmBase(args) {
        if (!args.length) {
            this.output('用法: llm-base <base-url>', 'error');
            return;
        }
        const settings = window.QuarkLLMConfig.saveSettings({ baseUrl: args[0] });
        this.output(`Base URL 已更新为: ${settings.baseUrl}`, 'success');
    }

    setLlmModel(args) {
        if (!args.length) {
            this.output('用法: llm-model <model>', 'error');
            return;
        }
        const settings = window.QuarkLLMConfig.saveSettings({ model: args[0] });
        this.output(`模型已更新为: ${settings.model}`, 'success');
    }

    clearLlmHistory() {
        this.storage.clearLlmHistory();
        this.output('终端 LLM 对话历史已清空。', 'success');
    }

    showLlmHistory() {
        const history = this.storage.getLlmHistory();
        if (!history.length) {
            this.output('终端 LLM 对话历史为空。', 'info');
            return;
        }
        const lines = history.map((entry, index) => {
            return `${index + 1}. [${entry.model}] ${entry.prompt}`;
        });
        this.output(this.createCodeBlock(lines.join('\n')), 'info');
    }

    stat(args) {
        if (!args.length) {
            this.output('用法: stat <路径>', 'error');
            return;
        }
        const path = this.storage.resolvePath(args[0], this.storage.getCurrentPath());
        const stats = this.storage.getStats(path);
        this.output(this.createDefinitionList([
            ['Path', stats.path],
            ['Type', stats.type],
            ['Size', `${stats.size} bytes`],
            ['Created', stats.created || '-'],
            ['Modified', stats.modified || '-'],
            ['Children', String(stats.children)]
        ]), 'info');
    }

    showMultilineInput(initialContent, callback) {
        this.multilineCallback = callback;
        const modal = document.getElementById('multiline-modal');
        const textarea = document.getElementById('multiline-textarea');
        textarea.value = initialContent;
        modal.style.display = 'block';
        textarea.focus();
    }

    hideMultilineInput() {
        document.getElementById('multiline-modal').style.display = 'none';
        this.multilineCallback = null;
    }

    saveMultilineContent() {
        if (!this.multilineCallback) return;
        const textarea = document.getElementById('multiline-textarea');
        this.multilineCallback(textarea.value);
        this.hideMultilineInput();
    }

    getAutocompleteCandidates(input) {
        const raw = String(input || '');
        const tokens = raw.split(/\s+/);
        const currentToken = tokens[tokens.length - 1] || '';
        const isFirstToken = tokens.length <= 1 && !raw.endsWith(' ');

        if (isFirstToken) {
            return this.builtinCommands
                .filter((command) => command.startsWith(currentToken.toLowerCase()))
                .sort();
        }

        const currentPath = this.storage.getCurrentPath();
        const basePath = currentToken.includes('/')
            ? this.storage.getParentPath(this.storage.resolvePath(currentToken, currentPath))
            : currentPath;
        const prefix = currentToken.includes('/') ? currentToken.split('/').pop() || '' : currentToken;

        return this.storage.listDirectory(basePath)
            .filter((item) => item.name.toLowerCase().startsWith(prefix.toLowerCase()))
            .map((item) => currentToken.includes('/')
                ? `${currentToken.slice(0, currentToken.lastIndexOf('/') + 1)}${item.name}${item.type === 'dir' ? '/' : ''}`
                : `${item.name}${item.type === 'dir' ? '/' : ''}`)
            .sort();
    }
}
