import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPocket, changePocket, PIN_LIMIT } from '../assets/js/pocket-store.mjs';
const empty = () => ({version:1,pins:[],recent:[],view:'grid'});
test('catalogue whitelist drops untrusted and removed destinations',()=>{
  const storage={getItem:()=>JSON.stringify({version:1,pins:['javascript:alert(1)','/tool/a','/tool/a','/gone'],recent:['/tool/a'],view:'list'})};
  assert.deepEqual(readPocket(storage,new Set(['/tool/a'])),{version:1,pins:['/tool/a'],recent:['/tool/a'],view:'list'});
});
test('pins enforce capacity, toggle and retain order',()=>{
  let state=empty(); for(let i=0;i<PIN_LIMIT;i++)state=changePocket(state,{type:'pin',path:'/tool/'+i});
  assert.throws(()=>changePocket(state,{type:'pin',path:'/tool/other'}));
  state=changePocket(state,{type:'pin',path:'/tool/0'}); assert.equal(state.pins.length,7);
});
test('recent opens deduplicate, cap and clear without removing pins',()=>{
  let state={...empty(),pins:['/tool/pin']};
  for(let i=0;i<12;i++)state=changePocket(state,{type:'visit',path:'/tool/'+i});
  state=changePocket(state,{type:'visit',path:'/tool/8'});
  assert.equal(state.recent.length,8); assert.equal(state.recent[0],'/tool/8'); assert.equal(new Set(state.recent).size,8);
  state=changePocket(state,{type:'clear-recent'}); assert.deepEqual(state.recent,[]); assert.deepEqual(state.pins,['/tool/pin']);
});
test('corrupt or unreadable state fails instead of silently replacing data',()=>{
  assert.throws(()=>readPocket({getItem:()=>'{bad'},new Set()));
  assert.throws(()=>readPocket({getItem:()=>'{"version":99}'},new Set()));
  assert.deepEqual(readPocket({getItem:()=>null},new Set()),empty());
});
