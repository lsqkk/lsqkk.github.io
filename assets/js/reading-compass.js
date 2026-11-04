/* Local-only reading aids. No network, no automatic page jumps. */
(() => {
  function init() {
    const content = document.querySelector('.post-content');
    if (!content || document.querySelector('.reading-compass')) return;
    const headings = [...content.querySelectorAll('h1,h2,h3,h4')].filter(el => el.getClientRects().length);
    headings.forEach((el, index) => { if (!el.id) el.id = 'reading-section-' + index; });
    const primary = headings.filter(el => el.tagName === 'H2');
    const chapters = primary.length ? primary : headings;
    const storageKey = 'quark:reading:' + location.pathname;
    const reduced = () => matchMedia('(prefers-reduced-motion:reduce)').matches || document.documentElement.dataset.motion === 'reduce';
    const go = el => el.scrollIntoView({ behavior: reduced() ? 'instant' : 'smooth', block:'start' });
    const toolbar = document.createElement('section');
    toolbar.className = 'reading-compass';
    toolbar.setAttribute('aria-label', '阅读路标');
    toolbar.innerHTML = '<div class="reading-compass-meta"><span class="reading-position">开始阅读</span><div class="reading-controls"><span class="reading-percent" aria-label="阅读进度">0%</span><button class="reading-measure" type="button" aria-pressed="false" title="切换为更短的正文行宽">收窄行宽</button></div></div>';
    const ruler = document.createElement('nav');
    ruler.className = 'chapter-ruler';
    ruler.setAttribute('aria-label','按章节跳转');
    const links = chapters.map((el, index) => {
      const link = document.createElement('a');
      link.href = '#' + encodeURIComponent(el.id);
      link.className = 'chapter-tick';
      link.title = `${index + 1}. ${el.textContent}`;
      link.setAttribute('aria-label', link.title);
      link.addEventListener('click', event => {
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault(); go(el); history.replaceState(null,'',link.hash);
        el.tabIndex = -1; el.focus({preventScroll:true});
      });
      ruler.append(link);
      return link;
    });
    if (chapters.length > 1) toolbar.append(ruler);
    content.before(toolbar);

    // One explicit stitch back into the last session, stored for this tab only.
    let previous;
    try { previous = JSON.parse(sessionStorage.getItem(storageKey) || 'null'); } catch { /* storage may be disabled */ }
    let savedHeading = previous && headings.find(el => el.id === previous.id && el.textContent === previous.title);
    if (savedHeading && !location.hash && previous.progress > 3 && previous.progress < 98) {
      const seam = document.createElement('div');
      seam.className = 'reading-seam';
      const resume = document.createElement('button');
      resume.type = 'button';
      resume.textContent = `接着读 · ${savedHeading.textContent}`;
      resume.title = '回到此标签页上次阅读的位置';
      resume.addEventListener('click', () => { go(savedHeading); seam.remove(); });
      const dismiss = document.createElement('button');
      dismiss.type = 'button'; dismiss.textContent = '×'; dismiss.setAttribute('aria-label','忽略上次阅读位置');
      dismiss.addEventListener('click', () => { seam.remove(); try { sessionStorage.removeItem(storageKey); } catch {} });
      seam.append(resume,dismiss); toolbar.append(seam);
    }
    const measure = toolbar.querySelector('.reading-measure');
    measure.addEventListener('click', () => {
      const narrow = !document.body.classList.contains('reading-narrow');
      const before = toolbar.getBoundingClientRect().top;
      document.body.classList.toggle('reading-narrow', narrow);
      measure.setAttribute('aria-pressed', String(narrow));
      measure.textContent = narrow ? '舒展行宽' : '收窄行宽';
      measure.title = narrow ? '恢复正文默认行宽' : '切换为更短的正文行宽';
      window.scrollBy({top:toolbar.getBoundingClientRect().top-before,behavior:'instant'});
      schedule();
    });

    let progress = 0, active = null, frame = 0, lastSaved = 0;
    function save() {
      if (!active || scrollY <= 240 || progress < 3 || progress >= 98) {
        if (progress >= 98) { try { sessionStorage.removeItem(storageKey); } catch {} }
        return;
      }
      try { sessionStorage.setItem(storageKey,JSON.stringify({id:active.id,title:active.textContent,progress})); } catch {}
    }
    function update() {
      frame = 0;
      const rect = content.getBoundingClientRect();
      const start = rect.top + scrollY;
      const end = start + rect.height;
      const position = scrollY + Math.min(innerHeight * .3, 160);
      const readEdge = scrollY + innerHeight;
      progress = Math.round(Math.max(0,Math.min(1,(readEdge-start)/Math.max(rect.height,1)))*100);
      active = headings[0] || null;
      headings.forEach(el => { if (el.getBoundingClientRect().top <= 160) active = el; });
      const chapterIndex = chapters.reduce((current,el,index) => el.getBoundingClientRect().top <= 160 ? index : current,0);
      toolbar.querySelector('.reading-position').textContent = chapters.length ? `${String(chapterIndex+1).padStart(2,'0')} / ${String(chapters.length).padStart(2,'0')} · ${chapters[chapterIndex].textContent}` : '正文';
      toolbar.querySelector('.reading-percent').textContent = progress + '%';
      links.forEach((link,index) => {
        const sectionStart = chapters[index].getBoundingClientRect().top + scrollY;
        const sectionEnd = chapters[index+1] ? chapters[index+1].getBoundingClientRect().top + scrollY : end;
        const fraction = Math.max(0,Math.min(1,(position-sectionStart)/Math.max(sectionEnd-sectionStart,1)));
        link.style.setProperty('--chapter-read', (fraction*100)+'%');
        if (index===chapterIndex) link.setAttribute('aria-current','location'); else link.removeAttribute('aria-current');
      });
      if (scrollY > 240 && Date.now()-lastSaved > 1500) { save(); lastSaved=Date.now(); }
    }
    function schedule() { if (!frame) frame=requestAnimationFrame(update); }
    window.addEventListener('scroll',schedule,{passive:true});
    window.addEventListener('resize',schedule,{passive:true});
    window.addEventListener('pagehide',save);
    document.addEventListener('visibilitychange',()=> { if(document.hidden) save(); });
    new ResizeObserver(schedule).observe(content);
    document.fonts?.ready.then(schedule);
    update();

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
