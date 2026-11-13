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
        assert.equal(await page.locator('.oj-track').count(), 6);
        assert.match(await page.locator('#oj-total').innerText(), /151/);
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
        await page.setViewportSize({ width: 375, height: 850 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        if (process.env.OJ_SCREENSHOTS) await page.screenshot({ path: 'test-results/oj-mobile.png', fullPage: true });
        await page.getByRole('link', { name: '本题讨论 ↗' }).click();
        await page.getByText('暂无讨论帖。').waitFor();
        assert.equal(await page.locator('#discussionSearchInput').inputValue(), '1001');
        await page.getByText('暂无讨论帖。').waitFor();
        assert.deepEqual(errors, []);
        console.log('QuarkOJ browser smoke passed');
    } finally {
        await browser.close();
    }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
