const developerCommands = {
    jq: {
        usage: "jq '<查询路径>' [文件]  例如 jq '.items[0].name'",
        description: '查询 JSON，支持链式属性、数组索引和 .[] 展开',
        run: ({ args, input, read }) => {
            const [query, ...files] = args;
            if (!query?.startsWith('.')) throw new Error('需要以 . 开头的 JSON 路径');
            let values = [JSON.parse(read(input, files))];
            let path = query;
            while (path && path !== '.') {
                const part = /^(?:\.([\w$-]+)|\.?\[(\d*)\])/.exec(path);
                if (!part) throw new Error('仅支持 .key、[索引] 和 []');
                const [, key, index] = part;
                values = values.flatMap(value => {
                    if (index === '') return value && typeof value === 'object' ? Object.values(value) : [];
                    const field = key ?? index;
                    return [value != null && Object.hasOwn(value, field) ? value[field] : null];
                });
                path = path.slice(part[0].length);
            }
            return ShellText.join(values.map(value => JSON.stringify(value, null, 2)));
        }
    },
    tr: {
        usage: 'tr <原字符集> <新字符集>',
        description: '替换管道中的字符，支持 a-z 这样的 ASCII 范围',
        run: ({ input, args, read }) => {
            if (args.length !== 2 || !args[1]) throw new Error('需要两个非空字符集');
            const expand = set => [...set.replace(/([a-zA-Z0-9])-([a-zA-Z0-9])/g, (_, a, b) =>
                Array.from({ length: Math.max(0, b.charCodeAt(0) - a.charCodeAt(0) + 1) }, (_, i) => String.fromCharCode(a.charCodeAt(0) + i)).join(''))];
            const from = expand(args[0]);
            const to = expand(args[1]);
            if (!from.length || !to.length) throw new Error('字符集不能为空');
            const map = new Map(from.map((char, i) => [char, to[i] ?? to.at(-1)]));
            return [...read(input, [])].map(char => map.get(char) ?? char).join('');
        }
    },
    paste: {
        usage: 'paste [-d 分隔符] 文件 文件…',
        description: '逐行并排合并文件，可用 - 表示管道输入',
        run: ({ args, input, read }) => {
            const custom = args[0] === '-d';
            const files = custom ? args.slice(2) : args;
            if (files.length < 2 || files.length > 32) throw new Error('需要 2 至 32 个输入');
            const columns = files.map(file => ShellText.lines(read(input, [file])));
            return ShellText.join(Array.from({ length: Math.max(...columns.map(column => column.length)) },
                (_, i) => columns.map(column => column[i] ?? '').join(custom ? args[1] : '\t')));
        }
    },
    diff: {
        usage: 'diff <旧文件> <新文件>',
        description: '按行比较文件，可用 - 表示管道输入。不同返回状态 1',
        run: ({ args, input, read }) => {
            if (args.length !== 2) throw new Error('需要两个输入');
            const [left, right] = args.map(file => ShellText.lines(read(input, [file])));
            if ((left.length + 1) * (right.length + 1) > 1_000_000) throw new Error('文件行数过多');
            const matrix = Array.from({ length: left.length + 1 }, () => new Uint32Array(right.length + 1));
            for (let i = left.length - 1; i >= 0; i--) {
                for (let j = right.length - 1; j >= 0; j--) {
                    matrix[i][j] = left[i] === right[j] ? 1 + matrix[i + 1][j + 1] : Math.max(matrix[i + 1][j], matrix[i][j + 1]);
                }
            }
            const changes = [];
            let i = 0, j = 0;
            while (i < left.length || j < right.length) {
                if (i < left.length && j < right.length && left[i] === right[j]) {
                    i++;
                    j++;
                } else if (j === right.length || (i < left.length && matrix[i + 1][j] >= matrix[i][j + 1])) {
                    changes.push(`- ${i + 1}: ${left[i++]}`);
                } else {
                    changes.push(`+ ${j + 1}: ${right[j++]}`);
                }
            }
            return { text: ShellText.join(changes), status: changes.length ? 1 : 0 };
        }
    },
    seq: {
        usage: 'seq [起点 [步长]] 终点',
        description: '生成最多 10000 行整数序列',
        run: ({ args }) => {
            if (args.length < 1 || args.length > 3 || !args.every(value => /^[+-]?\d+$/.test(value))) throw new Error('需要 1 至 3 个整数');
            const values = args.map(Number);
            const [first, step, last] = values.length === 3 ? values : [values.length === 1 ? 1 : values[0], 1, values.at(-1)];
            if (!values.every(Number.isSafeInteger) || !step) throw new Error('整数或步长超出范围');
            const length = Math.max(0, Math.floor((last - first) / step) + 1);
            if (length > 10000) throw new Error('最多输出 10000 行');
            return ShellText.join(Array.from({ length }, (_, i) => first + step * i));
        }
    },
    tee: {
        manualOnly: true,
        usage: 'tee [-a] <文件>',
        description: '把管道输入写入文件，同时向后传递。-a 追加',
        run: ({ args, input, manager }) => {
            const append = args[0] === '-a';
            const file = ShellText.oneArg(append ? args.slice(1) : args, 'tee [-a] <文件>');
            if (input === null) throw new Error('tee 需要管道输入');
            const storage = manager.storage;
            storage.writeText(storage.resolvePath(file, storage.getCurrentPath()), input, append);
            return input;
        }
    },
    command: {
        usage: 'command -v <命令>…',
        description: '检查终端内置命令是否可用',
        run: ({ args, manager }) => {
            if (args.length < 2 || args[0] !== '-v') throw new Error('用法: command -v <命令>…');
            const names = args.slice(1);
            const found = names.filter(name => manager.builtinCommands.includes(name) || ShellText.get(name));
            return { text: ShellText.join(found), status: found.length === names.length ? 0 : 1 };
        }
    },
    urlencode: {
        usage: 'urlencode [-d] [文件]',
        description: '对 URI 组件做百分号编码或解码',
        run: ({ args, input, read }) => {
            const { flags, values } = ShellText.options(args, 'd');
            const text = read(input, values).replace(/\n$/, '');
            return (flags.has('d') ? decodeURIComponent(text) : encodeURIComponent(text)) + '\n';
        }
    }
};

const relayHosts = new Set(['api.github.com', 'raw.githubusercontent.com', 'registry.npmjs.org', 'www.iana.org', 'example.com', 'example.org']);

function publicHttps(value) {
    const url = new URL(value.includes('://') ? value : 'https://' + value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
        !/^(?:[\da-z](?:[\da-z-]*[\da-z])?\.)+[a-z][\da-z-]*$/i.test(url.hostname) ||
        /\.(?:localhost|local|internal|lan|home|test|invalid)$/i.test(url.hostname)) throw new Error('需要公网 HTTPS 域名');
    return url;
}

async function responseText(response) {
    if (!response.body) return '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0, text = '';
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) return text + decoder.decode();
            bytes += value.length;
            if (bytes > 512 * 1024) throw new Error('响应超过 512 KiB');
            text += decoder.decode(value, { stream: true });
        }
    } finally {
        await reader.cancel();
    }
}

async function requestUrl(url, method, signal) {
    const timeout = AbortSignal.any([signal, AbortSignal.timeout(8000)].filter(Boolean));
    if (relayHosts.has(url.hostname)) {
        const api = document.querySelector('[data-terminal-api]').dataset.terminalApi;
        const response = await fetch(api.replace(/\/$/, '') + '/api/terminal-http?' + new URLSearchParams({ url: url.href, method }), { signal: timeout });
        const data = JSON.parse(await responseText(response));
        if (!response.ok) throw new Error(data.error || '转发服务不可用');
        return data;
    }
    let response;
    try {
        response = await fetch(url, { method, signal: timeout, credentials: 'omit', redirect: 'error' });
    } catch (error) {
        if (timeout.aborted) throw timeout.reason;
        throw new Error('请求失败：请检查 HTTPS、CORS 和重定向');
    }
    return { status: response.status, headers: [...response.headers], body: await responseText(response) };
}

Object.assign(developerCommands, {
    curl: {
        manualOnly: true,
        usage: 'curl [-Iif] <HTTPS URL>',
        description: 'GET 文本，-I 请求响应头，-i 同时输出响应头，-f 在 HTTP 错误时返回失败。支持 CORS 直连及 GitHub、npm、IANA、example.com/.org 的 Vercel 转发',
        run: async ({ args, signal }) => {
            const { flags, values } = ShellText.options(args, 'Iif');
            const url = publicHttps(ShellText.oneArg(values, 'curl [-Iif] <HTTPS URL>'));
            const { status, headers, body } = await requestUrl(url, flags.has('I') ? 'HEAD' : 'GET', signal);
            if (flags.has('f') && status >= 400) throw new Error('HTTP ' + status);
            const includeHeaders = flags.has('I') || flags.has('i');
            const header = includeHeaders ? ShellText.join(['HTTP ' + status, ...headers.map(([key, value]) => key + ': ' + value), '']) : '';
            return header + body;
        }
    },
    ping: {
        manualOnly: true,
        usage: 'ping <域名或 HTTPS URL>',
        description: '发起一次 HTTPS HEAD 探测，显示端到端耗时与状态码，属于 HTTP 探测',
        run: async ({ args, signal }) => {
            const url = publicHttps(ShellText.oneArg(args, 'ping <域名或 HTTPS URL>'));
            const start = performance.now();
            const { status } = await requestUrl(url, 'HEAD', signal);
            return `HTTPS ${url.hostname}: status=${status} time=${Math.round(performance.now() - start)} ms\n`;
        }
    },
    dig: {
        manualOnly: true,
        usage: 'dig <域名> [A|AAAA|CNAME|MX|TXT|NS|SOA]',
        description: '通过公共 DNS over HTTPS 查询记录',
        run: async ({ args, signal }) => {
            const [name, type = 'A'] = args;
            const record = type.toUpperCase();
            if (args.length > 2 || !/^(?:[\w-]+\.)+[a-z][\da-z-]*\.?$/i.test(name ?? '') ||
                !['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SOA'].includes(record)) throw new Error('域名或记录类型无效');
            const timeout = AbortSignal.any([signal, AbortSignal.timeout(8000)].filter(Boolean));
            const response = await fetch('https://dns.google/resolve?' + new URLSearchParams({ name, type: record }), { signal: timeout });
            if (!response.ok) throw new Error('DNS 服务返回 HTTP ' + response.status);
            const data = JSON.parse(await responseText(response));
            return {
                text: ShellText.join([`;; DNS status ${data.Status}`, ...(data.Answer ?? []).map(item => `${item.name}\t${item.TTL}\t${item.type}\t${item.data}`)]),
                status: data.Status === 0 ? 0 : 1
            };
        }
    }
});
Object.assign(textCommands, developerCommands);
