const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');

let playwright;
try {
    playwright = require('playwright');
} catch {
    const globalRoot = execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['root', '-g'], {
        encoding: 'utf8', shell: process.platform === 'win32'
    }).trim();
    playwright = createRequire(path.join(globalRoot, 'package.json'))('playwright');
}

const base = process.env.BASE_URL || 'http://127.0.0.1:4321';

async function checkTerminal(browser) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 850 }, colorScheme: 'dark' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
        if (sessionStorage.getItem('seeded')) return;
        sessionStorage.setItem('seeded', 'true');
        localStorage.setItem('unrelated-site-data', 'retained');
        localStorage.setItem('selfDestructTriggered', 'true');
        localStorage.setItem('quark_llm_api_key', 'test-terminal-key');
        localStorage.setItem('quark_llm_base_url', 'https://model.example/v1');
    });

    let aiCalls = 0;
    let requestBody;
    let requestHeaders;
    await page.route('https://model.example/v1/chat/completions', async (route) => {
        requestBody = route.request().postDataJSON();
        requestHeaders = route.request().headers();
        const message = requestBody.messages.at(-1).content;
        aiCalls += 1;
        if (message === '继续聊天') {
            return route.fulfill({ json: { choices: [{ message: { content: '**聊天答复**' } }] } });
        }

        const { task } = JSON.parse(message);
        if (task === '中断请求') {
            await new Promise((resolve) => setTimeout(resolve, 900));
            return route.fulfill({ json: { choices: [] } }).catch(() => {});
        }
        let steps = [
            { commands: [['mkdir', '-p', '/tmp/AI 结果']] },
            { commands: [['cat', 'readme.md'], ['grep', '-i', 'llm']], redirect: '/tmp/AI 结果/报告.txt' }
        ];
        if (task === '禁止执行') steps = [{ commands: [['open', 'https://example.test']] }];
        if (task === '禁止覆盖') steps = [{ commands: [['write', 'readme.md', '不能覆盖']] }];
        return route.fulfill({
            json: { choices: [{ message: { content: JSON.stringify({ summary: '本地文件计划', steps }) } }] }
        });
    });

    await page.goto(base + '/a/terminal/');
    const input = page.locator('#command-input');
    const log = page.locator('#output');
    const exit = page.locator('#exit-status');
    const run = async (command, expected = 0) => {
        await input.fill(command);
        await input.press('Enter');
        await page.waitForFunction(() => !document.getElementById('run-command').disabled);
        assert.match(await exit.innerText(), new RegExp('退出码 ' + expected + ' ·'));
    };

    await page.locator('#prompt').waitFor();
    assert.equal(await page.locator('#prompt').innerText(), 'quark:/home $');
    assert.equal(await page.evaluate(() => localStorage.getItem('selfDestructTriggered')), null);
    await run('rm -rf /', 1);
    assert.equal(await page.evaluate(() => localStorage.getItem('unrelated-site-data')), 'retained');

    await run('mkdir -p work/sub && cd work/sub && echo "$PWD" > path.txt');
    assert.equal(await page.locator('#file-path').innerText(), '/home/work/sub');
    await run("echo 'one|two' > 'with space.txt' && echo three >> 'with space.txt'");
    await run("cat 'with space.txt' | sort -r | head -n 1");
    assert.match(await log.locator('.output-line').last().innerText(), /three/);
    await run("grep missing path.txt && echo unexpected || cat path.txt");
    assert.equal(await log.locator('.output-line').last().innerText(), '/home/work/sub');
    await run('export DEMO=ready && echo "${DEMO}"');
    assert.equal(await log.locator('.output-line').last().innerText(), 'ready');
    await run("echo '$DEMO' | nl");
    assert.equal(await log.locator('.output-line').last().innerText(), '1\t$DEMO');
    await run('calc (2+3)*4');
    assert.match(await log.locator('.output-line').last().innerText(), / = 20$/);
    await run("test -f path.txt && printf '%s\\n%d' ready 7");
    assert.equal(await log.locator('.output-line').last().innerText(), 'ready\n7');
    await run('test -d path.txt', 1);
    await run("printf '# 测试脚本\\nmkdir -p /tmp/script\\necho ready > /tmp/script/status\\ncat /tmp/script/status\\n' > /tmp/example.qsh");
    await run('source /tmp/example.qsh');
    assert.equal(await log.locator('.output-line').last().innerText(), 'ready');
    await run('cp /home/work /home/work/sub', 1);
    await run('mv /home/work /tmp/renamed', 1);
    await run('cd ~ && mv work /tmp/renamed');
    assert.equal(await page.evaluate(() => !!JSON.parse(localStorage.getItem('fileSystem'))['/tmp/renamed/sub/path.txt']), true);

    await input.fill('cat rea');
    await input.press('Tab');
    assert.equal(await input.inputValue(), 'cat readme.md');
    await input.fill('draft');
    await input.press('ArrowUp');
    assert.match(await input.inputValue(), /^cd ~ && mv/);
    await input.press('ArrowDown');
    assert.equal(await input.inputValue(), 'draft');
    await input.press('Control+r');
    await page.locator('#history-filter').fill('source /tmp');
    await page.locator('#history-filter').press('Enter');
    assert.equal(await input.inputValue(), 'source /tmp/example.qsh');
    await run('edit new.txt');
    await page.locator('#multiline-modal[open]').waitFor();
    await page.locator('#multiline-textarea').fill('一行\n两行');
    await page.locator('#multiline-textarea').press('Control+Enter');
    await page.locator('#multiline-modal[open]').waitFor({ state: 'hidden' });

    await page.locator('#file-picker').setInputFiles({
        name: 'imported.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from('city,value\n武汉,2\n上海,1\n')
    });
    await page.getByRole('button', { name: '下载 imported.csv' }).waitFor();
    await run("cat imported.csv | tail -n 2 | cut -d ',' -f 2 | sort -n");
    assert.equal(await log.locator('.output-line').last().innerText(), '1\n2');
    const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: '下载 imported.csv' }).click()
    ]);
    assert.equal(download.suggestedFilename(), 'imported.csv');
    assert.match(await fs.readFile(await download.path(), 'utf8'), /上海,1/);

    await run("echo '<img src=x>'");
    assert.equal(await log.locator('img').count(), 0);
    await run('llm-key test-key-hidden');
    assert.doesNotMatch(await log.innerText(), /test-key-hidden/);
    assert.doesNotMatch(await page.evaluate(() => localStorage.getItem('commandHistory')), /test-key-hidden/);

    await page.locator('#agent-task').fill('整理 readme');
    await page.getByRole('button', { name: '生成计划' }).click();
    await page.locator('#agent-plan').waitFor();
    assert.match(await page.locator('#agent-steps').innerText(), /grep/);
    assert.equal(aiCalls, 1);
    assert.equal(requestHeaders.authorization, 'Bearer test-key-hidden');
    assert.equal(requestBody.messages.length, 2);
    assert.deepEqual(JSON.parse(requestBody.messages.at(-1).content), { task: '整理 readme', cwd: '/home' });
    assert.equal(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('fileSystem'))).some((key) => key.includes('AI 结果'))), false);
    await page.getByRole('button', { name: '执行计划' }).click();
    await page.waitForFunction(() => document.querySelector('#output').innerText.includes('计划执行完成'));
    const result = await page.evaluate(() => JSON.parse(localStorage.getItem('fileSystem'))['/tmp/AI 结果/报告.txt'].content);
    assert.match(result, /LLM/i);
    assert.equal(aiCalls, 1);

    await run('agent 禁止执行', 1);
    assert.equal(await page.locator('#agent-plan').isVisible(), false);
    await run('agent 禁止覆盖');
    await run('agent run', 1);
    assert.doesNotMatch(await page.evaluate(() => JSON.parse(localStorage.getItem('fileSystem'))['/home/readme.md'].content), /不能覆盖/);
    await run('agent 整理 readme');
    await run('cd /tmp');
    await run('agent run', 1);
    assert.match(await log.locator('.output-line').last().innerText(), /当前目录已变化/);

    await input.fill('agent 中断请求');
    await input.press('Enter');
    await page.locator('#interrupt-command').waitFor();
    await page.locator('#interrupt-command').click();
    await page.waitForFunction(() => document.getElementById('exit-status').textContent.includes('130'));
    await run('llm');
    await run('继续聊天');
    assert.equal(await log.locator('strong').last().innerText(), '聊天答复');
    await run('!pwd');
    assert.equal(await log.locator('.output-line').last().innerText(), '/tmp');
    await run('llm-off');
    await input.press('Control+l');
    assert.equal(await log.innerText(), '');

    await page.locator('#terminal-theme').selectOption('light');
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme), 'light');
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).colorScheme), 'light');
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('terminal')).backgroundColor), 'rgb(251, 253, 255)');
    await page.reload();
    assert.equal(await page.locator('#terminal-theme').inputValue(), 'light');
    await page.locator('#terminal-theme').selectOption('site');
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme), 'dark');
    assert.deepEqual(errors, []);
    await context.close();
}

async function checkMobile(browser) {
    const page = await browser.newPage({ viewport: { width: 320, height: 620 }, isMobile: true, hasTouch: true, colorScheme: 'light' });
    await page.goto(base + '/a/terminal/');
    const toggle = page.locator('#workbench-toggle');
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    await page.locator('#command-input').fill('pwd');
    await page.locator('#run-command').click();
    await page.waitForFunction(() => document.getElementById('exit-status').textContent.includes('退出码 0'));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme), 'light');
    await page.close();
}

(async () => {
    const browser = await playwright.chromium.launch();
    try {
        await checkTerminal(browser);
        await checkMobile(browser);
        console.log('Terminal UI checks passed');
    } finally {
        await browser.close();
    }
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
