/* One browser-local key; no account or network required. */
export const STORAGE_KEY = 'quark.reading-desk.v1';
export const minutes = words => Math.max(1, Math.ceil((Number(words) || 0) / 400));
const empty = () => ({version:1, queue:[], clips:[]});
const short = (value, max=300) => typeof value === 'string' ? value.slice(0,max) : '';
export function postURL(value) {
  try {
    if (typeof value !== 'string' || value.includes('\\')) return '';
    const origin = globalThis.location?.origin || 'https://reading.invalid';
    const url = new URL(value, origin);
    if (url.origin !== origin || !/^\/posts\/[^?#\\]+$/.test(url.pathname)) return '';
    return url.pathname.replace(/\/$/, '') + url.hash;
  } catch { return ''; }
}
export function normalize(raw) {
  if (!raw || raw.version !== 1 || !Array.isArray(raw.queue) || !Array.isArray(raw.clips)) throw new Error('这不是拾页 v1 备份文件');
  const queue = new Map(), clips = new Map();
  for (const item of raw.queue.slice(0,200)) {
    const url = postURL(item?.url);
    if (!url || !short(item.title)) continue;
    queue.set(url.split('#')[0], {url, title:short(item.title), minutes:Math.max(1,Math.min(999,Number(item.minutes)||1)), completed:!!item.completed});
  }
  for (const item of raw.clips.slice(0,500)) {
    const url = postURL(item?.url), text = short(item?.text,4000);
    if (!url || !text || !short(item.title)) continue;
    const key = url + '\n' + text;
    if (!clips.has(key)) clips.set(key, {id:'clip-'+clips.size+'-'+Math.random().toString(36).slice(2,10),url,title:short(item.title),text,note:short(item.note,4000)});
  }
  return {version:1,queue:[...queue.values()],clips:[...clips.values()]};
}
export function readDesk(storage, strict=false) {
  try {
    const raw = (storage || globalThis.localStorage).getItem(STORAGE_KEY);
    if (!raw) return empty();
    const data = JSON.parse(raw), clean = normalize(data);
    for (const clip of clean.clips) {
      const original = data.clips.find(item => postURL(item?.url) === clip.url && short(item?.text,4000) === clip.text);
      if (/^[\w-]{1,100}$/.test(original?.id || '')) clip.id = original.id;
    }
    return clean;
  } catch (error) { if(strict)throw new SyntaxError('已有拾页数据无法读取，已停止写入以保留原数据。'); return empty(); }
}
export function createDesk(storage) {
  let storageError = '';
  function read() { return readDesk(storage); }
  function update(change) {
    try {
      const target = storage || globalThis.localStorage, data = readDesk(target,true);
      change(data);
      target.setItem(STORAGE_KEY,JSON.stringify(data));
      storageError = '';
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('quark:desk-updated'));
      return true;
    } catch (error) { storageError = error instanceof SyntaxError || error instanceof RangeError ? error.message : '浏览器未能保存。请检查存储权限或空间，原有数据未被清空。'; return false; }
  }
  return {
    read, get error() { return storageError; },
    toggle(post) {
      const url = postURL(post.url); if (!url) return false;
      return update(data => {
        const index = data.queue.findIndex(item=>item.url.split('#')[0]===url.split('#')[0]);
        if (index>=0) data.queue.splice(index,1);
        else {
          if (data.queue.length>=200) throw new RangeError('待读或摘录数量已达上限，请先导出备份并移除不再需要的内容。');
          data.queue.push({url,title:short(post.title),minutes:post.minutes||1,completed:false});
        }
      });
    },
    add(posts) {return update(data=>{for(const post of posts){const url=postURL(post.url);if(url&&!data.queue.some(item=>item.url.split('#')[0]===url.split('#')[0])){if(data.queue.length>=200)throw new RangeError('待读或摘录数量已达上限，请先导出备份并移除不再需要的内容。');data.queue.push({url,title:short(post.title),minutes:post.minutes||1,completed:false});}}});},
    complete(url) { return update(data=>{const item=data.queue.find(item=>item.url===url); if(item)item.completed=!item.completed;}); },
    move(url,direction) { return update(data=>{const from=data.queue.findIndex(item=>item.url===url),to=from+direction;if(from>=0&&to>=0&&to<data.queue.length)[data.queue[from],data.queue[to]]=[data.queue[to],data.queue[from]];}); },
    clip(item) {
      const url=postURL(item.url), text=short(item.text,4000).trim();
      if(!url || !text) return false;
      return update(data=>{
        if(data.clips.some(clip=>clip.url===url&&clip.text===text))return;
        if(data.clips.length>=500)throw new RangeError('待读或摘录数量已达上限，请先导出备份并移除不再需要的内容。');
        data.clips.unshift({id:'clip-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8),url,title:short(item.title),text,note:''});
      });
    },
    note(id,note) {return update(data=>{const item=data.clips.find(clip=>clip.id===id);if(item)item.note=short(note,4000);});},
    removeClip(id) {return update(data=>{data.clips=data.clips.filter(clip=>clip.id!==id);});},
    import(raw) {
      let incoming;
      try { incoming=normalize(raw); } catch { storageError='文件格式不正确，请选择拾页导出的 JSON 备份。';return false; }
      return update(data=>{
        for(const item of incoming.queue)if(!data.queue.some(old=>old.url.split('#')[0]===item.url.split('#')[0])&&data.queue.length<200)data.queue.push(item);
        for(const item of incoming.clips)if(!data.clips.some(old=>old.url===item.url&&old.text===item.text)&&data.clips.length<500)data.clips.push(item);
      });
    }
  };
}
export function toMarkdown(data, origin) {
  const lines=['# 拾页 · 阅读手记',''];
  if(data.queue.length)lines.push('## 阅读清单','',...data.queue.map(item=>'- ['+(item.completed?'x':' ')+'] ['+md(item.title)+']('+new URL(item.url,origin).href+') · 约 '+item.minutes+' 分钟'),'');
  if(data.clips.length) {
    lines.push('## 摘录与想法','');
    for(const item of data.clips) {
      lines.push('### '+md(item.title),'',...item.text.split('\n').map(line=>'> '+line),'','出处：['+md(item.title)+']('+new URL(item.url,origin).href+')','');
      if(item.note)lines.push('我的想法：','',item.note,'');
    }
  }
  return lines.join('\n');
}
function md(value) {return value.replace(/[\[\]\\*\x60_<>]/g,'\\$&');}
