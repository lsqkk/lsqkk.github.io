export async function readChatCompletion(response, { apiKey, signal, onUpdate = () => {} } = {}) {
    if (!(response.headers.get('content-type') || '').includes('text/event-stream')) {
        const data = await response.json();
        const message = data?.choices?.[0]?.message;
        if (message?.content || message?.reasoning_content) onUpdate(message);
        return { message, usage: data?.usage };
    }
    if (!response.body) throw new Error('模型服务未返回响应流。');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const message = { role: 'assistant', content: '', reasoning_content: '' };
    const calls = new Map();
    let usage;
    let buffer = '';
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
        if (typeof delta.content === 'string') message.content += delta.content;
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
    return { message, usage, stopped };
}
