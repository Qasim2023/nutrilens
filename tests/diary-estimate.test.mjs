import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDiaryInput } from '../src/diary-estimate.js';
import { createEntry, daySummary, loadDiary, saveDiary, updateEntry } from '../src/diary-store.js';
const input={date:'2026-10-03',meal:'breakfast',name:'2 eggs and 1 slice of toast',calories:''};
const settings={provider:'custom',baseUrl:'https://example.test/v1',model:'vision-model',auth:'bearer',apiKey:'fake-test-key',demoMode:false};
const result={total:{calories:238.4},portion_notes:'2 large eggs and 1 standard toast slice.',meta:{}};

test('blank calories estimates food and keeps the chosen description, category and date',async()=>{
  let calls=0;
  const resolved=await resolveDiaryInput({input,settings,estimate:async args=>{
    calls++;assert.equal(args.text,input.name);assert.equal(args.settings.model,settings.model);
    assert.equal(args.imageDataUrl,undefined);assert.equal(args.attachments,undefined);
    assert.equal(args.date,undefined);assert.equal(args.meal,undefined);return result;
  }});
  assert.equal(calls,1);assert.equal(resolved.name,input.name);assert.equal(resolved.meal,'breakfast');assert.equal(resolved.date,input.date);
  assert.equal(resolved.calories,238.4);assert.equal(resolved.source,'ai');assert.match(resolved.estimateNotes,/2 large eggs/);
  assert.equal(daySummary([createEntry(resolved)],input.date).total,238.4);
});
test('specified manual calories always bypass AI, including zero and calories-only entries',async()=>{
  for(const calories of ['350','0','0.1']){
    const resolved=await resolveDiaryInput({input:{...input,name:'',calories},settings:{demoMode:true},estimate:()=>{throw new Error('AI must not run');}});
    assert.equal(resolved.calories,Number(calories));assert.equal(resolved.source,'manual');
    assert.equal(createEntry(resolved).name,'Calorie entry');
  }
});
test('empty food/calories, invalid calories, bad category and bad dates never call AI',async()=>{
  for(const bad of [{name:'',calories:''},{calories:'-1'},{name:'x'.repeat(161)},{meal:'invalid'},{date:'2026-02-31'}]){
    let calls=0;
    await assert.rejects(resolveDiaryInput({input:{...input,...bad},settings,estimate:()=>{calls++;return result;}}));assert.equal(calls,0);
  }
});
test('requires real configured credentials/model; demo mode never supplies fake diary estimates',async()=>{
  for(const change of [{demoMode:true},{apiKey:''},{model:''},{baseUrl:''}]){
    let calls=0;
    await assert.rejects(resolveDiaryInput({input,settings:{...settings,...change},estimate:()=>{calls++;return result;}}));assert.equal(calls,0);
  }
  const resolved=await resolveDiaryInput({input,settings:{...settings,auth:'none',apiKey:''},estimate:async()=>result});assert.equal(resolved.source,'ai');
});
test('provider errors preserve the empty calorie field; no estimate is substituted',async()=>{
  const before={...input};await assert.rejects(resolveDiaryInput({input,settings,estimate:async()=>{throw new Error('HTTP 401: Key rejected');}}),/401/);
  assert.deepEqual(input,before);
});
test('missing, nonnumeric, negative or demo estimates are rejected; genuine zero calorie food is allowed',async()=>{
  for(const response of [{},{total:{calories:'300'}},{total:{calories:NaN}},{total:{calories:-1}},{total:{calories:100001}},{...result,meta:{demo:true}}]) await assert.rejects(resolveDiaryInput({input,settings,estimate:async()=>response}));
  const resolved=await resolveDiaryInput({input:{...input,name:'A glass of water'},settings,estimate:async()=>({total:{calories:0}})});assert.equal(resolved.calories,0);
});
test('cancellation before or after a slow provider response cannot produce a logged entry',async()=>{
  const aborted=new AbortController();aborted.abort();let calls=0;
  await assert.rejects(resolveDiaryInput({input,settings,signal:aborted.signal,estimate:()=>{calls++;return result;}}),{name:'AbortError'});assert.equal(calls,0);
  const controller=new AbortController();let release;
  const slow=new Promise(resolve=>{release=resolve;});
  const request=resolveDiaryInput({input,settings,signal:controller.signal,estimate:()=>slow});controller.abort();release(result);
  await assert.rejects(request,{name:'AbortError'});
});
test('editing with empty calories re-estimates instead of duplicating the diary entry',async()=>{
  const existing=createEntry({...input,calories:200,source:'manual'},{id:'entry',now:100});
  const resolved=await resolveDiaryInput({input:{...input,name:'3 eggs and toast'},settings,original:existing,estimate:async()=>({...result,total:{calories:310}})});
  const updated=updateEntry([existing],existing.id,resolved);
  assert.equal(updated.length,1);assert.equal(updated[0].id,existing.id);assert.equal(updated[0].source,'ai');assert.equal(daySummary(updated,input.date).total,310);
});
test('unchanged AI draft remains labelled AI; manual edits remove its stale portion assumptions',async()=>{
  const original={name:input.name,calories:238.4,source:'ai',estimateNotes:result.portion_notes};
  const resolved=await resolveDiaryInput({input:{...input,calories:'238.4'},original});assert.equal(resolved.source,'ai');assert.equal(resolved.estimateNotes,result.portion_notes);
  const manual=await resolveDiaryInput({input:{...input,calories:'250'},original});assert.equal(manual.source,'manual');assert.equal(manual.estimateNotes,'');
});
test('estimated portions persist through diary reloads and old entries remain compatible',()=>{
  const map=new Map();const storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};
  const entry=createEntry({...input,calories:238.4,source:'ai',estimateNotes:result.portion_notes});saveDiary([entry],storage);
  assert.equal(loadDiary(storage)[0].estimateNotes,result.portion_notes);
  const legacy={...entry};delete legacy.estimateNotes;saveDiary([legacy],storage);assert.equal(loadDiary(storage)[0].estimateNotes,'');
});
