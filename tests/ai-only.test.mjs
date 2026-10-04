import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeFood,normalize} from '../src/ai.js';
import {resolveDiaryInput} from '../src/diary-estimate.js';
import {createEntry,loadDiary,saveDiary} from '../src/diary-store.js';
import {historySnapshot} from '../src/history-store.js';
import {renderResult,resultToMarkdown,resultToCsv} from '../src/render.js';
import {edibleGrams} from '../src/food-portion.js';
import {createAppServer} from '../server.mjs';
const settings={baseUrl:'https://example.test/v1',model:'mock',auth:'none',transport:'direct',apiFormat:'chat'};
const raw={dish:'Eggs',summary:'Two eggs',confidence:.88,portion_notes:'100 g edible portion.',confidence_notes:'Confirm preparation.',items:[{name:'Eggs',grams:100,quantity:'100 g',calories:155,protein_g:13,carbs_g:1,fat_g:11,fiber_g:0,sugar_g:1,sodium_mg:120}],total:{calories:155,protein_g:13,carbs_g:1,fat_g:11,fiber_g:0,sugar_g:1,sodium_mg:120},micros:{calcium_mg:50}};
const retiredNote='AI estimate based on the model’s food knowledge. Not multi-source verified: fewer than four independent agreeing sources, unclear portions, conflicting data or unavailable lookups. Check portion assumptions.';
const absent=/multi[-_ ]source|source consensus|Sources checked|Food references|independent_sources|nutrition_basis/i;

test('Analysis and Diary use model nutrition directly with no source requests or confidence cap',async()=>{
  const previous=globalThis.fetch;const calls=[];
  try{
    globalThis.fetch=async(url,init)=>{
      calls.push(url);assert.equal(url,'https://example.test/v1/chat/completions');
      const body=JSON.parse(init.body);assert.match(body.messages[0].content,/own food knowledge and best judgment/);
      assert.doesNotMatch(body.messages[0].content,/lookup_query|multi-source|cross-check|independent matching/);
      return Response.json({choices:[{message:{content:JSON.stringify({...raw,meta:{verification:{verified:true}}})}}]});
    };
    const result=await analyzeFood({text:'2 eggs',settings});
    assert.equal(result.total.calories,155);assert.equal(result.confidence,.88);assert.equal(result.meta.verification,undefined);
    assert.equal(result.confidence_notes,'Confirm preparation.');assert.equal(result.micros.find(m=>m.key==='calcium_mg').value,50);
    const diary=await resolveDiaryInput({input:{name:'2 eggs',calories:'',date:'2026-10-04',meal:'breakfast'},settings});
    assert.equal(diary.calories,155);assert.equal(diary.nutrients.protein_g,13);assert.equal(diary.verification,undefined);
    const manual=await resolveDiaryInput({input:{name:'2 eggs',calories:200,date:'2026-10-04',meal:'breakfast'},settings});
    assert.equal(manual.calories,200);assert.equal(calls.length,2);
    for(const output of [renderResult(result),resultToMarkdown(result),resultToCsv(result)])assert.doesNotMatch(output,absent);
    const saved=historySnapshot({id:'ai-only',version:2,when:10,result});assert.equal(saved.result.total.calories,155);assert.equal(saved.result.confidence,.88);
  }finally{globalThis.fetch=previous;}
});
test('old saved source metadata and auto-notices disappear without changing nutrition or genuine notes',()=>{
  const result=normalize(raw);result.meta.verification={verified:false,sourceCount:0};result.confidence_notes='Confirm preparation. '+retiredNote;
  const saved=historySnapshot({id:'old',version:2,when:10,result});
  assert.equal(saved.result.meta.verification,undefined);assert.equal(saved.result.confidence_notes,'Confirm preparation.');
  assert.deepEqual(saved.result.total,result.total);assert.deepEqual(saved.result.micros,result.micros);
  for(const output of [renderResult(result),renderResult(saved.result),resultToMarkdown(saved.result),resultToCsv(saved.result)])assert.doesNotMatch(output,absent);
  const entry=createEntry({name:'Eggs',date:'2026-10-04',meal:'breakfast',source:'ai',calories:155,nutrients:result.total,verification:result.meta.verification,estimateNotes:'100 g edible portion. '+retiredNote});
  assert.equal(entry.verification,undefined);assert.equal(entry.estimateNotes,'100 g edible portion.');assert.equal(entry.calories,155);
  const memory=new Map(),storage={getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)};
  saveDiary([entry],storage);assert.deepEqual(loadDiary(storage)[0].nutrients,entry.nutrients);
});
test('cancellation still stops AI analysis before a result can be displayed or logged',async()=>{
  const previous=globalThis.fetch,ctrl=new AbortController();
  try{globalThis.fetch=async()=>{ctrl.abort();return Response.json({choices:[{message:{content:JSON.stringify(raw)}}]});};
    await assert.rejects(analyzeFood({text:'2 eggs',settings,signal:ctrl.signal}),{name:'AbortError'});
  }finally{globalThis.fetch=previous;}
});
test('portion normalization remains available without source modules',()=>{
  assert.equal(edibleGrams({grams:50}),50);assert.equal(edibleGrams({quantity:'1 kg'}),1000);
  assert.equal(edibleGrams({quantity:'2 eggs (100 g)'}),100);assert.equal(edibleGrams({quantity:'2 eggs'}),null);
});
test('local server no longer exposes nutrition-source functionality',async t=>{
  const app=createAppServer();await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{app.close(resolve);app.closeAllConnections();}));
  const origin=`http://127.0.0.1:${app.address().port}`;
  const health=await (await fetch(origin+'/api/health')).json();assert.deepEqual(health,{relay:true,attachments:true});
  for(const route of ['/api/nutrition/verify','/src/nutrition-verification.js','/src/verification-render.js','/src/verification-model.js'])assert.equal((await fetch(origin+route)).status,404);
});
