class StorageManager {
    constructor() {
        this.initializeStorage();
    }

    initializeStorage() {
        if (!localStorage.getItem('fileSystem')) {
            const defaultFS = {
                '/': {
                    type: 'dir',
                    name: '/',
                    children: ['home', '文档', '下载']
                },
                '/home': {
                    type: 'dir',
                    name: 'home',
                    children: ['欢迎.txt', 'readme.md']
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
                '/home/欢迎.txt': {
                    type: 'file',
                    name: '欢迎.txt',
                    content: '欢迎使用夸克终端！\n这是一个基于网页的模拟终端系统。\n输入"帮助"查看可用命令。',
                    size: 56,
                    created: new Date().toISOString()
                },
                '/home/readme.md': {
                    type: 'file',
                    name: 'readme.md',
                    content: '# 夸克终端使用说明\n<br>## 基本命令\n- 列表: 显示当前目录内容\n- 切换目录 [目录名]: 切换目录\n- 创建目录 [目录名]: 创建新目录\n- 删除 [名称]: 删除文件或目录\n- 清屏: 清除屏幕\n- 帮助: 显示帮助信息\n\n## 文件操作\n- 创建文本文档 [文件名]: 创建文本文件\n- 写入 [文件名] [内容]: 写入文件内容\n- 读取 [文件名]: 读取文件内容\n- type [文件名]: 显示文件内容\n- tree: 显示目录树\n\n## 特殊功能\n- 搜索博客 [关键词]: 搜索博客文章\n- 工具: 打开工具页面\n- 游戏: 进入游戏页面',
                    size: 342,
                    created: new Date().toISOString()
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



    }

    getFileSystem() {
        return JSON.parse(localStorage.getItem('fileSystem') || '{}');
    }

    setFileSystem(fs) {
        localStorage.setItem('fileSystem', JSON.stringify(fs));
    }

    getCurrentPath() {
        return localStorage.getItem('currentPath') || '/home';
    }

    setCurrentPath(path) {
        localStorage.setItem('currentPath', path);
    }

    getCommandHistory() {
        return JSON.parse(localStorage.getItem('commandHistory') || '[]');
    }

    addCommandToHistory(command) {
        const history = this.getCommandHistory();
        history.push(command);
        // 只保留最近50条历史记录
        if (history.length > 50) {
            history.shift();
        }
        localStorage.setItem('commandHistory', JSON.stringify(history));
    }

    resolvePath(path, currentPath) {
        if (path.startsWith('/')) {
            return path;
        }

        const currentDir = currentPath.endsWith('/') ? currentPath : currentPath + '/';
        return currentDir + path;
    }

    pathJoin(parts) {
        return parts.join('/').replace(/\/+/g, '/');
    }

    getParentPath(path) {
        const parts = path.split('/').filter(part => part);
        if (parts.length === 0) return '/';
        parts.pop();
        return '/' + parts.join('/');
    }

    fileExists(path) {
        const fs = this.getFileSystem();
        return fs.hasOwnProperty(path);
    }

    isDirectory(path) {
        const fs = this.getFileSystem();
        return fs[path] && fs[path].type === 'dir';
    }

    isFile(path) {
        const fs = this.getFileSystem();
        return fs[path] && fs[path].type === 'file';
    }

    createDirectory(path, name) {
        const fs = this.getFileSystem();
        const fullPath = this.pathJoin([path, name]);

        if (this.fileExists(fullPath)) {
            throw new Error(`目录已存在: ${name}`);
        }

        fs[fullPath] = {
            type: 'dir',
            name: name,
            children: [],
            created: new Date().toISOString()
        };

        // 添加到父目录的children中
        if (fs[path] && fs[path].type === 'dir') {
            fs[path].children.push(name);
        }

        this.setFileSystem(fs);
        return true;
    }

    createFile(path, name, content = '') {
        const fs = this.getFileSystem();
        const fullPath = this.pathJoin([path, name]);

        if (this.fileExists(fullPath)) {
            throw new Error(`文件已存在: ${name}`);
        }

        fs[fullPath] = {
            type: 'file',
            name: name,
            content: content,
            size: content.length,
            created: new Date().toISOString()
        };

        // 添加到父目录的children中
        if (fs[path] && fs[path].type === 'dir') {
            fs[path].children.push(name);
        }

        this.setFileSystem(fs);
        return true;
    }

    writeFile(path, content) {
        const fs = this.getFileSystem();

        if (!this.fileExists(path)) {
            throw new Error(`文件不存在: ${path}`);
        }

        if (!this.isFile(path)) {
            throw new Error(`不是文件: ${path}`);
        }

        fs[path].content = content;
        fs[path].size = content.length;
        fs[path].modified = new Date().toISOString();

        this.setFileSystem(fs);
        return true;
    }

    readFile(path) {
        const fs = this.getFileSystem();

        if (!this.fileExists(path)) {
            throw new Error(`文件不存在: ${path}`);
        }

        if (!this.isFile(path)) {
            throw new Error(`不是文件: ${path}`);
        }

        return fs[path].content;
    }

    deletePath(path) {
        const fs = this.getFileSystem();

        if (!this.fileExists(path)) {
            throw new Error(`路径不存在: ${path}`);
        }

        if (this.isDirectory(path)) {
            // 递归删除目录内容
            const children = fs[path].children;
            for (const child of children) {
                const childPath = this.pathJoin([path, child]);
                this.deletePath(childPath);
            }
        }

        // 从父目录的children中移除
        const parentPath = this.getParentPath(path);
        const name = path.split('/').pop();
        if (fs[parentPath] && fs[parentPath].type === 'dir') {
            fs[parentPath].children = fs[parentPath].children.filter(child => child !== name);
        }

        // 删除路径本身
        delete fs[path];
        this.setFileSystem(fs);
        return true;
    }

    listDirectory(path) {
        const fs = this.getFileSystem();

        if (!this.fileExists(path)) {
            throw new Error(`目录不存在: ${path}`);
        }

        if (!this.isDirectory(path)) {
            throw new Error(`不是目录: ${path}`);
        }

        return fs[path].children.map(child => {
            const childPath = this.pathJoin([path, child]);
            return {
                name: child,
                type: fs[childPath].type,
                size: fs[childPath].size || 0,
                created: fs[childPath].created
            };
        });
    }

    getDirectoryTree(path = '/', level = 0) {
        const fs = this.getFileSystem();
        const items = [];

        if (!this.fileExists(path) || !this.isDirectory(path)) {
            return items;
        }

        const children = fs[path].children;
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            const childPath = this.pathJoin([path, child]);
            const isLast = i === children.length - 1;

            items.push({
                name: child,
                type: fs[childPath].type,
                path: childPath,
                level: level,
                isLast: isLast
            });

            if (fs[childPath].type === 'dir') {
                items.push(...this.getDirectoryTree(childPath, level + 1));
            }
        }

        return items;
    }

    // 自定义指令相关方法
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
        if (outputs.hasOwnProperty(command)) {
            delete outputs[command];
            localStorage.setItem('customOutputs', JSON.stringify(outputs));
            return true;
        }
        return false;
    }

    deleteCustomRedirect(command) {
        const redirects = this.getCustomRedirects();
        if (redirects.hasOwnProperty(command)) {
            delete redirects[command];
            localStorage.setItem('customRedirects', JSON.stringify(redirects));
            return true;
        }
        return false;
    }


}