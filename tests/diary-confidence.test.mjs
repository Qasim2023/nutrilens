import test from 'node:test';
import assert from 'node:assert/strict';
import {createEntry,loadDiary,saveDiary,diaryConfidence} from '../src/diary-store.js';
import {resolveDiaryInput} from '../src/diary-estimate.js';
import {renderDiaryConfidence} from '../src/diary.js';
const input={name:'Salmon bowl',date:'2026-10-05',meal:'lunch',calories:420,source:'ai',confidence:.87};

test('diary confidence accepts only finite scores in the model’s 0–1 range',()=>{
  for(const value of [0,.87,1])assert.equal(diaryConfidence(value),value);
  for(const value of [null,undefined,'0.87','',NaN,Infinity,-.1,1.1,87,{}])assert.equal(diaryConfidence(value),null);
});
test('AI confidence survives saving and reloading without changing calories',()=>{
  const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
  const entry=createEntry(input,{id:'meal',now:100});saveDiary([entry],storage);
  assert.equal(loadDiary(storage)[0].confidence,.87);assert.equal(loadDiary(storage)[0].calories,420);
  const legacy={...entry};delete legacy.confidence;saveDiary([legacy],storage);
  assert.equal(loadDiary(storage)[0].confidence,null);
  assert.match(renderDiaryConfidence(loadDiary(storage)[0]),/AI confidence unavailable/);
});
test('confidence badges distinguish AI estimates, genuine zero scores, missing scores and manual calories',()=>{
  assert.match(renderDiaryConfidence(createEntry(input)),/87% AI confidence/);
  assert.match(renderDiaryConfidence(createEntry({...input,confidence:0})),/0% AI confidence/);
  assert.match(renderDiaryConfidence(createEntry({...input,confidence:1})),/100% AI confidence/);
  assert.match(renderDiaryConfidence(createEntry({...input,confidence:'<img src=x>'})),/AI confidence unavailable/);
  const manual=createEntry({...input,source:'manual'});assert.equal(manual.confidence,null);assert.equal(renderDiaryConfidence(manual),'');
});
test('unchanged estimated meals retain confidence; manual calorie or food edits remove stale scores',async()=>{
  const original=createEntry(input);
  const kept=await resolveDiaryInput({input,original});assert.equal(kept.confidence,.87);
  for(const change of [{calories:430},{name:'Different meal'}]){
    const manual=await resolveDiaryInput({input:{...input,...change},original});
    assert.equal(manual.source,'manual');assert.equal(manual.confidence,null);
  }
});
test('fresh diary estimates capture returned confidence and missing scores stay unknown',async()=>{
  const settings={baseUrl:'https://example.test/v1',model:'test',auth:'none',demoMode:false};
  for(const [value,expected] of [[.83,.83],[0,0],[undefined,null],['83%',null]]){
    const resolved=await resolveDiaryInput({input:{...input,calories:''},settings,estimate:async()=>({total:{calories:410},confidence:value})});
    assert.equal(resolved.confidence,expected);assert.equal(createEntry(resolved).confidence,expected);
  }
});

test('confidence color bands match the visible rounded score, including boundaries',()=>{
  for(const [confidence,percent,level] of [[1,100,'high'],[.87,87,'high'],[.7,70,'high'],[.695,70,'high'],[.694,69,'medium'],[.4,40,'medium'],[.395,40,'medium'],[.394,39,'low'],[.01,1,'low'],[0,0,'low']]){
    const badge=renderDiaryConfidence({...input,confidence});
    assert.match(badge,new RegExp('diary-confidence-'+level));
    assert.match(badge,new RegExp(percent+'% AI confidence'));
  }
  for(const confidence of [null,undefined,-1,2,NaN,'80']){
    const badge=renderDiaryConfidence({...input,confidence});
    assert.match(badge,/diary-confidence-unavailable/);
    assert.doesNotMatch(badge,/diary-confidence-(high|medium|low)/);
  }
});
