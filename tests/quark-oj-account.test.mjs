import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import dbHandler from '../api/db.js';
import { createOjHandler } from '../api/_quark-oj.js';
import { issueQuotaSession } from '../api/_quota-session.js';
import { submissionKey } from '../assets/pages/a/oj/js/account-schema.mjs';
import { openOjAccount } from '../assets/pages/a/oj/js/account.mjs';

test('Vercel entry point loads the local OJ module without affecting legacy routes', async () => {
    // Keep the mirrored schema in deployable files for both the browser and Vercel.
    const [backend, frontend] = await Promise.all(['../api/_quark-oj-schema.js',
        '../assets/pages/a/oj/js/account-schema.mjs'].map(file => readFile(new URL(file, import.meta.url), 'utf8')));
    assert.equal(backend.replaceAll('\r\n', '\n'), frontend.replaceAll('\r\n', '\n'));
    async function call(query) {
        const res = {
            setHeader() {},
            status(code) { this.code = code; return this; },
            json() { return this; },
        };
        await dbHandler({ method: 'GET', query, headers: { origin: 'https://lsqkk.github.io' } }, res);
        return res.code;
    }
    assert.equal(await call({ view: 'quark-oj', op: 'history' }), 401);
    assert.equal(await call({ path: 'quark_oj_v1/history/blocked' }), 400);
});

function memoryDatabase() {
    const data = new Map();
    function pointer(path, options = {}) {
        return {
            child: key => pointer(`${path}/${key}`),
            orderByKey: () => pointer(path, { byKey: true }),
            orderByChild: field => pointer(path, { field }),
            endBefore: cursor => pointer(path, { ...options, cursor }),
            limitToLast: limit => pointer(path, { ...options, limit }),
            set: async value => { data.set(path, value); },
            update: async entries => {
                for (const [key, value] of Object.entries(entries)) data.set(`${path}/${key}`, value);
            },
            remove: async () => { data.delete(path); },
            once: async () => ({
                val: () => data.get(path) ?? null,
                forEach(callback) {
                    const prefix = `${path}/`;
                    const children = [...data]
                        .filter(([key]) => key.startsWith(prefix))
                        .map(([key, value]) => [key.slice(prefix.length), value])
                        .filter(([key]) => !key.includes('/') && (!options.cursor || key < options.cursor))
                        .sort(([a, av], [b, bv]) => options.field ? av[options.field] - bv[options.field] : a.localeCompare(b));
                    for (const [key, value] of children.slice(-(options.limit || children.length))) {
                        callback({ key, val: () => value });
                    }
                },
            }),
        };
    }
    return { data, ref: pointer };
}

test('QuarkOJ API isolates history, merges retryable uploads and copies the accepted attachment', async () => {
    const oldSecret = process.env.FIREBASE_SERVICE_ACCOUNT;
    process.env.FIREBASE_SERVICE_ACCOUNT = 'test-only-oj-auth-secret';
    try {
        const db = memoryDatabase();
        const handle = createOjHandler(() => db);
        const a = issueQuotaSession('github:1').token;
        const b = issueQuotaSession('email:other@example.com').token;
        const password = issueQuotaSession('local:practice', { networkLimited: true }).token;
        const call = async (op, { token, method = 'GET', p = '1001', origin = 'https://lsqkk.github.io', before, body } = {}) => {
            const headers = { origin };
            if (token) headers.authorization = `Bearer ${token}`;
            const res = {
                headers: {},
                setHeader(key, value) { this.headers[key] = value; },
                status(code) { this.code = code; return this; },
                json(value) { this.body = value; return this; },
                end() { return this; },
            };
            await handle({ method, headers, query: { op, p, before }, body }, res);
            return res;
        };

        assert.equal((await call('history', { origin: 'https://lsqkk.github.io.evil.example' })).code, 403);
        const preflight = await call('history', { method: 'OPTIONS' });
        assert.equal(preflight.code, 204);
        assert.match(preflight.headers['Access-Control-Allow-Headers'], /Authorization/);
        assert.equal((await call('history')).code, 401);
        assert.equal((await call('history', { token: 'not-signed' })).code, 401);
        assert.equal((await call('history', { token: password })).code, 401);

        const accepted = {
            id: 'accepted-one', problemId: 1001, timestamp: Date.now(), status: 'AC', languageId: '109',
            code: 'print("<a private source>")', cases: [{ status: 'AC', time: '0.02', memory: 1024 }],
            totalCases: 1,
        };
        const partial = {
            ...accepted, id: 'partial', totalCases: 2,
        };
        const upload = token => call('sync', { token, method: 'POST', body: { entries: [accepted, partial] } });
        assert.equal((await upload(a)).code, 200);
        assert.equal((await upload(a)).code, 200);
        assert.equal(db.data.size, 2);
        assert.ok([...db.data.values()].every(cipher => typeof cipher === 'string' && !cipher.includes('private source')));
        assert.deepEqual((await call('history', { token: b })).body.entries, []);
        const ownEntries = (await call('history', { token: a })).body.entries;
        assert.equal(ownEntries.length, 2);
        assert.equal(ownEntries.find(entry => entry.id === 'accepted-one')?.code, accepted.code);
        assert.deepEqual((await call('solutions')).body, { solutions: [], own: null });

        const publish = (token, entry, p, authorName) => call('publish', {
            p, token, method: 'POST',
            body: { submission: submissionKey(entry), title: '<题解>', explanation: '<script>正文</script>', code: 'arbitrary source', authorName },
        });
        assert.equal((await publish(a, partial)).code, 409);
        assert.equal((await publish(a, accepted, '1002')).code, 409);
        assert.equal((await publish(b, accepted)).code, 409);
        assert.equal((await publish(a, accepted, '1001', '  站内\u202e昵称  ')).code, 200);
        assert.equal((await publish(a, accepted)).body.own.authorName, '站内昵称');
        const published = (await call('solutions')).body.solutions;
        assert.equal(published.length, 1);
        assert.equal(published[0].code, accepted.code);
        assert.equal(published[0].languageId, '109');
        assert.equal(published[0].authorName, '站内昵称');
        assert.equal(Object.hasOwn(published[0], 'submission'), false);
        const own = (await call('solutions', { token: a })).body.own;
        assert.equal(own.author, published[0].author);
        assert.equal(own.submission, submissionKey(accepted));
        assert.equal((await call('solutions', { token: b })).body.own, null);
        await call('withdraw', { token: b, method: 'POST' });
        assert.equal((await call('solutions')).body.solutions.length, 1);
        await call('withdraw', { token: a, method: 'POST' });
        assert.deepEqual((await call('solutions')).body.solutions, []);
    } finally {
        if (oldSecret === undefined) delete process.env.FIREBASE_SERVICE_ACCOUNT;
        else process.env.FIREBASE_SERVICE_ACCOUNT = oldSecret;
    }
});

test('QuarkOJ client can recover older cloud entries and carry offline submissions across reloads without leaking accounts', async () => {
    const original = { window: globalThis.window, localStorage: globalThis.localStorage, fetch: globalThis.fetch };
    const browserStore = new Map();
    const now = Date.now();
    const newEntry = id => ({ id, problemId: 1001, status: 'AC', timestamp: now, code: `print("${id}")`, languageId: '109' });
    const guest = [newEntry('guest-record')];
    const recent = newEntry('recent-record');
    const older = { ...newEntry('older-record'), timestamp: now - 100_000 };
    const offline = newEntry('offline-record');
    const subjectA = 'a'.repeat(64);
    const subjectB = 'b'.repeat(64);
    function login(subject) {
        const payload = Buffer.from(JSON.stringify({ sub: subject, exp: now + 100_000 })).toString('base64url');
        browserStore.set('quark_quota_session', JSON.stringify({ token: `${payload}.${'1'.repeat(64)}`, expiresAt: now + 100_000 }));
    }
    const localStorage = {
        get length() { return browserStore.size; },
        key: index => [...browserStore.keys()][index],
        getItem: key => browserStore.get(key) ?? null,
        setItem: (key, value) => browserStore.set(key, value),
        removeItem: key => { browserStore.delete(key); },
    };
    let offlineMode = true;
    const uploaded = [];
    globalThis.window = new EventTarget();
    globalThis.localStorage = localStorage;
    globalThis.fetch = async (path, options) => {
        const query = new URL(path, 'https://example.test/').searchParams;
        const payload = options.headers.Authorization.split(' ')[1].split('.')[0];
        const subject = JSON.parse(Buffer.from(payload, 'base64url')).sub;
        if (query.get('op') === 'sync') {
            if (offlineMode) throw new TypeError('Network offline');
            uploaded.push(...JSON.parse(options.body).entries);
            return Response.json({});
        }
        assert.equal(query.get('op'), 'history');
        if (subject === subjectB) return Response.json({ entries: [], nextCursor: null });
        return Response.json(query.get('before')
            ? { entries: [older], nextCursor: null }
            : { entries: [recent], nextCursor: submissionKey(recent) });
    };
    try {
        const mount = () => openOjAccount(() => guest, () => false);
        login(subjectA);
        const first = mount();
        assert.equal((await first.findEntry(older.id)).id, older.id);
        assert.ok(!first.entries().some(entry => entry.id === guest[0].id));
        assert.equal(first.save(offline), true);
        await first.sync();
        assert.equal(uploaded.length, 0);

        globalThis.window = new EventTarget();
        const reloaded = mount();
        assert.ok(reloaded.entries().some(entry => entry.id === offline.id));
        await reloaded.ready;
        offlineMode = false;
        await reloaded.sync();
        assert.deepEqual(uploaded.map(entry => entry.id), [offline.id]);
        assert.ok(![...browserStore.keys()].some(key => key.startsWith('quark_oj_pending')));

        login(subjectB);
        assert.equal(reloaded.save(newEntry('wrong-account'), subjectA), false);
        await reloaded.sync();
        assert.deepEqual(reloaded.entries(), []);
        browserStore.delete('quark_quota_session');
        await reloaded.sync();
        assert.deepEqual(reloaded.entries(), guest);
    } finally {
        for (const [key, value] of Object.entries(original)) {
            if (value === undefined) delete globalThis[key];
            else globalThis[key] = value;
        }
    }
});
