import test from 'node:test';
import assert from 'node:assert/strict';
import {DIARY_KEY,localDay,validDay,shiftDay,validateCalories,createEntry,dayEntries,daySummary,updateEntry,removeEntry,loadDiary,saveDiary} from '../src/diary-store.js';
const date='2026-10-03';
const entry=(name,calories,meal='other',day=date,id=name)=>createEntry({name,calories,meal,date:day},{id,now:100});
const memory=()=>{const data=new Map();return {getItem:k=>data.get(k) ?? null,setItem:(k,v)=>data.set(k,v),data};};

test('local calendar day does not use UTC conversion',()=>{
  assert.equal(localDay(new Date(2026,9,3,0,5)),'2026-10-03');
  assert.equal(localDay(new Date(2026,9,3,23,59)),'2026-10-03');
});
test('date validation and navigation handle leap days, month/year boundaries and DST calendar days',()=>{
  assert.equal(validDay('2024-02-29'),true);assert.equal(validDay('2026-02-29'),false);
  for(const day of ['2026-10-32','2026-13-01','2026-1-03','not-a-date','2026-04-31','1800-01-01'])assert.equal(validDay(day),false);
  assert.equal(shiftDay('2026-12-31',1),'2027-01-01');
  assert.equal(shiftDay('2024-03-01',-1),'2024-02-29');
  assert.equal(shiftDay('2026-03-29',1),'2026-03-30');
  assert.throws(()=>shiftDay('2200-12-31',1),/range/);
});
test('multiple foods and calorie-only entries sum automatically and ignore other days',()=>{
  const entries=[entry('Breakfast oats',350,'breakfast'),entry('Lunch',550,'lunch'),entry('',150,'snack',date,'calorie-only'),entry('Yesterday',900,'dinner','2026-10-02')];
  const summary=daySummary(entries,date);
  assert.equal(summary.total,1050);assert.equal(summary.count,3);
  assert.equal(summary.meals.breakfast,350);assert.equal(summary.meals.lunch,550);assert.equal(summary.meals.snack,150);assert.equal(summary.meals.dinner,0);
  assert.equal(entries[2].name,'Calorie entry');assert.equal(dayEntries(entries,date).length,3);
  assert.equal(daySummary(entries,'2026-10-04').total,0);
});
test('decimal calorie totals use exact tenths and zero is valid',()=>{
  assert.equal(daySummary([entry('a',0.1),entry('b',0.2)],date).total,0.3);
  assert.equal(validateCalories('0'),0);assert.equal(validateCalories('100.24'),100.2);
  for(const val of ['',null,undefined,' ',NaN,Infinity,-1,'nope',100001])assert.throws(()=>validateCalories(val));
});
test('editing a food recalculates calories and meal breakdown without duplicating it',()=>{
  const initial=[entry('Oats',300,'breakfast'),entry('Pasta',550,'lunch')];
  const changed=updateEntry(initial,'Oats',{name:'Oats with milk',calories:425,meal:'breakfast',date},200);
  assert.equal(daySummary(changed,date).total,975);assert.equal(changed.length,2);
  assert.equal(changed[0].createdAt,100);assert.equal(changed[0].updatedAt,200);
  assert.equal(initial[0].calories,300);assert.throws(()=>updateEntry(initial,'missing',{calories:0}),/no longer/);
});
test('deleting and clearing one day leave other days untouched',()=>{
  const initial=[entry('a',300),entry('b',500),entry('previous',800,'other','2026-10-02')];
  const removed=removeEntry(initial,'a');assert.equal(daySummary(removed,date).total,500);
  const cleared=removed.filter(e=>e.date!==date);assert.equal(daySummary(cleared,date).total,0);assert.equal(daySummary(cleared,'2026-10-02').total,800);
});
test('diary persists to its own storage key and reloads entries and AI source',()=>{
  const storage=memory();assert.deepEqual(loadDiary(storage),[]);
  const ai=createEntry({name:'Meal estimate',calories:310,date,meal:'lunch',source:'ai'},{id:'ai',now:123});
  const items=[entry('Manual',200),ai];saveDiary(items,storage);assert.deepEqual(loadDiary(storage),items);
  assert.ok(storage.data.has(DIARY_KEY));assert.equal(storage.data.size,1);
});
test('storage failure reports that no diary entry was saved',()=>{
  const blocked={getItem:()=>{throw new Error('denied');},setItem:()=>{throw new Error('quota');}};
  assert.throws(()=>loadDiary(blocked),/unavailable/);assert.throws(()=>saveDiary([],blocked),/Nothing was added/);
});
test('corrupt saved data is not silently wiped or overwritten',()=>{
  const storage=memory();storage.data.set(DIARY_KEY,'{broken');
  assert.throws(()=>loadDiary(storage),/has not been changed/);assert.equal(storage.data.get(DIARY_KEY),'{broken');
  storage.setItem(DIARY_KEY,JSON.stringify({version:1,entries:[{id:'bad',date:'2026-02-31'}]}));assert.throws(()=>loadDiary(storage));
  const item=entry('a',200);storage.setItem(DIARY_KEY,JSON.stringify({version:1,entries:[item,item]}));assert.throws(()=>loadDiary(storage));
});
test('entry validation keeps names as plain text and validates date/category',()=>{
  const e=entry('<script>alert(1)</script>',100);assert.equal(e.name,'<script>alert(1)</script>');
  assert.throws(()=>entry('x'.repeat(161),200),/160/);
  assert.throws(()=>entry('x',200,'bad'),/category/);
  assert.throws(()=>entry('x',200,'other','2026-02-30'),/date/);
});
test('AI log button is present for real results and hidden for sample estimates',async()=>{
  const {renderResult}=await import('../src/render.js');
  const {normalize}=await import('../src/ai.js');
  const result=normalize({dish:'Meal',items:[{name:'Food',calories:200}],total:{calories:200}});
  assert.match(renderResult(result),/data-action="log-diary"/);
  result.meta.demo=true;assert.doesNotMatch(renderResult(result),/data-action="log-diary"/);
});
