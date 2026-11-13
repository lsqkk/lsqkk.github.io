class StorageManager {
    constructor() {
        this.initializeStorage();
    }

    initializeStorage() {
        if (!localStorage.getItem('fileSystem')) {
            const now = new Date().toISOString();
            const defaultFS = {
                '/': {
                    type: 'dir',
                    name: '/',
                    children: ['home', '文档', '下载', 'etc', 'var', 'tmp']
                },
                '/home': {
                    type: 'dir',
                    name: 'home',
                    children: ['欢迎.txt', 'readme.md', 'notes.txt']
                },
                '/文档': {
                    type: 'dir',
                    name: '文档',
                    children: []
                },
                '/下载': {
                    type: 'dir',
                    name: '下载',
                    children: []
                },
                '/etc': {
                    type: 'dir',
                    name: 'etc',
                    children: ['profile']
                },
                '/var': {
                    type: 'dir',
                    name: 'var',
                    children: ['log']
                },
                '/var/log': {
                    type: 'dir',
                    name: 'log',
                    children: ['terminal.log']
                },
                '/tmp': {
                    type: 'dir',
                    name: 'tmp',
                    children: []
                },
                '/home/欢迎.txt': {
                    type: 'file',
                    name: '欢迎.txt',
                    content: '欢迎使用夸克终端。\n输入 help 查看命令。用管道组合文本处理步骤，或通过 agent 生成和执行命令计划。\n终端与夸克 AI 共用模型连接。',
                    created: now,
                    modified: now
                },
                '/home/readme.md': {
                    type: 'file',
                    name: 'readme.md',
                    content: '# 夸克终端\n\n- help 查看命令，man grep 查看文本筛选用法\n- cat readme.md | grep -i llm | nl\n- echo hello > /tmp/hello.txt\n- llm <消息> 与模型对话\n- agent <任务> 生成命令计划，agent run 执行已审阅的计划',
                    created: now,
                    modified: now
                },
                '/home/notes.txt': {
                    type: 'file',
                    name: 'notes.txt',
                    content: '尝试这些命令：\nls -al\npwd\nfind 终端\ncat readme.md | grep -in llm\nprintf "城市,数量" > /tmp/data.csv',
                    created: now,
                    modified: now
                },
                '/etc/profile': {
                    type: 'file',
                    name: 'profile',
                    content: 'USER=quark\nHOME=/home\nSHELL=/bin/qsh\nTERM=xterm-256color',
                    created: now,
                    modified: now
                },
                '/var/log/terminal.log': {
                    type: 'file',
                    name: 'terminal.log',
                    content: `${now} boot: terminal initialized`,
                    created: now,
                    modified: now
                }
            };
            localStorage.setItem('fileSystem', JSON.stringify(defaultFS));
        }

        // Earlier versions could lock this terminal after a simulated destructive command.
        localStorage.removeItem('dangerMode');
        localStorage.removeItem('selfDestructTriggered');
        sessionStorage.removeItem('terminal_destroyed');
        for (const cookie of ['terminal_danger_mode', 'terminal_self_destruct', 'terminal_destroyed', 'quark_terminal_dead']) {
            if (document.cookie.includes(cookie + '=')) document.cookie = cookie + '=; Max-Age=0; Path=/';
        }

        if (!localStorage.getItem('currentPath')) {
            localStorage.setItem('currentPath', '/home');
        }

        if (!localStorage.getItem('commandHistory')) {
            localStorage.setItem('commandHistory', JSON.stringify([]));
        }

        if (!localStorage.getItem('customOutputs')) {
            localStorage.setItem('customOutputs', JSON.stringify({}));
        }

        if (!localStorage.getItem('customRedirects')) {
            localStorage.setItem('customRedirects', JSON.stringify({}));
        }

        if (!localStorage.getItem('terminalEnv')) {
            localStorage.setItem('terminalEnv', JSON.stringify({
                USER: 'quark',
                HOME: '/home',
                SHELL: '/bin/qsh',
                TERM: 'xterm-256color',
                LANG: 'zh-CN.UTF-8',
                PWD: '/home'
            }));
        }

        if (!localStorage.getItem('terminalLlmHistory')) {
            localStorage.setItem('terminalLlmHistory', JSON.stringify([]));
        }

        this.recoverCurrentPath();
        this.syncPwdEnv();
    }

    getFileSystem() {
        return JSON.parse(localStorage.getItem('fileSystem') || '{}');
    }

    setFileSystem(fs) {
        localStorage.setItem('fileSystem', JSON.stringify(fs));
    }

    getCurrentPath() {
        return this.normalizePath(localStorage.getItem('currentPath') || '/home', '/');
    }

    setCurrentPath(path) {
        const normalized = this.normalizePath(path);
        localStorage.setItem('currentPath', normalized);
        this.syncPwdEnv();
    }

    getCommandHistory() {
        return JSON.parse(localStorage.getItem('commandHistory') || '[]');
    }

    addCommandToHistory(command) {
        const history = this.getCommandHistory();
        history.push(command);
        if (history.length > 200) {
            history.shift();
        }
        localStorage.setItem('commandHistory', JSON.stringify(history));
    }

    getEnv() {
        const env = JSON.parse(localStorage.getItem('terminalEnv') || '{}');
        if (!env.HOME) env.HOME = '/home';
        if (!env.USER) env.USER = 'quark';
        env.PWD = this.normalizePath(localStorage.getItem('currentPath') || env.PWD || '/home', '/');
        return env;
    }

    setEnv(env) {
        localStorage.setItem('terminalEnv', JSON.stringify(env));
    }

    setEnvVar(key, value) {
        const env = this.getEnv();
        if (!/^[A-Za-z_]\w*$/.test(key) || key === '__proto__' || key === 'PWD') {
            throw new Error('环境变量名称无效或为只读');
        }
        env[key] = value;
        this.setEnv(env);
    }

    unsetEnvVar(key) {
        const env = this.getEnv();
        delete env[key];
        this.setEnv(env);
    }

    syncPwdEnv() {
        this.setEnv(this.getEnv());
    }

    getLlmHistory() {
        return JSON.parse(localStorage.getItem('terminalLlmHistory') || '[]');
    }

    addLlmHistory(entry) {
        const history = this.getLlmHistory();
        history.push({
            ...entry,
            createdAt: new Date().toISOString()
        });
        if (history.length > 20) {
            history.shift();
        }
        localStorage.setItem('terminalLlmHistory', JSON.stringify(history));
    }

    clearLlmHistory() {
        localStorage.setItem('terminalLlmHistory', JSON.stringify([]));
    }

    normalizePath(path, currentPath = '/') {
        const env = JSON.parse(localStorage.getItem('terminalEnv') || '{}');
        const homePath = env.HOME || '/home';
        let input = String(path || '').trim();

        if (!input) {
            input = currentPath || '/';
        }

        if (input === '~') {
            input = homePath;
        } else if (input.startsWith('~/')) {
            input = `${homePath}/${input.slice(2)}`;
        } else if (!input.startsWith('/')) {
            input = `${currentPath || '/'}${(currentPath || '/').endsWith('/') ? '' : '/'}${input}`;
        }

        const segments = input.split('/').filter(Boolean);
        const normalizedSegments = [];
        segments.forEach((segment) => {
            if (segment === '.' || segment === '') return;
            if (segment === '..') {
                normalizedSegments.pop();
                return;
            }
            normalizedSegments.push(segment);
        });

        return `/${normalizedSegments.join('/')}`.replace(/\/+/g, '/') || '/';
    }

    resolvePath(path, currentPath) {
        return this.normalizePath(path, currentPath);
    }

    pathJoin(parts) {
        return this.normalizePath(parts.join('/'));
    }

    basename(path) {
        if (path === '/') return '/';
        return this.normalizePath(path).split('/').pop() || '/';
    }

    getParentPath(path) {
        const normalized = this.normalizePath(path);
        if (normalized === '/') return '/';
        const parts = normalized.split('/').filter(Boolean);
        parts.pop();
        return parts.length ? `/${parts.join('/')}` : '/';
    }

    fileExists(path) {
        const fs = this.getFileSystem();
        return Object.prototype.hasOwnProperty.call(fs, this.normalizePath(path));
    }

    isDirectory(path) {
        const fs = this.getFileSystem();
        const normalized = this.normalizePath(path);
        return fs[normalized] && fs[normalized].type === 'dir';
    }

    isFile(path) {
        const fs = this.getFileSystem();
        const normalized = this.normalizePath(path);
        return fs[normalized] && fs[normalized].type === 'file';
    }

    getNode(path) {
        const fs = this.getFileSystem();
        return fs[this.normalizePath(path)];
    }

    ensureParentDirectory(path, fs = this.getFileSystem()) {
        const parentPath = this.getParentPath(path);
        if (!fs[parentPath] || fs[parentPath].type !== 'dir') {
            throw new Error(`父目录不存在: ${parentPath}`);
        }
        return parentPath;
    }

    createDirectory(path, name, recursive = false) {
        const fs = this.getFileSystem();
        const targetPath = this.normalizePath(name, path);

        if (this.fileExists(targetPath)) {
            throw new Error(`目录已存在: ${targetPath}`);
        }

        const parts = targetPath.split('/').filter(Boolean);
        let current = '/';

        parts.forEach((part) => {
            const nextPath = this.pathJoin([current, part]);
            if (fs[nextPath]?.type === 'file') throw new Error('路径包含文件: ' + nextPath);
            if (!fs[nextPath]) {
                if (!recursive && nextPath !== targetPath) {
                    throw new Error(`上级目录不存在: ${nextPath}`);
                }
                fs[nextPath] = {
                    type: 'dir',
                    name: part,
                    children: [],
                    created: new Date().toISOString()
                };

                if (fs[current] && fs[current].type === 'dir' && !fs[current].children.includes(part)) {
                    fs[current].children.push(part);
                }
            }
            current = nextPath;
        });

        this.setFileSystem(fs);
        return targetPath;
    }

    createFile(path, name, content = '') {
        const fs = this.getFileSystem();
        const fullPath = this.normalizePath(name, path);
        const parentPath = this.ensureParentDirectory(fullPath, fs);

        if (fs[fullPath]) {
            throw new Error(`文件已存在: ${fullPath}`);
        }

        fs[fullPath] = {
            type: 'file',
            name: this.basename(fullPath),
            content,
            created: new Date().toISOString(),
            modified: new Date().toISOString()
        };

        if (!fs[parentPath].children.includes(this.basename(fullPath))) {
            fs[parentPath].children.push(this.basename(fullPath));
        }

        this.setFileSystem(fs);
        return fullPath;
    }

    writeFile(path, content) {
        const fs = this.getFileSystem();
        const normalized = this.normalizePath(path);

        if (!fs[normalized]) {
            throw new Error(`文件不存在: ${normalized}`);
        }

        if (fs[normalized].type !== 'file') {
            throw new Error(`不是文件: ${normalized}`);
        }

        fs[normalized].content = content;
        fs[normalized].modified = new Date().toISOString();

        this.setFileSystem(fs);
        return true;
    }

    writeText(path, content, append = false, { protectExisting = false } = {}) {
        if (!this.fileExists(path)) return this.createFile('/', path, content);
        if (protectExisting) throw new Error('已有文件，不能覆盖: ' + path);
        return this.writeFile(path, append ? this.readFile(path) + content : content);
    }

    touch(path) {
        const fs = this.getFileSystem();
        const node = fs[path];
        if (!node) throw new Error('路径不存在: ' + path);
        node.modified = new Date().toISOString();
        this.setFileSystem(fs);
    }

    recoverCurrentPath() {
        const fs = this.getFileSystem();
        let path = this.getCurrentPath();
        while (path !== '/' && fs[path]?.type !== 'dir') path = this.getParentPath(path);
        if (path !== this.getCurrentPath()) this.setCurrentPath(path);
        return path;
    }

    validateRemoval(path, fs = this.getFileSystem()) {
        if (!fs[path]) throw new Error('路径不存在: ' + path);
        const current = this.getCurrentPath();
        if (path === '/' || current === path || current.startsWith(path + '/')) {
            throw new Error('无法移除根目录、当前目录或其上级');
        }
    }

    readFile(path) {
        const normalized = this.normalizePath(path);
        const node = this.getNode(normalized);

        if (!node) {
            throw new Error(`文件不存在: ${normalized}`);
        }

        if (node.type !== 'file') {
            throw new Error(`不是文件: ${normalized}`);
        }

        return node.content;
    }

    deletePath(path) {
        const fs = this.getFileSystem();
        const normalized = this.normalizePath(path);

        this.validateRemoval(normalized, fs);

        this.deletePathFromSnapshot(normalized, fs);
        this.setFileSystem(fs);
        return true;
    }

    deletePathFromSnapshot(path, fs) {
        if (!fs[path]) {
            return;
        }

        if (fs[path].type === 'dir') {
            [...fs[path].children].forEach((child) => {
                this.deletePathFromSnapshot(this.pathJoin([path, child]), fs);
            });
        }

        const parentPath = this.getParentPath(path);
        const name = this.basename(path);
        if (fs[parentPath] && fs[parentPath].type === 'dir') {
            fs[parentPath].children = fs[parentPath].children.filter((child) => child !== name);
        }

        delete fs[path];
    }

    listDirectory(path) {
        const fs = this.getFileSystem();
        const normalized = this.normalizePath(path);

        if (!fs[normalized]) {
            throw new Error(`目录不存在: ${normalized}`);
        }

        if (fs[normalized].type !== 'dir') {
            throw new Error(`不是目录: ${normalized}`);
        }

        return fs[normalized].children
            .map((child) => {
                const childPath = this.pathJoin([normalized, child]);
                return {
                    name: child,
                    path: childPath,
                    type: fs[childPath].type,
                    size: fs[childPath].type === 'file' ? new TextEncoder().encode(fs[childPath].content).length : 0,
                    created: fs[childPath].created,
                    modified: fs[childPath].modified || fs[childPath].created
                };
            })
            .sort((a, b) => {
                if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
                return a.name.localeCompare(b.name, 'zh-CN');
            });
    }

    getDirectoryTree(path = '/', level = 0) {
        const normalized = this.normalizePath(path);
        const items = [];

        if (!this.fileExists(normalized) || !this.isDirectory(normalized)) {
            return items;
        }

        const children = this.listDirectory(normalized);
        children.forEach((child, index) => {
            const isLast = index === children.length - 1;
            items.push({
                name: child.name,
                type: child.type,
                path: child.path,
                level,
                isLast
            });

            if (child.type === 'dir') {
                items.push(...this.getDirectoryTree(child.path, level + 1));
            }
        });

        return items;
    }

    clonePathData(sourcePath, targetPath, fs) {
        const source = fs[sourcePath];
        if (!source) {
            throw new Error(`路径不存在: ${sourcePath}`);
        }

        const cloned = JSON.parse(JSON.stringify(source));
        cloned.name = this.basename(targetPath);
        cloned.modified = new Date().toISOString();
        fs[targetPath] = cloned;

        if (source.type === 'dir') {
            fs[targetPath].children = [...source.children];
            source.children.forEach((child) => {
                const childSourcePath = this.pathJoin([sourcePath, child]);
                const childTargetPath = this.pathJoin([targetPath, child]);
                this.clonePathData(childSourcePath, childTargetPath, fs);
            });
        }
    }

    copyPath(sourcePath, destinationPath, { move = false } = {}) {
        const fs = this.getFileSystem();
        const source = this.normalizePath(sourcePath);
        let destination = this.normalizePath(destinationPath);

        if (!fs[source]) {
            throw new Error(`路径不存在: ${source}`);
        }

        if (move) this.validateRemoval(source, fs);
        if (fs[destination] && fs[destination].type === 'dir') {
            destination = this.pathJoin([destination, this.basename(source)]);
        }

        if (fs[destination]) {
            throw new Error(`目标已存在: ${destination}`);
        }

        if (source === '/' || destination.startsWith(source + '/')) {
            throw new Error('目标路径位于源目录内');
        }
        const parentPath = this.ensureParentDirectory(destination, fs);
        this.clonePathData(source, destination, fs);

        if (!fs[parentPath].children.includes(this.basename(destination))) {
            fs[parentPath].children.push(this.basename(destination));
        }

        if (move) this.deletePathFromSnapshot(source, fs);
        this.setFileSystem(fs);
        return destination;
    }

    movePath(sourcePath, destinationPath) {
        return this.copyPath(sourcePath, destinationPath, { move: true });
    }

    getStats(path) {
        const node = this.getNode(path);
        if (!node) {
            throw new Error(`路径不存在: ${path}`);
        }

        return {
            path: this.normalizePath(path),
            type: node.type,
            size: node.type === 'file' ? new TextEncoder().encode(node.content).length : 0,
            created: node.created || '',
            modified: node.modified || node.created || '',
            children: node.children ? node.children.length : 0
        };
    }

    findByName(keyword, startPath = '/') {
        const normalizedStart = this.normalizePath(startPath);
        const keywordLower = String(keyword || '').toLowerCase();
        const matches = [];
        const fs = this.getFileSystem();

        Object.keys(fs).forEach((path) => {
            if (path !== normalizedStart && normalizedStart !== '/' && !path.startsWith(normalizedStart + '/')) return;
            if (fs[path].name.toLowerCase().includes(keywordLower)) {
                matches.push({
                    path,
                    type: fs[path].type
                });
            }
        });

        return matches.sort((a, b) => a.path.localeCompare(b.path, 'zh-CN'));
    }

    getCustomOutputs() {
        return JSON.parse(localStorage.getItem('customOutputs') || '{}');
    }

    getCustomRedirects() {
        return JSON.parse(localStorage.getItem('customRedirects') || '{}');
    }

    addCustomOutput(command, outputText) {
        const outputs = this.getCustomOutputs();
        Object.defineProperty(outputs, command, { value: outputText, enumerable: true, configurable: true });
        localStorage.setItem('customOutputs', JSON.stringify(outputs));
    }

    addCustomRedirect(command, url) {
        const redirects = this.getCustomRedirects();
        Object.defineProperty(redirects, command, { value: url, enumerable: true, configurable: true });
        localStorage.setItem('customRedirects', JSON.stringify(redirects));
    }

    deleteCustomOutput(command) {
        const outputs = this.getCustomOutputs();
        if (Object.prototype.hasOwnProperty.call(outputs, command)) {
            delete outputs[command];
            localStorage.setItem('customOutputs', JSON.stringify(outputs));
            return true;
        }
        return false;
    }

    deleteCustomRedirect(command) {
        const redirects = this.getCustomRedirects();
        if (Object.prototype.hasOwnProperty.call(redirects, command)) {
            delete redirects[command];
            localStorage.setItem('customRedirects', JSON.stringify(redirects));
            return true;
        }
        return false;
    }

}
