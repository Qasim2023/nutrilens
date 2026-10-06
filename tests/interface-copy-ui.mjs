// Wording regression across every language and major UI surface, with isolated data.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createAppServer} from '../server.mjs';
import {LANGUAGES} from '../src/languages.js';
const {chromium}=createRequire(import.meta.url)(process.argv[2]||'playwright');
const app=createAppServer();await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
let browser;
try{
  browser=await chromium.launch({headless:true,...(process.argv[3]?{executablePath:process.argv[3]}:{})});
  const page=await browser.newPage({viewport:{width:1360,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${app.address().port}`);
  await page.evaluate(async()=>{
    const {saveSettings,loadSettings}=await import('/src/store.js');
    saveSettings({...loadSettings(),provider:'custom',baseUrl:'https://example.test/v1',model:'fixture',auth:'none',apiKey:'keep-private-key',demoMode:false,language:'en'});
    const {createEntry,saveDiary,localDay}=await import('/src/diary-store.js');
    const {normalize}=await import('/src/ai.js');
    const result=normalize({dish:'Oat bowl',summary:'One bowl of oats',confidence:.81,items:[{name:'Oats',calories:150}],total:{calories:150}});
    saveDiary([createEntry({date:localDay(),name:'Oat bowl',meal:'breakfast',calories:150,source:'ai',confidence:.81,analysis:result},{id:'estimated'}),createEntry({date:localDay(),name:'Apple',meal:'snack',calories:95},{id:'manual'})]);
    const {createHistoryRepository}=await import('/src/history-store.js');const repo=createHistoryRepository();await repo.put({id:'saved-result',version:2,when:Date.now(),result,input:{text:'Oat bowl'}});await repo.close();
  });
  await page.reload();
  const assertCopy=async()=>{
    const text=await page.evaluate(()=>document.body.textContent);
    assert.doesNotMatch(text,/\b(?:AI|KI|IA)\b|ИИ|OpenAI|xAI|Bring your own API/);
    const attrs=await page.evaluate(()=>[...document.querySelectorAll('[title],[aria-label],[placeholder]')].flatMap(el=>['title','aria-label','placeholder'].map(attr=>el.getAttribute(attr)||'')).join('\n'));
    assert.doesNotMatch(attrs,/\bAI\b|Bring your own API/);
  };
  assert.equal(await page.locator('.hero-chips .chip').count(),3);await assertCopy();
  await page.locator('#settings-btn').click();
  for(const language of LANGUAGES){
    await page.locator('#set-language').selectOption(language.code);
    await page.waitForFunction(code=>document.documentElement.lang===code,language.code);
    await assertCopy();
  }
  await page.locator('#set-language').selectOption('en');
  for(const provider of ['openai','together','xai','azure','custom']){await page.locator('#set-provider').selectOption(provider);await assertCopy();}
  assert.equal(await page.locator('#set-apikey').inputValue(),'keep-private-key');
  await page.locator('#close-drawer').click();await page.locator('#view-diary').click();await assertCopy();
  assert.equal(await page.locator('[data-diary-entry="estimated"] .diary-confidence').textContent(),'81% estimate confidence');
  await page.locator('[data-analyse-diary="estimated"]').click();await page.locator('[data-diary-nutrition="estimated"] .total-kcal').waitFor();await assertCopy();
  await page.locator('#view-analysis').click();await page.locator('#meal-library-toggle').click();await assertCopy();
  await page.locator('[data-open-analysis="saved-result"]').first().click();await page.locator('#saved-analysis-banner').waitFor();await assertCopy();
  // The new wording does not affect provider requests or result rendering.
  await page.route('**/api/relay',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({choices:[{message:{content:JSON.stringify({dish:'Apple',summary:'One apple',confidence:.85,items:[{name:'Apple',calories:95}],total:{calories:95}})}}]})}));
  await page.locator('#input').fill('1 apple');await page.locator('#send-btn').click();await page.waitForFunction(()=>document.querySelector('#result .total-kcal')?.textContent==='95kcal');await assertCopy();
  await page.waitForFunction(()=>document.querySelectorAll('#toasts > *').length===0);
  await page.screenshot({path:'artifacts/interface-wording.png',fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS: header, all eleven languages, settings/provider labels, diary, inline nutrition, library, saved results, and functioning analysis contain the rewritten wording.');
}finally{await browser?.close();await new Promise(resolve=>app.close(resolve));}
