const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let playwright;
try { playwright = require('playwright'); } catch {
  const { execFileSync } = require('node:child_process');
  const root = execFileSync('npm.cmd', ['root', '-g'], { encoding: 'utf8', shell: true }).trim();
  playwright = require(path.join(root, 'playwright'));
}
const base = process.env.BASE_URL || 'http://127.0.0.1:4321';
const out = path.resolve('test-results/decision-pocket');
fs.mkdirSync(out, { recursive: true });
let passed = 0;
const check = (label, value) => { assert(value, label); passed++; };
const pocketKey = 'quark.pocket.v1', decisionKey = 'quark.decision.v1';
const settle = () => new Promise(resolve => setTimeout(resolve, 100));
async function context(browser, options = {}) {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', ...options });
  await ctx.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
  return ctx;
}
async function chooseBlank(page) {
  await page.locator('[data-preset="2"]').click();
  await page.locator('.decision-confirm button[value="replace"]').click();
  await page.waitForFunction(() => document.querySelector('#decision-title').value === '我正在考虑的一个选择');
}
(async () => {
  const browser = await playwright.chromium.launch();
  try {
    const ctx = await context(browser, { viewport: { width: 1440, height: 950 } });
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/tool/');
    await page.locator('[data-pocket-pin="/tool/decision"]').click();
    check('pin adds link without navigating', page.url().endsWith('/tool/') && await page.locator('[data-pocket-items] a[href="/tool/decision"]').count() === 1);
    check('pin button exposes state', await page.locator('[data-pocket-pin="/tool/decision"]').getAttribute('aria-pressed') === 'true');
    const peer = await ctx.newPage(); await peer.goto(base + '/games/');
    check('pins available across catalogues', await peer.locator('[data-pocket-items] a[href="/tool/decision"]').isVisible());
    await peer.locator('[data-pocket-pin="/games/spy-signal"]').click();
    await page.waitForFunction(() => document.querySelector('[data-pocket-count]').textContent === '2/8');
    check('cross-tab pin sync', await page.locator('[data-pocket-items] a').count() === 2);
    await page.goto(base + '/');
    check('home exposes personal shortcuts', await page.locator('.pocket-compact a[href="/tool/decision"]').isVisible());
    await page.goto(base + '/tool/');
    await page.locator('[data-catalog-search]').fill('计算');
    check('live category count', await page.locator('[data-category="category-1"] span').innerText() === '1');
    await page.locator('[data-catalog-clear]').click();
    check('clear returns focus', await page.locator('[data-catalog-search]').evaluate(el => el === document.activeElement));
    await page.locator('button[data-catalog-view="list"]').click();
    await page.reload();
    check('layout persists', await page.locator('.catalog-page').getAttribute('data-catalog-view') === 'list');
    await page.locator('[data-catalog-card][href="/tool/decision"]').click();
    await page.waitForURL('**/tool/decision');
    await page.goto(base + '/tool/');
    await page.locator('[data-pocket-tab="recent"]').click();
    check('recent reflects an actual catalogue open', await page.locator('[data-pocket-items] a[href="/tool/decision"]').isVisible());
    await page.locator('[data-pocket-clear]').click();
    check('clear history leaves pins intact', await page.locator('[data-pocket-count]').innerText() === '2/8' && await page.locator('[data-pocket-items] a').count() === 0);
    await page.locator('[data-pocket-tab="pins"]').click();
    await page.locator('[data-pocket-remove="/games/spy-signal"]').click();
    check('remove restores keyboard focus', await page.locator('[data-pocket-remove="/tool/decision"]').evaluate(el => el === document.activeElement));
    await peer.close();

    await page.goto(base + '/tool/decision/');
    check('example evaluates', (await page.locator('[data-verdict] h3').innerText()).includes('在家充电'));
    await page.locator('[data-preset="2"]').click(); await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.activeElement?.dataset.preset === '2');
    check('dialog escape preserves draft and focus', (await page.locator('#decision-title').inputValue()).includes('留半天') && await page.locator('[data-preset="2"]').evaluate(el => el === document.activeElement));
    await chooseBlank(page);
    check('blank scores do not rank', (await page.locator('[data-verdict]').innerText()).includes('4 项未评分'));
    const scores = page.locator('[data-score-option]');
    for (let i = 0; i < 4; i++) await scores.nth(i).fill(String([10, 0, 0, 10][i]));
    check('equal weighting creates honest tie', (await page.locator('[data-verdict]').innerText()).includes('并列领先'));
    await page.locator('#scenario-share').fill('90');
    check('scenario changes leader', (await page.locator('[data-scenario-verdict]').innerText()).includes('方案 A领先'));
    check('scenario leaves actual weights intact', await page.locator('[data-weight]').first().inputValue() === '5');
    await scores.first().fill(''); check('clearing means missing', (await page.locator('[data-verdict]').innerText()).includes('1 项未评分'));
    await scores.first().fill('10');
    for (const input of await page.locator('[data-weight]').all()) await input.fill('0');
    check('all zero does not rank', (await page.locator('[data-verdict]').innerText()).includes('给因素一点分量'));
    await page.locator('[data-weight]').first().fill('5');
    await scores.first().fill('11'); check('invalid score hides ranking', await page.locator('[data-ranking] .decision-rank').count() === 0);
    await scores.first().fill('10');
    await page.locator('#decision-title').fill('我的下一步'); await page.locator('#decision-title').press('Tab');
    await page.reload(); check('draft survives reload', await page.locator('#decision-title').inputValue() === '我的下一步');
    await page.locator('[data-add-option]').click(); check('new option waits for scores', (await page.locator('[data-verdict]').innerText()).includes('2 项未评分'));
    await page.locator('[data-undo]').click(); check('undo restores structure', await page.locator('[data-option-name]').count() === 2);
    const downloadPromise = page.waitForEvent('download'); await page.locator('[data-export="json"]').click();
    const backup = await downloadPromise; await backup.saveAs(path.join(out, 'backup.json'));
    check('export contains current draft', JSON.parse(fs.readFileSync(path.join(out, 'backup.json'), 'utf8')).title === '我的下一步');
    await page.locator('#decision-import').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{bad') });
    await page.waitForFunction(() => document.querySelector('[data-notice]').textContent.includes('导入失败'));
    check('malformed import preserves draft', (await page.locator('[data-notice]').innerText()).includes('导入失败') && await page.locator('#decision-title').inputValue() === '我的下一步');
    const unsafe = JSON.parse(fs.readFileSync(path.join(out, 'backup.json'), 'utf8')); unsafe.title = '<img src=x onerror=alert(1)>';
    await page.locator('#decision-import').setInputFiles({ name: 'safe-text.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(unsafe)) });
    await page.waitForFunction(() => document.querySelector('.decision-confirm').open);
    await page.locator('.decision-confirm button[value="replace"]').click();
    await page.waitForFunction(() => document.querySelector('#decision-title').value.startsWith('<img'));
    check('imported strings render as text', await page.locator('#decision-title').inputValue() === unsafe.title && await page.locator('[data-decision-app] img').count() === 0);
    const other = await ctx.newPage(); await other.goto(base + '/tool/decision/');
    await other.locator('#decision-title').fill('另一个标签页'); await other.locator('#decision-title').press('Tab');
    await page.waitForFunction(() => document.querySelector('[data-save-state]').textContent.includes('暂停保存'));
    await page.getByRole('button', { name: '载入其他标签页的最新草稿' }).click();
    check('cross-tab draft conflict requires explicit load', await page.locator('#decision-title').inputValue() === '另一个标签页');
    await other.close(); check('no uncaught errors in core workflows', errors.length === 0);
    await ctx.close();

    // Storage failure must remain visible and must not overwrite the original corrupt bytes.
    const corrupt = await context(browser); await corrupt.addInitScript(([key, pocket]) => { localStorage.setItem(key, '{broken'); localStorage.setItem(pocket, '{broken'); }, [decisionKey, pocketKey]);
    const broken = await corrupt.newPage(); await broken.goto(base + '/tool/decision/');
    await broken.locator('#decision-title').fill('还在页面里'); await broken.locator('#decision-title').press('Tab');
    check('corrupt local draft protected', await broken.evaluate(key => localStorage.getItem(key), decisionKey) === '{broken' && (await broken.locator('[data-save-state]').innerText()).includes('未保存'));
    await broken.goto(base + '/tool/'); check('corrupt pocket reports failure', (await broken.locator('[data-pocket-status]').innerText()).includes('无法') || (await broken.locator('[data-pocket-status]').innerText()).includes('不可用')); await corrupt.close();

    for (const theme of ['light', 'dark']) for (const width of [320, 390, 768, 1100, 1440]) {
      const responsive = await context(browser, { viewport: { width, height: 900 }, colorScheme: theme }); const p = await responsive.newPage();
      for (const route of ['/tool/', '/games/', '/a/', '/blog/', '/tool/decision/']) {
        await p.goto(base + route); await settle();
        check(`${route} fits ${width} ${theme}`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        if (route === '/tool/decision/') {
          check('score controls fit cells', await p.locator('[data-score-option]').evaluateAll(inputs => inputs.every(el => { const r = el.getBoundingClientRect(), parent = el.closest('td').getBoundingClientRect(); return r.width > 25 && r.x >= parent.x - 1 && r.right <= parent.right + 1; })));
          if ([390, 1440].includes(width)) await p.screenshot({ path: path.join(out, `decision-${width}-${theme}.png`), fullPage: true });
          while (await p.locator('[data-option-name]').count() < 5) await p.locator('[data-add-option]').click();
          check(`five options fit ${width}`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        } else {
          await p.locator('button[data-catalog-view="list"]').click();
          check(`compact ${route} fits ${width}`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
          await p.locator('[data-pocket-pin]').first().click();
          if (route === '/tool/' && [390,1440].includes(width)) await p.screenshot({path:path.join(out,`pocket-${width}-${theme}.png`),fullPage:true});
        }
      }
      await responsive.close();
    }
    const nojs = await context(browser, { javaScriptEnabled: false }); const p = await nojs.newPage();
    await p.goto(base + '/tool/'); check('no-js keeps real directory links', await p.locator('[data-catalog-card]').count() > 20 && !await p.locator('[data-pocket-shelf]').isVisible());
    await p.goto(base + '/tool/decision/'); check('no-js explanation is visible', await p.locator('noscript h2').isVisible()); await nojs.close();
    console.log(`Decision & pocket UI passed: ${passed} assertions. Screenshots: ${out}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
