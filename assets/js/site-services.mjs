import { mountNotices } from './site-notices.mjs';
import { loadScript } from './load-script.mjs';

const style = document.createElement('link');
style.rel = 'stylesheet';
style.href = '/assets/css/site-services.css';
const stylesReady = new Promise((resolve) => {
    style.addEventListener('load', resolve, { once: true });
    style.addEventListener('error', resolve, { once: true });
    document.head.append(style);
});

await Promise.all([
    stylesReady,
    loadScript('/assets/js/user-preferences.js', 'QuarkUserPreferences').catch(() => {})
]);

const fallback = document.createElement('button');
fallback.className = 'quark-notice-launcher';
fallback.type = 'button';
fallback.title = '通知中心';
fallback.setAttribute('aria-label', '通知中心');
fallback.dataset.quarkNoticeOpen = '';
fallback.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg><span class="quark-notice-dot" hidden></span>';
document.body.append(fallback);

document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest?.('.quark-site-dialog[open] a[href]');
    if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download')) return;
    if (link.hash && link.origin === location.origin && link.pathname === location.pathname && link.search === location.search) {
        link.closest('dialog').close();
    }
});

mountNotices();
const { mountBot } = await import('./quarkbot.mjs');
mountBot({ loadScript });
