import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../assets/pages/a/oj/problems/', import.meta.url);
const json = async file => JSON.parse(await readFile(new URL(file, root), 'utf8'));

test('new catalogs expand every topic without shadowing existing problem IDs', async () => {
    const [legacy, general, cs61b] = await Promise.all(['index.json', 'general-index.json', 'cs61b-index.json'].map(json));
    const seen = new Set(legacy.map(problem => problem.id));
    const counts = new Map();
    for (const item of [...general, ...cs61b]) {
        assert.ok(!seen.has(item.id), `Duplicate P${item.id}`);
        seen.add(item.id);
        counts.set(item.track, (counts.get(item.track) || 0) + 1);
        assert.ok(item.tags?.length);
        const file = await json(`${item.id}.json`);
        assert.equal(file.title, item.title);
        assert.ok(file.description && file.input_format && file.output_format);
        assert.equal(typeof file.sample_input, 'string');
        assert.equal(typeof file.sample_output, 'string');
        assert.ok(file.hidden_tests.length >= 3);
        for (const fixture of file.hidden_tests) {
            assert.equal(typeof fixture.input, 'string');
            assert.equal(typeof fixture.expected_output, 'string');
        }
    }
    for (const topic of ['basics', 'arrays', 'structures', 'simulation', 'sorting', 'search', 'data-structures', 'graphs', 'dynamic-programming']) {
        assert.ok(counts.get(topic) >= 4, `Not enough exercises for ${topic}`);
    }
    assert.ok(seen.size >= 220);
});

test('every CS61B exercise belongs to exactly one roadmap stage with Berkeley sources', async () => {
    const [roadmap, catalog] = await Promise.all(['cs61b-roadmap.json', 'cs61b-index.json'].map(json));
    const problemStages = new Map(catalog.map(problem => [problem.id, problem.stage]));
    const assignments = new Set();
    for (const stage of roadmap) {
        assert.ok(stage.problemIds.length);
        assert.ok(stage.sources.length);
        for (const id of stage.problemIds) {
            assert.equal(problemStages.get(id), stage.id);
            problemStages.delete(id);
        }
        for (const source of stage.sources) {
            const url = new URL(source.url);
            assert.equal(url.protocol, 'https:');
            assert.match(url.hostname, /(?:^|\.)datastructur\.es$/);
            assignments.add(source.url);
        }
    }
    assert.equal(problemStages.size, 0);
    assert.ok(assignments.size >= 12);
    assert.ok(catalog.every(problem => problem.recommendedLanguage === 91));
});
