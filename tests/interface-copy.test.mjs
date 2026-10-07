import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LANGUAGES} from '../src/languages.js';
import {TRANSLATIONS} from '../src/translations.js';
import {translate} from '../src/i18n.js';
const intro='Attach a photo or describe your meal. NutriLens breaks it down into calories, macros, micronutrients and a health score.';
test('page title, branding, hero and diary placeholder use the requested wording',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/<title>NutriLens<\/title>/);assert.match(html,/<meta property="og:title" content="NutriLens">/);
  assert.ok(html.includes('<p>'+intro+'</p>'));assert.doesNotMatch(html,/AI Food Nutrition Breakdown|AI nutrition breakdown|using the AI model you choose|Leave blank for AI|brand-tag/);
  assert.match(html,/<input[^>]*id="diary-calories"[^>]*placeholder="123"/);
  const manifest=JSON.parse(readFileSync(new URL('../public/manifest.webmanifest',import.meta.url),'utf8'));
  assert.equal(manifest.name,'NutriLens');assert.equal(manifest.description,intro);
});
test('updated introduction is translated in every language, while 123 stays unchanged',()=>{
  for(const language of LANGUAGES){
    assert.equal(translate('123',language.code),'123');
    if(language.code==='en')assert.equal(translate(intro,language.code),intro);
    else{
      assert.ok(TRANSLATIONS[language.code][intro]);assert.notEqual(translate(intro,language.code),intro);
      assert.equal(TRANSLATIONS[language.code]['AI nutrition breakdown'],undefined);
      assert.equal(TRANSLATIONS[language.code]['Leave blank for AI'],undefined);
      assert.equal(Object.keys(TRANSLATIONS[language.code]).some(key=>key.includes('using the AI model you choose')),false);
    }
  }
});

test('configured model hint is removed and diary empty state omits AI',()=>{
  const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
  const diary=readFileSync(new URL('../src/diary.js',import.meta.url),'utf8');
  assert.ok(!app.includes("Ready to use your configured model. Press Analyse to send the request."));
  assert.ok(app.includes('if (!state.settings.demoMode && hasRemoteModel()) return;'));
  const message="Enter a food and leave calories blank for an estimate, add a calorie-only amount, or log an analysed meal.";
  assert.ok(diary.includes(message));
  assert.ok(!diary.includes("Enter a food and leave calories blank for an AI estimate, add a calorie-only amount, or log an analysed meal."));
  for(const language of LANGUAGES.filter(l=>l.code!=='en')){
    assert.ok(TRANSLATIONS[language.code][message]);
    assert.equal(TRANSLATIONS[language.code]["Enter a food and leave calories blank for an AI estimate, add a calorie-only amount, or log an analysed meal."],undefined);
    assert.equal(TRANSLATIONS[language.code]["Ready to use your configured model. Press Analyse to send the request."],undefined);
    assert.doesNotMatch(TRANSLATIONS[language.code][message],/\b(?:AI|KI|IA|ИИ)\b|l’IA|для ИИ/);
  }
});

test('interface wording omits the removed badge and engine references while retaining estimate/privacy guidance',async()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const disallowed=/\b(?:AI|KI|IA)\b|ИИ|OpenAI|xAI|Bring your own API/;
  assert.doesNotMatch(html,disallowed);
  assert.equal((html.match(/<span class="chip">/g)||[]).length,3);
  assert.match(html,/Enter calories yourself to skip the estimate/);
  assert.match(html,/sends your food description, attached photos and extracted recipe text to your chosen provider/);
  for(const[code,dictionary]of Object.entries(TRANSLATIONS)){
    for(const[key,value]of Object.entries(dictionary)){
      assert.doesNotMatch(key,disallowed,'English key in '+code);
      assert.doesNotMatch(value,disallowed,'Translation '+code+': '+key);
    }
    assert.equal(dictionary['Bring your own API'],undefined);
  }
  const {normalize,PRESETS}=await import('../src/ai.js');
  const {renderResult,resultToMarkdown}=await import('../src/render.js');
  const {renderConfidenceBadge}=await import('../src/diary.js');
  const result=normalize({dish:'Oats',summary:'One bowl',items:[{name:'Oats',calories:150}],total:{calories:150}});
  assert.doesNotMatch(renderResult(result),disallowed);assert.doesNotMatch(renderConfidenceBadge(.8),disallowed);
  assert.match(renderConfidenceBadge(.8),/80% estimate confidence/);
  const markdown=resultToMarkdown(result);assert.doesNotMatch(markdown,disallowed);assert.match(markdown,/Nutrition values are estimates\. Not medical or dietary advice/);
  for(const preset of Object.values(PRESETS))assert.doesNotMatch(preset.label,disallowed);
  // The display name changes never alter provider IDs, authentication or target URLs.
  assert.equal(PRESETS.openai.baseUrl,'https://api.openai.com/v1');assert.equal(PRESETS.openai.auth,'bearer');
});


test('settings, privacy, provider presets and connection messages omit removed branding and notice',async()=>{
  const removed=/wikivibe|vercel|Hosted website mode|Use your own API key\. Never put an API key/i;
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
  assert.doesNotMatch(html,removed);
  assert.doesNotMatch(app,removed);
  assert.doesNotMatch(html,/static-hosting-notice|hosted-relay-notice|direct-hosting-notice/);
  assert.doesNotMatch(app,/static-hosting-notice|hosted-relay-notice|direct-hosting-notice/);
  const {PRESETS}=await import('../src/ai.js');
  const providerSelect=html.match(/<select[^>]*id="set-provider"[^>]*>([\s\S]*?)<\/select>/)[1];
  const optionIds=[...providerSelect.matchAll(/<option value="([^"]+)"/g)].map(match=>match[1]);
  assert.deepEqual(optionIds,Object.keys(PRESETS));
  assert.equal(Object.hasOwn(PRESETS,'wikivibe'),false);
  for(const preset of Object.values(PRESETS))assert.doesNotMatch(preset.label,removed);
  for(const file of ['connection.js','hosted-provider.js']){
    const source=readFileSync(new URL('../src/'+file,import.meta.url),'utf8');
    for(const match of source.matchAll(/new Error\((['"])(.*?)\1\)/g))assert.doesNotMatch(match[2],removed);
  }
  for(const dictionary of Object.values(TRANSLATIONS)){
    for(const[key,value]of Object.entries(dictionary)){assert.doesNotMatch(key,removed);assert.doesNotMatch(value,removed);}
  }
});

test('retired provider presets migrate to Custom without resetting the visitor connection or credentials',async()=>{
  const old={localStorage:globalThis.localStorage,sessionStorage:globalThis.sessionStorage,location:globalThis.location};
  const memory=()=>{const data=new Map();return{getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)};};
  globalThis.localStorage=memory();globalThis.sessionStorage=memory();globalThis.location={hostname:'localhost',protocol:'http:'};
  try{
    const connection={provider:'wikivibe',baseUrl:'https://api.wikivibe.dev/v1',model:'visitor-model',auth:'bearer',apiKey:'synthetic-visitor-key',extraHeaders:'',theme:'light'};
    localStorage.setItem('nutrilens.settings.v1',JSON.stringify(connection));
    const {loadSettings}=await import('../src/store.js?retired-provider-copy');
    const settings=loadSettings();
    assert.equal(settings.provider,'custom');
    for(const key of ['baseUrl','model','auth','apiKey','theme'])assert.equal(settings[key],connection[key]);
    const stored=JSON.parse(localStorage.getItem('nutrilens.settings.v1'));
    assert.equal(stored.provider,'custom');assert.equal(stored.apiKey,undefined);
    assert.equal(JSON.parse(localStorage.getItem('nutrilens.credentials.v1')).apiKey,connection.apiKey);assert.equal(sessionStorage.getItem('nutrilens.credentials.v1'),null);
  }finally{Object.assign(globalThis,old);}
});
