const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const fs = require('node:fs/promises');
const path = require('node:path');
let playwright;
try { playwright = require('playwright'); }
catch {
    const root = execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['root', '-g'], {
        encoding: 'utf8', shell: process.platform === 'win32'
    }).trim();
    playwright = createRequire(path.join(root, 'package.json'))('playwright');
}

const base = process.env.BASE_URL || 'http://127.0.0.1:4321';
const target = base + '/a/share/';
const objectUrl = base + '/mock-share-object';
const errors = [];
let room;
let object;
const screenshotDir = process.env.SHARE_SCREENSHOTS;
const inlineDrop = process.env.SHARE_INLINE_DROP === '1';
const quotaSession = (subject) => ({
    token: Buffer.from(JSON.stringify({ sub: subject.repeat(64) })).toString('base64url') + '.mock',
    expiresAt: Date.now() + 600_000
});

async function mockApi(context) {
    await context.route('**/api/share', async (route) => {
        const request = route.request();
        const headers = {
            'access-control-allow-origin': new URL(base).origin,
            'access-control-allow-headers': 'Content-Type, Authorization',
            'access-control-allow-methods': 'POST, OPTIONS'
        };
        if (request.method() === 'OPTIONS') {
            await route.fulfill({ status: 204, headers });
            return;
        }
        const body = request.postDataJSON();
        const now = Date.now();
        let result;
        switch (body.action) {
            case 'room-create':
                room = { offer: body.offer, intent: body.intent, code: body.intent === 'send' ? '234AB567' : '234AB568', answer: null };
                result = { code: room.code, token: 'host', expiresAt: now + 120_000 };
                break;
            case 'room-join':
                result = { ...room, token: 'guest', expiresAt: now + 120_000 };
                break;
            case 'ice-config': result = { iceServers: [] }; break;
            case 'room-poll': {
                const isHost = body.token === 'host';
                const side = isHost ? 'hostIce' : 'guestIce';
                room[side] = [...(room[side] || []), ...body.candidates];
                result = { answer: isHost ? room.answer : null, candidates: room[isHost ? 'guestIce' : 'hostIce'] || [] };
                break;
            }
            case 'room-answer': room.answer = body.answer; result = { ok: true }; break;
            case 'room-close': result = { ok: true }; break;
            case 'status': result = { offline: true, inline: inlineDrop, maxBytes: (inlineDrop ? 1 : 25) * 1024 * 1024 }; break;
            case 'drop-create':
                assert.match(request.headers().authorization, /^Bearer /);
                assert.ok(body.size > 100);
                result = { uploadUrl: objectUrl, day: '2026-11-13', id: 'ab'.repeat(16) };
                if (inlineDrop) {
                    object = Buffer.from(body.ciphertext, 'base64');
                    assert.equal(object.length, body.size);
                    delete result.uploadUrl;
                    result.expiresAt = now + 6 * 3600_000;
                }
                break;
            case 'drop-finish':
                assert.ok(object && object.length > 100);
                result = { expiresAt: now + 6 * 3600_000 };
                break;
            case 'drop-read':
                assert.equal(request.headers().authorization, undefined);
                assert.deepEqual(Object.keys(body).sort(), ['action', 'day', 'id']);
                result = { size: object.length, ...(inlineDrop ? { ciphertext: object.toString('base64') } : { downloadUrl: objectUrl }) };
                break;
            case 'drop-revoke': result = { ok: true }; break;
            default: throw new Error('Unexpected request ' + body.action);
        }
        await route.fulfill({ json: result, headers });
    });
    await context.route('**/mock-share-object', async (route) => {
        const request = route.request();
        if (request.method() === 'PUT') {
            object = request.postDataBuffer();
            assert.equal(request.headers()['if-none-match'], '*');
            await route.fulfill({ status: 200, body: '' });
        } else await route.fulfill({ contentType: 'application/octet-stream', body: object });
    });
}

async function createPage(browser, options) {
    const context = await browser.newContext(options);
    const localOrigin = new URL(base).origin;
    await context.route('**/*', (route) => {
        const url = new URL(route.request().url());
        return url.origin === localOrigin ? route.continue() : route.abort();
    });
    await mockApi(context);
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    return { page, context };
}

async function expectText(page, selector, substring, timeout = 15_000) {
    await page.waitForFunction(({ selector, substring }) => document.querySelector(selector)?.textContent.includes(substring),
        { selector, substring }, { timeout });
}

async function addFiles(page) {
    await page.locator('#pick-files').setInputFiles([
        { name: 'hello.txt', mimeType: 'text/plain', buffer: Buffer.from('Transfer sample ✓') },
        { name: 'empty.bin', mimeType: 'application/octet-stream', buffer: Buffer.alloc(0) }
    ]);
    await expectText(page, '#queue-count', '2 个文件');
    await page.locator('#send-note').fill('给另一台设备的附言');
}

async function linkFrom(page) {
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', {
        configurable: true, value: { async writeText(text) { window.copiedInvite = text; } }
    }));
    await page.locator('#copy-invite').click();
    return page.evaluate(() => window.copiedInvite);
}

(async () => {
    const browser = await playwright.chromium.launch({
        ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }),
        args: ['--disable-features=WebRtcHideLocalIpsWithMdns']
    });
    try {
        const { page: sender, context: senderContext } = await createPage(browser, { viewport: { width: 1380, height: 1000 } });
        const { page: receiver, context: receiverContext } = await createPage(browser, {
            viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'dark'
        });
        await sender.goto(target);
        await addFiles(sender);
        if (screenshotDir) {
            await fs.mkdir(screenshotDir, { recursive: true });
            await sender.screenshot({ path: path.join(screenshotDir, 'share-desktop-light.png'), fullPage: true });
        }
        await sender.locator('#primary-action').click();
        await expectText(sender, '#invite-code', '234A-B567');
        const direct = await linkFrom(sender);
        assert.match(direct, /#room=234AB567$/);
        assert.ok(await sender.locator('#invite-qr').isVisible());
        await receiver.goto(direct);
        assert.equal(await receiver.locator('#join-value').inputValue(), '234AB567');
        await receiver.locator('#join-form button').click();
        await expectText(sender, '#connection-title', '设备已连接');
        await expectText(receiver, '#connection-title', '设备已连接');
        await sender.locator('#primary-action').click();
        await expectText(receiver, '#incoming-list', 'hello.txt');
        await receiver.locator('#decline-transfer').click();
        await expectText(sender, '#work-message', '拒绝');
        await sender.locator('#primary-action').click();
        await receiver.locator('#accept-transfer').click();
        await expectText(sender, '#connection-detail', '对方已接收');
        await expectText(receiver, '#received-note-value', '给另一台设备的附言');
        assert.equal(await receiver.locator('#received-files li').count(), 2);
        await receiver.getByRole('button', { name: '预览 hello.txt' }).click();
        await expectText(receiver, '#preview-content', 'Transfer sample ✓');
        await receiver.getByRole('button', { name: '关闭', exact: true }).click();
        const archiveEvent = receiver.waitForEvent('download');
        await receiver.locator('#download-zip').click();
        const archive = await archiveEvent;
        const { unzipSync } = await import('fflate');
        const files = unzipSync(await fs.readFile(await archive.path()));
        assert.equal(Buffer.from(files['hello.txt']).toString(), 'Transfer sample ✓');
        assert.equal(files['empty.bin'].length, 0);
        const width = await receiver.evaluate(() => ({
            document: document.documentElement.scrollWidth, viewport: innerWidth
        }));
        assert.equal(width.document, width.viewport);
        if (screenshotDir) await receiver.screenshot({ path: path.join(screenshotDir, 'share-mobile-dark.png'), fullPage: true });

        await sender.locator('#leave-room').click();
        await receiver.locator('#leave-room').waitFor({ state: 'hidden' });
        await receiver.locator('#create-collect').click();
        await expectText(receiver, '#invite-code', '234A-B568');
        await sender.goto(await linkFrom(receiver));
        await sender.locator('#join-form button').click();
        await expectText(sender, '#work-title', '准备发送');
        if (await sender.locator('#clear-files').isVisible()) await sender.locator('#clear-files').click();
        await addFiles(sender);
        await sender.locator('#primary-action').click();
        await receiver.locator('#accept-transfer').click();
        await expectText(sender, '#connection-detail', '对方已接收');
        await sender.locator('#leave-room').click();

        await sender.evaluate((session) => localStorage.setItem('quark_quota_session', JSON.stringify(session)), quotaSession('a'));
        await sender.locator('[data-mode="offline"]').click();
        await expectText(sender, '#offline-status', '取件方无需登录');
        await sender.locator('#primary-action').click();
        await expectText(sender, '#connection-detail', '离线包已生成');
        const offlineLink = await linkFrom(sender);
        assert.match(offlineLink, /#day=2026-11-13&drop=[a-f0-9]+&key=[A-Za-z0-9_-]{43}$/);
        assert.ok(!object.toString('utf8').includes('hello.txt'));
        assert.ok(!object.toString('utf8').includes('给另一台设备'));
        await receiver.goto(offlineLink);
        await expectText(receiver, '#connection-detail', '离线取件');
        await expectText(receiver, '#received-note-value', '给另一台设备的附言');
        assert.equal(await receiver.locator('#received-files li').count(), 2);
        assert.ok(await sender.locator('#revoke-drop').isVisible());
        const localStorageValue = await sender.evaluate(() => localStorage.getItem('quark_share_created_drops'));
        assert.deepEqual(Object.keys(JSON.parse(localStorageValue)[0]).sort(), ['account', 'day', 'expiresAt', 'id']);
        await sender.evaluate((session) => localStorage.setItem('quark_quota_session', JSON.stringify(session)), quotaSession('b'));
        await sender.reload();
        assert.ok(await sender.locator('#drop-history').isHidden());
        await sender.evaluate((session) => {
            localStorage.setItem('quark_quota_session', JSON.stringify(session));
            const history = JSON.parse(localStorage.getItem('quark_share_created_drops'));
            history.push({ ...history[0], id: 'ff'.repeat(16), expiresAt: Date.now() - 1000 });
            localStorage.setItem('quark_share_created_drops', JSON.stringify(history));
        }, quotaSession('a'));
        await sender.reload();
        assert.equal(await sender.locator('#active-drops button').count(), 1);
        await sender.locator('#active-drops button').click();
        await expectText(sender, '#work-message', '已撤回离线包');
        assert.ok(await sender.locator('#drop-history').isHidden());
        assert.deepEqual(errors, []);
        await receiverContext.close();
        await senderContext.close();
        console.log('Share UI passed: RTC file send + collect, refusal, receipt, preview, ZIP, encrypted async drop and mobile layout');
    } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
