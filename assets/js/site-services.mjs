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
