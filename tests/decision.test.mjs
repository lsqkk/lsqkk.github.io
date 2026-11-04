import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDecision, evaluateDecision, scenarioWeights, sensitivity, decisionMarkdown } from '../assets/pages/tool/decision/model.mjs';
const sample = () => ({ version:1, title:'比较', options:[{id:'a',name:'A'},{id:'b',name:'B'}], criteria:[{id:'x',name:'X',weight:3,scores:{a:10,b:0}},{id:'y',name:'Y',weight:7,scores:{a:0,b:10}}] });
test('weighted ranking and exact preference crossover at 50%', () => {
  const state = validateDecision(sample()); const result = evaluateDecision(state);
  assert.equal(result.ranking[0].id,'b'); assert.equal(result.ranking[0].score,7);
  assert.deepEqual(sensitivity(state,'x').intervals,[{from:0,to:50,winners:['b']},{from:50,to:100,winners:['a']}]);
  assert.deepEqual(evaluateDecision(state,scenarioWeights(state,'x',50)).tied,['a','b']);
});
test('a third crossing below the leader does not split leading intervals', () => {
  const state = sample(); state.options.push({id:'c',name:'C'}); state.criteria.forEach(item=>{item.scores.c=10});
  const intervals=sensitivity(validateDecision(state),'x').intervals;
  assert.deepEqual(intervals,[{from:0,to:100,winners:['c']}]);
});
test('blank differs from zero and all-zero preferences do not rank', () => {
  const state=sample(); state.criteria[0].scores.a=null;
  assert.equal(evaluateDecision(state).missing,1); assert.equal(evaluateDecision(state).ready,false);
  state.criteria[0].scores.a=0; assert.equal(evaluateDecision(state).ready,true);
  state.criteria.forEach(item=>item.weight=0); assert.equal(evaluateDecision(state).ready,false);
  assert.equal(sensitivity(state,'x'),null);
});
test('scenario endpoint and zero remainder share maintain normalization', () => {
  const state=sample(); state.criteria[1].weight=0;
  assert.deepEqual(scenarioWeights(state,'x',30),[.3,.7]);
  assert.deepEqual(scenarioWeights(state,'x',100),[1,0]);
  state.criteria.pop(); assert.deepEqual(scenarioWeights(state,'x',30),[1]);
});
test('identical scores produce a tie interval and preserve option order', () => {
  const state=sample(); state.criteria.forEach(item=>item.scores.b=item.scores.a);
  assert.deepEqual(sensitivity(state,'x').intervals,[{from:0,to:100,winners:['a','b']}]);
});
test('strict backups reject malformed, out-of-range, duplicate and unknown versions', () => {
  for(const mutate of [s=>s.version=2,s=>s.options[1].id='a',s=>s.criteria[0].scores.a=11,s=>s.criteria[0].scores.a='9',s=>s.criteria[0].scores.a=.3,s=>delete s.criteria[0].scores.a,s=>s.criteria[0].weight=NaN,s=>s.criteria[0].weight=3.5,s=>s.title=' ',s=>s.criteria[1].id='x']) {
    const state=sample(); mutate(state); assert.throws(()=>validateDecision(state));
  }
  assert.equal(validateDecision(sample()).options.length,2);
});
test('Markdown carries source inputs, scores, missing values and escaped pipes', () => {
  const state=sample(); state.options[0].name='A | B'; state.criteria[0].scores.a=null;
  const markdown=decisionMarkdown(state);
  assert(markdown.includes('A \\| B')); assert(markdown.includes('未评')); assert(markdown.includes('暂不排名'));
});
