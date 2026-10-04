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
