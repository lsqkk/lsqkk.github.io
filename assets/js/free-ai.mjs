import { quotaHeaders } from './quota-session.mjs';

export function requestFreeChat(body, signal) {
    return fetch('__API_BASE__/api/quarkbot-free', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...quotaHeaders() },
        body: JSON.stringify(body),
        credentials: 'omit',
        redirect: 'error',
        signal
    });
}
