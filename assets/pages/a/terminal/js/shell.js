class ShellSyntax {
    static parse(input) {
        const tokens = [];
        let value = '';
        let parts = [];
        let started = false;
        let quote = '';
        const finishWord = () => {
            if (started) tokens.push({ word: [...parts, value] });
            parts = [];
            started = false;
            value = '';
        };

        for (let i = 0; i < input.length; i += 1) {
            const char = input[i];
            if (char === '\\' && quote !== "'") {
                i += 1;
                if (i === input.length) throw new Error('转义符后缺少字符');
                value += input[i];
                started = true;
            } else if (quote && char === quote) {
                quote = '';
            } else if (!quote && (char === '"' || char === "'")) {
                started = true;
                quote = char;
            } else if (char === '$' && quote !== "'") {
                const match = /^\$\{([A-Za-z_]\w*)\}|^\$([A-Za-z_]\w*)/.exec(input.slice(i));
                if (match) {
                    const key = match[1] || match[2];
                    parts.push(value, { key });
                    value = '';
                    i += match[0].length - 1;
                } else {
                    value += '$';
                }
                started = true;
            } else if (!quote && char === '#' && !started) {
                const newline = input.indexOf('\n', i);
                i = newline < 0 ? input.length : newline - 1;
            } else if (!quote && char === '\n') {
                finishWord();
                if (!tokens.at(-1)?.op && tokens.length) tokens.push({ op: ';' });
            } else if (!quote && /\s/.test(char)) {
                finishWord();
            } else if (!quote && '|>&;<'.includes(char)) {
                finishWord();
                const pair = char + input[i + 1];
                const op = ['&&', '||', '>>'].includes(pair) ? pair : char;
                if (op.length === 2) i += 1;
                if (op === '&' || op === '<') throw new Error('当前 shell 不支持 ' + op);
                tokens.push({ op });
            } else {
                value += char;
                started = true;
            }
        }

        if (quote) throw new Error('引号未闭合');
        finishWord();
        if (!tokens.length) return [];

        const jobs = [];
        let job = { stages: [], condition: null, redirect: null };
        let stage = [];
        const finishStage = () => {
            if (!stage.length) throw new Error('运算符前后需要命令');
            job.stages.push(stage);
            stage = [];
        };
        for (let i = 0; i < tokens.length; i += 1) {
            const token = tokens[i];
            if (!token.op) {
                if (job.redirect) throw new Error('重定向必须放在管道末尾');
                stage.push(token.word);
            } else if (token.op === '>' || token.op === '>>') {
                const target = tokens[++i]?.word;
                if (!stage.length || job.redirect || !target) throw new Error('重定向需要文件路径');
                job.redirect = { target, append: token.op === '>>' };
            } else if (token.op === '|') {
                if (job.redirect) throw new Error('重定向必须放在管道末尾');
                finishStage();
            } else {
                finishStage();
                jobs.push(job);
                job = { stages: [], condition: token.op, redirect: null };
            }
        }
        if (!stage.length && job.condition === ';' && !job.stages.length) return jobs;
        finishStage();
        jobs.push(job);
        return jobs;
    }

    static expand(job, env) {
        const expandWord = (word) => word.map((part) => typeof part === 'string' ? part :
            (Object.hasOwn(env, part.key) ? String(env[part.key]) : '')).join('');
        const stages = job.stages.map((stage) => stage.map(expandWord));
        if (stages.some(([name]) => !name)) throw new Error('命令名为空');
        const redirect = job.redirect ? { ...job.redirect, target: expandWord(job.redirect.target) } : null;
        if (redirect && !redirect.target.trim()) throw new Error('重定向需要文件路径');
        return { stages, redirect };
    }

    static calculate(expression) {
        if (expression.length > 256) throw new Error('表达式过长');
        const compact = expression.replace(/\s+/g, '');
        const tokens = compact.match(/(?:\d+\.?\d*|\.\d+)|[()+\-*/%]/g) || [];
        if (!compact || tokens.join('') !== compact) throw new Error('无效的数学表达式');
        let cursor = 0;
        const primary = () => {
            const token = tokens[cursor++];
            if (token === '+' || token === '-') return primary() * (token === '-' ? -1 : 1);
            if (token === '(') {
                const result = sum();
                if (tokens[cursor++] !== ')') throw new Error('括号未闭合');
                return result;
            }
            if (token === undefined || !/^\.?\d/.test(token)) throw new Error('缺少数值');
            return Number(token);
        };
        const product = () => {
            let result = primary();
            while (['*', '/', '%'].includes(tokens[cursor])) {
                const op = tokens[cursor++];
                const value = primary();
                if (op === '*') result *= value;
                if (op === '/') result /= value;
                if (op === '%') result %= value;
            }
            return result;
        };
        const sum = () => {
            let result = product();
            while (['+', '-'].includes(tokens[cursor])) {
                const sign = tokens[cursor++] === '+' ? 1 : -1;
                result += sign * product();
            }
            return result;
        };
        const result = sum();
        if (cursor !== tokens.length || !Number.isFinite(result)) throw new Error('无效的数学表达式或结果');
        return result;
    }

    static quote(text) {
        return "'" + String(text).replaceAll("'", "'\\''") + "'";
    }
}
