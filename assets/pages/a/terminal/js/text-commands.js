const textCommands = {
    echo: {
        usage: 'echo <文本>',
        description: '输出文本',
        run: ({ args }) => args.join(' ') + '\n'
    },
    pwd: {
        usage: 'pwd',
        description: '显示当前目录',
        run: ({ manager }) => manager.storage.getCurrentPath() + '\n'
    },
    cat: {
        usage: 'cat [文件…]',
        description: '读取文件或管道输入',
        run: ({ input, args, read }) => read(input, args)
    },
    printf: {
        usage: 'printf <格式> [值…]',
        description: '格式化文本，支持 %s、%d、%%、\\n 和 \\t',
        run: ({ args }) => {
            const [format, ...values] = args;
            if (format === undefined) throw new Error('用法: printf <格式> [值…]');
            let index = 0;
            const escaped = { n: '\n', r: '\r', t: '\t', '\\': '\\' };
            return format.replace(/\\([nrt\\])|%([sd%])/g, (match, escape, specifier) => {
                if (escape) return escaped[escape];
                if (specifier === '%') return '%';
                const value = values[index++] ?? '';
                if (specifier === 's') return value;
                const number = Number(value);
                if (!Number.isSafeInteger(number)) throw new Error('printf %d 需要整数');
                return String(number);
            });
        }
    },
    head: {
        usage: 'head [-n 行数] [文件]',
        description: '保留开头几行，默认 10 行',
        run: (context) => ShellText.slice(context, 'head')
    },
    tail: {
        usage: 'tail [-n 行数] [文件]',
        description: '保留末尾几行，默认 10 行',
        run: (context) => ShellText.slice(context, 'tail')
    },
    wc: {
        usage: 'wc [-lwmc] [文件]',
        description: '统计行、词、字符或 UTF-8 字节',
        run: ({ input, args, read }) => {
            const { flags, values } = ShellText.options(args, 'lwmc');
            const content = read(input, values, 'wc [文件]');
            const counts = {
                l: ShellText.lines(content).length,
                w: content.trim() ? content.trim().split(/\s+/u).length : 0,
                m: [...content].length,
                c: new TextEncoder().encode(content).length
            };
            const columns = [...(flags.size ? 'lwmc' : 'lwm')].filter((flag) => !flags.size || flags.has(flag));
            return columns.map((flag) => counts[flag]).join(' ') + '\n';
        }
    },
    grep: {
        usage: 'grep [-inv] <文本> [文件]',
        description: '按字面文本筛选行，可显示行号、忽略大小写或反选',
        run: ({ input, args, read }) => {
            const { flags, values } = ShellText.options(args, 'inv');
            if (!values.length) throw new Error('用法: grep [-inv] <文本> [文件]');
            const [pattern, ...files] = values;
            const needle = flags.has('i') ? pattern.toLowerCase() : pattern;
            const matches = ShellText.lines(read(input, files, 'grep <文本> [文件]'))
                .map((line, i) => ({ line, i }))
                .filter(({ line }) => (flags.has('i') ? line.toLowerCase() : line).includes(needle) !== flags.has('v'))
                .map(({ line, i }) => flags.has('n') ? `${i + 1}:${line}` : line);
            return { text: ShellText.join(matches), status: matches.length ? 0 : 1 };
        }
    },
    sort: {
        usage: 'sort [-rnu] [文件]',
        description: '排序，可逆序、按数值排序或去重',
        run: ({ input, args, read }) => {
            const { flags, values } = ShellText.options(args, 'rnu');
            const lines = ShellText.lines(read(input, values, 'sort [文件]'));
            const collator = new Intl.Collator('zh-CN', { numeric: flags.has('n') });
            lines.sort((left, right) => {
                const numberOrder = flags.has('n') ? (parseFloat(left) || 0) - (parseFloat(right) || 0) : 0;
                return (numberOrder || collator.compare(left, right)) * (flags.has('r') ? -1 : 1);
            });
            return ShellText.join(flags.has('u') ? [...new Set(lines)] : lines);
        }
    },
    uniq: {
        usage: 'uniq [-c] [文件]',
        description: '合并相邻重复行，或统计重复次数',
        run: ({ input, args, read }) => {
            const { flags, values } = ShellText.options(args, 'c');
            const groups = [];
            for (const line of ShellText.lines(read(input, values, 'uniq [文件]'))) {
                const last = groups.at(-1);
                if (last?.line === line) last.count += 1;
                else groups.push({ line, count: 1 });
            }
            return ShellText.join(groups.map(({ line, count }) => flags.has('c') ? `${count} ${line}` : line));
        }
    },
    cut: {
        usage: 'cut -d 分隔符 -f 列号[,列号] [文件]',
        description: '从每行抽取指定列',
        run: ({ input, args, read }) => {
            const delimiterIndex = args.indexOf('-d');
            const fieldIndex = args.indexOf('-f');
            const delimiter = args[delimiterIndex + 1];
            const fields = args[fieldIndex + 1];
            if (delimiterIndex < 0 || fieldIndex < 0 || [...(delimiter || '')].length !== 1 ||
                !/^[1-9]\d*(?:,[1-9]\d*)*$/.test(fields || '')) {
                throw new Error('用法: cut -d 分隔符 -f 列号[,列号] [文件]');
            }
            const files = args.filter((_, i) => ![delimiterIndex, delimiterIndex + 1, fieldIndex, fieldIndex + 1].includes(i));
            const selected = new Set(fields.split(',').map(Number));
            const lines = ShellText.lines(read(input, files, 'cut -d 分隔符 -f 列号 [文件]'));
            return ShellText.join(lines.map((line) => line.split(delimiter).filter((_, i) => selected.has(i + 1)).join(delimiter)));
        }
    },
    nl: {
        usage: 'nl [文件]',
        description: '添加行号',
        run: ({ input, args, read }) => ShellText.join(
            ShellText.lines(read(input, args, 'nl [文件]')).map((line, i) => `${i + 1}\t${line}`)
        )
    },
    rev: {
        usage: 'rev [文件]',
        description: '反转每行字符顺序',
        run: ({ input, args, read }) => ShellText.join(
            ShellText.lines(read(input, args, 'rev [文件]')).map((line) => [...line].reverse().join(''))
        )
    },
    json: {
        usage: 'json [文件]',
        description: '格式化 JSON',
        run: ({ input, args, read }) => JSON.stringify(JSON.parse(read(input, args, 'json [文件]')), null, 2) + '\n'
    },
    base64: {
        usage: 'base64 [-d] [文件]',
        description: '以 UTF-8 编码或解码 Base64',
        run: ({ input, args, read }) => {
            const { flags, values } = ShellText.options(args, 'd');
            const text = read(input, values, 'base64 [-d] [文件]');
            if (flags.has('d')) {
                const bytes = Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
                return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
            }
            let binary = '';
            for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
            return btoa(binary) + '\n';
        }
    },
    sha256: {
        usage: 'sha256 [文件]',
        description: '计算内容的 SHA-256 摘要',
        run: async ({ input, args, read }) => {
            const bytes = new TextEncoder().encode(read(input, args, 'sha256 [文件]'));
            const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
            return Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('') + '\n';
        }
    },
    basename: {
        usage: 'basename <路径>',
        description: '取出路径最后一段',
        run: ({ args, manager }) => manager.storage.basename(ShellText.oneArg(args, 'basename <路径>')) + '\n'
    },
    dirname: {
        usage: 'dirname <路径>',
        description: '取出上一级路径',
        run: ({ args, manager }) => manager.storage.getParentPath(
            manager.storage.resolvePath(ShellText.oneArg(args, 'dirname <路径>'), manager.storage.getCurrentPath())
        ) + '\n'
    },
    ls: {
        usage: 'ls [-al] [路径]',
        description: '列出目录，支持隐藏文件和详细信息',
        run: ({ args, manager }) => {
            const { flags, values } = ShellText.options(args, 'al');
            const storage = manager.storage;
            const path = storage.resolvePath(values[0], storage.getCurrentPath());
            const items = storage.isFile(path)
                ? [{ ...storage.getStats(path), name: storage.basename(path) }]
                : storage.listDirectory(path).filter((item) => flags.has('a') || !item.name.startsWith('.'));
            return ShellText.join(items.map((item) => {
                const name = item.name + (item.type === 'dir' ? '/' : '');
                if (!flags.has('l')) return name;
                return `${item.type === 'dir' ? 'd' : '-'} ${String(item.size).padStart(6)} ${name}`;
            }));
        }
    }
};

class ShellText {
    static options(args, supported) {
        const flags = new Set();
        const values = [];
        let parsing = true;
        for (const arg of args) {
            if (parsing && arg === '--') {
                parsing = false;
                continue;
            }
            if (parsing && /^-.+/.test(arg)) {
                for (const flag of arg.slice(1)) {
                    if (!supported.includes(flag)) throw new Error('未知选项: -' + flag);
                    flags.add(flag);
                }
            } else {
                values.push(arg);
            }
        }
        return { flags, values };
    }

    static lines(content) {
        if (!content) return [];
        return content.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
    }

    static join(lines) {
        return lines.length ? lines.join('\n') + '\n' : '';
    }

    static oneArg(args, usage) {
        if (args.length !== 1 || !args[0]) throw new Error('用法: ' + usage);
        return args[0];
    }

    static slice({ input, args, read }, mode) {
        let count = 10;
        let files = args;
        if (args[0] === '-n') {
            count = Number(args[1]);
            if (!Number.isInteger(count) || count < 0) throw new Error('行数必须是非负整数');
            files = args.slice(2);
        }
        const lines = ShellText.lines(read(input, files, mode + ' [-n 行数] [文件]'));
        return ShellText.join(mode === 'head' ? lines.slice(0, count) : lines.slice(Math.max(0, lines.length - count)));
    }

    static get(command) {
        const alias = { type: 'cat', less: 'cat', '读取': 'cat', dir: 'ls', '列表': 'ls' };
        const name = Object.hasOwn(alias, command) ? alias[command] : command;
        return Object.hasOwn(textCommands, name) ? textCommands[name] : null;
    }

    static async run(manager, tokens, input, { signal, agent, script } = {}) {
        const name = tokens[0].toLowerCase();
        const command = ShellText.get(name);
        if (!command) throw new Error('管道和重定向仅支持文本命令: ' + name);

        if (command.manualOnly && (agent || script)) throw new Error('此命令仅支持手动运行: ' + name);

        const read = (stdin, files, usage = command.usage) => {
            if (!files.length) {
                if (stdin !== null) return stdin;
                throw new Error('用法: ' + usage);
            }
            return files.map((file) => {
                if (file === '-' && stdin !== null) return stdin;
                const path = manager.storage.resolvePath(file, manager.storage.getCurrentPath());
                return manager.storage.readFile(path);
            }).join('');
        };
        const result = await command.run({ manager, args: tokens.slice(1), input, read, signal });
        return typeof result === 'string' ? { text: result, status: 0 } : result;
    }
}
