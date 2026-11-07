import assert from 'node:assert/strict';
import test from 'node:test';
import { getQuarkBotTools } from '../assets/js/quarkbot-tools.mjs';
import { runHarness } from '../assets/js/llm-harness.mjs';
import { createDesk } from '../assets/js/reading-desk-store.mjs';

const findTool = (tools, name) => tools.find((tool) => tool.definition.function.name === name);
const query = '换成深色模式，字体改成系统默认，文章字号调大，减少动效';

function mockPreferences() {
    const state = { theme: 'light', font: 'xwwk', readingSize: 'normal', motion: 'full' };
    globalThis.window = {
        QuarkUserPreferences: {
            get: () => state,
            async update(patch, options) {
                assert.deepEqual(options, { sync: false });
                return Object.assign(state, patch);
            },
        },
    };
    return state;
}

test('settings writes are scoped to explicit fields and values in the current turn', async () => {
    const state = mockPreferences();
    const write = (text) => findTool(getQuarkBotTools(text), 'set_site_appearance');
    for (const text of ['你好', '怎么切换深色模式？', '不要切换到深色模式', '例如“切换到深色模式”', '深色和浅色有什么区别？',
        '什么是减少动效？', '不要用深色模式', '关闭深色模式', '如果是晚上，就换成深色模式']) {
        assert.equal(write(text), undefined, text);
    }
    const tool = write(query);
    assert.deepEqual(Object.keys(tool.definition.function.parameters.properties), ['theme', 'font', 'readingSize', 'motion']);
    assert((await tool.run({ theme: 'dark', botSearch: false })).result.error);
    assert((await tool.run({ theme: 'light' })).result.error);
    assert.equal(state.theme, 'light');
    await tool.run({ theme: 'dark', font: 'system', readingSize: 'large', motion: 'reduce' });
    assert.deepEqual(state, { theme: 'dark', font: 'system', readingSize: 'large', motion: 'reduce' });
    assert.deepEqual(Object.keys(write('把字体换成系统默认').definition.function.parameters.properties), ['font']);
    assert.deepEqual(write('从深色切换到浅色').definition.function.parameters.properties.theme.enum, ['light']);
    assert(findTool(getQuarkBotTools('最近有什么公告？'), 'read_site_notices'));
});

function stream(...deltas) {
    const events = deltas.map((delta) => `data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`);
    return new Response(events.join('') + 'data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
}

for (const failedFollowup of [false, true]) {
    test(failedFollowup ? 'completed changes receive a local receipt if the follow-up fails' : 'tool calls preserve text emitted before the tool round', async () => {
        const state = mockPreferences();
        let round = 0;
        window.QuarkLLMConfig = {
            async requestChat(_settings, request) {
                if (round++ === 0) {
                    assert(request.tools.some((tool) => tool.function.name === 'set_site_appearance'));
                    return stream({ content: '我来修改外观。' }, { tool_calls: [
                        { id: 'change', type: 'function', function: { name: 'set_site_appearance', arguments: '{"theme":"dark"}' } },
                    ] });
                }
                assert.equal(request.messages.at(-2).content, '我来修改外观。');
                assert.equal(JSON.parse(request.messages.at(-1).content).applied.主题, '深色');
                if (failedFollowup) return new Response('Failure', { status: 400 });
                return stream({ content: '深色主题已生效。' });
            },
            async parseErrorResponse(response) { return response.text(); },
        };
        const deltas = [];
        const reply = await runHarness({
            settings: {}, body: { messages: [{ role: 'user', content: query }] }, useSearch: false,
            extraTools: getQuarkBotTools(query), onText: (text) => deltas.push(text),
        });
        assert.equal(state.theme, 'dark');
        assert.equal(reply.text, '我来修改外观。\n\n' + (failedFollowup ? '已应用：主题：深色。' : '深色主题已生效。'));
        assert(deltas.every((text) => text.startsWith('我来修改外观。')));
        assert.equal(reply.trace[0].detail, '主题：深色');
    });
}

test('reading tools save only the current article and keep recommendations local', (t) => {
    mockPreferences();
    const storage = new Map();
    globalThis.localStorage = { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) };
    window.dispatchEvent = () => {};
    globalThis.document = {
        querySelector: () => ({}),
        getElementById: () => ({ dataset: { postPath: '/posts/example.md', postTitle: '当前文章', wordCount: '1200' } }),
    };
    t.after(() => { delete globalThis.localStorage; delete globalThis.document; });
    const save = (text) => findTool(getQuarkBotTools(text), 'save_current_article');
    for (const text of ['怎么收藏这篇文章', '不要收藏这篇文章', '“保存这篇文章”', '保存这篇文章里的示例代码', '总结这篇文章里保存数据库的方法', '保存这篇文章为 PDF']) {
        assert.equal(save(text), undefined, text);
    }
    const desk = createDesk();
    assert(save('把这篇留到下次读').run({ url: '/posts/other' }).result.error);
    assert.equal(desk.read().queue.length, 0);
    assert.equal(save('把这篇留到下次读').run({}).result.status, '已加入待读清单');
    assert.equal(save('收藏这篇文章').run({}).result.status, '已在待读清单中');
    assert.deepEqual(desk.read().queue.map((item) => item.url), ['/posts/example']);
    desk.add([
        { url: '/posts/local-private', title: '本机清单独有标题', minutes: 9 },
        { url: '/posts/long', title: '长篇', minutes: 21 },
        { url: '/posts/done', title: '已读', minutes: 2 },
    ]);
    desk.complete('/posts/done');
    let card;
    const recommend = findTool(getQuarkBotTools('我只有十分钟，拾页里下一篇读什么？', {
        showReadingResults: (data) => { card = data; },
    }), 'show_reading_queue');
    const output = recommend.run({});
    assert.equal(card.budget, 10);
    assert.deepEqual(card.items.map((item) => item.url), ['/posts/example', '/posts/local-private']);
    assert.deepEqual(output.result, { displayed: true, deskUrl: '/desk/' });
});
