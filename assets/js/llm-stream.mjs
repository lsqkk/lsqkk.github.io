const dsmlTag = String.raw`(?:[|｜]\s*)+DSML\s*(?:[|｜]\s*)+`;
const dsmlMarker = String.raw`<\/?\s*${dsmlTag}`;
const dsmlWrapper = '(?:function_calls|tool_calls|toolcalls|calls|tool)';

function parseDsmlCalls(block) {
    const invoke = new RegExp(`<\\s*${dsmlTag}invoke\\s+name="([\\w-]{1,128})"\\s*>([\\s\\S]*?)<\\/\\s*${dsmlTag}invoke\\s*>`, 'g');
    const parameter = new RegExp(`<\\s*${dsmlTag}parameter\\s+name="([\\w-]{1,128})"(?:\\s+string="(true|false)")?\\s*>([\\s\\S]*?)<\\/\\s*${dsmlTag}parameter\\s*>`, 'g');
    const calls = [];
    for (const [, name, body] of block.matchAll(invoke)) {
        const args = Object.create(null);
        let valid = true;
        const remainder = body.replace(parameter, (_tag, key, isString, value) => {
            if (Object.hasOwn(args, key)) valid = false;
            if (isString === 'true') args[key] = value;
            else {
                try { args[key] = JSON.parse(value); }
                catch { if (isString === 'false') valid = false; else args[key] = value; }
            }
            return '';
        });
        if (valid && !remainder.trim()) calls.push({ function: { name, arguments: JSON.stringify(args) } });
    }
    return calls;
}

function splitToolMarkup(source, final) {
    const marker = new RegExp(dsmlMarker, 'g');
    const recoveredCalls = [];
    let content = '';
    let offset = 0;
    let leaked = false;
    for (let match; (match = marker.exec(source)); ) {
        leaked = true;
        content += source.slice(offset, match.index);
        const tail = source.slice(marker.lastIndex);
        const bareInvoke = /^invoke\b/.test(tail);
        let end = match[0].startsWith('</') ? /^[^>]*>/.exec(tail) :
            new RegExp(`<\\/\\s*${dsmlTag}${bareInvoke ? 'invoke' : dsmlWrapper}\\s*>`).exec(tail);
        if (!end && final && new RegExp(`^${dsmlWrapper}\\s*>`).test(tail)) {
            end = [...tail.matchAll(new RegExp(`<\\/\\s*${dsmlTag}invoke\\s*>`, 'g'))].at(-1);
        }
        if (!end) return { content, leaked, recoveredCalls };
        offset = marker.lastIndex + end.index + end[0].length;
        if (final) recoveredCalls.push(...parseDsmlCalls(source.slice(match.index, offset)));
        marker.lastIndex = offset;
    }
    const tail = source.slice(offset);
    // Hold a suffix that could become a protocol marker in the next SSE chunk.
    const partial = /<\/?\s*(?:(?:[|｜]\s*)+(?:D(?:S(?:M(?:L\s*(?:[|｜]\s*)*)?)?)?)?)?$/;
    const incompleteMarker = partial.exec(tail);
    if (incompleteMarker && (!final || /[|｜]/.test(incompleteMarker[0]))) {
        content += tail.slice(0, incompleteMarker.index);
        leaked ||= /[|｜]/.test(incompleteMarker[0]);
    } else content += tail;
    return { content, leaked, recoveredCalls };
}

export async function readChatCompletion(response, { apiKey, signal, onUpdate = () => {} } = {}) {
    if (!(response.headers.get('content-type') || '').includes('text/event-stream')) {
        const data = await response.json();
        const message = data?.choices?.[0]?.message;
        const hasText = typeof message?.content === 'string';
        const markup = splitToolMarkup(hasText ? message.content : '', true);
        if (hasText) message.content = markup.content;
        if (message?.content || message?.reasoning_content) onUpdate(message);
        return { message, usage: data?.usage, leaked: markup.leaked, recoveredCalls: markup.recoveredCalls };
    }
    if (!response.body) throw new Error('模型服务未返回响应流。');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const message = { role: 'assistant', content: '', reasoning_content: '' };
    const calls = new Map();
    let usage;
    let buffer = '';
    let rawContent = '';
    let complete = false;
    let stopped = false;

    function applyLine(line) {
        const payload = line.startsWith('data:') ? line.slice(5).trim() : line.trim();
        if (payload === '[DONE]') { complete = true; return; }
        if (!payload.startsWith('{')) return;
        let data;
        try { data = JSON.parse(payload); } catch { return; }
        if (data.error || (data.code && data.message)) {
            const error = String(data.error?.message || data.message || '模型服务返回错误。');
            throw new Error((apiKey ? error.replaceAll(apiKey, '[已隐藏]') : error).slice(0, 500));
        }
        if (data.usage) usage = data.usage;
        const delta = data.choices?.[0]?.delta || data.choices?.[0]?.message;
        if (!delta) return;
        if (typeof delta.content === 'string') rawContent += delta.content;
        if (typeof delta.reasoning_content === 'string') message.reasoning_content += delta.reasoning_content;
        for (const [position, fragment] of (delta.tool_calls || []).entries()) {
            const index = fragment.index ?? position;
            const call = calls.get(index) || { id: '', type: 'function', function: { name: '', arguments: '' } };
            if (fragment.id) call.id += fragment.id;
            if (fragment.function?.name) call.function.name += fragment.function.name;
            if (fragment.function?.arguments) call.function.arguments += fragment.function.arguments;
            calls.set(index, call);
        }
    }

    try {
        while (!complete) {
            const { done, value } = await reader.read();
            const previousRaw = rawContent;
            const text = message.content;
            const reasoning = message.reasoning_content;
            if (done) applyLine(buffer + decoder.decode());
            else {
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    applyLine(line);
                    if (complete) break;
                }
            }
            if (rawContent !== previousRaw) message.content = splitToolMarkup(rawContent, false).content;
            if (message.content !== text || message.reasoning_content !== reasoning) onUpdate(message);
            if (done) break;
        }
    } catch (error) {
        if (!signal?.aborted || signal.reason?.name !== 'AbortError' || !message.content) throw error;
        stopped = true;
    } finally {
        void reader.cancel().catch(() => {});
        reader.releaseLock();
    }
    if (calls.size && !stopped) {
        message.tool_calls = [...calls.entries()].sort(([a], [b]) => a - b).map(([, call]) => call);
    }
    const markup = splitToolMarkup(rawContent, !stopped);
    if (message.content !== markup.content) {
        message.content = markup.content;
        onUpdate(message);
    }
    return { message, usage, stopped, leaked: markup.leaked, recoveredCalls: markup.recoveredCalls };
}
