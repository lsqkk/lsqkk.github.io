class CommandManager {
    constructor(storageManager, outputHandler) {
        this.storage = storageManager;
        this.output = outputHandler;
        this.multilineCallback = null;
        this.currentFileName = null;
        this.presetCommands = null;
        this.loadPresetCommands();
    }

    async loadPresetCommands() {
        try {
            const response = await fetch('preset-commands.json');
            this.presetCommands = await response.json();
        } catch (error) {
            console.error('加载预设指令失败:', error);
            this.presetCommands = {
                output: {},
                redirect: {}
            };
        }
    }

    execute(command) {
        const parts = command.trim().split(/\s+/);
        const cmd = parts[0].toLowerCase();
        const args = parts.slice(1);

        // 检查关机命令
        if (cmd.includes('shutdown')) {
            this.shutdown();
            return;
        }

        // 检查预设指令和自定义指令
        if (this.checkPresetAndCustomCommands(cmd, args)) {
            return;
        }

        try {
            switch (cmd) {
                case '':
                    break;

                case 'help':
                case '帮助':
                    this.help();
                    break;
                case '列表':
                case 'ls':
                case 'dir':
                    this.list(args);
                    break;
                case '切换目录':
                case 'cd':
                    this.changeDirectory(args);
                    break;
                case 'cd..':
                    this.changeToParentDirectory();
                    break;
                case '创建目录':
                case 'mkdir':
                    this.createDirectory(args);
                    break;
                case '删除':
                case 'del':
                case 'rm':
                    this.delete(args);
                    break;
                case '清屏':
                case 'cls':
                    this.clearScreen();
                    break;
                case '创建文本文档':
                case 'touch':
                    this.createTextFile(args);
                    break;
                case '写入':
                case 'write':
                    this.writeFile(args);
                    break;
                case '读取':
                case 'type':
                case 'cat':
                    this.readFile(args);
                    break;
                case 'tree':
                    this.tree(args);
                    break;
                case '搜索博客':
                case 'search':
                    this.searchBlog(args);
                    break;
                case '启动':
                case 'start':
                    this.web(args);
                    break;
                case '工具':
                case 'tools':
                    this.openTools();
                    break;
                case '游戏':
                case 'games':
                    this.openGames();
                    break;
                case '时间':
                case 'time':
                    this.showTime();
                    break;
                case '计算器':
                case 'calc':
                    this.calculator(args);
                    break;
                case '历史':
                case 'history':
                    this.showHistory();
                    break;
                case '自定义输出':
                    this.addCustomOutput(args);
                    break;
                case '自定义跳转':
                    this.addCustomRedirect(args);
                    break;
                default:
                    this.output(`命令未找到: ${cmd}`, 'error');
                    this.output('输入"帮助"/"help"查看可用命令', 'info');
            }
        } catch (error) {
            this.output(`错误: ${error.message}`, 'error');
        }
    }

    checkPresetAndCustomCommands(cmd, args) {
        // 检查预设输出指令
        if (this.presetCommands && this.presetCommands.output[cmd]) {
            this.output(this.presetCommands.output[cmd], 'info');
            return true;
        }

        // 检查预设跳转指令
        if (this.presetCommands && this.presetCommands.redirect[cmd]) {
            this.output(`正在跳转到: ${this.presetCommands.redirect[cmd]}`, 'info');
            setTimeout(() => {
                window.open(this.presetCommands.redirect[cmd], '_blank');
            }, 500);
            return true;
        }

        // 检查自定义输出指令
        const customOutputs = this.storage.getCustomOutputs();
        if (customOutputs[cmd]) {
            this.output(customOutputs[cmd], 'info');
            return true;
        }

        // 检查自定义跳转指令
        const customRedirects = this.storage.getCustomRedirects();
        if (customRedirects[cmd]) {
            this.output(`正在跳转到: ${customRedirects[cmd]}`, 'info');
            setTimeout(() => {
                window.open(customRedirects[cmd], '_blank');
            }, 500);
            return true;
        }

        return false;
    }

    shutdown() {
        const outputElement = document.getElementById('output');
        const inputLine = document.getElementById('input-line');

        // 清屏
        outputElement.innerHTML = '';

        // 创建关机动画
        const shutdownScreen = document.createElement('div');
        shutdownScreen.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: #000;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            color: #fff;
            font-family: 'Courier New', monospace;
            z-index: 1000;
        `;

        const spinner = document.createElement('div');
        spinner.style.cssText = `
            width: 40px;
            height: 40px;
            border: 4px solid #333;
            border-top: 4px solid #00ff00;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-bottom: 20px;
        `;

        const message = document.createElement('div');
        message.textContent = '正在关机...';
        message.style.cssText = `
            font-size: 18px;
            color: #00ff00;
        `;

        // 添加CSS动画
        const style = document.createElement('style');
        style.textContent = `
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);

        shutdownScreen.appendChild(spinner);
        shutdownScreen.appendChild(message);
        document.body.appendChild(shutdownScreen);

        // 隐藏输入行
        inputLine.style.display = 'none';

        // 3秒后关闭页面
        setTimeout(() => {
            window.close();
            // 如果窗口无法关闭，显示提示
            setTimeout(() => {
                document.body.innerHTML = '<div style="color: #00ff00; font-family: Courier New; text-align: center; margin-top: 50px;">关机完成<br>刷新以重启</div>';
            }, 1000);
        }, 3000);
    }

    addCustomOutput(args) {
        if (args.length < 2) {
            this.output('用法: 自定义输出 <指令> <输出内容>', 'error');
            return;
        }

        const command = args[0].toLowerCase();
        const outputText = args.slice(1).join(' ');

        // 检查是否与现有命令冲突
        if (this.isReservedCommand(command)) {
            this.output(`指令 "${command}" 是保留命令，不能用作自定义指令`, 'error');
            return;
        }

        this.storage.addCustomOutput(command, outputText);
        this.output(`自定义输出指令添加成功: ${command} -> "${outputText}"`, 'success');
    }

    addCustomRedirect(args) {
        if (args.length < 2) {
            this.output('用法: 自定义跳转 <指令> <网址>', 'error');
            return;
        }

        const command = args[0].toLowerCase();
        let url = args[1];

        // 检查是否与现有命令冲突
        if (this.isReservedCommand(command)) {
            this.output(`指令 "${command}" 是保留命令，不能用作自定义指令`, 'error');
            return;
        }

        // 确保URL有协议前缀
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }

        this.storage.addCustomRedirect(command, url);
        this.output(`自定义跳转指令添加成功: ${command} -> ${url}`, 'success');
    }

    isReservedCommand(command) {
        const reservedCommands = [
            '帮助', 'help', '列表', 'ls', 'dir', '切换目录', 'cd', 'cd..',
            '创建目录', 'mkdir', '删除', 'del', 'rm', '清屏', 'cls',
            '创建文本文档', 'touch', '写入', 'write', '读取', 'type', 'cat',
            'tree', '搜索博客', 'search', '启动', 'start', '工具', 'tools', '游戏', 'games',
            '时间', 'time', '计算器', 'calc', '历史', 'history',
            '自定义输出', '自定义跳转'
        ];
        return reservedCommands.includes(command);
    }

    help() {
        const helpText = `
可用命令:<br><br>

<strong>文件操作:</strong><br>
&nbsp;&nbsp;列表/ls/dir [路径]&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- 显示目录内容<br>
&nbsp;&nbsp;切换目录/cd &lt;目录&gt;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- 切换当前目录<br>
&nbsp;&nbsp;cd..&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- 切换到父目录<br>
&nbsp;&nbsp;创建目录/mkdir &lt;目录名&gt;&nbsp;&nbsp;&nbsp;&nbsp;- 创建新目录<br>
&nbsp;&nbsp;删除/del/rm &lt;名称&gt;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- 删除文件或目录<br>
&nbsp;&nbsp;创建文本文档/touch &lt;文件名&gt; - 创建文本文件<br>
&nbsp;&nbsp;写入/write &lt;文件名&gt; &lt;内容&gt; - 写入文件内容<br>
&nbsp;&nbsp;读取/type/cat &lt;文件名&gt;&nbsp;&nbsp;&nbsp;&nbsp;- 读取文件内容<br>
&nbsp;&nbsp;tree [路径]&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- 显示目录树<br><br>

<strong>系统命令:</strong><br>
&nbsp;&nbsp;清屏/cls&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- 清除屏幕<br>
&nbsp;&nbsp;帮助/help&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- 显示此帮助信息<br>
&nbsp;&nbsp;历史/history&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- 显示命令历史<br>
&nbsp;&nbsp;shutdown&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- 关闭终端<br><br>

<strong>特殊功能:</strong><br>
&nbsp;&nbsp;搜索博客/search &lt;关键词&gt;&nbsp;&nbsp;&nbsp;- 搜索博客文章<br>
&nbsp;&nbsp;启动/start &lt;网页链接&gt;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- 启动网页<br>
&nbsp;&nbsp;工具/tools&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- 打开工具页面<br>
&nbsp;&nbsp;游戏/games&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- 进入游戏页面<br>
&nbsp;&nbsp;时间/time&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- 显示当前时间<br>
&nbsp;&nbsp;计算器/calc &lt;表达式&gt;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- 计算数学表达式<br><br>

<strong>自定义指令[存储在LocalStorage]:</strong><br>
&nbsp;&nbsp;自定义输出 &lt;指令&gt; &lt;内容&gt;&nbsp;&nbsp;&nbsp;- 添加自定义输出指令<br>
&nbsp;&nbsp;自定义跳转 &lt;指令&gt; &lt;网址&gt;&nbsp;&nbsp;&nbsp;- 添加自定义跳转指令<br>
&nbsp;&nbsp;删除 自定义输出 &lt;指令&gt;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- 删除自定义输出指令<br>
&nbsp;&nbsp;删除 自定义跳转 &lt;指令&gt;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- 删除自定义跳转指令<br><br>

<strong>预设指令:</strong><br>
&nbsp;&nbsp;你好/早上好/…………&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- 输出预设文本<br>
&nbsp;&nbsp;大富翁/dfw/…………&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- 跳转到预设网页
    `.trim();

        // 创建一个div元素来显示帮助文本，使用innerHTML来解析HTML标签
        const helpDiv = document.createElement('div');
        helpDiv.innerHTML = helpText;
        this.output(helpDiv);
    }

    list(args) {
        const path = args[0] || this.storage.getCurrentPath();
        const resolvedPath = this.storage.resolvePath(path, this.storage.getCurrentPath());

        const items = this.storage.listDirectory(resolvedPath);

        if (items.length === 0) {
            this.output('目录为空');
            return;
        }

        this.output(`目录 ${resolvedPath}:`);

        const fileList = document.createElement('div');
        fileList.className = 'file-list';

        items.forEach(item => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';

            const fileIcon = document.createElement('span');
            fileIcon.className = 'file-icon';
            fileIcon.textContent = item.type === 'dir' ? '📁' : '📄';

            const fileName = document.createElement('span');
            fileName.className = item.type === 'dir' ? 'dir-name' : 'file-name';
            fileName.textContent = item.name;

            const fileSize = document.createElement('span');
            fileSize.className = 'file-size';
            fileSize.textContent = item.type === 'file' ? `(${item.size} bytes)` : '';

            fileItem.appendChild(fileIcon);
            fileItem.appendChild(fileName);
            fileItem.appendChild(fileSize);
            fileList.appendChild(fileItem);
        });

        this.output(fileList);
    }

    changeDirectory(args) {
        if (args.length === 0) {
            this.output('用法: 切换目录 <目录名>', 'error');
            return;
        }

        const target = args[0];
        const currentPath = this.storage.getCurrentPath();
        let newPath;

        if (target === '..') {
            newPath = this.storage.getParentPath(currentPath);
        } else if (target === '.') {
            newPath = currentPath;
        } else if (target === '/') {
            newPath = '/';
        } else {
            newPath = this.storage.resolvePath(target, currentPath);
        }

        if (!this.storage.fileExists(newPath) || !this.storage.isDirectory(newPath)) {
            this.output(`目录不存在: ${newPath}`, 'error');
            return;
        }

        this.storage.setCurrentPath(newPath);
        this.output(`当前目录: ${newPath}`, 'success');
    }

    changeToParentDirectory() {
        const currentPath = this.storage.getCurrentPath();

        if (currentPath === '/') {
            this.output('已经是根目录', 'warning');
            return;
        }

        const parentPath = this.storage.getParentPath(currentPath);
        this.storage.setCurrentPath(parentPath);
        this.output(`切换到父目录: ${parentPath}`, 'success');
    }

    createDirectory(args) {
        if (args.length === 0) {
            this.output('用法: 创建目录 <目录名>', 'error');
            return;
        }

        const dirName = args[0];
        const currentPath = this.storage.getCurrentPath();

        this.storage.createDirectory(currentPath, dirName);
        this.output(`目录创建成功: ${dirName}`, 'success');
    }

    delete(args) {
        if (args.length === 0) {
            this.output('用法: 删除 <文件或目录名>', 'error');
            return;
        }

        // 检查是否是删除自定义指令
        if (args[0] === '自定义输出' && args.length >= 2) {
            const command = args[1].toLowerCase();
            if (this.storage.deleteCustomOutput(command)) {
                this.output(`自定义输出指令删除成功: ${command}`, 'success');
            } else {
                this.output(`自定义输出指令不存在: ${command}`, 'error');
            }
            return;
        }

        if (args[0] === '自定义跳转' && args.length >= 2) {
            const command = args[1].toLowerCase();
            if (this.storage.deleteCustomRedirect(command)) {
                this.output(`自定义跳转指令删除成功: ${command}`, 'success');
            } else {
                this.output(`自定义跳转指令不存在: ${command}`, 'error');
            }
            return;
        }

        const target = args[0];
        const currentPath = this.storage.getCurrentPath();
        const targetPath = this.storage.resolvePath(target, currentPath);

        if (!this.storage.fileExists(targetPath)) {
            this.output(`路径不存在: ${target}`, 'error');
            return;
        }

        // 安全确认
        const confirmDelete = confirm(`确定要删除 ${targetPath} 吗？`);
        if (!confirmDelete) {
            this.output('删除操作已取消', 'info');
            return;
        }

        this.storage.deletePath(targetPath);
        this.output(`删除成功: ${target}`, 'success');
    }

    clearScreen() {
        const outputElement = document.getElementById('output');
        outputElement.innerHTML = '';
    }

    createTextFile(args) {
        if (args.length === 0) {
            this.output('用法: 创建文本文档 <文件名>', 'error');
            return;
        }

        const fileName = args[0];
        if (!fileName.includes('.')) {
            this.output('请指定文件扩展名，例如: .txt .md .js', 'warning');
            return;
        }

        this.currentFileName = fileName;
        this.showMultilineInput('', (content) => {
            const currentPath = this.storage.getCurrentPath();
            this.storage.createFile(currentPath, fileName, content);
            this.output(`文件创建成功: ${fileName}`, 'success');
            this.currentFileName = null;
        });
    }

    writeFile(args) {
        if (args.length === 0) {
            this.output('用法: 写入 <文件名> [内容]', 'error');
            return;
        }

        const fileName = args[0];
        const content = args.slice(1).join(' ');
        const currentPath = this.storage.getCurrentPath();
        const filePath = this.storage.resolvePath(fileName, currentPath);

        if (!this.storage.fileExists(filePath)) {
            this.output(`文件不存在: ${fileName}`, 'error');
            return;
        }

        if (args.length === 1) {
            // 多行输入模式
            const currentContent = this.storage.readFile(filePath);
            this.currentFileName = fileName;
            this.showMultilineInput(currentContent, (newContent) => {
                this.storage.writeFile(filePath, newContent);
                this.output(`文件写入成功: ${fileName}`, 'success');
                this.currentFileName = null;
            });
        } else {
            // 单行写入
            this.storage.writeFile(filePath, content);
            this.output(`文件写入成功: ${fileName}`, 'success');
        }
    }

    readFile(args) {
        if (args.length === 0) {
            this.output('用法: 读取 <文件名>', 'error');
            return;
        }

        const fileName = args[0];
        const currentPath = this.storage.getCurrentPath();
        const filePath = this.storage.resolvePath(fileName, currentPath);

        if (!this.storage.fileExists(filePath)) {
            this.output(`文件不存在: ${fileName}`, 'error');
            return;
        }

        if (!this.storage.isFile(filePath)) {
            this.output(`不是文件: ${fileName}`, 'error');
            return;
        }

        const content = this.storage.readFile(filePath);
        this.output(`文件内容(${fileName}): `);
        this.output('─'.repeat(50));
        this.output(content);
        this.output('─'.repeat(50));
    }

    tree(args) {
        const path = args[0] || this.storage.getCurrentPath();
        const resolvedPath = this.storage.resolvePath(path, this.storage.getCurrentPath());

        if (!this.storage.fileExists(resolvedPath) || !this.storage.isDirectory(resolvedPath)) {
            this.output(`目录不存在: ${resolvedPath}`, 'error');
            return;
        }

        const treeItems = this.storage.getDirectoryTree(resolvedPath);

        this.output(`目录树 ${resolvedPath}: `);

        const treeElement = document.createElement('div');
        treeElement.className = 'tree';

        treeItems.forEach(item => {
            const treeItem = document.createElement('div');
            treeItem.className = 'tree-item';

            const treeLine = document.createElement('div');
            treeLine.className = 'tree-line';

            // 缩进
            for (let i = 0; i < item.level; i++) {
                const indent = document.createElement('span');
                indent.className = 'tree-indent';
                indent.textContent = '    ';
                treeLine.appendChild(indent);
            }

            // 分支符号
            const branch = document.createElement('span');
            branch.className = 'tree-branch';
            branch.textContent = item.isLast ? '└── ' : '├── ';
            treeLine.appendChild(branch);

            // 文件/目录图标和名称
            const icon = document.createElement('span');
            icon.className = 'file-icon';
            icon.textContent = item.type === 'dir' ? '📁' : '📄';
            treeLine.appendChild(icon);

            const name = document.createElement('span');
            name.className = item.type === 'dir' ? 'dir-name' : 'file-name';
            name.textContent = item.name;
            treeLine.appendChild(name);

            treeItem.appendChild(treeLine);
            treeElement.appendChild(treeItem);
        });

        this.output(treeElement);
    }

    searchBlog(args) {
        if (args.length === 0) {
            this.output('用法: 搜索博客 <关键词>', 'error');
            return;
        }

        const keyword = encodeURIComponent(args.join(' '));
        const url = `https://lsqkk.github.io/article-list.html?search=${keyword}`;

        this.output(`正在打开博客搜索: ${args.join(' ')}`, 'info');
        setTimeout(() => {
            window.open(url, '_blank');
        }, 500);
    }


    web(args) {
        if (args.length === 0) {
            this.output('用法: 启动/start <网页链接>', 'error');
            return;
        }

        const keyword = encodeURIComponent(args.join(' '));
        const url = `https://${keyword}`;

        this.output(`正在打开: ${args.join(' ')}`, 'info');
        setTimeout(() => {
            window.open(url, '_blank');
        }, 500);
    }

    openTools() {
        this.output('正在打开工具页面...', 'info');
        setTimeout(() => {
            window.open('https://lsqkk.github.io/tool.html', '_blank');
        }, 500);
    }

    openGames() {
        this.output('正在进入游戏页面...', 'info');
        setTimeout(() => {
            window.location.href = '/games';
        }, 500);
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

        this.output(`当前时间: ${timeString}`, 'info');
    }

    calculator(args) {
        if (args.length === 0) {
            this.output('用法: 计算器 <数学表达式>', 'error');
            return;
        }

        const expression = args.join(' ');

        try {
            // 安全地计算表达式
            const result = this.safeEval(expression);
            this.output(`${expression} = ${result}`, 'success');
        } catch (error) {
            this.output(`计算错误: ${error.message}`, 'error');
        }
    }

    safeEval(expression) {
        // 移除危险字符，只允许数学表达式
        const safeExpression = expression.replace(/[^0-9+\-*/().\s]/g, '');

        // 使用 Function 构造函数而不是 eval
        try {
            return Function(`"use strict"; return (${safeExpression})`)();
        } catch (error) {
            throw new Error('无效的数学表达式');
        }
    }

    showHistory() {
        const history = this.storage.getCommandHistory();

        if (history.length === 0) {
            this.output('命令历史为空', 'info');
            return;
        }

        this.output('命令历史:');
        history.forEach((cmd, index) => {
            this.output(`${index + 1}. ${cmd}`);
        });
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
        const modal = document.getElementById('multiline-modal');
        modal.style.display = 'none';
        this.multilineCallback = null;
    }

    saveMultilineContent() {
        if (this.multilineCallback) {
            const textarea = document.getElementById('multiline-textarea');
            this.multilineCallback(textarea.value);
            this.hideMultilineInput();
        }
    }
}