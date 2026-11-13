const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
let playwright;
try { playwright = require('playwright'); } catch {
    const globalRoot = execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['root', '-g'], {
        encoding: 'utf8', shell: process.platform === 'win32'
    }).trim();
    playwright = createRequire(path.join(globalRoot, 'package.json'))('playwright');
}

const base = process.env.BASE_URL || 'http://127.0.0.1:4321';
const api = '**/api/quarkbot-free';

async function checkVoice(context) {
    const page = await context.newPage();
    await page.addInitScript(() => {
        if (!localStorage.getItem('voiceTranscript')) localStorage.setItem('voiceTranscript', '嗯，先核对数字 12。');
        window.SpeechRecognition = class {
            start() {
                this.onstart();
                this.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: '临时' }], { isFinal: false })] });
            }
            stop() {
                this.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: '已确认。' }], { isFinal: true })] });
                this.onend();
            }
            abort() { this.onend(); }
        };
    });
    const original = page.locator('#transcript');
    const revision = page.locator('#revision');
    await page.goto(base + '/tool/audio2txt/');
    assert.equal(await original.inputValue(), '嗯，先核对数字 12。');
    await page.locator('#localCleanup').click();
    assert.equal(await revision.inputValue(), '先核对数字 12。');

    await page.locator('#startBtn').click();
    assert.match(await page.locator('#interim').innerText(), /临时/);
    assert.doesNotMatch(await original.inputValue(), /临时/);
    await page.locator('#stopBtn').click();
    assert.match(await original.inputValue(), /已确认/);
    await page.reload();
    assert.match(await original.inputValue(), /已确认/);

    await original.fill('私密开头。 那个，我们周三发，不对，周四发。 私密结尾。');
    await original.evaluate(node => {
        node.focus();
        node.setSelectionRange(node.value.indexOf('那个'), node.value.indexOf(' 私密结尾'));
    });
    let payload;
    await page.route(api, async route => {
        payload = route.request().postDataJSON();
        await route.fulfill({
            status: 200,
            contentType: 'text/event-stream',
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: 'data: ' + JSON.stringify({ choices: [{ delta: { content: '我们周四发。' } }] }) + '\n\ndata: [DONE]\n\n'
        });
    });
    await page.locator('#aiCleanup').click();
    await page.waitForFunction(() => document.querySelector('#revision').value === '我们周四发。');
    assert.equal(payload.messages.at(-1).content, '那个，我们周三发，不对，周四发。');
    assert.match(await original.inputValue(), /私密开头/);
    await page.unroute(api);
    await page.route(api, route => route.fulfill({ status: 429, headers: { 'Access-Control-Allow-Origin': '*' } }));
    await page.locator('#aiCleanup').click();
    await page.waitForFunction(() => !document.querySelector('#quotaLogin').hidden);
    assert.equal(await revision.inputValue(), '我们周四发。');
    await page.close();
}

async function checkOcr(context) {
    const page = await context.newPage();
    await page.route('**/tesseract.min.js', route => route.fulfill({
        contentType: 'text/javascript',
        body: 'window.Tesseract = {createWorker: async () => ({ recognize: async () => ({data: { text: "Quark OCR", words: [{text:"Quark", confidence:64, bbox:{x0:56,y0:50,x1:180,y1:92}}, {text:"OCR",confidence:96,bbox:{x0:188,y0:50,x1:270,y1:92}}] }}), terminate: async () => {} })};'
    }));
    await page.goto(base + '/tool/ocr/');
    await page.locator('#ocrSample').click();
    await page.locator('#recognizeBtn').click();
    await page.locator('#ocrDetail').waitFor();
    assert.match(await page.locator('#ocrReviewStatus').innerText(), /Quark.*64/);
    await page.locator('#ocrLocate').click();
    assert.equal(await page.locator('#resultText').evaluate(node => node.value.slice(node.selectionStart, node.selectionEnd)), 'Quark');
    await page.locator('#ocrThreshold').selectOption('101');
    await page.locator('#ocrNext').click();
    assert.match(await page.locator('#ocrReviewStatus').innerText(), /OCR.*96/);
    await page.locator('#clearBtn').click();
    assert.equal(await page.locator('#resultText').inputValue(), '');
    assert.equal(await page.locator('#ocrReview').isVisible(), false);
    await page.close();
}

async function checkChat(context) {
    const page = await context.newPage();
    await page.goto(base + '/tool/chat-analyzer/');
    await page.locator('#chatSample').click();
    await page.locator('#wordList button').filter({ hasText: '科幻' }).first().click();
    await page.locator('#concordanceLines mark').first().waitFor();
    assert.match(await page.locator('#concordanceLines li').first().innerText(), /第 1 行.*科幻/);
    assert.equal(await page.locator('#concordanceLines li').count(), 4);
    await page.locator('#resetBtn').click();
    assert.equal(await page.locator('#concordance').isVisible(), false);
    await page.close();
}

async function checkAudioLab(context) {
    const page = await context.newPage();
    await page.goto(base + '/a/music-visualizer/');
    await page.locator('#playBtn').click();
    const player = page.locator('#player');
    await page.waitForFunction(() => document.querySelector('#player').currentTime > 0.2);
    await page.waitForFunction(() => {
        const canvas = document.querySelector('#spectrogram');
        return canvas.getContext('2d').getImageData(canvas.width - 1, 0, 1, canvas.height).data.some((byte, index) => index % 4 === 0 && byte > 40);
    });
    await player.evaluate(node => { node.pause(); node.currentTime = 0.5; });
    await page.locator('#markA').click();
    await player.evaluate(node => { node.currentTime = 1; });
    await page.locator('#markB').click();
    await page.locator('#loopToggle').click();
    assert.equal(await page.locator('#loopToggle').getAttribute('aria-pressed'), 'true');
    await player.evaluate(node => {
        node.addEventListener('seeking', () => {
            if (node.currentTime < 0.6) window.loopReturned = true;
        });
    });
    await page.waitForFunction(() => window.loopReturned);
    await page.locator('#clearLoop').click();
    assert.equal(await page.locator('#loopToggle').isDisabled(), true);

    await page.locator('#demoType').selectOption('missing');
    await page.locator('#playBtn').click();
    await page.waitForFunction(() => {
        return document.querySelector('#pitchValue').textContent === '220 Hz'
            && document.querySelector('#player').currentTime > 0.45;
    });
    assert.equal(await page.locator('#peakValue').textContent(), '440 Hz');
    await page.locator('#freezePlot').click();
    const beforeProbe = await page.locator('#probeTime').innerText();
    await page.locator('#frameProbe').press('ArrowLeft');
    assert.notEqual(await page.locator('#probeTime').innerText(), beforeProbe);
    const selectedTime = Number.parseFloat(await page.locator('#probeTime').innerText());
    await player.evaluate(node => node.pause());
    await page.locator('#seekFrame').click();
    assert.ok(Math.abs(await player.evaluate(node => node.currentTime) - selectedTime) < 0.02);
    assert.equal(await page.locator('#freezePlot').getAttribute('aria-pressed'), 'false');
    await player.evaluate(node => node.play());
    await page.waitForFunction(time => document.querySelector('#player').currentTime >= time + 0.2, selectedTime);
    await page.locator('#captureA').click();
    assert.match(await page.locator('#snapshotA').innerText(), /消失的基频/);
    await page.locator('#showMarkers').check();
    await page.locator('#markerSource').selectOption('0');
    await page.locator('#marker1').press('ArrowRight');
    assert.notEqual(await page.locator('#markerValue1').innerText(), '440.0 Hz');
    await page.locator('#snapMarker1').click();
    await page.locator('#snapMarker2').click();
    const peak1 = Number.parseFloat(await page.locator('#markerValue1').innerText());
    const peak2 = Number.parseFloat(await page.locator('#markerValue2').innerText());
    const spacing = Number.parseFloat(await page.locator('#markerDelta').innerText());
    const probeDetails = JSON.stringify({ peak1, peak2, spacing, status: await page.locator('#markerStatus').innerText() });
    assert.ok(Math.abs(peak1 - 440) < 1, probeDetails);
    assert.ok(Math.abs(peak2 - 660) < 1, probeDetails);
    assert.ok(Math.abs(spacing - 220) < 2, probeDetails);
    await page.locator('#bandFromPeak').click();
    await page.locator('#bandToggle').click();
    assert.equal(await page.locator('#bandToggle').getAttribute('aria-pressed'), 'true');
    await page.locator('#demoType').selectOption('beats');
    await page.locator('#playBtn').click();
    await page.waitForFunction(() => document.querySelector('#player').currentTime > 0.45);
    assert.equal(await page.locator('#bandToggle').getAttribute('aria-pressed'), 'false');
    await page.locator('#captureB').click();
    assert.match(await page.locator('#snapshotB').innerText(), /两个音的拍频/);
    assert.equal(await page.locator('#markerSource').inputValue(), '0');
    assert.match(await page.locator('#compareStatus').innerText(), /B − A 有效电平/);
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#exportSpectra').click()]);
    assert.equal(download.suggestedFilename(), 'spectrum-snapshots.csv');
    await page.locator('[data-viz="waves"]').click();
    await page.locator('#envelopeMode').click();
    assert.equal(await page.locator('#waveCanvas').getAttribute('aria-label'), '最近两秒的 RMS 电平变化');
    await page.close();
}

(async () => {
    const browser = await playwright.chromium.launch();
    try {
        const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
        await context.route('**/*', route => {
            const url = route.request().url();
            return url.startsWith(base) || url.startsWith('blob:') ? route.continue() : route.abort();
        });
        for (const check of [checkVoice, checkOcr, checkChat, checkAudioLab]) {
            await check(context);
            console.log('Passed ' + check.name);
        }
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
