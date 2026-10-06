import test from 'node:test';
import assert from 'node:assert/strict';
import {FOOD_VISUAL_KEYS,foodPicture,validFoodVisual} from '../src/food-picture.js';
import {normalize,analyzeFood} from '../src/ai.js';
import {renderResult} from '../src/render.js';
import {createHistoryRepository,historySnapshot} from '../src/history-store.js';
import {IDBFactory} from 'fake-indexeddb';
const meal = (names,dish='Test meal')=>normalize({dish,items:names.map(name=>({name,calories:100})),total:{calories:100*names.length}});

test('one food gets its matching illustration, not a generic spread',()=>{
  for(const [name,key] of [['2 eggs','eggs'],['Apple','apple'],['banana','banana'],['grilled chicken','chicken'],['salmon','fish'],['rice','rice'],['spaghetti','pasta'],['yogurt','dairy'],['coffee','coffee']]) {
    const picture=foodPicture(meal([name]));
    assert.deepEqual(picture.foods,[key]);assert.equal(picture.multiple,false);
    assert.match(picture.src,/^data:image\/svg\+xml/);assert.ok(picture.alt.includes(name));
    assert.match(picture.title,/not a photo/);
  }
});
test('multi-food spreads match breakfast, fruit, drinks and mixed meal context',()=>{
  for(const [names,theme,foods] of [
    [['Eggs','Toast','Coffee'],'breakfast',['eggs','bread','coffee']],
    [['Apple','Banana','Orange'],'fruit',['apple','banana','citrus']],
    [['Chicken','Rice','Broccoli'],'meal',['chicken','rice','vegetables']],
    [['Coffee','Tea','Juice'],'drinks',['coffee','tea','drink']],
  ]) {
    const picture=foodPicture(meal(names));assert.equal(picture.multiple,true);
    assert.equal(picture.theme,theme);assert.deepEqual(picture.foods,foods);
  }
  assert.equal(foodPicture(meal(['Apple','Green apple'])).foods.length,3);
  assert.equal(foodPicture(meal(['Coffee'])).theme,'drinks');
});
test('matching avoids substrings, supports common translated names and has a safe fallback',()=>{
  assert.deepEqual(foodPicture(meal(['pineapple'])).foods,['fruit']);
  assert.deepEqual(foodPicture(meal(['eggplant'])).foods,['vegetables']);
  assert.deepEqual(foodPicture(meal(['sweetbread'])).foods,['generic']);
  assert.deepEqual(foodPicture(meal(['Banan'])).foods,['banana']);
  assert.deepEqual(foodPicture(meal(['Grønnsaker'])).foods,['vegetables']);
  assert.deepEqual(foodPicture(meal(['Unknown specialty'])).foods,['generic']);
  assert.equal(foodPicture({dish:'Apple and banana'}).multiple,true);
  assert.equal(foodPicture({dish:'Eggs',items:[]}).multiple,false);
  assert.equal(foodPicture({dish:'Eggs',items:[null,{}]}).multiple,false);
});
test('validated model categories support food names in any language',()=>{
  const result=normalize({dish:'सेब',items:[{name:'सेब',visual_food:'apple',calories:52}]});
  assert.deepEqual(foodPicture(result).foods,['apple']);
  const invalid=normalize({items:[{name:'Eggs',visual_food:'https://untrusted.test/photo'}]});
  assert.equal(Object.hasOwn(invalid.items[0],'visual_food'),false);
  assert.deepEqual(foodPicture(invalid).foods,['eggs']);
  assert.equal(validFoodVisual('__proto__'),null);assert.equal(validFoodVisual('constructor'),null);
});
test('all built-in food pictures are self-contained SVGs and spreads are bounded',()=>{
  for(const key of FOOD_VISUAL_KEYS) {
    const picture=foodPicture({items:[{name:key,visual_food:key}]});
    const svg=decodeURIComponent(picture.src.split(',')[1]);
    assert.match(svg,/<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    assert.doesNotMatch(svg,/<script|<image|href=|onload=|undefined/);
  }
  const picture=foodPicture(meal(FOOD_VISUAL_KEYS));
  assert.ok(picture.foods.length<=6);assert.equal(picture.multiple,true);
});
test('user text is escaped in labels and never interpolated into image artwork',()=>{
  const name='<img src=x onerror=alert(1)>';
  const result=meal([name]);const before=structuredClone(result);
  const picture=foodPicture(result);const html=renderResult(result);
  assert.doesNotMatch(decodeURIComponent(picture.src),/onerror|alert/);
  assert.doesNotMatch(html,/<img src=x/);assert.match(html,/&lt;img/);
  assert.deepEqual(result,before);assert.equal(result.total.calories,100);
});
test('uploaded photos always take precedence and exported nutrition stays unchanged',()=>{
  const result=meal(['Eggs']);const imageUrl='data:image/png;base64,iVBORw0KGgo=';
  const html=renderResult(result,{imageUrl});
  assert.ok(html.includes(`src="${imageUrl}"`));assert.doesNotMatch(html,/food-illustration/);
  assert.match(renderResult(result),/food-illustration/);
  assert.equal(result.items[0].calories,100);
});
test('saved and older analyses retain pictures on reopen without storing image URLs as input photos',async()=>{
  for(const indexedDB of [new IDBFactory(),null]) {
    const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
    const repository=createHistoryRepository({indexedDB,storage,name:'food-pictures-test'});
    const result=meal(['Eggs','Toast'],'Breakfast');result.items[0].visual_food='eggs';
    await repository.put({version:2,id:'breakfast',when:1,result});
    const saved=await repository.get('breakfast');
    assert.equal(saved.result.items[0].visual_food,'eggs');assert.equal(saved.view.imageUrl,null);
    assert.deepEqual(foodPicture(saved.result),foodPicture(result));
    const listed=(await repository.list())[0];assert.deepEqual(listed.foodPicture.foods,['eggs','bread']);
    assert.equal(listed.foodPicture.multiple,true);
    await repository.close();
  }
  const older=historySnapshot({id:'old',when:1,result:meal(['Rice'])});
  assert.deepEqual(foodPicture(older.result).foods,['rice']);
});
test('AI food-image category is requested without adding network calls or changing nutrition',async()=>{
  const previous=globalThis.fetch;let calls=0;
  try {
    globalThis.fetch=async(_url,init)=>{
      calls++;const body=JSON.parse(init.body);
      assert.match(body.messages[0].content,/visual_food/);
      assert.match(body.messages[0].content,/never change nutrition/);
      return Response.json({choices:[{message:{content:JSON.stringify({dish:'सेब',items:[{name:'सेब',visual_food:'apple',calories:52}],total:{calories:52}})}}]});
    };
    const result=await analyzeFood({text:'सेब',settings:{baseUrl:'https://example.test/v1',model:'mock',auth:'none',transport:'direct',apiFormat:'chat'}});
    assert.equal(calls,1);assert.equal(result.total.calories,52);assert.deepEqual(foodPicture(result).foods,['apple']);
  } finally {globalThis.fetch=previous;}
});
