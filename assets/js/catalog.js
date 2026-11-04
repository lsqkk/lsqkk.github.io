(() => {
  const root = document.querySelector('.catalog-page');
  if (!root) return;
  const toolbar = root.querySelector('[data-catalog-toolbar]');
  const input = root.querySelector('[data-catalog-search]');
  const result = root.querySelector('[data-catalog-result]');
  const empty = root.querySelector('[data-catalog-empty]');
  const sections = [...root.querySelectorAll('[data-catalog-section]')];
  const categories = [...root.querySelectorAll('[data-category]')];
  const cards = [...root.querySelectorAll('[data-catalog-card]')];
  const clear = root.querySelector('[data-catalog-clear]');
  let selected = 'all';
  const validCategories = new Set(categories.map(link => link.dataset.category));
  toolbar.hidden = false;
  function filter(syncUrl = true) {
    const terms = input.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    categories.find(link => link.dataset.category === 'all').querySelector('span').textContent = String(cards.filter(card => terms.every(term => card.dataset.search.includes(term))).length);
    let count = 0;
    for (const section of sections) {
      let matches = 0;
      for (const card of section.querySelectorAll('[data-catalog-card]')) {
        const visible = (selected === 'all' || selected === section.id) && terms.every(term => card.dataset.search.includes(term));
        card.hidden = !visible;
        card.closest('[data-catalog-item]').hidden = !visible;
        if (visible) matches++;
      }
      section.hidden = matches === 0;
      const matchedByQuery = [...section.querySelectorAll('[data-catalog-card]')].filter(card => terms.every(term => card.dataset.search.includes(term))).length;
      const categoryLink = categories.find(link => link.dataset.category === section.id);
      categoryLink.querySelector('span').textContent = String(matchedByQuery);
      section.querySelector('h2 span').textContent = String(matches).padStart(2, '0');
      count += matches;
    }
    for (const link of categories) {
      if (link.dataset.category === selected) link.setAttribute('aria-current','true');
      else link.removeAttribute('aria-current');
    }
    result.textContent = count === cards.length ? '共 ' + count + ' 项' : '找到 ' + count + ' / ' + cards.length + ' 项';
    empty.hidden = count > 0;
    clear.hidden = !input.value;
    if (syncUrl) {
      const url = new URL(location.href);
      input.value.trim() ? url.searchParams.set('q', input.value.trim()) : url.searchParams.delete('q');
      selected !== 'all' ? url.searchParams.set('category', selected) : url.searchParams.delete('category');
      history.replaceState(null,'',url);
    }
  }
  function restore() {
    const params = new URLSearchParams(location.search);
    input.value = params.get('q') || '';
    const category = params.get('category');
    selected = validCategories.has(category) ? category : 'all';
    filter(false);
  }
  input.addEventListener('input', () => filter());
  clear.addEventListener('click', () => { input.value = ''; filter(); input.focus(); });
  for (const link of categories) link.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    selected = link.dataset.category;
    filter();
  });
  root.querySelector('[data-catalog-reset]').addEventListener('click', () => {
    input.value = ''; selected = 'all'; filter(); input.focus();
  });
  document.addEventListener('keydown', event => {
    const target = event.target;
    if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !(target instanceof HTMLElement && (target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(target.tagName)))) {
      event.preventDefault(); input.focus();
    }
    if (event.key === 'Escape' && document.activeElement === input) { input.value = ''; filter(); }
  });
  window.addEventListener('popstate',restore);
  restore();
})();
