// Isolated local browser profile with synthetic AI responses only.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createAppServer} from '../server.mjs';
const {chromium}=createRequire(import.meta.url)(process.argv[2]||'playwright');
const app=createAppServer();await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
let browser,calls=0,mode='ok',release;
try {
  browser=await chromium.launch({headless:true,...(process.argv[3]?{executablePath:process.argv[3]}:{})});
  const page=await browser.newPage({viewport:{width:1360,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    if(!localStorage.getItem('nutrilens.settings.v1'))localStorage.setItem('nutrilens.settings.v1',JSON.stringify({connectionRevision:2,provider:'custom',baseUrl:'https://example.test/v1',model:'fixture',auth:'none',transport:'relay',demoMode:false}));
  });
  await page.route('**/api/relay',async route=>{
    calls++;
    if(mode==='slow')await new Promise(resolve=>{release=resolve;});
    if(mode==='fail'){await route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:{message:'Synthetic provider failure'}})});return;}
    const result={dish:'Eggs fixture',summary:'Saved full diary nutrition',confidence:.8,portion_notes:'2 large eggs',items:[{name:'Eggs',quantity:'2 eggs',calories:140,protein_g:12}],total:{calories:140,protein_g:12},micros:{iron_mg:2},health_score:70,pros:['Protein']};
    await route.fulfill({contentType:'application/json',body:JSON.stringify({choices:[{message:{content:JSON.stringify(result)}}]})}).catch(()=>{});
  });
  await page.goto(`http://127.0.0.1:${app.address().port}`);
  await page.locator('#input').fill('Keep this composer draft');
  const composerResult=await page.locator('#result').innerHTML();
  const assertDiary=async()=>{
    assert.equal(await page.locator('#diary-panel').isVisible(),true);
    assert.equal(await page.locator('#analysis-view').isVisible(),false);
    assert.equal(await page.locator('#view-diary').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('#result').innerHTML(),composerResult);
    assert.equal(await page.locator('#input').inputValue(),'Keep this composer draft');
  };
  const panels=page.locator('[data-diary-nutrition]');
  await page.locator('#view-diary').click();await page.locator('#diary-food').fill('2 eggs');await page.locator('#diary-save').click();
  await page.locator('[data-analyse-diary]').waitFor();assert.equal(calls,1);
  await page.locator('#diary-food').fill('Keep this diary draft');
  const selectedDate=await page.locator('#diary-date').inputValue();
  await page.locator('[data-analyse-diary]').click();await panels.nth(0).locator('.total-kcal').waitFor();assert.equal(calls,1);await assertDiary();
  assert.equal(await page.locator('#diary-date').inputValue(),selectedDate);
  assert.equal(await page.locator('#diary-food').inputValue(),'Keep this diary draft');
  assert.equal(await page.locator('[data-analyse-diary]').getAttribute('aria-expanded'),'true');
  assert.equal(await panels.nth(0).locator('[data-action]').count(),0);
  await panels.nth(0).locator('[data-close-diary-nutrition]').click();assert.equal(await panels.nth(0).isVisible(),false);
  assert.equal(await page.locator('[data-analyse-diary]').getAttribute('aria-expanded'),'false');
  await page.locator('[data-analyse-diary]').click();assert.equal(calls,1);
  // Refresh retains the result; opening it never leaves the diary.
  await page.reload();await page.locator('#view-diary').click();await page.locator('[data-analyse-diary]').click();await panels.nth(0).locator('.total-kcal').waitFor();assert.equal(calls,1);
  // Manual entries analyse in the row, and retain their logged calories and form draft.
  await page.locator('#diary-food').fill('Eggs manual');await page.locator('#diary-calories').fill('123');await page.locator('#diary-save').click();
  await page.locator('#diary-food').fill('Next food draft');
  mode='slow';await page.locator('[data-analyse-diary]').nth(1).click();
  await panels.nth(1).locator('[data-nutrition-status]').waitFor();assert.equal(await page.locator('#diary-panel').isVisible(),true);
  assert.equal(await page.locator('#analysis-view').isVisible(),false);
  await page.waitForFunction(()=>document.querySelector('#diary-save').disabled);while(!release)await new Promise(resolve=>setTimeout(resolve,10));release();mode='ok';
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('nutrilens.diary.v1')).entries[1]?.analysis);
  await panels.nth(1).locator('.total-kcal').waitFor();assert.equal(calls,2);
  assert.equal(await page.locator('#diary-food').inputValue(),'Next food draft');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('nutrilens.diary.v1')).entries[1].calories),123);
  await page.reload();await page.locator('#view-diary').click();await page.locator('[data-analyse-diary]').nth(1).click();await panels.nth(1).locator('.total-kcal').waitFor();assert.equal(calls,2);
  // Editing the food invalidates its saved detail instead of showing stale nutrition.
  await page.locator('[data-edit-entry]').nth(1).click();await page.locator('#diary-food').fill('3 eggs manual');await page.locator('#diary-save').click();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('nutrilens.diary.v1')).entries[1].analysis),null);
  await page.locator('[data-analyse-diary]').nth(1).click();await panels.nth(1).locator('.total-kcal').waitFor();assert.equal(calls,3);
  // Provider errors and retry stay in the diary.
  await page.locator('#diary-food').fill('Food needing retry');await page.locator('#diary-calories').fill('200');await page.locator('#diary-save').click();
  mode='fail';await page.locator('[data-analyse-diary]').nth(2).click();await panels.nth(2).locator('[data-retry-diary-nutrition]').waitFor();
  assert.equal(await page.locator('#diary-panel').isVisible(),true);mode='ok';await panels.nth(2).locator('[data-retry-diary-nutrition]').click();await panels.nth(2).locator('.total-kcal').waitFor();assert.equal(calls,5);
  // Cancellation leaves the diary entry unchanged and shows an in-place retry.
  await page.locator('#diary-food').fill('Food to cancel');await page.locator('#diary-calories').fill('250');await page.locator('#diary-save').click();
  release=null;mode='slow';await page.locator('[data-analyse-diary]').nth(3).click();await panels.nth(3).locator('[data-cancel-diary-nutrition]').waitFor();
  while(!release)await new Promise(resolve=>setTimeout(resolve,10));
  await panels.nth(3).locator('[data-cancel-diary-nutrition]').click();release();mode='ok';
  await panels.nth(3).locator('[data-retry-diary-nutrition]').waitFor();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('nutrilens.diary.v1')).entries[3].analysis),null);
  // A completed analysis survives a save failure; retrying storage never calls AI.
  await page.locator('#diary-food').fill('Food with storage retry');await page.locator('#diary-calories').fill('270');await page.locator('#diary-save').click();
  await page.evaluate(()=>{
    globalThis.originalDiaryWrite=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){if(key==='nutrilens.diary.v1')throw Error('Synthetic quota failure');return globalThis.originalDiaryWrite.call(this,key,value);};
  });
  await page.locator('[data-analyse-diary]').nth(4).click();await panels.nth(4).locator('[data-save-diary-nutrition]').waitFor();
  const beforeSaveRetry=calls;await page.evaluate(()=>{Storage.prototype.setItem=globalThis.originalDiaryWrite;});
  await panels.nth(4).locator('[data-save-diary-nutrition]').click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('nutrilens.diary.v1')).entries[4].analysis);
  assert.equal(calls,beforeSaveRetry);assert.equal(await panels.nth(4).locator('[data-save-diary-nutrition]').count(),0);
  await page.waitForFunction(()=>document.querySelectorAll('#toasts > *').length===0);
  // Mobile panels fit the viewport and can be collapsed with the same button.
  await page.setViewportSize({width:390,height:844});await page.locator('[data-analyse-diary]').nth(0).click();await panels.nth(0).locator('.total-kcal').waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:'artifacts/diary-inline-nutrition-mobile.png',fullPage:true});
  await page.setViewportSize({width:1360,height:1000});await page.screenshot({path:'artifacts/diary-inline-nutrition.png',fullPage:true});
  await page.locator('[data-analyse-diary]').nth(0).click();assert.equal(await panels.nth(0).isVisible(),false);
  // Logging from the main result still retains the analysis for inline viewing.
  await page.locator('#view-analysis').click();await page.locator('#input').fill('Main analysis eggs');await page.locator('#send-btn').click();
  await page.locator('#result [data-action="log-diary"]').waitFor();await page.locator('#result [data-action="log-diary"]').click();await page.locator('#diary-save').click();
  const lastCalls=calls;await page.locator('[data-analyse-diary]').nth(5).click();await panels.nth(5).locator('.total-kcal').waitFor();assert.equal(calls,lastCalls);
  assert.equal(await page.locator('#diary-panel').isVisible(),true);assert.deepEqual(errors,[]);
  console.log('PASS: in-diary cached nutrition, preserved drafts and date, reload, one-click analysis, unchanged calories, edits, errors/retry/cancel, mobile layout, and logging main results.');
} finally {release?.();await browser?.close();await new Promise(resolve=>app.close(resolve));}
