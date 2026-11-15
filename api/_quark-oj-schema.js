export const OJ_BATCH_SIZE = 8;
export const OJ_CODE_LIMIT = 24_000;
export const OJ_SOLUTION_TITLE_LIMIT = 80;
export const OJ_SOLUTION_BODY_LIMIT = 5_000;
export const OJ_HISTORY_PAGE_SIZE = 20;

const submissionIdPattern = /^[A-Za-z0-9_-]{1,95}$/;
const statuses = new Set(['AC', 'WA', 'TLE', 'CE', 'RTE', 'MLE', 'SYS_ERR', 'OK']);

export const validProblemId = id => Number.isSafeInteger(id) && id > 0 && id <= 999_999_999;
export const validSubmissionKey = key => typeof key === 'string' && /^\d{13}_[A-Za-z0-9_-]{1,95}$/.test(key);

export function submissionKey(entry) {
    return `${String(entry.timestamp).padStart(13, '0')}_${entry.id}`;
}

function metric(value) {
    if (!['string', 'number'].includes(typeof value) || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 && number <= 1e9 ? number : null;
}

export function normalizeSubmission(entry, now = Date.now()) {
    if (!entry || typeof entry.id !== 'string' || !submissionIdPattern.test(entry.id)
        || !validProblemId(entry.problemId) || !statuses.has(entry.status) || !Number.isSafeInteger(entry.timestamp)
        || entry.timestamp < 1 || entry.timestamp > now + 300_000 || entry.timestamp >= 1e13) return null;
    if (!['string', 'number', 'undefined'].includes(typeof entry.languageId)
        || (entry.languageId != null && !/^\d{1,4}$/.test(String(entry.languageId)))) return null;
    if (entry.code != null && (typeof entry.code !== 'string' || entry.code.length > OJ_CODE_LIMIT)) return null;
    if (entry.cases != null && (!Array.isArray(entry.cases) || entry.cases.length > 200
        || entry.cases.some(test => !test || !statuses.has(test.status)))) return null;
    if (entry.totalCases != null && (!Number.isInteger(entry.totalCases)
        || entry.totalCases < (entry.cases?.length ?? 0) || entry.totalCases > 200)) return null;
    const submission = {
        id: entry.id,
        problemId: entry.problemId,
        status: entry.status,
        timestamp: entry.timestamp,
        time: metric(entry.time),
        memory: metric(entry.memory),
    };
    if (entry.languageId != null) submission.languageId = String(entry.languageId);
    if (typeof entry.code === 'string') submission.code = entry.code;
    if (entry.cases?.length) {
        submission.cases = entry.cases.map(test => ({
            status: test.status,
            time: metric(test.time),
            memory: metric(test.memory),
        }));
    }
    if (entry.totalCases != null) submission.totalCases = entry.totalCases;
    return submission;
}

export function canPublishSubmission(entry) {
    if (entry?.status !== 'AC' || !entry.code?.trim() || !entry.languageId) return false;
    if (entry.totalCases == null && !entry.cases) return true;
    return entry.totalCases > 0 && entry.cases?.length === entry.totalCases
        && entry.cases.every(test => test.status === 'AC');
}
