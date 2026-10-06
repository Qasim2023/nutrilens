import assert from 'node:assert/strict';
import {test} from 'node:test';
import {normalize} from '../src/ai.js';
import {createEntry,cacheDiaryAnalysis,loadDiary,saveDiary,updateEntry} from '../src/diary-store.js';
import {resolveDiaryInput} from '../src/diary-estimate.js';
const input={date:'2026-10-06',meal:'breakfast',name:'2 eggs',calories:''};
const settings={provider:'custom',baseUrl:'https://example.test/v1',model:'test',auth:'none'};
const result=normalize({dish:'Eggs',items:[{name:'Eggs',calories:140}],total:{calories:140,protein_g:12},micros:{iron_mg:2},health_score:70,pros:['Protein'],allergens:['egg'],swaps:[{from:'Butter',to:'Olive oil',why:'Unsaturated fat'}]}, {model:'test',apiKey:'must-not-persist'});
const memory=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};};

test('adding an estimated food saves the full analysis across reload without another AI call',async()=>{
  let calls=0;
  const resolved=await resolveDiaryInput({input,settings,estimate:async()=>{calls++;return result;}});
  const entry=createEntry(resolved),storage=memory();saveDiary([entry],storage);
  const restored=loadDiary(storage)[0];
  assert.equal(calls,1);assert.deepEqual(restored.analysis.items,result.items);
  for(const key of ['micros','health_score','pros','allergens','swaps'])assert.deepEqual(restored.analysis[key],result[key]);
  assert.equal(restored.analysis.meta.apiKey,undefined);
  result.items[0].name='Changed source';assert.equal(restored.analysis.items[0].name,'Eggs');result.items[0].name='Eggs';
});
test('unchanged edits and save retries keep results; changed food or calories discard stale analysis',async()=>{
  const original=createEntry({...input,calories:140,source:'ai',analysis:result});
  const resolve=patch=>resolveDiaryInput({input:{...input,calories:140,...patch},original,estimate:()=>{throw Error('No AI call expected');}});
  const unchanged=await resolve({meal:'lunch',date:'2026-10-07'});
  assert.deepEqual(updateEntry([original],original.id,unchanged)[0].analysis,original.analysis);
  assert.equal((await resolve({name:'3 eggs'})).analysis,null);
  assert.equal((await resolve({calories:210})).analysis,null);
});
test('legacy and manual foods remember detailed results without altering diary calorie totals',async()=>{
  const entry=createEntry({...input,calories:123});const context={id:entry.id,name:entry.name,calories:entry.calories};
  const cached=cacheDiaryAnalysis([entry],context,result,200);
  assert.equal(cached[0].calories,123);assert.equal(cached[0].source,'manual');assert.equal(cached[0].analysis.total.calories,140);
  const storage=memory();saveDiary(cached,storage);assert.deepEqual(loadDiary(storage),cached);
  const resolved=await resolveDiaryInput({input:{...input,calories:123},original:cached[0]});assert.deepEqual(resolved.analysis,cached[0].analysis);
  const legacy={...entry};delete legacy.analysis;saveDiary([legacy],storage);assert.equal(loadDiary(storage)[0].analysis,null);
});
test('late results cannot attach to deleted or edited diary entries, or demo results',()=>{
  const entry=createEntry({...input,calories:140});const entries=[entry],context={id:entry.id,name:entry.name,calories:140};
  assert.equal(cacheDiaryAnalysis(entries,{...context,name:'3 eggs'},result),entries);
  assert.equal(cacheDiaryAnalysis(entries,{...context,calories:200},result),entries);
  const empty=[];assert.equal(cacheDiaryAnalysis(empty,context,result),empty);
  assert.equal(cacheDiaryAnalysis(entries,context,{...result,meta:{demo:true}}),entries);
});

// An inline panel contains the whole result, but not actions that leave the diary.
test('inline nutrition includes micros and quality and omits global analysis/composer actions',async()=>{
  const {renderDiaryNutrition}=await import('../src/diary.js');
  const html=renderDiaryNutrition({id:'food',analysis:result});
  assert.match(html,/Micronutrients/);assert.match(html,/Nutritional quality/);assert.match(html,/Breakdown/);
  assert.doesNotMatch(html,/data-action=|Log to diary|Analyse again/);
  assert.match(renderDiaryNutrition({id:'food'},{loading:true,status:'Checking <food>'}),/Checking &lt;food&gt;/);
  assert.match(renderDiaryNutrition({id:'food'},{error:'<script>bad<\/script>'}),/&lt;script&gt;/);
  assert.match(renderDiaryNutrition({id:'food'},{analysis:result,saveFailed:true}),/data-save-diary-nutrition/);
});
test('inline detailed analysis sends only the food and portion notes, and validates settings before calling AI',async()=>{
  const {resolveDiaryAnalysis}=await import('../src/diary-estimate.js');
  const entry=createEntry({...input,calories:140,source:'ai',estimateNotes:'2 large eggs'});
  let calls=0;
  const analysis=await resolveDiaryAnalysis({entry,settings,estimate:async args=>{
    calls++;assert.match(args.text,/2 eggs/);assert.match(args.text,/2 large eggs/);
    for(const key of ['date','meal','calories','attachments','imageDataUrl'])assert.equal(args[key],undefined);
    return result;
  }});
  assert.equal(calls,1);assert.deepEqual(analysis.items,result.items);
  for(const bad of [{...settings,demoMode:true},{...settings,model:''},{...settings,auth:'bearer',apiKey:''}]) {
    await assert.rejects(resolveDiaryAnalysis({entry,settings:bad,estimate:()=>{throw Error('Must not call AI');}}));
  }
  await assert.rejects(resolveDiaryAnalysis({entry:{...entry,name:'Calorie entry'},settings}),/only a calorie/);
});
test('cancelling inline analysis never yields a cacheable result',async()=>{
  const {resolveDiaryAnalysis}=await import('../src/diary-estimate.js');
  const entry=createEntry({...input,calories:140}),controller=new AbortController();
  await assert.rejects(resolveDiaryAnalysis({entry,settings,signal:controller.signal,estimate:async()=>{controller.abort();return result;}}),{name:'AbortError'});
});
