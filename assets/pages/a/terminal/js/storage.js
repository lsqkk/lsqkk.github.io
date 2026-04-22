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
                    content: '欢迎使用夸克终端 v2。\n现在支持更完整的 shell 常用命令，并可直接调用 LLM 对话。\n如果你之前在 /a/ds 保存过 API Key，这里会直接读取。',
                    size: 75,
                    created: now,
                    modified: now
                },
                '/home/readme.md': {
                    type: 'file',
                    name: 'readme.md',
                    content: '# 夸克终端\n\n- help: 查看全部命令\n- pwd / ls / cd / mkdir / touch / cat / cp / mv / find / grep\n- llm \"你好\": 使用共享的 API Key 直接发起对话\n- llm-config: 查看当前 LLM 配置来源\n- llm-key / llm-base / llm-model: 在终端里直接设置',
                    size: 181,
                    created: now,
                    modified: now
                },
                '/home/notes.txt': {
                    type: 'file',
                    name: 'notes.txt',
                    content: '尝试这些命令：\nls\npwd\nfind 终端\ngrep LLM readme.md\nllm 介绍一下夸克终端',
                    size: 60,
                    created: now,
                    modified: now
                },
                '/etc/profile': {
                    type: 'file',
                    name: 'profile',
                    content: 'USER=quark\nHOME=/home\nSHELL=/bin/qsh\nTERM=xterm-256color',
                    size: 57,
                    created: now,
                    modified: now
                },
                '/var/log/terminal.log': {
                    type: 'file',
                    name: 'terminal.log',
                    content: `${now} boot: terminal initialized`,
                    size: 38,
                    created: now,
                    modified: now
                }
            };
            localStorage.setItem('fileSystem', JSON.stringify(defaultFS));
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

        if (!localStorage.getItem('dangerMode')) {
            localStorage.setItem('dangerMode', 'false');
        }

        if (!localStorage.getItem('selfDestructTriggered')) {
            localStorage.setItem('selfDestructTriggered', 'false');
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

        this.setDangerCookie();
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
        this.setEnvVar('PWD', normalized);
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
        env[key] = value;
        this.setEnv(env);
    }

    unsetEnvVar(key) {
        const env = this.getEnv();
        delete env[key];
        this.setEnv(env);
    }

    syncPwdEnv() {
        this.setEnvVar('PWD', this.getCurrentPath());
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
        const targetPath = this.normalizePath(name.includes('/') ? name : this.pathJoin([path, name]));

        if (this.fileExists(targetPath)) {
            throw new Error(`目录已存在: ${targetPath}`);
        }

        const parts = targetPath.split('/').filter(Boolean);
        let current = '/';

        parts.forEach((part) => {
            const nextPath = this.pathJoin([current, part]);
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
        const fullPath = this.normalizePath(name.includes('/') ? name : this.pathJoin([path, name]));
        const parentPath = this.ensureParentDirectory(fullPath, fs);

        if (fs[fullPath]) {
            throw new Error(`文件已存在: ${fullPath}`);
        }

        fs[fullPath] = {
            type: 'file',
            name: this.basename(fullPath),
            content,
            size: content.length,
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
        fs[normalized].size = content.length;
        fs[normalized].modified = new Date().toISOString();

        this.setFileSystem(fs);
        return true;
    }

    appendFile(path, content) {
        const current = this.readFile(path);
        const nextContent = current ? `${current}\n${content}` : content;
        this.writeFile(path, nextContent);
        return nextContent;
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

        if (!fs[normalized]) {
            throw new Error(`路径不存在: ${normalized}`);
        }

        if (normalized === '/') {
            throw new Error('根目录不能删除');
        }

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
                    size: fs[childPath].size || 0,
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

    copyPath(sourcePath, destinationPath) {
        const fs = this.getFileSystem();
        const source = this.normalizePath(sourcePath);
        let destination = this.normalizePath(destinationPath);

        if (!fs[source]) {
            throw new Error(`路径不存在: ${source}`);
        }

        if (fs[destination] && fs[destination].type === 'dir') {
            destination = this.pathJoin([destination, this.basename(source)]);
        }

        if (fs[destination]) {
            throw new Error(`目标已存在: ${destination}`);
        }

        const parentPath = this.ensureParentDirectory(destination, fs);
        this.clonePathData(source, destination, fs);

        if (!fs[parentPath].children.includes(this.basename(destination))) {
            fs[parentPath].children.push(this.basename(destination));
        }

        this.setFileSystem(fs);
        return destination;
    }

    movePath(sourcePath, destinationPath) {
        const source = this.normalizePath(sourcePath);
        const target = this.copyPath(source, destinationPath);
        this.deletePath(source);
        return target;
    }

    getStats(path) {
        const node = this.getNode(path);
        if (!node) {
            throw new Error(`路径不存在: ${path}`);
        }

        return {
            path: this.normalizePath(path),
            type: node.type,
            size: node.size || 0,
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
            if (!path.startsWith(normalizedStart)) return;
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
        outputs[command] = outputText;
        localStorage.setItem('customOutputs', JSON.stringify(outputs));
    }

    addCustomRedirect(command, url) {
        const redirects = this.getCustomRedirects();
        redirects[command] = url;
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

    getDangerMode() {
        return localStorage.getItem('dangerMode') === 'true';
    }

    setDangerMode(value) {
        localStorage.setItem('dangerMode', value.toString());
        this.setDangerCookie();
    }

    getSelfDestructTriggered() {
        return localStorage.getItem('selfDestructTriggered') === 'true' ||
            this.getCookie('terminal_self_destruct') === 'true';
    }

    setSelfDestructTriggered(value) {
        localStorage.setItem('selfDestructTriggered', value.toString());
        this.setCookie('terminal_self_destruct', value.toString(), 365);
    }

    setCookie(name, value, days) {
        const date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        const expires = `expires=${date.toUTCString()}`;
        document.cookie = `${name}=${value};${expires};path=/`;
    }

    getCookie(name) {
        const nameEQ = `${name}=`;
        const cookies = document.cookie.split(';');
        for (let index = 0; index < cookies.length; index += 1) {
            let cookie = cookies[index];
            while (cookie.charAt(0) === ' ') {
                cookie = cookie.substring(1);
            }
            if (cookie.indexOf(nameEQ) === 0) {
                return cookie.substring(nameEQ.length);
            }
        }
        return null;
    }

    setDangerCookie() {
        this.setCookie('terminal_danger_mode', this.getDangerMode().toString(), 30);
    }

    checkDangerousCommand(command) {
        const dangerousCommands = [
            'rm -rf /',
            'sudo rm -rf /',
            'rm -rf /*',
            'rm -rf .',
            'rm -rf ~',
            ':(){ :|:& };:',
            'del /f /s /q *.*',
            'rd /s /q c:',
            'format c: /fs:NTFS /q /y',
            'format /q /y',
            'mkfs',
            'dd if=/dev/zero of=/dev/sda',
            'mv / /dev/null',
            'chmod -R 000 /',
            '强制删除所有文件',
            '格式化系统',
            '系统自毁',
            '摧毁终端'
        ];

        const cmdLower = String(command || '').toLowerCase().trim();
        if (dangerousCommands.some((dangerCmd) => cmdLower === dangerCmd.toLowerCase())) {
            return true;
        }

        const dangerPatterns = [
            /rm\s+.*-r.*-f.*\/.*/i,
            /del\s+.*\/f.*\/s.*\/q.*\*\.\*/i,
            /format\s+.*\/q.*\/y/i,
            /rd\s+.*\/s.*\/q.*:\\/i,
            /sudo\s+rm.*-rf/i,
            /chmod.*-R.*000.*\//i,
            /dd.*if=.*zero.*of=.*sda/i,
            /删除.*所有.*文件/i,
            /格式化.*系统/i
        ];

        return dangerPatterns.some((pattern) => pattern.test(command));
    }

    destroySystem() {
        localStorage.clear();
        this.setCookie('terminal_self_destruct', 'true', 365);
        this.setCookie('terminal_destroyed', 'true', 365);
        this.setCookie('quark_terminal_dead', 'true', 730);
        sessionStorage.setItem('terminal_destroyed', 'true');

        if ('indexedDB' in window) {
            this.setIndexedDBDestruction();
        }
    }

    setIndexedDBDestruction() {
        const request = indexedDB.open('TerminalDestructionDB', 1);

        request.onupgradeneeded = function (event) {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('destruction')) {
                db.createObjectStore('destruction', { keyPath: 'id' });
            }
        };

        request.onsuccess = function (event) {
            const db = event.target.result;
            const transaction = db.transaction(['destruction'], 'readwrite');
            const store = transaction.objectStore('destruction');
            store.put({
                id: 'self_destruct',
                triggered: true,
                timestamp: new Date().toISOString(),
                command: '危险指令执行',
                permanent: true
            });
        };
    }

    shouldShowDestruction() {
        return this.getSelfDestructTriggered() ||
            this.getCookie('terminal_destroyed') === 'true' ||
            sessionStorage.getItem('terminal_destroyed') === 'true';
    }
}
