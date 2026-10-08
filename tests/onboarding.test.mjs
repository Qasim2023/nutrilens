import test from 'node:test';
import assert from 'node:assert/strict';
import {createOnboardingStore, ONBOARDING_KEY, DEMO_LIMITS, DEMO_DIARY_KEY} from '../src/onboarding-store.js';
import {demoDiaryInput, demoDiaryStorage, demoRecipe, waitForDemo} from '../src/demo-experience.js';
import {createEntry, loadDiary, saveDiary, DIARY_KEY} from '../src/diary-store.js';
import {withoutSentencePeriods} from '../src/interface-text.js';
import {renderResult} from '../src/render.js';
import {demoAnalyze} from '../src/demo.js';
const memory = () => { const data = new Map(); return {getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key)}; };
const input = {date: '2026-10-08', meal: 'lunch', name: 'salad', calories: ''};

test('first visits ask once, while returning visitors preserve their connection and skip onboarding', () => {
  const storage=memory();const first=createOnboardingStore({storage});assert.equal(first.snapshot().status,'welcome');
  first.skipDemo();assert.equal(createOnboardingStore({storage}).snapshot().status,'normal');
  for(const key of ['nutrilens.settings.v1','nutrilens.credentials.v1',DIARY_KEY,'nutrilens.history.v1','nutrilens.recipes.v1']) {
    const old=memory();old.setItem(key,'existing-user-data');const migrated=createOnboardingStore({storage:old});
    assert.equal(migrated.snapshot().status,'normal');assert.equal(old.getItem(key),'existing-user-data');
  }
});
test('each demo feature allows exactly two successful uses, privately persisted across reload', () => {
  const storage=memory();let store=createOnboardingStore({storage});store.startDemo();
  for(const feature of Object.keys(DEMO_LIMITS)) {
    for(let index=0;index<2;index++) { const ticket=store.reserve(feature);assert.ok(ticket);assert.equal(ticket.complete().accepted,true);store=createOnboardingStore({storage}); }
    assert.equal(store.reserve(feature),null);assert.equal(store.snapshot().used[feature],2);
  }
  assert.equal(store.snapshot().status,'normal');assert.equal(store.snapshot().demoFinished,true);assert.equal(store.startDemo(),false);
  assert.deepEqual(store.snapshot().used,{analysis:2,diary:2,recipes:2});
});
test('failures, cancelled requests and overlapping requests cannot spend or duplicate allowances', () => {
  const store=createOnboardingStore({storage:memory()});store.startDemo();
  const first=store.reserve('analysis'),second=store.reserve('analysis');assert.equal(store.reserve('analysis'),null);
  first.release();first.release();assert.equal(first.complete().accepted,false);assert.equal(store.snapshot().used.analysis,0);
  assert.equal(second.complete().accepted,true);assert.equal(second.complete().accepted,false);assert.equal(store.snapshot().used.analysis,1);
  const last=store.reserve('analysis');last.complete();assert.equal(store.reserve('analysis'),null);assert.ok(store.reserve('diary'));
});
test('early demo cancellation is permanent and late requests cannot spend a use after ending', () => {
  const storage=memory(),store=createOnboardingStore({storage});store.startDemo();const ticket=store.reserve('recipes');
  store.finishDemo();assert.equal(ticket.complete().accepted,false);assert.equal(store.snapshot().used.recipes,0);
  assert.equal(createOnboardingStore({storage}).startDemo(),false);
});
test('corrupt or unavailable storage is safe, and an existing user is not forced back into welcome', () => {
  const storage=memory();storage.setItem(ONBOARDING_KEY,'not json');storage.setItem('nutrilens.settings.v1','kept');
  assert.equal(createOnboardingStore({storage}).snapshot().status,'normal');
  const denied={getItem(){throw new Error('denied');},setItem(){throw new Error('denied');}};
  const store=createOnboardingStore({storage:denied});assert.equal(store.snapshot().status,'welcome');store.startDemo();
  assert.equal(store.reserve('analysis').complete().accepted,true);assert.equal(store.snapshot().used.analysis,1);
  storage.setItem(ONBOARDING_KEY,JSON.stringify({version:1,status:'demo',used:{analysis:99,diary:-4,recipes:'2'}}));
  assert.deepEqual(createOnboardingStore({storage}).snapshot().used,{analysis:2,diary:0,recipes:0});
});
test('a failed state write does not let stale persisted data undo an in-memory demo', () => {
  const storage=memory();storage.setItem(ONBOARDING_KEY,JSON.stringify({version:1,status:'welcome',demoFinished:false,used:{analysis:0,diary:0,recipes:0}}));
  storage.setItem=()=>{throw new Error('Synthetic quota failure');};
  const store=createOnboardingStore({storage});assert.equal(store.startDemo(),true);assert.equal(store.snapshot().status,'demo');
  assert.equal(store.reserve('analysis').complete().accepted,true);assert.equal(store.snapshot().used.analysis,1);
  store.finishDemo();assert.equal(store.snapshot().status,'normal');
});
test('a second tab sees updated counts and cannot restart a finished demo', () => {
  const storage=memory(),first=createOnboardingStore({storage});first.startDemo();const other=createOnboardingStore({storage});
  first.reserve('analysis').complete();assert.equal(other.snapshot().used.analysis,1);
  other.reserve('analysis').complete();assert.equal(first.reserve('analysis'),null);other.finishDemo();assert.equal(first.snapshot().status,'normal');
});
test('sample diary meals are validated and saved separately, leaving real diary meals untouched', () => {
  const storage=memory();const real=createEntry({...input,name:'My real lunch',calories:500});saveDiary([real],storage);
  const before=storage.getItem(DIARY_KEY),demoStorage=demoDiaryStorage(storage);
  const sample=createEntry(demoDiaryInput(input));saveDiary([sample],demoStorage);
  assert.equal(storage.getItem(DIARY_KEY),before);assert.equal(loadDiary(demoStorage)[0].calories,180);assert.ok(storage.getItem(DEMO_DIARY_KEY));
  assert.equal(demoDiaryInput({...input,calories:0}).calories,0);
  for(const bad of [{...input,name:''},{...input,calories:-1},{...input,meal:'invalid'},{...input,date:'invalid'}])assert.throws(()=>demoDiaryInput(bad));
  assert.throws(()=>demoStorage.setItem('nutrilens.credentials.v1','bad'));
});
test('local demo diary and recipe fixtures never fetch a provider or expose credentials', () => {
  const previous=globalThis.fetch;globalThis.fetch=()=>{throw new Error('A demo must not use the network');};
  try {
    const one=demoRecipe(0),two=demoRecipe(1);assert.equal(one.length,1);assert.equal(two.length,1);assert.notEqual(one[0].title,two[0].title);
    one[0].title='edited';assert.notEqual(demoRecipe(0)[0].title,'edited');
    for(const result of [one,two])assert.ok(result[0].ingredients.length>=3 && result[0].steps.length>=3);
    assert.equal(demoDiaryInput(input).calories,180);assert.doesNotMatch(JSON.stringify(two),/apiKey|Authorization/);
  } finally {globalThis.fetch=previous;}
});
test('cancelling a sample request rejects before any result is produced', async () => {
  const controller=new AbortController();const request=waitForDemo(controller.signal);controller.abort();await assert.rejects(request,{name:'AbortError'});
  await assert.rejects(waitForDemo(controller.signal),{name:'AbortError'});
});
test('sentence-period formatting preserves decimals, filenames, URLs, abbreviations and ellipses', () => {
  assert.equal(withoutSentencePeriods('First sentence. Next sentence.'),'First sentence Next sentence');
  assert.equal(withoutSentencePeriods('Use 12.5 g. Visit https://example.com/v1. File meal.json. Loading…'), 'Use 12.5 g Visit https://example.com/v1 File meal.json Loading…');
  assert.equal(withoutSentencePeriods('Dr. Smith uses e.g. rice. Wait...'),'Dr. Smith uses e.g. rice Wait...');
  assert.equal(withoutSentencePeriods('Line one.\nLine two.'),'Line one\nLine two');
});
test('generated analysis prose loses sentence periods without changing raw nutrition results', () => {
  const result=demoAnalyze('salad',false),before=structuredClone(result);const html=renderResult(result,{isEstimate:true});
  assert.ok(!html.includes('analyse your food.</div>'));assert.deepEqual(result,before);assert.equal(result.total.calories,180);
});
