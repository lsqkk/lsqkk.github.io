import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDesk,normalize,postURL,toMarkdown,minutes,STORAGE_KEY} from '../assets/js/reading-desk-store.mjs';
const memory=()=>{const map=new Map();return {getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value)};};
const post={url:'/posts/2026/2601',title:'迁移 [笔记]',minutes:10};
test('queue survives new store instances, reorders and completes without losing other items',()=>{
 const storage=memory(),desk=createDesk(storage);
 assert.equal(desk.toggle(post),true);desk.add([post,{...post,url:'/posts/2026/2604',title:'iPad'}]);
 assert.equal(desk.read().queue.length,2);
 desk.move(post.url,1);assert.equal(desk.read().queue[1].url,post.url);
 createDesk(storage).complete(post.url);assert.equal(desk.read().queue[1].completed,true);
 desk.toggle(post);assert.equal(desk.read().queue.length,1);
});
test('clips deduplicate, keep stable IDs and preserve private notes through backup merge',()=>{
 const storage=memory(),desk=createDesk(storage),clip={...post,url:post.url+'#chapter',text:'原文\n下一行'};
 desk.clip(clip);desk.clip(clip);assert.equal(desk.read().clips.length,1);
 const id=desk.read().clips[0].id;desk.note(id,'<script>只是文字</script>');
 assert.equal(desk.read().clips[0].id,id);assert.equal(desk.read().clips[0].note,'<script>只是文字</script>');
 const other=createDesk(memory());assert(other.import(desk.read()));assert(other.import(desk.read()));
 assert.equal(other.read().clips.length,1);assert.equal(other.read().clips[0].note,'<script>只是文字</script>');
});
test('foreign origins and executable or malformed URLs are discarded',()=>{
 for(const url of ['javascript:alert(1)','https://evil.example/posts/test','//evil.example/posts/test','/tool/test','/posts/../tool/test','/posts/test\\evil'])assert.equal(postURL(url),'');
 const clean=normalize({version:1,queue:[{...post,url:'javascript:alert(1)'},post],clips:[null]});
 assert.equal(clean.queue.length,1);assert.equal(clean.clips.length,0);
 assert.throws(()=>normalize({version:2,queue:[],clips:[]}));
});
test('failed storage writes do not report success or replace existing data',()=>{
 const storage=memory(),desk=createDesk(storage);desk.add([post]);
 const old=storage.getItem(STORAGE_KEY);storage.setItem=()=>{throw new Error('QuotaExceeded');};
 assert.equal(desk.clip({...post,text:'test'}),false);assert.match(desk.error,/未能保存/);assert.equal(storage.getItem(STORAGE_KEY),old);
});
test('Markdown carries queue state, quotes, notes and original source anchors',()=>{
 const desk=createDesk(memory());desk.add([post]);desk.complete(post.url);desk.clip({...post,url:post.url+'#one',text:'原文\n第二行'});
 desk.note(desk.read().clips[0].id,'我的想法');
 const md=toMarkdown(desk.read(),'https://example.test');
 assert.match(md,/- \[x\]/);assert(md.includes('> 原文\n> 第二行'));assert(md.includes('https://example.test/posts/2026/2601#one'));assert(md.includes('我的想法'));assert.equal(minutes(0),1);assert.equal(minutes(801),3);
});

test('damaged existing data is not overwritten by a new save',()=>{const storage=memory();storage.setItem(STORAGE_KEY,'{incomplete');const desk=createDesk(storage);assert.equal(desk.add([post]),false);assert.equal(storage.getItem(STORAGE_KEY),'{incomplete');});
