const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');

let playwright;
try {
    playwright = require('playwright');
} catch {
    const root = execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['root', '-g'], {
        encoding: 'utf8', shell: process.platform === 'win32',
    }).trim();
    playwright = createRequire(path.join(root, 'package.json'))('playwright');
}

const base = process.env.BASE_URL || 'http://127.0.0.1:4321';

async function accountSmoke(browser) {
    const page = await browser.newPage();
    const subject = 'a'.repeat(64);
    const token = Buffer.from(JSON.stringify({ sub: subject })).toString('base64url') + '.' + 'f'.repeat(64);
    const accepted = { id: 'from-other-device', problemId: 6101, languageId: '91', code: 'class Main { /* previously accepted */ }',
        status: 'AC', timestamp: 1700000000000, totalCases: 1, cases: [{ status: 'AC' }] };
    const posts = [];
    let solution = null;
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type,authorization',
        'access-control-allow-methods': 'GET,POST,OPTIONS' };
    await page.addInitScript(value => {
        if (!sessionStorage.getItem('oj-signed')) {
            localStorage.setItem('quark_quota_session', JSON.stringify({ token: value, expiresAt: Date.now() + 360000 }));
            sessionStorage.setItem('oj-signed', '1');
        }
    }, token);
    await page.route(/^https:\/\/(cdnjs|cdn\.jsdelivr|unpkg)\./, route => route.abort());
    await page.route('**/api/db?view=quark-oj&**', async route => {
        const url = new URL(route.request().url());
        const op = url.searchParams.get('op');
        const auth = route.request().headers().authorization;
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
        const json = {};
        if (op === 'history') {
            assert.equal(auth, 'Bearer ' + token);
            Object.assign(json, url.searchParams.has('before') ? { entries: [accepted], nextCursor: null } :
                { entries: [], nextCursor: '1700000001000_cursor' });
        }
        if (op === 'publish') {
            assert.equal(auth, 'Bearer ' + token);
            const post = route.request().postDataJSON();
            posts.push(post);
            solution = { ...post, author: '0123456789abcdef01234567', code: accepted.code, languageId: '91', updatedAt: 1700000000000 };
            json.own = solution;
        }
        if (op === 'solutions') Object.assign(json, { solutions: solution ? [solution] : [], own: auth ? solution : null });
        await route.fulfill({ headers: cors, json });
    });
    try {
        await page.goto(base + '/a/oj/train?p=6101&from=from-other-device', { waitUntil: 'domcontentloaded' });
        await page.getByText('已载入记录，编辑后保存').waitFor();
        assert.equal(await page.locator('#oj-code').inputValue(), accepted.code);
        const solutions = page.locator('#oj-solutions');
        await solutions.getByLabel('题解标题').fill('循环逐行构造');
        await solutions.getByLabel('正文').fill('第 i 行添加 i 个字符。');
        await solutions.getByRole('button', { name: '发布题解' }).click();
        await solutions.getByText('题解已发布。').waitFor();
        assert.equal(posts.length, 1);
        assert.equal(posts[0].submission, '1700000000000_from-other-device');
        assert.equal(Object.hasOwn(posts[0], 'code'), false);
        await page.evaluate(() => {
            localStorage.removeItem('quark_quota_session');
            dispatchEvent(new StorageEvent('storage', { key: 'quark_quota_session' }));
        });
        await solutions.getByRole('link', { name: '登录 ↗' }).waitFor();
        assert.notEqual(await page.locator('#oj-code').inputValue(), accepted.code);
        assert.equal(await solutions.getByRole('button', { name: /发布题解|更新题解/ }).isVisible(), false);
        await solutions.getByText('循环逐行构造', { exact: true }).click();
        await solutions.locator('.oj-solutions-list').getByText(accepted.code, { exact: true }).waitFor();
    } finally {
        await page.close();
    }
}

async function main() {
    const browser = await playwright.chromium.launch();
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route(/^https:\/\/(cdnjs|cdn\.jsdelivr|unpkg)\./, route => route.abort());
        let mode = 'AC';
        let submissions = 0;
        await page.route('https://ce.judge0.com/submissions**', async route => {
            if (route.request().method() === 'POST') {
                if (mode === 'HTTP') return route.fulfill({ status: 503, json: {} });
                const body = route.request().postDataJSON();
                assert.equal(body.enable_network, false);
                assert.equal(body.cpu_time_limit, 3);
                assert.equal(body.memory_limit, 65536);
                assert.equal(Buffer.from(body.source_code, 'base64').toString(), 'print(30) # 测试');
                const output = Buffer.from(body.stdin, 'base64').toString().split(/\s+/).map(Number).reduce((a, b) => a + b, 0);
                submissions++;
                return route.fulfill({ json: { token: String(mode === 'AC' ? output : 0) } });
            }
            const output = new URL(route.request().url()).pathname.split('/').at(-1);
            return route.fulfill({ json: { status_id: 3, stdout: Buffer.from(output + '\n').toString('base64'), time: '0.01', memory: 1000 } });
        });
        await page.route('**/api/db?**', route => route.fulfill({ json: { data: {} } }));
        const chatRequests = [];
        await page.route('**/api/quarkbot-free', async route => {
            chatRequests.push(route.request().postDataJSON());
            await route.fulfill({ headers: { 'access-control-allow-origin': '*' },
                json: { choices: [{ message: { content: '可以这样测试：\n\n```python\nprint(42)\n```' }, finish_reason: 'stop' }] } });
        });
        await page.addInitScript(() => {
            if (!localStorage.getItem('oj_test_seed')) {
                localStorage.setItem('quark_oj_submissions', JSON.stringify({
                    1001: { status: 'WA', time: '0.05', memory: 1200, code: 'print(0)', languageId: '71', timestamp: 1 },
                }));
                localStorage.setItem('oj_test_seed', '1');
            }
        });

        await page.goto(base + '/a/oj/', { waitUntil: 'domcontentloaded' });
        await page.locator('.oj-track').last().waitFor();
        assert.equal(await page.locator('.oj-track').count(), 10);
        const total = Number((await page.locator('#oj-total').innerText()).match(/\d+/)[0]);
        assert.ok(total >= 220);
        await page.getByRole('link', { name: 'CS61B 课程题单', exact: true }).click();
        await page.locator('.oj-stage').first().waitFor();
        assert.ok(await page.locator('.oj-stage').count() >= 7);
        assert.match(await page.locator('.oj-stage-sources a').first().getAttribute('href'), /^https:\/\/sp25\.datastructur\.es\//);
        await page.locator('#oj-cs-next').click();
        await page.locator('#oj-statement').waitFor();
        assert.equal(await page.locator('#oj-language').inputValue(), '91');
        await page.goto(base + '/a/oj/', { waitUntil: 'domcontentloaded' });
        if (process.env.OJ_SCREENSHOTS) await page.screenshot({ path: 'test-results/oj-home.png', fullPage: true });
        await page.getByRole('link', { name: /程序设计基础/ }).click();
        await page.locator('#oj-problems tr').first().waitFor();
        await page.locator('#oj-search').fill('P1001');
        await page.getByRole('button', { name: '收藏 A + B 求和问题', exact: true }).click();
        await page.locator('#oj-state').selectOption('saved');
        assert.equal(await page.locator('#oj-problems tr').count(), 1);
        await page.getByRole('link', { name: /P1001/ }).click();
        await page.getByRole('heading', { name: 'A + B 求和问题' }).waitFor();
        assert.equal(await page.locator('#oj-code').inputValue(), 'print(0)');
        await page.locator('#oj-language').selectOption('109');
        await page.locator('#oj-code').fill('print(30) # 测试');
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.locator('#oj-language').selectOption('109');
        assert.equal(await page.locator('#oj-code').inputValue(), 'print(30) # 测试');
        await page.locator('#oj-use-sample').click();
        await page.locator('#oj-stdin').press('Control+Enter');
        await page.locator('#oj-run-results').getByText('通过').waitFor();
        await page.locator('#oj-submit').click();
        await page.getByText('通过 · 3 / 3 个用例通过').waitFor();
        mode = 'WA';
        await page.locator('#oj-submit').click();
        await page.getByText('答案错误 · 0 / 3 个用例通过').waitFor();
        assert.equal(await page.locator('.oj-case').count(), 3);
        assert.equal(await page.locator('#oj-meta .oj-badge').innerText(), '通过');
        mode = 'HTTP';
        await page.locator('#oj-run').click();
        await page.getByText(/HTTP 503/).waitFor();
        assert.equal(await page.locator('#oj-run').isEnabled(), true);
        assert.equal(submissions, 7);
        if (process.env.OJ_SCREENSHOTS) await page.screenshot({ path: 'test-results/oj-workbench.png', fullPage: true });
        await page.getByRole('link', { name: '本题提交 ↗' }).click();
        await page.getByText('3 条提交').waitFor();
        await page.locator('#oj-records button').first().click();
        await page.getByText('print(30) # 测试').waitFor();
        await page.getByRole('link', { name: '在练习台打开源码 ↗' }).click();
        await page.getByText('已载入记录，编辑后保存').waitFor();
        assert.equal(await page.locator('#oj-code').inputValue(), 'print(30) # 测试');
        await page.locator('#oj-quarkbot').click();
        const bot = page.getByRole('dialog', { name: 'QuarkBot' });
        await bot.getByRole('button', { name: '按当前语言给出可自测的完整代码' }).click();
        await bot.getByRole('button', { name: '发送', exact: true }).click();
        await bot.getByRole('button', { name: '填入练习编辑器' }).waitFor();
        assert.equal(chatRequests.length, 1);
        assert.match(chatRequests[0].messages[0].content, /A \+ B/);
        assert.doesNotMatch(JSON.stringify(chatRequests[0]), /print\(30\)/);
        assert.equal(await page.locator('#oj-code').inputValue(), 'print(30) # 测试');
        page.once('dialog', dialog => dialog.dismiss());
        await bot.getByRole('button', { name: '填入练习编辑器' }).click();
        assert.equal(await page.locator('#oj-code').inputValue(), 'print(30) # 测试');
        await bot.getByText(/本次发送编辑器代码/).click();
        await bot.getByRole('button', { name: '帮我检查代码可能出错的地方' }).click();
        await bot.getByRole('button', { name: '发送', exact: true }).click();
        await bot.getByRole('button', { name: '填入练习编辑器' }).nth(1).waitFor();
        assert.match(chatRequests[1].messages.at(-1).content, /print\(30\)/);
        assert.equal(await bot.getByRole('checkbox', { name: /本次发送编辑器代码/ }).isChecked(), false);
        page.once('dialog', dialog => dialog.accept());
        await bot.getByRole('button', { name: '填入练习编辑器' }).last().click();
        assert.match(await page.locator('#oj-code').inputValue(), /print\(42\)/);
        assert.equal(submissions, 7);
        await page.setViewportSize({ width: 375, height: 850 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        if (process.env.OJ_SCREENSHOTS) await page.screenshot({ path: 'test-results/oj-mobile.png', fullPage: true });
        await page.getByRole('link', { name: '本题讨论 ↗' }).click();
        await page.getByText('暂无讨论帖。').waitFor();
        assert.equal(await page.locator('#discussionSearchInput').inputValue(), '1001');
        await page.getByText('暂无讨论帖。').waitFor();
        assert.deepEqual(errors, []);
        await accountSmoke(browser);
        console.log('QuarkOJ browser smoke passed');
    } finally {
        await browser.close();
    }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
