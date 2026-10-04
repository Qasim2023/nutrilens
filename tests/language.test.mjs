import test from 'node:test';
import assert from 'node:assert/strict';
import {LANGUAGES,normalizeLanguage,languageInfo} from '../src/languages.js';
import {TRANSLATIONS} from '../src/translations.js';
import {translate,setLanguage,getLocale,getDirection,analysisLanguageInstruction} from '../src/i18n.js';
import {loadSettings,saveSettings,resetSettings,defaults} from '../src/store.js';
import {analyzeFood} from '../src/ai.js';
import {historySnapshot} from '../src/history-store.js';
const raw={dish:'Eggs',confidence:.9,items:[{name:'Eggs',grams:100,quantity:'100 g',calories:155,protein_g:13,carbs_g:1,fat_g:11}],total:{calories:155},micros:{calcium_mg:50}};
const settings={baseUrl:'https://example.test/v1',model:'fixture',auth:'none',apiFormat:'chat',transport:'direct'};

test('language catalog has the eleven choices, including distinct Bokmål and Nynorsk',()=>{
  assert.deepEqual(LANGUAGES.map(l=>l.code),['nb','en','pl','de','tl','fr','es','nn','ru','hi','ur']);
  assert.equal(new Set(LANGUAGES.map(l=>l.code)).size,11);
  assert.match(languageInfo('nn').name,/Nynorsk/);assert.match(languageInfo('nb').name,/Bokmål/);
  for(const value of [null,undefined,'unknown','<script>',{},123])assert.equal(normalizeLanguage(value),'en');
});
test('every non-English catalog has the same complete translation keys',()=>{
  const keys=Object.keys(TRANSLATIONS.nb).sort();assert.ok(keys.length>200);
  for(const language of LANGUAGES.filter(l=>l.code!=='en')){
    assert.deepEqual(Object.keys(TRANSLATIONS[language.code]).sort(),keys);
    for(const value of Object.values(TRANSLATIONS[language.code]))assert.equal(typeof value,'string');
    assert.notEqual(translate('Language',language.code),'Language');
    assert.notEqual(translate('Analyse food',language.code),'Analyse food');
  }
});
test('language settings persist, invalid values fall back safely, and provider credentials are preserved',()=>{
  const previous=globalThis.localStorage,memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
  try{
    assert.equal(loadSettings().language,'en');
    for(const language of LANGUAGES){
      saveSettings({...defaults,language:language.code,model:'keep-model',apiKey:'keep-key'});
      const loaded=loadSettings();assert.equal(loaded.language,language.code);assert.equal(loaded.apiKey,'keep-key');assert.equal(loaded.model,'keep-model');
    }
    saveSettings({...defaults,language:'invalid'});assert.equal(loadSettings().language,'en');
    memory.set('nutrilens.settings.v1',JSON.stringify({connectionRevision:2,model:'old-model',apiKey:'old-key'}));
    assert.equal(loadSettings().language,'en');assert.equal(loadSettings().model,'old-model');
    assert.equal(resetSettings().language,'en');
  }finally{globalThis.localStorage=previous;}
});
test('locale and dynamic label translation switch without modifying unknown food text',()=>{
  for(const language of LANGUAGES){setLanguage(language.code);assert.equal(getLocale(),language.locale);}
  assert.equal(translate('2 eggs and toast','hi'),'2 eggs and toast');
  assert.equal(translate('2 entries logged','nb'),'2 oppføringer logget');
  assert.equal(translate('88% AI confidence','de'),'88% KI-Konfidenz');
  assert.equal(translate('Protein 12 g · Carbs 5 g','nb'),'Protein 12 g · Karbohydrater 5 g');
  setLanguage('en');assert.equal(translate(' Settings '),' Settings ');
});
test('AI requests specify every selected language while preserving schema, numeric data, and model IDs',async()=>{
  const previous=globalThis.fetch;
  try{
    for(const language of LANGUAGES){
      let count=0;globalThis.fetch=async(url,init)=>{
        count++;assert.equal(url,'https://example.test/v1/chat/completions');const body=JSON.parse(init.body);
        assert.equal(body.model,'fixture');assert.ok(body.messages[0].content.includes(`RESPONSE LANGUAGE: ${language.name} (${language.code})`));
        assert.match(body.messages[0].content,/Keep JSON property names, enum values, numeric values and unit identifiers/);
        return Response.json({choices:[{message:{content:JSON.stringify(raw)}}]});
      };
      const result=await analyzeFood({text:'2 eggs',settings:{...settings,language:language.code}});
      assert.equal(count,1);assert.equal(result.meta.language,language.code);assert.equal(result.total.calories,155);assert.equal(result.total.protein_g,13);
      const saved=historySnapshot({id:language.code,when:10,version:2,result});assert.equal(saved.result.meta.language,language.code);
    }
  }finally{globalThis.fetch=previous;}
});
test('language instructions distinguish Nynorsk and Bokmål and survive JSON repair',async()=>{
  assert.match(analysisLanguageInstruction('nn'),/genuine Nynorsk, not Bokmål/);
  assert.match(analysisLanguageInstruction('nb'),/Bokmål, not Nynorsk/);
  const previous=globalThis.fetch;let calls=0;
  try{
    globalThis.fetch=async(_,init)=>{calls++;assert.match(JSON.parse(init.body).messages[0].content,/RESPONSE LANGUAGE: Hindi/);return Response.json({choices:[{message:{content:calls===1?'bad JSON':JSON.stringify(raw)}}]});};
    const result=await analyzeFood({text:'2 eggs',settings:{...settings,language:'hi'}});assert.equal(calls,2);assert.equal(result.meta.language,'hi');
  }finally{globalThis.fetch=previous;}
});

test('Urdu uses its own locale, right-to-left direction, translations and AI response language',()=>{
  setLanguage('ur');assert.equal(getLocale(),'ur-PK');assert.equal(getDirection(),'rtl');
  assert.equal(translate('Language'),'زبان');assert.equal(translate('Analyse food'),'کھانے کا تجزیہ کریں');
  assert.equal(languageInfo('ur').label,'اردو');assert.match(analysisLanguageInstruction('ur'),/RESPONSE LANGUAGE: Urdu \(ur\)/);
  setLanguage('en');assert.equal(getDirection(),'ltr');
  setLanguage('hi');assert.equal(getDirection(),'ltr');setLanguage('en');
});
