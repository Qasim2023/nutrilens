import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {normalize} from '../src/ai.js';
import {createHistoryRepository,HISTORY_KEY} from '../src/history-store.js';
import {createEntry,saveDiary,loadDiary,DIARY_KEY} from '../src/diary-store.js';
import {createPersonalBackup,restorePersonalBackup} from '../src/personal-backup.js';
const memory=()=>{const values=new Map();return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};};
const analysis=(id='analysis',calories=150)=>({version:2,id,when:1,result:normalize({dish:'Eggs',confidence:.8,items:[{name:'Eggs',visual_food:'eggs',calories}],total:{calories}})});
const meal=(id='diary',calories=150)=>createEntry({name:'Eggs',date:'2026-10-05',meal:'breakfast',calories,source:'ai',confidence:.8,estimateNotes:'Two eggs.'},{id,now:1});
const backup=(analyses=[analysis()],entries=[meal()])=>({format:'nutrilens-personal-backup',version:1,history:{format:'nutrilens-history',version:2,analyses},diary:{version:1,entries}});

test('all-meals backup restores full analyses, diary, confidence and illustrations in both storage backends',async()=>{
  for(const indexedDB of [null,new IDBFactory()]) {
    const sourceStorage=memory(),targetStorage=memory();
    const source=createHistoryRepository({storage:sourceStorage,indexedDB,name:'backup-source'});
    const target=createHistoryRepository({storage:targetStorage,indexedDB,name:'backup-target'});
    await source.put(analysis());saveDiary([meal()],sourceStorage);
    sourceStorage.setItem('nutrilens.settings.v1',JSON.stringify({apiKey:'never-export-this-key',extraHeaders:'secret-header'}));
    const exported=await createPersonalBackup({history:source,storage:sourceStorage});
    assert.doesNotMatch(JSON.stringify(exported),/never-export-this-key|secret-header|settings/);
    assert.equal(exported.format,'nutrilens-personal-backup');assert.equal(exported.version,1);
    await restorePersonalBackup(exported,{history:target,storage:targetStorage});
    assert.deepEqual((await target.get('analysis')).result,(await source.get('analysis')).result);
    assert.deepEqual(loadDiary(targetStorage),loadDiary(sourceStorage));
    assert.equal(targetStorage.getItem('nutrilens.settings.v1'),null);
    await restorePersonalBackup(exported,{history:target,storage:targetStorage});
    assert.equal((await target.list()).length,1);assert.equal(loadDiary(targetStorage).length,1);
    await source.close();await target.close();
  }
});
test('restoring merges new IDs and never replaces existing meals or settings',async()=>{
  const storage=memory(),history=createHistoryRepository({storage,indexedDB:null});
  await history.put(analysis('analysis',999));saveDiary([meal('diary',888)],storage);
  storage.setItem('nutrilens.settings.v1','keep-settings');
  await restorePersonalBackup(backup([analysis(),analysis('new')],[meal(),meal('new-diary')]),{history,storage});
  assert.equal((await history.get('analysis')).result.total.calories,999);
  assert.equal(loadDiary(storage).find(entry=>entry.id==='diary').calories,888);
  assert.equal((await history.list()).length,2);assert.equal(loadDiary(storage).length,2);
  assert.equal(storage.getItem('nutrilens.settings.v1'),'keep-settings');await history.close();
});
test('all backup data is validated before writing either list',async()=>{
  const storage=memory(),history=createHistoryRepository({storage,indexedDB:null});
  await history.put(analysis());saveDiary([meal()],storage);
  const originalDiary=storage.getItem(DIARY_KEY),originalHistory=storage.getItem(HISTORY_KEY);
  const invalid=[null,{}, {...backup(),version:2}, {...backup(),history:{format:'wrong'}},backup([{id:'bad'}]),backup([analysis('new')],[{...meal(),date:'wrong'}]),backup([analysis('new')],[meal(),meal()])];
  for(const data of invalid) {
    await assert.rejects(restorePersonalBackup(data,{history,storage}));
    assert.equal(storage.getItem(DIARY_KEY),originalDiary);assert.equal(storage.getItem(HISTORY_KEY),originalHistory);
  }
  await history.close();
});
test('unsupported diary fields and credentials are stripped from imports',async()=>{
  const storage=memory(),history=createHistoryRepository({storage,indexedDB:null});
  await restorePersonalBackup(backup([analysis()],[{...meal(),apiKey:'remove-this-key',extra:'remove-extra'}]),{history,storage});
  assert.doesNotMatch(storage.getItem(DIARY_KEY),/remove-this-key|remove-extra/);await history.close();
});
test('legacy history-only backups remain accepted and leave diary unchanged',async()=>{
  const storage=memory(),history=createHistoryRepository({storage,indexedDB:null});saveDiary([meal()],storage);
  const original=storage.getItem(DIARY_KEY);
  await restorePersonalBackup(backup().history,{history,storage});
  assert.equal(storage.getItem(DIARY_KEY),original);assert.equal((await history.list()).length,1);await history.close();
});
test('diary quota failures prevent any history import',async()=>{
  const storage=memory();saveDiary([meal()],storage);const original=storage.getItem(DIARY_KEY);let called=false;
  storage.setItem=()=>{throw new Error('quota');};
  await assert.rejects(restorePersonalBackup(backup([analysis()],[meal('new')]),{storage,history:{importBackup:async()=>{called=true;}}}),/could not be saved/);
  assert.equal(called,false);assert.equal(storage.getItem(DIARY_KEY),original);
});
test('history failure rolls the diary back to its exact original bytes, including an absent diary',async()=>{
  for(const initial of [null,JSON.stringify({version:1,entries:[meal()],unused:'keep-original-bytes'})]) {
    const storage=memory();if(initial!==null)storage.setItem(DIARY_KEY,initial);
    await assert.rejects(restorePersonalBackup(backup([analysis()],[meal('new')]),{storage,history:{importBackup:async()=>{throw new Error('history failed');}}}),/history failed/);
    assert.equal(storage.getItem(DIARY_KEY),initial);
  }
});
test('rollback preserves concurrent diary edits and reports an actionable partial failure',async()=>{
  const storage=memory();saveDiary([meal()],storage);
  const concurrent=[meal('other-tab',222)];
  await assert.rejects(restorePersonalBackup(backup([analysis()],[meal('new')]),{storage,history:{importBackup:async()=>{saveDiary(concurrent,storage);throw new Error('failed');}}}),/could not be rolled back safely/);
  assert.deepEqual(loadDiary(storage),concurrent);
});
test('corrupt existing diary or history is never overwritten by backup or restore',async()=>{
  const storage=memory(),history=createHistoryRepository({storage,indexedDB:null});storage.setItem(DIARY_KEY,'{broken');
  await assert.rejects(createPersonalBackup({history,storage}),/could not be read/);
  await assert.rejects(restorePersonalBackup(backup(),{history,storage}),/could not be read/);
  assert.equal(storage.getItem(DIARY_KEY),'{broken');assert.equal(storage.getItem(HISTORY_KEY),null);
  storage.removeItem(DIARY_KEY);storage.setItem(HISTORY_KEY,'{broken');
  await assert.rejects(restorePersonalBackup(backup(),{history,storage}),/unreadable/);
  assert.equal(storage.getItem(DIARY_KEY),null);assert.equal(storage.getItem(HISTORY_KEY),'{broken');await history.close();
});
