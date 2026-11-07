const prefix = 'quarkbot_session:';
const modeKey = 'quarkbot_connection_mode';

export const workspaceUrl = '/a/quarkbot/';
export const sessionUrl = (id) => id ? `${workspaceUrl}?chat=${encodeURIComponent(id)}` : workspaceUrl;
export const isSessionChange = (key) => key === null || key.startsWith(prefix);

export function preferredMode() {
    try { return localStorage.getItem(modeKey) === 'custom' ? 'custom' : 'free'; }
    catch { return 'free'; }
}

export function rememberMode(mode) {
    try { localStorage.setItem(modeKey, mode); } catch {}
}

export function readSession(id) {
    if (!id) return null;
    try {
        const value = JSON.parse(localStorage.getItem(prefix + id));
        return value?.id === id && Array.isArray(value.turns) ? value : null;
    } catch { return null; }
}

export function listSessions() {
    try {
        return Object.keys(localStorage).filter((key) => key.startsWith(prefix))
            .map((key) => readSession(key.slice(prefix.length))).filter(Boolean)
            .sort((a, b) => b.updated - a.updated);
    } catch { return []; }
}

function writeSession(session) {
    localStorage.setItem(prefix + session.id, JSON.stringify(session));
    return session;
}

export function newSession(source, mode, turn) {
    return writeSession({
        id: crypto.randomUUID(), source, mode, title: turn.query.replace(/\s+/g, ' ').slice(0, 52),
        updated: Date.now(), turns: [turn]
    });
}

export async function updateSession(id, update) {
    function mutate() {
        const current = readSession(id);
        if (!current) return null;
        const next = update(current);
        if (next) return writeSession({ ...next, updated: Math.max(Date.now(), current.updated + 1) });
        localStorage.removeItem(prefix + id);
        return null;
    }
    // Tabs share the record. Read inside the lock so a late reply cannot restore a deleted chat.
    return navigator.locks ? navigator.locks.request(prefix + id, mutate) : mutate();
}
