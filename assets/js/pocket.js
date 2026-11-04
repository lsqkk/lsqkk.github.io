import { POCKET_KEY, readPocket, changePocket } from './pocket-store.mjs';

const shelf = document.querySelector('[data-pocket-shelf]');
if (shelf) {
  const manifest = JSON.parse(shelf.querySelector('[data-pocket-manifest]').textContent);
  const entries = new Map(manifest.map(item => [item.path, item]));
  const valid = new Set(entries.keys());
  const compact = shelf.dataset.compact === 'true';
  const items = shelf.querySelector('[data-pocket-items]');
  const status = shelf.querySelector('[data-pocket-status]');
  const empty = shelf.querySelector('[data-pocket-empty]');
  const clear = shelf.querySelector('[data-pocket-clear]');
  const disclosure = shelf.closest('[data-pocket-disclosure]');
  const wide = matchMedia('(min-width:1001px)');
  if (disclosure) {
    disclosure.hidden = false;
    disclosure.open = wide.matches;
    wide.addEventListener('change', () => { disclosure.open = wide.matches; });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !wide.matches && disclosure.open) { disclosure.open = false; disclosure.querySelector('summary').focus(); }
    });
    document.addEventListener('click', event => { if (!wide.matches && disclosure.open && !disclosure.contains(event.target) && !event.target.closest('[data-pocket-pin]')) disclosure.open = false; });
  }
  let state = { version: 1, pins: [], recent: [], view: 'grid' };
  let tab = 'pins';
  let readable = true;
  function load() {
    try { state = readPocket(localStorage, valid); readable = true; status.textContent = ''; }
    catch { readable = false; status.textContent = '浏览器存储暂时不可用，随行架未保存。已有数据不会被覆盖。'; }
  }
  function commit(action) {
    if (!readable) { status.textContent = '存储无法读取，暂时不能保存随行架。'; if (disclosure && !wide.matches) disclosure.open = true; return false; }
    try {
      // Re-read before every write so another tab's most recent changes survive.
      const next = changePocket(readPocket(localStorage, valid), action);
      localStorage.setItem(POCKET_KEY, JSON.stringify(next)); state = next;
      status.textContent = ''; render(); return true;
    } catch (error) { status.textContent = error instanceof Error && error.message.includes('8 项') ? error.message : '未能保存，请检查浏览器存储权限或空间。'; if (disclosure && !wide.matches) disclosure.open = true; return false; }
  }
  function render() {
    shelf.hidden = compact && !state.pins.length && !state.recent.length && readable;
    shelf.querySelector('[data-pocket-count]').textContent = `${state.pins.length}/8`;
    if (disclosure) disclosure.querySelector('[data-pocket-summary]').textContent = String(state.pins.length);
    for (const button of shelf.querySelectorAll('[data-pocket-tab]')) button.setAttribute('aria-pressed', String(button.dataset.pocketTab === tab));
    const list = state[tab];
    shelf.dataset.empty = String(!list.length);
    clear.hidden = tab !== 'recent' || !list.length;
    empty.hidden = !!list.length;
    empty.textContent = tab === 'pins' ? '点击入口旁的 ☆，留下你会再次用到的工具、游戏或实验。' : '从目录打开过的入口会出现在这里。记录只留在此浏览器，可随时清除。';
    items.replaceChildren(...list.map(path => {
      const entry = entries.get(path);
      const item = document.createElement('div'); item.className = 'pocket-item';
      const link = document.createElement('a'); link.href = path; link.dataset.pocketVisit = path;
      const label = document.createElement('span'); label.textContent = entry.area;
      const name = document.createElement('strong'); name.textContent = entry.name;
      const arrow = document.createElement('span'); arrow.textContent = '↗'; arrow.setAttribute('aria-hidden', 'true');
      link.append(label, name, arrow); item.append(link);
      if (tab === 'pins') {
        const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×';
        remove.dataset.pocketRemove = path; remove.setAttribute('aria-label', '从随行架移除' + entry.name); item.append(remove);
      }
      return item;
    }));
    for (const button of document.querySelectorAll('[data-pocket-pin]')) {
      const pinned = state.pins.includes(button.dataset.pocketPin);
      button.hidden = false; button.setAttribute('aria-pressed', String(pinned));
      button.textContent = pinned ? '★' : '☆';
      const name = entries.get(button.dataset.pocketPin)?.name || '此入口';
      button.setAttribute('aria-label', (pinned ? '取消收藏' : '收藏') + name);
      button.title = (pinned ? '取消收藏' : '放进随行架') + ' · ' + name;
    }
    const root = document.querySelector('.catalog-page');
    if (root) root.dataset.catalogView = state.view;
    for (const button of document.querySelectorAll('button[data-catalog-view]')) button.setAttribute('aria-pressed', String(button.dataset.catalogView === state.view));
  }
  shelf.addEventListener('click', event => {
    const target = event.target.closest('button'); if (!target) return;
    if (target.dataset.pocketTab) { tab = target.dataset.pocketTab; render(); }
    if (target.hasAttribute('data-pocket-clear')) {
      const before = [...state.recent];
      if (commit({ type: 'clear-recent' })) { status.textContent = '最近打开的记录已清除。'; if (before.length) shelf.querySelector('[data-pocket-tab="recent"]').focus(); }
    }
    if (target.dataset.pocketRemove) {
      const buttons = [...shelf.querySelectorAll('[data-pocket-remove]')]; const index = buttons.indexOf(target);
      if (commit({ type: 'pin', path: target.dataset.pocketRemove })) {
        const next = shelf.querySelectorAll('[data-pocket-remove]');
        (next[Math.min(index, next.length - 1)] || shelf.querySelector('[data-pocket-tab="pins"]')).focus();
      }
    }
  });
  document.addEventListener('click', event => {
    const pin = event.target.closest('[data-pocket-pin]');
    if (pin) { if (commit({ type: 'pin', path: pin.dataset.pocketPin })) status.textContent = state.pins.includes(pin.dataset.pocketPin) ? '已放进随行架，在其他目录和首页也能找到。' : '已移出随行架。'; }
    const view = event.target.closest('button[data-catalog-view]');
    if (view) commit({ type: 'view', view: view.dataset.catalogView });
    recordVisit(event);
  });
  function recordVisit(event) {
    if (event.type === 'auxclick' && event.button !== 1) return;
    const link = event.target.closest('a[data-catalog-card], a[data-pocket-visit]');
    if (!link) return;
    const path = new URL(link.href).pathname.replace(/\/$/, '') || '/';
    if (valid.has(path)) commit({ type: 'visit', path });
  }
  document.addEventListener('auxclick', recordVisit);
  window.addEventListener('storage', event => { if (event.key === POCKET_KEY || event.key === null) { load(); render(); } });
  load(); if (!state.pins.length && state.recent.length) tab = 'recent'; render();
}
