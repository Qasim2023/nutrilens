import test from 'node:test';
import assert from 'node:assert/strict';
import {normalize} from '../src/ai.js';
import {foodPicture} from '../src/food-picture.js';
import {renderDiaryThumbnail} from '../src/diary.js';
import {createEntry,loadDiary,saveDiary,updateEntry} from '../src/diary-store.js';
import {resolveDiaryInput} from '../src/diary-estimate.js';
const photo = 'data:image/jpeg;base64,AAAA';
const input = {date:'2026-10-06',meal:'snack',name:'Apple',calories:95};
const result = normalize({dish:'Apple',items:[{name:'Apple',visual_food:'apple',calories:95}],total:{calories:95}});

test('foods eaten uses the same illustration as the saved analysis or food description', () => {
  const entry=createEntry({...input,source:'ai',analysis:result});
  const html=renderDiaryThumbnail(entry);
  assert.ok(html.includes(foodPicture(entry.analysis).src));
  assert.match(html,/Representative food illustration: Apple/);
  assert.match(html,/not a photo of your portion/);
  assert.match(html,/diary-entry-image/);
  assert.match(renderDiaryThumbnail({name:'banana'}),/Representative food illustration: banana/);
  assert.match(renderDiaryThumbnail({name:'Calorie entry'}),/diary-entry-placeholder/);
  assert.doesNotMatch(renderDiaryThumbnail({name:'Calorie entry'}),/<img/);
});
test('analysed photo thumbnails persist locally and take precedence over illustrations', () => {
  const data=new Map(),storage={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)};
  const entry=createEntry({...input,thumb:photo,source:'ai',analysis:result});
  saveDiary([entry],storage);const restored=loadDiary(storage)[0];
  assert.equal(restored.thumb,photo);
  assert.match(renderDiaryThumbnail(restored),/alt="Analysed food photo"/);
  assert.doesNotMatch(renderDiaryThumbnail(restored),/food-illustration/);
});
test('invalid, remote, SVG, and oversized photos are discarded safely', () => {
  for(const thumb of ['https://example.test/photo.jpg','javascript:alert(1)','data:image/svg+xml;base64,AAAA','data:image/jpeg;base64,'+'A'.repeat(120000)]) {
    const entry=createEntry({...input,thumb});assert.equal(entry.thumb,undefined);
    assert.match(renderDiaryThumbnail({...entry,thumb}),/food-illustration/);
  }
});
test('unchanged diary edits keep the photo; changing the food or calories discards stale photos', async () => {
  const original=createEntry({...input,thumb:photo,source:'ai',analysis:result});
  const unchanged=await resolveDiaryInput({input:{...input,meal:'lunch'},original});
  assert.equal(updateEntry([original],original.id,unchanged)[0].thumb,photo);
  for(const patch of [{name:'Banana'},{calories:105}]) {
    const changed=await resolveDiaryInput({input:{...input,...patch},original});
    assert.equal(updateEntry([original],original.id,changed)[0].thumb,undefined);
  }
});
