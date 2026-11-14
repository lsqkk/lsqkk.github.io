import assert from 'node:assert/strict';
import { test } from 'node:test';
import { S3Client } from '@aws-sdk/client-s3';
import admin from 'firebase-admin';
import { handleDrop, signedUpload } from '../api/_share-drop.js';
import { issueQuotaSession } from '../api/_quota-session.js';
import { handleRoom } from '../api/_share-room.js';
import shareApi from '../api/share.js';
import { bytes, manifestItems, normalizedCode, parseInvite, PathIndex, previewType, safePath } from '../assets/pages/a/share/share-model.mjs';
import { offlineSize, openDrop, sealDrop } from '../assets/pages/a/share/share-offline.mjs';
import { LiveTransfer } from '../assets/pages/a/share/share-transfer.mjs';

test('path index preserves Unicode hierarchy while resolving case and ancestor collisions', () => {
    const index = new PathIndex();
    assert.equal(index.add('a'), 'a');
    assert.equal(index.add('A/README.txt'), 'A (2)/README.txt');
    assert.equal(index.add('a/readme.TXT'), 'A (2)/readme (2).TXT');
    assert.equal(index.add('a (2)'), 'a (2) (2)');
    assert.equal(index.add('new/folder/data.csv'), 'new/folder/data.csv');
    assert.equal(index.add('new/folder'), 'new/folder (2)');
    assert.equal(safePath('..\\..\\CON.txt/\u0000file '), '_/_/_/_file');
    assert.equal(safePath('e\u0301.txt'), 'é.txt');
    assert.equal(previewType('test.constructor'), '');
    assert.equal(previewType('diagram.svg'), 'text/plain');
    assert.equal(bytes(1024), '1.0 KiB');
    assert.throws(() => manifestItems([{ path: 'x', size: 100 }], 99), /上限/);
});

test('accepts old codes and site URLs, rejects origin and path substitution', () => {
    const site = 'https://lsqkk.github.io/a/share/';
    assert.equal(normalizedCode(' 234a-b567'), '234AB567');
    assert.deepEqual(parseInvite('aBc', site), { room: 'ABC' });
    assert.deepEqual(parseInvite('https://130923.xyz/a/share/#room=234AB567', site), { room: '234AB567' });
    assert.equal(parseInvite('https://lsqkk.github.io.example.net/a/share/#room=ABC', site), null);
    assert.equal(parseInvite('https://lsqkk.github.io/a/not-share/#room=ABC', site), null);
});

test('encrypted drop round trip preserves Unicode, directory paths and empty files', async () => {
    const files = [
        { path: '目录/样本.txt', blob: new Blob(['示例\n']) },
        { path: '目录/空.bin', blob: new Blob([]) }
    ].map((file) => ({ ...file, size: file.blob.size }));
    const note = '给收件人：测试 🔑';
    const first = await sealDrop(files, note);
    const second = await sealDrop(files, note);
    assert.notEqual(first.key, second.key);
    assert.equal(first.blob.size, offlineSize(files, note));
    const data = await first.blob.arrayBuffer();
    const out = await openDrop(data, first.key);
    assert.equal(out.note, note);
    assert.equal(await out.files[0].blob.text(), '示例\n');
    assert.equal(out.files[1].blob.size, 0);
    assert.ok(!(await first.blob.text()).includes('样本.txt'));
    await assert.rejects(openDrop(data, second.key), /无法解密/);
    new Uint8Array(data)[data.byteLength - 1] ^= 1;
    await assert.rejects(openDrop(data, first.key), /无法解密/);
});

test('R2 PUT signature fixes exact length, object path, MIME type and immutability', async () => {
    const client = new S3Client({
        region: 'auto', endpoint: 'https://example.r2.cloudflarestorage.com',
        credentials: { accessKeyId: 'test', secretAccessKey: 'test' }, requestChecksumCalculation: 'WHEN_REQUIRED'
    });
    const target = { Bucket: 'share-test', Key: 'share-drop/2026-11-13/opaque.bin' };
    const first = new URL(await signedUpload(client, target, 4096));
    const second = new URL(await signedUpload(client, target, 4097));
    assert.match(first.pathname, /\/share-drop\/2026-11-13\/opaque.bin$/);
    assert.equal(first.searchParams.get('X-Amz-Expires'), '900');
    assert.equal(first.searchParams.get('X-Amz-SignedHeaders'), 'cache-control;content-length;content-type;host;if-none-match');
    assert.notEqual(first.searchParams.get('X-Amz-Signature'), second.searchParams.get('X-Amz-Signature'));
    assert.equal(first.searchParams.has('x-amz-checksum-crc32'), false);
    client.destroy();
});

function invokeApi({ origin = 'https://lsqkk.github.io', method = 'POST', body = { action: 'status' } } = {}) {
    const headers = {};
    const result = { headers, body: null, status: 0 };
    const response = {
        setHeader(name, value) { headers[name] = value; },
        status(code) { result.status = code; return response; },
        json(value) { result.body = value; },
        end() {}
    };
    return shareApi({ method, headers: { origin }, body }, response).then(() => result);
}

test('public share API rejects foreign origins and unsupported methods before service access', async () => {
    assert.equal((await invokeApi({ origin: 'https://lsqkk.github.io.example.net' })).status, 403);
    assert.equal((await invokeApi({ method: 'GET' })).status, 405);
    const preflight = await invokeApi({ method: 'OPTIONS' });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers['Access-Control-Allow-Origin'], 'https://lsqkk.github.io');
    assert.equal(preflight.headers['Cache-Control'], 'no-store');
    assert.equal((await invokeApi({ body: { action: 'room-poll', content: 'x'.repeat(65_536) } })).status, 400);
    const health = await invokeApi();
    assert.equal(health.status, 200);
    assert.equal(typeof health.body.offline, 'boolean');
});

function roomDatabase() {
    const data = new Map();
    const snapshot = (value) => ({ val: () => value || null, forEach() {} });
    return { data, ref(path) {
        const ref = {
            orderByKey() { return ref; }, endAt() { return ref; },
            once: async () => snapshot(data.get(path)),
            remove: async () => data.delete(path),
            update: async (changes) => {
                for (const [key, value] of Object.entries(changes)) {
                    if (value === null) data.delete(key);
                    else if (key.endsWith('/revoked')) data.get(key.slice(0, -8)).revoked = value;
                    else data.set(key, value);
                }
            },
            transaction: async (update) => {
                const existing = data.get(path);
                let next = update(null);
                if (typeof next !== 'undefined' && existing) next = update(existing);
                if (typeof next === 'undefined') return { committed: false, snapshot: snapshot(existing) };
                if (next === null) data.delete(path);
                else data.set(path, next);
                return { committed: true, snapshot: snapshot(next) };
            }
        };
        return ref;
    } };
}

test('room actions enforce guest and host claims, expiry, and legacy write binding', async (t) => {
    const previous = Object.getOwnPropertyDescriptor(admin, 'database');
    const priorSecret = process.env.FIREBASE_SERVICE_ACCOUNT;
    process.env.FIREBASE_SERVICE_ACCOUNT = 'unit-test-only';
    const app = admin.initializeApp({ projectId: 'share-test' });
    const db = roomDatabase();
    Object.defineProperty(admin, 'database', { configurable: true, value: () => db });
    t.after(async () => {
        if (previous) Object.defineProperty(admin, 'database', previous);
        else delete admin.database;
        if (priorSecret === undefined) delete process.env.FIREBASE_SERVICE_ACCOUNT;
        else process.env.FIREBASE_SERVICE_ACCOUNT = priorSecret;
        await app.delete();
    });
    const req = { headers: { 'x-vercel-forwarded-for': '203.0.113.4' } };
    const offer = { type: 'offer', sdp: 'v=0\r\na=offer' };
    const answer = { type: 'answer', sdp: 'v=0\r\na=answer' };
    const call = (action, body) => handleRoom(req, { action, ...body });
    const room = await call('room-create', { offer, intent: 'collect' });
    assert.match(room.code, /^[2-9A-HJ-NP-Z]{8}$/);
    assert.equal(room.token.length, 32);
    const guest = await call('room-join', { code: room.code });
    assert.equal(guest.intent, 'collect');
    assert.notEqual(guest.token, room.token);
    await assert.rejects(call('room-join', { code: room.code }), { status: 409 });
    const ice = { candidate: 'candidate:1 1 UDP 1 203.0.113.4 443 typ relay', sdpMLineIndex: 0, sdpMid: '0' };
    const hostSignal = { code: room.code, token: room.token };
    const guestSignal = { code: room.code, token: guest.token };
    await assert.rejects(call('room-poll', { ...guestSignal, token: 'x'.repeat(32) }), { status: 403 });
    await assert.rejects(call('room-poll', { ...guestSignal, candidates: [{}] }), { status: 400 });
    await call('room-poll', { ...hostSignal, candidates: [ice] });
    await call('room-poll', { ...hostSignal, candidates: [ice] });
    assert.deepEqual(await call('room-poll', { ...guestSignal, candidates: [ice] }), { answer: null, candidates: [ice] });
    await assert.rejects(call('room-answer', { code: room.code, token: room.token, answer }), { status: 403 });
    await call('room-answer', { code: room.code, token: guest.token, answer });
    assert.deepEqual(await call('room-poll', hostSignal), { answer, candidates: [ice] });
    await call('room-close', { code: room.code, token: room.token });
    await assert.rejects(call('room-join', { code: room.code }), { status: 404 });

    await assert.rejects(call('legacy-answer', { code: 'ABC', answer, claim: '0'.repeat(64), expiresAt: Date.now() + 5000 }), { status: 409 });
    assert.equal(db.data.has('rooms/ABC'), false);
    db.data.set('rooms/ABC', { sender: { sdp: offer } });
    const legacy = await call('legacy-read', { code: 'ABC' });
    await call('legacy-answer', { code: 'ABC', answer, claim: legacy.claim, expiresAt: legacy.expiresAt });
    assert.deepEqual(db.data.get('rooms/ABC').receiver.sdp, answer);
    await assert.rejects(call('legacy-answer', { code: 'ABC', answer, claim: legacy.claim, expiresAt: legacy.expiresAt }), { status: 409 });
});

test('Firebase offline fallback stores only ciphertext and enforces expiry and ownership', async (t) => {
    const db = roomDatabase();
    const previous = Object.getOwnPropertyDescriptor(admin, 'database');
    Object.defineProperty(admin, 'database', { configurable: true, value: () => db });
    const prior = Object.fromEntries(['FIREBASE_SERVICE_ACCOUNT', 'FIREBASE_DATABASE_URL', 'R2_SHARE_BUCKET']
        .map((name) => [name, process.env[name]]));
    process.env.FIREBASE_SERVICE_ACCOUNT = 'share-offline-test';
    process.env.FIREBASE_DATABASE_URL = 'https://example.firebaseio.com';
    delete process.env.R2_SHARE_BUCKET;
    const app = admin.initializeApp({ projectId: 'share-test' });
    t.after(async () => {
        if (previous) Object.defineProperty(admin, 'database', previous);
        else delete admin.database;
        for (const [name, value] of Object.entries(prior)) {
            if (value === undefined) delete process.env[name];
            else process.env[name] = value;
        }
        await app.delete();
    });
    const auth = (id) => ({ headers: { authorization: `Bearer ${issueQuotaSession(id).token}`, 'x-vercel-forwarded-for': '203.0.113.4' } });
    const { blob } = await sealDrop([], '测试离线留言');
    const ciphertext = Buffer.from(await blob.arrayBuffer()).toString('base64');
    const payload = { action: 'drop-create', size: blob.size, hours: 1, ciphertext };
    assert.equal((await invokeApi()).body.maxBytes, 1024 * 1024);
    await assert.rejects(handleDrop(auth('owner'), { ...payload, ciphertext: 'broken' }), { status: 400 });
    const record = await handleDrop(auth('owner'), payload);
    const read = () => handleDrop({ headers: {} }, { ...record, action: 'drop-read' });
    const revoke = (id) => handleDrop(auth(id), { ...record, action: 'drop-revoke' });
    assert.equal((await read()).ciphertext, ciphertext);
    await assert.rejects(revoke('stranger'), { status: 403 });
    const meta = db.data.get(`quark_share_drops/${record.day}/${record.id}`);
    assert.equal(meta.ciphertext, undefined);
    meta.expiresAt = Date.now() - 100;
    await assert.rejects(read(), { status: 410 });
    await revoke('owner');
    assert.equal(db.data.has(`quark_share_drop_ciphertext/${record.day}/${record.id}`), false);
});

test('multi-frame offer negotiates a 500-file Unicode manifest and receives an acknowledgement', async () => {
    const results = [];
    function pipe() {
        return Object.assign(new EventTarget(), {
            readyState: 'open', bufferedAmount: 0, bufferedAmountLowThreshold: 0
        });
    }
    const tx = pipe(), rx = pipe();
    const event = { ready() {}, waiting() {}, sending() {}, receiving() {}, progress() {}, file() {},
        invalid(detail) { assert.fail(detail); }, cancelled(detail) { assert.fail(detail); }
    };
    let sender, receiver;
    const receipt = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Missing receipt')), 4000);
        sender = new LiveTransfer(tx, { role: 'send', events: {
            ...event, sent(count, size) { clearTimeout(timeout); resolve({ count, size }); }
        } });
    });
    receiver = new LiveTransfer(rx, { role: 'receive', events: {
        ...event,
        request(manifest) { if (manifest) receiver.accept(); },
        file(file) { results.push(file); },
        received(note, count, total) { assert.equal(note, '测试'); assert.equal(count, 500); assert.equal(total, 1); }
    } });
    tx.send = (data) => queueMicrotask(() => receiver.message(data));
    rx.send = (data) => queueMicrotask(() => sender.message(data));
    sender.hello();
    receiver.hello();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const files = Array.from({ length: 500 }, (_, i) => {
        const blob = new Blob(i === 0 ? ['x'] : []);
        return { path: `目录/${'测'.repeat(130)}-${i}.txt`, size: blob.size, blob };
    });
    sender.request(files, '测试');
    assert.deepEqual(await receipt, { count: 500, size: 1 });
    assert.equal(await results[0].blob.text(), 'x');
    assert.equal(results.at(-1).blob.size, 0);
});
