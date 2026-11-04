import {createDesk,toMarkdown} from './reading-desk-store.mjs';
const desk=createDesk();
const {articles,routes}=JSON.parse(document.getElementById('desk-data').textContent);
const $=id=>document.getElementById(id);
const make=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;};
const groups={build:/开发|后端|前端|网站|域名|WebRTC|C\+\+|数码|香橙派/,science:/物理|机器学习|自动化|AI|摄影|构成主义/,human:/杂谈|书评|哲学|教育|音乐|史政|高考|志愿|随笔/};
let topic='all',offset=0,timer;
const budget=$('desk-time');
const requested=Number(new URLSearchParams(location.search).get('time'));
if(requested>=3&&requested<=35)budget.value=String(Math.round(requested));
function status(message,undo) {
  const el=$('desk-status');el.replaceChildren(document.createTextNode(message));el.hidden=false;
  if(undo){const button=make('button','','撤销');button.type='button';button.addEventListener('click',()=>{undo();el.hidden=true;});el.append(button);}
  clearTimeout(timer);timer=setTimeout(()=>el.hidden=true,8000);
}
function save(ok,message){status(ok?message:desk.error);return ok;}
function action(text,label,fn) {
  const button=make('button','',text);button.dataset.focusKey=label;button.type='button';button.setAttribute('aria-label',label);button.addEventListener('click',fn);return button;
}
function matches() {
  $('desk-time-value').value=budget.value;
  const data=desk.read(),completed=new Set(data.queue.filter(p=>p.completed).map(p=>p.url.split('#')[0]));
  const filtered=articles.filter(post=>(topic==='all'||groups[topic].test(post.tags.join(' ')))&&!completed.has(post.url));
  const candidates=filtered.filter(post=>post.minutes<=Number(budget.value)).sort((a,b)=>b.minutes-a.minutes||a.file.localeCompare(b.file));
  offset=Math.min(offset,Math.max(0,Math.floor((candidates.length-1)/3)*3));
  const list=$('desk-matches');list.replaceChildren();
  if(!candidates.length) {
    const message=make('p','desk-queue-empty','这个主题暂时没有适合当前时间的未读文章。');
    const nearest=filtered.length?Math.min(...filtered.map(p=>p.minutes)):0;
    if(nearest>Number(budget.value)&&nearest<=35) {
      message.append(action('留出 '+nearest+' 分钟 →','把阅读时间调到 '+nearest+' 分钟',()=>{budget.value=nearest;offset=0;matches();}));
    } else message.append(action('换个方向看看','清除兴趣筛选',()=>document.querySelector('[data-topic="all"]').click()));
    list.append(message);
  }
  for(const post of candidates.slice(offset,offset+3)) {
    const row=make('article','desk-match'),time=make('div','desk-match-time',String(post.minutes).padStart(2,'0'));
    time.append(make('small','','MIN'));row.append(time);
    const body=make('div'),heading=make('h3'),link=make('a','',post.title);link.href=post.url;heading.append(link);body.append(heading);
    body.append(make('p','',post.description));
    const meta=make('div','desk-match-meta');meta.append(make('span','',post.tags.slice(0,2).join(' / ')),make('span','','约 '+post.minutes+' 分钟 · '+(Number(budget.value)-post.minutes?'留有余量':'刚好一篇')));body.append(meta);row.append(body);
    const saved=data.queue.some(item=>item.url.split('#')[0]===post.url);
    const button=action(saved?'✓':'+',(saved?'移出':'加入')+'待读：'+post.title,()=>{save(desk.toggle(post),saved?'已移出待读清单':'已加入待读清单');});
    button.dataset.focusKey='match:'+post.url;button.setAttribute('aria-pressed',String(saved));row.append(button);list.append(row);
  }
  $('desk-match-status').textContent=candidates.length+' 篇适合此刻 · 每篇时长独立估算，实践请额外留时';
  $('desk-shuffle').disabled=candidates.length<=3;
}
function queue() {
  const data=desk.read(),waiting=data.queue.filter(item=>!item.completed),list=$('desk-queue-list');
  $('desk-queue-count').textContent=String(waiting.length).padStart(2,'0');
  $('desk-queue-summary').textContent=waiting.length?waiting.length+' 篇待读 · 合计约 '+waiting.reduce((sum,item)=>sum+item.minutes,0)+' 分钟'+(data.queue.length>waiting.length?' · '+(data.queue.length-waiting.length)+' 篇已读':''):'给下一次打开博客，留一个入口。';
  list.replaceChildren();
  if(!data.queue.length){const empty=make('div','desk-queue-empty');empty.append(make('span','','⌑'),document.createTextNode('还没有放下书签。点文章旁的 +，或收下一整条路线。'));list.append(empty);}
  data.queue.forEach((post,index)=>{
    const row=make('article','desk-queue-item'+(post.completed?' is-complete':'')),link=make('a','',post.title);link.href=post.url;row.append(link,make('small','',post.completed?'已读完':'约 '+post.minutes+' 分钟'));
    const controls=make('div','desk-queue-controls');
    const complete=action(post.completed?'重新待读':'标为读完',(post.completed?'重新待读：':'标为读完：')+post.title,()=>{if(!desk.complete(post.url))status(desk.error);});
    complete.dataset.focusKey='complete:'+post.url;complete.setAttribute('aria-pressed',String(post.completed));controls.append(complete);
    for(const [text,delta,label] of [['↑',-1,'上移'],['↓',1,'下移']]) {
      const button=action(text,label+'：'+post.title,()=>{if(!desk.move(post.url,delta))status(desk.error);});button.disabled=delta<0?index===0:index===data.queue.length-1;controls.append(button);
    }
    controls.append(action('移除','移除：'+post.title,()=>save(desk.toggle(post),'已移出清单')));row.append(controls);list.append(row);
  });
}
function notes() {
  const data=desk.read(),list=$('desk-notes-list');list.replaceChildren();
  document.querySelector('[data-note-count]').textContent=data.clips.length;
  if(!data.clips.length){
    const empty=make('div','desk-note-empty'),body=make('div');empty.append(make('span','','“'));
    body.append(make('h3','','让一句话，成为下一次思考的起点。'));
    const p=make('p','','在文章中选中一段文字，点「摘录到拾页」，再回到这里写下想法。');
    const a=make('a','','从一篇文章开始 ↗');a.href='/posts/2025/2514';p.append(document.createElement('br'),a);body.append(p);empty.append(body);list.append(empty);return;
  }
  for(const clip of data.clips) {
    const row=make('article','desk-note'),source=make('div');source.append(make('blockquote','',clip.text));
    const link=make('a','desk-note-source','出自 '+clip.title+' ↗');link.href=clip.url;source.append(link);
    const thought=make('div','desk-note-thought'),label=make('label','','此刻，我想到……');label.htmlFor=clip.id;
    const input=make('textarea');input.id=clip.id;input.value=clip.note;input.maxLength=4000;input.placeholder='和某段经历、另一个问题，或者另一篇文章的联系。';
    const bottom=make('div','desk-note-bottom'),saved=make('span','',clip.note?'已保存在此浏览器':'只对你自己可见');
    input.addEventListener('input',()=>{const ok=desk.note(clip.id,input.value);saved.textContent=ok?'已保存在此浏览器':'保存失败，请复制保留文字';if(!ok)status(desk.error);});
    bottom.append(saved,action('移除摘录','移除摘录：'+clip.title,()=>{
      if(desk.removeClip(clip.id)){notes();status('已移除摘录',()=>{desk.import({version:1,queue:[],clips:[clip]});notes();});}else status(desk.error);
    }));
    thought.append(label,input,bottom);row.append(source,thought);list.append(row);
  }
}
function refresh(){const active=document.activeElement,key=active?.dataset.focusKey;matches();queue();document.querySelector('[data-note-count]').textContent=desk.read().clips.length;if(key){const next=[...document.querySelectorAll('[data-focus-key]')].find(el=>el.dataset.focusKey===key);if(next&&!next.disabled)next.focus({preventScroll:true});else if(active.closest('.desk-queue-controls'))document.getElementById('queue-title').focus({preventScroll:true});}}
budget.addEventListener('input',()=>{offset=0;matches();});
document.querySelectorAll('[data-topic]').forEach(button=>button.addEventListener('click',()=>{
  topic=button.dataset.topic;offset=0;document.querySelectorAll('[data-topic]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));matches();
}));
$('desk-shuffle').addEventListener('click',()=>{
  const count=articles.filter(post=>(topic==='all'||groups[topic].test(post.tags.join(' ')))&&post.minutes<=Number(budget.value)&&!desk.read().queue.some(item=>item.completed&&item.url.split('#')[0]===post.url)).length;
  offset=offset+3>=count?0:offset+3;matches();
});
document.querySelectorAll('[data-add-path]').forEach(button=>button.addEventListener('click',()=>{
  const route=routes.find(route=>route.id===button.dataset.addPath);
  save(desk.add(route.steps.map(step=>step.post)),'已收下「'+route.title+'」，已有书签不会重复加入');
}));
function download(content,name,type) {
  const url=URL.createObjectURL(new Blob([content],{type})),a=make('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('desk-export-md').addEventListener('click',()=>{
  const data=desk.read();if(!data.queue.length&&!data.clips.length){status('先留下一篇文章或一段摘录，再导出手记。');return;}
  download(toMarkdown(data,location.origin),'拾页-阅读手记.md','text/markdown;charset=utf-8');status('手记已导出，包含原文出处。');
});
$('desk-export-json').addEventListener('click',()=>{download(JSON.stringify(desk.read(),null,2),'拾页-备份.json','application/json');status('备份已导出，换设备后可导入。');});
$('desk-import').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;
  try {if(file.size>1024*1024)throw new Error('文件过大，请选择小于 1 MB 的拾页备份。');const ok=desk.import(JSON.parse(await file.text()));save(ok,'已合并备份，重复内容自动跳过');if(ok){refresh();notes();}}
  catch(error){status(error instanceof SyntaxError?'无法读取 JSON 文件，请选择拾页导出的备份。':error.message);}
  finally {event.target.value='';}
});
window.addEventListener('quark:desk-updated',refresh);
window.addEventListener('storage',event=>{if(event.key==='quark.reading-desk.v1'||event.key===null){refresh();if(document.activeElement?.tagName!=='TEXTAREA')notes();else status('另一页更新了拾页。完成当前编辑后刷新可查看。');}});
refresh();notes();
