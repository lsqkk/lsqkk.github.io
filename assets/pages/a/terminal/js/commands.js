class CommandManager {
    constructor(storageManager, outputHandler) {
        this.storage = storageManager;
        this.output = outputHandler;
        this.multilineCallback = null;
        this.presetCommands = { output: {}, redirect: {} };
        this.agent = new ShellAgent(this);
        this.contextLimit = 8;
        this.llmSessionActive = false;
        this.builtinCommands = [
            'help', 'man', 'ls', 'dir', 'pwd', 'cd', 'cd..', 'mkdir', 'rm', 'del', 'unlink',
            'touch', 'write', 'cat', 'type', 'less', 'head', 'tail', 'wc', 'grep', 'find',
            'cp', 'mv', 'rename', 'echo', 'clear', 'cls', 'tree', 'history', 'time', 'date',
            'calc', 'expr', 'search', 'start', 'open', 'tools', 'games', 'whoami', 'uname',
            'env', 'printenv', 'export', 'set', 'unset', 'llm', 'chat', 'ask', 'llm-config',
            'llm-key', 'llm-base', 'llm-model', 'llm-clear', 'llm-history', 'llm-on', 'llm-off',
            'exit', 'quit', 'bye', 'stat', 'agent', 'edit', 'nano', 'vim', 'vi',
            'import', 'download', 'theme', 'rmdir', 'true', 'false', 'test', 'source', 'shutdown',
            ...Object.keys(textCommands)
        ];

        this.presetsReady = this.loadPresetCommands();
    }

    async loadPresetCommands() {
        try {
            const response = await fetch('/assets/pages/a/terminal/preset-commands.json', { signal: AbortSignal.timeout(3000) });
            if (!response.ok) {
                throw new Error('preset-commands.json not found');
            }
            this.presetCommands = await response.json();
        } catch (error) {
            this.presetCommands = { output: {}, redirect: {} };
        }
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

    escapeHtml(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    renderMarkdown(text, wrapper) {
        const source = String(text || '').trim();
        if (!source) {
            wrapper.textContent = '等待模型输出…';
            return;
        }

        if (window.QuarkSafeMarkdown) {
            wrapper.innerHTML = window.QuarkSafeMarkdown(source);
            return;
        }

        wrapper.innerHTML = `<p>${this.escapeHtml(source).replace(/\n/g, '<br>')}</p>`;
    }

    isLlmSessionActive() {
        return this.llmSessionActive;
    }

    shouldHandleAsLlmSession(raw) {
        const input = String(raw || '').trim();
        if (!this.llmSessionActive || !input) {
            return false;
        }
        if (input.startsWith('!') || /^(?:agent|llm-(?:key|base|model|config|history|clear))(?:\s|$)/i.test(input)) {
            return false;
        }
        return true;
    }

    async handleLlmSessionInput(raw, signal) {
        const input = String(raw || '').trim();
        const lowered = input.toLowerCase();

        if (['exit', 'quit', 'bye', 'llm-off'].includes(lowered)) {
            this.disableLlmSession();
            return 0;
        }

        return this.requestLlm(input, signal);
    }

    enableLlmSession() {
        if (this.llmSessionActive) {
            this.output('LLM 连续对话模式已开启，直接输入内容即可继续聊天。', 'info');
            return;
        }
        this.llmSessionActive = true;
        this.output('已进入 LLM 连续对话模式。直接输入内容即可发送。', 'success');
        this.output('输入 exit / quit / bye / llm-off 退出；输入 !help、!ls 这类命令可临时执行普通终端指令。', 'info');
    }

    disableLlmSession() {
        if (!this.llmSessionActive) {
            this.output('LLM 连续对话模式当前未开启。', 'info');
            return;
        }
        this.llmSessionActive = false;
        this.output('已退出 LLM 连续对话模式。', 'success');
    }

    isSensitive(raw) {
        return /(?:^|[\s!;|&])["']?llm-key["']?(?:[\s;|&]|$)/i.test(raw);
    }

    async execute(commandLine, signal) {
        const raw = String(commandLine || '').trim();
        if (!raw) return 0;
        if (raw.length > 8192) {
            this.output('命令超过输入上限', 'error');
            return 1;
        }
        if (this.shouldHandleAsLlmSession(raw)) {
            if (this.isSensitive(raw)) {
                this.output('请单独输入 llm-key，或在 AI 设置中保存连接。', 'error');
                return 1;
            }
            return this.handleLlmSessionInput(raw, signal);
        }
        const source = raw.startsWith('!') ? raw.slice(1).trimStart() : raw;
        const command = /^(llm|chat|ask|agent|llm-key)(?:\s|$)/i.exec(source);
        if (this.isSensitive(raw) && command?.[1].toLowerCase() !== 'llm-key') {
            this.output('请单独输入 llm-key，或在 AI 设置中保存连接。', 'error');
            return 1;
        }
        if (command) {
            const message = source.slice(command[0].length).trim();
            const name = command[1].toLowerCase();
            if (name === 'agent') return this.agent.execute(message, signal);
            if (name === 'llm-key') {
                if (!message || /\s/.test(message)) {
                    this.output('用法: llm-key <api-key>（单独运行）', 'error');
                    return 1;
                }
                this.setLlmKey([message]);
                return 0;
            }
            if (message) return this.requestLlm(message, signal);
            this.enableLlmSession();
            return 0;
        }

        return this.executeShell(source, { signal });
    }

    async executeShell(source, { signal, script = false } = {}) {
        try {
            const jobs = ShellSyntax.parse(source);
            if (jobs.length > 120) throw new Error('一次最多执行 120 条命令');
            let status = 0;
            for (const job of jobs) {
                if (signal?.aborted) return 130;
                if ((job.condition === '&&' && status) || (job.condition === '||' && !status)) continue;
                status = await this.runJob(ShellSyntax.expand(job, this.storage.getEnv()), {
                    interactive: !script && jobs.length === 1,
                    signal,
                    script
                });
            }
            return status;
        } catch (error) {
            this.output(`错误: ${error.message}`, 'error');
            return 1;
        }
    }

    async runJob(job, { interactive = true, agent = false, signal, script = false } = {}) {
        try {
            const name = job.stages[0][0].toLowerCase();
            if (job.stages.length === 1 && !job.redirect && !ShellText.get(name)) {
                return await this.executeTokens(job.stages[0], { interactive, agent, signal, script });
            }
            for (const [stage] of job.stages) {
                if (!ShellText.get(stage.toLowerCase())) throw new Error('管道和重定向仅支持文本命令: ' + stage);
            }
            let result = { text: null, status: 0 };
            for (const stage of job.stages) {
                if (signal?.aborted) return 130;
                result = await ShellText.run(this, stage, result.text);
            }
            if (signal?.aborted) return 130;
            if (job.redirect) {
                const path = this.storage.resolvePath(job.redirect.target, this.storage.getCurrentPath());
                this.storage.writeText(path, result.text, job.redirect.append, { protectExisting: agent || script });
            } else if (result.text) {
                this.output(this.createCodeBlock(result.text.replace(/\n$/, '')));
            } else if (interactive && result.status === 1 && name === 'grep') {
                this.output('没有匹配结果', 'info');
            }
            return result.status;
        } catch (error) {
            this.output(`错误: ${error.message}`, 'error');
            return 1;
        }
    }

    async executeTokens(tokens, { interactive, agent, signal, script }) {
        const cmd = tokens[0].toLowerCase();
        const args = tokens.slice(1);
        if (script && !this.canRunInScript(cmd)) throw new Error('脚本不支持此命令: ' + cmd);
        if (cmd === 'shutdown') {
            if (!interactive) throw new Error('shutdown 需单独运行');
            this.shutdown();
            return 0;
        }
        if (cmd === 'true' || cmd === 'false') return cmd === 'false' ? 1 : 0;
        if (!this.isReservedCommand(cmd)) {
            await this.presetsReady;
            if (signal?.aborted) return 130;
            if (this.checkPresetAndCustomCommands(cmd)) return 0;
        }

        try {
            switch (cmd) {
                case 'help':
                case '帮助':
                case 'man':
                    this.help(args[0]);
                    break;
                case 'cd':
                case '切换目录':
                    return this.changeDirectory(args);
                case 'cd..':
                    return this.changeDirectory(['..']);
                case 'mkdir':
                case '创建目录':
                    this.createDirectory(args);
                    break;
                case 'rm':
                case 'del':
                case 'unlink':
                case '删除':
                    return this.delete(args);
                case 'clear':
                case 'cls':
                case '清屏':
                    this.clearScreen();
                    break;
                case 'touch':
                case '创建文本文档':
                    this.createTextFile(args, { protectExisting: agent || script });
                    break;
                case 'write':
                case 'nano':
                case 'vim':
                case 'vi':
                case 'edit':
                case '写入':
                    this.writeFile(args, { interactive, protectExisting: agent || script });
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
                    this.output('Quark Terminal · qsh 3.0 · 浏览器虚拟环境', 'info');
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
                case 'llm-on':
                    this.enableLlmSession();
                    break;
                case 'llm-off':
                case 'exit':
                case 'quit':
                case 'bye':
                    this.disableLlmSession();
                    break;
                case 'llm-config':
                    this.showLlmConfig();
                    break;
                case 'llm-key':
                    throw new Error('llm-key 须单独输入，或在 AI 设置中保存');
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
                case 'rmdir':
                    this.removeEmptyDirectory(args);
                    break;
                case 'test':
                    return this.testCondition(args);
                case 'source':
                    return this.runScript(args, signal);
                case 'theme':
                    this.ui.theme(args[0]);
                    break;
                case 'import':
                    this.ui.importFile();
                    break;
                case 'download':
                    this.downloadFile(args);
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
                    return 127;
            }
            return 0;
        } catch (error) {
            this.output(`错误: ${error.message}`, 'error');
            return 1;
        }
    }

    checkPresetAndCustomCommands(cmd) {
        const outputs = this.storage.getCustomOutputs();
        const redirects = this.storage.getCustomRedirects();
        const presetOutput = this.presetCommands.output || {};
        const presetRedirect = this.presetCommands.redirect || {};
        if (Object.hasOwn(presetOutput, cmd) || Object.hasOwn(outputs, cmd)) {
            this.output(Object.hasOwn(presetOutput, cmd) ? presetOutput[cmd] : outputs[cmd], 'info');
            return true;
        }
        if (Object.hasOwn(presetRedirect, cmd) || Object.hasOwn(redirects, cmd)) {
            this.openWeb([Object.hasOwn(presetRedirect, cmd) ? presetRedirect[cmd] : redirects[cmd]]);
            return true;
        }
        return false;
    }

    shutdown() {
        document.getElementById('shutdown-dialog').showModal();
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

    help(topic) {
        const textCommand = ShellText.get(topic);
        if (textCommand) {
            this.output(this.createCodeBlock(textCommand.usage + '\n' + textCommand.description));
            return;
        }
        this.output(this.createDefinitionList([
            ['目录与文件', 'ls -al · pwd · cd · tree · find · stat · mkdir -p · rmdir · touch · write / edit · cp · mv · rm · import · download'],
            ['文本处理', Object.keys(textCommands).filter((name) => name !== 'ls' && name !== 'pwd').join(' · ')],
            ['Shell', 'echo "$HOME" · history · clear · date · calc · test · true / false · source · whoami · uname · env · export · unset · theme'],
            ['AI', 'llm <消息> · llm-on / llm-off · llm-config · agent <任务> · agent run · agent cancel'],
            ['站内', 'search <关键词> · open <网址> · tools · games'],
            ['示例', 'cat readme.md | grep -in llm > /tmp/matches.txt && cat /tmp/matches.txt']
        ]));
        this.output('man <文本命令> 可查看用法。引号可保护空格或运算符，; / && / || 可串联命令。', 'info');
    }

    changeDirectory(args) {
        if (args.length > 1) throw new Error('用法: cd [目录]');
        const env = this.storage.getEnv();
        const target = args[0] === '-' ? env.OLDPWD : args[0] || env.HOME;
        if (!target) throw new Error('没有上一个目录');
        const current = this.storage.getCurrentPath();
        const path = this.storage.resolvePath(target, current);
        if (!this.storage.isDirectory(path)) throw new Error(`目录不存在: ${path}`);
        this.storage.setCurrentPath(path);
        this.storage.setEnvVar('OLDPWD', current);
        if (args[0] === '-') this.output(path);
        return 0;
    }

    createDirectory(args) {
        const { flags, values } = ShellText.options(args, 'p');
        const target = ShellText.oneArg(values, 'mkdir [-p] <目录名>');
        const path = this.storage.resolvePath(target, this.storage.getCurrentPath());
        if (flags.has('p') && this.storage.isDirectory(path)) return;
        this.storage.createDirectory('/', path, flags.has('p'));
    }

    delete(args) {
        if (args[0] === '自定义输出' || args[0] === '自定义跳转') {
            if (!args[1]) throw new Error('请提供自定义指令名称');
            const remove = args[0] === '自定义输出' ? 'deleteCustomOutput' : 'deleteCustomRedirect';
            const removed = this.storage[remove](args[1].toLowerCase());
            this.output(removed ? '已删除: ' + args[1] : '未找到: ' + args[1], removed ? 'success' : 'error');
            return removed ? 0 : 1;
        }
        const { flags, values } = ShellText.options(args, 'rfi');
        const path = this.resolveArgument(values, 'rm [-r] [-f] [-i] <路径>');
        if (flags.has('f') && !this.storage.fileExists(path)) return 0;
        this.storage.validateRemoval(path);
        if (this.storage.isDirectory(path) && !flags.has('r')) throw new Error('删除目录需要 -r，空目录可用 rmdir');
        if ((flags.has('r') || flags.has('i')) && !confirm(`删除 ${path}？`)) return 1;
        this.storage.deletePath(path);
        return 0;
    }

    removeEmptyDirectory(args) {
        const path = this.resolveArgument(args, 'rmdir <空目录>');
        if (!this.storage.isDirectory(path)) throw new Error('目录不存在: ' + path);
        if (this.storage.listDirectory(path).length) throw new Error('目录非空: ' + path);
        this.storage.deletePath(path);
    }

    testCondition(args) {
        if (args.length === 1) return args[0] ? 0 : 1;
        if (args.length === 2) {
            const [flag, value] = args;
            if (flag === '-n' || flag === '-z') return Boolean(value) === (flag === '-n') ? 0 : 1;
            const path = this.storage.resolvePath(value, this.storage.getCurrentPath());
            if (flag === '-f') return this.storage.isFile(path) ? 0 : 1;
            if (flag === '-d') return this.storage.isDirectory(path) ? 0 : 1;
            if (flag === '-e') return this.storage.fileExists(path) ? 0 : 1;
        }
        if (args.length === 3 && ['=', '!='].includes(args[1])) return (args[0] === args[2]) === (args[1] === '=') ? 0 : 1;
        throw new Error('用法: test -e|-f|-d <路径> 或 test -n|-z <文本> 或 test <左值> =|!= <右值>');
    }

    canRunInScript(command) {
        return ['cd', 'mkdir', 'touch', 'write', 'cp', 'tree', 'find',
            'stat', 'test', 'true', 'false', 'export', 'unset', 'env', 'calc', 'date'].includes(command);
    }

    runScript(args, signal) {
        const path = this.resolveArgument(args, 'source <脚本文件>');
        const source = this.storage.readFile(path);
        if (source.length > 32_000) throw new Error('脚本超出 32,000 字符');
        this.output('运行脚本 ' + path, 'info');
        return this.executeShell(source, { signal, script: true });
    }

    clearScreen() {
        document.getElementById('output').replaceChildren();
    }

    createTextFile(args, { protectExisting }) {
        if (!args.length) throw new Error('用法: touch <文件> [初始内容]');
        const path = this.storage.resolvePath(args[0], this.storage.getCurrentPath());
        if (!this.storage.fileExists(path)) {
            this.storage.createFile('/', path, args.slice(1).join(' '));
        } else if (protectExisting || args.length > 1) {
            throw new Error('路径已存在: ' + path);
        } else {
            this.storage.touch(path);
        }
    }

    writeFile(args, { interactive, protectExisting }) {
        if (!args.length) throw new Error('用法: write <文件> [内容]');
        const path = this.storage.resolvePath(args[0], this.storage.getCurrentPath());
        if (args.length === 1) {
            if (!interactive || protectExisting) throw new Error('此处需要显式提供文件内容');
            const node = this.storage.getNode(path);
            if (node && node.type !== 'file') throw new Error('不是文件: ' + path);
            this.showMultilineInput(path, node?.content || '', (content) => {
                const current = this.storage.getNode(path);
                if (JSON.stringify(current) !== JSON.stringify(node)) throw new Error('文件在编辑期间已变化，请重新打开后合并修改。');
                this.storage.writeText(path, content);
            });
            return;
        }
        this.storage.writeText(path, args.slice(1).join(' '), false, { protectExisting });
    }

    resolveArgument(args, usage) {
        return this.storage.resolvePath(ShellText.oneArg(args, usage), this.storage.getCurrentPath());
    }

    downloadFile(args) {
        const path = this.resolveArgument(args, 'download <文件>');
        this.ui.download(this.storage.basename(path), this.storage.readFile(path));
    }

    find(args) {
        if (!args.length) {
            throw new Error('用法: find <关键词> [起始目录]');
        }
        const keyword = args[0];
        const startPath = args[1] ? this.storage.resolvePath(args[1], this.storage.getCurrentPath()) : this.storage.getCurrentPath();
        if (!this.storage.fileExists(startPath)) throw new Error('起始路径不存在: ' + startPath);
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
        if (!this.storage.isDirectory(resolvedPath)) throw new Error('目录不存在: ' + resolvedPath);
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
            throw new Error('用法: cp <源路径> <目标路径>');
        }
        const source = this.storage.resolvePath(args[0], this.storage.getCurrentPath());
        const destination = this.storage.resolvePath(args[1], this.storage.getCurrentPath());
        const target = this.storage.copyPath(source, destination);
        this.output(`复制成功: ${source} -> ${target}`, 'success');
    }

    move(args) {
        if (args.length < 2) {
            throw new Error('用法: mv <源路径> <目标路径>');
        }
        const source = this.storage.resolvePath(args[0], this.storage.getCurrentPath());
        const destination = this.storage.resolvePath(args[1], this.storage.getCurrentPath());
        const target = this.storage.movePath(source, destination);
        this.output(`移动成功: ${source} -> ${target}`, 'success');
    }

    showHistory() {
        const history = this.storage.getCommandHistory().filter((entry) => !this.isSensitive(entry));
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
        const expression = args.join(' ');
        if (!expression) throw new Error('用法: calc <数学表达式>');
        const result = ShellSyntax.calculate(expression);
        this.output(`${expression} = ${result}`, 'success');
    }

    searchBlog(args) {
        if (!args.length) {
            throw new Error('用法: search <关键词>');
        }
        const keyword = encodeURIComponent(args.join(' '));
        const url = `/search?q=${keyword}`;
        this.output(`正在打开博客搜索: ${args.join(' ')}`, 'info');
        setTimeout(() => window.open(url, '_blank', 'noopener,noreferrer'), 300);
    }

    openWeb(args) {
        const target = args.join(' ');
        if (!target) throw new Error('用法: open <网址>');
        const url = new URL(/^[\w+.-]+:|^\//.test(target) ? target : `https://${target}`, location.href);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('仅支持 HTTP / HTTPS 地址');
        this.output('正在打开: ' + url.href, 'info');
        window.open(url.href, '_blank', 'noopener,noreferrer');
    }

    openTools() {
        this.output('正在打开工具页...', 'info');
        setTimeout(() => window.open('/tool', '_blank', 'noopener,noreferrer'), 300);
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
            throw new Error('用法: export KEY=value');
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
            throw new Error('用法: unset KEY');
        }
        args.forEach((key) => this.storage.unsetEnvVar(key));
        this.output('环境变量已删除', 'success');
    }

    async requestLlm(prompt, signal) {
        const settings = window.QuarkLLMConfig.getSettings();
        if (!settings.apiKey) {
            this.output('未检测到 API Key。请前往网站设置的「AI 与网站助手」保存连接。', 'error');
            return 1;
        }

        const history = this.storage.getLlmHistory()
            .slice(-this.contextLimit)
            .flatMap((entry) => [
                { role: 'user', content: entry.prompt },
                { role: 'assistant', content: entry.answer }
            ]);

        const card = document.createElement('div');
        card.className = 'terminal-block terminal-llm';
        const label = document.createElement('p');
        label.className = 'terminal-llm-status';
        label.setAttribute('role', 'status');
        label.textContent = `${settings.model} · 正在连接`;
        const body = document.createElement('div');
        body.className = 'terminal-markdown';
        body.setAttribute('aria-live', 'off');
        card.append(label, body);
        this.output(card);
        let latest = '';
        let frame = 0;
        let rendered = '';
        const render = () => {
            frame = 0;
            if (rendered === latest) return;
            rendered = latest;
            this.ui.updateOutput(() => this.renderMarkdown(latest, body));
        };

        try {
            const { readChatCompletion } = await import('/assets/js/llm-stream.mjs');
            const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(180000)].filter(Boolean));
            const response = await window.QuarkLLMConfig.requestChat(settings, {
                model: settings.model,
                messages: [...history, { role: 'user', content: prompt }],
                stream: true
            }, requestSignal);

            if (!response.ok) {
                throw new Error(await window.QuarkLLMConfig.parseErrorResponse(response, settings.apiKey));
            }

            label.textContent = `${settings.model} · 生成中`;
            const { message } = await readChatCompletion(response, {
                apiKey: settings.apiKey,
                signal: requestSignal,
                onUpdate: ({ content, reasoning_content }) => {
                    if (!content && reasoning_content) {
                        label.textContent = `${settings.model} · 推理中`;
                        return;
                    }
                    if (!content) return;
                    label.textContent = `${settings.model} · 生成中`;
                    latest = content;
                    if (!frame) frame = requestAnimationFrame(render);
                }
            });
            const answer = message?.content?.trim();
            if (signal?.aborted) return 130;
            if (!answer) {
                throw new Error('LLM 未返回有效内容');
            }

            this.storage.addLlmHistory({ prompt, answer, model: settings.model });
            label.textContent = `${settings.model} · 完成`;
            return 0;
        } catch (error) {
            if (signal?.aborted) return 130;
            label.textContent = `${settings.model} · 请求失败`;
            this.output(`模型请求失败：${error.message}`, 'error');
            return 1;
        } finally {
            if (frame) cancelAnimationFrame(frame);
            if (signal?.aborted) label.textContent = `${settings.model} · 已停止`;
            render();
        }
    }

    showLlmConfig() {
        const settings = window.QuarkLLMConfig.getSettings();
        const source = localStorage.getItem(window.QuarkLLMConfig.STORAGE_KEYS.legacyApiKey) ? 'localStorage (/a/qai 联动已启用)' : 'localStorage';
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
        this.output('AI 连接密钥已保存，可在夸克 AI 中使用。', 'success');
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
            throw new Error('用法: stat <路径>');
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

    showMultilineInput(path, initialContent, callback) {
        this.multilineCallback = callback;
        const modal = document.getElementById('multiline-modal');
        document.getElementById('editor-path').textContent = path;
        document.getElementById('editor-error').textContent = '';
        document.getElementById('multiline-textarea').value = initialContent;
        modal.showModal();
        document.getElementById('multiline-textarea').focus();
    }

    hideMultilineInput() {
        document.getElementById('multiline-modal').close();
        this.multilineCallback = null;
    }

    saveMultilineContent() {
        if (!this.multilineCallback) return;
        const textarea = document.getElementById('multiline-textarea');
        try {
            this.multilineCallback(textarea.value);
            this.hideMultilineInput();
            this.output('文件已保存', 'success');
        } catch (error) {
            document.getElementById('editor-error').textContent = error.message;
        }
    }

    getCompletion(input) {
        if (this.isSensitive(input) || this.shouldHandleAsLlmSession(input) ||
            /^!?\s*(?:llm|chat|ask|agent)\s/i.test(input)) return null;

        const segment = input.match(/(?:^|[|;&])([\s\S]*)$/);
        const current = segment[1];
        if (!current.trim()) return null;
        const beforeSegment = input.slice(0, input.length - current.length);
        const commandMatch = /^(\s*!?\s*)([\w-]+)$/.exec(current);
        if (commandMatch) {
            const [_, prefix, partial] = commandMatch;
            const available = [...new Set([
                ...this.builtinCommands,
                ...Object.keys(this.presetCommands.output || {}),
                ...Object.keys(this.presetCommands.redirect || {}),
                ...Object.keys(this.storage.getCustomOutputs()),
                ...Object.keys(this.storage.getCustomRedirects())
            ])];
            const matches = available.filter((cmd) => cmd !== partial && cmd.startsWith(partial.toLowerCase())).sort();
            return { prefix: beforeSegment + prefix, matches, suffix: ' ' };
        }

        const pathMatch = /^(.*\s)([^\s"'|&;<>]*)$/.exec(current);
        if (!pathMatch) return null;
        const [_, prefix, partial] = pathMatch;
        if (!/^\s*!?\s*(cd|ls|dir|cat|type|less|write|edit|nano|vi|vim|tree|stat|touch|rmdir|mkdir|cp|mv|rm|download|source|head|tail|wc|grep|sort|uniq|nl|rev|base64|sha256|json)\s/i.test(current)) return null;
        const slash = partial.lastIndexOf('/');
        const dir = partial.slice(0, slash + 1);
        const stub = partial.slice(slash + 1);
        const base = this.storage.resolvePath(dir, this.storage.getCurrentPath());
        if (!this.storage.isDirectory(base)) return null;
        const directoryOnly = /^\s*!?\s*cd\s/i.test(current);
        const matches = this.storage.listDirectory(base).filter((item) =>
            item.name.toLowerCase().startsWith(stub.toLowerCase()) && (!directoryOnly || item.type === 'dir')
        ).map((item) => {
            const path = dir + item.name + (item.type === 'dir' ? '/' : '');
            return /[\s"'\\|&;<>$]/.test(path) ? ShellSyntax.quote(path) : path;
        }).filter((path) => path !== partial);
        return { prefix: beforeSegment + prefix, matches, suffix: '' };
    }
}
