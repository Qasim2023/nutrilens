import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory,IDBObjectStore} from 'fake-indexeddb';
import {createHistoryRepository,HISTORY_KEY} from '../src/history-store.js';
import {createEntry,loadDiary,saveDiary,daySummary,DIARY_KEY} from '../src/diary-store.js';
import {clearMealLibrarySource} from '../src/meal-library-store.js';
import {normalize} from '../src/ai.js';

const memory=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),data};};
const meal=(id,date)=>createEntry({name:'Meal '+id,date,meal:'other',calories:200},{id,now:100});
const analysis=id=>({version:2,id,when:100,result:normalize({dish:'Meal '+id,items:[{name:'Food',calories:200}],total:{calories:200}})});

test('clearing analyses leaves every diary entry and daily total unchanged in both storage backends',async()=>{
  for(const indexedDB of [new IDBFactory(),null]) {
    const storage=memory(),history=createHistoryRepository({indexedDB,storage});
    const diary=[meal('today','2026-10-03'),meal('old','2025-01-01')];
    saveDiary(diary,storage);storage.setItem('nutrilens.settings','keep-settings');
    await history.put(analysis('one'));await history.put(analysis('two'));
    const diaryRaw=storage.getItem(DIARY_KEY);
    await clearMealLibrarySource({source:'history',history,storage});
    assert.deepEqual(await history.list(),[]);assert.deepEqual(loadDiary(storage),diary);
    assert.equal(storage.getItem(DIARY_KEY),diaryRaw);
    assert.equal(daySummary(loadDiary(storage),'2026-10-03').total,200);
    assert.equal(storage.getItem('nutrilens.settings'),'keep-settings');
    await clearMealLibrarySource({source:'history',history,storage});
    await history.close();
  }
});

test('clearing diary meals across all dates and calorie-only entries leaves complete analyses unchanged',async()=>{
  for(const indexedDB of [new IDBFactory(),null]) {
    const storage=memory(),history=createHistoryRepository({indexedDB,storage});
    const diary=[meal('today','2026-10-03'),meal('old','2025-01-01'),{...meal('calorie','2026-09-01'),name:'Calorie entry'}];
    saveDiary(diary,storage);storage.setItem('nutrilens.settings','keep-settings');
    await history.put(analysis('one'));await history.put(analysis('two'));
    const before=(await history.backup()).analyses,legacy=storage.getItem(HISTORY_KEY);
    await clearMealLibrarySource({source:'diary',history,storage});
    assert.deepEqual(loadDiary(storage),[]);assert.deepEqual((await history.backup()).analyses,before);
    assert.equal(storage.getItem(HISTORY_KEY),legacy);
    for(const item of diary)assert.equal(daySummary(loadDiary(storage),item.date).total,0);
    assert.equal(storage.getItem('nutrilens.settings'),'keep-settings');
    await history.close();
  }
});

test('diary-only and analysis-only libraries can be independently cleared',async()=>{
  for(const source of ['diary','history']) {
    const storage=memory(),history=createHistoryRepository({indexedDB:new IDBFactory(),storage});
    if(source==='diary')saveDiary([meal('one','2026-10-03')],storage);
    else await history.put(analysis('one'));
    await clearMealLibrarySource({source,history,storage});
    assert.deepEqual(loadDiary(storage),[]);assert.deepEqual(await history.list(),[]);
    await history.close();
  }
});

test('failed diary write leaves both lists intact',async()=>{
  const storage=memory(),history=createHistoryRepository({indexedDB:new IDBFactory(),storage});
  const diary=[meal('one','2026-10-03')];saveDiary(diary,storage);await history.put(analysis('one'));
  storage.setItem=()=>{throw new Error('blocked');};
  await assert.rejects(clearMealLibrarySource({source:'diary',history,storage}),/could not be saved/);
  assert.deepEqual(loadDiary(storage),diary);assert.equal((await history.list()).length,1);
  await history.close();
});

test('failed history write leaves both lists intact',async()=>{
  const storage=memory(),history=createHistoryRepository({indexedDB:null,storage});
  const diary=[meal('one','2026-10-03')];saveDiary(diary,storage);await history.put(analysis('one'));
  const write=storage.setItem;
  storage.setItem=(key,value)=>{if(key===HISTORY_KEY)throw new Error('blocked');write(key,value);};
  await assert.rejects(clearMealLibrarySource({source:'history',history,storage}),/could not be deleted/);
  assert.deepEqual(loadDiary(storage),diary);assert.equal((await history.list()).length,1);
  await history.close();
});

test('aborted IndexedDB clear restores legacy recovery data without touching diary entries',async()=>{
  const storage=memory(),history=createHistoryRepository({indexedDB:new IDBFactory(),storage});
  const legacy=JSON.stringify([analysis('legacy')]);storage.setItem(HISTORY_KEY,legacy);
  const diary=[meal('one','2026-10-03')];saveDiary(diary,storage);await history.put(analysis('one'));
  const originalClear=IDBObjectStore.prototype.clear;
  IDBObjectStore.prototype.clear=function(){originalClear.call(this);throw new Error('simulated transaction failure');};
  try { await assert.rejects(clearMealLibrarySource({source:'history',history,storage}),/simulated transaction failure/); }
  finally { IDBObjectStore.prototype.clear=originalClear; }
  assert.deepEqual(loadDiary(storage),diary);assert.equal(storage.getItem(HISTORY_KEY),legacy);
  assert.equal((await history.list()).length,2);await history.close();
});

test('unreadable diary prevents deleting diary meals but does not prevent deleting analyses',async()=>{
  const storage=memory();storage.setItem(DIARY_KEY,'{broken');let cleared=false;
  const history={clear:async()=>{cleared=true;}};
  await assert.rejects(clearMealLibrarySource({source:'diary',history,storage}),/has not been changed/);
  assert.equal(storage.getItem(DIARY_KEY),'{broken');assert.equal(cleared,false);
  await clearMealLibrarySource({source:'history',history,storage});
  assert.equal(cleared,true);assert.equal(storage.getItem(DIARY_KEY),'{broken');
});

test('diary clearing never reads or changes unavailable history',async()=>{
  const storage=memory();saveDiary([meal('one','2026-10-03')],storage);
  const history={clear:async()=>{throw new Error('history unavailable');}};
  await clearMealLibrarySource({source:'diary',history,storage});
  assert.deepEqual(loadDiary(storage),[]);
});

test('unknown deletion scope is rejected without changing either list',async()=>{
  const storage=memory(),diary=[meal('one','2026-10-03')];saveDiary(diary,storage);
  let cleared=false;
  await assert.rejects(clearMealLibrarySource({source:'all',history:{clear:async()=>{cleared=true;}},storage}),/Choose analyses or diary/);
  assert.deepEqual(loadDiary(storage),diary);assert.equal(cleared,false);
});
