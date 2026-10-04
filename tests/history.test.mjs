import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {createHistoryRepository,historySnapshot,HISTORY_KEY} from '../src/history-store.js';
import {diaryAnalysisSelection,diaryRequestText} from '../src/meal-library.js';
import {normalize} from '../src/ai.js';
import {renderResult,resultToMarkdown} from '../src/render.js';
const memory=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),data};};
const photo='data:image/png;base64,aGVsbG8=';
function entry(id='meal',when=100) {
  const result=normalize({dish:'Oatmeal bowl',summary:'The original full estimate',confidence:0.82,portion_notes:'60 g oats and 200 ml milk.',items:[{name:'Oats',quantity:'60 g',calories:228,protein_g:7.5,carbs_g:40,fat_g:4,fiber_g:6},{name:'Milk',quantity:'200 ml',calories:120,protein_g:7,carbs_g:10,fat_g:6}],total:{calories:348,protein_g:14.5,carbs_g:50,fat_g:10,fiber_g:6,sugar_g:10,sodium_mg:88},micros:{calcium_mg:240,iron_mg:2.5,vitamin_b12_ug:0.8},health_score:82,health_label:'Excellent',health_summary:'Whole grains with protein.',pros:['Fibre'],cons:['Portion uncertainty'],allergens:['milk'],swaps:[{from:'Whole milk',to:'Low-fat milk',why:'Less saturated fat'}],confidence_notes:'Confirm the milk brand.'},{model:'test-model',protocol:'chat',attachments:['recipe.txt']});
  return {version:2,id,when,dish:result.dish,model:'test-model',thumb:photo,result,input:{text:'My oatmeal recipe',image:{name:'meal.png',dataUrl:photo,bytes:5,width:1,height:1},attachments:[{name:'recipe.txt',text:'60 g oats\n200 ml milk\nServes 1',type:'txt',size:30}],diaryContext:{id:'diary1',name:'Oatmeal bowl',estimateNotes:'60 g oats with milk'}},view:{imageUrl:photo,model:'test-model',showMicros:true,showItems:true,showSwaps:true,isEstimate:false}};
}
const repo=options=>createHistoryRepository({storage:memory(),indexedDB:new IDBFactory(),...options});

test('IndexedDB saves the complete result, original image, recipes and display options until a new repository reopens it',async()=>{
  const factory=new IDBFactory(),storage=memory();const first=repo({indexedDB:factory,storage});
  const original=entry();await first.put(original);await first.close();
  const next=repo({indexedDB:factory,storage});const loaded=await next.get(original.id);
  assert.deepEqual(loaded.result,original.result);assert.deepEqual(loaded.view,original.view);assert.equal(loaded.input.image.dataUrl,photo);assert.deepEqual(loaded.input.attachments,historySnapshot(original).input.attachments);
  assert.equal(renderResult(loaded.result,loaded.view),renderResult(original.result,original.view));
  assert.match(resultToMarkdown(loaded.result),/Vitamin B12/);await next.close();
});
test('no 24-entry cap, expiration or deletion occurs when adding more meals or reading old results repeatedly',async()=>{
  const history=repo();for(let i=0;i<55;i++)await history.put(entry('meal-'+i,i));
  assert.equal((await history.list()).length,55);
  assert.equal((await history.list())[0].id,'meal-54');
  const oldest=await history.get('meal-0');assert.ok(oldest);for(let i=0;i<5;i++)assert.deepEqual((await history.get('meal-0')).result,oldest.result);
  assert.equal((await history.list()).length,55);await history.close();
});
test('migration preserves legacy results, thumbnails and IDs without double-importing or dropping new analyses',async()=>{
  const storage=memory(),factory=new IDBFactory();const legacy=entry('old');delete legacy.input;delete legacy.view;delete legacy.version;legacy.text='Old food description';
  storage.setItem(HISTORY_KEY,JSON.stringify([legacy]));const first=repo({storage,indexedDB:factory});
  const imported=await first.get('old');assert.deepEqual(imported.result,legacy.result);assert.equal(imported.view.imageUrl,photo);assert.equal(imported.view.showMicros,true);assert.equal(imported.legacy,true);assert.equal(imported.input.text,'Old food description');
  await first.put(entry('new',200));await first.close();
  const second=repo({storage,indexedDB:factory});assert.equal((await second.list()).length,2);await second.remove('old');await second.close();
  const third=repo({storage,indexedDB:factory});assert.equal((await third.list()).length,1);assert.equal(await third.get('old'),null);assert.ok(storage.getItem(HISTORY_KEY));await third.close();
});
test('viewing and editing returned data cannot mutate a saved original; re-analysis is a separate record',async()=>{
  const history=repo();await history.put(entry('original'));const loaded=await history.get('original');loaded.result.total.calories=999;loaded.input.attachments[0].text='changed';
  await history.put({...entry('new-result',200),result:loaded.result});assert.equal((await history.get('original')).result.total.calories,348);assert.equal((await history.get('new-result')).result.total.calories,999);assert.equal((await history.list()).length,2);await history.close();
});
test('saving excludes keys, headers and unrelated settings',async()=>{
  const raw=entry();raw.apiKey='private-secret';raw.settings={apiKey:'private-secret'};raw.result.meta.apiKey='private-secret';raw.input.apiKey='private-secret';raw.view.extraHeaders='private-secret';
  const sanitized=historySnapshot(raw);assert.ok(!JSON.stringify(sanitized).includes('private-secret'));
  const history=repo();await history.put(raw);assert.ok(!JSON.stringify(await history.backup()).includes('private-secret'));await history.close();
});
test('corrupt migration never overwrites local history or silently reports an empty history',async()=>{
  const storage=memory();storage.setItem(HISTORY_KEY,'{broken');const history=repo({storage});await assert.rejects(history.list(),/unreadable/);assert.equal(storage.getItem(HISTORY_KEY),'{broken');await history.close();
});
test('backup and restore keep complete old analyses; merge does not overwrite existing IDs',async()=>{
  const source=repo(),target=repo();await source.put(entry('first'));await source.put(entry('second',200));const backup=await source.backup();
  assert.equal(backup.version,2);assert.equal(backup.analyses.length,2);
  const original=entry('first');original.result.summary='Target original';await target.put(original);await target.importBackup(backup);
  assert.equal((await target.list()).length,2);assert.equal((await target.get('first')).result.summary,'Target original');assert.equal((await target.get('second')).input.image.dataUrl,photo);
  await target.importBackup(backup);assert.equal((await target.list()).length,2);await source.close();await target.close();
});
test('invalid backup is rejected before changing saved records',async()=>{
  const history=repo();await history.put(entry());await assert.rejects(history.importBackup({format:'other',version:2,analyses:[]}),/NutriLens/);
  await assert.rejects(history.importBackup({format:'nutrilens-history',version:2,analyses:[entry('ok'),{bad:true}]}),/Invalid/);assert.equal((await history.list()).length,1);await history.close();
});
test('explicit deletion affects only that analysis, never other meals',async()=>{
  const history=repo();await history.put(entry('one'));await history.put(entry('two',200));await history.remove('one');assert.equal(await history.get('one'),null);assert.ok(await history.get('two'));await history.close();
});
test('localStorage fallback has no entry cap and reports quota errors without losing existing history',async()=>{
  const storage=memory();const history=createHistoryRepository({indexedDB:null,storage});for(let i=0;i<30;i++)await history.put(entry('m'+i,i));assert.equal((await history.list()).length,30);
  const previous=storage.getItem(HISTORY_KEY);storage.setItem=()=>{throw new Error('quota');};await assert.rejects(history.put(entry('unsaved')),/not been saved/);assert.equal(storage.getItem(HISTORY_KEY),previous);assert.equal(await history.get('unsaved'),null);await history.close();
});
test('saved display options remain unchanged when current defaults differ and thumbnails cannot inject URLs',()=>{
  const original=entry();original.view.showMicros=false;original.view.showSwaps=false;original.view.showItems=false;const snapshot=historySnapshot(original);assert.equal(snapshot.view.showMicros,false);assert.doesNotMatch(renderResult(snapshot.result,snapshot.view),/section-title">Micronutrients/);
  original.thumb='https://tracking.test/photo.jpg';original.input.image.dataUrl='javascript:alert(1)';original.view.imageUrl='data:image/svg+xml;base64,abcd';const safe=historySnapshot(original);assert.equal(safe.thumb,null);assert.equal(safe.input.image,null);assert.equal(safe.view.imageUrl,null);
});
test('diary selection loads description/portion without changing the log or anchoring nutrition to manual calories',()=>{
  const item={id:'d1',name:'2 eggs and toast',calories:300,date:'2026-10-03',meal:'breakfast',source:'ai',estimateNotes:'2 large eggs and one bread slice'};const original=structuredClone(item);const chosen=diaryAnalysisSelection(item);
  assert.equal(chosen.text,item.name);assert.match(diaryRequestText(chosen.text,chosen.diaryContext),/full nutrition/);assert.match(diaryRequestText(chosen.text,chosen.diaryContext),/2 large eggs/);assert.ok(!diaryRequestText(chosen.text,chosen.diaryContext).includes('300'));assert.deepEqual(item,original);
  const manual=diaryAnalysisSelection({...item,source:'manual'});assert.equal(manual.diaryContext.estimateNotes,'');assert.throws(()=>diaryAnalysisSelection({...item,name:'Calorie entry'}),/only a calorie/);assert.equal(diaryRequestText('An apple',null),'An apple');
});


test('bulk clearing removes all IndexedDB snapshots and legacy recovery data, persists on reopen, and permits new analyses',async()=>{
  const factory=new IDBFactory(),storage=memory();
  storage.setItem(HISTORY_KEY,JSON.stringify([entry('legacy')]));
  storage.setItem('nutrilens.settings',JSON.stringify({model:'keep-me'}));
  let changes=0;
  const history=repo({indexedDB:factory,storage,notify:()=>{changes++;}});
  for(let i=0;i<35;i++)await history.put(entry('saved-'+i,i));
  assert.equal((await history.list()).length,36);
  const beforeClear=changes;
  await history.clear();
  assert.equal(changes,beforeClear+1);
  assert.deepEqual(await history.list(),[]);
  assert.equal(await history.get('legacy'),null);
  assert.deepEqual((await history.backup()).analyses,[]);
  assert.deepEqual(JSON.parse(storage.getItem(HISTORY_KEY)),[]);
  assert.equal(JSON.parse(storage.getItem('nutrilens.settings')).model,'keep-me');
  await history.close();
  const reopened=repo({indexedDB:factory,storage});
  assert.deepEqual(await reopened.list(),[]);
  await reopened.put(entry('fresh'));
  assert.equal((await reopened.list()).length,1);
  await reopened.close();
});

test('bulk clearing works with localStorage fallback and keeps records when storage writes fail',async()=>{
  const storage=memory();let changes=0;
  const history=createHistoryRepository({indexedDB:null,storage,notify:()=>{changes++;}});
  await history.put(entry('one'));await history.put(entry('two'));
  const previous=storage.getItem(HISTORY_KEY),beforeClear=changes,setItem=storage.setItem;
  storage.setItem=()=>{throw new Error('blocked');};
  await assert.rejects(history.clear(),/could not be deleted/);
  assert.equal(storage.getItem(HISTORY_KEY),previous);
  assert.equal((await history.list()).length,2);
  assert.equal(changes,beforeClear);
  storage.setItem=setItem;
  await history.clear();
  assert.deepEqual(await history.list(),[]);
  await history.clear();
  await history.put(entry('new'));
  assert.equal((await history.list()).length,1);
  await history.close();
});

test('bulk clearing does not overwrite unreadable legacy history',async()=>{
  const storage=memory();storage.setItem(HISTORY_KEY,'{broken');
  const history=repo({storage});
  await assert.rejects(history.clear(),/unreadable/);
  assert.equal(storage.getItem(HISTORY_KEY),'{broken');
  await history.close();
});

test('legacy item extensions are stripped without changing stored nutrition, meal input or exports', async () => {
  const original=entry('legacy-extensions');
  original.result.items[0].retiredReference={record:123,provider:'retired'};
  original.result.items[0].retiredCredential='remove-this-secret';
  original.result.meta.retiredReference={provider:'retired'};
  const saved=historySnapshot(original);
  assert.deepEqual(saved.result.items[0],Object.fromEntries(Object.entries(original.result.items[0]).filter(([key])=>!key.startsWith('retired'))));
  assert.deepEqual(saved.result.total,original.result.total);
  assert.deepEqual(saved.input,historySnapshot(entry('baseline')).input);
  assert.equal(Object.hasOwn(saved.result.meta,'retiredReference'),false);
  assert.doesNotMatch(JSON.stringify(saved),/remove-this-secret/);
  const history=repo();await history.put(original);const restored=await history.get(original.id);
  assert.deepEqual(restored.result.items,saved.result.items);
  assert.equal(restored.result.total.calories,348);
  assert.equal(resultToMarkdown(restored.result),resultToMarkdown(original.result));
  await history.close();
});

