const scripts = new Map();
export function loadScript(src, globalName) {
    if (window[globalName]) return Promise.resolve();
    if (scripts.has(src)) return scripts.get(src);
    const promise = new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[src="${src}"]`);
        const script = existing || document.createElement('script');
        const timeout = setTimeout(() => {
            if (!existing) script.remove();
            reject(new Error('组件加载超时，请重试。'));
        }, 10000);
        script.addEventListener('load', () => {
            clearTimeout(timeout);
            if (window[globalName]) resolve();
            else reject(new Error('组件加载失败。'));
        }, { once: true });
        script.addEventListener('error', () => {
            clearTimeout(timeout);
            if (!existing) script.remove();
            reject(new Error('组件加载失败。'));
        }, { once: true });
        if (!existing) {
            script.src = src;
            document.head.append(script);
        }
    }).catch((error) => { scripts.delete(src); throw error; });
    scripts.set(src, promise);
    return promise;
}
