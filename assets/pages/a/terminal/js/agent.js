class ShellAgent {
    constructor(manager) {
        this.manager = manager;
        this.plan = null;
        this.maxSteps = 8;
        this.actions = {
            cd: 'cd <目录>',
            mkdir: 'mkdir [-p] <目录>',
            touch: 'touch <新文件> [初始内容]',
            write: 'write <新文件> <内容>',
            cp: 'cp <源> <新目标>',
            tree: 'tree [目录]',
            find: 'find <关键词> [目录]',
            stat: 'stat <路径>'
        };
    }

    async execute(message, signal) {
        switch (message.trim()) {
            case '':
                this.manager.output('agent <任务> 生成计划 · agent run 执行 · agent cancel 丢弃', 'info');
                return 0;
            case 'run':
                return this.run(signal);
            case 'cancel':
                this.plan = null;
                this.manager.ui.showPlan(null);
                this.manager.output('计划已丢弃', 'info');
                return 0;
            default:
                return this.request(message, signal);
        }
    }

    async request(task, signal) {
        const { storage, output, ui } = this.manager;
        const config = window.QuarkLLMConfig;
        const settings = config.getSettings();
        this.plan = null;
        ui.showPlan(null);

        if (!settings.apiKey) {
            output('请先在 AI 设置中保存模型连接，再运行 agent。', 'error');
            return 1;
        }

        const path = storage.getCurrentPath();
        const catalog = [...Object.values(textCommands).map(({ usage }) => usage), ...Object.values(this.actions)].join('\n');
        const system = `你是浏览器虚拟终端的命令计划助手。用用户的语言回答。
只返回一个 JSON 对象，格式为 {"summary":"简短说明","steps":[{"commands":[["echo","示例"]],"redirect":"/tmp/新文件.txt"}]}。
steps 最多 ${this.maxSteps} 项，可为空。commands 是管道，由 1 至 4 个参数数组组成。参数是字面字符串，不要加 shell 引号或变量。redirect 可省略，表示输出到新文件。只有文本命令能使用管道和重定向。
文件操作限于读取、创建新文件、创建目录和复制到新目标。当前目录见下一条消息。看不到文件内容或文件列表。遇到信息不足时，请在 summary 说明需要什么，或者生成查询命令供用户运行；模型不会自动收到输出。
可用命令：
${catalog}`;

        output('正在生成计划。只发送这次任务和当前目录。', 'info');
        try {
            const response = await config.requestChat(settings, {
                model: settings.model,
                messages: [
                    { role: 'system', content: system },
                    { role: 'user', content: JSON.stringify({ task, cwd: path }) }
                ],
                stream: false
            }, AbortSignal.any([signal, AbortSignal.timeout(90000)].filter(Boolean)));
            if (!response.ok) throw new Error(await config.parseErrorResponse(response, settings.apiKey));
            const data = await response.json();
            const content = data?.choices?.[0]?.message?.content;
            if (typeof content !== 'string' || content.length > 32_000) throw new Error('模型响应为空或过长');
            const plan = this.parse(content);
            if (signal?.aborted) return 130;
            if (!plan.steps.length) {
                output(plan.summary, 'info');
                return 0;
            }
            this.plan = { ...plan, path };
            ui.showPlan(this.plan);
            return 0;
        } catch (error) {
            if (signal?.aborted) return 130;
            output(`计划生成失败：${error.message}`, 'error');
            return 1;
        }
    }

    parse(content) {
        const source = content.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1');
        let plan;
        try {
            plan = JSON.parse(source);
        } catch {
            throw new Error('模型没有按约定返回 JSON，可重试或更换模型');
        }

        if (typeof plan?.summary !== 'string' || !plan.summary.trim() || plan.summary.length > 1000 ||
            !Array.isArray(plan.steps) || plan.steps.length > this.maxSteps) {
            throw new Error('模型返回的计划格式无效');
        }

        const steps = plan.steps.map((step) => {
            const stages = step?.commands;
            if (!Array.isArray(stages) || !stages.length || stages.length > 4 ||
                (step.redirect !== undefined && (typeof step.redirect !== 'string' || !step.redirect.trim() ||
                    step.redirect.length > 300 || /[\x00-\x1F\x7F]/.test(step.redirect)))) {
                throw new Error('模型返回的命令格式无效');
            }
            for (const args of stages) {
                if (!Array.isArray(args) || !args.length || args.length > 16 ||
                    !args.every((arg) => typeof arg === 'string' && arg.length <= 4096 && !arg.includes('\0'))) {
                    throw new Error('模型返回了无效的参数');
                }
                const name = args[0];
                if (Object.hasOwn(textCommands, name)) continue;
                if (!Object.hasOwn(this.actions, name) || stages.length > 1 || step.redirect !== undefined) {
                    throw new Error('计划包含不可执行的命令: ' + name);
                }
            }
            return { stages, redirect: step.redirect === undefined ? null : { target: step.redirect, append: false } };
        });
        return { summary: plan.summary.trim(), steps };
    }

    describe(job) {
        const command = job.stages.map(([name, ...args]) => [name, ...args.map(ShellSyntax.quote)].join(' ')).join(' | ');
        return command + (job.redirect ? ' > ' + ShellSyntax.quote(job.redirect.target) : '');
    }

    async run(signal) {
        const { storage, output, ui } = this.manager;
        const plan = this.plan;
        if (!plan) {
            output('当前没有待执行的计划', 'warning');
            return 1;
        }

        this.plan = null;
        ui.showPlan(null);
        if (storage.getCurrentPath() !== plan.path) {
            output('当前目录已变化。请在新目录重新生成计划。', 'warning');
            return 1;
        }

        const started = performance.now();
        let done = 0;
        for (const job of plan.steps) {
            if (signal?.aborted) return 130;
            output(`[AI ${done + 1}/${plan.steps.length}] ${this.describe(job)}`, 'command');
            const status = await this.manager.runJob(job, { agent: true, interactive: false, signal });
            if (status) {
                if (!signal?.aborted) output(`计划在第 ${done + 1} 步停止（退出码 ${status}）。已完成 ${done} 步。`, 'warning');
                return status;
            }
            done += 1;
        }
        output(`计划执行完成 · ${done} 步 · ${Math.round(performance.now() - started)} ms`, 'success');
        return 0;
    }
}
