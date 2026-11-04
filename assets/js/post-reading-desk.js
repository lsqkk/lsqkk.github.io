import {createDesk,minutes} from './reading-desk-store.mjs';
const desk=createDesk(),meta=document.getElementById('post-tags-container'),content=document.querySelector('.post-content');
if(meta&&content) {
  const post={url:'/posts/'+String(meta.dataset.postPath||location.pathname).replace(/^\/?posts\//,'').replace(/^\/+|\.md$/g,''),title:meta.dataset.postTitle,minutes:minutes(meta.dataset.wordCount)};
  const bar=document.createElement('div');bar.className='desk-post-bar';
  const save=document.createElement('button');save.type='button';save.textContent='+ 留到下次读';save.setAttribute('aria-pressed','false');
  const clip=document.createElement('button');clip.type='button';clip.textContent='摘录选中文字';clip.title='先在正文选中文字，再点击摘录；手机也可以使用选中后出现的菜单。';
  const link=document.createElement('a');link.href='/desk/';link.textContent='拾页 · 我的阅读桌 ↗';bar.append(save,clip,link);content.before(bar);
  const toast=document.createElement('div');toast.className='desk-post-toast';toast.role='status';toast.setAttribute('aria-live','polite');toast.hidden=true;document.body.append(toast);
  let selected=null,timer;
  function tell(message,success=false){toast.replaceChildren(document.createTextNode(message));if(success){const a=document.createElement('a');a.href='/desk/#notes';a.textContent='写下想法 ↗';toast.append(a);}toast.hidden=false;clearTimeout(timer);timer=setTimeout(()=>toast.hidden=true,6500);}
  function sync(){const saved=desk.read().queue.some(item=>item.url.split('#')[0]===post.url);save.textContent=saved?'✓ 已留到拾页':'+ 留到下次读';save.setAttribute('aria-pressed',String(saved));}
  save.addEventListener('click',()=>{if(!desk.toggle(post))tell(desk.error);else tell(save.getAttribute('aria-pressed')==='true'?'已加入拾页，下次从阅读桌开始。':'已移出待读清单。');});
  clip.addEventListener('mousedown',event=>event.preventDefault());
  function capture() {
    selected=null;
    const selection=window.getSelection();if(!selection?.rangeCount||selection.isCollapsed)return;
    const range=selection.getRangeAt(0);if(!content.contains(range.commonAncestorContainer))return;
    const text=selection.toString().trim();if(!text||text.length>4000){selected=null;return;}
    let currentHeading='';
    const start=range.startContainer.nodeType===1?range.startContainer:range.startContainer.parentElement;
    for(const heading of content.querySelectorAll('h1[id],h2[id],h3[id],h4[id]')) {
      if(heading===start||heading.contains(start)||(heading.compareDocumentPosition(start)&Node.DOCUMENT_POSITION_FOLLOWING))currentHeading=heading.id;
    }
    selected={text,url:post.url+(currentHeading?'#'+encodeURIComponent(currentHeading):'')};
  }
  document.addEventListener('selectionchange',capture);
  function keep(item) {
    if(!item?.text){tell('先在正文中选中一段想留下的文字。');return;}
    const ok=desk.clip({...post,...item});
    tell(ok?'摘录已留在此浏览器。':desk.error,ok);selected=null;window.getSelection()?.removeAllRanges();
  }
  clip.addEventListener('click',()=>keep(selected));
  document.addEventListener('quark:clip-selection',event=>{
    // The existing paragraph menu passes its saved selection, so cloud discussions and local notes share one menu.
    keep({text:event.detail.text,url:selected?.text===event.detail.text?selected.url:post.url});
  });
  window.addEventListener('quark:desk-updated',sync);window.addEventListener('storage',sync);sync();
}
