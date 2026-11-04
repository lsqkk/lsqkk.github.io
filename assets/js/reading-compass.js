/* Local-only reading aids. No network, no automatic page jumps. */
(() => {
  function init() {
    const content = document.querySelector('.post-content');
    if (!content || document.querySelector('.reading-compass')) return;
    const toolbar = document.createElement('div');
    toolbar.className = 'reading-compass';
    toolbar.innerHTML = '<button class="reading-measure" type="button" aria-pressed="false" title="切换为更短的正文行宽">收窄行宽</button>';
    const tools = document.querySelector('[data-post-reading-tools]');
    if (tools) {
      tools.append(toolbar);
      const wide = matchMedia('(min-width:1101px)');
      const place = () => {
        const focused = tools.contains(document.activeElement) ? document.activeElement : null;
        if (wide.matches) document.querySelector('.post-sidebar-scroll')?.prepend(tools);
        else content.before(tools);
        focused?.focus({preventScroll:true});
      };
      wide.addEventListener('change',place); place();
    } else content.before(toolbar);
    const measure = toolbar.querySelector('.reading-measure');
    measure.addEventListener('click', () => {
      const before = toolbar.getBoundingClientRect().top;
      const narrow = document.body.classList.toggle('reading-narrow');
      measure.setAttribute('aria-pressed', String(narrow));
      measure.textContent = narrow ? '舒展行宽' : '收窄行宽';
      measure.title = narrow ? '恢复正文默认行宽' : '切换为更短的正文行宽';
      window.scrollBy({top:toolbar.getBoundingClientRect().top-before,behavior:'instant'});
    });

    // A ruler appears only for actual horizontal overflow, independently of page scroll.
    const observed = new WeakSet();
    function addOverflowGuides() {
      content.querySelectorAll('pre,.table-scroll').forEach(scroller => {
        if (observed.has(scroller)) return;
        observed.add(scroller);
        const cue = document.createElement('div');
        cue.className = 'overflow-guide'; cue.hidden = true;
        cue.innerHTML = '<span>横向内容</span><span class="overflow-distance"></span>';
        scroller.after(cue);
        const sync = () => {
          const max = scroller.scrollWidth-scroller.clientWidth;
          cue.hidden = max <= 2;
          if (max <= 2) return;
          scroller.tabIndex = 0;
          scroller.setAttribute('role','region');
          scroller.setAttribute('aria-label',scroller.tagName === 'PRE' ? '代码，可左右滚动' : '表格，可左右滚动');
          const ratio = Math.max(0,Math.min(1,scroller.scrollLeft/max));
          cue.style.setProperty('--overflow-read',(ratio*100)+'%');
          cue.querySelector('.overflow-distance').textContent = ratio >= .99 ? '已到右端 ←' : ratio <= .01 ? '向右滑动 →' : '← 左右滑动 →';
        };
        scroller.addEventListener('scroll',sync,{passive:true});
        const resize = new ResizeObserver(sync);
        resize.observe(scroller);
        if (scroller.firstElementChild) resize.observe(scroller.firstElementChild);
        window.addEventListener('load',sync,{once:true});
        sync();
      });
    }
    addOverflowGuides();
    // Tables/headers can be enhanced by another deferred script after this one.
    const mutations = new MutationObserver(addOverflowGuides);
    mutations.observe(content,{childList:true,subtree:true});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();
