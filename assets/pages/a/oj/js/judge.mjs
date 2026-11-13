const endpoint = 'https://ce.judge0.com/submissions';
const decoder = new TextDecoder();
const encoder = new TextEncoder();

function encode(value) {
    const bytes = encoder.encode(value);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

function decode(value) {
    return value ? decoder.decode(Uint8Array.from(atob(value), char => char.charCodeAt(0))) : '';
}

export function normalizeSample(value) {
    return value.replace(/\\r\\n|\\[rn]/g, '\n').replace(/\r\n?/g, '\n');
}

function normalizeOutput(value) {
    return value.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n+$/, '');
}

async function request(url, options) {
    const response = await fetch(url, options);
    if (response.status === 429) throw new Error('评测服务请求过多，请稍后再试。');
    if (!response.ok) throw new Error(`评测服务返回 HTTP ${response.status}，请稍后重试。`);
    return response.json();
}

function delay(signal) {
    return new Promise((resolve, reject) => {
        signal.throwIfAborted();
        const timer = setTimeout(() => {
            signal.removeEventListener('abort', abort);
            resolve();
        }, 1000);
        function abort() {
            clearTimeout(timer);
            reject(signal.reason);
        }
        signal.addEventListener('abort', abort, { once: true });
    });
}

export async function evaluate({ code, languageId, input, expected, cpu, memory, signal, onPhase }) {
    const language = Number(languageId);
    const cpuLimit = [71, 109, 102].includes(language) ? cpu + 2 : cpu;
    const { token } = await request(`${endpoint}?base64_encoded=true`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
        body: JSON.stringify({
            source_code: encode(code), language_id: language, stdin: encode(input),
            cpu_time_limit: cpuLimit,
            // VM runtimes reserve address space beyond the program's measured memory.
            memory_limit: [91, 62, 102].includes(language) ? Math.max(memory, 1048576) : memory,
            enable_network: false,
        }),
    });
    if (typeof token !== 'string' || !token) throw new Error('评测服务未返回任务编号。');

    for (let attempt = 0; attempt < 60; attempt++) {
        await delay(signal);
        const fields = 'status_id,stdout,stderr,compile_output,time,memory,message';
        const data = await request(`${endpoint}/${encodeURIComponent(token)}?base64_encoded=true&fields=${fields}`, { signal });
        if (data.status_id === 1 || data.status_id === 2) {
            onPhase(data.status_id === 1 ? '排队中' : '运行中');
            continue;
        }
        const stdout = decode(data.stdout);
        const diagnostic = [decode(data.compile_output), decode(data.stderr), decode(data.message)].filter(Boolean).join('\n');
        const usedMemory = data.memory == null ? null : Number(data.memory);
        let status = ({ 4: 'WA', 5: 'TLE', 6: 'CE', 7: 'RTE', 8: 'RTE', 9: 'RTE', 10: 'RTE', 11: 'RTE', 12: 'RTE' })[data.status_id] || 'SYS_ERR';
        if (data.status_id === 3) {
            status = expected === undefined ? 'OK' : normalizeOutput(stdout) === normalizeOutput(expected) ? 'AC' : 'WA';
        }
        if (usedMemory > memory && ['OK', 'AC', 'WA'].includes(status)) status = 'MLE';
        return { status, time: data.time ?? null, memory: usedMemory, stdout, diagnostic };
    }
    throw new Error('等待评测结果超时，请稍后重试。');
}
