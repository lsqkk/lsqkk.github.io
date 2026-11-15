import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { allowOrigin, SITE_ORIGINS } from './_cors.js';
import { getDatabase } from './_firebase-admin.js';
import { quotaAccount } from './_quota-session.js';
import {
    canPublishSubmission, normalizeSubmission, submissionKey, validProblemId, validSubmissionKey,
    OJ_BATCH_SIZE, OJ_HISTORY_PAGE_SIZE, OJ_SOLUTION_TITLE_LIMIT, OJ_SOLUTION_BODY_LIMIT,
} from './_quark-oj-schema.js';

const root = 'quark_oj_v1';

class OjError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

function secretKey(label, subject) {
    const secret = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!secret) throw new Error('Missing QuarkOJ storage key');
    return createHmac('sha256', secret).update(`quark-oj:${label}:${subject}`).digest();
}

function seal(secret, key, entry) {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', secret, nonce);
    cipher.setAAD(Buffer.from(key));
    const content = Buffer.concat([cipher.update(JSON.stringify(entry), 'utf8'), cipher.final()]);
    return Buffer.concat([nonce, cipher.getAuthTag(), content]).toString('base64');
}

function unseal(secret, key, sealed) {
    try {
        const bytes = Buffer.from(sealed, 'base64');
        const cipher = createDecipheriv('aes-256-gcm', secret, bytes.subarray(0, 12));
        cipher.setAAD(Buffer.from(key));
        cipher.setAuthTag(bytes.subarray(12, 28));
        return JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8'));
    } catch {
        return null;
    }
}

function accountSubject(req) {
    const account = quotaAccount(req);
    // Password login still relies on the legacy site directory. GitHub and verified
    // email are backed by independent proof of account ownership.
    return account && !account.networkLimited ? account.subject : '';
}

async function history(db, account, cursor) {
    if (cursor != null && !validSubmissionKey(cursor)) throw new OjError(400, '提交记录页码无效。');
    const secret = secretKey('history', account);
    let query = db.ref(`${root}/history/${account}`).orderByKey();
    if (cursor) query = query.endBefore(cursor);
    const snap = await query.limitToLast(OJ_HISTORY_PAGE_SIZE + 1).once('value');
    const rows = [];
    snap.forEach(child => { rows.unshift([child.key, child.val()]); });
    const page = rows.slice(0, OJ_HISTORY_PAGE_SIZE);
    return {
        entries: page.map(([key, value]) => unseal(secret, key, value)).filter(Boolean),
        nextCursor: rows.length > page.length ? page.at(-1)[0] : null,
    };
}
async function saveHistory(db, account, body) {
    if (!Array.isArray(body?.entries) || body.entries.length < 1 || body.entries.length > OJ_BATCH_SIZE) {
        throw new OjError(400, '提交记录批次无效。');
    }
    const entries = body.entries.map(entry => normalizeSubmission(entry));
    if (entries.some(entry => !entry)) throw new OjError(400, '提交记录格式无效或超过容量限制。');
    const secret = secretKey('history', account);
    await db.ref(`${root}/history/${account}`).update(Object.fromEntries(entries.map(entry => {
        const key = submissionKey(entry);
        return [key, seal(secret, key, entry)];
    })));
    return {};
}

function solutionKey(account) {
    return secretKey('author', account).toString('hex').slice(0, 24);
}

function publicSolution(solution) {
    const { author, title, explanation, code, languageId, updatedAt } = solution;
    return { author, title, explanation, code, languageId, updatedAt };
}

async function listSolutions(db, account, problemId) {
    const ref = db.ref(`${root}/solutions/${problemId}`);
    const ownKey = account ? solutionKey(account) : '';
    const [snapshot, mine] = await Promise.all([
        ref.orderByChild('updatedAt').limitToLast(20).once('value'),
        ownKey ? ref.child(ownKey).once('value') : null,
    ]);
    const solutions = [];
    snapshot.forEach(child => { solutions.unshift(publicSolution(child.val())); });
    return { solutions, own: mine?.val() ?? null };
}

async function saveSolution(db, account, problemId, body) {
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    const explanation = typeof body?.explanation === 'string' ? body.explanation.trim() : '';
    if (!title || title.length > OJ_SOLUTION_TITLE_LIMIT
        || !explanation || explanation.length > OJ_SOLUTION_BODY_LIMIT || !validSubmissionKey(body?.submission)) {
        throw new OjError(400, '请检查题解标题、正文和通过的提交。');
    }
    const snapshot = await db.ref(`${root}/history/${account}/${body.submission}`).once('value');
    const entry = unseal(secretKey('history', account), body.submission, snapshot.val());
    if (entry?.problemId !== problemId || !canPublishSubmission(entry)) {
        throw new OjError(409, '请先同步这道题已通过的提交，再发布题解。');
    }

    const author = solutionKey(account);
    const solution = {
        author, title, explanation, code: entry.code, languageId: entry.languageId,
        submission: body.submission, updatedAt: Date.now(),
    };
    await db.ref(`${root}/solutions/${problemId}/${author}`).set(solution);
    return { own: solution };
}

async function deleteSolution(db, account, problemId) {
    await db.ref(`${root}/solutions/${problemId}/${solutionKey(account)}`).remove();
    return {};
}

const routes = {
    history: { method: 'GET', run: (db, account, req) => history(db, account, req.query?.before) },
    sync: { method: 'POST', run: (db, account, req) => saveHistory(db, account, req.body) },
    solutions: { method: 'GET', public: true, problem: true, run: listSolutions },
    publish: { method: 'POST', problem: true, run: saveSolution },
    withdraw: { method: 'POST', problem: true, run: deleteSolution },
};

export function createOjHandler(openDatabase = getDatabase) {
    return async function quarkOj(req, res) {
        const allowed = allowOrigin(req, res, SITE_ORIGINS);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        if (!allowed) return res.status(403).json({ error: '来源不受支持。' });
        if (req.method === 'OPTIONS') return res.status(204).end();

        const op = req.query?.op;
        const route = typeof op === 'string' && Object.hasOwn(routes, op) ? routes[op] : null;
        if (!route) return res.status(404).json({ error: '未知的 QuarkOJ 操作。' });
        if (route.method !== req.method) return res.status(405).json({ error: '请求方式不受支持。' });
        const account = accountSubject(req);
        if (!route.public && !account) return res.status(401).json({ error: '请使用 GitHub 或邮箱验证码登录。' });
        const problemId = Number(req.query?.p);
        if (route.problem && !validProblemId(problemId)) return res.status(400).json({ error: '题号无效。' });

        try {
            const db = openDatabase();
            const result = route.problem ? await route.run(db, account, problemId, req.body) : await route.run(db, account, req);
            return res.status(200).json(result);
        } catch (error) {
            if (error instanceof OjError) return res.status(error.status).json({ error: error.message });
            console.error('QuarkOJ storage unavailable:', error.code || error.name);
            return res.status(503).json({ error: 'QuarkOJ 账号服务暂不可用，请稍后重试。' });
        }
    };
}
