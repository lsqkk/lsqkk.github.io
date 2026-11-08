import {createDesk} from './reading-desk-store.mjs';
import {recentReading,resumeHref} from './reading-position.mjs';
const desk=createDesk();
function sync() {
  const data=desk.read(),waiting=data.queue.filter(item=>!item.completed),recent=recentReading();
  for(const el of document.querySelectorAll('[data-desk-home-summary]')) {
    el.replaceChildren();el.hidden=!recent&&!waiting.length&&!data.clips.length;
    if(el.hidden)continue;
    const a=document.createElement('a');
    a.href=recent?.href||(waiting.length?resumeHref(waiting[0].url):'/desk/#notes');
    a.textContent=recent||waiting.length?'接着读 · '+(recent?.title||waiting[0].title):'回到我的 '+data.clips.length+' 条摘录';
    const small=document.createElement('span');
    small.textContent=waiting.length+' 篇待读 / '+data.clips.length+' 条摘录';
    el.append(a,small);
  }
}
sync();window.addEventListener('storage',sync);window.addEventListener('quark:desk-updated',sync);
