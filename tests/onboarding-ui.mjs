// Isolated browser verification: fresh profiles, fixed samples and a local synthetic provider only.
import assert from 'node:assert/strict';
import http from 'node:http';
import {createRequire} from 'node:module';
import {createAppServer} from '../server.mjs';
const {chromium}=createRequire(import.meta.url)(process.argv[2] || 'playwright');
let providerCalls=0;
const provider=http.createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','authorization, content-type');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
  providerCalls++;for await(const _ of req){}
  const result={dish:'Real provider fixture',summary:'A genuine provider response.',confidence:.8,items:[{name:'Apple',calories:95}],total:{calories:95},health_score:80};
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(req.url.endsWith('/models')?{data:[{id:'synthetic-model'}]}:{choices:[{message:{content:JSON.stringify(result)}}]}));
});
await new Promise(r=>provider.listen(0,'127.0.0.1',r));
const providerUrl='http://127.0.0.1:'+provider.address().port;
const app=createAppServer({allowedOrigins:[providerUrl]});await new Promise(r=>app.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+app.address().port,errors=[];
let browser,currentPage;
const stored=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('nutrilens.onboarding.v1')));
const count=async(page,feature,value)=>page.waitForFunction(({feature,value})=>JSON.parse(localStorage.getItem('nutrilens.onboarding.v1')).used[feature]===value,{feature,value});
const clickNew=async page=>{await page.goto(origin);await page.locator('#onboarding-welcome[open]').waitFor();await page.locator('#welcome-demo').click();await page.locator('#demo-banner').waitFor();};
try {
  browser=await chromium.launch({headless:true,...(process.argv[3]?{executablePath:process.argv[3]}:{})});
  async function fresh(viewport={width:1360,height:1000}) {
    const context=await browser.newContext({viewport});
    await context.route('**/*',route=>{const url=new URL(route.request().url());return ['localhost','127.0.0.1'].includes(url.hostname)?route.continue():route.abort();});
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));currentPage=page;return page;
  }
  const returning=await fresh();await returning.goto(origin);
  await returning.locator('#onboarding-welcome[open]').waitFor();await returning.screenshot({path:'artifacts/onboarding-welcome.png'});
  await returning.locator('#welcome-returning').click();assert.equal(await returning.locator('#demo-banner').isVisible(),false);
  await returning.reload();assert.equal(await returning.locator('#onboarding-welcome').evaluate(el=>el.open),false);assert.equal((await stored(returning)).status,'normal');
  await returning.context().close();

  const page=await fresh();await clickNew(page);
  assert.doesNotMatch(await page.locator('#demo-banner').innerText(),/remaining|uses|\b2\b/);
  await page.locator('#input').fill('salad');await page.locator('#send-btn').click();await page.locator('#cancel-btn').click();
  await page.waitForFunction(()=>!document.querySelector('#send-btn').disabled);assert.equal((await stored(page)).used.analysis,0);
  for(let n=1;n<=2;n++){await page.locator('#send-btn').click();await count(page,'analysis',n);}
  await page.reload();await page.locator('#demo-banner').waitFor();assert.equal((await stored(page)).used.analysis,2);
  await page.locator('#settings-btn').click();page.once('dialog',dialog=>dialog.accept());await page.locator('#reset-btn').click();await page.locator('#close-drawer').click();
  assert.equal((await stored(page)).used.analysis,2);assert.equal((await stored(page)).status,'demo','Reset settings never resets onboarding progress');
  await page.locator('#input').fill('apple');await page.locator('#send-btn').click();await page.locator('#api-setup-guide[open]').waitFor();
  assert.equal(await page.locator('#api-guide-demo-message').isVisible(),true);await page.locator('#api-guide-dismiss').click();assert.equal((await stored(page)).status,'demo');

  await page.locator('#view-diary').click();await page.locator('#diary-food').fill('salad');await page.locator('#diary-save').click();await page.locator('#diary-cancel-estimate').click();
  await page.waitForFunction(()=>!document.querySelector('#diary-save').disabled);assert.equal((await stored(page)).used.diary,0);
  await page.evaluate(()=>{globalThis.originalDemoStorageWrite=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='nutrilens.demoDiary.v1')throw new DOMException('Synthetic demo quota failure','QuotaExceededError');return originalDemoStorageWrite.call(this,key,value);};});
  await page.locator('#diary-save').click();await page.waitForFunction(()=>!document.querySelector('#diary-save').disabled);assert.equal((await stored(page)).used.diary,0);
  assert.match(await page.locator('#diary-message').innerText(),/could not be saved/);await page.evaluate(()=>{Storage.prototype.setItem=originalDemoStorageWrite;delete globalThis.originalDemoStorageWrite;});
  for(const [index,name] of ['salad','apple'].entries()){await page.locator('#diary-food').fill(name);await page.locator('#diary-save').click();await count(page,'diary',index+1);}
  assert.equal(await page.locator('[data-diary-entry]').count(),2);assert.equal(await page.evaluate(()=>localStorage.getItem('nutrilens.diary.v1')),null);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('nutrilens.demoDiary.v1')).entries.length),2);
  await page.locator('[data-analyse-diary]').first().click();await page.locator('.diary-nutrition .total-kcal').waitFor();assert.match(await page.locator('.diary-nutrition-note').innerText(),/Sample nutrition/);
  await page.locator('[data-edit-entry]').first().click();await page.locator('#diary-calories').fill('222');await page.locator('#diary-save').click();
  await page.waitForFunction(()=>!document.querySelector('#diary-save').disabled);assert.equal((await stored(page)).used.diary,2);
  await page.locator('#diary-food').fill('banana');await page.locator('#diary-save').click();await page.locator('#api-setup-guide[open]').waitFor();await page.locator('#api-guide-close').click();
  assert.equal(await page.locator('[data-diary-entry]').count(),2);

  await page.locator('#view-recipes').click();await page.locator('#recipe-instructions').fill('Something for dinner');await page.locator('#recipe-generate').click();await page.locator('#recipe-cancel').click();
  await page.waitForFunction(()=>!document.querySelector('#recipe-generate').disabled);assert.equal((await stored(page)).used.recipes,0);
  await page.locator('#recipe-generate').click();await count(page,'recipes',1);
  assert.equal(await page.locator('.recipe-card').count(),1);assert.equal(await page.locator('#recipe-demo-note').isVisible(),true);
  assert.equal(await page.locator('[data-recipe-action="save"]').isVisible(),false);assert.equal(await page.locator('#recipe-export-all').isEnabled(),false);
  await page.screenshot({path:'artifacts/onboarding-demo-recipes.png',fullPage:true});
  await page.locator('#recipe-generate').click();await count(page,'recipes',2);await page.locator('#api-setup-guide[open]').waitFor();
  assert.deepEqual((await stored(page)).used,{analysis:2,diary:2,recipes:2});assert.equal((await stored(page)).status,'normal');assert.equal(await page.locator('#demo-banner').isVisible(),false);
  assert.equal(providerCalls,0,'Demo requests never use an external provider');assert.equal(await page.evaluate(()=>localStorage.getItem('nutrilens.recipes.v1')),null);
  await page.screenshot({path:'artifacts/onboarding-api-guide.png'});
  await page.locator('#api-guide-dismiss').click();await page.locator('#view-diary').click();assert.equal(await page.locator('[data-diary-entry]').count(),0);
  await page.locator('#settings-btn').click();await page.locator('#api-setup-guide-btn').click();await page.keyboard.press('Escape');
  assert.equal(await page.locator('#drawer').getAttribute('aria-hidden'),'false');assert.equal(await page.locator('#api-setup-guide-btn').evaluate(el=>el===document.activeElement),true);
  await page.locator('#api-setup-guide-btn').click();await page.locator('[data-setup-field="set-maxtokens"]').click();
  assert.equal(await page.locator('#set-maxtokens').evaluate(el=>el===document.activeElement),true);
  await page.locator('#set-maxtokens').fill('4096');await page.locator('#set-maxtokens').press('Tab');assert.equal(await page.locator('#set-maxtokens').inputValue(),'4096');
  await page.locator('#set-provider').selectOption('custom');await page.locator('#set-baseurl').fill(providerUrl+'/v1');await page.locator('#set-apikey').fill('synthetic-onboarding-key');await page.locator('#set-transport').selectOption('direct');
  await page.locator('#api-setup-guide-btn').click();await page.locator('[data-setup-field="models-btn"]').click();await page.locator('#models-btn').click();
  await page.locator('#available-models option[value="synthetic-model"]').waitFor({state:'attached'});await page.locator('#available-models').selectOption('synthetic-model');await page.locator('#test-btn').click();
  await page.locator('#test-status .status-dot.ok').waitFor();await page.locator('#close-drawer').click();await page.locator('#view-analysis').click();
  await page.locator('#input').fill('apple');await page.locator('#send-btn').click();await page.waitForFunction(()=>document.querySelector('#result .total-kcal')?.textContent==='95kcal');
  await page.locator('#history-save-status').waitFor();assert.ok(providerCalls>=3);assert.equal((await stored(page)).used.analysis,2,'Normal requests are not demo-limited');
  await page.reload();assert.equal(await page.locator('#onboarding-welcome').evaluate(el=>el.open),false);
  await page.locator('#settings-btn').click();assert.equal(await page.locator('#set-apikey').inputValue(),'synthetic-onboarding-key');assert.equal(await page.locator('#set-maxtokens').inputValue(),'4096');assert.equal(await page.locator('#set-demo').isDisabled(),true);
  await page.locator('#close-drawer').click();await page.context().close();

  const early=await fresh();await clickNew(early);await early.locator('#input').fill('salad');await early.locator('#send-btn').click();await early.locator('#demo-end-btn').click();
  await early.locator('#api-setup-guide[open]').waitFor();await early.locator('#api-guide-dismiss').click();
  await early.waitForFunction(()=>!document.querySelector('#send-btn').disabled);assert.equal((await stored(early)).demoFinished,true);assert.equal((await stored(early)).used.analysis,0);
  await early.reload();assert.equal(await early.locator('#demo-banner').isVisible(),false);assert.equal(await early.locator('#onboarding-welcome').evaluate(el=>el.open),false);await early.context().close();

  const existing=await fresh();await existing.addInitScript(({providerUrl})=>{
    if(!localStorage.getItem('nutrilens.settings.v1')) localStorage.setItem('nutrilens.settings.v1',JSON.stringify({provider:'custom',baseUrl:providerUrl+'/v1',model:'synthetic-model',apiKey:'synthetic-existing-key',auth:'bearer',transport:'direct',maxTokens:4096,outputTokensRevision:1,theme:'light'}));
  },{providerUrl});await existing.goto(origin);assert.equal(await existing.locator('#onboarding-welcome').evaluate(el=>el.open),false);assert.equal(await existing.locator('#demo-banner').isVisible(),false);
  await existing.locator('#settings-btn').click();assert.equal(await existing.locator('#set-apikey').inputValue(),'synthetic-existing-key');assert.equal(await existing.locator('#set-maxtokens').inputValue(),'4096');
  await existing.locator('#api-setup-guide-btn').click();await existing.locator('#api-guide-close').click();await existing.locator('#close-drawer').click();await existing.context().close();

  const mobile=await fresh({width:390,height:844});await clickNew(mobile);assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await mobile.locator('#demo-end-btn').click();await mobile.locator('#api-setup-guide[open]').waitFor();assert.equal(await mobile.locator('#api-setup-guide').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
  await mobile.screenshot({path:'artifacts/onboarding-api-guide-mobile.png'});await mobile.locator('#api-guide-dismiss').click();await mobile.locator('#settings-btn').click();await mobile.locator('[data-theme-pick="light"]').click();
  await mobile.locator('#api-setup-guide-btn').click();await mobile.screenshot({path:'artifacts/onboarding-api-guide-mobile-light.png'});await mobile.keyboard.press('Escape');await mobile.locator('#close-drawer').click();
  assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await mobile.context().close();
  assert.deepEqual(errors,[]);console.log('PASS: welcome/returning users, all hidden quotas and reloads, cancellation without consumption, isolated demo diary, local sample recipes, completion and early exit, dismiss/reopen guide, focus-safe Settings shortcuts, model fetch/test, normal provider requests, key/token persistence, and mobile dark/light layouts');
} catch(error) {
  if(currentPage && !currentPage.isClosed()) await currentPage.screenshot({path:'artifacts/onboarding-ui-failure.png',fullPage:true}).catch(()=>{});
  throw error;
} finally {await browser?.close();app.closeAllConnections();provider.closeAllConnections();await Promise.all([new Promise(r=>app.close(r)),new Promise(r=>provider.close(r))]);}
